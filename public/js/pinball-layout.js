// Campaign Pinball: the table. One source for the physics (pinball-physics.js) and the 3D build
// (pinball-visuals.js): walls, posts, slingshots, flippers, pop bumpers, drop targets, the
// advertising column, the branch office's saucer, the two ramps, the four target-group lanes,
// the shooter lane with its gate. Playfield units are meters (x to the right, y up the
// playfield); the main field spans x = -0.24 .. 0.24, the shooter lane x = 0.2445 .. 0.29.
// The six channels: poster (advertising column), social media (pop bumpers), e-mail (drop
// targets), app (right ramp), branch office (saucer) and video (left ramp).
// No three.js here: the module also runs in node for tests.
import { World } from './pinball-physics.js';

export const BALL_R = 0.0145;
export const SLOPE = (7 * Math.PI) / 180; // visual tilt of the playfield
export const GRAVITY = 1.35; // along the slope (m/s^2), a little snappier than a real 6.5 degrees
export const BOARD = { x0: -0.262, x1: 0.312, y0: -0.02, y1: 1.1 }; // the wooden playfield board
export const LANE_X = 0.267; // shooter lane center
export const PLUNGER_Y = 0.074; // plunger tip at rest
export const PLUNGER_TRAVEL = 0.05;
export const CHANNELS = ['poster', 'social', 'email', 'app', 'branch', 'video'];
export const GROUPS = ['young', 'families', 'founders', 'seniors'];
export const ARC = { x: 0.025, y: 0.8, r: 0.265 };
export const GUIDE_X = [-0.13, -0.065, 0, 0.065, 0.13];
export const LANE_Y = [0.855, 0.925];

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
  const P = [
    [a[0], a[1], 0.0], [b[0], b[1], 0.012], [-0.206, 0.7, 0.032], [-0.21, 0.78, 0.054],
    [-0.19, 0.858, 0.072], [-0.145, 0.9, 0.082], [-0.107, 0.872, 0.084], [-0.112, 0.77, 0.078],
    [-0.118, 0.63, 0.064], [-0.13, 0.51, 0.046], [-0.158, 0.44, 0.026], [-0.175, 0.392, 0.008], [-0.176, 0.378, 0.0],
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
    const ramp = w.addRamp({ id, points: rampPath(side), mouth: m.mouth, dir: m.d, vMin: 0.9 });
    ramp.channel = channel;
    ramps[id] = { ramp, mouth: m, channel, side };
  }

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
  wall([[house.x1, house.y1], [house.x0, house.y1], [house.x0, house.y0], [house.x1, house.y0]], 'wall');
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

  // The plunger: a moving segment across the bottom of the shooter lane.
  const plunger = w.addSegment(0.2475, PLUNGER_Y, 0.287, PLUNGER_Y, { th: 0.003, e: 0.1, fr: 0.3 });

  return { world: w, walls, gate, lanes, bumpers, ramps, drops, column, house, saucer, slings, flippers, posts, plunger };
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
