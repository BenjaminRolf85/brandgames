// Datenflug visuals, in the look of the game coin: Echo with VR goggles and a swirl trail, good
// data as glowing wire crystals, bad data as glitching red blocks with an X, the data vortex they
// come out of, speed streaks, binary streams, holo windows, crystals and sparkles flying past,
// a moving circuit floor and the database that fills up. Instanced where there are many parts
// (one draw call each), so the headset keeps its frame rate. All colors from design tokens.
import * as THREE from 'three';
import { hex, color, font } from './tokens.js';
import { radialTexture } from './robot-visuals.js';
import { loadEchoParts, bendWing } from './echo-mascot.js';
import { EchoFace } from './echo-face.js';
import { loadGLTF } from './models.js';
import { makeRainCurtain } from './pong-rain.js';
import { RibbonTrail } from './pong-shaders.js';
import { sceneLook, bloom, gfxTier } from './gfx.js';

export const GOGGLES_URL = 'assets/models/echo-goggles.glb';

// ---------- scene look (graphics pass, Nov 2026) ----------

/**
 * Tone mapping and a soft studio environment (reflections on Echo's goggles, the coins, the
 * hacker's laptop and the mothership's hull), a warm key light and a rim light in the current
 * world's color from the vortex, and bloom on the desktop (threshold above white, so only the
 * glowing data and neon glow, not the UI). Scales with gfxTier(); the headset never gets post
 * effects. Returns { neon, setRim(color) }.
 */
export function flightLook(scene) {
  const e = scene.engine;
  const tier = gfxTier();
  scene.onSceneDispose(sceneLook(e, { tone: 'neutral', exposure: 1.08, env: 'studio', envIntensity: 0.6, shadows: false }));
  // The preview's flat white lights give way to the key and the world-colored rim light.
  const sun = e.scene.children.find((o) => o.isDirectionalLight);
  const prev = { hemi: e.hemi.intensity, sun: sun?.intensity };
  e.hemi.intensity = 0.6;
  if (sun) sun.intensity = 0.3;
  scene.onSceneDispose(() => {
    e.hemi.intensity = prev.hemi;
    if (sun) sun.intensity = prev.sun;
  });
  const key = new THREE.DirectionalLight(hex('xr-flight-key-light'), 1.5);
  key.position.set(0.6, scene.eye + 1.4, 0.8); // above and behind the player
  key.target.position.set(0, scene.eye - 0.3, -2);
  const rim = new THREE.DirectionalLight(hex('xr-flight-good'), 2.2);
  rim.position.set(0, scene.eye + 0.4, -6); // from the vortex, towards the player
  rim.target.position.set(0, scene.eye - 0.2, 0);
  scene.group.add(key, key.target, rim, rim.target);
  let neon = 1;
  if (tier === 'high' && !e.isXR && !e.touchUI) {
    neon = 1.6;
    scene.onSceneDispose(bloom(e, { strength: 0.6, radius: 0.55, threshold: 1.0 }));
  }
  return { neon, setRim: (c) => rim.color.copy(c) };
}
const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
const col = (token) => new THREE.Color(hex(token));

// ---------- Echo with VR goggles ----------

/** Token materials for the Blender goggles (blender/build_goggles.py). */
function goggleMaterial(name) {
  switch (name) {
    case 'GoggleFrame': return new THREE.MeshPhysicalMaterial({ name, color: hex('xr-echo-goggle-frame'), metalness: 0.65, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.1 });
    case 'GoggleStrap': return new THREE.MeshStandardMaterial({ name, color: hex('xr-echo-goggle-strap'), roughness: 0.65 });
    case 'GoggleLens': return new THREE.MeshPhysicalMaterial({ name, color: hex('xr-echo-goggle-lens'), roughness: 0.04, metalness: 0, clearcoat: 1, transparent: true, opacity: 0.3, depthWrite: false });
    case 'GoggleGlow': return new THREE.MeshBasicMaterial({ name, color: hex('xr-echo-goggle-glow'), toneMapped: false });
    default: return null;
  }
}

/**
 * Echo flying through the data stream. The scene sets group.position; update() flaps the
 * wings, banks with the movement, shows hits and joy, and draws the swirl trail.
 * turn: 0 = flies into the stream (back to the player, a bit turned), 1 = faces the player.
 */
export class FlightEcho {
  constructor(parent, size = 0.16) {
    this.size = size;
    this.group = new THREE.Group();
    this.group.userData.noFit = true;
    this.body = new THREE.Group();
    this.group.add(this.body);
    parent.add(this.group);
    this.trail = new RibbonTrail(parent, 18, size * 0.2);
    this.trailColor = col('xr-flight-trail');
    this.time = 0;
    this.turn = 1;
    this.wantTurn = 1;
    this.hurtT = 0;
    this.joyT = 0;
    this.last = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.lookAt = new THREE.Vector3();
    Promise.all([loadEchoParts(), loadGLTF(GOGGLES_URL).catch(() => null)])
      .then(([parts, goggles]) => this.attach(parts, goggles))
      .catch((e) => console.warn('Echo not loaded', e));
  }

  attach({ model, wings, face }, goggles) {
    if (this.disposed) return;
    model.scale.setScalar(this.size);
    if (goggles) {
      const g = goggles.scene.clone(true);
      g.traverse((o) => {
        if (!o.isMesh) return;
        const m = goggleMaterial(o.material.name);
        if (m) o.material = m;
        o.renderOrder = o.material.transparent ? 2 : 0;
      });
      model.add(g);
    }
    this.body.add(model);
    this.model = model;
    this.wings = wings;
    this.face = new EchoFace(face);
    this.face.setMood('focus');
  }

  hurt() { this.hurtT = 1; this.face?.setMood('dizzy', 1.1); }
  joy() { this.joyT = 1; this.face?.setMood('happy', 0.6); }

