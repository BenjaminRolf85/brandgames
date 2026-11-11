// "Andock-Labor" (Docking Lab): the science part. Molecules (ball-and-stick templates for the
// four pockets and their variants), the protein surface (a lumpy blob with a pocket carved in the
// shape of the true binder, as a signed distance field), the round setup (candidates, the AI's
// predictions and the hidden lab truth) and the live fit evaluation.
//
// Coordinates are meters. The pocket frame F: x right, y up, z out of the pocket (towards the
// player). Molecule templates are written in F; the protein (P space, origin at its center)
// carries F as a child at the bottom of the pocket.
import * as THREE from 'three';
import { mergeVertices } from '../vendor/addons/utils/BufferGeometryUtils.js';
import { hex, num } from './tokens.js';

export const B = num('xr-dock-bond-length') || 0.042; // bond length
const R_ATOM = num('xr-dock-atom-radius') || 0.0148;
export const ELEMENTS = {
  C: { r: R_ATOM, token: 'xr-dock-atom-c' },
  N: { r: R_ATOM, token: 'xr-dock-atom-n' },
  O: { r: R_ATOM, token: 'xr-dock-atom-o' },
  S: { r: R_ATOM * 1.16, token: 'xr-dock-atom-s' },
  Cl: { r: R_ATOM * 1.16, token: 'xr-dock-atom-cl' },
};
// Contact spots: opposites attract (a negative spot wants the nitrogen, a positive spot the
// oxygen), water-shy spots want carbon, sulfur or chlorine.
export const SPOTS = {
  neg: { token: 'xr-dock-spot-neg', match: ['N'] },
  pos: { token: 'xr-dock-spot-pos', match: ['O'] },
  hydro: { token: 'xr-dock-spot-hydro', match: ['C', 'S', 'Cl'] },
};

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const DEG = Math.PI / 180;

/** Seeded random numbers (mulberry32), so a level's protein is the same every time. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- molecules ----------

/** Six ring atoms around c in the xy plane, the first at angle phase (degrees). */
function hexRing(c, phase = 90) {
  return Array.from({ length: 6 }, (_, k) => {
    const a = (phase + k * 60) * DEG;
    return V(c.x + B * Math.cos(a), c.y + B * Math.sin(a), c.z);
  });
}

/** One bond further out from a ring atom (away from the ring center), optionally tilted in z. */
function outward(p, center, tiltZ = 0, len = B) {
  const d = p.clone().sub(center);
  d.z = 0;
  d.normalize();
  d.z = tiltZ;
  return p.clone().add(d.normalize().multiplyScalar(len));
}

/** A step of one bond length from p in direction (x, y, z). */
function step(p, x, y, z) {
  return p.clone().add(V(x, y, z).normalize().multiplyScalar(B));
}

/** A branch of three atoms (a carbon with two more) from p in direction dir, splayed in the plane. */
function branch(p, dir, el = 'C', spread = 58) {
  const d = dir.clone().normalize();
  d.z -= 0.32; // a little down into the protein: it bumps into the wall
  d.normalize();
  const a = p.clone().addScaledVector(d, B);
  const side = (s) => d.clone().applyAxisAngle(V(0, 0, 1), s * spread * DEG).add(V(0, 0, 0.18 * s)).normalize();
  return [{ el: 'C', p: a }, { el, p: a.clone().addScaledVector(side(1), B) }, { el: 'C', p: a.clone().addScaledVector(side(-1), B) }];
}

/** A group pointing out of the pocket (towards the solvent): looks harmless when docking. */
function plume(p, dir, els = ['S', 'O', 'O']) {
  const d = dir.clone().normalize();
  const a = p.clone().addScaledVector(d, B);
  const perp = V(-d.y, d.x, 0).normalize();
  return [
    { el: els[0], p: a },
    { el: els[1], p: a.clone().addScaledVector(d.clone().addScaledVector(perp, 1.1).normalize(), B) },
    { el: els[2], p: a.clone().addScaledVector(d.clone().addScaledVector(perp, -1.1).normalize(), B) },
  ];
}

const atom = (el, p, spot) => ({ el, p, spot: spot ?? null });

/**
 * The four pockets. Each has the true binder (template, in F) and edits for the other
 * candidates: mismatch (a charged atom swapped, so like repels like), small (a contact atom
 * missing), bulky (a group that bumps into the wall) and decoy (a group pointing out of the
 * pocket: it docks perfectly, but fails in the lab for a reason the AI could not see).
 */
