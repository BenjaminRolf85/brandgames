// Anonymous usage counters: POST /api/stats { type, mode, ev }, GET /api/stats?days=14.
// Nothing personal is stored: no IP, no cookie, no id. Every count is its own blob key
// (append-only, like the leaderboard), so parallel requests never overwrite each other:
//   <YYYY-MM-DD>/<type>/<mode>/<e|p>/<timestamp><random>
import { getStore } from '@netlify/blobs';

const TYPES = ['session', 'guest', 'start', 'finish'];
const MODES = ['-', 'quiz', 'review', 'robot', 'parkour', 'parkour2', 'pong', 'arch', 'fight', 'factmyth', 'sort', 'timeline', 'parkour3', 'dataflight',
  // games for our clients
  'bike', 'roast', 'bricks', 'green', 'dock', 'pinball', 'summit'];
const MAX_DAYS = 60;

const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
const day = (d) => d.toISOString().slice(0, 10);

function empty(date) {
  return { date, sessions: 0, guests: 0, starts: 0, finishes: 0, event: { guests: 0, starts: 0, finishes: 0 }, games: {} };
}

async function countDay(store, date) {
  const { blobs } = await store.list({ prefix: `${date}/` });
  const out = empty(date);
  for (const { key } of blobs) {
    const [, type, mode, ev] = key.split('/');
    const field = { session: 'sessions', guest: 'guests', start: 'starts', finish: 'finishes' }[type];
    if (!field) continue;
    out[field] += 1;
    if (ev === 'e' && field in out.event) out.event[field] += 1;
    if (mode !== '-' && (type === 'start' || type === 'finish')) {
      out.games[mode] ??= { starts: 0, finishes: 0 };
      out.games[mode][field] += 1;
    }
  }
  return out;
}

export async function handle(req, store) {
  if (req.method === 'GET') {
    const days = Math.min(MAX_DAYS, Math.max(1, Number(new URL(req.url).searchParams.get('days')) || 14));
    const now = Date.now();
    const dates = Array.from({ length: days }, (_, i) => day(new Date(now - i * 864e5)));
    const list = await Promise.all(dates.map((d) => countDay(store, d)));
    return json({ today: list[0], days: list });
  }
  if (req.method === 'POST') {
    const text = await req.text();
    if (text.length > 200) return json({ error: 'too large' }, 413);
    let body;
    try { body = JSON.parse(text); } catch { return json({ error: 'invalid json' }, 400); }
    const type = body?.type;
    const mode = body?.mode ?? '-';
    if (!TYPES.includes(type) || !MODES.includes(mode)) return json({ error: 'invalid event' }, 400);
    const key = `${day(new Date())}/${type}/${mode}/${body.ev === true ? 'e' : 'p'}/${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
    await store.set(key, '');
    return json({ ok: true }, 201);
  }
  return json({ error: 'method not allowed' }, 405);
}

export default async (req) => handle(req, getStore({ name: 'stats', consistency: 'strong' }));

export const config = {
  path: '/api/stats',
  method: ['GET', 'POST'],
  rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
