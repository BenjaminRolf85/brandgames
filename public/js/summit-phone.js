// "Gipfelgespräch" in the browser (desktop and phones; not in the headset): the talk as screen
// elements, so every line and every reply is comfortable to read and works with the mouse, the
// keyboard, a finger and a screen reader. A status bar with the menu button at the top; the talk
// (stage, trust and strength, the customer's line, the AI coach, three big answer buttons and the
// "test a hold" help) below the wall in portrait and to its right in landscape (data-inset keeps
// that part of the screen free of 3D content on phones; the scene reads the same boxes on
// desktop). Styles: css/game-summit.css.
import { t, L } from './i18n.js';
import { STAGES } from './summit-talks.js';

const stage = () => document.getElementById('stage');
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
// Marks that say good, wobbly and weak without color: a check, a wave, a cross (currentColor).
const MARKS = {
  good: 'M5 12.5l4.5 4.5L19 7.5',
  ok: 'M3 12c2-4 4-4 6 0s4 4 6 0 4-4 6 0',
  bad: 'M6 6l12 12M18 6L6 18',
  tested: 'M6 6l12 12M18 6L6 18',
};
const markSVG = (kind) => `<svg class="summit-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${MARKS[kind]}"/></svg>`;

/**
 * The screen talk. Callbacks: onPick(index), onNext(), onHint(), onMenu(), onPreview(index | -1)
 * (an answer is hovered or has the keyboard focus), onSkip() (a tap on the talk while the
 * feedback is shown). desk: the desktop layout (larger type). calm: no transitions.
 */
