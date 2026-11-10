// AR room effects: the games reach out into the real room.
//  - Room scan: a light wave runs over the real floor and up the real walls (walls and tables
//    come from WebXR plane detection, i.e. the Quest's room setup; without it, floor only).
//  - Digital rain on the real walls (optional), faster during a data storm.
//  - Ripples that spread across the real floor and walls from impacts.
//  - A light pool on the real floor below the game, tinted by the action.
//  - Escaping objects (the Pong ball after a point) that fly into the room, bounce off the
//    real floor and walls with spatial sound, and dissolve.
// Everything lives in world space (the XR reference space), outside the scene's content root.
import * as THREE from 'three';
import { hex } from './tokens.js';
import { glyphAtlas } from './pong-rain.js';
import { pointInPolygon, spatialOut } from './room-utils.js';
import { radialTexture } from './robot-visuals.js';
import { quality } from './quality.js';

const RIPS = 6;
const GRAVITY = 6.5; // a bit floaty: the ball is made of data
const UP = new THREE.Vector3(0, 1, 0);

const vertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

// Shared parts of the floor and wall shaders: scan wave, hex grid, impact ripples.
const common = /* glsl */ `
  uniform vec3 uCenter;
  uniform float uRadius;
  uniform float uScan;
  uniform vec3 uScanColor;
  uniform vec3 uGridColor;
  uniform float uTime;
  uniform vec4 uRipA[${RIPS}];
  uniform vec4 uRipB[${RIPS}];
  varying vec3 vWorld;

  float hexEdge(vec2 p, float size) {
    p /= size;
    const vec2 s = vec2(1.0, 1.7320508);
    vec4 hc = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
    vec4 h = vec4(p - hc.xy * s, p - (hc.zw + 0.5) * s);
    vec2 q = dot(h.xy, h.xy) < dot(h.zw, h.zw) ? h.xy : h.zw;
    q = abs(q);
    return 0.5 - max(dot(q, s * 0.5), q.x);
  }

  vec3 effects(vec2 gridP, float d, out float trail) {
    float edge = 1.0 - smoothstep(0.0, 0.04, hexEdge(gridP, 0.2));
    float band = exp(-pow((d - uRadius) / 0.1, 2.0)) * uScan;
    trail = smoothstep(uRadius + 0.04, uRadius - 0.04, d) * smoothstep(uRadius - 2.2, uRadius - 0.15, d) * uScan;
    vec3 col = uScanColor * band * 1.3 + uGridColor * edge * trail * 0.55;
    for (int i = 0; i < ${RIPS}; i++) {
      vec4 a = uRipA[i];
      vec4 b = uRipB[i];
      if (b.w <= 0.0) continue;
      float rd = distance(vWorld, a.xyz);
      float front = a.w * 1.7;
      float fade = b.w * exp(-a.w * 1.4);
      float ring = exp(-pow((rd - front) / 0.045, 2.0));
      float inner = edge * smoothstep(front + 0.03, front - 0.25, rd) * smoothstep(front - 0.7, front - 0.25, rd);
      col += b.rgb * (ring + inner * 0.7) * fade;
    }
    return col;
  }

  void finish(vec3 col) {
    float m = max(max(col.r, col.g), col.b);
    if (m < 0.004) discard;
    float a = min(m, 1.0);
    gl_FragColor = vec4(col / m, a);
  }
`;

const floorFragment = /* glsl */ `
  ${common}
  uniform float uMaxR;
  void main() {
    float d = distance(vWorld.xz, uCenter.xz);
    float trail;
    vec3 col = effects(vWorld.xz, d, trail);
    col *= smoothstep(uMaxR, uMaxR - 1.2, d);
    finish(col);
  }
`;

