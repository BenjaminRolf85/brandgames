// Echo Parkour level 2 as a city at dawn (blender/build_city.py): buildings made of roof and
// facade modules (one color per building, windows lit warm, cool or dark), steel girders on
// crane cables, a skyline of colorful towers with an airship and clouds (parallax), a dawn
// sky with the rising sun, and gags on the roofs: a cat, billboards, and pigeons that fly off
// when Echo comes close. All colors come from the --xr-city-* tokens.
import * as THREE from 'three';
import { loadGLTF } from './models.js';
import { color, hex } from './tokens.js';
import { modelSet, logoTexture } from './parkour-models.js';
import { instanced, edgeFactor } from './parkour-visuals.js';
import { radialTexture } from './robot-visuals.js';
import { WINTER, winterize, setSnowTint } from './snow.js';

export const CITY_URL = 'assets/models/city.glb';

const std = (name, token, roughness, extra = {}) => new THREE.MeshStandardMaterial({ name, color: hex(token), metalness: 0, roughness, vertexColors: true, ...extra });
// Winter: snow on roofs, ledges, window sills, awnings, the street and the plants (not on the
// hazards, the flyers, the animals and the clouds) and the winter variants of the sky tokens.
const SNOWY = ['CityRoof', 'CityParapet', 'CityWall', 'CityFrame', 'CityMetal', 'CitySteel', 'CityStripe', 'CityDark', 'CityAsphalt', 'CityLane', 'CityAwning', 'CityPlant', 'CityPot'];
const wt = (token) => (WINTER ? `${token}-winter` : token);

function makeMaterials() {
  const mats = {
    CityRoof: std('CityRoof', 'xr-city-roof', 0.9),
    CityParapet: std('CityParapet', 'xr-city-parapet', 0.8),
    CityWall: std('CityWall', 'xr-on-primary', 0.75), // white, tinted per building (instance color)
    CityFrame: std('CityFrame', 'xr-city-frame', 0.5),
    CityWindowGlow: new THREE.MeshBasicMaterial({ name: 'CityWindowGlow', color: 0xffffff, toneMapped: false }),
    CityMetal: std('CityMetal', 'xr-city-metal', 0.35, { metalness: 0.6 }),
    CitySteel: std('CitySteel', 'xr-city-steel', 0.45, { metalness: 0.3 }),
    CityStripe: std('CityStripe', 'xr-city-stripe', 0.6),
    CityDark: std('CityDark', 'xr-city-dark', 0.6),
    CityAsphalt: std('CityAsphalt', 'xr-city-asphalt', 0.9),
    CityLane: std('CityLane', 'xr-city-lane', 0.7),
    CityAwning: std('CityAwning', 'xr-city-awning', 0.8),
    CityPlant: std('CityPlant', 'xr-city-plant', 0.7),
    CityPot: std('CityPot', 'xr-city-pot', 0.8),
    CityGlow: new THREE.MeshBasicMaterial({ name: 'CityGlow', color: 0xffffff, toneMapped: false }),
    CityCloud: std('CityCloud', wt('xr-city-cloud'), 0.95, { emissive: hex(wt('xr-city-cloud')), emissiveIntensity: 0.35 }),
    CityCat: std('CityCat', 'xr-city-cat', 0.7),
    CityPigeon: std('CityPigeon', 'xr-city-pigeon', 0.7),
    CityBlimp: std('CityBlimp', 'xr-city-blimp', 0.45),
    CityPanel: new THREE.MeshBasicMaterial({ name: 'CityPanel', map: logoTexture(), toneMapped: false }),
    // Obstacles and flyers keep their colors at night (not in the night tint), so they stay visible.
    CityHazard: std('CityHazard', 'xr-city-hazard', 0.5, { emissive: hex('xr-city-hazard'), emissiveIntensity: 0.3 }),
    CityHazardGlow: new THREE.MeshBasicMaterial({ name: 'CityHazardGlow', color: hex('xr-city-hazard-glow'), toneMapped: false }),
    CityHeli: std('CityHeli', 'xr-city-heli', 0.4, { emissive: hex('xr-city-heli'), emissiveIntensity: 0.15 }),
    CityHeliGlass: new THREE.MeshStandardMaterial({ name: 'CityHeliGlass', color: hex('xr-city-heli-glass'), roughness: 0.1, metalness: 0.3, emissive: hex('xr-city-heli-glass'), emissiveIntensity: 0.25, vertexColors: true }),
    CityRaven: std('CityRaven', 'xr-city-raven', 0.55, { emissive: hex('xr-city-raven'), emissiveIntensity: 0.2 }),
    CityBeak: std('CityBeak', 'xr-city-beak', 0.6),
  };
  SNOWY.forEach((name) => winterize(mats[name]));
  return mats;
}

