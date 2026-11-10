// Echo Parkour visuals. With the Blender assets (parkour-models.js): a pedestal with towers at
// the stage edges, a skyline of server towers with parallax, detailed blocks that build up at
// the right edge of the stage and dissolve at the left, coins, glitch crystals, bug drones,
// gates, the goal portal and particles. Without them (loading failed) simple shapes stand in.
// Blocks and towers are instanced, and only the visible instances are drawn (Quest budget).
import * as THREE from 'three';
import { color, hex } from './tokens.js';
import { radialTexture } from './robot-visuals.js';
import { logoTexture } from './parkour-models.js';
import { drawIcon } from './icons.js';

// Emblem on the checkpoint banners: Echo's icon in a frame (white, tinted by the material).
let emblemTex = null;
function emblem() {
  if (emblemTex) return emblemTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 6;
  ctx.strokeRect(10, 10, 108, 108);
  drawIcon(ctx, 'robot', 64, 64, 84, '#ffffff');
  emblemTex = new THREE.CanvasTexture(c);
  return emblemTex;
}

export const DEPTH = 1.8; // track depth (units)
const D2 = DEPTH / 2;

const smooth = (a, b, x) => {
  const k = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
};

/** 0 outside the stage window, 1 inside, soft at the edges (wx: x relative to the window center). */
export function edgeFactor(wx, half) {
  return 1 - smooth(half - 1.4, half, Math.abs(wx));
}

const glowPlane = (w, h, token, opacity) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({
  map: radialTexture(), color: hex(token), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
}));

const tint = (root, token) => {
  const mat = new THREE.MeshBasicMaterial({ color: hex(token), toneMapped: false });
  root.traverse((o) => {
    if (o.isMesh && (o.material.name === 'PkGlow' || o.material.name === 'ForGlow')) o.material = mat;
  });
  return mat;
};

const shadows = (root, cast = true, receive = true) => root.traverse((o) => {
  if (!o.isMesh || o.material.isMeshBasicMaterial) return;
  o.castShadow = cast;
  o.receiveShadow = receive;
});

/** Instanced copies of an asset: one InstancedMesh per material, all sharing one matrix buffer. */
export function instanced(parts, max, { shadow = true, tinted = [] } = {}) {
  const meshes = parts.map((p) => {
    const m = new THREE.InstancedMesh(p.geometry, p.material, max);
    m.frustumCulled = false;
    m.castShadow = shadow && !p.glow;
    m.receiveShadow = !p.glow;
    m.userData.glow = p.glow;
    m.userData.tint = tinted.includes(p.material.name);
    m.userData.noFit = true;
    if (p.glow || m.userData.tint) m.setColorAt(0, new THREE.Color(1, 1, 1));
    m.count = 0;
    return m;
  });
  meshes[0].instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (const m of meshes.slice(1)) m.instanceMatrix = meshes[0].instanceMatrix;
  const glow = meshes.filter((m) => m.userData.glow);
  const tints = meshes.filter((m) => m.userData.tint);
  const group = new THREE.Group();
  meshes.forEach((m) => group.add(m));
  let n = 0;
  return {
    group,
    begin() { n = 0; },
    /** glowColor tints the light parts, tintColor the parts named in `tinted`. */
    push(matrix, glowColor, tintColor) {
      if (n >= max) return;
      meshes[0].setMatrixAt(n, matrix);
      if (glowColor) glow.forEach((g) => g.setColorAt(n, glowColor));
      if (tintColor) tints.forEach((g) => g.setColorAt(n, tintColor));
      n += 1;
    },
    end() {
      meshes.forEach((m) => { m.count = n; });
      meshes[0].instanceMatrix.needsUpdate = true;
      [...glow, ...tints].forEach((g) => { if (g.instanceColor) g.instanceColor.needsUpdate = true; });
    },
  };
}

// ---------------------------------------------------------------- stage

function gridTexture(halfW, h) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, color('xr-parkour-back'));
  g.addColorStop(1, color('xr-parkour-tower'));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = color('xr-parkour-grid');
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = 2;
  for (let i = 0; i <= 256; i += 64) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
  }
  ctx.globalAlpha = 0.45;
  ctx.fillStyle = color('xr-parkour-grid');
  for (let i = 0; i < 18; i++) ctx.fillRect(Math.floor(Math.random() * 4) * 64 - 3, Math.floor(Math.random() * 4) * 64 - 3, 6, 6);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set((halfW * 2) / 0.3, h / 0.3);
  return tex;
}

