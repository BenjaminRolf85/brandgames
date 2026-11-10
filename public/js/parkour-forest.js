// Echo Parkour level 1 as a magic forest (blender/build_forest.py, like the game's menu coin):
// floating grass islands built from stacked modules, a backdrop of colorful trees, bushes and
// clouds that scroll slower than the course (parallax), and a twilight sky with stars. All
// colors come from the --xr-forest-* tokens; ForGlow parts are tinted per zone or state.
import * as THREE from 'three';
import { loadGLTF } from './models.js';
import { color, hex } from './tokens.js';
import { modelSet } from './parkour-models.js';
import { instanced, edgeFactor } from './parkour-visuals.js';
import { sfx } from './sfx.js';
import { WINTER, winterize } from './snow.js';

export const FOREST_URL = 'assets/models/forest.glb';

const std = (name, token, roughness, extra = {}) => new THREE.MeshStandardMaterial({ name, color: hex(token), metalness: 0, roughness, vertexColors: true, ...extra });
// Winter: the snow-covered forest (snow on everything that faces up, except the flyers, the
// hazards, the clouds and the glowing parts) and the winter variants of the sky tokens.
const SNOWY = ['ForGrass', 'ForGrassLight', 'ForGrassDark', 'ForEarth', 'ForEarthDark', 'ForRock', 'ForStone', 'ForWood', 'ForLeaf', 'ForCanopy', 'ForBone', 'ForMushroom'];
const wt = (token) => (WINTER ? `${token}-winter` : token);

function makeMaterials() {
  const mats = {
    ForGrass: std('ForGrass', 'xr-forest-grass', 0.75),
    ForGrassLight: std('ForGrassLight', 'xr-forest-grass-light', 0.7),
    ForGrassDark: std('ForGrassDark', 'xr-forest-grass-dark', 0.8),
    ForEarth: std('ForEarth', 'xr-forest-earth', 0.9),
    ForEarthDark: std('ForEarthDark', 'xr-forest-earth-dark', 0.9),
    ForRock: std('ForRock', 'xr-forest-rock', 0.8),
    ForStone: std('ForStone', 'xr-forest-stone', 0.7),
    ForWood: std('ForWood', 'xr-forest-wood', 0.85),
    ForCloth: std('ForCloth', 'xr-forest-cloth', 0.8, { emissive: hex('xr-forest-cloth'), emissiveIntensity: 0.15 }),
    ForLeaf: std('ForLeaf', 'xr-on-primary', 0.65), // white, tinted per plant (instance color)
    ForCanopy: std('ForCanopy', 'xr-forest-leaf-2', 0.65),
    ForCloud: std('ForCloud', wt('xr-forest-cloud'), 0.95, { emissive: hex(wt('xr-forest-cloud')), emissiveIntensity: 0.35 }),
    ForGlow: new THREE.MeshBasicMaterial({ name: 'ForGlow', color: 0xffffff, toneMapped: false }),
    // surprises in the earth
    ForBone: std('ForBone', 'xr-forest-bone', 0.6),
    ForMushroom: std('ForMushroom', 'xr-forest-mushroom', 0.5),
    ForWorm: std('ForWorm', 'xr-forest-worm', 0.5),
    ForUfo: std('ForUfo', 'xr-forest-ufo', 0.25, { metalness: 0.8 }),
    ForUfoGlow: new THREE.MeshBasicMaterial({ name: 'ForUfoGlow', color: hex('xr-forest-ufo-light'), toneMapped: false }),
    ForAlien: std('ForAlien', 'xr-forest-alien', 0.5),
    ForGlass: new THREE.MeshPhysicalMaterial({ name: 'ForGlass', color: hex('xr-forest-glass'), roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false }),
    ForGold: std('ForGold', 'xr-forest-gold', 0.25, { metalness: 0.9, emissive: hex('xr-forest-gold'), emissiveIntensity: 0.15 }),
    ForGoldGlow: new THREE.MeshBasicMaterial({ name: 'ForGoldGlow', color: hex('xr-forest-gold-glow'), toneMapped: false }),
    // flying: eagles and thorns
    ForEagle: std('ForEagle', 'xr-forest-eagle', 0.7),
    ForEagleDark: std('ForEagleDark', 'xr-forest-eagle-dark', 0.75),
    ForBeak: std('ForBeak', 'xr-forest-beak', 0.5),
    ForThorn: std('ForThorn', 'xr-forest-thorn', 0.5, { emissive: hex('xr-forest-thorn'), emissiveIntensity: 0.25 }),
  };
  SNOWY.forEach((name) => winterize(mats[name]));
  return mats;
}

