// "Röstmeister" (Roast Master): the 3D world from Blender (blender/build_roast.py) in the token
// colors: the counter with its display case, the drum roaster (turning drum with tumbling beans
// behind the sight glass, thermometer, lever, cooling tray, burner glow, smoke), the jars with
// green beans, the beam balance, cups, the gift basket and its items, and the guests (original
// low-poly figures with blinking eyelids, a mouth that shows their mood, walking and drinking).
import * as THREE from 'three';
import { loadGLTF } from './models.js';
import { hex } from './tokens.js';
import { radialTexture } from './robot-visuals.js';
import { softSun } from './gfx.js';

export const SHOP_URL = 'assets/models/roast.glb';
export const GUESTS_URL = 'assets/models/roast-guests.glb';

const clamp = THREE.MathUtils.clamp;
const smooth = (k) => k * k * (3 - 2 * k);
const hash = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

// ---------- materials ----------

// Blender material -> [token, roughness, metalness, extra]
const SHOP = {
  RoastWood: ['xr-roast-wood', 0.55, 0], RoastWoodDark: ['xr-roast-wood-dark', 0.6, 0], RoastWoodLight: ['xr-roast-wood-light', 0.5, 0],
  RoastMarble: ['xr-roast-marble', 0.3, 0, { physical: true, clearcoat: 0.5, clearcoatRoughness: 0.25, envMapIntensity: 0.45 }],
  RoastBrass: ['xr-roast-brass', 0.3, 1], RoastPlinth: ['xr-roast-plinth', 0.7, 0],
  RoastEnamel: ['xr-roast-enamel', 0.3, 0.05, { physical: true, clearcoat: 1, clearcoatRoughness: 0.12 }],
  RoastIron: ['xr-roast-iron', 0.48, 0.6], RoastCopper: ['xr-roast-copper', 0.28, 1], RoastSteel: ['xr-roast-steel', 0.35, 0.9],
  RoastDrum: ['xr-roast-drum', 0.6, 0.4], RoastDial: ['xr-roast-dial', 0.4, 0], RoastNeedle: ['xr-roast-needle', 0.4, 0],
  RoastKnob: ['xr-roast-knob', 0.22, 0, { physical: true, clearcoat: 1, clearcoatRoughness: 0.1 }],
  RoastPorcelain: ['xr-roast-porcelain', 0.2, 0, { physical: true, clearcoat: 1, clearcoatRoughness: 0.08 }],
  RoastGold: ['xr-roast-gold', 0.25, 1], RoastCoffee: ['xr-roast-coffee', 0.12, 0],
  RoastChocDark: ['xr-roast-choc-dark', 0.35, 0], RoastCookie: ['xr-roast-cookie', 0.7, 0], RoastCake: ['xr-roast-cake', 0.7, 0],
  RoastSugar: ['xr-roast-sugar', 0.9, 0], RoastBerry: ['xr-roast-berry', 0.2, 0, { physical: true, clearcoat: 0.8 }],
  RoastKraft: ['xr-roast-kraft', 0.85, 0], RoastLabel: ['xr-roast-label', 0.6, 0], RoastTin: ['xr-roast-tin', 0.3, 0.6],
  RoastBox: ['xr-roast-box', 0.45, 0], RoastCloth: ['xr-roast-cloth', 0.9, 0], RoastWicker: ['xr-roast-wicker', 0.75, 0],
  RoastWickerDark: ['xr-roast-wicker-dark', 0.8, 0], RoastFir: ['xr-roast-fir', 0.8, 0], RoastFirLight: ['xr-roast-fir-light', 0.8, 0],
  RoastBow: ['xr-roast-bow', 0.4, 0], RoastBauble: ['xr-roast-bauble', 0.2, 0.8], RoastBean: ['xr-roast-bean-green', 0.5, 0],
};

// ---------- surface detail: wood grain and marble veins (procedural, made once) ----------

const DETAIL = {
  RoastWood: ['wood', 3], RoastWoodDark: ['wood', 3], RoastWoodLight: ['wood', 3], RoastPlinth: ['wood', 2], RoastMarble: ['marble', 1.2],
};
const detailTex = {};

/** Smooth value noise (tileable over `period` cells). */
function valueNoise(period, seed) {
  const g = [];
  for (let i = 0; i < period * period; i++) g.push(hash(i * 7.13 + seed));
  const at = (x, y) => g[((y % period + period) % period) * period + ((x % period + period) % period)];
  return (x, y) => {
    const xi = Math.floor(x); const yi = Math.floor(y);
    const u = smooth(x - xi); const v = smooth(y - yi);
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * u;
    const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * u;
    return a + (b - a) * v;
  };
}

/**
 * A grey multiplier texture (near white, so the token color stays): 'wood' has long grain lines
 * along u, 'marble' soft veins. Tileable, mipmapped, sharp at grazing angles.
 */
