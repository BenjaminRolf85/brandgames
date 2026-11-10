// The AI Quiz in the look of its game coin: answers as glowing speech bubbles with a colored
// letter (A green, B cyan, C yellow, D pink) that get a check or a cross, a robot buddy next to
// the question that thinks along and reacts (blender/build_quizbot.py; its eyes are drawn on its
// visor), and glowing question marks floating around. All colors come from design tokens.
import * as THREE from 'three';
import { Button, measureBlocks } from './ui3d.js';
import { color, hex, num, font } from './tokens.js';
import { loadGLTF } from './models.js';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const LETTER_TOKENS = ['xr-quiz-a', 'xr-quiz-b', 'xr-quiz-c', 'xr-quiz-d'];
const TAIL = 0.026; // height of the bubble's tail (m)
const BADGE = 0.075; // column for the letter badge (m)
const ICON = 0.05; // room for the check or cross on the right (m)
const pad = (h) => Math.min(num('xr-padding'), h * 0.16);

/**
 * An answer as a speech bubble: letter badge on the left, the text, a tail at the bottom left.
 * opts as for Button plus `letter` (0 = A). Status 'correct' / 'wrong' / 'muted' as for Button.
 */
export class AnswerBubble extends Button {
  static measure(w, h, opts) {
    const blocks = [{ text: opts.label, size: opts.labelSize ?? 'xr-text-md', weight: 'bold' }];
    return Math.max(h, measureBlocks(blocks, w - BADGE - ICON, pad(h)) + TAIL);
  }

  constructor(w, h, opts) {
    super(w, AnswerBubble.measure(w, h, opts), { ...opts, grow: false });
  }

