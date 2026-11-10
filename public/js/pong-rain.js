// Digital rain around the Pong arena: columns of falling code glyphs (binary, hex and
// math symbols of machine learning), drawn by one shader per curtain. Original glyph set.
import * as THREE from 'three';
import { hex, color } from './tokens.js';

const GRID = 8; // glyph atlas: 8 x 8 cells
const GLYPHS = [
  '0', '1', '0', '1', '0', '1', '0', '1', '0', '1', '0', '1',
  '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F',
  'Σ', 'λ', '∂', '∇', 'π', '∞', '∫', 'θ', 'μ', 'ω', 'Δ', 'Φ', 'Ψ', 'σ', 'α', 'β', 'γ', 'ε', 'η', 'ρ', 'τ',
  '≈', '≠', '√', '±', '{', '}', '<', '>', '/', '=', '+', '*', '#', '%', '&', '|', '^',
];

let atlas = null;
export function glyphAtlas() {
  if (atlas) return atlas;
  const S = 64;
  const c = document.createElement('canvas');
  c.width = c.height = S * GRID;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${S * 0.72}px ${color('font-mono')}`;
  GLYPHS.slice(0, GRID * GRID).forEach((g, i) => {
    const x = (i % GRID) * S + S / 2;
    const y = Math.floor(i / GRID) * S + S / 2;
    // Every fourth glyph is mirrored, which reads as "machine" rather than as text.
    ctx.save();
    ctx.translate(x, y);
    if (i % 4 === 3) ctx.scale(-1, 1);
    ctx.fillText(g, 0, S * 0.04);
    ctx.restore();
  });
  atlas = new THREE.CanvasTexture(c);
  atlas.anisotropy = 4;
  return atlas;
}

const vertex = /* glsl */ `
  varying vec2 vUv;
  varying float vFacing;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec3 n = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, 1.0));
    // Seen edge-on, the glyph rows would collapse into streaks: fade them out.
    vFacing = abs(dot(n, normalize(cameraPosition - world.xyz)));
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragment = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform float uTime;
  uniform vec3 uColor;
  uniform vec3 uHead;
  uniform vec2 uGrid;
  uniform float uOpacity;
  uniform float uSeed;
  uniform float uDensity;
  uniform float uBoost;
  uniform float uCount;
  uniform float uTurn;
  varying vec2 vUv;
  varying float vFacing;

  float h1(float n) { return fract(sin(n * 12.9898 + uSeed * 78.233) * 43758.5453); }
  float h2(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uSeed * 3.17) * 43758.5453); }

  void main() {
    vec2 g = vUv * uGrid;
    vec2 cell = floor(g);
    vec2 f = fract(g);
    float col = cell.x;
    if (h1(col + 0.5) > uDensity) discard; // sparse columns keep the room visible
    float speed = mix(2.5, 7.5, h1(col + 3.1)) * (1.0 + uBoost);
    float trail = mix(5.0, 15.0, h1(col + 7.7));
    float rowFromTop = uGrid.y - 1.0 - cell.y;
    float cycle = uGrid.y + trail + mix(4.0, 26.0, h1(col + 1.3));
    float head = mod(uTime * speed + h1(col + 5.0) * cycle, cycle);
    float d = head - rowFromTop;
    if (d < 0.0 || d > trail) discard;
    float b = 1.0 - d / trail;
    b *= b;
    float isHead = step(d, 1.0);
    // The glyph in each cell flickers to a new symbol now and then.
    float rate = mix(0.6, 5.0, h2(cell * 0.37));
    float gi = floor(h2(cell + floor(uTime * rate + h2(cell) * 9.0)) * uCount);
    // Glyphs can be turned a quarter (upright on walls where the rain runs sideways).
    vec2 fq = f;
    vec2 gx = dFdx(g);
    vec2 gy = dFdy(g);
    if (uTurn > 0.5 && uTurn < 1.5) { fq = vec2(f.y, 1.0 - f.x); gx = vec2(gx.y, -gx.x); gy = vec2(gy.y, -gy.x); }
    else if (uTurn > 1.5) { fq = vec2(1.0 - f.y, f.x); gx = vec2(-gx.y, gx.x); gy = vec2(-gy.y, gy.x); }
    // Atlas row 0 is the top of the canvas (the texture is flipped): count rows from the top.
    vec2 a = (vec2(mod(gi, ${GRID}.0), ${GRID - 1}.0 - floor(gi / ${GRID}.0)) + 0.06 + fq * 0.88) / ${GRID}.0;
    vec2 dx = gx * 0.88 / ${GRID}.0;
    vec2 dy = gy * 0.88 / ${GRID}.0;
    float glyph = textureGrad(uAtlas, a, dx, dy).r;
    float edge = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.82, vUv.y)
               * smoothstep(0.0, 0.06, vUv.x) * smoothstep(1.0, 0.94, vUv.x);
    vec3 c = mix(uColor, uHead, isHead * 0.85);
    float alpha = glyph * (b * 0.8 + isHead) * edge * uOpacity * smoothstep(0.2, 0.5, vFacing);
    if (alpha < 0.01) discard;
    gl_FragColor = vec4(c, alpha);
  }
