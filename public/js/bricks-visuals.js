// "Stein auf Stein": the 3D parts. The Blender model (blender/build_bricks.py,
// assets/models/bricks.glb) recolored from the --xr-bricks-* tokens; the pieces of a house
// (instanced bricks, half bricks and sandstone corners; frames, lintels and roof trusses as single
// models) with wobbling and skewed pieces; the ghost plan (blueprint lines, glowing places for the
// item in hand, amber where it would wobble, the place it snaps to); the tower crane; mortar puffs
// and chimney smoke; the neighbor family; a few sounds of its own. The 2D drawings (chart, cards)
// are in bricks-panels.js.
import * as THREE from 'three';
import { loadGLTF } from './models.js';
import { hex, color, num, font } from './tokens.js';
import { radialTexture } from './robot-visuals.js';
import { audioContext } from './sfx.js';
import { winterize } from './snow.js';
import { L, H, D, GAP, TOP, OX, OZ, RIDGE, EAVE, WALLS, ANNEX_COURSES, XA, ZA } from './bricks-plan.js';

export const BRICKS_URL = 'assets/models/bricks.glb';

// Blender material name -> [token, roughness, metalness, extra]
const MATS = {
  BrickClay: ['xr-bricks-clay', 0.88, 0],
  BrickGold: ['xr-bricks-gold', 0.24, 1, { emissive: 'xr-bricks-gold', emissiveIntensity: 0.22 }],
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
  Belt: ['xr-bricks-belt', 0.8, 0],
  Machine: ['xr-bricks-machine', 0.4, 0.2],
  MachineTrim: ['xr-bricks-machine-trim', 0.35, 0.3],
  Bag: ['xr-bricks-bag', 0.85, 0],
  BagHandle: ['xr-bricks-bag-handle', 0.7, 0],
  Quoin: ['xr-bricks-quoin', 0.85, 0],
  SolarCell: ['xr-bricks-solar', 0.15, 0.4],
};
// Materials that get snow in winter (everything facing up in the garden, and the roof).
const SNOWY = ['Grass', 'GrassDark', 'Leaf', 'LeafDark', 'Fence', 'Stone', 'Sand', 'Soil', 'Roof', 'RoofDark', 'Mailbox', 'Bark'];

export function bricksMaterials() {
  const out = {};
  for (const [name, [token, roughness, metalness, extra = {}]] of Object.entries(MATS)) {
    const opts = { name, color: hex(token), roughness, metalness, vertexColors: true };
    if (extra.emissive) Object.assign(opts, { emissive: hex(extra.emissive), emissiveIntensity: extra.emissiveIntensity });
    out[name] = new THREE.MeshStandardMaterial(opts);
    if (SNOWY.includes(name)) winterize(out[name]);
  }
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

// ---------- the pieces of a house ----------

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const AX = new THREE.Vector3(1, 0, 0);
const AZ = new THREE.Vector3(0, 0, 1);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

function instanced(geo, mat, n, vary) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
  m.castShadow = true;
  m.receiveShadow = true;
  m.frustumCulled = false;
  const c = new THREE.Color();
  for (let i = 0; i < m.count; i++) {
    m.setMatrixAt(i, ZERO);
    // Every clay brick a little different (lighter, darker, warmer).
    const k = vary ? 0.84 + Math.random() * 0.24 : 1;
    const warm = vary ? (Math.random() - 0.5) * 0.08 : 0;
    m.setColorAt(i, c.setRGB(k * (1 + warm), k, k * (1 - warm)));
  }
  m.instanceMatrix.needsUpdate = true;
  m.instanceColor.needsUpdate = true;
  return m;
}

/**
 * Every piece of a house: clay bricks, golden bricks, half bricks and sandstone corners (instanced),
 * window and door frames, lintels and roof trusses (single models). Pieces can wobble (statics)
 * or sit skewed.
 */
