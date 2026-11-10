// "Stein auf Stein": the house plan. Four walls in running bond (every second course shifted by
// half a brick), sandstone corner pieces, a door and windows with frames and concrete lintels,
// roof trusses on the wall tops, and an optional extension (one more room) at the left side.
// Every piece has a scope: 'own' (built by hand while saving: the two lowest courses, the corner
// pieces there and the frames), 'loan' (the crane after the allotment) or 'hand' (by hand in the
// loan phase: lintels and trusses). Statics: a piece resting on everything below it is solid; one
// resting on only part of its supports wobbles (allowed for bricks, half bricks and corners, it
// costs points and settles once the gap below is filled); one with nothing below is refused.
// House-local meters: origin on the foundation in the middle of the house, +y up, +z to the
// street. The measures must match blender/build_bricks.py.

export const L = 0.072; // brick pitch along a wall (one brick plus mortar)
export const H = 0.03; // course height
export const D = 0.036; // wall thickness
export const GAP = 0.003; // mortar joint
export const COURSES = 7;
export const ANNEX_COURSES = 5;
export const TOP = COURSES * H;
export const XH = 3 * L + D / 2; // side walls' center lines
export const ZH = 2 * L + D / 2; // front and back walls' center lines
export const OX = 3 * L + D; // outer faces
export const OZ = 2 * L + D;
export const FOUND = 0.014; // foundation slab (plot-local y of the house origin)
export const HOUSE_Z = -0.03; // house center on the plot
export const RIDGE = 0.15; // roof ridge above the wall tops
export const EAVE = 0.035; // roof overhang
// The extension: a 2 x 2 brick room left of the house with a flat roof.
export const ZA = L + D / 2;
export const XA = -(OX + 2 * L + D / 2);
export const TRUSS_X = [-0.21, -0.105, 0, 0.105, 0.21];
export const BASE_TARGET = 44; // savings (in brick values) for the allotment with the basic plan

// Openings: u along the wall in brick pitches; the hole spans courses c0..c1-1, the lintel lies in
// course c1. at(u) -> [x, z] of the wall's center line; face: yaw of the outside.
const MAIN_WALLS = [
  {
    key: 'front', len: 6, face: 0, along: 'x', off: 0, courses: COURSES, at: (u) => [-3 * L + u * L, ZH],
    openings: [{ u0: 2.5, u1: 3.5, c0: 0, c1: 5, kind: 'door' }, { u0: 0.5, u1: 1.5, c0: 2, c1: 5, kind: 'window' }, { u0: 4.5, u1: 5.5, c0: 2, c1: 5, kind: 'window' }],
  },
  {
    key: 'right', len: 4, face: Math.PI / 2, along: 'z', off: 0.5, courses: COURSES, at: (u) => [XH, 2 * L - u * L],
    openings: [{ u0: 1.5, u1: 2.5, c0: 2, c1: 5, kind: 'window' }],
  },
  {
    key: 'back', len: 6, face: Math.PI, along: 'x', off: 0, courses: COURSES, at: (u) => [-3 * L + u * L, -ZH],
    openings: [{ u0: 1, u1: 2, c0: 2, c1: 5, kind: 'window' }, { u0: 4, u1: 5, c0: 2, c1: 5, kind: 'window' }],
  },
  {
    key: 'left', len: 4, face: -Math.PI / 2, along: 'z', off: 0.5, courses: COURSES, at: (u) => [-XH, 2 * L - u * L],
    openings: [{ u0: 1.5, u1: 2.5, c0: 2, c1: 5, kind: 'window' }],
  },
];
const ANNEX_WALLS = [
  { key: 'afront', len: 2, face: 0, along: 'x', off: 0, courses: ANNEX_COURSES, at: (u) => [-OX - u * L, ZA], openings: [] },
  { key: 'aside', len: 2, face: -Math.PI / 2, along: 'z', off: 0.5, courses: ANNEX_COURSES, at: (u) => [XA, L - u * L], openings: [] },
  { key: 'aback', len: 2, face: Math.PI, along: 'x', off: 0, courses: ANNEX_COURSES, at: (u) => [-OX - u * L, -ZA], openings: [] },
];
export const WALLS = [...MAIN_WALLS, ...ANNEX_WALLS];
// Corner posts: [x, z, courses, annex]
const CORNERS = [[-XH, ZH, COURSES, false], [XH, ZH, COURSES, false], [XH, -ZH, COURSES, false], [-XH, -ZH, COURSES, false]];
const ANNEX_CORNERS = [[XA, ZA, ANNEX_COURSES, true], [XA, -ZA, ANNEX_COURSES, true]];

