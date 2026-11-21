// "Stein auf Stein": shared 3D parts. The Blender model (blender/build_bricks.py,
// assets/models/bricks.glb) recolored from the --xr-bricks-* tokens, extra materials for the
// parts built in code (bricks-house.js), the tower crane, dust puffs and chimney smoke, the
// neighbor family, and a few sounds of the game's own.
import * as THREE from 'three';
import { loadGLTF } from './models.js';
import { hex } from './tokens.js';
import { radialTexture } from './robot-visuals.js';
import { audioContext } from './sfx.js';
import { winterize } from './snow.js';
import { gfxTier } from './gfx.js';
import { L, H, D, GAP, OX, OZ } from './bricks-plan.js';

export const BRICKS_URL = 'assets/models/bricks.glb';

// Blender material name -> [token, roughness, metalness, extra]
const MATS = {
  BrickClay: ['xr-bricks-clay', 0.88, 0],
  BrickGold: ['xr-bricks-gold', 0.26, 0.6, { emissive: 'xr-bricks-gold', emissiveIntensity: 0.22 }],
  Concrete: ['xr-bricks-concrete', 0.92, 0],
  Grass: ['xr-bricks-grass', 0.95, 0],
  GrassDark: ['xr-bricks-grass-dark', 0.95, 0],
  Soil: ['xr-bricks-soil', 0.95, 0],
  SoilDark: ['xr-bricks-soil-dark', 0.95, 0],
  Stone: ['xr-bricks-stone', 0.8, 0],
  Gravel: ['xr-bricks-gravel', 0.95, 0],
  Sand: ['xr-bricks-sand', 0.95, 0],
  Leaf: ['xr-bricks-leaf', 0.85, 0],
  LeafDark: ['xr-bricks-leaf-dark', 0.85, 0],
  Bark: ['xr-bricks-bark', 0.9, 0],
  Berry: ['xr-bricks-berry', 0.4, 0],
  Fence: ['xr-bricks-fence', 0.7, 0],
  Wood: ['xr-bricks-wood', 0.75, 0],
  WoodDark: ['xr-bricks-wood-dark', 0.8, 0],
  Metal: ['xr-bricks-metal', 0.35, 0.8],
  Dark: ['xr-bricks-dark', 0.6, 0.2],
  Roof: ['xr-bricks-roof', 0.7, 0],
  RoofDark: ['xr-bricks-roof-dark', 0.7, 0],
  Gable: ['xr-bricks-gable', 0.8, 0],
  Frame: ['xr-bricks-frame', 0.5, 0],
  Glass: ['xr-bricks-glass', 0.08, 0.2],
  Door: ['xr-bricks-door', 0.45, 0],
  Mailbox: ['xr-bricks-mailbox', 0.4, 0.2],
  Crane: ['xr-bricks-crane', 0.45, 0.3],
  CraneDark: ['xr-bricks-crane-dark', 0.45, 0.5],
  CraneGlass: ['xr-bricks-crane-glass', 0.1, 0],
  Quoin: ['xr-bricks-quoin', 0.85, 0],
  SolarCell: ['xr-bricks-solar', 0.15, 0.4],
};
// Materials of the parts built in code (plain geometry without baked shading).
const OWN = {
  Plaster: ['xr-bricks-plaster', 0.9, 0],
  Beam: ['xr-bricks-beam', 0.8, 0],
  ConcreteWall: ['xr-bricks-concrete-wall', 0.85, 0],
  Plank: ['xr-bricks-plank', 0.8, 0],
  Thatch: ['xr-bricks-thatch', 1, 0],
  ThatchDark: ['xr-bricks-thatch-dark', 1, 0],
  MetalRoof: ['xr-bricks-metal-roof', 0.35, 0.7],
  Sedum: ['xr-bricks-sedum', 0.95, 0],
  Shutter: ['xr-bricks-shutter', 0.6, 0],
  Slim: ['xr-bricks-slim', 0.4, 0.5],
  Unit: ['xr-bricks-unit', 0.5, 0.1],
  GasBox: ['xr-bricks-gas', 0.5, 0.1],
  Car: ['xr-bricks-car', 0.3, 0.3],
  Hedge: ['xr-bricks-hedge', 0.95, 0],
  FlowerA: ['xr-bricks-flower-1', 0.6, 0],
  FlowerB: ['xr-bricks-flower-2', 0.6, 0],
  Pebble: ['xr-bricks-pebble', 0.9, 0],
};
// Materials that get snow in winter (everything facing up in the garden, and the roof).
const SNOWY = ['Grass', 'GrassDark', 'Leaf', 'LeafDark', 'Fence', 'Stone', 'Sand', 'Soil', 'Roof', 'RoofDark', 'Mailbox', 'Bark', 'Thatch', 'MetalRoof', 'Sedum', 'Hedge', 'Pebble'];

