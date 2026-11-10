// "Pannenfrei": loads the Blender models (assets/models/bike.glb and bike-world.glb, built by
// blender/build_bike.py) and gives them materials from the --xr-bike-* tokens. Ambient occlusion
// is baked into the vertex colors. Also the moving parts: the bike rig (steering fork, spinning
// wheels with the four tire profiles and the glowing puncture protection band, cranks), Echo as
// the rider (on the saddle, wings on the handlebar, Santa hat at Christmas, else a helmet), the
// swallow that guides, the scanner drone and the festive arches.
import * as THREE from 'three';
import { loadGLTF } from './models.js';
import { hex } from './tokens.js';
import { loadEchoParts, bendWing } from './echo-mascot.js';
import { EchoFace } from './echo-face.js';
import { CHRISTMAS, makeBulbs } from './christmas.js';
import { Panel } from './ui3d.js';
import { color, font } from './tokens.js';

export const BIKE_URL = 'assets/models/bike.glb';
export const WORLD_URL = 'assets/models/bike-world.glb';
export const TIRE_NODES = { slick: 'TireSlick', allround: 'TireAllround', knobby: 'TireKnobby', spikes: 'TireSpikes' };
export const TIRE_TOKENS = { slick: 'xr-bike-tire-slick', allround: 'xr-bike-tire-allround', knobby: 'xr-bike-tire-knobby', spikes: 'xr-bike-tire-spikes' };

// Geometry of the bike (meters, as in build_bike.py): axles, bottom bracket, head tube.
const RA = new THREE.Vector3(0, 0.35, 0.5);
const FA = new THREE.Vector3(0, 0.35, -0.52);
const HEAD_BOT = new THREE.Vector3(0, 0.66, -0.36);
const HEAD_TOP = new THREE.Vector3(0, 0.80, -0.317);
export const WHEEL_R = 0.35;

