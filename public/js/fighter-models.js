// Detailed fighter models for the AI arena (original designs):
//  - buildHuman: the human fighter in a business look (face, hair, dark suit, leather shoes);
//    fallback and joint rig for the Blender model (fighter-human.glb)
//  - buildAndroid: a menacing chrome combat android (faceless helmet with a light band,
//    hydraulic pistons, cable bundles, armor plates, mechanical fingers) in three variants.
// Both fill the same joint rig (see Fighter in fight-visuals.js), so all poses work for both.
import * as THREE from 'three';
import { hex } from './tokens.js';

const V2 = (r, y) => new THREE.Vector2(r, y);

function std(token, extra = {}) {
  return new THREE.MeshStandardMaterial({ color: hex(token), roughness: 0.5, metalness: 0, ...extra });
}

// ---------- geometry helpers (all limbs hang along -y from their joint) ----------

function limb(rTop, rBot, len, mat, radial = 32) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, radial, 8), mat);
  m.position.y = -len / 2;
  return m;
}
function ball(r, mat, w = 36, h = 28) {
  return new THREE.Mesh(new THREE.SphereGeometry(r, w, h), mat);
}
function lathe(points, mat, segs = 64) {
  return new THREE.Mesh(new THREE.LatheGeometry(points.map(([r, y]) => V2(r, y)), segs), mat);
}
function capsule(r, len, mat) {
  const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 10, 24), mat);
  return m;
}
function rbox(w, h, d, r, mat) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  const geo = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, d - r), bevelEnabled: true, bevelThickness: r / 2, bevelSize: r / 2, bevelSegments: 4, curveSegments: 8 });
  geo.center();
  return new THREE.Mesh(geo, mat);
}
function tube(points, radius, mat) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return new THREE.Mesh(new THREE.TubeGeometry(curve, 24, radius, 10, false), mat);
}
function joint(f, name, parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  f.j[name] = g;
  return g;
}

// ---------- human fighter ----------

const rnd = (i) => { const x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); };
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const HEAD_R = 0.1;
// Facial features as gaussian bumps on the unit sphere: center, spread (x, y, z), height (fraction of
// the radius), mirrored to both sides.
const FACE = [
  [[0, -0.8, 0.6], [0.34, 0.2, 0.3], 0.06, false], // chin
  [[0.6, -0.5, 0.45], [0.2, 0.25, 0.25], 0.05, true], // jaw angle
  [[0.52, -0.02, 0.78], [0.17, 0.12, 0.2], 0.045, true], // cheekbone
  [[0, 0.32, 0.95], [0.3, 0.08, 0.2], 0.03, false], // brow ridge (center)
  [[0.34, 0.3, 0.88], [0.15, 0.06, 0.2], 0.04, true], // brow ridge
  [[0.33, 0.13, 0.93], [0.11, 0.08, 0.2], -0.075, true], // eye socket
  [[0, 0.1, 1], [0.05, 0.12, 0.2], 0.06, false], // nose bridge
  [[0, -0.08, 1], [0.065, 0.1, 0.2], 0.13, false], // nose
  [[0, -0.19, 0.98], [0.07, 0.05, 0.2], 0.12, false], // nose tip
  [[0.09, -0.22, 0.97], [0.05, 0.04, 0.2], 0.05, true], // nostril wing
  [[0, -0.36, 0.93], [0.13, 0.04, 0.2], 0.035, false], // upper lip
  [[0, -0.47, 0.88], [0.11, 0.04, 0.2], 0.035, false], // lower lip
  [[0, -0.415, 0.91], [0.14, 0.012, 0.2], -0.02, false], // mouth line
  [[0.2, -0.42, 0.9], [0.05, 0.06, 0.2], -0.012, true], // mouth corners
  [[0.78, 0.25, 0.5], [0.15, 0.2, 0.25], -0.025, true], // temples
];
const gauss = (n, c, s) => {
  const dx = (n.x - c[0]) / s[0];
  const dy = (n.y - c[1]) / s[1];
  const dz = (n.z - c[2]) / s[2];
  return Math.exp(-(dx * dx + dy * dy + dz * dz) / 2);
};
const feature = (n, f) => gauss(n, f[0], f[1]) + (f[3] ? gauss(n, [-f[0][0], f[0][1], f[0][2]], f[1]) : 0);

/** Point on the sculpted head surface for a unit direction n (head local, centered). */
function headPoint(n, extra = 0) {
  let d = 0;
  for (const f of FACE) d += f[2] * feature(n, f);
  const p = n.clone().multiplyScalar(HEAD_R * (1 + d) + extra);
  p.x *= 0.84;
  p.y *= 1.1;
  p.z *= 0.97;
  if (n.y < -0.1) p.x *= 1 - 0.17 * smooth(-0.1, -0.95, n.y); // narrower jaw
  if (n.y < -0.55) p.y *= 1 - 0.1 * smooth(-0.55, -1, n.y); // shorter chin
  if (n.z < 0 && n.y > -0.25) p.z *= 1.07; // back of the skull
  if (n.z < 0.2 && n.y < -0.3) p.z *= 1 - 0.25 * smooth(-0.3, -0.9, n.y); // under the jaw
  return p;
}
const dir = (x, y, z) => new THREE.Vector3(x, y, z).normalize();

