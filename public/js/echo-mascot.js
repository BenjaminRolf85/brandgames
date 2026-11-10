// Echo, the Echomotion bat mascot (Blender model assets/models/echo.glb, see blender/build_echo.py)
// flies around the player in the room. It keeps out of the field of view: it cruises at the
// sides and behind the player, steers out of the view cone when the player turns, and only
// now and then drops by at the edge of the view to wave. Colors come from design tokens; the
// Echomotion signet on its belly is the official logo (assets/echomotion-logo.png).
// With "reduce motion" it hovers still at the side with both rings fully visible (mascot guide).
import * as THREE from 'three';
import { loadGLTF } from './models.js';
import { hex } from './tokens.js';
import { pointInPolygon } from './room-utils.js';
import { EchoFace } from './echo-face.js';
import { addSantaHat } from './christmas.js';

const KEY = 'kiar.echo';
const E = 0.17; // body width in meters (the guide's unit E)
const WING_LEN = 0.74; // shoulder to tip in model units
const smooth = (k) => k * k * (3 - 2 * k);
const sstep = (e0, e1, x) => smooth(THREE.MathUtils.clamp((x - e0) / (e1 - e0), 0, 1));

let modelPromise = null;
const loadModel = () => (modelPromise ??= loadGLTF('assets/models/echo.glb'));

/** Baked ambient occlusion (grey vertex colors from Blender), softened; 1 where missing. */
function occlusion(geo, strength = 0.8) {
  const src = geo.attributes.color;
  const n = geo.attributes.position.count;
  const ao = new Float32Array(n).fill(1);
  if (src) for (let i = 0; i < n; i++) ao[i] = 1 - strength * (1 - Math.min(1, src.getX(i)));
  return ao;
}

