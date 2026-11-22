// "Datenspur" / "Data Trail": a drive on the data highway. Echo, the mascot, sits in a small car.
//   1 Obstacles  The car drives on its own. An obstacle comes closer; above the road stand four
//                field tokens with their tags. Pick the right one before the car is there (the
//                field that does not belong, or the field a sign asks for): a lane opens and the
//                car swings round. Wrong or too late: it brakes, bumps gently and loses the
//                streak; the reason shows and the drive goes on. Six obstacles, each a little faster.
//   2 Route      The highway reaches an interchange. The destination is a report; the route is
//                made of data points (sources, transformation, warehouse, report). Pick one
//                point, then the next: only then the road between them appears and is checked.
//                When the route is complete a small car drives it; then one question: a source
//                changes, which reports does that reach? Two interchanges.
// The content pools and the checking rules are those of the game's earlier form (lineage-content.js,
// lineage-model.js). The AI idea is kept quiet: one "KI-Tipp" in stage 1, where an assistant greys
// out the fields that surely belong together (that obstacle counts half).
// No lives and no game over; streaks multiply the points, a speed bonus only ever adds.
// The world (lineage-drive.js, lineage-visuals.js): a highway of light in a dark data room, the
// data landscape at the horizon. The field tokens and the interchange are the 3D playing field
// of lineage-room.js; in the browser the camera frames them with the road and the car below
// (a chase view), in the headset the road is a small model below the field (no motion of the
// player's view). Only the status strip, the prompt, the feedback and the stage card are HTML.
// Controls: click or tap a token, or keys 1 to 4; click or tap one data point, then the next, or
// arrow keys and Enter; H is the AI hint; Escape drops a selection. Headset: point and press.
// Play assistance (assist.js): relaxed = fewer tiles, pairs and links, the deciding metadata is
// highlighted; the car slows down and waits in front of an obstacle (no time limit at all).
// Calm motion: no bump, no body roll, no speed lines, steady light, camera cuts with a fade.
// All game time runs through update(dt), so the pause (pause.js) really stops it.
import * as THREE from 'three';
import { BaseScene } from '../scene.js';
import { t, L, getLang } from '../i18n.js';
import { sfx } from '../sfx.js';
import { assist } from '../assist.js';
import '../lineage-text.js';
import { TYPES, OWNERS, drawDrive } from '../lineage-content.js';
import { colOf, litFrom } from '../lineage-model.js';
import { screenHud } from '../lineage-hud.js';
import { roomView } from '../lineage-room.js';
import { makeSky, makeBackdrop, makeLandscape, makeKeyLight } from '../lineage-visuals.js';
import { makeDrive } from '../lineage-drive.js';
import { sceneLook, bloom } from '../gfx.js';
import { num } from '../tokens.js';

// The game's design tokens (css/game-lineage.css). Linked in index.html like the other games';
// until it is, the game loads the file itself before anything reads a token.
await (async () => {
  if ([...document.styleSheets].some((s) => s.href?.includes('game-lineage.css'))) return;
  await new Promise((res) => {
    const link = Object.assign(document.createElement('link'), { rel: 'stylesheet', href: 'css/game-lineage.css', onload: res, onerror: res });
    document.head.append(link);
  });
})();

// Points. A streak multiplies them (3 in a row x1.25, 6 x1.5, 10 x2); the speed bonus only adds.
// Points. A streak multiplies them (3 in a row x1.25, 6 x1.5, 10 x2); the speed bonus only adds.
const PTS = { odd: 150, oddSpeed: 60, link: 120, retry: 60, impact: 120, boardSpeed: 80, clean: 60 };
const WINDOW = [7, 6.4, 5.8, 5.2, 4.6, 4]; // seconds until the car reaches the obstacle (a field question: 1.5 s more)
const SPEED = { graph: [25, 85] }; // an interchange, seconds: full bonus until, none from
const MAX_SCORE = 4950;
const RANKS = [0, 2200, 3600]; // rating in three steps (relaxed: RANKS_EASY)
const RANKS_EASY = [0, 1500, 2400];
const OBSTACLES = ['barrier', 'crate', 'firewall'];
const SEEN_KEY = 'kiar.lineageSeen'; // the content of the last round (the next one brings other)
const KINDS = ['src', 'tr', 'wh', 'rep'];
const COLS = ['lineageColSrc', 'lineageColTr', 'lineageColWh', 'lineageColRep'];
let quickStart = false; // "again" on the result: the next round starts at once, without the intro
const clamp = THREE.MathUtils.clamp;

