// Echo Parkour: a jump and run on a holo stage in front of the player. Echo runs by itself.
// Level 1 (server racks): one press (trigger, pinch, click, tap, space) jumps, a second one in
// the air flaps the wings. Level 2 (the office): Echo flies, every press is a wing beat.
// Every coin tells what Echomotion does; glitches, cables, bugs and pits send Echo back to the
// last checkpoint.
import * as THREE from 'three';
import { BaseScene, layoutRow } from '../scene.js';
import { Button, Panel, textPanel } from '../ui3d.js';
import { color, hex, num } from '../tokens.js';
import { t, L } from '../i18n.js';
import { sfx } from '../sfx.js';
import { music } from '../music.js';
import { LEVELS } from '../parkour-level.js';
import { factCard } from '../fact-card.js';
import { makeStage, makeBlocks, makeCoin, makeSpikes, makeBug, makeLift, makeGate, makeShadow, makeParticles, edgeFactor, DEPTH } from '../parkour-visuals.js';
import { loadParkourModels } from '../parkour-models.js';
import { loadOfficeModels, makeOffice, makeCables, timeOfDay } from '../parkour-office.js';
import { loadForestModels, makeForestBlocks, makeForestBackdrop, makeForestGags, makeForestWeather, makeForestCanopy, makeEagle, forestSky, stormAt } from '../parkour-forest.js';
import { loadCityModels, makeCityBlocks, makeCityBackdrop, makeCityGags, makeCityNight, makeCityObstacles, makeCitySpikes, citySky, makeHelicopter, makeRaven, hazardHalo } from '../parkour-city.js';
import { quality } from '../quality.js';
import { parkourLook, makeHaze, makeShafts } from '../parkour-look.js';
import { nightAt } from '../parkour-city.js';
import { ParkourEcho } from '../parkour-echo.js';
import { makeEnvironment } from '../robot-visuals.js';
import { echoVoice } from '../echo-voice.js';
import { WINTER, makeSnowfall, makeSnowCover, makeStageSnow, setSnowAmount, snowSettled } from '../snow.js';

const U = 0.085; // meters per level unit
const RUN = 4.2; // run speed (units/s)
const G = 42; // gravity
const JUMP_V = 14; // jump: about 2.3 units high
const FLAP_V = 11.5; // wing beat in the air
const MAX_FALL = 18;
// Flying (level 2): softer gravity, every press is a wing beat
const FLY = { G: 24, FLAP: 9, MAX_FALL: 9 };
const W2 = 0.38; // half width of Echo's box
const H = 0.95; // height of Echo's box
const STEP = 0.35; // small steps are taken without jumping
const COYOTE = 0.1; // a jump still works this long after running off an edge
const BUFFER = 0.14; // a press this early before landing still jumps
const STAGE_Z = -1.2;
const DROP = 0.42; // track ground below eye height
const STAGE_TOP = 6.6; // units
const CARD_TIME = 5.5;

const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Simple boxes for level 2 when the office models could not be loaded. */
function boxesFallback(solids) {
  const group = new THREE.Group();
  group.userData.noFit = true;
  const mat = new THREE.MeshStandardMaterial({ color: hex('xr-office-wall-dark'), roughness: 0.6 });
  for (const b of solids) {
    const w = b.x1 - b.x0;
    const h = b.top - b.bottom;
    if (w > 50) continue; // floor and ceiling: the stage shows them
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 1.6), mat);
    m.position.set((b.x0 + b.x1) / 2, (b.top + b.bottom) / 2, 0);
    group.add(m);
  }
  return group;
}

