// "Stein auf Stein": the rules of the decision game, without any drawing. Six required parts of
// a house (walls, roof, windows, front door, heating, garden), each with three options from a
// pool, and then a list of optional extras. Everything has a price in thousand euros and plain
// tags: a style, energy, upkeep, a wish of the family it fulfills, weather it likes or dislikes.
// A round has a brief (who builds, where, a fixed budget), a catalogue, and a neighbor family
// with the same budget and wishes of its own. Money is the core: the budget pays for the basic
// option of every part and two or three upgrades or extras, never for the best of everything,
// and it cannot be overdrawn. judge() is the coherence check ("Stimmigkeits-Check"): five
// criteria from 0 to 100, each with one true reason that names the parts it is about.

export const DECISIONS = ['walls', 'roof', 'windows', 'door', 'heating', 'garden'];
export const STEPS = [...DECISIONS, 'extras'];
export const STYLES = ['trad', 'mod', 'nat'];

// style: 'trad' | 'mod' | 'nat' | null (goes with everything); price in 1000 euros; e: energy
// (-2..2); u: upkeep (1 easy, -1 a lot of work); gives: a wish it fulfills; w: weather it likes
// (1) or dislikes (-1); pop: how common it is among the houses the AI adviser has seen.
export const OPTIONS = {
  walls: [
    { id: 'wood', style: 'nat', price: 88, e: 1, u: 0, w: { rain: -1 }, pop: 3 },
    { id: 'concrete', style: 'mod', price: 90, e: 0, u: 1, w: { rain: 1 }, pop: 3 },
    { id: 'brick', style: 'trad', price: 92, e: 0, u: 1, w: { wind: 1 }, pop: 5 },
    { id: 'timber', style: 'trad', price: 112, e: 0, u: -1, pop: 2 },
  ],
  roof: [
    { id: 'metal', style: 'mod', price: 34, e: 0, u: 1, w: { sun: -1 }, pop: 3 },
    { id: 'tiles', style: 'trad', price: 36, e: 0, u: 1, w: { snow: 1 }, pop: 5 },
    { id: 'green', style: 'nat', price: 46, e: 1, u: 0, w: { snow: -1 }, pop: 2 },
    { id: 'thatch', style: 'trad', price: 60, e: 1, u: -1, w: { wind: -1 }, pop: 1 },
  ],
  windows: [
    { id: 'plain', style: null, price: 16, e: 0, u: 1, pop: 5 },
    { id: 'lattice', style: 'trad', price: 22, e: 0, u: 0, w: { wind: 1 }, pop: 3 },
    { id: 'woodwin', style: 'nat', price: 28, e: 1, u: 0, pop: 2 },
    { id: 'panorama', style: 'mod', price: 38, e: -1, u: 0, gives: 'light', pop: 3 },
  ],
  door: [
    { id: 'painted', style: null, price: 5, e: 0, u: 0, pop: 5 },
    { id: 'canopy', style: 'trad', price: 9, e: 0, u: 0, w: { rain: 1 }, pop: 3 },
    { id: 'glassdoor', style: 'mod', price: 14, e: 0, u: 0, gives: 'access', pop: 2 },
    { id: 'ramp', style: null, price: 14, e: 0, u: 0, gives: 'access', pop: 1 },
  ],
  heating: [
    { id: 'gas', style: null, price: 12, e: -2, u: 0, pop: 5 },
    { id: 'pellets', style: 'nat', price: 22, e: 1, u: -1, pop: 2 },
    { id: 'heatpump', style: null, price: 32, e: 2, u: 1, pop: 3 },
  ],
  garden: [
    { id: 'gravel', style: 'mod', price: 8, e: 0, u: 1, w: { sun: -1 }, pop: 3 },
    { id: 'hedge', style: 'nat', price: 10, e: 0, u: 0, w: { wind: 1 }, pop: 2 },
    { id: 'picket', style: 'trad', price: 12, e: 0, u: -1, pop: 4 },
    { id: 'playlawn', style: null, price: 16, e: 0, u: 0, gives: 'kids', pop: 3 },
  ],
};
// The optional extras: none, one or several, as long as the money lasts. They can be earmarked
// from the first step on (the wish list); earmarked money is set aside.
export const EXTRAS = [
  { id: 'tank', style: null, price: 8, e: 1, u: 0, w: { rain: 1 }, pop: 2 },
  { id: 'pond', style: 'nat', price: 10, e: 0, u: -1, pop: 2 },
  { id: 'smart', style: null, price: 12, e: 1, u: 1, pop: 3 },
  { id: 'carport', style: 'mod', price: 14, e: 0, u: 0, gives: 'car', pop: 5 },
  { id: 'solar', style: null, price: 18, e: 2, u: 0, w: { sun: 1 }, pop: 4 },
  { id: 'cellar', style: null, price: 26, e: 0, u: 0, gives: 'space', w: { rain: -1 }, pop: 4 },
  { id: 'conservatory', style: null, price: 30, e: -1, u: 0, gives: 'light', w: { sun: 1 }, pop: 2 },
  { id: 'annex', style: null, price: 34, e: 0, u: 0, gives: 'space', pop: 2 },
];

