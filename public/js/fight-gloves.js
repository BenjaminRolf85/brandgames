// Boxing gloves for the AI Arena (blender/build_glove.py), like the "Robo Boxen" game coin: one on
// every hand of every fighter, the leather in the fighter's color. Nova's gloves ride on the hand
// bones of her skinned model, the robots' on their forearms (their mechanical hands are hidden),
// Echo's on its wings. The arena's hologram look applies to them like to the rest of the figure.
import * as THREE from 'three';
import { loadGLTF } from './models.js';
import { hex } from './tokens.js';

export const GLOVE_URL = 'assets/models/glove.glb';
export const loadGlove = () => loadGLTF(GLOVE_URL);

/**
 * One glove in a holder group (origin at the wrist, the fist towards -y, the thumb and the
 * knuckle pad towards +z). mirror: the left-hand version. holder.userData.flashMats: the leather.
 */
export function makeGlove(gltf, token, mirror = false) {
  const leather = new THREE.MeshStandardMaterial({ color: hex(token), roughness: 0.35, metalness: 0.05, vertexColors: true, emissive: hex(token), emissiveIntensity: 0.12 });
  const mats = {
    GloveLeather: leather,
    GloveTrim: new THREE.MeshStandardMaterial({ color: hex('xr-fight-glove-trim'), roughness: 0.5, vertexColors: true }),
    GloveDark: new THREE.MeshStandardMaterial({ color: hex('xr-fight-dark'), roughness: 0.6, vertexColors: true }),
  };
  const glove = gltf.scene.getObjectByName('Glove').clone(true);
  glove.position.set(0, 0.02, 0); // reaches a little over the wrist
  if (mirror) glove.scale.x = -1;
  glove.traverse((o) => {
    if (!o.isMesh) return;
    o.material = mats[o.material.name] ?? o.material;
    o.castShadow = true;
    o.frustumCulled = false;
  });
  const holder = new THREE.Group();
  holder.add(glove);
  holder.userData.flashMats = [leather];
  return holder;
}

/** Gloves on a procedural rig (the robots): on the forearms where the hands were. */
export function attachRigGloves(f, gltf) {
  for (const side of ['l', 'r']) {
    const fist = f[`${side}Fist`];
    const hand = fist?.parent;
    if (!hand?.parent) continue;
    hand.visible = false; // the fist stays as the anchor for hit effects
    // As big as the robot's fist is wide (the glove is 0.13 wide, a fist about 0.075).
    fist.geometry.computeBoundingBox();
    const k = THREE.MathUtils.clamp((fist.geometry.boundingBox.max.x - fist.geometry.boundingBox.min.x) / 0.075, 0.8, 1.4);
    const holder = makeGlove(gltf, f.token, side === 'l');
    holder.position.copy(hand.position).add(new THREE.Vector3(0, 0.03, 0));
    holder.scale.setScalar(k);
    hand.parent.add(holder);
    f.flashMats?.push(...holder.userData.flashMats);
  }
}