function detailTexture(kind, size) {
  const key = `${kind}${size}`;
  if (detailTex[key]) return detailTex[key];
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const n1 = valueNoise(8, kind === 'wood' ? 1 : 5);
  const n2 = valueNoise(32, kind === 'wood' ? 2 : 6);
  const n3 = valueNoise(4, 9);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      let k;
      if (kind === 'wood') {
        // rings stretched along u, wobbling slowly; fine pores on top
        const w = v * 22 + 1.6 * n1(u * 8, v * 8) + 0.35 * n3(u * 4, v * 4);
        const ring = 0.5 + 0.5 * Math.sin(w * Math.PI * 2);
        const pores = n2(u * 32 * 0.25, v * 32);
        k = 0.8 + 0.13 * Math.pow(ring, 3) + 0.07 * pores;
      } else {
        // soft grey veins following a turbulent field
        const t = n1(u * 8, v * 8) * 0.6 + n2(u * 32, v * 32) * 0.25 + n3(u * 4, v * 4) * 0.8;
        const vein = Math.abs(Math.sin((u * 3 + v * 2 + t * 2.2) * Math.PI));
        k = 1 - 0.16 * Math.pow(1 - vein, 10) - 0.05 * n2(u * 32, v * 32);
      }
      const o = (y * size + x) * 4;
      const g = Math.round(255 * clamp(k, 0, 1));
      img.data[o] = g; img.data[o + 1] = g; img.data[o + 2] = g; img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  detailTex[key] = tex;
  return tex;
}

/** Box-projected UVs in meters (times `density` repeats per meter), once per geometry. */
function boxUV(geo, density) {
  if (geo.userData.boxUV) return;
  geo.userData.boxUV = true;
  const pos = geo.attributes.position;
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const nor = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i)); const ay = Math.abs(nor.getY(i)); const az = Math.abs(nor.getZ(i));
    const x = pos.getX(i); const y = pos.getY(i); const z = pos.getZ(i);
    let a; let b;
    if (ay >= ax && ay >= az) { a = x; b = z; } else if (ax >= az) { a = z; b = y; } else { a = x; b = y; }
    uv[i * 2] = a * density * 0.35; // grain runs along the long side
    uv[i * 2 + 1] = b * density;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/**
 * Surface detail by graphics tier: 'high' (desktop, Quest 3) grain and veins with a little relief,
 * 'medium' the same without relief and at half resolution, 'low' none (plain token colors).
 */
export function shopDetail(tier) {
  const M = shopMaterials();
  for (const [name, [kind]] of Object.entries(DETAIL)) {
    const m = M[name];
    const tex = tier === 'low' ? null : detailTexture(kind, tier === 'high' ? 512 : 256);
    m.map = tex;
    m.bumpMap = tier === 'high' && kind === 'wood' ? tex : null;
    m.bumpScale = 0.6;
    if (kind === 'marble') m.roughnessMap = tier === 'high' ? tex : null;
    m.needsUpdate = true;
  }
}

let shopMats = null;
/** Shared materials of the shop (one set per page; the scene does not dispose them). */
export function shopMaterials() {
  if (shopMats) return shopMats;
  shopMats = {};
  for (const [name, [token, roughness, metalness, extra = {}]] of Object.entries(SHOP)) {
    const { physical, ...rest } = extra;
    const C = physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
    shopMats[name] = new C({ name, color: hex(token), roughness, metalness, vertexColors: true, ...rest });
  }
  shopMats.RoastGlass = new THREE.MeshPhysicalMaterial({
    name: 'RoastGlass', color: hex('xr-roast-glass'), roughness: 0.05, metalness: 0, transparent: true, opacity: 0.13,
    clearcoat: 0.6, clearcoatRoughness: 0.05, depthWrite: false, envMapIntensity: 0.4,
  });
  shopMats.RoastFlameGlow = new THREE.MeshBasicMaterial({ name: 'RoastFlameGlow', color: hex('xr-roast-flame'), toneMapped: false });
  return shopMats;
}

function skin(root) {
  const M = shopMaterials();
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.material = M[o.material.name] ?? o.material;
    const d = DETAIL[o.material.name];
    if (d) boxUV(o.geometry, d[1]);
    o.castShadow = o.material !== M.RoastGlass && o.material !== M.RoastFlameGlow;
    o.receiveShadow = true;
    if (o.material === M.RoastGlass) o.renderOrder = 2;
  });
  return root;
}

/** A fresh copy of a named object of the shop model at the origin. */
export function part(gltf, name) {
  const src = gltf.scene.getObjectByName(name);
  if (!src) return new THREE.Group();
  const o = src.clone(true);
  o.position.set(0, 0, 0);
  o.rotation.set(0, 0, 0);
  return skin(o);
}

export function loadShop() {
  return Promise.all([loadGLTF(SHOP_URL), loadGLTF(GUESTS_URL)]).then(([shop, guests]) => ({ shop, guests }));
}

// ---------- beans ----------

let lowBean = null;
/**
 * A lighter bean (80 instead of 168 triangles) for the hundreds of small beans in the jars and the
 * cooling tray: the same shape (flat side with the crease), fewer segments.
 */
export function lowBeanGeometry() {
  if (lowBean) return lowBean;
  const g = new THREE.SphereGeometry(0.5, 8, 6);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let y = p.getY(i) * 0.52;
    const z = p.getZ(i) * 0.74;
    if (y < -0.05) y *= 0.55;
    if (Math.abs(z) < 0.09 && y < 0) y += 0.09;
    p.setXYZ(i, p.getX(i), y, z);
  }
  g.computeVertexNormals();
  lowBean = g;
  return g;
}

