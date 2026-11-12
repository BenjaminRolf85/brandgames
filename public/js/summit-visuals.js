// "Gipfelgespräch" visuals: the rock face from Blender (blender/build_summit.py) with its holds,
// quickdraws and the rope, Echo climbing in a harness, the customer waiting at the summit, the
// summit flag and (Christmas) the summit cross with fairy lights, snowy peaks rising out of a
// sea of clouds and a dusk sky. All colors come from the --xr-summit-* tokens.
import * as THREE from 'three';
import { hex, color, font } from './tokens.js';
import { Panel } from './ui3d.js';
import { loadGLTF } from './models.js';
import { radialTexture } from './robot-visuals.js';
import { loadEchoParts, bendWing } from './echo-mascot.js';
import { EchoFace } from './echo-face.js';
import { winterize } from './snow.js';
import { CHRISTMAS, makeBulbs, makeTree } from './christmas.js';
import { drawIcon } from './icons.js';
import { quality } from './quality.js';
import { gfxTier } from './gfx.js';

export const SUMMIT_URL = 'assets/models/summit.glb';
export const CUSTOMER_URL = 'assets/models/summit-customer.glb';
export const STEP = 0.24; // one section of the wall (must match build_summit.py)
export const SECTIONS = 5;
export const TOP = STEP * SECTIONS; // the summit plateau (wall-local y)
export const PLATEAU_Y = TOP + 0.045; // top of the snow on the plateau
/** Bolts with a quickdraw: one per section, alternating (build_summit.py). */
export const BOLTS = Array.from({ length: SECTIONS }, (_, k) => new THREE.Vector2(k % 2 === 0 ? 0.14 : -0.14, k * STEP + 0.13));
const clamp = THREE.MathUtils.clamp;
const col = (token) => new THREE.Color(hex(token));

export function loadSummitModels() {
  return Promise.all([loadGLTF(SUMMIT_URL), loadGLTF(CUSTOMER_URL)]).then(([wall, cust]) => ({ wall, cust }));
}

// ---------- shader patch: rock grain and the cut at the sea of clouds ----------

/** World height below which the mountains vanish into the clouds (shared by all patched materials). */
export const cutUniform = { value: -100 };

/**
 * Patches a standard material: fragments below the cloud line are dropped (the wall and the
 * peaks rise out of the sea of clouds), plus optional detail, all computed in the shader (no
 * textures, no extra draw calls):
 *   grain   fine rock texture and strata in the color (object space)
 *   bump    a noise relief on the normal; octaves 2 adds a finer second layer
 *   tint    large warm and dark patches, so the rock is not one flat color
 *   cracks  thin dark fissures
 *   snowCap snow on every face that looks up (the distant peaks)
 *   haze    distance haze toward the sky and mist above the sea of clouds
 */
const hazeUniforms = {
  uHaze: { value: new THREE.Color() },
  uWarm: { value: new THREE.Color() },
  uDark: { value: new THREE.Color() },
  uSnowCap: { value: new THREE.Color() },
  uMist: { value: new THREE.Color() },
  uHazeAmt: { value: 1 },
};
/** Distance haze on or off (off in AR, where the real room is behind the peaks). */
export function setRockHaze(on) { hazeUniforms.uHazeAmt.value = on ? 1 : 0; }
function refreshRockColors() {
  hazeUniforms.uHaze.value.set(hex('xr-summit-haze'));
  hazeUniforms.uWarm.value.set(hex('xr-summit-rock-warm'));
  hazeUniforms.uDark.value.set(hex('xr-summit-rock-dark'));
  hazeUniforms.uSnowCap.value.set(hex('xr-summit-peak-snow'));
  hazeUniforms.uMist.value.set(hex('xr-summit-cloud-shade')).lerp(col('xr-summit-cloud'), 0.45);
}