function sculptedHead(skinHex, lipHex, shadeHex) {
  const geo = new THREE.SphereGeometry(1, 128, 96);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const skin = new THREE.Color(skinHex);
  const lip = new THREE.Color(lipHex);
  const shade = new THREE.Color(shadeHex);
  const warm = skin.clone().lerp(lip, 0.35);
  const n = new THREE.Vector3();
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    n.fromBufferAttribute(pos, i).normalize();
    pos.setXYZ(i, ...headPoint(n).toArray());
    const lips = Math.min(1, 1.3 * (feature(n, FACE[10]) + feature(n, FACE[11])));
    const cheek = 0.18 * feature(n, [[0.5, -0.12, 0.8], [0.15, 0.12, 0.2], 1, true]);
    const socket = 0.3 * feature(n, FACE[5]);
    c.copy(skin).lerp(warm, cheek).lerp(shade, socket).lerp(lip, lips * 0.85);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

/** Hairline: 0 = no hair, 1 = full hair (short fade on the sides, longer on top). */
function hairWeight(n) {
  const az = Math.abs(Math.atan2(n.x, n.z));
  const line = az < 0.6 ? 0.5 : az < 1.1 ? 0.5 - (az - 0.6) * 0.3 : az < 1.7 ? 0.35 - (az - 1.1) * 0.25 : az < 2.4 ? 0.2 - (az - 1.7) * 0.75 : -0.33;
  return smooth(line, line + 0.1, n.y);
}

function hairTexture(hairHex) {
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 256;
  const ctx = cv.getContext('2d');
  const base = new THREE.Color(hairHex);
  ctx.fillStyle = `#${base.getHexString()}`;
  ctx.fillRect(0, 0, cv.width, cv.height);
  for (let i = 0; i < 1400; i++) {
    const x = rnd(i) * cv.width;
    const l = 0.5 + rnd(i + 7) * 0.9;
    const c = base.clone().multiplyScalar(l);
    ctx.strokeStyle = `rgba(${Math.round(Math.min(1, c.r) * 255)},${Math.round(Math.min(1, c.g) * 255)},${Math.round(Math.min(1, c.b) * 255)},0.55)`;
    ctx.lineWidth = 0.6 + rnd(i + 3) * 1.4;
    ctx.beginPath();
    const y0 = rnd(i + 11) * cv.height * 0.5;
    ctx.moveTo(x, y0);
    ctx.quadraticCurveTo(x + (rnd(i + 5) - 0.5) * 12, y0 + 60, x + (rnd(i + 9) - 0.5) * 18, y0 + 90 + rnd(i + 2) * 90);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

function hairCap(mat) {
  const geo = new THREE.SphereGeometry(1, 128, 96);
  const pos = geo.attributes.position;
  const n = new THREE.Vector3();
  const keep = new Uint8Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    n.fromBufferAttribute(pos, i).normalize();
    const w = hairWeight(n);
    keep[i] = w > 0.03 ? 1 : 0;
    const thick = (0.0035 + 0.011 * smooth(0.15, 0.7, n.y)) * w; // fade: short sides, volume on top
    pos.setXYZ(i, ...headPoint(n, 0.0012 + thick).toArray());
  }
  const idx = geo.index.array;
  const out = [];
  for (let i = 0; i < idx.length; i += 3) if (keep[idx[i]] && keep[idx[i + 1]] && keep[idx[i + 2]]) out.push(idx[i], idx[i + 1], idx[i + 2]);
  geo.setIndex(out);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

/** Grid surface around the y axis: fn(u, v) -> Vector3, u around (0..1), v up (0..1). Normals face out. */
function wrapSurface(segU, segV, fn, mat) {
  const pos = [];
  const uv = [];
  for (let j = 0; j <= segV; j++) {
    for (let i = 0; i <= segU; i++) {
      const p = fn(i / segU, j / segV);
      pos.push(p.x, p.y, p.z);
      uv.push(i / segU, j / segV);
    }
  }
  const idx = [];
  for (let j = 0; j < segV; j++) {
    for (let i = 0; i < segU; i++) {
      const a = j * (segU + 1) + i;
      const b = a + 1;
      const c = a + segU + 1;
      const d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // Make sure the normals point outwards (front vertex must face +z).
  const front = Math.round(segV / 2) * (segU + 1) + Math.round(segU / 2);
  if (geo.attributes.normal.getZ(front) < 0) {
    for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
    geo.setIndex(idx);
    geo.computeVertexNormals();
  }
  return new THREE.Mesh(geo, mat);
}

const lerpProfile = (ys, vals, y) => {
  if (y <= ys[0]) return vals[0];
  for (let i = 1; i < ys.length; i++) {
    if (y <= ys[i]) { const t = smooth(ys[i - 1], ys[i], y); return vals[i - 1] + (vals[i] - vals[i - 1]) * t; }
  }
  return vals[vals.length - 1];
};

export function buildHuman(f) {
  const accent = f.token;
  const skinHex = hex('xr-fight-skin');
  const skin = new THREE.MeshPhysicalMaterial({ color: skinHex, roughness: 0.5, sheen: 0.6, sheenRoughness: 0.5, sheenColor: new THREE.Color(hex('xr-fight-lip')), clearcoat: 0.06, clearcoatRoughness: 0.6 });
  const headSkin = skin.clone();
  headSkin.color.setHex(0xffffff);
  headSkin.vertexColors = true;
  // Business look (matches the Blender model that replaces this figure once loaded):
  // dark suit fabric, bare hands, black leather shoes.
  const shirt = std('xr-fight-suit', { roughness: 0.7 });
  const pants = std('xr-fight-suit', { roughness: 0.75 });
  const hairMat = new THREE.MeshStandardMaterial({ map: hairTexture(hex('xr-fight-hair')), roughness: 0.62, metalness: 0.05 });
  const hairSolid = std('xr-fight-hair', { roughness: 0.65 });
  const glove = skin;
  const shoe = std('xr-fight-leather', { roughness: 0.3 });
  const sole = std('xr-fight-wrap', { roughness: 0.55 });
  const eyeWhite = std('xr-fight-wrap', { roughness: 0.15 });
  const irisMat = std('xr-fight-iris', { roughness: 0.2 });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x050505 });
  const shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const band = new THREE.MeshStandardMaterial({ color: hex(accent), emissive: hex(accent), emissiveIntensity: 0.55, roughness: 0.4 });
  f.flashMats = [skin, headSkin, shirt, pants];

  // ----- pelvis: training pants with a sash -----
  const hips = joint(f, 'hips', f.body, 0, 0.98, 0);
  const pelvis = lathe([[0, -0.1], [0.11, -0.1], [0.145, -0.05], [0.15, 0.02], [0.142, 0.08], [0.134, 0.12], [0, 0.12]], pants);
  pelvis.scale.z = 0.76;
  hips.add(pelvis);
  const sash = new THREE.Mesh(new THREE.TorusGeometry(0.142, 0.015, 12, 72), band);
  sash.rotation.x = Math.PI / 2;
  sash.scale.y = 0.76;
  sash.position.y = 0.105;
  const knot = ball(0.022, band);
  knot.position.set(0.06, 0.09, 0.1);
  hips.add(sash, knot);
  for (const [k, dx] of [[0, 0.065], [1, 0.08]]) {
    const tail = tube([[dx, 0.085, 0.105], [dx + 0.01, 0.04, 0.112], [dx + 0.004 + k * 0.01, -0.02, 0.11]], 0.009, band);
    hips.add(tail);
  }

  // ----- waist (bridges pelvis and chest when the spine bends) -----
  const spine = joint(f, 'spine', hips, 0, 0.1, 0);
  const waist = lathe([[0, -0.03], [0.128, -0.03], [0.125, 0.05], [0.13, 0.13], [0, 0.13]], std(accent, { roughness: 0.75 }), 48);
  waist.scale.z = 0.72;
  spine.add(waist);

  // ----- sculpted torso in a sleeveless sports shirt -----
  const chest = joint(f, 'chest', spine, 0, 0.16, 0);
  const ys = [-0.2, -0.06, 0.05, 0.15, 0.24, 0.31, 0.35, 0.375];
  const A = [0.138, 0.125, 0.13, 0.152, 0.168, 0.165, 0.118, 0.058];
  const B = [0.094, 0.085, 0.09, 0.104, 0.112, 0.098, 0.074, 0.05];
  const P = 2.6;
  const torso = wrapSurface(96, 56, (u, v) => {
    const y = -0.2 + v * 0.575;
    const th = Math.PI + u * Math.PI * 2;
    const s = Math.sin(th);
    const c = Math.cos(th);
    const a = lerpProfile(ys, A, y);
    const b = lerpProfile(ys, B, y);
    const x = a * Math.sign(s) * Math.abs(s) ** (2 / P);
    let z = b * Math.sign(c) * Math.abs(c) ** (2 / P);
    const front = Math.max(0, c);
    const back = Math.max(0, -c);
    for (const sx of [-1, 1]) {
      z += 0.013 * front * Math.exp(-(((x - sx * 0.068) / 0.052) ** 2) - (((y - 0.245) / 0.045) ** 2)); // pecs
      z -= 0.008 * back * Math.exp(-(((x - sx * 0.07) / 0.045) ** 2) - (((y - 0.22) / 0.06) ** 2)); // shoulder blades
    }
    z -= 0.004 * front * Math.exp(-((x / 0.008) ** 2)) * smooth(-0.1, 0.0, y) * (1 - smooth(0.17, 0.22, y)); // abs line
    return new THREE.Vector3(x, y, z);
  }, shirt);
  chest.add(torso);
  f.core = new THREE.Object3D();
  f.core.position.set(0, 0.22, 0.1);
  chest.add(f.core);

  // ----- neck and head -----
  const neck = joint(f, 'neck', chest, 0, 0.37, 0);
  const nk = lathe([[0.068, -0.03], [0.056, 0.01], [0.052, 0.06], [0.054, 0.11]], skin, 48);
  nk.scale.z = 0.9;
  neck.add(nk);
  const head = joint(f, 'head', neck, 0, 0.08, 0);
  const face = new THREE.Group();
  face.position.y = 0.095;
  head.add(face);
  face.add(new THREE.Mesh(sculptedHead(skinHex, hex('xr-fight-lip'), hex('xr-fight-skin-shade')), headSkin));

  // Eyes in their sockets: white, iris, pupil, highlight, upper and lower lid
  for (const sx of [-1, 1]) {
    const n = dir(sx * 0.33, 0.13, 0.93);
    const surf = headPoint(n);
    const r = 0.0122;
    const eye = new THREE.Group();
    eye.position.copy(surf).addScaledVector(n, -0.0045);
    const white = ball(r, eyeWhite, 32, 24);
    const iris = new THREE.Mesh(new THREE.CircleGeometry(r * 0.52, 32), irisMat);
    iris.position.z = r * 0.985;
    const pupil = new THREE.Mesh(new THREE.CircleGeometry(r * 0.24, 24), pupilMat);
    pupil.position.z = r + 0.0003;
    const glint = new THREE.Mesh(new THREE.CircleGeometry(r * 0.09, 12), shine);
    glint.position.set(r * 0.18, r * 0.2, r + 0.0006);
    const upper = new THREE.Mesh(new THREE.SphereGeometry(r * 1.1, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.42), headSkin.clone());
    upper.material.vertexColors = false;
    upper.material.color.setHex(hex('xr-fight-skin-shade'));
    upper.rotation.x = 0.28;
    const lower = new THREE.Mesh(new THREE.SphereGeometry(r * 1.06, 32, 12, 0, Math.PI * 2, Math.PI * 0.74, Math.PI * 0.26), skin);
    lower.rotation.x = -0.1;
    eye.add(white, iris, pupil, glint, upper, lower);
    face.add(eye);
    // Eyebrow: slightly lowered towards the nose for a focused look
    const brow = [dir(sx * 0.15, 0.27, 0.97), dir(sx * 0.27, 0.32, 0.93), dir(sx * 0.41, 0.31, 0.87), dir(sx * 0.53, 0.26, 0.8)].map((d) => headPoint(d, 0.0025).toArray());
    face.add(tube(brow, 0.0042, hairSolid));
    // Ear
    const ear = new THREE.Group();
    ear.position.copy(headPoint(dir(sx, 0.02, -0.08), 0.004));
    ear.rotation.y = sx * 0.3;
    const shell = ball(0.03, skin, 28, 20);
    shell.scale.set(0.3, 1, 0.62);
    const inner = ball(0.018, std('xr-fight-skin-shade', { roughness: 0.6 }), 20, 14);
    inner.scale.set(0.25, 0.9, 0.55);
    inner.position.x = sx * 0.004;
    const lobe = ball(0.01, skin, 16, 12);
    lobe.position.set(0, -0.026, 0.004);
    ear.add(shell, inner, lobe);
    face.add(ear);
  }

  // Hair: sculpted fade cut with strands texture, swept tufts on top and a small top knot
  face.add(hairCap(hairMat));
  for (let i = 0; i < 26; i++) {
    const a = (rnd(i) - 0.5) * 2.2;
    const up = 0.55 + rnd(i + 30) * 0.35;
    const n = dir(Math.sin(a) * (1 - up), up, Math.cos(a) * (1 - up) + 0.15);
    if (hairWeight(n) < 0.6) continue;
    const base = headPoint(n, 0.006);
    const tuft = new THREE.Mesh(new THREE.ConeGeometry(0.012 + rnd(i + 3) * 0.006, 0.05 + rnd(i + 5) * 0.03, 8), hairSolid);
    const axis = n.clone().multiplyScalar(0.35).add(new THREE.Vector3(0, -0.2, -1)).normalize();
    tuft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
    tuft.position.copy(base).addScaledVector(axis, 0.02);
    face.add(tuft);
  }
  const bunAt = headPoint(dir(0, 0.62, -0.78), 0.012);
  const bun = ball(0.026, hairMat, 28, 20);
  bun.position.copy(bunAt).add(new THREE.Vector3(0, 0.006, -0.012));
  const tie = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.005, 10, 32), band);
  tie.position.copy(bunAt).add(new THREE.Vector3(0, -0.004, -0.004));
  tie.rotation.x = 0.9;
  face.add(bun, tie);
  // Headband following the head shape just above the hairline
  const bandPts = [];
  for (let k = 0; k < 48; k++) {
    const az = (k / 48) * Math.PI * 2;
    const y = 0.5 - 0.12 * (1 - Math.cos(az)) / 2;
    const d = dir(Math.sin(az) * Math.sqrt(1 - y * y), y, Math.cos(az) * Math.sqrt(1 - y * y));
    bandPts.push(headPoint(d, 0.0035 + 0.011 * hairWeight(d) * smooth(0.15, 0.7, d.y)));
  }
  face.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bandPts, true), 96, 0.0065, 8, true), band));

  // ----- arms: deltoid, biceps, forearm, fingerless fight gloves -----
  for (const side of ['l', 'r']) {
    const sx = side === 'l' ? 1 : -1;
    const sh = joint(f, `${side}Shoulder`, chest, sx * 0.19, 0.3, 0);
    const delt = ball(0.047, skin, 40, 30);
    delt.scale.set(0.95, 1.25, 1.0);
    delt.position.y = -0.03;
    sh.add(delt);
    sh.add(lathe([[0.046, 0.0], [0.05, -0.04], [0.05, -0.09], [0.046, -0.15], [0.04, -0.22], [0.036, -0.27]], skin, 48));
    const bicep = ball(0.03, skin, 28, 20);
    bicep.scale.set(1, 1.7, 0.85);
    bicep.position.set(0, -0.13, 0.016);
    const tricep = ball(0.029, skin, 28, 20);
    tricep.scale.set(1, 1.8, 0.8);
    tricep.position.set(0, -0.11, -0.015);
    sh.add(bicep, tricep);
    const el = joint(f, `${side}Elbow`, sh, 0, -0.27, 0);
    el.add(ball(0.037, skin, 28, 20));
    el.add(lathe([[0.037, 0.0], [0.044, -0.05], [0.042, -0.11], [0.034, -0.17], [0.03, -0.21]], skin, 48));
    // Glove cuff with a strap in the fighter's color
    const cuff = limb(0.034, 0.036, 0.05, glove, 32);
    cuff.position.y = -0.215;
    const strap = new THREE.Mesh(new THREE.CylinderGeometry(0.037, 0.037, 0.014, 32), band);
    strap.position.y = -0.218;
    el.add(cuff, strap);
    const hand = new THREE.Group();
    hand.position.y = -0.275;
    const backOfHand = rbox(0.07, 0.07, 0.048, 0.016, glove);
    const pad = rbox(0.076, 0.03, 0.05, 0.013, glove);
    pad.position.set(0, -0.042, 0.004);
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.003, 0.052), band);
    seam.position.set(0, -0.026, 0.004);
    hand.add(backOfHand, pad, seam);
    for (let i = 0; i < 4; i++) {
      const fx = (i - 1.5) * 0.017;
      const finger = capsule(0.0085, 0.014, skin);
      finger.rotation.x = Math.PI / 2;
      finger.position.set(fx, -0.045, 0.03);
      hand.add(finger);
    }
    const thumb = capsule(0.0095, 0.026, skin);
    thumb.position.set(sx * 0.012, -0.03, 0.034);
    thumb.rotation.set(0, 0, Math.PI / 2 - sx * 0.25);
    hand.add(thumb);
    el.add(hand);
    f[`${side}Fist`] = backOfHand;
  }

  // ----- legs: joggers, high-top trainers -----
  for (const side of ['l', 'r']) {
    const sx = side === 'l' ? 1 : -1;
    const hp = joint(f, `${side}Hip`, hips, sx * 0.085, 0, 0);
    hp.add(lathe([[0.072, 0.03], [0.078, -0.05], [0.073, -0.18], [0.061, -0.32], [0.051, -0.44]], pants, 48));
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.42, 0.012), band);
    stripe.position.set(sx * 0.07, -0.2, 0);
    stripe.rotation.z = sx * 0.045;
    hp.add(stripe);
    const kn = joint(f, `${side}Knee`, hp, 0, -0.44, 0);
    kn.add(ball(0.05, pants, 32, 24));
    kn.add(lathe([[0.05, 0.0], [0.053, -0.07], [0.046, -0.22], [0.038, -0.34], [0.041, -0.38], [0.043, -0.41]], pants, 48));
    const shinStripe = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.36, 0.012), band);
    shinStripe.position.set(sx * 0.048, -0.19, 0);
    kn.add(shinStripe);
    const an = joint(f, `${side}Ankle`, kn, 0, -0.44, 0);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.009, 12, 32), shoe);
    collar.rotation.x = Math.PI / 2;
    collar.position.y = 0.035;
    const upperShoe = lathe([[0.04, 0.035], [0.044, 0.0], [0.05, -0.03], [0.055, -0.05]], shoe, 40);
    const toeBox = ball(0.058, shoe, 40, 28);
    toeBox.scale.set(0.9, 0.55, 1.75);
    toeBox.position.set(0, -0.03, 0.045);
    const soleMesh = rbox(0.112, 0.024, 0.25, 0.011, sole);
    soleMesh.position.set(0, -0.058, 0.04);
    const swoosh = tube([[sx * 0.051, -0.04, -0.03], [sx * 0.053, -0.02, 0.03], [sx * 0.046, -0.035, 0.1]], 0.004, band);
    an.add(collar, upperShoe, toeBox, soleMesh, swoosh);
    for (let k = 0; k < 4; k++) {
      const lace = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.003, 0.006), sole);
      lace.position.set(0, 0.0 - k * 0.006, 0.035 + k * 0.022);
      lace.rotation.x = -0.6;
      an.add(lace);
    }
    f[`${side}Foot`] = toeBox;
  }
}