  /** flow: how fast the world streams past (m/s), so the trail streams towards the player. */
  update(dt, { flow = 0, blink = false, lookWorld = null } = {}) {
    this.time += dt;
    const t = this.time;
    const p = this.group.position;
    const idt = 1 / Math.max(dt, 1e-3);
    this.vel.set((p.x - this.last.x) * idt, (p.y - this.last.y) * idt, (p.z - this.last.z) * idt);
    this.last.copy(p);
    this.hurtT = Math.max(0, this.hurtT - dt * 1.2);
    this.joyT = Math.max(0, this.joyT - dt * 2);
    this.turn += (this.wantTurn - this.turn) * Math.min(1, dt * 4);
    const vx = THREE.MathUtils.clamp(this.vel.x, -3, 3);
    const vy = THREE.MathUtils.clamp(this.vel.y, -3, 3);
    // Heading: into the stream, turned so you see the goggles from the side; after a catch
    // Echo glances back at you for a moment.
    const yaw = Math.PI + 0.85 - vx * 0.18 - this.joyT * 0.9;
    this.body.rotation.set(
      -vy * 0.12 * (1 - this.turn) + Math.sin(t * 2.3) * 0.04,
      yaw * (1 - this.turn),
      -vx * 0.22 * (1 - this.turn) + Math.sin(t * 40) * 0.35 * this.hurtT,
    );
    this.body.position.y = Math.sin(t * 3.1) * this.size * 0.06;
    this.body.scale.setScalar(1 + Math.min(1, this.joyT * 2) * 0.1);
    if (this.model) {
      this.model.visible = !blink || Math.sin(t * 30) > 0;
      // Fast wing beats while flying, harder when climbing.
      const beat = Math.sin(t * (13 + Math.max(0, vy) * 4));
      this.wings.forEach((w) => bendWing(w, 0.3 + beat * (0.5 + Math.max(0, vy) * 0.15)));
      this.face.update(dt, lookWorld);
    }
    // Swirl trail, sampled 60 times a second whatever the frame rate: older points drift
    // towards the player with the stream, about 0.35 m in all, so it never reaches your face.
    const head = this.group.getWorldPosition(new THREE.Vector3());
    this.trail.mesh.parent.worldToLocal(head);
    head.z += this.size * 0.35;
    this.trailHead ??= head.clone();
    const steps = Math.min(this.trail.n, Math.max(1, Math.round(dt * 60)));
    const drift = flow > 0.1 ? 0.35 / this.trail.n : 0;
    const strength = (0.3 + Math.min(1, flow / 5) * 0.3) * (this.group.visible ? 1 : 0);
    const h = new THREE.Vector3();
    for (let i = 1; i <= steps; i++) {
      for (const q of this.trail.points) q.z += drift;
      this.trail.update(h.lerpVectors(this.trailHead, head, i / steps), this.trailColor, strength, 1 + this.hurtT);
    }
    this.trailHead.copy(head);
  }

  dispose() { this.disposed = true; }
}

// ---------- shaders ----------

// Wire crystal: bright edges (barycentric), a faint glassy fill with a fresnel rim.
const CRYSTAL_VS = /* glsl */ `
  attribute vec3 bary;
  attribute vec3 aColor;
  attribute float aFade;
  varying vec3 vBary;
  varying vec3 vColor;
  varying float vFade;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    vBary = bary;
    vColor = aColor;
    vFade = aFade;
    vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
    vView = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const CRYSTAL_FS = /* glsl */ `
  varying vec3 vBary;
  varying vec3 vColor;
  varying float vFade;
  varying vec3 vN;
  varying vec3 vView;
  void main() {
    vec3 d = fwidth(vBary);
    vec3 a = smoothstep(vec3(0.0), d * 1.8, vBary);
    float edge = 1.0 - min(min(a.x, a.y), a.z);
    float fres = pow(1.0 - abs(dot(normalize(vN), vView)), 2.0);
    vec3 c = vColor * (0.45 + fres * 0.9) + mix(vColor, vec3(1.0), 0.2) * edge * 1.3;
    float alpha = (0.32 + fres * 0.45 + edge) * vFade;
    gl_FragColor = vec4(c, alpha);
  }
