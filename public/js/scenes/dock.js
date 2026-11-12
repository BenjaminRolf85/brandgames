// "Andock-Labor" (Docking Lab): molecular docking at a lab bench. A protein floats above the
// bench with a pocket whose colored contact spots want the right atoms (opposites attract). An AI
// has screened a library of thousands of molecules and ranks its top four candidates with a
// predicted fit. You pick a candidate and turn and push it into the pocket (in the headset with
// your hand, 6DoF; on desktop by dragging; on phones by swiping and "To pocket"). A live fit
// meter and glowing atoms guide you; close to the right pose the pocket pulls the molecule in.
// Then off to the lab: an animated assay measures the real binding. Usually the AI's top pick
// holds, but in one pocket per round it fails in the lab for a reason the AI could not see,
// so you learn: predictions are probabilities, the lab confirms.
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
import '../dock-text.js';
import { makeRound, Protein, evaluateFit, PASS, designTruth } from '../dock-chem.js';
import { Workshop } from '../dock-workshop.js';
import { phoneStrip, enlargePad } from '../dock-phone.js';
import {
  makeKit, MoleculeView, proteinMaterial, makeSpotMarkers, makeScreening, makeWells, loadBench, fallbackDeck,
  mergeStatic, contactShadows, skyDome,
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
const CAPTURE = 0.06; // the pocket pulls a molecule in within this distance ...
const TOL = { xr: 42, desk: 48, touch: 58 }; // ... and this angle (degrees) of the right pose
const IN_POCKET = 0.035;
const FIT_MIN = 0.5; // fit needed to send a molecule to the lab
const HINT_T = [12, 24, 55, 55]; // seconds until the AI's pose (pockets 3, 4: the finished design) is shown
const PTS = { fit: 400, speed: 450, fast: 12, slow: 72, tests: [250, 120, 40, 0] }; // per pocket (max 1100)
// Pockets 3 and 4 (your own design): more time for building, plus points for the design (max 1300).
// A perfect round: 2 x 1100 + 2 x 1300 = 4800.
const PTS_DESIGN = { fit: 400, speed: 450, fast: 25, slow: 120, tests: [250, 120, 40, 0], design: 200 };
const LAB_TIME = 3.6;
const clamp = THREE.MathUtils.clamp;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _m = new THREE.Matrix4();
const _m2 = new THREE.Matrix4();
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
    this.tol = THREE.MathUtils.degToRad(this.isXR ? TOL.xr : this.touch ? TOL.touch : TOL.desk);
    this.buildLab();
    this.setupInput();
    this.shop = new Workshop(this);
    if (this.touch) {
      this.strip = phoneStrip({ onPick: (c) => { if (c?.s === 'tray') { sfx.click(); this.pick(c); } } });
      this.onSceneDispose(() => this.strip.remove());
    }
    // The round is drawn now, so the first protein can be built in the background during the intro.
    this.round = makeRound(LEVELS);
    this.builds = [];
    this.onUpdate((dt) => this.update(dt));
    const hint = t(this.isXR ? 'dockIntroXR' : this.touch ? 'dockIntroTouch' : 'dockIntroScreen');
    this.intro(t('dockName'), `${t('dockIntro')} ${hint}`, () => this.start());
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
    const bench = (this.bench = new THREE.Group());
    bench.position.set(0, eye - BENCH_DROP, 0);
    bench.userData.noFit = this.touch; // phones frame the panels and the protein, the bench is backdrop
    this.world.add(bench);
    this.deck = fallbackDeck(1.28, 0.54);
    this.deck.position.z = BENCH_Z;
    bench.add(this.deck);
    loadBench().then((parts) => this.placeBench(parts)).catch((e) => console.warn('dock bench', e));

    // Holo emitter light cone under the protein, soft shadows on the bench.
    const coneH = BENCH_DROP + PROT.y - 0.2;
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
    // An invisible box over the tray, so phones frame the candidates too.
    this.trayFit = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.1, 0.1), this.kit.hidden);
    this.trayFit.visible = false; // placed by layout() on phones
    this.world.add(this.trayFit);
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
    // Desktop: drag rotates, right button or Shift drags move, the wheel brings it closer.
    if (!this.isXR && !this.touch) {
      const down = (ev) => {
        if (this.mode !== 'play' || !this.active || this.active.s !== 'active' || this.snapTween) return;
        const hov = e.mouse.hovered;
        if (hov && hov.userData.interactive && hov !== this.active.view.proxy) return;
        this.drag = { x: ev.clientX, y: ev.clientY, id: ev.pointerId, move: ev.button === 2 || ev.shiftKey };
        this.unsnap();
      };
      const move = (ev) => {
        const d = this.drag;
        if (!d || ev.pointerId !== d.id) return;
        const dx = ev.clientX - d.x;
        const dy = d.y - ev.clientY;
        d.x = ev.clientX;
        d.y = ev.clientY;
        if (d.move || ev.shiftKey) this.moveBy(dx, dy);
        else this.rotateBy(dx, dy);
      };
      const up = (ev) => { if (this.drag && ev.pointerId === this.drag.id) this.drag = null; };
      const wheel = (ev) => {
        if (this.mode !== 'play' || !this.active || this.active.s !== 'active') return;
        ev.preventDefault();
        this.unsnap();
        const cam = e.camera;
        const fwd = V(0, 0, -1).applyQuaternion(cam.getWorldQuaternion(_q)).applyQuaternion(this.worldQuatInv());
        this.active.pose.pos.addScaledVector(fwd, clamp(-ev.deltaY, -120, 120) * 0.00045);
        this.clampPose(this.active);
      };
      const menu = (ev) => ev.preventDefault();
      canvas.addEventListener('pointerdown', down);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      canvas.addEventListener('wheel', wheel, { passive: false });
      canvas.addEventListener('contextmenu', menu);
      this.onSceneDispose(() => {
        canvas.removeEventListener('pointerdown', down);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        canvas.removeEventListener('wheel', wheel);
        canvas.removeEventListener('contextmenu', menu);
      });
    }
    // Phones: one finger turns the molecule (relative, like a trackball).
    if (this.touch) {
      this.swipe = this.dragPad({
        hint: t('dockSwipe'),
        enabled: () => this.mode === 'play' && !!this.active && this.active.s === 'active' && !this.snapTween,
        onStart: () => { this.swipeLast = [0, 0]; this.unsnap(); this.swiped = true; this.dragging = true; },
        onMove: (dx, dy) => {
          const [lx, ly] = this.swipeLast;
          this.swipeLast = [dx, dy];
          this.rotateBy(dx - lx, dy - ly);
        },
        onEnd: () => { this.dragging = false; },
      });
      this.pad = this.touchButtons([
        { icon: 'review', label: t('dockBtnNext'), onPress: () => this.pickNext() },
        { icon: 'duck', label: t('dockBtnSnap'), onPress: () => this.snapToPocket() },
        { icon: 'lab', label: t('dockBtnDock'), primary: true, onPress: () => this.dock() },
      ]);
      enlargePad();
    }
    // Keyboard: 1 to 4 pick, F to the pocket, Space or Enter dock, arrows and Q/E turn, R back.
    this.onKey = (ev) => {
      if (this.mode !== 'play' || this.isXR) return;
      const k = ev.key;
      if (this.shop.key(k)) { ev.preventDefault(); return; }
      const step = THREE.MathUtils.degToRad(15);
      let handled = true;
      if (k >= '1' && k <= '4') this.pick(this.level?.candidates[Number(k) - 1]);
      else if (k === 'f' || k === 'F') this.snapToPocket();
      else if (k === ' ' || k === 'Enter') this.dock();
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

  /** Moves the active molecule in the screen plane (desktop: right button or Shift). */
  moveBy(dx, dy) {
    const c = this.active;
    if (!c || c.s !== 'active') return;
    const cam = this.engine.camera;
    const camQ = cam.getWorldQuaternion(new THREE.Quaternion());
    const inv = this.worldQuatInv();
    const wp = this.world.localToWorld(c.pose.pos.clone());
    const dist = wp.distanceTo(cam.getWorldPosition(_v));
    const s = (2 * dist * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))) / window.innerHeight;
    c.pose.pos.addScaledVector(V(1, 0, 0).applyQuaternion(camQ).applyQuaternion(inv), dx * s);
    c.pose.pos.addScaledVector(V(0, 1, 0).applyQuaternion(camQ).applyQuaternion(inv), dy * s);
    this.clampPose(c);
  }

  /** Keeps a molecule near the protein (it cannot get lost behind the camera). */
  clampPose(c) {
    const ideal = this.idealPos;
    if (!ideal) return;
    const d = c.pose.pos.clone().sub(ideal);
    if (d.length() > 0.42) c.pose.pos.copy(ideal).addScaledVector(d.normalize(), 0.42);
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
    Object.assign(this, { score: 0, playT: 0, li: -1, solved: 0, tests: 0, tipsTested: 0, tipsHit: 0, levelLog: [] });
    this.refreshHud ??= this.hud(() => this.hudText());
    this.layoutKey = null;
    this.nextLevel();
  }

  hudText() {
    const left = Math.max(0, Math.ceil(ROUND_TIME - (this.playT ?? 0)));
    const time = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    return t('dockHud', { name: t('dockName'), n: Math.min(LEVELS, (this.li ?? 0) + 1), total: LEVELS, time, score: this.score ?? 0 });
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
    this.markers = makeSpotMarkers(L.slots);
    F.add(this.markers);
    this.prot.updateMatrix();
    this.Fw = new THREE.Matrix4().multiplyMatrices(this.prot.matrix, this.protein.F);
    this.FwInv = this.Fw.clone().invert();
    this.idealPos = V().copy(L.c0).applyMatrix4(this.Fw);
    this.idealQuat = new THREE.Quaternion().setFromRotationMatrix(this.Fw);
    this.pocketOut = V(0, 0, 1).applyQuaternion(this.idealQuat);
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
    this.toast(t(L.design ? 'dockDesignTitle' : 'dockLevelTitle', { n: i + 1, name: t(L.key) }), L.design ? 'xr-dock-you' : 'xr-dock-ai');
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
    c.trayScale = Math.min(this.touch ? 0.78 : 0.62, (this.touch ? 0.06 : TRAY.size) / c.mol.radius);
    const proxy = v.proxy;
    proxy.userData.interactive = true;
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
    const from = this.aiPanel ? this.aiPanel.position.clone() : V(-0.8, this.eye, -1);
    const tray = this.level.candidates.map((c, k) => this.slotPos(k));
    // Point size in framebuffer pixels for about 9 mm at 1 m.
    const size = this.isXR ? 8 : 0.0078 * window.innerHeight * this.engine.renderer.getPixelRatio();
    this.screening.userData.run(from, this.idealPos.clone(), tray, size);
  }

  updateScreen(dt) {
    this.screenT += dt;
    const T = this.screenT;
    const u = this.protMat.userData.u;
    u.uReveal.value = -0.3 + 0.62 * clamp(T / 1.5, 0, 1);
    u.uEdge.value = clamp((1.8 - T) / 0.4, 0, 1);
    const k = clamp(T / 1.7, 0, 1);
    // The counter runs up (redrawn a dozen times a second: the canvas upload is not free).
    if (k !== this.screenK && (k === 1 || T - (this.aiDrawT ?? -1) > 0.08)) { this.screenK = k; this.aiDrawT = T; this.redrawAI(); }
    if (T > 1.7) {
      const s = clamp((T - 1.7) / 0.6, 0, 1);
      if (s !== this.shown) { this.shown = s; this.redrawAI(); }
    }
    // The candidates land on the tray as their sparks arrive.
    this.level.candidates.forEach((c, k2) => {
      if (c.s === 'hidden' && T > 1.55 + k2 * 0.12) {
        c.s = 'tray';
        c.view.group.visible = true;
        c.pose.pos.copy(this.slotPos(k2));
        sfx.tink();
      }
    });
    if (T > 2.4) {
      this.mode = 'play';
      u.uEdge.value = 0;
      u.uReveal.value = 1;
      this.redrawFit();
    }
  }

  /** Where candidate k waits (on the tray; on phones in a row below the protein). */
  slotPos(k) {
    const off = (k - 1.5);
    if (this.touch) {
      const port = this.layoutKey === 'port';
      return V(off * (port ? 0.15 : 0.135), this.eye + PROT.y - 0.29, PROT.z + 0.08);
    }
    return V(TRAY.x + off * TRAY.gap, this.eye - BENCH_DROP + TRAY.lift, TRAY.z);
  }

  /** Picks a candidate (desktop and phones): it flies from the tray in front of the pocket. */
  pick(c) {
    if (!c || this.mode !== 'play' || c.s !== 'tray') return;
    if (this.active && this.active !== c) this.putBack();
    this.activate(c);
    // In front of the pocket, turned away from the right pose so there is something to do.
    const to = this.idealPos.clone().addScaledVector(this.pocketOut, 0.13);
    const axis = V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    const ang = THREE.MathUtils.degToRad(this.li === 0 ? 55 + Math.random() * 25 : 75 + Math.random() * 50);
    const toQ = this.idealQuat.clone().premultiply(new THREE.Quaternion().setFromAxisAngle(axis, ang));
    const fromP = c.pose.pos.clone();
    const fromQ = c.pose.quat.clone();
    this.snapTween = true;
    this.tween(0.45, (k) => {
      c.pose.pos.lerpVectors(fromP, to, k);
      c.pose.pos.y += Math.sin(k * Math.PI) * 0.06;
      c.pose.quat.slerpQuaternions(fromQ, toQ, k);
    }, { onDone: () => { this.snapTween = false; } });
    sfx.grab();
  }

  activate(c) {
    this.active = c;
    c.s = 'active';
    this.snapped = false;
    this.removeGhost();
    this.redrawAI();
  }

  /** The next candidate on the tray (phones). */
  pickNext() {
    if (this.mode !== 'play' || !this.level) return;
    const list = this.level.candidates;
    const start = this.active ? list.indexOf(this.active) : -1;
    for (let k = 1; k <= list.length; k++) {
      const c = list[(start + k) % list.length];
      if (c.s === 'tray') { this.pick(c); return; }
    }
  }

  /** The active molecule goes back to its place on the tray. */
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
    c.homing = true;
    this.tween(0.5, (k) => {
      c.pose.pos.lerpVectors(fromP, to, k);
      c.pose.pos.y += Math.sin(k * Math.PI) * 0.05;
    }, { onDone: () => { c.homing = false; } });
  }

  /** "To pocket": moves the molecule right in front of the pocket mouth (turning stays yours). */
  snapToPocket() {
    if (this.mode !== 'play') return;
    const c = this.active;
    if (!c) { this.pickNext(); return; }
    if (c.s !== 'active' || this.snapTween) return;
    this.unsnap();
    const from = c.pose.pos.clone();
    const to = this.idealPos.clone().addScaledVector(this.pocketOut, 0.028);
    this.snapTween = true;
    this.tween(0.35, (k) => c.pose.pos.lerpVectors(from, to, k), { onDone: () => { this.snapTween = false; } });
    sfx.whoosh();
  }

  unsnap() {
    if (this.snapped) this.snapped = false;
  }

  /** Lock in and send to the lab, if it fits well enough. */
  dock() {
    if (this.mode !== 'play') return;
    const c = this.active;
    if (!c) { this.toast(t('dockNeedMol'), 'xr-dock-mid'); sfx.wrong(); return; }
    const inPocket = c.view.group.position.distanceTo(this.idealPos) < IN_POCKET;
    if (!inPocket) { this.toast(t('dockNeedPocket'), 'xr-dock-mid'); sfx.wrong(); return; }
    if ((this.fitOut.fit ?? 0) < FIT_MIN) { this.toast(t('dockNeedFit'), 'xr-dock-bad'); sfx.wrong(); return; }
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
    this.delay(0.35, () => {
      if (this.disposed) return;
      sfx.whoosh();
      this.tween(0.7, (k) => {
        curve.getPoint(k, mini.group.position);
        mini.group.scale.setScalar(0.3 * (1 - 0.7 * k * k));
        mini.group.rotation.y += 0.15;
      }, { ease: (k) => k * k * (3 - 2 * k), onDone: () => { mini.group.removeFromParent(); mini.dispose(); sfx.tink(); } });
    });
  }

  updateLab(dt) {
    this.labT += dt;
    const c = this.labCand;
    const k = clamp((this.labT - 1.1) / 1.7, 0, 1);
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
    const P = L.design ? PTS_DESIGN : PTS;
    const speed = Math.round(P.speed * clamp((P.slow - L.t) / (P.slow - P.fast), 0, 1));
    const fitPts = Math.round(P.fit * clamp(c.fit, 0, 1));
    const testPts = P.tests[Math.min(P.tests.length - 1, L.tests - 1)];
    const pts = fitPts + speed + testPts + (L.design && c.kind === 'scaffold' ? P.design : 0);
    this.score += pts;
    this.levelLog.push({ level: L.idx, fit: c.fit, time: Math.round(L.t), tests: L.tests, pts });
    sfx.powerup();
    this.delay(0.15, () => { if (!this.disposed) sfx.correct(); });
    this.burst(this.world.localToWorld(this.idealPos.clone()), 'xr-dock-good', 40);
    this.ringFlash(this.idealPos, 'xr-dock-good');
    this.toast(t('dockSolved', { n: pts }), 'xr-dock-good', t(c.why));
    this.mode = 'solved';
    this.refreshHud?.();
    this.delay(2.6, () => {
      if (this.disposed || this.mode === 'over') return;
      if (this.li + 1 >= LEVELS) this.finish();
      else this.nextLevel();
    });
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
    this.toast(top ? t('dockLabSurprise') : `${own ? t('dockOwn') : t('dockCandidate', { c: c.letter })}: ${verdict}`, 'xr-dock-bad', t(c.why));
    if (!own) this.flyHome(c);
    this.mode = 'play';
    this.redrawFit();
    // Phones: the result lies over the protein; it goes when you carry on.
    if (this.touch) this.delay(3.4, () => { if (!this.disposed && this.labCand === c && this.mode === 'play') { this.labCand = null; this.redrawLab(); } });
  }

  finish() {
    if (this.mode === 'over') return;
    this.mode = 'over';
    this.app.echo?.suppress(false);
    this.clearCandidates();
    this.removeGhost();
    this.ui.visible = false;
    this.prot.visible = false;
    this.screening.visible = false;
    this.cone.visible = false;
    this.toastPanel = null;
    this.engine.fitEnabled = true;
    if (!this.isXR) this.engine.camera.rotation.set(0, 0, 0);
    const learned = [
      { q: t('dockLearnQ1'), a: t('dockLearnA1') },
      { q: t('dockLearnQ2'), a: t('dockLearnA2') },
      { q: t('dockLearnQ4'), a: t('dockLearnA4') },
    ];
    const parts = [t('dockLine', { solved: this.solved, total: LEVELS, tests: this.tests })];
    if (this.tipsTested) parts.push(t('dockLineAI', { hits: this.tipsHit, tips: this.tipsTested }));
    if (this.solved < LEVELS) parts.unshift(t('dockTimeUp'));
    const line = parts.join(' · ');
    this.results({ gameKey: 'dock', score: Math.min(5000, this.score), correct: this.solved, total: LEVELS, line, learned, onAgain: () => this.app.startGame('dock') });
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
      if (this.playT >= ROUND_TIME) { this.finish(); return; }
      const L = this.level;
      if (!this.ghost && !this.snapped && L.t > HINT_T[Math.min(this.li, HINT_T.length - 1)]) {
        const c = this.active ?? L.top;
        if (c && c.s !== 'failed') {
          this.showGhost(c);
          if (!L.hinted) { L.hinted = true; this.toast(t('dockGhost'), 'xr-dock-ghost'); }
        }
      }
      if (this.ghost && this.active && this.ghost.cand !== this.active) this.showGhost(this.active);
      music.intensity = ROUND_TIME - this.playT < 30 ? 2 : 1;
    }
    if (this.mode === 'lab') this.updateLab(dt);
    this.updateTray(dt);
    this.updateActive(dt);
    if (this.ghost) this.ghost.view.glow.material.uniforms.uBoost.value = 0.35 + 0.25 * Math.sin(this.time * 4);
    // Screening stream.
    const su = this.screening.userData.u;
    if (this.screening.visible) {
      su.uT.value += dt;
      if (su.uT.value > 1.9) su.uFade.value = Math.max(0, su.uFade.value - dt * 3);
      if (su.uFade.value <= 0) this.screening.visible = false;
    }
    this.markers?.userData.tick(this.active && this.near ? this.fitOut.spot : null, this.time, this.mode === 'screen' ? clamp(this.screenT - 1, 0, 1) : 1);
    this.bulbs?.userData.tick(this.time);
    this.cone.material.opacity = 0.06 + 0.025 * Math.sin(this.time * 2.2);
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
    if (!this.isXR && !this.touch) this.deskCamera(dt);
    const atomPad = this.shop.update(dt, this.time);
    const live = this.mode === 'play' || this.mode === 'lab' || this.mode === 'screen' || this.mode === 'solved' || this.mode === 'switch';
    this.pad?.show(live && !atomPad);
    this.swipe?.show(this.mode === 'play' && !!this.active && !this.swiped && !atomPad);
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
        if (!c.homing && c.s !== 'hidden') {
          c.pose.pos.lerp(_v.copy(home).setY(home.y + Math.sin(this.time * 1.6 + c.slot) * 0.005), Math.min(1, dt * 6));
        }
        // Facing you, tilted up a little, gently swaying (so its shape reads at a glance).
        c.spin += dt * 0.7;
        c.pose.quat.setFromEuler(new THREE.Euler(this.touch ? -0.15 : -0.55, Math.sin(c.spin) * (c.s === 'failed' ? 0.2 : 0.6), 0));
      }
      if (c.badge) {
        c.badge.position.copy(home).add(this.touch ? V(0, -0.085, 0.01) : V(0, -TRAY.lift + 0.022, 0.058));
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

  /** The candidate's letter at its place (with the AI's star, and the lab's check or cross). */
  makeBadge(c) {
    const b = new Panel(0.064, 0.05, (ctx, p) => {
      const top = c === this.level?.top;
      const done = c.tested;
      const ok = done && c.lab >= PASS;
      p.surface({ fill: color('xr-panel-bg'), stroke: color(done ? (ok ? 'xr-dock-good' : 'xr-dock-bad') : top ? 'xr-warning' : 'xr-panel-border'), radius: 0.012, stripe: false });
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = font('black', p.m(0.034));
      ctx.fillStyle = color(done ? (ok ? 'xr-dock-good' : 'xr-dock-bad') : 'xr-panel-text');
      ctx.fillText(c.letter, p.canvas.width / 2, p.canvas.height * 0.54);
    });
    if (this.touch) b.scale.setScalar(1.5); // phones: big enough to read and to tap
    b.userData.interactive = true;
    b.userData.label = c.kind === 'scaffold' ? t('dockOwn') : t('dockCandidate', { c: c.letter });
    b.userData.onClick = () => this.pick(c);
    b.userData.setHover = (v) => { c.hover = v; };
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
    // Fit and glow (only near the pocket).
    this.near = pos.distanceTo(ideal) < 0.14;
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
      g.updateMatrix();
      const rel = _m.multiplyMatrices(this.FwInv, g.matrix);
      // The molecule frame is scaled while it grows from the tray; measure the real pose.
      rel.scale(_v.setScalar(1 / Math.max(0.001, c.scale)));
      const prevGood = this.fitOut.good ?? 0;
      const prevClash = (this.fitOut.clash ?? 0) > 0.3;
      evaluateFit(this.protein, c.mol, rel, this.fitOut);
      if (this.fitOut.good > prevGood) { sfx.tink(); this.engine.haptic(this.hand, 0.3, 25); }
      if (this.fitOut.clash > 0.3 && !prevClash) this.engine.haptic(this.hand, 0.7, 60);
    }
    const out = this.fitOut;
    this.fitShown += ((out.fit ?? 0) - this.fitShown) * Math.min(1, dt * 8);
    const good = (this.goodCol ??= new THREE.Color(hex('xr-dock-good')));
    const bad = (this.badCol ??= new THREE.Color(hex('xr-dock-bad')));
    const flick = 0.75 + 0.25 * Math.sin(this.time * 16);
    const lab = c.s === 'lab';
    for (let i = 0; i < c.mol.atoms.length; i++) {
      const st = out.atom?.[i];
      if (lab) view.setGlow(i, good, 0.15 + 0.12 * Math.sin(this.time * 8 + i));
      else if (st === 'contact') view.setGlow(i, good, 0.55);
      else if (st === 'good') view.setGlow(i, good, 0.035);
      else if (st === 'bad') view.setGlow(i, bad, flick * (0.5 + 0.35 * (out.pen?.[i] ?? 0)));
      else view.setGlow(i, good, 0);
    }
    view.flush();
  }

  onSnap() {
    sfx.correct();
    this.engine.haptic(this.hand, 0.8, 90);
    this.ringFlash(this.idealPos, (this.fitOut.fit ?? 0) >= FIT_MIN ? 'xr-dock-good' : 'xr-dock-mid');
    this.removeGhost();
    // The scaffold sits in the pocket: the first free attachment point is ready for an atom.
    if (this.active?.kind === 'scaffold' && this.shop.sel === null) this.shop.select(this.shop.nextEmpty());
  }

  /** A ring of light that widens around the pocket. */
  ringFlash(at, token) {
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
   * meter above the protein); on desktop flat beside the protein; on phones compact (upright: AI
   * on top, fit meter above the protein, candidates below; landscape: AI left).
   */
  layout() {
    const e = this.engine;
    const key = this.isXR ? 'xr' : this.touch ? (window.innerWidth < window.innerHeight ? 'port' : 'land') : 'desk';
    if (key === this.layoutKey || this.mode === 'intro') return;
    this.layoutKey = key;
    const { eye } = this;
    const compact = key === 'port' || key === 'land';
    // Rebuild the panels (sizes differ between full and compact).
    [...this.ui.children].forEach((o) => { o.removeFromParent(); disposeOwn(o); });
    // Phones: the ranking, the fit meter and the lab result are a readable strip on the screen
    // (dock-phone.js); the 3D view keeps the protein and the candidates, large.
    this.aiPanel = this.fitPanel = this.labPanel = this.legend = null;
    this.rowHits = [];
    this.btnSnap = null;
    this.btnDock = null;
    if (!compact) this.buildPanels(key);
    // Phones frame panels, protein and the candidates; the bench is only backdrop.
    this.bench.userData.noFit = compact;
    this.bench.visible = !compact;
    if (this.parts?.DockTray) this.parts.DockTray.visible = !compact;
    const tp = this.slotPos(0).add(this.slotPos(3)).multiplyScalar(0.5);
    this.trayFit.position.copy(tp);
    this.trayFit.scale.set(compact ? 1.25 : 1, 1, 1);
    this.trayFit.visible = compact;
    this.redrawAll();
  }

  /**
   * Desktop: a camera a little above the bench looking down at it, pulled back just enough that
   * the panels, the status bar and the bench fit (found by projecting their corners).
   */
  deskCamera(dt) {
    const e = this.engine;
    const cam = e.camera;
    const playing = this.layoutKey === 'desk' && this.mode !== 'intro' && this.mode !== 'over';
    e.fitEnabled = !playing;
    if (!playing) return;
    if (!this.deskView || this.deskView.aspect !== cam.aspect || this.deskView.key !== this.layoutKey) {
      const box = new THREE.Box3();
      const pts = [];
      const add = (o) => {
        if (!o || !o.visible) return;
        box.setFromObject(o);
        if (box.isEmpty()) return;
        for (let i = 0; i < 8; i++) pts.push(V(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
      };
      this.ui.children.forEach(add);
      this.group.children.filter((o) => o.userData.hud).forEach(add);
      add(this.deckProxy);
      const all = new THREE.Box3().setFromPoints(pts);
      const center = all.getCenter(V());
      center.x = this.group.localToWorld(V()).x;
      const dir = V(0, 0.3, 1).normalize();
      const saved = { p: cam.position.clone(), q: cam.quaternion.clone() };
      let lo = 0.4;
      let hi = 8;
      for (let i = 0; i < 26; i++) {
        const d = (lo + hi) / 2;
        cam.position.copy(center).addScaledVector(dir, d);
        cam.lookAt(center);
        cam.updateMatrixWorld();
        const ok = pts.every((q) => { const v = q.clone().project(cam); return Math.abs(v.x) < 0.96 && Math.abs(v.y) < 0.93 && v.z < 1; });
        if (ok) hi = d; else lo = d;
      }
      cam.position.copy(saved.p);
      cam.quaternion.copy(saved.q);
      this.deskView = { aspect: cam.aspect, key: this.layoutKey, pos: center.clone().addScaledVector(dir, hi), target: center };
      if (!this.deskInit) { this.deskInit = true; cam.position.copy(this.deskView.pos); }
    }
    cam.position.lerp(this.deskView.pos, Math.min(1, dt * 5));
    cam.lookAt(this.deskView.target);
  }

  /** The 3D panels of the headset and the desktop (ranking, legend, fit meter, buttons, lab). */
  buildPanels(key) {
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
    // Rows of the AI ranking can be picked (pointer, mouse, finger).
    this.rowHits = [0, 1, 2, 3].map((i) => {
      const R = AI_ROWS(compact);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(ai.w - 0.04, R.h), this.kit.hidden);
      m.position.set(0, ai.h / 2 - (R.y0 + R.h * i + R.h / 2), 0.002);
      m.userData.interactive = true;
      m.userData.onClick = () => {
        const c = this.level && [...this.level.candidates].sort((a, b) => b.ai - a.ai)[i];
        if (!c) return;
        sfx.click();
        this.pick(c);
      };
      this.aiPanel.add(m);
      return m;
    });
    // Buttons (desktop: to the pocket and dock; headset: to the lab).
    if (!this.touch) {
      this.btnDock = new Button(this.isXR ? 0.36 : 0.27, 0.11, { label: t(this.isXR ? 'dockBtnLab' : 'dockBtnDock'), variant: 'primary', onClick: () => this.dock() });
      this.ui.add(this.btnDock);
      if (!this.isXR) {
        this.btnSnap = new Button(0.25, 0.11, { label: t('dockBtnSnap'), onClick: () => this.snapToPocket() });
        this.ui.add(this.btnSnap);
      }
    }
    const pz = -0.95;
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
      this.aiPanel.position.set(-0.76, eye + 0.1, pz);
      this.legend.position.set(-0.76, eye + 0.1 - ai.h / 2 - 0.03 - lg.h / 2, pz);
      this.fitPanel.position.set(0.7, eye + 0.31, pz);
      const by = eye + 0.31 - fs.h / 2 - 0.03 - 0.055;
      this.btnSnap.position.set(0.7 - 0.14, by, pz);
      this.btnDock.position.set(0.7 + 0.14, by, pz);
      this.labPanel.position.set(0.7, by - 0.055 - 0.03 - ls.h / 2, pz);
    }
  }

  /** The workshop's panel text in pockets 3 and 4 (instead of the waiting lab). */
  buildInfo() {
    const c = this.shop?.cand;
    if (!c) return null;
    return { est: c.ai, hint: t(this.isXR ? 'dockWorkshopXR' : 'dockWorkshopScreen') };
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
    return { fit: f.fit, good: f.good, bad: f.bad, special: f.special, status, statusToken: tok ? tok[0] : 'xr-panel-muted', chips, lab };
  }

  aiState() {
    return { level: this.level, screenK: this.mode === 'screen' ? this.screenK : 1, shown: this.mode === 'screen' ? this.shown : 1, active: this.active, compact: this.layoutKey === 'port' || this.layoutKey === 'land', locale: getLang() === 'de' ? 'de-DE' : 'en-US' };
  }

  fitState() {
    const o = this.fitOut;
    const c = this.active;
    const compact = this.layoutKey === 'port' || this.layoutKey === 'land';
    let status = t(this.isXR ? 'dockStatusPickXR' : 'dockStatusPick');
    let tok = 'xr-panel-muted';
    if (c && c.s === 'done') { status = t('dockLabStrong'); tok = 'xr-dock-good'; } else if (c && (c.s === 'active' || c.s === 'lab')) {
      if (!this.near) status = t('dockStatusTurn');
      else if ((o.clash ?? 0) > 0.3) { status = t('dockStatusClash'); tok = 'xr-dock-bad'; }
      else if (this.snapped) { status = t('dockStatusLocked'); tok = (o.fit ?? 0) >= FIT_MIN ? 'xr-dock-good' : 'xr-dock-mid'; }
      else if ((o.fit ?? 0) >= 0.7) { status = t('dockStatusGood'); tok = 'xr-dock-good'; }
      else if ((o.fit ?? 0) >= 0.35) { status = t('dockStatusClose'); tok = 'xr-dock-mid'; }
      else status = t('dockStatusTurn');
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
    const ok = this.mode === 'play' && !!this.active && this.near && (this.fitOut.fit ?? 0) >= FIT_MIN;
    b.set({ disabled: !ok });
  }

  /** A short message: above the protein (on phones over it), optionally with a second line. */
  toast(text, token, sub = null) {
    this.toastPanel?.removeFromParent();
    const blocks = [{ text, size: 'xr-text-md', weight: 'black', color: color(token), gap: sub ? 0.01 : 0 }];
    if (sub) blocks.push({ text: sub, size: 'xr-text-sm', color: color('xr-panel-text') });
    const p = this.add(textPanel(0.66, 0.08, blocks, { surface: { stroke: color(token) } }));
    p.userData.noFit = true;
    const k = this.layoutKey;
    if (k === 'port' || k === 'land') {
      p.position.set(0, this.eye + 0.02, -0.52);
      p.material.depthTest = false;
      p.renderOrder = 30;
    } else if (k === 'xr') p.position.set(0, this.eye + 0.2, -0.95);
    else p.position.set(0, this.eye + 0.19, -0.78);
    this.popIn(p);
    this.toastPanel = p;
    this.delay(sub ? 3.6 : 1.8, () => { if (this.toastPanel === p) { p.removeFromParent(); p.dispose(); this.toastPanel = null; } });
  }

  dispose() {
    this.mode = 'over';
    this.showRay();
    this.app.echo?.suppress(false);
    this.engine.fitEnabled = true;
    if (!this.isXR) this.engine.camera.rotation.set(0, 0, 0);
    super.dispose();
  }
}
