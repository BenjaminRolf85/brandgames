// Game coins of the main menu: the Blender coin (assets/models/coin.glb, blender/build_coin.py)
// with the game's card art on its face (CARD_ART, assets/cards/<key>.webp, cut from the images in
// docs/spielkarten) or, until a game has one, a face drawn from the design tokens (gradient,
// sparkles, the game's icon). The metal frame gets a token gradient (cyan to violet); the coins
// sway gently, and grow, turn to the player and light up when pointed at.
import * as THREE from 'three';
import { loadGLTF } from './models.js';
import { color, hex } from './tokens.js';
import { drawIcon } from './icons.js';
import { gfxTier } from './gfx.js';

export const COIN_URL = 'assets/models/coin.glb';
export const CARD_ART = {
  parkour: 'assets/cards/parkour.webp',
  pong: 'assets/cards/pong.webp',
  dataflight: 'assets/cards/dataflight.webp',
  fight: 'assets/cards/fight.webp',
  quiz: 'assets/cards/quiz.webp',
  // Games for our clients (rendered in Blender by their build scripts)
  clients: 'assets/cards/clients.webp', // the gift coin that opens them (blender/build_clients_coin.py)
  bike: 'assets/cards/bike.webp',
  bricks: 'assets/cards/bricks.webp',
  green: 'assets/cards/green.webp',
  dock: 'assets/cards/dock.webp',
  roast: 'assets/cards/roast.webp',
  pinball: 'assets/cards/pinball.webp',
  summit: 'assets/cards/summit.webp',
};

let promise = null;
let shared = null; // { model, rim, back } built once per renderer
const faces = new Map(); // game key -> texture

/** Loads the coin once and prepares its shared materials (needs the renderer for reflections). */
export function loadCoin(renderer) {
  promise ??= loadGLTF(COIN_URL).then((gltf) => {
    shared = prepare(gltf, renderer);
    return shared;
  });
  return promise;
}

/** A soft studio environment for the metal (grey dome with three softboxes). */
function studioEnv(renderer) {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(10, 24, 12), new THREE.MeshBasicMaterial({ color: 0x3a4058, side: THREE.BackSide })));
  const box = (x, y, z, w, h, c) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  box(-4, 4, 6, 6, 4, 0xffffff);
  box(5, 1, 4, 3, 5, 0xc8d4ff);
  box(0, 6, -5, 8, 3, 0xffffff);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.04).texture;
  pmrem.dispose();
  env.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
  return tex;
}

function prepare(gltf, renderer) {
  const model = gltf.scene.getObjectByName('Coin') ?? gltf.scene;
  const envMap = studioEnv(renderer);
  const start = new THREE.Color(hex('xr-coin-ring-start'));
  const end = new THREE.Color(hex('xr-coin-ring-end'));
  const rim = new THREE.MeshPhysicalMaterial({ name: 'MenuCoinRim', vertexColors: true, metalness: 0.9, roughness: 0.26, clearcoat: 0.6, clearcoatRoughness: 0.15, envMap, envMapIntensity: 1.3 });
  const back = new THREE.MeshStandardMaterial({ name: 'MenuCoinBack', color: hex('xr-coin-face'), vertexColors: true, metalness: 0.6, roughness: 0.4, envMap });
  model.traverse((o) => {
    if (!o.isMesh) return;
    if (o.material.name === 'MenuCoinRim') {
      // Frame: baked shade times a diagonal gradient, top left cyan to bottom right violet.
      const geo = o.geometry;
      const pos = geo.attributes.position;
      const ao = geo.attributes.color;
      const out = new Float32Array(pos.count * 3);
      const c = new THREE.Color();
      for (let i = 0; i < pos.count; i++) {
        const k = THREE.MathUtils.clamp((pos.getX(i) - pos.getY(i)) * 0.75 + 0.5, 0, 1);
        const a = ao ? ao.getX(i) : 1;
        c.copy(start).lerp(end, k).multiplyScalar(a);
        out.set([c.r, c.g, c.b], i * 3);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(out, 3));
      o.material = rim;
    } else if (o.material.name === 'MenuCoinBack') {
      o.material = back;
    }
  });
  return { model, rim, back, envMap };
}

/** Face picture: the card art if the game has one, else a token placeholder. */
function faceTexture(key) {
  if (faces.has(key)) return faces.get(key);
  let tex;
  if (CARD_ART[key]) {
    tex = new THREE.TextureLoader().load(CARD_ART[key]);
  } else {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(220, 190, 20, 256, 256, 330);
    g.addColorStop(0, color('xr-coin-face-glow'));
    g.addColorStop(1, color('xr-coin-face'));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
    // A few sparkles, the same for every visit (seeded by the key).
    let seed = [...key].reduce((s, ch) => s * 31 + ch.charCodeAt(0), 7);
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    ctx.fillStyle = color('xr-coin-spark');
    for (let i = 0; i < 22; i++) {
      ctx.beginPath();
      ctx.arc(60 + rnd() * 392, 60 + rnd() * 392, 1.5 + rnd() * 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    drawIcon(ctx, key, 256, 256, 250, color('xr-coin-icon'), color('xr-coin-glow'));
    tex = new THREE.CanvasTexture(c);
  }
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false; // glTF UVs (top left origin)
  tex.anisotropy = gfxTier() === 'high' ? 8 : 4; // the coins turn: sharp art at an angle
  faces.set(key, tex);
  return tex;
}

/**
 * One coin for a game, diameter d (m), facing the player. Returns { group, setHover, update }.
 * The textures and frame materials are shared; the face and seam materials belong to the coin.
 */
export function makeCoin(key, d) {
  const { model, envMap } = shared;
  const group = new THREE.Group();
  const coin = model.clone(true); // shares the geometry
  coin.scale.setScalar(d);
  const map = faceTexture(key);
  const art = new THREE.MeshPhysicalMaterial({
    vertexColors: true, map, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.38,
    roughness: 0.45, clearcoat: 0.55, clearcoatRoughness: 0.2, envMap, envMapIntensity: 0.5,
  });
  const glowBase = new THREE.Color(hex('xr-coin-glow'));
  const seam = new THREE.MeshBasicMaterial({ color: glowBase.clone(), toneMapped: false });
  coin.traverse((o) => {
    if (!o.isMesh) return;
    if (o.material.name === 'MenuCoinArt') o.material = art;
    else if (o.material.name === 'MenuCoinGlow') o.material = seam;
  });
  group.add(coin);
  const phase = Math.random() * Math.PI * 2;
  let t = 0;
  let hover = false;
  let h = 0; // hover blend 0..1
  return {
    group,
    setHover(v) { hover = v; },
    update(dt) {
      t += dt;
      h += ((hover ? 1 : 0) - h) * Math.min(1, dt * 10);
      // Idle: a gentle sway so the coin reads as a solid object; pointed at: faces the player.
      coin.rotation.y = Math.sin(t * 0.9 + phase) * 0.22 * (1 - h);
      coin.rotation.x = Math.sin(t * 0.7 + phase * 1.3) * 0.05 * (1 - h);
      coin.position.z = h * d * 0.12;
      coin.position.y = Math.sin(t * 1.3 + phase) * d * 0.012;
      coin.scale.setScalar(d * (1 + 0.08 * h));
      art.emissiveIntensity = 0.38 + 0.2 * h;
      seam.color.copy(glowBase).multiplyScalar(1 + 1.5 * h);
    },
    dispose() {
      art.dispose();
      seam.dispose();
    },
  };
}