`;

// Bad data block: dark body, glowing edges and an X, glitch slices that jump sideways.
const BLOCK_VS = /* glsl */ `
  attribute float aFade;
  attribute float aSeed;
  varying vec2 vUv;
  varying float vFade;
  varying float vSeed;
  void main() {
    vUv = uv;
    vFade = aFade;
    vSeed = aSeed;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;
const BLOCK_FS = /* glsl */ `
  uniform float uTime;
  uniform vec3 uBody;
  uniform vec3 uGlow;
  uniform vec3 uHot;
  varying vec2 vUv;
  varying float vFade;
  varying float vSeed;
  float h(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    vec2 uv = vUv;
    float row = floor(uv.y * 7.0);
    float g = step(0.8, h(row * 13.1 + floor(uTime * 9.0 + vSeed * 10.0)));
    uv.x = fract(uv.x + g * 0.17);
    float e = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    float edge = 1.0 - smoothstep(0.05, 0.12, e);
    float x = 1.0 - smoothstep(0.04, 0.075, min(abs(uv.x - uv.y), abs(uv.x + uv.y - 1.0)));
    x *= step(0.2, uv.x) * step(uv.x, 0.8) * step(0.2, uv.y) * step(uv.y, 0.8);
    float scan = 0.5 + 0.5 * sin(uv.y * 60.0 + uTime * 12.0);
    float flick = 0.75 + 0.25 * sin(uTime * 23.0 + vSeed * 40.0);
    vec3 c = uBody * (0.7 + 0.3 * scan) + uGlow * (edge * 1.3 + x * 1.6) * flick + uHot * g * 0.45;
    gl_FragColor = vec4(c, 0.94 * vFade);
  }
`;

// Camera-facing quads (halos, sparkles): the instance matrix only holds the position.
const BILL_VS = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  attribute float aFade;
  attribute float aSeed;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vFade;
  varying float vSeed;
  void main() {
    vUv = uv;
    vColor = aColor;
    vFade = aFade;
    vSeed = aSeed;
    vec4 mv = modelViewMatrix * vec4(instanceMatrix[3].xyz, 1.0);
    mv.xy += position.xy * aSize;
    gl_Position = projectionMatrix * mv;
  }
`;
const HALO_FS = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vFade;
  void main() {
    float r = length(vUv * 2.0 - 1.0);
    float a = pow(max(0.0, 1.0 - r), 2.4);
    gl_FragColor = vec4(vColor, a * vFade);
  }
`;
const SPARK_FS = /* glsl */ `
  uniform float uTime;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vFade;
  varying float vSeed;
  void main() {
    vec2 p = abs(vUv * 2.0 - 1.0);
    float core = exp(-dot(p, p) * 26.0);
    float rays = exp(-p.x * 34.0) * exp(-p.y * 2.6) + exp(-p.y * 34.0) * exp(-p.x * 2.6);
    float tw = 0.45 + 0.55 * sin(uTime * 3.0 + vSeed * 20.0);
    gl_FragColor = vec4(vColor, (core + rays * 0.85) * tw * vFade);
  }
`;

// Speed streak: a thin quad along the flight, bright at its head (towards the player).
const STREAK_VS = /* glsl */ `
  attribute vec3 aColor;
  varying vec2 vUv;
  varying vec3 vColor;
  void main() {
    vUv = uv;
    vColor = aColor;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;
const STREAK_FS = /* glsl */ `
  uniform float uBoost;
  varying vec2 vUv;
  varying vec3 vColor;
  void main() {
    float across = 1.0 - pow(abs(vUv.x * 2.0 - 1.0), 2.0);
    float along = pow(vUv.y, 2.2);
    gl_FragColor = vec4(vColor, across * along * (0.55 + uBoost * 0.45));
  }
`;

// Holo windows: one atlas with four window types.
const HOLO_VS = /* glsl */ `
  attribute vec2 aCell;
  attribute float aFade;
  varying vec2 vUv;
  varying float vFade;
  void main() {
    vUv = uv * 0.5 + aCell * 0.5;
    vFade = aFade;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;
const HOLO_FS = /* glsl */ `
  uniform sampler2D uMap;
  uniform float uTime;
  varying vec2 vUv;
  varying float vFade;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    float scan = 0.82 + 0.18 * sin(vUv.y * 420.0 - uTime * 6.0);
    gl_FragColor = vec4(t.rgb * scan, t.a * vFade);
  }
`;

const VORTEX_FS = /* glsl */ `
  uniform float uTime;
  uniform vec3 uA;
  uniform vec3 uB;
  uniform vec3 uC;
  uniform vec3 uCore;
  uniform float uBoost;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r = length(p);
    float a = atan(p.y, p.x);
    // Spiral arms that wind into the center, tunnel rings that rush outwards.
    float arms = pow(0.5 + 0.5 * sin(a * 5.0 + 2.6 / (r + 0.18) - uTime * 1.6), 3.0);
    float arms2 = pow(0.5 + 0.5 * sin(-a * 3.0 + 1.8 / (r + 0.25) - uTime * 0.9), 4.0);
    float rings = pow(0.5 + 0.5 * sin(log(r + 0.03) * 16.0 - uTime * (3.5 + uBoost * 3.0)), 8.0);
    float core = exp(-r * r * 30.0);
    float fall = smoothstep(1.0, 0.35, r);
    vec3 c = mix(uB, uA, arms) * arms * 1.1 + uC * arms2 * 0.6 + uA * rings * 0.7 + uCore * core * 1.4;
    float alpha = (arms * 0.8 + arms2 * 0.4 + rings * 0.6 * smoothstep(0.05, 0.3, r) + core) * fall;
    gl_FragColor = vec4(c, alpha);
  }
`;
const UV_VS = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

// ---------- geometry helpers ----------

/** Non-indexed geometry with barycentric coordinates (for the wire crystal shader). */
function withBary(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count;
  const b = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) b[i * 3 + (i % 3)] = 1;
  g.setAttribute('bary', new THREE.BufferAttribute(b, 3));
  g.computeVertexNormals();
  return g;
}

/** A gem: a bipyramid with `sides` sides, top height ht, bottom height hb. */
export function gemGeometry(r = 1, ht = 0.8, hb = 1.25, sides = 4) {
  const pos = [];
  const ring = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 + Math.PI / sides;
    ring.push([Math.cos(a) * r, 0, Math.sin(a) * r]);
  }
  for (let i = 0; i < sides; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % sides];
    pos.push(0, ht, 0, ...b, ...a);
    pos.push(0, -hb, 0, ...a, ...b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return withBary(g);
}

function instAttr(geo, name, size, count) {
  const a = new THREE.InstancedBufferAttribute(new Float32Array(count * size), size);
  a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute(name, a);
  return a;
}

function instanced(geo, material, count) {
  const m = new THREE.InstancedMesh(geo, material, count);
  m.frustumCulled = false;
  m.userData.noFit = true;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < count; i++) m.setMatrixAt(i, zero);
  return m;
}

// ---------- the data that flies at Echo ----------

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpE = new THREE.Euler();

/** Label texture for a data type (cached per text and kind). */
const labelCache = new Map();
function labelTexture(text, good) {
  const key = `${good ? 'g' : 'b'}:${text}`;
  if (labelCache.has(key)) return labelCache.get(key);
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 112;
  const ctx = c.getContext('2d');
  ctx.font = font('black', 56);
  const w = Math.min(500, ctx.measureText(text.toUpperCase()).width + 64);
  const x0 = (512 - w) / 2;
  ctx.fillStyle = color(good ? 'xr-flight-label-good' : 'xr-flight-label-bad');
  ctx.beginPath();
  ctx.roundRect(x0, 8, w, 96, 48);
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = color(good ? 'xr-flight-good' : 'xr-flight-bad');
  ctx.stroke();
  ctx.fillStyle = color(good ? 'xr-flight-good' : 'xr-flight-bad-hot');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let px = 56;
  while (ctx.measureText(text.toUpperCase()).width > w - 40 && px > 30) { px -= 2; ctx.font = font('black', px); }
  ctx.fillText(text.toUpperCase(), 256, 60);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  labelCache.set(key, tex);
  return tex;
}

/**
 * Good data crystals, bad data blocks, their halos and name labels. The scene owns the item
 * list and the game logic; this class only draws: sync(items, time) every frame.
 * Item: { kind: 'good'|'bad', slot, pos: Vector3, spin: Vector3, size, fade, label }
 */
