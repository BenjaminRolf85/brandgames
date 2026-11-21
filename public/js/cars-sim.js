// "Autohof" (key 'cars'): the rules of the used-car lot, without any drawing (also runs in Node
// for the balance tests). Six weeks; every week the same three decisions:
//   1. buying:      offers (trade-ins and auction lots) with a condition, an asking price and the
//                   price the car should sell for; one haggling try per offer
//   2. pricing:     one stance for the whole lot (quick sale, normal, patient)
//   3. advertising: a budget in four steps, optionally aimed at one segment
// Then the week runs: the buyers of the area (per segment) visit the lot in the share that
// walk-ins and advertising reach, look for their segment and buy if a fitting car stands there
// at a price they accept. Cars that stay cost money (interest and loss in value).
//
// The AI forecast is a real little estimator: expected buyers per segment from the week's known
// signal (season, weather, fuel price, holidays, a local event) times what it has learned about
// this town from the weeks so far, with a range that is right about four times out of five and
// narrows as data comes in. Once or twice per round something happens that it could not know
// (a news flash after the decisions are made).
//
// Profit counts: sales minus purchase prices, standing costs, advertising and loan fees; cars
// left at the end go to a wholesaler below their purchase price.

export const SEGMENTS = ['small', 'estate', 'suv', 'cabrio', 'electric'];
export const CONDS = ['top', 'ok', 'rough'];
export const STANCES = ['quick', 'normal', 'patient'];
export const WEEKS = 6;
export const MAX_BAYS = 8;

export const TUNE = {
  cash: 22000,
  bays: 6,
  startCars: 3,
  // buyers per week in the area in a normal week, and what a car of the segment is worth
  base: { small: 3.4, estate: 3.0, suv: 3.0, cabrio: 1.8, electric: 2.4 },
  value: { small: 6500, estate: 10500, suv: 15000, cabrio: 12500, electric: 16500 },
  cond: { top: { value: 1.1, appeal: 0.08 }, ok: { value: 1, appeal: 0 }, rough: { value: 0.88, appeal: -0.12 } },
  // price against the list price, and the share of interested visitors who buy
  stance: { quick: { price: 0.94, p: 0.92, sub: 0.65 }, normal: { price: 1, p: 0.64, sub: 0.28 }, patient: { price: 1.04, p: 0.36, sub: 0.1 } },
  // advertising: weekly cost and the share of the area's buyers it brings on top of the walk-ins
  walk: 0.22,
  ads: [{ cost: 0, reach: 0 }, { cost: 300, reach: 0.16 }, { cost: 800, reach: 0.32 }, { cost: 1900, reach: 0.46 }],
  aim: { hit: 1.7, rest: 0.55, max: 0.96 }, // aimed at one segment: more of its buyers, fewer of the others
  // stance.sub: a visitor whose segment is missing settles for a related one this often
  subFactor: 0.8,
  related: { small: 'electric', electric: 'small', estate: 'suv', suv: 'estate', cabrio: 'small' },
  stand: { flat: 100, share: 0.012 }, // per car and week: interest and loss in value
  haggle: 0.93, // a successful haggle pays this share of the asking price
  markdown: 0.7, // unsold cars at the end: this share of the purchase price (relaxed mode: easy)
  markdownEasy: 0.88,
  loan: { amount: 8000, fee: 400 },
  // relaxed mode: more money to start with, cheaper standing, better odds when haggling
  easy: { cash: 4000, stand: 0.7, haggle: 0.15 },
  goodWeek: 3000, // a week with at least this profit earns a reward: a second transporter, then more bays
  noise: 0.35, // demand: spread around its mean, times the root of the mean
  biasSd: 0.42, // how much this town differs from the average, per segment
  z: 0.9, // half width of the forecast's range in standard deviations (about 80 %)
};