const wallFragment = /* glsl */ `
  ${common}
  uniform sampler2D uAtlas;
  uniform vec3 uTangent;
  uniform float uTop;
  uniform float uRain;
  uniform float uBoost;
  uniform vec3 uRainColor;
  uniform vec3 uRainHead;
  uniform float uSeed;

  float h1(float n) { return fract(sin(n * 12.9898 + uSeed * 78.233) * 43758.5453); }
  float h2(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uSeed * 3.17) * 43758.5453); }

  // Falling code columns in world units, starting at the top of the wall.
  vec3 rain(vec2 uv) {
    vec2 g = vec2(uv.x / 0.075, (uTop - uv.y) / 0.095);
    vec2 cell = floor(g);
    vec2 f = fract(g);
    float col = cell.x;
    if (h1(col + 0.5) > 0.42) return vec3(0.0);
    float speed = mix(3.0, 8.0, h1(col + 3.1)) * (1.0 + uBoost);
    float trailLen = mix(6.0, 18.0, h1(col + 7.7));
    float rows = max(4.0, uTop / 0.095);
    float cycle = rows + trailLen + mix(6.0, 30.0, h1(col + 1.3));
    float head = mod(uTime * speed + h1(col + 5.0) * cycle, cycle);
    float dd = head - cell.y;
    if (dd < 0.0 || dd > trailLen) return vec3(0.0);
    float b = 1.0 - dd / trailLen;
    b *= b;
    float isHead = step(dd, 1.0);
    float rate = mix(0.6, 5.0, h2(cell * 0.37));
    float gi = floor(h2(cell + floor(uTime * rate + h2(cell) * 9.0)) * 64.0);
    vec2 fu = vec2(f.x, 1.0 - f.y);
    vec2 a = (vec2(mod(gi, 8.0), floor(gi / 8.0)) + 0.06 + fu * 0.88) / 8.0;
    vec2 dx = dFdx(g) * 0.88 / 8.0;
    vec2 dy = dFdy(g) * 0.88 / 8.0;
    dx.y = -dx.y;
    dy.y = -dy.y;
    float glyph = textureGrad(uAtlas, a, dx, dy).r;
    return mix(uRainColor, uRainHead, isHead * 0.85) * glyph * (b * 0.8 + isHead);
  }

  void main() {
    vec2 uv = vec2(dot(vWorld, uTangent), vWorld.y);
    float d = distance(vWorld.xz, uCenter.xz);
    float trail;
    vec3 col = effects(uv, d, trail);
    // The rain shows where the scan has already passed.
    float revealed = smoothstep(uRadius + 0.05, uRadius - 0.4, d);
    if (uRain > 0.0) col += rain(uv) * uRain * revealed;
    finish(col);
  }
`;

// Light-up floor tiles around the player: every tile you step on glows and fades out.
const STEPS = 12;
const tileFragment = /* glsl */ `
  uniform vec4 uSteps[${STEPS}];
  uniform vec3 uPlayer;
  uniform float uTile;
  uniform vec3 uEdgeColor;
  uniform vec3 uLitColor;
  uniform float uOn;
  uniform float uTime;
  uniform sampler2D uAtlas;
  varying vec3 vWorld;
  float hash(vec2 c) { return fract(sin(dot(c, vec2(41.31, 289.7))) * 43758.5453); }
  void main() {
    vec2 p = vWorld.xz / uTile;
    vec2 cell = floor(p);
    vec2 f = fract(p);
    float ed = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)) * uTile; // meters to the tile edge
    float near = smoothstep(2.4, 0.7, distance(vWorld.xz, uPlayer.xz));
    float line = (1.0 - smoothstep(0.004, 0.02, ed)) * near * 0.5;
    float lit = 0.0;
    float flash = 0.0;
    for (int i = 0; i < ${STEPS}; i++) {
      vec4 s = uSteps[i];
      if (s.w <= 0.0) continue;
      vec2 dc = abs(cell - s.xy);
      float m = dc.x + dc.y;
      float fade = s.w * exp(-s.z * 0.9);
      if (m < 0.5) { lit = max(lit, fade); flash = max(flash, s.w * exp(-s.z * 7.0)); }
      else if (m < 1.5) lit = max(lit, s.w * 0.35 * exp(-s.z * 4.0));
    }
    float rim = pow(1.0 - clamp(ed / (uTile * 0.5), 0.0, 1.0), 4.0);
    // Magic: a slowly turning light shimmer and a glowing rune in every lit tile.
    float shimmer = 0.5 + 0.5 * sin((p.x * 0.7 + p.y) * 9.0 + uTime * 3.0) * sin((p.x - p.y * 0.6) * 7.0 - uTime * 2.2);
    vec2 rq = (f - 0.5) / 0.62 + 0.5;
    float rune = 0.0;
    if (lit > 0.02 && all(greaterThan(rq, vec2(0.0))) && all(lessThan(rq, vec2(1.0)))) {
      float gi = floor(hash(cell) * 64.0);
      vec2 a = (vec2(mod(gi, 8.0), floor(gi / 8.0)) + 0.06 + rq * 0.88) / 8.0;
      rune = texture(uAtlas, a).r;
    }
    float glow = lit * (0.12 + 0.8 * rim + 0.18 * shimmer) + flash * 0.5;
    vec3 col = (uEdgeColor * line + uLitColor * glow * 1.15 + mix(uLitColor, vec3(1.0), 0.5) * rune * lit * (0.55 + flash)) * uOn;
    float mx = max(max(col.r, col.g), col.b);
    if (mx < 0.004) discard;
    gl_FragColor = vec4(col / mx, min(mx, 1.0));
  }
`;

