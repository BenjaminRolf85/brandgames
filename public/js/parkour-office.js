// Echo Parkour level 2: the office from the Blender assets (blender/build_office.py). Floor,
// ceiling and wall modules are instanced and only drawn near the stage window, the furniture
// builds up at the window edges like the blocks of level 1. Monitors show an agent chat, the
// Echomotion sign hangs on the wall, and the time of day runs from morning to night.
import * as THREE from 'three';
import { loadGLTF } from './models.js';
import { color, hex } from './tokens.js';
import { modelSet, logoTexture } from './parkour-models.js';
import { instanced, edgeFactor } from './parkour-visuals.js';
import { roundRect } from './ui3d.js';
import { t } from './i18n.js';
import { font } from './tokens.js';
import { gfxTier } from './gfx.js';
import { beamTexture } from './parkour-look.js';

export const OFFICE_URL = 'assets/models/office.glb';

const std = (name, token, metalness, roughness, extra = {}) => new THREE.MeshStandardMaterial({ name, color: hex(token), metalness, roughness, vertexColors: true, ...extra });
const basic = (name, token) => new THREE.MeshBasicMaterial({ name, color: hex(token), toneMapped: false });

function makeMaterials() {
  return {
    OfWall: std('OfWall', 'xr-office-wall', 0, 0.85),
    OfWallDark: std('OfWallDark', 'xr-office-wall-dark', 0, 0.8),
    OfWhite: std('OfWhite', 'xr-office-white', 0.05, 0.35),
    OfWood: std('OfWood', 'xr-office-wood', 0, 0.45),
    OfMetal: std('OfMetal', 'xr-office-metal', 0.9, 0.3),
    OfDark: std('OfDark', 'xr-office-dark', 0.5, 0.4),
    OfFabric: std('OfFabric', 'xr-office-fabric', 0, 0.9),
    OfCarpet: std('OfCarpet', 'xr-office-carpet', 0, 0.95),
    OfFloorBase: std('OfFloorBase', 'xr-office-floor-base', 0.3, 0.6),
    OfGlass: new THREE.MeshStandardMaterial({ name: 'OfGlass', color: hex('xr-office-glass'), metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.12, depthWrite: false }),
    OfPlant: std('OfPlant', 'xr-office-plant', 0, 0.6),
    OfPlantDark: std('OfPlantDark', 'xr-office-plant-dark', 0, 0.6),
    OfBook1: std('OfBook1', 'xr-office-book-1', 0, 0.6),
    OfBook2: std('OfBook2', 'xr-office-book-2', 0, 0.6),
    OfBook3: std('OfBook3', 'xr-office-book-3', 0, 0.6),
    OfBook4: std('OfBook4', 'xr-office-book-4', 0, 0.6),
    OfPaper: std('OfPaper', 'xr-office-white', 0, 0.7),
    OfLightGlow: new THREE.MeshBasicMaterial({ name: 'OfLightGlow', color: 0xffffff, toneMapped: false }),
    OfScreenGlow: basic('OfScreenGlow', 'xr-office-screen'),
    OfSparkGlow: basic('OfSparkGlow', 'xr-office-spark'),
    OfSignGlow: basic('OfSignGlow', 'xr-office-sign'),
    OfShirt: std('OfShirt', 'xr-office-shirt-1', 0, 0.8),
    OfSkin: std('OfSkin', 'xr-office-skin', 0, 0.6),
    OfHair: std('OfHair', 'xr-office-hair', 0, 0.7),
  };
}

let promise = null;

/** Loads the office once: { parts(name), clone(name), materials }. */
export function loadOfficeModels() {
  promise ??= loadGLTF(OFFICE_URL).then((gltf) => modelSet(gltf, makeMaterials()));
  return promise;
}

// Canvas pictures on screens: twice the resolution on 'high' (Quest 3 full, desktop), sharp
// with anisotropic filtering at grazing angles.
const sharpness = () => (gfxTier() === 'high' ? 2 : 1);
const sharpen = (tex) => { tex.anisotropy = gfxTier() === 'high' ? 8 : 4; return tex; };

