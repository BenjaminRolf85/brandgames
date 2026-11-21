// Multiple choice quiz. Also powers the "review" mode (spaced repetition of missed items).
// Look like the game coin (quiz-visuals.js): answers as speech bubbles A to D, a robot buddy that
// thinks along and reacts, glowing question marks.
// As a game (Nov 2026): a speed bonus that runs down slowly (none of it is a penalty), streaks,
// and two jokers per round: 50:50, and "ask the robot", which names an answer and how sure it is
// (it is right about that often: a confident AI can still be wrong). Saved jokers pay at the end.
// Keyboard: A to D or 1 to 4 answer, F and R are the jokers, Enter or Space goes on.
import * as THREE from 'three';
import { BaseScene, layoutRow } from '../scene.js';
import { useHouse } from '../quiz-decor.js';
import { Button, textPanel } from '../ui3d.js';
import { color, hex } from '../tokens.js';
import { t, L } from '../i18n.js';
import { QUIZ, FACT_MYTH, EVENTS, SPONSOR_QUIZ, TOPICS, shuffle, toMC } from '../content.js';
import { pick, record, reviewIds } from '../progress.js';
import { sfx } from '../sfx.js';
import { AnswerBubble, QuizBot, SpeedBar, makeQuestionMarks, floatText, answerLetter } from '../quiz-visuals.js';
import { faceOrigin } from '../ui3d.js';
import { sceneLook, softSun, contactShadow, polish, gfxTier } from '../gfx.js';
import { assist } from '../assist.js';
import '../quiz-text.js';

const ROUND = 6;
// Points of a correct answer: BASE plus up to SPEED for a quick answer (full for the first
// SPEED_GRACE seconds, then it runs down over SPEED_DRAIN seconds) plus the streak bonus; the
// bonus question doubles it. A perfect round stays at 1150 as before, plus the saved jokers.
const BASE = 70;
const SPEED = 30;
const SPEED_GRACE = 4;
const SPEED_DRAIN = 16;
const JOKER_SAVE = 50;
const RANKS = [0, 500, 900]; // points for the ratings quizRank1 to quizRank3
const KEY_ANSWER = { a: 0, b: 1, c: 2, d: 3, 1: 0, 2: 1, 3: 2, 4: 3 };
// Missed questions coming back at the end would make rounds longer than 6, so it is off for now.
const SECOND_CHANCE = false;

export class QuizScene extends BaseScene {
  constructor(app, mode = 'quiz') {
    super(app);
    this.mode = mode;
    this.name = t(mode === 'review' ? 'reviewName' : 'quizName');
    this.phase = 'intro'; // intro | ask | feedback | done
    this.setControls({
      desktop: [[t('quizKeysAnswer'), t('quizActAnswer')], [t('quizKeysJoker'), t('quizActJoker')], [t('quizKeysNext'), t('quizActNext')], [t('quizKeysMouse'), t('quizActMouse')]],
      touch: [[t('quizTouchTap'), t('quizActAnswer')], [t('quizTouchJoker'), t('quizActJoker')]],
      xr: [[t('quizXrPoint'), t('quizActAnswer')]],
    });
    this.refreshHud = this.hud(() => {
      const s = this.state;
      if (!s) return this.name;
      const streak = s.streak > 1 ? `   ·   ${t('streak')} ${s.streak}` : '';
      return `${this.name}   ·   ${Math.min(s.i + 1, s.queue.length)}/${s.queue.length}   ·   ${s.score} ${t('score')}${streak}`;
    });
    useHouse(this);
    // The robot buddy on the right (the knowledge house is on the left), question marks around.
    this.bot = new QuizBot(this.group);
    this.placeBot();
    this.placeDecor();
    this.lookAndLight();
    this.marks = makeQuestionMarks([[-0.74, this.eye + 0.48, -1.35, 0.14], [0.72, this.eye + 0.56, -1.35, 0.11], [-0.62, this.eye + 0.7, -1.45, 0.08], [0.86, this.eye + 0.34, -1.25, 0.09]]);
    this.group.add(this.marks);
    this.onUpdate((dt) => {
      this.bot.update(dt);
      this.marks.userData.tick(this.bot.time);
      // The speed bonus of the open question (game time: it stands still while paused).
      if (this.phase === 'ask' && this.state) {
        this.state.tq += dt;
        this.speedBar?.setValue(this.speedNow() / SPEED, t('quizSpeed', { n: this.speedNow() }));
      }
    });
    this.onKey = (e) => this.key(e);
    window.addEventListener('keydown', this.onKey);
    this.onSceneDispose(() => window.removeEventListener('keydown', this.onKey));
    const deco = t(this.house.introKey === 'treeIntro' ? 'quizIntroTree' : 'quizIntroHouse');
    this.intro(this.name, `${t(mode === 'review' ? 'reviewIntro' : 'quizIntro')} ${deco}`, () => this.begin());
    this.zoom(this.zoomFor('intro'));
  }