export class LineageScene extends BaseScene {
  constructor(app) {
    super(app);
    this.gameKey = 'lineage';
    this.mode = 'intro';
    this.timers = [];
    this.screenUI = !this.engine.isXR;
    this.ar = this.engine.isXR && this.engine.xrMode === 'immersive-ar';
    this.easy = assist.easy;
    this.calm = assist.reducedMotion;
    this.kb = false; // the last input was the keyboard: the focus follows the game
    this.sel = null;
    this.board = null;
    this.tmp = new THREE.Vector3();
    this.camTo = new THREE.Vector3();
    this.buildWorld();
    this.setControls({
      desktop: [[t('lineageKeyPick'), t('lineageDoPick')], [t('lineageKeyLink'), t('lineageDoLink')], [t('lineageKeyMove'), t('lineageDoMove')], [t('lineageKeyHint'), t('lineageDoHint')]],
      touch: [[t('lineageTapPick'), t('lineageDoPick')], [t('lineageTapLink'), t('lineageDoLink')]],
      xr: [[t('lineageXRPick'), t('lineageDoPick')], [t('lineageXRLink'), t('lineageDoLink')]],
    });
    const cb = {
      onPickOdd: (i) => this.pickOdd(i),
      onNode: (id) => this.pressNode(id),
      onLink: (a, b) => this.tryLink(a, b, 'drag'),
      onHint: () => this.useHint(),
      onNext: () => this.skip(),
      onMenu: () => this.menuOrPause(),
      onPointer: () => { this.kb = false; },
    };
    // The room is the playing field everywhere; the browser adds its slim strip of HTML.
    this.room = roomView(this, { ...cb, calm: this.calm, screen: this.screenUI, ar: this.ar });
    this.hudEl = this.screenUI ? screenHud({ ...cb, desk: !this.engine.touchUI, calm: this.calm }) : null;
    this.view = {};
    for (const k of ['show', 'setHud', 'setPrompt', 'setFeedback', 'setSpeed', 'setHint', 'showOdd', 'markOdd', 'lockOdd', 'setTimer', 'clear', 'driveRoute', 'showBoard', 'refresh', 'shake', 'pop', 'showCard', 'focusFirst', 'focusNode', 'moveFocus', 'tick', 'remove']) {
      this.view[k] = (...a) => { this.hudEl?.[k]?.(...a); return this.room[k]?.(...a); };
    }
    this.onSceneDispose(() => this.view.remove());
    this.onPointerDown = () => { this.kb = false; if (this.wait && this.playing()) this.skip(); };
    this.engine.canvas.addEventListener('pointerdown', this.onPointerDown);
    this.setupInput();
    this.onUpdate((dt) => this.update(dt));
    if (this.screenUI) this.mobileView((cam, dt) => this.screenCamera(cam, dt));
    if (quickStart) {
      quickStart = false;
      this.delay(0.05, () => { if (!this.disposed) this.start(); });
    } else {
      this.intro(t('lineageName'), t(this.easy ? 'lineageIntroEasy' : 'lineageIntro'), () => this.start());
    }
  }

  // ---------- the data room ----------

  /**
   * Browser and VR: a deep, dark space with a softly lit floor, data towers in the distance and,
   * behind the three zones, a large data landscape (sources, machine, warehouse, reports) whose
   * pipes fill as the round goes on. AR keeps the real room: only the landscape as a small model
   * on a slim column, and the playing field with solid labels.
   */
  buildWorld() {
    const e = this.engine;
    this.onSceneDispose(sceneLook(e, { tone: 'neutral', exposure: 1, env: 'studio', envIntensity: 0.4, shadows: false }));
    const floorY = e.floorY - e.root.position.y;
    // The highway with Echo's car: in the browser below the playing field, in the headset a small model below it.
    this.drive = makeDrive({ calm: this.calm, short: e.isXR });
    if (e.isXR) { this.drive.group.position.set(0, this.eye - 0.8, -0.5); this.drive.group.scale.setScalar(0.42); }
    this.group.add(this.drive.group);
    this.onSceneDispose(() => this.drive.dispose());
    if (this.ar) {
      const y = this.eye - 0.82;
      this.land = makeLandscape({ calm: this.calm, pedestal: Math.max(0.2, (y - floorY) / 0.75 - 0.03) });
      this.land.position.set(0, y, -0.7);
      this.land.scale.setScalar(0.75);
      this.land.visible = false; // AR: the road is the model on the table
    } else {
      this.land = makeLandscape({ calm: this.calm });
      this.land.scale.setScalar(e.isXR ? 4.2 : 5);
      this.land.position.set(0, floorY + 0.14, e.isXR ? -4.4 : -7); // the browser keeps it far back, in the haze
    }
    this.group.add(this.land);
    const key = makeKeyLight();
    key.position.add(this.land.position);
    key.target.position.copy(this.land.position);
    this.group.add(key, key.target);
    if (this.ar) return;
    this.sky = makeSky();
    this.prevBg = e.scene.background;
    e.scene.background = this.sky;
    this.prevFog = e.scene.fog?.color.getHex();
    e.scene.fog?.color.set(this.sky.userData.horizon);
    // Browser: depth haze, so the landscape behind the field is a calm backdrop and the play objects stand out.
    if (e.scene.fog && !e.isXR) { this.prevFogRange = [e.scene.fog.near, e.scene.fog.far]; e.scene.fog.near = 3; e.scene.fog.far = 12.5; }
    this.backdrop = makeBackdrop({ calm: this.calm, around: e.isXR, floorY });
    this.group.add(this.backdrop);
    // Desktop: the packets of light and the tokens' bright parts glow (no post effects on phones or in the headset).
    if (this.screenUI && !e.touchUI) this.onSceneDispose(bloom(e, { strength: 0.55, radius: 0.5, threshold: 0.9 }));
  }

  playing() {
    return this.mode !== 'intro' && this.mode !== 'over';
  }

  /** Stage 1 and the finish: the road with the gate is in view (else the interchange of stage 2). */
  onRoad() {
    return ['start', 'odd', 'oddDone', 'card', 'finish'].includes(this.mode);
  }

