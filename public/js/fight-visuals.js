// Visuals for the AI arena fighting game: articulated fighters (an original armored hero
// and three original robot designs), pose animation, the holographic arena platform,
// the special energy beam and floating damage numbers. The detailed models are in
// fighter-models.js. All colors come from design tokens.
import * as THREE from 'three';
import { hex, color, font } from './tokens.js';
import { radialTexture } from './robot-visuals.js';
import { buildHuman, buildAndroid } from './fighter-models.js';
import { attachModel } from './fighter-glb.js';
import { loadGlove, attachRigGloves } from './fight-gloves.js';

const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };

// ---------- poses ----------
// Joint rotations in radians [x, y, z]. The figure faces +z; arms and legs hang along -y.
// Shoulder x < 0 lifts the arm forwards, elbow x < 0 bends the forearm up, hip x < 0 lifts
// the leg forwards, knee x > 0 bends backwards, spine x > 0 leans forwards.
// off: [forward, up] root offset in meters (arena scale).
const GUARD = {
  hips: [0, 0.3, 0], spine: [0.06, 0, 0], chest: [0, 0.2, 0], neck: [0, 0, 0], head: [0.05, -0.45, 0],
  lShoulder: [-1.0, 0, 0.18], lElbow: [-1.95, 0, 0], rShoulder: [-0.75, 0, -0.28], rElbow: [-2.15, 0, 0],
  lHip: [-0.42, 0, 0.1], lKnee: [0.55, 0, 0], lAnkle: [-0.13, 0, 0],
  rHip: [0.32, 0, -0.1], rKnee: [0.45, 0, 0], rAnkle: [-0.77, 0, 0],
  off: [0, -0.015],
};
const pose = (over) => {
  const p = {};
  for (const k of Object.keys(GUARD)) p[k] = [...GUARD[k]];
  for (const [k, v] of Object.entries(over)) p[k] = v;
  p.turn = over.turn ?? 0; // 0 = face the opponent, 1 = face the viewer (used while falling)
  return p;
};
export const POSES = {
  guard: pose({}),
  guard2: pose({ lShoulder: [-1.1, 0, 0.16], rShoulder: [-0.82, 0, -0.26], off: [0, -0.025] }),
  punchWind: pose({ rShoulder: [-0.55, 0, -0.35], rElbow: [-2.35, 0, 0], chest: [0, 0.6, 0], hips: [0, 0.45, 0], off: [0.02, -0.02] }),
  punch: pose({ rShoulder: [-1.58, 0, 0.12], rElbow: [-0.08, 0, 0], chest: [0, -0.45, 0], hips: [0, -0.15, 0], head: [0.05, 0.1, 0], lShoulder: [-0.9, 0, 0.3], lElbow: [-2.2, 0, 0], off: [0.11, -0.02] }),
  kickWind: pose({ rHip: [-1.7, 0, 0], rKnee: [2.1, 0, 0], rAnkle: [0.3, 0, 0], lKnee: [0.35, 0, 0], spine: [-0.1, 0, 0], off: [0.03, 0] }),
  kick: pose({ rHip: [-1.45, 0, 0.05], rKnee: [0.05, 0, 0], rAnkle: [0.5, 0, 0], lKnee: [0.3, 0, 0], lHip: [-0.1, 0, 0.1], lAnkle: [-0.2, 0, 0], spine: [-0.3, 0, 0], hips: [0, 0.1, 0], lShoulder: [-0.5, 0, 0.6], lElbow: [-1.2, 0, 0], rShoulder: [-0.3, 0, -0.6], rElbow: [-1.2, 0, 0], off: [0.09, 0] }),
  block: pose({ lShoulder: [-1.45, 0, -0.42], lElbow: [-2.05, 0, 0], rShoulder: [-1.45, 0, 0.42], rElbow: [-2.05, 0, 0], head: [0.3, -0.2, 0], spine: [0.14, 0, 0], chest: [0, 0, 0], hips: [0, 0.1, 0], off: [-0.03, -0.035] }),
  // Throw (attacker): step in low with open hands, lunge and grab, lift the opponent up,
  // then bend over and slam them down.
  throwStep: pose({ lShoulder: [-0.95, 0, 0.35], lElbow: [-1.4, 0, 0], rShoulder: [-0.95, 0, -0.35], rElbow: [-1.4, 0, 0], spine: [0.22, 0, 0], chest: [0, 0, 0], hips: [0, 0.1, 0], head: [0.1, -0.1, 0], lHip: [-0.6, 0, 0.12], lKnee: [0.85, 0, 0], lAnkle: [-0.2, 0, 0], rHip: [0.25, 0, -0.1], rKnee: [0.7, 0, 0], off: [0.06, -0.04] }),
  throwGrab: pose({ lShoulder: [-1.4, 0, -0.18], lElbow: [-0.75, 0, 0], rShoulder: [-1.4, 0, 0.18], rElbow: [-0.75, 0, 0], spine: [0.28, 0, 0], chest: [0, 0, 0], hips: [0, 0, 0], head: [0.05, 0, 0], lHip: [-0.75, 0, 0.1], lKnee: [0.75, 0, 0], lAnkle: [-0.1, 0, 0], rHip: [0.45, 0, -0.1], rKnee: [0.45, 0, 0], rAnkle: [-0.5, 0, 0], off: [0.18, -0.04] }),
  throwLift: pose({ lShoulder: [-1.95, 0, -0.05], lElbow: [-1.0, 0, 0], rShoulder: [-1.95, 0, 0.05], rElbow: [-1.0, 0, 0], spine: [-0.25, 0, 0], chest: [0, 0, 0], hips: [0, 0, 0], head: [-0.35, 0, 0], lHip: [-0.9, 0, 0.2], lKnee: [1.1, 0, 0], lAnkle: [-0.2, 0, 0], rHip: [-0.1, 0, -0.2], rKnee: [1.0, 0, 0], rAnkle: [-0.3, 0, 0], off: [0.16, -0.07] }),
  throwSlam: pose({ lShoulder: [-0.75, 0, 0.15], lElbow: [-0.35, 0, 0], rShoulder: [-0.75, 0, -0.15], rElbow: [-0.35, 0, 0], spine: [0.75, 0, 0], chest: [0, 0, 0], hips: [0, 0, 0], head: [0.25, 0, 0], lHip: [-1.0, 0, 0.15], lKnee: [1.2, 0, 0], lAnkle: [-0.2, 0, 0], rHip: [-0.1, 0, -0.15], rKnee: [1.1, 0, 0], rAnkle: [-0.3, 0, 0], off: [0.17, -0.1] }),
  // Both throw: hands locked in a clinch, then they push each other apart.
  clinch: pose({ lShoulder: [-1.55, 0, -0.1], lElbow: [-1.05, 0, 0], rShoulder: [-1.55, 0, 0.1], rElbow: [-1.05, 0, 0], spine: [0.3, 0, 0], chest: [0, 0, 0], hips: [0, 0, 0], head: [0.1, 0, 0], lHip: [-0.55, 0, 0.1], lKnee: [0.6, 0, 0], rHip: [0.5, 0, -0.1], rKnee: [0.35, 0, 0], rAnkle: [-0.5, 0, 0], off: [0.1, -0.03] }),
  // Thrown (defender): pulled in, lifted and tipped backwards, through the air, slammed flat.
  grabbed: pose({ spine: [0.35, 0, 0], chest: [0, 0, 0], hips: [0, 0, 0], head: [-0.2, 0, 0], lShoulder: [-0.5, 0, 0.75], lElbow: [-0.6, 0, 0], rShoulder: [-0.5, 0, -0.75], rElbow: [-0.6, 0, 0], lHip: [-0.3, 0, 0.1], lKnee: [0.3, 0, 0], rHip: [0.3, 0, -0.1], rKnee: [0.2, 0, 0], rAnkle: [-0.4, 0, 0], off: [0.1, -0.01] }),
  thrownUp: pose({ hips: [-0.85, 0, 0], spine: [-0.1, 0, 0], chest: [0, 0, 0], head: [0.3, 0, 0], lShoulder: [-1.8, 0, 0.9], lElbow: [-0.4, 0, 0], rShoulder: [-1.8, 0, -0.9], rElbow: [-0.4, 0, 0], lHip: [-0.9, 0, 0.2], lKnee: [1.0, 0, 0], lAnkle: [0.3, 0, 0], rHip: [-0.5, 0, -0.2], rKnee: [0.6, 0, 0], rAnkle: [0.3, 0, 0], turn: 0.35, off: [0.17, 0.16] }),
  thrownAir: pose({ hips: [-1.75, 0, 0], spine: [-0.15, 0, 0], chest: [0, 0, 0], head: [0.4, 0, 0], lShoulder: [-2.4, 0, 1.0], lElbow: [-0.3, 0, 0], rShoulder: [-2.4, 0, -1.0], rElbow: [-0.3, 0, 0], lHip: [-0.6, 0, 0.25], lKnee: [0.6, 0, 0], lAnkle: [0.2, 0, 0], rHip: [-0.3, 0, -0.25], rKnee: [0.4, 0, 0], rAnkle: [0.2, 0, 0], turn: 0.7, off: [0.08, 0.08] }),
  slammed: pose({ hips: [-1.55, 0, 0], spine: [-0.1, 0, 0], chest: [0, 0, 0], head: [0.5, 0.2, 0], lShoulder: [-0.4, 0, 1.3], lElbow: [-0.3, 0, 0], rShoulder: [-0.3, 0, -1.2], rElbow: [-0.5, 0, 0], lHip: [0.05, 0, 0.3], lKnee: [0.3, 0, 0], lAnkle: [0.2, 0, 0], rHip: [-0.15, 0, -0.25], rKnee: [0.5, 0, 0], rAnkle: [0.2, 0, 0], turn: 0.8, off: [-0.08, -0.3] }),
  charge: pose({ lShoulder: [-0.45, 0, 0.55], lElbow: [-1.5, 0, 0], rShoulder: [-0.45, 0, -0.55], rElbow: [-1.5, 0, 0], spine: [0.2, 0, 0], chest: [0, 0.55, 0], lHip: [-0.6, 0, 0.2], lKnee: [0.9, 0, 0], rHip: [0.45, 0, -0.2], rKnee: [0.8, 0, 0], off: [-0.02, -0.07] }),
  fire: pose({ lShoulder: [-1.55, 0, -0.08], lElbow: [-0.05, 0, 0], rShoulder: [-1.55, 0, 0.08], rElbow: [-0.05, 0, 0], spine: [0.1, 0, 0], chest: [0, 0, 0], hips: [0, 0, 0], head: [0, 0, 0], lHip: [-0.65, 0, 0.2], lKnee: [0.65, 0, 0], off: [0.04, -0.05] }),
  // Duck: down into a deep crouch under the punch, guard high over the head.
  duck: pose({ hips: [0, 0.2, 0], spine: [0.45, 0, 0], chest: [0, 0.1, 0], head: [0.25, -0.2, 0], lShoulder: [-1.35, 0, 0.12], lElbow: [-2.2, 0, 0], rShoulder: [-1.3, 0, -0.12], rElbow: [-2.25, 0, 0], lHip: [-1.3, 0, 0.14], lKnee: [2.1, 0, 0], lAnkle: [-0.8, 0, 0], rHip: [-1.1, 0, -0.14], rKnee: [1.9, 0, 0], rAnkle: [-0.8, 0, 0], off: [-0.03, -0.14] }),
  hit: pose({ spine: [-0.5, 0, 0], head: [-0.4, -0.3, 0.2], lShoulder: [-0.35, 0, 0.7], lElbow: [-0.7, 0, 0], rShoulder: [-0.3, 0, -0.7], rElbow: [-0.7, 0, 0], off: [-0.09, -0.01] }),
  stagger: pose({ spine: [-0.22, 0, 0], head: [-0.15, -0.4, 0], off: [-0.05, -0.01] }),
  // Knockdown sequence: hit snaps back, stumble, sit down, roll onto the back, settle.
  // The legs stay on the floor because pelvis tilt and hip angles change together.
  hitBack: pose({ spine: [-0.45, 0, 0], chest: [0, 0, 0], head: [-0.5, -0.2, 0.15], lShoulder: [-1.6, 0, 0.6], lElbow: [-0.6, 0, 0], rShoulder: [-1.4, 0, -0.6], rElbow: [-0.5, 0, 0], lHip: [-0.2, 0, 0.1], lKnee: [0.3, 0, 0], rHip: [0.1, 0, -0.1], rKnee: [0.3, 0, 0], off: [-0.05, -0.01] }),
  stumble: pose({ spine: [-0.3, 0, 0], chest: [0, 0, 0], head: [-0.3, -0.1, 0.1], lShoulder: [-1.2, 0, 0.9], lElbow: [-0.4, 0, 0], rShoulder: [-1.0, 0, -0.9], rElbow: [-0.4, 0, 0], lHip: [-0.5, 0, 0.15], lKnee: [0.9, 0, 0], lAnkle: [0.2, 0, 0], rHip: [0.45, 0, -0.12], rKnee: [0.7, 0, 0], rAnkle: [-0.2, 0, 0], off: [-0.11, -0.07] }),
  sit: pose({ hips: [0, 0, 0], spine: [-0.35, 0, 0], chest: [0, 0, 0], head: [0.35, 0, 0], lShoulder: [0.55, 0, 0.35], lElbow: [-0.3, 0, 0], rShoulder: [0.55, 0, -0.35], rElbow: [-0.3, 0, 0], lHip: [-1.45, 0, 0.2], lKnee: [0.55, 0, 0], lAnkle: [0.4, 0, 0], rHip: [-1.25, 0, -0.2], rKnee: [0.95, 0, 0], rAnkle: [0.3, 0, 0], turn: 0.55, off: [-0.15, -0.275] }),
  lie: pose({ hips: [-1.5, 0, 0], spine: [-0.05, 0, 0], chest: [0, 0, 0], head: [0.25, 0.35, 0], lShoulder: [-0.2, 0, 1.2], lElbow: [-0.3, 0, 0], rShoulder: [-0.15, 0, -1.1], rElbow: [-0.5, 0, 0], lHip: [0.05, 0, 0.25], lKnee: [0.35, 0, 0], lAnkle: [0.2, 0, 0], rHip: [-0.15, 0, -0.2], rKnee: [0.7, 0, 0], rAnkle: [0.2, 0, 0], turn: 0.8, off: [-0.15, -0.29] }),
  koBounce: pose({ hips: [-1.42, 0, 0], spine: [-0.15, 0, 0], chest: [0, 0, 0], head: [0.45, 0.3, 0], lShoulder: [-0.3, 0, 1.1], lElbow: [-0.4, 0, 0], rShoulder: [-0.25, 0, -1.0], rElbow: [-0.6, 0, 0], lHip: [0, 0, 0.25], lKnee: [0.4, 0, 0], lAnkle: [0.2, 0, 0], rHip: [-0.2, 0, -0.2], rKnee: [0.8, 0, 0], rAnkle: [0.2, 0, 0], turn: 0.8, off: [-0.15, -0.28] }),
  ko: pose({ hips: [-1.52, 0, 0], spine: [-0.05, 0, 0], chest: [0, 0, 0], head: [0.15, 0.5, 0], lShoulder: [-0.1, 0, 1.3], lElbow: [-0.2, 0, 0], rShoulder: [-0.2, 0, -1.2], rElbow: [-0.4, 0, 0], lHip: [0.1, 0, 0.25], lKnee: [0.3, 0, 0], lAnkle: [0.25, 0, 0], rHip: [-0.1, 0, -0.2], rKnee: [0.6, 0, 0], rAnkle: [0.25, 0, 0], turn: 0.8, off: [-0.15, -0.29] }),
  // Heavy hit without K.O.: down on one knee, then back up.
  kneel: pose({ hips: [0.1, 0.3, 0], spine: [0.35, 0, 0], chest: [0, 0, 0], head: [0.1, -0.3, 0], lHip: [-1.35, 0, 0.1], lKnee: [1.5, 0, 0], lAnkle: [-0.1, 0, 0], rHip: [0.35, 0, -0.1], rKnee: [1.9, 0, 0], rAnkle: [0.6, 0, 0], rShoulder: [-0.7, 0, -0.25], rElbow: [-0.25, 0, 0], lShoulder: [-0.9, 0, 0.3], lElbow: [-1.6, 0, 0], off: [-0.08, -0.15] }),
  victory: pose({ rShoulder: [-2.95, 0, -0.25], rElbow: [-0.25, 0, 0], lShoulder: [-0.5, 0, 0.45], lElbow: [-1.7, 0, 0], head: [-0.25, 0, 0], spine: [-0.05, 0, 0], chest: [0, 0, 0], hips: [0, 0, 0], lHip: [-0.15, 0, 0.12], lKnee: [0.15, 0, 0], rHip: [0.1, 0, -0.12], rKnee: [0.15, 0, 0], lAnkle: [0, 0, 0], rAnkle: [-0.25, 0, 0], off: [0, 0] }),
};
const JOINTS = Object.keys(GUARD).filter((k) => k !== 'off' && k !== 'turn');