/** Spatial "data thud" at a world position (HRTF panning, so you hear where it bounced). */
function spatialThud(engine, pos, strength = 1) {
  const out = spatialOut(engine, pos);
  if (!out) return;
  const { a, p } = out;
  const t0 = a.currentTime;
  const v = Math.min(1, strength);
  const voice = (type, f0, f1, dur, gain) => {
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain * v, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(p);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  };
  voice('sine', 170, 55, 0.28, 0.6);
  voice('triangle', 1250, 700, 0.12, 0.14);
}

export class ARRoom {
  /**
   * @param scene  the game scene (BaseScene)
   * @param opts   scan / grid / rain tokens; rain: digital rain on the real walls
   */
  constructor(scene, {
    scan = 'xr-pong-rail', grid = 'xr-pong-circuit', rain = false, rainColor = 'xr-pong-rain', rainHead = 'xr-pong-rain-head',
    tileEdge = 'xr-pong-rail', tileLit = 'xr-pong-player', tile = 0.5,
  } = {}) {
    this.scene = scene;
    this.engine = scene.engine;
    this.group = new THREE.Group();
    this.group.name = 'ARRoom';
    this.engine.scene.add(this.group);
    this.time = 0;
    this.scanT = -1;
    this.rainOn = rain;
    this.rainLevel = 0;
    this.ripIndex = 0;
    this.rips = Array.from({ length: RIPS }, () => ({ age: 0, strength: 0 }));
    this.shared = {
      uCenter: { value: new THREE.Vector3() },
      uRadius: { value: 0 },
      uScan: { value: 0 },
      uScanColor: { value: new THREE.Color(hex(scan)) },
      uGridColor: { value: new THREE.Color(hex(grid)) },
      uTime: { value: 0 },
      uRipA: { value: Array.from({ length: RIPS }, () => new THREE.Vector4()) },
      uRipB: { value: Array.from({ length: RIPS }, () => new THREE.Vector4()) },
    };
    this.wallShared = {
      uAtlas: { value: glyphAtlas() },
      uRain: { value: 0 },
      uBoost: { value: 0 },
      uRainColor: { value: new THREE.Color(hex(rainColor)) },
      uRainHead: { value: new THREE.Color(hex(rainHead)) },
    };
    const matOpts = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide };

    // Real floor (y from the reference space): one big disc, only drawn while something happens.
    this.floorMat = new THREE.ShaderMaterial({ uniforms: { ...this.shared, uMaxR: { value: 6 } }, vertexShader: vertex, fragmentShader: floorFragment, ...matOpts });
    this.floor = new THREE.Mesh(new THREE.CircleGeometry(6, 72), this.floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.frustumCulled = false;
    this.floor.renderOrder = -5;
    this.group.add(this.floor);

    // Light pool on the floor below the game.
    this.pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      map: radialTexture(), color: hex(scan), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.renderOrder = -4;
    this.group.add(this.pool);

    // Impact rings (oriented to the surface they hit).
    const ringGeo = new THREE.RingGeometry(0.82, 1, 48);
    this.rings = Array.from({ length: 10 }, () => {
      const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false;
      m.userData = { life: 0, max: 1, size: 0.3 };
      this.group.add(m);
      return m;
    });
    this.ringNext = 0;

    // Light-up floor tiles that follow the player (switch on with tilesOn).
    this.tilesOn = false;
    this.tileLevel = 0;
    this.steps = Array.from({ length: STEPS }, () => ({ x: 0, z: 0, age: 0, strength: 0 }));
    this.stepNext = 0;
    this.cell = null;
    this.tileU = {
      uSteps: { value: Array.from({ length: STEPS }, () => new THREE.Vector4()) },
      uPlayer: { value: new THREE.Vector3() },
      uTile: { value: tile },
      uEdgeColor: { value: new THREE.Color(hex(tileEdge)) },
      uLitColor: { value: new THREE.Color(hex(tileLit)) },
      uOn: { value: 0 },
      uTime: { value: 0 },
      uAtlas: { value: glyphAtlas() },
    };
    this.tiles = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 5.5), new THREE.ShaderMaterial({ uniforms: this.tileU, vertexShader: vertex, fragmentShader: tileFragment, ...matOpts }));
    this.tiles.rotation.x = -Math.PI / 2;
    this.tiles.frustumCulled = false;
    this.tiles.renderOrder = -6;
    this.tiles.visible = false;
    this.group.add(this.tiles);

    // Rising sparkles and short light columns from the tiles you step on.
    const SPARKS = 96;
    this.sparkData = Array.from({ length: SPARKS }, () => ({ life: 0, max: 1, vx: 0, vy: 0, vz: 0, phase: Math.random() * 6 }));
    this.sparkNext = 0;
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(SPARKS * 3), 3));
    sg.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(SPARKS * 3), 3));
    this.sparks = new THREE.Points(sg, new THREE.PointsMaterial({
      size: 0.06, map: radialTexture(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.sparks.frustumCulled = false;
    this.group.add(this.sparks);
    const colGeo = new THREE.CylinderGeometry(1, 1, 1, 32, 1, true).translate(0, 0.5, 0);
    this.columns = Array.from({ length: 4 }, () => {
      const m = new THREE.Mesh(colGeo, new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color() }, uFade: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 uColor; uniform float uFade; varying vec2 vUv; void main() { float a = pow(1.0 - vUv.y, 2.2) * uFade * (0.75 + 0.25 * sin(vUv.x * 62.83)); gl_FragColor = vec4(uColor, a); }',
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }));
      m.visible = false;
      m.userData = { life: 0 };
      this.group.add(m);
      return m;
    });
    this.colNext = 0;

    this.planeMeshes = new Map(); // engine plane entry -> { mesh, line, version }
    this.ghosts = [];
  }

  get floorY() {
    return this.engine.floorY;
  }

  /** True when the headset reported real walls or tables. */
  get hasPlanes() {
    return this.planeMeshes.size > 0;
  }

  /** Starts the scan wave at a world position (projected onto the floor). */
  scan(center, { duration = 2.6, radius = 6.5 } = {}) {
    this.shared.uCenter.value.set(center.x, this.floorY, center.z);
    this.floor.position.set(center.x, this.floorY + 0.004, center.z);
    this.scanT = 0;
    this.scanDur = duration;
    this.scanR = radius;
  }

  /** A ripple spreading over the real floor and walls from a world position. */
  ripple(pos, color, strength = 1) {
    if (quality.lite && strength < 0.9) return; // lite: only the big waves
    const i = this.ripIndex++ % RIPS;
    this.rips[i].age = 0;
    this.rips[i].strength = strength;
    this.shared.uRipA.value[i].set(pos.x, pos.y, pos.z, 0);
    const c = new THREE.Color(color);
    this.shared.uRipB.value[i].set(c.r, c.g, c.b, strength);
  }

  /** Expanding ring flat on a surface (normal in world space). */
  ring(pos, normal, color, size = 0.35, life = 0.7) {
    const m = this.rings[this.ringNext++ % this.rings.length];
    m.visible = true;
    m.position.copy(pos).addScaledVector(normal, 0.006);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    m.material.color.set(color);
    m.userData.life = 0;
    m.userData.max = life;
    m.userData.size = size;
  }

  /** Light pool on the floor below a world position. */
  setPool(pos, color, intensity, size = 1.6) {
    this.pool.position.set(pos.x, this.floorY + 0.006, pos.z);
    this.pool.scale.setScalar(size);
    this.pool.material.color.set(color);
    this.pool.material.opacity = THREE.MathUtils.clamp(intensity, 0, 1);
  }

  /**
   * Throws an object into the room (world position and velocity). It bounces off the real
   * floor and walls, then dissolves. Returns the ghost; onBounce(pos, normal) per contact.
   */
  launch(object, pos, vel, { radius = 0.04, color = 0xffffff, life = 3.2, bounces = 4, onDone, onBounce } = {}) {
    object.position.copy(pos);
    this.group.add(object);
    const ghost = { object, vel: vel.clone(), radius, color, age: 0, life, bounces, onDone, onBounce, spin: new THREE.Vector3(Math.random() * 8 - 4, Math.random() * 8 - 4, Math.random() * 8 - 4) };
    this.ghosts.push(ghost);
    return ghost;
  }

  /** Reflects a moving sphere off the floor or a detected plane; returns the contact or null. */
  _collide(p, v, r) {
    const fy = this.floorY;
    if (p.y - r < fy && v.y < 0) {
      p.y = fy + r;
      return { point: new THREE.Vector3(p.x, fy, p.z), normal: UP.clone() };
    }
    const planes = this.engine.roomPlanes;
    if (!planes?.size) return null;
    const local = new THREE.Vector3();
    for (const e of planes.values()) {
      if (!e.polygon || e.label === 'floor') continue;
      local.copy(p).applyMatrix4(e.inverse);
      if (Math.abs(local.y) > r || !pointInPolygon(local.x, local.z, e.polygon)) continue;
      const n = new THREE.Vector3().setFromMatrixColumn(e.matrix, 1).normalize();
      if (local.y < 0) n.negate();
      if (v.dot(n) >= 0) continue;
      p.addScaledVector(n, r - Math.abs(local.y));
      return { point: p.clone().addScaledVector(n, -r), normal: n };
    }
    return null;
  }

  _syncPlanes() {
    const planes = this.engine.roomPlanes;
    const live = new Set(planes.values());
    for (const [e, rec] of this.planeMeshes) {
      if (!live.has(e)) {
        rec.mesh.removeFromParent();
        rec.mesh.geometry.dispose();
        rec.mesh.material.dispose();
        rec.line.removeFromParent();
        rec.line.geometry.dispose();
        rec.line.material.dispose();
        this.planeMeshes.delete(e);
      }
    }
    for (const e of planes.values()) {
      if (!e.polygon || e.polygon.length < 3) continue;
      if (e.label === 'floor' || e.label === 'ceiling') continue;
      const vertical = e.orientation === 'vertical';
      let rec = this.planeMeshes.get(e);
      if (!rec || rec.version !== e.version) {
        if (rec) {
          rec.mesh.geometry.dispose();
          rec.line.geometry.dispose();
        }
        const tris = THREE.ShapeUtils.triangulateShape(e.polygon, []);
        const pos = [];
        for (const t of tris) for (const k of t) pos.push(e.polygon[k].x, 0.004, e.polygon[k].y);
        const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        const outline = new THREE.BufferGeometry().setFromPoints(e.polygon.map((q) => new THREE.Vector3(q.x, 0.006, q.y)));
        if (!rec) {
          const uniforms = vertical
            ? { ...this.shared, ...this.wallShared, uTangent: { value: new THREE.Vector3(1, 0, 0) }, uTop: { value: 2 }, uSeed: { value: Math.random() * 10 } }
            : { ...this.shared, uMaxR: { value: 99 } };
          const mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
            uniforms, vertexShader: vertex, fragmentShader: vertical ? wallFragment : floorFragment,
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
          }));
          mesh.matrixAutoUpdate = false;
          mesh.frustumCulled = false;
          mesh.renderOrder = -5;
          const line = new THREE.LineLoop(outline, new THREE.LineBasicMaterial({
            color: this.shared.uScanColor.value, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
          }));
          line.matrixAutoUpdate = false;
          line.frustumCulled = false;
          this.group.add(mesh, line);
          rec = { mesh, line, vertical };
          this.planeMeshes.set(e, rec);
        } else {
          rec.mesh.geometry = geo;
          rec.line.geometry = outline;
        }
        rec.version = e.version;
      }
      rec.mesh.matrix.copy(e.matrix);
      rec.line.matrix.copy(e.matrix);
      if (vertical) {
        // Horizontal direction along the wall and its top edge, for the rain in world units.
        const n = new THREE.Vector3().setFromMatrixColumn(e.matrix, 1);
        const tangent = new THREE.Vector3().crossVectors(UP, n);
        if (tangent.lengthSq() > 1e-6) rec.mesh.material.uniforms.uTangent.value.copy(tangent.normalize());
        let top = -Infinity;
        const w = new THREE.Vector3();
        for (const q of e.polygon) top = Math.max(top, w.set(q.x, 0, q.y).applyMatrix4(e.matrix).y);
        rec.mesh.material.uniforms.uTop.value = top;
      }
    }
  }

  update(dt) {
    this.time += dt;
    const sh = this.shared;
    sh.uTime.value = this.time;
    // Scan wave
    let scanVis = 0;
    if (this.scanT >= 0) {
      this.scanT += dt;
      const k = Math.min(1, this.scanT / this.scanDur);
      sh.uRadius.value = (1 - (1 - k) ** 2) * this.scanR;
      scanVis = k < 0.85 ? 1 : 1 - (k - 0.85) / 0.15;
      if (k >= 1) { this.scanT = -1; sh.uRadius.value = 99; } // everything stays revealed
    }
    sh.uScan.value = scanVis;
    // Ripples
    let ripActive = false;
    this.rips.forEach((r, i) => {
      if (r.strength <= 0) return;
      r.age += dt;
      if (r.age > 2.2) { r.strength = 0; sh.uRipB.value[i].w = 0; return; }
      sh.uRipA.value[i].w = r.age;
      ripActive = true;
    });
    this.floor.visible = scanVis > 0 || ripActive;
    if (this.floor.visible && this.scanT < 0) {
      // Ripples on the floor can happen anywhere: keep the disc centered on the newest one.
      const last = sh.uRipA.value[(this.ripIndex - 1 + RIPS) % RIPS];
      this.floor.position.set(last.x, this.floorY + 0.004, last.z);
      sh.uCenter.value.set(last.x, this.floorY, last.z);
      sh.uRadius.value = 99;
    }
    // Real walls and tables
    if (this.engine.isXR) this._syncPlanes();
    this.rainLevel += ((this.rainOn && !quality.lite ? 1 : 0) - this.rainLevel) * Math.min(1, dt * 1.5);
    this.wallShared.uRain.value = this.rainLevel * 0.85;
    for (const rec of this.planeMeshes.values()) {
      rec.mesh.visible = scanVis > 0 || ripActive || (rec.vertical && this.rainLevel > 0.01);
      rec.line.material.opacity = Math.max(scanVis * 0.9, 0.18 * this.rainLevel);
      rec.line.visible = rec.line.material.opacity > 0.01;
    }
    // Rings
    for (const m of this.rings) {
      if (!m.visible) continue;
      const u = m.userData;
      u.life += dt;
      const k = u.life / u.max;
      if (k >= 1) { m.visible = false; continue; }
      m.scale.setScalar(u.size * (0.15 + 0.85 * (1 - (1 - k) ** 3)));
      m.material.opacity = (1 - k) * 0.95;
    }
    // Floor tiles under the player's feet
    this._updateTiles(dt);
    this._updateMagic(dt);
    // Escaped objects
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      g.age += dt;
      const o = g.object;
      if (g.dying !== undefined) {
        g.dying += dt;
        const k = g.dying / 0.35;
        o.scale.multiplyScalar(Math.max(0.01, 1 - dt * 3));
        if (k >= 1) {
          o.removeFromParent();
          this.ghosts.splice(i, 1);
          g.onDone?.(o.position.clone());
        }
        continue;
      }
      g.vel.y -= GRAVITY * dt;
      o.position.addScaledVector(g.vel, dt);
      o.rotation.x += g.spin.x * dt;
      o.rotation.y += g.spin.y * dt;
      const hit = this._collide(o.position, g.vel, g.radius);
      if (hit) {
        const speed = g.vel.length();
        const vn = g.vel.dot(hit.normal);
        g.vel.addScaledVector(hit.normal, -2 * vn).multiplyScalar(0.62);
        g.spin.multiplyScalar(0.7);
        g.bounces -= 1;
        if (speed > 0.6) {
          this.ring(hit.point, hit.normal, g.color, 0.18 + speed * 0.12, 0.7);
          this.ripple(hit.point, g.color, Math.min(1, 0.35 + speed * 0.3));
          spatialThud(this.engine, hit.point, speed / 3);
          g.onBounce?.(hit.point, hit.normal);
        }
      }
      if (g.age > g.life || g.bounces < 0 || o.position.y < this.floorY - 1) g.dying = 0;
    }
  }

  /** Sparkles rise and a light column grows from a tile. */
  _stepMagic(c, T) {
    if (quality.lite) return;
    const lit = this.tileU.uLitColor.value;
    const edge = this.tileU.uEdgeColor.value;
    for (let i = 0; i < 16; i++) {
      const d = this.sparkData[this.sparkNext++ % this.sparkData.length];
      d.life = 0;
      d.max = 1.1 + Math.random() * 0.9;
      d.x = c.x + (Math.random() - 0.5) * T * 0.9;
      d.y = c.y + 0.01;
      d.z = c.z + (Math.random() - 0.5) * T * 0.9;
      d.vx = (Math.random() - 0.5) * 0.08;
      d.vy = 0.25 + Math.random() * 0.45;
      d.vz = (Math.random() - 0.5) * 0.08;
      d.color = (Math.random() < 0.35 ? new THREE.Color(1, 1, 1) : Math.random() < 0.5 ? lit : edge).clone();
    }
    const col = this.columns[this.colNext++ % this.columns.length];
    col.visible = true;
    col.position.copy(c);
    col.scale.set(T * 0.42, 1.2, T * 0.42);
    col.material.uniforms.uColor.value.copy(lit).lerp(edge, 0.35);
    col.userData.life = 0;
  }

  _updateMagic(dt) {
    const pos = this.sparks.geometry.attributes.position;
    const colr = this.sparks.geometry.attributes.color;
    let any = false;
    this.sparkData.forEach((d, i) => {
      if (!d.color || d.life >= d.max) { colr.setXYZ(i, 0, 0, 0); return; }
      any = true;
      d.life += dt;
      d.x += d.vx * dt + Math.sin(this.time * 3 + d.phase) * 0.02 * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt + Math.cos(this.time * 3 + d.phase) * 0.02 * dt;
      d.vy *= 1 - dt * 0.6;
      const k = d.life / d.max;
      const tw = (0.55 + 0.45 * Math.sin(this.time * 18 + d.phase * 5)) * (1 - k) * Math.min(1, d.life * 8);
      pos.setXYZ(i, d.x, d.y, d.z);
      colr.setXYZ(i, d.color.r * tw, d.color.g * tw, d.color.b * tw);
    });
    pos.needsUpdate = true;
    colr.needsUpdate = true;
    this.sparks.visible = any;
    for (const m of this.columns) {
      if (!m.visible) continue;
      m.userData.life += dt;
      const k = m.userData.life / 0.9;
      if (k >= 1) { m.visible = false; continue; }
      m.scale.y = 0.25 + 0.75 * (1 - (1 - k) ** 3);
      m.material.uniforms.uFade.value = (1 - k) * 0.7;
    }
  }

  /** Where the player stands: the head projected onto the floor. */
  _playerPos() {
    if (this.engine.isXR) return this.engine.head.pos;
    return this.engine.camera.getWorldPosition(new THREE.Vector3());
  }

  _updateTiles(dt) {
    if (quality.lite && this.tilesOn) this.tileLevel = 0; // lite: no light tiles
    this.tileLevel += ((this.tilesOn && !quality.lite ? 1 : 0) - this.tileLevel) * Math.min(1, dt * 2);
    this.tiles.visible = this.tileLevel > 0.01;
    if (!this.tiles.visible) { this.cell = null; return; }
    const u = this.tileU;
    u.uOn.value = this.tileLevel;
    u.uTime.value = this.time;
    const p = this._playerPos();
    const T = u.uTile.value;
    u.uPlayer.value.set(p.x, this.floorY, p.z);
    this.tiles.position.set(p.x, this.floorY + 0.002, p.z);
    const cx = Math.floor(p.x / T);
    const cz = Math.floor(p.z / T);
    if (!this.cell || this.cell.x !== cx || this.cell.z !== cz) {
      // Stepped onto a new tile: it flashes up, the neighbors glow briefly.
      const s = this.steps[this.stepNext++ % STEPS];
      Object.assign(s, { x: cx, z: cz, age: 0, strength: 1 });
      this.cell = { x: cx, z: cz, step: s };
      if (this.tilesOn) {
        const c = new THREE.Vector3((cx + 0.5) * T, this.floorY, (cz + 0.5) * T);
        this._stepMagic(c, T);
        this.onStep?.(c);
      }
    }
    this.cell.step.age = Math.min(this.cell.step.age, 0.15); // the tile you stand on stays lit
    this.steps.forEach((s, i) => {
      if (s.strength <= 0) return;
      s.age += dt;
      if (s.age > 5) s.strength = 0;
      u.uSteps.value[i].set(s.x, s.z, s.age, s.strength);
    });
  }

  dispose() {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      o.geometry?.dispose();
      if (o.material && !o.userData.sharedMaterial) [].concat(o.material).forEach((m) => m.dispose());
    });
    this.ghosts = [];
    this.planeMeshes.clear();
  }
}
