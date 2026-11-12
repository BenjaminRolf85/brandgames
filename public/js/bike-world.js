// "Pannenfrei": the trail. A winding course through four terrains (asphalt road, gravel path,
// forest mud, snow and ice), built once per round: the centerline, hazards, items and props,
// the swallow's best line, the terrain meshes with painted textures (colors from the
// --xr-bike-* tokens), instanced props that are only filled in around the bike, the sky of the
// browser view, the diorama's base in the headset, the scanner's beam and grid, the swallow's
// light dots, snowfall and mist. Course units are meters at the bike's scale; the scene scales
// the whole course down into a diorama (--xr-bike-scale).
import * as THREE from 'three';
import { hex, color } from './tokens.js';
import { radialTexture } from './robot-visuals.js';
import { TERRAINS } from './bike-ai.js';
import { EVENT } from './event.js';

const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const smooth = (a, b, x) => { const k = clamp((x - a) / (b - a), 0, 1); return k * k * (3 - 2 * k); };

export const SEC_LEN = EVENT ? 118 : 172; // length of a section
export const S0 = 12; // where section 1 starts
export const STOP_GAP = 2.8; // the bike stops this far before a section for the scan
export const HALF = 1.85; // half width of the trail
export const EDGE = 3.0; // beyond this you cannot ride
const RUNOUT = 36;
const MAX_STARS = 9; // per section, the stars in the air included (36 at most: the score stays below 5000)

/** Hazards: model, effect class and lateral reach (half width). */
export const HZ = {
  glass: { node: 'HzGlass', cls: 'sharp', r: 0.5 },
  nails: { node: 'HzNails', cls: 'sharp', r: 0.45 },
  thorns: { node: 'HzThorns', cls: 'sharp', r: 0.62 },
  pothole: { node: 'HzPothole', cls: 'bump', r: 0.5 },
  roots: { node: 'HzRoots', cls: 'bump', r: 0.95 },
  ice: { node: 'HzIce', cls: 'slip', r: 0.72 },
  puddle: { node: 'HzPuddle', cls: 'mud', r: 0.66 },
  // Across the whole trail: only a jump clears them.
  log: { node: 'HzLog', cls: 'block', r: 9 },
  branch: { node: 'HzBranch', cls: 'block', r: 9 },
  trench: { node: 'HzTrench', cls: 'block', r: 9 },
};
/** Ramps: a wooden kicker or a snow drift (lip 0.8 ahead of the middle, 0.45 high). */
export const RAMPS = { ramp: 'HzRamp', drift: 'HzDriftRamp' };
export const RAMP_H = 0.45;
/** What the weather turns the ground into (fog leaves it as it is). */
export const WEATHER_TO = { rain: 'mud', frost: 'snow', sun: 'gravel', thaw: 'mud', fog: null };
const WEATHER_BY = { asphalt: ['frost'], gravel: ['rain'], mud: ['sun', 'frost'], snow: ['thaw'] };
const FEATURES = { asphalt: ['ramp', 'trench', 'ramp', 'branch'], gravel: ['ramp', 'log', 'ramp', 'trench'], mud: ['log', 'ramp', 'log', 'branch'], snow: ['drift', 'log', 'drift', 'trench'] };
const HZ_BY = { asphalt: ['glass', 'nails', 'pothole'], gravel: ['glass', 'thorns', 'pothole'], mud: ['thorns', 'roots', 'puddle'], snow: ['ice', 'glass', 'roots'] };
export const ITEMS = { star: 'ItStar', cart: 'ItCartridge', shield: 'ItShield' };

// Props per terrain: every (fixed spacing) or density (per meter, both sides), lateral band v.
const PROPS = {
  asphalt: [
    { n: 'PrPost', every: 8.5, v: [2.55, 2.7], both: true, align: true },
    { n: 'PrLamp', every: 26, v: [2.85, 3.0], side: 1, align: true, yaw: Math.PI / 2 },
    { n: 'PrSign', every: 57, v: [2.8, 3.0], side: -1, align: true, yaw: Math.PI },
    { n: 'PrBush', density: 0.22, v: [3.3, 7.5] },
    { n: 'PrTree', density: 0.2, v: [4.6, 15], scale: [0.8, 1.25] },
    { n: 'PrGrass', density: 0.55, v: [2.5, 6] },
    { n: 'PrGrass', density: 0.5, v: [2.12, 2.4], scale: [0.6, 0.9] },
    { n: 'PrSignpost', every: 64, v: [2.75, 2.9], side: 1, align: true },
  ],
  gravel: [
    { n: 'PrFence', every: 2.1, v: [3.25, 3.25], side: -1, align: true },
    { n: 'PrPebbles', density: 0.4, v: [1.95, 2.45] },
    { n: 'PrGrass', density: 0.8, v: [2.3, 6.5] },
    { n: 'PrRock', density: 0.12, v: [2.7, 7], scale: [0.6, 1.3] },
    { n: 'PrHay', density: 0.05, v: [4.6, 9] },
    { n: 'PrBush', density: 0.1, v: [3.6, 9] },
    { n: 'PrTree', density: 0.12, v: [5, 15], scale: [0.8, 1.25] },
    { n: 'PrRock', density: 0.08, v: [2.3, 2.8], scale: [0.35, 0.6] },
    { n: 'PrSignpost', every: 58, v: [2.7, 2.85], side: 1, align: true },
  ],
  mud: [
    { n: 'PrPine', density: 0.55, v: [3.4, 15], scale: [0.8, 1.3] },
    { n: 'PrTree', density: 0.18, v: [3.8, 12], scale: [0.8, 1.2] },
    { n: 'PrFern', density: 0.45, v: [2.3, 5.2] },
    { n: 'PrMushroom', density: 0.12, v: [2.3, 4] },
    { n: 'PrStump', density: 0.08, v: [2.6, 6] },
    { n: 'PrLeaves', density: 0.4, v: [1.4, 2.7] },
    { n: 'PrGrass', density: 0.35, v: [2.1, 2.5], scale: [0.6, 0.9] },
    { n: 'PrRock', density: 0.07, v: [2.3, 2.9], scale: [0.4, 0.7] },
    { n: 'PrSignpost', every: 70, v: [2.75, 2.9], side: -1, align: true },
  ],
  snow: [
    { n: 'PrPineSnow', density: 0.5, v: [3.4, 15], scale: [0.8, 1.3] },
    { n: 'PrDrift', density: 0.3, v: [2.3, 6.5] },
    { n: 'PrRockSnow', density: 0.1, v: [2.8, 7] },
    { n: 'PrLantern', every: 17, v: [2.55, 2.65], both: true, align: true },
    { n: 'PrPost', every: 9, v: [2.3, 2.4], both: true, align: true },
    { n: 'PrSnowman', every: 55, v: [3.5, 4.0], yaw: 0 },
    { n: 'PrRockSnow', density: 0.05, v: [2.9, 3.4], scale: [0.4, 0.7] },
    { n: 'PrSignpost', every: 66, v: [3.0, 3.1], side: 1, align: true },
  ],
};

/** A seeded random generator (mulberry32). */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- the course

