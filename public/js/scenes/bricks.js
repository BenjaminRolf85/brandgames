// "Stein auf Stein" / "Brick by Brick": build your own house, brick by brick, by hand. A garden
// plot lies on the table with a foundation and the plan of the house as a hologram. Every month
// (a few seconds) the savings machine takes a coin and sends a brick down the belt to the
// pallet: that is the savings deposit. You take it (headset: grab it with the grip or trigger
// button or pinch it with your hand; browser: drag it with the mouse or a finger, or tap brick
// and place) and set it on a glowing place of the plan, course by course from the bottom up.
// Golden interest bricks come for every six bricks saved, a pay rise brings extra bricks, and
// temptations pop up (a new phone, a getaway ...): give in and bricks come off the top (or
// months pass without a deposit), resist and an extra payment arrives. The AI forecast (bricks-
// ai.js) learns from the months so far how fast you save and predicts when the allotment (40 %
// of the house) is reached, with an 80 % band that narrows as data comes in. At the allotment
// the loan phase starts: the crane lowers the remaining walls and the roof, the lights go on,
// the door opens, fairy lights and snow, and Echo flies over to celebrate.
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
import { WINTER, makeSnowfall, setSnowAmount, snowSettled } from '../snow.js';
import { TEMPTATIONS } from '../bricks-text.js';
import { Plan, L, H, GAP, TOP, FOUND, HOUSE_Z, RIDGE, EAVE, OX, OZ, ZH, openingFrames } from '../bricks-plan.js';
import { Forecaster } from '../bricks-ai.js';
import { loadBricks, plainPlot, BrickField, GhostPlan, Crane, Puffs, bsfx, temptPanel, drawChart, drawMonthDisplay } from '../bricks-visuals.js';

const MONTH = 4.0; // seconds per month
const MAX_MONTHS = 48; // then the allotment comes anyway
const RAISE_MONTH = 9; // pay rise: an extra brick every second month from here
const TEMPT_MONTHS = [5, 11, 17, 23];
const INTEREST_EVERY = 6; // a golden brick for every 6 bricks set
const SPOTS = 4; // bricks the pallet holds
const BELT_TIME = 1.1;
const PTS = { place: 30, clean: 10, gold: 60, resist: 150, allot: 300, speed: 1500 };
const FAST = 21; // months for the full speed bonus (about the best possible)
const SLOW = 44; // no speed bonus from here
// Plot placement in front of the player (headset: at table height, within reach).
const PLOT_DROP = 0.58;
const PLOT_Z = -0.52;
// Plot-local positions (meters, origin in the middle of the grass top).
const HOUSE = new THREE.Vector3(0, FOUND, HOUSE_Z);
const MACHINE = new THREE.Vector3(0.47, 0.002, -0.27);
const BELT_X = 0.47;
const BELT_Z0 = -0.18;
const BELT_LEN = 0.25;
const BELT_Y = 0.047; // belt top
const PALLET = new THREE.Vector3(0.47, 0.002, 0.19);
const PALLET_TOP = 0.027;
const SPOT_OFF = [[-0.042, -0.036], [0.042, -0.036], [-0.042, 0.036], [0.042, 0.036]];
const CRANE_AT = new THREE.Vector3(-0.06, 0, -0.335);
const BAG_AT = new THREE.Vector3(0.27, 0, 0.24);
const FIR = new THREE.Vector3(-0.4, 0, 0.1);
const CHIMNEY = new THREE.Vector3(0.12, TOP + RIDGE * 1.15 + 0.012, -0.07); // house-local
const DRAG_Y = 0.27; // a dragged brick floats at this height when it is not over a place
const BH = H - GAP; // brick height
const clamp = THREE.MathUtils.clamp;
const ease = (k) => k * k * (3 - 2 * k);
const ONE = new THREE.Vector3(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0);