const LEVELS = [
  {
    key: 'dockLevel1', seed: 11, depth: 0.78 * B, tint: 'xr-dock-protein-1', lib: 12480,
    build() {
      const c = V(0, 0, 0);
      const r = hexRing(c);
      const atoms = r.map((p, i) => atom('C', p, i === 2 ? 'hydro' : null));
      atoms.push(atom('N', outward(r[0], c), 'neg'));
      atoms.push(atom('O', outward(r[4], c), 'pos'));
      return {
        atoms, rings: [[0, 1, 2, 3, 4, 5]],
        mismatch: { swap: 6, to: 'O' },
        small: { remove: 7 },
        bulky: { add: branch(r[1], r[1].clone().sub(c)) },
        decoy: { add: plume(r[5], r[5].clone().sub(c).setZ(0).normalize().multiplyScalar(0.35).add(V(0, 0, 0.94))) },
      };
    },
  },
  {
    key: 'dockLevel2', seed: 23, depth: 0.8 * B, tint: 'xr-dock-protein-2', lib: 23750,
    build() {
      const c = V(0.1 * B, 0.72 * B, 0.17 * B);
      const r = hexRing(c);
      const atoms = r.map((p, i) => atom('C', p, i === 5 ? 'hydro' : null));
      atoms.push(atom('O', outward(r[1], c), 'pos'));
      // A chain from the bottom of the ring, down and deep into the protein, ending in a nitrogen.
      const c1 = step(r[3], 0.15, -0.75, -0.62);
      const c2 = step(c1, -0.55, -0.55, -0.55);
      const n = step(c2, 0.35, -0.7, -0.6);
      atoms.push(atom('C', c1), atom('C', c2), atom('N', n, 'neg'));
      return {
        atoms, rings: [[0, 1, 2, 3, 4, 5]],
        mismatch: { swap: 9, to: 'O' },
        small: { remove: [8, 9] },
        bulky: { add: branch(r[4], r[4].clone().sub(c).setZ(0)) },
        decoy: { add: plume(r[4], V(0.4, -0.1, 0.92)) },
      };
    },
  },
  {
    key: 'dockLevel3', seed: 37, depth: 0.8 * B, tint: 'xr-dock-protein-3', lib: 38400,
    build() {
      // Two fused rings, long and flat, slightly twisted into a narrow cleft.
      const h = (Math.sqrt(3) / 2) * B;
      const ca = V(-h, 0, 0);
      const cb = V(h, 0, 0);
      const ra = hexRing(ca);
      const rb = hexRing(cb);
      // Ring A: 0 top, 1 upper-left, 2 lower-left, 3 bottom, 4 lower-right (shared), 5 upper-right (shared)
      const atoms = ra.map((p) => atom('C', p));
      const shared = { 1: 5, 2: 4 }; // ring B's upper-left / lower-left are ring A's 5 / 4
      const idxB = rb.map((p, k) => {
        if (shared[k] !== undefined) return shared[k];
        atoms.push(atom('C', p));
        return atoms.length - 1;
      });
      atoms.push(atom('N', outward(ra[2], ca), 'neg'));
      atoms.push(atom('O', outward(rb[5], cb), 'pos'));
      atoms.push(atom('S', outward(rb[4], cb, -0.25), 'hydro'));
      const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.16, -0.32, 0.12));
      atoms.forEach((a) => a.p.applyQuaternion(tilt));
      const n = atoms.length;
      const bulky = branch(atoms[0].p, V(-0.2, 1, 0.05));
      return {
        atoms, rings: [[0, 1, 2, 3, 4, 5], idxB],
        mismatch: { swap: n - 3, to: 'O' },
        small: { remove: n - 2 },
        bulky: { add: bulky },
        decoy: { add: plume(atoms[idxB[0]].p, V(0.1, 0.35, 0.93)) },
        // Your own design: the two rings, and four places to attach atoms (one points into the wall).
        design: { keep: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], points: [[2, n - 3], [idxB[5], n - 2], [idxB[4], n - 1], [0, bulky[0].p]] },
      };
    },
  },
  {
    key: 'dockLevel4', seed: 51, depth: 0.82 * B, tint: 'xr-dock-protein-4', lib: 51200,
    build() {
      const c = V(0, 0.33 * B, 0.33 * B);
      const r = hexRing(c, 90);
      const atoms = r.map((p) => atom('C', p));
      // The key: a chain straight down into a deep, narrow hole, with a nitrogen at its end.
      const k1 = step(r[3], 0.05, -0.32, -0.95);
      const k2 = step(k1, -0.1, 0.05, -1);
      atoms.push(atom('C', k1), atom('N', k2, 'neg'));
      atoms.push(atom('O', outward(r[1], c, -0.15), 'pos'));
      atoms.push(atom('Cl', outward(r[5], c, -0.2), 'hydro'));
      atoms.push(atom('C', outward(r[0], c, 0.45)));
      const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.3, 0.18, -0.2));
      atoms.forEach((a) => a.p.applyQuaternion(tilt));
      const bulky = branch(r[2].clone().applyQuaternion(tilt), r[2].clone().sub(c).applyQuaternion(tilt).setZ(0));
      return {
        atoms, rings: [[0, 1, 2, 3, 4, 5]],
        mismatch: { swap: 7, to: 'O' },
        small: { remove: [6, 7] },
        bulky: { add: bulky },
        decoy: { add: plume(atoms[10].p, V(0.15, 0.25, 0.95), ['S', 'O', 'C']) },
        design: { keep: [0, 1, 2, 3, 4, 5, 6, 10], points: [[6, 7], [1, 8], [5, 9], [2, bulky[0].p]] },
      };
    },
  },
];

