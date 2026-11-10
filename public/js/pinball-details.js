// Campaign Pinball: the classic machine details around the playfield and on the cabinet.
// - Side art on the cabinet and the backbox (painted from tokens: the campaign's town,
//   a megaphone sending chat bubbles, likes and mails, the title, the stripes).
// - Wooden side blades inside the cabinet (wood grain from tokens).
// - Printed, translucent plastics on posts (slingshots, lane guides, outlanes, persona
//   deflectors, the e-mail bank), held by spacers, nuts and screws (instanced).
// - Mechanical parts from Blender: persona standup targets with printed faces, the spinner
//   (its flap turns), star rollovers in the top lanes, wire rollovers in the in- and outlanes,
//   the kickback, flasher domes on the slingshots, the ball trough window in the apron,
//   the price card in the coin door.
// - The printed playfield art and insert lights for these parts (drawn into the playfield).
// Heavy things are merged or instanced: one draw call for all plastics, one per material for
// the nuts, spacers, screws, stars and rollovers.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';
import { hex, color, font } from './tokens.js';
import { t } from './i18n.js';
import { SLOPE, GROUPS, GUIDE_X, LANE_Y, KICKBACK, ARC, SPINNER } from './pinball-layout.js';
import { drawGlyph } from './pinball-visuals.js';
import { makeFlasher } from './pinball-fx.js';
import { drawPortrait } from './pinball-props.js';

const fp = (x, y, h = 0) => new THREE.Vector3(x, h, -y);
const SA = Math.sin(SLOPE);
const CA = Math.cos(SLOPE);
/** Playfield point -> machine frame (the root), like FP() in blender/build_pinball.py. */
const FP = (x, y, h = 0) => new THREE.Vector3(x, y * SA + h * CA, -y * CA + h * SA);
/** The cabinet's measures (blender/build_pinball.py: BX0, BX1, IX0, IX1, YF, YB, HT, YBOT). */
export const CAB = { x0: -0.288, x1: 0.338, ix0: -0.268, ix1: 0.318, yf: -0.075, yb: 1.3, ht: 0.07, ybot: -0.3 };
const GROUP_TOKEN = GROUPS.map((g, i) => `xr-pinball-group-${i + 1}`);

/** Where the new inserts are on the playfield. */
export const SPOTS = {
  kickback: { x: KICKBACK.x, y: 0.17 },
  extra: { x: 0.085, y: 0.395, r: 0.011 },
  spinner: (() => {
    const a = SPINNER.a - 0.26;
    const r = (SPINNER.r0 + SPINNER.r1) / 2;
    return { x: ARC.x + Math.cos(a) * r, y: ARC.y + Math.sin(a) * r, r: 0.0085 };
  })(),
  inlane: [{ x: -0.177, y: 0.274 }, { x: 0.177, y: 0.274 }],
  dropNo: [0.425, 0.465, 0.505].map((y) => ({ x: -0.199, y, r: 0.0068 })),
};
/** The persona lamps: in front of each standup target. */
const personaSpot = (s) => ({ x: s.x + s.nx * 0.03, y: s.y + s.ny * 0.03, r: 0.0085 });

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext('2d') };
}

function texture(c, { repeat = false } = {}) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeat) tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- little drawings (side art, plastics) ----------

function heart(ctx, x, y, s, fill) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s / 32, s / 32);
  ctx.beginPath();
  ctx.moveTo(0, 12);
  ctx.bezierCurveTo(-26, -4, -14, -26, 0, -12);
  ctx.bezierCurveTo(14, -26, 26, -4, 0, 12);
  ctx.closePath();
  ctx.fillStyle = color(fill);
  ctx.fill();
  ctx.restore();
}

/** A megaphone (mouth to the right before mirroring), with sound waves. */
function megaphone(ctx, x, y, s, angle, dir) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(dir, 1);
  ctx.lineJoin = 'round';
  ctx.fillStyle = color('xr-pinball-apron-ink');
  ctx.beginPath();
  ctx.roundRect(-0.62 * s, -0.17 * s, 0.3 * s, 0.34 * s, 0.06 * s);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(-0.36 * s, 0.12 * s, 0.13 * s, 0.38 * s, 0.05 * s);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-0.36 * s, -0.2 * s);
  ctx.lineTo(0.42 * s, -0.52 * s);
  ctx.lineTo(0.42 * s, 0.52 * s);
  ctx.lineTo(-0.36 * s, 0.2 * s);
  ctx.closePath();
  ctx.fillStyle = color('xr-pinball-sticker');
  ctx.fill();
  ctx.lineWidth = 0.05 * s;
  ctx.strokeStyle = color('xr-pinball-accent');
  ctx.stroke();
  ctx.fillStyle = color('xr-pinball-accent');
  ctx.beginPath();
  ctx.ellipse(0.42 * s, 0, 0.1 * s, 0.53 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color('xr-pinball-accent');
  ctx.fillRect(-0.12 * s, -0.31 * s, 0.1 * s, 0.62 * s);
  ctx.strokeStyle = color('xr-pinball-lane-light');
  ctx.lineCap = 'round';
  for (let k = 0; k < 3; k++) {
    ctx.lineWidth = (0.07 - k * 0.012) * s;
    ctx.beginPath();
    ctx.arc(0.5 * s, 0, (0.72 + k * 0.28) * s, -0.55, 0.55);
    ctx.stroke();
  }
  ctx.restore();
}

