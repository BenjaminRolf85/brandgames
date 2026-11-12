// "Pannenfrei" / "Puncture-Free" (game key 'bike'): a tire rally in real 3D. Echo rides a bike
// along a winding trail through four terrains (asphalt, gravel, forest mud, snow and ice); the
// player steers around glass, nails, thorns, potholes, roots and ice, collects stars, air
// cartridges and puncture protection. Before each section an AI terrain scanner (a drone) sweeps
// the trail with a scan beam, classifies the terrain from its sensor data with a confidence and
// recommends a tire profile and pressure. The player follows or overrules it; sometimes the
// data is unclear (fog, wet leaves, slush) and the AI is wrong. The right choice gives grip,
// speed and points; the wrong one slips, slows and punctures more easily. A flat tire means a
// short pumping break. A swallow flies ahead and shows the best line.
// Jumps: ramps (snow drifts) and obstacles across the trail (logs, branches, huge potholes) that
// only a jump clears; jumping right at a ramp's lip gives big air, holding the jump button does a
// wheelie, steering in the air a tilt; a clean landing gives points, a speed boost and a combo.
// Weather: mid-section the weather can turn (rain, frost, sun, thaw, or only fog); the scanner
// re-scans live with new sensor data and the player can take a quick pit stop (tire, pressure,
// pump) or ride on.
// In the headset the trail is a diorama at table height (steer with both hands like on a
// handlebar, or one hand); in the browser a chase camera follows the bike (keys, mouse, or on
// phones swiping and two big buttons).
import * as THREE from 'three';
import { BaseScene } from '../scene.js';
import { Panel, Button, textPanel, placeOnArc } from '../ui3d.js';
import { color, hex, num, font } from '../tokens.js';
import { t, getLang } from '../i18n.js';
import '../bike-text.js';
import { sfx } from '../sfx.js';
import { music } from '../music.js';
import { quality } from '../quality.js';
import { EVENT } from '../event.js';
import { radialTexture } from '../robot-visuals.js';
import { sceneLook, gfxTier } from '../gfx.js';
import { TIRES, PRESSURES, BEST, planScans, rate, sensorText, liveScan } from '../bike-ai.js';
import {
  makeCourse, makeTerrain, Scatter, makeSky, makeBase, makeScanFx, makeGuideDots, makeSnow, makeMist, makeSparks, makeCurtains, vergeHeight, FX_AREA, makeOutdoorEnv,
  HZ, ITEMS, RAMPS, RAMP_H, S0, STOP_GAP, HALF, EDGE,
} from '../bike-world.js';
import {
  loadBikeGLTF, loadWorldGLTF, loadJumpsGLTF, modelKit, BikeRig, EchoRider, SwallowGuide, ScanDrone, makeArch, pitSign, TIRE_NODES, TIRE_TOKENS,
} from '../bike-models.js';
import { makeWeatherLayer, makeRain, WEATHER_LOOK } from '../bike-weather.js';
import { makeTracks, makeSpeedLines } from '../bike-tracks.js';

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
const easeOut = (k) => 1 - (1 - k) ** 3;

const V_NOM = 5.3; // m/s at bike scale with a neutral choice
const SCAN_T = 2.2; // seconds of scanning
const CHOOSE_T = EVENT ? 8 : 10; // seconds to choose
const BRAKE = 5; // m/s^2
// Points (a perfect round stays below 5000): choices 4 x 200, overrule 150, stars 36 x 30,
// clean riding 4 x 150, time 700, jumps at most 900, pit stop at most 300, fog judged 60.
const STAR_PTS = 30;
const OVERRULE_PTS = 150;
const CLEAN_PTS = 150;
const TIME_PTS = 700;
const JUMP_CAP = 900;
const PIT_MAX = 300;
const FOG_PTS = 60;
const MAX_SCORE = 5000;
// Jumps (course units): gravity, a hop, a jump off a ramp's lip (perfect timing: big air).
const GRAVITY = 16;
const HOP = 4.3;
const RAMP_AUTO = 3.0;
const RAMP_JUMP = 5.0;
const RAMP_PERFECT = 7.2;
const CLEAR_Y = 0.32; // above this the bike clears hazards
const PIT_PUMPS = { low: 2, mid: 3, high: 4 };
const AIR_FLAT = 22; // below this the tire is flat
const WIN = { back: 1.6, frontXR: 11.2, side: 4.2, front: 32 }; // diorama window (course units)
const CHEVRON = 'M15 5l-7 7 7 7';
const PUMP_ICON = 'M8 4h8M12 4v5M10 9h4v10h-4zM6 20h12M14 13c3 0 5 1 5 4';
const TERRAIN_TOKEN = { asphalt: 'xr-bike-terrain-asphalt', gravel: 'xr-bike-terrain-gravel', mud: 'xr-bike-terrain-mud', snow: 'xr-bike-terrain-snow' };
const SKY = [1, 2, 3, 4].map((i) => [`xr-bike-sky-${i}-top`, `xr-bike-sky-${i}-low`]);

/** A canvas tile that is interactive (hover scale, disabled state); draw(ctx, panel, state). */
function iconTile(w, h, draw) {
  let hover = false;
  const p = new Panel(w, h, (ctx, c) => draw(ctx, c, { hover }));
  p.userData.interactive = true;
  p.userData.setHover = (v) => { hover = v; p.userData.hoverK = v ? num('xr-hover-scale') : 1; p.redraw(); };
  p.userData.hoverK = 1;
  return p;
}

/** The ground height under the bike (a ramp's slope, else 0). */
function ramp0(c, s, u) {
  const r = c.rampAt(s, u);
  return r ? RAMP_H * clamp((s - (r.s - 0.8)) / 1.6, 0, 1) : 0;
}

const fmtTime = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

export class BikeScene extends BaseScene {
  constructor(app) {
    super(app);
    this.gameKey = 'bike';
    this.S = num('xr-bike-scale');
    this.time = 0;
    this.mode = 'intro';
    this.scans = planScans(Math.random);
    this.course = makeCourse(Math.random);
    this.sB = S0 - STOP_GAP;
    this.u = 0;
    this.target = 0;
    this.latV = 0;
    this.speed = 0;
    this.air = 100;
    this.shields = 0;
    this.sec = 0;
    this.choice = { tire: 'allround', pressure: 'mid' };
    this.rating = rate('asphalt', 'allround', 'mid');
    this.y = 0; // the bike's height (jumps)
    this.vy = 0;
    this.inAir = false;
    this.pitch = 0;
    this.roll = 0;
    this.timeScale = 1;
    this.jumpHeld = false;
    this.keys = { left: false, right: false };
    this.btn = { left: false, right: false };
    this.inputMode = 'none';
    this.win = { ...this.windowTarget() };
    // Graphics tier: 'high' (desktop, Quest 3 with full effects), 'medium' (phones, Quest 3
    // lite, Quest 2), 'low' (lite elsewhere). Sharper textures, bigger shadow maps, more
    // particles and bloom (browser only) where the GPU can afford them.
    this.tier = gfxTier();
    this.envTarget = makeOutdoorEnv(this.engine.renderer);
    this.prevEnvironment = this.engine.scene.environment;
    // Filmic look: neutral tone mapping keeps the token colors but no longer blows out the
    // snow and the sunny gravel; the outdoor environment gives the PBR materials sky light.
    this.onSceneDispose(sceneLook(this.engine, { tone: 'neutral', exposure: 1.15, env: this.envTarget.texture, envIntensity: 0.9, shadows: quality.lite ? false : 'soft' }));
    // The engine's flat default lights give way to this scene's sun, sky fill and bounce.
    const eng = this.engine;
    const engSun = eng.scene.children.filter((o) => o.isDirectionalLight);
    const prevLights = { hemi: eng.hemi && [eng.hemi.intensity, eng.hemi.color.clone(), eng.hemi.groundColor.clone()], suns: engSun.map((l) => l.intensity) };
    if (eng.hemi) { eng.hemi.intensity = 0.95; eng.hemi.color.setHex(hex('xr-bike-fill-sky')); eng.hemi.groundColor.setHex(hex('xr-bike-fill-ground')); }
    engSun.forEach((l) => { l.intensity = 0; });
    this.onSceneDispose(() => {
      if (eng.hemi && prevLights.hemi) { eng.hemi.intensity = prevLights.hemi[0]; eng.hemi.color.copy(prevLights.hemi[1]); eng.hemi.groundColor.copy(prevLights.hemi[2]); }
      engSun.forEach((l, i) => { l.intensity = prevLights.suns[i]; });
    });
    this.prevBackdrop = this.engine.backdrop.visible;
    if (!this.engine.isXR) this.engine.backdrop.visible = false;
    this.prevFog = this.engine.scene.fog;
    this.buildStage();
    this.buildUI();
    this.setupInput();
    Promise.all([loadBikeGLTF(), loadWorldGLTF(), loadJumpsGLTF()])
      .then(([b, w, j]) => { if (!this.disposed) this.attachModels(b, w, j); })
      .catch((e) => console.warn('Bike models not loaded', e));
    this.onUpdate((dt) => this.update(dt));
    const hint = this.engine.isXR ? 'bikeIntroXR' : this.engine.touchUI ? 'bikeIntroTouch' : 'bikeIntroScreen';
    this.intro(t('bikeName'), `${t('bikeIntro')} ${t(hint)}`, () => this.start());
  }

  // ---------------------------------------------------------------- stage

