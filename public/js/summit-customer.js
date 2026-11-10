// "Gipfelgespräch" customers: six stylized characters from Blender (blender/build_summit.py,
// assets/models/summit-customer.glb), recolored from the --xr-summit-* tokens of their look.
// The figure is alive: it breathes and shifts its weight, blinks, moves its brows, shows its mood
// with its body (arms crossed and a tilted head when skeptical, hands clasped when reserved, a
// nod when interested, open hands and a big smile when ready to buy), talks with its mouth and a
// small hand gesture when a new line comes, reacts to your reply, and shakes hands and cheers at
// the summit. The mouth also follows the trust: the more trust, the friendlier the face.
// The same class makes the close-up portrait next to the speech bubble (cut off at the chest).
import * as THREE from 'three';
import { hex, color } from './tokens.js';

const LID_OPEN = -2.45; // eyelid rotation (rad) for open eyes; 0 = closed
const lerp = THREE.MathUtils.lerp;
const damp = (cur, want, rate, dt) => cur + (want - cur) * (1 - Math.exp(-rate * dt));

// Target rotations [x, y, z] of upper arms and forearms (R is the figure's right hand, at -x).
const POSES = {
  rest: { armR: [0.04, 0, -0.1], foreR: [-0.25, 0, 0], armL: [0.04, 0, 0.1], foreL: [-0.25, 0, 0] },
  clasp: { armR: [-0.3, 0, 0.12], foreR: [-1.0, -0.35, 0.55], armL: [-0.3, 0, -0.12], foreL: [-1.0, 0.35, -0.55] },
  low: { armR: [-0.06, 0, 0.1], foreR: [-0.5, -0.3, 0.62], armL: [-0.06, 0, -0.1], foreL: [-0.5, 0.3, -0.62] },
  cross: { armR: [-0.72, 0, 0.2], foreR: [0.25, -0.62, 1.48], armL: [-0.66, 0, -0.2], foreL: [0.1, 0.62, -1.5] },
  open: { armR: [-0.32, 0, -0.1], foreR: [-1.15, 0, -0.12], armL: [-0.32, 0, 0.1], foreL: [-1.15, 0, 0.12] },
  gesture: { armR: [-0.35, 0, -0.15], foreR: [-1.25, 0, -0.25] },
  wave: { armR: [0.1, 0, -2.45], foreR: [0, 0, -0.45] },
  shake: { armR: [-1.0, 0, 0.22], foreR: [-0.35, 0, 0] },
  cheer: { armR: [0.1, 0, -2.2], foreR: [0, 0, -0.6], armL: [0.1, 0, 2.2], foreL: [0, 0, 0.6] },
};

// Body language per mood: pose, mouth (null: from the trust), brows [left raise, left frown,
// right raise, right frown] (a frown pulls the inner end down), eyelids (1 open), head tilt and
// lean, a nod.
const MOODS = {
  neutral: { pose: 'rest', mouth: null, brows: [0, 0, 0, 0], lids: 1, tilt: 0, lean: 0 },
  interested: { pose: 'clasp', mouth: 'Smile', brows: [0.005, -0.06, 0.005, -0.06], lids: 1, tilt: 0.07, lean: 0.06, nod: true },
  reserved: { pose: 'low', mouth: 'Neutral', brows: [0, 0.06, 0, 0.06], lids: 0.9, tilt: 0, lean: -0.02 },
  skeptical: { pose: 'cross', mouth: 'Skeptic', brows: [0.009, -0.12, -0.003, 0.28], lids: 0.72, tilt: 0.17, lean: -0.04 },
  ready: { pose: 'open', mouth: 'Open', brows: [0.007, -0.1, 0.007, -0.1], lids: 0.86, tilt: -0.05, lean: 0.07, nod: true },
};

/** Per customer: women or men (shared head and arms) and the style of the flat portrait. */
const STYLE = {
  albers: { hair: 'bun', glasses: true, f: true },
  demir: { hair: 'short', beard: true },
  ferri: { hair: 'curly', moustache: true, chef: true },
  wagner: { hair: 'long', f: true, scarf: true },
  petrov: { hair: 'bob', f: true },
  olsen: { hair: 'quiff', tie: true },
};

