// Effects for AI Pong: shockwaves, energy rails, floating light dust and the AI "brain".
// All colors come from design tokens.
import * as THREE from 'three';
import { hex } from './tokens.js';
import { radialTexture } from './robot-visuals.js';
import { makeHexMaterial } from './pong-shaders.js';

const additive = (extra = {}) => ({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, ...extra });

const Z_AXIS = new THREE.Vector3(0, 0, 1);

/** Expanding rings facing a given direction (hits, wall bounces, points). */
export class Shockwaves {
  constructor(parent, count = 16) {
    const geo = new THREE.RingGeometry(0.8, 1, 48);
    this.pool = Array.from({ length: count }, () => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial(additive({ opacity: 0, side: THREE.DoubleSide })));
      m.visible = false;
      m.userData = { life: 0, max: 1, size: 0.1, noFit: true };
      parent.add(m);
      return m;
    });
    this.next = 0;
  }

  spawn(x, y, z, normal, token, size = 0.18, life = 0.5) {
    const m = this.pool[this.next];
    this.next = (this.next + 1) % this.pool.length;
    m.position.set(x, y, z);
    m.quaternion.setFromUnitVectors(Z_AXIS, normal);
    m.material.color.setHex(hex(token));
    m.userData.life = life;
    m.userData.max = life;
    m.userData.size = size;
    m.visible = true;
  }

  update(dt) {
    for (const m of this.pool) {
      if (!m.visible) continue;
      const u = m.userData;
      u.life -= dt;
      if (u.life <= 0) { m.visible = false; continue; }
      const k = 1 - u.life / u.max;
      const e = 1 - (1 - k) ** 3;
      m.scale.setScalar(0.01 + u.size * e);
      m.material.opacity = (1 - k) * 0.9;
    }
  }
}

let railTex = null;
function energyTexture() {
  if (railTex) return railTex;
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, 'rgba(255,255,255,0.25)');
  g.addColorStop(0.42, 'rgba(255,255,255,0.35)');
  g.addColorStop(0.5, 'rgba(255,255,255,1)');
  g.addColorStop(0.58, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0.25)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 256);
  railTex = new THREE.CanvasTexture(c);
  railTex.wrapS = railTex.wrapT = THREE.RepeatWrapping;
  return railTex;
}

/** Side rail with light pulses running along it; faster when the ball is faster. */
export function makeEnergyRail(length, token, w = 0.014, h = 0.03) {
  const tex = energyTexture().clone();
  tex.needsUpdate = true;
  tex.repeat.set(1, 3);
  const mat = new THREE.MeshBasicMaterial({ color: hex(token), map: tex });
  const rail = new THREE.Mesh(new THREE.BoxGeometry(w, h, length), mat);
  // Box UVs on the long faces run along the length after this rotation of the texture.
  tex.rotation = Math.PI / 2;
  tex.center.set(0.5, 0.5);
  rail.userData.tick = (dt, speed) => { tex.offset.x -= dt * (0.3 + speed * 0.8); };
  return rail;
}

/** Slowly rising specks of light around the table. */
export function makeDust(w, l, h, count, token) {
  const pos = new Float32Array(count * 3);
  const speed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * w;
    pos[i * 3 + 1] = Math.random() * h - 0.1;
    pos[i * 3 + 2] = (Math.random() - 0.5) * l;
    speed[i] = 0.01 + Math.random() * 0.03;
  }
  const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial(additive({ color: hex(token), map: radialTexture(), size: 0.018, sizeAttenuation: true, opacity: 0.7 }));
  const pts = new THREE.Points(geo, mat);
  pts.userData.noFit = true;
  pts.frustumCulled = false;
  let time = 0;
  pts.userData.tick = (dt) => {
    time += dt;
    for (let i = 0; i < count; i++) {
      pos[i * 3 + 1] += speed[i] * dt;
      pos[i * 3] += Math.sin(time * 0.7 + i) * 0.002 * dt * 10;
      if (pos[i * 3 + 1] > h - 0.1) pos[i * 3 + 1] = -0.1;
    }
    geo.attributes.position.needsUpdate = true;
    mat.opacity = 0.55 + Math.sin(time * 1.3) * 0.15;
  };
  return pts;
}