// ---------- smooth motion ----------
// Every joint angle follows its target pose like a damped spring (smooth acceleration and
// braking instead of a snap). Overlapping action: the hips lead, the trunk and limbs follow,
// the head trails behind. Strikes are slightly underdamped (a little follow-through),
// settling back into the guard is critically damped (no wobble).
const JOINT_RATE = {
  hips: 1.2, spine: 1.1, chest: 1.05, neck: 0.85, head: 0.7,
  lShoulder: 1, rShoulder: 1, lElbow: 1.05, rElbow: 1.05,
  lHip: 1.05, rHip: 1.05, lKnee: 0.95, rKnee: 0.95, lAnkle: 0.85, rAnkle: 0.85,
};
const JOINT_DAMP = { head: 0.6, neck: 0.72 };
const RATE_TO_SPRING = 1.55; // pose "speed" (old exponential rate) -> spring frequency

/**
 * Advances a damped spring (position x, velocity v) towards a target that itself glides
 * (g, so the acceleration also builds up smoothly); returns [x, v, g].
 */
function spring(x, v, g, target, w, zeta, dt) {
  let n = Math.ceil(dt * 240);
  if (!n) return [x, v, g];
  const h = dt / n;
  const w2 = w * w;
  const glide = 1 - Math.exp(-h * w * 2.2);
  for (; n > 0; n--) {
    g += (target - g) * glide;
    v += (w2 * (g - x) - 2 * zeta * w * v) * h;
    x += v * h;
  }
  return [x, v, g];
}

