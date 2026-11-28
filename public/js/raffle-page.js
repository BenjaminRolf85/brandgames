// The organizer's view of the advent raffle (verlosung.html): everyone who entered behind door 24,
// a CSV download, deleting single entries and drawing the winners at random in the browser.
// The list is protected by a key (environment variable RAFFLE_KEY on the site). It comes in the
// address after "#key=" (that part is never sent to a server or written to its logs) or is typed
// in; the page sends it only in the request header to /api/raffle.
import { getLang, setLang, onLangChange } from './i18n.js';

const TEXT = {
  de: {
    title: 'Verlosung: AI Event in Frankfurt', lead: 'Alle Teilnahmen aus Türchen 24 des Adventskalenders. Nur für Echomotion.',
    keyLabel: 'Schlüssel', keyShow: 'Liste anzeigen', wrongKey: 'Der Schlüssel stimmt nicht.', notSet: 'Auf der Seite ist noch kein Schlüssel hinterlegt (RAFFLE_KEY).',
    netError: 'Die Liste ist gerade nicht erreichbar.', count: '{n} Teilnahmen', countOne: '1 Teilnahme', window: 'Teilnahme möglich vom {from} bis {until}.',
    reload: 'Neu laden', csv: 'Als CSV herunterladen', listTitle: 'Teilnahmen', empty: 'Noch keine Teilnahmen.',
    name: 'Name', company: 'Unternehmen', email: 'E-Mail', lang: 'Sprache', date: 'Eingegangen', test: 'Test',
    remove: 'Löschen', removeAsk: 'Teilnahme von {name} wirklich löschen?', removeLabel: 'Teilnahme von {name} löschen',
    drawTitle: 'Gewinner ziehen', drawText: 'Zieht zufällig aus allen Teilnahmen (ohne Testeinträge). Jede Ziehung ist neu; notiere das Ergebnis.',
    drawCount: 'Anzahl Plätze', drawGo: 'Ziehen', copy: 'E-Mail-Adressen kopieren', copied: 'Kopiert',
    privacy: 'Die Angaben dienen nur der Verlosung und der Einladung. Bitte nach der Veranstaltung löschen.',
  },
  en: {
    title: 'Raffle: AI event in Frankfurt', lead: 'All entries from door 24 of the advent calendar. For Echomotion only.',
    keyLabel: 'Key', keyShow: 'Show the list', wrongKey: 'The key is not correct.', notSet: 'No key is set on the site yet (RAFFLE_KEY).',
    netError: 'The list is not reachable right now.', count: '{n} entries', countOne: '1 entry', window: 'Entries are possible from {from} to {until}.',
    reload: 'Reload', csv: 'Download as CSV', listTitle: 'Entries', empty: 'No entries yet.',
    name: 'Name', company: 'Company', email: 'E-mail', lang: 'Language', date: 'Received', test: 'Test',
    remove: 'Delete', removeAsk: 'Really delete the entry of {name}?', removeLabel: 'Delete the entry of {name}',
    drawTitle: 'Draw the winners', drawText: 'Draws at random from all entries (without test entries). Every draw is new; note the result.',
    drawCount: 'Number of places', drawGo: 'Draw', copy: 'Copy e-mail addresses', copied: 'Copied',
    privacy: 'The details are for the raffle and the invitation only. Please delete them after the event.',
  },
};