let beanGeo = null;
export function beanGeometry(gltf) {
  if (beanGeo) return beanGeo;
  const m = gltf.scene.getObjectByName('Bean');
  beanGeo = m?.geometry ?? new THREE.SphereGeometry(0.5, 10, 6);
  return beanGeo;
}

const STAGE_COLORS = [[0, 'xr-roast-bean-green'], [0.18, 'xr-roast-bean-yellow'], [0.36, 'xr-roast-bean-cinnamon'], [0.55, 'xr-roast-bean-medium'], [0.74, 'xr-roast-bean-dark'], [0.97, 'xr-roast-bean-burnt']];
let stageCols = null;
/** Bean color at roast level r (0 green .. 1 burnt). */
export function beanColor(r, out = new THREE.Color()) {
  stageCols ??= STAGE_COLORS.map(([at, tk]) => [at, new THREE.Color(hex(tk))]);
  if (r <= stageCols[0][0]) return out.copy(stageCols[0][1]);
  for (let i = 1; i < stageCols.length; i++) {
    const [a, ca] = stageCols[i - 1];
    const [b, cb] = stageCols[i];
    if (r <= b) return out.copy(ca).lerp(cb, (r - a) / (b - a));
  }
  return out.copy(stageCols[stageCols.length - 1][1]);
}

function beanMaterial() {
  return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0 });
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

/** Green beans filling a jar (in the jar's local space). */
function jarBeans(geo, seed) {
  // packed in layers up to about two thirds of the jar, a little heap on top
  const n = 96;
  const mesh = new THREE.InstancedMesh(geo, beanMaterial(), n);
  for (let i = 0; i < n; i++) {
    const h = hash(seed * 100 + i);
    const layer = Math.floor(i / 12);
    const a = (i % 12) / 12 * Math.PI * 2 + layer * 0.9 + h * 0.5;
    const r = 0.046 * Math.sqrt(hash(seed * 100 + i + 0.5));
    const heap = layer === 7 ? 0.012 * (1 - r / 0.046) : 0;
    _v.set(Math.cos(a) * r, 0.012 + layer * 0.0125 + 0.004 * h + heap, Math.sin(a) * r);
    _q.setFromEuler(_e.set(h * 6, hash(i + 3) * 6, hash(i + 7) * 6));
    mesh.setMatrixAt(i, _m.compose(_v, _q, _s.setScalar(0.021)));
    beanColor(0.02 + 0.06 * hash(i + seed), _c);
    mesh.setColorAt(i, _c);
  }
  mesh.castShadow = false;
  return mesh;
}

/** A jar of green coffee with its wooden lid; lift(k) raises it when it is chosen. */
export function makeJar(gltf, i) {
  const g = new THREE.Group();
  const jar = part(gltf, 'Jar');
  g.add(jar);
  const beans = jarBeans(lowBeanGeometry(), i + 1);
  g.add(beans);
  g.userData.beans = beans;
  return g;
}

// ---------- the drum roaster ----------

export class Roaster {
  constructor(gltf) {
    const g = (this.group = part(gltf, 'Roaster'));
    const get = (n) => g.getObjectByName(n);
    this.drum = get('RoasterDrum');
    this.lever = get('RoasterLever');
    this.needle = get('RoasterNeedle');
    this.stirrer = get('RoasterStirrer');
    this.flame = get('RoasterFlame');
    this.chimney = get('RoasterChimney');
    this.body = get('RoasterBody');
    this.beansAt = get('RoasterBeans') ?? new THREE.Object3D();
    this.hopper = get('RoasterHopper') ?? new THREE.Object3D();
    this.trayTop = get('RoasterTrayTop') ?? new THREE.Object3D();
    // Burner glow: its own material so it can flicker.
    if (this.flame) this.flame.material = new THREE.MeshBasicMaterial({ color: hex('xr-roast-flame'), toneMapped: false });
    const geo = beanGeometry(gltf);
    // Beans tumbling in the drum, seen through the sight glass.
    this.nDrum = 46;
    this.drumBeans = new THREE.InstancedMesh(geo, beanMaterial(), this.nDrum);
    this.drumBeans.frustumCulled = false;
    this.drumBeans.visible = false;
    this.beansAt.add(this.drumBeans);
    // Beans cooling in the tray after the roast.
    this.nTray = 80;
    this.trayBeans = new THREE.InstancedMesh(lowBeanGeometry(), beanMaterial(), this.nTray);
    this.trayBeans.visible = false;
    const tray = (this.trayGroup = new THREE.Group());
    this.trayTop.add(tray);
    tray.add(this.trayBeans);
    for (let i = 0; i < this.nTray; i++) {
      const a = i * 2.399;
      const r = 0.17 * Math.sqrt((i + 0.5) / this.nTray);
      _v.set(Math.cos(a) * r, 0.006 + 0.006 * hash(i), Math.sin(a) * r);
      _q.setFromEuler(_e.set(Math.PI / 2 + (hash(i + 1) - 0.5) * 0.6, hash(i + 2) * 6, 0));
      this.trayBeans.setMatrixAt(i, _m.compose(_v, _q, _s.setScalar(0.02)));
    }
    // Warm light from the burner.
    this.light = new THREE.PointLight(hex('xr-roast-flame'), 0, 0.9, 2);
    this.light.position.set(0, 0.5, 0.35);
    g.add(this.light);
    this.r = 0;
    this.spin = 0;
    this.heat = 0;
    this.leverPull = 0;
  }

