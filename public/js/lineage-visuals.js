// "Datenspur": the small 3D world around the boards. All colors are tokens (css/game-lineage.css).
//   makeSky        a deep, dark gradient as scene background (browser and VR; AR keeps the real room)
//   makeBackdrop   the data room around the field: floor glow, data towers, arcs of light, stars
//   makeLandscape  a little data landscape on a tray: three source stores, pipes into a
//                  transformation machine, a warehouse, three report screens. It fills with
//                  flowing data as the round goes on (setProgress), so progress shows in the world.
// Budget (Quest 3): the landscape is 14 draw calls and about 9k triangles; repeated parts are
// instanced, materials are shared, nothing is allocated per frame.
import * as THREE from 'three';
import { color, hex } from './tokens.js';
import { contactShadow } from './gfx.js';
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';

const clamp = THREE.MathUtils.clamp;

export function makeSky() {
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, color('xr-lineage-sky-top'));
  grad.addColorStop(0.55, color('xr-lineage-sky-mid'));
  grad.addColorStop(1, color('xr-lineage-sky-low'));
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.horizon = hex('xr-lineage-sky-low');
  return tex;
}

/**
 * The data room around the playing field (browser and VR): a softly lit floor, data towers in the
 * distance linked by arcs of pipe with travelling light, far points of light and faint, drifting
 * holo panels. around: all the way round (VR), else only ahead. About 6k triangles, 12 to 14 draw calls.
 */
