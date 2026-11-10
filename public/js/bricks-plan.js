// "Stein auf Stein": the house plan. Four walls in running bond (every second course shifted by
// half a brick) with a door and windows, corner posts at the four corners. The player sets the
// full bricks; half bats (at openings and wall ends) and the corner posts follow by themselves
// once the bricks next to them are in. A piece can only go where everything under it is built
// (bottom-up); over a door or window the frame carries it. House-local meters: origin on the
// foundation in the middle of the house, +y up, +z towards the street (front).
// The measures must match blender/build_bricks.py.

export const L = 0.072; // brick pitch along a wall (one brick plus mortar)
export const H = 0.03; // course height
export const D = 0.036; // wall thickness
export const GAP = 0.003; // mortar joint
export const COURSES = 7;
export const TOP = COURSES * H;
export const XH = 3 * L + D / 2; // side walls' center lines
export const ZH = 2 * L + D / 2; // front and back walls' center lines
export const OX = 3 * L + D; // outer faces
export const OZ = 2 * L + D;
export const FOUND = 0.014; // foundation slab (plot-local y of the house origin)
export const HOUSE_Z = -0.03; // house center on the plot
export const RIDGE = 0.15; // roof ridge above the wall tops
export const EAVE = 0.035; // roof overhang
export const TARGET_SHARE = 0.4; // allotment at 40 % of the bricks

// Openings: u along the wall in brick pitches, courses c0..c1 (inclusive).
// at(u) -> [x, z] of the wall's center line; face: yaw of the outside (frames look out).
export const WALLS = [
  {
    key: 'front', len: 6, face: 0, along: 'x', off: 0, at: (u) => [-3 * L + u * L, ZH],
    openings: [{ u0: 2.5, u1: 3.5, c0: 0, c1: 4, kind: 'door' }, { u0: 0.5, u1: 1.5, c0: 2, c1: 4, kind: 'window' }, { u0: 4.5, u1: 5.5, c0: 2, c1: 4, kind: 'window' }],
  },
  {
    key: 'right', len: 4, face: Math.PI / 2, along: 'z', off: 0.5, at: (u) => [XH, 2 * L - u * L],
    openings: [{ u0: 1.5, u1: 2.5, c0: 2, c1: 4, kind: 'window' }],
  },
  {
    key: 'back', len: 6, face: Math.PI, along: 'x', off: 0, at: (u) => [-3 * L + u * L, -ZH],
    openings: [{ u0: 1, u1: 2, c0: 2, c1: 4, kind: 'window' }, { u0: 4, u1: 5, c0: 2, c1: 4, kind: 'window' }],
  },
  {
    key: 'left', len: 4, face: -Math.PI / 2, along: 'z', off: 0.5, at: (u) => [-XH, 2 * L - u * L],
    openings: [{ u0: 1.5, u1: 2.5, c0: 2, c1: 4, kind: 'window' }],
  },
];

// Corner posts and the wall ends that touch them: [x, z, [wall, end] ...] (end 0: u = 0, 1: u = len).
const CORNERS = [
  [-XH, ZH, [0, 0], [3, 0]],
  [XH, ZH, [0, 1], [1, 0]],
  [XH, -ZH, [1, 1], [2, 1]],
  [-XH, -ZH, [2, 0], [3, 1]],
];

const EPS = 1e-6;

/** Openings of a wall, as frames: center (house-local), size and outward yaw. */
export function openingFrames() {
  const out = [];
  WALLS.forEach((w) => {
    for (const o of w.openings) {
      const [x, z] = w.at((o.u0 + o.u1) / 2);
      out.push({ kind: o.kind, wall: w.key, x, y: ((o.c0 + o.c1 + 1) / 2) * H, z, w: (o.u1 - o.u0) * L, h: (o.c1 - o.c0 + 1) * H, face: w.face });
    }
  });
  return out;
}

