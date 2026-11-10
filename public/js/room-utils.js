// Small helpers shared by the AR room effects, the flying mascot and Echo's voice. Kept apart
// from ar-room.js, so the menu does not have to load the room effects at start.
import * as THREE from 'three';
import { audioContext } from './sfx.js';

/** Point in polygon test on the plane (polygon points have x and y). */
export function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** A panner at a world position with the listener set to the player's head (HRTF). */
export function spatialOut(engine, pos) {
  const a = audioContext();
  if (!a) return null;
  const head = engine.isXR ? engine.head : { pos: engine.camera.getWorldPosition(new THREE.Vector3()), quat: engine.camera.getWorldQuaternion(new THREE.Quaternion()) };
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(head.quat);
  const up = new THREE.Vector3(0, 1, 0).applyQuaternion(head.quat);
  const L = a.listener;
  if (L.positionX) {
    L.positionX.value = head.pos.x; L.positionY.value = head.pos.y; L.positionZ.value = head.pos.z;
    L.forwardX.value = fwd.x; L.forwardY.value = fwd.y; L.forwardZ.value = fwd.z;
    L.upX.value = up.x; L.upY.value = up.y; L.upZ.value = up.z;
  } else {
    L.setPosition?.(head.pos.x, head.pos.y, head.pos.z);
    L.setOrientation?.(fwd.x, fwd.y, fwd.z, up.x, up.y, up.z);
  }
  const p = a.createPanner();
  p.panningModel = 'HRTF';
  p.distanceModel = 'inverse';
  p.refDistance = 0.7;
  if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
  p.connect(a.destination);
  return { a, p };
}
