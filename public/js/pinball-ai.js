// Campaign Pinball: the AI campaign planner, a multi-armed bandit with Thompson sampling.
// Every channel (poster, social media, e-mail, app, branch office, video) has a hidden response
// rate per target group (young people, families, founders, seniors). Each hit on a channel is an
// experiment: it reaches a few people, some of them respond (binomial). The planner keeps a Beta
// posterior per group and channel (with a little shared knowledge from the other groups), draws
// one sample per channel and recommends the channel with the highest draw. Uncertain channels
// therefore still get tried now and then (explore), well-known good ones most of the time
// (exploit). No three.js here: the module also runs in node for tests.
import { CHANNELS, GROUPS } from './pinball-layout.js';

// Plausible response rates per target group (shuffled a little every round, so the planner
// really has to learn them and no round is like the last).
const BASE = {
  young: { poster: 0.16, social: 0.52, email: 0.1, app: 0.42, branch: 0.12, video: 0.46 },
  families: { poster: 0.3, social: 0.26, email: 0.32, app: 0.38, branch: 0.3, video: 0.22 },
  founders: { poster: 0.12, social: 0.24, email: 0.38, app: 0.3, branch: 0.52, video: 0.2 },
  seniors: { poster: 0.38, social: 0.08, email: 0.22, app: 0.12, branch: 0.56, video: 0.16 },
};
const POOL = 0.2; // how much a group borrows from what the other groups showed
const POOL_MAX = 6; // ... at most this many pseudo observations

/** Seedable random numbers (mulberry32). */
export function rng(seed = (Math.random() * 2 ** 32) >>> 0) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gauss(r) {
  const u = Math.max(1e-12, r());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

/** Gamma(shape, 1) sample (Marsaglia and Tsang). */
function gamma(shape, r) {
  if (shape < 1) return gamma(shape + 1, r) * r() ** (1 / shape);
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x;
    let v;
    do { x = gauss(r); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = r();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export function betaSample(a, b, r) {
  const x = gamma(a, r);
  return x / (x + gamma(b, r));
}

/** The hidden truth of this round: response rate per group and channel. */
export function makeTruth(r) {
  const truth = {};
  for (const g of GROUPS) {
    truth[g] = {};
    for (const c of CHANNELS) truth[g][c] = Math.min(0.75, Math.max(0.04, BASE[g][c] + (r() - 0.5) * 0.12));
  }
  return truth;
}

/** Binomial draw: how many of n reached people respond at rate p. */
export function respond(n, p, r) {
  let k = 0;
  for (let i = 0; i < n; i++) if (r() < p) k += 1;
  return k;
}

export class Planner {
  constructor(r = rng()) {
    this.r = r;
    this.s = {};
    this.f = {};
    this.hits = {};
    for (const g of GROUPS) {
      this.s[g] = Object.fromEntries(CHANNELS.map((c) => [c, 0]));
      this.f[g] = Object.fromEntries(CHANNELS.map((c) => [c, 0]));
      this.hits[g] = Object.fromEntries(CHANNELS.map((c) => [c, 0]));
    }
    this.explores = 0;
    this.exploits = 0;
    this.version = 0; // bumps on every change (the panel redraws then)
  }

  /** Feedback: k of n reached people of group g responded to channel c. */
  observe(g, c, k, n) {
    this.s[g][c] += k;
    this.f[g][c] += n - k;
    this.hits[g][c] += 1;
    this.version += 1;
  }

  /** Beta posterior of group g and channel c: { a, b, mean, lo, hi, n (hits) }. */
  posterior(g, c) {
    let ps = 0;
    let pf = 0;
    for (const o of GROUPS) if (o !== g) { ps += this.s[o][c]; pf += this.f[o][c]; }
    const k = Math.min(1, POOL_MAX / Math.max(1e-9, POOL * (ps + pf))) * POOL;
    const a = 1 + ps * k + this.s[g][c];
    const b = 1 + pf * k + this.f[g][c];
    const mean = a / (a + b);
    const sd = Math.sqrt((a * b) / ((a + b) ** 2 * (a + b + 1)));
    return { a, b, mean, lo: Math.max(0, mean - 1.64 * sd), hi: Math.min(1, mean + 1.64 * sd), n: this.hits[g][c] };
  }

  /** The channel with the best estimate for group g (what pure exploitation would pick). */
  best(g) {
    let best = CHANNELS[0];
    let m = -1;
    for (const c of CHANNELS) {
      const p = this.posterior(g, c).mean;
      if (p > m) { m = p; best = c; }
    }
    return best;
  }

  /**
   * Thompson sampling: one draw per channel from its posterior, the highest draw wins.
   * avoid: a channel to skip (e.g. the one just recommended, so the tip moves on when it was
   * hit and the draw would pick it again by chance only).
   */
  recommend(g, avoid = null) {
    let pick = null;
    let top = -1;
    for (const c of CHANNELS) {
      if (c === avoid) continue;
      const p = this.posterior(g, c);
      const x = betaSample(p.a, p.b, this.r);
      if (x > top) { top = x; pick = c; }
    }
    const explore = pick !== this.best(g);
    if (explore) this.explores += 1; else this.exploits += 1;
    this.version += 1;
    return { channel: pick, explore };
  }
}
