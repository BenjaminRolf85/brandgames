// Leaderboard API: GET /api/leaderboard?mode=quiz, POST /api/leaderboard { mode, name, score }.
// Append-only storage: every entry is its own blob key, so concurrent submissions never
// overwrite each other. Keys sort lexically by score (desc), then by time (asc):
//   <mode>/<99999 - score>~<timestamp>~<random>~<encoded name>
// GET ?mode=overall is the overall ranking across the games (computed from the same entries,
// nothing extra is stored): per game a player's best score counts as a share of that game's
// maximum, up to GAME_POINTS; the sum over all games is the overall score. Players are the same
// name, ignoring upper and lower case.
import { getStore } from '@netlify/blobs';

// Highest score a full, perfect round can reach per mode (anything above is rejected).
export const MAX_SCORE = { quiz: 1200, factmyth: 1400, sort: 2400, timeline: 1600, pong: 6000, arch: 7000, fight: 9000, parkour: 4500, parkour2: 4500, parkour3: 4500, dataflight: 8000,
  // Games for our clients (Christmas 2026): a perfect round stays at or below 5000.
  bike: 5000, roast: 5000, bricks: 5000, green: 5000, dock: 5000, pinball: 5000, summit: 5000 };
// Games that count for the overall ranking (the ones the app offers).
export const OVERALL_MODES = ['quiz', 'parkour', 'parkour3', 'parkour2', 'pong', 'dataflight', 'fight', 'bike', 'roast', 'bricks', 'green', 'dock', 'pinball', 'summit'];
export const GAME_POINTS = 1000;
const NAME_RE = /^[\p{L}\p{N} ._-]{2,14}$/u;
const TOP = 10;

const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

function parse(key) {
  const [, rest] = key.split('/');
  const [inv, ts, , ...name] = rest.split('~');
  return { id: key, score: 99999 - Number(inv), name: decodeURIComponent(name.join('~')), date: Number(ts) };
}

async function ranked(store, mode) {
  const { blobs } = await store.list(mode ? { prefix: `${mode}/` } : {});
  return blobs.map((b) => b.key).sort();
}

const view = (keys, offset = 0) => keys.map((k, i) => ({ rank: offset + i + 1, ...parse(k) }));

export const gamePoints = (mode, score) => Math.min(GAME_POINTS, Math.round((score / MAX_SCORE[mode]) * GAME_POINTS));

/** Overall ranking from all entry keys: [{ rank, id, name, score, games, points: { mode: n } }]. */
export function overall(keys) {
  const players = new Map();
  for (const key of keys) {
    const mode = key.slice(0, key.indexOf('/'));
    if (!OVERALL_MODES.includes(mode)) continue;
    const e = parse(key);
    const id = e.name.toLocaleLowerCase('de');
    let p = players.get(id);
    if (!p) players.set(id, (p = { id: `overall/${encodeURIComponent(id)}`, name: e.name, date: e.date, points: {} }));
    // The name is shown as last typed.
    if (e.date > p.date) { p.name = e.name; p.date = e.date; }
    p.points[mode] = Math.max(p.points[mode] ?? 0, gamePoints(mode, e.score));
  }
  return [...players.values()]
    .map(({ id, name, points }) => ({ id, name, points, games: Object.keys(points).length, score: Object.values(points).reduce((a, b) => a + b, 0) }))
    .sort((a, b) => b.score - a.score || b.games - a.games || a.name.localeCompare(b.name))
    .map((p, i) => ({ rank: i + 1, ...p }));
}

export async function handle(req, store) {
  const url = new URL(req.url);
  if (req.method === 'GET') {
    const mode = url.searchParams.get('mode');
    if (mode === 'overall') {
      const table = overall(await ranked(store));
      return json({ mode, total: table.length, games: OVERALL_MODES.length, top: table.slice(0, TOP) });
    }
    if (!(mode in MAX_SCORE)) return json({ error: 'invalid mode' }, 400);
    const keys = await ranked(store, mode);
    return json({ mode, total: keys.length, top: view(keys.slice(0, TOP)) });
  }
  if (req.method === 'POST') {
    let body;
    try { body = await req.json(); } catch { return json({ error: 'invalid json' }, 400); }
    const mode = body?.mode;
    const name = typeof body?.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
    const score = body?.score;
    if (!(mode in MAX_SCORE)) return json({ error: 'invalid mode' }, 400);
    if (!NAME_RE.test(name)) return json({ error: 'invalid name' }, 400);
    if (!Number.isInteger(score) || score < 1 || score > MAX_SCORE[mode]) return json({ error: 'invalid score' }, 400);

    const inv = String(99999 - score).padStart(5, '0');
    const ts = String(Date.now()).padStart(13, '0');
    const rand = Math.random().toString(36).slice(2, 8);
    const key = `${mode}/${inv}~${ts}~${rand}~${encodeURIComponent(name)}`;
    await store.set(key, '1', { metadata: { name, score } });

    const all = await ranked(store);
    // Listing can lag a fresh write; make sure the new entry is ranked either way.
    if (!all.includes(key)) { all.push(key); all.sort(); }
    const keys = all.filter((k) => k.startsWith(`${mode}/`));
    const index = keys.indexOf(key);
    const table = OVERALL_MODES.includes(mode) ? overall(all) : [];
    const me = table.find((p) => p.id === `overall/${encodeURIComponent(name.toLocaleLowerCase('de'))}`);
    return json({
      mode,
      total: keys.length,
      rank: index + 1,
      id: key,
      top: view(keys.slice(0, TOP)),
      you: view([key], index)[0],
      overall: me ? { rank: me.rank, score: me.score, games: me.games, total: table.length, of: OVERALL_MODES.length } : null,
    }, 201);
  }
  return json({ error: 'method not allowed' }, 405);
}

export default async (req) => handle(req, getStore({ name: 'leaderboard', consistency: 'strong' }));

export const config = {
  path: '/api/leaderboard',
  method: ['GET', 'POST'],
  rateLimit: { windowLimit: 60, windowSize: 60, aggregateBy: ['ip', 'domain'] },
};
