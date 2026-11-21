// "Stein auf Stein": the rules of the decision game, without any drawing. Seven decisions about
// a house (walls, roof, windows, front door, heating, one extra, the garden), each with a pool of
// options that carry plain tags: cost in steps, a style, energy, upkeep, what they are good for
// (a wish of the family) and how they take the weather. A round has a brief (who builds, where,
// the budget), a catalogue of three options per decision, and a neighbor family with a brief of
// its own. judge() is the coherence check ("Stimmigkeits-Check"): five criteria from 0 to 100,
// each with one true reason that names the parts it is about.

export const DECISIONS = ['walls', 'roof', 'windows', 'door', 'heating', 'extra', 'garden'];
export const CRITERIA = ['unity', 'people', 'place', 'budget', 'future'];
export const STYLES = ['trad', 'mod', 'nat'];

// style: 'trad' | 'mod' | 'nat' | null (goes with everything); cost 1..3; e: energy (-2..2);
// u: upkeep (1 easy, -1 a lot of work); gives: a wish it fulfills; w: weather it likes (1) or
// dislikes (-1); pop: how common it is among the houses the AI adviser has seen.
export const OPTIONS = {
  walls: [
    { id: 'brick', style: 'trad', cost: 2, e: 0, u: 1, w: { wind: 1 }, pop: 5 },
    { id: 'timber', style: 'trad', cost: 3, e: 0, u: -1, pop: 2 },
    { id: 'concrete', style: 'mod', cost: 2, e: 0, u: 1, w: { rain: 1 }, pop: 3 },
    { id: 'wood', style: 'nat', cost: 1, e: 1, u: 0, w: { rain: -1 }, pop: 3 },
  ],
  roof: [
    { id: 'tiles', style: 'trad', cost: 2, e: 0, u: 1, w: { snow: 1 }, pop: 5 },
    { id: 'thatch', style: 'trad', cost: 3, e: 1, u: -1, w: { wind: -1 }, pop: 1 },
    { id: 'green', style: 'nat', cost: 2, e: 1, u: 0, w: { snow: -1 }, pop: 2 },
    { id: 'metal', style: 'mod', cost: 1, e: 0, u: 1, w: { sun: -1 }, pop: 3 },
  ],
  windows: [
    { id: 'lattice', style: 'trad', cost: 2, e: 0, u: 0, w: { wind: 1 }, pop: 3 },
    { id: 'panorama', style: 'mod', cost: 3, e: -1, u: 0, gives: 'light', pop: 3 },
    { id: 'woodwin', style: 'nat', cost: 2, e: 1, u: 0, pop: 2 },
    { id: 'plain', style: null, cost: 1, e: 0, u: 1, pop: 5 },
  ],
  door: [
    { id: 'canopy', style: 'trad', cost: 2, e: 0, u: 0, w: { rain: 1 }, pop: 3 },
    { id: 'glassdoor', style: 'mod', cost: 2, e: 0, u: 0, gives: 'access', pop: 2 },
    { id: 'painted', style: null, cost: 1, e: 0, u: 0, pop: 5 },
    { id: 'ramp', style: null, cost: 2, e: 0, u: 0, gives: 'access', pop: 1 },
  ],
  heating: [
    { id: 'heatpump', style: null, cost: 3, e: 2, u: 1, pop: 3 },
    { id: 'gas', style: null, cost: 1, e: -2, u: 0, pop: 5 },
    { id: 'pellets', style: 'nat', cost: 2, e: 1, u: -1, pop: 2 },
  ],
  extra: [
    { id: 'carport', style: 'mod', cost: 1, e: 0, u: 0, gives: 'car', pop: 4 },
    { id: 'conservatory', style: null, cost: 3, e: -1, u: 0, gives: 'light', w: { sun: 1 }, pop: 2 },
    { id: 'solar', style: null, cost: 2, e: 2, u: 0, w: { sun: 1 }, pop: 3 },
    { id: 'cellar', style: null, cost: 2, e: 0, u: 0, gives: 'space', w: { rain: -1 }, pop: 3 },
    { id: 'annex', style: null, cost: 3, e: 0, u: 0, gives: 'space', pop: 2 },
  ],
  garden: [
    { id: 'picket', style: 'trad', cost: 2, e: 0, u: -1, pop: 4 },
    { id: 'hedge', style: 'nat', cost: 1, e: 0, u: 0, w: { wind: 1 }, pop: 2 },
    { id: 'gravel', style: 'mod', cost: 1, e: 0, u: 1, w: { sun: -1 }, pop: 3 },
    { id: 'playlawn', style: null, cost: 2, e: 0, u: 0, gives: 'kids', pop: 3 },
  ],
};