  /**
   * Browser: this step's panels are shown larger. The layer is scaled around a point at the top
   * of the UI plane, so everything grows downwards and sideways and the status bar stays put.
   */
  zoom(k) {
    const pivot = new THREE.Vector3(0, this.eye + 0.46, -this.dist);
    this.layer.scale.setScalar(k);
    this.layer.position.copy(pivot).multiplyScalar(1 - k);
  }

  /**
   * How much larger: on the desktop the board fills the screen between the tree and the robot;
   * on a phone held sideways the camera cannot come closer, so the panels grow instead.
   */
  zoomFor(step) {
    const e = this.engine;
    if (e.isXR || this.portrait) return 1;
    if (e.touchUI) return step === 'ask' ? 1.4 : 1.3;
    return step === 'ask' ? 1.32 : 1.2;
  }

  /** Portrait phone screen: one column, so the letters are large and the bubbles easy to hit. */
  get portrait() {
    const e = this.engine;
    return !e.isXR && e.camera.aspect < 0.9;
  }

  /** The speed points an answer would get right now (relaxed mode: always all of them). */
  speedNow() {
    if (assist.easy) return SPEED;
    const k = 1 - (this.state.tq - SPEED_GRACE) / SPEED_DRAIN;
    return Math.round(SPEED * Math.max(0, Math.min(1, k)));
  }

  /** Keyboard (browser): A to D or 1 to 4 answer, F and R are the jokers, Enter or Space goes on. */
  key(e) {
    if (e.repeat || e.altKey || e.ctrlKey || e.metaKey || this.engine.isXR || this.engine.paused || this.disposed) return;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const mouse = this.engine.pointers.find((p) => p.kind === 'mouse');
    if (this.phase === 'ask') {
      if (k in KEY_ANSWER) {
        const b = this.answers[KEY_ANSWER[k]];
        if (b && !b.state.disabled) { e.preventDefault(); this.answer(b.userData.answerIdx, b, mouse); }
      } else if (k === 'f' || k === '5') { e.preventDefault(); this.useHalf(); } else if (k === 'r' || k === '6') { e.preventDefault(); this.useBot(); }
    } else if (this.phase === 'feedback' && (k === 'Enter' || k === ' ' || k === 'ArrowRight')) {
      e.preventDefault();
      sfx.click();
      this.next();
    } else if (this.phase === 'intro' && (k === 'Enter' || k === ' ')) {
      // The start button of the intro.
      const go = this.layer.children.find((o) => o.opts?.variant === 'primary' && o.userData.onClick);
      if (go) { e.preventDefault(); go.userData.onClick(mouse); }
    }
  }

