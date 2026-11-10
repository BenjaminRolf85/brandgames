// Tap AI milestones in chronological order; placed events reveal their year and story.
import * as THREE from 'three';
import { BaseScene } from '../scene.js';
import { useHouse } from '../quiz-decor.js';
import { Button, textPanel, measureBlocks } from '../ui3d.js';
import { color, hex } from '../tokens.js';
import { t, L } from '../i18n.js';
import { EVENTS, TIMELINE_ROUNDS, shuffle } from '../content.js';
import { record } from '../progress.js';
import { sfx } from '../sfx.js';

const ROUNDS = 4;
const SLOT_W = 0.3;
const SLOT_GAP = 0.02;

export class TimelineScene extends BaseScene {
  constructor(app) {
    super(app);
    this.refreshHud = this.hud(() => this.state
      ? `${t('timelineName')}   ·   ${t('round')} ${this.state.round + 1}/${ROUNDS}   ·   ${this.state.score} ${t('score')}`
      : t('timelineName'));
    useHouse(this);
    this.intro(t('timelineName'), `${t('timelineIntro')} ${t(this.house.introKey)}`, () => this.begin());
  }

  begin() {
    const rounds = shuffle(TIMELINE_ROUNDS).slice(0, ROUNDS)
      .map((ids) => ids.map((id) => EVENTS.find((e) => e.id === id)));
    this.house.reset();
    this.state = { rounds, round: 0, score: 0, correct: 0, learned: [] };
    this.buildRound();
  }

  buildRound() {
    const { eye, dist, state } = this;
    const events = state.rounds[state.round];
    this.clearLayer();
    this.refreshHud();
    this.sorted = events.slice().sort((a, b) => a.y - b.y);
    this.placed = 0;
    this.slotMiss = false;
    this.info = null;

    const hint = this.add(textPanel(1.24, 0.1, [{ text: t('timelineHint'), size: 'xr-text-md', weight: 'bold' }]));
    hint.position.set(0, eye + 0.47 - hint.h / 2, -dist);
    this.popIn(hint);

    const w = 0.61;
    const h = Math.max(...events.map((e) => Button.measure(w, 0.13, { label: L(e.t) })));
    let y = hint.position.y - hint.h / 2 - 0.03 - h / 2;
    this.buttons = [];
    shuffle(events).forEach((ev, i) => {
      const b = new Button(w, h, { label: L(ev.t), onClick: (p, btn) => this.choose(ev, btn, p) });
      b.position.set(i % 2 === 0 ? -0.315 : 0.315, y - Math.floor(i / 2) * (h + 0.03), -dist);
      this.add(b);
      this.popIn(b, 0.05 + i * 0.05);
      this.buttons.push(b);
    });
    y -= 2 * (h + 0.03) + 0.03;

    // The timeline: an arrow-like line with four slots, oldest on the left.
    this.slotH = Math.max(0.14, ...events.map((e) => measureBlocks(this.slotBlocks(e), SLOT_W)));
    this.slotY = y - this.slotH / 2;
    const lineW = 4 * SLOT_W + 3 * SLOT_GAP + 0.1;
    const line = new THREE.Mesh(new THREE.PlaneGeometry(lineW, 0.012), new THREE.MeshBasicMaterial({ color: hex('xr-glow') }));
    line.position.set(0, this.slotY, -dist - 0.01);
    this.add(line);
    this.slots = [0, 1, 2, 3].map((i) => {
      const slot = textPanel(SLOT_W, this.slotH, [{ text: `${i + 1}`, size: 'xr-text-lg', weight: 'black', color: color('xr-panel-muted') }]);
      slot.position.set(-1.5 * (SLOT_W + SLOT_GAP) + i * (SLOT_W + SLOT_GAP), this.slotY, -dist);
      slot.material.opacity = 0.6;
      this.add(slot);
      return slot;
    });
    this.timelineBottom = this.slotY - this.slotH / 2;
  }

  slotBlocks(ev) {
    return [
      { text: String(ev.y), size: 'xr-text-lg', weight: 'black', color: color('xr-accent'), gap: 0.01 },
      { text: L(ev.t), size: 'xr-text-sm' },
    ];
  }

  choose(ev, btn, pointer) {
    const { state, dist } = this;
    if (this.locked) return;
    const expected = this.sorted[this.placed];
    if (ev !== expected) {
      this.slotMiss = true;
      record(ev.id, false);
      state.learned.push({ q: L(ev.t), a: `${ev.y}: ${L(ev.x)}` });
      btn.set({ status: 'wrong' });
      sfx.wrong();
      this.house.bad();
      this.engine.haptic(pointer, 1, 160);
      this.delay(0.6, () => btn.parent && btn.set({ status: null }));
      this.explain(t('notYet'), t('timelineTip'), false);
      return;
    }
    record(ev.id, !this.slotMiss);
    state.score += this.slotMiss ? 50 : 100;
    if (!this.slotMiss) state.correct += 1;
    this.slotMiss = false;
    sfx.correct();
    this.engine.haptic(pointer, 0.6, 60);
    this.house.good();
    btn.set({ disabled: true, status: 'correct' });
    btn.userData.interactive = false;
    this.tween(0.3, (k) => btn.scale.setScalar(1 - k * 0.999), { onDone: () => { btn.visible = false; } });

    const old = this.slots[this.placed];
    const filled = textPanel(SLOT_W, this.slotH, this.slotBlocks(ev), { surface: { stroke: color('xr-success') } });
    filled.position.copy(old.position);
    old.removeFromParent();
    old.dispose();
    this.slots[this.placed] = filled;
    this.add(filled);
    this.popIn(filled);
    this.burst(filled.getWorldPosition(new THREE.Vector3()), 'xr-success', 16);
    this.placed += 1;
    this.refreshHud();
    this.explain(`${ev.y}: ${L(ev.t)}`, L(ev.x), true);

    if (this.placed === 4) {
      this.locked = true;
      const last = state.round === ROUNDS - 1;
      const next = this.add(new Button(0.4, 0.12, {
        label: last ? t('results') : t('next'),
        variant: 'primary',
        onClick: () => {
          this.locked = false;
          if (last) {
            this.results({ gameKey: 'timeline', score: state.score, correct: state.correct, total: ROUNDS * 4, learned: state.learned, onAgain: () => this.begin() });
          } else {
            state.round += 1;
            this.buildRound();
          }
        },
      }));
      next.position.set(0, this.info.position.y - this.info.h / 2 - 0.04 - next.h / 2, -dist);
      this.popIn(next, 0.2);
    }
  }

  explain(head, text, ok) {
    if (this.info) { this.info.removeFromParent(); this.info.dispose(); }
    this.info = this.add(textPanel(1.24, 0.12, [
      { text: head, size: 'xr-text-sm', weight: 'bold', color: color(ok ? 'xr-success' : 'xr-danger'), gap: 0.01 },
      { text, size: 'xr-text-sm' },
    ], { layout: { align: 'left' } }));
    this.info.position.set(0, this.timelineBottom - 0.04 - this.info.h / 2, -this.dist);
  }
}

