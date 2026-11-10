// Winter (SEASON in config.js): snow for the Echo Parkour and the AI Arena.
//   makeSnowfall   snow falling in the room around the player (also in AR, over the real room).
//                  Fully on the GPU: every flake falls, sways, lands on the floor (or on a table
//                  top), stays there for a while and melts away, then starts again at the top.
//   makeSnowCover  a snow cover on the floor that grows while it snows. How much snow has
//                  settled is kept for the session, so it is still there in the next round.
//   winterize      snow on the upward faces of a material (patchy, sparkling, thicker over time).
//   makeStageSnow  small flakes inside the parkour stage (course units) that land and stay on
//                  the islands and roofs; denser, with wind, in the forest's snowstorm.
// All colors from the --xr-snow-* tokens.
import * as THREE from 'three';
import { hex } from './tokens.js';
import { SEASON } from './config.js';
import { quality } from './quality.js';

export const WINTER = SEASON === 'christmas' || SEASON === 'winter';

// ---------- how much snow has settled (this session) ----------

let settled = 0.3;
/** 0..1: grows while it snows (about a minute from a light dusting to fully covered). */
export const snowSettled = () => settled;

// ---------- snow on materials ----------

const snowUniforms = {
  uSnowAmount: { value: 0.6 },
  uSnowColor: { value: new THREE.Color() },
  uSnowTime: { value: 0 },
};
let snowBase = null;
const baseColor = () => (snowBase ??= new THREE.Color(hex('xr-snow')));

/** How far the snow reaches down the slopes (0: only flat tops, 1: thick everywhere). */
export function setSnowAmount(v) { snowUniforms.uSnowAmount.value = THREE.MathUtils.clamp(v, 0, 1); }

/** Multiplies the snow color (the city's night darkens the snow like the walls). */
export function setSnowTint(c) { snowUniforms.uSnowColor.value.copy(baseColor()).multiply(c); }
setSnowTint(new THREE.Color(1, 1, 1));

const SNOW_PARS = /* glsl */ `
uniform float uSnowAmount;
uniform vec3 uSnowColor;
uniform float uSnowTime;
varying vec3 vSnowN;
varying vec3 vSnowP;
float snowHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float snowNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(snowHash(i), snowHash(i + vec3(1, 0, 0)), f.x), mix(snowHash(i + vec3(0, 1, 0)), snowHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(snowHash(i + vec3(0, 0, 1)), snowHash(i + vec3(1, 0, 1)), f.x), mix(snowHash(i + vec3(0, 1, 1)), snowHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
`;

/**
 * Snow on the upward faces of a MeshStandardMaterial (patched shader, shared uniforms). The
 * pattern sticks to the object (it scrolls with the course), the vertex colors (baked ambient
 * occlusion) shade it, and a few crystals glint. Does nothing outside winter.
 */
export function winterize(mat) {
  if (!WINTER || !mat?.isMeshStandardMaterial || mat.userData.snow) return mat;
  mat.userData.snow = true;
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey;
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer);
    Object.assign(shader.uniforms, snowUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSnowN;\nvarying vec3 vSnowP;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 snowN = objectNormal;
        vec4 snowP = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          snowN = mat3(instanceMatrix) * snowN;
          snowP = instanceMatrix * snowP;
        #endif
        vSnowN = normalize(mat3(modelMatrix) * snowN);
        vSnowP = snowP.xyz * length(modelMatrix[0].xyz);`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${SNOW_PARS}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float snowS = 0.0;
        float snowN1 = snowNoise(vSnowP * 40.0);
        {
          float up = normalize(vSnowN).y;
          float lo = mix(0.9, 0.38, uSnowAmount);
          snowS = smoothstep(lo, lo + 0.2, up + (snowN1 - 0.5) * 0.5) * smoothstep(0.0, 0.12, uSnowAmount);
          float ao = 1.0;
          #if defined( USE_COLOR_ALPHA ) || defined( USE_COLOR )
            ao = clamp(max(vColor.r, max(vColor.g, vColor.b)), 0.0, 1.0);
          #endif
          vec3 snowCol = uSnowColor * mix(0.62, 1.0, pow(ao, 0.8)) * (0.93 + 0.07 * snowN1);
          diffuseColor.rgb = mix(diffuseColor.rgb, snowCol, snowS);
        }`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.9, snowS);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.0, snowS);')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance *= 1.0 - 0.85 * snowS;
        {
          float g = snowHash(floor(vSnowP * 260.0));
          totalEmissiveRadiance += uSnowColor * snowS * step(0.986, g) * pow(0.5 + 0.5 * sin(uSnowTime * 2.5 + g * 60.0), 8.0) * 0.9;
        }`);
  };
  mat.customProgramCacheKey = () => `${prevKey ? prevKey.call(mat) : ''}|snow`;
  mat.needsUpdate = true;
  return mat;
}

/** winterize() for every standard material under root (except names in `skip`). */
export function winterizeTree(root, skip = []) {
  if (!WINTER) return;
  root.traverse((o) => {
    if (!o.isMesh) return;
    [].concat(o.material).forEach((m) => { if (!skip.includes(m.name)) winterize(m); });
  });
}

// ---------- flakes ----------

let flakeTex = null;
/** A soft round flake with a bright core. */
function flakeTexture() {
  if (flakeTex) return flakeTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  flakeTex = new THREE.CanvasTexture(c);
  return flakeTex;
}

/**
 * A PointsMaterial (so three.js sizes the flakes correctly in the headset too) whose vertex
 * shader computes each flake's position (body: GLSL that sets `vec3 transformed` and vAlpha).
 */
function flakeMaterial({ size, pars = '', body, uniforms = {} }) {
  const mat = new THREE.PointsMaterial({
    color: hex('xr-snow-flake'), map: flakeTexture(), size, sizeAttenuation: true,
    transparent: true, depthWrite: false, toneMapped: false, fog: false,
  });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float aSize;\nvarying float vAlpha;\n${pars}`)
      .replace('#include <begin_vertex>', body)
      .replace('gl_PointSize = size;', 'gl_PointSize = size * aSize;\n  vAlpha *= smoothstep(0.12, 0.4, -mvPosition.z); // no big blobs right in front of the eyes')
      .replace('#include <fog_vertex>', 'gl_PointSize = min(gl_PointSize, 56.0);\n#include <fog_vertex>');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAlpha;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.a *= vAlpha;\n  if (diffuseColor.a < 0.01) discard;');
  };
  mat.customProgramCacheKey = () => `flake|${body.length}`;
  return mat;
}