const EPS = 1e-6;
const STRUCT = new Set(['full', 'half', 'post', 'lintel']);
const WOBBLY = new Set(['full', 'half', 'post']);
const VALUE = { full: 1, half: 1, post: 1, lintel: 1, truss: 1, window: 2, door: 3 };
// Item kinds the pallet brings and the piece kinds they fill.
export const ITEM_KINDS = ['single', 'double', 'half', 'corner', 'window', 'door', 'lintel', 'truss', 'gold'];

/** Wall pieces of one wall (courses, running bond, openings with lintels) and its frames. */
function wallPieces(w, wi, annex, add) {
  for (let c = 0; c < w.courses; c++) {
    let segs = [[0, w.len]];
    const lintels = [];
    for (const o of w.openings) {
      if (c < o.c0 || c > o.c1) continue;
      if (c === o.c1) lintels.push(o);
      segs = segs.flatMap(([a, b]) => {
        if (o.u1 <= a || o.u0 >= b) return [[a, b]];
        const r = [];
        if (o.u0 > a) r.push([a, o.u0]);
        if (o.u1 < b) r.push([o.u1, b]);
        return r;
      });
    }
    const off = (w.off + (c % 2) * 0.5) % 1;
    segs.forEach(([a, b], si) => {
      for (let k = Math.floor(a - off); k + off < b - EPS; k++) {
        const u0 = Math.max(a, k + off);
        const u1 = Math.min(b, k + 1 + off);
        if (u1 - u0 < 0.25) continue;
        const [x, z] = w.at((u0 + u1) / 2);
        add({ wall: wi, course: c, u0, u1, kind: u1 - u0 > 0.75 ? 'full' : 'half', pier: `${wi}-${c}-${si}`, x, y: c * H + H / 2, z, len: (u1 - u0) * L, yaw: w.along === 'x' ? 0 : Math.PI / 2, annex });
      }
    });
    for (const o of lintels) {
      const [x, z] = w.at((o.u0 + o.u1) / 2);
      add({ wall: wi, course: c, u0: o.u0, u1: o.u1, kind: 'lintel', opening: o, x, y: c * H + H / 2, z, len: (o.u1 - o.u0) * L, yaw: w.along === 'x' ? 0 : Math.PI / 2, annex });
    }
  }
  for (const o of w.openings) {
    const [x, z] = w.at((o.u0 + o.u1) / 2);
    add({ wall: wi, course: o.c0, u0: o.u0, u1: o.u1, kind: 'frame', frame: o.kind, opening: o, x, y: ((o.c0 + o.c1) / 2) * H, z, len: (o.u1 - o.u0) * L, yaw: w.along === 'x' ? 0 : Math.PI / 2, face: w.face, annex });
  }
}

