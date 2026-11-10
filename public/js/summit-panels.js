// "Gipfelgespräch" 3D panels (canvas, design tokens): the customer's speech bubble with the
// signal words the AI coach reacted to, the reply plates above the holds, the AI coach panel
// (mood and customer type with their probabilities) and the climb status (stages, trust,
// strength, points). Sizes are in the usual panel units; the scene scales them for arm's length.
import * as THREE from 'three';
import { Panel, roundRect, measureBlocks, wrap } from './ui3d.js';
import { color, num, font } from './tokens.js';
import { t, L } from './i18n.js';
import { drawAvatar } from './summit-customer.js';
import { STAGES, MOODS, TYPES } from './summit-talks.js';

const OPTION_TOKENS = ['xr-summit-hold-1', 'xr-summit-hold-2', 'xr-summit-hold-3'];
export const moodToken = (k) => `xr-summit-mood-${k}`;
export const typeToken = (k) => `xr-summit-type-${k}`;
export const clsToken = (k) => (MOODS.includes(k) ? moodToken(k) : typeToken(k));
const px = (p, m) => p.m(Math.max(m, num('xr-text-min')));

/** A holder that scales its panel (panels keep their usual text sizes inside). */
export function holder(panel, scale) {
  const g = new THREE.Group();
  g.scale.setScalar(scale);
  g.add(panel);
  g.userData.panel = panel;
  return g;
}

// ---------- rich text: words with colored underlines ----------

/** Lays out text in lines of words; hits [{ start, end, cls }] get an underline in their color. */
function richLines(ctx, text, maxW) {
  const words = [];
  const re = /\S+/g;
  let m;
  while ((m = re.exec(text))) words.push({ w: m[0], start: m.index });
  const lines = [];
  let line = [];
  let width = 0;
  const space = ctx.measureText(' ').width;
  for (const word of words) {
    const ww = ctx.measureText(word.w).width;
    if (line.length && width + space + ww > maxW) {
      lines.push(line);
      line = [];
      width = 0;
    }
    word.x = line.length ? width + space : 0;
    word.width = ww;
    width = word.x + ww;
    line.push(word);
  }
  if (line.length) lines.push(line);
  return lines;
}

function drawRich(ctx, lines, hits, x0, y0, lh, fill, center = false, maxW = 0) {
  for (const [li, line] of lines.entries()) {
    const lw = line.length ? line[line.length - 1].x + line[line.length - 1].width : 0;
    const off = center ? (maxW - lw) / 2 : 0;
    const y = y0 + li * lh + lh / 2;
    for (const word of line) {
      ctx.fillStyle = fill;
      ctx.fillText(word.w, x0 + off + word.x, y);
      for (const h of hits) {
        const a = Math.max(h.start, word.start);
        const b = Math.min(h.end, word.start + word.w.length);
        if (a >= b) continue;
        const xa = ctx.measureText(word.w.slice(0, a - word.start)).width;
        const xb = ctx.measureText(word.w.slice(0, b - word.start)).width;
        ctx.fillStyle = color(clsToken(h.cls));
        ctx.fillRect(x0 + off + word.x + xa, y + lh * 0.34, xb - xa, lh * 0.11);
      }
    }
  }
}

// ---------- the speech bubble ----------

export const BUBBLE_W = 1.3;

