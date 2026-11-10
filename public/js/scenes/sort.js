// Grab floating concept cards and drop them into the matching category portal.
// Two random rounds plus the sponsor bonus round (double points); every drop explains the term.
import * as THREE from 'three';
import { BaseScene } from '../scene.js';
import { useHouse } from '../quiz-decor.js';
import { Button, textPanel, placeOnArc, faceOrigin, glowPanel } from '../ui3d.js';
import { color } from '../tokens.js';
import { t, L } from '../i18n.js';
import { SORT_ROUNDS, SPONSOR_SORT_ROUND, shuffle } from '../content.js';
import { record } from '../progress.js';
import { sfx } from '../sfx.js';

const TAP_MS = 350;
const CARD_DIST = 1.15;
const PORTAL_DIST = 1.75;

export class SortScene extends BaseScene {
  constructor(app) {
    super(app);
    this.refreshHud = this.hud(() => {
      if (!this.state) return t('sortName');
      const r = this.state.rounds[this.state.round];
      return `${t('round')} ${this.state.round + 1}/${this.state.rounds.length}: ${L(r.title)}   ·   ${this.state.sorted}/${r.terms.length}   ·   ${this.state.score} ${t('score')}`;
    });
    useHouse(this);
    this.intro(t('sortName'), `${t('sortIntro')} ${t('sortHint')} ${t(this.house.introKey)}`, () => this.begin());
    this.time = 0;
    this.onUpdate((dt) => this.update(dt));
  }

  begin() {
    const rounds = [...shuffle(SORT_ROUNDS).slice(0, 2), SPONSOR_SORT_ROUND];
    this.house.reset();
    this.state = { rounds, round: 0, score: 0, correct: 0, sorted: 0, learned: [] };
    this.buildRound();
  }

  buildRound() {
    const { eye, state } = this;
    const round = state.rounds[state.round];
    this.clearLayer();
    state.sorted = 0;
    this.armed = null;
    this.info = null;
    this.refreshHud();

    const portalH = Math.max(...round.cats.map((c) => Button.measure(0.52, 0.2, { label: L(c), labelSize: 'xr-text-lg' })));
    this.portals = round.cats.map((cat, i) => {
      const portal = new Button(0.52, portalH, {
        label: L(cat),
        labelSize: 'xr-text-lg',
        variant: round.bonus ? 'sponsor' : 'secondary',
        onClick: () => { if (this.armed) this.drop(this.armed, portal); },
      });
      portal.userData.portalIdx = i;
      const glow = glowPanel(0.68, portalH + 0.16, round.bonus ? 'xr-warning' : 'xr-glow');
      glow.position.z = -0.01;
      portal.add(glow);
      portal.userData.glow = glow;
      this.add(placeOnArc(portal, (i - 1) * 0.34, eye + 0.44 - portalH / 2, PORTAL_DIST));
      this.popIn(portal, i * 0.06);
      return portal;
    });

    if (round.bonus) {
      const banner = this.add(textPanel(0.9, 0.08, [{ text: t('sponsorRound'), size: 'xr-text-sm', weight: 'bold', color: color('xr-bg-highlight') }], { surface: false }));
      banner.position.set(0, eye + 0.44 - portalH - 0.08, -PORTAL_DIST + 0.05);
    }

    const angles = [-0.38, 0, 0.38];
    const terms = shuffle(round.terms);
    const cardH = Math.max(...terms.map((term) => Button.measure(0.38, 0.12, { label: L(term.t), labelSize: 'xr-text-sm' })));
    const firstRowY = eye + 0.44 - portalH - 0.2 - cardH / 2;
    this.cardsBottom = firstRowY - (cardH + 0.05) - cardH / 2;
    this.cards = terms.map((term, i) => {
      const card = new Button(0.38, cardH, { label: L(term.t), labelSize: 'xr-text-sm', variant: round.bonus ? 'sponsor' : 'secondary' });
      placeOnArc(card, angles[i % 3], firstRowY - Math.floor(i / 3) * (cardH + 0.05), CARD_DIST);
      Object.assign(card.userData, {
        term,
        cat: term.c,
        home: card.position.clone(),
        phase: Math.random() * Math.PI * 2,
        misses: 0,
        onGrab: (p) => this.grab(card, p),
        onRelease: (p, hit) => this.release(card, p, hit),
      });
      delete card.userData.onClick;
      this.add(card);
      this.popIn(card, 0.2 + i * 0.05);
      return card;
    });
  }

  grab(card, pointer) {
    const ud = card.userData;
    ud.holder = pointer;
    ud.grabTime = performance.now();
    ud.grabDist = pointer.ray.origin.distanceTo(card.getWorldPosition(new THREE.Vector3()));
    ud.moving = false;
    if (this.armed && this.armed !== card) this.armed.set({ status: null });
    this.armed = null;
    card.set({ status: 'selected' });
    sfx.grab();
    this.engine.haptic(pointer, 0.3, 25);
  }