  buildStage() {
    const S = this.S;
    const st = (this.stage = new THREE.Group());
    st.userData.noFit = true;
    this.group.add(st);
    this.placeStage();
    // Clipping planes (stage space, then world space every frame): the diorama window.
    this.clipLocal = [new THREE.Plane(new THREE.Vector3(0, 0, -1), 0), new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), new THREE.Plane(new THREE.Vector3(1, 0, 0), 0), new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0)];
    this.clip = this.clipLocal.map((p) => p.clone());
    // Particles (snow, rain, spray, speed lines) are also cut at the base's top in the headset.
    this.floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e4);
    this.clipFx = [...this.clip, this.floor];
    this.prevClipping = this.engine.renderer.localClippingEnabled;
    this.engine.renderer.localClippingEnabled = true;
    // Course group: course units, scaled down; moved so the bike stays at the stage origin.
    const cg = (this.cg = new THREE.Group());
    cg.scale.setScalar(S);
    cg.userData.noFit = true;
    st.add(cg);
    this.terrain = makeTerrain(this.course, this.clip, { res: this.tier === 'high' ? 2 : 1, aniso: { high: 8, medium: 4, low: 2 }[this.tier] });
    cg.add(this.terrain);
    this.fx = makeScanFx(this.course);
    cg.add(this.fx.group);
    this.dots = makeGuideDots();
    cg.add(this.dots);
    this.snow = makeSnow(this.course, { high: 340, medium: 260, low: 150 }[this.tier], this.clipFx);
    cg.add(this.snow);
    this.mist = makeMist();
    cg.add(this.mist);
    this.sparks = makeSparks(260, this.clipFx);
    cg.add(this.sparks);
    // Weather: the new ground per event (shown when it turns) and rain streaks.
    this.wLayers = this.course.weather.map((w) => {
      const layer = makeWeatherLayer(this.course, w, this.clip);
      if (layer) cg.add(layer);
      return layer;
    });
    this.rain = makeRain({ high: 400, medium: 320, low: 180 }[this.tier], this.clipFx);
    cg.add(this.rain);
    // Tire tracks (one recycled ribbon per wheel) and speed lines on fast descents.
    this.tracks = makeTracks(this.clip);
    cg.add(this.tracks.group);
    this.speedLines = makeSpeedLines(70, this.clipFx);
    cg.add(this.speedLines);
    // A soft shadow under the bike that stays on the ground: it shows the height of a jump.
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.9, 2, 8).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: radialTexture(), color: hex('xr-bike-hole'), transparent: true, opacity: 0.5, depthWrite: false }));
    this.blob.userData.noFit = true;
    this.blob.renderOrder = 1;
    cg.add(this.blob);
    // The diorama's earth base (headset; browser intro and results).
    const len0 = WIN.back * S;
    const len1 = -WIN.frontXR * S;
    this.base = makeBase(WIN.side * 2 * S, len0, len1, 0.07);
    st.add(this.base);
    // Its cut edges follow the hills (headset).
    this.curtains = makeCurtains(this.base.userData.earth);
    st.add(this.curtains);
    // Light: a key light with a shadow over the window around the bike, a cool rim light.
    this.keyBase = 2.3;
    const key = new THREE.DirectionalLight(hex('xr-bike-key-light'), this.keyBase);
    key.position.set(-0.55, 1.4, 0.5);
    key.target.position.set(0, 0, -0.55);
    const rim = new THREE.DirectionalLight(hex('xr-bike-sky-1-low'), 0.9);
    rim.position.set(0.6, 0.6, -1.6);
    rim.target = key.target;
    st.add(key, key.target, rim);
    this.key = key;
    if (!quality.lite) {
      key.castShadow = true;
      // One shadow-casting light; 2048 where the GPU can afford it, else 1024.
      const map = this.tier === 'high' ? 2048 : 1024;
      key.shadow.mapSize.set(map, map);
      Object.assign(key.shadow.camera, { left: -0.75, right: 0.75, top: 1.2, bottom: -1.0, near: 0.1, far: 3.2 });
      key.shadow.camera.updateProjectionMatrix();
      key.shadow.bias = -0.0015;
      key.shadow.normalBias = 0.02;
    }
    // Browser: a sky around the camera.
    if (!this.engine.isXR) {
      this.sky = makeSky();
      this.group.add(this.sky);
      this.skyTop = new THREE.Color(hex(SKY[0][0]));
      this.skyLow = new THREE.Color(hex(SKY[0][1]));
      this.sky.userData.setColors(this.skyTop, this.skyLow);
    }
    this.scatters = [];
  }

  placeStage() {
    // A landing gives the diorama a small bounce in the headset.
    const dip = this.engine.isXR ? (this.camDip ?? 0) * 0.008 : 0;
    this.stage.position.set(0, this.eye - num('xr-bike-table-drop') - dip, num('xr-bike-table-z'));
  }

  /** The diorama window: narrow in the headset (and in the browser's intro and results). */
  windowTarget() {
    const narrow = this.engine.isXR || this.mode === 'intro' || this.mode === 'over';
    return narrow ? { back: WIN.back, front: WIN.frontXR, side: WIN.side } : { back: 9, front: WIN.front, side: 40 };
  }

  attachModels(bGltf, wGltf, jGltf) {
    const B = modelKit(bGltf);
    const W = modelKit(wGltf, this.clip);
    const WU = modelKit(wGltf);
    const J = modelKit(jGltf, this.clip);
    this.kits = [B, W, WU, J];
    const partsOf = (n) => { const a = W.parts(n); return a.length ? a : J.parts(n); };
    const c = this.course;
    this.bike = new BikeRig(B);
    this.cg.add(this.bike.root);
    this.bike.setTire(this.choice.tire);
    this.rider = new EchoRider(this.bike.lean, B);
    this.swallow = new SwallowGuide(WU);
    this.swallow.root.scale.setScalar(1.5);
    this.cg.add(this.swallow.root);
    this.drone = new ScanDrone(WU);
    this.cg.add(this.drone.root);
    // Props, hazards and items: instanced, only around the bike.
    const lite = quality.lite;
    const groups = new Map();
    for (const p of c.props) { if (!groups.has(p.n)) groups.set(p.n, []); groups.get(p.n).push(p); }
    const big = new Set(['PrTree', 'PrPine', 'PrPineSnow', 'PrLamp', 'PrSnowman', 'PrHay', 'PrFence', 'PrBush', 'PrLantern', 'PrSign', 'PrStump', 'PrRock', 'PrRockSnow']);
    big.add('PitGantry');
    for (const [n, list] of groups) this.scatters.push(new Scatter(this.cg, partsOf(n), list, c, { shadow: !lite && big.has(n), ground: 'verge' }));
    this.hzScatters = Object.entries(HZ).map(([type, spec]) => new Scatter(this.cg, partsOf(spec.node), c.hazards.filter((h) => h.type === type), c, { shadow: !lite, tilt: true }));
    // Ramps: the course knows their middle; the model's lip is 0.8 ahead.
    for (const [kind, node] of Object.entries(RAMPS)) this.scatters.push(new Scatter(this.cg, partsOf(node), c.ramps.filter((r) => r.kind === kind), c, { shadow: !lite, tilt: true }));
    // The pit stop signs.
    this.pitSigns = c.weather.map((w) => {
      const sign = pitSign(t('bikePitSign'), this.clip);
      sign.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), c.yaw(w.pit + 1.6)).add(c.pointH(w.pit + 1.6, 0));
      sign.rotation.y = c.yaw(w.pit + 1.6);
      this.cg.add(sign);
      return sign;
    });
    const lift = { star: 0.62, cart: 0.55, shield: 0.66 };
    this.itemScatters = Object.entries(ITEMS).map(([type, node]) => new Scatter(this.cg, W.parts(node), c.items.filter((it) => it.type === type), c, { shadow: false, lift: lift[type] }));
    // The start and finish arches.
    this.arches = [[S0 - 0.8, t('bikeStart')], [c.finish, t('bikeFinish')]].map(([s, text]) => {
      const a = makeArch(W, text, this.clip);
      a.position.copy(c.pointH(s, 0));
      a.rotation.y = c.yaw(s);
      this.cg.add(a);
      return a;
    });
    // The floor pump for flat tires.
    this.pump = new THREE.Group();
    const pb = B.clone('PumpBody');
    const ph = B.clone('PumpHandle', true);
    if (pb) this.pump.add(pb);
    if (ph) this.pump.add(ph);
    this.pumpHandle = ph;
    this.pumpY = ph?.position.y ?? 0.585;
    this.pump.visible = false;
    this.cg.add(this.pump);
    // The big tire next to the choice console.
    this.tirePreview = new THREE.Group();
    this.tirePreview.userData.noFit = true;
    this.previewTires = {};
    for (const [k, node] of Object.entries(TIRE_NODES)) {
      const tire = B.clone(node);
      if (!tire) continue;
      tire.traverse((o) => { if (o.isMesh && o.material.name === 'BkTireAccent') o.material = this.bike.accents[k]; });
      const spin = new THREE.Group();
      spin.add(tire);
      spin.visible = false;
      this.tirePreview.add(spin);
      this.previewTires[k] = spin;
    }
    const rimNode = B.clone('BikeWheel');
    if (rimNode) { this.previewRim = new THREE.Group(); this.previewRim.add(rimNode); this.tirePreview.add(this.previewRim); }
    this.tirePreview.position.set(0.035, 0.055, 0.1);
    this.tirePreview.rotation.set(0.4, 1.05, 0, 'YXZ');
    this.tirePreview.scale.setScalar(0.47);
    this.tirePreview.traverse((o) => { o.userData.keepDepth = true; o.castShadow = false; });
    this.tireCard.add(this.tirePreview);
    this.ready = true;
  }

  // ---------------------------------------------------------------- UI

  buildUI() {
    const ui = (this.ui = new THREE.Group());
    ui.userData.noFit = true;
    this.group.add(ui);
    // The scan panel (full) and a compact one for narrow screens while choosing.
    this.scanPanel = new Panel(0.66, 0.6, (ctx, c) => this.drawScan(ctx, c, false));
    this.scanSmall = new Panel(0.66, 0.36, (ctx, c) => this.drawScan(ctx, c, true));
    this.chip = new Panel(0.52, 0.09, (ctx, c) => this.drawChip(ctx, c));
    this.gauge = new Panel(0.4, 0.21, (ctx, c) => this.drawGauge(ctx, c));
    for (const p of [this.scanPanel, this.scanSmall, this.chip, this.gauge]) { p.visible = false; p.userData.noFit = true; ui.add(p); }
    // The choice console: tires, pressure, ride off.
    const con = (this.console = new THREE.Group());
    con.userData.w = 0.68;
    con.userData.h = 0.62;
    con.visible = false;
    ui.add(con);
    this.header = new Panel(0.68, 0.11, (ctx, c) => this.drawHeader(ctx, c));
    this.header.position.y = 0.26;
    con.add(this.header);
    this.tireTiles = TIRES.map((k, i) => {
      const tile = iconTile(0.161, 0.2, (ctx, c, s) => this.drawTireTile(ctx, c, k, s, i));
      tile.userData.label = t(`bikeTire_${k}`);
      tile.userData.onClick = () => this.pickTire(k);
      tile.position.set(-0.2595 + i * 0.173, 0.085, 0);
      con.add(tile);
      return tile;
    });
    this.pressTiles = PRESSURES.map((k, i) => {
      const tile = iconTile(0.222, 0.105, (ctx, c, s) => this.drawPressTile(ctx, c, k, s, i));
      tile.userData.label = t(`bikePress_${k}`);
      tile.userData.onClick = () => this.pickPressure(k);
      tile.position.set(-0.229 + i * 0.229, -0.09, 0);
      con.add(tile);
      return tile;
    });
    this.goBtn = iconTile(0.68, 0.1, (ctx, c, s) => {
      // Choosing: ride off. Pit stop: pump (once a pressure is picked), with the progress.
      const pit = this.mode === 'pit';
      const ready = !pit || !!this.pitPress;
      c.surface({ fill: color(ready ? (s.hover ? 'xr-primary-hover' : 'xr-primary') : 'xr-button-bg'), stroke: color(ready ? 'xr-primary-hover' : 'xr-panel-border'), stripe: false });
      if (pit && ready) {
        const k = (this.pitPumps ?? 0) / PIT_PUMPS[this.pitPress];
        ctx.fillStyle = color('xr-success');
        ctx.globalAlpha = 0.55;
        ctx.fillRect(c.m(0.01), c.m(0.01), (c.canvas.width - c.m(0.02)) * k, c.canvas.height - c.m(0.02));
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = color(ready ? 'xr-on-primary' : 'xr-panel-muted');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = font('black', c.m(num(ready ? 'xr-text-lg' : 'xr-text-md')));
      const label = !pit ? t('bikeGo') : ready ? t('bikePitPump', { n: this.pitPumps ?? 0, total: PIT_PUMPS[this.pitPress] }) : t('bikePitPick');
      ctx.fillText(label, c.canvas.width / 2, c.canvas.height / 2, c.canvas.width - c.m(0.14));
      if (!this.engine.isXR && !this.engine.touchUI && ready) {
        ctx.font = font('bold', c.m(num('xr-text-min')) * 0.8);
        ctx.textAlign = 'right';
        ctx.globalAlpha = 0.75;
        ctx.fillText('Space', c.canvas.width - c.m(0.025), c.canvas.height / 2);
        ctx.globalAlpha = 1;
      }
    });
    this.goBtn.userData.label = t('bikeGo');
    this.goBtn.userData.onClick = () => { sfx.click(); if (this.mode === 'pit') this.pumpOnce(); else this.go(); };
    this.goBtn.position.set(0, -0.225, 0);
    con.add(this.goBtn);
    // A showcase card for the chosen tire (the 3D tire turns in front of it).
    this.tireCard = new Panel(0.4, 0.46, (ctx, c) => {
      const W = c.canvas.width;
      const H = c.canvas.height;
      const k = this.choice.tire;
      c.surface({ stroke: color(TIRE_TOKENS[k]), stripe: false });
      const g = ctx.createRadialGradient(W / 2, H * 0.4, 0, W / 2, H * 0.4, W * 0.5);
      g.addColorStop(0, color(TIRE_TOKENS[k]));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H * 0.8);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color(TIRE_TOKENS[k]);
      ctx.font = font('black', c.m(num('xr-text-md')));
      ctx.fillText(t(`bikeTire_${k}`), W / 2, H * 0.82, W - c.m(0.04));
      ctx.fillStyle = color('xr-panel-muted');
      ctx.font = font('regular', c.m(num('xr-text-min')));
      ctx.fillText(`${t(`bikeTireText_${k}`)} · ${t(`bikeBar_${this.choice.pressure}`)}`, W / 2, H * 0.92, W - c.m(0.04));
    });
    this.tireCard.material.transparent = false;
    this.tireCard.material.alphaTest = 0.5;
    this.tireCard.userData.keepDepth = true;
    this.tireCard.visible = false;
    ui.add(this.tireCard);
    // The live re-scan when the weather turns, with the pit stop button.
    this.livePanel = new Panel(0.66, 0.42, (ctx, c) => this.drawLive(ctx, c));
    this.livePanel.visible = false;
    this.livePanel.userData.noFit = true;
    ui.add(this.livePanel);
    const pitLabel = this.engine.isXR || this.engine.touchUI ? t('bikePitBtn') : `${t('bikePitBtn')} (${t('bikePitKey')})`;
    this.pitBtn = new Button(0.5, 0.12, { label: pitLabel, variant: 'sponsor', labelSize: 'xr-text-lg', onClick: () => this.requestPit() });
    this.pitBtn.visible = false;
    this.pitBtn.userData.noFit = true;
    ui.add(this.pitBtn);
    // The pump button (browser and headset; phones get a thumb button).
    this.pumpBtn = new Button(0.42, 0.13, { label: t('bikePump'), variant: 'primary', labelSize: 'xr-text-lg', onClick: () => this.pumpOnce() });
    this.pumpBtn.visible = false;
    this.pumpBtn.userData.noFit = true;
    ui.add(this.pumpBtn);
    ui.visible = false;
  }

  /** Thumb buttons on phones: steer (two layouts for portrait and landscape) and pump. */
  buildTouch() {
    if (!this.engine.touchUI || this.padPort) return;
    const left = { icon: 'back', label: t('bikeLeft'), group: 'left', onPress: () => { this.btn.left = true; this.inputMode = 'keys'; }, onRelease: () => { this.btn.left = false; } };
    const right = { icon: 'back', label: t('bikeRight'), group: 'right', onPress: () => { this.btn.right = true; this.inputMode = 'keys'; }, onRelease: () => { this.btn.right = false; } };
    const jump = { icon: 'flap', label: t('bikeJump'), group: 'right', primary: true, onPress: () => this.jumpPress(), onRelease: () => { this.jumpHeld = false; } };
    const lastPad = () => { const els = document.querySelectorAll('#stage .mtouch'); return els[els.length - 1]; };
    const setIcon = (el, i, d, mirror = false) => {
      const svg = el?.querySelectorAll('.mtouch__btn')[i]?.querySelector('svg');
      if (!svg) return;
      svg.innerHTML = '';
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      svg.appendChild(path);
      if (mirror) svg.style.transform = 'scaleX(-1)';
    };
    // Portrait: left, jump, right in a row. Landscape: left thumb steers left, the right thumb
    // has right and (wide, below) jump.
    this.padPort = this.touchButtons([left, jump, right]);
    const ep = lastPad();
    setIcon(ep, 0, CHEVRON);
    setIcon(ep, 2, CHEVRON, true);
    this.padLand = this.touchButtons([left, right, jump], { grid: true });
    const el = lastPad();
    setIcon(el, 0, CHEVRON);
    setIcon(el, 1, CHEVRON, true);
    this.pumpPad = this.touchButtons([{ icon: 'flap', label: t('bikePump'), primary: true, onPress: () => this.pumpOnce() }]);
    setIcon(lastPad(), 0, PUMP_ICON);
  }

  // ---------------------------------------------------------------- drawing

  terrainName(k) { return t(`bikeTerrain_${k}`); }

  drawScan(ctx, c, compact) {
    const W = c.canvas.width;
    const H = c.canvas.height;
    const scan = this.scans[this.sec];
    const prog = this.scanProg ?? 0;
    const done = prog >= 1;
    const warn = done && scan.tricky;
    c.surface({ stroke: color(warn ? 'xr-warning' : 'xr-bike-scan'), strokeWidth: num('xr-border-width') * 1.5 });
    const pad = c.m(0.03);
    let y = pad;
    const md = c.m(num('xr-text-md'));
    const sm = c.m(num('xr-text-sm'));
    const mn = c.m(num('xr-text-min'));
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    // title
    ctx.fillStyle = color('xr-bike-scan');
    ctx.font = font('black', md);
    ctx.fillText(t('bikeScanTitle'), pad, y, W * 0.62);
    ctx.textAlign = 'right';
    ctx.fillStyle = color('xr-panel-muted');
    ctx.font = font('bold', mn);
    ctx.fillText(t('bikeSection', { n: this.sec + 1 }), W - pad, y + (md - mn) * 0.6);
    y += md * 1.35;
    const sens = sensorText(scan.reading);
    const mm = sens.rough.toFixed(1);
    const vals = [[t('bikeRough'), scan.reading[0], `${getLang() === 'de' ? mm.replace('.', ',') : mm} mm`], [t('bikeWet'), scan.reading[1], `${sens.wet} %`], [t('bikeTemp'), scan.reading[2], `${sens.temp} °C`]];
    if (!compact) {
      ctx.textAlign = 'left';
      ctx.fillStyle = color('xr-panel-muted');
      ctx.font = font('bold', mn);
      ctx.fillText(t('bikeSensors'), pad, y);
      y += mn * 1.3;
      const k = clamp(prog * 1.6, 0, 1);
      for (const [label, v, text] of vals) {
        ctx.textAlign = 'left';
        ctx.fillStyle = color('xr-panel-text');
        ctx.font = font('regular', mn);
        ctx.fillText(label, pad, y, W * 0.3);
        const bx = pad + W * 0.3;
        const bw = W * 0.42;
        const bh = mn * 0.55;
        ctx.fillStyle = color('xr-button-bg');
        ctx.fillRect(bx, y + mn * 0.25, bw, bh);
        ctx.fillStyle = color('xr-accent');
        ctx.fillRect(bx, y + mn * 0.25, bw * v * k, bh);
        ctx.textAlign = 'right';
        ctx.font = font('bold', mn);
        ctx.fillText(k > 0.05 ? text : '…', W - pad, y);
        y += mn * 1.3;
      }
      y += mn * 0.3;
    } else {
      ctx.textAlign = 'left';
      ctx.fillStyle = color('xr-panel-muted');
      ctx.font = font('regular', mn);
      ctx.fillText(vals.map((x) => `${x[0]} ${x[2]}`).join(' · '), pad, y, W - pad * 2);
      y += mn * 1.45;
    }
    if (!done) {
      ctx.textAlign = 'left';
      ctx.fillStyle = color('xr-bike-scan');
      ctx.font = font('bold', sm);
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.time * 8);
      ctx.fillText(t('bikeScanning'), pad, y + sm * 0.4);
      ctx.globalAlpha = 1;
      return;
    }
    // classification bars
    ctx.textAlign = 'left';
    ctx.fillStyle = color('xr-panel-muted');
    ctx.font = font('bold', mn);
    if (!compact) { ctx.fillText(t('bikeClass'), pad, y); y += mn * 1.3; }
    const rows = compact ? scan.probs.slice(0, 2) : scan.probs;
    rows.forEach((r, i) => {
      const top = i === 0;
      ctx.textAlign = 'left';
      ctx.fillStyle = color(top ? TERRAIN_TOKEN[r.key] : 'xr-panel-muted');
      ctx.font = font(top ? 'black' : 'regular', top ? sm : mn);
      const rh = top ? sm : mn;
      ctx.fillText(this.terrainName(r.key), pad, y, W * 0.3);
      const bx = pad + W * 0.3;
      const bw = W * 0.42;
      ctx.fillStyle = color('xr-button-bg');
      ctx.fillRect(bx, y + rh * 0.2, bw, rh * 0.62);
      ctx.fillStyle = color(top ? (scan.tricky ? 'xr-warning' : 'xr-success') : 'xr-panel-muted');
      ctx.fillRect(bx, y + rh * 0.2, bw * r.p, rh * 0.62);
      ctx.textAlign = 'right';
      ctx.fillStyle = color(top ? 'xr-panel-text' : 'xr-panel-muted');
      ctx.fillText(`${Math.round(r.p * 100)} %`, W - pad, y);
      y += rh * 1.28;
    });
    // recommendation
    y += mn * 0.25;
    const rec = BEST[scan.top];
    ctx.fillStyle = color('xr-panel-muted');
    ctx.font = font('bold', mn);
    ctx.textAlign = 'left';
    const label = `${t('bikeRecommend')}:`;
    ctx.fillText(label, pad, y);
    const lx = pad + ctx.measureText(label).width + c.m(0.012);
    ctx.fillStyle = color(TIRE_TOKENS[rec.tire]);
    ctx.font = font('black', sm);
    ctx.fillText(t('bikeRecLine', { tire: t(`bikeTire_${rec.tire}`), press: t(`bikePress_${rec.pressure}`) }), lx, y - (sm - mn) * 0.4, W - pad - lx);
    y += sm * 1.35;
    // certainty
    ctx.font = font('bold', mn);
    ctx.fillStyle = color(scan.tricky ? 'xr-warning' : 'xr-success');
    const msg = scan.tricky ? t('bikeUnsure', { why: t(`bikeWhy_${scan.why}`) }) : `${t('bikeSure')} · ${scan.conf} %`;
    this.wrapText(ctx, msg, pad, y, W - pad * 2, mn * 1.2, 2);
  }

  wrapText(ctx, text, x, y, maxW, lh, maxLines = 3) {
    const words = text.split(' ');
    let line = '';
    let n = 0;
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, y + n * lh);
        n += 1;
        line = w;
        if (n >= maxLines) return;
      } else line = test;
    }
    if (line) ctx.fillText(line, x, y + n * lh);
  }

  drawChip(ctx, c) {
    const W = c.canvas.width;
    const H = c.canvas.height;
    const scan = this.scans[this.sec];
    const st = this.chipState ?? 'ai';
    const tok = st === 'live' ? 'xr-bike-live' : st === 'right' ? 'xr-success' : st === 'wrong' ? 'xr-warning' : scan.tricky ? 'xr-warning' : 'xr-bike-scan';
    c.surface({ stroke: color(tok), strokeWidth: num('xr-border-width') * 1.5, stripe: false });
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const mn = c.m(num('xr-text-sm'));
    ctx.font = font('black', mn);
    ctx.fillStyle = color(tok);
    const text = st === 'live' ? t('bikeLiveChip', { terrain: this.terrainName(this.live.top), conf: this.live.conf }) : st === 'right' ? t('bikeChipAIRight') : st === 'wrong' ? t('bikeChipAIWrong', { terrain: this.terrainName(scan.terrain) }) : t('bikeChipAI', { terrain: this.terrainName(scan.top), conf: scan.conf });
    // a small check mark or cross after the reveal
    if (st === 'right' || st === 'wrong') {
      ctx.strokeStyle = color(tok);
      ctx.lineWidth = c.m(0.007);
      ctx.lineCap = 'round';
      ctx.beginPath();
      const x = c.m(0.04);
      const y = H / 2;
      const r = c.m(0.016);
      if (st === 'right') { ctx.moveTo(x - r, y); ctx.lineTo(x - r * 0.2, y + r * 0.8); ctx.lineTo(x + r, y - r * 0.9); } else { ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); }
      ctx.stroke();
    }
    ctx.fillText(text, c.m(st === 'right' || st === 'wrong' ? 0.075 : 0.03), H / 2, W - c.m(0.1));
  }

  /** The live re-scan: new sensor data (before -> now), the new class and the recommendation. */
  drawLive(ctx, c) {
    const W = c.canvas.width;
    const live = this.live;
    const ev = this.wEv;
    if (!live || !ev) return;
    const unsure = !ev.to;
    c.surface({ stroke: color(unsure ? 'xr-warning' : 'xr-bike-live'), strokeWidth: num('xr-border-width') * 1.6 });
    const pad = c.m(0.03);
    const md = c.m(num('xr-text-md'));
    const sm = c.m(num('xr-text-sm'));
    const mn = c.m(num('xr-text-min'));
    let y = pad;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = color('xr-bike-live');
    ctx.font = font('black', md);
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(this.time * 6);
    ctx.fillText(t('bikeLiveTitle'), pad, y, W - pad * 2);
    ctx.globalAlpha = 1;
    y += md * 1.3;
    // sensor values, before -> now
    const a = sensorText(live.before);
    const b = sensorText(live.reading);
    const dec = (v) => (getLang() === 'de' ? v.toFixed(1).replace('.', ',') : v.toFixed(1));
    const rows = [[t('bikeRough'), `${dec(a.rough)} mm`, `${dec(b.rough)} mm`], [t('bikeWet'), `${a.wet} %`, `${b.wet} %`], [t('bikeTemp'), `${a.temp} °C`, `${b.temp} °C`]];
    ctx.font = font('regular', mn);
    for (const [label, from, to] of rows) {
      ctx.textAlign = 'left';
      ctx.fillStyle = color('xr-panel-muted');
      ctx.fillText(label, pad, y, W * 0.32);
      ctx.fillText(from, pad + W * 0.34, y, W * 0.2);
      ctx.fillStyle = color('xr-panel-text');
      ctx.fillText('→', pad + W * 0.55, y);
      ctx.font = font('bold', mn);
      ctx.textAlign = 'right';
      ctx.fillText(to, W - pad, y);
      ctx.font = font('regular', mn);
      y += mn * 1.25;
    }
    y += mn * 0.2;
    // the new class
    const top = live.probs[0];
    ctx.textAlign = 'left';
    ctx.font = font('black', sm);
    ctx.fillStyle = color(TERRAIN_TOKEN[top.key]);
    ctx.fillText(this.terrainName(top.key), pad, y, W * 0.3);
    const bx = pad + W * 0.32;
    const bw = W * 0.4;
    ctx.fillStyle = color('xr-button-bg');
    ctx.fillRect(bx, y + sm * 0.2, bw, sm * 0.62);
    ctx.fillStyle = color(unsure ? 'xr-warning' : 'xr-bike-live');
    ctx.fillRect(bx, y + sm * 0.2, bw * top.p, sm * 0.62);
    ctx.textAlign = 'right';
    ctx.fillStyle = color('xr-panel-text');
    ctx.fillText(`${live.conf} %`, W - pad, y);
    y += sm * 1.35;
    ctx.textAlign = 'left';
    ctx.font = font('bold', mn);
    ctx.fillStyle = color(unsure ? 'xr-warning' : 'xr-panel-text');
    ctx.fillText(t('bikeLiveLine', { what: t(`bikeLiveWhat_${ev.kind}`), conf: live.conf }), pad, y, W - pad * 2);
    y += mn * 1.3;
    const rec = BEST[live.top];
    ctx.fillStyle = color(TIRE_TOKENS[rec.tire]);
    ctx.fillText(t('bikeLiveRec', { tire: t(`bikeTire_${rec.tire}`), press: t(`bikePress_${rec.pressure}`) }), pad, y, W - pad * 2);
  }

  drawGauge(ctx, c) {
    const W = c.canvas.width;
    const H = c.canvas.height;
    c.surface({ stripe: false });
    const air = clamp(this.air, 0, 100);
    // manometer
    const cx = c.m(0.085);
    const cy = H * 0.62;
    const r = c.m(0.058);
    const a0 = Math.PI * 0.85;
    const a1 = Math.PI * 2.15;
    const segs = [['xr-danger', 0, 0.25], ['xr-warning', 0.25, 0.55], ['xr-success', 0.55, 1]];
    ctx.lineWidth = c.m(0.014);
    for (const [tok, f0, f1] of segs) {
      ctx.strokeStyle = color(tok);
      ctx.beginPath();
      ctx.arc(cx, cy, r, a0 + (a1 - a0) * f0, a0 + (a1 - a0) * f1);
      ctx.stroke();
    }
    const an = a0 + (a1 - a0) * (air / 100) + (this.mode === 'ride' && this.wobble > 0 ? Math.sin(this.time * 40) * 0.05 : 0);
    ctx.strokeStyle = color('xr-panel-text');
    ctx.lineWidth = c.m(0.006);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(an) * r * 0.9, cy + Math.sin(an) * r * 0.9);
    ctx.stroke();
    ctx.fillStyle = color('xr-panel-text');
    ctx.beginPath();
    ctx.arc(cx, cy, c.m(0.008), 0, Math.PI * 2);
    ctx.fill();
    // texts
    const x = c.m(0.17);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = font('black', c.m(num('xr-text-md')));
    ctx.fillStyle = color(air < 40 ? 'xr-danger' : 'xr-panel-text');
    ctx.fillText(`${t('bikeAir')} ${Math.round(air)} %`, x, c.m(0.02), W - x - c.m(0.015));
    ctx.font = font('bold', c.m(num('xr-text-min')));
    ctx.fillStyle = color(TIRE_TOKENS[this.choice.tire]);
    ctx.fillText(`${t(`bikeTire_${this.choice.tire}`)} · ${t(`bikeBar_${this.choice.pressure}`)}`, x, c.m(0.072), W - x - c.m(0.015));
    // shields: three glowing pips
    ctx.fillStyle = color('xr-panel-muted');
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.lineWidth = c.m(0.005);
      ctx.strokeStyle = color(i < this.shields ? 'xr-bike-band' : 'xr-button-bg');
      ctx.arc(x + c.m(0.016) + i * c.m(0.04), c.m(0.132), c.m(0.012), 0, Math.PI * 2);
      ctx.stroke();
    }
    if ((this.combo ?? 0) > 1) {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color('xr-bike-combo');
      ctx.font = font('black', c.m(num('xr-text-min')));
      ctx.fillText(t('bikeCombo', { n: this.combo }), x, c.m(0.178), W - x - c.m(0.015));
    }
  }

  drawHeader(ctx, c) {
    const W = c.canvas.width;
    const H = c.canvas.height;
    c.surface({ stripe: false });
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = color('xr-panel-text');
    ctx.font = font('black', c.m(num('xr-text-md')));
    const pit = this.mode === 'pit';
    if (pit) ctx.fillStyle = color('xr-bike-pit-glow');
    ctx.fillText(t(pit ? 'bikePitTitle' : 'bikeChoose'), c.m(0.025), H * 0.32, W * 0.6);
    ctx.fillStyle = color('xr-panel-muted');
    ctx.font = font('regular', c.m(num('xr-text-min')));
    ctx.fillText(t(pit ? 'bikePitHint' : 'bikeChooseHint'), c.m(0.025), H * 0.72, W - c.m(0.13));
    if (pit) {
      // a stopwatch, running
      ctx.textAlign = 'right';
      ctx.fillStyle = color('xr-bike-pit-glow');
      ctx.font = font('black', c.m(num('xr-text-md')));
      ctx.fillText(`${(this.phaseT ?? 0).toFixed(1)} s`, W - c.m(0.025), H / 2);
      return;
    }
    // countdown ring
    const left = Math.max(0, CHOOSE_T - (this.phaseT ?? 0));
    const cx = W - c.m(0.045);
    const cy = H / 2;
    const r = c.m(0.035);
    ctx.lineWidth = c.m(0.007);
    ctx.strokeStyle = color('xr-button-bg');
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = color(left < 4 ? 'xr-warning' : 'xr-accent');
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * left) / CHOOSE_T);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = color('xr-panel-text');
    ctx.font = font('black', c.m(num('xr-text-min')));
    ctx.fillText(String(Math.ceil(left)), cx, cy);
  }

  /** The tread of a tire seen from above, drawn into a box. */
  drawTread(ctx, kind, x, y, w, h) {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, w * 0.4);
    ctx.fillStyle = color('xr-bike-tread');
    ctx.fill();
    ctx.clip();
    ctx.fillStyle = color('xr-bike-tread-light');
    const cx = x + w / 2;
    if (kind === 'slick') {
      ctx.fillRect(cx - w * 0.03, y, w * 0.06, h);
      for (let yy = y; yy < y + h; yy += h / 10) { ctx.fillRect(x + w * 0.08, yy, w * 0.08, h / 30); ctx.fillRect(x + w * 0.84, yy, w * 0.08, h / 30); }
    } else if (kind === 'allround') {
      ctx.strokeStyle = color('xr-bike-tread-light');
      ctx.lineWidth = w * 0.09;
      for (let yy = y; yy < y + h; yy += h / 9) {
        ctx.beginPath();
        ctx.moveTo(cx - w * 0.22, yy + h / 22);
        ctx.lineTo(cx, yy);
        ctx.lineTo(cx + w * 0.22, yy + h / 22);
        ctx.stroke();
        ctx.fillRect(x + w * 0.06, yy + h / 18, w * 0.13, h / 22);
        ctx.fillRect(x + w * 0.81, yy + h / 18, w * 0.13, h / 22);
      }
    } else if (kind === 'knobby') {
      let k = 0;
      for (let yy = y; yy < y + h; yy += h / 7, k++) {
        if (k % 2) { ctx.fillRect(cx - w * 0.3, yy, w * 0.22, h / 11); ctx.fillRect(cx + w * 0.08, yy, w * 0.22, h / 11); } else ctx.fillRect(cx - w * 0.13, yy, w * 0.26, h / 10);
        ctx.fillRect(x + w * 0.02, yy + h / 14, w * 0.12, h / 12);
        ctx.fillRect(x + w * 0.86, yy + h / 14, w * 0.12, h / 12);
      }
    } else {
      let k = 0;
      for (let yy = y; yy < y + h; yy += h / 8, k++) {
        const bx = k % 2 ? cx + w * 0.05 : cx - w * 0.27;
        ctx.fillStyle = color('xr-bike-tread-light');
        ctx.fillRect(bx, yy, w * 0.22, h / 13);
        ctx.fillStyle = color('xr-bike-stud');
        ctx.beginPath();
        ctx.arc(bx + w * 0.11, yy + h / 26, w * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  /** The AI's current recommendation (the section scan, or the live re-scan in the pit). */
  aiPick() {
    if (this.mode === 'pit' && this.live) return BEST[this.live.top];
    if (this.mode === 'choose') return BEST[this.scans[this.sec].top];
    return null;
  }

  aiBadge(ctx, c, x, y) {
    const txt = t('bikeAIPick');
    ctx.font = font('black', c.m(num('xr-text-min')) * 0.78);
    const w = ctx.measureText(txt).width + c.m(0.016);
    const h = c.m(0.028);
    ctx.fillStyle = color(this.mode === 'pit' ? 'xr-bike-live' : this.scans[this.sec].tricky ? 'xr-warning' : 'xr-bike-scan');
    ctx.beginPath();
    ctx.roundRect(x - w, y, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = color('xr-bike-arch-banner');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(txt, x - w / 2, y + h / 2 + 1);
  }

  drawTireTile(ctx, c, kind, s, i) {
    const sel = this.choice.tire === kind;
    const tok = TIRE_TOKENS[kind];
    c.surface({ fill: color(s.hover || sel ? 'xr-button-hover' : 'xr-button-bg'), stroke: color(sel ? tok : 'xr-panel-border'), strokeWidth: num('xr-border-width') * (sel ? 2.4 : 1), stripe: false });
    const W = c.canvas.width;
    const H = c.canvas.height;
    this.drawTread(ctx, kind, W * 0.34, c.m(0.016), W * 0.32, H * 0.42);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color(sel ? tok : 'xr-button-text');
    let px = c.m(num('xr-text-sm'));
    const label = t(`bikeTire_${kind}`);
    do { ctx.font = font('black', px); px -= 1; } while (ctx.measureText(label).width > W - c.m(0.014) && px > c.m(0.022));
    ctx.fillText(label, W / 2, H * 0.62);
    ctx.fillStyle = color('xr-panel-muted');
    px = c.m(num('xr-text-min')) * 0.74;
    const sub = t(`bikeTireText_${kind}`);
    do { ctx.font = font('regular', px); px -= 1; } while (ctx.measureText(sub).width > W - c.m(0.012) && px > 8);
    ctx.fillText(sub, W / 2, H * 0.83);
    if (this.aiPick()?.tire === kind) this.aiBadge(ctx, c, W - c.m(0.008), c.m(0.008));
    if (!this.engine.isXR && !this.engine.touchUI) {
      ctx.font = font('bold', c.m(num('xr-text-min')) * 0.7);
      ctx.fillStyle = color('xr-panel-muted');
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(String(i + 1), c.m(0.01), c.m(0.008));
    }
  }

  drawPressTile(ctx, c, kind, s, i) {
    const sel = this.mode === 'pit' ? this.pitPress === kind : this.choice.pressure === kind;
    c.surface({ fill: color(s.hover || sel ? 'xr-button-hover' : 'xr-button-bg'), stroke: color(sel ? 'xr-accent' : 'xr-panel-border'), strokeWidth: num('xr-border-width') * (sel ? 2.4 : 1), stripe: false });
    const W = c.canvas.width;
    const H = c.canvas.height;
    // a small gauge
    const cx = c.m(0.045);
    const cy = H * 0.58;
    const r = c.m(0.026);
    ctx.lineWidth = c.m(0.006);
    ctx.strokeStyle = color('xr-panel-muted');
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI, Math.PI * 2);
    ctx.stroke();
    const a = Math.PI + Math.PI * (0.18 + i * 0.32);
    ctx.strokeStyle = color(sel ? 'xr-accent' : 'xr-panel-text');
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color(sel ? 'xr-accent' : 'xr-button-text');
    ctx.font = font('black', c.m(num('xr-text-sm')));
    ctx.fillText(t(`bikePress_${kind}`), c.m(0.085), H * 0.36, W - c.m(0.09));
    ctx.fillStyle = color('xr-panel-muted');
    ctx.font = font('regular', c.m(num('xr-text-min')) * 0.8);
    ctx.fillText(t(`bikeBar_${kind}`), c.m(0.085), H * 0.72, W - c.m(0.09));
    if (this.aiPick()?.pressure === kind) this.aiBadge(ctx, c, W - c.m(0.008), c.m(0.008));
    if (!this.engine.isXR && !this.engine.touchUI) {
      ctx.font = font('bold', c.m(num('xr-text-min')) * 0.7);
      ctx.fillStyle = color('xr-panel-muted');
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillText(String(i + 5), W - c.m(0.012), H - c.m(0.006));
    }
  }

  redrawConsole() {
    this.header.redraw();
    this.tireTiles.forEach((p) => p.redraw());
    this.pressTiles.forEach((p) => p.redraw());
  }

  // ---------------------------------------------------------------- input

  setupInput() {
    const down = (e) => {
      if (this.mode === 'intro' || this.mode === 'over') return;
      const c = e.code;
      if (c === 'ArrowLeft' || c === 'KeyA') { this.keys.left = true; this.inputMode = 'keys'; e.preventDefault(); }
      else if (c === 'ArrowRight' || c === 'KeyD') { this.keys.right = true; this.inputMode = 'keys'; e.preventDefault(); }
      else if (/^Digit[1-4]$/.test(c)) this.pickTire(TIRES[Number(c[5]) - 1]);
      else if (/^Digit[5-7]$/.test(c)) this.pickPressure(PRESSURES[Number(c[5]) - 5]);
      else if (c === 'KeyB') this.requestPit();
      else if (c === 'Space' || c === 'Enter' || c === 'NumpadEnter') {
        e.preventDefault();
        if (e.repeat) return;
        if (this.mode === 'choose') this.go();
        else if (this.mode === 'flat' || this.mode === 'pit') this.pumpOnce();
        else if (c === 'Space') this.jumpPress();
        else this.requestPit();
      }
    };
    const up = (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.keys.left = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.keys.right = false;
      if (e.code === 'Space') this.jumpHeld = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    this.onSceneDispose(() => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); });
    // Phones: swipe anywhere to steer (relative, so the finger never covers the bike).
    this.swipe = this.dragPad({
      hint: false,
      enabled: () => this.mode === 'ride' || this.mode === 'brake',
      onStart: () => { this.dragFrom = this.target; },
      onMove: (dx) => {
        const k = (2 * EDGE) / (Math.min(window.innerWidth, window.innerHeight * 1.2) * 0.8);
        this.target = clamp(this.dragFrom + dx * k, -EDGE + 0.1, EDGE - 0.1);
        this.inputMode = 'drag';
      },
    });
    // Headset: the trigger (or a pinch) pumps, and jumps while riding.
    this.engine.onEmptyPress = () => {
      if (this.mode === 'flat' || this.mode === 'pit') this.pumpOnce();
      else if (this.mode === 'ride' || this.mode === 'brake') this.jumpPress();
    };
  }

  /** Jump: pressed now (held for a wheelie in the air). */
  jumpPress() {
    if (this.mode !== 'ride' && this.mode !== 'brake') return;
    this.jumpHeld = true;
    this.jumpQueued = 0.15; // a press shortly before landing still counts
  }

  /**
   * Headset: a quick jerk of both hands upwards jumps; hands held high (or a trigger held) keep
   * the wheelie going.
   */
  readXRJump(dt) {
    const e = this.engine;
    if (!e.isXR) return;
    const hands = e.pointers.filter((p) => p.kind === 'xr' && p.active && p.controller);
    this.handY ??= new Map();
    let up = 0;
    let high = 0;
    const head = e.head.pos;
    let trigger = false;
    for (const p of hands) {
      const y = new THREE.Vector3().setFromMatrixPosition(p.controller.matrixWorld).y;
      const prev = this.handY.get(p);
      this.handY.set(p, y);
      if (prev !== undefined && (y - prev) / Math.max(dt, 1e-3) > 1.3) up += 1;
      if (y > head.y - 0.12) high += 1;
      if (p.source?.gamepad?.buttons?.[0]?.pressed) trigger = true;
    }
    if (up >= 2 && !this.xrJumpLock) { this.jumpPress(); this.xrJumpLock = 0.4; }
    this.xrJumpLock = Math.max(0, (this.xrJumpLock ?? 0) - dt) || 0;
    if (this.inAir) this.jumpHeld = trigger || high >= 2;
  }

  setRays(visible) {
    for (const p of this.engine.pointers) if (p.line) p.line.visible = visible && p.source?.targetRayMode !== 'screen';
  }

  /** Headset: both hands like a handlebar (move sideways or tilt), or one hand. */
  readXR() {
    const e = this.engine;
    if (!e.isXR) return null;
    const hands = e.pointers.filter((p) => p.kind === 'xr' && p.active && p.controller && p.source?.targetRayMode === 'tracked-pointer');
    if (!hands.length) return null;
    const head = this.group.worldToLocal(e.head.pos.clone());
    const pos = hands.map((p) => ({ p, v: this.group.worldToLocal(new THREE.Vector3().setFromMatrixPosition(p.controller.matrixWorld)) }));
    if (pos.length >= 2) {
      pos.sort((a, b) => a.v.x - b.v.x);
      const mid = (pos[0].v.x + pos[1].v.x) / 2 - head.x;
      const tilt = pos[0].v.y - pos[1].v.y; // left hand higher: steer right
      this.xrRef = null;
      return clamp(mid * 9 + tilt * 8, -EDGE + 0.1, EDGE - 0.1);
    }
    const x = pos[0].v.x;
    this.xrRef ??= x;
    return clamp((x - this.xrRef) * 9, -EDGE + 0.1, EDGE - 0.1);
  }

  /** Browser with a mouse: moving it left or right steers (relative, like a trackpad). */
  readMouse() {
    const e = this.engine;
    const m = e.mouse;
    if (e.isXR || e.touchUI || !m?.active) { this.lastNdc = null; return null; }
    const dx = this.lastNdc ? m.ndc.x - this.lastNdc.x : 0;
    this.lastNdc = (this.lastNdc ?? new THREE.Vector2()).copy(m.ndc);
    if (Math.abs(dx) < 1e-5) return null;
    this.inputMode = 'mouse';
    return clamp(this.target + dx * 1.6 * EDGE, -EDGE + 0.1, EDGE - 0.1);
  }

  // ---------------------------------------------------------------- flow

  start() {
    this.clearLayer();
    if (!this.refreshHud) {
      const before = new Set(this.group.children);
      this.refreshHud = this.hud(() => this.hudText());
      this.hudObjs = this.group.children.filter((o) => !before.has(o));
      if (!this.engine.isXR && !this.engine.touchUI) this.hudObjs.forEach((o) => this.ui.add(o));
    }
    this.buildTouch();
    this.app.echo?.suppress(true);
    this.startMusic(1, 'bike');
    Object.assign(this, {
      sB: S0 - STOP_GAP, u: 0, target: 0, latV: 0, speed: 0, air: 100, shields: 0, rideT: 0,
      pts: { choice: 0, overrule: 0, stars: 0, clean: 0, time: 0, jumps: 0, pit: 0, fog: 0 }, starsTaken: 0, flats: 0, punctures: 0,
      hzIdx: 0, itIdx: 0, choices: [], secStats: [], wobble: 0, slowT: 0, slipT: 0, slipV: 0, mudT: 0, gripSlip: 0,
      y: 0, vy: 0, inAir: false, pitch: 0, roll: 0, combo: 0, bestCombo: 0, jumps: 0, cleanJumps: 0, crashes: 0, boostT: 0, camDip: 0,
      timeScale: 1, jumpQueued: 0, jumpHeld: false, hints: {}, wEv: null, live: null, terrainNow: null, pitPress: null, pitPumps: 0,
      weatherLog: [],
    });
    this.course.hazards.forEach((h) => { h.hit = false; h.passed = false; h.hidden = h.weather !== undefined; });
    this.course.items.forEach((it) => { it.taken = false; it.hidden = false; });
    this.course.weather.forEach((w) => Object.assign(w, { triggered: false, applied: false, decided: false, pitted: false }));
    this.hzScatters?.forEach((sc) => { sc.dirty = true; });
    this.itemScatters?.forEach((sc) => { sc.dirty = true; });
    this.ui.visible = true;
    this.beginScan(0);
  }

  hudText() {
    const n = Math.min(4, (this.sec ?? 0) + 1);
    const text = t('bikeHud', { name: t('bikeName'), n, time: fmtTime(this.rideT ?? 0), score: this.liveScore() });
    // Phones: the bar is narrow, the game's name is known.
    return this.engine.touchUI ? text.slice(text.indexOf('·') + 1).trim() : text;
  }

  liveScore() {
    const p = this.pts;
    if (!p) return 0;
    return Math.min(MAX_SCORE, Math.round(p.choice + p.overrule + p.stars + p.clean + p.time + p.jumps + p.pit + p.fog));
  }

  beginScan(i) {
    this.sec = i;
    this.mode = 'scan';
    this.phaseT = 0;
    this.scanProg = 0;
    this.chipState = 'ai';
    const sec = this.course.sections[i];
    this.fx.grid(sec.b0 + 0.3, sec.b0 + 9.6);
    this.scanArea = sec.b0;
    const scan = this.scans[i];
    this.mistOn = scan.why === 'fog' || scan.why === 'dust';
    if (this.mistOn) this.mist.userData.place(this.course, sec.b0, scan.why === 'dust' ? 'xr-bike-gravel-light' : 'xr-bike-fog-mist');
    this.choice = { tire: BEST[scan.top].tire, pressure: BEST[scan.top].pressure };
    this.terrainNow = scan.terrain;
    this.wEv = null;
    this.setRays(true);
    this.rider?.mood('focus', 3);
    this.scanPanel.redraw();
    this.scanSmall.redraw();
    this.pop(this.scanPanel);
    this.pop(this.scanSmall);
    sfx.scan?.();
    this.refreshHud?.();
    if (i > 0) this.toast(t('bikeSectionDone', { n: i }), null, 'xr-success');
  }

  beginChoose() {
    this.mode = 'choose';
    this.phaseT = 0;
    this.scanProg = 1;
    this.scanPanel.redraw();
    this.scanSmall.redraw();
    this.bike?.setTire(this.choice.tire);
    this.redrawConsole();
    this.tireCard.redraw();
    this.pop(this.console);
    this.pop(this.tireCard);
    sfx.appear();
    this.rider?.mood('happy', 1);
  }

  pickTire(k) {
    if (this.mode !== 'choose' && this.mode !== 'pit') return;
    if (this.mode === 'pit' && k !== this.choice.tire) this.spark(this.sB, this.u + 0.4, 0.4, TIRE_TOKENS[k], 10, 1.8);
    this.choice.tire = k;
    this.bike?.setTire(k);
    sfx.click();
    this.redrawConsole();
    this.gauge.redraw();
    this.tireCard.redraw();
  }

  pickPressure(k) {
    if (this.mode !== 'choose' && this.mode !== 'pit') return;
    this.choice.pressure = k;
    if (this.mode === 'pit') { this.pitPress = k; this.pitPumps = 0; this.goBtn.redraw(); }
    sfx.tick();
    this.redrawConsole();
    this.gauge.redraw();
    this.tireCard.redraw();
  }

  /** Ride off with the chosen tire and pressure. */
  go() {
    if (this.mode !== 'choose') return;
    const i = this.sec;
    const scan = this.scans[i];
    const terrain = scan.terrain;
    const r = (this.rating = rate(terrain, this.choice.tire, this.choice.pressure));
    const aiTire = BEST[scan.top].tire;
    const overruled = scan.tricky === 'wrong' && r.tireOk && this.choice.tire !== aiTire;
    this.choices[i] = { ...this.choice, terrain, rating: r, followed: this.choice.tire === aiTire, overruled, scan };
    this.pts.choice += r.points;
    if (overruled) this.pts.overrule += OVERRULE_PTS;
    this.secStats[i] = { ride: 0, off: 0, hits: 0 };
    this.mode = 'ride';
    this.phaseT = 0;
    this.revealed = false;
    this.target = this.u;
    this.setRays(false);
    this.xrRef = null;
    this.bike?.setTire(this.choice.tire);
    this.gauge.redraw();
    this.chip.redraw();
    this.pop(this.chip);
    this.pop(this.gauge);
    sfx.whoosh();
    const name = t(`bikeTire_${this.choice.tire}`);
    const grip = r.grip >= 0.95 ? 'good' : r.grip >= 0.7 ? 'ok' : 'bad';
    const sub = r.tooHard ? t('bikePressHard') : r.tooSoft ? t('bikePressSoft') : null;
    this.toast(t(`bikeGrip_${grip}`, { tire: name, terrain: this.terrainName(terrain) }), sub, grip === 'good' ? 'xr-success' : grip === 'ok' ? 'xr-warning' : 'xr-danger', 2.4);
    if (i === 0) this.delay(2.6, () => { if (!this.disposed && this.mode === 'ride' && this.sec === 0) this.toast(t('bikeSwallowHint'), null, 'xr-bike-guide', 2.6); });
    this.rider?.mood(grip === 'bad' ? 'surprised' : 'happy', 1.2);
    music.intensity = i === 3 ? 2 : 1;
    this.refreshHud?.();
  }

  /** After a few seconds on the new ground: was the AI right? */
  reveal() {
    this.revealed = true;
    const c = this.choices[this.sec];
    const scan = c.scan;
    const right = scan.top === scan.terrain;
    this.chipState = right ? 'right' : 'wrong';
    this.chip.redraw();
    if (!right) {
      if (c.overruled) { this.toast(t('bikeOverrule', { n: OVERRULE_PTS }), t('bikeAIWrong', { terrain: this.terrainName(scan.terrain) }), 'xr-success', 2.6); sfx.powerup(); }
      else this.toast(t('bikeAIWrong', { terrain: this.terrainName(scan.terrain) }), null, 'xr-warning', 2.4);
    } else if (scan.tricky) {
      this.toast(t('bikeAIRight', { terrain: this.terrainName(scan.terrain) }), null, 'xr-success', 2);
    }
  }

  // ---------------------------------------------------------------- weather and the pit stop

  /** The weather turns ahead: the drone re-scans live, new data, a pit stop is offered. */
  weatherStart(w) {
    w.triggered = true;
    this.wEv = w;
    this.live = liveScan(w.from, w.to, Math.random);
    this.liveT = 0;
    this.scanArea = w.s;
    this.fx.grid(w.s + 0.3, w.s + 9.6);
    this.chipState = 'live';
    this.chip.redraw();
    this.livePanel.redraw();
    this.pop(this.livePanel);
    this.pop(this.pitBtn);
    // Hazards that come with it, puddles that dry up.
    for (const h of this.course.hazards) {
      if (h.weather === w.i) h.hidden = false;
      if (h.dryAt === w.i) h.hidden = true;
    }
    this.hzScatters?.forEach((sc) => { sc.dirty = true; });
    if (w.kind === 'fog') this.mist.userData.place(this.course, w.s - 6, 'xr-bike-fog-mist');
    this.toast(t(`bikeWeather_${w.kind}`), t('bikePitAsk'), w.to ? 'xr-bike-live' : 'xr-warning', 3.2);
    sfx.announce();
    this.rider?.mood('surprised', 1.2);
    this.haptic(0.4, 60);
  }

  /** The bike reaches the changed ground: the grip now depends on the new surface. */
  weatherApply(w) {
    w.applied = true;
    if (!w.decided) this.skipPit(w);
    if (w.to) {
      this.terrainNow = w.to;
      const r = (this.rating = rate(w.to, this.choice.tire, this.choice.pressure));
      if (!w.pitted) {
        const grip = r.grip >= 0.95 ? 'good' : r.grip >= 0.7 ? 'ok' : 'bad';
        this.toast(t(`bikeGrip_${grip}`, { tire: t(`bikeTire_${this.choice.tire}`), terrain: this.terrainName(w.to) }), null, grip === 'good' ? 'xr-success' : grip === 'ok' ? 'xr-warning' : 'xr-danger', 2.2);
      }
    } else if (!w.pitted) {
      this.pts.fog += FOG_PTS;
      this.toast(t('bikeFogRight', { n: FOG_PTS }), null, 'xr-success', 2.4);
      sfx.correct();
    }
    this.weatherLog.push({ kind: w.kind, to: w.to, pitted: w.pitted, live: this.live, from: w.from });
  }

  skipPit(w) {
    w.decided = true;
    if (w.to) this.toast(t('bikePitSkip', { tire: t(`bikeTire_${this.choice.tire}`) }), null, 'xr-warning', 1.8);
  }

  /** Pit stop wanted (button, key B, or riding into the box): brake to the pit. */
  requestPit() {
    const w = this.wEv;
    if (!w || w.decided || this.mode !== 'ride' || this.sB > w.pit - 0.5) return;
    w.decided = true;
    w.pitted = true;
    this.stopS = w.pit;
    this.mode = 'pitIn';
    sfx.click();
  }

  beginPit(w) {
    this.mode = 'pit';
    this.phaseT = 0;
    this.speed = 0;
    this.pitPress = null;
    this.pitPumps = 0;
    this.setRays(true);
    this.redrawConsole();
    this.goBtn.redraw();
    this.tireCard.redraw();
    this.pop(this.console);
    this.pop(this.tireCard);
    this.rider?.mood('focus', 2);
    sfx.appear();
    // The pit console's header says what to do (no second hint panel).
    if (this.toastPanel) { this.toastPanel.removeFromParent(); this.toastPanel.dispose(); this.toastPanel = null; }
  }

  pitPump() {
    if (!this.pitPress) { sfx.wrong(); return; }
    this.pitPumps += 1;
    this.pumpAnim = 1;
    sfx.boing();
    this.haptic(0.4, 30);
    this.goBtn.redraw();
    if (this.pitPumps >= PIT_PUMPS[this.pitPress]) this.endPit();
  }

  /** The stop is done: points for the right tire and pressure for the new ground and for speed. */
  endPit() {
    const w = this.wEv;
    const time = this.phaseT;
    const speed = time < 5 ? 150 : time < 8 ? 100 : time < 12 ? 50 : 20;
    let gain = 0;
    if (w?.to) {
      const r = rate(w.to, this.choice.tire, this.choice.pressure);
      gain = Math.round((r.tireOk ? 100 : 0) + (r.pressOk ? 50 : 0) + speed * (r.tireOk ? 1 : 0.3));
    }
    gain = Math.min(gain, PIT_MAX - this.pts.pit);
    this.pts.pit += Math.max(0, gain);
    this.rating = rate(w?.to ?? this.terrainNow, this.choice.tire, this.choice.pressure);
    this.pitTime = time;
    this.air = 100;
    this.mode = 'ride';
    this.phaseT = 3; // the AI check of this section is already done
    this.setRays(false);
    this.gauge.redraw();
    sfx.powerup();
    this.rider?.mood('happy', 1.2);
    if (w?.to) this.toast(t('bikePitDone', { time: time.toFixed(1), n: gain }), null, 'xr-success', 2.2);
    else this.toast(t('bikePitNoNeed'), null, 'xr-warning', 2.2);
  }

  // ---------------------------------------------------------------- jumps

  /** Takes off: a hop, or off a ramp (pressed close to the lip: big air). */
  takeoff(ramp, auto = false, climb = 0) {
    let vy = HOP;
    let big = false;
    let lip = false;
    if (ramp) {
      const d = ramp.lip - this.sB; // 0 at the lip
      if (auto) vy = RAMP_AUTO;
      else {
        const q = 1 - clamp(Math.abs(d - 0.1) / 0.9, 0, 1);
        vy = RAMP_JUMP + (RAMP_PERFECT - RAMP_JUMP) * q;
        big = q > 0.45;
        lip = q > 0.7;
      }
    }
    // The climb of the slope adds to the jump (and a descent takes from it).
    Object.assign(this, { inAir: true, vy: vy + climb, big, lipBonus: lip, airT: 0, tuckT: 0, tiltT: 0, feature: !!ramp, crest: false, fromRamp: ramp ?? null, slowDone: false });
    this.jumps += 1;
    sfx.jump();
    this.rider?.mood(big ? 'happy' : 'focus', 0.8);
    if (big) this.toast(t('bikeBigAir'), null, 'xr-bike-jump', 1.1);
    const kind = this.course.sectionAt(this.sB).kind;
    this.spark(this.sB, this.u, 0.05, kind === 'snow' ? 'xr-bike-snow' : kind === 'mud' ? 'xr-bike-mud-wet' : kind === 'gravel' ? 'xr-bike-gravel-light' : 'xr-bike-curb', 8, 1.4);
  }

  /** Touchdown: clean (straight, wheelie released) gives points, a boost and the combo. */
  land(ground) {
    this.inAir = false;
    this.Y = ground;
    this.Yprev = ground;
    this.y = 0;
    this.vy = 0;
    // A real flight off a crest or a drop counts as a jump.
    if (this.crest && this.airT > 0.28) this.feature = true;
    if (this.crest && this.airT < 0.2) { this.jumps -= 1; this.groundVy = this.speed * this.course.dh(this.sB); return; }
    const clean = Math.abs(this.roll) < 0.3 && this.pitch < 0.24;
    this.camDip = this.big ? 1 : 0.6;
    const kind = this.course.sectionAt(this.sB).kind;
    this.spark(this.sB, this.u, 0.05, kind === 'snow' ? 'xr-bike-snow' : kind === 'mud' ? 'xr-bike-mud-wet' : kind === 'gravel' ? 'xr-bike-gravel-light' : 'xr-bike-curb', this.big ? 22 : 12, this.big ? 2.6 : 1.8);
    this.haptic(this.big ? 0.8 : 0.5, 60);
    if (clean) {
      const tricks = [];
      let pts = 0;
      if (this.feature) {
        pts = 15;
        if (this.lipBonus) pts += 10;
        if (this.tuckT >= 0.25) { pts += 10; tricks.push(t('bikeTrickWheelie')); }
        if (this.tiltT >= 0.2) { pts += 5; tricks.push(t('bikeTrickTilt')); }
        this.combo += 1;
        this.bestCombo = Math.max(this.bestCombo, this.combo);
        this.cleanJumps += 1;
      }
      const gain = Math.min(Math.round(pts * (1 + 0.1 * Math.min(Math.max(0, this.combo - 1), 5))), JUMP_CAP - this.pts.jumps);
      this.pts.jumps += Math.max(0, gain);
      this.boostT = this.feature ? 1.1 : 0.4;
      if (this.feature) {
        const sub = [...tricks, this.combo > 1 ? t('bikeCombo', { n: this.combo }) : null].filter(Boolean).join(' · ') || null;
        this.toast(gain > 0 ? t('bikeLand', { n: gain }) : t('bikeLandPlain'), sub, this.combo > 1 ? 'xr-bike-combo' : 'xr-bike-jump', 1.4);
        sfx.coin();
        this.rider?.mood('happy', 0.8);
      } else sfx.bounce();
    } else {
      this.combo = 0;
      this.wobble = 1;
      this.slowT = 1;
      this.toast(t('bikeSloppy'), t('bikeSloppyHint'), 'xr-warning', 1.5);
      sfx.thud();
      this.rider?.hurt();
      const st = this.secStats[this.sec];
      if (st && this.feature) st.hits += 0.5;
    }
    this.gauge.redraw();
  }

  /** Hit an obstacle across the trail without jumping. */
  crash(h) {
    h.hit = true;
    this.crashes += 1;
    this.combo = 0;
    this.speed *= 0.2;
    this.wobble = 1;
    this.slowT = 1.4;
    if (h.type === 'trench') { this.air -= 14; this.punctures += 1; }
    const st = this.secStats[this.sec];
    if (st) st.hits += 1;
    this.toast(t('bikeCrash', { name: t(`bikeHz_${h.type}`) }), t('bikeCrashHint'), 'xr-danger', 1.8);
    sfx.crash();
    this.spark(h.s, this.u, 0.3, h.type === 'trench' ? 'xr-bike-chunk' : 'xr-bike-wood', 18, 2.2);
    this.rider?.hurt();
    this.haptic(1, 160);
    this.gauge.redraw();
  }

  /** One-time hints: the first obstacle across the trail and the first ramp. */
  jumpHints() {
    const s = this.sB;
    const key = t(`bikeKeyJump_${this.engine.isXR ? 'xr' : this.engine.touchUI ? 'touch' : 'screen'}`);
    if (!this.hints.block) {
      const h = this.course.hazards.find((x) => x.block && x.s > s + 4 && x.s < s + 13);
      if (h) { this.hints.block = true; this.toast(t('bikeJumpHint', { name: t(`bikeHz_${h.type}`) }), key, 'xr-bike-jump', 2.4); }
    }
    if (!this.hints.ramp) {
      const r = this.course.ramps.find((x) => x.s > s + 4 && x.s < s + 12);
      if (r) { this.hints.ramp = true; this.toast(t('bikeRampHint'), key, 'xr-bike-jump', 2.6); }
    }
  }

  /** End of a section: points for clean riding. */
  endSection(i) {
    const st = this.secStats[i];
    if (!st || st.done) return;
    st.done = true;
    const onTrail = st.ride > 0 ? 1 - st.off / st.ride : 1;
    st.clean = Math.round(CLEAN_PTS * onTrail * Math.max(0, 1 - 0.25 * st.hits));
    this.pts.clean += st.clean;
  }

  beginFlat() {
    this.mode = 'flat';
    this.phaseT = 0;
    this.flats += 1;
    this.pumpAnim = 0;
    this.setRays(true);
    this.rider?.mood('sad', 2.5);
    sfx.crash();
    const how = this.engine.isXR ? 'bikePumpXR' : this.engine.touchUI ? 'bikePumpTouch' : 'bikePumpScreen';
    this.toast(t('bikeFlat'), t(how), 'xr-danger', 99);
    this.pop(this.pumpBtn);
  }

  pumpOnce() {
    if (this.mode === 'pit') { this.pitPump(); return; }
    if (this.mode !== 'flat') return;
    this.air = Math.min(100, this.air + 14);
    this.pumpAnim = 1;
    sfx.boing();
    for (const p of this.engine.pointers) if (p.kind === 'xr' && p.active) this.engine.haptic(p, 0.4, 30);
    this.gauge.redraw();
    if (this.air >= 92) this.endFlat();
  }

  endFlat() {
    this.mode = 'ride';
    this.setRays(false);
    this.toastT = 0;
    this.rider?.mood('happy', 1);
    sfx.powerup();
  }

  beginFinish() {
    this.endSection(3);
    this.mode = 'finish';
    this.phaseT = 0;
    this.rider?.cheer();
    sfx.finish();
    this.toast(t('bikeFinished'), null, 'xr-success', 3);
    this.confettiT = 0;
  }

  finish() {
    if (this.mode === 'over') return;
    // Time: from the best possible ride to 60 % slower.
    // The best time: the perfect choice's speed along the hills, plus the stops' braking.
    const c = this.course;
    let best = 2;
    for (let x = S0 - STOP_GAP; x < c.finish; x += 0.5) {
      const sl = c.dh(x);
      best += 0.5 / (V_NOM * 1.08 * clamp(1 - sl * (sl > 0 ? 2.3 : 1.9), 0.4, 1.55));
    }
    const slow = best * 1.6;
    this.pts.time = Math.round(TIME_PTS * clamp((slow - this.rideT) / (slow - best), 0, 1));
    const score = this.liveScore();
    this.refreshHud?.();
    this.mode = 'over';
    this.app.echo?.suppress(false);
    this.setRays(true);
    this.engine.fitEnabled = true;
    this.engine.scene.fog = this.prevFog ?? null;
    this.ui.visible = false;
    this.padPort?.show(false);
    this.padLand?.show(false);
    this.pumpPad?.show(false);
    const right = this.choices.filter((c) => c?.rating.tireOk).length;
    this.results({
      gameKey: 'bike', score, correct: right, total: 4,
      line: t('bikeLine', { right, jumps: this.cleanJumps, stars: this.starsTaken, time: fmtTime(this.rideT) }),
      learned: this.learned(),
      onAgain: () => this.app.startGame('bike'),
    });
  }

  /** Takeaways about the AI: confidence, the live update with new data, when it was wrong. */
  learned() {
    const out = [];
    const first = this.choices[0]?.scan ?? this.scans[0];
    out.push({ q: t('bikeLearnConfQ', { terrain: this.terrainName(first.top), conf: first.conf }), a: t('bikeLearnConfA') });
    const change = this.weatherLog.find((x) => x.to);
    const fog = this.weatherLog.find((x) => !x.to);
    if (change) out.push({ q: t('bikeLearnLiveQ'), a: t('bikeLearnLiveA', { what: t(`bikeLiveWhat_${change.kind}`), terrain: this.terrainName(change.live.top), conf: change.live.conf }) });
    const wrong = this.choices.find((c) => c?.scan.tricky === 'wrong');
    const unsure = this.choices.find((c) => c?.scan.tricky === 'unsure');
    if (wrong) {
      const v = { terrain: this.terrainName(wrong.scan.terrain), conf: wrong.scan.conf, why: t(`bikeWhy_${wrong.scan.why}`).replace(/^./, (ch) => ch.toUpperCase()) };
      out.push(wrong.overruled ? { q: t('bikeLearnOverruleQ'), a: t('bikeLearnOverruleA', v) } : { q: t('bikeLearnWrongQ', v), a: t('bikeLearnWrongA', v) });
    }
    if (fog) out.push({ q: t('bikeLearnFogQ'), a: t('bikeLearnFogA', { conf: fog.live.conf }) });
    if (unsure) out.push({ q: t('bikeLearnUnsureQ'), a: t('bikeLearnUnsureA', { terrain: this.terrainName(unsure.scan.terrain), conf: unsure.scan.conf }) });
    out.push({ q: t('bikeLearnHumanQ'), a: t('bikeLearnHumanA') });
    return out.slice(0, 3);
  }

  // ---------------------------------------------------------------- toasts and pop-ins

  toast(text, sub, token, dur = 1.8) {
    if (this.toastPanel) { this.toastPanel.removeFromParent(); this.toastPanel.dispose(); }
    const blocks = [{ text, size: 'xr-text-md', weight: 'black', color: color(token), gap: sub ? 0.008 : 0 }];
    if (sub) blocks.push({ text: sub, size: 'xr-text-sm', color: color('xr-panel-text') });
    const p = textPanel(0.64, 0.08, blocks, { surface: { stroke: color(token) } });
    p.userData.noFit = true;
    this.ui.add(p);
    this.toastPanel = p;
    this.toastT = dur;
    this.pop(p);
  }

  pop(obj) { obj.userData.pop = 0; }

  // ---------------------------------------------------------------- frame loop

  update(dt) {
    this.time += dt;
    const e = this.engine;
    // A short slow motion at the top of a big jump (eased in and out).
    const wantScale = this.inAir && this.big && Math.abs(this.vy) < 2.6 ? 0.42 : 1;
    this.timeScale += (wantScale - this.timeScale) * Math.min(1, dt * (wantScale < this.timeScale ? 10 : 6));
    const gdt = dt * this.timeScale;
    this.camDip = Math.max(0, (this.camDip ?? 0) - dt * 2.5);
    this.placeStage();
    this.updateWindow(dt);
    if (this.mode === 'ride' || this.mode === 'brake') this.readXRJump(dt);
    switch (this.mode) {
      case 'scan': this.updateScan(dt); break;
      case 'choose': this.updateChoose(dt); break;
      case 'ride': case 'brake': case 'pitIn': this.updateRide(gdt); break;
      case 'pit': this.updatePit(dt); break;
      case 'flat': this.updateFlat(dt); break;
      case 'finish': this.updateFinish(dt); break;
      default: break;
    }
    this.positionCourse();
    this.updateCurtains();
    this.updateFloor();
    this.updateActors(gdt);
    if (!e.isXR) this.updateCamera(dt);
    this.layoutUI(dt);
    this.onTop();
    if (this.toastPanel && (this.toastT -= dt) <= 0) { this.toastPanel.removeFromParent(); this.toastPanel.dispose(); this.toastPanel = null; }
    const riding = this.mode === 'ride' || this.mode === 'brake' || this.mode === 'pitIn';
    const portrait = window.innerWidth < window.innerHeight;
    this.padPort?.show(riding && portrait);
    this.padLand?.show(riding && !portrait);
    this.pumpPad?.show(this.mode === 'flat');
    if (Math.floor(this.time * 4) !== this.hudTick) {
      this.hudTick = Math.floor(this.time * 4);
      if (this.mode !== 'intro' && this.mode !== 'over') {
        this.refreshHud?.();
        if (riding || this.mode === 'flat') this.gauge.redraw();
        if (this.mode === 'choose' || this.mode === 'pit') this.header.redraw();
        if (this.livePanel.visible) this.livePanel.redraw();
      }
    }
  }

  updatePit(dt) {
    this.phaseT += dt;
    this.rideT += dt;
    this.speed = 0;
    this.pumpAnim = Math.max(0, (this.pumpAnim ?? 0) - dt * 3);
  }

  /** The particles' floor: the base's top while the diorama has one, else far below. */
  updateFloor() {
    if (!this.base.visible) { this.floor.set(new THREE.Vector3(0, 1, 0), 1e4); return; }
    this.floor.set(new THREE.Vector3(0, 1, 0), -this.base.position.y).applyMatrix4(this.stage.matrixWorld);
  }

  /** The volume snow and rain fall in: the diorama's footprint, about 0.5 m high (headset). */
  fxArea() {
    if (!this.base.visible) return FX_AREA;
    this.area ??= {};
    return Object.assign(this.area, { back: this.win.back, front: this.win.front, side: this.win.side - 0.15, top: 0.5 / this.S });
  }

  /** Headset: the diorama's cut edges follow the hills down to the base. */
  updateCurtains() {
    if (!this.curtains.visible) return;
    const c = this.course;
    const S = this.S;
    this.cg.updateMatrix();
    const inv = this.cg.matrix.clone().invert();
    const C = this.curtains.userData.C;
    const p = new THREE.Vector3();
    const sample = (x, z) => {
      p.set(x, 0, z).applyMatrix4(inv);
      let s = -p.z;
      let v = 0;
      for (let k = 0; k < 3; k++) {
        const d = c.dcx(s);
        const n = 1 / Math.sqrt(1 + d * d);
        v = (p.x - c.cx(s)) / n;
        s = -(p.z - v * d * n);
      }
      const hy = c.h(s) + (Math.abs(v) < 2.1 ? 0.02 : vergeHeight(v, s, c.sectionAt(s).kind));
      return { x, z, top: this.cg.position.y + hy * S };
    };
    const x0 = -this.win.side * S;
    const x1 = this.win.side * S;
    const z0 = this.win.back * S;
    const z1 = -this.win.front * S;
    const edge = (fx, fz) => Array.from({ length: C + 1 }, (_, i) => sample(fx(i / C), fz(i / C)));
    const edges = [
      edge((k) => x0 + (x1 - x0) * k, () => z0),
      edge((k) => x0 + (x1 - x0) * k, () => z1),
      edge(() => x0, (k) => z0 + (z1 - z0) * k),
      edge(() => x1, (k) => z0 + (z1 - z0) * k),
    ];
    const bottom = Math.min(...edges.flat().map((q) => q.top)) - 0.012;
    this.base.position.y = bottom;
    this.curtains.userData.update(edges, bottom);
  }

  updateWindow(dt) {
    const want = this.windowTarget();
    const k = Math.min(1, dt * 1.6);
    for (const key of ['back', 'front', 'side']) this.win[key] += (want[key] - this.win[key]) * k;
    const S = this.S;
    this.clipLocal[0].constant = this.win.back * S;
    this.clipLocal[1].constant = this.win.front * S;
    this.clipLocal[2].constant = this.win.side * S;
    this.clipLocal[3].constant = this.win.side * S;
    this.stage.updateMatrixWorld(true);
    this.clip.forEach((p, i) => p.copy(this.clipLocal[i]).applyMatrix4(this.stage.matrixWorld));
    const narrow = this.win.side < 6;
    this.base.visible = narrow;
    this.curtains.visible = narrow;
    this.base.userData.scroll(this.sB, 12);
  }

  updateScan(dt) {
    this.phaseT += dt;
    const k = this.phaseT;
    this.scanProg = clamp((k - 0.4) / (SCAN_T - 0.6), 0, 0.999);
    if (Math.floor(k * 10) !== this.scanTick) { this.scanTick = Math.floor(k * 10); this.scanPanel.redraw(); }
    this.speed = 0;
    if (k >= SCAN_T) this.beginChoose();
  }

  updateChoose(dt) {
    this.phaseT += dt;
    this.speed = 0;
    if (this.phaseT >= CHOOSE_T) this.go();
  }

  /** Where the steering wants the bike (lateral offset from the trail's middle). */
  steer(dt) {
    const dir = (this.keys.right || this.btn.right ? 1 : 0) - (this.keys.left || this.btn.left ? 1 : 0);
    if (dir) { this.inputMode = 'keys'; this.target += dir * 3.8 * dt; }
    const xr = this.readXR();
    if (xr !== null) this.target = xr;
    const mouse = this.readMouse();
    if (mouse !== null) this.target = mouse;
    this.target = clamp(this.target, -EDGE + 0.1, EDGE - 0.1);
    // How fast the steering input moves right now (a tilt in the air follows it).
    const tv = (this.target - (this.prevTarget ?? this.target)) / Math.max(dt, 1e-3);
    this.prevTarget = this.target;
    this.targetVel = (this.targetVel ?? 0) + (tv - (this.targetVel ?? 0)) * Math.min(1, dt * 12);
  }

  updateRide(dt) {
    const c = this.course;
    const r = this.rating;
    const g = r.grip;
    const sec = c.sections[this.sec];
    const st = this.secStats[this.sec];
    this.phaseT += dt;
    this.rideT += dt;
    this.steer(dt);
    if (this.mode === 'pitIn') this.target = 1.25; // into the box on the right
    this.jumpQueued = Math.max(0, (this.jumpQueued ?? 0) - dt);
    this.boostT = Math.max(0, (this.boostT ?? 0) - dt);
    this.liveT = (this.liveT ?? 0) + dt;
    this.jumpHints();
    // Speed: grip, air, off the trail, slowdowns.
    this.slowT = Math.max(0, this.slowT - dt);
    this.mudT = Math.max(0, this.mudT - dt);
    this.slipT = Math.max(0, this.slipT - dt);
    this.wobble = Math.max(0, this.wobble - dt * 0.9);
    const off = Math.abs(this.u) > HALF + 0.1;
    let vT = V_NOM * (0.78 + 0.3 * g) * (0.7 + 0.3 * clamp(this.air / 75, 0, 1));
    if (r.tooHard && (sec.kind === 'gravel' || sec.kind === 'mud')) vT *= 0.95;
    if (off) vT *= 0.6;
    if (this.slowT > 0) vT *= 0.55;
    if (this.mudT > 0) vT *= 0.42;
    if (this.boostT > 0) vT *= 1.15;
    // Hills: slower uphill (much slower with the wrong tire), faster downhill.
    const slope = c.dh(this.sB);
    vT *= clamp(1 - slope * (slope > 0 ? 2.3 * (1 + 1.4 * (1 - g)) : 1.9), 0.4, 1.55);
    this.slope = slope;
    if ((this.mode === 'brake' || this.mode === 'pitIn') && !this.inAir) {
      const left = Math.max(0, this.stopS - this.sB);
      this.speed = Math.min(this.speed, Math.sqrt(2 * BRAKE * left));
      if (left < 0.03 || this.speed < 0.08) {
        this.sB = this.stopS;
        this.speed = 0;
        if (this.mode === 'pitIn') { this.beginPit(this.wEv); return; }
        this.endSection(this.sec);
        this.beginScan(this.sec + 1);
        return;
      }
    } else if (this.mode !== 'brake' && this.mode !== 'pitIn') {
      if (!this.inAir) this.speed += (vT - this.speed) * Math.min(1, dt * (vT > this.speed ? (slope < -0.02 ? 2.2 : 1.3) : 2.5));
    }
    // Lateral: towards the target, slower with little grip; drift outwards in curves.
    const vmax = 2.4 + 1.6 * g;
    const want = clamp((this.target - this.u) * 5, -vmax, vmax);
    this.latV += (want - this.latV) * Math.min(1, dt * (2.5 + 7 * g) * (this.inAir ? 0.35 : 1));
    const drift = -c.ddcx(this.sB) * this.speed * this.speed * (1 - g) * 0.6;
    let lat = this.latV + drift;
    if (this.slipT > 0) lat = this.latV * 0.3 + this.slipV * (this.slipT / 1.1);
    this.u = clamp(this.u + lat * dt, -EDGE, EDGE);
    this.latNow = lat;
    const prev = this.sB;
    this.sB += this.speed * dt;
    this.updateJump(dt, prev);
    // Weather: it turns ahead (live re-scan), the pit stop before it, the new ground.
    const w = c.weather.find((x) => x.sec === this.sec && !x.applied);
    if (w) {
      if (!w.triggered && this.sB >= w.trigger) this.weatherStart(w);
      if (w.triggered && !w.decided && this.mode === 'ride') {
        if (this.sB > w.pit - 3.2 && this.u > 1.0 && !this.inAir) this.requestPit();
        else if (this.sB > w.pit - 0.5) this.skipPit(w);
      }
      if (w.triggered && this.sB >= w.s) this.weatherApply(w);
    }
    if (st) { st.ride += dt; if (off) st.off += dt; }
    if (off && !this.offWarned && this.mode === 'ride') { this.offWarned = true; this.toast(t('bikeOffTrail'), null, 'xr-warning', 1.4); }
    if (!off) this.offWarned = false;
    this.collide(prev, this.sB);
    // Little grip (the wrong tire): now and then the bike slips away in a curve.
    if (g < 0.72 && this.mode === 'ride' && this.slipT <= 0) {
      this.gripSlip = (this.gripSlip ?? 0) + dt * (0.72 - g) * (0.6 + Math.abs(c.ddcx(this.sB)) * 25 + Math.max(0, slope) * 6);
      if (this.gripSlip > 1.6) {
        this.gripSlip = 0;
        this.slipT = 0.8;
        this.slipV = (c.ddcx(this.sB) > 0 ? -1 : 1) * (1.4 + (1 - g));
        this.wobble = 0.6;
        this.slowT = 0.5;
        this.toast(t('bikeSlip', { name: this.terrainName(sec.kind) }), null, 'xr-warning', 1.2);
        sfx.whoosh();
        this.rider?.mood('surprised', 0.8);
        this.haptic(0.4, 80);
      }
    }
    if (!this.revealed && this.phaseT > 2.4) this.reveal();
    // The end of the section: brake to a stop for the next scan; after the last: the finish.
    if (this.sec < 3 && this.mode === 'ride') {
      this.stopS = c.sections[this.sec + 1].b0 - STOP_GAP;
      if (this.sB >= this.stopS - (this.speed * this.speed) / (2 * BRAKE) - 0.05) this.mode = 'brake';
    } else if (this.sec === 3 && this.sB >= c.finish) {
      this.beginFinish();
    }
    if (this.air < AIR_FLAT && this.mode === 'ride' && !this.inAir) this.beginFlat();
  }

  /**
   * Jump physics on the hills (heights are absolute: Y, vy): ramps under the wheels, takeoff (the
   * slope's climb adds to it), crests and drops that throw the bike up when the ground falls away
   * faster than gravity pulls, air time with tricks, landing. this.y is the height above ground.
   */
  updateJump(dt, prevS) {
    const c = this.course;
    const ramp = c.rampAt(this.sB, this.u);
    const ground = c.h(this.sB) + (ramp ? RAMP_H * clamp((this.sB - (ramp.s - 0.8)) / 1.6, 0, 1) : 0);
    const climb = this.speed * c.dh(this.sB); // vertical speed when following the trail
    if (!this.inAir) {
      if (this.jumpQueued > 0 && this.mode === 'ride') {
        this.jumpQueued = 0;
        // Pressed at the lip but the wheels just left it: still a jump off the ramp.
        const r = ramp ?? (this.onRamp && this.sB - this.onRamp.lip < 0.4 ? this.onRamp : null);
        this.Y = r && !ramp ? c.h(this.sB) + RAMP_H : ground;
        this.takeoff(r, false, climb);
      } else if (this.onRamp && !ramp && prevS < this.onRamp.lip + 0.05 && this.sB >= this.onRamp.lip - 0.05) {
        this.Y = c.h(this.sB) + RAMP_H;
        this.takeoff(this.onRamp, true, climb); // off the lip without a jump: a small launch
      } else {
        // Over a crest or a drop the ground can fall away faster than gravity pulls: the bike flies.
        const fly = this.Yprev === undefined ? ground : this.Yprev + (this.groundVy ?? 0) * dt - 0.5 * GRAVITY * dt * dt;
        if (!ramp && this.speed > 3 && this.mode === 'ride' && fly > ground + 0.0015) {
          Object.assign(this, { inAir: true, Y: fly, vy: (this.groundVy ?? 0) - GRAVITY * dt, big: false, lipBonus: false, airT: 0, tuckT: 0, tiltT: 0, feature: false, crest: true, fromRamp: null });
          this.jumps += 1;
        } else this.Y = ground;
      }
      if (!this.inAir) {
        this.groundVy = climb;
        this.pitch += (0 - this.pitch) * Math.min(1, dt * 10);
        this.roll += (0 - this.roll) * Math.min(1, dt * 10);
      }
      this.onRamp = this.inAir ? null : ramp;
      this.Yprev = this.Y;
      this.y = this.Y - ground;
      return;
    }
    this.airT += dt;
    this.vy -= GRAVITY * dt;
    this.Y += this.vy * dt;
    this.Yprev = this.Y;
    this.y = this.Y - ground;
    // Tricks: hold the jump for a wheelie, steer for a tilt.
    const tuck = this.jumpHeld && this.airT > 0.14;
    this.pitch += ((tuck ? 0.5 : 0) - this.pitch) * Math.min(1, dt * 9);
    if (tuck) this.tuckT += dt;
    let dir = (this.keys.right || this.btn.right ? 1 : 0) - (this.keys.left || this.btn.left ? 1 : 0);
    if (!dir && this.inputMode !== 'keys') {
      const v = this.targetVel ?? 0; // a deliberate swipe or hand move tilts (dead zone 1.8 m/s)
      dir = clamp(Math.sign(v) * Math.max(0, Math.abs(v) - 1.8) / 2.5, -1, 1);
    }
    this.roll += (-dir * 0.6 - this.roll) * Math.min(1, dt * 7);
    if (Math.abs(this.roll) > 0.3) this.tiltT += dt;
    if (this.Y <= ground && this.vy < climb) this.land(ground);
  }

  collide(s0, s1) {
    const c = this.course;
    const H = c.hazards;
    while (this.hzIdx < H.length && H[this.hzIdx].s <= s1) {
      const h = H[this.hzIdx++];
      if (h.s < s0 - 0.5 || h.hidden) continue;
      const over = Math.abs(this.u - h.v) < h.r + 0.2;
      if (this.y > CLEAR_Y) {
        // Cleared in the air: it counts as a jump over something.
        h.passed = true;
        if (over && this.inAir) this.feature = true;
      } else if (h.block) this.crash(h);
      else if (over) this.hitHazard(h);
      else h.passed = true;
    }
    const I = c.items;
    while (this.itIdx < I.length && I[this.itIdx].s <= s1) {
      const it = I[this.itIdx++];
      if (it.s < s0 - 0.5 || it.taken) continue;
      const lift = it.type === 'star' ? 0.62 : it.type === 'cart' ? 0.55 : 0.66;
      if (Math.abs(this.u - it.v) < 0.62 && Math.abs((it.y ?? 0) + lift - (this.y + 0.65)) < 0.75) this.collect(it);
    }
  }

  haptic(k, ms) {
    for (const p of this.engine.pointers) if (p.kind === 'xr' && p.active) this.engine.haptic(p, k, ms);
  }

  /** Sparks at a spot of the course (course units, so they suit the diorama's scale). */
  spark(s, v, y, token, n = 14, speed = 2.2) {
    const p = this.course.point(s, v);
    p.y = y + this.course.h(s);
    this.sparks.userData.emit(p, token, n, speed);
  }

  hitHazard(h) {
    h.hit = true;
    const spec = HZ[h.type];
    const name = t(`bikeHz_${h.type}`);
    const st = this.secStats[this.sec];
    const tire = this.choice.tire;
    const g = this.rating.grip;
    switch (spec.cls) {
      case 'sharp':
        if (this.shields > 0) {
          this.shields -= 1;
          this.bike?.setBand(this.shields, true);
          this.toast(t('bikeShieldSaved', { n: this.shields }), null, 'xr-bike-band', 1.6);
          sfx.tink();
          this.spark(h.s, this.u, 0.4, 'xr-bike-band', 18);
          this.haptic(0.4, 40);
          return;
        }
        this.air -= 30 + 16 * (1 - g);
        this.punctures += 1;
        this.wobble = 1;
        this.slowT = 0.8;
        this.toast(t('bikePuncture', { name }), null, 'xr-danger', 1.6);
        sfx.shatter();
        this.spark(h.s, h.v, 0.25, 'xr-danger', 18);
        this.rider?.hurt();
        this.haptic(0.9, 120);
        break;
      case 'bump': {
        const soft = this.choice.pressure === 'low';
        const hard = this.choice.pressure === 'high';
        this.wobble = hard ? 1 : 0.6;
        this.slowT = hard ? 0.9 : 0.5;
        if (soft && h.type === 'pothole') {
          this.air -= 20;
          this.toast(t('bikePinch'), name, 'xr-danger', 1.8);
          this.punctures += 1;
        } else this.toast(t('bikeBump', { name }), null, 'xr-warning', 1.3);
        sfx.thud();
        this.spark(h.s, h.v, 0.1, h.type === 'roots' ? 'xr-bike-root' : 'xr-bike-chunk', 10, 1.6);
        this.rider?.hurt();
        this.haptic(0.7, 90);
        break;
      }
      case 'slip':
        if (tire === 'spikes') { this.toast(t('bikeSpikesGrip'), null, 'xr-success', 1.3); sfx.tink(); return; }
        this.slipT = 1.1;
        this.slipV = (this.u >= h.v ? 1 : -1) * (2.2 + 1.2 * (1 - g));
        this.slowT = 0.9;
        this.wobble = 0.8;
        this.toast(t('bikeSlip', { name }), null, 'xr-warning', 1.4);
        sfx.whoosh();
        this.rider?.mood('surprised', 1);
        this.haptic(0.6, 140);
        break;
      default: // mud puddle
        if (tire === 'knobby') { this.toast(t('bikeKnobbyMud'), null, 'xr-success', 1.3); return; }
        this.mudT = 1.3;
        this.wobble = 0.5;
        this.toast(t('bikeMudSlow'), null, 'xr-warning', 1.4);
        sfx.thud();
        this.spark(h.s, h.v, 0.1, 'xr-bike-mud-wet', 22, 2.6);
        this.haptic(0.5, 120);
    }
    if (st) st.hits += 1;
    this.gauge.redraw();
  }

  collect(it) {
    it.taken = true;
    it.hidden = true;
    this.itemScatters?.forEach((sc) => { sc.dirty = true; });
    if (it.type === 'star') {
      this.starsTaken += 1;
      this.pts.stars += STAR_PTS;
      sfx.coin();
      this.spark(it.s, it.v, 0.62, 'xr-bike-gold', 14);
      this.rider?.mood('happy', 0.6);
      this.haptic(0.3, 25);
    } else if (it.type === 'cart') {
      const add = Math.round(Math.min(40, 100 - this.air));
      this.air = Math.min(100, this.air + 40);
      this.toast(t('bikeCartridge', { n: Math.max(0, add) }), null, 'xr-bike-cartridge-band', 1.6);
      sfx.powerup();
      this.spark(it.s, it.v, 0.55, 'xr-bike-cartridge-band', 18);
    } else {
      this.shields = 3;
      this.bike?.setBand(3, true);
      this.toast(t('bikeShieldItem', { n: 3 }), null, 'xr-bike-band', 1.8);
      sfx.powerup();
      this.spark(it.s, it.v, 0.66, 'xr-bike-band', 24);
    }
    this.gauge.redraw();
  }

  updateFlat(dt) {
    this.phaseT += dt;
    this.rideT += dt;
    this.speed += (0 - this.speed) * Math.min(1, dt * 4);
    this.sB += this.speed * dt;
    this.pumpAnim = Math.max(0, (this.pumpAnim ?? 0) - dt * 3);
    // After a while Echo pumps along slowly, so nobody gets stuck.
    if (this.phaseT > 6) { this.air = Math.min(100, this.air + dt * 9); if (this.air >= 92) this.endFlat(); }
  }

  updateFinish(dt) {
    this.phaseT += dt;
    // Confetti from the arch in the first two seconds.
    this.confettiT -= dt;
    if (this.phaseT < 2.2 && this.confettiT <= 0) {
      this.confettiT = 0.12;
      const tok = ['xr-bike-confetti-1', 'xr-bike-confetti-2', 'xr-bike-confetti-3', 'xr-bike-confetti-4'][Math.floor(Math.random() * 4)];
      this.spark(this.course.finish, (Math.random() - 0.5) * 6, 4.4, tok, 8, 2.6);
    }
    this.speed += (0 - this.speed) * Math.min(1, dt * 0.9);
    this.sB += this.speed * dt;
    this.u += (0 - this.u) * Math.min(1, dt * 1.5);
    if (this.phaseT > 3.4) this.finish();
  }

  /** Moves and turns the course so the bike stays at the stage origin, heading into the diorama. */
  positionCourse() {
    const c = this.course;
    const s = this.sB;
    const p = c.point(s, 0, this.tmpP ??= new THREE.Vector3());
    const a = Math.atan(c.dcx(s));
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    this.cg.rotation.y = a;
    // The bike stays at the diorama's height; the hills rise and fall around it.
    this.cg.position.set(-(p.x * ca + p.z * sa) * this.S, -c.h(s) * this.S, -(-p.x * sa + p.z * ca) * this.S);
  }

  updateActors(dt) {
    const c = this.course;
    const s = this.sB;
    const riding = this.mode === 'ride' || this.mode === 'brake' || this.mode === 'finish' || this.mode === 'pitIn';
    const front = this.win.front + 2;
    const back = this.win.back + 1.5;
    this.terrain.userData.cull(s - back - 1, s + front + 1);
    for (const sc of this.scatters) sc.update(s - back, s + front);
    for (const sc of this.hzScatters ?? []) sc.update(s - back, s + front);
    const time = this.time;
    for (const sc of this.itemScatters ?? []) {
      sc.update(s - back, s + front, (it, m) => {
        const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), time * 2.2 + it.phase);
        const pos = it.pos.clone();
        pos.y += Math.sin(time * 3 + it.phase) * 0.06;
        return m.compose(pos, q, new THREE.Vector3().setScalar(1));
      });
    }
    this.arches?.forEach((a) => a.userData.tick?.(time));
    this.sparks.userData.update(dt);
    // Bike and rider.
    if (this.bike) {
      const yawRel = -Math.atan2(this.latNow ?? 0, Math.max(1.5, this.speed)) * 0.9;
      this.bike.root.position.copy(c.point(s, this.u));
      const groundY = c.h(s) + ramp0(c, s, this.u);
      this.blob.position.set(this.bike.root.position.x, groundY + 0.04, this.bike.root.position.z);
      this.blob.rotation.set(0, c.yaw(s), 0, 'YXZ');
      const lift = this.inAir ? Math.max(0, this.y) : 0;
      const bs = 1 / (1 + lift * 0.6);
      this.blob.scale.setScalar(bs);
      // It bends with the ground (over crests and into dips) instead of cutting into it.
      const bp = this.blob.geometry.attributes.position;
      const along = bs / Math.sqrt(1 + c.dcx(s) ** 2);
      for (let i = 0; i < bp.count; i++) {
        const sz = s - bp.getZ(i) * along;
        bp.setY(i, (c.h(sz) + ramp0(c, sz, this.u) - groundY) / bs);
      }
      bp.needsUpdate = true;
      this.blob.material.opacity = 0.5 / (1 + lift * 0.8);
      this.bike.root.position.y = this.inAir ? this.Y : groundY;
      // Along the slope (nose up on a ramp), along the flight in the air, plus the wheelie.
      const ramp = c.rampAt(s, this.u);
      const want = this.inAir ? Math.atan2(this.vy, Math.max(2, this.speed)) * 0.6 : Math.atan(c.dh(s)) + (ramp ? Math.atan2(RAMP_H, 1.6) : 0);
      this.visPitch = (this.visPitch ?? want) + (want - (this.visPitch ?? want)) * Math.min(1, dt * 12);
      this.bike.root.rotation.set(this.visPitch + this.pitch, c.yaw(s) + (riding ? yawRel : 0), 0, 'YXZ');
      const steer = clamp(yawRel * 1.4 - c.ddcx(s) * 4, -0.45, 0.45) * (riding ? 1 : 0);
      const roll = this.inAir ? this.roll : -clamp((this.latNow ?? 0) * 0.07, -0.25, 0.25) * (riding ? 1 : 0);
      this.bike.update(dt, { speed: this.speed, steer: this.inAir ? steer * 0.3 : steer, roll, wobble: this.wobble ?? 0 });
      this.bike.setBand(this.shields ?? 0);
      const look = this.mode === 'scan' ? this.drone?.root : this.mode === 'choose' || this.mode === 'over' || this.mode === 'intro' ? null : this.swallow?.root;
      const lookWorld = look ? look.getWorldPosition(new THREE.Vector3()) : this.engine.camera.getWorldPosition(new THREE.Vector3());
      // Downhill Echo tucks in, uphill it stands up on the pedals.
      const sl = riding && !this.inAir ? c.dh(s) : 0;
      this.rider?.update(dt, {
        speed: this.speed, turn: this.mode === 'choose' || this.mode === 'intro' || this.mode === 'pit' ? 0.7 : 0, steer: clamp((this.latNow ?? 0) * 0.15, -0.4, 0.4), lookWorld, pedal: this.bike.crank,
        air: this.inAir ? 1 : 0, tuck: Math.max(clamp(this.pitch / 0.5, 0, 1), clamp(-sl * 5, 0, 0.8)), climb: clamp(sl * 5, 0, 1),
      });
      this.updateTracks(dt, riding);
    }
    // The pump next to the bike while the tire is flat.
    if (this.pump) {
      this.pump.visible = this.mode === 'flat' || this.mode === 'pit';
      if (this.pump.visible) {
        this.pump.position.copy(c.pointH(s - 0.2, this.u + (this.u > 1 ? -0.75 : 0.75)));
        this.pump.rotation.y = c.yaw(s) + 0.4;
        if (this.pumpHandle) this.pumpHandle.position.y = this.pumpY - Math.sin((this.pumpAnim ?? 0) * Math.PI) * 0.18;
      }
    }
    // The swallow: ahead over the best line; circling above while scanning and choosing.
    if (this.swallow) {
      const sw = this.swallow.root;
      const ahead = this.engine.isXR ? 5.2 : 6.5;
      let want;
      if (riding) {
        const sa = s + ahead;
        want = c.point(sa, c.guideAt(sa + 1));
        want.y = c.h(sa) + 2.0 + Math.sin(time * 1.7) * 0.15;
      } else {
        const a = time * 0.9;
        want = c.point(s + 3.5 + Math.sin(a) * 1.4, Math.cos(a) * 1.6);
        want.y = c.h(s + 3.5) + 2.5 + Math.sin(time * 1.3) * 0.2;
      }
      const prev = sw.position.clone();
      if (!this.swInit) { sw.position.copy(want); this.swInit = true; }
      sw.position.lerp(want, Math.min(1, dt * 2.2));
      const vel = sw.position.clone().sub(prev);
      if (vel.lengthSq() > 1e-7) {
        const yaw = Math.atan2(-vel.x, -vel.z);
        sw.rotation.set(clamp(vel.y / Math.max(dt, 1e-3) * 0.05, -0.4, 0.4), yaw, clamp(-vel.x * 3, -0.5, 0.5), 'YXZ');
      }
      this.swallow.update(dt, riding ? 0 : 0.2);
    }
    // The drone: escorts ahead, flies to the next section to scan.
    if (this.drone) {
      const d = this.drone.root;
      const sec = c.sections[this.sec ?? 0];
      const scanning = this.mode === 'scan' || this.mode === 'choose';
      const w = this.wEv;
      const live = w && w.triggered && (this.liveT ?? 9) < 2.6 && this.mode !== 'pit';
      const area = this.scanArea ?? sec.b0;
      const sd = scanning ? sec.b0 + 2.4 : live ? Math.max(s + 4, w.s - 2) : s + 3.6;
      const want = c.point(sd, scanning || live ? 0 : -1.6 + Math.sin(time * 0.6) * 0.3);
      want.y = c.h(sd) + (scanning || live ? 3.6 : 3.0 + Math.sin(time * 2) * 0.08);
      d.position.lerp(want, Math.min(1, dt * (live ? 4 : 2.6)));
      d.rotation.set(scanning ? 0.18 : 0.06, c.yaw(sd), Math.sin(time * 1.4) * 0.05, 'YXZ');
      this.drone.update(dt);
      // The scan beam and grid.
      let alpha = 0;
      let reveal = -1e9;
      let gridA = 0;
      let sLine = area;
      if (this.mode === 'scan') {
        const k = this.phaseT;
        alpha = smooth(0.25, 0.5, k) * (1 - smooth(SCAN_T - 0.3, SCAN_T, k));
        sLine = area + 0.4 + clamp((k - 0.4) / (SCAN_T - 0.75), 0, 1) * 9;
        reveal = sLine;
        gridA = smooth(0.3, 0.7, k);
      } else if (this.mode === 'choose') {
        reveal = area + 11;
        gridA = 0.7;
      } else if (live) {
        // The live re-scan of the changed ground ahead.
        const k = this.liveT;
        alpha = smooth(0.1, 0.4, k) * (1 - smooth(2.2, 2.6, k));
        sLine = area + 0.4 + clamp((k - 0.3) / 1.8, 0, 1) * 9;
        reveal = sLine;
        gridA = smooth(0.2, 0.6, k) * (1 - smooth(2.2, 2.6, k));
      } else if (riding && this.phaseT < 2) {
        reveal = area + 11;
        gridA = 0.7 * (1 - this.phaseT / 2);
      }
      d.updateMatrixWorld(true);
      const apex = this.cg.worldToLocal(d.localToWorld(this.drone.lens.clone()));
      const warn = live ? !w.to : this.scanProg >= 0.99 && !!this.scans[this.sec ?? 0]?.tricky;
      this.fx.set({ apex, sLine, alpha, reveal, gridAlpha: gridA, warn });
    }
    // The big tire beside the console turns slowly, so its tread reads well.
    if (this.previewTires) {
      for (const [k, sp] of Object.entries(this.previewTires)) { sp.visible = k === this.choice.tire; sp.rotation.x = -time * 0.7; }
      if (this.previewRim) this.previewRim.rotation.x = -time * 0.7;
    }
    // The swallow's light dots on the best line.
    this.dotsA = lerp(this.dotsA ?? 0, this.mode === 'ride' ? 1 : 0, Math.min(1, dt * 3));
    this.dots.userData.set(c, s, time, this.dotsA);
    // Weather: the new ground fades in when it turns, rain, the light.
    const w = this.wEv;
    const wOn = w && w.triggered && this.mode !== 'intro' && this.mode !== 'over' && s < w.end + 2;
    this.weatherK = lerp(this.weatherK ?? 0, wOn ? 1 : 0, Math.min(1, dt * 0.9));
    this.wLayers.forEach((layer, i) => layer?.userData.setK(w && w.i === i ? this.weatherK : 0));
    this.rain.userData.update(dt, c, s, w && (w.kind === 'rain' || w.kind === 'thaw') ? this.weatherK : 0, this.fxArea());
    const look = w ? WEATHER_LOOK[w.kind] : null;
    this.key.intensity = this.keyBase * (1 + ((look?.light ?? 1) - 1) * this.weatherK);

    // Snow over the snow section, mist where the scanner was blinded.
    const kind = c.sectionAt(s + 4).kind;
    this.snow.userData.update(dt, s, kind === 'snow' && this.mode !== 'intro', this.S, this.fxArea());
    const sec = c.sections[this.sec ?? 0];
    const fogEv = this.wEv?.kind === 'fog' && this.wEv.triggered && s < this.wEv.s + 30;
    const mistWant = fogEv || (this.mistOn && (this.mode === 'scan' || this.mode === 'choose' || (riding && s < sec.b0 + 14))) ? 1 : 0;
    this.mistA = lerp(this.mistA ?? 0, mistWant, Math.min(1, dt * 1.5));
    this.mist.userData.fade(this.mistA, time);
    // Sky and fog follow the section (browser).
    if (this.sky) this.sky.visible = !this.engine.isXR;
    if (this.sky && !this.engine.isXR) {
      const [top, low] = this.weatherK > 0.5 && look ? look.sky : SKY[clamp(this.sec ?? 0, 0, 3)];
      const k = Math.min(1, dt * 0.8);
      this.skyTop.lerp(new THREE.Color(hex(top)), k);
      this.skyLow.lerp(new THREE.Color(hex(low)), k);
      if (Math.floor(time * 5) !== this.skyTick) { this.skyTick = Math.floor(time * 5); this.sky.userData.setColors(this.skyTop, this.skyLow); }
      this.sky.position.copy(this.group.worldToLocal(this.engine.camera.getWorldPosition(new THREE.Vector3())));
      const fogOn = this.mode !== 'intro' && this.mode !== 'over';
      if (fogOn) {
        if (!this.fog) this.fog = new THREE.Fog(this.skyLow.getHex(), 1, 4);
        this.fog.color.copy(this.skyLow);
        const foggy = w?.kind === 'fog' ? this.weatherK : 0;
        this.fog.near = 1.6 - foggy * 0.9;
        this.fog.far = (this.win.front - 3) * this.S * (1 - foggy * 0.55);
        this.engine.scene.fog = this.fog;
      }
    }
  }

  /**
   * Tire tracks (deep in mud, clear in snow, faint on wet ground) with the chosen tread, mud and
   * snow spray from the rear wheel, and on fast descents speed lines and the wind.
   */
  updateTracks(dt, riding) {
    const c = this.course;
    const s = this.sB;
    const w = this.wEv;
    const kind = this.terrainNow ?? c.sectionAt(s).kind;
    const wet = w && w.applied && (w.kind === 'rain' || w.kind === 'thaw') && s < w.end;
    const a = kind === 'mud' ? 0.85 : kind === 'snow' ? 0.72 : wet ? 0.35 : 0;
    const onGround = riding && !this.inAir && !c.rampAt(s, this.u) && this.speed > 0.3 && this.mode !== 'finish';
    const tk = kind === 'mud' ? 'xr-bike-track-mud' : kind === 'snow' ? 'xr-bike-track-snow' : 'xr-bike-track-wet';
    this.tints ??= {};
    const tint = (this.tints[tk] ??= new THREE.Color(hex(tk)));
    for (const [i, off] of [[0, -0.5], [1, 0.52]]) {
      if (onGround && a > 0) this.tracks.add(i, c, s + off, this.u, c.h(s + off) + 0.045, a, this.choice.tire, tint);
      else this.tracks.lift(i);
    }
    this.tracks.update(s);
    // Spray from the rear wheel.
    this.sprayT = (this.sprayT ?? 0) - dt;
    if (onGround && a >= 0.6 && this.speed > 2 && this.sprayT <= 0) {
      this.sprayT = 0.07;
      const d = c.dcx(s);
      const n = 1 / Math.sqrt(1 + d * d);
      const back = new THREE.Vector3(-d * n, 0, n).multiplyScalar(this.speed * 0.35).add(new THREE.Vector3(0, 1.3, 0));
      const p = c.pointH(s - 0.6, this.u);
      p.y += 0.12;
      this.sparks.userData.emit(p, kind === 'mud' ? 'xr-bike-mud-wet' : 'xr-bike-snow', 2, 0.7, 9, back, 0.55);
    }
    // The feel of speed on fast descents: speed lines, a wider view, the wind.
    this.fast = clamp((this.speed - 5.6) / 1.6, 0, 1) * (riding ? 1 : 0);
    this.speedLines.userData.update(dt, c, s, this.speed, this.fast);
    this.windT = (this.windT ?? 0) - dt;
    if (this.fast > 0.45 && this.windT <= 0) { this.windT = 1.1; sfx.whoosh(); }
  }

  /** Browser: a chase camera behind the bike (higher while scanning, beside it while choosing). */
  updateCamera(dt) {
    const e = this.engine;
    const cam = e.camera;
    if (this.mode === 'intro' || this.mode === 'over') { e.fitEnabled = true; this.camInit = false; return; }
    e.fitEnabled = false;
    const portrait = cam.aspect < 0.8;
    const bx = this.u * this.S * 0.55;
    let pos;
    let look;
    let fov = portrait ? 64 : 52;
    if (this.mode === 'scan') { pos = portrait ? [bx * 0.5, 0.78, 0.48] : [bx * 0.5, 0.52, 0.55]; look = portrait ? [0, 0, -0.5] : [0, 0, -0.95]; }
    else if (this.mode === 'choose' || this.mode === 'pit') { pos = portrait ? [0.2, 0.32, 0.52] : [0.28, 0.24, 0.42]; look = [0, 0.03, -0.5]; fov = portrait ? 62 : 50; }
    else if (this.mode === 'finish') { const a = 0.5 + this.phaseT * 0.35; pos = [Math.sin(a) * 0.42 + bx, 0.2, Math.cos(a) * 0.42]; look = [bx, 0.08, 0]; }
    else { pos = [bx, portrait ? 0.5 : 0.4, portrait ? 0.72 : 0.6]; look = [bx * 1.1, 0, portrait ? -0.66 : -0.95]; }
    // Hills: the camera follows the slope behind the bike, looks at the trail's height ahead and
    // stays above any crest in between (so the trail beyond stays in view and it never clips).
    const S = this.S;
    const c = this.course;
    const s0 = this.sB;
    const rel = (ds) => (c.h(s0 + ds) - c.h(s0)) * S;
    const back = Math.max(0, pos[2]) / S;
    const ahead = Math.max(1, -look[2] / S);
    let crest = -1e9;
    for (let d = -back; d <= ahead; d += 0.75) crest = Math.max(crest, rel(d));
    pos[1] = Math.max(pos[1] + rel(-back) * 0.85, crest + 0.1);
    look[1] += rel(ahead) * 0.9;
    // Follow a jump upwards a little; a landing dips the camera.
    const jy = (this.y ?? 0) * this.S;
    pos[1] += jy * 0.2 - (this.camDip ?? 0) * 0.035;
    look[1] += jy * 0.3;
    fov += (this.fast ?? 0) * 9;
    const wantPos = this.stage.localToWorld(new THREE.Vector3(...pos));
    const wantLook = this.stage.localToWorld(new THREE.Vector3(...look));
    if (!this.camInit) {
      this.camInit = true;
      this.camPos = cam.position.clone();
      this.camLook = cam.position.clone().add(new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion));
    }
    const k = Math.min(1, dt * 2.6);
    this.camPos.lerp(wantPos, k);
    this.camLook.lerp(wantLook, k);
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
    // Shift the view so the bike sits in the free part of the screen (between the panels).
    const tv = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    cam.rotateX(-Math.atan((this.freeShift ?? 0) * tv));
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov += (fov - cam.fov) * k; cam.updateProjectionMatrix(); }
  }

  // ---------------------------------------------------------------- layout

  /** Panels in the headset (on the arc and on the diorama) or fixed on the screen (browser). */
  layoutUI(dt) {
    const m = this.mode;
    const w = this.wEv;
    const moving = m === 'ride' || m === 'brake' || m === 'pitIn';
    const alert = !!w && w.triggered && moving && (!w.decided || (this.liveT ?? 0) < 5) && this.sB < w.s + 6;
    const show = {
      scanPanel: m === 'scan' || m === 'choose',
      livePanel: alert || m === 'pit',
      pitBtn: !!w && w.triggered && !w.decided && m === 'ride',
      chip: moving || m === 'flat',
      gauge: moving || m === 'flat' || m === 'scan' || m === 'choose' || m === 'finish' || m === 'pit',
      console: m === 'choose' || m === 'pit',
      pumpBtn: m === 'flat' && !this.engine.touchUI,
      tirePreview: m === 'choose' || m === 'pit',
    };
    this.ui.visible = m !== 'intro' && m !== 'over';
    if (!this.ui.visible) return;
    const e = this.engine;
    // Pop-in factors.
    const popK = (o) => { if (o.userData.pop === undefined) return 1; o.userData.pop = Math.min(1, o.userData.pop + dt * 4); return 0.85 + 0.15 * easeOut(o.userData.pop); };
    if (e.isXR) {
      this.ui.position.set(0, 0, 0);
      this.ui.quaternion.identity();
      const sp = this.scanPanel;
      sp.visible = show.scanPanel;
      this.scanSmall.visible = false;
      placeOnArc(sp, -0.62, this.eye - 0.06, 1.0);
      sp.scale.setScalar(popK(sp));
      const lp = this.livePanel;
      lp.visible = show.livePanel;
      placeOnArc(lp, -0.62, this.eye - 0.02, 1.0);
      lp.scale.setScalar(popK(lp));
      this.pitBtn.visible = show.pitBtn;
      placeOnArc(this.pitBtn, -0.62, this.eye - 0.33, 0.96);
      this.pitBtn.rotation.x = -0.2;
      const con = this.console;
      con.visible = show.console;
      placeOnArc(con, 0.6, this.eye - 0.12, 0.95);
      con.rotation.x = -0.12;
      con.scale.setScalar(popK(con));
      this.layoutTiles();
      this.tireCard.visible = show.tirePreview;
      placeOnArc(this.tireCard, 1.12, this.eye - 0.06, 0.98);
      this.tireCard.scale.setScalar(popK(this.tireCard));
      const st = this.stage.position;
      this.gauge.visible = show.gauge;
      this.gauge.position.set(st.x - 0.34, st.y + 0.13, st.z + 0.26);
      this.gauge.rotation.set(-0.7, 0.35, 0);
      this.gauge.scale.setScalar(0.8 * popK(this.gauge));
      this.chip.visible = show.chip;
      this.chip.position.set(st.x + 0.34, st.y + 0.13, st.z + 0.26);
      this.chip.rotation.set(-0.7, -0.35, 0);
      this.chip.scale.setScalar(0.8 * popK(this.chip));
      if (this.toastPanel) {
        this.toastPanel.position.set(0, this.eye + 0.04, -1.3);
        this.toastPanel.rotation.set(0, 0, 0);
        this.toastPanel.scale.setScalar(popK(this.toastPanel));
      }
      this.pumpBtn.visible = show.pumpBtn;
      this.pumpBtn.position.set(0, this.eye - 0.32, -0.75);
      this.pumpBtn.rotation.set(-0.5, 0, 0);
      return;
    }
    // Browser: the UI layer follows the camera; panels sit at distance D, sized in pixels.
    const cam = e.camera;
    cam.updateMatrixWorld(true);
    this.group.updateMatrixWorld(true);
    const inv = this.group.matrixWorld.clone().invert();
    const mtx = inv.multiply(cam.matrixWorld);
    mtx.decompose(this.ui.position, this.ui.quaternion, this.ui.scale);
    this.ui.scale.setScalar(1);
    const D = 0.5;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const hh = D * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const hw = hh * cam.aspect;
    const pxPerM = H / (2 * hh); // screen px per meter at distance D
    const touch = e.touchUI;
    const portrait = W < H;
    const ins = e.insets();
    const place = (obj, x, y, ax, ay, ppm) => {
      const ow = obj.userData.w ?? obj.w;
      const oh = obj.userData.h ?? obj.h;
      const k = (ppm / pxPerM) * popK(obj) * (obj.userData.hoverK ?? 1);
      obj.scale.setScalar(k);
      obj.position.set((2 * x - 1) * hw + (0.5 - ax) * ow * k, (1 - 2 * y) * hh + (ay - 0.5) * oh * k, -D);
      obj.rotation.set(0, 0, 0);
      return { w: (ow * ppm), h: (oh * ppm) };
    };
    const top = (ins.top + 8) / H;
    let freeTop = top;
    let freeBot = 1 - (ins.bottom + 6) / H;
    const desk = num('xr-bike-ui-px') * clamp(H / 760, 0.75, 1.35);
    const phone = num('xr-bike-ui-px-phone');
    for (const k of ['scanPanel', 'livePanel', 'pitBtn', 'chip', 'gauge', 'console', 'pumpBtn']) this[k].visible = show[k];
    this.scanSmall.visible = false;
    this.tireCard.visible = show.tirePreview && !touch;
    // Top bar (desktop: the 3D status bar and the menu button).
    if (!touch && this.hudObjs) {
      const [info, menu] = this.hudObjs;
      if (info) place(info, 0.012, 0.015, 0, 0, desk * 0.8);
      if (menu) place(menu, 0.988, 0.015, 1, 0, desk * 0.8);
      freeTop = (0.015 * H + 0.15 * desk * 0.8 + 8) / H;
    }
    if (!touch) {
      let leftY = freeTop + 0.01;
      if (show.scanPanel) leftY += place(this.scanPanel, 0.012, leftY, 0, 0, desk * 0.82).h / H + 0.012;
      if (show.chip) leftY += place(this.chip, 0.012, leftY, 0, 0, desk * 0.85).h / H + 0.012;
      if (show.livePanel) leftY += place(this.livePanel, 0.012, leftY, 0, 0, desk * 0.8).h / H + 0.012;
      if (show.tirePreview) place(this.tireCard, 0.012, leftY, 0, 0, desk * (m === 'pit' ? 0.7 : 0.82));
      if (show.console) { place(this.console, 0.988, 0.56, 1, 0.5, desk * 0.9); this.layoutTiles(); }
      if (show.gauge) place(this.gauge, 0.012, 0.985, 0, 1, desk * 0.9);
      if (this.toastPanel) place(this.toastPanel, 0.5, freeTop + 0.07, 0.5, 0, desk * 0.85);
      if (show.pumpBtn) place(this.pumpBtn, 0.5, 0.72, 0.5, 0.5, desk);
      if (show.pitBtn) place(this.pitBtn, 0.5, 0.8, 0.5, 0.5, desk);
      this.freeShift = 0;
      return;
    }
    // Phones.
    const gap = 6 / H;
    if (portrait) {
      const fitW = (W - 12) / 0.68;
      const ppm = Math.min(phone * 1.25, fitW);
      if (m === 'choose' || m === 'pit') {
        const head = m === 'pit' ? this.livePanel : this.scanSmall;
        const sh = place(head, 0.5, top, 0.5, 0, m === 'pit' ? Math.min(ppm, (H * 0.3) / 0.42) : ppm);
        head.visible = true;
        this.scanPanel.visible = false;
        const c = place(this.console, 0.5, 1 - gap, 0.5, 1, ppm);
        this.layoutTiles();
        freeTop = top + sh.h / H;
        freeBot = 1 - gap - c.h / H;
      } else if (show.scanPanel) {
        const sh = place(this.scanPanel, 0.5, top, 0.5, 0, ppm);
        freeTop = top + sh.h / H;
      }
      const small = Math.min(phone, (W - 18) / 0.94);
      if (show.chip) place(this.chip, 0.012, top, 0, 0, small);
      if (show.gauge && m !== 'choose' && m !== 'scan' && m !== 'pit') {
        const gs = place(this.gauge, 0.988, top, 1, 0, small);
        freeTop = Math.max(freeTop, top + gs.h / H);
      } else this.gauge.visible = false;
      if (show.livePanel && m !== 'pit') {
        const ls = place(this.livePanel, 0.5, freeTop + gap, 0.5, 0, Math.min(phone * 0.95, (W - 12) / 0.66));
        freeTop += gap + ls.h / H;
      }
      if (show.pitBtn) place(this.pitBtn, 0.5, freeBot - 0.06, 0.5, 1, phone * 1.1);
      if (this.toastPanel) place(this.toastPanel, 0.5, Math.max(freeTop + gap, top + 0.11), 0.5, 0, Math.min(ppm, phone * 1.1));
    } else {
      const avail = H - ins.top - 12;
      if (m === 'choose' || m === 'pit') {
        const head = m === 'pit' ? this.livePanel : this.scanSmall;
        const ppmS = Math.min(phone, avail / (m === 'pit' ? 0.42 : 0.36), (W * 0.42) / 0.66);
        place(head, 0.008, top, 0, 0, ppmS);
        head.visible = true;
        this.scanPanel.visible = false;
        const ppmC = Math.min(phone * 1.1, avail / 0.62, (W * 0.5) / 0.68);
        place(this.console, 0.992, top + (1 - top) / 2, 1, 0.5, ppmC);
        this.layoutTiles();
      } else if (show.scanPanel) {
        place(this.scanPanel, 0.008, top, 0, 0, Math.min(phone, avail / 0.6));
      }
      const small = Math.min(phone * 0.9, (W * 0.3) / 0.52);
      let leftY = top;
      if (show.chip) leftY += place(this.chip, 0.008, top, 0, 0, small).h / H + gap;
      if (show.gauge && m !== 'choose' && m !== 'scan' && m !== 'pit') place(this.gauge, 0.992, top, 1, 0, small);
      else this.gauge.visible = false;
      if (show.livePanel && m !== 'pit') place(this.livePanel, 0.008, leftY, 0, 0, Math.min(phone * 0.85, (H - leftY * H - 90) / 0.42, (W * 0.34) / 0.66));
      if (show.pitBtn) place(this.pitBtn, 0.5, 0.97, 0.5, 1, Math.min(phone, (W * 0.3) / 0.5));
      if (this.toastPanel) place(this.toastPanel, 0.5, top + 0.02, 0.5, 0, Math.min(phone, (W * 0.44) / 0.64));
    }
    // The bike in the middle of the free band between the panels.
    const mid = (freeTop + freeBot) / 2; // 0 top .. 1 bottom
    this.freeShift = clamp(1 - 2 * mid, -0.8, 0.8);
  }

  /**
   * Panels draw on top of the diorama: the intro and results (they stand behind it in the browser
   * view) and the game's own panels (the ground may reach into them on the screen).
   */
  onTop() {
    const mark = (root, order) => root.traverse((o) => {
      if (!o.material || o.userData.onTop || o.userData.keepDepth) return;
      for (const m of [].concat(o.material)) { m.depthTest = false; m.depthWrite = false; }
      o.renderOrder = order;
      o.userData.onTop = true;
    });
    mark(this.layer, 100);
    for (const o of this.ui.children) mark(o, 90);
  }

  /** Hover scale of the console's tiles (they live inside the console group). */
  layoutTiles() {
    for (const tile of [...this.tireTiles, ...this.pressTiles, this.goBtn]) tile.scale.setScalar(tile.userData.hoverK ?? 1);
  }

  dispose() {
    this.mode = 'over';
    this.engine.onEmptyPress = null;
    this.app.echo?.suppress(false);
    this.setRays(true);
    this.engine.fitEnabled = true;
    this.engine.backdrop.visible = this.prevBackdrop;
    this.engine.scene.fog = this.engine.isXR && this.engine.xrMode === 'immersive-ar' ? null : (this.prevFog ?? null);
    if (!this.engine.isXR) this.engine.camera.rotation.set(0, 0, 0);
    this.engine.renderer.localClippingEnabled = !!this.prevClipping;
    this.engine.scene.environment = this.prevEnvironment ?? null;
    this.envTarget?.dispose();
    this.scatters.forEach((s) => s.dispose());
    this.hzScatters?.forEach((s) => s.dispose());
    this.itemScatters?.forEach((s) => s.dispose());
    this.terrain?.userData.dispose?.();
    this.base?.userData.dispose?.();
    this.mist?.userData.dispose?.();
    this.fx?.dispose();
    this.rider?.dispose();
    this.bike?.dispose();
    this.kits?.forEach((k) => k.materials().forEach((mat) => mat.dispose()));
    super.dispose();
  }
}