/** The customer's speech bubble: avatar, name, role and the line with underlined signal words. */
export function makeBubble() {
  const pad = 0.045;
  const quoteSize = num('xr-text-md');
  const state = { customer: null, text: '', hits: [], tail: 'up', reveal: 1 };
  const TAIL = 0.05;
  const measure = (text, w) => {
    const ctx = document.createElement('canvas').getContext('2d');
    const ppm = num('xr-px-per-meter');
    ctx.font = font('bold', quoteSize * ppm);
    const lines = richLines(ctx, text, (w - pad * 2) * ppm);
    return 0.09 + lines.length * quoteSize * 1.25 + pad * 2 + 0.03;
  };
  let panel = null;
  const draw = (ctx, p) => {
    const W = p.canvas.width;
    const H = p.canvas.height;
    const tail = p.m(0.05);
    const top = state.tail === 'up' ? tail : 0;
    const right = state.tail === 'right' ? tail : 0;
    const left = state.tail === 'left' ? tail : 0;
    // Bubble with a tail towards the summit (up) or the customer (right).
    ctx.beginPath();
    roundRect(ctx, left + p.m(0.006), top + p.m(0.006), W - right - left - p.m(0.012), H - top - p.m(0.012), p.m(0.05));
    ctx.fillStyle = color('xr-summit-bubble');
    ctx.fill();
    ctx.lineWidth = p.m(0.005);
    ctx.strokeStyle = color('xr-summit-bubble-edge');
    ctx.stroke();
    ctx.beginPath();
    if (state.tail === 'up') {
      ctx.moveTo(W * 0.62, top + p.m(0.008));
      ctx.lineTo(W * 0.7, 0);
      ctx.lineTo(W * 0.7 + p.m(0.07), top + p.m(0.008));
    } else if (state.tail === 'left') {
      ctx.moveTo(left + p.m(0.008), H * 0.32);
      ctx.lineTo(0, H * 0.42);
      ctx.lineTo(left + p.m(0.008), H * 0.32 + p.m(0.07));
    } else {
      ctx.moveTo(W - right - p.m(0.008), H * 0.35);
      ctx.lineTo(W, H * 0.3);
      ctx.lineTo(W - right - p.m(0.008), H * 0.35 + p.m(0.07));
    }
    ctx.closePath();
    ctx.fillStyle = color('xr-summit-bubble');
    ctx.fill();
    const c = state.customer;
    if (!c) return;
    const x0 = left + p.m(pad);
    let y = top + p.m(pad * 0.8);
    const r = p.m(0.036);
    // Next to the 3D portrait the little avatar is not needed.
    const ax = state.tail === 'left' ? 0 : r * 2 + p.m(0.02);
    if (ax) drawAvatar(ctx, x0 + r, y + r, r, c);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color('xr-summit-bubble-text');
    ctx.font = font('black', px(p, num('xr-text-sm')));
    ctx.fillText(L(c.name), x0 + ax, y + r * 0.55, W - right - x0 - ax - p.m(0.05));
    ctx.fillStyle = color('xr-summit-bubble-muted');
    ctx.font = font('regular', px(p, num('xr-text-min')));
    ctx.fillText(`${L(c.role)} · ${c.market}`, x0 + ax, y + r * 1.5, W - right - x0 - ax - p.m(0.05));
    y += r * 2 + p.m(0.02);
    ctx.font = font('bold', p.m(quoteSize));
    const lines = richLines(ctx, state.text, W - right - left - p.m(pad) * 2);
    const hits = state.reveal >= 1 ? state.hits : state.hits.filter((h, i) => i / Math.max(1, state.hits.length) < state.reveal);
    drawRich(ctx, lines, hits, x0, y, p.m(quoteSize * 1.25), color('xr-summit-bubble-text'));
  };
  return {
    /** Shows a line; returns the new panel (height fits the text). */
    show(customer, text, hits, tail = 'up') {
      Object.assign(state, { customer, text, hits, tail, reveal: 0 });
      // Next to the customer (tail to the right) the bubble is narrower.
      const body = tail === 'right' ? BUBBLE_W * 0.82 : tail === 'left' ? BUBBLE_W * 0.86 : BUBBLE_W;
      const w = body + (tail === 'up' ? 0 : TAIL);
      const h = measure(text, body) + (tail === 'up' ? TAIL : 0);
      if (!panel || Math.abs(panel.h - h) > 0.001 || Math.abs(panel.w - w) > 0.001) {
        panel?.dispose();
        panel = new Panel(w, h, draw);
        panel.renderOrder = 12;
      } else panel.redraw();
      return panel;
    },
    setReveal(k) { if (Math.abs(state.reveal - k) > 0.01) { state.reveal = k; panel?.redraw(); } },
    get panel() { return panel; },
  };
}

