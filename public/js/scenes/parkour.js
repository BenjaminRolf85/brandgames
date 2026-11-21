// Echo Parkour: a flight and run on a stage in front of the player. Echo runs by itself, every
// press (trigger, pinch, click, tap, space) is a wing beat. Three levels: forest, city, office.
// Every coin tells what Echomotion does. Sparks mark a good flight line and build a streak.
// Echo carries a shield: the first hit of a stretch only costs the shield (a fall into a pit is
// caught by it too), the next one sends Echo back to the last checkpoint, where the shield is
// charged again. Walls, branches and furniture only stop Echo, they never hurt.
// Browser (Nov 2026): the stage fills the screen (own camera), is wider on wide screens, the
// status line and the fact cards sit around the stage instead of on it; relaxed mode and calm
// motion from assist.js.
import * as THREE from 'three';
import { BaseScene, layoutRow } from '../scene.js';
import { Button, Panel, textPanel } from '../ui3d.js';
import { color, hex, num } from '../tokens.js';
import { t, L } from '../i18n.js';
import { sfx, audioContext } from '../sfx.js';
import { music } from '../music.js';
import { LEVELS } from '../parkour-level.js';
import { factCard } from '../fact-card.js';
import { makeStage, makeBlocks, makeCoin, makeSpikes, makeBug, makeLift, makeGate, makeShadow, makeParticles, makeSparks, makeShieldRing, stageClock, edgeFactor, DEPTH } from '../parkour-visuals.js';
import { TRAILS } from '../parkour-trail.js';
import { assist } from '../assist.js';
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
const RUN = 4.2; // run speed (units/s); slower in relaxed mode (tune.run)
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
const PIT = -1.5; // this deep in a pit the shield catches Echo (if it is up)
const RESCUE_V = 15; // the push that carries Echo out of a pit
const INVULN = 1.6; // seconds without hits after the shield took one
// Points (a perfect round stays far below the leaderboard's cap of 5000).
// Coins, sparks, goal, time and a clean flight add up to about what a perfect round scored
// before the sparks came (3700), so the leaderboards keep their range.
const COIN_POINTS = 140;
const SPARK_POINTS = 3; // times the streak factor (1, 2 from 10 in a row, 3 from 25)
const GOAL_POINTS = 500;
const RANKS = [0, 1800, 3000]; // bronze, silver and gold wings
const SEEN_KEY = 'kiar.parkour.hints';
// Browser view (meters): a strip above the stage for the fact card and the hints, and a little
// of the pedestal below it.
const BAND = 0.23;
const STRIP = 0.05;

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

/**
 * The sparks' own sound: a short soft note that climbs a five-note scale with the streak, so a
 * good run of sparks sounds like one.
 */
function sparkNote(step) {
  const a = audioContext();
  if (!a) return;
  const semis = [0, 2, 4, 7, 9][step % 5] + 12 * (Math.floor(step / 5) % 2);
  const t0 = a.currentTime;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(523.25 * 2 ** (semis / 12), t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.03, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + 0.12);
}

/** Hints the player has seen on this device (each one shows the first time only). */
function seenHints() {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]')); } catch { return new Set(); }
}

