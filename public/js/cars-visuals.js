// "Autohof" (key 'cars'): the used-car lot as a small 3D diorama, built from three.js geometry.
// A two-storey glass showroom with a workshop wing and a pylon sign, eight painted bays in two
// rows, a pavement and a street, lamps, flags, bunting and plants; five kinds of cars with
// clearly different shapes (and the same side views as icons for the panels); visitors who walk
// the lot, look, nod or shake their heads; transporters that bring the bought cars.
//
// Budget (Quest 3): the scenery is merged into a few meshes with vertex colors, every car is four
// draw calls (paint, glass, trim with the wheels, lights) with geometry shared per segment, all
// figures are two instanced meshes, the price signs share one texture, and one light casts
// shadows. All colors are design tokens (css/game-cars.css).
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';
import { hex, color, font } from './tokens.js';
import { gfxTier, softSun, contactShadow, studioEnvironment } from './gfx.js';

const CM = 0.01;
const TAU = Math.PI * 2;
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const easeInOut = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const easeOut = (k) => 1 - (1 - k) ** 3;
const backOut = (k) => 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2;

// ---------- the five kinds of cars (side views in centimeters at the diorama's scale) ----------
// body: the lower body up to the belt line; cabin: the glass house; wheels: axle positions.
export const PROFILES = {
  small: {
    W: 7.4, wr: 1.6, wheels: [-4.2, 4.2],
    body: [[-6.6, 1.6], [-6.8, 3.4], [-6.6, 5.0], [2.6, 5.1], [6.2, 4.3], [6.8, 3.3], [6.6, 1.6]],
    cabin: [[-6.4, 4.8], [-5.2, 7.6], [0.4, 7.7], [3.0, 4.9]],
  },
  estate: {
    W: 7.6, wr: 1.55, wheels: [-5.7, 5.9],
    body: [[-9.1, 1.5], [-9.3, 3.4], [-9.1, 4.7], [3.8, 4.8], [8.6, 4.1], [9.3, 3.2], [9.1, 1.5]],
    cabin: [[-8.9, 4.5], [-8.2, 6.9], [1.6, 7.0], [4.4, 4.6]],
  },
  suv: {
    W: 8.4, wr: 2.15, wheels: [-5.4, 5.4],
    body: [[-8.6, 2.3], [-8.8, 4.6], [-8.6, 6.4], [3.6, 6.5], [8.3, 5.9], [8.8, 4.6], [8.6, 2.3]],
    cabin: [[-8.4, 6.2], [-7.9, 9.3], [1.4, 9.4], [3.8, 6.3]],
  },
  cabrio: {
    W: 7.6, wr: 1.6, wheels: [-5.2, 5.4],
    body: [[-8.1, 1.4], [-8.3, 3.2], [-7.9, 4.5], [-3.4, 4.8], [-2.9, 4.1], [1.5, 4.1], [2.2, 4.8], [7.6, 4.1], [8.3, 3.0], [8.1, 1.4]],
    cabin: null,
  },
  electric: {
    W: 7.8, wr: 1.65, wheels: [-5.4, 5.6],
    body: [[-8.4, 1.5], [-8.6, 3.4], [-8.2, 5.0], [3.4, 5.0], [7.6, 4.2], [8.6, 3.0], [8.4, 1.5]],
    cabin: [[-8.0, 4.8], [-4.6, 7.0], [-0.4, 7.2], [5.4, 4.7]],
  },
};
const BOLT = [[0.5, 1.5], [-0.9, -0.2], [-0.1, -0.2], [-0.5, -1.5], [0.9, 0.2], [0.1, 0.2]];

/**
 * A segment's icon: its side view on a 20 x 11 grid (x to the right, y down), as path strings.
 * fill: the silhouette; cut: details in the background color (windows, the electric car's bolt).
 */
export function segIcon(seg) {
  const p = PROFILES[seg];
  const P = (pts) => `M${pts.map(([x, y]) => `${(x + 10).toFixed(2)} ${(10.4 - y).toFixed(2)}`).join('L')}Z`;
  const circle = (cx, cy, r) => { const x = cx + 10; const y = 10.4 - cy; return `M${(x - r).toFixed(2)} ${y.toFixed(2)}a${r} ${r} 0 1 0 ${(2 * r).toFixed(2)} 0a${r} ${r} 0 1 0 ${(-2 * r).toFixed(2)} 0Z`; };
  let fill = P(p.body) + p.wheels.map((x) => circle(x, p.wr, p.wr)).join('');
  let cut = p.wheels.map((x) => circle(x, p.wr, p.wr * 0.42)).join('');
  if (p.cabin) {
    fill += P(p.cabin);
    const [a, b, c, d] = p.cabin;
    const mid = (a[0] + d[0]) / 2 - 0.4;
    const inset = (q, dx, dy) => [q[0] + dx, q[1] + dy];
    cut += P([inset(a, 0.9, 0.5), inset(b, 0.5, -0.7), [mid - 0.35, b[1] - 0.7], [mid - 0.35, a[1] + 0.5]]);
    cut += P([[mid + 0.35, a[1] + 0.5], [mid + 0.35, c[1] - 0.7], inset(c, -0.3, -0.7), inset(d, -1.1, 0.5)]);
  }
  if (seg === 'estate') fill += P([[-5.6, 7.3], [-5.2, 8.5], [0.2, 8.5], [0.8, 7.3]]);
  if (seg === 'suv') fill += circle(-9.0, 5.2, 1.5) + P([[-7.2, 9.4], [-7.2, 10.1], [0.8, 10.1], [0.8, 9.4]]);
  if (seg === 'cabrio') fill += P([[2.5, 4.6], [1.5, 6.6], [2.0, 6.7], [3.3, 4.6]]) + P([[-2.4, 4.0], [-2.6, 5.7], [-1.5, 5.7], [-1.3, 4.0]]);
  if (seg === 'electric') cut += P(BOLT.map(([x, y]) => [x * 0.95 + 5.2, y * 0.95 + 3.25]));
  return { fill, cut, w: 20, h: 11 };
}

/** The icon as inline SVG (panels on the screen). */
export function segSVG(seg, cls = 'cars-ico') {
  const ic = segIcon(seg);
  return `<svg class="${cls}" viewBox="0 0 ${ic.w} ${ic.h}" aria-hidden="true" focusable="false"><path class="cars-ico__fill" d="${ic.fill}"/><path class="cars-ico__cut" d="${ic.cut}"/></svg>`;
}

const iconPaths = new Map();
/** Draws the icon on a canvas: box x, y, w (height = w * 11 / 20), in two colors. */
export function drawSegIcon(ctx, seg, x, y, w, fillColor, cutColor) {
  if (!iconPaths.has(seg)) { const ic = segIcon(seg); iconPaths.set(seg, { fill: new Path2D(ic.fill), cut: new Path2D(ic.cut) }); }
  const ic = iconPaths.get(seg);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(w / 20, w / 20);
  ctx.fillStyle = fillColor;
  ctx.fill(ic.fill);
  ctx.fillStyle = cutColor;
  ctx.fill(ic.cut);
  ctx.restore();
}

// ---------- geometry helpers ----------

/** Keeps position, normal and a flat vertex color: geometries of any kind can then be merged. */
function tint(geo, colorHex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  const n = g.attributes.position.count;
  const c = new THREE.Color(colorHex);
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function merged(list) {
  const g = mergeGeometries(list, false);
  list.forEach((x) => x.dispose());
  return g;
}

const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

/** A closed outline with rounded corners. */
function roundShape(pts, r) {
  const s = new THREE.Shape();
  const n = pts.length;
  const a = new THREE.Vector2();
  const b = new THREE.Vector2();
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i + n - 1) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    a.set(p0[0] - p1[0], p0[1] - p1[1]);
    b.set(p2[0] - p1[0], p2[1] - p1[1]);
    const ra = Math.min(r, a.length() * 0.45);
    const rb = Math.min(r, b.length() * 0.45);
    a.setLength(ra);
    b.setLength(rb);
    if (i === 0) s.moveTo(p1[0] + a.x, p1[1] + a.y); else s.lineTo(p1[0] + a.x, p1[1] + a.y);
    s.quadraticCurveTo(p1[0], p1[1], p1[0] + b.x, p1[1] + b.y);
  }
  s.closePath();
  return s;
}

/** A side view pushed out to a width (centered), with rounded corners and bevelled edges. */
function extrude(pts, width, { round = 0.5, bevel = 0.45, steps = 3 } = {}) {
  const g = new THREE.ExtrudeGeometry(roundShape(pts, round), {
    depth: width - bevel * 2, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelOffset: -bevel, bevelSegments: steps, curveSegments: 4,
  });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  return g;
}

/** A flat rounded rectangle lying on the ground (x by z), with a thickness and bevelled edges. */
function slab(w, d, h, r, bevel = 0.004, curve = 6) {
  const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]];
  const g = new THREE.ExtrudeGeometry(roundShape(pts, r), { depth: h - bevel, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelOffset: -bevel, bevelSegments: 2, curveSegments: curve });
  g.rotateX(-Math.PI / 2); // the outline's y becomes -z; its depth goes up
  return g;
}

// ---------- cars ----------

const carCache = new Map(); // segment -> { paint, glass, trim, lights } geometries (in meters)