export const OPTION = {};
for (const d of DECISIONS) for (const o of OPTIONS[d]) { o.decision = d; OPTION[o.id] = o; }
EXTRAS.forEach((o, i) => { o.decision = 'extras'; o.bit = 1 << i; OPTION[o.id] = o; });
const ALL = Object.values(OPTION);
ALL.forEach((o, i) => { o.n = i; });
const OUTSIDE = new Set(['walls', 'roof', 'windows', 'door', 'garden', 'extras']);

// Pairs with a verdict of their own, whatever the styles say.
const CLASH = [['thatch', 'carport'], ['thatch', 'solar'], ['thatch', 'gravel'], ['thatch', 'concrete'], ['timber', 'metal'], ['timber', 'panorama'], ['timber', 'glassdoor'], ['concrete', 'lattice'], ['concrete', 'picket'], ['gravel', 'pond']];
const FIT = [['concrete', 'green'], ['wood', 'tiles'], ['brick', 'gravel'], ['green', 'tank']];
// PAIR[a.n * N + b.n]: 2 fits by name, -2 clashes by name, 1 same style, -1 other style, 0 no verdict.
const N = ALL.length;
const PAIR = new Int8Array(N * N);
for (const a of ALL) for (const b of ALL) PAIR[a.n * N + b.n] = a.style && b.style ? (a.style === b.style ? 1 : -1) : 0;
for (const [a, b] of CLASH) { PAIR[OPTION[a].n * N + OPTION[b].n] = -2; PAIR[OPTION[b].n * N + OPTION[a].n] = -2; }
for (const [a, b] of FIT) { PAIR[OPTION[a].n * N + OPTION[b].n] = 2; PAIR[OPTION[b].n * N + OPTION[a].n] = 2; }
export const clashes = (a, b) => PAIR[OPTION[a].n * N + OPTION[b].n] === -2;

// Who builds: wishes (the adviser does not know them), how much money there is beyond the
// basic option of every part (thousand euros), and the share of the budget they have saved (the
// rest is the loan).
export const PEOPLE = [
  { id: 'fam4', needs: ['kids', 'space', 'light'], spare: 54, saved: 0.3 },
  { id: 'couple', needs: ['car', 'light'], spare: 46, saved: 0.2 },
  { id: 'seniors', needs: ['access', 'easy'], spare: 26, saved: 0.6 },
  { id: 'gen3', needs: ['access', 'space', 'kids'], spare: 46, saved: 0.45 },
  { id: 'dad', needs: ['space', 'car', 'easy'], spare: 44, saved: 0.25 },
];
// Where: the style of the houses around and the weather.
export const PLACES = [
  { id: 'hill', style: 'trad', weather: ['wind', 'snow'] },
  { id: 'estate', style: 'mod', weather: ['sun'] },
  { id: 'lake', style: 'nat', weather: ['rain'] },
  { id: 'meadow', style: 'nat', weather: ['sun', 'wind'] },
];
// The neighbor family next door (same place, same budget, their own wishes).
const NEIGHBORS = [['kids', 'car'], ['kids', 'light'], ['space', 'car'], ['light', 'car']];
// What kind of builders the neighbors are this round: they plan carefully, they like to show
// what they have (the dearest of everything), or they hunt for bargains (the cheapest).
const NEIGHBOR_KINDS = ['careful', 'careful', 'showoff', 'showoff', 'bargain'];

