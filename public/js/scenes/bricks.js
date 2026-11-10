// "Stein auf Stein" / "Brick by Brick": build your own house by hand, part by part. A garden plot
// lies on the table with a foundation and the plan of the house as a hologram. Every month (a
// few seconds) the savings machine takes the month's savings and sends building parts down the
// belt to the pallet: bricks, double bricks, half bricks, sandstone corner stones, window and door
// frames (a golden interest brick for every 8 saved). You take a part (headset: grab it with the
// grip or trigger button or pinch it; browser: drag it with the mouse or a finger, or tap part and
// place) and set it on a glowing place, in bond from the bottom up. Statics: a part resting on
// only part of what belongs below it wobbles (and costs points) until the gap is filled; in the
// headset a part let go askew sits skewed. Life events (moving in together, a baby, a new job, an
// inheritance or parents who need help) ask for real choices that change the plan (an extension,
// the attic room, solar roof, terrace), the target and the forecast. Next door the Winters build
// too, with their own saving style; whoever reaches the allotment first gets a bonus. The AI
// forecast (bricks-ai.js) learns from the months so far and predicts both allotments with an 80 %
// band. After the allotment the loan builds along: the crane lowers whole walls, you set the
// lintels over the openings and the roof trusses, then the roof comes, and it should be on before
// the first snow. Then the lights go on, the door opens and Echo comes over to celebrate.
import * as THREE from 'three';
import { BaseScene } from '../scene.js';
import { Button, Panel, textPanel, placeOnArc } from '../ui3d.js';
import { color, hex, num } from '../tokens.js';
import { t } from '../i18n.js';
import { sfx } from '../sfx.js';
import { music } from '../music.js';
import { quality } from '../quality.js';
import { makeEnvironment } from '../robot-visuals.js';
import { CHRISTMAS, makeLightString, makeBulbs } from '../christmas.js';
import { makeSnowfall, setSnowAmount } from '../snow.js';
import { EVENTS, EVENT_INHERIT, EVENT_PARENTS, STYLES } from '../bricks-text.js';
import { Plan, L, H, D, GAP, TOP, FOUND, HOUSE_Z, RIDGE, EAVE, OX, OZ, ZH, ANNEX_COURSES, BASE_TARGET } from '../bricks-plan.js';
import { Forecaster } from '../bricks-ai.js';
import { loadBricks, plainPlot, BrickField, GhostPlan, Crane, Puffs, bsfx, drawMonthDisplay, makeFamily } from '../bricks-visuals.js';
import { eventPanel, drawChart, drawSign } from '../bricks-panels.js';

const MONTH = 4.5; // seconds per month
const MAX_MONTHS = 44; // then the allotment comes anyway
const SNOW_AT = 32; // the first snow
const INTEREST_EVERY = 8; // a golden brick for every 8 saved
const CREDIT_CAP = 4; // savings waiting for the pallet; more is a missed deposit
const SPOTS = 3; // rows on the pallet
const BELT_TIME = 1.0;
const COST = { single: 1, double: 2, half: 1, corner: 1, window: 2, door: 3 };
const PTS = { place: 20, clean: 10, gold: 50, wobble: 40, skew: 25, hand: 20, race: 400, allot: 200, dry: 300, wet: 250, speed: 1000, room: 150 };
const FAST = 17; // allotment month for the full speed bonus
const SLOW = 38;
// Headset placement: the plot below eye height within reach.
const PLOT_DROP = 0.58;
const PLOT_Z = -0.52;
// Plot-local positions (meters, origin in the middle of the grass top).
const HOUSE = new THREE.Vector3(0, FOUND, HOUSE_Z);
const MACHINE = new THREE.Vector3(0.47, 0.002, -0.27);
const BELT_X = 0.47;
const BELT_Z0 = -0.18;
const BELT_LEN = 0.25;
const BELT_Y = 0.047;
const PALLET = new THREE.Vector3(0.47, 0.002, 0.19);
const PALLET_TOP = 0.027;
const SPOT_Z = [-0.05, 0, 0.05];
const CRANE_AT = new THREE.Vector3(-0.06, 0, -0.335);
const HOOK_AT = new THREE.Vector3(0.38, 0.4, -0.05); // where the crane hands over a roof truss
const BAG_AT = new THREE.Vector3(0.3, 0, 0.3);
const FIR = new THREE.Vector3(-0.4, 0, 0.27);
const CHIMNEY = new THREE.Vector3(0.12, TOP + RIDGE * 1.15 + 0.012, -0.07); // house-local
const DRAG_Y = 0.28;
const BH = H - GAP;
// Height of a part's origin above the pallet when it stands there.
const REST_Y = { window: 0.05, door: 0.078, truss: 0.0 };
const clamp = THREE.MathUtils.clamp;
const ease = (k) => k * k * (3 - 2 * k);
const ONE = new THREE.Vector3(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0);
const rnd = (a, b) => a + Math.random() * (b - a);
const pickOf = (arr) => arr[Math.floor(Math.random() * arr.length)];

/** Piece kind a part fills (the plan's target kinds). */
const targetKind = (kind) => (kind === 'gold' ? 'single' : kind);
/** Parts that may be set on a place that is only partly supported (they wobble then). */
const MAY_WOBBLE = new Set(['single', 'double', 'half', 'corner', 'gold']);

export class BricksScene extends BaseScene {
  constructor(app) {
    super(app);
    this.gameKey = 'bricks';
    this.mode = 'intro';
    this.time = 0;
    this.plan = new Plan();
    this.target = BASE_TARGET;
    this.ai = new Forecaster({ target: this.target, prior: 1.5, priorVar: 0.5 });
    this.history = [0];
    this.marks = [];
    this.items = [];
    this.spots = new Array(SPOTS).fill(null);
    this.queue = [];
    this.grabs = new Map();
    this.ctrlIndex = new Map();
    this.reserved = new Set();
    this.month = 1;
    this.monthT = 0;
    this.score = 0;
    this.opts = { annex: false, dormer: true, solar: false, garden: false };
    this.rooms = 5;

    this.envTarget = makeEnvironment(this.engine.renderer);
    this.prevEnvironment = this.engine.scene.environment;
    this.engine.scene.environment = this.envTarget.texture;

    this.world = new THREE.Group();
    this.world.userData.noFit = true;
    // On screens the plot would stand in front of the intro panel: it appears with the start.
    this.world.visible = this.engine.isXR;
    this.group.add(this.world);
    this.plotRoot = new THREE.Group();
    this.plotRoot.position.set(0, this.eye - PLOT_DROP, PLOT_Z);
    this.world.add(this.plotRoot);
    this.home = new THREE.Group();
    this.home.position.copy(HOUSE);
    this.plotRoot.add(this.home);
    this.puffs = new Puffs(this.plotRoot);
    this.addLights();
    // Screen elements in the 3D view: holders the layout moves around.
    this.chartHolder = this.holder();
    this.toastHolder = this.holder();
    this.cardHolder = this.holder();
    this.placeXR();

    this.ready = loadBricks().then((M) => { if (!this.disposed) this.build(M); });
    this.setupInput();
    this.onUpdate((dt) => this.update(dt));
    const hint = t(this.engine.isXR ? 'bricksIntroXR' : this.engine.touchUI ? 'bricksIntroTouch' : 'bricksIntroScreen');
    this.intro(t('bricksName'), `${t('bricksIntro')} ${hint}`, () => this.start());
  }

  holder() {
    const g = new THREE.Group();
    g.userData.noFit = true;
    this.group.add(g);
    return g;
  }

  // ---------- world ----------

  addLights() {
    const key = new THREE.DirectionalLight(hex('xr-bricks-key-light'), 1.5);
    key.position.set(-0.55, 1.25, 0.75);
    key.target.position.set(0.05, 0, 0);
    const rim = new THREE.DirectionalLight(hex('xr-bricks-rim-light'), 0.7);
    rim.position.set(0.7, 0.8, -0.9);
    rim.target = key.target;
    this.plotRoot.add(key, key.target, rim);
    if (!quality.lite) {
      const r = this.engine.renderer;
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFSoftShadowMap;
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      Object.assign(key.shadow.camera, { left: -0.75, right: 0.75, top: 0.75, bottom: -0.75, near: 0.3, far: 3 });
      key.shadow.camera.updateProjectionMatrix();
      key.shadow.bias = -0.0004;
      key.shadow.normalBias = 0.006;
    }
  }

