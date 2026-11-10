// Christmas decoration (SEASON in config.js): Echo wears a Santa hat wherever it appears
// (blender/build_santahat.py), and the menu gets a Christmas tree with twinkling fairy lights
// (blender/build_xmas.py) and a string of lights draped over its title. All colors from tokens.
import * as THREE from 'three';
import { loadGLTF } from './models.js';
import { hex } from './tokens.js';
import { radialTexture } from './robot-visuals.js';
import { SEASON } from './config.js';

export const CHRISTMAS = SEASON === 'christmas';
const HAT_URL = 'assets/models/santa-hat.glb';
const TREE_URL = 'assets/models/xmas.glb';

// ---------- Echo's Santa hat ----------

let hatMats = null;
function hatMaterials() {
  hatMats ??= {
    HatRed: new THREE.MeshPhysicalMaterial({ name: 'HatRed', color: hex('xr-xmas-hat'), roughness: 0.6, sheen: 0.8, sheenRoughness: 0.5, sheenColor: new THREE.Color(hex('xr-xmas-hat-sheen')) }),
    HatFur: new THREE.MeshPhysicalMaterial({ name: 'HatFur', color: hex('xr-xmas-fur'), roughness: 0.95, sheen: 1, sheenRoughness: 0.8, sheenColor: new THREE.Color(hex('xr-xmas-fur')) }),
  };
  return hatMats;
}

/**
 * Puts the Santa hat on an Echo model (in Echo's own model space, like the goggles). Resolves
 * when it sits there (callers that re-style the model, e.g. the arena's holograms, wait for it).
 */
export function addSantaHat(model) {
  if (!CHRISTMAS) return Promise.resolve(null);
  return loadGLTF(HAT_URL).then((gltf) => {
    const hat = gltf.scene.getObjectByName('SantaHat')?.clone(true);
    if (!hat) return null;
    const mats = hatMaterials();
    hat.traverse((o) => {
      if (!o.isMesh) return;
      // Own copies: some scenes tint or flash Echo's materials.
      o.material = (mats[o.material.name] ?? o.material).clone();
      o.castShadow = true;
      o.frustumCulled = false;
    });
    model.add(hat);
    return hat;
  }).catch((e) => { console.warn('Santa hat not loaded', e); return null; });
}

// ---------- twinkling bulbs ----------

const BULB_TOKENS = ['xr-xmas-light-1', 'xr-xmas-light-2', 'xr-xmas-light-3', 'xr-xmas-light-4', 'xr-xmas-light-5'];

/**
 * Fairy lights at the given points (local space of the returned group): small glowing bulbs with
 * a soft halo each, twinkling one after another. tick(time).
 */
