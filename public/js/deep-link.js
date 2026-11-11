// Direct links to a game, for the games for our clients (and any visible game):
//   brandgame.echomotion.ai/?spiel=pannenfrei              opens that game
//   ...&fuer=Team%20Nord                                   with a personal greeting on the page
//   ...&score=3200                                         "someone scored 3200, can you beat it?"
// Slugs are the German game names without umlauts or spaces; the game keys work too
// (?spiel=bike). Nothing here names a client.
import { VISIBLE_MODES } from './config.js';

export const SLUGS = {
  pannenfrei: 'bike',
  roestmeister: 'roast',
  steinaufstein: 'bricks',
  gruenesportfolio: 'green',
  andocklabor: 'dock',
  kampagnenflipper: 'pinball',
  gipfelgespraech: 'summit',
};
const KEY_TO_SLUG = Object.fromEntries(Object.entries(SLUGS).map(([slug, key]) => [key, slug]));
const NAME_MAX = 40;

const normalize = (s) => s.toLowerCase()
  .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .replace(/[^a-z0-9]/g, '');

/** The game a link points to: { game, name, score } or null (only visible games). */
export function readLink(search = window.location.search) {
  const q = new URLSearchParams(search);
  const raw = q.get('spiel') ?? q.get('game');
  if (!raw) return null;
  const slug = normalize(raw);
  const game = SLUGS[slug] ?? (VISIBLE_MODES.includes(slug) ? slug : null);
  if (!game || !VISIBLE_MODES.includes(game)) return null;
  // A greeting name: letters, digits, spaces and a few signs, shortened; shown as text only.
  const name = (q.get('fuer') ?? q.get('for') ?? '').replace(/[^\p{L}\p{N} .,&'+-]/gu, '').trim().slice(0, NAME_MAX) || null;
  const s = Number.parseInt(q.get('score') ?? '', 10);
  const score = Number.isFinite(s) && s > 0 && s < 100000 ? s : null;
  return { game, name, score };
}

/** The public link to a game (with a score to beat, for sharing a result). */
export function gameUrl(game, { score } = {}) {
  const url = new URL(window.location.origin + window.location.pathname);
  url.searchParams.set('spiel', KEY_TO_SLUG[game] ?? game);
  if (score) url.searchParams.set('score', String(Math.round(score)));
  return url.toString();
}