function buildCarGeo(seg, tok, tier) {
  if (carCache.has(seg)) return carCache.get(seg);
  const p = PROFILES[seg];
  const W = p.W;
  const segs = tier === 'low' ? 10 : 16;
  const steps = tier === 'low' ? 1 : 3;
  const paint = [extrude(p.body, W, { round: 0.9, bevel: 0.7, steps })];
  const glass = [];
  const trim = [];
  const lights = [];
  const x0 = Math.min(...p.body.map((q) => q[0]));
  const x1 = Math.max(...p.body.map((q) => q[0]));
  const belt = Math.max(...p.body.map((q) => q[1]));
  if (p.cabin) {
    const [a, b, c, d] = p.cabin;
    glass.push(extrude(p.cabin, W * 0.84, { round: 0.7, bevel: 0.5, steps }));
    // The roof and the pillar between the doors are painted.
    paint.push(extrude([[b[0] - 0.5, b[1] - 0.45], [b[0] - 0.1, b[1] + 0.2], [c[0] + 0.1, c[1] + 0.2], [c[0] + 0.7, c[1] - 0.45]], W * 0.86, { round: 0.2, bevel: 0.3, steps: 2 }));
    const mid = (a[0] + d[0]) / 2 - 0.4;
    paint.push(box(0.6, b[1] - a[1], W * 0.855, mid, (a[1] + b[1]) / 2 + 0.1, 0));
  }
  // The dark underbody, bumpers, mirrors.
  trim.push(tint(box(x1 - x0 - 1.2, 1.0, W * 0.9, (x0 + x1) / 2, p.body[0][1] - 0.15, 0), tok.trim));
  trim.push(tint(box(0.5, 0.9, W * 0.86, x1 - 0.12, p.body[0][1] + 0.75, 0), tok.trim));
  trim.push(tint(box(0.5, 0.9, W * 0.86, x0 + 0.12, p.body[0][1] + 0.75, 0), tok.trim));
  const mx = p.cabin ? p.cabin[3][0] - 0.6 : 2.4;
  for (const s of [-1, 1]) trim.push(tint(box(0.7, 0.5, 0.55, mx, belt + 0.2, s * (W / 2 + 0.15)), tok.trim));
  // Wheels: a tire, a bright rim and a hub.
  for (const wx of p.wheels) {
    for (const s of [-1, 1]) {
      const z = s * (W / 2 - 0.62);
      trim.push(tint(new THREE.CylinderGeometry(p.wr, p.wr, 1.5, segs).rotateX(Math.PI / 2).translate(wx, p.wr, z), tok.tire));
      const rim = seg === 'electric' ? 0.78 : 0.6;
      trim.push(tint(new THREE.CylinderGeometry(p.wr * rim, p.wr * rim, 0.3, segs).rotateX(Math.PI / 2).translate(wx, p.wr, z + s * 0.68), seg === 'electric' ? tok.electric : tok.rim));
      trim.push(tint(new THREE.CylinderGeometry(p.wr * 0.22, p.wr * 0.22, 0.34, 8).rotateX(Math.PI / 2).translate(wx, p.wr, z + s * 0.72), tok.trim));
    }
  }
  // Lights: warm at the front, red at the back.
  const ly = belt - (seg === 'suv' ? 1.3 : 1.0);
  if (seg === 'electric') {
    lights.push(tint(box(0.35, 0.36, W * 0.8, x1 - 0.42, ly + 0.25, 0), tok.electric));
    lights.push(tint(box(0.35, 0.36, W * 0.8, x0 + 0.3, ly + 0.5, 0), tok.tail));
  } else {
    for (const s of [-1, 1]) {
      lights.push(tint(box(0.5, 0.75, 1.5, x1 - 0.5, ly + 0.1, s * (W / 2 - 1.25)), tok.head));
      lights.push(tint(box(0.4, 0.75, 1.4, x0 + 0.22, ly + 0.3, s * (W / 2 - 1.2)), tok.tail));
    }
    trim.push(tint(box(0.3, 0.8, W * 0.42, x1 - 0.3, ly + 0.05, 0), tok.trim)); // grille
  }
  // What makes each kind its own.
  if (seg === 'estate') {
    for (const s of [-1, 1]) trim.push(tint(box(8.6, 0.22, 0.3, -3.2, 7.4, s * 2.4), tok.rim));
    trim.push(tint(extrude([[-6.2, 7.5], [-5.8, 8.7], [-0.6, 8.7], [0.2, 7.5]], 4.2, { round: 0.4, bevel: 0.3, steps: 2 }), tok.box));
  }
  if (seg === 'suv') {
    for (const x of [-6.2, -0.6]) trim.push(tint(box(0.35, 0.3, W * 0.8, x, 9.85, 0), tok.trim));
    for (const s of [-1, 1]) trim.push(tint(box(7.2, 0.26, 0.3, -3.4, 9.8, s * (W * 0.4)), tok.rim));
    trim.push(tint(new THREE.CylinderGeometry(1.7, 1.7, 0.9, segs).rotateZ(Math.PI / 2).translate(x0 - 0.35, 5.3, 0), tok.tire));
    trim.push(tint(new THREE.CylinderGeometry(1.0, 1.0, 0.95, segs).rotateZ(Math.PI / 2).translate(x0 - 0.38, 5.3, 0), tok.rim));
    for (const s of [-1, 1]) trim.push(tint(box(8.0, 0.3, 0.5, 0, 2.2, s * (W / 2 + 0.1)), tok.trim));
  }
  if (seg === 'cabrio') {
    // Side walls of the cockpit, two seats with head rests, the windscreen and a roll bar.
    for (const s of [-1, 1]) paint.push(box(5.4, 0.7, 0.7, -0.7, 4.45, s * (W / 2 - 0.55)));
    for (const s of [-1, 1]) {
      trim.push(tint(box(1.5, 1.5, 2.3, -1.5, 4.6, s * 1.55), tok.seat));
      trim.push(tint(box(0.6, 1.5, 2.1, -2.35, 5.3, s * 1.55), tok.seat));
    }
    trim.push(tint(new THREE.TorusGeometry(0.75, 0.13, 6, 12).rotateY(Math.PI / 2).translate(1.2, 4.7, -1.55), tok.trim)); // steering wheel
    glass.push(box(0.25, 2.3, W * 0.82).rotateZ(0.5).translate(2.35, 5.6, 0));
    trim.push(tint(box(0.3, 0.3, W * 0.86).translate(1.8, 6.65, 0), tok.trim));
    trim.push(tint(box(0.35, 1.2, W * 0.8, -3.3, 5.2, 0), tok.rim));
  }
  if (seg === 'electric') {
    const bolt = new THREE.ExtrudeGeometry(new THREE.Shape(BOLT.map(([x, y]) => new THREE.Vector2(x * 1.15, y * 1.15))), { depth: 0.12, bevelEnabled: false });
    bolt.rotateX(-Math.PI / 2).rotateY(Math.PI / 2).translate(-2.4, 7.36, 0);
    lights.push(tint(bolt, tok.electric));
    trim.push(tint(new THREE.CylinderGeometry(0.45, 0.45, 0.2, 10).rotateX(Math.PI / 2).translate(-6.6, 4.1, W / 2 - 0.02), tok.electric)); // charging flap
  }
  const strip = (g) => { const out = g.index ? g.toNonIndexed() : g; for (const n of Object.keys(out.attributes)) if (n !== 'position' && n !== 'normal') out.deleteAttribute(n); return out; };
  const geo = {
    paint: merged(paint.map(strip)).scale(CM, CM, CM),
    glass: glass.length ? merged(glass.map(strip)).scale(CM, CM, CM) : null,
    trim: merged(trim).scale(CM, CM, CM),
    lights: merged(lights).scale(CM, CM, CM),
    len: (x1 - x0) * CM, width: W * CM, height: (p.cabin ? p.cabin[1][1] : 6.6) * CM,
  };
  carCache.set(seg, geo);
  return geo;
}

/** Frees the shared car geometries (when the scene closes). */
function disposeCarCache() {
  for (const g of carCache.values()) { g.paint.dispose(); g.glass?.dispose(); g.trim.dispose(); g.lights.dispose(); }
  carCache.clear();
}

// ---------- the lot ----------

// Where things stand (meters; x to the right, z towards the viewer).
const PLATE = { w: 1.32, d: 1.0, cz: 0.02 };
const BAY_X = [-0.315, -0.105, 0.105, 0.315];
const ROW_Z = [-0.1, 0.165];
const AISLE_Z = 0.035;
const DRIVE_X = 0.5;
const WALK_Z = 0.335;
const LANE_Z = 0.4;
const PARK_Z = 0.455;
const EDGE = 0.64;
const HEAD = -Math.PI / 2 + 0.42; // parked: nose towards the viewer, a little to the right
const PEOPLE = 28;
const POPUPS = 6;
// The showroom across the back (a two-storey glass box, the sliding doors at x = door), the
// workshop wing on its right and the pylon sign beside the entrance.
const SHOW = { x0: -0.37, x1: 0.3, z0: -0.465, z1: -0.272, h: 0.19, story: 0.095, door: -0.265 };
const SHOP = { x0: 0.292, x1: 0.49, z0: -0.455, z1: -0.29, h: 0.122 };
const PYLON = { x: -0.44, z: -0.3, h: 0.245, w: 0.058, d: 0.018 };

export const bayPos = (i) => ({ x: BAY_X[i % 4], z: ROW_Z[Math.floor(i / 4)] });

export class Lot {
  /**
   * opts: xr (headset), ar (passthrough: nothing around the plate), calm (calm motion),
   * signText(car) -> { price, tag, sub }, onCar(carId, 'click' | 'over' | 'out').
   */
  constructor(renderer, opts = {}) {
    this.renderer = renderer;
    this.opts = opts;
    this.calm = !!opts.calm;
    this.tier = gfxTier();
    this.root = new THREE.Group();
    this.face = -0.7; // signs and bubbles lean back this far to face the viewer
    this.time = 0;
    this.anims = [];
    this.cars = new Map(); // car id -> view
    this.people = [];
    this.bubbleMats = new Map();
    this.mood = { key: 'calm', k: 1 };
    this.tok = {
      trim: hex('xr-cars-car-trim'), tire: hex('xr-cars-car-tire'), rim: hex('xr-cars-car-rim'), head: hex('xr-cars-car-head'), tail: hex('xr-cars-car-tail'),
      seat: hex('xr-cars-car-seat'), electric: hex('xr-cars-car-electric'), box: hex('xr-cars-car-box'),
    };
    this.buildMaterials();
    this.buildLights();
    this.buildGround();
    this.buildShowroom();
    this.buildStreetFurniture();
    this.buildFlags();
    this.buildBays();
    this.buildSigns();
    this.buildPeople();
    this.buildPopups();
    this.buildWeather();
    this.trucks = [this.buildTruck(0), this.buildTruck(1)];
    this.ambient = { walk: 0.6, browse: 3.5, on: true };
  }

  // ---------- materials ----------