export const OPTION = {};
for (const d of DECISIONS) for (const o of OPTIONS[d]) { o.decision = d; OPTION[o.id] = o; }

// Pairs with a verdict of their own, whatever the styles say.
const CLASH = [['thatch', 'carport'], ['thatch', 'solar'], ['thatch', 'gravel'], ['thatch', 'concrete'], ['timber', 'metal'], ['timber', 'panorama'], ['timber', 'glassdoor'], ['concrete', 'lattice'], ['concrete', 'picket']];
const FIT = [['concrete', 'green'], ['wood', 'tiles'], ['brick', 'gravel']];
const inPairs = (list, a, b) => list.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
export const clashes = (a, b) => inPairs(CLASH, a, b);
export const fits = (a, b) => inPairs(FIT, a, b);

// Who builds: wishes (the adviser does not know them) and the budget in cost steps.
export const PEOPLE = [
  { id: 'fam4', needs: ['kids', 'space', 'light'], budget: 15 },
  { id: 'couple', needs: ['car', 'light'], budget: 13 },
  { id: 'seniors', needs: ['access', 'easy'], budget: 13 },
  { id: 'gen3', needs: ['access', 'space', 'kids'], budget: 15 },
];
// Where: the style of the houses around and the weather.
export const PLACES = [
  { id: 'hill', style: 'trad', weather: ['wind', 'snow'] },
  { id: 'estate', style: 'mod', weather: ['sun'] },
  { id: 'lake', style: 'nat', weather: ['rain'] },
];
// The neighbor family next door (same place, their own wishes and budget).
const NEIGHBORS = [
  { needs: ['kids', 'car'], budget: 13 },
  { needs: ['kids', 'light'], budget: 14 },
  { needs: ['space', 'light'], budget: 14 },
];
// What kind of builders the neighbors are this round.
export const NEIGHBOR_KINDS = ['careful', 'slip', 'slip', 'muddle'];

const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Is the wish fulfilled by these options (ids)? 'easy' means: no part that is a lot of work. */
export function needMet(need, ids) {
  if (need === 'easy') return ids.every((id) => OPTION[id].u >= 0);
  return ids.some((id) => OPTION[id].gives === need);
}

/**
 * The coherence check. choices: option ids (the decisions made so far, in order); brief:
 * { needs, budget, place: { style, weather } }. Returns { total, rows: [{ key, score, why }] };
 * why: { key, ...option ids and numbers } for the text of the reason.
 */