// ---------- the fighter ----------

const STYLES = {
  hero: { scale: 0.4, bulk: 1, head: 'helmet' },
  santa: { scale: 0.4, bulk: 1.1, head: 'helmet' }, // Christmas: the human fighter as Santa (fighter-santa.glb)
  light: { scale: 0.38, bulk: 0.9, head: 'visor' },
  heavy: { scale: 0.43, bulk: 1.15, head: 'block' },
  boss: { scale: 0.47, bulk: 1.15, head: 'crown' },
};

export class Fighter {
  /**
   * style: hero | santa | light | heavy | boss. token: accent color token. facing: +1 faces +x,
   * -1 faces -x.
   */
  constructor({ style = 'hero', token, facing = 1 }) {
    this.style = STYLES[style] ?? STYLES.hero;
    this.styleKey = style;
    this.human = style === 'hero' || style === 'santa';
    this.token = token;
    this.facing = facing;
    this.root = new THREE.Group(); // positioned on the arena
    this.body = new THREE.Group(); // scaled figure, faces +z locally
    this.body.scale.setScalar(this.style.scale);
    this.body.rotation.y = facing > 0 ? Math.PI / 2 : -Math.PI / 2;
    this.root.add(this.body);
    this.j = {};
    this.cur = {};
    this.vel = {};
    this.glide = {};
    this.offV = { f: 0, y: 0 };
    this.offG = { f: 0, y: -0.015 };
    this.turnV = 0;
    this.turnG = 0;
    this.idleW = 1; // weight of the idle layer (bounce, breathing, weight shift)
    this.tgt = POSES.guard;
    this.speed = 10;
    this.off = { f: 0, y: 0 };
    this.turn = 0;
    this.queue = [];
    this.time = Math.random() * 10;
    this.flashT = 0;
    this.build();
    for (const k of JOINTS) {
      this.cur[k] = [...POSES.guard[k]];
      this.vel[k] = [0, 0, 0];
      this.glide[k] = [...POSES.guard[k]];
    }
    this.apply();
    // Detailed skinned model from Blender; the procedural body stays as fallback until it loads
    // (its boxing gloves come with it). The robots get their gloves on their forearms.
    if (style === 'hero') attachModel(this, 'assets/models/fighter-human.glb');
    else if (style === 'santa') attachModel(this, 'assets/models/fighter-santa.glb', { height: 1.95 });
    else {
      loadGlove().then((gltf) => {
        if (this.disposed) return;
        attachRigGloves(this, gltf);
        this.onModel?.(); // the arena turns the gloves into holograms too
      }).catch((e) => console.warn('gloves', e));
    }
  }

