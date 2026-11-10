// Campaign Pinball: the 3D machine. The cabinet, backbox, legs and the playfield parts come from
// Blender (assets/models/pinball.glb, blender/build_pinball.py) and get token materials here;
// everything that follows the table layout is built at runtime from pinball-layout.js, so the
// physics and the picture always match: the playfield art (a town map seen from above, with the
// channel inserts and the target-group lanes), the walls and rails, slingshots, the two
// wireform ramps, the apron. Also here: the backglass (a small town square on a winter evening,
// painted at runtime from tokens, with twinkling fairy lights), the dot matrix display, the
// chrome ball with its trail, the AI's floating tip arrow and the insert lights.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';
import { hex, color, font } from './tokens.js';
import { t } from './i18n.js';
import { loadGLTF } from './models.js';
import { radialTexture } from './robot-visuals.js';
import { CHRISTMAS, makeBulbs } from './christmas.js';
import { RibbonTrail } from './pong-shaders.js';
import {
  SLOPE, BOARD, BALL_R, CHANNELS, GUIDE_X, LANE_Y, LANE_X, PLUNGER_Y, PLUNGER_TRAVEL, ARC,
} from './pinball-layout.js';
import { IconBurst, makeLamps, makeFlasher, ICON } from './pinball-fx.js';
import { makePhoneGate, makeTvGate, drawPosters, makeEnvelope, makeBubbleTop, makeBranchFx, makeCharacters } from './pinball-props.js';
import { drawStudio, makeKpiChart, BG_W, BG_H, CHART } from './pinball-backglass.js';
import { buildDetails, drawDetailArt, detailInserts } from './pinball-details.js';

export const MODEL_URL = 'assets/models/pinball.glb';
const col = (token) => new THREE.Color(hex(token));
const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false };
/** Playfield point (x, y) at height h, in the field group's space. */
export const fp = (x, y, h = 0) => new THREE.Vector3(x, h, -y);
export const CH_TOKEN = Object.fromEntries(CHANNELS.map((c) => [c, `xr-pinball-ch-${c}`]));

// ---------- glyphs (own line icons, 24 x 24 like icons.js) ----------

const circ = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
export const GLYPHS = {
  poster: 'M8 3.5h8M8.5 3.5v2.5h7V3.5M7 6h10v13H7zM9.5 9.5h5M9.5 12.5h5M9.5 15.5h3M6 21h12M8 19v2M16 19v2',
  social: `${circ(18, 5.5, 2.5)}${circ(6, 12, 2.5)}${circ(18, 18.5, 2.5)}M8.3 10.9l7.4-4.2M8.3 13.1l7.4 4.2`,
  email: 'M3 6h18v12H3zM3 6.5l9 7 9-7',
  app: 'M7.5 2.5h9a1.5 1.5 0 0 1 1.5 1.5v16a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20V4a1.5 1.5 0 0 1 1.5-1.5zM10.5 18.5h3M9 6h6v8H9z',
  branch: 'M3 10l9-6 9 6M5 10v9M9.5 10v9M14.5 10v9M19 10v9M3 21h18M3 10h18',
  video: 'M3.5 5.5h17a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1v-11a1 1 0 0 1 1-1zM10 9l5 3-5 3z',
  young: `${circ(12, 5.5, 2.6)}M12 8.5v6.5M12 15l-4 6M12 15l4 6M6.5 9.5L12 11l5.5-3`,
  families: `${circ(7.5, 6, 2.2)}${circ(16.5, 6, 2.2)}${circ(12, 12.5, 1.8)}M3.5 20v-4.5a4 4 0 0 1 8 0V20M12.5 20v-4.5a4 4 0 0 1 8 0V20M10 20.5v-2a2 2 0 0 1 4 0v2`,
  founders: 'M9 17.5h6M10 21h4M12 2.5a6.5 6.5 0 0 0-4.2 11.5c.9.8 1.2 1.6 1.2 2.6h6c0-1 .3-1.8 1.2-2.6A6.5 6.5 0 0 0 12 2.5zM12 6v4M10 8h4',
  seniors: `${circ(10, 4.8, 2.3)}M10 7.8v6.7l-3 6.5M10 14.5l3.5 6.5M10 10l5 2.5M16 12v9`,
  flipL: 'M14.5 5l-7 7 7 7M19 5l-7 7 7 7',
  flipR: 'M9.5 5l7 7-7 7M5 5l7 7-7 7',
  launch: 'M12 21V5M6.5 10.5L12 5l5.5 5.5M8 17h8M9 14h6',
};
const glyphCache = new Map();

/** Strokes a glyph onto a canvas, centered at (x, y), size in pixels. */
export function drawGlyph(ctx, key, x, y, size, stroke, width = 1.9) {
  const d = GLYPHS[key];
  if (!d) return;
  if (!glyphCache.has(key)) glyphCache.set(key, new Path2D(d));
  const k = size / 24;
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(k, k);
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke;
  ctx.stroke(glyphCache.get(key));
  ctx.restore();
}

/** Inline SVG of a glyph (the phone buttons). */
export function glyphSVG(key, size = 30) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${GLYPHS[key]}"/></svg>`;
}

// ---------- where things are on the playfield ----------

/** Channel inserts: center of the icon disc and the direction the arrow head points. */
export const INSERTS = {
  poster: { x: 0, y: 0.405, dx: 0, dy: 1 },
  social: { x: 0, y: 0.585, dx: 0, dy: 1 },
  email: { x: -0.128, y: 0.432, dx: -0.9, dy: 0.42 },
  video: { x: -0.1, y: 0.528, dx: -0.79, dy: 0.62 },
  app: { x: 0.1, y: 0.528, dx: 0.79, dy: 0.62 },
  branch: { x: 0.125, y: 0.432, dx: 0.87, dy: 0.49 },
};
/** Where the AI's floating arrow points to for each channel: [x, y, height, ring radius]. */
export const TARGETS = {
  poster: [0, 0.5, 0.135, 0.045],
  social: [0, 0.725, 0.11, 0.105],
  email: [-0.205, 0.465, 0.085, 0.06],
  video: [-0.175, 0.6, 0.095, 0.045],
  app: [0.175, 0.6, 0.095, 0.045],
  branch: [0.19, 0.468, 0.1, 0.035],
};
const MULTI = { x: 0, y: 0.259, r: 0.016 };
/** The marketing funnel: three inserts, wide to narrow (awareness, interest, conversion). */
export const FUNNEL = [
  { x: 0, y: 0.352, w: 0.132, w2: 0.106, h: 0.024 },
  { x: 0, y: 0.324, w: 0.1, w2: 0.076, h: 0.024 },
  { x: 0, y: 0.296, w: 0.07, w2: 0.048, h: 0.024 },
];

function funnelShape(f) {
  const s = new THREE.Shape();
  s.moveTo(f.x - f.w / 2, f.y + f.h / 2);
  s.lineTo(f.x + f.w / 2, f.y + f.h / 2);
  s.lineTo(f.x + f.w2 / 2, f.y - f.h / 2);
  s.lineTo(f.x - f.w2 / 2, f.y - f.h / 2);
  s.closePath();
  return s;
}
const SAVE = { x: 0, y: 0.222, w: 0.07, h: 0.022 };
const INS_R = 0.0175;

function insertShape(ins, r = INS_R) {
  const l = Math.hypot(ins.dx, ins.dy);
  const ux = ins.dx / l;
  const uy = ins.dy / l;
  const s = new THREE.Shape();
  // Icon disc with an arrow head in the pointing direction (shape in field x / y).
  const a0 = Math.atan2(uy, ux);
  const spread = 0.62;
  s.moveTo(ins.x + Math.cos(a0 + spread) * r, ins.y + Math.sin(a0 + spread) * r);
  s.absarc(ins.x, ins.y, r, a0 + spread, a0 - spread + Math.PI * 2, false);
  s.lineTo(ins.x + ux * r * 2.05, ins.y + uy * r * 2.05);
  s.closePath();
  return s;
}

