// Hologram look for the fighters on the holo game table: fine scanlines running up the figure
// (anti-aliased: they fade to an even shimmer where they would get smaller than a pixel, so no
// moire on phones or in the headset), a scan band sweeping up from the table, a glowing fresnel
// rim, a cool tint over the original colors (they stay readable), a projector glow at the feet,
// slight transparency and a flicker with a short horizontal tear now and then. Patches lit
// materials (standard / physical) in place; skinned models keep working. One uniform set per
// figure, animated with tickHolo().
import * as THREE from 'three';
import { hex } from './tokens.js';

const VERT_HEAD = /* glsl */ `
varying float vHoloY;
uniform float uHoloTime;
uniform float uHoloGlitch;
`;
const VERT_BODY = /* glsl */ `
vHoloY = (modelMatrix * vec4(transformed, 1.0)).y;
// Glitch: thin horizontal slices of the figure tear sideways for a moment.
if (uHoloGlitch > 0.0) {
  float slice = step(0.72, fract(sin(floor(vHoloY * 90.0) * 12.9898 + floor(uHoloTime * 24.0) * 4.1414) * 43758.5453));
  gl_Position.x += slice * uHoloGlitch * 0.012 * gl_Position.w;
}
`;
const FRAG_HEAD = /* glsl */ `
uniform float uHoloTime;
uniform vec3 uHoloTint;
uniform float uHoloMix;
uniform float uHoloAlpha;
uniform float uHoloScale;
uniform float uHoloBase;
varying float vHoloY;
`;
const FRAG_BODY = /* glsl */ `
{
  float yy = vHoloY * uHoloScale;
  float h = max(0.0, vHoloY - uHoloBase); // height above the table (m)
  // Fine scanlines, faded out where one line would be thinner than about a pixel.
  float ph = yy * 1500.0 - uHoloTime * 9.0;
  float aa = 1.0 - smoothstep(1.2, 3.0, fwidth(ph));
  float scan = 1.0 - 0.16 * aa * (0.5 + 0.5 * sin(ph)) - 0.08 * (1.0 - aa);
  // A soft scan band sweeping up from the table every few seconds.
  float sweepY = fract(uHoloTime * 0.32) * 0.95 - 0.08;
  float sweep = exp(-pow((h - sweepY) / 0.018, 2.0));
  // Coarse interference bands, very faint.
  float band = smoothstep(0.47, 0.5, abs(fract(yy * 5.0 - uHoloTime * 0.4) - 0.5));
  vec3 n = normalize(normal);
  float fres = pow(1.0 - abs(dot(n, normalize(vViewPosition))), 2.6);
  vec3 base = gl_FragColor.rgb;
  vec3 tinted = mix(base, base * 0.72 + uHoloTint * 0.2 * (0.4 + dot(base, vec3(0.3, 0.55, 0.15))), uHoloMix);
  float foot = exp(-h * 22.0); // projector glow where the figure meets the table
  gl_FragColor.rgb = tinted * scan
    + uHoloTint * (fres * 0.75 + band * 0.18 + sweep * 0.55 + foot * 0.3) * uHoloMix;
  gl_FragColor.a *= uHoloAlpha * (0.92 + 0.08 * scan) * (0.86 + 0.14 * fres + sweep * 0.2);
}
`;

/** Creates the uniforms of one hologram figure. */
export function holoUniforms(tintToken = 'xr-fight-holo', mix = 0.42) {
  return {
    uHoloTime: { value: 0 },
    uHoloTint: { value: new THREE.Color(hex(tintToken)) },
    uHoloMix: { value: mix },
    uHoloAlpha: { value: 0.9 },
    uHoloScale: { value: 1 },
    uHoloBase: { value: 0 },
    uHoloGlitch: { value: 0 },
    glitch: 0,
    nextGlitch: 2 + Math.random() * 4,
  };
}

/** Turns all lit materials under root into hologram materials (idempotent). */
export function holoize(root, u) {
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (m.userData.holo || !(m.isMeshStandardMaterial || m.isMeshPhongMaterial || m.isMeshLambertMaterial)) continue;
      m.userData.holo = true;
      m.transparent = true;
      m.depthWrite = true;
      const prev = m.onBeforeCompile;
      m.onBeforeCompile = (shader, renderer) => {
        prev?.call(m, shader, renderer);
        Object.assign(shader.uniforms, {
          uHoloTime: u.uHoloTime, uHoloTint: u.uHoloTint, uHoloMix: u.uHoloMix, uHoloAlpha: u.uHoloAlpha,
          uHoloScale: u.uHoloScale, uHoloBase: u.uHoloBase, uHoloGlitch: u.uHoloGlitch,
        });
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
          .replace('#include <project_vertex>', `#include <project_vertex>\n${VERT_BODY}`);
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
          .replace('#include <dithering_fragment>', `#include <dithering_fragment>\n${FRAG_BODY}`);
      };
      m.customProgramCacheKey = () => 'holo-figure-2';
      m.needsUpdate = true;
    }
  });
}

const tmp = new THREE.Vector3();

/**
 * Animates a figure: scanlines move, and every few seconds the projection flickers, tears
 * sideways in thin slices and the figure jumps sideways for a moment (offset applied to
 * `target`, an Object3D standing on the table).
 */
export function tickHolo(u, dt, time, target) {
  u.uHoloTime.value = time;
  if (target?.parent) u.uHoloBase.value = target.parent.getWorldPosition(tmp).y;
  u.nextGlitch -= dt;
  if (u.nextGlitch <= 0) {
    u.glitch = 0.12 + Math.random() * 0.1;
    u.nextGlitch = 3 + Math.random() * 5;
  }
  let alpha = 0.88 + Math.sin(time * 37) * 0.02;
  if (u.glitch > 0) {
    u.glitch -= dt;
    alpha = 0.5 + Math.random() * 0.3;
    u.uHoloGlitch.value = Math.random() < 0.6 ? (Math.random() - 0.5) * 2 : 0;
    if (target) target.position.z = (Math.random() - 0.5) * 0.014;
  } else {
    u.uHoloGlitch.value = 0;
    if (target) target.position.z = 0;
  }
  u.uHoloAlpha.value = alpha;
}
