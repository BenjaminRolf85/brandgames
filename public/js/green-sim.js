// "Grünes Portfolio" (key 'green'): the game logic, without three.js or the DOM (so it can run in
// Node for balancing). A region diorama with free plots; every year has a budget, and the player
// finances wind turbines, solar parks, homes, schools and kindergartens. An AI forecasts the yield
// of every plot from weather data (wind speed, sun hours) with a confidence, and the demand of the
// town's districts (children, families); the real year then brings weather surprises.
//
// Layout (diorama space, meters; x to the right, z towards the player = south, y up). It mirrors
// the terrain of blender/build_green.py (hills, coast, river, town, fields): keep both in sync.

export const YEARS = 5;
export const FIRST_YEAR = 2027;
export const BASE_BUDGET = 8; // million euros per year
export const RETURN_PER_GWH = 0.08; // feed-in revenue that flows back into next year's budget
export const CO2_PER_GWH = 400; // tonnes of CO2 a GWh of green power saves
export const HOUSEHOLD_MWH = 3.5; // a household's yearly power use
export const QOL_START = 40;

export const TYPE_KEYS = ['wind', 'solar', 'homes', 'school', 'kita'];
export const TYPES = {
  wind: { cost: 5, kind: 'energy', area: 'land', token: 'xr-green-wind', icon: 'greenWind' },
  solar: { cost: 3, kind: 'energy', area: 'land', token: 'xr-green-sun', icon: 'greenSolar' },
  homes: { cost: 4, kind: 'social', area: 'town', token: 'xr-green-home', icon: 'greenHomes', need: 'homes', cap: 40, weight: 10, co2: 90 },
  school: { cost: 5, kind: 'social', area: 'town', token: 'xr-green-school', icon: 'greenSchool', need: 'kids', cap: 150, weight: 13, co2: 60 },
  kita: { cost: 2, kind: 'social', area: 'town', token: 'xr-green-kita', icon: 'greenKita', need: 'small', cap: 45, weight: 9, co2: 25 },
};
export const CHEAPEST = Math.min(...TYPE_KEYS.map((k) => TYPES[k].cost));

// ---------- the region ----------

export const HILLS = [
  { x: -0.30, z: -0.19, h: 0.14, r: 0.11 },
  { x: -0.03, z: -0.265, h: 0.09, r: 0.08 },
  { x: -0.42, z: 0.02, h: 0.07, r: 0.075 },
  { x: 0.19, z: -0.25, h: 0.06, r: 0.065 },
];
export const RIVER = [[-0.17, -0.40], [-0.14, -0.31], [-0.155, -0.215], [-0.105, -0.13], [-0.035, -0.096], [0.05, -0.085], [0.12, -0.083], [0.19, -0.07], [0.27, -0.058], [0.36, -0.03]];
export const TOWN = { x0: -0.07, x1: 0.28, z0: -0.04, z1: 0.33 };
export const FIELDS = { x0: -0.49, x1: -0.1, z0: 0.06, z1: 0.36 };
export const OUTLINE = { a: 0.52, b: 0.37, n: 3.6 }; // superellipse |x/a|^n + |z/b|^n = 1

export const smooth = (e0, e1, v) => { const k = Math.min(1, Math.max(0, (v - e0) / (e1 - e0))); return k * k * (3 - 2 * k); };
export const coastX = (z) => 0.315 + 0.045 * Math.sin(5.5 * z + 1.2) - 0.075 * smooth(0.04, 0.33, -z);

export function hillAt(x, z) {
  let h = 0;
  for (const H of HILLS) h += H.h * Math.exp(-((x - H.x) ** 2 + (z - H.z) ** 2) / (2 * H.r * H.r));
  return h;
}

export function riverDist(x, z) {
  let best = Infinity;
  for (let i = 0; i < RIVER.length - 1; i++) {
    const [ax, az] = RIVER[i];
    const [bx, bz] = RIVER[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const k = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * k, z - az - dz * k));
  }
  return best;
}

export const inside = (x, z, m = 0) => (Math.abs(x) / (OUTLINE.a - m)) ** OUTLINE.n + (Math.abs(z) / (OUTLINE.b - m)) ** OUTLINE.n <= 1;
const inBox = (b, x, z, soft = 0.04) => smooth(b.x0 - soft, b.x0 + soft, x) * smooth(b.x1 + soft, b.x1 - soft, x) * smooth(b.z0 - soft, b.z0 + soft, z) * smooth(b.z1 + soft, b.z1 - soft, z);

