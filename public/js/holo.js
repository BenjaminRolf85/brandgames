// Hologram look for the fighters on the holo game table: scanlines running up the figure,
// a glowing rim, a cool tint mixed into the original colors, slight transparency and a
// flicker now and then. Patches lit materials (standard / physical) in place; skinned
// models keep working. One uniform set per figure, animated with tickHolo().
import * as THREE from 'three';
import { hex } from './tokens.js';

const VERT_HEAD = /* glsl */ `
varying float vHoloY;
`;
const VERT_BODY = /* glsl */ `
vHoloY = (modelMatrix * vec4(transformed, 1.0)).y;
`;
const FRAG_HEAD = /* glsl */ `
uniform float uHoloTime;
uniform vec3 uHoloTint;
uniform float uHoloMix;
uniform float uHoloAlpha;
uniform float uHoloScale;
varying float vHoloY;
`;
const FRAG_BODY = /* glsl */ `
{
  float yy = vHoloY * uHoloScale;
  float scan = 0.84 + 0.16 * sin(yy * 1100.0 - uHoloTime * 14.0);
  float band = smoothstep(0.46, 0.5, abs(fract(yy * 6.0 - uHoloTime * 0.45) - 0.5));
  float fres = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.2);
  vec3 tinted = mix(gl_FragColor.rgb, gl_FragColor.rgb * 0.55 + uHoloTint * 0.45, uHoloMix);
  gl_FragColor.rgb = tinted * scan + uHoloTint * (fres * 0.85 + band * 0.35) * uHoloMix;
  gl_FragColor.a *= uHoloAlpha * (0.9 + 0.1 * scan);
}
`;

/** Creates the uniforms of one hologram figure. */
export function holoUniforms(tintToken = 'xr-fight-holo', mix = 0.42) {
  return {
    uHoloTime: { value: 0 },
    uHoloTint: { value: new THREE.Color(hex(tintToken)) },
    uHoloMix: { value: mix },
    uHoloAlpha: { value: 0.88 },
    uHoloScale: { value: 1 },
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
          uHoloTime: u.uHoloTime, uHoloTint: u.uHoloTint, uHoloMix: u.uHoloMix, uHoloAlpha: u.uHoloAlpha, uHoloScale: u.uHoloScale,
        });
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
          .replace('#include <project_vertex>', `#include <project_vertex>\n${VERT_BODY}`);
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
          .replace('#include <dithering_fragment>', `#include <dithering_fragment>\n${FRAG_BODY}`);
      };
      m.customProgramCacheKey = () => 'holo-figure';
      m.needsUpdate = true;
    }
  });
}

/**
 * Animates a figure: scanlines move, and every few seconds the projection flickers and the
 * figure jumps sideways for a moment (offset applied to `target`, an Object3D).
 */
export function tickHolo(u, dt, time, target) {
  u.uHoloTime.value = time;
  u.nextGlitch -= dt;
  if (u.nextGlitch <= 0) {
    u.glitch = 0.12 + Math.random() * 0.1;
    u.nextGlitch = 3 + Math.random() * 5;
  }
  let alpha = 0.86 + Math.sin(time * 37) * 0.02;
  if (u.glitch > 0) {
    u.glitch -= dt;
    alpha = 0.45 + Math.random() * 0.35;
    if (target) target.position.z = (Math.random() - 0.5) * 0.014;
  } else if (target) target.position.z = 0;
  u.uHoloAlpha.value = alpha;
}
