// Campaign Pinball: the backglass, a creative studio on a winter evening. On the left the
// campaign board (channel cards, the target groups, the funnel on sticky notes, red strings), on
// the right a window onto the small town in the snow with fairy lights, below it a monitor with
// the live KPI chart (reach over time, clicks per channel, new customers: drawn by makeKpiChart
// on its own small texture), a desk with a laptop and a mug at the bottom. Painted from tokens.
import * as THREE from 'three';
import { color, font } from './tokens.js';
import { t, getLang } from './i18n.js';
import { CHRISTMAS } from './christmas.js';
import { WINTER } from './snow.js';
import { CHANNELS, GROUPS } from './pinball-layout.js';
import { drawGlyph, CH_TOKEN } from './pinball-visuals.js';

export const BG_W = 1024;
export const BG_H = 732;
/** Where the live chart sits on the picture (pixels). */
export const CHART = { x: 606, y: 470, w: 384, h: 168 };

export const fmt = (n, digits = 0) => new Intl.NumberFormat(getLang() === 'de' ? 'de-DE' : 'en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);

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

function fitFont(ctx, text, weight, px, maxW) {
  let p = px;
  ctx.font = font(weight, p);
  while (ctx.measureText(text).width > maxW && p > 10) { p -= 1; ctx.font = font(weight, p); }
  return p;
}

/** The little town at night (inside the window). */
function drawTown(ctx, x0, y0, w, h, rnd) {
  const sky = ctx.createLinearGradient(0, y0, 0, y0 + h);
  sky.addColorStop(0, color('xr-pinball-sky-top'));
  sky.addColorStop(1, color('xr-pinball-sky-bottom'));
  ctx.fillStyle = sky;
  ctx.fillRect(x0, y0, w, h);
  ctx.fillStyle = color('xr-pinball-star');
  for (let i = 0; i < 40; i++) {
    ctx.globalAlpha = 0.4 + rnd() * 0.6;
    ctx.fillRect(x0 + rnd() * w, y0 + rnd() * h * 0.4, 2, 2);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = color('xr-pinball-snow');
  ctx.beginPath();
  ctx.arc(x0 + w * 0.85, y0 + h * 0.18, 18, 0, Math.PI * 2);
  ctx.fill();
  const ground = y0 + h * 0.86;
  const houses = ['xr-pinball-house-1', 'xr-pinball-house-2', 'xr-pinball-house-3', 'xr-pinball-house-4', 'xr-pinball-house-5', 'xr-pinball-house-6'];
  let x = x0 - 10;
  let i = 0;
  while (x < x0 + w) {
    const hw = 50 + rnd() * 30;
    const hh = 70 + rnd() * 70;
    const top = ground - hh;
    ctx.fillStyle = color(houses[i % houses.length]);
    ctx.fillRect(x, top, hw, hh);
    ctx.fillStyle = color('xr-pinball-house-roof');
    ctx.beginPath();
    ctx.moveTo(x - 4, top + 2);
    ctx.lineTo(x + hw / 2, top - hw * 0.45);
    ctx.lineTo(x + hw + 4, top + 2);
    ctx.fill();
    if (WINTER) {
      ctx.fillStyle = color('xr-pinball-snow');
      ctx.beginPath();
      ctx.moveTo(x - 5, top + 1);
      ctx.lineTo(x + hw / 2, top - hw * 0.45 - 3);
      ctx.lineTo(x + hw + 5, top + 1);
      ctx.lineTo(x + hw / 2, top - hw * 0.45 + 8);
      ctx.fill();
    }
    for (let r = 0; r < Math.floor((hh - 20) / 32); r++) {
      for (let k = 0; k < 2; k++) {
        ctx.fillStyle = color(rnd() < 0.75 ? 'xr-pinball-window' : 'xr-pinball-sky-top');
        ctx.fillRect(x + 10 + k * (hw / 2), top + 14 + r * 32, 12, 16);
      }
    }
    x += hw + 4;
    i += 1;
  }
  if (CHRISTMAS) {
    const tx = x0 + w * 0.5;
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = color(k % 2 ? 'xr-pinball-tree-light' : 'xr-pinball-tree');
      ctx.beginPath();
      ctx.moveTo(tx - 40 + k * 10, ground - k * 26);
      ctx.lineTo(tx, ground - 50 - k * 26);
      ctx.lineTo(tx + 40 - k * 10, ground - k * 26);
      ctx.fill();
    }
    ctx.fillStyle = color('xr-pinball-lamp');
    ctx.beginPath();
    ctx.arc(tx, ground - 106, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = color(WINTER ? 'xr-pinball-snow' : 'xr-pinball-cobble');
  ctx.fillRect(x0, ground, w, y0 + h - ground);
}

/** A pinned card with an icon on a colored square and a caption. */
function card(ctx, x, y, w, h, tone, glyph, caption, tilt) {
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(tilt);
  ctx.fillStyle = color('xr-pinball-shadow');
  ctx.fillRect(-w / 2 + 5, -h / 2 + 6, w, h);
  ctx.fillStyle = color('xr-pinball-sticker');
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.fillStyle = color(tone);
  ctx.fillRect(-w / 2 + 8, -h / 2 + 8, w - 16, h - 38);
  drawGlyph(ctx, glyph, 0, -h / 2 + 8 + (h - 38) / 2, Math.min(w, h) * 0.5, color('xr-pinball-sticker'), 2.4);
  ctx.fillStyle = color('xr-pinball-apron-ink');
  fitFont(ctx, caption, 'black', 17, w - 10);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(caption, 0, h / 2 - 15);
  ctx.fillStyle = color('xr-pinball-accent');
  ctx.beginPath();
  ctx.arc(0, -h / 2 + 2, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Paints the studio; returns the canvas and the fairy-light points (0..1 of the picture). */
export function drawStudio() {
  const W = BG_W;
  const H = BG_H;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const rnd = mulberry(23);
  // Wall with vertical panels.
  const wall = ctx.createLinearGradient(0, 0, 0, H);
  wall.addColorStop(0, color('xr-pinball-studio-wall-top'));
  wall.addColorStop(1, color('xr-pinball-studio-wall'));
  ctx.fillStyle = wall;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = color('xr-pinball-shadow');
  for (let x = 0; x < W; x += 64) ctx.fillRect(x, 120, 2, H);
  // Title band: neon lettering.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const title = t('pinballName').toUpperCase();
  const px = fitFont(ctx, title, 'black', 72, W * 0.86);
  ctx.font = font('black', px);
  ctx.shadowColor = color('xr-pinball-title-glow');
  ctx.shadowBlur = 30;
  ctx.fillStyle = color('xr-pinball-title-glow');
  ctx.fillText(title, W / 2, 70);
  ctx.shadowBlur = 12;
  ctx.fillStyle = color('xr-pinball-title');
  ctx.fillText(title, W / 2, 66);
  ctx.shadowBlur = 0;
  // Campaign board (cork) with cards, groups and the funnel.
  const bx = 30;
  const by = 140;
  const bw = 548;
  const bh = 405;
  ctx.fillStyle = color('xr-pinball-board-frame');
  ctx.fillRect(bx - 12, by - 12, bw + 24, bh + 24);
  ctx.fillStyle = color('xr-pinball-board');
  ctx.fillRect(bx, by, bw, bh);
  ctx.fillStyle = color('xr-pinball-shadow');
  for (let i = 0; i < 260; i++) ctx.fillRect(bx + rnd() * bw, by + rnd() * bh, 2, 2);
  // Header card.
  ctx.fillStyle = color('xr-pinball-accent');
  ctx.fillRect(bx + bw / 2 - 150, by + 12, 300, 44);
  ctx.fillStyle = color('xr-pinball-sticker');
  fitFont(ctx, t('pinballBoard'), 'black', 28, 280);
  ctx.fillText(t('pinballBoard'), bx + bw / 2, by + 35);
  // Channel cards in two rows, connected by red strings.
  const cw = 150;
  const chh = 100;
  const pos = CHANNELS.map((ch, i) => [bx + 22 + (i % 3) * 175, by + 70 + Math.floor(i / 3) * 114]);
  ctx.strokeStyle = color('xr-pinball-accent');
  ctx.lineWidth = 3;
  ctx.beginPath();
  pos.forEach(([x, y], i) => (i ? ctx.lineTo(x + cw / 2, y) : ctx.moveTo(x + cw / 2, y)));
  ctx.stroke();
  CHANNELS.forEach((ch, i) => card(ctx, pos[i][0], pos[i][1], cw, chh, CH_TOKEN[ch], ch, t(`pinballCh_${ch}`), (rnd() - 0.5) * 0.12));
  // The funnel on three sticky notes, getting narrower.
  const fy = by + 296;
  const stages = [t('pinballFunnel1'), t('pinballFunnel2'), t('pinballFunnel3')];
  stages.forEach((s, i) => {
    const w = 170 - i * 26;
    const x = bx + 26 + i * 178 + i * 13;
    ctx.save();
    ctx.translate(x + w / 2, fy + 35);
    ctx.rotate((rnd() - 0.5) * 0.1);
    ctx.fillStyle = color(`xr-pinball-funnel-${i + 1}`);
    ctx.fillRect(-w / 2, -35, w, 70);
    ctx.fillStyle = color('xr-pinball-apron-ink');
    fitFont(ctx, s, 'black', 22, w - 14);
    ctx.fillText(s, 0, -8);
    ctx.font = font('bold', 24);
    ctx.fillText(String(i + 1), 0, 20);
    ctx.restore();
    if (i < 2) {
      ctx.fillStyle = color('xr-pinball-sticker');
      ctx.beginPath();
      ctx.moveTo(x + w + 6, fy + 25);
      ctx.lineTo(x + w + 22, fy + 35);
      ctx.lineTo(x + w + 6, fy + 45);
      ctx.fill();
    }
  });
  // Target groups as little round portraits along the bottom of the board.
  GROUPS.forEach((g, i) => {
    const x = bx + 70 + i * 136;
    const y = by + bh - 20;
    ctx.fillStyle = color(`xr-pinball-group-${i + 1}`);
    ctx.beginPath();
    ctx.arc(x, y, 17, 0, Math.PI * 2);
    ctx.fill();
    drawGlyph(ctx, g, x, y, 24, color('xr-pinball-apron-ink'), 2.4);
  });
  // Window onto the town, with a white frame and mullions.
  const wx = 606;
  const wy = 140;
  const ww = 384;
  const wh = 300;
  drawTown(ctx, wx, wy, ww, wh, rnd);
  ctx.strokeStyle = color('xr-pinball-sticker');
  ctx.lineWidth = 12;
  ctx.strokeRect(wx, wy, ww, wh);
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(wx + ww / 2, wy);
  ctx.lineTo(wx + ww / 2, wy + wh);
  ctx.moveTo(wx, wy + wh * 0.42);
  ctx.lineTo(wx + ww, wy + wh * 0.42);
  ctx.stroke();
  if (WINTER) {
    ctx.fillStyle = color('xr-pinball-snow');
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.ellipse(wx + ww / 2, wy + wh - 2, ww / 2, 10, 0, Math.PI, 0);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  // Monitor frame for the live chart.
  ctx.fillStyle = color('xr-pinball-phone');
  ctx.fillRect(CHART.x - 10, CHART.y - 10, CHART.w + 20, CHART.h + 20);
  ctx.fillRect(CHART.x + CHART.w / 2 - 14, CHART.y + CHART.h + 10, 28, 20);
  // Desk with a laptop, a mug and a plant.
  const dy = 650;
  ctx.fillStyle = color('xr-pinball-desk');
  ctx.fillRect(0, dy, W, H - dy);
  ctx.fillStyle = color('xr-pinball-shadow');
  ctx.fillRect(0, dy, W, 8);
  ctx.fillStyle = color('xr-pinball-chrome');
  ctx.beginPath();
  ctx.moveTo(180, dy + 4);
  ctx.lineTo(360, dy + 4);
  ctx.lineTo(376, dy + 28);
  ctx.lineTo(164, dy + 28);
  ctx.fill();
  ctx.fillStyle = color('xr-pinball-phone');
  ctx.fillRect(194, dy - 98, 152, 102);
  const lap = ctx.createLinearGradient(200, dy - 92, 340, dy - 4);
  lap.addColorStop(0, color('xr-pinball-ch-app'));
  lap.addColorStop(1, color('xr-pinball-ch-social'));
  ctx.fillStyle = lap;
  ctx.fillRect(200, dy - 92, 140, 88);
  ctx.fillStyle = color('xr-pinball-sticker');
  ctx.fillRect(212, dy - 80, 80, 12);
  ctx.fillRect(212, dy - 62, 116, 7);
  ctx.fillRect(212, dy - 50, 100, 7);
  ctx.fillStyle = color('xr-pinball-ch-poster');
  ctx.fillRect(212, dy - 36, 56, 24);
  // Mug with steam.
  ctx.fillStyle = color('xr-pinball-accent');
  ctx.fillRect(460, dy - 50, 46, 54);
  ctx.strokeStyle = color('xr-pinball-accent');
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(510, dy - 24, 14, -Math.PI / 2, Math.PI / 2);
  ctx.stroke();
  ctx.strokeStyle = color('xr-pinball-sticker');
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 4;
  for (const sx of [474, 492]) {
    ctx.beginPath();
    ctx.moveTo(sx, dy - 60);
    ctx.bezierCurveTo(sx - 10, dy - 80, sx + 10, dy - 90, sx, dy - 110);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // Plant.
  ctx.fillStyle = color('xr-pinball-trunk');
  ctx.fillRect(560, dy - 36, 44, 40);
  ctx.fillStyle = color('xr-pinball-tree-light');
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    ctx.ellipse(582 + (i - 3) * 10, dy - 56 - (i % 2) * 12, 9, 26, (i - 3) * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Fairy lights along the window frame and in two swags under the title.
  const bulbs = [];
  if (CHRISTMAS) {
    for (let i = 0; i <= 14; i++) bulbs.push([wx + (ww * i) / 14, wy - 4 + Math.sin(i * 0.9) * 3]);
    for (let i = 1; i <= 9; i++) bulbs.push([wx - 4, wy + (wh * i) / 10]);
    for (let i = 1; i <= 9; i++) bulbs.push([wx + ww + 4, wy + (wh * i) / 10]);
    ctx.strokeStyle = color('xr-pinball-dark');
    ctx.lineWidth = 2;
    for (const [a, b] of [[20, 500], [524, 1004]]) {
      ctx.beginPath();
      for (let i = 0; i <= 20; i++) {
        const u = i / 20;
        const x = a + (b - a) * u;
        const y = 118 + 22 * 4 * u * (1 - u);
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        if (i % 2 === 1) bulbs.push([x, y + 4]);
      }
      ctx.stroke();
    }
  }
  return { canvas: c, bulbs: bulbs.map(([x, y]) => [x / W, y / H]) };
}

/** The live KPI chart on the studio's monitor: set({ reach, clicks, customers, history, perChannel }). */
export function makeKpiChart(w, h) {
  const cw = CHART.w;
  const ch = CHART.h;
  const c = document.createElement('canvas');
  c.width = cw;
  c.height = ch;
  const ctx = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  mesh.userData.noFit = true;
  const set = ({ reach = 0, clicks = 0, customers = 0, history = [], perChannel = {} } = {}) => {
    ctx.fillStyle = color('xr-pinball-cabinet-dark');
    ctx.fillRect(0, 0, cw, ch);
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    const cols = [
      [t('pinballKpiReach'), fmt(reach), 'xr-pinball-funnel-1'],
      [t('pinballKpiClicks'), fmt(clicks), 'xr-pinball-funnel-2'],
      [t('pinballKpiCustomers'), fmt(customers), 'xr-pinball-funnel-3'],
    ];
    cols.forEach(([label, value, tone], i) => {
      const x = 10 + i * 126;
      ctx.fillStyle = color('xr-pinball-field-text');
      fitFont(ctx, label, 'bold', 15, 118);
      ctx.fillText(label, x, 8);
      ctx.fillStyle = color(tone);
      fitFont(ctx, value, 'black', 30, 118);
      ctx.fillText(value, x, 26);
    });
    // Reach over time.
    const gx = 10;
    const gy = 66;
    const gw = 230;
    const gh = 92;
    ctx.strokeStyle = color('xr-pinball-street');
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(gx, gy + (gh * i) / 3);
      ctx.lineTo(gx + gw, gy + (gh * i) / 3);
      ctx.stroke();
    }
    const pts = history.length ? history : [0];
    const max = Math.max(1, ...pts);
    ctx.beginPath();
    pts.forEach((v, i) => {
      const x = gx + (gw * i) / Math.max(1, pts.length - 1);
      const y = gy + gh - (v / max) * gh;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    ctx.lineTo(gx + gw, gy + gh);
    ctx.lineTo(gx, gy + gh);
    ctx.closePath();
    ctx.fillStyle = color('xr-pinball-ai-band');
    ctx.fill();
    ctx.beginPath();
    pts.forEach((v, i) => {
      const x = gx + (gw * i) / Math.max(1, pts.length - 1);
      const y = gy + gh - (v / max) * gh;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    ctx.strokeStyle = color('xr-pinball-funnel-1');
    ctx.lineWidth = 3;
    ctx.stroke();
    // Clicks per channel.
    const bx = 256;
    const maxC = Math.max(1, ...CHANNELS.map((q) => perChannel[q] ?? 0));
    CHANNELS.forEach((q, i) => {
      const v = perChannel[q] ?? 0;
      const bh = (v / maxC) * 70;
      ctx.fillStyle = color(CH_TOKEN[q]);
      ctx.fillRect(bx + i * 20, gy + gh - 18 - bh, 14, bh + 2);
      drawGlyph(ctx, q, bx + i * 20 + 7, gy + gh - 6, 14, color(CH_TOKEN[q]), 2.6);
    });
    tex.needsUpdate = true;
  };
  set();
  return { mesh, set, tex };
}