export function makeBulbs(points, { size = 0.012, halo = 0.075 } = {}) {
  const group = new THREE.Group();
  group.userData.noFit = true;
  const n = points.length;
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(size, 10, 8), new THREE.MeshBasicMaterial({ toneMapped: false }), n);
  bulbs.frustumCulled = false;
  bulbs.userData.noFit = true;
  const m = new THREE.Matrix4();
  const base = points.map((p, i) => {
    m.makeTranslation(p.x, p.y, p.z);
    bulbs.setMatrixAt(i, m);
    return new THREE.Color(hex(BULB_TOKENS[i % BULB_TOKENS.length]));
  });
  base.forEach((c, i) => bulbs.setColorAt(i, c));
  const pos = new Float32Array(n * 3);
  points.forEach((p, i) => pos.set([p.x, p.y, p.z], i * 3));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const col = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
  geo.setAttribute('color', col);
  const halos = new THREE.Points(geo, new THREE.PointsMaterial({ size: halo, map: radialTexture(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
  halos.frustumCulled = false;
  halos.userData.noFit = true;
  group.add(bulbs, halos);
  const phase = points.map((_, i) => (i * 2.399) % (Math.PI * 2));
  const c = new THREE.Color();
  group.userData.tick = (time) => {
    for (let i = 0; i < n; i++) {
      // A slow chase along the string plus a little individual sparkle.
      const k = 0.55 + 0.45 * Math.max(Math.sin(time * 2.2 - i * 0.45), Math.sin(time * 5 + phase[i]) * 0.6);
      c.copy(base[i]).multiplyScalar(0.35 + 0.65 * k);
      bulbs.setColorAt(i, c);
      col.setXYZ(i, base[i].r * k, base[i].g * k, base[i].b * k);
    }
    bulbs.instanceColor.needsUpdate = true;
    col.needsUpdate = true;
  };
  return group;
}

/** A dark wire through points (thin tube). */
function wire(points, radius = 0.003) {
  const curve = new THREE.CatmullRomCurve3(points);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(8, points.length * 3), radius, 5, false), new THREE.MeshStandardMaterial({ color: hex('xr-xmas-wire'), roughness: 0.6 }));
  m.userData.noFit = true;
  return m;
}

/**
 * A string of lights hanging in `swags` arcs from x0 to x1 at height y (local space), sagging by
 * `sag`, at depth z. Returns a group with tick(time).
 */
export function makeLightString({ x0, x1, y, z, sag = 0.05, swags = 3, bulbs = 34 }) {
  const g = new THREE.Group();
  g.userData.noFit = true;
  const at = (u) => {
    const s = (u * swags) % 1;
    return new THREE.Vector3(x0 + (x1 - x0) * u, y - sag * 4 * s * (1 - s), z);
  };
  const path = Array.from({ length: swags * 16 + 1 }, (_, i) => at(i / (swags * 16)));
  g.add(wire(path));
  const pts = Array.from({ length: bulbs }, (_, i) => at((i + 0.5) / bulbs).add(new THREE.Vector3(0, -0.012, 0)));
  const b = makeBulbs(pts);
  g.add(b);
  g.userData.tick = (time) => b.userData.tick(time);
  return g;
}

// ---------- the Christmas tree ----------

// Must match blender/build_xmas.py (the tree's tiers and their envelope).
export const TIERS = [[0.30, 0.62], [0.52, 0.84], [0.74, 1.06], [0.96, 1.28], [1.16, 1.52]];
const envelope = (y) => 0.6 * (1.55 - y) / 1.25;
export const tierRadius = (y, yb, yt) => { const k = (y - yb) / (yt - yb); return 1.06 * envelope(yb) * (1 - k) + 0.5 * envelope(yt) * k; };
/** Radius of the needles at height y (the outermost tier there). */
export const surface = (y) => TIERS.reduce((r, [yb, yt]) => (y >= yb && y <= yt ? Math.max(r, tierRadius(y, yb, yt)) : r), 0);

/** Materials for xmas.glb (fresh copies on every call). */
export function treeMaterials() {
  const std = (token, roughness, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color: hex(token), roughness, metalness, vertexColors: true, ...extra });
  return {
    XmasNeedle: std('xr-xmas-needle', 0.85),
    XmasNeedleTip: std('xr-xmas-needle-tip', 0.85),
    XmasTrunk: std('xr-xmas-trunk', 0.85),
    XmasTub: std('xr-xmas-tub', 0.7),
    XmasGold: std('xr-xmas-gold', 0.25, 1, { emissive: hex('xr-xmas-gold'), emissiveIntensity: 0.15 }),
    XmasRed: std('xr-xmas-red', 0.22, 0.3, { emissive: hex('xr-xmas-red'), emissiveIntensity: 0.12 }),
    XmasBlue: std('xr-xmas-blue', 0.22, 0.3, { emissive: hex('xr-xmas-blue'), emissiveIntensity: 0.12 }),
    XmasGreen: std('xr-xmas-green', 0.5),
    XmasRibbon: std('xr-xmas-ribbon', 0.5),
    XmasStarGlow: new THREE.MeshBasicMaterial({ color: hex('xr-xmas-star'), toneMapped: false }),
  };
}

/**
 * The Christmas tree (about 1.65 m, origin on the floor) with fairy lights spiralling around it
 * and a glow at the star. Returns { group, tick(time) }.
 */
export function makeTree() {
  const group = new THREE.Group();
  group.userData.noFit = true;
  // Fairy lights: a spiral just outside the needles.
  const pts = [];
  const N = 46;
  for (let i = 0; i < N; i++) {
    const u = (i + 0.5) / N;
    const y = 0.36 + u * 1.06;
    const a = u * Math.PI * 2 * 3.2 + 1.1;
    const r = surface(y) + 0.02;
    pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
  }
  const lights = makeBulbs(pts, { size: 0.014, halo: 0.09 });
  group.add(lights);
  const star = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), color: hex('xr-xmas-star'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  star.position.set(0, 1.6, 0);
  star.scale.setScalar(0.5);
  star.userData.noFit = true;
  group.add(star);
  loadGLTF(TREE_URL).then((gltf) => {
    const tree = gltf.scene.getObjectByName('XmasTree')?.clone(true);
    if (!tree) return;
    const mats = treeMaterials();
    tree.position.set(0, 0, 0);
    tree.traverse((o) => {
      if (!o.isMesh) return;
      o.material = mats[o.material.name] ?? o.material;
      o.userData.noFit = true;
      o.castShadow = true;
    });
    group.add(tree);
  }).catch((e) => console.warn('Christmas tree not loaded', e));
  return {
    group,
    tick(time) {
      lights.userData.tick(time);
      star.material.opacity = 0.55 + 0.25 * Math.sin(time * 2.4);
      star.scale.setScalar(0.45 + 0.06 * Math.sin(time * 1.7));
    },
  };
}
