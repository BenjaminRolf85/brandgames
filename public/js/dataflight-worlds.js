// Datenflug, more variety: the four worlds the flight passes through (data highway, data center,
// data storm, firewall tunnel) with their own props, data gates to fly through, power-ups
// (shield, magnet, slow motion) and the final boss, the hacker mothership, with three cores that
// Echo's antivirus pulses destroy. Everything procedural, all colors from design tokens.
import * as THREE from 'three';
import { hex, color } from './tokens.js';
import { radialTexture } from './robot-visuals.js';

const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
const col = (token) => new THREE.Color(hex(token));
const rnd = (a, b) => a + Math.random() * (b - a);

/**
 * The worlds in flight order: vortex colors (a, b, c), the space color, the streak colors, the
 * texts (name and what is special) and what spawns more often there.
 */
export const WORLDS = [
  { key: 'highway', a: 'xr-flight-vortex-a', b: 'xr-flight-vortex-b', c: 'xr-flight-vortex-c', space: 'xr-flight-space',
    streaks: ['xr-flight-streak-1', 'xr-flight-streak-2', 'xr-flight-streak-3', 'xr-flight-streak-4'] },
  { key: 'center', a: 'xr-flight-w2-a', b: 'xr-flight-w2-b', c: 'xr-flight-w2-c', space: 'xr-flight-w2-space',
    streaks: ['xr-flight-w2-a', 'xr-flight-w2-c', 'xr-flight-rack-led-2', 'xr-flight-w2-a'] },
  { key: 'storm', a: 'xr-flight-w3-a', b: 'xr-flight-w3-b', c: 'xr-flight-w3-c', space: 'xr-flight-w3-space',
    streaks: ['xr-flight-w3-a', 'xr-flight-w3-c', 'xr-flight-storm-flash', 'xr-flight-w3-a'] },
  { key: 'firewall', a: 'xr-flight-w4-a', b: 'xr-flight-w4-b', c: 'xr-flight-w4-c', space: 'xr-flight-w4-space',
    streaks: ['xr-flight-w4-a', 'xr-flight-w4-c', 'xr-flight-firewall', 'xr-flight-w4-b'] },
];

/** Line icons on a 24 grid for the power-ups (drawn into their orbs). */
const POWER_ICONS = {
  shield: 'M12 3l7.5 3v5.2c0 4.6-3.1 8.1-7.5 9.8-4.4-1.7-7.5-5.2-7.5-9.8V6z',
  magnet: 'M6 4v8a6 6 0 0 0 12 0V4M6 4h3.5v8a2.5 2.5 0 0 0 5 0V4H18M6 8h3.5M14.5 8H18',
  slow: 'M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9',
};
export const POWER_TOKEN = { shield: 'xr-flight-shield', magnet: 'xr-flight-magnet', slow: 'xr-flight-slow' };

function iconTexture(kind) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.translate(64, 64);
  ctx.scale(3.6, 3.6);
  ctx.translate(-12, -12);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = color('xr-panel-text');
  ctx.lineWidth = 2.2;
  ctx.shadowColor = color(POWER_TOKEN[kind]);
  ctx.shadowBlur = 4;
  ctx.stroke(new Path2D(POWER_ICONS[kind]));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- world props ----------

