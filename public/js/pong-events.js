// Random events for AI Pong: a data storm that blows through the room (and pushes the
// ball), and power-ups that pop up in the tunnel, deflect the ball and unlock an effect
// (turbo, second ball, ball type switch, XXL paddle). Colors from tokens.
import * as THREE from 'three';
import { hex, color, font } from './tokens.js';
import { t } from './i18n.js';
import { radialTexture } from './robot-visuals.js';

const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
const smooth = (k) => k * k * (3 - 2 * k);

/** Streaks of light blowing through a box around the tunnel. wind() gives the push on the ball. */
export class DataStorm {
  constructor(parent, hw, hh, len) {
    this.count = 480;
    this.box = new THREE.Vector3(hw * 3.4, hh * 3.6, len * 1.3);
    this.pos = new Float32Array(this.count * 3);
    this.speed = new Float32Array(this.count);
    for (let i = 0; i < this.count; i++) this.reset(i, true);
    this.lines = new Float32Array(this.count * 6);
    const colors = new Float32Array(this.count * 6);
    const palette = ['xr-pong-storm', 'xr-pong-ball', 'xr-pong-predict'].map((t) => new THREE.Color(hex(t)));
    for (let i = 0; i < this.count; i++) {
      const c = palette[i % 7 === 0 ? 2 : i % 3 === 0 ? 1 : 0];
      // Bright head, dark tail: the streak fades out behind each particle.
      colors.set([c.r, c.g, c.b, 0, 0, 0], i * 6);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.lines, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.mesh = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true, opacity: 0, ...additive }));
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.userData.noFit = true;
    parent.add(this.mesh);
    this.dir = new THREE.Vector2(1, 0);
    this.t = 0;
    this.dur = 0;
    this.env = 0;
  }

  reset(i, anywhere) {
    const b = this.box;
    const p = this.pos;
    p[i * 3] = (Math.random() - 0.5) * b.x;
    p[i * 3 + 1] = (Math.random() - 0.5) * b.y;
    p[i * 3 + 2] = (Math.random() - 0.5) * b.z;
    if (!anywhere && this.dir) {
      // Re-enter on the upwind side.
      if (Math.abs(this.dir.x) > Math.abs(this.dir.y)) p[i * 3] = -Math.sign(this.dir.x) * b.x / 2;
      else p[i * 3 + 1] = -Math.sign(this.dir.y) * b.y / 2;
    }
    this.speed[i] = 0.8 + Math.random() * 1.4;
  }

  get active() {
    return this.t < this.dur;
  }

  start(seconds = 5.5) {
    const a = Math.random() * Math.PI * 2;
    this.dir.set(Math.cos(a), Math.sin(a) * 0.6).normalize();
    this.t = 0;
    this.dur = seconds;
    this.mesh.visible = true;
  }

  stop() {
    this.t = this.dur;
  }

  /** Sideways push on the ball (m/s^2), following the storm's strength. */
  wind() {
    return { x: this.dir.x * 0.55 * this.env, y: this.dir.y * 0.4 * this.env };
  }

  update(dt) {
    if (!this.mesh.visible) return;
    this.t += dt;
    const fadeIn = smooth(Math.min(1, this.t / 0.8));
    const fadeOut = smooth(Math.min(1, Math.max(0, (this.dur - this.t) / 1.0)));
    this.env = fadeIn * fadeOut;
    if (this.t > this.dur + 0.1) { this.mesh.visible = false; this.env = 0; return; }
    const b = this.box;
    const p = this.pos;
    const L = this.lines;
    for (let i = 0; i < this.count; i++) {
      const s = this.speed[i];
      const vx = this.dir.x * s * 1.6;
      const vy = this.dir.y * s * 1.6;
      const vz = -s * 0.5;
      p[i * 3] += vx * dt;
      p[i * 3 + 1] += vy * dt;
      p[i * 3 + 2] += vz * dt;
      if (Math.abs(p[i * 3]) > b.x / 2 || Math.abs(p[i * 3 + 1]) > b.y / 2 || Math.abs(p[i * 3 + 2]) > b.z / 2) this.reset(i, false);
      const tail = 0.05 + s * 0.04;
      L[i * 6] = p[i * 3];
      L[i * 6 + 1] = p[i * 3 + 1];
      L[i * 6 + 2] = p[i * 3 + 2];
      L[i * 6 + 3] = p[i * 3] - vx * tail;
      L[i * 6 + 4] = p[i * 3 + 1] - vy * tail;
      L[i * 6 + 5] = p[i * 3 + 2] - vz * tail;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.material.opacity = this.env * 0.8;
  }
}

/** Obstacles in the tunnel: glossy crystals, cubes and knots that deflect the ball and shatter. */
// Power-ups: every object deflects the ball AND unlocks an effect for whoever shot it.
export const POWERUPS = {
  turbo: { token: 'xr-pong-pu-turbo', shape: (r) => new THREE.OctahedronGeometry(r * 1.05, 0) },
  multi: { token: 'xr-pong-pu-multi', shape: (r) => new THREE.IcosahedronGeometry(r, 0) },
  morph: { token: 'xr-pong-pu-morph', shape: (r) => new THREE.TorusKnotGeometry(r * 0.62, r * 0.2, 96, 12) },
  giant: { token: 'xr-pong-pu-giant', shape: (r) => new THREE.BoxGeometry(r * 1.4, r * 1.4, r * 1.4, 2, 2, 2) },
};