function patchRock(mat, { grain = 0, bump = 0, octaves = 1, tint = 0, cracks = 0, snowCap = 0, haze = 0, mist = 0, hazeNear = 2.5, hazeFar = 9 } = {}) {
  refreshRockColors();
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, r) => {
    prev?.call(mat, shader, r);
    shader.uniforms.uCutY = cutUniform;
    Object.assign(shader.uniforms, hazeUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRockW;\nvarying vec3 vGrainP;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vec4 cutP = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          cutP = instanceMatrix * cutP;
        #endif
        vGrainP = cutP.xyz;
        vRockW = (modelMatrix * cutP).xyz;`);
    const f = (x) => x.toFixed(3);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uCutY;
        uniform vec3 uHaze; uniform vec3 uWarm; uniform vec3 uDark; uniform vec3 uSnowCap; uniform vec3 uMist; uniform float uHazeAmt;
        varying vec3 vRockW;
        varying vec3 vGrainP;
        float grainHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float grainNoise(vec3 x) {
          vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(grainHash(i), grainHash(i + vec3(1, 0, 0)), f.x), mix(grainHash(i + vec3(0, 1, 0)), grainHash(i + vec3(1, 1, 0)), f.x), f.y),
                     mix(mix(grainHash(i + vec3(0, 0, 1)), grainHash(i + vec3(1, 0, 1)), f.x), mix(grainHash(i + vec3(0, 1, 1)), grainHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
        }`)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vRockW.y < uCutY) discard;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        ${bump > 0 ? `{
          // Rough rock: the normal follows a noise relief (object space, good enough for a bump).
          vec3 bp = vGrainP * ${octaves > 1 ? '22.0' : '30.0'};
          float b0 = grainNoise(bp);
          vec3 bg = vec3(grainNoise(bp + vec3(0.12, 0.0, 0.0)), grainNoise(bp + vec3(0.0, 0.12, 0.0)), grainNoise(bp + vec3(0.0, 0.0, 0.12))) - b0;
          ${octaves > 1 ? `
          vec3 bq = vGrainP * 95.0;
          float c0 = grainNoise(bq);
          bg += 0.45 * (vec3(grainNoise(bq + vec3(0.12, 0.0, 0.0)), grainNoise(bq + vec3(0.0, 0.12, 0.0)), grainNoise(bq + vec3(0.0, 0.0, 0.12))) - c0);` : ''}
          bg = (viewMatrix * vec4(bg, 0.0)).xyz;
          normal = normalize(normal - ${f(bump)} * (bg - dot(bg, normal) * normal) / 0.12);
        }` : ''}
        ${snowCap > 0 ? `{
          // Snow settles on every face that looks up.
          vec3 wN = normalize((vec4(normal, 0.0) * viewMatrix).xyz);
          float sc = smoothstep(0.66, 0.82, wN.y + (grainNoise(vGrainP * 9.0) - 0.5) * 0.3);
          diffuseColor.rgb = mix(diffuseColor.rgb, uSnowCap, sc * ${f(snowCap)});
        }` : ''}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        ${grain > 0 ? `{
          float g = grainNoise(vGrainP * 38.0) * 0.6 + grainNoise(vGrainP * 110.0) * 0.4;
          float strata = 0.5 + 0.5 * sin(vGrainP.y * 70.0 + grainNoise(vGrainP * 6.0) * 6.0);
          diffuseColor.rgb *= 1.0 - ${f(grain)} * (0.55 - g) - 0.06 * strata;
        }` : ''}
        ${tint > 0 ? `{
          // Large patches: warmer rock and darker, weathered rock.
          float big = grainNoise(vGrainP * 3.5 + vec3(4.1, 0.0, 1.3));
          float mid = grainNoise(vGrainP * 9.0 + vec3(1.7, 2.9, 0.4));
          diffuseColor.rgb = mix(diffuseColor.rgb, uWarm, smoothstep(0.42, 0.78, big) * ${f(tint)});
          diffuseColor.rgb = mix(diffuseColor.rgb, uDark, smoothstep(0.5, 0.85, mid) * ${f(tint * 0.75)});
        }` : ''}
        ${cracks > 0 ? `{
          // Long, mostly vertical fissures, only here and there.
          float cn = grainNoise(vGrainP * vec3(16.0, 3.5, 16.0) + vec3(0.0, 7.3, 0.0));
          float crack = 1.0 - smoothstep(0.0, 0.022, abs(cn - 0.5));
          crack *= smoothstep(0.5, 0.7, grainNoise(vGrainP * 5.0 + vec3(3.1, 0.0, 8.2)));
          diffuseColor.rgb *= 1.0 - ${f(cracks)} * crack;
        }` : ''}`)
      .replace('#include <tonemapping_fragment>', `${haze > 0 || mist > 0 ? `{
          // Distance haze toward the sky, and mist just above the sea of clouds.
          float hz = smoothstep(${f(hazeNear)}, ${f(hazeFar)}, length(vRockW - cameraPosition)) * ${f(haze)} * uHazeAmt;
          float ms = (1.0 - smoothstep(uCutY, uCutY + 0.34, vRockW.y)) * ${f(mist)};
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, clamp(hz, 0.0, 1.0));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uMist, clamp(ms * ms * (3.0 - 2.0 * ms), 0.0, 1.0));
        }` : ''}
        #include <tonemapping_fragment>`);
  };
  const key = [grain, bump, octaves, tint, cracks, snowCap, haze, mist, hazeNear, hazeFar].join('|');
  mat.customProgramCacheKey = () => `summit-rock|${key}`;
  mat.needsUpdate = true;
  return mat;
}

/** Rock detail by what the device can afford (gfxTier) and the effects setting. */
function rockDetail() {
  const tier = gfxTier();
  if (quality.lite || tier === 'low') return { bump: 0, octaves: 1, cracks: 0 };
  return tier === 'high' ? { bump: 0.42, octaves: 2, cracks: 0.4 } : { bump: 0.22, octaves: 1, cracks: 0 };
}

const std = (token, roughness, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color: hex(token), roughness, metalness, vertexColors: true, ...extra });

/** Token materials for summit.glb (fresh set per call). */
function wallMaterials() {
  const d = rockDetail();
  const rockOpts = { grain: 0.35, bump: d.bump, octaves: d.octaves, tint: 0.4, cracks: d.cracks, mist: 0.7 };
  const rock = patchRock(std('xr-summit-rock', 0.93), rockOpts);
  const rockAlt = patchRock(std('xr-summit-rock-alt', 0.93), rockOpts);
  const snow = patchRock(std('xr-summit-snow', 0.75), { mist: 0.7 });
  // Christmas: snow catches on every ledge and bump (snow.js); the snow pillows stay as they are.
  winterize(rock);
  winterize(rockAlt);
  return {
    SummitRock: rock,
    SummitRockAlt: rockAlt,
    SummitSnow: snow,
    SummitMetal: patchRock(std('xr-summit-metal', 0.3, 0.9), { mist: 0.7 }),
    SummitSling: std('xr-summit-sling', 0.6),
    SummitHoldBolt: std('xr-summit-hold-bolt', 0.35, 0.8),
    SummitPole: std('xr-summit-pole', 0.3, 0.8),
    SummitGold: std('xr-summit-gold', 0.25, 1, { emissive: hex('xr-summit-gold'), emissiveIntensity: 0.18 }),
    SummitWood: std('xr-summit-wood', 0.7),
    // The distant peaks: snow on every upward face, haze with distance, mist at their feet.
    SummitPeakRock: patchRock(std('xr-summit-peak-rock', 0.95, 0, { flatShading: true }), { grain: 0.3, tint: 0.15, snowCap: 0.9, haze: 0.22, mist: 0.95 }),
    SummitPeakSnow: patchRock(std('xr-summit-peak-snow', 0.8, 0, { flatShading: true }), { haze: 0.22, mist: 0.95 }),
    SummitHarnessWeb: std('xr-summit-harness', 0.6),
    SummitHarnessMetal: std('xr-summit-harness-metal', 0.25, 0.9),
    SummitHarnessBag: std('xr-summit-chalkbag', 0.75),
  };
}

