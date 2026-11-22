// "Datenspur": the drive. Echo sits in a small open car and drives on the data highway: three
// lanes of dark glass with lane markings of flowing light, glowing edges, gantries passing
// overhead, data packets as traffic in the side lanes.
// Two ways to show an obstacle:
//   browser (fixed gate): a roadblock stands across the road under a gantry; the gantry carries
//     the field tiles and the time bar (lineage-room.js hangs the tiles there, the scene lines
//     them up). The camera stands still while the car drives up to the roadblock: the shrinking
//     gap between the car and the block is the time that is left (a lit strip on the road shows it).
//   headset (short): the road is a small model below the playing field; the car stays where it is
//     and the obstacle comes towards it (nothing moves the player's view).
//   setSpeed(v)            how fast the markings flow (m/s), eased
//   showObstacle(kind)     a barrier, a broken data crate or a firewall comes into view (browser:
//                          the new gate slides in from the distance, the car rolls back to its start)
//   setObstacle(k)         how far it still is: 1 the whole way, 0 at the car's nose
//   setGate({ G, width, top })  browser: the gate's distance from the car's start, the gantry's width
//                          and the height of its beam (the scene takes them from the tiles)
//   swerve()               the right answer: one lane of the roadblock opens, the car swings through it
//   brake()                wrong or too late: the car brakes and bumps gently, then the block clears
//   finish()               the finish gantry passes
//   rig                    the car with Echo as one object: stage 2 parks it on the interchange
//   home()                 ... and this brings it back onto the road
// Budget: about 25 draw calls and 6k triangles without Echo; markings, packets, gantries, wheels and
// speed lines are instanced; nothing is allocated per frame. All colors are tokens.
import * as THREE from 'three';
import { hex, num } from './tokens.js';
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';
import { loadEchoParts } from './echo-mascot.js';
import { EchoFace } from './echo-face.js';

const LANE = 0.36; // lane width (m); the car is about 0.3 m wide
const FAR = 5.2; // headset: how far ahead an obstacle comes into view (m)
const tint = (geo, col) => {
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
};
const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const C = (k) => new THREE.Color(hex(`xr-lineage-${k}`));
const easeOut = (k) => 1 - (1 - k) * (1 - k) * (1 - k);

/** The car's body as one mesh with vertex colors. */
export function carBodyGeometry() {
  const body = C('car');
  const trim = C('car-trim');
  const glass = C('car-glass');
  const lamp = C('car-lamp');
  const tail = C('car-tail');
  return mergeGeometries([
    tint(box(0.3, 0.07, 0.5, 0, 0.085, 0), body), // the tub
    tint(box(0.26, 0.05, 0.16, 0, 0.14, -0.15), body), // the bonnet
    tint(box(0.26, 0.045, 0.1, 0, 0.135, 0.2), body), // the boot
    tint(box(0.31, 0.02, 0.52, 0, 0.055, 0), trim), // the sill, all round
    tint(box(0.24, 0.07, 0.012, 0, 0.19, -0.065), glass), // the windscreen
    tint(box(0.2, 0.05, 0.03, 0, 0.15, 0.11), trim), // the seat's back
    tint(new THREE.SphereGeometry(0.022, 10, 8).translate(-0.1, 0.12, -0.25), lamp), tint(new THREE.SphereGeometry(0.022, 10, 8).translate(0.1, 0.12, -0.25), lamp),
    tint(box(0.06, 0.02, 0.01, -0.1, 0.12, 0.255), tail), tint(box(0.06, 0.02, 0.01, 0.1, 0.12, 0.255), tail),
  ]);
}

