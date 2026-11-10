// "Röstmeister" (Roast Master): the taste model and the recommender (no DOM, testable on its own).
//
// Taste: every cup is four flavors (fruity, nutty, chocolatey, spicy, each 0..1) plus its roast
// level (0 green .. 1 burnt). Two of four green coffees are blended (the share of the first one
// in RATIOS) and roasted; roasting takes fruitiness away and adds chocolate and spice.
// Guests: each has a hidden ideal cup and roast (they only hint at it in their request) and the
// cue words the AI can hear in that request (CUES). A cup is rated with 1 to 5 stars by how close
// it comes to the guest's ideal (rate()).
// The AI (Recommender) is a small nearest-neighbour recommender, the idea behind "guests like you
// liked ...": it remembers every rating; for a new guest it weighs the cups that similar guests
// (similar cue words, cosine similarity) rated well, by similarity and by how good the rating
// was; a returning guest's own ratings count most. From that it predicts the guest's taste,
// picks the closest recipe and states its confidence (how much good evidence it has from how
// similar guests). Without similar ratings it has a cold start and says so.

export const FLAVORS = ['fruity', 'nutty', 'choc', 'spicy'];
export const CUES = ['mild', 'strong', 'cozy', 'awake', 'family', 'fruit'];

/** The four green coffees in the jars (flavor before roasting). */
export const BEANS = [
  { key: 'eth', flavor: [0.95, 0.15, 0.2, 0.25] },
  { key: 'bra', flavor: [0.1, 0.9, 0.55, 0.1] },
  { key: 'gua', flavor: [0.35, 0.3, 0.85, 0.35] },
  { key: 'sum', flavor: [0.1, 0.25, 0.4, 0.95] },
];

/** Share of the first chosen bean in the blend. */
export const RATIOS = [0.2, 0.35, 0.5, 0.65, 0.8];

/** Roast stages (where each begins) and the two cracks. */
export const STAGES = [
  { key: 'green', at: 0 },
  { key: 'yellow', at: 0.15 },
  { key: 'cinnamon', at: 0.32 },
  { key: 'medium', at: 0.48 },
  { key: 'dark', at: 0.66 },
  { key: 'burnt', at: 0.86 },
];
export const FIRST_CRACK = 0.36;
export const SECOND_CRACK = 0.7;
export const RAW_BELOW = 0.26; // tastes raw and grassy below this
export const BURNT_FROM = 0.86;

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

export function stageOf(r) {
  let s = STAGES[0];
  for (const st of STAGES) if (r >= st.at) s = st;
  return s;
}

/** The blend before roasting: share `ratio` of bean a, the rest bean b. */
export function blendFlavor(a, b, ratio) {
  return FLAVORS.map((_, i) => BEANS[a].flavor[i] * ratio + BEANS[b].flavor[i] * (1 - ratio));
}

/** What roasting to level r does to a blend's flavors. */
export function roasted(mix, r) {
  const dev = r - 0.45;
  return [
    clamp(mix[0] * clamp(1.22 - 1.05 * r, 0.12, 1)),
    clamp(mix[1] * (1 - 0.7 * Math.max(0, r - 0.62))),
    clamp(mix[2] + 0.3 * dev),
    clamp(mix[3] + 0.18 * dev),
  ];
}

export function cupFlavor(a, b, ratio, r) {
  return roasted(blendFlavor(a, b, ratio), r);
}

/**
 * The guests in the order they come. ideal: their hidden favourite cup, weights: how much each
 * flavor matters to them, roast: their favourite roast level, cues: what the AI hears in their
 * request. 'grandma2' is grandma coming back (same person, id 'grandma').
 */
export const GUESTS = [
  { key: 'student', id: 'student', model: 'student', ideal: [0.15, 0.3, 0.6, 0.85], weights: [1, 0.6, 1, 1.4], roast: 0.74, cues: { strong: 1, awake: 1 } },
  { key: 'grandma', id: 'grandma', model: 'grandma', ideal: [0.15, 0.85, 0.6, 0.1], weights: [1, 1.4, 1, 1], roast: 0.52, cues: { mild: 1, cozy: 1 } },
  { key: 'business', id: 'business', model: 'business', ideal: [0.12, 0.35, 0.85, 0.5], weights: [1, 0.8, 1.4, 1], roast: 0.68, cues: { strong: 1, awake: 0.8, mild: 0.3 } },
  { key: 'family', id: 'family', model: 'family', ideal: [0.22, 0.8, 0.6, 0.12], weights: [1, 1.3, 1, 1], roast: 0.47, cues: { mild: 1, cozy: 0.6, family: 1 } },
  { key: 'chef', id: 'chef', model: 'chef', ideal: [0.72, 0.15, 0.3, 0.3], weights: [1.6, 1, 1, 1], roast: 0.38, cues: { fruit: 1, mild: 0.4 } },
  { key: 'grandma2', id: 'grandma', model: 'grandma', ideal: [0.15, 0.85, 0.6, 0.1], weights: [1, 1.4, 1, 1], roast: 0.52, cues: { mild: 1, cozy: 1 }, returning: true },
];
/** The Christmas round: the student comes back and wants a gift basket for her grandma. */
export const BASKET_GUEST = { key: 'basket', id: 'student', model: 'student', forId: 'grandma' };