export class DataItems {
  constructor(parent, max = 40) {
    this.max = max;
    const goodGeo = gemGeometry(0.05, 0.06, 0.085, 4);
    this.goodColor = instAttr(goodGeo, 'aColor', 3, max);
    this.goodFade = instAttr(goodGeo, 'aFade', 1, max);
    this.good = instanced(goodGeo, new THREE.ShaderMaterial({
      vertexShader: CRYSTAL_VS, fragmentShader: CRYSTAL_FS, side: THREE.DoubleSide, ...additive,
    }), max);
    const badGeo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
    this.badFade = instAttr(badGeo, 'aFade', 1, max);
    const badSeed = instAttr(badGeo, 'aSeed', 1, max);
    for (let i = 0; i < max; i++) badSeed.setX(i, Math.random());
    this.blockUniforms = { uTime: { value: 0 }, uBody: { value: col('xr-flight-bad-body') }, uGlow: { value: col('xr-flight-bad') }, uHot: { value: col('xr-flight-bad-hot') } };
    this.bad = instanced(badGeo, new THREE.ShaderMaterial({
      vertexShader: BLOCK_VS, fragmentShader: BLOCK_FS, uniforms: this.blockUniforms, transparent: true,
    }), max);
    const haloGeo = new THREE.PlaneGeometry(1, 1);
    this.haloColor = instAttr(haloGeo, 'aColor', 3, max * 2);
    this.haloSize = instAttr(haloGeo, 'aSize', 1, max * 2);
    this.haloFade = instAttr(haloGeo, 'aFade', 1, max * 2);
    instAttr(haloGeo, 'aSeed', 1, max * 2);
    this.halo = instanced(haloGeo, new THREE.ShaderMaterial({ vertexShader: BILL_VS, fragmentShader: HALO_FS, ...additive }), max * 2);
    this.halo.renderOrder = 1;
    parent.add(this.good, this.bad, this.halo);
    this.cGood = [col('xr-flight-good'), col('xr-flight-good-2')];
    this.cBad = col('xr-flight-bad');
    // Name labels (pooled sprites; each item that gets one keeps it until it is gone).
    this.labels = Array.from({ length: 14 }, () => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, opacity: 0 }));
      s.scale.set(0.2, 0.044, 1);
      s.visible = false;
      s.renderOrder = 3;
      s.userData.noFit = true;
      parent.add(s);
      return s;
    });
  }

  /** A free label sprite showing text, or null when all are in use. */
  takeLabel(text, good) {
    const s = this.labels.find((l) => !l.visible);
    if (!s) return null;
    s.material.map = labelTexture(text, good);
    s.material.needsUpdate = true;
    s.visible = true;
    return s;
  }

  releaseLabel(s) {
    if (!s) return;
    s.visible = false;
    s.material.opacity = 0;
  }

  /** Draws the items. */
  sync(items, time) {
    this.blockUniforms.uTime.value = time;
    const used = { good: new Set(), bad: new Set() };
    let h = 0;
    for (const it of items) {
      const mesh = it.kind === 'good' ? this.good : this.bad;
      used[it.kind].add(it.slot);
      tmpE.set(it.spin.x * time, it.spin.y * time + it.slot, it.spin.z * time);
      tmpQ.setFromEuler(tmpE);
      tmpS.setScalar(it.size * (it.pop ?? 1));
      tmpM.compose(it.pos, tmpQ, tmpS);
      mesh.setMatrixAt(it.slot, tmpM);
      if (it.kind === 'good') {
        const c = this.cGood[it.tint ?? 0];
        this.goodColor.setXYZ(it.slot, c.r, c.g, c.b);
        this.goodFade.setX(it.slot, it.fade);
      } else {
        this.badFade.setX(it.slot, it.fade);
      }
      if (h < this.max * 2) {
        const c = it.kind === 'good' ? this.cGood[it.tint ?? 0] : this.cBad;
        tmpM.makeTranslation(it.pos.x, it.pos.y, it.pos.z);
        this.halo.setMatrixAt(h, tmpM);
        this.haloColor.setXYZ(h, c.r, c.g, c.b);
        this.haloSize.setX(h, (it.kind === 'good' ? 0.3 : 0.26) * it.size);
        this.haloFade.setX(h, it.fade * (it.kind === 'good' ? 0.7 : 0.55));
        h += 1;
      }
      if (it.label) {
        // Grows with the distance, so the name stays readable far ahead.
        const lw = 0.12 + Math.max(0.5, -it.pos.z) * 0.055;
        it.label.scale.set(lw, lw * 0.22, 1);
        it.label.position.set(it.pos.x, it.pos.y + 0.075 * it.size + lw * 0.16, it.pos.z);
        // Readable while the data approaches; gone shortly before it reaches Echo.
        it.label.material.opacity = it.fade * THREE.MathUtils.clamp((it.pos.z + 8.5) / 1.5, 0, 1) * THREE.MathUtils.clamp((-0.7 - it.pos.z) / 0.5, 0, 1);
      }
    }
    for (const [kind, mesh] of [['good', this.good], ['bad', this.bad]]) {
      tmpM.makeScale(0, 0, 0);
      for (let i = 0; i < this.max; i++) if (!used[kind].has(i)) mesh.setMatrixAt(i, tmpM);
      mesh.instanceMatrix.needsUpdate = true;
    }
    for (let i = h; i < this.max * 2; i++) this.haloFade.setX(i, 0);
    this.halo.instanceMatrix.needsUpdate = true;
    for (const a of [this.goodColor, this.goodFade, this.badFade, this.haloColor, this.haloSize, this.haloFade]) a.needsUpdate = true;
  }
}

// ---------- the world streaming past ----------

/** The data vortex far ahead, where all data comes from. */
export function makeVortex(radius = 2.4) {
  const uniforms = {
    uTime: { value: 0 }, uBoost: { value: 0 },
    uA: { value: col('xr-flight-vortex-a') }, uB: { value: col('xr-flight-vortex-b') },
    uC: { value: col('xr-flight-vortex-c') }, uCore: { value: col('xr-flight-vortex-core') },
  };
  const m = new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), new THREE.ShaderMaterial({ uniforms, vertexShader: UV_VS, fragmentShader: VORTEX_FS, ...additive }));
  m.userData.noFit = true;
  m.userData.tick = (time, boost) => { uniforms.uTime.value = time; uniforms.uBoost.value = boost; };
  return m;
}

/**
 * Things flying past at the sides: speed streaks, sparkles, holo windows and decor crystals.
 * center: the flight axis (x, y); far / near: z range. tick(dt, time, speed).
 */
