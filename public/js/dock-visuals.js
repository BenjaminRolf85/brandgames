// "Andock-Labor" (Docking Lab): everything that draws. Ball-and-stick molecules (instanced
// atoms, two-colored half bonds, aromatic rings, glow shells for the contact feedback), the
// protein's material (pearly surface with a fresnel rim and a build-in scan), contact spot markers,
// the screening stream, the microplate of the lab test, the lab bench from Blender (dock.glb) and
// the canvas panels (AI ranking, fit meter, lab result, legend). All colors from tokens.
import * as THREE from 'three';
import { color, hex, num, font } from './tokens.js';
import { t } from './i18n.js';
import { roundRect, wrap, Panel } from './ui3d.js';
import { loadGLTF } from './models.js';
import { radialTexture } from './robot-visuals.js';
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';
import { ELEMENTS, SPOTS, B, DESIGN_ATOMS } from './dock-chem.js';

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
    // White base materials: the per-atom and per-bond colors come from the tokens (instance colors).
    atomMat: new THREE.MeshPhysicalMaterial({ roughness: 0.26, metalness: 0.02, clearcoat: 1, clearcoatRoughness: 0.12 }),
    bondMat: new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.15 }),
    ringMat: new THREE.MeshStandardMaterial({ color: hex('xr-dock-bond'), roughness: 0.3, metalness: 0.3, emissive: hex('xr-dock-bond'), emissiveIntensity: 0.15 }),
    // Glow shows through the protein: a clashing atom sits inside the wall.
    glowMat: new THREE.ShaderMaterial({ uniforms: { uBoost: { value: 1 } }, vertexShader: GLOW_VS, fragmentShader: GLOW_FS, ...additive, depthTest: false }),
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
    const light = col('xr-dock-bond');
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
          this.bonds.setColorAt(k, _c.setHex(hex(ELEMENTS[el].token)).lerp(light, 0.42));
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
      this.glow.setMatrixAt(i, _m.compose(a.p, _q.identity(), _s.setScalar(ELEMENTS[a.el].r * (ghost ? 1.05 : 1.4))));
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
    vertexColors: true, roughness: 0.5, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.4,
    sheen: 0.25, sheenRoughness: 0.55, sheenColor: col('xr-dock-protein-sheen'), envMapIntensity: 0.55,
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
  const mat = new THREE.MeshBasicMaterial({ toneMapped: false });
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
        else if (m.name === 'DockBench' || m.name === 'DockScreen' || m.name === 'DockPlate') {
          // Lab surfaces: a clear lacquer that catches the studio light.
          out = new THREE.MeshPhysicalMaterial({
            name: m.name, color: hex(MAT_TOKENS[m.name]), roughness: m.name === 'DockScreen' ? 0.12 : 0.38, metalness: m.name === 'DockScreen' ? 0.3 : 0,
            clearcoat: m.name === 'DockPlate' ? 0.3 : 0.75, clearcoatRoughness: 0.18, vertexColors: vc,
          });
        } else if (MAT_TOKENS[m.name]) {
          out = new THREE.MeshStandardMaterial({ name: m.name, color: hex(MAT_TOKENS[m.name]), roughness: m.roughness ?? 0.5, metalness: m.metalness ?? 0, vertexColors: vc });
          if (m.name.startsWith('DockLiquid') || m.name === 'DockNeedle') {
            out.emissive.setHex(hex(MAT_TOKENS[m.name]));
            Object.assign(out, { emissiveIntensity: 0.3, roughness: 0.15, transparent: true, opacity: 0.9 });
          }
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
  const secs = st.locale === 'de-DE' ? L.secs.replace('.', ',') : L.secs;
  const sub = screening ? t('dockScreeningRun', { n: Math.round(L.lib * st.screenK).toLocaleString(st.locale) }) : t(compact ? 'dockScreenedShort' : 'dockScreened', { n: lib, s: secs });
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
    const top = cand === L.top;
    ctx.strokeStyle = color(top ? 'xr-warning' : cand.kind === 'scaffold' ? 'xr-dock-you' : 'xr-panel-border');
    ctx.stroke();
    text(ctx, c, cand.letter, bx, y + 0.002, { size: 'xr-text-sm', weight: 'black', align: 'center' });
    if (top) star(ctx, c.m(bx + 0.024), c.m(y - 0.022), c.m(0.012), color('xr-warning'));
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
  if (L.top) {
    star(ctx, c.m(pad + 0.012), c.m(fy - 0.002), c.m(0.012), color('xr-warning'));
    text(ctx, c, t('dockAITip'), pad + 0.03, fy, { size: 'xr-text-min', weight: 'bold', fill: color('xr-warning') });
  } else text(ctx, c, t('dockWorkshop'), pad, fy, { size: 'xr-text-min', weight: 'bold', fill: color('xr-dock-you') });
  ctx.font = font('regular', c.m(S('xr-text-min')));
  const lines = wrap(ctx, t(L.design ? 'dockDesignNote' : 'dockAINote'), c.m(w - pad * 2));
  lines.slice(0, 2).forEach((ln, i) => text(ctx, c, ln, pad, fy + 0.045 + i * 0.04, { size: 'xr-text-min', weight: 'regular', fill: color('xr-panel-muted') }));
}

