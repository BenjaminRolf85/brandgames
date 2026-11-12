// Scene look of AI Pong (graphics pass, Nov 2026): tone mapping and a soft studio environment
// for the metal frame, the robot and Echo; a warm key light with a cool rim light from the far
// end of the tunnel; real shadows of the ball, the robot and Echo on the tunnel floor where the
// device can afford them; a night-sky gradient behind the tunnel in the browser; bloom on the
// desktop (neon parts are pushed a bit above white there, so only they glow, not the UI).
// Effects scale with gfxTier(): 'high' (desktop, Quest 3 full), 'medium' (phones, Quest 3 lite,
// Quest 2), 'low' (lite elsewhere). The headset never gets post effects or a background image,
// and AR keeps the real room visible.
import * as THREE from 'three';
import { sceneLook, softSun, bloom, gfxTier } from './gfx.js';
import { color, hex } from './tokens.js';

/** Night sky behind the tunnel (browser only): dark at the top, a violet glow at the horizon. */
function skyTexture() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, color('xr-pong-sky-top'));
  g.addColorStop(0.55, color('xr-pong-sky-mid'));
  g.addColorStop(0.8, color('xr-pong-sky-top'));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  // A thin glow band at the horizon, behind the data city's silhouettes.
  ctx.fillStyle = color('xr-pong-sky-glow');
  for (let y = 0; y < 256; y++) {
    ctx.globalAlpha = 0.42 * Math.exp(-(((y / 256 - 0.6) / 0.07) ** 2));
    ctx.fillRect(0, y, 4, 1);
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Sets up the look for a Pong scene. arena: the scaled arena group (tunnel units);
 * hw, hh, len: tunnel half width, half height and length.
 * Returns { neon, shadows, casters(root) }.
 */
export function pongLook(scene, arena, { hw, hh, len }) {
  const e = scene.engine;
  const tier = gfxTier();
  const xr = e.isXR;
  const desktop = !xr && !e.touchUI;
  // Real shadows: desktop and Quest 3 full ('high'), and phones; the cheaper headset paths keep
  // the soft blob under the robot and the light dots on the walls.
  const shadows = tier === 'high' || (tier === 'medium' && !xr);
  scene.onSceneDispose(sceneLook(e, {
    tone: 'neutral',
    exposure: 1.05,
    env: 'studio',
    envIntensity: 0.55,
    shadows: shadows ? 'soft' : false,
  }));

  // The preview's flat white lights give way to a warm key and a cool rim light.
  const sun = e.scene.children.find((o) => o.isDirectionalLight);
  const prev = { hemi: e.hemi.intensity, sun: sun?.intensity };
  e.hemi.intensity = 0.55;
  if (sun) sun.intensity = 0.35;
  scene.onSceneDispose(() => {
    e.hemi.intensity = prev.hemi;
    if (sun) sun.intensity = prev.sun;
  });

  const key = new THREE.DirectionalLight(hex('xr-pong-key-light'), 1.7);
  key.position.set(0.5, 1.6, 1.1); // above and in front of the tunnel (arena units)
  key.target.position.set(0, -hh, -len * 0.1);
  const rim = new THREE.DirectionalLight(hex('xr-pong-rim-light'), 1.3);
  rim.position.set(-0.4, 0.5, -len); // from the far end, behind the robot
  rim.target.position.set(0, 0, len * 0.3);
  arena.add(key, key.target, rim, rim.target);
  if (shadows) {
    softSun(key, { size: 2.2, near: 0.5, far: 4.5, bias: -0.0006, normalBias: 0.01, radius: 4 });
    // Shadow catcher on the tunnel floor: only the shadows show, the neon floor stays as it is.
    // It reaches a bit past the far end, where the robot stands.
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(2 * hw, len + 0.4), new THREE.ShadowMaterial({ opacity: 0.6, depthWrite: false }));
    catcher.renderOrder = 3; // after the glowing floor grid, so the shadows darken it too
    catcher.rotation.x = -Math.PI / 2;
    catcher.position.set(0, -hh + 0.001, -0.2);
    catcher.receiveShadow = true;
    catcher.userData.noFit = true;
    catcher.userData.noShadow = true;
    arena.add(catcher);
  }

  // Browser: a night sky with a violet horizon glow behind the data city (not in the headset:
  // VR keeps its plain backdrop, AR the real room).
  if (!xr) {
    const before = e.scene.background;
    const sky = skyTexture();
    e.scene.background = sky;
    scene.onSceneDispose(() => {
      if (e.scene.background === sky) e.scene.background = before;
      sky.dispose();
    });
  }

  // Desktop: bloom. The neon parts get pushed above white (factor neon), so only they glow.
  let neon = 1;
  if (desktop && tier === 'high') {
    neon = 1.7;
    scene.onSceneDispose(bloom(e, { strength: 0.45, radius: 0.5, threshold: 1.0 }));
  }

  return {
    neon,
    shadows,
    /** Lets these meshes throw shadows (when shadows are on). */
    casters(root) {
      if (!shadows || !root) return;
      root.traverse((o) => { if (o.isMesh && !o.material?.transparent) o.castShadow = true; });
    },
  };
}
