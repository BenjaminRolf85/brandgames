// "Stein auf Stein": the measures of the house and its four walls with their openings (a door and
// two windows in front, two windows at the back, one on each side). From them come the brick
// layout in running bond (every second course shifted by half a brick, sandstone corner pieces,
// lintels over the openings) and plain wall boxes around the openings for the other wall types.
// House-local meters: origin on the foundation in the middle of the house, +y up, +z to the
// street. The measures must match blender/build_bricks.py.

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

// Openings: u along the wall in brick pitches; the hole spans courses c0..c1-1, the lintel lies in
// course c1. at(u) -> [x, z] of the wall's center line; face: yaw of the outside.
export const WALLS = [
  {
    key: 'front', len: 6, face: 0, along: 'x', off: 0, at: (u) => [-3 * L + u * L, ZH],
    openings: [{ u0: 2.5, u1: 3.5, c0: 0, c1: 5, kind: 'door' }, { u0: 0.5, u1: 1.5, c0: 2, c1: 5, kind: 'window' }, { u0: 4.5, u1: 5.5, c0: 2, c1: 5, kind: 'window' }],
  },
  {
    key: 'right', len: 4, face: Math.PI / 2, along: 'z', off: 0.5, at: (u) => [XH, 2 * L - u * L],
    openings: [{ u0: 1.5, u1: 2.5, c0: 2, c1: 5, kind: 'window' }],
  },
  {
    key: 'back', len: 6, face: Math.PI, along: 'x', off: 0, at: (u) => [-3 * L + u * L, -ZH],
    openings: [{ u0: 1, u1: 2, c0: 2, c1: 5, kind: 'window' }, { u0: 4, u1: 5, c0: 2, c1: 5, kind: 'window' }],
  },
  {
    key: 'left', len: 4, face: -Math.PI / 2, along: 'z', off: 0.5, at: (u) => [-XH, 2 * L - u * L],
    openings: [{ u0: 1.5, u1: 2.5, c0: 2, c1: 5, kind: 'window' }],
  },
];
export const CORNERS = [[-XH, ZH], [XH, ZH], [XH, -ZH], [-XH, -ZH]];

const EPS = 1e-6;
const yawOf = (w) => (w.along === 'x' ? 0 : Math.PI / 2);

/** The bricks of the four walls: [{ kind: 'full' | 'half' | 'post' | 'lintel', x, y, z, yaw, course }]. */
export function brickPieces() {
  const out = [];
  for (const w of WALLS) {
    for (let c = 0; c < COURSES; c++) {
      let segs = [[0, w.len]];
      for (const o of w.openings) {
        if (c < o.c0 || c > o.c1) continue;
        if (c === o.c1) {
          const [x, z] = w.at((o.u0 + o.u1) / 2);
          out.push({ kind: 'lintel', x, y: c * H + H / 2, z, yaw: yawOf(w), course: c });
        }
        segs = segs.flatMap(([a, b]) => {
          if (o.u1 <= a || o.u0 >= b) return [[a, b]];
          const r = [];
          if (o.u0 > a) r.push([a, o.u0]);
          if (o.u1 < b) r.push([o.u1, b]);
          return r;
        });
      }
      const off = (w.off + (c % 2) * 0.5) % 1;
      for (const [a, b] of segs) {
        for (let k = Math.floor(a - off); k + off < b - EPS; k++) {
          const u0 = Math.max(a, k + off);
          const u1 = Math.min(b, k + 1 + off);
          if (u1 - u0 < 0.25) continue;
          const [x, z] = w.at((u0 + u1) / 2);
          out.push({ kind: u1 - u0 > 0.75 ? 'full' : 'half', x, y: c * H + H / 2, z, yaw: yawOf(w), course: c });
        }
      }
    }
  }
  for (const [x, z] of CORNERS) for (let c = 0; c < COURSES; c++) out.push({ kind: 'post', x, y: c * H + H / 2, z, yaw: c % 2 ? Math.PI / 2 : 0, course: c });
  return out;
}

/**
 * Plain wall boxes around the openings: [{ wall, x, y, z, yaw, len, h, part }] with part 'col'
 * (a full-height stretch between openings), 'above' or 'below' (over and under an opening).
 */
export function wallBoxes() {
  const out = [];
  WALLS.forEach((w, wi) => {
    const box = (u0, u1, y0, y1, part) => {
      const [x, z] = w.at((u0 + u1) / 2);
      out.push({ wall: wi, x, y: (y0 + y1) / 2, z, yaw: yawOf(w), len: (u1 - u0) * L, h: y1 - y0, part, u0, u1 });
    };
    let u = 0;
    for (const o of [...w.openings].sort((a, b) => a.u0 - b.u0)) {
      if (o.u0 > u) box(u, o.u0, 0, TOP, 'col');
      box(o.u0, o.u1, o.c1 * H, TOP, 'above');
      if (o.c0 > 0) box(o.u0, o.u1, 0, o.c0 * H, 'below');
      u = o.u1;
    }
    if (u < w.len) box(u, w.len, 0, TOP, 'col');
  });
  return out;
}

/** The openings with their centers (house-local): [{ kind, wall, x, y, z, face, w, h }]. */
export function openings() {
  const out = [];
  for (const w of WALLS) {
    for (const o of w.openings) {
      const [x, z] = w.at((o.u0 + o.u1) / 2);
      out.push({ kind: o.kind, wall: w.key, x, y: ((o.c0 + o.c1) / 2) * H, z, face: w.face, w: (o.u1 - o.u0) * L, h: (o.c1 - o.c0) * H });
    }
  }
  return out;
}