/** A flat mesh on the playfield from a shape in field x / y. */
function flatMesh(shape, h, material) {
  const g = new THREE.ShapeGeometry(shape, 24);
  g.rotateX(-Math.PI / 2); // shape y -> -z (field y up the playfield)
  g.translate(0, h, 0);
  const m = new THREE.Mesh(g, material);
  m.userData.noFit = true;
  return m;
}

// ---------- materials ----------

const SOLID = {
  PbBody: ['xr-pinball-cabinet', 0.35, 0.3],
  PbAccent: ['xr-pinball-accent', 0.2, 0.3],
  PbChrome: ['xr-pinball-chrome', 1, 0.14],
  PbDark: ['xr-pinball-dark', 0.3, 0.55],
  PbWood: ['xr-pinball-wood', 0.1, 0.5],
  PbButton: ['xr-pinball-accent', 0.1, 0.25],
  PbSpeaker: ['xr-pinball-speaker', 0.2, 0.7],
  PbLeg: ['xr-pinball-leg', 0.9, 0.3],
  PbFlipper: ['xr-pinball-flipper', 0, 0.35],
  PbFlipperRubber: ['xr-pinball-flipper-rubber', 0, 0.6],
  PbRubber: ['xr-pinball-rubber', 0, 0.65],
  PbBumperBase: ['xr-pinball-bumper-base', 0.4, 0.4],
  PbBumperBody: ['xr-pinball-bumper-body', 0, 0.35],
  PbDropFace: ['xr-pinball-ch-email', 0, 0.3],
  PbColumn: ['xr-pinball-column', 0.3, 0.35],
  PbHouse: ['xr-pinball-house', 0, 0.7],
  PbRoof: ['xr-pinball-roof', 0, 0.55],
  PbStarPost: ['xr-pinball-star-post', 0, 0.3],
  PbStandup: ['xr-pinball-standup', 0, 0.35],
  PbStar: ['xr-pinball-star', 0, 0.2],
  PbSpinner: ['xr-pinball-spinner', 0.8, 0.25],
};
const GLOWS = { PbCoinGlow: 'xr-pinball-coin-light', PbWindowGlow: 'xr-pinball-window' };

function convert(m, posterTex) {
  const name = m.name;
  if (GLOWS[name]) return new THREE.MeshBasicMaterial({ name, color: hex(GLOWS[name]), toneMapped: false });
  if (name === 'PbBumperCap') {
    return new THREE.MeshPhysicalMaterial({ name, color: hex(CH_TOKEN.social), roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.1, emissive: hex(CH_TOKEN.social), emissiveIntensity: 0.35, vertexColors: false });
  }
  if (name === 'PbPoster') return new THREE.MeshStandardMaterial({ name, map: posterTex, roughness: 0.6, vertexColors: true });
  if (name === 'PbBody') return new THREE.MeshPhysicalMaterial({ name, color: hex('xr-pinball-cabinet'), metalness: 0.3, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12, vertexColors: true });
  const s = SOLID[name];
  if (s) return new THREE.MeshStandardMaterial({ name, color: hex(s[0]), metalness: s[1], roughness: s[2], vertexColors: true });
  return m;
}

/** Loads the Blender model and gives it token materials: { parts, anchors }. */
export async function loadPinballModel() {
  const gltf = await loadGLTF(MODEL_URL);
  const posterTex = posterTexture();
  const made = new Map();
  const parts = {};
  const anchors = {};
  for (const node of gltf.scene.children) {
    if (!node.isMesh && !node.children.length) { anchors[node.name] = node.position.clone(); continue; }
    const root = node.clone(true);
    root.traverse((o) => {
      if (!o.isMesh) return;
      const one = (m) => {
        if (!made.has(m)) made.set(m, convert(m, posterTex));
        return made.get(m);
      };
      o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material);
      o.userData.noFit = true;
    });
    root.userData.noFit = true;
    parts[node.name] = root;
  }
  return { parts, anchors };
}

/** The advertising column's poster band (the first set; the machine swaps sets on hits). */
function posterTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  drawPosters(c.getContext('2d'), 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- walls ----------

/** A wall of thickness th and height h along a polyline (mitered joints), in field space. */
function wallGeometry(pts, th, h, h0 = 0) {
  const n = pts.length;
  const left = [];
  const right = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    // Miter: the normal of the averaged direction, lengthened at sharp corners.
    let nx = -dy;
    let ny = dx;
    let k = 1;
    if (i > 0 && i < n - 1) {
      const d0 = [p[0] - a[0], p[1] - a[1]];
      const l0 = Math.hypot(...d0) || 1;
      const n0 = [-d0[1] / l0, d0[0] / l0];
      k = 1 / Math.max(0.35, n0[0] * nx + n0[1] * ny);
    }
    nx *= (th / 2) * k;
    ny *= (th / 2) * k;
    left.push([p[0] + nx, p[1] + ny]);
    right.push([p[0] - nx, p[1] - ny]);
  }
  const pos = [];
  const quad = (a, b, c, d) => pos.push(...a, ...c, ...b, ...a, ...d, ...c);
  const P = (q, y) => [q[0], y, -q[1]];
  for (let i = 0; i < n - 1; i++) {
    quad(P(left[i], h0), P(left[i + 1], h0), P(left[i + 1], h), P(left[i], h)); // left side
    quad(P(right[i + 1], h0), P(right[i], h0), P(right[i], h), P(right[i + 1], h)); // right side
    quad(P(left[i], h), P(left[i + 1], h), P(right[i + 1], h), P(right[i], h)); // top
  }
  // End caps.
  quad(P(right[0], h0), P(left[0], h0), P(left[0], h), P(right[0], h));
  quad(P(left[n - 1], h0), P(right[n - 1], h0), P(right[n - 1], h), P(left[n - 1], h));
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// ---------- ramps ----------

/** Offsets a ramp path sideways (side) and upwards (up), as field-space points. */
function rampRail(r, from, to, side, up) {
  const pts = [];
  const N = r.pts.length;
  for (let i = from; i <= to; i++) {
    const p = r.pts[i];
    const a = r.pts[Math.max(0, i - 1)];
    const b = r.pts[Math.min(N - 1, i + 1)];
    let dx = b[0] - a[0];
    let dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    dx /= l;
    dy /= l;
    pts.push(fp(p[0] - dy * side, p[1] + dx * side, p[2] + up));
  }
  return pts;
}

function tube(points, radius, segs = 6) {
  const curve = new THREE.CatmullRomCurve3(points);
  return new THREE.TubeGeometry(curve, Math.max(8, points.length), radius, segs, false);
}

/** A wireform ramp with a clear plastic entrance, ribs and supports. */
function makeRamp(r, mats, channel) {
  const g = new THREE.Group();
  g.userData.noFit = true;
  const N = r.pts.length;
  const sAt = (len) => r.len.findIndex((l) => l >= len);
  const plasticEnd = Math.max(4, sAt(0.13));
  // Plastic entrance: floor and two side walls, lofted along the path.
  const pos = [];
  const quad = (a, b, c, d) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
  const fl = rampRail(r, 0, plasticEnd, 0.022, 0.0015);
  const fr = rampRail(r, 0, plasticEnd, -0.022, 0.0015);
  const wl = rampRail(r, 0, plasticEnd, 0.022, 0.022);
  const wr = rampRail(r, 0, plasticEnd, -0.022, 0.022);
  for (let i = 0; i < fl.length - 1; i++) {
    quad(fl[i], fr[i], fr[i + 1], fl[i + 1]);
    quad(fl[i], fl[i + 1], wl[i + 1], wl[i]);
    quad(fr[i + 1], fr[i], wr[i], wr[i + 1]);
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  pg.computeVertexNormals();
  const plastic = new THREE.Mesh(pg, mats.rampPlastic);
  plastic.renderOrder = 3;
  g.add(plastic);
  // Glowing edges in the channel's color along the plastic walls.
  const edgeMat = new THREE.MeshBasicMaterial({ color: hex(CH_TOKEN[channel]), toneMapped: false });
  const edges = mergeGeometries([tube(wl, 0.0016, 5), tube(wr, 0.0016, 5)]);
  g.add(new THREE.Mesh(edges, edgeMat));
  // Wireform: four wires from the end of the plastic to the end of the ramp.
  const from = plasticEnd - 2;
  const wires = [
    tube(rampRail(r, from, N - 1, 0.0105, 0.003), 0.0017),
    tube(rampRail(r, from, N - 1, -0.0105, 0.003), 0.0017),
    tube(rampRail(r, from, N - 1, 0.019, 0.019), 0.0015),
    tube(rampRail(r, from, N - 1, -0.019, 0.019), 0.0015),
  ];
  // Ribs every 6 cm: a U around the four wires.
  for (let s = r.len[from] + 0.03; s < r.total - 0.02; s += 0.06) {
    const i = sAt(s);
    const at = (side, up) => rampRail(r, i, i, side, up)[0];
    wires.push(tube([at(0.019, 0.019), at(0.0105, 0.003), at(0, -0.001), at(-0.0105, 0.003), at(-0.019, 0.019)], 0.0012, 4));
  }
  // Supports down to the playfield where the ramp is high.
  for (let s = r.len[from] + 0.08; s < r.total - 0.05; s += 0.16) {
    const p = r.at(s);
    if (p.h < 0.03) continue;
    const c = new THREE.CylinderGeometry(0.0017, 0.0017, p.h, 6);
    c.translate(p.x, p.h / 2, -p.y);
    wires.push(c);
  }
  const wm = new THREE.Mesh(mergeGeometries(wires.map((w) => w.toNonIndexed())), mats.wire);
  wm.castShadow = true;
  g.add(wm);
  return g;
}

// ---------- slingshots ----------

function makeSling(sl, mats) {
  const g = new THREE.Group();
  const { A, B, C } = sl;
  // (The printed plastic on top is made with the other plastics in pinball-details.js.)
  // Rubber band around the three posts (tangent lines and arcs), at band height.
  const r = 0.0068;
  const pts = [A, B, C];
  const path = [];
  const ccw = ((B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0])) > 0;
  for (let i = 0; i < 3; i++) {
    const p = pts[i];
    const prev = pts[(i + 2) % 3];
    const next = pts[(i + 1) % 3];
    const n0 = Math.atan2(p[1] - prev[1], p[0] - prev[0]) + (ccw ? -Math.PI / 2 : Math.PI / 2);
    let n1 = Math.atan2(next[1] - p[1], next[0] - p[0]) + (ccw ? -Math.PI / 2 : Math.PI / 2);
    if (ccw) { while (n1 > n0) n1 -= Math.PI * 2; } else { while (n1 < n0) n1 += Math.PI * 2; }
    for (let k = 0; k <= 5; k++) {
      const a = n0 + ((n1 - n0) * k) / 5;
      path.push(fp(p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r, 0.011));
    }
  }
  const band = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path, true), 60, 0.0028, 6, true), mats.rubber);
  band.castShadow = true;
  g.add(band);
  // The kicking face lights up in the accent color.
  const kick = new THREE.Mesh(tube([fp(C[0], C[1], 0.011), fp(A[0], A[1], 0.011)], 0.0034, 6), new THREE.MeshBasicMaterial({ color: hex('xr-pinball-accent-glow'), ...additive, opacity: 0 }));
  g.add(kick);
  g.userData.flash = kick.material;
  return g;
}

