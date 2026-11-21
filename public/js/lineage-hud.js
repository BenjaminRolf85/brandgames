// "Datenspur" in the browser (desktop and phones): the slim screen elements around the 3D room.
// A status bar (menu, points, streak), the three stages as a strip, the prompt with the speed
// bonus and the AI hint, one line of feedback at the foot of the screen, and the card that opens
// a stage. Everything that is played is in the room (lineage-room.js). Styles: css/game-lineage.css.
import { t } from './i18n.js';

const stage = () => document.getElementById('stage');
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
// Marks that say right and wrong without color, the assistant's spark, the streak's bolt.
const ICONS = {
  good: 'M5 12.5l4.5 4.5L19 7.5',
  bad: 'M6 6l12 12M18 6L6 18',
  info: 'M12 8v.01M12 11.5V17',
  ai: 'M12 3l1.9 5.6L19.5 10.5 13.9 12.4 12 18l-1.9-5.6L4.5 10.5l5.6-1.9zM19 16l.7 2.1 2.1.7-2.1.7L19 21.6l-.7-2.1-2.1-.7 2.1-.7z',
  bolt: 'M13 3L5 13.5h6L10 21l8-10.5h-6z',
};
const icon = (kind) => `<svg class="lin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${ICONS[kind]}"/></svg>`;