/** A chat bubble with an icon (heart, like, mail, play, poster, app). */
function bubble(ctx, x, y, r, icon, tail = 1) {
  ctx.save();
  ctx.fillStyle = color('xr-pinball-sticker');
  ctx.strokeStyle = color('xr-pinball-cabinet-dark');
  ctx.lineWidth = r * 0.08;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 1.2, r, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - tail * r * 0.5, y + r * 0.7);
  ctx.lineTo(x - tail * r * 1.1, y + r * 1.35);
  ctx.lineTo(x - tail * r * 0.05, y + r * 0.92);
  ctx.closePath();
  ctx.fill();
  if (icon === 'heart') heart(ctx, x, y + r * 0.05, r * 1.25, 'xr-pinball-ch-social');
  else if (icon === 'at') {
    ctx.fillStyle = color('xr-pinball-ch-email');
    ctx.font = font('black', r * 1.35);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('@', x, y + r * 0.05);
  } else if (icon === 'like') {
    ctx.fillStyle = color('xr-pinball-like');
    ctx.beginPath();
    ctx.roundRect(x - r * 0.55, y - r * 0.05, r * 0.28, r * 0.55, r * 0.06);
    ctx.roundRect(x - r * 0.2, y - r * 0.1, r * 0.72, r * 0.6, r * 0.14);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x - r * 0.18, y - r * 0.05);
    ctx.lineTo(x + r * 0.02, y - r * 0.62);
    ctx.quadraticCurveTo(x + r * 0.22, y - r * 0.68, x + r * 0.2, y - r * 0.4);
    ctx.lineTo(x + r * 0.12, y - r * 0.08);
    ctx.closePath();
    ctx.fill();
  } else {
    drawGlyph(ctx, icon, x, y, r * 1.25, color(`xr-pinball-ch-${icon}`), 2.6);
  }
  ctx.restore();
}