// Glossy parts get a clear coat (the door's paint and knob, the solar glass, the little car).
const COAT = { BrickGold: 1, Door: 0.5, SolarCell: 0.8, Mailbox: 0.4, Crane: 0.3, Car: 0.8 };
// Fine surface detail (procedural, object space): [scale of the blotches, of the grain, strength].
const DETAIL = {
  Grass: [14, 120, 0.34], GrassDark: [14, 120, 0.3], Soil: [30, 160, 0.25], SoilDark: [30, 160, 0.25],
  Gravel: [40, 260, 0.3], Stone: [25, 200, 0.18], Sand: [20, 180, 0.15], BrickClay: [60, 300, 0.16],
  Roof: [20, 220, 0.12], Concrete: [18, 240, 0.14], Wood: [12, 300, 0.14], Quoin: [60, 300, 0.12],
};

/**
 * Subtle surface variation for large flat materials: blotches and grain from a small value
 * noise in object space (no UVs needed). Patched before the color step, so the snow and the
 * baked ambient occlusion still apply on top. Off with "lite" effects.
 */
function addDetail(mat, [big, fine, amount]) {
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGdP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGdP = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vGdP;
        float gdHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float gdNoise(vec3 x) {
          vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(gdHash(i), gdHash(i + vec3(1, 0, 0)), f.x), mix(gdHash(i + vec3(0, 1, 0)), gdHash(i + vec3(1, 1, 0)), f.x), f.y),
                     mix(mix(gdHash(i + vec3(0, 0, 1)), gdHash(i + vec3(1, 0, 1)), f.x), mix(gdHash(i + vec3(0, 1, 1)), gdHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
        }`)
      .replace('#include <color_fragment>', `{
          float gdA = gdNoise(vGdP * ${big.toFixed(1)});
          float gdB = gdNoise(vGdP * ${fine.toFixed(1)});
          diffuseColor.rgb *= 1.0 + ${amount.toFixed(3)} * ((gdA - 0.5) * 1.4 + (gdB - 0.5) * 0.8);
        }
        #include <color_fragment>`);
  };
  mat.customProgramCacheKey = () => `gd${big}-${fine}-${amount}`;
  return mat;
}

export function bricksMaterials() {
  const tier = gfxTier();
  const out = {};
  for (const [name, [token, roughness, metalness, extra = {}]] of Object.entries(MATS)) {
    const opts = { name, color: hex(token), roughness, metalness, vertexColors: true };
    if (extra.emissive) Object.assign(opts, { emissive: hex(extra.emissive), emissiveIntensity: extra.emissiveIntensity });
    out[name] = COAT[name] && tier === 'high'
      ? new THREE.MeshPhysicalMaterial({ ...opts, clearcoat: COAT[name], clearcoatRoughness: 0.25 })
      : new THREE.MeshStandardMaterial(opts);
    if (DETAIL[name] && tier !== 'low') addDetail(out[name], DETAIL[name]);
    if (SNOWY.includes(name)) winterize(out[name]);
  }
  for (const [name, [token, roughness, metalness]] of Object.entries(OWN)) {
    const opts = { name, color: hex(token), roughness, metalness };
    out[name] = COAT[name] && tier === 'high' ? new THREE.MeshPhysicalMaterial({ ...opts, clearcoat: COAT[name], clearcoatRoughness: 0.25 }) : new THREE.MeshStandardMaterial(opts);
    if (SNOWY.includes(name)) winterize(out[name]);
  }
  // Glass reflects the sky a little (studio environment) until the lights go on.
  out.Glass.roughness = 0.04;
  out.Glass.metalness = 0.4;
  out.LampGlow = new THREE.MeshBasicMaterial({ name: 'LampGlow', color: hex('xr-bricks-lamp'), toneMapped: false });
  return out;
}