  paint() {
    if (!this.opts) return;
    const { ctx, canvas } = this;
    const { hover, disabled, status } = this.state;
    const active = hover && !disabled;
    const tok = status === 'correct' ? 'xr-success' : status === 'wrong' ? 'xr-danger' : LETTER_TOKENS[(this.opts.letter ?? 0) % LETTER_TOKENS.length];
    const accent = color(tok);
    const W = canvas.width;
    const H = canvas.height;
    const sw = this.m(num('xr-border-width') * (active ? 2.4 : 1.6));
    const glow = this.m(0.012);
    const x0 = sw / 2 + glow;
    const y0 = sw / 2 + glow;
    const x1 = W - sw / 2 - glow;
    const y1 = H - this.m(TAIL) - sw / 2;
    const r = Math.min(this.m(num('xr-radius')), (y1 - y0) / 2);
    const tx0 = W * 0.13;
    const tx1 = W * 0.22;
    const tip = [W * 0.09, H - sw / 2 - 1];
    // Body and tail as one outline, so the glowing stroke runs around both.
    ctx.beginPath();
    ctx.moveTo(x0 + r, y0);
    ctx.lineTo(x1 - r, y0);
    ctx.arcTo(x1, y0, x1, y0 + r, r);
    ctx.lineTo(x1, y1 - r);
    ctx.arcTo(x1, y1, x1 - r, y1, r);
    ctx.lineTo(tx1, y1);
    ctx.lineTo(tip[0], tip[1]);
    ctx.lineTo(tx0, y1);
    ctx.lineTo(x0 + r, y1);
    ctx.arcTo(x0, y1, x0, y1 - r, r);
    ctx.lineTo(x0, y0 + r);
    ctx.arcTo(x0, y0, x0 + r, y0, r);
    ctx.closePath();
    ctx.fillStyle = color('xr-panel-bg');
    ctx.fill();
    if (status === 'correct' || status === 'wrong' || active) {
      ctx.save();
      ctx.globalAlpha = status ? 0.28 : 0.14;
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = glow * (active ? 1.6 : 1);
    ctx.lineWidth = sw;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = accent;
    ctx.stroke();
    ctx.restore();
    // Letter badge
    const cy = (y0 + y1) / 2;
    const cx = x0 + this.m(BADGE / 2 + 0.004);
    const br = this.m(0.025);
    ctx.save();
    ctx.shadowColor = accent;
    ctx.shadowBlur = glow;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(cx, cy, br, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = color('xr-quiz-badge-text');
    ctx.font = font('black', br * 1.25);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(LETTERS[this.opts.letter ?? 0], cx, cy + br * 0.06);
    // Check or cross after the answer
    if (status === 'correct' || status === 'wrong') {
      const ix = x1 - this.m(ICON / 2 + 0.006);
      const s = this.m(0.014);
      ctx.save();
      ctx.lineWidth = this.m(0.007);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = accent;
      ctx.shadowColor = accent;
      ctx.shadowBlur = glow;
      ctx.beginPath();
      if (status === 'correct') {
        ctx.moveTo(ix - s, cy);
        ctx.lineTo(ix - s * 0.25, cy + s * 0.8);
        ctx.lineTo(ix + s * 1.1, cy - s * 0.9);
      } else {
        ctx.moveTo(ix - s, cy - s);
        ctx.lineTo(ix + s, cy + s);
        ctx.moveTo(ix + s, cy - s);
        ctx.lineTo(ix - s, cy + s);
      }
      ctx.stroke();
      ctx.restore();
    }
    const text = [{ text: this.opts.label, size: this.opts.labelSize ?? 'xr-text-md', weight: 'bold', color: color('xr-panel-text') }];
    this.blocks(text, { x: BADGE, w: this.w - BADGE - ICON, h: this.h - TAIL, align: 'left', pad: pad(this.h) });
    this.material.opacity = status === 'muted' || (disabled && !status) ? 0.45 : 1;
    this.scale.setScalar(active ? this.hoverScale : 1);
  }
}

// ---------- the robot buddy ----------

export const QUIZBOT_URL = 'assets/models/quizbot.glb';

function botMaterials() {
  const std = (token, roughness, metalness = 0, extra = {}) => new THREE.MeshStandardMaterial({ color: hex(token), roughness, metalness, vertexColors: true, ...extra });
  return {
    BotShell: std('xr-bot-shell', 0.3, 0.1),
    BotJoint: std('xr-bot-joint', 0.3, 0.8),
    BotDark: std('xr-bot-dark', 0.5, 0.2),
    BotVisor: std('xr-bot-visor', 0.08, 0.3),
    BotGlow: new THREE.MeshBasicMaterial({ color: hex('xr-bot-glow'), toneMapped: false }),
  };
}

/**
 * The quiz robot: thinks along while a question is open, cheers when you are right, droops when
 * you are wrong. setMood('idle' | 'think' | 'happy' | 'sad' | 'wow', seconds), update(dt).
 */
export class QuizBot {
  constructor(parent) {
    this.group = new THREE.Group();
    this.group.userData.noFit = true;
    parent.add(this.group);
    this.time = Math.random() * 5;
    this.mood = 'idle';
    this.base = 'idle';
    this.until = 0;
    this.moodT = 0;
    this.blinkT = 2;
    this.eyeCanvas = document.createElement('canvas');
    this.eyeCanvas.width = 256;
    this.eyeCanvas.height = 168;
    this.eyeTex = new THREE.CanvasTexture(this.eyeCanvas);
    this.eyeTex.colorSpace = THREE.SRGBColorSpace;
    this.eyes = new THREE.Mesh(new THREE.PlaneGeometry(0.27, 0.177), new THREE.MeshBasicMaterial({ map: this.eyeTex, transparent: true, toneMapped: false, depthWrite: false }));
    this.eyes.position.set(0, 0.145, 0.166);
    this.eyes.renderOrder = 2;
    this.drawn = '';
    loadGLTF(QUIZBOT_URL).then((gltf) => this.attach(gltf)).catch((e) => console.warn('Quiz bot not loaded', e));
  }

  attach(gltf) {
    if (this.disposed) return;
    const mats = botMaterials();
    const model = gltf.scene.getObjectByName('QuizBot').clone(true);
    model.position.set(0, 0, 0);
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.material = mats[o.material.name] ?? o.material;
      o.userData.noFit = true;
    });
    this.head = model.getObjectByName('BotHead');
    this.armL = model.getObjectByName('BotArmL');
    this.armR = model.getObjectByName('BotArmR');
    this.head?.add(this.eyes);
    this.glow = mats.BotGlow;
    this.model = model;
    this.group.add(model);
  }

  /** A mood for some seconds (then back to the base mood), or the base mood (seconds = 0). */
  setMood(mood, seconds = 0) {
    if (seconds > 0) { this.mood = mood; this.until = this.time + seconds; } else { this.base = mood; if (this.time >= this.until) this.mood = mood; }
    this.moodT = 0;
  }