  /** Detailed original models: a human fighter or a chrome combat android (fighter-models.js). */
  build() {
    if (this.human) buildHuman(this);
    else buildAndroid(this, this.styleKey);

    // Soft contact shadow and an under-glow in the fighter's color
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshBasicMaterial({ map: radialTexture(), color: 0x000000, transparent: true, opacity: 0.6, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.002;
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), new THREE.MeshBasicMaterial({ map: radialTexture(), color: hex(this.token), opacity: 0.55, ...additive }));
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.003;
    this.root.add(shadow, glow);
    this.shadow = shadow;
    this.underGlow = glow;
  }

  /** Plays a sequence of [poseName, seconds, speed] steps, then returns to guard. */
  play(seq) {
    this.queue = seq.map(([name, t, speed]) => ({ name, t, speed: speed ?? 14 }));
    this.next();
  }

  next() {
    const s = this.queue.shift();
    if (!s) { this.tgt = this.ko ? POSES.ko : this.won ? POSES.victory : POSES.guard; this.speed = 8; this.stepT = Infinity; return; }
    this.tgt = POSES[s.name];
    this.speed = s.speed;
    this.stepT = s.t;
  }

  /** Brief bright flash (hit) or colored glow. */
  flash(k = 1) {
    this.flashT = Math.max(this.flashT, k);
  }

