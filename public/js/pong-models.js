// Loads the Blender-built Pong assets (assets/models/pong-arena.glb, pong-balls.glb) and gives
// them token-driven materials. Emissive parts are named Neon* in Blender so they can be tinted
// here: rails in the grid color, gates in player / AI colors.
import * as THREE from 'three';
import { loadGLTF } from './models.js';
import { hex } from './tokens.js';

const load = loadGLTF; // shared, cached loader (models.js)

// Blender material name -> token (emissive parts, unlit and full bright).
const NEON = {
  NeonRail: 'xr-pong-rail',
  NeonPlayer: 'xr-pong-player',
  NeonAI: 'xr-pong-ai',
  NeonBall: 'xr-pong-ball',
};
// Blender material name -> [token, metalness, roughness].
const SOLID = {
  Metal: ['xr-pong-frame', 0.9, 0.3],
  MetalLight: ['xr-pong-frame-light', 0.95, 0.2],
  Plate: ['xr-pong-plate', 0.25, 0.5],
  BallMetal: ['xr-pong-chrome', 1, 0.14],
  BallDark: ['xr-pong-armor', 0.85, 0.3],
  BallRubber: ['xr-pong-rubber', 0, 0.62],
};

function convert(m) {
  const name = m.name;
  if (NEON[name]) return new THREE.MeshBasicMaterial({ name, color: hex(NEON[name]), toneMapped: false });
  if (name === 'BallIce') {
    return new THREE.MeshPhysicalMaterial({
      name, color: hex('xr-pong-ice'), roughness: 0.08, metalness: 0.1, clearcoat: 1, flatShading: true,
      transparent: true, opacity: 0.82, emissive: hex('xr-pong-ice'), emissiveIntensity: 0.3,
    });
  }
  const s = SOLID[name];
  // The base plate reflects the room only faintly, so it stays a dark, glossy floor.
  if (s) return new THREE.MeshStandardMaterial({ name, color: hex(s[0]), metalness: s[1], roughness: s[2], envMapIntensity: name === 'Plate' ? 0.2 : 1 });
  return m;
}

/** Clones a loaded node and replaces its materials; returns { root, mats: { name: [materials] } }. */
function restyle(node) {
  const root = node.clone(true);
  const mats = {};
  const made = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const one = (m) => {
      if (!made.has(m)) {
        const c = convert(m);
        made.set(m, c);
        (mats[c.name] ??= []).push(c);
      }
      return made.get(m);
    };
    o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material);
    o.userData.noFit = true;
  });
  return { root, mats };
}

/** The arena frame in tunnel units (same coordinates as the tunnel in scenes/pong.js). */
export async function loadPongArena(url = 'assets/models/pong-arena.glb') {
  const gltf = await load(url);
  const { root, mats } = restyle(gltf.scene);
  root.name = 'PongArenaModel';
  return { group: root, mats };
}

/** The four ball models with unit radius: { energy, damper, ice, bouncy } -> { root, mats }. */
export async function loadPongBalls(url = 'assets/models/pong-balls.glb') {
  const gltf = await load(url);
  const out = {};
  for (const key of ['energy', 'damper', 'ice', 'bouncy']) {
    const node = gltf.scene.getObjectByName(`ball_${key}`);
    if (!node) continue;
    const r = restyle(node);
    r.root.position.set(0, 0, 0);
    r.root.rotation.set(0, 0, 0);
    out[key] = r;
  }
  return out;
}
