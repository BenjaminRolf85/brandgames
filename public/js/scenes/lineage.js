// "Datenspur" / "Data Trail": a casual game about metadata in three short stages.
//   1 "Was passt nicht?"  a row of four tiles (field names with their metadata line), one does not
//                         belong: three names for one business term and a stranger, three dates and
//                         an amount, three personal data fields and one that is not, ...
//   2 "Verbinden"         business descriptions on the left, technical data fields on the right;
//                         draw a line from each description to its field (three boards, the last
//                         with one field too many).
//   3 "Datenspur"         a small lineage graph (sources, transformation, warehouse, reports) with
//                         missing links; then a source changes and the player picks the reports
//                         that are affected (impact analysis). Two graphs.
// Connecting is always the same two steps: pick one side, then the other; only then a cable
// appears and is checked (right: it locks as a pipe with flowing light; wrong: it shows for a
// moment with a cross and the reason, then goes). Nothing on the board hints at the answer.
// The AI idea is kept quiet: one "KI-Tipp" in stage 1, where an assistant greys out the fields
// that surely belong together (the row then counts half); the result says so if it was used.
// No lives and no game over; streaks multiply the points, a speed bonus only ever adds.
// The playing field is a dark data room on every device (lineage-room.js): fields are 3D tokens
// with labels, links are pipes with travelling light. The three stages
// have their zones from left to right (sources, catalog, warehouse and reports), in front of a
// large data landscape that fills with flowing data as the round goes on; in the browser the
// camera travels from zone to zone and frames exactly the labels of the current task.
// Controls:
//   Browser: click or tap a label; click or tap one, then the other to connect (or drag a cable);
//   arrow keys move a focus ring, Enter selects and connects; 1 to 4 pick a token in stage 1,
//   H is the AI hint, Escape drops a selection. Only the status strip, the prompt, the feedback
//   line and the card that opens a stage are HTML (lineage-hud.js).
//   Headset (AR and VR): the same field at arm's length; point and press, or press and hold on a
//   label, move and release on its counterpart.
// Play assistance (assist.js): relaxed = fewer tiles, pairs and links, the deciding metadata is
// highlighted, no clock; calm motion = no shake, steady light instead of fast flows, no camera travel.
// All game time runs through update(dt), so the pause (pause.js) really stops it.
import * as THREE from 'three';
import { BaseScene } from '../scene.js';
import { t, L, getLang } from '../i18n.js';
import { sfx } from '../sfx.js';
import { assist } from '../assist.js';
import '../lineage-text.js';
import { TYPES, OWNERS, drawRound } from '../lineage-content.js';
import { colOf, litFrom } from '../lineage-model.js';
import { screenHud } from '../lineage-hud.js';
import { roomView } from '../lineage-room.js';
import { makeSky, makeBackdrop, makeLandscape, makeKeyLight } from '../lineage-visuals.js';
import { sceneLook, bloom } from '../gfx.js';

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
const PTS = { odd: 100, oddSpeed: 40, link: 72, retry: 36, impact: 80, boardSpeed: 60, clean: 40 };
const SPEED = { odd: [4, 16], pairs: [20, 70], graph: [25, 85] }; // seconds: full bonus until, none from
const MAX_SCORE = 4950;
const RANKS = [0, 2400, 3800]; // rating in three steps (relaxed: RANKS_EASY)
const RANKS_EASY = [0, 1600, 2500];
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
    for (const k of ['show', 'setHud', 'setPrompt', 'setFeedback', 'setSpeed', 'setHint', 'showOdd', 'markOdd', 'lockOdd', 'showBoard', 'refresh', 'shake', 'pop', 'showCard', 'focusFirst', 'focusNode', 'moveFocus', 'tick', 'remove']) {
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
    if (this.ar) {
      const y = this.eye - 0.82;
      this.land = makeLandscape({ calm: this.calm, pedestal: Math.max(0.2, (y - floorY) / 0.75 - 0.03) });
      this.land.position.set(0, y, -0.7);
      this.land.scale.setScalar(0.75);
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

  /**
   * Browser, during play: the camera frames the labels of the current task, between the strip at
   * the top and the feedback line; from stage to stage it travels on to the next zone.
   */
  screenCamera(cam, dt) {
    if (!this.playing()) { this.camInit = false; return false; }
    if (cam.fov !== 42) { cam.fov = 42; cam.updateProjectionMatrix(); }
    const box = this.room.frameBox();
    const ins = this.hudEl.insets();
    const H = window.innerHeight;
    const tv = Math.tan(THREE.MathUtils.degToRad(21));
    const fracH = Math.max(0.3, (H - ins.top - ins.bottom) / H);
    const d = Math.max((box.y1 - box.y0) / 2 / fracH / tv, (box.x1 - box.x0) / 2 / (tv * cam.aspect)) * 1.01;
    const cyN = (ins.bottom - ins.top) / H;
    this.camTo.set((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2 - cyN * d * tv, box.z + d);
    this.group.localToWorld(this.camTo);
    // Calm motion: no travel, the view changes at once.
    if (!this.camInit || this.calm) { cam.position.copy(this.camTo); this.camInit = true; } else cam.position.lerp(this.camTo, Math.min(1, dt * 3.2));
    cam.rotation.set(0, 0, 0);
    return true;
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
    if (this.mode === 'odd' || this.mode === 'link') {
      this.clock += dt;
      if (!this.easy) this.view.setSpeed(this.speedK(), this.speedPoints());
    }
    this.view.tick?.(dt);
  }

  speedK() {
    const [full, zero] = SPEED[this.mode === 'odd' ? 'odd' : this.board.kind];
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
    // Browser: the field fills the screen, so Echo waits outside until the result (the drone is the helper here).
    if (this.screenUI) { this.echoParked = true; this.app.echo?.suppress?.(true); }
    this.startMusic(0, 'lineage');
    let seen = new Set();
    try { seen = new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch { /* private mode */ }
    this.round = drawRound({ easy: this.easy, seen });
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(this.round.ids)); } catch { /* private mode */ }
    const r = this.round;
    this.steps = [
      ...r.rows.map((row) => ({ stage: 0, kind: 'odd', row })),
      ...r.boards.map((b, i) => ({ stage: 1, kind: 'pairs', data: b, first: i === 0, decoy: b.fields.length > b.asks.length })),
      ...r.graphs.map((g, i) => ({ stage: 2, kind: 'graph', data: g, first: i === 0 })),
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
    this.land.userData.setProgress(step.stage + (inStage.indexOf(step) + Math.min(1, part)) / inStage.length);
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
    if (!step) { this.finish(); return; }
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
      const lines = step.kind === 'pairs' ? [t('lineageCard2Text'), t('lineageCardHow')] : [t('lineageCard3Text'), t('lineageCard3More')];
      this.view.showCard({ title: t(step.kind === 'pairs' ? 'lineageCard2Title' : 'lineageCard3Title'), lines, button: t('lineageNext') });
      sfx.appear();
      this.waitThen(this.easy ? null : 9, () => { this.view.showCard(null); this.nextStep(); }, 0.5);
      return;
    }
    if (step.kind === 'odd') this.beginOdd(step.row);
    else this.beginBoard(step);
  }

  // ---------- stage 1: what does not belong? ----------

  beginOdd(row) {
    this.row = row;
    this.mode = 'odd';
    this.clock = 0;
    this.hinted = false;
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
    this.view.showOdd({ tiles, key: row.key });
    this.view.setPrompt(t(row.lvl === 3 ? 'lineageOddPromptMeta' : 'lineageOddPrompt'));
    this.view.setFeedback(null, '');
    this.view.setHint(this.hintLeft > 0 ? 'ready' : null);
    this.view.setSpeed(this.easy ? null : 1, PTS.oddSpeed);
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

  pickOdd(i) {
    if (this.mode !== 'odd' || !this.row.tiles[i] || (this.hinted && this.dimmed.includes(i))) return;
    const row = this.row;
    const right = i === row.odd;
    const st = this.stats;
    st.acts += 1; st.oddN += 1;
    this.mode = 'oddDone';
    this.view.setSpeed(null);
    this.view.setHint(null);
    if (right) {
      st.first += 1; st.oddOk += 1;
      const base = (PTS.odd + Math.round(PTS.oddSpeed * (this.easy ? 0.5 : clamp(1 - (this.clock - SPEED.odd[0]) / (SPEED.odd[1] - SPEED.odd[0]), 0, 1)))) * (this.hinted ? 0.5 : 1);
      this.award(base, { tile: i });
      this.view.markOdd(i, 'right');
      this.view.setFeedback('good', `${t('lineageRight')} ${L(row.why)}`);
      sfx.correct();
    } else {
      this.miss();
      this.view.markOdd(i, 'wrong');
      this.view.markOdd(row.odd, 'answer');
      this.view.setFeedback('bad', `${t('lineageWrong')} ${L(row.why)}`);
      sfx.wrong();
    }
    this.view.lockOdd();
    this.waitThen((right ? 2.6 : 4) + (this.easy ? 1.5 : 0), () => this.nextStep());
  }

  // ---------- stages 2 and 3: connect ----------

  beginBoard(step) {
    const d = step.data;
    let board;
    if (step.kind === 'pairs') {
      board = {
        kind: 'pairs', cols: [t('lineageColDesc'), t('lineageColField')], taken: new Set(), links: [], impact: null,
        nodes: [
          ...d.asks.map((a) => ({ id: a.id, col: 0, kind: 'desc', title: L(a.d), mono: false })),
          ...d.fields.map((f) => ({ id: f.id, col: 1, kind: 'field', title: f.n, mono: true, is: L(f.is),
            meta: { tyKey: f.ty, owKey: f.ow, glyph: TYPES[f.ty].glyph, ty: L(TYPES[f.ty].name), ex: typeof f.ex === 'object' ? L(f.ex) : f.ex, ow: L(OWNERS[f.ow]) } })),
        ],
        needs: d.asks.map((a) => ({ id: a.id, asker: a.id, ans: a.f, text: null, done: false, tries: 0 })),
      };
    } else {
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
    this.view.setPrompt(board.kind === 'pairs' ? t(step.decoy ? 'lineagePairPromptDecoy' : 'lineagePairPrompt') : t('lineageGraphPrompt', { report: board.report }));
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

  boardDone() {
    const b = this.board;
    const speed = this.speedPoints();
    const clean = this.mistakes ? 0 : PTS.clean;
    const bonus = speed + clean;
    this.score += bonus;
    this.view.setSpeed(null);
    this.refreshHud();
    this.app.echo?.celebrate?.();
    if (b.kind === 'graph') {
      this.mode = 'linkDone';
      this.view.setFeedback('good', t(clean ? 'lineageBoardClean' : 'lineageBoardDone', { n: bonus }));
      this.refresh();
      this.waitThen(1.6, () => this.beginImpact(), 0.5);
      return;
    }
    this.mode = 'linkDone';
    this.refresh();
    this.view.setFeedback('good', t(clean ? 'lineageBoardClean' : 'lineageBoardDone', { n: bonus }));
    sfx.coin();
    this.waitThen(2.2 + (this.easy ? 1 : 0), () => this.nextStep(), 0.5);
  }

  // ---------- stage 3: a source changes, which reports are affected? ----------

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

  // ---------- the result ----------

  finish() {
    if (this.mode === 'over') return;
    this.mode = 'over';
    this.view.show(false);
    if (this.echoParked) { this.echoParked = false; this.app.echo?.suppress?.(false); }
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