/** All pieces of the house with their supports. */
function buildPieces() {
  const pieces = [];
  const add = (p) => { p.id = pieces.length; pieces.push(p); return p; };
  WALLS.forEach((w, wi) => {
    for (let c = 0; c < COURSES; c++) {
      // Free segments of this course (the wall minus its openings).
      let segs = [[0, w.len]];
      for (const o of w.openings) {
        if (c < o.c0 || c > o.c1) continue;
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
        const pier = `${wi}-${c}-${si}`;
        for (let k = Math.floor(a - off); k + off < b - EPS; k++) {
          const u0 = Math.max(a, k + off);
          const u1 = Math.min(b, k + 1 + off);
          if (u1 - u0 < 0.25) continue;
          const [x, z] = w.at((u0 + u1) / 2);
          add({ wall: wi, course: c, u0, u1, kind: u1 - u0 > 0.75 ? 'full' : 'half', pier, x, y: c * H + H / 2, z, len: (u1 - u0) * L, yaw: w.along === 'x' ? 0 : Math.PI / 2 });
        }
      });
    }
  });
  CORNERS.forEach(([x, z, ...ends], ci) => {
    for (let c = 0; c < COURSES; c++) add({ wall: -1, corner: ci, ends, course: c, kind: 'post', x, y: c * H + H / 2, z, len: D, yaw: 0, pier: `post-${ci}-${c}` });
  });
  // Footprints (x0, x1, z0, z1) and what rests on what.
  for (const p of pieces) {
    const alongX = p.kind === 'post' || WALLS[p.wall].along === 'x';
    const hx = (alongX ? p.len : D) / 2;
    const hz = (alongX ? D : p.len) / 2;
    p.rect = [p.x - hx, p.x + hx, p.z - hz, p.z + hz];
    p.supports = [];
    p.above = [];
    p.touch = [];
  }
  const byCourse = Array.from({ length: COURSES }, (_, c) => pieces.filter((p) => p.course === c));
  const overlap = (a, b) => Math.min(a.rect[1], b.rect[1]) - Math.max(a.rect[0], b.rect[0]) > 1e-4 && Math.min(a.rect[3], b.rect[3]) - Math.max(a.rect[2], b.rect[2]) > 1e-4;
  for (const p of pieces) {
    if (p.course > 0) {
      for (const q of byCourse[p.course - 1]) if (overlap(p, q)) p.supports.push(q.id);
      // Over an opening that ends right below: the frame carries it, once both sides are built.
      if (p.wall >= 0) {
        for (const o of WALLS[p.wall].openings) {
          if (o.c1 !== p.course - 1 || o.u1 <= p.u0 + EPS || o.u0 >= p.u1 - EPS) continue;
          for (const q of byCourse[p.course - 1]) {
            if (q.wall === p.wall && (Math.abs(q.u1 - o.u0) < EPS || Math.abs(q.u0 - o.u1) < EPS) && !p.supports.includes(q.id)) p.supports.push(q.id);
          }
        }
      }
    }
    for (const s of p.supports) pieces[s].above.push(p.id);
  }
  // Neighbors in the same course: along the wall, and wall ends at the corner posts.
  for (const p of pieces) {
    if (p.kind === 'post') {
      for (const [wi, end] of p.ends) {
        const len = WALLS[wi].len;
        const q = byCourse[p.course].find((r) => r.wall === wi && (end === 0 ? Math.abs(r.u0) < EPS : Math.abs(r.u1 - len) < EPS));
        if (q) { p.touch.push(q.id); q.touch.push(p.id); }
      }
      continue;
    }
    for (const q of byCourse[p.course]) {
      if (q.wall === p.wall && q !== p && (Math.abs(q.u0 - p.u1) < EPS || Math.abs(q.u1 - p.u0) < EPS)) p.touch.push(q.id);
    }
  }
  const pierFull = new Map();
  for (const p of pieces) if (p.kind === 'full') pierFull.set(p.pier, true);
  for (const p of pieces) p.pierHasFull = pierFull.has(p.pier);
  return pieces;
}

/** The plan and what is built: place, fill automatically, take away from the top. */
export class Plan {
  constructor() {
    this.pieces = buildPieces();
    this.full = this.pieces.filter((p) => p.kind === 'full');
    this.totalFull = this.full.length;
    this.target = Math.round(this.totalFull * TARGET_SHARE);
    this.filled = new Map(); // id -> { gold, order }
    this.order = 0;
  }

  isFilled(id) { return this.filled.has(id); }

  supported(p) { return p.supports.every((s) => this.filled.has(s)); }

  /** Full bricks the player can set now. */
  available() { return this.full.filter((p) => !this.filled.has(p.id) && this.supported(p)); }

  /** Number of full bricks in the house (the savings). */
  get saved() {
    let n = 0;
    for (const id of this.filled.keys()) if (this.pieces[id].kind === 'full') n += 1;
    return n;
  }

  /** Sets a full brick; returns the half bats and corner posts that follow (in order). */
  place(id, gold = false) {
    this.filled.set(id, { gold, order: ++this.order });
    return this.autoFill();
  }

  autoFill() {
    const added = [];
    for (let changed = true; changed;) {
      changed = false;
      for (const p of this.pieces) {
        if (p.kind === 'full' || this.filled.has(p.id) || !this.supported(p)) continue;
        const near = p.touch.some((id) => this.filled.has(id));
        if (near || (p.kind === 'half' && !p.pierHasFull)) {
          this.filled.set(p.id, { gold: false, order: ++this.order });
          added.push(p);
          changed = true;
        }
      }
    }
    return added;
  }

  /** Pieces resting on p (directly or further up), filled ones only. */
  filledAbove(p, out = new Set()) {
    for (const id of p.above) {
      if (this.filled.has(id) && !out.has(id)) { out.add(id); this.filledAbove(this.pieces[id], out); }
    }
    return out;
  }

  /**
   * Takes up to n full bricks off the top (the most recent ones that nothing full rests on),
   * with the half bats and posts that rested on them. Returns the removed pieces.
   */
  removeTop(n) {
    const removed = [];
    for (let k = 0; k < n; k++) {
      const cands = this.full.filter((p) => this.filled.has(p.id) && [...this.filledAbove(p)].every((id) => this.pieces[id].kind !== 'full'));
      if (!cands.length) break;
      cands.sort((a, b) => this.filled.get(b.id).order - this.filled.get(a.id).order);
      const p = cands[0];
      for (const id of this.filledAbove(p)) { this.filled.delete(id); removed.push(this.pieces[id]); }
      this.filled.delete(p.id);
      removed.push(p);
    }
    return removed;
  }

  /** Everything not built yet, per wall (posts go with the side walls), for the crane. */
  remainingByWall() {
    const out = WALLS.map(() => []);
    for (const p of this.pieces) {
      if (this.filled.has(p.id)) continue;
      const wi = p.wall >= 0 ? p.wall : (p.corner === 0 || p.corner === 3 ? 3 : 1);
      out[wi].push(p);
    }
    return out;
  }

  /** Highest built course per wall (-1 if none). */
  topCourse(wi) {
    let top = -1;
    for (const id of this.filled.keys()) {
      const p = this.pieces[id];
      if (p.wall === wi) top = Math.max(top, p.course);
    }
    return top;
  }
}
