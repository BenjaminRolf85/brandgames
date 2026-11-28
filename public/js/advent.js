// Advent calendar on the landing page (Christmas edition, Nov 2026): 24 doors, one opens per
// day in December. Every door holds an AI use case from our projects (advent-data.js); 14 doors
// also hold a game that starts with one tap. Doors of days to come stay locked; from the 25th
// (and in later years) all are open. Opened doors are remembered on the device. Door 24 is the
// finale: a golden star door with a Christmas greeting, the raffle for places at our AI event
// (advent-raffle.js) and the advent leaderboard (overall ranking).
//   ?tag=5      pretends it is December 5th (for checking the page and for tests)
//   ?vorschau   opens all doors
// All colors and sizes are design tokens (tokens.css, --advent-* and --color-advent-*).
import { t, L, getLang, onLangChange } from './i18n.js';
import { CARD_ART } from './menu-coins.js';
import { DOORS, ADVENT_YEAR, USE_CASES_URL, USE_CASES_TOTAL } from './advent-data.js';
import { fetchTop, OVERALL } from './api.js';
import { raffleCard } from './advent-raffle.js';

const KEY = 'kiar.advent';
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const SVG = {
  check: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  lock: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" focusable="false"><path d="M7 11V8a5 5 0 0110 0v3M6 11h12v9H6z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  star: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" fill="currentColor"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>',
};

/** The day of December that counts as today: 0 before the 1st, 25 once all doors are open. */
export function adventDay(now = new Date(), search = location.search) {
  const q = new URLSearchParams(search);
  if (q.has('vorschau') || q.has('preview')) return 25;
  const forced = Number.parseInt(q.get('tag') ?? q.get('day') ?? '', 10);
  if (Number.isFinite(forced)) return Math.max(0, Math.min(25, forced));
  if (now.getFullYear() > ADVENT_YEAR) return 25;
  if (now.getFullYear() < ADVENT_YEAR || now.getMonth() < 11) return 0;
  return Math.min(25, now.getDate());
}

function loadOpened() {
  try { return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]').filter((n) => Number.isInteger(n))); } catch { return new Set(); }
}
function saveOpened(set) {
  try { localStorage.setItem(KEY, JSON.stringify([...set])); } catch { /* private mode */ }
}

const dateText = (day) => new Date(ADVENT_YEAR, 11, day).toLocaleDateString(getLang() === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'long' });