function houseRow(ctx, x0, x1, base, hMin, hMax, rnd, scale = 1) {
  const cols = ['xr-pinball-house-1', 'xr-pinball-house-2', 'xr-pinball-house-3', 'xr-pinball-house-4', 'xr-pinball-house-5', 'xr-pinball-house-6'];
  let x = x0;
  while (x < x1) {
    const w = (40 + rnd() * 50) * scale;
    const h = hMin + rnd() * (hMax - hMin);
    ctx.fillStyle = color(cols[Math.floor(rnd() * cols.length)]);
    ctx.fillRect(x, base - h, w, h);
    ctx.fillStyle = color('xr-pinball-house-roof');
    ctx.beginPath();
    ctx.moveTo(x - 4 * scale, base - h);
    ctx.lineTo(x + w / 2, base - h - w * 0.45);
    ctx.lineTo(x + w + 4 * scale, base - h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = color('xr-pinball-window');
    for (let wy = base - h + 10 * scale; wy < base - 16 * scale; wy += 18 * scale) {
      for (let wx = x + 8 * scale; wx < x + w - 12 * scale; wx += 16 * scale) {
        if (rnd() < 0.7) ctx.fillRect(wx, wy, 7 * scale, 9 * scale);
      }
    }
    x += w + 6 * scale;
  }
}

/** The branch office (portico with columns, red roof) in the side art's town. */
function branchHouse(ctx, x, base, s) {
  ctx.fillStyle = color('xr-pinball-house');
  ctx.fillRect(x - s, base - s * 1.1, s * 2, s * 1.1);
  ctx.fillStyle = color('xr-pinball-roof');
  ctx.beginPath();
  ctx.moveTo(x - s * 1.15, base - s * 1.1);
  ctx.lineTo(x, base - s * 1.75);
  ctx.lineTo(x + s * 1.15, base - s * 1.1);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = color('xr-pinball-sticker');
  for (let k = -2; k <= 2; k++) ctx.fillRect(x + k * s * 0.36 - s * 0.06, base - s * 0.92, s * 0.12, s * 0.92);
  ctx.fillStyle = color('xr-pinball-door');
  ctx.fillRect(x - s * 0.13, base - s * 0.5, s * 0.26, s * 0.5);
}

// ---------- cabinet side art ----------

/** One side's art in a band of the atlas; front = 1: the front of the machine is to the right. */
function drawSide(ctx, ox, oy, W, H, front, vf) {
  const topAt = (x) => {
    const u = front > 0 ? x / W : 1 - x / W; // 0 at the back, 1 at the front
    return H * (1 - vf) * u;
  };
  ctx.save();
  ctx.translate(ox, oy);
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, color('xr-pinball-cabinet'));
  g.addColorStop(1, color('xr-pinball-cabinet-dark'));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Rays from the megaphone.
  const mx = front > 0 ? W * 0.3 : W * 0.7;
  const my = H * 0.52;
  ctx.fillStyle = color('xr-pinball-side-ray');
  for (let k = 0; k < 18; k++) {
    const a0 = (k / 18) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(mx, my);
    ctx.arc(mx, my, W, a0, a0 + Math.PI / 30);
    ctx.closePath();
    ctx.fill();
  }
  // Halftone dots towards the bottom.
  ctx.fillStyle = color('xr-pinball-halftone');
  for (let y = H * 0.55; y < H; y += 14) {
    for (let x = (y / 14) % 2 ? 0 : 7; x < W; x += 14) {
      const r = 1 + 3.2 * ((y - H * 0.55) / (H * 0.45));
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // The town along the bottom, with the branch office in the middle.
  const rnd = mulberry(front > 0 ? 11 : 12);
  const base = H * 0.97;
  houseRow(ctx, -20, W + 20, base, H * 0.1, H * 0.2, rnd, 1.6);
  branchHouse(ctx, W * 0.5, base, H * 0.13);
  ctx.fillStyle = color('xr-pinball-tree');
  for (let k = 0; k < 7; k++) {
    const x = ((k + 0.5) / 7) * W + (rnd() - 0.5) * 60;
    ctx.beginPath();
    ctx.arc(x, base - H * 0.05, H * 0.045, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = color('xr-pinball-street');
  ctx.fillRect(0, base, W, H - base);
  // The megaphone sends the campaign out: bubbles, likes, mails towards the front.
  megaphone(ctx, mx, my, H * 0.36, front > 0 ? -0.25 : 0.25, front);
  const icons = ['heart', 'like', 'at', 'video', 'heart', 'app', 'poster', 'like', 'at'];
  icons.forEach((ic, k) => {
    const u = (k + 1) / (icons.length + 1);
    const x = front > 0 ? mx + H * 0.45 + u * (W - mx - H * 0.55) : mx - H * 0.45 - u * (mx - H * 0.55);
    const y = my - H * 0.12 - Math.sin(u * Math.PI * 1.2) * H * 0.2 + (k % 2) * H * 0.12;
    if (y - H * 0.11 < topAt(x) + H * 0.12) return; // keep clear of the stripes and the title
    bubble(ctx, x, y, H * (0.07 + 0.02 * ((k * 7) % 3)), ic, front);
  });
  // The title along the slope, in the tall back half.
  const tx = front > 0 ? W * 0.3 : W * 0.7;
  const slope = Math.atan2(H * (1 - vf), W) * front;
  ctx.save();
  ctx.translate(tx, topAt(tx) + H * 0.2);
  ctx.rotate(slope);
  ctx.font = font('black', H * 0.13);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = H * 0.035;
  ctx.strokeStyle = color('xr-pinball-cabinet-dark');
  ctx.strokeText(t('pinballName').toUpperCase(), 0, H * 0.012);
  ctx.lineWidth = H * 0.02;
  ctx.strokeStyle = color('xr-pinball-accent');
  ctx.strokeText(t('pinballName').toUpperCase(), 0, 0);
  ctx.fillStyle = color('xr-pinball-title');
  ctx.fillText(t('pinballName').toUpperCase(), 0, 0);
  ctx.restore();
  // Stripes along the top edge (red band, light pinstripe).
  const band = (off, hgt, tok) => {
    ctx.fillStyle = color(tok);
    ctx.beginPath();
    ctx.moveTo(0, topAt(0) + off);
    ctx.lineTo(W, topAt(W) + off);
    ctx.lineTo(W, topAt(W) + off + hgt);
    ctx.lineTo(0, topAt(0) + off + hgt);
    ctx.closePath();
    ctx.fill();
  };
  band(H * 0.02, H * 0.05, 'xr-pinball-accent');
  band(H * 0.085, H * 0.012, 'xr-pinball-lane-light');
  ctx.restore();
}

/** The backbox sides: a tall panel with bubbles rising from a megaphone. */
function drawBackboxSide(ctx, W, H) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, color('xr-pinball-cabinet-dark'));
  g.addColorStop(1, color('xr-pinball-cabinet'));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = color('xr-pinball-side-ray');
  for (let k = 0; k < 12; k++) {
    const a0 = (k / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(W / 2, H * 0.78);
    ctx.arc(W / 2, H * 0.78, H, a0, a0 + Math.PI / 24);
    ctx.closePath();
    ctx.fill();
  }
  megaphone(ctx, W * 0.5, H * 0.8, W * 0.55, -Math.PI / 2, 1);
  bubble(ctx, W * 0.36, H * 0.52, W * 0.17, 'heart');
  bubble(ctx, W * 0.64, H * 0.36, W * 0.15, 'like', -1);
  bubble(ctx, W * 0.4, H * 0.2, W * 0.13, 'at');
  ctx.fillStyle = color('xr-pinball-accent');
  ctx.fillRect(0, 0, W, H * 0.03);
  ctx.fillRect(0, H * 0.97, W, H * 0.03);
  ctx.fillStyle = color('xr-pinball-lane-light');
  ctx.fillRect(0, H * 0.038, W, H * 0.008);
  ctx.fillRect(0, H * 0.954, W, H * 0.008);
}

/** Wood grain for the side blades inside the cabinet, with a printed pinstripe. */
function drawWood(ctx, W, H) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, color('xr-pinball-wood-light'));
  g.addColorStop(1, color('xr-pinball-wood'));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const rnd = mulberry(3);
  ctx.strokeStyle = color('xr-pinball-wood-grain');
  for (let k = 0; k < 26; k++) {
    const y0 = rnd() * H;
    const amp = 2 + rnd() * 5;
    const fq = 0.004 + rnd() * 0.01;
    ctx.globalAlpha = 0.25 + rnd() * 0.4;
    ctx.lineWidth = 0.6 + rnd() * 1.6;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 16) {
      const y = y0 + Math.sin(x * fq + k) * amp + Math.sin(x * fq * 3.1) * amp * 0.3;
      if (x) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  // A few knots.
  for (let k = 0; k < 5; k++) {
    const x = rnd() * W;
    const y = H * (0.3 + rnd() * 0.4);
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.ellipse(x, y, 18, 5, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = color('xr-pinball-lane-light');
  ctx.fillRect(0, H * 0.08, W, 3);
}

// ---------- plastics ----------

const ATLAS = { w: 1024, h: 512 };

/** Printed plastic art into a cell of the atlas: colors, white ink border, icon, label. */
function plasticArt(ctx, [x, y, w, h], { bg, icon, label, vertical = false, center = false, ink = 'xr-pinball-sticker' }) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, color(bg[0]));
  g.addColorStop(1, color(bg[1]));
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color('xr-pinball-halftone');
  for (let yy = y + 4; yy < y + h; yy += 9) {
    for (let xx = x + ((yy - y) / 9) % 2 * 4.5; xx < x + w; xx += 9) {
      ctx.beginPath();
      ctx.arc(xx, yy, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.strokeStyle = color(ink);
  ctx.lineWidth = Math.max(4, Math.min(w, h) * 0.07);
  ctx.strokeRect(x + ctx.lineWidth / 2 + 2, y + ctx.lineWidth / 2 + 2, w - ctx.lineWidth - 4, h - ctx.lineWidth - 4);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const s = Math.min(w, h);
  if (icon) icon(ctx, cx, label && !center ? (vertical ? y + s * 0.75 : cy - s * 0.12) : cy, s);
  if (label) {
    ctx.fillStyle = color(ink);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (vertical) {
      ctx.translate(cx, y + h * 0.58);
      ctx.rotate(-Math.PI / 2);
      let px = w * 0.5;
      ctx.font = font('black', px);
      while (ctx.measureText(label).width > h * 0.62 && px > 8) { px -= 1; ctx.font = font('black', px); }
      ctx.fillText(label, 0, 0);
    } else {
      let px = center ? h * 0.42 : h * 0.24;
      ctx.font = font('black', px);
      while (ctx.measureText(label).width > w * (center ? 0.62 : 0.82) && px > 8) { px -= 1; ctx.font = font('black', px); }
      ctx.fillText(label, cx, icon && !center ? y + h * 0.78 : cy + px * 0.04);
    }
  }
  ctx.restore();
}

/** An extruded plastic piece with UVs from a local frame into an atlas cell. */
function plasticPiece(shape, h, frame, cell) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.0028, bevelEnabled: false, curveSegments: 10 });
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  const [cx, cy, cw, ch] = cell;
  const clamp01 = (v) => Math.min(1, Math.max(0, v));
  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i) - frame.o[0];
    const dy = pos.getY(i) - frame.o[1];
    const u = clamp01((dx * frame.u[0] + dy * frame.u[1]) / frame.lu);
    const v = clamp01((dx * frame.v[0] + dy * frame.v[1]) / frame.lv);
    uv.setXY(i, (cx + u * cw) / ATLAS.w, 1 - (cy + (1 - v) * ch) / ATLAS.h);
  }
  g.rotateX(-Math.PI / 2);
  g.translate(0, h, 0);
  return g;
}

