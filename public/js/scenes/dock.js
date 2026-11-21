// "Andock-Labor" (Docking Lab): molecular docking at a lab bench. A protein floats above the
// bench with a pocket whose colored contact spots want the right atoms (opposites attract). An AI
// has screened a library of thousands of molecules and ranks its top four candidates with a
// predicted fit. You pick a candidate and dock it. A live fit meter and glowing atoms guide you.
// Then off to the lab: an animated assay measures the real binding. Usually the AI's top pick
// holds, but in one pocket per round it fails in the lab for a reason the AI could not see,
// so you learn: predictions are probabilities, the lab confirms.
//
// Two ways to dock, one per kind of device:
//   Headset: grab the molecule and set it into the pocket with your hand (6DoF); close to the
//     right pose the pocket pulls it in.
//   Browser (desktop and phones): the picked molecule hovers above the pocket. Drag, swipe or
//     use the arrow keys to turn it; thin guide lines run from its atoms to the contact spots
//     they belong to (plus to minus). Turned close enough, it slides in by itself. The protein
//     fills the screen, the candidates wait in a row below it, the panels stand beside it.
// Nothing is coded by color alone (signs on the spots, letters on the atoms, checks and crosses).
// Relaxed mode (assist.js): more time, a wider catch angle, the target pose is shown at once.
// Assets: the bench, tray, reader and props from Blender (blender/build_dock.py, dock.glb); the
// protein surface and the molecules are procedural (dock-chem.js, dock-visuals.js).
import * as THREE from 'three';
import { BaseScene } from '../scene.js';
import { Button, Panel, textPanel, placeOnArc } from '../ui3d.js';
import { color, hex, font } from '../tokens.js';
import { t, getLang } from '../i18n.js';
import { sfx } from '../sfx.js';
import { music } from '../music.js';
import { quality } from '../quality.js';
import { EVENT } from '../event.js';
import { CHRISTMAS, makeBulbs } from '../christmas.js';
import { sceneLook, softSun, gfxTier, polish } from '../gfx.js';
import { assist } from '../assist.js';
import { num } from '../tokens.js';
import '../dock-text.js';
import { makeRound, Protein, evaluateFit, PASS, designTruth } from '../dock-chem.js';
import { Workshop } from '../dock-workshop.js';
import { phoneStrip, enlargePad } from '../dock-phone.js';
import {
  makeKit, MoleculeView, proteinMaterial, makeSpotMarkers, makeGuides, makeScreening, makeWells, loadBench, fallbackDeck,
  mergeStatic, contactShadows, skyDome, check, cross,
  drawAIPanel, drawFitPanel, drawLabPanel, drawLegend, aiPanelSize, fitPanelSize, labPanelSize, legendSize, AI_ROWS,
} from '../dock-visuals.js';

const LEVELS = EVENT ? 3 : 4;
const ROUND_TIME = EVENT ? 190 : 280; // seconds of play for all pockets
const BENCH_DROP = 0.56; // bench top below eye height
const BENCH_Z = -0.72;
const PROT = { y: -0.17, z: -0.8 }; // protein center (y relative to eye height)
// Must match blender/build_dock.py (bench-local, y = 0 is the bench top).
const TRAY = { x: 0.35, z: -0.55, gap: 0.115, lift: 0.07, size: 0.05 };
const PLATE = new THREE.Vector3(0.45, 0.114, -0.885);
const INLET = new THREE.Vector3(0.37, 0.116, -0.81);
const FLASK = { x: -0.5, z: -0.58, r0: 0.056, r1: 0.016, h: 0.14 };
const CAPTURE = 0.06; // headset: the pocket pulls a molecule in within this distance ...
const TOL_XR = 42; // ... and this angle (degrees) of the right pose
// Browser: the molecule slides in when it is turned this close (degrees, per pocket: the later
// pockets want a closer turn). Phones get a little more, the relaxed mode a lot more.
const TOL_FLAT = [50, 44, 38, 34];
const TOL_TOUCH = 8;
const TOL_EASY = 22;
const HOVER = { out: 0.09, up: 0.15 };
const VIEW_TILT = { desk: 0.26, touch: 0.22 }; // browser: how far the camera looks down into the pocket (rise per meter) // browser: where the picked molecule hovers (out of the pocket, above it)
const IN_POCKET = 0.035;
const FIT_MIN = 0.5; // fit needed to send a molecule to the lab
const HINT_T = [12, 24, 55, 55]; // seconds until the AI's pose (pockets 3, 4: the finished design) is shown
const PTS = { fit: 400, speed: 450, fast: 12, slow: 72, tests: [250, 120, 40, 0] }; // per pocket (max 1100)
// Pockets 3 and 4 (your own design): more time for building, plus points for the design (max 1300).
// A perfect round: 2 x 1100 + 2 x 1300 = 4800.
const PTS_DESIGN = { fit: 400, speed: 450, fast: 25, slow: 120, tests: [250, 120, 40, 0], design: 200 };
const LAB_TIME = 2.9;
const RANKS = [0, 1800, 3400]; // points for the three ranks of the result
// What a new player is told once per visit, at the moment it matters (later rounds stay quiet).
const coached = new Set();
let quickStart = false; // "Again" starts the next round at once, without the intro
const clamp = THREE.MathUtils.clamp;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
const _m3 = new THREE.Matrix4();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _v = V();
const ONE = V(1, 1, 1);

/** Disposes what an object owns (its geometries, materials and panel textures; shared kit parts stay). */
function disposeOwn(root) {
  root.traverse((o) => {
    if (o.dispose && o.canvas) { o.dispose(); return; }
    if (o.isSprite || o.isPoints || (o.isMesh && !o.isInstancedMesh && o.material?.visible !== false)) {
      o.geometry?.dispose?.();
      [].concat(o.material ?? []).forEach((m) => m.dispose());
    }
  });
}

export class DockScene extends BaseScene {
  constructor(app) {
    super(app);
    this.gameKey = 'dock';
    this.mode = 'intro';
    this.time = 0;
    this.kit = makeKit();
    this.fitOut = {};
    this.fitShown = 0;
    this.world = new THREE.Group();
    this.group.add(this.world);
    this.ui = new THREE.Group();
    this.group.add(this.ui);
    this.isXR = this.engine.isXR;
    this.touch = this.engine.touchUI;
    this.flat = !this.isXR; // the browser view: desktop or phone
    this.desk = this.flat && !this.touch;
    this.easy = assist.easy; // relaxed mode
    this.calm = assist.reducedMotion; // calm motion
    this.roundTime = Math.round(ROUND_TIME * assist.pick(1, 1.5));
    this.tol = this.tolFor(0);
    this.onSceneDispose(() => this.kit.dispose());
    this.buildLab();
    this.setupInput();
    this.shop = new Workshop(this);
    if (this.touch) {
      this.strip = phoneStrip({ onPick: (c) => { if (c?.s === 'tray') { sfx.click(); this.pick(c); } } });
      this.onSceneDispose(() => this.strip.remove());
      // Phones: the scene frames the protein, the hovering molecule and the candidates itself,
      // clear of the status strip and the thumb buttons (upright and in landscape).
      this.mobileView((cam, dt) => this.frameView(dt));
    }
    // The round is drawn now, so the first protein can be built in the background during the intro.
    this.round = makeRound(LEVELS);
    this.builds = [];
    this.onUpdate((dt) => this.update(dt));
    this.setControls({
      desktop: [
        [t('dockCtlPickKey'), t('dockCtlPick')],
        [t('dockCtlTurnKey'), t('dockCtlTurn')],
        [t('dockCtlLabKey'), t('dockCtlLab')],
        [t('dockCtlBuildKey'), t('dockCtlBuild')],
      ],
      touch: [
        [t('dockCtlPickTouch'), t('dockCtlPick')],
        [t('dockCtlTurnTouch'), t('dockCtlTurnTouchDo')],
        [t('dockCtlTiltTouch'), t('dockCtlTiltTouchDo')],
        [t('dockCtlLabTouch'), t('dockCtlLab')],
        [t('dockCtlBuildTouch'), t('dockCtlBuildTouchDo')],
      ],
      xr: [
        [t('dockCtlGrabXR'), t('dockCtlGrabXRDo')],
        [t('dockCtlTurnXR'), t('dockCtlTurnXRDo')],
        [t('dockCtlLabXR'), t('dockCtlLab')],
        [t('dockCtlBuildXR'), t('dockCtlBuildXRDo')],
      ],
    });
    if (quickStart) {
      // "Again": straight into the next round.
      quickStart = false;
      this.prepareMusic();
      this.delay(0.05, () => { if (!this.disposed) this.start(); });
    } else this.intro(t('dockName'), t('dockIntro'), () => this.start());
  }

  /** The catch angle (radians) of pocket i for this device and mode. */
  tolFor(i) {
    const deg = this.isXR
      ? TOL_XR + (this.easy ? 14 : 0)
      : TOL_FLAT[Math.min(i, TOL_FLAT.length - 1)] + (this.touch ? TOL_TOUCH : 0) + (this.easy ? TOL_EASY : 0);
    return THREE.MathUtils.degToRad(deg);
  }

  /** A hint for new players: once per visit, and only the first time it matters. */
  coach(key, token = 'xr-dock-ai') {
    const id = key.replace(/(Desk|Touch|XR)$/, '');
    if (coached.has(id)) return;
    coached.add(id);
    this.toast(t(key), token, null, 5);
  }

  /** The text key for the device in use: ...Desk, ...Touch or ...XR. */
  dev(key) {
    return `${key}${this.isXR ? 'XR' : this.touch ? 'Touch' : 'Desk'}`;
  }

  // ---------- the lab ----------

