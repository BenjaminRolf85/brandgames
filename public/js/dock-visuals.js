// "Andock-Labor" (Docking Lab): everything that draws. Ball-and-stick molecules (instanced
// atoms, two-colored half bonds, aromatic rings, glow shells for the contact feedback), the
// protein's material (pearly surface with a fresnel rim and a build-in scan), contact spot markers,
// the screening stream, the microplate of the lab test, the lab bench from Blender (dock.glb) and
// the canvas panels (AI ranking, fit meter, lab result, legend). All colors from tokens.
import * as THREE from 'three';
import { color, hex, num, font } from './tokens.js';
import { t } from './i18n.js';
import { roundRect, wrap } from './ui3d.js';
import { loadGLTF } from './models.js';
import { radialTexture } from './robot-visuals.js';
import { ELEMENTS, SPOTS, B } from './dock-chem.js';

export const DOCK_URL = 'assets/models/dock.glb';
const col = (token) => new THREE.Color(hex(token));

// ---------- shared kit (geometries and materials of one scene) ----------

const GLOW_VS = /* glsl */ `
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vC;
  void main() {
    vec4 p = vec4(position, 1.0);
    vec3 n = normal;
    #ifdef USE_INSTANCING
      p = instanceMatrix * p;
      n = mat3(instanceMatrix) * n;
    #endif
    #ifdef USE_INSTANCING_COLOR
      vC = instanceColor;
    #else
      vC = vec3(1.0);
    #endif
    vec4 mv = modelViewMatrix * p;
    vN = normalize(normalMatrix * n);
    vV = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;
const GLOW_FS = /* glsl */ `
  uniform float uBoost;
  varying vec3 vN;
  varying vec3 vV;
  varying vec3 vC;
  void main() {
    float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
    float a = 0.18 + 1.5 * pow(f, 2.2);
    gl_FragColor = vec4(vC * a * uBoost, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Geometries and materials shared by all molecules of a scene. */
export function makeKit() {
  const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
  const kit = {
    sphere: new THREE.SphereGeometry(1, 22, 16),
    sphereLo: new THREE.SphereGeometry(1, 14, 10),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 12, 1, true),
    torus: new THREE.TorusGeometry(B * 0.6, 0.0028, 8, 40),
    proxy: new THREE.SphereGeometry(1, 12, 8),
    atomMat: new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.26, metalness: 0.02, clearcoat: 1, clearcoatRoughness: 0.12 }),
    bondMat: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.15 }),
    ringMat: new THREE.MeshStandardMaterial({ color: hex('xr-dock-bond'), roughness: 0.3, metalness: 0.3, emissive: hex('xr-dock-bond'), emissiveIntensity: 0.15 }),
    glowMat: new THREE.ShaderMaterial({ uniforms: { uBoost: { value: 1 } }, vertexShader: GLOW_VS, fragmentShader: GLOW_FS, ...additive }),
    ghostMat: new THREE.ShaderMaterial({ uniforms: { uBoost: { value: 0.6 } }, vertexShader: GLOW_VS, fragmentShader: GLOW_FS, ...additive }),
    hidden: new THREE.MeshBasicMaterial({ visible: false }),
  };
  kit.cyl.translate(0, 0.5, 0); // from its base along +y
  return kit;
}

// ---------- molecules ----------

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _v = new THREE.Vector3();
const _c = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);

/**
 * A ball-and-stick molecule. group: the molecule frame (origin = the binder's centroid).
 * proxy: an invisible sphere for pointing and grabbing. setGlow(i, color, k) per atom.
 */