/** Rows of server racks at both sides with blinking LEDs (world 2, data center). */
export function makeRacks({ center, far = -11, near = 1.2 }) {
  const g = new THREE.Group();
  g.userData.noFit = true;
  // LED front: a canvas with rows of small lights in two colors.
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 64, 256);
  for (let y = 8; y < 250; y += 12) {
    for (let x = 6; x < 60; x += 8) {
      if (Math.random() < 0.55) continue;
      ctx.fillStyle = color(Math.random() < 0.7 ? 'xr-flight-rack-led' : 'xr-flight-rack-led-2');
      ctx.fillRect(x, y, 4, 3);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(2, y + 6, 60, 1);
  }
  const led = new THREE.CanvasTexture(c);
  led.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshStandardMaterial({ color: hex('xr-flight-rack'), metalness: 0.6, roughness: 0.45, emissive: 0xffffff, emissiveMap: led, emissiveIntensity: 1.4, transparent: true, opacity: 0 });
  const N = 18;
  const geo = new THREE.BoxGeometry(0.42, 1.9, 0.62);
  const racks = new THREE.InstancedMesh(geo, mat, N);
  racks.frustumCulled = false;
  const R = Array.from({ length: N }, (_, i) => ({ side: i % 2 ? 1 : -1, z: far + Math.floor(i / 2) * ((near - far) / (N / 2)) }));
  g.add(racks);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  g.userData.tick = (dt, speed, floorY) => {
    R.forEach((r, i) => {
      r.z += speed * dt;
      if (r.z > near) r.z -= near - far;
      // The LED side faces the flight axis.
      q.setFromAxisAngle(up, r.side * Math.PI / 2);
      m.compose(new THREE.Vector3(center.x + r.side * 1.35, floorY + 0.95, r.z), q, new THREE.Vector3(1, 1, 1));
      racks.setMatrixAt(i, m);
    });
    racks.instanceMatrix.needsUpdate = true;
  };
  g.userData.setAmount = (k) => { g.visible = k > 0.01; mat.opacity = k; };
  g.userData.setAmount(0);
  return g;
}

/** Lightning bolts in the data storm (world 3): strike() draws a new one that flashes and fades. */
export function makeStorm({ center }) {
  const g = new THREE.Group();
  g.userData.noFit = true;
  const bolts = Array.from({ length: 3 }, () => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(14 * 3), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: hex('xr-flight-storm-flash'), ...additive, opacity: 0 }));
    line.frustumCulled = false;
    g.add(line);
    return { line, life: 0 };
  });
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), color: hex('xr-flight-storm-flash'), ...additive, opacity: 0 }));
  glow.scale.set(9, 6, 1);
  glow.position.set(center.x, center.y + 1.5, -7);
  g.add(glow);
  let n = 0;
  g.userData.strike = () => {
    const b = bolts[n++ % bolts.length];
    const pos = b.line.geometry.attributes.position;
    const side = Math.random() < 0.5 ? -1 : 1;
    let x = center.x + side * rnd(1.2, 3.2);
    let y = center.y + 3;
    const z = rnd(-8, -3);
    for (let i = 0; i < 14; i++) {
      pos.setXYZ(i, x, y, z + rnd(-0.2, 0.2));
      x += rnd(-0.35, 0.35);
      y -= rnd(0.2, 0.42);
    }
    pos.needsUpdate = true;
    b.life = 1;
    glow.position.x = center.x + side * 2;
    glow.material.opacity = 0.55;
  };
  g.userData.tick = (dt) => {
    for (const b of bolts) {
      b.life = Math.max(0, b.life - dt * 4);
      // Flickers while it fades.
      b.line.material.opacity = b.life * (0.6 + 0.4 * Math.random());
    }
    glow.material.opacity = Math.max(0, glow.material.opacity - dt * 2.2);
  };
  return g;
}

/** Hexagon rings rushing past around the flight axis (world 4, firewall tunnel). */
export function makeFirewall({ center, far = -11, near = 1.2 }) {
  const g = new THREE.Group();
  g.userData.noFit = true;
  const mat = new THREE.MeshBasicMaterial({ color: hex('xr-flight-firewall'), ...additive, opacity: 0, side: THREE.DoubleSide });
  const geo = new THREE.RingGeometry(1.18, 1.26, 6, 1);
  const N = 8;
  const rings = Array.from({ length: N }, (_, i) => {
    const r = new THREE.Mesh(geo, mat);
    r.position.set(center.x, center.y + 0.1, far + i * ((near - far) / N));
    r.rotation.z = i * 0.2;
    r.frustumCulled = false;
    g.add(r);
    return r;
  });
  // A faint hexagon grid inside each ring (the firewall's mesh).
  const grid = new THREE.MeshBasicMaterial({ color: hex('xr-flight-firewall'), ...additive, opacity: 0, side: THREE.DoubleSide, wireframe: true });
  const gGeo = new THREE.CircleGeometry(1.18, 6, 0);
  rings.forEach((r) => r.add(new THREE.Mesh(gGeo, grid)));
  let amount = 0;
  g.userData.tick = (dt, speed, time) => {
    for (const r of rings) {
      r.position.z += speed * dt;
      if (r.position.z > near) r.position.z -= near - far;
      r.rotation.z += dt * 0.15;
      // Fades in from far away, out before it reaches you.
      const k = THREE.MathUtils.clamp((r.position.z - far) / 2, 0, 1) * THREE.MathUtils.clamp((0.6 - r.position.z) / 1.4, 0, 1);
      r.scale.setScalar(1 + 0.03 * Math.sin(time * 4 + r.position.z));
      r.visible = k > 0.02;
      r.children[0].visible = k > 0.02;
    }
    mat.opacity = amount * 0.7;
    grid.opacity = amount * 0.05;
  };
  g.userData.setAmount = (k) => { amount = k; g.visible = k > 0.01; };
  g.userData.setAmount(0);
  return g;
}

