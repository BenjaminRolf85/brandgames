// "Stein auf Stein": the builders on the site. Three small figures in the style of the family
// (hard hats, high-visibility vests): one with a wheelbarrow at the front right, one at the foot
// of a ladder at the front left, one up on the ladder. They appear with the first part and work
// (a hammer goes up and down) while a part is being built; when the house is done they walk
// off the plot, the one with the wheelbarrow pushing it. Calm motion: they stand still and
// simply fade in and out. Few draw calls: all bodies are one instanced mesh, all hammer arms
// another, the ladder and the wheelbarrow one mesh each.
import * as THREE from 'three';
import { painted, joined } from './bricks-visuals.js';
import { HOUSE_Z, OZ } from './bricks-plan.js';

const H = 0.15; // figure height (meters in plot space, before the scale)
const SCALE = 0.86;
const R = H * 0.13;
const SHOULDER = new THREE.Vector3(R * 1.12, H * 0.62, 0);
const FRONT = HOUSE_Z + OZ; // plot-local z of the front wall's face
// The ladder leans against the gutter at the front left corner (clear of the window): its foot and its top (plot-local).
const LADDER_FOOT = new THREE.Vector3(-0.228, 0.002, FRONT + 0.115);
const LADDER_TOP = new THREE.Vector3(-0.228, 0.19, FRONT + 0.05);
const ease = (k) => k * k * (3 - 2 * k);

