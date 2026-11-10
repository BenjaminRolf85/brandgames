// Spaced repetition (Leitner boxes 0-4), stored per device.
// Wrong answers drop an item to box 0 so it comes back soon; correct answers move it up.
import { ALL_IDS } from './content.js';

const KEY = 'kiar.progress.v1';
const MASTERED_BOX = 3;
const WEIGHT = { unseen: 3, 0: 6, 1: 4, 2: 2, 3: 1, 4: 0.4 };

let data = { items: {} };
try {
  data = JSON.parse(localStorage.getItem(KEY)) || data;
} catch { /* storage unavailable */ }

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

const tracked = (id) => !id.startsWith('b');

export function record(id, correct) {
  if (!tracked(id)) return;
  const it = data.items[id] ?? { box: 0, seen: 0, wrong: 0 };
  it.box = correct ? Math.min(4, it.box + (it.seen === 0 ? 2 : 1)) : 0;
  it.seen += 1;
  if (!correct) it.wrong += 1;
  it.last = Date.now();
  data.items[id] = it;
  save();
}

function weight(id) {
  const it = data.items[id];
  return it ? WEIGHT[it.box] : WEIGHT.unseen;
}

/** Weighted sample without replacement: weak and unseen items come first more often. */
export function pick(pool, n, idOf = (x) => x.id) {
  const rest = pool.map((item) => ({ item, w: weight(idOf(item)) * (0.6 + Math.random() * 0.8) }));
  const out = [];
  while (out.length < n && rest.length) {
    const total = rest.reduce((s, r) => s + r.w, 0);
    let r = Math.random() * total;
    const idx = rest.findIndex((x) => (r -= x.w) <= 0);
    out.push(rest.splice(idx === -1 ? rest.length - 1 : idx, 1)[0].item);
  }
  return out;
}

/** Items answered wrong recently (box 0-1), weakest first. */
export function reviewIds(limit = 10) {
  return Object.entries(data.items)
    .filter(([id, it]) => it.box <= 1 && it.wrong > 0 && ALL_IDS.includes(id))
    .sort((a, b) => a[1].box - b[1].box || b[1].wrong - a[1].wrong)
    .slice(0, limit)
    .map(([id]) => id);
}

export function stats() {
  const ids = ALL_IDS.filter((id) => !id.startsWith('s'));
  const mastered = ids.filter((id) => (data.items[id]?.box ?? 0) >= MASTERED_BOX).length;
  return { mastered, total: ids.length, review: reviewIds(99).length };
}

/** Forgets everything (event mode: a fresh start for the next guest). */
export function resetProgress() {
  data = { items: {} };
  save();
}