  update(dt) {
    this.time += dt;
    this.stepT -= dt;
    if (this.stepT <= 0) this.next();
    const settling = this.stepT === Infinity; // back to guard / resting pose
    const w0 = this.speed * RATE_TO_SPRING;
    const zeta = settling ? 1 : 0.78;
    for (const name of JOINTS) {
      const c = this.cur[name];
      const v = this.vel[name];
      const g = this.glide[name];
      const t = this.tgt[name];
      const w = w0 * JOINT_RATE[name];
      const z = JOINT_DAMP[name] ?? zeta;
      for (let i = 0; i < 3; i++) [c[i], v[i], g[i]] = spring(c[i], v[i], g[i], t[i], w, z, dt);
    }
    // The whole body moves a touch slower than the limbs (weight).
    [this.off.f, this.offV.f, this.offG.f] = spring(this.off.f, this.offV.f, this.offG.f, this.tgt.off[0], w0 * 0.85, zeta, dt);
    [this.off.y, this.offV.y, this.offG.y] = spring(this.off.y, this.offV.y, this.offG.y, this.tgt.off[1], w0 * 0.85, 1, dt);
    [this.turn, this.turnV, this.turnG] = spring(this.turn, this.turnV, this.turnG, this.tgt.turn ?? 0, w0 * 0.8, 1, dt);
    // The idle layer fades in and out instead of switching (no pop when a move starts).
    const idle = this.tgt === POSES.guard && !this.ko && !this.won ? 1 : 0;
    this.idleW += (idle - this.idleW) * (1 - Math.exp(-dt * (idle ? 3 : 9)));
    this.apply();
    // Breathing core, flashes
    this.flashT = Math.max(0, this.flashT - dt * 4);
    // Hit flash: the robots light up white, the human only gets a soft glow (no white ghost).
    const flashMax = this.human ? 0.28 : 0.9;
    for (const m of this.flashMats) {
      m.emissive.setHex(this.flashT > 0.01 ? 0xffffff : (m.userData.baseEmissive ??= m.emissive.getHex()));
      m.emissiveIntensity = this.flashT > 0.01 ? this.flashT * flashMax : (m.userData.baseIntensity ??= m.emissiveIntensity);
    }
    this.core.scale.setScalar(1 + Math.sin(this.time * 4) * 0.12 + this.flashT * 0.5);
    if (this.halo) { this.halo.rotation.z += dt * 2; this.halo.position.y = 0.32 + Math.sin(this.time * 2) * 0.02; }
    this.underGlow.material.opacity = 0.45 + Math.sin(this.time * 3) * 0.1 + this.flashT * 0.4;
  }

