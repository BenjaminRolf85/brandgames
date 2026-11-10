// "Pannenfrei": tire tracks and the feel of speed. Each wheel draws one ribbon into a ring buffer
// that is recycled as the bike rides on: the tread pattern comes from an atlas (slick smooth,
// all-round chevrons, knobby blocks, spikes dotted), deep in mud, clear in snow, faint on wet
// ground, fading out behind the bike. Speed lines rush past on fast descents. Course units.
import * as THREE from 'three';
import { hex } from './tokens.js';
import { TIRES } from './bike-ai.js';

const N = 220; // points per ribbon
const STEP = 0.22; // meters between points
const FADE = 26; // the track fades out over this distance
const WIDTH = 0.11;

/** White marks on transparent ground (the tint comes from the vertex colors). */
const mark = (a) => `rgba(255,255,255,${a})`;

/** Tread atlas: four columns (one per tire), one repeat of the pattern each. */
function treadAtlas() {
  const W = 64;
  const H = 64;
  const c = document.createElement('canvas');
  c.width = W * 4;
  c.height = H;
  const ctx = c.getContext('2d');
  TIRES.forEach((k, i) => {
    const x0 = i * W;
    ctx.save();
    ctx.translate(x0, 0);
    if (k === 'slick') {
      const g = ctx.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, mark(0));
      g.addColorStop(0.25, mark(0.7));
      g.addColorStop(0.75, mark(0.7));
      g.addColorStop(1, mark(0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    } else if (k === 'allround') {
      ctx.fillStyle = mark(0.35);
      ctx.fillRect(W * 0.15, 0, W * 0.7, H);
      ctx.strokeStyle = mark(0.95);
      ctx.lineWidth = 6;
      for (let y = -8; y < H + 8; y += 16) {
        ctx.beginPath();
        ctx.moveTo(W * 0.18, y + 8);
        ctx.lineTo(W * 0.5, y);
        ctx.lineTo(W * 0.82, y + 8);
        ctx.stroke();
      }
    } else if (k === 'knobby') {
      ctx.fillStyle = mark(0.95);
      for (let y = 0; y < H; y += 16) {
        ctx.fillRect(W * 0.08, y, W * 0.22, 9);
        ctx.fillRect(W * 0.7, y, W * 0.22, 9);
        ctx.fillRect(W * 0.38, y + 8, W * 0.24, 9);
      }
    } else {
      ctx.fillStyle = mark(0.3);
      ctx.fillRect(W * 0.15, 0, W * 0.7, H);
      ctx.fillStyle = mark(1);
      for (let y = 4; y < H; y += 12) {
        for (const u of [0.3, 0.7]) { ctx.beginPath(); ctx.arc(W * (u + (y % 24 ? 0.08 : -0.08)), y, 3.2, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    ctx.restore();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

class Ribbon {
  constructor(material) {
    this.pos = new Float32Array(N * 2 * 3);
    this.uv = new Float32Array(N * 2 * 2);
    this.col = new Float32Array(N * 2 * 4);
    this.meta = Array.from({ length: N }, () => ({ s: -1e9, a: 0, r: 0, g: 0, b: 0 }));
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(this.uv, 2));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 4));
    this.geo.setIndex(new THREE.BufferAttribute(new Uint16Array((N - 1) * 6), 1));
    this.geo.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.userData.noFit = true;
    this.mesh.renderOrder = 2;
    this.head = -1;
    this.count = 0;
    this.last = null;
    this.dist = 0;
    this.gap = true;
  }

  /** Adds a point if the wheel moved far enough: left and right edge, tread column, tint. */
  add(course, s, v, y, alpha, tire, c) {
    const p = course.point(s, v);
    if (this.last && Math.hypot(p.x - this.last.x, p.z - this.last.z) < STEP && !this.gap) return;
    if (this.last) this.dist += Math.hypot(p.x - this.last.x, p.z - this.last.z);
    this.last = p;
    const a = this.gap ? 0 : alpha; // the first point after a gap fades in
    this.gap = false;
    this.head = (this.head + 1) % N;
    this.count = Math.min(N, this.count + 1);
    const i = this.head;
    const d = course.dcx(s);
    const n = 1 / Math.sqrt(1 + d * d);
    const nx = n;
    const nz = d * n;
    const half = WIDTH / 2;
    this.pos.set([p.x - nx * half, y, p.z - nz * half, p.x + nx * half, y, p.z + nz * half], i * 6);
    const u0 = TIRES.indexOf(tire) / 4 + 0.004;
    const u1 = (TIRES.indexOf(tire) + 1) / 4 - 0.004;
    const vv = this.dist / 0.45;
    this.uv.set([u0, vv, u1, vv], i * 4);
    Object.assign(this.meta[i], { s, a, r: c.r, g: c.g, b: c.b });
    // Indices from the oldest to the newest point.
    const idx = this.geo.index.array;
    let k = 0;
    const start = (this.head - this.count + 1 + N) % N;
    for (let j = 0; j < this.count - 1; j++) {
      const p0 = (start + j) % N;
      const p1 = (start + j + 1) % N;
      const a0 = p0 * 2;
      const b0 = p1 * 2;
      idx[k++] = a0; idx[k++] = a0 + 1; idx[k++] = b0;
      idx[k++] = a0 + 1; idx[k++] = b0 + 1; idx[k++] = b0;
    }
    this.geo.index.needsUpdate = true;
    this.geo.setDrawRange(0, k);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.uv.needsUpdate = true;
  }

  /** The wheel leaves the ground (or the surface takes no track): the ribbon breaks. */
  lift() { this.gap = true; }

  fade(sNow) {
    for (let i = 0; i < N; i++) {
      const m = this.meta[i];
      const k = m.a * Math.max(0, 1 - (sNow - m.s) / FADE);
      this.col.set([m.r, m.g, m.b, k, m.r, m.g, m.b, k], i * 8);
    }
    this.geo.attributes.color.needsUpdate = true;
  }
}

/** Tracks of both wheels: add(i, ...), lift(i), update(sNow). */
export function makeTracks(clip) {
  const map = treadAtlas();
  const material = new THREE.MeshStandardMaterial({
    map, vertexColors: true, transparent: true, depthWrite: false, roughness: 0.85, metalness: 0,
    clippingPlanes: clip, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
  });
  const group = new THREE.Group();
  group.userData.noFit = true;
  const ribbons = [new Ribbon(material), new Ribbon(material)];
  ribbons.forEach((r) => group.add(r.mesh));
  return {
    group,
    add: (i, ...a) => ribbons[i].add(...a),
    lift: (i) => ribbons[i].lift(),
    update: (sNow) => ribbons.forEach((r) => r.fade(sNow)),
    dispose: () => { map.dispose(); material.dispose(); ribbons.forEach((r) => r.geo.dispose()); },
  };
}

/** Speed lines rushing past on fast descents (course units). update(dt, course, s, v, amount). */
export function makeSpeedLines(count = 70, clip = null) {
  const pos = new Float32Array(count * 6);
  const seed = new Float32Array(count * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({ color: hex('xr-bike-speed'), transparent: true, opacity: 0, depthWrite: false, clippingPlanes: clip });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  lines.userData.noFit = true;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  let init = false;
  lines.userData.update = (dt, course, s, speed, amount) => {
    mat.opacity += (amount * 0.55 - mat.opacity) * Math.min(1, dt * 4);
    lines.visible = mat.opacity > 0.02;
    if (!lines.visible) { init = false; return; }
    for (let i = 0; i < count; i++) {
      // They rush towards the bike faster than it rides.
      seed[i * 3] -= dt * speed * 1.6;
      if (!init || seed[i * 3] < s - 1.5) {
        seed[i * 3] = s + (init ? 10 + Math.random() * 6 : Math.random() * 16);
        seed[i * 3 + 1] = (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 2.6);
        seed[i * 3 + 2] = 0.3 + Math.random() * 2.2;
      }
      const si = seed[i * 3];
      course.point(si, seed[i * 3 + 1], a);
      course.point(si + 1.1, seed[i * 3 + 1], b);
      const y = course.h(si) + seed[i * 3 + 2];
      pos.set([a.x, y, a.z, b.x, course.h(si + 1.1) + seed[i * 3 + 2], b.z], i * 6);
    }
    init = true;
    geo.attributes.position.needsUpdate = true;
  };
  return lines;
}
