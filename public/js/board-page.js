// Big-screen leaderboard (bestenliste.html, short address /board): rotates through the overall
// ranking and the games, refreshes on every switch, shows a QR code to the app and today's
// anonymous round count.
// Options: ?mode=pong or ?mode=overall (fixed), ?l=en, ?every=15 (seconds per page), ?stats (14-day table).
import { LEADERBOARD_MODES, OVERALL, fetchTop, fetchStats } from './api.js';
import { t as appT, getLang, setLang } from './i18n.js';
import { iconSVG } from './icons.js';
import { qrSVG } from './qr.js';

const TEXT = {
  de: {
    title: 'Bestenliste', playTitle: 'Selbst spielen', playText: 'Brille auf oder am Handy im Browser: KI-Spiele von Echomotion.',
    todayTitle: 'Heute', rounds: '{n} Runden gespielt', guests: '{n} Gäste', statsTitle: 'Letzte 14 Tage',
    empty: 'Noch keine Einträge. Sei die oder der Erste!', error: 'Bestenliste gerade nicht erreichbar.', presented: 'Präsentiert von',
    privacy: 'Namen nur freiwillig, Statistik anonym ohne Cookies.', day: 'Tag', sessions: 'Sitzungen', finishes: 'Runden',
  },
  en: {
    title: 'Leaderboard', playTitle: 'Play yourself', playText: 'Headset on or in your phone browser: AI games by Echomotion.',
    todayTitle: 'Today', rounds: '{n} rounds played', guests: '{n} guests', statsTitle: 'Last 14 days',
    empty: 'No entries yet. Be the first!', error: 'Leaderboard not reachable right now.', presented: 'Presented by',
    privacy: 'Names only if you choose, stats anonymous without cookies.', day: 'Day', sessions: 'Sessions', finishes: 'Rounds',
  },
};

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
if (q.get('l') === 'de' || q.get('l') === 'en') setLang(q.get('l'));
const tx = (key, vars = {}) => (TEXT[getLang()][key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
const fixed = LEADERBOARD_MODES.includes(q.get('mode')) ? q.get('mode') : null;
const modes = fixed ? [fixed] : LEADERBOARD_MODES;
const every = Math.min(120, Math.max(6, Number(q.get('every')) || 12)) * 1000;
let index = 0;

function staticTexts() {
  document.documentElement.lang = getLang();
  document.title = `${tx('title')} | ${appT('appTitle')}`;
  document.querySelectorAll('[data-t]').forEach((el) => { el.textContent = tx(el.dataset.t); });
  const app = new URL('./', location.href);
  $('app-url').textContent = `${app.host}${app.pathname.replace(/\/$/, '')}`;
  $('qr').innerHTML = qrSVG(app.toString(), { dark: 'currentColor', light: 'transparent', label: app.toString() });
  $('dots').replaceChildren(...modes.map(() => Object.assign(document.createElement('span'), { className: 'board-dot' })));
}

function row(r, data) {
  const li = document.createElement('li');
  li.className = 'board-row';
  li.style.animationDelay = `${(r.rank - 1) * 60}ms`;
  const rank = Object.assign(document.createElement('span'), { className: 'board-rank', textContent: `${r.rank}.` });
  const name = Object.assign(document.createElement('span'), { className: 'board-name', textContent: r.name });
  if (data.mode === OVERALL && r.games) {
    name.append(Object.assign(document.createElement('small'), { className: 'board-meta', textContent: appT('overallGames', { n: r.games, total: data.games ?? r.games }) }));
  }
  const score = Object.assign(document.createElement('span'), { className: 'board-score', textContent: r.score });
  li.append(rank, name, score);
  return li;
}

async function show() {
  const mode = modes[index % modes.length];
  $('mode').innerHTML = `${iconSVG(mode, 28)} `;
  $('mode').append(appT(`${mode}Name`));
  [...$('dots').children].forEach((d, i) => d.classList.toggle('board-dot--on', i === index % modes.length));
  try {
    const data = await fetchTop(mode);
    $('note').hidden = mode !== OVERALL;
    $('note').textContent = appT('overallHint');
    $('list').replaceChildren(...(data.top.length ? data.top.map((r) => row(r, data)) : [Object.assign(document.createElement('li'), { className: 'board-state', textContent: tx('empty') })]));
  } catch {
    $('list').replaceChildren(Object.assign(document.createElement('li'), { className: 'board-state', textContent: tx('error') }));
  }
}

async function stats() {
  try {
    const s = await fetchStats(q.has('stats') ? 14 : 1);
    if (!s) return;
    $('stats-card').hidden = false;
    $('stat-rounds').textContent = tx('rounds', { n: s.today.finishes });
    $('stat-text').textContent = s.today.guests ? tx('guests', { n: s.today.guests }) : '';
    if (q.has('stats')) {
      $('stats-table').hidden = false;
      const table = document.createElement('table');
      table.className = 'board-table';
      table.innerHTML = `<thead><tr><th>${tx('day')}</th><th>${tx('sessions')}</th><th>${tx('finishes')}</th></tr></thead>`;
      const body = document.createElement('tbody');
      s.days.forEach((d) => {
        const tr = document.createElement('tr');
        [d.date.slice(5), d.sessions, d.finishes].forEach((v) => tr.append(Object.assign(document.createElement('td'), { textContent: v })));
        body.append(tr);
      });
      table.append(body);
      $('stats-days').replaceChildren(table);
    }
  } catch { /* stats are optional */ }
}

staticTexts();
show();
stats();
setInterval(() => { index += 1; show(); }, every);
setInterval(stats, 60000);
