// Campaign Pinball: 2D ball physics on the playfield plane, in meters. x runs to the right,
// y up the playfield (away from the player); gravity pulls the ball down the slope (towards
// y = 0). Fixed sub-steps of 1 ms: even the fastest ball (VMAX) moves 5 mm per step, a third of
// its radius, so it can never tunnel through a wall, a post or a flipper.
// Colliders:
//   segments  walls and rails with a thickness (capsules), optionally one-way (gates) or kicking
//             (slingshots), or droppable (drop targets)
//   circles   posts, pop bumpers (kick the ball away), the advertising column
//   flippers  rotating tapered capsules; the contact uses the real surface velocity of the
//             flipper at the contact point (omega x r), so where the ball meets the bat decides
//             how hard and where it goes, like on a real machine
//   sensors   lines the ball rolls over (lanes), ramp mouths, saucers (capture holes)
//   ramps     3D paths above the playfield: the ball rides along them with real gravity (up the
//             ramp it slows down; too slow and it rolls back out of the mouth)
// No three.js here: the module also runs in node for tests.

export const H = 1 / 1000; // sub-step (s)
export const VMAX = 5; // m/s

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export class Ball {
  constructor(r) {
    this.r = r;
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.z = 0; // height above the playfield (ramps, the saucer)
    this.mode = 'gone'; // field | ramp | held | gone
    this.ramp = null; // { ramp, s, u }
    this.hold = null; // { saucer, t }
    this.lastHit = null;
  }

  get speed() { return Math.hypot(this.vx, this.vy); }

  place(x, y) {
    Object.assign(this, { x, y, vx: 0, vy: 0, z: 0, mode: 'field', ramp: null, hold: null });
  }
}

/** A flipper: pivot (x, y), length, radius at the pivot and at the tip. dir +1 left, -1 right. */
export class Flipper {
  constructor({ x, y, len, r0, r1, rest, up, dir, speedUp = 32, speedDown = 18, e = 0.5 }) {
    Object.assign(this, { x, y, len, r0, r1, rest, up, dir, speedUp, speedDown, e });
    this.angle = rest;
    this.omega = 0; // rad/s, counterclockwise positive
    this.pressed = false;
    this.tx = 0;
    this.ty = 0;
    this.updateTip();
  }

  updateTip() {
    this.tx = this.x + Math.cos(this.angle) * this.len;
    this.ty = this.y + Math.sin(this.angle) * this.len;
  }

  /** 0 at rest, 1 fully up. */
  get lift() { return clamp((this.angle - this.rest) / (this.up - this.rest), 0, 1); }

  step(h) {
    const want = this.pressed ? this.up : this.rest;
    const diff = want - this.angle;
    if (Math.abs(diff) < 1e-9) { this.omega = 0; return; }
    const sp = this.pressed ? this.speedUp : this.speedDown;
    const stepA = Math.sign(diff) * Math.min(Math.abs(diff), sp * h);
    this.omega = stepA / h;
    this.angle += stepA;
    this.updateTip();
  }
}

/** A 3D ramp: points [x, y, h] (h above the playfield), sampled into an arc-length table. */
export class Ramp {
  constructor({ id, points, mouth, dir, vMin = 0.9, samples = 160 }) {
    this.id = id;
    this.mouth = mouth; // [[ax, ay], [bx, by]] line across the mouth
    this.dir = dir; // unit vector into the ramp
    this.vMin = vMin;
    // Catmull-Rom through the control points.
    const P = points;
    const pts = [];
    for (let i = 0; i < samples; i++) {
      const u = (i / (samples - 1)) * (P.length - 1);
      const k = Math.min(P.length - 2, Math.floor(u));
      const t = u - k;
      const p0 = P[Math.max(0, k - 1)];
      const p1 = P[k];
      const p2 = P[k + 1];
      const p3 = P[Math.min(P.length - 1, k + 2)];
      const cr = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
      pts.push([cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1]), cr(p0[2], p1[2], p2[2], p3[2])]);
    }
    this.pts = pts;
    this.len = [0];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      this.len.push(this.len[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
    }
    this.total = this.len[this.len.length - 1];
  }

  /** Point at arc length s: [x, y, h], plus the slope dy/ds and dh/ds. */
  at(s) {
    const L = this.len;
    s = clamp(s, 0, this.total);
    let lo = 0;
    let hi = L.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (L[m] <= s) lo = m; else hi = m;
    }
    const a = this.pts[lo];
    const b = this.pts[hi];
    const seg = Math.max(1e-9, L[hi] - L[lo]);
    const k = (s - L[lo]) / seg;
    return {
      x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k, h: a[2] + (b[2] - a[2]) * k,
      dx: (b[0] - a[0]) / seg, dy: (b[1] - a[1]) / seg, dh: (b[2] - a[2]) / seg,
    };
  }
}

