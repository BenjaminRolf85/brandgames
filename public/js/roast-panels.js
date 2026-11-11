// "Röstmeister" (Roast Master): canvas panels in the design tokens. The guest's speech bubble,
// the kraft paper tags on the jars (flavor bars), the AI panel (what it hears, similar guests,
// its suggestion with confidence and the taste map of all rated cups), the blend bar with its
// two shares, the roast gauge (stages, cracks, the AI's stop mark) and star and score sprites.
import * as THREE from 'three';
import { Panel, roundRect, wrap, measureBlocks } from './ui3d.js';
import { color, num, font } from './tokens.js';
import { t } from './i18n.js';
import { FLAVORS, BEANS, STAGES, FIRST_CRACK, SECOND_CRACK, RATIOS, stageOf } from './roast-ai.js';

const FLAVOR_TOKEN = { fruity: 'xr-roast-fruity', nutty: 'xr-roast-nutty', choc: 'xr-roast-choc', spicy: 'xr-roast-spicy' };
const FLAVOR_INK = { fruity: 'xr-roast-fruity-ink', nutty: 'xr-roast-nutty-ink', choc: 'xr-roast-choc-ink', spicy: 'xr-roast-spicy-ink' };
const STAGE_TOKEN = { green: 'xr-roast-bean-green', yellow: 'xr-roast-bean-yellow', cinnamon: 'xr-roast-bean-cinnamon', medium: 'xr-roast-bean-medium', dark: 'xr-roast-bean-dark', burnt: 'xr-roast-bean-burnt' };
/** The main flavor of each bean (its color on the blend bar). */
export const BEAN_TOKEN = BEANS.map((b) => FLAVOR_TOKEN[FLAVORS[b.flavor.indexOf(Math.max(...b.flavor))]]);
export const STARS_TOKEN = ['xr-danger', 'xr-danger', 'xr-warning', 'xr-warning', 'xr-success', 'xr-success'];
export const stageName = (r) => t(`roastStage_${stageOf(r).key}`);
export const beanName = (i) => t(`roastBean_${BEANS[i].key}`);

const sz = (tk) => num(tk);

function text(ctx, p, s, x, y, { size = 'xr-text-sm', weight = 'regular', col = 'xr-panel-text', align = 'left', base = 'middle', max } = {}) {
  ctx.font = font(weight, p.m(Math.max(sz(size), sz('xr-text-min'))));
  ctx.fillStyle = col.startsWith('xr-') ? color(col) : col;
  ctx.textAlign = align;
  ctx.textBaseline = base;
  ctx.fillText(s, p.m(x), p.m(y), max ? p.m(max) : undefined);
}

/** Wrapped text from (x, y) (top), returns the y below it. */
function para(ctx, p, s, x, y, w, { size = 'xr-text-sm', weight = 'regular', col = 'xr-panel-text', lh = 1.22 } = {}) {
  const px = p.m(Math.max(sz(size), sz('xr-text-min')));
  ctx.font = font(weight, px);
  ctx.fillStyle = color(col);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const lines = wrap(ctx, s, p.m(w));
  lines.forEach((l, i) => ctx.fillText(l, p.m(x), p.m(y) + i * px * lh));
  return y + (lines.length * px * lh) / p.px;
}

/** A five-pointed star centered at (x, y), outer radius r (pixels). */
export function starPath(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
}

function stars(ctx, p, n, x, y, r, gap) {
  for (let i = 0; i < 5; i++) {
    starPath(ctx, p.m(x + i * gap), p.m(y), p.m(r));
    ctx.fillStyle = color(i < n ? 'xr-roast-star' : 'xr-roast-star-empty');
    ctx.fill();
  }
}

