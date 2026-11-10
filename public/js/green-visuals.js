// "Grünes Portfolio" (key 'green'): the region diorama from Blender (assets/models/green.glb,
// blender/build_green.py) in the token colors, with everything that happens on it at runtime:
//   materials   token colors, baked ambient occlusion, snow on hills, roofs and pines (Christmas),
//               meadow patches, rippling water, glinting solar cells, windows lit on winter evenings
//   AI map      a heat map over the terrain (wind, sun hours or demand) with contour lines and
//               hatching where the AI is unsure
//   plots       leveled pads with a frame, invisible hit boxes, value tags (the AI's forecast)
//   projects    turbines (spinning rotors), solar parks, schools, daycare, homes; they grow in
//   weather     a sun over the region, drifting clouds with shadows, wind gusts, rain, snowflakes,
//               the lighthouse beam, fairy lights on the town's Christmas tree, a sailing boat
//   people      tiny townsfolk walking the streets, children in schoolyards and playgrounds
// All colors from the --xr-green-* tokens (css/game-green.css). Diorama space: meters, x right,
// z towards the player, y up; the Region's root is placed by the scene.
import * as THREE from 'three';
import { hex, num, color, font } from './tokens.js';
import { drawIcon } from './icons.js';
import { loadGLTF } from './models.js';
import { radialTexture } from './robot-visuals.js';
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';
import { CHRISTMAS, makeBulbs } from './christmas.js';
import { quality } from './quality.js';
import { PLOTS, TYPES, OUTLINE, DISTRICTS, LIVE, windAt, sunAt, windConfAt, sunConfAt, inside, coastX } from './green-sim.js';

export const GREEN_URL = 'assets/models/green.glb';
export const loadGreen = () => loadGLTF(GREEN_URL);

const PAD = { land: 0.08, town: 0.062 };
const TURBINE_SCALE = 1.25;
const TOWN_Y = 0.004;
// Town streets (mirror of STREETS in blender/build_green.py) for the walking townsfolk.
const STREETS = [
  [[-0.065, 0.105], [0.28, 0.105]], [[-0.06, 0.225], [0.28, 0.225]],
  [[0.075, -0.035], [0.075, 0.345]], [[0.18, -0.035], [0.18, 0.34]], [[-0.055, -0.035], [0.27, -0.035]],
];

// Material name (Blender) -> token and surface. snow: how much snow it takes in winter.
const MAT = {
  GreenGrass: { t: 'xr-green-grass', r: 0.95, tint: true },
  GreenHill: { t: 'xr-green-hill', r: 0.95, snow: 1, snowY: 0.07 },
  GreenRock: { t: 'xr-green-rock', r: 0.9, snow: 0.8, snowY: 0.06 },
  GreenSand: { t: 'xr-green-sand', r: 0.95 },
  GreenBank: { t: 'xr-green-bank', r: 0.95 },
  GreenSeabed: { t: 'xr-green-seabed', r: 0.95 },
  GreenSoil: { t: 'xr-green-soil', r: 0.95 },
  GreenSoilDark: { t: 'xr-green-soil-dark', r: 0.95 },
  GreenStrata: { t: 'xr-green-strata', r: 0.95 },
  GreenPlinth: { t: 'xr-green-plinth', r: 0.38, m: 0.15 },
  GreenTrim: { t: 'xr-green-trim', r: 0.28, m: 1, env: 1 },
  GreenWaterSide: { t: 'xr-green-water-side', r: 0.08, opacity: 0.78 },
  GreenField1: { t: 'xr-green-field-1', r: 0.95 },
  GreenField2: { t: 'xr-green-field-2', r: 0.95 },
  GreenField3: { t: 'xr-green-field-3', r: 0.95 },
  GreenHedge: { t: 'xr-green-pine', r: 0.9 },
  GreenRoad: { t: 'xr-green-road', r: 0.85 },
  GreenPlaza: { t: 'xr-green-plaza', r: 0.85 },
  GreenStone: { t: 'xr-green-stone', r: 0.85 },
  GreenWall1: { t: 'xr-green-wall-1', r: 0.8 },
  GreenWall2: { t: 'xr-green-wall-2', r: 0.8 },
  GreenWall3: { t: 'xr-green-wall-3', r: 0.8 },
  GreenWall4: { t: 'xr-green-wall-4', r: 0.8 },
  GreenRoof1: { t: 'xr-green-roof-1', r: 0.7, snow: 1, patchy: 0.18 },
  GreenRoof2: { t: 'xr-green-roof-2', r: 0.7, snow: 1, patchy: 0.18 },
  GreenRoof3: { t: 'xr-green-roof-3', r: 0.6, snow: 1, patchy: 0.18 },
  GreenWindow: { t: 'xr-green-window', r: 0.2, window: true },
  GreenWood: { t: 'xr-green-wood', r: 0.8 },
  GreenPine: { t: 'xr-green-pine', r: 0.9, snow: 0.8, snowY: 0.06 },
  GreenLeaf: { t: 'xr-green-leaf', r: 0.9 },
  GreenLeaf2: { t: 'xr-green-leaf-2', r: 0.9 },
  GreenTrunk: { t: 'xr-green-trunk', r: 0.9 },
  GreenTurbine: { t: 'xr-green-turbine', r: 0.35, m: 0.05, env: 0.7 },
  GreenMark: { t: 'xr-green-mark', r: 0.4 },
  GreenConcrete: { t: 'xr-green-concrete', r: 0.9 },
  GreenSolarCell: { t: 'xr-green-solar-cell', r: 0.16, m: 0.55, glint: true, env: 1 },
  GreenSolarFrame: { t: 'xr-green-solar-frame', r: 0.3, m: 0.8, env: 0.8 },
  GreenSchoolWall: { t: 'xr-green-school-wall', r: 0.8 },
  GreenSchoolAccent: { t: 'xr-green-school-accent', r: 0.6 },
  GreenCourt: { t: 'xr-green-court', r: 0.9 },
  GreenLine: { t: 'xr-green-line', r: 0.8 },
  GreenKita1: { t: 'xr-green-kita-1', r: 0.7 },
  GreenKita2: { t: 'xr-green-kita-2', r: 0.7 },
  GreenKita3: { t: 'xr-green-kita-3', r: 0.7 },
  GreenHomesWall: { t: 'xr-green-homes-wall', r: 0.8 },
  GreenStall: { t: 'xr-green-stall', r: 0.7, snow: 0.8, patchy: 0.18 },
  GreenBoat: { t: 'xr-green-boat', r: 0.5 },
  GreenSail: { t: 'xr-green-sail', r: 0.9 },
  GreenLighthouse: { t: 'xr-green-lighthouse', r: 0.6 },
  GreenCloud: { t: 'xr-green-cloud', r: 1, cloud: true },
  GreenLampGlow: { t: 'xr-green-lamp', basic: true },
  GreenStarGlow: { t: 'xr-green-star', basic: true },
};

const NOISE = /* glsl */ `
varying vec3 vGN;
varying vec3 vGP;
float gHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float gNoise(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gHash(i), gHash(i + vec3(1, 0, 0)), f.x), mix(gHash(i + vec3(0, 1, 0)), gHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(gHash(i + vec3(0, 0, 1)), gHash(i + vec3(1, 0, 1)), f.x), mix(gHash(i + vec3(0, 1, 1)), gHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
`;