/** Builds the calendar in #advent-grid; a game door starts its game through app.openPreview(). */
export function setupAdvent(app) {
  const grid = document.getElementById('advent-grid');
  const note = document.getElementById('advent-note');
  if (!grid) return;
  const opened = loadOpened();
  let today = adventDay();
  let shown = null; // the door in the dialog

  // ----- the dialog with a door's content -----
  const dialog = el('dialog', 'advent-dialog');
  dialog.setAttribute('aria-labelledby', 'advent-dialog-title');
  document.body.append(dialog);
  // A click beside the card closes it, like Escape.
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { shown = null; });

  const fill = (door) => {
    const game = door.game;
    const closeBtn = el('button', 'advent-dialog__close');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', t('close'));
    closeBtn.innerHTML = SVG.close;
    closeBtn.addEventListener('click', () => dialog.close());
    const body = el('div', 'advent-dialog__body');
    body.append(el('p', 'advent-dialog__day', t('adventDoorOf', { n: door.day, date: dateText(door.day) })));

    if (game) {
      const g = el('div', 'advent-game');
      const img = Object.assign(el('img', 'advent-game__coin'), { src: CARD_ART[game] ?? CARD_ART.clients, width: 96, height: 96, alt: '' });
      const text = el('div', 'advent-game__text');
      text.append(el('p', 'advent-dialog__eyebrow', t('adventGameToday')), el('p', 'advent-game__name', t(`${game}Name`)), el('p', 'advent-game__tag', t(`${game}Tag`)));
      const play = el('button', 'btn btn--primary', t('adventPlay'));
      play.type = 'button';
      play.addEventListener('click', () => { dialog.close(); app.pendingGame = game; app.openPreview(); });
      g.append(img, text, play);
      body.append(g);
    }

    const finale = door.special === 'finale';
    if (finale) {
      // Christmas Eve: the greeting, then the raffle, then who collected the most points during advent.
      const card = el('div', 'advent-finale');
      const stars = el('div', 'advent-finale__stars');
      stars.setAttribute('aria-hidden', 'true');
      stars.innerHTML = SVG.star.repeat(7);
      const art = Object.assign(el('img', 'advent-finale__art'), { src: 'assets/xmas-hero-600.webp', width: 600, height: 362, alt: t('heroArtAlt') });
      const hello = el('h2', 'advent-finale__title', t('adventFinaleTitle'));
      hello.id = 'advent-dialog-title';
      card.append(stars, art, hello, el('p', 'advent-finale__text', t('adventFinaleText')), el('p', 'advent-finale__sign', t('adventFinaleSign')));
      // The gift: a raffle for places at our AI event. The leaderboard stays one tap away.
      const board = el('details', 'advent-case__more advent-board');
      const list = el('ol', 'advent-board__list');
      list.append(el('li', 'advent-board__state', t('loading')));
      const again = el('button', 'btn btn--secondary', t('adventFinalePlay'));
      again.type = 'button';
      again.addEventListener('click', () => { dialog.close(); app.openPreview(); });
      board.append(el('summary', '', t('adventFinaleBoard')), el('p', 'advent-board__lead', t('adventFinaleBoardText')), list, again);
      body.append(card, raffleCard(), board);
      fetchTop(OVERALL).then((data) => {
        if (shown !== door) return;
        if (!data.top?.length) { list.replaceChildren(el('li', 'advent-board__state', t('lbEmpty'))); return; }
        list.replaceChildren(...data.top.slice(0, 5).map((r) => {
          const li = el('li', `advent-board__row${r.rank <= 3 ? ' advent-board__row--top' : ''}`);
          li.append(el('span', 'advent-board__rank', `${r.rank}.`), el('span', 'advent-board__name', r.name), el('span', 'advent-board__score', String(r.score)));
          return li;
        }));
      }).catch(() => { if (shown === door) list.replaceChildren(el('li', 'advent-board__state', t('lbError'))); });
    }

    const uc = el('div', 'advent-case');
    uc.append(el('p', 'advent-dialog__eyebrow', t(finale ? 'adventCaseNewYear' : game ? 'adventCaseAlso' : 'adventCaseToday')));
    const title = el(finale ? 'h3' : 'h2', 'advent-case__title', L(door.title));
    if (!finale) title.id = 'advent-dialog-title';
    const chips = el('p', 'advent-case__chips');
    chips.append(el('span', 'advent-chip', L(door.industry)), el('span', 'advent-chip advent-chip--status', t(`adventStatus_${door.status}`)));
    uc.append(title, chips);
    const part = (label, text, cls = '') => {
      const d = el('div', `advent-case__part ${cls}`.trim());
      d.append(el('h3', 'advent-case__label', t(label)), el('p', 'advent-case__text', text));
      return d;
    };
    const impact = part('adventImpact', L(door.impact), 'advent-case__part--impact');
    if (game || finale) {
      // A game door and the finale stay short: the result first, the story behind it on demand.
      const more = el('details', 'advent-case__more');
      more.append(el('summary', '', t('adventMore')), part('adventSituation', L(door.situation)), part('adventSolution', L(door.solution)));
      uc.append(impact, more);
    } else {
      uc.append(part('adventSituation', L(door.situation)), part('adventSolution', L(door.solution)), impact);
    }
    body.append(uc);

    const foot = el('div', 'advent-dialog__foot');
    const all = Object.assign(el('a', 'btn btn--secondary', t('adventAll', { n: USE_CASES_TOTAL })), { href: USE_CASES_URL, target: '_blank', rel: 'noopener' });
    foot.append(all);
    body.append(foot);
    dialog.replaceChildren(closeBtn, body);
  };

  const open = (door) => {
    shown = door;
    fill(door);
    if (!opened.has(door.day)) { opened.add(door.day); saveOpened(opened); render(); }
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
  };

  const say = (text) => { if (note) note.textContent = text; };
  const defaultNote = () => {
    if (today === 0) return t('adventSoon', { date: dateText(1) });
    if (today >= 25) return t('adventAllOpen');
    return t('adventToday', { n: today });
  };

  // ----- the grid of doors -----
  function render() {
    const focusDay = document.activeElement?.dataset?.day;
    grid.replaceChildren(...DOORS.map((door) => {
      const locked = door.day > today;
      const isToday = door.day === today;
      const isOpen = opened.has(door.day) && !locked;
      const b = el('button', `door${door.game ? ' door--game' : ''}${door.special === 'finale' ? ' door--finale' : ''}${locked ? ' door--locked' : ''}${isToday ? ' door--today' : ''}${isOpen ? ' door--open' : ''}`);
      b.type = 'button';
      b.dataset.day = String(door.day);
      if (door.game) b.append(Object.assign(el('img', 'door__pic'), { src: CARD_ART[door.game] ?? '', alt: '', loading: 'lazy', decoding: 'async', width: 160, height: 160 }));
      if (door.special === 'finale') { const st = el('span', 'door__star'); st.innerHTML = SVG.star; b.append(st); }
      b.append(el('span', 'door__num', String(door.day)));
      if (isToday) b.append(el('span', 'door__note', t('adventTodayTag')));
      if (locked) { const i = el('span', 'door__icon'); i.innerHTML = SVG.lock; b.append(i); }
      if (isOpen) { const i = el('span', 'door__icon door__icon--open'); i.innerHTML = SVG.check; b.append(i); }
      const what = door.special === 'finale' ? t('adventFinaleTitle') : door.game ? `${t(`${door.game}Name`)}, ${L(door.title)}` : L(door.title);
      b.setAttribute('aria-label', locked
        ? t('adventLockedLabel', { n: door.day, date: dateText(door.day) })
        : `${t('adventDoor', { n: door.day })}${isToday ? `, ${t('adventTodayTag')}` : ''}: ${what}`);
      if (locked) b.setAttribute('aria-disabled', 'true');
      b.addEventListener('click', () => {
        if (door.day > today) {
          say(t('adventLocked', { n: door.day, date: dateText(door.day) }));
          b.classList.remove('is-shaking');
          void b.offsetWidth;
          b.classList.add('is-shaking');
          return;
        }
        open(door);
      });
      const li = el('li');
      li.append(b);
      return li;
    }));
    if (focusDay) grid.querySelector(`[data-day="${focusDay}"]`)?.focus({ preventScroll: true });
  }

  render();
  say(defaultNote());
  onLangChange(() => { render(); say(defaultNote()); if (shown && dialog.open) fill(shown); });
  // A new day while the page stays open (or the tab comes back): the next door unlocks.
  const refresh = () => { const d = adventDay(); if (d !== today) { today = d; render(); say(defaultNote()); } };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  setInterval(refresh, 60000);
}