export class MoleculeView {
  constructor(kit, mol, { ghost = false } = {}) {
    this.mol = mol;
    const g = (this.group = new THREE.Group());
    g.userData.noFit = true; // instanced unit geometry would confuse the camera framing
    const n = mol.atoms.length;
    const white = new THREE.Color(0xffffff);
    if (!ghost) {
      this.atoms = new THREE.InstancedMesh(kit.sphere, kit.atomMat, n);
      mol.atoms.forEach((a, i) => {
        const r = ELEMENTS[a.el].r;
        this.atoms.setMatrixAt(i, _m.compose(a.p, _q.identity(), _s.setScalar(r)));
        this.atoms.setColorAt(i, _c.setHex(hex(ELEMENTS[a.el].token)));
      });
      // Half bonds in the colors of their atoms (a little lighter).
      this.bonds = new THREE.InstancedMesh(kit.cyl, kit.bondMat, Math.max(1, mol.bonds.length * 2));
      let k = 0;
      for (const [i, j] of mol.bonds) {
        const a = mol.atoms[i].p;
        const b = mol.atoms[j].p;
        const mid = _v.copy(a).add(b).multiplyScalar(0.5).clone();
        for (const [from, el] of [[a, mol.atoms[i].el], [b, mol.atoms[j].el]]) {
          const d = mid.clone().sub(from);
          _q.setFromUnitVectors(UP, d.clone().normalize());
          this.bonds.setMatrixAt(k, _m.compose(from, _q, _s.set(0.0048, d.length(), 0.0048)));
          this.bonds.setColorAt(k, _c.setHex(hex(ELEMENTS[el].token)).lerp(white, 0.42));
          k += 1;
        }
      }
      this.bonds.count = k;
      g.add(this.atoms, this.bonds);
      // Aromatic rings: a thin inner circle.
      for (const ring of mol.rings) {
        const pts = ring.map((i) => mol.atoms[i].p);
        const c = pts.reduce((s, p) => s.add(p), new THREE.Vector3()).divideScalar(pts.length);
        const nrm = pts[1].clone().sub(pts[0]).cross(pts[2].clone().sub(pts[1])).normalize();
        const tor = new THREE.Mesh(kit.torus, kit.ringMat);
        tor.position.copy(c);
        tor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), nrm);
        g.add(tor);
      }
    }
    // Glow shells: black is invisible (additive); colored for contacts and clashes.
    this.glow = new THREE.InstancedMesh(kit.sphereLo, ghost ? kit.ghostMat : kit.glowMat, n);
    mol.atoms.forEach((a, i) => {
      this.glow.setMatrixAt(i, _m.compose(a.p, _q.identity(), _s.setScalar(ELEMENTS[a.el].r * (ghost ? 1.05 : 1.6))));
      this.glow.setColorAt(i, ghost ? col('xr-dock-ghost') : _c.setRGB(0, 0, 0));
    });
    this.glow.renderOrder = 2;
    g.add(this.glow);
    [this.atoms, this.bonds, this.glow].forEach((im) => im?.computeBoundingSphere());
    this.proxy = new THREE.Mesh(kit.proxy, kit.hidden);
    this.proxy.scale.setScalar(Math.max(0.055, mol.radius * 0.95));
    g.add(this.proxy);
    this.glowDirty = false;
  }

  setGlow(i, c, k) {
    _c.copy(c).multiplyScalar(k);
    this.glow.setColorAt(i, _c);
    this.glowDirty = true;
  }

  clearGlow() {
    for (let i = 0; i < this.mol.atoms.length; i++) this.glow.setColorAt(i, _c.setRGB(0, 0, 0));
    this.glowDirty = true;
  }

  flush() {
    if (!this.glowDirty) return;
    this.glow.instanceColor.needsUpdate = true;
    this.glowDirty = false;
  }

  /** Frees the per-molecule GPU buffers (geometries and materials belong to the kit). */
  dispose() {
    [this.atoms, this.bonds, this.glow].forEach((im) => im?.dispose());
  }
}

// ---------- the protein ----------

/**
 * Pearly surface with vertex colors (crevices, pocket, contact spots), a soft fresnel rim and a
 * build-in scan: only the part below uReveal (local y) is drawn, with a glowing edge.
 */