  /**
   * Browser, during play. Stage 1: the camera looks down the road a little, the tiles on the
   * gantry at the top, the car at the foot of the frame. Stage 2: it looks at the interchange
   * (the map lies tilted back) and follows the layers that are being linked. The frame is fitted
   * between the strip at the top and the feedback line at the foot.
   */
  screenCamera(cam, dt) {
    if (!this.playing()) { this.camInit = false; return false; }
    // The map is seen from a little farther with a longer lens: its labels stay upright and plain.
    const fov = this.onRoad() ? 42 : num('xr-lineage-map-fov');
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    let pts;
    let pitch = 0;
    if (this.onRoad()) {
      const W = window.innerWidth;
      const H = window.innerHeight;
      const phone = this.engine.touchUI;
      pitch = THREE.MathUtils.degToRad(num(phone && W < H ? 'xr-lineage-pitch-tall' : phone && H < 520 ? 'xr-lineage-pitch-flat' : 'xr-lineage-pitch'));
      if (this.mode === 'finish' && this.roadCam) { pts = null; } else {
        pts = this.mode === 'card' && this.roadPts ? this.roadPts : this.room.framePoints();
        const g = this.drive.group;
        g.updateMatrixWorld(true);
        // the car at its start, Echo's head included, and the road behind it
        for (const [x, y, z] of [[-0.24, 0, 0.32], [0.24, 0, 0.32], [0, 0.46, 0.05]]) pts.push(g.localToWorld(new THREE.Vector3(x, y, z)));
        if (this.mode !== 'card') this.roadPts = pts.slice();
      }
    } else pts = this.room.framePoints();
    if (pts?.length) {
      this.fitView(cam, pts, pitch, this.hudEl.insets(), this.camTo);
      if (this.onRoad()) this.roadCam = { pos: this.camTo.clone(), pitch };
    } else if (this.roadCam) { this.camTo.copy(this.roadCam.pos); pitch = this.roadCam.pitch; }
    // Calm motion: no travel, the view changes at once.
    const snap = !this.camInit || this.calm;
    if (snap) { cam.position.copy(this.camTo); this.camPitch = pitch; this.camInit = true; } else {
      cam.position.lerp(this.camTo, Math.min(1, dt * 3.2));
      this.camPitch += (pitch - this.camPitch) * Math.min(1, dt * 3.2);
    }
    cam.rotation.set(-this.camPitch, 0, 0);
    return true;
  }

