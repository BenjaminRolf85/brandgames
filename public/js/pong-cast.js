// AI Pong like its menu coin: Echo holds your table-tennis paddle, the AI is one of the
// KI-Arena's robots standing behind its paddle, a neon grid floor and a data city behind the AI.
// Only the look changes; the paddles' hit boxes and the game stay as they are.
import * as THREE from 'three';
import { loadEchoParts, bendWing } from './echo-mascot.js';
import { Fighter } from './fight-visuals.js';
import { color, hex } from './tokens.js';

/** Which Arena robot plays which Pong opponent. */
export const ROBOT_FOR = { gpt: 'light', gemini: 'heavy', claude: 'boss' };

/** Echo at the handle of the player's paddle (a child of the paddle group); swing() on a hit. */
export function makePaddleEcho(paddle, hw, hh) {
  const holder = new THREE.Group();
  holder.position.set(-hw * 0.75, -hh - 0.07, 0.03);
  paddle.add(holder);
  let parts = null;
  loadEchoParts().then((p) => {
    parts = p;
    p.model.scale.setScalar(0.1);
    p.model.rotation.y = Math.PI + 0.6; // towards the AI, a little turned so you see Echo's face
    p.model.traverse((o) => { if (o.isMesh) o.userData.noFit = true; });
    holder.add(p.model);
  }).catch(() => {});
  let swing = 0;
  return {
    swing() { swing = 1; },
    update(dt, t) {
      if (!parts) return;
      swing = Math.max(0, swing - dt * 3.5);
      holder.rotation.z = Math.sin(swing * Math.PI) * 0.5;
      parts.model.position.y = Math.sin(t * 3) * 0.05;
      parts.wings.forEach((w, i) => bendWing(w, 0.35 + Math.sin(t * 7 + i * 2) * 0.12 + swing * 0.5));
    },
  };
}

/**
 * An Arena robot behind the AI paddle, facing the player. It follows the paddle sideways and
 * swings when the AI hits. Returns { group, hit(), update(dt, paddle) }.
 */
export function makePaddleRobot(style, token, { hh, hw, z }) {
  const fighter = new Fighter({ style, token, facing: 1 });
  const turn = new THREE.Group();
  turn.rotation.y = -Math.PI / 2; // the figure faces +x; turned it faces the player (+z)
  turn.add(fighter.root);
  const group = new THREE.Group();
  group.add(turn);
  // Inside the tunnel, standing on its floor beside the paddle (as if holding it), fully visible.
  const box = new THREE.Box3().setFromObject(fighter.root);
  const height = Math.max(0.1, box.max.y - box.min.y);
  group.scale.setScalar((hh * 1.75) / height);
  group.position.set(0, -hh, z);
  group.traverse((o) => { o.userData.noFit = true; });
  return {
    group,
    hit() { fighter.play([['punch', 0.16, 22], ['guard', 0.3, 10]]); },
    update(dt, paddle) {
      fighter.update(dt);
      const want = THREE.MathUtils.clamp(paddle.x + (paddle.x > 0 ? -0.15 : 0.15), -hw + 0.07, hw - 0.07);
      group.position.x += (want - group.position.x) * Math.min(1, dt * 6);
    },
    dispose() { group.removeFromParent(); },
  };
}

/** Neon grid floor under the tunnel, fading out towards its edges. */
export function makeGridFloor(hw, hh, len) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = color('xr-pong-grid');
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, 128, 128);
  const grid = new THREE.CanvasTexture(c);
  grid.colorSpace = THREE.SRGBColorSpace;
  grid.wrapS = grid.wrapT = THREE.RepeatWrapping;
  const w = hw * 10;
  const l = len * 3;
  grid.repeat.set(w / 0.12, l / 0.12);
  const f = document.createElement('canvas');
  f.width = f.height = 128;
  const fx = f.getContext('2d');
  const g = fx.createRadialGradient(64, 64, 10, 64, 64, 64);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#000000');
  fx.fillStyle = g;
  fx.fillRect(0, 0, 128, 128);
  const fade = new THREE.CanvasTexture(f);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, l), new THREE.MeshBasicMaterial({
    map: grid, alphaMap: fade, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, -hh - 0.015, -len * 0.4);
  mesh.userData.noFit = true;
  return mesh;
}

/** A data city behind the AI: building silhouettes with lit windows on a transparent sky. */
export function makeSkyline(hw, hh, z) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 256;
  const ctx = c.getContext('2d');
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const lights = [color('xr-pong-window-a'), color('xr-pong-window-b')];
  for (let x = 0; x < 1024;) {
    const w = 40 + rnd() * 60;
    const h = 60 + rnd() * 170;
    ctx.fillStyle = color('xr-pong-skyline');
    ctx.fillRect(x, 256 - h, w - 4, h);
    for (let y = 256 - h + 10; y < 246; y += 14) {
      for (let wx = x + 6; wx < x + w - 12; wx += 12) {
        if (rnd() < 0.45) continue;
        ctx.fillStyle = lights[rnd() < 0.7 ? 0 : 1];
        ctx.globalAlpha = 0.5 + rnd() * 0.5;
        ctx.fillRect(wx, y, 6, 6);
        ctx.globalAlpha = 1;
      }
    }
    x += w;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const w = hw * 9;
  const h = w / 4;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  mesh.position.set(0, -hh + h / 2, z);
  mesh.userData.noFit = true;
  return mesh;
}

/** A table-tennis handle under a paddle (looks only). */
export function makeHandle(hh) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.075, 0.014), new THREE.MeshStandardMaterial({ color: hex('xr-pong-handle'), roughness: 0.6 }));
  mesh.position.set(0, -hh - 0.03, -0.004);
  return mesh;
}