/** Gift basket items with their flavors (coffee: her favourite coffee, always welcome). */
export const ITEMS = [
  { key: 'coffee', model: 'ItemCoffee', flavor: null },
  { key: 'pralines', model: 'ItemPralines', flavor: [0.1, 0.35, 1.0, 0.1] },
  { key: 'tea', model: 'ItemTea', flavor: [0.7, 0.0, 0.0, 0.4] },
  { key: 'stollen', model: 'ItemStollen', flavor: [0.55, 0.55, 0.2, 0.6] },
  { key: 'jam', model: 'ItemJam', flavor: [1.0, 0.0, 0.05, 0.0] },
  { key: 'cookies', model: 'ItemCookies', flavor: [0.1, 1.0, 0.35, 0.25] },
];
const COFFEE_FIT = 0.9;

/**
 * How a guest likes a cup: { stars 1..5, sat 0..1, hint } where hint names the biggest
 * difference (e.g. 'tooDark', 'moreNutty', 'lessFruity').
 */
export function rate(guest, cup, r) {
  const w = guest.weights;
  let e = 0;
  let ws = 0;
  let worst = { d: 0, i: -1 };
  cup.forEach((v, i) => {
    const d = v - guest.ideal[i];
    e += w[i] * d * d;
    ws += w[i];
    if (Math.abs(d) * w[i] > Math.abs(worst.d)) worst = { d: d * w[i], i };
  });
  const ef = Math.sqrt(e / ws);
  const er = Math.abs(r - guest.roast);
  let sat = 1 - 1.55 * ef - 2.1 * Math.max(0, er - 0.03);
  let hint = null;
  if (r < RAW_BELOW) { sat -= 0.35; hint = 'raw'; } else if (r >= BURNT_FROM) { sat -= 0.5; hint = 'burnt'; }
  sat = clamp(sat);
  if (!hint) {
    // The roast is off more than the flavor? Then that is what the guest mentions.
    if (er > 0.08 && er * 2.1 > 1.55 * Math.abs(worst.d) / Math.sqrt(ws)) hint = r > guest.roast ? 'tooDark' : 'tooLight';
    else if (worst.i >= 0 && Math.abs(worst.d) > 0.12) {
      const name = FLAVORS[worst.i];
      hint = `${worst.d < 0 ? 'more' : 'less'}${name[0].toUpperCase()}${name.slice(1)}`;
    }
  }
  const stars = sat >= 0.86 ? 5 : sat >= 0.7 ? 4 : sat >= 0.52 ? 3 : sat >= 0.32 ? 2 : 1;
  return { stars, sat, hint };
}

/** Points for one guest: taste (stars), roast timing and speed. Max 600. */
export function guestPoints(guest, stars, r, seconds) {
  const taste = stars * 80;
  const timing = Math.round(150 * clamp(1 - Math.abs(r - guest.roast) / 0.18));
  const speed = Math.round(50 * clamp(1 - (seconds - 14) / 22));
  return { taste, timing, speed, total: taste + timing + speed };
}

function cosine(a, b) {
  let d = 0;
  let na = 0;
  let nb = 0;
  for (const k of CUES) {
    const x = a[k] ?? 0;
    const y = b[k] ?? 0;
    d += x * y;
    na += x * x;
    nb += y * y;
  }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}

function vcos(a, b) {
  let d = 0;
  let na = 0;
  let nb = 0;
  a.forEach((x, i) => { d += x * b[i]; na += x * x; nb += b[i] * b[i]; });
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}

/** The recipe (two beans, share, roast) whose cup comes closest to a taste profile. */
export function closestRecipe(profile, roast) {
  let best = null;
  for (let a = 0; a < BEANS.length; a++) {
    for (let b = 0; b < BEANS.length; b++) {
      if (a === b) continue;
      for (const ratio of RATIOS) {
        if (ratio < 0.5) continue; // a holds the larger share; the other order covers the rest
        const cup = cupFlavor(a, b, ratio, roast);
        const d = cup.reduce((s, v, i) => s + (v - profile[i]) ** 2, 0);
        if (!best || d < best.d) best = { a, b, ratio, roast, d };
      }
    }
  }
  return best;
}

