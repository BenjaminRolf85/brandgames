// Multiple choice quiz. Also powers the "review" mode (spaced repetition of missed items).
// Look like the game coin (quiz-visuals.js): answers as speech bubbles A to D, a robot buddy that
// thinks along and reacts, glowing question marks.
import * as THREE from 'three';
import { BaseScene, layoutRow } from '../scene.js';
import { useHouse } from '../quiz-decor.js';
import { Button, textPanel } from '../ui3d.js';
import { color, hex } from '../tokens.js';
import { t, L } from '../i18n.js';
import { QUIZ, FACT_MYTH, EVENTS, SPONSOR_QUIZ, TOPICS, shuffle, toMC } from '../content.js';
import { pick, record, reviewIds } from '../progress.js';
import { sfx } from '../sfx.js';
import { AnswerBubble, QuizBot, makeQuestionMarks } from '../quiz-visuals.js';
import { faceOrigin } from '../ui3d.js';
import { sceneLook, softSun, contactShadow, polish, gfxTier } from '../gfx.js';

const ROUND = 6;
// Missed questions coming back at the end would make rounds longer than 6, so it is off for now.
const SECOND_CHANCE = false;

export class QuizScene extends BaseScene {
  constructor(app, mode = 'quiz') {
    super(app);
    this.mode = mode;
    this.name = t(mode === 'review' ? 'reviewName' : 'quizName');
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
    this.lookAndLight();
    this.marks = makeQuestionMarks([[-0.74, this.eye + 0.48, -1.35, 0.14], [0.72, this.eye + 0.56, -1.35, 0.11], [-0.62, this.eye + 0.7, -1.45, 0.08], [0.86, this.eye + 0.34, -1.25, 0.09]]);
    this.group.add(this.marks);
    this.onUpdate((dt) => {
      this.bot.update(dt);
      this.marks.userData.tick(this.bot.time);
    });
    this.intro(this.name, `${t(mode === 'review' ? 'reviewIntro' : 'quizIntro')} ${t(this.house.introKey)}`, () => this.begin());
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
      const key = new THREE.DirectionalLight(hex('xr-quiz-key'), 0.75);
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
    const e = this.engine;
    const portrait = !e.isXR && e.camera.aspect < 0.9;
    const g = this.bot.group;
    if (portrait) {
      g.position.set(0.42, this.eye - 1.42, -1.35);
      g.rotation.set(0, 0, 0);
      g.scale.setScalar(0.7);
    } else {
      g.position.set(0.95, this.eye - 0.25, -1.0);
      faceOrigin(g);
      g.scale.setScalar(0.82);
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
    this.house.reset();
    this.wakeShadows?.(1);
    this.state = { queue: items, total: items.length, i: 0, score: 0, streak: 0, correct: 0, learned: new Map(), retried: new Set() };
    this.ask();
  }

  ask() {
    const { eye, dist, state } = this;
    const item = state.queue[state.i];
    this.clearLayer();
    this.refreshHud();
    this.placeBot();
    // The buddy thinks along; a bonus question makes it go "wow" first.
    this.bot.setMood('think');
    if (item.bonus) this.bot.setMood('wow', 1.2);

    const chip = item.retry ? `${L(TOPICS[item.topic])}  ·  ${t('secondChance')}` : L(TOPICS[item.topic]);
    const q = this.add(textPanel(1.24, 0.24, [
      { text: chip, size: 'xr-text-sm', weight: 'bold', color: color(item.bonus ? 'xr-warning' : 'xr-accent'), gap: 0.02 },
      { text: L(item.q), size: 'xr-text-question', weight: 'bold' },
    ], { surface: item.bonus ? { stroke: color('xr-warning') } : undefined }));
    q.position.set(0, eye + 0.47 - q.h / 2, -dist);
    this.popIn(q);

    // Answers as speech bubbles A to D in a grid: 2 columns, or 3 when there are exactly 3.
    const order = shuffle(item.a.map((_, idx) => idx));
    const cols = order.length === 3 ? 3 : 2;
    const gap = 0.03;
    const w = (1.24 - gap * (cols - 1)) / cols;
    const label = (idx) => L(item.a[idx]);
    const h = Math.max(...order.map((idx) => AnswerBubble.measure(w, 0.14, { label: label(idx) })));
    let y = q.position.y - q.h / 2 - gap - h / 2;
    this.answers = [];
    for (let r = 0; r < order.length; r += cols) {
      const row = order.slice(r, r + cols).map((idx, k) => {
        const b = new AnswerBubble(w, h, { label: label(idx), letter: r + k, onClick: (p, btn) => this.answer(idx, btn, p) });
        b.userData.answerIdx = idx;
        return b;
      });
      layoutRow(row, y, -dist, gap);
      row.forEach((b, k) => { this.add(b); this.popIn(b, 0.06 + (r + k) * 0.05); this.answers.push(b); });
      y -= h + gap;
    }
    this.answersBottom = y + h / 2;
  }

  answer(idx, btn, pointer) {
    const { state, dist } = this;
    const item = state.queue[state.i];
    if (state.locked) return;
    state.locked = true;
    const ok = idx === item.c;
    if (!item.bonus) record(item.id, ok);

    let gained = 0;
    if (ok) {
      state.streak += 1;
      if (!item.retry) {
        state.correct += 1;
        gained = (100 + Math.min(100, (state.streak - 1) * 25)) * (item.bonus ? 2 : 1);
        state.score += gained;
      }
      sfx.correct();
      this.engine.haptic(pointer, 0.6, 60);
      this.burst(btn.getWorldPosition(new THREE.Vector3()), item.bonus ? 'xr-warning' : 'xr-success', item.bonus ? 40 : 22);
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

    let head = ok ? `${t('correct')}  +${gained}` : t('wrong');
    if (ok && item.retry) head = t('retryCorrect');
    if (ok && item.bonus) head = `${t('bonusCorrect')}  +${gained}`;
    if (SECOND_CHANCE && !ok && !item.retry && !item.bonus) head = `${t('wrong')}  ·  ${t('comesBack')}`;
    const fb = this.add(textPanel(0.92, 0.2, [
      { text: head, size: 'xr-text-md', weight: 'bold', color: color(ok ? 'xr-success' : 'xr-danger'), gap: 0.015 },
      { text: L(item.x), size: 'xr-text-sm', color: color('xr-panel-text') },
    ], { layout: { align: 'left' } }));
    const last = state.i === state.queue.length - 1;
    const next = this.add(new Button(0.3, fb.h, {
      label: last ? t('results') : t('next'),
      variant: 'primary',
      grow: false,
      onClick: () => {
        state.locked = false;
        if (last) this.finish();
        else { state.i += 1; this.ask(); }
      },
    }));
    const y = this.answersBottom - 0.04 - fb.h / 2;
    fb.position.set(-0.16, y, -dist);
    next.position.set(0.47, y, -dist);
    this.popIn(fb);
    this.popIn(next, 0.1);
  }

  finish() {
    const s = this.state;
    this.bot.setMood(s.correct / s.total >= 0.7 ? 'happy' : 'idle');
    this.results({
      gameKey: this.mode,
      score: s.score,
      correct: s.correct,
      total: s.total,
      learned: [...s.learned.values()],
      onAgain: () => this.begin(),
    });
  }
}
