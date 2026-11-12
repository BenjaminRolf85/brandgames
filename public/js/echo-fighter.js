// Echo, the mascot, as a fighter in the AI arena. Same interface as Fighter (fight-visuals.js):
// play(), update(), flash(), fistPos(), footPos(), chestPos(), ko/won flags. Echo is a bat, so
// its moves are its own: wing slap (punch), dive kick (kick), wing shield (block), lift and drop
// (throw) and a sonar blast from its echo rings (special). Smooth spring motion like Fighter.
import * as THREE from 'three';
import { hex } from './tokens.js';
import { radialTexture } from './robot-visuals.js';
import { POSES, projectorBeam } from './fight-visuals.js';
import { loadEchoParts, bendWing } from './echo-mascot.js';
import { EchoFace } from './echo-face.js';
import { loadGlove, makeGlove } from './fight-gloves.js';

// Facial mood for each move (see echo-face.js).
const MOOD = {
  punchWind: 'focus', punch: 'focus', kickWind: 'focus', kick: 'focus', block: 'focus', throwStep: 'focus', throwGrab: 'focus',
  throwLift: 'happy', throwSlam: 'focus', clinch: 'focus', charge: 'focus', fire: 'call',
  hit: 'surprised', hitBack: 'surprised', stagger: 'surprised', stumble: 'surprised', grabbed: 'surprised', thrownUp: 'surprised', thrownAir: 'dizzy',
  slammed: 'dizzy', kneel: 'sad', sit: 'dizzy', lie: 'dizzy', koBounce: 'dizzy', ko: 'dizzy', victory: 'happy',
};

const E = 0.36; // body width on the arena (arena units, about the robots' size class)
const HOVER = 0.4; // body center above the platform while flying
const TURN = 0.75; // turned towards the viewer so the spread wings read well
// Boxing gloves at the wrist of each wing (where a bat has its thumb), punching forwards.
const GLOVE_X = 0.4; // along the wing from the shoulder (model units)
const GLOVE_Y = 0.15; // on the leading edge
const GLOVE_SIZE = 1.8; // the glove model is about 0.13 wide; Echo's body is 1 wide
const WING_LEN = 0.74; // as in echo-mascot.js (the wing bends towards its tip)