export function makeStream({ center, far = -11, near = 1.2, lite = false }) {
  const g = new THREE.Group();
  g.userData.noFit = true;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const around = (r0, r1, belowMin = -0.9) => {
    // A point on a ring around the flight axis, not too far below (that is the floor).
    for (;;) {
      const a = Math.random() * Math.PI * 2;
      const r = rnd(r0, r1);
      const x = center.x + Math.cos(a) * r;
      const y = center.y + Math.sin(a) * r * 0.75;
      if (y - center.y > belowMin) return [x, y];
    }
  };

  // Speed streaks
  const NS = lite ? 36 : 70;
  const sGeo = new THREE.PlaneGeometry(1, 1);
  const sCol = instAttr(sGeo, 'aColor', 3, NS);
  const sUni = { uBoost: { value: 0 } };
  const streaks = instanced(sGeo, new THREE.ShaderMaterial({ uniforms: sUni, vertexShader: STREAK_VS, fragmentShader: STREAK_FS, side: THREE.DoubleSide, ...additive }), NS);
  const palette = ['xr-flight-streak-1', 'xr-flight-streak-2', 'xr-flight-streak-3', 'xr-flight-streak-4'].map(col);
  const S = Array.from({ length: NS }, (_, i) => {
    const s = { z: rnd(far, near), len: rnd(0.25, 1.1), w: rnd(0.006, 0.014) };
    const place = () => {
      const [x, y] = around(0.85, 3.2);
      s.x = x;
      s.y = y;
      const n = new THREE.Vector3(center.x - x, center.y - y, 0).normalize();
      const up = new THREE.Vector3(0, 0, 1);
      const side = new THREE.Vector3().crossVectors(up, n);
      s.basis = new THREE.Matrix4().makeBasis(side.multiplyScalar(s.w), up.clone().multiplyScalar(s.len), n);
    };
    place();
    s.place = place;
    const c = palette[i % palette.length];
    sCol.setXYZ(i, c.r, c.g, c.b);
    return s;
  });
  g.add(streaks);

  // Sparkles
  const NP = lite ? 0 : 50;
  let sparks = null;
  let P = [];
  const spUni = { uTime: { value: 0 } };
  if (NP) {
    const pGeo = new THREE.PlaneGeometry(1, 1);
    const pCol = instAttr(pGeo, 'aColor', 3, NP);
    const pSize = instAttr(pGeo, 'aSize', 1, NP);
    const pFade = instAttr(pGeo, 'aFade', 1, NP);
    const pSeed = instAttr(pGeo, 'aSeed', 1, NP);
    sparks = instanced(pGeo, new THREE.ShaderMaterial({ uniforms: spUni, vertexShader: BILL_VS, fragmentShader: SPARK_FS, ...additive }), NP);
    const sp = ['xr-flight-spark-1', 'xr-flight-spark-2', 'xr-flight-spark-3'].map(col);
    P = Array.from({ length: NP }, (_, i) => {
      const [x, y] = around(0.7, 3.4);
      const c = sp[i % sp.length];
      pCol.setXYZ(i, c.r, c.g, c.b);
      pSize.setX(i, rnd(0.04, 0.12));
      pFade.setX(i, 1);
      pSeed.setX(i, Math.random());
      return { x, y, z: rnd(far, near) };
    });
    g.add(sparks);
  }

  // Holo windows (four types in one atlas) and decor crystals
  const NW = lite ? 0 : 6;
  let windows = null;
  let W = [];
  const hUni = { uTime: { value: 0 }, uMap: { value: holoAtlas() } };
  if (NW) {
    const wGeo = new THREE.PlaneGeometry(0.46, 0.345);
    const cell = instAttr(wGeo, 'aCell', 2, NW);
    const fade = instAttr(wGeo, 'aFade', 1, NW);
    windows = instanced(wGeo, new THREE.ShaderMaterial({ uniforms: hUni, vertexShader: HOLO_VS, fragmentShader: HOLO_FS, side: THREE.DoubleSide, ...additive }), NW);
    W = Array.from({ length: NW }, (_, i) => {
      cell.setXY(i, i % 2, Math.floor(i / 2) % 2);
      fade.setX(i, 0.85);
      const w = { z: far + (i / NW) * (near - far) };
      w.place = () => {
        const side = i % 2 ? 1 : -1;
        w.x = center.x + side * rnd(1.05, 1.9);
        w.y = center.y + rnd(-0.3, 0.9);
        w.yaw = -side * rnd(0.5, 0.9);
      };
      w.place();
      return w;
    });
    g.add(windows);
  }
  const NG = lite ? 4 : 10;
  const gGeo = gemGeometry(1, 0.9, 1.3, 4);
  const gCol = instAttr(gGeo, 'aColor', 3, NG);
  const gFade = instAttr(gGeo, 'aFade', 1, NG);
  const gems = instanced(gGeo, new THREE.ShaderMaterial({ vertexShader: CRYSTAL_VS, fragmentShader: CRYSTAL_FS, side: THREE.DoubleSide, ...additive }), NG);
  const gc = [col('xr-flight-gem-1'), col('xr-flight-gem-2')];
  const G = Array.from({ length: NG }, (_, i) => {
    gCol.setXYZ(i, gc[i % 2].r, gc[i % 2].g, gc[i % 2].b);
    gFade.setX(i, 0.32);
    const o = { z: far + (i / NG) * (near - far), s: rnd(0.12, 0.26), spin: rnd(0.4, 1.2) };
    o.place = () => {
      const [x, y] = around(1.7, 3.4, -0.6);
      o.x = x;
      o.y = y;
    };
    o.place();
    return o;
  });
  g.add(gems);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const v = new THREE.Vector3();
  const recycle = (o) => { if (o.z > near) { o.z -= near - far; o.place?.(); } };
  // The Data Flight worlds recolor the streaks: setPalette([c1, c2, c3, c4]) with THREE.Color.
  const base = S.map((_, i) => palette[i % palette.length].clone());
  g.userData.setPalette = (cols, k = 1) => {
    S.forEach((_, i) => {
      const c = base[i].clone().lerp(cols[i % cols.length], k);
      sCol.setXYZ(i, c.r, c.g, c.b);
    });
    sCol.needsUpdate = true;
  };
  g.userData.basePalette = palette;
  g.userData.tick = (dt, time, speed) => {
    sUni.uBoost.value = Math.min(1, speed / 6);
    S.forEach((s, i) => {
      s.z += speed * 1.5 * dt;
      recycle(s);
      m.copy(s.basis).setPosition(s.x, s.y, s.z);
      streaks.setMatrixAt(i, m);
    });
    streaks.instanceMatrix.needsUpdate = true;
    if (sparks) {
      spUni.uTime.value = time;
      P.forEach((p, i) => {
        p.z += speed * 0.8 * dt;
        if (p.z > near) { p.z -= near - far; [p.x, p.y] = around(0.7, 3.4); }
        m.makeTranslation(p.x, p.y, p.z);
        sparks.setMatrixAt(i, m);
      });
      sparks.instanceMatrix.needsUpdate = true;
    }
    if (windows) {
      hUni.uTime.value = time;
      W.forEach((w, i) => {
        w.z += speed * 0.9 * dt;
        recycle(w);
        q.setFromAxisAngle(v.set(0, 1, 0), w.yaw);
        m.compose(sc.set(w.x, w.y + Math.sin(time + i) * 0.03, w.z), q, v.set(1, 1, 1));
        windows.setMatrixAt(i, m);
      });
      windows.instanceMatrix.needsUpdate = true;
    }
    G.forEach((o, i) => {
      o.z += speed * 0.85 * dt;
      recycle(o);
      q.setFromEuler(tmpE.set(0.3, time * o.spin + i, 0.15));
      m.compose(sc.set(o.x, o.y, o.z), q, v.setScalar(o.s));
      gems.setMatrixAt(i, m);
    });
    gems.instanceMatrix.needsUpdate = true;
  };
  return g;
}