export function proteinMaterial() {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.46, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.35,
    sheen: 0.35, sheenRoughness: 0.5, sheenColor: col('xr-dock-protein-sheen'),
  });
  const u = { uRim: { value: col('xr-dock-protein-rim') }, uRimK: { value: 0.35 }, uReveal: { value: 1 }, uEdge: { value: 0 } };
  mat.userData.u = u;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDockPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDockPos = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDockPos;\nuniform vec3 uRim;\nuniform float uRimK;\nuniform float uReveal;\nuniform float uEdge;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vDockPos.y > uReveal) discard;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        float dockF = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
        totalEmissiveRadiance += uRim * dockF * uRimK;
        float dockBand = smoothstep(uReveal - 0.018, uReveal, vDockPos.y) * uEdge;
        totalEmissiveRadiance += uRim * dockBand * 2.5;`);
  };
  mat.customProgramCacheKey = () => 'dock-protein';
  return mat;
}

/** A glowing marker per contact spot (child of the pocket frame). tick(states, time). */
export function makeSpotMarkers(slots) {
  const g = new THREE.Group();
  g.userData.noFit = true;
  const marks = [];
  slots.forEach((s, j) => {
    if (!s.spot) return;
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), color: hex(SPOTS[s.spot].token), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.6 }));
    m.position.copy(s.p);
    m.scale.setScalar(0.06);
    m.renderOrder = 1;
    g.add(m);
    marks.push({ j, m, base: col(SPOTS[s.spot].token), pulse: 0 });
  });
  const good = col('xr-dock-good');
  const bad = col('xr-dock-bad');
  g.userData.tick = (states, time, dim = 1) => {
    for (const k of marks) {
      const st = states?.[k.j];
      const ph = time * 3 + k.j;
      if (st === 'good') { k.m.material.color.copy(good); k.m.material.opacity = 0.95 * dim; k.m.scale.setScalar(0.075); }
      else if (st === 'bad') { k.m.material.color.copy(bad); k.m.material.opacity = (0.6 + 0.4 * Math.sin(time * 18)) * dim; k.m.scale.setScalar(0.07); }
      else { k.m.material.color.copy(k.base); k.m.material.opacity = (0.45 + 0.25 * Math.sin(ph)) * dim; k.m.scale.setScalar(0.055 + 0.008 * Math.sin(ph)); }
    }
  };
  return g;
}

/** A soft round contact shadow (lies flat, local y up). */
export function blobShadow(w, d, opacity = 0.45) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: radialTexture(), color: hex('xr-dock-shadow'), transparent: true, opacity, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.userData.noFit = true;
  m.renderOrder = -1;
  return m;
}

// ---------- the screening stream ----------

const LIB_VS = /* glsl */ `
  uniform float uT;
  uniform float uSize;
  attribute vec3 aStart;
  attribute vec3 aEnd;
  attribute vec3 aMid;
  attribute float aDelay;
  attribute float aPass;
  varying float vA;
  varying float vPass;
  varying float vK;
  void main() {
    float k = clamp((uT - aDelay) / 0.55, 0.0, 1.0);
    float e = k * k * (3.0 - 2.0 * k);
    vec3 p = mix(mix(aStart, aMid, e), mix(aMid, aEnd, e), e);
    vK = k;
    vPass = aPass;
    float alive = step(0.001, k) * (aPass > 0.5 ? 1.0 : 1.0 - smoothstep(0.45, 0.8, k));
    vA = alive * (1.0 - step(1.0, k) * (1.0 - aPass));
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_PointSize = uSize * (aPass > 0.5 ? 1.8 : 1.0) / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;
const LIB_FS = /* glsl */ `
  uniform vec3 uA;
  uniform vec3 uB;
  uniform vec3 uOut;
  uniform float uFade;
  varying float vA;
  varying float vPass;
  varying float vK;
  void main() {
    vec2 d = gl_PointCoord * 2.0 - 1.0;
    float r = dot(d, d);
    if (r > 1.0) discard;
    vec3 c = vPass > 0.5 ? mix(uA, uB, vK) : mix(uA, uOut, smoothstep(0.2, 0.6, vK));
    gl_FragColor = vec4(c, (1.0 - r) * vA * uFade);
    #include <colorspace_fragment>
  }
`;

/** Thousands of molecules stream out of the AI panel; the few that pass land on the tray. */
export function makeScreening(count = 900) {
  const geo = new THREE.BufferGeometry();
  const attr = (name, size) => geo.setAttribute(name, new THREE.BufferAttribute(new Float32Array(count * size), size));
  ['aStart', 'aEnd', 'aMid'].forEach((n) => attr(n, 3));
  attr('aDelay', 1);
  attr('aPass', 1);
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  const u = { uT: { value: 0 }, uSize: { value: 0.02 * window.innerHeight }, uA: { value: col('xr-dock-lib-1') }, uB: { value: col('xr-dock-lib-2') }, uOut: { value: col('xr-dock-lib-out') }, uFade: { value: 1 } };
  const pts = new THREE.Points(geo, new THREE.ShaderMaterial({ uniforms: u, vertexShader: LIB_VS, fragmentShader: LIB_FS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  pts.frustumCulled = false;
  pts.userData.noFit = true;
  pts.visible = false;
  /** from: the panel center, to: the pocket, tray: the four tray spots (all in the same space). */
  pts.userData.run = (from, to, tray, size) => {
    const s = geo.attributes.aStart.array;
    const e = geo.attributes.aEnd.array;
    const m = geo.attributes.aMid.array;
    const dl = geo.attributes.aDelay.array;
    const ps = geo.attributes.aPass.array;
    for (let i = 0; i < count; i++) {
      const pass = i < tray.length * 6;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * 0.22;
      s.set([from.x + Math.cos(a) * r, from.y + Math.sin(a) * r * 0.8, from.z + (Math.random() - 0.5) * 0.05], i * 3);
      const end = pass ? tray[i % tray.length] : to;
      const spread = pass ? 0.015 : 0.16;
      e.set([end.x + (Math.random() - 0.5) * spread, end.y + (Math.random() - 0.5) * spread + (pass ? 0.04 : 0), end.z + (Math.random() - 0.5) * spread], i * 3);
      m.set([(from.x + end.x) / 2 + (Math.random() - 0.5) * 0.3, Math.max(from.y, end.y) + 0.12 + Math.random() * 0.2, (from.z + end.z) / 2 + 0.1 + (Math.random() - 0.5) * 0.2], i * 3);
      dl[i] = pass ? 0.9 + Math.random() * 0.4 : Math.random() * 1.1;
      ps[i] = pass ? 1 : 0;
    }
    ['aStart', 'aEnd', 'aMid', 'aDelay', 'aPass'].forEach((n) => { geo.attributes[n].needsUpdate = true; });
    u.uSize.value = size;
    u.uT.value = 0;
    u.uFade.value = 1;
    pts.visible = true;
  };
  pts.userData.u = u;
  return pts;
}

// ---------- the lab: microplate wells ----------

/** 8 x 12 wells of liquid on the microplate (plate top center at the origin). */
export function makeWells() {
  const geo = new THREE.CylinderGeometry(0.0034, 0.0034, 0.0016, 12);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
  const wells = new THREE.InstancedMesh(geo, mat, 96);
  const empty = col('xr-dock-well');
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 12; c++) {
      const i = r * 12 + c;
      wells.setMatrixAt(i, _m.makeTranslation((c - 5.5) * 0.009, 0.0004, (r - 3.5) * 0.009));
      wells.setColorAt(i, empty);
    }
  }
  wells.computeBoundingSphere();
  wells.userData.noFit = true;
  const lit = col('xr-dock-well-lit');
  const off = col('xr-dock-well-off');
  /** k: 0..1 how far the run is; value 0..1 the measured binding. */
  wells.userData.show = (k, value) => {
    const tint = value >= 0.7 ? lit : off;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 12; c++) {
        const due = THREE.MathUtils.clamp(k * 14 - c, 0, 1);
        const dose = 1 / (1 + Math.exp(-(c - 5.2) / 1.3));
        const resp = due * (value >= 0.7 ? dose * value : 0.15 + dose * value * 0.6) * (0.9 + 0.1 * Math.sin(r * 1.7 + c));
        wells.setColorAt(r * 12 + c, _c.copy(empty).lerp(tint, THREE.MathUtils.clamp(resp * 1.1, 0, 1)));
      }
    }
    wells.instanceColor.needsUpdate = true;
  };
  wells.userData.reset = () => wells.userData.show(0, 0);
  return wells;
}

