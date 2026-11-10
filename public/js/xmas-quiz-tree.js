// AI Quiz, Christmas edition (SEASON 'christmas'): instead of the knowledge house a Christmas tree
// grows next to the quiz, and every correct answer decorates it a little more (6 stages):
//   1  baubles with the Echomotion logo
//   2  candy canes and gingerbread men
//   3  more logo baubles and golden bells
//   4  a gold garland and straw stars
//   5  twinkling fairy lights and presents under the tree
//   6  the shining star on top and the last logo baubles
// A bonus answer hangs the big Echomotion medal ornament. A mistake lets the latest decorations
// fall off and leaves a (friendly) mishap: needles on the snow, a broken bauble, a dry tree, then
// it leans. The bare tree is the QuizTree of blender/build_xmas.py; the decorations are built
// here. All colors from the --xr-xmas-* tokens.
import * as THREE from 'three';
import { hex, color } from './tokens.js';
import { t } from './i18n.js';
import { sfx } from './sfx.js';
import { loadGLTF } from './models.js';
import { radialTexture } from './robot-visuals.js';
import { KnowledgeHouse } from './house.js';
import { makeBulbs, surface, treeMaterials } from './christmas.js';

const TREE_URL = 'assets/models/xmas.glb';
const S = 0.3; // tree units (meters of the 1.65 m model) -> house model units
const STAGE_COUNT = 6;
const FRONT = Math.PI / 2; // angle around the trunk that faces the player (+z)
const easeOutBack = (k) => 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);

const std = (token, rough = 0.5, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color: hex(token), roughness: rough, metalness: metal, ...extra });

/** A point on the needles at height y, angle a (FRONT faces the player), `out` beyond them. */
function spot(y, a, out = 0.02) {
  const r = surface(y) + out;
  return new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
}

/** Turns an ornament so its front (+z) looks outward from the trunk. */
function faceOut(obj, a) {
  obj.rotation.y = Math.PI / 2 - a;
  return obj;
}

// ---------- the Echomotion logo baubles ----------

let logoImg = null;
const logoCache = new Map();
/** Bauble texture: the bauble color with the Echomotion logo on its front and back. */
function baubleTexture(token) {
  if (logoCache.has(token)) return logoCache.get(token);
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const draw = () => {
    const ctx = c.getContext('2d');
    ctx.fillStyle = color(token);
    ctx.fillRect(0, 0, 512, 256);
    // A soft band of light around the middle, like glass.
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(0,0,0,0.25)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 256);
    if (logoImg?.complete && logoImg.naturalWidth) {
      // The sphere's front (+z) is at u = 0.25, its back at u = 0.75 (three.js SphereGeometry).
      for (const u of [0.25, 0.75]) ctx.drawImage(logoImg, u * 512 - 52, 128 - 52, 104, 104);
    }
    tex.needsUpdate = true;
  };
  if (!logoImg) {
    logoImg = new Image();
    logoImg.src = 'assets/echomotion-logo.png';
  }
  draw();
  if (!logoImg.complete) logoImg.addEventListener('load', draw, { once: true });
  logoCache.set(token, tex);
  return tex;
}

function logoBauble(token, r = 0.068) {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20), new THREE.MeshPhysicalMaterial({
    map: baubleTexture(token), roughness: 0.18, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08,
  }));
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.3, r * 0.34, r * 0.32, 16), std('xr-xmas-gold', 0.25, 1));
  cap.position.y = r * 0.98;
  const loop = new THREE.Mesh(new THREE.TorusGeometry(r * 0.16, r * 0.04, 6, 16), cap.material);
  loop.position.y = r * 1.22;
  g.add(ball, cap, loop);
  return g;
}

/** Hangs logo baubles at (y, angle offset from the front, color token) spots. */
const baubles = (list, r) => () => {
  const g = new THREE.Group();
  for (const [y, d, token] of list) {
    const b = faceOut(logoBauble(token, r), FRONT + d);
    b.position.copy(spot(y, FRONT + d, 0.03)).add(new THREE.Vector3(0, -0.04, 0));
    g.add(b);
  }
  return g;
};

// ---------- candy canes, gingerbread, bells, straw stars ----------