/** A molecule: atoms (el, p in its own frame, spot, core), bonds and aromatic rings. */
function finishMolecule(atoms, rings, c0) {
  const local = atoms.map((a) => ({ ...a, p: a.p.clone().sub(c0) }));
  const bonds = [];
  for (let i = 0; i < local.length; i++) {
    for (let j = i + 1; j < local.length; j++) {
      if (local[i].p.distanceTo(local[j].p) < B * 1.22) bonds.push([i, j]);
    }
  }
  let radius = 0;
  local.forEach((a) => { radius = Math.max(radius, a.p.length() + ELEMENTS[a.el].r); });
  return { atoms: local, bonds, rings: rings.filter((r) => r.every((i) => i < local.length)), radius };
}

/** The candidate of a kind, built from the level's template (core atoms keep their places). */
function variant(spec, kind) {
  const atoms = spec.atoms.map((a) => ({ el: a.el, p: a.p.clone(), spot: a.spot, core: true }));
  let rings = spec.rings.map((r) => [...r]);
  if (kind === 'mismatch') atoms[spec.mismatch.swap].el = spec.mismatch.to;
  if (kind === 'small') {
    const drop = new Set([].concat(spec.small.remove));
    const keep = atoms.map((_, i) => i).filter((i) => !drop.has(i));
    const remap = new Map(keep.map((i, k) => [i, k]));
    rings = rings.filter((r) => r.every((i) => remap.has(i))).map((r) => r.map((i) => remap.get(i)));
    return { atoms: keep.map((i) => atoms[i]), rings };
  }
  if (kind === 'bulky' || kind === 'decoy') {
    for (const a of spec[kind].add) atoms.push({ el: a.el, p: a.p.clone(), spot: null, core: false });
  }
  return { atoms, rings };
}

/** Lab truth (measured binding in %) and the reason, per kind of candidate. */
const TRUTH = {
  binder: [88, 97],
  decoy: [8, 19],
  mismatch: [18, 30],
  small: [34, 47],
  bulky: [5, 14],
};
const WHY = { binder: 'dockWhyGood', mismatch: 'dockWhyMismatch', small: 'dockWhySmall', bulky: 'dockWhyBulky' };
export const PASS = 70; // lab binding needed to solve a pocket

/**
 * A new round: per pocket the protein parameters, the template (slots and contact spots) and
 * four candidates with the AI's predicted fit and the hidden lab truth. In one random pocket
 * (2 to 4) the AI's top pick is a decoy that fails in the lab.
 */