// ---------- the bench from Blender ----------

const MAT_TOKENS = {
  DockBench: 'xr-dock-bench', DockInlay: 'xr-dock-bench-inlay', DockTrim: 'xr-dock-trim', DockMetal: 'xr-dock-metal',
  DockScreen: 'xr-dock-screen', DockPlate: 'xr-dock-plate', DockLiquid1: 'xr-dock-liquid-1', DockLiquid2: 'xr-dock-liquid-2',
  DockLiquid3: 'xr-dock-liquid-3', DockNeedle: 'xr-xmas-needle', DockGold: 'xr-xmas-gold',
};
const GLOW_TOKENS = { DockGlow: 'xr-dock-glow', DockGlow2: 'xr-dock-glow-2', DockStarGlow: 'xr-xmas-star' };

/** Loads dock.glb and gives every material its token color. Resolves to the gltf scene's parts. */
export function loadBench() {
  return loadGLTF(DOCK_URL).then((gltf) => {
    const parts = {};
    const mats = new Map();
    // A copy for this scene (the loaded model is cached and shared).
    const scene = gltf.scene.clone(true);
    scene.traverse((o) => {
      if (o.name?.startsWith('Dock') && !parts[o.name]) parts[o.name] = o;
      if (!o.isMesh) return;
      o.material = [].concat(o.material).map((m) => {
        if (mats.has(m.name)) return mats.get(m.name);
        let out = m;
        const vc = !!o.geometry.attributes.color;
        if (GLOW_TOKENS[m.name]) out = new THREE.MeshBasicMaterial({ name: m.name, color: hex(GLOW_TOKENS[m.name]), toneMapped: false });
        else if (m.name === 'DockGlass') out = new THREE.MeshPhysicalMaterial({ name: m.name, color: hex('xr-dock-glass'), roughness: 0.06, metalness: 0, transparent: true, opacity: 0.32, clearcoat: 1, depthWrite: false });
        else if (MAT_TOKENS[m.name]) {
          out = new THREE.MeshStandardMaterial({ name: m.name, color: hex(MAT_TOKENS[m.name]), roughness: m.roughness ?? 0.5, metalness: m.metalness ?? 0, vertexColors: vc });
          if (m.name.startsWith('DockLiquid')) Object.assign(out, { emissive: hex(MAT_TOKENS[m.name]), emissiveIntensity: 0.35, transparent: true, opacity: 0.88 });
          if (m.name === 'DockScreen') Object.assign(out, { roughness: 0.15, metalness: 0.4 });
        }
        mats.set(m.name, out);
        return out;
      });
      if (o.material.length === 1) o.material = o.material[0];
      if (o.material.name === 'DockGlass') o.renderOrder = 3;
    });
    return parts;
  });
}

/** A plain fallback bench slab (until dock.glb is there or if it fails to load). */
export function fallbackDeck(w, d) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.035, d), new THREE.MeshStandardMaterial({ color: hex('xr-dock-bench'), roughness: 0.45 }));
  m.position.y = -0.0175;
  return m;
}

// ---------- canvas panels ----------

const S = (name) => num(name);
function fitColor(f) {
  return color(f >= 0.7 ? 'xr-dock-good' : f >= 0.45 ? 'xr-dock-mid' : 'xr-dock-bad');
}