export function makeDrive({ calm = false, short = false } = {}) {
  const fixed = !short; // the browser: the gate stands, the car drives up to it
  const LEN = short ? 4.4 : 16; // the headset shows a short stretch, a model below the playing field, seen from the side
  const BACK = short ? 0.9 : 2; // how much road lies behind the car
  const FARD = short ? LEN - BACK - 0.75 : FAR;
  const STOP = 0.42; // browser: where the car stops in front of the block (its nose to the block)
  const group = new THREE.Group();
  group.userData.noFit = true;
  const basic = (k, extra = {}) => new THREE.MeshBasicMaterial({ color: hex(`xr-lineage-${k}`), toneMapped: false, ...extra });
  const mats = {
    road: new THREE.MeshStandardMaterial({ color: hex('xr-lineage-road'), roughness: 0.35, metalness: 0.3 }),
    edge: basic('road-edge'), mark: basic('road-mark'), packet: basic('flow'), gantry: basic('gantry'),
    car: new THREE.MeshLambertMaterial({ vertexColors: true, emissive: hex('xr-lineage-tok-glow') }),
    tire: new THREE.MeshLambertMaterial({ vertexColors: true }),
    beam: basic('car-lamp', { transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    block: new THREE.MeshLambertMaterial({ vertexColors: true, emissive: hex('xr-lineage-tok-glow'), fog: false }),
    wall: basic('obstacle', { transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    warn: basic('obstacle', { fog: false, side: THREE.DoubleSide }),
    open: basic('good-line', { transparent: true, opacity: 0 }),
    line: basic('road-mark', { transparent: true, opacity: 0.5 }),
    gap: basic('gap', { transparent: true, opacity: 0.6, depthWrite: false }),
    gapLate: basic('bad', { transparent: true, opacity: 0.55, depthWrite: false }),
    frame: basic('gantry', { fog: false }),
  };
  const add = (o) => { group.add(o); return o; };

  // the road: three lanes on a wide deck (the gantry's posts stand on its shoulders), glowing edges, markings of flowing light
  const ROADW = fixed ? num('xr-lineage-deck') : LANE * 3 + 0.08;
  add(new THREE.Mesh(new THREE.BoxGeometry(ROADW, 0.02, LEN).translate(0, -0.01, -LEN / 2 + BACK), mats.road));
  [-1, 1].forEach((s) => add(new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, LEN).translate(s * (LANE * 1.5 + 0.03), 0.006, -LEN / 2 + BACK), mats.edge)));
  const MARKS = short ? 8 : 26;
  const marks = add(new THREE.InstancedMesh(new THREE.BoxGeometry(0.016, 0.004, 0.32), mats.mark, MARKS * 2));
  marks.frustumCulled = false;
  // traffic: data packets in the side lanes, slower than the car
  const PACKETS = short ? 4 : 8;
  const packets = add(new THREE.InstancedMesh(new THREE.BoxGeometry(0.11, 0.07, 0.16), mats.packet, PACKETS));
  packets.frustumCulled = false;
  const pk = Array.from({ length: PACKETS }, (_, i) => ({ lane: i % 2 ? 1 : -1, z: -1 - i * (LEN / 9.5), v: 0.35 + (i % 3) * 0.12 }));
  // gantries overhead (two posts and a beam each, instanced): the headset's model only, the browser has the gate's gantry
  const GANTRIES = short ? 1 : 0;
  const gantries = GANTRIES ? add(new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mats.gantry, GANTRIES * 3)) : null;
  if (gantries) gantries.frustumCulled = false;
  const gz = [-LEN * 0.25];
  // speed lines beside the road, only at full motion
  const LINES = calm ? 0 : 14;
  const lines = add(new THREE.InstancedMesh(new THREE.BoxGeometry(0.006, 0.006, 0.7), mats.line, Math.max(1, LINES)));
  lines.frustumCulled = false;
  lines.count = LINES;
  const ln = Array.from({ length: LINES }, (_, i) => ({ x: (i % 2 ? 1 : -1) * (LANE * 1.5 + 0.18 + (i % 5) * 0.11), y: 0.05 + (i % 4) * 0.09, z: -i * (LEN / 14.5) }));

  // the car, with Echo at the wheel
  const car = new THREE.Group();
  const bodyGeo = carBodyGeometry();
  const body = new THREE.Mesh(bodyGeo, mats.car);
  const lean = new THREE.Group(); // body roll and pitch
  lean.add(body);
  car.add(lean);
  // four wheels with a light hub each: one instanced mesh
  const wheelGeo = mergeGeometries([
    tint(new THREE.CylinderGeometry(0.055, 0.055, 0.045, 14).rotateZ(Math.PI / 2), C('car-tire')),
    tint(box(0.05, 0.02, 0.02), C('road-edge')),
  ]);
  const wheels = new THREE.InstancedMesh(wheelGeo, mats.tire, 4);
  wheels.frustumCulled = false;
  const wheelAt = [[-0.155, -0.16], [0.155, -0.16], [-0.155, 0.17], [0.155, 0.17]];
  car.add(wheels);
  let spin = 0;
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 1.5).rotateX(-Math.PI / 2).translate(0, 0.012, -1.0), mats.beam);
  car.add(beam);
  const rig = add(new THREE.Group()); // the car as one object (stage 2 sets it on the map)
  rig.add(car);
  const echo = new THREE.Group(); // Echo sits in the open car
  echo.position.set(0, 0.12, 0.04);
  lean.add(echo);
  let face = null;
  let gone = false;
  loadEchoParts().then(({ model, face: f }) => {
    if (gone) return;
    model.scale.setScalar(0.18);
    model.rotation.y = Math.PI; // looking ahead, down the road
    echo.add(model);
    face = new EchoFace(f);
    face.setMood('focus');
  }).catch((e) => console.warn('Echo not loaded', e));

  // the obstacle: a roadblock across all three lanes, one piece per lane (three kinds); the right answer opens one lane
  const dark = C('obstacle-dark');
  const hot = C('obstacle');
  const lightC = C('tok-light');
  const segGeo = {
    barrier: mergeGeometries([
      tint(box(0.36, 0.09, 0.05, 0, 0.26, 0), hot), tint(box(0.08, 0.092, 0.055, -0.09, 0.26, 0), lightC), tint(box(0.08, 0.092, 0.055, 0.09, 0.26, 0), lightC),
      tint(box(0.36, 0.05, 0.04, 0, 0.12, 0), hot),
      tint(box(0.035, 0.32, 0.035, -0.16, 0.16, 0), dark), tint(box(0.035, 0.32, 0.035, 0.16, 0.16, 0), dark), tint(box(0.1, 0.02, 0.14, -0.16, 0.01, 0), dark), tint(box(0.1, 0.02, 0.14, 0.16, 0.01, 0), dark),
    ]),
    crate: mergeGeometries([
      tint(box(0.22, 0.22, 0.22, -0.05, 0.11, 0).rotateY(0.3), dark), tint(box(0.17, 0.16, 0.17, 0.09, 0.08, 0.06).rotateY(-0.4), hot),
      tint(box(0.23, 0.025, 0.23, -0.05, 0.23, 0).rotateY(0.3).rotateZ(0.25).translate(0.03, 0.02, 0), lightC), tint(box(0.08, 0.08, 0.08, 0.16, 0.04, -0.1), lightC),
      tint(box(0.12, 0.12, 0.12, -0.02, 0.29, 0.02).rotateY(0.5), hot),
    ]),
    firewall: mergeGeometries([
      new THREE.PlaneGeometry(0.36, 0.3).translate(0, 0.15, 0),
      ...[0.012, 0.15, 0.294].map((y) => box(0.36, 0.014, 0.03, 0, y, 0)), ...[-0.174, -0.06, 0.06, 0.174].map((x) => box(0.014, 0.3, 0.03, x, 0.15, 0)),
    ]),
  };
  const gate = new THREE.Group(); // the block and (browser) its gantry
  const obstacle = new THREE.Group();
  gate.add(obstacle);
  const segs = [-1, 0, 1].map((l) => {
    const m = new THREE.Mesh(segGeo.barrier, mats.block);
    m.position.x = l * LANE;
    if (short) m.scale.z = 2; // seen from the side and from above: a little more depth
    obstacle.add(m);
    return m;
  });
  // a warning triangle with an exclamation mark (a shape, not a color alone): above the block in the
  // headset, on both posts of the gantry in the browser
  const tri = (r, w) => [0, 1, 2].map((k) => box(r * 1.732, w, w).translate(0, -r / 2, 0).rotateZ(k * Math.PI * 2 / 3));
  const warnGeo = mergeGeometries([...tri(0.13, 0.024), box(0.026, 0.07, 0.024, 0, 0.022, 0), box(0.026, 0.022, 0.024, 0, -0.04, 0)]);
  const warn = new THREE.InstancedMesh(warnGeo, mats.warn, 2);
  warn.frustumCulled = false;
  warn.count = fixed ? 2 : 1;
  if (!fixed) {
    const q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2 - 0.4, 0)); // the headset looks at the road from the side
    warn.setMatrixAt(0, new THREE.Matrix4().compose(new THREE.Vector3(0, 0.6, 0), q0, new THREE.Vector3(1, 1, 1)));
  }
  gate.add(warn);
  // the gantry over the block (browser): two posts on the shoulders, a beam that carries the tiles and the time bar
  const frame = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mats.frame, 5);
  frame.frustumCulled = false;
  frame.visible = fixed;
  gate.add(frame);
  // the gap that is left (browser): a lit strip on the road from the car's nose to the block
  const gapStrip = new THREE.Mesh(new THREE.PlaneGeometry(LANE * 0.7, 1).rotateX(-Math.PI / 2).translate(0, 0.003, -0.5), mats.gap);
  gapStrip.visible = false;
  if (fixed) add(gapStrip);
  gate.visible = false;
  add(gate);
  // chevrons on the lane that opens (instanced arrows)
  const chev = add(new THREE.InstancedMesh(mergeGeometries([box(0.12, 0.004, 0.025).rotateY(0.6).translate(-0.045, 0.004, 0), box(0.12, 0.004, 0.025).rotateY(-0.6).translate(0.045, 0.004, 0)]), mats.open, 5));
  chev.frustumCulled = false;
  // the finish gantry
  const fin = add(new THREE.Mesh(mergeGeometries([box(0.05, 0.6, 0.05, -LANE * 1.5 - 0.04, 0.3, 0), box(0.05, 0.6, 0.05, LANE * 1.5 + 0.04, 0.3, 0), box(LANE * 3 + 0.14, 0.12, 0.05, 0, 0.6, 0)]), basic('good-line')));
  fin.visible = false;

  const st = {
    speed: 0, to: 0, dist: 0, obs: 1, lane: 0, laneTo: 0, side: 1, brake: 0, bump: 0, open: 0, fin: -1, time: 0, pass: -1, gate: 0, parked: false,
    G: 1.25, gw: 1.6, top: 0.6, carZ: 0, carFrom: 0, arrive: 1, sink: 0, gateZ: -1.25, clear: 0,
  };
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const qw = new THREE.Quaternion();
  const ax = new THREE.Vector3(1, 0, 0);
  const v = new THREE.Vector3();
  const s3 = new THREE.Vector3();

  function layout() {
    // lane markings scroll with the distance driven
    const step = LEN / MARKS;
    const off = st.dist % step;
    let i = 0;
    for (const x of [-LANE / 2, LANE / 2]) {
      for (let k = 0; k < MARKS; k++) {
        let z = BACK - 0.16 + off - k * step;
        if (z > BACK - 0.16) z -= LEN;
        marks.setMatrixAt(i++, m4.makeTranslation(x, 0.002, z));
      }
    }
    marks.instanceMatrix.needsUpdate = true;
    for (let g = 0; g < GANTRIES; g++) {
      const z = ((gz[g] + st.dist) % LEN) - (LEN - BACK);
      const W = LANE * 3 + 0.3;
      gantries.setMatrixAt(g * 3, m4.compose(v.set(-W / 2, 0.42, z), q, s3.set(0.03, 0.84, 0.03)));
      gantries.setMatrixAt(g * 3 + 1, m4.compose(v.set(W / 2, 0.42, z), q, s3.set(0.03, 0.84, 0.03)));
      gantries.setMatrixAt(g * 3 + 2, m4.compose(v.set(0, 0.84, z), q, s3.set(W, 0.035, 0.03)));
    }
    if (gantries) gantries.instanceMatrix.needsUpdate = true;
  }
  layout();

  /** The browser's gantry: posts on both shoulders up to the beam, the beam behind the tiles, feet on the deck. */
  function buildFrame() {
    const x = st.gw / 2;
    const P = 0.045;
    frame.setMatrixAt(0, m4.compose(v.set(-x, st.top / 2, -0.04), q, s3.set(P, st.top + 0.04, P)));
    frame.setMatrixAt(1, m4.compose(v.set(x, st.top / 2, -0.04), q, s3.set(P, st.top + 0.04, P)));
    frame.setMatrixAt(2, m4.compose(v.set(0, st.top, -0.04), q, s3.set(st.gw + 0.1, 0.07, 0.05)));
    frame.setMatrixAt(3, m4.compose(v.set(-x, 0.01, -0.04), q, s3.set(0.12, 0.02, 0.16)));
    frame.setMatrixAt(4, m4.compose(v.set(x, 0.01, -0.04), q, s3.set(0.12, 0.02, 0.16)));
    frame.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < 2; i++) warn.setMatrixAt(i, m4.compose(v.set((i ? 1 : -1) * x, 0.2, 0.0), q, s3.setScalar(0.7)));
    warn.instanceMatrix.needsUpdate = true;
  }
  if (fixed) buildFrame();

  const api = {
    group, car, rig, LANE, fixed,
    mini: new THREE.Mesh(bodyGeo, mats.car), // the headset's small car that drives the finished route on the board
    /** Stage 2: the car stands; on the map its headlights reach less far. */
    park(on) { st.parked = on; beam.visible = !on; if (on) { car.position.set(0, 0, 0); lean.rotation.set(0, 0, 0); car.rotation.set(0, 0, 0); } },
    /** Back onto the road (after the map). */
    home() {
      group.add(rig);
      rig.position.set(0, 0, 0);
      rig.quaternion.identity();
      rig.scale.setScalar(1);
      rig.visible = true;
      api.park(false);
      st.carZ = 0;
      st.lane = 0;
      st.laneTo = 0;
    },
    /** On the map the wheels turn while the car drives the route (m driven). */
    roll(m) { spin -= m / (0.055 * 0.4); },
    setSpeed(v2) { st.to = v2; },
    get speed() { return st.speed; },
    /** The car's nose and start in the drive's own coordinates (the scene frames them). */
    get G() { return st.G; },

    setGate({ G = st.G, width = st.gw, top = st.top } = {}) {
      if (Math.abs(G - st.G) + Math.abs(width - st.gw) + Math.abs(top - st.top) < 1e-3) return;
      st.G = G;
      st.gw = width;
      st.top = top;
      if (st.arrive >= 1) st.gateZ = -G;
      buildFrame();
    },

    showObstacle(kind) {
      segs.forEach((m) => { m.geometry = segGeo[kind] ?? segGeo.barrier; m.material = kind === 'firewall' ? mats.wall : mats.block; m.position.y = 0; });
      st.kind = kind;
      st.gate = 0;
      st.clear = 0;
      gate.visible = true;
      gate.position.y = 0;
      st.obs = 1;
      st.pass = -1;
      st.mode = null;
      st.open = 0;
      st.laneTo = 0;
      st.side = Math.random() < 0.5 ? -1 : 1;
      st.obsZ = -0.5 - FARD;
      if (fixed) { // the new gate slides in from the distance while the car rolls back to its start
        st.arrive = calm ? 1 : 0;
        st.carFrom = st.carZ;
        st.gateZ = calm ? -st.G : -st.G - 5;
        if (calm) { st.carZ = 0; st.lane = 0; }
      }
      face?.setMood('focus');
    },
    setObstacle(k) { if (st.pass < 0) st.obs = k; },
    /** Browser: the gate has arrived (the tiles can show). */
    get arrived() { return st.arrive >= 1; },

    /** The right answer: the lane beside the obstacle opens and the car swings round it. */
    swerve() {
      st.laneTo = st.side;
      st.open = 1;
      st.pass = 0;
      st.mode = 'swerve';
      face?.setMood('happy', 2);
    },

    /** Wrong or too late: brake hard, a gentle bump, then the obstacle clears and the drive goes on. */
    brake() {
      st.brake = 1;
      st.bumped = false;
      st.pass = 0;
      st.mode = 'brake';
      face?.setMood('dizzy', 1.4);
    },

    finish() { st.fin = 0; fin.visible = true; gate.visible = false; face?.setMood('happy', 4); },

    tick(dt) {
      st.time += dt;
      const target = st.parked ? 0 : st.brake > 0 ? 0.15 : st.to;
      st.speed += (target - st.speed) * Math.min(1, dt * (st.brake > 0 ? 9 : 2.2));
      st.brake = Math.max(0, st.brake - dt * 0.9);
      st.bump = Math.max(0, st.bump - dt * 2.2);
      const rush = fixed && st.arrive < 1 ? 3 : 1; // while the next gate comes, the markings race
      st.dist += st.speed * rush * dt;
      layout();
      // traffic
      pk.forEach((p, i) => {
        p.z += (st.speed * rush - p.v) * dt;
        if (p.z > BACK - 0.1) p.z = -LEN * 0.7 - Math.random() * LEN * 0.2;
        if (p.z < -LEN + BACK + 0.1) p.z = BACK - 0.2;
        // near the roadblock the packets dissolve (and none drives in the lane that has just opened)
        const oz = fixed ? st.gateZ : st.obsZ;
        let k = gate.visible ? THREE.MathUtils.clamp((Math.abs(p.z - oz) - 0.25) / 0.4, 0, 1) : 1;
        if (fixed) k = Math.min(k, THREE.MathUtils.clamp((st.gateZ - 0.3 - p.z) / 0.5, 0, 1)); // only beyond the gate: none crowds the view
        if (st.mode === 'swerve' && p.lane === st.side && p.z > (fixed ? st.gateZ - 1.5 : -1.2) && p.z < (fixed ? st.carZ + 0.7 : 0.7)) k = 0;
        packets.setMatrixAt(i, m4.compose(v.set(p.lane * LANE, 0.045, p.z), q, s3.setScalar(Math.max(k, 1e-4))));
      });
      packets.instanceMatrix.needsUpdate = true;
      ln.forEach((l, i) => {
        l.z += st.speed * 2.2 * rush * dt;
        if (l.z > BACK - 0.4) l.z = -LEN + BACK + 0.8;
        lines.setMatrixAt(i, m4.compose(v.set(l.x, l.y, l.z), q, s3.set(1, 1, Math.min(1.6, st.speed * 1.2))));
      });
      lines.instanceMatrix.needsUpdate = true;
      mats.line.opacity = Math.min(0.5, Math.max(0, st.speed * rush - 0.9) * 0.6);

      // the browser's gate and the car's way to it
      if (fixed && !st.parked) {
        if (st.arrive < 1) {
          st.arrive = Math.min(1, st.arrive + dt / 0.85);
          const e = easeOut(st.arrive);
          st.gateZ = -st.G - 5 * (1 - e);
          st.carZ = st.carFrom * (1 - Math.min(1, st.arrive * 1.3));
          st.laneTo = 0;
        } else if (gate.visible && st.pass < 0) {
          st.gateZ = -st.G;
          const want = -(1 - st.obs) * (st.G - STOP);
          st.carZ += (want - st.carZ) * Math.min(1, dt * 8);
        } else if (st.mode === 'swerve') {
          st.pass += dt;
          // it waits a moment for the lane to open if it is close, then drives through and on
          const go = st.pass < 0.25 && st.carZ < -st.G + STOP + 0.3 ? 0.3 : 1;
          st.carZ -= Math.max(1.3, st.speed * 1.3) * go * dt;
        } else if (st.mode === 'brake') {
          st.pass += dt;
          const stop = -st.G + STOP - 0.04;
          if (st.pass < 1.1) {
            st.carZ += (stop - st.carZ) * Math.min(1, dt * 7); // it rolls up to the block and stops there
            if (st.pass > 0.3 && !st.bumped) { st.bumped = true; st.bump = calm ? 0 : 1; }
          } else {
            st.clear = Math.min(1, st.clear + dt * (calm ? 50 : 3)); // then its piece of the block clears and the car rolls on
            if (st.clear >= 1) st.carZ -= 0.7 * dt;
          }
        } else if (!gate.visible) st.carZ += ((st.fin >= 0 ? -0.3 : -st.G - 1.6) - st.carZ) * Math.min(1, dt * 2); // cruising (at the finish: in front of the camera)
        if (st.carZ < -st.G - 1.6) st.carZ = -st.G - 1.6;
        gate.position.z = st.gateZ;
      }

      // the car: lane change with a little body roll, wheels that turn, a nod when braking
      if (!st.parked) {
        const dl = st.laneTo * LANE - st.lane;
        const vx = dl * Math.min(1, dt * (calm ? 30 : 4.5));
        st.lane += vx;
        car.position.x = st.lane;
        car.position.z = (fixed ? st.carZ : 0) + st.bump * 0.03;
        lean.rotation.z = calm ? 0 : THREE.MathUtils.clamp(-vx / Math.max(dt, 1e-3) * 0.35, -0.22, 0.22);
        car.rotation.y = calm ? 0 : THREE.MathUtils.clamp(-vx / Math.max(dt, 1e-3) * 0.5, -0.3, 0.3);
        lean.rotation.x = st.brake * (calm ? 0 : 0.12) + (calm ? 0 : Math.sin(st.time * 9) * 0.004 * Math.min(1, st.speed));
        spin -= Math.max(st.speed, fixed && gate.visible && st.pass < 0 ? 0.6 : 0) * dt / 0.055;
      }
      qw.setFromAxisAngle(ax, spin);
      wheelAt.forEach(([x, z], i) => wheels.setMatrixAt(i, m4.compose(v.set(x, 0.055, z), qw, s3.set(1, 1, 1))));
      wheels.instanceMatrix.needsUpdate = true;
      face?.update?.(dt);

      // the gap that is left: from the car's nose to the block, red when it is short
      if (fixed) {
        const on = gate.visible && st.arrive >= 1 && st.pass < 0 && !st.parked;
        gapStrip.visible = on;
        if (on) {
          const z0 = st.carZ - 0.27;
          const z1 = st.gateZ + 0.06;
          const len = Math.max(0.001, z0 - z1);
          gapStrip.scale.set(1, 1, len); // the strip runs from 0 to -1 along z: scaled from the car's nose
          gapStrip.position.set(0, 0, z0);
          gapStrip.material = st.obs < 0.3 ? mats.gapLate : mats.gap;
        }
      }

      // the obstacle: (headset) it comes closer; once the answer is in, it passes by (or clears away)
      if (gate.visible) {
        if (!fixed) {
          if (st.pass < 0) st.obsZ = -0.5 - st.obs * FARD;
          else {
            st.pass += dt;
            if (st.mode === 'swerve') st.obsZ += Math.max(1.6, st.speed * 1.6) * (st.pass < 0.25 && st.obsZ > -1.4 ? 0.25 : 1) * dt;
            else {
              st.obsZ += (-0.42 - st.obsZ) * Math.min(1, dt * 6); // the car stops at it
              if (st.pass > 0.25 && !st.bumped) { st.bumped = true; st.bump = calm ? 0 : 1; }
            }
          }
          gate.position.set(0, st.mode === 'brake' && st.pass > 0.6 ? -(st.pass - 0.6) * 0.9 : 0, st.obsZ);
        }
        // the lane that opens: its piece of the block sinks into the road (wrong: the car's own lane, later)
        if (st.mode === 'swerve') st.gate = Math.min(1, st.gate + dt * (calm ? 50 : 5));
        segs.forEach((m) => { m.position.y = 0; });
        segs[st.side + 1].position.y = -0.5 * st.gate * st.gate;
        if (fixed) segs[1].position.y = -0.5 * st.clear * st.clear;
        if (!fixed) warn.visible = st.mode !== 'swerve';
        if (!calm && st.kind === 'firewall') mats.wall.opacity = 0.5 + 0.15 * Math.sin(st.time * 7);
        if (!fixed && ((st.mode === 'swerve' && st.obsZ > BACK - 0.2) || (st.mode === 'brake' && st.pass > 1.2))) { gate.visible = false; st.laneTo = 0; st.open = 0; st.mode = null; }
        if (fixed && st.mode && st.carZ < st.gateZ - 0.5) { st.laneTo = 0; } // through: back into the middle lane
      }
      // the open lane: chevrons that run ahead
      st.open = Math.max(0, st.open - dt * 0.6);
      mats.open.opacity = Math.min(1, st.open * 2);
      const cz = fixed ? Math.min(st.carZ, 0) : 0;
      for (let i = 0; i < 5; i++) chev.setMatrixAt(i, m4.makeTranslation(st.side * LANE, 0.004, cz - 0.3 - ((i * 0.4 + st.time * 1.5) % 2)));
      chev.instanceMatrix.needsUpdate = true;
      if (st.fin >= 0) {
        st.fin += dt;
        fin.position.z = -Math.min(6, LEN - BACK - 0.3) + st.fin * Math.max(short ? 1.2 : 2, st.speed * (short ? 1.2 : 2.5));
        if (fin.position.z > BACK) { fin.visible = false; st.fin = -1; }
      }
    },

    /** Browser, between stages: the gate goes, the car stands at its start. */
    clearGate() { gate.visible = false; st.mode = null; st.pass = -1; st.carZ = 0; st.lane = 0; st.laneTo = 0; st.arrive = 1; },

    dispose() {
      gone = true;
      echo.clear(); // Echo's model belongs to the app
      rig.removeFromParent();
      rig.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
      Object.values(segGeo).forEach((g) => g.dispose());
      api.mini.removeFromParent();
      group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
      Object.values(mats).forEach((m) => m.dispose());
      group.removeFromParent();
    },
  };
  return api;
}