/** Per-customer materials from the look's tokens (vertex colors carry the baked occlusion). */
function materials(look) {
  const m = (c, rough = 0.6, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: rough, vertexColors: true, ...extra });
  const c = (token) => new THREE.Color(hex(token));
  const trim = c(look.suit).multiplyScalar(0.78);
  const line = c(look.skin).multiplyScalar(0.8);
  return {
    CustSuit: m(c(look.suit), 0.72),
    CustTrim: m(trim, 0.7),
    CustShirt: m(c(look.shirt), 0.6),
    CustSkin: m(c(look.skin), 0.5),
    CustHair: m(c(look.hair_c), 0.5),
    CustPants: m(c(look.pants), 0.72),
    CustShoe: m(c(look.shoe), 0.3),
    CustEye: m(c('xr-summit-eye'), 0.15),
    CustIris: m(c(look.iris), 0.2),
    CustWhite: m(c('xr-summit-eye-light'), 0.3),
    CustShine: new THREE.MeshBasicMaterial({ color: hex('xr-summit-eye-light'), toneMapped: false }),
    CustMouth: m(c('xr-summit-mouth'), 0.5),
    CustLips: m(c(look.lips), 0.4),
    CustTongue: m(c('xr-summit-tongue'), 0.5),
    CustCheek: m(c('xr-summit-cheek'), 0.6, { transparent: true, opacity: 0.7 }),
    CustLine: m(line, 0.6),
    CustAccent: m(c(look.accent), 0.6),
    CustGlass: m(c('xr-summit-glasses'), 0.3, { metalness: 0.6 }),
    CustGold: m(c('xr-summit-gold'), 0.25, { metalness: 1 }),
  };
}

/** Drops fragments below a world height (the portrait shows the head and the chest only). */
function cutBelow(mat, cut) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPortraitCut = cut;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vPortraitY;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvPortraitY = (modelMatrix * vec4(transformed, 1.0)).y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uPortraitCut;\nvarying float vPortraitY;')
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vPortraitY < uPortraitCut) discard;');
  };
  mat.customProgramCacheKey = () => 'summit-portrait';
  mat.needsUpdate = true;
}

