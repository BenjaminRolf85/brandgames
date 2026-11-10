// 3D building blocks for the walkable bank data architecture: one shape per component type,
// floating labels, the data-flow network with moving packets, and the zoned floor.
// All colors come from design tokens.
import * as THREE from 'three';
import { hex, color, font } from './tokens.js';
import { radialTexture, roundedRectShape } from './robot-visuals.js';

const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
// Standard (not physical) material: 42 components must stay light enough for the headset.
const glossy = (token, extra = {}) => new THREE.MeshStandardMaterial({
  color: hex(token), emissive: hex(token), emissiveIntensity: 0.28, roughness: 0.25, metalness: 0.15, ...extra,
});
const glowMat = (token, opacity = 1) => new THREE.MeshBasicMaterial({ color: hex(token), opacity, ...additive });
const edges = (geo, token, opacity = 0.7) => new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), new THREE.LineBasicMaterial({ color: hex(token), opacity, ...additive }));

function roundedBox(w, h, d, r = 0.02) {
  const geo = new THREE.ExtrudeGeometry(roundedRectShape(w, h, r), { depth: d - 2 * r * 0.5, bevelEnabled: true, bevelThickness: r * 0.5, bevelSize: r * 0.5, bevelSegments: 3, curveSegments: 6 });
  geo.center();
  return geo;
}