const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Is the wish fulfilled by these options? 'easy' means: no part that is a lot of work. */
export function needMet(need, opts) {
  if (need === 'easy') return opts.every((o) => o.u >= 0);
  return opts.some((o) => o.gives === need);
}

export const priceOf = (ids) => ids.reduce((s, id) => s + OPTION[id].price, 0);

// The house is for its people: that criterion counts double in the total.
export const PEOPLE_WEIGHT = 2;
const WEIGHTS = 4 + PEOPLE_WEIGHT; // all five criteria together

/** The four criteria that do not depend on the money: [unity, people, place, future]; returns their weighted sum. */
function four(opts, brief, out) {
  let sum = 0;
  let n = 0;
  let E = 0;
  let U = 0;
  let place = 40;
  const style = brief.place.style;
  const weather = brief.place.weather;
  for (let i = 0; i < opts.length; i++) {
    const a = opts[i];
    E += a.e;
    U += a.u;
    if (a.style && OUTSIDE.has(a.decision)) place += a.style === style ? 12 : -8;
    if (a.w) for (const k of weather) { const v = a.w[k]; if (v > 0) place += 18; else if (v < 0) place -= 22; }
    for (let j = i + 1; j < opts.length; j++) {
      const v = PAIR[a.n * N + opts[j].n];
      if (v) { n += 1; sum += v === 2 ? 1 : v; }
    }
  }
  let met = 0;
  for (const need of brief.needs) if (needMet(need, opts)) met += 1;
  out[0] = n ? Math.round(clamp(50 + (50 * sum) / n)) : 100;
  out[1] = Math.round((100 * met) / brief.needs.length);
  out[2] = Math.round(clamp(place));
  out[3] = Math.round(clamp(50 + 9 * E + 5 * U));
  return out[0] + PEOPLE_WEIGHT * out[1] + out[2] + out[3];
}
const tmp = [0, 0, 0, 0];
const sum4 = (ids, brief) => four(ids.map((id) => OPTION[id]), brief, tmp);

/**
 * What the money bought: every upgrade (a required part that is not the cheapest of its three)
 * and every extra, with the coherence it adds compared with the cheapest part or with leaving
 * the extra out: [{ id, price (extra money), gain }].
 */
export function purchases(ids, round, brief = round.brief) {
  const base = sum4(ids, brief);
  const out = [];
  ids.forEach((id, i) => {
    const o = OPTION[id];
    let other;
    let price = o.price;
    if (o.decision === 'extras') other = ids.filter((x) => x !== id);
    else {
      const cheap = round.cheapest[o.decision];
      if (cheap.id === id) return;
      other = ids.slice();
      other[i] = cheap.id;
      price -= cheap.price;
    }
    out.push({ id, price, gain: (base - sum4(other, brief)) / WEIGHTS });
  });
  return out;
}

/**
 * The coherence check of a finished house. ids: the six required parts in order, then the
 * extras. Returns { total, rows: [{ key, score, why }], price, left, bought }; why:
 * { key, ...option ids and numbers } for the text of the reason.
 */
