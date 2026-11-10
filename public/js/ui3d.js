// Canvas-rendered 3D UI components. Every color and size comes from design tokens.
// Text never shrinks below --xr-text-min: panels grow to fit their content instead.
import * as THREE from 'three';
import { color, num, font } from './tokens.js';
import { sfx } from './sfx.js';

const MAX_TEX = 2048;
const VOWELS = 'aeiouyäöüAEIOUYÄÖÜ';
const measureCtx = document.createElement('canvas').getContext('2d');

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Splits a word that is wider than maxW: first at existing hyphens, then with a new hyphen. */
function breakWord(ctx, word, maxW) {
  const out = [];
  for (const piece of word.split(/(?<=-)/)) {
    let rest = piece;
    while (ctx.measureText(rest).width > maxW && rest.length > 5) {
      let n = rest.length - 3; // never leave fewer than 3 letters behind
      while (n > 3 && ctx.measureText(`${rest.slice(0, n)}-`).width > maxW) n--;
      // Prefer a syllable-like break: before a consonant that is followed by a vowel.
      for (let k = n; k >= Math.max(3, n - 6); k--) {
        if (!VOWELS.includes(rest[k]) && VOWELS.includes(rest[k + 1] ?? '')) { n = k; break; }
      }
      out.push(`${rest.slice(0, n)}-`);
      rest = rest.slice(n);
    }
    out.push(rest);
  }
  return out;
}

export function wrap(ctx, text, maxW) {
  const lines = [];
  for (const para of String(text).split('\n')) {
    // Tokens: { text, space } where space=false glues a word fragment to the previous one.
    const tokens = para.split(' ').flatMap((w) => (ctx.measureText(w).width > maxW
      ? breakWord(ctx, w, maxW).map((text, i) => ({ text, space: i === 0 }))
      : [{ text: w, space: true }]));
    let line = '';
    for (const tok of tokens) {
      const test = line ? `${line}${tok.space ? ' ' : ''}${tok.text}` : tok.text;
      if (ctx.measureText(test).width <= maxW || !line) line = test;
      else {
        lines.push(line);
        line = tok.text;
      }
    }
    lines.push(line);
  }
  return lines;
}

/** Font size of a block in meters, never below the minimum token. */
function blockSize(b) {
  const s = typeof b.size === 'number' ? b.size : num(b.size ?? 'xr-text-md');
  return Math.max(s, num('xr-text-min'));
}

/** Height in meters that a list of text blocks needs at full size inside width w. */
export function measureBlocks(blocks, w, pad = num('xr-padding')) {
  const ppm = num('xr-px-per-meter');
  const maxW = (w - pad * 2) * ppm;
  let total = 0;
  blocks.forEach((b, i) => {
    const px = blockSize(b) * ppm;
    measureCtx.font = font(b.weight ?? 'regular', px);
    total += wrap(measureCtx, b.text, maxW).length * px * (b.lineHeight ?? 1.25);
    if (i < blocks.length - 1) total += (b.gap ?? 0.018) * ppm;
  });
  return total / ppm + pad * 2;
}

/**
 * A flat, canvas-textured plane. Sizes are in meters.
 * draw(ctx, panel) paints the content; call redraw() after state changes.
 */
