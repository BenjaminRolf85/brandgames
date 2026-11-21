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
import { L, H, D, GAP, TOP, XH, ZH, OX, OZ, RIDGE, EAVE, FOUND, HOUSE_Z, WALLS, CORNERS, brickPieces, wallBoxes, openings } from './bricks-plan.js';

/** The model's materials use vertex colors (baked shading): plain geometry gets white ones. */
function white(geo) {
  if (!geo.attributes.color) geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3).fill(1), 3));
  return geo;
}
const UNIT = white(new THREE.BoxGeometry(1, 1, 1));
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
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

/** Merges non-indexed geometries that all have position, normal and color into one. */
function mergeGeometries(geos) {
  const out = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'color']) {
    const arr = new Float32Array(geos.reduce((n, g) => n + g.attributes[name].count * 3, 0));
    let at = 0;
    for (const g of geos) { arr.set(g.attributes[name].array, at); at += g.attributes[name].count * 3; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, 3));
  }
  return out;
}

/** A plain box mesh. */
function box(mat, sx, sy, sz, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(UNIT, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  return m;
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

export class House {
  /**
   * plotRoot: the group the plot stands in (plot-local space); M: the loaded model
   * (bricks-visuals.js). cast: the house throws shadows; calm: gentle animations.
   */
  constructor(plotRoot, M, { cast = true, calm = false } = {}) {
    this.M = M;
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
    this.parts = {}; // decision -> { groups, bits, singles, geos }
    this.chosen = {};
    this.extras = new Set();
    this.smokeAt = null; // house-local point where chimney smoke rises (wood stove)
    this.changed = 0; // counts up while something moves (for the frozen shadow map)
    this.showGarden(null);
  }

  // ---------- the plot's own garden parts ----------

  showGarden(kind) {
    const show = new Set(kind ? GARDEN_BASE : SITE_ONLY);
    if (kind === 'picket') ['Fence', 'LampGlow', ...GREEN].forEach((n) => show.add(n));
    if (kind === 'hedge' || kind === 'playlawn') ['LampGlow', ...GREEN].forEach((n) => show.add(n));
    for (const n of [...GARDEN_ALL, ...SITE_ONLY]) { const m = this.plotMeshes.get(n); if (m) m.visible = show.has(n); }
    this.firVisible = !!kind && kind !== 'gravel';
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
    shadows(obj, this.cast);
    this.cur.singles.push({ obj, t: -delay, how, base: obj.scale.clone(), y: obj.position.y, lift, done: false });
    obj.visible = false;
    return obj;
  }

  flush(geos = null) {
    for (const [key, items] of this.cur.pending) {
      const [where, mat] = key.split('|');
      const geo = geos?.[mat] ?? UNIT;
      this.cur.bits.push(new Bits(where === 's' ? this.cur.site : this.cur.home, geo, this.M.mats[mat] ?? this.M.mats.Concrete, items, this.cast));
    }
    this.cur.pending.clear();
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
    return busy;
  }

  /**
   * A part that stands still becomes one mesh per material (fewer draw calls): all its single
   * meshes are merged in place. Things that move later (the door) are marked noBake.
   */
  bake(part) {
    for (const g of [part.home, part.site]) {
      g.updateMatrixWorld(true);
      const inv = g.matrixWorld.clone().invert();
      const by = new Map();
      const dead = [];
      g.traverse((o) => {
        if (!o.isMesh || o.isInstancedMesh || !o.visible) return;
        for (let q = o; q && q !== g; q = q.parent) if (q.userData.noBake) return;
        let geo = o.geometry.clone();
        if (geo.index) { const flat = geo.toNonIndexed(); geo.dispose(); geo = flat; }
        for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'color'].includes(name)) geo.deleteAttribute(name);
        if (!geo.attributes.normal) geo.computeVertexNormals();
        white(geo);
        // Plain float attributes (the model's may be packed).
        for (const name of ['position', 'normal', 'color']) {
          const src = geo.attributes[name];
          if (src.itemSize === 3 && !src.normalized && src.array instanceof Float32Array && !src.isInterleavedBufferAttribute) continue;
          const arr = new Float32Array(src.count * 3);
          for (let i = 0; i < src.count; i++) { arr[i * 3] = src.getX(i); arr[i * 3 + 1] = src.getY(i); arr[i * 3 + 2] = src.getZ(i); }
          geo.setAttribute(name, new THREE.BufferAttribute(arr, 3));
        }
        geo.applyMatrix4(_m.multiplyMatrices(inv, o.matrixWorld));
        (by.get(o.material) ?? by.set(o.material, []).get(o.material)).push(geo);
        dead.push(o);
      });
      for (const o of dead) { if (o.userData.ownGeo) o.geometry.dispose(); o.removeFromParent(); }
      for (const [mat, geos] of by) {
        const merged = geos.length > 1 ? mergeGeometries(geos) : geos[0];
        if (geos.length > 1) geos.forEach((x) => x.dispose());
        if (!merged) continue;
        const m = new THREE.Mesh(merged, mat);
        m.userData.ownGeo = true;
        m.castShadow = this.cast;
        m.receiveShadow = true;
        g.add(m);
      }
    }
  }

  /** The windows light up (k: 0..1 times the scene's glow boost). */
  lights(v) { this.glass.emissiveIntensity = v; }

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
      const G = this.M.geo;
      this.cur.bits.push(new Bits(this.cur.home, G.brick, this.M.mats.BrickClay, by.full, this.cast));
      this.cur.bits.push(new Bits(this.cur.home, G.half, this.M.mats.BrickClay, by.half, this.cast));
      this.cur.bits.push(new Bits(this.cur.home, G.quoin, this.M.mats.Quoin, by.post, this.cast));
      return 1.2;
    }
    if (id === 'concrete') {
      for (const w of boxes) {
        this.b('ConcreteWall', w.x, w.y, w.z, w.len, w.h, D, { yaw: w.yaw, how: 'drop', delay: w.wall * 0.2, dur: 0.45 });
        if (w.part === 'col') this.b('Dark', w.x, TOP * 0.52, w.z, w.len, 0.0025, D + 0.002, { yaw: w.yaw, how: 'drop', delay: w.wall * 0.2, dur: 0.45 });
      }
      posts('ConcreteWall', 'drop', 0.75);
      return 1.3;
    }
    if (id === 'wood') {
      for (const w of boxes) {
        const n = Math.max(1, Math.round(w.h / H));
        for (let i = 0; i < n; i++) {
          const y = w.y - w.h / 2 + ((i + 0.5) * w.h) / n;
          this.b('Plank', w.x, y, w.z, w.len - 0.0005, w.h / n - 0.002, D, { yaw: w.yaw, tint: rnd(0.82, 1.1), delay: Math.floor(y / H) * 0.11 + Math.random() * 0.06 });
        }
      }
      posts('Beam', 'grow');
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
      if (roof) g.add(roof);
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
        for (const f of [0.02, 0.3, 0.56, 0.8]) {
          const strip = box(mats.ThatchDark, 2 * RX + 0.012, 0.006, f < 0.1 ? 0.03 : 0.014, 0, y0 + (y1 - y0) * f + 0.002, side * (z0 + (z1 - z0) * f));
          strip.rotation.x = side * slope;
          g.add(strip);
        }
      }
      for (const sx of [-1, 1]) { const tri = prism([[-OZ, 0], [OZ, 0], [0, RIDGE]], D, mats.Plaster); tri.position.x = sx * XH; g.add(tri); }
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
      for (const sx of [-1, 1]) { const w = prism([[-OZ, 0], [OZ, 0], [OZ, y0 - 0.004], [-OZ, y1 - 0.004]], D, wallMat); w.position.x = sx * XH; g.add(w); }
      g.add(box(wallMat, 2 * XH - D, y1 - 0.006, D, 0, (y1 - 0.006) / 2, -ZH));
      g.add(box(mats.Slim, 2 * XH - D - 0.06, 0.03, D + 0.004, 0, 0.045, -ZH));
    }
    this.one(g, { how: held ? 'pop' : 'drop', lift: 0.35 });
    if (held) { const s = this.cur.singles[this.cur.singles.length - 1]; s.done = true; g.visible = true; }
    this.roofTop = id === 'tiles' || id === 'thatch' ? TOP + RIDGE + 0.03 : id === 'metal' ? TOP + 0.11 : TOP + 0.04;
    return 1.0;
  }

  // ---------- windows ----------

  build_windows(id) {
    const mats = this.M.mats;
    openings().filter((o) => o.kind === 'window').forEach((o, i) => {
      const g = new THREE.Group();
      g.position.set(o.x, o.y, o.z);
      g.rotation.y = o.face;
      if (id === 'panorama') {
        // Floor-to-lintel glazing in a slim dark frame, set in front of the wall.
        const w = 0.116;
        const h = 0.144;
        const y = 0.084 - o.y;
        const z = D / 2 + 0.003;
        g.add(box(this.glass, w, h, 0.004, 0, y, z));
        for (const sx of [-1, 1]) g.add(box(mats.Slim, 0.006, h + 0.006, 0.008, (sx * w) / 2, y, z));
        for (const sy of [-1, 1]) g.add(box(mats.Slim, w + 0.006, 0.006, 0.008, 0, y + (sy * h) / 2, z));
        g.add(box(mats.Slim, 0.004, h, 0.007, 0, y, z));
      } else {
        const win = this.M.make('Window');
        if (win) {
          if (id === 'woodwin') win.traverse((m) => { if (m.isMesh && m.material.name === 'Frame') m.material = mats.Plank; else if (m.isMesh && m.material.name === 'Concrete') m.material = mats.Beam; });
          g.add(win);
        }
        if (id === 'lattice') {
          g.add(box(mats.Frame, 0.0035, 0.078, 0.003, 0, 0, 0.0065));
          g.add(box(mats.Frame, 0.06, 0.0035, 0.003, 0, 0.012, 0.0065));
          for (const sx of [-1, 1]) {
            g.add(box(mats.Shutter, 0.028, 0.09, 0.005, sx * 0.052, 0, D / 2 + 0.001));
            g.add(box(mats.Frame, 0.02, 0.003, 0.006, sx * 0.052, 0.02, D / 2 + 0.002));
            g.add(box(mats.Frame, 0.02, 0.003, 0.006, sx * 0.052, -0.02, D / 2 + 0.002));
          }
        }
      }
      this.one(g, { delay: i * 0.1 });
    });
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
    if (extra.children.length) this.one(extra, { delay: 0.3 });
    return 0.8;
  }

  /** The door swings open and warm light shows behind it (k: 0..1). */
  openDoor(k) {
    if (this.doorPivot) this.doorPivot.rotation.y = 1.15 * k;
    if (this.doorGlow) this.doorGlow.material.opacity = 0.85 * k;
  }

  // ---------- heating ----------

  build_heating(id) {
    const mats = this.M.mats;
    const g = new THREE.Group();
    const x = OX + 0.05;
    if (id === 'heatpump') {
      g.add(box(mats.Concrete, 0.085, 0.006, 0.055, x, 0.003 - FOUND, 0.09));
      g.add(box(mats.Unit, 0.074, 0.058, 0.04, x, 0.035 - FOUND, 0.09));
      const fan = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.004, 20).rotateX(Math.PI / 2), mats.Dark);
      fan.userData.ownGeo = true;
      fan.position.set(x - 0.008, 0.037 - FOUND, 0.111);
      g.add(fan);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.003, 6, 20), mats.Slim);
      ring.userData.ownGeo = true;
      ring.position.set(x - 0.008, 0.037 - FOUND, 0.112);
      g.add(ring);
      g.add(box(mats.Slim, 0.016, 0.006, 0.003, x + 0.024, 0.052 - FOUND, 0.111));
      g.add(box(mats.Metal, 0.03, 0.006, 0.006, OX + 0.012, 0.03 - FOUND, 0.075));
    } else if (id === 'gas') {
      g.add(box(mats.GasBox, 0.02, 0.05, 0.04, OX + 0.01, 0.05, 0.1));
      g.add(box(mats.Dark, 0.004, 0.012, 0.02, OX + 0.021, 0.055, 0.1));
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, TOP + 0.09, 10), mats.Metal);
      pipe.userData.ownGeo = true;
      pipe.position.set(OX + 0.012, (TOP + 0.09) / 2, 0.02);
      g.add(pipe);
      g.add(box(mats.Metal, 0.022, 0.005, 0.022, OX + 0.012, TOP + 0.092, 0.02));
      g.add(box(mats.GasBox, 0.006, 0.006, 0.07, OX + 0.012, 0.03, 0.06));
    } else {
      // A wood stove: its chimney on the outside wall and a stack of firewood.
      const top = TOP + RIDGE + 0.05;
      g.add(box(mats.BrickClay, 0.05, top + FOUND, 0.05, OX + 0.025, (top - FOUND) / 2, -0.07));
      g.add(box(mats.Concrete, 0.062, 0.008, 0.062, OX + 0.025, top + 0.004, -0.07));
      const log = new THREE.CylinderGeometry(0.009, 0.009, 0.05, 8).rotateZ(Math.PI / 2);
      [[0, 0], [1, 0], [2, 0], [3, 0], [0.5, 1], [1.5, 1], [2.5, 1], [1, 2], [2, 2]].forEach(([i, j], n) => {
        const m = new THREE.Mesh(log, n % 2 ? mats.Bark : mats.Wood);
        m.position.set(OX + 0.03, 0.009 - FOUND + j * 0.016, 0.05 + i * 0.019);
        g.add(m);
      });
      g.children[2].userData.ownGeo = true;
      this.smokeAt = new THREE.Vector3(OX + 0.025, top + 0.02, -0.07);
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
      tank.position.set(OX + 0.045, 0.0425 - FOUND, -0.14);
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.008, 16), mats.Dark);
      lid.userData.ownGeo = true;
      lid.position.set(OX + 0.045, 0.089 - FOUND, -0.14);
      g.add(tank, lid, box(mats.Metal, 0.006, TOP - 0.07, 0.006, OX + 0.008, (TOP + 0.09) / 2, -0.14), box(mats.Metal, 0.04, 0.006, 0.006, OX + 0.026, 0.092, -0.14));
      g.add(box(mats.Metal, 0.004, 0.012, 0.012, OX + 0.045, 0.014 - FOUND, -0.105));
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
      g.position.set(-OX - w / 2, 0, 0.01);
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
      for (const x of [-0.144, 0.144]) {
        g.add(box(mats.Concrete, 0.074, 0.012, 0.032, x, y + 0.006, OZ + 0.026));
        g.add(box(mats.Slim, 0.062, 0.003, 0.022, x, y + 0.0125, OZ + 0.026));
        g.add(box(this.glass, 0.05, 0.012, 0.003, x, 0.004, OZ + 0.002));
      }
      const sx = -OX - 0.06;
      g.add(box(mats.Dark, 0.07, 0.004, 0.16, sx, y + 0.002, -0.02));
      for (let i = 0; i < 5; i++) g.add(box(mats.ConcreteWall, 0.066, 0.004, 0.026, sx, y + 0.011 - i * 0.002, 0.045 - i * 0.03)).material = i > 2 ? mats.Concrete : mats.ConcreteWall;
      for (const s of [-1, 1]) g.add(box(mats.Concrete, 0.01, 0.016, 0.17, sx + s * 0.04, y + 0.008, -0.02));
      g.add(box(mats.Concrete, 0.09, 0.016, 0.01, sx, y + 0.008, -0.105));
      g.add(box(mats.Metal, 0.004, 0.004, 0.17, sx - 0.04, y + 0.05, -0.02));
      for (const z of [-0.1, -0.02, 0.06]) g.add(box(mats.Metal, 0.004, 0.036, 0.004, sx - 0.04, y + 0.032, z));
      g.add(box(mats.Door, 0.05, 0.05, 0.004, sx, y + 0.03, -0.098));
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
    g.position.set(-OX - w / 2, 0, 0);
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

  build_garden(id) {
    const mats = this.M.mats;
    this.showGarden(id);
    const y = 0.002;
    const flowers = (n, x0, x1, z0, z1, delay) => {
      for (let i = 0; i < n; i++) this.b(i % 2 ? 'FlowerA' : 'FlowerB', rnd(x0, x1), y + 0.009, rnd(z0, z1), 0.011, 0.011, 0.011, { site: true, delay: delay + Math.random() * 0.4, yaw: Math.random() });
    };
    if (id === 'picket') {
      // The white picket fence and the shrubs are the plot's own; flower beds along the house.
      for (const [x0, x1] of [[-0.24, -0.06], [0.06, 0.24]]) {
        this.b('Soil', (x0 + x1) / 2, y + 0.002, HOUSE_Z + OZ + 0.04, x1 - x0, 0.006, 0.035, { site: true, delay: 0.1 });
        flowers(9, x0 + 0.01, x1 - 0.01, HOUSE_Z + OZ + 0.03, HOUSE_Z + OZ + 0.05, 0.3);
      }
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
      flowers(22, -0.42, 0.3, 0.2, 0.33, 0.5);
      return 1.1;
    }
    if (id === 'gravel') {
      this.b('Pebble', -0.07, y + 0.001, 0.268, 0.78, 0.004, 0.2, { site: true, how: 'grow', dur: 0.3 });
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
    const sx = -0.22;
    const sz = 0.27;
    g.add(box(mats.Sand, 0.1, 0.008, 0.1, sx, y + 0.006, sz));
    for (const [dx, dz, w, d] of [[0, 0.055, 0.12, 0.012], [0, -0.055, 0.12, 0.012], [0.055, 0, 0.012, 0.12], [-0.055, 0, 0.012, 0.12]]) g.add(box(mats.Wood, w, 0.016, d, sx + dx, y + 0.008, sz + dz));
    g.add(box(mats.FlowerA, 0.016, 0.014, 0.016, sx + 0.015, y + 0.02, sz - 0.01), box(mats.Mailbox, 0.02, 0.006, 0.008, sx - 0.02, y + 0.014, sz + 0.02));
    const wx = 0.14;
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