export function judge(choices, brief) {
  const opts = choices.map((id) => OPTION[id]);
  const ids = opts.map((o) => o.id);
  const rows = [];

  // 1. The parts fit each other: pairs of parts with a style, and the pairs with their own verdict.
  {
    let sum = 0;
    let n = 0;
    let clash = null;
    let fit = null;
    const odd = new Map();
    for (let i = 0; i < opts.length; i++) {
      for (let j = i + 1; j < opts.length; j++) {
        const a = opts[i];
        const b = opts[j];
        if (clashes(a.id, b.id)) { sum -= 2; n += 1; clash ??= [a.id, b.id]; continue; }
        if (fits(a.id, b.id)) { sum += 1; n += 1; fit ??= [a.id, b.id]; continue; }
        if (!a.style || !b.style) continue;
        n += 1;
        if (a.style === b.style) sum += 1;
        else { sum -= 1; odd.set(a.id, (odd.get(a.id) ?? 0) + 1); odd.set(b.id, (odd.get(b.id) ?? 0) + 1); }
      }
    }
    const score = n ? Math.round(clamp(50 + (50 * sum) / n)) : 100;
    const count = {};
    for (const o of opts) if (o.style) count[o.style] = (count[o.style] ?? 0) + 1;
    const main = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
    const out = opts.filter((o) => o.style && o.style !== main).sort((a, b) => (odd.get(b.id) ?? 0) - (odd.get(a.id) ?? 0));
    let why;
    if (clash) why = { key: 'clash', a: clash[0], b: clash[1] };
    else if (out.length) why = { key: 'odd', a: out[0].id, style: main, n: out.length };
    else if (fit) why = { key: 'fit', a: fit[0], b: fit[1] };
    else why = { key: 'one', style: main };
    rows.push({ key: 'unity', score, why });
  }

  // 2. Fits the people: the wishes from the brief.
  {
    const missing = brief.needs.filter((n) => !needMet(n, ids));
    const score = Math.round((100 * (brief.needs.length - missing.length)) / brief.needs.length);
    let why;
    if (!missing.length) why = { key: 'allNeeds' };
    else if (missing[0] === 'easy') why = { key: 'work', a: opts.find((o) => o.u < 0).id };
    else why = { key: 'missing', need: missing[0], n: missing.length };
    rows.push({ key: 'people', score, why });
  }

  // 3. Fits the place: the houses around and the weather.
  {
    const outside = opts.filter((o) => ['walls', 'roof', 'windows', 'door', 'garden'].includes(o.decision) && o.style);
    const match = outside.filter((o) => o.style === brief.place.style);
    const other = outside.filter((o) => o.style !== brief.place.style);
    const plus = [];
    const minus = [];
    for (const o of opts) for (const k of brief.place.weather) { if (o.w?.[k] > 0) plus.push([o.id, k]); else if (o.w?.[k] < 0) minus.push([o.id, k]); }
    const score = Math.round(clamp(40 + 12 * match.length - 8 * other.length + 18 * plus.length - 22 * minus.length));
    let why;
    if (minus.length) why = { key: 'weatherBad', a: minus[0][0], weather: minus[0][1] };
    else if (other.length > match.length) why = { key: 'strange', a: other[0].id, style: brief.place.style };
    else if (plus.length) why = { key: 'weatherGood', a: plus[0][0], weather: plus[0][1] };
    else why = { key: 'around', n: match.length, style: brief.place.style };
    rows.push({ key: 'place', score, why });
  }

  // 4. Fits the budget: over budget costs coherence, under budget is fine.
  {
    const cost = opts.reduce((s, o) => s + o.cost, 0);
    const over = Math.max(0, cost - brief.budget);
    rows.push({ key: 'budget', score: clamp(100 - 25 * over), why: { key: over ? 'over' : 'within', n: over || cost, budget: brief.budget } });
  }

  // 5. Fits the future: energy and upkeep.
  {
    const E = opts.reduce((s, o) => s + o.e, 0);
    const U = opts.reduce((s, o) => s + o.u, 0);
    const score = Math.round(clamp(50 + 9 * E + 5 * U));
    const worst = [...opts].sort((a, b) => a.e * 2 + a.u - (b.e * 2 + b.u))[0];
    const best = [...opts].sort((a, b) => b.e * 2 + b.u - (a.e * 2 + a.u))[0];
    let why;
    if (worst && worst.e * 2 + worst.u < 0 && score < 75) why = { key: worst.e < 0 ? 'energyBad' : 'upkeepBad', a: worst.id };
    else if (best && best.e > 0) why = { key: 'energyGood', a: best.id };
    else why = { key: 'steady' };
    rows.push({ key: 'future', score, why });
  }

  const total = Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length);
  return { total, rows };
}