  /**
   * Look: a soft studio environment (reflections on the robot, the baubles and the metal),
   * neutral tone mapping, and a warm key light that casts soft shadows over the house or the
   * tree on its island (not on the lowest effects tier: a contact shadow grounds it there).
   */
  lookAndLight() {
    const tier = gfxTier();
    this.onSceneDispose(sceneLook(this.engine, { tone: 'neutral', exposure: 1.0, env: 'studio', envIntensity: 0.45, shadows: tier === 'low' ? false : 'soft' }));
    const house = this.house.group;
    if (tier !== 'low') {
      // From the upper left front: the shadows fall to the right over the visible snow.
      // The key light carries the scene (so its shadows read); the engine's sky light is
      // turned down while the quiz runs (restored on dispose).
      const hemi = this.engine.hemi;
      const hemiWas = hemi.intensity;
      hemi.intensity = hemiWas * 0.5;
      this.onSceneDispose(() => { hemi.intensity = hemiWas; });
      const key = new THREE.DirectionalLight(hex('xr-quiz-key'), 1.85);
      key.position.set(-0.85, 1.15, 0.55);
      key.target.position.set(0, 0.2, 0);
      softSun(key, { size: 1.1, near: 0.2, far: 4, bias: -0.0006, normalBias: 0.012, radius: 4 });
      house.add(key, key.target);
      this.keyLight = key;
      // The island is still most of the time: its shadow map is only redrawn while something
      // grows, falls or tilts (saves the shadow pass, about as many draw calls as the tree has).
      const sm = this.engine.renderer.shadowMap;
      const auto = sm.autoUpdate;
      sm.autoUpdate = false;
      sm.needsUpdate = true;
      this.onSceneDispose(() => { sm.autoUpdate = auto; sm.needsUpdate = true; });
      let live = 3; // the tree loads in the first seconds
      this.wakeShadows = (sec = 2) => { live = Math.max(live, sec); };
      this.onUpdate((dt) => {
        if (live <= 0) return;
        live -= dt;
        sm.needsUpdate = true;
      });
    } else {
      const blob = contactShadow(0.36, 0.5);
      blob.position.y = 0.002;
      this.house.model.add(blob);
    }
    // Solid parts cast and receive shadows (also the ones that grow later); glows do not.
    const shade = (obj) => {
      obj.traverse((o) => {
        if (o.isMesh && [].concat(o.material).some((m) => m.isMeshBasicMaterial || m.isShaderMaterial)) o.userData.noShadow = true;
      });
      polish(obj, this.engine.renderer);
    };
    shade(this.house.model);
    this.house.onPart = (obj) => { shade(obj); this.wakeShadows?.(2); };
    // The robot buddy: a soft shadow under it (it hovers a little).
    const botBlob = contactShadow(0.17, 0.42);
    botBlob.position.y = -0.005;
    this.bot.group.add(botBlob);
  }

  /** Right of the question, facing you; below the quiz on a phone held upright. */
  placeBot() {
    const portrait = this.portrait;
    const g = this.bot.group;
    if (portrait) {
      g.position.set(0.38, this.eye - 1.38, -1.35);
      g.rotation.set(0, 0, 0);
      g.scale.setScalar(0.6);
    } else {
      // Desktop: further out, next to the larger question board.
      g.position.set(this.desk ? 1.16 : 0.95, this.eye - (this.desk ? 0.42 : 0.25), -1.0);
      faceOrigin(g);
      g.scale.setScalar(0.82);
    }
  }

  /** Desktop (mouse and keyboard): the question board is shown larger, so it fills the screen. */
  get desk() {
    return !this.engine.isXR && !this.engine.touchUI;
  }

  /**
   * The house or the tree next to the larger board. Portrait phones: smaller and a little higher
   * below the quiz (the view zooms in on the questions); desktop: further out and smaller; phones
   * held sideways: further out.
   */
  placeDecor() {
    const g = this.house.group;
    if (this.portrait) {
      g.position.set(0, this.eye - 1.56, -1.4);
      g.rotation.set(0, 0, 0);
      g.scale.setScalar(0.95);
    } else if (this.desk) {
      g.position.set(-1.16, this.eye - 0.5, -1.0);
      faceOrigin(g);
      g.scale.setScalar(1.05);
    } else if (this.engine.touchUI) {
      g.position.set(-1.22, this.eye - 0.12, -1.2);
      faceOrigin(g);
    }
  }

  buildItems() {
    if (this.mode === 'review') return reviewIds(ROUND).map(toMC).filter(Boolean);
    // 4 classic questions + 1 from another format for variety + 1 sponsor bonus question.
    const extras = pick([...FACT_MYTH.map((f) => f.id), ...EVENTS.map((e) => e.id)], 1, (id) => id).map(toMC);
    const items = shuffle([...pick(QUIZ, ROUND - 2), ...extras]);
    const bonus = SPONSOR_QUIZ[Math.floor(Math.random() * SPONSOR_QUIZ.length)];
    items.splice(1 + Math.floor(Math.random() * (ROUND - 1)), 0, bonus);
    return items;
  }