/** Fit meter: a ring gauge with the percent, bars for shape and contacts, and a status line. */
export function fitPanelSize(compact, narrow = false) {
  return compact ? { w: narrow ? 0.6 : 0.74, h: 0.13 } : { w: 0.6, h: 0.25 };
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
  const dots = (y) => {
    const n = st.special ?? 0;
    for (let i = 0; i < n; i++) {
      const x = c.w - 0.04 - (n - 1 - i) * 0.035;
      ctx.beginPath();
      ctx.arc(c.m(x), c.m(y), c.m(0.012), 0, Math.PI * 2);
      ctx.fillStyle = i < (st.good ?? 0) ? color('xr-dock-good') : i < (st.good ?? 0) + (st.bad ?? 0) ? color('xr-dock-bad') : color('xr-dock-ai-track');
      ctx.fill();
    }
  };
  if (compact) {
    // One line: fit and the contact spots as dots; below it the status.
    text(ctx, c, `${t('dockFit')} ${Math.round(f * 100)} %`, x0, 0.04, { size: 'xr-text-sm', weight: 'black', maxW: c.w - x0 - 0.16 });
    dots(0.04);
    text(ctx, c, st.status ?? '', x0, 0.092, { size: 'xr-text-min', weight: 'bold', fill: st.statusColor ?? color('xr-panel-muted'), maxW: bw });
    return;
  }
  text(ctx, c, t('dockFit'), x0, 0.045, { size: 'xr-text-md', weight: 'black' });
  text(ctx, c, t('dockShape'), x0, 0.09, { size: 'xr-text-min', weight: 'bold', fill: color('xr-panel-muted') });
  bar(ctx, c, x0 + 0.12, 0.09, bw - 0.12, 0.016, st.shape ?? 0, fitColor(st.shape ?? 0));
  text(ctx, c, t('dockContacts', { n: st.good ?? 0, total: st.special ?? 0 }), x0, 0.135, { size: 'xr-text-min', weight: 'bold', fill: color('xr-panel-muted') });
  dots(0.135);
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
  if (!cand && st.build) {
    // Pockets 3 and 4: the molecule workshop with the AI's live estimate for your design.
    c.surface({ stroke: color('xr-dock-you') });
    text(ctx, c, t('dockWorkshop'), 0.03, 0.05, { size: 'xr-text-md', weight: 'black', fill: color('xr-dock-you') });
    text(ctx, c, t('dockEstimate', { n: st.build.est }), 0.03, 0.115, { size: 'xr-text-lg', weight: 'black', fill: color('xr-dock-ai') });
    ctx.font = font('regular', c.m(S('xr-text-min')));
    wrap(ctx, st.build.hint, c.m(c.w - 0.06)).slice(0, 5).forEach((ln, i) => text(ctx, c, ln, 0.03, 0.175 + i * 0.04, { size: 'xr-text-min', weight: 'regular', fill: color('xr-panel-muted') }));
    return;
  }
  if (!cand) {
    // Waiting: what the lab is for.
    c.surface({ stroke: color('xr-panel-border') });
    text(ctx, c, t('dockColLab'), 0.03, 0.05, { size: 'xr-text-md', weight: 'black', fill: color('xr-dock-lab') });
    ctx.font = font('regular', c.m(S('xr-text-sm')));
    wrap(ctx, t('dockLabIdle'), c.m(c.w - 0.06)).slice(0, 5).forEach((ln, i) => text(ctx, c, ln, 0.03, 0.11 + i * 0.045, { size: 'xr-text-sm', weight: 'regular', fill: color('xr-panel-muted') }));
    return;
  }
  const done = !!cand.tested; // the result is in (the curve can be complete a moment earlier)
  const value = done ? cand.lab : cand.truth;
  const ok = done && value >= 70;
  c.surface({ stroke: done ? color(ok ? 'xr-dock-good' : 'xr-dock-bad') : color('xr-dock-lab') });
  const pad = 0.03;
  text(ctx, c, cand.kind === 'scaffold' ? t('dockLabTitleOwn') : t('dockLabTitle', { c: cand.letter }), pad, 0.045, { size: 'xr-text-sm', weight: 'black', fill: color('xr-dock-lab') });
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
  text(ctx, c, t('dockChartAI'), x0 + cw - 0.005, yAI - 0.016, { size: 'xr-text-min', weight: 'black', fill: color('xr-dock-ai'), align: 'right' });
  const val = value / 100;
  const k = done ? 1 : Math.min(1, st.k);
  ctx.beginPath();
  const steps = 40;
  const upto = Math.max(1, Math.round(steps * k));
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
  const shown = Math.round(value * k);
  text(ctx, c, done ? t('dockLabValue', { n: value }) : t('dockLabRun'), rx, 0.105, { size: done ? 'xr-text-md' : 'xr-text-min', weight: 'black', fill: done ? color(ok ? 'xr-dock-good' : 'xr-dock-bad') : color('xr-dock-lab'), maxW: c.w - rx - pad });
  if (!done) text(ctx, c, `${shown} %`, rx, 0.15, { size: 'xr-text-md', weight: 'black', fill: color('xr-dock-lab') });
  else text(ctx, c, t('dockLabAI', { n: cand.ai }), rx, 0.15, { size: 'xr-text-min', weight: 'bold', fill: color('xr-dock-ai'), maxW: c.w - rx - pad });
  if (done && cand.fit != null) text(ctx, c, t('dockLabYou', { n: Math.round(cand.fit * 100) }), rx, 0.19, { size: 'xr-text-min', weight: 'bold', fill: color('xr-dock-you'), maxW: c.w - rx - pad });
  if (!done) return;
  const verdict = ok ? t('dockLabStrong') : value >= 34 ? t('dockLabWeak') : t('dockLabNone');
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

// ---------- the molecule workshop (pockets 3 and 4) ----------

/**
 * Markers on the attachment points of a scaffold (molecule frame): a glowing ring, a short stub
 * from the atom it hangs on, and an invisible sphere to point at. tick(time, sel, choices, faceQ)
 * turns the rings to the viewer (faceQ: the camera's rotation in the molecule frame).
 */
export function makePointMarkers(kit, points, c0) {
  const g = new THREE.Group();
  g.userData.noFit = true;
  const ringGeo = new THREE.TorusGeometry(0.018, 0.0028, 8, 36);
  const stubMat = new THREE.MeshBasicMaterial({ color: hex('xr-dock-glow'), transparent: true, opacity: 0.55, toneMapped: false });
  const glow = new THREE.Color(hex('xr-dock-glow'));
  const sel = new THREE.Color(hex('xr-warning'));
  const items = points.map((pt, k) => {
    const pos = pt.p.clone().sub(c0);
    const from = pt.from.clone().sub(c0);
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: glow, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false }));
    ring.position.copy(pos);
    ring.renderOrder = 4;
    const d = pos.clone().sub(from);
    const stub = new THREE.Mesh(kit.cyl, stubMat);
    stub.position.copy(from);
    stub.quaternion.setFromUnitVectors(UP, d.clone().normalize());
    stub.scale.set(0.0026, d.length() * 0.6, 0.0026);
    const hit = new THREE.Mesh(kit.proxy, kit.hidden);
    hit.scale.setScalar(0.024);
    hit.position.copy(pos);
    hit.userData.interactive = true;
    g.add(ring, stub, hit);
    return { k, ring, stub, hit, pos };
  });
  g.userData.items = items;
  g.userData.tick = (time, selected, choices, faceQ) => {
    for (const it of items) {
      const filled = !!choices[it.k];
      const on = it.k === selected;
      it.ring.visible = !filled || on;
      it.stub.visible = !filled;
      it.ring.quaternion.copy(faceQ);
      it.ring.scale.setScalar(on ? 1.35 + 0.12 * Math.sin(time * 8) : 1 + 0.1 * Math.sin(time * 3 + it.k));
      it.ring.material.color.copy(on ? sel : glow);
      it.ring.material.opacity = on ? 1 : 0.75;
    }
  };
  return g;
}