function cloneNode(gltf, name, mats) {
  const src = gltf?.scene.getObjectByName(name);
  if (!src) return null;
  const obj = src.clone(true);
  obj.position.set(0, 0, 0);
  obj.traverse((o) => {
    if (!o.isMesh) return;
    o.material = mats[o.material.name] ?? o.material;
    o.castShadow = true;
    o.receiveShadow = true;
  });
  return obj;
}

// ---------- the mountain ----------

/** The rock face with the summit cap: { group (wall-local space), wall (mesh to raycast), mats }. */
export function makeMountain(gltf) {
  const mats = wallMaterials();
  const group = new THREE.Group();
  group.userData.noFit = true;
  const wall = cloneNode(gltf, 'SummitWall', mats);
  const peak = cloneNode(gltf, 'SummitPeak', mats);
  for (const o of [wall, peak]) if (o) group.add(o);
  // The quickdraws hang on the bolts.
  for (const b of BOLTS) {
    const qd = cloneNode(gltf, 'SummitQuickdraw', mats);
    if (!qd) continue;
    qd.position.set(b.x, b.y - 0.012, surfaceZ(wall, b.x, b.y - 0.012) + 0.012);
    qd.rotation.z = (Math.random() - 0.5) * 0.2;
    group.add(qd);
  }
  return { group, wall, mats };
}

const _ray = new THREE.Raycaster();
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
/** Depth of the wall's front surface at (x, y) in the space of the wall's parent (wall-local). */
export function surfaceZ(wall, x, y) {
  if (!wall) return 0;
  const parent = wall.parent;
  parent?.updateMatrixWorld(true);
  wall.updateMatrixWorld(true);
  const M = parent ? parent.matrixWorld : new THREE.Matrix4();
  _o.set(x, y, 1).applyMatrix4(M);
  _d.set(0, 0, -1).transformDirection(M);
  _ray.set(_o, _d);
  const hits = _ray.intersectObject(wall, true);
  if (!hits.length) return 0;
  return hits[0].point.applyMatrix4(M.clone().invert()).z;
}

// ---------- holds ----------

const HOLD_TOKENS = { 1: 'xr-summit-hold-1', 2: 'xr-summit-hold-2', 3: 'xr-summit-hold-3', good: 'xr-summit-hold-good', ok: 'xr-summit-hold-ok', bad: 'xr-summit-hold-bad' };
const IDLE_TOKENS = ['xr-summit-hold-idle-1', 'xr-summit-hold-idle-2', 'xr-summit-hold-idle-3', 'xr-summit-hold-idle-4'];

/** A number badge (sprite) for a hold. */
function badgeSprite(n) {
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  const ctx = c.getContext('2d');
  ctx.beginPath();
  ctx.arc(48, 48, 40, 0, Math.PI * 2);
  ctx.fillStyle = color(HOLD_TOKENS[n]);
  ctx.fill();
  ctx.lineWidth = 7;
  ctx.strokeStyle = color('xr-panel-bg');
  ctx.stroke();
  ctx.fillStyle = color('xr-panel-bg');
  ctx.font = font('black', 58);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), 48, 52);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, toneMapped: false }));
  s.renderOrder = 20;
  s.scale.setScalar(0.042);
  s.userData.noFit = true;
  return s;
}

/**
 * A reply hold on the wall (wall-local). state: 'option' (colored by its number), 'good', 'ok',
 * 'bad', 'route' (kept on the wall, dimmer). Has an invisible hit sphere for pointing and grabbing.
 */
