// "Stein auf Stein": a house built from decisions. Every decision (walls, roof, windows, front
// door, heating, one extra, the garden) adds its part to the plot with a little build animation:
// bricks pop in course by course, concrete walls come down as slabs, a timber frame grows beam by
// beam, the roof can hang on the crane (the scene lowers it). The parts come from the Blender
// model where it has them (window, door, tiled roof, the plot's garden) and from simple geometry
// in the same style for everything else. Used for the player's house and for the neighbors'.
// House-local meters as in bricks-plan.js; "site" parts (garden, carport) are plot-local.
import * as THREE from 'three';
import { hex } from './tokens.js';
import { plainPlot } from './bricks-visuals.js';
import { radialTexture } from './robot-visuals.js';
import { L, H, D, GAP, TOP, XH, ZH, OX, OZ, RIDGE, EAVE, FOUND, HOUSE_Z, WALLS, CORNERS, brickPieces, wallBoxes, openings } from './bricks-plan.js';

/** The model's materials use vertex colors (baked shading): plain geometry gets white ones. */
function white(geo) {
  if (!geo.attributes.color) geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(1), 3));
  return geo;
}
const UNIT = white(new THREE.BoxGeometry(1, 1, 1));
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _ident = new THREE.Matrix4();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const ease = (k) => k * k * (3 - 2 * k);
const back = (k) => 1 + 2.4 * (k - 1) ** 3 + 1.4 * (k - 1) ** 2;
const clamp01 = (k) => Math.max(0, Math.min(1, k));
const rnd = (a, b) => a + Math.random() * (b - a);

const RX = OX + 0.03; // gable overhang
const EZ = OZ + EAVE;
const EY = -(EAVE * RIDGE) / OZ;
const FENCE_Z = 0.365; // plot-local: the front edge of the garden
const FENCE_RUNS = [[-0.47, -0.05], [0.05, 0.3]]; // with a gap for the gate
// Plot parts by material: the building site, and what a finished garden shows.
const SITE_ONLY = ['Sand', 'Wood', 'Metal'];
const GARDEN_BASE = ['WoodDark', 'Mailbox', 'Dark'];
const GREEN = ['Bark', 'LeafDark', 'Leaf', 'Berry'];
const GARDEN_ALL = ['Fence', 'LampGlow', ...GARDEN_BASE, ...GREEN];
const TOGGLED = new Set([...GARDEN_ALL, ...SITE_ONLY]); // plot parts that the garden shows or hides

/**
 * Many boxes (or bricks) of one material as one instanced mesh, each with its own little
 * animation: 'pop' (grows in with a bounce), 'drop' (comes down from above), 'grow' (rises from
 * its base). item: { x, y, z, sx, sy, sz, yaw, rx, rz, tint, delay, how }.
 */
class Bits {
  constructor(parent, geo, mat, items, cast) {
    this.items = items;
    this.mesh = new THREE.InstancedMesh(geo, mat, items.length);
    this.mesh.castShadow = cast;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    items.forEach((it, i) => {
      this.mesh.setMatrixAt(i, ZERO);
      const k = it.tint ?? 1;
      const warm = it.warm ?? 0;
      this.mesh.setColorAt(i, _c.setRGB(k * (1 + warm), k, k * (1 - warm)));
      it.t = -(it.delay ?? 0);
      it.done = false;
    });
    this.mesh.instanceColor.needsUpdate = true;
    this.active = true;
    parent.add(this.mesh);
  }

  place(i, it, k) {
    const how = it.how ?? 'pop';
    const sx = it.sx ?? 1;
    const sy = it.sy ?? 1;
    const sz = it.sz ?? 1;
    let y = it.y;
    let f = 1;
    let fy = 1;
    if (k < 1) {
      if (how === 'pop') { f = Math.max(0.01, 0.5 + 0.5 * back(k)); y += (1 - k) * 0.02; }
      else if (how === 'drop') y += (1 - ease(k)) * 0.28;
      else { fy = Math.max(0.01, ease(k)); y += (sy * (fy - 1)) / 2; }
    }
    _q.setFromEuler(_e.set(it.rx ?? 0, it.yaw ?? 0, it.rz ?? 0, 'YXZ'));
    this.mesh.setMatrixAt(i, _m.compose(_p.set(it.x, y, it.z), _q, _s.set(sx * f, sy * f * fy, sz * f)));
  }

  /** Every piece as [geometry, matrix, tint] where it stands (for merging). */
  pieces() {
    return this.items.map((it, i) => {
      this.place(i, it, 1);
      const m = new THREE.Matrix4();
      this.mesh.getMatrixAt(i, m);
      const k = it.tint ?? 1;
      const warm = it.warm ?? 0;
      return [this.mesh.geometry, m, new THREE.Color(k * (1 + warm), k, k * (1 - warm))];
    });
  }

  /** dur: seconds one piece takes; with dt = Infinity everything is in place at once. */
  update(dt, dur = 0.22) {
    if (!this.active) return false;
    let busy = false;
    this.items.forEach((it, i) => {
      if (it.done) return;
      it.t += dt;
      if (it.t < 0) { busy = true; return; }
      const k = clamp01(it.t / ((it.dur ?? dur) || 1e-6));
      this.place(i, it, k);
      if (k >= 1) it.done = true; else busy = true;
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.active = busy;
    return busy;
  }
}

const flatCache = new WeakMap();
/** A geometry as plain float arrays (non-indexed position, normal, color), cached per geometry. */
function flat(geo) {
  let f = flatCache.get(geo);
  if (f) return f;
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (!g.attributes.normal) g.computeVertexNormals();
  white(g);
  f = {};
  for (const name of ['position', 'normal', 'color']) {
    const src = g.attributes[name];
    const arr = new Float32Array(src.count * 3);
    for (let i = 0; i < src.count; i++) { arr[i * 3] = src.getX(i); arr[i * 3 + 1] = src.getY(i); arr[i * 3 + 2] = src.getZ(i); }
    f[name] = arr;
  }
  f.count = g.attributes.position.count;
  g.dispose();
  flatCache.set(geo, f);
  return f;
}
const _n = new THREE.Matrix3();
const _v = new THREE.Vector3();
/** Writes a geometry, moved by `matrix` and tinted, into the arrays of `out` at vertex `at`. */
function writeInto(out, at, geo, matrix, tint = null, ready = null) {
  const f = ready ?? flat(geo);
  _n.getNormalMatrix(matrix);
  for (let i = 0; i < f.count; i++) {
    const k = i * 3;
    const o = (at + i) * 3;
    _v.set(f.position[k], f.position[k + 1], f.position[k + 2]).applyMatrix4(matrix);
    out.position[o] = _v.x; out.position[o + 1] = _v.y; out.position[o + 2] = _v.z;
    _v.set(f.normal[k], f.normal[k + 1], f.normal[k + 2]).applyMatrix3(_n).normalize();
    out.normal[o] = _v.x; out.normal[o + 1] = _v.y; out.normal[o + 2] = _v.z;
    out.color[o] = f.color[k] * (tint ? tint.r : 1); out.color[o + 1] = f.color[k + 1] * (tint ? tint.g : 1); out.color[o + 2] = f.color[k + 2] * (tint ? tint.b : 1);
  }
  return at + f.count;
}
const chamferCache = new Map();
const _sc = new THREE.Vector3();
const _ps = new THREE.Vector3();
const _qt = new THREE.Quaternion();
/**
 * A box with bevelled edges as plain arrays (cached by size): six faces, twelve edge strips,
 * eight corners. The bevel is the same on every box (2.5 mm, less on thin ones), so merged
 * parts catch the light on their edges instead of looking like raw boxes.
 */
function chamferBox(sx, sy, sz) {
  const key = `${Math.round(sx * 4000)}|${Math.round(sy * 4000)}|${Math.round(sz * 4000)}`;
  let f = chamferCache.get(key);
  if (f) return f;
  const h = [sx / 2, sy / 2, sz / 2];
  const c = Math.min(0.0025, 0.28 * Math.min(sx, sy, sz));
  const pos = [];
  const nor = [];
  const tri = (a, b, d, n) => {
    // wound so that it faces along n
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    const flip = (uy * vz - uz * vy) * n[0] + (uz * vx - ux * vz) * n[1] + (ux * vy - uy * vx) * n[2] < 0;
    for (const p of flip ? [a, d, b] : [a, b, d]) { pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]); }
  };
  const quad = (a, b, d, e, n) => { tri(a, b, d, n); tri(a, d, e, n); };
  const pt = (ax, v) => { const p = [0, 0, 0]; for (let i = 0; i < 3; i++) p[ax[i]] = v[i]; return p; };
  const k = Math.SQRT1_2;
  const k3 = 1 / Math.sqrt(3);
  for (let a = 0; a < 3; a++) {
    const b = (a + 1) % 3;
    const d = (a + 2) % 3;
    const ax = [a, b, d];
    for (const sa of [-1, 1]) {
      // the face
      const n = pt(ax, [sa, 0, 0]);
      quad(pt(ax, [sa * h[a], -(h[b] - c), -(h[d] - c)]), pt(ax, [sa * h[a], h[b] - c, -(h[d] - c)]), pt(ax, [sa * h[a], h[b] - c, h[d] - c]), pt(ax, [sa * h[a], -(h[b] - c), h[d] - c]), n);
      for (const sb of [-1, 1]) {
        // the edge between this face and the next axis' face
        quad(pt(ax, [sa * h[a], sb * (h[b] - c), -(h[d] - c)]), pt(ax, [sa * h[a], sb * (h[b] - c), h[d] - c]), pt(ax, [sa * (h[a] - c), sb * h[b], h[d] - c]), pt(ax, [sa * (h[a] - c), sb * h[b], -(h[d] - c)]), pt(ax, [sa * k, sb * k, 0]));
        if (a === 0) for (const sd of [-1, 1]) tri(pt(ax, [sa * h[a], sb * (h[b] - c), sd * (h[d] - c)]), pt(ax, [sa * (h[a] - c), sb * h[b], sd * (h[d] - c)]), pt(ax, [sa * (h[a] - c), sb * (h[b] - c), sd * h[d]]), pt(ax, [sa * k3, sb * k3, sd * k3]));
      }
    }
  }
  f = { position: new Float32Array(pos), normal: new Float32Array(nor), color: new Float32Array(pos.length).fill(1), count: pos.length / 3 };
  if (chamferCache.size > 600) chamferCache.clear();
  chamferCache.set(key, f);
  return f;
}

/** One geometry from a list of [geometry, matrix, tint]. Plain boxes get bevelled edges on the way. */
function fuse(list) {
  for (const entry of list) {
    if (entry[0] !== UNIT) continue;
    entry[1].decompose(_ps, _qt, _sc);
    if (Math.min(Math.abs(_sc.x), Math.abs(_sc.y), Math.abs(_sc.z)) < 0.0052 || _sc.x <= 0 || _sc.y <= 0 || _sc.z <= 0) continue;
    entry[3] = chamferBox(_sc.x, _sc.y, _sc.z);
    entry[1] = new THREE.Matrix4().compose(_ps, _qt, _sc.set(1, 1, 1));
  }
  const n = list.reduce((s, [geo, , , f]) => s + (f ?? flat(geo)).count, 0);
  const out = { position: new Float32Array(n * 3), normal: new Float32Array(n * 3), color: new Float32Array(n * 3) };
  let at = 0;
  for (const [geo, matrix, tint, f] of list) at = writeInto(out, at, geo, matrix, tint, f);
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) g.setAttribute(name, new THREE.BufferAttribute(out[name], 3));
  return g;
}

