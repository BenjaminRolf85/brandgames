// "Stein auf Stein": the 3D parts and drawings. The Blender model (blender/build_bricks.py,
// assets/models/bricks.glb) recolored from the --xr-bricks-* tokens; the bricks of the house as
// instanced meshes; the ghost plan (blueprint lines, glowing free places, the place a held brick
// snaps to); the tower crane; mortar puffs and chimney smoke; the AI chart; the temptation card;
// a few sounds of its own (place click, crane motor, door).
import * as THREE from 'three';
import { loadGLTF } from './models.js';
import { hex, color, num, font } from './tokens.js';
import { Panel, wrap, measureBlocks } from './ui3d.js';
import { t } from './i18n.js';
import { radialTexture } from './robot-visuals.js';
import { audioContext } from './sfx.js';
import { winterize } from './snow.js';
import { L, H, D, GAP, TOP, OX, OZ, RIDGE, EAVE, WALLS } from './bricks-plan.js';

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
    const geo = { brick: meshGeo(gltf, 'Brick'), half: meshGeo(gltf, 'BrickHalf'), gold: meshGeo(gltf, 'BrickGold') };
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

// ---------- the bricks of the house (instanced) ----------

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/** Every built piece of the house: clay bricks, golden bricks, half bats and corner posts. */
export class BrickField {
  constructor(parent, plan, M) {
    this.plan = plan;
    const nFull = plan.full.length;
    const nHalf = plan.pieces.length - nFull;
    this.clay = new THREE.InstancedMesh(M.geo.brick, M.mats.BrickClay, nFull);
    this.gold = new THREE.InstancedMesh(M.geo.gold, M.mats.BrickGold, nFull);
    this.half = new THREE.InstancedMesh(M.geo.half, M.mats.BrickClay, nHalf);
    this.slot = new Map(); // piece id -> index in its mesh
    let f = 0;
    let h = 0;
    for (const p of plan.pieces) this.slot.set(p.id, p.kind === 'full' ? f++ : h++);
    const c = new THREE.Color();
    for (const m of [this.clay, this.gold, this.half]) {
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      for (let i = 0; i < m.count; i++) {
        m.setMatrixAt(i, ZERO);
        // Every clay brick a little different (lighter, darker, warmer); gold stays gold.
        const k = m === this.gold ? 1 : 0.84 + Math.random() * 0.24;
        const warm = m === this.gold ? 0 : (Math.random() - 0.5) * 0.08;
        m.setColorAt(i, c.setRGB(k * (1 + warm), k, k * (1 - warm)));
      }
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
      parent.add(m);
    }
    this.anims = [];
  }

  meshOf(p, gold) { return p.kind === 'full' ? (gold ? this.gold : this.clay) : this.half; }

  matrix(p, lift = 0, scale = 1) {
    _q.setFromAxisAngle(UP, p.kind === 'post' ? 0 : p.yaw);
    // Posts are half bats turned by 90 degrees every second course (they interlock).
    if (p.kind === 'post' && p.course % 2) _q.setFromAxisAngle(UP, Math.PI / 2);
    _s.setScalar(scale);
    return _m.compose(_p.set(p.x, p.y + lift, p.z), _q, _s);
  }

  /** Shows (or hides) a piece; pop > 0: drops in with a little bounce after that delay. */
  set(p, on, gold = false, pop = -1) {
    const i = this.slot.get(p.id);
    const mesh = this.meshOf(p, gold);
    const other = p.kind === 'full' ? (gold ? this.clay : this.gold) : null;
    other?.setMatrixAt(i, ZERO);
    this.anims = this.anims.filter((a) => a.p !== p);
    if (on && pop >= 0) {
      mesh.setMatrixAt(i, ZERO);
      this.anims.push({ p, mesh, i, t: -pop });
    } else mesh.setMatrixAt(i, on ? this.matrix(p) : ZERO);
    mesh.instanceMatrix.needsUpdate = true;
    if (other) other.instanceMatrix.needsUpdate = true;
  }