export class Hold {
  constructor(gltf, mats, variant, n) {
    this.n = n;
    this.group = new THREE.Group();
    this.group.userData.noFit = true;
    this.mat = new THREE.MeshStandardMaterial({ color: hex(HOLD_TOKENS[n] ?? IDLE_TOKENS[0]), roughness: 0.5, vertexColors: true, emissive: hex(HOLD_TOKENS[n] ?? IDLE_TOKENS[0]), emissiveIntensity: 0.25 });
    patchRock(this.mat);
    this.body = cloneNode(gltf, `SummitHold${variant}`, { ...mats, SummitHold: this.mat }) ?? new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), this.mat);
    this.body.rotation.z = (Math.random() - 0.5) * 1.2;
    this.size = n ? 1.35 : 1;
    this.group.add(this.body);
    // Glow behind the hold while it is an option.
    this.glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), color: hex(HOLD_TOKENS[n] ?? IDLE_TOKENS[0]), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.glow.scale.setScalar(0.16);
    this.glow.position.z = 0.01;
    this.group.add(this.glow);
    // The grab ring: shows when a hand is close enough.
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.004, 6, 32), new THREE.MeshBasicMaterial({ color: hex('xr-summit-grab'), transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    this.ring.position.z = 0.03;
    this.group.add(this.ring);
    // Pull progress: a ring that fills while you pull yourself up on this hold.
    this.progress = new THREE.Mesh(new THREE.RingGeometry(0.066, 0.08, 48), new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uP: { value: 0 }, uColor: { value: col('xr-summit-pull') }, uBack: { value: col('xr-summit-pull-back') } },
      vertexShader: 'varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uP; uniform vec3 uColor; uniform vec3 uBack; varying vec2 vP;
        void main() {
          float a = atan(vP.x, vP.y);
          float k = (a < 0.0 ? a + 6.2831853 : a) / 6.2831853;
          gl_FragColor = k <= uP ? vec4(uColor, 0.95) : vec4(uBack, 0.45);
          #include <colorspace_fragment>
        }`,
    }));
    this.progress.position.z = 0.034;
    this.progress.renderOrder = 15;
    this.progress.visible = false;
    this.group.add(this.progress);
    this.grabbed = 0;
    this.hit = new THREE.Mesh(new THREE.SphereGeometry(0.058, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
    this.hit.position.z = 0.02;
    this.hit.userData.noFit = true;
    this.group.add(this.hit);
    if (n) {
      this.badge = badgeSprite(n);
      this.badge.position.set(0.048, -0.04, 0.04);
      this.group.add(this.badge);
    }
    this.state = 'option';
    this.hover = 0;
    this.near = 0;
    this.shake = 0;
    this.pulse = Math.random() * 6;
  }

  /** Pull progress 0..1 (negative hides the ring). */
  setPull(p) {
    this.progress.visible = p >= 0;
    this.progress.material.uniforms.uP.value = Math.max(0, p);
    this.grabbed = p >= 0 ? 1 : 0;
  }

  setState(state) {
    this.state = state;
    const token = state === 'option' ? HOLD_TOKENS[this.n] : HOLD_TOKENS[state] ?? HOLD_TOKENS.good;
    if (state === 'route') {
      this.glow.visible = false;
      this.mat.emissiveIntensity = 0.08;
    } else {
      this.mat.color.setHex(hex(token));
      this.mat.emissive.setHex(hex(token));
      this.glow.material.color.setHex(hex(token));
      this.glow.visible = true;
    }
    if (this.badge) this.badge.visible = state === 'option';
    this.hit.userData.interactive = state === 'option';
  }

  tick(dt, time) {
    const option = this.state === 'option';
    this.hover += ((this.hit.userData._hover ? 1 : 0) - this.hover) * Math.min(1, dt * 12);
    const p = option ? 0.5 + 0.5 * Math.sin(time * 3.2 + this.pulse) : 0;
    this.mat.emissiveIntensity = this.state === 'route' ? 0.06 : 0.18 + 0.25 * p + 0.4 * Math.max(this.hover, this.near);
    this.glow.material.opacity = option ? 0.35 + 0.25 * p + 0.3 * Math.max(this.hover, this.near) : this.state === 'route' ? 0 : 0.5;
    this.glow.scale.setScalar(0.15 + 0.05 * Math.max(this.hover, this.near));
    const s = this.size * (1 + 0.15 * Math.max(this.hover, this.near));
    this.body.scale.setScalar(s);
    this.ring.material.opacity = option ? 0.25 + Math.max(this.near, this.grabbed) * 0.7 : this.grabbed * 0.9;
    this.ring.scale.setScalar(1 + 0.12 * Math.sin(time * 9));
    this.shake = Math.max(0, this.shake - dt);
    this.body.position.set(Math.sin(time * 70) * 0.004 * Math.min(1, this.shake * 4), Math.cos(time * 63) * 0.003 * Math.min(1, this.shake * 4), 0);
    if (this.badge) this.badge.material.opacity = option ? 1 : 0;
  }

  dispose() {
    if (this.disposed) return;
    this.group.removeFromParent();
    this.mat.dispose();
    this.glow.material.dispose();
    this.ring.geometry.dispose();
    this.ring.material.dispose();
    this.progress.geometry.dispose();
    this.progress.material.dispose();
    this.hit.geometry.dispose();
    this.disposed = true;
    this.badge?.material.map.dispose();
    this.badge?.material.dispose();
  }
}

/** Colorful route holds scattered over the wall (instanced, one draw call per shape). */
export function makeDecorHolds(gltf, wall, avoid = () => false) {
  const group = new THREE.Group();
  group.userData.noFit = true;
  const rnd = (a, b) => a + Math.random() * (b - a);
  for (let v = 0; v < 4; v++) {
    let geo = null;
    gltf?.scene.getObjectByName(`SummitHold${v}`)?.traverse((o) => { if (o.isMesh && o.material.name === 'SummitHold' && !geo) geo = o.geometry; });
    if (!geo) continue;
    const mat = patchRock(new THREE.MeshStandardMaterial({ roughness: 0.55, vertexColors: true }));
    const N = 7;
    const inst = new THREE.InstancedMesh(geo, mat, N);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    let n = 0;
    for (let tries = 0; n < N && tries < 80; tries++) {
      const y = rnd(-0.15, TOP - 0.05);
      const x = rnd(-0.42, 0.42) * (1 - 0.18 * (y / TOP));
      if (avoid(x, y)) continue;
      const z = surfaceZ(wall, x, y);
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), rnd(-Math.PI, Math.PI));
      const s = rnd(0.6, 0.9);
      m.compose(new THREE.Vector3(x, y, z - 0.004), q, new THREE.Vector3(s, s, s));
      inst.setMatrixAt(n, m);
      inst.setColorAt(n, col(IDLE_TOKENS[(n + v) % IDLE_TOKENS.length]));
      n++;
    }
    inst.count = n;
    inst.castShadow = true;
    inst.receiveShadow = true;
    group.add(inst);
  }
  return group;
}

/** Rock shards of a crumbling hold: they fall, spin and fade. tick(dt) returns false when done. */
export function makeShards(token, at) {
  const group = new THREE.Group();
  group.userData.noFit = true;
  const mat = new THREE.MeshStandardMaterial({ color: hex(token), roughness: 0.8, transparent: true });
  const geo = new THREE.DodecahedronGeometry(0.012, 0);
  const parts = [];
  for (let i = 0; i < 11; i++) {
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.04, Math.random() * 0.03));
    m.scale.setScalar(0.5 + Math.random() * 0.9);
    parts.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * 0.5, Math.random() * 0.3, 0.15 + Math.random() * 0.35), w: new THREE.Vector3(Math.random() * 9, Math.random() * 9, Math.random() * 9) });
    group.add(m);
  }
  const dust = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), color: hex('xr-summit-dust'), transparent: true, opacity: 0.7, depthWrite: false }));
  dust.position.copy(at);
  dust.scale.setScalar(0.06);
  group.add(dust);
  let t = 0;
  group.userData.tick = (dt) => {
    t += dt;
    for (const p of parts) {
      p.v.y -= 2.2 * dt;
      p.m.position.addScaledVector(p.v, dt);
      p.m.rotation.x += p.w.x * dt;
      p.m.rotation.y += p.w.y * dt;
    }
    mat.opacity = clamp(1.6 - t * 1.2, 0, 1);
    dust.scale.setScalar(0.06 + t * 0.25);
    dust.material.opacity = clamp(0.7 - t * 0.8, 0, 1);
    if (t > 1.4) {
      group.removeFromParent();
      geo.dispose();
      mat.dispose();
      dust.material.dispose();
      return false;
    }
    return true;
  };
  return group;
}

// ---------- the rope ----------

/** A climbing rope through points (wall-local), rebuilt only when the points move. */
export class Rope {
  constructor(parent) {
    this.mat = new THREE.MeshStandardMaterial({ color: hex('xr-summit-rope'), roughness: 0.65, map: ropeTexture() });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat);
    this.mesh.userData.noFit = true;
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    parent.add(this.mesh);
    this.key = '';
  }

  set(points) {
    const key = points.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`).join('|');
    if (key === this.key || points.length < 2) return;
    this.key = key;
    // A little sag between the points.
    const pts = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const d = a.distanceTo(b);
      pts.push(a.clone());
      pts.push(a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, -0.04 * d, 0.012 * d)));
    }
    pts.push(points[points.length - 1].clone());
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const len = curve.getLength();
    const old = this.mesh.geometry;
    const geo = new THREE.TubeGeometry(curve, Math.max(12, Math.round(len * 90)), 0.0045, 6, false);
    // Repeat the fleck texture along the rope.
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * len * 18);
    this.mesh.geometry = geo;
    old.dispose();
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

