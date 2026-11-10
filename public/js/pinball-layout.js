// Campaign Pinball: the table. One source for the physics (pinball-physics.js) and the 3D build
// (pinball-visuals.js): walls, posts, slingshots, flippers, pop bumpers, drop targets, the
// advertising column, the branch office's saucer, the two ramps, the four target-group lanes,
// the shooter lane with its gate. Playfield units are meters (x to the right, y up the
// playfield); the main field spans x = -0.24 .. 0.24, the shooter lane x = 0.2445 .. 0.29.
// The six channels: poster (advertising column), social media (pop bumpers), e-mail (drop
// targets), app (right ramp), branch office (saucer) and video (left ramp). Also: four persona
// standups, a spinner on the top arch, a kickback in the left outlane, in/outlane rollovers.
// No three.js here: the module also runs in node for tests.
import { World, Ramp } from './pinball-physics.js';

export const BALL_R = 0.0145;
export const SLOPE = (7 * Math.PI) / 180; // visual tilt of the playfield
export const GRAVITY = 1.35; // along the slope (m/s^2), a little snappier than a real 6.5 degrees
export const BOARD = { x0: -0.262, x1: 0.312, y0: -0.02, y1: 1.27 }; // the playfield board (the town behind the arch included)
const RAMP_DRAG = 0.08; // the long wireforms roll freely (a short ramp has 0.25)
export const LANE_X = 0.267; // shooter lane center
export const PLUNGER_Y = 0.074; // plunger tip at rest
export const PLUNGER_TRAVEL = 0.05;
export const CHANNELS = ['poster', 'social', 'email', 'app', 'branch', 'video'];
export const GROUPS = ['young', 'families', 'founders', 'seniors'];
export const ARC = { x: 0.025, y: 0.8, r: 0.265 };
export const GUIDE_X = [-0.13, -0.065, 0, 0.065, 0.13];
export const LANE_Y = [0.855, 0.925];
/** The spinner hangs across the top arch (the orbit), between these radii at this angle. */
export const SPINNER = { a: (140 * Math.PI) / 180, r0: 0.212, r1: 0.262 };
/** The kickback in the left outlane: lane center, the plunger tip and the sensor line. */
export const KICKBACK = { x: -0.2185, tip: 0.084, y: 0.108 };
/** Rollovers: inlanes (on the way to the flippers) and outlanes (on the way to the drain). */
export const INLANE_Y = 0.3;
export const OUTLANE_Y = 0.25;

const deg = (d) => (d * Math.PI) / 180;
const mirror = (pts) => pts.map(([x, y]) => [-x, y]);
const add = (a, b, k = 1) => [a[0] + b[0] * k, a[1] + b[1] * k];

/** The ramp's mouth walls, backstop and the deflector above it (left side; mirror for right). */
function rampMouth(side) {
  const s = side;
  const d = [-0.5 * s, 0.866];
  const p = [0.866 * s, 0.5]; // across the mouth, towards the field
  const M = [-0.168 * s, 0.585];
  const l0 = add(M, p, -0.028);
  const r0 = add(M, p, 0.028);
  const l1 = add(l0, d, 0.085);
  const r1 = add(r0, d, 0.085);
  return { d, M, l0, r0, l1, r1, mouth: [add(l0, d, 0.022), add(r0, d, 0.022)] };
}

/** The ramp's 3D path [x, y, h] (left ramp; the right one is mirrored). */
function rampPath(side) {
  const m = rampMouth(1);
  const a = add(m.M, m.d, 0.022);
  const b = add(m.M, m.d, 0.064);
  // Up the outside, over the top arch into the town behind it, around the studio there, back
  // over the lanes and down onto the inlane.
  const P = [
    [a[0], a[1], 0.0], [b[0], b[1], 0.012], [-0.206, 0.7, 0.032], [-0.216, 0.8, 0.05],
    [-0.222, 0.9, 0.06], [-0.214, 1.0, 0.064], [-0.192, 1.1, 0.064], [-0.15, 1.185, 0.064],
    [-0.097, 1.195, 0.064], [-0.068, 1.12, 0.064], [-0.072, 1.0, 0.07], [-0.095, 0.9, 0.076],
    [-0.108, 0.84, 0.077], [-0.112, 0.77, 0.074], [-0.118, 0.63, 0.062], [-0.13, 0.51, 0.046],
    [-0.158, 0.44, 0.026], [-0.175, 0.392, 0.008], [-0.176, 0.378, 0.0],
  ];
  return P.map(([x, y, h]) => [x * side, y, h]);
}

