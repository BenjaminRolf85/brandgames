// Client for the online leaderboard (netlify/functions/leaderboard.mjs).
const BASE = '/api/leaderboard';
const NAME_KEY = 'kiar.name';

import { VISIBLE_MODES } from './config.js';

// 'overall' is the overall ranking across all games (computed on the server, nothing to submit).
export const OVERALL = 'overall';
export const GAME_MODES = ['quiz', 'factmyth', 'parkour', 'parkour3', 'parkour2', 'pong', 'dataflight', 'arch', 'fight', 'sort', 'timeline',
  'bike', 'roast', 'bricks', 'green', 'dock', 'pinball', 'summit'].filter((m) => VISIBLE_MODES.includes(m));
export const LEADERBOARD_MODES = [OVERALL, ...GAME_MODES];
export const NAME_RE = /^[\p{L}\p{N} ._-]{2,14}$/u;

export async function fetchTop(mode) {
  const res = await fetch(`${BASE}?mode=${encodeURIComponent(mode)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`leaderboard ${res.status}`);
  return res.json();
}

export async function submitScore(mode, name, score) {
  const res = await fetch(BASE, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mode, name, score }),
  });
  if (!res.ok) throw new Error(`leaderboard ${res.status}`);
  return res.json();
}

export function savedName() {
  try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; }
}

export function saveName(name) {
  try { localStorage.setItem(NAME_KEY, name); } catch { /* ignore */ }
}

// ----- anonymous usage counters (netlify/functions/stats.mjs) -----
// Only counts: which kind of event, which game, event mode or not. No cookies, no ids.
const STATS = '/api/stats';
const local = ['localhost', '127.0.0.1', ''].includes(location.hostname);

/** type: 'session' | 'guest' | 'start' | 'finish'; mode: game key (optional). */
export function track(type, mode = '-', ev = false) {
  if (local) return;
  try {
    fetch(STATS, {
      method: 'POST',
      keepalive: true,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type, mode, ev }),
    }).catch(() => {});
  } catch { /* offline */ }
}

/** Counts of the last `days` days (1..60): { today, days: [...] }. */
export async function fetchStats(days = 14) {
  if (local) return null;
  const res = await fetch(`${STATS}?days=${days}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`stats ${res.status}`);
  return res.json();
}