export class CustomerFigure {
  /**
   * gltf: summit-customer.glb, customer: an entry of CUSTOMERS. opts.size: height in meters,
   * opts.cut: { value } world height to cut at (portrait).
   */
  constructor(gltf, customer, { size = 0.44, cut = null } = {}) {
    this.customer = customer;
    this.group = new THREE.Group();
    this.group.userData.noFit = true;
    this.inner = new THREE.Group();
    this.group.add(this.inner);
    this.mats = materials(customer.look);
    if (cut) Object.values(this.mats).forEach((m) => cutBelow(m, cut));
    const key = customer.key;
    // The shared head and arms of all women or all men, with this customer's body and hair.
    const g = STYLE[key]?.f ? 'f' : 'm';
    const base = gltf?.scene.getObjectByName(`Base_${g}`);
    const own = gltf?.scene.getObjectByName(`Cust_${key}`);
    this.model = new THREE.Group();
    if (base && own) {
      const b = base.clone(true);
      const o = own.clone(true);
      b.position.set(0, 0, 0);
      o.position.set(0, 0, 0);
      this.model.add(b, o);
      const hair = o.getObjectByName(`${key}_Hair`);
      const head = b.getObjectByName(`${g}_Head`);
      if (hair && head) {
        head.add(hair);
        hair.position.set(0, 0, 0);
        hair.rotation.set(0, 0, 0);
      }
    } else this.model.add(new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.5, 6, 12), this.mats.CustSuit));
    this.inner.add(this.model);
    this.inner.scale.setScalar(base ? size : size * 0.5);
    this.model.traverse((o) => {
      if (!o.isMesh) return;
      o.material = this.mats[o.material.name] ?? o.material;
      o.castShadow = !cut;
      o.userData.noFit = true;
    });
    const n = (part) => this.model.getObjectByName(`${g}_${part}`);
    this.head = n('Head');
    this.lids = [n('LidL'), n('LidR')].filter(Boolean);
    this.brows = [n('BrowL'), n('BrowR')].filter(Boolean);
    this.arms = { armR: n('ArmR'), foreR: n('ForeR'), armL: n('ArmL'), foreL: n('ForeL') };
    this.mouths = {};
    for (const k of ['Neutral', 'Smile', 'Open', 'Skeptic', 'Talk']) {
      const o = n(`Mouth${k}`);
      if (o) { this.mouths[k] = o; o.visible = false; }
    }
    this.browBase = this.brows.map((b) => b.position.clone());
    this.headBase = this.head?.rotation.clone() ?? new THREE.Euler();
    this.cur = {};
    for (const k of Object.keys(this.arms)) this.cur[k] = [...POSES.rest[k]];
    Object.assign(this, {
      time: Math.random() * 10, mood: 'neutral', trust: 20, talkT: 0, gestureT: 0, nodT: 0, shakeT: 0, frownT: 0, happyT: 0,
      waveT: 0, handT: 0, cheerT: 0, blinkT: 1 + Math.random() * 2, blink: 0, lidOpen: 1, tilt: 0, lean: 0, turn: 0, mouthNow: null,
    });
    this.setMood('neutral');
  }

  /** The mood the customer shows with the body (the AI only reads the words). */
  setMood(mood) { this.mood = MOODS[mood] ? mood : 'neutral'; if (MOODS[this.mood].nod) this.nodT = 1.1; }

  /** Trust 0..100: the resting mouth (when the mood does not set one). */
  setTrust(t) { this.trust = t; }

  /** A new line: the mouth talks for sec seconds, with a little hand gesture. */
  say(sec = 2.2) { this.talkT = sec; this.gestureT = MOODS[this.mood].pose === 'cross' ? 0 : 1.6; }

  /** Reaction to the reply: 'good' | 'ok' | 'bad'. */
  react(kind) {
    if (kind === 'good') { this.nodT = 1.2; this.happyT = 2.2; }
    else if (kind === 'ok') this.nodT = 0.7;
    else { this.shakeT = 1.3; this.frownT = 2.4; }
  }

  wave(sec = 2.2) { this.waveT = sec; this.happyT = sec; }
  handshake(sec = 2.6) { this.handT = sec; this.happyT = sec + 1; }
  cheer(sec = 2.5) { this.cheerT = sec; this.happyT = sec + 1; }

  /** Which mouth now: talking, reactions, the mood or the trust. */
  mouthFor() {
    if (this.talkT > 0 && Math.sin(this.time * 19) + Math.sin(this.time * 11.3) > 0.2) return 'Talk';
    if (this.cheerT > 0 || this.handT > 0) return 'Open';
    if (this.frownT > 0) return 'Skeptic';
    if (this.happyT > 0) return 'Smile';
    const m = MOODS[this.mood].mouth;
    if (m) return m;
    return this.trust >= 60 ? 'Smile' : this.trust >= 30 ? 'Neutral' : 'Skeptic';
  }

  tick(dt) {
    this.time += dt;
    const t = this.time;
    for (const k of ['talkT', 'gestureT', 'nodT', 'shakeT', 'frownT', 'happyT', 'waveT', 'handT', 'cheerT']) this[k] = Math.max(0, this[k] - dt);
    const mood = MOODS[this.mood];
    // Arms: the mood's pose, with gestures, waving, the handshake or cheering on top.
    let pose = POSES[mood.pose];
    if (this.frownT > 0.3) pose = POSES.cross;
    const over = this.cheerT > 0 ? POSES.cheer : this.handT > 0 ? POSES.shake : this.waveT > 0 ? POSES.wave : this.gestureT > 0 ? POSES.gesture : null;
    for (const k of Object.keys(this.arms)) {
      const want = (over && over[k]) ?? pose[k] ?? POSES.rest[k];
      const c = this.cur[k];
      for (let i = 0; i < 3; i++) c[i] = damp(c[i], want[i], over ? 9 : 6, dt);
      const o = this.arms[k];
      if (!o) continue;
      o.rotation.set(c[0], c[1], c[2]);
    }
    // Lively details on top of the poses.
    if (this.arms.foreR) {
      if (this.waveT > 0) this.arms.foreR.rotation.z += Math.sin(t * 11) * 0.35;
      if (this.handT > 0) this.arms.foreR.rotation.x += Math.sin(t * 14) * 0.14;
      if (this.gestureT > 0 && !this.waveT) this.arms.foreR.rotation.x += Math.sin(t * 5) * 0.12;
    }
    if (this.cheerT > 0) {
      for (const k of ['foreR', 'foreL']) if (this.arms[k]) this.arms[k].rotation.z += Math.sin(t * 13 + (k === 'foreL' ? 1 : 0)) * 0.2;
    }
    // Body: breathing, weight shift, lean, a hop of joy, turning to Echo for the handshake.
    this.lean = damp(this.lean, (this.happyT > 0 ? 0.04 : 0) + mood.lean, 4, dt);
    this.turn = damp(this.turn, this.handT > 0 ? -0.55 : 0, 4, dt);
    const breathe = Math.sin(t * 1.9);
    const shift = Math.sin(t * 0.55);
    this.inner.rotation.set(this.lean, this.turn, shift * 0.025);
    this.inner.position.set(shift * 0.004, this.cheerT > 0 ? Math.abs(Math.sin(t * 7)) * 0.03 : 0, 0);
    this.model.scale.set(1 + breathe * 0.004, 1 + breathe * 0.007, 1 + breathe * 0.004);
    // Head: tilt, nod, shake, small looks around.
    if (this.head) {
      this.tilt = damp(this.tilt, this.frownT > 0 ? 0.12 : mood.tilt, 5, dt);
      const nod = this.nodT > 0 ? Math.sin(this.nodT * 13) * 0.16 * Math.min(1, this.nodT) : 0;
      const shake = this.shakeT > 0 ? Math.sin(this.shakeT * 17) * 0.28 * Math.min(1, this.shakeT) : 0;
      this.head.rotation.set(this.headBase.x + nod + Math.sin(t * 0.8) * 0.03, this.headBase.y + shake + Math.sin(t * 0.47) * 0.12, this.headBase.z + this.tilt + Math.sin(t * 0.63) * 0.03);
    }
    // Eyes: blinking, the mood's lids (half closed when skeptical, a happy squint).
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blink = 0.13; this.blinkT = (Math.random() < 0.2 ? 0.25 : 2 + Math.random() * 3); }
    this.blink = Math.max(0, this.blink - dt);
    const lidWant = this.blink > 0 ? 0 : this.happyT > 0 && !this.frownT ? 0.86 : this.frownT > 0 ? 0.7 : mood.lids;
    this.lidOpen = this.blink > 0 ? 0 : damp(this.lidOpen, lidWant, 14, dt);
    for (const l of this.lids) l.rotation.x = LID_OPEN * this.lidOpen;
    // Brows.
    const b = this.happyT > 0 && !this.frownT ? [0.006, -0.08, 0.006, -0.08] : this.frownT > 0 ? [-0.002, 0.3, -0.002, 0.3] : mood.brows;
    this.brows.forEach((br, i) => {
      const base = this.browBase[i];
      const dy = b[i * 2] + (this.talkT > 0 ? Math.max(0, Math.sin(t * 6)) * 0.002 : 0);
      br.position.y = damp(br.position.y, base.y + dy, 10, dt);
      br.rotation.z = damp(br.rotation.z, b[i * 2 + 1] * (i === 0 ? 1 : -1), 10, dt);
    });
    // Mouth.
    const mouth = this.mouthFor();
    if (mouth !== this.mouthNow) {
      this.mouthNow = mouth;
      for (const [k, o] of Object.entries(this.mouths)) o.visible = k === mouth;
    }
  }

  /** World position of the head (for Echo's eyes). */
  headWorld(out = new THREE.Vector3()) {
    return (this.head ?? this.group).getWorldPosition(out);
  }

  dispose() {
    this.group.removeFromParent();
    Object.values(this.mats).forEach((m) => m.dispose());
  }
}