/**
 * The left inlane's outer rail: from the outlane separator down onto the flipper, ending tangent
 * to the flipper's top surface at rest (so the ball rolls on smoothly) and right at its base.
 */
function inlaneCurve() {
  // The end point: where a ball cradled on the raised flipper, 3.2 cm out from the pivot, rests.
  const piv = [-0.092, 0.165];
  const up = [Math.cos(deg(28)), Math.sin(deg(28))];
  const nUp = [-up[1], up[0]];
  const s0 = 0.032;
  const rs = 0.0125 - 0.0059 * (s0 / 0.074);
  const ball = [piv[0] + up[0] * s0 + nUp[0] * (BALL_R + rs), piv[1] + up[1] * s0 + nUp[1] * (BALL_R + rs)];
  const E = [ball[0] - up[0] * (BALL_R + 0.003), ball[1] - up[1] * (BALL_R + 0.003)];
  const a = deg(-30);
  const dir = [Math.cos(a), Math.sin(a)];
  const S = [-0.197, 0.262];
  const k = (E[0] - S[0]) / dir[0];
  const C = [S[0], E[1] - k * dir[1]];
  const out = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const u = 1 - t;
    out.push([u * u * S[0] + 2 * u * t * C[0] + t * t * E[0], u * u * S[1] + 2 * u * t * C[1] + t * t * E[1]]);
  }
  return out;
}

/**
 * Builds the physics world and returns it with references to every part and the shapes the
 * 3D build needs.
 */