// ---------- reply plates ----------

export const LABEL_W = 0.52;

/** A reply plate above a hold: number badge in the hold's color and the reply. Interactive. */
export function makeLabel(n, text, onPick) {
  const pad = 0.03;
  const badge = 0.07;
  const textW = LABEL_W - badge - pad * 2.5;
  const h = Math.max(0.14, measureBlocks([{ text, size: 'xr-text-sm', weight: 'bold' }], textW + pad * 2, pad));
  let hover = false;
  const p = new Panel(LABEL_W, h, (ctx, c) => {
    c.surface({ fill: color(hover ? 'xr-button-hover' : 'xr-panel-bg'), stroke: color(hover ? OPTION_TOKENS[n - 1] : 'xr-panel-border'), strokeWidth: num('xr-border-width') * (hover ? 2 : 1), stripe: false });
    const r = c.m(badge / 2);
    const cx = c.m(pad) + r;
    const cy = c.m(pad) + r;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = color(OPTION_TOKENS[n - 1]);
    ctx.fill();
    ctx.fillStyle = color('xr-panel-bg');
    ctx.font = font('black', c.m(0.05));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), cx, cy + c.m(0.002));
    c.blocks([{ text, size: 'xr-text-sm', weight: 'bold' }], { x: badge + pad * 0.5, w: textW + pad * 2, pad, align: 'left', valign: 'center' });
  });
  p.userData.interactive = true;
  p.userData.label = text;
  p.userData.setHover = (v) => { hover = v; p.redraw(); };
  p.userData.onClick = () => onPick?.();
  return p;
}

/** Feedback plate where the chosen reply was: verdict and the coach's tip. */
export function makeFeedback(kind, tip) {
  const token = kind === 'good' ? 'xr-summit-hold-good' : kind === 'ok' ? 'xr-summit-hold-ok' : 'xr-summit-hold-bad';
  const title = t(kind === 'good' ? 'summitSolid' : kind === 'ok' ? 'summitWobbly' : 'summitCrumble');
  const blocks = [
    { text: title, size: 'xr-text-md', weight: 'black', color: color(token), gap: 0.012 },
    { text: tip, size: 'xr-text-sm', color: color('xr-panel-text') },
  ];
  const h = measureBlocks(blocks, LABEL_W + 0.08, 0.03);
  const p = new Panel(LABEL_W + 0.08, h, (ctx, c) => {
    c.surface({ stroke: color(token), strokeWidth: num('xr-border-width') * 2, stripe: false });
    c.blocks(blocks, { pad: 0.03, align: 'left' });
  });
  return p;
}

// ---------- AI coach ----------

export const COACH_W = 0.66;

/**
 * The AI coach: mood and customer type as probability bars, the signal words, a tip and, after
 * the reply, whether the AI read the customer right. state: { phase: 'idle' | 'reading' | 'shown',
 * reveal 0..1, mood: [{ key, p }], type: [{ key, p }], words: [{ word, cls }], unsure, verdict }.
 */
export function makeCoach() {
  const state = { phase: 'idle', reveal: 0, mood: null, type: null, words: [], unsure: false, verdict: null, time: 0 };
  const H = 1.02;
  const p = new Panel(COACH_W, H, (ctx, c) => drawCoach(ctx, c, state));
  p.userData.state = state;
  p.userData.set = (patch) => { Object.assign(state, patch); p.redraw(); };
  return p;
}