/** Shape for a component type. Returns a group; userData.tick(dt, time) animates it. */
export function makeShape(type, token) {
  const g = new THREE.Group();
  let tick = null;
  const T = token;
  switch (type) {
    case 'system': {
      const geo = roundedBox(0.24, 0.32, 0.18, 0.025);
      g.add(new THREE.Mesh(geo, glossy('xr-arch-body', { emissive: hex(T), emissiveIntensity: 0.06 })), edges(geo, T, 0.5));
      // Glowing slots like a server rack.
      const slots = [];
      for (let i = 0; i < 5; i++) {
        const s = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.014), glowMat(T, 0.9));
        s.position.set(0, -0.11 + i * 0.055, 0.0905);
        const b = s.clone();
        b.material = s.material.clone();
        b.position.z = -0.0905;
        b.rotation.y = Math.PI;
        g.add(s, b);
        slots.push(s, b);
      }
      tick = (dt, t) => slots.forEach((s, i) => { s.material.opacity = 0.45 + 0.45 * Math.max(0, Math.sin(t * 3 + i * 1.7)); });
      break;
    }
    case 'app': {
      const geo = roundedBox(0.15, 0.27, 0.025, 0.03);
      g.add(new THREE.Mesh(geo, glossy('xr-arch-body')), edges(geo, T, 0.6));
      for (const z of [0.0135, -0.0135]) {
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.22), glowMat(T, 0.75));
        screen.position.z = z;
        if (z < 0) screen.rotation.y = Math.PI;
        g.add(screen);
      }
      tick = (dt) => { g.rotation.y += dt * 0.6; };
      break;
    }
    case 'db': {
      const discs = [];
      for (let i = 0; i < 3; i++) {
        const geo = new THREE.CylinderGeometry(0.12, 0.12, 0.07, 40);
        const d = new THREE.Mesh(geo, glossy(T, { emissiveIntensity: 0.18 }));
        d.position.y = -0.09 + i * 0.09;
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.121, 0.005, 8, 48), glowMat(T));
        rim.rotation.x = Math.PI / 2;
        rim.position.y = d.position.y + 0.035;
        g.add(d, rim);
        discs.push(rim);
      }
      tick = (dt, t) => discs.forEach((r, i) => { r.material.opacity = 0.5 + 0.5 * Math.max(0, Math.sin(t * 2.4 - i * 1.1)); });
      break;
    }
    case 'stream': {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.012, 12, 64), glossy(T, { emissiveIntensity: 0.6 }));
      g.add(ring);
      const orbs = [];
      for (let i = 0; i < 6; i++) {
        const o = new THREE.Mesh(new THREE.SphereGeometry(0.018, 16, 12), glowMat('xr-arch-packet'));
        g.add(o);
        orbs.push(o);
      }
      tick = (dt, t) => {
        orbs.forEach((o, i) => { const a = t * 2 + (i / orbs.length) * Math.PI * 2; o.position.set(Math.cos(a) * 0.15, Math.sin(a) * 0.15, 0); });
        g.rotation.y += dt * 0.5;
      };
      break;
    }
    case 'gateway': {
      const frame = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.022, 8, 6), glossy(T, { emissiveIntensity: 0.5 }));
      frame.rotation.z = Math.PI / 6;
      const portal = new THREE.Mesh(new THREE.CircleGeometry(0.14, 6), new THREE.MeshBasicMaterial({ color: hex(T), opacity: 0.25, side: THREE.DoubleSide, ...additive }));
      portal.rotation.z = Math.PI / 6;
      g.add(frame, portal);
      tick = (dt, t) => { portal.material.opacity = 0.18 + 0.15 * Math.sin(t * 3); g.rotation.y += dt * 0.4; };
      break;
    }
    case 'hex': {
      const geo = new THREE.CylinderGeometry(0.12, 0.12, 0.16, 6);
      g.add(new THREE.Mesh(geo, glossy(T, { emissiveIntensity: 0.2, flatShading: true })), edges(geo, 'xr-arch-packet', 0.6));
      tick = (dt) => { g.rotation.y += dt * 0.8; };
      break;
    }
    case 'lake': {
      // A floating pool of data with glowing rings rippling outwards.
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.36, 0.06, 64), glossy(T, { emissiveIntensity: 0.25, opacity: 0.45, transparent: true, depthWrite: false }));
      const surface = new THREE.Mesh(new THREE.CircleGeometry(0.4, 64), new THREE.MeshBasicMaterial({ map: radialTexture(), color: hex(T), opacity: 0.8, side: THREE.DoubleSide, ...additive }));
      surface.rotation.x = -Math.PI / 2;
      surface.position.y = 0.032;
      g.add(base, surface);
      const rings = [];
      for (let i = 0; i < 3; i++) {
        const r = new THREE.Mesh(new THREE.RingGeometry(0.96, 1, 48), new THREE.MeshBasicMaterial({ color: hex('xr-arch-packet'), opacity: 0.6, side: THREE.DoubleSide, ...additive }));
        r.rotation.x = -Math.PI / 2;
        r.position.y = 0.034;
        g.add(r);
        rings.push(r);
      }
      tick = (dt, t) => rings.forEach((r, i) => {
        const k = ((t * 0.35 + i / 3) % 1);
        r.scale.setScalar(0.05 + k * 0.38);
        r.material.opacity = 0.7 * (1 - k);
      });
      break;
    }
    case 'ai': {
      const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 1), glossy(T, { emissiveIntensity: 0.55, flatShading: true }));
      const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 1), new THREE.MeshBasicMaterial({ color: hex(T), wireframe: true, opacity: 0.45, ...additive }));
      g.add(core, shell);
      tick = (dt, t) => { core.rotation.y += dt * 0.7; shell.rotation.y -= dt * 0.4; shell.rotation.x += dt * 0.2; core.scale.setScalar(1 + Math.sin(t * 4) * 0.05); };
      break;
    }
    case 'dashboard': {
      const geo = roundedBox(0.34, 0.22, 0.02, 0.015);
      g.add(new THREE.Mesh(geo, glossy('xr-arch-body')), edges(geo, T, 0.6));
      const bars = [];
      for (let i = 0; i < 6; i++) {
        for (const side of [1, -1]) {
          const b = new THREE.Mesh(new THREE.PlaneGeometry(0.035, 1), glowMat(i % 2 ? T : 'xr-arch-packet', 0.9));
          b.position.set((-0.125 + i * 0.05) * side, -0.08, 0.0115 * side);
          if (side < 0) b.rotation.y = Math.PI;
          g.add(b);
          bars.push({ b, i });
        }
      }
      tick = (dt, t) => bars.forEach(({ b, i }) => {
        const h = 0.04 + 0.11 * (0.5 + 0.5 * Math.sin(t * 1.3 + i * 0.9));
        b.scale.y = h;
        b.position.y = -0.08 + h / 2;
      });
      break;
    }
    case 'report': {
      for (let i = 0; i < 3; i++) {
        const page = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.008), glossy('xr-arch-paper', { emissiveIntensity: 0.05 }));
        page.position.set(i * 0.012, i * 0.012, -i * 0.02);
        page.rotation.z = (i - 1) * 0.05;
        g.add(page);
      }
      const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.012, 32), glossy(T, { emissiveIntensity: 0.6 }));
      seal.rotation.x = Math.PI / 2;
      seal.position.set(0.05, -0.07, 0.012);
      const lines = new THREE.Group();
      for (let i = 0; i < 5; i++) {
        const l = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.008), glowMat(T, 0.8));
        l.position.set(-0.01, 0.09 - i * 0.03, 0.0055);
        lines.add(l);
      }
      g.add(seal, lines);
      tick = (dt) => { g.rotation.y += dt * 0.5; };
      break;
    }
    case 'shield':
    case 'key':
    case 'check': {
      const s = new THREE.Shape();
      if (type === 'shield') {
        s.moveTo(0, 0.15);
        s.quadraticCurveTo(0.08, 0.13, 0.13, 0.12);
        s.quadraticCurveTo(0.14, -0.04, 0, -0.16);
        s.quadraticCurveTo(-0.14, -0.04, -0.13, 0.12);
        s.quadraticCurveTo(-0.08, 0.13, 0, 0.15);
      } else if (type === 'key') {
        s.absarc(-0.06, 0, 0.07, 0, Math.PI * 2, false);
        const hole = new THREE.Path();
        hole.absarc(-0.06, 0, 0.03, 0, Math.PI * 2, true);
        s.holes.push(hole);
        const bit = new THREE.Shape();
        bit.moveTo(0, -0.02);
        bit.lineTo(0.16, -0.02);
        bit.lineTo(0.16, -0.06);
        bit.lineTo(0.12, -0.06);
        bit.lineTo(0.12, -0.04);
        bit.lineTo(0.09, -0.04);
        bit.lineTo(0.09, -0.06);
        bit.lineTo(0.05, -0.06);
        bit.lineTo(0.05, -0.02);
        bit.lineTo(0, 0.02);
        bit.lineTo(0.16, 0.02);
        bit.lineTo(0.16, -0.02);
        const bitGeo = new THREE.ExtrudeGeometry(bit, { depth: 0.03, bevelEnabled: true, bevelSize: 0.004, bevelThickness: 0.004, bevelSegments: 2 });
        bitGeo.translate(0, 0, -0.015);
        g.add(new THREE.Mesh(bitGeo, glossy(T, { emissiveIntensity: 0.3 })));
      } else {
        s.moveTo(-0.12, 0.0);
        s.lineTo(-0.04, -0.09);
        s.lineTo(0.13, 0.1);
        s.lineTo(0.1, 0.13);
        s.lineTo(-0.04, -0.03);
        s.lineTo(-0.09, 0.03);
        s.lineTo(-0.12, 0.0);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.01, 8, 48), glowMat(T, 0.7));
        g.add(ring);
      }
      const geo = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 3, curveSegments: 16 });
      geo.translate(0, 0, -0.02);
      g.add(new THREE.Mesh(geo, glossy(T, { emissiveIntensity: 0.35 })), edges(geo, 'xr-arch-packet', 0.5));
      tick = (dt) => { g.rotation.y += dt * 0.7; };
      break;
    }
    case 'catalog': {
      const cols = [T, 'xr-arch-packet', T];
      for (let i = 0; i < 3; i++) {
        const book = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.24 - i * 0.02, 0.17), glossy(cols[i], { emissiveIntensity: 0.25 }));
        book.position.set(-0.06 + i * 0.06, -0.01 * i, 0);
        book.rotation.z = i === 2 ? -0.25 : 0;
        g.add(book);
      }
      tick = (dt) => { g.rotation.y += dt * 0.5; };
      break;
    }
    case 'lineage': {
      const pts = [[-0.13, 0.1, 0], [0, 0.05, 0.04], [0.13, 0.11, 0], [-0.08, -0.08, 0.02], [0.1, -0.06, -0.03], [0, -0.13, 0]];
      const v = pts.map((p) => new THREE.Vector3(...p));
      v.forEach((p, i) => {
        const n = new THREE.Mesh(new THREE.SphereGeometry(i === 1 ? 0.03 : 0.022, 16, 12), glossy(i === 1 ? 'xr-arch-packet' : T, { emissiveIntensity: 0.5 }));
        n.position.copy(p);
        g.add(n);
      });
      const pairs = [[0, 1], [2, 1], [1, 3], [1, 4], [3, 5], [4, 5]];
      const geo = new THREE.BufferGeometry().setFromPoints(pairs.flatMap(([a, b]) => [v[a], v[b]]));
      g.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: hex(T), opacity: 0.9, ...additive })));
      tick = (dt) => { g.rotation.y += dt * 0.6; };
      break;
    }
    case 'external': {
      const inner = new THREE.Mesh(new THREE.SphereGeometry(0.11, 32, 24), glossy(T, { emissiveIntensity: 0.2 }));
      const wire = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), new THREE.MeshBasicMaterial({ color: hex(T), wireframe: true, opacity: 0.4, ...additive }));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.006, 8, 64), glowMat(T, 0.7));
      ring.rotation.x = 1.2;
      g.add(inner, wire, ring);
      tick = (dt) => { wire.rotation.y += dt * 0.3; ring.rotation.z += dt * 0.8; };
      break;
    }
    case 'person':
    default: {
      for (let i = -1; i <= 1; i++) {
        const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.1, 6, 16), glossy(T, { emissiveIntensity: 0.25 }));
        body.position.set(i * 0.09, -0.06 + (i === 0 ? 0.02 : 0), i === 0 ? 0.03 : 0);
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.035, 20, 16), glossy(T, { emissiveIntensity: 0.25 }));
        head.position.set(i * 0.09, 0.06 + (i === 0 ? 0.02 : 0), i === 0 ? 0.03 : 0);
        g.add(body, head);
      }
      tick = (dt) => { g.rotation.y += dt * 0.4; };
    }
  }
  // Soft halo behind every component.
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), color: hex(T), opacity: 0.35, ...additive }));
  halo.scale.setScalar(type === 'lake' ? 1.1 : 0.55);
  halo.userData.noFit = true;
  g.add(halo);
  g.userData.halo = halo;
  g.userData.tick = tick ?? (() => {});
  return g;
}