  apply() {
    for (const name of JOINTS) {
      const c = this.cur[name];
      this.j[name].rotation.set(c[0], c[1], c[2]);
    }
    // Idle layer: a light boxer's bounce, breathing, a slow weight shift and a watchful head.
    const w = this.idleW;
    const t = this.time;
    const robot = !this.human;
    const bounce = Math.sin(t * 5) * w;
    const sway = Math.sin(t * 1.25) * w;
    const breath = Math.sin(t * 2.2) * w;
    const j = this.j;
    j.hips.position.y = 0.98 + bounce * (robot ? 0.008 : 0.012);
    j.hips.rotation.z += sway * 0.035;
    j.chest.rotation.z -= sway * 0.03;
    j.spine.rotation.x += breath * 0.022;
    j.lShoulder.rotation.x += bounce * 0.04;
    j.rShoulder.rotation.x -= bounce * 0.04;
    j.lElbow.rotation.x += Math.sin(t * 5 + 0.8) * 0.045 * w;
    j.rElbow.rotation.x -= Math.sin(t * 5 + 0.8) * 0.045 * w;
    // Knees give a little when the hips dip (feet stay planted).
    j.lKnee.rotation.x -= bounce * 0.03;
    j.rKnee.rotation.x -= bounce * 0.03;
    j.head.rotation.y += (Math.sin(t * 0.9) * 0.07 + Math.sin(t * 2.3 + 1) * 0.025) * w;
    j.head.rotation.x += Math.sin(t * 1.7) * 0.03 * w;
    // Pose offsets are authored for a 0.33 scale figure; scale them with the figure.
    const k = this.style.scale / 0.33;
    this.body.position.set(this.off.f * this.facing * k, this.off.y * k, 0);
    // Falling: turn towards the viewer so the body lands lengthwise on the platform.
    const base = this.facing > 0 ? Math.PI / 2 : -Math.PI / 2;
    this.body.rotation.y = base * (1 - this.turn);
    this.drive?.(); // detailed Blender model follows the joint rig
  }

  worldOf(obj) {
    return obj.getWorldPosition(new THREE.Vector3());
  }

  fistPos(side = 'r') { return this.worldOf(this[`${side}Fist`]); }
  footPos(side = 'r') { return this.worldOf(this[`${side}Foot`]); }
  chestPos() { return this.worldOf(this.core); }
}

// ---------- arena ----------