  build(M) {
    this.M = M;
    const plot = M.make('Plot') ?? plainPlot(M.mats);
    plot.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; o.castShadow = true; } });
    this.plotRoot.add(plot);
    // The house's glass lights up at the end (own material for frames and roof).
    this.glass = M.mats.Glass.clone();
    this.glass.emissive = new THREE.Color(hex('xr-bricks-window-light'));
    this.glass.emissiveIntensity = 0;
    this.makeField();
    this.doorPivot = new THREE.Group();
    this.doorPivot.position.set(-L / 2 + 0.0065, 2.5 * H - 0.003, ZH + 0.004);
    const door = M.make('Door');
    this.useGlass(door);
    if (door) this.doorPivot.add(door);
    this.doorPivot.visible = false;
    this.home.add(this.doorPivot);
    this.interior = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.14), new THREE.MeshBasicMaterial({ color: hex('xr-bricks-interior'), transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    this.interior.position.set(0, 2.5 * H, ZH - 0.03);
    this.home.add(this.interior);
    // Snow that falls into the open house if the roof is late.
    this.indoorSnow = new THREE.Mesh(new THREE.PlaneGeometry(2 * OX - 0.04, 2 * OZ - 0.04), new THREE.MeshStandardMaterial({ color: hex('xr-snow'), roughness: 0.9, transparent: true, opacity: 0 }));
    this.indoorSnow.rotation.x = -Math.PI / 2;
    this.indoorSnow.position.y = 0.003;
    this.home.add(this.indoorSnow);
    // Delivery: the savings machine, the belt and the pallet, at the right.
    const conveyor = M.make('Conveyor');
    conveyor?.position.set(BELT_X, 0.002, BELT_Z0);
    const machine = M.make('Machine') ?? new THREE.Group();
    machine.position.copy(MACHINE);
    const pallet = M.make('Pallet');
    pallet?.position.copy(PALLET);
    this.plotRoot.add(...[conveyor, machine, pallet].filter(Boolean));
    this.machine = machine;
    this.monthPanel = new Panel(0.1, 0.05, (ctx, p) => drawMonthDisplay(ctx, p, { month: this.month, vacation: false, flash: this.monthFlash > 0 }));
    this.monthPanel.position.set(0, 0.012 + 0.13 * 0.68, 0.0535);
    machine.add(this.monthPanel);
    this.coinTemplate = M.make('Coin');
    this.bagTemplate = M.make('Bag');
    // Grab areas: the belt and the pallet (the nearest part), and the crane's hook (a truss).
    const pad = this.grabPad(new THREE.BoxGeometry(0.25, 0.14, 0.52), new THREE.Vector3(BELT_X, 0.07, 0.04));
    this.pad = pad;
    this.hookPad = this.grabPad(new THREE.SphereGeometry(0.11, 12, 8), HOOK_AT.clone());
    this.hookPad.visible = false;
    this.crane = new Crane(M, this.plotRoot, CRANE_AT);
    this.crane.root.visible = false;
    if (CHRISTMAS) {
      const pts = [];
      [[0.035, 0.07], [0.095, 0.054], [0.15, 0.038], [0.198, 0.022]].forEach(([y, r], k) => {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + k * 0.6;
          pts.push(new THREE.Vector3(FIR.x + Math.cos(a) * (r + 0.006), y, FIR.z + Math.sin(a) * (r + 0.006)));
        }
      });
      this.firLights = makeBulbs(pts, { size: 0.0042, halo: 0.03 });
      this.plotRoot.add(this.firLights);
    }
    // The weather: no snow until the first snow month (then it falls in the room and on the plot).
    this.snow = makeSnowfall({ density: 0.6 });
    this.snow.density = 0;
    this.group.add(this.snow.points);
    this.snowLevel = 0;
    this.buildNeighbors(M);
  }

  grabPad(geo, at) {
    const pad = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ visible: false }));
    pad.position.copy(at);
    pad.userData.interactive = true;
    pad.userData.label = 'parts';
    pad.userData.onGrab = (p) => this.padGrab(p, pad);
    pad.userData.onRelease = (p) => { if (p.kind === 'mouse') this.endGrab(p); };
    this.plotRoot.add(pad);
    return pad;
  }

  useGlass(o) { o?.traverse((m) => { if (m.isMesh && m.material.name === 'Glass') m.material = this.glass; }); }

  /** The pieces and the ghost of the current plan (again after a plan change). */
  makeField() {
    const M = this.M;
    if (this.field) {
      for (const m of Object.values(this.field.inst)) { m.removeFromParent(); m.dispose(); }
      for (const o of this.field.single.values()) o.removeFromParent();
    }
    this.ghost?.dispose();
    this.field = new BrickField(this.home, this.plan, M);
    for (const o of this.field.single.values()) this.useGlass(o);
    this.field.showAll();
    for (const [id, info] of this.plan.filled) {
      const p = this.plan.pieces[id];
      if (info.wobbly) this.field.setTilt(p, { wobble: 1, lean: 0.05 });
      else if (info.skew) this.field.setTilt(p, info.skew);
    }
    this.ghost = new GhostPlan(this.home, this.plan);
    this.updateRoofGhost();
  }

  /** Ghost of the roof options: the attic room (dormer) and the solar array. */
  updateRoofGhost() {
    this.roofGhost?.removeFromParent();
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: hex('xr-bricks-ghost'), transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false });
    const slope = Math.atan(RIDGE / OZ);
    if (this.opts.dormer) {
      const d = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.07, 0.08), mat);
      d.position.set(-0.12, TOP + RIDGE - 0.09 * (RIDGE / OZ) + 0.03, 0.06);
      g.add(d);
    }
    if (this.opts.solar) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.006, 0.12), mat.clone());
      s.material.color.setHex(hex('xr-bricks-solar')).lerp(new THREE.Color(hex('xr-bricks-ghost')), 0.5);
      s.material.opacity = 0.4;
      s.position.set(0.115, TOP + RIDGE - 0.065 * (RIDGE / OZ) + 0.016, 0.065);
      s.rotation.x = slope;
      g.add(s);
    }
    this.roofGhost = g;
    this.ghost.group.add(g);
  }

  // ---------- the neighbors ----------

  buildNeighbors(M) {
    const style = pickOf(STYLES);
    const nb = (this.nb = {
      style, plan: new Plan(), target: BASE_TARGET, saved: 0, credit: 0, history: [0], done: false, doneMonth: 0,
      ai: new Forecaster({ target: BASE_TARGET, prior: 1.5, priorVar: 0.5 }), windfallAt: 7 + Math.floor(Math.random() * 6), milestone: 0,
    });
    const root = (nb.root = new THREE.Group());
    root.userData.noFit = true;
    this.world.add(root);
    const inner = new THREE.Group(); // mirrored copy of the plot
    inner.scale.set(-1, 1, 1);
    root.add(inner);
    const plot = M.make('Plot') ?? plainPlot(M.mats);
    inner.add(plot);
    const house = new THREE.Group();
    house.position.copy(HOUSE);
    inner.add(house);
    nb.house = house;
    const clay = M.mats.BrickClay.clone();
    clay.color.setHex(hex('xr-bricks-neighbor-clay'));
    nb.glass = M.mats.Glass.clone();
    nb.glass.emissive = new THREE.Color(hex('xr-bricks-window-light'));
    nb.glass.emissiveIntensity = 0;
    nb.field = new BrickField(house, nb.plan, M, { clay });
    for (const o of nb.field.single.values()) o.traverse((m) => { if (m.isMesh && m.material.name === 'Glass') m.material = nb.glass; });
    nb.roof = M.make('Roof');
    if (nb.roof) {
      nb.roof.position.set(0, TOP, 0);
      nb.roof.visible = false;
      nb.roof.traverse((m) => { if (m.isMesh && m.material.name === 'Glass') m.material = nb.glass; });
      house.add(nb.roof);
    }
    nb.family = makeFamily();
    nb.family.group.position.set(-0.05, 0, 0.27);
    nb.family.group.scale.setScalar(1.5);
    root.add(nb.family.group);
    nb.sign = new Panel(num('xr-bricks-sign-w'), 0.11, (ctx, p) => drawSign(ctx, p, { style: nb.style, share: nb.saved / nb.target, done: nb.done }));
    nb.sign.userData.noFit = true;
    nb.sign.visible = this.engine.isXR;
    this.group.add(nb.sign);
    this.placeNeighborsXR();
  }

  placeNeighborsXR() {
    const nb = this.nb;
    nb.root.position.set(-0.98, this.eye - 0.66, -1.12);
    nb.root.rotation.set(0, 0.55, 0);
    nb.root.scale.setScalar(0.55);
    nb.sign.position.set(-0.98, this.eye - 0.3, -1.12);
    nb.sign.rotation.set(0, 0.7, 0);
    nb.sign.scale.setScalar(1);
  }

  /** The Winters' month: their saving style decides; their house follows their savings. */
  neighborMonth() {
    const nb = this.nb;
    if (!nb || nb.done) return;
    const m = this.month;
    let d;
    // steady: 2 a month; impulsive: big swings, sometimes spending; lucky: modest, a windfall.
    if (nb.style === 'steady') d = 2 + (m % 6 === 0 ? 1 : 0);
    else if (nb.style === 'impulsive') {
      const r = Math.random();
      d = r < 0.45 ? 4 : r < 0.65 ? 2 : r < 0.85 ? 0 : -3;
    } else d = (m % 2 ? 1 : 2) + (Math.random() < 0.15 ? 2 : 0) + (m === nb.windfallAt ? 6 : 0);
    if (d < 0 && nb.saved > 0) this.nbNote = 'spend';
    if (m === nb.windfallAt && nb.style === 'lucky') this.nbNote = 'windfall';
    nb.saved = Math.max(0, nb.saved + d);
    this.syncNeighborHouse();
    nb.ai.push(nb.saved);
    nb.history.push(nb.saved);
    nb.pred = nb.ai.predict(nb.ai.months, nb.saved);
    const share = nb.saved / nb.target;
    if (share >= (nb.milestone + 1) * 0.25 && share < 1) { nb.milestone += 1; nb.family.cheer(); }
    else if (Math.random() < 0.35) nb.family.wave();
    if (nb.saved >= nb.target) this.neighborsDone();
    nb.sign.redraw();
  }

  /** Builds (or takes down) the Winters' house to match their savings. */
  syncNeighborHouse() {
    const nb = this.nb;
    const plan = nb.plan;
    let guard = 0;
    while (plan.saved < nb.saved && guard++ < 60) {
      let g = null;
      for (const kind of ['door', 'window', 'corner', 'half', 'single']) {
        const list = plan.targets(kind, { wobbly: false });
        if (list.length) { g = list.sort((a, b) => a.y - b.y)[Math.floor(Math.random() * Math.min(3, list.length))]; break; }
      }
      if (!g) break;
      plan.place(g.pieces);
      g.pieces.forEach((p, i) => nb.field.set(p, true, false, 0.05 + i * 0.05));
    }
    if (plan.saved > nb.saved + 1) {
      for (const p of plan.removeTop(plan.saved - nb.saved)) nb.field.set(p, false);
    }
  }

  /** The Winters reach their allotment: their house is finished in a few seconds, they cheer. */
  neighborsDone() {
    const nb = this.nb;
    nb.done = true;
    nb.doneMonth = this.month;
    nb.family.cheer();
    bsfx.cheer();
    if (this.mode === 'play') this.toast(t('bricksNeighborsAllot'), 'xr-bricks-neighbor', 2.6);
    const rest = nb.plan.remaining(() => true).sort((a, b) => a.course - b.course);
    rest.forEach((p, i) => { nb.plan.filled.set(p.id, { gold: false, order: 0, by: 'crane' }); nb.field.set(p, true, false, 0.4 + i * 0.012); });
    this.delay(0.6 + rest.length * 0.012, () => {
      if (this.disposed || !nb.roof) return;
      nb.roof.visible = true;
      nb.roof.scale.setScalar(0.001);
      this.tween(0.4, (k) => nb.roof.scale.setScalar(Math.max(0.001, k)), { onDone: () => { nb.glass.emissiveIntensity = 1.4; } });
    });
    nb.sign.redraw();
  }

  // ---------- input ----------

  setupInput() {
    this.onKey = (e) => {
      if (this.mode !== 'play' && this.mode !== 'loan') return;
      if (this.card) {
        if (e.key === '1') this.choose(0);
        else if (e.key === '2') this.choose(1);
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        const ready = this.items.filter((b) => b.state === 'pallet' || b.state === 'selected' || b.state === 'hook');
        if (!ready.length) return;
        const i = ready.indexOf(this.selected);
        this.select(ready[(i + 1) % ready.length]);
      } else if (e.key === 'Escape') this.deselect();
    };
    window.addEventListener('keydown', this.onKey);
    this.onSceneDispose(() => window.removeEventListener('keydown', this.onKey));
    const empty = (p) => this.emptyPress(p);
    this.engine.onEmptyPress = empty;
    this.onSceneDispose(() => { if (this.engine.onEmptyPress === empty) this.engine.onEmptyPress = null; });
    const xr = this.engine.renderer.xr;
    for (let i = 0; i < 2; i++) {
      const c = xr.getController(i);
      const p = this.engine.pointers.find((q) => q.controller === c);
      if (!p) continue;
      this.ctrlIndex.set(p, i);
      xr.getControllerGrip(i); // three.js tracks grip poses and hand joints once they exist
      xr.getHand(i);
      const on = (type, fn) => { c.addEventListener(type, fn); this.onSceneDispose(() => c.removeEventListener(type, fn)); };
      on('selectstart', () => this.xrPress(p, 'select'));
      on('selectend', () => this.xrRelease(p, 'select'));
      on('squeezestart', () => this.xrPress(p, 'squeeze'));
      on('squeezeend', () => this.xrRelease(p, 'squeeze'));
    }
  }

  /** Hand or controller pose in world space: the pinch point of a hand, else the grip. */
  anchor(p) {
    const xr = this.engine.renderer.xr;
    const i = this.ctrlIndex.get(p);
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    if (i === undefined) return null;
    if (p.source?.hand) {
      const j = xr.getHand(i).joints;
      const a = j['index-finger-tip'];
      const b = j['thumb-tip'];
      const w = j.wrist;
      if (a?.visible && b?.visible) {
        pos.copy(a.position).add(b.position).multiplyScalar(0.5);
        if (w?.visible) quat.copy(w.quaternion);
        else p.controller.getWorldQuaternion(quat);
        return { pos, quat, hand: true };
      }
    }
    const grip = xr.getControllerGrip(i);
    if (grip.visible && !p.source?.hand) {
      pos.copy(grip.position);
      quat.copy(grip.quaternion);
      return { pos, quat, hand: false };
    }
    p.controller.updateMatrixWorld(true);
    p.controller.matrixWorld.decompose(pos, quat, new THREE.Vector3());
    return { pos, quat, hand: !!p.source?.hand };
  }

  /** How close a hand or controller must be to a part (big parts are easier to catch). */
  grabRadius(a, b) {
    const big = b.kind === 'truss' ? 1.8 : b.kind === 'window' || b.kind === 'door' ? 1.3 : 1;
    return num('xr-bricks-grab') * (a.hand ? 0.85 : 1.3) * big;
  }

  grabbable(b) { return ['belt', 'hop', 'pallet', 'selected', 'return', 'hook'].includes(b.state); }

  xrPress(p, button) {
    if (!this.engine.isXR || !this.building() || this.grabs.has(p)) return;
    const a = this.anchor(p);
    if (!a) return;
    let best = null;
    let bd = Infinity;
    for (const b of this.items) {
      if (!this.grabbable(b)) continue;
      const d = b.obj.getWorldPosition(new THREE.Vector3()).distanceTo(a.pos);
      if (d < this.grabRadius(a, b) && d < bd) { bd = d; best = b; }
    }
    if (best) this.startGrab(p, best, button, 'near');
    else if (button === 'squeeze' && (p.hovered === this.pad || p.hovered === this.hookPad)) {
      const b = this.pickItem(p, p.hovered);
      if (b) this.startGrab(p, b, button, 'ray');
    }
  }

  xrRelease(p, button) {
    const g = this.grabs.get(p);
    if (g && g.button === button) this.endGrab(p);
  }

  building() { return this.mode === 'play' || this.mode === 'loan'; }

  padGrab(p, pad) {
    if (!this.building() || this.grabs.has(p)) return;
    const b = this.pickItem(p, pad);
    if (!b) return;
    this.startGrab(p, b, p.kind === 'mouse' ? 'mouse' : 'select', p.kind === 'mouse' ? 'drag' : 'ray');
  }

  /** The grabbable part nearest to the pointer (screen distance for the mouse, ray distance in XR). */
  pickItem(p, pad = null) {
    let best = null;
    let bd = Infinity;
    const v = new THREE.Vector3();
    for (const b of this.items) {
      if (!this.grabbable(b)) continue;
      if (pad === this.hookPad && b.state !== 'hook') continue;
      if (pad === this.pad && b.state === 'hook') continue;
      b.obj.getWorldPosition(v);
      let d;
      if (p.kind === 'mouse') {
        const s = this.toScreen(v);
        const m = this.pointerPx(p, false);
        d = Math.hypot(s.x - m.x, s.y - m.y);
      } else d = p.ray.distanceToPoint(v);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  startGrab(p, b, button, how) {
    if (this.selected && this.selected !== b) this.deselect();
    if (this.selected === b) this.selected = null;
    b.state = 'held';
    b.holder = p;
    const g = { p, b, button, how, t0: this.time, ndc0: p.ndc?.clone(), hover: null, hint: null };
    if (p.kind === 'xr') {
      const a = this.anchor(p);
      const A = new THREE.Matrix4().compose(a.pos, a.quat, ONE);
      b.obj.updateMatrixWorld(true);
      if (how === 'near') g.offset = A.clone().invert().multiply(b.obj.matrixWorld);
      else g.offset = new THREE.Matrix4().makeTranslation(0, a.hand ? 0 : -0.01, a.hand ? -0.012 : -0.05);
      if (p.line) p.line.visible = false;
    }
    this.grabs.set(p, g);
    sfx.grab();
    this.engine.haptic(p, 0.35, 25);
    this.hideHint();
  }

  /** Let go: onto the place it hovers over (straight or skewed), or gently back. */
  endGrab(p) {
    const g = this.grabs.get(p);
    if (!g) return;
    this.grabs.delete(p);
    if (p.line) p.line.visible = p.source?.targetRayMode !== 'screen';
    const b = g.b;
    if (b.state !== 'held') return;
    if (p.kind === 'mouse' && g.ndc0) {
      const moved = Math.hypot(((p.ndc.x - g.ndc0.x) * window.innerWidth) / 2, ((p.ndc.y - g.ndc0.y) * window.innerHeight) / 2);
      if (moved < 12 && this.time - g.t0 < 0.45) { b.state = b.wasHook ? 'hook' : 'pallet'; this.select(b); return; }
    }
    if (g.hover && this.canPlace(g.hover, b)) {
      // Headset: let go askew (turned or tilted against the place, or off its middle) -> skewed.
      if (p.kind === 'xr' && MAY_WOBBLE.has(b.kind)) b.skew = this.skewOf(b, g);
      this.placeItem(b, g.hover);
    } else this.refuse(b, g.hint);
  }

  /** How askew a part was let go (headset): null if it was straight enough. */
  skewOf(b, g) {
    const q = b.obj.quaternion;
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const tilt = Math.acos(clamp(Math.abs(up.y), 0, 1));
    const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(q).setY(0);
    const want = new THREE.Vector3(Math.cos(g.hover.yaw), 0, -Math.sin(g.hover.yaw));
    const turn = axis.lengthSq() > 1e-6 ? Math.acos(clamp(Math.abs(axis.normalize().dot(want)), 0, 1)) : Math.PI / 2;
    const off = g.rawDist ?? 0;
    if (turn < 0.33 && tilt < 0.35 && off < 0.035) return null;
    return { lean: clamp(tilt, 0.04, 0.1) * Math.sign(Math.random() - 0.5), yaw: clamp(turn, 0.04, 0.1) * Math.sign(Math.random() - 0.5) };
  }

  canPlace(g, b) {
    if (!this.building()) return false;
    const ps = g.pieces.map((p) => this.plan.pieces[p.id]);
    if (ps.some((p) => !p || this.plan.isFilled(p.id) || this.reserved.has(p.id))) return false;
    const states = ps.map((p) => this.plan.state(p));
    if (states.includes('none')) return false;
    return MAY_WOBBLE.has(b.kind) || !states.includes('wobbly');
  }

  select(b) {
    if (!this.building()) return;
    if (this.selected && this.selected !== b) this.deselect();
    if (b.state === 'held') return;
    this.selected = b;
    if (b.state !== 'hook') { b.state = 'selected'; b.obj.position.copy(this.restPos(b)); }
    sfx.click();
    this.hideHint();
    this.toast(`${t(`bricksItem_${b.kind}`)}: ${t('bricksSelected')}`, 'xr-bricks-ghost', 2.4);
  }

  deselect() {
    const b = this.selected;
    this.selected = null;
    if (b && b.state === 'selected') b.state = 'pallet';
  }

  emptyPress(p) {
    if (p.kind !== 'mouse' || !this.building() || !this.selected || this.card) return;
    const m = this.pointerPx(p, false);
    const b = this.selected;
    const g = this.nearestScreen(m.x, m.y, this.snapPx() * 1.4, this.targetsFor(b));
    this.selected = null;
    if (g && this.canPlace(g, b)) {
      b.state = 'held';
      b.holder = p;
      this.placeItem(b, g);
    } else {
      if (b.state === 'selected') b.state = 'pallet';
      const hint = this.refuseHintScreen(m.x, m.y, b);
      if (hint) this.refuse(b, hint);
    }
  }

  // ---------- coordinates ----------

  piecePos(g, out = new THREE.Vector3()) { return out.set(g.x, g.y, g.z).add(HOUSE); }

  pieceWorld(g, out = new THREE.Vector3()) { return this.plotRoot.localToWorld(this.piecePos(g, out)); }

  /** Where a part rests: its pallet row, or the crane's hook. */
  restPos(b, out = new THREE.Vector3()) {
    if (b.wasHook) return out.copy(HOOK_AT);
    return out.set(PALLET.x, PALLET.y + PALLET_TOP + (REST_Y[b.kind] ?? BH / 2), PALLET.z + SPOT_Z[b.spot]);
  }

  restQuat(b) { return new THREE.Quaternion().setFromAxisAngle(UP, b.kind === 'truss' ? Math.PI / 2 : 0); }

  /** Rotation of a part on its place. */
  targetQuat(g) {
    const p = g.pieces[0];
    return new THREE.Quaternion().setFromAxisAngle(UP, p.kind === 'frame' ? p.face : p.kind === 'truss' || p.kind === 'post' ? 0 : g.yaw);
  }

  toScreen(world) {
    const v = world.clone().project(this.engine.camera);
    return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight, z: v.z };
  }

  pointerPx(p, lift = true) {
    const x = ((p.ndc.x + 1) / 2) * window.innerWidth;
    const y = ((1 - p.ndc.y) / 2) * window.innerHeight - (lift && this.engine.touchUI ? 52 : 0);
    return { x, y };
  }

  snapPx() { return clamp(Math.min(window.innerWidth, window.innerHeight) * 0.075, 34, 70); }

  /** Places this part can go now (not reserved), with their statics state. */
  targetsFor(b) {
    return this.plan.targets(targetKind(b.kind), { wobbly: MAY_WOBBLE.has(b.kind) }).filter((g) => !g.pieces.some((p) => this.reserved.has(p.id)));
  }

  nearestScreen(x, y, R, groups) {
    let best = null;
    let bd = R;
    const v = new THREE.Vector3();
    for (const g of groups) {
      const s = this.toScreen(this.pieceWorld(g, v));
      // Solid places win over wobbly ones nearby.
      const d = Math.hypot(s.x - x, s.y - y) + (g.state === 'wobbly' ? 8 : 0);
      if (d < bd) { bd = d; best = g; }
    }
    return best;
  }

  /** Why a place near the pointer does not work (a friendly hint). */
  refuseHintScreen(x, y, b) {
    const R = this.snapPx();
    const kind = targetKind(b.kind);
    const open = this.plan.pieces.filter((p) => !this.plan.isFilled(p.id) && this.plan.state(p) === 'none').map((p) => ({ pieces: [p], x: p.x, y: p.y, z: p.z, yaw: p.yaw, state: 'none', kind: p.kind }));
    const below = this.nearestScreen(x, y, R, open);
    if (below) return { piece: below.pieces[0], reason: below.pieces[0].kind === this.pieceKind(kind) ? 'bricksNeedBelow' : 'bricksWrongPart' };
    return null;
  }

  pieceKind(kind) { return { single: 'full', double: 'full', half: 'half', corner: 'post', window: 'frame', door: 'frame', lintel: 'lintel', truss: 'truss' }[kind]; }

  refuseHintNear(local, b) {
    const v = new THREE.Vector3();
    let best = null;
    let bd = 0.05;
    for (const p of this.plan.pieces) {
      if (this.plan.isFilled(p.id) || this.plan.state(p) !== 'none') continue;
      const d = this.piecePos(p, v).distanceTo(local);
      if (d < bd) { bd = d; best = p; }
    }
    if (best) return { piece: best, reason: best.kind === this.pieceKind(targetKind(b.kind)) ? 'bricksNeedBelow' : 'bricksWrongPart' };
    return null;
  }

  // ---------- flow ----------

  start() {
    this.clearLayer();
    this.ready.then(() => { if (!this.disposed && this.mode === 'intro') this.begin(); });
  }

  begin() {
    this.mode = 'play';
    this.world.visible = true;
    this.nb.sign.visible = true;
    this.startMusic(0);
    music.intensity = 0;
    this.refreshHud ??= this.hud(() => this.hudText());
    this.hudObjs = this.group.children.filter((o) => o.userData.hud);
    this.hudHome = this.hudObjs.map((o) => ({ o, pos: o.position.clone() }));
    if (!this.engine.isXR) this.app.echo?.suppress(true);
    Object.assign(this, {
      month: 1, monthT: 0, score: 0, placed: 0, clean: 0, goldPlaced: 0, maxSaved: 0, interestPaid: 0, credit: 0, income: 0,
      missed: 0, wobbles: 0, skews: 0, card: null, monthFlash: 0, nextQueue: 0, noteKey: 'bricksNote_prior', noteUntil: 0,
      early: null, firstWidth: null, lastWidth: null, eventsDone: [], bonus: 0, path: [], roofMonth: 0, roofOn: false, snowing: false,
    });
    this.events = [...EVENTS];
    this.makeChart();
    this.credit = 1;
    this.dispatch();
    this.monthPanel?.redraw();
    this.refreshForecast('start');
    this.toast(t('bricksGo'), 'xr-bricks-ghost', 1.8);
    this.delay(1.9, () => this.showHint());
    this.refreshHud();
  }

  hudText() {
    const snow = Math.max(0, Math.ceil(SNOW_AT - this.elapsed()));
    // Phones: the chart shows the weather; the bar stays short.
    const weather = this.roofOn || !snow || this.engine.touchUI ? '' : ` · ${t('bricksHudSnow', { n: snow })}`;
    return `${t('bricksHud', { month: this.month, saved: this.plan.saved, target: this.target, score: this.score })}${weather}`;
  }

  elapsed() { return this.month - 1 + this.monthT / MONTH; }

  /** Savings rate this month (bricks): 1 and 2 in turn, more with each income event. */
  rate() { return (this.month % 2 ? 1 : 2) + this.income; }

  endMonth() {
    const saved = this.plan.saved;
    if (this.mode === 'play') {
      this.ai.push(saved);
      this.history.push(saved);
    }
    const done = this.ai.months;
    this.month += 1;
    this.neighborMonth();
    if (this.month === SNOW_AT) this.firstSnow();
    if (this.mode === 'play') {
      if (this.month > MAX_MONTHS) { this.allot(true); return; }
      this.credit += this.rate();
      if (this.credit > CREDIT_CAP + 0.001 && !this.spots.includes(null)) {
        this.credit = CREDIT_CAP;
        this.missDeposit();
      }
      this.credit = Math.min(this.credit, CREDIT_CAP + 1);
      this.dispatch();
      const ev = this.nextEvent();
      if (ev) this.delay(0.8, () => this.openCard(ev));
      this.refreshForecast('month');
      if (done === 4 && this.pred) this.early = { lo: this.pred.lo, hi: this.pred.hi };
    }
    if (this.nbNote && this.time > this.noteUntil) { this.noteKey = 'bricksNote_neighbors'; this.noteUntil = this.time + 4; this.nbNote = null; }
    this.monthPanel?.redraw();
    this.chartDirty = true;
  }

  nextEvent() {
    if (this.card) return null;
    const ev = this.events.find((e) => e.month <= this.month && !this.eventsDone.includes(e.key));
    if (ev) return ev;
    if (this.month >= 18 && this.eventsDone.length === 3) return this.opts.annex ? EVENT_PARENTS : EVENT_INHERIT;
    return null;
  }

  // ---------- deliveries ----------

  onPallet(kind) { return this.items.filter((b) => b.kind === kind && b.state !== 'gone' && b.state !== 'placing').length; }

  /** The next part to send for the savings waiting in the machine (what the house needs now). */
  nextPart() {
    const free = (kind) => this.plan.targets(kind, { wobbly: false }).filter((g) => g.pieces.every((p) => p.scope === 'own' || p.kind === 'frame')).length - this.onPallet(kind);
    const c = this.credit;
    if (c >= COST.door && free('door') > 0) return 'door';
    if (c >= COST.window && free('window') > 0 && Math.random() < 0.8) return 'window';
    if (free('corner') > 0 && Math.random() < 0.7) return 'corner';
    if (free('half') > 0 && Math.random() < 0.55) return 'half';
    if (c >= COST.double && free('double') > 0 && Math.random() < 0.6) return 'double';
    if (free('window') > 0 && c < COST.window) return null; // save up for the frame
    return 'single';
  }

  /** Sends parts while there is savings and room on the pallet. */
  dispatch() {
    let n = 0;
    while (this.spots.includes(null) && n < 3) {
      const kind = this.nextPart();
      if (!kind || this.credit < COST[kind]) break;
      this.credit -= COST[kind];
      this.deliver(kind, 0.15 + n * 0.5);
      n += 1;
    }
  }

  /** Reserves a pallet row and sends a part down the belt (false: the pallet is full). */
  deliver(kind, delay = 0) {
    const spot = this.spots.findIndex((s) => s === null);
    if (spot < 0) return false;
    this.spots[spot] = 'reserved';
    this.delay(delay, () => {
      if (!this.building()) { this.spots[spot] = null; return; }
      this.coinDrop(kind === 'gold');
      this.delay(0.32, () => {
        if (!this.building()) { this.spots[spot] = null; return; }
        this.spawnItem(kind, spot);
      });
    });
    return true;
  }

  missDeposit() {
    this.missed += 1;
    this.toast(t('bricksMissed'), 'xr-danger', 2.4);
    bsfx.refuse();
    this.puffs.puff(MACHINE.clone().add(new THREE.Vector3(0, 0.06, 0.08)), { token: 'xr-bricks-smoke', n: 7, size: 0.028 });
    this.setNote('missed');
  }

  coinDrop(gold) {
    bsfx.deposit();
    this.monthFlash = 0.6;
    this.monthPanel?.redraw();
    if (this.coinTemplate) {
      const coin = this.coinTemplate.clone();
      coin.position.set(0, 0.24, -0.01);
      coin.rotation.y = Math.PI / 2;
      this.machine.add(coin);
      this.tween(0.28, (k) => { coin.position.y = 0.24 - k * 0.1; coin.rotation.x = k * 2; }, { ease: (k) => k * k, onDone: () => coin.removeFromParent() });
    }
    this.tween(0.3, (k) => { this.machine.scale.set(1 + Math.sin(k * Math.PI) * 0.04, 1 - Math.sin(k * Math.PI) * 0.05, 1 + Math.sin(k * Math.PI) * 0.04); }, { ease: (k) => k });
    if (gold) this.burst(this.plotRoot.localToWorld(MACHINE.clone().add(new THREE.Vector3(0, 0.12, 0.05))), 'xr-bricks-gold-glow', 16);
  }

  /** A part's 3D model, with its own materials (they glow when hovered). */
  makeItem(kind) {
    const M = this.M;
    const mats = [];
    const own = (m) => { const c = m.clone(); mats.push(c); return c; };
    let obj;
    if (kind === 'single') obj = new THREE.Mesh(M.geo.brick, own(M.mats.BrickClay));
    else if (kind === 'gold') obj = new THREE.Mesh(M.geo.gold, own(M.mats.BrickGold));
    else if (kind === 'half') obj = new THREE.Mesh(M.geo.half, own(M.mats.BrickClay));
    else if (kind === 'corner') obj = new THREE.Mesh(M.geo.quoin, own(M.mats.Quoin));
    else if (kind === 'double') {
      obj = new THREE.Group();
      const m = own(M.mats.BrickClay);
      for (const sx of [-1, 1]) { const b = new THREE.Mesh(M.geo.brick, m); b.position.x = (sx * L) / 2; obj.add(b); }
    } else {
      obj = M.make({ window: 'Window', door: 'DoorFrame', lintel: 'Lintel', truss: 'Truss' }[kind]) ?? new THREE.Mesh(new THREE.BoxGeometry(L, H, D), M.mats.Concrete);
      obj.traverse((o) => { if (o.isMesh) o.material = own(o.material); });
    }
    obj.userData.noFit = true;
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.noFit = true; } });
    for (const m of mats) {
      if (!m.isMeshStandardMaterial) continue;
      m.emissive = new THREE.Color(hex(kind === 'gold' ? 'xr-bricks-gold' : 'xr-bricks-ghost-hot'));
      m.emissiveIntensity = kind === 'gold' ? 0.22 : 0;
    }
    return { obj, mats };
  }

  spawnItem(kind, spot, at = null) {
    const { obj, mats } = this.makeItem(kind);
    obj.position.set(BELT_X, BELT_Y + (REST_Y[kind] ?? BH / 2), BELT_Z0 + 0.01);
    if (at) obj.position.copy(at);
    this.plotRoot.add(obj);
    const b = { kind, obj, mats, spot, state: at ? 'hook' : 'belt', t: 0, rejected: false, hover: false, base: kind === 'gold' ? 0.22 : 0, wasHook: !!at };
    if (at) obj.quaternion.copy(this.restQuat(b));
    if (spot >= 0) this.spots[spot] = b;
    this.items.push(b);
    return b;
  }

  removeItem(b) {
    const i = this.items.indexOf(b);
    if (i >= 0) this.items.splice(i, 1);
    if (b.spot >= 0 && this.spots[b.spot] === b) this.spots[b.spot] = null;
    b.obj.removeFromParent();
    b.mats.forEach((m) => m.dispose());
    if (this.selected === b) this.selected = null;
    b.state = 'gone';
  }

  // ---------- placing ----------

  /** The part goes onto its place: a short slide, then a click and a puff of mortar. */
  placeItem(b, g) {
    b.state = 'placing';
    g.pieces.forEach((p) => this.reserved.add(p.id));
    if (b.spot >= 0 && this.spots[b.spot] === b) this.spots[b.spot] = null;
    const p0 = b.obj.position.clone();
    const q0 = b.obj.quaternion.clone();
    const p1 = this.piecePos(g);
    const q1 = this.targetQuat(g);
    const far = p0.distanceTo(p1) > 0.12;
    this.tween(far ? 0.38 : 0.12, (k) => {
      b.obj.position.lerpVectors(p0, p1, k);
      if (far) b.obj.position.y += Math.sin(k * Math.PI) * 0.08;
      b.obj.quaternion.slerpQuaternions(q0, q1, Math.min(1, k * 1.4));
    }, { ease: far ? ease : (k) => 1 - (1 - k) ** 2, onDone: () => this.commit(b, g) });
  }

  commit(b, g) {
    g.pieces.forEach((p) => this.reserved.delete(p.id));
    const ps = g.pieces.map((p) => this.plan.pieces[p.id]);
    if (!this.building() || !this.canPlace({ pieces: ps }, b)) {
      if (this.building()) { b.state = 'held'; this.refuse(b, null); } else this.removeItem(b);
      return;
    }
    const gold = b.kind === 'gold';
    const wobbly = this.plan.place(ps, { gold, by: 'hand', wobbly: true, skew: b.skew ?? null });
    for (const p of ps) {
      this.field.set(p, true, gold);
      if (wobbly.includes(p)) this.field.setTilt(p, { wobble: 1, lean: 0.05 * (Math.random() < 0.5 ? -1 : 1) });
      else if (b.skew) this.field.setTilt(p, b.skew);
    }
    if (ps[0].kind === 'frame' && ps[0].frame === 'door') this.doorPivot.visible = true;
    this.ghost.refresh();
    const at = this.piecePos(g);
    this.removeItem(b);
    this.puffs.puff(at.clone().add(new THREE.Vector3(0, -BH / 2, 0)), { n: 10, spread: 0.045 });
    bsfx.place();
    if (b.holder) this.engine.haptic(b.holder, 0.7, 45);
    this.placed += 1;
    const clean = !b.rejected && !wobbly.length && !b.skew;
    if (clean) this.clean += 1;
    // Statics: wobbling or skewed parts cost points.
    if (wobbly.length) {
      this.wobbles += 1;
      this.score -= PTS.wobble;
      bsfx.wobble();
      this.toast(t('bricksWobble', { n: PTS.wobble }), 'xr-bricks-ghost-warn', 2.2);
      if (b.holder) this.engine.haptic(b.holder, 0.9, 120);
    } else if (b.skew) {
      this.skews += 1;
      this.score -= PTS.skew;
      bsfx.wobble();
      this.toast(t('bricksSkew', { n: PTS.skew }), 'xr-bricks-ghost-warn', 2);
    }
    const settled = this.plan.settle();
    if (settled.length) {
      for (const p of settled) {
        const info = this.plan.filled.get(p.id);
        this.field.setTilt(p, info.skew ?? null);
      }
      this.delay(0.15, () => bsfx.settle());
      if (!wobbly.length) this.toast(t('bricksSettled'), 'xr-success', 1.6);
    }
    if (this.mode === 'loan') {
      this.score += PTS.hand + (clean ? PTS.clean : 0);
      this.handDone?.();
    } else {
      // Points for new savings only (parts set again after a setback count no more).
      const fresh = this.plan.saved - this.maxSaved;
      this.maxSaved = Math.max(this.maxSaved, this.plan.saved);
      if (fresh > 0) this.score += PTS.place * fresh + (clean ? PTS.clean : 0);
      if (gold) {
        this.score += PTS.gold;
        this.goldPlaced += 1;
        this.marks.push({ m: this.elapsed(), v: this.plan.saved, kind: 'gold' });
        this.burst(this.plotRoot.localToWorld(at.clone()), 'xr-bricks-gold-glow', 18);
      }
      if (Math.floor(this.maxSaved / INTEREST_EVERY) > this.interestPaid) {
        this.interestPaid += 1;
        this.queue.push('gold');
        this.toast(t('bricksInterest'), 'xr-bricks-gold', 2.2);
        sfx.coin();
        this.setNote('bonus');
      }
      this.refreshForecast('place');
      this.dispatch();
      if (this.plan.saved >= this.target) this.allot(false);
    }
    this.refreshHud?.();
  }

  refuse(b, hint) {
    b.rejected = true;
    b.state = 'return';
    b.t = 0;
    b.skew = null;
    b.from = b.obj.position.clone();
    b.fromQ = b.obj.quaternion.clone();
    if (hint) {
      this.toast(t(hint.reason), 'xr-danger', 2);
      if (hint.piece) this.ghost.reject(hint.piece);
      bsfx.refuse();
      if (b.holder) this.engine.haptic(b.holder, 0.45, 70);
    } else sfx.bounce();
  }

  // ---------- life events ----------

  openCard(ev) {
    if (!this.building() || this.card || this.mode !== 'play') return;
    this.card = { ev };
    bsfx.event();
    const g = new THREE.Group();
    const panel = eventPanel(ev, 0.7);
    g.add(panel);
    let h = panel.h;
    if (!this.engine.touchUI) {
      const desk = !this.engine.isXR;
      const btns = ev.options.map((o, i) => new Button(0.33, 0.11, {
        label: t(`bricksOpt_${o.key}`), body: desk ? t('bricksKey', { n: i + 1 }) : null,
        variant: i ? 'secondary' : 'primary', labelSize: 'xr-text-sm', onClick: () => this.choose(i),
      }));
      const bh = Math.max(...btns.map((b) => b.h));
      const by = -panel.h / 2 - 0.025 - bh / 2;
      btns[0].position.set(-0.175, by, 0);
      btns[1].position.set(0.175, by, 0);
      g.add(...btns);
      h += 0.025 + bh;
      btns.forEach((b, i) => this.popIn(b, 0.1 + i * 0.05));
    } else {
      this.cardPad = this.touchButtons(ev.options.map((o, i) => ({ icon: i ? 'bricks' : 'gift', label: `${i + 1} ${t(`bricksOptShort_${o.key}`)}`, primary: !i, onPress: () => this.choose(i) })));
      this.cardPad?.show(true);
    }
    g.children.forEach((o) => { o.position.y += h / 2 - panel.h / 2; });
    g.userData.h = h;
    this.cardHolder.add(g);
    this.popIn(panel);
    this.cardGroup = g;
    if (this.engine.isXR) this.placeXR();
  }

  closeCard() {
    this.card = null;
    if (this.cardGroup) {
      const g = this.cardGroup;
      this.cardGroup = null;
      g.removeFromParent();
      g.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.map?.dispose(); o.material.dispose(); } });
    }
    this.cardPad?.remove();
    this.cardPad = null;
  }

  /** A choice on a life event: plan, target, income and savings change; the forecast reacts. */
  choose(i) {
    if (!this.card) return;
    const { ev } = this.card;
    const opt = ev.options[i];
    this.closeCard();
    this.eventsDone.push(ev.key);
    this.path.push(opt.key);
    sfx.correct();
    if (ev.income) this.income += ev.income;
    if (opt.target) this.target = Math.max(20, this.target + opt.target);
    if (opt.rooms) this.rooms += opt.rooms;
    if (opt.bonus) this.bonus += opt.bonus;
    if (opt.annex && !this.opts.annex) this.addExtension();
    if (opt.dormer === false) { this.opts.dormer = false; this.updateRoofGhost(); }
    if (opt.solar) { this.opts.solar = true; this.updateRoofGhost(); }
    if (opt.garden) this.addTerrace();
    for (let k = 0; k < (opt.gift ?? 0); k++) this.queue.push('single');
    if (opt.remove) this.takeAway(opt.remove);
    this.ai.target = this.target;
    this.marks.push({ m: this.elapsed(), v: this.plan.saved, kind: opt.remove ? 'spend' : 'event' });
    this.toast(t('bricksChose', { name: t(`bricksOpt_${opt.key}`) }), 'xr-bricks-event', 2.2);
    this.setNote(opt.note ?? 'steady');
    this.refreshForecast('event');
    this.dispatch();
    this.refreshHud?.();
    if (this.plan.saved >= this.target) this.allot(false);
  }

  /** The extension appears in the plan: its foundation pours, its walls glow in the hologram. */
  addExtension() {
    this.opts.annex = true;
    this.plan = this.plan.withOptions({ annex: true });
    this.makeField();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(2 * L + D + 0.014, FOUND, 2 * L + 2 * D + 0.014), this.M.mats.Concrete);
    slab.position.set(HOUSE.x - OX - (2 * L + D) / 2 + 0.004, FOUND / 2, HOUSE.z);
    slab.receiveShadow = true;
    slab.scale.set(1, 0.001, 1);
    this.plotRoot.add(slab);
    this.tween(0.6, (k) => slab.scale.set(1, Math.max(0.001, k), 1));
    this.puffs.puff(new THREE.Vector3(slab.position.x, 0.01, slab.position.z), { n: 12, spread: 0.09, size: 0.03 });
    for (const g of this.grabs.values()) g.hover = null;
  }

  addTerrace() {
    this.opts.garden = true;
    const ter = this.M.make('Terrace');
    if (!ter) return;
    ter.scale.setScalar(0.001);
    this.plotRoot.add(ter);
    this.tween(0.5, (k) => ter.scale.setScalar(Math.max(0.001, k)));
    this.burst(this.plotRoot.localToWorld(new THREE.Vector3(0.22, 0.05, 0.24)), 'xr-success', 16);
  }

  /** Bricks come off the top and fly into a bag (helping the parents). */
  takeAway(value) {
    const removed = this.plan.removeTop(value);
    this.ghost.refresh();
    const bag = this.bagTemplate?.clone() ?? new THREE.Group();
    bag.position.copy(BAG_AT);
    bag.scale.setScalar(0.001);
    this.plotRoot.add(bag);
    this.tween(0.3, (k) => bag.scale.setScalar(Math.max(0.001, k * 1.3)));
    const top = BAG_AT.clone().add(new THREE.Vector3(0, 0.08, 0));
    bsfx.spend();
    removed.forEach((p, i) => {
      this.field.set(p, false);
      const geo = p.kind === 'full' ? this.M.geo.brick : p.kind === 'post' ? this.M.geo.quoin : this.M.geo.half;
      const m = new THREE.Mesh(geo, p.kind === 'post' ? this.M.mats.Quoin : this.M.mats.BrickClay);
      const from = this.piecePos(p);
      m.position.copy(from);
      m.rotation.y = p.yaw;
      this.plotRoot.add(m);
      this.delay(i * 0.08, () => {
        this.tween(0.55, (k) => {
          m.position.lerpVectors(from, top, k);
          m.position.y += Math.sin(k * Math.PI) * 0.12;
          m.scale.setScalar(Math.max(0.001, 1 - k * 0.7));
          m.rotation.x = k * 4;
        }, { ease: (k) => k, onDone: () => m.removeFromParent() });
      });
    });
    this.delay(1.5, () => this.tween(0.35, (k) => bag.scale.setScalar(Math.max(0.001, 1.3 * (1 - k))), { onDone: () => bag.removeFromParent() }));
  }

  // ---------- the AI forecast ----------

  setNote(key) {
    this.noteKey = `bricksNote_${key}`;
    this.noteUntil = this.time + 6;
  }

  refreshForecast(reason) {
    const prev = this.pred;
    const next = this.ai.predict(this.elapsed(), this.plan.saved);
    this.pred = next;
    if (reason === 'month' && this.time > this.noteUntil) {
      let key = 'steady';
      if (this.ai.months <= 1) key = 'prior';
      else if (prev && Number.isFinite(prev.median) && next.median < prev.median - 0.6) key = 'faster';
      else if (prev && Number.isFinite(prev.median) && next.median > prev.median + 0.6) key = 'slower';
      else if (prev && next.hi - next.lo < prev.hi - prev.lo - 0.2) key = 'more';
      this.noteKey = `bricksNote_${key}`;
    }
    if (Number.isFinite(next.hi) && !next.done) {
      this.lastWidth = next.hi - next.lo;
      if (this.firstWidth === null && this.ai.months >= 3) this.firstWidth = { n: this.ai.months, w: this.lastWidth };
    }
    this.chartDirty = true;
  }

  chartState() {
    const T = this.target;
    const nb = this.nb;
    const youDone = this.mode !== 'play' && this.mode !== 'intro';
    return {
      month: this.month,
      frac: this.monthT / MONTH,
      snowAt: SNOW_AT,
      roofOn: this.roofOn,
      narrow: this.chartNarrow,
      you: {
        share: this.plan.saved / T,
        history: this.history.map((v) => (v / T) * 100),
        pred: this.pred,
        path: (h) => { const q = this.ai.path(h, this.plan.saved); return { mid: (q.mid / T) * 100, lo: (q.lo / T) * 100, hi: (q.hi / T) * 100 }; },
        done: youDone,
        doneMonth: this.doneMonth,
      },
      them: {
        name: t('bricksNeighbors'),
        share: nb ? nb.saved / nb.target : 0,
        history: nb ? nb.history.map((v) => (v / nb.target) * 100) : [0],
        pred: nb?.pred,
        done: !!nb?.done,
        doneMonth: nb?.doneMonth,
      },
      marks: this.marks.map((mk) => ({ ...mk, v: (mk.v / T) * 100 })),
      note: t(this.noteKey ?? 'bricksNote_prior'),
      verdict: youDone && this.early ? this.earlyVerdict() : '',
    };
  }

  earlyVerdict() {
    const lo = Math.ceil(this.early.lo);
    const hi = Number.isFinite(this.early.hi) ? Math.ceil(this.early.hi) : 99;
    const key = this.doneMonth < lo ? 'bricksChartFast' : this.doneMonth > hi ? 'bricksChartSlow' : 'bricksChartHit';
    return t(key, { lo, hi: hi === 99 ? '?' : hi });
  }

  makeChart() {
    const narrow = !this.engine.isXR && window.innerWidth / window.innerHeight < 0.95;
    if (this.chart && this.chartNarrow === narrow) return;
    if (this.chart) { this.chart.removeFromParent(); this.chart.dispose(); }
    this.chartNarrow = narrow;
    this.chart = new Panel(num('xr-bricks-chart-w'), num(narrow ? 'xr-bricks-chart-h-narrow' : 'xr-bricks-chart-h'), (ctx, p) => drawChart(ctx, p, this.chartState()));
    this.chart.userData.noFit = true;
    this.chartHolder.add(this.chart);
    if (this.engine.isXR) placeOnArc(this.chartHolder, 0.74, this.eye - 0.02, 1.0);
    this.chartDirty = false;
  }

  // ---------- messages ----------

  toast(text, token = 'xr-panel-text', dur = 2.2) {
    this.toastPanel?.removeFromParent();
    this.toastPanel?.dispose();
    const p = textPanel(0.62, 0.08, [{ text, size: 'xr-text-md', weight: 'black', color: color(token) }], { surface: { stroke: color(token), stripe: false } });
    p.userData.noFit = true;
    if (this.engine.isXR) this.placeXR();
    this.toastHolder.add(p);
    this.popIn(p);
    this.toastPanel = p;
    this.delay(dur, () => {
      if (this.toastPanel !== p) return;
      this.tween(0.25, (k) => { p.material.opacity = 1 - k; }, { onDone: () => { if (this.toastPanel === p) { p.removeFromParent(); p.dispose(); this.toastPanel = null; } } });
    });
  }

  showHint() {
    if (this.mode !== 'play' || this.placed > 0 || this.grabs.size) return;
    const key = this.engine.isXR ? 'bricksHintXR' : this.engine.touchUI ? 'bricksHintTouch' : 'bricksHintScreen';
    this.toast(t(key), 'xr-bricks-ghost', 7);
    this.hinting = true;
  }

  hideHint() {
    if (!this.hinting) return;
    this.hinting = false;
    if (this.toastPanel) { this.toastPanel.removeFromParent(); this.toastPanel.dispose(); this.toastPanel = null; }
  }

  // ---------- the weather ----------

  firstSnow() {
    this.snowing = true;
    bsfx.snow();
    if (this.building()) this.toast(t('bricksSnowStarts'), 'xr-bricks-snow-icon', 2.6);
    this.tween(4, (k) => { this.snow.density = 0.6 * k; });
    if (!this.roofOn && this.mode !== 'intro') this.wet = true;
  }

  // ---------- the allotment and the loan phase ----------

  allot(late) {
    if (this.mode !== 'play') return;
    this.mode = 'loan';
    this.late = late;
    this.doneMonth = Math.min(this.month, MAX_MONTHS);
    this.closeCard();
    for (const p of [...this.grabs.keys()]) { if (p.line) p.line.visible = true; }
    this.grabs.clear();
    this.selected = null;
    for (const b of [...this.items]) {
      const m = b.obj;
      b.state = 'gone';
      this.tween(0.4, (k) => m.scale.setScalar(Math.max(0.001, 1 - k)), { onDone: () => this.removeItem(b) });
    }
    this.spots.fill(null);
    this.queue = [];
    this.chartDirty = true;
    const first = !this.nb.done && !late;
    this.raceWon = first;
    if (first) this.score += PTS.race;
    this.toast(late ? t('bricksTimeUp') : first ? t('bricksAllotFirst', { n: PTS.race }) : t('bricksAllotSecond'), late ? 'xr-warning' : 'xr-success', 2.6);
    sfx.finish();
    music.intensity = 1;
    this.burst(this.plotRoot.localToWorld(HOUSE.clone().add(new THREE.Vector3(0, TOP, 0))), 'xr-bricks-gold-glow', 40);
    this.app.echo?.celebrate();
    this.nb.family.clap();
    this.loanPhase();
  }

  wait(sec) { return new Promise((res) => this.delay(sec, res)); }

  async loanPhase() {
    await this.wait(1.6);
    if (this.disposed) return;
    // Gaps below the highest built course of each wall are closed at once.
    const tops = new Map();
    const gaps = this.plan.remaining((p) => {
      if (p.kind === 'truss' || p.kind === 'lintel' || p.kind === 'frame') return false;
      const walls = p.wall >= 0 ? [p.wall] : [];
      if (!walls.length) return p.course <= 1;
      if (!tops.has(p.wall)) tops.set(p.wall, this.plan.topCourse(p.wall));
      return p.course <= tops.get(p.wall);
    }).sort((a, b) => a.course - b.course);
    gaps.forEach((p, i) => { this.plan.filled.set(p.id, { gold: false, order: 0, by: 'crane' }); this.field.set(p, true, false, i * 0.03); });
    this.settleAll();
    if (gaps.length) sfx.build();
    this.ghost.refresh();
    await this.wait(gaps.length ? 0.4 + gaps.length * 0.03 : 0.1);
    this.toast(t('bricksLoan'), 'xr-bricks-crane', 3);
    await this.raiseCrane();
    // Lower walls (with the frames still missing), in two loads, and the extension.
    const lower = (w) => this.plan.remaining((p) => p.wall >= 0 && !p.annex && w.includes(p.wall) && (p.kind === 'frame' || (p.kind !== 'lintel' && p.course <= 4)));
    const posts = (xs) => this.plan.remaining((p) => p.kind === 'post' && !p.annex && p.course <= 4 && xs(p));
    await this.liftPieces([...lower([0, 3]), ...posts((p) => p.x < 0 && p.z > 0)]);
    await this.liftPieces([...lower([1, 2]), ...posts((p) => !(p.x < 0 && p.z > 0))]);
    if (this.opts.annex) await this.liftPieces(this.plan.remaining((p) => p.annex));
    // Lintels by hand.
    await this.handStep('lintel', t('bricksLintels'));
    // Upper walls.
    const upper = (fn) => this.plan.remaining((p) => !p.annex && p.kind !== 'truss' && p.kind !== 'lintel' && p.course >= 5 && fn(p));
    await this.liftPieces(upper((p) => p.z > 0 || p.x < -0.2));
    await this.liftPieces(upper(() => true));
    // Roof trusses by hand, one after another from the crane's hook.
    await this.trussStep();
    // The roof (with the dormer and the solar array if planned) and the extension's roof.
    this.tween(0.5, (k) => { this.ghost.fade = 1 - k; });
    this.toast(t('bricksRoof'), 'xr-bricks-crane', 2.4);
    await this.liftRoof();
    if (this.opts.annex) await this.liftAnnexRoof();
    this.roofOn = true;
    this.roofMonth = this.month;
    this.indoorSnow.visible = this.wet;
    if (this.wet) { this.score -= PTS.wet; this.toast(t('bricksRoofWet', { n: PTS.wet }), 'xr-danger', 2.8); bsfx.refuse(); }
    else { this.score += PTS.dry; this.toast(t('bricksRoofDry', { n: PTS.dry }), 'xr-success', 2.8); sfx.powerup(); }
    this.chartDirty = true;
    this.finale();
  }

  settleAll() {
    for (const p of this.plan.settle()) this.field.setTilt(p, this.plan.filled.get(p.id).skew ?? null);
  }

  /** Parts that must be set by hand in the loan phase come quickly down the belt. */
  async handStep(kind, msg) {
    const list = this.plan.remaining((p) => p.kind === kind);
    if (!list.length) return;
    this.toast(msg, 'xr-bricks-ghost', 3);
    this.tween(0.4, (k) => { this.ghost.fade = 0.4 + 0.6 * k; });
    let sent = 0;
    await new Promise((res) => {
      this.handDone = () => { if (!this.plan.remaining((p) => p.kind === kind).length) res(); };
      const feed = () => {
        if (this.disposed || this.mode !== 'loan') return;
        if (sent < list.length && this.spots.includes(null)) { this.deliver(kind, 0); sent += 1; }
        if (sent < list.length) this.delay(0.8, feed);
      };
      feed();
    });
    this.handDone = null;
    this.tween(0.4, (k) => { this.ghost.fade = 1 - 0.6 * k; });
  }

  /** The crane hands over the roof trusses one by one at the hook; you set them on the walls. */
  async trussStep() {
    const list = this.plan.remaining((p) => p.kind === 'truss');
    this.toast(t('bricksTrusses'), 'xr-bricks-ghost', 3);
    this.tween(0.4, (k) => { this.ghost.fade = 0.4 + 0.6 * k; });
    const c = this.crane;
    const aim = c.aimAt(HOOK_AT.x, HOOK_AT.z);
    await this.craneMove(aim.yaw, aim.reach, c.dropTo(HOOK_AT.y + RIDGE + 0.04), 0.9);
    this.hookPad.visible = true;
    for (let i = 0; i < list.length; i++) {
      if (this.disposed) return;
      const b = this.spawnItem('truss', -1, HOOK_AT);
      b.obj.scale.setScalar(0.001);
      this.tween(0.3, (k) => b.obj.scale.setScalar(Math.max(0.001, k)));
      bsfx.motor();
      await new Promise((res) => { this.handDone = res; });
      this.handDone = null;
    }
    this.hookPad.visible = false;
  }

  craneMove(yaw, reach, drop, dur) {
    const c = this.crane;
    const y0 = c.yaw;
    const r0 = c.reach;
    const d0 = c.drop;
    let dy = yaw - y0;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    bsfx.motor();
    return new Promise((res) => this.tween(dur, (k) => { c.yaw = y0 + dy * k; c.reach = r0 + (reach - r0) * k; c.drop = d0 + (drop - d0) * k; }, { ease, onDone: res }));
  }

  raiseCrane() {
    const r = this.crane.root;
    r.visible = true;
    r.scale.set(1, 0.02, 1);
    bsfx.motor();
    this.delay(0.5, () => bsfx.motor());
    this.puffs.puff(CRANE_AT.clone().add(new THREE.Vector3(0, 0.02, 0)), { n: 10, spread: 0.07, size: 0.03 });
    return new Promise((res) => this.tween(1.0, (k) => r.scale.set(1, Math.max(0.02, k), 1), { ease, onDone: res }));
  }

  parkCrane() {
    const c = this.crane;
    this.craneMove(2.3, 0.16, 0.06, 1.1).then(() => this.tween(1.0, (k) => c.root.scale.set(1, Math.max(0.02, 1 - k), 1), { ease, onDone: () => { c.root.visible = false; } }));
  }

  /** Pieces still missing come down on the crane as one load. */
  async liftPieces(pieces) {
    if (!pieces.length || this.disposed) return;
    const load = new THREE.Group();
    let top = -Infinity;
    const box = new THREE.Box3();
    const M = this.M;
    for (const p of pieces) {
      let m;
      if (p.kind === 'frame') m = M.make(p.frame === 'door' ? 'DoorFrame' : 'Window');
      else if (p.kind === 'lintel') m = M.make('Lintel');
      else m = new THREE.Mesh(p.kind === 'full' ? M.geo.brick : p.kind === 'post' ? M.geo.quoin : M.geo.half, p.kind === 'post' ? M.mats.Quoin : M.mats.BrickClay);
      if (!m) continue;
      this.useGlass(m);
      m.position.set(p.x, p.y, p.z);
      m.rotation.y = p.kind === 'frame' ? p.face : p.kind === 'post' ? (p.course % 2 ? Math.PI / 2 : 0) : p.yaw;
      m.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      load.add(m);
      top = Math.max(top, p.y + (p.kind === 'frame' ? 0.05 : BH / 2));
      box.expandByPoint(new THREE.Vector3(p.x, p.y, p.z));
    }
    const c = box.getCenter(new THREE.Vector3());
    const attach = new THREE.Vector3(c.x, top + 0.002, c.z);
    const size = box.getSize(new THREE.Vector3());
    const alongX = size.x >= size.z;
    const half = (alongX ? size.x : size.z) / 2;
    const ends = [new THREE.Vector3(alongX ? -half : 0, 0, alongX ? 0 : -half), new THREE.Vector3(alongX ? half : 0, 0, alongX ? 0 : half)];
    await this.craneCarry(load, attach, ends);
    for (const p of pieces) {
      this.plan.filled.set(p.id, { gold: false, order: 0, by: 'crane' });
      this.field.set(p, true);
      if (p.kind === 'frame' && p.frame === 'door') this.doorPivot.visible = true;
    }
    this.settleAll();
    this.ghost.refresh();
    load.removeFromParent();
  }

  async liftRoof() {
    const load = new THREE.Group();
    const roof = this.M.make('Roof') ?? new THREE.Group();
    this.useGlass(roof);
    roof.position.set(0, TOP, 0);
    load.add(roof);
    if (this.opts.dormer) { const d = this.M.make('Dormer'); this.useGlass(d); if (d) { d.position.set(0, TOP, 0); load.add(d); } }
    if (this.opts.solar) { const s = this.M.make('Solar'); if (s) { s.position.set(0, TOP, 0); load.add(s); } }
    const attach = new THREE.Vector3(0, TOP + RIDGE + 0.02, 0);
    await this.craneCarry(load, attach, [new THREE.Vector3(-0.2, -0.01, 0), new THREE.Vector3(0.2, -0.01, 0)]);
    for (const o of [...load.children]) this.home.add(o);
    load.removeFromParent();
    // The trusses disappear under the roof; the eaves get fairy lights.
    if (CHRISTMAS) {
      const RX = OX + 0.03;
      const EY = TOP - (EAVE * RIDGE) / OZ;
      this.eaveLights = makeLightString({ x0: -RX, x1: RX, y: EY - 0.014, z: OZ + EAVE + 0.008, sag: 0.022, swags: 3, bulbs: 24 });
      this.eaveLights.visible = false;
      this.home.add(this.eaveLights);
    }
  }

  async liftAnnexRoof() {
    const r = this.M.make('AnnexRoof');
    if (!r) return;
    const load = new THREE.Group();
    const y = ANNEX_COURSES * H;
    const x = -OX - (2 * L + D) / 2;
    r.position.set(x, y, 0);
    load.add(r);
    await this.craneCarry(load, new THREE.Vector3(x, y + 0.02, 0), [new THREE.Vector3(0, 0, -0.08), new THREE.Vector3(0, 0, 0.08)]);
    this.home.add(r);
    load.removeFromParent();
  }

  /** The crane swings over, lowers the load onto its place (attach point, house space) and lets go. */
  async craneCarry(load, attach, ends) {
    const c = this.crane;
    this.home.add(load);
    this.carry = { load, attach, ends };
    this.updateCarry();
    const tgt = attach.clone().add(HOUSE);
    const aim = c.aimAt(tgt.x, tgt.z);
    load.scale.setScalar(0.001);
    this.tween(0.25, (k) => load.scale.setScalar(Math.max(0.001, k)));
    await this.craneMove(aim.yaw, aim.reach, 0.03, 0.8);
    const dEnd = c.dropTo(tgt.y);
    await this.craneMove(aim.yaw, aim.reach, dEnd, 0.65);
    bsfx.land();
    this.burst(this.plotRoot.localToWorld(tgt.clone()), 'xr-bricks-puff', 14);
    const bottom = attach.clone().add(HOUSE);
    for (const e of ends) this.puffs.puff(bottom.clone().add(e).setY(HOUSE.y + 0.02), { n: 6, spread: 0.06 });
    this.carry = null;
    c.setSlings(null);
    await this.craneMove(aim.yaw, aim.reach, 0.05, 0.3);
  }

  updateCarry() {
    const k = this.carry;
    if (!k) return;
    const hp = this.crane.hookPoint();
    const local = hp.clone().sub(HOUSE);
    k.load.position.copy(local).sub(k.attach);
    const pts = k.ends.map((e) => k.attach.clone().add(e).add(k.load.position).add(HOUSE));
    this.crane.setSlings(pts);
  }

  async finale() {
    this.mode = 'finale';
    this.parkCrane();
    await this.wait(0.3);
    bsfx.lights();
    this.tween(1.2, (k) => { this.glass.emissiveIntensity = 1.6 * k; });
    if (this.eaveLights) this.eaveLights.visible = true;
    await this.wait(0.7);
    bsfx.door();
    this.tween(1.1, (k) => { this.doorPivot.rotation.y = 1.15 * k; this.interior.material.opacity = 0.85 * k; }, { ease });
    this.smoking = true;
    if (!this.snowing) this.tween(3, (k) => { this.snow.density = 0.45 * k; });
    this.toast(t('bricksHome'), 'xr-success', 4);
    this.burst(this.plotRoot.localToWorld(HOUSE.clone().add(new THREE.Vector3(0, TOP + RIDGE, 0))), 'xr-warning', 36);
    sfx.finish();
    this.nb.family.cheer();
    bsfx.cheer();
    this.app.echo?.suppress(false);
    this.echoRelease = this.app.host?.hold(this.home, new THREE.Vector3(-0.08, TOP + RIDGE + 0.14, 0.03), { force: true }) ?? null;
    this.delay(2.4, () => { if (!this.disposed) this.app.echo?.celebrate(); });
    await this.wait(4.6);
    this.echoRelease?.();
    this.echoRelease = null;
    await this.wait(1.8);
    this.finish();
  }

  finish() {
    if (this.mode === 'over') return;
    this.mode = 'over';
    this.echoRelease?.();
    this.echoRelease = null;
    this.app.echo?.suppress(false);
    this.closeCard();
    this.exitPlayView();
    this.chartHolder.visible = false;
    this.toastHolder.visible = false;
    this.nb.sign.visible = false;
    if (this.engine.isXR) {
      // The finished house moves aside so the results can be read; the neighbors make room.
      const p0 = this.plotRoot.position.clone();
      const p1 = new THREE.Vector3(-1.05, this.eye - 0.8, -0.85);
      this.tween(1.2, (k) => { this.plotRoot.position.lerpVectors(p0, p1, k); this.plotRoot.rotation.y = 0.75 * k; }, { ease });
      this.nb.root.visible = false;
    } else this.world.visible = false;
    const speed = Math.round(PTS.speed * clamp((SLOW - this.doneMonth) / (SLOW - FAST), 0, 1));
    const rooms = Math.max(0, this.rooms - 4) * PTS.room;
    const score = clamp(Math.round(this.score + (this.late ? 0 : PTS.allot) + speed + this.bonus + rooms), 0, 5000);
    const extras = [this.opts.annex && t('bricksExtra_annex'), this.opts.solar && t('bricksExtra_solar'), this.opts.garden && t('bricksExtra_garden')].filter(Boolean);
    const house = [t('bricksRooms', { n: this.rooms }), ...extras].join(', ');
    const first = this.firstWidth;
    const fmt = (w) => (Number.isFinite(w) ? String(Math.max(1, Math.round(w))) : '30+');
    const choice = this.path.some((k) => ['kitchen', 'waitSave', 'solar', 'bigger'].includes(k)) ? 'bigger' : this.path.includes('smaller') ? 'smaller' : 'income';
    const learned = [
      { q: t('bricksLearn1Q'), a: t('bricksLearn1A', { n: first?.n ?? 3, a: fmt(first?.w ?? Infinity), b: fmt(this.lastWidth ?? 1) }) },
      { q: t('bricksLearn2Q'), a: t(`bricksLearn2A_${this.nb.style}`) },
      { q: t('bricksLearn3Q'), a: t(`bricksLearn3A_${choice}`) },
    ];
    this.results({
      gameKey: 'bricks',
      score,
      correct: this.clean,
      total: Math.max(1, this.placed),
      line: t('bricksLine', { house, month: this.roofMonth || this.month, race: t(this.raceWon ? 'bricksRaceWon' : 'bricksRaceLost') }),
      learned,
      onAgain: () => this.app.startGame('bricks'),
    });
  }

  // ---------- frame loop ----------

  update(dt) {
    this.time += dt;
    const playing = this.mode === 'play';
    if (playing || this.mode === 'loan') {
      if (!this.card) this.monthT += dt;
      if (this.monthT >= MONTH) { this.monthT -= MONTH; this.endMonth(); }
    }
    if (playing) {
      if (this.queue.length && this.time >= this.nextQueue && this.spots.includes(null)) {
        this.deliver(this.queue.shift(), 0);
        this.nextQueue = this.time + 0.55;
      }
      music.intensity = this.plan.saved > this.target * 0.75 ? 1 : 0;
    }
    if (this.monthFlash > 0) {
      this.monthFlash -= dt;
      if (this.monthFlash <= 0) this.monthPanel?.redraw();
    }
    if (this.M) {
      this.updateItems(dt);
      this.updateGrabs(dt);
      this.updateHover();
      this.field.update(dt, this.time);
      this.ghost.update(dt, this.time, { show: this.building() ? this.ghostTargets() : [], hover: this.hoverTarget() });
      this.puffs.update(dt);
      this.firLights?.userData.tick(this.time);
      this.eaveLights?.userData.tick(this.time);
      this.crane.sway = this.mode === 'loan' ? 1 : 0.3;
      this.crane.apply(this.time);
      this.updateCarry();
      if (this.smoking && (this.smokeT = (this.smokeT ?? 0) - dt) <= 0) {
        this.smokeT = 0.45;
        this.puffs.smoke(CHIMNEY.clone().add(HOUSE));
      }
      this.nb?.family.tick(dt, this.time);
      this.nb?.field.update(dt, this.time);
      // Snow in the open house while it snows and the roof is not on.
      if (this.wet && !this.roofOn) this.indoorSnow.material.opacity = Math.min(0.9, this.indoorSnow.material.opacity + dt * 0.05);
      this.snow.setGround(this.engine.floorY - this.engine.root.position.y);
      const p = this.plotRoot.position;
      this.snow.setDisc(p.x + 0.06, p.z, 0.55, p.y + 0.002);
      this.snow.update(dt);
      this.snowLevel = this.snowing || this.mode === 'finale' ? Math.min(0.85, this.snowLevel + dt * 0.03) : 0;
      setSnowAmount(this.snowLevel);
    }
    for (const p of this.grabs.keys()) p.pressed = null;
    if (this.chart && (playing || this.mode === 'loan' || this.mode === 'finale')) {
      this.chartT = (this.chartT ?? 0) - dt;
      if (this.chartDirty || this.chartT <= 0) {
        this.chart.redraw();
        this.chartDirty = false;
        this.chartT = 0.5;
      }
    }
    if (Math.floor(this.time * 4) !== this.hudTick) {
      this.hudTick = Math.floor(this.time * 4);
      if (this.building()) this.refreshHud?.();
    }
    if (!this.engine.isXR) this.previewCamera(dt);
  }

  /** What the hologram shows bright: places for the part in hand (or selected), else for the pallet. */
  ghostTargets() {
    const held = [...this.grabs.values()].map((g) => g.b)[0] ?? this.selected;
    if (held) return this.targetsFor(held);
    const kinds = new Set(this.items.filter((b) => this.grabbable(b)).map((b) => targetKind(b.kind)));
    const seen = new Set();
    const out = [];
    for (const k of kinds) {
      for (const g of this.plan.targets(k, { wobbly: false })) {
        const key = g.pieces.map((p) => p.id).join('+');
        if (k === 'double' || seen.has(key)) continue;
        seen.add(key);
        out.push(g);
      }
    }
    return out;
  }

  hoverTarget() { return [...this.grabs.values()].map((g) => g.hover).find(Boolean) ?? null; }

  updateItems(dt) {
    for (const b of this.items) {
      const m = b.obj;
      if (b.state === 'belt') {
        b.t += dt / BELT_TIME;
        const k = Math.min(1, b.t);
        m.position.set(BELT_X, BELT_Y + (REST_Y[b.kind] ?? BH / 2), BELT_Z0 + 0.01 + k * (BELT_LEN - 0.02));
        if (b.t >= 1) { b.state = 'hop'; b.t = 0; b.from = m.position.clone(); }
      } else if (b.state === 'hop') {
        b.t += dt / 0.3;
        const k = Math.min(1, b.t);
        m.position.lerpVectors(b.from, this.restPos(b), ease(k));
        m.position.y += Math.sin(k * Math.PI) * 0.03;
        if (k >= 1) { b.state = 'pallet'; sfx.thud(); }
      } else if (b.state === 'return') {
        b.t += dt / 0.4;
        const k = Math.min(1, b.t);
        m.position.lerpVectors(b.from, this.restPos(b), ease(k));
        m.position.y += Math.sin(k * Math.PI) * 0.05;
        m.quaternion.slerpQuaternions(b.fromQ, this.restQuat(b), ease(k));
        if (k >= 1) b.state = b.wasHook ? 'hook' : 'pallet';
      } else if (b.state === 'selected') {
        const sp = this.restPos(b);
        m.position.set(sp.x, sp.y + 0.02 + Math.sin(this.time * 5) * 0.004, sp.z);
      } else if (b.state === 'hook') {
        m.position.copy(HOOK_AT);
        m.position.y += Math.sin(this.time * 1.6) * 0.004;
        m.rotation.y = Math.PI / 2 + Math.sin(this.time * 0.9) * 0.08;
      }
      const glow = this.selected === b ? 0.35 + 0.2 * Math.sin(this.time * 6) : b.state === 'held' ? 0.18 : b.hover ? 0.3 : 0;
      for (const mat of b.mats) if (mat.isMeshStandardMaterial) mat.emissiveIntensity = b.base + glow;
    }
    // The crane's slings hold the truss on the hook.
    if (this.items.some((b) => b.state === 'hook')) {
      const hp = HOOK_AT.clone();
      this.crane.setSlings([hp.clone().add(new THREE.Vector3(-0.1, RIDGE * 0.45, 0)), hp.clone().add(new THREE.Vector3(0.1, RIDGE * 0.45, 0))]);
    } else if (!this.carry) this.crane.setSlings(null);
  }

  updateGrabs(dt) {
    for (const g of this.grabs.values()) {
      const b = g.b;
      if (b.state !== 'held') continue;
      const prev = g.hover;
      if (g.p.kind === 'xr') this.followHand(g, dt);
      else this.followPointer(g, dt);
      if (g.hover && (!prev || g.hover.pieces[0].id !== prev.pieces[0].id)) {
        bsfx.snap();
        this.engine.haptic(g.p, g.hover.state === 'wobbly' ? 0.4 : 0.15, g.hover.state === 'wobbly' ? 30 : 12);
      }
    }
  }

  snapRadius(b) {
    const big = b.kind === 'truss' ? 1.8 : b.kind === 'window' || b.kind === 'door' ? 1.3 : 1;
    return num('xr-bricks-snap') * big;
  }

  followHand(g, dt) {
    const a = this.anchor(g.p);
    if (!a) return;
    const b = g.b;
    const W = new THREE.Matrix4().compose(a.pos, a.quat, ONE).multiply(g.offset);
    const wp = new THREE.Vector3();
    const wq = new THREE.Quaternion();
    W.decompose(wp, wq, new THREE.Vector3());
    this.plotRoot.updateMatrixWorld(true);
    const lp = this.plotRoot.worldToLocal(wp);
    const rootQ = this.plotRoot.getWorldQuaternion(new THREE.Quaternion());
    const lq = rootQ.invert().multiply(wq);
    const R = this.snapRadius(b);
    let best = null;
    let bd = R;
    const v = new THREE.Vector3();
    for (const tg of this.targetsFor(b)) {
      const d = this.piecePos(tg, v).distanceTo(lp) + (tg.state === 'wobbly' ? 0.012 : 0);
      if (d < bd) { bd = d; best = tg; }
    }
    g.hover = best;
    g.rawDist = best ? this.piecePos(best, v).distanceTo(lp) : null;
    g.hint = best ? null : this.refuseHintNear(lp, b);
    if (best) {
      const k = clamp(1 - bd / R, 0, 1) * 0.45;
      lp.lerp(this.piecePos(best, v), k);
      lq.slerp(this.targetQuat(best), k * 0.6);
    }
    const s = 1 - Math.exp(-dt * (this.time - g.t0 < 0.2 ? 14 : 30));
    b.obj.position.lerp(lp, s);
    b.obj.quaternion.slerp(lq, s);
  }

  followPointer(g, dt) {
    const b = g.b;
    const m = this.pointerPx(g.p, true);
    const tg = this.nearestScreen(m.x, m.y, this.snapPx() * (b.kind === 'truss' ? 1.6 : 1), this.targetsFor(b));
    g.hover = tg;
    g.hint = tg ? null : this.refuseHintScreen(m.x, m.y, b);
    const lp = new THREE.Vector3();
    let lq = this.restQuat(b);
    if (tg) {
      this.piecePos(tg, lp).y += b.kind === 'truss' ? 0.04 : 0.03;
      lq = this.targetQuat(tg);
    } else {
      const cam = this.engine.camera;
      const ndc = new THREE.Vector2((m.x / window.innerWidth) * 2 - 1, -(m.y / window.innerHeight) * 2 + 1);
      const rc = new THREE.Raycaster();
      rc.setFromCamera(ndc, cam);
      this.plotRoot.updateMatrixWorld(true);
      const ray = rc.ray.clone().applyMatrix4(this.plotRoot.matrixWorld.clone().invert());
      const k = Math.abs(ray.direction.y) > 1e-4 ? (DRAG_Y - ray.origin.y) / ray.direction.y : -1;
      if (k > 0) lp.copy(ray.origin).addScaledVector(ray.direction, k);
      else lp.copy(b.obj.position);
      lp.x = clamp(lp.x, -0.7, 0.7);
      lp.z = clamp(lp.z, -0.5, 0.5);
    }
    const s = 1 - Math.exp(-dt * 26);
    b.obj.position.lerp(lp, s);
    b.obj.quaternion.slerp(lq, s);
  }

  updateHover() {
    for (const b of this.items) b.hover = false;
    if (!this.building()) return;
    for (const p of this.engine.pointers) {
      if (!p.active || this.grabs.has(p)) continue;
      if (p.kind === 'mouse' && !this.engine.isXR) {
        if (p.hovered === this.pad || p.hovered === this.hookPad) { const b = this.pickItem(p, p.hovered); if (b) b.hover = true; }
      } else if (p.kind === 'xr' && this.engine.isXR) {
        const a = this.anchor(p);
        if (!a) continue;
        let near = null;
        let bd = Infinity;
        for (const b of this.items) {
          if (!this.grabbable(b)) continue;
          const d = b.obj.getWorldPosition(new THREE.Vector3()).distanceTo(a.pos);
          if (d < this.grabRadius(a, b) && d < bd) { bd = d; near = b; }
        }
        if (!near && (p.hovered === this.pad || p.hovered === this.hookPad)) near = this.pickItem(p, p.hovered);
        if (near) near.hover = true;
      }
    }
  }

  // ---------- browser view ----------

  /** Screen layout (CSS px): HUD row, chart, the neighbors' picture and the plot area. */
  layout() {
    const W = window.innerWidth;
    const Hh = window.innerHeight;
    const touch = this.engine.touchUI;
    const ins = this.engine.insets();
    const m = 10;
    const portrait = W / Hh < 0.95;
    let top = touch ? ins.top : 0;
    let hud = null;
    if (!touch) {
      // The app's close button sits at the top right of the page: the row stays left of it.
      const free = W - 2 * m - 150;
      const rowW = clamp(free, 300, 760);
      const ppm = rowW / 1.27;
      hud = { ppm, x0: m + Math.max(0, (free - rowW) / 2), y: m };
      top = m + 0.15 * ppm + 6;
    }
    const cw = num('xr-bricks-chart-w');
    const ch = this.chart?.h ?? num('xr-bricks-chart-h');
    let chart;
    let plot;
    let pip;
    if (portrait) {
      const w = W - 2 * m;
      const h = (w * ch) / cw;
      chart = { x: m, y: top + m * 0.5, w, h };
      const rest = Hh - (chart.y + h + m * 0.5) - m;
      const ph = Math.min(96, rest * 0.24);
      plot = { x: 0, y: chart.y + h + m * 0.5, w: W, h: rest - ph };
      pip = { x: m, y: plot.y + plot.h, w: W - 2 * m, h: ph, row: true };
    } else {
      let w = clamp(W * 0.34, 220, 480);
      let h = (w * ch) / cw;
      const avail = Hh - top - 2 * m;
      const pipH = Math.min(w * 0.6, avail * 0.36);
      const roomForPip = avail - h > 110;
      if (h > avail - (roomForPip ? pipH : 0)) { h = Math.max(avail * 0.6, avail - (roomForPip ? pipH : 0)); w = (h * cw) / ch; }
      chart = { x: m, y: top + m, w, h };
      const px0 = chart.x + w + m * 0.5;
      if (avail - h - m > 100) {
        pip = { x: m, y: chart.y + h + m, w, h: Hh - (chart.y + h + m) - m };
        plot = { x: px0, y: top, w: W - px0, h: Hh - top - m };
      } else {
        // Little room under the chart (phone in landscape): the neighbors at the right.
        const pw = Math.min(170, (W - px0) * 0.3);
        pip = { x: W - pw - m, y: top + m, w: pw, h: Math.min(150, (Hh - top) * 0.5) };
        plot = { x: px0, y: top, w: W - px0 - pw - m, h: Hh - top - m };
      }
    }
    return { W, Hh, chart, plot, pip, hud, portrait, touch };
  }

  /** Puts an object at a screen spot (px), facing the camera (turned by tilt), ppm pixels per meter. */
  pin(obj, x, y, ppm, dist = 0.5, tilt = null) {
    const cam = this.engine.camera;
    const W = window.innerWidth;
    const Hh = window.innerHeight;
    const camPos = cam.getWorldPosition(new THREE.Vector3());
    const camQ = cam.getWorldQuaternion(new THREE.Quaternion());
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camQ);
    const pt = new THREE.Vector3((x / W) * 2 - 1, -(y / Hh) * 2 + 1, 0.5).unproject(cam);
    const dir = pt.sub(camPos).normalize();
    const world = camPos.clone().addScaledVector(dir, dist / Math.max(0.2, dir.dot(fwd)));
    const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const native = Hh / (2 * dist * tan);
    obj.parent.updateMatrixWorld(true);
    obj.position.copy(obj.parent.worldToLocal(world));
    const pq = obj.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    obj.quaternion.copy(pq.multiply(camQ));
    if (tilt) obj.quaternion.multiply(tilt);
    obj.scale.setScalar(ppm / native);
  }

  previewCamera(dt) {
    const e = this.engine;
    const cam = e.camera;
    const active = this.mode === 'play' || this.mode === 'loan' || this.mode === 'finale';
    if (!active || !this.M) return;
    e.fitEnabled = false;
    this.viewOn = true;
    this.makeChart();
    const lay = this.layout();
    const loan = this.mode !== 'play';
    const finale = this.mode === 'finale';
    const yaw = finale ? 0.12 + Math.sin(this.time * 0.32) * 0.4 : 0.12;
    const pitch = finale ? -0.5 : -0.64;
    const R = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    const Ri = R.clone().invert();
    const left = this.opts.annex ? -0.46 : lay.portrait ? -0.3 : -0.5;
    const box = [[left, 0.62], [-0.04, loan ? 0.72 : 0.26], [lay.portrait ? -0.3 : -0.4, 0.4]];
    const C = new THREE.Vector3((box[0][0] + box[0][1]) / 2, 0.06, 0);
    this.plotRoot.updateMatrixWorld(true);
    const Cw = this.plotRoot.localToWorld(C.clone());
    const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const tx = (tan * lay.plot.w) / lay.Hh / 1.01;
    const ty = (tan * lay.plot.h) / lay.Hh / 1.01;
    let need = 0.3;
    const q = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      q.set(box[0][i & 1], box[1][(i >> 1) & 1], box[2][(i >> 2) & 1]);
      this.plotRoot.localToWorld(q).sub(Cw).applyQuaternion(Ri);
      need = Math.max(need, q.z + Math.abs(q.x) / tx, q.z + Math.abs(q.y) / ty);
    }
    const k = this.camD === undefined ? 1 : Math.min(1, dt * 4);
    this.camD = (this.camD ?? need) + (need - (this.camD ?? need)) * k;
    cam.position.copy(Cw).add(new THREE.Vector3(0, 0, this.camD).applyQuaternion(R));
    cam.quaternion.copy(R);
    if (cam.fov !== 60) cam.fov = 60;
    const cx = lay.plot.x + lay.plot.w / 2;
    const cy = lay.plot.y + lay.plot.h / 2;
    cam.setViewOffset(lay.W, lay.Hh, lay.W / 2 - cx, lay.Hh / 2 - cy, lay.W, lay.Hh);
    cam.updateMatrixWorld(true);
    const cw = num('xr-bricks-chart-w');
    this.pin(this.chartHolder, lay.chart.x + lay.chart.w / 2, lay.chart.y + lay.chart.h / 2, lay.chart.w / cw);
    if (lay.hud) {
      for (const o of this.hudObjs ?? []) {
        const isInfo = o.w > 0.5;
        const x = isInfo ? lay.hud.x0 + (0.98 / 2) * lay.hud.ppm : lay.hud.x0 + (1.27 - 0.13) * lay.hud.ppm;
        this.pin(o, x, lay.hud.y + 0.075 * lay.hud.ppm, lay.hud.ppm, 0.45);
      }
    }
    // The neighbors as a little picture: their plot seen from above, their sign on top.
    const nb = this.nb;
    if (nb) {
      const pp = lay.pip;
      const sw = num('xr-bricks-sign-w');
      const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, -0.25, 0, 'YXZ'));
      if (pp.row) {
        // Phone upright: the sign at the left, the little plot at the right.
        const sppm = Math.min((pp.w * 0.55) / sw, pp.h / 0.13);
        this.pin(nb.sign, pp.x + (sw * sppm) / 2, pp.y + pp.h / 2, sppm, 0.43);
        const dw = pp.w - sw * sppm - 8;
        const dppm = Math.min(dw / 1.2, pp.h / 0.62);
        this.pin(nb.root, pp.x + pp.w - dw / 2, pp.y + pp.h * 0.45, dppm, 0.5, tilt);
        nb.root.visible = dw > 60;
      } else {
        const sppm = Math.min(pp.w / sw, 520);
        const signH = 0.11 * sppm;
        this.pin(nb.sign, pp.x + pp.w / 2, pp.y + signH / 2, sppm, 0.43);
        const areaH = pp.h - signH;
        const dppm = Math.min(pp.w / 1.2, areaH / 0.75);
        this.pin(nb.root, pp.x + pp.w / 2, pp.y + signH + areaH * 0.42, dppm, 0.5, tilt);
        nb.root.visible = areaH > 50;
      }
    }
    const ppm = Math.min(lay.plot.w / 0.8, lay.Hh / 1.0, 900);
    this.pin(this.toastHolder, lay.plot.x + lay.plot.w / 2, lay.plot.y + 0.07 * ppm + 6, ppm, 0.42);
    if (this.cardGroup) {
      const btns = lay.touch ? document.querySelector('#stage .mtouch:not([hidden])') : null;
      const bottom = btns ? lay.Hh - btns.getBoundingClientRect().top + 6 : 0;
      // The card is modal: phones get it over the chart too (in landscape left of the thumb buttons).
      let area = { x: lay.plot.x, w: lay.plot.w + (lay.pip.x > lay.plot.x ? lay.pip.w : 0), y0: lay.plot.y };
      let bottom2 = bottom;
      if (lay.touch && lay.portrait) area = { x: 0, w: lay.W, y0: lay.chart.y };
      else if (lay.touch && btns) { area = { x: 0, w: btns.getBoundingClientRect().left - 10, y0: lay.chart.y }; bottom2 = 10; }
      const ch = this.cardGroup.userData.h + 0.02;
      const cppm = Math.min(lay.touch ? 900 : ppm * 1.05, (area.w - 20) / 0.72, (lay.Hh - area.y0 - bottom2 - 16) / ch);
      const cyc = (area.y0 + lay.Hh - bottom2) / 2;
      this.pin(this.cardHolder, area.x + area.w / 2, cyc, cppm, 0.4);
    }
  }

  exitPlayView() {
    if (this.engine.isXR || !this.viewOn) return;
    this.viewOn = false;
    const cam = this.engine.camera;
    cam.clearViewOffset();
    cam.rotation.set(0, 0, 0);
    this.engine.fitEnabled = true;
    for (const { o, pos } of this.hudHome ?? []) { o.position.copy(pos); o.quaternion.identity(); o.scale.setScalar(1); }
  }

  /** Headset placement: messages above the house (above the card while one is open). */
  placeXR() {
    this.toastHolder.position.set(0, this.eye + (this.cardGroup ? 0.3 : -0.2), -0.8);
    this.cardHolder.position.set(0, this.eye - 0.0, -0.85);
  }

  dispose() {
    this.mode = 'over';
    this.echoRelease?.();
    this.app.echo?.suppress(false);
    for (const p of this.engine.pointers) if (p.line && p.kind === 'xr') p.line.visible = p.source?.targetRayMode !== 'screen';
    this.exitPlayView();
    setSnowAmount(0.6);
    this.engine.renderer.shadowMap.enabled = false;
    this.engine.scene.environment = this.prevEnvironment ?? null;
    this.envTarget?.dispose();
    this.chart?.dispose();
    super.dispose();
  }
}