export class ParkourScene extends BaseScene {
  constructor(app, level = 1) {
    super(app);
    this.lv = LEVELS[level] ?? LEVELS[1];
    this.c = this.lv.build();
    this.facts = this.lv.facts;
    this.total = this.facts.length;
    this.app.echo?.suppress(true); // the runner is Echo; the flying one takes a break
    this.narrow = !!app.host?.narrow;
    this.halfW = this.narrow ? 0.5 : 0.8;
    this.half = this.halfW / U;
    this.mode = 'intro';
    this.time = 0;
    this.liftT = 0;
    this.ready = false;
    this.refreshHud = this.hud(() => `${t(`${this.lv.key}Name`)}  ·  ${t('parkourCoins', { n: this.coinsTaken ?? 0, total: this.total })}  ·  ${t('parkourTime', { s: fmt(this.time ?? 0) })}`);

    // Glossy reflections for Echo and the blocks, tone mapping, the light rig of the world,
    // shadows and (desktop only) bloom; all restored when the scene closes (parkour-look.js).
    this.envTarget = makeEnvironment(this.engine.renderer);
    this.look = parkourLook(this.engine, this.lv.world, this.envTarget.texture);

    // Input: any press that is not on a button, plus the keyboard.
    this.engine.onEmptyPress = () => this.press();
    this.keydown = (e) => {
      if (['Space', 'ArrowUp', 'KeyW'].includes(e.code)) { e.preventDefault(); this.press(); }
    };
    window.addEventListener('keydown', this.keydown);
    // Phones: a big "flap" button for the thumb (a tap anywhere else works too).
    this.flapPad = this.touchButtons([{ icon: 'flap', label: t('parkourFlap'), primary: true, onPress: () => this.press() }]);

    // Winter: snow falls in the room around the player (in AR over the real room) and settles on
    // the floor; inside the stage it gets its own small flakes (buildStage).
    if (WINTER) {
      this.snow = makeSnowfall();
      this.cover = makeSnowCover({ x: 0, z: -0.7 });
      this.group.add(this.snow.points, this.cover.mesh);
    }
    this.onUpdate((dt) => this.update(dt));
    this.showIntro();
    // The Blender assets are usually preloaded; if they fail, simple shapes stand in.
    const quiet = (name) => (e) => { console.warn(`${name} not loaded`, e); return null; };
    Promise.all([
      loadParkourModels().catch(quiet('Parkour models')),
      this.lv.world === 'office' ? loadOfficeModels().catch(quiet('Office models')) : null,
      this.lv.world === 'forest' ? loadForestModels().catch(quiet('Forest models')) : null,
      this.lv.world === 'city' ? loadCityModels().catch(quiet('City models')) : null,
    ])
      .then(([M, O, F, CM]) => {
        if (this.disposed) return;
        this.buildStage(M, O, M ? F : null, M ? CM : null);
        this.respawnAt(this.c.start);
        this.camX = this.e.x + this.half * 0.38;
        this.ready = true;
        if (this.startWhenReady) this.countdown();
      });
  }

  // ----- stage and course -----