  update(dt) {
    if (!this.anims.length) return;
    this.anims = this.anims.filter((a) => {
      a.t += dt;
      if (a.t < 0) return true;
      const k = Math.min(1, a.t / 0.2);
      const back = 1 + 2.4 * (k - 1) ** 3 + 1.4 * (k - 1) ** 2; // ease out back
      a.mesh.setMatrixAt(a.i, this.matrix(a.p, (1 - k) * 0.02, 0.55 + 0.45 * back));
      a.mesh.instanceMatrix.needsUpdate = true;
      return k < 1;
    });
  }
}

// ---------- the ghost plan ----------

/** Blueprint lines of the whole house (walls, openings, courses, roof) in house space. */
function blueprint() {
  const main = [];
  const fine = [];
  const seg = (arr, a, b) => arr.push(new THREE.Vector3(...a), new THREE.Vector3(...b));
  WALLS.forEach((w) => {
    // the wall's outer face: u along the wall, n outwards
    const face = (u, y) => {
      const [x, z] = w.at(u);
      const ox = Math.sin(w.face) * (D / 2 + 0.002);
      const oz = Math.cos(w.face) * (D / 2 + 0.002);
      return [x + ox, y, z + oz];
    };
    seg(main, face(-D / L, TOP), face(w.len + D / L, TOP));
    for (let c = 1; c < 7; c++) seg(fine, face(-D / L, c * H), face(w.len + D / L, c * H));
    for (const o of w.openings) {
      const y0 = o.c0 * H;
      const y1 = (o.c1 + 1) * H;
      seg(main, face(o.u0, y0), face(o.u0, y1));
      seg(main, face(o.u1, y0), face(o.u1, y1));
      seg(main, face(o.u0, y1), face(o.u1, y1));
      if (o.c0 > 0) seg(main, face(o.u0, y0), face(o.u1, y0));
    }
  });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) seg(main, [sx * OX, 0, sz * OZ], [sx * OX, TOP, sz * OZ]);
  // the roof: gables, ridge, eaves
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

/**
 * The plan as a hologram: blueprint lines of the house, ghost bricks where the next courses go
 * (bright and pulsing where a brick can go now), and the highlight for a held brick.
 */