  begin() {
    const items = this.buildItems();
    if (!items.length) {
      this.clearLayer();
      const p = this.add(textPanel(1.0, 0.3, [
        { text: t('reviewEmptyTitle'), size: 'xr-text-lg', weight: 'bold', gap: 0.03 },
        { text: t('reviewEmpty'), size: 'xr-text-md', color: color('xr-panel-muted') },
      ]));
      p.position.set(0, this.eye + 0.44 - p.h / 2, -this.dist);
      const b = this.add(new Button(0.36, 0.12, { label: t('menu'), variant: 'primary', onClick: () => this.app.showMenu() }));
      b.position.set(0, p.position.y - p.h / 2 - 0.1, -this.dist);
      return;
    }
    this.phase = 'ask';
    this.house.reset();
    this.wakeShadows?.(1);
    this.state = {
      queue: items, total: items.length, i: 0, score: 0, streak: 0, bestStreak: 0, correct: 0, learned: new Map(), retried: new Set(),
      tq: 0, jokers: { half: true, bot: true }, tip: null, botMissed: false,
    };
    this.ask();
  }

  ask() {
    const { eye, dist, state } = this;
    const item = state.queue[state.i];
    this.clearLayer();
    this.refreshHud();
    this.placeBot();
    this.placeDecor();
    this.phase = 'ask';
    state.tq = 0;
    state.tip = null;
    // The buddy thinks along; a bonus question makes it go "wow" first.
    this.bot.setMood('think');
    if (item.bonus) this.bot.setMood('wow', 1.2);

    // Portrait phones: a narrower board with one answer per row (the view zooms in on it).
    const portrait = this.portrait;
    const W = portrait ? 1.0 : 1.24;
    this.boardW = W;
    // Everything of the question hangs on one anchor at its top edge.
    const root = this.add(new THREE.Group());
    root.position.set(0, eye + 0.47, -dist);
    this.boardRoot = root;
    this.zoom(this.zoomFor('ask'));
    const chip = item.retry ? `${L(TOPICS[item.topic])}  ·  ${t('secondChance')}` : L(TOPICS[item.topic]);
    const q = this.add(textPanel(W, 0.24, [
      { text: chip, size: 'xr-text-sm', weight: 'bold', color: color(item.bonus ? 'xr-warning' : 'xr-accent'), gap: 0.02 },
      { text: L(item.q), size: 'xr-text-question', weight: 'bold' },
    ], { surface: item.bonus ? { stroke: color('xr-warning') } : undefined }), root);
    q.position.set(0, -q.h / 2, 0);
    this.popIn(q);
    const gap = 0.03;
    let top = q.position.y - q.h / 2;
    // The speed bonus runs down slowly under the question (not in relaxed mode: no clock there).
    this.speedBar = null;
    if (!assist.easy && !item.retry) {
      const bar = this.add(new SpeedBar(W), root);
      bar.position.set(0, top - 0.012 - bar.h / 2, 0);
      bar.setValue(1, t('quizSpeed', { n: SPEED }));
      this.popIn(bar, 0.04);
      this.speedBar = bar;
      top = bar.position.y - bar.h / 2 + 0.012;
    }

    // Answers as speech bubbles A to D in a grid: 2 columns, or 3 when there are exactly 3.
    const order = shuffle(item.a.map((_, idx) => idx));
    const cols = portrait ? 1 : order.length === 3 ? 3 : 2;
    const w = (W - gap * (cols - 1)) / cols;
    const label = (idx) => L(item.a[idx]);
    const h = Math.max(...order.map((idx) => AnswerBubble.measure(w, 0.14, { label: label(idx) })));
    let y = top - gap - h / 2;
    this.answers = [];
    for (let r = 0; r < order.length; r += cols) {
      const row = order.slice(r, r + cols).map((idx, k) => {
        const b = new AnswerBubble(w, h, { label: label(idx), letter: r + k, onClick: (p, btn) => this.answer(idx, btn, p) });
        b.userData.answerIdx = idx;
        b.userData.label = `${answerLetter(r + k)}: ${label(idx)}`;
        return b;
      });
      layoutRow(row, y, 0, gap);
      row.forEach((b, k) => { this.add(b, root); this.popIn(b, 0.06 + (r + k) * 0.05); this.answers.push(b); });
      y -= h + gap;
    }
    this.answersBottom = y + h / 2;
    this.buildJokers();
  }