function buildPieces({ annex }) {
  const pieces = [];
  const add = (p) => { p.id = pieces.length; pieces.push(p); return p; };
  const parts = [[MAIN_WALLS, CORNERS, false], ...(annex ? [[ANNEX_WALLS, ANNEX_CORNERS, true]] : [])];
  for (const [walls, corners, isAnnex] of parts) {
    walls.forEach((w) => wallPieces(w, WALLS.indexOf(w), isAnnex, add));
    corners.forEach(([x, z, courses, an], ci) => {
      for (let c = 0; c < courses; c++) add({ wall: -1, corner: ci + (an ? 4 : 0), course: c, kind: 'post', x, y: c * H + H / 2, z, len: D, yaw: 0, pier: `post-${ci}-${an}-${c}`, annex: an });
    });
    if (!isAnnex) for (const x of TRUSS_X) add({ wall: -1, course: COURSES, kind: 'truss', x, y: TOP, z: 0, len: 0.01, yaw: 0, annex: false });
  }
  for (const p of pieces) {
    const alongX = p.kind === 'post' || p.kind === 'truss' || WALLS[p.wall]?.along === 'x';
    const hx = (p.kind === 'truss' ? 0.006 : alongX ? p.len : D) / 2;
    const hz = (p.kind === 'truss' ? OZ * 2 : alongX ? D : p.len) / 2;
    p.rect = [p.x - hx, p.x + hx, p.z - hz, p.z + hz];
    p.supports = [];
    p.above = [];
    p.value = p.kind === 'frame' ? VALUE[p.frame] : VALUE[p.kind];
    p.scope = p.kind === 'lintel' || p.kind === 'truss' ? 'hand' : p.kind === 'frame' || p.course <= 1 ? 'own' : 'loan';
  }
  const byCourse = new Map();
  for (const p of pieces) if (STRUCT.has(p.kind)) (byCourse.get(p.course) ?? byCourse.set(p.course, []).get(p.course)).push(p);
  const overlap = (a, b) => Math.min(a.rect[1], b.rect[1]) - Math.max(a.rect[0], b.rect[0]) > 1e-4 && Math.min(a.rect[3], b.rect[3]) - Math.max(a.rect[2], b.rect[2]) > 1e-4;
  for (const p of pieces) {
    const below = byCourse.get(p.course - 1) ?? [];
    if (p.kind === 'frame') {
      // A window frame stands on the sill course below it.
      if (p.course > 0) for (const q of below) if (q.wall === p.wall && overlap(p, q)) p.supports.push(q.id);
    } else if (p.kind === 'lintel') {
      // A lintel rests on its frame and on the wall on both sides of the opening.
      p.supports.push(pieces.find((f) => f.kind === 'frame' && f.opening === p.opening).id);
      for (const q of below) if (q.wall === p.wall && (Math.abs(q.u1 - p.u0) < EPS || Math.abs(q.u0 - p.u1) < EPS)) p.supports.push(q.id);
    } else if (p.course > 0) {
      for (const q of below) if (overlap(p, q)) p.supports.push(q.id);
    }
    for (const s of p.supports) pieces[s].above.push(p.id);
  }
  // Pairs of whole bricks side by side in one course (for the double bricks).
  const pairs = [];
  for (const p of pieces) {
    if (p.kind !== 'full') continue;
    for (const q of pieces) {
      if (q.kind === 'full' && q.id > p.id && q.wall === p.wall && q.course === p.course && q.pier === p.pier && Math.abs(q.u0 - p.u1) < EPS) pairs.push([p, q]);
    }
  }
  return { pieces, pairs };
}

/** The plan and what is built. Options: { annex }. */
export class Plan {
  constructor(opts = {}) {
    this.opts = { annex: false, ...opts };
    const { pieces, pairs } = buildPieces(this.opts);
    this.pieces = pieces;
    this.pairs = pairs;
    this.filled = new Map(); // id -> { gold, order, by: 'hand' | 'crane', wobbly, skew }
    this.order = 0;
  }

  /** A new plan with other options and everything built so far (piece ids of the house stay). */
  withOptions(opts) {
    const next = new Plan({ ...this.opts, ...opts });
    for (const [id, info] of this.filled) if (id < next.pieces.length && next.pieces[id].kind === this.pieces[id].kind) next.filled.set(id, info);
    next.order = this.order;
    return next;
  }

  isFilled(id) { return this.filled.has(id); }

  /** 'solid' (everything below is there), 'wobbly' (part of it) or 'none'. */
  state(p) {
    if (!p.supports.length) return 'solid';
    let n = 0;
    for (const s of p.supports) if (this.filled.has(s)) n += 1;
    if (n === p.supports.length) return 'solid';
    return n > 0 && WOBBLY.has(p.kind) ? 'wobbly' : 'none';
  }

  /** Savings: the value of everything set by hand. */
  get saved() {
    let n = 0;
    for (const [id, info] of this.filled) if (info.by === 'hand') n += this.pieces[id].value;
    return n;
  }

