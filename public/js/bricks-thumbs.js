// "Stein auf Stein": little photos of the real 3D parts for the cards. A hidden copy of the
// house is built with each option in turn and rendered into a small target from a fitting
// angle (a wall with the house bare, a window close up, the garden from above, ...). One
// picture per frame, so nothing stutters; the cards show a schematic drawing until theirs is
// there. If anything fails, the drawings simply stay.
import * as THREE from 'three';
import { hex } from './tokens.js';
import { DECISIONS, OPTION } from './bricks-data.js';
import { TOP, OX, OZ, FOUND, HOUSE_Z } from './bricks-plan.js';
import { House } from './bricks-house.js';

const SIZE = 192;
// What the camera looks at (plot-local center, the radius it must show) and from where (yaw
// from the front towards the left is negative, pitch down).
const H0 = FOUND;
const Z0 = HOUSE_Z;
const VIEW = {
  walls: { at: [0, H0 + 0.1, Z0], r: 0.36, yaw: -0.5, pitch: 0.38 },
  roof: { at: [0, H0 + TOP + 0.05, Z0], r: 0.4, yaw: -0.5, pitch: 0.5 },
  windows: { at: [-0.144, H0 + 0.1, Z0 + OZ], r: 0.105, yaw: -0.3, pitch: 0.12 },
  door: { at: [0, H0 + 0.1, Z0 + OZ], r: 0.14, yaw: -0.3, pitch: 0.16 },
  heating: { at: [-OX - 0.02, H0 + 0.09, Z0 + 0.11], r: 0.15, yaw: -0.95, pitch: 0.25 },
  garden: { at: [-0.06, 0.04, 0.24], r: 0.5, yaw: -0.25, pitch: 0.62 },
  tank: { at: [OX + 0.045, 0.06, Z0 + 0.12], r: 0.11, yaw: 0.5, pitch: 0.3 },
  pond: { at: [0.3, 0.01, 0.22], r: 0.1, yaw: -0.2, pitch: 0.7 },
  smart: { at: [0.1, H0 + 0.13, Z0 + OZ], r: 0.14, yaw: -0.35, pitch: 0.12 },
  carport: { at: [0.48, 0.07, -0.02], r: 0.26, yaw: -0.5, pitch: 0.4 },
  solar: { at: [0.09, H0 + TOP + 0.08, Z0 + 0.06], r: 0.2, yaw: -0.3, pitch: 0.75 },
  cellar: { at: [0.19, 0.01, Z0 + OZ + 0.05], r: 0.14, yaw: -0.45, pitch: 0.55 },
  conservatory: { at: [-OX - 0.06, H0 + 0.07, Z0 - 0.07], r: 0.19, yaw: -0.85, pitch: 0.35 },
  annex: { at: [-OX - 0.085, H0 + 0.08, Z0 - 0.07], r: 0.2, yaw: -0.85, pitch: 0.35 },
};

export class Thumbs {
  /** engine: the app's engine; M: the loaded model; round: the catalogue to photograph; onReady(id): a picture is there. */
  constructor(engine, M, round, onReady) {
    this.engine = engine;
    this.onReady = onReady;
    this.pics = new Map(); // option id -> canvas
    this.queue = [];
    try {
      this.target = new THREE.WebGLRenderTarget(SIZE, SIZE, { depthBuffer: true });
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(hex('xr-bricks-pic-bg'));
      this.scene.environment = engine.scene.environment;
      this.scene.environmentIntensity = 0.6;
      const key = new THREE.DirectionalLight(hex('xr-bricks-key-light'), 2.6);
      key.position.set(-0.8, 1.2, 0.9);
      this.scene.add(key, new THREE.HemisphereLight(hex('xr-bricks-rim-light'), hex('xr-bricks-soil'), 1.1));
      this.root = new THREE.Group();
      this.scene.add(this.root);
      this.house = new House(this.root, M, { cast: false, calm: true });
      this.camera = new THREE.PerspectiveCamera(26, 1, 0.05, 20);
      this.pixels = new Uint8Array(SIZE * SIZE * 4);
      // The bare house the parts are shown on: the cheapest walls and roof of this round.
      this.base = { walls: round.cheapest.walls.id, roof: round.cheapest.roof.id };
      for (const d of DECISIONS) for (const o of round.catalogue[d]) this.queue.push(o.id);
      for (const x of round.extras) this.queue.push(x.id);
    } catch (e) {
      console.warn('Card pictures not available', e);
      this.queue = [];
    }
  }