/** Fuses the meshes inside a group into one per material (the group then animates as before, with fewer draw calls). */
function compact(obj) {
  if (obj.isMesh) return;
  obj.updateMatrixWorld(true);
  const inv = obj.matrixWorld.clone().invert();
  const by = new Map();
  const dead = [];
  obj.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    (by.get(o.material) ?? by.set(o.material, []).get(o.material)).push([o.geometry, new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), null]);
    dead.push(o);
  });
  if (dead.length <= by.size) return;
  const made = [...by].map(([mat, list]) => { const m = new THREE.Mesh(fuse(list), mat); m.userData.ownGeo = true; return m; });
  for (const o of dead) { if (o.userData.ownGeo) o.geometry.dispose(); }
  obj.clear();
  for (const m of made) obj.add(m);
}

/** A plain box mesh. */
function box(mat, sx, sy, sz, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(UNIT, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  return m;
}

const templates = new Map();
/**
 * A part made of many boxes, as one bevelled geometry per material (cached by key), for parts
 * that stand several times on a house (the windows): each material then is one instanced mesh
 * while they pop in, and one merged mesh once they stand. boxes: [mat, sx, sy, sz, x, y, z, rx].
 */
function template(key, boxes) {
  let t = templates.get(key);
  if (t) return t;
  const by = {};
  const q = new THREE.Quaternion();
  for (const [mat, sx, sy, sz, x, y, z, rx = 0] of boxes) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q.setFromEuler(new THREE.Euler(rx, 0, 0)), new THREE.Vector3(sx, sy, sz));
    (by[mat] ??= []).push([UNIT, m, null]);
  }
  t = Object.fromEntries(Object.entries(by).map(([mat, list]) => [mat, fuse(list)]));
  templates.set(key, t);
  return t;
}

/** A prism: a 2D outline in the (z, y) plane, as long as `len` along x, centered. */
function prism(points, len, mat) {
  const shape = new THREE.Shape(points.map(([z, y]) => new THREE.Vector2(z, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: len, bevelEnabled: false });
  geo.rotateY(-Math.PI / 2); // the outline's x becomes z, the length runs along -x
  geo.translate(len / 2, 0, 0);
  const m = new THREE.Mesh(geo, mat);
  m.userData.ownGeo = true;
  return m;
}

function shadows(root, cast) {
  root.traverse((o) => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = true; } });
}

/**
 * One window in its opening (local: origin on the wall's center line, +z out of the wall): a
 * frame set back 2 mm from the face, the glass deeper still, glazing bars where the option has
 * them, a stone sill that slopes out. Lattice windows get louvred shutters, wooden windows a
 * wooden frame, a wooden sill and a flower box; the panorama window is a large box window set
 * in front of the wall. [mat, sx, sy, sz, x, y, z, rx]
 */
function windowBoxes(id) {
  const out = [];
  const face = D / 2;
  if (id === 'panorama') {
    const w = 0.116;
    const h = 0.144;
    const y = 0.084 - 3.5 * H; // floor to lintel (the openings' centers are at 3.5 courses)
    const F = 0.0065;
    const fz = face + 0.006;
    out.push(['Slim', w + F, F, 0.012, 0, y + h / 2, fz], ['Slim', w + F, F, 0.012, 0, y - h / 2, fz], ['Slim', F, h - F, 0.012, -w / 2, y, fz], ['Slim', F, h - F, 0.012, w / 2, y, fz]);
    out.push(['Glass', w, h, 0.002, 0, y, face + 0.002]);
    out.push(['Slim', 0.0045, h - F, 0.007, 0, y, face + 0.004]);
    out.push(['Slim', w + 0.016, 0.004, 0.02, 0, y - h / 2 - F / 2 - 0.001, face + 0.01, 0.06]);
    return out;
  }
  const hw = L / 2;
  const hh = 1.5 * H;
  const wood = id === 'woodwin';
  const fr = wood ? 'Plank' : 'Frame';
  const F = wood ? 0.0085 : 0.0068;
  const fz = face - 0.009;
  const gz = face - 0.014;
  out.push([fr, 2 * hw, F, 0.014, 0, hh - F / 2, fz], [fr, 2 * hw, F, 0.014, 0, -hh + F / 2, fz]);
  out.push([fr, F, 2 * hh - 2 * F, 0.014, -hw + F / 2, 0, fz], [fr, F, 2 * hh - 2 * F, 0.014, hw - F / 2, 0, fz]);
  out.push(['Glass', 2 * hw - 2 * F + 0.002, 2 * hh - 2 * F + 0.002, 0.002, 0, 0, gz]);
  const bz = gz + 0.0035;
  const inner = 2 * hh - 2 * F;
  if (id === 'plain') {
    // two casements: a mullion, and a narrow sash frame inside the outer frame
    out.push([fr, 0.0055, inner, 0.006, 0, 0, bz]);
    out.push([fr, 2 * hw - 2 * F, 0.0035, 0.004, 0, hh - F - 0.0018, bz], [fr, 2 * hw - 2 * F, 0.0035, 0.004, 0, -hh + F + 0.0018, bz]);
  } else if (id === 'lattice') {
    // six panes, and louvred shutters on both sides
    out.push([fr, 0.0038, inner, 0.005, 0, 0, bz]);
    for (const y of [-0.0128, 0.0128]) out.push([fr, 2 * hw - 2 * F, 0.0034, 0.005, 0, y, bz]);
    for (const sx of [-1, 1]) {
      const x = sx * (hw + 0.0165);
      out.push(['Shutter', 0.03, 2 * hh + 0.006, 0.004, x, 0, face + 0.002]);
      for (let i = 0; i < 7; i++) out.push(['Shutter', 0.024, 0.0028, 0.0034, x, -0.036 + i * 0.012, face + 0.0048, 0.55]);
      out.push(['Metal', 0.004, 0.003, 0.003, sx * (hw + 0.0005), 0.03, face + 0.004], ['Metal', 0.004, 0.003, 0.003, sx * (hw + 0.0005), -0.03, face + 0.004]);
    }
  } else if (wood) {
    // a mullion and a transom (a small top light)
    out.push([fr, 0.0065, inner, 0.006, 0, -0.006, bz], [fr, 2 * hw - 2 * F, 0.006, 0.006, 0, hh * 0.42, bz]);
  }
  // the sill: stone (wood under wooden windows), a little wider than the opening, sloping out
  out.push([wood ? 'Plank' : 'Sill', 2 * hw + 0.016, 0.0062, 0.03, 0, -hh - 0.0028, face + 0.003, 0.12]);
  if (wood) {
    // a flower box under the sill
    out.push(['Plank', 2 * hw + 0.004, 0.013, 0.014, 0, -hh - 0.016, face + 0.011]);
    for (let i = 0; i < 5; i++) out.push([i % 2 ? 'FlowerA' : 'FlowerB', 0.0085, 0.008, 0.0085, -0.028 + i * 0.014, -hh - 0.0075 + (i % 2) * 0.002, face + 0.011 + (i % 2 ? 0.002 : -0.002)]);
    for (let i = 0; i < 4; i++) out.push(['Leaf', 0.012, 0.007, 0.011, -0.021 + i * 0.014, -hh - 0.0085, face + 0.012]);
  }
  return out;
}