/** Floating label above a power-up (short bilingual name). */
function labelSprite(text, token) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 80;
  const ctx = c.getContext('2d');
  ctx.font = font('black', 46);
  const w = Math.min(244, ctx.measureText(text).width + 40);
  ctx.fillStyle = color('xr-pong-pu-label');
  ctx.globalAlpha = 0.72;
  ctx.beginPath();
  ctx.roundRect((256 - w) / 2, 8, w, 64, 32);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 4;
  ctx.strokeStyle = color(token);
  ctx.stroke();
  ctx.fillStyle = color(token);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 42);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(0.19, 0.059, 1);
  sp.userData.noFit = true;
  return sp;
}

export class Obstacles {
  constructor(parent) {
    this.parent = parent;
    this.items = [];
    this.radius = 0.055;
  }

  /** Spawns a power-up (kind: a POWERUPS key) at a tunnel position. */
  spawn(x, y, z, kind = 'turbo') {
    const r = this.radius;
    const pu = POWERUPS[kind];
    const g = new THREE.Group();
    const geo = pu.shape(r);
    const color = hex(pu.token);
    const body = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({
      color, emissive: color, emissiveIntensity: 0.45, roughness: 0.15, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, flatShading: true,
    }));
    const wire = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 20), new THREE.LineBasicMaterial({ color: hex('xr-pong-ball'), opacity: 0.8, ...additive }));
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), color, opacity: 0.5, ...additive }));
    glow.scale.setScalar(this.radius * 5);
    glow.userData.noFit = true;
    const label = labelSprite(t(`pongPU_${kind}`), pu.token);
    label.position.y = r * 2.4;
    g.add(glow, body, wire, label);
    g.position.set(x, y, z);
    g.scale.setScalar(0.01);
    g.userData = { age: 0, life: 9 + Math.random() * 3, spin: new THREE.Vector3(Math.random(), Math.random(), Math.random()).normalize(), body, wire, glow, label, hit: 0, power: kind, token: pu.token };
    this.parent.add(g);
    this.items.push(g);
    return g;
  }

  update(dt, time) {
    for (const g of this.items.slice()) {
      const u = g.userData;
      u.age += dt;
      const appear = smooth(Math.min(1, u.age / 0.45));
      const vanish = smooth(Math.min(1, Math.max(0, (u.life - u.age) / 0.5)));
      const pop = 1 + Math.sin(Math.min(1, u.age / 0.45) * Math.PI) * 0.25;
      g.scale.setScalar(Math.max(0.01, appear * vanish * pop));
      // Only the shape spins; the label stays upright and readable.
      u.body.rotateOnAxis(u.spin, dt * 1.4);
      u.wire.quaternion.copy(u.body.quaternion);
      g.position.y += Math.sin(time * 2 + u.life) * 0.0004;
      u.glow.material.opacity = 0.35 + Math.sin(time * 4 + u.life) * 0.15;
      if (u.age >= u.life) this.remove(g);
    }
  }

  remove(g) {
    g.removeFromParent();
    g.traverse((o) => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose(); });
    this.items = this.items.filter((x) => x !== g);
  }

  clear() {
    for (const g of this.items.slice()) this.remove(g);
  }

  /**
   * Ball against obstacles. Reflects the sideways motion off the obstacle's surface but keeps
   * the ball flying the same way along the tunnel. Returns the obstacle that was hit.
   */
  collide(b, R) {
    for (const g of this.items) {
      if (g.userData.age < 0.3) continue;
      const r = this.radius * g.scale.x;
      const dx = b.x - g.position.x;
      const dy = b.y - g.position.y;
      const dz = b.z - g.position.z;
      const d = Math.hypot(dx, dy, dz);
      if (d >= r + R || d < 1e-6) continue;
      const n = { x: dx / d, y: dy / d, z: dz / d };
      const vn = b.vx * n.x + b.vy * n.y + b.vz * n.z;
      if (vn >= 0) continue;
      const speed = Math.hypot(b.vx, b.vy, b.vz);
      const vz0 = b.vz;
      b.vx -= 2 * vn * n.x;
      b.vy -= 2 * vn * n.y;
      b.vz -= 2 * vn * n.z;
      // Keep the direction along the tunnel (a deflection, not a return).
      b.vz = Math.sign(vz0) * Math.max(Math.abs(b.vz), Math.abs(vz0) * 0.7);
      // Sideways kick so a straight hit still changes the path, then restore the speed.
      if (Math.hypot(n.x, n.y) < 0.3) { b.vx += (Math.random() - 0.5) * 0.8; b.vy += (Math.random() - 0.5) * 0.6; }
      const k = speed / Math.hypot(b.vx, b.vy, b.vz);
      b.vx *= k;
      b.vy *= k;
      b.vz *= k;
      b.sx *= 0.3;
      b.sy *= 0.3;
      b.x = g.position.x + n.x * (r + R + 0.002);
      b.y = g.position.y + n.y * (r + R + 0.002);
      b.z = g.position.z + n.z * (r + R + 0.002);
      return g;
    }
    return null;
  }
}