/**
 * The stage in meters: pedestal, edge towers, backplane, skyline (units inside `units`).
 * set: other models for the pedestal and edge towers ({ models, base, end }, e.g. the forest of
 * level 1); the caller then adds its own backdrop. backTex: a picture for the backplane.
 */
export function makeStage(halfW, U, { bottom = -2.6, top = 6.6, M = null, sky = false, skyScale = 1, set = null, backTex = null } = {}) {
  const group = new THREE.Group();
  const units = new THREE.Group();
  units.scale.setScalar(U);
  group.add(units);
  const half = halfW / U;
  const h = (top - bottom) * U;
  const backZ = set ? -(D2 + 4.6) : M ? -(D2 + 6.6) : -(D2 + 0.5);
  // Backdrop: a holo grid (level 1) or a sky with a color gradient (level 2, set via setSky).
  const tex = sky ? null : backTex ?? gridTexture(halfW, h);
  // A picture backdrop fills the stage frame as seen from the player (it sits further back).
  const grow = backTex ? 1.4 : 1;
  const backGeo = new THREE.PlaneGeometry(halfW * 2 * grow, h * grow);
  if (sky) backGeo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(4 * 3).fill(1), 3));
  const back = new THREE.Mesh(backGeo, sky
    ? new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false })
    : backTex ? new THREE.MeshBasicMaterial({ map: tex, toneMapped: false })
      : new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: M ? 0.85 : 0.62, depthWrite: false }));
  back.position.set(0, ((top + bottom) / 2 + (grow - 1) * (top - bottom) * 0.3) * U, backZ * U);
  /** Sky colors: top and bottom (THREE.Color). */
  const setSky = (topColor, bottomColor) => {
    const c = backGeo.attributes.color;
    [topColor, topColor, bottomColor, bottomColor].forEach((col, i) => c.setXYZ(i, col.r, col.g, col.b));
    c.needsUpdate = true;
  };
  back.renderOrder = -1;
  group.add(back);
  let skyline = null;

  if (M) {
    // Pedestal (stretched along x) and the two towers at the stage edges.
    const ped = new THREE.Group();
    const frame = new THREE.MeshBasicMaterial({ color: hex('xr-parkour-frame'), toneMapped: false });
    // The pedestal is satin rather than polished, so the back light does not mirror on it.
    const satin = M.materials.PkMetal.clone();
    satin.roughness = 0.75;
    satin.metalness = 0.35;
    const S = set?.models ?? M;
    for (const p of S.parts(set?.base ?? 'StageMid')) {
      const mesh = new THREE.Mesh(p.geometry, p.glow ? frame : p.material === M.materials.PkMetal ? satin : p.material);
      mesh.receiveShadow = !p.glow;
      ped.add(mesh);
    }
    ped.scale.x = half * 2 + 1.6;
    ped.position.y = bottom;
    units.add(ped);
    for (const s of [-1, 1]) {
      const tower = new THREE.Group();
      for (const p of S.parts(set?.end ?? 'StageEnd')) {
        const mesh = new THREE.Mesh(p.geometry, p.glow ? frame : p.material);
        mesh.castShadow = !p.glow && !!set;
        tower.add(mesh);
      }
      tower.position.set(s * (half + 0.45), bottom, 0);
      tower.scale.x = s; // mirrored on the left, so the light strip faces the stage on both sides
      units.add(tower);
      const glow = glowPlane(1.6, (top - bottom) * 1.05, 'xr-parkour-frame', set ? 0.12 : 0.28);
      glow.position.set(s * (half + 0.1), (top + bottom) / 2, D2 + 0.4);
      units.add(glow);
    }
    if (!set) {
      skyline = makeSkyline(M, half, bottom, backZ, skyScale);
      units.add(skyline.group);
    }
  } else {
    const frameMat = new THREE.MeshBasicMaterial({ color: hex('xr-parkour-frame'), toneMapped: false });
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.01, h, 0.01), frameMat);
      post.position.set(s * halfW, back.position.y, back.position.z);
      group.add(post);
    }
    const slab = new THREE.Mesh(new THREE.BoxGeometry(halfW * 2 + 0.04, 0.022, (DEPTH + 1.4) * U), new THREE.MeshStandardMaterial({ color: hex('xr-parkour-block'), roughness: 0.4, metalness: 0.5 }));
    slab.position.set(0, bottom * U - 0.011, -0.2 * U);
    group.add(slab);
  }
  return { group, units, backTex: tex, skyline, setSky, half, backZ, back };
}

