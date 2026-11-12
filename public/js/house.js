// "Knowledge house": every correct answer builds the next part of a small house,
// every mistake knocks the last part off and leaves lasting (friendly) damage.
import * as THREE from 'three';
import { hex, color, font } from './tokens.js';
import { textPanel, faceOrigin } from './ui3d.js';
import { t } from './i18n.js';
import { sfx } from './sfx.js';
import { SPONSOR } from './content.js';

// House body: x ±0.14, z ±0.11, walls from y 0.03 to 0.21. Gable faces the player (+z).
const RIDGE_Y = 0.32;
const EAVE_X = 0.17;
const ROOF_ANGLE = Math.atan2(RIDGE_Y - 0.205, EAVE_X);
const FRONT = 0.111;
const easeOutBack = (k) => 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);

const mat = (token, extra = {}) => new THREE.MeshStandardMaterial({ color: hex(token), roughness: 0.7, ...extra });
const glow = (token, opacity = 1) => new THREE.MeshBasicMaterial({ color: hex(token), transparent: opacity < 1, opacity });

function mesh(geo, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  return m;
}

function box(w, h, d, token, x, y, z) {
  return mesh(new THREE.BoxGeometry(w, h, d), mat(token), x, y, z);
}

/** Box with rounded edges (extruded rounded rectangle with bevel), centered on its position. */
function roundedBox(w, h, d, r, token, x, y, z) {
  const s = new THREE.Shape();
  const hw = w / 2 - r;
  const hh = h / 2 - r;
  s.moveTo(-hw, -hh - r);
  s.lineTo(hw, -hh - r);
  s.quadraticCurveTo(hw + r, -hh - r, hw + r, -hh);
  s.lineTo(hw + r, hh);
  s.quadraticCurveTo(hw + r, hh + r, hw, hh + r);
  s.lineTo(-hw, hh + r);
  s.quadraticCurveTo(-hw - r, hh + r, -hw - r, hh);
  s.lineTo(-hw - r, -hh);
  s.quadraticCurveTo(-hw - r, -hh - r, -hw, -hh - r);
  const geo = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, d - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r * 0.6, bevelSegments: 3, curveSegments: 4 });
  geo.center();
  return mesh(geo, mat(token), x, y, z);
}

function group(...children) {
  const g = new THREE.Group();
  children.forEach((c) => g.add(c));
  return g;
}

// ---------- parts ----------

function foundation() {
  return group(
    roundedBox(0.31, 0.03, 0.25, 0.006, 'xr-house-concrete', 0, 0.015, 0),
    roundedBox(0.1, 0.012, 0.035, 0.003, 'xr-house-concrete', 0, 0.006, 0.14),
    roundedBox(0.08, 0.012, 0.025, 0.003, 'xr-house-stone', 0, 0.018, 0.133),
  );
}

function walls(y) {
  const g = group(roundedBox(0.28, 0.09, 0.22, 0.004, 'xr-house-wall', 0, y, 0));
  for (const x of [-0.14, 0.14]) {
    for (const z of [-0.11, 0.11]) g.add(box(0.014, 0.09, 0.014, 'xr-house-frame', x, y, z));
  }
  if (y > 0.1) g.add(roundedBox(0.295, 0.01, 0.235, 0.003, 'xr-house-frame', 0, 0.212, 0));
  return g;
}

function door() {
  return group(
    roundedBox(0.072, 0.112, 0.01, 0.003, 'xr-house-frame', 0, 0.088, FRONT + 0.002),
    box(0.056, 0.1, 0.006, 'xr-house-wood', 0, 0.084, FRONT + 0.007),
    box(0.04, 0.034, 0.003, 'xr-house-soil', 0, 0.112, FRONT + 0.011),
    box(0.04, 0.034, 0.003, 'xr-house-soil', 0, 0.062, FRONT + 0.011),
    mesh(new THREE.SphereGeometry(0.005, 16, 12), mat('xr-house-light', { metalness: 0.6, roughness: 0.3 }), 0.019, 0.084, FRONT + 0.014),
    (() => { const c = roundedBox(0.1, 0.008, 0.035, 0.003, 'xr-house-roof-dark', 0, 0.152, FRONT + 0.016); c.rotation.x = 0.25; return c; })(),
  );
}