export function judge(ids, round, brief = round.brief) {
  const opts = ids.map((id) => OPTION[id]);
  const s = [0, 0, 0, 0];
  four(opts, brief, s);
  const rows = [];

  // 1. The parts fit each other.
  {
    let clash = null;
    let fit = null;
    const odd = new Map();
    const count = {};
    for (let i = 0; i < opts.length; i++) {
      if (opts[i].style) count[opts[i].style] = (count[opts[i].style] ?? 0) + 1;
      for (let j = i + 1; j < opts.length; j++) {
        const v = PAIR[opts[i].n * N + opts[j].n];
        if (v === -2) clash ??= [opts[i].id, opts[j].id];
        else if (v === 2) fit ??= [opts[i].id, opts[j].id];
        else if (v === -1) { odd.set(opts[i].id, (odd.get(opts[i].id) ?? 0) + 1); odd.set(opts[j].id, (odd.get(opts[j].id) ?? 0) + 1); }
      }
    }
    const main = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
    const out = opts.filter((o) => o.style && o.style !== main).sort((a, b) => (odd.get(b.id) ?? 0) - (odd.get(a.id) ?? 0));
    let why;
    if (clash) why = { key: 'clash', a: clash[0], b: clash[1] };
    else if (out.length) why = { key: 'odd', a: out[0].id, style: main, n: out.length };
    else if (fit) why = { key: 'fit', a: fit[0], b: fit[1] };
    else why = { key: 'one', style: main };
    rows.push({ key: 'unity', score: s[0], why });
  }

  // 2. Fits the people: the wishes from the brief.
  {
    const missing = brief.needs.filter((n) => !needMet(n, opts));
    let why;
    if (!missing.length) why = { key: 'allNeeds' };
    else if (missing[0] === 'easy') why = { key: 'work', a: opts.find((o) => o.u < 0).id };
    else why = { key: 'missing', need: missing[0], n: missing.length };
    rows.push({ key: 'people', score: s[1], why });
  }

  // 3. Fits the place: the houses around and the weather.
  {
    const outside = opts.filter((o) => o.style && OUTSIDE.has(o.decision));
    const match = outside.filter((o) => o.style === brief.place.style);
    const other = outside.filter((o) => o.style !== brief.place.style);
    const plus = [];
    const minus = [];
    for (const o of opts) for (const k of brief.place.weather) { if (o.w?.[k] > 0) plus.push([o.id, k]); else if (o.w?.[k] < 0) minus.push([o.id, k]); }
    let why;
    if (minus.length) why = { key: 'weatherBad', a: minus[0][0], weather: minus[0][1] };
    else if (other.length > match.length) why = { key: 'strange', a: other[0].id, style: brief.place.style };
    else if (plus.length) why = { key: 'weatherGood', a: plus[0][0], weather: plus[0][1] };
    else why = { key: 'around', n: match.length, style: brief.place.style };
    rows.push({ key: 'place', score: s[2], why });
  }

  // 4. Fits the future: energy and upkeep.
  {
    const worst = [...opts].sort((a, b) => a.e * 2 + a.u - (b.e * 2 + b.u))[0];
    const best = [...opts].sort((a, b) => b.e * 2 + b.u - (a.e * 2 + a.u))[0];
    let why;
    if (!opts.length) why = { key: 'steady' };
    else if (worst.e * 2 + worst.u < 0 && s[3] < 75) why = { key: worst.e < 0 ? 'energyBad' : 'upkeepBad', a: worst.id };
    else if (best.e > 0) why = { key: 'energyGood', a: best.id };
    else why = { key: 'steady' };
    rows.push({ key: 'future', score: s[3], why });
  }

  // 5. Money well spent: every upgrade and extra should add coherence; money left over while
  // something fitting was affordable costs a little.
  const price = priceOf(ids);
  const left = brief.budget - price;
  const bought = purchases(ids, round, brief);
  {
    const wasted = bought.filter((b) => b.gain <= 0).sort((a, b) => b.price - a.price);
    let score = 100 - 20 * wasted.length;
    let why = wasted.length ? { key: 'wasted', a: wasted[0].id, n: wasted.length } : { key: 'allPaid', n: bought.length };
    if (!wasted.length) {
      // Something affordable that would have added coherence?
      const base = s[0] + PEOPLE_WEIGHT * s[1] + s[2] + s[3];
      let miss = null;
      for (const x of round.extras) {
        if (ids.includes(x.id) || x.price > left) continue;
        const gain = (sum4([...ids, x.id], brief) - base) / WEIGHTS;
        if (gain >= 2 && (!miss || gain > miss.gain)) miss = { id: x.id, gain };
      }
      if (miss) { score -= 12; why = { key: 'unused', a: miss.id, left }; }
      else if (!bought.length) why = { key: 'basic' };
    }
    rows.push({ key: 'value', score: clamp(score), why });
  }

  const total = Math.round(rows.reduce((a, r) => a + r.score * (r.key === 'people' ? PEOPLE_WEIGHT : 1), 0) / (rows.length - 1 + PEOPLE_WEIGHT));
  return { total, rows, price, left, bought };
}