// f forward, y up (m) · pitch (+ leans forward) · roll · yaw · wl/wr wing angle (+ up)
// fl/fr fold forward (1 = wrapped in front) · flap amount · ring glow
const P = (o) => ({ f: 0, y: 0, pitch: 0.15, roll: 0, yaw: 0, wl: 0.15, wr: 0.15, fl: 0, fr: 0, flap: 0.5, ring: 0.3, ...o });
export const ECHO_POSES = {
  guard: P({}),
  guard2: P({ y: 0.01 }),
  punchWind: P({ f: -0.04, y: 0.04, pitch: -0.1, yaw: -0.5, wr: 0.95, wl: 0.1, flap: 0.2 }),
  punch: P({ f: 0.17, pitch: 0.35, yaw: 0.55, wr: -0.15, fr: 0.95, wl: 0.3, flap: 0 }),
  kickWind: P({ f: -0.03, y: 0.17, pitch: -0.5, wl: 0.8, wr: 0.8, flap: 1 }),
  kick: P({ f: 0.2, y: -0.05, pitch: -0.95, wl: 1.1, wr: 1.1, flap: 0.3 }),
  block: P({ f: -0.04, y: -0.02, pitch: 0.1, fl: 1, fr: 1, wl: 0.2, wr: 0.2, flap: 0, ring: 0.6 }),
  duck: P({ f: -0.03, y: -0.14, pitch: 0.45, fl: 0.8, fr: 0.8, wl: -0.4, wr: -0.4, flap: 0, ring: 0.2 }),
  throwStep: P({ f: 0.04, y: 0.18, pitch: 0.3, wl: 0.6, wr: 0.6, flap: 1 }),
  throwGrab: P({ f: 0.24, y: 0.22, pitch: 0.6, fl: 0.55, fr: 0.55, flap: 0.6 }),
  throwLift: P({ f: 0.22, y: 0.4, pitch: -0.2, wl: 0.9, wr: 0.9, flap: 1 }),
  throwSlam: P({ f: 0.2, y: 0.02, pitch: 0.9, wl: -0.3, wr: -0.3, flap: 0.2 }),
  clinch: P({ f: 0.12, y: 0.05, fl: 0.7, fr: 0.7, flap: 0.4 }),
  charge: P({ f: -0.05, y: 0.12, pitch: -0.25, wl: 1.0, wr: 1.0, flap: 0.2, ring: 1.4 }),
  fire: P({ f: 0.02, y: 0.08, pitch: 0.12, wl: 0.3, wr: 0.3, fl: -0.5, fr: -0.5, flap: 0.1, ring: 2 }),
  hit: P({ f: -0.1, y: 0.04, pitch: -0.5, roll: 0.3, wl: 0.9, wr: -0.2, flap: 0.8, ring: 0 }),
  stagger: P({ f: -0.06, pitch: -0.25, flap: 0.8, ring: 0.1 }),
  hitBack: P({ f: -0.09, y: 0.06, pitch: -0.7, wl: 1.0, wr: 1.0, flap: 1, ring: 0 }),
  stumble: P({ f: -0.12, y: -0.06, pitch: -0.4, roll: -0.4, wl: 0.5, wr: -0.3, flap: 0.6, ring: 0 }),
  kneel: P({ f: -0.06, y: -0.2, pitch: 0.3, wl: -0.4, wr: -0.4, flap: 0, ring: 0.1 }),
  sit: P({ f: -0.12, y: -0.23, pitch: -0.6, wl: -0.6, wr: -0.6, flap: 0, ring: 0 }),
  lie: P({ f: -0.14, y: -0.25, pitch: -1.45, wl: -1.0, wr: -1.0, flap: 0, ring: 0 }),
  koBounce: P({ f: -0.14, y: -0.22, pitch: -1.4, wl: -0.9, wr: -0.9, flap: 0, ring: 0 }),
  ko: P({ f: -0.14, y: -0.25, pitch: -1.47, wl: -1.05, wr: -1.05, flap: 0, ring: 0 }),
  victory: P({ y: 0.2, pitch: -0.2, wl: 1.2, wr: 1.2, flap: 1, ring: 1.2 }),
  grabbed: P({ f: 0.08, y: 0.1, pitch: 0.3, wl: 0.9, wr: 0.9, flap: 1 }),
  thrownUp: P({ f: 0.14, y: 0.36, pitch: -1.0, roll: 0.5, flap: 0.4, ring: 0 }),
  thrownAir: P({ f: 0.05, y: 0.2, pitch: -2.0, roll: 1.0, flap: 0.2, ring: 0 }),
  slammed: P({ f: -0.06, y: -0.25, pitch: -1.45, wl: -1.0, wr: -1.0, flap: 0, ring: 0 }),
};
const KEYS = ['f', 'y', 'pitch', 'roll', 'yaw', 'wl', 'wr', 'fl', 'fr', 'flap', 'ring'];

function spring(x, v, target, w, zeta, dt) {
  let n = Math.ceil(dt * 240);
  if (!n) return [x, v];
  const h = dt / n;
  for (; n > 0; n--) {
    v += (w * w * (target - x) - 2 * zeta * w * v) * h;
    x += v * h;
  }
  return [x, v];
}