// ---------- chrome combat android ----------

const VARIANTS = {
  light: { bulk: 0.94, chrome: 'xr-fight-chrome', fins: true },
  heavy: { bulk: 1.14, chrome: 'xr-fight-chrome-dark', plates: true },
  boss: { bulk: 1.06, chrome: 'xr-fight-gunmetal', crest: true, halo: true, plates: true },
};

export function buildAndroid(f, variant) {
  const v = VARIANTS[variant] ?? VARIANTS.light;
  const b = v.bulk;
  const accent = f.token;
  const chrome = new THREE.MeshStandardMaterial({ color: hex(v.chrome), metalness: 1, roughness: 0.16, emissive: hex(accent), emissiveIntensity: 0 });
  const dark = new THREE.MeshStandardMaterial({ color: hex('xr-fight-joint'), metalness: 0.85, roughness: 0.38 });
  const visor = new THREE.MeshStandardMaterial({ color: hex('xr-fight-dark'), metalness: 0.4, roughness: 0.08 });
  const glow = new THREE.MeshBasicMaterial({ color: hex(accent) });
  const cable = new THREE.MeshStandardMaterial({ color: hex('xr-fight-cable'), metalness: 0.3, roughness: 0.6 });
  const piston = new THREE.MeshStandardMaterial({ color: hex('xr-fight-chrome'), metalness: 1, roughness: 0.08 });
  f.flashMats = [chrome];

  const strip = (len, x, y, z, parent, rot = 0) => {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.008, len, 0.004), glow);
    s.position.set(x, y, z);
    s.rotation.z = rot;
    parent.add(s);
  };

  // Pelvis
  const hips = joint(f, 'hips', f.body, 0, 0.98, 0);
  const pelvis = lathe([[0, -0.09], [0.1 * b, -0.09], [0.14 * b, -0.04], [0.15 * b, 0.03], [0.12 * b, 0.1], [0, 0.1]], chrome);
  pelvis.scale.z = 0.72;
  hips.add(pelvis);
  const crotch = rbox(0.08 * b, 0.07, 0.06, 0.012, dark);
  crotch.position.set(0, -0.08, 0.04);
  hips.add(crotch);
  for (const sx of [-1, 1]) {
    const hj = ball(0.055 * b, dark, 28, 22);
    hj.position.set(sx * 0.1 * b, -0.02, 0);
    hips.add(hj);
  }

  // Segmented abdomen and spine
  const spine = joint(f, 'spine', hips, 0, 0.1, 0);
  for (let i = 0; i < 4; i++) {
    const w = (0.17 - i * 0.004) * b;
    const plate = rbox(w, 0.032, 0.11 * b, 0.012, i % 2 ? dark : chrome);
    plate.position.set(0, 0.0 + i * 0.038, 0.035);
    spine.add(plate);
  }
  const spineCol = limb(0.025, 0.025, 0.16, dark, 16);
  spineCol.position.set(0, 0.08, -0.05);
  spine.add(spineCol);

  // Chest: armored pecs, reactor core, collar, back plate, side ribs
  const chest = joint(f, 'chest', spine, 0, 0.16, 0);
  const rib = lathe([[0, -0.04], [0.12 * b, -0.04], [0.15 * b, 0.05], [0.17 * b, 0.15], [0.175 * b, 0.24], [0.16 * b, 0.31], [0.11 * b, 0.35], [0, 0.36]], dark);
  rib.scale.set(1.1, 1, 0.7);
  chest.add(rib);
  for (const sx of [-1, 1]) {
    const pec = rbox(0.15 * b, 0.13, 0.06, 0.03, chrome);
    pec.position.set(sx * 0.082 * b, 0.23, 0.085 * b);
    pec.rotation.set(-0.12, sx * 0.25, sx * -0.08);
    chest.add(pec);
    for (let i = 0; i < 3; i++) strip(0.05, sx * (0.16 * b), 0.08 + i * 0.045, 0.02, chest, sx * 0.4);
    const lat = rbox(0.05, 0.16, 0.12 * b, 0.02, chrome);
    lat.position.set(sx * 0.165 * b, 0.13, -0.01);
    lat.rotation.z = sx * 0.12;
    chest.add(lat);
  }
  const back = rbox(0.24 * b, 0.26, 0.05, 0.025, chrome);
  back.position.set(0, 0.2, -0.085 * b);
  chest.add(back);
  const coreRing = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.009, 12, 40), chrome);
  coreRing.position.set(0, 0.16, 0.115 * b);
  const core = ball(0.032, glow, 24, 18);
  core.position.set(0, 0.16, 0.112 * b);
  chest.add(coreRing, core);
  f.core = core;
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.075 * b, 0.016, 12, 48), dark);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 0.345;
  chest.add(collar);
  if (v.plates) {
    for (const sx of [-1, 1]) {
      const plate = rbox(0.09, 0.05, 0.14, 0.015, chrome);
      plate.position.set(sx * 0.12 * b, 0.34, 0);
      plate.rotation.z = sx * -0.3;
      chest.add(plate);
    }
  }

  // Neck with cable bundles
  const neck = joint(f, 'neck', chest, 0, 0.37, 0);
  const nk = limb(0.035, 0.045, 0.1, dark, 20);
  nk.position.y = 0.05;
  neck.add(nk);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    neck.add(tube([[Math.cos(a) * 0.05, -0.02, Math.sin(a) * 0.04], [Math.cos(a) * 0.045, 0.04, Math.sin(a) * 0.04], [Math.cos(a) * 0.035, 0.1, Math.sin(a) * 0.03]], 0.007, cable));
  }

  // Head: faceless helmet with a glowing light band
  const head = joint(f, 'head', neck, 0, 0.08, 0);
  const helm = ball(0.1, chrome, 48, 40);
  helm.scale.set(0.84, 1.12, 1.02);
  helm.position.y = 0.11;
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.102, 48, 24, Math.PI / 2 - 1.05, 2.1, Math.PI * 0.3, Math.PI * 0.32), visor);
  face.scale.set(0.86, 1.12, 1.03);
  face.position.y = 0.11;
  face.rotation.y = 0;
  // Glowing light band across the visor (open cylinder segment around the front)
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.107, 0.107, 0.015, 48, 1, true, -0.95, 1.9), glow);
  band.scale.set(0.86, 1, 1.03);
  band.position.set(0, 0.124, 0);
  const seam = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.07, 0.01), dark);
  seam.position.set(0, 0.05, 0.1);
  const chinPlate = rbox(0.07, 0.035, 0.05, 0.012, chrome);
  chinPlate.position.set(0, 0.03, 0.06);
  head.add(helm, face, band, seam, chinPlate);
  for (const sx of [-1, 1]) {
    const earDisk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.022, 32), dark);
    earDisk.rotation.z = Math.PI / 2;
    earDisk.position.set(sx * 0.088, 0.11, -0.005);
    const earGlow = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.003, 8, 24), glow);
    earGlow.rotation.y = Math.PI / 2;
    earGlow.position.set(sx * 0.1, 0.11, -0.005);
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.035, 0.03), dark);
    vent.position.set(sx * 0.06, 0.06, 0.07);
    head.add(earDisk, earGlow, vent);
    if (v.fins) {
      const fin = rbox(0.012, 0.06, 0.08, 0.004, chrome);
      fin.position.set(sx * 0.07, 0.2, -0.03);
      fin.rotation.set(0.3, 0, sx * -0.35);
      head.add(fin);
    }
  }
  if (v.crest) {
    const crest = rbox(0.016, 0.05, 0.2, 0.006, chrome);
    crest.position.set(0, 0.23, -0.01);
    const crestGlow = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.012, 0.18), glow);
    crestGlow.position.set(0, 0.255, -0.01);
    head.add(crest, crestGlow);
  }
  if (v.halo) {
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.01, 10, 64), glow);
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 0.31;
    head.add(halo);
    f.halo = halo;
  }

  // Arms: shoulder ball + pauldron, upper arm with piston, elbow, armored forearm, mechanical fist
  for (const side of ['l', 'r']) {
    const sx = side === 'l' ? 1 : -1;
    const sh = joint(f, `${side}Shoulder`, chest, sx * 0.205 * b, 0.3, 0);
    sh.add(ball(0.05 * b, dark, 28, 22));
    const paul = new THREE.Mesh(new THREE.SphereGeometry(0.075 * b, 36, 20, 0, Math.PI * 2, 0, Math.PI * 0.55), chrome);
    paul.scale.set(1.05, 0.95, 1.1);
    paul.position.y = 0.012;
    paul.rotation.z = sx * -0.25;
    const paulRim = new THREE.Mesh(new THREE.TorusGeometry(0.072 * b, 0.006, 8, 40), glow);
    paulRim.rotation.set(Math.PI / 2, 0, 0);
    paulRim.rotation.y = sx * -0.25;
    paulRim.position.y = 0.0;
    sh.add(paul, paulRim);
    sh.add(limb(0.032 * b, 0.03 * b, 0.25, dark, 20));
    const sleeve = lathe([[0.05 * b, -0.04], [0.054 * b, -0.08], [0.05 * b, -0.18], [0.044 * b, -0.22]], chrome, 40);
    sh.add(sleeve);
    const rod = limb(0.009, 0.009, 0.16, piston, 12);
    rod.position.set(0, -0.12, -0.055 * b);
    const rodSleeve = limb(0.014, 0.014, 0.07, dark, 12);
    rodSleeve.position.set(0, -0.06, -0.055 * b);
    sh.add(rod, rodSleeve);
    strip(0.12, sx * 0.05 * b, -0.13, 0.02, sh);
    const el = joint(f, `${side}Elbow`, sh, 0, -0.27, 0);
    el.add(ball(0.04 * b, dark, 24, 18));
    const elRing = new THREE.Mesh(new THREE.TorusGeometry(0.042 * b, 0.007, 8, 32), chrome);
    elRing.rotation.y = Math.PI / 2;
    el.add(elRing);
    const fore = lathe([[0.044 * b, -0.02], [0.054 * b, -0.07], [0.05 * b, -0.15], [0.04 * b, -0.21]], chrome, 40);
    el.add(fore);
    el.add(limb(0.026, 0.024, 0.23, dark, 16));
    strip(0.1, 0, -0.12, 0.05 * b, el);
    for (let i = 0; i < 2; i++) {
      const c = tube([[sx * 0.03, -0.03, -0.035], [sx * 0.04, -0.12, -0.045 - i * 0.01], [sx * 0.025, -0.2, -0.03]], 0.0055, cable);
      el.add(c);
    }
    // Mechanical fist
    const hand = new THREE.Group();
    hand.position.y = -0.27;
    const palm = rbox(0.075 * b, 0.07, 0.05, 0.012, chrome);
    hand.add(palm);
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * 0.018 * b;
      const k1 = ball(0.008, dark, 12, 10);
      k1.position.set(x, -0.037, 0.0);
      const p1 = rbox(0.015, 0.03, 0.017, 0.004, chrome);
      p1.position.set(x, -0.045, 0.016);
      p1.rotation.x = 1.3;
      const p2 = rbox(0.014, 0.024, 0.016, 0.004, chrome);
      p2.position.set(x, -0.03, 0.035);
      p2.rotation.x = 2.6;
      hand.add(k1, p1, p2);
    }
    const thumb = rbox(0.016, 0.035, 0.016, 0.005, chrome);
    thumb.position.set(sx * 0.04 * b, -0.01, 0.02);
    thumb.rotation.set(0.9, 0, sx * 0.6);
    hand.add(thumb);
    const knuckleGlow = new THREE.Mesh(new THREE.BoxGeometry(0.06 * b, 0.006, 0.006), glow);
    knuckleGlow.position.set(0, -0.052, 0.022);
    hand.add(knuckleGlow);
    el.add(hand);
    f[`${side}Fist`] = palm;
  }

  // Legs: thigh armor with piston, knee cap, shin guard, armored feet
  for (const side of ['l', 'r']) {
    const sx = side === 'l' ? 1 : -1;
    const hp = joint(f, `${side}Hip`, hips, sx * 0.1 * b, 0, 0);
    hp.add(limb(0.04 * b, 0.034 * b, 0.42, dark, 20));
    const thigh = lathe([[0.07 * b, -0.02], [0.075 * b, -0.08], [0.066 * b, -0.24], [0.052 * b, -0.36]], chrome, 40);
    hp.add(thigh);
    const rod = limb(0.01, 0.01, 0.24, piston, 12);
    rod.position.set(sx * 0.03, -0.24, -0.06 * b);
    hp.add(rod);
    strip(0.2, sx * 0.07 * b, -0.18, 0.02, hp, sx * 0.04);
    const kn = joint(f, `${side}Knee`, hp, 0, -0.44, 0);
    kn.add(ball(0.045 * b, dark, 24, 18));
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.05 * b, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), chrome);
    cap.rotation.x = Math.PI / 2;
    cap.position.set(0, 0, 0.025);
    kn.add(cap);
    kn.add(limb(0.032 * b, 0.028 * b, 0.42, dark, 16));
    const shin = lathe([[0.058 * b, -0.04], [0.064 * b, -0.1], [0.052 * b, -0.26], [0.042 * b, -0.38]], chrome, 40);
    shin.scale.z = 1.1;
    kn.add(shin);
    strip(0.22, 0, -0.2, 0.066 * b, kn);
    const an = joint(f, `${side}Ankle`, kn, 0, -0.44, 0);
    an.add(ball(0.034 * b, dark, 20, 16));
    const foot = rbox(0.1 * b, 0.06, 0.2, 0.02, chrome);
    foot.position.set(0, -0.035, 0.035);
    const toe = rbox(0.1 * b, 0.035, 0.07, 0.012, dark);
    toe.position.set(0, -0.048, 0.135);
    const heelGlow = new THREE.Mesh(new THREE.BoxGeometry(0.08 * b, 0.006, 0.006), glow);
    heelGlow.position.set(0, -0.06, -0.066);
    an.add(foot, toe, heelGlow);
    f[`${side}Foot`] = foot;
  }
}
