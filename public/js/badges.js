// KI-Führerschein (AI licence): one badge per learning topic, earned in the games and stored
// on this device. The certificate page (zertifikat.html) shows them from a link with the
// badge ids; nothing is stored on a server.
import { VISIBLE_MODES } from './config.js';
import { getLang } from './i18n.js';

const KEY = 'kiar.badges';

const share = (d) => (d.total ? d.correct / d.total : 0);

// game: the game that awards it (its icon is the badge icon) · earn(results data) -> bool
export const BADGES = [
  { id: 'parkour', game: 'parkour', earn: (d) => d.correct >= 8, name: { de: 'Echomotion-Kenner', en: 'Echomotion insider' },
    how: { de: 'Echo-Parkour Level 1 (Zauberwald): mindestens 8 von 12 Münzen sammeln', en: 'Echo Parkour level 1 (magic forest): collect at least 8 of 12 coins' } },
  { id: 'city', game: 'parkour3', earn: (d) => d.correct >= 8, name: { de: 'Agenten-Profi', en: 'Agent pro' },
    how: { de: 'Echo-Parkour Level 2 (Stadt): mindestens 8 von 12 Münzen sammeln', en: 'Echo Parkour level 2 (city): collect at least 8 of 12 coins' } },
  { id: 'office', game: 'parkour2', earn: (d) => d.correct >= 8, name: { de: 'KI im Büro', en: 'AI at the office' },
    how: { de: 'Echo-Parkour Level 3 (Büro): mindestens 8 von 12 Münzen sammeln', en: 'Echo Parkour level 3 (office): collect at least 8 of 12 coins' } },
  { id: 'rl', game: 'robot', name: { de: 'Bestärkendes Lernen', en: 'Reinforcement learning' },
    how: { de: 'Echo trainieren: alle drei Level schaffen', en: 'Train Echo: finish all three levels' } },
  { id: 'adapt', game: 'pong', earn: (d) => d.correct >= 1, name: { de: 'Lernende Gegner', en: 'Adaptive opponents' },
    how: { de: 'KI-Pong: mindestens einen Punkt gegen die KI holen', en: 'AI Pong: score at least one point against the AI' } },
  { id: 'patterns', game: 'fight', earn: (d) => d.correct >= 1, name: { de: 'Mustererkennung', en: 'Pattern recognition' },
    how: { de: 'KI-Arena: einen Kampf gewinnen', en: 'AI Arena: win a fight' } },
  { id: 'flows', game: 'arch', earn: () => true, name: { de: 'Datenflüsse', en: 'Data flows' },
    how: { de: 'Datenhaushalt: eine Datenreise abschließen', en: 'Data landscape: complete a data journey' } },
  { id: 'basics', game: 'quiz', earn: (d) => share(d) >= 0.7, name: { de: 'KI-Grundlagen', en: 'AI basics' },
    how: { de: 'KI-Quiz: mindestens 70 % richtig', en: 'AI Quiz: at least 70 % correct' } },
  { id: 'myths', game: 'factmyth', earn: (d) => share(d) >= 0.7, name: { de: 'Mythen-Check', en: 'Myth check' },
    how: { de: 'Fakt oder Mythos: mindestens 70 % richtig', en: 'Fact or Myth: at least 70 % correct' } },
  { id: 'concepts', game: 'sort', earn: (d) => share(d) >= 0.7, name: { de: 'KI-Begriffe', en: 'AI concepts' },
    how: { de: 'Begriffe zuordnen: mindestens 70 % richtig', en: 'Sort the Concepts: at least 70 % correct' } },
  { id: 'history', game: 'timeline', earn: (d) => share(d) >= 0.7, name: { de: 'KI-Geschichte', en: 'AI history' },
    how: { de: 'Zeitstrahl: mindestens 70 % richtig', en: 'Timeline: at least 70 % correct' } },
].filter((b) => VISIBLE_MODES.includes(b.game));

function load() {
  try { return new Set((localStorage.getItem(KEY) ?? '').split(',').filter((id) => BADGES.some((b) => b.id === id))); } catch { return new Set(); }
}

function store(set) {
  try { localStorage.setItem(KEY, [...set].join(',')); } catch { /* private mode */ }
}

export function earnedBadges() {
  return load();
}

/** Awards a badge; returns it when it is new, else null. */
export function award(id) {
  const set = load();
  const badge = BADGES.find((b) => b.id === id);
  if (!badge || set.has(id)) return null;
  set.add(id);
  store(set);
  return badge;
}

/** Checks a game result (BaseScene.results data) and awards that game's badge if earned. */
export function awardFor(data) {
  const badge = BADGES.find((b) => b.game === data.gameKey && b.earn);
  return badge && badge.earn(data) ? award(badge.id) : null;
}

export function allEarned() {
  return load().size === BADGES.length;
}

export function resetBadges() {
  try { localStorage.removeItem(KEY); } catch { /* private mode */ }
}

// ----- certificate code -----
// Six characters (Crockford base32, no I/L/O/U): 11 bits earned badges, 14 bits day since
// 2026-01-01, one check character. Short enough to type on the phone after the headset is off.
// Append only. 'data' belonged to a removed game and keeps its bit; the bit of the removed 'hub'
// badge is reused by 'office' (level 2 of Echo Parkour, Nov 2026).
// The bit of 'data' (a game removed long ago) is reused by 'city' (Echo Parkour level 2, Nov 2026).
const ORDER = ['rl', 'city', 'adapt', 'patterns', 'flows', 'basics', 'office', 'myths', 'concepts', 'history', 'parkour'];
const ABC = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const EPOCH = Date.UTC(2026, 0, 1);

const check = (digits) => digits.reduce((s, d, i) => s + d * (i + 3), 0) % 32;

/** Code for the badges earned on this device (and today's date). */
export function certificateCode(ids = load()) {
  let mask = 0;
  ids.forEach((id) => { const i = ORDER.indexOf(id); if (i >= 0) mask |= 1 << i; });
  const day = Math.max(0, Math.min(16383, Math.floor((Date.now() - EPOCH) / 864e5)));
  const v = day * 2048 + mask;
  const digits = [4, 3, 2, 1, 0].map((k) => Math.floor(v / 32 ** k) % 32);
  return [...digits, check(digits)].map((d) => ABC[d]).join('');
}

/** Reads a code (tolerant: lower case, spaces, dashes, O for 0, I/L for 1); null if invalid. */
export function decodeCertificate(code) {
  const clean = String(code ?? '').toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (!/^[0-9A-HJKMNP-TV-Z]{6}$/.test(clean)) return null;
  const digits = [...clean].map((c) => ABC.indexOf(c));
  if (check(digits.slice(0, 5)) !== digits[5]) return null;
  const v = digits.slice(0, 5).reduce((s, d) => s * 32 + d, 0);
  const mask = v % 2048;
  const date = new Date(EPOCH + Math.floor(v / 2048) * 864e5);
  return { ids: ORDER.filter((id, i) => mask & (1 << i)), date };
}

/** Code shown in two groups of three for reading aloud and typing. */
export const prettyCode = (code) => `${code.slice(0, 3)} ${code.slice(3)}`;

/** Link to the certificate page (QR code): the code plus the language. */
export function certificateURL(code = certificateCode()) {
  const url = new URL('zertifikat.html', location.href);
  url.search = '';
  url.hash = '';
  url.searchParams.set('c', code);
  url.searchParams.set('l', getLang());
  return url.toString();
}

/** What to type on the phone: the short address of the certificate page. */
export function certificateShortURL() {
  return `${location.host}/z`;
}