/** Atlas with four holo windows: text, pie chart, bars and binary code (like the coin). */
let holoTex = null;
function holoAtlas() {
  if (holoTex) return holoTex;
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const ctx = c.getContext('2d');
  const main = color('xr-flight-holo');
  const accent = color('xr-flight-holo-accent');
  const text = color('xr-flight-holo-text');
  const cell = (cx, cy, draw) => {
    const x = cx * 512 + 24;
    const y = cy * 512 + 64;
    const w = 464;
    const h = 348;
    ctx.save();
    ctx.shadowColor = main;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = main;
    ctx.lineWidth = 7;
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = main;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 22);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y + 46);
    ctx.lineTo(x + w, y + 46);
    ctx.stroke();
    [accent, color('xr-flight-spark-1'), main].forEach((cc, i) => {
      ctx.fillStyle = cc;
      ctx.beginPath();
      ctx.arc(x + 30 + i * 30, y + 23, 9, 0, Math.PI * 2);
      ctx.fill();
    });
    draw(x + 28, y + 70, w - 56, h - 92);
    ctx.restore();
  };
  ctx.lineCap = 'round';
  cell(0, 0, (x, y, w) => {
    ctx.strokeStyle = text;
    ctx.lineWidth = 12;
    [1, 0.8, 0.92, 0.6, 0.85, 0.5].forEach((k, i) => { ctx.beginPath(); ctx.moveTo(x, y + 14 + i * 40); ctx.lineTo(x + w * k, y + 14 + i * 40); ctx.stroke(); });
  });
  cell(1, 0, (x, y, w, h) => {
    const r = h * 0.42;
    const cx = x + r + 6;
    const cy = y + h / 2;
    [[0, 0.35, main], [0.35, 0.62, accent], [0.62, 1, text]].forEach(([a, b, cc]) => {
      ctx.fillStyle = cc;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, a * Math.PI * 2 - Math.PI / 2, b * Math.PI * 2 - Math.PI / 2);
      ctx.fill();
    });
    ctx.strokeStyle = text;
    ctx.lineWidth = 12;
    [0.25, 0.5, 0.75].forEach((k) => { ctx.beginPath(); ctx.moveTo(cx + r + 40, y + h * k); ctx.lineTo(x + w, y + h * k); ctx.stroke(); });
  });
  cell(0, 1, (x, y, w, h) => {
    [0.5, 0.8, 0.35, 0.95, 0.65, 0.75].forEach((k, i) => {
      ctx.fillStyle = i % 2 ? accent : main;
      const bw = w / 6 - 14;
      ctx.fillRect(x + i * (bw + 14), y + h * (1 - k), bw, h * k);
    });
  });
  cell(1, 1, (x, y) => {
    ctx.fillStyle = color('xr-flight-binary');
    ctx.font = `700 40px ${color('font-mono')}`;
    ['1101 0010 11', '0101 1110 01', '1000 1011 10', '0110 0101 11', '1011 0100 01'].forEach((s, i) => ctx.fillText(s, x, y + 34 + i * 48));
  });
  holoTex = new THREE.CanvasTexture(c);
  holoTex.colorSpace = THREE.SRGBColorSpace;
  return holoTex;
}

/**
 * Binary streams left and right of the flight path: 0 and 1 rushing towards the player.
 * Returns a group; tick(time, boost).
 */
export function makeBinaryStreams({ center, far = -10, near = 0.6, gap = 1.3 }) {
  const g = new THREE.Group();
  g.userData.noFit = true;
  const len = near - far;
  const h = 1.9;
  const curtains = [];
  for (const side of [-1, 1]) {
    for (const [off, token, seed, opacity] of [[0, 'xr-flight-binary', 1.7, 0.55], [0.45, 'xr-flight-binary-2', 3.9, 0.35]]) {
      const c = makeRainCurtain(len, h, { cell: 0.055, opacity, density: 0.4, seed: seed + side, colorToken: token, headToken: 'xr-flight-binary-head', glyphs: 12, turn: side < 0 ? 1 : 2 });
      // The plane's -y (where glyphs fall) points at the player (+z); it faces the flight axis.
      const nrm = new THREE.Vector3(-side, 0, 0);
      const yAxis = new THREE.Vector3(0, 0, -1);
      const xAxis = new THREE.Vector3().crossVectors(yAxis, nrm);
      c.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, yAxis, nrm));
      // Swap width and height: the plane is len long along its y.
      c.geometry.dispose();
      c.geometry = new THREE.PlaneGeometry(h, len);
      c.material.uniforms.uGrid.value.set(Math.round(h / 0.07), Math.round(len / 0.05));
      c.position.set(center.x + side * (gap + off), center.y + 0.35, (far + near) / 2);
      g.add(c);
      curtains.push(c);
    }
  }
  g.userData.tick = (time, boost) => { for (const c of curtains) c.userData.tick(time, boost); };
  return g;
}