const boardFragment = /* glsl */ `
  uniform vec3 uLeft;
  uniform vec3 uRight;
  uniform vec3 uBoardA;
  uniform vec3 uBoardB;
  uniform vec3 uGrid;
  uniform float uTime;
  uniform vec4 uHits[4];   // x, start time, strength, side (0 left, 1 right)
  uniform float uFlash;
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - 0.5) * 2.0 * 1.06;   // 1.0 = playing radius
    float r = length(p);
    float ang = atan(p.y, p.x);
    // Center disc, two rings of 12 alternating segments (outer ring offset), outer band.
    float ring = r < 0.27 ? 0.0 : r < 0.62 ? 1.0 : r < 0.95 ? 2.0 : 3.0;
    float a = (ang / 6.2831853 + 0.5) * 12.0 + (ring == 2.0 ? 0.5 : 0.0);
    float seg = floor(a);
    float checker = mod(seg + ring, 2.0);
    vec3 tone = mix(uBoardA, uBoardB, checker);
    if (ring == 0.0) tone = uBoardB * 0.8;
    if (ring == 3.0) tone = uBoardA * 0.7;
    float dA = abs(fract(a) - 0.5) * 2.0;                          // 1 at segment borders
    float lineA = (ring == 1.0 || ring == 2.0) ? smoothstep(1.0 - 0.012 / max(r, 0.1), 1.0, dA) : 0.0;
    float dR = min(min(abs(r - 0.27), abs(r - 0.62)), abs(r - 0.95));
    float lineR = 1.0 - smoothstep(0.0, 0.007, dR);
    float line = max(lineA, lineR);
    vec3 side = mix(uLeft, uRight, smoothstep(-0.12, 0.12, p.x));
    float pulse = 0.5 + 0.5 * sin(r * 10.0 - uTime * 1.6);
    vec3 col = tone + side * 0.06 + uGrid * line * (0.55 + 0.25 * pulse);
    col += uGrid * exp(-r * r * 30.0) * 0.35;                      // projector in the center
    for (int i = 0; i < 4; i++) {
      vec4 h = uHits[i];
      float age = uTime - h.y;
      if (h.z <= 0.0 || age < 0.0 || age > 1.0) continue;
      float d = length(p - vec2(h.x, 0.0));
      float band = exp(-pow((d - age * 2.2) / 0.08, 2.0)) * (1.0 - age) * h.z;
      col += mix(uLeft, uRight, h.w) * band * (0.6 + line * 1.5);
    }
    col += uGrid * uFlash * 0.25;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** Holographic arena: hex floor with impact ripples, rim, pylons and floating rings. */
/**
 * The holo game table: a round board (center, two rings of alternating segments, glowing
 * separators) on a thick metal table top with a rim of indicator lights, standing on a
 * pedestal down to the real floor. The fighters are projected onto it as holograms.
 */
export function makeArena(radius, leftToken, rightToken) {
  const g = new THREE.Group();
  const metal = (token, rough = 0.38) => new THREE.MeshStandardMaterial({ color: hex(token), metalness: 0.75, roughness: rough });

  // Table top: board inset in a thick rim
  const top = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.13, radius * 1.1, 0.07, 96), metal('xr-fight-table'));
  top.position.y = -0.036;
  const lip = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.075, 0.022, 14, 128), metal('xr-fight-table-rim', 0.28));
  lip.rotation.x = Math.PI / 2;
  lip.position.y = 0.004;
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.1, radius * 0.92, 0.07, 96), metal('xr-fight-table'));
  skirt.position.y = -0.105;
  const glowLine = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.112, 0.0035, 6, 128), new THREE.MeshBasicMaterial({ color: hex('xr-fight-holo') }));
  glowLine.rotation.x = Math.PI / 2;
  glowLine.position.y = -0.055;
  g.add(top, lip, skirt, glowLine);

  // Indicator lights around the rim
  const lights = [];
  const lightGeo = new THREE.BoxGeometry(0.022, 0.008, 0.012);
  const tokens = ['xr-fight-holo', 'xr-fight-energy', 'xr-fight-holo', leftToken, 'xr-fight-holo', rightToken];
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const m = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({ color: hex(tokens[i % tokens.length]), transparent: true }));
    m.position.set(Math.cos(a) * radius * 1.128, -0.03, Math.sin(a) * radius * 1.128);
    m.rotation.y = -a;
    g.add(m);
    lights.push(m);
  }

  // The board
  const uniforms = {
    uLeft: { value: new THREE.Color(hex(leftToken)) },
    uRight: { value: new THREE.Color(hex(rightToken)) },
    uBoardA: { value: new THREE.Color(hex('xr-fight-board-a')) },
    uBoardB: { value: new THREE.Color(hex('xr-fight-board-b')) },
    uGrid: { value: new THREE.Color(hex('xr-fight-holo')) },
    uTime: { value: 0 },
    uHits: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, -10, 0, 0)) },
    uFlash: { value: 0 },
  };
  const floor = new THREE.Mesh(new THREE.CircleGeometry(radius * 1.06, 96), new THREE.ShaderMaterial({
    uniforms,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: boardFragment,
  }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.001;
  g.add(floor);

  // Pedestal down to the real floor (rebuilt when the floor height is known)
  const pedestalMat = metal('xr-fight-table', 0.45);
  pedestalMat.name = 'ArenaPedestal'; // sheltered by the table top: no snow in winter (fight.js)
  const pedestal = new THREE.Mesh(new THREE.BufferGeometry(), pedestalMat);
  const footRing = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.5, 0.004, 6, 96), new THREE.MeshBasicMaterial({ color: hex('xr-fight-holo') }));
  footRing.rotation.x = Math.PI / 2;
  g.add(pedestal, footRing);
  let pedestalH = 0;
  const setFloor = (yLocal) => {
    const h = Math.max(0.2, -yLocal - 0.14);
    if (Math.abs(h - pedestalH) < 0.02) return;
    pedestalH = h;
    const R = radius;
    const pts = [[0.001, 0], [R * 0.62, 0], [R * 0.44, -0.05], [R * 0.3, -0.12], [R * 0.24, -0.3], [R * 0.22, -h + 0.16],
      [R * 0.3, -h + 0.1], [R * 0.52, -h + 0.03], [R * 0.56, -h], [0.001, -h]].map(([r, y]) => new THREE.Vector2(r, y));
    pedestal.geometry.dispose();
    pedestal.geometry = new THREE.LatheGeometry(pts, 72);
    pedestal.position.y = -0.14;
    footRing.position.y = -0.14 - h + 0.035;
  };
  setFloor(-0.86);

  // Holo field: rotating ring segments just above the board edge
  const rings = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const seg = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.02, 0.004, 6, 48, Math.PI * 0.45), new THREE.MeshBasicMaterial({ color: hex(i === 1 ? rightToken : leftToken), opacity: 0.6, ...additive }));
    seg.rotation.x = Math.PI / 2;
    seg.rotation.z = (i * Math.PI * 2) / 3;
    rings.add(seg);
  }
  rings.position.y = 0.03;
  g.add(rings);

  let next = 0;
  g.userData = {
    foot: [pedestal, footRing], // phones frame the table top, not the foot on the floor (fight.js)
    uniforms,
    setFloor,
    ripple(x, strength, side) {
      uniforms.uHits.value[next].set(x / radius, uniforms.uTime.value, strength, side);
      next = (next + 1) % 4;
    },
    flash(k) { uniforms.uFlash.value = Math.max(uniforms.uFlash.value, k); },
    update(dt, t) {
      uniforms.uTime.value = t;
      uniforms.uFlash.value = Math.max(0, uniforms.uFlash.value - dt * 1.5);
      rings.rotation.y += dt * 0.25;
      lights.forEach((m, i) => { m.material.opacity = 0.35 + 0.65 * (Math.sin(t * 2.4 + i * 0.9) > 0.2 ? 1 : 0.3); });
    },
  };
  return g;
}

// ---------- special beam ----------

const beamFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uAlpha;
  varying vec2 vUv;
  void main() {
    float across = abs(vUv.x - 0.5) * 2.0;
    float core = exp(-across * across * 30.0);
    float glow = exp(-across * 3.0) * 0.6;
    float flow = 0.6 + 0.4 * sin(vUv.y * 60.0 - uTime * 40.0);
    vec3 col = uColor * (glow + core * 0.7) * flow + vec3(1.0) * core * 0.8;
    gl_FragColor = vec4(col * uAlpha, 1.0);
  }
`;