  /** Beans in the drum at roast level r (shown while roasting). */
  showDrum(on) {
    this.drumBeans.visible = on;
  }

  /** Beans in the cooling tray in the color of roast level r. */
  fillTray(r) {
    this.trayBeans.visible = r !== null;
    if (r === null) return;
    for (let i = 0; i < this.nTray; i++) {
      beanColor(clamp(r + (hash(i + 9) - 0.5) * 0.05, 0, 1), _c);
      this.trayBeans.setColorAt(i, _c);
    }
    this.trayBeans.instanceColor.needsUpdate = true;
  }

  /** state: { roasting, r, heat 0..1, lever 0..1 (pulled), time } */
  update(dt, time, { roasting, r, lever = 0 }) {
    this.heat += ((roasting ? 1 : 0.15) - this.heat) * Math.min(1, dt * 2);
    this.spin += dt * (roasting ? 3.2 : 0.4);
    if (this.drum) this.drum.rotation.z = -this.spin;
    if (this.stirrer) this.stirrer.rotation.y += dt * (this.trayBeans.visible ? 1.4 : 0.2);
    this.trayGroup.rotation.y += dt * (this.trayBeans.visible ? 0.5 : 0);
    // Thermometer: about 100 to 240 degrees over the roast.
    if (this.needle) {
      const want = roasting || this.r > 0 ? -2.1 + 4.2 * clamp(r, 0, 1) : -2.1;
      this.needle.rotation.z += (-want - this.needle.rotation.z) * Math.min(1, dt * 6);
    }
    this.r = r;
    if (this.lever) this.lever.rotation.x += (lever * 1.1 - this.lever.rotation.x) * Math.min(1, dt * 14);
    const flick = 0.75 + 0.25 * Math.sin(time * 17) * Math.sin(time * 7.3);
    if (this.flame) this.flame.material.color.setHex(hex(this.heat > 0.5 ? 'xr-roast-flame-hot' : 'xr-roast-flame')).multiplyScalar(0.25 + 0.75 * this.heat * flick);
    this.light.intensity = 1.6 * this.heat * flick;
    if (this.drumBeans.visible) this.tumble(time, r);
  }

  /** Beans carried up the drum wall and falling back onto the pile. */
  tumble(time, r) {
    const n = this.nDrum;
    // a smaller loop than the drum itself, so the beans pass behind the sight glass
    const R = 0.085;
    for (let i = 0; i < n; i++) {
      const h = hash(i + 0.31);
      const z = -0.05 + 0.1 * hash(i + 4.7);
      let x;
      let y;
      if (i < 26) {
        const u = (h + time * 0.42) % 1;
        if (u < 0.55) {
          const a = -Math.PI / 2 - 0.5 + (u / 0.55) * 1.75;
          x = Math.cos(a) * R;
          y = Math.sin(a) * R;
        } else {
          const k = (u - 0.55) / 0.45;
          const a0 = -Math.PI / 2 + 1.25;
          const x0 = Math.cos(a0) * R;
          const y0 = Math.sin(a0) * R;
          const x1 = -0.04;
          const y1 = -0.075;
          x = x0 + (x1 - x0) * k;
          y = y0 + (y1 - y0) * k + 0.05 * Math.sin(k * Math.PI) - 0.04 * k * k;
        }
      } else {
        // The pile at the bottom, shuffling.
        const a = -Math.PI / 2 - 0.7 + 1.3 * h + 0.06 * Math.sin(time * 3 + i);
        const rr = R - 0.005 - 0.03 * hash(i + 2.2);
        x = Math.cos(a) * rr;
        y = Math.sin(a) * rr;
      }
      _v.set(x, y, z);
      _q.setFromEuler(_e.set(time * (1 + h * 3) + i, time * 2 * h + i * 0.7, i));
      this.drumBeans.setMatrixAt(i, _m.compose(_v, _q, _s.setScalar(0.026)));
      beanColor(clamp(r + (hash(i + 9) - 0.5) * 0.05, 0, 1), _c);
      this.drumBeans.setColorAt(i, _c);
    }
    this.drumBeans.instanceMatrix.needsUpdate = true;
    this.drumBeans.instanceColor.needsUpdate = true;
  }
}

// ---------- the beam balance ----------