export function makeRound(count = 4, rand = Math.random) {
  const ri = (a, b) => Math.round(a + rand() * (b - a));
  const decoyWhy = ['dockWhyDecoy1', 'dockWhyDecoy2', 'dockWhyDecoy3'];
  return LEVELS.slice(0, count).map((L, idx) => {
    const spec = L.build();
    const c0 = spec.atoms.reduce((s, a) => s.add(a.p), V(0, 0, 0)).divideScalar(spec.atoms.length);
    const slots = spec.atoms.map((a) => ({ p: a.p.clone(), el: a.el, spot: a.spot, r: ELEMENTS[a.el].r }));
    // Pocket 2: the AI's top pick fails in the lab. Pockets 3 and 4: no library hit binds well
    // enough (the top pick fails too); you design your own molecule on a scaffold.
    const design = idx >= 2 && spec.design ? spec.design : null;
    const fail = idx === 1 || !!design;
    const rest = rand() < 0.5 ? ['mismatch', 'bulky'] : ['small', 'bulky'];
    const kinds = design ? ['decoy', ...rest] : fail ? ['binder', 'decoy', ...rest] : ['binder', 'mismatch', 'small', 'bulky'];
    const binderAI = fail ? ri(64, 73) : ri(82, 93);
    const ai = {
      binder: binderAI,
      decoy: ri(Math.max(binderAI + 9, 80), 88),
      mismatch: Math.min(binderAI - 7, ri(55, 67)),
      small: Math.min(binderAI - 12, ri(44, 57)),
      bulky: ri(22, 37),
    };
    const letters = ['A', 'B', 'C', 'D'];
    const order = kinds.map((k) => ({ k, r: rand() })).sort((a, b) => a.r - b.r).map((o) => o.k);
    const candidates = order.map((kind, i) => {
      const v = variant(spec, kind);
      const [t0, t1] = TRUTH[kind];
      return {
        letter: letters[i], kind, mol: finishMolecule(v.atoms, v.rings, c0),
        ai: ai[kind], truth: ri(t0, t1), why: kind === 'decoy' ? decoyWhy[Math.floor(rand() * 3)] : WHY[kind],
        code: `M-${ri(10, 99)}${ri(100, 999)}`,
        tested: false, lab: null, fit: null,
      };
    });
    const top = [...candidates].sort((a, b) => b.ai - a.ai)[0];
    const level = {
      idx, key: L.key, seed: L.seed, depth: L.depth, tint: L.tint, fail,
      lib: L.lib + ri(-900, 900), secs: (0.4 + rand() * 0.7).toFixed(1),
      template: finishMolecule(spec.atoms.map((a) => ({ ...a, core: true })), spec.rings, c0),
      c0, slots, candidates, top,
    };
    if (design) {
      level.design = {
        scaffold: design.keep.map((i) => ({ el: spec.atoms[i].el, p: spec.atoms[i].p.clone(), spot: null, core: true })),
        rings: spec.rings.filter((r) => r.every((i) => design.keep.includes(i))).map((r) => r.map((i) => design.keep.indexOf(i))),
        // Attachment points: where an atom would sit (F space), which scaffold atom it hangs on,
        // and the contact spot there (none for the point that faces the wall).
        points: design.points.map(([from, at]) => {
          const p = typeof at === 'number' ? spec.atoms[at].p.clone() : at.clone();
          return { p, from: spec.atoms[from].p.clone(), spot: typeof at === 'number' ? spec.atoms[at].spot : null };
        }),
      };
      const own = { letter: '+', kind: 'scaffold', choices: design.points.map(() => null), code: '', tested: false, lab: null, fit: null };
      own.mol = buildDesign(level, own.choices);
      own.ai = designEstimate(level, own.choices);
      candidates.push(own);
    }
    return level;
  });
}

// ---------- your own design (pockets 3 and 4) ----------

export const DESIGN_ATOMS = ['N', 'O', 'C', 'S', 'Cl'];

/** How an atom at an attachment point works out: good, bad (repels), weak (no contact), clash, empty. */
export function judgePoint(point, el) {
  if (!el) return 'empty';
  if (!point.spot) return 'clash';
  if (SPOTS[point.spot].match.includes(el)) return 'good';
  if (el === 'N' || el === 'O') return 'bad';
  return 'weak';
}

/** The scaffold with the chosen atoms (choices[k]: element or null), as a molecule. */
export function buildDesign(level, choices) {
  const d = level.design;
  const atoms = d.scaffold.map((a) => ({ ...a, p: a.p.clone() }));
  d.points.forEach((pt, k) => {
    if (choices[k]) atoms.push({ el: choices[k], p: pt.p.clone(), spot: null, core: !!pt.spot });
  });
  return finishMolecule(atoms, d.rings, level.c0);
}

const tally = (level, choices) => {
  const n = { good: 0, bad: 0, weak: 0, clash: 0, empty: 0 };
  // An empty point without a contact spot is just right (that one faces the wall).
  level.design.points.forEach((pt, k) => { if (pt.spot || choices[k]) n[judgePoint(pt, choices[k])] += 1; });
  return n;
};

/** The AI's estimate for your design (in %): it reads shape and contacts, not the lab. */
export function designEstimate(level, choices) {
  const n = tally(level, choices);
  const key = choices.map((c) => c ?? '-').join('');
  let h = 7;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 997;
  const jitter = (h % 9) - 4;
  return Math.round(THREE.MathUtils.clamp(28 + 18 * n.good - 22 * n.bad - 30 * n.clash - 3 * n.weak + jitter, 5, 95));
}