/** A part of the model with the token materials (mats[name]), as its own copy. */
function part(gltf, name, mats) {
  const src = gltf.scene.getObjectByName(name);
  if (!src) return null;
  const o = src.clone(true);
  o.position.set(0, 0, 0);
  o.rotation.set(0, 0, 0);
  o.traverse((m) => {
    if (!m.isMesh) return;
    m.material = mats[m.material.name] ?? m.material;
    m.castShadow = true;
    m.receiveShadow = true;
  });
  return o;
}

function meshGeo(gltf, name) {
  let g = null;
  gltf.scene.getObjectByName(name)?.traverse((m) => { if (!g && m.isMesh) g = m.geometry; });
  return g;
}

/**
 * Loads the model. Resolves to { mats, geo: { brick, half, gold }, make(name) } or, if the model
 * is missing, to simple boxes (make() then returns null and the scene builds a plain plot).
 */
export async function loadBricks() {
  const mats = bricksMaterials();
  try {
    const gltf = await loadGLTF(BRICKS_URL);
    const geo = { brick: meshGeo(gltf, 'Brick'), half: meshGeo(gltf, 'BrickHalf'), gold: meshGeo(gltf, 'BrickGold'), quoin: meshGeo(gltf, 'Quoin') ?? meshGeo(gltf, 'BrickHalf') };
    if (!geo.brick || !geo.half || !geo.gold) throw new Error('bricks.glb incomplete');
    return { mats, geo, make: (name) => part(gltf, name, mats) };
  } catch (e) {
    console.warn('Bricks model not loaded, using boxes', e);
    return {
      mats,
      geo: {
        brick: new THREE.BoxGeometry(L - GAP, H - GAP, D - GAP),
        half: new THREE.BoxGeometry(L / 2 - GAP, H - GAP, D - GAP),
        gold: new THREE.BoxGeometry(L - GAP, H - GAP, D - GAP),
        quoin: new THREE.BoxGeometry(D - GAP, H - GAP, D - GAP),
      },
      make: () => null,
    };
  }
}

/** A plain plot if the model is missing: a grass slab with the foundation. */
export function plainPlot(mats) {
  const g = new THREE.Group();
  const grass = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.06, 0.8), mats.Grass);
  grass.position.set(0.06, -0.03, 0);
  const found = new THREE.Mesh(new THREE.BoxGeometry(2 * OX + 0.024, 0.014, 2 * OZ + 0.024), mats.Concrete);
  found.position.set(0, 0.007, -0.03);
  g.add(grass, found);
  g.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; o.material.vertexColors = false; } });
  return g;
}

// ---------- the tower crane ----------

const MAST_H = 0.615; // top of the slewing ring
const JIB_Y = 0.03; // jib bottom chord above the ring
const TROLLEY_DROP = 0.014; // trolley bottom below the chord