function windowAt(x) {
  const y = 0.168;
  const z = FRONT;
  return group(
    roundedBox(0.062, 0.062, 0.01, 0.003, 'xr-house-frame', x, y, z + 0.002),
    box(0.048, 0.048, 0.004, 'xr-house-glass', x, y, z + 0.007),
    box(0.004, 0.048, 0.004, 'xr-house-frame', x, y, z + 0.009),
    box(0.048, 0.004, 0.004, 'xr-house-frame', x, y, z + 0.009),
    roundedBox(0.076, 0.008, 0.022, 0.002, 'xr-house-frame', x, y - 0.035, z + 0.008),
    box(0.022, 0.062, 0.004, 'xr-house-roof-dark', x - 0.044, y, z + 0.004),
    box(0.022, 0.062, 0.004, 'xr-house-roof-dark', x + 0.044, y, z + 0.004),
  );
}

function gable() {
  const shape = new THREE.Shape([new THREE.Vector2(-0.14, 0), new THREE.Vector2(0.14, 0), new THREE.Vector2(0, 0.1)]);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: false }).translate(0, 0.217, -0.11);
  const ring = mesh(new THREE.TorusGeometry(0.02, 0.004, 12, 32), mat('xr-house-frame'), 0, 0.262, FRONT + 0.002);
  const pane = mesh(new THREE.CircleGeometry(0.019, 32), mat('xr-house-glass'), 0, 0.262, FRONT + 0.001);
  return group(new THREE.Mesh(geo, mat('xr-house-attic')), ring, pane);
}

/** One roof side made of staggered shingle tiles (instanced). side: -1 left, +1 right. */
function roofSide(side) {
  const rows = 5;
  const tiles = 7;
  const geo = new THREE.BoxGeometry(0.052, 0.01, 0.036);
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
  const inst = new THREE.InstancedMesh(geo, m, rows * tiles);
  const base = new THREE.Color(hex('xr-house-roof'));
  const dark = new THREE.Color(hex('xr-house-roof-dark'));
  const dummy = new THREE.Object3D();
  let n = 0;
  for (let r = 0; r < rows; r++) {
    const s = 0.024 + r * 0.043; // distance from the ridge along the slope
    for (let i = 0; i < tiles; i++) {
      const zz = -0.135 + (i + (r % 2 ? 0.5 : 0)) * 0.039;
      if (zz > 0.14) continue;
      dummy.position.set(side * s * Math.cos(ROOF_ANGLE), RIDGE_Y + 0.006 - s * Math.sin(ROOF_ANGLE) + r * 0.0015, zz);
      dummy.rotation.set(0, 0, -side * ROOF_ANGLE);
      dummy.updateMatrix();
      inst.setMatrixAt(n, dummy.matrix);
      inst.setColorAt(n, (r + i) % 3 === 0 ? dark : base);
      n++;
    }
  }
  inst.count = n;
  // Underlay so no gaps show between tiles.
  const L = Math.hypot(EAVE_X, RIDGE_Y - 0.205);
  const under = box(L, 0.008, 0.27, 'xr-house-roof-dark', side * (L / 2) * Math.cos(ROOF_ANGLE), RIDGE_Y - (L / 2) * Math.sin(ROOF_ANGLE) - 0.004, 0);
  under.rotation.z = -side * ROOF_ANGLE;
  return group(under, inst);
}

function ridgeAndGutters() {
  const ridge = mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.28, 16), mat('xr-house-roof-dark'), 0, RIDGE_Y + 0.004, 0);
  ridge.rotation.x = Math.PI / 2;
  const g = group(ridge);
  for (const side of [-1, 1]) {
    const gutter = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.27, 12), mat('xr-house-frame'), side * EAVE_X, 0.198, 0);
    gutter.rotation.x = Math.PI / 2;
    g.add(gutter, mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.17, 10), mat('xr-house-frame'), side * EAVE_X, 0.115, 0.125));
  }
  return g;
}

function chimney() {
  const g = group(roundedBox(0.04, 0.12, 0.04, 0.003, 'xr-house-brick', 0.08, 0.3, -0.05));
  for (let i = 0; i < 4; i++) g.add(box(0.042, 0.003, 0.042, 'xr-house-attic', 0.08, 0.262 + i * 0.026, -0.05));
  g.add(roundedBox(0.052, 0.01, 0.052, 0.002, 'xr-house-stone', 0.08, 0.364, -0.05));
  return g;
}