export function makeBackdrop({ calm = false, around = false, floorY = 0 } = {}) {
  const group = new THREE.Group();
  group.userData.noFit = true;
  const n = around ? 26 : 16;
  const geo = new THREE.PlaneGeometry(1, 0.62);
  const mat = new THREE.MeshBasicMaterial({ color: hex('xr-lineage-far-card'), transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const cards = new THREE.InstancedMesh(geo, mat, n);
  const tints = ['xr-lineage-far-card', 'xr-lineage-far-card-2', 'xr-lineage-far-card-3'].map((k) => new THREE.Color(hex(k)));
  const items = [];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const a = around ? (i / n) * Math.PI * 2 + 0.3 : -1.1 + (i / (n - 1)) * 2.2;
    const r = 4.2 + ((i * 37) % 10) * 0.28;
    const it = { a, r, y: 0.4 + ((i * 53) % 17) * 0.17, size: 0.5 + ((i * 29) % 7) * 0.09, ph: i * 1.7 };
    items.push(it);
    cards.setColorAt(i, tints[i % 3]);
  }
  const place = (time) => {
    items.forEach((it, i) => {
      p.set(Math.sin(it.a) * it.r, it.y + Math.sin(time * 0.35 + it.ph) * 0.07, -Math.cos(it.a) * it.r);
      e.set(0, -it.a, Math.sin(time * 0.25 + it.ph) * 0.04);
      q.setFromEuler(e);
      s.setScalar(it.size);
      cards.setMatrixAt(i, m.compose(p, q, s));
    });
    cards.instanceMatrix.needsUpdate = true;
  };
  place(0);
  cards.frustumCulled = false;
  if (around) group.add(cards); // faint holo panels, only in VR (in the browser they would sit behind the labels)
  // A soft floor that fades out towards the horizon.
  {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(128, 128, 10, 128, 128, 128);
    grad.addColorStop(0, color('xr-lineage-floor'));
    grad.addColorStop(0.75, color('xr-lineage-floor'));
    grad.addColorStop(1, color('xr-lineage-floor-edge'));
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false, depthWrite: false }));
    floor.position.y = floorY;
    floor.renderOrder = -3;
    group.add(floor);
  }

  // Far points of light all around, like the app's other data spaces (one draw call).
  {
    const N = around ? 420 : 260;
    const pts = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const a = around ? Math.random() * Math.PI * 2 : (Math.random() - 0.5) * 2.6;
      const r = 9 + Math.random() * 9;
      pts.set([Math.sin(a) * r, floorY + 0.3 + Math.random() * 7, -Math.cos(a) * r], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    group.add(new THREE.Points(g, new THREE.PointsMaterial({ color: hex('xr-lineage-star'), size: 0.05, sizeAttenuation: true, transparent: true, opacity: 0.8, fog: false, depthWrite: false })));
  }

  // Data towers in the distance (stacks of discs like the sources of the landscape), linked by
  // arcs of pipe in which light travels. Instanced.
  const towerAngles = around ? [-2.6, -1.75, -0.95, -0.35, 0.4, 1.05, 1.9, 2.75] : [-1.15, -0.62, -0.2, 0.3, 0.72, 1.2];
  const towerCols = ['xr-lineage-source', 'xr-lineage-machine', 'xr-lineage-house', 'xr-lineage-bar'].map((k2) => new THREE.Color(hex(k2)).lerp(new THREE.Color(hex('xr-lineage-sky-mid')), 0.35));
  const discGeo = new THREE.CylinderGeometry(0.62, 0.62, 0.26, 20);
  const towers = new THREE.InstancedMesh(discGeo, new THREE.MeshLambertMaterial({ fog: !around, emissive: hex('xr-lineage-tok-glow') }), towerAngles.length * 6);
  const tops = [];
  let ti = 0;
  towerAngles.forEach((a, t) => {
    const r = 9.2 + ((t * 7) % 4) * 0.55;
    const layers = 3 + ((t * 5) % 4);
    const x = Math.sin(a) * r;
    const z = -Math.cos(a) * r;
    for (let l = 0; l < 6; l++) {
      if (l < layers) { towers.setMatrixAt(ti, m.makeTranslation(x, floorY + 0.14 + l * 0.33, z)); towers.setColorAt(ti, towerCols[t % towerCols.length]); } else towers.setMatrixAt(ti, m.makeScale(0, 0, 0));
      ti += 1;
    }
    tops.push(new THREE.Vector3(x, floorY + 0.1 + layers * 0.33, z));
  });
  towers.frustumCulled = false;
  group.add(towers);
  const arcs = [];
  for (let t = 0; t + 1 < tops.length; t++) {
    const mid = tops[t].clone().add(tops[t + 1]).multiplyScalar(0.5);
    mid.y += 1.1 + (t % 2) * 0.5;
    arcs.push(new THREE.QuadraticBezierCurve3(tops[t], mid, tops[t + 1]));
  }
  const arcMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(hex('xr-lineage-flow')).lerp(new THREE.Color(hex('xr-lineage-sky-mid')), 0.6), fog: !around });
  if (arcs.length) group.add(new THREE.Mesh(mergeGeometries(arcs.map((c) => new THREE.TubeGeometry(c, 20, 0.022, 6, false))), arcMat)); // one mesh for all arcs
  const lightGeo = new THREE.SphereGeometry(0.06, 8, 6);
  const lights = new THREE.InstancedMesh(lightGeo, new THREE.MeshBasicMaterial({ color: hex('xr-lineage-far-card'), fog: false, toneMapped: false }), arcs.length * 2);
  lights.frustumCulled = false;
  group.add(lights);
  let time = 0;
  const lp = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const moveLights = () => {
    for (let i = 0; i < lights.count; i++) {
      arcs[Math.floor(i / 2)].getPoint((time * 0.16 + (i % 2) * 0.5 + i * 0.13) % 1, lp);
      lights.setMatrixAt(i, m.compose(lp, q.identity(), one));
    }
    lights.instanceMatrix.needsUpdate = true;
  };
  moveLights();
  group.userData.tick = (dt) => {
    if (calm) return;
    time += dt;
    place(time);
    moveLights();
  };
  return group;
}