export class BricksScene extends BaseScene {
  constructor(app) {
    super(app);
    this.gameKey = 'bricks';
    this.mode = 'intro';
    this.time = 0;
    this.plan = new Plan();
    this.target = this.plan.target;
    this.ai = new Forecaster({ target: this.target });
    this.history = [0];
    this.marks = [];
    this.bricks = [];
    this.spots = new Array(SPOTS).fill(null);
    this.queue = [];
    this.grabs = new Map();
    this.ctrlIndex = new Map();
    this.reserved = new Set();
    this.month = 1;
    this.monthT = 0;
    this.score = 0;

    this.envTarget = makeEnvironment(this.engine.renderer);
    this.prevEnvironment = this.engine.scene.environment;
    this.engine.scene.environment = this.envTarget.texture;

    this.world = new THREE.Group();
    this.world.userData.noFit = true;
    this.group.add(this.world);
    this.plotRoot = new THREE.Group();
    this.plotRoot.position.set(0, this.eye - PLOT_DROP, PLOT_Z);
    this.world.add(this.plotRoot);
    this.house = new THREE.Group();
    this.house.position.copy(HOUSE);
    this.plotRoot.add(this.house);
    this.puffs = new Puffs(this.plotRoot);
    this.addLights();
    // Screen elements in the 3D view (chart, toasts, card): holders the layout moves around.
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
    this.field = new BrickField(this.house, this.plan, M);
    this.ghost = new GhostPlan(this.house, this.plan);
    // Window and door frames sit in the openings from the start; their glass lights up at the end.
    this.glass = M.mats.Glass.clone();
    this.glass.emissive = new THREE.Color(hex('xr-bricks-window-light'));
    this.glass.emissiveIntensity = 0;
    const useGlass = (o) => o?.traverse((m) => { if (m.isMesh && m.material.name === 'Glass') m.material = this.glass; });
    for (const f of openingFrames()) {
      const o = M.make(f.kind === 'door' ? 'DoorFrame' : 'Window');
      if (!o) continue;
      useGlass(o);
      o.position.set(f.x, f.y, f.z);
      o.rotation.y = f.face;
      this.house.add(o);
    }
    this.doorPivot = new THREE.Group();
    this.doorPivot.position.set(-L / 2 + 0.0065, 2.5 * H - 0.003, ZH + 0.004);
    const door = M.make('Door');
    useGlass(door);
    if (door) this.doorPivot.add(door);
    this.house.add(this.doorPivot);
    this.interior = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.14), new THREE.MeshBasicMaterial({ color: hex('xr-bricks-interior'), transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    this.interior.position.set(0, 2.5 * H, ZH - 0.03);
    this.house.add(this.interior);
    this.roofTemplate = M.make('Roof');
    useGlass(this.roofTemplate);
    // Delivery: the savings machine, the belt and the pallet, at the right.
    const conveyor = M.make('Conveyor');
    conveyor?.position.set(BELT_X, 0.002, BELT_Z0);
    const machine = M.make('Machine') ?? new THREE.Group();
    machine.position.copy(MACHINE);
    const pallet = M.make('Pallet');
    pallet?.position.copy(PALLET);
    this.plotRoot.add(...[conveyor, machine, pallet].filter(Boolean));
    this.machine = machine;
    this.monthPanel = new Panel(0.1, 0.05, (ctx, p) => drawMonthDisplay(ctx, p, { month: this.month, vacation: this.vacation > 0, flash: this.monthFlash > 0 }));
    this.monthPanel.position.set(0, 0.012 + 0.13 * 0.68, 0.0535);
    machine.add(this.monthPanel);
    this.coinTemplate = M.make('Coin');
    this.bagTemplate = M.make('Bag');
    // Grab area over the belt and the pallet: a press there takes the nearest brick.
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.12, 0.52), new THREE.MeshBasicMaterial({ visible: false }));
    pad.position.set(BELT_X, 0.06, 0.04);
    pad.userData.interactive = true;
    pad.userData.label = 'pallet';
    pad.userData.onGrab = (p) => this.padGrab(p);
    pad.userData.onRelease = (p) => { if (p.kind === 'mouse') this.endGrab(p); };
    this.plotRoot.add(pad);
    this.pad = pad;
    this.crane = new Crane(M, this.plotRoot, CRANE_AT);
    // Christmas: fairy lights on the little fir in the garden, and on the eaves at the end.
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
      const RX = OX + 0.03;
      const EY = TOP - (EAVE * RIDGE) / OZ;
      this.eaveLights = makeLightString({ x0: -RX, x1: RX, y: EY - 0.014, z: OZ + EAVE + 0.008, sag: 0.022, swags: 3, bulbs: 24 });
      this.eaveLights.visible = false;
      this.house.add(this.eaveLights);
    }
    // Winter: snow falls in the room and lands on the plot.
    if (WINTER) {
      this.snow = makeSnowfall({ density: 0.55 });
      this.group.add(this.snow.points);
    }
    this.snowBoost = 0;
  }

  // ---------- input ----------

  setupInput() {
    this.onKey = (e) => {
      if (this.mode !== 'play') return;
      if (this.card) {
        if (e.key === '1') this.choose(false);
        else if (e.key === '2') this.choose(true);
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        const ready = this.bricks.filter((b) => b.state === 'pallet' || b.state === 'selected');
        if (!ready.length) return;
        const i = ready.indexOf(this.selected);
        this.select(ready[(i + 1) % ready.length]);
      } else if (e.key === 'Escape') this.deselect();
    };
    window.addEventListener('keydown', this.onKey);
    this.onSceneDispose(() => window.removeEventListener('keydown', this.onKey));
    // Tap brick, then tap place (phones), or click, click: an empty press places the selected brick.
    const empty = (p) => this.emptyPress(p);
    this.engine.onEmptyPress = empty;
    this.onSceneDispose(() => { if (this.engine.onEmptyPress === empty) this.engine.onEmptyPress = null; });
    // Headset: grab with the grip (squeeze) or the trigger / a pinch (select), near or along the ray.
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

  grabbable(b) { return ['belt', 'hop', 'pallet', 'selected', 'return'].includes(b.state); }

  /** Headset button down: grab the brick next to the hand (or, with the grip, the one under the ray). */
  xrPress(p, button) {
    if (!this.engine.isXR || this.mode !== 'play' || this.grabs.has(p)) return;
    const a = this.anchor(p);
    if (!a) return;
    const R = num('xr-bricks-grab');
    let best = null;
    let bd = R;
    for (const b of this.bricks) {
      if (!this.grabbable(b)) continue;
      const d = b.mesh.getWorldPosition(new THREE.Vector3()).distanceTo(a.pos);
      if (d < bd) { bd = d; best = b; }
    }
    if (best) this.startGrab(p, best, button, 'near');
    else if (button === 'squeeze' && p.hovered === this.pad) {
      const b = this.pickBrick(p);
      if (b) this.startGrab(p, b, button, 'ray');
    }
  }

  xrRelease(p, button) {
    const g = this.grabs.get(p);
    if (g && g.button === button) this.endGrab(p);
  }

  /** A press on the belt and pallet area: the brick nearest to the pointer. */
  padGrab(p) {
    if (this.mode !== 'play' || this.grabs.has(p)) return;
    const b = this.pickBrick(p);
    if (!b) return;
    this.startGrab(p, b, p.kind === 'mouse' ? 'mouse' : 'select', p.kind === 'mouse' ? 'drag' : 'ray');
  }

  /** The grabbable brick nearest to the pointer (screen distance for the mouse, ray distance in XR). */
  pickBrick(p) {
    let best = null;
    let bd = Infinity;
    const v = new THREE.Vector3();
    for (const b of this.bricks) {
      if (!this.grabbable(b)) continue;
      b.mesh.getWorldPosition(v);
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
      b.mesh.updateMatrixWorld(true);
      if (how === 'near') g.offset = A.clone().invert().multiply(b.mesh.matrixWorld);
      else g.offset = new THREE.Matrix4().makeTranslation(0, a.hand ? 0 : -0.01, a.hand ? -0.012 : -0.05);
      if (p.line) p.line.visible = false;
    }
    this.grabs.set(p, g);
    sfx.grab();
    this.engine.haptic(p, 0.35, 25);
    this.hideHint();
  }

  /** Let go: onto the place it hovers over, or (gently) back to the pallet. */
  endGrab(p) {
    const g = this.grabs.get(p);
    if (!g) return;
    this.grabs.delete(p);
    if (p.line) p.line.visible = p.source?.targetRayMode !== 'screen';
    const b = g.b;
    if (b.state !== 'held') return;
    if (p.kind === 'mouse' && g.ndc0) {
      const W = window.innerWidth;
      const Hh = window.innerHeight;
      const moved = Math.hypot(((p.ndc.x - g.ndc0.x) * W) / 2, ((p.ndc.y - g.ndc0.y) * Hh) / 2);
      if (moved < 12 && this.time - g.t0 < 0.45) { this.select(b); return; }
    }
    if (g.hover && this.canPlace(g.hover)) this.placeBrick(b, g.hover);
    else this.refuse(b, g.hint);
  }

  canPlace(piece) {
    return this.mode === 'play' && !this.plan.isFilled(piece.id) && !this.reserved.has(piece.id) && this.plan.supported(piece);
  }

  select(b) {
    if (this.mode !== 'play') return;
    if (this.selected && this.selected !== b) this.deselect();
    if (b.state === 'held') return;
    this.selected = b;
    b.state = 'selected';
    b.mesh.position.copy(this.spotPos(b.spot));
    sfx.click();
    this.hideHint();
    this.toast(t('bricksSelected'), 'xr-bricks-ghost', 2.4);
  }

  deselect() {
    const b = this.selected;
    this.selected = null;
    if (b && b.state === 'selected') b.state = 'pallet';
  }

  /** An empty press (tap on the house) places the selected brick at the nearest free place. */
  emptyPress(p) {
    if (p.kind !== 'mouse' || this.mode !== 'play' || !this.selected || this.card) return;
    const m = this.pointerPx(p, false);
    const piece = this.nearestScreen(m.x, m.y, this.snapPx() * 1.4, this.available());
    const b = this.selected;
    this.selected = null;
    if (piece) {
      b.state = 'held';
      b.holder = p;
      this.placeBrick(b, piece);
    } else {
      b.state = 'pallet';
      const hint = this.refuseHintScreen(m.x, m.y);
      if (hint) this.refuse(b, hint);
    }
  }

  // ---------- coordinates ----------

  /** House piece -> plot-local position. */
  piecePos(piece, out = new THREE.Vector3()) {
    return out.set(piece.x, piece.y, piece.z).add(HOUSE);
  }

  pieceWorld(piece, out = new THREE.Vector3()) {
    return this.plotRoot.localToWorld(this.piecePos(piece, out));
  }

  spotPos(i, out = new THREE.Vector3()) {
    const [dx, dz] = SPOT_OFF[i];
    return out.set(PALLET.x + dx, PALLET_TOP + PALLET.y + BH / 2, PALLET.z + dz);
  }

  toScreen(world) {
    const v = world.clone().project(this.engine.camera);
    return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight, z: v.z };
  }

  /** The pointer in screen pixels (on phones the brick is held a little above the finger). */
  pointerPx(p, lift = true) {
    const x = ((p.ndc.x + 1) / 2) * window.innerWidth;
    const y = ((1 - p.ndc.y) / 2) * window.innerHeight - (lift && this.engine.touchUI ? 52 : 0);
    return { x, y };
  }

  snapPx() { return clamp(Math.min(window.innerWidth, window.innerHeight) * 0.075, 34, 70); }

  available() { return this.plan.available().filter((p) => !this.reserved.has(p.id)); }

  nearestScreen(x, y, R, pieces) {
    let best = null;
    let bd = R;
    const v = new THREE.Vector3();
    for (const p of pieces) {
      const s = this.toScreen(this.pieceWorld(p, v));
      const d = Math.hypot(s.x - x, s.y - y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  /** Why a place near the pointer does not work (for a friendly hint). */
  refuseHintScreen(x, y) {
    const R = this.snapPx();
    const open = this.plan.full.filter((p) => !this.plan.isFilled(p.id) && !this.plan.supported(p));
    const below = this.nearestScreen(x, y, R, open);
    if (below) return { piece: below, reason: 'bricksNeedBelow' };
    const taken = this.nearestScreen(x, y, R * 0.7, this.plan.full.filter((p) => this.plan.isFilled(p.id)));
    if (taken) return { piece: null, reason: 'bricksTaken' };
    return null;
  }

  refuseHintNear(local) {
    const v = new THREE.Vector3();
    let best = null;
    let bd = 0.05;
    for (const p of this.plan.full) {
      if (this.plan.isFilled(p.id) || this.plan.supported(p)) continue;
      const d = this.piecePos(p, v).distanceTo(local);
      if (d < bd) { bd = d; best = p; }
    }
    if (best) return { piece: best, reason: 'bricksNeedBelow' };
    for (const p of this.plan.full) {
      if (this.plan.isFilled(p.id) && this.piecePos(p, v).distanceTo(local) < 0.03) return { piece: null, reason: 'bricksTaken' };
    }
    return null;
  }

  // ---------- flow ----------

  start() {
    this.clearLayer();
    this.ready.then(() => { if (!this.disposed && this.mode === 'intro') this.begin(); });
  }

  begin() {
    this.mode = 'play';
    this.startMusic(0);
    music.intensity = 0;
    this.refreshHud ??= this.hud(() => this.hudText());
    this.hudObjs = this.group.children.filter((o) => o.userData.hud);
    this.hudHome = this.hudObjs.map((o) => ({ o, pos: o.position.clone() }));
    if (!this.engine.isXR) this.app.echo?.suppress(true);
    Object.assign(this, {
      month: 1, monthT: 0, score: 0, placed: 0, clean: 0, goldPlaced: 0, ever: 0, interestPaid: 0,
      missed: 0, resisted: 0, spent: 0, shown: 0, vacation: 0, raised: false, card: null, monthFlash: 0,
      nextQueue: 0, noteKey: 'bricksNote_prior', noteUntil: 0, early: null, firstWidth: null, lastWidth: null,
    });
    // Four temptations: always the getaway (months), three others (bricks).
    const others = TEMPTATIONS.filter((x) => x.key !== 'trip').sort(() => Math.random() - 0.5);
    this.tempts = [others[0], TEMPTATIONS.find((x) => x.key === 'trip'), others[1], others[2]];
    this.makeChart();
    this.deliver(false, 0.3);
    this.monthPanel?.redraw();
    this.refreshForecast('start');
    this.toast(t('bricksGo'), 'xr-bricks-ghost', 1.8);
    this.delay(1.9, () => this.showHint());
    this.refreshHud();
  }

  hudText() {
    return t('bricksHud', { month: this.month, saved: this.plan.saved, target: this.target, score: this.score });
  }

  /** Months since the start (fractional). */
  elapsed() { return this.month - 1 + this.monthT / MONTH; }

  endMonth() {
    const saved = this.plan.saved;
    this.ai.push(saved);
    this.history.push(saved);
    const done = this.ai.months;
    this.month += 1;
    if (this.month > MAX_MONTHS) { this.allot(true); return; }
    if (this.month === RAISE_MONTH) {
      this.raised = true;
      this.toast(t('bricksRaise'), 'xr-success', 3);
      sfx.powerup();
      this.setNote('raise');
    }
    // This month's deposit (none on holiday): one brick, two every second month after the raise.
    if (this.vacation > 0) {
      this.vacation -= 1;
    } else {
      const n = 1 + (this.raised && this.month % 2 === 0 ? 1 : 0);
      for (let k = 0; k < n; k++) {
        if (!this.deliver(false, 0.15 + k * 0.5)) this.missDeposit();
      }
    }
    if (TEMPT_MONTHS.includes(this.month) && this.shown < this.tempts.length) this.delay(0.9, () => this.openCard());
    this.monthPanel?.redraw();
    this.refreshForecast('month');
    // Remember the forecast after 4 months (for the results).
    if (done === 4 && this.pred) this.early = { lo: this.pred.lo, hi: this.pred.hi, median: this.pred.median, width: this.pred.hi - this.pred.lo };
  }

  /** Reserves a pallet place and sends a brick down the belt (false: the pallet is full). */
  deliver(gold, delay = 0) {
    const spot = this.spots.findIndex((s) => s === null);
    if (spot < 0) return false;
    this.spots[spot] = 'reserved';
    this.delay(delay, () => {
      if (this.mode !== 'play') { this.spots[spot] = null; return; }
      this.coinDrop(gold);
      this.delay(0.32, () => {
        if (this.mode !== 'play') { this.spots[spot] = null; return; }
        this.spawnBrick(gold, spot);
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

  /** A coin drops into the machine's slot; the machine hums and the light blinks. */
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

  spawnBrick(gold, spot) {
    const M = this.M;
    const mat = (gold ? M.mats.BrickGold : M.mats.BrickClay).clone();
    mat.emissive = new THREE.Color(hex(gold ? 'xr-bricks-gold' : 'xr-bricks-ghost-hot'));
    mat.emissiveIntensity = gold ? 0.22 : 0;
    const mesh = new THREE.Mesh(gold ? M.geo.gold : M.geo.brick, mat);
    mesh.castShadow = true;
    mesh.position.set(BELT_X, BELT_Y + BH / 2, BELT_Z0 + 0.01);
    mesh.userData.noFit = true;
    this.plotRoot.add(mesh);
    const b = { mesh, mat, gold, spot, state: 'belt', t: 0, rejected: false, hover: false, base: gold ? 0.22 : 0 };
    this.spots[spot] = b;
    this.bricks.push(b);
  }

  removeBrick(b) {
    const i = this.bricks.indexOf(b);
    if (i >= 0) this.bricks.splice(i, 1);
    if (this.spots[b.spot] === b) this.spots[b.spot] = null;
    b.mesh.removeFromParent();
    b.mat.dispose();
    if (this.selected === b) this.selected = null;
    b.state = 'gone';
  }

  /** The brick goes into its place: a short slide, then a click and a puff of mortar. */
  placeBrick(b, piece) {
    b.state = 'placing';
    this.reserved.add(piece.id);
    if (this.spots[b.spot] === b) this.spots[b.spot] = null;
    const p0 = b.mesh.position.clone();
    const q0 = b.mesh.quaternion.clone();
    const p1 = this.piecePos(piece);
    const q1 = new THREE.Quaternion().setFromAxisAngle(UP, piece.yaw);
    const far = p0.distanceTo(p1) > 0.12; // tap-tap: an arc from the pallet
    this.tween(far ? 0.38 : 0.12, (k) => {
      b.mesh.position.lerpVectors(p0, p1, k);
      if (far) b.mesh.position.y += Math.sin(k * Math.PI) * 0.08;
      b.mesh.quaternion.slerpQuaternions(q0, q1, Math.min(1, k * 1.4));
    }, { ease: far ? ease : (k) => 1 - (1 - k) ** 2, onDone: () => this.commitPlace(b, piece) });
  }

  commitPlace(b, piece) {
    this.reserved.delete(piece.id);
    if (this.mode !== 'play' || this.plan.isFilled(piece.id) || !this.plan.supported(piece)) {
      if (this.mode === 'play') { b.state = 'held'; this.refuse(b, null); } else this.removeBrick(b);
      return;
    }
    const autos = this.plan.place(piece.id, b.gold);
    this.field.set(piece, true, b.gold);
    autos.forEach((q, i) => this.field.set(q, true, false, 0.06 + i * 0.05));
    if (autos.length) this.delay(0.08, () => sfx.tick());
    this.ghost.refresh();
    const at = this.piecePos(piece);
    this.removeBrick(b);
    this.puffs.puff(at.clone().add(new THREE.Vector3(0, -BH / 2, 0)), { n: 10, spread: 0.045 });
    bsfx.place();
    if (b.holder) this.engine.haptic(b.holder, 0.7, 45);
    this.placed += 1;
    if (!b.rejected) this.clean += 1;
    this.score += PTS.place + (b.rejected ? 0 : PTS.clean) + (b.gold ? PTS.gold : 0);
    if (b.gold) {
      this.goldPlaced += 1;
      this.marks.push({ m: this.elapsed(), v: this.plan.saved, kind: 'gold' });
      this.burst(this.plotRoot.localToWorld(at.clone()), 'xr-bricks-gold-glow', 18);
    }
    // Interest: a golden brick for every INTEREST_EVERY bricks set.
    this.ever += 1;
    if (Math.floor(this.ever / INTEREST_EVERY) > this.interestPaid) {
      this.interestPaid += 1;
      this.queue.push({ gold: true });
      this.toast(t('bricksInterest'), 'xr-bricks-gold', 2.2);
      sfx.coin();
      this.setNote('bonus');
    }
    this.refreshForecast('place');
    this.refreshHud?.();
    if (this.plan.saved >= this.target) this.allot(false);
  }

  /** Not here: the brick floats back to its pallet place, with a hint why. */
  refuse(b, hint) {
    b.rejected = true;
    b.state = 'return';
    b.t = 0;
    b.from = b.mesh.position.clone();
    b.fromQ = b.mesh.quaternion.clone();
    if (hint) {
      this.toast(t(hint.reason), 'xr-danger', 2);
      if (hint.piece) this.ghost.reject(hint.piece);
      bsfx.refuse();
      if (b.holder) this.engine.haptic(b.holder, 0.45, 70);
    } else sfx.bounce();
  }

  // ---------- temptations ----------

  openCard() {
    if (this.mode !== 'play' || this.card) return;
    const tempt = this.tempts[this.shown];
    this.shown += 1;
    this.card = { tempt };
    sfx.appear();
    const g = new THREE.Group();
    const panel = temptPanel(tempt, 0.64);
    g.add(panel);
    let h = panel.h;
    if (!this.engine.touchUI) {
      const desk = !this.engine.isXR;
      const spend = new Button(0.3, 0.11, { label: t('bricksSpend'), body: desk ? t('bricksKey', { n: 1 }) : null, variant: 'danger', onClick: () => this.choose(false) });
      const save = new Button(0.3, 0.11, { label: t('bricksSave'), body: desk ? t('bricksKey', { n: 2 }) : null, variant: 'success', onClick: () => this.choose(true) });
      const by = -panel.h / 2 - 0.025 - Math.max(spend.h, save.h) / 2;
      spend.position.set(-0.16, by, 0);
      save.position.set(0.16, by, 0);
      g.add(spend, save);
      h += 0.025 + Math.max(spend.h, save.h);
      [spend, save].forEach((b, i) => this.popIn(b, 0.1 + i * 0.05));
    } else {
      this.cardPad = this.touchButtons([
        { icon: 'gift', label: t('bricksSpend'), onPress: () => this.choose(false) },
        { icon: 'bricks', label: t('bricksSave'), primary: true, onPress: () => this.choose(true) },
      ]);
      this.cardPad?.show(true);
    }
    // The group's origin sits in its middle (for the screen layout).
    g.children.forEach((o) => { o.position.y += h / 2 - panel.h / 2; });
    g.userData.h = h;
    g.userData.w = 0.64;
    this.cardHolder.add(g);
    this.popIn(panel);
    this.cardGroup = g;
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

  /** The player's answer: keep saving (an extra payment) or give in (bricks off the top or months off). */
  choose(save) {
    if (!this.card) return;
    const { tempt } = this.card;
    this.closeCard();
    if (save) {
      this.resisted += 1;
      this.score += PTS.resist;
      this.queue.push({ gold: false });
      this.toast(t('bricksResisted'), 'xr-success', 2.4);
      sfx.correct();
      this.app.echo?.celebrate();
      this.setNote('bonus');
    } else {
      this.spent += 1;
      bsfx.spend();
      if (tempt.bricks) {
        const n = this.spendBricks(tempt.bricks);
        this.toast(t('bricksSpent', { n }), 'xr-danger', 2.4);
        this.setNote('spend');
      } else {
        this.vacation += tempt.months;
        this.toast(t('bricksSpentMonths', { n: tempt.months }), 'xr-danger', 2.4);
        this.monthPanel?.redraw();
        this.setNote('vacation');
      }
      this.marks.push({ m: this.elapsed(), v: this.plan.saved, kind: 'spend' });
    }
    this.refreshForecast(save ? 'bonus' : 'spend');
    this.refreshHud?.();
  }

  /** Bricks come off the top and fly into a shopping bag. Returns how many full bricks went. */
  spendBricks(n) {
    const removed = this.plan.removeTop(n);
    this.ghost.refresh();
    const bag = this.bagTemplate?.clone() ?? new THREE.Group();
    bag.position.copy(BAG_AT);
    bag.scale.setScalar(0.001);
    this.plotRoot.add(bag);
    this.tween(0.3, (k) => bag.scale.setScalar(Math.max(0.001, k * 1.3)));
    const top = BAG_AT.clone().add(new THREE.Vector3(0, 0.08, 0));
    removed.forEach((p, i) => {
      const was = this.plan.pieces[p.id];
      this.field.set(was, false);
      const geo = p.kind === 'full' ? this.M.geo.brick : this.M.geo.half;
      const m = new THREE.Mesh(geo, this.M.mats.BrickClay);
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
    this.delay(1.5, () => {
      this.tween(0.35, (k) => bag.scale.setScalar(Math.max(0.001, 1.3 * (1 - k))), { onDone: () => { bag.removeFromParent(); } });
    });
    return removed.filter((p) => p.kind === 'full').length;
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
      if (this.firstWidth === null && this.ai.months >= 2) this.firstWidth = { n: this.ai.months, w: this.lastWidth };
    }
    this.chartDirty = true;
  }

  chartState() {
    const done = this.mode === 'finale' || this.mode === 'over';
    return {
      month: done ? this.doneMonth : this.month,
      frac: this.monthT / MONTH,
      saved: this.plan.saved,
      target: this.target,
      history: this.history,
      pred: this.pred,
      path: (h) => this.ai.path(h, this.plan.saved),
      marks: this.marks,
      note: t(this.noteKey ?? 'bricksNote_prior'),
      done,
      doneMonth: this.doneMonth,
      early: done && this.early ? { hit: this.doneMonth >= Math.ceil(this.early.lo) && this.doneMonth <= Math.ceil(this.early.hi) } : null,
    };
  }

  makeChart() {
    const narrow = !this.engine.isXR && window.innerWidth / window.innerHeight < 0.95;
    if (this.chart && this.chartNarrow === narrow) return;
    if (this.chart) { this.chart.removeFromParent(); this.chart.dispose(); }
    this.chartNarrow = narrow;
    this.chart = new Panel(num('xr-bricks-chart-w'), num(narrow ? 'xr-bricks-chart-h-narrow' : 'xr-bricks-chart-h'), (ctx, p) => drawChart(ctx, p, this.chartState()));
    this.chart.userData.noFit = true;
    this.chartHolder.add(this.chart);
    if (this.engine.isXR) placeOnArc(this.chartHolder, -0.72, this.eye - 0.12, 1.0);
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

  // ---------- the allotment and the loan phase ----------

  allot(late) {
    if (this.mode !== 'play') return;
    this.mode = 'finale';
    this.late = late;
    this.doneMonth = this.month;
    this.closeCard();
    for (const p of [...this.grabs.keys()]) { if (p.line) p.line.visible = true; }
    this.grabs.clear();
    this.selected = null;
    // Loose bricks fade away (the loan takes over).
    for (const b of [...this.bricks]) {
      const m = b.mesh;
      b.state = 'gone';
      this.tween(0.4, (k) => m.scale.setScalar(Math.max(0.001, 1 - k)), { onDone: () => this.removeBrick(b) });
    }
    this.queue = [];
    this.chartDirty = true;
    this.toast(t(late ? 'bricksTimeUp' : 'bricksAllot'), late ? 'xr-warning' : 'xr-success', 2.6);
    sfx.finish();
    music.intensity = 2;
    this.burst(this.plotRoot.localToWorld(HOUSE.clone().add(new THREE.Vector3(0, TOP, 0))), 'xr-bricks-gold-glow', 40);
    this.app.echo?.celebrate();
    this.finale();
  }

  wait(sec) { return new Promise((res) => this.delay(sec, res)); }

  async finale() {
    await this.wait(1.4);
    // Gaps below the highest course of each wall are closed at once.
    const gaps = this.plan.pieces.filter((p) => {
      if (this.plan.isFilled(p.id)) return false;
      const walls = p.wall >= 0 ? [p.wall] : p.ends.map(([w]) => w);
      return p.course <= Math.max(...walls.map((w) => this.plan.topCourse(w)));
    });
    gaps.sort((a, b) => a.course - b.course);
    gaps.forEach((p, i) => { this.plan.filled.set(p.id, { gold: false, order: 0 }); this.field.set(p, true, false, i * 0.03); });
    if (gaps.length) sfx.build();
    this.ghost.refresh();
    await this.wait(gaps.length ? 0.4 + gaps.length * 0.03 : 0.1);
    this.toast(t('bricksLoan'), 'xr-bricks-crane', 3);
    this.tween(0.6, (k) => { this.ghost.fade = 1 - 0.6 * k; });
    const rem = this.plan.remainingByWall();
    for (const wi of [2, 3, 1, 0]) {
      if (this.disposed) return;
      if (rem[wi].length) await this.liftSection(rem[wi], wi);
    }
    this.tween(0.5, (k) => { this.ghost.fade = 0.4 * (1 - k); });
    this.toast(t('bricksRoof'), 'xr-bricks-crane', 2.4);
    await this.liftRoof();
    // Crane back to rest, lights on, door open, fairy lights, smoke, snow, Echo comes over.
    this.parkCrane();
    await this.wait(0.3);
    bsfx.lights();
    this.tween(1.2, (k) => { this.glass.emissiveIntensity = 1.6 * k; });
    if (this.eaveLights) this.eaveLights.visible = true;
    await this.wait(0.7);
    bsfx.door();
    this.tween(1.1, (k) => { this.doorPivot.rotation.y = 1.15 * k; this.interior.material.opacity = 0.85 * k; }, { ease });
    this.smoking = true;
    this.tween(3, (k) => { this.snowBoost = 0.5 * k; });
    this.toast(t('bricksHome'), 'xr-success', 4);
    this.burst(this.plotRoot.localToWorld(HOUSE.clone().add(new THREE.Vector3(0, TOP + RIDGE, 0))), 'xr-warning', 36);
    sfx.finish();
    this.app.echo?.suppress(false);
    this.echoRelease = this.app.host?.hold(this.house, new THREE.Vector3(-0.08, TOP + RIDGE + 0.14, 0.03), { force: true }) ?? null;
    this.delay(2.4, () => { if (!this.disposed) this.app.echo?.celebrate(); });
    await this.wait(6);
    this.finish();
  }

  /** One wall section (the bricks still missing in a wall) comes down on the crane. */
  async liftSection(pieces, wi) {
    const load = new THREE.Group();
    let top = -Infinity;
    const box = new THREE.Box3();
    for (const p of pieces) {
      const geo = p.kind === 'full' ? this.M.geo.brick : this.M.geo.half;
      const m = new THREE.Mesh(geo, this.M.mats.BrickClay);
      m.position.set(p.x, p.y, p.z);
      m.rotation.y = p.kind === 'post' ? (p.course % 2 ? Math.PI / 2 : 0) : p.yaw;
      m.castShadow = true;
      load.add(m);
      top = Math.max(top, p.y + BH / 2);
      box.expandByPoint(new THREE.Vector3(p.x, p.y, p.z));
    }
    const c = box.getCenter(new THREE.Vector3());
    const attach = new THREE.Vector3(c.x, top + 0.002, c.z);
    const alongX = wi === 0 || wi === 2;
    const half = (alongX ? box.max.x - box.min.x : box.max.z - box.min.z) / 2;
    const ends = [new THREE.Vector3(alongX ? -half : 0, 0, alongX ? 0 : -half), new THREE.Vector3(alongX ? half : 0, 0, alongX ? 0 : half)];
    await this.craneCarry(load, attach, ends);
    pieces.forEach((p) => { this.plan.filled.set(p.id, { gold: false, order: 0 }); this.field.set(p, true); });
    this.ghost.refresh();
    load.removeFromParent();
  }

  async liftRoof() {
    const load = new THREE.Group();
    const roof = this.roofTemplate ?? new THREE.Group();
    roof.position.set(0, TOP, 0);
    load.add(roof);
    const attach = new THREE.Vector3(0, TOP + RIDGE + 0.02, 0);
    const ends = [new THREE.Vector3(-0.2, -0.01, 0), new THREE.Vector3(0.2, -0.01, 0)];
    await this.craneCarry(load, attach, ends);
    // The roof stays on the house (with the chimney smoking later).
    this.house.add(roof);
    load.removeFromParent();
  }

  /** The crane swings over, lowers the load onto its place (attach point, house space) and lets go. */
  async craneCarry(load, attach, ends) {
    const c = this.crane;
    this.house.add(load);
    this.carry = { load, attach, ends };
    this.updateCarry();
    const tgt = attach.clone().add(HOUSE);
    const aim = c.aimAt(tgt.x, tgt.z);
    const y0 = c.yaw;
    const r0 = c.reach;
    const d0 = c.drop;
    let dyaw = aim.yaw - y0;
    dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    bsfx.motor();
    load.scale.setScalar(0.001);
    this.tween(0.25, (k) => load.scale.setScalar(Math.max(0.001, k)));
    await new Promise((res) => this.tween(0.95, (k) => {
      c.yaw = y0 + dyaw * k;
      c.reach = r0 + (aim.reach - r0) * k;
      c.drop = d0 + (0.03 - d0) * k;
    }, { ease, onDone: res }));
    const dEnd = c.dropTo(tgt.y);
    bsfx.motor();
    await new Promise((res) => this.tween(0.8, (k) => { c.drop = 0.03 + (dEnd - 0.03) * k; }, { ease, onDone: res }));
    bsfx.land();
    const base = this.plotRoot.localToWorld(tgt.clone());
    this.burst(base, 'xr-bricks-puff', 14);
    const bottom = attach.clone().add(HOUSE);
    for (const e of ends) this.puffs.puff(bottom.clone().add(e).setY(HOUSE.y + 0.02), { n: 6, spread: 0.06 });
    this.carry = null;
    c.setSlings(null);
    await new Promise((res) => this.tween(0.35, (k) => { c.drop = dEnd + (0.05 - dEnd) * k; }, { ease, onDone: res }));
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

  parkCrane() {
    const c = this.crane;
    const y0 = c.yaw;
    const r0 = c.reach;
    const d0 = c.drop;
    let dy = 2.3 - y0;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    bsfx.motor();
    this.tween(1.4, (k) => { c.yaw = y0 + dy * k; c.reach = r0 + (0.16 - r0) * k; c.drop = d0 + (0.06 - d0) * k; }, { ease });
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
    if (this.engine.isXR) {
      // The finished house moves aside so the results can be read; it stays in view on the left.
      const p0 = this.plotRoot.position.clone();
      const p1 = new THREE.Vector3(-0.95, this.eye - 0.75, -0.95);
      this.tween(1.2, (k) => { this.plotRoot.position.lerpVectors(p0, p1, k); this.plotRoot.rotation.y = 0.75 * k; }, { ease });
    } else this.world.visible = false;
    const speed = Math.round(PTS.speed * clamp((SLOW - this.doneMonth) / (SLOW - FAST), 0, 1));
    const score = Math.min(5000, this.score + (this.late ? 0 : PTS.allot) + speed);
    const first = this.firstWidth;
    const fmt = (w) => (Number.isFinite(w) ? String(Math.max(1, Math.round(w))) : '30+');
    const learned = [
      { q: t('bricksLearn1Q'), a: t('bricksLearn1A') },
      { q: t('bricksLearn2Q'), a: t('bricksLearn2A', { n: first?.n ?? 2, a: fmt(first?.w ?? Infinity), b: fmt(this.lastWidth ?? 1) }) },
      { q: t('bricksLearn3Q'), a: t(this.spent ? 'bricksLearn3A_spend' : this.missed ? 'bricksLearn3A_missed' : 'bricksLearn3A_raise') },
    ];
    this.results({
      gameKey: 'bricks',
      score,
      correct: this.clean,
      total: Math.max(1, this.placed),
      line: t(this.late ? 'bricksLineLate' : 'bricksLine', { months: this.doneMonth, resisted: this.resisted, tempts: this.shown, gold: this.goldPlaced }),
      learned,
      onAgain: () => this.app.startGame('bricks'),
    });
  }

  // ---------- frame loop ----------

  update(dt) {
    this.time += dt;
    const playing = this.mode === 'play';
    if (playing) {
      if (!this.card) this.monthT += dt;
      if (this.monthT >= MONTH) { this.monthT -= MONTH; this.endMonth(); }
      if (this.queue.length && this.time >= this.nextQueue && this.mode === 'play' && this.spots.includes(null)) {
        const q = this.queue.shift();
        this.deliver(q.gold, 0);
        this.nextQueue = this.time + 0.55;
      }
      music.intensity = this.plan.saved > this.target * 0.75 ? 1 : 0;
    }
    if (this.monthFlash > 0) {
      this.monthFlash -= dt;
      if (this.monthFlash <= 0) this.monthPanel?.redraw();
    }
    if (this.M) {
      this.updateBricks(dt);
      this.updateGrabs(dt);
      this.updateHover();
      this.field.update(dt);
      const hover = [...this.grabs.values()].map((g) => g.hover).find(Boolean) ?? null;
      this.ghost.update(dt, this.time, { available: playing ? this.available() : [], hover, strong: !!this.selected || this.grabs.size > 0 });
      this.puffs.update(dt);
      this.firLights?.userData.tick(this.time);
      this.eaveLights?.userData.tick(this.time);
      this.crane.sway = this.mode === 'finale' ? 1 : 0.3;
      this.crane.apply(this.time);
      this.updateCarry();
      if (this.smoking && (this.smokeT = (this.smokeT ?? 0) - dt) <= 0) {
        this.smokeT = 0.45;
        this.puffs.smoke(CHIMNEY.clone().add(HOUSE));
      }
    }
    if (this.snow) {
      const floor = this.engine.floorY - this.engine.root.position.y;
      const p = this.plotRoot.position;
      this.snow.setGround(floor);
      this.snow.setDisc(p.x + 0.06, p.z, 0.55, p.y + 0.002);
      this.snow.update(dt);
      setSnowAmount(0.3 + 0.45 * snowSettled() + (this.snowBoost ?? 0));
    }
    // XR: keep a press that started a grab from clicking a button on release.
    for (const p of this.grabs.keys()) p.pressed = null;
    if (this.chart && (playing || this.mode === 'finale')) {
      this.chartT = (this.chartT ?? 0) - dt;
      if (this.chartDirty || this.chartT <= 0) {
        this.chart.redraw();
        this.chartDirty = false;
        this.chartT = 0.5;
      }
    }
    if (Math.floor(this.time * 4) !== this.hudTick) {
      this.hudTick = Math.floor(this.time * 4);
      if (playing) this.refreshHud?.();
    }
    if (!this.engine.isXR) this.previewCamera(dt);
  }

  /** Bricks riding the belt, hopping onto the pallet, waiting, floating back. */
  updateBricks(dt) {
    for (const b of this.bricks) {
      const m = b.mesh;
      if (b.state === 'belt') {
        b.t += dt / BELT_TIME;
        const k = Math.min(1, b.t);
        m.position.set(BELT_X, BELT_Y + BH / 2, BELT_Z0 + 0.01 + k * (BELT_LEN - 0.02));
        if (b.t >= 1) { b.state = 'hop'; b.t = 0; b.from = m.position.clone(); }
      } else if (b.state === 'hop') {
        b.t += dt / 0.3;
        const k = Math.min(1, b.t);
        m.position.lerpVectors(b.from, this.spotPos(b.spot), ease(k));
        m.position.y += Math.sin(k * Math.PI) * 0.03;
        if (k >= 1) { b.state = 'pallet'; sfx.thud(); }
      } else if (b.state === 'return') {
        b.t += dt / 0.4;
        const k = Math.min(1, b.t);
        m.position.lerpVectors(b.from, this.spotPos(b.spot), ease(k));
        m.position.y += Math.sin(k * Math.PI) * 0.05;
        m.quaternion.slerpQuaternions(b.fromQ, new THREE.Quaternion(), ease(k));
        if (k >= 1) b.state = 'pallet';
      } else if (b.state === 'selected') {
        const sp = this.spotPos(b.spot);
        m.position.set(sp.x, sp.y + 0.02 + Math.sin(this.time * 5) * 0.004, sp.z);
      }
      // Glow: hovered, selected or held bricks light up a little.
      const glow = b.state === 'selected' ? 0.35 + 0.2 * Math.sin(this.time * 6) : b.state === 'held' ? 0.18 : b.hover ? 0.3 : 0;
      b.mat.emissiveIntensity = b.base + glow;
    }
  }

  /** Held bricks follow the hand (headset) or the pointer (browser), with the place they would go. */
  updateGrabs(dt) {
    for (const g of this.grabs.values()) {
      const b = g.b;
      if (b.state !== 'held') continue;
      const prev = g.hover;
      if (g.p.kind === 'xr') this.followHand(g, dt);
      else this.followPointer(g, dt);
      if (g.hover && g.hover !== prev) {
        bsfx.snap();
        this.engine.haptic(g.p, 0.15, 12);
      }
    }
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
    // The nearest free place within reach; close to it, the brick is drawn towards it a little.
    const R = num('xr-bricks-snap');
    let best = null;
    let bd = R;
    const v = new THREE.Vector3();
    for (const p of this.available()) {
      const d = this.piecePos(p, v).distanceTo(lp);
      if (d < bd) { bd = d; best = p; }
    }
    g.hover = best;
    g.hint = best ? null : this.refuseHintNear(lp);
    if (best) {
      const k = clamp(1 - bd / R, 0, 1) * 0.45;
      lp.lerp(this.piecePos(best, v), k);
      lq.slerp(new THREE.Quaternion().setFromAxisAngle(UP, best.yaw), k);
    }
    const s = 1 - Math.exp(-dt * (this.time - g.t0 < 0.2 ? 14 : 30));
    b.mesh.position.lerp(lp, s);
    b.mesh.quaternion.slerp(lq, s);
  }

  followPointer(g, dt) {
    const b = g.b;
    const m = this.pointerPx(g.p, true);
    const piece = this.nearestScreen(m.x, m.y, this.snapPx(), this.available());
    g.hover = piece;
    g.hint = piece ? null : this.refuseHintScreen(m.x, m.y);
    const lp = new THREE.Vector3();
    const lq = new THREE.Quaternion();
    if (piece) {
      this.piecePos(piece, lp).y += 0.03;
      lq.setFromAxisAngle(UP, piece.yaw);
    } else {
      // Along the pointer ray onto a plane above the walls.
      const cam = this.engine.camera;
      const ndc = new THREE.Vector2((m.x / window.innerWidth) * 2 - 1, -(m.y / window.innerHeight) * 2 + 1);
      const rc = new THREE.Raycaster();
      rc.setFromCamera(ndc, cam);
      this.plotRoot.updateMatrixWorld(true);
      const inv = this.plotRoot.matrixWorld.clone().invert();
      const ray = rc.ray.clone().applyMatrix4(inv);
      const k = Math.abs(ray.direction.y) > 1e-4 ? (DRAG_Y - ray.origin.y) / ray.direction.y : -1;
      if (k > 0) lp.copy(ray.origin).addScaledVector(ray.direction, k);
      else lp.copy(b.mesh.position);
      lp.x = clamp(lp.x, -0.6, 0.7);
      lp.z = clamp(lp.z, -0.5, 0.5);
    }
    const s = 1 - Math.exp(-dt * 26);
    b.mesh.position.lerp(lp, s);
    b.mesh.quaternion.slerp(lq, s);
  }

  /** Which brick the pointers are over: the one under the mouse or the ray, or next to a hand. */
  updateHover() {
    for (const b of this.bricks) b.hover = false;
    if (this.mode !== 'play') return;
    for (const p of this.engine.pointers) {
      if (!p.active || this.grabs.has(p)) continue;
      if (p.kind === 'mouse' && !this.engine.isXR) {
        if (p.hovered === this.pad) { const b = this.pickBrick(p); if (b) b.hover = true; }
      } else if (p.kind === 'xr' && this.engine.isXR) {
        const a = this.anchor(p);
        let near = null;
        let bd = num('xr-bricks-grab');
        for (const b of this.bricks) {
          if (!this.grabbable(b)) continue;
          const d = b.mesh.getWorldPosition(new THREE.Vector3()).distanceTo(a.pos);
          if (d < bd) { bd = d; near = b; }
        }
        if (!near && p.hovered === this.pad) near = this.pickBrick(p);
        if (near) near.hover = true;
      }
    }
  }

  // ---------- browser view ----------

  /** Screen layout (CSS px) for the chart, the HUD row and the plot area. */
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
      const rowW = Math.min(W - 2 * m, 820);
      const ppm = rowW / 1.27;
      hud = { ppm, x0: (W - rowW) / 2, y: m };
      top = m + 0.15 * ppm + 6;
    }
    const cw = num('xr-bricks-chart-w');
    const ch = this.chart?.h ?? num('xr-bricks-chart-h');
    let chart;
    let plot;
    if (portrait) {
      const w = W - 2 * m;
      const h = (w * ch) / cw;
      chart = { x: m, y: top + m * 0.5, w, h };
      plot = { x: 0, y: chart.y + h + m * 0.5, w: W, h: Hh - (chart.y + h + m * 0.5) - m };
    } else {
      let w = clamp(W * 0.34, 220, 480);
      let h = (w * ch) / cw;
      const avail = Hh - top - 2 * m;
      if (h > avail) { h = avail; w = (h * cw) / ch; }
      chart = { x: m, y: top + (avail - h) / 2 + m, w, h };
      plot = { x: chart.x + w + m * 0.5, y: top, w: W - (chart.x + w + m * 0.5), h: Hh - top - m };
    }
    return { W, Hh, chart, plot, hud, portrait, touch };
  }

  /** Puts an object at a screen spot (px), facing the camera, scaled to ppm pixels per meter. */
  pin(obj, x, y, ppm, dist = 0.5) {
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
    obj.scale.setScalar(ppm / native);
  }

  /**
   * Browser preview while building: the camera looks down on the plot at an angle (a slow
   * turn during the finale), framed into the free part of the screen; the chart, the status
   * row, messages and the temptation card are pinned to the screen.
   */
  previewCamera(dt) {
    const e = this.engine;
    const cam = e.camera;
    const active = this.mode === 'play' || this.mode === 'finale';
    if (!active || !this.M) return;
    e.fitEnabled = false;
    this.viewOn = true;
    this.makeChart();
    const lay = this.layout();
    const finale = this.mode === 'finale';
    const yaw = finale ? 0.12 + Math.sin(this.time * 0.32) * 0.4 : 0.12;
    const pitch = finale ? -0.5 : -0.64;
    const R = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
    const Ri = R.clone().invert();
    // Content box (plot space): the plot with the house; with the crane in the finale.
    const box = [[-0.5, 0.62], [-0.06, finale ? 0.72 : 0.3], [-0.4, 0.4]];
    const C = new THREE.Vector3((box[0][0] + box[0][1]) / 2, 0.06, 0);
    this.plotRoot.updateMatrixWorld(true);
    const Cw = this.plotRoot.localToWorld(C.clone());
    const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const tx = (tan * lay.plot.w) / lay.Hh / 1.04;
    const ty = (tan * lay.plot.h) / lay.Hh / 1.04;
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
    // Screen elements.
    const cw = num('xr-bricks-chart-w');
    this.pin(this.chartHolder, lay.chart.x + lay.chart.w / 2, lay.chart.y + lay.chart.h / 2, lay.chart.w / cw);
    if (lay.hud) {
      for (const o of this.hudObjs ?? []) {
        const left = o.w > 0.5;
        const x = left ? lay.hud.x0 + (0.98 / 2) * lay.hud.ppm : lay.hud.x0 + (1.27 - 0.13) * lay.hud.ppm;
        this.pin(o, x, lay.hud.y + 0.075 * lay.hud.ppm, lay.hud.ppm, 0.45);
      }
    }
    const ppm = Math.min(lay.plot.w / 0.8, lay.Hh / 1.0, 900);
    this.pin(this.toastHolder, lay.plot.x + lay.plot.w / 2, lay.plot.y + 0.07 * ppm + 6, ppm, 0.42);
    if (this.cardGroup) {
      const ins = this.engine.insets();
      const bottom = lay.touch ? ins.bottom : 0;
      const cppm = Math.min(ppm * 1.05, (lay.plot.w - 20) / 0.66, (lay.Hh - lay.plot.y - bottom - 20) / (this.cardGroup.userData.h + 0.02));
      const cyc = lay.touch ? Math.min(lay.plot.y + lay.plot.h / 2, lay.Hh - bottom - 10 - (this.cardGroup.userData.h * cppm) / 2) : lay.plot.y + lay.plot.h / 2;
      this.pin(this.cardHolder, cx, cyc, cppm, 0.4);
    }
  }

  /** Back to the app's own camera fit (intro, results). */
  exitPlayView() {
    if (this.engine.isXR || !this.viewOn) return;
    this.viewOn = false;
    const cam = this.engine.camera;
    cam.clearViewOffset();
    cam.rotation.set(0, 0, 0);
    this.engine.fitEnabled = true;
    for (const { o, pos } of this.hudHome ?? []) { o.position.copy(pos); o.quaternion.identity(); o.scale.setScalar(1); }
  }

  /** Headset placement of the screen elements (the chart is placed when it is made). */
  placeXR() {
    // Messages just above the house (above the card while one is open); the card above the plot.
    this.toastHolder.position.set(0, this.eye + (this.cardGroup ? 0.24 : -0.2), -0.8);
    this.cardHolder.position.set(0, this.eye - 0.03, -0.85);
  }

  dispose() {
    this.mode = 'over';
    this.echoRelease?.();
    this.app.echo?.suppress(false);
    for (const p of this.engine.pointers) if (p.line && p.kind === 'xr') p.line.visible = p.source?.targetRayMode !== 'screen';
    this.exitPlayView();
    this.engine.renderer.shadowMap.enabled = false;
    this.engine.scene.environment = this.prevEnvironment ?? null;
    this.envTarget?.dispose();
    this.chart?.dispose();
    super.dispose();
  }
}