  /** The two jokers under the answers (each once per round; saved ones pay at the end). */
  buildJokers() {
    const { state } = this;
    const gap = 0.03;
    const w = (this.boardW - gap) / 2;
    const h = this.engine.touchUI ? 0.14 : 0.11;
    const keys = !this.engine.isXR && !this.engine.touchUI;
    const item = state.queue[state.i];
    const make = (kind, labelKey, key, onClick) => {
      const used = !state.jokers[kind];
      const base = t(labelKey);
      const label = used ? t('quizJokerUsed', { label: base }) : keys ? t('quizJokerKey', { label: base, key }) : base;
      const b = new Button(w, h, { label, labelSize: 'xr-text-sm', variant: 'sponsor', grow: false, onClick });
      // 50:50 needs more than two answers.
      if (used || (kind === 'half' && item.a.length < 3)) b.set({ disabled: true });
      return b;
    };
    const half = make('half', 'quizJokerHalf', 'F', () => this.useHalf());
    const bot = make('bot', 'quizJokerBot', 'R', () => this.useBot());
    layoutRow([half, bot], this.answersBottom - 0.04 - h / 2, 0, gap);
    this.jokerRow = [half, bot];
    this.jokerButtons = { half, bot };
    this.jokerRow.forEach((b, i) => { this.add(b, this.boardRoot); this.popIn(b, 0.3 + i * 0.05); });
  }

  /** 50:50: two wrong answers go (one when there are only three answers). */
  useHalf() {
    const { state } = this;
    const item = state.queue[state.i];
    if (this.phase !== 'ask' || !state.jokers.half || item.a.length < 3) return;
    const wrong = shuffle(this.answers.filter((b) => b.userData.answerIdx !== item.c && !b.state.disabled));
    if (wrong.length < 2) return;
    state.jokers.half = false;
    sfx.shatter();
    wrong.slice(0, wrong.length - 1).forEach((b) => b.set({ disabled: true, status: 'muted', tip: false }));
    const b = this.jokerButtons.half;
    b.opts.label = t('quizJokerUsed', { label: t('quizJokerHalf') });
    b.set({ disabled: true });
    b.redraw();
  }

  /**
   * Ask the robot: it names an answer and how sure it is. It is right about that often, so a
   * tip with 70 % is wrong in about three of ten cases: a sure AI can still be wrong.
   */
  useBot() {
    const { state } = this;
    const item = state.queue[state.i];
    if (this.phase !== 'ask' || !state.jokers.bot) return;
    const open = this.answers.filter((b) => !b.state.disabled);
    if (open.length < 2) return;
    state.jokers.bot = false;
    const levels = open.length > 2 ? [60, 70, 70, 80, 80, 90] : [70, 80, 90];
    const percent = levels[Math.floor(Math.random() * levels.length)];
    const right = Math.random() * 100 < percent;
    const wrong = open.filter((b) => b.userData.answerIdx !== item.c);
    const pickB = right ? open.find((b) => b.userData.answerIdx === item.c) : wrong[Math.floor(Math.random() * wrong.length)];
    pickB.set({ tip: true });
    state.tip = { bubble: pickB, percent, right };
    this.bot.setMood('wow', 1.6);
    sfx.appear();
    // Its sentence takes the place of the joker button.
    const old = this.jokerButtons.bot;
    const say = textPanel(old.w, old.h, [{ text: t('quizBotSays', { letter: answerLetter(pickB.opts.letter), percent }), size: 'xr-text-sm', weight: 'bold', color: color('xr-bot-glow') }], { surface: { stroke: color('xr-bot-glow') } });
    say.position.set(old.position.x, old.position.y + (old.h - say.h) / 2, 0);
    this.add(say, this.boardRoot);
    this.popIn(say);
    old.removeFromParent();
    old.dispose();
    this.jokerRow = [this.jokerButtons.half, say];
    this.jokerButtons.bot = say;
    if (this.engine.live) this.engine.live.textContent = t('quizBotSays', { letter: answerLetter(pickB.opts.letter), percent });
  }