/** Monitor picture: an agent chat (header, messages, input line), drawn with the tokens. */
let screenTex = null;
function screenTexture() {
  const R = sharpness();
  if (screenTex?.userData.R === R) return screenTex;
  const c = document.createElement('canvas');
  c.width = 256 * R;
  c.height = 150 * R;
  const ctx = c.getContext('2d');
  ctx.scale(R, R);
  ctx.fillStyle = color('xr-parkour-back');
  ctx.fillRect(0, 0, 256, 150);
  ctx.fillStyle = color('xr-office-fabric');
  ctx.fillRect(0, 0, 256, 24);
  ctx.fillStyle = color('xr-office-screen');
  ctx.beginPath();
  ctx.arc(14, 12, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color('xr-office-white');
  ctx.fillRect(28, 8, 70, 7);
  const bubble = (x, y, w, h, fill) => { ctx.fillStyle = fill; roundRect(ctx, x, y, w, h, 7); ctx.fill(); };
  bubble(10, 34, 150, 22, color('xr-office-dark'));
  bubble(96, 62, 150, 30, color('xr-office-screen'));
  bubble(10, 98, 120, 18, color('xr-office-dark'));
  ctx.fillStyle = color('xr-office-white');
  [[18, 42, 110], [18, 49, 80], [18, 104, 90]].forEach(([x, y, w]) => ctx.fillRect(x, y, w, 3));
  ctx.fillStyle = color('xr-parkour-back');
  [[104, 70, 120], [104, 78, 90]].forEach(([x, y, w]) => ctx.fillRect(x, y, w, 3));
  bubble(10, 126, 236, 16, color('xr-office-dark'));
  screenTex = sharpen(new THREE.CanvasTexture(c));
  screenTex.userData.R = R;
  screenTex.colorSpace = THREE.SRGBColorSpace;
  screenTex.flipY = false; // glTF UVs (top left origin)
  return screenTex;
}

const NODE = {
  desk: 'Desk', chair: 'Chair', cabinet: 'Cabinet', shelf: 'Shelf', plant: 'Plant', partition: 'Partition',
  counter: 'Counter', coffee: 'CoffeeMachine', fridge: 'Fridge', table: 'MeetingTable', whiteboard: 'Whiteboard',
  printer: 'Printer', transom: 'GlassTransom',
  fan: 'CeilingFan', screen: 'WorkshopScreen', flipchart: 'Flipchart', participant: 'Participant',
};

const shadows = (root) => root.traverse((o) => {
  if (!o.isMesh || o.material.isMeshBasicMaterial || o.material.transparent) return;
  o.castShadow = true;
  o.receiveShadow = true;
});

/** One piece of furniture (a group with its origin at the prop's base or at the ceiling). */
function makeProp(O, pr, C) {
  const g = new THREE.Group();
  if (pr.type === 'duct' || pr.type === 'lamp') {
    const body = O.clone(pr.type === 'duct' ? 'DuctBody' : 'LampCord');
    const end = O.clone(pr.type === 'duct' ? 'DuctCap' : 'LampShade');
    body.scale.y = pr.len; // 1 unit long, stretched to the course length
    end.position.y = -pr.len;
    g.add(body, end);
    g.position.set(pr.x, C, 0);
  } else {
    const node = O.clone(NODE[pr.type]);
    if (node) g.add(node);
    if (pr.type === 'desk') {
      const scr = node?.getObjectByName('DeskScreen');
      if (scr) scr.material = new THREE.MeshBasicMaterial({ map: screenTexture(), toneMapped: false });
    }
    if (pr.type === 'screen') {
      const pic = node?.getObjectByName('WorkshopPicture');
      if (pic) pic.material = new THREE.MeshBasicMaterial({ map: workshopTexture(), toneMapped: false });
    }
    if (pr.type === 'participant' && node) {
      // every participant a shirt of their own
      const shirt = O.materials.OfShirt.clone();
      shirt.color.setHex(hex(`xr-office-shirt-${(pr.tint ?? 0) % 4 + 1}`));
      node.traverse((o) => { if (o.isMesh && o.material.name === 'OfShirt') o.material = shirt; });
    }
    g.position.set(pr.x, pr.type === 'fan' ? C : pr.y, pr.z ?? 0);
    g.rotation.y = pr.rot ?? 0;
  }
  shadows(g);
  return g;
}

/** The workshop screen: title, welcome line, the Echomotion logo and a few agenda bars. */
let workshopTex = null;
function workshopTexture() {
  const R = sharpness();
  if (workshopTex?.userData.R === R) return workshopTex;
  const c = document.createElement('canvas');
  c.width = 512 * R;
  c.height = 288 * R;
  const ctx = c.getContext('2d');
  ctx.scale(R, R);
  let tex = null;
  const draw = (logo) => {
    ctx.fillStyle = color('xr-parkour-back');
    ctx.fillRect(0, 0, 512, 288);
    ctx.fillStyle = color('xr-office-screen');
    ctx.fillRect(0, 0, 512, 8);
    ctx.fillStyle = color('xr-office-white');
    ctx.font = font('black', 46);
    ctx.textBaseline = 'top';
    ctx.fillText(t('parkourWorkshop'), 28, 34);
    ctx.font = font('bold', 20);
    ctx.fillStyle = color('xr-office-screen');
    ctx.fillText(t('parkourWorkshopSub'), 28, 96);
    [[0.78, 'xr-office-shirt-1'], [0.62, 'xr-office-shirt-2'], [0.7, 'xr-office-shirt-4']].forEach(([w, tk], i) => {
      ctx.fillStyle = color(tk);
      roundRect(ctx, 28, 150 + i * 36, 300 * w, 18, 9);
      ctx.fill();
    });
    if (logo) ctx.drawImage(logo, 372, 140, 112, 112);
    if (tex) tex.needsUpdate = true;
  };
  draw(null);
  const img = new Image();
  img.onload = () => draw(img);
  img.src = 'assets/echomotion-logo.png';
  tex = sharpen(new THREE.CanvasTexture(c));
  tex.userData.R = R;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false; // glTF UVs (top left origin)
  workshopTex = tex;
  return tex;
}

/** Cable tangle with sparks (the office's hazard, 1 unit wide). */
export function makeCables(O, x0, x1) {
  const group = new THREE.Group();
  const mid = (x0 + x1) / 2;
  for (let x = x0 + 0.5; x < x1 + 0.01; x += 1) {
    const c = O.clone('Cables');
    c.position.x = x - mid;
    c.rotation.y = Math.random() * Math.PI;
    shadows(c);
    group.add(c);
  }
  const mat = O.materials.OfSparkGlow;
  const base = mat.color.clone();
  group.userData.flicker = () => mat.color.copy(base).multiplyScalar(0.5 + Math.random() * 0.9);
  return group;
}

// Time of day over the course: sky colors (top, bottom) and how bright the office lights glow.
const DAY = [
  { p: 0, sky: 'morning', glow: 0.7, key: 1.2 },
  { p: 0.4, sky: 'noon', glow: 0.65, key: 1.4 },
  { p: 0.75, sky: 'evening', glow: 0.95, key: 1.1 },
  { p: 1, sky: 'night', glow: 1.1, key: 0.85 },
];

/** Sky top and bottom, light glow and key light intensity at course progress p (0..1). */
export function timeOfDay(p, out = { top: new THREE.Color(), bottom: new THREE.Color(), glow: 1, key: 1 }) {
  p = THREE.MathUtils.clamp(p, 0, 1);
  let i = 0;
  while (i < DAY.length - 2 && p > DAY[i + 1].p) i++;
  const a = DAY[i];
  const b = DAY[i + 1];
  const k = THREE.MathUtils.smoothstep(p, a.p, b.p);
  const col = (s, part) => new THREE.Color(hex(`xr-office-sky-${s}-${part}`));
  out.top.copy(col(a.sky, 'top')).lerp(col(b.sky, 'top'), k);
  out.bottom.copy(col(a.sky, 'bottom')).lerp(col(b.sky, 'bottom'), k);
  out.glow = a.glow + (b.glow - a.glow) * k;
  out.key = a.key + (b.key - a.key) * k;
  return out;
}

/**
 * Sunlight falling in through the windows: one soft beam per window, slanted down into the room
 * towards the player (instanced, one draw call, additive). 'high' only (Quest 3 full, desktop).
 */
function makeWindowBeams(course, clip) {
  if (gfxTier() !== 'high') return null;
  const wins = course.walls.filter((w) => w.type === 'WallWindow');
  if (!wins.length) return null;
  // The window opening is 3.1 wide from y 1.6 to 5.4 in the back wall (z -1.45).
  const pos = [-1.45, 5.3, -1.3, 1.45, 5.3, -1.3, -0.35, 0.05, 0.45, 2.55, 0.05, 0.45];
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 0, 0, 1, 0], 2));
  geo.setIndex([0, 2, 1, 1, 2, 3]);
  const mat = new THREE.MeshBasicMaterial({
    map: beamTexture(), color: 0xffffff, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending,
    depthWrite: false, toneMapped: false, side: THREE.DoubleSide, clippingPlanes: clip, fog: false,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, wins.length);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  mesh.userData.noFit = true;
  mesh.userData.noShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  const m = new THREE.Matrix4();
  const sun = new THREE.Color(hex('xr-office-light'));
  let strength = 1;
  return {
    group,
    update(camX, half) {
      let n = 0;
      for (const w of wins) {
        if (Math.abs(w.x - camX) > half + 3) continue;
        mesh.setMatrixAt(n++, m.makeTranslation(w.x, 0, 0));
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.visible = n > 0 && strength > 0.01;
    },
    set(col, k) {
      mat.color.copy(sun).lerp(col, 0.35); // warm sunlight, tinted by the sky

      strength = k;
      mat.opacity = 0.28 * k;
    },
  };
}

/** The office in course units: room modules, furniture and logo signs. */
export function makeOffice(course, O, clip = null) {
  const C = course.ceiling;
  if (clip) Object.values(O.materials).forEach((mat) => { mat.clippingPlanes = clip; });
  const group = new THREE.Group();
  group.userData.noFit = true;
  const span = Math.ceil(course.to - course.from);
  const floor = instanced(O.parts('FloorTile'), span + 4, { tinted: ['OfCarpet'] });
  const ceil = instanced(O.parts('CeilingPanel'), Math.ceil(span / 2) + 4, { shadow: false });
  const wallTypes = ['WallWindow', 'WallPlain', 'WallBoard', 'WallLogo'];
  const walls = Object.fromEntries(wallTypes.map((tp) => [tp, instanced(O.parts(tp), course.walls.length)]));
  group.add(floor.group, ceil.group, ...Object.values(walls).map((w) => w.group));

  const props = course.props.map((pr) => {
    const obj = makeProp(O, pr, C);
    group.add(obj);
    return { ...pr, obj, blades: obj.getObjectByName('FanBlades'), base: obj.position.y };
  });
  const beams = makeWindowBeams(course, clip);
  if (beams) group.add(beams.group);
  let cheering = 0;
  // Echomotion sign on the logo walls
  const logoMat = new THREE.MeshBasicMaterial({ map: logoTexture(), toneMapped: false, transparent: true, clippingPlanes: clip });
  const logoGeo = new THREE.CircleGeometry(0.85, 48);
  const logos = course.walls.filter((w) => w.type === 'WallLogo').map((w) => {
    const obj = new THREE.Mesh(logoGeo, logoMat);
    obj.position.set(w.x, 3.6, -1.45 + 0.1);
    group.add(obj);
    return { x: w.x, obj };
  });

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const carpet = [new THREE.Color(1, 1, 1), new THREE.Color(0.86, 0.88, 0.95)];
  const white = new THREE.Color(1, 1, 1);
  const show = (obj, x, camX, half) => {
    const k = edgeFactor(x - camX, half);
    obj.visible = k > 0.001;
    if (obj.visible) obj.scale.setScalar(k);
  };
  return {
    group,
    props,
    update(camX, half) {
      // Floor, ceiling and walls stay whole; the clipping planes cut them at the stage edges.
      s.set(1, 1, 1);
      floor.begin();
      for (let x = Math.floor(camX - half) - 1; x <= Math.ceil(camX + half); x++) {
        p.set(x + 0.5, 0, 0);
        floor.push(m.compose(p, q, s), null, carpet[(x % 2 + 2) % 2]);
      }
      floor.end();
      ceil.begin();
      for (let x = Math.floor((camX - half) / 2) * 2 - 2; x <= camX + half + 1; x += 2) {
        p.set(x + 1, C, 0);
        ceil.push(m.compose(p, q, s), white);
      }
      ceil.end();
      wallTypes.forEach((tp) => walls[tp].begin());
      for (const w of course.walls) {
        if (Math.abs(w.x - camX) > half + 2) continue;
        p.set(w.x, 0, 0);
        walls[w.type].push(m.compose(p, q, s), white);
      }
      wallTypes.forEach((tp) => walls[tp].end());
      for (const pr of props) show(pr.obj, pr.x, camX, half);
      // the ceiling fans spin, the workshop cheers when Echo arrives
      const time = performance.now() / 1000;
      for (const pr of props) {
        if (pr.blades) pr.blades.rotation.y = time * 9;
        if (pr.type === 'participant' && cheering) pr.obj.position.y = pr.base + Math.abs(Math.sin(time * 9 + pr.x)) * 0.25;
      }
      for (const l of logos) l.obj.visible = Math.abs(l.x - camX) < half + 1;
      beams?.update(camX, half);
    },
    /** Daylight through the windows: color of the sky at the horizon and strength (0 at night). */
    setDaylight(col, k) { beams?.set(col, k); },
    /** Echo arrived at the workshop: the participants cheer. */
    cheer() { cheering = 1; },
    /** Office lights for the time of day (0..1.2 brightness). */
    setGlow(v) {
      O.materials.OfLightGlow.color.setScalar(v);
    },
  };
}