/** What the lab measures for your design (binding in %) and why. */
export function designTruth(level, choices, rand = Math.random) {
  const n = tally(level, choices);
  const ri = (a, b) => Math.round(a + rand() * (b - a));
  if (n.clash) return { truth: ri(6, 14), why: 'dockWhyBulky' };
  if (n.bad) return { truth: ri(16, 28), why: 'dockWhyMismatch' };
  if (n.weak || n.empty) return { truth: ri(32, 46), why: 'dockWhySmall' };
  return { truth: ri(88, 96), why: 'dockWhyBuild' };
}

// ---------- the protein: a lumpy blob with a carved pocket (signed distance field) ----------

const smin = (a, b, k) => {
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
  return b + (a - b) * h - k * h * (1 - h);
};
const smax = (a, b, k) => -smin(-a, -b, k);
const POCKET_DIR = V(0, 0.24, 1).normalize();
const CARVE = 0.2 * B; // clearance around the binder's atoms
const SLOPE = 0.5; // the pocket walls widen towards the mouth
const CAP_R = 0.6; // radius of the flatter face around the pocket
const CHANNEL = 0.14;

/**
 * The protein of a pocket: radius function of the blob (ellipsoid, a few lobes, many small
 * bumps like the atoms of a real protein surface) and the pocket frame F (in P space).
 */