let ropeTex = null;
function ropeTexture() {
  if (ropeTex) return ropeTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 16;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color('xr-summit-mask');
  ctx.fillRect(0, 0, 64, 16);
  // Woven pattern: diagonal flecks in the second rope color.
  ctx.strokeStyle = color('xr-summit-rope-fleck');
  ctx.lineWidth = 3;
  for (let x = -16; x < 80; x += 16) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 16, 16);
    ctx.stroke();
  }
  ropeTex = new THREE.CanvasTexture(c);
  ropeTex.colorSpace = THREE.SRGBColorSpace;
  ropeTex.wrapS = ropeTex.wrapT = THREE.RepeatWrapping;
  return ropeTex;
}

// ---------- Echo, the climber ----------

const ECHO_SIZE = 0.125;
const HANG = 0.085; // body center below the grip point

/**
 * Echo in a harness on the wall (wall-local). The scene moves `grip` (where the wings hold on);
 * the body hangs below it. pose: 'stand' | 'hang' | 'climb' | 'slip' | 'fall' | 'cheer'.
 */
export class ClimberEcho {
  constructor(parent, gltf, mats) {
    this.group = new THREE.Group();
    this.group.userData.noFit = true;
    this.body = new THREE.Group();
    this.group.add(this.body);
    parent.add(this.group);
    this.grip = new THREE.Vector3();
    this.pose = 'stand';
    this.time = 0;
    this.yaw = 0.3;
    this.reach = 0; // -1 left wing reaches higher, +1 right wing
    this.flap = 0;
    this.swing = 0;
    this.lookBack = 0;
    this.tie = new THREE.Object3D();
    loadEchoParts().then((p) => this.attach(p, gltf, mats)).catch((e) => console.warn('Echo not loaded', e));
  }

  attach({ model, wings, rings, face }, gltf, mats) {
    if (this.disposed) return;
    model.scale.setScalar(ECHO_SIZE);
    model.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const harness = gltf && cloneNode(gltf, 'SummitHarness', mats);
    if (harness) {
      model.add(harness);
      const tie = harness.getObjectByName('HarnessTieIn');
      if (tie) tie.add(this.tie);
    } else model.add(this.tie);
    this.body.add(model);
    this.model = model;
    this.wings = wings;
    this.rings = rings;
    this.face = new EchoFace(face);
    this.face.setMood('focus');
  }

  /** Tie-in point of the rope in the parent's (wall-local) space. */
  tiePoint(out = new THREE.Vector3()) {
    this.group.parent?.updateMatrixWorld(true);
    this.tie.getWorldPosition(out);
    return this.group.parent ? this.group.parent.worldToLocal(out) : out;
  }

  happy(sec = 1.2) { this.face?.setMood('happy', sec); this.lookBack = 1; }
  hurt() { this.face?.setMood('dizzy', 1.4); this.flap = 1; }
  sad() { this.face?.setMood('sad', 3); }
  focus() { this.face?.setMood('focus'); }