function solar() {
  const g = new THREE.Group();
  for (const s of [0.07, 0.122]) {
    for (const z of [-0.04, 0.04]) {
      const x = -s * Math.cos(ROOF_ANGLE);
      const y = RIDGE_Y + 0.02 - s * Math.sin(ROOF_ANGLE);
      const frame = box(0.052, 0.003, 0.074, 'xr-house-frame', x, y - 0.002, z);
      const cell = box(0.046, 0.004, 0.068, 'xr-house-solar', x, y, z);
      cell.material.emissive = new THREE.Color(hex('xr-accent'));
      cell.material.emissiveIntensity = 0.18;
      cell.material.metalness = 0.4;
      cell.material.roughness = 0.25;
      frame.rotation.z = ROOF_ANGLE;
      cell.rotation.z = ROOF_ANGLE;
      g.add(frame, cell);
    }
  }
  return g;
}

function tree() {
  return group(
    mesh(new THREE.CylinderGeometry(0.008, 0.014, 0.1, 14), mat('xr-house-wood'), 0.205, 0.05, -0.06),
    mesh(new THREE.IcosahedronGeometry(0.048, 2), mat('xr-house-leaf'), 0.205, 0.13, -0.06),
    mesh(new THREE.IcosahedronGeometry(0.036, 2), mat('xr-house-leaf-dark'), 0.185, 0.165, -0.045),
    mesh(new THREE.IcosahedronGeometry(0.032, 2), mat('xr-house-leaf'), 0.225, 0.158, -0.075),
  );
}

function garden() {
  const g = group(
    mesh(new THREE.IcosahedronGeometry(0.028, 2), mat('xr-house-leaf-dark'), -0.18, 0.022, 0.1),
    mesh(new THREE.IcosahedronGeometry(0.022, 2), mat('xr-house-leaf'), -0.14, 0.018, 0.15),
    mesh(new THREE.IcosahedronGeometry(0.024, 2), mat('xr-house-leaf'), 0.17, 0.02, 0.12),
  );
  const flowers = ['xr-house-flower-1', 'xr-house-flower-2', 'xr-house-flower-3'];
  [[-0.2, 0.13], [-0.16, 0.12], [-0.12, 0.18], [0.14, 0.15], [0.19, 0.1], [0.15, 0.17], [-0.19, 0.06], [0.2, 0.06]].forEach(([x, z], i) => {
    g.add(mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.02, 6), mat('xr-house-leaf-dark'), x, 0.01, z));
    g.add(mesh(new THREE.SphereGeometry(0.007, 14, 10), mat(flowers[i % 3]), x, 0.022, z));
  });
  [0.165, 0.195, 0.225].forEach((z, i) => {
    g.add(mesh(new THREE.CylinderGeometry(0.017, 0.019, 0.006, 20), mat('xr-house-stone'), i % 2 ? 0.008 : -0.008, 0.003, z));
  });
  return g;
}

function fence() {
  const g = new THREE.Group();
  for (const sign of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const x = sign * (0.06 + i * 0.024);
      g.add(box(0.008, 0.042, 0.005, 'xr-house-frame', x, 0.021, 0.185));
      const tip = mesh(new THREE.ConeGeometry(0.0057, 0.008, 4), mat('xr-house-frame'), x, 0.046, 0.185);
      tip.rotation.y = Math.PI / 4;
      g.add(tip);
    }
    g.add(box(0.105, 0.005, 0.004, 'xr-house-frame', sign * 0.108, 0.014, 0.182));
    g.add(box(0.105, 0.005, 0.004, 'xr-house-frame', sign * 0.108, 0.032, 0.182));
  }
  return g;
}

function lights() {
  const m = glow('xr-house-light', 0.85);
  const g = new THREE.Group();
  for (const x of [-0.08, 0.08]) g.add(mesh(new THREE.PlaneGeometry(0.048, 0.048), m, x, 0.168, FRONT + 0.0095));
  g.add(mesh(new THREE.CircleGeometry(0.019, 32), m, 0, 0.262, FRONT + 0.003));
  g.add(roundedBox(0.016, 0.022, 0.016, 0.002, 'xr-house-solar', 0.05, 0.125, FRONT + 0.012));
  g.add(mesh(new THREE.SphereGeometry(0.006, 14, 10), glow('xr-house-light'), 0.05, 0.125, FRONT + 0.021));
  return g;
}