/** The crane in parts: the jib turns, the trolley runs along it, the hook goes up and down. */
export class Crane {
  constructor(M, parent, at) {
    this.root = new THREE.Group();
    this.root.position.copy(at);
    this.root.userData.noFit = true;
    parent.add(this.root);
    const mast = M.make('CraneMast');
    this.jib = M.make('CraneJib') ?? new THREE.Group();
    this.trolley = M.make('CraneTrolley') ?? new THREE.Group();
    this.hook = M.make('CraneHook') ?? new THREE.Group();
    if (mast) this.root.add(mast);
    this.jib.position.y = MAST_H;
    this.root.add(this.jib);
    this.jib.add(this.trolley, this.hook);
    const cableMat = new THREE.MeshBasicMaterial({ color: hex('xr-bricks-cable') });
    this.cable = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 1, 5).translate(0, -0.5, 0), cableMat);
    this.jib.add(this.cable);
    // Slings from the hook to the load.
    this.slings = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(Array.from({ length: 4 }, () => new THREE.Vector3())), new THREE.LineBasicMaterial({ color: hex('xr-bricks-cable') }));
    this.slings.frustumCulled = false;
    this.slings.visible = false;
    parent.add(this.slings);
    this.yaw = 2.3;
    this.reach = 0.16;
    this.drop = 0.06;
    this.sway = 0;
    this.apply(0);
  }

  apply(time) {
    this.jib.rotation.y = this.yaw + Math.sin(time * 0.4) * 0.01 * this.sway;
    this.trolley.position.set(this.reach, JIB_Y - 0.003, 0);
    this.hook.position.set(this.reach, JIB_Y - TROLLEY_DROP - this.drop, 0);
    this.cable.position.set(this.reach, JIB_Y - TROLLEY_DROP, 0);
    this.cable.scale.y = Math.max(0.001, this.drop);
  }

  /** Parent-space point where a load hangs (bottom of the hook). */
  hookPoint(out = new THREE.Vector3()) {
    this.root.updateMatrixWorld(true);
    out.set(this.reach, JIB_Y - TROLLEY_DROP - this.drop - 0.045, 0);
    this.jib.localToWorld(out);
    return this.root.parent.worldToLocal(out);
  }

  /** Jib angle and trolley reach that put the hook over (x, z) of the parent space. */
  aimAt(x, z) {
    const dx = x - this.root.position.x;
    const dz = z - this.root.position.z;
    return { yaw: Math.atan2(-dz, dx), reach: Math.hypot(dx, dz) };
  }

  /** Hook drop that puts the hook bottom at height y of the parent space. */
  dropTo(y) {
    return this.root.position.y + MAST_H + JIB_Y - TROLLEY_DROP - 0.045 - y;
  }

  /** Slings from the hook to points of the load (parent space); null hides them. */
  setSlings(points) {
    this.slings.visible = !!points;
    if (!points) return;
    const hp = this.hookPoint();
    const pos = this.slings.geometry.attributes.position;
    pos.setXYZ(0, hp.x, hp.y, hp.z);
    pos.setXYZ(1, points[0].x, points[0].y, points[0].z);
    pos.setXYZ(2, hp.x, hp.y, hp.z);
    pos.setXYZ(3, points[1].x, points[1].y, points[1].z);
    pos.needsUpdate = true;
  }
}

// ---------- effects ----------

/** Little clouds: mortar dust where a brick sits, smoke from the chimney. */
export class Puffs {
  constructor(parent) {
    this.parent = parent;
    this.list = [];
  }

  /** A ring of dust around p (parent space). */
  puff(p, { token = 'xr-bricks-puff', n = 9, size = 0.022, spread = 0.05, life = 0.6, rise = 0.01 } = {}) {
    const mat = new THREE.SpriteMaterial({ map: radialTexture(), color: hex(token), transparent: true, depthWrite: false, opacity: 0.85 });
    const parts = [];
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(mat);
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      s.userData.v = new THREE.Vector3(Math.cos(a) * spread, rise + Math.random() * 0.015, Math.sin(a) * spread);
      s.position.copy(p);
      s.scale.setScalar(size * (0.6 + Math.random() * 0.6));
      s.userData.base = s.scale.x;
      s.userData.noFit = true;
      this.parent.add(s);
      parts.push(s);
    }
    this.list.push({ mat, parts, t: 0, life, p: p.clone() });
  }

  /** One rising smoke ball. */
  smoke(p) {
    this.puff(p, { token: 'xr-bricks-smoke', n: 1, size: 0.03, spread: 0.004, life: 2.4, rise: 0.06 });
  }

  update(dt) {
    this.list = this.list.filter((e) => {
      e.t += dt;
      const k = Math.min(1, e.t / e.life);
      for (const s of e.parts) {
        s.position.copy(e.p).addScaledVector(s.userData.v, 1 - (1 - k) ** 2);
        s.scale.setScalar(s.userData.base * (1 + k * 1.8));
      }
      e.mat.opacity = 0.85 * (1 - k);
      if (k >= 1) {
        e.parts.forEach((s) => s.removeFromParent());
        e.mat.dispose();
        return false;
      }
      return true;
    });
  }
}