/** One tip: the single change (swap a part, add, drop or swap an extra) that would have added most. */
export function bestChange(ids, round, brief = round.brief) {
  const now = judge(ids, round, brief).total;
  let best = null;
  const tryIt = (next, info) => {
    if (priceOf(next) > brief.budget) return;
    const gain = judge(next, round, brief).total - now;
    if (gain > 0 && (!best || gain > best.gain)) best = { ...info, gain };
  };
  DECISIONS.forEach((d, i) => {
    for (const o of round.catalogue[d]) if (o.id !== ids[i]) { const next = ids.slice(); next[i] = o.id; tryIt(next, { key: 'swap', a: ids[i], b: o.id }); }
  });
  const mine = ids.slice(DECISIONS.length);
  for (const x of round.extras) {
    if (mine.includes(x.id)) {
      tryIt(ids.filter((id) => id !== x.id), { key: 'drop', a: x.id });
      for (const y of round.extras) if (!mine.includes(y.id)) tryIt(ids.map((id) => (id === x.id ? y.id : id)), { key: 'swap', a: x.id, b: y.id });
    } else tryIt([...ids, x.id], { key: 'add', a: x.id });
  }
  return best;
}

// ---------- every possible house of a round ----------

const idsOf = (round, r, mask) => {
  const ids = [];
  let k = r;
  for (let i = DECISIONS.length - 1; i >= 0; i--) { ids[i] = round.catalogue[DECISIONS[i]][k % 3].id; k = Math.floor(k / 3); }
  for (const x of round.extras) if (mask & x.bit) ids.push(x.id);
  return ids;
};

/**
 * Totals of every affordable house for a brief: 3^6 required parts times 2^8 sets of extras.
 * Returns { total: Int8Array (-1: over budget), at(ids) }.
 */
function table(round, brief) {
  const R = 3 ** DECISIONS.length;
  const ex = round.extras;
  const X = 1 << ex.length;
  const s4 = new Int16Array(R * X);
  const cost = new Int16Array(R * X);
  const needs = brief.needs.filter((n) => n !== 'easy');
  const easy = brief.needs.includes('easy');
  const giveBit = (o) => { const i = needs.indexOf(o.gives); return i < 0 ? 0 : 1 << i; };
  const placeOf = (o) => {
    let v = o.style && OUTSIDE.has(o.decision) ? (o.style === brief.place.style ? 12 : -8) : 0;
    if (o.w) for (const k of brief.place.weather) { if (o.w[k] > 0) v += 18; else if (o.w[k] < 0) v -= 22; }
    return v;
  };
  const pairOf = (a, b) => { const v = PAIR[a.n * N + b.n]; return v === 2 ? 1 : v; };
  // Per set of extras, added up one extra at a time: pair sum and count, energy, upkeep,
  // place points, wishes fulfilled, parts that are a lot of work, price.
  const A = { sum: new Int16Array(X), n: new Int16Array(X), E: new Int16Array(X), U: new Int16Array(X), place: new Int16Array(X), give: new Int16Array(X), work: new Int16Array(X), cost: new Int16Array(X) };
  const opts = [];
  for (let r = 0; r < R; r++) {
    let k = r;
    for (let i = DECISIONS.length - 1; i >= 0; i--) { opts[i] = round.catalogue[DECISIONS[i]][k % 3]; k = Math.floor(k / 3); }
    for (const key in A) A[key][0] = 0;
    A.place[0] = 40;
    for (let i = 0; i < opts.length; i++) {
      const a = opts[i];
      A.E[0] += a.e; A.U[0] += a.u; A.place[0] += placeOf(a); A.give[0] |= giveBit(a); A.cost[0] += a.price;
      if (a.u < 0) A.work[0] += 1;
      for (let j = i + 1; j < opts.length; j++) { const v = pairOf(a, opts[j]); if (v) { A.n[0] += 1; A.sum[0] += v; } }
    }
    for (let m = 0; m < X; m++) {
      if (m) {
        const xi = 31 - Math.clz32(m & -m);
        const x = ex[xi];
        const prev = m & (m - 1);
        let sum = A.sum[prev];
        let n = A.n[prev];
        for (const a of opts) { const v = pairOf(a, x); if (v) { n += 1; sum += v; } }
        for (let j = xi + 1; j < ex.length; j++) if (prev & (1 << j)) { const v = pairOf(ex[j], x); if (v) { n += 1; sum += v; } }
        A.sum[m] = sum; A.n[m] = n; A.E[m] = A.E[prev] + x.e; A.U[m] = A.U[prev] + x.u; A.place[m] = A.place[prev] + placeOf(x);
        A.give[m] = A.give[prev] | giveBit(x); A.work[m] = A.work[prev] + (x.u < 0 ? 1 : 0); A.cost[m] = A.cost[prev] + x.price;
      }
      let met = easy && !A.work[m] ? 1 : 0;
      for (let g = A.give[m]; g; g &= g - 1) met += 1;
      s4[r * X + m] = (A.n[m] ? Math.round(clamp(50 + (50 * A.sum[m]) / A.n[m])) : 100) + PEOPLE_WEIGHT * Math.round((100 * met) / brief.needs.length)
        + Math.round(clamp(A.place[m])) + Math.round(clamp(50 + 9 * A.E[m] + 5 * A.U[m]));
      cost[r * X + m] = A.cost[m];
    }
  }
  // The money criterion from the table itself: each upgrade against the cheapest part, each
  // extra against the house without it.
  const total = new Int8Array(R * X).fill(-1);
  const pow = DECISIONS.map((_, i) => 3 ** (DECISIONS.length - 1 - i));
  const cheapIdx = DECISIONS.map((d) => round.catalogue[d].indexOf(round.cheapest[d]));
  for (let r = 0; r < R; r++) {
    for (let m = 0; m < X; m++) {
      const at = r * X + m;
      if (cost[at] > brief.budget) continue;
      const base = s4[at];
      let wasted = 0;
      for (let i = 0; i < DECISIONS.length; i++) {
        const digit = Math.floor(r / pow[i]) % 3;
        if (digit !== cheapIdx[i] && base - s4[(r + (cheapIdx[i] - digit) * pow[i]) * X + m] <= 0) wasted += 1;
      }
      let miss = false;
      const left = brief.budget - cost[at];
      for (const x of round.extras) {
        if (m & x.bit) { if (base - s4[r * X + (m & ~x.bit)] <= 0) wasted += 1; } else if (x.price <= left && s4[r * X + (m | x.bit)] - base >= 2 * WEIGHTS) miss = true;
      }
      const value = Math.max(0, 100 - 20 * wasted - (!wasted && miss ? 12 : 0));
      total[at] = Math.round((base + value) / WEIGHTS);
    }
  }
  return { total, cost, R, X, pow };
}