let promise = null;

/** Loads the forest once: { parts(name), clone(name), materials }. */
export function loadForestModels() {
  promise ??= loadGLTF(FOREST_URL).then((gltf) => modelSet(gltf, makeMaterials()));
  return promise;
}

/** Twilight sky with stars and a soft glow over the treetops (backdrop texture). */
export function forestSky() {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, color(wt('xr-forest-sky-top')));
  g.addColorStop(1, color(wt('xr-forest-sky-bottom')));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 512);
  const glow = ctx.createRadialGradient(128, 430, 10, 128, 430, 260);
  glow.addColorStop(0, color(wt('xr-forest-cloud')));
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 256, 512);
  ctx.globalAlpha = 1;
  ctx.fillStyle = color('xr-forest-star');
  let s = 17;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    const y = rnd() * 300;
    ctx.globalAlpha = 0.35 + rnd() * 0.65 * (1 - y / 320);
    ctx.beginPath();
    ctx.arc(rnd() * 256, y, 0.6 + rnd() * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const hash = (x) => ((Math.imul(x | 0, 2654435761) >>> 0) % 1000) / 1000;

/** All island columns of the course; only the ones inside the stage window are drawn. */
export function makeForestBlocks(cols, F) {
  const zones = ['xr-parkour-zone1', 'xr-parkour-zone2', 'xr-parkour-zone3'].map((tk) => new THREE.Color(hex(tk)));
  const group = new THREE.Group();
  group.userData.noFit = true;
  const n = cols.length;
  const caps = ['A', 'B', 'C', 'D'].map((v) => instanced(F.parts(`IslandCap${v}`), n));
  const bodies = ['A', 'B', 'C', 'D', 'E'].map((v) => instanced(F.parts(`IslandBody${v}`), n * 6));
  const unders = ['A', 'B'].map((v) => instanced(F.parts(`IslandUnder${v}`), n));
  const all = [...caps, ...bodies, ...unders];
  all.forEach((s) => group.add(s.group));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const turned = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  // Grass tops: mostly flowers, now and then a toadstool or a mossy stone.
  const capOf = (x) => { const r = hash(x); return r < 0.42 ? 0 : r < 0.84 ? 1 : r < 0.93 ? 2 : 3; };
  return {
    group,
    update(camX, half) {
      all.forEach((x) => x.begin());
      for (const c of cols) {
        const wx = c.x + 0.5 - camX;
        if (Math.abs(wx) >= half) continue;
        const k = edgeFactor(wx, half);
        if (k <= 0.001) continue;
        const v = hash(c.x) < 0.5 ? 0 : 1;
        const sink = (1 - k) * 0.4;
        p.set(c.x + 0.5, c.top - sink, 0);
        s.set(k, k, k);
        caps[capOf(c.x)].push(m.compose(p, q, s), zones[c.zone]);
        const h = c.top - 0.45 - c.bottom;
        if (c.top - c.bottom > 0.7) {
          // Earth body: whole modules stacked, squeezed a little so they end at the bottom.
          const count = Math.max(1, Math.ceil(h - 0.05));
          const sy = h / count;
          for (let j = 0; j < count; j++) {
            p.set(c.x + 0.5, c.top - (0.45 + j * sy) * k - sink, 0);
            s.set(k, sy * k, k);
            // Five patterns, each also turned around (its back shows another one).
            const r = hash(c.x * 3 + j * 7 + 1);
            bodies[Math.floor(r * 5) % 5].push(m.compose(p, hash(c.x * 5 + j * 11) < 0.5 ? q : turned, s), zones[c.zone]);
          }
        } else {
          unders[v].push(m.compose(p, q, s), zones[c.zone]);
        }
      }
      all.forEach((x) => x.end());
    },
  };
}

// Surprises in the earth, now and then: a treasure chest, a dinosaur skeleton, a crashed UFO.
const GAGS = [[10, 'GagTreasure'], [40, 'GagSkeleton'], [70, 'GagUfo'], [100, 'GagTreasure'], [115, 'GagSkeleton'], [150, 'GagUfo'], [172, 'GagTreasure'], [197, 'GagSkeleton']];
const GAG_SIZE = { GagTreasure: 1.5, GagUfo: 1.5, GagSkeleton: 1.25 };

/** The surprises on the front face of tall ground columns; they appear like the blocks. */
export function makeForestGags(cols, F) {
  const group = new THREE.Group();
  group.userData.noFit = true;
  const byX = new Map(cols.map((c) => [c.x, c]));
  const items = [];
  for (const [x, name] of GAGS) {
    const c = byX.get(x);
    if (!c || c.top - c.bottom < 2) continue;
    const obj = F.clone(name);
    if (!obj) continue;
    // In the middle of the earth body, a little lower on tall columns.
    const y = Math.max(c.bottom + 0.75, Math.min(c.top - 1.05, (c.top - 0.45 + c.bottom) / 2));
    obj.position.set(x + 0.5, y, 0.88);
    group.add(obj);
    items.push({ x: x + 0.5, obj, size: GAG_SIZE[name] ?? 1 });
  }
  return {
    group,
    update(camX, half) {
      for (const it of items) {
        const k = edgeFactor(it.x - camX, half);
        it.obj.visible = k > 0.001;
        if (it.obj.visible) it.obj.scale.setScalar(k * it.size);
      }
    },
  };
}

/** Trees, bushes and clouds behind the track; they scroll slower than the course (parallax). */
export function makeForestBackdrop(F, half, bottom, backZ, M = null) {
  const group = new THREE.Group();
  group.userData.noFit = true;
  const kinds = ['Tree1', 'Tree2', 'Tree3', 'Bush'].map((name) => instanced(F.parts(name), 60, { shadow: false, tinted: ['ForLeaf'] }));
  // The city of level 2 shows up behind the trees towards the goal (towers from the level 1 set).
  const city = M ? [1, 2, 3].map((i) => instanced(M.parts(`Tower${i}`), 30, { shadow: false })) : [];
  city.forEach((v) => group.add(v.group));
  const clouds = ['Cloud1', 'Cloud2'].map((name) => instanced(F.parts(name), 20, { shadow: false }));
  [...kinds, ...clouds].forEach((v) => group.add(v.group));
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const leaves = ['xr-forest-leaf-1', 'xr-forest-leaf-2', 'xr-forest-leaf-3', 'xr-forest-leaf-4'].map((tk) => new THREE.Color(hex(tk)));
  const lights = ['xr-forest-blossom', 'xr-parkour-zone1', 'xr-parkour-zone2', 'xr-forest-firefly'].map((tk) => new THREE.Color(hex(tk)));
  const plants = [];
  // Two rows: big trees far back, bushes and small trees just behind the track.
  // Leaf colors per kind: round trees any, cone trees green or teal, umbrella trees teal or pink.
  const leafFor = [[0, 1, 2, 3], [0, 1, 3], [1, 2]];
  for (let x = -18; x < 230; x += 1.8 + rnd() * 1.6) {
    const v = Math.floor(rnd() * 3);
    const pick = leafFor[v][Math.floor(rnd() * leafFor[v].length)];
    plants.push({ x, z: backZ + 0.8 + rnd() * Math.max(0.5, -backZ - 3.9), v, s: 0.85 + rnd() * 0.55, leaf: leaves[pick], light: lights[Math.floor(rnd() * 4)], par: 0.55 });
  }
  for (let x = -18; x < 230; x += 2.6 + rnd() * 3.2) {
    plants.push({ x, z: -1.9 - rnd() * 0.8, v: rnd() < 0.7 ? 3 : 0, s: 0.6 + rnd() * 0.4, leaf: leaves[Math.floor(rnd() * 4)], light: lights[Math.floor(rnd() * 4)], par: 0.85 });
  }
  const sky = [];
  for (let x = -18; x < 160; x += 4 + rnd() * 5) {
    sky.push({ x, y: bottom + 6.4 + rnd() * 2.2, z: backZ + 0.3 + rnd() * 0.6, v: rnd() < 0.5 ? 0 : 1, s: 0.9 + rnd() * 0.9 });
  }
  const towers = [];
  for (let x = 186; x < 236; x += 1.3 + rnd() * 1.4) {
    towers.push({ x, z: backZ + 0.35 + rnd() * 0.5, v: Math.floor(rnd() * 3), s: 1.05 + rnd() * 0.6 });
  }
  const cityLight = new THREE.Color(hex('xr-forest-city-light'));
  const cityLight2 = new THREE.Color(hex('xr-parkour-zone2'));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  const tint = new THREE.Color();
  return {
    group,
    update(camX) {
      kinds.forEach((v) => v.begin());
      clouds.forEach((v) => v.begin());
      city.forEach((v) => v.begin());
      for (const t of towers) {
        const wx = (t.x - camX) * 0.5; // far away: moves at half the speed
        if (Math.abs(wx) > half) continue;
        const k = edgeFactor(wx, half);
        if (k <= 0.001) continue;
        p.set(wx, bottom - (1 - k) * 3, t.z);
        sc.setScalar(t.s * k);
        city[t.v]?.push(m.compose(p, q, sc), tint.copy(cityLight).lerp(cityLight2, (t.x * 7) % 1).multiplyScalar(0.6 + 0.4 * k));
      }
      city.forEach((v) => v.end());
      for (const t of plants) {
        const wx = t.x - camX * t.par;
        if (Math.abs(wx) > half) continue;
        const k = edgeFactor(wx, half);
        if (k <= 0.001) continue;
        p.set(wx, bottom - (1 - k) * 2, t.z);
        sc.setScalar(t.s * k);
        kinds[t.v].push(m.compose(p, q, sc), tint.copy(t.light).multiplyScalar(0.5 + 0.5 * k), t.leaf);
      }
      for (const c of sky) {
        const wx = c.x - camX * 0.25;
        if (Math.abs(wx) > half) continue;
        const k = edgeFactor(wx, half);
        if (k <= 0.001) continue;
        p.set(wx, c.y, c.z);
        sc.set(c.s * k, c.s * k, c.s * k);
        clouds[c.v].push(m.compose(p, q, sc));
      }
      kinds.forEach((v) => v.end());
      clouds.forEach((v) => v.end());
    },
  };
}

/** Storm strength along the course: it builds up in the last third and clears before the goal. */
export function stormAt(x) {
  return THREE.MathUtils.smoothstep(x, 128, 140) * (1 - THREE.MathUtils.smoothstep(x, 176, 188));
}

/** A jagged lightning bolt as a thin ribbon (units), regenerated for every strike. */
function boltGeometry(x, top, bottom) {
  const pts = [];
  let px = x;
  for (let y = top; y > bottom; y -= 0.45 + Math.random() * 0.35) {
    pts.push(new THREE.Vector2(px, y));
    px += (Math.random() - 0.5) * 0.9;
  }
  const pos = [];
  const w = 0.06;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    pos.push(a.x - w, a.y, 0, a.x + w, a.y, 0, b.x + w, b.y, 0, a.x - w, a.y, 0, b.x + w, b.y, 0, b.x - w, b.y, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/**
 * Weather in the forest (course units): slanted rain, a darker sky and clouds, lightning with a
 * flash and thunder. back: the sky backplane, key: the key light, F: the forest models.
 * In winter it is a snowstorm instead: the sky and the clouds darken, no rain and no lightning
 * (the parkour scene thickens the snow and lets the wind blow).
 */
export function makeForestWeather({ F, back, key, fireflies = null, bottom, top, backZ, lite = false }) {
  const group = new THREE.Group();
  group.userData.noFit = true;
  const n = lite ? 140 : 360;
  const drops = [];
  for (let i = 0; i < n; i++) drops.push({ u: Math.random(), y: bottom + Math.random() * (top - bottom), z: -1.6 + Math.random() * 3.0, v: 13 + Math.random() * 5 });
  const pos = new Float32Array(n * 6);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const rainMat = new THREE.LineBasicMaterial({ color: hex('xr-forest-rain'), transparent: true, opacity: 0, depthWrite: false });
  const rain = new THREE.LineSegments(geo, rainMat);
  rain.frustumCulled = false;
  group.add(rain);
  const boltMat = new THREE.MeshBasicMaterial({ color: hex('xr-forest-lightning'), transparent: true, opacity: 0, toneMapped: false, depthWrite: false });
  const bolt = new THREE.Mesh(new THREE.BufferGeometry(), boltMat);
  bolt.position.z = backZ + 0.8;
  bolt.frustumCulled = false;
  group.add(bolt);

  const white = new THREE.Color(1, 1, 1);
  const stormSky = new THREE.Color(hex('xr-forest-storm-sky'));
  const cloud = F.materials.ForCloud;
  // From the tokens, not the material: it is shared and may still be dark from an earlier round.
  const cloudBase = new THREE.Color(hex(wt('xr-forest-cloud')));
  const cloudEmissive = 0.35;
  const stormCloud = new THREE.Color(hex('xr-forest-storm-cloud'));
  const keyBase = key.intensity;
  const fireflyBase = fireflies?.material.opacity ?? 0;
  let nextStrike = 2;
  let flash = 0; // seconds left of the current strike
  let thunder = -1;
  return {
    group,
    update(dt, camX, half) {
      const w = stormAt(camX);
      // Sky, clouds and light get darker with the storm; a strike lights everything up.
      if (w > 0.55 && !WINTER) {
        nextStrike -= dt;
        if (nextStrike <= 0) {
          nextStrike = 3.5 + Math.random() * 4;
          flash = 0.32;
          bolt.geometry.dispose();
          bolt.geometry = boltGeometry(camX + (Math.random() - 0.5) * half * 1.4, top + 1, bottom + 3.5);
          thunder = 0.35 + Math.random() * 0.6;
        }
      }
      let f = 0;
      if (flash > 0) {
        flash -= dt;
        // two quick flickers
        f = flash > 0.2 || (flash > 0.06 && flash < 0.13) ? 1 : 0;
      }
      if (thunder > 0) {
        thunder -= dt;
        if (thunder <= 0) sfx.storm();
      }
      back.material.color.copy(white).lerp(stormSky, w * 0.7);
      if (f) back.material.color.multiplyScalar(1.8);
      cloud.color.copy(cloudBase).lerp(stormCloud, w * 0.75);
      cloud.emissiveIntensity = cloudEmissive * (1 - w * 0.7) + f * 0.8;
      key.intensity = keyBase * (1 - w * 0.35) + f * 1.6;
      boltMat.opacity = f;
      if (fireflies) fireflies.material.opacity = fireflyBase * (1 - w);
      // Rain: slanted lines falling through the stage window.
      rainMat.opacity = w * 0.6;
      rain.visible = w > 0.01 && !WINTER;
      if (!rain.visible) return;
      for (let i = 0; i < n; i++) {
        const d = drops[i];
        d.y -= d.v * dt;
        if (d.y < bottom) { d.y = top; d.u = Math.random(); }
        const x = camX + (d.u - 0.5) * 2 * half + (top - d.y) * 0.18;
        const o = i * 6;
        pos[o] = x; pos[o + 1] = d.y; pos[o + 2] = d.z;
        pos[o + 3] = x + 0.08; pos[o + 4] = d.y + 0.45; pos[o + 5] = d.z;
      }
      geo.attributes.position.needsUpdate = true;
    },
  };
}

/**
 * The leaf canopy (ceiling), the branches hanging from it (a branch with leaves at the bottom,
 * a column of foliage up to the canopy) and thorns under some branches. Appear like the blocks.
 */
export function makeForestCanopy(course, F) {
  const group = new THREE.Group();
  group.userData.noFit = true;
  const C = course.ceiling;
  const span = Math.ceil(course.finish + 30);
  const tops = ['A', 'B'].map((v) => instanced(F.parts(`CanopyTop${v}`), span, { shadow: false }));
  const branchUnits = course.branches.reduce((n, b) => n + Math.ceil(b.x1 - b.x0), 0);
  const branch = instanced(F.parts('Branch'), branchUnits);
  const foliage = instanced(F.parts('Foliage'), branchUnits * 4, { shadow: false });
  const thorns = instanced(F.parts('Thorns'), branchUnits);
  const all = [...tops, branch, foliage, thorns];
  all.forEach((x) => group.add(x.group));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  return {
    group,
    update(camX, half) {
      all.forEach((x) => x.begin());
      for (let x = Math.floor(camX - half); x <= Math.ceil(camX + half); x++) {
        const k = edgeFactor(x + 0.5 - camX, half);
        if (k <= 0.001) continue;
        p.set(x + 0.5, C + (1 - k) * 0.4, 0);
        s.set(k, k, k);
        tops[hash(x * 13) < 0.5 ? 0 : 1].push(m.compose(p, q, s));
      }
      for (const b of course.branches) {
        if (b.x1 < camX - half || b.x0 > camX + half) continue;
        for (let x = b.x0; x < b.x1; x++) {
          const k = edgeFactor(x + 0.5 - camX, half);
          if (k <= 0.001) continue;
          const lift = (1 - k) * 0.4; // hanging things rise as they disappear
          p.set(x + 0.5, b.y + lift, 0);
          s.set(k, k, k);
          branch.push(m.compose(p, q, s));
          if (b.thorns) thorns.push(m.compose(p, q, s));
          // foliage up to the canopy: whole blocks, squeezed a little so they end there
          const h = C - (b.y + 1);
          if (h <= 0.05) continue; // a high branch reaches into the canopy by itself
          const count = Math.max(1, Math.ceil(h - 0.05));
          const sy = h / count;
          for (let j = 0; j < count; j++) {
            p.set(x + 0.5, b.y + (1 + j * sy) * k + lift, 0);
            s.set(k, sy * k, k);
            foliage.push(m.compose(p, q, s));
          }
        }
      }
      all.forEach((x) => x.end());
    },
  };
}

/** An eagle with flapping wings; animate(dt, t, dir) turns it in its flying direction. */
export function makeEagle(F) {
  const group = new THREE.Group();
  const eagle = F.clone('Eagle');
  eagle.scale.setScalar(1.15);
  eagle.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const wings = ['EagleWingL', 'EagleWingR'].map((n) => eagle.getObjectByName(n)).filter(Boolean);
  const base = wings.map((w) => w.rotation.clone());
  group.add(eagle);
  let turn = 0;
  group.userData.animate = (dt, t, dir) => {
    // big slow wing beats with a glide in between
    const beat = Math.sin(t * 7);
    wings.forEach((w, i) => { w.rotation.x = base[i].x + (i ? 1 : -1) * (0.15 + beat * 0.55); });
    turn += ((dir > 0 ? Math.PI : 0) - turn) * Math.min(1, dt * 5);
    eagle.rotation.y = turn;
    eagle.rotation.z = Math.sin(t * 1.3) * 0.08;
  };
  return group;
}
