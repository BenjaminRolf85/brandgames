// Shader effects for AI Pong: holographic tunnel walls with hit ripples, an energy vortex
// behind the AI, a fresnel shell around the ball, hexagon paddles and a ribbon comet trail.
// All colors come from design tokens (passed in as hex values).
import * as THREE from 'three';
import { hex } from './tokens.js';

const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
const MAX_HITS = 8;

const basicVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// ---------- tunnel walls ----------

const wallFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uSpeed;
  uniform float uOpacity;
  uniform vec2 uSize;        // wall size in meters (uv * size)
  uniform vec3 uZ;           // tunnel z = uZ.x + uZ.y * t, t = uv.x (uZ.z > 0.5) or uv.y
  uniform float uLen;
  uniform vec4 uHits[${MAX_HITS}];   // z, start time, strength, color index
  uniform vec3 uHitColors[4];
  uniform float uFlash;
  uniform vec3 uFlashColor;
  varying vec2 vUv;

  float gridLine(float x, float w) {
    float f = abs(fract(x) - 0.5);
    return smoothstep(0.5 - w, 0.5, f);
  }

  void main() {
    vec2 m = vUv * uSize;
    float t = uZ.z > 0.5 ? vUv.x : vUv.y;
    float across = uZ.z > 0.5 ? vUv.y : vUv.x;
    float z = uZ.x + uZ.y * t;
    float near = (z + uLen * 0.5) / uLen;   // 0 at the AI, 1 at the player

    float g = max(gridLine(m.x / 0.1, 0.05), gridLine(m.y / 0.1, 0.05));
    // Light bands flowing towards the player, faster when the ball is fast.
    float scan = pow(0.5 + 0.5 * sin(z * 9.0 + uTime * (2.0 + uSpeed * 2.5)), 14.0);
    float edge = pow(abs(across - 0.5) * 2.0, 6.0);
    vec3 col = uColor * (0.035 + g * 0.5 + scan * 0.3 + edge * 0.35);

    for (int i = 0; i < ${MAX_HITS}; i++) {
      vec4 h = uHits[i];
      float age = uTime - h.y;
      if (h.z <= 0.0 || age < 0.0 || age > 1.3) continue;
      float d = abs(z - h.x);
      float r = age * 1.7;
      float band = exp(-pow((d - r) / 0.045, 2.0)) * (1.0 - age / 1.3) * h.z;
      vec3 hc = h.w < 0.5 ? uHitColors[0] : h.w < 1.5 ? uHitColors[1] : h.w < 2.5 ? uHitColors[2] : uHitColors[3];
      col += hc * band * (0.6 + g * 1.2);
    }
    col += uFlashColor * uFlash * (0.25 + g * 0.8);
    col *= mix(0.55, 1.0, near) * uOpacity;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/**
 * Shared state for all four holographic walls: time, ball speed, ripples and flashes.
 * colors: [player, ai, rail, obstacle] as hex.
 */
export class HoloFX {
  constructor(token, colors) {
    this.u = {
      uColor: { value: new THREE.Color(hex(token)) },
      uTime: { value: 0 },
      uSpeed: { value: 0 },
      uHits: { value: Array.from({ length: MAX_HITS }, () => new THREE.Vector4(0, -10, 0, 0)) },
      uHitColors: { value: colors.map((c) => new THREE.Color(c)) },
      uFlash: { value: 0 },
      uFlashColor: { value: new THREE.Color(0xffffff) },
    };
    this.next = 0;
  }

  wallMaterial(size, zMap, len, opacity) {
    return new THREE.ShaderMaterial({
      uniforms: { ...this.u, uSize: { value: size }, uZ: { value: zMap }, uLen: { value: len }, uOpacity: { value: opacity } },
      vertexShader: basicVertex,
      fragmentShader: wallFragment,
      side: THREE.DoubleSide,
      ...additive,
    });
  }

  /** A ripple that runs along the tunnel from z. colorIndex: 0 player, 1 AI, 2 rail, 3 obstacle. */
  ripple(z, colorIndex, strength = 1) {
    this.u.uHits.value[this.next].set(z, this.u.uTime.value, strength, colorIndex);
    this.next = (this.next + 1) % MAX_HITS;
  }

  flash(c, k = 1) {
    this.u.uFlashColor.value.setHex(c);
    this.u.uFlash.value = Math.max(this.u.uFlash.value, k);
  }

  setHitColor(index, c) {
    this.u.uHitColors.value[index].setHex(c);
  }

  update(dt, time, speed) {
    this.u.uTime.value = time;
    this.u.uSpeed.value = speed;
    this.u.uFlash.value = Math.max(0, this.u.uFlash.value - dt * 1.6);
  }
}

// ---------- vortex behind the AI ----------

const portalFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uPulse;
  uniform float uAspect;
  varying vec2 vUv;
  void main() {
    vec2 p = (vUv - 0.5) * 2.0;
    p.x *= uAspect;
    float r = length(p);
    float a = atan(p.y, p.x);
    float s1 = 0.5 + 0.5 * sin(a * 6.0 + r * 13.0 - uTime * 2.4);
    float s2 = 0.5 + 0.5 * sin(a * 3.0 - r * 8.0 + uTime * 1.6);
    float core = exp(-r * 2.6);
    float rings = pow(0.5 + 0.5 * sin(r * 28.0 - uTime * 5.0), 10.0) * (1.0 - smoothstep(0.1, 1.3, r));
    float v = (s1 * s2 * 0.55 + core * 0.7 + rings * 0.35) * (1.0 + uPulse * 1.6);
    vec2 q = abs(vUv - 0.5) * 2.0;
    float mask = (1.0 - smoothstep(0.8, 1.0, q.x)) * (1.0 - smoothstep(0.8, 1.0, q.y));
    gl_FragColor = vec4(uColor * v * mask * 0.42, 1.0);
  }
`;

export function makePortal(hw, hh, c) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(c) }, uTime: { value: 0 }, uPulse: { value: 0 }, uAspect: { value: hw / hh } },
    vertexShader: basicVertex,
    fragmentShader: portalFragment,
    ...additive,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2 * hw, 2 * hh), mat);
  mesh.userData.update = (dt, time) => {
    mat.uniforms.uTime.value = time;
    mat.uniforms.uPulse.value = Math.max(0, mat.uniforms.uPulse.value - dt * 2);
  };
  mesh.userData.pulse = (k = 1) => { mat.uniforms.uPulse.value = Math.max(mat.uniforms.uPulse.value, k); };
  mesh.userData.setColor = (col) => mat.uniforms.uColor.value.setHex(col);
  return mesh;
}

// ---------- fresnel shell around the ball ----------

export function makeFresnelShell(radius, c) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(c) }, uIntensity: { value: 1.2 } },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float f = pow(1.0 - max(dot(normalize(vN), normalize(vV)), 0.0), 2.0);
        gl_FragColor = vec4(uColor * f * uIntensity, 1.0);
      }
    `,
    ...additive,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 24), mat);
}