export class BrickField {
  constructor(parent, plan, M, { clay = M.mats.BrickClay, quoin = M.mats.Quoin } = {}) {
    this.plan = plan;
    const by = { full: [], half: [], post: [] };
    for (const p of plan.pieces) by[p.kind]?.push(p);
    this.inst = {
      clay: instanced(M.geo.brick, clay, by.full.length, true),
      gold: instanced(M.geo.gold, M.mats.BrickGold, by.full.length, false),
      half: instanced(M.geo.half, clay, by.half.length, true),
      post: instanced(M.geo.quoin, quoin, by.post.length, true),
    };
    Object.values(this.inst).forEach((m) => parent.add(m));
    this.slot = new Map();
    for (const k of ['full', 'half', 'post']) by[k].forEach((p, i) => this.slot.set(p.id, i));
    this.single = new Map();
    for (const p of plan.pieces) {
      let o = null;
      if (p.kind === 'frame') o = M.make(p.frame === 'door' ? 'DoorFrame' : 'Window');
      else if (p.kind === 'lintel') o = M.make('Lintel');
      else if (p.kind === 'truss') o = M.make('Truss');
      if (!o) continue;
      o.position.set(p.x, p.y, p.z);
      o.rotation.y = p.kind === 'frame' ? p.face : p.kind === 'truss' ? 0 : p.yaw;
      o.visible = false;
      parent.add(o);
      this.single.set(p.id, o);
    }
    this.tilts = new Map(); // id -> { wobble, lean, yaw, phase }
    this.gold = new Set();
    this.anims = [];
  }

  meshOf(p, gold) { return p.kind === 'full' ? (gold ? this.inst.gold : this.inst.clay) : p.kind === 'half' ? this.inst.half : this.inst.post; }

  matrix(p, lift = 0, scale = 1, time = 0) {
    _q.setFromAxisAngle(UP, p.kind === 'post' ? (p.course % 2 ? Math.PI / 2 : 0) : p.yaw);
    const tl = this.tilts.get(p.id);
    if (tl) {
      // Lean across the wall (and a little twist when skewed); wobbling pieces rock.
      const lean = tl.lean + tl.wobble * 0.07 * Math.sin(time * 11 + tl.phase);
      _q.multiply(_q2.setFromAxisAngle(UP, tl.yaw)).multiply(_q2.setFromAxisAngle(AX, lean));
    }
    _s.setScalar(scale);
    return _m.compose(_p.set(p.x, p.y + lift, p.z), _q, _s);
  }

  /** Shows (or hides) a piece; pop >= 0: drops in with a little bounce after that delay. */
  set(p, on, gold = false, pop = -1) {
    const single = this.single.get(p.id);
    this.anims = this.anims.filter((a) => a.p !== p);
    if (!on) this.tilts.delete(p.id);
    if (single) {
      single.visible = on;
      single.scale.setScalar(1);
      if (on && pop >= 0) { single.scale.setScalar(0.001); this.anims.push({ p, single, t: -pop }); }
      return;
    }
    if (!this.slot.has(p.id)) return;
    const i = this.slot.get(p.id);
    if (gold) this.gold.add(p.id); else this.gold.delete(p.id);
    const mesh = this.meshOf(p, gold);
    if (p.kind === 'full') {
      const other = gold ? this.inst.clay : this.inst.gold;
      other.setMatrixAt(i, ZERO);
      other.instanceMatrix.needsUpdate = true;
    }
    if (on && pop >= 0) {
      mesh.setMatrixAt(i, ZERO);
      this.anims.push({ p, mesh, i, t: -pop });
    } else mesh.setMatrixAt(i, on ? this.matrix(p) : ZERO);
    mesh.instanceMatrix.needsUpdate = true;
  }