let promise = null;

/** Loads the city once: { parts(name), clone(name), materials }. */
export function loadCityModels() {
  promise ??= loadGLTF(CITY_URL).then((gltf) => modelSet(gltf, makeMaterials()));
  return promise;
}

/** Dawn sky: deep blue at the top, rose in the middle, peach at the horizon with the sun. */
export function citySky() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, color(wt('xr-city-sky-top')));
  g.addColorStop(0.55, color(wt('xr-city-sky-mid')));
  g.addColorStop(1, color(wt('xr-city-sky-bottom')));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 512);
  // the rising sun with a soft halo
  const halo = ctx.createRadialGradient(170, 440, 10, 170, 440, 150);
  halo.addColorStop(0, color('xr-city-sun'));
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, 256, 512);
  ctx.globalAlpha = 1;
  ctx.fillStyle = color('xr-city-sun');
  ctx.beginPath();
  ctx.arc(170, 440, 34, 0, Math.PI * 2);
  ctx.fill();
  // the last stars
  ctx.fillStyle = color('xr-city-star');
  let s = 29;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 30; i++) {
    const y = rnd() * 150;
    ctx.globalAlpha = 0.6 * (1 - y / 160);
    ctx.beginPath();
    ctx.arc(rnd() * 256, y, 0.6 + rnd(), 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const hash = (x) => ((Math.imul(Math.round(x * 13) | 0, 2654435761) >>> 0) % 1000) / 1000;

/** All buildings and girders of the course; only the ones inside the stage window are drawn. */
export function makeCityBlocks(cols, C) {
  const walls = [1, 2, 3, 4, 5].map((i) => new THREE.Color(hex(`xr-city-wall-${i}`)));
  const lights = [new THREE.Color(hex('xr-city-window-warm')), new THREE.Color(hex('xr-city-window-cool')), new THREE.Color(hex('xr-city-window-dim'))];
  // Downtown (last quarter): dark glass towers with neon and cool windows.
  const glass = new THREE.Color(hex('xr-city-tower-glass'));
  const neon = [new THREE.Color(hex('xr-city-tower-light')), lights[1], lights[2]];
  const group = new THREE.Group();
  group.userData.noFit = true;
  const n = cols.length;
  const roofs = ['A', 'B', 'C', 'D'].map((v) => instanced(C.parts(`Roof${v}`), n));
  const facades = ['A', 'B', 'C', 'D'].map((v) => instanced(C.parts(`Facade${v}`), n * 6, { tinted: ['CityWall'] }));
  const girders = instanced(C.parts('GirderCap'), n);
  const unders = ['A', 'B'].map((v) => instanced(C.parts(`GirderUnder${v}`), n));
  const all = [...roofs, ...facades, girders, ...unders];
  all.forEach((s) => group.add(s.group));
  // One color per building: neighbors with the same height belong together.
  const wallOf = new Map();
  let building = -1;
  let prev = null;
  for (const c of cols) {
    if (!prev || c.x !== prev.x + 1 || c.top !== prev.top || !!c.girder !== !!prev.girder) building += 1;
    wallOf.set(c, downtownAt(c.x) > 0.5 ? glass : walls[(building * 2 + (building > 2 ? 1 : 0)) % walls.length]);
    prev = c;
  }
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const turned = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const lit = (r, x) => (downtownAt(x) > 0.5 ? neon : lights)[r < 0.6 ? 0 : r < 0.8 ? 1 : 2];
  return {
    group,
    update(camX, half) {
      all.forEach((x) => x.begin());
      for (const c of cols) {
        const wx = c.x + 0.5 - camX;
        if (Math.abs(wx) >= half) continue;
        const k = edgeFactor(wx, half);
        if (k <= 0.001) continue;
        const sink = (1 - k) * 0.4;
        p.set(c.x + 0.5, c.top - sink, 0);
        s.set(k, k, k);
        if (c.girder) {
          girders.push(m.compose(p, q, s));
          unders[c.x % 3 === 0 ? 0 : 1].push(m.compose(p, q, s));
          continue;
        }
        roofs[Math.floor(hash(c.x) * 4) % 4].push(m.compose(p, q, s), lights[0]);
        const h = c.top - 0.46 - c.bottom;
        const count = Math.max(1, Math.ceil(h - 0.05));
        const sy = h / count;
        for (let j = 0; j < count; j++) {
          p.set(c.x + 0.5, c.top - (0.46 + j * sy) * k - sink, 0);
          s.set(k, sy * k, k);
          const r = hash(c.x * 3 + j * 7 + 1);
          facades[Math.floor(r * 4) % 4].push(m.compose(p, hash(c.x * 5 + j * 11) < 0.5 ? q : turned, s), lit(hash(c.x * 7 + j * 3), c.x), wallOf.get(c));
        }
      }
      all.forEach((x) => x.end());
    },
  };
}

/** Towers, an airship and clouds behind the track; they scroll slower than the course. */
export function makeCityBackdrop(C, half, bottom, backZ, M = null) {
  const group = new THREE.Group();
  group.userData.noFit = true;
  const kinds = [1, 2, 3, 4].map((i) => instanced(C.parts(`Sky${i}`), 50, { shadow: false, tinted: ['CityWall'] }));
  const clouds = instanced(C.parts('CityCloud'), 20, { shadow: false });
  const blimp = C.clone('Blimp');
  [...kinds.map((v) => v.group), clouds.group, blimp].forEach((o) => group.add(o));
  // Downtown: the tall towers of the original level rise in the last quarter.
  const sky = M ? [1, 2, 3].map((i) => instanced(M.parts(`Tower${i}`), 40, { shadow: false })) : [];
  sky.forEach((v) => group.add(v.group));
  let seed = 41;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  // Distant towers take a little of the sky color (haze).
  const haze = new THREE.Color(hex('xr-city-sky-mid'));
  const walls = [1, 2, 3, 4, 5].map((i) => new THREE.Color(hex(`xr-city-wall-${i}`)).lerp(haze, 0.3));
  const lights = [new THREE.Color(hex('xr-city-window-warm')), new THREE.Color(hex('xr-city-window-cool'))];
  const towers = [];
  for (let x = -18; x < 140; x += 1.6 + rnd() * 1.4) {
    towers.push({ x, z: backZ + 0.6 + rnd() * Math.max(0.5, -backZ - 3.6), v: Math.floor(rnd() * 4), s: 0.7 + rnd() * 0.5, wall: walls[Math.floor(rnd() * 5)], light: lights[rnd() < 0.7 ? 0 : 1] });
  }
  const cloudList = [];
  for (let x = -18; x < 120; x += 5 + rnd() * 6) cloudList.push({ x, y: bottom + 6.2 + rnd() * 2.0, z: backZ + 0.3 + rnd() * 0.5, s: 0.8 + rnd() * 0.8 });
  const scrapers = [];
  for (let x = 140; x < 240; x += 0.8 + rnd() * 1.0) {
    // Tall, but their tips stay inside the stage (tower heights 4.0, 6.7 and 3.2 units).
    const v = Math.floor(rnd() * 3);
    const max = [2.6, 1.65, 3.2][v];
    scrapers.push({ x, z: backZ + 0.5 + rnd() * Math.max(0.5, -backZ - 3.4), v, s: max * (0.75 + rnd() * 0.25), hue: rnd() });
  }
  const neonA = new THREE.Color(hex('xr-city-tower-light'));
  const neonB = new THREE.Color(hex('xr-city-window-cool'));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const tint = new THREE.Color();
  return {
    group,
    update(camX) {
      const d = downtownAt(camX);
      kinds.forEach((v) => v.begin());
      clouds.begin();
      sky.forEach((v) => v.begin());
      for (const t of scrapers) {
        const wx = (t.x - camX) * 0.5;
        if (Math.abs(wx) > half) continue;
        const k = edgeFactor(wx, half) * d;
        if (k <= 0.001) continue;
        p.set(wx, bottom - (1 - k) * 6, t.z);
        sc.set(t.s * 0.55 * Math.max(k, 0.001), t.s * Math.max(k, 0.001), t.s * 0.55 * Math.max(k, 0.001)); // slender skyscrapers
        sky[t.v]?.push(m.compose(p, q, sc), tint.copy(neonA).lerp(neonB, t.hue).multiplyScalar(0.6 + 0.4 * k));
      }
      sky.forEach((v) => v.end());
      for (const t of towers) {
        const wx = t.x - camX * 0.5;
        if (Math.abs(wx) > half) continue;
        const k = edgeFactor(wx, half);
        if (k <= 0.001 || d > 0.99) continue;
        p.set(wx, bottom - (1 - k) * 3 - d * 8, t.z); // the small towers sink away downtown
        sc.setScalar(t.s * k);
        kinds[t.v].push(m.compose(p, q, sc), tint.copy(t.light).multiplyScalar(0.55 + 0.45 * k), t.wall);
      }
      for (const c of cloudList) {
        const wx = c.x - camX * 0.22;
        if (Math.abs(wx) > half) continue;
        const k = edgeFactor(wx, half);
        if (k <= 0.001) continue;
        p.set(wx, c.y, c.z);
        sc.setScalar(c.s * k);
        clouds.push(m.compose(p, q, sc));
      }
      kinds.forEach((v) => v.end());
      clouds.end();
      // The airship drifts slowly across the sky, independent of the course.
      const t = performance.now() / 1000;
      const span = half * 2 + 4;
      const bx = ((t * 0.35) % span) - span / 2;
      const k = edgeFactor(bx, half);
      blimp.visible = k > 0.001;
      blimp.position.set(bx, bottom + 7.4 + Math.sin(t * 0.4) * 0.15, backZ + 1.2);
      blimp.scale.setScalar(0.9 * k);
    },
  };
}

/** Gags on the roofs: a cat, billboards with the Echomotion logo, pigeons that fly off. */
export function makeCityGags(course, C) {
  const group = new THREE.Group();
  group.userData.noFit = true;
  const byX = new Map(course.cols.map((c) => [c.x, c]));
  const items = [];
  for (const g of course.gags ?? []) {
    const c = byX.get(g.x);
    const obj = c && C.clone(g.kind);
    if (!obj) continue;
    obj.position.set(g.x + 0.5, c.top, g.kind === 'Billboard' ? -0.62 : -0.5);
    if (g.kind === 'Cat') obj.rotation.y = -0.4;
    group.add(obj);
    items.push({ x: g.x + 0.5, y: c.top, obj, kind: g.kind, fly: 0 });
  }
  return {
    group,
    update(camX, half, dt, echoX) {
      for (const it of items) {
        if (it.kind === 'Pigeons' && it.fly === 0 && Math.abs(echoX - it.x) < 2.2) it.fly = 0.001;
        if (it.fly > 0) {
          // off they go: up and away to the right, then gone
          it.fly += dt;
          it.obj.position.set(it.x + it.fly * 3, it.y + it.fly * it.fly * 4, -0.5 - it.fly);
        }
        const k = it.fly > 1.6 ? 0 : edgeFactor(it.obj.position.x - camX, half);
        it.obj.visible = k > 0.001;
        if (it.obj.visible) it.obj.scale.setScalar(k);
      }
    },
  };
}

/** Night sky for the second half: deep blue to violet, many stars and a crescent moon. */
function nightSky() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, color('xr-city-night-top'));
  g.addColorStop(1, color('xr-city-night-bottom'));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 512);
  ctx.fillStyle = color('xr-city-star');
  let s = 53;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 90; i++) {
    const y = rnd() * 380;
    ctx.globalAlpha = 0.35 + 0.65 * rnd() * (1 - y / 420);
    ctx.beginPath();
    ctx.arc(rnd() * 256, y, 0.5 + rnd() * 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = color('xr-city-moon');
  ctx.beginPath();
  ctx.arc(70, 110, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(80, 102, 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  // the moon's bite shows the sky again
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 512);
  ctx.globalCompositeOperation = 'source-over';
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Downtown along the course: skyscrapers in the last quarter. */
export function downtownAt(x) {
  return THREE.MathUtils.smoothstep(x, 146, 158);
}

/** How dark it is along the course: day in the first half, night from the middle on. */
export function nightAt(x) {
  return THREE.MathUtils.smoothstep(x, 88, 112);
}

/**
 * Day to night in the city: a night sky fades in over the dawn sky, walls, roofs and clouds get
 * darker (lit windows and lamps keep shining), the key light dims and the rim light turns neon.
 */
export function makeCityNight({ C, back, key, rim }) {
  const night = new THREE.Mesh(back.geometry, new THREE.MeshBasicMaterial({ map: nightSky(), transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
  night.position.copy(back.position);
  night.position.z += 0.001;
  night.renderOrder = back.renderOrder + 1;
  back.parent.add(night);
  const tint = new THREE.Color(hex('xr-city-night-tint'));
  const shaded = ['CityWall', 'CityRoof', 'CityParapet', 'CityFrame', 'CityMetal', 'CitySteel', 'CityStripe', 'CityAwning', 'CityPlant', 'CityPot', 'CityCloud', 'CityBlimp', 'CityAsphalt', 'CityCat', 'CityPigeon'];
  // The materials are shared between rounds: their day colors are kept on the material.
  const base = new Map(shaded.map((name) => {
    const mat = C.materials[name];
    mat.userData.day ??= mat.color.clone();
    return [name, mat.userData.day];
  }));
  const day = {};
  const keyBase = key.intensity;
  const rimDay = rim.color.clone();
  const rimNight = new THREE.Color(hex('xr-city-night-rim'));
  const c = new THREE.Color();
  let last = -1;
  return {
    update(camX) {
      const n = nightAt(camX);
      if (Math.abs(n - last) < 0.002) return;
      last = n;
      night.material.opacity = n;
      for (const name of shaded) {
        const from = day[name] ?? base.get(name);
        C.materials[name].color.copy(c.copy(from).lerp(c.clone().copy(from).multiply(tint), n));
      }
      C.materials.CityCloud.emissiveIntensity = 0.35 * (1 - 0.75 * n);
      setSnowTint(c.setRGB(1, 1, 1).lerp(tint, n * 0.85)); // the snow darkens with the night too
      key.intensity = keyBase * (1 - 0.6 * n);
      rim.color.copy(rimDay).lerp(rimNight, n);
      rim.intensity = 0.9 + 0.5 * n;
    },
    dispose() {
      for (const name of shaded) C.materials[name].color.copy(day[name] ?? base.get(name));
      setSnowTint(c.setRGB(1, 1, 1));
    },
  };
}

/** Anti-pigeon spikes on a roof (hazard), one strip per unit. */
export function makeCitySpikes(C, x0, x1) {
  const group = new THREE.Group();
  const mid = (x0 + x1) / 2;
  for (let x = x0 + 0.5; x < x1 + 0.01; x += 1) {
    const strip = C.clone('PigeonSpikes');
    strip.position.x = Math.min(x, x1 - 0.5) - mid;
    group.add(strip);
  }
  // A red halo so the low strip is seen from afar (also at night).
  const hl = hazardHalo('xr-city-hazard-glow', x1 - x0 + 0.9, 0.9, 0.35);
  hl.position.set(0, 0.25, -0.4);
  group.add(hl);
  group.userData.flicker = () => { hl.material.opacity = 0.35 * (0.75 + 0.25 * Math.sin(performance.now() / 250)); };
  return group;
}

/** A soft pulsing halo behind a hazard (additive), so it stands out from the roof clutter. */
export function hazardHalo(token, w, h, opacity) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), color: hex(token), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.set(w, h, 1);
  s.userData.noFit = true;
  s.userData.base = opacity;
  return s;
}

/**
 * Ventilation shafts and antennas (solid, to jump or fly over) and power lines between masts (a
 * shock), in warning colors with a pulsing red halo; and, when the level is flown, the low cloud
 * deck that is its ceiling. All appear like the buildings at the stage edges.
 */
export function makeCityObstacles(course, C) {
  const group = new THREE.Group();
  group.userData.noFit = true;
  const items = [];
  const halos = [];
  const add = (obj, x) => { group.add(obj); items.push({ obj, x, base: obj.scale.clone() }); };
  const addHalo = (x, y, w, h) => {
    const hl = hazardHalo('xr-city-hazard-glow', w, h, 0.32);
    hl.position.set(x, y, -0.6);
    add(hl, x);
    halos.push(hl);
  };
  for (const v of course.vents ?? []) {
    for (let x = v.x0; x < v.x1; x++) {
      const vent = C.clone('Vent');
      vent.position.set(x + 0.5, v.y, 0);
      vent.scale.set(1, v.h, 1);
      add(vent, x + 0.5);
      addHalo(x + 0.5, v.y + v.h * 0.55, 1.9, v.h * 1.9 + 0.4);
    }
  }
  for (const a of course.antennas ?? []) {
    const ant = C.clone('Antenna');
    ant.position.set(a.x + 0.5, a.y, 0);
    add(ant, a.x + 0.5);
    addHalo(a.x + 0.5, a.y + 0.8, 1.1, 2.0);
  }
  const wireMat = new THREE.MeshBasicMaterial({ color: hex('xr-city-wire'), toneMapped: false, transparent: true, opacity: 0.95 });
  const wireGlow = new THREE.MeshBasicMaterial({ color: hex('xr-city-wire'), toneMapped: false, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const w of course.wires ?? []) {
    const k = w.h / 1.55; // the insulators sit at 1.55 on a full-size mast
    for (const x of [w.x0, w.x1]) {
      const mast = C.clone('PowerMast');
      mast.position.set(x, w.base, 0);
      mast.scale.set(1, k, 1);
      add(mast, x);
    }
    for (const z of [-0.45, 0.45]) {
      const pts = [];
      for (let i = 0; i <= 12; i++) {
        const u = i / 12;
        pts.push(new THREE.Vector3(w.x0 + (w.x1 - w.x0) * u, w.y - 0.07 - Math.sin(u * Math.PI) * 0.12, z));
      }
      const curve = new THREE.CatmullRomCurve3(pts);
      // A thicker live wire with a wide glow around it.
      for (const [r, mat] of [[0.04, wireMat], [0.11, wireGlow]]) {
        const wire = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, r, 6, false), mat);
        wire.geometry.translate(-(w.x0 + w.x1) / 2, -w.y, 0);
        wire.position.set((w.x0 + w.x1) / 2, w.y, 0);
        add(wire, (w.x0 + w.x1) / 2);
      }
    }
  }
  // The low cloud deck (the ceiling of the flown level): instanced clouds placed around the
  // camera every frame, each with its own size from its place along the course.
  let deck = null;
  if (course.ceiling) {
    deck = instanced(C.parts('CityCloud'), 24, { shadow: false });
    group.add(deck.group);
  }
  const STEP = 1.6;
  const hash = (n) => { const v = Math.sin(n * 127.1 + 31.7) * 43758.5453; return v - Math.floor(v); };
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  const pos = new THREE.Vector3();
  return {
    group,
    update(camX, half) {
      const now = performance.now() / 1000;
      wireMat.opacity = 0.7 + 0.3 * Math.abs(Math.sin(now * 6));
      wireGlow.opacity = 0.18 + 0.2 * Math.abs(Math.sin(now * 6));
      const pulse = 0.75 + 0.25 * Math.sin(now * 4);
      for (const hl of halos) hl.material.opacity = hl.userData.base * pulse;
      for (const it of items) {
        const k = edgeFactor(it.x - camX, half);
        it.obj.visible = k > 0.001;
        if (it.obj.visible) it.obj.scale.copy(it.base).multiplyScalar(k);
      }
      if (deck) {
        deck.begin();
        const n0 = Math.floor((camX - half - 1) / STEP);
        for (let n = n0; n < n0 + 24; n++) {
          const x = n * STEP + (hash(n) - 0.5) * 0.6;
          const k = edgeFactor(x - camX, half);
          if (k <= 0.001) continue;
          const s = (1.0 + hash(n + 7) * 0.6) * k;
          pos.set(x, course.ceiling + 0.32 + hash(n + 3) * 0.25, -0.4 + hash(n + 11) * 0.7);
          q.setFromAxisAngle(sc.set(0, 1, 0), hash(n + 5) * Math.PI);
          m.compose(pos, q, sc.set(s * 1.25, s, s));
          deck.push(m);
        }
        deck.end();
      }
    },
  };
}

/** A helicopter of the upper air: spinning rotors, a nose-down tilt in flight, a searchlight. */
export function makeHelicopter(C) {
  const group = new THREE.Group();
  const heli = C.clone('Helicopter');
  heli.scale.setScalar(0.85);
  const rotor = heli.getObjectByName('HeliRotor');
  const tail = heli.getObjectByName('HeliTail');
  const beam = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.0, 20, 1, true), new THREE.MeshBasicMaterial({ color: hex('xr-city-heli-light'), transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.set(-0.6, -1.3, 0);
  beam.rotation.z = -0.25;
  beam.userData.noFit = true;
  heli.add(beam);
  const hl = hazardHalo('xr-city-hazard-glow', 2.2, 1.4, 0.22);
  hl.position.z = -0.7;
  group.add(heli, hl);
  let turn = 0;
  group.userData.animate = (dt, t, dir) => {
    if (rotor) rotor.rotation.y += dt * 24;
    if (tail) tail.rotation.z += dt * 32;
    turn += ((dir > 0 ? Math.PI : 0) - turn) * Math.min(1, dt * 3);
    heli.rotation.y = turn;
    heli.rotation.z = 0.12 + Math.sin(t * 1.6) * 0.04; // nose down a little while it flies
    beam.material.opacity = 0.1 + 0.04 * Math.sin(t * 9);
    hl.material.opacity = 0.18 + 0.08 * Math.sin(t * 4);
  };
  return group;
}

/** A raven of the upper air: quick wing beats, glowing eyes, a violet halo for the night. */
export function makeRaven(C) {
  const group = new THREE.Group();
  const raven = C.clone('Raven');
  raven.scale.setScalar(1.05);
  const wings = ['RavenWingL', 'RavenWingR'].map((n) => raven.getObjectByName(n)).filter(Boolean);
  const base = wings.map((w) => w.rotation.clone());
  const hl = hazardHalo('xr-city-raven-halo', 1.5, 1.1, 0.25);
  hl.position.z = -0.5;
  group.add(raven, hl);
  let turn = 0;
  group.userData.animate = (dt, t, dir) => {
    const beat = Math.sin(t * 11);
    wings.forEach((w, i) => { w.rotation.x = base[i].x + (i ? 1 : -1) * (0.2 + beat * 0.65); });
    turn += ((dir > 0 ? Math.PI : 0) - turn) * Math.min(1, dt * 6);
    raven.rotation.y = turn;
    raven.rotation.z = Math.sin(t * 2.3) * 0.12;
  };
  return group;
}