export function buildTable() {
  const w = new World({ ballR: BALL_R, gravity: GRAVITY });
  const walls = []; // { pts, kind } for the 3D build
  const wall = (pts, kind = 'wall', opts = {}) => {
    const segs = w.addPolyline(pts, { th: kind === 'wall' ? 0.004 : 0.003, e: kind === 'rubber' ? 0.7 : 0.45, ...opts });
    walls.push({ pts, kind });
    return segs;
  };

  // Outer wall: up the left side, the arc over the top, down the shooter lane's outer side.
  const arc = [];
  for (let i = 0; i <= 56; i++) {
    const a = Math.PI - (Math.PI * i) / 56;
    arc.push([ARC.x + Math.cos(a) * ARC.r, ARC.y + Math.sin(a) * ARC.r]);
  }
  wall([[-0.24, 0.0], ...arc, [0.29, 0.0]], 'wall');
  // Shooter lane wall and the one-way gate at its top.
  wall([[0.2445, 0.0], [0.2445, 0.8]], 'rail');
  // Slanted, so a ball that falls back onto it rolls off into the field.
  const gn = [-0.03, 0.0455];
  const gl = Math.hypot(...gn);
  const gate = w.addSegment(0.2445, 0.8, 0.29, 0.83, { th: 0.002, oneWay: [gn[0] / gl, gn[1] / gl], e: 0.3 });

  // Top lanes: five guides, four rollover lanes (the target groups).
  for (const x of GUIDE_X) {
    wall([[x, LANE_Y[0]], [x, LANE_Y[1]]], 'guide', { e: 0.5 });
  }
  const lanes = GROUPS.map((g, i) => {
    const x0 = GUIDE_X[i];
    const x1 = GUIDE_X[i + 1];
    const s = w.addSensor(x0 + 0.004, 0.888, x1 - 0.004, 0.888, { tag: 'lane', group: g, index: i });
    return { group: g, index: i, x: (x0 + x1) / 2, y: 0.888, sensor: s };
  });

  // Pop bumpers: social media.
  const bumpers = [[-0.07, 0.755], [0.07, 0.755], [0, 0.665]].map(([x, y], i) => {
    const c = w.addCircle(x, y, 0.031, { kick: 1.35, e: 0.5, tag: 'social', index: i });
    return { x, y, r: 0.031, c };
  });

  // Ramps with their mouths, backstops and the deflectors above them.
  const ramps = {};
  for (const [side, id, channel] of [[1, 'left', 'video'], [-1, 'right', 'app']]) {
    const m = rampMouth(side);
    wall([m.l0, m.l1], 'rail');
    wall([m.r0, m.r1], 'rail');
    wall([m.l1, m.r1], 'rail', { e: 0.2 });
    const outerX = side > 0 ? -0.24 : 0.2445;
    wall([[outerX, 0.735], [m.r1[0] + 0.003 * side, m.r1[1] + 0.003]], 'wall');
    const ramp = w.addRamp({ id, points: rampPath(side), mouth: m.mouth, dir: m.d, vMin: 0.9, drag: RAMP_DRAG });
    ramp.channel = channel;
    ramps[id] = { ramp, mouth: m, channel, side };
  }

  // Personas: two standup targets in front of each deflector (faces of the four target groups,
  // from the left: young people, families, founders, seniors). The deflector stays the wall
  // behind them; the standups sit just in front of it, facing the bumpers.
  const standups = [];
  for (const id of ['left', 'right']) {
    const { side, mouth: m } = ramps[id];
    const a = [side > 0 ? -0.24 : 0.2445, 0.735];
    const b = [m.r1[0] + 0.003 * side, m.r1[1] + 0.003];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
    let n = [-u[1], u[0]];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (n[0] * (0 - mid[0]) + n[1] * (0.75 - mid[1]) < 0) n = [-n[0], -n[1]];
    const ts = side > 0 ? [0.3, 0.7] : [0.7, 0.3]; // left to right across the table
    for (const tt of ts) {
      const c = [a[0] + u[0] * len * tt + n[0] * 0.0055, a[1] + u[1] * len * tt + n[1] * 0.0055];
      const h = 0.0115;
      const index = standups.length;
      const seg = w.addSegment(c[0] - u[0] * h, c[1] - u[1] * h, c[0] + u[0] * h, c[1] + u[1] * h, { th: 0.003, e: 0.5, tag: 'standup', index });
      standups.push({ x: c[0], y: c[1], nx: n[0], ny: n[1], index, seg });
    }
  }

  // Spinner over the top arch (a sensor: the flap does not stop the ball).
  const sa = [ARC.x + Math.cos(SPINNER.a) * SPINNER.r0, ARC.y + Math.sin(SPINNER.a) * SPINNER.r0];
  const sb = [ARC.x + Math.cos(SPINNER.a) * SPINNER.r1, ARC.y + Math.sin(SPINNER.a) * SPINNER.r1];
  const spinner = { x: (sa[0] + sb[0]) / 2, y: (sa[1] + sb[1]) / 2, a: SPINNER.a, sensor: w.addSensor(sa[0], sa[1], sb[0], sb[1], { tag: 'spinner' }) };

  // E-mail: a bank of three drop targets on the left, facing the right flipper.
  const drops = [0.425, 0.465, 0.505].map((y, i) => {
    const s = w.addSegment(-0.219, y - 0.0175, -0.219, y + 0.0175, { th: 0.004, e: 0.25, tag: 'email', index: i });
    return { x: -0.219, y, seg: s, down: false };
  });
  // A backing right behind the targets: a dropped target leaves no pocket for the ball.
  wall([[-0.226, 0.405], [-0.226, 0.525], ramps.left.mouth.l0], 'wall');

  // Poster: the advertising column in the middle.
  const column = { x: 0, y: 0.5, r: 0.022 };
  column.c = w.addCircle(column.x, column.y, column.r, { e: 0.6, tag: 'poster' });

  // Branch office: a little house on the right with a saucer in front of its door.
  const house = { x0: 0.214, x1: 0.2445, y0: 0.44, y1: 0.5 };
  wall([[house.x1, house.y1], [house.x0, house.y1], [house.x0, house.y0], [house.x1, house.y0]], 'house', { th: 0.004 });
  wall([[house.x0, house.y1], ramps.right.mouth.l0], 'wall');
  const kick = [-0.75, -0.66];
  const kl = Math.hypot(...kick);
  const saucer = w.addSaucer(0.193, 0.468, 0.016, { tag: 'branch', vCap: 1.9, hold: 1.0, kx: kick[0] / kl, ky: kick[1] / kl, kick: 1.15 });

  // Lower playfield, left and right: outlane, inlane, slingshot, flipper.
  const slings = [];
  const flippers = {};
  const posts = [];
  for (const side of [1, -1]) {
    const m = side > 0 ? (p) => p : mirror;
    const sx = (x) => x * side;
    // Outlane / inlane separator with a rubber post on top; the inlane curves onto the flipper.
    posts.push({ x: sx(-0.197), y: 0.355, r: 0.0065 });
    w.addCircle(sx(-0.197), 0.355, 0.0065, { e: 0.7 });
    wall(m([[-0.197, 0.355], [-0.197, 0.04]]), 'rail');
    wall(m(inlaneCurve()), 'rail');
    // Slingshot: A top, B bottom left, C bottom right; the face C-A kicks.
    const A = [sx(-0.153), 0.378];
    const B = [sx(-0.153), 0.278];
    const C = [sx(-0.105), 0.249];
    w.addSegment(A[0], A[1], B[0], B[1], { th: 0.004, e: 0.5 });
    w.addSegment(B[0], B[1], C[0], C[1], { th: 0.004, e: 0.5 });
    const face = w.addSegment(C[0], C[1], A[0], A[1], { th: 0.005, e: 0.55, kick: 1.15, kickMin: 0.28, tag: 'sling', side });
    for (const P of [A, B, C]) w.addCircle(P[0], P[1], 0.006, { e: 0.6 });
    slings.push({ side, A, B, C, face });
    const f = w.addFlipper({
      x: sx(-0.092), y: 0.165, len: 0.074, r0: 0.0125, r1: 0.0066,
      rest: side > 0 ? deg(-30) : Math.PI + deg(30), up: side > 0 ? deg(28) : Math.PI - deg(28), dir: side,
      speedUp: 40, speedDown: 20, e: 0.6,
    });
    flippers[side > 0 ? 'left' : 'right'] = f;
  }
  // Rubber posts at the lane guides' tops (visual: the guides end in posts).
  for (const x of GUIDE_X) posts.push({ x, y: LANE_Y[1], r: 0.0045 });
  // Rollover switches in the inlanes and outlanes (sensors, crossing downwards: dir -1).
  const rollovers = [];
  for (const side of [1, -1]) {
    const inX = [-0.194, -0.158].map((x) => x * side).sort((p, q) => p - q);
    const outX = (side > 0 ? [-0.2385, -0.1995] : [0.1995, 0.2425]);
    rollovers.push({ kind: 'inlane', side, x: (inX[0] + inX[1]) / 2, y: INLANE_Y, sensor: w.addSensor(inX[0], INLANE_Y, inX[1], INLANE_Y, { tag: 'inlane', side }) });
    rollovers.push({ kind: 'outlane', side, x: (outX[0] + outX[1]) / 2, y: OUTLANE_Y, sensor: w.addSensor(outX[0], OUTLANE_Y, outX[1], OUTLANE_Y, { tag: 'outlane', side }) });
  }
  // The kickback fires a ball that rolls down the left outlane back up (when lit).
  // Its flight: straight up the outlane, over the outlane post and out into the field (a guided
  // path like a ramp ride, not in the world's ramp list: nothing else can enter it).
  const kx = KICKBACK.x;
  const path = new Ramp({
    id: 'kick', mouth: [[kx - 0.02, KICKBACK.y], [kx + 0.02, KICKBACK.y]], dir: [0, 1], samples: 60,
    points: [[kx, KICKBACK.y, 0], [kx, 0.25, 0], [kx, 0.33, 0], [-0.214, 0.372, 0], [-0.202, 0.392, 0], [-0.186, 0.405, 0], [-0.172, 0.425, 0]],
  });
  const kickback = { ...KICKBACK, path, sensor: w.addSensor(kx - 0.02, KICKBACK.y, kx + 0.02, KICKBACK.y, { tag: 'kickback' }) };

  // The plunger: a moving segment across the bottom of the shooter lane.
  const plunger = w.addSegment(0.2475, PLUNGER_Y, 0.287, PLUNGER_Y, { th: 0.003, e: 0.1, fr: 0.3 });

  return { world: w, walls, gate, lanes, bumpers, ramps, drops, column, house, saucer, slings, flippers, posts, plunger, standups, spinner, rollovers, kickback };
}

/** Moves the plunger tip (pull 0 .. 1). */
export function setPlunger(t, pull) {
  const y = PLUNGER_Y - pull * PLUNGER_TRAVEL;
  const s = t.plunger;
  s.ay = y;
  s.by = y;
  s.minY = y;
  s.maxY = y;
}

/** The ball sits in the shooter lane, ready to launch. */
export function inShooterLane(b) {
  return b.mode === 'field' && b.x > 0.2445 && b.y < 0.3;
}

/** Launch speed for a pull of 0 .. 1 (weak pulls fall back below the gate). */
export const launchSpeed = (pull) => 1.05 + 1.7 * pull;