// Blender material -> token and look. type: paint (clear coat), metal, glow (unlit), glass,
// ice, water; r roughness, m metalness.
const SPEC = {
  BkFrame: { t: 'xr-bike-frame', type: 'paint', r: 0.3, m: 0.2 },
  BkAccent: { t: 'xr-bike-accent', r: 0.35, m: 0.1 },
  BkMetal: { t: 'xr-bike-metal', r: 0.26, m: 1 },
  BkDark: { t: 'xr-bike-dark', r: 0.55, m: 0.2 },
  BkSaddle: { t: 'xr-bike-saddle', r: 0.42 },
  BkBottle: { t: 'xr-bike-bottle', type: 'paint', r: 0.3 },
  BkLightGlow: { t: 'xr-bike-light', type: 'glow' },
  BkRim: { t: 'xr-bike-rim', r: 0.3, m: 0.8 },
  BkRubber: { t: 'xr-bike-rubber', r: 0.86 },
  BkTireAccent: { t: 'xr-bike-accent', r: 0.4 },
  BkStud: { t: 'xr-bike-stud', r: 0.18, m: 1 },
  BkBandGlow: { t: 'xr-bike-band', type: 'glow', add: true },
  BkHelmet: { t: 'xr-bike-helmet', type: 'paint', r: 0.28 },
  BkHelmetDark: { t: 'xr-bike-helmet-dark', r: 0.5 },
  BkPump: { t: 'xr-bike-pump', type: 'paint', r: 0.3 },
  BkPumpFace: { t: 'xr-bike-pump-face', r: 0.4 },
  BkGlass: { t: 'xr-bike-glass', type: 'glass' },
  BkGlassBrown: { t: 'xr-bike-glass-brown', type: 'glass' },
  BkNail: { t: 'xr-bike-nail', r: 0.3, m: 1 },
  BkWood: { t: 'xr-bike-wood', r: 0.8 },
  BkWoodDark: { t: 'xr-bike-wood-dark', r: 0.85 },
  BkThorn: { t: 'xr-bike-thorn', r: 0.7 },
  BkThornLeaf: { t: 'xr-bike-thorn-leaf', r: 0.7 },
  BkBerry: { t: 'xr-bike-berry', r: 0.3, m: 0.1 },
  BkHoleDark: { t: 'xr-bike-hole', r: 0.9 },
  BkAsphaltChunk: { t: 'xr-bike-chunk', r: 0.9 },
  BkWater: { t: 'xr-bike-water', type: 'water' },
  BkRoot: { t: 'xr-bike-root', r: 0.8 },
  BkIce: { t: 'xr-bike-ice', type: 'ice' },
  BkIceCrack: { t: 'xr-bike-ice-crack', r: 0.3 },
  BkMudWater: { t: 'xr-bike-mud-water', type: 'water' },
  BkGold: { t: 'xr-bike-gold', r: 0.25, m: 1, glow: 0.18 },
  BkCartridge: { t: 'xr-bike-cartridge', r: 0.2, m: 1 },
  BkCartridgeBand: { t: 'xr-bike-cartridge-band', r: 0.3, glow: 0.25 },
  BkShieldGlow: { t: 'xr-bike-shield', type: 'glow' },
  BkShieldCore: { t: 'xr-bike-shield-core', r: 0.3, m: 0.6 },
  BkLeaf: { t: 'xr-bike-leaf', r: 0.8 },
  BkLeafDark: { t: 'xr-bike-leaf-dark', r: 0.85 },
  BkNeedle: { t: 'xr-bike-needle', r: 0.85 },
  BkTrunk: { t: 'xr-bike-trunk', r: 0.85 },
  BkStone: { t: 'xr-bike-stone', r: 0.85 },
  BkGrass: { t: 'xr-bike-grass-tuft', r: 0.8 },
  BkHay: { t: 'xr-bike-hay', r: 0.85 },
  BkSnow: { t: 'xr-bike-snow', r: 0.6 },
  BkLampGlow: { t: 'xr-bike-lamp-glow', type: 'glow' },
  BkPost: { t: 'xr-bike-post', r: 0.5 },
  BkPostDark: { t: 'xr-bike-post-dark', r: 0.5 },
  BkReflectGlow: { t: 'xr-bike-reflect', type: 'glow' },
  BkSignRed: { t: 'xr-bike-sign-red', r: 0.4 },
  BkSignWhite: { t: 'xr-bike-sign-white', r: 0.4 },
  BkLampPost: { t: 'xr-bike-lamp-post', r: 0.4, m: 0.6 },
  BkMushRed: { t: 'xr-bike-mush-red', r: 0.4 },
  BkMushWhite: { t: 'xr-bike-mush-white', r: 0.6 },
  BkFern: { t: 'xr-bike-fern', r: 0.7 },
  BkCarrot: { t: 'xr-bike-carrot', r: 0.5 },
  BkCoal: { t: 'xr-bike-coal', r: 0.6 },
  BkScarf: { t: 'xr-bike-scarf', r: 0.8 },
  BkManhole: { t: 'xr-bike-manhole', r: 0.5, m: 0.7 },
  BkPebble: { t: 'xr-bike-pebble', r: 0.8 },
  BkAutumn: { t: 'xr-bike-autumn', r: 0.7 },
  BkAutumn2: { t: 'xr-bike-autumn-2', r: 0.7 },
  BkFlag: { t: 'xr-bike-flag', r: 0.6 },
  BkSwallowBack: { t: 'xr-bike-swallow-back', type: 'paint', r: 0.35, m: 0.2 },
  BkSwallowBelly: { t: 'xr-bike-swallow-belly', r: 0.6 },
  BkSwallowFace: { t: 'xr-bike-swallow-face', r: 0.5 },
  BkSwallowBeak: { t: 'xr-bike-swallow-beak', r: 0.4 },
  BkSwallowEye: { t: 'xr-bike-swallow-eye', r: 0.1 },
  BkSwallowShine: { t: 'xr-bike-swallow-shine', type: 'glow' },
  BkDrone: { t: 'xr-bike-drone', type: 'paint', r: 0.3, m: 0.1 },
  BkDroneDark: { t: 'xr-bike-drone-dark', r: 0.4, m: 0.4 },
  BkLensGlow: { t: 'xr-bike-scan', type: 'glow' },
  BkRotor: { t: 'xr-bike-rotor', r: 0.4, m: 0.2 },
  BkArchA: { t: 'xr-bike-arch-a', r: 0.45 },
  BkArchB: { t: 'xr-bike-arch-b', r: 0.45 },
  BkArchBanner: { t: 'xr-bike-arch-banner', r: 0.5 },
  BkArchPost: { t: 'xr-bike-arch-post', r: 0.4, m: 0.6 },
  BkGarland: { t: 'xr-bike-garland', r: 0.8 },
};