/** Little line icons for the four flavors: a cherry, a hazelnut, a chocolate square, star anise. */
export function flavorIcon(ctx, key, x, y, s, col) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = col;
  ctx.strokeStyle = col;
  ctx.lineWidth = s * 0.12;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (key === 'fruity') {
    ctx.beginPath(); ctx.arc(-s * 0.2, s * 0.18, s * 0.24, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(s * 0.24, s * 0.22, s * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-s * 0.18, -s * 0.05); ctx.quadraticCurveTo(0, -s * 0.45, s * 0.1, -s * 0.48); ctx.quadraticCurveTo(s * 0.18, -s * 0.2, s * 0.22, 0); ctx.stroke();
  } else if (key === 'nutty') {
    ctx.beginPath(); ctx.ellipse(0, s * 0.08, s * 0.3, s * 0.36, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-s * 0.36, -s * 0.12); ctx.quadraticCurveTo(0, -s * 0.5, s * 0.36, -s * 0.12); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, -s * 0.34); ctx.lineTo(0, -s * 0.5); ctx.stroke();
  } else if (key === 'choc') {
    roundRect(ctx, -s * 0.38, -s * 0.38, s * 0.76, s * 0.76, s * 0.1); ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = s * 0.08;
    ctx.beginPath(); ctx.moveTo(0, -s * 0.38); ctx.lineTo(0, s * 0.38); ctx.moveTo(-s * 0.38, 0); ctx.lineTo(s * 0.38, 0); ctx.stroke();
  } else {
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8;
      const r = i % 2 ? s * 0.16 : s * 0.46;
      ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// ---------- speech bubble ----------

/**
 * The guest's speech bubble (cream with a tail at the bottom). stars: 0 = none. active: the guest
 * you prepare for now (a thick warm border). tail: 'left' (bubble beside the head) or 'center'.
 */
export function bubblePanel({ name, body, sub = null, stars: n = 0, w = 0.66, active = false, tail: tailAt = 'left', bodySize = 'xr-text-md' }) {
  const pad = 0.035;
  const blocks = [{ text: name, size: 'xr-text-sm', weight: 'bold', gap: 0.012 }];
  if (body) blocks.push({ text: body, size: bodySize, weight: 'bold', gap: 0.012 });
  if (sub) blocks.push({ text: sub, size: 'xr-text-sm', gap: 0.012 });
  const starH = n ? 0.065 : 0;
  const tail = 0.045;
  const h = measureBlocks(blocks, w, pad) + starH + tail;
  const p = new Panel(w, h, (ctx, c) => {
    const W = c.canvas.width;
    const H = c.canvas.height - c.m(tail);
    const bw = active ? 0.009 : 0;
    roundRect(ctx, c.m(0.004 + bw / 2), c.m(0.004 + bw / 2), W - c.m(0.008 + bw), H - c.m(0.008 + bw), c.m(0.04));
    ctx.fillStyle = color('xr-roast-bubble');
    ctx.fill();
    if (active) {
      ctx.lineWidth = c.m(bw);
      ctx.strokeStyle = color('xr-roast-active');
      ctx.stroke();
    }
    // the tail points down to the guest's head (left: the bubble sits beside it)
    const tx = tailAt === 'center' ? W / 2 : c.m(0.07);
    ctx.beginPath();
    ctx.moveTo(tx - c.m(0.04), H - c.m(0.012));
    ctx.lineTo(tailAt === 'center' ? tx : c.m(0.012), H + c.m(tail) - c.m(0.004));
    ctx.lineTo(tx + c.m(0.05), H - c.m(0.012));
    ctx.closePath();
    ctx.fillStyle = color(active ? 'xr-roast-active' : 'xr-roast-bubble');
    ctx.fill();
    let y = pad;
    y = para(ctx, c, name, pad, y, w - pad * 2, { size: 'xr-text-sm', weight: 'bold', col: 'xr-roast-bubble-muted' }) + 0.012;
    if (body) y = para(ctx, c, body, pad, y, w - pad * 2, { size: bodySize, weight: 'bold', col: 'xr-roast-bubble-ink' }) + 0.012;
    if (sub) y = para(ctx, c, sub, pad, y, w - pad * 2, { size: 'xr-text-sm', col: 'xr-roast-bubble-muted' }) + 0.012;
    if (n) stars(ctx, c, n, pad + 0.03, y + 0.03, 0.026, 0.065);
  });
  return p;
}

// ---------- jar tags ----------

/** Kraft paper tag of a jar: the bean's name, its two notes and four flavor bars. */
export function jarTag(i) {
  const w = 0.215;
  const h = 0.185;
  const p = new Panel(w, h, (ctx, c) => {
    const { selected, hover } = c.state;
    const W = c.canvas.width;
    const H = c.canvas.height;
    roundRect(ctx, c.m(0.004), c.m(0.004), W - c.m(0.008), H - c.m(0.008), c.m(0.02));
    ctx.fillStyle = color('xr-roast-tag');
    ctx.fill();
    ctx.lineWidth = c.m(selected ? 0.009 : hover ? 0.006 : 0.003);
    ctx.strokeStyle = color(selected ? 'xr-roast-tag-pick' : 'xr-roast-tag-edge');
    ctx.stroke();
    // hole with a string
    ctx.beginPath();
    ctx.arc(W / 2, c.m(0.016), c.m(0.006), 0, Math.PI * 2);
    ctx.fillStyle = color('xr-roast-tag-edge');
    ctx.fill();
    // the number (its key on a keyboard) in a circle, green when chosen, then the name
    ctx.beginPath();
    ctx.arc(c.m(0.03), c.m(0.046), c.m(0.016), 0, Math.PI * 2);
    ctx.fillStyle = color(selected ? 'xr-roast-tag-pick' : 'xr-roast-tag-edge');
    ctx.fill();
    text(ctx, c, String(i + 1), 0.03, 0.047, { size: 'xr-text-min', weight: 'black', col: selected ? 'xr-on-primary' : 'xr-roast-tag', align: 'center' });
    text(ctx, c, beanName(i), 0.054, 0.046, { size: 'xr-text-min', weight: 'black', col: 'xr-roast-tag-ink', max: w - 0.066 });
    // four bars: icon + filled bar
    const flav = BEANS[i].flavor;
    FLAVORS.forEach((f, k) => {
      const y = 0.083 + k * 0.026;
      flavorIcon(ctx, f, c.m(0.03), c.m(y), c.m(0.022), color(FLAVOR_INK[f]));
      roundRect(ctx, c.m(0.05), c.m(y - 0.007), c.m(0.145), c.m(0.014), c.m(0.007));
      ctx.fillStyle = color('xr-roast-tag-edge');
      ctx.globalAlpha = 0.35;
      ctx.fill();
      ctx.globalAlpha = 1;
      roundRect(ctx, c.m(0.05), c.m(y - 0.007), c.m(0.145 * Math.max(0.08, flav[k])), c.m(0.014), c.m(0.007));
      ctx.fillStyle = color(FLAVOR_INK[f]);
      ctx.fill();
    });
  });
  p.userData.interactive = true;
  p.userData.setHover = (v) => p.set({ hover: v });
  return p;
}

/** A small label under a gift basket item. */
export function itemTag(label, n) {
  const w = 0.185;
  const h = 0.062;
  const p = new Panel(w, h, (ctx, c) => {
    const { selected, hover, n } = c.state;
    roundRect(ctx, c.m(0.003), c.m(0.003), c.canvas.width - c.m(0.006), c.canvas.height - c.m(0.006), c.m(0.018));
    ctx.fillStyle = color('xr-roast-tag');
    ctx.fill();
    ctx.lineWidth = c.m(selected ? 0.008 : hover ? 0.005 : 0.0025);
    ctx.strokeStyle = color(selected ? 'xr-roast-tag-pick' : 'xr-roast-tag-edge');
    ctx.stroke();
    // the number (its key on a keyboard) in a small circle, then the name
    ctx.beginPath();
    ctx.arc(c.m(0.024), c.m(h / 2), c.m(0.015), 0, Math.PI * 2);
    ctx.fillStyle = color(selected ? 'xr-roast-tag-pick' : 'xr-roast-tag-edge');
    ctx.fill();
    text(ctx, c, String(n), 0.024, h / 2 + 0.001, { size: 'xr-text-min', weight: 'black', col: selected ? 'xr-on-primary' : 'xr-roast-tag', align: 'center' });
    text(ctx, c, label, 0.047, h / 2, { size: 'xr-text-min', weight: 'bold', col: 'xr-roast-tag-ink', max: w - 0.058 });
  });
  p.state.n = n;
  p.redraw();
  p.userData.interactive = true;
  p.userData.setHover = (v) => p.set({ hover: v });
  return p;
}

// ---------- the AI panel ----------

/**
 * What the AI knows and suggests. view: {
 *   count, cues: [words], status: text, kind: 'cold'|'suggest'|'avoid'|'regular'|'basket'|'wait',
 *   title2: text above the recipe, lines: [recipe lines], conf 0..1, dots: [{ x, y, stars, label }],
 *   aim: { x, y, conf } (the suggestion on the map), flash 0..1 (just learned), learned: text }
 */
export class AiPanel extends Panel {
  constructor(w = 0.66, h = 0.9) {
    super(w, h, (ctx, c) => c.paint(ctx));
    this.view = { count: 0, cues: [], status: '', kind: 'wait', lines: [], dots: [] };
    this.redraw();
  }

  show(view) {
    this.view = { ...this.view, ...view };
    this.redraw();
  }

  paint(ctx) {
    if (!this.view) return;
    const v = this.view;
    const { h } = this;
    // Wide panels (phones held upright): text on the left, the taste map on the right.
    const wide = this.w > this.h * 1.4;
    const w = wide ? this.w * 0.6 : this.w;
    const pad = 0.032;
    this.surface({ stroke: color('xr-roast-ai') });
    // glow flash after learning
    if (v.flash > 0) {
      ctx.save();
      roundRect(ctx, 0, 0, this.canvas.width, this.canvas.height, this.m(num('xr-radius')));
      ctx.clip();
      ctx.fillStyle = color('xr-roast-ai-soft');
      ctx.globalAlpha = v.flash;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.restore();
    }
    let y = pad + 0.026;
    text(ctx, this, t('roastAiTitle'), pad, y, { size: 'xr-text-md', weight: 'black', col: 'xr-roast-ai' });
    y += 0.045;
    text(ctx, this, v.count === 1 ? t('roastAiCount1') : t('roastAiCount', { n: v.count }), pad, y, { size: 'xr-text-min', col: 'xr-panel-muted' });
    y += 0.03;
    // what it hears: cue chips
    if (v.cues?.length) {
      ctx.font = font('bold', this.m(sz('xr-text-min')));
      let x = pad;
      const lead = t(v.cueLabel ?? 'roastAiHears', { cues: '' }).trim();
      text(ctx, this, lead, x, y + 0.022, { size: 'xr-text-min', col: 'xr-panel-muted' });
      ctx.font = font('regular', this.m(sz('xr-text-min')));
      x += ctx.measureText(lead).width / this.px + 0.012;
      ctx.font = font('bold', this.m(sz('xr-text-min')));
      for (const cue of v.cues) {
        const cw = ctx.measureText(cue).width / this.px + 0.024;
        if (x + cw > w - pad) break;
        roundRect(ctx, this.m(x), this.m(y + 0.003), this.m(cw), this.m(0.038), this.m(0.019));
        ctx.fillStyle = color('xr-roast-ai-soft');
        ctx.fill();
        text(ctx, this, cue, x + cw / 2, y + 0.023, { size: 'xr-text-min', weight: 'bold', col: 'xr-roast-ai', align: 'center' });
        x += cw + 0.01;
      }
      y += 0.05;
    } else y += 0.008;
    if (v.status) y = para(ctx, this, v.status, pad, y, w - pad * 2, { size: 'xr-text-min', col: v.kind === 'cold' ? 'xr-warning' : 'xr-panel-text' }) + 0.012;
    // the suggestion
    if (v.lines?.length) {
      const boxTop = y;
      let yy = y + 0.016;
      if (v.title2) yy = para(ctx, this, v.title2, pad + 0.016, yy, w - pad * 2 - 0.032, { size: 'xr-text-min', col: 'xr-panel-muted' }) + 0.006;
      v.lines.forEach((l, i) => { yy = para(ctx, this, l, pad + 0.016, yy, w - pad * 2 - 0.032, { size: i === 0 ? 'xr-text-sm' : 'xr-text-min', weight: i === 0 ? 'bold' : 'regular', col: 'xr-panel-text' }) + 0.004; });
      if (v.conf !== undefined && v.conf !== null) {
        yy += 0.008;
        const bw = w - pad * 2 - 0.032;
        const tk = v.conf >= 0.6 ? 'xr-success' : v.conf >= 0.3 ? 'xr-warning' : 'xr-danger';
        roundRect(ctx, this.m(pad + 0.016), this.m(yy), this.m(bw), this.m(0.016), this.m(0.008));
        ctx.fillStyle = color('xr-roast-map-grid');
        ctx.fill();
        roundRect(ctx, this.m(pad + 0.016), this.m(yy), this.m(Math.max(0.016, bw * v.conf)), this.m(0.016), this.m(0.008));
        ctx.fillStyle = color(tk);
        ctx.fill();
        yy += 0.04;
        text(ctx, this, `${t('roastAiConf', { n: Math.round(v.conf * 100) })}${v.conf < 0.3 ? `  ·  ${t('roastAiUnsure')}` : ''}`, pad + 0.016, yy, { size: 'xr-text-min', weight: 'bold', col: tk });
        yy += 0.026;
      }
      roundRect(ctx, this.m(pad), this.m(boxTop), this.m(w - pad * 2), this.m(yy - boxTop + 0.008), this.m(0.02));
      ctx.lineWidth = this.m(0.003);
      ctx.strokeStyle = color('xr-roast-ai');
      ctx.stroke();
      y = yy + 0.024;
    }
    // the taste map
    const mx = wide ? w : pad;
    const mw = wide ? this.w - w - pad : w - pad * 2;
    const mapTop = wide ? pad : Math.max(y, h - 0.37);
    const mapH = h - mapTop - 0.075;
    if (mapH > 0.12) this.drawMap(ctx, mx, mapTop, mw, mapH, v);
    const cx = mx + mw / 2;
    if (v.learned) text(ctx, this, v.learned, cx, h - 0.03, { size: 'xr-text-min', weight: 'bold', col: 'xr-roast-ai', align: 'center', max: mw });
    else text(ctx, this, t('roastMapLegend'), cx, h - 0.03, { size: 'xr-text-min', col: 'xr-panel-muted', align: 'center', max: mw });
  }

  drawMap(ctx, x, y, w, h, v) {
    const m = (q) => this.m(q);
    roundRect(ctx, m(x), m(y), m(w), m(h), m(0.02));
    ctx.fillStyle = color('xr-roast-map-bg');
    ctx.fill();
    // a soft color wash: fruity on top, nutty and chocolatey at the bottom, light left, dark right
    const ix = x + 0.03;
    const iy = y + 0.04;
    const iw = w - 0.06;
    const ih = h - 0.08;
    ctx.strokeStyle = color('xr-roast-map-grid');
    ctx.lineWidth = m(0.002);
    for (let k = 1; k < 4; k++) {
      ctx.beginPath(); ctx.moveTo(m(ix + (iw * k) / 4), m(iy)); ctx.lineTo(m(ix + (iw * k) / 4), m(iy + ih)); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(m(ix), m(iy + (ih * k) / 4)); ctx.lineTo(m(ix + iw), m(iy + (ih * k) / 4)); ctx.stroke();
    }
    text(ctx, this, t('roastMapFruity'), x + w / 2, y + 0.02, { size: 'xr-text-min', weight: 'bold', col: 'xr-roast-fruity', align: 'center' });
    text(ctx, this, t('roastMapRich'), x + w / 2, y + h - 0.02, { size: 'xr-text-min', weight: 'bold', col: 'xr-roast-nutty', align: 'center' });
    ctx.save();
    ctx.translate(m(x + 0.016), m(y + h / 2));
    ctx.rotate(-Math.PI / 2);
    ctx.font = font('bold', m(sz('xr-text-min')));
    ctx.fillStyle = color('xr-roast-bean-yellow');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t('roastMapLight'), 0, 0);
    ctx.restore();
    ctx.save();
    ctx.translate(m(x + w - 0.016), m(y + h / 2));
    ctx.rotate(Math.PI / 2);
    ctx.font = font('bold', m(sz('xr-text-min')));
    ctx.fillStyle = color('xr-roast-bean-cinnamon');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t('roastMapDark'), 0, 0);
    ctx.restore();
    const px = (p) => m(ix + 0.02 + (iw - 0.04) * p.x);
    const py = (p) => m(iy + 0.02 + (ih - 0.04) * (1 - p.y));
    // the suggestion: a ring whose size shows the uncertainty
    if (v.aim) {
      const r = m(0.018 + 0.09 * (1 - v.aim.conf));
      ctx.beginPath();
      ctx.arc(px(v.aim), py(v.aim), r, 0, Math.PI * 2);
      ctx.fillStyle = color('xr-roast-ai-soft');
      ctx.fill();
      ctx.setLineDash([m(0.008), m(0.006)]);
      ctx.lineWidth = m(0.003);
      ctx.strokeStyle = color('xr-roast-ai');
      ctx.stroke();
      ctx.setLineDash([]);
    }
    for (const d of v.dots ?? []) {
      ctx.beginPath();
      ctx.arc(px(d), py(d), m(d.big ? 0.016 : 0.012), 0, Math.PI * 2);
      ctx.fillStyle = color(STARS_TOKEN[d.stars] ?? 'xr-panel-muted');
      ctx.fill();
      ctx.lineWidth = m(0.0025);
      ctx.strokeStyle = color('xr-panel-bg');
      ctx.stroke();
      if (d.label) text(ctx, this, d.label, (px(d) / this.px) + 0.02, py(d) / this.px, { size: 'xr-text-min', weight: 'bold', col: 'xr-panel-muted' });
    }
    if (v.aim) {
      starPath(ctx, px(v.aim), py(v.aim), m(0.016));
      ctx.fillStyle = color('xr-roast-ai');
      ctx.fill();
    }
  }
}