/** Mean wind speed at hub height (m/s): hills and the coast are windy, the valley sheltered. */
export function windAt(x, z) {
  const hill = hillAt(x, z) / 0.14;
  const coast = smooth(0.17, 0.0, coastX(z) - x);
  const valley = smooth(0.13, 0.0, riverDist(x, z)) * (1 - Math.min(1, hill * 2));
  return 5.0 + 3.2 * hill ** 0.85 + 1.7 * coast - 0.6 * valley - 0.45 * inBox(TOWN, x, z);
}

/** Sun hours per year: the southern fields are sunny, hills catch clouds, the valley has fog. */
export function sunAt(x, z) {
  const hill = hillAt(x, z) / 0.14;
  const fields = inBox(FIELDS, x, z, 0.08);
  const coast = smooth(0.15, 0.0, coastX(z) - x);
  const fog = smooth(0.13, 0.0, riverDist(x, z)) * (1 - Math.min(1, hill * 2));
  return 1540 + 320 * fields + 90 * coast - 150 * hill - 150 * fog - 40 * inBox(TOWN, x, z);
}

/** How sure the AI is (0..1): complex terrain (hills) makes wind hard, fog makes sun hard. */
export function windConfAt(x, z) {
  const hill = hillAt(x, z) / 0.14;
  const coast = smooth(0.15, 0.0, coastX(z) - x);
  return Math.max(0.35, Math.min(0.95, 0.88 - 0.36 * hill + 0.05 * coast - 0.1 * smooth(0.13, 0.0, riverDist(x, z))));
}
export function sunConfAt(x, z) {
  const hill = hillAt(x, z) / 0.14;
  const fog = smooth(0.13, 0.0, riverDist(x, z)) * (1 - Math.min(1, hill * 2));
  return Math.max(0.35, Math.min(0.97, 0.93 - 0.3 * fog - 0.12 * hill));
}

// Plots: 9 in the countryside (wind or solar), 7 in the town's three districts (homes, school,
// kindergarten). Names in green-text.js (greenPlot_<id>).
export const PLOTS = [
  { id: 'L1', area: 'land', x: -0.30, z: -0.19 },
  { id: 'L2', area: 'land', x: -0.035, z: -0.265 },
  { id: 'L3', area: 'land', x: -0.415, z: 0.02 },
  { id: 'L4', area: 'land', x: 0.19, z: -0.25 },
  { id: 'L5', area: 'land', x: 0.255, z: -0.155 },
  { id: 'L6', area: 'land', x: -0.40, z: 0.215 },
  { id: 'L7', area: 'land', x: -0.255, z: 0.27 },
  { id: 'L8', area: 'land', x: -0.235, z: 0.135 },
  { id: 'L9', area: 'land', x: -0.125, z: -0.025 },
  { id: 'T1', area: 'town', district: 'old', x: 0.0, z: 0.165 },
  { id: 'T2', area: 'town', district: 'old', x: 0.005, z: 0.28 },
  { id: 'T3', area: 'town', district: 'river', x: 0.005, z: 0.035 },
  { id: 'T4', area: 'town', district: 'river', x: 0.13, z: 0.035 },
  { id: 'T5', area: 'town', district: 'new', x: 0.23, z: 0.04 },
  { id: 'T6', area: 'town', district: 'new', x: 0.235, z: 0.165 },
  { id: 'T7', area: 'town', district: 'new', x: 0.235, z: 0.28 },
];
export const DISTRICT_KEYS = ['old', 'river', 'new'];
// District centers (for the demand map) and their demand at the start.
export const DISTRICTS = {
  old: { x: 0.03, z: 0.22, r: 0.09, kids: 70, small: 30, homes: 25 },
  river: { x: 0.07, z: 0.035, r: 0.085, kids: 150, small: 35, homes: 20 },
  new: { x: 0.235, z: 0.16, r: 0.09, kids: 45, small: 60, homes: 55 },
};

export const windEnergy = (v) => 8 * (v / 7) ** 3; // GWh per year, a ~3 MW turbine
export const solarEnergy = (s) => (5.2 * s) / 1750; // GWh per year, a ~5 MWp solar park

// Seasons: how the year's energy spreads over the months (wind in winter, sun in summer).
const norm = (a) => { const s = a.reduce((x, y) => x + y, 0); return a.map((v) => v / s); };
export const MONTH_WIND = norm([1.35, 1.25, 1.1, 0.9, 0.75, 0.65, 0.62, 0.7, 0.9, 1.1, 1.3, 1.38]);
export const MONTH_SUN = norm([0.3, 0.5, 0.85, 1.2, 1.45, 1.55, 1.55, 1.35, 1.0, 0.65, 0.35, 0.25]);