let stripeTex = null;
function candyStripes() {
  if (stripeTex) return stripeTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color('xr-xmas-candy-white');
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = color('xr-xmas-candy');
  // diagonal stripes (they wind around the tube)
  for (let i = -64; i < 128; i += 22) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 10, 0);
    ctx.lineTo(i + 10 - 64, 64);
    ctx.lineTo(i - 64, 64);
    ctx.fill();
  }
  stripeTex = new THREE.CanvasTexture(c);
  stripeTex.colorSpace = THREE.SRGBColorSpace;
  stripeTex.wrapS = stripeTex.wrapT = THREE.RepeatWrapping;
  stripeTex.repeat.set(6, 1);
  return stripeTex;
}

function candyCane() {
  const path = new THREE.CurvePath();
  path.add(new THREE.LineCurve3(new THREE.Vector3(0, -0.14, 0), new THREE.Vector3(0, 0.02, 0)));
  path.add(new THREE.CubicBezierCurve3(new THREE.Vector3(0, 0.02, 0), new THREE.Vector3(0, 0.08, 0), new THREE.Vector3(0.07, 0.08, 0), new THREE.Vector3(0.07, 0.03, 0)));
  const geo = new THREE.TubeGeometry(path, 40, 0.012, 10, false);
  const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ map: candyStripes(), roughness: 0.3, clearcoat: 1 }));
  const g = new THREE.Group();
  g.add(m);
  return g;
}

function gingerbread() {
  const s = new THREE.Shape();
  // head, arms, body, legs as one outline (cookie cutter style)
  s.absarc(0, 0.065, 0.03, -Math.PI * 0.3, Math.PI * 1.3, false);
  s.lineTo(-0.065, 0.03);
  s.quadraticCurveTo(-0.075, 0.012, -0.055, 0.008);
  s.lineTo(-0.028, 0.01);
  s.lineTo(-0.045, -0.06);
  s.quadraticCurveTo(-0.042, -0.078, -0.022, -0.07);
  s.lineTo(0, -0.03);
  s.lineTo(0.022, -0.07);
  s.quadraticCurveTo(0.042, -0.078, 0.045, -0.06);
  s.lineTo(0.028, 0.01);
  s.lineTo(0.055, 0.008);
  s.quadraticCurveTo(0.075, 0.012, 0.065, 0.03);
  s.lineTo(Math.cos(-Math.PI * 0.3) * 0.03, 0.065 + Math.sin(-Math.PI * 0.3) * 0.03);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.014, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 10 });
  geo.translate(0, 0, -0.007);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, std('xr-xmas-ginger', 0.75)));
  const icing = std('xr-xmas-icing', 0.4);
  const dot = new THREE.SphereGeometry(0.006, 8, 6);
  for (const [x, y] of [[-0.011, 0.072], [0.011, 0.072], [0, 0.03], [0, 0.005], [0, -0.02]]) {
    const d = new THREE.Mesh(dot, icing);
    d.position.set(x, y, 0.013);
    g.add(d);
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.01, 0.0025, 4, 12, Math.PI), icing);
  smile.position.set(0, 0.058, 0.012);
  smile.rotation.z = Math.PI;
  g.add(smile);
  return g;
}

function bell() {
  const pts = [[0, 0.06], [0.012, 0.058], [0.02, 0.045], [0.026, 0.02], [0.034, 0.002], [0.042, -0.01], [0.04, -0.016], [0, -0.012]].map(([x, y]) => new THREE.Vector2(x, y));
  const gold = std('xr-xmas-gold', 0.22, 1, { emissive: hex('xr-xmas-gold'), emissiveIntensity: 0.12 });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 24), gold));
  const clapper = new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 8), gold);
  clapper.position.y = -0.018;
  const bow = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.004, 6, 16), std('xr-xmas-red', 0.5));
  bow.position.y = 0.066;
  g.add(clapper, bow);
  return g;
}

function starShape(outer, inner, n = 5) {
  const s = new THREE.Shape();
  for (let i = 0; i < n * 2; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / n;
    const r = i % 2 === 0 ? outer : inner;
    if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  return s;
}

function strawStar() {
  const geo = new THREE.ExtrudeGeometry(starShape(0.05, 0.022, 8), { depth: 0.006, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 });
  geo.translate(0, 0, -0.003);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, std('xr-xmas-straw', 0.6)));
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 8, 6), std('xr-xmas-red', 0.5));
  knot.position.z = 0.006;
  g.add(knot);
  return g;
}