/** Grey occlusion as vertex colors (multiplies the material color). */
function shadeWithOcclusion(geo, strength) {
  const ao = occlusion(geo, strength);
  const col = new Float32Array(ao.length * 3);
  for (let i = 0; i < ao.length; i++) col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = ao[i];
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

/** Body gradient color at a point (model units), from the tokens, mixed in sRGB. */
function gradientAt(x, y) {
  const c = new THREE.Color(hex('xr-echo-violet')).convertLinearToSRGB();
  const cyan = new THREE.Color(hex('xr-echo-cyan')).convertLinearToSRGB();
  return c.lerp(cyan, THREE.MathUtils.clamp((x - y + 1.5) / 2.5, 0, 1)).convertSRGBToLinear();
}

/**
 * Body colors from tokens: 135 deg gradient, belly patch (white 45 %), cheeks (pink 35 %).
 * matrix maps the geometry into body space (ears are their own nodes).
 */
function paintBody(geo, matrix = null) {
  const ao = occlusion(geo, 0.85);
  const violet = new THREE.Color(hex('xr-echo-violet'));
  const cyan = new THREE.Color(hex('xr-echo-cyan'));
  const white = new THREE.Color(hex('xr-echo-white'));
  const cheek = new THREE.Color(hex('xr-echo-cheek'));
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  // Mixing happens in sRGB, like the CSS gradient and the 2D artwork.
  for (const k of [violet, cyan, white, cheek]) k.convertLinearToSRGB();
  const c = new THREE.Color();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    if (matrix) v.applyMatrix4(matrix);
    const { x, y, z } = v;
    c.copy(violet).lerp(cyan, THREE.MathUtils.clamp((x - y + 1.5) / 2.5, 0, 1));
    const front = sstep(0, 0.12, z);
    const belly = (1 - sstep(0.85, 1, Math.hypot(x / 0.28, (y + 0.3) / 0.18))) * front;
    c.lerp(white, 0.45 * belly);
    for (const s of [-1, 1]) {
      const k = (1 - sstep(0.75, 1, Math.hypot((x - s * 0.27) / 0.075, (y + 0.05) / 0.05))) * front;
      c.lerp(cheek, 0.35 * k);
    }
    c.convertSRGBToLinear().multiplyScalar(ao[i]);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}

/** The official Echomotion signet (SVG) as a texture for Echo's belly. */
let logoTex = null;
function logoTexture() {
  if (logoTex) return logoTex;
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  logoTex = new THREE.CanvasTexture(c);
  logoTex.colorSpace = THREE.SRGBColorSpace;
  logoTex.anisotropy = 4;
  const img = new Image();
  img.onload = () => {
    c.getContext('2d').drawImage(img, 0, 0, 512, 512);
    logoTex.needsUpdate = true;
  };
  img.src = 'assets/echomotion-logo.png';
  return logoTex;
}

function material(name) {
  // Soft-touch vinyl look like a designer toy: a light clear coat and a velvety sheen.
  const vinyl = { roughness: 0.4, clearcoat: 0.35, clearcoatRoughness: 0.32, sheen: 0.45, sheenRoughness: 0.55 };
  switch (name) {
    case 'EchoLogo': return new THREE.MeshPhysicalMaterial({
      // A little self-lit so the ring, the arcs and the E stay readable in the belly's shade.
      name, map: logoTexture(), emissiveMap: logoTexture(), emissive: 0xffffff, emissiveIntensity: 0.5,
      vertexColors: true, transparent: true, alphaTest: 0.4, roughness: 0.45, clearcoat: 0.3, clearcoatRoughness: 0.3,
      polygonOffset: true, polygonOffsetFactor: -2,
    });
    case 'EchoBody': return new THREE.MeshPhysicalMaterial({ name, vertexColors: true, ...vinyl, sheenColor: new THREE.Color(hex('xr-echo-light')) });
    case 'EchoLight': return new THREE.MeshPhysicalMaterial({ name, color: hex('xr-echo-light'), vertexColors: true, ...vinyl, clearcoat: 0.15, sheenColor: new THREE.Color(hex('xr-echo-white')), side: THREE.DoubleSide });
    case 'EchoBone': return new THREE.MeshPhysicalMaterial({ name, color: hex('xr-echo-bone'), vertexColors: true, ...vinyl });
    case 'EchoWhite': return new THREE.MeshPhysicalMaterial({ name, color: hex('xr-echo-white'), vertexColors: true, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
    case 'EchoIris': return new THREE.MeshPhysicalMaterial({ name, color: hex('xr-echo-iris'), vertexColors: true, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05 });
    case 'EchoDeep': return new THREE.MeshPhysicalMaterial({ name, color: hex('xr-echo-deep'), vertexColors: true, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 });
    case 'EchoLid': return new THREE.MeshPhysicalMaterial({ name, roughness: 0.4, clearcoat: 0.35, clearcoatRoughness: 0.32, sheen: 0.45, sheenRoughness: 0.55, sheenColor: new THREE.Color(hex('xr-echo-light')) });
    case 'EchoCyan': return new THREE.MeshBasicMaterial({ name, color: hex('xr-echo-cyan'), transparent: true, toneMapped: false });
    default: return null;
  }
}

/**
 * Builds one Echo model instance from the loaded GLB: token colors, occlusion, wings and rings.
 * Returns { model, wings, ringNodes, rings } (model in model units, scale it yourself).
 */
export function buildEchoParts(gltf) {
  const model = gltf.scene.clone(true);
  model.updateMatrixWorld(true);
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    const mat = material(o.material.name);
    if (!mat) return;
    o.geometry = o.geometry.clone();
    if (o.material.name === 'EchoBody') {
      // Body positions live in the Body node's space (model units), as in the guide.
      paintBody(o.geometry, o.matrixWorld);
    } else if (mat.vertexColors) {
      shadeWithOcclusion(o.geometry, { EchoWhite: 0.3, EchoLight: 0.4 }[o.material.name] ?? 0.75);
    }
    o.material = mat;
  });
  // Wings: membrane plus arm and finger bones (several meshes per wing), all bent together.
  const wings = ['WingL', 'WingR'].map((name) => {
    const node = model.getObjectByName(name);
    if (!node) return null;
    const parts = [];
    node.traverse((o) => { if (o.isMesh) parts.push({ mesh: o, base: o.geometry.attributes.position.array.slice() }); });
    return { node, parts, side: name === 'WingR' ? 1 : -1 };
  }).filter(Boolean);
  const ringNodes = ['Ring1', 'Ring2'].map((name) => model.getObjectByName(name)).filter(Boolean);
  const rings = ['Ring1', 'Ring2'].map((name) => {
    const node = model.getObjectByName(name);
    const mats = [];
    node?.traverse((o) => { if (o.isMesh) mats.push(o.material); });
    return mats;
  });
  // Face: eyes with pupils and lids, ears, mouth (see echo-face.js).
  const eyes = ['L', 'R'].map((tag) => {
    const node = model.getObjectByName(`Eye${tag}`);
    const pupil = model.getObjectByName(`Pupil${tag}`);
    const lid = model.getObjectByName(`Lid${tag}`);
    const low = model.getObjectByName(`LidLow${tag}`);
    if (!node || !pupil || !lid) return null;
    const side = tag === 'R' ? 1 : -1;
    // The lids take the body color at the eye.
    const at = node.getWorldPosition(new THREE.Vector3());
    for (const l of [lid, low]) l?.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.copy(gradientAt(at.x, at.y)); } });
    return { node, pupil, lid, low, side };
  }).filter(Boolean);
  const ears = ['L', 'R'].map((tag) => {
    const node = model.getObjectByName(`Ear${tag}`);
    return node ? { node, side: tag === 'R' ? 1 : -1 } : null;
  }).filter(Boolean);
  const mouth = model.getObjectByName('Mouth');
  const mouthOpen = model.getObjectByName('MouthOpen');
  if (mouthOpen) mouthOpen.scale.setScalar(0.001);
  for (const e of eyes) { e.lid.scale.y = 0.001; if (e.low) e.low.scale.y = 0.001; }
  const face = { eyes, ears, mouth, mouthOpen };
  // Christmas: the Santa hat (hatReady resolves when it sits; nothing outside the season).
  const hatReady = addSantaHat(model);
  return { model, wings, ringNodes, rings, face, hatReady };
}