  update(dt, { look = null, tremble = 0 } = {}) {
    this.time += dt;
    const t = this.time;
    const pose = this.pose;
    const onWall = pose !== 'stand' && pose !== 'cheer';
    // Facing: the wall when climbing (turned a bit, so you see Echo's face), you when standing.
    this.lookBack = Math.max(0, this.lookBack - dt * 0.7);
    // Handshake at the summit: turned towards the customer (on its right).
    const wantYaw = onWall ? Math.PI - 0.62 - this.lookBack * 0.95 + this.reach * 0.15 : this.shakeT > 0 ? 0.95 : 0.25;
    this.yaw += (wantYaw - this.yaw) * Math.min(1, dt * 6);
    this.flap = Math.max(0, this.flap - dt * 1.2);
    this.shakeT = Math.max(0, (this.shakeT ?? 0) - dt);
    this.swing *= Math.exp(-dt * 1.6);
    const hang = onWall ? HANG : -0.065; // standing: the grip point is the feet
    this.group.position.set(this.grip.x + Math.sin(t * 3.1) * this.swing * 0.04, this.grip.y - hang, this.grip.z + (onWall ? 0.075 : 0));
    this.group.rotation.set(0, this.yaw, Math.sin(t * 3.1) * this.swing * 0.35);
    // Breathing, trembling arms when strength runs low.
    const breathe = Math.sin(t * 2.2) * 0.006;
    const shake = tremble * Math.sin(t * 47) * 0.004;
    this.body.position.set(shake, breathe + (pose === 'cheer' ? Math.abs(Math.sin(t * 7)) * 0.03 : 0), 0);
    this.body.rotation.x = onWall ? -0.12 : 0;
    const spin = pose === 'cheer' ? Math.max(0, Math.sin(t * 1.4)) ** 6 * 0.6 : 0;
    this.body.rotation.y = spin;
    let aL;
    let aR;
    if (pose === 'stand') {
      aL = aR = 0.2 + Math.sin(t * 2.4) * 0.08;
    } else if (pose === 'cheer') {
      aL = aR = 0.95 + Math.sin(t * 13) * 0.3;
    } else if (pose === 'climb') {
      aL = 1.15 + Math.sin(t * 14) * 0.25 + this.reach * 0.2;
      aR = 1.15 - Math.sin(t * 14) * 0.25 - this.reach * 0.2;
    } else if (pose === 'slip' || pose === 'fall') {
      aL = 0.7 + Math.sin(t * 19) * 0.45;
      aR = 0.7 - Math.sin(t * 17) * 0.45;
    } else {
      // hang: both wings up on the hold, the reaching wing a bit higher.
      aL = 1.18 + Math.max(0, -this.reach) * 0.15 + Math.sin(t * 1.7) * 0.03;
      aR = 1.18 + Math.max(0, this.reach) * 0.15 - Math.sin(t * 1.7) * 0.03;
    }
    if (this.shakeT > 0 && !onWall) aR = 0.6 + Math.sin(t * 14) * 0.18;
    aL += this.flap * Math.sin(t * 30) * 0.3 + tremble * Math.sin(t * 41) * 0.08;
    aR += this.flap * Math.sin(t * 28) * 0.3 + tremble * Math.sin(t * 43) * 0.08;
    for (const w of this.wings ?? []) {
      const a = w.side > 0 ? aR : aL;
      w.node.rotation.z = w.side * a;
      bendWing(w, (onWall ? 0.75 : 0.45) * Math.min(1, a) * 0.6);
    }
    this.rings?.forEach((mats, i) => {
      const k = 0.3 + 0.7 * (0.5 - 0.5 * Math.cos(((t - i * 0.4) / 1.6) * Math.PI * 2));
      for (const m of mats) m.opacity = k;
    });
    this.face?.update(dt, look);
  }

  dispose() {
    this.disposed = true;
    this.group.removeFromParent();
  }
}

// ---------- the summit: flag, cross, fairy lights ----------

/** Flag (raised when a deal is closed), at Christmas a summit cross with fairy lights and a tree. */
export function makeSummitDecor(gltf, mats) {
  const group = new THREE.Group();
  group.userData.noFit = true;
  const flag = cloneNode(gltf, 'SummitFlag', mats);
  let cloth = null;
  let base = null;
  if (flag) {
    flag.position.set(0.36, PLATEAU_Y - 0.012, -0.08);
    cloth = flag.getObjectByName('SummitFlagCloth');
    if (cloth) {
      cloth.material = new THREE.MeshStandardMaterial({ map: flagTexture(), roughness: 0.75, side: THREE.DoubleSide });
      cloth.geometry = cloth.geometry.clone();
      base = cloth.geometry.attributes.position.array.slice();
    }
    group.add(flag);
  }
  let lights = null;
  let tree = null;
  if (CHRISTMAS) {
    const cross = cloneNode(gltf, 'SummitCross', mats);
    if (cross) {
      cross.position.set(-0.22, PLATEAU_Y - 0.012, -0.04);
      cross.scale.setScalar(0.9);
      group.add(cross);
      // Fairy lights along the beams of the cross (dimensions from build_summit.py).
      const pts = [];
      for (let i = 0; i < 12; i++) pts.push(new THREE.Vector3(i % 2 ? 0.017 : -0.017, 0.03 + (i / 11) * 0.36, 0.014));
      for (let i = 0; i < 8; i++) pts.push(new THREE.Vector3(-0.1 + (i / 7) * 0.2, 0.29 + (i % 2 ? 0.016 : -0.016), 0.014));
      lights = makeBulbs(pts, { size: 0.0048, halo: 0.03 });
      cross.add(lights);
    }
    tree = makeTree();
    tree.group.scale.setScalar(0.13);
    tree.group.position.set(-0.36, PLATEAU_Y - 0.012, -0.05);
    group.add(tree.group);
  }
  let raise = 0;
  let raiseTo = 0;
  group.userData.raise = (on) => { raiseTo = on ? 1 : 0; if (!on) raise = 0; };
  group.userData.tick = (dt, time) => {
    raise += (raiseTo - raise) * Math.min(1, dt * 1.6);
    if (cloth && base) {
      const pos = cloth.geometry.attributes.position;
      const a = pos.array;
      const lower = (1 - raise) * 0.26;
      for (let i = 0; i < a.length; i += 3) {
        const u = clamp((base[i] - 0.006) / 0.17, 0, 1);
        a[i] = base[i] - u * u * 0.02;
        a[i + 1] = base[i + 1] - lower + Math.sin(time * 5 - u * 6) * 0.008 * u;
        a[i + 2] = base[i + 2] + Math.sin(time * 4.2 - u * 5 + base[i + 1] * 20) * 0.022 * u;
      }
      pos.needsUpdate = true;
      cloth.geometry.computeVertexNormals();
    }
    lights?.userData.tick(time);
    tree?.tick(time);
  };
  return group;
}