// ---------- hexagon paddle surface ----------

const paddleFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uOpacity;
  uniform vec2 uHalf;
  uniform vec3 uHit;   // x, y (m, relative to the paddle center), start time
  varying vec2 vUv;
  float hexD(vec2 p) {
    p = abs(p);
    return max(dot(p, normalize(vec2(1.0, 1.732))), p.x);
  }
  void main() {
    vec2 s = vec2(1.0, 1.732);
    vec2 p = vUv / 0.011;
    vec2 a = mod(p, s) - s * 0.5;
    vec2 b = mod(p - s * 0.5, s) - s * 0.5;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    float line = 1.0 - smoothstep(0.0, 0.07, 0.5 - hexD(gv));
    float ex = max(abs(vUv.x) / uHalf.x, abs(vUv.y) / uHalf.y);
    float edge = pow(clamp(ex, 0.0, 1.0), 5.0);
    float age = uTime - uHit.z;
    float d = length(vUv - uHit.xy);
    float wave = age >= 0.0 && age < 0.7 ? exp(-pow((d - age * 0.32) / 0.012, 2.0)) * (1.0 - age / 0.7) : 0.0;
    float shimmer = 0.5 + 0.5 * sin(vUv.y * 90.0 - uTime * 4.0);
    vec3 col = uColor * (0.07 + line * (0.22 + shimmer * 0.12) + edge * 0.5 + wave * 1.6);
    gl_FragColor = vec4(col * uOpacity, 1.0);
  }
`;

export function makeHexMaterial(hw, hh, c) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(c) }, uTime: { value: 0 }, uOpacity: { value: 1 },
      uHalf: { value: new THREE.Vector2(hw, hh) }, uHit: { value: new THREE.Vector3(0, 0, -10) },
    },
    vertexShader: basicVertex,
    fragmentShader: paddleFragment,
    side: THREE.DoubleSide,
    ...additive,
  });
}

// ---------- ribbon comet trail ----------

/** Two crossed ribbons that follow the ball, so the tail reads from every angle. */
export class RibbonTrail {
  constructor(parent, n = 36, width = 0.05) {
    this.n = n;
    this.width = width;
    this.points = Array.from({ length: n }, () => new THREE.Vector3());
    this.pos = new Float32Array(n * 4 * 3);
    this.col = new Float32Array(n * 4 * 3);
    const idx = [];
    for (const off of [0, 2]) {
      for (let i = 0; i < n - 1; i++) {
        const a = i * 4 + off;
        const b = (i + 1) * 4 + off;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, ...additive }));
    this.mesh.frustumCulled = false;
    this.mesh.userData.noFit = true;
    parent.add(this.mesh);
  }

  reset(p) {
    for (const q of this.points) q.copy(p);
  }

  update(head, color, strength, widthScale = 1) {
    this.points.pop();
    this.points.unshift(this.points.length ? head.clone() : head);
    for (let i = 0; i < this.n; i++) {
      const p = this.points[i];
      const k = 1 - i / (this.n - 1);
      const w = this.width * widthScale * (0.15 + 0.85 * k);
      const o = i * 12;
      this.pos.set([p.x, p.y - w, p.z, p.x, p.y + w, p.z, p.x - w, p.y, p.z, p.x + w, p.y, p.z], o);
      const f = strength * k * k;
      for (let v = 0; v < 4; v++) this.col.set([color.r * f, color.g * f, color.b * f], o + v * 3);
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.color.needsUpdate = true;
  }
}