// ---------- sounds of their own ----------

let noiseBuf = null;
function noise(a) {
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate * 0.4, a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

function tone(a, freq, start, dur, type, gain, to = null) {
  const t0 = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function hiss(a, start, dur, freq, gain, q = 1.2) {
  const t0 = a.currentTime + start;
  const src = a.createBufferSource();
  src.buffer = noise(a);
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

const play = (fn) => () => { const a = audioContext(); if (a) fn(a); };

export const bsfx = {
  // A part snaps in: a woody knock, a click and a little mortar crunch.
  place: play((a) => { tone(a, 170, 0, 0.11, 'sine', 0.14, 90); tone(a, 1900, 0, 0.025, 'square', 0.025); hiss(a, 0.01, 0.09, 2400, 0.05); }),
  // A decision is made: two rising notes.
  pick: play((a) => { tone(a, 660, 0, 0.09, 'triangle', 0.05); tone(a, 990, 0.07, 0.14, 'triangle', 0.045); }),
  // "Back": the part goes away again.
  undo: play((a) => { tone(a, 520, 0, 0.1, 'triangle', 0.045, 380); tone(a, 380, 0.08, 0.14, 'triangle', 0.035, 300); }),
  // The crane: a low motor hum.
  motor: play((a) => { tone(a, 70, 0, 0.7, 'sawtooth', 0.025, 95); tone(a, 140, 0, 0.7, 'triangle', 0.015, 190); }),
  // The roof (or another big part) lands.
  land: play((a) => { tone(a, 110, 0, 0.25, 'sine', 0.18, 55); hiss(a, 0.0, 0.3, 500, 0.06, 0.7); }),
  // The door swings open.
  door: play((a) => { tone(a, 380, 0, 0.5, 'sawtooth', 0.012, 520); tone(a, 520, 0.2, 0.4, 'triangle', 0.012, 300); }),
  // Lights going on, one after another.
  lights: play((a) => { [1568, 1760, 2093, 2349, 2637].forEach((f, i) => tone(a, f, i * 0.07, 0.18, 'sine', 0.025)); }),
  // The neighbors cheer.
  cheer: play((a) => { [784, 988, 1175].forEach((f, i) => tone(a, f, i * 0.06, 0.12, 'triangle', 0.03)); hiss(a, 0, 0.4, 3000, 0.012, 0.6); }),
  // A row of the check appears.
  row: play((a) => { tone(a, 880, 0, 0.08, 'sine', 0.04); tone(a, 1320, 0.05, 0.1, 'sine', 0.03); }),
};


// ---------- the neighbor family ----------

/** A little figure (meters in its own space): legs, body, head, a winter hat, arms that move. */
function person({ h, shirt, pants, hat, skin }) {
  const g = new THREE.Group();
  const std = (token, rough = 0.8) => new THREE.MeshStandardMaterial({ color: hex(token), roughness: rough });
  const r = h * 0.13;
  const legs = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.75, h * 0.22, 4, 10), std(pants));
  legs.position.y = h * 0.2;
  legs.scale.set(1.25, 1, 0.9);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(r, h * 0.22, 4, 12), std(shirt));
  body.position.y = h * 0.5;
  const head = new THREE.Mesh(new THREE.SphereGeometry(r * 1.05, 14, 10), std(skin, 0.6));
  head.position.y = h * 0.8;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(r * 1.0, r * 1.5, 12), std(hat, 0.9));
  cap.position.set(0, h * 0.8 + r * 1.05, -r * 0.1);
  cap.rotation.x = -0.25;
  const pom = new THREE.Mesh(new THREE.SphereGeometry(r * 0.32, 8, 6), std('xr-bricks-fence', 1));
  pom.position.set(0, h * 0.8 + r * 1.75, -r * 0.3);
  g.add(legs, body, head, cap, pom);
  const arms = [-1, 1].map((sx) => {
    const pivot = new THREE.Group();
    pivot.position.set(sx * r * 1.05, h * 0.62, 0);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.32, h * 0.2, 3, 8), std(shirt));
    arm.position.y = -h * 0.13;
    pivot.add(arm);
    pivot.rotation.z = sx * 0.15;
    g.add(pivot);
    return pivot;
  });
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { g, arms, h };
}

