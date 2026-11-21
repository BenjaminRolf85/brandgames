// Browser view helpers for AI Pong and the Data Flight (Nov 2026 upgrade). Both games place the
// camera themselves in the browser (first person behind the paddle, a chase view behind Echo),
// so their status bar, hints and panels are pinned to fixed places of the screen instead of
// standing somewhere in the room. The camera has no rotation in these views.
import * as THREE from 'three';

const D = 0.6; // distance of the pinned things in front of the camera (m)
const _v = new THREE.Vector3();

/** CSS px per meter at the pin distance. */
export function pinScale(camera) {
  return window.innerHeight / (2 * D * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
}

/**
 * Puts a holder group where a screen rectangle is: centered at cx, cy (CSS px), wPx wide for
 * content that is w meters wide. The holder must be a child of scene.group (or of a group
 * without its own transform below it).
 */
export function pinToScreen(scene, holder, w, cx, cy, wPx) {
  const cam = scene.engine.camera;
  const ppm = pinScale(cam);
  _v.set(cam.position.x + (cx - window.innerWidth / 2) / ppm, cam.position.y - (cy - window.innerHeight / 2) / ppm, cam.position.z - D);
  holder.position.copy(scene.group.worldToLocal(_v));
  holder.scale.setScalar(wPx / (w * ppm));
}

/** Draws an object over the 3D view (texts pinned to the screen). */
export function drawOnTop(obj, order = 30) {
  obj.traverse((o) => {
    if (!o.material) return;
    o.material.depthTest = false;
    o.material.depthWrite = false;
    o.renderOrder = order;
  });
  return obj;
}

/**
 * Desktop: moves the 3D status bar and its menu button (BaseScene.hud) into one holder, so the
 * game can pin them to the top of the screen. Returns { holder, home, width } or null.
 */
export function hudHolder(scene) {
  const parts = scene.group.children.filter((o) => o.userData.hud);
  if (!parts.length) return null;
  const holder = new THREE.Group();
  const home = parts[0].position.clone().setX(0);
  holder.position.copy(home);
  scene.group.add(holder);
  let x0 = Infinity;
  let x1 = -Infinity;
  for (const o of parts) {
    holder.add(o);
    o.position.set(o.position.x, 0, 0);
    x0 = Math.min(x0, o.position.x - o.w / 2);
    x1 = Math.max(x1, o.position.x + o.w / 2);
    drawOnTop(o);
  }
  // Centered: the pin puts the holder's origin in the middle of the bar.
  const mid = (x0 + x1) / 2;
  for (const o of parts) o.position.x -= mid;
  home.x = mid;
  holder.position.x = mid;
  return { holder, home, width: x1 - x0 };
}

/**
 * Panels pinned over the bright neon scene: the panel's own background is drawn twice, so the
 * slightly see-through panel color of the skin becomes nearly solid and the text stays readable.
 */
export function solid(panel) {
  const draw = panel.draw;
  panel.draw = (ctx, p) => { p.surface(); draw(ctx, p); };
  panel.redraw();
  return panel;
}

const _box = new THREE.Box3();
const _c = new THREE.Vector3();
const _want = new THREE.Vector3();

/**
 * Phones: frames the scene's menus (intro, result) like the engine's own camera fit, but lets
 * the camera come closer than the engine does. On a phone held sideways the engine's fixed
 * minimum distance makes panels and buttons tiny; here they fill the free height. Use it as the
 * scene's mobileView while no game view is active: (cam, dt, ins) => closeFit(scene, cam, dt, ins).
 */
export function closeFit(scene, cam, dt, ins, minDist = 0.75) {
  const e = scene.engine;
  const pts = [];
  const visit = (o) => {
    if (!o.visible || o.userData.noFit || o.scale.x < 0.5) return;
    if (o.isMesh && o.geometry) {
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      _box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
      for (let i = 0; i < 8; i++) pts.push(new THREE.Vector3(i & 1 ? _box.max.x : _box.min.x, i & 2 ? _box.max.y : _box.min.y, i & 4 ? _box.max.z : _box.min.z));
    }
    o.children.forEach(visit);
  };
  e.root.children.forEach(visit);
  if (!pts.length) return false;
  if (cam.fov !== 60) { cam.fov = 60; cam.updateProjectionMatrix(); }
  cam.rotation.set(0, 0, 0);
  const H = window.innerHeight;
  const tv = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
  const th = tv * cam.aspect;
  const free = Math.max(0.35, 1 - (ins.top + ins.bottom) / H);
  const center = (ins.bottom - ins.top) / H;
  _box.setFromPoints(pts).getCenter(_c);
  let need = _box.max.z + minDist;
  for (const v of pts) need = Math.max(need, v.z + (1.02 * Math.abs(v.x - _c.x)) / th, v.z + (1.02 * Math.abs(v.y - _c.y)) / (tv * free));
  _want.set(_c.x, _c.y - center * (need - _c.z) * tv, need);
  cam.position.lerp(_want, Math.min(1, dt * 5));
  return true;
}