  /**
   * Where the camera must stand (looking down by `pitch`) so that all points (world) are in the
   * free part of the screen: between the strips at the top and the foot, with a small margin.
   */
  fitView(cam, pts, pitch, ins, out) {
    const H = window.innerHeight;
    const tv = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const th = tv * cam.aspect * 0.965;
    const yt = (1 - (2 * ins.top) / H) * 0.98;
    const yb = -1 + (2 * ins.bottom) / H + 0.01;
    const f = new THREE.Vector3(0, -Math.sin(pitch), -Math.cos(pitch));
    const u = new THREE.Vector3(0, Math.cos(pitch), -Math.sin(pitch));
    const A = new THREE.Vector3();
    pts.forEach((p) => A.add(p));
    A.multiplyScalar(1 / pts.length);
    const rel = pts.map((p) => { const d = p.clone().sub(A); return [d.x, d.dot(u), d.dot(f)]; });
    const fit = (D) => {
      let qlo = -Infinity; let qhi = Infinity; let slo = -Infinity; let shi = Infinity;
      for (const [x, y, z0] of rel) {
        const z = z0 + D;
        if (z < 0.1) return null;
        qlo = Math.max(qlo, x - z * th); qhi = Math.min(qhi, x + z * th);
        slo = Math.max(slo, y - yt * z * tv); shi = Math.min(shi, y - yb * z * tv);
      }
      return qlo <= qhi && slo <= shi ? [(qlo + qhi) / 2, (slo + shi) / 2] : null;
    };
    let lo = 0.1; let hi = 60;
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (fit(mid)) hi = mid; else lo = mid; }
    const [q, sOff] = fit(hi) ?? [0, 0];
    return out.copy(A).add(new THREE.Vector3(q, 0, 0)).addScaledVector(u, sOff).addScaledVector(f, -hi);
  }

  /** Browser: the road lies under the gantry of tiles, the block right below them, the car's start in front. */
  placeRoad() {
    const g = this.drive.group;
    const on = this.playing() && (this.onRoad() || this.mode === 'over');
    g.visible = on;
    if (!on || this.mode === 'card' || this.mode === 'finish') return;
    const fb = this.room.frameBox();
    if (!Number.isFinite(fb.x0)) return;
    const phone = this.engine.touchUI;
    const tall = phone && window.innerWidth < window.innerHeight;
    const flat = phone && !tall && window.innerHeight < 520;
    // the road is a model a little smaller than the tiles (a phone held sideways: smaller still, it has no height to spare)
    const sc = num(flat ? 'xr-lineage-drive-scale-flat' : tall ? 'xr-lineage-drive-scale-tall' : 'xr-lineage-drive-scale');
    const G = num(tall ? 'xr-lineage-gate-dist-tall' : 'xr-lineage-gate-dist');
    const roadY = fb.y0 - num('xr-lineage-gate-clear') * sc;
    g.scale.setScalar(sc);
    g.position.set((fb.x0 + fb.x1) / 2, roadY, fb.z - 0.03 + G * sc);
    this.drive.setGate({ G, width: Math.max((fb.x1 - fb.x0 + 0.04) / sc, this.drive.LANE * 3 + 0.22), top: (fb.bar - roadY) / sc });
  }

  // ---------- input ----------

  setupInput() {
    this.onKey = (e) => {
      if (e.repeat || this.disposed || this.engine.paused || !this.screenUI || e.altKey || e.ctrlKey || e.metaKey) return;
      if (!this.playing()) return;
      const k = e.key;
      this.kb = true;
      const onButton = document.activeElement?.tagName === 'BUTTON' && !document.activeElement.disabled;
      const go = k === 'Enter' || k === ' ';
      if (go && e.defaultPrevented) return; // the engine pressed the label that has the focus
      if (k === 'Escape') {
        // Escape drops a selection; without one it is the pause's key. (The engine has just taken
        // the same Escape to drop the keyboard's focus ring: then the pause opens from here.)
        if (this.sel) { e.preventDefault(); this.select(null); } else if (e.defaultPrevented) this.app.pause?.open();
        return;
      }
      const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
      if (dir) { e.preventDefault(); this.view.moveFocus(dir[0], dir[1]); return; }
      if (go && this.wait && !onButton) { e.preventDefault(); this.skip(); return; }
      if (this.mode === 'odd') {
        const n = Number(k);
        if (n >= 1 && n <= this.row.tiles.length) { e.preventDefault(); this.pickOdd(n - 1); } else if (k === 'h' || k === 'H') { e.preventDefault(); this.useHint(); }
      }
    };
    window.addEventListener('keydown', this.onKey, true);
  }

  // ---------- timing (game time: stands still while paused) ----------

  after(sec, fn) { const tm = { t: sec, fn }; this.timers.push(tm); return tm; }

  /** Goes on after `sec` (or sooner: a tap, Enter or the button, once `min` seconds have passed). */
  waitThen(sec, fn, min = 0.35) {
    this.wait = { t: 0, sec, min, fn };
  }

  skip() {
    const w = this.wait;
    if (!w || w.t < w.min) return;
    this.wait = null;
    w.fn();
  }

  update(dt) {
    this.backdrop?.userData.tick(dt);
    this.land.userData.tick(dt);
    this.drive.tick(dt);
    if (this.screenUI) this.placeRoad();
    if (this.screenUI && !this.engine.touchUI) {
      // Desktop: the camera stands still during play; the intro and the result fit themselves.
      const on = this.playing();
      this.engine.fitEnabled = !on;
      if (on) this.screenCamera(this.engine.camera, dt); else this.camInit = false;
    }
    for (const tm of [...this.timers]) {
      tm.t -= dt;
      if (tm.t <= 0) { this.timers.splice(this.timers.indexOf(tm), 1); if (!this.disposed) tm.fn(); }
    }
    if (this.wait) {
      const w = this.wait;
      w.t += dt;
      if (w.sec != null && w.t >= w.sec) { this.wait = null; w.fn(); }
    }
    if (this.mode === 'odd') {
      // The obstacle comes closer. Relaxed: the car slows down and waits in front of it.
      this.clock += dt;
      const k = this.timeK();
      this.drive.setObstacle(this.easy ? Math.max(0.2, k) : k);
      if (this.easy) this.drive.setSpeed(k > 0.2 ? 0.7 : 0);
      else { this.view.setTimer(k); this.view.setSpeed(k, this.speedPoints()); if (k <= 0) this.pickOdd(-1); }
    } else if (this.mode === 'link') {
      this.clock += dt;
      if (!this.easy) this.view.setSpeed(this.speedK(), this.speedPoints());
    }
    this.view.tick?.(dt);
  }

  /** Stage 1: the share of the way that is left before the car reaches the obstacle (1 to 0). */
  timeK() {
    return clamp(1 - Math.max(0, this.clock) / this.window, 0, 1);
  }

  speedK() {
    if (this.mode === 'odd') return this.timeK();
    const [full, zero] = SPEED.graph;
    return clamp(1 - (this.clock - full) / (zero - full), 0, 1);
  }

  /** The speed bonus right now. Relaxed mode: no clock, half of it for everyone. */
  speedPoints() {
    const max = this.mode === 'odd' ? PTS.oddSpeed : PTS.boardSpeed;
    return Math.round(max * (this.easy ? 0.5 : this.speedK()));
  }

  // ---------- flow ----------

  start() {
    this.clearLayer();
    // Echo sits in the car, so the flying mascot waits outside until the game is left.
    this.echoParked = true;
    this.app.echo?.suppress?.(true);
    this.startMusic(0, 'lineage');
    let seen = new Set();
    try { seen = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch { /* private mode */ }
    this.round = drawDrive({ easy: this.easy, seen });
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(this.round.ids)); } catch { /* private mode */ }
    const r = this.round;
    this.steps = [
      ...r.rows.map((row, i) => ({ stage: 0, kind: 'odd', row, n: i })),
      ...r.graphs.map((g, i) => ({ stage: 1, kind: 'graph', data: g, first: i === 0 })),
    ];
    Object.assign(this, {
      score: 0, streak: 0, bestStreak: 0, stepIndex: -1, hintLeft: 1, sel: null, wait: null,
      stats: { acts: 0, first: 0, oddOk: 0, oddN: 0, linkOk: 0, linkN: 0, impactMiss: 0, impactN: 0, hint: false },
    });
    this.view.show(true);
    this.mode = 'start';
    sfx.appear();
    this.nextStep();
  }

  mult() {
    const s = this.streak;
    return s >= 10 ? 2 : s >= 6 ? 1.5 : s >= 3 ? 1.25 : 1;
  }

  num(v) {
    return v.toLocaleString(getLang() === 'de' ? 'de-DE' : 'en-US');
  }

  refreshHud() {
    const step = this.steps[Math.max(0, this.stepIndex)];
    const inStage = this.steps.filter((s) => s.stage === step.stage);
    this.view.setHud({
      score: this.score, streak: this.streak, mult: this.mult(), multText: `×${this.num(this.mult())}`,
      stage: step.stage, done: inStage.indexOf(step), total: inStage.length,
    });
    // The world shows the progress: the landscape fills with flowing data.
    // (within a board every link counts, so the data moves on with each right answer)
    const b = this.board;
    const part = step.kind !== 'odd' && b && this.mode !== 'card' ? (b.needs.filter((n) => n.done).length + (b.impact?.found.size ?? 0)) / (b.needs.length + (b.impactData?.hit.length ?? 0)) : 0;
    this.land.userData.setProgress((step.stage + (inStage.indexOf(step) + Math.min(1, part)) / inStage.length) * 1.5);
  }

  /** Points for a right answer: times the streak's factor; the streak grows. */
  award(base, target, extra = 0) {
    const pts = Math.round(base * this.mult()) + extra;
    this.score += pts;
    this.streak += 1;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    this.view.pop(`+${pts}`, target, 'good');
    this.land.userData.cheer(0.4);
    // Echo cheers for a streak (where the host is there).
    if (this.streak === 5 || this.streak === 10) {
      this.app.echo?.celebrate?.();
      this.land.userData.cheer();
      this.burst(this.land.getWorldPosition(this.tmp).setY(this.tmp.y + 0.16 * this.land.scale.y), 'xr-lineage-flow', 20);
      sfx.powerup();
    }
    this.refreshHud();
    return pts;
  }

  miss() {
    this.streak = 0;
    this.refreshHud();
  }

  nextStep() {
    this.stepIndex += 1;
    const step = this.steps[this.stepIndex];
    if (!step) { this.finishLine(); return; }
    this.sel = null;
    this.board = null;
    this.refreshHud();
    // Stages 2 and 3 open with a short card: what to do, and what the assistant does.
    if (this.calm && step.stage !== this.lastStage) this.hudEl?.fade();
    this.lastStage = step.stage;
    if (step.first && !step.shown) {
      step.shown = true;
      this.stepIndex -= 1;
      this.mode = 'card';
      this.drive.setSpeed(0); // the car stops at the interchange
      if (this.screenUI) this.drive.clearGate();
      this.view.showCard({ title: t('lineageCard2Title'), lines: [t('lineageCard2Text'), t('lineageCardHow')], button: t('lineageNext') });
      sfx.appear();
      this.waitThen(this.easy ? null : 9, () => { this.view.showCard(null); this.nextStep(); }, 0.5);
      return;
    }
    if (step.kind === 'odd') this.beginOdd(step.row, step.n);
    else this.beginBoard(step);
  }

  // ---------- stage 1: what does not belong? ----------

  beginOdd(row, n = 0) {
    this.row = row;
    this.mode = 'odd';
    // Browser: the next gate slides in first, then its tiles show and the time runs.
    const lead = this.screenUI && !this.calm ? 0.75 : 0;
    this.clock = -lead;
    this.hinted = false;
    this.window = WINDOW[Math.min(WINDOW.length - 1, n)] + (row.kind === 'match' ? 1.5 : 0) + (this.easy ? 3 : 0);
    const val = (v) => (v && typeof v === 'object' ? L(v) : v);
    const tiles = row.tiles.map((tl) => {
      if (tl.plain) return { title: L(tl.plain), mono: false, parts: [], tok: 'desc' };
      const parts = [];
      if (row.show.includes('ty')) parts.push({ k: 'ty', label: t('lineageTy'), glyph: TYPES[tl.ty].glyph, text: L(TYPES[tl.ty].name) });
      if (row.show.includes('ex')) parts.push({ k: 'ex', label: t('lineageEx'), text: val(tl.ex) });
      if (row.show.includes('ow')) parts.push({ k: 'ow', label: t('lineageOw'), text: L(OWNERS[tl.ow]) });
      // Relaxed mode: the metadata that decides is highlighted.
      parts.forEach((p) => { p.key = this.easy && p.k === row.key; });
      return { title: val(tl.n), mono: true, parts, tok: tl.ty, owKey: row.show.includes('ow') ? tl.ow : null };
    });
    // A field question: the reason is what the right field is. An odd-one-out row brings its own.
    const hit = row.tiles[row.odd];
    this.why = row.kind === 'match' ? t('lineageIs', { name: hit.n, is: L(hit.is) }) : L(row.why);
    this.view.showOdd({ tiles, key: row.key, rightLabel: t(row.kind === 'match' ? 'lineageFits' : 'lineageOdd'), delay: lead * 0.6 });
    this.view.setPrompt(row.kind === 'match' ? t('lineageMatchPrompt', { d: L(row.ask) }) : t(row.lvl === 3 ? 'lineageOddPromptMeta' : 'lineageOddPrompt'));
    this.view.setFeedback(null, '');
    this.view.setHint(this.hintLeft > 0 ? 'ready' : null);
    this.view.setSpeed(this.easy ? null : 1, PTS.oddSpeed);
    this.view.setTimer(this.easy ? null : 1);
    // the car drives on, each time a little faster; the obstacle comes into view
    this.drive.setSpeed(1 + n * 0.14);
    this.drive.showObstacle(OBSTACLES[n % OBSTACLES.length]);
    if (this.kb) this.view.focusFirst();
  }

  /** The assistant's one hint: it greys out fields that surely belong together. The row counts half. */
  useHint() {
    if (this.mode !== 'odd' || this.hintLeft <= 0 || this.hinted) return;
    this.hintLeft -= 1;
    this.hinted = true;
    this.stats.hint = true;
    const others = this.row.tiles.map((tl, i) => i).filter((i) => i !== this.row.odd);
    this.dimmed = others.slice(0, Math.max(1, others.length - 1));
    this.dimmed.forEach((i) => this.view.markOdd(i, 'dim'));
    this.view.setHint(null);
    this.view.setFeedback('info', t('lineageHintText'));
    sfx.sonar();
    if (this.kb) this.view.focusFirst();
  }

  /** A token is picked (i: its index; -1: the car reached the obstacle and nothing was picked). */
  pickOdd(i) {
    if (this.mode !== 'odd' || (i >= 0 && (!this.row.tiles[i] || (this.hinted && this.dimmed.includes(i))))) return;
    const row = this.row;
    const right = i === row.odd;
    const st = this.stats;
    st.acts += 1; st.oddN += 1;
    this.mode = 'oddDone';
    this.view.setSpeed(null);
    this.view.setTimer(null);
    this.view.setHint(null);
    if (right) {
      // A lane opens and the car swings round the obstacle; the sooner, the more speed bonus.
      st.first += 1; st.oddOk += 1;
      const base = (PTS.odd + Math.round(PTS.oddSpeed * (this.easy ? 0.5 : this.timeK()))) * (this.hinted ? 0.5 : 1);
      this.award(base, { tile: i });
      this.view.markOdd(i, 'right');
      this.view.setFeedback('good', `${t('lineageRight')} ${this.why}`);
      this.drive.setSpeed(1 + (this.steps[this.stepIndex].n ?? 0) * 0.14);
      this.drive.swerve();
      sfx.correct();
      sfx.whoosh();
    } else {
      // The car brakes hard and bumps gently; the streak is gone, the drive goes on.
      this.miss();
      if (i >= 0) this.view.markOdd(i, 'wrong');
      this.view.markOdd(row.odd, 'answer');
      this.view.setFeedback('bad', `${t(i < 0 ? 'lineageTooLate' : 'lineageWrong')} ${this.why}`);
      this.drive.brake();
      sfx.wrong();
      sfx.thud();
    }
    this.view.lockOdd();
    this.waitThen((right ? 2.4 : 3.8) + (this.easy ? 1.5 : 0), () => this.nextStep());
  }

  // ---------- stage 2: the route ----------

  beginBoard(step) {
    const d = step.data;
    let board;
    {
      const missing = new Set(d.missing.map((m) => `${m.from}>${m.to}`));
      board = {
        kind: 'graph', cols: COLS.map((k) => t(k)), taken: new Set(), impact: null, edges: d.edges,
        nodes: d.nodes.map((n) => ({ id: n.id, col: n.col, kind: KINDS[n.col], title: typeof n.n === 'object' ? L(n.n) : n.n, mono: n.col < 3, text: n.m ? L(n.m) : '' })),
        links: d.edges.filter(([a, b]) => !missing.has(`${a}>${b}`)).map(([a, b]) => ({ a, b, state: 'fixed' })),
        needs: d.missing.map((m) => ({ id: `${m.from}>${m.to}`, asker: m.to, ans: m.from, text: L(m.need), done: false, tries: 0 })),
      };
      board.report = board.nodes.find((n) => n.id === 'r1').title;
      board.impactData = d.impact;
    }
    this.board = board;
    this.mode = 'link';
    this.clock = 0;
    this.mistakes = 0;
    this.view.showBoard(board);
    this.view.setPrompt(t('lineageGraphPrompt', { report: board.report }));
    this.drive.setSpeed(0);
    // Browser: the car stands parked at the entry of the interchange.
    if (this.screenUI) { this.drive.park(true); this.room.parkCar(this.drive.rig); }
    this.view.setFeedback(null, '');
    this.view.setHint(null);
    this.view.setSpeed(this.easy ? null : 1, PTS.boardSpeed);
    this.refresh();
    if (this.kb) this.view.focusFirst();
  }

  refresh() {
    this.view.refresh({ sel: this.sel, mode: this.mode });
  }

  node(id) { return this.board.nodes.find((n) => n.id === id); }

  select(id) {
    this.sel = id;
    this.refresh();
    if (id) this.view.setFeedback('info', t('lineageSelected', { name: this.node(id).title }));
  }

  /** A press on a card: select it, or connect it with the selected one. */
  pressNode(id) {
    if (this.mode === 'impact') { this.pickReport(id); return; }
    if (this.mode !== 'link') return;
    const b = this.board;
    if (!this.sel) {
      sfx.grab();
      this.select(id);
      // Keyboard: the focus jumps to the other side.
      if (this.kb) {
        const need = b.needs.find((n) => !n.done && n.asker === id);
        const other = need ? b.nodes.find((n) => n.col === colOf(b, need.ans) && !b.taken.has(n.id))?.id : b.needs.find((n) => !n.done && n.ans === id)?.asker ?? b.needs.find((n) => !n.done && colOf(b, n.ans) === colOf(b, id))?.asker;
        if (other) this.view.focusNode(other);
      }
      return;
    }
    if (this.sel === id) { this.select(null); return; }
    if (colOf(b, this.sel) === colOf(b, id)) { sfx.grab(); this.select(id); return; }
    this.tryLink(this.sel, id, 'tap');
  }

  tryLink(x, y) {
    if (this.mode !== 'link' || x === y) return;
    const b = this.board;
    const open = b.needs.filter((n) => !n.done);
    const need = open.find((n) => (n.asker === x && n.ans === y) || (n.asker === y && n.ans === x));
    if (need) { this.linkRight(need); return; }
    if (colOf(b, x) === colOf(b, y)) { this.sel = null; this.refresh(); this.view.setFeedback('info', t('lineageSameCol')); return; }
    const asker = [x, y].find((id) => open.some((n) => n.asker === id && colOf(b, n.ans) === colOf(b, id === x ? y : x)));
    if (!asker) { this.sel = null; this.refresh(); this.view.setFeedback('info', t('lineageNoLink')); sfx.tick(); return; }
    this.linkWrong(asker, asker === x ? y : x);
  }

  /** The pair is right: the cable locks as a pipe with flowing light. */
  linkRight(need) {
    const b = this.board;
    const st = this.stats;
    need.done = true;
    b.links.push({ a: need.ans, b: need.asker, state: 'done' });
    if (colOf(b, need.ans) > colOf(b, need.asker)) { const l = b.links[b.links.length - 1]; [l.a, l.b] = [l.b, l.a]; }
    if (b.kind === 'pairs') b.taken.add(need.ans);
    st.acts += 1; st.linkN += 1;
    if (!need.tries) { st.first += 1; st.linkOk += 1; }
    this.sel = null;
    this.award(need.tries ? PTS.retry : PTS.link, { node: need.asker });
    this.refresh();
    this.view.setFeedback('good', t('lineageRight'));
    sfx.correct();
    if (b.needs.every((n) => n.done)) this.boardDone(); else if (this.kb) this.view.focusFirst();
  }

  /** The pair is wrong: the cable shows for a moment with a cross and the reason, then both sides are free again. */
  linkWrong(askerId, candId) {
    const b = this.board;
    const cand = this.node(candId);
    const open = b.needs.filter((n) => !n.done && n.asker === askerId);
    open.forEach((n) => { n.tries += 1; });
    this.mistakes += 1;
    this.sel = null;
    this.miss();
    const reason = b.kind === 'pairs'
      ? t('lineageIs', { name: cand.title, is: cand.is })
      : t('lineageGraphReason', { name: cand.title, meta: cand.text, need: open.map((n) => n.text).join(' + ') });
    this.refresh();
    this.view.shake(candId, askerId);
    this.view.setFeedback('bad', t('lineageLinkWrong', { reason }));
    sfx.wrong();
    if (this.kb) this.view.focusNode(askerId);
  }

  /** The route is complete: the small car drives it to the destination; then the question about a change. */
  boardDone() {
    const speed = this.speedPoints();
    const clean = this.mistakes ? 0 : PTS.clean;
    const bonus = speed + clean;
    this.score += bonus;
    this.view.setSpeed(null);
    this.refreshHud();
    this.mode = 'route';
    this.view.setFeedback('good', t(clean ? 'lineageBoardClean' : 'lineageBoardDone', { n: bonus }));
    this.refresh();
    sfx.coin();
    sfx.whoosh();
    const car = this.screenUI ? this.drive.rig : this.drive.mini;
    this.view.driveRoute(car, () => { if (!this.disposed && this.mode === 'route') this.beginImpact(); }, (m) => this.drive.roll(m));
  }

  // ---------- a source changes: which reports does that reach? ----------

  beginImpact() {
    const b = this.board;
    const im = b.impactData;
    b.impact = { src: im.src, field: im.field, hit: im.hit, found: new Set(), wrong: new Set(), lit: litFrom(b, im.src, b.edges), active: true };
    this.mode = 'impact';
    this.impactClean = true;
    this.view.setPrompt(t('lineageImpactPrompt', { src: this.node(im.src).title, field: im.field }));
    this.view.setFeedback(null, '');
    this.refresh();
    sfx.sonar();
    if (this.kb) this.view.focusFirst();
  }

  pickReport(id) {
    const b = this.board;
    const im = b.impact;
    const node = this.node(id);
    if (!node || node.col !== 3 || im.found.has(id) || im.wrong.has(id)) return;
    const st = this.stats;
    const src = this.node(im.src).title;
    st.acts += 1; st.impactN += 1;
    if (im.hit.includes(id)) {
      st.first += 1;
      im.found.add(id);
      b.links.filter((l) => l.b === id).forEach((l) => im.lit.add(`${l.a}>${l.b}`));
      this.award(PTS.impact, { node: id });
      const all = im.hit.every((h) => im.found.has(h));
      sfx.correct();
      if (all) {
        const bonus = this.impactClean ? PTS.clean : 0;
        this.score += bonus;
        this.mode = 'impactDone';
        this.refreshHud();
        this.refresh();
        this.view.setFeedback('good', bonus ? t('lineageImpactDone', { n: bonus }) : t('lineageImpactRight', { report: node.title, src }));
        sfx.coin();
        this.waitThen(2.6 + (this.easy ? 1 : 0), () => this.nextStep(), 0.5);
        return;
      }
      this.refresh();
      this.view.setFeedback('good', t('lineageImpactMore'));
    } else {
      st.impactMiss += 1;
      this.impactClean = false;
      im.wrong.add(id);
      this.miss();
      this.refresh();
      this.view.setFeedback('bad', t('lineageImpactWrong', { report: node.title, src }));
      sfx.wrong();
    }
    if (this.kb) this.view.focusFirst();
  }

  // ---------- the finish line and the result ----------

  /** The car drives through the finish gantry, then the result. */
  finishLine() {
    this.mode = 'finish';
    if (this.screenUI) { this.drive.home(); this.drive.clearGate(); this.hudEl?.fade(); this.camInit = false; }
    this.view.clear();
    this.view.setHint(null);
    this.view.setSpeed(null);
    this.view.setPrompt(t('lineageFinish'));
    this.drive.setSpeed(1.8);
    this.drive.finish();
    sfx.powerup();
    this.waitThen(2.2, () => this.finish(), 0.6);
  }


  finish() {
    if (this.mode === 'over') return;
    this.mode = 'over';
    this.view.show(false);
    this.drive.setSpeed(0.6);
    this.land.userData.setProgress(3);
    this.land.userData.cheer();
    const st = this.stats;
    const score = Math.min(MAX_SCORE, Math.round(this.score));
    // A rating in three steps with the points missing to the next one (as the result counts them).
    const ranks = this.easy ? RANKS_EASY : RANKS;
    const rank = ranks.reduce((r, at, k) => (score >= at ? k : r), 0);
    const nextAt = ranks[rank + 1];
    const rating = nextAt
      ? t('lineageRankNext', { rank: t(`lineageRank${rank}`), n: Math.ceil((nextAt - score) * assist.scoreFactor), next: t(`lineageRank${rank + 1}`) })
      : t('lineageRankTop', { rank: t(`lineageRank${rank}`) });
    // What went well: the two strongest of rows, links and the impact analysis.
    const well = [
      [st.oddOk / Math.max(1, st.oddN), t('lineageWellOdd', { ok: st.oddOk, n: st.oddN })],
      [st.linkOk / Math.max(1, st.linkN), t('lineageWellLink', { ok: st.linkOk, n: st.linkN })],
      st.impactN && !st.impactMiss ? [0.9, t('lineageWellImpact')] : null,
    ].filter(Boolean).sort((a, b) => b[0] - a[0]).slice(0, 2).map((w) => w[1]).join(' ');
    // One tip: where most went wrong.
    const tip = st.oddN - st.oddOk >= 2 ? 'lineageTipOdd'
        : st.linkN - st.linkOk >= 2 ? 'lineageTipLink'
          : st.impactMiss ? 'lineageTipImpact'
            : st.oddN - st.oddOk ? 'lineageTipOdd' : st.linkN - st.linkOk ? 'lineageTipLink' : 'lineageTipSpeed';
    this.results({
      gameKey: 'lineage', score, correct: st.first, total: st.acts,
      line: `${rating} ${t('lineageLine', { ok: st.first, n: st.acts, streak: this.bestStreak })}`,
      learned: [
        { q: t('lineageWellQ'), a: well },
        { q: t('lineageTipQ'), a: t(tip) },
        // the AI lesson, only if the hint was used
        ...(st.hint ? [{ q: t('lineageLearnQ'), a: t('lineageLearnHint') }] : []),
      ],
      onAgain: () => { quickStart = true; this.app.startGame('lineage'); },
    });
  }

  dispose() {
    this.mode = 'over';
    if (this.echoParked) { this.echoParked = false; this.app.echo?.suppress?.(false); }
    window.removeEventListener('keydown', this.onKey, true);
    this.engine.canvas.removeEventListener('pointerdown', this.onPointerDown);
    const e = this.engine;
    e.fitEnabled = true;
    if (!this.ar) {
      if (e.scene.background === this.sky) e.scene.background = this.prevBg === this.sky ? e.previewBg : this.prevBg;
      if (this.prevFog !== undefined) e.scene.fog?.color.setHex(this.prevFog);
      if (this.prevFogRange && e.scene.fog) [e.scene.fog.near, e.scene.fog.far] = this.prevFogRange;
      this.sky?.dispose();
    }
    if (!e.isXR) e.camera.rotation.set(0, 0, 0);
    super.dispose();
  }
}