  buildStage(M, O, F = null, CM = null) {
    const office = this.lv.world === 'office';
    const stage = (this.stage = new THREE.Group());
    stage.position.set(0, this.eye - DROP, STAGE_Z);
    this.group.add(stage);
    // The office sits directly on the pedestal; the server racks reach down into it.
    // Level 1: the magic forest (stone base, trees at the edges, starry sky, trees and clouds behind).
    // Level 2: the city at dawn (street, lamps at the edges, dawn sky, towers and an airship behind).
    const world = F ? { set: { models: F, base: 'ForestBase', end: 'ForestEnd' }, backTex: forestSky() }
      : CM ? { set: { models: CM, base: 'CityBase', end: 'CityEnd' }, backTex: citySky() } : {};
    const s = makeStage(this.halfW, U, { top: STAGE_TOP, M, sky: office, bottom: office ? -0.32 : -2.6, skyScale: office ? 0.7 : 1, ...world });
    stage.add(s.group);
    // Top of the sky picture (stage space, meters): the room snow keeps out of the stage below it.
    this.backTop = s.back.position.y + s.back.geometry.parameters.height / 2;
    this.backZ = s.backZ;
    this.backTex = F || CM ? null : s.backTex; // a sky picture stays, the holo grid scrolls
    this.setSky = s.setSky;
    this.skyline = s.skyline;
    if (F || CM) {
      this.skyline = F ? makeForestBackdrop(F, s.half, -2.6, s.backZ, M) : makeCityBackdrop(CM, s.half, -2.6, s.backZ, M);
      s.units.add(this.skyline.group);
    }
    const course = (this.course = new THREE.Group());
    course.scale.setScalar(U);
    course.userData.noFit = true; // the long course must not pull the browser camera back
    stage.add(course);

    // Key light with a real shadow map for the stage (off in lite mode), warm in every world.
    const key = new THREE.DirectionalLight(0xffffff, 1.3);
    key.position.set(-0.6, 1.3, 1.0);
    key.target.position.set(0, 0.15, 0);
    // Rim light from behind in the window color: crisp silhouettes against the dark backdrop.
    const rim = new THREE.DirectionalLight(hex('xr-parkour-window'), 0.9);
    rim.position.set(0.4, 0.9, -1.4);
    rim.target = key.target;
    stage.add(key, key.target, rim);
    if (!quality.lite) {
      key.castShadow = true;
      Object.assign(key.shadow.camera, { left: -(this.halfW + 0.15), right: this.halfW + 0.15, top: 0.85, bottom: -0.85, near: 0.2, far: 3.5 });
      key.shadow.camera.updateProjectionMatrix();
      key.shadow.bias = -0.0005;
      key.shadow.normalBias = 0.012;
    }
    this.look.light(key, rim); // colors, strengths and the shadow map size of this world
    this.keyScale = key.intensity / 1.3; // the office's time of day scales from here
    this.key = key;
    this.rim = rim;

    // In winter the snow takes the place of the fireflies and floating motes.
    this.fx = makeParticles({ motes: quality.lite || (WINTER && (F || CM)) ? 0 : 40, ...(F ? { moteToken: 'xr-forest-firefly', dustToken: 'xr-forest-grass-light' } : {}) });
    course.add(this.fx.group);
    if (this.fx.points) s.units.add(this.fx.points);
    if (CM) this.night = makeCityNight({ C: CM, back: s.back, key, rim }); // night falls halfway
    if (F) {
      // Storm with rain and lightning in the last third, clearing up before the goal.
      this.weather = makeForestWeather({ F, back: s.back, key, fireflies: this.fx.points, bottom: -2.6, top: STAGE_TOP, backZ: s.backZ, lite: quality.lite });
      course.add(this.weather.group);
    }

    // Depth haze between the backdrop and the track, light shafts (forest and city).
    if (F || CM) {
      this.haze = makeHaze(this.lv.world, s.half, -2.6, STAGE_TOP);
      if (this.haze) s.units.add(this.haze.mesh);
      this.shafts = makeShafts(this.lv.world, s.half, STAGE_TOP, -2.6);
      if (this.shafts) s.units.add(this.shafts.mesh);
      if (CM && this.haze) {
        this.hazeDay = this.haze.mat.color.clone();
        this.hazeNight = new THREE.Color(hex('xr-city-night-bottom'));
      }
    }

    // Collision: every solid box sits in the buckets of the whole units it covers.
    this.buckets = new Map();
    for (const b of this.c.solids) {
      for (let x = Math.floor(b.x0); x < Math.ceil(b.x1); x++) {
        if (!this.buckets.has(x)) this.buckets.set(x, []);
        this.buckets.get(x).push(b);
      }
    }
    const topAt = (x) => this.groundAt(x);

    // Winter in the forest and the city: small flakes in the stage that land on the islands and
    // roofs (not on the canopy, the cloud deck or the hanging branches) and stay a while.
    if (WINTER && (F || CM)) {
      const bottom = -2.6;
      const ceiling = this.c.ceiling ?? 99;
      const surfaceAt = (x, y, z) => {
        if (Math.abs(z) > DEPTH / 2 + 0.05) return bottom;
        let best = bottom;
        for (const b of this.buckets.get(Math.floor(x)) ?? []) {
          if (b.x0 <= x && b.x1 > x && b.top <= y && b.top > best && b.top < ceiling - 0.05) best = b.top;
        }
        return best;
      };
      this.stageSnow = makeStageSnow({ top: this.backTop / U, bottom, zMin: -2.8, zMax: 1.6, surfaceAt });
      course.add(this.stageSnow.points);
    }

    if (office) {
      // The office is cut cleanly at the stage edges (like a cutaway model): two clipping planes.
      this.clip = [new THREE.Plane(), new THREE.Plane()];
      this.engine.renderer.localClippingEnabled = true;
      this.office = O ? makeOffice(this.c, O, this.clip) : null;
      if (this.office) course.add(this.office.group);
      else course.add(boxesFallback(this.c.solids));
      this.day = timeOfDay(0);
    } else {
      this.blocks = F ? makeForestBlocks(this.c.cols, F) : CM ? makeCityBlocks(this.c.cols, CM) : makeBlocks(this.c.cols, M);
      course.add(this.blocks.group);
      // Surprises: buried in the forest's earth, on the city's roofs.
      this.gags = F ? makeForestGags(this.c.cols, F) : CM ? makeCityGags(this.c, CM) : null;
      if (this.gags) course.add(this.gags.group);
      // The forest's leaf canopy, hanging branches and thorns (it is a flying level).
      if (F && this.c.branches) {
        this.canopy = makeForestCanopy(this.c, F);
        course.add(this.canopy.group);
      }
      // The city's rooftop obstacles: vents, antennas, power lines.
      if (CM) {
        this.obstacles = makeCityObstacles(this.c, CM);
        course.add(this.obstacles.group);
      }
    }

    this.coins = this.c.coins.map((cn, i) => {
      const obj = makeCoin(M);
      obj.position.set(cn.x, cn.y, 0);
      course.add(obj);
      return { ...cn, i, obj, taken: false };
    });
    this.spikes = this.c.spikes.map((sp) => {
      const obj = sp.kind === 'cable' && O ? makeCables(O, sp.x0, sp.x1) : sp.kind === 'pigeon' && CM ? makeCitySpikes(CM, sp.x0, sp.x1) : makeSpikes(sp.x0, sp.x1, M);
      obj.position.set((sp.x0 + sp.x1) / 2, sp.y, 0);
      course.add(obj);
      return { ...sp, x: (sp.x0 + sp.x1) / 2, obj };
    });
    this.bugs = this.c.bugs.map((b, i) => {
      const obj = makeBug(M);
      // In the city a red halo keeps the bug drones visible against the dark night roofs.
      if (CM) { const hl = hazardHalo('xr-city-hazard-glow', 1.3, 1.3, 0.3); hl.position.z = -0.4; obj.add(hl); }
      course.add(obj);
      return { ...b, obj, phase: i * 1.3, cy: b.y };
    });
    // Flyers of the upper air: eagles in the forest, helicopters and ravens in the city.
    this.eagles = (this.c.eagles ?? []).map((a, i) => {
      const obj = F ? makeEagle(F) : CM ? (a.kind === 'heli' ? makeHelicopter(CM) : makeRaven(CM)) : makeBug(M);
      course.add(obj);
      return { ...a, obj, phase: i * 1.7, x: a.x0, cy: a.y, dir: 1 };
    });
    this.thorns = this.c.thorns ?? [];
    this.wires = this.c.wires ?? [];
    this.fans = this.c.fans ?? [];
    this.lifts = this.c.lifts.map((l) => {
      const obj = makeLift(l.x1 - l.x0, M, F ?? CM, F ? 'IslandLift' : 'Gondola');
      course.add(obj);
      const top = l.base;
      return { ...l, x: (l.x0 + l.x1) / 2, top, prevTop: top, bottom: top - 0.6, lift: true, obj };
    });
    this.gates = this.c.checkpoints.map((x) => {
      const obj = makeGate(false, M, F);
      obj.position.set(x, topAt(x), 0);
      course.add(obj);
      return { x, top: topAt(x), obj, on: false };
    });
    this.finishGate = makeGate(true, M, F);
    this.finishGate.position.set(this.c.finish, topAt(this.c.finish), 0);
    // The office's goal is the AI workshop at its end, no portal.
    if (!office) course.add(this.finishGate);

    this.runner = new ParkourEcho();
    course.add(this.runner.group);
    this.shadow = makeShadow();
    course.add(this.shadow);
  }