/** Circuit traces on the floor rushing towards the player (seamless along the flight). */
export function makeCircuitFloor({ width = 3.4, far = -11, near = 1.2 }) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 1024;
  const ctx = c.getContext('2d');
  const tokens = ['xr-flight-trace-1', 'xr-flight-trace-2', 'xr-flight-trace-3', 'xr-flight-trace-4'];
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 16; i++) {
    const cc = color(tokens[i % tokens.length]);
    ctx.strokeStyle = cc;
    ctx.fillStyle = cc;
    ctx.shadowColor = cc;
    ctx.shadowBlur = 10;
    const x0 = 16 + i * 31 + rnd() * 8;
    const dx = (rnd() < 0.5 ? -1 : 1) * (12 + rnd() * 26);
    const a = 80 + rnd() * 300;
    const b = a + 200 + rnd() * 300;
    // Out and back with 45 degree bends, so the tile repeats without seams.
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.lineTo(x0, a);
    ctx.lineTo(x0 + dx, a + Math.abs(dx));
    ctx.lineTo(x0 + dx, b);
    ctx.lineTo(x0, b + Math.abs(dx));
    ctx.lineTo(x0, 1024);
    ctx.stroke();
    // A side branch ending in a node.
    const by = a + Math.abs(dx) + 40 + rnd() * 100;
    const bx = x0 + dx;
    const side = dx > 0 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx + side * 22, by + 22);
    ctx.lineTo(bx + side * 22, by + 70);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(bx + side * 22, by + 80, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x0 + dx, a + Math.abs(dx), 7, 0, Math.PI * 2);
    ctx.fill();
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  const len = near - far;
  map.repeat.set(1, len / (width * 2));
  // Fades out at the sides and far away.
  const f = document.createElement('canvas');
  f.width = 64;
  f.height = 256;
  const fx = f.getContext('2d');
  const gx = fx.createLinearGradient(0, 0, 64, 0);
  gx.addColorStop(0, '#000');
  gx.addColorStop(0.3, '#fff');
  gx.addColorStop(0.7, '#fff');
  gx.addColorStop(1, '#000');
  fx.fillStyle = gx;
  fx.fillRect(0, 0, 64, 256);
  fx.globalCompositeOperation = 'multiply';
  const gy = fx.createLinearGradient(0, 0, 0, 256);
  gy.addColorStop(0, '#000');
  gy.addColorStop(0.5, '#fff');
  gy.addColorStop(1, '#fff');
  fx.fillStyle = gy;
  fx.fillRect(0, 0, 64, 256);
  const alphaMap = new THREE.CanvasTexture(f);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, len), new THREE.MeshBasicMaterial({ map, alphaMap, opacity: 0.55, ...additive, toneMapped: false, fog: false }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.z = (far + near) / 2;
  mesh.userData.noFit = true;
  mesh.userData.tick = (dt, speed) => { map.offset.y = (map.offset.y + (speed * dt) / (width * 2)) % 1; };
  return mesh;
}

/** The deep violet data space around everything (dims the room in passthrough). */
export function makeSpace(opacity = 0.6) {
  // Depth: brighter towards the vortex ahead, darker above, below and behind (vertex colors
  // that shade the world's space color; no extra cost).
  const geo = new THREE.SphereGeometry(14, 32, 16);
  const pos = geo.attributes.position;
  const shade = new Float32Array(pos.count * 3);
  const d = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    d.fromBufferAttribute(pos, i).normalize();
    const ahead = Math.max(0, -d.z) ** 1.5;
    const f = (0.42 + 0.78 * ahead) * (1 - 0.45 * Math.abs(d.y));
    shade.set([f, f, f], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(shade, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: hex('xr-flight-space'), vertexColors: true, side: THREE.BackSide, transparent: true, opacity, depthWrite: false, fog: false }));
  m.renderOrder = -10;
  m.userData.noFit = true;
  return m;
}

// ---------- the database ----------

/**
 * The database that fills up with good data: three glass discs with glowing rims around a
 * light column, and a label with the fill level. setFill(0..1), flash(token), tick(dt, time).
 */
export function makeDatabase(label) {
  const g = new THREE.Group();
  g.userData.noFit = true;
  const stack = new THREE.Group();
  g.add(stack);
  const R = 0.085;
  const H = 0.24;
  const glass = new THREE.MeshPhysicalMaterial({ color: hex('xr-flight-db-glass'), transparent: true, opacity: 0.22, roughness: 0.05, clearcoat: 1, depthWrite: false });
  const ringMat = new THREE.MeshBasicMaterial({ color: hex('xr-flight-db-ring'), toneMapped: false });
  for (let i = 0; i < 3; i++) {
    const y = -H / 2 + 0.04 + i * 0.08;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.065, 40), glass);
    disc.position.y = y;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R, 0.004, 8, 48), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y + 0.0325;
    const ring2 = ring.clone();
    ring2.position.y = y - 0.0325;
    stack.add(disc, ring, ring2);
  }
  const fillMat = new THREE.MeshBasicMaterial({ color: hex('xr-flight-db-fill'), transparent: true, opacity: 0.85, toneMapped: false });
  const fill = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.8, R * 0.8, 1, 32), fillMat);
  g.add(fill);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), color: hex('xr-flight-db-fill'), ...additive, opacity: 0.5 }));
  glow.scale.setScalar(0.42);
  g.add(glow);
  const base = new THREE.Color(hex('xr-flight-db-fill'));
  const tmp = new THREE.Color();
  let level = 0;
  let want = 0;
  let flashT = 0;
  let flashC = new THREE.Color();
  label.position.y = -H / 2 - 0.06;
  g.add(label);
  g.userData.setFill = (k) => { want = THREE.MathUtils.clamp(k, 0, 1); };
  g.userData.flash = (token) => { flashT = 1; flashC = new THREE.Color(hex(token)); };
  g.userData.tick = (dt, time) => {
    level += (want - level) * Math.min(1, dt * 6);
    const h = Math.max(0.002, level * (H - 0.01));
    fill.scale.y = h;
    fill.position.y = -H / 2 + 0.005 + h / 2;
    flashT = Math.max(0, flashT - dt * 2.2);
    tmp.copy(base).lerp(flashC, flashT);
    fillMat.color.copy(tmp);
    glow.material.color.copy(tmp);
    glow.material.opacity = 0.25 + level * 0.35 + flashT * 0.4 + Math.sin(time * 3) * 0.04;
    stack.rotation.y = Math.sin(time * 0.6) * 0.25;
  };
  return g;
}

// ---------- Echomotion gold coins ----------

/**
 * An Echomotion gold coin (the Echo Parkour coin from parkour.glb, M = its model set) with a
 * golden glow. Faces the player; group.userData.spin turns it. Radius about 0.09 m.
 */