/** A round tile for the atom menu: the element in its color (null: remove, a red cross). */
export function atomTile(el, size = 0.072) {
  let hover = false;
  const p = new Panel(size, size, (ctx, c) => {
    const W = c.canvas.width;
    const r = W / 2 - c.m(0.004);
    ctx.beginPath();
    ctx.arc(W / 2, W / 2, r, 0, Math.PI * 2);
    ctx.fillStyle = el ? color(ELEMENTS[el].token) : color('xr-button-bg');
    ctx.fill();
    ctx.lineWidth = c.m(hover ? 0.006 : 0.003);
    ctx.strokeStyle = color(hover ? 'xr-warning' : 'xr-panel-border');
    ctx.stroke();
    if (el) {
      ctx.font = font('black', c.m(size * 0.52));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = c.m(0.006);
      ctx.strokeStyle = color('xr-bg-preview');
      ctx.strokeText(el, W / 2, W / 2 + c.m(0.002));
      ctx.fillStyle = color('xr-panel-text');
      ctx.fillText(el, W / 2, W / 2 + c.m(0.002));
    } else cross(ctx, W / 2, W / 2, c.m(size * 0.42), color('xr-dock-bad'));
  });
  p.userData.interactive = true;
  p.userData.noFit = true;
  p.userData.setHover = (v) => { hover = v; p.scale.setScalar(v ? 1.12 : 1); p.redraw(); };
  p.renderOrder = 6;
  p.material.depthTest = false;
  return p;
}

