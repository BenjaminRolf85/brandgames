// Shared graphics kit for all games (Nov 2026): a scene "look" (tone mapping, exposure, image
// based lighting from a soft studio environment, soft shadows), texture polish, cheap contact
// shadows and optional bloom in the browser. Everything respects the effects setting
// (quality.lite: cheaper shadows, no bloom) and the headset (no post effects in XR, where every
// frame counts twice). UI panels (ui3d.js) use toneMapped: false, so they keep their token colors.
//
//   const restore = sceneLook(engine, { tone: 'aces', exposure: 1.05, env: 'studio', shadows: 'soft' });
//   this.onSceneDispose(restore);
//   softSun(light, { size: 2.4 });         // shadow camera and map size for a sun over the play area
//   polish(model, engine.renderer);         // anisotropic filtering, shadows on, sRGB color maps
//   group.add(contactShadow(0.3));          // a soft dark blob under a figure or prop
//   this.onSceneDispose(bloom(engine, { strength: 0.5, threshold: 0.85 }));
import * as THREE from 'three';
import { quality } from './quality.js';
import { RoomEnvironment } from '../vendor/addons/environments/RoomEnvironment.js';

const TONES = {
  none: THREE.NoToneMapping,
  aces: THREE.ACESFilmicToneMapping,
  agx: THREE.AgXToneMapping,
  neutral: THREE.NeutralToneMapping,
};

let studio = null; // shared PMREM texture of the studio environment (one per renderer)
let studioRenderer = null;

/** A soft, neutral studio environment for reflections on PBR materials (built once). */
export function studioEnvironment(renderer) {
  if (studio && studioRenderer === renderer) return studio;
  const pmrem = new THREE.PMREMGenerator(renderer);
  studio = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  studioRenderer = renderer;
  pmrem.dispose();
  return studio;
}

/**
 * Sets the scene's look while a game runs; returns a function that restores the previous
 * settings (call it on dispose). tone: 'none' | 'aces' | 'agx' | 'neutral'; exposure: number;
 * env: 'studio' | a texture | null (keep); envIntensity: number (scene.environmentIntensity);
 * shadows: 'soft' | 'basic' | false.
 */
export function sceneLook(engine, { tone = 'neutral', exposure = 1, env = 'studio', envIntensity = 1, shadows = 'soft' } = {}) {
  const r = engine.renderer;
  const s = engine.scene;
  const prev = {
    tone: r.toneMapping, exposure: r.toneMappingExposure, env: s.environment, envIntensity: s.environmentIntensity,
    shadow: r.shadowMap.enabled, shadowType: r.shadowMap.type,
  };
  r.toneMapping = TONES[tone] ?? THREE.NeutralToneMapping;
  r.toneMappingExposure = exposure;
  if (env === 'studio') s.environment = studioEnvironment(r);
  else if (env) s.environment = env;
  s.environmentIntensity = envIntensity;
  if (shadows) {
    r.shadowMap.enabled = true;
    // Soft shadows cost more: the headset with "lite" effects keeps the cheaper filter.
    r.shadowMap.type = shadows === 'soft' && !(quality.lite && engine.isXR) ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    r.shadowMap.needsUpdate = true;
  }
  return () => {
    r.toneMapping = prev.tone;
    r.toneMappingExposure = prev.exposure;
    s.environment = prev.env;
    s.environmentIntensity = prev.envIntensity;
    r.shadowMap.enabled = prev.shadow;
    r.shadowMap.type = prev.shadowType;
    r.shadowMap.needsUpdate = true;
  };
}

/**
 * A directional light that casts good shadows over an area of size meters around its target:
 * a tight shadow camera, map size by quality, small bias against acne and peter-panning.
 */
export function softSun(light, { size = 2, near = 0.1, far = 12, bias = -0.0004, normalBias = 0.02, radius = 3 } = {}) {
  light.castShadow = true;
  const cam = light.shadow.camera;
  cam.left = -size / 2; cam.right = size / 2; cam.top = size / 2; cam.bottom = -size / 2;
  cam.near = near; cam.far = far;
  cam.updateProjectionMatrix();
  const map = quality.lite ? 1024 : 2048;
  light.shadow.mapSize.set(map, map);
  light.shadow.bias = bias;
  light.shadow.normalBias = normalBias;
  light.shadow.radius = radius;
  return light;
}

/**
 * Texture and shadow polish for a loaded model or group: anisotropic filtering (sharp floors and
 * signs at grazing angles), sRGB on color maps, cast and receive shadows (opt out per mesh with
 * userData.noShadow).
 */
export function polish(root, renderer, { cast = true, receive = true } = {}) {
  const aniso = Math.min(quality.lite ? 4 : 8, renderer.capabilities.getMaxAnisotropy());
  root.traverse((o) => {
    if (!o.isMesh) return;
    if (!o.userData.noShadow) { o.castShadow = cast; o.receiveShadow = receive; }
    for (const m of [].concat(o.material)) {
      if (!m) continue;
      for (const key of ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) {
        const tex = m[key];
        if (!tex) continue;
        tex.anisotropy = aniso;
        if (key === 'map' || key === 'emissiveMap') tex.colorSpace = THREE.SRGBColorSpace;
        tex.needsUpdate = true;
      }
    }
  });
  return root;
}

let blobTex = null;
/** A soft dark blob that grounds a figure or prop (cheap contact shadow, no shadow map needed). */
export function contactShadow(radius = 0.2, opacity = 0.45) {
  if (!blobTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    blobTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity, depthWrite: false, toneMapped: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = -1;
  m.userData.noFit = true;
  m.userData.noShadow = true;
  return m;
}

/**
 * Bloom for the browser view (glowing neon, lights, crystals). Off in the headset and with
 * "lite" effects. A high threshold keeps UI text from glowing. Returns a dispose function.
 * Note: with bloom the tone mapping is applied once at the end (OutputPass), also to the UI,
 * so prefer tone: 'neutral' (closest to the token colors) in scenes that use it.
 */
export function bloom(engine, { strength = 0.45, radius = 0.4, threshold = 0.88 } = {}) {
  if (quality.lite) return () => {};
  let composer = null;
  let bloomPass = null;
  let alive = true;
  const size = new THREE.Vector2();
  const build = async () => {
    const [{ EffectComposer }, { RenderPass }, { UnrealBloomPass }, { OutputPass }] = await Promise.all([
      import('../vendor/addons/postprocessing/EffectComposer.js'),
      import('../vendor/addons/postprocessing/RenderPass.js'),
      import('../vendor/addons/postprocessing/UnrealBloomPass.js'),
      import('../vendor/addons/postprocessing/OutputPass.js'),
    ]);
    if (!alive) return;
    const r = engine.renderer;
    r.getSize(size);
    composer = new EffectComposer(r);
    composer.addPass(new RenderPass(engine.scene, engine.camera));
    bloomPass = new UnrealBloomPass(size.clone(), strength, radius, threshold);
    composer.addPass(bloomPass);
    composer.addPass(new OutputPass());
    engine.post = (dt) => {
      r.getSize(size);
      if (composer._w !== size.x || composer._h !== size.y) {
        composer.setPixelRatio(r.getPixelRatio());
        composer.setSize(size.x, size.y);
        composer._w = size.x;
        composer._h = size.y;
      }
      composer.render(dt);
    };
  };
  build().catch((e) => console.warn('Bloom not available', e));
  return () => {
    alive = false;
    if (engine.post) engine.post = null;
    composer?.dispose();
    bloomPass?.dispose();
  };
}