function bar(ctx, c, x, y, w, h, k, token, label, pct, bold) {
  ctx.fillStyle = color('xr-summit-bar-bg');
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  if (k > 0.004) {
    ctx.fillStyle = color(token);
    roundRect(ctx, x, y, Math.max(h, w * k), h, h / 2);
    ctx.fill();
  }
  ctx.textBaseline = 'middle';
  ctx.font = font(bold ? 'black' : 'regular', c.m(num('xr-text-min')));
  ctx.textAlign = 'left';
  ctx.fillStyle = color('xr-panel-text');
  ctx.fillText(label, x + c.m(0.012), y + h / 2, w * 0.74);
  ctx.textAlign = 'right';
  ctx.fillText(pct, x + w - c.m(0.012), y + h / 2);
}

function drawCoach(ctx, c, s) {
  c.surface({ stroke: color('xr-accent') });
  const pad = c.m(0.035);
  const W = c.canvas.width;
  let y = pad;
  // Title row: a little eye with a scan line, the name and the state.
  const r = c.m(0.022);
  ctx.strokeStyle = color('xr-accent');
  ctx.lineWidth = c.m(0.006);
  ctx.beginPath();
  ctx.ellipse(pad + r, y + r, r, r * 0.62, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(pad + r, y + r, r * 0.3, 0, Math.PI * 2);
  ctx.fillStyle = color('xr-accent');
  ctx.fill();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = font('black', c.m(num('xr-text-sm')));
  ctx.fillStyle = color('xr-accent');
  ctx.fillText(t('summitCoach').toUpperCase(), pad + r * 2 + c.m(0.016), y + r);
  const tag = s.phase === 'reading' ? t('summitCoachReading') : s.phase === 'shown' ? t(s.unsure ? 'summitCoachUnsure' : 'summitCoachSure') : '';
  if (tag) {
    ctx.textAlign = 'right';
    ctx.font = font('bold', c.m(num('xr-text-min')));
    ctx.fillStyle = color(s.unsure && s.phase === 'shown' ? 'xr-warning' : 'xr-panel-muted');
    ctx.fillText(tag, W - pad, y + r);
  }
  y += r * 2 + c.m(0.028);
  const bw = W - pad * 2;
  const bh = c.m(0.042);
  const gap = c.m(0.011);
  const k = s.phase === 'shown' ? s.reveal : 0;
  const section = (title, list, keys, tokenOf, nameOf) => {
    ctx.textAlign = 'left';
    ctx.font = font('bold', c.m(num('xr-text-min')));
    ctx.fillStyle = color('xr-panel-muted');
    ctx.fillText(title, pad, y + c.m(0.02));
    y += c.m(0.045);
    keys.forEach((key, i) => {
      const e = list?.find((x) => x.key === key);
      const v = e ? e.p : 0;
      const best = list && list[0].key === key;
      const scan = s.phase === 'reading' ? 0.15 + 0.12 * Math.sin(s.time * 9 + i * 1.3) : v * k;
      bar(ctx, c, pad, y, bw, bh, scan, tokenOf(key), nameOf(key), s.phase === 'shown' && list ? `${Math.round(v * 100 * k)} %` : '', best && s.phase === 'shown');
      y += bh + gap;
    });
    y += c.m(0.012);
  };
  section(t('summitCoachMood'), s.mood, MOODS, moodToken, (key) => t(`summitMood_${key}`));
  section(t('summitCoachType'), s.type, TYPES, typeToken, (key) => t(`summitType_${key}`));
  // Signal words as chips (not at the summit, where only the customer type is left).
  if (s.phase === 'shown' && !s.mood) return;
  ctx.textAlign = 'left';
  ctx.font = font('bold', c.m(num('xr-text-min')));
  ctx.fillStyle = color('xr-panel-muted');
  ctx.fillText(t('summitCoachWords'), pad, y + c.m(0.02));
  y += c.m(0.045);
  ctx.font = font('bold', c.m(num('xr-text-min')));
  let x = pad;
  const ch = c.m(0.048);
  const words = s.phase === 'shown' ? s.words : [];
  if (!words.length && s.phase === 'shown') {
    ctx.fillStyle = color('xr-panel-muted');
    ctx.fillText(t('summitCoachNone'), pad, y + ch / 2);
  }
  let rows = 0;
  for (const w of words) {
    const tw = ctx.measureText(w.word).width + c.m(0.03);
    if (x + tw > W - pad) {
      if (rows >= 1) break;
      rows += 1;
      x = pad;
      y += ch + c.m(0.008);
    }
    ctx.strokeStyle = color(clsToken(w.cls));
    ctx.lineWidth = c.m(0.004);
    roundRect(ctx, x, y, tw, ch, ch / 2);
    ctx.stroke();
    ctx.fillStyle = color(clsToken(w.cls));
    ctx.textBaseline = 'middle';
    ctx.fillText(w.word, x + c.m(0.015), y + ch / 2);
    x += tw + c.m(0.01);
  }
  y += ch + c.m(0.025);
  // The tip, or after the reply the verdict: did the AI read the customer right?
  const maxW = W - pad * 2;
  ctx.textBaseline = 'middle';
  const para = (text, size, weight, fill) => {
    ctx.font = font(weight, c.m(size));
    const lh = c.m(size * 1.22);
    for (const line of wrap(ctx, text, maxW)) {
      if (y + lh > c.canvas.height - c.m(0.02)) return;
      ctx.fillStyle = fill;
      ctx.fillText(line, pad, y + lh / 2);
      y += lh;
    }
  };
  const minSize = num('xr-text-min');
  if (s.verdict) {
    para(t(s.verdict.right ? 'summitCoachRight' : 'summitCoachWrong'), num('xr-text-sm'), 'black', color(s.verdict.right ? 'xr-success' : 'xr-danger'));
    para(t('summitCoachTruth', { mood: t(`summitMood_${s.verdict.truth}`) }), minSize, 'bold', color(moodToken(s.verdict.truth)));
    if (!s.verdict.right) para(s.verdict.note, minSize, 'regular', color('xr-panel-text'));
  } else if (s.phase === 'shown' && s.mood && k > 0.6) {
    para(t('summitCoachTip'), minSize, 'bold', color('xr-warning'));
    const hint = s.unsure ? t('summitHintUnsure') : t(`summitHint_${s.mood[0].key}`);
    para(`${hint} ${t(`summitStyle_${s.type[0].key}`)}`, minSize, 'regular', color('xr-panel-text'));
  }
}

// ---------- climb status ----------

export const STATUS_W = 0.66;

/** Customer card, the five stages of the talk, trust, strength and points. */
export function makeStatus(get) {
  const p = new Panel(STATUS_W, 1.02, (ctx, c) => drawStatus(ctx, c, get()));
  return p;
}

function drawStatus(ctx, c, s) {
  c.surface();
  const pad = c.m(0.035);
  const W = c.canvas.width;
  let y = pad;
  const cust = s.customer;
  const r = c.m(0.055);
  if (cust) {
    drawAvatar(ctx, pad + r, y + r, r, cust);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const x = pad + r * 2 + c.m(0.02);
    const w = W - x - pad;
    ctx.fillStyle = color('xr-panel-muted');
    ctx.font = font('bold', c.m(num('xr-text-min')));
    ctx.fillText(t('summitCustomerOf', { n: s.index + 1, total: s.total }), x, y + r * 0.3, w);
    ctx.fillStyle = color('xr-panel-text');
    ctx.font = font('black', c.m(num('xr-text-sm')));
    ctx.fillText(L(cust.name), x, y + r * 1.0, w);
    ctx.fillStyle = color('xr-panel-muted');
    ctx.font = font('regular', c.m(num('xr-text-min')));
    ctx.fillText(`${cust.market} · ${L(cust.topic)}`, x, y + r * 1.72, w);
  }
  y += r * 2 + c.m(0.03);
  // The five stages of the conversation (one section of the wall each).
  const rowH = c.m(0.07);
  STAGES.forEach((st, i) => {
    const done = i < s.stage;
    const now = i === s.stage && s.climbing;
    const token = done ? 'xr-summit-stage-done' : now ? 'xr-summit-stage-now' : 'xr-summit-stage-todo';
    const cx = pad + c.m(0.025);
    const cy = y + rowH / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, c.m(0.022), 0, Math.PI * 2);
    ctx.fillStyle = color(token);
    if (done || now) ctx.fill();
    ctx.lineWidth = c.m(0.005);
    ctx.strokeStyle = color(token);
    ctx.stroke();
    ctx.fillStyle = color('xr-panel-bg');
    if (done) {
      // A check mark.
      ctx.strokeStyle = color('xr-panel-bg');
      ctx.lineWidth = c.m(0.007);
      ctx.beginPath();
      ctx.moveTo(cx - c.m(0.011), cy);
      ctx.lineTo(cx - c.m(0.002), cy + c.m(0.009));
      ctx.lineTo(cx + c.m(0.012), cy - c.m(0.009));
      ctx.stroke();
    } else {
      ctx.textAlign = 'center';
      ctx.font = font('black', c.m(0.026));
      ctx.fillStyle = color(now ? 'xr-panel-bg' : 'xr-summit-stage-todo');
      ctx.fillText(String(i + 1), cx, cy + c.m(0.001));
    }
    ctx.textAlign = 'left';
    ctx.font = font(now ? 'black' : 'bold', c.m(num('xr-text-min')));
    ctx.fillStyle = color(now ? 'xr-panel-text' : done ? 'xr-panel-text' : 'xr-panel-muted');
    const x = cx + c.m(0.04);
    ctx.fillText(L(st.name), x, cy - c.m(0.013), W * 0.36);
    ctx.font = font('regular', c.m(num('xr-text-min')) * 0.86);
    ctx.fillStyle = color('xr-panel-muted');
    ctx.fillText(L(st.goal), x, cy + c.m(0.02), W - x - pad);
    y += rowH + c.m(0.008);
  });
  y += c.m(0.02);
  const meter = (label, v, token) => {
    ctx.textAlign = 'left';
    ctx.font = font('bold', c.m(num('xr-text-min')));
    ctx.fillStyle = color('xr-panel-muted');
    ctx.fillText(label, pad, y + c.m(0.02));
    ctx.textAlign = 'right';
    ctx.fillStyle = color(token);
    ctx.font = font('black', c.m(num('xr-text-min')));
    ctx.fillText(`${Math.round(v)} %`, W - pad, y + c.m(0.02));
    y += c.m(0.045);
    const bh = c.m(0.03);
    ctx.fillStyle = color('xr-summit-bar-bg');
    roundRect(ctx, pad, y, W - pad * 2, bh, bh / 2);
    ctx.fill();
    ctx.fillStyle = color(token);
    roundRect(ctx, pad, y, Math.max(bh, (W - pad * 2) * Math.max(0, Math.min(1, v / 100))), bh, bh / 2);
    ctx.fill();
    y += bh + c.m(0.025);
  };
  meter(t('summitTrust'), s.trust, 'xr-summit-trust');
  meter(t('summitStamina'), s.stamina, s.stamina < 30 ? 'xr-summit-stamina-low' : 'xr-summit-stamina');
  ctx.textAlign = 'left';
  ctx.font = font('bold', c.m(num('xr-text-min')));
  ctx.fillStyle = color('xr-panel-muted');
  ctx.fillText(t('summitPoints'), pad, y + c.m(0.03));
  ctx.textAlign = 'right';
  ctx.font = font('black', c.m(num('xr-text-lg')));
  ctx.fillStyle = color('xr-warning');
  ctx.fillText(String(s.score), W - pad, y + c.m(0.03));
}