function smoke() {
  const g = new THREE.Group();
  const m = glow('xr-house-smoke', 0.65);
  const puffs = [0, 1, 2, 3].map((i) => {
    const p = mesh(new THREE.IcosahedronGeometry(0.016, 2), m);
    g.add(p);
    return { p, phase: i / 4 };
  });
  let time = 0;
  g.userData.tick = (dt) => {
    time += dt;
    for (const { p, phase } of puffs) {
      const k = (time * 0.3 + phase) % 1;
      p.position.set(0.08 + Math.sin(k * 6 + phase * 4) * 0.012, 0.38 + k * 0.15, -0.05);
      p.scale.setScalar(0.6 + k * 1.3);
    }
  };
  return g;
}

// Official Echomotion signet (original PNG), preloaded once for the sponsor flag.
const LOGO = new Image();
const logoReady = new Promise((resolve) => {
  LOGO.onload = resolve;
  LOGO.onerror = resolve;
});
LOGO.src = 'assets/echomotion-logo.png';

/** Paints the flag in Echomotion style: dark field, signet, "ECHOMOTION.AI" wordmark. */
function paintFlag(ctx, w, h) {
  ctx.fillStyle = color('xr-house-flag');
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = color('xr-house-flag-stripe');
  ctx.fillRect(0, h - 14, w, 14);
  const logoSize = h * 0.7;
  const pad = h * 0.13;
  if (LOGO.complete && LOGO.naturalWidth) ctx.drawImage(LOGO, pad, (h - 14 - logoSize) / 2, logoSize, logoSize);
  const left = pad * 2 + logoSize;
  const maxW = w - left - pad;
  const word = SPONSOR.name.toUpperCase();
  const tld = '.AI';
  let px = 120;
  do {
    ctx.font = font('black', px);
    px -= 3;
  } while (ctx.measureText(word + tld).width > maxW && px > 20);
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  const y = (h - 14) / 2 + 4;
  ctx.fillStyle = color('xr-house-flag-text');
  ctx.fillText(word, left, y);
  ctx.fillStyle = color('xr-house-flag-accent');
  ctx.fillText(tld, left + ctx.measureText(word).width, y);
}

function flag() {
  // Flagpole in the garden, so it stands no matter how much of the house exists.
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 300;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  paintFlag(ctx, canvas.width, canvas.height);
  logoReady.then(() => {
    paintFlag(ctx, canvas.width, canvas.height);
    tex.needsUpdate = true;
  });
  const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.0667, 10, 1), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  banner.geometry.translate(0.1, 0, 0);
  banner.position.set(-0.21, 0.405, -0.07);
  const pole = mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.44, 12), mat('xr-house-frame'), -0.21, 0.22, -0.07);
  const knob = mesh(new THREE.SphereGeometry(0.008, 16, 12), mat('xr-house-flag-accent'), -0.21, 0.445, -0.07);
  const g = group(pole, knob, banner);
  const pos = banner.geometry.attributes.position;
  const base = Float32Array.from(pos.array);
  let time = 0;
  g.userData.tick = (dt) => {
    time += dt;
    // Gentle wave, stronger towards the free end so the logo stays readable.
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3];
      pos.array[i * 3 + 2] = Math.sin(time * 3.5 - x * 30) * x * 0.08;
    }
    pos.needsUpdate = true;
  };
  g.userData.flag = true;
  return g;
}

// Build order in 6 stages: one stage per correct answer, so a 6-question round can finish
// the house. Each entry creates fresh objects (removed stages get disposed).
const STAGES = [
  [foundation, () => walls(0.075)],
  [() => walls(0.165), door, () => windowAt(-0.08), () => windowAt(0.08)],
  [gable, () => roofSide(-1), () => roofSide(1)],
  [ridgeAndGutters, chimney, solar],
  [tree, garden, fence],
  [lights, smoke],
];

export class KnowledgeHouse {
  /** i18n key of the sentence the quiz intros add about it. */
  get introKey() {
    return 'houseIntro';
  }

  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.model = new THREE.Group();
    this.group.add(this.model);

    this.built = [];
    this.damage = [];
    this.stars = 0;
    this.tilt = 0;
    this.dry = 0;
    this.time = 0;