export class ParkourScene extends BaseScene {
  constructor(app, level = 1) {
    super(app);
    this.lv = LEVELS[level] ?? LEVELS[1];
    this.c = this.lv.build();
    this.facts = this.lv.facts;
    this.total = this.facts.length;
    this.app.echo?.suppress(true); // the runner is Echo; the flying one takes a break

    // Relaxed mode (assist.js): slower, a softer fall, two shield charges, more checkpoints,
    // smaller danger zones, a wider reach for coins and sparks, slower bugs and birds, every hint
    // again.
    this.calm = assist.reducedMotion;
    stageClock.calm = this.calm;
    this.tune = {
      run: assist.pick(RUN, 3.4),
      shields: assist.pick(1, 2),
      inset: assist.pick(0.06, 0.14),
      grab: assist.pick(0.55, 0.8),
      slow: assist.pick(1, 1.4),
      // the flight itself: a softer fall with the same height per wing beat (about 1.7 units)
      g: assist.pick(FLY.G, 19),
      flap: assist.pick(FLY.FLAP, 8),
      fall: assist.pick(FLY.MAX_FALL, 7),
    };
    if (assist.easy) this.c.checkpoints = [...this.c.checkpoints, ...(this.c.easyCheckpoints ?? [])].sort((p, q) => p - q);
    for (const m of [...this.c.bugs, ...(this.c.eagles ?? [])]) m.period *= this.tune.slow;

    // The stage window: as built for the headset; in the browser as wide as the screen allows
    // (more of the course in view), on a phone held upright narrower and closer, with Echo
    // further left, so everything is bigger and the view ahead stays the same.
    const aspect = window.innerWidth / window.innerHeight;
    this.narrow = !!app.host?.narrow;
    this.halfW = this.engine.isXR ? 0.8 : this.narrow ? 0.44 : THREE.MathUtils.clamp(0.57 * aspect - 0.1, 0.8, 1.1);
    this.half = this.halfW / U;
    this.lead = this.narrow ? 0.66 : 0.38; // how far ahead of Echo the window's middle is
    this.bottomU = this.lv.world === 'office' ? -0.32 : -2.6;
    this.mode = 'intro';
    this.time = 0;
    this.liftT = 0;
    this.ready = false;
    this.score = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.sparksTaken = 0;
    this.hits = 0;
    this.hitKinds = {};
    this.tries = 0; // returns to the same checkpoint in a row
    this.shield = this.tune.shields;
    this.hinted = new Set();
    this.hintQueue = [];
    this.hintAge = 0;
    this.seen = seenHints();
    this.buildHud();

    this.setControls({
      desktop: [[t('parkourKeyFlap'), t('parkourCtlFlap')], [t('parkourKeyPause'), t('parkourCtlPause')]],
      touch: [[t('parkourTouchFlap'), t('parkourCtlFlap')]],
      xr: [[t('parkourXrFlap'), t('parkourCtlFlap')]],
    });

    // Glossy reflections for Echo and the blocks, tone mapping, the light rig of the world,
    // shadows; all restored when the scene closes (parkour-look.js).
    this.envTarget = makeEnvironment(this.engine.renderer);
    this.look = parkourLook(this.engine, this.lv.world, this.envTarget.texture);

    // Input: any press that is not on a button, plus the keyboard. On the intro the same keys
    // (and Enter) start the level.
    this.engine.onEmptyPress = () => this.press();
    this.keydown = (e) => {
      if (this.engine.paused || e.altKey || e.ctrlKey || e.metaKey) return;
      const flap = ['Space', 'ArrowUp', 'KeyW'].includes(e.code);
      if (this.mode === 'intro' && (flap || e.code === 'Enter') && !e.repeat) { e.preventDefault(); this.begin(); return; }
      if (flap) { e.preventDefault(); if (!e.repeat) this.press(); }
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
    // "Again" on the result starts the next round at once (the intro is known by then).
    const quick = ParkourScene.quick === this.lv.key;
    ParkourScene.quick = null;
    if (quick) { this.prepareMusic(this.lv.key); this.mode = 'wait'; this.startWhenReady = true; } else this.showIntro();
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
        this.camX = this.e.x + this.half * this.lead;
        this.ready = true;
        if (this.startWhenReady) this.countdown();
      });
  }

  /**
   * Where things go: 'xr' the headset, as before; in the browser 'port' an upright screen (phone),
   * 'land' a phone held sideways (little height: no strip above the stage), 'desk' everything
   * else (desktop, tablets).
   */
  layout() {
    if (this.engine.isXR) return 'xr';
    if (window.innerWidth / window.innerHeight < 0.95) return 'port';
    if (this.engine.touchUI && window.innerHeight < 520) return 'land';
    return 'desk';
  }

  // ----- status line -----

  /**
   * Headset and phones: the shared status bar (a 3D bar, on phones a screen bar). Desktop
   * browser: an own slim line with a menu button that sits in the stage's top edge during the
   * flight (above the ceiling, so it covers nothing of the course) and frees the screen for it.
   */
  buildHud() {
    if (this.engine.isXR || this.engine.touchUI) {
      this.refreshHud = this.hud(() => this.hudText());
      return;
    }
    const w = Math.min(1.0, this.halfW * 2 - 0.3);
    this.hudShort = w < 0.9;
    // (two lines where the window is narrow)
    const info = textPanel(w, this.hudShort ? 0.115 : 0.075, () => [{ text: this.hudText(), size: 'xr-text-sm', weight: 'bold' }], { grow: false, layout: { align: 'left', pad: 0.018 } });
    const menu = new Button(0.24, 0.075, { label: t('menu'), labelSize: 'xr-text-sm', grow: false, onClick: () => this.menuOrPause() });
    info.userData.hud = true; // speech bubbles keep clear of it
    menu.userData.hud = true;
    this.group.add(info, menu);
    this.ownHud = { info, menu };
    this.placeHud(false);
    this.refreshHud = () => info.redraw();
  }

  /** Desktop: the status line at the top of the screen (intro, result) or in the stage's top edge. */
  placeHud(play) {
    if (!this.ownHud) return;
    const { info, menu } = this.ownHud;
    if (this.hudPlay === play) return;
    this.hudPlay = play;
    // During the flight the keyboard's Tab skips the menu button (Space must stay the wing beat;
    // Escape or P opens the pause with the menu).
    menu.userData.focusable = !play;
    if (play && this.engine.focus === menu) this.engine.setFocus(null);
    if (play) {
      // Top edge of the stage (above the ceiling); a two-line status reaches a little above it.
      const top = this.stage.position.y + this.viewTop() - 0.012 + (info.h - 0.075);
      const z = this.frontZ() + 0.01;
      info.position.set(-this.halfW + 0.02 + info.w / 2, top - info.h / 2, z);
      menu.position.set(this.halfW - 0.02 - menu.w / 2, top - menu.h / 2, z);
    } else {
      const y = this.eye + 0.66 - info.h / 2;
      info.position.set(-0.14, y, -this.dist);
      menu.position.set(-0.14 + info.w / 2 + 0.03 + menu.w / 2, y, -this.dist);
    }
  }

  hudText() {
    if (['intro', 'wait', 'over'].includes(this.mode)) return `${t(`${this.lv.key}Name`)}  ·  ${t('parkourLevel', { n: this.lv.n })}`;
    const short = this.hudShort ?? this.engine.touchUI;
    return t(short ? 'parkourHudShort' : 'parkourHud', { n: this.coinsTaken ?? 0, total: this.total, score: this.score, mult: this.mult(), shield: this.shield });
  }

  /** Streak factor for the sparks: 2 from 10 in a row, 3 from 25. */
  mult() {
    return this.streak >= 25 ? 3 : this.streak >= 10 ? 2 : 1;
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
    // (In the browser the camera stands closer to the stage: the sky picture reaches further sideways.)
    const s = makeStage(this.halfW, U, { top: STAGE_TOP, M, sky: office, bottom: this.bottomU, skyScale: office ? 0.7 : 1, backWide: this.engine.isXR ? 1 : 1.3, ...world });
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
    this.ring = makeShieldRing();
    course.add(this.ring.group);

    // The flight line: sparks recorded from a practiced flight (parkour-trail.js). A spark that
    // would sit in something solid or in a danger zone after a change to the course is left out.
    this.e = { x: 0, y: 0 };
    const zones = this.hazardZones(true).filter((z) => !z.moving);
    const clear = ([x, y]) => {
      for (const b of this.buckets.get(Math.floor(x)) ?? []) if (y + 0.3 > b.bottom && y - 0.3 < b.top) return false;
      for (const z of zones) {
        if (z.r ? (x - z.x) ** 2 + (y - z.y) ** 2 < (z.r + 0.5) ** 2 : x > z.x0 - 0.4 && x < z.x1 + 0.4 && y > z.y0 - 0.5 && y < z.y1 + 0.5) return false;
      }
      return true;
    };
    this.sparks = (TRAILS[this.lv.key] ?? []).filter(clear).map(([x, y]) => ({ x, y, taken: false }));
    this.sparkFx = makeSparks(this.sparks);
    course.add(this.sparkFx.mesh);

    // One-line hints, each where its danger shows up for the first time (see lookAhead).
    const first = (list, x = (o) => o.x0 ?? o.x) => (list.length ? Math.min(...list.map(x)) : null);
    const spots = [];
    // (not in the first moments: there the hint about the wing beat is up)
    const spot = (id, x) => { if (x !== null && x !== undefined) spots.push({ id, x: Math.max(x - 7, this.c.start + 5) }); };
    const cols = new Set(this.c.cols.map((col) => col.x));
    if (this.c.cols.length) for (let x = this.c.start + 3; x < this.c.finish; x++) { if (!cols.has(x)) { spot('pit', x); break; } }
    for (const kind of ['glitch', 'pigeon', 'cable']) spot(kind, first(this.spikes.filter((sp) => (sp.kind ?? 'glitch') === kind)));
    spot('thorns', first(this.thorns));
    spot('bug', first(this.bugs));
    spot('wire', first(this.wires));
    this.hintSpots = spots.sort((p, q) => p.x - q.x);
    // What waits under the ceiling (birds, helicopters, fans) gets its hint when Echo rises
    // towards it for the first time, not before.
    this.highUp = [
      ...this.eagles.map((a) => ({ id: F ? 'eagle' : 'heli', x0: a.x0 - 4, x1: a.x1 + 2, y: a.y })),
      ...this.fans.map((f) => ({ id: 'fan', x0: f.x - 5, x1: f.x + 1, y: f.y })),
    ];
  }

  /** Front of the track (group space, meters): where the browser camera's frame and the texts sit. */
  frontZ() {
    return STAGE_Z + (DEPTH / 2 + 0.5) * U;
  }

  /** Top of what the browser shows of the stage, above the ceiling (stage space, meters). */
  viewTop() {
    return ((this.c.ceiling ?? STAGE_TOP) + 1.1) * U;
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
    const p = this.add(textPanel(1.0, 0.3, [
      { text: `${t(this.lv.title)}  ·  ${t('parkourLevel', { n: this.lv.n })}`, size: 'xr-text-title', weight: 'black', gap: 0.02 },
      { text: t(this.lv.intro), size: 'xr-text-md', color: color('xr-panel-muted'), gap: 0.03 },
      ...(assist.easy ? [{ text: t('parkourEasy'), size: 'xr-text-sm', weight: 'bold', color: color('xr-success'), gap: 0.03 }] : []),
      ...this.controlsBlocks(),
    ], { layout: { align: 'left' } }));
    p.position.set(0, eye + 0.42 - p.h / 2, -1.0);
    this.popIn(p);
    this.app.host?.introduce(this, this.lv.key, p);
    this.prepareMusic(this.lv.key);
    // Start this level, or switch to one of the others (forest, city, office).
    const go = new Button(0.42, 0.13, { label: t('start'), variant: 'primary', labelSize: 'xr-text-lg', onClick: () => this.begin() });
    const others = Object.values(LEVELS).filter((l) => l.n !== this.lv.n).map((l) => new Button(0.42, 0.1, {
      label: t('parkourToLevel', { n: l.n, name: t(`parkourWorld${l.n}`) }), labelSize: 'xr-text-sm', variant: 'sponsor', onClick: () => this.app.startGame(l.key),
    }));
    const y1 = p.position.y - p.h / 2 - 0.04 - 0.065;
    layoutRow([go], y1, -1.0);
    layoutRow(others, y1 - 0.065 - 0.03 - others[0].h / 2, -1.0, 0.03);
    [go, ...others].forEach((b, i) => { this.add(b); this.popIn(b, 0.1 + i * 0.05); });
    // Browser: the stage's backdrop and snow stand nearer than the intro; draw the intro on top.
    if (!this.engine.isXR) for (const o of [p, go, ...others]) { o.renderOrder = 20; o.material.depthTest = false; }
  }

  /** The start button, or the flap key on the intro. */
  begin() {
    if (this.mode !== 'intro') return;
    if (this.ready) this.countdown();
    else { this.clearLayer(); this.mode = 'wait'; this.startWhenReady = true; }
  }

  countdown() {
    this.clearLayer();
    this.mode = 'count';
    this.refreshHud();
    const show = (text, token) => {
      const p = this.add(textPanel(0.5, 0.16, [{ text, size: 0.11, weight: 'black', color: color(token) }], { surface: false }));
      p.userData.noFit = true;
      p.position.set(0, this.stage.position.y + 0.3, this.frontZ() + 0.05);
      this.popIn(p);
      this.delay(0.5, () => { p.visible = false; });
    };
    ['3', '2', '1'].forEach((n, i) => this.delay(i * 0.5, () => { if (this.disposed) return; show(n, 'xr-panel-text'); sfx.tick(); }));
    this.delay(1.5, () => {
      if (this.disposed) return;
      show(t('parkourGo'), 'xr-parkour-coin');
      sfx.powerup();
      this.mode = 'run';
      this.startMusic(1, this.lv.key);
      this.hint('flap', true);
    });
  }

  press() {
    if (this.mode === 'run') this.e.buffer = BUFFER;
  }

  // ----- game loop -----

  update(dt) {
    stageClock.t += dt;
    if (this.snow) this.updateSnow(dt);
    this.flapPad?.show(['count', 'run', 'oops', 'done'].includes(this.mode));
    this.updateView(dt);
    // A hint takes the fact card's place while it is up.
    if (this.card) this.card.visible = !this.hintPanel;
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
      this.hintAge += dt;
      this.hudT = (this.hudT ?? 0) - dt;
      if (this.hudT <= 0) { this.hudT = 0.25; this.refreshHud(); }
    } else if (this.mode === 'oops') {
      this.oopsT -= dt;
      if (this.oopsT <= 0) this.respawn();
    }

    // Camera: Echo stays in the left part of the window, so you see what comes.
    const target = this.e.x + this.half * this.lead;
    this.camX += (target - this.camX) * Math.min(1, dt * (this.mode === 'run' ? 5 : this.calm ? 1.2 : 2));
    this.course.position.x = -this.camX * U;
    if (this.backTex) this.backTex.offset.x = (this.camX * U * 0.35) / 0.24;
    this.animate(dt);
  }

  /**
   * Browser: during the flight the scene frames the stage itself, as big as the screen allows:
   * the stage window with the strip for the fact card and the hints above it (none on a phone
   * held sideways, where height is short). On phones it keeps clear of the status bar and the
   * flap button. Intro and result use the engine's automatic view.
   */
  updateView(dt) {
    const e = this.engine;
    if (e.isXR) return;
    const play = !!this.stage && ['count', 'run', 'oops', 'done'].includes(this.mode);
    e.fitEnabled = !play;
    this.placeHud(play);
    if (!play) { this.viewOn = false; return; }
    const cam = e.camera;
    const ins = e.insets();
    const H = window.innerHeight;
    const free = Math.max(0.35, 1 - (ins.top + ins.bottom) / H);
    const center = (ins.bottom - ins.top) / H;
    const tv = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const th = tv * cam.aspect;
    const lay = this.layout();
    const sy = this.stage.position.y;
    const top = sy + this.viewTop() + (lay === 'land' ? 0.01 : lay === 'port' ? BAND + 0.12 : BAND);
    const bottom = sy + this.bottomU * U - STRIP;
    // Sideways the trees or lamps at the stage's edges belong to the picture; a phone held
    // upright needs every bit of width for the course itself.
    const side = this.halfW + (lay === 'port' ? 0.03 : 0.1);
    const d = Math.max(side / th, (top - bottom) / 2 / (tv * free)) * 1.01;
    const want = this.group.localToWorld(new THREE.Vector3(0, (top + bottom) / 2 - center * d * tv, this.frontZ() + d));
    // A soft move from the intro's view into the flight's (slower with calm motion).
    if (this.viewOn) cam.position.lerp(want, Math.min(1, dt * 8));
    else cam.position.lerp(want, Math.min(1, dt * (this.calm ? 2.5 : 5)));
    if (cam.position.distanceTo(want) < 0.004) this.viewOn = true;
    cam.rotation.set(0, 0, 0);
  }

  step(dt) {
    const e = this.e;
    let { x, y, vy } = e;
    if (e.on?.lift) y = e.on.top; // carried by the lift
    const fly = this.lv.flight;
    if (fly && e.buffer > 0) {
      // Flying: every press is a wing beat, also from the ground.
      vy = this.tune.flap;
      e.grounded = false;
      e.on = null;
      e.buffer = 0;
      this.runner.flap();
      this.fx.puff(x, y + 0.45, 'spark', this.calm ? 2 : 5);
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
    let nx = x + this.tune.run * dt;
    e.push = false;
    for (const s of this.solidsNear(x - W2, nx + W2)) {
      if (y >= s.top - 1e-3 || y + H <= s.bottom) continue;
      if (nx + W2 <= s.x0 || nx - W2 >= s.x1) continue;
      if (e.grounded && s.top - y <= STEP) { y = s.top; continue; }
      if (x + W2 <= s.x0 + 0.05) { nx = s.x0 - W2 - 1e-4; e.push = true; }
    }
    x = nx;
    e.pushT = e.push ? (e.pushT ?? 0) + dt : 0;

    // Fall and land; bump the head under a platform.
    vy = fly ? Math.max(vy - this.tune.g * dt, -this.tune.fall) : Math.max(vy - G * dt, -MAX_FALL);
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
        if (-vy > 4) this.fx.puff(x, landed.top, 'dust', this.calm ? 3 : 8);
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
    // A pit: the shield catches Echo while it is up and carries it for a moment (so it also gets
    // out from under an island), otherwise Echo falls out of the stage.
    e.bubble = Math.max(0, (e.bubble ?? 0) - dt);
    if (ny < PIT && vy < 0) {
      if (e.bubble > 0) e.vy = RESCUE_V * 0.8;
      else if (this.shield > 0 || ny < -4.5) this.hit('fall');
    }
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

  /**
   * Picking up is generous: Echo's whole figure counts (ears and wings reach beyond the body
   * box that walls and dangers use), plus the reach r.
   */
  grabHits(cx, cy, r) {
    const { x, y } = this.e;
    const px = THREE.MathUtils.clamp(cx, x - W2 - 0.25, x + W2 + 0.25);
    const py = THREE.MathUtils.clamp(cy, y - 0.05, y + H + 0.5);
    return (cx - px) ** 2 + (cy - py) ** 2 < r * r;
  }

  /**
   * The danger zones (course units), each clearly smaller than what is drawn: a box
   * { kind, x0, x1, y0, y1 } or a circle { kind, x, y, r }. Echo's own box is its body without
   * ears and wings. all: every zone of the course (else only those near Echo); moving: it flies.
   */
  hazardZones(all = false) {
    const i = this.tune.inset;
    const ex = this.e.x;
    const out = [];
    const near = (x0, x1) => all || (x1 > ex - 2 && x0 < ex + 2);
    const box = (kind, x0, x1, y0, y1, moving = false) => { if (near(x0, x1)) out.push({ kind, x0, x1, y0, y1, moving }); };
    const circle = (kind, x, y, r) => { if (near(x - r, x + r)) out.push({ kind, x, y, r, moving: true }); };
    for (const s of this.spikes) box(s.kind ?? 'glitch', s.x0 + 0.2 + i, s.x1 - 0.2 - i, s.y, s.y + 0.42 - i);
    for (const b of this.bugs) circle('bug', b.x, b.cy, 0.42 - i);
    for (const a of this.eagles) {
      // A helicopter is a box (cabin and tail, not the rotor), birds are round (the body).
      if (a.kind === 'heli') box('heli', a.x - 0.8 + i, a.x + 0.8 - i, a.cy - 0.38 + i, a.cy + 0.36 - i, true);
      else circle(a.kind ?? 'eagle', a.x, a.cy, (a.kind === 'raven' ? 0.42 : 0.5) - i);
    }
    for (const th of this.thorns) box('thorns', th.x0 + 0.15 + i, th.x1 - 0.15 - i, th.y - 0.5 + i, th.y);
    for (const w of this.wires) box('wire', w.x0 + 0.15 + i, w.x1 - 0.15 - i, w.y - 0.3 + i / 2, w.y - i / 2);
    for (const f of this.fans) box('fan', f.x - 0.8 + i, f.x + 0.8 - i, f.y - 0.25 + i, f.y + 0.12 - i / 2);
    return out;
  }

  /** What Echo touches right now (a kind), or null. */
  hazardHit() {
    for (const z of this.hazardZones()) {
      if (z.r ? this.circleHits(z.x, z.y, z.r) : this.boxHits(z.x0, z.x1, z.y0, z.y1)) return z.kind;
    }
    return null;
  }

  /** Test overlay (hitzones.js in the upgrade tests): every zone with a color. */
  zones() {
    const { x, y } = this.e;
    const R = 0xff2020;
    const g = this.tune.grab;
    return [
      ...this.hazardZones(true).map((z) => ({ ...z, col: R })),
      ...this.coins.filter((c) => !c.taken).map((c) => ({ x: c.x, y: c.y, r: g, col: 0xffe000 })),
      ...this.sparks.filter((sp) => !sp.taken).map((sp) => ({ x: sp.x, y: sp.y, r: g - 0.1, col: 0xa0ff40 })),
      { x0: x - W2, x1: x + W2, y0: y, y1: y + H, col: 0x00ffff },
      { x0: x - W2 - 0.25, x1: x + W2 + 0.25, y0: y - 0.05, y1: y + H + 0.5, col: 0x0080ff },
    ];
  }

  checkThings() {
    const e = this.e;
    const g = this.tune.grab;
    for (const c of this.coins) {
      if (!c.taken && Math.abs(c.x - e.x) < 2.5 && this.grabHits(c.x, c.y, g)) this.collect(c);
    }
    for (const sp of this.sparks) {
      if (!sp.taken && Math.abs(sp.x - e.x) < 2.5 && this.grabHits(sp.x, sp.y, g - 0.1)) this.takeSpark(sp);
    }
    if (e.invuln <= 0) {
      const kind = this.hazardHit();
      if (kind) { this.hit(kind); if (this.mode !== 'run') return; }
    }
    for (const gate of this.gates) {
      if (!gate.on && e.x >= gate.x) {
        gate.on = true;
        this.lastCp = gate.x;
        this.tries = 0;
        gate.obj.userData.mat.color.setHex(hex('xr-parkour-check-on'));
        gate.obj.userData.glow.color.setHex(hex('xr-parkour-check-on'));
        gate.obj.userData.glow.opacity = 0.55;
        sfx.point();
        // The shield is charged again at every checkpoint.
        const charged = this.shield < this.tune.shields;
        if (charged) this.shield = this.tune.shields;
        this.toast(t(charged ? 'parkourCheckpointShield' : 'parkourCheckpoint'), 'xr-parkour-check-on');
        this.refreshHud();
      }
    }
    this.lookAhead();
    if (e.x >= this.c.finish) this.reachGoal();
  }

  /** Hints at the moment they matter: a danger that comes into view for the first time, a wall. */
  lookAhead() {
    const e = this.e;
    while (this.hintSpots.length && this.hintSpots[0].x <= e.x) this.hint(this.hintSpots.shift().id, true);
    if (e.pushT > 0.5) this.hint('push', true);
    for (const h of this.highUp) {
      if (e.x > h.x0 && e.x < h.x1 && e.y + H > h.y - 1.9) { this.hint(h.id, true); break; }
    }
    // One hint at a time, each long enough to read: the next one waits its turn.
    if (this.hintQueue.length && (!this.hintPanel || this.hintAge >= 2)) this.hint(this.hintQueue.shift(), true);
  }

  collect(c) {
    c.taken = true;
    this.coinsTaken += 1;
    this.score += COIN_POINTS;
    this.addStreak();
    sfx.coin();
    this.runner.happy();
    this.burst(c.obj.getWorldPosition(new THREE.Vector3()), 'xr-parkour-coin', this.calm ? 6 : 18);
    this.fx.puff(c.x, c.y - 0.3, 'coin', this.calm ? 3 : 10);
    this.toast(`+${COIN_POINTS}`, 'xr-parkour-coin');
    this.showCard(c.i);
    this.refreshHud();
  }

  takeSpark(sp) {
    sp.taken = true;
    this.sparksTaken += 1;
    this.score += SPARK_POINTS * this.mult();
    sparkNote(this.streak);
    this.addStreak();
    if (!this.calm) this.fx.puff(sp.x, sp.y, 'coin', 3);
    if (this.sparksTaken === 3) this.hint('sparks');
  }

  /** Coins and sparks in a row without a hit: from 10 the sparks count double, from 25 triple. */
  addStreak() {
    const before = this.mult();
    this.streak += 1;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    if (this.mult() > before) {
      sfx.powerup();
      this.toast(t('parkourStreak', { mult: this.mult() }), 'xr-parkour-spark');
      this.refreshHud();
    }
  }

  /**
   * Echo touched a danger or fell into a pit. While the shield is up it takes the hit: Echo
   * flies on (out of a pit it is carried up), untouchable for a moment. Without a shield Echo
   * goes back to the last checkpoint.
   */
  hit(kind) {
    if (this.mode !== 'run') return;
    this.hits += 1;
    this.hitKinds[kind] = (this.hitKinds[kind] ?? 0) + 1;
    this.streak = 0;
    if (this.shield <= 0) { this.oops(kind); return; }
    this.shield -= 1;
    const e = this.e;
    e.invuln = INVULN;
    if (kind === 'fall') { e.vy = RESCUE_V; e.bubble = INVULN; e.grounded = false; e.on = null; sfx.boing(); } else sfx.shatter();
    this.runner.hurt();
    this.burst(this.runner.group.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.06, 0)), 'xr-parkour-shield', this.calm ? 8 : 24);
    this.toast(t(kind === 'fall' ? 'parkourSaved' : 'parkourShieldGone'), 'xr-parkour-shield');
    this.hint('shield');
    this.refreshHud();
  }

  oops(kind) {
    if (this.mode !== 'run') return;
    this.mode = 'oops';
    this.oopsT = kind === 'fall' ? 0.7 : 1.0;
    this.falls += 1;
    this.tries += 1;
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
    // A fresh shield; after two returns to the same checkpoint one more charge, so nobody gets stuck.
    this.shield = this.tune.shields + Math.min(2, Math.floor(this.tries / 2));
    this.mode = 'run';
    this.refreshHud();
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
    this.burst(at.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.3, 0)), 'xr-parkour-finish', this.calm ? 14 : 50);
    this.office?.cheer();
    this.toast(t('parkourFinish'), 'xr-parkour-finish');
    this.refreshHud();
    this.delay(2.4, () => { if (!this.disposed) this.finishGame(); });
  }

  /** Points of the round: coins, sparks, the goal, time and a clean flight. */
  points() {
    // The time bonus counts from the level's own pace, so the slower relaxed flight loses nothing.
    const ideal = (this.c.finish - this.c.start) / this.tune.run;
    const time = Math.round(THREE.MathUtils.clamp((ideal + 53 - this.time) * 8, 0, 424));
    const clean = this.hits === 0 ? 400 : this.falls === 0 ? 200 : 0;
    return Math.min(5000, this.score + GOAL_POINTS + time + clean);
  }

  finishGame() {
    this.mode = 'over';
    this.refreshHud();
    this.stage.visible = false;
    this.card?.removeFromParent();
    this.hintPanel?.removeFromParent();
    const coins = this.coinsTaken;
    const raw = this.points();
    // The rating in three steps. In relaxed mode the result shows a share of the points; the
    // steps take the same share, so gold stays within reach, and "points to go" are shown points.
    const k = assist.scoreFactor;
    const rank = RANKS.filter((r) => raw >= r).length; // 1 bronze, 2 silver, 3 gold
    const name = t(`parkourRank${rank}`);
    const rating = rank < 3
      ? t('parkourRankNext', { rank: name, n: Math.max(1, Math.round((RANKS[rank] - raw) * k)), next: t(`parkourRank${rank + 1}`) })
      : t('parkourRankTop', { rank: name });
    // What went well, one tip (from what hit Echo most), and one of the coins' facts.
    const good = this.hits === 0 ? t('parkourGoodClean')
      : coins === this.total ? t('parkourGoodCoins')
        : t('parkourGoodStreak', { n: this.bestStreak });
    const worst = Object.entries(this.hitKinds).sort((p, q) => q[1] - p[1])[0]?.[0];
    const tipKey = worst ? ({ fall: 'parkourTipFall', bug: 'parkourTipBug', eagle: 'parkourTipHigh', heli: 'parkourTipHigh', raven: 'parkourTipHigh', fan: 'parkourTipHigh', thorns: 'parkourTipThorns' }[worst] ?? 'parkourTipLow')
      : coins < this.total ? 'parkourTipCoins' : 'parkourTipStreak';
    const missed = this.coins.filter((c) => !c.taken);
    const fact = this.facts[(missed[0] ?? this.coins[Math.floor(Math.random() * this.coins.length)]).i];
    const learned = [
      { q: t('parkourGoodTitle'), a: good },
      { q: t('parkourTipTitle'), a: t(tipKey) },
      { q: L(fact.title), a: L(fact.text) },
    ];
    const next = LEVELS[this.lv.n + 1];
    this.results({
      gameKey: this.lv.key, score: raw, correct: coins, total: this.total,
      line: `${rating}\n${t('parkourLine', { n: coins, total: this.total, sparks: this.sparksTaken, all: this.sparks.length, time: fmt(this.time), hits: this.hits })}`,
      learned,
      onAgain: () => { ParkourScene.quick = this.lv.key; this.app.startGame(this.lv.key); },
      next: next ? { label: t('parkourNext'), onClick: () => this.app.startGame(next.key) } : null,
    });
  }

  // ----- messages -----

  /**
   * What a coin tells. Headset: the card above the stage, as before. Browser: in the strip above
   * the stage (never on it), as wide as the stage, so the text takes two or three lines; on a
   * phone held sideways, where height is short, only the coin's title, in the stage's top edge
   * (above the ceiling); the texts follow on the result.
   */
  showCard(i) {
    if (this.card) { const old = this.card; this.card = null; old.removeFromParent(); old.dispose(); }
    const lay = this.layout();
    const fact = this.facts[i];
    let card;
    if (lay === 'xr') {
      card = factCard(i + 1, this.total, fact, this.narrow ? 0.9 : 0.84);
      // Just below the status bar, between it and the stage; in front of the stage, so the
      // city's cloud deck does not reach over its text.
      card.position.set(0, this.eye + 0.48 - card.h / 2, this.frontZ() + 0.04);
    } else {
      const head = { text: `${t('parkourCoin', { n: i + 1, total: this.total })}  ·  ${L(fact.title)}`, size: 'xr-text-md', weight: 'black', color: color('xr-parkour-coin'), gap: 0.01 };
      const surface = { stroke: color('xr-parkour-coin'), strokeWidth: num('xr-border-width') * 1.5, stripe: false };
      const sy = this.stage.position.y;
      const w = this.bandWidth(lay);
      if (lay === 'land') {
        card = textPanel(w, 0.07, [head], { surface, layout: { pad: 0.016 } });
        card.position.set(0, sy + this.viewTop() - 0.012 - card.h / 2, this.frontZ() + 0.012);
      } else {
        card = textPanel(w, 0.1, [head, { text: L(fact.text), size: 'xr-text-sm', color: color('xr-panel-text') }], { surface, layout: { align: 'left', pad: 0.026 } });
        card.position.set(0, sy + this.viewTop() + 0.03 + card.h / 2, this.frontZ());
      }
      card.userData.noFit = true;
    }
    this.group.add(card);
    this.popIn(card);
    this.card = card;
    this.delay(CARD_TIME, () => {
      if (this.card !== card) return;
      this.tween(0.4, (k) => { card.material.opacity = 1 - k; }, { onDone: () => { if (this.card === card) { this.card = null; card.removeFromParent(); card.dispose(); } } });
    });
  }

  /** Width of the fact card and the hints in the browser (clear of the screen's close button). */
  bandWidth(lay = this.layout()) {
    if (lay === 'port') return this.halfW * 2 - 0.02;
    if (lay === 'land') return Math.min(1.3, this.halfW * 2 - 0.2);
    return Math.min(1.5, this.halfW * 2 - 0.25);
  }

  /** A short word above Echo (checkpoint, points, shield, goal) that floats up and fades. */
  toast(text, token) {
    // (as small as its text: it floats over the flight space for a moment)
    const w = THREE.MathUtils.clamp(0.09 + text.length * 0.027, 0.2, 0.62);
    const p = textPanel(w, 0.065, [{ text, size: 'xr-text-md', weight: 'black', color: color(token) }], { surface: { stroke: color(token) }, layout: { pad: 0.014 } });
    p.userData.noFit = true;
    const pos = this.runner.group.getWorldPosition(new THREE.Vector3());
    this.group.add(p);
    // Several at once (a coin that also raises the streak) stack instead of covering each other.
    this.toasts = (this.toasts ?? 0) + 1;
    p.position.copy(this.group.worldToLocal(pos)).add(new THREE.Vector3(0.04, 0.17 + (this.toasts - 1) * 0.08, 0.12));
    const reach = Math.max(0, this.halfW - p.w / 2 + 0.02); // stays inside the stage window
    p.position.x = THREE.MathUtils.clamp(p.position.x, -reach, reach);
    p.position.y = Math.min(p.position.y, this.stage.position.y + (this.c.ceiling ?? STAGE_TOP) * U - p.h / 2 - (this.toasts - 1) * 0.02);
    const y0 = p.position.y;
    this.tween(1.3, (k) => {
      p.position.y = y0 + (this.calm ? 0 : k * 0.08);
      p.material.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
    }, { ease: (k) => k, onDone: () => { this.toasts -= 1; p.removeFromParent(); p.dispose(); } });
  }

  /**
   * One short sentence in the strip above the stage (in the fact card's place, if one is up; on
   * a phone held sideways in the stage's top edge, above the ceiling), at the moment it matters
   * and the first time only (kept on the device; relaxed mode shows every hint again in each
   * round). urgent (a danger coming into view): it takes the place of a hint that has been up
   * for two seconds, or waits for that; other hints only show when none is up.
   */
  hint(id, urgent = false) {
    if (this.hinted.has(id) || (!assist.easy && this.seen.has(id))) return;
    if (this.hintPanel && !urgent) return;
    if (this.hintPanel && this.hintAge < 2) { if (!this.hintQueue.includes(id)) this.hintQueue.push(id); return; }
    this.hintAge = 0;
    this.hinted.add(id);
    this.seen.add(id);
    try { localStorage.setItem(SEEN_KEY, JSON.stringify([...this.seen])); } catch { /* private mode */ }
    const key = id === 'flap' ? (this.engine.isXR ? 'parkourHintFlapXR' : this.engine.touchUI ? 'parkourHintFlapTouch' : 'parkourHintFlap') : `parkourHint_${id}`;
    if (this.hintPanel) { this.hintPanel.removeFromParent(); this.hintPanel.dispose(); }
    const lay = this.layout();
    const p = textPanel(lay === 'xr' ? (this.narrow ? 0.9 : 0.84) : this.bandWidth(lay), 0.07, [{ text: t(key), size: 'xr-text-md', weight: 'bold' }], { surface: { stroke: color('xr-parkour-hint'), strokeWidth: num('xr-border-width') * 1.5, stripe: false }, layout: { pad: 0.02 } });
    p.userData.noFit = true;
    // Above the course, never over the flight space (headset: where the fact card goes).
    const y = this.stage.position.y + this.viewTop();
    if (lay === 'xr') p.position.set(0, this.eye + 0.48 - p.h / 2, this.frontZ() + 0.05);
    else p.position.set(0, lay === 'land' ? y - 0.012 - p.h / 2 : y + 0.03 + p.h / 2, this.frontZ() + 0.03);
    this.group.add(p);
    this.popIn(p);
    this.hintPanel = p;
    this.delay(assist.easy ? 4.2 : 3.4, () => {
      if (this.hintPanel !== p) return;
      this.hintPanel = null;
      p.removeFromParent();
      p.dispose();
    });
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
    this.snow.density = (0.62 + 0.38 * storm) * (this.calm ? 0.5 : 1);
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
      // Sunlight through the windows: strong at noon, gone at night.
      this.office?.setDaylight(d.bottom, THREE.MathUtils.clamp((d.key - 0.85) / 0.55, 0, 1));
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
      else s.obj.userData.mat.emissiveIntensity = this.calm ? 1.1 : 0.8 + Math.random() * 0.6;
    }
    for (const b of this.bugs) {
      b.cy = b.y + b.amp * Math.sin((time * Math.PI * 2) / b.period + b.phase);
      b.obj.position.set(b.x + (!this.calm && Math.random() < 0.06 ? (Math.random() - 0.5) * 0.15 : 0), b.cy, 0);
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
    this.sparkFx.update(camX, half);
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
    // Untouchable for a moment: Echo blinks (with calm motion the shield's glow shows it instead).
    this.runner.update(dt, { state, vy: e.vy, look, blink: e.invuln > 0 && !this.calm });
    this.ring.group.position.set(e.x, e.y + 0.85, 0.35);
    const flying = this.mode === 'run' || this.mode === 'count';
    this.ring.set(flying ? this.shield : 0, flying && e.invuln > 0);
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
    this.engine.fitEnabled = true; // the browser view goes back to the engine
    this.engine.renderer.localClippingEnabled = false;
    this.night?.dispose(); // the city's shared materials back to day colors
    this.engine.onEmptyPress = null;
    window.removeEventListener('keydown', this.keydown);
    music.stop();
    this.card?.dispose();
    this.hintPanel?.dispose();
    this.look.dispose(); // tone mapping, environment, shadows, room lights back
    this.envTarget?.dispose();
    super.dispose();
  }
}