function makeMaterial(name, vc, clip) {
  const s = SPEC[name];
  if (!s) return null;
  const c = hex(s.t);
  const base = { name, vertexColors: vc && s.type !== 'glow', clippingPlanes: clip ?? null };
  let m;
  switch (s.type) {
    case 'glow':
      m = new THREE.MeshBasicMaterial({ ...base, color: c, toneMapped: false, transparent: !!s.add, blending: s.add ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: !s.add });
      break;
    case 'paint':
      m = new THREE.MeshPhysicalMaterial({ ...base, color: c, roughness: s.r, metalness: s.m ?? 0, clearcoat: 1, clearcoatRoughness: 0.12 });
      break;
    case 'glass':
      m = new THREE.MeshPhysicalMaterial({ ...base, color: c, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.78, clearcoat: 1, specularIntensity: 1, emissive: c, emissiveIntensity: 0.18, flatShading: true });
      break;
    case 'ice':
      m = new THREE.MeshPhysicalMaterial({ ...base, color: c, roughness: 0.06, metalness: 0.05, transparent: true, opacity: 0.88, clearcoat: 1, clearcoatRoughness: 0.02, emissive: c, emissiveIntensity: 0.12 });
      break;
    case 'water':
      m = new THREE.MeshPhysicalMaterial({ ...base, color: c, roughness: 0.04, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.03 });
      break;
    default:
      m = new THREE.MeshStandardMaterial({ ...base, color: c, roughness: s.r ?? 0.6, metalness: s.m ?? 0, ...(s.glow ? { emissive: c, emissiveIntensity: s.glow } : {}) });
  }
  return m;
}

/**
 * Access to the nodes of a loaded GLB with token materials (clipped by clip planes if given):
 * clone(name, keepPos) copies a node, parts(name) lists geometry + material (for instancing).
 */
export function modelKit(gltf, clip = null) {
  const cache = new Map();
  const matFor = (orig, geo) => {
    const vc = !!geo.attributes.color;
    const key = `${orig.name}|${vc}`;
    if (!cache.has(key)) cache.set(key, makeMaterial(orig.name, vc, clip) ?? orig);
    return cache.get(key);
  };
  const nodes = new Map();
  gltf.scene.children.forEach((n) => nodes.set(n.name, n));
  const parts = (name) => {
    const out = [];
    nodes.get(name)?.traverse((o) => { if (o.isMesh) out.push({ geometry: o.geometry, material: matFor(o.material, o.geometry) }); });
    return out;
  };
  const clone = (name, keepPos = false) => {
    const node = nodes.get(name);
    if (!node) return null;
    const root = node.clone(true);
    if (!keepPos) root.position.set(0, 0, 0);
    root.traverse((o) => {
      o.userData.noFit = true;
      if (!o.isMesh) return;
      o.material = matFor(o.material, o.geometry);
      o.castShadow = true;
      o.receiveShadow = true;
    });
    return root;
  };
  const node = (name) => nodes.get(name);
  const all = () => [...cache.values()];
  return { clone, parts, node, materials: all };
}

let bikePromise = null;
let worldPromise = null;
export const loadBikeGLTF = () => (bikePromise ??= loadGLTF(BIKE_URL));
export const loadWorldGLTF = () => (worldPromise ??= loadGLTF(WORLD_URL));