  /** Glowing eyes on the visor (redrawn only when they change). */
  drawEyes(blink) {
    const dots = this.mood === 'think' ? Math.floor(this.time * 3) % 4 : 0;
    const key = `${this.mood}|${blink.toFixed(1)}|${dots}`;
    if (key === this.drawn) return;
    this.drawn = key;
    const c = this.eyeCanvas;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    const eye = color('xr-bot-eye');
    ctx.fillStyle = eye;
    ctx.strokeStyle = eye;
    ctx.shadowColor = eye;
    ctx.shadowBlur = 18;
    ctx.lineCap = 'round';
    ctx.lineWidth = 16;
    const L = 82;
    const R = 174;
    const Y = 74;
    const oval = (x, y, w, h) => { ctx.beginPath(); ctx.ellipse(x, y, w, Math.max(2, h), 0, 0, Math.PI * 2); ctx.fill(); };
    switch (this.mood) {
      case 'happy':
        for (const x of [L, R]) { ctx.beginPath(); ctx.arc(x, Y + 12, 24, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.arc(128, 112, 26, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
        break;
      case 'sad':
        for (const [x, s] of [[L, 1], [R, -1]]) {
          ctx.beginPath();
          ctx.ellipse(x, Y + 8, 22, 16 * (1 - blink), s * 0.35, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.arc(128, 142, 22, Math.PI * 1.2, Math.PI * 1.8);
        ctx.stroke();
        break;
      case 'wow':
        oval(L, Y, 26, 28 * (1 - blink));
        oval(R, Y, 26, 28 * (1 - blink));
        oval(128, 128, 10, 10);
        break;
      case 'think':
        oval(L + 10, Y - 10, 19, 24 * (1 - blink));
        oval(R + 10, Y - 10, 19, 24 * (1 - blink));
        for (let i = 0; i < dots; i++) oval(104 + i * 24, 132, 6, 6);
        break;
      default:
        oval(L, Y, 20, 26 * (1 - blink));
        oval(R, Y, 20, 26 * (1 - blink));
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.arc(128, 116, 16, Math.PI * 0.2, Math.PI * 0.8);
        ctx.stroke();
    }
    this.eyeTex.needsUpdate = true;
  }

  update(dt) {
    this.time += dt;
    this.moodT += dt;
    if (this.time >= this.until && this.mood !== this.base) { this.mood = this.base; this.moodT = 0; }
    const t = this.time;
    // Blinking now and then.
    this.blinkT -= dt;
    if (this.blinkT < -0.14) this.blinkT = 2 + Math.random() * 3;
    const blink = this.blinkT < 0 ? Math.sin((-this.blinkT / 0.14) * Math.PI) : 0;
    this.drawEyes(this.mood === 'happy' ? 0 : blink);
    if (!this.model) return;
    const m = this.model;
    const k = Math.min(1, this.moodT * 3);
    let y = Math.sin(t * 2.1) * 0.015;
    let spin = 0;
    let headX = Math.sin(t * 0.9) * 0.05;
    let headZ = Math.sin(t * 0.7) * 0.06;
    let armL = -0.15 + Math.sin(t * 1.8) * 0.06;
    let armR = 0.15 - Math.sin(t * 1.8) * 0.06;
    let armRX = 0;
    switch (this.mood) {
      case 'think':
        headZ = 0.18 + Math.sin(t * 1.3) * 0.04; // tilts its head
        headX = -0.1;
        armR = 0.35;
        armRX = -0.9; // holds the tablet up
        break;
      case 'happy': {
        const hop = Math.abs(Math.sin(this.moodT * Math.PI * 2.2));
        y += hop * 0.07 * Math.max(0, 1 - this.moodT / 2);
        spin = Math.min(1, this.moodT / 0.8) * Math.PI * 2;
        armL = -2.5 * k + Math.sin(t * 12) * 0.15;
        armR = 2.5 * k - Math.sin(t * 12) * 0.15;
        headX = -0.15;
        break;
      }
      case 'sad':
        y -= 0.03 * k;
        headX = 0.35 * k;
        headZ = Math.sin(t * 0.8) * 0.04;
        armL = -0.05;
        armR = 0.05;
        break;
      case 'wow':
        armL = -1.2 * k;
        armR = 1.2 * k;
        headX = -0.2;
        break;
      default:
    }
    m.position.y = y;
    m.rotation.y = spin;
    if (this.head) this.head.rotation.set(headX, 0, headZ);
    if (this.armL) this.armL.rotation.set(0, 0, armL);
    if (this.armR) this.armR.rotation.set(armRX, 0, armR);
    if (this.glow) this.glow.color.setHex(hex('xr-bot-glow')).multiplyScalar(0.75 + 0.25 * Math.sin(t * 3));
  }

  dispose() {
    this.disposed = true;
    this.eyeTex.dispose();
  }
}

// ---------- glowing question marks ----------

let markTex = null;
function markTexture() {
  if (markTex) return markTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.font = font('black', 104);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color('xr-quiz-mark');
  ctx.shadowBlur = 16;
  ctx.fillStyle = color('xr-quiz-mark');
  ctx.fillText('?', 64, 70);
  markTex = new THREE.CanvasTexture(c);
  markTex.colorSpace = THREE.SRGBColorSpace;
  return markTex;
}

/** A few question marks floating around a spot (local positions given), bobbing and turning. */
export function makeQuestionMarks(spots) {
  const group = new THREE.Group();
  group.userData.noFit = true;
  const marks = spots.map(([x, y, z, s], i) => {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: markTexture(), transparent: true, depthWrite: false, toneMapped: false }));
    sp.position.set(x, y, z);
    sp.scale.setScalar(s);
    sp.userData.noFit = true;
    group.add(sp);
    return { sp, x, y, s, phase: i * 1.7 };
  });
  group.userData.tick = (time) => {
    for (const m of marks) {
      m.sp.position.y = m.y + Math.sin(time * 1.4 + m.phase) * 0.02;
      m.sp.material.rotation = Math.sin(time * 0.9 + m.phase) * 0.25;
      m.sp.material.opacity = 0.75 + 0.25 * Math.sin(time * 2 + m.phase);
    }
  };
  return group;
}