/** Server towers behind the track; they scroll slower than the course (parallax). */
function makeSkyline(M, half, bottom, backZ, scale = 1) {
  const group = new THREE.Group();
  group.userData.noFit = true;
  const variants = [1, 2, 3].map((i) => instanced(M.parts(`Tower${i}`), 60, { shadow: false }));
  variants.forEach((v) => group.add(v.group));
  const rnd = (() => { let s = 7; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; })();
  const towers = [];
  for (let x = -18; x < 140; x += 2.2 + rnd() * 1.6) {
    towers.push({ x, z: backZ + 1.2 + rnd() * 3.6, v: Math.floor(rnd() * 3), s: (0.75 + rnd() * 0.6) * scale, hue: rnd() });
  }
  const glowA = new THREE.Color(hex('xr-parkour-window'));
  const glowB = new THREE.Color(hex('xr-parkour-frame'));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const c = new THREE.Color();
  return {
    group,
    update(camX) {
      variants.forEach((v) => v.begin());
      for (const t of towers) {
        const wx = t.x - camX * 0.55;
        if (Math.abs(wx) > half) continue;
        const k = edgeFactor(wx, half);
        if (k <= 0.001) continue;
        p.set(wx, bottom - (1 - k) * 2, t.z);
        sc.set(t.s * k, t.s * k, t.s * k);
        variants[t.v].push(m.compose(p, q, sc), c.copy(glowA).lerp(glowB, t.hue).multiplyScalar(0.55 + 0.45 * k));
      }
      variants.forEach((v) => v.end());
    },
  };
}

// ---------------------------------------------------------------- blocks

/** All blocks of the course; only blocks inside the stage window are drawn. */
export function makeBlocks(cols, M = null) {
  const zones = ['xr-parkour-zone1', 'xr-parkour-zone2', 'xr-parkour-zone3'].map((tk) => new THREE.Color(hex(tk)));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const group = new THREE.Group();
  group.userData.noFit = true;

  if (M) {
    // The top plates take a little of the zone color.
    const plates = zones.map((z) => new THREE.Color(1, 1, 1).lerp(z, 0.55));
    const caps = instanced(M.parts('TileCap'), cols.length, { tinted: ['PkPanel'] });
    const bodies = instanced(M.parts('TileBody'), cols.length);
    const unders = instanced(M.parts('FloatUnder'), cols.length);
    group.add(caps.group, bodies.group, unders.group);
    return {
      group,
      update(camX, half) {
        caps.begin(); bodies.begin(); unders.begin();
        for (const c of cols) {
          const wx = c.x + 0.5 - camX;
          if (Math.abs(wx) >= half) continue;
          const k = edgeFactor(wx, half);
          if (k <= 0.001) continue;
          const sink = (1 - k) * 0.4;
          p.set(c.x + 0.5, c.top - sink, 0);
          s.set(k, k, k);
          caps.push(m.compose(p, q, s), zones[c.zone], plates[c.zone]);
          if (c.top - c.bottom > 0.7) {
            const h = c.top - 0.45 - c.bottom;
            p.set(c.x + 0.5, c.top - 0.45 * k - sink, 0);
            s.set(k, h * k, k);
            bodies.push(m.compose(p, q, s));
          } else {
            unders.push(m.compose(p, q, s), zones[c.zone]);
          }
        }
        caps.end(); bodies.end(); unders.end();
      },
    };
  }

  // Fallback: simple boxes with glowing caps.
  const n = cols.length;
  const body = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, DEPTH), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0.45 }), n);
  const caps = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.09, DEPTH + 0.04), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), n);
  const block = new THREE.Color(hex('xr-parkour-block'));
  cols.forEach((c, i) => {
    body.setColorAt(i, block.clone().lerp(zones[c.zone], 0.1));
    caps.setColorAt(i, zones[c.zone]);
  });
  body.frustumCulled = false;
  caps.frustumCulled = false;
  group.add(body, caps);
  return {
    group,
    update(camX, half) {
      cols.forEach((c, i) => {
        const k = edgeFactor(c.x + 0.5 - camX, half);
        const h = c.top - c.bottom;
        const sy = k > 0 ? 0.25 + 0.75 * k : 0;
        p.set(c.x + 0.5, c.top - (h * sy) / 2, 0);
        s.set(0.97 * k, h * sy, k);
        body.setMatrixAt(i, m.compose(p, q, s));
        p.set(c.x + 0.5, c.top - 0.045 + (1 - k) * 0.3, 0);
        s.set(k, k > 0 ? 1 : 0, k);
        caps.setMatrixAt(i, m.compose(p, q, s));
      });
      body.instanceMatrix.needsUpdate = true;
      caps.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------- pieces

/** A spinning coin with the Echomotion logo on both faces and a soft glow. */
export function makeCoin(M = null) {
  const group = new THREE.Group();
  const spin = new THREE.Group();
  if (M) {
    const coin = M.clone('Coin');
    shadows(coin, true, false);
    spin.add(coin);
  } else {
    const gold = new THREE.MeshStandardMaterial({ color: hex('xr-parkour-coin'), metalness: 1, roughness: 0.25, emissive: hex('xr-parkour-coin'), emissiveIntensity: 0.25 });
    const face = new THREE.MeshStandardMaterial({ map: logoTexture(), metalness: 0.3, roughness: 0.4, emissive: 0xffffff, emissiveMap: logoTexture(), emissiveIntensity: 0.35 });
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.12, 28), [gold, face, face]);
    coin.rotation.x = Math.PI / 2;
    spin.add(coin);
  }
  const glow = glowPlane(1.8, 1.8, 'xr-parkour-coin', 0.45);
  glow.position.z = -0.25;
  group.add(glow, spin);
  group.userData.spin = spin;
  return group;
}