export function makeScale(gltf) {
  const g = new THREE.Group();
  const root = part(gltf, 'Scale');
  g.add(root);
  const beam = root.getObjectByName('ScaleBeam');
  const panSrc = root.getObjectByName('ScalePan');
  const pans = [];
  if (panSrc) {
    panSrc.removeFromParent();
    for (const sx of [-1, 1]) {
      const p = panSrc.clone(true);
      g.add(p);
      pans.push({ p, sx });
    }
  }
  // Beans on the pans: a small heap per bean.
  const heaps = pans.map(({ p }) => {
    const m = new THREE.InstancedMesh(beanGeometry(gltf), beanMaterial(), 14);
    for (let i = 0; i < 14; i++) {
      const a = i * 2.399;
      const r = 0.035 * Math.sqrt((i + 0.5) / 14);
      _v.set(Math.cos(a) * r, -0.083 + 0.01 * (1 - r / 0.035) + 0.004 * hash(i), Math.sin(a) * r);
      _q.setFromEuler(_e.set(Math.PI / 2, hash(i) * 6, 0));
      m.setMatrixAt(i, _m.compose(_v, _q, _s.setScalar(0.018)));
      m.setColorAt(i, beanColor(0.04, _c));
    }
    m.visible = false;
    p.add(m);
    return m;
  });
  let tilt = 0;
  g.userData.tilt = 0;
  g.userData.set = (share, on) => {
    // share: part of the left bean (0..1); the heavier side goes down.
    g.userData.tilt = on ? (0.5 - share) * 0.5 : 0;
    heaps.forEach((h, i) => {
      h.visible = on;
      const k = i === 0 ? share : 1 - share;
      h.count = Math.max(3, Math.round(14 * k));
    });
  };
  g.userData.tick = (dt) => {
    tilt += (g.userData.tilt - tilt) * Math.min(1, dt * 6);
    if (beam) beam.rotation.z = tilt;
    for (const { p, sx } of pans) {
      // Pans hang from the beam ends.
      p.position.set(0.125 * sx * Math.cos(tilt), 0.225 + 0.125 * sx * Math.sin(tilt), 0);
    }
  };
  g.userData.tick(1);
  return g;
}

// ---------- cups, items, basket ----------

/** A cup on its saucer; fill(k) raises the coffee, steam(on). */
export function makeCup(gltf) {
  const g = new THREE.Group();
  const cup = part(gltf, 'Cup');
  const sau = part(gltf, 'Saucer');
  cup.position.y = 0.012;
  g.add(sau, cup);
  const top = new THREE.Mesh(new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: hex('xr-roast-coffee'), roughness: 0.08, clearcoat: 1 }));
  const crema = new THREE.Mesh(new THREE.RingGeometry(0.55, 1, 28).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: hex('xr-roast-crema'), roughness: 0.6, transparent: true, opacity: 0.85 }));
  crema.position.y = 0.0004;
  top.add(crema);
  top.userData.own = true; // its own geometry and material (the cup's are shared)
  crema.userData.own = true;
  top.visible = false;
  cup.add(top);
  g.userData.fill = (k) => {
    top.visible = k > 0.02;
    // the inside of the cup widens from r 0.03 at y 0.012 to 0.042 at y 0.062
    const y = 0.014 + 0.044 * k;
    top.position.y = y;
    top.scale.setScalar(0.03 + 0.012 * ((y - 0.012) / 0.05));
  };
  g.userData.cup = cup;
  return g;
}

export function makeItem(gltf, model) {
  return part(gltf, model);
}

export function makeBasket(gltf) {
  return part(gltf, 'Basket');
}

// ---------- particles: smoke and steam ----------

export class Puffs {
  constructor(parent, { count = 18, token = 'xr-roast-smoke', size = 0.12, rise = 0.25, life = 2.4 } = {}) {
    this.parent = parent;
    this.items = [];
    this.life = life;
    this.rise = rise;
    this.size = size;
    this.color = new THREE.Color(hex(token));
    const tex = radialTexture();
    for (let i = 0; i < count; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: this.color.clone(), transparent: true, opacity: 0, depthWrite: false }));
      s.visible = false;
      s.userData.noFit = true;
      parent.add(s);
      this.items.push({ s, t: 0, on: false, from: new THREE.Vector3(), drift: new THREE.Vector3() });
    }
  }

  emit(at, color = null, scale = 1) {
    const it = this.items.find((x) => !x.on) ?? this.items[0];
    it.on = true;
    it.t = 0;
    it.scale = scale;
    it.from.copy(at);
    it.drift.set((Math.random() - 0.5) * 0.12, this.rise * (0.8 + Math.random() * 0.4), (Math.random() - 0.5) * 0.12);
    it.s.material.color.copy(color ?? this.color);
    it.s.visible = true;
  }

  update(dt) {
    for (const it of this.items) {
      if (!it.on) continue;
      it.t += dt;
      const k = it.t / this.life;
      if (k >= 1) { it.on = false; it.s.visible = false; continue; }
      it.s.position.copy(it.from).addScaledVector(it.drift, it.t);
      it.s.scale.setScalar(this.size * it.scale * (0.4 + 1.4 * k));
      it.s.material.opacity = 0.5 * Math.sin(Math.PI * Math.min(1, k * 1.4)) * (1 - k * 0.5);
    }
  }

  dispose() {
    for (const it of this.items) { it.s.removeFromParent(); it.s.material.dispose(); }
  }
}

/** Beans flying from the jars into the hopper (shop-local space). */
export class BeanFlight {
  constructor(parent, gltf, n = 36) {
    this.mesh = new THREE.InstancedMesh(beanGeometry(gltf), beanMaterial(), n);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.userData.noFit = true;
    parent.add(this.mesh);
    this.n = n;
    this.t = -1;
    for (let i = 0; i < n; i++) this.mesh.setColorAt(i, beanColor(0.04 + 0.04 * hash(i), _c));
  }

