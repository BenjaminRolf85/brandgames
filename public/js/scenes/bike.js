// "Pannenfrei" / "Puncture-Free" (game key 'bike'): a tire rally in real 3D. Echo rides a bike
// along a winding trail through four terrains (asphalt, gravel, forest mud, snow and ice); the
// player steers around glass, nails, thorns, potholes, roots and ice, collects stars, air
// cartridges and puncture protection. Before each section an AI terrain scanner (a drone) sweeps
// the trail with a scan beam, classifies the terrain from its sensor data with a confidence and
// recommends a tire profile and pressure. The player follows or overrules it; sometimes the
// data is unclear (fog, wet leaves, slush) and the AI is wrong. The right choice gives grip,
// speed and points; the wrong one slips, slows and punctures more easily. A flat tire means a
// short pumping break. A swallow flies ahead and shows the best line.
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
import { CHRISTMAS } from '../christmas.js';
import { makeEnvironment } from '../robot-visuals.js';
import { TERRAINS, TIRES, PRESSURES, BEST, planScans, rate, sensorText } from '../bike-ai.js';
import {
  makeCourse, makeTerrain, Scatter, makeSky, makeBase, makeScanFx, makeGuideDots, makeSnow, makeMist,
  HZ, ITEMS, S0, SEC_LEN, STOP_GAP, HALF, EDGE,
} from '../bike-world.js';
import { loadBikeGLTF, loadWorldGLTF, modelKit, BikeRig, EchoRider, SwallowGuide, ScanDrone, makeArch, TIRE_NODES, TIRE_TOKENS } from '../bike-models.js';

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };
const easeOut = (k) => 1 - (1 - k) ** 3;