/** Glitch crystals along a row (deadly). The group sits at the middle of the row. */
export function makeSpikes(x0, x1, M = null) {
  const group = new THREE.Group();
  const mid = (x0 + x1) / 2;
  if (M) {
    for (let x = x0 + 0.375; x < x1; x += 0.75) {
      for (const z of [-0.42, 0.42]) {
        const c = M.clone('Crystal');
        c.position.set(x - mid + (Math.random() - 0.5) * 0.12, 0, z + (Math.random() - 0.5) * 0.1);
        c.rotation.y = Math.random() * Math.PI * 2;
        c.scale.setScalar(0.85 + Math.random() * 0.3);
        shadows(c, true, true);
        group.add(c);
      }
    }
    const glow = glowPlane(x1 - x0 + 1.4, 1.6, 'xr-parkour-glitch', 0.35);
    glow.position.set(0, 0.4, D2 + 0.1);
    group.add(glow);
    group.userData.mat = M.materials.CrystalGlow;
    return group;
  }
  const mat = new THREE.MeshStandardMaterial({ color: hex('xr-parkour-glitch'), emissive: hex('xr-parkour-glitch'), emissiveIntensity: 0.8, roughness: 0.3, flatShading: true });
  const geo = new THREE.ConeGeometry(0.2, 0.62, 4);
  for (let x = x0 + 0.25; x < x1; x += 0.5) {
    for (const z of [-0.5, 0, 0.5]) {
      const c = new THREE.Mesh(geo, mat);
      c.position.set(x - mid + (Math.random() - 0.5) * 0.1, 0.31, z);
      c.rotation.y = Math.random() * Math.PI;
      c.scale.y = 0.75 + Math.random() * 0.45;
      group.add(c);
    }
  }
  group.userData.mat = mat;
  return group;
}