    this.grassMat = mat('xr-house-grass');
    this.grassColor = new THREE.Color(hex('xr-house-grass'));
    this.dryColor = new THREE.Color(hex('xr-house-grass-dry'));
    const soil = mat('xr-house-soil');
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.27, 0.05, 64), [soil, this.grassMat, soil]);
    plinth.position.y = -0.025;
    this.model.add(plinth);
    // Pebbles around the island rim.
    const pebble = mat('xr-house-stone');
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const p = mesh(new THREE.IcosahedronGeometry(0.012 + (i % 3) * 0.004, 1), pebble, Math.cos(a) * 0.262, -0.03 + (i % 2) * 0.012, Math.sin(a) * 0.262);
      p.scale.y = 0.6;
      this.model.add(p);
    }

    this.label = textPanel(0.46, 0.09, () => [{ text: this.labelText(), size: 'xr-text-sm', weight: 'bold' }]);
    this.label.position.set(0, -0.15, 0.2);
    this.label.rotation.x = -0.35;
    this.group.add(this.label);
    scene.onUpdate((dt) => this.tick(dt));
  }

  /**
   * Puts the house on the player's left, slightly below eye level, facing them.
   * On a portrait phone screen (browser preview) it goes below the quiz instead.
   */
  placeBeside(eye) {
    this.eye = eye;
    const engine = this.scene.engine;
    this.portrait = !engine.isXR && engine.camera.aspect < 0.9;
    if (this.portrait) {
      this.group.position.set(0, eye - 1.7, -1.4);
      this.group.rotation.set(0, 0, 0);
    } else if (engine.touchUI) {
      // Phones in landscape: level with the question at the left edge; the question and the
      // answers fill the screen's height (the house may stand partly outside).
      this.group.position.set(-0.98, eye - 0.12, -1.2);
      faceOrigin(this.group);
    } else {
      this.group.position.set(-0.97, eye - 0.32, -1.0);
      faceOrigin(this.group);
    }
    this.group.scale.setScalar(1.25);
    this.group.userData.noFit = engine.touchUI && !this.portrait;
  }

  get pieces() {
    return this.built.filter((o) => !o.userData.flag).length;
  }

  labelText() {
    const stars = this.stars ? `  ·  +${this.stars} ${t('houseStars')}` : '';
    return `${t('houseName')}: ${this.pieces}/${STAGES.length} ${t('houseStages')}  ·  ${this.damage.length} ${t(this.damage.length === 1 ? 'houseDamageOne' : 'houseDamage')}${stars}`;
  }

  reset() {
    [...this.built, ...this.damage].forEach((o) => this.disposeObj(o));
    this.built = [];
    this.damage = [];
    this.stars = 0;
    this.tilt = 0;
    this.dry = 0;
    this.model.rotation.z = 0;
    this.grassMat.color.copy(this.grassColor);
    this.label.redraw();
  }

  /** True while an Echomotion flag stands (raised by a bonus answer or the final stage). */
  get hasFlag() {
    return this.built.some((o) => o.userData.flag || o.children.some((c) => c.userData.flag));
  }

  /**
   * Correct answer: build the next stage. The sponsor flag is raised early by a bonus answer
   * and is always part of the finished house.
   */
  good({ bonus = false } = {}) {
    if (bonus && !this.hasFlag) this.addPart(flag());
    const idx = this.pieces;
    if (idx < STAGES.length) {
      const last = idx === STAGES.length - 1;
      const parts = STAGES[idx].map((make) => make());
      if (last && !this.hasFlag) parts.push(flag());
      this.addStage(parts);
      if (idx === STAGES.length - 1) this.delay(0.6, () => this.scene.burst(this.worldPoint(0, 0.45, 0), 'xr-warning', 40));
    } else {
      this.stars += 1;
      this.scene.burst(this.worldPoint(0, 0.5, 0), 'xr-warning', 18);
    }
    sfx.build();
    this.label.redraw();
  }

  /** Mistake: the last stage falls off and the house takes lasting damage. */
  bad() {
    const last = this.built.pop();
    if (last) this.dropPart(last);
    this.addDamage(this.damage.length);
    sfx.crash();
    this.label.redraw();
  }

  /** Rating key for the results screen. */
  rating() {
    if (this.pieces === STAGES.length && this.damage.length === 0) return 'houseDream';
    if (this.pieces >= 4) return 'houseCozy';
    if (this.pieces >= 2) return 'houseSite';
    return 'houseRuin';
  }

  get complete() {
    return this.pieces === STAGES.length;
  }

  // ---------- internals ----------

  delay(sec, fn) {
    this.scene.delay(sec, fn);
  }

  /** Adds all parts of a stage as one removable group; the parts pop in one after another. */
  addStage(parts) {
    const stage = group(...parts);
    this.model.add(stage);
    this.built.push(stage);
    this.onPart?.(stage); // e.g. the quiz turns on shadows for it
    parts.forEach((part, i) => {
      part.scale.setScalar(0.01);
      this.delay(i * 0.14, () => this.animateIn(part));
    });
  }

  animateIn(obj) {
    obj.scale.setScalar(1);
    obj.updateMatrixWorld(true);
    const box3 = new THREE.Box3().setFromObject(obj);
    const center = box3.getCenter(new THREE.Vector3());
    obj.position.y += 0.12;
    obj.scale.setScalar(0.01);
    this.scene.tween(0.45, (k) => {
      obj.scale.setScalar(Math.max(0.01, easeOutBack(k)));
      obj.position.y = 0.12 * (1 - k);
    }, { ease: (k) => k });
    this.scene.burst(center.add(new THREE.Vector3(0, 0.04, 0)), 'xr-success', 8);
  }

  addPart(obj) {
    this.model.add(obj);
    this.built.push(obj);
    this.onPart?.(obj);
    const box3 = new THREE.Box3().setFromObject(obj);
    const center = box3.getCenter(new THREE.Vector3());
    obj.position.y += 0.12;
    obj.scale.setScalar(0.01);
    this.scene.tween(0.45, (k) => {
      obj.scale.setScalar(Math.max(0.01, easeOutBack(k)));
      obj.position.y = 0.12 * (1 - k);
    }, { ease: (k) => k });
    this.scene.burst(center.add(new THREE.Vector3(0, 0.04, 0)), 'xr-success', 8);
  }

  dropPart(obj) {
    const start = obj.position.clone();
    const spin = (Math.random() - 0.5) * 3;
    const side = Math.random() < 0.5 ? -1 : 1;
    const mats = [];
    obj.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.transparent = true; mats.push(m); }); });
    this.scene.tween(0.9, (k) => {
      obj.position.set(start.x + side * 0.12 * k, start.y + 0.06 * k - 0.6 * k * k, start.z + 0.1 * k);
      obj.rotation.z = spin * k;
      obj.rotation.x = spin * 0.5 * k;
      mats.forEach((m) => { m.opacity = 1 - k * k; });
    }, { ease: (k) => k, onDone: () => this.disposeObj(obj) });
  }

  /** Friendly damage: weeds, mud puddles, dry lawn, then the house gets crooked. */
  addDamage(n) {
    const kind = ['weeds', 'mud', 'dry'][n] ?? 'tilt';
    let obj = null;
    if (kind === 'weeds') obj = this.weeds();
    if (kind === 'mud') obj = this.mud();
    if (kind === 'dry') this.dry = 1;
    if (kind === 'tilt') this.tilt = Math.min(0.3, this.tilt + 0.07);
    const marker = obj ?? new THREE.Group();
    marker.userData.kind = kind;
    this.model.add(marker);
    this.damage.push(marker);
  }

  weeds() {
    const m = mat('xr-house-leaf-dark');
    const g = new THREE.Group();
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + 0.3;
      const hgt = 0.028 + (i % 3) * 0.01;
      const w = mesh(new THREE.ConeGeometry(0.008, hgt, 8), m, Math.cos(a) * 0.225, hgt / 2, Math.sin(a) * 0.225);
      w.rotation.z = ((i % 5) - 2) * 0.15;
      g.add(w);
    }
    return g;
  }

  mud() {
    const m = mat('xr-house-mud', { roughness: 0.25 });
    const g = new THREE.Group();
    [[-0.17, -0.08, 0.035], [0.15, 0.06, 0.028], [-0.08, 0.17, 0.022]].forEach(([x, z, r]) => {
      const puddle = mesh(new THREE.CircleGeometry(r, 32), m, x, 0.0015, z);
      puddle.rotation.x = -Math.PI / 2;
      puddle.scale.y = 0.7;
      g.add(puddle);
    });
    return g;
  }

  worldPoint(x, y, z) {
    return this.model.localToWorld(new THREE.Vector3(x, y, z));
  }

  disposeObj(obj) {
    obj.removeFromParent();
    obj.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose(); m.dispose(); });
    });
  }

  tick(dt) {
    this.time += dt;
    const engine = this.scene.engine;
    if ((!engine.isXR && engine.camera.aspect < 0.9) !== this.portrait) this.placeBeside(this.eye);
    this.model.rotation.z += (this.tilt - this.model.rotation.z) * Math.min(1, dt * 3);
    this.model.rotation.y = Math.sin(this.time * 0.4) * 0.12;
    if (this.dry) this.grassMat.color.lerp(this.dryColor, Math.min(1, dt * 1.5));
    this.model.traverse((o) => o.userData.tick?.(dt));
  }
}