  /** Solid boxes (blocks, furniture, floor, ceiling, lifts) around a stretch of x. */
  solidsNear(x0, x1) {
    const out = new Set();
    for (let x = Math.floor(x0) - 1; x <= Math.floor(x1) + 1; x++) {
      for (const b of this.buckets.get(x) ?? []) out.add(b);
    }
    for (const l of this.lifts) if (l.x1 > x0 - 1 && l.x0 < x1 + 1) out.add(l);
    return out;
  }

  /** Top of the ground (block or floor, not furniture up in the air) at x. */
  groundAt(x) {
    let top = 0;
    let found = false;
    for (const b of this.buckets.get(Math.floor(x)) ?? []) {
      if (b.bottom <= 0.01 && b.x0 <= x && b.x1 > x && (!found || b.top > top) && b.top < 4) { top = b.top; found = true; }
    }
    return top;
  }

  respawnAt(x) {
    const top = this.groundAt(x);
    this.e = { x, y: top, vy: 0, grounded: true, on: null, canFlap: true, coyote: COYOTE, buffer: 0, invuln: 0, push: false };
    this.coinsTaken ??= 0;
    this.falls ??= 0;
    this.lastCp ??= x;
  }

  // ----- flow -----

  showIntro() {
    this.mode = 'intro';
    this.clearLayer();
    const { eye } = this;
    const fly = this.lv.flight;
    const p = this.add(textPanel(1.0, 0.3, [
      { text: `${t(this.lv.title)}  ·  ${t('parkourLevel', { n: this.lv.n })}`, size: 'xr-text-title', weight: 'black', gap: 0.015 },
      { text: t(this.lv.intro), size: 'xr-text-sm', color: color('xr-panel-muted'), gap: 0.015 },
      { text: t(fly ? (this.engine.isXR ? 'parkourHowFlyXR' : this.engine.touchUI ? 'parkourHowFlyTouch' : 'parkourHowFlyScreen') : (this.engine.isXR ? 'parkourHowXR' : 'parkourHowScreen')), size: 'xr-text-sm', weight: 'bold' },
    ], { layout: { align: 'left' } }));
    p.position.set(0, eye + 0.42 - p.h / 2, -1.0);
    this.popIn(p);
    this.app.host?.introduce(this, this.lv.key, p);
    this.prepareMusic(this.lv.key);
    // Start this level, or switch to one of the others (forest, city, office).
    const go = new Button(0.42, 0.13, { label: t('start'), variant: 'primary', labelSize: 'xr-text-lg', onClick: () => { if (this.ready) this.countdown(); else this.startWhenReady = true; } });
    const others = Object.values(LEVELS).filter((l) => l.n !== this.lv.n).map((l) => new Button(0.42, 0.1, {
      label: t('parkourToLevel', { n: l.n, name: t(`parkourWorld${l.n}`) }), labelSize: 'xr-text-sm', variant: 'sponsor', onClick: () => this.app.startGame(l.key),
    }));
    const y1 = p.position.y - p.h / 2 - 0.04 - 0.065;
    layoutRow([go], y1, -1.0);
    layoutRow(others, y1 - 0.065 - 0.03 - others[0].h / 2, -1.0, 0.03);
    [go, ...others].forEach((b, i) => { this.add(b); this.popIn(b, 0.1 + i * 0.05); });
  }