/** A bug drone; userData.animate(dt, t) buzzes the wings and wobbles the body. */
export function makeBug(M = null) {
  const group = new THREE.Group();
  if (M) {
    const bug = M.clone('Bug');
    bug.scale.setScalar(1.2);
    shadows(bug, true, false);
    const wings = ['BugWingL', 'BugWingR'].map((n) => bug.getObjectByName(n)).filter(Boolean);
    const base = wings.map((w) => w.rotation.clone());
    const halo = glowPlane(1.4, 1.4, 'xr-parkour-glitch', 0.3);
    halo.position.z = -0.3;
    group.add(halo, bug);
    group.userData.animate = (dt, t) => {
      wings.forEach((w, i) => { w.rotation.x = base[i].x + Math.sin(t * 55 + i * Math.PI) * 0.45; });
      bug.rotation.z = Math.sin(t * 3) * 0.12;
      bug.rotation.y = Math.sin(t * 1.7) * 0.25;
    };
    return group;
  }
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), new THREE.MeshStandardMaterial({ color: hex('xr-parkour-bug'), roughness: 0.3, metalness: 0.6 }));
  body.scale.set(1.15, 0.9, 1);
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(0.46, 0), new THREE.MeshBasicMaterial({ color: hex('xr-parkour-glitch'), wireframe: true, transparent: true, opacity: 0.7, toneMapped: false }));
  group.add(body, shell);
  group.userData.animate = (dt) => { shell.rotation.x += dt * 2.2; shell.rotation.y += dt * 3.1; };
  return group;
}

/** A moving platform (lift), 3 units wide. */
export function makeLift(w, M = null, F = null, name = 'IslandLift') {
  const group = new THREE.Group();
  if (M) {
    const lift = F ? F.clone(name) : M.clone('Lift');
    tint(lift, 'xr-parkour-zone2');
    shadows(lift, true, true);
    group.add(lift);
  } else {
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, 0.6, DEPTH), new THREE.MeshStandardMaterial({ color: hex('xr-parkour-block'), roughness: 0.3, metalness: 0.5 }));
    body.position.y = -0.3;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(w, 0.09, DEPTH + 0.04), new THREE.MeshBasicMaterial({ color: hex('xr-parkour-zone2'), toneMapped: false }));
    cap.position.y = -0.045;
    group.add(body, cap);
  }
  const under = glowPlane(w * 1.4, 1.4, 'xr-parkour-zone2', 0.45);
  under.position.set(0, -0.9, D2 + 0.02);
  group.add(under);
  return group;
}

/** Checkpoint gate (lights up when passed) or the goal portal with the Echomotion logo. */
export function makeGate(finish = false, M = null, F = null) {
  const token = finish ? 'xr-parkour-finish' : 'xr-parkour-check';
  const group = new THREE.Group();
  const h = finish ? 4.0 : 2.9;
  let mat;
  if (M) {
    const gate = F ? F.clone(finish ? 'ForestFinish' : 'ForestGate') : M.clone(finish ? 'Finish' : 'Gate');
    mat = tint(gate, token);
    shadows(gate, true, true);
    group.add(gate);
    if (!finish) {
      // Echo's emblem on the banner, in the gate color (grey, then green when passed)
      const em = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.46), new THREE.MeshBasicMaterial({ map: emblem(), color: hex('xr-parkour-back'), transparent: true, toneMapped: false }));
      em.position.set(0.36, h - 0.62, -D2 + 0.155);
      gate.add(em);
    }
    if (finish) {
      const spot = gate.getObjectByName('LogoSpot');
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.88, 48), new THREE.MeshBasicMaterial({ map: logoTexture(), toneMapped: false }));
      disc.position.copy(spot ? spot.position : new THREE.Vector3(0, h + 1.3, 0.32));
      disc.position.z += 0.02;
      gate.add(disc);
    }
  } else {
    mat = new THREE.MeshBasicMaterial({ color: hex(token), toneMapped: false });
    for (const z of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, h, 0.14), mat);
      post.position.set(0, h / 2, z * (D2 + 0.12));
      group.add(post);
    }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, DEPTH + 0.38), mat);
    bar.position.y = h;
    group.add(bar);
    if (finish) {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.75, 32), new THREE.MeshBasicMaterial({ map: logoTexture(), toneMapped: false }));
      disc.position.set(0, h + 0.9, D2 + 0.15);
      group.add(disc);
    }
  }
  let glow;
  if (M) {
    // behind the banner (checkpoint) or the logo ring (goal), at the back of the track
    glow = glowPlane(finish ? 3.6 : 1.4, finish ? 3.6 : 1.2, token, finish ? 0.5 : 0.35);
    glow.position.set(finish ? 0 : 0.36, finish ? 5.45 : 2.28, -D2 - 0.1);
  } else {
    glow = glowPlane(finish ? 3 : 1.6, h * 1.3, token, finish ? 0.45 : 0.22);
    glow.position.set(0, h / 2, D2 + 0.3);
  }
  group.add(glow);
  group.userData.mat = mat;
  group.userData.glow = glow.material;
  return group;
}