  /** Places an item can go: { pieces, x, y, z, yaw, len, state } (only solid ones unless wobbly). */
  targets(kind, { wobbly = true, scope = null } = {}) {
    const ok = (p) => !this.filled.has(p.id) && (!scope || p.scope === scope);
    const group = (ps) => {
      const states = ps.map((p) => this.state(p));
      const state = states.includes('none') ? 'none' : states.includes('wobbly') ? 'wobbly' : 'solid';
      const n = ps.length;
      return { pieces: ps, x: ps.reduce((s, p) => s + p.x, 0) / n, y: ps[0].y, z: ps.reduce((s, p) => s + p.z, 0) / n, yaw: ps[0].yaw, len: ps.reduce((s, p) => s + p.len, 0) + (n - 1) * 0, state, kind };
    };
    let list = [];
    if (kind === 'single' || kind === 'gold') list = this.pieces.filter((p) => p.kind === 'full' && ok(p)).map((p) => group([p]));
    else if (kind === 'double') list = this.pairs.filter(([a, b]) => ok(a) && ok(b)).map((ab) => group(ab));
    else if (kind === 'half') list = this.pieces.filter((p) => p.kind === 'half' && ok(p)).map((p) => group([p]));
    else if (kind === 'corner') list = this.pieces.filter((p) => p.kind === 'post' && ok(p)).map((p) => group([p]));
    else if (kind === 'window' || kind === 'door') list = this.pieces.filter((p) => p.kind === 'frame' && p.frame === kind && ok(p)).map((p) => group([p]));
    else if (kind === 'lintel' || kind === 'truss') list = this.pieces.filter((p) => p.kind === kind && ok(p)).map((p) => group([p]));
    return list.filter((g) => g.state === 'solid' || (wobbly && g.state === 'wobbly'));
  }

  /** Sets the pieces of a target; returns the pieces that were wobbly. */
  place(pieces, { gold = false, by = 'hand', wobbly = false, skew = null } = {}) {
    for (const p of pieces) this.filled.set(p.id, { gold, order: ++this.order, by, wobbly: wobbly && this.state(p) === 'wobbly', skew });
    return pieces.filter((p) => this.filled.get(p.id).wobbly);
  }

  /** Wobbly pieces whose supports are all there now: they settle (returned, no longer wobbly). */
  settle() {
    const out = [];
    for (const [id, info] of this.filled) {
      if (info.wobbly && this.state(this.pieces[id]) === 'solid') { info.wobbly = false; out.push(this.pieces[id]); }
    }
    return out;
  }

  filledAbove(p, out = new Set()) {
    for (const id of p.above) {
      if (this.filled.has(id) && !out.has(id)) { out.add(id); this.filledAbove(this.pieces[id], out); }
    }
    return out;
  }

  /** Takes bricks off the top (most recent first, nothing resting on them) worth at least `value`. */
  removeTop(value) {
    const removed = [];
    let got = 0;
    while (got < value) {
      const cands = this.pieces.filter((p) => WOBBLY.has(p.kind) && this.filled.get(p.id)?.by === 'hand' && this.filledAbove(p).size === 0);
      if (!cands.length) break;
      cands.sort((a, b) => this.filled.get(b.id).order - this.filled.get(a.id).order);
      const p = cands[0];
      this.filled.delete(p.id);
      removed.push(p);
      got += p.value;
    }
    return removed;
  }

  /** Unbuilt pieces matching a filter. */
  remaining(fn) { return this.pieces.filter((p) => !this.filled.has(p.id) && fn(p)); }

  /** Highest built course of a wall (-1 if none). */
  topCourse(wi) {
    let top = -1;
    for (const id of this.filled.keys()) {
      const p = this.pieces[id];
      if (p.wall === wi && STRUCT.has(p.kind)) top = Math.max(top, p.course);
    }
    return top;
  }
}

/** Openings with their frames' centers (house-local), for decoration and the neighbors. */
export function openingFrames() {
  const out = [];
  MAIN_WALLS.forEach((w) => {
    for (const o of w.openings) {
      const [x, z] = w.at((o.u0 + o.u1) / 2);
      out.push({ kind: o.kind, wall: w.key, x, y: ((o.c0 + o.c1) / 2) * H, z, face: w.face });
    }
  });
  return out;
}
