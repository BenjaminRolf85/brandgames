// Echo Parkour look (graphics pass, Nov 2026), scaled with gfxTier() from gfx.js:
//  - tone mapping (neutral: highlights such as the snow roll off instead of burning out, the
//    token colors stay) and the glossy environment for reflections on Echo, coins and metal
//  - a light rig per world: a warm key light that casts the shadow map, a cool sky and a warm
//    ground fill (the engine's room lights are turned down while the game runs and restored after)
//  - depth haze: a soft gradient in the sky color between the backdrop and the track, so trees,
//    towers and clouds sit further back (not on 'low')
//  - light shafts: moonbeams in the forest, dawn rays in the city (one draw call, 'high' only)
//  - bloom on glowing parts in the desktop browser only (never in the headset or on phones)
// All colors come from tokens (--xr-parkour-key-*, sky and ground fills; the haze takes the
// world's own sky tokens).
import * as THREE from 'three';
import { hex } from './tokens.js';
import { sceneLook, bloom, gfxTier } from './gfx.js';
import { quality } from './quality.js';
import { WINTER } from './snow.js';

const wt = (token) => (WINTER ? `${token}-winter` : token);

// Key light (color, intensity), hemisphere fill (sky, ground, intensity), rim strength, exposure.
const RIG = {
  forest: { key: 'xr-parkour-key-forest', keyI: 1.9, sky: 'xr-parkour-sky-forest', ground: 'xr-parkour-ground-forest', hemi: 0.75, rim: 1.0, exposure: 1.0, haze: () => wt('xr-forest-sky-bottom'), shafts: 'xr-parkour-shaft-forest' },
  city: { key: 'xr-parkour-key-city', keyI: 1.9, sky: 'xr-parkour-sky-city', ground: 'xr-parkour-ground-city', hemi: 0.8, rim: 0.9, exposure: 1.0, haze: () => wt('xr-city-sky-bottom'), shafts: 'xr-parkour-shaft-city' },
  office: { key: 'xr-parkour-key-office', keyI: 1.55, sky: 'xr-parkour-sky-office', ground: 'xr-parkour-ground-office', hemi: 0.85, rim: 0.7, exposure: 1.0, haze: null, shafts: null },
};

/**
 * Sets the look while a level runs (call before the stage is built). Returns the rig for the
 * stage lights and dispose() that restores the renderer and the engine's room lights.
 */
export function parkourLook(engine, world, env) {
  const rig = RIG[world] ?? RIG.office;
  const tier = gfxTier();
  const restore = sceneLook(engine, { tone: 'neutral', exposure: rig.exposure, env, envIntensity: 1, shadows: quality.lite ? false : 'soft' });
  // The engine's room lights (hemisphere and a white sun) would flatten the stage: the level's
  // own fill takes over while it runs.
  const lights = engine.scene.children.filter((o) => o.isLight && (o.isHemisphereLight || o.isDirectionalLight));
  const saved = lights.map((l) => ({ l, i: l.intensity, c: l.color.clone(), g: l.groundColor?.clone() }));
  for (const l of lights) {
    if (l.isHemisphereLight) {
      l.color.setHex(hex(rig.sky));
      l.groundColor.setHex(hex(rig.ground));
      l.intensity = rig.hemi;
    } else {
      l.intensity *= 0.25;
    }
  }
  // Bloom only where frames are cheap: the desktop browser with full effects.
  const glow = tier === 'high' && !engine.isXR && !engine.touchUI ? bloom(engine, { strength: 0.42, radius: 0.55, threshold: 0.9 }) : null;
  return {
    rig,
    tier,
    /** Key and rim light: colors and strength of this world. */
    light(key, rim) {
      key.color.setHex(hex(rig.key));
      key.intensity = rig.keyI;
      rim.intensity = rig.rim;
      if (key.castShadow) {
        const map = tier === 'high' ? 2048 : 1024;
        key.shadow.mapSize.set(map, map);
        key.shadow.radius = 3;
      }
    },
    dispose() {
      glow?.();
      restore();
      for (const s of saved) {
        s.l.intensity = s.i;
        s.l.color.copy(s.c);
        if (s.g) s.l.groundColor.copy(s.g);
      }
    },
  };
}