/** Ornaments of one kind at (y, angle offset) spots, facing outwards. */
const ornaments = (make, list, out = 0.03, drop = -0.03) => () => {
  const g = new THREE.Group();
  for (const [y, d] of list) {
    const o = faceOut(make(), FRONT + d);
    o.position.copy(spot(y, FRONT + d, out)).add(new THREE.Vector3(0, drop, 0));
    g.add(o);
  }
  return g;
};

// ---------- garland, fairy lights, presents, the star ----------

function garland() {
  const pts = [];
  for (let i = 0; i <= 120; i++) {
    const u = i / 120;
    const y = 0.42 + u * 0.98;
    const a = FRONT - 2.4 + u * Math.PI * 2 * 2.2;
    pts.push(spot(y, a, 0.035));
  }
  const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 240, 0.014, 6, false);
  const g = new THREE.Group();
  g.add(new THREE.Mesh(geo, std('xr-xmas-gold', 0.3, 1, { emissive: hex('xr-xmas-gold'), emissiveIntensity: 0.18 })));
  return g;
}

function presents() {
  const g = new THREE.Group();
  const list = [[-0.36, 0.3, 0.2, 0.17, 'xr-xmas-red', 'xr-xmas-gold', 0.35], [0.38, 0.26, 0.23, 0.15, 'xr-xmas-blue', 'xr-xmas-ribbon', -0.3], [0.02, 0.48, 0.16, 0.12, 'xr-xmas-green', 'xr-xmas-gold', 0.15]];
  for (const [x, z, w, h, paper, band, rot] of list) {
    const p = new THREE.Group();
    const r = std(band, 0.45);
    p.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, w), std(paper, 0.6)));
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(w + 0.004, h + 0.004, 0.03), r);
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.03, h + 0.004, w + 0.004), r);
    p.add(b1, b2);
    for (const sx of [-1, 1]) {
      const bow = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.008, 6, 16), r);
      bow.position.set(sx * 0.024, h / 2 + 0.018, 0);
      bow.rotation.y = sx * 0.4;
      p.add(bow);
    }
    p.children.forEach((c) => { c.position.y += h / 2; });
    p.position.set(x, 0, z);
    p.rotation.y = rot;
    g.add(p);
  }
  return g;
}

function topStar() {
  const g = new THREE.Group();
  const geo = new THREE.ExtrudeGeometry(starShape(0.13, 0.055), { depth: 0.04, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 2 });
  geo.translate(0, 0, -0.02);
  const star = new THREE.Mesh(geo, std('xr-xmas-star', 0.3, 0.6, { emissive: hex('xr-xmas-star'), emissiveIntensity: 0.7 }));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), color: hex('xr-xmas-star'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.setScalar(0.5);
  g.add(star, glow);
  g.position.y = 1.6;
  let time = 0;
  g.userData.tick = (dt) => {
    time += dt;
    glow.material.opacity = 0.55 + 0.25 * Math.sin(time * 2.4);
    star.rotation.y = Math.sin(time * 0.8) * 0.25;
  };
  return g;
}

/** The sponsor's piece (bonus answer, part of the finished tree): a big Echomotion medal. */
function sponsorMedal() {
  const g = new THREE.Group();
  const logo = new THREE.TextureLoader().load('assets/echomotion-logo.png');
  logo.colorSpace = THREE.SRGBColorSpace;
  const face = new THREE.MeshStandardMaterial({ map: logo, roughness: 0.35, metalness: 0.2, transparent: true });
  const rim = std('xr-xmas-gold', 0.22, 1, { emissive: hex('xr-xmas-gold'), emissiveIntensity: 0.15 });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.018, 48), [rim, face, face]);
  disc.rotation.x = Math.PI / 2;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.01, 8, 48), rim);
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, 6, 16), rim);
  loop.position.y = 0.115;
  g.add(disc, ring, loop);
  const p = spot(1.0, FRONT, 0.06);
  g.position.copy(p);
  g.userData.flag = true;
  return g;
}