// ---------- the playfield art ----------

const PPM = 1700; // canvas pixels per meter
const PF = { w: BOARD.x1 - BOARD.x0, h: BOARD.y1 - BOARD.y0 };

function drawPlayfield(table) {
  const W = Math.round(PF.w * PPM);
  const H = Math.round(PF.h * PPM);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const X = (x) => (x - BOARD.x0) * PPM;
  const Y = (y) => (BOARD.y1 - y) * PPM;
  const M = (m) => m * PPM;
  // Board edge outside the walls.
  ctx.fillStyle = color('xr-pinball-cabinet-dark');
  ctx.fillRect(0, 0, W, H);
  // The field inside the outer wall (with the arc).
  const outer = table.walls[0].pts;
  ctx.save();
  ctx.beginPath();
  outer.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
  ctx.closePath();
  ctx.clip();
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, color('xr-pinball-field-2'));
  bg.addColorStop(0.55, color('xr-pinball-field'));
  bg.addColorStop(1, color('xr-pinball-field-2'));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  // The town map: blocks, a park, streets with dashed center lines.
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = color('xr-pinball-field-2');
  const rnd = mulberry(5);
  for (let i = 0; i < 70; i++) {
    const x = -0.23 + rnd() * 0.46;
    const y = 0.12 + rnd() * 0.72;
    const w = 0.02 + rnd() * 0.03;
    const h = 0.015 + rnd() * 0.025;
    ctx.beginPath();
    ctx.roundRect(X(x), Y(y + h), M(w), M(h), M(0.004));
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = color('xr-pinball-park');
  ctx.beginPath();
  ctx.ellipse(X(0), Y(0.72), M(0.15), M(0.12), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color('xr-pinball-tree-light');
  for (let i = 0; i < 26; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 0.06 + rnd() * 0.07;
    ctx.beginPath();
    ctx.arc(X(Math.cos(a) * r * 1.1), Y(0.72 + Math.sin(a) * r * 0.85), M(0.006), 0, Math.PI * 2);
    ctx.fill();
  }
  const street = (pts, wid = 0.02) => {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color('xr-pinball-street');
    ctx.lineWidth = M(wid);
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
    ctx.stroke();
    ctx.setLineDash([M(0.008), M(0.008)]);
    ctx.strokeStyle = color('xr-pinball-street-line');
    ctx.lineWidth = M(0.0018);
    ctx.stroke();
    ctx.setLineDash([]);
  };
  const ring = [];
  for (let i = 0; i <= 40; i++) ring.push([Math.cos((i / 40) * Math.PI * 2) * 0.072, 0.5 + Math.sin((i / 40) * Math.PI * 2) * 0.072]);
  street(ring);
  street([[-0.068, 0.52], [-0.12, 0.555], [-0.168, 0.585]]);
  street([[0.068, 0.52], [0.12, 0.555], [0.168, 0.585]]);
  street([[-0.07, 0.48], [-0.14, 0.462], [-0.21, 0.465]]);
  street([[0.07, 0.48], [0.14, 0.466], [0.19, 0.468]]);
  street([[0, 0.572], [0, 0.64]]);
  street([[0, 0.428], [0, 0.33]]);
  street([[-0.15, 0.33], [-0.06, 0.31], [0.06, 0.31], [0.15, 0.33]], 0.016);
  // Lane area under the arc: a warm band behind the four target-group lanes.
  ctx.fillStyle = color('xr-pinball-cabinet');
  ctx.globalAlpha = 0.6;
  ctx.fillRect(X(GUIDE_X[0]), Y(LANE_Y[1] + 0.01), M(GUIDE_X[4] - GUIDE_X[0]), M(LANE_Y[1] - LANE_Y[0] + 0.03));
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const ln of table.lanes) {
    ctx.fillStyle = color('xr-pinball-dark');
    ctx.beginPath();
    ctx.arc(X(ln.x), Y(ln.y), M(0.0165), 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = M(0.0022);
    ctx.strokeStyle = color('xr-pinball-lane-light');
    ctx.stroke();
    drawGlyph(ctx, ln.group, X(ln.x), Y(ln.y), M(0.024), color('xr-pinball-lane-light'), 2.2);
    ctx.fillStyle = color('xr-pinball-field-text');
    ctx.font = font('black', M(0.0105));
    ctx.fillText(t(`pinballLane_${ln.group}`), X(ln.x), Y(LANE_Y[0] - 0.014));
  }
  // Channel inserts: dark plastic with the channel color's outline, icon and name.
  for (const ch of CHANNELS) {
    const ins = INSERTS[ch];
    const shape = insertShape(ins);
    const pts = shape.getPoints(24);
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
    ctx.closePath();
    ctx.fillStyle = color('xr-pinball-dark');
    ctx.fill();
    ctx.lineWidth = M(0.0022);
    ctx.strokeStyle = color(CH_TOKEN[ch]);
    ctx.stroke();
    drawGlyph(ctx, ch, X(ins.x), Y(ins.y), M(0.022), color(CH_TOKEN[ch]), 2.2);
    ctx.fillStyle = color('xr-pinball-field-text');
    ctx.font = font('black', M(0.0092));
    const ly = ins.dy > 0.9 ? ins.y - INS_R - 0.009 : ins.y - INS_R - 0.009;
    ctx.fillText(t(`pinballCh_${ch}`).toUpperCase(), X(ins.x), Y(ly));
  }
  // The marketing funnel: awareness, interest, conversion (narrower towards the bottom).
  FUNNEL.forEach((f, i) => {
    const pts = funnelShape(f).getPoints(4);
    ctx.beginPath();
    pts.forEach((p, k) => (k ? ctx.lineTo(X(p.x), Y(p.y)) : ctx.moveTo(X(p.x), Y(p.y))));
    ctx.closePath();
    ctx.fillStyle = color('xr-pinball-dark');
    ctx.fill();
    ctx.lineWidth = M(0.0022);
    ctx.strokeStyle = color(`xr-pinball-funnel-${i + 1}`);
    ctx.stroke();
  });
  // Reach multiplier and shoot-again inserts.
  ctx.fillStyle = color('xr-pinball-dark');
  ctx.beginPath();
  ctx.arc(X(MULTI.x), Y(MULTI.y), M(MULTI.r), 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = M(0.0022);
  ctx.strokeStyle = color('xr-pinball-ai');
  ctx.stroke();
  ctx.fillStyle = color('xr-pinball-ai');
  ctx.font = font('black', M(0.015));
  ctx.fillText('x2', X(MULTI.x), Y(MULTI.y));
  ctx.fillStyle = color('xr-pinball-dark');
  ctx.beginPath();
  ctx.roundRect(X(SAVE.x - SAVE.w / 2), Y(SAVE.y + SAVE.h / 2), M(SAVE.w), M(SAVE.h), M(0.011));
  ctx.fill();
  ctx.strokeStyle = color('xr-pinball-accent-glow');
  ctx.stroke();
  ctx.fillStyle = color('xr-pinball-accent-glow');
  ctx.font = font('black', M(0.0105));
  ctx.fillText(t('pinballFieldSave'), X(SAVE.x), Y(SAVE.y));
  // Classic details: persona lamps, kickback, extra ball, spinner, inlane arrows, drop numbers.
  drawDetailArt(ctx, X, Y, M, table);
  // Shooter lane chevrons.
  for (let k = 0; k < 6; k++) chevron(ctx, X(LANE_X), Y(0.2 + k * 0.08), M(0.011), -Math.PI / 2, color('xr-pinball-lane-light'), 0.35 + k * 0.1);
  ctx.restore();
  // The wooden board edge: a thin line along the outer wall.
  ctx.strokeStyle = color('xr-pinball-accent');
  ctx.lineWidth = M(0.003);
  ctx.beginPath();
  outer.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function chevron(ctx, x, y, s, angle, stroke, alpha = 0.8) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = stroke;
  ctx.lineWidth = s * 0.35;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-s * 0.5, -s * 0.6);
  ctx.lineTo(s * 0.4, 0);
  ctx.lineTo(-s * 0.5, s * 0.6);
  ctx.stroke();
  ctx.restore();
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- the apron ----------

function apronShape() {
  const s = new THREE.Shape();
  const x0 = -0.262;
  const x1 = 0.2445 - 0.004;
  s.moveTo(x0, -0.02);
  s.lineTo(x1, -0.02);
  s.lineTo(x1, 0.07);
  s.bezierCurveTo(0.17, 0.07, 0.07, 0.045, 0, 0.04);
  s.bezierCurveTo(-0.07, 0.045, -0.17, 0.07, x0, 0.07);
  s.closePath();
  return s;
}

function apronTexture() {
  const W = 2048;
  const H = 512;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  // Shape units: x -0.262 .. 0.2405, y -0.02 .. 0.07 -> canvas.
  const x0 = -0.262;
  const sx = W / 0.5025;
  const sy = H / 0.09;
  const X = (x) => (x - x0) * sx;
  const Y = (y) => (0.07 - y) * sy;
  ctx.fillStyle = color('xr-pinball-apron');
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = color('xr-pinball-accent');
  ctx.fillRect(0, Y(-0.012), W, 14);
  ctx.fillStyle = color('xr-pinball-lane-light');
  ctx.fillRect(0, Y(-0.012) + 20, W, 4);
  // A classic instruction card and a score card: a title band, then lines with icons.
  const card = (cx, title, lines, accent) => {
    const w = 0.152;
    const h = 0.044;
    const left = X(cx - w / 2);
    const top = Y(0.027);
    const cw = w * sx;
    const ch = h * sy;
    ctx.fillStyle = color('xr-pinball-apron-card');
    ctx.beginPath();
    ctx.roundRect(left, top, cw, ch, 14);
    ctx.fill();
    ctx.fillStyle = color(accent);
    ctx.beginPath();
    ctx.roundRect(left, top, cw, 46, [14, 14, 0, 0]);
    ctx.fill();
    ctx.fillStyle = color('xr-pinball-sticker');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let px = 30;
    ctx.font = font('black', px);
    while (ctx.measureText(title).width > cw - 30 && px > 14) { px -= 1; ctx.font = font('black', px); }
    ctx.fillText(title, left + cw / 2, top + 24);
    const lh = (ch - 58) / lines.length;
    px = Math.min(25, lh * 0.8);
    ctx.font = font('bold', px);
    const maxW = cw - 70;
    for (const ln of lines) while (ctx.measureText(ln.text).width > maxW && px > 11) { px -= 1; ctx.font = font('bold', px); }
    ctx.textAlign = 'left';
    lines.forEach((ln, i) => {
      const y = top + 54 + lh * (i + 0.5);
      if (ln.glyph) drawGlyph(ctx, ln.glyph, left + 30, y, px * 1.15, color(ln.token ?? 'xr-pinball-apron-ink'), 2.4);
      else {
        ctx.fillStyle = color(ln.token ?? accent);
        ctx.beginPath();
        ctx.arc(left + 30, y, px * 0.3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = color('xr-pinball-apron-ink');
      ctx.fillText(ln.text, left + 52, y + 1);
    });
  };
  card(-0.17, t('pinballCardRules'), CHANNELS.map((ch) => ({ glyph: ch, token: CH_TOKEN[ch], text: t(`pinballCard_${ch}`) })), 'xr-pinball-accent');
  card(0.155, t('pinballCardScore'), [1, 2, 3, 4, 5, 6].map((i) => ({ text: t(`pinballCardScore${i}`), token: ['xr-pinball-funnel-3', 'xr-pinball-ai', 'xr-pinball-lane-light', 'xr-pinball-group-1', 'xr-pinball-ch-app', 'xr-pinball-ch-poster'][i - 1] })), 'xr-pinball-cabinet');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.repeat.set(1 / 0.5025, 1 / 0.09);
  tex.offset.set(0.262 / 0.5025, 0.02 / 0.09);
  return tex;
}

function wrapLines(ctx, text, maxW) {
  const out = [];
  let line = '';
  for (const w of text.split(' ')) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width <= maxW || !line) line = test;
    else { out.push(line); line = w; }
  }
  if (line) out.push(line);
  return out;
}

// ---------- the dot matrix display ----------

const DW = 128;
const DH = 32;

export class Dmd {
  constructor(w, h) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 512;
    this.canvas.height = 128;
    this.ctx = this.canvas.getContext('2d');
    this.small = document.createElement('canvas');
    this.small.width = DW;
    this.small.height = DH;
    this.sctx = this.small.getContext('2d', { willReadFrequently: true });
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: this.tex, toneMapped: false }));
    this.mesh.userData.noFit = true;
    this.key = '';
  }

  /** Shows a big line, optionally with a small line above it. */
  show(big, small = '') {
    const key = `${big}|${small}`;
    if (key === this.key) return;
    this.key = key;
    const s = this.sctx;
    s.clearRect(0, 0, DW, DH);
    s.fillStyle = color('xr-pinball-dmd'); // only the alpha of this mask is read
    s.textAlign = 'center';
    s.textBaseline = 'middle';
    const fit = (text, px, maxW) => {
      let p = px;
      do { s.font = font('black', p); p -= 1; } while (s.measureText(text).width > maxW && p > 6);
    };
    if (small) {
      fit(small, 10, DW - 4);
      s.fillText(small, DW / 2, 7);
      fit(big, 18, DW - 4);
      s.fillText(big, DW / 2, 21.5);
    } else {
      fit(big, 22, DW - 4);
      s.fillText(big, DW / 2, DH / 2 + 1);
    }
    const data = s.getImageData(0, 0, DW, DH).data;
    const ctx = this.ctx;
    const cell = 4;
    ctx.fillStyle = color('xr-pinball-dmd-bg');
    ctx.fillRect(0, 0, 512, 128);
    const on = color('xr-pinball-dmd');
    const off = color('xr-pinball-dmd-off');
    for (let y = 0; y < DH; y++) {
      for (let x = 0; x < DW; x++) {
        const a = data[(y * DW + x) * 4 + 3];
        ctx.fillStyle = a > 90 ? on : off;
        ctx.globalAlpha = a > 90 ? 0.55 + (0.45 * a) / 255 : 1;
        ctx.beginPath();
        ctx.arc(x * cell + 2, y * cell + 2, 1.55, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    this.tex.needsUpdate = true;
  }
}

// ---------- the machine ----------

/**
 * Builds the whole machine from the Blender parts and the table. Returns an object with the
 * root (machine frame, scaled by the scene), the field group and handles for the animation.
 */
export function buildMachine(table, model, { lite = false } = {}) {
  const { parts, anchors } = model;
  const root = new THREE.Group();
  root.userData.noFit = true;
  const field = new THREE.Group();
  field.rotation.x = SLOPE;
  root.add(field);
  const owned = []; // materials and textures made here (disposed with the tree)
  const mats = {
    wall: new THREE.MeshStandardMaterial({ color: hex('xr-pinball-wall'), roughness: 0.45, metalness: 0.2 }),
    wallTop: new THREE.MeshStandardMaterial({ color: hex('xr-pinball-wall-top'), roughness: 0.35, metalness: 0.2, emissive: hex('xr-pinball-wall-top'), emissiveIntensity: 0.35 }),
    chrome: new THREE.MeshStandardMaterial({ color: hex('xr-pinball-chrome'), metalness: 1, roughness: 0.16 }),
    wire: new THREE.MeshStandardMaterial({ color: hex('xr-pinball-wire'), metalness: 1, roughness: 0.18 }),
    rubber: new THREE.MeshStandardMaterial({ color: hex('xr-pinball-rubber'), roughness: 0.7 }),
    sling: new THREE.MeshStandardMaterial({ color: hex('xr-pinball-sling'), roughness: 0.25, metalness: 0, transparent: true, opacity: 0.88, emissive: hex('xr-pinball-sling'), emissiveIntensity: 0.35 }),
    rampPlastic: new THREE.MeshStandardMaterial({ color: hex('xr-pinball-ramp'), roughness: 0.1, metalness: 0, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }),
  };
  owned.push(...Object.values(mats));
  // Cabinet, backbox, legs and feet (machine frame).
  const cab = parts.PinCabinet;
  const head = parts.PinBackbox;
  root.add(cab, head);
  cab.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; o.castShadow = true; } });
  const legs = [];
  for (const k of ['LegFL', 'LegFR', 'LegBL', 'LegBR']) {
    const a = anchors[k];
    if (!a) continue;
    const leg = parts.PinLeg.clone(true);
    leg.position.copy(a);
    const foot = parts.PinFoot.clone(true);
    root.add(leg, foot);
    legs.push({ leg, foot, top: a.y });
  }
  // The playfield board with its art (a little self-lit, so it reads well in a dark room).
  const pfTex = drawPlayfield(table);
  // A clear coat over the art (a wear-free shine that mirrors the room); plain in the lite mode.
  const boardOpts = { map: pfTex, emissiveMap: pfTex, emissive: hex('xr-pinball-white'), emissiveIntensity: 0.42, roughness: 0.32, metalness: 0.05 };
  const board = new THREE.Mesh(new THREE.PlaneGeometry(PF.w, PF.h), lite
    ? new THREE.MeshStandardMaterial(boardOpts)
    : new THREE.MeshPhysicalMaterial({ ...boardOpts, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 0.9 }));
  owned.push(board.material, pfTex);
  board.rotation.x = -Math.PI / 2;
  board.position.set((BOARD.x0 + BOARD.x1) / 2, 0, -(BOARD.y0 + BOARD.y1) / 2);
  board.receiveShadow = true;
  board.userData.noFit = true;
  field.add(board);
  // Walls and rails from the layout.
  const geo = { wall: [], wallTop: [], chrome: [] };
  for (const w of table.walls) {
    if (w.kind === 'house') continue; // the Blender house stands there
    if (w.kind === 'wall') {
      geo.wall.push(wallGeometry(w.pts, 0.008, 0.03));
      geo.wallTop.push(wallGeometry(w.pts, 0.0084, 0.033, 0.03));
    } else {
      geo.chrome.push(wallGeometry(w.pts, 0.0055, w.kind === 'guide' ? 0.022 : 0.024));
    }
  }
  for (const [k, list] of Object.entries(geo)) {
    if (!list.length) continue;
    const m = new THREE.Mesh(mergeGeometries(list), k === 'chrome' ? mats.chrome : mats[k]);
    m.castShadow = true;
    m.receiveShadow = k !== 'wallTop';
    field.add(m);
  }
  const placePart = (name, x, y, opts = {}) => {
    const p = parts[name].clone(true);
    p.position.copy(fp(x, y, opts.h ?? 0));
    if (opts.rot !== undefined) p.rotation.y = opts.rot;
    if (opts.scale) p.scale.setScalar(opts.scale);
    p.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    field.add(p);
    return p;
  };
  // Marketing icons flying out of the channels (one draw call for all of them).
  const fx = new IconBurst(field, { max: lite ? 64 : 140 });
  // Slingshots; all posts (lane guides, outlanes, sling corners) as one instanced set.
  const posts = table.posts.map((pt) => [pt.x, pt.y, pt.r / 0.0065]);
  const slings = table.slings.map((sl) => {
    const g = makeSling(sl, mats);
    field.add(g);
    owned.push(g.userData.flash);
    for (const P of [sl.A, sl.B, sl.C]) posts.push([P[0], P[1], 0.006 / 0.0065]);
    return g;
  });
  field.add(instanced(parts.PinPost, posts));
  // Flippers.
  const flippers = {};
  for (const [k, f] of Object.entries(table.flippers)) flippers[k] = placePart('PinFlipper', f.x, f.y, { rot: f.angle });
  // Social media: pop bumpers that wear chat bubbles (heart, like, comment); own cap materials.
  const bubbleIcons = [ICON.heart, ICON.like, ICON.comment];
  const bumpers = table.bumpers.map((b, i) => {
    const m = placePart('PinBumper', b.x, b.y);
    let cap = null;
    m.traverse((o) => {
      if (!o.isMesh) return;
      o.material = [].concat(o.material).map((mm) => {
        if (mm.name !== 'PbBumperCap') return mm;
        cap = mm.clone();
        owned.push(cap);
        return cap;
      });
      if (o.material.length === 1) o.material = o.material[0];
    });
    const bubble = makeBubbleTop(fx.uniforms.uMap.value, bubbleIcons[i % 3]);
    bubble.rotation.y = i * 1.3;
    m.add(bubble);
    return { mesh: m, cap, bubble, flash: 0 };
  });
  // E-mail: drop targets that wear envelopes.
  const drops = table.drops.map((d) => {
    const mesh = placePart('PinDrop', d.x, d.y, { rot: 0 });
    mesh.add(makeEnvelope());
    return { mesh, down: 0 };
  });
  // Poster: the advertising column with a band of posters that changes with every hit.
  const column = placePart('PinColumn', table.column.x, table.column.y);
  const posterCan = document.createElement('canvas');
  posterCan.width = 1024;
  posterCan.height = 256;
  drawPosters(posterCan.getContext('2d'), 0);
  const posterTex = new THREE.CanvasTexture(posterCan);
  posterTex.colorSpace = THREE.SRGBColorSpace;
  posterTex.wrapS = THREE.RepeatWrapping;
  posterTex.repeat.x = -1; // the cylinder's UVs run the other way round
  owned.push(posterTex);
  column.traverse((o) => {
    if (!o.isMesh) return;
    o.material = [].concat(o.material).map((mm) => {
      if (mm.name !== 'PbPoster') return mm;
      const pm = mm.clone();
      pm.map = posterTex;
      pm.emissive = new THREE.Color(hex('xr-pinball-white'));
      pm.emissiveMap = posterTex;
      pm.emissiveIntensity = 0.3;
      owned.push(pm);
      return pm;
    });
    if (o.material.length === 1) o.material = o.material[0];
  });
  const poster = { set: 0, flip: -1, spin: 0 };
  // Branch office: the house with its portico, sign, door and customers; the saucer in front.
  const house = parts.PinHouse.clone(true);
  house.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  field.add(house);
  const branch = makeBranchFx(table.house);
  field.add(branch.group);
  placePart('PinSaucer', table.saucer.x, table.saucer.y);
  const gx = (0.2445 + 0.29) / 2;
  const gy = 0.815;
  const gateRot = Math.atan2(0.03, 0.0455);
  placePart('PinGatePosts', gx, gy, { rot: gateRot });
  const gateWire = placePart('PinGate', gx, gy, { rot: gateRot, h: 0.03 });
  gateWire.rotation.order = 'YXZ'; // swing about the bar, then turned along the gate line
  // Plunger.
  const plunger = placePart('PinPlunger', LANE_X, PLUNGER_Y, { h: 0.012 });
  // Ramps: the video ramp starts under an LED wall, the app ramp inside a giant phone.
  for (const r of Object.values(table.ramps)) field.add(makeRamp(r.ramp, mats, r.channel));
  const tv = makeTvGate(table.ramps.left);
  const phone = makePhoneGate(table.ramps.right);
  field.add(tv.group, phone.group);
  // The target groups as cut-outs behind the top arch.
  const spots = [-0.15, -0.05, 0.05, 0.15].map((x) => [x, ARC.y + Math.sqrt(ARC.r * ARC.r - (x - ARC.x) ** 2) + 0.016]);
  const chars = makeCharacters(spots);
  field.add(chars.group);
  // Apron with its two instruction cards.
  const ap = apronShape();
  const apTex = apronTexture();
  const apTop = new THREE.MeshStandardMaterial({ map: apTex, roughness: 0.45, emissiveMap: apTex, emissive: hex('xr-pinball-white'), emissiveIntensity: 0.3 });
  const apSide = new THREE.MeshStandardMaterial({ color: hex('xr-pinball-apron'), roughness: 0.4 });
  owned.push(apTop, apSide, apTex);
  const apGeo = new THREE.ExtrudeGeometry(ap, { depth: 0.035, bevelEnabled: false, curveSegments: 24 }); // above the walls' ends
  apGeo.rotateX(-Math.PI / 2);
  const apron = new THREE.Mesh(apGeo, [apTop, apSide]);
  apron.castShadow = true;
  apron.receiveShadow = true;
  apron.userData.noFit = true;
  field.add(apron);
  // Insert lights (additive overlays) and their halos.
  const halo = radialTexture();
  const inserts = {};
  const addLight = (key, shape, token, hx, hy, size) => {
    const mat = new THREE.MeshBasicMaterial({ color: hex(token), ...additive, opacity: 0, polygonOffset: true, polygonOffsetFactor: -2 });
    const m = flatMesh(shape, 0.0008, mat);
    field.add(m);
    const gm = new THREE.MeshBasicMaterial({ map: halo, color: hex(token), ...additive, opacity: 0 });
    const g = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), gm);
    g.position.copy(fp(hx, hy, 0.0012));
    g.userData.noFit = true;
    field.add(g);
    owned.push(mat, gm);
    inserts[key] = { mat, gm, level: 0 };
  };
  for (const ch of CHANNELS) {
    const ins = INSERTS[ch];
    addLight(ch, insertShape(ins), CH_TOKEN[ch], ins.x, ins.y, 0.12);
  }
  for (const ln of table.lanes) {
    const s = new THREE.Shape();
    s.absarc(ln.x, ln.y, 0.0165, 0, Math.PI * 2, false);
    addLight(`lane${ln.index}`, s, `xr-pinball-group-${ln.index + 1}`, ln.x, ln.y, 0.08);
  }
  FUNNEL.forEach((f, i) => {
    addLight(`funnel${i}`, funnelShape(f), `xr-pinball-funnel-${i + 1}`, f.x, f.y, 0.16);
    // The stage's name above the light (white with a dark edge: readable lit and unlit).
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 56;
    const g = c.getContext('2d');
    const label = t(`pinballFunnel${i + 1}`).toUpperCase();
    let px = 40;
    g.font = font('black', px);
    while (g.measureText(label).width > 300 && px > 16) { px -= 1; g.font = font('black', px); }
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 7;
    g.lineJoin = 'round';
    g.strokeStyle = color('xr-pinball-apron-ink');
    g.strokeText(label, 160, 29);
    g.fillStyle = color('xr-pinball-sticker');
    g.fillText(label, 160, 29);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 });
    owned.push(tex, mat);
    const lw = f.w2 - 0.004;
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(lw, (lw * 56) / 320).rotateX(-Math.PI / 2), mat);
    plane.position.copy(fp(f.x, f.y, 0.0016));
    plane.renderOrder = 4;
    plane.userData.noFit = true;
    field.add(plane);
  });
  for (const it of detailInserts(table)) {
    const s = new THREE.Shape();
    if (it.circle) s.absarc(it.circle.x, it.circle.y, it.circle.r, 0, Math.PI * 2, false);
    else it.pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
    addLight(it.key, s, it.token, it.x, it.y, it.size);
  }
  {
    const s = new THREE.Shape();
    s.absarc(MULTI.x, MULTI.y, MULTI.r, 0, Math.PI * 2, false);
    addLight('multi', s, 'xr-pinball-ai', MULTI.x, MULTI.y, 0.1);
    const r = new THREE.Shape();
    const { x, y, w, h } = SAVE;
    r.moveTo(x - w / 2 + h / 2, y - h / 2);
    r.lineTo(x + w / 2 - h / 2, y - h / 2);
    r.absarc(x + w / 2 - h / 2, y, h / 2, -Math.PI / 2, Math.PI / 2, false);
    r.lineTo(x - w / 2 + h / 2, y + h / 2);
    r.absarc(x - w / 2 + h / 2, y, h / 2, Math.PI / 2, Math.PI * 1.5, false);
    addLight('save', r, 'xr-pinball-accent-glow', x, y, 0.1);
  }
  // General illumination: lamps along the walls (chases and light shows run over them).
  const giPts = [];
  const outer = table.walls[0].pts;
  let acc = 0;
  for (let i = 1; i < outer.length; i++) {
    const [ax, ay] = outer[i - 1];
    const [bx, by] = outer[i];
    const len = Math.hypot(bx - ax, by - ay);
    const nx = (by - ay) / len;
    const ny = -(bx - ax) / len;
    for (let s = (0.055 - acc) % 0.055; s < len; s += 0.055) {
      const x = ax + ((bx - ax) * s) / len + nx * 0.009;
      const y = ay + ((by - ay) * s) / len + ny * 0.009;
      if (y > 0.3 && x < 0.236) giPts.push(fp(x, y, 0.016));
    }
    acc = (acc + len) % 0.055;
  }
  for (const s of [1, -1]) {
    for (const [x, y] of [[-0.146, 0.335], [-0.136, 0.292], [-0.123, 0.27]]) giPts.push(fp(s * x, y, 0.012)); // under the sling plastics
  }
  const lamps = makeLamps(giPts, { lite });
  field.add(lamps.group);
  const giWarm = col('xr-pinball-gi');
  const giCols = CHANNELS.map((ch) => col(CH_TOKEN[ch]));
  const gi = { mode: 'normal', pulse: 0 };
  // Flashers in the top corners.
  const flashers = [makeFlasher('xr-pinball-accent-glow'), makeFlasher('xr-pinball-ch-poster')];
  flashers[0].position.copy(fp(-0.236, 0.975, 0));
  flashers[1].position.copy(fp(0.274, 0.975, 0));
  flashers.forEach((f) => { f.userData.k = 0; field.add(f); });
  // Classic details: side art, wood blades, plastics, standups, spinner, rollovers, kickback,
  // trough window, price card, sling flashers.
  const det = buildDetails({ root, field, parts, anchors, table, lite });
  owned.push(...det.owned);
  // The AI's tip: a floating arrow over the recommended channel, a light beam and a ring.
  const tip = makeTipArrow();
  field.add(tip.group);
  owned.push(...tip.owned);
  // The balls (up to three in multiball): chrome with a little light of their own, a soft halo
  // (the ball is the message) and a trail.
  const ballMat = new THREE.MeshStandardMaterial({ color: hex('xr-pinball-ball'), metalness: 0.9, roughness: 0.1, envMapIntensity: 1.6, emissive: hex('xr-pinball-ball'), emissiveIntensity: 0.22 });
  const glowMat = new THREE.SpriteMaterial({ map: halo, color: hex('xr-pinball-ball-glow'), ...additive, opacity: 0.55 });
  owned.push(ballMat, glowMat);
  const trailColor = col('xr-pinball-ball-glow');
  const trailHot = col('xr-pinball-ch-poster');
  const balls = [0, 1, 2].map(() => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 32, 20), ballMat);
    mesh.castShadow = true;
    mesh.userData.noFit = true;
    mesh.visible = false;
    const glow = new THREE.Sprite(glowMat);
    glow.scale.setScalar(BALL_R * 6);
    mesh.add(glow);
    field.add(mesh);
    let blob = null;
    if (lite) {
      blob = new THREE.Mesh(new THREE.PlaneGeometry(BALL_R * 3, BALL_R * 3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: halo, color: hex('xr-pinball-dark'), transparent: true, opacity: 0.5, depthWrite: false }));
      owned.push(blob.material);
      field.add(blob);
    }
    return { mesh, trail: new RibbonTrail(field, 14, BALL_R * 0.6), blob };
  });
  // Backglass: the creative studio, the live KPI chart on its monitor, a neon glow.
  const BW = 0.56;
  const BH = 0.4;
  const bg = drawStudio();
  const bgTex = new THREE.CanvasTexture(bg.canvas);
  bgTex.colorSpace = THREE.SRGBColorSpace;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(BW, BH), new THREE.MeshBasicMaterial({ map: bgTex, toneMapped: false }));
  owned.push(glass.material, bgTex);
  glass.position.copy(anchors.BackglassAnchor ?? new THREE.Vector3(0.025, 0.7, -1.1));
  glass.userData.noFit = true;
  root.add(glass);
  const px = (u, v) => new THREE.Vector3((u / BG_W - 0.5) * BW, (0.5 - v / BG_H) * BH, 0);
  const chart = makeKpiChart((CHART.w / BG_W) * BW, (CHART.h / BG_H) * BH);
  chart.mesh.position.copy(px(CHART.x + CHART.w / 2, CHART.y + CHART.h / 2)).setZ(0.001);
  glass.add(chart.mesh);
  owned.push(chart.mesh.material, chart.tex);
  const neonMat = new THREE.MeshBasicMaterial({ map: halo, color: hex('xr-pinball-title-glow'), ...additive, opacity: 0.3 });
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(BW * 0.95, BH * 0.32), neonMat);
  neon.position.copy(px(BG_W / 2, 68)).setZ(0.002);
  glass.add(neon);
  owned.push(neonMat);
  let bgBulbs = null;
  if (bg.bulbs.length) {
    bgBulbs = makeBulbs(bg.bulbs.map(([u, v]) => new THREE.Vector3((u - 0.5) * BW, (0.5 - v) * BH, 0.004)), { size: 0.0042, halo: 0.03 });
    glass.add(bgBulbs);
  }
  const dmd = new Dmd(0.46, 0.115);
  dmd.mesh.position.copy(anchors.DmdAnchor ?? new THREE.Vector3(0.025, 0.3, -1.1));
  root.add(dmd.mesh);
  owned.push(dmd.mesh.material, dmd.tex);
  // Fairy lights along the head's crown and the side rails (Christmas).
  let railBulbs = null;
  if (CHRISTMAS) {
    const pts = [];
    const top = (anchors.BackglassAnchor?.y ?? 0.7) + 0.27;
    const zf = (anchors.BackglassAnchor?.z ?? -1.1) + 0.03;
    for (let i = 0; i <= 20; i++) pts.push(new THREE.Vector3(-0.285 + (0.62 * i) / 20, top + 0.01 * Math.sin(i * 1.3), zf));
    for (const x of [-0.278, 0.328]) {
      for (let i = 0; i <= 16; i++) {
        const y = -0.06 + (1.3 * i) / 16;
        pts.push(new THREE.Vector3(x, y * Math.sin(SLOPE) + 0.088 * Math.cos(SLOPE), -y * Math.cos(SLOPE) + 0.088 * Math.sin(SLOPE)));
      }
    }
    railBulbs = makeBulbs(pts, { size: 0.0055, halo: 0.04 });
    root.add(railBulbs);
  }

  // ---------- animation ----------

  const tmp = new THREE.Vector3();
  const lampCol = new THREE.Color();
  const state = {
    root, field, board, legs, dmd, inserts, tip, slings, bumpers, drops, column, gate: gateWire, plunger, flippers, owned,
    fx, phone, tv, branch, chars, chart, balls, det,
    /** Legs reach down to the floor (y in the root's parent space, scale of the machine). */
    setFloor(floorLocalY) {
      for (const l of legs) {
        const len = Math.max(0.05, l.top - floorLocalY);
        l.leg.scale.set(1, len, 1);
        l.foot.position.set(l.leg.position.x, l.top - len, l.leg.position.z);
      }
    },
    /** Icons pop out of the playfield at (x, y). */
    burst(icon, x, y, h, opts) { fx.emit(icon, fp(x, y, h), opts); },
    /** The poster column turns and shows the next set of posters. */
    flipPoster() { if (poster.flip < 0) poster.flip = 0; },
    /** General illumination: 'normal', 'attract' (chase) or 'show' (strobe); pulse on hits. */
    setGI(mode) { gi.mode = mode; },
    giPulse(k = 1) { gi.pulse = Math.max(gi.pulse, k); },
    /** A flasher strobes (0: left, 1: right). */
    flash(i, k = 1) { const f = flashers[i]; if (f) f.userData.k = Math.max(f.userData.k, k); },
    /** Frees what the machine made itself (each ball's trail, the effects, textures). Safe twice. */
    dispose() {
      for (const v of balls) {
        v?.trail?.mesh?.geometry?.dispose();
        v?.trail?.mesh?.material?.dispose();
        v?.mesh?.geometry?.dispose();
        v?.blob?.geometry?.dispose();
      }
      fx?.dispose?.();
      det?.dispose?.();
      for (const o of owned) o?.dispose?.();
      owned.length = 0;
    },
    /** Per frame: flippers, plunger, balls, lights and props. */
    update(dt, time, st) {
      for (const [k, f] of Object.entries(table.flippers)) flippers[k].rotation.y = f.angle;
      plunger.position.copy(fp(LANE_X, PLUNGER_Y - st.pull * PLUNGER_TRAVEL, 0.012));
      const list = table.world.balls;
      balls.forEach((v, i) => {
        const b = list[i];
        const show = !!b && b.mode !== 'gone';
        v.mesh.visible = show;
        if (show) {
          const was = v.mesh.position.clone();
          v.mesh.position.copy(fp(b.x, b.y, b.z + BALL_R));
          if (was.distanceTo(v.mesh.position) > 0.08) v.trail.reset(v.mesh.position); // served or saved
          v.mesh.rotation.x -= (b.vy * dt) / BALL_R;
          v.mesh.rotation.z -= (b.vx * dt) / BALL_R;
        }
        const sp = show ? Math.min(1, b.speed / 3) : 0;
        v.trail.update(v.mesh.position, st.hot ? trailHot : trailColor, sp * (st.hot ? 1 : 0.8), st.hot ? 1.6 : 1);
        if (v.blob) {
          v.blob.visible = show;
          if (show) v.blob.position.copy(fp(b.x + 0.004, b.y - 0.006, 0.0007));
        }
      });
      for (const bp of bumpers) {
        bp.flash = Math.max(0, bp.flash - dt * 6);
        if (bp.cap) bp.cap.emissiveIntensity = 0.45 + bp.flash * 2.6;
        bp.bubble.userData.mat.emissiveIntensity = 0.25 + bp.flash * 1.5;
        bp.mesh.scale.y = 1 - bp.flash * 0.12;
        bp.bubble.position.y = 0.047 + bp.flash * 0.006;
      }
      for (const s of slings) s.userData.flash.opacity = Math.max(0, s.userData.flash.opacity - dt * 5);
      drops.forEach((d, i) => {
        const want = table.drops[i].down ? 1 : 0;
        d.down += (want - d.down) * Math.min(1, dt * (want ? 30 : 8));
        d.mesh.position.y = -0.034 * d.down;
      });
      // The poster column: slow turn; a hit spins it once and the posters change halfway.
      if (poster.flip >= 0) {
        poster.flip += dt / 0.6;
        if (poster.flip >= 0.5 && !poster.swapped) {
          poster.swapped = true;
          poster.set += 1;
          drawPosters(posterCan.getContext('2d'), poster.set);
          posterTex.needsUpdate = true;
        }
        if (poster.flip >= 1) { poster.flip = -1; poster.swapped = false; }
      }
      poster.spin += dt * (poster.flip >= 0 ? Math.PI * 2 / 0.6 : 0.35);
      column.rotation.y = poster.spin;
      gateWire.rotation.x = Math.max(0, (gateWire.rotation.x || 0) - dt * 3);
      for (const ins of Object.values(inserts)) {
        ins.mat.opacity = ins.level * 0.9;
        ins.gm.opacity = ins.level * 0.6;
      }
      // General illumination.
      gi.pulse = Math.max(0, gi.pulse - dt * 4);
      for (let i = 0; i < lamps.n; i++) {
        let k = 0.7 + gi.pulse * 0.3;
        let c = giWarm;
        if (gi.mode === 'attract') {
          k = 0.25 + 0.75 * Math.max(0, Math.sin(time * 6 - i * 0.55)) ** 2;
          c = giCols[Math.floor(i / 3 + time * 1.5) % giCols.length];
        } else if (gi.mode === 'show') {
          k = Math.floor(time * 14 + i) % 2 ? 1 : 0.15;
          c = giCols[(i + Math.floor(time * 8)) % giCols.length];
        }
        lampCol.copy(c);
        lamps.set(i, k, lampCol);
      }
      lamps.commit();
      for (const f of flashers) {
        f.userData.k = Math.max(0, f.userData.k - dt * 4);
        f.userData.flash(gi.mode === 'show' ? (Math.floor(time * 10) % 2) * 0.8 : f.userData.k);
      }
      neonMat.opacity = 0.22 + 0.12 * Math.sin(time * 2.2) + (gi.mode === 'show' ? 0.3 * Math.abs(Math.sin(time * 9)) : 0);
      det.update(dt, time, { lampsOn: gi.mode === 'normal' ? 0.6 + gi.pulse * 0.4 : 0.5 + 0.5 * Math.abs(Math.sin(time * 6)), onTurn: st.onSpinTurn });
      tip.update(dt, time, st.eye && field.worldToLocal(st.eye.clone()));
      fx.update(time);
      phone.update(dt, time);
      tv.update(dt, time);
      branch.update(dt, time);
      chars.update(dt, time);
      bgBulbs?.userData.tick(time);
      railBulbs?.userData.tick(time + 1.3);
    },
    /** World position of a playfield point. */
    world(x, y, h = 0) {
      return field.localToWorld(tmp.copy(fp(x, y, h))).clone();
    },
  };
  return state;
}