// ---------- blend bar ----------

/** The blend: two colored shares with names and percentages; drag the split or use the buttons. */
export function blendPanel() {
  const w = 0.62;
  const h = 0.16;
  const p = new Panel(w, h, (ctx, c) => {
    const { a = null, b = null, share = 0.5, hover, who = null } = c.state;
    c.surface({ stroke: color(who ? 'xr-roast-active' : hover ? 'xr-accent' : 'xr-panel-border') });
    const pad = 0.03;
    text(ctx, c, who ? t('roastBlendFor', { name: who }) : t('roastBlend'), pad, 0.034, { size: 'xr-text-min', weight: 'bold', col: who ? 'xr-roast-active' : 'xr-panel-muted', max: w - pad * 2 });
    const bx = pad;
    const by = 0.062;
    const bw = w - pad * 2;
    const bh = 0.062;
    if (a === null || b === null) {
      roundRect(ctx, c.m(bx), c.m(by), c.m(bw), c.m(bh), c.m(0.02));
      ctx.fillStyle = color('xr-button-bg');
      ctx.fill();
      text(ctx, c, t(!who ? 'roastNobody' : a === null ? 'roastPickTwo' : 'roastPickOne'), w / 2, by + bh / 2, { size: 'xr-text-sm', weight: 'bold', col: 'xr-panel-muted', align: 'center', max: bw - 0.02 });
      return;
    }
    const split = bw * share;
    ctx.save();
    roundRect(ctx, c.m(bx), c.m(by), c.m(bw), c.m(bh), c.m(0.02));
    ctx.clip();
    ctx.fillStyle = color(BEAN_TOKEN[a]);
    ctx.fillRect(c.m(bx), c.m(by), c.m(split), c.m(bh));
    ctx.fillStyle = color(BEAN_TOKEN[b]);
    ctx.fillRect(c.m(bx + split), c.m(by), c.m(bw - split), c.m(bh));
    ctx.restore();
    // the handle at the split
    roundRect(ctx, c.m(bx + split - 0.008), c.m(by - 0.01), c.m(0.016), c.m(bh + 0.02), c.m(0.008));
    ctx.fillStyle = color('xr-panel-text');
    ctx.fill();
    const pa = Math.round(share * 100);
    text(ctx, c, `${beanName(a)} ${pa} %`, bx + 0.015, by + bh / 2, { size: 'xr-text-min', weight: 'black', col: 'xr-roast-bubble-ink', max: Math.max(0.05, split - 0.03) });
    text(ctx, c, `${100 - pa} % ${beanName(b)}`, bx + bw - 0.015, by + bh / 2, { size: 'xr-text-min', weight: 'black', col: 'xr-roast-bubble-ink', align: 'right', max: Math.max(0.05, bw - split - 0.03) });
    ctx.globalAlpha = 1;
  });
  p.userData.interactive = true;
  p.userData.setHover = (v) => p.set({ hover: v });
  p.userData.bar = { x0: -w / 2 + 0.03, x1: w / 2 - 0.03 };
  return p;
}

