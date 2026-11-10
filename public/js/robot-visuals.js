// Visuals for the robot game: the friendly robot "Bit", the arena, the goal coin and
// the data blocks. All colors come from design tokens.
import * as THREE from 'three';
import { hex, color } from './tokens.js';

const physical = (token, extra = {}) => new THREE.MeshPhysicalMaterial({
  color: hex(token), roughness: 0.32, metalness: 0.05, clearcoat: 0.9, clearcoatRoughness: 0.18, ...extra,
});

export function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** Flat rounded slab lying on the floor (XZ plane), top at y = height. */
function roundedSlab(w, d, height, r, bevel = 0.006) {
  const geo = new THREE.ExtrudeGeometry(roundedRectShape(w, d, r), {
    depth: Math.max(0.001, height - bevel * 2), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 8,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, bevel, 0);
  return geo;
}

const glowCache = new Map();
/** Soft radial gradient texture (white center, transparent edge) for glows and shadows. */
export function radialTexture(inner = 1, outer = 0) {
  const key = `${inner}-${outer}`;
  if (glowCache.has(key)) return glowCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, `rgba(255,255,255,${inner})`);
  g.addColorStop(0.45, `rgba(255,255,255,${inner * 0.45})`);
  g.addColorStop(1, `rgba(255,255,255,${outer})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  glowCache.set(key, tex);
  return tex;
}

function flatGlow(size, token, opacity = 0.8) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({
    map: radialTexture(), color: hex(token), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

/** Simple studio lighting for glossy reflections (gradient dome + two soft light panels). */
export function makeEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  const dome = new THREE.SphereGeometry(10, 32, 16);
  const top = new THREE.Color(hex('xr-robot-env-top'));
  const bottom = new THREE.Color(hex('xr-robot-env-bottom'));
  const pos = dome.attributes.position;
  const colors = [];
  for (let i = 0; i < pos.count; i++) {
    const c = bottom.clone().lerp(top, THREE.MathUtils.clamp((pos.getY(i) / 10 + 0.3) / 1.3, 0, 1));
    colors.push(c.r, c.g, c.b);
  }
  dome.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  env.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const panel = new THREE.MeshBasicMaterial({ color: hex('xr-robot-env-top') });
  [[4, 6, 4], [-5, 4, -3]].forEach(([x, y, z]) => {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(4, 3), panel);
    p.position.set(x, y, z);
    p.lookAt(0, 0, 0);
    env.add(p);
  });
  const target = pmrem.fromScene(env, 0.03);
  pmrem.dispose();
  env.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  return target;
}

// ---------- goal coin with the sponsor logo ----------

const logo = new Image();
logo.src = 'assets/echomotion-logo.png';

export function makeGoal() {
  const g = new THREE.Group();
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const paint = () => {
    const grad = ctx.createRadialGradient(110, 100, 10, 128, 128, 128);
    grad.addColorStop(0, color('xr-robot-env-top'));
    grad.addColorStop(0.35, color('xr-robot-coin'));
    grad.addColorStop(1, color('xr-warning'));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    if (logo.complete && logo.naturalWidth) ctx.drawImage(logo, 48, 48, 160, 160);
    tex.needsUpdate = true;
  };
  paint();
  if (!logo.complete) logo.addEventListener('load', paint, { once: true });

  const gold = physical('xr-robot-coin', { metalness: 0.85, roughness: 0.22, emissive: new THREE.Color(hex('xr-robot-coin')), emissiveIntensity: 0.15 });
  const faceMat = new THREE.MeshPhysicalMaterial({ map: tex, metalness: 0.4, roughness: 0.3, clearcoat: 0.8 });
  const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 64), [gold, faceMat, faceMat]);
  coin.rotation.x = Math.PI / 2;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.006, 16, 64), gold);
  const spinner = new THREE.Group();
  spinner.add(coin, rim);
  spinner.position.y = 0.13;

  // Light column marking the goal.
  const beamCanvas = document.createElement('canvas');
  beamCanvas.width = 4;
  beamCanvas.height = 128;
  const bctx = beamCanvas.getContext('2d');
  const bg = bctx.createLinearGradient(0, 0, 0, 128);
  bg.addColorStop(0, 'rgba(255,255,255,0)');
  bg.addColorStop(1, 'rgba(255,255,255,0.9)');
  bctx.fillStyle = bg;
  bctx.fillRect(0, 0, 4, 128);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.085, 0.5, 48, 1, true), new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(beamCanvas), color: hex('xr-robot-coin'), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  }));
  beam.position.y = 0.25;
  const base = flatGlow(0.26, 'xr-robot-coin', 0.75);
  base.position.y = 0.014;

  // Sparkles orbiting the coin.
  const sparkMat = new THREE.SpriteMaterial({ map: radialTexture(), color: hex('xr-robot-coin'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const sparks = Array.from({ length: 8 }, (_, i) => {
    const s = new THREE.Sprite(sparkMat);
    s.scale.setScalar(0.025);
    s.userData.phase = (i / 8) * Math.PI * 2;
    g.add(s);
    return s;
  });

  g.add(spinner, beam, base);
  let time = 0;
  g.userData.tick = (dt) => {
    time += dt;
    spinner.rotation.y += dt * 2.2;
    spinner.position.y = 0.13 + Math.sin(time * 2) * 0.012;
    beam.material.opacity = 0.25 + Math.sin(time * 3) * 0.08;
    sparks.forEach((s) => {
      const a = s.userData.phase + time * 1.6;
      s.position.set(Math.cos(a) * 0.1, 0.1 + Math.sin(a * 2 + time) * 0.05, Math.sin(a) * 0.1);
      s.material.opacity = 0.6 + Math.sin(time * 5 + s.userData.phase) * 0.3;
    });
  };
  return g;
}

// ---------- arena ----------

/** Platform with rounded tiles, a glow layer for the "AI thoughts" heatmap and direction chevrons. */
export function makeArena(N, TILE) {
  const g = new THREE.Group();
  const size = N * TILE + 0.12;
  const platform = new THREE.Mesh(roundedSlab(size, size, 0.035, 0.06), physical('xr-robot-platform', { roughness: 0.5, clearcoat: 0.4 }));
  const rim = new THREE.Mesh(roundedSlab(size + 0.02, size + 0.02, 0.012, 0.07, 0.003), new THREE.MeshBasicMaterial({ color: hex('xr-robot-accent') }));
  rim.position.y = 0.012;
  const halo = flatGlow(size * 1.5, 'xr-robot-accent', 0.35);
  halo.position.y = 0.002;
  g.add(halo, rim, platform);

  const tileGeo = roundedSlab(TILE * 0.88, TILE * 0.88, 0.012, 0.03, 0.003);
  const tiles = new THREE.InstancedMesh(tileGeo, physical('xr-robot-tile', { roughness: 0.4, clearcoat: 0.6 }), N * N);
  const heatGeo = new THREE.ShapeGeometry(roundedRectShape(TILE * 0.86, TILE * 0.86, 0.03), 6).rotateX(-Math.PI / 2);
  const heat = new THREE.InstancedMesh(heatGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), N * N);
  const chevron = new THREE.Shape();
  chevron.moveTo(0, -0.04);
  chevron.lineTo(0.032, 0.0);
  chevron.lineTo(0.02, 0.0);
  chevron.lineTo(0, -0.02);
  chevron.lineTo(-0.02, 0.0);
  chevron.lineTo(-0.032, 0.0);
  chevron.closePath();
  const arrowGeo = new THREE.ShapeGeometry(chevron).rotateX(-Math.PI / 2).translate(0, 0, 0.012); // points to -z
  const arrows = new THREE.InstancedMesh(arrowGeo, new THREE.MeshBasicMaterial({ color: hex('xr-robot-arrow'), transparent: true, opacity: 0.85, depthWrite: false }), N * N);
  const m = new THREE.Matrix4();
  for (let s = 0; s < N * N; s++) {
    const x = ((s % N) - (N - 1) / 2) * TILE;
    const z = (Math.floor(s / N) - (N - 1) / 2) * TILE;
    tiles.setMatrixAt(s, m.makeTranslation(x, 0.035, z));
    heat.setMatrixAt(s, m.makeTranslation(x, 0.049, z));
    heat.setColorAt(s, new THREE.Color(0x000000));
  }
  g.add(tiles, heat, arrows);
  return { group: g, tiles, heat, arrows, surfaceY: 0.047 };
}

/** Obstacle: a glossy rounded data block with glowing edges and a pulsing top light. */
export function makeBlock(TILE) {
  const h = 0.15;
  const geo = roundedSlab(TILE * 0.82, TILE * 0.82, h, 0.025, 0.008);
  const block = new THREE.Mesh(geo, physical('xr-robot-block', { roughness: 0.25 }));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 30), new THREE.LineBasicMaterial({ color: hex('xr-glow'), transparent: true, opacity: 0.55 }));
  const light = new THREE.Mesh(new THREE.ShapeGeometry(roundedRectShape(TILE * 0.5, 0.012, 0.006)).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: hex('xr-glow') }));
  light.position.y = h + 0.002;
  const g = new THREE.Group();
  g.add(block, edges, light);
  g.userData.light = light;
  return g;
}

/** Glowing trail dot left behind during turbo training. */
export function makeTrailDot() {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.06), new THREE.MeshBasicMaterial({
    map: radialTexture(), color: hex('xr-glow'), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  m.rotation.x = -Math.PI / 2;
  return m;
}


/**
 * Arrows the player places on the tiles (level 2) plus tile markers that show where the
 * next arrow can go. setArrow(s, dir, token|null), setMark(s, token|null, strength).
 */
export function makePlanLayer(N, TILE) {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(-0.017, -0.055);
  shape.lineTo(-0.017, 0.002);
  shape.lineTo(-0.045, 0.002);
  shape.lineTo(0, 0.062);
  shape.lineTo(0.045, 0.002);
  shape.lineTo(0.017, 0.002);
  shape.lineTo(0.017, -0.055);
  shape.closePath();
  const geo = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2); // shape +y becomes -z: points away
  const edge = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: hex('xr-robot-plan-edge'), transparent: true, opacity: 0.85, depthWrite: false }), N * N);
  const arrows = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, depthWrite: false, transparent: true }), N * N);
  edge.renderOrder = 2;
  arrows.renderOrder = 3;

  const ring = roundedRectShape(TILE * 0.84, TILE * 0.84, 0.03);
  ring.holes.push(roundedRectShape(TILE * 0.7, TILE * 0.7, 0.02));
  const markGeo = new THREE.ShapeGeometry(ring, 6).rotateX(-Math.PI / 2);
  const marks = new THREE.InstancedMesh(markGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), N * N);
  const hover = new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({ color: hex('xr-robot-plan'), transparent: true, depthWrite: false }));
  hover.renderOrder = 4;
  hover.visible = false;
  g.add(marks, edge, arrows, hover);

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const c = new THREE.Color();
  const pos = (s, y) => new THREE.Vector3(((s % N) - (N - 1) / 2) * TILE, y, (Math.floor(s / N) - (N - 1) / 2) * TILE);
  const hidden = new THREE.Vector3(0.0001, 1, 0.0001);
  const DIR_YAW = [0, -Math.PI / 2, Math.PI, Math.PI / 2]; // away, right, towards, left

  for (let s = 0; s < N * N; s++) {
    arrows.setColorAt(s, c.set(0x000000));
    marks.setColorAt(s, c.set(0x000000));
    m.compose(pos(s, 0.009), q.identity(), hidden);
    arrows.setMatrixAt(s, m);
    edge.setMatrixAt(s, m);
    marks.setMatrixAt(s, m.makeTranslation(pos(s, 0.006)));
  }

  return {
    group: g,
    setArrow(s, dir, token) {
      const show = dir >= 0 && token;
      q.setFromAxisAngle(up, show ? DIR_YAW[dir] : 0);
      m.compose(pos(s, 0.012), q, show ? new THREE.Vector3(1, 1, 1) : hidden);
      arrows.setMatrixAt(s, m);
      m.compose(pos(s, 0.009), q, show ? new THREE.Vector3(1.28, 1, 1.22) : hidden);
      edge.setMatrixAt(s, m);
      if (show) arrows.setColorAt(s, c.setHex(hex(token)));
    },
    setMark(s, token, strength = 1) {
      marks.setColorAt(s, token ? c.setHex(hex(token)).multiplyScalar(strength) : c.set(0x000000));
    },
    setHover(s) {
      hover.visible = s != null;
      if (s != null) hover.position.copy(pos(s, 0.016));
    },
    commit() {
      arrows.instanceMatrix.needsUpdate = true;
      edge.instanceMatrix.needsUpdate = true;
      arrows.instanceColor.needsUpdate = true;
      marks.instanceColor.needsUpdate = true;
    },
    hover,
    marks,
  };
}
