// Loads the Blender-built Echo Parkour assets (assets/models/parkour.glb, blender/build_parkour.py)
// and gives them token-driven materials. Ambient occlusion is baked into the vertex colors;
// light parts use *Glow materials, are unlit and get tinted by the app (zone colors).
import * as THREE from 'three';
import { loadGLTF } from './models.js';
import { hex } from './tokens.js';

export const PARKOUR_URL = 'assets/models/parkour.glb';

let logoTex = null;
export function logoTexture() {
  if (!logoTex) {
    logoTex = new THREE.TextureLoader().load('assets/echomotion-logo.png');
    logoTex.colorSpace = THREE.SRGBColorSpace;
    logoTex.anisotropy = 4;
  }
  return logoTex;
}

const std = (name, token, metalness, roughness, extra = {}) => new THREE.MeshStandardMaterial({ name, color: hex(token), metalness, roughness, vertexColors: true, ...extra });

/** One material per Blender material name (shared by all instances). */
function makeMaterials() {
  return {
    PkMetal: std('PkMetal', 'xr-parkour-block', 0.75, 0.32),
    PkMetalLight: std('PkMetalLight', 'xr-parkour-metal-light', 0.95, 0.22),
    PkPanel: std('PkPanel', 'xr-parkour-panel', 0.5, 0.4),
    PkDark: std('PkDark', 'xr-parkour-recess', 0.3, 0.7),
    PkGlow: new THREE.MeshBasicMaterial({ name: 'PkGlow', color: 0xffffff, toneMapped: false }),
    // Polished gold: stronger reflections of the environment (the coins are the stars of the course).
    CoinGold: std('CoinGold', 'xr-parkour-coin', 1, 0.18, { emissive: hex('xr-parkour-coin'), emissiveIntensity: 0.1, envMapIntensity: 1.6 }),
    CoinFace: new THREE.MeshStandardMaterial({ name: 'CoinFace', map: logoTexture(), metalness: 0.35, roughness: 0.35, emissive: 0xffffff, emissiveMap: logoTexture(), emissiveIntensity: 0.3 }),
    CrystalGlow: new THREE.MeshStandardMaterial({ name: 'CrystalGlow', color: hex('xr-parkour-glitch'), emissive: hex('xr-parkour-glitch'), emissiveIntensity: 1.1, metalness: 0.1, roughness: 0.15, flatShading: true, transparent: true, opacity: 0.92 }),
    CrystalBase: std('CrystalBase', 'xr-parkour-recess', 0.5, 0.5),
    BugShell: new THREE.MeshPhysicalMaterial({ name: 'BugShell', color: hex('xr-parkour-bug'), metalness: 0.9, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08, iridescence: 0.7, iridescenceIOR: 1.6, vertexColors: true }),
    BugGlow: new THREE.MeshBasicMaterial({ name: 'BugGlow', color: hex('xr-parkour-glitch'), toneMapped: false }),
    BugWing: new THREE.MeshBasicMaterial({ name: 'BugWing', color: hex('xr-parkour-wing'), transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  };
}

/**
 * Access to the nodes of a loaded GLB with replaced materials: parts(name) lists the geometry
 * and material of each primitive (for instancing), clone(name) copies a node with its children.
 */
export function modelSet(gltf, materials) {
  const pick = (m) => materials[m.name] ?? m;
  const nodes = new Map();
  gltf.scene.children.forEach((n) => nodes.set(n.name, n));
  const json = gltf.parser.json;
  const parts = (name) => {
    const node = nodes.get(name);
    if (!node) return [];
    const def = json.nodes.find((n) => n.name === name);
    const childNames = new Set((def?.children ?? []).map((i) => json.nodes[i].name));
    const meshes = node.isMesh ? [node] : node.children.filter((c) => c.isMesh && !childNames.has(c.name));
    return meshes.map((o) => ({ geometry: o.geometry, material: pick(o.material), glow: /Glow$/.test(o.material.name) }));
  };
  const clone = (name) => {
    const node = nodes.get(name);
    if (!node) return null;
    const root = node.clone(true);
    root.position.set(0, 0, 0);
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.material = Array.isArray(o.material) ? o.material.map(pick) : pick(o.material);
      o.userData.noFit = true;
    });
    return root;
  };
  return { parts, clone, materials, nodes };
}

let promise = null;

/** Loads the assets once: { parts(name), clone(name), materials }. */
export function loadParkourModels() {
  promise ??= loadGLTF(PARKOUR_URL).then((gltf) => modelSet(gltf, makeMaterials()));
  return promise;
}