  /** froms: start points (one per stream), to: the hopper. */
  start(froms, to) {
    this.froms = froms.map((f) => f.clone());
    this.to = to.clone();
    this.t = 0;
    this.mesh.visible = true;
  }

  update(dt) {
    if (this.t < 0) return false;
    this.t += dt;
    const D = 0.55;
    let alive = false;
    for (let i = 0; i < this.n; i++) {
      const from = this.froms[i % this.froms.length];
      const t0 = (Math.floor(i / this.froms.length) / (this.n / this.froms.length)) * 0.5;
      const k = clamp((this.t - t0) / D, 0, 1);
      if (k < 1) alive = true;
      const mid = from.clone().lerp(this.to, 0.5);
      mid.y = Math.max(from.y, this.to.y) + 0.18;
      const a = from.clone().lerp(mid, k);
      const b = mid.lerp(this.to, k);
      _v.copy(a.lerp(b, k));
      _v.x += (hash(i) - 0.5) * 0.03 * Math.sin(k * Math.PI);
      _q.setFromEuler(_e.set(this.t * 9 + i, this.t * 7, i));
      const s = k <= 0 || k >= 1 ? 0.0001 : 0.022;
      this.mesh.setMatrixAt(i, _m.compose(_v, _q, _s.setScalar(s)));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (!alive) { this.t = -1; this.mesh.visible = false; }
    return alive;
  }
}

// ---------- guests ----------

const GUEST_TOKENS = {
  student: { GSkin: 'xr-roast-skin-1', GHair: 'xr-roast-student-hair', GCoat: 'xr-roast-student-coat', GPants: 'xr-roast-student-pants', GAccent: 'xr-roast-student-acc', GAccent2: 'xr-roast-student-acc2' },
  grandma: { GSkin: 'xr-roast-skin-1', GHair: 'xr-roast-grandma-hair', GCoat: 'xr-roast-grandma-coat', GPants: 'xr-roast-grandma-pants', GAccent: 'xr-roast-grandma-acc', GAccent2: 'xr-roast-grandma-acc2' },
  business: { GSkin: 'xr-roast-skin-4', GHair: 'xr-roast-biz-hair', GCoat: 'xr-roast-biz-coat', GPants: 'xr-roast-biz-pants', GAccent: 'xr-roast-biz-acc', GAccent2: 'xr-roast-biz-acc2' },
  family: { GSkin: 'xr-roast-skin-3', GHair: 'xr-roast-family-hair', GCoat: 'xr-roast-family-coat', GPants: 'xr-roast-family-pants', GAccent: 'xr-roast-family-acc', GAccent2: 'xr-roast-family-acc2' },
  kid: { GSkin: 'xr-roast-skin-3', GHair: 'xr-roast-family-hair', GCoat: 'xr-roast-kid-coat', GPants: 'xr-roast-family-pants', GAccent: 'xr-roast-kid-acc', GAccent2: 'xr-roast-kid-acc' },
  chef: { GSkin: 'xr-roast-skin-2', GHair: 'xr-roast-chef-hair', GCoat: 'xr-roast-chef-coat', GPants: 'xr-roast-chef-pants', GAccent: 'xr-roast-chef-acc', GAccent2: 'xr-roast-chef-acc2' },
  // the rush: new guests on the same figures in their own colors
  biz2: { GSkin: 'xr-roast-skin-2', GHair: 'xr-roast-biz2-hair', GCoat: 'xr-roast-biz2-coat', GPants: 'xr-roast-biz2-pants', GAccent: 'xr-roast-biz2-acc', GAccent2: 'xr-roast-biz2-acc2' },
  student2: { GSkin: 'xr-roast-skin-3', GHair: 'xr-roast-student2-hair', GCoat: 'xr-roast-student2-coat', GPants: 'xr-roast-student2-pants', GAccent: 'xr-roast-student2-acc', GAccent2: 'xr-roast-student2-acc2' },
  chef2: { GSkin: 'xr-roast-skin-1', GHair: 'xr-roast-chef2-hair', GCoat: 'xr-roast-chef2-coat', GPants: 'xr-roast-chef2-pants', GAccent: 'xr-roast-chef2-acc', GAccent2: 'xr-roast-chef2-acc2' },
};
const COMMON = { GShoe: 'xr-roast-wood-dark', GEye: 'xr-roast-eye', GWhite: 'xr-roast-white', GCheek: 'xr-roast-cheek', GMetal: 'xr-roast-metal' };
const MODEL = { student: 'GuestStudent', grandma: 'GuestGrandma', business: 'GuestBusiness', family: 'GuestFamily', kid: 'GuestKid', chef: 'GuestChef' };
const HEAD_R = { kid: 0.14 };

/** One figure (body, head with face, arms) from the guests model. */
class Figure {
  constructor(gltf, model, look = model) {
    const src = gltf.scene.getObjectByName(MODEL[model]);
    this.root = src ? src.clone(true) : new THREE.Group();
    this.root.position.set(0, 0, 0);
    this.mats = [];
    const tokens = { ...COMMON, ...(GUEST_TOKENS[look] ?? GUEST_TOKENS[model]) };
    const cache = {};
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      const name = o.material.name;
      cache[name] ??= new THREE.MeshStandardMaterial({ name, color: hex(tokens[name] ?? 'xr-roast-white'), roughness: name === 'GEye' ? 0.15 : name === 'GMetal' ? 0.3 : 0.65, metalness: name === 'GMetal' ? 0.8 : 0 });
      o.material = cache[name];
      o.castShadow = true;
    });
    this.mats = Object.values(cache);
    const n = MODEL[model];
    this.head = this.root.getObjectByName(`${n}_Head`) ?? new THREE.Object3D();
    this.armL = this.root.getObjectByName(`${n}_ArmL`) ?? new THREE.Object3D();
    this.armR = this.root.getObjectByName(`${n}_ArmR`) ?? new THREE.Object3D();
    this.body = this.root.getObjectByName(`${n}_Body`) ?? new THREE.Object3D();
    this.mouthAt = this.root.getObjectByName(`${n}_Mouth`) ?? new THREE.Object3D();
    this.hand = this.root.getObjectByName(`${n}_Hand`) ?? new THREE.Object3D();
    this.headY0 = this.head.position.y;
    const r = HEAD_R[model] ?? 0.165;
    this.r = r;
    // Face: mouths for the moods and eyelids for blinking (on the head, in front of the face).
    const mouthMat = new THREE.MeshStandardMaterial({ color: hex('xr-roast-mouth'), roughness: 0.5 });
    this.mats.push(mouthMat);
    const k = r / 0.165;
    const arc = new THREE.TorusGeometry(0.03 * k, 0.0065 * k, 6, 16, Math.PI);
    this.mouths = {
      happy: new THREE.Mesh(arc, mouthMat),
      sad: new THREE.Mesh(arc, mouthMat),
      neutral: new THREE.Mesh(new THREE.CapsuleGeometry(0.006 * k, 0.034 * k, 4, 8).rotateZ(Math.PI / 2), mouthMat),
      talk: new THREE.Mesh(new THREE.SphereGeometry(0.019 * k, 12, 8), mouthMat),
    };
    this.mouths.happy.rotation.z = Math.PI;
    this.mouths.happy.position.y = 0.012 * k;
    this.mouths.sad.position.y = -0.016 * k;
    this.mouths.talk.scale.set(1, 0.8, 0.35);
    const face = new THREE.Group();
    face.position.copy(this.mouthAt.position);
    // tilt the face parts to follow the head's curve
    face.rotation.x = -0.3;
    Object.values(this.mouths).forEach((m) => { m.visible = false; face.add(m); });
    this.head.add(face);
    const lidMat = cache.GSkin ?? mouthMat;
    const center = this.mouthAt.position.clone().add(new THREE.Vector3(0, 0.36 * r, -0.92 * r));
    this.lids = [-1, 1].map((sx) => {
      const lid = new THREE.Mesh(new THREE.SphereGeometry(0.026 * k, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), lidMat);
      lid.position.copy(center).add(new THREE.Vector3(sx * 0.36 * r, 0.08 * r + 0.004, 0.875 * r));
      lid.rotation.x = Math.PI / 2 - 0.1;
      lid.scale.set(1, 0.6, 0.001);
      this.head.add(lid);
      return lid;
    });
    this.mood = 'neutral';
    this.setMood('neutral');
    this.blinkT = 1 + Math.random() * 2;
    this.blink = 0;
    this.seed = Math.random() * 10;
  }

  setMood(m) {
    this.mood = m;
    Object.entries(this.mouths).forEach(([k, mesh]) => { mesh.visible = k === m; });
  }

  dispose() {
    this.mats.forEach((m) => m.dispose());
    Object.values(this.mouths).forEach((m) => m.geometry.dispose());
    this.lids.forEach((l) => l.geometry.dispose());
  }
}