/** The best total still reachable after the first required parts (ids so far, in order). */
export function bestFrom(ids, round) {
  const { total, X, pow } = round.table;
  let lo = 0;
  ids.forEach((id, i) => { lo += round.catalogue[DECISIONS[i]].findIndex((o) => o.id === id) * pow[i]; });
  const span = ids.length ? pow[ids.length - 1] : 3 ** DECISIONS.length;
  let best = -1;
  for (let at = lo * X; at < (lo + span) * X; at++) if (total[at] > best) best = total[at];
  return best;
}

/** The most coherent house this budget can pay for (option ids). */
export function bestHouse(round) {
  const { total, X } = round.table;
  let at = 0;
  for (let i = 1; i < total.length; i++) if (total[i] > total[at]) at = i;
  return idsOf(round, Math.floor(at / X), at % X);
}

/** Three options per required part: one for every wish that needs one, the rest by chance; sorted by price. */
function makeCatalogue(needs) {
  const cat = {};
  for (const d of DECISIONS) {
    const pool = OPTIONS[d];
    const must = [];
    for (const need of needs) {
      const givers = pool.filter((o) => o.gives === need);
      if (givers.length && !must.some((o) => o.gives === need)) must.push(pick(givers));
    }
    const rest = shuffle(pool.filter((o) => !must.includes(o)));
    cat[d] = [...must.slice(0, 3), ...rest].slice(0, 3).sort((a, b) => a.price - b.price);
  }
  return cat;
}

/**
 * The neighbors' house by their kind: careful builders come close to their best; show-offs spend
 * everything and take the dearest option of at least three parts; bargain hunters stay close to
 * the basic version of everything.
 */
function neighborHouse(kind, round, brief) {
  const t = table(round, brief);
  const lists = { careful: [], showoff: [], bargain: [] };
  for (let at = 0; at < t.total.length; at++) {
    if (t.total[at] < 0) continue;
    lists.careful.push(at);
    const r = Math.floor(at / t.X);
    let dear = 0;
    for (let i = 0; i < DECISIONS.length; i++) if (Math.floor(r / t.pow[i]) % 3 === 2) dear += 1;
    if (dear >= 3 && t.cost[at] >= brief.budget - 8) lists.showoff.push(at);
    if (t.cost[at] <= round.basic + 18) lists.bargain.push(at);
  }
  let list = lists[kind].length ? lists[kind] : lists.careful;
  list.sort((a, b) => t.total[b] - t.total[a]);
  // Careful: one of their best houses. Show-offs: a middling one of the dear houses. Bargain hunters: a good cheap one.
  const n = list.length;
  const at = kind === 'showoff' ? list[Math.floor(n * (0.03 + Math.random() * 0.1))] : list[Math.floor(Math.random() * Math.min(n, kind === 'careful' ? 12 : 4))];
  return idsOf(round, Math.floor(at / t.X), at % t.X);
}