/**
 * The neighbor family (two grown-ups and a child) for their front garden. tick(dt, time);
 * wave() one of them waves, cheer() all jump with their arms up, clap() a short applause.
 */
export function makeFamily() {
  const group = new THREE.Group();
  group.userData.noFit = true;
  const ppl = [
    person({ h: 0.17, shirt: 'xr-bricks-family-1', pants: 'xr-bricks-family-pants', hat: 'xr-bricks-family-hat-1', skin: 'xr-bricks-family-skin-1' }),
    person({ h: 0.16, shirt: 'xr-bricks-family-2', pants: 'xr-bricks-family-pants', hat: 'xr-bricks-family-hat-2', skin: 'xr-bricks-family-skin-2' }),
    person({ h: 0.11, shirt: 'xr-bricks-family-3', pants: 'xr-bricks-family-pants', hat: 'xr-bricks-family-hat-1', skin: 'xr-bricks-family-skin-1' }),
  ];
  [[-0.05, 0.02], [0.06, 0], [0.005, 0.05]].forEach(([x, z], i) => { ppl[i].g.position.set(x, 0, z); ppl[i].g.rotation.y = (i - 1) * -0.2; group.add(ppl[i].g); });
  let mood = null; // { kind, t, who }
  return {
    group,
    wave() { if (!mood) mood = { kind: 'wave', t: 0, who: Math.floor(Math.random() * 3) }; },
    cheer() { mood = { kind: 'cheer', t: 0 }; },
    clap() { mood = { kind: 'clap', t: 0 }; },
    tick(dt, time) {
      if (mood) { mood.t += dt; if (mood.t > (mood.kind === 'wave' ? 2.2 : 2.6)) mood = null; }
      ppl.forEach((pp, i) => {
        let y = Math.max(0, Math.sin(time * 2 + i * 1.7)) * 0.002;
        let la = 0.15;
        let ra = -0.15;
        if (mood?.kind === 'wave' && mood.who === i) ra = -2.6 + Math.sin(mood.t * 12) * 0.35;
        if (mood?.kind === 'cheer') {
          y = Math.abs(Math.sin(mood.t * 6 + i)) * pp.h * 0.25;
          la = 2.7 + Math.sin(mood.t * 10 + i) * 0.2;
          ra = -2.7 - Math.sin(mood.t * 10 + i) * 0.2;
        }
        if (mood?.kind === 'clap') {
          const c = Math.abs(Math.sin(mood.t * 14 + i));
          la = 1.1 + c * 0.35;
          ra = -1.1 - c * 0.35;
          y = Math.abs(Math.sin(mood.t * 5 + i)) * pp.h * 0.06;
        }
        pp.g.position.y = y;
        pp.arms[0].rotation.z += (-la - pp.arms[0].rotation.z) * Math.min(1, dt * 14);
        pp.arms[1].rotation.z += (-ra - pp.arms[1].rotation.z) * Math.min(1, dt * 14);
      });
    },
  };
}