  buildMaterials() {
    const hi = this.tier === 'high';
    this.matte = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 });
    this.glassMat = new THREE.MeshStandardMaterial({ color: hex('xr-cars-car-glass'), roughness: 0.06, metalness: 0.75, envMapIntensity: 1.6 });
    this.trimMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25 });
    this.lightMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    // The showroom's glass and its polished parts reflect the studio environment (the one
    // sceneLook puts on the scene) at their own strength.
    const env = studioEnvironment(this.renderer);
    this.showGlassMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.05, metalness: 0.6, transparent: true, opacity: 0.28, envMap: env, envMapIntensity: 1.0, depthWrite: false });
    this.sheenMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.16, metalness: 0.3, envMap: env, envMapIntensity: 0.9 });
    const Paint = hi ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
    this.paintBase = new Paint({ roughness: 0.3, metalness: 0.35, envMapIntensity: 1.25, ...(hi ? { clearcoat: 1, clearcoatRoughness: 0.08 } : {}) });
    this.dust = new THREE.Color(hex('xr-cars-dust'));
    this.segColor = {};
    for (const s of Object.keys(PROFILES)) this.segColor[s] = new THREE.Color(hex(`xr-cars-seg-${s}`));
  }

  /** The paint of one car: its segment's color in one of a few shades; shiny, plain or dull. */
  paintFor(car) {
    const m = this.paintBase.clone();
    const base = this.segColor[car.seg].clone();
    const hsl = { h: 0, s: 0, l: 0 };
    base.getHSL(hsl);
    const shade = [0, -0.07, 0.06, -0.03][car.id % 4];
    base.setHSL(hsl.h, clamp(hsl.s + (car.id % 3 === 0 ? -0.08 : 0.02), 0, 1), clamp(hsl.l + shade, 0.12, 0.8));
    m.userData.base = base;
    m.userData.cond = car.cond;
    this.stylePaint(m, car.weeks ?? 0);
    return m;
  }

  /** Condition and dust on the paint: a kept car shines, a rough one is dull, a standing one dusty. */
  stylePaint(m, weeks) {
    const cond = m.userData.cond;
    const dusty = clamp((weeks - 1) / 3, 0, 0.6) + (cond === 'rough' ? 0.16 : 0);
    m.color.copy(m.userData.base).lerp(this.dust, dusty);
    m.roughness = (cond === 'top' ? 0.18 : cond === 'ok' ? 0.34 : 0.62) + dusty * 0.5;
    m.metalness = cond === 'rough' ? 0.15 : 0.38 - dusty * 0.3;
    if ('clearcoat' in m) m.clearcoat = clamp((cond === 'top' ? 1 : cond === 'ok' ? 0.7 : 0.1) - dusty * 1.4, 0, 1);
    m.envMapIntensity = cond === 'top' ? 1.5 : 1.1 - dusty;
  }

  /** A car model (group at the ground, nose along +x). */
  makeCar(car, { hit = true, shadow = true } = {}) {
    const geo = buildCarGeo(car.seg, this.tok, this.tier);
    const g = new THREE.Group();
    const body = new THREE.Group(); // leans and bobs on its springs
    g.add(body);
    const paint = new THREE.Mesh(geo.paint, this.paintFor(car));
    const trim = new THREE.Mesh(geo.trim, this.trimMat);
    const lights = new THREE.Mesh(geo.lights, this.lightMat);
    body.add(paint, trim, lights);
    if (geo.glass) body.add(new THREE.Mesh(geo.glass, this.glassMat));
    for (const m of body.children) { m.castShadow = this.tier !== 'low' && m !== lights; m.receiveShadow = false; }
    let blob = null;
    if (shadow) {
      blob = contactShadow(1, 0.5);
      blob.scale.set(geo.len * 0.6, geo.width * 0.85, 1);
      blob.position.y = 0.0012;
      g.add(blob);
    }
    let box = null;
    if (hit) {
      box = new THREE.Mesh(new THREE.BoxGeometry(geo.len, geo.height, geo.width).translate(0, geo.height / 2, 0), this.hitMat ??= new THREE.MeshBasicMaterial({ visible: false }));
      box.userData.noFit = true;
      box.userData.interactive = true;
      box.userData.focusable = false;
      box.userData.onClick = () => this.opts.onCar?.(car.id, 'click');
      box.userData.setHover = (v) => this.opts.onCar?.(car.id, v ? 'over' : 'out');
      g.add(box);
    }
    return { g, body, paint, geo, blob, box };
  }

  // ---------- light ----------

  buildLights() {
    // A warm key from the front left (the only shadow caster) and a cool fill from the sky.
    this.keyColors = {};
    for (const k of ['calm', 'spring', 'snow', 'rain', 'warm']) this.keyColors[k] = new THREE.Color(hex(`xr-cars-key-${k}`));
    const key = new THREE.DirectionalLight(this.keyColors.calm.getHex(), 1.55);
    key.position.set(-0.75, 1.05, 0.62);
    key.target.position.set(0, 0, 0);
    this.root.add(key, key.target);
    if (this.tier !== 'low') softSun(key, { size: 1.7, near: 0.2, far: 3, bias: -0.0005, normalBias: 0.006, radius: 2.5 });
    this.key = key;
    this.fill = new THREE.HemisphereLight(hex('xr-cars-fill'), hex('xr-cars-bounce'), 0.5);
    this.root.add(this.fill);
    if (this.tier === 'high') {
      this.rim = new THREE.DirectionalLight(hex('xr-cars-fill'), 0.35);
      this.rim.position.set(0.8, 0.6, -0.7);
      this.root.add(this.rim, this.rim.target);
    }
  }

  // ---------- scenery ----------

  buildGround() {
    const t = (n) => hex(`xr-cars-${n}`);
    const g = [];
    const cz = PLATE.cz;
    // The base plate with a trim line, the grass, the asphalt of the lot, the pavement, the street.
    g.push(tint(slab(PLATE.w, PLATE.d, 0.04, 0.05, 0.008).translate(0, -0.052, cz), t('base')));
    g.push(tint(slab(PLATE.w - 0.012, PLATE.d - 0.012, 0.012, 0.046, 0.003).translate(0, -0.0165, cz), t('grass')));
    g.push(tint(slab(1.18, 0.62, 0.006, 0.03, 0.0015).translate(0.02, -0.006, -0.01), t('asphalt')));
    g.push(tint(box(1.3, 0.004, 0.056, 0, -0.002, WALK_Z - 0.004), t('pavement')));
    g.push(tint(box(1.3, 0.008, 0.008, 0, 0.0, WALK_Z - 0.036), t('kerb')));
    g.push(tint(box(1.3, 0.008, 0.008, 0, 0.0, WALK_Z + 0.028), t('kerb')));
    g.push(tint(box(1.3, 0.004, 0.155, 0, -0.003, 0.4425), t('street')));
    for (let i = 0; i < 9; i++) g.push(tint(box(0.07, 0.0012, 0.006, -0.56 + i * 0.14, 0.0, 0.428), t('line')));
    // Pavement slabs (thin joints) and the driveway.
    for (let i = 0; i < 13; i++) g.push(tint(box(0.003, 0.0006, 0.054, -0.6 + i * 0.1, 0.0003, WALK_Z - 0.004), t('kerb')));
    g.push(tint(box(0.13, 0.0045, 0.07, DRIVE_X, -0.0018, WALK_Z - 0.004), t('asphalt')));
    // The painted bays: lines between the cars, at the parked angle.
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i <= 4; i++) {
        const x = (i === 4 ? BAY_X[3] + 0.21 : BAY_X[i]) - 0.105;
        const line = box(0.2, 0.001, 0.006).rotateY(HEAD).translate(x, 0.0004, ROW_Z[r]);
        g.push(tint(line, t('line')));
      }
    }
    // A low hedge behind the back row and beside the showroom.
    g.push(tint(slab(0.2, 0.03, 0.03, 0.012, 0.006).translate(-0.5, 0, -0.26), t('hedge')));
    g.push(tint(slab(0.12, 0.03, 0.03, 0.012, 0.006).translate(0.565, 0, -0.26), t('hedge')));
    const mesh = new THREE.Mesh(merged(g), this.matte);
    mesh.receiveShadow = true;
    this.root.add(mesh);
    this.ground = mesh;
    // The plate's own soft shadow: it sits on the table (AR) or floats in front of the sky.
    const under = contactShadow(1, 0.55);
    under.scale.set(PLATE.w * 0.66, PLATE.d * 0.66, 1);
    under.position.set(0, -0.058, cz);
    this.root.add(under);
  }

  buildShowroom() {
    // A two-storey glass showroom across the back of the lot: a flat roof with a parapet and two
    // units on top, a lit fascia with the lot's name, a canopy over the sliding doors, three cars
    // on a polished floor (one on a turntable), a gallery upstairs, a workshop wing with a roller
    // door on the right and a pylon sign beside the entrance. Five draw calls for the building
    // (walls, polished parts, glass, signs; lit parts join the lamps' mesh) and four for the cars.
    const t = (n) => hex(`xr-cars-${n}`);
    const shell = [];
    const sheen = [];
    const panes = [];
    const glow = [];
    const signs = [];
    const { x0, x1, z0, z1, h, story, door } = SHOW;
    const W = x1 - x0;
    const D = z1 - z0;
    const cx = (x0 + x1) / 2;
    const cz = (z0 + z1) / 2;
    const fz = z1 - 0.006; // the glass line
    const blk = (w, d, hh, x, y, z, r = 0.006, bev = 0.002, curve = 3) => slab(w, d, hh, r, bev, curve).translate(x, y + bev, z);
    const frame = t('show-frame');
    // Plinth, walls, the roof with its parapet, two units on the roof.
    shell.push(tint(blk(W + 0.012, D + 0.01, 0.005, cx, 0, cz, 0.006, 0.0015), t('show-plinth')));
    shell.push(tint(box(W - 0.02, h, 0.012, cx, h / 2, z0 + 0.006), t('wall')));
    shell.push(tint(blk(0.02, D, h - 0.002, x0 + 0.01, 0, cz, 0.005), t('wall')));
    shell.push(tint(blk(0.016, D, h - 0.002, x1 - 0.008, 0, cz, 0.005), t('wall')));
    // The roof: solid over the gallery at the back, a skylight over the cars (seen from above).
    const sk = { x0: x0 + 0.03, x1: x1 - 0.03, z0: z0 + 0.075, z1: z1 - 0.028 };
    shell.push(tint(blk(W, sk.z0 - z0, 0.012, cx, h, (z0 + sk.z0) / 2, 0.005, 0.002), t('roof')));
    shell.push(tint(blk(W, z1 - 0.006 - sk.z1, 0.012, cx, h, (sk.z1 + z1 - 0.006) / 2, 0.003, 0.002), t('roof')));
    for (const x of [x0 + 0.015, x1 - 0.015]) shell.push(tint(box(0.03, 0.012, sk.z1 - sk.z0, x, h + 0.007, (sk.z0 + sk.z1) / 2), t('roof')));
    panes.push(tint(box(sk.x1 - sk.x0, 0.002, sk.z1 - sk.z0, (sk.x0 + sk.x1) / 2, h + 0.01, (sk.z0 + sk.z1) / 2), t('glass')));
    for (let i = 1; i < 6; i++) sheen.push(tint(box(0.004, 0.004, sk.z1 - sk.z0, sk.x0 + ((sk.x1 - sk.x0) * i) / 6, h + 0.012, (sk.z0 + sk.z1) / 2), t('show-frame')));
    sheen.push(tint(box(sk.x1 - sk.x0, 0.004, 0.004, (sk.x0 + sk.x1) / 2, h + 0.012, (sk.z0 + sk.z1) / 2), t('show-frame')));
    shell.push(tint(box(W, 0.012, 0.008, cx, h + 0.018, z0 + 0.004), t('wall')));
    for (const x of [x0 + 0.004, x1 - 0.004]) shell.push(tint(box(0.008, 0.012, D - 0.01, x, h + 0.018, cz - 0.004), t('wall')));
    for (const [ux, uw, ud, uh] of [[-0.2, 0.075, 0.044, 0.024], [0.13, 0.054, 0.04, 0.018]]) {
      shell.push(tint(blk(uw, ud, uh, ux, h + 0.012, z0 + 0.04, 0.004, 0.0015), t('roof-unit')));
      shell.push(tint(new THREE.CylinderGeometry(uw * 0.22, uw * 0.22, 0.003, 10).translate(ux - uw * 0.18, h + 0.014 + uh, z0 + 0.04), t('wall-2')));
      shell.push(tint(box(uw * 0.36, 0.002, ud * 0.7, ux + uw * 0.2, h + 0.0135 + uh, z0 + 0.04), t('wall-2')));
    }
    // The fascia: a white band over the glass that rises above the roof, with a lit stripe.
    shell.push(tint(blk(W + 0.016, 0.02, 0.068, cx, 0.15, z1 + 0.004, 0.005, 0.002), t('wall')));
    glow.push(tint(box(W + 0.017, 0.012, 0.004, cx, 0.159, z1 + 0.0138), t('fascia')));
    for (const x of [x0 - 0.007, x1 + 0.007]) glow.push(tint(box(0.003, 0.012, 0.02, x, 0.159, z1 + 0.004), t('fascia')));
    // Inside: the gallery upstairs with a dark wall below it, a lit strip, three pendant lamps,
    // a counter by the door.
    shell.push(tint(box(W - 0.04, story - 0.008, 0.003, cx, story / 2, z0 + 0.0135), t('show-accent')));
    shell.push(tint(blk(W - 0.036, 0.046, 0.006, cx, story - 0.004, z0 + 0.035, 0.003, 0.001), t('wall')));
    glow.push(tint(box(W - 0.04, 0.003, 0.002, cx, story - 0.003, z0 + 0.0585), t('interior')));
    glow.push(tint(box(W - 0.06, 0.006, 0.002, cx, story + 0.05, z0 + 0.0125), t('interior')));
    for (const x of [-0.17, 0.02, 0.2]) {
      glow.push(tint(new THREE.CylinderGeometry(0.011, 0.014, 0.006, 12).translate(x, 0.143, cz + 0.02), t('interior')));
      sheen.push(tint(new THREE.CylinderGeometry(0.0008, 0.0008, h - 0.146, 3).translate(x, (h + 0.146) / 2, cz + 0.02), frame));
    }
    shell.push(tint(blk(0.042, 0.022, 0.026, -0.328, 0.006, z0 + 0.03, 0.004), t('wall')));
    shell.push(tint(box(0.046, 0.003, 0.026, -0.328, 0.0345, z0 + 0.03), t('wall-2')));
    // The polished floor and the turntable.
    sheen.push(tint(blk(W - 0.03, D - 0.016, 0.003, cx, 0.005, cz - 0.002, 0.004, 0.001), t('floor')));
    sheen.push(tint(new THREE.CylinderGeometry(0.074, 0.076, 0.006, 24).translate(0.02, 0.012, cz - 0.004), t('show-podium')));
    sheen.push(tint(new THREE.CylinderGeometry(0.0765, 0.0765, 0.0015, 24).translate(0.02, 0.0095, cz - 0.004), t('show-frame')));
    // The glass front: slim mullions, a transom at the gallery, the sliding doors in a frame.
    const dHalf = 0.036;
    const dTop = 0.08;
    const gx0 = x0 + 0.02;
    const gx1 = x1 - 0.016;
    const n = 8;
    for (let i = 0; i <= n; i++) {
      const x = gx0 + ((gx1 - gx0) * i) / n;
      const inDoor = Math.abs(x - door) < dHalf + 0.004;
      const y0 = inDoor ? dTop : 0.005;
      sheen.push(tint(box(0.0035, 0.15 - y0, 0.005, x, (0.15 + y0) / 2, fz + 0.002), frame));
    }
    for (const [a, b] of [[gx0, door - dHalf], [door + dHalf, gx1]]) sheen.push(tint(box(b - a, 0.005, 0.006, (a + b) / 2, 0.0075, fz + 0.002), frame));
    for (const y of [story, 0.148]) sheen.push(tint(box(gx1 - gx0, 0.004, 0.006, (gx0 + gx1) / 2, y, fz + 0.002), frame));
    for (const s of [-1, 1]) sheen.push(tint(box(0.005, dTop, 0.008, door + s * dHalf, dTop / 2 + 0.005, fz + 0.003), frame));
    sheen.push(tint(box(dHalf * 2 + 0.005, 0.006, 0.008, door, dTop + 0.005, fz + 0.003), frame));
    const leafW = dHalf - 0.004;
    for (const s of [-1, 1]) {
      const lx = door + s * (leafW / 2 + 0.002);
      panes.push(tint(box(leafW, dTop - 0.004, 0.002, lx, dTop / 2 + 0.005, fz + 0.006), t('glass')));
      for (const e of [-1, 1]) sheen.push(tint(box(0.0025, dTop - 0.004, 0.003, lx + e * (leafW / 2 - 0.001), dTop / 2 + 0.005, fz + 0.006), frame));
      sheen.push(tint(box(leafW, 0.004, 0.003, lx, 0.008, fz + 0.006), frame));
    }
    panes.push(tint(box(door - dHalf - gx0, 0.143, 0.002, (gx0 + door - dHalf) / 2, 0.0775, fz), t('glass')));
    panes.push(tint(box(gx1 - door - dHalf, 0.143, 0.002, (gx1 + door + dHalf) / 2, 0.0775, fz), t('glass')));
    panes.push(tint(box(dHalf * 2, 0.148 - dTop - 0.008, 0.002, door, (0.148 + dTop + 0.008) / 2, fz), t('glass')));
    panes.push(tint(box(W - 0.05, 0.02, 0.002, cx, story + 0.013, z0 + 0.057), t('glass'))); // the gallery's rail
    // Reflections: slanted light streaks on the glass.
    const streak = (xb, wb, slant) => {
      const y0 = 0.009;
      const y1 = 0.146;
      const q = new THREE.BufferGeometry();
      const v = [xb, y0, 0, xb + wb, y0, 0, xb + wb + slant, y1, 0, xb, y0, 0, xb + wb + slant, y1, 0, xb + slant, y1, 0];
      q.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      q.computeVertexNormals();
      return tint(q.translate(0, 0, fz + 0.0016), t('show-shine'));
    };
    for (const [xb, wb] of [[-0.215, 0.022], [-0.185, 0.008], [0.07, 0.03], [0.108, 0.01], [0.235, 0.014]]) panes.push(streak(xb, wb, 0.05));
    // The canopy over the entrance on two slim columns, with downlights; planters by the door,
    // a step and a mat.
    // The canopy: a dark frame with a glass top (the doors stay in sight from above).
    const cw = 0.22;
    const cd = 0.058;
    const ccx = door - 0.002;
    const cz0 = z1 - 0.006;
    shell.push(tint(blk(cw, 0.012, 0.009, ccx, story, z1 + cd - 0.012, 0.004, 0.002), t('show-canopy')));
    for (const s of [-1, 1]) shell.push(tint(box(0.012, 0.009, cd - 0.012, ccx + s * (cw / 2 - 0.006), story + 0.0055, cz0 + (cd - 0.012) / 2), t('show-canopy')));
    shell.push(tint(box(cw - 0.024, 0.006, 0.008, ccx, story + 0.004, cz0 + 0.004), t('show-canopy')));
    panes.push(tint(box(cw - 0.024, 0.002, cd - 0.02, ccx, story + 0.006, cz0 + 0.008 + (cd - 0.02) / 2), t('glass')));
    for (const s of [-1, 1]) sheen.push(tint(new THREE.CylinderGeometry(0.0032, 0.0032, story, 8).translate(ccx + s * (cw / 2 - 0.012), story / 2, z1 + cd - 0.012), frame));
    for (const s of [-1, 1]) glow.push(tint(box(0.03, 0.001, 0.004, ccx + s * 0.06, story - 0.0004, z1 + cd - 0.012), t('interior')));
    shell.push(tint(blk(0.1, 0.03, 0.003, door, 0, z1 + 0.012, 0.004, 0.001), t('show-plinth')));
    shell.push(tint(box(0.064, 0.0012, 0.018, door, 0.0045, z1 + 0.013), t('doormat')));
    for (const s of [-1, 1]) {
      shell.push(tint(new THREE.CylinderGeometry(0.011, 0.009, 0.018, 10).translate(door + s * 0.064, 0.009, z1 + 0.018), t('wall-2')));
      shell.push(tint(new THREE.IcosahedronGeometry(0.014, 1).scale(1, 1.25, 1).translate(door + s * 0.064, 0.03, z1 + 0.018), t('hedge')));
    }
    // The workshop wing: a lower box with a blue band, a roller door with ribs and a small window.
    const sw = SHOP.x1 - SHOP.x0;
    const sd = SHOP.z1 - SHOP.z0;
    const scx = (SHOP.x0 + SHOP.x1) / 2;
    const scz = (SHOP.z0 + SHOP.z1) / 2;
    const sz1 = SHOP.z1;
    shell.push(tint(blk(sw, sd, SHOP.h, scx, 0, scz, 0.008, 0.003), t('shop-wall')));
    shell.push(tint(blk(sw + 0.008, sd + 0.008, 0.007, scx, SHOP.h, scz, 0.006, 0.002), t('roof')));
    shell.push(tint(blk(0.04, 0.03, 0.014, scx + 0.04, SHOP.h + 0.008, scz - 0.02, 0.003, 0.0015), t('roof-unit')));
    shell.push(tint(blk(sw + 0.002, 0.008, 0.02, scx, SHOP.h - 0.019, sz1 + 0.002, 0.002, 0.001), t('shop-band')));
    const dw = 0.108;
    const dh = 0.082;
    const dx = scx + 0.022;
    shell.push(tint(box(dw + 0.014, dh + 0.007, 0.004, dx, (dh + 0.007) / 2, sz1 + 0.0025), t('wall-2')));
    shell.push(tint(box(dw, dh, 0.004, dx, dh / 2, sz1 + 0.0045), t('shop-door')));
    for (let i = 1; i <= 7; i++) shell.push(tint(box(dw - 0.002, 0.0024, 0.002, dx, (i * dh) / 8, sz1 + 0.0068), t('shop-rib')));
    shell.push(tint(box(dw + 0.016, 0.011, 0.012, dx, dh + 0.012, sz1 + 0.006), t('wall-2')));
    glow.push(tint(box(0.03, 0.003, 0.008, dx, dh + 0.0185, sz1 + 0.008), t('lamp')));
    sheen.push(tint(box(0.036, 0.04, 0.003, SHOP.x0 + 0.034, 0.062, sz1 + 0.0035), frame));
    panes.push(tint(box(0.03, 0.034, 0.002, SHOP.x0 + 0.034, 0.062, sz1 + 0.0055), t('glass')));
    // The pylon sign: a tall slab with a lit top and a face on both sides.
    const P = PYLON;
    shell.push(tint(blk(P.w + 0.02, P.d + 0.016, 0.008, P.x, 0, P.z, 0.004, 0.0015), t('wall-2')));
    shell.push(tint(blk(P.w, P.d, P.h, P.x, 0, P.z, 0.006, 0.002), t('pylon')));
    glow.push(tint(box(P.w - 0.01, 0.005, P.d + 0.003, P.x, P.h - 0.006, P.z), t('fascia')));
    // The signs share one texture: the fascia's (left part) and the pylon's (right part).
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d');
    this.drawShowSigns(ctx);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const part = (geo, px, py, pw, ph) => {
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (px + uv.getX(i) * pw) / 512, 1 - (py + (1 - uv.getY(i)) * ph) / 512);
      return geo;
    };
    const fw = 0.368;
    signs.push(part(new THREE.PlaneGeometry(fw, fw / 8), 0, 0, 512, 64).translate(cx, 0.192, z1 + 0.0168));
    const pw = P.w - 0.008;
    const ph = pw * (448 / 128);
    for (const s of [1, -1]) {
      const face = part(new THREE.PlaneGeometry(pw, ph), 0, 64, 128, 448);
      if (s < 0) face.rotateY(Math.PI);
      signs.push(face.translate(P.x, P.h - 0.016 - ph / 2, P.z + s * (P.d / 2 + 0.0012)));
    }
    this.signTexShow = tex;
    const sign = new THREE.Mesh(merged(signs), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    // Meshes: walls (casting shadows), polished parts, glass (drawn after the cars inside).
    const walls = new THREE.Mesh(merged(shell), this.matte);
    walls.castShadow = this.tier !== 'low';
    walls.receiveShadow = true;
    const shiny = new THREE.Mesh(merged(sheen), this.sheenMat);
    shiny.receiveShadow = true;
    const glass = new THREE.Mesh(merged(panes), this.showGlassMat);
    glass.renderOrder = 2;
    this.showroom = new THREE.Group();
    this.showroom.add(walls, shiny, glass, sign);
    this.root.add(this.showroom);
    this.signMesh = sign;
    // A lit interior: a warm light inside (no shadows) on capable devices, glowing parts everywhere.
    if (this.tier !== 'low') {
      const lamp = new THREE.PointLight(hex('xr-cars-interior'), 0.08, 0.6, 2);
      lamp.position.set(cx, 0.13, cz + 0.02);
      this.showroom.add(lamp);
    }
    // Three cars on show, merged into one mesh per material (four draw calls for all three).
    this.buildShowCars([
      ['electric', -0.168, 0.01, cz - 0.004, -Math.PI + 0.55],
      ['cabrio', 0.02, 0.016, cz - 0.006, -0.28],
      ['suv', 0.198, 0.01, cz - 0.004, -0.55],
    ]);
    this.glowParts = glow;
  }

  /** The showroom's signs: the fascia (512 x 64 at the top) and the pylon's face (128 x 448 below). */
  drawShowSigns(ctx) {
    const name = this.opts.name ?? 'Autohof';
    const bg = color('xr-cars-sign');
    const ink = color('xr-cars-sign-ink');
    const band = color('xr-cars-fascia');
    const rr = (x, y, w, hh, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, hh, r); ctx.fill(); };
    const fit = (text, weight, px, max) => { let s = px; ctx.font = font(weight, s); while (ctx.measureText(text).width > max && s > 10) { s -= 1; ctx.font = font(weight, s); } };
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // The fascia: a light box with the name between two cars.
    ctx.fillStyle = bg;
    rr(0, 0, 512, 64, 12);
    drawSegIcon(ctx, 'small', 18, 13, 70, ink, bg);
    drawSegIcon(ctx, 'cabrio', 424, 13, 70, ink, bg);
    ctx.fillStyle = ink;
    fit(name, 'black', 44, 300);
    ctx.fillText(name, 256, 35);
    // The pylon: a lit head with a car and the name, below it three kinds of cars on tiles.
    ctx.fillStyle = color('xr-cars-pylon');
    ctx.fillRect(0, 64, 128, 448);
    ctx.fillStyle = band;
    rr(4, 68, 120, 150, 12);
    drawSegIcon(ctx, 'small', 14, 84, 100, bg, band);
    ctx.fillStyle = bg;
    fit(name, 'black', 30, 112);
    ctx.fillText(name, 64, 180);
    ['suv', 'estate', 'electric'].forEach((seg, i) => {
      const y = 230 + i * 94;
      ctx.fillStyle = bg;
      rr(10, y, 108, 84, 10);
      drawSegIcon(ctx, seg, 16, y + 14, 96, ink, bg);
    });
  }

  /** Cars on show inside: [segment, x, y, z, turn], merged per material. */
  buildShowCars(list) {
    const parts = { paint: [], glass: [], trim: [], lights: [] };
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const s = 0.8;
    for (const [seg, x, y, z, turn] of list) {
      const geo = buildCarGeo(seg, this.tok, this.tier);
      m.compose(new THREE.Vector3(x, y, z), q.setFromAxisAngle(up, turn), new THREE.Vector3(s, s, s));
      parts.paint.push(tint(geo.paint.clone().applyMatrix4(m), this.segColor[seg].getHex()));
      if (geo.glass) parts.glass.push(geo.glass.clone().applyMatrix4(m));
      parts.trim.push(geo.trim.clone().applyMatrix4(m));
      parts.lights.push(geo.lights.clone().applyMatrix4(m));
    }
    this.showPaint = this.paintBase.clone();
    this.showPaint.vertexColors = true;
    this.showPaint.color.set(0xffffff);
    this.showPaint.roughness = 0.16;
    if ('clearcoat' in this.showPaint) this.showPaint.clearcoat = 1;
    this.showCars = [
      new THREE.Mesh(merged(parts.paint), this.showPaint),
      new THREE.Mesh(merged(parts.trim), this.trimMat),
      new THREE.Mesh(merged(parts.lights), this.lightMat),
      new THREE.Mesh(merged(parts.glass), this.glassMat),
    ];
    this.showroom.add(...this.showCars);
  }

  buildStreetFurniture() {
    const t = (n) => hex(`xr-cars-${n}`);
    const g = [];
    const glow = this.glowParts;
    // Lamps at the corners of the lot and along the pavement.
    this.lampPos = [[-0.56, -0.02], [0.44, -0.2], [-0.56, 0.285], [0.585, 0.285], [0.02, 0.285]];
    for (const [x, z] of this.lampPos) {
      g.push(tint(new THREE.CylinderGeometry(0.004, 0.005, 0.2, 6).translate(x, 0.1, z), t('pole')));
      g.push(tint(box(0.04, 0.006, 0.014, x + 0.014, 0.2, z), t('pole')));
      glow.push(tint(box(0.026, 0.003, 0.01, x + 0.02, 0.1955, z), t('lamp')));
    }
    // Plants in tubs, a bench, a litter bin.
    this.treePos = [[-0.56, -0.36, 1.1], [0.59, -0.39, 1.15], [0.6, -0.12, 0.9], [-0.61, 0.2, 0.8]];
    for (const [x, z, s] of this.treePos) {
      g.push(tint(new THREE.CylinderGeometry(0.006 * s, 0.008 * s, 0.07 * s, 6).translate(x, 0.035 * s, z), t('trunk')));
      g.push(tint(new THREE.IcosahedronGeometry(0.045 * s, 1).scale(1, 1.15, 1).translate(x, 0.1 * s, z), t('tree')));
      g.push(tint(new THREE.IcosahedronGeometry(0.03 * s, 1).translate(x + 0.025 * s, 0.075 * s, z + 0.02 * s), t('tree-2')));
    }
    for (const x of [-0.42, 0.2]) {
      g.push(tint(new THREE.CylinderGeometry(0.02, 0.016, 0.022, 10).translate(x, 0.011, 0.275), t('wall-2')));
      g.push(tint(new THREE.IcosahedronGeometry(0.022, 1).translate(x, 0.034, 0.275), t('hedge')));
    }
    g.push(tint(box(0.07, 0.006, 0.02, -0.2, 0.02, 0.278), t('trunk')));
    for (const s of [-1, 1]) g.push(tint(box(0.006, 0.02, 0.018, -0.2 + s * 0.028, 0.01, 0.278), t('pole')));
    // The gate posts of the driveway.
    for (const s of [-1, 1]) g.push(tint(box(0.012, 0.05, 0.012, DRIVE_X + s * 0.07, 0.025, 0.292), t('wall-2')));
    const mesh = new THREE.Mesh(merged(g), this.matte);
    mesh.castShadow = this.tier !== 'low';
    mesh.receiveShadow = true;
    this.root.add(mesh);
    const lit = new THREE.Mesh(merged(glow), this.glowMat);
    this.root.add(lit);
  }

  buildFlags() {
    const t = (n) => hex(`xr-cars-${n}`);
    // Three flag poles beside the showroom; the flags wave (not with calm motion).
    const poles = [];
    this.flags = [];
    const geo = [];
    const cols = [t('flag-1'), t('flag-2'), t('flag-3')];
    for (let i = 0; i < 3; i++) {
      const x = -0.5 + i * 0.045;
      const z = -0.4 + i * 0.012;
      const h = 0.27 - i * 0.02;
      poles.push(tint(new THREE.CylinderGeometry(0.0028, 0.0034, h, 6).translate(x, h / 2, z), t('pole')));
      const f = new THREE.PlaneGeometry(0.03, 0.085, 2, 6).translate(0.018, h - 0.047, 0);
      const tf = tint(f, cols[i]);
      tf.translate(x, 0, z);
      this.flags.push({ x, start: geo.reduce((s, q) => s + q.attributes.position.count, 0), count: tf.attributes.position.count, phase: i * 1.7 });
      geo.push(tf);
    }
    const flagGeo = merged(geo);
    this.flagBase = flagGeo.attributes.position.array.slice();
    const flagMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
    this.flagMesh = new THREE.Mesh(flagGeo, flagMat);
    this.root.add(this.flagMesh);
    // Bunting from the showroom's fascia to the front lamps: little pennants in turn colors.
    const bunt = [];
    const bc = [t('bunting-1'), t('bunting-2'), t('bunting-3'), t('bunting-4')];
    const top = [0.152, SHOW.z1 + 0.016];
    const runs = [[[SHOW.x0 + 0.01, ...top], [-0.56, 0.2, 0.285]], [[SHOW.x1 - 0.01, ...top], [0.585, 0.2, 0.285]], [[-0.56, 0.2, 0.285], [0.02, 0.2, 0.285]], [[0.02, 0.2, 0.285], [0.585, 0.2, 0.285]]];
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const p = new THREE.Vector3();
    const q = new THREE.Vector3();
    let n = 0;
    for (const [s, e] of runs) {
      a.fromArray(s);
      b.fromArray(e);
      const count = Math.round(a.distanceTo(b) / 0.03);
      const dir = b.clone().sub(a).normalize();
      const at = (k, out) => out.copy(a).lerp(b, k).setY(lerp(a.y, b.y, k) - Math.sin(k * Math.PI) * 0.035);
      for (let i = 0; i < count; i++) {
        at((i + 0.15) / count, p);
        at((i + 0.85) / count, q);
        const tri = new THREE.BufferGeometry();
        const mid = p.clone().lerp(q, 0.5);
        tri.setAttribute('position', new THREE.Float32BufferAttribute([p.x, p.y, p.z, q.x, q.y, q.z, mid.x, mid.y - 0.022, mid.z], 3));
        tri.computeVertexNormals();
        bunt.push(tint(tri, bc[n++ % 4]));
      }
      // the cord
      const cord = new THREE.CylinderGeometry(0.0007, 0.0007, a.distanceTo(b), 3).rotateZ(Math.PI / 2);
      cord.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir)).translate((a.x + b.x) / 2, (a.y + b.y) / 2 - 0.022, (a.z + b.z) / 2);
      poles.push(tint(cord, t('pole')));
    }
    const buntMesh = new THREE.Mesh(merged(bunt), flagMat);
    this.root.add(buntMesh);
    const poleMesh = new THREE.Mesh(merged(poles), this.matte);
    poleMesh.castShadow = this.tier !== 'low';
    this.root.add(poleMesh);
  }

  buildBays() {
    // Bays that are not open yet: a striped barrier and two cones.
    const t = (n) => hex(`xr-cars-${n}`);
    this.barriers = [];
    for (let i = 0; i < 8; i++) {
      const { x, z } = bayPos(i);
      const g = [];
      g.push(tint(box(0.11, 0.012, 0.006, 0, 0.03, 0), t('barrier')));
      for (const s of [-1, 0, 1]) g.push(tint(box(0.016, 0.0125, 0.0065, s * 0.036, 0.03, 0), t('cone')));
      for (const s of [-1, 1]) {
        g.push(tint(box(0.005, 0.03, 0.005, s * 0.05, 0.015, 0), t('pole')));
        g.push(tint(new THREE.ConeGeometry(0.009, 0.026, 8).translate(s * 0.03, 0.013, 0.05), t('cone')));
      }
      const m = new THREE.Mesh(merged(g), this.matte);
      m.position.set(x, 0, z);
      m.rotation.y = HEAD + Math.PI / 2;
      m.castShadow = this.tier !== 'low';
      m.visible = false;
      this.root.add(m);
      this.barriers.push(m);
    }
    this.openBays = 8;
  }

  /** How many bays are open (the others show a barrier); a newly opened one pops. */
  setBays(n, animate = true) {
    if (n === this.openBays) return;
    this.barriers.forEach((m, i) => {
      const closed = i >= n;
      if (m.visible && !closed && animate && !this.calm) {
        this.anim(0.45, (k) => { m.scale.setScalar(1 - easeInOut(k)); m.position.y = Math.sin(k * Math.PI) * 0.03; }, () => { m.visible = false; m.scale.setScalar(1); m.position.y = 0; });
      } else m.visible = closed;
    });
    this.openBays = n;
  }

  // ---------- price signs (one shared texture) ----------

  buildSigns() {
    const c = document.createElement('canvas');
    c.width = 1024;
    c.height = 512;
    this.signCanvas = c;
    this.signCtx = c.getContext('2d');
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    this.signTex = tex;
    const mat = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, transparent: true, side: THREE.DoubleSide });
    this.signs = [];
    const post = [];
    for (let i = 0; i < 8; i++) {
      const { x, z } = bayPos(i);
      const geo = new THREE.PlaneGeometry(0.094, 0.0588);
      const u0 = (i % 4) / 4;
      const v1 = 1 - Math.floor(i / 4) / 2;
      const uv = geo.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * 0.25, v1 - (1 - uv.getY(k)) * (160 / 512));
      const m = new THREE.Mesh(geo, mat);
      const holder = new THREE.Group();
      holder.position.set(x - 0.088, 0.062, z + 0.092);
      holder.add(m);
      m.visible = false;
      m.renderOrder = 3;
      this.root.add(holder);
      post.push(tint(new THREE.CylinderGeometry(0.0022, 0.0022, 0.04, 5).translate(x - 0.088, 0.02, z + 0.09), hex('xr-cars-pole')));
      this.signs.push({ holder, m, key: '', bay: i });
    }
    const posts = new THREE.Mesh(merged(post), this.matte);
    this.root.add(posts);
    this.setFace(this.face);
  }

  /** How far signs, bubbles and popups lean back so that they face the viewer. */
  setFace(angle) {
    this.face = angle;
    for (const s of this.signs) s.holder.rotation.x = angle;
  }

  drawSign(i, car) {
    const ctx = this.signCtx;
    const x = (i % 4) * 256;
    const y = Math.floor(i / 4) * 256;
    ctx.clearRect(x, y, 256, 256);
    if (!car) return;
    const tx = this.opts.signText?.(car) ?? { price: '', tag: null, sub: '' };
    const r = 22;
    ctx.fillStyle = color('xr-cars-sign-bg');
    ctx.strokeStyle = color('xr-cars-sign-edge');
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(x + 4, y + 4, 248, 152, r);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color('xr-cars-sign-text');
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    let px = 58;
    ctx.font = font('black', px);
    while (ctx.measureText(tx.price).width > 228 && px > 30) { px -= 2; ctx.font = font('black', px); }
    ctx.fillText(tx.price, x + 128, y + 52);
    if (tx.tag) {
      // A car that stands long: a clear strip with a clock.
      ctx.fillStyle = color('xr-cars-sign-tag');
      ctx.beginPath();
      ctx.roundRect(x + 14, y + 92, 228, 54, 14);
      ctx.fill();
      ctx.strokeStyle = color('xr-cars-sign-tag-text');
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(x + 44, y + 119, 15, 0, TAU);
      ctx.moveTo(x + 44, y + 109);
      ctx.lineTo(x + 44, y + 119);
      ctx.lineTo(x + 52, y + 124);
      ctx.stroke();
      ctx.fillStyle = color('xr-cars-sign-tag-text');
      let p2 = 34;
      ctx.font = font('bold', p2);
      while (ctx.measureText(tx.tag).width > 164 && p2 > 20) { p2 -= 2; ctx.font = font('bold', p2); }
      ctx.textAlign = 'left';
      ctx.fillText(tx.tag, x + 68, y + 121);
    } else {
      drawSegIcon(ctx, car.seg, x + 22, y + 96, 84, color(`xr-cars-seg-${car.seg}`), color('xr-cars-sign-bg'));
      ctx.fillStyle = color('xr-cars-sign-muted');
      let p2 = 30;
      ctx.font = font('bold', p2);
      while (ctx.measureText(tx.sub).width > 128 && p2 > 18) { p2 -= 2; ctx.font = font('bold', p2); }
      ctx.textAlign = 'left';
      ctx.fillText(tx.sub, x + 114, y + 121);
    }
  }

  /** Redraws the signs whose content changed; a changed price flips its sign. */
  refreshSigns(force = false) {
    let dirty = false;
    for (const s of this.signs) {
      const view = [...this.cars.values()].find((v) => v.car.bay === s.bay && !v.leaving && v.parked);
      const tx = view ? this.opts.signText?.(view.car) : null;
      const key = view ? `${view.car.id}|${tx?.price}|${tx?.tag}|${tx?.sub}` : '';
      if (key === s.key && !force) continue;
      const had = !!s.key;
      s.key = key;
      dirty = true;
      const draw = () => { this.drawSign(s.bay, view?.car ?? null); this.signTex.needsUpdate = true; s.m.visible = !!view; };
      if (this.calm || force || !(had || view)) { draw(); s.m.scale.set(1, 1, 1); continue; }
      // The flip: the sign turns its edge to the viewer, changes, and turns back.
      s.m.visible = had || !!view;
      let drawn = false;
      this.anim(0.34, (k) => {
        if (k >= 0.5 && !drawn) { drawn = true; draw(); }
        s.m.scale.x = Math.max(0.02, Math.abs(Math.cos(k * Math.PI)));
      }, () => { if (!drawn) draw(); s.m.scale.x = 1; });
    }
    return dirty;
  }

  // ---------- the cars on the lot ----------

  /** Brings the lot in line with the game: missing cars appear at once, sold ones go. */
  sync(game, { instant = true } = {}) {
    const ids = new Set(game.lot.map((c) => c.id));
    for (const [id, v] of [...this.cars]) if (!ids.has(id) && !v.leaving) this.removeCar(id);
    for (const car of game.lot) {
      const v = this.cars.get(car.id);
      if (!v) this.addCar(car, { roll: !instant });
      else { v.car = car; this.stylePaint(v.paint.material, car.weeks); }
    }
    this.setBays(game.bays, !instant);
    this.refreshSigns();
  }

  addCar(car, { roll = false, from = 0 } = {}) {
    if (this.cars.has(car.id)) return this.cars.get(car.id);
    const v = this.makeCar(car);
    v.car = car;
    v.parked = !roll;
    const { x, z } = bayPos(car.bay);
    v.home = new THREE.Vector3(x, 0, z);
    this.root.add(v.g);
    this.cars.set(car.id, v);
    if (!roll) {
      v.g.position.copy(v.home);
      v.g.rotation.y = HEAD;
    } else if (this.calm) {
      // Calm motion: the car appears in its bay.
      v.g.position.copy(v.home);
      v.g.rotation.y = HEAD;
      v.g.scale.setScalar(0.01);
      this.anim(0.5, (k) => v.g.scale.setScalar(Math.max(0.01, easeOut(k))), () => { v.parked = true; this.refreshSigns(); });
    } else {
      // Off the transporter, along the street, through the driveway, down the aisle, into the bay.
      const tx = this.trucks[from]?.g.position.x ?? -0.3;
      const row = Math.floor(car.bay / 4);
      const pts = [[tx + 0.02, PARK_Z], [tx + 0.2, LANE_Z], [DRIVE_X - 0.02, LANE_Z], [DRIVE_X, WALK_Z - 0.06], [DRIVE_X - 0.05, AISLE_Z], [x + (row ? 0.07 : 0.1), AISLE_Z], [x, z]];
      v.g.position.set(pts[0][0], 0.02, pts[0][1]);
      v.g.rotation.y = 0;
      this.drive(v, pts, 1.55, { endHeading: HEAD, lift: 0.02 }, () => {
        v.parked = true;
        this.settle(v);
        this.refreshSigns();
      });
    }
    return v;
  }

  removeCar(id) {
    const v = this.cars.get(id);
    if (!v) return;
    this.cars.delete(id);
    v.g.removeFromParent();
    v.paint.material.dispose();
    v.blob?.material.dispose();
    v.blob?.geometry.dispose();
    v.box?.geometry.dispose();
  }

  /** Moves a car along way points (x, z) with eased speed; its nose follows the way. */
  drive(v, pts, dur, { endHeading = null, lift = 0, startK = 0 } = {}, done) {
    const P = pts.map(([x, z]) => new THREE.Vector2(x, z));
    const len = [0];
    for (let i = 1; i < P.length; i++) len.push(len[i - 1] + P[i].distanceTo(P[i - 1]));
    const total = len[len.length - 1];
    const startHeading = v.g.rotation.y;
    let heading = startHeading;
    this.anim(dur, (k) => {
      const e = easeInOut(clamp(startK + k * (1 - startK), 0, 1));
      const d = e * total;
      let i = 1;
      while (i < P.length - 1 && len[i] < d) i++;
      const f = (d - len[i - 1]) / Math.max(1e-6, len[i] - len[i - 1]);
      const x = lerp(P[i - 1].x, P[i].x, f);
      const z = lerp(P[i - 1].y, P[i].y, f);
      let want = Math.atan2(-(P[i].y - P[i - 1].y), P[i].x - P[i - 1].x);
      if (endHeading !== null && i === P.length - 1) want = lerpAngle(want, endHeading, clamp(f * 1.4, 0, 1));
      heading = lerpAngle(heading, want, 0.22);
      v.g.position.set(x, lift * Math.max(0, 1 - e * 6), z);
      v.g.rotation.y = heading;
      // The body leans back when it speeds up and nods when it brakes.
      v.body.rotation.z = Math.sin(e * Math.PI * 2) * -0.035;
    }, () => {
      if (endHeading !== null) v.g.rotation.y = endHeading;
      v.body.rotation.z = 0;
      done?.();
    }, (k) => k);
  }

  /** The car comes to rest on its springs. */
  settle(v) {
    if (this.calm) return;
    this.anim(0.6, (k) => {
      const w = Math.exp(-k * 5) * Math.cos(k * 16);
      v.body.rotation.z = w * 0.05;
      v.body.position.y = -Math.abs(w) * 0.0025;
    }, () => { v.body.rotation.z = 0; v.body.position.y = 0; }, (k) => k);
  }

  /** A little hop of joy (a sale). */
  hop(v) {
    if (this.calm) return;
    this.anim(0.4, (k) => { v.body.position.y = Math.sin(k * Math.PI) * 0.012; v.body.rotation.z = Math.sin(k * TAU) * 0.04; }, () => { v.body.position.y = 0; v.body.rotation.z = 0; }, (k) => k);
  }

  /** A sold car leaves: into the aisle and out of the driveway (front row: straight to the street). */
  sellCar(id, done) {
    const v = this.cars.get(id);
    if (!v || v.leaving) { done?.(); return; }
    v.leaving = true;
    if (v.box) v.box.userData.interactive = false;
    this.refreshSigns();
    const finish = () => { this.removeCar(id); done?.(); };
    if (this.calm) {
      this.anim(0.5, (k) => v.g.scale.setScalar(Math.max(0.01, 1 - easeInOut(k))), finish);
      return;
    }
    const { x, z } = v.home;
    const row = Math.floor(v.car.bay / 4);
    const pts = row === 0
      ? [[x, z], [x + 0.07, AISLE_Z], [DRIVE_X - 0.05, AISLE_Z], [DRIVE_X, WALK_Z - 0.05], [DRIVE_X + 0.05, LANE_Z], [EDGE + 0.12, LANE_Z]]
      : [[x, z], [x + 0.06, WALK_Z - 0.03], [x + 0.14, LANE_Z], [EDGE + 0.12, LANE_Z]];
    this.drive(v, pts, 1.5, {}, finish);
    // Past the edge of the plate the car shrinks away.
    this.anim(0.3, (k) => v.g.scale.setScalar(Math.max(0.01, 1 - k)), null, undefined, 1.22);
  }

  /** Marks a car (hover, selection): it lifts a little. */
  highlight(id) {
    for (const [cid, v] of this.cars) {
      const on = cid === id;
      if (v.hot === on) continue;
      v.hot = on;
      if (v.parked && !v.leaving) v.g.position.y = on ? 0.008 : 0;
    }
  }

  // ---------- transporters ----------

  buildTruck(i) {
    const t = (n) => hex(`xr-cars-${n}`);
    const paint = [];
    const trim = [];
    paint.push(extrude([[6.5, 1.6], [6.5, 7.6], [9.6, 7.6], [11.6, 5.2], [12.0, 1.6]], 7.6, { round: 0.7, bevel: 0.5, steps: 2 }));
    trim.push(tint(box(19, 0.8, 7.4, 0, 2.2, 0), t('truck-bed')));
    trim.push(tint(box(19.5, 0.3, 0.5, -0.2, 2.9, 3.6), t('car-rim')));
    trim.push(tint(box(19.5, 0.3, 0.5, -0.2, 2.9, -3.6), t('car-rim')));
    trim.push(tint(box(5.5, 0.4, 7.0, -11.6, 1.2, 0).rotateZ(0.0), t('truck-bed')));
    trim.push(tint(box(2.2, 2.6, 6.4, 9.2, 5.6, 0), t('car-glass')));
    for (const wx of [-6.5, -3.2, 8.6]) {
      for (const s of [-1, 1]) {
        trim.push(tint(new THREE.CylinderGeometry(1.5, 1.5, 1.4, 12).rotateX(Math.PI / 2).translate(wx, 1.5, s * 3.2), t('car-tire')));
        trim.push(tint(new THREE.CylinderGeometry(0.8, 0.8, 1.5, 10).rotateX(Math.PI / 2).translate(wx, 1.5, s * 3.25), t('car-rim')));
      }
    }
    const strip = (g) => { const o = g.index ? g.toNonIndexed() : g; for (const n of Object.keys(o.attributes)) if (n !== 'position' && n !== 'normal') o.deleteAttribute(n); return o; };
    const g = new THREE.Group();
    const pm = new THREE.MeshStandardMaterial({ color: t(i ? 'truck-cab-2' : 'truck-cab'), roughness: 0.35, metalness: 0.3 });
    const a = new THREE.Mesh(merged(paint.map(strip)).scale(CM, CM, CM), pm);
    const b = new THREE.Mesh(merged(trim).scale(CM, CM, CM), this.trimMat);
    a.castShadow = b.castShadow = this.tier !== 'low';
    const blob = contactShadow(1, 0.5);
    blob.scale.set(0.14, 0.07, 1);
    blob.position.y = 0.0012;
    g.add(a, b, blob);
    g.rotation.y = Math.PI; // the cab points left: the cars roll off towards the driveway
    g.visible = false;
    this.root.add(g);
    return { g, x: i ? -0.5 : -0.24, on: false };
  }

  /** n transporters wait on the street while cars are bought (0: they drive off). */
  showTrucks(n) {
    this.trucks.forEach((tr, i) => {
      const on = i < n;
      if (on === tr.on) return;
      tr.on = on;
      const from = on ? EDGE + 0.2 : tr.x;
      const to = on ? tr.x : -EDGE - 0.25;
      tr.g.visible = true;
      tr.g.position.set(from, 0, PARK_Z);
      if (this.calm) {
        tr.g.position.x = tr.x;
        this.anim(0.4, (k) => tr.g.scale.setScalar(Math.max(0.01, on ? k : 1 - k)), () => { tr.g.visible = on; });
        return;
      }
      tr.g.scale.setScalar(1);
      this.anim(on ? 1.1 : 0.9, (k) => { tr.g.position.x = lerp(from, to, on ? easeOut(k) : k * k); }, () => { tr.g.visible = on; }, (k) => k, i * 0.25);
    });
  }

  // ---------- people (two instanced meshes) ----------

  buildPeople() {
    const body = new THREE.CapsuleGeometry(1.0, 2.3, 3, 10).translate(0, 2.35, 0);
    // A little wider at the bottom, like a coat.
    const pos = body.attributes.position;
    for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); const k = 1 + clamp((2.4 - y) / 2.4, 0, 1) * 0.22; pos.setX(i, pos.getX(i) * k); pos.setZ(i, pos.getZ(i) * k); }
    body.scale(CM, CM, CM);
    // The head's own colors multiply with the figure's skin tone: plain skin, darker hair.
    const head = tint(new THREE.SphereGeometry(0.92, 12, 9), hex('xr-cars-skin-mask'));
    const hair = tint(new THREE.SphereGeometry(0.99, 12, 6, 0, TAU, 0, Math.PI * 0.46).rotateX(-0.45), hex('xr-cars-hair-mask'));
    const nose = tint(new THREE.SphereGeometry(0.2, 6, 4).translate(0, -0.1, 0.92), hex('xr-cars-skin-mask'));
    const headGeo = merged([head, hair, nose]).scale(CM, CM, CM);
    this.bodyMesh = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ roughness: 0.8 }), PEOPLE);
    this.headMesh = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ roughness: 0.7, vertexColors: true }), PEOPLE);
    for (const m of [this.bodyMesh, this.headMesh]) {
      m.count = 0;
      m.castShadow = this.tier !== 'low';
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.root.add(m);
    }
    this.cloth = [1, 2, 3, 4, 5, 6].map((i) => new THREE.Color(hex(`xr-cars-cloth-${i}`)));
    this.skin = [1, 2, 3].map((i) => new THREE.Color(hex(`xr-cars-skin-${i}`)));
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this.bubbleGeo = new THREE.PlaneGeometry(0.046, 0.036).translate(0, 0.018, 0);
  }

  /** A figure at (x, z). Returns its record; walk() and the gestures act on it. */
  person(x, z, seed = Math.random()) {
    if (this.people.length >= PEOPLE) return null;
    const p = {
      x, z, y: 0, yaw: 0, scale: this.calm ? 0.01 : 1, nod: 0, shake: 0, bob: 0, lean: 0,
      cloth: this.cloth[Math.floor(seed * 997) % this.cloth.length], skin: this.skin[Math.floor(seed * 131) % this.skin.length],
      size: 0.92 + (seed * 7 % 1) * 0.2, bubble: null, gone: false,
    };
    this.people.push(p);
    if (this.calm) this.anim(0.3, (k) => { p.scale = Math.max(0.01, k); });
    return p;
  }

  leave(p) {
    if (!p || p.gone) return;
    p.gone = true;
    this.setBubble(p, null);
    const i = this.people.indexOf(p);
    if (i >= 0) this.people.splice(i, 1);
  }

  /** Walks along way points at walking pace; done() at the end. */
  walk(p, pts, done, speed = 0.62, maxDur = 99) {
    if (!p || p.gone) return;
    if (this.calm) {
      // Calm motion: the figure appears where it is going.
      const [x, z] = pts[pts.length - 1];
      this.anim(0.25, (k) => { p.scale = Math.max(0.01, 1 - k); }, () => { p.x = x; p.z = z; this.anim(0.25, (k) => { p.scale = Math.max(0.01, k); }, done); });
      return;
    }
    const P = [[p.x, p.z], ...pts];
    const len = [0];
    for (let i = 1; i < P.length; i++) len.push(len[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const total = len[len.length - 1];
    this.anim(Math.min(maxDur, Math.max(0.2, total / speed)), (k) => {
      if (p.gone) return;
      const d = k * total;
      let i = 1;
      while (i < P.length - 1 && len[i] < d) i++;
      const f = (d - len[i - 1]) / Math.max(1e-6, len[i] - len[i - 1]);
      p.x = lerp(P[i - 1][0], P[i][0], f);
      p.z = lerp(P[i - 1][1], P[i][1], f);
      p.yaw = lerpAngle(p.yaw, Math.atan2(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]), 0.3);
      p.bob = Math.abs(Math.sin(d * 95)) * 0.0035;
      p.lean = 0.12;
    }, () => { p.bob = 0; p.lean = 0; done?.(); }, (k) => k);
  }

  /** Turns to look at a point. */
  lookAt(p, x, z) { if (p && !p.gone) { const to = Math.atan2(x - p.x, z - p.z); this.anim(0.2, (k) => { p.yaw = lerpAngle(p.yaw, to, k); }); } }

  /** Gestures: 'nod' (yes), 'shake' (no), 'jump' (happy), 'look' (left and right). */
  gesture(p, kind, done) {
    if (!p || p.gone) { done?.(); return; }
    if (this.calm) { this.anim(0.35, () => {}, done); return; }
    const yaw = p.yaw;
    if (kind === 'nod') this.anim(0.5, (k) => { p.nod = Math.sin(k * TAU * 2) * 0.35; }, () => { p.nod = 0; done?.(); }, (k) => k);
    else if (kind === 'shake') this.anim(0.55, (k) => { p.shake = Math.sin(k * TAU * 2.5) * 0.6 * (1 - k * 0.4); }, () => { p.shake = 0; done?.(); }, (k) => k);
    else if (kind === 'jump') this.anim(0.5, (k) => { p.y = Math.abs(Math.sin(k * Math.PI * 2)) * 0.014; }, () => { p.y = 0; done?.(); }, (k) => k);
    else this.anim(0.6, (k) => { p.yaw = yaw + Math.sin(k * TAU) * 0.7; }, () => { p.yaw = yaw; done?.(); }, (k) => k);
  }

  /** The thought above a figure: the kind of car it wants, with a check or a cross once it knows. */
  setBubble(p, seg, mark = '') {
    if (!p) return;
    if (p.bubble) { p.bubble.removeFromParent(); p.bubble = null; }
    if (!seg) return;
    const key = `${seg}|${mark}`;
    if (!this.bubbleMats.has(key)) {
      const c = document.createElement('canvas');
      c.width = 184;
      c.height = 144;
      const ctx = c.getContext('2d');
      ctx.fillStyle = color('xr-cars-bubble');
      ctx.strokeStyle = color(mark === 'yes' ? 'xr-cars-gain' : mark === 'no' ? 'xr-cars-miss' : 'xr-cars-bubble-edge');
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.roundRect(6, 6, 172, 108, 30);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(78, 112);
      ctx.lineTo(92, 138);
      ctx.lineTo(108, 112);
      ctx.fillStyle = color('xr-cars-bubble');
      ctx.fill();
      drawSegIcon(ctx, seg, 24, mark ? 20 : 28, mark ? 96 : 136, color(`xr-cars-seg-ink-${seg}`), color('xr-cars-bubble'));
      if (mark) {
        ctx.lineWidth = 12;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = color(mark === 'yes' ? 'xr-cars-gain' : 'xr-cars-miss');
        ctx.beginPath();
        if (mark === 'yes') { ctx.moveTo(124, 62); ctx.lineTo(138, 78); ctx.lineTo(162, 46); } else { ctx.moveTo(126, 46); ctx.lineTo(160, 80); ctx.moveTo(160, 46); ctx.lineTo(126, 80); }
        ctx.stroke();
      }
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.bubbleMats.set(key, new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthTest: false }));
    }
    const m = new THREE.Mesh(this.bubbleGeo, this.bubbleMats.get(key));
    m.renderOrder = 6;
    m.userData.noFit = true;
    this.root.add(m);
    p.bubble = m;
    if (!this.calm) this.anim(0.25, (k) => m.scale.setScalar(backOut(k)), null, (k) => k);
  }

  updatePeople() {
    const { _m: m, _q: q, _e: e, _v: v, _s: s } = this;
    let n = 0;
    for (const p of this.people) {
      const k = p.scale * p.size;
      e.set(p.lean, p.yaw, 0, 'YXZ');
      q.setFromEuler(e);
      v.set(p.x, p.y + p.bob, p.z);
      s.set(k, k, k);
      m.compose(v, q, s);
      this.bodyMesh.setMatrixAt(n, m);
      this.bodyMesh.setColorAt(n, p.cloth);
      e.set(p.nod + p.lean * 0.5, p.yaw + p.shake, 0, 'YXZ');
      q.setFromEuler(e);
      v.set(p.x + Math.sin(p.yaw) * p.lean * 0.006, p.y + p.bob + 0.0555 * k, p.z + Math.cos(p.yaw) * p.lean * 0.006);
      m.compose(v, q, s);
      this.headMesh.setMatrixAt(n, m);
      this.headMesh.setColorAt(n, p.skin);
      if (p.bubble) { p.bubble.position.set(p.x, p.y + 0.078 * k, p.z); p.bubble.rotation.x = this.face; }
      n++;
    }
    for (const mesh of [this.bodyMesh, this.headMesh]) {
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  // ---------- visitors ----------

  /** Where a visitor stands to look at a car. */
  spotAt(view) {
    const row = Math.floor(view.car.bay / 4);
    return row ? [view.home.x + 0.07, view.home.z + 0.1] : [view.home.x + 0.085, view.home.z + 0.085];
  }

  /**
   * A visitor of the running week: comes along the pavement, looks for the kind of car in the
   * thought bubble, and buys (the car drives off), finds it too dear, or finds none.
   * outcome: 'buy' | 'dear' | 'none'. onResolve() at the moment of the decision.
   */
  visit({ seg, carId, outcome, onResolve, side = 1 }) {
    const view = carId ? this.cars.get(carId) : null;
    // The back row and the aisle are reached through the driveway on the right.
    if (!view || Math.floor(view.car.bay / 4) === 0) side = 1;
    const p = this.person(side > 0 ? EDGE + 0.05 : -EDGE - 0.05, WALK_Z + (Math.random() - 0.5) * 0.02);
    if (!p) { onResolve?.(null); if (outcome === 'buy') this.sellCar(carId); return null; }
    this.setBubble(p, seg);
    const spot = view ? this.spotAt(view) : [(Math.random() - 0.5) * 0.5, AISLE_Z + (Math.random() - 0.5) * 0.03];
    const row = view ? Math.floor(view.car.bay / 4) : 0;
    const inPts = !view || row === 0
      ? [[DRIVE_X + 0.02, WALK_Z], [DRIVE_X - 0.03, AISLE_Z + 0.02], spot]
      : [[spot[0] + side * 0.03, WALK_Z - 0.01], spot];
    const out = () => {
      const exit = Math.random() < 0.5 ? 1 : -1;
      const pts = view && row === 1 ? [[p.x, WALK_Z], [exit * (EDGE + 0.06), WALK_Z]] : [[DRIVE_X - 0.03, AISLE_Z + 0.02], [DRIVE_X + 0.02, WALK_Z], [exit * (EDGE + 0.06), WALK_Z + 0.01]];
      this.walk(p, pts, () => this.leave(p), 0.75);
    };
    this.walk(p, inPts, () => {
      if (p.gone) return;
      if (view) this.lookAt(p, view.home.x, view.home.z);
      this.gesture(p, view ? 'nod' : 'look', () => {
        if (p.gone) return;
        onResolve?.(p);
        if (outcome === 'buy' && view) {
          this.setBubble(p, seg, 'yes');
          this.hop(view);
          this.gesture(p, 'jump', () => {
            // Gets in and drives off.
            this.anim(0.2, (k) => { p.scale = Math.max(0.01, 1 - k); p.x = lerp(p.x, view.home.x, k); p.z = lerp(p.z, view.home.z, k); }, () => { this.leave(p); this.sellCar(carId); });
          });
        } else {
          this.setBubble(p, seg, 'no');
          this.gesture(p, 'shake', out);
        }
      });
    }, 0.78, 1.45);
    return p;
  }

  /** Removes every figure and stops their little plans (a skipped week, a new week). */
  clearPeople() {
    for (const p of [...this.people]) this.leave(p);
  }

  /** Life between the weeks: passers-by on the pavement, now and then one who looks at a car. */
  tickAmbient(dt) {
    const a = this.ambient;
    if (!a.on) return;
    a.walk -= dt;
    a.browse -= dt;
    if (a.walk <= 0) {
      a.walk = this.calm ? 6 : 2.2 + Math.random() * 2.4;
      const side = Math.random() < 0.5 ? 1 : -1;
      const z = WALK_Z + (Math.random() - 0.5) * 0.026;
      if (this.calm) {
        const p = this.person((Math.random() - 0.5) * 1.0, z);
        if (p) { p.yaw = side * 1.2; this.anim(0.3, (k) => { p.scale = Math.max(0.01, 1 - k); }, () => this.leave(p), undefined, 4); }
      } else {
        const p = this.person(side * (EDGE + 0.05), z);
        this.walk(p, [[-side * (EDGE + 0.06), z]], () => this.leave(p), 0.2 + Math.random() * 0.12);
      }
    }
    if (a.browse <= 0) {
      a.browse = 5 + Math.random() * 4;
      const views = [...this.cars.values()].filter((v) => v.parked && !v.leaving);
      if (!views.length) return;
      const view = views[Math.floor(Math.random() * views.length)];
      const spot = this.spotAt(view);
      const p = this.person(EDGE + 0.05, WALK_Z);
      if (!p) return;
      this.walk(p, [[DRIVE_X + 0.02, WALK_Z], [DRIVE_X - 0.03, AISLE_Z + 0.02], spot], () => {
        this.lookAt(p, view.home.x, view.home.z);
        this.gesture(p, 'nod', () => this.anim(0.9, () => {}, () => this.walk(p, [[DRIVE_X - 0.03, AISLE_Z + 0.02], [DRIVE_X + 0.02, WALK_Z], [-EDGE - 0.06, WALK_Z]], () => this.leave(p), 0.4)));
      }, 0.36);
    }
  }

  // ---------- popups ("+1.850 €", "kein Cabrio da") ----------

  buildPopups() {
    this.popups = [];
    for (let i = 0; i < POPUPS; i++) {
      const c = document.createElement('canvas');
      c.width = 384;
      c.height = 96;
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.04), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthTest: false }));
      m.visible = false;
      m.renderOrder = 8;
      m.userData.noFit = true;
      this.root.add(m);
      this.popups.push({ m, c, ctx: c.getContext('2d'), tex, busy: false });
    }
  }

  /** A tag that pops up and floats away: kind 'gain' (a sale) or 'miss' (a visitor leaves). */
  popup(text, x, z, kind = 'gain') {
    const p = this.popups.find((q) => !q.busy) ?? this.popups[0];
    p.busy = true;
    const { ctx, c } = p;
    ctx.clearRect(0, 0, c.width, c.height);
    let px = kind === 'gain' ? 58 : 40;
    ctx.font = font('black', px);
    while (ctx.measureText(text).width > c.width - 70 && px > 22) { px -= 2; ctx.font = font('black', px); }
    const w = Math.min(c.width - 8, ctx.measureText(text).width + 56);
    ctx.fillStyle = color(kind === 'gain' ? 'xr-cars-gain' : 'xr-cars-tag-bg');
    ctx.strokeStyle = color(kind === 'gain' ? 'xr-cars-gain-edge' : 'xr-cars-miss');
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect((c.width - w) / 2, 8, w, c.height - 16, 30);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color(kind === 'gain' ? 'xr-cars-gain-text' : 'xr-cars-tag-text');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, c.width / 2, c.height / 2 + 3);
    p.tex.needsUpdate = true;
    p.m.visible = true;
    p.m.material.opacity = 1;
    p.m.rotation.x = this.face;
    const y0 = 0.115;
    const rise = this.calm ? 0.01 : 0.05;
    const size = kind === 'gain' ? 1.15 : 1;
    this.anim(kind === 'gain' ? 1.5 : 1.7, (k) => {
      p.m.position.set(clamp(x, -0.5, 0.5), y0 + rise * easeOut(k), z);
      p.m.scale.setScalar(size * (this.calm ? 1 : k < 0.18 ? backOut(k / 0.18) : 1));
      p.m.material.opacity = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
    }, () => { p.m.visible = false; p.busy = false; }, (k) => k);
  }

  // ---------- weather and light per week ----------

  buildWeather() {
    const n = this.calm ? 40 : this.tier === 'low' ? 90 : 170;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 1.3; pos[i * 3 + 1] = Math.random() * 0.42; pos[i * 3 + 2] = (Math.random() - 0.5) * 0.98 + 0.02; }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.weatherMat = new THREE.PointsMaterial({ color: hex('xr-cars-snow'), size: 0.012, transparent: true, opacity: 0, depthWrite: false, sizeAttenuation: true });
    this.weather = new THREE.Points(geo, this.weatherMat);
    this.weather.frustumCulled = false;
    this.weather.visible = false;
    this.weather.userData.noFit = true;
    this.root.add(this.weather);
    this.weatherKind = null;
    this.snowColor = new THREE.Color(hex('xr-cars-snow'));
    this.rainColor = new THREE.Color(hex('xr-cars-rain'));
  }

  /**
   * The week's light and weather, from the signal the forecast names: 'calm', 'spring' (warm and
   * bright), 'snow' (cool, flakes), 'rain' (grey, drops), 'warm' (a golden late light).
   */
  setMood(key, weather = null) {
    const to = this.keyColors[key] ?? this.keyColors.calm;
    const from = this.key.color.clone();
    const i0 = this.key.intensity;
    const i1 = { calm: 1.55, spring: 1.85, snow: 1.25, rain: 0.9, warm: 1.7 }[key] ?? 1.55;
    const f0 = this.fill.intensity;
    const f1 = { calm: 0.5, spring: 0.52, snow: 0.72, rain: 0.68, warm: 0.4 }[key] ?? 0.5;
    this.anim(this.calm ? 0.01 : 1.2, (k) => { this.key.color.copy(from).lerp(to, k); this.key.intensity = lerp(i0, i1, k); this.fill.intensity = lerp(f0, f1, k); });
    this.weatherKind = weather;
    if (weather) {
      this.weather.visible = true;
      this.weatherMat.color.copy(weather === 'snow' ? this.snowColor : this.rainColor);
      this.weatherMat.size = weather === 'snow' ? 0.012 : 0.007;
    }
  }

  tickWeather(dt) {
    const want = this.weatherKind ? (this.weatherKind === 'snow' ? 0.95 : 0.6) : 0;
    const o = this.weatherMat.opacity + (want - this.weatherMat.opacity) * Math.min(1, dt * 2);
    this.weatherMat.opacity = o;
    if (o < 0.01 && !this.weatherKind) { this.weather.visible = false; return; }
    const pos = this.weather.geometry.attributes.position;
    const a = pos.array;
    const fall = (this.weatherKind === 'snow' ? 0.07 : 0.55) * (this.calm ? 0.5 : 1) * dt;
    const drift = this.weatherKind === 'snow' ? Math.sin(this.time * 0.8) * 0.012 * dt : 0.02 * dt;
    for (let i = 0; i < a.length; i += 3) {
      a[i + 1] -= fall * (0.7 + ((i * 7) % 10) / 16);
      a[i] += drift;
      if (a[i + 1] < 0) { a[i + 1] = 0.42; a[i] = (Math.random() - 0.5) * 1.3; }
    }
    pos.needsUpdate = true;
  }

  // ---------- time ----------

  /** A little animation in the lot's own time: fn(k 0..1), done(); ease and a delay optional. */
  anim(dur, fn, done = null, ease = easeInOut, delay = 0) {
    const a = { t: -delay, dur: Math.max(0.001, dur), fn, done, ease };
    this.anims.push(a);
    return a;
  }

  tick(dt) {
    this.time += dt;
    for (let i = 0; i < this.anims.length; i++) {
      const a = this.anims[i];
      a.t += dt;
      if (a.t < 0) continue;
      const k = Math.min(1, a.t / a.dur);
      a.fn?.(a.ease ? a.ease(k) : k);
      if (k >= 1) {
        this.anims.splice(i--, 1);
        a.done?.();
      }
    }
    this.tickAmbient(dt);
    this.updatePeople();
    this.tickWeather(dt);
    // Flags in the wind.
    if (!this.calm) {
      const arr = this.flagMesh.geometry.attributes.position.array;
      const base = this.flagBase;
      for (const f of this.flags) {
        for (let i = f.start; i < f.start + f.count; i++) {
          const dx = base[i * 3] - f.x;
          arr[i * 3 + 2] = base[i * 3 + 2] + Math.sin(this.time * 5 + base[i * 3 + 1] * 60 + f.phase) * dx * 0.3;
        }
      }
      this.flagMesh.geometry.attributes.position.needsUpdate = true;
    }
  }

  /** Finishes everything that moves at once (a skipped week). */
  flush() {
    const on = this.ambient.on;
    this.ambient.on = false;
    let guard = 0;
    while (this.anims.length && guard++ < 200) this.tick(0.25);
    this.ambient.on = on;
  }

  dispose() {
    this.anims.length = 0;
    for (const id of [...this.cars.keys()]) this.removeCar(id);
    for (const m of this.bubbleMats.values()) { m.map.dispose(); m.dispose(); }
    this.bubbleGeo.dispose();
    for (const p of this.popups) { p.tex.dispose(); }
    this.signTex.dispose();
    this.paintBase.dispose();
    disposeCarCache();
  }
}

function lerpAngle(a, b, k) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return a + d * k;
}