function text(ctx, c, str, x, y, { size = 'xr-text-sm', weight = 'bold', fill = color('xr-panel-text'), align = 'left', maxW } = {}) {
  ctx.font = font(weight, c.m(typeof size === 'number' ? size : S(size)));
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = fill;
  if (maxW) ctx.fillText(str, c.m(x), c.m(y), c.m(maxW));
  else ctx.fillText(str, c.m(x), c.m(y));
}

function star(ctx, x, y, r, fill) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

function check(ctx, x, y, s, stroke) {
  ctx.beginPath();
  ctx.moveTo(x - s * 0.5, y);
  ctx.lineTo(x - s * 0.12, y + s * 0.38);
  ctx.lineTo(x + s * 0.55, y - s * 0.42);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = s * 0.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function cross(ctx, x, y, s, stroke) {
  ctx.beginPath();
  ctx.moveTo(x - s * 0.4, y - s * 0.4);
  ctx.lineTo(x + s * 0.4, y + s * 0.4);
  ctx.moveTo(x + s * 0.4, y - s * 0.4);
  ctx.lineTo(x - s * 0.4, y + s * 0.4);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = s * 0.2;
  ctx.lineCap = 'round';
  ctx.stroke();
}

function bar(ctx, c, x, y, w, h, k, fill, track = color('xr-dock-ai-track')) {
  roundRect(ctx, c.m(x), c.m(y - h / 2), c.m(w), c.m(h), c.m(h / 2));
  ctx.fillStyle = track;
  ctx.fill();
  if (k <= 0.005) return;
  roundRect(ctx, c.m(x), c.m(y - h / 2), c.m(Math.max(h, w * Math.min(1, k))), c.m(h), c.m(h / 2));
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Sizes of the AI panel (full: XR and desktop; compact: phones held upright). */
export function aiPanelSize(compact) {
  return compact ? { w: 0.74, h: 0.4 } : { w: 0.74, h: 0.68 };
}
export const AI_ROWS = (compact) => (compact ? { y0: 0.105, h: 0.068 } : { y0: 0.21, h: 0.078 });

/**
 * The AI ranking: the screening run (count up), then the four candidates sorted by the AI's
 * predicted fit, with your docking fit and the lab result next to each.
 * st: { level, screenK (0..1 while screening), shown (0..1 bars), active (candidate), compact }
 */
export function drawAIPanel(ctx, c, st) {
  const { w, h } = { w: c.w, h: c.h };
  c.surface({ stroke: color('xr-dock-ai') });
  const L = st.level;
  if (!L) return;
  const pad = 0.03;
  const compact = !!st.compact;
  text(ctx, c, t('dockScreening'), pad, compact ? 0.045 : 0.05, { size: 'xr-text-md', weight: 'black', fill: color('xr-dock-ai') });
  const lib = L.lib.toLocaleString(st.locale);
  const screening = st.screenK < 1;
  const sub = screening ? t('dockScreeningRun', { n: Math.round(L.lib * st.screenK).toLocaleString(st.locale) }) : t('dockScreened', { n: lib, s: st.locale === 'de-DE' ? L.secs.replace('.', ',') : L.secs });
  if (compact) {
    text(ctx, c, sub, w - pad, 0.045, { size: 'xr-text-min', weight: 'regular', fill: color('xr-panel-muted'), align: 'right', maxW: w * 0.5 });
  } else {
    text(ctx, c, sub, pad, 0.1, { size: 'xr-text-min', weight: 'regular', fill: color('xr-panel-muted'), maxW: w - pad * 2 });
    text(ctx, c, t('dockColAI'), 0.1, 0.155, { size: 'xr-text-min', weight: 'bold', fill: color('xr-dock-ai') });
    text(ctx, c, t('dockColYou'), 0.53, 0.155, { size: 'xr-text-min', weight: 'bold', fill: color('xr-dock-you'), align: 'center' });
    text(ctx, c, t('dockColLab'), 0.665, 0.155, { size: 'xr-text-min', weight: 'bold', fill: color('xr-dock-lab'), align: 'center' });
  }
  if (screening) {
    bar(ctx, c, pad, compact ? 0.12 : 0.24, w - pad * 2, 0.018, st.screenK, color('xr-dock-ai'));
    return;
  }
  const rows = [...L.candidates].sort((a, b) => b.ai - a.ai);
  const R = AI_ROWS(compact);
  rows.forEach((cand, i) => {
    const y = R.y0 + R.h * i + R.h / 2;
    const k = THREE.MathUtils.clamp(st.shown * 4 - i, 0, 1);
    if (k <= 0) return;
    ctx.globalAlpha = k * (cand.tested && cand.lab < 70 ? 0.6 : 1);
    if (st.active === cand) {
      roundRect(ctx, c.m(pad * 0.5), c.m(y - R.h / 2 + 0.004), c.m(w - pad), c.m(R.h - 0.008), c.m(0.016));
      ctx.fillStyle = color('xr-dock-row-hi');
      ctx.fill();
    }
    // Letter badge, a star for the AI's top pick.
    const bx = pad + 0.024;
    ctx.beginPath();
    ctx.arc(c.m(bx), c.m(y), c.m(0.024), 0, Math.PI * 2);
    ctx.fillStyle = color('xr-button-bg');
    ctx.fill();
    ctx.lineWidth = c.m(0.003);
    ctx.strokeStyle = color(i === 0 ? 'xr-warning' : 'xr-panel-border');
    ctx.stroke();
    text(ctx, c, cand.letter, bx, y + 0.002, { size: 'xr-text-sm', weight: 'black', align: 'center' });
    if (i === 0) star(ctx, c.m(bx + 0.024), c.m(y - 0.022), c.m(0.012), color('xr-warning'));
    const bx0 = pad + 0.062;
    const bw = compact ? 0.24 : 0.25;
    bar(ctx, c, bx0, y, bw, 0.02, (cand.ai / 100) * k, color('xr-dock-ai'));
    text(ctx, c, `${cand.ai} %`, bx0 + bw + 0.012, y, { size: 'xr-text-sm', weight: 'black', fill: color('xr-dock-ai') });
    // Your docking fit and the lab result.
    const xYou = 0.53;
    const xLab = 0.665;
    const fit = cand.fit;
    text(ctx, c, fit == null ? '–' : `${Math.round(fit * 100)} %`, xYou, y, { size: 'xr-text-min', weight: 'bold', fill: fit == null ? color('xr-panel-muted') : color('xr-dock-you'), align: 'center' });
    if (cand.testing) text(ctx, c, '…', xLab, y, { size: 'xr-text-sm', weight: 'black', fill: color('xr-dock-lab'), align: 'center' });
    else if (cand.tested) {
      const ok = cand.lab >= 70;
      (ok ? check : cross)(ctx, c.m(xLab - 0.035), c.m(y), c.m(0.026), color(ok ? 'xr-dock-good' : 'xr-dock-bad'));
      text(ctx, c, `${cand.lab}`, xLab + 0.012, y, { size: 'xr-text-min', weight: 'black', fill: color(ok ? 'xr-dock-good' : 'xr-dock-bad'), align: 'center' });
    } else text(ctx, c, '–', xLab, y, { size: 'xr-text-min', fill: color('xr-panel-muted'), align: 'center' });
    ctx.globalAlpha = 1;
  });
  if (compact) return;
  // Footer: what the star means and that predictions are probabilities.
  const fy = R.y0 + R.h * 4 + 0.035;
  star(ctx, c.m(pad + 0.012), c.m(fy - 0.002), c.m(0.012), color('xr-warning'));
  text(ctx, c, t('dockAITip'), pad + 0.03, fy, { size: 'xr-text-min', weight: 'bold', fill: color('xr-warning') });
  ctx.font = font('regular', c.m(S('xr-text-min')));
  const lines = wrap(ctx, t('dockAINote'), c.m(w - pad * 2));
  lines.slice(0, 2).forEach((ln, i) => text(ctx, c, ln, pad, fy + 0.045 + i * 0.04, { size: 'xr-text-min', weight: 'regular', fill: color('xr-panel-muted') }));
}

/** Fit meter: a ring gauge with the percent, bars for shape and contacts, and a status line. */
export function fitPanelSize(compact) {
  return compact ? { w: 0.74, h: 0.13 } : { w: 0.54, h: 0.25 };
}

export function drawFitPanel(ctx, c, st) {
  c.surface({ stroke: st.locked ? color('xr-dock-good') : color('xr-panel-border') });
  const f = st.fit ?? 0;
  const fc = fitColor(f);
  const compact = !!st.compact;
  const gx = compact ? 0.075 : 0.11;
  const gy = c.h / 2;
  const gr = compact ? 0.048 : 0.08;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(c.m(gx), c.m(gy), c.m(gr), Math.PI * 0.75, Math.PI * 2.25);
  ctx.strokeStyle = color('xr-dock-ai-track');
  ctx.lineWidth = c.m(compact ? 0.012 : 0.016);
  ctx.stroke();
  if (f > 0.005) {
    ctx.beginPath();
    ctx.arc(c.m(gx), c.m(gy), c.m(gr), Math.PI * 0.75, Math.PI * (0.75 + 1.5 * f));
    ctx.strokeStyle = fc;
    ctx.stroke();
  }
  text(ctx, c, `${Math.round(f * 100)}`, gx, gy - (compact ? 0 : 0.008), { size: compact ? 'xr-text-sm' : 'xr-text-lg', weight: 'black', fill: fc, align: 'center' });
  if (!compact) text(ctx, c, '%', gx, gy + 0.036, { size: 'xr-text-min', weight: 'bold', fill: color('xr-panel-muted'), align: 'center' });
  const x0 = compact ? 0.14 : 0.215;
  const bw = c.w - x0 - 0.03;
  if (compact) {
    text(ctx, c, `${t('dockFit')} ${Math.round(f * 100)} %`, x0, 0.04, { size: 'xr-text-sm', weight: 'black' });
    text(ctx, c, t('dockContacts', { n: st.good ?? 0, total: st.special ?? 0 }), c.w - 0.03, 0.04, { size: 'xr-text-min', weight: 'bold', fill: color('xr-dock-good'), align: 'right' });
    text(ctx, c, st.status ?? '', x0, 0.092, { size: 'xr-text-min', weight: 'bold', fill: st.statusColor ?? color('xr-panel-muted'), maxW: bw });
    return;
  }
  text(ctx, c, t('dockFit'), x0, 0.045, { size: 'xr-text-md', weight: 'black' });
  text(ctx, c, t('dockShape'), x0, 0.09, { size: 'xr-text-min', weight: 'bold', fill: color('xr-panel-muted') });
  bar(ctx, c, x0 + 0.12, 0.09, bw - 0.12, 0.016, st.shape ?? 0, fitColor(st.shape ?? 0));
  text(ctx, c, t('dockContacts', { n: st.good ?? 0, total: st.special ?? 0 }), x0, 0.135, { size: 'xr-text-min', weight: 'bold', fill: color('xr-panel-muted') });
  const dots = st.special ?? 0;
  for (let i = 0; i < dots; i++) {
    const x = c.w - 0.04 - (dots - 1 - i) * 0.035;
    ctx.beginPath();
    ctx.arc(c.m(x), c.m(0.135), c.m(0.012), 0, Math.PI * 2);
    ctx.fillStyle = i < (st.good ?? 0) ? color('xr-dock-good') : i < (st.good ?? 0) + (st.bad ?? 0) ? color('xr-dock-bad') : color('xr-dock-ai-track');
    ctx.fill();
  }
  ctx.font = font('bold', c.m(S('xr-text-min')));
  const lines = wrap(ctx, st.status ?? '', c.m(c.w - x0 - 0.03));
  lines.slice(0, 2).forEach((ln, i) => text(ctx, c, ln, x0, 0.185 + i * 0.038, { size: 'xr-text-min', weight: 'bold', fill: st.statusColor ?? color('xr-panel-muted') }));
}

/** Lab result: the dose-response curve as it is measured, the value, the AI's prediction, the verdict. */
export function labPanelSize() {
  return { w: 0.7, h: 0.37 };
}

export function drawLabPanel(ctx, c, st) {
  const cand = st.cand;
  if (!cand) {
    // Waiting: what the lab is for.
    c.surface({ stroke: color('xr-panel-border') });
    text(ctx, c, t('dockColLab'), 0.03, 0.05, { size: 'xr-text-md', weight: 'black', fill: color('xr-dock-lab') });
    ctx.font = font('regular', c.m(S('xr-text-sm')));
    wrap(ctx, t('dockLabIdle'), c.m(c.w - 0.06)).slice(0, 5).forEach((ln, i) => text(ctx, c, ln, 0.03, 0.11 + i * 0.045, { size: 'xr-text-sm', weight: 'regular', fill: color('xr-panel-muted') }));
    return;
  }
  const done = st.k >= 1;
  const ok = cand.lab >= 70;
  c.surface({ stroke: done ? color(ok ? 'xr-dock-good' : 'xr-dock-bad') : color('xr-dock-lab') });
  const pad = 0.03;
  text(ctx, c, t('dockLabTitle', { c: cand.letter }), pad, 0.045, { size: 'xr-text-sm', weight: 'black', fill: color('xr-dock-lab') });
  // Curve: binding over the dose (log scale), with the AI's prediction as a dashed line.
  const x0 = pad + 0.01;
  const y0 = 0.075;
  const cw = 0.28;
  const ch = 0.14;
  ctx.strokeStyle = color('xr-panel-border');
  ctx.lineWidth = c.m(0.002);
  ctx.beginPath();
  ctx.moveTo(c.m(x0), c.m(y0));
  ctx.lineTo(c.m(x0), c.m(y0 + ch));
  ctx.lineTo(c.m(x0 + cw), c.m(y0 + ch));
  ctx.stroke();
  ctx.setLineDash([c.m(0.008), c.m(0.006)]);
  ctx.strokeStyle = color('xr-dock-ai');
  ctx.beginPath();
  const yAI = y0 + ch * (1 - cand.ai / 100);
  ctx.moveTo(c.m(x0), c.m(yAI));
  ctx.lineTo(c.m(x0 + cw), c.m(yAI));
  ctx.stroke();
  ctx.setLineDash([]);
  text(ctx, c, 'KI', x0 + cw - 0.005, yAI - 0.016, { size: 'xr-text-min', weight: 'black', fill: color('xr-dock-ai'), align: 'right' });
  const val = cand.lab / 100;
  ctx.beginPath();
  const steps = 40;
  const upto = Math.max(1, Math.round(steps * Math.min(1, st.k)));
  for (let i = 0; i <= upto; i++) {
    const u = i / steps;
    const resp = val / (1 + Math.exp(-(u - 0.45) / 0.09));
    const x = x0 + u * cw;
    const y = y0 + ch * (1 - resp);
    if (i === 0) ctx.moveTo(c.m(x), c.m(y));
    else ctx.lineTo(c.m(x), c.m(y));
  }
  ctx.strokeStyle = done ? color(ok ? 'xr-dock-good' : 'xr-dock-bad') : color('xr-dock-lab');
  ctx.lineWidth = c.m(0.006);
  ctx.lineCap = 'round';
  ctx.stroke();
  // Values on the right.
  const rx = x0 + cw + 0.035;
  const shownLab = Math.round(cand.lab * Math.min(1, st.k));
  text(ctx, c, done ? t('dockLabValue', { n: cand.lab }) : t('dockLabRun'), rx, 0.105, { size: done ? 'xr-text-md' : 'xr-text-min', weight: 'black', fill: done ? color(ok ? 'xr-dock-good' : 'xr-dock-bad') : color('xr-dock-lab'), maxW: c.w - rx - pad });
  if (!done) text(ctx, c, `${shownLab} %`, rx, 0.15, { size: 'xr-text-md', weight: 'black', fill: color('xr-dock-lab') });
  else text(ctx, c, t('dockLabAI', { n: cand.ai }), rx, 0.15, { size: 'xr-text-min', weight: 'bold', fill: color('xr-dock-ai'), maxW: c.w - rx - pad });
  if (done && cand.fit != null) text(ctx, c, t('dockLabYou', { n: Math.round(cand.fit * 100) }), rx, 0.19, { size: 'xr-text-min', weight: 'bold', fill: color('xr-dock-you'), maxW: c.w - rx - pad });
  if (!done) return;
  const verdict = ok ? t('dockLabStrong') : cand.lab >= 34 ? t('dockLabWeak') : t('dockLabNone');
  text(ctx, c, verdict, pad, 0.255, { size: 'xr-text-sm', weight: 'black', fill: color(ok ? 'xr-dock-good' : 'xr-dock-bad'), maxW: c.w - pad * 2 });
  ctx.font = font('regular', c.m(S('xr-text-min')));
  const lines = wrap(ctx, t(cand.why), c.m(c.w - pad * 2));
  lines.slice(0, 2).forEach((ln, i) => text(ctx, c, ln, pad, 0.298 + i * 0.038, { size: 'xr-text-min', weight: 'regular', fill: color('xr-panel-muted') }));
}

/** Legend of the contact spots: patch color, the atom it likes, and the rule. */
export function legendSize(compact) {
  return compact ? { w: 0.74, h: 0.075 } : { w: 0.74, h: 0.205 };
}

export function drawLegend(ctx, c, st) {
  c.surface({});
  const pad = 0.03;
  const rows = [['neg', 'N', 'dockLegendNeg'], ['pos', 'O', 'dockLegendPos'], ['hydro', 'C', 'dockLegendHydro']];
  const pair = (x, y, spot, el, r) => {
    ctx.beginPath();
    ctx.arc(c.m(x), c.m(y), c.m(r * 1.15), 0, Math.PI * 2);
    ctx.fillStyle = color(SPOTS[spot].token);
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color('xr-panel-muted');
    ctx.lineWidth = c.m(0.003);
    ctx.beginPath();
    ctx.moveTo(c.m(x + r * 1.5), c.m(y));
    ctx.lineTo(c.m(x + r * 2.6), c.m(y));
    ctx.stroke();
    const g = ctx.createRadialGradient(c.m(x + r * 3.6), c.m(y - r * 0.35), c.m(r * 0.1), c.m(x + r * 3.9), c.m(y), c.m(r));
    g.addColorStop(0, color('xr-panel-text'));
    g.addColorStop(0.35, color(ELEMENTS[el].token));
    g.addColorStop(1, color(ELEMENTS[el].token));
    ctx.beginPath();
    ctx.arc(c.m(x + r * 3.9), c.m(y), c.m(r), 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
  };
  if (st.compact) {
    text(ctx, c, t('dockLegendShort'), pad, c.h / 2, { size: 'xr-text-min', weight: 'bold', fill: color('xr-panel-muted'), maxW: 0.42 });
    rows.forEach(([spot, el], i) => pair(0.475 + i * 0.09, c.h / 2, spot, el, 0.011));
    return;
  }
  text(ctx, c, t('dockLegend'), pad, 0.04, { size: 'xr-text-min', weight: 'black', fill: color('xr-panel-text'), maxW: c.w - pad * 2 });
  rows.forEach(([spot, el, key], i) => {
    const y = 0.085 + i * 0.042;
    pair(pad + 0.014, y, spot, el, 0.012);
    text(ctx, c, t(key), pad + 0.085, y, { size: 'xr-text-min', weight: 'bold', maxW: c.w - pad * 2 - 0.085 });
  });
}