/** The flag: two token colors and the game's summit icon. */
function flagTexture() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color('xr-summit-flag');
  ctx.fillRect(0, 0, 256, 160);
  ctx.fillStyle = color('xr-summit-flag-2');
  ctx.beginPath();
  ctx.moveTo(0, 160);
  ctx.lineTo(256, 70);
  ctx.lineTo(256, 160);
  ctx.closePath();
  ctx.fill();
  drawIcon(ctx, 'summit', 92, 74, 92, color('xr-summit-flag-icon'));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---------- backdrop: sky, peaks, sea of clouds ----------

/** A dusk sky dome with a glowing horizon and stars (not in AR). */
/**
 * Image-based light for the dusk: a sky dome in the sky tokens with a warm glow where the sun
 * sets and a cool sky opposite, prefiltered once (PMREM). Reflections and ambient light then
 * match the sky. Returns the render target (dispose it).
 */
export function makeDuskEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  const dome = new THREE.SphereGeometry(10, 32, 16);
  const top = col('xr-summit-sky-top');
  const mid = col('xr-summit-sky-mid');
  const low = col('xr-summit-sky-low');
  const below = col('xr-summit-cloud-shade');
  const pos = dome.attributes.position;
  const colors = [];
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i) / 10;
    if (h < 0) c.copy(low).lerp(below, clamp(-h * 4, 0, 1));
    else c.copy(low).lerp(mid, clamp(h / 0.3, 0, 1)).lerp(top, clamp((h - 0.3) / 0.6, 0, 1));
    colors.push(c.r, c.g, c.b);
  }
  dome.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  env.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  // The low sun (warm, bright) and the cool sky light from the other side.
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.2), new THREE.MeshBasicMaterial({ color: col('xr-summit-sky-glow').multiplyScalar(3.2), side: THREE.DoubleSide }));
  sun.position.set(4.6, 0.9, -7);
  sun.lookAt(0, 0, 0);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(6, 4), new THREE.MeshBasicMaterial({ color: col('xr-summit-fill').multiplyScalar(0.9), side: THREE.DoubleSide }));
  sky.position.set(-6, 5, 2);
  sky.lookAt(0, 0, 0);
  env.add(sun, sky);
  const target = pmrem.fromScene(env, 0.035);
  pmrem.dispose();
  env.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  return target;
}

export function makeSky() {
  const geo = new THREE.SphereGeometry(19, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTop: { value: col('xr-summit-sky-top') },
      uMid: { value: col('xr-summit-sky-mid') },
      uLow: { value: col('xr-summit-sky-low') },
      uGlow: { value: col('xr-summit-sky-glow') },
      uCloud: { value: col('xr-summit-cloud-shade') },
    },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uLow; uniform vec3 uGlow; uniform vec3 uCloud;
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 c = mix(uLow, uMid, smoothstep(0.0, 0.25, h));
        c = mix(c, uTop, smoothstep(0.2, 0.75, h));
        // Below the horizon: the sea of clouds.
        c = mix(c, uCloud, smoothstep(0.0, -0.08, h));
        float sun = pow(max(0.0, dot(normalize(vDir), normalize(vec3(0.55, 0.08, -0.83)))), 6.0);
        c += uGlow * sun * 0.55 * (1.0 - smoothstep(0.0, 0.5, h));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.userData.noFit = true;
  sky.renderOrder = -10;
  // Stars in the upper sky.
  const n = 260;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection();
    v.y = Math.abs(v.y) * 0.85 + 0.15;
    v.normalize().multiplyScalar(17);
    pos.set([v.x, v.y, v.z], i * 3);
  }
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: hex('xr-summit-star'), size: 0.07, map: radialTexture(), transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  stars.userData.noFit = true;
  sky.add(stars);
  sky.userData.tick = (time) => { stars.material.opacity = 0.65 + 0.2 * Math.sin(time * 0.8); };
  return sky;
}