const ROOM_PARS = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform vec4 uBox;
uniform float uTop;
uniform float uFloor;
uniform vec4 uDisc;
uniform vec4 uHole;
uniform float uHoleTop;
uniform float uFall;
uniform float uRest;
uniform float uDensity;
uniform vec2 uWind;
float flakeHash(float n) { return fract(sin(n) * 43758.5453123); }
vec2 flakeDrift(float t, vec4 s) {
  return vec2(sin(t * 1.3 + s.z * 31.0), cos(t * 1.1 + s.x * 23.0)) * (0.05 + 0.05 * s.w);
}
`;

const ROOM_BODY = /* glsl */ `
  float speed = uFall * (0.7 + 0.6 * aSeed.w);
  float fallT = (uTop - uFloor) / speed;
  float period = fallT + uRest;
  float tt = uTime + aSeed.z * period;
  float cycle = floor(tt / period);
  float local = tt - cycle * period;
  // A new place for every fall.
  vec2 start = mix(uBox.xy, uBox.zw, vec2(flakeHash(aSeed.x * 97.31 + cycle * 1.731), flakeHash(aSeed.y * 51.17 + cycle * 2.113)));
  vec2 xz = start + uWind * fallT + flakeDrift(fallT, aSeed);
  // It lands on the table top (fight arena) or on the floor.
  float ground = uFloor;
  if (uDisc.z > 0.0 && distance(xz, uDisc.xy) < uDisc.z) ground = uDisc.w;
  float landT = (uTop - ground) / speed;
  float tf = min(local, landT);
  xz = start + uWind * tf + flakeDrift(tf, aSeed);
  float y = uTop - speed * tf;
  vec3 transformed = vec3(xz.x, y + 0.004, xz.y);
  vAlpha = smoothstep(0.0, 0.7, local);
  // Lying on the ground it stays for a while, then melts away.
  float rest = period - landT;
  vAlpha *= 1.0 - smoothstep(rest * 0.5, rest, local - landT);
  vec2 edge = min(xz - uBox.xy, uBox.zw - xz);
  vAlpha *= smoothstep(0.0, 0.4, min(edge.x, edge.y));
  // The parkour stage has its own small snow: room flakes vanish where they would enter it.
  if (uHole.z > uHole.x) {
    vec2 hd = max(uHole.xy - xz, xz - uHole.zw);
    vAlpha *= smoothstep(-0.01, 0.04, max(max(hd.x, hd.y), y - uHoleTop));
  }
  // Only a part of the flakes is out when it snows lightly.
  vAlpha *= 1.0 - smoothstep(uDensity - 0.06, uDensity, fract(aSeed.x * 7.13 + aSeed.y * 3.71));