export class Panel extends THREE.Mesh {
  constructor(w, h, draw) {
    const ppm = num('xr-px-per-meter');
    const k = Math.min(1, MAX_TEX / (Math.max(w, h) * ppm));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * ppm * k);
    canvas.height = Math.round(h * ppm * k);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false });
    super(new THREE.PlaneGeometry(w, h), material);
    this.w = w;
    this.h = h;
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.px = canvas.width / w;
    this.texture = texture;
    this.draw = draw;
    this.state = {};
    this.redraw();
  }

  m(meters) {
    return meters * this.px;
  }

  set(patch) {
    let changed = false;
    for (const key in patch) {
      if (this.state[key] !== patch[key]) {
        this.state[key] = patch[key];
        changed = true;
      }
    }
    if (changed) this.redraw();
  }

  redraw() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.draw?.(ctx, this);
    this.texture.needsUpdate = true;
  }

  surface({ fill = color('xr-panel-bg'), stroke = color('xr-panel-border'), strokeWidth = num('xr-border-width'), radius = num('xr-radius'), stripe = true } = {}) {
    const { ctx } = this;
    const sw = this.m(strokeWidth);
    roundRect(ctx, sw / 2, sw / 2, this.canvas.width - sw, this.canvas.height - sw, this.m(radius));
    ctx.fillStyle = fill;
    ctx.fill();
    // Optional accent band along the top edge (skin token, transparent by default).
    const band = color('xr-panel-stripe');
    if (stripe && band && band !== 'transparent') {
      ctx.save();
      ctx.clip();
      ctx.fillStyle = band;
      ctx.fillRect(0, 0, this.canvas.width, this.m(0.016));
      ctx.restore();
      roundRect(ctx, sw / 2, sw / 2, this.canvas.width - sw, this.canvas.height - sw, this.m(radius));
    }
    if (stroke && sw > 0) {
      ctx.lineWidth = sw;
      ctx.strokeStyle = stroke;
      ctx.stroke();
    }
  }

  /**
   * Lays out text blocks vertically with wrapping.
   * block: { text, size (token name or meters), weight, color, gap (m) }
   */
  blocks(blocks, { x = 0, y = 0, w = this.w, h = this.h, pad = num('xr-padding'), align = 'center', valign = 'center' } = {}) {
    const { ctx } = this;
    const maxW = this.m(w - pad * 2);
    const maxH = this.m(h - pad * 2);
    const laid = [];
    let total = 0;
    blocks.forEach((b, idx) => {
      const px = this.m(blockSize(b));
      ctx.font = font(b.weight ?? 'regular', px);
      const lines = wrap(ctx, b.text, maxW);
      const lh = px * (b.lineHeight ?? 1.25);
      const gap = idx < blocks.length - 1 ? this.m(b.gap ?? 0.018) : 0;
      laid.push({ b, px, lines, lh, gap });
      total += lines.length * lh + gap;
    });
    let cy = this.m(y + pad);
    if (valign === 'center') cy += Math.max(0, (maxH - total) / 2);
    const left = this.m(x + pad);
    const cx = align === 'center' ? left + maxW / 2 : align === 'right' ? left + maxW : left;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    for (const { b, px, lines, lh, gap } of laid) {
      ctx.font = font(b.weight ?? 'regular', px);
      ctx.fillStyle = b.color ?? color('xr-panel-text');
      for (const line of lines) {
        ctx.fillText(line, cx, cy + lh / 2);
        cy += lh;
      }
      cy += gap;
    }
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}

/**
 * Information panel; grows vertically to fit the text (minimum height h).
 * blocks can be a function for panels whose text changes (height stays fixed then).
 */
export function textPanel(w, h, blocks, opts = {}) {
  const pad = opts.layout?.pad ?? num('xr-padding');
  const initial = typeof blocks === 'function' ? blocks() : blocks;
  const height = opts.grow === false ? h : Math.max(h, measureBlocks(initial, w, pad));
  const panel = new Panel(w, height, (ctx, p) => {
    if (opts.surface !== false) p.surface(opts.surface);
    p.blocks(typeof blocks === 'function' ? blocks(p) : blocks, opts.layout);
  });
  if (opts.surface === false) panel.material.depthWrite = false;
  return panel;
}

const VARIANTS = {
  primary: { bg: 'xr-primary', hover: 'xr-primary-hover', text: 'xr-on-primary', border: 'xr-primary-hover' },
  secondary: { bg: 'xr-button-bg', hover: 'xr-button-hover', text: 'xr-button-text', border: 'xr-panel-border' },
  success: { bg: 'xr-success-soft', hover: 'xr-success', text: 'xr-panel-text', border: 'xr-success' },
  danger: { bg: 'xr-danger-soft', hover: 'xr-danger', text: 'xr-panel-text', border: 'xr-danger' },
  sponsor: { bg: 'xr-button-bg', hover: 'xr-button-hover', text: 'xr-button-text', border: 'xr-warning' },
};