  countdown() {
    this.clearLayer();
    this.mode = 'count';
    const show = (text, token) => {
      const p = this.add(textPanel(0.5, 0.16, [{ text, size: 0.11, weight: 'black', color: color(token) }], { surface: false }));
      p.position.set(0, this.eye - 0.12, STAGE_Z + 0.3);
      this.popIn(p);
      this.delay(0.75, () => { p.visible = false; });
    };
    ['3', '2', '1'].forEach((n, i) => this.delay(i * 0.8, () => { if (this.disposed) return; show(n, 'xr-panel-text'); sfx.tick(); }));
    this.delay(2.4, () => {
      if (this.disposed) return;
      show(t('parkourGo'), 'xr-parkour-coin');
      sfx.powerup();
      this.mode = 'run';
      this.startMusic(1, this.lv.key);
    });
  }

  press() {
    if (this.mode === 'run') this.e.buffer = BUFFER;
  }

  // ----- game loop -----

  update(dt) {
    if (this.snow) this.updateSnow(dt);
    this.flapPad?.show(['count', 'run', 'oops'].includes(this.mode));
    if (!this.ready) return;
    // Lifts move all the time (also in the intro).
    this.liftT += dt;
    for (const l of this.lifts) {
      l.prevTop = l.top;
      l.top = l.base + l.amp * Math.sin((this.liftT * Math.PI * 2) / l.period);
      l.bottom = l.top - 0.6;
    }

    if (this.mode === 'run') {
      this.time += dt;
      const n = Math.ceil(dt / (1 / 120));
      for (let i = 0; i < n && this.mode === 'run'; i++) this.step(dt / n);
      if (this.mode === 'run') this.checkThings();
      this.hudT = (this.hudT ?? 0) - dt;
      if (this.hudT <= 0) { this.hudT = 0.25; this.refreshHud(); }
    } else if (this.mode === 'oops') {
      this.oopsT -= dt;
      if (this.oopsT <= 0) this.respawn();
    }

    // Camera: Echo stays in the left part of the window, so you see what comes.
    const target = this.e.x + this.half * 0.38;
    this.camX += (target - this.camX) * Math.min(1, dt * (this.mode === 'run' ? 5 : 2));
    this.course.position.x = -this.camX * U;
    if (this.backTex) this.backTex.offset.x = (this.camX * U * 0.35) / 0.24;
    this.animate(dt);
  }

  step(dt) {
    const e = this.e;
    let { x, y, vy } = e;
    if (e.on?.lift) y = e.on.top; // carried by the lift
    const fly = this.lv.flight;
    if (fly && e.buffer > 0) {
      // Flying: every press is a wing beat, also from the ground.
      vy = FLY.FLAP;
      e.grounded = false;
      e.on = null;
      e.buffer = 0;
      this.runner.flap();
      this.fx.puff(x, y + 0.45, 'spark', 5);
      sfx.flap();
    }
    // Jump on the ground (or just after leaving it), else a wing beat once per jump.
    if (!fly && e.buffer > 0) {
      if (e.grounded || e.coyote > 0) {
        vy = JUMP_V;
        e.grounded = false;
        e.on = null;
        e.coyote = 0;
        e.buffer = 0;
        this.runner.jump();
        sfx.jump();
      } else if (e.canFlap) {
        vy = FLAP_V;
        e.canFlap = false;
        e.buffer = 0;
        this.runner.flap();
        this.fx.puff(x, y + 0.45, 'spark', 7);
        sfx.flap();
      }
    }
    e.buffer -= dt;
    e.invuln = Math.max(0, e.invuln - dt);

    // Run to the right; walls stop Echo, small steps are climbed.
    let nx = x + RUN * dt;
    e.push = false;
    for (const s of this.solidsNear(x - W2, nx + W2)) {
      if (y >= s.top - 1e-3 || y + H <= s.bottom) continue;
      if (nx + W2 <= s.x0 || nx - W2 >= s.x1) continue;
      if (e.grounded && s.top - y <= STEP) { y = s.top; continue; }
      if (x + W2 <= s.x0 + 0.05) { nx = s.x0 - W2 - 1e-4; e.push = true; }
    }
    x = nx;

    // Fall and land; bump the head under a platform.
    vy = fly ? Math.max(vy - FLY.G * dt, -FLY.MAX_FALL) : Math.max(vy - G * dt, -MAX_FALL);
    let ny = y + vy * dt;
    let landed = null;
    for (const s of this.solidsNear(x - W2, x + W2)) {
      if (x + W2 <= s.x0 + 1e-3 || x - W2 >= s.x1 - 1e-3) continue;
      const lowTop = Math.min(s.top, s.prevTop ?? s.top);
      if (vy <= 0 && y >= lowTop - 0.08 && ny <= s.top) {
        if (!landed || s.top > landed.top) landed = s;
      } else if (vy > 0 && y + H <= s.bottom + 0.05 && ny + H > s.bottom) {
        ny = s.bottom - H - 1e-4;
        vy = 0;
      }
    }
    if (landed) {
      if (!e.grounded) {
        this.runner.land(Math.min(1, -vy / 14));
        if (-vy > 4) this.fx.puff(x, landed.top, 'dust', 8);
      }
      ny = landed.top;
      vy = 0;
      e.grounded = true;
      e.on = landed;
      e.canFlap = true;
      e.coyote = COYOTE;
    } else {
      e.grounded = false;
      e.on = null;
      e.coyote -= dt;
    }
    Object.assign(e, { x, y: ny, vy });
    if (ny < -4.5) this.oops('fall');
  }