`;

/**
 * Snow in the room (local space of the scene group, meters). box: [x0, z0, x1, z1] footprint.
 * Call setGround(floorY) every frame (the real floor can move), update(dt) for the time.
 * Optional: setDisc(x, z, r, y) a table top flakes land on, setHole(x0, z0, x1, z1, top) a box
 * (down to the floor) the room snow keeps out of.
 */
export function makeSnowfall({ box = [-2.6, -3.2, 2.6, 1.8], count, height = 2.7, fall = 0.5, rest = 5, size = 0.022, wind = [0.04, 0.01], density = 0.8 } = {}) {
  const n = count ?? (quality.lite ? 900 : 2200);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const seed = new Float32Array(n * 4);
  const sizes = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    seed.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    sizes[i] = 0.6 + Math.random() * Math.random() * 1.1;
  }
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  const uniforms = {
    uTime: { value: Math.random() * 100 },
    uBox: { value: new THREE.Vector4(...box) },
    uTop: { value: height },
    uFloor: { value: 0 },
    uDisc: { value: new THREE.Vector4(0, 0, 0, 0) },
    uHole: { value: new THREE.Vector4(0, 0, 0, 0) },
    uHoleTop: { value: 0 },
    uFall: { value: fall },
    uRest: { value: rest },
    uDensity: { value: density },
    uWind: { value: new THREE.Vector2(...wind) },
  };
  const points = new THREE.Points(geo, flakeMaterial({ size, pars: ROOM_PARS, body: ROOM_BODY, uniforms }));
  points.frustumCulled = false;
  points.userData.noFit = true;
  points.renderOrder = 2;
  return {
    points,
    uniforms,
    setGround(floorY) {
      uniforms.uFloor.value = floorY;
      uniforms.uTop.value = floorY + height;
    },
    setDisc(x, z, r, y) { uniforms.uDisc.value.set(x, z, r, y); },
    setHole(x0, z0, x1, z1, top) { uniforms.uHole.value.set(x0, z0, x1, z1); uniforms.uHoleTop.value = top; },
    set density(v) { uniforms.uDensity.value = v; },
    update(dt) {
      uniforms.uTime.value += dt;
      snowUniforms.uSnowTime.value += dt;
      settled = Math.min(1, settled + dt / 75);
    },
  };
}

// ---------- the snow cover on the floor ----------

let noiseTex = null;
/** Smooth value noise (4 octaves) for the cover's patches; it tiles without seams. */
function coverNoise() {
  if (noiseTex) return noiseTex;
  const S = 256;
  const lattice = (k) => { const g = new Float32Array(k * k); for (let i = 0; i < g.length; i++) g[i] = Math.random(); return g; };
  const octaves = [[8, 0.5], [16, 0.27], [32, 0.15], [64, 0.08]].map(([k, w]) => ({ k, w, g: lattice(k) }));
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let v = 0;
      for (const { k, w, g } of octaves) {
        const fx = (x / S) * k;
        const fy = (y / S) * k;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        let tx = fx - ix;
        let ty = fy - iy;
        tx = tx * tx * (3 - 2 * tx);
        ty = ty * ty * (3 - 2 * ty);
        const at = (a, b) => g[(b % k) * k + (a % k)];
        v += w * ((at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx) * (1 - ty) + (at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx) * ty);
      }
      data[(y * S + x) * 4] = Math.round(THREE.MathUtils.clamp(v, 0, 1) * 255);
      data[(y * S + x) * 4 + 3] = 255;
    }
  }
  noiseTex = new THREE.DataTexture(data, S, S);
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
  noiseTex.magFilter = THREE.LinearFilter;
  noiseTex.minFilter = THREE.LinearMipmapLinearFilter;
  noiseTex.generateMipmaps = true;
  noiseTex.needsUpdate = true;
  return noiseTex;
}

/**
 * A round snow cover on the floor around (x, z): patches first, a closed white cover once
 * enough has settled. setGround(floorY) every frame, update() follows snowSettled().
 */
export function makeSnowCover({ x = 0, z = -0.6, radius = 1.7 } = {}) {
  const uniforms = {
    uNoise: { value: coverNoise() },
    uAmount: { value: settled },
    uColor: { value: new THREE.Color(hex('xr-snow')) },
    uShade: { value: new THREE.Color(hex('xr-snow-shade')) },
    uTime: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */ `
      uniform sampler2D uNoise;
      uniform float uAmount;
      uniform vec3 uColor;
      uniform vec3 uShade;
      uniform float uTime;
      varying vec2 vUv;
      float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      void main() {
        float n = texture2D(uNoise, vUv).r;
        float n2 = texture2D(uNoise, vUv * 2.7 + 0.31).r;
        float r = length(vUv - 0.5) * 2.0;
        // Drifts: more snow towards the middle, gaps where the noise is low, a ragged edge.
        float field = n * 0.65 + n2 * 0.35 + (1.0 - r) * 0.35 - 0.1;
        float th = 1.0 - uAmount * 0.62;
        float a = smoothstep(th - 0.025, th + 0.025, field) * (1.0 - smoothstep(0.7, 1.0, r + (n2 - 0.5) * 0.3));
        float deep = smoothstep(th, th + 0.25, field);
        vec3 col = mix(uShade, uColor, 0.4 + 0.6 * deep);
        float g = h21(floor(vUv * 420.0));
        col += vec3(step(0.993, g) * pow(0.5 + 0.5 * sin(uTime * 2.6 + g * 300.0), 6.0) * deep);
        gl_FragColor = vec4(col, a * (0.5 + 0.42 * deep));
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 72), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0, z);
  mesh.renderOrder = 1;
  mesh.userData.noFit = true;
  mesh.frustumCulled = false;
  return {
    mesh,
    setGround(floorY) { mesh.position.y = floorY + 0.004; },
    update(dt) {
      uniforms.uTime.value += dt;
      uniforms.uAmount.value = settled;
    },
  };
}