/** The headset's parts dish: one ball per element to grab and plug onto the scaffold. */
export function makePartsDish(kit) {
  const g = new THREE.Group();
  g.userData.noFit = true;
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.12, 0.012, 48), new THREE.MeshStandardMaterial({ color: hex('xr-dock-trim'), roughness: 0.4, metalness: 0.3 }));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.131, 0.003, 8, 64), new THREE.MeshBasicMaterial({ color: hex('xr-dock-you'), toneMapped: false }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.006;
  g.add(dish, ring);
  const balls = DESIGN_ATOMS.map((el, i) => {
    const mesh = new THREE.Mesh(kit.sphere, new THREE.MeshPhysicalMaterial({ color: hex(ELEMENTS[el].token), roughness: 0.25, clearcoat: 1 }));
    const r = ELEMENTS[el].r * 1.35;
    mesh.scale.setScalar(r);
    const home = new THREE.Vector3((i - 2) * 0.05, 0.006 + r, -0.012);
    mesh.position.copy(home);
    const label = new Panel(0.045, 0.036, (ctx, c) => {
      ctx.font = font('black', c.m(0.034));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color('xr-panel-text');
      ctx.fillText(el, c.canvas.width / 2, c.canvas.height / 2);
    });
    label.rotation.x = -Math.PI / 2;
    label.position.set(home.x, 0.0075, 0.055); // lying on the dish, in front of its atom
    g.add(mesh, label);
    return { el, mesh, home, label };
  });
  g.userData.balls = balls;
  return g;
}