// The year's weather (unknown to the forecast): energy factors for wind and sun. Calm years with
// little wind are often sunny (high pressure), stormy years grey: the two balance out.
export const WEATHER = {
  normal: { wind: 1.0, sun: 1.0 },
  calm: { wind: 0.76, sun: 1.09 },
  stormy: { wind: 1.22, sun: 0.92, storm: true },
  sunny: { wind: 0.9, sun: 1.13 },
  windy: { wind: 1.12, sun: 0.96 },
  dull: { wind: 1.04, sun: 0.86 },
};
// Announced events (known before planning, so the AI's demand forecast includes them).
export const EVENTS = {
  families: { district: 'new', homes: 30, small: 25 },
  babyboom: { district: 'river', small: 30, kids: 40 },
  oldtown: { district: 'old', homes: 30, kids: 35, small: 15 },
};

/** Seeded random numbers (mulberry32) so tests can replay a game. */
export function rng(seed = (Math.random() * 2 ** 31) | 0) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.gauss = () => {
    let u = 0;
    let v = 0;
    while (u === 0) u = next();
    while (v === 0) v = next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return next;
}

const SIGMA_YEAR = { wind: 0.13, sun: 0.06 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class GreenGame {
  constructor(seed) {
    this.r = rng(seed);
    const r = this.r;
    // Weather of the five years: the first one ordinary, then a calm, a stormy and two more
    // in a random order (so every round shows why a mix helps).
    const later = ['calm', 'stormy', ['sunny', 'windy', 'dull'][Math.floor(r() * 3)], ['windy', 'sunny', 'normal'][Math.floor(r() * 3)]];
    for (let i = later.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [later[i], later[j]] = [later[j], later[i]]; }
    this.weather = [r() < 0.5 ? 'normal' : 'windy', ...later];
    this.events = [null, 'families', 'babyboom', 'oldtown', null];
    // Plots: true long-term climate and the AI's estimate of it (good, not perfect).
    this.plots = PLOTS.map((p) => {
      const q = { ...p, built: null, year: -1 };
      if (p.area === 'land') {
        q.wind = windAt(p.x, p.z);
        q.sun = sunAt(p.x, p.z);
        q.windConf = windConfAt(p.x, p.z);
        q.sunConf = sunConfAt(p.x, p.z);
        // The AI's error in the mean: larger where it is less sure.
        q.windBias = r.gauss() * (0.02 + 0.05 * (1 - q.windConf));
        q.sunBias = r.gauss() * (0.01 + 0.03 * (1 - q.sunConf));
      }
      return q;
    });
    this.districts = Object.fromEntries(DISTRICT_KEYS.map((k) => [k, { kids: DISTRICTS[k].kids, small: DISTRICTS[k].small, homes: DISTRICTS[k].homes }]));
    this.demandNoise = Object.fromEntries(DISTRICT_KEYS.map((k) => [k, { kids: r.gauss() * 0.08, small: r.gauss() * 0.1, homes: r.gauss() * 0.1 }]));
    this.year = 0; // 0-based
    this.budget = BASE_BUDGET;
    this.available = BASE_BUDGET; // all money that came in (for the budget-use score)
    this.spent = 0;
    this.spentBy = { energy: 0, social: 0 };
    this.qol = QOL_START;
    this.energyTotal = 0;
    this.co2Total = 0;
    this.history = []; // per year: report
    this.qolYears = 0;
    this.pending = []; // projects placed this year (can be undone until the year runs)
    this.announce = null;
  }

  get yearLabel() { return FIRST_YEAR + this.year; }
  get over() { return this.year >= YEARS; }

  plot(id) { return this.plots.find((p) => p.id === id); }

  /** Can this type go onto this plot now? */
  canBuild(type, id) {
    const p = this.plot(id);
    const T = TYPES[type];
    return !!p && !!T && !p.built && p.area === T.area && this.budget >= T.cost - 1e-9;
  }

  build(type, id) {
    if (!this.canBuild(type, id)) return false;
    const p = this.plot(id);
    const T = TYPES[type];
    p.built = type;
    p.year = this.year;
    this.budget -= T.cost;
    this.spent += T.cost;
    this.spentBy[T.kind] += T.cost;
    this.pending.push(id);
    return true;
  }

  /** Takes back a project placed this year (refund). */
  undo(id) {
    const p = this.plot(id);
    if (!p || !this.pending.includes(id)) return false;
    const T = TYPES[p.built];
    this.budget += T.cost;
    this.spent -= T.cost;
    this.spentBy[T.kind] -= T.cost;
    p.built = null;
    p.year = -1;
    this.pending = this.pending.filter((x) => x !== id);
    return true;
  }

  // ---------- the AI's forecast ----------

  /**
   * Forecast for a type on a plot: { value, lo, hi, conf, unit, input } where value is GWh per
   * year (energy) or quality-of-life points (social), lo..hi the 80 % range.
   */
  forecast(type, id) {
    const p = this.plot(id);
    const T = TYPES[type];
    if (!p || !T || p.area !== T.area) return null;
    if (T.kind === 'energy') {
      const wind = type === 'wind';
      const conf = wind ? p.windConf : p.sunConf;
      const est = wind ? p.wind * (1 + p.windBias) : p.sun * (1 + p.sunBias);
      const value = wind ? windEnergy(est) : solarEnergy(est);
      const sd = Math.hypot(SIGMA_YEAR[wind ? 'wind' : 'sun'], this.localSigma(type, p), 0.02 + (wind ? 0.05 : 0.03) * (1 - conf));
      return { value, lo: value * (1 - 1.28 * sd), hi: value * (1 + 1.28 * sd), conf, input: est, unit: 'gwh' };
    }
    const d = this.demandForecast(p.district);
    const need = d[T.need];
    const k = Math.min(1, need.value / T.cap);
    return {
      value: T.weight * k, lo: T.weight * Math.min(1, need.lo / T.cap), hi: T.weight * Math.min(1, need.hi / T.cap),
      conf: need.conf, input: need.value, unit: 'qol', need: T.need, cap: T.cap,
    };
  }

  localSigma(type, p) {
    const conf = type === 'wind' ? p.windConf : p.sunConf;
    return 0.03 + (type === 'wind' ? 0.12 : 0.05) * (1 - conf);
  }

  /** The AI's forecast of a district's demand (persons / families) with an 80 % range. */
  demandForecast(key) {
    const d = this.districts[key];
    const out = {};
    for (const need of ['kids', 'small', 'homes']) {
      const value = Math.max(0, d[need] * (1 + this.demandNoise[key][need] * 0.5));
      const sd = 0.09;
      out[need] = { value, lo: value * (1 - 1.28 * sd), hi: value * (1 + 1.28 * sd), conf: 0.82 };
    }
    return out;
  }

  /** The best forecast value over all free plots for a type (for the map's color scale). */
  bestFor(type) {
    let best = 0;
    for (const p of this.plots) {
      if (p.built || p.area !== TYPES[type].area) continue;
      best = Math.max(best, this.forecast(type, p.id)?.value ?? 0);
    }
    return best;
  }

  // ---------- running a year ----------

  /** Starts a year: announced events change the demand (before planning). */
  beginYear() {
    const ev = this.events[this.year];
    this.announce = ev;
    if (this.year > 0) {
      // Families in new homes bring children; the new quarter keeps growing a little.
      for (const k of DISTRICT_KEYS) {
        const homesLastYear = this.plots.filter((p) => p.district === k && p.built === 'homes' && p.year === this.year - 1).length;
        const d = this.districts[k];
        d.kids += homesLastYear * 22;
        d.small += homesLastYear * 16;
        d.small += k === 'new' ? 8 : 3;
        d.homes += k === 'new' ? 8 : 3;
      }
      if (ev) {
        const E = EVENTS[ev];
        const d = this.districts[E.district];
        for (const need of ['kids', 'small', 'homes']) d[need] += E[need] ?? 0;
      }
    }
  }

  /**
   * Simulates the year: real weather, yields, CO2, quality of life. Returns the report (also kept
   * in history): per project forecast and actual, totals, monthly energy, the weather.
   */
  runYear() {
    const r = this.r;
    const wx = WEATHER[this.weather[this.year]];
    const report = { year: this.year, label: this.yearLabel, weather: this.weather[this.year], event: this.events[this.year], projects: [], months: Array.from({ length: 12 }, () => ({ wind: 0, sun: 0 })) };
    let energy = 0;
    let forecastEnergy = 0;
    let windSum = 0;
    let windFc = 0;
    let sunSum = 0;
    let sunFc = 0;
    let co2 = 0;
    const qolBefore = this.qol;
    // Energy: every turbine and solar park built so far produces this year.
    for (const p of this.plots) {
      if (!p.built) continue;
      const T = TYPES[p.built];
      if (T.kind !== 'energy') {
        co2 += T.co2; // efficient new buildings replace old ones
        continue;
      }
      const fc = this.forecast(p.built, p.id);
      const wind = p.built === 'wind';
      const base = wind ? windEnergy(p.wind) : solarEnergy(p.sun);
      const eps = clamp(r.gauss() * this.localSigma(p.built, p), -0.3, 0.3);
      let actual = base * (wind ? wx.wind : wx.sun) * (1 + eps);
      if (wind && wx.storm) actual *= 0.97; // storm shutdowns
      energy += actual;
      forecastEnergy += fc.value;
      if (wind) { windSum += actual; windFc += fc.value; } else { sunSum += actual; sunFc += fc.value; }
      const months = wind ? MONTH_WIND : MONTH_SUN;
      months.forEach((m, i) => { report.months[i][wind ? 'wind' : 'sun'] += actual * m; });
      report.projects.push({ id: p.id, type: p.built, forecast: fc.value, lo: fc.lo, hi: fc.hi, actual, isNew: p.year === this.year });
    }
    co2 += energy * CO2_PER_GWH;
    // Social: new projects serve their district's real demand.
    const social = [];
    for (const id of this.pending) {
      const p = this.plot(id);
      const T = TYPES[p.built];
      if (T.kind !== 'social') continue;
      const d = this.districts[p.district];
      const real = Math.max(0, d[T.need] * (1 + this.demandNoise[p.district][T.need]));
      const served = Math.min(real, T.cap);
      const gain = T.weight * (served / T.cap);
      d[T.need] = Math.max(0, d[T.need] - served);
      this.qol = Math.min(100, this.qol + gain);
      social.push({ id, type: p.built, gain, served, district: p.district });
    }
    // Long waiting lists cost quality of life.
    const waiting = [];
    for (const k of DISTRICT_KEYS) {
      const d = this.districts[k];
      const pressure = d.kids / 150 + d.small / 45 + d.homes / 40;
      if (pressure > 2.6) { this.qol = Math.max(0, this.qol - 1.5); waiting.push(k); }
    }
    this.energyTotal += energy;
    this.co2Total += co2;
    this.qolYears += this.qol; // the quality of life counts in every year it is lived
    const revenue = energy * RETURN_PER_GWH;
    Object.assign(report, {
      energy, forecastEnergy, windSum, windFc, sunSum, sunFc, co2, revenue, social, waiting,
      households: Math.round((energy * 1000) / HOUSEHOLD_MWH), qolBefore, qol: this.qol, wx,
    });
    this.history.push(report);
    // Next year: the base budget plus the returns; unspent money stays.
    this.pending = [];
    this.year += 1;
    if (!this.over) {
      this.budget += BASE_BUDGET + revenue;
      this.available += BASE_BUDGET + revenue;
    }
    return report;
  }

  // ---------- score ----------

  /** Score parts (a perfect round stays below 5000) and facts for the results. */
  score() {
    const typesUsed = new Set(this.plots.filter((p) => p.built).map((p) => p.built));
    const total = this.spentBy.energy + this.spentBy.social;
    const share = total ? this.spentBy.social / total : 0;
    const balance = total ? clamp(1 - Math.abs(share - 0.4) / 0.4, 0, 1) : 0;
    const both = typesUsed.has('wind') && typesUsed.has('solar') ? 1 : 0;
    const parts = {
      energy: Math.round(1500 * Math.min(1, this.energyTotal / 230)),
      co2: Math.round(700 * Math.min(1, this.co2Total / 90000)),
      social: Math.round(1500 * clamp((this.qolYears / YEARS - QOL_START) / 45, 0, 1)),
      mix: Math.round(900 * (0.5 * balance + 0.3 * (typesUsed.size / TYPE_KEYS.length) + 0.2 * both)),
      budget: Math.round(400 * Math.min(1, this.available ? this.spent / this.available : 0)),
    };
    const sum = Math.min(5000, Object.values(parts).reduce((a, b) => a + b, 0));
    // How far off the forecast was, over all energy projects and years (mean absolute %).
    let err = 0;
    let n = 0;
    let portfolioErr = 0;
    let yearsWithEnergy = 0;
    for (const h of this.history) {
      for (const pr of h.projects) { err += Math.abs(pr.actual / pr.forecast - 1); n += 1; }
      if (h.forecastEnergy > 0) { portfolioErr += Math.abs(h.energy / h.forecastEnergy - 1); yearsWithEnergy += 1; }
    }
    return {
      total: sum, parts, typesUsed: typesUsed.size, share, balance, both: !!both,
      projectErr: n ? err / n : 0, portfolioErr: yearsWithEnergy ? portfolioErr / yearsWithEnergy : 0,
    };
  }
}