/** The AI's "brain": a small glowing network that flashes when it learns or guesses. */
export function makeBrain(radius, token) {
  const group = new THREE.Group();
  group.userData.noFit = true;
  const nodes = 30;
  const pts = [];
  for (let i = 0; i < nodes; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(radius * (0.35 + Math.random() * 0.65));
    v.y *= 0.75;
    pts.push(v);
  }
  const nodeMat = new THREE.MeshStandardMaterial({ color: hex(token), emissive: hex(token), emissiveIntensity: 0.8, roughness: 0.3 });
  const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.008, 12, 8), nodeMat, nodes);
  const m = new THREE.Matrix4();
  pts.forEach((p, i) => inst.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)));
  const seg = [];
  pts.forEach((a, i) => {
    pts.map((b, j) => ({ j, d: a.distanceTo(b) })).filter((o) => o.j > i).sort((x, y) => x.d - y.d).slice(0, 2)
      .forEach(({ j }) => seg.push(a, pts[j]));
  });
  const lineMat = new THREE.LineBasicMaterial(additive({ color: hex(token), opacity: 0.4 }));
  const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(seg), lineMat);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial(additive({ map: radialTexture(), color: hex(token), opacity: 0.35 })));
  glow.scale.setScalar(radius * 3.2);
  group.add(glow, lines, inst);

  let time = 0;
  let excite = 0;
  group.userData.pulse = (k = 1) => { excite = Math.max(excite, k); };
  group.userData.setColor = (c) => {
    nodeMat.color.setHex(c);
    nodeMat.emissive.setHex(c);
    lineMat.color.setHex(c);
    glow.material.color.setHex(c);
  };
  group.userData.tick = (dt) => {
    time += dt;
    excite = Math.max(0, excite - dt * 1.8);
    group.rotation.y += dt * (0.25 + excite * 2);
    lineMat.opacity = 0.3 + 0.1 * Math.sin(time * 2) + excite * 0.6;
    nodeMat.emissiveIntensity = 0.7 + 0.2 * Math.sin(time * 3) + excite * 1.5;
    glow.material.opacity = 0.25 + excite * 0.5;
    group.scale.setScalar(1 + excite * 0.12);
  };
  return group;
}

let gridTex = null;
function gridTexture() {
  if (gridTex) return gridTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, 128, 128);
  gridTex = new THREE.CanvasTexture(c);
  gridTex.wrapS = gridTex.wrapT = THREE.RepeatWrapping;
  gridTex.anisotropy = 4;
  return gridTex;
}

/** Rectangle outline in the XY plane (half sizes hw, hh), as a flat ring with a hole. */
export function frameGeometry(hw, hh, thick, r = 0.02) {
  const rect = (w, h, rad) => {
    const s = new THREE.Shape();
    s.moveTo(-w + rad, -h);
    s.lineTo(w - rad, -h);
    s.quadraticCurveTo(w, -h, w, -h + rad);
    s.lineTo(w, h - rad);
    s.quadraticCurveTo(w, h, w - rad, h);
    s.lineTo(-w + rad, h);
    s.quadraticCurveTo(-w, h, -w, h - rad);
    s.lineTo(-w, -h + rad);
    s.quadraticCurveTo(-w, -h, -w + rad, -h);
    return s;
  };
  const outer = rect(hw, hh, r);
  outer.holes.push(rect(hw - thick, hh - thick, Math.max(0.002, r - thick)));
  return new THREE.ShapeGeometry(outer, 8);
}

/**
 * Neon tunnel along -z: grid walls, glowing corner edges with energy pulses and
 * faint depth frames. Near plane at z = len/2, far plane at z = -len/2.
 */