export class World {
  constructor({ ballR = 0.0145, gravity = 1.3, gUp = 9.7, drainY = 0.03 } = {}) {
    this.ball = new Ball(ballR);
    this.g = gravity; // along the slope (m/s^2)
    this.gUp = gUp; // across the playfield (for ramps)
    this.drainY = drainY;
    this.segments = [];
    this.circles = [];
    this.flippers = [];
    this.sensors = [];
    this.saucers = [];
    this.ramps = [];
    this.acc = 0;
    this.time = 0;
    this.roll = 0.05; // rolling resistance (1/s)
    this.listeners = [];
    this.paused = false;
  }

  on(fn) { this.listeners.push(fn); }

  emit(type, obj, info) { for (const fn of this.listeners) fn(type, obj, info); }

  addSegment(ax, ay, bx, by, opts = {}) {
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const s = {
      ax, ay, bx, by, dx, dy, len2, th: 0.003, e: 0.45, fr: 0.12, kick: 0, kickMin: 0.25,
      oneWay: null, enabled: true, tag: null, cool: 0,
      minX: Math.min(ax, bx), maxX: Math.max(ax, bx), minY: Math.min(ay, by), maxY: Math.max(ay, by),
      ...opts,
    };
    this.segments.push(s);
    return s;
  }