// ---------------------------------------------------------------- the bike

/**
 * The bike: frame, steering fork with the front wheel, rear wheel, cranks. Origin on the ground
 * between the wheels, riding towards -z. setTire(kind), setBand(n), update(dt, state).
 */
export class BikeRig {
  constructor(kit) {
    this.root = new THREE.Group();
    this.root.userData.noFit = true;
    this.lean = new THREE.Group();
    this.root.add(this.lean);
    this.lean.add(kit.clone('BikeFrame'));
    this.fork = kit.clone('BikeFork', true) ?? new THREE.Group();
    this.fork.position.copy(HEAD_BOT);
    this.lean.add(this.fork);
    this.axis = HEAD_TOP.clone().sub(HEAD_BOT).normalize();
    this.cranks = kit.clone('BikeCranks', true) ?? new THREE.Group();
    this.lean.add(this.cranks);
    // Accent stripes per tire profile and a shared band material (it pulses and flashes).
    this.accents = Object.fromEntries(Object.entries(TIRE_TOKENS).map(([k, tok]) => [k, new THREE.MeshStandardMaterial({ color: hex(tok), roughness: 0.4, emissive: hex(tok), emissiveIntensity: 0.25, vertexColors: false })]));
    this.bandMat = new THREE.MeshBasicMaterial({ color: hex('xr-bike-band'), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.rear = this.wheel(kit);
    this.rear.g.position.copy(RA);
    this.lean.add(this.rear.g);
    this.front = this.wheel(kit);
    this.front.g.position.copy(FA).sub(HEAD_BOT);
    this.fork.add(this.front.g);
    this.kind = null;
    this.spin = 0;
    this.crank = 0;
    this.flash = 0;
    this.bands = 0;
    this.time = 0;
    this.setTire('allround');
  }

  wheel(kit) {
    const g = new THREE.Group();
    const spin = new THREE.Group();
    g.add(spin);
    const w = kit.clone('BikeWheel');
    if (w) spin.add(w);
    const tires = {};
    for (const [k, node] of Object.entries(TIRE_NODES)) {
      const tire = kit.clone(node);
      if (!tire) continue;
      tire.traverse((o) => { if (o.isMesh && o.material.name === 'BkTireAccent') o.material = this.accents[k]; });
      tire.visible = false;
      spin.add(tire);
      tires[k] = tire;
    }
    const band = kit.clone('TireBand');
    if (band) {
      band.traverse((o) => { if (o.isMesh) { o.material = this.bandMat; o.castShadow = false; } });
      band.visible = false;
      spin.add(band);
    }
    return { g, spin, tires, band };
  }

  setTire(kind) {
    if (kind === this.kind) return;
    this.kind = kind;
    for (const w of [this.front, this.rear]) for (const [k, tire] of Object.entries(w.tires)) tire.visible = k === kind;
    this.pop = 1;
  }

  /** Charges of puncture protection: the band glows while there are some. */
  setBand(n, flash = false) {
    this.bands = n;
    if (flash) this.flash = 1;
    for (const w of [this.front, this.rear]) if (w.band) w.band.visible = n > 0 || this.flash > 0;
  }

  /** speed (m/s), steer (rad), roll (rad), wobble 0..1 */
  update(dt, { speed = 0, steer = 0, roll = 0, wobble = 0 } = {}) {
    this.time += dt;
    this.spin -= (speed / WHEEL_R) * dt;
    this.crank -= speed * 0.95 * dt;
    this.front.spin.rotation.x = this.spin;
    this.rear.spin.rotation.x = this.spin;
    this.cranks.rotation.x = this.crank;
    const wob = wobble * Math.sin(this.time * 26) * 0.18;
    this.fork.quaternion.setFromAxisAngle(this.axis, steer + wob);
    this.lean.rotation.z = roll + wob * 0.3;
    this.pop = Math.max(0, (this.pop ?? 0) - dt * 3);
    const s = 1 + Math.sin(this.pop * Math.PI) * 0.12;
    for (const w of [this.front, this.rear]) w.spin.scale.setScalar(s);
    this.flash = Math.max(0, this.flash - dt * 1.6);
    this.bandMat.opacity = Math.min(1, 0.55 + 0.25 * Math.sin(this.time * 5) + this.flash * 0.8);
    for (const w of [this.front, this.rear]) if (w.band) w.band.visible = this.bands > 0 || this.flash > 0;
  }

  dispose() {
    Object.values(this.accents).forEach((m) => m.dispose());
    this.bandMat.dispose();
  }
}

// ---------------------------------------------------------------- Echo as the rider

const ECHO_SIZE = 0.6; // Echo's body width on the bike (meters at bike scale)

/** Echo on the saddle, wings on the handlebar. mood(), update(dt, state). */
export class EchoRider {
  constructor(parent, kit) {
    this.group = new THREE.Group();
    this.group.position.set(0, 1.08, 0.1);
    this.group.userData.noFit = true;
    parent.add(this.group);
    this.body = new THREE.Group();
    this.group.add(this.body);
    this.time = 0;
    this.turn = 0; // 0 ahead, 1 looking back at the player
    this.cheerT = 0;
    this.hurtT = 0;
    loadEchoParts().then((p) => this.attach(p, kit)).catch((e) => console.warn('Echo not loaded', e));
  }

  attach({ model, wings, face }, kit) {
    if (this.disposed) return;
    model.scale.setScalar(ECHO_SIZE);
    model.rotation.y = Math.PI;
    model.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    if (!CHRISTMAS) {
      const helmet = kit?.clone('EchoHelmet');
      if (helmet) model.add(helmet);
    }
    this.body.add(model);
    this.wings = wings;
    this.face = new EchoFace(face);
    this.face.setMood('focus');
  }

  mood(name, sec) { this.face?.setMood(name, sec); }
  hurt() { this.hurtT = 1; this.face?.setMood('dizzy', 1.2); }
  cheer() { this.cheerT = 1; this.face?.setMood('happy', 3); }

  /** state: { speed, turn (0..1 look back), steer, lookWorld } */
  update(dt, { speed = 0, turn = 0, steer = 0, lookWorld = null, pedal = 0 } = {}) {
    this.time += dt;
    const t = this.time;
    this.turn += (turn - this.turn) * Math.min(1, dt * 3);
    this.cheerT = Math.max(0, this.cheerT - dt * 0.4);
    this.hurtT = Math.max(0, this.hurtT - dt * 1.4);
    // Pedaling bob and a little sway, leaning into the steering.
    const bob = Math.abs(Math.sin(pedal)) * 0.025 * Math.min(1, speed / 2);
    this.body.position.set(Math.sin(pedal) * 0.012, bob + this.cheerT * 0.08 * Math.abs(Math.sin(t * 6)), 0);
    this.body.rotation.set(-0.1 - 0.12 * Math.min(1, speed / 3), this.turn * 0.9 - steer * 0.5, -steer * 0.6 + Math.sin(t * 30) * 0.2 * this.hurtT);
    if (this.wings) {
      // Wings folded forward to the grips; raised and waving when cheering.
      const cheer = Math.min(1, this.cheerT * 2);
      for (const w of this.wings) {
        const fold = 1.4 * (1 - cheer) - this.turn * 0.3;
        const a = -0.55 * (1 - cheer) + cheer * (0.9 + Math.sin(t * 14) * 0.35);
        w.node.rotation.set(0, -w.side * fold, w.side * a);
        bendWing(w, cheer ? a * 0.5 : -0.25);
      }
      this.face?.update(dt, lookWorld);
    }
  }

  dispose() { this.disposed = true; }
}

// ---------------------------------------------------------------- swallow, drone, arch

/** The guide: a swallow with flapping wings. update(dt, glide 0..1). */
export class SwallowGuide {
  constructor(kit) {
    this.root = new THREE.Group();
    this.root.userData.noFit = true;
    const body = kit.clone('Swallow');
    if (body) this.root.add(body);
    this.wings = ['SwallowWingL', 'SwallowWingR'].map((n, i) => {
      const w = kit.clone(n, true);
      if (w) this.root.add(w);
      return w ? { node: w, side: i ? 1 : -1 } : null;
    }).filter(Boolean);
    this.time = Math.random() * 10;
    this.root.traverse((o) => { if (o.isMesh) o.receiveShadow = false; });
  }

  update(dt, glide = 0) {
    this.time += dt;
    // Quick wing beats with short glides in between (the scene places the bird).
    const flapping = glide < 0.5 && this.time % 2.6 < 1.7 ? 1 : 0;
    this.amp = (this.amp ?? 1) + (flapping - (this.amp ?? 1)) * Math.min(1, dt * 6);
    const a = this.amp * Math.sin(this.time * 15) * 0.75 + (1 - this.amp) * (0.14 + Math.sin(this.time * 2) * 0.04);
    for (const w of this.wings) w.node.rotation.z = w.side * a;
  }
}

/** The scanner drone with four spinning rotors. */
export class ScanDrone {
  constructor(kit) {
    this.root = new THREE.Group();
    this.root.userData.noFit = true;
    const body = kit.clone('Drone');
    if (body) this.root.add(body);
    this.rotors = [];
    for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) {
      const r = kit.clone('DroneRotor');
      if (!r) continue;
      r.position.set(x, 0.07, z);
      this.root.add(r);
      this.rotors.push(r);
    }
    this.lens = new THREE.Vector3(0, -0.11, -0.24); // local, where the beam starts
  }

  update(dt) {
    this.rotors.forEach((r, i) => { r.rotation.y += dt * (40 + i) * (i % 2 ? 1 : -1); });
  }
}

/** Banner text panel for an arch (in the arch's units). */
function bannerPanel(text, clip) {
  const p = new Panel(4.2, 0.72, (ctx, c) => {
    const W = c.canvas.width;
    const H = c.canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = color('xr-bike-arch-banner');
    ctx.fillRect(0, 0, W, H);
    // checkered border
    const sq = H / 6;
    for (let x = 0; x < W; x += sq) {
      for (const y of [0, H - sq]) {
        ctx.fillStyle = color(((x / sq + y / sq) | 0) % 2 ? 'xr-bike-arch-b' : 'xr-bike-arch-banner');
        ctx.fillRect(x, y, sq, sq);
      }
    }
    ctx.fillStyle = color('xr-bike-arch-b');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font('black', H * 0.5);
    ctx.fillText(text, W / 2, H / 2 + H * 0.02);
  });
  p.material.transparent = false;
  p.material.clippingPlanes = clip;
  p.userData.noFit = true;
  return p;
}

/** A festive arch over the trail with a banner (and a garland with fairy lights at Christmas). */
export function makeArch(kit, text, clip) {
  const g = new THREE.Group();
  g.userData.noFit = true;
  const arch = kit.clone('Arch');
  if (arch) g.add(arch);
  const banner = bannerPanel(text, clip);
  banner.position.set(0, 4.15, 0.075);
  g.add(banner);
  g.userData.banner = banner;
  if (CHRISTMAS) {
    const garland = kit.clone('ArchGarland');
    if (garland) g.add(garland);
    const pts = [];
    for (let i = 0; i <= 26; i++) {
      const a = (Math.PI * i) / 26;
      pts.push(new THREE.Vector3(Math.cos(a) * 3.4, 3.2 + Math.sin(a) * 1.4 + 0.14, 0.5));
    }
    const bulbs = makeBulbs(pts, { size: 0.07, halo: 0.03 });
    bulbs.traverse((o) => { if (o.material) o.material.clippingPlanes = clip; });
    g.add(bulbs);
    g.userData.tick = (time) => bulbs.userData.tick(time);
  }
  return g;
}