/** Floating name label (billboard). sub is the zone name in a smaller line. */
export function makeLabel(text, sub, token) {
  const c = document.createElement('canvas');
  c.width = 768;
  c.height = 176;
  const ctx = c.getContext('2d');
  const r = 40;
  ctx.fillStyle = color('xr-arch-label-bg');
  ctx.beginPath();
  ctx.moveTo(r, 6);
  ctx.arcTo(c.width - 6, 6, c.width - 6, c.height - 6, r);
  ctx.arcTo(c.width - 6, c.height - 6, 6, c.height - 6, r);
  ctx.arcTo(6, c.height - 6, 6, 6, r);
  ctx.arcTo(6, 6, c.width - 6, 6, r);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = color(token);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let px = 64;
  do { ctx.font = font('black', px); px -= 2; } while (ctx.measureText(text).width > c.width - 60 && px > 30);
  ctx.fillStyle = color('xr-panel-text');
  ctx.fillText(text, c.width / 2, 72);
  ctx.font = font('bold', 34);
  ctx.fillStyle = color(token);
  ctx.fillText(sub, c.width / 2, 134);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(0.42, 0.096, 1);
  s.renderOrder = 5;
  s.userData.noFit = true;
  return s;
}

const KIND_TOKENS = { rt: 'xr-arch-flow-rt', batch: 'xr-arch-flow-batch', rep: 'xr-arch-flow-rep', meta: 'xr-arch-flow-meta', sec: 'xr-arch-flow-sec' };
const KIND_SPEED = { rt: 0.55, batch: 0.18, rep: 0.25, meta: 0.15, sec: 0.32 };