/** Index in RATIOS closest to a share. */
export const ratioIndex = (share) => RATIOS.reduce((best, r, i) => (Math.abs(r - share) < Math.abs(RATIOS[best] - share) ? i : best), 0);

// ---------- roast gauge ----------

/** Roast progress: the stage strip with the cracks, the AI's mark and a needle. */
export function gaugePanel() {
  const w = 0.62;
  const h = 0.22;
  const p = new Panel(w, h, (ctx, c) => {
    const { r = 0, aiStop = null, done = false, who = null, next = null, idle = false } = c.state;
    const roasting = !idle && !done;
    c.surface({ stroke: color(roasting ? 'xr-roast-active' : STAGE_TOKEN[stageOf(r).key] === 'xr-roast-bean-burnt' ? 'xr-danger' : 'xr-panel-border') });
    const pad = 0.03;
    text(ctx, c, idle ? t('roastDrumFree') : who ? t('roastRoastFor', { name: who }) : t('roastRoasting'), pad, 0.036, { size: 'xr-text-min', weight: 'bold', col: roasting ? 'xr-roast-active' : 'xr-panel-muted', max: w * 0.62 });
    const st = stageOf(r);
    if (!idle) text(ctx, c, t(`roastStage_${st.key}`), w - pad, 0.038, { size: 'xr-text-md', weight: 'black', col: st.key === 'burnt' ? 'xr-danger' : st.key === 'green' ? 'xr-roast-bean-green' : st.key === 'yellow' ? 'xr-roast-bean-yellow' : 'xr-roast-bean-cinnamon', align: 'right' });
    if (next) text(ctx, c, t('roastNext', { name: next }), w - pad, h - 0.03, { size: 'xr-text-min', weight: 'bold', col: 'xr-accent', align: 'right' });
    const bx = pad;
    const by = 0.094;
    const bw = w - pad * 2;
    const bh = 0.045;
    ctx.save();
    roundRect(ctx, c.m(bx), c.m(by), c.m(bw), c.m(bh), c.m(0.012));
    ctx.clip();
    STAGES.forEach((s, i) => {
      const x0 = s.at;
      const x1 = STAGES[i + 1]?.at ?? 1;
      ctx.fillStyle = color(STAGE_TOKEN[s.key]);
      ctx.fillRect(c.m(bx + bw * x0), c.m(by), c.m(bw * (x1 - x0)) + 1, c.m(bh));
    });
    // the burnt part is hatched
    ctx.strokeStyle = color('xr-danger');
    ctx.lineWidth = c.m(0.004);
    for (let x = STAGES[5].at; x < 1.05; x += 0.025) {
      ctx.beginPath(); ctx.moveTo(c.m(bx + bw * x), c.m(by + bh)); ctx.lineTo(c.m(bx + bw * (x + 0.03)), c.m(by)); ctx.stroke();
    }
    // what is already roasted is bright, the rest dimmed
    ctx.fillStyle = color('xr-panel-bg');
    ctx.globalAlpha = 0.55;
    ctx.fillRect(c.m(bx + bw * r), c.m(by), c.m(bw * (1 - r)), c.m(bh));
    ctx.restore();
    // cracks
    [[FIRST_CRACK, 'roastCrack1'], [SECOND_CRACK, 'roastCrack2']].forEach(([at, key]) => {
      const x = bx + bw * at;
      ctx.strokeStyle = color('xr-panel-text');
      ctx.lineWidth = c.m(0.003);
      ctx.beginPath(); ctx.moveTo(c.m(x), c.m(by - 0.006)); ctx.lineTo(c.m(x), c.m(by + bh + 0.006)); ctx.stroke();
      text(ctx, c, t(key), x, by + bh + 0.026, { size: 'xr-text-min', weight: 'bold', col: r >= at ? 'xr-panel-text' : 'xr-panel-muted', align: 'center' });
    });
    // the AI's stop mark (cyan triangle above the strip)
    if (aiStop !== null) {
      const x = bx + bw * aiStop;
      ctx.beginPath();
      ctx.moveTo(c.m(x), c.m(by - 0.002));
      ctx.lineTo(c.m(x - 0.014), c.m(by - 0.024));
      ctx.lineTo(c.m(x + 0.014), c.m(by - 0.024));
      ctx.closePath();
      ctx.fillStyle = color('xr-roast-ai');
      ctx.fill();
      text(ctx, c, t('roastAiStop'), x + 0.02, by - 0.016, { size: 'xr-text-min', weight: 'black', col: 'xr-roast-ai' });
    }
    // the needle
    const nx = bx + bw * Math.min(1, r);
    roundRect(ctx, c.m(nx - 0.005), c.m(by - 0.012), c.m(0.01), c.m(bh + 0.024), c.m(0.005));
    ctx.fillStyle = color(done ? 'xr-roast-star' : 'xr-panel-text');
    ctx.fill();
    text(ctx, c, `${Math.round(100 + 140 * Math.min(1, r))} °C`, pad, h - 0.03, { size: 'xr-text-min', weight: 'bold', col: 'xr-panel-muted' });
  });
  return p;
}