// The seven pipes: three sources into the machine, the machine into the warehouse, the
// warehouse to three reports. `seg` is the part of the trail a pipe belongs to (it fills with it).
const ZS = [-0.15, 0, 0.15];
const PIPE_Y = 0.036;
const PIPES = [
  ...ZS.map((z) => ({ seg: 0, pts: [[-0.44, PIPE_Y, z], [-0.34, PIPE_Y, z], [-0.3, PIPE_Y, z * 0.3], [-0.22, PIPE_Y, 0]] })),
  { seg: 1, pts: [[-0.1, PIPE_Y, 0], [-0.02, PIPE_Y, 0], [0.06, PIPE_Y, 0]] },
  ...ZS.map((z) => ({ seg: 2, pts: [[0.25, PIPE_Y, 0], [0.31, PIPE_Y, z * 0.3], [0.36, PIPE_Y, z], [0.45, PIPE_Y, z]] })),
];
const SAMPLES = 20;

/**
 * The data landscape. setProgress(p): p from 0 to 3 (the stage plus the share of it that is
 * done); tick(dt) eases towards it and moves the data. cheer() sends a wave through the pipes.
 */
export function makeLandscape({ calm = false, shadows = false, pedestal = 0 } = {}) {
  const group = new THREE.Group();
  group.userData.noFit = true;
  const std = (token, extra = {}) => new THREE.MeshStandardMaterial({ color: hex(token), roughness: 0.55, metalness: 0.05, ...extra });
  const mats = {
    tray: std('xr-lineage-tray', { roughness: 0.8 }),
    rim: std('xr-lineage-tray-rim', { roughness: 0.6 }),
    source: std('xr-lineage-source', { emissive: hex('xr-lineage-source'), emissiveIntensity: 0 }),
    machine: std('xr-lineage-machine'),
    gear: std('xr-lineage-gear', { metalness: 0.5, roughness: 0.35 }),
    house: std('xr-lineage-house'),
    roof: std('xr-lineage-roof'),
    screen: std('xr-lineage-screen', { roughness: 0.35 }),
    bar: std('xr-lineage-bar', { emissive: hex('xr-lineage-bar'), emissiveIntensity: 0.25 }),
    pipes: [0, 1, 2].map(() => std('xr-lineage-pipe', { emissive: hex('xr-lineage-flow'), emissiveIntensity: 0, roughness: 0.4 })),
    pulse: new THREE.MeshBasicMaterial({ color: hex('xr-lineage-flow-light'), toneMapped: false }),
  };
  const idle = new THREE.Color(hex('xr-lineage-pipe'));
  const live = new THREE.Color(hex('xr-lineage-flow'));
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
    const o = new THREE.Mesh(geo, mat);
    o.position.set(x, y, z);
    o.castShadow = shadows;
    o.receiveShadow = shadows;
    group.add(o);
    return o;
  };

  // the tray: a rounded slab with a rim
  const shape = new THREE.Shape();
  const W = 0.62;
  const D = 0.27;
  const R = 0.09;
  shape.moveTo(-W + R, -D);
  shape.lineTo(W - R, -D); shape.quadraticCurveTo(W, -D, W, -D + R);
  shape.lineTo(W, D - R); shape.quadraticCurveTo(W, D, W - R, D);
  shape.lineTo(-W + R, D); shape.quadraticCurveTo(-W, D, -W, D - R);
  shape.lineTo(-W, -D + R); shape.quadraticCurveTo(-W, -D, -W + R, -D);
  const trayGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 3, curveSegments: 8 }).rotateX(Math.PI / 2);
  const tray = mesh(trayGeo, mats.tray, 0, 0, 0);
  tray.castShadow = false;
  const rimGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false, curveSegments: 8 }).rotateX(Math.PI / 2).scale(1.035, 1, 1.07);
  mesh(rimGeo, mats.rim, 0, -0.026, 0).castShadow = false;
  if (!shadows) { const blob = contactShadow(0.62, 0.3); blob.scale.z = 0.5; blob.position.y = -0.045; group.add(blob); }

  // three source stores: stacks of discs that grow while stage 1 is played (instanced)
  const discGeo = new THREE.CylinderGeometry(0.044, 0.044, 0.02, 24);
  const DISCS = 15;
  const discs = new THREE.InstancedMesh(discGeo, mats.source, DISCS);
  const m4 = new THREE.Matrix4();
  let shownDiscs = -1;
  const setDiscs = (lvl) => {
    const f = 3 + lvl * (DISCS - 3); // one disc per stack from the start, five at the end
    if (Math.abs(f - shownDiscs) < 0.01) return;
    shownDiscs = f;
    for (let i = 0; i < DISCS; i++) {
      const k = clamp(f - i, 0, 1); // the newest disc grows in
      const layer = Math.floor(i / 3);
      if (k <= 0) discs.setMatrixAt(i, m4.makeScale(0, 0, 0));
      else discs.setMatrixAt(i, m4.makeScale(k, k, k).setPosition(-0.49, 0.012 + layer * 0.026, ZS[i % 3]));
    }
    discs.instanceMatrix.needsUpdate = true;
  };
  setDiscs(0);
  discs.castShadow = shadows;
  discs.receiveShadow = shadows;
  discs.frustumCulled = false;
  group.add(discs);
  if (pedestal > 0) { // headset: the tray stands on a slim column
    const col = mesh(new THREE.CylinderGeometry(0.11, 0.2, pedestal, 20), mats.rim, 0, -0.03 - pedestal / 2, 0);
    col.castShadow = false;
  }

  // the transformation machine with a turning gear
  mesh(new THREE.BoxGeometry(0.12, 0.085, 0.13), mats.machine, -0.16, 0.044, 0);
  const gear = mesh(new THREE.TorusGeometry(0.034, 0.012, 8, 10), mats.gear, -0.16, 0.1, 0);
  gear.rotation.x = Math.PI / 2;

  // the warehouse: a hall with a pitched roof
  mesh(new THREE.BoxGeometry(0.19, 0.1, 0.24), mats.house, 0.155, 0.051, 0);
  const roofGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.25, 3, 1).rotateX(Math.PI / 2).rotateZ(Math.PI).scale(1.55, 0.6, 1);
  mesh(roofGeo, mats.roof, 0.155, 0.1235, 0);

  // three report screens turned towards the viewer, each with three bars that grow (instanced)
  const screenGeo = new THREE.BoxGeometry(0.1, 0.075, 0.01);
  const screens = new THREE.InstancedMesh(screenGeo, mats.screen, 3);
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3(1, 1, 1);
  const turn = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.22, -0.5, 0, 'YXZ'));
  const bases = ZS.map((z) => new THREE.Matrix4().compose(pos.set(0.525, 0.058, z), turn, scl));
  bases.forEach((b, i) => screens.setMatrixAt(i, b));
  screens.castShadow = shadows;
  group.add(screens);
  const barGeo = new THREE.BoxGeometry(0.016, 1, 0.004).translate(0, 0.5, 0);
  const bars = new THREE.InstancedMesh(barGeo, mats.bar, 9);
  bars.frustumCulled = false;
  group.add(bars);
  const BAR_H = [0.025, 0.05, 0.035, 0.045, 0.025, 0.055, 0.03, 0.04, 0.055];
  const setBars = (lvl) => {
    let b = 0;
    bases.forEach((base, s) => {
      for (let i = 0; i < 3; i++) {
        const h = Math.max(0.004, BAR_H[b] * clamp(lvl * 1.4 - s * 0.2, 0, 1));
        pos.set((i - 1) * 0.026, -0.03, 0.006);
        scl.set(1, h, 1);
        bars.setMatrixAt(b, m4.compose(pos, quat, scl).premultiply(base));
        b += 1;
      }
    });
    bars.instanceMatrix.needsUpdate = true;
  };
  setBars(0);
  scl.set(1, 1, 1);

  // pipes (one mesh per part of the trail) and the data that flows in them
  const curves = PIPES.map((p) => new THREE.CatmullRomCurve3(p.pts.map((v) => new THREE.Vector3(...v))));
  const paths = curves.map((c) => c.getSpacedPoints(SAMPLES));
  for (const seg of [0, 1, 2]) {
    const geos = curves.filter((c, i) => PIPES[i].seg === seg).map((c) => new THREE.TubeGeometry(c, 14, 0.011, 8, false));
    geos.forEach((g) => { const o = mesh(g, mats.pipes[seg]); o.castShadow = false; });
  }
  const PULSES = calm ? 7 : 21;
  const pulses = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0085, 10, 8), mats.pulse, PULSES);
  pulses.frustumCulled = false;
  group.add(pulses);
  const us = Array.from({ length: PULSES }, (_, i) => (i * 0.37) % 1);

  const level = { src: 0, seg: [0, 0, 0], bars: 0 };
  const target = { src: 0, seg: [0, 0, 0], bars: 0 };
  let boost = 0;
  let time = 0;
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);
  const apply = () => {
    mats.source.emissiveIntensity = 0.1 + level.src * 0.35;
    setDiscs(level.src);
    [0, 1, 2].forEach((s) => {
      mats.pipes[s].color.copy(idle).lerp(live, level.seg[s]);
      mats.pipes[s].emissiveIntensity = level.seg[s] * 0.45;
    });
    setBars(level.bars);
  };
  apply();

  group.userData.setProgress = (p) => {
    target.src = clamp(p, 0, 1);
    target.seg[0] = clamp(p - 1, 0, 1);
    target.seg[1] = clamp((p - 1.5) * 2, 0, 1);
    target.seg[2] = clamp(p - 2, 0, 1);
    target.bars = clamp(p - 2, 0, 1);
  };
  group.userData.cheer = (k = 1) => { boost = Math.max(boost, k); };
  group.userData.tick = (dt) => {
    time += dt;
    const kk = Math.min(1, dt * 2.5);
    level.src += (target.src - level.src) * kk;
    level.bars += (target.bars - level.bars) * kk;
    for (let s = 0; s < 3; s++) level.seg[s] += (target.seg[s] - level.seg[s]) * kk;
    boost = Math.max(0, boost - dt * 0.8);
    apply();
    if (!calm) gear.rotation.z += dt * (0.4 + level.seg[0] * 1.6 + boost * 4);
    const speed = calm ? 0.12 : 0.35 + boost * 0.8;
    for (let i = 0; i < PULSES; i++) {
      const pi = i % PIPES.length;
      const lvl = level.seg[PIPES[pi].seg];
      if (lvl < 0.04) { pulses.setMatrixAt(i, hide); continue; }
      us[i] = (us[i] + dt * speed) % 1;
      // The data reaches as far as this part of the trail is done: a front that moves on.
      const f = us[i] * lvl * SAMPLES;
      const a = paths[pi][Math.floor(f)];
      const b = paths[pi][Math.min(SAMPLES, Math.floor(f) + 1)];
      pos.copy(a).lerp(b, f - Math.floor(f));
      const sz = (0.75 + 0.25 * Math.sin(time * 5 + i)) * Math.min(1, (1 - us[i]) * 6) * (1 + boost * 0.5);
      scl.setScalar(sz);
      pulses.setMatrixAt(i, m4.compose(pos, quat, scl));
    }
    pulses.instanceMatrix.needsUpdate = true;
  };
  return group;
}

/** One key light for the landscape (the only light that may cast a shadow). */
export function makeKeyLight() {
  const light = new THREE.DirectionalLight(hex('xr-lineage-key-light'), 1.6);
  light.position.set(0.5, 1.4, 0.9);
  return light;
}