export class House {
  /**
   * plotRoot: the group the plot stands in (plot-local space); M: the loaded model
   * (bricks-visuals.js). cast: the house throws shadows; calm: gentle animations.
   */
  constructor(plotRoot, M, { cast = true, calm = false, settle = false } = {}) {
    this.M = M;
    this.settle = settle; // never takes a part back: everything at rest is merged at once
    this.cast = cast;
    this.calm = calm;
    this.site = new THREE.Group();
    this.home = new THREE.Group();
    this.home.position.set(0, FOUND, HOUSE_Z);
    plotRoot.add(this.site, this.home);
    this.plot = M.make('Plot') ?? plainPlot(M.mats);
    this.plotMeshes = new Map();
    if (this.plot) {
      this.plot.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; o.castShadow = false; this.plotMeshes.set(o.material.name, o); } });
      this.site.add(this.plot);
    }
    this.glass = M.mats.Glass.clone();
    this.glass.emissive = new THREE.Color(hex('xr-bricks-window-light'));
    this.glass.emissiveIntensity = 0;
    this.clear = new THREE.MeshStandardMaterial({ color: hex('xr-bricks-crane-glass'), roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.42, depthWrite: false });
    this.parts = {}; // decision (or 'x:' + extra) -> { home, site, bits, singles }
    this.pool = { home: new Map(), site: new Map() }; // frozen parts: one mesh per material
    this.chosen = {};
    this.extras = new Set();
    this.smokeAt = null; // house-local point where chimney smoke rises (wood stove)
    this.changed = 0; // counts up while something moves (for the frozen shadow map)
    this.showGarden(null);
  }

  // ---------- the plot's own garden parts ----------

  showGarden(kind) {
    if (this.siteMerged) return;
    const show = new Set(kind ? GARDEN_BASE : SITE_ONLY);
    if (kind === 'picket') ['Fence', 'LampGlow', ...GREEN].forEach((n) => show.add(n));
    if (kind === 'hedge' || kind === 'playlawn') ['LampGlow', ...GREEN].forEach((n) => show.add(n));
    for (const n of [...GARDEN_ALL, ...SITE_ONLY]) { const m = this.plotMeshes.get(n); if (m) m.visible = show.has(n); }
    this.firVisible = !!kind && kind !== 'gravel';
  }

  // ---------- the place ----------

  /**
   * What the place looks like around the house (static, one mesh per material): rocks and firs
   * in the hillside village, a paved edge with a street lamp in the new estate, a bit of lake
   * with reeds and a jetty at the forest edge, fruit trees and flowers in the meadow.
   */
  decorate(place) {
    const mats = this.M.mats;
    const g = new THREE.Group();
    const ball = new THREE.SphereGeometry(1, 10, 8);
    const cone = new THREE.ConeGeometry(1, 1, 9);
    const blob = (mat, x, y, z, rx, ry = rx, rz = rx) => { const m = new THREE.Mesh(ball, mat); m.position.set(x, y, z); m.scale.set(rx, ry, rz); g.add(m); return m; };
    const spike = (mat, x, y, z, r, h) => { const m = new THREE.Mesh(cone, mat); m.position.set(x, y + h / 2, z); m.scale.set(r, h, r); g.add(m); return m; };
    const fir = (x, z, h) => { g.add(box(mats.Bark, 0.012, h * 0.2, 0.012, x, h * 0.1, z)); [[0.12, 0.5, 0.34], [0.4, 0.42, 0.26], [0.66, 0.36, 0.17]].forEach(([y0, hh, r]) => spike(mats.LeafDark, x, h * y0, z, h * r, h * hh)); };
    if (place === 'hill') {
      [[-0.45, -0.35, 0.05], [-0.22, -0.37, 0.034], [0.12, -0.375, 0.04], [0.5, -0.36, 0.045], [0.56, 0.34, 0.03]].forEach(([x, z, r]) => { blob(mats.Stone, x, r * 0.35, z, r * 1.25, r * 0.75, r); blob(mats.Frame, x - r * 0.1, r * 0.82, z, r * 0.8, r * 0.22, r * 0.66); });
      fir(-0.33, -0.365, 0.2);
      fir(0.2, -0.37, 0.15);
      fir(0.42, -0.375, 0.24);
    } else if (place === 'estate') {
      for (let i = 0; i < 8; i++) g.add(box(mats.ConcreteWall, 0.118, 0.005, 0.045, -0.4 + i * 0.123, 0.003, -0.372));
      g.add(box(mats.Slim, 0.008, 0.2, 0.008, -0.44, 0.1, -0.345), box(mats.Slim, 0.05, 0.006, 0.008, -0.42, 0.2, -0.345), box(mats.LampGlow, 0.028, 0.008, 0.016, -0.405, 0.195, -0.345));
      g.add(box(mats.Bark, 0.008, 0.12, 0.008, 0.14, 0.06, -0.33), box(mats.Plank, 0.006, 0.09, 0.006, 0.158, 0.045, -0.33));
      blob(mats.Leaf, 0.14, 0.15, -0.33, 0.04, 0.048, 0.04);
      g.add(box(mats.Slim, 0.03, 0.05, 0.03, 0.55, 0.025, 0.34), box(mats.Unit, 0.032, 0.006, 0.032, 0.55, 0.053, 0.34));
    } else if (place === 'lake') {
      const water = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.004, 22), this.clear);
      water.userData.ownGeo = true;
      water.position.set(-0.36, 0.003, -0.31);
      water.scale.set(0.17, 1, 0.11);
      const bed = new THREE.Mesh(water.geometry, mats.SolarCell);
      bed.position.set(-0.36, 0.0015, -0.31);
      bed.scale.set(0.18, 0.6, 0.118);
      g.add(bed, water);
      [[-0.5, -0.27], [-0.47, -0.36], [-0.25, -0.385], [-0.2, -0.3], [-0.42, -0.21], [-0.3, -0.21]].forEach(([x, z], i) => { spike(mats.Sedum, x, 0, z, 0.007, 0.06 + (i % 3) * 0.012); spike(mats.Sedum, x + 0.012, 0, z + 0.008, 0.006, 0.045); });
      for (let i = 0; i < 4; i++) g.add(box(mats.Plank, 0.028, 0.005, 0.05, -0.33 + i * 0.03, 0.02, -0.25));
      for (const x of [-0.335, -0.245]) g.add(box(mats.Beam, 0.007, 0.024, 0.007, x, 0.01, -0.232), box(mats.Beam, 0.007, 0.024, 0.007, x, 0.01, -0.268));
      fir(0.14, -0.37, 0.2);
      fir(0.45, -0.37, 0.16);
      blob(mats.Stone, -0.19, 0.008, -0.36, 0.03, 0.016, 0.022);
    } else {
      [[-0.33, -0.35, 0.14], [0.12, -0.36, 0.16], [0.47, -0.355, 0.13]].forEach(([x, z, h]) => {
        g.add(box(mats.Bark, 0.012, h * 0.5, 0.012, x, h * 0.25, z));
        blob(mats.Leaf, x, h * 0.72, z, h * 0.34, h * 0.3, h * 0.34);
        blob(mats.LeafDark, x - h * 0.16, h * 0.62, z + h * 0.08, h * 0.22);
        for (let i = 0; i < 5; i++) { const a = i * 2.2; blob(mats.Berry, x + Math.cos(a) * h * 0.3, h * (0.6 + (i % 3) * 0.08), z + Math.sin(a) * h * 0.26 + 0.01, 0.007); }
      });
      for (let i = 0; i < 16; i++) g.add(box(i % 2 ? mats.FlowerA : mats.FlowerB, 0.009, 0.014, 0.009, -0.48 + ((i * 0.618) % 1) * 0.84, 0.007, -0.39 + ((i * 0.381) % 1) * 0.07));
      g.add(box(mats.Plank, 0.07, 0.004, 0.022, -0.2, 0.03, -0.36), box(mats.Beam, 0.006, 0.03, 0.02, -0.228, 0.015, -0.36), box(mats.Beam, 0.006, 0.03, 0.02, -0.172, 0.015, -0.36));
    }
    g.traverse((m) => { if (m.isMesh) white(m.geometry); });
    compact(g);
    shadows(g, false);
    ball.dispose();
    cone.dispose();
    this.site.add(g);
    // What has a material the plot always shows goes into the plot's own mesh of it (fewer draw calls).
    for (const m of [...g.children]) {
      const name = m.material.name;
      const host = this.plotMeshes.get(name);
      if (!host || TOGGLED.has(name) || !m.isMesh) continue;
      this.absorb(host, [m]);
    }
  }

  /** Merges meshes into a host mesh of the same material (in the host's space) and removes them. */
  absorb(host, list) {
    host.updateMatrixWorld(true);
    const inv = host.matrixWorld.clone().invert();
    const entries = [[host.geometry, new THREE.Matrix4(), null]];
    for (const m of list) { m.updateMatrixWorld(true); entries.push([m.geometry, new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld), null]); }
    const geo = fuse(entries);
    if (host.userData.ownGeo) { flatCache.delete(host.geometry); host.geometry.dispose(); }
    host.geometry = geo;
    host.userData.ownGeo = true;
    for (const m of list) { if (m.userData.ownGeo) { flatCache.delete(m.geometry); m.geometry.dispose(); } m.removeFromParent(); }
  }

  /**
   * Once nothing on the plot can change any more (the check): every visible mesh of the plot,
   * the place around it, the garden and the extras outside the house becomes one mesh per
   * material; the parts the garden hid are dropped.
   */
  mergeSite() {
    this.siteMerged = true;
    const by = new Map();
    const hidden = [];
    // the site, and what of the house is frozen (one mesh per material in this.home)
    for (const root of [this.site, this.home]) {
      root.updateMatrixWorld(true);
      const list = root === this.home ? [...this.pool.home.values()] : [];
      if (root === this.site) {
        root.traverse((o) => {
          if (!o.isMesh || o.isInstancedMesh || o.userData.noFit) return;
          let vis = true;
          for (let q = o; q && q !== root; q = q.parent) { if (q.userData.noBake) return; if (!q.visible) vis = false; }
          if (vis) list.push(o); else hidden.push(o);
        });
      }
      for (const o of list) if (o.parent && !o.material.transparent) (by.get(o.material) ?? by.set(o.material, []).get(o.material)).push(o);
    }
    for (const list of by.values()) {
      if (list.length < 2) continue;
      const host = list.find((m) => m.castShadow) ?? list[0];
      this.absorb(host, list.filter((m) => m !== host));
    }
    for (const o of hidden) { if (o.userData.ownGeo) { flatCache.delete(o.geometry); o.geometry.dispose(); } o.removeFromParent(); }
    // the pools now hold the merged meshes (only those that sit directly in their root, as freeze() expects)
    for (const where of ['home', 'site']) {
      const pool = this.pool[where];
      for (const [mat, m] of [...pool]) if (!m.parent) pool.delete(mat);
      for (const list of by.values()) {
        const host = list.find((m) => m.parent === this[where] && m.matrix.equals(_ident));
        if (host) { pool.set(host.material, host); this.pool[where === 'home' ? 'site' : 'home'].delete(host.material); }
      }
    }
    this.changed += 1;
  }

  // ---------- building blocks ----------

  begin(key) {
    if (this.parts[key]) this.remove(...(key.startsWith('x:') ? ['extras', key.slice(2)] : [key]));
    const part = { home: new THREE.Group(), site: new THREE.Group(), bits: [], singles: [], pending: new Map() };
    this.home.add(part.home);
    this.site.add(part.site);
    this.parts[key] = part;
    this.cur = part;
    return part;
  }

  /** Queues a box of material `mat` (a name in M.mats) for the part being built. */
  b(mat, x, y, z, sx, sy, sz, o = {}) {
    const key = `${o.site ? 's' : 'h'}|${mat}`;
    const list = this.cur.pending.get(key) ?? this.cur.pending.set(key, []).get(key);
    list.push({ x, y, z, sx, sy, sz, ...o });
  }

  /** Adds a single object (a model part or a mesh) with a 'pop' or 'drop' animation. */
  one(obj, { delay = 0, how = 'pop', site = false, lift = 0.3 } = {}) {
    if (!obj) return null;
    (site ? this.cur.site : this.cur.home).add(obj);
    obj.traverse((m) => { if (!m.isMesh) return; white(m.geometry); if (m.material.name === 'Glass') m.material = this.glass; });
    compact(obj);
    shadows(obj, this.cast);
    this.cur.singles.push({ obj, t: -delay, how, base: obj.scale.clone(), y: obj.position.y, lift, done: false });
    obj.visible = false;
    return obj;
  }

  flush(geos = null) {
    for (const [key, items] of this.cur.pending) {
      const [where, mat] = key.split('|');
      const geo = geos?.[mat] ?? UNIT;
      this.cur.bits.push(new Bits(where === 's' ? this.cur.site : this.cur.home, geo, this.mat(mat), items, this.cast));
    }
    this.cur.pending.clear();
  }

  /** A material by its name (the house's own glass, which lights up at the end). */
  mat(name) { return name === 'Glass' ? this.glass : this.M.mats[name] ?? this.M.mats.Concrete; }

  /** Puts a template (one geometry per material) at every item ({ x, y, z, yaw, delay, how }), each material one instanced mesh. */
  inst(tpl, items, site = false) {
    for (const [name, geo] of Object.entries(tpl)) this.cur.bits.push(new Bits(site ? this.cur.site : this.cur.home, geo, this.mat(name), items.map((it) => ({ ...it })), this.cast));
  }

  /** Round things (shrubs, stones) of one material as one instanced mesh: items { x, y, z, sx, sy, sz, delay, how }. */
  balls(name, items, site = true) {
    this.ball ??= white(new THREE.SphereGeometry(1, 12, 9));
    if (items.length) this.cur.bits.push(new Bits(site ? this.cur.site : this.cur.home, this.ball, this.mat(name), items, false));
  }

  /** Takes a part away again (an extra by its id). */
  remove(decision, id = null) {
    const key = decision === 'extras' ? `x:${id}` : decision;
    const part = this.parts[key];
    if (!part) return;
    for (const g of [part.home, part.site]) {
      g.traverse((o) => { if (o.isInstancedMesh) o.dispose(); if (o.userData.ownGeo) o.geometry.dispose(); });
      g.removeFromParent();
    }
    delete this.parts[key];
    if (decision === 'extras') this.extras.delete(id); else delete this.chosen[decision];
    if (decision === 'garden') this.showGarden(null);
    if (decision === 'heating') this.smokeAt = null;
    if (decision === 'door') this.doorPivot = null;
    this.changed += 1;
  }

  /** Builds the part for a decision (or one extra). animate false: it stands at once. Returns its build time (s). */
  build(decision, id, { animate = true, held = false } = {}) {
    if (decision === 'extras') { this.begin(`x:${id}`); this.extras.add(id); } else { this.begin(decision); this.chosen[decision] = id; }
    const time = this[`build_${decision}`](id, held) ?? 1;
    this.flush();
    if (!animate) this.update(Infinity);
    return this.calm ? time * 1.25 : time;
  }

  update(dt) {
    let busy = false;
    for (const part of Object.values(this.parts)) {
      let moving = false;
      for (const bits of part.bits) if (bits.update(this.calm && Number.isFinite(dt) ? dt * 0.8 : dt)) moving = true;
      for (const s of part.singles) {
        if (s.done) continue;
        s.t += dt;
        moving = true;
        if (s.t < 0) continue;
        s.obj.visible = true;
        const k = clamp01(s.t / (s.how === 'drop' ? 0.5 : 0.3));
        if (s.how === 'drop') s.obj.position.y = s.y + (1 - ease(k)) * s.lift;
        else s.obj.scale.copy(s.base).multiplyScalar(Math.max(0.001, this.calm ? ease(k) : 0.5 + 0.5 * back(k)));
        if (k >= 1) { s.done = true; s.obj.position.y = s.y; s.obj.scale.copy(s.base); }
      }
      if (moving) busy = true;
      else if (!part.baked) { part.baked = true; this.bake(part); busy = true; }
    }
    if (busy) this.changed += 1;
    // parts that came to rest after the final freeze (or, for a house that never takes a part
    // back, any part at rest): frozen too, and the plot merged with them
    else if ((this.final || this.settle) && Object.values(this.parts).some((p) => p.baked && !p.frozen)) this.freeze([], this.final);
    return busy;
  }

  /**
   * A part that stands still becomes one mesh per material (fewer draw calls): its single meshes
   * and its instanced pieces are merged in place. Things that move later (the door) are noBake.
   */
  bake(part) {
    for (const g of [part.home, part.site]) {
      g.updateMatrixWorld(true);
      const inv = g.matrixWorld.clone().invert();
      const by = new Map();
      const dead = [];
      const add = (mat, entry) => (by.get(mat) ?? by.set(mat, []).get(mat)).push(entry);
      g.traverse((o) => {
        if (!o.isMesh || !o.visible) return;
        for (let q = o; q && q !== g; q = q.parent) if (q.userData.noBake) return;
        if (o.isInstancedMesh) {
          const bits = part.bits.find((b) => b.mesh === o);
          if (!bits) return;
          const rel = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
          for (const [geo, m, tint] of bits.pieces()) add(o.material, [geo, m.premultiply(rel), tint]);
        } else add(o.material, [o.geometry, new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), null]);
        dead.push(o);
      });
      const made = [...by].map(([mat, list]) => {
        const m = new THREE.Mesh(fuse(list), mat);
        m.userData.ownGeo = true;
        m.userData.baked = true;
        m.castShadow = this.cast;
        m.receiveShadow = true;
        return m;
      });
      for (const o of dead) { if (o.isInstancedMesh) o.dispose(); else if (o.userData.ownGeo) o.geometry.dispose(); o.removeFromParent(); }
      for (const m of made) g.add(m);
    }
    part.bits = [];
  }

  /**
   * Parts that can no longer change go into one mesh per material for the whole house (and one
   * for the garden): `keep` names the parts that may still be taken away (the last choice, the
   * extras before they are confirmed).
   */
  freeze(keep = [], final = false) {
    if (final) this.final = true;
    const fresh = { home: new Map(), site: new Map() };
    for (const [key, part] of Object.entries(this.parts)) {
      if (part.frozen || !part.baked || keep.includes(key) || (key.startsWith('x:') && keep.includes('extras'))) continue;
      part.frozen = true;
      for (const where of ['home', 'site']) {
        const root = this[where];
        root.updateMatrixWorld(true);
        const inv = root.matrixWorld.clone().invert();
        for (const o of [...part[where].children]) {
          if (!o.userData.baked) continue;
          const list = fresh[where].get(o.material) ?? fresh[where].set(o.material, []).get(o.material);
          list.push([o.geometry, new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), null, null, o]);
        }
      }
    }
    for (const where of ['home', 'site']) {
      for (const [mat, list] of fresh[where]) {
        const old = this.pool[where].get(mat);
        if (old) list.push([old.geometry, new THREE.Matrix4(), null, null, old]);
        const m = new THREE.Mesh(fuse(list), mat);
        m.castShadow = this.cast;
        m.receiveShadow = true;
        for (const [, , , , o] of list) { flatCache.delete(o.geometry); o.geometry.dispose(); o.removeFromParent(); }
        this[where].add(m);
        this.pool[where].set(mat, m);
      }
    }
    if ((this.final || this.settle) && this.chosen.garden && Object.values(this.parts).every((p) => p.frozen)) this.mergeSite();
    this.changed += 1;
  }

  /** The windows light up (k: 0..1 times the scene's glow boost); their warm light falls on the ground in front of them. */
  lights(v) {
    this.glass.emissiveIntensity = v;
    if (v > 0 && !this.pools) this.makePools();
    if (this.pools) {
      this.pools.visible = v > 0;
      this.pools.material.opacity = 0.42 * Math.min(1, v / 1.4);
    }
  }

  /** Soft pools of window light on the ground in front of the windows and the door (one instanced mesh, additive). */
  makePools() {
    const list = openings();
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ map: radialTexture(), color: hex('xr-bricks-light-pool'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((o, i) => {
      const nx = Math.sin(o.face);
      const nz = Math.cos(o.face);
      const door = o.kind === 'door';
      const out = door ? 0.06 : 0.05;
      _q.setFromEuler(_e.set(0, o.face, 0));
      m.setMatrixAt(i, _m.compose(_p.set(o.x + nx * (D / 2 + out), -FOUND + 0.0015, o.z + nz * (D / 2 + out)), _q, _s.set(door ? 0.1 : 0.12, 1, door ? 0.11 : 0.085)));
    });
    m.instanceMatrix.needsUpdate = true;
    m.renderOrder = 2;
    m.userData.ownGeo = true;
    m.userData.noFit = true;
    m.frustumCulled = false;
    this.home.add(m);
    this.pools = m;
  }

  // ---------- walls ----------

  build_walls(id) {
    const boxes = wallBoxes();
    const posts = (mat, how, delay = 0) => { for (const [x, z] of CORNERS) this.b(mat, x, TOP / 2, z, D, TOP, D, { how, delay, dur: 0.4 }); };
    if (id === 'brick') {
      const by = { full: [], half: [], post: [] };
      for (const p of brickPieces()) {
        const delay = p.course * 0.11 + Math.random() * 0.1;
        if (p.kind === 'lintel') this.b('Concrete', p.x, p.y, p.z, L - GAP, H - GAP, D, { yaw: p.yaw, delay });
        else by[p.kind].push({ x: p.x, y: p.y, z: p.z, yaw: p.yaw, delay, tint: rnd(0.84, 1.08), warm: rnd(-0.04, 0.04) });
      }
      // The mortar: a core inside every stretch of wall, a little thinner than the bricks, so the
      // joints are filled (and nothing shows through them). It rises with the courses.
      for (const w of boxes) this.b('Mortar', w.x, w.y, w.z, w.len, w.h - 0.002, D - 0.007, { yaw: w.yaw, how: 'grow', dur: 0.95 });
      const G = this.M.geo;
      this.cur.bits.push(new Bits(this.cur.home, G.brick, this.M.mats.BrickClay, by.full, this.cast));
      this.cur.bits.push(new Bits(this.cur.home, G.half, this.M.mats.BrickClay, by.half, this.cast));
      this.cur.bits.push(new Bits(this.cur.home, G.quoin, this.M.mats.Quoin, by.post, this.cast));
      return 1.2;
    }
    if (id === 'concrete') {
      // Board-marked concrete: the formwork's boards leave bands of slightly different shades
      // with a fine groove between them, and a grid of tie holes on every stretch of wall.
      for (const w of boxes) {
        const o = { yaw: w.yaw, how: 'drop', delay: w.wall * 0.2, dur: 0.45 };
        this.b('ConcreteWall', w.x, w.y, w.z, w.len, w.h, D - 0.003, { ...o, tint: 0.78 });
        const n = Math.max(1, Math.round(w.h / H));
        for (let i = 0; i < n; i++) {
          const y = w.y - w.h / 2 + ((i + 0.5) * w.h) / n;
          const band = Math.round((w.y - w.h / 2 + (i * w.h) / n) / H);
          this.b('ConcreteWall', w.x, y, w.z, w.len, w.h / n - 0.0014, D, { ...o, tint: (band % 2 ? 0.95 : 1.04) * rnd(0.98, 1.02) });
        }
        const wall = WALLS[w.wall];
        const nx = Math.sin(wall.face) * (D / 2 + 0.0004);
        const nz = Math.cos(wall.face) * (D / 2 + 0.0004);
        const k = Math.max(1, Math.round(w.len / 0.048));
        for (let i = 0; i < k; i++) {
          const u = w.u0 + ((i + 0.5) / k) * (w.u1 - w.u0);
          const [x, z] = wall.at(u);
          for (const y of [H * 1.5, H * 3.5, H * 5.5]) if (y > w.y - w.h / 2 + 0.008 && y < w.y + w.h / 2 - 0.008) this.b('Dark', x + nx, y, z + nz, 0.0055, 0.0055, 0.0016, { ...o, yaw: w.yaw });
        }
      }
      posts('ConcreteWall', 'drop', 0.75);
      return 1.3;
    }
    if (id === 'wood') {
      // Wood cladding: boards that overlap a little (each one tilted, its lower edge out), on a
      // dark core that fills the joints, with corner boards.
      for (const w of boxes) {
        const wall = WALLS[w.wall];
        const out = wall.key === 'front' || wall.key === 'right' ? 1 : -1;
        this.b('Beam', w.x, w.y, w.z, w.len, w.h, D - 0.008, { yaw: w.yaw, tint: 0.55, delay: 0.02 });
        const n = Math.max(1, Math.round(w.h / H));
        for (let i = 0; i < n; i++) {
          const y = w.y - w.h / 2 + ((i + 0.5) * w.h) / n;
          this.b('Plank', w.x, y, w.z, w.len - 0.0005, w.h / n - 0.0022, D - 0.002, { yaw: w.yaw, rx: -out * 0.07, tint: rnd(0.8, 1.12), warm: rnd(-0.03, 0.04), delay: Math.floor(y / H) * 0.11 + Math.random() * 0.06 });
        }
      }
      for (const [x, z] of CORNERS) this.b('Beam', x, TOP / 2, z, D + 0.006, TOP, D + 0.006, { how: 'grow', dur: 0.4, tint: 1.15 });
      return 1.2;
    }
    // Timber frame: beams first, then the plastered fields.
    posts('Beam', 'grow');
    const T = D + 0.005;
    for (const w of boxes) {
      const wall = WALLS[w.wall];
      this.b('Plaster', w.x, w.y, w.z, w.len, w.h, D - 0.006, { yaw: w.yaw, delay: 0.55 + w.wall * 0.07 + Math.random() * 0.1 });
      if (w.part !== 'above') this.b('Beam', w.x, 0.006, w.z, w.len, 0.012, T, { yaw: w.yaw, delay: 0.05 });
      if (w.part !== 'below') this.b('Beam', w.x, TOP - 0.006, w.z, w.len, 0.012, T, { yaw: w.yaw, delay: 0.4 });
      if (w.part === 'above') this.b('Beam', w.x, w.y - w.h / 2 + 0.005, w.z, w.len, 0.01, T, { yaw: w.yaw, delay: 0.35 });
      if (w.part === 'below') this.b('Beam', w.x, w.y + w.h / 2 - 0.005, w.z, w.len, 0.01, T, { yaw: w.yaw, delay: 0.3 });
      if (w.part !== 'col') continue;
      for (const u of [w.u0, w.u1]) {
        if (u < 0.01 || u > wall.len - 0.01) continue;
        const [x, z] = wall.at(u);
        const s = u === w.u0 ? 0.006 : -0.006;
        this.b('Beam', x + (wall.along === 'x' ? s : 0), TOP / 2, z - (wall.along === 'z' ? s : 0), 0.012, TOP, T, { yaw: w.yaw, how: 'grow', delay: 0.12, dur: 0.4 });
      }
      this.b('Beam', w.x, 2 * H, w.z, w.len, 0.01, T, { yaw: w.yaw, delay: 0.3 });
      if (w.len > L * 0.9) {
        const dir = w.u0 < wall.len / 2 ? 1 : -1;
        const hh = 2 * H - 0.014;
        this.b('Beam', w.x, 0.012 + hh / 2, w.z, Math.hypot(w.len - 0.02, hh), 0.009, T - 0.001, { yaw: w.yaw, rz: dir * Math.atan2(hh, w.len - 0.02), delay: 0.45 });
      }
    }
    return 1.3;
  }

  // ---------- roof ----------

  /** held: the roof hangs on the crane; the scene moves this.parts.roof.home.position.y. */
  build_roof(id, held) {
    const mats = this.M.mats;
    const g = new THREE.Group();
    g.position.y = TOP;
    const wallMat = { concrete: mats.ConcreteWall, wood: mats.Plank }[this.chosen.walls] ?? mats.Plaster;
    if (id === 'tiles') {
      const roof = this.M.make('Roof');
      if (roof) {
        g.add(roof);
        // The single tiles: a fine joint between them, every row shifted by half a tile.
        const L_SLOPE = Math.hypot(EZ, RIDGE - EY);
        const seg = L_SLOPE / 7;
        const TW = 0.0405;
        for (const side of [-1, 1]) {
          const ux = -EZ * side;
          const uy = RIDGE - EY;
          const ul = Math.hypot(ux, uy);
          const u = [ux / ul, uy / ul]; // (z, y) along the slope towards the ridge
          let n = [-u[1], u[0]];
          if (n[1] < 0) n = [-n[0], -n[1]];
          for (let k = 0; k < 7; k++) {
            const a0 = k * seg;
            const a1 = Math.min(L_SLOPE + 0.004, (k + 1) * seg + 0.006);
            const pa = [EZ * side + u[0] * a0 + n[0] * 0.012, EY + u[1] * a0 + n[1] * 0.012];
            const pb = [EZ * side + u[0] * a1 + n[0] * 0.006, EY + u[1] * a1 + n[1] * 0.006];
            const dz = pb[0] - pa[0];
            const dy = pb[1] - pa[1];
            const len = Math.hypot(dz, dy) * 0.86;
            const cz = (pa[0] + pb[0]) / 2 + n[0] * 0.0003;
            const cy = (pa[1] + pb[1]) / 2 + n[1] * 0.0003;
            const rx = Math.atan2(-dy, dz);
            for (let x = -RX + TW * (k % 2 ? 0.5 : 1); x < RX - 0.012; x += TW) {
              const j = box(mats.RoofDark, 0.0016, 0.0018, len, x, cy, cz);
              j.rotation.x = rx;
              g.add(j);
            }
          }
        }
      }
    } else if (id === 'thatch') {
      const RT = RIDGE + 0.03;
      g.add(prism([[-EZ, EY - 0.01], [-EZ - 0.006, EY + 0.014], [-0.04, RT - 0.004], [0, RT + 0.006], [0.04, RT - 0.004], [EZ + 0.006, EY + 0.014], [EZ, EY - 0.01], [0, RIDGE - 0.008]], 2 * RX + 0.01, mats.Thatch));
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2 * RX + 0.02, 12).rotateZ(Math.PI / 2), mats.ThatchDark);
      cap.userData.ownGeo = true;
      cap.scale.set(1, 0.55, 1.5);
      cap.position.y = RT - 0.002;
      g.add(cap);
      // Layers of reed: darker bands across both slopes, lying on the surface.
      const z0 = EZ + 0.006;
      const y0 = EY + 0.014;
      const z1 = 0.04;
      const y1 = RT - 0.004;
      const slope = Math.atan2(y1 - y0, z0 - z1);
      for (const side of [-1, 1]) {
        // fine darker reeds running down the slope, of different lengths
        for (let i = 0; i < 46; i++) {
          const f0 = rnd(0, 0.55);
          const f1 = Math.min(0.97, f0 + rnd(0.2, 0.5));
          const len = (f1 - f0) * Math.hypot(z0 - z1, y0 - y1);
          const f = (f0 + f1) / 2;
          const reed = box(mats.ThatchDark, rnd(0.002, 0.0032), 0.003, len, rnd(-RX + 0.01, RX - 0.01), y0 + (y1 - y0) * f + 0.0012, side * (z0 + (z1 - z0) * f));
          reed.rotation.x = side * slope;
          g.add(reed);
        }
        for (const f of [0.02, 0.3, 0.56, 0.8]) {
          const strip = box(mats.ThatchDark, 2 * RX + 0.012, 0.006, f < 0.1 ? 0.03 : 0.014, 0, y0 + (y1 - y0) * f + 0.002, side * (z0 + (z1 - z0) * f));
          strip.rotation.x = side * slope;
          g.add(strip);
        }
      }
      for (const sx of [-1, 1]) { const tri = prism([[-OZ, 0], [OZ, 0], [0, RIDGE]], D, mats.Plaster); tri.position.x = sx * XH; g.add(tri); }
      this.gutters(g, EY - 0.022, EZ + 0.01, 2 * RX - 0.02, true);
    } else if (id === 'green') {
      g.add(box(mats.Dark, 2 * OX + 0.05, 0.026, 2 * OZ + 0.05, 0, 0.013, 0));
      g.add(box(mats.Frame, 2 * OX + 0.056, 0.006, 2 * OZ + 0.056, 0, 0.028, 0));
      g.add(box(mats.Sedum, 2 * OX + 0.02, 0.008, 2 * OZ + 0.02, 0, 0.033, 0));
      const tuft = new THREE.SphereGeometry(1, 8, 6);
      for (let i = 0; i < 18; i++) {
        const m = new THREE.Mesh(tuft, i % 3 ? mats.Leaf : mats.FlowerB);
        const r = i % 3 ? rnd(0.014, 0.024) : 0.007;
        m.scale.set(r, r * 0.5, r);
        m.position.set(rnd(-OX + 0.02, OX - 0.02), 0.038, rnd(-OZ + 0.02, OZ - 0.02));
        g.add(m);
      }
      g.children[3].userData.ownGeo = true;
      // a gravel strip along the edge, where the water runs off, and a gutter at the front
      for (const [sx, sz, x, z] of [[2 * OX + 0.02, 0.014, 0, OZ + 0.003], [2 * OX + 0.02, 0.014, 0, -OZ - 0.003], [0.014, 2 * OZ - 0.01, OX + 0.003, 0], [0.014, 2 * OZ - 0.01, -OX - 0.003, 0]]) g.add(box(mats.Pebble, sx, 0.006, sz, x, 0.036, z));
      this.gutters(g, 0.008, OZ + 0.036, 2 * OX + 0.05, false);
    } else {
      // Mono-pitch metal roof: low at the street, high at the back.
      const y0 = 0.012;
      const y1 = 0.1;
      const ang = Math.atan2(y1 - y0, 2 * OZ);
      const len = Math.hypot(2 * OZ, y1 - y0) + 0.08;
      const slab = new THREE.Group();
      slab.position.y = (y0 + y1) / 2 + 0.008;
      slab.rotation.x = ang;
      slab.add(box(mats.MetalRoof, 2 * OX + 0.07, 0.01, len));
      for (let x = -OX - 0.02; x <= OX + 0.021; x += (2 * OX + 0.04) / 10) slab.add(box(mats.MetalRoof, 0.005, 0.008, len, x, 0.008, 0));
      slab.add(box(mats.Slim, 2 * OX + 0.074, 0.014, 0.006, 0, -0.002, len / 2));
      g.add(slab);
      const gutter = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 2 * OX + 0.06, 10).rotateZ(Math.PI / 2), mats.Metal);
      gutter.userData.ownGeo = true;
      gutter.position.set(0, y0 - 0.012, OZ + 0.046);
      g.add(gutter);
      for (const sx of [-1, 1]) g.add(box(mats.Metal, 0.007, 0.2, 0.007, sx * (OX + 0.022), y0 - 0.112, OZ + 0.04));
      // the flashing over the high edge at the back, and a fascia under the low one
      const hi = new THREE.Group();
      hi.position.set(0, y1 + 0.016, -OZ - 0.04);
      hi.add(box(mats.Slim, 2 * OX + 0.078, 0.006, 0.02, 0, 0, 0.004), box(mats.Slim, 2 * OX + 0.078, 0.02, 0.005, 0, -0.008, -0.006));
      g.add(hi);
      for (const sx of [-1, 1]) { const w = prism([[-OZ, 0], [OZ, 0], [OZ, y0 - 0.004], [-OZ, y1 - 0.004]], D, wallMat); w.position.x = sx * XH; g.add(w); }
      g.add(box(wallMat, 2 * XH - D, y1 - 0.006, D, 0, (y1 - 0.006) / 2, -ZH));
      g.add(box(mats.Slim, 2 * XH - D - 0.06, 0.03, D + 0.004, 0, 0.045, -ZH));
    }
    this.one(g, { how: held ? 'pop' : 'drop', lift: 0.35 });
    if (held) { const s = this.cur.singles[this.cur.singles.length - 1]; s.done = true; g.visible = true; }
    this.roofTop = id === 'tiles' || id === 'thatch' ? TOP + RIDGE + 0.03 : id === 'metal' ? TOP + 0.11 : TOP + 0.04;
    return 1.0;
  }

  /** Gutters along both eaves (or only the front) at height y and depth z, with downpipes at the front corners. */
  gutters(g, y, z, len, both) {
    const mats = this.M.mats;
    const geo = new THREE.CylinderGeometry(0.0065, 0.0065, len, 10).rotateZ(Math.PI / 2);
    for (const side of both ? [-1, 1] : [1]) {
      const m = new THREE.Mesh(geo, mats.Metal);
      m.position.set(0, y, side * z);
      g.add(m);
      for (const sx of [-1, 1]) {
        const x = sx * (len / 2 - 0.02);
        const drop = y + TOP + 0.004;
        g.add(box(mats.Metal, 0.0075, drop, 0.0075, x, y - drop / 2, side * (z - 0.006)));
        g.add(box(mats.Metal, 0.0075, 0.0075, 0.014, x, -TOP + 0.002, side * (z - 0.002)));
      }
    }
    g.children[g.children.length - (both ? 10 : 5)].userData.ownGeo = true;
  }

  // ---------- windows ----------

  build_windows(id) {
    // Every window is the same set of boxes: one instanced mesh per material while they pop in.
    const items = openings().filter((o) => o.kind === 'window').map((o, i) => ({ x: o.x, y: o.y, z: o.z, yaw: o.face, delay: i * 0.1, dur: 0.3 }));
    this.inst(template(`win:${id}`, windowBoxes(id)), items);
    return 0.9;
  }

  // ---------- front door ----------

  build_door(id) {
    const mats = this.M.mats;
    const frame = this.M.make('DoorFrame') ?? new THREE.Group();
    frame.position.set(0, 2.5 * H, ZH);
    if (id === 'glassdoor') frame.traverse((m) => { if (m.isMesh && m.material.name === 'Frame') m.material = mats.Slim; });
    this.one(frame);
    const pivot = new THREE.Group();
    pivot.position.set(-L / 2 + 0.0065, 2.5 * H - 0.003, ZH + 0.004);
    if (id === 'glassdoor') {
      pivot.add(box(this.glass, 0.056, 0.14, 0.004, 0.0295, 0, 0));
      for (const x of [0.002, 0.057]) pivot.add(box(mats.Slim, 0.004, 0.144, 0.006, x, 0, 0));
      for (const y of [-0.07, 0.07]) pivot.add(box(mats.Slim, 0.059, 0.004, 0.006, 0.0295, y, 0));
      pivot.add(box(mats.Metal, 0.003, 0.05, 0.004, 0.05, 0, 0.005));
    } else {
      const door = this.M.make('Door');
      if (door) {
        if (id === 'canopy') door.traverse((m) => { if (m.isMesh && m.material.name === 'Door') m.material = mats.Plank; });
        pivot.add(door);
      }
    }
    pivot.userData.noBake = true;
    this.one(pivot, { delay: 0.15 });
    this.doorPivot = pivot;
    this.doorGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.066, 0.14), new THREE.MeshBasicMaterial({ color: hex('xr-bricks-interior'), transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    this.doorGlow.userData.ownGeo = true;
    this.doorGlow.userData.noBake = true;
    this.doorGlow.position.set(0, 2.5 * H, ZH - 0.01);
    this.cur.home.add(this.doorGlow);
    const extra = new THREE.Group();
    if (id === 'canopy') {
      // A pitched wooden canopy on brackets.
      for (const sx of [-1, 1]) {
        const half = box(mats.Roof, 0.074, 0.007, 0.075, sx * 0.03, 0.193, OZ + 0.034);
        half.rotation.z = -sx * 0.5;
        extra.add(half);
        const br = box(mats.Beam, 0.007, 0.007, 0.06, sx * 0.052, 0.158, OZ + 0.024);
        br.rotation.x = -0.55;
        extra.add(br);
        extra.add(box(mats.Beam, 0.007, 0.05, 0.007, sx * 0.052, 0.15, OZ + 0.003));
      }
      extra.add(box(mats.Beam, 0.012, 0.009, 0.078, 0, 0.212, OZ + 0.034));
    } else if (id === 'glassdoor' || id === 'ramp') {
      // Level entry: a gentle ramp from the path to the threshold (with handrails for the wide one).
      const len = id === 'ramp' ? 0.17 : 0.1;
      const w = id === 'ramp' ? 0.1 : 0.12;
      const ramp = box(id === 'ramp' ? mats.Plank : mats.ConcreteWall, w, 0.005, len, 0, -FOUND / 2 + 0.001, OZ + len / 2);
      ramp.rotation.x = Math.atan2(FOUND - 0.002, len);
      extra.add(ramp);
      if (id === 'ramp') {
        for (const sx of [-1, 1]) {
          const rail = box(mats.Metal, 0.004, 0.004, len, sx * (w / 2 - 0.003), 0.034 - FOUND / 2, OZ + len / 2);
          rail.rotation.x = ramp.rotation.x;
          extra.add(rail);
          for (const f of [0.08, 0.5, 0.92]) extra.add(box(mats.Metal, 0.004, 0.034, 0.004, sx * (w / 2 - 0.003), 0.017 - FOUND * f, OZ + len * f));
        }
      }
    }
    if (id === 'painted' || id === 'canopy') {
      // a stone step in front of the threshold
      extra.add(box(mats.Sill, 0.098, FOUND - 0.002, 0.03, 0, -FOUND / 2 - 0.001, OZ + 0.016));
    }
    // a house number plate and a lit bell button beside the door, under the lamp
    extra.add(box(mats.Frame, 0.014, 0.011, 0.0025, -0.058, 0.094, OZ + 0.0012), box(mats.Dark, 0.006, 0.006, 0.0012, -0.058, 0.094, OZ + 0.0028));
    extra.add(box(mats.Metal, 0.0075, 0.012, 0.0028, -0.058, 0.074, OZ + 0.0014), box(mats.LampGlow, 0.0034, 0.0034, 0.0016, -0.058, 0.076, OZ + 0.0032));
    this.one(extra, { delay: 0.3 });
    return 0.8;
  }

  /** The door swings open and warm light shows behind it (k: 0..1). */
  openDoor(k) {
    if (this.doorPivot) this.doorPivot.rotation.y = 1.15 * k;
    if (this.doorGlow) this.doorGlow.material.opacity = 0.85 * k;
  }

  // ---------- heating ----------

  /** The heating stands at the left wall near the front corner, where the view from the front left shows it. */
  build_heating(id) {
    const mats = this.M.mats;
    const g = new THREE.Group();
    const x = -OX - 0.03;
    if (id === 'heatpump') {
      g.add(box(mats.Concrete, 0.06, 0.006, 0.095, x, 0.003 - FOUND, 0.115));
      g.add(box(mats.Unit, 0.042, 0.062, 0.082, x, 0.037 - FOUND, 0.115));
      const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.004, 20).rotateZ(Math.PI / 2), mats.Dark);
      fan.userData.ownGeo = true;
      fan.position.set(x - 0.022, 0.039 - FOUND, 0.105);
      g.add(fan);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.023, 0.003, 6, 20).rotateY(Math.PI / 2), mats.Slim);
      ring.userData.ownGeo = true;
      ring.position.set(x - 0.023, 0.039 - FOUND, 0.105);
      g.add(ring);
      for (const dz of [-0.012, 0, 0.012]) g.add(box(mats.Slim, 0.003, 0.03, 0.003, x - 0.0235, 0.039 - FOUND, 0.105 + dz));
      g.add(box(mats.Slim, 0.003, 0.006, 0.018, x - 0.022, 0.058 - FOUND, 0.145));
      g.add(box(mats.Metal, 0.012, 0.006, 0.006, -OX - 0.005, 0.03 - FOUND, 0.14));
    } else if (id === 'gas') {
      g.add(box(mats.GasBox, 0.02, 0.05, 0.042, -OX - 0.01, 0.05, 0.1));
      g.add(box(mats.Dark, 0.004, 0.014, 0.022, -OX - 0.021, 0.055, 0.1));
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, TOP - 0.03, 10), mats.GasBox);
      pipe.userData.ownGeo = true;
      pipe.position.set(-OX - 0.009, (TOP - 0.03) / 2, 0.15);
      g.add(pipe);
      g.add(box(mats.GasBox, 0.006, 0.006, 0.05, -OX - 0.009, 0.03, 0.125));
      g.add(box(mats.Metal, 0.018, 0.008, 0.018, -OX - 0.009, TOP - 0.03, 0.15));
    } else {
      // A wood stove: its chimney on the outside wall and a stack of firewood.
      const top = TOP + RIDGE + 0.05;
      g.add(box(mats.BrickClay, 0.05, top + FOUND, 0.05, -OX - 0.025, (top - FOUND) / 2, 0.135));
      g.add(box(mats.Concrete, 0.062, 0.008, 0.062, -OX - 0.025, top + 0.004, 0.135));
      g.add(box(mats.Dark, 0.034, 0.012, 0.034, -OX - 0.025, top + 0.014, 0.135));
      const log = new THREE.CylinderGeometry(0.009, 0.009, 0.05, 8).rotateZ(Math.PI / 2);
      [[0, 0], [1, 0], [2, 0], [0.5, 1], [1.5, 1], [1, 2]].forEach(([i, j], n) => {
        const m = new THREE.Mesh(log, n % 2 ? mats.Bark : mats.Wood);
        m.position.set(-OX - 0.03, 0.009 - FOUND + j * 0.016, 0.062 + i * 0.019);
        g.add(m);
      });
      g.children[3].userData.ownGeo = true;
      this.smokeAt = new THREE.Vector3(-OX - 0.025, top + 0.03, 0.135);
    }
    this.one(g);
    return 0.7;
  }

  // ---------- the extras ----------

  build_extras(id) {
    const mats = this.M.mats;
    if (id === 'tank') {
      // A rainwater tank at the back corner, fed by a pipe from the roof.
      const g = new THREE.Group();
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.085, 16), mats.Shutter);
      tank.userData.ownGeo = true;
      tank.position.set(OX + 0.045, 0.0425 - FOUND, 0.12);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.008, 16), mats.Dark);
      lid.userData.ownGeo = true;
      lid.position.set(OX + 0.045, 0.089 - FOUND, 0.12);
      g.add(tank, lid, box(mats.Metal, 0.006, TOP - 0.07, 0.006, OX + 0.008, (TOP + 0.09) / 2, 0.12), box(mats.Metal, 0.04, 0.006, 0.006, OX + 0.026, 0.092, 0.12));
      g.add(box(mats.Metal, 0.012, 0.012, 0.004, OX + 0.045, 0.014 - FOUND, 0.156));
      this.one(g);
      return 0.7;
    }
    if (id === 'pond') {
      const g = new THREE.Group();
      g.position.set(0.3, 0.003, 0.22);
      const water = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.004, 20), this.clear);
      water.userData.ownGeo = true;
      water.scale.set(1.25, 1, 1);
      const bed = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.003, 20), mats.SolarCell);
      bed.userData.ownGeo = true;
      bed.scale.set(1.25, 1, 1);
      bed.position.y = -0.001;
      g.add(bed, water);
      const rock = new THREE.SphereGeometry(1, 8, 6);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        const m = new THREE.Mesh(rock, mats.Stone);
        const r = rnd(0.008, 0.013);
        m.scale.set(r, r * 0.7, r);
        m.position.set(Math.cos(a) * 0.064, 0.003, Math.sin(a) * 0.051);
        g.add(m);
      }
      g.children[2].userData.ownGeo = true;
      const reed = new THREE.ConeGeometry(0.006, 0.05, 6);
      [[-0.05, -0.03], [-0.04, -0.045], [0.05, 0.035]].forEach(([x, z], i) => { const m = new THREE.Mesh(reed, mats.Sedum); m.position.set(x, 0.026, z); if (!i) m.userData.ownGeo = true; g.add(m); });
      g.add(box(mats.FlowerA, 0.012, 0.003, 0.012, 0.01, 0.004, 0.005));
      this.one(g, { site: true });
      return 0.7;
    }
    if (id === 'smart') {
      // What shows of a smart home: a lit panel by the door, sensors under the eaves, an antenna.
      const g = new THREE.Group();
      g.add(box(mats.Dark, 0.02, 0.028, 0.004, 0.058, 0.1, OZ + 0.002), box(mats.LampGlow, 0.014, 0.018, 0.002, 0.058, 0.1, OZ + 0.005));
      for (const sx of [-1, 1]) g.add(box(mats.Unit, 0.012, 0.01, 0.012, sx * (OX - 0.02), TOP - 0.012, OZ + 0.007), box(mats.LampGlow, 0.005, 0.004, 0.002, sx * (OX - 0.02), TOP - 0.013, OZ + 0.014));
      // an awning that drives out by itself over the right front window
      const awning = new THREE.Group();
      awning.position.set(0.144, 0.165, OZ + 0.004);
      awning.rotation.x = 0.5;
      for (let i = 0; i < 6; i++) awning.add(box(i % 2 ? mats.Frame : mats.Car, 0.0155, 0.004, 0.07, (i - 2.5) * 0.0155, 0, 0.035));
      awning.add(box(mats.Unit, 0.1, 0.01, 0.012, 0, 0.004, 0));
      g.add(awning);
      for (const sx of [-1, 1]) g.add(box(mats.Metal, 0.003, 0.003, 0.064, 0.144 + sx * 0.047, 0.148, OZ + 0.034));
      const top = this.roofTop ?? TOP;
      g.add(box(mats.Metal, 0.003, 0.06, 0.003, -OX + 0.03, top + 0.012, -0.06), box(mats.Metal, 0.03, 0.003, 0.003, -OX + 0.03, top + 0.036, -0.06), box(mats.LampGlow, 0.006, 0.006, 0.006, -OX + 0.03, top + 0.045, -0.06));
      this.one(g);
      return 0.6;
    }
    if (id === 'carport') {
      const g = new THREE.Group();
      g.position.set(0.48, 0.002, -0.02);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(mats.Slim, 0.008, 0.125, 0.008, sx * 0.095, 0.0625, sz * 0.15));
      g.add(box(mats.Dark, 0.23, 0.012, 0.36, 0, 0.131, 0));
      g.add(box(mats.Frame, 0.236, 0.005, 0.366, 0, 0.139, 0));
      this.one(g, { site: true, how: 'drop' });
      const car = new THREE.Group();
      car.position.set(0.48, 0.002, 0);
      car.add(box(mats.Car, 0.075, 0.026, 0.15, 0, 0.026, 0));
      car.add(box(this.glass, 0.064, 0.022, 0.075, 0, 0.05, -0.008));
      car.add(box(mats.Car, 0.066, 0.004, 0.07, 0, 0.062, -0.008));
      const wheel = new THREE.CylinderGeometry(0.013, 0.013, 0.012, 12).rotateZ(Math.PI / 2);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const w = new THREE.Mesh(wheel, mats.Dark); w.position.set(sx * 0.037, 0.013, sz * 0.047); car.add(w); }
      car.children[3].userData.ownGeo = true;
      for (const sx of [-1, 1]) car.add(box(mats.LampGlow, 0.014, 0.007, 0.003, sx * 0.024, 0.03, 0.0755));
      this.one(car, { site: true, delay: 0.55 });
      return 1.0;
    }
    if (id === 'conservatory') {
      const g = new THREE.Group();
      const w = 0.12;
      const d = 0.2;
      const h0 = 0.11;
      const h1 = 0.15;
      g.position.set(-OX - w / 2, 0, -0.07);
      g.add(box(mats.Stone, w, 0.006, d, 0, 0.003 - FOUND / 2, 0));
      g.add(box(this.clear, w, h0, 0.003, 0, h0 / 2, d / 2));
      g.add(box(this.clear, w, h0, 0.003, 0, h0 / 2, -d / 2));
      g.add(box(this.clear, 0.003, h0, d, -w / 2, h0 / 2, 0));
      const roof = box(this.clear, Math.hypot(w, h1 - h0) + 0.01, 0.003, d + 0.012, 0, (h0 + h1) / 2, 0);
      roof.rotation.z = -Math.atan2(h1 - h0, w);
      g.add(roof);
      for (const sz of [-1, 1]) {
        g.add(box(mats.Frame, 0.006, h0, 0.006, -w / 2, h0 / 2, (sz * d) / 2));
        g.add(box(mats.Frame, 0.006, h0, 0.006, 0, h0 / 2, (sz * d) / 2));
        g.add(box(mats.Frame, w, 0.006, 0.006, 0, h0, (sz * d) / 2));
        const rafter = box(mats.Frame, Math.hypot(w, h1 - h0), 0.006, 0.006, 0, (h0 + h1) / 2, (sz * d) / 2);
        rafter.rotation.z = roof.rotation.z;
        g.add(rafter);
      }
      g.add(box(mats.Frame, 0.006, 0.006, d, -w / 2, h0, 0));
      g.add(box(mats.Frame, 0.006, h0, 0.006, -w / 2, h0 / 2, 0));
      const plant = new THREE.Mesh(new THREE.SphereGeometry(0.024, 10, 8), mats.Leaf);
      plant.userData.ownGeo = true;
      plant.position.set(-0.01, 0.05, -0.05);
      g.add(plant, box(mats.Shutter, 0.022, 0.024, 0.022, -0.01, 0.014, -0.05));
      this.one(g);
      return 0.9;
    }
    if (id === 'solar') {
      const g = new THREE.Group();
      const panels = new THREE.Group();
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
        panels.add(box(mats.SolarCell, 0.058, 0.004, 0.04, (i - 1) * 0.062, 0, (j - 0.5) * 0.044));
      }
      panels.add(box(mats.Metal, 0.19, 0.002, 0.09, 0, -0.003, 0));
      const roof = this.chosen.roof;
      if (roof === 'green') {
        // On a flat roof the panels stand on a tilted rack.
        panels.position.set(0.09, TOP + 0.065, -0.02);
        panels.rotation.x = 0.5;
        g.add(box(mats.Metal, 0.004, 0.05, 0.004, 0.01, TOP + 0.06, -0.055), box(mats.Metal, 0.004, 0.05, 0.004, 0.17, TOP + 0.06, -0.055));
      } else if (roof === 'metal') {
        const ang = Math.atan2(0.088, 2 * OZ);
        panels.position.set(0.09, TOP + 0.074, 0.02);
        panels.rotation.x = ang;
      } else {
        const thatch = roof === 'thatch';
        const f = 0.5;
        const top = thatch ? RIDGE + 0.03 : RIDGE;
        panels.position.set(0.1, TOP + EY + (top - EY) * (1 - f) + (thatch ? 0.024 : 0.02), EZ * f + 0.004);
        panels.rotation.x = Math.atan2(top - EY, EZ);
      }
      g.add(panels);
      this.one(g, { how: 'drop', lift: 0.25 });
      return 0.9;
    }
    if (id === 'cellar') {
      // What shows of a cellar: light wells in front and the outside stairs at the side.
      const g = new THREE.Group();
      const y = -FOUND;
      for (const x of [-0.144]) {
        g.add(box(mats.Concrete, 0.074, 0.012, 0.032, x, y + 0.006, OZ + 0.026));
        g.add(box(mats.Slim, 0.062, 0.003, 0.022, x, y + 0.0125, OZ + 0.026));
        g.add(box(this.glass, 0.05, 0.012, 0.003, x, 0.004, OZ + 0.002));
      }
      // the outside stair: a pit along the front wall with steps going down, a railing, the cellar door
      const z = OZ + 0.05;
      const x0 = 0.215;
      g.add(box(mats.Dark, 0.17, 0.004, 0.06, x0, y + 0.002, z));
      for (let i = 0; i < 5; i++) { const st = box(i > 2 ? mats.Concrete : mats.ConcreteWall, 0.028, 0.004, 0.056, x0 + 0.062 - i * 0.03, y + 0.012 - i * 0.002, z); g.add(st); }
      for (const dz of [-1, 1]) g.add(box(mats.Concrete, 0.19, 0.018, 0.01, x0, y + 0.009, z + dz * 0.035));
      g.add(box(mats.Concrete, 0.01, 0.018, 0.08, x0 - 0.09, y + 0.009, z));
      g.add(box(mats.Metal, 0.18, 0.004, 0.004, x0, y + 0.052, z + 0.035));
      for (const dx of [-0.085, 0, 0.085]) g.add(box(mats.Metal, 0.004, 0.036, 0.004, x0 + dx, y + 0.034, z + 0.035));
      g.add(box(mats.Door, 0.004, 0.05, 0.046, x0 - 0.084, y + 0.03, z));
      // a plinth with cellar windows along the front
      g.add(box(mats.ConcreteWall, 2 * OX + 0.012, 0.012, 0.008, 0, 0.002, OZ + 0.004));
      this.one(g);
      return 0.9;
    }
    // An extra room at the side, in the material of the walls, with a flat roof.
    const walls = this.chosen.walls;
    const mat = { brick: mats.BrickClay, concrete: mats.ConcreteWall, wood: mats.Plank }[walls] ?? mats.Plaster;
    const g = new THREE.Group();
    const w = 0.17;
    const d = 0.19;
    const h = 0.15;
    g.position.set(-OX - w / 2, 0, -0.07);
    g.add(box(mats.Concrete, w + 0.01, FOUND, d + 0.02, -0.005, -FOUND / 2, 0));
    g.add(box(mat, w, h, d, 0, h / 2, 0));
    if (walls === 'brick' || walls === 'wood') for (let i = 1; i < 5; i++) g.add(box(walls === 'brick' ? mats.Quoin : mats.Beam, w + 0.002, 0.002, d + 0.002, 0, i * H, 0));
    if (walls === 'timber' || walls === 'wood' || !walls) {
      for (const sz of [-1, 1]) g.add(box(mats.Beam, 0.012, h, 0.012, -w / 2, h / 2, (sz * d) / 2));
      if (walls === 'timber') { g.add(box(mats.Beam, w + 0.004, 0.012, d + 0.004, 0, 0.006, 0)); g.add(box(mats.Beam, w + 0.004, 0.012, d + 0.004, 0, h - 0.006, 0)); g.add(box(mats.Beam, w + 0.004, 0.01, d + 0.004, 0, 2 * H, 0)); }
    }
    const roof = this.M.make('AnnexRoof');
    if (roof) { roof.position.set(-0.005, h, 0); roof.scale.set(0.9, 1, 0.9); g.add(roof); }
    for (const [x, z, ry] of [[0, d / 2, 0], [-w / 2, 0, -Math.PI / 2]]) {
      const win = this.M.make('Window');
      if (win) { win.position.set(x, 0.085, z - (ry ? 0 : 0.012)); if (ry) win.position.x += 0.012; win.rotation.y = ry; g.add(win); }
    }
    this.one(g, { how: 'drop' });
    return 1.0;
  }

  // ---------- garden ----------

  /**
   * What every garden has at the front: a small terrace at the left (stone slabs, a wooden deck
   * or concrete slabs, with a table, two chairs and a potted plant), a bed under the right
   * window, edging stones along the path to the gate and two low path lights.
   */
  frontGarden(id) {
    const y = 0.002;
    const S = { site: true };
    const x0 = -0.245;
    const x1 = -0.095;
    const z0 = HOUSE_Z + OZ + 0.036;
    const z1 = z0 + 0.064;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const d = 0.1;
    if (id === 'picket') {
      for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) this.b('Stone', x0 + (i + 0.5) * ((x1 - x0) / 4), y + 0.002, z0 + (j + 0.5) * ((z1 - z0) / 2), (x1 - x0) / 4 - 0.0025, 0.005, (z1 - z0) / 2 - 0.0025, { ...S, tint: rnd(0.86, 1.04), delay: d + (i + j) * 0.04 });
    } else if (id === 'gravel') {
      for (let i = 0; i < 3; i++) this.b('ConcreteWall', x0 + (i + 0.5) * ((x1 - x0) / 3), y + 0.002, cz, (x1 - x0) / 3 - 0.003, 0.005, z1 - z0, { ...S, tint: rnd(0.92, 1.03), delay: d + i * 0.05 });
    } else {
      // a deck: boards on two dark joists
      for (const z of [z0 + 0.012, z1 - 0.012]) this.b('WoodDark', cx, y + 0.002, z, x1 - x0, 0.004, 0.008, { ...S, delay: d });
      const n = 6;
      for (let i = 0; i < n; i++) this.b('Plank', cx, y + 0.0055, z0 + (i + 0.5) * ((z1 - z0) / n), x1 - x0 + 0.004, 0.003, (z1 - z0) / n - 0.0018, { ...S, tint: rnd(0.82, 1.05), delay: d + 0.1 + i * 0.03 });
    }
    // a table and two chairs (metal for the modern gravel garden, wood otherwise)
    const fm = id === 'gravel' ? 'Slim' : 'Wood';
    const fo = { ...S, delay: 0.45 };
    const top = y + 0.008;
    this.b(fm, cx, top + 0.022, cz, 0.036, 0.0035, 0.03, fo);
    this.b('Slim', cx, top + 0.011, cz, 0.004, 0.021, 0.004, fo);
    this.b('Slim', cx, top + 0.0015, cz, 0.016, 0.003, 0.016, fo);
    for (const sx of [-1, 1]) {
      const x = cx + sx * 0.034;
      this.b(fm, x, top + 0.013, cz, 0.016, 0.003, 0.016, fo);
      this.b(fm, x + sx * 0.007, top + 0.023, cz, 0.003, 0.018, 0.016, fo);
      for (const dz of [-0.006, 0.006]) this.b('Slim', x - sx * 0.006, top + 0.006, cz + dz, 0.0025, 0.012, 0.0025, fo);
      this.b('Slim', x + sx * 0.006, top + 0.0065, cz, 0.0025, 0.013, 0.012, fo);
    }
    // a potted plant at the corner of the terrace
    this.b('WoodDark', x0 + 0.012, top + 0.008, z1 - 0.01, 0.016, 0.016, 0.016, { ...S, delay: 0.5 });
    this.balls('Leaf', [{ x: x0 + 0.012, y: top + 0.025, z: z1 - 0.01, sx: 0.014, sy: 0.016, sz: 0.014, delay: 0.55 }, { x: x0 + 0.016, y: top + 0.036, z: z1 - 0.013, sx: 0.008, sy: 0.009, sz: 0.008, delay: 0.6 }]);
    // the bed under the right window: soil with an edge, shrubs (grasses in the gravel garden)
    const bz = HOUSE_Z + OZ + 0.025;
    const gravel = id === 'gravel';
    this.b(gravel ? 'Pebble' : 'Soil', 0.114, y + 0.003, bz, 0.104, 0.006, 0.03, { ...S, delay: 0.15 });
    this.b('Sill', 0.114, y + 0.004, bz + 0.017, 0.11, 0.008, 0.004, { ...S, delay: 0.15 });
    if (gravel) {
      for (const [x, h] of [[0.078, 0.034], [0.112, 0.042], [0.146, 0.03]]) this.b('Sedum', x, y + h / 2, bz, 0.006, h, 0.006, { ...S, how: 'grow', delay: 0.3 });
      this.balls('Stone', [{ x: 0.095, y: y + 0.006, z: bz + 0.004, sx: 0.01, sy: 0.006, sz: 0.008, delay: 0.3 }, { x: 0.13, y: y + 0.006, z: bz - 0.004, sx: 0.008, sy: 0.005, sz: 0.007, delay: 0.32 }]);
    } else {
      this.balls('LeafDark', [[0.078, 0.016], [0.114, 0.019], [0.15, 0.015]].map(([x, r], i) => ({ x, y: y + 0.006 + r * 0.7, z: bz - 0.002, sx: r, sy: r * 0.95, sz: r * 0.9, delay: 0.3 + i * 0.06, tint: rnd(0.9, 1.1) })));
    }
    // edging stones along both sides of the path, and two low path lights
    const pz0 = HOUSE_Z + OZ + 0.034;
    const n = 9;
    const step = (FENCE_Z - 0.012 - pz0) / n;
    for (const sx of [-1, 1]) {
      for (let i = 0; i < n; i++) this.b('Sill', sx * 0.037, y + 0.003, pz0 + (i + 0.5) * step, 0.0065, 0.008, step - 0.0022, { ...S, tint: rnd(0.88, 1.02), delay: 0.2 + i * 0.03 });
      const lz = FENCE_Z - 0.06;
      this.b('Slim', sx * 0.05, y + 0.015, lz, 0.007, 0.03, 0.007, { ...S, how: 'grow', delay: 0.6 });
      this.b('LampGlow', sx * 0.05, y + 0.0325, lz, 0.0085, 0.005, 0.0085, { ...S, delay: 0.7 });
      this.b('Slim', sx * 0.05, y + 0.0365, lz, 0.011, 0.003, 0.011, { ...S, delay: 0.7 });
    }
  }

  /** A bicycle leaning at the front wall (two wheels, a frame, a saddle). */
  bicycle() {
    const mats = this.M.mats;
    const g = new THREE.Group();
    const wheel = new THREE.TorusGeometry(0.02, 0.0028, 6, 16);
    for (const dx of [-0.028, 0.028]) { const w = new THREE.Mesh(wheel, mats.Dark); w.position.set(dx, 0.022, 0); g.add(w); }
    g.children[0].userData.ownGeo = true;
    const bar = (x, y, len, rz) => { const b = box(mats.Car, len, 0.004, 0.004, x, y, 0); b.rotation.z = rz; g.add(b); };
    bar(0, 0.034, 0.044, 0.5);
    bar(-0.004, 0.047, 0.036, 0);
    bar(-0.014, 0.034, 0.03, -1.0);
    bar(0.024, 0.04, 0.036, 1.25);
    g.add(box(mats.Dark, 0.014, 0.004, 0.008, -0.022, 0.052, 0), box(mats.Dark, 0.004, 0.004, 0.026, 0.032, 0.058, 0));
    g.position.set(0.215, 0.002, HOUSE_Z + OZ + 0.014);
    g.rotation.set(0.16, 0.12, 0);
    return g;
  }

  build_garden(id) {
    const mats = this.M.mats;
    this.showGarden(id);
    if (id !== 'gravel') this.one(this.bicycle(), { site: true, delay: 0.7 });
    const y = 0.002;
    const flowers = (n, x0, x1, z0, z1, delay) => {
      for (let i = 0; i < n; i++) this.b(i % 2 ? 'FlowerA' : 'FlowerB', rnd(x0, x1), y + 0.009, rnd(z0, z1), 0.011, 0.011, 0.011, { site: true, delay: delay + Math.random() * 0.4, yaw: Math.random() });
    };
    this.frontGarden(id);
    if (id === 'picket') {
      // The white picket fence and the shrubs are the plot's own; flowers in the bed along the house.
      flowers(8, 0.07, 0.16, HOUSE_Z + OZ + 0.014, HOUSE_Z + OZ + 0.036, 0.3);
      return 0.9;
    }
    if (id === 'hedge') {
      let k = 0;
      const chunk = (x, z, alongX) => {
        const hh = rnd(0.05, 0.062);
        this.b('Hedge', x, y + hh / 2, z, alongX ? 0.062 : 0.034, hh, alongX ? 0.034 : 0.062, { site: true, how: 'grow', delay: k++ * 0.035, dur: 0.35, tint: rnd(0.85, 1.1) });
      };
      for (const [x0, x1] of FENCE_RUNS) for (let x = x0 + 0.03; x < x1; x += 0.06) chunk(x, FENCE_Z, true);
      for (let z = FENCE_Z - 0.06; z > -0.12; z -= 0.06) chunk(-0.47, z, false);
      flowers(10, 0.07, 0.3, 0.22, 0.33, 0.5);
      flowers(8, -0.33, -0.1, 0.27, 0.34, 0.5);
      return 1.1;
    }
    if (id === 'gravel') {
      this.b('Pebble', -0.06, y + 0.001, 0.255, 0.76, 0.004, 0.18, { site: true, how: 'grow', dur: 0.3 });
      this.b('Pebble', -0.385, y + 0.001, -0.02, 0.15, 0.004, 0.38, { site: true, how: 'grow', dur: 0.3 });
      const g = new THREE.Group();
      const rock = new THREE.SphereGeometry(1, 9, 7);
      [[-0.36, 0.26, 0.034], [-0.3, 0.3, 0.02], [0.2, 0.29, 0.03], [-0.4, 0.02, 0.026], [0.26, 0.24, 0.018]].forEach(([x, z, r]) => {
        const m = new THREE.Mesh(rock, mats.Stone);
        m.scale.set(r * 1.2, r * 0.7, r);
        m.position.set(x, y + r * 0.4, z);
        g.add(m);
      });
      g.children[0].userData.ownGeo = true;
      const tuft = new THREE.ConeGeometry(0.014, 0.05, 7);
      [[-0.2, 0.28], [0.14, 0.3], [-0.41, 0.16]].forEach(([x, z], i) => { const m = new THREE.Mesh(tuft, mats.Sedum); m.position.set(x, y + 0.027, z); g.add(m); if (!i) m.userData.ownGeo = true; });
      this.one(g, { site: true, delay: 0.3 });
      let k = 0;
      for (const [x0, x1] of FENCE_RUNS) {
        for (let x = x0; x <= x1 + 0.001; x += (x1 - x0) / Math.round((x1 - x0) / 0.035)) this.b('Slim', x, y + 0.03, FENCE_Z, 0.004, 0.06, 0.004, { site: true, how: 'grow', delay: 0.4 + k++ * 0.02 });
        for (const yy of [0.012, 0.056]) this.b('Slim', (x0 + x1) / 2, y + yy, FENCE_Z, x1 - x0 + 0.006, 0.004, 0.005, { site: true, delay: 0.5 });
      }
      return 1.1;
    }
    // A lawn to play on: a sandbox, a swing, a low wooden fence.
    const g = new THREE.Group();
    const sx = -0.2;
    const sz = 0.305;
    g.add(box(mats.Sand, 0.082, 0.008, 0.074, sx, y + 0.006, sz));
    for (const [dx, dz, w, d] of [[0, 0.042, 0.1, 0.01], [0, -0.042, 0.1, 0.01], [0.046, 0, 0.01, 0.084], [-0.046, 0, 0.01, 0.084]]) g.add(box(mats.Wood, w, 0.016, d, sx + dx, y + 0.008, sz + dz));
    g.add(box(mats.FlowerA, 0.016, 0.014, 0.016, sx + 0.015, y + 0.02, sz - 0.01), box(mats.Mailbox, 0.02, 0.006, 0.008, sx - 0.02, y + 0.014, sz + 0.02));
    const wx = 0.1;
    for (const s of [-1, 1]) for (const f of [-1, 1]) {
      const leg = box(mats.Beam, 0.007, 0.105, 0.007, wx + s * 0.05, y + 0.05, 0.27 + f * 0.022);
      leg.rotation.x = -f * 0.42;
      g.add(leg);
    }
    g.add(box(mats.Beam, 0.115, 0.008, 0.008, wx, y + 0.098, 0.27));
    for (const s of [-1, 1]) g.add(box(mats.Dark, 0.002, 0.066, 0.002, wx + s * 0.015, y + 0.063, 0.27));
    g.add(box(mats.FlowerB, 0.04, 0.005, 0.016, wx, y + 0.03, 0.27));
    this.one(g, { site: true, delay: 0.2 });
    let k = 0;
    for (const [x0, x1] of FENCE_RUNS) {
      for (let x = x0; x <= x1 + 0.001; x += (x1 - x0) / Math.round((x1 - x0) / 0.07)) this.b('Plank', x, y + 0.02, FENCE_Z, 0.01, 0.04, 0.008, { site: true, how: 'grow', delay: 0.3 + k++ * 0.03 });
      this.b('Plank', (x0 + x1) / 2, y + 0.027, FENCE_Z - 0.005, x1 - x0 + 0.01, 0.007, 0.004, { site: true, delay: 0.6 });
    }
    return 1.1;
  }
}

/** Where the crane's slings hold a roof (house-local, relative to the roof's origin on the wall tops). */
export const ROOF_SLINGS = [new THREE.Vector3(-0.2, 0, 0), new THREE.Vector3(0.2, 0, 0)];