/**
 * All data flows as glowing arcs with packets travelling along them.
 * flows: [{ a: Vector3, b: Vector3, kind, from, to }]
 */
export class FlowNetwork {
  constructor(parent, flows) {
    this.group = new THREE.Group();
    this.group.userData.noFit = true;
    parent.add(this.group);
    this.flows = flows.map((f) => {
      const mid = f.a.clone().lerp(f.b, 0.5);
      mid.y += 0.25 + f.a.distanceTo(f.b) * 0.18;
      const curve = new THREE.QuadraticBezierCurve3(f.a, mid, f.b);
      const mat = new THREE.MeshBasicMaterial({ color: hex(KIND_TOKENS[f.kind]), opacity: 0.32, ...additive });
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.005, 5, false), mat);
      this.group.add(tube);
      curve.getLengths(60);
      return { ...f, curve, tube, mat, len: curve.getLength() };
    });
    // Packets: 2 per flow (rt: 3), as one Points cloud.
    this.packets = [];
    this.flows.forEach((f, i) => {
      const n = f.kind === 'rt' ? 3 : 2;
      for (let k = 0; k < n; k++) this.packets.push({ f: i, t: k / n + Math.random() * 0.1 });
    });
    const pos = new Float32Array(this.packets.length * 3);
    const col = new Float32Array(this.packets.length * 3);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.points = new THREE.Points(this.geo, new THREE.PointsMaterial({ size: 0.035, map: radialTexture(), vertexColors: true, sizeAttenuation: true, ...additive }));
    this.points.frustumCulled = false;
    this.group.add(this.points);
    this.focus = null;
    this.applyFocus();
  }

  /** Highlights the flows of one component (or all with null). */
  setFocus(id) {
    this.focus = id;
    this.applyFocus();
  }

  applyFocus() {
    const c = new THREE.Color();
    this.flows.forEach((f) => {
      const on = !this.focus || f.from === this.focus || f.to === this.focus;
      f.on = on;
      f.mat.opacity = this.focus ? (on ? 0.95 : 0.05) : 0.32;
    });
    const col = this.geo.attributes.color;
    this.packets.forEach((p, i) => {
      const f = this.flows[p.f];
      c.setHex(hex(KIND_TOKENS[f.kind])).multiplyScalar(f.on ? 1 : 0.06);
      col.setXYZ(i, c.r, c.g, c.b);
    });
    col.needsUpdate = true;
  }

  update(dt) {
    const pos = this.geo.attributes.position;
    const v = new THREE.Vector3();
    this.packets.forEach((p, i) => {
      const f = this.flows[p.f];
      p.t = (p.t + (dt * KIND_SPEED[f.kind]) / Math.max(0.6, f.len)) % 1;
      f.curve.getPointAt(p.t, v);
      pos.setXYZ(i, v.x, v.y, v.z);
    });
    pos.needsUpdate = true;
  }

  find(from, to) {
    return this.flows.find((f) => f.from === from && f.to === to);
  }
}