/** A big ring that flies at you when the next world begins. */
export function makePortal() {
  const g = new THREE.Group();
  g.userData.noFit = true;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.035, 12, 96), new THREE.MeshBasicMaterial({ color: 0xffffff, ...additive, opacity: 0.95 }));
  const inner = new THREE.Mesh(new THREE.TorusGeometry(1.18, 0.012, 8, 96), new THREE.MeshBasicMaterial({ color: 0xffffff, ...additive, opacity: 0.6 }));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), color: 0xffffff, ...additive, opacity: 0.35 }));
  glow.scale.setScalar(3.6);
  g.add(ring, inner, glow);
  g.visible = false;
  g.userData.setColor = (token) => {
    const c = col(token);
    ring.material.color.copy(c);
    inner.material.color.copy(c);
    glow.material.color.copy(c);
  };
  g.userData.setFade = (k) => {
    ring.material.opacity = 0.95 * k;
    inner.material.opacity = 0.6 * k;
    glow.material.opacity = 0.35 * k;
  };
  return g;
}

// ---------- gates and power-ups ----------

/** A data gate: fly through its middle. setState('open' | 'done'). */
export function makeGate() {
  const g = new THREE.Group();
  g.userData.noFit = true;
  const mat = new THREE.MeshStandardMaterial({ color: hex('xr-flight-gate'), emissive: hex('xr-flight-gate'), emissiveIntensity: 1.2, metalness: 0.4, roughness: 0.3, transparent: true });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.014, 12, 48), mat);
  // Four small markers on the ring, like a target.
  const marks = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.012, 0.02), mat);
    const a = (i * Math.PI) / 2;
    m.position.set(Math.cos(a) * 0.2, Math.sin(a) * 0.2, 0);
    m.rotation.z = a;
    marks.add(m);
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), color: hex('xr-flight-gate'), ...additive, opacity: 0.45 }));
  glow.scale.setScalar(0.62);
  g.add(ring, marks, glow);
  g.userData.ring = ring;
  g.userData.setFade = (k) => { mat.opacity = k; glow.material.opacity = 0.45 * k; };
  g.userData.setState = (s) => {
    const c = col(s === 'done' ? 'xr-flight-gate-done' : 'xr-flight-gate');
    mat.color.copy(c);
    mat.emissive.copy(c);
    glow.material.color.copy(c);
  };
  g.userData.tick = (time) => { marks.rotation.z = time * 1.5; };
  g.userData.dispose = () => { mat.dispose(); glow.material.dispose(); };
  return g;
}

/** A power-up: a glowing orb with its icon. kind: 'shield' | 'magnet' | 'slow'. */
export function makePowerUp(kind) {
  const g = new THREE.Group();
  g.userData.noFit = true;
  const token = POWER_TOKEN[kind];
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 3), new THREE.MeshStandardMaterial({ color: hex(token), emissive: hex(token), emissiveIntensity: 0.6, metalness: 0.2, roughness: 0.15, transparent: true, opacity: 0.55 }));
  const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTexture(kind), transparent: true, depthWrite: false }));
  icon.scale.setScalar(0.085);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), color: hex(token), ...additive, opacity: 0.7 }));
  glow.scale.setScalar(0.32);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.004, 8, 40), new THREE.MeshBasicMaterial({ color: hex(token), ...additive, opacity: 0.9 }));
  g.add(glow, orb, icon, halo);
  g.userData.tick = (time) => {
    halo.rotation.set(time * 1.3, time * 0.9, 0);
    glow.material.opacity = 0.55 + 0.2 * Math.sin(time * 6);
  };
  g.userData.dispose = () => {
    orb.material.dispose();
    icon.material.map.dispose();
    icon.material.dispose();
    glow.material.dispose();
    halo.material.dispose();
  };
  return g;
}