function bodyGeo() {
  const hatY = H * 0.8 + R * 0.2;
  return joined([
    painted(new THREE.CapsuleGeometry(R * 0.75, H * 0.22, 4, 10), 'xr-bricks-worker-pants', { y: H * 0.2, sx: 1.25, sz: 0.9 }),
    painted(new THREE.CapsuleGeometry(R, H * 0.22, 4, 12), 'xr-bricks-worker-shirt', { y: H * 0.5 }),
    painted(new THREE.CylinderGeometry(R * 1.1, R * 1.16, H * 0.2, 14), 'xr-bricks-worker-vest', { y: H * 0.49 }),
    painted(new THREE.CylinderGeometry(R * 1.17, R * 1.18, H * 0.028, 14), 'xr-bricks-worker-stripe', { y: H * 0.46 }),
    painted(new THREE.SphereGeometry(R * 1.05, 14, 10), 'xr-bricks-family-skin-1', { y: H * 0.8 }),
    painted(new THREE.SphereGeometry(R * 1.14, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 'xr-bricks-worker-hat', { y: hatY }),
    painted(new THREE.CylinderGeometry(R * 1.42, R * 1.42, R * 0.14, 18), 'xr-bricks-worker-hat', { y: hatY, z: R * 0.16 }),
    painted(new THREE.CylinderGeometry(R * 0.3, R * 0.3, R * 0.5, 8), 'xr-bricks-worker-hat', { y: hatY + R * 1.05 }),
    // the left arm hangs down
    painted(new THREE.CapsuleGeometry(R * 0.32, H * 0.2, 3, 8), 'xr-bricks-worker-shirt', { x: -SHOULDER.x, y: SHOULDER.y - H * 0.13 }),
  ]);
}

/** The right arm with a hammer in the hand (pivot at the shoulder; it swings about x). */
function armGeo() {
  return joined([
    painted(new THREE.CapsuleGeometry(R * 0.32, H * 0.2, 3, 8), 'xr-bricks-worker-shirt', { y: -H * 0.13 }),
    painted(new THREE.SphereGeometry(R * 0.36, 8, 6), 'xr-bricks-family-skin-1', { y: -H * 0.27 }),
    painted(new THREE.BoxGeometry(R * 0.22, R * 0.22, R * 1.5), 'xr-bricks-wood', { y: -H * 0.27, z: R * 0.6 }),
    painted(new THREE.BoxGeometry(R * 0.7, R * 0.4, R * 0.4), 'xr-bricks-dark', { y: -H * 0.27, z: R * 1.3 }),
  ]);
}

function ladderGeo() {
  const len = LADDER_FOOT.distanceTo(LADDER_TOP);
  const parts = [];
  for (const sx of [-1, 1]) parts.push(painted(new THREE.BoxGeometry(0.004, len, 0.004), 'xr-bricks-ladder', { x: sx * 0.02, y: len / 2 }));
  for (let i = 1; i < 8; i++) parts.push(painted(new THREE.CylinderGeometry(0.0018, 0.0018, 0.04, 6).rotateZ(Math.PI / 2), 'xr-bricks-ladder', { y: (i / 8) * len }));
  for (const sx of [-1, 1]) parts.push(painted(new THREE.BoxGeometry(0.006, 0.004, 0.006), 'xr-bricks-dark', { x: sx * 0.02, y: 0.002 }));
  const g = joined(parts);
  // stand it up from the foot towards the top
  const dir = LADDER_TOP.clone().sub(LADDER_FOOT).normalize();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  return g;
}

/** A wheelbarrow (its wheel at +z), loaded with a few bricks. */
function barrowGeo() {
  const tray = new THREE.CylinderGeometry(0.032, 0.021, 0.024, 4, 1).rotateY(Math.PI / 4);
  return joined([
    painted(tray, 'xr-bricks-barrow', { y: 0.034, sx: 0.85, sz: 1.15 }),
    painted(new THREE.BoxGeometry(0.014, 0.008, 0.026), 'xr-bricks-clay', { y: 0.046, x: -0.006 }),
    painted(new THREE.BoxGeometry(0.014, 0.008, 0.026), 'xr-bricks-clay', { y: 0.047, x: 0.009, z: 0.004 }),
    painted(new THREE.CylinderGeometry(0.012, 0.012, 0.007, 14).rotateZ(Math.PI / 2), 'xr-bricks-dark', { y: 0.012, z: 0.04 }),
    ...[-1, 1].flatMap((sx) => [
      painted(new THREE.BoxGeometry(0.0035, 0.0035, 0.085), 'xr-bricks-wood', { x: sx * 0.016, y: 0.026, z: 0.0, rx: 0.2 }),
      painted(new THREE.BoxGeometry(0.0035, 0.02, 0.0035), 'xr-bricks-dark', { x: sx * 0.014, y: 0.012, z: -0.022 }),
    ]),
  ]);
}

const _m = new THREE.Matrix4();
const _a = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export class Crew {
  /** parent: the plot (plot-local space); cast: they throw shadows; calm: no walking, no hammering. */
  constructor(parent, { cast = true, calm = false } = {}) {
    this.calm = calm;
    this.group = new THREE.Group();
    this.group.userData.noFit = true;
    this.group.visible = false;
    parent.add(this.group);
    this.mat = new THREE.MeshStandardMaterial({ roughness: 0.75, vertexColors: true });
    this.body = new THREE.InstancedMesh(bodyGeo(), this.mat, 3);
    this.arm = new THREE.InstancedMesh(armGeo(), this.mat, 3);
    this.ladder = new THREE.Mesh(ladderGeo(), this.mat);
    this.ladder.position.copy(LADDER_FOOT);
    this.barrow = new THREE.Mesh(barrowGeo(), this.mat);
    for (const m of [this.body, this.arm, this.ladder, this.barrow]) { m.castShadow = cast; m.receiveShadow = true; m.frustumCulled = false; this.group.add(m); }
    // Who stands where: at the wheelbarrow, at the foot of the ladder, up on the ladder.
    const up = LADDER_FOOT.clone().lerp(LADDER_TOP, 0.36);
    this.men = [
      { at: new THREE.Vector3(0.36, 0.002, FRONT + 0.075), face: -2.3, hammer: false, exit: 1 },
      { at: new THREE.Vector3(-0.31, 0.002, FRONT + 0.03), face: 0.9, hammer: true, exit: -1 },
      { at: new THREE.Vector3(up.x, up.y, up.z + 0.016), face: Math.PI, hammer: true, exit: -1 },
    ].map((m, i) => ({ ...m, pos: m.at.clone(), yaw: m.face, swing: 0, phase: i * 1.7 }));
    this.barrowAt = new THREE.Vector3(0.33, 0.002, FRONT + 0.035);
    this.barrow.position.copy(this.barrowAt);
    this.barrow.rotation.y = -2.2;
    this.state = 'off'; // 'in' | 'on' | 'out' | 'off'
    this.k = 0; // how present they are (0..1)
    this.busy = false;
    this.t = 0;
  }

  /** They come onto the site (with the first part). */
  show() {
    if (this.state === 'on' || this.state === 'in') return;
    this.state = 'in';
    this.t = 0;
    this.group.visible = true;
    this.men.forEach((m) => { m.pos.copy(m.at); m.yaw = m.face; });
    this.barrow.position.copy(this.barrowAt);
    this.barrow.rotation.y = -2.2;
  }

  /** The house is done: they walk off the plot (calm: they fade where they stand). */
  leave() {
    if (this.state === 'off' || this.state === 'out') return;
    this.state = 'out';
    this.t = 0;
    this.busy = false;
  }

  setFade(k) {
    const fade = k < 1;
    if (this.mat.transparent !== fade) { this.mat.transparent = fade; this.mat.needsUpdate = true; }
    this.mat.opacity = k;
  }

  tick(dt, time) {
    if (this.state === 'off') return;
    this.t += dt;
    let scale = 1;
    let walk = 0;
    if (this.state === 'in') {
      const k = Math.min(1, this.t / (this.calm ? 0.8 : 0.5));
      if (this.calm) this.setFade(k); else scale = Math.max(0.01, ease(k));
      if (k >= 1) { this.state = 'on'; this.setFade(1); }
    } else if (this.state === 'out') {
      if (this.calm) {
        const k = Math.min(1, this.t / 0.9);
        this.setFade(1 - k);
        if (k >= 1) this.off();
      } else {
        // the one on the ladder climbs down first, the ladder is taken away, then all walk off to the right
        walk = Math.max(0, this.t - 0.5);
        const k = Math.min(1, walk / 2.6);
        const down = Math.min(1, this.t / 0.5);
        this.men[2].pos.y = this.men[2].at.y * (1 - ease(down));
        this.men[2].pos.z = this.men[2].at.z + 0.03 * ease(down);
        this.ladder.scale.y = Math.max(0.001, 1 - ease(Math.min(1, this.t / 0.7)));
        this.men.forEach((m, i) => {
          if (walk <= 0) return;
          const tx = m.exit * (0.78 + i * 0.05);
          const tz = FRONT + (m.exit > 0 ? 0.06 : 0.0) + i * 0.02;
          const from = i === 2 ? new THREE.Vector3(m.at.x, 0.002, m.at.z + 0.03) : m.at;
          const kk = ease(k);
          m.pos.set(from.x + (tx - from.x) * kk, 0.002, from.z + (tz - from.z) * kk);
          m.yaw = Math.atan2(tx - from.x, tz - from.z);
        });
        if (walk > 0) {
          const w = this.men[0];
          this.barrow.position.set(w.pos.x + Math.sin(w.yaw) * 0.05, 0.002, w.pos.z + Math.cos(w.yaw) * 0.05);
          this.barrow.rotation.y = w.yaw;
        }
        scale = 1 - Math.max(0, (k - 0.85) / 0.15);
        if (k >= 1) { this.off(); return; }
      }
    }
    const work = this.busy && !this.calm && this.state === 'on';
    this.men.forEach((m, i) => {
      const bob = walk > 0 ? Math.abs(Math.sin(time * 9 + i)) * 0.005 : 0;
      const target = work && m.hammer ? -1.2 - Math.max(0, Math.sin(time * 7 + m.phase)) * 1.1 : walk > 0 ? Math.sin(time * 9 + i) * 0.4 : m.hammer ? -0.25 : -0.9;
      m.swing += (target - m.swing) * Math.min(1, dt * 12);
      _q.setFromEuler(_e.set(0, m.yaw, 0));
      _m.compose(_p.set(m.pos.x, m.pos.y + bob, m.pos.z), _q, _s.setScalar(SCALE * scale));
      this.body.setMatrixAt(i, _m);
      _a.makeTranslation(SHOULDER.x, SHOULDER.y, SHOULDER.z).multiply(new THREE.Matrix4().makeRotationX(m.swing));
      this.arm.setMatrixAt(i, _m.clone().multiply(_a));
    });
    this.body.instanceMatrix.needsUpdate = true;
    this.arm.instanceMatrix.needsUpdate = true;
    this.barrow.scale.setScalar(scale);
  }

  off() {
    this.state = 'off';
    this.group.visible = false;
    this.setFade(1);
    this.ladder.scale.y = 1;
  }

  dispose() {
    for (const m of [this.body, this.arm, this.ladder, this.barrow]) m.geometry.dispose();
    this.body.dispose();
    this.arm.dispose();
    this.mat.dispose();
    this.group.removeFromParent();
  }
}