/**
 * A guest: one figure (plus a child for the family). walk(k): walking animation 0..1 weight,
 * talk(on), drink(k 0..1), react(mood) with a little hop, a shake or a tilt.
 */
export class Guest {
  constructor(gltf, model, look = model) {
    this.group = new THREE.Group();
    this.main = new Figure(gltf, model, look);
    this.group.add(this.main.root);
    this.figures = [this.main];
    if (model === 'family') {
      // the child stands on a little wooden step stool to see over the display case
      const STEP = 0.44;
      const stool = new THREE.Group();
      const M = shopMaterials();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.28), M.RoastWoodLight);
      seat.position.y = STEP - 0.02;
      stool.add(seat);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const leg = new THREE.Mesh(new THREE.BoxGeometry(0.035, STEP - 0.04, 0.035), M.RoastWood);
          leg.position.set(sx * 0.14, (STEP - 0.04) / 2, sz * 0.11);
          stool.add(leg);
        }
      }
      stool.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.own = true; } });
      stool.position.set(0.36, 0, 0.06);
      this.group.add(stool);
      this.stool = stool;
      const kid = new Figure(gltf, 'kid');
      kid.root.position.set(0.36, 0, 0.06);
      kid.root.rotation.y = -0.15;
      kid.lift = STEP;
      this.group.add(kid.root);
      this.figures.push(kid);
    }
    this.time = 0;
    this.walking = 0;
    this.talking = false;
    this.drinkK = 0;
    this.reactT = -1;
    this.reactMood = 'neutral';
  }

  /** Where the cup goes when the guest drinks (group-local, follows the right hand). */
  get hand() {
    return this.main.hand;
  }

  setMood(m) {
    this.figures.forEach((f) => f.setMood(m));
  }

  react(mood) {
    this.reactMood = mood;
    this.reactT = 0;
    this.setMood(mood === 'happy' ? 'happy' : mood === 'sad' ? 'sad' : 'neutral');
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    this.figures.forEach((f, i) => {
      const s = f.seed + i;
      // Breathing and a slow sway; walking bobs and swings the arms.
      const walk = this.walking;
      const step = Math.sin(t * 9 + s);
      f.root.position.y = (f.lift ?? 0) + walk * Math.abs(step) * 0.025 + 0.004 * Math.sin(t * 1.8 + s);
      f.root.rotation.z = walk * step * 0.04 + 0.012 * Math.sin(t * 0.9 + s);
      f.armL.rotation.x = walk * step * 0.45;
      f.armR.rotation.x = -walk * step * 0.45;
      f.armL.rotation.z = 0;
      f.armR.rotation.z = 0;
      f.head.rotation.set(0.04 * Math.sin(t * 0.7 + s), 0.1 * Math.sin(t * 0.5 + s), 0.04 * Math.sin(t * 0.8 + s));
      // Blinking.
      f.blinkT -= dt;
      if (f.blinkT <= 0) { f.blink = 0.14; f.blinkT = 2 + Math.random() * 3; }
      f.blink = Math.max(0, f.blink - dt);
      const lid = f.blink > 0 ? 1 : 0.001;
      f.lids.forEach((l) => { l.scale.z = lid; });
      // Talking: the mouth opens and closes.
      if (this.talking && i === 0) {
        const open = Math.sin(t * 16) > 0;
        f.mouths.talk.visible = open;
        f.mouths.neutral.visible = !open && f.mood === 'neutral';
        f.mouths.happy.visible = !open && f.mood === 'happy';
      } else if (i === 0 && f.mouths.talk.visible && f.mood !== 'talk') f.setMood(f.mood);
    });
    const f = this.main;
    // Waited too long: the head hangs (and the walk out is slow).
    if (this.slump) this.figures.forEach((g) => { g.head.rotation.x += 0.32; g.armL.rotation.x *= 0.4; g.armR.rotation.x *= 0.4; });
    // Drinking: the right arm brings the cup up, the head tilts back.
    if (this.drinkK > 0) {
      const k = smooth(clamp(this.drinkK, 0, 1));
      f.armR.rotation.x = -1.75 * k;
      f.armR.rotation.z = 0.6 * k;
      f.head.rotation.x -= 0.28 * clamp((this.drinkK - 0.6) / 0.4, 0, 1);
    }
    // Reactions.
    if (this.reactT >= 0) {
      this.reactT += dt;
      const k = this.reactT;
      if (this.reactMood === 'happy') {
        this.figures.forEach((g) => {
          g.root.position.y += Math.max(0, Math.sin(Math.min(k, 1.2) * Math.PI * 2.5)) * 0.05 * Math.max(0, 1 - k / 1.2);
          g.armL.rotation.x = -2.4 * smooth(clamp(k * 3, 0, 1)) * (k < 2 ? 1 : Math.max(0, 1 - (k - 2) * 2));
          g.armL.rotation.z = 0.4 * Math.sin(k * 12) * (k < 2 ? 1 : 0);
        });
      } else if (this.reactMood === 'sad') {
        f.head.rotation.y += Math.sin(k * 14) * 0.35 * Math.max(0, 1 - k / 1.3);
        f.head.rotation.x += 0.12 * clamp(k * 2, 0, 1);
      } else {
        f.head.rotation.z += 0.18 * clamp(k * 3, 0, 1) * Math.max(0, 1 - Math.max(0, k - 1.5));
      }
    }
  }

  dispose() {
    this.figures.forEach((f) => f.dispose());
    this.stool?.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  }
}