const API = '/api/raffle';
const $ = (id) => document.getElementById(id);
const tx = (key, vars = {}) => (TEXT[getLang()][key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
// Times as in Germany, wherever the list is opened.
const when = (ms, opts) => new Date(ms).toLocaleString(getLang() === 'de' ? 'de-DE' : 'en-GB', { timeZone: 'Europe/Berlin', ...(opts ?? { dateStyle: 'medium', timeStyle: 'short' }) });

const q = new URLSearchParams(location.search);
if (q.get('l') === 'de' || q.get('l') === 'en') setLang(q.get('l'));
let key = new URLSearchParams(location.hash.slice(1)).get('key') ?? '';
let data = null; // { count, from, until, entries }
let winners = [];
let errorKey = '';

const request = (method = 'GET', query = '') => fetch(`${API}${query}`, { method, cache: 'no-store', headers: { authorization: `Bearer ${key}` } });

function fail(k) {
  errorKey = k;
  $('error').textContent = k ? tx(k) : '';
  $('error').hidden = !k;
}

async function load() {
  if (!key) { $('key-form').hidden = false; $('content').hidden = true; return; }
  fail('');
  try {
    const res = await request();
    if (res.status === 403) { key = ''; $('key-form').hidden = false; $('content').hidden = true; fail('wrongKey'); return; }
    if (res.status === 503) { fail('notSet'); return; }
    if (!res.ok) throw new Error(String(res.status));
    data = await res.json();
    $('key-form').hidden = true;
    $('content').hidden = false;
    render();
  } catch { fail('netError'); }
}

function person(e) {
  const li = el('li', 'raffle-row');
  const who = el('div', 'raffle-row__who');
  const name = el('p', 'raffle-row__name', e.name);
  if (e.test) name.append(' ', el('span', 'raffle-chip', tx('test')));
  who.append(name, el('p', 'raffle-row__company', e.company));
  const mail = Object.assign(el('a', 'raffle-row__mail', e.email), { href: `mailto:${e.email}` });
  const meta = el('p', 'raffle-row__meta', `${when(e.date)} · ${e.lang.toUpperCase()}`);
  li.append(who, mail, meta);
  return li;
}

function render() {
  if (!data) return;
  const n = data.entries.length;
  $('count').textContent = `${n === 1 ? tx('countOne') : tx('count', { n })} · ${tx('window', { from: when(data.from, { dateStyle: 'medium' }), until: when(data.until - 1, { dateStyle: 'medium' }) })}`;
  $('list').replaceChildren(...(n ? data.entries.map((e) => {
    const li = person(e);
    const del = Object.assign(el('button', 'btn btn--secondary raffle-row__del', tx('remove')), { type: 'button' });
    del.setAttribute('aria-label', tx('removeLabel', { name: e.name }));
    del.addEventListener('click', async () => {
      if (!confirm(tx('removeAsk', { name: e.name }))) return;
      del.disabled = true;
      try {
        const res = await request('DELETE', `?id=${e.id}`);
        if (!res.ok) throw new Error(String(res.status));
        winners = winners.filter((w) => w.id !== e.id);
        await load();
      } catch { del.disabled = false; fail('netError'); }
    });
    li.append(del);
    return li;
  }) : [el('li', 'raffle-row raffle-row--empty', tx('empty'))]));
  $('winners').replaceChildren(...winners.map(person));
  $('copy').hidden = winners.length === 0;
}

// A fair shuffle with the browser's cryptographic random numbers (no modulo bias).
function pick(max) {
  const limit = Math.floor(0x100000000 / max) * max;
  const box = new Uint32Array(1);
  do { crypto.getRandomValues(box); } while (box[0] >= limit);
  return box[0] % max;
}
function draw() {
  if (!data) return;
  const pool = data.entries.filter((e) => !e.test);
  const n = Math.min(pool.length, Math.max(1, Number.parseInt($('draw-n').value, 10) || 1));
  for (let i = pool.length - 1; i > 0; i--) { const j = pick(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  winners = pool.slice(0, n);
  render();
}

// Spreadsheet programs must not read a typed value as a formula.
const cell = (v) => { const s = String(v ?? ''); return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`; };
function csv() {
  if (!data) return;
  const rows = [[tx('name'), tx('company'), tx('email'), tx('lang'), tx('date'), tx('test')], ...data.entries.map((e) => [e.name, e.company, e.email, e.lang, new Date(e.date).toISOString(), e.test ? 'x' : ''])];
  const blob = new Blob([`﻿${rows.map((r) => r.map(cell).join(';')).join('\r\n')}`], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'verlosung-ai-event.csv' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function staticTexts() {
  const lang = getLang();
  document.documentElement.lang = lang;
  document.title = `${tx('title')} | Echomotion AR Experience`;
  document.querySelectorAll('[data-t]').forEach((n) => { n.textContent = tx(n.dataset.t); });
  document.querySelectorAll('[data-lang]').forEach((n) => n.setAttribute('aria-pressed', String(n.dataset.lang === lang)));
  if (errorKey) $('error').textContent = tx(errorKey);
  render();
}

document.querySelectorAll('[data-lang]').forEach((n) => n.addEventListener('click', () => setLang(n.dataset.lang)));
$('key-form').addEventListener('submit', (e) => { e.preventDefault(); key = $('key').value.trim(); $('key').value = ''; load(); });
$('reload').addEventListener('click', load);
$('csv').addEventListener('click', csv);
$('draw').addEventListener('click', draw);
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(winners.map((w) => w.email).join('; ')); $('copy').textContent = tx('copied'); setTimeout(() => { $('copy').textContent = tx('copy'); }, 1500); } catch { /* no clipboard access */ }
});
onLangChange(staticTexts);
staticTexts();
load();