export function screenHud({ onHint, onNext, onMenu, desk = false, calm = false }) {
  const bar = el('div', `mhud lin-bar${desk ? ' lin-bar--desk' : ''}`);
  bar.dataset.inset = 'top';
  const menu = el('button', 'mhud__menu', t('menu'));
  menu.type = 'button';
  menu.addEventListener('click', () => onMenu?.());
  const score = el('span', 'lin-bar__score');
  const streak = el('span', 'lin-bar__streak');
  bar.append(menu, score, streak);

  const root = el('div', `lin-play${desk ? ' lin-play--desk' : ''}${calm ? ' is-calm' : ''}`);
  const head = el('div', 'lin-head');
  const strip = el('ol', 'lin-strip');
  const pills = [1, 2, 3].map((n) => {
    const li = el('li', 'lin-strip__item');
    const fill = el('span', 'lin-strip__fill');
    li.append(fill, el('span', 'lin-strip__num', String(n)), el('span', 'lin-strip__name', t(`lineageStage${n}`)));
    strip.append(li);
    return { li, fill };
  });
  const row = el('div', 'lin-row');
  const prompt = el('p', 'lin-prompt');
  prompt.setAttribute('aria-live', 'polite');
  const speed = el('span', 'lin-speed');
  const speedText = el('span', 'lin-speed__text');
  const speedBar = el('span', 'lin-speed__bar');
  const speedFill = el('span', 'lin-speed__fill');
  speedBar.append(speedFill);
  speed.append(speedText, speedBar);
  speed.hidden = true;
  const hint = el('button', 'lin-hint');
  hint.type = 'button';
  hint.innerHTML = icon('ai');
  hint.append(t(desk ? 'lineageHintKey' : 'lineageHint'));
  hint.hidden = true;
  hint.addEventListener('click', () => onHint?.());
  row.append(prompt, speed, hint);
  head.append(strip, row);
  root.append(head);

  const foot = el('div', `lin-foot${desk ? ' lin-foot--desk' : ''}${calm ? ' is-calm' : ''}`);
  const feedback = el('p', 'lin-feedback');
  feedback.setAttribute('role', 'status');
  foot.append(feedback);

  const cardWrap = el('div', `lin-cardwrap${calm ? ' is-calm' : ''}`);
  for (const e of [bar, root, foot, cardWrap]) e.hidden = true;
  stage()?.append(bar, root, foot, cardWrap);

  return {
    show(on) {
      bar.hidden = !on;
      root.hidden = !on;
      foot.hidden = !on;
      if (!on) cardWrap.hidden = true;
    },

    setHud({ score: s, streak: n, multText, mult, stage: st, done, total }) {
      // Narrow phones show the numbers only (the words are still read out).
      const txt = t('lineageScore', { n: s });
      if (score.dataset.v !== txt) {
        score.dataset.v = txt;
        const [num, ...rest] = txt.split(' ');
        score.replaceChildren(num, el('span', 'lin-bar__word', ` ${rest.join(' ')}`));
        score.setAttribute('aria-label', txt);
      }
      const sTxt = `${t('lineageStreak', { n })}${mult > 1 ? ` ${multText}` : ''}`;
      if (streak.dataset.v !== sTxt) {
        streak.dataset.v = sTxt;
        streak.innerHTML = icon('bolt');
        streak.append(el('span', 'lin-bar__word', `${t('lineageStreak', { n: '' }).trim()} `), `${n}${mult > 1 ? ` ${multText}` : ''}`);
        streak.setAttribute('aria-label', sTxt);
        streak.classList.toggle('is-hot', mult > 1);
        streak.classList.remove('is-pop');
        if (n > 0) { void streak.offsetWidth; streak.classList.add('is-pop'); }
      }
      pills.forEach((p, i) => {
        p.li.classList.toggle('is-done', i < st);
        p.li.classList.toggle('is-now', i === st);
        p.li.setAttribute('aria-current', i === st ? 'step' : 'false');
        p.fill.style.width = i === st ? `${Math.round((done / Math.max(1, total)) * 100)}%` : '0';
      });
    },

    setPrompt(text) { if (prompt.textContent !== text) prompt.textContent = text; },

    setFeedback(kind, text) {
      const box = el('span', `lin-feedback__box${kind ? ` is-${kind} is-new` : ''}`);
      box.innerHTML = kind ? icon(kind) : '';
      box.append(el('span', '', text ?? ''));
      feedback.replaceChildren(box);
    },

    setSpeed(k, points) {
      speed.hidden = k == null;
      if (k == null) return;
      const s = `${t('lineageSpeed')} +${points}`;
      if (speedText.textContent !== s) speedText.textContent = s;
      speedFill.style.width = `${Math.round(k * 100)}%`;
    },

    setHint(state) { hint.hidden = state !== 'ready'; },

    showCard(card) {
      cardWrap.hidden = !card;
      root.classList.toggle('is-card', !!card);
      if (!card) { cardWrap.replaceChildren(); return; }
      const box = el('div', 'lin-card');
      box.setAttribute('role', 'dialog');
      box.append(el('h2', '', card.title), el('p', '', card.lines[0]));
      const ai = el('p', 'lin-card__ai');
      ai.innerHTML = icon('ai');
      ai.append(el('span', '', card.lines[1]));
      const go = el('button', 'lin-card__go', card.button);
      go.type = 'button';
      go.addEventListener('click', () => onNext?.());
      box.append(ai, go);
      cardWrap.replaceChildren(box);
      go.focus({ preventScroll: true });
    },

    /** The part of the screen (px) the strip at the top and the feedback at the foot take. */
    insets() {
      const H = window.innerHeight;
      if (root.hidden) return { top: 0, bottom: 0 };
      const landPhone = !desk && window.innerWidth > H;
      // A phone held sideways has no height to spare: the stages and the prompt stand beside the
      // status bar, in the same row.
      const side = landPhone && H < 520;
      if (side !== root.classList.contains('lin-play--side')) root.classList.toggle('lin-play--side', side);
      if (side) {
        const b = bar.getBoundingClientRect();
        const left = `${Math.round(b.right + 8)}px`;
        if (root.style.left !== left) { root.style.left = left; root.style.top = `${Math.round(b.top)}px`; }
      } else if (root.style.left) { root.style.left = ''; root.style.top = ''; }
      return { top: root.getBoundingClientRect().bottom + 6, bottom: landPhone ? 8 : H - foot.getBoundingClientRect().top + 6 };
    },

    remove() { bar.remove(); root.remove(); foot.remove(); cardWrap.remove(); },
  };
}