/** Shader patches on a standard material: snow (k), meadow tint, solar glint, lit windows, water. */
function patch(mat, U, { snow = 0, snowY = -1, patchy = 0.55, tint = false, glint = false, window = false, water = false }) {
  const key = `g${snow}|${snowY}|${patchy}|${tint}|${glint}|${window}|${water}`;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGN;\nvarying vec3 vGP;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 gN = objectNormal;
        vec4 gP = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          gN = mat3(instanceMatrix) * gN;
          gP = instanceMatrix * gP;
        #endif
        vGN = normalize(mat3(modelMatrix) * gN);
        vGP = gP.xyz;`);
    let frag = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform vec3 uUp; uniform float uSnow; uniform float uTime; uniform vec3 uSnowColor; uniform vec3 uSnowShade;
      uniform vec3 uTint; uniform float uGlint; uniform vec3 uGlintColor; uniform float uLit; uniform vec3 uLitColor;
      ${NOISE}`);
    let color = '#include <color_fragment>\nfloat gS = 0.0;\nvec3 gAo = vec3(1.0);\n#if defined( USE_COLOR )\ngAo = vColor.rgb;\n#endif\n';
    if (tint) {
      color += `{ float gt = gNoise(vGP * 18.0) * 0.6 + gNoise(vGP * 55.0 + 3.0) * 0.4;
        diffuseColor.rgb = mix(diffuseColor.rgb, uTint * gAo, smoothstep(0.5, 0.78, gt) * 0.75); }\n`;
    }
    if (snow > 0) {
      color += `{ float gup = dot(normalize(vGN), uUp);
        float gn = gNoise(vGP * 140.0) * 0.6 + gNoise(vGP * 420.0) * 0.4;
        gS = smoothstep(0.5, 0.78, gup + (gn - 0.5) * ${patchy.toFixed(2)}) * smoothstep(0.0, 0.15, uSnow) * clamp(uSnow * 1.25, 0.0, 1.0) * ${snow.toFixed(2)};
        ${snowY >= 0 ? `gS *= smoothstep(${(snowY - 0.025).toFixed(3)} + (1.0 - uSnow) * 0.04, ${snowY.toFixed(3)} + (1.0 - uSnow) * 0.04, vGP.y + (gn - 0.5) * 0.02);` : ''}
        vec3 gsc = mix(uSnowShade, uSnowColor, clamp(gAo.r * 1.25 - 0.1, 0.0, 1.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, gsc, gS); }\n`;
    }
    frag = frag.replace('#include <color_fragment>', color)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.85, gS);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.0, gS);');
    let emissive = '#include <emissivemap_fragment>\n';
    if (snow > 0) emissive += `totalEmissiveRadiance += uSnowColor * gS * step(0.985, gHash(floor(vGP * 900.0))) * pow(0.5 + 0.5 * sin(uTime * 2.4 + gHash(floor(vGP * 900.0)) * 50.0), 8.0) * 0.8;\n`;
    if (glint) emissive += `{ float gb = 1.0 - abs(fract(vGP.x * 9.0 + vGP.z * 4.0 - uTime * 0.35) - 0.5) * 2.0;
      totalEmissiveRadiance += uGlintColor * uGlint * pow(gb, 14.0) * 1.4; }\n`;
    if (window) emissive += `totalEmissiveRadiance += uLitColor * uLit * (0.45 + 0.55 * step(0.35, gHash(floor(vGP * 260.0 + 0.5))));\n`;
    frag = frag.replace('#include <emissivemap_fragment>', emissive);
    if (water) {
      frag = frag.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec2 q = vGP.xz * 70.0;
          float a = sin(q.x + uTime * 1.3) * 0.5 + sin(q.y * 1.3 - uTime * 1.1) * 0.5 + sin((q.x + q.y) * 0.7 + uTime * 0.8) * 0.4;
          float b = cos(q.x * 0.8 - uTime * 0.9) * 0.5 + cos(q.y + uTime * 1.4) * 0.5;
          normal = normalize(normal + (vec3(a, 0.0, b) * 0.09) * mat3(viewMatrix)); }`);
    }
    sh.fragmentShader = frag;
  };
  mat.customProgramCacheKey = () => key;
  return mat;
}

/**
 * Heights of the terrain on a grid (diorama space), rasterized once from the coarse hit mesh, so
 * rain and snow know where the ground is without ray casts.
 */
class HeightGrid {
  constructor(geometry, W = 104, H = 74) {
    this.W = W;
    this.H = H;
    this.y = new Float32Array(W * H);
    const pos = geometry.attributes.position;
    const idx = geometry.index;
    const n = idx ? idx.count : pos.count;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const gx = (x) => ((x + OUTLINE.a) / (2 * OUTLINE.a)) * (W - 1);
    const gz = (z) => ((z + OUTLINE.b) / (2 * OUTLINE.b)) * (H - 1);
    for (let t = 0; t < n; t += 3) {
      const ia = idx ? idx.getX(t) : t;
      const ib = idx ? idx.getX(t + 1) : t + 1;
      const ic = idx ? idx.getX(t + 2) : t + 2;
      a.fromBufferAttribute(pos, ia);
      b.fromBufferAttribute(pos, ib);
      c.fromBufferAttribute(pos, ic);
      const i0 = Math.max(0, Math.floor(gx(Math.min(a.x, b.x, c.x))));
      const i1 = Math.min(W - 1, Math.ceil(gx(Math.max(a.x, b.x, c.x))));
      const j0 = Math.max(0, Math.floor(gz(Math.min(a.z, b.z, c.z))));
      const j1 = Math.min(H - 1, Math.ceil(gz(Math.max(a.z, b.z, c.z))));
      const det = (b.z - c.z) * (a.x - c.x) + (c.x - b.x) * (a.z - c.z);
      if (Math.abs(det) < 1e-12) continue;
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          const x = -OUTLINE.a + (i / (W - 1)) * 2 * OUTLINE.a;
          const z = -OUTLINE.b + (j / (H - 1)) * 2 * OUTLINE.b;
          const l1 = ((b.z - c.z) * (x - c.x) + (c.x - b.x) * (z - c.z)) / det;
          const l2 = ((c.z - a.z) * (x - c.x) + (a.x - c.x) * (z - c.z)) / det;
          const l3 = 1 - l1 - l2;
          if (l1 < -0.02 || l2 < -0.02 || l3 < -0.02) continue;
          this.y[j * W + i] = Math.max(this.y[j * W + i], a.y * l1 + b.y * l2 + c.y * l3);
        }
      }
    }
  }

  at(x, z) {
    const { W, H } = this;
    const i = Math.round(((x + OUTLINE.a) / (2 * OUTLINE.a)) * (W - 1));
    const j = Math.round(((z + OUTLINE.b) / (2 * OUTLINE.b)) * (H - 1));
    if (i < 0 || j < 0 || i >= W || j >= H) return 0;
    return this.y[j * W + i];
  }
}

/** A rounded rectangle shape (centered). */
function roundRect(w, d, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -d / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d);
  s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** A tiny person (lathe: legs, body, head), about 1.2 cm tall. */
function personGeometry() {
  const pts = [[0, 0], [0.0012, 0], [0.0014, 0.004], [0.0019, 0.0055], [0.002, 0.0078], [0.0014, 0.0088], [0.0006, 0.009],
    [0.0013, 0.0094], [0.0016, 0.0103], [0.0013, 0.0113], [0.0006, 0.0118], [0, 0.0119]].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, 8);
}

// ---------- the region ----------

export class Region {
  constructor(gltf, renderer, { xr = false } = {}) {
    this.xr = xr;
    this.root = new THREE.Group();
    this.root.name = 'GreenRegion';
    this.cloudY = 0.27; // clouds float this high (lower in the browser's tilted view)
    this.turbineYaw = -0.35; // rotors face the player (a phone held upright turns the map)
    this.showSun = true;
    this.time = 0;
    this.lite = quality.lite;
    this.U = {
      uUp: { value: new THREE.Vector3(0, 1, 0) },
      uSnow: { value: CHRISTMAS ? 0.7 : 0 },
      uTime: { value: 0 },
      uSnowColor: { value: new THREE.Color(hex('xr-snow')) },
      uSnowShade: { value: new THREE.Color(hex('xr-snow-shade')) },
      uTint: { value: new THREE.Color(hex('xr-green-grass-tint')) },
      uGlint: { value: 0.4 },
      uGlintColor: { value: new THREE.Color(hex('xr-green-glint')) },
      uLit: { value: 0 },
      uLitColor: { value: new THREE.Color(hex('xr-green-window-lit')) },
    };
    this.mats = {};
    this.anims = [];
    this.plots = new Map();
    const scene = gltf.scene;
    const node = (name) => scene.getObjectByName(name);
    // Static parts of the diorama (clones share the geometry of the cached model).
    for (const name of ['GreenGround', 'GreenBase', 'GreenFields', 'GreenRoads', 'GreenTown', 'GreenTrees']) {
      const src = node(name);
      if (!src) continue;
      const o = this.skin(src.clone(true));
      o.traverse((m) => { if (m.isMesh) { m.receiveShadow = true; m.castShadow = name !== 'GreenGround' && name !== 'GreenBase' && name !== 'GreenRoads' && name !== 'GreenFields'; } });
      this.root.add(o);
      this[name] = o;
    }
    // Water (transparent, rippling) over the river bed and the sea.
    const waterSrc = node('GreenWater');
    if (waterSrc) {
      const water = waterSrc.clone(true);
      // A little light of its own, so the water reads as water from every angle (not only as a
      // reflection of a dark room).
      const wmat = patch(new THREE.MeshStandardMaterial({ name: 'GreenWater', color: hex('xr-green-water'), emissive: hex('xr-green-water'), emissiveIntensity: 0.12, roughness: 0.3, metalness: 0.05, transparent: true, opacity: 0.8, envMapIntensity: 0.45, side: THREE.DoubleSide }), this.U, { water: true });
      this.mats.GreenWater = wmat;
      water.traverse((m) => {
        if (!m.isMesh) return;
        m.material = [].concat(m.material).map((x) => (x.name === 'GreenWaterSide' ? this.material('GreenWaterSide') : wmat));
        if (m.material.length === 1) m.material = m.material[0];
        m.renderOrder = 2;
        m.receiveShadow = true;
      });
      this.root.add(water);
      this.water = water;
    }
    this.flood = 0; // water level offset (a flood at the river)
    this.floodTarget = 0;
    // Pointer rays hit the coarse copy of the terrain (cheap); it also gives the heights.
    let hitGeo = null;
    node('GreenHit')?.traverse((o) => { if (o.isMesh && !hitGeo) hitGeo = o.geometry; });
    hitGeo ??= new THREE.PlaneGeometry(1, 0.7).rotateX(-Math.PI / 2);
    this.hit = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial({ visible: false }));
    this.hit.userData.noFit = true;
    this.root.add(this.hit);
    this.heights = new HeightGrid(hitGeo);
    // Sources for the projects and the weather.
    this.src = {};
    for (const n of ['GreenTurbine', 'GreenRotor', 'GreenSolar', 'GreenSchool', 'GreenKita', 'GreenHomes', 'GreenCloud', 'GreenBoat']) this.src[n] = node(n);
    const hub = node('RotorHub');
    this.hubPos = hub ? hub.position.clone() : new THREE.Vector3(0, 0.105, 0.0105);
    // Plots: anchors from the model (top of each leveled pad).
    for (const p of PLOTS) {
      const e = node(`Plot_${p.id}`);
      const pos = e ? e.position.clone() : new THREE.Vector3(p.x, this.heights.at(p.x, p.z), p.z);
      this.addPlot(p, pos);
    }
    this.buildLights(renderer);
    this.buildOverlay();
    this.buildWeather();
    this.buildPeople();
    this.buildDecor(node);
    this.buildLive();
  }

  /** A token material for a Blender material name (shared within this region). */
  material(name) {
    if (this.mats[name]) return this.mats[name];
    const d = MAT[name];
    let m;
    if (!d) m = new THREE.MeshStandardMaterial({ color: hex('xr-green-wall-1'), vertexColors: true, roughness: 0.8 });
    else if (d.basic) m = new THREE.MeshBasicMaterial({ color: hex(d.t), toneMapped: false });
    else {
      m = new THREE.MeshStandardMaterial({ name, color: hex(d.t), roughness: d.r ?? 0.8, metalness: d.m ?? 0, vertexColors: !d.cloud, envMapIntensity: d.env ?? 0.35 });
      if (d.opacity) { m.transparent = true; m.opacity = d.opacity; }
      if (d.cloud) { m.transparent = true; m.opacity = 0.96; }
      if (d.window) { m.emissive = new THREE.Color(); }
      if (d.snow || d.tint || d.glint || d.window) patch(m, this.U, { snow: CHRISTMAS ? d.snow ?? 0 : 0, snowY: d.snowY ?? -1, patchy: d.patchy ?? 0.55, tint: !!d.tint, glint: !!d.glint, window: !!d.window });
    }
    m.name = name;
    this.mats[name] = m;
    return m;
  }

  /** Replaces the materials of a (cloned) model by the token materials. */
  skin(obj) {
    obj.traverse((o) => {
      if (!o.isMesh) return;
      const list = [].concat(o.material).map((m) => this.material(m.name));
      o.material = list.length === 1 ? list[0] : list;
    });
    return obj;
  }

  // ---------- light ----------

  buildLights(renderer) {
    const key = new THREE.DirectionalLight(hex('xr-green-key-light'), 1.25);
    key.position.set(-0.45, 0.95, 0.6);
    key.target.position.set(0, 0, 0);
    this.root.add(key, key.target);
    this.key = key;
    this.keyColor = new THREE.Color(hex('xr-green-key-light'));
    this.heatColor = new THREE.Color(hex('xr-green-heat-light'));
    this.stormColor = new THREE.Color(hex('xr-green-storm-light'));
    if (!this.lite) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      key.castShadow = true;
      key.shadow.mapSize.set(this.xr ? 1024 : 2048, this.xr ? 1024 : 2048);
      Object.assign(key.shadow.camera, { left: -0.66, right: 0.66, top: 0.6, bottom: -0.6, near: 0.3, far: 2.2 });
      key.shadow.camera.updateProjectionMatrix();
      key.shadow.bias = -0.0004;
      key.shadow.normalBias = 0.004;
    }
    const fill = new THREE.HemisphereLight(hex('xr-green-key-light'), hex('xr-green-soil-dark'), 0.25);
    this.root.add(fill);
  }

  // ---------- the AI map ----------

  buildOverlay() {
    const W = 112;
    const H = 80;
    this.field = { W, H, data: new Uint8Array(W * H * 4) };
    const tex = new THREE.DataTexture(this.field.data, W, H, THREE.RGBAFormat);
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    this.fieldTex = tex;
    this.overlayU = {
      uField: { value: tex },
      uLo: { value: new THREE.Color() },
      uMid: { value: new THREE.Color() },
      uHi: { value: new THREE.Color() },
      uLine: { value: new THREE.Color(hex('xr-green-heat-line')) },
      uOpacity: { value: 0 },
      uTime: this.U.uTime,
      uBounds: { value: new THREE.Vector4(-OUTLINE.a, -OUTLINE.b, OUTLINE.a, OUTLINE.b) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.overlayU,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
      vertexShader: /* glsl */ `
        varying vec3 vP;
        void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uField; uniform vec3 uLo; uniform vec3 uMid; uniform vec3 uHi; uniform vec3 uLine;
        uniform float uOpacity; uniform float uTime; uniform vec4 uBounds;
        varying vec3 vP;
        void main() {
          vec2 uv = (vP.xz - uBounds.xy) / (uBounds.zw - uBounds.xy);
          vec4 f = texture2D(uField, uv);
          float v = f.r; float conf = f.g; float mask = f.b;
          float vc = pow(v, 1.45);
          vec3 col = vc < 0.5 ? mix(uLo, uMid, vc * 2.0) : mix(uMid, uHi, vc * 2.0 - 1.0);
          // Contour lines (like a weather map).
          float lv = v * 7.0;
          float w = fwidth(lv);
          float line = 1.0 - smoothstep(0.0, w * 1.4, abs(fract(lv) - 0.5) * 2.0 - (1.0 - w * 2.5));
          col = mix(col, uLine, line * 0.45);
          // Hatching where the AI is unsure: dark diagonal stripes.
          float unsure = smoothstep(0.85, 0.45, conf);
          float stripe = smoothstep(0.42, 0.5, abs(fract((vP.x + vP.z) * 60.0) - 0.5) * 2.0 * 0.5 + 0.25);
          col = mix(col, uLine, unsure * stripe * 0.55);
          float a = uOpacity * mask * 0.84;
          gl_FragColor = vec4(col, a);
          #include <colorspace_fragment>
        }`,
    });
    // One overlay mesh per part of the ground (the model splits it by material).
    this.overlay = new THREE.Group();
    this.GreenGround?.traverse((o) => {
      if (!o.isMesh) return;
      const m = new THREE.Mesh(o.geometry, mat);
      m.renderOrder = 3;
      m.userData.noFit = true;
      this.overlay.add(m);
    });
    this.overlay.visible = false;
    this.overlay.userData.noFit = true;
    this.root.add(this.overlay);
    this.overlayMode = null;
    this.overlayTarget = 0;
  }

  /**
   * Shows the AI map: mode 'wind' | 'sun' | 'need' (need: { [district]: 0..1 }) or null to hide.
   * Wind and sun come from the same fields as the forecast (green-sim.js).
   */
  showMap(mode, need = null, opacity = 1) {
    const key = mode === 'need' ? `need:${JSON.stringify(need)}` : mode;
    this.overlayTarget = mode ? opacity : 0;
    if (!mode || key === this.overlayKey) return;
    this.overlayKey = key;
    this.overlayMode = mode;
    const { W, H, data } = this.field;
    const ramp = { wind: 'wind', sun: 'sun', need: 'need' }[mode];
    this.overlayU.uLo.value.setHex(hex(`xr-green-heat-${ramp}-lo`));
    this.overlayU.uMid.value.setHex(hex(`xr-green-heat-${ramp}-mid`));
    this.overlayU.uHi.value.setHex(hex(`xr-green-heat-${ramp}-hi`));
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const x = -OUTLINE.a + ((i + 0.5) / W) * 2 * OUTLINE.a;
        const z = -OUTLINE.b + ((j + 0.5) / H) * 2 * OUTLINE.b;
        let v = 0;
        let c = 1;
        let m = inside(x, z, -0.01) ? 1 : 0;
        if (mode === 'wind') {
          v = (windAt(x, z) - 4.4) / (8.4 - 4.4);
          c = windConfAt(x, z);
          if (x > coastX(z) + 0.01) m *= 0.45;
        } else if (mode === 'sun') {
          v = (sunAt(x, z) - 1350) / (1900 - 1350);
          c = sunConfAt(x, z);
          if (x > coastX(z) + 0.01) m *= 0.45;
        } else {
          // Demand per district: soft blobs around the district centers.
          let best = 0;
          let w = 0;
          for (const [k, D] of Object.entries(DISTRICTS)) {
            const g = Math.exp(-((x - D.x) ** 2 + (z - D.z) ** 2) / (2 * D.r * D.r));
            if (g > w) { w = g; best = need?.[k] ?? 0; }
          }
          v = best;
          c = 0.82;
          m *= Math.min(1, w * 1.6);
        }
        const o = (j * W + i) * 4;
        data[o] = Math.round(Math.min(1, Math.max(0, v)) * 255);
        data[o + 1] = Math.round(Math.min(1, Math.max(0, c)) * 255);
        data[o + 2] = Math.round(m * 255);
        data[o + 3] = 255;
      }
    }
    this.fieldTex.needsUpdate = true;
  }

  // ---------- plots ----------

  addPlot(p, pos) {
    const size = PAD[p.area];
    const g = new THREE.Group();
    g.position.copy(pos);
    this.root.add(g);
    const plate = new THREE.Mesh(new THREE.ExtrudeGeometry(roundRect(size - 0.006, size - 0.006, 0.008), { depth: 0.0018, bevelEnabled: true, bevelThickness: 0.0006, bevelSize: 0.0008, bevelSegments: 1, curveSegments: 4 }).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: hex('xr-green-plot'), roughness: 0.9, transparent: true, opacity: 0.82, envMapIntensity: 0.3 }));
    plate.receiveShadow = true;
    // A frame that lights up in the state's color.
    const ringShape = roundRect(size - 0.004, size - 0.004, 0.009);
    ringShape.holes.push(roundRect(size - 0.009, size - 0.009, 0.007));
    const frame = new THREE.Mesh(new THREE.ShapeGeometry(ringShape, 4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: hex('xr-green-plot-edge'), transparent: true, opacity: 0.9, toneMapped: false }));
    frame.position.y = 0.0029;
    // Corner stakes with little flags, like a real building site (one mesh each).
    const stakeMat = new THREE.MeshStandardMaterial({ color: hex('xr-green-wood'), roughness: 0.8 });
    const flagMat = new THREE.MeshBasicMaterial({ color: hex('xr-green-plot-ok'), side: THREE.DoubleSide, toneMapped: false });
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sz]) => [(sx * size) / 2.15, (sz * size) / 2.15]);
    const stakes = new THREE.Group();
    stakes.add(new THREE.Mesh(mergeGeometries(corners.map(([x, z]) => new THREE.CylinderGeometry(0.0008, 0.0008, 0.012, 5).translate(x, 0.006, z))), stakeMat));
    stakes.add(new THREE.Mesh(mergeGeometries(corners.map(([x, z]) => new THREE.PlaneGeometry(0.005, 0.0035).translate(x + 0.0025, 0.0105, z))), flagMat));
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(size * 1.7, size * 1.7).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: radialTexture(), color: hex('xr-green-plot-ok'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.y = 0.003;
    glow.userData.noFit = true;
    // The pointer target (invisible box over the pad; taller once something stands there).
    const box = new THREE.Mesh(new THREE.BoxGeometry(size, 1, size), new THREE.MeshBasicMaterial({ visible: false }));
    box.userData.noFit = true;
    box.userData.interactive = true;
    box.userData.label = `plot ${p.id}`;
    box.userData.plot = p.id;
    this.setBoxHeight(box, 0.05);
    g.add(plate, frame, stakes, glow, box);
    this.plots.set(p.id, { id: p.id, area: p.area, pos, group: g, plate, frame, stakes, flagMat, glow, box, model: null, tag: null, state: 'idle', k: 0 });
  }

  setBoxHeight(box, h) {
    box.scale.y = h;
    box.position.y = h / 2;
  }

  /** state: 'idle' | 'ok' | 'off' | 'hover' | 'best' | 'built' (and hover over built). */
  setPlotState(id, state) {
    const P = this.plots.get(id);
    if (!P || P.state === state) return;
    P.state = state;
    const tok = { idle: 'xr-green-plot-edge', ok: 'xr-green-plot-ok', best: 'xr-green-plot-ok', hover: 'xr-green-plot-hover', off: 'xr-green-plot-off', built: 'xr-green-plot-edge' }[state] ?? 'xr-green-plot-edge';
    P.frame.material.color.setHex(hex(tok));
    P.flagMat.color.setHex(hex(tok));
    P.frame.material.opacity = state === 'off' ? 0.35 : 0.95;
    P.glow.material.color.setHex(hex(tok));
  }

  // ---------- value tags over the plots ----------

  /** tags: [{ id, text, sub, token }] (null hides them all). */
  setTags(tags) {
    const want = new Map((tags ?? []).map((t) => [t.id, t]));
    for (const P of this.plots.values()) {
      const t = want.get(P.id);
      if (!t) { if (P.tag) P.tag.visible = false; continue; }
      if (!P.tag) {
        const c = document.createElement('canvas');
        c.width = 192;
        c.height = 88;
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
        s.renderOrder = 20;
        s.userData.noFit = true;
        s.userData.canvas = c;
        const w = num('xr-green-tag');
        s.scale.set(w, (w * 88) / 192, 1);
        P.group.add(s);
        P.tag = s;
      }
      const s = P.tag;
      s.visible = true;
      const key = `${t.text}|${t.sub}|${t.token}|${t.strong}`;
      s.position.y = (P.model ? P.modelH ?? 0.04 : 0.012) + 0.03;
      if (s.userData.key === key) continue;
      s.userData.key = key;
      drawTag(s.userData.canvas, t);
      s.material.map.needsUpdate = true;
    }
  }

  // ---------- projects ----------

  /** Builds a project on a plot; animate: grows out of the ground. */
  build(id, type, animate = true) {
    const P = this.plots.get(id);
    if (!P || P.model) return null;
    const g = new THREE.Group();
    const name = { wind: 'GreenTurbine', solar: 'GreenSolar', school: 'GreenSchool', kita: 'GreenKita', homes: 'GreenHomes' }[type];
    const src = this.src[name];
    const body = src ? this.skin(src.clone(true)) : new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.05), this.material('GreenWall1'));
    body.position.set(0, 0, 0);
    body.rotation.set(0, 0, 0);
    body.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    // Turbines a little larger than true to scale, so they read well from afar.
    const inner = new THREE.Group();
    if (type === 'wind') inner.scale.setScalar(TURBINE_SCALE);
    inner.add(body);
    g.add(inner);
    let h = 0.04;
    if (type === 'wind') {
      // Turned towards the prevailing wind from the south-west (the rotor faces the player).
      g.rotation.y = this.turbineYaw;
      g.userData.turbine = true;
      const rotor = this.src.GreenRotor ? this.skin(this.src.GreenRotor.clone(true)) : new THREE.Group();
      rotor.position.copy(this.hubPos);
      rotor.rotation.set(0, 0, Math.random() * 6);
      rotor.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      inner.add(rotor);
      g.userData.rotor = rotor;
      g.userData.spin = 0;
      h = (this.hubPos.y + 0.045) * TURBINE_SCALE;
    } else if (type === 'solar') h = 0.012;
    else if (type === 'school') h = 0.03;
    else if (type === 'kita') h = 0.026;
    else if (type === 'homes') h = 0.044;
    P.group.add(g);
    P.model = g;
    P.modelH = h;
    P.type = type;
    P.plate.visible = false;
    P.frame.visible = false;
    P.stakes.visible = false;
    P.glow.visible = false;
    this.setBoxHeight(P.box, h);
    if (animate) {
      g.scale.set(1, 0.01, 1);
      if (g.userData.rotor) g.userData.rotor.scale.setScalar(0.01);
      this.anims.push({ g, t: 0, dur: type === 'wind' ? 1.1 : 0.8 });
    }
    return g;
  }

  /** Takes a project back off its plot. */
  unbuild(id) {
    const P = this.plots.get(id);
    if (!P?.model) return;
    P.model.removeFromParent();
    this.anims = this.anims.filter((a) => a.g !== P.model);
    P.model = null;
    P.type = null;
    P.plate.visible = true;
    P.frame.visible = true;
    P.stakes.visible = true;
    P.glow.visible = true;
    this.setBoxHeight(P.box, 0.05);
  }

  /** A ghost of a project that follows the pointer while it is dragged (XR, mouse). */
  ghost(type) {
    if (this.ghostObj?.userData.type === type) return this.ghostObj;
    this.ghostObj?.removeFromParent();
    const name = { wind: 'GreenTurbine', solar: 'GreenSolar', school: 'GreenSchool', kita: 'GreenKita', homes: 'GreenHomes' }[type];
    const src = this.src[name];
    const g = new THREE.Group();
    if (src) {
      const body = src.clone(true);
      const mat = new THREE.MeshBasicMaterial({ color: hex(TYPES[type].token), transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false });
      body.traverse((o) => { if (o.isMesh) o.material = mat; });
      g.add(body);
      if (type === 'wind' && this.src.GreenRotor) {
        const r = this.src.GreenRotor.clone(true);
        r.traverse((o) => { if (o.isMesh) o.material = mat; });
        r.position.copy(this.hubPos);
        g.add(r);
        g.scale.setScalar(TURBINE_SCALE);
      }
    }
    g.userData.type = type;
    g.userData.noFit = true;
    g.traverse((o) => { o.userData.noFit = true; });
    g.visible = false;
    this.root.add(g);
    this.ghostObj = g;
    return g;
  }

  hideGhost() {
    if (this.ghostObj) this.ghostObj.visible = false;
  }

  // ---------- weather ----------

  buildWeather() {
    const R = this.root;
    // The sun: a small glowing orb that crosses the sky over the diorama during the year.
    const sun = new THREE.Group();
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.018, 16, 12), new THREE.MeshBasicMaterial({ color: hex('xr-green-sun-orb'), toneMapped: false }));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), color: hex('xr-green-sun-orb'), transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.setScalar(0.13);
    sun.add(orb, halo);
    sun.userData.noFit = true;
    orb.userData.noFit = true;
    sun.position.set(-0.34, 0.42, -0.28);
    R.add(sun);
    this.sun = sun;
    this.sunHalo = halo;
    // Clouds with real shadows.
    this.clouds = [];
    const cloudSrc = this.src.GreenCloud;
    const cloudMat = this.material('GreenCloud');
    this.cloudColor = new THREE.Color(hex('xr-green-cloud'));
    this.stormCloud = new THREE.Color(hex('xr-green-storm-cloud'));
    for (let i = 0; i < 6; i++) {
      const c = cloudSrc ? cloudSrc.clone(true) : new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), cloudMat);
      c.traverse((o) => { if (o.isMesh) { o.material = cloudMat; o.castShadow = true; o.userData.noFit = true; } });
      c.userData.noFit = true;
      const s = 0.8 + Math.random() * 0.7;
      c.userData.base = s;
      c.userData.y = Math.random();
      c.userData.z = -0.3 + (i / 5) * 0.6 + (Math.random() - 0.5) * 0.08;
      c.userData.speed = 0.6 + Math.random() * 0.5;
      c.userData.k = 0;
      c.position.set(-0.6 + Math.random() * 1.2, c.userData.y, c.userData.z);
      c.scale.setScalar(0.001);
      R.add(c);
      this.clouds.push(c);
    }
    // Wind gusts: thin bright streaks that sweep across the landscape.
    const gc = document.createElement('canvas');
    gc.width = 128;
    gc.height = 8;
    const gx = gc.getContext('2d');
    // A streak that fades in and out along its length (alpha mask, tinted by the material).
    gx.fillStyle = color('xr-green-gust');
    for (let x = 0; x < 128; x++) {
      const u = x / 127;
      gx.globalAlpha = 0.9 * (u < 0.7 ? u / 0.7 : (1 - u) / 0.3);
      gx.fillRect(x, 2, 1, 4);
    }
    gx.globalAlpha = 1;
    const gtex = new THREE.CanvasTexture(gc);
    this.gustMat = new THREE.MeshBasicMaterial({ map: gtex, color: hex('xr-green-gust'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.gusts = [];
    for (let i = 0; i < (this.lite ? 8 : 14); i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.006, 8, 1), this.gustMat);
      m.userData.noFit = true;
      m.userData.t = Math.random();
      m.userData.z = -0.3 + Math.random() * 0.6;
      m.userData.y = 0.05 + Math.random() * 0.12;
      m.userData.speed = 0.5 + Math.random() * 0.4;
      R.add(m);
      this.gusts.push(m);
    }
    // Rain (streaks) and snow (flakes) inside the diorama's air.
    const nRain = this.lite ? 160 : 320;
    const rp = new Float32Array(nRain * 6);
    this.rainData = Array.from({ length: nRain }, () => ({ x: (Math.random() - 0.5) * 1.0, y: Math.random() * 0.35, z: (Math.random() - 0.5) * 0.66 }));
    const rgeo = new THREE.BufferGeometry();
    rgeo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
    this.rain = new THREE.LineSegments(rgeo, new THREE.LineBasicMaterial({ color: hex('xr-green-rain'), transparent: true, opacity: 0, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.userData.noFit = true;
    R.add(this.rain);
    const nSnow = this.lite ? 180 : 360;
    const sp = new Float32Array(nSnow * 3);
    this.snowData = Array.from({ length: nSnow }, () => ({ x: (Math.random() - 0.5) * 1.0, y: Math.random() * 0.35, z: (Math.random() - 0.5) * 0.66, ph: Math.random() * 6 }));
    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.flakes = new THREE.Points(sgeo, new THREE.PointsMaterial({ color: hex('xr-snow-flake'), size: 0.006, map: radialTexture(), transparent: true, opacity: 0, depthWrite: false }));
    this.flakes.frustumCulled = false;
    this.flakes.userData.noFit = true;
    R.add(this.flakes);
  }

  // ---------- townsfolk ----------

  buildPeople() {
    const N = 90;
    const geo = personGeometry();
    const mat = new THREE.MeshStandardMaterial({ color: hex('xr-green-line'), roughness: 0.7 }); // tinted per person
    this.people = new THREE.InstancedMesh(geo, mat, N);
    this.people.castShadow = true;
    this.people.userData.noFit = true;
    this.people.count = 0;
    this.root.add(this.people);
    this.folk = [];
    this.folkColors = [1, 2, 3, 4, 5].map((i) => new THREE.Color(hex(`xr-green-person-${i}`)));
    for (let i = 0; i < 14; i++) this.addWalker();
  }

  /** A grown-up walking up and down a town street. */
  addWalker(near) {
    if (this.folk.length >= 90) return;
    let s = STREETS[Math.floor(Math.random() * STREETS.length)];
    if (near) {
      // The street closest to a plot.
      let best = Infinity;
      for (const st of STREETS) {
        const [[ax, az], [bx, bz]] = st;
        const d = ax === bx ? Math.abs(near.x - ax) : Math.abs(near.z - az);
        if (d < best) { best = d; s = st; }
      }
    }
    this.folk.push({ kind: 'walk', s, t: Math.random(), dir: Math.random() < 0.5 ? 1 : -1, side: (Math.random() < 0.5 ? -1 : 1) * 0.0038, speed: 0.012 + Math.random() * 0.008, color: this.folkColors[Math.floor(Math.random() * 5)], scale: 0.9 + Math.random() * 0.2, ph: Math.random() * 6 });
  }

  /** Children playing around a point (schoolyard, playground). */
  addKids(pos, n, r = 0.016) {
    for (let i = 0; i < n && this.folk.length < 90; i++) {
      this.folk.push({ kind: 'play', cx: pos.x + (Math.random() - 0.5) * 0.01, cz: pos.z + 0.012, y: pos.y, r: r * (0.5 + Math.random() * 0.5), a: Math.random() * 6, speed: (0.8 + Math.random()) * (Math.random() < 0.5 ? -1 : 1), color: this.folkColors[Math.floor(Math.random() * 5)], scale: 0.65, ph: Math.random() * 6 });
    }
  }

  updatePeople(dt) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3();
    let n = 0;
    for (const f of this.folk) {
      const cheer = this.cheerUntil[f.district ?? this.districtOf(f)] > this.time;
      f.ph += dt * (cheer ? 16 : 9);
      const hop = Math.abs(Math.sin(f.ph)) * (cheer ? 0.003 : 0.0008);
      if (f.kind === 'walk') {
        const [[ax, az], [bx, bz]] = f.s;
        const len = Math.hypot(bx - ax, bz - az);
        f.t += (f.dir * f.speed * dt) / len;
        if (f.t > 1 || f.t < 0) { f.dir *= -1; f.t = Math.min(1, Math.max(0, f.t)); }
        const dx = (bx - ax) / len;
        const dz = (bz - az) / len;
        v.set(ax + (bx - ax) * f.t - dz * f.side, TOWN_Y + 0.0013 + hop, az + (bz - az) * f.t + dx * f.side);
        e.set(0, Math.atan2(dx * f.dir, dz * f.dir), 0);
      } else {
        f.a += f.speed * dt;
        v.set(f.cx + Math.cos(f.a) * f.r, f.y + 0.001 + hop * 2, f.cz + Math.sin(f.a) * f.r * 0.7);
        e.set(0, -f.a, 0);
      }
      q.setFromEuler(e);
      s.setScalar(f.scale);
      m.compose(v, q, s);
      this.people.setMatrixAt(n, m);
      this.people.setColorAt(n, f.color);
      n += 1;
    }
    this.people.count = n;
    this.people.instanceMatrix.needsUpdate = true;
    if (this.people.instanceColor) this.people.instanceColor.needsUpdate = true;
  }

  // ---------- decoration ----------

  buildDecor(node) {
    // Fairy lights spiralling around the town's Christmas tree.
    const xt = node('XmasTree');
    if (CHRISTMAS && xt) {
      const pts = [];
      const n = 26;
      for (let i = 0; i < n; i++) {
        const u = i / n;
        const y = 0.006 + u * 0.03;
        const r = 0.0125 * (1 - u * 0.85) + 0.0012;
        const a = u * Math.PI * 2 * 3.2;
        pts.push(new THREE.Vector3(xt.position.x + Math.cos(a) * r, xt.position.y + y, xt.position.z + Math.sin(a) * r));
      }
      this.bulbs = makeBulbs(pts, { size: 0.0013, halo: 0.012 });
      this.root.add(this.bulbs);
    }
    // The lighthouse beam (turns, brighter at night and in storms).
    const lamp = node('LighthouseLamp');
    if (lamp) {
      const beam = new THREE.Group();
      beam.position.copy(lamp.position);
      const bm = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.16, 16, 1, true).rotateZ(Math.PI / 2).translate(-0.08, 0, 0), new THREE.MeshBasicMaterial({ color: hex('xr-green-lamp'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
      bm.userData.noFit = true;
      beam.add(bm);
      beam.userData.noFit = true;
      this.root.add(beam);
      this.beam = beam;
      this.beamMat = bm.material;
    }
    // A sailing boat on the sea.
    if (this.src.GreenBoat) {
      const b = this.skin(this.src.GreenBoat.clone(true));
      b.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      b.userData.noFit = true;
      this.root.add(b);
      this.boat = b;
    }
  }

  // ---------- frame update ----------

  /**
   * vis: { wind 0..1.6, sun 0..1.3, cloud 0..1, rain 0..1, snowfall 0..1, snow (cover) 0..1,
   * night 0..1, storm 0..1, month 0..12 }.
   */
  update(dt, vis) {
    this.time += dt;
    const T = this.time;
    this.U.uTime.value = T;
    this.U.uSnow.value += ((CHRISTMAS ? vis.snow : 0) - this.U.uSnow.value) * Math.min(1, dt * 1.5);
    this.U.uLit.value += ((vis.blackout ? 0 : vis.night * 1.2) - this.U.uLit.value) * Math.min(1, dt * 3);
    this.U.uGlint.value = 0.15 + 0.85 * Math.max(0, vis.sun - 0.3) * (1 - vis.cloud * 0.6);
    // Up in world space (the diorama may be tilted towards the camera in the browser).
    this.root.updateMatrixWorld();
    this.U.uUp.value.set(0, 1, 0).transformDirection(this.root.matrixWorld);
    // Light: the sun's strength and a cooler, dimmer light in storms and at night.
    const bright = 0.3 + 1.05 * Math.min(1.2, vis.sun) * (1 - 0.45 * vis.cloud) * (1 - 0.6 * vis.night);
    this.key.intensity += (bright - this.key.intensity) * Math.min(1, dt * 3);
    this.key.color.copy(this.keyColor).lerp(this.stormColor, Math.min(1, vis.storm * 0.8 + vis.night * 0.6)).lerp(this.heatColor, Math.min(1, (vis.heat ?? 0) * 0.6));
    // The sun crosses the sky with the months (higher in summer); hidden behind storms.
    const mk = (vis.month ?? 6) / 12;
    const sx = -0.42 + 0.84 * mk;
    const sy = 0.3 + 0.18 * Math.sin(mk * Math.PI);
    this.sun.position.set(sx, sy, -0.3);
    this.sun.visible = this.showSun;
    const sunVis = Math.max(0, Math.min(1, vis.sun * 0.9 - vis.storm * 0.6 - vis.night * 0.8));
    this.sun.scale.setScalar(0.4 + 0.6 * sunVis + 0.05 * Math.sin(T * 2));
    this.sunHalo.material.opacity = 0.25 + 0.55 * sunVis;
    // Clouds drift with the wind; how many show depends on the cloud cover.
    const drift = 0.012 + 0.05 * vis.wind;
    this.clouds.forEach((c, i) => {
      const want = i < Math.round(vis.cloud * this.clouds.length + 0.2) ? 1 : 0;
      c.userData.k += (want - c.userData.k) * Math.min(1, dt * 0.8);
      c.position.x += drift * c.userData.speed * dt;
      if (c.position.x > 0.62) c.position.x = -0.62;
      const edge = Math.min(1, (0.62 - Math.abs(c.position.x)) / 0.12);
      const s = Math.max(0.001, c.userData.base * c.userData.k * edge);
      c.scale.set(s, s, s);
      c.position.y = this.cloudY + c.userData.y * 0.08 - vis.storm * 0.04 + Math.sin(T * 0.4 + i) * 0.005;
      c.position.z = c.userData.z;
    });
    const cm = this.mats.GreenCloud;
    if (cm) cm.color.copy(this.cloudColor).lerp(this.stormCloud, Math.min(1, vis.storm + vis.rain * 0.4));
    // Gusts: more and faster with the wind.
    const g = Math.max(0, vis.wind - 0.45);
    this.gustMat.opacity += (Math.min(0.75, g * 0.7) - this.gustMat.opacity) * Math.min(1, dt * 2);
    for (const m of this.gusts) {
      m.userData.t += dt * m.userData.speed * (0.4 + vis.wind);
      if (m.userData.t > 1) { m.userData.t -= 1; m.userData.z = -0.3 + Math.random() * 0.6; m.userData.y = 0.04 + Math.random() * 0.12; }
      const u = m.userData.t;
      m.position.set(-0.6 + u * 1.2, m.userData.y + Math.sin(u * 9 + m.userData.z * 20) * 0.012, m.userData.z + Math.sin(u * 5) * 0.02);
      m.rotation.set(0, 0, Math.cos(u * 9 + m.userData.z * 20) * 0.25);
      m.visible = this.gustMat.opacity > 0.02;
      m.scale.x = 0.6 + vis.wind * 0.5;
    }
    // Rain and snowfall.
    this.rain.material.opacity += (vis.rain * 0.55 - this.rain.material.opacity) * Math.min(1, dt * 2);
    this.rain.visible = this.rain.material.opacity > 0.02;
    if (this.rain.visible) {
      const a = this.rain.geometry.attributes.position.array;
      const slant = 0.02 + vis.wind * 0.03;
      this.rainData.forEach((r, i) => {
        r.y -= dt * 0.9;
        r.x += dt * vis.wind * 0.15;
        const ground = this.heights.at(Math.max(-0.5, Math.min(0.5, r.x)), r.z);
        if (r.y < ground || r.x > 0.52) { r.y = 0.3 + Math.random() * 0.08; r.x = (Math.random() - 0.5) * 1.0; r.z = (Math.random() - 0.5) * 0.66; }
        a.set([r.x, r.y, r.z, r.x - slant * 0.4, r.y + 0.018, r.z], i * 6);
      });
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
    this.flakes.material.opacity += (vis.snowfall * 0.95 - this.flakes.material.opacity) * Math.min(1, dt * 1.5);
    this.flakes.visible = this.flakes.material.opacity > 0.02;
    if (this.flakes.visible) {
      const a = this.flakes.geometry.attributes.position.array;
      this.snowData.forEach((f, i) => {
        f.y -= dt * 0.05;
        f.ph += dt;
        f.x += dt * (vis.wind * 0.03 + Math.sin(f.ph) * 0.01);
        const ground = this.heights.at(Math.max(-0.5, Math.min(0.5, f.x)), f.z);
        if (f.y < ground || f.x > 0.52) { f.y = 0.3 + Math.random() * 0.06; f.x = (Math.random() - 0.5) * 1.0; f.z = (Math.random() - 0.5) * 0.66; }
        a.set([f.x, f.y, f.z], i * 3);
      });
      this.flakes.geometry.attributes.position.needsUpdate = true;
    }
    // Turbines turn with the wind (storm: they shut down for a moment).
    for (const P of this.plots.values()) {
      const r = P.model?.userData.rotor;
      if (!r) continue;
      P.model.rotation.y = this.turbineYaw;
      const broken = P.model.userData.broken;
      const want = broken ? 0 : vis.cutout || vis.throttle ? 0.25 : 1.2 + 6.5 * Math.min(1.6, vis.wind);
      P.model.userData.spin += (want - P.model.userData.spin) * Math.min(1, dt * 1.2);
      r.rotation.z -= P.model.userData.spin * dt;
    }
    // Growing projects.
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      const back = 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2;
      a.g.scale.set(1, Math.max(0.01, back), 1);
      if (a.g.userData.rotor) {
        const kr = Math.min(1, Math.max(0, (a.t - a.dur * 0.6) / 0.4));
        a.g.userData.rotor.scale.setScalar(Math.max(0.01, kr) / Math.max(0.01, back));
      }
      if (k >= 1) {
        a.g.scale.set(1, 1, 1);
        a.g.userData.rotor?.scale.setScalar(1);
        this.anims.splice(i, 1);
      }
    }
    // Plot frames pulse while they are a good place for the chosen project.
    for (const P of this.plots.values()) {
      if (P.model) continue;
      const on = P.state === 'ok' || P.state === 'best' || P.state === 'hover';
      const pulse = P.state === 'hover' ? 0.9 : P.state === 'best' ? 0.55 + 0.35 * Math.sin(T * 5) : on ? 0.3 + 0.15 * Math.sin(T * 3 + P.pos.x * 10) : 0;
      P.glow.material.opacity += (pulse - P.glow.material.opacity) * Math.min(1, dt * 8);
      P.group.position.y = P.pos.y + (P.state === 'hover' ? 0.003 : 0);
    }
    // The AI map fades in and out.
    const o = this.overlayU.uOpacity;
    o.value += (this.overlayTarget - o.value) * Math.min(1, dt * 5);
    this.overlay.visible = o.value > 0.01;
    // Decoration (the lights go out in a power cut).
    if (vis.blackout) { if (this.bulbs) this.bulbs.visible = false; } else if (this.bulbs) { this.bulbs.visible = true; this.bulbs.userData.tick(T); }
    for (const f of this.festive.values()) { f.visible = !vis.blackout; if (f.visible) f.userData.tick(T); }
    this.updateLive(dt, vis);
    if (this.beam) {
      this.beam.rotation.y = T * 1.6;
      this.beamMat.opacity += (Math.min(0.32, vis.night * 0.4 + vis.storm * 0.3) - this.beamMat.opacity) * Math.min(1, dt * 2);
    }
    if (this.boat) {
      const a = T * 0.05;
      this.boat.position.set(0.41 + Math.cos(a) * 0.035, -0.006 + Math.sin(T * 2) * 0.001, 0.05 + Math.sin(a) * 0.12);
      this.boat.rotation.set(Math.sin(T * 1.7) * 0.06, -a + Math.PI / 2, Math.sin(T * 2.1) * 0.05);
    }
    this.updatePeople(dt);
  }

  // ---------- live events, wishes, bets ----------

  buildLive() {
    this.cheerUntil = { old: 0, river: 0, new: 0 };
    this.festive = new Map(); // district -> fairy lights after a fulfilled wish
    this.bubbles = new Map(); // district -> speech bubble sprite
    // The event marker: an icon over the place the warning is about (tap it to react).
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    this.marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
    this.marker.renderOrder = 22;
    this.marker.userData.canvas = c;
    this.marker.visible = false;
    this.markerHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false }));
    this.markerHalo.renderOrder = 21;
    this.markerHalo.visible = false;
    this.markerHit = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ visible: false }));
    this.markerHit.userData.noFit = true;
    this.markerHit.userData.interactive = false;
    this.markerHit.userData.label = 'warning';
    this.root.add(this.marker, this.markerHalo, this.markerHit);
    // Sandbags along the riverside quarter (a flood warning that was taken seriously).
    const bagGeo = new THREE.CapsuleGeometry(0.0022, 0.004, 3, 6).rotateZ(Math.PI / 2);
    const bags = [];
    for (let i = 0; i < 26; i++) {
      const x = -0.05 + i * 0.012;
      bags.push(bagGeo.clone().translate(x, 0.0055, -0.052), bagGeo.clone().translate(x + 0.006, 0.0095, -0.052));
    }
    this.sandbags = new THREE.Mesh(mergeGeometries(bags), new THREE.MeshStandardMaterial({ color: hex('xr-green-sand'), roughness: 0.95, envMapIntensity: 0.3 }));
    this.sandbags.castShadow = true;
    this.sandbags.visible = false;
    this.root.add(this.sandbags);
    // Smoke over damaged turbines.
    this.smoke = Array.from({ length: 8 }, () => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), color: hex('xr-green-smoke'), transparent: true, opacity: 0, depthWrite: false }));
      sp.userData.noFit = true;
      sp.userData.t = Math.random();
      this.root.add(sp);
      return sp;
    });
  }

  /** Where a warning points: over the turbines, the solar parks, the town or the river quarter. */
  liveSpot(type) {
    const of = (t) => [...this.plots.values()].filter((P) => P.type === t).map((P) => P.pos);
    const avg = (list, fallback) => (list.length ? list.reduce((a, b) => a.clone().add(b)).multiplyScalar(1 / list.length) : fallback);
    if (type === 'storm') return avg(of('wind'), new THREE.Vector3(-0.2, 0.1, -0.2)).add(new THREE.Vector3(0, 0.2, 0));
    if (type === 'heat') return avg(of('solar'), new THREE.Vector3(-0.25, 0.03, 0.2)).add(new THREE.Vector3(0, 0.12, 0));
    if (type === 'flood') return new THREE.Vector3(0.07, 0.1, -0.07);
    return new THREE.Vector3(0.12, 0.13, 0.16);
  }

  /** Shows the warning's icon over its place (null hides it); done: the player reacted. */
  showMarker(type, done = false) {
    const on = !!type;
    this.marker.visible = on;
    this.markerHalo.visible = on;
    this.markerHit.userData.interactive = on && !done;
    if (!on) return;
    const pos = this.liveSpot(type);
    this.marker.position.copy(pos);
    this.markerHalo.position.copy(pos);
    this.markerHit.position.copy(pos);
    this.markerType = type;
    const c = this.marker.userData.canvas;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    ctx.beginPath();
    ctx.arc(64, 64, 58, 0, Math.PI * 2);
    ctx.fillStyle = color('xr-panel-bg');
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = color(done ? 'xr-green-up' : 'xr-warning');
    ctx.stroke();
    drawIcon(ctx, LIVE[type].icon, 64, 64, 70, color(done ? 'xr-green-up' : LIVE[type].token));
    this.marker.material.map.needsUpdate = true;
    this.markerHalo.material.color.setHex(hex(done ? 'xr-green-up' : 'xr-warning'));
  }

  setFlood(level) { this.floodTarget = level; }

  setSandbags(on) { this.sandbags.visible = on; }

  /** A storm hit unthrottled turbines: up to two stop and smoke until the next year. */
  breakTurbines(n = 2) {
    const list = [...this.plots.values()].filter((P) => P.type === 'wind' && P.model && !P.model.userData.broken).slice(0, n);
    for (const P of list) P.model.userData.broken = true;
    return list.length;
  }

  repairTurbines() {
    for (const P of this.plots.values()) if (P.model) P.model.userData.broken = false;
  }

  /** Citizens' wishes as speech bubbles over the districts: [{ district, text, level, met }]. */
  setWishes(list) {
    const want = new Map((list ?? []).map((w) => [w.district, w]));
    for (const [k, b] of this.bubbles) {
      if (want.has(k)) continue;
      b.removeFromParent();
      b.material.map.dispose();
      b.material.dispose();
      this.bubbles.delete(k);
    }
    for (const [k, w] of want) {
      let b = this.bubbles.get(k);
      if (!b) {
        const c = document.createElement('canvas');
        c.width = 360;
        c.height = 150;
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        b = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
        b.renderOrder = 19;
        b.userData.canvas = c;
        b.userData.noFit = true;
        const D = DISTRICTS[k];
        b.userData.base = new THREE.Vector3(D.x, TOWN_Y + 0.085, D.z - 0.01);
        this.root.add(b);
        this.bubbles.set(k, b);
      }
      const key = `${w.text}|${w.level}|${w.met}`;
      b.userData.level = w.level;
      b.userData.met = w.met;
      if (b.userData.key === key) continue;
      b.userData.key = key;
      drawBubble(b.userData.canvas, w);
      b.material.map.needsUpdate = true;
      const s = 0.17 * (w.met ? 0.8 : 1 + (w.level - 1) * 0.14);
      b.scale.set(s, (s * 150) / 360, 1);
    }
  }

  /** A fulfilled wish: the district celebrates (people cheer, fairy lights stay up). */
  celebrate(k) {
    this.cheerUntil[k] = this.time + 6;
    if (this.festive.has(k)) return;
    const D = DISTRICTS[k];
    const pts = [];
    const n = 30;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const sag = Math.abs(Math.sin(a * 3)) * 0.004;
      pts.push(new THREE.Vector3(D.x + Math.cos(a) * 0.055, TOWN_Y + 0.03 - sag, D.z + Math.sin(a) * 0.05));
    }
    const lights = makeBulbs(pts, { size: 0.0014, halo: 0.012 });
    this.root.add(lights);
    this.festive.set(k, lights);
  }

  districtOf(f) {
    if (f.kind === 'play') {
      f.district = Object.entries(DISTRICTS).reduce((a, [k, D]) => (Math.hypot(f.cx - D.x, f.cz - D.z) < a.d ? { k, d: Math.hypot(f.cx - D.x, f.cz - D.z) } : a), { k: 'old', d: Infinity }).k;
      return f.district;
    }
    const [[ax, az], [bx, bz]] = f.s;
    const x = ax + (bx - ax) * f.t;
    const z = az + (bz - az) * f.t;
    let best = 'old';
    let bd = Infinity;
    for (const [k, D] of Object.entries(DISTRICTS)) { const d = Math.hypot(x - D.x, z - D.z); if (d < bd) { bd = d; best = k; } }
    return best;
  }

  updateLive(dt, vis) {
    const T = this.time;
    if (this.marker.visible) {
      const pulse = 1 + 0.12 * Math.sin(T * 8);
      this.marker.scale.setScalar(0.07 * pulse);
      this.markerHalo.scale.setScalar(0.16 * pulse);
      this.markerHalo.material.opacity = 0.35 + 0.25 * Math.sin(T * 8);
    }
    for (const b of this.bubbles.values()) {
      const lv = b.userData.level ?? 1;
      const shake = !b.userData.met && lv >= 3 ? Math.sin(T * 30) * 0.002 : 0;
      b.position.copy(b.userData.base);
      b.position.x += shake;
      b.position.y += Math.sin(T * 2 + b.userData.base.x * 20) * 0.003;
    }
    // Flood: the water rises over the river banks.
    this.flood += (this.floodTarget - this.flood) * Math.min(1, dt * 1.5);
    if (this.water) this.water.position.y = this.flood;
    // Smoke over broken turbines.
    const broken = [...this.plots.values()].filter((P) => P.model?.userData.broken);
    this.smoke.forEach((sp, i) => {
      const P = broken[i % Math.max(1, broken.length)];
      if (!P) { sp.material.opacity = 0; return; }
      sp.userData.t = (sp.userData.t + dt * 0.5) % 1;
      const u = sp.userData.t;
      const top = P.pos.clone().add(new THREE.Vector3(0.005 + u * 0.02, (this.hubPos.y + 0.004) * 1.25 + u * 0.05, 0));
      sp.position.copy(top);
      sp.scale.setScalar(0.01 + u * 0.03);
      sp.material.opacity = 0.6 * (1 - u);
    });
  }

  /** Clears the sky at once (clouds, rain, snowfall), e.g. behind the results. */
  clearSky() {
    for (const c of this.clouds) { c.userData.k = 0; c.scale.setScalar(0.001); }
    this.rain.material.opacity = 0;
    this.flakes.material.opacity = 0;
    this.gustMat.opacity = 0;
  }

  /** Shadow maps back off; the shared radial texture stays. */
  dispose(renderer) {
    renderer.shadowMap.enabled = false;
    this.fieldTex.dispose();
  }
}

/** A citizen's speech bubble: louder (warmer color, capitals) the longer the wish is ignored. */
function drawBubble(canvas, { text, level, met }) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const tok = met ? 'xr-green-up' : ['xr-green-social', 'xr-warning', 'xr-danger'][Math.min(2, level - 1)];
  ctx.beginPath();
  ctx.roundRect(6, 6, W - 12, H - 40, 30);
  ctx.moveTo(W * 0.42, H - 35);
  ctx.lineTo(W * 0.36, H - 6);
  ctx.lineTo(W * 0.54, H - 35);
  ctx.fillStyle = color(met ? 'xr-panel-bg' : 'xr-green-bubble');
  ctx.fill();
  ctx.lineWidth = 6 + (level - 1) * 2;
  ctx.strokeStyle = color(tok);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color(met ? 'xr-green-up' : 'xr-green-bubble-text');
  // One or two lines, as large as fits.
  const words = String(text).split(' ');
  let px = 40;
  let lines = [text];
  for (; px >= 22; px -= 2) {
    ctx.font = font('black', px);
    if (ctx.measureText(text).width <= W - 40) { lines = [text]; break; }
    let best = null;
    for (let k = 1; k < words.length; k++) {
      const l = [words.slice(0, k).join(' '), words.slice(k).join(' ')];
      const w = Math.max(...l.map((x) => ctx.measureText(x).width));
      if (!best || w < best.w) best = { l, w };
    }
    if (best && best.w <= W - 40 && px * 2.3 <= H - 46) { lines = best.l; break; }
  }
  ctx.font = font('black', px);
  const cy = (H - 34) / 2 + 3;
  lines.forEach((l, i) => ctx.fillText(l, W / 2, cy + (i - (lines.length - 1) / 2) * px * 1.1));
}

/** A value tag over a plot: a pill with the forecast (big) and a unit or note (small). */
function drawTag(canvas, { text, sub, token, strong }) {
  const ctx = canvas.getContext('2d');
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  ctx.beginPath();
  ctx.roundRect(4, 4, W - 8, H - 18, 22);
  ctx.fillStyle = color('xr-panel-bg');
  ctx.fill();
  ctx.lineWidth = strong ? 7 : 4;
  ctx.strokeStyle = color(token);
  ctx.stroke();
  // A little pointer down to the plot.
  ctx.beginPath();
  ctx.moveTo(W / 2 - 10, H - 15);
  ctx.lineTo(W / 2, H - 3);
  ctx.lineTo(W / 2 + 10, H - 15);
  ctx.closePath();
  ctx.fillStyle = color(token);
  ctx.fill();
  ctx.textBaseline = 'middle';
  const cy = (H - 14) / 2 + 3;
  ctx.font = font('black', 36);
  const tw = ctx.measureText(text).width;
  ctx.font = font('bold', 22);
  const sw = sub ? ctx.measureText(sub).width + 8 : 0;
  const scale = Math.min(1, (W - 26) / (tw + sw));
  ctx.save();
  ctx.translate(W / 2, cy);
  ctx.scale(scale, scale);
  ctx.textAlign = 'left';
  ctx.fillStyle = color('xr-panel-text');
  ctx.font = font('black', 36);
  ctx.fillText(text, -(tw + sw) / 2, 0);
  if (sub) {
    ctx.font = font('bold', 22);
    ctx.fillStyle = color('xr-panel-muted');
    ctx.fillText(sub, -(tw + sw) / 2 + tw + 8, 2);
  }
  ctx.restore();
}