export class Recommender {
  constructor() {
    this.log = []; // { id, key, cues, cup, roast, stars, recipe }
  }

  get count() {
    return this.log.length;
  }

  record(guest, recipe, cup, roast, stars) {
    this.log.push({ id: guest.id, key: guest.key, cues: guest.cues, cup: [...cup], roast, stars, recipe: { ...recipe } });
  }

  /**
   * What the AI thinks about this guest:
   *   neighbors  similar guests it learned from [{ id, sim, stars }], strongest first
   *   regular    the guest's own earlier rating (a returning guest), or null
   *   profile    predicted taste (four flavors) and roast, or null without good evidence
   *   recipe     the closest recipe, or null
   *   conf       confidence 0..1
   *   avoid      a similar guest's poorly rated cup (when nothing good is known)
   */
  suggest(guest) {
    const seen = new Map();
    let sum = 0;
    let maxSim = 0;
    const prof = [0, 0, 0, 0];
    let roast = 0;
    let avoid = null;
    let regular = null;
    for (const e of this.log) {
      const same = e.id === guest.id;
      const sim = same ? 1 : cosine(guest.cues, e.cues);
      if (sim < 0.12) continue;
      if (same) regular = e;
      const prev = seen.get(e.id);
      if (!prev || prev.sim * prev.stars < sim * e.stars) seen.set(e.id, { id: e.id, key: e.key, sim, stars: e.stars });
      if (e.stars < 3) {
        if (!avoid || sim > avoid.sim) avoid = { ...e, sim };
        continue;
      }
      const w = sim * sim * ((e.stars - 2) / 3) * (same ? 3 : 1);
      sum += w;
      maxSim = Math.max(maxSim, sim);
      e.cup.forEach((v, i) => { prof[i] += w * v; });
      roast += w * e.roast;
    }
    const neighbors = [...seen.values()].sort((a, b) => b.sim - a.sim);
    if (!sum) return { neighbors, regular, profile: null, recipe: null, conf: 0, avoid };
    const profile = prof.map((v) => v / sum);
    const r = roast / sum;
    const recipe = closestRecipe(profile, r);
    const conf = clamp((1 - Math.exp(-2.2 * sum)) * maxSim, 0, 0.97);
    return { neighbors, regular, profile, roast: r, recipe, conf, avoid: null };
  }

  /** Gift basket: ranks the items by what the AI learned about the person it is for. */
  basket(forId) {
    const s = this.suggest({ id: forId, cues: GUESTS.find((g) => g.id === forId)?.cues ?? {} });
    const own = this.log.filter((e) => e.id === forId);
    const coffeeLiked = own.length ? Math.max(...own.map((e) => e.stars)) / 5 : 0.6;
    const scored = ITEMS.map((it) => ({ key: it.key, score: it.flavor ? (s.profile ? vcos(it.flavor, s.profile) : 0.3) : coffeeLiked }));
    const pick = [...scored].sort((a, b) => b.score - a.score).slice(0, 3).map((x) => x.key);
    return { pick, conf: s.profile ? s.conf : 0, profile: s.profile, scored };
  }
}

/** How well an item fits a guest's real taste (0..1). */
export function itemFit(guest, key) {
  const it = ITEMS.find((x) => x.key === key);
  if (!it.flavor) return COFFEE_FIT;
  const w = guest.weights;
  const wi = guest.ideal.map((v, i) => v * w[i]);
  return clamp(vcos(it.flavor, wi));
}

/** Points and stars for a basket of three items. Max 900. */
export function basketResult(guest, keys) {
  const fits = keys.map((k) => itemFit(guest, k));
  const all = ITEMS.map((it) => itemFit(guest, it.key)).sort((a, b) => b - a);
  const best = all[0] + all[1] + all[2];
  const sum = fits.reduce((s, v) => s + v, 0);
  const perfect = sum >= best - 1e-6;
  const points = Math.round(fits.reduce((s, v) => s + 250 * v, 0)) + (perfect ? 150 : 0);
  const q = sum / best;
  const stars = perfect || q > 0.97 ? 5 : q > 0.86 ? 4 : q > 0.7 ? 3 : q > 0.5 ? 2 : 1;
  return { points: Math.min(900, points), stars, fits, perfect };
}

/** The guest the basket is for (their real taste). */
export function basketFor() {
  return GUESTS.find((g) => g.id === BASKET_GUEST.forId);
}

/** Position of a cup on the taste map: x = roast (light to dark), y = fruity (up) vs. nutty and chocolatey (down). */
export function mapPos(cup, r) {
  return { x: clamp((r - 0.2) / 0.7), y: clamp(0.5 + 0.55 * (cup[0] - (cup[1] + cup[2]) / 2)) };
}