  /** A chain of segments through points [[x, y], ...]. */
  addPolyline(pts, opts = {}) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) out.push(this.addSegment(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], opts));
    return out;
  }

  addCircle(x, y, r, opts = {}) {
    const c = { x, y, r, e: 0.6, kick: 0, enabled: true, tag: null, cool: 0, ...opts };
    this.circles.push(c);
    return c;
  }

  addFlipper(opts) {
    const f = new Flipper(opts);
    this.flippers.push(f);
    return f;
  }

  /** A line the ball rolls over: fires 'sensor' with the crossing direction (+1 along n). */
  addSensor(ax, ay, bx, by, opts = {}) {
    const s = { ax, ay, bx, by, nx: -(by - ay), ny: bx - ax, tag: null, enabled: true, ...opts };
    const l = Math.hypot(s.nx, s.ny);
    s.nx /= l;
    s.ny /= l;
    this.sensors.push(s);
    return s;
  }

  addSaucer(x, y, r, opts = {}) {
    const s = { x, y, r, vCap: 2.2, hold: 0.9, kx: 0, ky: 1, kick: 1.2, tag: null, enabled: true, cool: 0, ...opts };
    this.saucers.push(s);
    return s;
  }

  addRamp(opts) {
    const r = new Ramp(opts);
    this.ramps.push(r);
    return r;
  }

  /** Advances the simulation by dt seconds in fixed sub-steps. */
  step(dt) {
    if (this.paused) return;
    this.acc = Math.min(this.acc + dt, 0.1);
    while (this.acc >= H) {
      this.acc -= H;
      this.sub(H);
    }
  }

  sub(h) {
    this.time += h;
    for (const f of this.flippers) f.step(h);
    const b = this.ball;
    for (const s of this.segments) if (s.cool > 0) s.cool -= h;
    for (const c of this.circles) if (c.cool > 0) c.cool -= h;
    for (const s of this.saucers) if (s.cool > 0) s.cool -= h;
    if (b.mode === 'ramp') { this.rideRamp(b, h); return; }
    if (b.mode === 'held') { this.holdBall(b, h); return; }
    if (b.mode !== 'field') return;
    const px = b.x;
    const py = b.y;
    b.vy -= this.g * h;
    const damp = 1 - this.roll * h;
    b.vx *= damp;
    b.vy *= damp;
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > VMAX) { b.vx *= VMAX / sp; b.vy *= VMAX / sp; }
    b.x += b.vx * h;
    b.y += b.vy * h;
    // Two passes, so a ball wedged between two colliders settles.
    for (let pass = 0; pass < 2; pass++) {
      for (const s of this.segments) if (s.enabled) this.hitSegment(b, s);
      for (const c of this.circles) if (c.enabled) this.hitCircle(b, c);
      for (const f of this.flippers) this.hitFlipper(b, f);
    }
    for (const s of this.sensors) if (s.enabled) this.crossSensor(b, s, px, py);
    for (const r of this.ramps) this.enterRamp(b, r, px, py);
    for (const s of this.saucers) if (s.enabled) this.catchSaucer(b, s);
    if (b.y < this.drainY && b.mode === 'field') {
      b.mode = 'gone';
      this.emit('drain', null, {});
    }
  }

  /** Reflects the ball off a surface with normal n moving at (sx, sy); returns the impact speed. */
  bounce(b, nx, ny, e, fr, sx = 0, sy = 0) {
    const rvx = b.vx - sx;
    const rvy = b.vy - sy;
    const vn = rvx * nx + rvy * ny;
    if (vn >= 0) return 0;
    // Slow contacts do not bounce: the ball rolls along (cradles on a flipper, rests on a post).
    const ee = e * clamp((-vn - 0.06) / 0.35, 0, 1);
    const tx = -ny;
    const ty = nx;
    const vt = rvx * tx + rvy * ty;
    const nvn = -ee * vn;
    // Coulomb friction: the tangential change is bounded by the normal impulse, so a ball
    // resting against a wall still rolls freely along it.
    const jt = Math.min(Math.abs(vt), fr * (1 + ee) * -vn);
    const nvt = vt - Math.sign(vt) * jt;
    b.vx = sx + nx * nvn + tx * nvt;
    b.vy = sy + ny * nvn + ty * nvt;
    return -vn;
  }

  hitSegment(b, s) {
    const rr = b.r + s.th;
    if (b.x < s.minX - rr || b.x > s.maxX + rr || b.y < s.minY - rr || b.y > s.maxY + rr) return;
    let t = s.len2 > 0 ? ((b.x - s.ax) * s.dx + (b.y - s.ay) * s.dy) / s.len2 : 0;
    t = clamp(t, 0, 1);
    const qx = s.ax + t * s.dx;
    const qy = s.ay + t * s.dy;
    let nx = b.x - qx;
    let ny = b.y - qy;
    const d2 = nx * nx + ny * ny;
    if (d2 >= rr * rr) return;
    let d = Math.sqrt(d2);
    if (s.oneWay) {
      // Gates: solid only from one side, and only once the ball is clearly on that side.
      const side = (b.x - s.ax) * s.oneWay[0] + (b.y - s.ay) * s.oneWay[1];
      if (side < b.r * 0.3 || t <= 0 || t >= 1) return;
      nx = s.oneWay[0];
      ny = s.oneWay[1];
      d = side;
    } else if (d < 1e-9) {
      nx = -s.dy;
      ny = s.dx;
      const l = Math.hypot(nx, ny);
      nx /= l;
      ny /= l;
    } else {
      nx /= d;
      ny /= d;
    }
    b.x += nx * (rr - d);
    b.y += ny * (rr - d);
    const imp = this.bounce(b, nx, ny, s.e, s.fr);
    if (imp <= 0) return;
    if (s.kick && imp > s.kickMin && s.cool <= 0) {
      // Slingshot: the rubber kicks the ball away.
      const vn = b.vx * nx + b.vy * ny;
      if (vn < s.kick) { b.vx += nx * (s.kick - vn); b.vy += ny * (s.kick - vn); }
      s.cool = 0.12;
      this.emit('kick', s, { speed: imp, nx, ny });
    } else if (s.tag && imp > 0.12 && s.cool <= 0) {
      s.cool = 0.1;
      this.emit('hit', s, { speed: imp, nx, ny });
    }
  }

  hitCircle(b, c) {
    const rr = b.r + c.r;
    const dx = b.x - c.x;
    const dy = b.y - c.y;
    if (Math.abs(dx) > rr || Math.abs(dy) > rr) return;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) return;
    const d = Math.max(1e-9, Math.sqrt(d2));
    const nx = dx / d;
    const ny = dy / d;
    b.x = c.x + nx * rr;
    b.y = c.y + ny * rr;
    const imp = this.bounce(b, nx, ny, c.e, 0.12);
    if (c.kick && c.cool <= 0 && (imp > 0.05 || b.speed < 0.3)) {
      // Pop bumper: fires whenever the ball touches its skirt and throws it away.
      const vn = b.vx * nx + b.vy * ny;
      const want = c.kick + imp * 0.25;
      if (vn < want) { b.vx += nx * (want - vn); b.vy += ny * (want - vn); }
      c.cool = 0.08;
      this.emit('bumper', c, { speed: imp, nx, ny });
    } else if (c.tag && imp > 0.1 && c.cool <= 0) {
      c.cool = 0.15;
      this.emit('hit', c, { speed: imp, nx, ny });
    }
  }

  hitFlipper(b, f) {
    const ax = f.x;
    const ay = f.y;
    const dx = f.tx - ax;
    const dy = f.ty - ay;
    const reach = f.len + f.r0 + b.r;
    if (Math.abs(b.x - ax) > reach || Math.abs(b.y - ay) > reach) return;
    const len2 = dx * dx + dy * dy;
    const t = clamp(((b.x - ax) * dx + (b.y - ay) * dy) / len2, 0, 1);
    const qx = ax + t * dx;
    const qy = ay + t * dy;
    const rad = f.r0 + (f.r1 - f.r0) * t;
    const rr = b.r + rad;
    let nx = b.x - qx;
    let ny = b.y - qy;
    const d2 = nx * nx + ny * ny;
    if (d2 >= rr * rr) return;
    const d = Math.max(1e-9, Math.sqrt(d2));
    nx /= d;
    ny /= d;
    b.x += nx * (rr - d);
    b.y += ny * (rr - d);
    // Surface velocity of the bat where the ball touches it.
    const cx = qx + nx * rad - ax;
    const cy = qy + ny * rad - ay;
    const sx = -f.omega * cy;
    const sy = f.omega * cx;
    const imp = this.bounce(b, nx, ny, f.e, 0.2, sx, sy);
    if (imp > 0.15) this.emit('flipper', f, { speed: imp, moving: Math.abs(f.omega) > 1 });
  }

  crossSensor(b, s, px, py) {
    const before = (px - s.ax) * s.nx + (py - s.ay) * s.ny;
    const after = (b.x - s.ax) * s.nx + (b.y - s.ay) * s.ny;
    if ((before < 0) === (after < 0)) return;
    // Within the sensor's extent?
    const ex = s.bx - s.ax;
    const ey = s.by - s.ay;
    const t = ((b.x - s.ax) * ex + (b.y - s.ay) * ey) / (ex * ex + ey * ey);
    if (t < 0 || t > 1) return;
    this.emit('sensor', s, { dir: after > before ? 1 : -1 });
  }

  enterRamp(b, r, px, py) {
    if (b.mode !== 'field') return;
    const [[ax, ay], [bx, by]] = r.mouth;
    const nx = r.dir[0];
    const ny = r.dir[1];
    const before = (px - ax) * nx + (py - ay) * ny;
    const after = (b.x - ax) * nx + (b.y - ay) * ny;
    if (!(before < 0 && after >= 0)) return;
    const ex = bx - ax;
    const ey = by - ay;
    const t = ((b.x - ax) * ex + (b.y - ay) * ey) / (ex * ex + ey * ey);
    if (t < -0.1 || t > 1.1) return;
    const u = b.vx * nx + b.vy * ny;
    if (u < r.vMin) return; // too slow: it bounces off the lip / rolls back by itself
    b.mode = 'ramp';
    b.ramp = { ramp: r, s: 0, u: u * 0.92 };
    this.emit('rampEnter', r, { speed: u });
  }

  rideRamp(b, h) {
    const st = b.ramp;
    const r = st.ramp;
    const p = r.at(st.s);
    // Gravity along the path: the slope of the playfield plus the height above it.
    const a = -(this.g * p.dy + this.gUp * p.dh) - 0.25 * st.u;
    st.u += a * h;
    st.s += st.u * h;
    const q = r.at(st.s);
    b.x = q.x;
    b.y = q.y;
    b.z = q.h;
    const k = Math.hypot(q.dx, q.dy) || 1;
    b.vx = (q.dx / k) * st.u;
    b.vy = (q.dy / k) * st.u;
    if (st.s <= 0 && st.u < 0) {
      // Rolled back out of the mouth.
      const m = r.at(0);
      b.mode = 'field';
      b.ramp = null;
      b.z = 0;
      b.x = m.x - r.dir[0] * 0.004;
      b.y = m.y - r.dir[1] * 0.004;
      b.vx = -r.dir[0] * Math.abs(st.u) * 0.7;
      b.vy = -r.dir[1] * Math.abs(st.u) * 0.7;
      this.emit('rampFail', r, {});
    } else if (st.s >= r.total) {
      b.mode = 'field';
      b.ramp = null;
      b.z = 0;
      const u = Math.max(0.35, st.u);
      b.vx = (q.dx / k) * u;
      b.vy = (q.dy / k) * u;
      this.emit('rampDone', r, { speed: u });
    }
  }

  catchSaucer(b, s) {
    if (s.cool > 0) return;
    const dx = b.x - s.x;
    const dy = b.y - s.y;
    if (dx * dx + dy * dy > s.r * s.r) return;
    if (b.speed > s.vCap) return; // too fast: it rolls over the hole
    b.mode = 'held';
    b.hold = { saucer: s, t: 0, x0: b.x, y0: b.y };
    b.vx = 0;
    b.vy = 0;
    this.emit('saucer', s, {});
  }

  holdBall(b, h) {
    const st = b.hold;
    const s = st.saucer;
    st.t += h;
    const k = clamp(st.t / 0.15, 0, 1);
    b.x = st.x0 + (s.x - st.x0) * k;
    b.y = st.y0 + (s.y - st.y0) * k;
    b.z = -0.008 * k;
    if (st.t >= s.hold) {
      b.mode = 'field';
      b.hold = null;
      b.z = 0;
      b.x = s.x + s.kx * (s.r + 0.002);
      b.y = s.y + s.ky * (s.r + 0.002);
      b.vx = s.kx * s.kick;
      b.vy = s.ky * s.kick;
      s.cool = 0.6;
      this.emit('kickout', s, {});
    }
  }
}