const bboxFrame = (pts) => {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  return { o: [x0, y0], u: [1, 0], v: [0, 1], lu: Math.max(...xs) - x0, lv: Math.max(...ys) - y0 };
};

const polyShape = (pts) => {
  const s = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  s.closePath();
  return s;
};

function roundRectShape(x, y, w, h, r) {
  const s = new THREE.Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r);
  s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h);
  s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r);
  s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

/** A strip from a to b (field points), width w: shape and its frame (u along, v across). */
function strip(a, b, w, ext = 0) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const u = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
  const v = [-u[1], u[0]];
  const A = [a[0] - u[0] * ext, a[1] - u[1] * ext];
  const B = [b[0] + u[0] * ext, b[1] + u[1] * ext];
  const hw = w / 2;
  const pts = [
    [A[0] - v[0] * hw, A[1] - v[1] * hw], [B[0] - v[0] * hw, B[1] - v[1] * hw],
    [B[0] + v[0] * hw, B[1] + v[1] * hw], [A[0] + v[0] * hw, A[1] + v[1] * hw],
  ];
  return { shape: polyShape(pts), frame: { o: pts[0], u, v, lu: len + 2 * ext, lv: w } };
}

// ---------- instancing with full transforms ----------

/** Instanced copies of a Blender part: list of matrices (field space). Returns { group, meshes }. */
function instancedPart(part, mats) {
  const group = new THREE.Group();
  group.userData.noFit = true;
  const meshes = [];
  const m = new THREE.Matrix4();
  part.updateMatrixWorld(true);
  part.traverse((o) => {
    if (!o.isMesh) return;
    const inst = new THREE.InstancedMesh(o.geometry, o.material, mats.length);
    mats.forEach((mm, i) => inst.setMatrixAt(i, m.copy(mm).multiply(o.matrixWorld)));
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.userData.noFit = true;
    inst.userData.base = o.matrixWorld.clone();
    group.add(inst);
    meshes.push(inst);
  });
  return {
    group,
    /** Moves instance i to matrix mm. */
    set(i, mm) {
      for (const inst of meshes) {
        inst.setMatrixAt(i, m.copy(mm).multiply(inst.userData.base));
        inst.instanceMatrix.needsUpdate = true;
      }
    },
  };
}

const at = (x, y, h, rotY = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(
  fp(x, y, h), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(sx, sy, sz),
);

// ---------- printed playfield art and insert lamps ----------

const arrowPts = (x, y, w, l, angle) => {
  // Arrow pointing along angle (field), centered at (x, y): head and a short shaft.
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const P = (a, b) => [x + a * c - b * s, y + a * s + b * c];
  return [P(l / 2, 0), P(0, w / 2), P(0, w / 4), P(-l / 2, w / 4), P(-l / 2, -w / 4), P(0, -w / 4), P(0, -w / 2)];
};

/** The shapes of the new inserts (field x / y): { key, pts | circle, token, x, y, size }. */
export function detailInserts(table) {
  const out = [];
  const k = SPOTS.kickback;
  out.push({ key: 'kickback', pts: arrowPts(k.x, k.y, 0.026, 0.04, Math.PI / 2), token: 'xr-pinball-accent-glow', x: k.x, y: k.y, size: 0.08 });
  out.push({ key: 'extra', circle: SPOTS.extra, token: 'xr-pinball-ch-poster', x: SPOTS.extra.x, y: SPOTS.extra.y, size: 0.07 });
  const sp = SPOTS.spinner;
  const dirA = Math.atan2(table.spinner.y - sp.y, table.spinner.x - sp.x);
  out.push({ key: 'spinner', pts: arrowPts(sp.x, sp.y, 0.02, 0.028, dirA), token: 'xr-pinball-ai', x: sp.x, y: sp.y, size: 0.06 });
  SPOTS.inlane.forEach((p, i) => out.push({ key: `inlane${i}`, pts: arrowPts(p.x, p.y, 0.018, 0.022, -Math.PI / 2), token: 'xr-pinball-lane-light', x: p.x, y: p.y, size: 0.05 }));
  SPOTS.dropNo.forEach((p, i) => out.push({ key: `drop${i}`, circle: p, token: 'xr-pinball-ch-email', x: p.x, y: p.y, size: 0.04 }));
  table.standups.forEach((s, i) => {
    const p = personaSpot(s);
    out.push({ key: `persona${i}`, circle: p, token: GROUP_TOKEN[i], x: p.x, y: p.y, size: 0.05 });
  });
  return out;
}

/** Prints the new inserts, labels and pinstripes onto the playfield canvas. */
export function drawDetailArt(ctx, X, Y, M, table) {
  const shapePath = (it) => {
    ctx.beginPath();
    if (it.circle) ctx.arc(X(it.circle.x), Y(it.circle.y), M(it.circle.r), 0, Math.PI * 2);
    else it.pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
    ctx.closePath();
  };
  const label = (text, x, y, px, tok = 'xr-pinball-field-text', rot = 0) => {
    ctx.save();
    ctx.translate(X(x), Y(y));
    ctx.rotate(rot);
    ctx.fillStyle = color(tok);
    ctx.font = font('black', M(px));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 0, 0);
    ctx.restore();
  };
  // Pinstripes along the inlane guides and around the lower playfield.
  ctx.strokeStyle = color('xr-pinball-lane-light');
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = M(0.0012);
  for (const s of [1, -1]) {
    ctx.beginPath();
    ctx.moveTo(X(s * -0.205), Y(0.36));
    ctx.lineTo(X(s * -0.205), Y(0.06));
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(X(s * -0.189), Y(0.36));
    ctx.lineTo(X(s * -0.189), Y(0.27));
    ctx.quadraticCurveTo(X(s * -0.189), Y(0.2), X(s * -0.12), Y(0.17));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const it of detailInserts(table)) {
    shapePath(it);
    ctx.fillStyle = color('xr-pinball-dark');
    ctx.fill();
    ctx.lineWidth = M(0.0016);
    ctx.strokeStyle = color(it.token);
    ctx.stroke();
  }
  // Numbers and labels.
  SPOTS.dropNo.forEach((p, i) => label(String(i + 1), p.x, p.y, 0.008, 'xr-pinball-ch-email'));
  table.standups.forEach((s, i) => {
    const p = personaSpot(s);
    label(String(i + 1), p.x, p.y, 0.0095, GROUP_TOKEN[i]);
  });
  label(t('pinballFieldExtra'), SPOTS.extra.x, SPOTS.extra.y, 0.0052, 'xr-pinball-ch-poster');
  label(t('pinballFieldKickback'), SPOTS.kickback.x, SPOTS.kickback.y + 0.048, 0.0062, 'xr-pinball-field-text', -Math.PI / 2);
  const sp = SPOTS.spinner;
  label(t('pinballFieldSpinner'), sp.x + 0.004, sp.y - 0.02, 0.0068, 'xr-pinball-ai', -0.65);
  // Personas: a label between each pair of lamps.
  for (const pair of [[0, 1], [2, 3]]) {
    const a = personaSpot(table.standups[pair[0]]);
    const b = personaSpot(table.standups[pair[1]]);
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const nx = table.standups[pair[0]].nx;
    const ny = table.standups[pair[0]].ny;
    const rot = -(Math.abs(ang) > Math.PI / 2 ? ang + Math.PI : ang);
    label(t('pinballFieldPersonas'), (a.x + b.x) / 2 + nx * 0.02, (a.y + b.y) / 2 + ny * 0.02, 0.0062, 'xr-pinball-field-text', rot);
  }
  // The right outlane keeps its warning stripes; the left one leads to the kickback.
  ctx.fillStyle = color('xr-pinball-danger');
  for (let k = 0; k < 3; k++) {
    ctx.globalAlpha = 0.65 - k * 0.15;
    ctx.fillRect(X(0.2208) - M(0.007), Y(0.215 - k * 0.035), M(0.014), M(0.014));
  }
  ctx.globalAlpha = 1;
}