  /** Statics: { wobble: 0..1, lean, yaw } or null (straight). */
  setTilt(p, tilt) {
    if (tilt) this.tilts.set(p.id, { wobble: 0, lean: 0, yaw: 0, phase: Math.random() * 6, ...tilt });
    else this.tilts.delete(p.id);
    if (this.plan.isFilled(p.id) && this.slot.has(p.id)) {
      const mesh = this.meshOf(p, this.gold.has(p.id));
      mesh.setMatrixAt(this.slot.get(p.id), this.matrix(p));
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  update(dt, time) {
    if (this.anims.length) {
      this.anims = this.anims.filter((a) => {
        a.t += dt;
        if (a.t < 0) return true;
        const k = Math.min(1, a.t / 0.2);
        const back = 1 + 2.4 * (k - 1) ** 3 + 1.4 * (k - 1) ** 2; // ease out back
        if (a.single) a.single.scale.setScalar(Math.max(0.001, 0.55 + 0.45 * back));
        else {
          a.mesh.setMatrixAt(a.i, this.matrix(a.p, (1 - k) * 0.02, 0.55 + 0.45 * back, time));
          a.mesh.instanceMatrix.needsUpdate = true;
        }
        return k < 1;
      });
    }
    for (const [id, tl] of this.tilts) {
      if (!tl.wobble) continue;
      const p = this.plan.pieces[id];
      if (!this.plan.isFilled(id) || !this.slot.has(id)) continue;
      const mesh = this.meshOf(p, this.gold.has(id));
      mesh.setMatrixAt(this.slot.get(id), this.matrix(p, 0, 1, time));
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /** All built pieces at once (after a plan change). */
  showAll() {
    for (const [id, info] of this.plan.filled) this.set(this.plan.pieces[id], true, info.gold);
  }
}

// ---------- the ghost plan ----------

/** Blueprint lines of the house (walls, openings, courses, roof; the extension if planned). */
function blueprint(plan) {
  const main = [];
  const fine = [];
  const seg = (arr, a, b) => arr.push(new THREE.Vector3(...a), new THREE.Vector3(...b));
  const walls = WALLS.slice(0, plan.opts.annex ? 7 : 4);
  walls.forEach((w, wi) => {
    const top = w.courses * H;
    const face = (u, y) => {
      const [x, z] = w.at(u);
      return [x + Math.sin(w.face) * (D / 2 + 0.002), y, z + Math.cos(w.face) * (D / 2 + 0.002)];
    };
    const ext = wi < 4 ? D / L : 0;
    seg(main, face(-ext, top), face(w.len + (wi < 4 || wi === 5 ? D / L : 0), top));
    for (let c = 1; c < w.courses; c++) seg(fine, face(-ext, c * H), face(w.len + ext, c * H));
    for (const o of w.openings) {
      const y0 = o.c0 * H;
      const y1 = o.c1 * H;
      seg(main, face(o.u0, y0), face(o.u0, y1));
      seg(main, face(o.u1, y0), face(o.u1, y1));
      seg(main, face(o.u0, y1), face(o.u1, y1));
      if (o.c0 > 0) seg(main, face(o.u0, y0), face(o.u1, y0));
    }
  });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) seg(main, [sx * OX, 0, sz * OZ], [sx * OX, TOP, sz * OZ]);
  if (plan.opts.annex) {
    const ax = XA - D / 2;
    const az = ZA + D / 2;
    for (const sz of [-1, 1]) seg(main, [ax, 0, sz * az], [ax, ANNEX_COURSES * H, sz * az]);
    seg(fine, [ax, ANNEX_COURSES * H + 0.012, -az], [ax, ANNEX_COURSES * H + 0.012, az]);
  }
  const RX = OX + 0.03;
  const EZ = OZ + EAVE;
  const EY = TOP - (EAVE * RIDGE) / OZ;
  for (const sx of [-1, 1]) {
    seg(main, [sx * OX, TOP, -OZ], [sx * OX, TOP + RIDGE, 0]);
    seg(main, [sx * OX, TOP, OZ], [sx * OX, TOP + RIDGE, 0]);
    seg(fine, [sx * RX, EY, -EZ], [sx * RX, TOP + RIDGE, 0]);
    seg(fine, [sx * RX, EY, EZ], [sx * RX, TOP + RIDGE, 0]);
  }
  seg(main, [-RX, TOP + RIDGE, 0], [RX, TOP + RIDGE, 0]);
  seg(fine, [-RX, EY, EZ], [RX, EY, EZ]);
  seg(fine, [-RX, EY, -EZ], [RX, EY, -EZ]);
  return { main, fine };
}

/** Box of a piece or a target (center, size, yaw) for the ghost. */
export function ghostBox(g) {
  const k = g.kind ?? g.pieces?.[0]?.kind;
  const p = g.pieces?.[0] ?? g;
  if (p.kind === 'frame') return { x: g.x, y: g.y, z: g.z, sx: L - 0.006, sy: (p.opening.c1 - p.opening.c0) * H - 0.006, sz: D * 0.55, yaw: p.yaw };
  if (p.kind === 'truss') return { x: g.x, y: g.y + RIDGE * 0.45, z: g.z, sx: 0.01, sy: RIDGE * 0.9, sz: 2 * OZ, yaw: 0 };
  if (p.kind === 'post') return { x: g.x, y: g.y, z: g.z, sx: D - GAP, sy: H - GAP, sz: D - GAP, yaw: 0 };
  const len = g.pieces ? g.pieces.reduce((s, q) => s + q.len, 0) : p.len;
  return { x: g.x, y: g.y, z: g.z, sx: len - GAP, sy: H - GAP, sz: D - GAP, yaw: p.yaw, kind: k };
}

const BOX_EDGES = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
const CORNER = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];

function boxMatrix(b, pad = 0) {
  _q.setFromAxisAngle(UP, b.yaw);
  _s.set(b.sx + pad, b.sy + pad, b.sz + pad);
  return _m.compose(_p.set(b.x, b.y, b.z), _q, _s);
}

/**
 * The plan as a hologram: blueprint lines; faint boxes where the next courses go; bright boxes
 * with outlines for the places the item in hand (or anything on the pallet) can go, amber where it
 * would wobble; the snap highlight; a red flash for a refused place.
 */
export class GhostPlan {
  constructor(parent, plan) {
    this.plan = plan;
    this.group = new THREE.Group();
    this.group.userData.noFit = true;
    parent.add(this.group);
    const lines = blueprint(plan);
    const lineMat = (opacity) => new THREE.LineBasicMaterial({ color: hex('xr-bricks-ghost-line'), transparent: true, opacity, depthWrite: false, toneMapped: false });
    this.lineMain = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines.main), lineMat(0.55));
    this.lineFine = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines.fine), lineMat(0.2));
    this.group.add(this.lineMain, this.lineFine);
    const box = new THREE.BoxGeometry(1, 1, 1);
    const mat = (token, opacity) => new THREE.MeshBasicMaterial({ color: hex(token), transparent: true, opacity, depthWrite: false, toneMapped: false });
    const n = plan.pieces.length + plan.pairs.length;
    this.rest = new THREE.InstancedMesh(box, mat('xr-bricks-ghost', 0.12), plan.pieces.length);
    this.solid = new THREE.InstancedMesh(box, mat('xr-bricks-ghost', 0.45), n);
    this.warn = new THREE.InstancedMesh(box, mat('xr-bricks-ghost-warn', 0.4), n);
    for (const m of [this.rest, this.solid, this.warn]) {
      m.frustumCulled = false;
      m.renderOrder = 3;
      m.count = 0;
      this.group.add(m);
    }
    this.edges = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
    this.edges.frustumCulled = false;
    this.edges.renderOrder = 4;
    this.group.add(this.edges);
    this.cBright = new THREE.Color(hex('xr-bricks-ghost'));
    this.cHot = new THREE.Color(hex('xr-bricks-ghost-hot'));
    this.cWarn = new THREE.Color(hex('xr-bricks-ghost-warn'));
    this.hiMat = new THREE.MeshBasicMaterial({ color: this.cHot, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false });
    this.hi = new THREE.Mesh(box, this.hiMat);
    this.hi.visible = false;
    this.hi.renderOrder = 4;
    this.group.add(this.hi);
    // A roof truss place glows as a triangle.
    const EZ = OZ + EAVE;
    const EY = TOP - (EAVE * RIDGE) / OZ;
    const tri = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, EY, -EZ), new THREE.Vector3(0, TOP + RIDGE, 0), new THREE.Vector3(0, EY, EZ)]);
    tri.computeVertexNormals();
    this.hiTri = new THREE.Mesh(tri, new THREE.MeshBasicMaterial({ color: this.cHot, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }));
    this.hiTri.visible = false;
    this.hiTri.renderOrder = 4;
    this.group.add(this.hiTri);
    this.noMat = new THREE.MeshBasicMaterial({ color: hex('xr-bricks-reject'), transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    this.no = new THREE.Mesh(box, this.noMat);
    this.no.visible = false;
    this.no.renderOrder = 4;
    this.group.add(this.no);
    this.flash = null;
    this.key = '';
    this.dirty = true;
    this.fade = 1;
  }

  refresh() { this.dirty = true; }

  reject(p) { this.flash = { p, t: 0 }; }

  dispose() {
    this.group.removeFromParent();
    this.group.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  }

  update(dt, time, { show = [], hover = null }) {
    const plan = this.plan;
    const key = show.map((g) => `${g.pieces.map((p) => p.id).join('+')}${g.state[0]}`).join(',');
    if (this.dirty || key !== this.key) {
      this.key = key;
      let top = -1;
      for (const id of plan.filled.keys()) if (plan.pieces[id].kind !== 'truss') top = Math.max(top, plan.pieces[id].course);
      let n = 0;
      for (const p of plan.pieces) {
        if (plan.isFilled(p.id) || p.kind === 'truss' || p.course > top + 1) continue;
        this.rest.setMatrixAt(n++, boxMatrix(ghostBox(p)));
      }
      this.rest.count = n;
      let ns = 0;
      let nw = 0;
      const pts = [];
      const cols = [];
      const EZ = OZ + EAVE;
      const EY = TOP - (EAVE * RIDGE) / OZ;
      for (const g of show) {
        if (g.pieces[0].kind === 'truss') {
          // Trusses: a triangle with the joist, no box.
          const x = g.x;
          const v = [[x, EY, -EZ], [x, TOP + RIDGE, 0], [x, EY, EZ], [x, TOP + 0.006, -OZ], [x, TOP + 0.006, OZ]].map((a) => new THREE.Vector3(...a));
          for (const [a, e] of [[0, 1], [1, 2], [3, 4]]) { pts.push(v[a], v[e]); cols.push(this.cHot.r, this.cHot.g, this.cHot.b, this.cHot.r, this.cHot.g, this.cHot.b); }
          continue;
        }
        const b = ghostBox(g);
        const warn = g.state === 'wobbly';
        (warn ? this.warn : this.solid).setMatrixAt(warn ? nw++ : ns++, boxMatrix(b));
        const c = warn ? this.cWarn : this.cHot;
        const cs = Math.cos(b.yaw);
        const sn = Math.sin(b.yaw);
        const v = CORNER.map(([x, y, z]) => {
          const hx = (x * (b.sx + 0.002)) / 2;
          const hz = (z * (b.sz + 0.002)) / 2;
          return new THREE.Vector3(b.x + hx * cs + hz * sn, b.y + (y * (b.sy + 0.002)) / 2, b.z - hx * sn + hz * cs);
        });
        for (const [a, e] of BOX_EDGES) { pts.push(v[a], v[e]); cols.push(c.r, c.g, c.b, c.r, c.g, c.b); }
      }
      this.solid.count = ns;
      this.warn.count = nw;
      for (const m of [this.rest, this.solid, this.warn]) m.instanceMatrix.needsUpdate = true;
      this.edges.geometry.dispose();
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      this.edges.geometry = geo;
      this.dirty = false;
    }
    const pulse = 0.5 + 0.5 * Math.sin(time * 4.2);
    this.solid.material.color.copy(this.cBright).lerp(this.cHot, pulse * 0.6);
    this.solid.material.opacity = (0.32 + 0.2 * pulse) * this.fade;
    this.warn.material.opacity = (0.22 + 0.15 * pulse) * this.fade;
    this.edges.material.opacity = (0.45 + 0.5 * pulse) * this.fade;
    this.rest.material.opacity = 0.12 * this.fade;
    this.lineMain.material.opacity = 0.55 * this.fade;
    this.lineFine.material.opacity = 0.2 * this.fade;
    this.group.visible = this.fade > 0.01;
    const triHover = hover?.pieces?.[0]?.kind === 'truss';
    this.hiTri.visible = triHover;
    if (triHover) {
      this.hiTri.position.x = hover.x;
      this.hiTri.material.opacity = 0.3 + 0.2 * Math.sin(time * 10);
    }
    this.hi.visible = !!hover && !triHover;
    if (hover && !triHover) {
      const b = ghostBox(hover);
      this.hi.matrix.copy(boxMatrix(b, 0.004));
      this.hi.matrixAutoUpdate = false;
      this.hiMat.color.copy(hover.state === 'wobbly' ? this.cWarn : this.cHot);
      this.hiMat.opacity = 0.45 + 0.2 * Math.sin(time * 10);
    }
    const f = this.flash;
    this.no.visible = !!f;
    if (f) {
      f.t += dt;
      this.no.matrix.copy(boxMatrix(ghostBox(f.p), 0.004));
      this.no.matrixAutoUpdate = false;
      this.noMat.opacity = 0.7 * Math.max(0, 1 - f.t / 0.9) * (0.6 + 0.4 * Math.sin(f.t * 30));
      if (f.t > 0.9) this.flash = null;
    }
  }
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
  // A brick snaps in: a woody knock, a click and a little mortar crunch.
  place: play((a) => { tone(a, 170, 0, 0.11, 'sine', 0.14, 90); tone(a, 1900, 0, 0.025, 'square', 0.025); hiss(a, 0.01, 0.09, 2400, 0.05); }),
  // A held brick finds a free place.
  snap: play((a) => { tone(a, 1320, 0, 0.05, 'triangle', 0.035); }),
  // Back to the pallet, friendly.
  refuse: play((a) => { tone(a, 420, 0, 0.12, 'triangle', 0.05, 300); tone(a, 330, 0.08, 0.14, 'triangle', 0.04, 260); }),
  // A coin drops into the machine.
  deposit: play((a) => { tone(a, 2100, 0, 0.05, 'triangle', 0.03); tone(a, 2700, 0.05, 0.08, 'sine', 0.03); hiss(a, 0.12, 0.25, 900, 0.015, 0.8); }),
  // The crane: a low motor hum.
  motor: play((a) => { tone(a, 70, 0, 0.7, 'sawtooth', 0.025, 95); tone(a, 140, 0, 0.7, 'triangle', 0.015, 190); }),
  // A wall section or the roof lands.
  land: play((a) => { tone(a, 110, 0, 0.25, 'sine', 0.18, 55); hiss(a, 0.0, 0.3, 500, 0.06, 0.7); }),
  // The door swings open.
  door: play((a) => { tone(a, 380, 0, 0.5, 'sawtooth', 0.012, 520); tone(a, 520, 0.2, 0.4, 'triangle', 0.012, 300); }),
  // Lights going on, one after another.
  lights: play((a) => { [1568, 1760, 2093, 2349, 2637].forEach((f, i) => tone(a, f, i * 0.07, 0.18, 'sine', 0.025)); }),
  // Spending: bricks fly away.
  spend: play((a) => { [660, 520, 400, 300].forEach((f, i) => tone(a, f, i * 0.08, 0.14, 'triangle', 0.04)); }),
  // A wobbling wall: a creak and a rattle.
  wobble: play((a) => { tone(a, 140, 0, 0.35, 'sawtooth', 0.03, 110); hiss(a, 0.05, 0.2, 700, 0.03, 2); tone(a, 520, 0.12, 0.08, 'square', 0.02); }),
  // It settles: a firm knock.
  settle: play((a) => { tone(a, 240, 0, 0.08, 'sine', 0.1, 160); tone(a, 1600, 0.02, 0.03, 'square', 0.02); }),
  // A life event: a soft chime.
  event: play((a) => { [523, 659, 784].forEach((f, i) => tone(a, f, i * 0.09, 0.3, 'sine', 0.05)); }),
  // The neighbors cheer.
  cheer: play((a) => { [784, 988, 1175].forEach((f, i) => tone(a, f, i * 0.06, 0.12, 'triangle', 0.03)); hiss(a, 0, 0.4, 3000, 0.012, 0.6); }),
  // Snow begins: a cold shimmer.
  snow: play((a) => { [2093, 2637, 3136, 2349].forEach((f, i) => tone(a, f, i * 0.12, 0.4, 'sine', 0.018)); }),
};

// ---------- the month display on the savings machine ----------

export function drawMonthDisplay(ctx, p, { month, vacation, flash }) {
  const W = p.canvas.width;
  const Hh = p.canvas.height;
  ctx.clearRect(0, 0, W, Hh);
  ctx.fillStyle = color('xr-bricks-dark');
  ctx.beginPath();
  ctx.roundRect(1, 1, W - 2, Hh - 2, Hh * 0.18);
  ctx.fill();
  const tint = color(flash ? 'xr-bricks-gold-glow' : vacation ? 'xr-bricks-ghost' : 'xr-bricks-lamp');
  // a little calendar sheet
  const s = Hh * 0.62;
  const x0 = Hh * 0.22;
  const y0 = (Hh - s) / 2;
  ctx.strokeStyle = tint;
  ctx.lineWidth = Hh * 0.06;
  ctx.strokeRect(x0, y0 + s * 0.12, s, s * 0.88);
  ctx.fillStyle = tint;
  ctx.fillRect(x0, y0 + s * 0.12, s, s * 0.22);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = font('black', Hh * 0.6);
  ctx.fillText(vacation ? '–' : String(month), x0 + s + (W - x0 - s) / 2, Hh * 0.54);
}


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