function buttonBlocks(opts, text, muted, accent) {
  const blocks = [{ text: opts.label, size: opts.labelSize, weight: 'bold', color: text, gap: 0.022 }];
  if (opts.body) blocks.push({ text: opts.body, size: 'xr-text-sm', color: muted, gap: 0.03 });
  if (opts.footer) blocks.push({ text: opts.footer, size: 'xr-text-sm', weight: 'bold', color: accent });
  return blocks;
}

const buttonPad = (h) => Math.min(num('xr-padding'), h * 0.16);

/**
 * Interactive button; grows vertically to fit its text. Options:
 *   label, body, footer  text lines (body/footer optional)
 *   variant              primary | secondary | success | danger | sponsor
 *   status               null | 'selected' | 'correct' | 'wrong' | 'muted'
 *   onClick
 */
export class Button extends Panel {
  static measure(w, h, opts) {
    const o = { labelSize: 'xr-text-md', ...opts };
    const needed = measureBlocks(buttonBlocks(o), w, buttonPad(h));
    return Math.max(h, needed);
  }

  constructor(w, h, opts) {
    const height = opts.grow === false ? h : Button.measure(w, h, opts);
    super(w, height, (ctx, p) => p.paint());
    this.opts = { variant: 'secondary', labelSize: 'xr-text-md', ...opts };
    this.userData.interactive = true;
    this.userData.setHover = (v) => this.set({ hover: v });
    this.userData.onClick = (pointer) => {
      if (this.state.disabled) return;
      sfx.click();
      this.opts.onClick?.(pointer, this);
    };
    this.hoverScale = num('xr-hover-scale');
    this.redraw();
  }

  paint() {
    if (!this.opts) return;
    const { variant, align } = this.opts;
    const { hover, disabled, status } = this.state;
    const v = VARIANTS[variant];
    const active = hover && !disabled;
    let fill = color(active ? v.hover : v.bg);
    let stroke = color(v.border);
    let text = color(variant === 'primary' || (active && variant !== 'secondary' && variant !== 'sponsor') ? 'xr-on-primary' : v.text);
    if (status === 'correct') { fill = color('xr-success'); stroke = fill; text = color('xr-on-primary'); }
    if (status === 'wrong') { fill = color('xr-danger'); stroke = fill; text = color('xr-on-primary'); }
    if (status === 'selected') { stroke = color('xr-accent'); }
    this.surface({ fill, stroke, strokeWidth: num('xr-border-width') * (status === 'selected' || hover ? 2 : 1), stripe: false });
    // On filled (primary) buttons secondary text uses the button's text color for contrast.
    const onFill = status || variant === 'primary';
    const muted = onFill ? text : color('xr-panel-muted');
    const accent = onFill ? text : color(variant === 'sponsor' ? 'xr-warning' : 'xr-accent');
    this.blocks(buttonBlocks(this.opts, text, muted, accent), { align: align ?? 'center', pad: buttonPad(this.h) });
    this.material.opacity = status === 'muted' || (disabled && !status) ? 0.45 : 1;
    this.scale.setScalar(active ? this.hoverScale : 1);
  }
}

/** Soft rounded glow behind an element, tinted with a color token. */
export function glowPanel(w, h, tokenName) {
  const g = new Panel(w, h, (ctx, p) => {
    const inset = p.m(0.05);
    ctx.shadowColor = color(tokenName);
    ctx.shadowBlur = p.m(0.045);
    ctx.fillStyle = color(tokenName);
    roundRect(ctx, inset, inset, p.canvas.width - inset * 2, p.canvas.height - inset * 2, p.m(num('xr-radius')));
    ctx.fill();
  });
  g.material.blending = THREE.AdditiveBlending;
  g.material.depthWrite = false;
  g.userData.noFit = true;
  return g;
}

/** Places an object on a horizontal arc around the origin, facing the origin. */
export function placeOnArc(obj, angle, y, dist) {
  obj.position.set(Math.sin(angle) * dist, y, -Math.cos(angle) * dist);
  obj.rotation.set(0, -angle, 0);
  return obj;
}

export function faceOrigin(obj) {
  obj.rotation.set(0, Math.atan2(-obj.position.x, -obj.position.z), 0);
}