  get(id) { return this.pics.get(id) ?? null; }

  /** One picture per call (call it once a frame while there is something to do). */
  step() {
    const id = this.queue.shift();
    if (!id) return false;
    try { this.shoot(id); } catch (e) { console.warn('Card picture failed', id, e); this.queue = []; }
    if (!this.queue.length) this.dispose();
    return true;
  }

  shoot(id) {
    const o = OPTION[id];
    const h = this.house;
    for (const x of [...h.extras]) h.remove('extras', x);
    for (const d of DECISIONS) h.remove(d);
    const d = o.decision;
    const build = (dec, opt) => h.build(dec, opt, { animate: false });
    // What stands there besides the part itself.
    if (d === 'walls') build('walls', id);
    else if (d === 'roof') { build('walls', this.base.walls); build('roof', id); }
    else if (d === 'garden') { build('walls', this.base.walls); build('roof', this.base.roof); build('garden', id); }
    else if (d === 'extras') { build('walls', this.base.walls); build('roof', this.base.roof); build('extras', id); }
    else { build('walls', this.base.walls); build(d, id); }
    h.update(Infinity);
    h.update(0);
    const v = VIEW[d === 'extras' ? id : d];
    const dist = v.r / Math.tan(THREE.MathUtils.degToRad(13)) + v.r;
    const at = new THREE.Vector3(...v.at);
    this.camera.position.set(at.x + Math.sin(v.yaw) * Math.cos(v.pitch) * dist, at.y + Math.sin(v.pitch) * dist, at.z + Math.cos(v.yaw) * Math.cos(v.pitch) * dist);
    this.camera.lookAt(at);
    const r = this.engine.renderer;
    const xr = r.xr.enabled;
    const prev = r.getRenderTarget();
    const shadows = r.shadowMap.enabled;
    r.xr.enabled = false;
    r.shadowMap.enabled = false;
    r.setRenderTarget(this.target);
    r.render(this.scene, this.camera);
    r.readRenderTargetPixels(this.target, 0, 0, SIZE, SIZE, this.pixels);
    r.setRenderTarget(prev);
    r.shadowMap.enabled = shadows;
    r.xr.enabled = xr;
    // The target holds linear light, bottom row first: to sRGB, the right way up.
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(SIZE, SIZE);
    const lut = (this.lut ??= Uint8Array.from({ length: 256 }, (_, i) => Math.round(255 * Math.min(1, (i / 255) ** (1 / 2.2) * 1.02))));
    for (let y = 0; y < SIZE; y++) {
      const src = (SIZE - 1 - y) * SIZE * 4;
      const dst = y * SIZE * 4;
      for (let x = 0; x < SIZE * 4; x += 4) {
        img.data[dst + x] = lut[this.pixels[src + x]];
        img.data[dst + x + 1] = lut[this.pixels[src + x + 1]];
        img.data[dst + x + 2] = lut[this.pixels[src + x + 2]];
        img.data[dst + x + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.pics.set(id, canvas);
    this.onReady?.(id);
  }

  dispose() {
    if (!this.target) return;
    const h = this.house;
    for (const x of [...h.extras]) h.remove('extras', x);
    for (const d of DECISIONS) h.remove(d);
    this.root.traverse((m) => { if (m.isMesh && m.userData.ownGeo) m.geometry.dispose(); });
    h.clear.dispose();
    h.ball?.dispose();
    h.glass.dispose();
    this.target.dispose();
    this.target = null;
    this.queue = [];
  }
}