// ---------- graphics: fewer draw calls, grounding, backdrop ----------

/**
 * Merges the bench's static parts by material (one draw call per material instead of one per
 * part). keep: names of parts that stay separate (scaled, toggled or recolored at runtime).
 * Returns the merged meshes (bench-local, children of root).
 */
export function mergeStatic(root, keep) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const byMat = new Map();
  const kept = new Set();
  for (const name of keep) root.getObjectByName(name)?.traverse((o) => kept.add(o));
  const victims = [];
  root.traverse((o) => {
    if (!o.isMesh || kept.has(o) || o.isInstancedMesh) return;
    const g = o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const list = byMat.get(o.material) ?? [];
    list.push(g.index ? g.toNonIndexed() : g);
    byMat.set(o.material, list);
    victims.push(o);
  });
  victims.forEach((o) => o.removeFromParent());
  const out = [];
  for (const [mat, list] of byMat) {
    const merged = mergeGeometries(list, false);
    list.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = `DockMerged${mat.name}`;
    if (mat.name === 'DockGlass') mesh.renderOrder = 3;
    if (mat.isMeshBasicMaterial || mat.transparent) mesh.userData.noShadow = true;
    root.add(mesh);
    out.push(mesh);
  }
  return out;
}

/** Soft contact shadows under several props in one draw call. spots: [[x, z, w, d, opacity]]. */
export function contactShadows(spots) {
  const geos = spots.map(([x, z, w, d, o]) => {
    const g = new THREE.PlaneGeometry(w, d);
    g.rotateX(-Math.PI / 2);
    g.translate(x, 0.0015, z);
    const n = g.attributes.position.count;
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(o), 3));
    return g;
  });
  const geo = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  // The opacity per blob rides in the vertex color (a grey level that scales the texture alpha).
  const mat = new THREE.MeshBasicMaterial({ color: hex('xr-dock-shadow'), alphaMap: shadowAlpha(), transparent: true, depthWrite: false, toneMapped: false });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 color;\nvarying float vShade;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvShade = color.r;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vShade;').replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\ndiffuseColor.a *= vShade;');
  };
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = -1;
  m.userData.noFit = true;
  m.userData.noShadow = true;
  return m;
}

let alphaTex = null;
function shadowAlpha() {
  if (alphaTex) return alphaTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgb(255,255,255)');
  g.addColorStop(0.45, 'rgb(150,150,150)');
  g.addColorStop(1, 'rgb(0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  alphaTex = new THREE.CanvasTexture(c);
  return alphaTex;
}

/** A backdrop gradient around the lab (VR and the browser view; never in AR passthrough). */
export function skyDome(radius = 9) {
  const geo = new THREE.SphereGeometry(radius, 32, 16);
  const top = col('xr-dock-sky-top');
  const mid = col('xr-dock-sky-mid');
  const bottom = col('xr-dock-sky-bottom');
  const pos = geo.attributes.position;
  const c = new THREE.Color();
  const cols = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / radius;
    const front = Math.max(0, -pos.getZ(i) / radius); // the haze glows behind the protein
    if (y > 0) c.copy(mid).lerp(top, Math.min(1, y * 1.6));
    else c.copy(mid).lerp(bottom, Math.min(1, -y * 2.4));
    c.lerp(mid, front * front * 0.35 * (1 - Math.abs(y)));
    cols.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false }));
  m.renderOrder = -10;
  m.userData.noFit = true;
  m.userData.noShadow = true;
  m.frustumCulled = false;
  return m;
}