// Known signals: the forecast sees them. Multipliers on the buyers per segment ('all' for every one).
export const SIGNALS = {
  calm: {},
  spring: { cabrio: 2.1, small: 1.1 },
  snow: { suv: 1.9, estate: 1.15, cabrio: 0.4 },
  fuel: { small: 1.6, electric: 1.7, suv: 0.65 },
  holidays: { estate: 1.9, suv: 1.2, cabrio: 0.8 },
  fair: { all: 1.35 },
  rain: { all: 0.75, cabrio: 0.5 },
  bonus: { suv: 1.4, electric: 1.5, cabrio: 1.3 },
  drivers: { small: 2.0 },
};
const SEASONS = {
  spring: ['spring', 'holidays', 'fair', 'rain', 'fuel', 'drivers', 'bonus'],
  winter: ['snow', 'bonus', 'fuel', 'fair', 'rain', 'drivers', 'holidays'],
};
// Surprises: nobody could know them when the week was planned.
export const SURPRISES = {
  fuelJump: { small: 1.6, electric: 1.8, suv: 0.4, estate: 0.8 },
  hail: { all: 0.55, cabrio: 0.5 },
  subsidy: { electric: 2.4 },
  heat: { cabrio: 2.3, suv: 0.8 },
  roadwork: { all: 0.6 },
  test: { estate: 2.0 },
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const r100 = (v) => Math.round(v / 100) * 100;
const r50 = (v) => Math.round(v / 50) * 50;
const r10 = (v) => Math.round(v / 10) * 10;

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mult = (table, seg) => (table?.all ?? 1) * (table?.[seg] ?? 1);

export class CarsGame {
  constructor({ seed = Math.floor(Math.random() * 2 ** 31), easy = false } = {}) {
    this.seed = seed;
    this.easy = easy;
    this.rand = mulberry(seed);
    this.week = 0;
    this.cash = TUNE.cash + (easy ? TUNE.easy.cash : 0);
    this.bays = TUNE.bays;
    this.transporters = 1; // a second one brings a fifth offer per week
    this.lot = [];
    this.offers = [];
    this.stance = 'normal';
    this.ad = 0;
    this.target = null;
    this.profit = 0;
    this.nextId = 1;
    this.history = []; // one result per finished week
    this.loans = 0;
    this.over = false;
    this.stats = { sold: 0, missed: 0, dear: 0, adSpend: 0, adWaste: 0, standCost: 0, bought: 0, favoured: 0, haggles: 0, haggleWins: 0 };
    // What this town likes (the forecast has to learn it), the weeks' signals, the surprises.
    this.bias = {};
    for (const s of SEGMENTS) this.bias[s] = clamp(Math.exp(this.gauss() * TUNE.biasSd), 0.5, 1.9);
    this.season = this.rand() < 0.5 ? 'spring' : 'winter';
    this.signals = ['calm', ...this.shuffle(SEASONS[this.season]).slice(0, WEEKS - 1)];
    this.surprises = this.planSurprises();
    // The forecast's memory: per segment the buyers seen and the buyers an average town would have had.
    this.seen = {};
    this.expected = {};
    for (const s of SEGMENTS) { this.seen[s] = 0; this.expected[s] = 0; }
    // Two cars stand on the lot already.
    const first = this.shuffle(SEGMENTS).slice(0, TUNE.startCars);
    for (const seg of first) {
      const list = r100(TUNE.value[seg] * (0.97 + this.rand() * 0.06));
      this.addCar({ seg, cond: 'ok', list, paid: r100(list * 0.89) });
    }
    this.beginWeek();
  }

  // ---------- random helpers ----------

  gauss() {
    let u = 0;
    while (u === 0) u = this.rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * this.rand());
  }

  shuffle(list) {
    const a = [...list];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  pick(list) { return list[Math.floor(this.rand() * list.length)]; }

  planSurprises() {
    // One or two per round (relaxed mode: one), never in the first two weeks, never two in a row.
    const out = {};
    const n = this.easy ? 1 : (this.rand() < 0.55 ? 2 : 1);
    const weeks = this.shuffle([3, 4, 5, 6]);
    const kinds = this.shuffle(Object.keys(SURPRISES));
    const chosen = [];
    for (const w of weeks) {
      if (chosen.length >= n) break;
      if (chosen.some((c) => Math.abs(c - w) < 2)) continue;
      chosen.push(w);
    }
    chosen.forEach((w, i) => { out[w] = kinds[i]; });
    return out;
  }

  /** A surprise's multiplier (relaxed mode: half as strong). */
  surpriseMult(key, seg) {
    if (!key) return 1;
    const m = mult(SURPRISES[key], seg);
    return this.easy ? 1 + (m - 1) * 0.5 : m;
  }

  // ---------- the lot ----------

  addCar({ seg, cond, list, paid }) {
    const used = new Set(this.lot.map((c) => c.bay));
    let bay = 0;
    while (used.has(bay)) bay++;
    const car = { id: this.nextId++, seg, cond, list, paid, weeks: 0, bay, boughtWeek: this.week };
    this.lot.push(car);
    return car;
  }

  get freeBays() { return this.bays - this.lot.length; }

  count(seg) { return this.lot.filter((c) => c.seg === seg).length; }

  /** The price on the car's sign with a stance. */
  price(car, stance = this.stance) { return r50(car.list * TUNE.stance[stance].price); }

  /** What a car costs per week while it stands (interest and loss in value). */
  standCost(car) { return r10((TUNE.stand.flat + car.list * TUNE.stand.share) * (this.easy ? TUNE.easy.stand : 1)); }

  /** The share of interested visitors who buy this car with a stance. */
  buyChance(car, stance = this.stance) { return clamp(TUNE.stance[stance].p + TUNE.cond[car.cond].appeal, 0.05, 0.98); }

  get markdown() { return this.easy ? TUNE.markdownEasy : TUNE.markdown; }

  get lastWeek() { return this.week >= WEEKS; }

  // ---------- the week ----------

  beginWeek() {
    this.week += 1;
    this.signal = this.signals[this.week - 1];
    this.loanNote = null;
    this.forecast = this.makeForecast();
    this.offers = this.makeOffers();
    // No dead end: if the till is empty and (almost) nothing stands on the lot, the bank bridges.
    const cheapest = Math.min(...this.offers.map((o) => o.ask));
    if (this.cash < 0 || (this.lot.length < 2 && this.cash < cheapest)) {
      this.cash += TUNE.loan.amount;
      this.cash -= TUNE.loan.fee;
      this.profit -= TUNE.loan.fee;
      this.loans += 1;
      this.loanNote = { amount: TUNE.loan.amount, fee: TUNE.loan.fee };
    }
    this.result = null;
  }

  /** Mean buyers of a segment this week as the forecast sees it, and how sure it is. */
  estimate(seg) {
    const c = TUNE.noise ** 2;
    const p0 = 1 / TUNE.biasSd ** 2;
    const prec = p0 + this.expected[seg] / c;
    const bias = (p0 + this.seen[seg] / c) / prec;
    const normal = TUNE.base[seg] * bias;
    const mean = normal * mult(SIGNALS[this.signal], seg);
    const sd = Math.sqrt(c * mean + (mean / Math.sqrt(prec)) ** 2);
    return { mean, sd, normal, bias };
  }

  makeForecast() {
    const rows = {};
    for (const seg of SEGMENTS) {
      const { mean, sd, normal } = this.estimate(seg);
      const lo = Math.max(0, Math.round(mean - TUNE.z * sd));
      const hi = Math.max(lo + 1, Math.round(mean + TUNE.z * sd));
      const k = mean / Math.max(0.01, normal);
      rows[seg] = { mean, sd, lo, hi, trend: k > 1.2 ? 'up' : k < 0.82 ? 'down' : 'flat' };
    }
    return { week: this.week, signal: this.signal, rows, dataWeeks: this.week - 1 };
  }

  makeOffers() {
    const n = this.week === 1 ? 2 : 3 + this.transporters;
    let segs;
    if (this.week === 1) {
      // The guided week: two different cars the lot does not have yet.
      const have = new Set(this.lot.map((c) => c.seg));
      segs = this.shuffle(SEGMENTS.filter((s) => !have.has(s))).slice(0, 2);
    } else {
      // At least three different segments among the four.
      do { segs = Array.from({ length: n }, () => this.pick(SEGMENTS)); } while (new Set(segs).size < 3);
    }
    return segs.map((seg, i) => {
      const r = this.rand();
      const cond = this.week === 1 ? 'ok' : r < 0.3 ? 'top' : r < 0.75 ? 'ok' : 'rough';
      const src = this.rand() < 0.5 ? 'trade' : 'auction';
      const list = r100(TUNE.value[seg] * TUNE.cond[cond].value * (0.96 + this.rand() * 0.08));
      // How dear the seller is: from a real bargain to hardly any margin.
      const u = this.week === 1 ? 0.86 + this.rand() * 0.04 : (src === 'trade' ? 0.78 : 0.81) + this.rand() * 0.15;
      const ask = r100(list * u);
      const chance = Math.round((0.4 + clamp((u - 0.78) / 0.18, 0, 1) * 0.35 + (this.easy ? TUNE.easy.haggle : 0)) * 20) / 20;
      return { id: `w${this.week}o${i}`, seg, cond, src, list, ask, firstAsk: ask, chance, state: 'open', haggled: false };
    });
  }

  /** Why an offer cannot be bought right now: null, 'cash' or 'bays' (or 'gone' / 'bought'). */
  blocked(offer) {
    if (offer.state !== 'open') return offer.state;
    if (this.freeBays <= 0) return 'bays';
    if (offer.ask > this.cash) return 'cash';
    return null;
  }

  buy(id) {
    const offer = this.offers.find((o) => o.id === id);
    if (!offer || this.blocked(offer)) return null;
    const favoured = this.favours(offer.seg);
    offer.state = 'bought';
    this.cash -= offer.ask;
    const car = this.addCar({ seg: offer.seg, cond: offer.cond, list: offer.list, paid: offer.ask });
    this.stats.bought += 1;
    if (favoured) this.stats.favoured += 1;
    return car;
  }

  /** One haggling try per offer: the price drops, or the seller walks. */
  haggle(id) {
    const offer = this.offers.find((o) => o.id === id);
    if (!offer || offer.state !== 'open' || offer.haggled) return null;
    offer.haggled = true;
    this.stats.haggles += 1;
    if (this.rand() < offer.chance) {
      offer.ask = r100(offer.ask * TUNE.haggle);
      this.stats.haggleWins += 1;
      return { ok: true, ask: offer.ask };
    }
    offer.state = 'gone';
    return { ok: false };
  }

  setStance(s) { if (STANCES.includes(s)) this.stance = s; }

  setAd(level) { this.ad = clamp(Math.round(level), 0, TUNE.ads.length - 1); if (!this.ad) this.target = null; }

  setTarget(seg) { this.target = SEGMENTS.includes(seg) ? seg : null; }

  /** The share of a segment's buyers who visit: walk-ins plus advertising. */
  reach(seg, ad = this.ad, target = this.target) {
    let a = TUNE.ads[ad].reach;
    if (ad && target) a *= seg === target ? TUNE.aim.hit : TUNE.aim.rest;
    return Math.min(TUNE.aim.max, TUNE.walk + a);
  }

  /** Does the forecast favour buying a car of this segment now (demand against the stock)? */
  favours(seg) {
    return this.speed(seg) !== 'slow' && this.forecast.rows[seg].trend !== 'down';
  }

  /** How fast a further car of a segment should sell: 'fast', 'normal' or 'slow'. */
  speed(seg, extra = 1) {
    const buyers = this.forecast.rows[seg].mean * (TUNE.walk + TUNE.ads[2].reach);
    const k = buyers / (this.count(seg) + extra);
    return k >= 1.15 ? 'fast' : k >= 0.6 ? 'normal' : 'slow';
  }

  /** The value of an offer as the forecast sees it (expected margin minus the risk of standing). */
  offerValue(offer) {
    const row = this.forecast.rows[offer.seg];
    const buyers = row.mean * (TUNE.walk + TUNE.ads[2].reach) * 0.72;
    // The chance to sell it this week: never certain, however many buyers are expected.
    const sell = 1 - Math.exp(-buyers / (this.count(offer.seg) + 1));
    const car = { list: offer.list, paid: offer.ask };
    const margin = offer.list - offer.ask;
    const wait = this.lastWeek ? offer.ask * (1 - this.markdown) : this.standCost(car) * 1.2;
    return sell * margin - (1 - sell) * wait;
  }

  /** The offer the forecast likes best (null if none is worth it): the relaxed mode's hint. */
  bestOffer() {
    let best = null;
    let bestV = 200;
    for (const o of this.offers) {
      if (this.blocked(o)) continue;
      const v = this.offerValue(o);
      if (v > bestV) { bestV = v; best = o; }
    }
    return best;
  }

  /**
   * What the plan should bring: expected visitors against cars per segment, how many visitors
   * should leave empty-handed, how many cars should stay, and the expected profit of the week.
   */
  preview(ad = this.ad, target = this.target, stance = this.stance) {
    const rows = {};
    let visitors = 0;
    let empty = 0;
    let staying = 0;
    let net = -TUNE.ads[ad].cost;
    let sales = 0;
    for (const seg of SEGMENTS) {
      const cars = this.lot.filter((c) => c.seg === seg);
      const v = this.forecast.rows[seg].mean * this.reach(seg, ad, target);
      const p = cars.length ? cars.reduce((s, c) => s + this.buyChance(c, stance), 0) / cars.length : 0;
      const sold = cars.length ? cars.length * (1 - Math.exp((-v * p) / cars.length)) : 0;
      const margin = cars.length ? cars.reduce((s, c) => s + this.price(c, stance) - c.paid, 0) / cars.length : 0;
      const stand = cars.length ? cars.reduce((s, c) => s + this.standCost(c), 0) / cars.length : 0;
      const keep = this.lastWeek ? cars.reduce((s, c) => s + c.paid * (1 - this.markdown), 0) / Math.max(1, cars.length) : stand;
      rows[seg] = { visitors: v, cars: cars.length, sold, empty: Math.max(0, v - cars.length), staying: cars.length - sold, margin, keep, p };
      visitors += v;
      empty += rows[seg].empty;
      staying += rows[seg].staying;
      sales += sold;
      net += sold * margin - (cars.length - sold) * keep;
    }
    // Visitors whose segment is missing sometimes take a related car that is still there.
    for (const seg of SEGMENTS) {
      const row = rows[seg];
      const alt = rows[TUNE.related[seg]];
      if (row.cars || alt.staying < 0.05) continue;
      const takers = Math.min(alt.staying, row.visitors * TUNE.stance[stance].sub * TUNE.subFactor * alt.p);
      alt.staying -= takers;
      alt.sold += takers;
      staying -= takers;
      sales += takers;
      net += takers * (alt.margin + alt.keep);
    }
    const extra = SEGMENTS.reduce((s, seg) => s + this.forecast.rows[seg].mean * (this.reach(seg, ad, target) - TUNE.walk), 0);
    return { rows, visitors, cars: this.lot.length, empty, staying, sales, net, extra, cost: TUNE.ads[ad].cost };
  }

  /** The advertising that fits the lot best as the forecast sees it: { ad, target, net }. */
  adAdvice(stance = this.stance) {
    let best = { ad: 0, target: null, net: this.preview(0, null, stance).net };
    const segs = [null, ...SEGMENTS.filter((s) => this.count(s) > 0)];
    for (let ad = 1; ad < TUNE.ads.length; ad++) {
      for (const target of segs) {
        const net = this.preview(ad, target, stance).net;
        // A clearly better plan only (small differences are noise): cheaper wins ties.
        if (net > best.net + 60) best = { ad, target, net };
      }
    }
    return best;
  }

  /** The stance that fits best: quick when cars outnumber visitors (or time runs out), patient in a rush. */
  stanceAdvice(ad = this.ad, target = this.target) {
    let best = 'normal';
    let bestNet = this.preview(ad, target, 'normal').net;
    for (const s of ['quick', 'patient']) {
      const net = this.preview(ad, target, s).net;
      if (net > bestNet + 80) { best = s; bestNet = net; }
    }
    return best;
  }

  /** Runs the week: who comes, who buys, what it costs. Returns the result (also this.result). */
  runWeek() {
    if (this.result || this.over) return this.result;
    const surprise = this.surprises[this.week] ?? null;
    const fc = this.forecast;
    const before = this.lot.length;
    // The buyers of the area this week.
    const demand = {};
    const visitors = [];
    for (const seg of SEGMENTS) {
      const mu = TUNE.base[seg] * this.bias[seg] * mult(SIGNALS[this.signal], seg) * this.surpriseMult(surprise, seg);
      const d = Math.max(0, Math.round(mu + this.gauss() * TUNE.noise * Math.sqrt(mu)));
      demand[seg] = d;
      const r = this.reach(seg);
      for (let i = 0; i < d; i++) {
        if (this.rand() >= r) continue;
        visitors.push({ seg, via: this.rand() < TUNE.walk / r ? 'walk' : 'ad' });
      }
    }
    const order = this.shuffle(visitors);
    const rank = { top: 0, ok: 1, rough: 2 };
    const sold = [];
    for (const v of order) {
      const own = this.lot.filter((c) => c.seg === v.seg && !c.sold).sort((a, b) => rank[a.cond] - rank[b.cond]);
      let car = own[0] ?? null;
      let factor = 1;
      v.outcome = 'none';
      if (!car && this.rand() < TUNE.stance[this.stance].sub) {
        const alt = this.lot.filter((c) => c.seg === TUNE.related[v.seg] && !c.sold).sort((a, b) => rank[a.cond] - rank[b.cond]);
        car = alt[0] ?? null;
        factor = TUNE.subFactor;
        if (car) v.sub = true;
      }
      if (!car) continue;
      v.carId = car.id;
      if (this.rand() < this.buyChance(car) * factor) {
        car.sold = true;
        v.outcome = 'buy';
        v.price = this.price(car);
        v.profit = v.price - car.paid;
        sold.push({ car, price: v.price, profit: v.profit });
      } else v.outcome = v.sub ? 'none' : 'dear';
      if (v.outcome === 'none') { v.carId = null; v.sub = false; }
    }
    // Money.
    const gross = sold.reduce((s, x) => s + x.profit, 0);
    const income = sold.reduce((s, x) => s + x.price, 0);
    this.lot = this.lot.filter((c) => !c.sold);
    const standing = this.lot.map((car) => ({ car, cost: this.standCost(car) }));
    const standCost = standing.reduce((s, x) => s + x.cost, 0);
    const adCost = TUNE.ads[this.ad].cost;
    const net = gross - standCost - adCost;
    this.cash += income - standCost - adCost;
    this.profit += net;
    for (const car of this.lot) car.weeks += 1;
    // The forecast learns: the buyers it saw against an average town's (the news is known by now).
    const checks = {};
    for (const seg of SEGMENTS) {
      this.seen[seg] += demand[seg];
      this.expected[seg] += TUNE.base[seg] * mult(SIGNALS[this.signal], seg) * this.surpriseMult(surprise, seg);
      const row = fc.rows[seg];
      checks[seg] = { lo: row.lo, hi: row.hi, actual: demand[seg], hit: demand[seg] >= row.lo && demand[seg] <= row.hi, surprised: !!surprise && this.surpriseMult(surprise, seg) !== 1 };
    }
    const missed = order.filter((v) => v.outcome === 'none');
    const dear = order.filter((v) => v.outcome === 'dear');
    const adVisitors = order.filter((v) => v.via === 'ad');
    const adEmpty = adVisitors.filter((v) => v.outcome === 'none').length;
    const adWaste = adVisitors.length ? Math.round((adCost * adEmpty) / adVisitors.length) : adCost;
    const missedBy = {};
    for (const v of missed) missedBy[v.seg] = (missedBy[v.seg] ?? 0) + 1;
    // A good week earns a reward: first a second transporter (one more offer per week), then bays.
    let reward = null;
    if (net >= TUNE.goodWeek && this.week < WEEKS) {
      if (this.transporters < 2) {
        this.transporters = 2;
        reward = { kind: 'transporter' };
      } else if (this.bays < MAX_BAYS) {
        this.bays += 1;
        reward = { kind: 'bay', bays: this.bays };
      }
    }
    const st = this.stats;
    st.sold += sold.length;
    st.missed += missed.length;
    st.dear += dear.length;
    st.adSpend += adCost;
    st.adWaste += adWaste;
    st.standCost += standCost;
    const res = {
      week: this.week, surprise, signal: this.signal, demand, visitors: order, sold, gross, standing, standCost, adCost, ad: this.ad, target: this.target,
      stance: this.stance, net, missed: missed.length, missedBy, dear: dear.length, adEmpty, adVisitors: adVisitors.length, adWaste,
      perSale: sold.length && adCost ? Math.round(adCost / sold.length) : null, checks, reward, carsBefore: before, carsLeft: this.lot.length,
      hits: SEGMENTS.filter((s) => checks[s].hit).length,
    };
    res.advice = this.advise(res);
    this.result = res;
    this.history.push(res);
    if (this.week >= WEEKS) this.finish();
    return res;
  }

  /** One sentence of advice from the week's biggest lever: { key, vars }. */
  advise(r) {
    const visitors = r.visitors.length;
    if (r.week === WEEKS) return { key: 'end' };
    const last = r.week === WEEKS - 1;
    if (r.carsLeft === 0 && r.missed >= 2 && r.sold.length && !last) return { key: 'soldOut', vars: { n: r.missed, segs: Object.keys(r.missedBy) } };
    if (r.adCost >= TUNE.ads[2].cost && r.adEmpty >= Math.max(2, r.sold.length)) return { key: 'adWaste', vars: { n: r.adEmpty } };
    if (r.missed >= 3 && r.missed >= r.sold.length) {
      const seg = Object.entries(r.missedBy).sort((a, b) => b[1] - a[1])[0][0];
      return { key: 'missed', vars: { n: r.missed, seg } };
    }
    if (r.stance === 'patient' && r.dear >= 2) return { key: 'dear', vars: { n: r.dear } };
    if (r.carsLeft >= 3 && r.ad <= 1 && visitors <= r.carsBefore) return { key: 'quiet', vars: { n: r.carsLeft } };
    if (r.stance === 'quick' && visitors >= r.carsBefore * 2 && r.carsLeft === 0 && !last) return { key: 'cheap' };
    if (r.surprise && r.net < TUNE.goodWeek) return { key: 'surprise' };
    if (last) return { key: 'lastNext', vars: { pct: Math.round((1 - this.markdown) * 100) } };
    if (r.carsLeft >= 3) return { key: 'standing', vars: { n: r.carsLeft, cost: r.standCost } };
    return { key: r.net >= TUNE.goodWeek ? 'good' : 'ok' };
  }

  nextWeek() {
    if (!this.result || this.over) return false;
    this.beginWeek();
    return true;
  }

  /** The end: what is left goes to a wholesaler below its purchase price. */
  finish() {
    if (this.over) return this.final;
    this.over = true;
    const left = this.lot.map((car) => ({ car, loss: Math.round(car.paid * (1 - this.markdown)) }));
    const loss = left.reduce((s, x) => s + x.loss, 0);
    this.profit -= loss;
    this.cash += left.reduce((s, x) => s + x.car.paid - x.loss, 0);
    const checks = this.history.flatMap((h) => SEGMENTS.map((s) => h.checks[s]));
    const fair = checks.filter((c) => !c.surprised);
    this.final = {
      profit: this.profit, left: left.length, markdownLoss: loss,
      hits: checks.filter((c) => c.hit).length, checks: checks.length,
      fairHits: fair.filter((c) => c.hit).length, fairChecks: fair.length,
      surprises: Object.keys(this.surprises).length,
      ...this.score(),
    };
    return this.final;
  }

  /**
   * Points: from the profit (a good round lands around 3000 to 4000), plus small bonuses for few
   * missed buyers and little wasted advertising. Never more than 4950.
   */
  score() {
    const st = this.stats;
    const p = Math.max(0, this.profit);
    // Straight up to the knee, then flatter: no strategy runs away past the cap.
    const knee = 18000;
    const raw = p <= knee ? p * 0.165 : knee * 0.165 + (p - knee) * 0.05;
    const base = Math.min(4300, Math.round(raw));
    const missBonus = Math.round(300 * clamp(1 - (st.missed - 10) / 30, 0, 1) * clamp(st.sold / 12, 0, 1));
    const adBonus = Math.round(300 * clamp(1 - (st.adWaste / Math.max(1, st.adSpend) - 0.25) / 0.45, 0, 1) * clamp(st.adSpend / 2400, 0, 1));
    return { score: Math.min(4950, base + missBonus + adBonus), base, missBonus, adBonus };
  }
}