  answer(idx, btn, pointer) {
    const { state } = this;
    const root = this.boardRoot;
    const item = state.queue[state.i];
    if (state.locked || this.phase !== 'ask') return;
    state.locked = true;
    this.phase = 'feedback';
    const ok = idx === item.c;
    if (!item.bonus) record(item.id, ok);
    const speed = this.speedBar ? this.speedNow() : assist.easy ? SPEED : 0;
    const calm = assist.reducedMotion;
    const at = btn.getWorldPosition(new THREE.Vector3());

    let gained = 0;
    let streakPts = 0;
    const lostStreak = ok ? 0 : state.streak;
    if (ok) {
      state.streak += 1;
      state.bestStreak = Math.max(state.bestStreak, state.streak);
      if (!item.retry) {
        state.correct += 1;
        streakPts = Math.min(100, (state.streak - 1) * 25);
        gained = (BASE + speed + streakPts) * (item.bonus ? 2 : 1);
        state.score += gained;
      }
      sfx.correct();
      this.engine.haptic(pointer, 0.6, 60);
      this.burst(at, item.bonus ? 'xr-warning' : 'xr-success', Math.round((item.bonus ? 40 : 22) * (calm ? 0.35 : 1)));
      if (gained) floatText(this, `+${gained}`, item.bonus ? 'xr-warning' : 'xr-success', at.clone().add(new THREE.Vector3(0, 0.06, 0.04)));
      // A streak of three or more: the buddy calls it out next to its head.
      if (state.streak >= 3) {
        const head = this.bot.group.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.52 * this.bot.group.scale.y, 0.05));
        this.delay(0.25, () => { floatText(this, t('quizStreakPop', { n: state.streak }), 'xr-warning', head, { size: 0.09, hold: 1.4 }); sfx.powerup(); });
      }
      this.house.good({ bonus: item.bonus });
      this.bot.setMood('happy', 2.4);
    } else {
      this.house.bad();
      this.wakeShadows?.(2.5);
      this.bot.setMood('sad', 2.4);
      state.streak = 0;
      sfx.wrong();
      this.engine.haptic(pointer, 1, 160);
      if (!item.bonus) state.learned.set(item.id, { q: L(item.q), a: L(item.a[item.c]) });
      // Retrieval practice: a missed question comes back once at the end of the round.
      if (SECOND_CHANCE && !item.retry && !item.bonus && !state.retried.has(item.id)) {
        state.retried.add(item.id);
        state.queue.push({ ...item, retry: true });
      }
    }
    for (const b of this.answers) {
      b.set({ disabled: true, status: b.userData.answerIdx === item.c ? 'correct' : b === btn ? 'wrong' : 'muted' });
    }
    this.refreshHud();
    // The jokers make room for the explanation.
    this.jokerRow?.forEach((o) => { o.removeFromParent(); o.dispose?.(); });
    this.jokerRow = null;
    if (this.speedBar) this.speedBar.setValue(ok ? speed / SPEED : 0, ok ? t('quizSpeed', { n: speed }) : t('quizSpeed', { n: 0 }));

    let head = ok ? `${t('correct')}  +${gained}` : t('wrong');
    if (ok && item.retry) head = t('retryCorrect');
    if (ok && item.bonus) head = `${t('bonusCorrect')}  +${gained}`;
    if (SECOND_CHANCE && !ok && !item.retry && !item.bonus) head = `${t('wrong')}  ·  ${t('comesBack')}`;
    // Where the points come from (or which streak ended), in words.
    const parts = [];
    if (ok && gained) {
      if (streakPts) parts.push(t('quizPartStreak', { n: state.streak, p: streakPts }));
      if (speed && !assist.easy) parts.push(t('quizPartSpeed', { p: speed }));
      if (item.bonus) parts.push(t('quizPartBonus'));
    } else if (!ok && lostStreak >= 2) parts.push(t('quizStreakLost', { n: lostStreak }));
    // The robot's tip: was it right? (A sure AI can still be wrong.)
    const tip = state.tip;
    if (tip && !tip.right) state.botMissed = true;
    const portrait = this.portrait;
    const fbW = portrait ? this.boardW : 0.92;
    const fb = this.add(textPanel(fbW, 0.2, [
      { text: head, size: 'xr-text-md', weight: 'bold', color: color(ok ? 'xr-success' : 'xr-danger'), gap: 0.012 },
      ...(parts.length ? [{ text: parts.join('  ·  '), size: 'xr-text-sm', weight: 'bold', color: color('xr-warning'), gap: 0.015 }] : []),
      { text: L(item.x), size: portrait ? 'xr-text-md' : 'xr-text-sm', color: color('xr-panel-text'), gap: 0.015 },
      ...(tip ? [{ text: t(tip.right ? 'quizBotRight' : 'quizBotWrong', { percent: tip.percent }), size: 'xr-text-sm', color: color('xr-bot-glow') }] : []),
    ], { layout: { align: 'left' } }), root);
    const last = state.i === state.queue.length - 1;
    const keys = !this.engine.isXR && !this.engine.touchUI;
    const nextW = portrait ? this.boardW : 0.3;
    const next = this.add(new Button(nextW, portrait ? 0.14 : fb.h, {
      label: last ? t('results') : t('next'),
      body: keys ? t('quizNextKey') : undefined,
      variant: 'primary',
      grow: false,
      onClick: () => this.next(),
    }), root);
    const y = this.answersBottom - 0.04 - fb.h / 2;
    if (portrait) {
      fb.position.set(0, y, 0);
      next.position.set(0, y - fb.h / 2 - 0.03 - next.h / 2, 0);
    } else {
      fb.position.set(-0.16, y, 0);
      next.position.set(0.47, y, 0);
    }
    this.popIn(fb);
    this.popIn(next, 0.1);
    if (this.engine.live) this.engine.live.textContent = `${head}. ${L(item.x)}`;
  }

  /** On to the next question, or to the result after the last one. */
  next() {
    const state = this.state;
    if (this.phase !== 'feedback') return;
    state.locked = false;
    if (state.i === state.queue.length - 1) this.finish();
    else { state.i += 1; this.ask(); }
  }

  finish() {
    const s = this.state;
    this.phase = 'done';
    this.bot.setMood(s.correct / s.total >= 0.7 ? 'happy' : 'idle');
    // Saved jokers pay (not after a round without a single correct answer).
    const saved = (s.jokers.half ? 1 : 0) + (s.jokers.bot ? 1 : 0);
    const jokerPts = s.correct > 0 ? saved * JOKER_SAVE : 0;
    s.score += jokerPts;
    // The rating in three steps, by the points that count (relaxed mode counts a share).
    const counted = Math.round(s.score * assist.scoreFactor);
    let rank = 0;
    while (rank < RANKS.length - 1 && counted >= RANKS[rank + 1]) rank += 1;
    const rankName = t(`quizRank${rank + 1}`);
    const line = [t('quizLine', { n: s.correct, total: s.total, streak: s.bestStreak }), jokerPts ? t('quizJokerBonus', { p: jokerPts }) : null].filter(Boolean).join('  ·  ');
    const learned = [
      { q: t('quizRank', { rank: rankName }), a: rank < RANKS.length - 1 ? t('quizRankNext', { p: RANKS[rank + 1] - counted, rank: t(`quizRank${rank + 2}`) }) : t('quizRankTop') },
      ...(s.botMissed ? [{ q: t('quizBotLesson'), a: t('quizBotLessonText') }] : []),
      ...s.learned.values(),
    ];
    this.zoom(this.zoomFor('results'));
    this.results({
      gameKey: this.mode,
      score: s.score,
      correct: s.correct,
      total: s.total,
      line,
      learned,
      onAgain: () => this.begin(),
    });
  }
}