  boxHits(x0, x1, y0, y1) {
    const { x, y } = this.e;
    return x + W2 > x0 && x - W2 < x1 && y + H > y0 && y < y1;
  }

  circleHits(cx, cy, r) {
    const { x, y } = this.e;
    const px = THREE.MathUtils.clamp(cx, x - W2, x + W2);
    const py = THREE.MathUtils.clamp(cy, y, y + H);
    return (cx - px) ** 2 + (cy - py) ** 2 < r * r;
  }

  checkThings() {
    const e = this.e;
    for (const c of this.coins) {
      if (!c.taken && Math.abs(c.x - e.x) < 1.5 && this.circleHits(c.x, c.y, 0.5)) this.collect(c);
    }
    if (e.invuln <= 0) {
      for (const s of this.spikes) {
        if (this.boxHits(s.x0 + 0.2, s.x1 - 0.2, s.y, s.y + 0.42)) { this.oops(s.kind === 'cable' || s.kind === 'pigeon' ? s.kind : 'glitch'); return; }
      }
      for (const b of this.bugs) {
        if (Math.abs(b.x - e.x) < 2 && this.circleHits(b.x, b.cy, 0.42)) { this.oops('bug'); return; }
      }
      for (const a of this.eagles) {
        if (Math.abs(a.x - e.x) > 2) continue;
        // A helicopter is a box (cabin, tail and rotor), birds are round.
        const hit = a.kind === 'heli' ? this.boxHits(a.x - 0.8, a.x + 0.8, a.cy - 0.38, a.cy + 0.36) : this.circleHits(a.x, a.cy, a.kind === 'raven' ? 0.42 : 0.5);
        if (hit) { this.oops(a.kind ?? 'eagle'); return; }
      }
      for (const th of this.thorns) {
        if (this.boxHits(th.x0 + 0.15, th.x1 - 0.15, th.y - 0.55, th.y)) { this.oops('thorns'); return; }
      }
      for (const w of this.wires) {
        if (this.boxHits(w.x0 + 0.15, w.x1 - 0.15, w.y - 0.3, w.y)) { this.oops('wire'); return; }
      }
      for (const f of this.fans) {
        if (this.boxHits(f.x - 0.8, f.x + 0.8, f.y - 0.25, f.y + 0.12)) { this.oops('fan'); return; }
      }
    }
    for (const g of this.gates) {
      if (!g.on && e.x >= g.x) {
        g.on = true;
        this.lastCp = g.x;
        g.obj.userData.mat.color.setHex(hex('xr-parkour-check-on'));
        g.obj.userData.glow.color.setHex(hex('xr-parkour-check-on'));
        g.obj.userData.glow.opacity = 0.55;
        sfx.point();
        this.toast(t('parkourCheckpoint'), 'xr-parkour-check-on');
      }
    }
    if (e.x >= this.c.finish) this.reachGoal();
  }

  collect(c) {
    c.taken = true;
    this.coinsTaken += 1;
    sfx.coin();
    this.runner.happy();
    this.burst(c.obj.getWorldPosition(new THREE.Vector3()), 'xr-parkour-coin', 18);
    this.fx.puff(c.x, c.y - 0.3, 'coin', 10);
    this.showCard(c.i);
    this.refreshHud();
  }

  oops(kind) {
    if (this.mode !== 'run') return;
    this.mode = 'oops';
    this.oopsT = kind === 'fall' ? 0.7 : 1.0;
    this.falls += 1;
    sfx.wrong();
    this.runner.hurt();
    echoVoice.chirp(this.engine, this.runner.group.getWorldPosition(new THREE.Vector3()), 'sad', 0.1);
    this.toast(t({ fall: 'parkourOops', bug: 'parkourBug', cable: 'parkourCable', eagle: 'parkourEagle', heli: 'parkourHeli', raven: 'parkourRaven', thorns: 'parkourThorns', wire: 'parkourWire', pigeon: 'parkourPigeon', fan: 'parkourFan' }[kind] ?? 'parkourGlitch'), 'xr-parkour-glitch');
  }

  respawn() {
    const coins = this.coinsTaken;
    this.respawnAt(this.lastCp);
    this.coinsTaken = coins;
    this.e.invuln = 1.3;
    this.mode = 'run';
  }