export class EchoFighter {
  constructor({ token, facing = 1 }) {
    this.styleKey = 'echo';
    this.token = token;
    this.facing = facing;
    this.root = new THREE.Group();
    this.body = new THREE.Group(); // faces the opponent, turned a little towards the viewer
    this.body.rotation.y = facing > 0 ? Math.PI / 2 - TURN : -Math.PI / 2 + TURN;
    this.root.add(this.body);
    this.rig = new THREE.Group(); // pose transforms
    this.body.add(this.rig);
    this.tgt = POSES.guard; // pose marker shared with Fighter (used for strike trails)
    this.etgt = ECHO_POSES.guard;
    this.cur = { ...ECHO_POSES.guard };
    this.vel = Object.fromEntries(KEYS.map((k) => [k, 0]));
    this.speed = 10;
    this.queue = [];
    this.stepT = Infinity;
    this.time = Math.random() * 10;
    this.flapPhase = 0;
    this.flashT = 0;
    this.flashMats = [];
    // Contact shadow and under-glow like the other fighters.
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), new THREE.MeshBasicMaterial({ map: radialTexture(), color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.002;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), new THREE.MeshBasicMaterial({ map: radialTexture(), color: hex(token), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.003;
    this.root.add(shadow, glow);
    this.shadow = shadow;
    this.underGlow = glow;
    this.beamUp = projectorBeam(token, 0.62);
    if (this.beamUp) this.root.add(this.beamUp);
    // Anchors for hits and effects (wing tips, feet, belly, rings) once the model is in.
    this.anchors = {};
    loadEchoParts().then((parts) => this.attach(parts)).catch((e) => console.warn('Echo fighter not loaded', e));
  }

  attach({ model, wings, ringNodes, rings, face, hatReady }) {
    if (this.disposed) return;
    this.face = new EchoFace(face);
    this.face.setMood(MOOD[this.poseName] ?? 'neutral');
    model.scale.setScalar(E);
    this.rig.add(model);
    this.model = model;
    this.wings = wings;
    this.ringNodes = ringNodes;
    this.rings = rings;
    model.traverse((o) => { if (o.isMesh && o.material?.emissive) this.flashMats.push(o.material); });
    const anchor = (parent, x, y, z) => { const a = new THREE.Object3D(); a.position.set(x, y, z); parent.add(a); return a; };
    for (const w of wings) this.anchors[w.side > 0 ? 'r' : 'l'] = anchor(w.node, w.side * 0.7, 0.16, 0);
    this.anchors.feet = anchor(model, 0, -0.5, 0.05);
    this.anchors.belly = anchor(model, 0, -0.15, 0.4);
    this.anchors.rings = anchor(model, 0, 0.85, 0.1);
    this.onModel?.(model);
    hatReady?.then((hat) => { if (hat && !this.disposed) this.onModel?.(model); });
    // Boxing gloves on the wings, in the fighter's color; slaps now land with the glove.
    loadGlove().then((gltf) => {
      if (this.disposed) return;
      this.gloves = wings.map((w) => {
        const holder = makeGlove(gltf, this.token, w.side < 0);
        holder.scale.setScalar(GLOVE_SIZE);
        w.node.add(holder);
        this.flashMats.push(...holder.userData.flashMats);
        this.anchors[w.side > 0 ? 'r' : 'l'] = holder;
        return { w, holder };
      });
      this.onModel?.(model); // the arena turns them into holograms too
    }).catch((e) => console.warn('Echo gloves', e));
  }

  play(seq) {
    this.queue = seq.map(([name, t, speed]) => ({ name, t, speed: speed ?? 14 }));
    this.next();
  }

  next() {
    const s = this.queue.shift();
    if (!s) {
      const name = this.ko ? 'ko' : this.won ? 'victory' : 'guard';
      this.setTarget(name);
      this.speed = 8;
      this.stepT = Infinity;
      return;
    }
    this.setTarget(s.name);
    this.speed = s.speed;
    this.stepT = s.t;
  }

  setTarget(name) {
    this.poseName = name;
    this.face?.setMood(MOOD[name] ?? 'neutral');
    this.tgt = POSES[name] ?? POSES.guard;
    this.etgt = ECHO_POSES[name] ?? ECHO_POSES.guard;
  }

  flash(k = 1) {
    this.flashT = Math.max(this.flashT, k);
  }

  update(dt) {
    this.time += dt;
    this.stepT -= dt;
    if (this.stepT <= 0) this.next();
    const settling = this.stepT === Infinity;
    const w0 = this.speed * 1.55;
    for (const k of KEYS) {
      const w = k === 'f' || k === 'y' ? w0 * 0.85 : k.startsWith('w') ? w0 * 1.1 : w0;
      [this.cur[k], this.vel[k]] = spring(this.cur[k], this.vel[k], this.etgt[k], w, settling ? 1 : 0.75, dt);
    }
    const c = this.cur;
    // Flying: a gentle hover bob while in the air.
    const airborne = c.y > -0.12;
    const bob = airborne ? Math.sin(this.time * 4.2) * 0.012 : 0;
    // Lunges go straight at the opponent (root x), whatever way the body is turned.
    this.body.position.x = this.facing * c.f;
    this.rig.position.set(0, HOVER + c.y + bob, 0);
    this.rig.rotation.set(c.pitch, c.yaw, c.roll, 'YXZ');
    this.shadow.material.opacity = 0.5 * THREE.MathUtils.clamp(1 - (HOVER + c.y) * 1.2, 0.25, 1);
    this.shadow.position.x = this.facing * c.f;
    this.underGlow.position.x = this.facing * c.f;
    this.underGlow.material.opacity = 0.4 + Math.sin(this.time * 3) * 0.08 + this.flashT * 0.4;
    if (this.beamUp) { this.beamUp.position.x = this.underGlow.position.x; this.beamUp.userData.tick(this.time, this.flashT); }

    // Wings: pose angle + flapping, folded forward for the shield, bent towards the tips.
    this.flapPhase += dt * (4 + c.flap * 4) * Math.PI * 2;
    const flap = Math.sin(this.flapPhase) * 0.5 * Math.max(0, c.flap);
    for (const w of this.wings ?? []) {
      const base = w.side > 0 ? c.wr : c.wl;
      const fold = w.side > 0 ? c.fr : c.fl;
      const a = base + flap;
      w.node.rotation.set(0, -w.side * fold * 1.25, w.side * a);
      bendWing(w, a * 0.55);
      // The glove follows the bent wing at its wrist and points forwards.
      const g = this.gloves?.find((x) => x.w === w)?.holder;
      if (g) {
        const ang = w.side * a * 0.55 * Math.min(1, GLOVE_X / WING_LEN) ** 1.6;
        const x0 = w.side * GLOVE_X;
        g.position.set(x0 * Math.cos(ang) - GLOVE_Y * Math.sin(ang), x0 * Math.sin(ang) + GLOVE_Y * Math.cos(ang), 0.08);
        g.rotation.set(-Math.PI / 2, 0, ang, 'ZYX');
      }
    }
    // Echo rings glow with the sonar charge.
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 6);
    this.rings?.forEach((mats, i) => {
      for (const m of mats) m.opacity = THREE.MathUtils.clamp(0.25 + c.ring * (0.55 + 0.25 * Math.sin(this.time * 9 - i)), 0, 1);
    });
    for (const r of this.ringNodes ?? []) r.scale.setScalar(1 + Math.max(0, c.ring - 1) * 0.35 * pulse);

    // Face: eyes on the opponent (dizzy when down), mood from the current move.
    this.face?.update(dt, this.root.localToWorld(new THREE.Vector3(this.facing * 0.9, 0.45, 0)));

    this.flashT = Math.max(0, this.flashT - dt * 4);
    for (const m of this.flashMats) {
      m.userData.baseEmissive ??= m.emissive.getHex();
      m.userData.baseIntensity ??= m.emissiveIntensity;
      m.emissive.setHex(this.flashT > 0.01 ? 0xffffff : m.userData.baseEmissive);
      m.emissiveIntensity = this.flashT > 0.01 ? this.flashT * 0.4 : m.userData.baseIntensity;
    }
  }

  worldOf(obj, fallbackY = 0.4) {
    if (obj) return obj.getWorldPosition(new THREE.Vector3());
    return this.root.localToWorld(new THREE.Vector3(0, fallbackY, 0));
  }

  /** Wing tips for slaps; during the sonar blast both "fists" are the echo rings. */
  fistPos(side = 'r') {
    if (this.poseName === 'fire' || this.poseName === 'charge') return this.worldOf(this.anchors.rings, 0.55);
    return this.worldOf(this.anchors[side], 0.4);
  }

  footPos() { return this.worldOf(this.anchors.feet, 0.2); }

  chestPos() { return this.worldOf(this.anchors.belly, 0.32); }
}