export function makeGoldCoin(M, logo) {
  const group = new THREE.Group();
  group.userData.noFit = true;
  const spin = new THREE.Group();
  const coin = M?.clone('Coin');
  if (coin) {
    coin.scale.setScalar(0.09 / 0.42);
    spin.add(coin);
  } else {
    const gold = new THREE.MeshStandardMaterial({ color: hex('xr-flight-coin'), metalness: 1, roughness: 0.25, emissive: hex('xr-flight-coin'), emissiveIntensity: 0.25 });
    const face = new THREE.MeshStandardMaterial({ map: logo, metalness: 0.3, roughness: 0.4, emissive: 0xffffff, emissiveMap: logo, emissiveIntensity: 0.35 });
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 32), [gold, face, face]);
    m.rotation.x = Math.PI / 2;
    spin.add(m);
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), color: hex('xr-flight-coin'), ...additive, opacity: 0.6 }));
  glow.scale.setScalar(0.55);
  group.add(glow, spin);
  group.userData.spin = spin;
  group.userData.glow = glow;
  return group;
}

// ---------- hackers and their attacks ----------

export const HACKER_URL = 'assets/models/hacker.glb';

/**
 * The hacker (blender/build_hacker.py): a hooded figure on a floating laptop. Own materials per
 * hacker (the eyes flash when it fires). userData: flash(), tick(dt, time, shake).
 */
export function makeHacker(gltf, neon = 1) {
  const group = new THREE.Group();
  group.userData.noFit = true;
  const body = new THREE.Group();
  group.add(body);
  const glowColor = new THREE.Color(hex('xr-flight-hacker-glow')).multiplyScalar(neon); // neon > 1: bloom on the desktop
  const glowMat = new THREE.MeshBasicMaterial({ color: glowColor.clone(), toneMapped: false });
  const mats = {
    HackerHoodie: new THREE.MeshStandardMaterial({ color: hex('xr-flight-hacker-hoodie'), roughness: 0.75, vertexColors: true }),
    HackerShadow: new THREE.MeshBasicMaterial({ color: hex('xr-flight-hacker-shadow') }),
    HackerGlove: new THREE.MeshStandardMaterial({ color: hex('xr-flight-hacker-glove'), roughness: 0.6, vertexColors: true }),
    HackerString: new THREE.MeshStandardMaterial({ color: hex('xr-flight-hacker-string'), roughness: 0.6, vertexColors: true }),
    HackerLaptop: new THREE.MeshStandardMaterial({ color: hex('xr-flight-hacker-laptop'), metalness: 0.8, roughness: 0.3, vertexColors: true }),
    HackerGlow: glowMat,
    HackerScreen: new THREE.MeshBasicMaterial({ color: new THREE.Color(hex('xr-flight-hacker-screen')).multiplyScalar(neon), toneMapped: false }),
  };
  const model = gltf?.scene.getObjectByName('Hacker')?.clone(true);
  if (model) {
    model.traverse((o) => { if (o.isMesh) o.material = mats[o.material.name] ?? o.material; });
    model.scale.setScalar(0.36);
    body.add(model);
  } else {
    // Without the model: a dark capsule with glowing eyes.
    body.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.18, 6, 16), mats.HackerHoodie));
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), glowMat);
      eye.position.set(s * 0.035, 0.1, 0.09);
      body.add(eye);
    }
  }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), color: hex('xr-flight-hacker-glow'), ...additive, opacity: 0.3 }));
  glow.scale.setScalar(0.7);
  glow.position.z = -0.05;
  group.add(glow);
  let flashT = 0;
  const flashWhite = new THREE.Color(0xffffff).multiplyScalar(neon);
  group.userData.flash = () => { flashT = 1; };
  group.userData.tick = (dt, time, shake = 0) => {
    flashT = Math.max(0, flashT - dt * 4);
    glowMat.color.copy(glowColor).lerp(flashWhite, flashT * 0.7);
    glow.material.opacity = 0.25 + flashT * 0.4 + shake * 0.2 * (0.5 + 0.5 * Math.sin(time * 30));
    body.position.set(Math.sin(time * 47) * 0.012 * shake, Math.sin(time * 2.6) * 0.02, 0);
    body.rotation.z = Math.sin(time * 1.7) * 0.08;
  };
  return group;
}

/** A spiky virus ball (the shape of every attack), radius 1 with spikes to 1.75. */
function virusGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const base = new THREE.IcosahedronGeometry(1, 0).attributes.position;
  const tips = [];
  for (let i = 0; i < base.count; i++) tips.push(new THREE.Vector3().fromBufferAttribute(base, i));
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    if (tips.some((tp) => tp.distanceToSquared(v) < 1e-4)) pos.setXYZ(i, v.x * 1.75, v.y * 1.75, v.z * 1.75);
  }
  g.computeVertexNormals();
  return g;
}

/** Factory for the hackers' attacks (shared geometry and material). make() -> group with spin. */
export function makeAttackKit() {
  const geo = virusGeometry();
  const mat = new THREE.MeshStandardMaterial({ color: hex('xr-flight-attack'), emissive: hex('xr-flight-attack'), emissiveIntensity: 0.7, roughness: 0.35, metalness: 0.2, flatShading: true });
  return {
    make() {
      const g = new THREE.Group();
      g.userData.noFit = true;
      const spin = new THREE.Mesh(geo, mat);
      spin.scale.setScalar(0.038);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), color: hex('xr-flight-attack'), ...additive, opacity: 0.7 }));
      glow.scale.setScalar(0.26);
      g.add(glow, spin);
      g.userData.spin = spin;
      g.userData.glow = glow;
      return g;
    },
  };
}

/** Warning beam from a hacker to where it is about to swoop (a pulsing thin line). */
export function makeBeam() {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 1, 8, 1, true), new THREE.MeshBasicMaterial({ color: hex('xr-flight-attack'), ...additive, opacity: 0.8 }));
  m.userData.noFit = true;
  m.visible = false;
  const up = new THREE.Vector3(0, 1, 0);
  const d = new THREE.Vector3();
  m.userData.set = (a, b, time) => {
    d.subVectors(b, a);
    const len = d.length();
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(up, d.normalize());
    m.scale.set(1, len, 1);
    m.material.opacity = 0.45 + 0.4 * Math.sin(time * 24);
  };
  return m;
}