let hazeTex = null;
/** Vertical alpha ramp: dense at the bottom (mist rising from below), clear towards the top. */
function hazeTexture() {
  if (hazeTex) return hazeTex;
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 256, 0, 0);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.62)');
  g.addColorStop(0.62, 'rgba(255,255,255,0.22)');
  g.addColorStop(1, 'rgba(255,255,255,0.05)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 256);
  hazeTex = new THREE.CanvasTexture(c);
  return hazeTex;
}

/**
 * Depth haze between the backdrop and the track (stage units): one transparent plane in the sky
 * color. setColor(color) follows the sky (the city's night).
 */
export function makeHaze(world, half, bottom, top, opacity = 0.42) {
  const rig = RIG[world];
  if (!rig?.haze || gfxTier() === 'low') return null;
  const mat = new THREE.MeshBasicMaterial({ color: hex(rig.haze()), alphaMap: hazeTexture(), transparent: true, opacity, depthWrite: false, toneMapped: false, fog: false });
  const h = (top - bottom) * 0.8;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, h), mat);
  mesh.position.set(0, bottom + h / 2, -1.55); // just behind the back edge of the track
  mesh.renderOrder = 1;
  mesh.userData.noFit = true;
  return { mesh, setColor: (col) => mat.color.copy(col), mat };
}

let shaftTex = null;
/** One soft beam: bright core across, fading out along its length. */
function shaftTexture() {
  if (shaftTex) return shaftTex;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(64, 128);
  for (let y = 0; y < 128; y++) {
    const along = Math.pow(1 - y / 127, 1.4); // bright at the top (source), gone at the bottom
    for (let x = 0; x < 64; x++) {
      const u = (x - 31.5) / 31.5;
      const a = Math.exp(-u * u * 4) * along;
      const o = (y * 64 + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = 255;
      img.data[o + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, 0, 0);
  shaftTex = new THREE.CanvasTexture(c);
  return shaftTex;
}

/**
 * Light shafts falling in from the upper left like the key light (stage units, merged into one
 * mesh, additive). 'high' only: on the headset with full effects and in the browser.
 * update(t, strength) lets them breathe and fade (the city's rays go out at night).
 */
export function makeShafts(world, half, top, bottom) {
  const rig = RIG[world];
  if (!rig?.shafts || gfxTier() !== 'high') return null;
  const geos = [];
  const beams = world === 'forest'
    ? [[-0.55, 1.4, 0.95], [-0.25, 1.0, 0.8], [0.02, 1.6, 1.0], [0.3, 1.1, 0.75]]
    : [[-0.5, 1.7, 0.9], [-0.12, 1.2, 0.7], [0.25, 1.8, 0.85]];
  // The beams stay inside the stage frame: they start under its top and end before its right edge.
  const len = (top - bottom) * 0.82;
  beams.forEach(([fx, w, k], i) => {
    const g = new THREE.PlaneGeometry(w, len);
    g.translate(0, -len / 2, 0); // hangs down from its source
    g.rotateZ(0.42); // slanted like the key light from the upper left
    g.translate(fx * half - 1.2, top - 0.4, -1.25 - i * 0.04);
    // per-beam brightness in the vertex colors
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(k), 3));
    geos.push(g);
  });
  const geo = mergeGeos(geos);
  const mat = new THREE.MeshBasicMaterial({ color: hex(rig.shafts), map: shaftTexture(), vertexColors: true, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 2;
  mesh.userData.noFit = true;
  mesh.frustumCulled = false;
  return {
    mesh,
    update(t, strength = 1) {
      mat.opacity = 0.16 * strength * (0.82 + 0.18 * Math.sin(t * 0.7));
      mesh.visible = mat.opacity > 0.004;
    },
  };
}

/** Merges plane geometries (same attributes) into one. */
function mergeGeos(geos) {
  const out = new THREE.BufferGeometry();
  const names = ['position', 'normal', 'uv', 'color'];
  let count = 0;
  const index = [];
  for (const g of geos) {
    for (let i = 0; i < g.index.count; i++) index.push(g.index.getX(i) + count);
    count += g.attributes.position.count;
  }
  for (const name of names) {
    const size = geos[0].attributes[name].itemSize;
    const arr = new Float32Array(count * size);
    let o = 0;
    for (const g of geos) { arr.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  out.setIndex(index);
  geos.forEach((g) => g.dispose());
  return out;
}