/** Soft round shadow on the ground under Echo (the real shadow map is off in lite mode). */
export function makeShadow() {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: radialTexture(), color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  return m;
}

// ---------------------------------------------------------------- particles

/**
 * Pooled soft particles in course units: puff(x, y, kind) for landing dust ('dust') and wing
 * sparks ('spark'); motes: glowing points floating in the stage (scroll with the course).
 */
export function makeParticles({ motes = 40, moteToken = 'xr-parkour-dust', dustToken = 'xr-parkour-dust' } = {}) {
  const group = new THREE.Group();
  group.userData.noFit = true;
  const pool = [];
  const geo = new THREE.PlaneGeometry(1, 1);
  for (let i = 0; i < 48; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: radialTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.visible = false;
    group.add(m);
    pool.push({ m, life: 0, max: 1, v: new THREE.Vector3() });
  }
  let next = 0;
  const colors = { dust: new THREE.Color(hex(dustToken)), spark: new THREE.Color(hex('xr-parkour-window')), coin: new THREE.Color(hex('xr-parkour-coin')) };
  const puff = (x, y, kind = 'dust', count = 8) => {
    for (let i = 0; i < count; i++) {
      const p = pool[next];
      next = (next + 1) % pool.length;
      const a = (i / count) * Math.PI * 2;
      p.m.position.set(x + Math.cos(a) * 0.15, y + 0.05, 0.2 + Math.sin(a) * 0.3);
      if (kind === 'dust') p.v.set(Math.cos(a) * 1.4, 0.4 + Math.random() * 0.5, Math.sin(a) * 0.6);
      else p.v.set((Math.random() - 0.5) * 1.2, -1.5 - Math.random() * 1.5, (Math.random() - 0.5) * 0.8);
      p.life = p.max = kind === 'dust' ? 0.45 : 0.6;
      p.size = kind === 'dust' ? 0.35 : 0.22;
      p.m.material.color.copy(colors[kind] ?? colors.dust);
      p.m.visible = true;
    }
  };
  // Motes: points spread over the stage volume.
  let points = null;
  const base = [];
  if (motes > 0) {
    const pos = new Float32Array(motes * 3);
    for (let i = 0; i < motes; i++) base.push({ x: Math.random(), y: -2 + Math.random() * 8, z: -4 + Math.random() * 6, s: 0.2 + Math.random() * 0.4 });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    // size in meters on screen (point sizes ignore the course's scale)
    points = new THREE.Points(g, new THREE.PointsMaterial({ color: hex(moteToken), size: moteToken === 'xr-parkour-dust' ? 0.012 : 0.016, map: radialTexture(), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    points.frustumCulled = false;
  }
  return {
    group,
    points,
    puff,
    update(dt, camX = 0, half = 9) {
      for (const p of pool) {
        if (p.life <= 0) continue;
        p.life -= dt;
        const k = Math.max(0, p.life / p.max);
        p.m.position.addScaledVector(p.v, dt);
        p.v.multiplyScalar(1 - dt * 3);
        p.m.scale.setScalar(p.size * (1.4 - 0.6 * k));
        p.m.material.opacity = k * 0.8;
        if (p.life <= 0) p.m.visible = false;
      }
      if (points) {
        const a = points.geometry.attributes.position;
        const t = performance.now() / 1000;
        base.forEach((b, i) => {
          b.y += dt * b.s * 0.35;
          if (b.y > 6.5) b.y = -2;
          // spread across the window, scrolling a little slower than the course
          const w = half * 2;
          const x = ((((b.x * w - camX * 0.8) % w) + w) % w) - half;
          a.setXYZ(i, x + Math.sin(t * 0.7 + i) * 0.2, b.y, b.z);
        });
        a.needsUpdate = true;
      }
    },
  };
}