// ---------- snow inside the parkour stage (course units) ----------

const STAGE_BODY = /* glsl */ `
  vec3 transformed = vec3(position);
  vAlpha = aAlpha;
`;

/**
 * Small flakes in the parkour stage window (course units, a child of the course). They fall
 * from the top of the sky picture, sway and drift with the wind, land on whatever surface is
 * below (surfaceAt(x, y, z) gives its top) and stay there a few seconds while the course
 * scrolls on. update(dt, camX, half, { density, wind, edge }) every frame.
 */
export function makeStageSnow({ count, top, bottom, zMin, zMax, surfaceAt, size = 0.024 }) {
  const n = count ?? (quality.lite ? 160 : 420);
  const pos = new Float32Array(n * 3);
  const alpha = new Float32Array(n);
  const sizes = new Float32Array(n);
  const f = Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0, v: 0, ph: Math.random() * 10, rest: -1, restFor: 0, on: false }));
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  for (let i = 0; i < n; i++) sizes[i] = 0.6 + Math.random() * Math.random() * 1.2;
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  const points = new THREE.Points(geo, flakeMaterial({ size, pars: 'attribute float aAlpha;', body: STAGE_BODY }));
  points.frustumCulled = false;
  points.userData.noFit = true;
  points.renderOrder = 2;
  let time = 0;
  const spawn = (p, camX, half, anywhere) => {
    p.x = camX + (Math.random() * 2 - 1) * (half + 1.5);
    p.y = anywhere ? bottom + Math.random() * (top - bottom) : top + Math.random() * 0.6;
    p.z = zMin + Math.random() * (zMax - zMin);
    p.v = 1.7 + Math.random() * 1.3;
    p.rest = -1;
  };
  let first = true;
  return {
    points,
    update(dt, camX, half, { density = 0.7, wind = 0.3, edge = () => 1 } = {}) {
      time += dt;
      const active = Math.round(n * density);
      for (let i = 0; i < n; i++) {
        const p = f[i];
        if (first) { p.on = i < active; spawn(p, camX, half, true); }
        if (!p.on) {
          if (i >= active) { alpha[i] = 0; continue; }
          p.on = true;
          spawn(p, camX, half, false);
        }
        let a = 1;
        if (p.rest >= 0) {
          // Lying on an island or a roof: it scrolls away with the course and melts after a while.
          p.rest += dt;
          a = 1 - THREE.MathUtils.smoothstep(p.rest, p.restFor * 0.6, p.restFor);
          if (p.rest > p.restFor) { if (i >= active) { p.on = false; alpha[i] = 0; continue; } spawn(p, camX, half, false); a = 0; }
        } else {
          p.y -= p.v * dt;
          p.x += (wind * (0.7 + 0.3 * Math.sin(p.ph)) + Math.sin(time * 1.6 + p.ph) * 0.35) * dt;
          p.z += Math.cos(time * 1.2 + p.ph * 1.7) * 0.15 * dt;
          const ground = surfaceAt(p.x, p.y + p.v * dt, p.z);
          if (p.y <= ground) {
            p.y = ground + 0.04;
            p.rest = 0;
            p.restFor = 3 + Math.random() * 4;
          }
          a = THREE.MathUtils.smoothstep(top + 0.6 - p.y, 0, 1.2);
        }
        const wx = p.x - camX;
        if (Math.abs(wx) > half + 2) { spawn(p, camX, half, false); a = 0; }
        alpha[i] = a * edge(wx);
        pos[i * 3] = p.x;
        pos[i * 3 + 1] = p.y;
        pos[i * 3 + 2] = p.z;
      }
      first = false;
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aAlpha.needsUpdate = true;
    },
  };
}