`;

/**
 * One curtain of rain: a plane of width x height (local units) with glyph cells of size `cell`.
 * The glyphs fall towards the plane's -y. colorToken / headToken: glyph and leading glyph
 * colors; glyphs: how many atlas glyphs are used (12 = only 0 and 1); turn: 0 upright, 1 / 2
 * a quarter turn one way or the other.
 * Returns the mesh; call mesh.userData.tick(time, boost) every frame.
 */
export function makeRainCurtain(width, height, {
  cell = 0.04, opacity = 0.6, density = 0.55, seed = 1,
  colorToken = 'xr-pong-rain', headToken = 'xr-pong-rain-head', glyphs = GRID * GRID, turn = 0,
} = {}) {
  const uniforms = {
    uAtlas: { value: glyphAtlas() },
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(hex(colorToken)) },
    uHead: { value: new THREE.Color(hex(headToken)) },
    uGrid: { value: new THREE.Vector2(Math.round(width / cell), Math.round(height / (cell * 1.25))) },
    uOpacity: { value: opacity },
    uSeed: { value: seed },
    uDensity: { value: density },
    uBoost: { value: 0 },
    uCount: { value: glyphs },
    uTurn: { value: turn },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, vertexShader: vertex, fragmentShader: fragment,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
  mesh.userData.noFit = true;
  mesh.userData.tick = (time, boost = 0) => {
    uniforms.uTime.value = time;
    uniforms.uBoost.value += (boost - uniforms.uBoost.value) * 0.05;
  };
  // The shared atlas is a uniform, not a material map, so disposing the scene keeps it.
  return mesh;
}

/**
 * Rain curtains around the tunnel (both sides, a second layer further out and one behind
 * the AI). floorY is the room floor in arena units, so the rain falls to the ground.
 */
export function makeDataRain({ hw, len, floorY, top = 1.1 }) {
  const g = new THREE.Group();
  const h = top - floorY;
  const cy = (top + floorY) / 2;
  const curtains = [];
  const add = (w, x, z, rotY, opts) => {
    const c = makeRainCurtain(w, h, opts);
    c.position.set(x, cy, z);
    c.rotation.y = rotY;
    g.add(c);
    curtains.push(c);
  };
  // The side curtains end in front of the player, so nobody stands inside the rain.
  const sideLen = len + 0.9;
  const sideZ = -0.55;
  add(sideLen, -(hw + 0.5), sideZ, Math.PI / 2, { seed: 1.3, opacity: 0.55 });
  add(sideLen, hw + 0.5, sideZ, -Math.PI / 2, { seed: 2.7, opacity: 0.55 });
  add(sideLen + 0.4, -(hw + 0.95), sideZ - 0.2, Math.PI / 2, { seed: 4.1, opacity: 0.32, cell: 0.05, density: 0.45 });
  add(sideLen + 0.4, hw + 0.95, sideZ - 0.2, -Math.PI / 2, { seed: 5.9, opacity: 0.32, cell: 0.05, density: 0.45 });
  add(2 * (hw + 0.95), 0, -len / 2 - 1.25, 0, { seed: 7.3, opacity: 0.45, cell: 0.045, density: 0.6 });
  g.userData.tick = (time, boost) => { for (const c of curtains) c.userData.tick(time, boost); };
  g.userData.curtains = curtains;
  return g;
}
