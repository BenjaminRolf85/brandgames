// AI Arena, Christmas edition (SEASON 'christmas'): the robots wear grumpy green floppy hats, and
// the comic Santa (blender/build_santa.py) gets the token colors. Original designs; colors from
// the --xr-xmas-* tokens. The arena turns everything into holograms afterwards (holo.js), so this
// runs before holoize.
import * as THREE from 'three';
import { hex } from './tokens.js';

const fur = (token) => new THREE.MeshStandardMaterial({ color: hex(token), roughness: 1 });

/**
 * A floppy hat (real meters, brim center at the origin, +y up, +z forward): a soft cone that
 * bends backwards and to one side, a fluffy brim and a pompom at the tip.
 */
export function floppyHat({ hat = 'xr-xmas-hat', trim = 'xr-xmas-fur', r = 0.11, h = 0.26, side = 1 } = {}) {
  const g = new THREE.Group();
  // The cone, bent: the higher, the more it leans back and flops to the side and down.
  const geo = new THREE.CylinderGeometry(0.004, r, h, 28, 16, true);
  geo.translate(0, h / 2, 0);
  const bend = (u) => new THREE.Vector3(side * 0.45 * h * u ** 2.2, -0.35 * h * u ** 3, -0.38 * h * u ** 1.6);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    v.add(bend(THREE.MathUtils.clamp(v.y / h, 0, 1)));
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  const cone = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: hex(hat), roughness: 0.75, side: THREE.DoubleSide }));
  const brim = new THREE.Mesh(new THREE.TorusGeometry(r * 0.98, r * 0.3, 10, 32), fur(trim));
  brim.rotation.x = Math.PI / 2;
  brim.position.y = r * 0.12;
  const tip = bend(1).add(new THREE.Vector3(0, h, 0));
  const pompom = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.36, 2), fur(trim));
  pompom.position.copy(tip);
  g.add(cone, brim, pompom);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ---------- the robots' hat ----------

/** A grumpy green hat on a robot opponent's head (procedural android, head joint units). */
export function grumpyHat(fighter) {
  const head = fighter.j?.head;
  if (!head || head.userData.hat) return;
  const hat = floppyHat({ hat: 'xr-xmas-grumpy-hat', trim: 'xr-xmas-grumpy-fur', r: 0.098, h: 0.24, side: -1 });
  hat.position.set(0, 0.19, -0.012);
  hat.rotation.x = -0.18;
  head.add(hat);
  head.userData.hat = hat;
}

// ---------- Santa ----------

const SANTA_TOKENS = {
  SantaSuit: 'xr-xmas-santa-suit',
  SantaFur: 'xr-xmas-santa-beard',
  SantaSkin: 'xr-xmas-santa-skin',
  SantaCheek: 'xr-xmas-santa-cheek',
  SantaNose: 'xr-xmas-santa-nose',
  SantaEye: 'xr-xmas-santa-belt',
  SantaBelt: 'xr-xmas-santa-belt',
  SantaGold: 'xr-xmas-gold',
  SantaBoot: 'xr-xmas-santa-belt',
};

/** The comic Santa (blender/build_santa.py, fighter-santa.glb) in the token colors. */
export function santaColors(model) {
  model?.traverse((o) => {
    if (!o.isMesh) return;
    [].concat(o.material).forEach((m) => {
      const token = SANTA_TOKENS[m?.name];
      if (token) m.color.set(hex(token));
    });
  });
}