/** Energy beam between two points (two crossed planes, additive). */
export function makeBeam(token) {
  const g = new THREE.Group();
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(hex(token)) }, uTime: { value: 0 }, uAlpha: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: beamFragment,
    side: THREE.DoubleSide,
    ...additive,
  });
  const geo = new THREE.PlaneGeometry(0.09, 1).rotateX(Math.PI / 2); // length along z, uv.y along the beam
  const a = new THREE.Mesh(geo, mat);
  const b = new THREE.Mesh(geo, mat);
  b.rotation.z = Math.PI / 2;
  g.add(a, b);
  const orb = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), color: hex(token), opacity: 0, ...additive }));
  orb.userData.noFit = true;
  g.userData = { mat, orb };
  g.visible = false;
  g.userData.set = (from, to, alpha, time) => {
    const d = to.clone().sub(from);
    const len = d.length();
    g.position.copy(from).addScaledVector(d, 0.5);
    g.lookAt(to);
    g.scale.set(1, 1, Math.max(0.001, len));
    mat.uniforms.uAlpha.value = alpha;
    mat.uniforms.uTime.value = time;
    g.visible = alpha > 0.01;
  };
  return g;
}

/** Floating damage number ("-12"), rises and fades. */
export function makeNumber(text, token) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font('black', 92);
  ctx.lineWidth = 12;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color('xr-fight-dark');
  ctx.strokeText(text, 128, 66);
  ctx.shadowColor = color(token);
  ctx.shadowBlur = 18;
  ctx.fillStyle = color(token);
  ctx.fillText(text, 128, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
  s.scale.set(0.16, 0.08, 1);
  s.renderOrder = 30;
  s.userData.noFit = true;
  return s;
}