export class Protein {
  constructor(level, radius = num('xr-dock-protein-radius') || 0.19) {
    const rand = rng(level.seed);
    this.R0 = radius;
    this.ell = V(1 + rand() * 0.14, 0.86 + rand() * 0.1, 0.9 + rand() * 0.1);
    const dir = () => V(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
    // Big lobes give the silhouette, small bumps the surface texture (kept away from the pocket).
    this.bumps = [];
    for (let i = 0; i < 5; i++) {
      const d = dir();
      if (d.dot(POCKET_DIR) > 0.7) d.addScaledVector(POCKET_DIR, -1).normalize();
      this.bumps.push({ d, a: 0.07 + rand() * 0.09, w: 0.18 + rand() * 0.2 });
    }
    for (let i = 0; i < 110; i++) {
      const d = dir();
      const near = d.dot(POCKET_DIR);
      const keep = THREE.MathUtils.smoothstep(near, 0.8, 0.97); // fewer bumps near the pocket mouth
      this.bumps.push({ d, a: (0.025 + rand() * 0.035) * (1 - keep * 0.85), w: 0.008 + rand() * 0.022 });
    }
    // A broad, gently curved face around the pocket (a cap of a much larger sphere), so the
    // whole molecule lies under the surface and the pocket is a real cavity.
    this.capK = CAP_R - this.radius(POCKET_DIR);
    // Pocket frame: z out of the pocket, x right, y up (tilted back with the pocket).
    const z = POCKET_DIR.clone();
    const x = V(0, 1, 0).cross(z).normalize();
    const y = z.clone().cross(x);
    const surf = this.radius(z);
    this.F = new THREE.Matrix4().makeBasis(x, y, z).setPosition(z.clone().multiplyScalar(surf - level.depth));
    this.Finv = this.F.clone().invert();
    this.slots = level.slots;
    // Each atom's channel opens outwards along the line from the protein's center through the
    // atom: the pocket stays a clean height field over the sphere (no overhangs, no cliffs).
    const center = V(0, 0, 0).applyMatrix4(this.Finv);
    this.axes = this.slots.map((sl) => sl.p.clone().sub(center).normalize());
    this._n = V(0, 0, 0);
    this._q = V(0, 0, 0);
  }

  /** Radius of the blob (without the pocket) in unit direction n. */
  radius(n) {
    const e = this.ell;
    const base = this.R0 / Math.sqrt((n.x / e.x) ** 2 + (n.y / e.y) ** 2 + (n.z / e.z) ** 2);
    let s = 0;
    for (let i = 0; i < this.bumps.length; i++) {
      const b = this.bumps[i];
      const c = n.x * b.d.x + n.y * b.d.y + n.z * b.d.z;
      if (c < 1 - b.w * 6) continue;
      s += b.a * Math.exp((c - 1) / b.w);
    }
    let r = base * (1 + s);
    const c = n.x * POCKET_DIR.x + n.y * POCKET_DIR.y + n.z * POCKET_DIR.z;
    if (this.capK !== undefined && c > 0.58) {
      const k = this.capK;
      const cap = -k * c + Math.sqrt(Math.max(0, k * k * c * c - k * k + CAP_R * CAP_R));
      r += THREE.MathUtils.smoothstep(c, 0.6, 0.82) * Math.max(0, cap - r);
    }
    return r;
  }

  /** Distance (negative inside) to the pocket channel, for a point q in F space. */
  pocketSdf(q) {
    let d = Infinity;
    for (let k = 0; k < this.slots.length; k++) {
      const s = this.slots[k];
      const a = s.p;
      const u = this.axes[k];
      const h = Math.min(CHANNEL, Math.max(0, (q.x - a.x) * u.x + (q.y - a.y) * u.y + (q.z - a.z) * u.z));
      const dx = q.x - (a.x + u.x * h);
      const dy = q.y - (a.y + u.y * h);
      const dz = q.z - (a.z + u.z * h);
      const di = Math.sqrt(dx * dx + dy * dy + dz * dz) - (s.r + CARVE + SLOPE * h);
      d = d === Infinity ? di : smin(d, di, 0.3 * B);
    }
    return d;
  }

  /** Signed distance (approximate, negative inside) of the protein at p (P space). */
  sdf(p, qF = null) {
    const len = p.length();
    const blob = len - this.radius(this._n.copy(p).divideScalar(Math.max(len, 1e-6)));
    const q = qF ?? this._q.copy(p).applyMatrix4(this.Finv);
    return smax(blob, -this.pocketSdf(q), 0.007);
  }

  /** Signed distance for a point given in F space. */
  sdfF(q) {
    const p = q.clone().applyMatrix4(this.F);
    return this.sdf(p, q);
  }

  /**
   * Evens out the triangles in the pocket: the radial projection leaves long thin ones on its
   * steep walls. Each round moves a vertex towards the middle of its neighbours and then back
   * onto the surface along the gradient of the distance field. Yields between rounds.
   */
  *relaxSteps(pos, index, depth, radii, rounds = 28) {
    const nb = Array.from({ length: pos.count }, () => []);
    for (let f = 0; f < index.length; f += 3) {
      const a = index[f];
      const b = index[f + 1];
      const c = index[f + 2];
      nb[a].push(b, c);
      nb[b].push(a, c);
      nb[c].push(a, b);
    }
    // The carved part and three rings around it.
    const mark = new Uint8Array(pos.count);
    for (let i = 0; i < pos.count; i++) if (depth[i] > 0.0008) mark[i] = 1;
    for (let ring = 0; ring < 3; ring++) {
      const prev = mark.slice();
      for (let i = 0; i < pos.count; i++) if (prev[i]) for (const j of nb[i]) mark[j] = 1;
    }
    const near = [];
    for (let i = 0; i < pos.count; i++) if (mark[i]) near.push(i);
    yield;
    const p = V(0, 0, 0);
    const n = V(0, 0, 0);
    const g = V(0, 0, 0);
    const q = V(0, 0, 0);
    const d0 = V(0, 0, 0);
    // The blob's radius barely changes over these small moves: each vertex keeps its own.
    let Ri = 0;
    const sdfAt = (v) => smax(v.length() - Ri, -this.pocketSdf(q.copy(v).applyMatrix4(this.Finv)), 0.007);
    const e = 0.0008;
    const grad = (v, d) => g.set(sdfAt(n.copy(v).setX(v.x + e)) - d, sdfAt(n.copy(v).setY(v.y + e)) - d, sdfAt(n.copy(v).setZ(v.z + e)) - d).divideScalar(e);
    const next = new Float32Array(near.length * 3);
    for (let r = 0; r < rounds; r++) {
      for (let k = 0; k < near.length; k++) {
        const i = near[k];
        const list = nb[i];
        Ri = radii[i];
        p.fromBufferAttribute(pos, i);
        let x = 0;
        let y = 0;
        let z = 0;
        for (const j of list) { x += pos.getX(j); y += pos.getY(j); z += pos.getZ(j); }
        // Tangential smoothing: slide towards the middle of the neighbours along the surface.
        d0.set(x, y, z).divideScalar(list.length).sub(p);
        const sd = sdfAt(p);
        grad(p, sd).normalize();
        d0.addScaledVector(g, -d0.dot(g));
        p.addScaledVector(d0, 0.6);
        for (let it = 0; it < 2; it++) {
          const d = sdfAt(p);
          grad(p, d);
          p.addScaledVector(g, -d / Math.max(1e-6, g.lengthSq()));
        }
        next[k * 3] = p.x;
        next[k * 3 + 1] = p.y;
        next[k * 3 + 2] = p.z;
        if (k % 250 === 249) yield;
      }
      for (let k = 0; k < near.length; k++) pos.setXYZ(near[k], next[k * 3], next[k * 3 + 1], next[k * 3 + 2]);
      yield;
    }
  }

  /** The surface mesh in one go (see buildSteps). */
  geometry(tintToken, detail = 46) {
    const it = this.buildSteps(tintToken, detail);
    let r = it.next();
    while (!r.done) r = it.next();
    return r.value;
  }

  /**
   * The surface mesh, built in small steps (a generator: the scene advances it a few
   * milliseconds per frame, so the headset never stalls). An icosphere, denser towards the
   * pocket, pushed out along each direction to the surface, relaxed in the pocket. Vertex
   * colors: the tint, darker in crevices and the pocket, the contact spots as colored patches.
   */
  *buildSteps(tintToken, detail = 46) {
    const unit = unitSphere(detail);
    const geo = new THREE.BufferGeometry();
    const pos = new THREE.BufferAttribute(unit.pos.slice(), 3);
    geo.setAttribute('position', pos);
    geo.setIndex(new THREE.BufferAttribute(unit.index, 1));
    const n = V(0, 0, 0);
    const p = V(0, 0, 0);
    const q = V(0, 0, 0);
    const axis = V(0, 0, 0);
    const depth = new Float32Array(pos.count);
    const radii = new Float32Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      n.fromBufferAttribute(pos, i).normalize();
      // Warp the directions towards the pocket: finer triangles where the detail is.
      const th = Math.acos(THREE.MathUtils.clamp(n.dot(POCKET_DIR), -1, 1));
      if (th > 1e-4) {
        const th2 = (th ** 1.35) / Math.PI ** 0.35;
        axis.crossVectors(POCKET_DIR, n).normalize();
        n.copy(POCKET_DIR).applyAxisAngle(axis, th2);
      }
      const R = this.radius(n);
      radii[i] = R;
      let t = R;
      // Near the pocket: march outwards from deep inside to the first surface crossing, then
      // bisect (along the ray the blob part is simply t - R).
      if (n.dot(POCKET_DIR) > 0.2) {
        const f = (tt) => smax(tt - R, -this.pocketSdf(q.copy(p.copy(n).multiplyScalar(tt)).applyMatrix4(this.Finv)), 0.007);
        let t0 = R - 0.16;
        let t1 = t0;
        for (let k = 0; k < 120; k++) {
          t1 = t0 + 0.002;
          if (f(t1) > 0) break;
          t0 = t1;
        }
        for (let k = 0; k < 12; k++) {
          const tm = (t0 + t1) / 2;
          if (f(tm) > 0) t1 = tm;
          else t0 = tm;
        }
        t = (t0 + t1) / 2;
      }
      pos.setXYZ(i, n.x * t, n.y * t, n.z * t);
      depth[i] = Math.max(0, R - t);
      if (i % 400 === 399) yield;
    }
    yield* this.relaxSteps(pos, geo.index.array, depth, radii);
    geo.computeVertexNormals();
    yield;
    // Crevices: how far a vertex sits below the average of its neighbours.
    const idx = geo.index.array;
    const sum = new Float32Array(pos.count * 3);
    const cnt = new Float32Array(pos.count);
    for (let f = 0; f < idx.length; f += 3) {
      for (let e = 0; e < 3; e++) {
        const a = idx[f + e];
        for (const b of [idx[f + ((e + 1) % 3)], idx[f + ((e + 2) % 3)]]) {
          sum[a * 3] += pos.getX(b);
          sum[a * 3 + 1] += pos.getY(b);
          sum[a * 3 + 2] += pos.getZ(b);
          cnt[a] += 1;
        }
      }
    }
    yield;
    const nrm = geo.attributes.normal;
    const base = new THREE.Color(hex(tintToken));
    const shade = new THREE.Color(hex('xr-dock-pocket-shade'));
    const spotCols = Object.fromEntries(Object.entries(SPOTS).map(([k, sp]) => [k, new THREE.Color(hex(sp.token))]));
    const spots = this.slots.filter((sl) => sl.spot).map((sl) => ({ c: spotCols[sl.spot], p: sl.p.clone().applyMatrix4(this.F) }));
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const v = V(0, 0, 0);
    const avg = V(0, 0, 0);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      n.fromBufferAttribute(nrm, i);
      avg.set(sum[i * 3], sum[i * 3 + 1], sum[i * 3 + 2]).divideScalar(Math.max(1, cnt[i]));
      const concave = THREE.MathUtils.clamp(avg.sub(v).dot(n) / 0.0016, 0, 1);
      const cav = THREE.MathUtils.clamp(depth[i] / 0.05, 0, 1);
      c.copy(base).lerp(shade, Math.min(0.75, 0.32 * concave + 0.6 * cav));
      for (const sp of spots) {
        const w = 1 - THREE.MathUtils.smoothstep(v.distanceTo(sp.p), 0.46 * B, 0.95 * B);
        if (w > 0) c.lerp(sp.c, w * 0.94);
      }
      col.set([c.r, c.g, c.b], i * 3);
      if (i % 2500 === 2499) yield;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    return geo;
  }
}