/** Builds the course of one round: centerline, sections, hazards, items, props, best line. */
export function makeCourse(rnd) {
  const sections = TERRAINS.map((kind, i) => ({ kind, i, b0: S0 + i * SEC_LEN, b1: S0 + (i + 1) * SEC_LEN }));
  const finish = S0 + 4 * SEC_LEN;
  const length = finish + RUNOUT;
  const ph = [rnd() * TAU, rnd() * TAU, rnd() * TAU];
  // Winding: two waves, straight at the start line and before the finish arch.
  const amp = (s) => smooth(S0 - 2, S0 + 26, s) * (1 - smooth(finish - 34, finish - 10, s));
  const cx = (s) => amp(s) * (1.4 * Math.sin((s * TAU) / 58 + ph[0]) + 0.6 * Math.sin((s * TAU) / 37 + ph[1]));
  const dcx = (s) => (cx(s + 0.05) - cx(s - 0.05)) / 0.1;
  const ddcx = (s) => (cx(s + 0.3) - 2 * cx(s) + cx(s - 0.3)) / 0.09;
  /** Course-local point (x, z) at distance s, lateral offset v (along the trail normal). */
  const point = (s, v = 0, out = new THREE.Vector3()) => {
    const d = dcx(s);
    const n = 1 / Math.sqrt(1 + d * d);
    return out.set(cx(s) + v * n, 0, -s + v * d * n);
  };
  const yaw = (s) => -Math.atan(dcx(s)); // rotation.y of something facing along the trail
  const sectionAt = (s) => sections[clamp(Math.floor((s - S0) / SEC_LEN), 0, 3)];

  // Elevation: hills per terrain (gentle on asphalt, rolling gravel, steep and bumpy forest mud,
  // long descents in the snow), humps (crests that throw the bike up) and short steep drops.
  const PROF = { asphalt: [[0.9, 72], [0.3, 32]], gravel: [[1.0, 46], [0.38, 18], [0.14, 8]], mud: [[1.15, 40], [0.3, 14], [0.08, 4.5]], snow: [[0.8, 66], [0.25, 24]] };
  const TREND = { asphalt: 0.006, gravel: 0, mud: 0, snow: -0.04 };
  const wph = sections.map(() => [rnd() * TAU, rnd() * TAU, rnd() * TAU]);
  const humps = [];
  const drops = [];
  const env = (s) => smooth(S0 - 4, S0 + 18, s) * (1 - smooth(finish - 30, finish - 8, s));
  const h = (s) => {
    let waves = 0;
    let trend = 0;
    for (const sec of sections) {
      const w = (sec.i === 0 ? 1 : smooth(sec.b0 - 7, sec.b0 + 7, s)) * (sec.i === 3 ? 1 : 1 - smooth(sec.b1 - 7, sec.b1 + 7, s));
      if (w > 0) PROF[sec.kind].forEach(([A, L], k) => { waves += w * A * Math.sin((s * TAU) / L + wph[sec.i][k]); });
      trend += TREND[sec.kind] * clamp(s - sec.b0, 0, SEC_LEN);
    }
    let y = env(s) * waves + trend;
    for (const q of humps) if (Math.abs(s - q.c) < q.w / 2) y += q.a * 0.5 * (1 + Math.cos((TAU * (s - q.c)) / q.w));
    for (const d of drops) y -= d.d * smooth(d.s, d.s + d.l, s);
    return y;
  };
  const dh = (s) => (h(s + 0.05) - h(s - 0.05)) / 0.1;
  const ddh = (s) => (h(s + 0.25) - 2 * h(s) + h(s - 0.25)) / 0.0625;

  const hazards = [];
  const items = [];
  const props = [];
  const rr = (a, b) => a + rnd() * (b - a);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const addHz = (type, s, v) => hazards.push({ type, s, v, r: HZ[type].r, rot: rnd() * TAU, hit: false, passed: false });

  // Weather: one change of the ground in section 2, 3 or 4 (rain, frost, sun, thaw), in half of
  // the rounds also fog in another section (the ground stays). A pit stop comes before each.
  const weather = [];
  const addWeather = (i, kind) => {
    const sec = sections[i];
    const s = sec.b0 + rr(0.5, 0.56) * SEC_LEN;
    weather.push({ i: weather.length, sec: i, kind, from: sec.kind, to: WEATHER_TO[kind], s, pit: s - 8, trigger: s - 30, end: sec.b1 });
  };
  const wSec = 1 + Math.floor(rnd() * 3);
  addWeather(wSec, pick(WEATHER_BY[sections[wSec].kind]));
  if (rnd() < 0.5) addWeather(pick([0, 1, 2, 3].filter((i) => i !== wSec)), 'fog');
  weather.sort((a, b) => a.s - b.s);
  weather.forEach((w, i) => { w.i = i; });
  // Jumps: ramps (snow drifts in the snow), obstacles across the whole trail, stars in the air.
  const ramps = [];
  const reserved = weather.map((w) => [w.pit - 9, w.s + 4]); // no other hazards in here
  const isReserved = (s) => reserved.some(([a, b]) => s > a && s < b);
  for (const sec of sections) {
    FEATURES[sec.kind].forEach((f, k) => {
      let s = sec.b0 + (0.15 + k * 0.22 + rr(-0.03, 0.03)) * SEC_LEN;
      for (const w of weather) if (s > w.pit - 15 && s < w.s + 10) s = w.s + 11;
      if (s > sec.b1 - 14 || isReserved(s)) return;
      if (RAMPS[f]) {
        const v = pick([-0.8, 0, 0.8]);
        ramps.push({ kind: f, s, v, lip: s + 0.8, w: f === 'drift' ? 0.8 : 0.72, rot: yaw(s), sec: sec.i });
        reserved.push([s - 4, s + 6.5]);
        items.push({ type: 'star', s: s + 3.0, v, y: 1.0, air: true });
        items.push({ type: 'star', s: s + 4.2, v, y: 0.8, air: true });
      } else {
        hazards.push({ type: f, s, v: 0, r: HZ[f].r, rot: yaw(s), hit: false, passed: false, block: true });
        reserved.push([s - 5, s + 5]);
      }
    });
  }

  for (const sec of sections) {
    const types = HZ_BY[sec.kind];
    let s = sec.b0 + 13;
    const end = sec.b1 - 12;
    const gap = 8.6 - sec.i * 0.45;
    let stars = items.filter((it) => it.air && it.s >= sec.b0 && it.s < sec.b1).length;
    while (s < end) {
      if (isReserved(s) || isReserved(s + 7)) { s += 1.5; continue; }
      const p = rnd();
      const ty = pick(types);
      const wide = HZ[ty].r > 0.8;
      if (p < 0.3 || wide) {
        const v = wide ? pick([-1, 1]) * rr(0.6, 1.0) : rr(-1.2, 1.2);
        addHz(ty, s, v);
        if (rnd() < 0.5 && stars < MAX_STARS) { items.push({ type: 'star', s, v: clamp(-Math.sign(v) * rr(0.8, 1.3), -1.4, 1.4) }); stars += 1; }
      } else if (p < 0.55) {
        // Gate: both sides blocked, the middle free (with a star as a reward).
        addHz(ty, s, -1.25);
        addHz(pick(types.filter((t) => HZ[t].r < 0.8)), s + rr(-0.4, 0.4), 1.25);
        if (stars < MAX_STARS) { items.push({ type: 'star', s, v: 0 }); stars += 1; }
      } else if (p < 0.8) {
        // One side blocked by two hazards: ride the other side.
        const side = rnd() < 0.5 ? -1 : 1;
        addHz(ty, s, side * 0.3);
        addHz(pick(types.filter((t) => HZ[t].r < 0.8)), s + rr(0.6, 1.4), side * 1.3);
      } else {
        // Slalom: three hazards on alternating sides.
        const side = rnd() < 0.5 ? -1 : 1;
        for (let k = 0; k < 3; k++) {
          const t2 = pick(types.filter((t) => HZ[t].r < 0.8));
          addHz(t2, s + k * 3.4, side * (k % 2 ? -0.75 : 0.75));
        }
        if (stars < MAX_STARS - 1) {
          items.push({ type: 'star', s: s + 1.7, v: -side * 0.75 });
          items.push({ type: 'star', s: s + 5.1, v: side * 0.75 });
          stars += 2;
        }
        s += 6.8;
      }
      s += gap + rnd() * 2.6;
    }
    // A few lines of stars in quiet stretches, so every section has about 8.
    for (let tries = 0; stars < MAX_STARS && tries < 60; tries++) {
      const s1 = rr(sec.b0 + 10, sec.b1 - 12);
      if (hazards.some((h) => Math.abs(h.s - s1) < 3.2) || isReserved(s1) || isReserved(s1 + 3)) continue;
      const v = rr(-1.2, 1.2);
      const n = Math.min(3, MAX_STARS - stars);
      for (let k = 0; k < n; k++) items.push({ type: 'star', s: s1 + k * 1.3, v });
      stars += n;
    }
    // Protection band in sections 1 to 3, an air cartridge in sections 2 to 4.
    const freeSpot = (from, to) => {
      for (let k = 0; k < 40; k++) {
        const s1 = rr(from, to);
        const v = rr(-1.1, 1.1);
        if (!hazards.some((h) => Math.abs(h.s - s1) < 1.6 && Math.abs(h.v - v) < h.r + 0.5) && !items.some((it) => Math.abs(it.s - s1) < 1)) return [s1, v];
      }
      return [rr(from, to), 0];
    };
    if (sec.i < 3) { const [s1, v] = freeSpot(sec.b0 + 0.22 * SEC_LEN, sec.b0 + 0.4 * SEC_LEN); items.push({ type: 'shield', s: s1, v }); }
    if (sec.i > 0) { const [s1, v] = freeSpot(sec.b0 + 0.5 * SEC_LEN, sec.b0 + 0.75 * SEC_LEN); items.push({ type: 'cart', s: s1, v }); }
  }
  // Hazards that come with the weather (hidden until it turns), puddles that the sun dries.
  for (const w of weather) {
    const extra = { rain: 'puddle', frost: 'ice', thaw: 'puddle' }[w.kind];
    if (extra) {
      for (let s = w.s + 7; s < w.end - 10; s += rr(9, 14)) {
        if (hazards.some((h) => h.block && Math.abs(h.s - s) < 5) || ramps.some((r) => Math.abs(r.s - s) < 5)) continue;
        hazards.push({ type: extra, s, v: rr(-1.2, 1.2), r: HZ[extra].r, rot: rnd() * TAU, hit: false, passed: false, weather: w.i, hidden: true });
      }
    }
    if (w.kind === 'sun') hazards.filter((h) => h.type === 'puddle' && h.s > w.s && h.s < w.end).forEach((h) => { h.dryAt = w.i; });
  }
  hazards.sort((a, b) => a.s - b.s);
  items.sort((a, b) => a.s - b.s);
  items.forEach((it) => { it.taken = false; it.phase = rnd() * TAU; });
  // Humps and drops, away from ramps, obstacles across the trail, the pit stop and the stops.
  const SHAPES = { asphalt: ['hump'], gravel: ['hump', 'drop', 'hump'], mud: ['drop', 'hump', 'drop'], snow: ['drop', 'hump', 'drop'] };
  const DROP = { asphalt: 0.6, gravel: 0.75, mud: 0.9, snow: 1.0 };
  const busy = (s) => isReserved(s) || isReserved(s + 4) || hazards.some((x) => x.block && Math.abs(x.s - s) < 7) || ramps.some((r) => Math.abs(r.s - s) < 8)
    || [...humps.map((q) => q.c), ...drops.map((d) => d.s)].some((x) => Math.abs(x - s) < 12);
  for (const sec of sections) {
    for (const shape of SHAPES[sec.kind]) {
      for (let k = 0; k < 40; k++) {
        const s = rr(sec.b0 + 16, sec.b1 - 16);
        if (busy(s)) continue;
        if (shape === 'hump') humps.push({ c: s, w: 4.4, a: 0.7 });
        else drops.push({ s, l: 2.8, d: DROP[sec.kind] });
        break;
      }
    }
  }

  // Props along the sides (none on the arch posts at the start and the finish).
  const archS = [S0 - 0.8, finish];
  for (const sec of sections) {
    const from = sec.i === 0 ? -8 : sec.b0;
    const to = sec.i === 3 ? length : sec.b1;
    for (const spec of PROPS[sec.kind]) {
      const place = (s, side) => {
        if (archS.some((a) => Math.abs(a - s) < 3.2) && Math.abs(spec.v[0]) < 4.6) return;
        const v = side * rr(spec.v[0], spec.v[1]);
        const sc = spec.scale ? rr(spec.scale[0], spec.scale[1]) : rr(0.85, 1.15);
        const rot = spec.align ? yaw(s) + (spec.yaw ?? 0) * side : rnd() * TAU;
        props.push({ n: spec.n, s, v, rot, scale: sc });
      };
      if (spec.every) {
        let k = 0;
        for (let s = from + rnd() * spec.every; s < to; s += spec.every, k++) {
          if (spec.both) place(s, k % 2 ? -1 : 1);
          else place(s, spec.side ?? (rnd() < 0.5 ? -1 : 1));
        }
      } else {
        const n = Math.round((to - from) * spec.density);
        for (let k = 0; k < n; k++) place(rr(from, to), rnd() < 0.5 ? -1 : 1);
      }
    }
    // The pit stop before a weather change: a gantry over the right half and spare tires.
    for (const w of weather.filter((x) => x.sec === sec.i)) {
      props.push({ n: 'PitGantry', s: w.pit + 1.6, v: 0, rot: yaw(w.pit + 1.6), scale: 1 });
      props.push({ n: 'PitRack', s: w.pit + 0.6, v: 3.25, rot: rnd() * TAU, scale: 1 });
    }
    // Flags at the start of every section.
    if (sec.i > 0) for (const side of [-1, 1]) props.push({ n: 'PrFlag', s: sec.b0, v: side * 2.35, rot: yaw(sec.b0) + (side > 0 ? Math.PI : 0), scale: 1.2 });
  }
  props.sort((a, b) => a.s - b.s);

  // The swallow's best line: dynamic programming over lateral lanes (avoid hazards, take stars,
  // stay on the trail, steer smoothly).
  const STEP = 0.5;
  const N = Math.ceil(length / STEP) + 1;
  const lanes = [];
  for (let v = -1.5; v <= 1.501; v += 0.25) lanes.push(v);
  const L = lanes.length;
  const cost = new Float32Array(N * L);
  for (let i = 0; i < N; i++) {
    const s = i * STEP;
    for (let j = 0; j < L; j++) cost[i * L + j] = 0.02 * Math.abs(lanes[j]);
  }
  for (const h of hazards) {
    for (let i = Math.max(0, Math.floor((h.s - 1.6) / STEP)); i <= Math.min(N - 1, Math.ceil((h.s + 1.6) / STEP)); i++) {
      const ws = 1 - Math.abs(i * STEP - h.s) / 1.7;
      for (let j = 0; j < L; j++) {
        const d = Math.abs(lanes[j] - h.v) - (h.r + 0.32);
        if (d < 0.25) cost[i * L + j] += 6 * ws * (d < 0 ? 1 : 1 - d / 0.25);
      }
    }
  }
  for (const it of items) {
    const i = Math.round(it.s / STEP);
    if (i < 0 || i >= N) continue;
    for (let k = Math.max(0, i - 1); k <= Math.min(N - 1, i + 1); k++) {
      for (let j = 0; j < L; j++) if (Math.abs(lanes[j] - it.v) < 0.4) cost[k * L + j] -= it.type === 'star' ? 1.4 : 2;
    }
  }
  for (const r of ramps) {
    for (let i = Math.max(0, Math.floor((r.s - 3) / STEP)); i <= Math.min(N - 1, Math.ceil(r.lip / STEP)); i++) {
      for (let j = 0; j < L; j++) if (Math.abs(lanes[j] - r.v) < r.w * 0.6) cost[i * L + j] -= 1.2;
    }
  }
  // The guide's jump arcs: over ramps (a big jump) and over the obstacles across the trail.
  const arc = new Float32Array(N);
  const arcOver = (s0, len, h, base = 0) => {
    for (let i = Math.max(0, Math.floor(s0 / STEP)); i <= Math.min(N - 1, Math.ceil((s0 + len) / STEP)); i++) {
      const k = (i * STEP - s0) / len;
      if (k >= 0 && k <= 1) arc[i] = Math.max(arc[i], base * (1 - k) + h * Math.sin(Math.PI * k));
    }
  };
  for (const r of ramps) {
    for (let i = Math.max(0, Math.floor((r.s - 0.8) / STEP)); i <= Math.min(N - 1, Math.floor(r.lip / STEP)); i++) arc[i] = Math.max(arc[i], RAMP_H * clamp((i * STEP - (r.s - 0.8)) / 1.6, 0, 1));
    arcOver(r.lip, 4.6, 1.25, RAMP_H);
  }
  for (const h of hazards) if (h.block) arcOver(h.s - 1.9, 3.8, 0.8);
  const arcAt = (s) => arc[clamp(Math.round(s / STEP), 0, N - 1)];
  const acc = new Float32Array(N * L);
  const from = new Int16Array(N * L);
  for (let j = 0; j < L; j++) acc[j] = cost[j];
  for (let i = 1; i < N; i++) {
    for (let j = 0; j < L; j++) {
      let best = Infinity;
      let bk = j;
      for (let k = Math.max(0, j - 2); k <= Math.min(L - 1, j + 2); k++) {
        const c = acc[(i - 1) * L + k] + 0.15 * Math.abs(k - j);
        if (c < best) { best = c; bk = k; }
      }
      acc[i * L + j] = best + cost[i * L + j];
      from[i * L + j] = bk;
    }
  }
  const guide = new Float32Array(N);
  let j = 0;
  for (let k = 1; k < L; k++) if (acc[(N - 1) * L + k] < acc[(N - 1) * L + j]) j = k;
  for (let i = N - 1; i >= 0; i--) { guide[i] = lanes[j]; j = from[i * L + j]; }
  // Smooth it a little.
  const sm = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let a = 0;
    let w = 0;
    for (let k = -3; k <= 3; k++) { const q = guide[clamp(i + k, 0, N - 1)]; const ww = 4 - Math.abs(k); a += q * ww; w += ww; }
    sm[i] = a / w;
  }
  const guideAt = (s) => {
    const f = clamp(s / STEP, 0, N - 1);
    const i = Math.floor(f);
    const k = f - i;
    return sm[i] * (1 - k) + sm[Math.min(N - 1, i + 1)] * k;
  };

  /** The ramp under the bike (s within its length, u within its width), or null. */
  const rampAt = (s, u) => ramps.find((r) => Math.abs(s - r.s) <= 0.8 && Math.abs(u - r.v) < r.w) ?? null;
  /** Like point(), with the trail's height at s. */
  const pointH = (s, v = 0, out = new THREE.Vector3()) => { point(s, v, out); out.y = h(s); return out; };
  return { sections, finish, length, cx, dcx, ddcx, point, pointH, h, dh, ddh, humps, drops, yaw, sectionAt, hazards, items, props, ramps, weather, rampAt, guideAt, arcAt, starTotal: items.filter((it) => it.type === 'star').length };
}

