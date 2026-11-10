// Swaps a fighter's procedural body for a detailed skinned model made in Blender
// (public/assets/models/*.glb). The pose system keeps driving the invisible joint rig of the
// Fighter; every frame its rotations are transferred onto the model's skeleton.
import * as THREE from 'three';
import { loadGLTF } from './models.js';
import { clone as cloneSkinned } from '../vendor/addons/utils/SkeletonUtils.js';
import { loadGlove, makeGlove } from './fight-gloves.js';

const load = loadGLTF; // shared, cached loader (models.js)

// Rig joint -> skeleton bone (MakeHuman game-engine skeleton)
const RIG_TO_BONE = {
  hips: 'pelvis', spine: 'spine_01', chest: 'spine_02', neck: 'neck_01', head: 'head',
  lShoulder: 'upperarm_l', lElbow: 'lowerarm_l', rShoulder: 'upperarm_r', rElbow: 'lowerarm_r',
  lHip: 'thigh_l', lKnee: 'calf_l', lAnkle: 'foot_l', rHip: 'thigh_r', rKnee: 'calf_r', rAnkle: 'foot_r',
};
const RIG_PARENT = {
  hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck',
  lShoulder: 'chest', lElbow: 'lShoulder', rShoulder: 'chest', rElbow: 'rShoulder',
  lHip: 'hips', lKnee: 'lHip', lAnkle: 'lKnee', rHip: 'hips', rKnee: 'rHip', rAnkle: 'rKnee',
};
const RIG_ORDER = Object.keys(RIG_PARENT);
// Limb bones are straightened to hang down at rest, like the joint rig the poses were made for.
const STRAIGHTEN = {
  upperarm_l: 'lowerarm_l', lowerarm_l: 'hand_l', upperarm_r: 'lowerarm_r', lowerarm_r: 'hand_r',
  thigh_l: 'calf_l', calf_l: 'foot_l', thigh_r: 'calf_r', calf_r: 'foot_r',
};
const DOWN = new THREE.Vector3(0, -1, 0);
const FINGER = /^(index|middle|ring|pinky)_0[123]_[lr]$/;
const THUMB = /^thumb_0[23]_[lr]$/;

export function attachModel(f, url, { height = 1.86, curl = 1.25, thumbCurl = 0.6, alphaTest = 0.45 } = {}) {
  // The procedural figure stays hidden while the model loads (no visible costume change);
  // it only appears if the model fails or takes very long.
  const joints = new Set(Object.values(f.j));
  const proc = [];
  f.body.traverse((o) => { if (o.isMesh && !joints.has(o) && o.visible) proc.push(o); });
  const showProc = (v) => proc.forEach((o) => { o.visible = v; });
  showProc(false);
  const fallback = setTimeout(() => showProc(true), 6000);
  return Promise.all([load(url), loadGlove().catch(() => null)]).then(([gltf, glove]) => {
    clearTimeout(fallback);
    if (f.disposed) return;
    const model = cloneSkinned(gltf.scene);
    // Size and ground the model in rig units.
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const s = height / (box.max.y - box.min.y);
    model.scale.setScalar(s);
    model.position.y = -box.min.y * s;
    const mats = new Set();
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      const m = o.material;
      if (m.transparent || m.alphaMap || (m.map && /hair|brow|lash|short/i.test(`${m.name} ${o.name}`))) {
        m.transparent = false;
        m.alphaTest = alphaTest;
        m.depthWrite = true;
      }
      mats.add(m);
    });

    // Hide the procedural body (its joint groups keep running as the "virtual rig").
    showProc(false);
    f.body.add(model);
    model.updateMatrixWorld(true);

    // Bind data in model space.
    const inv = new THREE.Quaternion();
    model.getWorldQuaternion(inv).invert();
    const bones = [];
    model.traverse((o) => { if (o.isBone) bones.push(o); });
    const byName = Object.fromEntries(bones.map((b) => [b.name, b]));
    const rest = new Map();
    const parentRest = new Map();
    const corr = new Map();
    const pos = (b) => model.worldToLocal(b.getWorldPosition(new THREE.Vector3()));
    for (const b of bones) {
      rest.set(b, inv.clone().multiply(b.getWorldQuaternion(new THREE.Quaternion())));
      parentRest.set(b, inv.clone().multiply(b.parent.getWorldQuaternion(new THREE.Quaternion())));
      const child = byName[STRAIGHTEN[b.name]];
      corr.set(b, child ? new THREE.Quaternion().setFromUnitVectors(pos(child).sub(pos(b)).normalize(), DOWN) : new THREE.Quaternion());
    }
    const boneToRig = Object.fromEntries(Object.entries(RIG_TO_BONE).map(([r, b]) => [b, r]));
    const curlQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), curl);
    const thumbQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), thumbCurl);
    const ident = new THREE.Quaternion();
    const G = {};
    const M = new Map();
    const W = new Map();

    f.drive = () => {
      for (const name of RIG_ORDER) {
        const p = RIG_PARENT[name];
        G[name] = (p ? G[p].clone() : new THREE.Quaternion()).multiply(f.j[name].quaternion);
      }
      for (const b of bones) {
        const pb = b.parent.isBone ? b.parent : null;
        const rig = boneToRig[b.name];
        const m = rig ? G[rig].clone().multiply(corr.get(b)) : pb ? M.get(pb) : ident;
        M.set(b, m);
        const w = m.clone().multiply(rest.get(b));
        W.set(b, w);
        const pw = pb ? W.get(pb) : parentRest.get(b);
        b.quaternion.copy(pw.clone().invert().multiply(w));
        if (FINGER.test(b.name)) b.quaternion.multiply(curlQ);
        else if (THUMB.test(b.name)) b.quaternion.multiply(thumbQ);
      }
    };
    f.flashMats = [...mats].filter((m) => m.emissive);
    // Boxing gloves on the hand bones, turned so that they follow the forearm exactly like the
    // rig's elbow joint: the bone's model-space rotation is G[elbow] * corr(forearm) * rest(hand),
    // so the inverse of corr(forearm) * rest(hand) leaves G[elbow].
    if (glove) {
      const ws = new THREE.Vector3();
      const bs = new THREE.Vector3();
      for (const side of ['l', 'r']) {
        const hand = byName[`hand_${side}`];
        const fore = byName[`lowerarm_${side}`];
        if (!hand || !fore) continue;
        const holder = makeGlove(glove, f.token, side === 'l');
        holder.quaternion.copy(corr.get(fore).clone().multiply(rest.get(hand)).invert());
        holder.scale.setScalar(f.body.getWorldScale(bs).x / hand.getWorldScale(ws).x);
        hand.add(holder);
        f.flashMats.push(...holder.userData.flashMats);
      }
    }
    f.model = model;
    f.drive();
    f.onModel?.(model); // e.g. the arena turns it into a hologram
  }).catch((e) => {
    clearTimeout(fallback);
    showProc(true);
    console.warn('fighter model', e);
  });
}