/** A unit icosphere with shared vertices (cached per detail; arrays only, no GPU buffers). */
const unitCache = new Map();
function unitSphere(detail) {
  if (!unitCache.has(detail)) {
    let g = new THREE.IcosahedronGeometry(1, detail);
    g.deleteAttribute('normal');
    g.deleteAttribute('uv');
    g = mergeVertices(g);
    unitCache.set(detail, { pos: g.attributes.position.array, index: g.index.array });
    g.dispose();
  }
  return unitCache.get(detail);
}

// ---------- fit ----------

/**
 * How well a molecule sits in the pocket. rel: molecule frame -> F space. Returns shape (atoms on
 * the binder's places and the places filled), contacts (good minus bad contact spots), clashes and
 * the fit, plus per atom: 'good' | 'contact' | 'bad' | null for the glow, and per spot its state.
 */
export function evaluateFit(protein, mol, rel, out = {}) {
  const slots = protein.slots;
  const n = mol.atoms.length;
  out.atom ??= [];
  out.atom.length = n;
  out.pen ??= [];
  out.pen.length = n;
  out.spot ??= [];
  out.spot.length = slots.length;
  out.q ??= [];
  const filled = new Float32Array(slots.length);
  const nearest = new Int16Array(slots.length).fill(-1);
  const nearD = new Float32Array(slots.length).fill(1);
  let coreSum = 0;
  let coreN = 0;
  let clash = 0;
  for (let i = 0; i < n; i++) {
    const a = mol.atoms[i];
    const q = (out.q[i] ??= V(0, 0, 0)).copy(a.p).applyMatrix4(rel);
    const sd = protein.sdfF(q);
    const pen = THREE.MathUtils.clamp((-sd - 0.125 * B) / (0.28 * B), 0, 1);
    out.pen[i] = pen;
    clash += pen;
    let best = 1;
    for (let j = 0; j < slots.length; j++) {
      const d = q.distanceTo(slots[j].p);
      if (d < best) best = d;
      const f = Math.exp(-((d / (0.44 * B)) ** 2));
      if (f > filled[j]) filled[j] = f;
      if (d < nearD[j]) { nearD[j] = d; nearest[j] = i; }
    }
    if (a.core) { coreSum += Math.exp(-((best / (0.44 * B)) ** 2)); coreN += 1; }
    out.atom[i] = pen > 0.15 ? 'bad' : best < 0.39 * B ? 'good' : null;
  }
  let good = 0;
  let bad = 0;
  let special = 0;
  for (let j = 0; j < slots.length; j++) {
    const s = slots[j];
    out.spot[j] = null;
    if (!s.spot) continue;
    special += 1;
    const i = nearest[j];
    if (i < 0 || nearD[j] > 0.55 * B) continue;
    const ok = SPOTS[s.spot].match.includes(mol.atoms[i].el);
    if (ok) { good += 1; out.spot[j] = 'good'; if (out.atom[i] !== 'bad') out.atom[i] = 'contact'; }
    else { bad += 1; out.spot[j] = 'bad'; out.atom[i] = 'bad'; }
  }
  const fillMean = filled.reduce((s, f) => s + f, 0) / slots.length;
  out.shape = 0.5 * (coreN ? coreSum / coreN : 0) + 0.5 * fillMean;
  out.good = good;
  out.bad = bad;
  out.special = special;
  out.contacts = THREE.MathUtils.clamp((good - bad) / Math.max(1, special), 0, 1);
  out.clash = clash;
  out.fit = THREE.MathUtils.clamp(0.5 * out.shape + 0.5 * out.contacts - 0.3 * clash, 0, 1);
  return out;
}