// ---------------------------------------------------------------- textures

function canvasTexture(w, h, paint, repeatS = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  paint(ctx, w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = repeatS ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/** Draws f(x, y) at the position and its wrapped copies near the edges (seamless tiles). */
function wrapDraw(w, h, x, y, r, f, wrapX = true) {
  for (const dx of wrapX ? [-w, 0, w] : [0]) {
    for (const dy of [-h, 0, h]) {
      if (x + dx < -r || x + dx > w + r || y + dy < -r || y + dy > h + r) continue;
      f(x + dx, y + dy);
    }
  }
}

function blobs(ctx, w, h, rnd, n, rMin, rMax, colors, alpha = 1, wrapX = true, sy = 1) {
  ctx.globalAlpha = alpha;
  for (let i = 0; i < n; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = rMin + rnd() * (rMax - rMin);
    ctx.fillStyle = colors[Math.floor(rnd() * colors.length)];
    wrapDraw(w, h, x, y, r, (px, py) => { ctx.beginPath(); ctx.ellipse(px, py, r, r * sy, rnd() * 3, 0, TAU); ctx.fill(); }, wrapX);
  }
  ctx.globalAlpha = 1;
}

function strokes(ctx, w, h, rnd, n, len, width, colors, alpha = 1, upward = false) {
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const a = upward ? -Math.PI / 2 + (rnd() - 0.5) * 1.2 : rnd() * TAU;
    const l = len * (0.5 + rnd());
    ctx.strokeStyle = colors[Math.floor(rnd() * colors.length)];
    ctx.lineWidth = width * (0.6 + rnd() * 0.8);
    wrapDraw(w, h, x, y, l, (px, py) => { ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); ctx.stroke(); });
  }
  ctx.globalAlpha = 1;
}

