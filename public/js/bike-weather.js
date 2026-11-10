// "Pannenfrei": the weather turns mid-section. A layer over the trail shows the new ground (rain:
// a wet sheen with puddles, frost: a shiny ice film with cracks, sun: pale dry dust with cracks,
// thaw: grey slush), rain streaks fall around the bike, frost glints. Fog only thickens the air.
// Colors from the --xr-bike-* tokens; course units like bike-world.js.
import * as THREE from 'three';
import { hex, color } from './tokens.js';
import { seeded } from './bike-world.js';

const TAU = Math.PI * 2;

/** Sky and light per weather (browser sky tokens; light factor for the key light). */
export const WEATHER_LOOK = {
  rain: { sky: ['xr-bike-sky-rain-top', 'xr-bike-sky-rain-low'], light: 0.7 },
  frost: { sky: ['xr-bike-sky-frost-top', 'xr-bike-sky-frost-low'], light: 1.05 },
  sun: { sky: ['xr-bike-sky-sun-top', 'xr-bike-sky-sun-low'], light: 1.35 },
  thaw: { sky: ['xr-bike-sky-rain-top', 'xr-bike-sky-rain-low'], light: 0.85 },
  fog: { sky: ['xr-bike-sky-fog-top', 'xr-bike-sky-fog-low'], light: 0.8 },
};