/** Zoned floor: a glowing sector per zone with its name, and a center circle. */
export function makeFloor(zones, R) {
  const g = new THREE.Group();
  g.userData.noFit = true;
  const base = new THREE.Mesh(new THREE.CircleGeometry(R * 1.75, 96), new THREE.MeshBasicMaterial({ color: hex('xr-arch-floor'), transparent: true, opacity: 0.35, depthWrite: false }));
  base.rotation.x = -Math.PI / 2;
  base.position.y = 0.001;
  g.add(base);
  for (const ring of [0.45, 1, 1.45]) {
    const m = new THREE.Mesh(new THREE.RingGeometry(R * ring - 0.006, R * ring + 0.006, 128), new THREE.MeshBasicMaterial({ color: hex('xr-arch-grid'), opacity: 0.45, ...additive }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.003;
    g.add(m);
  }
  for (const z of zones) {
    if (z.key === 'plat') continue;
    const a0 = z.angle;
    const r = R * z.r;
    // RingGeometry angles run counterclockwise from +x; our angle 0 is -z (in front), clockwise.
    const sector = new THREE.Mesh(new THREE.RingGeometry(r - 0.4, r + 0.4, 48, 1, -Math.PI / 2 - a0 - 0.5, 1.0), new THREE.MeshBasicMaterial({ color: hex(z.token), opacity: 0.16, side: THREE.DoubleSide, ...additive }));
    sector.rotation.x = -Math.PI / 2;
    sector.position.y = 0.004;
    g.add(sector);
  }
  return g;
}

/** Large zone title lying on the floor, readable from the center. */
export function makeFloorTitle(text, token) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 160;
  const ctx = c.getContext('2d');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font('black', 92);
  ctx.shadowColor = color(token);
  ctx.shadowBlur = 24;
  ctx.fillStyle = color(token);
  ctx.fillText(text.toUpperCase(), c.width / 2, c.height / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.85 }));
  m.rotation.x = -Math.PI / 2;
  m.userData.noFit = true;
  return m;
}

/** Thin light beam from the floor up to a component. */
export function makeBeam(height, token) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.012, height, 8, 1, true), new THREE.MeshBasicMaterial({ color: hex(token), opacity: 0.35, ...additive }));
  m.position.y = height / 2;
  m.userData.noFit = true;
  return m;
}