/** Trail textures (u across the trail, v along it; one tile = 8 m). */
const TRAIL_PAINT = {
  asphalt(ctx, w, h, rnd) {
    ctx.fillStyle = color('xr-bike-asphalt');
    ctx.fillRect(0, 0, w, h);
    blobs(ctx, w, h, rnd, 26, 14, 40, [color('xr-bike-asphalt-dark')], 0.25, false);
    blobs(ctx, w, h, rnd, 4200, 0.5, 1.5, [color('xr-bike-asphalt-grain'), color('xr-bike-asphalt-dark'), color('xr-bike-curb')], 0.7, false);
    // cracks
    ctx.strokeStyle = color('xr-bike-asphalt-dark');
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 6; i++) {
      let x = 30 + rnd() * (w - 60);
      let y = rnd() * h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 16; y += 6 + rnd() * 10; ctx.lineTo(x, y); }
      ctx.stroke();
    }
    // curbs, edge lines, the dashed center line
    const cw = w * 0.035;
    for (const x0 of [0, w - cw]) {
      ctx.fillStyle = color('xr-bike-curb');
      ctx.fillRect(x0, 0, cw, h);
      ctx.fillStyle = color('xr-bike-asphalt-dark');
      for (let y = 0; y < h; y += 32) ctx.fillRect(x0, y, cw, 2);
    }
    ctx.fillStyle = color('xr-bike-asphalt-line');
    ctx.fillRect(w * 0.065, 0, w * 0.016, h);
    ctx.fillRect(w * (1 - 0.081), 0, w * 0.016, h);
    ctx.fillRect(w / 2 - w * 0.009, h * 0.1, w * 0.018, h * 0.36);
    ctx.fillRect(w / 2 - w * 0.009, h * 0.6, w * 0.018, h * 0.36);
  },
  gravel(ctx, w, h, rnd) {
    ctx.fillStyle = color('xr-bike-gravel');
    ctx.fillRect(0, 0, w, h);
    // two compact tracks: the good line
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = color('xr-bike-gravel-track');
    for (const u of [0.34, 0.66]) ctx.fillRect(w * u - w * 0.06, 0, w * 0.12, h);
    ctx.globalAlpha = 1;
    const stone = [color('xr-bike-gravel-stone'), color('xr-bike-gravel-light'), color('xr-bike-pebble')];
    for (let i = 0; i < 2600; i++) {
      const x = rnd() * w;
      const onTrack = Math.min(Math.abs(x / w - 0.34), Math.abs(x / w - 0.66)) < 0.05;
      if (onTrack && rnd() < 0.7) continue;
      const y = rnd() * h;
      const r = 1.2 + rnd() * 2.6;
      ctx.fillStyle = stone[Math.floor(rnd() * 3)];
      wrapDraw(w, h, x, y, r, (px, py) => {
        ctx.beginPath(); ctx.ellipse(px, py, r, r * 0.8, rnd() * 3, 0, TAU); ctx.fill();
        ctx.fillStyle = color('xr-bike-gravel-light');
        ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(px - r * 0.3, py - r * 0.3, r * 0.35, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
        ctx.fillStyle = stone[Math.floor(rnd() * 3)];
      }, false);
    }
    // grassy edges
    for (const [x0, x1] of [[0, w * 0.07], [w * 0.93, w]]) {
      ctx.fillStyle = color('xr-bike-grass-dry');
      ctx.globalAlpha = 0.7;
      ctx.fillRect(x0, 0, x1 - x0, h);
      ctx.globalAlpha = 1;
    }
    strokes(ctx, w, h, rnd, 380, 7, 1.6, [color('xr-bike-grass'), color('xr-bike-grass-dry')], 0.9, true);
    ctx.fillStyle = color('xr-bike-gravel');
  },
  mud(ctx, w, h, rnd) {
    ctx.fillStyle = color('xr-bike-mud');
    ctx.fillRect(0, 0, w, h);
    blobs(ctx, w, h, rnd, 70, 8, 30, [color('xr-bike-mud-dark')], 0.45, false, 1.6);
    blobs(ctx, w, h, rnd, 60, 6, 20, [color('xr-bike-mud-wet')], 0.5, false, 1.8);
    // ruts
    for (const u of [0.38, 0.62]) {
      ctx.strokeStyle = color('xr-bike-mud-dark');
      ctx.lineWidth = w * 0.035;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      for (let y = 0; y <= h; y += 8) ctx.lineTo(w * u + Math.sin((y / h) * TAU * 2) * 4, y);
      ctx.stroke();
      ctx.strokeStyle = color('xr-bike-mud-wet');
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let y = 0; y <= h; y += 8) ctx.lineTo(w * u + w * 0.022 + Math.sin((y / h) * TAU * 2) * 4, y);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    blobs(ctx, w, h, rnd, 120, 2, 4.5, [color('xr-bike-autumn'), color('xr-bike-autumn-2'), color('xr-bike-wood-dark')], 0.85, false, 0.5);
    blobs(ctx, w, h, rnd, 500, 0.6, 1.4, [color('xr-bike-mud-wet')], 0.9, false);
    // ragged forest floor and moss creeping in from both edges
    for (const [x0, x1] of [[0, w * 0.11], [w * 0.89, w]]) {
      const g = ctx.createLinearGradient(x0, 0, x1, 0);
      const floor = color('xr-bike-forest-floor');
      g.addColorStop(x0 === 0 ? 0 : 1, floor);
      g.addColorStop(x0 === 0 ? 0.55 : 0.45, floor);
      g.addColorStop(x0 === 0 ? 1 : 0, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = g;
      ctx.fillRect(x0, 0, x1 - x0, h);
      ctx.globalAlpha = 1;
    }
    for (let i = 0; i < 70; i++) {
      const left = i % 2 === 0;
      const x = left ? rnd() * w * 0.1 : w - rnd() * w * 0.1;
      const y = rnd() * h;
      const r = 3 + rnd() * 7;
      ctx.fillStyle = [color('xr-bike-forest-moss'), color('xr-bike-forest-floor')][i % 4 < 2 ? 0 : 1];
      ctx.globalAlpha = 0.8;
      wrapDraw(w, h, x, y, r, (px, py) => { ctx.beginPath(); ctx.ellipse(px, py, r, r * 1.5, 0, 0, TAU); ctx.fill(); }, false);
    }
    ctx.globalAlpha = 1;
  },
  snow(ctx, w, h, rnd) {
    ctx.fillStyle = color('xr-bike-snow-ground');
    ctx.fillRect(0, 0, w, h);
    blobs(ctx, w, h, rnd, 50, 10, 34, [color('xr-bike-snow-shade')], 0.3, false, 1.5);
    // darker, trodden edges and a compacted track with tire prints in the middle
    for (const [x0, x1] of [[0, w * 0.1], [w * 0.9, w]]) {
      const g = ctx.createLinearGradient(x0, 0, x1, 0);
      const dark = color('xr-bike-snow-shade');
      g.addColorStop(x0 === 0 ? 0 : 1, dark);
      g.addColorStop(x0 === 0 ? 1 : 0, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x0, 0, x1 - x0, h);
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = color('xr-bike-snow-track');
    ctx.fillRect(w * 0.18, 0, w * 0.64, h);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = color('xr-bike-snow-shade');
    ctx.fillRect(w * 0.18, 0, w * 0.015, h);
    ctx.fillRect(w * 0.805, 0, w * 0.015, h);
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = color('xr-bike-snow-shade');
    for (const u of [0.42, 0.58]) for (let y = 0; y < h; y += 9) ctx.fillRect(w * u - 5, y, 10, 4);
    ctx.globalAlpha = 1;
    blobs(ctx, w, h, rnd, 700, 0.6, 1.3, [color('xr-bike-swallow-shine'), color('xr-bike-snow-shade')], 0.9, false);
  },
};

/** Ground beside the trail (tile = 5 m both ways). */
const VERGE_PAINT = {
  asphalt(ctx, w, h, rnd) {
    ctx.fillStyle = color('xr-bike-grass');
    ctx.fillRect(0, 0, w, h);
    blobs(ctx, w, h, rnd, 90, 8, 26, [color('xr-bike-grass-dark'), color('xr-bike-grass-light')], 0.35);
    strokes(ctx, w, h, rnd, 900, 5, 1.4, [color('xr-bike-grass-dark'), color('xr-bike-grass-light')], 0.8, true);
    blobs(ctx, w, h, rnd, 60, 1.2, 2.2, [color('xr-bike-flower'), color('xr-bike-swallow-shine')], 1);
  },
  gravel(ctx, w, h, rnd) {
    ctx.fillStyle = color('xr-bike-grass-dry');
    ctx.fillRect(0, 0, w, h);
    blobs(ctx, w, h, rnd, 90, 8, 26, [color('xr-bike-grass'), color('xr-bike-hay')], 0.3);
    strokes(ctx, w, h, rnd, 1000, 6, 1.4, [color('xr-bike-grass'), color('xr-bike-hay'), color('xr-bike-grass-dark')], 0.75, true);
  },
  mud(ctx, w, h, rnd) {
    ctx.fillStyle = color('xr-bike-forest-floor');
    ctx.fillRect(0, 0, w, h);
    blobs(ctx, w, h, rnd, 80, 8, 28, [color('xr-bike-forest-moss'), color('xr-bike-mud-dark')], 0.4);
    strokes(ctx, w, h, rnd, 700, 4, 1, [color('xr-bike-needle'), color('xr-bike-wood-dark'), color('xr-bike-autumn-2')], 0.7);
    blobs(ctx, w, h, rnd, 90, 1.5, 3, [color('xr-bike-autumn'), color('xr-bike-autumn-2')], 0.8, true, 0.5);
  },
  snow(ctx, w, h, rnd) {
    ctx.fillStyle = color('xr-bike-snow');
    ctx.fillRect(0, 0, w, h);
    blobs(ctx, w, h, rnd, 60, 12, 40, [color('xr-bike-snow-shade')], 0.35, true, 0.6);
    blobs(ctx, w, h, rnd, 500, 0.6, 1.4, [color('xr-bike-swallow-shine'), color('xr-bike-snow-shade')], 0.9);
  },
};
const ROUGH = { asphalt: [0.88, 0.95], gravel: [0.95, 0.95], mud: [0.55, 0.92], snow: [0.62, 0.72] };

/** A grey value for the roughness mask (0 shiny .. 1 rough). */
const grey = (k) => { const v = Math.round(clamp(k, 0, 1) * 255); return `rgb(${v},${v},${v})`; };

/**
 * More detail on top of the trail painting, plus the shiny parts in a roughness mask (gl):
 * asphalt patches, drains, debris; gravel ruts and loose stones; forest mud roots, puddles and
 * splashes; ice patches on the snow.
 */
const TRAIL_DETAIL = {
  asphalt(ctx, gl, w, h, rnd) {
    for (let i = 0; i < 3; i++) {
      const x = w * (0.15 + rnd() * 0.5);
      const y = rnd() * h;
      const pw = w * (0.12 + rnd() * 0.2);
      const ph = h * (0.06 + rnd() * 0.08);
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = color('xr-bike-asphalt-dark');
      ctx.fillRect(x, y, pw, ph);
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = color('xr-bike-asphalt-grain');
      ctx.lineWidth = 1.2;
      ctx.strokeRect(x, y, pw, ph);
      gl.fillStyle = grey(0.7);
      gl.fillRect(x, y, pw, ph);
    }
    ctx.globalAlpha = 1;
    // drains at the curb
    for (const x0 of [w * 0.038, w * (1 - 0.038 - 0.05)]) {
      for (const y0 of [h * 0.22, h * 0.72]) {
        ctx.fillStyle = color('xr-bike-manhole');
        ctx.fillRect(x0, y0, w * 0.05, h * 0.05);
        ctx.fillStyle = color('xr-bike-hole');
        for (let k = 0; k < 5; k++) ctx.fillRect(x0 + w * 0.006, y0 + h * 0.006 + k * h * 0.0085, w * 0.038, h * 0.004);
        gl.fillStyle = grey(0.35);
        gl.fillRect(x0, y0, w * 0.05, h * 0.05);
      }
    }
    blobs(ctx, w, h, rnd, 40, 1.2, 2.4, [color('xr-bike-pebble'), color('xr-bike-gravel-stone')], 0.9, false);
    blobs(ctx, w, h, rnd, 12, 2, 3.5, [color('xr-bike-autumn'), color('xr-bike-autumn-2')], 0.85, false, 0.5);
  },
  gravel(ctx, gl, w, h, rnd) {
    for (const u of [0.34, 0.66]) {
      ctx.strokeStyle = color('xr-bike-gravel-stone');
      ctx.lineWidth = w * 0.03;
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      for (let y = 0; y <= h; y += 8) ctx.lineTo(w * u + Math.sin((y / h) * TAU * 3) * 3, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 140; i++) {
      const x = w * (0.08 + rnd() * 0.84);
      const y = rnd() * h;
      const r = 2.5 + rnd() * 2.5;
      ctx.fillStyle = color('xr-bike-earth-dark');
      ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.ellipse(x + 1.2, y + 1.6, r, r * 0.8, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = [color('xr-bike-gravel-stone'), color('xr-bike-pebble'), color('xr-bike-stone')][i % 3];
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.8, rnd() * 3, 0, TAU); ctx.fill();
    }
    strokes(ctx, w, h, rnd, 240, 9, 2, [color('xr-bike-grass'), color('xr-bike-grass-tuft')], 0.95, true);
    ctx.fillStyle = color('xr-bike-gravel');
  },
  mud(ctx, gl, w, h, rnd) {
    // roots crossing the trail
    for (let i = 0; i < 4; i++) {
      const y0 = rnd() * h;
      ctx.strokeStyle = color('xr-bike-root');
      ctx.lineWidth = 4 + rnd() * 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let x = 0; x <= w; x += 16) ctx.lineTo(x, y0 + Math.sin(x * 0.05 + i) * 8 + (x / w) * 20);
      ctx.stroke();
      ctx.strokeStyle = color('xr-bike-wood');
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
    // glossy puddles
    for (let i = 0; i < 8; i++) {
      const x = w * (0.2 + rnd() * 0.6);
      const y = rnd() * h;
      const r = 8 + rnd() * 14;
      ctx.fillStyle = color('xr-bike-mud-water');
      ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 1.6, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = color('xr-bike-mud-wet');
      ctx.lineWidth = 2;
      ctx.stroke();
      gl.fillStyle = grey(0.08);
      gl.beginPath(); gl.ellipse(x, y, r, r * 1.6, 0, 0, TAU); gl.fill();
    }
    ctx.globalAlpha = 1;
    // splashes
    for (let i = 0; i < 20; i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      ctx.fillStyle = color('xr-bike-mud-dark');
      ctx.globalAlpha = 0.6;
      ctx.beginPath(); ctx.arc(x, y, 2.5 + rnd() * 3, 0, TAU); ctx.fill();
      for (let k = 0; k < 5; k++) { ctx.beginPath(); ctx.arc(x + (rnd() - 0.5) * 16, y + (rnd() - 0.5) * 16, 0.8 + rnd() * 1.4, 0, TAU); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    blobs(ctx, w, h, rnd, 70, 2.5, 5, [color('xr-bike-autumn'), color('xr-bike-autumn-2')], 0.85, false, 0.45);
  },
  snow(ctx, gl, w, h, rnd) {
    for (let i = 0; i < 6; i++) {
      const x = w * (0.22 + rnd() * 0.56);
      const y = rnd() * h;
      const r = 12 + rnd() * 16;
      ctx.fillStyle = color('xr-bike-ice');
      ctx.globalAlpha = 0.75;
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 1.8, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = color('xr-bike-ice-crack');
      ctx.globalAlpha = 0.9;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x - r * 0.5, y - r); ctx.lineTo(x + r * 0.3, y + r * 0.6); ctx.stroke();
      gl.fillStyle = grey(0.05);
      gl.beginPath(); gl.ellipse(x, y, r, r * 1.8, 0, 0, TAU); gl.fill();
    }
    ctx.globalAlpha = 1;
  },
};
const NORMAL_K = { asphalt: 1.4, gravel: 3.2, mud: 2.2, snow: 1.3 };
const VERGE_NORMAL_K = { asphalt: 2.2, gravel: 2.2, mud: 1.8, snow: 0.9 };

/** A normal map from the luminance of a painting (Sobel), tiling along v. */
function normalMap(src, strength, aniso = 8) {
  const W = src.width;
  const H = src.height;
  const d = src.getContext('2d').getImageData(0, 0, W, H).data;
  const lum = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) lum[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const out = ctx.createImageData(W, H);
  const at = (x, y) => lum[((y + H) % H) * W + clamp(x, 0, W - 1)];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1)) * strength;
      const dy = (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1)) * strength;
      const l = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const k = (y * W + x) * 4;
      out.data[k] = (-dx * l * 0.5 + 0.5) * 255;
      out.data[k + 1] = (dy * l * 0.5 + 0.5) * 255;
      out.data[k + 2] = (l * 0.5 + 0.5) * 255;
      out.data[k + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = aniso;
  return tex;
}

/**
 * The trail's painting with its detail, a roughness mask and a normal map. res: 1 (256 x 512)
 * or 2 (twice as sharp, for the 'high' graphics tier); the painting itself stays the same.
 */
function trailTextures(kind, rnd, rough, res = 1, aniso = 8) {
  const W = 256;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W * res;
  c.height = H * res;
  const ctx = c.getContext('2d');
  ctx.scale(res, res);
  const g = document.createElement('canvas');
  g.width = W * res;
  g.height = H * res;
  const gl = g.getContext('2d');
  gl.scale(res, res);
  gl.fillStyle = grey(rough);
  gl.fillRect(0, 0, W, H);
  TRAIL_PAINT[kind](ctx, W, H, rnd);
  TRAIL_DETAIL[kind](ctx, gl, W, H, rnd);
  // The edges (grass, forest floor, trodden snow) are matte: no sky sheen along the shoulders.
  for (const [x0, x1] of [[0, W * 0.11], [W * 0.89, W]]) {
    const g2 = gl.createLinearGradient(x0, 0, x1, 0);
    g2.addColorStop(x0 === 0 ? 0 : 1, grey(0.95));
    g2.addColorStop(x0 === 0 ? 0.6 : 0.4, grey(0.95));
    g2.addColorStop(x0 === 0 ? 1 : 0, grey(rough));
    gl.fillStyle = g2;
    gl.fillRect(x0, 0, x1 - x0, H);
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = aniso;
  const roughnessMap = new THREE.CanvasTexture(g);
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.anisotropy = aniso;
  return { map, roughnessMap, normalMap: normalMap(c, NORMAL_K[kind] * res, aniso) };
}

// ---------------------------------------------------------------- terrain meshes

const CHUNK = 16; // terrain chunk length
const TRAIL_COLS = [-2.05, -1.75, -1.3, -0.85, -0.42, 0, 0.42, 0.85, 1.3, 1.75, 2.05];
const VERGE_COLS = [-18, -13, -9.5, -7, -5.5, -4.5, -3.7, -3.1, -2.8, -2.55, -2.3, -2.1, -1.2, 0, 1.2, 2.1, 2.3, 2.55, 2.8, 3.1, 3.7, 4.5, 5.5, 7, 9.5, 13, 18];

/** Height of the ground beside the trail (relative to the trail's height). */
export function vergeHeight(v, s, kind) {
  const a = Math.abs(v);
  const bump = smooth(2.25, 3.6, a) * Math.max(0, 0.12 + 0.12 * Math.sin(s * 0.37 + v * 1.3) + 0.08 * Math.sin(s * 0.11 - v * 0.7 + 1));
  const far = smooth(7, 17, a) * (1.8 + 0.9 * Math.sin(s * 0.05 + Math.sign(v) * 2));
  // Snow: banks pushed up along both edges of the trail.
  const bank = kind === 'snow' ? Math.max(0, 1 - Math.abs(a - 2.55) / 0.55) ** 1.5 * (0.32 + 0.08 * Math.sin(s * 0.7 + v)) : 0;
  return bump * (kind === 'snow' ? 1.4 : 1) + far + bank;
}

function ribbon(course, s0, s1, cols, yFn, uvFn, step = 0.5) {
  const rows = Math.max(2, Math.ceil((s1 - s0) / step) + 1);
  const C = cols.length;
  const pos = new Float32Array(rows * C * 3);
  const uv = new Float32Array(rows * C * 2);
  const p = new THREE.Vector3();
  for (let i = 0; i < rows; i++) {
    const s = Math.min(s1, s0 + i * step);
    for (let j = 0; j < C; j++) {
      course.point(s, cols[j], p);
      const k = i * C + j;
      pos[k * 3] = p.x;
      pos[k * 3 + 1] = yFn(cols[j], s);
      pos[k * 3 + 2] = p.z;
      const [u, w] = uvFn(cols[j], s);
      uv[k * 2] = u;
      uv[k * 2 + 1] = w;
    }
  }
  const idx = [];
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < C - 1; j++) {
      const a = i * C + j;
      const b = a + 1;
      const c = a + C;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** Terrain meshes of all four sections (trail strip and the ground around it). */
/** opts: res (texture sharpness 1 or 2), aniso (anisotropic filtering). */
export function makeTerrain(course, clip, { res = 1, aniso = 8 } = {}) {
  const group = new THREE.Group();
  group.userData.noFit = true;
  const rnd = seeded(77);
  const disposables = [];
  const chunks = [];
  for (const sec of course.sections) {
    const s0 = sec.i === 0 ? -10 : sec.b0;
    const s1 = sec.i === 3 ? course.length + 8 : sec.b1;
    const [rt, rv] = ROUGH[sec.kind];
    const tt = trailTextures(sec.kind, rnd, rt, res, aniso);
    const vergeTex = canvasTexture(256 * res, 256 * res, (ctx) => { ctx.scale(res, res); VERGE_PAINT[sec.kind](ctx, 256, 256, rnd); });
    vergeTex.anisotropy = aniso;
    // Grass blades, needles and snow crust catch the light: a normal map from the painting.
    const vergeNormal = normalMap(vergeTex.image, VERGE_NORMAL_K[sec.kind] * res, aniso);
    const trailMat = new THREE.MeshStandardMaterial({ map: tt.map, roughnessMap: tt.roughnessMap, normalMap: tt.normalMap, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 1, metalness: 0, clippingPlanes: clip });
    const vergeMat = new THREE.MeshStandardMaterial({ map: vergeTex, normalMap: vergeNormal, normalScale: new THREE.Vector2(0.8, 0.8), roughness: rv, metalness: 0, clippingPlanes: clip });
    // In chunks, so only the pieces near the bike are drawn.
    for (let a = s0; a < s1 - 0.01; a += CHUNK) {
      const b = Math.min(s1, a + CHUNK);
      const trail = new THREE.Mesh(ribbon(course, a, b, TRAIL_COLS, (v, s) => course.h(s) + 0.02 - 0.012 * (v / 2) ** 2, (v, s) => [(v + 2.05) / 4.1, s / 8]), trailMat);
      const verge = new THREE.Mesh(ribbon(course, a, b, VERGE_COLS, (v, s) => course.h(s) + vergeHeight(v, s, sec.kind), (v, s) => [v / 5, s / 5], 0.5), vergeMat);
      for (const m of [trail, verge]) {
        m.receiveShadow = true;
        m.userData.noFit = true;
        group.add(m);
      }
      chunks.push({ a, b, meshes: [trail, verge] });
    }
    disposables.push(tt.map, tt.roughnessMap, tt.normalMap, vergeTex, vergeNormal);
  }
  group.userData.dispose = () => disposables.forEach((t) => t.dispose());
  /** Shows only the chunks that reach into [s0, s1]. */
  group.userData.cull = (s0, s1) => { for (const c of chunks) { const on = c.b >= s0 && c.a <= s1; for (const m of c.meshes) m.visible = on; } };
  return group;
}

// ---------------------------------------------------------------- instanced props

/**
 * Instanced copies of a model for a sorted list of entries { s, v, rot, scale, y }; only the
 * ones in the window around the bike are filled in. update(s0, s1, animate?).
 */
export class Scatter {
  /** ground: 'trail' (on the trail, tilted with its slope if tilt), 'verge' (beside it), 'air'. */
  constructor(parent, parts, entries, course, { shadow = true, lift = 0, ground = 'trail', tilt = false } = {}) {
    this.entries = entries;
    const up = new THREE.Vector3(0, 1, 0);
    this.matrices = entries.map((e) => {
      const p = course.point(e.s, e.v);
      const kind = course.sectionAt(e.s).kind;
      const base = course.h(e.s) + (ground === 'verge' ? Math.max(0, vergeHeight(e.v, e.s, kind) - 0.04) : 0);
      const m = new THREE.Matrix4();
      const q = new THREE.Quaternion().setFromAxisAngle(up, e.rot ?? 0);
      if (tilt) {
        // Lie on the slope: pitch about the trail's sideways axis, then the object's own turn.
        const trail = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.atan(course.dh(e.s)), course.yaw(e.s), 0, 'YXZ'));
        q.copy(trail.multiply(new THREE.Quaternion().setFromAxisAngle(up, (e.rot ?? 0) - course.yaw(e.s))));
      }
      e.pos = new THREE.Vector3(p.x, base + (e.y ?? 0) + lift, p.z);
      m.compose(e.pos, q, new THREE.Vector3().setScalar(e.scale ?? 1));
      return m;
    });
    this.meshes = parts.map((pt) => {
      const m = new THREE.InstancedMesh(pt.geometry, pt.material, Math.max(1, entries.length));
      m.count = 0;
      m.frustumCulled = false;
      m.castShadow = shadow;
      m.receiveShadow = true;
      m.userData.noFit = true;
      parent.add(m);
      return m;
    });
    this.lo = -1;
    this.hi = -1;
  }

  /** Fills in the entries with s0 <= s <= s1; animate(entry, matrix) may change a matrix. */
  update(s0, s1, animate = null) {
    const E = this.entries;
    let a = 0;
    let b = E.length;
    while (a < b) { const m = (a + b) >> 1; if (E[m].s < s0) a = m + 1; else b = m; }
    let hi = a;
    while (hi < E.length && E[hi].s <= s1) hi++;
    if (!animate && a === this.lo && hi === this.hi && !this.dirty) return;
    this.lo = a;
    this.hi = hi;
    this.dirty = false;
    let n = 0;
    const tmp = this.tmp ??= new THREE.Matrix4();
    for (let i = a; i < hi; i++) {
      const e = E[i];
      if (e.hidden) continue;
      const m = animate ? animate(e, tmp.copy(this.matrices[i])) : this.matrices[i];
      for (const mesh of this.meshes) mesh.setMatrixAt(n, m);
      n++;
    }
    for (const mesh of this.meshes) {
      mesh.count = n;
      mesh.visible = n > 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    for (const m of this.meshes) { m.removeFromParent(); m.dispose(); }
  }
}

// ---------------------------------------------------------------- sky, base, effects

/** A gradient sky around the browser camera; setColors(top, low) (THREE.Color). */
export function makeSky() {
  const geo = new THREE.SphereGeometry(30, 32, 16);
  const col = new Float32Array(geo.attributes.position.count * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  mesh.renderOrder = -10;
  mesh.userData.noFit = true;
  mesh.frustumCulled = false;
  const c = new THREE.Color();
  mesh.userData.setColors = (top, low) => {
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const k = clamp(pos.getY(i) / 30, -1, 1);
      c.copy(low).lerp(top, smooth(0, 0.7, k));
      if (k < 0) c.copy(low).multiplyScalar(1 + k * 0.25);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.attributes.color.needsUpdate = true;
  };
  return mesh;
}

/**
 * Image-based light for the outdoor trail: a sky dome (cool blue above, a bright warm horizon,
 * green-brown ground below) with a warm sun patch, so PBR materials get warm and cool contrast.
 * Returns a PMREM render target (dispose it with the scene).
 */
export function makeOutdoorEnv(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  const dome = new THREE.SphereGeometry(10, 32, 16);
  const top = new THREE.Color(hex('xr-bike-env-sky'));
  const horizon = new THREE.Color(hex('xr-bike-env-horizon'));
  const ground = new THREE.Color(hex('xr-bike-env-ground'));
  const pos = dome.attributes.position;
  const colors = [];
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const k = pos.getY(i) / 10;
    if (k >= 0) c.copy(horizon).lerp(top, smooth(0, 0.6, k));
    else c.copy(horizon).lerp(ground, smooth(0, 0.25, -k));
    colors.push(c.r, c.g, c.b);
  }
  dome.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  env.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const sun = new THREE.Mesh(new THREE.CircleGeometry(1.6, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(hex('xr-bike-env-sun')).multiplyScalar(4) }));
  sun.position.set(-3.5, 6.5, 4);
  sun.lookAt(0, 0, 0);
  env.add(sun);
  const target = pmrem.fromScene(env, 0.035);
  pmrem.dispose();
  env.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  return target;
}

/** The diorama's base in the headset: an earth block cut like a model, with a dark rim. */
export function makeBase(w, z0, z1, depth) {
  const g = new THREE.Group();
  g.userData.noFit = true;
  const rnd = seeded(5);
  const earth = canvasTexture(512, 128, (ctx, W, H) => {
    const bands = [color('xr-bike-earth'), color('xr-bike-earth-dark'), color('xr-bike-earth'), color('xr-bike-earth-stone')];
    let y = 0;
    let i = 0;
    while (y < H) {
      const bh = 14 + rnd() * 26;
      ctx.fillStyle = bands[i++ % bands.length];
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= W; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.03 + i) * 3);
      ctx.lineTo(W, H);
      ctx.lineTo(0, H);
      ctx.fill();
      y += bh;
    }
    blobs(ctx, W, H, rnd, 140, 1.5, 5, [color('xr-bike-earth-stone'), color('xr-bike-earth-dark')], 0.8);
    ctx.fillStyle = color('xr-bike-grass');
    ctx.fillRect(0, 0, W, 6);
  });
  const len = z0 - z1;
  // The cut faces glow a little from within, so the earth layers read from any side and light.
  const side = new THREE.MeshStandardMaterial({ map: earth, roughness: 0.95, emissive: hex('xr-bike-earth-glow'), emissiveMap: earth, emissiveIntensity: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: hex('xr-bike-earth-dark'), roughness: 1 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(w, depth, len), [side, side, dark, dark, side, side]);
  box.position.set(0, -depth / 2 - 0.0015, (z0 + z1) / 2);
  box.userData.noFit = true;
  g.add(box);
  const rimMat = new THREE.MeshStandardMaterial({ color: hex('xr-bike-diorama-rim'), roughness: 0.4, metalness: 0.5 });
  const t = 0.012;
  for (const [x, z, sx, sz] of [[0, z0, w + t * 2, t], [0, z1, w + t * 2, t], [-w / 2 - t / 2, (z0 + z1) / 2, t, len], [w / 2 + t / 2, (z0 + z1) / 2, t, len]]) {
    const r = new THREE.Mesh(new THREE.BoxGeometry(sx, depth + 0.02, sz), rimMat);
    r.position.set(x, -depth / 2 + 0.006, z);
    r.userData.noFit = true;
    g.add(r);
  }
  g.userData.scroll = (s, unitsPerTex) => { earth.offset.x = (s / unitsPerTex) % 1; };
  g.userData.earth = earth;
  g.userData.dispose = () => { earth.dispose(); side.dispose(); dark.dispose(); rimMat.dispose(); };
  return g;
}

/**
 * The scanner's beam from the drone's lens down to a scan line across the trail, the scan line
 * and a grid that reveals the scanned ground. set({ apex, sLine, alpha, warn }), grid(b0, b1).
 */
export function makeScanFx(course) {
  const g = new THREE.Group();
  g.userData.noFit = true;
  const N = 12;
  const beamGeo = new THREE.BufferGeometry();
  const bpos = new Float32Array((N + 1) * 3);
  const bcol = new Float32Array((N + 1) * 4);
  beamGeo.setAttribute('position', new THREE.BufferAttribute(bpos, 3));
  beamGeo.setAttribute('color', new THREE.BufferAttribute(bcol, 4));
  const bidx = [];
  for (let i = 1; i < N + 1 - 1; i++) bidx.push(0, i, i + 1);
  beamGeo.setIndex(bidx);
  const beamMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.frustumCulled = false;
  beam.userData.noFit = true;
  g.add(beam);
  // the bright line on the ground
  const lineGeo = new THREE.BufferGeometry();
  const lpos = new Float32Array(N * 2 * 3);
  lineGeo.setAttribute('position', new THREE.BufferAttribute(lpos, 3));
  const lidx = [];
  for (let i = 0; i < N - 1; i++) { const a = i * 2; lidx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  lineGeo.setIndex(lidx);
  const lineMat = new THREE.MeshBasicMaterial({ color: hex('xr-bike-scan'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const line = new THREE.Mesh(lineGeo, lineMat);
  line.frustumCulled = false;
  line.userData.noFit = true;
  g.add(line);
  // the grid
  const gridMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(hex('xr-bike-scan')) }, uReveal: { value: -1e9 }, uAlpha: { value: 0 } },
    vertexShader: 'attribute float aS; varying vec2 vUv; varying float vS; void main(){ vUv = uv; vS = aS; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uColor; uniform float uReveal; uniform float uAlpha; varying vec2 vUv; varying float vS;
      void main(){
        float gx = abs(fract(vUv.x * 9.0) - 0.5); float gy = abs(fract(vS * 1.4) - 0.5);
        float lines = smoothstep(0.4, 0.5, max(gx, gy));
        float shown = step(vS, uReveal);
        float edge = smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
        float front = smoothstep(uReveal - 0.9, uReveal, vS) * shown;
        float a = (lines * 0.5 + front * 0.45) * shown * edge * uAlpha;
        gl_FragColor = vec4(uColor * a, a);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  let grid = null;
  const p = new THREE.Vector3();
  const cBright = new THREE.Color();
  return {
    group: g,
    grid(b0, b1) {
      if (grid) { grid.removeFromParent(); grid.geometry.dispose(); }
      const cols = [-2.5, -1.875, -1.25, -0.625, 0, 0.625, 1.25, 1.875, 2.5];
      const geo = ribbon(course, b0, b1, cols, (v, s) => course.h(s) + 0.05, (v, s) => [(v + 2.5) / 5, s - b0], 0.5);
      const n = geo.attributes.position.count;
      const aS = new Float32Array(n);
      for (let i = 0; i < n; i++) aS[i] = b0 + Math.floor(i / cols.length) * 0.5;
      geo.setAttribute('aS', new THREE.BufferAttribute(aS, 1));
      grid = new THREE.Mesh(geo, gridMat);
      grid.frustumCulled = false;
      grid.userData.noFit = true;
      g.add(grid);
    },
    set({ apex, sLine, alpha, reveal, gridAlpha, warn = false }) {
      const tok = warn ? 'xr-bike-scan-warn' : 'xr-bike-scan';
      cBright.setHex(hex(tok));
      lineMat.color.copy(cBright);
      gridMat.uniforms.uColor.value.copy(cBright);
      beam.visible = alpha > 0.01;
      line.visible = alpha > 0.01;
      bpos[0] = apex.x; bpos[1] = apex.y; bpos[2] = apex.z;
      bcol.set([cBright.r, cBright.g, cBright.b, 0.55 * alpha], 0);
      for (let i = 0; i < N; i++) {
        const v = -2.5 + (5 * i) / (N - 1);
        course.point(sLine, v, p);
        const hy = course.h(sLine);
        bpos.set([p.x, hy + 0.06, p.z], (i + 1) * 3);
        bcol.set([cBright.r, cBright.g, cBright.b, 0.08 * alpha], (i + 1) * 4);
        const q = course.point(sLine - 0.12, v, new THREE.Vector3());
        lpos.set([p.x, hy + 0.07, p.z], i * 6);
        lpos.set([q.x, hy + 0.07, q.z], i * 6 + 3);
      }
      beamGeo.attributes.position.needsUpdate = true;
      beamGeo.attributes.color.needsUpdate = true;
      lineGeo.attributes.position.needsUpdate = true;
      lineMat.opacity = alpha;
      gridMat.uniforms.uReveal.value = reveal;
      gridMat.uniforms.uAlpha.value = gridAlpha;
    },
    dispose() {
      beamGeo.dispose(); beamMat.dispose(); lineGeo.dispose(); lineMat.dispose(); gridMat.dispose();
      grid?.geometry.dispose();
    },
  };
}

/** The swallow's light dots on the best line ahead. set(course, s, n). */
export function makeGuideDots(n = 9) {
  const geo = new THREE.PlaneGeometry(0.5, 0.5).rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ map: radialTexture(), color: hex('xr-bike-guide'), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.frustumCulled = false;
  mesh.userData.noFit = true;
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  mesh.userData.set = (course, s, time, alpha) => {
    for (let i = 0; i < n; i++) {
      const si = s + 1.6 + i * 0.75 - ((time * 1.5) % 0.75);
      course.point(si, course.guideAt(si), p);
      p.y = course.h(si) + 0.05 + (course.arcAt?.(si) ?? 0);
      const k = Math.min(1, (i + 1) / 3) * (1 - i / n) * alpha;
      sc.setScalar(0.4 + 0.6 * k + 0.001);
      m.compose(p, q, sc);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mat.opacity = alpha;
    mesh.visible = alpha > 0.01;
  };
  return mesh;
}

/**
 * Snowflakes falling over the snow section near the bike (course units).
 * update(dt, s, on, scale, area): area { back, front, side, top } is the volume they fall in
 * (behind/ahead of the bike, to each side, height above the ground); they fade out near the top.
 */
export const FX_AREA = { back: 2.5, front: 14, side: 5, top: 6 };
export function makeSnow(course, count = 260, clip = null) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 4).fill(1);
  const seed = new Float32Array(count * 3); // s, v, phase
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  const mat = new THREE.PointsMaterial({ color: hex('xr-snow-flake'), map: radialTexture(), size: 0.012, vertexColors: true, transparent: true, depthWrite: false, opacity: 0, clippingPlanes: clip });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  points.userData.noFit = true;
  const p = new THREE.Vector3();
  const ys = new Float32Array(count);
  let init = false;
  points.userData.update = (dt, s, on, scale, area = FX_AREA) => {
    mat.opacity += ((on ? 0.9 : 0) - mat.opacity) * Math.min(1, dt * 1.5);
    mat.size = 0.11 * scale;
    points.visible = mat.opacity > 0.02;
    if (!points.visible) { init = false; return; }
    const { back, front, side, top } = area;
    for (let i = 0; i < count; i++) {
      const out = seed[i * 3] < s - back || seed[i * 3] > s + front + 0.5 || Math.abs(seed[i * 3 + 1]) > side || ys[i] > top;
      if (!init || out) {
        seed[i * 3] = init && seed[i * 3] < s - back ? s + front * (0.55 + Math.random() * 0.45) : s - back + Math.random() * (back + front);
        seed[i * 3 + 1] = (Math.random() * 2 - 1) * side;
        seed[i * 3 + 2] = Math.random() * TAU;
        ys[i] = init ? top * (0.7 + Math.random() * 0.3) : Math.random() * top;
      }
      ys[i] -= dt * (0.7 + (i % 5) * 0.08);
      if (ys[i] < 0) ys[i] += top;
      course.point(seed[i * 3], seed[i * 3 + 1] + Math.sin(ys[i] * 1.3 + seed[i * 3 + 2]) * 0.25, p);
      pos[i * 3] = p.x;
      pos[i * 3 + 1] = ys[i] + course.h(seed[i * 3]);
      pos[i * 3 + 2] = p.z;
      // Soft at the top of the volume and where they touch the ground.
      col[i * 4 + 3] = (1 - THREE.MathUtils.smoothstep(ys[i], top * 0.6, top)) * THREE.MathUtils.smoothstep(ys[i], 0, 0.25);
    }
    init = true;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
  };
  return points;
}

/** Soft mist banks over the start of a section (the scanner's fog). place(course, b0, token). */
export function makeMist(count = 9) {
  const g = new THREE.Group();
  g.userData.noFit = true;
  const mats = [];
  for (let i = 0; i < count; i++) {
    const m = new THREE.SpriteMaterial({ map: radialTexture(), color: hex('xr-bike-fog-mist'), transparent: true, opacity: 0, depthWrite: false });
    const s = new THREE.Sprite(m);
    s.userData.noFit = true;
    g.add(s);
    mats.push(m);
  }
  g.visible = false;
  g.userData.place = (course, b0, token) => {
    g.children.forEach((sp, i) => {
      const s = b0 + 1 + (i / count) * 12 + Math.random();
      const p = course.point(s, -2.2 + Math.random() * 4.4);
      sp.position.set(p.x, course.h(s) + 0.7 + Math.random() * 0.5, p.z);
      sp.scale.setScalar(3 + Math.random() * 2);
      sp.material.color.setHex(hex(token));
    });
    g.visible = true;
  };
  g.userData.fade = (alpha, time) => {
    g.visible = alpha > 0.01;
    g.children.forEach((sp, i) => { sp.material.opacity = alpha * (0.32 + 0.1 * Math.sin(time * 0.7 + i)); });
  };
  g.userData.dispose = () => mats.forEach((m) => m.dispose());
  return g;
}

/** Small sparks in course units (hits, stars, confetti), driven by update(dt). emit(pos, token, n). */
export function makeSparks(max = 260, clip = null) {
  const geo = new THREE.IcosahedronGeometry(0.07, 0);
  const mat = new THREE.MeshBasicMaterial({ toneMapped: false, clippingPlanes: clip });
  const mesh = new THREE.InstancedMesh(geo, mat, max);
  mesh.frustumCulled = false;
  mesh.userData.noFit = true;
  mesh.count = 0;
  const parts = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const c = new THREE.Color();
  /** bias: added to every particle's velocity (e.g. spray thrown back from a wheel). */
  mesh.userData.emit = (pos, token, n = 14, speed = 2.2, gravity = 4, bias = null, size = 1) => {
    c.setHex(hex(token));
    for (let i = 0; i < n; i++) {
      if (parts.length >= max) parts.shift();
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize();
      const v = dir.multiplyScalar(speed * (0.5 + Math.random() * 0.7));
      if (bias) v.add(bias);
      parts.push({ p: pos.clone(), v, life: 0, max: 0.5 + Math.random() * 0.45, g: gravity, color: c.clone(), size: (0.7 + Math.random() * 0.6) * size });
    }
  };
  mesh.userData.update = (dt) => {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life += dt;
      if (p.life >= p.max) { parts.splice(i, 1); continue; }
      p.v.y -= p.g * dt;
      p.p.addScaledVector(p.v, dt);
    }
    parts.forEach((p, i) => {
      sc.setScalar(p.size * (1 - p.life / p.max) + 0.001);
      m.compose(p.p, q, sc);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, p.color);
    });
    mesh.count = parts.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };
  mesh.userData.clear = () => { parts.length = 0; mesh.count = 0; };
  return mesh;
}

/**
 * The diorama's cut edges in the headset: earth curtains from the terrain's edge (which rises and
 * falls with the hills) down to the base. update(points) with { x, z, top } per edge sample.
 */
export function makeCurtains(earth) {
  const C = 24;
  const g = new THREE.Group();
  g.userData.noFit = true;
  const mat = new THREE.MeshStandardMaterial({ map: earth, roughness: 0.95, side: THREE.DoubleSide, emissive: hex('xr-bike-earth-glow'), emissiveMap: earth, emissiveIntensity: 0.3 });
  const strips = [0, 1, 2, 3].map(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((C + 1) * 2 * 3), 3));
    const uv = new Float32Array((C + 1) * 2 * 2);
    for (let i = 0; i <= C; i++) uv.set([i / C * 2, 0, i / C * 2, 1], i * 4);
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const idx = [];
    for (let i = 0; i < C; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    const m = new THREE.Mesh(geo, mat);
    m.frustumCulled = false;
    m.userData.noFit = true;
    g.add(m);
    return m;
  });
  g.userData.C = C;
  /** edges: four arrays of C + 1 samples { x, z, top } (stage space); bottom: the base's top. */
  g.userData.update = (edges, bottom) => {
    edges.forEach((pts, k) => {
      const pos = strips[k].geometry.attributes.position;
      pts.forEach((q, i) => {
        pos.setXYZ(i * 2, q.x, q.top, q.z);
        pos.setXYZ(i * 2 + 1, q.x, bottom, q.z);
      });
      pos.needsUpdate = true;
      strips[k].geometry.computeVertexNormals();
    });
  };
  g.userData.dispose = () => mat.dispose();
  return g;
}