// ---------- the flat portrait for the panels ----------

/** A flat portrait of a customer (canvas) in the same look as the 3D figure. */
export function drawAvatar(ctx, x, y, r, customer) {
  const look = customer.look;
  const st = STYLE[customer.key] ?? {};
  const fill = (token) => { ctx.fillStyle = color(token); };
  const ell = (cx, cy, rx, ry, rot = 0) => { ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2); ctx.fill(); };
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  fill('xr-summit-sky-mid');
  ctx.fill();
  ctx.clip();
  // Long hair behind the shoulders.
  fill(look.hair_c);
  if (st.hair === 'long') { ell(x, y + r * 0.15, r * 0.62, r * 0.7); }
  // Shoulders and clothes.
  fill(look.suit);
  ell(x, y + r * 1.05, r * 0.82, r * 0.5);
  fill(look.shirt);
  ctx.beginPath();
  ctx.moveTo(x - r * 0.16, y + r * 0.58);
  ctx.lineTo(x + r * 0.16, y + r * 0.58);
  ctx.lineTo(x, y + r * 0.92);
  ctx.closePath();
  ctx.fill();
  if (st.tie) { fill(look.accent); ctx.fillRect(x - r * 0.04, y + r * 0.62, r * 0.08, r * 0.3); }
  if (st.scarf) { fill(look.accent); ell(x, y + r * 0.6, r * 0.32, r * 0.11); }
  if (st.chef) { fill(look.accent); ell(x, y + r * 0.62, r * 0.12, r * 0.08); }
  // Hair behind the head (the bob, the bun on top).
  fill(look.hair_c);
  if (st.hair === 'bob') ell(x, y + r * 0.02, r * 0.56, r * 0.58);
  if (st.hair === 'bun') ell(x, y - r * 0.62, r * 0.2, r * 0.17);
  // Head and ears.
  fill(look.skin);
  ell(x - r * 0.45, y + r * 0.0, r * 0.08, r * 0.12);
  ell(x + r * 0.45, y + r * 0.0, r * 0.08, r * 0.12);
  ell(x, y - r * 0.02, r * 0.46, r * 0.48);
  // Hair on top.
  fill(look.hair_c);
  if (st.hair === 'curly') {
    for (let i = 0; i < 11; i++) {
      const a = Math.PI * (1.0 + (i / 10));
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * r * 0.44, y - r * 0.1 + Math.sin(a) * r * 0.46, r * 0.13, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.beginPath();
    ctx.ellipse(x, y - r * 0.2, r * 0.5, r * 0.36, 0, Math.PI, Math.PI * 2);
    ctx.fill();
    if (st.hair === 'bun') ell(x + r * 0.08, y - r * 0.33, r * 0.34, r * 0.12, -0.25);
    if (st.hair === 'bob') ell(x + r * 0.1, y - r * 0.3, r * 0.38, r * 0.13, -0.3);
    if (st.hair === 'long') { ell(x - r * 0.12, y - r * 0.33, r * 0.26, r * 0.1, 0.3); ell(x + r * 0.12, y - r * 0.33, r * 0.26, r * 0.1, -0.3); }
    if (st.hair === 'quiff') ell(x + r * 0.05, y - r * 0.44, r * 0.3, r * 0.14, -0.2);
    if (st.hair === 'short') ell(x, y - r * 0.4, r * 0.34, r * 0.1);
  }
  if (st.beard) {
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.12, r * 0.42, r * 0.34, 0, 0.05 * Math.PI, 0.95 * Math.PI);
    ctx.fill();
  }
  // Eyes with highlights, cheeks, mouth, moustache, glasses.
  for (const s of [-1, 1]) {
    fill('xr-summit-eye-light');
    ell(x + s * r * 0.17, y - r * 0.03, r * 0.1, r * 0.12);
    fill(look.iris);
    ell(x + s * r * 0.17, y - r * 0.02, r * 0.07, r * 0.085);
    fill('xr-summit-eye');
    ell(x + s * r * 0.17, y - r * 0.02, r * 0.038, r * 0.045);
    fill('xr-summit-eye-light');
    ell(x + s * r * 0.17 + r * 0.03, y - r * 0.06, r * 0.018, r * 0.018);
    fill('xr-summit-cheek');
    ell(x + s * r * 0.3, y + r * 0.13, r * 0.07, r * 0.045);
  }
  ctx.strokeStyle = color(st.f ? look.lips : 'xr-summit-mouth');
  ctx.lineWidth = r * (st.f ? 0.07 : 0.055);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y + r * 0.12, r * 0.15, 0.22 * Math.PI, 0.78 * Math.PI);
  ctx.stroke();
  if (st.moustache) { fill(look.hair_c); ell(x - r * 0.08, y + r * 0.15, r * 0.09, r * 0.04, 0.3); ell(x + r * 0.08, y + r * 0.15, r * 0.09, r * 0.04, -0.3); }
  if (st.glasses) {
    ctx.strokeStyle = color('xr-summit-glasses');
    ctx.lineWidth = r * 0.04;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x + s * r * 0.17, y - r * 0.02, r * 0.15, r * 0.12, 0, 0, Math.PI * 2); ctx.stroke(); }
  }
  ctx.restore();
  ctx.lineWidth = r * 0.08;
  ctx.strokeStyle = color('xr-panel-border');
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}