/** Decorations per stage: one stage per correct answer (fresh objects every time). */
function stages(tree) {
  return [
    [baubles([[0.37, -0.85, 'xr-xmas-bauble-1'], [0.37, 0, 'xr-xmas-bauble-2'], [0.37, 0.85, 'xr-xmas-bauble-3']])],
    [ornaments(candyCane, [[0.6, -0.7], [0.6, 0.75]], 0.03, -0.02), ornaments(gingerbread, [[0.36, -0.42], [0.36, 0.43]], 0.05, -0.02)],
    [baubles([[0.81, -0.62, 'xr-xmas-bauble-4'], [0.81, 0.12, 'xr-xmas-bauble-1'], [0.81, 0.85, 'xr-xmas-bauble-2']], 0.06), ornaments(bell, [[0.6, -0.15], [0.6, 0.3]], 0.03, -0.04)],
    [garland, ornaments(strawStar, [[1.03, -0.45], [1.03, 0.45], [0.82, -1.15]], 0.04, -0.03)],
    [() => tree.fairyLights(), presents],
    [topStar, baubles([[1.24, -0.4, 'xr-xmas-bauble-3'], [1.24, 0.42, 'xr-xmas-bauble-4']], 0.05)],
  ];
}

export class QuizTree extends KnowledgeHouse {
  get introKey() {
    return 'treeIntro';
  }

  constructor(scene) {
    super(scene);
    // Snow on the island instead of a lawn.
    this.grassColor = new THREE.Color(hex('xr-snow'));
    this.grassMat.color.copy(this.grassColor);
    this.holder = new THREE.Group();
    this.holder.scale.setScalar(S);
    this.model.add(this.holder);
    this.mats = treeMaterials();
    this.needleColors = ['XmasNeedle', 'XmasNeedleTip'].map((n) => this.mats[n].color.clone());
    this.dryColor = new THREE.Color(hex('xr-xmas-needle-dry'));
    this.stagesList = stages(this);
    loadGLTF(TREE_URL).then((gltf) => {
      const tree = gltf.scene.getObjectByName('QuizTree')?.clone(true);
      if (!tree || this.scene.disposed) return;
      tree.position.set(0, 0, 0);
      tree.traverse((o) => {
        if (!o.isMesh) return;
        o.material = this.mats[o.material.name] ?? o.material;
        o.castShadow = true;
      });
      this.holder.add(tree);
    }).catch((e) => console.warn('Quiz tree not loaded', e));
    this.label.redraw();
  }