function blobs(ctx, w, h, rnd, n, r0, r1, col, alpha, sy = 1) {
  ctx.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = r0 + rnd() * (r1 - r0);
    ctx.globalAlpha = alpha * (0.6 + rnd() * 0.4);
    for (const dy of [-h, 0, h]) {
      ctx.beginPath();
      ctx.ellipse(x, y + dy, r, r * sy, rnd() * 3, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function cracks(ctx, w, h, rnd, n, col, width) {
  ctx.strokeStyle = col;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    let x = rnd() * w;
    let y = rnd() * h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let k = 0; k < 7; k++) {
      x += (rnd() - 0.5) * 26;
      y += (rnd() - 0.3) * 22;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

/** Transparent painting of the new ground (one tile: 4.6 m across, 8 m along). */
const PAINT = {
  rain(ctx, w, h, rnd) {
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = color('xr-bike-wet');
    ctx.fillRect(0, 0, w, h);
    blobs(ctx, w, h, rnd, 22, 12, 34, color('xr-bike-water'), 0.75, 0.55);
    ctx.strokeStyle = color('xr-bike-rain');
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 26; i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.ellipse(x, y, 4 + rnd() * 8, (4 + rnd() * 8) * 0.55, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  },
  frost(ctx, w, h, rnd) {
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = color('xr-bike-frost');
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 0.85;
    cracks(ctx, w, h, rnd, 22, color('xr-bike-frost-crack'), 1.6);
    blobs(ctx, w, h, rnd, 260, 0.8, 1.8, color('xr-bike-frost-crack'), 0.9);
  },
  sun(ctx, w, h, rnd) {
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = color('xr-bike-dry');
    ctx.fillRect(0, 0, w, h);
    blobs(ctx, w, h, rnd, 40, 10, 30, color('xr-bike-dry'), 0.35, 0.6);
    ctx.globalAlpha = 0.7;
    cracks(ctx, w, h, rnd, 26, color('xr-bike-mud-dark'), 1.4);
    ctx.globalAlpha = 1;
  },
  thaw(ctx, w, h, rnd) {
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = color('xr-bike-slush');
    ctx.fillRect(0, 0, w, h);
    blobs(ctx, w, h, rnd, 40, 8, 26, color('xr-bike-mud-wet'), 0.6, 0.6);
    blobs(ctx, w, h, rnd, 18, 10, 26, color('xr-bike-water'), 0.6, 0.5);
  },
};
const LOOK = {
  rain: { rough: 0.08, metal: 0.15 },
  frost: { rough: 0.05, metal: 0.1 },
  sun: { rough: 0.95, metal: 0 },
  thaw: { rough: 0.2, metal: 0.05 },
};

/**
 * The new ground from the weather's onset to the end of its section, over the trail and its
 * shoulders, faded in over the first meters. setK(0..1) fades it in when the weather turns.
 */
export function makeWeatherLayer(course, w, clip) {
  if (!PAINT[w.kind]) return null;
  const rnd = seeded(91 + w.i);
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 448;
  PAINT[w.kind](c.getContext('2d'), c.width, c.height, rnd);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  const cols = [-2.3, -1.8, -1.2, -0.6, 0, 0.6, 1.2, 1.8, 2.3];
  const s0 = w.s - 3;
  const s1 = w.end;
  const step = 0.5;
  const rows = Math.ceil((s1 - s0) / step) + 1;
  const pos = new Float32Array(rows * cols.length * 3);
  const uv = new Float32Array(rows * cols.length * 2);
  const col = new Float32Array(rows * cols.length * 4);
  const p = new THREE.Vector3();
  for (let i = 0; i < rows; i++) {
    const s = Math.min(s1, s0 + i * step);
    const fade = THREE.MathUtils.smoothstep(s, s0, s0 + 5) * (1 - THREE.MathUtils.smoothstep(s, s1 - 2, s1));
    cols.forEach((v, j) => {
      course.point(s, v, p);
      const k = i * cols.length + j;
      pos.set([p.x, course.h(s) + 0.034 + (Math.abs(v) > 2 ? 0.02 : 0), p.z], k * 3);
      uv.set([(v + 2.3) / 4.6, s / 8], k * 2);
      const edge = 1 - THREE.MathUtils.smoothstep(Math.abs(v), 1.9, 2.3);
      col.set([1, 1, 1, fade * edge], k * 4);
    });
  }
  const idx = [];
  const C = cols.length;
  for (let i = 0; i < rows - 1; i++) for (let j = 0; j < C - 1; j++) { const a = i * C + j; idx.push(a, a + 1, a + C, a + 1, a + C + 1, a + C); }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const look = LOOK[w.kind];
  const mat = new THREE.MeshStandardMaterial({
    map: tex, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, roughness: look.rough, metalness: look.metal,
    clippingPlanes: clip, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.userData.noFit = true;
  mesh.renderOrder = 1;
  mesh.visible = false;
  mesh.userData.setK = (k) => { mat.opacity = k; mesh.visible = k > 0.01; };
  mesh.userData.dispose = () => { tex.dispose(); };
  return mesh;
}

/** Rain streaks around the bike (course units). update(dt, s, amount 0..1). */
export function makeRain(count = 320, clip = null) {
  const pos = new Float32Array(count * 6);
  const seed = new Float32Array(count * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({ color: hex('xr-bike-rain'), transparent: true, opacity: 0, depthWrite: false, clippingPlanes: clip });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  lines.userData.noFit = true;
  const p = new THREE.Vector3();
  let init = false;
  lines.userData.update = (dt, course, s, amount) => {
    mat.opacity += (amount * 0.6 - mat.opacity) * Math.min(1, dt * 2);
    lines.visible = mat.opacity > 0.02;
    if (!lines.visible) { init = false; return; }
    for (let i = 0; i < count; i++) {
      let y = seed[i * 3 + 2];
      if (!init || seed[i * 3] < s - 2.5) {
        seed[i * 3] = s + (init ? 6 + Math.random() * 10 : -2 + Math.random() * 18);
        seed[i * 3 + 1] = -5 + Math.random() * 10;
        y = Math.random() * 6;
      }
      y -= dt * 13;
      if (y < 0) y += 6;
      seed[i * 3 + 2] = y;
      course.point(seed[i * 3], seed[i * 3 + 1], p);
      const hy = course.h(seed[i * 3]);
      pos.set([p.x, hy + y, p.z, p.x + 0.04, hy + y + 0.45, p.z + 0.08], i * 6);
    }
    init = true;
    geo.attributes.position.needsUpdate = true;
  };
  return lines;
}