/** Loads the Echo GLB once and builds a model instance. */
export const loadEchoParts = () => loadModel().then(buildEchoParts);

/** Bends a wing progressively towards the tip (organic flap instead of a stiff board). */
export function bendWing(w, bend) {
  for (const { mesh, base: b } of w.parts) {
    const pos = mesh.geometry.attributes.position;
    const a = pos.array;
    for (let i = 0; i < a.length; i += 3) {
      const x = b[i];
      const y = b[i + 1];
      const f = Math.min(1, Math.abs(x) / WING_LEN) ** 1.6;
      const ang = w.side * bend * f;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      a[i] = x * c - y * s;
      a[i + 1] = x * s + y * c;
      a[i + 2] = b[i + 2];
    }
    pos.needsUpdate = true;
    mesh.geometry.computeVertexNormals();
  }
}

export class EchoMascot {
  constructor(engine) {
    this.engine = engine;
    this.root = new THREE.Group();
    this.root.name = 'EchoMascot';
    this.root.visible = false;
    this.body = new THREE.Group(); // bobbing and banking happen here
    this.root.add(this.body);
    engine.scene.add(this.root);
    try { this.enabled = localStorage.getItem(KEY) !== 'off'; } catch { this.enabled = true; }
    this.reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.pos = new THREE.Vector3(1.4, 2.0, 0.6);
    this.vel = new THREE.Vector3();
    this.target = this.pos.clone();
    this.retarget = 0;
    this.time = Math.random() * 10;
    this.nextVisit = 14 + Math.random() * 10;
    this.visit = null; // { side, until }
    this.yaw = 0;
    this.roll = 0;
    this.pitch = 0;
    this.flapPhase = 0;
    this.glide = 0;
    this.ready = false;
    // Companion mode (Echo as host next to a panel): a function (head, forward) -> { target, look }.
    this.companion = null;
    this.forced = false; // shown in a game even if switched off in the settings
    this.spinT = 0;
    loadModel().then((gltf) => this.build(gltf)).catch((e) => console.warn('Echo mascot not loaded', e));
  }

  build(gltf) {
    const { model, wings, rings, face } = buildEchoParts(gltf);
    this.face = new EchoFace(face);
    this.nextYawn = 40 + Math.random() * 30;
    this.nextGlance = 3 + Math.random() * 4;
    model.scale.setScalar(E);
    this.wings = wings;
    this.rings = rings;
    this.body.add(model);
    this.model = model;
    this.ready = true;
    this.root.visible = this.enabled;
  }

  setEnabled(v) {
    this.enabled = v;
    try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch { /* private mode */ }
    this.root.visible = (v || this.forced) && this.ready;
  }

  /** Game companion: Echo follows targets from fn(head, forward) -> { target, look }; null = free flight. */
  setCompanion(fn, { force = false } = {}) {
    this.companion = fn;
    this.forced = !!fn && force;
    this.visit = null;
    this.nextVisit = 20 + Math.random() * 10;
    if (!fn) this.root.visible = this.enabled && this.ready;
  }