/**
 * A new round: the brief, the catalogue, every possible house with its total, the neighbors.
 * avoid: { people, place } of the round before; bonus: more money (thousand euros, the relaxed mode).
 */
export function makeRound(avoid = null, bonus = 0) {
  let people = pick(PEOPLE);
  let place = pick(PLACES);
  // A second round always has other builders (and mostly another place).
  if (avoid) {
    people = pick(PEOPLE.filter((p) => p.id !== avoid.people));
    if (Math.random() < 0.75) place = pick(PLACES.filter((p) => p.id !== avoid.place));
  }
  const nbNeeds = pick(NEIGHBORS);
  const catalogue = makeCatalogue([...people.needs, ...nbNeeds]);
  const cheapest = {};
  for (const d of DECISIONS) cheapest[d] = catalogue[d][0];
  const basic = DECISIONS.reduce((s, d) => s + cheapest[d].price, 0);
  const budget = Math.ceil((basic + people.spare + bonus) / 5) * 5;
  // Where the money comes from: what they have saved, and the loan on top.
  const savings = Math.round((budget * people.saved) / 5) * 5;
  const brief = { people: people.id, needs: people.needs, budget, savings, loan: budget - savings, place };
  const nbBrief = { people: 'winter', needs: nbNeeds, budget, place };
  const round = { brief, nbBrief, catalogue, cheapest, extras: EXTRAS, basic };
  round.table = table(round, brief);
  round.best = bestFrom([], round);
  const kind = pick(NEIGHBOR_KINDS);
  const ids = neighborHouse(kind, round, nbBrief);
  round.neighbor = { kind, ids, result: judge(ids, round, nbBrief) };
  return round;
}

/**
 * What an option does for each of the four criteria the money buys (unity, people, place,
 * future), compared with the other cards of its step (a required part: against the average of
 * the three) or with leaving it out (an extra): [d0, d1, d2, d3] in points of that criterion.
 * ids: the house so far (required parts in order, then earmarked extras).
 */
export function gains(ids, o, round, brief = round.brief) {
  const score = (list) => { const out = [0, 0, 0, 0]; four(list.map((id) => OPTION[id]), brief, out); return out; };
  if (o.decision === 'extras') {
    const rest = ids.filter((id) => id !== o.id);
    const a = score([...rest, o.id]);
    const b = score(rest);
    return a.map((v, i) => v - b[i]);
  }
  const req = ids.filter((id) => OPTION[id].decision !== 'extras' && OPTION[id].decision !== o.decision);
  const ext = ids.filter((id) => OPTION[id].decision === 'extras');
  const all = round.catalogue[o.decision].map((x) => score([...req, x.id, ...ext]));
  const mine = all[round.catalogue[o.decision].indexOf(o)];
  return mine.map((v, i) => v - (all[0][i] + all[1][i] + all[2][i]) / 3);
}

/**
 * The cheapest way to fulfill a wish in this round: { step (the decision or 'extras'), id,
 * price (the extra money: an upgrade's surcharge, or an extra's price) }, or null ('easy' is a
 * rule about all parts, and a wish nothing in the catalogue fulfills).
 */
export function wishCost(round, need) {
  let best = null;
  for (const d of DECISIONS) for (const o of round.catalogue[d]) if (o.gives === need) { const price = o.price - round.cheapest[d].price; if (!best || price < best.price) best = { step: d, id: o.id, price }; }
  for (const x of round.extras) if (x.gives === need && (!best || x.price < best.price)) best = { step: 'extras', id: x.id, price: x.price };
  return best;
}

/** The least the required parts after step `from` will cost (the reserve that stays untouched). */
export function reserve(round, from) {
  let s = 0;
  for (let i = from; i < DECISIONS.length; i++) s += round.cheapest[DECISIONS[i]].price;
  return s;
}