const V_NOM = 5.0; // m/s at bike scale with a neutral choice
const SCAN_T = 3.4; // seconds of scanning
const CHOOSE_T = EVENT ? 11 : 16; // seconds to choose
const BRAKE = 4.2; // m/s^2
const STAR_PTS = 40;
const CHOICE_PTS = 250; // right tire 150 + right pressure 100
const OVERRULE_PTS = 150;
const CLEAN_PTS = 250;
const TIME_PTS = 1000;
const MAX_SCORE = 5000;
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
    this.keys = { left: false, right: false };
    this.btn = { left: false, right: false };
    this.inputMode = 'none';
    this.win = { ...this.windowTarget() };
    this.envTarget = makeEnvironment(this.engine.renderer);
    this.prevEnvironment = this.engine.scene.environment;
    this.engine.scene.environment = this.envTarget.texture;
    this.prevBackdrop = this.engine.backdrop.visible;
    if (!this.engine.isXR) this.engine.backdrop.visible = false;
    this.prevFog = this.engine.scene.fog;
    this.buildStage();
    this.buildUI();
    this.setupInput();
    Promise.all([loadBikeGLTF(), loadWorldGLTF()])
      .then(([b, w]) => { if (!this.disposed) this.attachModels(b, w); })
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
    // Course group: course units, scaled down; moved so the bike stays at the stage origin.
    const cg = (this.cg = new THREE.Group());
    cg.scale.setScalar(S);
    cg.userData.noFit = true;
    st.add(cg);
    this.terrain = makeTerrain(this.course, this.clip);
    cg.add(this.terrain);
    this.fx = makeScanFx(this.course);
    cg.add(this.fx.group);
    this.dots = makeGuideDots();
    cg.add(this.dots);
    this.snow = makeSnow(this.course);
    cg.add(this.snow);
    this.mist = makeMist();
    cg.add(this.mist);
    // The diorama's earth base (headset; browser intro and results).
    const len0 = WIN.back * S;
    const len1 = -WIN.frontXR * S;
    this.base = makeBase(WIN.side * 2 * S, len0, len1, 0.07);
    st.add(this.base);
    // Light: a key light with a shadow over the window around the bike, a cool rim light.
    const key = new THREE.DirectionalLight(0xffffff, 1.55);
    key.position.set(-0.55, 1.4, 0.5);
    key.target.position.set(0, 0, -0.55);
    const rim = new THREE.DirectionalLight(hex('xr-bike-sky-1-low'), 0.6);
    rim.position.set(0.6, 0.6, -1.6);
    rim.target = key.target;
    st.add(key, key.target, rim);
    this.key = key;
    if (!quality.lite) {
      const r = this.engine.renderer;
      this.prevShadow = r.shadowMap.enabled;
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFSoftShadowMap;
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      Object.assign(key.shadow.camera, { left: -0.75, right: 0.75, top: 1.2, bottom: -1.0, near: 0.1, far: 3.2 });
      key.shadow.camera.updateProjectionMatrix();
      key.shadow.bias = -0.0006;
      key.shadow.normalBias = 0.01;
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
    this.stage.position.set(0, this.eye - num('xr-bike-table-drop'), num('xr-bike-table-z'));
  }

  /** The diorama window: narrow in the headset (and in the browser's intro and results). */
  windowTarget() {
    const narrow = this.engine.isXR || this.mode === 'intro' || this.mode === 'over';
    return narrow ? { back: WIN.back, front: WIN.frontXR, side: WIN.side } : { back: 9, front: WIN.front, side: 40 };
  }

  attachModels(bGltf, wGltf) {
    const B = modelKit(bGltf);
    const W = modelKit(wGltf, this.clip);
    const WU = modelKit(wGltf);
    this.kits = [B, W, WU];
    const c = this.course;
    this.bike = new BikeRig(B);
    this.cg.add(this.bike.root);
    this.bike.setTire(this.choice.tire);
    this.rider = new EchoRider(this.bike.lean, B);
    this.swallow = new SwallowGuide(WU);
    this.cg.add(this.swallow.root);
    this.drone = new ScanDrone(WU);
    this.cg.add(this.drone.root);
    // Props, hazards and items: instanced, only around the bike.
    const lite = quality.lite;
    const groups = new Map();
    for (const p of c.props) { if (!groups.has(p.n)) groups.set(p.n, []); groups.get(p.n).push(p); }
    const big = new Set(['PrTree', 'PrPine', 'PrPineSnow', 'PrLamp', 'PrSnowman', 'PrHay', 'PrFence', 'PrBush', 'PrLantern', 'PrSign', 'PrStump', 'PrRock', 'PrRockSnow']);
    for (const [n, list] of groups) this.scatters.push(new Scatter(this.cg, W.parts(n), list, c, { shadow: !lite && big.has(n) }));
    this.hzScatters = Object.entries(HZ).map(([type, spec]) => new Scatter(this.cg, W.parts(spec.node), c.hazards.filter((h) => h.type === type), c, { shadow: !lite }));
    const lift = { star: 0.62, cart: 0.55, shield: 0.66 };
    this.itemScatters = Object.entries(ITEMS).map(([type, node]) => new Scatter(this.cg, W.parts(node), c.items.filter((it) => it.type === type), c, { shadow: false, lift: lift[type] }));
    // The start and finish arches.
    this.arches = [[S0 - 0.8, t('bikeStart')], [c.finish, t('bikeFinish')]].map(([s, text]) => {
      const a = makeArch(W, text, this.clip);
      a.position.copy(c.point(s, 0));
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
    this.tirePreview.visible = false;
    this.ui.add(this.tirePreview);
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
    this.gauge = new Panel(0.36, 0.17, (ctx, c) => this.drawGauge(ctx, c));
    for (const p of [this.scanPanel, this.scanSmall, this.chip, this.gauge]) { p.visible = false; p.userData.noFit = true; ui.add(p); }
    // The choice console: tires, pressure, ride off.
    const con = (this.console = new THREE.Group());
    con.userData.w = 0.68;
    con.userData.h = 0.62;
    con.visible = false;
    ui.add(con);
    this.header = new Panel(0.68, 0.1, (ctx, c) => this.drawHeader(ctx, c));
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
      c.surface({ fill: color(s.hover ? 'xr-primary-hover' : 'xr-primary'), stroke: color('xr-primary-hover'), stripe: false });
      ctx.fillStyle = color('xr-on-primary');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = font('black', c.m(num('xr-text-lg')));
      ctx.fillText(t('bikeGo'), c.canvas.width / 2, c.canvas.height / 2);
      if (!this.engine.isXR && !this.engine.touchUI) {
        ctx.font = font('bold', c.m(num('xr-text-min')) * 0.8);
        ctx.textAlign = 'right';
        ctx.globalAlpha = 0.75;
        ctx.fillText('Space', c.canvas.width - c.m(0.025), c.canvas.height / 2);
        ctx.globalAlpha = 1;
      }
    });
    this.goBtn.userData.label = t('bikeGo');
    this.goBtn.userData.onClick = () => { sfx.click(); this.go(); };
    this.goBtn.position.set(0, -0.225, 0);
    con.add(this.goBtn);
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
    const items = [
      { icon: 'back', label: t('bikeLeft'), group: 'left', onPress: () => { this.btn.left = true; this.inputMode = 'keys'; }, onRelease: () => { this.btn.left = false; } },
      { icon: 'back', label: t('bikeRight'), group: 'right', onPress: () => { this.btn.right = true; this.inputMode = 'keys'; }, onRelease: () => { this.btn.right = false; } },
    ];
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
    this.padPort = this.touchButtons(items);
    const ep = lastPad();
    setIcon(ep, 0, CHEVRON);
    setIcon(ep, 1, CHEVRON, true);
    this.padLand = this.touchButtons(items, { grid: true });
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
    ctx.fillText(`${t('bikeRecommend')}:`, pad, y, W * 0.36);
    ctx.fillStyle = color(TIRE_TOKENS[rec.tire]);
    ctx.font = font('black', sm);
    ctx.fillText(t('bikeRecLine', { tire: t(`bikeTire_${rec.tire}`), press: t(`bikePress_${rec.pressure}`) }), pad + W * 0.36, y - (sm - mn) * 0.4, W - pad * 2 - W * 0.36);
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
    const tok = st === 'right' ? 'xr-success' : st === 'wrong' ? 'xr-warning' : scan.tricky ? 'xr-warning' : 'xr-bike-scan';
    c.surface({ stroke: color(tok), strokeWidth: num('xr-border-width') * 1.5, stripe: false });
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const mn = c.m(num('xr-text-sm'));
    ctx.font = font('black', mn);
    ctx.fillStyle = color(tok);
    const text = st === 'right' ? t('bikeChipAIRight') : st === 'wrong' ? t('bikeChipAIWrong', { terrain: this.terrainName(scan.terrain) }) : t('bikeChipAI', { terrain: this.terrainName(scan.top), conf: scan.conf });
    // a small check mark or cross after the reveal
    if (st !== 'ai') {
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
    ctx.fillText(text, c.m(st === 'ai' ? 0.03 : 0.075), H / 2, W - c.m(0.1));
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
  }

  drawHeader(ctx, c) {
    const W = c.canvas.width;
    const H = c.canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = color('xr-panel-text');
    ctx.font = font('black', c.m(num('xr-text-md')));
    ctx.fillText(t('bikeChoose'), c.m(0.01), H * 0.3, W * 0.6);
    ctx.fillStyle = color('xr-panel-muted');
    ctx.font = font('regular', c.m(num('xr-text-min')));
    ctx.fillText(t('bikeChooseHint'), c.m(0.01), H * 0.75, W * 0.8);
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

  aiBadge(ctx, c, x, y) {
    const txt = t('bikeAIPick');
    ctx.font = font('black', c.m(num('xr-text-min')) * 0.78);
    const w = ctx.measureText(txt).width + c.m(0.016);
    const h = c.m(0.028);
    ctx.fillStyle = color(this.scans[this.sec].tricky ? 'xr-warning' : 'xr-bike-scan');
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
    if (BEST[this.scans[this.sec].top].tire === kind && this.mode === 'choose') this.aiBadge(ctx, c, W - c.m(0.008), c.m(0.008));
    if (!this.engine.isXR && !this.engine.touchUI) {
      ctx.font = font('bold', c.m(num('xr-text-min')) * 0.7);
      ctx.fillStyle = color('xr-panel-muted');
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(String(i + 1), c.m(0.01), c.m(0.008));
    }
  }

  drawPressTile(ctx, c, kind, s, i) {
    const sel = this.choice.pressure === kind;
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
    if (BEST[this.scans[this.sec].top].pressure === kind && this.mode === 'choose') this.aiBadge(ctx, c, W - c.m(0.008), c.m(0.008));
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
      else if (/^Digit[1-4]$/.test(c) && this.mode === 'choose') this.pickTire(TIRES[Number(c[5]) - 1]);
      else if (/^Digit[5-7]$/.test(c) && this.mode === 'choose') this.pickPressure(PRESSURES[Number(c[5]) - 5]);
      else if (c === 'Space' || c === 'Enter' || c === 'NumpadEnter') {
        e.preventDefault();
        if (e.repeat) return;
        if (this.mode === 'choose') this.go();
        else if (this.mode === 'flat') this.pumpOnce();
      }
    };
    const up = (e) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this.keys.left = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this.keys.right = false;
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
    // Headset: the trigger (or a pinch) pumps a flat tire.
    this.engine.onEmptyPress = () => { if (this.mode === 'flat') this.pumpOnce(); };
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

  /** Browser with a mouse: the bike heads for where the pointer points on the ground. */
  readMouse() {
    const e = this.engine;
    const m = e.mouse;
    if (e.isXR || e.touchUI || !m?.active) return null;
    const moved = !this.lastNdc || Math.abs(m.ndc.x - this.lastNdc.x) > 1e-4 || Math.abs(m.ndc.y - this.lastNdc.y) > 1e-4;
    this.lastNdc = (this.lastNdc ?? new THREE.Vector2()).copy(m.ndc);
    if (moved) this.inputMode = 'mouse';
    if (this.inputMode !== 'mouse') return null;
    const ray = new THREE.Raycaster();
    ray.setFromCamera(m.ndc, e.camera);
    const n = new THREE.Vector3(0, 1, 0).transformDirection(this.stage.matrixWorld);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, this.stage.getWorldPosition(new THREE.Vector3()));
    const hit = ray.ray.intersectPlane(plane, new THREE.Vector3());
    if (!hit) return null;
    const local = this.cg.worldToLocal(hit);
    const s = -local.z;
    if (s < this.sB + 0.5) return null;
    const d = this.course.dcx(s);
    return clamp((local.x - this.course.cx(s)) * Math.sqrt(1 + d * d), -EDGE + 0.1, EDGE - 0.1);
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
      pts: { choice: 0, overrule: 0, stars: 0, clean: 0, time: 0 }, starsTaken: 0, flats: 0, punctures: 0,
      hzIdx: 0, itIdx: 0, choices: [], secStats: [], wobble: 0, slowT: 0, slipT: 0, slipV: 0, mudT: 0,
    });
    this.course.hazards.forEach((h) => { h.hit = false; h.passed = false; });
    this.course.items.forEach((it) => { it.taken = false; it.hidden = false; });
    this.itemScatters?.forEach((sc) => { sc.dirty = true; });
    this.ui.visible = true;
    this.beginScan(0);
  }

  hudText() {
    const n = Math.min(4, (this.sec ?? 0) + 1);
    return t('bikeHud', { name: t('bikeName'), n, time: fmtTime(this.rideT ?? 0), score: this.liveScore() });
  }

  liveScore() {
    const p = this.pts;
    if (!p) return 0;
    return Math.min(MAX_SCORE, p.choice + p.overrule + p.stars + p.clean + p.time);
  }

  beginScan(i) {
    this.sec = i;
    this.mode = 'scan';
    this.phaseT = 0;
    this.scanProg = 0;
    this.chipState = 'ai';
    const sec = this.course.sections[i];
    this.fx.grid(sec.b0 + 0.3, sec.b0 + 9.6);
    const scan = this.scans[i];
    this.mistOn = scan.why === 'fog' || scan.why === 'dust';
    if (this.mistOn) this.mist.userData.place(this.course, sec.b0, scan.why === 'dust' ? 'xr-bike-gravel-light' : 'xr-bike-fog-mist');
    this.choice = { tire: BEST[scan.top].tire, pressure: BEST[scan.top].pressure };
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
    this.pop(this.console);
    sfx.appear();
    this.rider?.mood('happy', 1);
  }

  pickTire(k) {
    if (this.mode !== 'choose') return;
    this.choice.tire = k;
    this.bike?.setTire(k);
    sfx.click();
    this.redrawConsole();
    this.gauge.redraw();
  }

  pickPressure(k) {
    if (this.mode !== 'choose') return;
    this.choice.pressure = k;
    sfx.tick();
    this.redrawConsole();
    this.gauge.redraw();
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
    const a = this.arches?.[1];
    if (a) {
      const p = a.getWorldPosition(new THREE.Vector3());
      ['xr-bike-confetti-1', 'xr-bike-confetti-2', 'xr-bike-confetti-3', 'xr-bike-confetti-4'].forEach((tok, k) => {
        this.delay(k * 0.18, () => { if (!this.disposed) this.burst(p.clone().add(new THREE.Vector3((k - 1.5) * 0.12, 0.45, 0)), tok, 30); });
      });
    }
  }

  finish() {
    if (this.mode === 'over') return;
    // Time: from the best possible ride to 60 % slower.
    const dist = this.course.finish - (S0 - STOP_GAP);
    const best = dist / (V_NOM * 1.08) + 4 * 1.6;
    const slow = best * 1.6;
    this.pts.time = Math.round(TIME_PTS * clamp((slow - this.rideT) / (slow - best), 0, 1));
    const score = Math.min(MAX_SCORE, Math.round(this.pts.choice + this.pts.overrule + this.pts.stars + this.pts.clean + this.pts.time));
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
      line: t('bikeLine', { right, flats: this.flats, stars: this.starsTaken, time: fmtTime(this.rideT) }),
      learned: this.learned(),
      onAgain: () => this.app.startGame('bike'),
    });
  }

  /** Takeaways about the AI: confidence, when it was wrong, overruling, who decides. */
  learned() {
    const out = [];
    const first = this.choices[0]?.scan ?? this.scans[0];
    out.push({ q: t('bikeLearnConfQ', { terrain: this.terrainName(first.top), conf: first.conf }), a: t('bikeLearnConfA') });
    const wrong = this.choices.find((c) => c?.scan.tricky === 'wrong');
    const unsure = this.choices.find((c) => c?.scan.tricky === 'unsure');
    if (wrong) {
      const v = { terrain: this.terrainName(wrong.scan.terrain), conf: wrong.scan.conf, why: t(`bikeWhy_${wrong.scan.why}`).replace(/^./, (ch) => ch.toUpperCase()) };
      out.push(wrong.overruled ? { q: t('bikeLearnOverruleQ'), a: t('bikeLearnOverruleA', v) } : { q: t('bikeLearnWrongQ', v), a: t('bikeLearnWrongA', v) });
    } else if (unsure) {
      out.push({ q: t('bikeLearnUnsureQ'), a: t('bikeLearnUnsureA', { terrain: this.terrainName(unsure.scan.terrain), conf: unsure.scan.conf }) });
    }
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
    this.placeStage();
    this.updateWindow(dt);
    switch (this.mode) {
      case 'scan': this.updateScan(dt); break;
      case 'choose': this.updateChoose(dt); break;
      case 'ride': case 'brake': this.updateRide(dt); break;
      case 'flat': this.updateFlat(dt); break;
      case 'finish': this.updateFinish(dt); break;
      default: break;
    }
    this.positionCourse();
    this.updateActors(dt);
    if (!e.isXR) this.updateCamera(dt);
    this.layoutUI(dt);
    if (this.toastPanel && (this.toastT -= dt) <= 0) { this.toastPanel.removeFromParent(); this.toastPanel.dispose(); this.toastPanel = null; }
    const riding = this.mode === 'ride' || this.mode === 'brake';
    const portrait = window.innerWidth < window.innerHeight;
    this.padPort?.show(riding && portrait);
    this.padLand?.show(riding && !portrait);
    this.pumpPad?.show(this.mode === 'flat');
    if (Math.floor(this.time * 4) !== this.hudTick) {
      this.hudTick = Math.floor(this.time * 4);
      if (this.mode !== 'intro' && this.mode !== 'over') {
        this.refreshHud?.();
        if (riding || this.mode === 'flat') this.gauge.redraw();
        if (this.mode === 'choose') this.header.redraw();
      }
    }
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
    this.base.userData.scroll(this.sB, 12);
  }

  updateScan(dt) {
    this.phaseT += dt;
    const k = this.phaseT;
    this.scanProg = clamp((k - 0.7) / (SCAN_T - 1.0), 0, 0.999);
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
    if (this.mode === 'brake') {
      const left = Math.max(0, this.stopS - this.sB);
      this.speed = Math.min(this.speed, Math.sqrt(2 * BRAKE * left));
      if (left < 0.03 || this.speed < 0.08) {
        this.sB = this.stopS;
        this.speed = 0;
        this.endSection(this.sec);
        this.beginScan(this.sec + 1);
        return;
      }
    } else {
      this.speed += (vT - this.speed) * Math.min(1, dt * (vT > this.speed ? 1.3 : 2.5));
    }
    // Lateral: towards the target, slower with little grip; drift outwards in curves.
    const vmax = 2.4 + 1.6 * g;
    const want = clamp((this.target - this.u) * 5, -vmax, vmax);
    this.latV += (want - this.latV) * Math.min(1, dt * (2.5 + 7 * g));
    const drift = -c.ddcx(this.sB) * this.speed * this.speed * (1 - g) * 0.6;
    let lat = this.latV + drift;
    if (this.slipT > 0) lat = this.latV * 0.3 + this.slipV * (this.slipT / 1.1);
    this.u = clamp(this.u + lat * dt, -EDGE, EDGE);
    this.latNow = lat;
    const prev = this.sB;
    this.sB += this.speed * dt;
    if (st) { st.ride += dt; if (off) st.off += dt; }
    if (off && !this.offWarned && this.mode === 'ride') { this.offWarned = true; this.toast(t('bikeOffTrail'), null, 'xr-warning', 1.4); }
    if (!off) this.offWarned = false;
    this.collide(prev, this.sB);
    if (!this.revealed && this.phaseT > 2.4) this.reveal();
    // The end of the section: brake to a stop for the next scan; after the last: the finish.
    if (this.sec < 3 && this.mode === 'ride') {
      this.stopS = c.sections[this.sec + 1].b0 - STOP_GAP;
      if (this.sB >= this.stopS - (this.speed * this.speed) / (2 * BRAKE) - 0.05) this.mode = 'brake';
    } else if (this.sec === 3 && this.sB >= c.finish) {
      this.beginFinish();
    }
    if (this.air < AIR_FLAT && this.mode === 'ride') this.beginFlat();
  }

  collide(s0, s1) {
    const c = this.course;
    const H = c.hazards;
    while (this.hzIdx < H.length && H[this.hzIdx].s <= s1) {
      const h = H[this.hzIdx++];
      if (h.s < s0 - 0.5) continue;
      if (Math.abs(this.u - h.v) < h.r + 0.2) this.hitHazard(h);
      else h.passed = true;
    }
    const I = c.items;
    while (this.itIdx < I.length && I[this.itIdx].s <= s1) {
      const it = I[this.itIdx++];
      if (it.s < s0 - 0.5 || it.taken) continue;
      if (Math.abs(this.u - it.v) < 0.62) this.collect(it);
    }
  }

  haptic(k, ms) {
    for (const p of this.engine.pointers) if (p.kind === 'xr' && p.active) this.engine.haptic(p, k, ms);
  }

  worldAt(s, v, y = 0.4) {
    const p = this.course.point(s, v);
    p.y = y;
    return this.cg.localToWorld(p);
  }

  hitHazard(h) {
    h.hit = true;
    const spec = HZ[h.type];
    const name = t(`bikeHz_${h.type}`);
    const st = this.secStats[this.sec];
    const at = this.worldAt(h.s, h.v, 0.3);
    const tire = this.choice.tire;
    const g = this.rating.grip;
    switch (spec.cls) {
      case 'sharp':
        if (this.shields > 0) {
          this.shields -= 1;
          this.bike?.setBand(this.shields, true);
          this.toast(t('bikeShieldSaved', { n: this.shields }), null, 'xr-bike-band', 1.6);
          sfx.tink();
          this.burst(at, 'xr-bike-band', 18);
          this.haptic(0.4, 40);
          return;
        }
        this.air -= 30 + 16 * (1 - g);
        this.punctures += 1;
        this.wobble = 1;
        this.slowT = 0.8;
        this.toast(t('bikePuncture', { name }), null, 'xr-danger', 1.6);
        sfx.shatter();
        this.burst(at, 'xr-danger', 20);
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
        this.burst(at, 'xr-bike-mud', 16);
        this.haptic(0.5, 120);
    }
    if (st) st.hits += 1;
    this.gauge.redraw();
  }

  collect(it) {
    it.taken = true;
    it.hidden = true;
    this.itemScatters?.forEach((sc) => { sc.dirty = true; });
    const at = this.worldAt(it.s, it.v, 0.6);
    if (it.type === 'star') {
      this.starsTaken += 1;
      this.pts.stars += STAR_PTS;
      sfx.coin();
      this.burst(at, 'xr-bike-gold', 14);
      this.rider?.mood('happy', 0.6);
      this.haptic(0.3, 25);
    } else if (it.type === 'cart') {
      const add = Math.round(Math.min(40, 100 - this.air));
      this.air = Math.min(100, this.air + 40);
      this.toast(t('bikeCartridge', { n: Math.max(0, add) }), null, 'xr-bike-cartridge-band', 1.6);
      sfx.powerup();
      this.burst(at, 'xr-bike-cartridge-band', 18);
    } else {
      this.shields = 3;
      this.bike?.setBand(3, true);
      this.toast(t('bikeShieldItem', { n: 3 }), null, 'xr-bike-band', 1.8);
      sfx.powerup();
      this.burst(at, 'xr-bike-band', 24);
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
    this.rideT += 0;
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
    this.cg.position.set(-(p.x * ca + p.z * sa) * this.S, 0, -(-p.x * sa + p.z * ca) * this.S);
  }

  updateActors(dt) {
    const c = this.course;
    const s = this.sB;
    const riding = this.mode === 'ride' || this.mode === 'brake' || this.mode === 'finish';
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
    // Bike and rider.
    if (this.bike) {
      const yawRel = -Math.atan2(this.latNow ?? 0, Math.max(1.5, this.speed)) * 0.9;
      this.bike.root.position.copy(c.point(s, this.u));
      this.bike.root.rotation.y = c.yaw(s) + (riding ? yawRel : 0);
      const steer = clamp(yawRel * 1.4 - c.ddcx(s) * 4, -0.45, 0.45) * (riding ? 1 : 0);
      this.bike.update(dt, { speed: this.speed, steer, roll: -clamp((this.latNow ?? 0) * 0.07, -0.25, 0.25) * (riding ? 1 : 0), wobble: this.wobble ?? 0 });
      this.bike.setBand(this.shields ?? 0);
      const look = this.mode === 'scan' ? this.drone?.root : this.mode === 'choose' || this.mode === 'over' || this.mode === 'intro' ? null : this.swallow?.root;
      const lookWorld = look ? look.getWorldPosition(new THREE.Vector3()) : this.engine.camera.getWorldPosition(new THREE.Vector3());
      this.rider?.update(dt, { speed: this.speed, turn: this.mode === 'choose' || this.mode === 'intro' ? 0.7 : 0, steer: clamp((this.latNow ?? 0) * 0.15, -0.4, 0.4), lookWorld, pedal: this.bike.crank });
    }
    // The pump next to the bike while the tire is flat.
    if (this.pump) {
      this.pump.visible = this.mode === 'flat';
      if (this.pump.visible) {
        this.pump.position.copy(c.point(s - 0.2, this.u + (this.u > 1 ? -0.75 : 0.75)));
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
        want.y = 2.0 + Math.sin(time * 1.7) * 0.15;
      } else {
        const a = time * 0.9;
        want = c.point(s + 3.5 + Math.sin(a) * 1.4, Math.cos(a) * 1.6);
        want.y = 2.5 + Math.sin(time * 1.3) * 0.2;
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
      const sd = scanning ? sec.b0 + 2.4 : s + 3.6;
      const want = c.point(sd, scanning ? 0 : -1.6 + Math.sin(time * 0.6) * 0.3);
      want.y = scanning ? 3.6 : 3.0 + Math.sin(time * 2) * 0.08;
      d.position.lerp(want, Math.min(1, dt * 2));
      d.rotation.set(scanning ? 0.18 : 0.06, c.yaw(sd), Math.sin(time * 1.4) * 0.05, 'YXZ');
      this.drone.update(dt);
      // The scan beam and grid.
      let alpha = 0;
      let reveal = -1e9;
      let gridA = 0;
      let sLine = sec.b0;
      if (this.mode === 'scan') {
        const k = this.phaseT;
        alpha = smooth(0.5, 0.9, k) * (1 - smooth(SCAN_T - 0.35, SCAN_T, k));
        sLine = sec.b0 + 0.4 + clamp((k - 0.8) / (SCAN_T - 1.2), 0, 1) * 9;
        reveal = sLine;
        gridA = smooth(0.6, 1, k);
      } else if (this.mode === 'choose') {
        reveal = sec.b0 + 11;
        gridA = 0.7;
      } else if (riding && this.phaseT < 2) {
        reveal = sec.b0 + 11;
        gridA = 0.7 * (1 - this.phaseT / 2);
      }
      d.updateMatrixWorld(true);
      const apex = this.cg.worldToLocal(d.localToWorld(this.drone.lens.clone()));
      this.fx.set({ apex, sLine, alpha, reveal, gridAlpha: gridA, warn: this.scanProg >= 0.99 && !!this.scans[this.sec ?? 0]?.tricky });
    }
    // The big tire beside the console turns slowly, so its tread reads well.
    if (this.previewTires) {
      for (const [k, sp] of Object.entries(this.previewTires)) { sp.visible = k === this.choice.tire; sp.rotation.x = -time * 0.7; }
      if (this.previewRim) this.previewRim.rotation.x = -time * 0.7;
    }
    // The swallow's light dots on the best line.
    this.dotsA = lerp(this.dotsA ?? 0, this.mode === 'ride' ? 1 : 0, Math.min(1, dt * 3));
    this.dots.userData.set(c, s, time, this.dotsA);
    // Snow over the snow section, mist where the scanner was blinded.
    const kind = c.sectionAt(s + 4).kind;
    this.snow.userData.update(dt, s, kind === 'snow' && this.mode !== 'intro', this.S);
    const sec = c.sections[this.sec ?? 0];
    const mistWant = this.mistOn && (this.mode === 'scan' || this.mode === 'choose' || (riding && s < sec.b0 + 14)) ? 1 : 0;
    this.mistA = lerp(this.mistA ?? 0, mistWant, Math.min(1, dt * 1.5));
    this.mist.userData.fade(this.mistA, time);
    // Sky and fog follow the section (browser).
    if (this.sky) this.sky.visible = !this.engine.isXR;
    if (this.sky && !this.engine.isXR) {
      const [top, low] = SKY[clamp(this.sec ?? 0, 0, 3)];
      const k = Math.min(1, dt * 0.8);
      this.skyTop.lerp(new THREE.Color(hex(top)), k);
      this.skyLow.lerp(new THREE.Color(hex(low)), k);
      if (Math.floor(time * 5) !== this.skyTick) { this.skyTick = Math.floor(time * 5); this.sky.userData.setColors(this.skyTop, this.skyLow); }
      this.sky.position.copy(this.group.worldToLocal(this.engine.camera.getWorldPosition(new THREE.Vector3())));
      const fogOn = this.mode !== 'intro' && this.mode !== 'over';
      if (fogOn) {
        if (!this.fog) this.fog = new THREE.Fog(0xffffff, 1, 4);
        this.fog.color.copy(this.skyLow);
        this.fog.near = 1.6;
        this.fog.far = (this.win.front - 3) * this.S;
        this.engine.scene.fog = this.fog;
      }
    }
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
    if (this.mode === 'scan') { pos = [bx * 0.5, portrait ? 0.62 : 0.52, portrait ? 0.62 : 0.55]; look = [0, 0, -0.95]; }
    else if (this.mode === 'choose') { pos = portrait ? [0.2, 0.32, 0.52] : [0.28, 0.24, 0.42]; look = [0, 0.03, -0.5]; fov = portrait ? 62 : 50; }
    else if (this.mode === 'finish') { const a = 0.5 + this.phaseT * 0.35; pos = [Math.sin(a) * 0.42 + bx, 0.2, Math.cos(a) * 0.42]; look = [bx, 0.08, 0]; }
    else { pos = [bx, portrait ? 0.46 : 0.34, portrait ? 0.72 : 0.58]; look = [bx * 1.1, 0, portrait ? -0.62 : -0.82]; }
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
    const show = {
      scanPanel: m === 'scan' || m === 'choose',
      chip: m === 'ride' || m === 'brake' || m === 'flat',
      gauge: m === 'ride' || m === 'brake' || m === 'flat' || m === 'scan' || m === 'choose' || m === 'finish',
      console: m === 'choose',
      pumpBtn: m === 'flat' && !this.engine.touchUI,
      tirePreview: m === 'choose',
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
      const con = this.console;
      con.visible = show.console;
      placeOnArc(con, 0.6, this.eye - 0.12, 0.95);
      con.rotation.x = -0.12;
      con.scale.setScalar(popK(con));
      this.layoutTiles();
      const tp = this.tirePreview;
      if (tp) {
        tp.visible = show.tirePreview;
        placeOnArc(tp, 0.6, this.eye + 0.33, 0.98);
        tp.rotateY(0.9);
        tp.scale.setScalar(0.42);
      }
      const st = this.stage.position;
      this.gauge.visible = show.gauge;
      this.gauge.position.set(st.x - 0.34, st.y + 0.13, st.z + 0.26);
      this.gauge.rotation.set(-0.7, 0.35, 0);
      this.gauge.scale.setScalar(popK(this.gauge));
      this.chip.visible = show.chip;
      this.chip.position.set(st.x + 0.34, st.y + 0.13, st.z + 0.26);
      this.chip.rotation.set(-0.7, -0.35, 0);
      this.chip.scale.setScalar(popK(this.chip));
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
      const w = obj.userData.w ?? obj.w;
      const h = obj.userData.h ?? obj.h;
      const k = (ppm / pxPerM) * popK(obj) * (obj.userData.hoverK ?? 1);
      obj.scale.setScalar(k);
      obj.position.set((2 * x - 1) * hw + (0.5 - ax) * w * k, (1 - 2 * y) * hh + (ay - 0.5) * h * k, -D);
      obj.rotation.set(0, 0, 0);
      return { w: (w * ppm), h: (h * ppm) };
    };
    const top = (ins.top + 8) / H;
    let freeTop = top;
    let freeBot = 1 - (ins.bottom + 6) / H;
    const desk = num('xr-bike-ui-px') * clamp(H / 760, 0.75, 1.35);
    const phone = num('xr-bike-ui-px-phone');
    for (const k of ['scanPanel', 'chip', 'gauge', 'console', 'pumpBtn']) this[k].visible = show[k];
    this.scanSmall.visible = false;
    if (this.tirePreview) this.tirePreview.visible = show.tirePreview && !touch;
    // Top bar (desktop: the 3D status bar and the menu button).
    if (!touch && this.hudObjs) {
      const [info, menu] = this.hudObjs;
      if (info) place(info, 0.012, 0.015, 0, 0, desk * 0.8);
      if (menu) place(menu, 0.988, 0.015, 1, 0, desk * 0.8);
      freeTop = (0.015 * H + 0.15 * desk * 0.8 + 8) / H;
    }
    if (!touch) {
      if (show.scanPanel) place(this.scanPanel, 0.012, freeTop + 0.01, 0, 0, desk * 0.82);
      if (show.console) { place(this.console, 0.988, 0.56, 1, 0.5, desk * 0.9); this.layoutTiles(); }
      if (show.tirePreview && this.tirePreview) {
        const yTop = freeTop + 0.01 + (0.6 * desk * 0.82) / H;
        const r = (0.17 * desk) / pxPerM;
        this.tirePreview.position.set((2 * 0.012 - 1) * hw + r * 1.15, (1 - 2 * (yTop + 0.03)) * hh - r * 1.1, -D);
        this.tirePreview.scale.setScalar(r / 0.36);
        this.tirePreview.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.9);
      }
      if (show.chip) place(this.chip, 0.012, freeTop + 0.01, 0, 0, desk * 0.85);
      if (show.gauge) place(this.gauge, 0.012, 0.985, 0, 1, desk * 0.9);
      if (this.toastPanel) place(this.toastPanel, 0.5, freeTop + 0.07, 0.5, 0, desk * 0.85);
      if (show.pumpBtn) place(this.pumpBtn, 0.5, 0.72, 0.5, 0.5, desk);
      this.freeShift = 0;
      return;
    }
    // Phones.
    const gap = 6 / H;
    if (portrait) {
      const fitW = (W - 12) / 0.68;
      const ppm = Math.min(phone * 1.25, fitW);
      if (m === 'choose') {
        const s = place(this.scanSmall, 0.5, top, 0.5, 0, ppm);
        this.scanSmall.visible = true;
        this.scanPanel.visible = false;
        const c = place(this.console, 0.5, 1 - gap, 0.5, 1, ppm);
        this.layoutTiles();
        freeTop = top + s.h / H;
        freeBot = 1 - gap - c.h / H;
      } else if (show.scanPanel) {
        const s = place(this.scanPanel, 0.5, top, 0.5, 0, ppm);
        freeTop = top + s.h / H;
      }
      const small = Math.min(phone, (W - 18) / 0.88);
      if (show.chip) place(this.chip, 0.012, top, 0, 0, small);
      if (show.gauge && m !== 'choose' && m !== 'scan') {
        const gs = place(this.gauge, 0.988, top, 1, 0, small);
        freeTop = Math.max(freeTop, top + gs.h / H);
      } else this.gauge.visible = false;
      if (this.toastPanel) place(this.toastPanel, 0.5, Math.max(freeTop + gap, top + 0.11), 0.5, 0, Math.min(ppm, phone * 1.1));
    } else {
      const avail = H - ins.top - 12;
      if (m === 'choose') {
        const ppmS = Math.min(phone, avail / 0.36, (W * 0.42) / 0.66);
        place(this.scanSmall, 0.008, top, 0, 0, ppmS);
        this.scanSmall.visible = true;
        this.scanPanel.visible = false;
        const ppmC = Math.min(phone * 1.1, avail / 0.62, (W * 0.5) / 0.68);
        place(this.console, 0.992, top + (1 - top) / 2, 1, 0.5, ppmC);
        this.layoutTiles();
      } else if (show.scanPanel) {
        place(this.scanPanel, 0.008, top, 0, 0, Math.min(phone, avail / 0.6));
      }
      const small = Math.min(phone * 0.9, (W * 0.3) / 0.52);
      if (show.chip) place(this.chip, 0.008, top, 0, 0, small);
      if (show.gauge && m !== 'choose' && m !== 'scan') place(this.gauge, 0.992, top, 1, 0, small);
      else this.gauge.visible = false;
      if (this.toastPanel) place(this.toastPanel, 0.5, top + 0.02, 0.5, 0, Math.min(phone, (W * 0.44) / 0.64));
    }
    // The bike in the middle of the free band between the panels.
    const mid = (freeTop + freeBot) / 2; // 0 top .. 1 bottom
    this.freeShift = clamp(1 - 2 * mid, -0.8, 0.8);
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
    if (this.prevShadow !== undefined) this.engine.renderer.shadowMap.enabled = this.prevShadow;
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