  /** World position of Echo (for effects that start or end at Echo). */
  worldPos(out = new THREE.Vector3()) {
    return out.copy(this.pos).add(new THREE.Vector3(0, this.body.position.y, 0));
  }

  /** Happy loop in the air. */
  celebrate() { this.spinT = 1; this.face?.setMood('happy', 1.8); }

  /** Head position and direction (XR head pose or the preview camera). */
  head() {
    const e = this.engine;
    if (e.isXR) return { pos: e.head.pos, quat: e.head.quat };
    return { pos: e.camera.getWorldPosition(new THREE.Vector3()), quat: e.camera.getWorldQuaternion(new THREE.Quaternion()) };
  }

  /** Horizontal forward direction of the player. */
  forward(quat) {
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
    f.y = 0;
    return f.lengthSq() > 1e-6 ? f.normalize() : new THREE.Vector3(0, 0, -1);
  }

  /** A point around the player at an angle from the view direction (radians, + = right). */
  around(h, fwd, angle, radius, height) {
    const dir = fwd.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -angle);
    radius = this.fitRoom(h.pos, dir, radius);
    return new THREE.Vector3(h.pos.x + dir.x * radius, this.engine.floorY + height, h.pos.z + dir.z * radius);
  }

  /** Keeps a flight target inside the room when the headset reported its walls. */
  fitRoom(from, dir, radius) {
    const planes = this.engine.roomPlanes;
    if (!planes?.size) return radius;
    let best = radius;
    const n = new THREE.Vector3();
    const p0 = new THREE.Vector3();
    const local = new THREE.Vector3();
    for (const e of planes.values()) {
      if (e.orientation !== 'vertical' || !e.polygon) continue;
      n.setFromMatrixColumn(e.matrix, 1).normalize();
      p0.setFromMatrixPosition(e.matrix);
      const denom = dir.dot(n);
      if (Math.abs(denom) < 1e-4) continue;
      const d = p0.clone().sub(from).dot(n) / denom;
      if (d <= 0 || d >= best + 0.5) continue;
      local.copy(from).addScaledVector(dir, d).applyMatrix4(e.inverse);
      if (pointInPolygon(local.x, local.z, e.polygon)) best = Math.min(best, d - 0.45);
    }
    return Math.max(0.9, best);
  }

  pickTarget(h, fwd) {
    const eyeH = h.pos.y - this.engine.floorY;
    if (this.visit) {
      // Drop by at the edge of the view, above the panels (which sit around eye level), and wave.
      const a = 0.74 * this.visit.side;
      this.target.copy(this.around(h, fwd, a, 1.7, eyeH + 0.42));
      return;
    }
    // Cruise at the sides and behind the player, above eye level. Mostly stay on the current
    // side; changing sides goes in a wide arc behind the player (never past the head).
    const rel = this.pos.clone().sub(h.pos);
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const current = Math.sign(rel.dot(right)) || 1;
    const side = Math.random() < 0.75 ? current : -current;
    const radius = 1.5 + Math.random() * 1.1;
    const height = eyeH + 0.15 + Math.random() * 0.55;
    if (side !== current && !this.via) {
      this.via = true;
      this.target.copy(this.around(h, fwd, Math.PI, 2.0, height));
      this.retarget = 6;
      return;
    }
    this.via = false;
    const angle = side * THREE.MathUtils.degToRad(70 + Math.random() * 100);
    this.target.copy(this.around(h, fwd, angle, radius, height));
    this.retarget = 3.5 + Math.random() * 3.5;
  }

  /** Hides the flying mascot (e.g. while the player fights as Echo). */
  suppress(v) {
    this.suppressed = v;
    if (v) this.root.visible = false;
  }

  update(dt) {
    if (this.suppressed) { this.root.visible = false; return; }
    if (!this.ready || (!this.enabled && !this.forced)) return;
    this.root.visible = true;
    this.time += dt;
    const h = this.head();
    const fwd = this.forward(h.quat);
    const hover = this.reduced;
    if (!this.started) {
      // Start at a cruising spot at the side, never next to the head.
      this.started = true;
      this.pickTarget(h, fwd);
      this.pos.copy(this.target);
    }

    // ----- where to fly -----
    if (hover) {
      // Reduced motion: still, at the side, rings fully visible.
      if (!this.parked || this.parked.distanceToSquared(h.pos) > 4) {
        this.parked = h.pos.clone();
        this.pos.copy(this.around(h, fwd, 1.2, 1.6, h.pos.y - this.engine.floorY + 0.25));
      }
      this.vel.set(0, 0, 0);
    } else if (this.companion) {
      // Game companion: go where the game wants Echo, quicker, close to the player is fine.
      const c = this.companion(h, fwd);
      this.target.copy(c.target);
      this.look = c.look ?? null;
      const toT = this.target.clone().sub(this.pos);
      const dist = toT.length();
      const desired = dist > 1e-4 ? toT.multiplyScalar((1.4 * Math.min(1, dist / 0.5)) / dist) : new THREE.Vector3();
      desired.y += Math.sin(this.time * 1.3) * 0.05;
      const rel = this.pos.clone().sub(h.pos);
      if (rel.length() < 0.5) desired.addScaledVector(rel.normalize(), 1.2);
      const acc = desired.sub(this.vel);
      if (acc.length() > 3) acc.setLength(3);
      this.lastAcc = acc.clone();
      this.vel.addScaledVector(acc, Math.min(dt * 3, 1));
      this.pos.addScaledVector(this.vel, dt);
    } else {
      this.nextVisit -= dt;
      if (!this.visit && this.nextVisit <= 0) {
        this.visit = { side: Math.random() < 0.5 ? -1 : 1, until: Infinity, arrived: false };
        this.pickTarget(h, fwd);
      }
      if (this.visit) {
        this.pickTarget(h, fwd); // follow the view edge while visiting
        if (!this.visit.arrived && this.pos.distanceTo(this.target) < 0.25) {
          this.visit.arrived = true;
          this.visit.until = this.time + 2.8;
        }
        if (this.time > this.visit.until || this.time > (this.visit.start ??= this.time) + 12) {
          this.visit = null;
          this.nextVisit = 25 + Math.random() * 20;
          this.pickTarget(h, fwd);
        }
      } else {
        this.retarget -= dt;
        if (this.retarget <= 0 || this.pos.distanceTo(this.target) < 0.3) this.pickTarget(h, fwd);
      }

      // ----- steering -----
      const toT = this.target.clone().sub(this.pos);
      const dist = toT.length();
      const maxSpeed = this.visit ? 0.75 : 0.9;
      const desired = dist > 1e-4 ? toT.multiplyScalar((maxSpeed * Math.min(1, dist / 0.7)) / dist) : new THREE.Vector3();
      // Wander: a lazy figure-eight on top of the path.
      desired.x += Math.sin(this.time * 0.7) * 0.12;
      desired.y += Math.sin(this.time * 1.1) * 0.08;
      desired.z += Math.cos(this.time * 0.6) * 0.12;
      const rel = this.pos.clone().sub(h.pos);
      const relH = new THREE.Vector3(rel.x, 0, rel.z);
      const distH = relH.length();
      if (!this.visit && distH > 1e-3) {
        // Out of the view cone: push sideways when the player looks towards Echo.
        const cos = relH.dot(fwd) / distH;
        const limit = Math.cos(THREE.MathUtils.degToRad(this.engine.isXR ? 50 : 32));
        if (cos > limit) {
          const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
          const s = Math.sign(relH.dot(right)) || 1;
          desired.addScaledVector(right, s * 1.4 * (cos - limit) / (1 - limit) + s * 0.4);
        }
      }
      // Never too close to the head: push outwards (and a little up) inside 1.25 m.
      const d3 = rel.length();
      if (d3 < 1.25) {
        const out = rel.clone();
        out.y = Math.max(out.y, 0.25 * d3);
        desired.addScaledVector(out.normalize(), 2.4 * (1.25 - d3) / 1.25 + 0.5);
      }
      const acc = desired.sub(this.vel);
      const maxAcc = 1.8;
      if (acc.length() > maxAcc) acc.setLength(maxAcc);
      this.lastAcc = acc.clone();
      this.vel.addScaledVector(acc, Math.min(dt * 2.2, 1));
      this.pos.addScaledVector(this.vel, dt);
    }

    // ----- pose: heading, banking, bobbing -----
    const speed = Math.hypot(this.vel.x, this.vel.z);
    const waving = (this.visit?.arrived && this.time < this.visit.until) || hover;
    let wantYaw = this.yaw;
    if (this.companion && (this.look || speed < 0.3)) {
      // Companion: look at the game's point of interest, or where the player looks.
      const d = this.look ? this.look.clone().sub(this.pos) : fwd;
      wantYaw = Math.atan2(d.x, d.z);
    } else if (waving || speed < 0.12) {
      const toHead = h.pos.clone().sub(this.pos);
      wantYaw = Math.atan2(toHead.x, toHead.z);
    } else {
      wantYaw = Math.atan2(this.vel.x, this.vel.z);
    }
    let dy = wantYaw - this.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.yaw += dy * Math.min(1, dt * 3);
    const lateral = this.lastAcc && !hover ? this.lastAcc.dot(new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw))) : 0;
    this.roll += (THREE.MathUtils.clamp(-lateral * 0.35, -0.55, 0.55) - this.roll) * Math.min(1, dt * 3);
    this.pitch += (THREE.MathUtils.clamp(this.vel.y * -0.5 + speed * 0.12, -0.4, 0.4) - this.pitch) * Math.min(1, dt * 3);
    this.root.position.copy(this.pos);
    this.root.rotation.set(0, this.yaw, 0);
    // Celebrate: a loop in the air.
    this.spinT = Math.max(0, this.spinT - dt * 0.9);
    const loop = this.spinT > 0 ? (1 - smooth(this.spinT)) * Math.PI * 2 : 0;
    this.body.rotation.set(this.pitch - loop, 0, this.roll, 'YXZ');
    this.body.position.y = hover ? 0 : Math.sin(this.time * 2.4) * 0.025;

    // ----- wings: flapping with a soft bend, gliding phases, waving -----
    if (!hover) {
      this.glide = Math.max(0, this.glide - dt);
      if (this.glide <= 0 && Math.random() < dt * 0.12 && speed > 0.4) this.glide = 1 + Math.random();
      const climb = THREE.MathUtils.clamp(this.vel.y * 2, 0, 1);
      const freq = this.glide > 0 ? 1.2 : 4.2 + climb * 1.5;
      this.flapPhase += dt * freq * Math.PI * 2;
    }
    const amp = hover ? 0 : this.glide > 0 ? 0.12 : 0.6;
    const flap = Math.sin(this.flapPhase) * amp + (hover ? 0.15 : 0.1);
    for (const w of this.wings ?? []) {
      let a = flap;
      // Waving: the wing on the player's side goes up and waves.
      if (waving && !hover && w.side === -this.visit.side) a = 0.95 + Math.sin(this.time * 9) * 0.35;
      w.node.rotation.z = w.side * a;
      this.bendWing(w, a * 0.55);
    }

    // ----- face: where Echo looks, eye contact, moods, an idle yawn now and then -----
    if (this.face) {
      const toEcho = this.pos.clone().sub(h.pos);
      const view = new THREE.Vector3(0, 0, -1).applyQuaternion(h.quat);
      const seen = toEcho.length() > 0.05 && view.dot(toEcho.normalize()) > Math.cos(0.35);
      if (seen && !this.wasSeen && this.time > (this.nextSurprise ?? 0)) {
        this.face.setMood('surprised', 0.5); // "oh, you are looking at me"
        this.nextSurprise = this.time + 12;
      }
      this.wasSeen = seen;
      this.nextGlance -= dt;
      if (this.nextGlance <= 0) {
        this.glanceUntil = this.time + 1 + Math.random();
        this.nextGlance = 4 + Math.random() * 5;
      }
      let look = null;
      if (this.companion && this.look) look = this.look;
      else if (seen || waving || hover || this.time < (this.glanceUntil ?? 0)) look = h.pos;
      if (!this.companion && !hover) {
        this.nextYawn -= dt;
        if (this.nextYawn <= 0) { this.face.setMood('sleepy', 1.6); this.nextYawn = 45 + Math.random() * 40; }
      }
      if (waving && !hover) this.face.setMood('happy', 0.3);
      this.face.update(dt, look);
    }

    // ----- echo rings: lower ring, then upper ring fade in and out (loading animation) -----
    this.rings?.forEach((mats, i) => {
      const k = hover ? 1 : 0.25 + 0.75 * smooth(0.5 - 0.5 * Math.cos(((this.time - i * 0.4) / 1.6) * Math.PI * 2));
      for (const m of mats) m.opacity = k;
    });
  }

  bendWing(w, bend) {
    bendWing(w, bend);
  }
}