  /** Fairy lights winding around the tree (twinkling, see christmas.js). */
  fairyLights() {
    const pts = [];
    const n = 40;
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n;
      const y = 0.38 + u * 1.04;
      pts.push(spot(y, FRONT - 1.6 + u * Math.PI * 2 * 2.6, 0.025));
    }
    // The halos are screen-sized points: scaled like the tree (holder and quiz group).
    const lights = makeBulbs(pts, { size: 0.02, halo: 0.09 * S * 1.25 });
    const tick = lights.userData.tick;
    delete lights.userData.tick;
    const g = new THREE.Group();
    g.add(lights);
    g.userData.tick = () => tick(this.time);
    return g;
  }

  labelText() {
    const stars = this.stars ? `  ·  +${this.stars} ${t('houseStars')}` : '';
    return `${t('treeName')}: ${this.pieces}/${STAGE_COUNT} ${t('treeStages')}  ·  ${this.damage.length} ${t(this.damage.length === 1 ? 'treeDamageOne' : 'treeDamage')}${stars}`;
  }

  reset() {
    super.reset();
    this.treeDry = 0;
    this.mats.XmasNeedle.color.copy(this.needleColors[0]);
    this.mats.XmasNeedleTip.color.copy(this.needleColors[1]);
  }

  /** Correct answer: the next stage of decorations (a bonus answer also hangs the medal). */
  good({ bonus = false } = {}) {
    if (bonus && !this.hasFlag) this.addPart(sponsorMedal());
    const idx = this.pieces;
    if (idx < STAGE_COUNT) {
      const parts = this.stagesList[idx].map((make) => make());
      if (idx === STAGE_COUNT - 1 && !this.hasFlag) parts.push(sponsorMedal());
      this.addStage(parts);
      if (idx === STAGE_COUNT - 1) this.delay(0.6, () => this.scene.burst(this.worldPoint(0, 1.7 * S, 0), 'xr-warning', 40));
    } else {
      this.stars += 1;
      this.scene.burst(this.worldPoint(0, 1.7 * S, 0), 'xr-warning', 18);
    }
    sfx.build();
    this.label.redraw();
  }

  rating() {
    if (this.pieces === STAGE_COUNT && this.damage.length === 0) return 'treeDream';
    if (this.pieces >= 4) return 'treeCozy';
    if (this.pieces >= 2) return 'treeSite';
    return 'treeRuin';
  }

  get complete() {
    return this.pieces === STAGE_COUNT;
  }

  // ---------- internals (in tree units, on the holder) ----------

  addStage(parts) {
    const stage = new THREE.Group();
    parts.forEach((p) => stage.add(p));
    this.holder.add(stage);
    this.built.push(stage);
    parts.forEach((part, i) => {
      part.scale.setScalar(0.01);
      this.delay(i * 0.18, () => this.popIn(part));
    });
  }

  addPart(obj) {
    this.holder.add(obj);
    this.built.push(obj);
    this.popIn(obj);
  }

  /** Decorations swing in from above and settle with a little overshoot. */
  popIn(obj) {
    const y0 = obj.position.y;
    this.scene.tween(0.5, (k) => {
      obj.scale.setScalar(Math.max(0.01, easeOutBack(k)));
      obj.position.y = y0 + 0.25 * (1 - k);
    }, { ease: (k) => k });
    obj.updateMatrixWorld(true);
    const center = new THREE.Box3().setFromObject(obj).getCenter(new THREE.Vector3());
    if (Number.isFinite(center.x)) this.scene.burst(center, 'xr-success', 8);
  }

  /** The decorations fall off to the snow and fade away. */
  dropPart(obj) {
    const start = obj.position.clone();
    const side = Math.random() < 0.5 ? -1 : 1;
    const mats = [];
    obj.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.transparent = true; mats.push(m); }); });
    this.scene.tween(1.0, (k) => {
      obj.position.set(start.x + side * 0.25 * k, start.y - 1.2 * k * k, start.z + 0.35 * k);
      obj.rotation.z = side * 0.8 * k;
      mats.forEach((m) => { m.opacity = 1 - k * k; });
    }, { ease: (k) => k, onDone: () => this.disposeObj(obj) });
  }

  /** Mishaps: needles on the snow, a broken bauble, a dry tree, then it leans. */
  addDamage(n) {
    const kind = ['needles', 'shards', 'dry'][n] ?? 'tilt';
    let obj = null;
    if (kind === 'needles') obj = this.needlesOnSnow();
    if (kind === 'shards') obj = this.shards();
    if (kind === 'dry') this.treeDry = 1; // the needles dry out (the snow stays white)
    if (kind === 'tilt') this.tilt = Math.min(0.3, this.tilt + 0.07);
    const marker = obj ?? new THREE.Group();
    marker.userData.kind = kind;
    this.holder.add(marker);
    this.damage.push(marker);
  }

  needlesOnSnow() {
    const g = new THREE.Group();
    const m = std('xr-xmas-needle-dry', 0.8);
    const geo = new THREE.BoxGeometry(0.05, 0.006, 0.006);
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.25 + Math.random() * 0.45;
      const n = new THREE.Mesh(geo, m);
      n.position.set(Math.cos(a) * r, 0.004, Math.sin(a) * r);
      n.rotation.y = Math.random() * Math.PI;
      g.add(n);
    }
    return g;
  }

  shards() {
    const g = new THREE.Group();
    const m = new THREE.MeshPhysicalMaterial({ color: hex('xr-xmas-bauble-3'), roughness: 0.15, metalness: 0.35, clearcoat: 1, side: THREE.DoubleSide });
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Mesh(new THREE.TetrahedronGeometry(0.02 + Math.random() * 0.015), m);
      s.position.set(0.3 + Math.random() * 0.16, 0.008, 0.38 + Math.random() * 0.12);
      s.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      s.scale.y = 0.35;
      g.add(s);
    }
    return g;
  }

  tick(dt) {
    super.tick(dt);
    if (this.treeDry && this.mats) {
      const k = Math.min(1, dt * 1.5);
      this.mats.XmasNeedle.color.lerp(this.dryColor, k);
      this.mats.XmasNeedleTip.color.lerp(this.dryColor, k);
    }
  }
}