// ---------- shop lights ----------

/** Warm key light with a soft shadow over the counter, a cool rim from behind. */
export function makeLights(tier, shadows) {
  const g = new THREE.Group();
  g.userData.noFit = true;
  // warm key from the upper left (the shop's lamps), a cool rim from behind (the window light),
  // a soft warm fill close to the counter
  const key = new THREE.DirectionalLight(hex('xr-roast-light'), 2.8);
  key.position.set(-1.35, 1.9, 0.15); // from the left and above: shadows fall to the right, visible on the counter
  key.target.position.set(0.1, 0, -1.1);
  const rim = new THREE.DirectionalLight(hex('xr-roast-glass'), tier === 'low' ? 0.7 : 1.1);
  rim.position.set(0.6, 1.4, -2.4);
  rim.target = key.target;
  const fill = new THREE.PointLight(hex('xr-roast-light'), shadows ? 0.35 : 0.6, 3, 2);
  fill.position.set(0.2, 1.2, 0.3); // high in front: lifts the guests' faces, keeps the key's shadows on the counter
  g.add(key, key.target, rim, fill);
  // one shadow-casting light; the map size follows the tier (2048 on desktop and Quest 3, else 1024)
  if (shadows) softSun(key, { size: 2.9, near: 0.3, far: 4.5, bias: -0.0005, normalBias: 0.018 });
  g.userData.key = key;
  return g;
}