/** Snowy mountains around the wall, their feet in the clouds. */
export function makePeaks(gltf, mats) {
  const group = new THREE.Group();
  group.userData.noFit = true;
  const spots = [
    ['A', -1.35, -2.0, 1.25, 0.5], ['B', 1.5, -2.4, 1.55, -0.3], ['C', -2.7, -3.6, 2.1, 1.1], ['A', 3.0, -4.2, 2.4, 2.0],
    ['B', -0.6, -5.4, 2.8, 0.9], ['C', 1.4, -6.2, 3.2, -1.2], ['B', -3.8, -1.2, 1.6, 2.6], ['C', 3.6, -1.4, 1.4, 0.4],
  ];
  for (const [k, x, z, h, ry] of spots) {
    const p = cloneNode(gltf, `SummitPeak${k}`, mats);
    if (!p) continue;
    p.scale.set(h * 0.9, h, h * 0.9);
    p.position.set(x, -0.35, z);
    p.rotation.y = ry;
    p.traverse((o) => { o.castShadow = false; });
    group.add(p);
  }
  return group;
}

let cloudTex = null;
/** A soft, lumpy cloud puff (canvas). */
function cloudTexture() {
  if (cloudTex) return cloudTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const m = col('xr-summit-mask');
  const mask = (a) => `rgba(${Math.round(m.r * 255)}, ${Math.round(m.g * 255)}, ${Math.round(m.b * 255)}, ${a})`;
  for (let i = 0; i < 9; i++) {
    const x = 34 + Math.random() * 60;
    const y = 50 + Math.random() * 30;
    const r = 18 + Math.random() * 22;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, mask(0.9));
    g.addColorStop(0.6, mask(0.45));
    g.addColorStop(1, mask(0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  }
  cloudTex = new THREE.CanvasTexture(c);
  return cloudTex;
}

/**
 * The sea of clouds at height y (local): soft puffs as camera-facing quads (instanced, one draw
 * call), around the wall but not where the player stands. tick(time) lets them drift.
 */
export function makeClouds(y, { count = 90, ar = false } = {}) {
  const lit = col('xr-summit-cloud');
  const shade = col('xr-summit-cloud-shade');
  const puffs = [];
  for (let i = 0; i < count; i++) {
    const near = i < count * 0.35;
    const x = near ? (Math.random() - 0.5) * 2.6 : (Math.random() - 0.5) * 10;
    const z = near ? -0.4 - Math.random() * 1.4 : -1.4 - Math.random() * 5.5;
    if (z > -0.55 && Math.abs(x) < 0.45) continue; // keep clear of the player
    const c = shade.clone().lerp(lit, 0.3 + Math.random() * 0.7);
    puffs.push({ x, y: y + (Math.random() - 0.5) * 0.1 - (near ? 0 : 0.12), z, s: near ? 0.45 + Math.random() * 0.45 : 0.9 + Math.random() * 1.4, c, ph: Math.random() * 6 });
  }
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: { uMap: { value: cloudTexture() }, uOpacity: { value: ar ? 0.82 : 0.95 } },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vTint;
      void main() {
        vUv = uv;
        vTint = instanceColor;
        vec4 center = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float s = length(instanceMatrix[0].xyz);
        center.xy += position.xy * s;
        gl_Position = projectionMatrix * center;
      }`,
    fragmentShader: `
      uniform sampler2D uMap;
      uniform float uOpacity;
      varying vec2 vUv;
      varying vec3 vTint;
      void main() {
        vec4 t = texture2D(uMap, vUv);
        gl_FragColor = vec4(vTint * (0.82 + 0.18 * vUv.y), t.a * uOpacity);
        if (gl_FragColor.a < 0.01) discard;
        #include <colorspace_fragment>
      }`,
  });
  const inst = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, puffs.length);
  inst.userData.noFit = true;
  inst.frustumCulled = false;
  inst.renderOrder = 3;
  const m = new THREE.Matrix4();
  const place = (time) => {
    puffs.forEach((p, i) => {
      m.makeScale(p.s, p.s, p.s);
      m.setPosition(p.x + Math.sin(time * 0.05 + p.ph) * 0.15, p.y + Math.sin(time * 0.3 + p.ph) * 0.012, p.z);
      inst.setMatrixAt(i, m);
    });
    inst.instanceMatrix.needsUpdate = true;
  };
  puffs.forEach((p, i) => inst.setColorAt(i, p.c));
  place(0);
  inst.userData.tick = (time) => place(time);
  return inst;
}

/**
 * The hint while a hold is grabbed: chevrons pointing down and a short text ("pull down").
 * Panel units like the reply plates; tick(time) lets the chevrons slide.
 */
export function makePullHint(text) {
  const W = 0.36;
  const H = 0.17;
  let phase = 0;
  const p = new Panel(W, H, (ctx, c) => {
    const w = c.canvas.width;
    ctx.fillStyle = color('xr-panel-bg');
    ctx.beginPath();
    ctx.roundRect(c.m(0.004), c.m(0.004), w - c.m(0.008), c.canvas.height - c.m(0.008), c.m(0.03));
    ctx.fill();
    ctx.strokeStyle = color('xr-summit-pull');
    ctx.lineWidth = c.m(0.012);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < 2; i++) {
      const y = c.m(0.03 + i * 0.03 + phase * 0.02);
      ctx.globalAlpha = 1 - i * 0.35 - phase * 0.3;
      ctx.beginPath();
      ctx.moveTo(w / 2 - c.m(0.04), y);
      ctx.lineTo(w / 2, y + c.m(0.025));
      ctx.lineTo(w / 2 + c.m(0.04), y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = color('xr-panel-text');
    ctx.font = font('bold', c.m(0.036));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, c.m(0.135), w - c.m(0.03));
  });
  p.renderOrder = 14;
  p.userData.tick = (time) => {
    const ph = (time * 1.6) % 1;
    if (Math.abs(ph - phase) > 0.08) { phase = ph; p.redraw(); }
  };
  return p;
}