  release(card, pointer, hit) {
    const ud = card.userData;
    ud.holder = null;
    if (hit && hit.userData.portalIdx !== undefined) {
      this.drop(card, hit, pointer);
      return;
    }
    if (performance.now() - ud.grabTime < TAP_MS) this.armed = card;
    else card.set({ status: null });
    this.sendHome(card);
  }

  drop(card, portal, pointer) {
    const { state } = this;
    const ud = card.userData;
    const round = state.rounds[state.round];
    const factor = round.bonus ? 2 : 1;
    this.armed = null;
    const ok = ud.cat === portal.userData.portalIdx;
    if (!round.bonus && ud.misses === 0) record(ud.term.id, ok);
    if (ok) {
      ud.done = true;
      ud.interactive = false;
      ud.moving = true;
      card.set({ status: 'correct' });
      state.score += (ud.misses === 0 ? 100 : 50) * factor;
      if (ud.misses === 0) state.correct += 1;
      state.sorted += 1;
      sfx.correct();
      this.engine.haptic(pointer, 0.6, 60);
      this.house.good({ bonus: round.bonus });
      const target = portal.position.clone();
      const from = card.position.clone();
      this.tween(0.45, (k) => {
        card.position.lerpVectors(from, target, k);
        card.scale.setScalar(1 - 0.85 * k);
      }, {
        onDone: () => {
          card.visible = false;
          this.burst(portal.getWorldPosition(new THREE.Vector3()), round.bonus ? 'xr-warning' : 'xr-success');
        },
      });
      this.refreshHud();
      this.explain(ud.term, round, true);
      if (state.sorted === this.cards.length) this.delay(2.2, () => this.finishRound());
    } else {
      ud.misses += 1;
      if (ud.misses === 1 && !round.bonus) state.learned.push({ q: L(ud.term.t), a: `${L(round.cats[ud.cat])}: ${L(ud.term.x)}` });
      state.score = Math.max(0, state.score - 25);
      card.set({ status: 'wrong' });
      sfx.wrong();
      this.house.bad();
      this.engine.haptic(pointer, 1, 160);
      this.refreshHud();
      this.explain(ud.term, round, false);
      this.sendHome(card, () => this.delay(0.4, () => { if (!ud.holder) card.set({ status: null }); }));
    }
  }

  /** Shows a short explanation below the cards, so every move teaches something. */
  explain(term, round, ok) {
    if (this.info) { this.info.removeFromParent(); this.info.dispose(); }
    const head = ok
      ? `${t('correct')}: ${L(term.t)} → ${L(round.cats[term.c])}`
      : `${t('notThere')}: ${L(term.t)}`;
    const blocks = [{ text: head, size: 'xr-text-sm', weight: 'bold', color: color(ok ? 'xr-success' : 'xr-danger'), gap: 0.01 }];
    if (ok) blocks.push({ text: L(term.x), size: 'xr-text-sm' });
    else blocks.push({ text: t('tryAgainHint'), size: 'xr-text-sm' });
    this.info = this.add(textPanel(1.1, 0.12, blocks, { layout: { align: 'left' } }));
    this.info.position.set(0, this.cardsBottom - 0.08 - this.info.h / 2, -CARD_DIST - 0.02);
  }

  sendHome(card, onDone) {
    const ud = card.userData;
    const from = card.position.clone();
    ud.moving = true;
    this.tween(0.35, (k) => {
      card.position.lerpVectors(from, ud.home, k);
      faceOrigin(card);
    }, { onDone: () => { ud.moving = false; onDone?.(); } });
  }

  finishRound() {
    const { state } = this;
    if (state.round < state.rounds.length - 1) {
      state.round += 1;
      sfx.finish();
      this.buildRound();
    } else {
      const total = state.rounds.reduce((s, r) => s + r.terms.length, 0);
      this.results({ gameKey: 'sort', score: state.score, correct: state.correct, total, learned: state.learned, onAgain: () => this.begin() });
    }
  }

  update(dt) {
    this.time += dt;
    if (!this.cards) return;
    const tmp = new THREE.Vector3();
    for (const card of this.cards) {
      const ud = card.userData;
      if (!card.parent || ud.done) continue;
      if (ud.holder) {
        ud.holder.ray.at(ud.grabDist, tmp);
        card.position.copy(this.layer.worldToLocal(tmp));
        faceOrigin(card);
      } else if (!ud.moving) {
        card.position.y = ud.home.y + Math.sin(this.time * 1.4 + ud.phase) * 0.012;
      }
    }
    for (const portal of this.portals) {
      if (!portal.parent) continue;
      const hover = portal.userData._hover;
      portal.userData.glow.material.opacity = hover ? 0.75 : 0.25 + 0.1 * Math.sin(this.time * 2 + portal.userData.portalIdx);
    }
  }
}