  buildLab() {
    const { eye } = this;
    // The look (gfx.js): neutral tone mapping, soft studio reflections; the high tier (Quest 3
    // with full effects, desktop) adds one soft shadow from the key light. No bloom: the white
    // bench and the panels would glow.
    this.tier = gfxTier();
    this.shadows = this.tier === 'high' && !this.touch;
    this.onSceneDispose(sceneLook(this.engine, { tone: 'neutral', exposure: 0.95, env: 'studio', envIntensity: 0.55, shadows: this.shadows ? 'soft' : false }));
    // The engine's flat ambient and sun step back while the lab is open: a warm key (with the
    // shadow), a violet rim and the studio reflections shape the protein instead.
    const engineLights = this.engine.scene.children.filter((o) => o.isHemisphereLight || o.isDirectionalLight);
    const before = engineLights.map((l) => l.intensity);
    engineLights.forEach((l) => { l.intensity *= l.isHemisphereLight ? 0.45 : 0.35; });
    this.onSceneDispose(() => engineLights.forEach((l, i) => { l.intensity = before[i]; }));
    // Warm key light from the upper left (it casts the shadow), a violet rim from behind.
    const key = new THREE.DirectionalLight(hex('xr-dock-key-light'), 1.9);
    key.position.set(-1.25, eye + 1.15, -0.35);
    key.target.position.set(0, eye - 0.45, -0.74);
    if (this.shadows) softSun(key, { size: 1.5, far: 4, normalBias: 0.012, radius: 4 });
    const rim = new THREE.DirectionalLight(hex('xr-dock-rim-light'), 1.3);
    rim.position.set(0.6, eye + 0.6, -2.2);
    rim.target = key.target;
    this.world.add(key, key.target, rim);
    // A backdrop gradient for the browser and VR (in AR the real room stays visible).
    this.sky = skyDome();
    this.world.add(this.sky);

    // The bench: the Blender model (bench-local: y = 0 is its top).
    const drop = BENCH_DROP;
    const bench = (this.bench = new THREE.Group());
    bench.position.set(0, eye - drop, 0);
    bench.userData.noFit = this.touch; // phones frame the panels and the protein, the bench is backdrop
    this.world.add(bench);
    this.deck = fallbackDeck(1.28, 0.54);
    this.deck.position.z = BENCH_Z;
    bench.add(this.deck);
    loadBench().then((parts) => this.placeBench(parts)).catch((e) => console.warn('dock bench', e));

    // Holo emitter light cone under the protein, soft shadows on the bench.
    const coneH = drop + PROT.y - 0.2;
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.085, coneH, 40, 1, true), new THREE.MeshBasicMaterial({
      color: hex('xr-dock-glow'), transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }));
    cone.position.set(0, coneH / 2 + 0.02, PROT.z);
    cone.userData.noFit = true;
    bench.add(cone);
    this.cone = cone;
    // Soft contact shadows under the protein, the tray and the devices (one draw call).
    bench.add(contactShadows([
      [0, PROT.z, 0.52, 0.38, 0.55], [TRAY.x, TRAY.z, 0.6, 0.22, 0.45], [PLATE.x, -0.87, 0.3, 0.26, 0.6],
      [-0.28, -0.9, 0.3, 0.1, 0.5], [-0.5, -0.88, 0.13, 0.13, 0.55], [FLASK.x, FLASK.z, 0.17, 0.17, 0.55],
    ]));
    // An invisible stand-in for the bench top (the desktop camera frames it).
    this.deckProxy = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.04, 0.54), this.kit.hidden);
    this.deckProxy.position.set(0, -0.02, BENCH_Z);
    bench.add(this.deckProxy);

    // The protein's holder (the protein itself is built per pocket).
    this.prot = new THREE.Group();
    this.prot.position.set(0, eye + PROT.y, PROT.z);
    this.world.add(this.prot);
    this.protMat = proteinMaterial();
    // A soft light at the pocket that warms to green as the fit grows (not in Lite effects).
    this.pocketLight = new THREE.PointLight(hex('xr-dock-ai'), 0, 0.6, 2);
    if (!quality.lite) this.prot.add(this.pocketLight);

    // The tray's slots (where candidates wait), the screening stream, the microplate wells.
    this.screening = makeScreening(quality.lite ? 500 : 900);
    this.world.add(this.screening);
    this.wells = makeWells();
    this.wells.position.copy(PLATE);
    bench.add(this.wells);
    // Browser: guide rods from the hovering molecule's atoms to the contact spots they belong to.
    if (this.flat) {
      this.guides = makeGuides(this.kit, 4);
      this.world.add(this.guides);
    }
  }

  /** Puts the Blender parts in place (bench, column, tray, reader, props, Christmas flask). */
  placeBench(parts) {
    if (this.disposed) return;
    const root = parts.DockBenchSet;
    if (!root) return;
    this.deck.removeFromParent();
    // Static parts merged by material: far fewer draw calls (the headset renders twice).
    mergeStatic(root, ['DockColumn', 'DockFlaskStar', 'DockFlaskLiquid', 'DockTray']);
    if (this.shadows) polish(root, this.engine.renderer);
    this.bench.add(root);
    this.parts = parts;
    this.column = parts.DockColumn;
    if (this.column) this.column.userData.noFit = true;
    // Christmas: the Erlenmeyer flask becomes a little fir with a star and fairy lights.
    const star = parts.DockFlaskStar;
    if (star) star.visible = CHRISTMAS;
    if (!CHRISTMAS && parts.DockFlaskLiquid) {
      parts.DockFlaskLiquid.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.setHex(hex('xr-dock-liquid-1')); o.material.emissive?.setHex(hex('xr-dock-liquid-1')); } });
    }
    if (CHRISTMAS) {
      const pts = [];
      const N = 22;
      for (let i = 0; i < N; i++) {
        const u = (i + 0.5) / N;
        const y = 0.012 + u * (FLASK.h - 0.02);
        const r = FLASK.r0 + (FLASK.r1 - FLASK.r0) * (y / FLASK.h) + 0.004;
        const a = u * Math.PI * 2 * 2.6;
        pts.push(V(FLASK.x + Math.cos(a) * r, y, FLASK.z + Math.sin(a) * r));
      }
      this.bulbs = makeBulbs(pts, { size: 0.0042, halo: 0.03 });
      this.bench.add(this.bulbs);
    }
    // In AR the bench floats over the real room: no column down to a floor that is not there.
    this.layoutKey = null;
  }

  // ---------- input ----------

  setupInput() {
    const e = this.engine;
    const canvas = e.canvas;
    // Browser: dragging (mouse or one finger) anywhere turns the molecule like a trackball; a
    // plain click or tap does not. Tilting about the view axis: the mouse wheel, or two fingers
    // turned against each other.
    if (this.flat) {
      const pts = new Map(); // the pointers that are down on the 3D view
      const ready = () => !e.paused && this.mode === 'play' && !!this.active && this.active.s === 'active';
      const begin = () => { if (!this.drag.on) { this.drag.on = true; this.unsnap(); } };
      const down = (ev) => {
        if (ev.pointerType === 'mouse' && ev.button !== 0) return;
        if (!ready()) return;
        if (ev.pointerType === 'mouse') {
          const hov = e.mouse.hovered;
          if (hov && hov.userData.interactive && hov !== this.active.view.proxy) return;
        }
        pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
        if (pts.size === 1 || !this.drag) this.drag = { x: ev.clientX, y: ev.clientY, id: ev.pointerId, on: false, twist: 0 };
        else if (pts.size === 2) {
          const [a, b] = [...pts.values()];
          this.drag.twist = Math.atan2(b.y - a.y, b.x - a.x);
          begin();
        }
      };
      const move = (ev) => {
        const d = this.drag;
        const q = pts.get(ev.pointerId);
        if (!d || !q) return;
        if (!ready()) { pts.clear(); this.drag = null; return; }
        q.x = ev.clientX;
        q.y = ev.clientY;
        if (pts.size >= 2) {
          // Two fingers: the angle of the line between them tilts the molecule.
          const [a, b] = [...pts.values()];
          const ang = Math.atan2(b.y - a.y, b.x - a.x);
          let da = ang - d.twist;
          if (da > Math.PI) da -= Math.PI * 2;
          if (da < -Math.PI) da += Math.PI * 2;
          d.twist = ang;
          this.turn(V(0, 0, 1), -da);
          return;
        }
        if (ev.pointerId !== d.id) return;
        const dx = ev.clientX - d.x;
        const dy = d.y - ev.clientY;
        if (!d.on) {
          if (Math.hypot(dx, dy) < 5) return;
          begin();
        }
        d.x = ev.clientX;
        d.y = ev.clientY;
        this.rotateBy(dx, dy);
      };
      const up = (ev) => {
        pts.delete(ev.pointerId);
        if (!this.drag) return;
        if (!pts.size) { this.drag = null; return; }
        // One finger stays down: it goes on turning from where it is.
        const [id, q] = [...pts.entries()][0];
        Object.assign(this.drag, { id, x: q.x, y: q.y });
      };
      const wheel = (ev) => {
        if (!ready()) return;
        ev.preventDefault();
        this.unsnap();
        this.turn(V(0, 0, 1), (ev.deltaY > 0 ? 1 : -1) * THREE.MathUtils.degToRad(15));
      };
      canvas.addEventListener('pointerdown', down);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
      canvas.addEventListener('wheel', wheel, { passive: false });
      this.onSceneDispose(() => {
        canvas.removeEventListener('pointerdown', down);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        canvas.removeEventListener('wheel', wheel);
      });
    }
    if (this.touch) {
      this.pad = this.touchButtons([
        { icon: 'review', label: t('dockBtnNext'), onPress: () => this.pickNext() },
        { icon: 'lab', label: t('dockBtnLab'), primary: true, onPress: () => this.dock() },
      ]);
      enlargePad();
    }
    // Keyboard: 1 to 4 pick, arrows and Q/E turn, Space or Enter to the lab, R back. While you
    // build your own molecule: arrows choose the spot, N O C S L add an atom, X removes it.
    this.onKey = (ev) => {
      if (this.isXR || e.paused || ev.altKey || ev.ctrlKey || ev.metaKey) return;
      const k = ev.key;
      const go = k === ' ' || k === 'Enter';
      if (go && ev.repeat) { ev.preventDefault(); return; }
      // Space or Enter also skip ahead: the rest of a lab run, the moment after a solved pocket.
      if (go && this.advance()) { ev.preventDefault(); return; }
      if (this.mode !== 'play') return;
      if (this.shop.key(k)) { ev.preventDefault(); return; }
      const step = THREE.MathUtils.degToRad(15);
      let handled = true;
      if (k >= '1' && k <= '5') this.pick(this.level?.candidates[Number(k) - 1]);
      else if (k === '+') this.pick(this.level?.candidates.find((c) => c.kind === 'scaffold'));
      else if (go) this.dock();
      else if (k === 'r' || k === 'R' || k === 'Backspace') this.putBack();
      else if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown' || k === 'q' || k === 'Q' || k === 'e' || k === 'E') {
        if (!this.active || this.active.s !== 'active') return;
        this.unsnap();
        const axis = k.startsWith('Arrow') ? (k === 'ArrowLeft' || k === 'ArrowRight' ? V(0, 1, 0) : V(1, 0, 0)) : V(0, 0, 1);
        const sign = k === 'ArrowLeft' || k === 'ArrowUp' || k === 'q' || k === 'Q' ? -1 : 1;
        this.turn(axis, sign * step);
      } else handled = false;
      if (handled) ev.preventDefault();
    };
    window.addEventListener('keydown', this.onKey);
    this.onSceneDispose(() => window.removeEventListener('keydown', this.onKey));
    // Headset: grab a molecule with the hand even without pointing at it.
    if (this.isXR) {
      this.prevEmptyPress = e.onEmptyPress;
      e.onEmptyPress = (p) => this.proximityGrab(p);
      this.onSceneDispose(() => { if (e.onEmptyPress) e.onEmptyPress = this.prevEmptyPress ?? null; });
    }
  }

  /** True while a tween moves the active molecule (to the pocket, into it, back out). */
  get snapTween() {
    return !!this.active?.moving;
  }

  /** Moves a candidate's pose with a tween; a newer move of the same candidate takes over. */
  move(c, duration, fn, done) {
    const id = (c.moveId = (c.moveId ?? 0) + 1);
    c.moving = true;
    this.tween(duration, (k) => { if (c.moveId === id) fn(k); }, {
      onDone: () => {
        if (c.moveId !== id) return;
        c.moving = false;
        done?.();
      },
    });
  }

  /** Space, Enter or the lab button skip the rest of a lab run or the pause after a solved pocket. */
  advance() {
    if (this.mode === 'lab' && this.labT > 0.5 && this.labT < LAB_TIME - 0.35) { this.labT = LAB_TIME - 0.35; return true; }
    if (this.mode === 'solved' && this.solvedT > 0.6) { this.solvedT = 99; return true; }
    return false;
  }

  worldQuatInv() {
    return this.world.getWorldQuaternion(new THREE.Quaternion()).invert();
  }

  /** Turns the active molecule about the camera's axes (pixels of a drag, y up). */
  rotateBy(dx, dy) {
    const c = this.active;
    if (!c || c.s !== 'active') return;
    const k = (Math.PI * 1.3) / Math.max(320, Math.min(window.innerWidth, window.innerHeight));
    const camQ = this.engine.camera.getWorldQuaternion(new THREE.Quaternion());
    const inv = this.worldQuatInv();
    const up = V(0, 1, 0).applyQuaternion(camQ).applyQuaternion(inv);
    const right = V(1, 0, 0).applyQuaternion(camQ).applyQuaternion(inv);
    const q = new THREE.Quaternion().setFromAxisAngle(up, dx * k).multiply(new THREE.Quaternion().setFromAxisAngle(right, -dy * k));
    c.pose.quat.premultiply(q).normalize();
  }

  /** Keyboard turns: about the camera's up, right or view axis. */
  turn(axisCam, angle) {
    const c = this.active;
    const camQ = this.engine.camera.getWorldQuaternion(new THREE.Quaternion());
    const axis = axisCam.applyQuaternion(camQ).applyQuaternion(this.worldQuatInv()).normalize();
    c.pose.quat.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, angle)).normalize();
  }

  /** The controller (or hand) pose in world-group space. */
  ctrlMatrix(p, out = new THREE.Matrix4()) {
    p.controller.updateMatrixWorld(true);
    return out.copy(this.world.matrixWorld).invert().multiply(p.controller.matrixWorld);
  }

  proximityGrab(p) {
    if (this.mode !== 'play' || p.kind !== 'xr' || !p.controller || !this.level) return;
    if (this.shop.proximity(p)) return; // an atom from the dish, or one pulled off your design
    const hand = V().setFromMatrixPosition(this.ctrlMatrix(p));
    let best = null;
    let bestD = 0.13;
    for (const c of this.level.candidates) {
      if (c.s !== 'tray' && c.s !== 'active') continue;
      const d = c.pose.pos.distanceTo(hand);
      if (d < bestD) { best = c; bestD = d; }
    }
    if (!best) return;
    p.held = best.view.proxy;
    this.grabXR(best, p);
  }

  grabXR(c, p) {
    if (this.mode !== 'play' || (c.s !== 'tray' && c.s !== 'active')) return;
    if (this.active && this.active !== c) this.putBack();
    this.activate(c);
    this.hand = p;
    this.showRay();
    if (p.line) { p.line.visible = false; this.rayHidden = p; } // the hand holds it: no ray in the way
    this.unsnap();
    const ctrl = this.ctrlMatrix(p);
    const hand = V().setFromMatrixPosition(ctrl);
    const M = _m.compose(c.pose.pos, c.pose.quat, ONE);
    if (hand.distanceTo(c.pose.pos) < 0.16) {
      c.offset = ctrl.clone().invert().multiply(M);
      c.grabK = 1;
    } else {
      // Pulled in along the ray: it flies into the hand, keeping how it is turned.
      const ctrlQ = new THREE.Quaternion().setFromRotationMatrix(ctrl);
      const rel = ctrlQ.clone().invert().multiply(c.pose.quat);
      c.offset = new THREE.Matrix4().compose(V(0, 0, -0.075), rel, ONE);
      c.grabK = 0;
      c.grabFrom = { pos: c.pose.pos.clone(), quat: c.pose.quat.clone() };
    }
    sfx.grab();
    this.engine.haptic(p, 0.35, 30);
  }

  /** Shows the ray of a hand again (it was hidden while that hand held a molecule). */
  showRay() {
    const p = this.rayHidden;
    if (p?.line) p.line.visible = p.source?.targetRayMode !== 'screen';
    this.rayHidden = null;
  }

  releaseXR(c, p) {
    if (this.hand === p) this.hand = null;
    this.showRay();
    if (c !== this.active || c.s !== 'active') return;
    c.pose.pos.copy(c.view.group.position);
    c.pose.quat.copy(c.view.group.quaternion);
    // Far from the pocket it floats back to the tray; near it, it stays where you let go.
    if (c.pose.pos.distanceTo(this.idealPos) > 0.3) this.putBack();
  }

  // ---------- flow ----------

  start() {
    this.clearLayer();
    this.startMusic(0, 'dock');
    this.app.echo?.suppress(true);
    Object.assign(this, { score: 0, playT: 0, li: -1, solved: 0, tests: 0, tipsTested: 0, tipsHit: 0, firstTry: 0, levelLog: [] });
    this.refreshHud ??= this.hud(() => this.hudText());
    // Desktop: the status bar is pinned to the top of the screen while the lab is open (frameView).
    this.hudParts = this.group.children.filter((o) => o.userData.hud).map((o) => ({ o, pos: o.position.clone(), quat: o.quaternion.clone() }));
    this.layoutKey = null;
    this.nextLevel();
  }

  hudText() {
    const left = Math.max(0, Math.ceil(this.roundTime - (this.playT ?? 0)));
    const time = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    // Phones: without the game's name, so the line fits beside the menu button.
    return t(this.touch ? 'dockHudShort' : 'dockHud', { name: t('dockName'), n: Math.min(LEVELS, (this.li ?? 0) + 1), total: LEVELS, time, score: this.score ?? 0 });
  }

  /** Clears the old pocket (the protein dissolves) and builds the next one. */
  nextLevel() {
    const old = this.protMesh;
    this.clearCandidates();
    this.removeGhost();
    if (old) {
      this.mode = 'switch';
      const u = this.protMat.userData.u;
      this.tween(0.6, (k) => { u.uReveal.value = 0.3 - 0.6 * k; u.uEdge.value = 1; }, {
        onDone: () => { if (!this.disposed) this.buildLevel(this.li + 1); },
      });
      sfx.whoosh();
    } else this.buildLevel(this.li + 1);
  }

  buildLevel(i) {
    if (this.protMesh) {
      this.protMesh.removeFromParent();
      this.protMesh.geometry.dispose();
      if (this.F) { this.F.removeFromParent(); disposeOwn(this.F); }
    }
    this.li = i;
    const L = (this.level = this.round[i]);
    Object.assign(L, { t: 0, tests: 0, hinted: false });
    this.tol = this.tolFor(i);
    this.labCand = null;
    this.mode = 'screen';
    this.layoutKey = null;
    this.layout();
    const built = this.takeBuild(i);
    this.builds[i] = null;
    this.protein = built.protein;
    this.protMesh = new THREE.Mesh(built.geo, this.protMat);
    this.protMesh.castShadow = this.shadows;
    this.protMesh.receiveShadow = this.shadows; // the pocket's own shade
    this.prot.add(this.protMesh);
    // The pocket frame and its spot markers.
    const F = (this.F = new THREE.Object3D());
    this.protein.F.decompose(F.position, F.quaternion, F.scale);
    this.prot.add(F);
    this.markers = makeSpotMarkers(L.slots, this.kit);
    F.add(this.markers);
    this.prot.updateMatrix();
    this.Fw = new THREE.Matrix4().multiplyMatrices(this.prot.matrix, this.protein.F);
    this.FwInv = this.Fw.clone().invert();
    this.idealPos = V().copy(L.c0).applyMatrix4(this.Fw);
    this.idealQuat = new THREE.Quaternion().setFromRotationMatrix(this.Fw);
    this.pocketOut = V(0, 0, 1).applyQuaternion(this.idealQuat);
    // Browser: the picked molecule hovers here, above the pocket, so the pocket stays in view.
    this.hoverPos = this.idealPos.clone().addScaledVector(this.pocketOut, HOVER.out).add(V(0, HOVER.up, 0));
    this.viewSig = null;
    this.pocketLight.position.copy(V().copy(L.c0).add(V(0, 0, 0.17)).applyMatrix4(this.protein.F));
    // Candidates (they land on the tray when the screening is done).
    L.candidates.forEach((c, k) => {
      c.view = null;
      c.s = 'hidden';
      c.slot = k;
      c.pose = { pos: this.slotPos(k), quat: new THREE.Quaternion() };
      c.scale = 0.001;
      c.spin = Math.random() * Math.PI * 2;
      this.makeView(c);
      c.view.group.visible = false;
      c.badge = this.makeBadge(c);
      this.world.add(c.badge);
    });
    this.active = null;
    this.snapped = false;
    this.wells.userData.reset();
    this.redrawLab();
    // Build-in: the protein grows out of the emitter from the bottom up, the AI screens.
    const u = this.protMat.userData.u;
    u.uReveal.value = -0.3;
    u.uEdge.value = 1;
    this.screenT = 0;
    this.screenK = 0;
    this.shown = 0;
    this.redrawAll();
    this.runScreening();
    sfx.scan();
    if (L.design) this.toast(t('dockDesignTitle', { n: i + 1 }), 'xr-dock-you', t('dockCoachBuild'), 6);
    else this.toast(t('dockLevelTitle', { n: i + 1, name: t(L.key) }), 'xr-dock-ai');
    this.refreshHud?.();
  }

  /** (Re)creates a candidate's molecule view (your own design changes with every atom). */
  makeView(c) {
    const old = c.view;
    const v = new MoleculeView(this.kit, c.mol);
    if (old) {
      v.group.position.copy(old.group.position);
      v.group.quaternion.copy(old.group.quaternion);
      v.group.scale.copy(old.group.scale);
      v.group.visible = old.group.visible;
      if (this.hand?.held === old.proxy) this.hand.held = v.proxy;
      old.group.removeFromParent();
      old.dispose();
    }
    if (this.shadows) [v.atoms, v.bonds].forEach((m) => { if (m) m.castShadow = true; });
    c.view = v;
    c.trayScale = Math.min(this.flat ? 0.78 : 0.62, (this.flat ? 0.06 : TRAY.size) / c.mol.radius);
    // Browser: where the guide lines start (the atoms with a contact; your own design: its free spots).
    const L = this.level;
    c.guidePts = c.kind === 'scaffold'
      ? L.design.points.filter((pt) => pt.spot).map((pt) => pt.p.clone().sub(L.c0))
      : c.mol.atoms.filter((a) => a.spot).map((a) => a.p);
    const proxy = v.proxy;
    proxy.userData.interactive = true;
    proxy.userData.focusable = false; // the keyboard focus goes to the letter badge below it
    proxy.userData.label = c.kind === 'scaffold' ? t('dockOwn') : t('dockCandidate', { c: c.letter });
    proxy.userData.setHover = (h) => { c.hover = h; };
    if (this.isXR) {
      proxy.userData.onGrab = (p) => this.grabXR(c, p);
      proxy.userData.onRelease = (p) => this.releaseXR(c, p);
    } else proxy.userData.onClick = () => this.pick(c);
    this.world.add(v.group);
    if (c.kind === 'scaffold') this.shop.attach(c);
  }

  // ---------- building proteins in the background ----------

  startBuild(i) {
    const L = this.round[i];
    const protein = new Protein(L);
    return { protein, it: protein.buildSteps(L.tint, quality.lite ? 34 : 46), geo: null };
  }

  /** Advances the build of the current and the next pocket for at most ms milliseconds. */
  pumpBuilds(ms) {
    if (!this.round) return;
    const t0 = performance.now();
    const from = Math.max(0, this.li ?? 0);
    for (let i = from; i <= from + 1 && i < this.round.length; i++) {
      if (i === this.li && this.protMesh) continue;
      const b = (this.builds[i] ??= this.startBuild(i));
      while (b && !b.geo && performance.now() - t0 < ms) {
        const r = b.it.next();
        if (r.done) b.geo = r.value;
      }
      if (performance.now() - t0 >= ms) return;
    }
  }

  /** The finished build of pocket i (whatever is left is done now). */
  takeBuild(i) {
    const b = (this.builds[i] ??= this.startBuild(i));
    while (!b.geo) {
      const r = b.it.next();
      if (r.done) b.geo = r.value;
    }
    return b;
  }

  runScreening() {
    if (this.calm) return; // calm motion: the counter alone tells the story
    const from = this.aiPanel ? this.world.worldToLocal(this.aiPanel.getWorldPosition(V())) : V(-0.8, this.eye, -1);
    const tray = this.level.candidates.map((c, k) => this.slotPos(k));
    // Point size in framebuffer pixels for about 9 mm at 1 m.
    const size = this.isXR ? 8 : 0.0078 * window.innerHeight * this.engine.renderer.getPixelRatio();
    this.screening.userData.run(from, this.idealPos.clone(), tray, size);
  }

  updateScreen(dt) {
    this.screenT += dt;
    const T = this.screenT;
    const u = this.protMat.userData.u;
    u.uReveal.value = -0.3 + 0.62 * clamp(T / 1.2, 0, 1);
    u.uEdge.value = clamp((1.45 - T) / 0.35, 0, 1);
    const k = clamp(T / 1.3, 0, 1);
    // The counter runs up (redrawn a dozen times a second: the canvas upload is not free).
    if (k !== this.screenK && (k === 1 || T - (this.aiDrawT ?? -1) > 0.08)) { this.screenK = k; this.aiDrawT = T; this.redrawAI(); }
    if (T > 1.3) {
      const s = clamp((T - 1.3) / 0.45, 0, 1);
      if (s !== this.shown) { this.shown = s; this.redrawAI(); }
    }
    // The candidates land as their sparks arrive.
    this.level.candidates.forEach((c, k2) => {
      if (c.s === 'hidden' && T > 1.15 + k2 * 0.1) {
        c.s = 'tray';
        c.view.group.visible = true;
        c.pose.pos.copy(this.slotPos(k2));
        sfx.tink();
      }
    });
    if (T > 1.8) {
      this.mode = 'play';
      u.uEdge.value = 0;
      u.uReveal.value = 1;
      this.redrawFit();
      if (this.flat && this.li === 0) this.coach(this.dev('dockCoachPick'));
    }
  }

  /**
   * Where candidate k waits: in the headset on the bench tray; in the browser in a row below the
   * protein (phones in landscape: in a column to its left).
   */
  slotPos(k) {
    const off = (k - 1.5);
    if (this.flat) {
      if (this.layoutKey === 'land') return V(-0.35, this.eye + PROT.y + 0.03 - off * 0.125, PROT.z + 0.1);
      return V(off * (this.desk ? 0.14 : 0.15), this.eye + PROT.y - 0.3, PROT.z + 0.08);
    }
    return V(TRAY.x + off * TRAY.gap, this.bench.position.y + TRAY.lift, TRAY.z);
  }

  /** Where a candidate's letter badge sits (relative to its place). */
  badgeOffset() {
    if (!this.flat) return V(0, -TRAY.lift + 0.022, 0.058);
    return this.layoutKey === 'land' ? V(-0.095, 0, 0.01) : V(0, -0.088, 0.01);
  }

  /**
   * Picks a candidate. Browser: it flies above the pocket, turned away from the right pose (a
   * little in the first pocket and in relaxed mode, more later). Headset (pointing at a letter
   * or a row of the ranking): it flies in front of the pocket.
   */
  pick(c) {
    if (!c || this.mode !== 'play' || c.s !== 'tray' || this.engine.paused) return;
    if (this.active && this.active !== c) this.putBack();
    this.activate(c);
    // After a pick with the keyboard focus, Space and Enter mean "to the lab" again.
    if (this.flat && this.engine.focus) this.engine.setFocus(null);
    const tolDeg = THREE.MathUtils.radToDeg(this.tol);
    const r = Math.random();
    const deg = !this.flat ? (this.li === 0 ? 55 + r * 25 : 75 + r * 50)
      : tolDeg + (this.easy || this.li === 0 ? 8 + r * 20 : 28 + r * 50);
    const to = this.flat ? this.hoverPos.clone() : this.idealPos.clone().addScaledVector(this.pocketOut, 0.13);
    const axis = V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    if (this.flat) {
      // Browser: turned about an axis in the screen plane, so one straight drag (or one pair of
      // arrow keys) brings it home; no tilt about the view axis is needed.
      const phi = Math.random() * Math.PI * 2;
      axis.set(Math.cos(phi), Math.sin(phi), 0).applyQuaternion(this.engine.camera.getWorldQuaternion(new THREE.Quaternion())).applyQuaternion(this.worldQuatInv()).normalize();
    }
    const toQ = this.idealQuat.clone().premultiply(new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(Math.min(170, deg))));
    const fromP = c.pose.pos.clone();
    const fromQ = c.pose.quat.clone();
    this.move(c, 0.45, (k) => {
      c.pose.pos.lerpVectors(fromP, to, k);
      c.pose.pos.y += Math.sin(k * Math.PI) * 0.05;
      c.pose.quat.slerpQuaternions(fromQ, toQ, k);
    }, () => { if (this.flat && this.active === c) this.coach(this.dev(c.kind === 'scaffold' ? 'dockCoachPoint' : 'dockCoachTurn')); });
    sfx.grab();
  }

  activate(c) {
    this.active = c;
    c.s = 'active';
    this.snapped = false;
    this.removeGhost();
    this.redrawAI();
  }

  /** The next candidate in the row (phones). */
  pickNext() {
    if (this.mode !== 'play' || !this.level) return;
    const list = this.level.candidates;
    const start = this.active ? list.indexOf(this.active) : -1;
    for (let k = 1; k <= list.length; k++) {
      const c = list[(start + k) % list.length];
      if (c.s === 'tray') { this.pick(c); return; }
    }
  }

  /** The active molecule goes back to its place. */
  putBack(c = this.active) {
    if (!c || c.s !== 'active') return;
    if (this.hand && this.hand.held === c.view.proxy) this.hand.held = null;
    this.hand = null;
    this.showRay();
    c.s = 'tray';
    c.view.clearGlow();
    if (this.active === c) { this.active = null; this.snapped = false; this.removeGhost(); }
    this.flyHome(c);
    this.redrawAI();
    this.redrawFit();
  }

  flyHome(c) {
    const fromP = c.pose.pos.clone();
    const to = this.slotPos(c.slot);
    this.move(c, 0.5, (k) => {
      c.pose.pos.lerpVectors(fromP, to, k);
      c.pose.pos.y += Math.sin(k * Math.PI) * 0.05;
    });
  }

  /** Browser: turned close enough, the molecule slides down into the pocket and clicks in. */
  slideIn(c) {
    const fromP = c.pose.pos.clone();
    const fromQ = c.pose.quat.clone();
    sfx.whoosh();
    this.move(c, this.calm ? 0.22 : 0.34, (k) => {
      c.pose.pos.lerpVectors(fromP, this.idealPos, k);
      c.pose.quat.slerpQuaternions(fromQ, this.idealQuat, k);
    }, () => {
      if (this.active !== c || c.s !== 'active') return;
      c.pose.pos.copy(this.idealPos);
      c.pose.quat.copy(this.idealQuat);
      this.snapped = true;
      this.onSnap();
    });
  }

  /** The molecule leaves its locked pose (browser: it lifts back out above the pocket). */
  unsnap() {
    if (!this.snapped) return;
    this.snapped = false;
    const c = this.active;
    if (!this.flat || !c || c.s !== 'active') return;
    const from = c.pose.pos.clone();
    this.move(c, 0.2, (k) => c.pose.pos.lerpVectors(from, this.hoverPos, k));
  }

  /** Lock in and send to the lab, if it fits well enough. */
  dock() {
    if (this.engine.paused) return;
    if (this.advance()) return;
    if (this.mode !== 'play') return;
    const c = this.active;
    if (!c || c.s !== 'active') { this.toast(t('dockNeedMol'), 'xr-dock-mid'); sfx.wrong(); return; }
    const inPocket = this.flat ? this.snapped : c.view.group.position.distanceTo(this.idealPos) < IN_POCKET;
    if (!inPocket) { this.toast(t(this.flat ? 'dockNeedSnap' : 'dockNeedPocket'), 'xr-dock-mid'); sfx.wrong(); return; }
    if ((this.fitOut.fit ?? 0) < FIT_MIN) { this.toast(t(c.kind === 'scaffold' ? 'dockNeedFitOwn' : 'dockNeedFit'), 'xr-dock-bad'); sfx.wrong(); return; }
    this.startLab(c);
  }

  // ---------- the lab test ----------

  startLab(c) {
    if (this.hand) { if (this.hand.held === c.view.proxy) this.hand.held = null; this.hand = null; }
    this.showRay();
    c.pose.pos.copy(c.view.group.position);
    c.pose.quat.copy(c.view.group.quaternion);
    c.fit = Math.round((this.fitOut.fit ?? 0) * 100) / 100;
    // Your own design: the lab measures what you built.
    if (c.kind === 'scaffold') Object.assign(c, designTruth(this.level, c.choices));
    this.shop.clear();
    c.s = 'lab';
    c.testing = true;
    this.mode = 'lab';
    this.tests += 1;
    this.level.tests += 1;
    this.labT = 0;
    this.labCand = c;
    this.labK = 0;
    this.wells.userData.reset();
    this.redrawAI();
    this.redrawLab();
    sfx.build();
    this.ringFlash(this.idealPos, 'xr-dock-lab');
    // A small sample flies into the reader.
    const mini = new MoleculeView(this.kit, c.mol);
    mini.group.scale.setScalar(0.3);
    mini.group.quaternion.copy(c.pose.quat);
    this.world.add(mini.group);
    const from = c.pose.pos.clone();
    const to = INLET.clone().add(this.bench.position);
    const mid = from.clone().lerp(to, 0.5).add(V(0, 0.22, 0.05));
    const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
    this.delay(0.25, () => {
      if (this.disposed) return;
      sfx.whoosh();
      this.tween(0.55, (k) => {
        curve.getPoint(k, mini.group.position);
        mini.group.scale.setScalar(0.3 * (1 - 0.7 * k * k));
        mini.group.rotation.y += 0.15;
      }, { ease: (k) => k * k * (3 - 2 * k), onDone: () => { mini.group.removeFromParent(); mini.dispose(); sfx.tink(); } });
    });
  }

  updateLab(dt) {
    this.labT += dt;
    const c = this.labCand;
    const k = clamp((this.labT - 0.8) / 1.5, 0, 1);
    if (Math.abs(k - this.labK) > 0.02 || (k === 1 && this.labK !== 1)) {
      this.labK = k;
      this.wells.userData.show(k, c.truth / 100);
      this.redrawLab();
    }
    if (this.labT >= LAB_TIME && !this.labDone) {
      this.labDone = true;
      this.resolveLab(c);
    }
  }

  resolveLab(c) {
    this.labDone = false;
    c.testing = false;
    c.tested = true;
    c.lab = c.truth;
    const L = this.level;
    const top = !!L.top && c === L.top;
    if (top) { this.tipsTested += 1; if (c.lab >= PASS) this.tipsHit += 1; }
    c.badge?.redraw();
    this.redrawAI();
    this.redrawLab();
    if (c.lab >= PASS) this.solve(c);
    else this.fail(c, top);
  }

  solve(c) {
    const L = this.level;
    c.s = 'done';
    this.solved += 1;
    if (L.tests === 1) this.firstTry += 1;
    const P = L.design ? PTS_DESIGN : PTS;
    // Relaxed mode: twice the time before the speed points run out.
    const slow = P.slow * (this.easy ? 2 : 1);
    const speed = Math.round(P.speed * clamp((slow - L.t) / (slow - P.fast), 0, 1));
    const fitPts = Math.round(P.fit * clamp(c.fit, 0, 1));
    const testPts = P.tests[Math.min(P.tests.length - 1, L.tests - 1)];
    const own = L.design && c.kind === 'scaffold' ? P.design : 0;
    const pts = fitPts + speed + testPts + own;
    this.score += pts;
    this.levelLog.push({ level: L.idx, fit: c.fit, time: Math.round(L.t), tests: L.tests, speed, pts });
    sfx.powerup();
    this.delay(0.15, () => { if (!this.disposed) sfx.correct(); });
    this.burst(this.world.localToWorld(this.idealPos.clone()), 'xr-dock-good', this.calm ? 10 : 40);
    this.ringFlash(this.idealPos, 'xr-dock-good');
    // What the points are made of (so the player sees what a quick, clean docking is worth).
    const parts = { fit: fitPts, speed, tests: L.tests, test: testPts, design: own };
    this.toast(t('dockSolved', { n: pts }), 'xr-dock-good', t(own ? 'dockSolvedSubOwn' : 'dockSolvedSub', parts), 4);
    this.mode = 'solved';
    this.solvedT = 0;
    this.refreshHud?.();
  }

  /** After a solved pocket (a short moment to enjoy it; Space or Enter skip it). */
  afterSolved() {
    if (this.disposed || this.mode !== 'solved') return;
    if (this.li + 1 >= LEVELS) this.finish();
    else this.nextLevel();
  }

  fail(c, top) {
    const own = c.kind === 'scaffold';
    // Your own design stays in the pocket: change atoms and test again. Others go back, marked.
    c.s = own ? 'active' : 'failed';
    if (!own) {
      c.view.clearGlow();
      if (this.active === c) this.active = null;
      this.snapped = false;
    }
    sfx.wrong();
    const verdict = c.lab >= 34 ? t('dockLabWeak') : t('dockLabNone');
    this.toast(top ? t('dockLabSurprise') : `${own ? t('dockOwn') : t('dockCandidate', { c: c.letter })}: ${verdict}`, 'xr-dock-bad', t(c.why), 5);
    if (!own) this.flyHome(c);
    this.mode = 'play';
    this.redrawFit();
    // Phones: the result stands in the strip; it goes when you carry on.
    if (this.touch) this.delay(3.4, () => { if (!this.disposed && this.labCand === c && this.mode === 'play') { this.labCand = null; this.redrawLab(); } });
  }

  finish() {
    if (this.mode === 'over') return;
    this.mode = 'over';
    this.app.echo?.suppress(false);
    this.clearCandidates();
    this.removeGhost();
    this.guides?.userData.hide();
    this.ui.visible = false;
    this.prot.visible = false;
    this.screening.visible = false;
    this.cone.visible = false;
    this.toastPanel = null;
    this.note = null;
    this.engine.fitEnabled = true;
    // The status bar goes back to its usual place above the result.
    this.hudParts?.forEach(({ o, pos, quat }) => { o.position.copy(pos); o.quaternion.copy(quat); o.scale.setScalar(1); if (this.desk) o.visible = true; });
    if (!this.isXR) this.engine.camera.rotation.set(0, 0, 0);
    const learned = [
      { q: t('dockLearnQ1'), a: t('dockLearnA1') },
      { q: t('dockLearnQ2'), a: t('dockLearnA2') },
      { q: t('dockLearnQ4'), a: t('dockLearnA4') },
    ];
    const score = Math.min(5000, this.score);
    // The rank counts the points as the result shows them (relaxed mode: a share of them).
    const shown = Math.round(score * assist.scoreFactor);
    let rank = 0;
    RANKS.forEach((min, i) => { if (shown >= min) rank = i; });
    const names = ['dockRank1', 'dockRank2', 'dockRank3'];
    const lines = [rank + 1 < RANKS.length ? t('dockRankLine', { rank: t(names[rank]) }) : t('dockRankTop', { rank: t(names[rank]) })];
    if (rank + 1 < RANKS.length) lines.push(t('dockRankNext', { n: RANKS[rank + 1] - shown, rank: t(names[rank + 1]) }));
    lines.push(`${this.solved < LEVELS ? `${t('dockTimeUp')} · ` : ''}${t('dockLine', { solved: this.solved, total: LEVELS, tests: this.tests })}`);
    // The lesson in numbers: how often the AI's confident pick held in the lab.
    if (this.tipsTested) lines.push(t('dockLineAI', { hits: this.tipsHit, tips: this.tipsTested }));
    // What went well, and one tip for the next round.
    const log = this.levelLog;
    if (this.firstTry >= 2) lines.push(t('dockStrongFirst', { n: this.firstTry }));
    else if (this.firstTry === 1) lines.push(t('dockStrongFirst1'));
    else if (log.length) lines.push(t('dockStrongFit', { n: Math.round((log.reduce((a, l) => a + l.fit, 0) / log.length) * 100) }));
    const speedShare = log.length ? log.reduce((a, l) => a + l.speed, 0) / (log.length * PTS.speed) : 0;
    const tip = this.solved < LEVELS ? 'dockTipTime' : this.tests > LEVELS + 2 ? 'dockTipTests' : speedShare < 0.6 ? 'dockTipSpeed' : 'dockTipTop';
    lines.push(t(tip));
    this.results({
      gameKey: 'dock', score, correct: this.solved, total: LEVELS, line: lines.join('\n'), learned,
      onAgain: () => { quickStart = true; this.app.startGame('dock'); },
    });
  }

  clearCandidates() {
    this.showRay();
    this.shop?.clear();
    if (!this.level) return;
    for (const c of this.level.candidates) {
      if (!c.view) continue;
      c.view.group.removeFromParent();
      c.view.dispose();
      c.view = null;
      if (c.badge) { c.badge.removeFromParent(); c.badge.dispose(); c.badge = null; }
    }
    this.active = null;
    this.hand = null;
  }

  // ---------- the AI's pose hint ----------

  showGhost(c) {
    this.removeGhost();
    // Your own design: the AI shows the finished molecule (a hint after a long while).
    const g = new MoleculeView(this.kit, c.kind === 'scaffold' ? this.level.template : c.mol, { ghost: true });
    g.group.position.copy(this.idealPos);
    g.group.quaternion.copy(this.idealQuat);
    g.group.renderOrder = 3;
    this.world.add(g.group);
    this.ghost = { view: g, cand: c };
  }

  removeGhost() {
    if (!this.ghost) return;
    this.ghost.view.group.removeFromParent();
    this.ghost.view.dispose();
    this.ghost = null;
  }

  // ---------- frame loop ----------

  update(dt) {
    this.time += dt;
    this.layout();
    const e = this.engine;
    // Results stand behind the bench: always draw them on top; the camera frames only them.
    if (this.mode === 'over') {
      this.layer.traverse((o) => {
        if (!o.material || o.userData.onTop) return;
        o.material.depthTest = false;
        o.renderOrder = 100;
        o.userData.onTop = true;
      });
      if (!this.isXR) this.bench.visible = false;
    }
    // The bench column reaches down to the floor (not in AR: the bench floats over the real room).
    const ar = e.isXR && e.xrMode === 'immersive-ar';
    this.sky.visible = !ar;
    if (this.column) {
      this.column.visible = !ar && !this.touch;
      const topY = this.bench.getWorldPosition(_v).y - 0.04;
      this.column.scale.y = Math.max(0.05, topY - e.floorY);
    }
    // Phones held upright: the intro panel alone (the bench would only peek in at the bottom).
    if (this.mode === 'intro' && this.touch) this.bench.visible = window.innerWidth > window.innerHeight;
    if (this.mode !== 'over' && this.mode !== 'lab') this.pumpBuilds(this.isXR ? 3 : 6);
    if (this.mode === 'screen') this.updateScreen(dt);
    if (this.mode === 'play') {
      this.playT += dt;
      this.level.t += dt;
      if (this.playT >= this.roundTime) { this.finish(); return; }
      const L = this.level;
      // The AI's pose as a ghost in the pocket: after a while, in relaxed mode at once.
      const hintAt = this.easy ? 0.6 : HINT_T[Math.min(this.li, HINT_T.length - 1)];
      if (!this.ghost && !this.snapped && L.t > hintAt) {
        const c = this.active ?? L.top;
        if (c && c.s !== 'failed' && !c.moving) {
          this.showGhost(c);
          if (!L.hinted && !this.easy) { L.hinted = true; this.toast(t('dockGhost'), 'xr-dock-ghost'); }
        }
      }
      if (this.ghost && this.active && this.ghost.cand !== this.active) this.showGhost(this.active);
      music.intensity = this.roundTime - this.playT < 30 ? 2 : 1;
    }
    if (this.mode === 'lab') this.updateLab(dt);
    if (this.mode === 'solved') {
      this.solvedT += dt;
      if (this.solvedT > 2.4) { this.afterSolved(); if (this.mode === 'over') return; }
    }
    this.updateTray(dt);
    this.updateActive(dt);
    this.updateGuides();
    this.faceViewer();
    if (this.ghost) this.ghost.view.glow.material.uniforms.uBoost.value = this.calm ? 0.45 : 0.35 + 0.25 * Math.sin(this.time * 4);
    // Screening stream.
    const su = this.screening.userData.u;
    if (this.screening.visible) {
      su.uT.value += dt;
      if (su.uT.value > 1.6) su.uFade.value = Math.max(0, su.uFade.value - dt * 3);
      if (su.uFade.value <= 0) this.screening.visible = false;
    }
    this.markers?.userData.tick(this.active && this.near ? this.fitOut.spot : null, this.time, this.mode === 'screen' ? clamp(this.screenT - 0.7, 0, 1) : 1, this.eyeF, this.calm);
    this.bulbs?.userData.tick(this.time);
    this.cone.material.opacity = 0.06 + (this.calm ? 0 : 0.025 * Math.sin(this.time * 2.2));
    // Pocket light: violet when empty, warming to green as the fit grows.
    const f = this.near ? this.fitShown : 0;
    this.pocketLight.color.setHex(hex(f >= 0.7 ? 'xr-dock-good' : f >= 0.45 ? 'xr-dock-mid' : 'xr-dock-ai'));
    this.pocketLight.intensity = this.prot.visible ? 0.004 + f * 0.014 : 0;
    // Panels and the status bar (a few times a second).
    const tick = Math.floor(this.time * 8);
    if (tick !== this.panelTick) {
      this.panelTick = tick;
      this.redrawFit();
      if (tick % 2 === 0 && this.mode !== 'intro' && this.mode !== 'over') this.refreshHud?.();
    }
    this.labBtnState();
    if (this.desk) this.frameView(dt);
    const atomPad = this.shop.update(dt, this.time);
    const live = this.mode === 'play' || this.mode === 'lab' || this.mode === 'screen' || this.mode === 'solved' || this.mode === 'switch';
    this.pad?.show(live && !atomPad);
    if (this.strip) {
      this.strip.show(live);
      if (live) { this.strip.place(); if (tick !== this.stripTick) { this.stripTick = tick; this.strip.set(this.phoneState()); } }
    }
  }

  /** Tray molecules turn slowly; failed ones sit small and dim. */
  updateTray(dt) {
    if (!this.level) return;
    for (const c of this.level.candidates) {
      if (!c.view) continue;
      const g = c.view.group;
      let want = 1;
      const home = this.slotPos(c.slot);
      if (c.s === 'tray' || c.s === 'failed' || c.s === 'hidden') {
        want = c.trayScale * (c.s === 'failed' ? 0.75 : c.hover ? 1.15 : 1);
        if (!c.moving && c.s !== 'hidden') {
          const bob = this.calm ? 0 : Math.sin(this.time * 1.6 + c.slot) * 0.005;
          c.pose.pos.lerp(_v.copy(home).setY(home.y + bob), Math.min(1, dt * 6));
        }
        // Facing you, tilted up a little, gently swaying (so its shape reads at a glance).
        c.spin += dt * 0.7;
        const sway = this.calm ? 0.25 : Math.sin(c.spin) * (c.s === 'failed' ? 0.2 : 0.6);
        c.pose.quat.setFromEuler(new THREE.Euler(this.flat ? -0.15 : -0.55, sway, 0));
      }
      if (c.badge) {
        c.badge.position.copy(home).add(this.badgeOffset());
        c.badge.visible = c.s !== 'hidden';
      }
      c.scale += (want - c.scale) * Math.min(1, dt * 8);
      g.scale.setScalar(Math.max(0.001, c.scale));
      if (c !== this.active || c.s !== 'active') {
        g.position.copy(c.pose.pos);
        g.quaternion.copy(c.pose.quat);
      }
      if (c.s === 'failed') {
        for (let i = 0; i < c.mol.atoms.length; i++) c.view.setGlow(i, this.badCol ??= new THREE.Color(hex('xr-dock-bad')), 0.12);
        c.view.flush();
      }
    }
  }

  /**
   * The candidate's letter at its place, with the AI's star for its top pick and the lab's check
   * or cross. In the browser it is also the keyboard's way to pick (Tab, then Enter).
   */
  makeBadge(c) {
    let focus = false;
    const b = new Panel(0.064, 0.05, (ctx, p) => {
      const top = c === this.level?.top;
      const done = c.tested;
      const ok = done && c.lab >= PASS;
      const edge = focus ? 'xr-focus' : done ? (ok ? 'xr-dock-good' : 'xr-dock-bad') : top ? 'xr-warning' : c.kind === 'scaffold' ? 'xr-dock-you' : 'xr-panel-border';
      p.surface({ fill: color('xr-panel-bg'), stroke: color(edge), strokeWidth: focus ? 0.005 : undefined, radius: 0.012, stripe: false });
      const W = p.canvas.width;
      const H = p.canvas.height;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = font('black', p.m(0.034));
      ctx.fillStyle = color(done ? (ok ? 'xr-dock-good' : 'xr-dock-bad') : 'xr-panel-text');
      const mark = done || top;
      ctx.fillText(c.letter, W * (mark ? 0.36 : 0.5), H * 0.54);
      // Not by color alone: a check or a cross from the lab, a star for the AI's pick.
      if (done) (ok ? check : cross)(ctx, W * 0.7, H * 0.52, p.m(0.02), color(ok ? 'xr-dock-good' : 'xr-dock-bad'));
      else if (top) {
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const r = p.m(i % 2 ? 0.0055 : 0.012);
          ctx.lineTo(W * 0.7 + Math.cos(a) * r, H * 0.5 + Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.fillStyle = color('xr-warning');
        ctx.fill();
      }
    });
    if (this.flat) b.scale.setScalar(1.5); // browser: big enough to read, to click and to tap
    b.userData.interactive = true;
    b.userData.label = c.kind === 'scaffold' ? t('dockOwnEst', { n: c.ai }) : t('dockCandidateAI', { c: c.letter, n: c.ai });
    b.userData.onClick = () => this.pick(c);
    b.userData.setHover = (v) => { c.hover = v; };
    b.userData.setFocus = (v) => { focus = v; c.hover = v; b.redraw(); };
    return b;
  }

  /** The active molecule: follows the hand (XR), the pocket pulls it in, fit and glow. */
  updateActive(dt) {
    const c = this.active;
    this.near = false;
    if (c && c.s === 'done') { this.near = true; return; }
    if (!c || !c.view || (c.s !== 'active' && c.s !== 'lab')) {
      this.fitShown += (0 - this.fitShown) * Math.min(1, dt * 6);
      return;
    }
    const g = c.view.group;
    const ideal = this.idealPos;
    const iq = this.idealQuat;
    let pos = c.pose.pos;
    let quat = c.pose.quat;
    if (c.s === 'active' && this.hand && this.hand.held === c.view.proxy) {
      // In the hand: full 6DoF, plus a gentle pull into the pocket when it is close.
      const target = _m.copy(this.ctrlMatrix(this.hand, _m2)).multiply(c.offset);
      const tp = V();
      const tq = new THREE.Quaternion();
      target.decompose(tp, tq, _v);
      if (c.grabK < 1) {
        c.grabK = Math.min(1, c.grabK + dt / 0.28);
        const k = c.grabK * c.grabK * (3 - 2 * c.grabK);
        tp.lerpVectors(c.grabFrom.pos, tp, k);
        tq.slerpQuaternions(c.grabFrom.quat, tq, k);
      }
      const d = tp.distanceTo(ideal);
      const a = tq.angleTo(iq);
      const w = 0.85 * (1 - THREE.MathUtils.smoothstep(d, 0.008, 0.04)) * (1 - THREE.MathUtils.smoothstep(a, this.tol * 0.45, this.tol));
      pos = tp.lerp(ideal, w);
      quat = tq.slerp(iq, w);
      c.pose.pos.copy(pos);
      c.pose.quat.copy(quat);
    } else if (c.s === 'active' && this.flat) {
      // Browser: it hovers above the pocket; let go close enough to the right pose, it slides in.
      if (!this.drag?.on && !c.moving && !this.snapped && quat.angleTo(iq) < this.tol) this.slideIn(c);
    } else if (c.s === 'active' && !this.drag && !this.dragging && !this.snapTween && !this.snapped) {
      // Let go: within reach of the right pose the pocket pulls it in and it clicks into place.
      const d = pos.distanceTo(ideal);
      const a = quat.angleTo(iq);
      if (d < CAPTURE && a < this.tol) {
        const k = 1 - Math.exp(-dt * 7);
        pos.lerp(ideal, k);
        quat.slerp(iq, k);
        if (d < 0.0015 && a < 0.02) {
          pos.copy(ideal);
          quat.copy(iq);
          this.snapped = true;
          this.onSnap();
        }
      }
    }
    if (c.scale < 0.999) c.scale += (1 - c.scale) * Math.min(1, dt * 8);
    g.position.copy(pos);
    g.quaternion.copy(quat);
    g.scale.setScalar(c.scale);
    // Fit and glow (headset: only near the pocket; browser: always, as a preview of the pose).
    this.near = this.flat || pos.distanceTo(ideal) < 0.14;
    const view = c.view;
    if (!this.near) {
      this.fitOut.fit = 0;
      this.fitOut.spot = null;
      view.clearGlow();
      view.flush();
      this.fitShown += (0 - this.fitShown) * Math.min(1, dt * 6);
      return;
    }
    if (c.s === 'active') {
      const prevGood = this.fitOut.good ?? 0;
      const prevClash = (this.fitOut.clash ?? 0) > 0.3;
      this.evalFit(c);
      if (this.fitOut.good > prevGood) { sfx.tink(); this.engine.haptic(this.hand, 0.3, 25); }
      if (this.fitOut.clash > 0.3 && !prevClash) this.engine.haptic(this.hand, 0.7, 60);
    }
    const out = this.fitOut;
    this.fitShown += ((out.fit ?? 0) - this.fitShown) * Math.min(1, dt * 8);
    const good = (this.goodCol ??= new THREE.Color(hex('xr-dock-good')));
    const bad = (this.badCol ??= new THREE.Color(hex('xr-dock-bad')));
    // Calm motion: a steady glow instead of a flicker.
    const flick = this.calm ? 0.9 : 0.75 + 0.25 * Math.sin(this.time * 16);
    const lab = c.s === 'lab';
    // Browser, still hovering: walls do not count yet (only contacts show, as a preview).
    const preview = this.flat && !this.snapped && !lab;
    for (let i = 0; i < c.mol.atoms.length; i++) {
      const st = out.atom?.[i];
      const wall = (out.pen?.[i] ?? 0) > 0.15;
      if (lab) view.setGlow(i, good, this.calm ? 0.2 : 0.15 + 0.12 * Math.sin(this.time * 8 + i));
      else if (st === 'contact') view.setGlow(i, good, 0.55);
      else if (st === 'good') view.setGlow(i, good, preview ? 0 : 0.035);
      else if (st === 'bad' && !(preview && wall)) view.setGlow(i, bad, flick * (0.5 + 0.35 * (out.pen?.[i] ?? 0)));
      else view.setGlow(i, good, 0);
    }
    view.flush();
  }

  /**
   * Measures the fit of the active molecule. Headset: where it really is. Browser, while it
   * hovers above the pocket: as if it sat in the pocket, turned as it is now.
   */
  evalFit(c) {
    const g = c.view.group;
    if (this.flat && !this.snapped) _m3.compose(this.idealPos, c.pose.quat, ONE);
    else {
      g.updateMatrix();
      // The molecule frame is scaled while it grows from the tray; measure the real pose.
      _m3.copy(g.matrix).scale(_v.setScalar(1 / Math.max(0.001, c.scale)));
    }
    return evaluateFit(this.protein, c.mol, _m.multiplyMatrices(this.FwInv, _m3), this.fitOut);
  }

  /** Browser: guide rods from the hovering molecule's atoms to the contact spots they belong to. */
  updateGuides() {
    const gd = this.guides;
    if (!gd) return;
    const c = this.active;
    let n = 0;
    if (c && c.s === 'active' && c.view && this.mode === 'play' && !this.snapped && !c.moving) {
      const g = c.view.group;
      for (const q of c.guidePts ?? []) {
        _v.copy(q).multiplyScalar(c.scale).applyQuaternion(g.quaternion).add(g.position);
        _v2.copy(q).applyQuaternion(this.idealQuat).add(this.idealPos);
        gd.userData.set(n, _v, _v2);
        n += 1;
      }
    }
    gd.userData.hide(n);
  }

  /** Letters on the atoms and the checks on the contact spots turn to the viewer. */
  faceViewer() {
    const cam = this.engine.camera;
    const eye = cam.getWorldPosition(this.eyeW ??= V());
    if (this.level) {
      for (const c of this.level.candidates) {
        const v = c.view;
        if (!v || !v.labels.length || !v.group.visible) continue;
        v.group.updateWorldMatrix(true, false);
        v.face(_v.copy(eye).applyMatrix4(_m.copy(v.group.matrixWorld).invert()));
      }
    }
    if (this.F) {
      this.F.updateWorldMatrix(true, false);
      _m.copy(this.F.matrixWorld).invert();
      const camQ = cam.getWorldQuaternion(_q);
      const f = (this.eyeF ??= { pos: V(), up: V(), right: V() });
      f.pos.copy(eye).applyMatrix4(_m);
      f.up.set(0, 1, 0).applyQuaternion(camQ).transformDirection(_m);
      f.right.set(1, 0, 0).applyQuaternion(camQ).transformDirection(_m);
    }
  }

  onSnap() {
    const c = this.active;
    if (c) this.evalFit(c);
    const ok = (this.fitOut.fit ?? 0) >= FIT_MIN;
    if (ok) sfx.correct(); else sfx.tink();
    this.engine.haptic(this.hand, 0.8, 90);
    this.ringFlash(this.idealPos, ok ? 'xr-dock-good' : 'xr-dock-mid');
    this.removeGhost();
    this.redrawFit();
    // The scaffold sits in the pocket: the first free attachment point is ready for an atom.
    if (c?.kind === 'scaffold') {
      if (this.shop.sel === null) this.shop.select(this.shop.nextEmpty(-1, true));
      if (this.flat) this.coach(this.dev('dockCoachPoint'), 'xr-dock-you');
    } else if (ok) this.coach(this.dev('dockCoachLab'), 'xr-dock-good');
    else if (this.flat) {
      // It sits, but it will not hold: say why, so the player can try another candidate at once.
      this.toast(this.fitState().status, 'xr-dock-bad', t('dockNeedFit'), 4);
    }
  }

  /** A ring of light that widens around the pocket. */
  ringFlash(at, token) {
    if (this.calm) return; // calm motion: no flash
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.004, 8, 48), new THREE.MeshBasicMaterial({ color: hex(token), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    ring.position.copy(at);
    ring.quaternion.copy(this.idealQuat);
    ring.userData.noFit = true;
    this.world.add(ring);
    this.tween(0.6, (k) => { ring.scale.setScalar(1 + k * 1.6); ring.material.opacity = 1 - k; }, {
      onDone: () => { ring.removeFromParent(); ring.geometry.dispose(); ring.material.dispose(); },
    });
  }

  // ---------- panels and layout ----------

  /**
   * Places panels for the platform: in the headset on an arc (AI ranking left, lab right, fit
   * meter beside the protein); on desktop small and close beside the protein, so the protein
   * fills the screen (ranking and legend left, fit meter, lab button and lab result right); on
   * phones there are none (the screen strip of dock-phone.js shows the numbers).
   */
  layout() {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const key = this.isXR ? 'xr' : this.touch ? (aspect < 1 ? 'port' : 'land') : 'desk';
    if (this.mode === 'intro') return;
    if (key === this.layoutKey && (key !== 'desk' || Math.abs(aspect - this.layoutAspect) < 0.03)) return;
    this.layoutKey = key;
    this.layoutAspect = aspect;
    this.viewSig = null;
    const compact = key === 'port' || key === 'land';
    // Rebuild the panels.
    [...this.ui.children].forEach((o) => { o.removeFromParent(); disposeOwn(o); });
    this.aiPanel = this.fitPanel = this.labPanel = this.legend = null;
    this.rowHits = [];
    this.btnDock = null;
    if (!compact) this.buildPanels(key, aspect);
    // Browser: the protein, the hovering molecule and the row of candidates alone, large and
    // clear; the bench with its props (the headset's table) is left out while you dock.
    this.bench.userData.noFit = this.flat;
    this.bench.visible = !this.flat;
    this.redrawAll();
  }

  /**
   * Phones: the part of the screen that is free for the 3D view (CSS px from each edge): below
   * the status bar and the strip, above the thumb buttons; in landscape beside the buttons.
   */
  screenInsets() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const ins = this.engine.insets();
    const out = { top: ins.top, bottom: ins.bottom, left: 0, right: 0 };
    if (W > H) {
      // Landscape: the buttons float in the lower corners; keep clear of them sideways.
      out.bottom = 0;
      document.querySelectorAll('#stage .mtouch:not([hidden]) .mtouch__btn').forEach((b) => {
        const r = b.getBoundingClientRect();
        if (!r.width) return;
        if (r.left + r.width / 2 > W / 2) out.right = Math.max(out.right, W - r.left + 6);
        else out.left = Math.max(out.left, r.right + 6);
      });
    }
    const q = (v) => Math.round(v / 8) * 8;
    return { top: q(out.top), bottom: q(out.bottom), left: q(out.left), right: q(out.right) };
  }

  /**
   * Browser: the camera looks into the pocket from a little above and comes as close as it can
   * while the protein, the hovering molecule, the candidates and (desktop) the panels fit into
   * the free part of the screen. Returns true while it holds the camera.
   */
  frameView(dt) {
    const e = this.engine;
    const playing = this.flat && !!this.level && !!this.hoverPos && this.mode !== 'intro' && this.mode !== 'over';
    if (this.desk) e.fitEnabled = !playing;
    if (!playing) { this.viewInit = false; return false; }
    const cam = e.camera;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const ins = this.touch ? this.screenInsets() : { top: 0, bottom: 0, left: 0, right: 0 };
    const sig = [W, H, ins.top, ins.bottom, ins.left, ins.right, this.layoutKey, this.li, this.ui.children.length].join('|');
    if (sig !== this.viewSig) {
      this.viewSig = sig;
      this.view = this.solveView(cam, ins, W, H);
    }
    const v = this.view;
    cam.quaternion.copy(v.quat);
    cam.position.lerp(v.pos, this.viewInit && !this.calm ? Math.min(1, dt * 5) : 1);
    this.viewInit = true;
    if (this.desk) this.pinHud();
    return true;
  }

  /** Finds the camera place for frameView (corner points projected into the free screen part). */
  solveView(cam, ins, W, H) {
    this.group.updateMatrixWorld(true);
    const pts = [];
    const box = (c, hx, hy, hz) => {
      for (let i = 0; i < 8; i++) pts.push(this.world.localToWorld(V(c.x + (i & 1 ? hx : -hx), c.y + (i & 2 ? hy : -hy), c.z + (i & 4 ? hz : -hz))));
    };
    box(V(0, this.eye + PROT.y, PROT.z), 0.235, 0.215, 0.2); // the protein
    box(this.hoverPos, 0.1, 0.09, 0.06); // the molecule above the pocket
    const bo = this.badgeOffset();
    for (let k = 0; k < 4; k++) {
      const home = this.slotPos(k);
      box(home, 0.062, 0.062, 0.03);
      box(home.clone().add(bo), 0.05, 0.04, 0);
    }
    const b3 = new THREE.Box3();
    for (const o of this.ui.children) {
      if (!o.visible) continue;
      b3.setFromObject(o);
      if (b3.isEmpty()) continue;
      for (let i = 0; i < 8; i++) pts.push(V(i & 1 ? b3.max.x : b3.min.x, i & 2 ? b3.max.y : b3.min.y, i & 4 ? b3.max.z : b3.min.z));
    }
    // The view direction, and everything turned into the camera's axes.
    const quat = new THREE.Quaternion().setFromRotationMatrix(_m.lookAt(V(0, this.desk ? VIEW_TILT.desk : VIEW_TILT.touch, 1), V(), V(0, 1, 0)));
    const inv = quat.clone().invert();
    const pr = pts.map((q) => q.applyQuaternion(inv));
    const tv = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const th = tv * (W / H);
    const m = 0.035;
    // The free part of the screen (NDC). Desktop: the status bar and the hints keep the top.
    const x0 = -1 + (2 * ins.left) / W + m;
    const x1 = 1 - (2 * ins.right) / W - m;
    const y0 = -1 + (2 * ins.bottom) / H + m;
    const y1 = this.desk ? 0.7 : 1 - (2 * ins.top) / H - m;
    let zMax = -Infinity;
    let zMin = Infinity;
    let cx = 0;
    let cy = 0;
    pr.forEach((q) => { zMax = Math.max(zMax, q.z); zMin = Math.min(zMin, q.z); cx += q.x / pr.length; cy += q.y / pr.length; });
    const zMid = (zMax + zMin) / 2;
    const span = (cz) => {
      let a = Infinity;
      let b = -Infinity;
      let c = Infinity;
      let d = -Infinity;
      for (const q of pr) {
        const z = cz - q.z;
        const nx = (q.x - cx) / (z * th);
        const ny = (q.y - cy) / (z * tv);
        a = Math.min(a, nx); b = Math.max(b, nx); c = Math.min(c, ny); d = Math.max(d, ny);
      }
      return [a, b, c, d];
    };
    // Does everything fit from this far away (with the view centered on the free part)?
    const fits = (cz) => {
      let r = null;
      for (let i = 0; i < 5; i++) {
        r = span(cz);
        cx += ((r[0] + r[1]) / 2 - (x0 + x1) / 2) * (cz - zMid) * th;
        cy += ((r[2] + r[3]) / 2 - (y0 + y1) / 2) * (cz - zMid) * tv;
      }
      r = span(cz);
      return r[1] - r[0] <= x1 - x0 + 0.004 && r[3] - r[2] <= y1 - y0 + 0.004;
    };
    let lo = zMax + 0.12;
    let hi = zMax + 9;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid; else lo = mid;
    }
    fits(hi);
    return { quat, pos: V(cx, cy, hi).applyQuaternion(quat), tv, th };
  }

  /** A panel pinned to the screen: its center at (nx, ny) in NDC, its width a share of the screen's. */
  pin(o, nx, ny, share, dist = 0.5, alignTop = false) {
    const v = this.view;
    const k = (share * 2 * v.th * dist) / o.w;
    const y = alignTop ? ny - (o.h * k) / (2 * v.tv * dist) : ny;
    o.position.set(nx * v.th * dist, y * v.tv * dist, -dist).applyQuaternion(v.quat).add(v.pos);
    this.group.worldToLocal(o.position);
    o.quaternion.copy(v.quat);
    o.scale.setScalar(k);
  }

  /** Desktop: the status bar (and a hint in its place) stay at the top of the screen. */
  pinHud() {
    const parts = this.hudParts ?? [];
    const total = parts.reduce((a, p) => a + p.o.w, 0) + 0.03 * Math.max(0, parts.length - 1);
    const share = Math.min(0.56, 620 / window.innerWidth); // of the screen's width
    let x = -share;
    for (const { o } of parts) {
      const w = (o.w / total) * share * 2;
      this.pin(o, x + w / 2, 0.86, (o.w / total) * share);
      x += w + (0.03 / total) * share * 2;
    }
    const tp = this.toastPanel;
    if (parts.length) parts[0].o.visible = !tp; // the hint takes the place of the status text
    if (tp && parts.length) {
      // A hint covers the status text (not the menu button) and may hang a little lower.
      const info = parts[0].o;
      const w = (info.w / total) * share;
      const top = 0.86 + (info.h * ((w * 2 * this.view.th) / info.w)) / (2 * this.view.tv);
      this.pin(tp, -share + w, top, w, 0.46, true);
    }
  }

  /** The 3D panels of the headset and the desktop (ranking, legend, fit meter, lab button, lab). */
  buildPanels(key, aspect = 1.5) {
    const { eye } = this;
    const compact = false;
    const ai = aiPanelSize(compact);
    this.aiPanel = new Panel(ai.w, ai.h, (ctx, c) => drawAIPanel(ctx, c, this.aiState()));
    const fs = fitPanelSize(compact);
    this.fitPanel = new Panel(fs.w, fs.h, (ctx, c) => drawFitPanel(ctx, c, this.fitState()));
    const ls = labPanelSize();
    this.labPanel = new Panel(ls.w, ls.h, (ctx, c) => drawLabPanel(ctx, c, { cand: this.labCand, k: this.labCand?.tested ? 1 : this.labK ?? 0, build: this.buildInfo() }));
    const lg = legendSize(compact);
    this.legend = new Panel(lg.w, lg.h, (ctx, c) => drawLegend(ctx, c, { compact }));
    this.ui.add(this.aiPanel, this.fitPanel, this.labPanel);
    if (this.legend) this.ui.add(this.legend);
    // Rows of the AI ranking can be picked (pointer, mouse); the keyboard uses the letter badges.
    this.rowHits = [0, 1, 2, 3].map((i) => {
      const R = AI_ROWS(compact);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(ai.w - 0.04, R.h), this.kit.hidden);
      m.position.set(0, ai.h / 2 - (R.y0 + R.h * i + R.h / 2), 0.002);
      m.userData.interactive = true;
      m.userData.focusable = false;
      m.userData.onClick = () => {
        const c = this.level && [...this.level.candidates].sort((a, b) => b.ai - a.ai)[i];
        if (!c) return;
        sfx.click();
        this.pick(c);
      };
      this.aiPanel.add(m);
      return m;
    });
    this.btnDock = new Button(0.36, 0.11, { label: t('dockBtnLab'), variant: 'primary', onClick: () => this.dock() });
    this.ui.add(this.btnDock);
    this.ui.scale.setScalar(1);
    this.ui.position.set(0, 0, 0);
    if (key === 'xr') {
      // Left: the AI's ranking; right beside the protein: the fit meter and the lab button,
      // above them the lab result. Everything within reach of a glance while docking.
      placeOnArc(this.aiPanel, -0.6, eye + 0.06, 1.0);
      if (this.legend) placeOnArc(this.legend, -0.6, eye + 0.06 + ai.h / 2 + 0.03 + lg.h / 2, 1.0);
      this.fitPanel.position.set(0.45, eye - 0.06, -0.84);
      this.fitPanel.rotation.y = -0.5;
      this.btnDock.position.set(0.44, eye - 0.06 - fs.h / 2 - 0.03 - this.btnDock.h / 2, -0.83);
      this.btnDock.rotation.y = -0.5;
      placeOnArc(this.labPanel, 0.64, eye + 0.25, 1.05);
    } else if (key === 'desk') {
      // The panels are scaled down around the protein (wide screens: less), so the protein and
      // the molecule are the big things on the screen and the text stays readable.
      const kMax = num('xr-dock-ui-scale') || 0.62;
      const K = clamp((0.86 * aspect - 0.55) / 1.44, kMax - 0.03, kMax + 0.1);
      const pv = V(0, eye + PROT.y, PROT.z); // the protein's center
      this.ui.scale.setScalar(K);
      this.ui.position.copy(pv).multiplyScalar(1 - K);
      // Placed in real meters from the protein's center (the group's scale is taken out again),
      // on one plane that faces the camera: they stand as clean, aligned rectangles on the screen.
      const lean = Math.atan(VIEW_TILT.desk);
      const put = (o, x, y) => {
        o.position.set(pv.x + x / K, pv.y + (y * Math.cos(lean)) / K, pv.z - (y * Math.sin(lean)) / K);
        o.rotation.x = -lean;
      };
      const gap = 0.02;
      const top = 0.275;
      const xl = -(0.275 + (ai.w * K) / 2);
      put(this.aiPanel, xl, top - (ai.h * K) / 2);
      put(this.legend, xl, top - ai.h * K - gap - (lg.h * K) / 2);
      const xr = 0.275 + (ls.w * K) / 2;
      let y = top;
      put(this.fitPanel, xr - ((ls.w - fs.w) * K) / 2, y - (fs.h * K) / 2);
      y -= fs.h * K + gap;
      put(this.btnDock, xr - ((ls.w - this.btnDock.w) * K) / 2, y - (this.btnDock.h * K) / 2);
      y -= this.btnDock.h * K + gap;
      put(this.labPanel, xr, y - (ls.h * K) / 2);
    }
  }

  /** The workshop's panel text in pockets 3 and 4 (instead of the waiting lab). */
  buildInfo() {
    const c = this.shop?.cand;
    if (!c) return null;
    return { est: c.ai, hint: t(this.dev('dockWorkshop')), tiles: this.desk };
  }

  /** Phones: what the screen strip shows (fit meter, ranking chips, lab result). */
  phoneState() {
    const f = this.fitState();
    const L = this.level;
    const chips = L && this.mode !== 'screen' ? [...L.candidates].sort((a, b) => b.ai - a.ai).map((c) => ({
      cand: c, letter: c.letter, ai: c.ai, top: c === L.top, own: c.kind === 'scaffold', active: c === this.active,
      tested: !!c.tested, ok: (c.lab ?? 0) >= PASS,
    })) : [];
    let lab = null;
    const c = this.labCand;
    if (c) {
      const done = !!c.tested;
      const value = done ? c.lab : Math.round(c.truth * Math.min(1, this.labK ?? 0));
      lab = { letter: c.letter, value, done, ok: done && c.lab >= PASS, ai: c.ai, verdict: !done ? '' : c.lab >= PASS ? t('dockLabStrong') : c.lab >= 34 ? t('dockLabWeak') : t('dockLabNone') };
    }
    const tok = Object.entries({ 'xr-dock-good': 'xr-dock-good', 'xr-dock-bad': 'xr-dock-bad', 'xr-dock-mid': 'xr-dock-mid' }).find(([, v]) => f.statusColor === color(v));
    const status = this.shop.building && this.shop.sel !== null ? t('dockStatusBuild') : f.status;
    return { fit: f.fit, good: f.good, bad: f.bad, special: f.special, status, statusToken: tok ? tok[0] : 'xr-panel-muted', chips, lab, note: this.note ?? null };
  }

  aiState() {
    return { level: this.level, screenK: this.mode === 'screen' ? this.screenK : 1, shown: this.mode === 'screen' ? this.shown : 1, active: this.active, compact: this.layoutKey === 'port' || this.layoutKey === 'land', locale: getLang() === 'de' ? 'de-DE' : 'en-US' };
  }

  fitState() {
    const o = this.fitOut;
    const c = this.active;
    const compact = this.layoutKey === 'port' || this.layoutKey === 'land';
    const fit = o.fit ?? 0;
    let status = t(this.isXR ? 'dockStatusPickXR' : 'dockStatusPick');
    let tok = 'xr-panel-muted';
    if (c && c.s === 'done') { status = t('dockLabStrong'); tok = 'xr-dock-good'; } else if (c && (c.s === 'active' || c.s === 'lab')) {
      const turn = t(this.isXR ? 'dockStatusTurnXR' : 'dockStatusTurn');
      if (this.flat && !this.snapped) {
        // Still hovering: how close the turn is.
        const near = c.pose.quat.angleTo(this.idealQuat) < this.tol * 1.6;
        status = near ? t('dockStatusClose') : turn;
        if (near) tok = 'xr-dock-mid';
      } else if (!this.near) status = turn;
      else if (this.snapped && fit >= FIT_MIN) { status = t('dockStatusLocked'); tok = 'xr-dock-good'; }
      else if ((o.clash ?? 0) > 0.3) { status = t('dockStatusClash'); tok = 'xr-dock-bad'; }
      else if (this.snapped) {
        // It sits, but not well enough: say what is wrong.
        status = t((o.bad ?? 0) > 0 ? 'dockStatusRepel' : 'dockStatusWeak');
        tok = (o.bad ?? 0) > 0 ? 'xr-dock-bad' : 'xr-dock-mid';
      } else if (fit >= 0.7) { status = t('dockStatusGood'); tok = 'xr-dock-good'; }
      else if (fit >= 0.35) { status = t('dockStatusClose'); tok = 'xr-dock-mid'; }
      else status = turn;
    }
    const n = this.level?.slots.filter((s) => s.spot).length ?? 0;
    return { fit: this.fitShown, shape: this.near ? o.shape ?? 0 : 0, good: this.near ? o.good ?? 0 : 0, bad: this.near ? o.bad ?? 0 : 0, special: n, status, statusColor: color(tok), locked: this.snapped, compact };
  }

  redrawAI() { this.aiPanel?.redraw(); }

  redrawFit() { this.fitPanel?.redraw(); }

  redrawLab() {
    if (!this.labPanel) return;
    // Headset and desktop keep the lab panel in place (waiting); phones show it only with a result.
    this.labPanel.visible = !!this.labCand || !this.touch;
    this.labPanel.redraw();
  }

  redrawAll() {
    this.redrawAI();
    this.redrawFit();
    this.redrawLab();
    this.legend?.redraw();
  }

  /** The lab button lights up only when the molecule sits in the pocket well enough. */
  labBtnState() {
    const b = this.btnDock;
    if (!b) return;
    const ok = this.mode === 'play' && !!this.active && (this.flat ? this.snapped : this.near) && (this.fitOut.fit ?? 0) >= FIT_MIN;
    b.set({ disabled: !ok });
  }

  /**
   * A short message, optionally with a second line. Headset: above the protein. Desktop: at the
   * top of the screen in place of the status text. Phones: in the screen strip. Never over the pocket.
   */
  toast(text, token, sub = null, secs = null) {
    const time = secs ?? (sub ? 3.6 : 2.2);
    if (this.touch) {
      const n = (this.note = { text, token, sub });
      this.delay(time, () => { if (this.note === n) this.note = null; });
      return;
    }
    if (this.toastPanel) { this.toastPanel.removeFromParent(); this.toastPanel.dispose(); }
    const size = this.desk ? 'xr-text-sm' : 'xr-text-md';
    const blocks = [{ text, size, weight: 'black', color: color(token), gap: sub ? 0.01 : 0 }];
    if (sub) blocks.push({ text: sub, size: 'xr-text-sm', color: color('xr-panel-text') });
    const p = this.add(textPanel(this.desk ? 0.98 : 0.66, this.desk ? 0.15 : 0.08, blocks, { surface: { stroke: color(token), strokeWidth: this.desk ? 0.006 : undefined }, layout: this.desk ? { pad: 0.03 } : undefined }));
    p.userData.noFit = true;
    if (this.desk) {
      // Pinned to the screen by pinHud(); drawn over everything.
      p.material.depthTest = false;
      p.renderOrder = 40;
      p.position.set(0, this.eye + 0.3, -0.6);
    } else p.position.set(0, this.eye + 0.2, -0.95);
    if (this.calm || this.desk) p.redraw(); else this.popIn(p);
    this.toastPanel = p;
    this.delay(time, () => { if (this.toastPanel === p) { p.removeFromParent(); p.dispose(); this.toastPanel = null; } });
  }

  dispose() {
    this.mode = 'over';
    this.drag = null;
    this.showRay();
    this.app.echo?.suppress(false);
    this.engine.fitEnabled = true;
    if (!this.isXR) this.engine.camera.rotation.set(0, 0, 0);
    super.dispose();
  }
}