// ---------- the build ----------

/**
 * Adds all details to the machine. root: machine frame, field: playfield frame (tilted),
 * parts: Blender parts, anchors: Blender empties. Returns the handles for the animation.
 */
export function buildDetails({ root, field, parts, anchors, table, lite }) {
  const owned = [];
  const own = (...xs) => { owned.push(...xs); return xs[0]; };
  // ---- side art on the cabinet and the backbox ----
  const f = FP(0, CAB.yf, CAB.ht);
  const b = FP(0, CAB.yb, CAB.ht);
  const vf = (f.y - CAB.ybot) / (b.y - CAB.ybot);
  const SW = 2048;
  const SH = 640;
  const side = canvas(SW, SH * 2);
  drawSide(side.ctx, 0, 0, SW, SH, 1, vf);
  drawSide(side.ctx, 0, SH, SW, SH, -1, vf);
  const sideTex = own(texture(side.c));
  const sideMat = own(new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.38, metalness: 0.1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 }));
  const quad = (x, corners, uvs) => {
    const g = new THREE.BufferGeometry();
    const p = [];
    for (const [z, y] of corners) p.push(x, y, z);
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs.flat(), 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.computeVertexNormals();
    return g;
  };
  // Corners: front bottom, front top, back top, back bottom.
  const sc = [[f.z, CAB.ybot], [f.z, f.y], [b.z, b.y], [b.z, CAB.ybot]];
  const sides = mergeGeometries([
    quad(CAB.x0 - 0.0007, sc, [[1, 0.5], [1, 0.5 + 0.5 * vf], [0, 1], [0, 0.5]]),
    quad(CAB.x1 + 0.0007, sc, [[0, 0], [0, 0.5 * vf], [1, 0.5], [1, 0]]),
  ]);
  const sideMesh = new THREE.Mesh(sides, sideMat);
  sideMesh.userData.noFit = true;
  sideMesh.receiveShadow = true;
  root.add(sideMesh);
  // Backbox sides (same art on both; it has no text).
  const z0 = b.z + 0.002;
  const z1 = z0 + 0.2;
  const y0 = b.y - 0.02;
  const y1 = y0 + 0.62;
  const bbc = canvas(256, 800);
  drawBackboxSide(bbc.ctx, 256, 800);
  const bbTex = own(texture(bbc.c));
  const bbMat = own(new THREE.MeshStandardMaterial({ map: bbTex, roughness: 0.38, metalness: 0.1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 }));
  const bc = [[z1, y0], [z1, y1], [z0, y1], [z0, y0]];
  const bbMesh = new THREE.Mesh(mergeGeometries([
    quad(CAB.x0 - 0.0007, bc, [[1, 0], [1, 1], [0, 1], [0, 0]]),
    quad(CAB.x1 + 0.0007, bc, [[0, 0], [0, 1], [1, 1], [1, 0]]),
  ]), bbMat);
  bbMesh.userData.noFit = true;
  root.add(bbMesh);
  // ---- wooden side blades inside the cabinet (above the playfield) ----
  const wc = canvas(2048, 128);
  drawWood(wc.ctx, 2048, 128);
  const woodTex = own(texture(wc.c));
  const woodMat = own(new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.42, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -1 }));
  const blade = (x) => {
    const c = [[-CAB.yb, -0.02], [-CAB.yb, CAB.ht], [-CAB.yf, CAB.ht], [-CAB.yf, -0.02]]; // (field z, h)
    const g = new THREE.BufferGeometry();
    const p = [];
    for (const [z, h] of c) p.push(x, h, z);
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 1, 1, 0], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    return g;
  };
  const blades = new THREE.Mesh(mergeGeometries([blade(CAB.ix0 + 0.0042), blade(CAB.ix1 - 0.0042)]), woodMat);
  blades.material.side = THREE.DoubleSide;
  blades.geometry.computeVertexNormals();
  blades.userData.noFit = true;
  blades.receiveShadow = true;
  field.add(blades);

  // ---- plastics ----
  const pc = canvas(ATLAS.w, ATLAS.h);
  const P = pc.ctx;
  const iconGlyph = (key, tok) => (ctx, x, y, s) => drawGlyph(ctx, key, x, y, s * 0.5, color(tok), 2.6);
  const cells = {
    slingL: [0, 0, 256, 256], slingR: [256, 0, 256, 256], tab: [512, 0, 64, 256],
    outL: [576, 0, 80, 512], outR: [656, 0, 80, 512], persL: [736, 0, 288, 72], persR: [736, 80, 288, 72], drops: [736, 160, 72, 352],
  };
  plasticArt(P, cells.slingL, { bg: ['xr-pinball-accent', 'xr-pinball-ch-poster'], icon: (ctx, x, y, s) => megaphone(ctx, x - s * 0.08, y + s * 0.02, s * 0.36, -0.3, 1) });
  plasticArt(P, cells.slingR, { bg: ['xr-pinball-ch-social', 'xr-pinball-ch-app'], icon: (ctx, x, y, s) => { bubble(ctx, x - s * 0.06, y - s * 0.08, s * 0.16, 'heart'); bubble(ctx, x + s * 0.14, y + s * 0.2, s * 0.11, 'like', -1); } });
  plasticArt(P, cells.tab, { bg: ['xr-pinball-lane-light', 'xr-pinball-ch-poster'], ink: 'xr-pinball-apron-ink' });
  plasticArt(P, cells.outL, { bg: ['xr-pinball-accent', 'xr-pinball-accent-glow'], label: t('pinballFieldKickback'), vertical: true, icon: (ctx, x, y, s) => { ctx.fillStyle = color('xr-pinball-sticker'); ctx.beginPath(); ctx.moveTo(x, y - s * 0.32); ctx.lineTo(x + s * 0.28, y); ctx.lineTo(x - s * 0.28, y); ctx.closePath(); ctx.fill(); } });
  plasticArt(P, cells.outR, { bg: ['xr-pinball-ch-email', 'xr-pinball-ai'], label: t('pinballPlasticReach'), vertical: true, icon: (ctx, x, y, s) => heart(ctx, x, y, s * 0.55, 'xr-pinball-sticker') });
  for (const [key, ids] of [['persL', [0, 1]], ['persR', [2, 3]]]) {
    plasticArt(P, cells[key], {
      bg: ['xr-pinball-cabinet', 'xr-pinball-ch-app'], label: t('pinballFieldPersonas'), center: true,
      icon: (ctx, x, y, s) => ids.forEach((g, k) => { ctx.fillStyle = color(GROUP_TOKEN[g]); ctx.beginPath(); ctx.arc(x + (k ? 1 : -1) * s * 1.55, y, s * 0.2, 0, Math.PI * 2); ctx.fill(); }),
    });
  }
  plasticArt(P, cells.drops, { bg: ['xr-pinball-ch-email', 'xr-pinball-cabinet'], label: t('pinballCh_email').toUpperCase(), vertical: true, icon: iconGlyph('email', 'xr-pinball-sticker') });
  const plasticTex = own(texture(pc.c));
  const pieces = [];
  const nuts = [];
  const spacers = [];
  const nut = (x, y, h) => nuts.push(at(x, y, h));
  const spacer = (x, y, h0, h1) => spacers.push(at(x, y, h0, 0, 1, h1 - h0, 1));
  // Slingshots: triangles a little larger than the posts, a nut on each post.
  const slingTops = [];
  table.slings.forEach((sl, i) => {
    const { A, B, C } = sl;
    const cx = (A[0] + B[0] + C[0]) / 3;
    const cy = (A[1] + B[1] + C[1]) / 3;
    const out = (p) => {
      const d = Math.hypot(p[0] - cx, p[1] - cy);
      return [p[0] + ((p[0] - cx) / d) * 0.006, p[1] + ((p[1] - cy) / d) * 0.006];
    };
    let pts = [out(A), out(B), out(C)];
    const area = (pts[1][0] - pts[0][0]) * (pts[2][1] - pts[0][1]) - (pts[2][0] - pts[0][0]) * (pts[1][1] - pts[0][1]);
    if (area < 0) pts = [pts[0], pts[2], pts[1]];
    pieces.push(plasticPiece(polyShape(pts), 0.0235, bboxFrame(pts), i === 0 ? cells.slingL : cells.slingR));
    for (const q of [A, B, C]) nut(q[0], q[1], 0.0263);
    slingTops.push([cx, cy]);
  });
  // Lane guide tabs.
  for (const x of GUIDE_X) {
    const sh = roundRectShape(x - 0.007, 0.893, 0.014, 0.04, 0.006);
    pieces.push(plasticPiece(sh, 0.028, { o: [x - 0.007, 0.893], u: [1, 0], v: [0, 1], lu: 0.014, lv: 0.04 }, cells.tab));
    nut(x, LANE_Y[1], 0.0308);
    spacer(x, LANE_Y[1], 0.016, 0.028);
    nut(x, 0.901, 0.0308);
  }
  // Outlane separators: stadiums over the rail and its post.
  for (const s of [1, -1]) {
    const x = s * -0.197;
    const sh = roundRectShape(x - 0.011, 0.236, 0.022, 0.139, 0.011);
    pieces.push(plasticPiece(sh, 0.0295, { o: [x - 0.011, 0.236], u: [1, 0], v: [0, 1], lu: 0.022, lv: 0.139 }, s > 0 ? cells.outL : cells.outR));
    nut(x, 0.355, 0.0323);
    nut(x, 0.252, 0.0323);
    spacer(x, 0.252, 0.024, 0.0295);
  }
  // Persona deflectors: a strip on top of each deflector wall.
  for (const [i, id] of [[0, 'left'], [1, 'right']]) {
    const r = table.ramps[id];
    const sd = r.side;
    const a = [sd > 0 ? -0.24 : 0.2445, 0.735];
    const e = [r.mouth.r1[0] + 0.003 * sd, r.mouth.r1[1] + 0.003];
    const st = strip(sd > 0 ? a : e, sd > 0 ? e : a, 0.019, 0.004);
    pieces.push(plasticPiece(st.shape, 0.036, st.frame, i === 0 ? cells.persL : cells.persR));
    for (const k of [0.15, 0.85]) {
      const px = a[0] + (e[0] - a[0]) * k;
      const py = a[1] + (e[1] - a[1]) * k;
      nut(px, py, 0.0388);
      spacer(px, py, 0.033, 0.036);
    }
  }
  // The e-mail bank: over the backing wall behind the drop targets.
  {
    const sh = roundRectShape(-0.2445, 0.398, 0.0235, 0.134, 0.004);
    pieces.push(plasticPiece(sh, 0.036, { o: [-0.2445, 0.398], u: [1, 0], v: [0, 1], lu: 0.0235, lv: 0.134 }, cells.drops));
    for (const y of [0.41, 0.52]) { nut(-0.2328, y, 0.0388); spacer(-0.2328, y, 0.033, 0.036); }
  }
  const plasticMat = own(new THREE.MeshStandardMaterial({
    map: plasticTex, roughness: 0.16, metalness: 0, transparent: true, opacity: 0.9,
    emissive: hex('xr-pinball-white'), emissiveMap: plasticTex, emissiveIntensity: lite ? 0.45 : 0.3,
  }));
  const plastics = new THREE.Mesh(mergeGeometries(pieces), plasticMat);
  plastics.castShadow = true;
  plastics.userData.noFit = true;
  plastics.renderOrder = 2;
  field.add(plastics);
  // Apron screws.
  const screws = [[-0.252, -0.01], [0.232, -0.01], [-0.252, 0.06], [0.232, 0.06], [-0.082, 0.004], [0.067, 0.004]].map(([x, y]) => at(x, y, 0.0352));
  field.add(instancedPart(parts.PinNut, nuts).group, instancedPart(parts.PinSpacer, spacers).group, instancedPart(parts.PinScrew, screws).group);
  // Flasher domes on the sling plastics.
  const slingFlash = slingTops.map(([x, y], i) => {
    const fl = makeFlasher(i === 0 ? 'xr-pinball-accent-glow' : 'xr-pinball-ch-social');
    fl.scale.setScalar(0.7);
    fl.position.copy(fp(x, y, 0.0263));
    fl.userData.k = 0;
    field.add(fl);
    return fl;
  });

  // ---- persona standups with printed faces ----
  const faces = canvas(512, 128);
  GROUPS.forEach((g, i) => {
    const x = i * 128;
    faces.ctx.fillStyle = color('xr-pinball-standup');
    faces.ctx.fillRect(x, 0, 128, 128);
    drawPortrait(faces.ctx, g, x + 64, 64, 56, GROUP_TOKEN[i]);
  });
  const faceTex = own(texture(faces.c));
  const standups = table.standups.map((s, i) => {
    const grp = new THREE.Group();
    grp.position.copy(fp(s.x + s.nx * 0.001, s.y + s.ny * 0.001, 0));
    grp.rotation.y = Math.atan2(s.ny, s.nx);
    const body = parts.PinStandup.clone(true);
    body.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const wob = new THREE.Group();
    wob.add(body);
    const geo = new THREE.PlaneGeometry(0.02, 0.02);
    const uv = geo.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setX(k, (i + uv.getX(k)) / 4);
    const mat = own(new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.35, emissive: hex('xr-pinball-white'), emissiveMap: faceTex, emissiveIntensity: 0.2 }));
    owned.push(geo);
    const face = new THREE.Mesh(geo, mat);
    face.rotation.y = Math.PI / 2;
    face.position.set(0.0022, 0.0175, 0);
    wob.add(face);
    grp.add(wob);
    grp.userData.noFit = true;
    field.add(grp);
    return { wob, mat, hit: 0 };
  });

  // ---- spinner on the top arch ----
  const sp = table.spinner;
  const spin = new THREE.Group();
  spin.position.copy(fp(sp.x, sp.y, 0));
  spin.rotation.y = Math.atan2(Math.cos(sp.a), -Math.sin(sp.a));
  spin.scale.setScalar(0.88);
  spin.userData.noFit = true;
  spin.add(parts.PinSpinner.clone(true));
  const flap = parts.PinSpinnerFlap.clone(true);
  flap.position.y = 0.031;
  const fc = canvas(256, 128);
  {
    const c = fc.ctx;
    const g = c.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, color('xr-pinball-ai'));
    g.addColorStop(1, color('xr-pinball-ch-app'));
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 128);
    c.strokeStyle = color('xr-pinball-sticker');
    c.lineWidth = 10;
    c.beginPath();
    c.moveTo(48, 64);
    c.quadraticCurveTo(128, 6, 208, 64);
    c.quadraticCurveTo(128, 122, 48, 64);
    c.stroke();
    c.fillStyle = color('xr-pinball-sticker');
    c.beginPath();
    c.arc(128, 64, 22, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = color('xr-pinball-apron-ink');
    c.beginPath();
    c.arc(128, 64, 10, 0, Math.PI * 2);
    c.fill();
  }
  const flapTex = own(texture(fc.c));
  const flapMat = own(new THREE.MeshStandardMaterial({ map: flapTex, roughness: 0.3, metalness: 0.2, side: THREE.DoubleSide }));
  const decal = new THREE.Mesh(own(new THREE.PlaneGeometry(0.042, 0.021)), flapMat);
  decal.rotation.y = Math.PI / 2;
  decal.position.set(0.001, -0.0125, 0);
  const decal2 = decal.clone();
  decal2.position.x = -0.001;
  flap.add(decal, decal2);
  spin.add(flap);
  field.add(spin);
  const spinner = { angle: 0, omega: 0, turns: 0 };

  // ---- star rollovers (top lanes) and wire rollovers (in- and outlanes) ----
  const starPos = table.lanes.map((ln) => [ln.x, 0.914]);
  const stars = instancedPart(parts.PinStar, starPos.map(([x, y]) => at(x, y, 0)));
  const starPress = starPos.map(() => 0);
  const rolls = table.rollovers;
  const wires = instancedPart(parts.PinRollover, rolls.map((r) => at(r.x, r.y, 0, Math.PI / 2)));
  const wirePress = rolls.map(() => 0);
  field.add(stars.group, wires.group);

  // ---- kickback ----
  const kick = parts.PinKickback.clone(true);
  kick.position.copy(fp(KICKBACK.x, KICKBACK.tip, 0));
  kick.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  field.add(kick);
  let kickT = 1;

  // ---- ball trough window in the apron ----
  const trough = new THREE.Group();
  trough.userData.noFit = true;
  const tw = 0.13;
  const th = 0.026;
  const tx = -0.0085;
  const ty = 0.006;
  const troughMat = own(new THREE.MeshStandardMaterial({ color: hex('xr-pinball-trough'), roughness: 0.6 }));
  const win = new THREE.Mesh(own(new THREE.ShapeGeometry(roundRectShape(tx - tw / 2, ty - th / 2, tw, th, 0.008))), troughMat);
  win.rotation.x = -Math.PI / 2;
  win.position.y = 0.0353;
  const rim = new THREE.Shape();
  rim.copy(roundRectShape(tx - tw / 2 - 0.003, ty - th / 2 - 0.003, tw + 0.006, th + 0.006, 0.01));
  rim.holes.push(roundRectShape(tx - tw / 2, ty - th / 2, tw, th, 0.008));
  const rimMat = own(new THREE.MeshStandardMaterial({ color: hex('xr-pinball-chrome'), metalness: 1, roughness: 0.18 }));
  const rimMesh = new THREE.Mesh(own(new THREE.ShapeGeometry(rim)), rimMat);
  rimMesh.rotation.x = -Math.PI / 2;
  rimMesh.position.y = 0.0356;
  const ballMat = own(new THREE.MeshStandardMaterial({ color: hex('xr-pinball-ball'), metalness: 0.95, roughness: 0.12 }));
  const tBalls = new THREE.InstancedMesh(own(new THREE.SphereGeometry(0.0115, 20, 12)), ballMat, 4);
  for (let i = 0; i < 4; i++) tBalls.setMatrixAt(i, new THREE.Matrix4().makeTranslation(...fp(tx + tw / 2 - 0.016 - i * 0.0255, ty, 0.031).toArray()));
  tBalls.count = 2;
  trough.add(win, rimMesh, tBalls);
  field.add(trough);

  // ---- price card in the coin door ----
  if (anchors.PriceCardAnchor) {
    const pcv = canvas(512, 288);
    const c = pcv.ctx;
    c.fillStyle = color('xr-pinball-price-card');
    c.fillRect(0, 0, 512, 288);
    c.fillStyle = color('xr-pinball-accent');
    c.fillRect(0, 0, 512, 70);
    c.fillStyle = color('xr-pinball-sticker');
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = font('black', 40);
    c.fillText(t('pinballName').toUpperCase(), 256, 37, 480);
    c.fillStyle = color('xr-pinball-apron-ink');
    c.font = font('black', 52);
    c.fillText(t('pinballPrice1'), 256, 136, 480);
    c.font = font('bold', 44);
    c.fillText(t('pinballPrice2'), 256, 222, 480);
    const cardTex = own(texture(pcv.c));
    const card = new THREE.Mesh(own(new THREE.PlaneGeometry(0.048, 0.027)), own(new THREE.MeshBasicMaterial({ map: cardTex, toneMapped: false })));
    card.position.copy(anchors.PriceCardAnchor);
    card.userData.noFit = true;
    root.add(card);
  }

  const m4 = new THREE.Matrix4();
  return {
    owned,
    /** A persona standup was hit (it wobbles). */
    standupHit(i) { if (standups[i]) standups[i].hit = 1; },
    /** The ball went through the spinner at this speed. */
    spin(speed) { spinner.omega = Math.min(70, Math.max(spinner.omega, 12 + speed * 28)); },
    /** The kickback fires. */
    kick() { kickT = 0; },
    /** A top lane star rollover or an in- / outlane wire rollover is pressed. */
    lanePress(i) { if (i in starPress) starPress[i] = 1; },
    rollPress(i) { if (i in wirePress) wirePress[i] = 1; },
    slingFlash(i) { if (slingFlash[i]) slingFlash[i].userData.k = 1; },
    /** Spare balls in the trough. */
    setTrough(n) { tBalls.count = Math.max(0, Math.min(4, n)); },
    /** Per frame; onTurn() is called for each full turn of the spinner (the tick sound). */
    update(dt, time, { lampsOn = 0.6, onTurn } = {}) {
      for (const s of standups) {
        s.hit = Math.max(0, s.hit - dt * 5);
        s.wob.rotation.z = -Math.sin(s.hit * Math.PI * 3) * s.hit * 0.25;
        s.mat.emissiveIntensity = 0.2 + s.hit * 1.2;
      }
      if (spinner.omega > 0.05) {
        spinner.angle += spinner.omega * dt;
        spinner.omega *= Math.exp(-dt * 1.4);
        const turns = Math.floor(spinner.angle / (Math.PI * 2));
        if (turns > spinner.turns) { spinner.turns = turns; onTurn?.(); }
      } else {
        // Back to hanging: a little pendulum.
        const a = spinner.angle % (Math.PI * 2);
        spinner.angle -= (a > Math.PI ? a - Math.PI * 2 : a) * Math.min(1, dt * 6);
        spinner.omega = 0;
      }
      flap.rotation.z = -spinner.angle;
      starPress.forEach((k, i) => {
        if (k <= 0) return;
        starPress[i] = Math.max(0, k - dt * 4);
        stars.set(i, m4.compose(fp(starPos[i][0], starPos[i][1], -0.0016 * starPress[i]), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)));
      });
      wirePress.forEach((k, i) => {
        if (k <= 0) return;
        wirePress[i] = Math.max(0, k - dt * 5);
        wires.set(i, at(rolls[i].x, rolls[i].y, 0, Math.PI / 2, 1, 1 - 0.7 * wirePress[i], 1));
      });
      if (kickT < 1) {
        kickT = Math.min(1, kickT + dt * 6);
        const out = kickT < 0.25 ? kickT / 0.25 : 1 - (kickT - 0.25) / 0.75;
        kick.position.z = -KICKBACK.tip - out * 0.014;
      }
      for (const fl of slingFlash) {
        fl.userData.k = Math.max(0, fl.userData.k - dt * 5);
        fl.userData.flash(Math.max(fl.userData.k, lampsOn * 0.15));
      }
      plasticMat.emissiveIntensity = (lite ? 0.45 : 0.3) * (0.6 + 0.6 * lampsOn);
    },
    dispose() {
      for (const o of owned) o?.dispose?.();
      owned.length = 0;
    },
  };
}