// ---------- sprites ----------

function spriteFrom(draw, wPx, hPx, size) {
  const canvas = document.createElement('canvas');
  canvas.width = wPx;
  canvas.height = hPx;
  draw(canvas.getContext('2d'), wPx, hPx);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  s.scale.set(size, (size * hPx) / wPx, 1);
  s.userData.noFit = true;
  s.renderOrder = 5;
  return s;
}

/** A gold (or empty) star sprite. */
export function starSprite(on, size = 0.07) {
  return spriteFrom((ctx, W, H) => {
    starPath(ctx, W / 2, H / 2, W * 0.46);
    ctx.fillStyle = color(on ? 'xr-roast-star' : 'xr-roast-star-empty');
    ctx.fill();
    ctx.lineWidth = W * 0.05;
    ctx.strokeStyle = color('xr-panel-bg');
    ctx.stroke();
  }, 96, 96, size);
}

/** Floating score text. */
export function scoreSprite(s, token = 'xr-roast-star', size = 0.3) {
  return spriteFrom((ctx, W, H) => {
    ctx.font = font('black', H * 0.7);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = H * 0.12;
    ctx.strokeStyle = color('xr-panel-bg');
    ctx.strokeText(s, W / 2, H / 2);
    ctx.fillStyle = color(token);
    ctx.fillText(s, W / 2, H / 2);
  }, 512, 128, size);
}
