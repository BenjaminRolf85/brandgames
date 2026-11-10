// Statements fly towards the player, who decides "fact" or "myth" against the clock.
import * as THREE from 'three';
import { BaseScene } from '../scene.js';
import { useHouse } from '../quiz-decor.js';
import { Button, textPanel } from '../ui3d.js';
import { color, hex, num } from '../tokens.js';
import { t, L } from '../i18n.js';
import { FACT_MYTH, SPONSOR_FM, shuffle } from '../content.js';
import { pick, record } from '../progress.js';
import { sfx } from '../sfx.js';

const ROUND = 6;
const START_Z = -4.2;

export class FactMythScene extends BaseScene {
  constructor(app) {
    super(app);
    this.duration = num('xr-answer-time');
    this.refreshHud = this.hud(() => this.state
      ? `${t('factmythName')}   ·   ${this.state.i + 1}/${ROUND}   ·   ${this.state.score} ${t('score')}`
      : t('factmythName'));
    useHouse(this);
    this.intro(t('factmythName'), `${t('fmIntro')} ${t(this.house.introKey)}`, () => this.begin());
  }

  begin() {
    const items = shuffle(pick(FACT_MYTH, ROUND - 1));
    items.splice(1 + Math.floor(Math.random() * (ROUND - 1)), 0, SPONSOR_FM[Math.floor(Math.random() * SPONSOR_FM.length)]);
    this.house.reset();
    this.state = { items, i: 0, score: 0, correct: 0, learned: [] };
    this.next();
  }

  next() {
    const { eye, dist, state } = this;
    const item = state.items[state.i];
    this.clearLayer();
    this.refreshHud();
    if (this.tick) this.offUpdate(this.tick);

    const blocks = [{ text: L(item.s), size: 'xr-text-question', weight: 'bold' }];
    if (item.bonus) blocks.unshift({ text: t('sponsorBonus'), size: 'xr-text-sm', weight: 'bold', color: color('xr-warning'), gap: 0.02 });
    const card = this.add(textPanel(1.0, 0.3, blocks, { surface: item.bonus ? { stroke: color('xr-warning') } : undefined }));
    card.userData.noFit = true;
    // Card stays high, buttons sit below eye level so the incoming card never covers them.
    const btnY = eye - 0.24;
    const cardY = Math.max(eye + 0.44 - card.h / 2, btnY + 0.09 + 0.12 + card.h / 2);
    const endZ = -dist - 0.05;
    card.position.set(0, cardY, START_Z);

    const barY = -card.h / 2 - 0.025;
    const barBg = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.016), new THREE.MeshBasicMaterial({ color: hex('xr-button-bg') }));
    barBg.position.set(0, barY, 0.001);
    const barMat = new THREE.MeshBasicMaterial({ color: hex('xr-accent') });
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.016), barMat);
    bar.position.set(0, barY, 0.002);
    card.add(barBg, bar);

    this.choice = [
      new Button(0.5, 0.18, { label: t('fact'), variant: 'success', labelSize: 'xr-text-lg', onClick: (p, b) => this.decide(true, b, p) }),
      new Button(0.5, 0.18, { label: t('myth'), variant: 'danger', labelSize: 'xr-text-lg', onClick: (p, b) => this.decide(false, b, p) }),
    ];
    this.choice.forEach((b, i) => {
      b.position.set(i === 0 ? -0.28 : 0.28, btnY, -dist);
      this.add(b);
      this.popIn(b, 0.05 * i);
    });
    this.feedbackTop = btnY + 0.09;

    let elapsed = 0;
    state.locked = false;
    this.card = card;
    this.tick = this.onUpdate((dt) => {
      if (state.locked) return;
      elapsed += dt;
      const k = Math.min(1, elapsed / this.duration);
      card.position.z = START_Z + (endZ - START_Z) * k;
      card.position.y = cardY + Math.sin(elapsed * 2.2) * 0.012;
      bar.scale.x = Math.max(0.0001, 1 - k);
      bar.position.x = -0.45 * k;
      barMat.color.setHex(hex(k > 0.7 ? 'xr-warning' : 'xr-accent'));
      state.remaining = 1 - k;
      if (k >= 1) this.decide(null, null, null);
    });
  }

  decide(value, btn, pointer) {
    const { state, dist } = this;
    if (state.locked) return;
    state.locked = true;
    const item = state.items[state.i];
    const ok = value === item.f;
    if (!item.bonus) record(item.id, ok);
    let gained = 0;
    if (ok) {
      gained = (50 + Math.round(150 * state.remaining)) * (item.bonus ? 2 : 1);
      state.score += gained;
      state.correct += 1;
      sfx.correct();
      this.engine.haptic(pointer, 0.6, 60);
      this.burst(btn.getWorldPosition(new THREE.Vector3()), item.bonus ? 'xr-warning' : 'xr-success', item.bonus ? 40 : 22);
      this.house.good({ bonus: item.bonus });
    } else {
      this.house.bad();
      sfx.wrong();
      this.engine.haptic(pointer, 1, 160);
      if (!item.bonus) state.learned.push({ q: L(item.s), a: t('itIs', { x: item.f ? t('fact') : t('myth') }) });
    }
    this.refreshHud();
    const card = this.card;
    const fromZ = card.position.z;
    this.tween(0.4, (k) => { card.position.z = fromZ + (-dist - 0.05 - fromZ) * k; });

    this.choice.forEach((b) => { b.removeFromParent(); b.dispose(); });
    const verdict = t('itIs', { x: item.f ? t('fact') : t('myth') });
    const head = value === null ? `${t('timeUp')}. ${verdict}` : ok ? `${t('correct')}  +${gained}. ${verdict}` : `${t('wrong')}. ${verdict}`;
    const fb = this.add(textPanel(0.92, 0.2, [
      { text: head, size: 'xr-text-md', weight: 'bold', color: color(ok ? 'xr-success' : 'xr-danger'), gap: 0.015 },
      { text: L(item.x), size: 'xr-text-sm' },
    ], { layout: { align: 'left' } }));
    const y = this.feedbackTop - fb.h / 2;
    fb.position.set(-0.16, y, -dist);
    this.popIn(fb);

    const last = state.i === ROUND - 1;
    const next = this.add(new Button(0.3, fb.h, {
      label: last ? t('results') : t('next'),
      variant: 'primary',
      grow: false,
      onClick: () => {
        if (last) {
          this.offUpdate(this.tick);
          this.results({ gameKey: 'factmyth', score: state.score, correct: state.correct, total: ROUND, learned: state.learned, onAgain: () => this.begin() });
        } else {
          state.i += 1;
          this.next();
        }
      },
    }));
    next.position.set(0.47, y, -dist);
    this.popIn(next, 0.1);
  }
}