  reachGoal() {
    this.mode = 'done';
    this.e.x = this.c.finish + 0.6;
    this.runner.cheer();
    sfx.finish();
    music.stop();
    echoVoice.chirp(this.engine, this.runner.group.getWorldPosition(new THREE.Vector3()), 'happy', 0.14);
    // At the goal: confetti at the portal, or in the office the workshop cheers around Echo.
    const at = this.finishGate.parent ? this.finishGate : this.runner.group;
    this.burst(at.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.3, 0)), 'xr-parkour-finish', 50);
    this.office?.cheer();
    this.toast(t('parkourFinish'), 'xr-parkour-finish');
    this.refreshHud();
    this.delay(2.4, () => { if (!this.disposed) this.finishGame(); });
  }

  finishGame() {
    this.stage.visible = false;
    this.card?.removeFromParent();
    const coins = this.coinsTaken;
    const score = coins * 200 + 500 + Math.max(0, Math.round((100 - this.time) * 8)) + (this.falls === 0 ? 400 : 0);
    const learned = this.coins.filter((c) => !c.taken).map((c) => ({ q: L(this.facts[c.i].title), a: L(this.facts[c.i].text) }));
    const next = LEVELS[this.lv.n + 1];
    this.results({
      gameKey: this.lv.key, score, correct: coins, total: this.total,
      line: t('parkourLine', { n: coins, total: this.total, time: fmt(this.time), falls: this.falls }),
      learned,
      onAgain: () => this.app.startGame(this.lv.key),
      next: next ? { label: t('parkourNext'), onClick: () => this.app.startGame(next.key) } : null,
    });
  }

  // ----- messages -----

  showCard(i) {
    if (this.card) { const old = this.card; this.card = null; old.removeFromParent(); old.dispose(); }
    const w = this.narrow ? 0.9 : 0.84;
    const card = factCard(i + 1, this.total, this.facts[i], w);
    // Just below the status bar, between it and the stage.
    card.position.set(0, this.eye + 0.48 - card.h / 2, -this.dist + 0.02);
    this.group.add(card);
    this.popIn(card);
    this.card = card;
    this.delay(CARD_TIME, () => {
      if (this.card !== card) return;
      this.tween(0.4, (k) => { card.material.opacity = 1 - k; }, { onDone: () => { if (this.card === card) { this.card = null; card.removeFromParent(); card.dispose(); } } });
    });
  }

  /** A short word above Echo (checkpoint, oops, goal) that floats up and fades. */
  toast(text, token) {
    const p = textPanel(0.42, 0.07, [{ text, size: 'xr-text-md', weight: 'black', color: color(token) }], { surface: { stroke: color(token) } });
    p.userData.noFit = true;
    const pos = this.runner.group.getWorldPosition(new THREE.Vector3());
    this.group.add(p);
    p.position.copy(this.group.worldToLocal(pos)).add(new THREE.Vector3(0, 0.17, 0.12));
    const y0 = p.position.y;
    this.tween(1.3, (k) => {
      p.position.y = y0 + k * 0.08;
      p.material.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    }, { ease: (k) => k, onDone: () => { p.removeFromParent(); p.dispose(); } });
  }

  // ----- visuals -----

  /** Winter: the room snow follows the real floor and keeps out of the stage; snow settles. */
  updateSnow(dt) {
    const floor = this.engine.floorY - this.engine.root.position.y;
    this.snow.setGround(floor);
    this.cover.setGround(floor);
    if (this.stage) {
      const p = this.stage.position;
      this.snow.setHole(p.x - this.halfW - 0.16, p.z + this.backZ * U - 0.05, p.x + this.halfW + 0.16, p.z + (DEPTH / 2 + 1.8) * U, p.y + this.backTop);
    }
    // The forest's storm in the last third is a snowstorm: thick flakes and a strong wind.
    const storm = this.lv.world === 'forest' && this.camX !== undefined ? stormAt(this.camX) : 0;
    this.snow.density = 0.62 + 0.38 * storm;
    this.snow.update(dt);
    this.cover.update(dt);
    setSnowAmount(0.5 + 0.5 * snowSettled());
    if (this.stageSnow && this.camX !== undefined) {
      const base = this.lv.world === 'city' ? 0.7 : 0.5;
      this.stageSnow.update(dt, this.camX, this.half, { density: base + (1 - base) * storm, wind: 0.5 + 6 * storm, edge: (wx) => edgeFactor(wx, this.half) });
    }
  }

  animate(dt) {
    const { camX, half } = this;
    this.blocks?.update(camX, half);
    this.gags?.update(camX, half, dt, this.e.x);
    this.weather?.update(dt, camX, half);
    this.night?.update(camX);
    if (this.lv.world === 'office') {
      // Clipping planes at the window edges, in world space.
      this.stage.updateWorldMatrix(true, false);
      const q = this.stage.getWorldQuaternion(new THREE.Quaternion());
      [-1, 1].forEach((side, i) => {
        const n = new THREE.Vector3(-side, 0, 0).applyQuaternion(q);
        const pt = new THREE.Vector3(side * this.halfW, 0, 0).applyMatrix4(this.stage.matrixWorld);
        this.clip[i].setFromNormalAndCoplanarPoint(n, pt);
      });
      // A day at the office: the sky and the lights follow Echo's progress.
      this.office?.update(camX, half);
      const d = timeOfDay((this.e.x - this.c.start) / (this.c.finish - this.c.start), this.day);
      this.setSky(d.top, d.bottom);
      this.office?.setGlow(d.glow);
      this.key.intensity = d.key * this.keyScale;
      this.rim.color.copy(d.bottom);
    }
    const show = (obj, x, hidden = false) => {
      const k = hidden ? 0 : edgeFactor(x - camX, half);
      obj.visible = k > 0.001;
      if (obj.visible) obj.scale.setScalar(k);
      return obj.visible;
    };
    const time = this.liftT;
    for (const c of this.coins) {
      if (show(c.obj, c.x, c.taken)) {
        c.obj.userData.spin.rotation.y += dt * 2.6;
        c.obj.position.y = c.y + Math.sin(time * 2.2 + c.i) * 0.08;
      }
    }
    for (const s of this.spikes) {
      if (!show(s.obj, s.x)) continue;
      if (s.obj.userData.flicker) s.obj.userData.flicker();
      else s.obj.userData.mat.emissiveIntensity = 0.8 + Math.random() * 0.6;
    }
    for (const b of this.bugs) {
      b.cy = b.y + b.amp * Math.sin((time * Math.PI * 2) / b.period + b.phase);
      b.obj.position.set(b.x + (Math.random() < 0.06 ? (Math.random() - 0.5) * 0.15 : 0), b.cy, 0);
      if (show(b.obj, b.x)) b.obj.userData.animate?.(dt, time + b.phase);
    }
    for (const l of this.lifts) {
      l.obj.position.set(l.x, l.top, 0);
      show(l.obj, l.x);
    }
    for (const a of this.eagles) {
      // back and forth between x0 and x1, a little up and down
      const w = (time * Math.PI * 2) / a.period + a.phase;
      a.x = a.x0 + (a.x1 - a.x0) * (0.5 - 0.5 * Math.cos(w));
      a.dir = Math.sin(w) >= 0 ? 1 : -1;
      a.cy = a.y + Math.sin(time * 2.1 + a.phase) * 0.2;
      a.obj.position.set(a.x, a.cy, 0);
      if (show(a.obj, a.x)) a.obj.userData.animate?.(dt, time + a.phase, a.dir);
    }
    this.canopy?.update(camX, half);
    this.obstacles?.update(camX, half);
    for (const g of this.gates) show(g.obj, g.x);
    if (show(this.finishGate, this.c.finish) && this.finishGate.userData.size) this.finishGate.scale.multiplyScalar(this.finishGate.userData.size);
    this.skyline?.update(camX);
    this.fx.update(dt, camX, half);
    // Haze and light shafts: the city's dawn rays go out and its haze turns violet at night,
    // the forest's moonbeams fade in the storm.
    const dark = this.lv.world === 'city' ? nightAt(camX) : this.lv.world === 'forest' ? stormAt(camX) : 0;
    if (this.hazeDay) this.haze.mat.color.copy(this.hazeDay).lerp(this.hazeNight, dark);
    this.shafts?.update(time, 1 - dark);

    // Echo and its shadow
    const e = this.e;
    let state = 'idle';
    if (this.mode === 'run') state = e.grounded ? (e.push ? 'push' : 'run') : 'air';
    else if (this.mode === 'oops') state = 'hit';
    else if (this.mode === 'done') state = 'win';
    this.runner.group.position.set(e.x, e.y, 0.1);
    const look = state === 'idle' || state === 'win' ? this.app.echo?.head().pos ?? null : null;
    this.runner.update(dt, { state, vy: e.vy, look, blink: e.invuln > 0 });
    let ground = -Infinity;
    for (const s of this.solidsNear(e.x - W2, e.x + W2)) {
      if (e.x + W2 > s.x0 && e.x - W2 < s.x1 && s.top <= e.y + 0.05 && s.top > ground) ground = s.top;
    }
    this.shadow.visible = ground > -Infinity;
    if (this.shadow.visible) {
      const hgt = e.y - ground;
      this.shadow.position.set(e.x, ground + 0.06, 0.1);
      this.shadow.scale.setScalar(Math.max(0.35, 1 - hgt * 0.15));
      this.shadow.material.opacity = Math.max(0.1, 0.5 - hgt * 0.08);
    }
  }

  dispose() {
    this.app.echo?.suppress(false);
    if (this.runner) this.runner.disposed = true;
    this.engine.renderer.localClippingEnabled = false;
    this.night?.dispose(); // the city's shared materials back to day colors
    this.engine.onEmptyPress = null;
    window.removeEventListener('keydown', this.keydown);
    music.stop();
    this.card?.dispose();
    this.look.dispose(); // tone mapping, environment, shadows, room lights and bloom back
    this.envTarget?.dispose();
    super.dispose();
  }
}
