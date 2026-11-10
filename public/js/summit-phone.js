// "Gipfelgespräch" on phones and tablets (engine.touchUI): the talk as a screen element with big
// answer buttons, so every reply stays readable. Portrait: below the wall; landscape: to its
// right (data-inset keeps that part of the screen free of 3D content). Styles: css/game-summit.css.
import { t, L } from './i18n.js';

const stage = () => document.getElementById('stage');

export function phoneTalk({ onPick, onNext }) {
  const el = document.createElement('div');
  el.className = 'summit-talk';
  el.dataset.inset = 'bottom';
  el.dataset.insetLand = 'right';
  el.hidden = true;
  const coach = Object.assign(document.createElement('p'), { className: 'summit-talk__coach' });
  // Trust and strength as two small meters.
  const meters = Object.assign(document.createElement('div'), { className: 'summit-talk__meters' });
  const meter = (cls, label) => {
    const m = Object.assign(document.createElement('span'), { className: `summit-meter summit-meter--${cls}` });
    const name = Object.assign(document.createElement('span'), { className: 'summit-meter__name', textContent: label });
    const bar = Object.assign(document.createElement('span'), { className: 'summit-meter__bar' });
    const fill = Object.assign(document.createElement('span'), { className: 'summit-meter__fill' });
    const val = Object.assign(document.createElement('span'), { className: 'summit-meter__val' });
    bar.append(fill);
    m.append(name, bar, val);
    meters.append(m);
    return { m, fill, val };
  };
  const trustM = meter('trust', t('summitTrust'));
  const staminaM = meter('stamina', t('summitStamina'));
  const quote = Object.assign(document.createElement('p'), { className: 'summit-talk__quote' });
  const answers = Object.assign(document.createElement('div'), { className: 'summit-talk__answers' });
  el.append(meters, coach, quote, answers);
  stage()?.append(el);
  let buttons = [];

  const chip = (cls, text, unsure) => {
    const s = document.createElement('span');
    s.className = `summit-chip summit-chip--${cls}${unsure ? ' summit-chip--unsure' : ''}`;
    s.textContent = text;
    return s;
  };

  const button = (n, text, onPress) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `summit-answer ${n ? `summit-answer--${n}` : 'summit-answer--plain'}`;
    if (n) {
      const num = Object.assign(document.createElement('span'), { className: 'summit-answer__num', textContent: String(n) });
      b.append(num);
    }
    const label = Object.assign(document.createElement('span'), { className: 'summit-answer__text', textContent: text });
    b.append(label);
    b.addEventListener('pointerdown', () => b.classList.add('is-down'));
    const up = () => b.classList.remove('is-down');
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('pointerleave', up);
    b.addEventListener('click', () => { if (!b.disabled) onPress(); });
    return b;
  };

  return {
    el,
    show(on) { if (el.hidden === on) el.hidden = !on; },

    /** The AI coach in one line: mood and type with their probabilities (or a verdict). */
    setCoach({ phase, mood, type, unsure, verdict }) {
      coach.replaceChildren(Object.assign(document.createElement('span'), { className: 'summit-talk__ai', textContent: t('summitCoach') }));
      if (phase === 'reading') {
        coach.append(Object.assign(document.createElement('span'), { className: 'summit-talk__verdict', textContent: t('summitCoachReading') }));
        return;
      }
      if (verdict) {
        const v = Object.assign(document.createElement('span'), { textContent: t(verdict.right ? 'summitCoachRight' : 'summitCoachWrong') });
        v.style.color = `var(--xr-${verdict.right ? 'success' : 'danger'})`;
        coach.append(v, chip(verdict.truth, t('summitCoachTruth', { mood: t(`summitMood_${verdict.truth}`) })));
        if (!verdict.right && verdict.note) coach.append(Object.assign(document.createElement('span'), { className: 'summit-talk__verdict', textContent: verdict.note }));
        return;
      }
      if (!mood) { coach.hidden = true; return; }
      coach.hidden = false;
      coach.append(chip(mood[0].key, `${t(`summitMood_${mood[0].key}`)} ${Math.round(mood[0].p * 100)} %`, unsure));
      coach.append(chip(type[0].key, `${t(`summitType_${type[0].key}`)} ${Math.round(type[0].p * 100)} %`));
      if (unsure) coach.append(Object.assign(document.createElement('span'), { className: 'summit-talk__verdict', textContent: t('summitCoachUnsure') }));
    },

    /** The customer's line, the signal words underlined in the colors of their class. */
    setQuote(customer, text, hits = []) {
      quote.replaceChildren();
      if (customer) quote.append(Object.assign(document.createElement('span'), { className: 'summit-talk__who', textContent: `${L(customer.name)} · ${L(customer.role)}` }));
      const body = document.createElement('span');
      let at = 0;
      for (const h of [...hits].sort((a, b) => a.start - b.start)) {
        if (h.start < at) continue;
        body.append(text.slice(at, h.start));
        body.append(Object.assign(document.createElement('mark'), { className: `is-${h.cls}`, textContent: text.slice(h.start, h.end) }));
        at = h.end;
      }
      body.append(text.slice(at));
      quote.append(body);
    },

    /** Three answers (number and text); onPick(index) when tapped. */
    setAnswers(list) {
      buttons = list.map((a, i) => button(a.n, a.text, () => onPick(i)));
      answers.replaceChildren(...buttons);
    },

    /** Marks an answer after the choice: 'good' | 'ok' | 'bad' with the coach's tip. */
    mark(i, kind, tip) {
      const b = buttons[i];
      if (!b) return;
      b.classList.add(`is-${kind}`);
      b.disabled = kind === 'bad';
      const tipEl = Object.assign(document.createElement('span'), { className: 'summit-answer__tip', textContent: `${t(kind === 'good' ? 'summitSolid' : kind === 'ok' ? 'summitWobbly' : 'summitCrumble')} ${tip}` });
      b.append(tipEl);
    },

    /** Disables all answers (while Echo climbs). */
    lock(on) { buttons.forEach((b) => { if (!b.classList.contains('is-bad')) b.disabled = on; }); },

    /** A summary (e.g. at the summit) with one button to go on. */
    setSummary(lines, label) {
      coach.hidden = true;
      quote.replaceChildren(...lines.map((l, i) => Object.assign(document.createElement(i ? 'span' : 'strong'), { className: i ? 'summit-talk__who' : '', textContent: l })));
      buttons = label ? [button(0, label, () => onNext?.())] : [];
      answers.replaceChildren(...buttons);
    },

    clearAnswers() { buttons = []; answers.replaceChildren(); },

    /** Trust and strength (0..100). */
    setMeters(trust, stamina) {
      for (const [m, v] of [[trustM, trust], [staminaM, stamina]]) {
        const w = `${Math.round(v)}%`;
        if (m.fill.style.width !== w) { m.fill.style.width = w; m.val.textContent = `${Math.round(v)} %`; }
      }
      staminaM.m.classList.toggle('is-low', stamina < 30);
    },
    remove() { el.remove(); },
  };
}