export function screenTalk({ onPick, onNext, onHint, onMenu, onPreview, onSkip, desk = false, calm = false }) {
  // ---- status bar (top): menu button and one status line ----
  const bar = el('div', `mhud summit-bar${desk ? ' summit-bar--desk' : ''}`);
  bar.dataset.inset = 'top';
  const menu = el('button', 'mhud__menu', t('menu'));
  menu.type = 'button';
  menu.addEventListener('click', () => onMenu?.());
  const barText = el('p', 'mhud__text');
  bar.append(menu, barText);

  // ---- the talk ----
  const root = el('div', `summit-talk${desk ? ' summit-talk--desk' : ''}${calm ? ' is-calm' : ''}`);
  root.dataset.inset = 'bottom';
  root.dataset.insetLand = 'right';
  root.hidden = true;
  bar.hidden = true;

  // The five stages of the talk: pips, the stage's name and what it is about.
  const stageRow = el('p', 'summit-talk__stage');
  const pips = el('span', 'summit-pips');
  const pipEls = STAGES.map(() => pips.appendChild(el('span', 'summit-pip')));
  pips.setAttribute('aria-hidden', 'true');
  const stageText = el('span', 'summit-talk__stagetext');
  stageRow.append(pips, stageText);

  // Trust and strength as two meters, and the streak of solid holds.
  const meters = el('div', 'summit-talk__meters');
  const meter = (cls, label) => {
    const m = el('span', `summit-meter summit-meter--${cls}`);
    const bar2 = el('span', 'summit-meter__bar');
    const fill = el('span', 'summit-meter__fill');
    const val = el('span', 'summit-meter__val');
    bar2.append(fill);
    m.append(el('span', 'summit-meter__name', label), bar2, val);
    meters.append(m);
    return { m, fill, val };
  };
  const trustM = meter('trust', t('summitTrust'));
  const staminaM = meter('stamina', t('summitStamina'));
  const flowChip = el('span', 'summit-flow');
  flowChip.hidden = true;
  meters.append(flowChip);

  const quote = el('p', 'summit-talk__quote');
  quote.setAttribute('aria-live', 'polite');

  // The AI coach: what it reads (mood and type with their probabilities), its tip, and after the
  // reply whether it read the customer right. Next to it the help "test a hold".
  const coachBox = el('div', 'summit-talk__coach');
  const coach = el('p', 'summit-talk__read');
  const tip = el('p', 'summit-talk__tip');
  tip.setAttribute('aria-live', 'polite');
  const hintBtn = el('button', 'summit-hint');
  hintBtn.type = 'button';
  hintBtn.addEventListener('click', () => { if (!hintBtn.disabled) onHint?.(); });
  const coachText = el('div', 'summit-talk__coachtext');
  coachText.append(coach, tip);
  coachBox.append(coachText, hintBtn);

  // A short hint at the moment it matters (first time only), and, at the end of the stage row,
  // the speed bonus that runs down.
  const hint = el('p', 'summit-talk__hint');
  hint.setAttribute('role', 'status');
  hint.hidden = true;
  const speed = el('span', 'summit-talk__speed');
  const speedFill = el('span', 'summit-talk__speedfill');
  const speedText = el('span', 'summit-talk__speedtext');
  const speedBar = el('span', 'summit-talk__speedbar');
  speedBar.append(speedFill);
  speed.append(speedText, speedBar);
  speed.hidden = true;
  stageRow.append(speed);

  const answers = el('div', 'summit-talk__answers');
  root.append(stageRow, meters, quote, coachBox, hint, answers);
  stage()?.append(bar, root);
  root.addEventListener('pointerdown', () => onSkip?.());
  let buttons = [];
  let nextBtn = null;

  const chip = (cls, text, unsure) => el('span', `summit-chip summit-chip--${cls}${unsure ? ' summit-chip--unsure' : ''}`, text);

  const button = (n, text, onPress) => {
    const b = el('button', `summit-answer ${n ? `summit-answer--${n}` : 'summit-answer--plain'}`);
    b.type = 'button';
    if (n) b.append(el('span', 'summit-answer__num', String(n)));
    b.append(el('span', 'summit-answer__text', text));
    b.addEventListener('pointerdown', () => b.classList.add('is-down'));
    const up = () => b.classList.remove('is-down');
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('pointerleave', up);
    b.addEventListener('click', () => { if (!b.disabled) onPress(); });
    return b;
  };

  return {
    el: root,
    bar,
    show(on) {
      if (root.hidden === on) root.hidden = !on;
      if (bar.hidden === on) bar.hidden = !on;
    },

    /** The status line at the top. */
    setStatus(s) { if (barText.textContent !== s) barText.textContent = s; },

    /** Which of the five stages (0..4; 5 = all done), and its name and goal (or another short text). */
    setStage(i, climbing = true, other = '') {
      pipEls.forEach((p, k) => {
        p.classList.toggle('is-done', k < i);
        p.classList.toggle('is-now', k === i && climbing);
      });
      const st = STAGES[Math.min(STAGES.length - 1, i)];
      const text = i >= STAGES.length || !climbing ? other : `${t('summitStageOf', { n: i + 1, total: STAGES.length })} · ${L(st.name)}: ${L(st.goal)}`;
      if (stageText.textContent !== text) stageText.textContent = text;
      stageRow.classList.toggle('is-empty', !text);
    },

    /** The AI coach: mood and type with their probabilities, its tip, or the verdict. */
    setCoach({ phase, mood, type, unsure, verdict, tipText, bonus }) {
      coach.replaceChildren(el('span', 'summit-talk__ai', t('summitCoach')));
      coachBox.hidden = false;
      coachBox.classList.toggle('is-right', !!verdict?.right);
      coachBox.classList.toggle('is-wrong', !!verdict && !verdict.right);
      if (phase === 'reading') {
        coach.append(el('span', 'summit-talk__verdict', t('summitCoachReading')));
        tip.textContent = '';
        return;
      }
      if (verdict) {
        const v = el('span', `summit-talk__judge summit-talk__judge--${verdict.right ? 'right' : 'wrong'}`);
        v.innerHTML = markSVG(verdict.right ? 'good' : 'bad');
        v.append(t(verdict.right ? 'summitCoachRight' : 'summitCoachWrong'));
        coach.append(v, chip(verdict.truth, t('summitCoachTruth', { mood: t(`summitMood_${verdict.truth}`) })));
        tip.textContent = `${bonus ? `${bonus} ` : ''}${verdict.right ? '' : verdict.note ?? ''}`.trim();
        return;
      }
      if (!mood) { coachBox.hidden = true; return; }
      coach.append(chip(mood[0].key, `${t(`summitMood_${mood[0].key}`)} ${Math.round(mood[0].p * 100)} %`, unsure));
      coach.append(chip(type[0].key, `${t(`summitType_${type[0].key}`)} ${Math.round(type[0].p * 100)} %`));
      if (unsure) coach.append(el('span', 'summit-talk__verdict', t('summitCoachUnsure')));
      tip.textContent = tipText ? `${t('summitCoachTip')}: ${tipText}` : '';
    },

    /** The customer's line, the signal words underlined in the colors of their class. */
    setQuote(customer, text, hits = []) {
      quote.replaceChildren();
      if (customer) quote.append(el('span', 'summit-talk__who', `${L(customer.name)} · ${L(customer.role)}`));
      const body = document.createElement('span');
      let at = 0;
      for (const h of [...hits].sort((a, b) => a.start - b.start)) {
        if (h.start < at) continue;
        body.append(text.slice(at, h.start));
        body.append(el('mark', `is-${h.cls}`, text.slice(h.start, h.end)));
        at = h.end;
      }
      body.append(text.slice(at));
      quote.append(body);
    },

    /** Three answers (number and text); onPick(index) when pressed. */
    setAnswers(list) {
      nextBtn = null;
      buttons = list.map((a, i) => {
        const b = button(a.n, a.text, () => onPick(i));
        b.addEventListener('pointerenter', () => { if (!b.disabled) onPreview?.(i); });
        b.addEventListener('pointerleave', () => onPreview?.(-1));
        b.addEventListener('focus', () => onPreview?.(i));
        b.addEventListener('blur', () => onPreview?.(-1));
        return b;
      });
      answers.replaceChildren(...buttons);
    },

    /** Marks an answer: 'good' | 'ok' | 'bad' after the choice, 'tested' by the help. */
    mark(i, kind, tipText, points = '') {
      const b = buttons[i];
      if (!b) return;
      b.classList.add(`is-${kind}`);
      b.disabled = kind === 'bad' || kind === 'tested';
      if (b === document.activeElement && b.disabled) b.blur();
      const title = t(kind === 'good' ? 'summitSolid' : kind === 'ok' ? 'summitWobbly' : kind === 'bad' ? 'summitCrumble' : 'summitTested');
      const tipEl = el('span', 'summit-answer__tip');
      tipEl.innerHTML = markSVG(kind);
      tipEl.append(el('strong', '', `${title}${points ? ` ${points}` : ''} `), tipText);
      b.querySelector('.summit-answer__tip')?.remove();
      b.append(tipEl);
    },

    /** Points of the chosen answer, added to its verdict once Echo has arrived. */
    setPoints(i, points) {
      const s = buttons[i]?.querySelector('.summit-answer__tip strong');
      if (s && points) s.textContent = `${s.textContent.trim()} ${points} `;
    },

    /** How long the feedback stays (0..1 runs up); a thin line on the chosen answer. */
    setDwell(i, k) {
      const b = buttons[i];
      if (!b) return;
      b.classList.toggle('is-dwell', k >= 0);
      b.style.setProperty('--summit-dwell', `${Math.round(Math.max(0, Math.min(1, k)) * 100)}%`);
    },

    /** Highlights the answer whose hold is under the mouse (-1: none). */
    setHot(i) { buttons.forEach((b, k) => b.classList.toggle('is-hot', k === i)); },

    /** Moves the keyboard focus through the answers that can still be chosen. */
    focusAnswer(dir) {
      const list = buttons.filter((b) => !b.disabled);
      if (!list.length) return;
      const at = list.indexOf(document.activeElement);
      const next = at < 0 ? (dir > 0 ? 0 : list.length - 1) : (at + dir + list.length) % list.length;
      list[next].focus();
    },

    /** Disables all answers (while Echo climbs). */
    lock(on) {
      buttons.forEach((b) => {
        if (b.classList.contains('is-bad') || b.classList.contains('is-tested')) return;
        if (on && b === document.activeElement) b.blur();
        b.disabled = on;
      });
      if (on) onPreview?.(-1);
    },

    /** The help "test a hold": how many are left, and whether it can be used right now. */
    setHint(left, usable, label) {
      hintBtn.textContent = label;
      hintBtn.disabled = !usable;
      hintBtn.hidden = left < 0;
    },

    /** A short hint line (null hides it). */
    setHintLine(text) {
      hint.hidden = !text;
      if (text && hint.textContent !== text) hint.textContent = text;
    },

    /** The speed bonus that is still there (points; k 0..1), or hidden. */
    setSpeed(points, k) {
      speed.hidden = points == null;
      if (points == null) return;
      const s = t('summitSpeedBonus', { n: points });
      if (speedText.textContent !== s) speedText.textContent = s;
      speedFill.style.width = `${Math.round(k * 100)}%`;
    },

    /** A summary (a new customer, the summit) with one button to go on. */
    setSummary(lines, label) {
      coachBox.hidden = true;
      speed.hidden = true;
      hint.hidden = true;
      quote.replaceChildren(...lines.map((l, i) => el(i ? 'span' : 'strong', i ? 'summit-talk__who' : '', l)));
      nextBtn = label ? button(0, label, () => onNext?.()) : null;
      buttons = nextBtn ? [nextBtn] : [];
      answers.replaceChildren(...buttons);
    },

    clearAnswers() { buttons = []; nextBtn = null; answers.replaceChildren(); },

    /** Trust and strength (0..100) and the streak of solid holds. */
    setMeters(trust, stamina, flow = 0) {
      for (const [m, v] of [[trustM, trust], [staminaM, stamina]]) {
        const w = `${Math.round(v)}%`;
        if (m.fill.style.width !== w) { m.fill.style.width = w; m.val.textContent = `${Math.round(v)} %`; }
      }
      staminaM.m.classList.toggle('is-low', stamina < 30);
      flowChip.hidden = flow < 2;
      const s = t('summitFlow', { n: flow });
      if (!flowChip.hidden && flowChip.textContent !== s) {
        flowChip.textContent = s;
        flowChip.classList.remove('is-pop');
        void flowChip.offsetWidth;
        flowChip.classList.add('is-pop');
      }
    },

    /** The part of the screen the talk covers: { right } beside the wall or { bottom } below it. */
    insets() {
      const W = window.innerWidth;
      const H = window.innerHeight;
      const out = { top: 0, bottom: 0, right: 0 };
      if (!bar.hidden) out.top = bar.getBoundingClientRect().bottom + 6;
      if (root.hidden) return out;
      const r = root.getBoundingClientRect();
      if (r.width < W * 0.8) out.right = W - r.left + 6;
      else out.bottom = H - r.top + 6;
      return out;
    },

    remove() { root.remove(); bar.remove(); },
  };
}