export class GhostPlan {
  constructor(parent, plan) {
    this.plan = plan;
    this.group = new THREE.Group();
    this.group.userData.noFit = true;
    parent.add(this.group);
    const lines = blueprint();
    const lineMat = (opacity) => new THREE.LineBasicMaterial({ color: hex('xr-bricks-ghost-line'), transparent: true, opacity, depthWrite: false, toneMapped: false });
    this.lineMain = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines.main), lineMat(0.55));
    this.lineFine = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(lines.fine), lineMat(0.2));
    this.group.add(this.lineMain, this.lineFine);
    const box = new THREE.BoxGeometry(1, 1, 1);
    const ghostMat = (opacity) => new THREE.MeshBasicMaterial({ color: hex('xr-bricks-ghost'), transparent: true, opacity, depthWrite: false, toneMapped: false });
    // Places a brick can go now (bright, pulsing) and the rest of the next courses (faint).
    this.avail = new THREE.InstancedMesh(box, ghostMat(0.55), plan.pieces.length);
    this.rest = new THREE.InstancedMesh(box, ghostMat(0.16), plan.pieces.length);
    this.rest.material.color.setHex(hex('xr-bricks-ghost-dim')).lerp(new THREE.Color(hex('xr-bricks-ghost')), 0.5);
    for (const m of [this.avail, this.rest]) {
      m.frustumCulled = false;
      m.renderOrder = 3;
      this.group.add(m);
    }
    this.edges = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: hex('xr-bricks-ghost-hot'), transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false }));
    this.edges.frustumCulled = false;
    this.edges.renderOrder = 4;
    this.group.add(this.edges);
    this.cBright = new THREE.Color(hex('xr-bricks-ghost'));
    this.cHot = new THREE.Color(hex('xr-bricks-ghost-hot'));
    this.cReject = new THREE.Color(hex('xr-bricks-reject'));
    this.availKey = '';
    // The highlight: a glowing brick with a bright edge.
    const hb = new THREE.BoxGeometry(L - GAP + 0.004, H - GAP + 0.004, D - GAP + 0.004);
    this.hiMat = new THREE.MeshBasicMaterial({ color: this.cHot, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false });
    this.hi = new THREE.Mesh(hb, this.hiMat);
    this.hiEdge = new THREE.LineSegments(new THREE.EdgesGeometry(hb), new THREE.LineBasicMaterial({ color: this.cHot, transparent: true, depthWrite: false, toneMapped: false }));
    this.hi.add(this.hiEdge);
    this.hi.visible = false;
    this.hi.renderOrder = 4;
    this.group.add(this.hi);
    // A refused place flashes red for a moment.
    this.noMat = new THREE.MeshBasicMaterial({ color: this.cReject, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    this.no = new THREE.Mesh(hb, this.noMat);
    this.no.visible = false;
    this.no.renderOrder = 4;
    this.group.add(this.no);
    this.flash = null; // { p, t } red flash of a refused place
    this.dirty = true;
    this.fade = 1;
  }

  /** Call after the built pieces changed. */
  refresh() { this.dirty = true; }

  reject(p) { this.flash = { p, t: 0 }; }

  update(dt, time, { available, hover, strong = false }) {
    const plan = this.plan;
    const key = available.map((p) => p.id).join(',');
    if (this.dirty || key !== this.availKey) {
      this.availKey = key;
      const avail = new Set(available.map((p) => p.id));
      let top = -1;
      for (const id of plan.filled.keys()) top = Math.max(top, plan.pieces[id].course);
      plan.pieces.forEach((p, i) => {
        const show = !plan.isFilled(p.id) && p.course <= top + 1;
        let m = ZERO;
        if (show) {
          _q.setFromAxisAngle(UP, p.kind === 'post' ? 0 : p.yaw);
          _s.set(p.kind === 'post' ? D - GAP : p.len - GAP, H - GAP, D - GAP);
          m = _m.compose(_p.set(p.x, p.y, p.z), _q, _s);
        }
        this.avail.setMatrixAt(i, show && avail.has(p.id) ? m : ZERO);
        this.rest.setMatrixAt(i, show && !avail.has(p.id) ? m : ZERO);
      });
      this.avail.instanceMatrix.needsUpdate = true;
      this.rest.instanceMatrix.needsUpdate = true;
      this.dirty = false;
      // Bright outlines around the places a brick can go now.
      const pts = [];
      const c = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
      const E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
      for (const p of available) {
        const hx = (p.len - GAP) / 2 + 0.001;
        const hy = (H - GAP) / 2 + 0.001;
        const hz = (D - GAP) / 2 + 0.001;
        const cs = Math.cos(p.yaw);
        const sn = Math.sin(p.yaw);
        const v = c.map(([x, y, z]) => new THREE.Vector3(p.x + x * hx * cs + z * hz * sn, p.y + y * hy, p.z - x * hx * sn + z * hz * cs));
        for (const [a, b] of E) pts.push(v[a], v[b]);
      }
      this.edges.geometry.dispose();
      this.edges.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    }
    const pulse = 0.5 + 0.5 * Math.sin(time * 4.2);
    this.avail.material.color.copy(this.cBright).lerp(this.cHot, pulse * 0.6);
    this.avail.material.opacity = ((strong ? 0.5 : 0.36) + 0.2 * pulse) * this.fade;
    this.edges.material.opacity = (0.45 + 0.5 * pulse) * this.fade;
    this.rest.material.opacity = 0.14 * this.fade;
    this.lineMain.material.opacity = 0.55 * this.fade;
    this.lineFine.material.opacity = 0.2 * this.fade;
    this.group.visible = this.fade > 0.01;
    this.hi.visible = !!hover;
    if (hover) {
      this.hi.position.set(hover.x, hover.y, hover.z);
      this.hi.rotation.set(0, hover.yaw, 0);
      this.hiMat.opacity = 0.45 + 0.2 * Math.sin(time * 10);
    }
    const f = this.flash;
    this.no.visible = !!f;
    if (f) {
      f.t += dt;
      this.no.position.set(f.p.x, f.p.y, f.p.z);
      this.no.rotation.set(0, f.p.yaw, 0);
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
};

// ---------- pictograms for the temptation card (24 x 24 line art like icons.js) ----------

const PICTO = {
  phone: 'M8 2.5h8a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5H8A1.5 1.5 0 0 1 6.5 20V4A1.5 1.5 0 0 1 8 2.5zM10.5 5h3M11 18.5h2',
  plane: 'M12 2.5c1 0 1.5 1.2 1.5 2.5v5l7.5 4.5v2l-7.5-2.3V18l2 1.6v1.6L12 20.3l-3.5.9v-1.6l2-1.6v-3.8L3 16.5v-2l7.5-4.5V5c0-1.3.5-2.5 1.5-2.5z',
  tv: 'M3 5.5h18v12H3zM8.5 21h7M12 17.5V21M6.5 8.5l2.5 2.5',
  shoe: 'M3 17.5V9.5l4.5-.5 3 3h4l5.7 2.4a1.5 1.5 0 0 1 .8 1.3v1.8zM3 20h18.5M9 12l1.5-1.8M11.6 12.6l1.4-1.8',
  ticket: 'M3 7h18v3.2a1.8 1.8 0 0 0 0 3.6V17H3v-3.2a1.8 1.8 0 0 0 0-3.6zM15 7.5v2M15 11.2v1.6M15 14.5v2',
  mug: 'M5 9h11v7a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4zM16 11h1.5a2.5 2.5 0 0 1 0 5H16M8.5 3.5c-1 1.5 1 2.5 0 4M12.5 3.5c-1 1.5 1 2.5 0 4',
  watch: 'M8 7h8v10H8zM9 7l1-4h4l1 4M9 17l1 4h4l1-4M12 9.5V12l1.8 1.2',
};
const pictoCache = new Map();

function drawPicto(ctx, key, x, y, size, stroke) {
  const d = PICTO[key];
  if (!d) return;
  if (!pictoCache.has(key)) pictoCache.set(key, new Path2D(d));
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.lineWidth = 1.7;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke;
  ctx.stroke(pictoCache.get(key));
  ctx.restore();
}

/** The temptation card's text panel: pictogram, question, a line of temptation, the cost. */
export function temptPanel(tempt, w = 0.62) {
  const pad = num('xr-padding');
  const ic = 0.13;
  const sm = num('xr-text-sm');
  const cost = tempt.bricks ? t('bricksCostBricks', { n: tempt.bricks }) : t('bricksCostMonths', { n: tempt.months });
  const blocks = [
    { text: t('bricksTempt').toUpperCase(), size: 'xr-text-sm', weight: 'black', color: color('xr-bricks-tempt'), gap: 0.006 },
    { text: t(`bricksTempt_${tempt.key}`), size: 'xr-text-lg', weight: 'black', gap: 0.008, lineHeight: 1.15 },
    { text: t(`bricksTemptSub_${tempt.key}`), size: 'xr-text-sm', color: color('xr-panel-muted'), gap: 0.012 },
    { text: cost, size: 'xr-text-sm', weight: 'bold', color: color('xr-danger') },
  ];
  const col = w - ic - pad * 0.6;
  const h = Math.max(measureBlocks(blocks, col, pad), ic + pad * 2);
  const panel = new Panel(w, h, (ctx2, p) => {
    p.surface({ stroke: color('xr-bricks-tempt'), strokeWidth: num('xr-border-width') * 1.6, stripe: false });
    const cx = p.m(pad + ic / 2);
    const cy = p.m(pad + ic / 2 + 0.01);
    ctx2.save();
    ctx2.globalAlpha = 0.18;
    ctx2.fillStyle = color('xr-bricks-tempt');
    ctx2.beginPath();
    ctx2.arc(cx, cy, p.m(ic / 2), 0, Math.PI * 2);
    ctx2.fill();
    ctx2.restore();
    drawPicto(ctx2, tempt.icon, cx, cy, p.m(ic * 0.66), color('xr-bricks-tempt'));
    p.blocks(blocks, { x: ic + pad * 0.6, w: col, align: 'left', valign: 'center' });
  });
  return panel;
}

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

// ---------- the AI forecast chart ----------

/**
 * Draws the forecast panel. s: { month, saved, target, history: [saved at the end of month i],
 * pred: { median, lo, hi, mu }, path(h) -> { mid, lo, hi }, marks: [{ m, kind }], note, done,
 * doneMonth, early: { lo, hi } }
 */
export function drawChart(ctx, p, s) {
  p.surface({ stroke: color('xr-bricks-chart-band-edge'), stripe: false });
  const W = p.canvas.width;
  const Hc = p.canvas.height;
  const pad = p.m(0.03);
  const sm = p.m(num('xr-text-sm'));
  const md = p.m(num('xr-text-md'));
  const lg = p.m(num('xr-text-lg'));
  ctx.textBaseline = 'top';
  // title and month
  ctx.textAlign = 'left';
  ctx.fillStyle = color('xr-panel-text');
  ctx.font = font('black', md);
  ctx.fillText(t('bricksChartTitle'), pad, pad);
  ctx.textAlign = 'right';
  ctx.fillStyle = color('xr-panel-muted');
  ctx.font = font('bold', sm);
  ctx.fillText(t('bricksMonth', { n: s.month }), W - pad, pad + (md - sm) * 0.6);
  let y = pad + md * 1.35;
  // headline: the forecast month (or the result)
  ctx.textAlign = 'left';
  const pr = s.pred;
  const ready = s.done || (pr && Number.isFinite(pr.median) && s.history.length > 2);
  let head;
  let sub;
  if (s.done) {
    head = t('bricksChartDone', { m: s.doneMonth });
    sub = s.early ? t(s.early.key, { lo: s.early.lo, hi: s.early.hi }) : '';
  } else if (ready) {
    head = t('bricksChartAt', { m: Math.ceil(pr.median) });
    sub = Number.isFinite(pr.hi) ? t('bricksChartRange', { lo: Math.ceil(pr.lo), hi: Math.ceil(pr.hi) }) : t('bricksChartOpen', { lo: Math.ceil(pr.lo) });
  } else {
    head = t('bricksChartQ');
    sub = t('bricksChartWait');
  }
  ctx.fillStyle = color(s.done ? 'xr-success' : ready ? 'xr-bricks-chart-forecast' : 'xr-panel-text');
  ctx.font = font('black', lg);
  ctx.fillText(head, pad, y);
  y += lg * 1.2;
  ctx.fillStyle = color('xr-panel-muted');
  ctx.font = font('bold', sm);
  for (const ln of wrap(ctx, sub, W - pad * 2).slice(0, 2)) { ctx.fillText(ln, pad, y); y += sm * 1.22; }
  y += sm * 0.23;
  // the note at the bottom (what the AI just learned)
  ctx.font = font('regular', sm);
  const noteLines = s.note ? wrap(ctx, s.note, W - pad * 2).slice(0, 2) : [];
  const noteH = noteLines.length * sm * 1.22;
  const axisH = sm * 1.3;
  // plot area
  const x0 = pad + sm * 1.6;
  const x1 = W - pad;
  const yTop = y + sm * 0.3;
  const yBot = Hc - pad - noteH - axisH - (noteLines.length ? sm * 0.35 : 0);
  if (yBot - yTop < sm * 2) return;
  const maxM = Math.max(24, Math.ceil(((pr && Number.isFinite(pr.hi) ? pr.hi : 0) + 2) / 6) * 6, Math.ceil((s.month + 4) / 6) * 6);
  const maxM2 = Math.min(maxM, 60);
  const maxS = s.target * 1.12;
  const X = (m) => x0 + (Math.min(m, maxM2) / maxM2) * (x1 - x0);
  const Y = (v) => yBot - (Math.max(0, Math.min(v, maxS)) / maxS) * (yBot - yTop);
  // grid
  ctx.strokeStyle = color('xr-bricks-chart-grid');
  ctx.lineWidth = p.m(0.0015);
  for (let m = 6; m < maxM2; m += 6) { ctx.beginPath(); ctx.moveTo(X(m), yTop); ctx.lineTo(X(m), yBot); ctx.stroke(); }
  ctx.strokeStyle = color('xr-bricks-chart-axis');
  ctx.lineWidth = p.m(0.002);
  ctx.beginPath();
  ctx.moveTo(x0, yTop);
  ctx.lineTo(x0, yBot);
  ctx.lineTo(x1, yBot);
  ctx.stroke();
  // axis labels: months below, 0 and the target at the left
  ctx.fillStyle = color('xr-panel-muted');
  ctx.font = font('regular', sm * 0.95);
  ctx.textAlign = 'center';
  for (let m = 0; m <= maxM2; m += 12) ctx.fillText(String(m), Math.min(X(m), x1 - sm), yBot + sm * 0.2);
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(s.target), x0 - sm * 0.25, Y(s.target));
  ctx.fillText('0', x0 - sm * 0.25, yBot - sm * 0.3);
  ctx.textBaseline = 'top';
  // target line
  ctx.strokeStyle = color('xr-bricks-chart-target');
  ctx.lineWidth = p.m(0.003);
  ctx.setLineDash([p.m(0.012), p.m(0.008)]);
  ctx.beginPath();
  ctx.moveTo(x0, Y(s.target));
  ctx.lineTo(x1, Y(s.target));
  ctx.stroke();
  ctx.setLineDash([]);
  // forecast band and line, from now
  const now = s.month - 1 + (s.frac ?? 0);
  if (pr && !s.done && s.path) {
    const end = Math.min(maxM2, Number.isFinite(pr.hi) ? pr.hi + 1 : maxM2);
    const steps = 40;
    const up = [];
    const lo = [];
    for (let i = 0; i <= steps; i++) {
      const m = now + ((end - now) * i) / steps;
      const q = s.path(m - now);
      up.push([X(m), Y(q.hi)]);
      lo.push([X(m), Y(q.lo)]);
    }
    ctx.fillStyle = color('xr-bricks-chart-band');
    ctx.beginPath();
    up.forEach(([x, yy], i) => (i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy)));
    for (let i = lo.length - 1; i >= 0; i--) ctx.lineTo(lo[i][0], lo[i][1]);
    ctx.closePath();
    ctx.fill();
    if (Number.isFinite(pr.median)) {
      ctx.strokeStyle = color('xr-bricks-chart-forecast');
      ctx.lineWidth = p.m(0.0035);
      ctx.setLineDash([p.m(0.01), p.m(0.007)]);
      ctx.beginPath();
      ctx.moveTo(X(now), Y(s.saved));
      ctx.lineTo(X(pr.median), Y(s.target));
      ctx.stroke();
      ctx.setLineDash([]);
      // the forecast range on the target line
      ctx.strokeStyle = color('xr-bricks-chart-band-edge');
      ctx.lineWidth = p.m(0.008);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(X(pr.lo), Y(s.target));
      ctx.lineTo(X(Number.isFinite(pr.hi) ? pr.hi : maxM2), Y(s.target));
      ctx.stroke();
      ctx.lineCap = 'butt';
      ctx.fillStyle = color('xr-bricks-chart-forecast');
      ctx.beginPath();
      ctx.arc(X(pr.median), Y(s.target), p.m(0.009), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // what was saved, month by month, and now
  ctx.strokeStyle = color('xr-bricks-chart-saved');
  ctx.lineWidth = p.m(0.004);
  ctx.lineJoin = 'round';
  ctx.beginPath();
  s.history.forEach((v, m) => (m ? ctx.lineTo(X(m), Y(v)) : ctx.moveTo(X(m), Y(v))));
  if (!s.done) ctx.lineTo(X(now), Y(s.saved));
  ctx.stroke();
  for (const mk of s.marks) {
    ctx.fillStyle = color(mk.kind === 'spend' ? 'xr-bricks-chart-spend' : mk.kind === 'gold' ? 'xr-bricks-chart-gold' : 'xr-bricks-chart-saved');
    ctx.beginPath();
    ctx.arc(X(mk.m), Y(mk.v), p.m(mk.kind === 'spend' ? 0.008 : 0.006), 0, Math.PI * 2);
    ctx.fill();
  }
  if (!s.done) {
    ctx.fillStyle = color('xr-panel-text');
    ctx.beginPath();
    ctx.arc(X(now), Y(s.saved), p.m(0.007), 0, Math.PI * 2);
    ctx.fill();
  }
  // legend dot labels next to the lines: "saved" near now, target label at the right
  ctx.font = font('bold', sm * 0.95);
  ctx.textAlign = 'left';
  ctx.fillStyle = color('xr-bricks-chart-target');
  ctx.fillText(t('bricksChartTarget', { n: s.target }), x0 + sm * 0.4, Y(s.target) - sm * 1.15);
  // note
  ctx.textAlign = 'left';
  ctx.fillStyle = color('xr-panel-text');
  ctx.font = font('regular', sm);
  noteLines.forEach((ln, i) => ctx.fillText(ln, pad, Hc - pad - noteH + i * sm * 1.22));
}