/** The shield bubble around Echo (fresnel glow). setFade(0..1). */
export function makeShieldBubble() {
  const uniforms = { uColor: { value: col('xr-flight-shield') }, uFade: { value: 0 }, uTime: { value: 0 } };
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.15, 32, 20), new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vP;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        vP = position;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uFade;
      uniform float uTime;
      varying vec3 vN;
      varying vec3 vV;
      varying vec3 vP;
      void main() {
        float rim = pow(1.0 - abs(dot(vN, vV)), 2.5);
        float hex = 0.5 + 0.5 * sin(vP.y * 90.0 + uTime * 3.0) * sin(vP.x * 90.0);
        gl_FragColor = vec4(uColor, (rim * 0.85 + hex * 0.06) * uFade);
      }`,
    ...additive,
  }));
  m.userData.noFit = true;
  m.userData.setFade = (k) => { uniforms.uFade.value = k; m.visible = k > 0.01; };
  m.userData.tick = (time) => { uniforms.uTime.value = time; };
  m.userData.flash = () => { uniforms.uColor.value.copy(col('xr-panel-text')); setTimeout(() => uniforms.uColor.value.copy(col('xr-flight-shield')), 160); };
  m.visible = false;
  return m;
}

/** Two rings that circle Echo while the magnet works. */
export function makeMagnetRings() {
  const g = new THREE.Group();
  g.userData.noFit = true;
  const mat = new THREE.MeshBasicMaterial({ color: hex('xr-flight-magnet'), ...additive, opacity: 0.8 });
  const a = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.004, 8, 60), mat);
  const b = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.003, 8, 60), mat);
  g.add(a, b);
  g.visible = false;
  g.userData.tick = (time, k) => {
    g.visible = k > 0.01;
    mat.opacity = 0.8 * k;
    a.rotation.set(time * 2, time * 1.3, 0);
    b.rotation.set(-time * 1.4, 0, time * 1.8);
  };
  return g;
}

// ---------- the final boss ----------

/**
 * The hacker mothership: a saucer with a glowing rim, a glass dome (the hacker sits inside when
 * the model is loaded) and three cores at the front that Echo's antivirus pulses destroy.
 * userData: cores [{ mesh, glow, hp }], tick(dt, time), hitCore(i), coreWorld(i, v).
 */
export function makeBoss(hacker = null, coreHp = 4) {
  const g = new THREE.Group();
  g.userData.noFit = true;
  const ship = new THREE.Group();
  g.add(ship);
  const profile = [[0, 0.2], [0.18, 0.19], [0.42, 0.14], [0.78, 0.06], [1.0, 0.0], [0.9, -0.05], [0.62, -0.1], [0.3, -0.15], [0, -0.17]].map(([x, y]) => new THREE.Vector2(x, y));
  const hull = new THREE.Mesh(new THREE.LatheGeometry(profile, 64), new THREE.MeshStandardMaterial({ color: hex('xr-flight-boss-hull'), metalness: 0.75, roughness: 0.32 }));
  ship.add(hull);
  // Panel ring: a darker metal band with ridges.
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.86, 0.96, 0.05, 64, 1, true), new THREE.MeshStandardMaterial({ color: hex('xr-flight-boss-metal'), metalness: 0.8, roughness: 0.4, side: THREE.DoubleSide }));
  band.position.y = 0.025;
  ship.add(band);
  const rimMat = new THREE.MeshBasicMaterial({ color: hex('xr-flight-boss-rim'), toneMapped: false });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.018, 10, 96), rimMat);
  rim.rotation.x = Math.PI / 2;
  ship.add(rim);
  // Running lights along the rim.
  const NL = 24;
  const lights = new THREE.InstancedMesh(new THREE.SphereGeometry(0.022, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), NL);
  const lc = col('xr-flight-boss-rim');
  const lc2 = col('xr-flight-boss-core');
  ship.add(lights);
  // Dome with the pilot.
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.3, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: hex('xr-flight-boss-core'), transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0, clearcoat: 1, depthWrite: false }));
  dome.position.y = 0.17;
  ship.add(dome);
  if (hacker) {
    hacker.scale.setScalar(0.55);
    hacker.position.set(0, 0.16, 0);
    ship.add(hacker);
  }
  const domeGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), color: hex('xr-flight-boss-rim'), ...additive, opacity: 0.35 }));
  domeGlow.scale.setScalar(0.9);
  domeGlow.position.y = 0.3;
  ship.add(domeGlow);
  // Three cores at the front underside, facing you.
  const cores = [-0.55, 0, 0.55].map((a) => {
    const holder = new THREE.Group();
    holder.position.set(Math.sin(a) * 0.66, -0.07, Math.cos(a) * 0.66);
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.06, 6), new THREE.MeshStandardMaterial({ color: hex('xr-flight-boss-metal'), metalness: 0.8, roughness: 0.35 }));
    shell.rotation.x = Math.PI / 2;
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 2), new THREE.MeshStandardMaterial({ color: hex('xr-flight-boss-core'), emissive: hex('xr-flight-boss-core'), emissiveIntensity: 1.4, roughness: 0.2 }));
    mesh.position.z = 0.04;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), color: hex('xr-flight-boss-rim'), ...additive, opacity: 0.8 }));
    glow.scale.setScalar(0.42);
    glow.position.z = 0.06;
    holder.add(shell, mesh, glow);
    ship.add(holder);
    return { holder, mesh, glow, hp: coreHp, flash: 0 };
  });
  ship.rotation.x = 0.32; // tilted towards the player, so the cores face you
  g.userData.cores = cores;
  g.userData.ship = ship;
  g.userData.alive = () => cores.some((c) => c.hp > 0);
  g.userData.coreWorld = (i, v = new THREE.Vector3()) => cores[i].mesh.getWorldPosition(v);
  g.userData.hitCore = (i) => {
    const c = cores[i];
    if (c.hp <= 0) return false;
    c.hp -= 1;
    c.flash = 1;
    if (c.hp <= 0) {
      c.mesh.material.emissiveIntensity = 0.05;
      c.mesh.material.color.copy(col('xr-flight-boss-hull'));
      c.glow.visible = false;
      return true;
    }
    return false;
  };
  const m = new THREE.Matrix4();
  g.userData.tick = (dt, time) => {
    ship.rotation.y = Math.sin(time * 0.6) * 0.12;
    for (let i = 0; i < NL; i++) {
      const a = (i / NL) * Math.PI * 2 + time * 0.8;
      m.makeTranslation(Math.cos(a) * 1.0, 0, Math.sin(a) * 1.0);
      lights.setMatrixAt(i, m);
      const on = (i + Math.floor(time * 8)) % 4 === 0;
      lights.setColorAt(i, on ? lc2 : lc);
    }
    lights.instanceMatrix.needsUpdate = true;
    if (lights.instanceColor) lights.instanceColor.needsUpdate = true;
    domeGlow.material.opacity = 0.3 + 0.12 * Math.sin(time * 5);
    for (const c of cores) {
      c.flash = Math.max(0, c.flash - dt * 4);
      if (c.hp > 0) {
        c.glow.material.opacity = 0.6 + 0.25 * Math.sin(time * 7 + c.holder.position.x * 5) + c.flash;
        c.mesh.scale.setScalar(1 + c.flash * 0.35);
      }
    }
  };
  return g;
}

/** Echo's antivirus pulse: a bright bolt flying to a core of the mothership. */
export function makePulse() {
  const g = new THREE.Group();
  g.userData.noFit = true;
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), color: hex('xr-flight-pulse'), ...additive, opacity: 0.95 }));
  glow.scale.setScalar(0.16);
  const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), color: 0xffffff, ...additive, opacity: 0.9 }));
  core.scale.setScalar(0.06);
  g.add(glow, core);
  g.userData.dispose = () => { glow.material.dispose(); core.material.dispose(); };
  return g;
}