/** Many copies of a part as instanced meshes (one draw call per material): [x, y, scale]. */
function instanced(part, list) {
  const g = new THREE.Group();
  g.userData.noFit = true;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  part.updateMatrixWorld(true);
  part.traverse((o) => {
    if (!o.isMesh) return;
    const inst = new THREE.InstancedMesh(o.geometry, o.material, list.length);
    list.forEach(([x, y, sc], i) => {
      m.compose(fp(x, y, 0), q, new THREE.Vector3(sc, sc, sc)).multiply(o.matrixWorld);
      inst.setMatrixAt(i, m);
    });
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.userData.noFit = true;
    g.add(inst);
  });
  return g;
}

/** The AI's tip marker: a bobbing chevron over the target, a beam down to it, a ring around it. */
function makeTipArrow() {
  const group = new THREE.Group();
  group.userData.noFit = true;
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(0.022, 0.024);
  s.lineTo(0.009, 0.024);
  s.lineTo(0.009, 0.05);
  s.lineTo(-0.009, 0.05);
  s.lineTo(-0.009, 0.024);
  s.lineTo(-0.022, 0.024);
  s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015, bevelSegments: 1 });
  geo.translate(0, 0, -0.003);
  const mat = new THREE.MeshBasicMaterial({ color: hex('xr-pinball-ai'), toneMapped: false, transparent: true });
  const arrow = new THREE.Mesh(geo, mat);
  const spin = new THREE.Group();
  spin.add(arrow);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), color: hex('xr-pinball-ai'), ...additive, opacity: 0.6 }));
  glow.scale.setScalar(0.09);
  glow.position.y = 0.026;
  spin.add(glow);
  group.add(spin);
  const beamMat = new THREE.MeshBasicMaterial({ color: hex('xr-pinball-ai'), ...additive, opacity: 0.22, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.012, 1, 12, 1, true), beamMat);
  group.add(beam);
  const ringMat = new THREE.MeshBasicMaterial({ color: hex('xr-pinball-ai'), ...additive, opacity: 0.6, side: THREE.DoubleSide });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2), ringMat);
  ring.position.y = 0.0015;
  group.add(ring);
  const target = { x: 0, y: 0, h: 0.1, r: 0.05 };
  let on = 0;
  let want = 0;
  const api = {
    group, owned: [mat, beamMat, ringMat, glow.material],
    /** Points at a channel ([x, y, height, ring radius]), or hides with null. */
    point(t) {
      if (!t) { want = 0; return; }
      [target.x, target.y, target.h, target.r] = t;
      want = 1;
    },
    update(dt, time, eye) {
      on += (want - on) * Math.min(1, dt * 6);
      group.visible = on > 0.02;
      if (!group.visible) return;
      const bob = Math.sin(time * 4) * 0.008;
      group.position.copy(fp(target.x, target.y, 0));
      spin.position.y = target.h + bob;
      // Turned towards the viewer (field space), with a little wobble.
      spin.rotation.y = (eye ? Math.atan2(eye.x - group.position.x, eye.z - group.position.z) : 0) + Math.sin(time * 3) * 0.35;
      spin.scale.setScalar(on * 1.7);
      glow.material.opacity = on * (0.55 + 0.25 * Math.sin(time * 6));
      beam.scale.set(1, target.h, 1);
      beam.position.y = target.h / 2;
      const pulse = 0.5 + 0.5 * Math.sin(time * 6);
      ring.scale.setScalar(target.r * (1 + 0.12 * pulse));
      ringMat.opacity = on * (0.35 + 0.4 * pulse);
      beamMat.opacity = on * 0.2;
      mat.opacity = on;
    },
  };
  return api;
}