/** Running cost of the choices so far. */
export const costOf = (choices) => choices.reduce((s, id) => s + OPTION[id].cost, 0);

/** Every full house of a catalogue (3^7), each as an array of option ids. */
export function allHouses(catalogue) {
  let list = [[]];
  for (const d of DECISIONS) list = list.flatMap((h) => catalogue[d].map((o) => [...h, o.id]));
  return list;
}

/** The best total still reachable after these choices (the rest chosen as well as possible). */
export function bestFrom(choices, round) {
  let best = -1;
  for (const h of round.houses) {
    if (choices.every((id, i) => h.ids[i] === id) && h.total > best) best = h.total;
  }
  return best;
}

/** Three options per decision: one for every wish that needs one, the rest by chance. */
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
    cat[d] = shuffle([...must.slice(0, 3), ...rest].slice(0, 3));
  }
  return cat;
}

/** The neighbors' house: careful builders come close to their best, others slip once or twice. */
function neighborHouse(kind, brief, catalogue) {
  const ranked = allHouses(catalogue).map((ids) => ({ ids, total: judge(ids, brief).total })).sort((a, b) => b.total - a.total);
  // One of their better houses, not always the very best.
  const base = ranked[Math.floor(Math.random() * Math.min(ranked.length, 12))].ids.slice();
  const slips = kind === 'slip' ? 1 : kind === 'muddle' ? 2 : 0;
  const slipped = [];
  for (let k = 0; k < slips; k++) {
    // The slip: one part that visibly breaks the style of the rest (an obvious break, about
    // ten points of coherence), not the worst possible choice.
    const now = judge(base, brief);
    const cands = [];
    DECISIONS.forEach((d, i) => {
      if (slipped.includes(i)) return;
      for (const o of catalogue[d]) {
        if (o.id === base[i]) continue;
        const next = base.slice();
        next[i] = o.id;
        const res = judge(next, brief);
        const drop = now.total - res.total;
        if (res.rows[0].score < now.rows[0].score && drop > 0) cands.push({ i, id: o.id, d: Math.abs(drop - 10) });
      }
    });
    cands.sort((a, b) => a.d - b.d);
    const c = cands[Math.floor(Math.random() * Math.min(2, cands.length))];
    if (c) { base[c.i] = c.id; slipped.push(c.i); }
  }
  return { ids: base, slipped };
}

/** A new round: the brief, the catalogue, every possible house with its total, the neighbors. */
export function makeRound(avoid = null) {
  let people = pick(PEOPLE);
  let place = pick(PLACES);
  for (let i = 0; i < 8 && avoid && people.id === avoid.people && place.id === avoid.place; i++) { people = pick(PEOPLE); place = pick(PLACES); }
  // A second round always has other builders (and mostly another place).
  if (avoid) { const others = PEOPLE.filter((p) => p.id !== avoid.people); people = pick(others); if (Math.random() < 0.7) place = pick(PLACES.filter((p) => p.id !== avoid.place)); }
  const brief = { people: people.id, needs: people.needs, budget: people.budget, place };
  const nbBase = pick(NEIGHBORS);
  const nbBrief = { people: 'winter', needs: nbBase.needs, budget: nbBase.budget, place };
  const catalogue = makeCatalogue([...brief.needs, ...nbBrief.needs]);
  const houses = allHouses(catalogue).map((ids) => ({ ids, total: judge(ids, brief).total }));
  const best = Math.max(...houses.map((h) => h.total));
  const kind = pick(NEIGHBOR_KINDS);
  const nb = neighborHouse(kind, nbBrief, catalogue);
  return { brief, nbBrief, catalogue, houses, best, neighbor: { kind, ids: nb.ids, slipped: nb.slipped, result: judge(nb.ids, nbBrief) } };
}