export function makeTunnel(hw, hh, len, token, fx) {
  const g = new THREE.Group();
  const walls = [];
  // zMap converts the wall's uv into tunnel z: z = zMap.x + zMap.y * (zMap.z ? uv.x : uv.y).
  const wall = (w, h, pos, rotX, rotY, opacity, zMap) => {
    let material;
    if (fx) {
      material = fx.wallMaterial(new THREE.Vector2(w, h), zMap, len, opacity * 3);
    } else {
      const tex = gridTexture().clone();
      tex.needsUpdate = true;
      tex.repeat.set(Math.round(w / 0.1), Math.round(h / 0.1));
      material = new THREE.MeshBasicMaterial({ map: tex, color: hex(token), side: THREE.DoubleSide, ...additive({ opacity }) });
    }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    m.position.copy(pos);
    m.rotation.set(rotX, rotY, 0);
    g.add(m);
    walls.push(m);
    return m;
  };
  wall(2 * hw, len, new THREE.Vector3(0, -hh, 0), -Math.PI / 2, 0, 0.32, new THREE.Vector3(len / 2, -len, 0)); // floor
  wall(2 * hw, len, new THREE.Vector3(0, hh, 0), Math.PI / 2, 0, 0.16, new THREE.Vector3(-len / 2, len, 0)); // ceiling
  wall(len, 2 * hh, new THREE.Vector3(-hw, 0, 0), 0, Math.PI / 2, 0.22, new THREE.Vector3(len / 2, -len, 1)); // left
  wall(len, 2 * hh, new THREE.Vector3(hw, 0, 0), 0, -Math.PI / 2, 0.22, new THREE.Vector3(-len / 2, len, 1)); // right
  // Dark floor so the ball's glow and the grid read well in passthrough.
  const base = new THREE.Mesh(new THREE.PlaneGeometry(2 * hw, len), new THREE.MeshBasicMaterial({ color: hex('xr-pong-table'), transparent: true, opacity: 0.55, depthWrite: false }));
  base.rotation.x = -Math.PI / 2;
  base.position.y = -hh - 0.002;
  g.add(base);

  const edges = [];
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const e = makeEnergyRail(len, token, 0.012, 0.012);
      e.position.set(sx * hw, sy * hh, 0);
      g.add(e);
      edges.push(e);
    }
  }
  const frameGeo = frameGeometry(hw + 0.006, hh + 0.006, 0.006, 0.01);
  const frames = [];
  for (let i = 1; i < 5; i++) {
    const f = new THREE.Mesh(frameGeo, new THREE.MeshBasicMaterial({ color: hex(token), ...additive({ opacity: 0.18 }) }));
    f.position.z = len / 2 - (i * len) / 5;
    g.add(f);
    frames.push(f);
  }
  const endGeo = frameGeometry(hw + 0.012, hh + 0.012, 0.012, 0.014);
  const near = new THREE.Mesh(endGeo, new THREE.MeshBasicMaterial({ color: hex(token), ...additive({ opacity: 0.7 }) }));
  near.position.z = len / 2;
  const far = new THREE.Mesh(endGeo, new THREE.MeshBasicMaterial({ color: hex(token), ...additive({ opacity: 0.7 }) }));
  far.position.z = -len / 2;
  g.add(near, far);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(2 * hw * 2.4, len * 1.4), new THREE.MeshBasicMaterial({ map: radialTexture(), color: hex(token), ...additive({ opacity: 0.22 }) }));
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = -hh - 0.01;
  g.add(halo);
  return { group: g, walls, edges, frames, near, far };
}

/** Glassy paddle: translucent fill, glowing frame and a center cross. */
export function makeGlassPaddle(hw, hh, token) {
  const g = new THREE.Group();
  // A round table-tennis blade (the menu coin's look); the hit box stays the rectangle hw x hh.
  const ex = hw * 1.1;
  const ey = hh * 1.14;
  const blade = new THREE.Shape();
  blade.absellipse(0, 0, ex, ey, 0, Math.PI * 2, false, 0);
  const fill = new THREE.Mesh(new THREE.ShapeGeometry(blade, 48), makeHexMaterial(hw, hh, hex(token)));
  const ring = new THREE.Shape();
  ring.absellipse(0, 0, ex + 0.004, ey + 0.004, 0, Math.PI * 2, false, 0);
  const hole = new THREE.Path();
  hole.absellipse(0, 0, ex - 0.006, ey - 0.006, 0, Math.PI * 2, true, 0);
  ring.holes.push(hole);
  const frame = new THREE.Mesh(new THREE.ShapeGeometry(ring, 48), new THREE.MeshBasicMaterial({ color: hex(token), side: THREE.DoubleSide, ...additive({ opacity: 1 }) }));
  const crossMat = new THREE.MeshBasicMaterial({ color: hex(token), side: THREE.DoubleSide, ...additive({ opacity: 0.6 }) });
  const h = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.004), crossMat);
  const v = new THREE.Mesh(new THREE.PlaneGeometry(0.004, 0.04), crossMat);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial(additive({ map: radialTexture(), color: hex(token), opacity: 0.35 })));
  glow.scale.set(hw * 4, hh * 4, 1);
  glow.userData.noFit = true;
  g.add(glow, fill, frame, h, v);
  g.userData = { fill, frame, glow, cross: crossMat, flash: 0 };
  g.userData.ripple = (x, y, time) => fill.material.uniforms.uHit.value.set(x, y, time);
  g.userData.tick = (time, opacity) => {
    fill.material.uniforms.uTime.value = time;
    fill.material.uniforms.uOpacity.value = opacity;
  };
  g.userData.setColor = (c) => {
    fill.material.uniforms.uColor.value.setHex(c);
    frame.material.color.setHex(c);
    crossMat.color.setHex(c);
    glow.material.color.setHex(c);
  };
  return g;
}
