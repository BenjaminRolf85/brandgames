// "Grünes Portfolio" (key 'green'): the 3D UI. Project cards (tiles to click or grab), the action
// and answer buttons, the AI forecast panel (the newcomer's next step, heat-map legend, forecast
// with its usual range and confidence, the AI's top picks, the running year, forecast versus
// result and the points), the region dashboard, the AI's warning (confidence, price of reacting,
// risk of waiting, outcome) and number formats. No letters below the shared small-text size;
// what does not fit a panel is left out, never squeezed in.
// Colors and sizes from the tokens; the shared Panel/textPanel building blocks from ui3d.js.
import { Panel, textPanel, roundRect } from './ui3d.js';
import { color, num, font } from './tokens.js';
import { ICONS, drawIcon } from './icons.js';
import { t, getLang } from './i18n.js';
import { TYPES, YEARS, FIRST_YEAR, HOUSEHOLD_MWH, MONTH_WIND, MONTH_SUN, LIVE, WEATHER } from './green-sim.js';

// Line icons for the projects (24 x 24, stroked like icons.js); registered so the phone's thumb
// buttons (touch-ui.js) can show them too.
const circ = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
const GREEN_ICONS = {
  greenWind: `${circ(12, 9, 1.4)}M12 10.4V21.5M9 21.5h6M11.6 7.7L10.6 2.2M13.3 9.7l4.9 2.7M10.7 9.7l-4.9 2.7`,
  greenSolar: `M3 19l2.6-8h15.4l-2.6 8zM4.3 15h15.4M10.6 11l-1.7 8M16 11l-1.7 8M6 22h12${circ(5.5, 5, 1.7)}M5.5 1.5v.6M9 5h-.6M2 5h.6M8 2.5l-.4.4M3 2.5l.4.4`,
  greenHomes: 'M2.5 21.5h19M4 21.5V11l4.5-3.5L13 11v10.5M13 21.5V7.5h7.5v14M6.5 14h4M6.5 17.5h4M15.5 10.5h2.5M15.5 13.5h2.5M15.5 16.5h2.5',
  greenSchool: `M2.5 21.5h19M4 21.5V11l8-4.5 8 4.5v10.5M9.5 21.5v-5h5v5M12 6.5V2.5l3.2 1.2L12 5${circ(12, 11.5, 1.6)}`,
  greenKita: `M2.5 21.5h19M4.5 21.5V11L12 5l7.5 6v10.5${circ(12, 12.2, 1.6)}M12 13.8v3.6M9.8 15.3h4.4M10.3 20.5l1.7-3 1.7 3`,
  greenGo: 'M4 5h16v15H4zM4 9h16M8.5 2.5v4M15.5 2.5v4M10 12l5 3-5 3z',
  greenNext: 'M4 12h15M13 6l6 6-6 6',
  greenStorm: 'M6.5 15.5a4 4 0 0 1 .3-8A5.5 5.5 0 0 1 17.3 8.6a3.5 3.5 0 0 1 .7 6.9H6.5zM12.5 15.5l-2 3.5h3l-2 3.5',
  greenHeat: `${circ(12, 12, 4)}M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1`,
  greenDark: 'M6.5 16.5a4 4 0 0 1 .3-8A5.5 5.5 0 0 1 17.3 9.6a3.5 3.5 0 0 1 .7 6.9H6.5zM3 3l18 18',
  greenFlood: 'M3 15.5c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M3 19.5c2-1.5 4-1.5 6 0s4 1.5 6 0 4-1.5 6 0M7 12V7l5-3.5L17 7v5',
  greenBet: 'M7 20V5M3.5 8.5L7 5l3.5 3.5M17 4v15M13.5 15.5L17 19l3.5-3.5',
  greenWait: `${circ(12, 12, 9.5)}M12 6.5V12l3.5 2.2`,
  greenAI: `${circ(12, 12, 3)}M12 2.5v3.5M12 18v3.5M2.5 12H6M18 12h3.5M5.3 5.3l2.5 2.5M16.2 16.2l2.5 2.5M5.3 18.7l2.5-2.5M16.2 7.8l2.5-2.5`,
};
for (const [k, d] of Object.entries(GREEN_ICONS)) if (!(k in ICONS)) ICONS[k] = d;

// ---------- numbers ----------

export function fmt(v, digits = 1) {
  return new Intl.NumberFormat(getLang() === 'de' ? 'de-DE' : 'en-GB', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
}
export const fmtInt = (v) => fmt(Math.round(v), 0);
export const money = (v) => t('greenMoney', { n: fmt(v, Math.abs(v - Math.round(v)) < 0.05 ? 0 : 1) });
export const pct = (v) => `${v >= 0 ? '+' : '−'}${fmtInt(Math.abs(v * 100))} %`;
export const signed = (v) => `${v >= 0 ? '+' : '−'}${fmtInt(Math.abs(v))}`;
export const typeName = (k) => t(`greenType_${k}`);
export const plotName = (p) => (p.area === 'land' ? t(`greenPlot_${p.id}`) : t(`greenDistrict_${p.district}`));

// ---------- tiles ----------

/** The smallest letters on any panel (meters): the shared small-text size. */
const SM = () => num('xr-text-sm');

/**
 * Interactive canvas tile (like the AI Arena's): hover grows it, the keyboard focus (Tab) rings
 * it; draw(ctx, panel, { hover, focus }).
 */
export function iconTile(w, h, draw) {
  let hover = false;
  let focus = false;
  const p = new Panel(w, h, (ctx, c) => {
    draw(ctx, c, { hover, focus });
    if (!focus) return;
    // The keyboard focus: a ring in the focus color, inside the tile's edge.
    ctx.strokeStyle = color('xr-focus');
    ctx.lineWidth = c.m(0.007);
    roundRect(ctx, c.m(0.007), c.m(0.007), c.canvas.width - c.m(0.014), c.canvas.height - c.m(0.014), c.m(num('xr-radius') * 0.8));
    ctx.stroke();
  });
  p.userData.interactive = true;
  p.userData.setHover = (v) => { hover = v; p.scale.setScalar(v ? num('xr-hover-scale') : 1); p.redraw(); };
  p.userData.setFocus = (v) => { focus = v; p.redraw(); };
  return p;
}

/** Fits a text into maxW by shrinking the font (not below minPx). */
function fitText(ctx, text, weight, px, maxW, minPx) {
  let s = px;
  ctx.font = font(weight, s);
  while (ctx.measureText(text).width > maxW && s > minPx) { s -= 1; ctx.font = font(weight, s); }
  return s;
}

/**
 * A project card: icon, name, cost; state() -> { selected, disabled, key }. w: the card's width
 * (the browser's cards are wider than the headset's tray cards, with larger letters).
 */
export function projectCard(type, state, w = num('xr-green-card')) {
  const T = TYPES[type];
  const big = w > num('xr-green-card') + 0.001;
  const tile = iconTile(w, w * (big ? 0.9 : 1.04), (ctx, c, s) => {
    const st = state();
    const W = c.canvas.width;
    const H = c.canvas.height;
    c.surface({ fill: color(st.selected ? 'xr-button-hover' : s.hover && !st.disabled ? 'xr-button-hover' : 'xr-button-bg'), stroke: color(st.selected ? T.token : 'xr-panel-border'), strokeWidth: num('xr-border-width') * (st.selected ? 2.6 : 1), stripe: false });
    ctx.globalAlpha = st.disabled ? 0.42 : 1;
    // A band in the project's color along the top.
    ctx.save();
    roundRect(ctx, c.m(0.008), c.m(0.008), W - c.m(0.016), H - c.m(0.016), c.m(num('xr-radius') * 0.8));
    ctx.clip();
    ctx.fillStyle = color(T.token);
    ctx.fillRect(0, 0, W, c.m(0.012));
    ctx.restore();
    drawIcon(ctx, T.icon, W / 2, H * (big ? 0.32 : 0.36), c.m(big ? 0.07 : 0.058), color(T.token));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color('xr-button-text');
    const maxW = W - c.m(0.016);
    fitText(ctx, typeName(type), 'black', c.m(SM()), maxW, c.m(big ? SM() * 0.94 : 0.022));
    ctx.fillText(typeName(type), W / 2, H * (big ? 0.63 : 0.66), maxW);
    ctx.fillStyle = color('xr-panel-muted');
    fitText(ctx, t('greenCost', { n: T.cost }), 'bold', c.m(big ? SM() : SM() * 0.85), maxW, c.m(big ? SM() : 0.02));
    ctx.fillText(t('greenCost', { n: T.cost }), W / 2, H * (big ? 0.85 : 0.85), maxW);
    // Keyboard: the number key in the corner.
    if (st.key) {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = font('black', c.m(SM()));
      ctx.fillStyle = color('xr-panel-text');
      ctx.fillText(st.key, c.m(0.016), c.m(0.02));
    }
    ctx.globalAlpha = 1;
  });
  tile.userData.label = `${typeName(type)}, ${t('greenCost', { n: T.cost })}`;
  tile.userData.type = type;
  return tile;
}

/**
 * A big action button (run the year, next, results; react to a warning or wait). state() ->
 * { label, icon, sub, disabled, primary }: primary fills it in the main color (the thing to do
 * next), otherwise it is an outlined button.
 */
export function actionTile(state, w = num('xr-green-card') * 1.45, h = num('xr-green-card') * 1.04) {
  return iconTile(w, h, (ctx, c, s) => {
    const st = state();
    const W = c.canvas.width;
    const H = c.canvas.height;
    const primary = st.primary !== false && !st.disabled;
    c.surface({ fill: color(primary ? (s.hover ? 'xr-primary-hover' : 'xr-primary') : s.hover && !st.disabled ? 'xr-button-hover' : 'xr-button-bg'), stroke: color(st.disabled ? 'xr-panel-border' : 'xr-primary-hover'), strokeWidth: num('xr-border-width') * (primary ? 1 : 1.8), stripe: false });
    ctx.globalAlpha = st.disabled ? 0.45 : 1;
    const fg = color(primary ? 'xr-on-primary' : 'xr-button-text');
    const big = h > num('xr-green-card') * 1.04 + 0.001;
    drawIcon(ctx, st.icon, W / 2, H * (st.sub ? 0.28 : 0.34), c.m(big ? 0.066 : 0.056), fg);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const maxW = W - c.m(0.02);
    fitText(ctx, st.label, 'black', c.m(num('xr-text-md')), maxW, c.m(big ? SM() : 0.024));
    ctx.fillText(st.label, W / 2, H * (st.sub ? 0.6 : 0.7), maxW);
    if (st.sub) {
      fitText(ctx, st.sub, 'bold', c.m(big ? SM() : SM() * 0.8), maxW, c.m(big ? SM() * 0.9 : 0.02));
      ctx.fillText(st.sub, W / 2, H * 0.85, maxW);
    }
    ctx.globalAlpha = 1;
  });
}

// ---------- drawing helpers for the panels ----------

class Pen {
  constructor(ctx, c, pad) {
    this.ctx = ctx;
    this.c = c;
    this.x = c.m(pad);
    this.w = c.canvas.width - 2 * c.m(pad);
    this.y = c.m(pad);
    this.bottom = c.canvas.height - c.m(pad * 0.5); // nothing is drawn below this line
  }

  /** Room left for a block of this height (px)? */
  fits(px) { return this.y + px <= this.bottom + 1; }

  /** One line of text; size in meters. Returns its height in px (0: no room left). */
  line(text, { size = SM(), weight = 'regular', col = color('xr-panel-text'), gap = 0.008, align = 'left', min = SM() } = {}) {
    const { ctx, c } = this;
    const k = this.k ?? 1;
    const px = fitText(ctx, text, weight, c.m(size * k), this.w, c.m(Math.min(size, min) * k));
    if (!this.fits(px * 1.1)) return 0;
    ctx.fillStyle = col;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    const x = align === 'left' ? this.x : align === 'right' ? this.x + this.w : this.x + this.w / 2;
    ctx.fillText(text, x, this.y + px * 0.62, this.w);
    this.y += px * 1.24 + c.m(gap);
    return px;
  }

  /** Wrapped text (up to maxLines, and never past the panel's bottom). */
  para(text, { size = SM(), weight = 'regular', col = color('xr-panel-muted'), gap = 0.008, maxLines = 3 } = {}) {
    const { ctx, c } = this;
    const px = c.m(size * (this.k ?? 1));
    ctx.font = font(weight, px);
    ctx.fillStyle = col;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const words = String(text).split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(test).width <= this.w || !cur) cur = test;
      else { lines.push(cur); cur = w; }
    }
    if (cur) lines.push(cur);
    const n = Math.min(maxLines, Math.floor((this.bottom - this.y + px * 0.2) / (px * 1.22)));
    if (n <= 0) return;
    lines.slice(0, n).forEach((l, i) => {
      const last = i === n - 1 && lines.length > n;
      ctx.fillText(last ? `${l.replace(/\s+\S*$/, '')} …` : l, this.x, this.y + px * 0.62, this.w);
      this.y += px * 1.22;
    });
    this.y += c.m(gap);
  }

  rule(gap = 0.012) {
    const { ctx, c } = this;
    ctx.strokeStyle = color('xr-panel-border');
    ctx.lineWidth = c.m(0.0015);
    ctx.beginPath();
    ctx.moveTo(this.x, this.y + c.m(gap / 2));
    ctx.lineTo(this.x + this.w, this.y + c.m(gap / 2));
    ctx.stroke();
    this.y += c.m(gap);
  }

  space(m) { this.y += this.c.m(m); }
}

function rr(ctx, x, y, w, h, r) {
  roundRect(ctx, x, y, Math.max(w, 0.1), h, Math.min(r, h / 2, Math.max(w, 0.1) / 2));
}

/** A horizontal bar: track, filled part, optional range band and marker. */
function bar(pen, { k = 0, lo = null, hi = null, mark = null, token = 'xr-accent', h = 0.016, gap = 0.01 }) {
  const { ctx, c } = pen;
  const H = c.m(h);
  if (!pen.fits(H)) return;
  const y = pen.y;
  ctx.fillStyle = color('xr-button-bg');
  rr(ctx, pen.x, y, pen.w, H, H / 2);
  ctx.fill();
  if (lo !== null) {
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = color(token);
    rr(ctx, pen.x + pen.w * Math.max(0, lo), y, pen.w * Math.max(0, Math.min(1, hi) - Math.max(0, lo)), H, H / 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = color(token);
    rr(ctx, pen.x, y, pen.w * Math.max(0, Math.min(1, k)), H, H / 2);
    ctx.fill();
  }
  if (mark !== null) {
    ctx.fillStyle = color('xr-panel-text');
    const mx = pen.x + pen.w * Math.max(0, Math.min(1, mark));
    rr(ctx, mx - c.m(0.003), y - c.m(0.005), c.m(0.006), H + c.m(0.01), c.m(0.003));
    ctx.fill();
  }
  pen.y += H + c.m(gap);
}

/** A label on the left and a value on the right of one row (the label gives way). */
function pair(pen, label, value, { size = SM(), labelCol = color('xr-panel-text'), valueCol = color('xr-panel-text'), weight = 'bold', valueWeight = weight, rowH = null, icon = null, iconCol = null } = {}) {
  const { ctx, c } = pen;
  const k = pen.k ?? 1;
  const px = c.m(size * k);
  const H = rowH !== null ? c.m(rowH * k) : px * 1.34;
  if (!pen.fits(H * 0.9)) return false;
  const cy = pen.y + H / 2;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'right';
  ctx.font = font(valueWeight, px);
  ctx.fillStyle = valueCol;
  const vw = value ? ctx.measureText(value).width : 0;
  if (value) ctx.fillText(value, pen.x + pen.w, cy);
  let x = pen.x;
  if (icon) { drawIcon(ctx, icon, x + px * 0.5, cy, px * 1.0, iconCol ?? labelCol); x += px * 1.25; }
  ctx.textAlign = 'left';
  ctx.font = font(weight, px);
  ctx.fillStyle = labelCol;
  ctx.fillText(label, x, cy, Math.max(10, pen.x + pen.w - vw - c.m(0.012) - x));
  pen.y += H;
  return true;
}

/** Legend of the AI map: the color ramp, low/high and the hatching for "unsure". */
function legend(pen, mode) {
  const { ctx, c } = pen;
  const kk = pen.k ?? 1;
  const ramp = mode === 'need' ? 'need' : mode;
  const H = c.m(0.014 * kk);
  const px = c.m(SM() * kk);
  if (!pen.fits(H + px * 1.3)) return;
  const w = pen.w * 0.5;
  const g = ctx.createLinearGradient(pen.x, 0, pen.x + w, 0);
  g.addColorStop(0, color(`xr-green-heat-${ramp}-lo`));
  g.addColorStop(0.5, color(`xr-green-heat-${ramp}-mid`));
  g.addColorStop(1, color(`xr-green-heat-${ramp}-hi`));
  ctx.fillStyle = g;
  rr(ctx, pen.x, pen.y, w, H, H / 2);
  ctx.fill();
  // Hatch sample.
  const hx = pen.x + w + c.m(0.03);
  const hw = c.m(0.06);
  ctx.save();
  rr(ctx, hx, pen.y, hw, H, H / 2);
  ctx.clip();
  ctx.fillStyle = color(`xr-green-heat-${ramp}-mid`);
  ctx.fillRect(hx, pen.y, hw, H);
  ctx.strokeStyle = color('xr-panel-bg');
  ctx.lineWidth = c.m(0.004);
  for (let k = -2; k < 10; k++) {
    ctx.beginPath();
    ctx.moveTo(hx + k * c.m(0.008), pen.y + H);
    ctx.lineTo(hx + k * c.m(0.008) + H, pen.y);
    ctx.stroke();
  }
  ctx.restore();
  const ty = pen.y + H + px * 0.7;
  ctx.font = font('bold', px);
  ctx.fillStyle = color('xr-panel-muted');
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(t('greenLegendLow'), pen.x, ty);
  ctx.textAlign = 'right';
  ctx.fillText(t('greenLegendHigh'), pen.x + w, ty);
  ctx.textAlign = 'left';
  ctx.fillText(t('greenLegendUnsure'), hx, ty, pen.x + pen.w - hx);
  pen.y = ty + px * 0.7;
}

/** Monthly energy as stacked bars (wind below, sun on top) up to month `upto`. */
function monthChart(pen, months, upto, { h = 0.09, forecast = null } = {}) {
  const { ctx, c } = pen;
  const px = c.m(SM());
  const H = Math.min(c.m(h), pen.bottom - pen.y - px * 1.3);
  if (H < c.m(0.03)) return;
  const n = 12;
  const gap = c.m(0.004);
  const bw = (pen.w - gap * (n - 1)) / n;
  const max = Math.max(0.001, ...months.map((m) => m.wind + m.sun), ...(forecast ?? []).map((f) => f));
  for (let i = 0; i < n; i++) {
    const x = pen.x + i * (bw + gap);
    const base = pen.y + H;
    ctx.fillStyle = color('xr-button-bg');
    rr(ctx, x, pen.y, bw, H, c.m(0.003));
    ctx.fill();
    const k = Math.max(0, Math.min(1, upto - i));
    if (k > 0) {
      const hw = (months[i].wind / max) * H * k;
      const hs = (months[i].sun / max) * H * k;
      ctx.fillStyle = color('xr-green-wind');
      ctx.fillRect(x, base - hw, bw, hw);
      ctx.fillStyle = color('xr-green-sun');
      ctx.fillRect(x, base - hw - hs, bw, hs);
    }
    if (forecast) {
      ctx.strokeStyle = color('xr-panel-text');
      ctx.lineWidth = c.m(0.0018);
      const fy = base - (forecast[i] / max) * H;
      ctx.beginPath();
      ctx.moveTo(x, fy);
      ctx.lineTo(x + bw, fy);
      ctx.stroke();
    }
  }
  pen.y += H + c.m(0.004);
  // The quarters' first months as labels (twelve letters would be too small to read).
  const names = t('greenMonthNames').split(',');
  ctx.font = font('bold', px);
  ctx.fillStyle = color('xr-panel-muted');
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  [0, 3, 6, 9].forEach((i) => ctx.fillText(names[i].slice(0, 3), pen.x + i * (bw + gap), pen.y + px * 0.6));
  pen.y += px * 1.25;
}

// ---------- the AI forecast panel ----------

/**
 * The AI panel. view() returns what to show:
 *   { mode: 'plan', type, plot, game, map, touch, coach, bets }   forecast for a type (and a plot)
 *   { mode: 'sim', report, month, news }                         the running year
 *   { mode: 'report', report, game, points, gained }             forecast versus result
 * coach: { text } the next step for a newcomer (first year), shown in a frame at the top.
 */
export function forecastPanel(w, h, view, kind = 'tall') {
  const wide = kind === 'wide';
  const panel = new Panel(w, h, (ctx, c) => {
    c.surface({ stroke: color('xr-accent') });
    const v = view();
    if (kind === 'mini') { drawMini(ctx, c, v); return; }
    const pen = new Pen(ctx, c, wide ? 0.025 : 0.03);
    if (wide) pen.k = 1.25; // phones held upright: larger letters
    // Title row with the AI icon.
    drawIcon(ctx, 'greenAI', pen.x + c.m(0.02), pen.y + c.m(0.022), c.m(0.04), color('xr-accent'));
    const full = { x: pen.x, w: pen.w };
    pen.x += c.m(0.05);
    pen.w = full.w - c.m(0.05);
    const title = v.mode === 'sim' ? t('greenYearRuns', { year: v.report.label }) : v.mode === 'report' ? t('greenReportTitle', { year: v.report.label }) : t('greenAITitle');
    pen.line(title, { size: num('xr-text-md'), weight: 'black', col: color('xr-accent'), gap: 0.004 });
    pen.x = full.x;
    pen.w = wide ? full.w * 0.47 : full.w;
    if (wide) {
      // Two columns below the title.
      pen.right = { x: full.x + full.w * 0.52, w: full.w * 0.48, top: pen.y };
    }
    if (v.mode === 'plan') drawPlan(pen, v);
    else if (v.mode === 'sim') drawSim(pen, v);
    else drawReport(pen, v);
  });
  return panel;
}

/** The next step for a newcomer, in a frame (so it stands out from the numbers). */
function coachBox(pen, coach) {
  const { ctx, c } = pen;
  const y0 = pen.y;
  const inset = c.m(0.016);
  pen.x += inset;
  pen.w -= 2 * inset;
  pen.y += c.m(0.012);
  pen.para(coach.text, { weight: 'bold', col: color('xr-panel-text'), maxLines: 4, gap: 0.006 });
  pen.x -= inset;
  pen.w += 2 * inset;
  ctx.strokeStyle = color('xr-accent');
  ctx.lineWidth = c.m(0.004);
  rr(ctx, pen.x + c.m(0.002), y0, pen.w - c.m(0.004), pen.y - y0 + c.m(0.004), c.m(0.014));
  ctx.stroke();
  pen.y += c.m(0.018);
}

/** Phones held sideways: a small corner panel with only the key numbers, in large letters. */
function drawMini(ctx, c, v) {
  const pen = new Pen(ctx, c, 0.026);
  const S = num('xr-text-md');
  const M = SM() * 1.15;
  if (v.mode === 'sim') {
    const r = v.report;
    pen.line(`${r.label} · ${t('greenMonthNames').split(',')[Math.min(11, Math.floor(v.month))]}`, { size: S, weight: 'black', col: color('xr-accent') });
    const k = Math.min(12, v.month);
    let w = 0;
    let s = 0;
    let wf = 0;
    let sf = 0;
    for (let i = 0; i < 12; i++) {
      const f = Math.max(0, Math.min(1, k - i));
      w += r.months[i].wind * f;
      s += r.months[i].sun * f;
      wf += r.windFc * MONTH_WIND[i] * f;
      sf += r.sunFc * MONTH_SUN[i] * f;
    }
    if (r.windFc > 0) pen.line(`${t('greenRepWind')} ${fmt(w)} GWh ${pct(w / wf - 1)}`, { size: M, weight: 'bold', col: color('xr-green-wind') });
    if (r.sunFc > 0) pen.line(`${t('greenRepSun')} ${fmt(s)} GWh ${pct(s / sf - 1)}`, { size: M, weight: 'bold', col: color('xr-green-sun') });
    if (v.news) pen.para(v.news, { weight: 'bold', col: color('xr-warning'), maxLines: 5 });
    return;
  }
  if (v.mode === 'report') {
    const r = v.report;
    pen.line(t('greenReportTitle', { year: r.label }), { size: S, weight: 'black', col: color('xr-accent') });
    const rows = [];
    if (r.windFc > 0) rows.push([t('greenRepWind'), r.windSum / r.windFc - 1, 'xr-green-wind']);
    if (r.sunFc > 0) rows.push([t('greenRepSun'), r.sunSum / r.sunFc - 1, 'xr-green-sun']);
    for (const [label, d, token] of rows) pair(pen, label, pct(d), { size: M, labelCol: color(token), valueCol: color(d >= 0 ? 'xr-green-up' : 'xr-green-down') });
    pen.line(t('greenRepPoints', { n: fmtInt(v.points ?? 0), d: signed(v.gained ?? 0) }), { size: M, weight: 'black', col: color('xr-warning') });
    const dq = r.qol - r.qolBefore;
    pen.line(`${t('greenQol')} ${dq >= 0 ? '+' : '−'}${fmtInt(Math.abs(dq))}`, { size: M, weight: 'bold', col: color('xr-green-qol') });
    const live = r.live ?? [];
    if (live.length) pen.para(t('greenRepLive', { good: live.filter((e) => e.good).length, n: live.length }), { weight: 'bold', col: color('xr-panel-text'), maxLines: 2 });
    if (r.bet) pen.line(`${t('greenBetAsk').replace('?', '')}: ${r.bet.winner === 'player' ? '+' : ''}${r.bet.pts}`, { weight: 'bold', col: color(r.bet.winner === 'player' ? 'xr-green-up' : 'xr-green-down') });
    if (!rows.length) pen.para(t('greenRepNone'), { maxLines: 4 });
    return;
  }
  const { game, type, plot } = v;
  const T = type ? TYPES[type] : null;
  pen.line(t('greenAITitle'), { size: S, weight: 'black', col: color('xr-accent') });
  if (T && plot && !plot.built && plot.area === T.area) {
    const f = game.forecast(type, plot.id);
    pen.line(plotName(plot), { size: M, weight: 'bold', gap: 0.004 });
    const big = T.kind === 'energy' ? `${fmt(f.value)} GWh` : `+${fmtInt(f.value)}`;
    pen.line(big, { size: 0.066, weight: 'black', col: color(T.token), gap: 0.004 });
    if (T.kind === 'energy') pen.line(t('greenRangeVal', { lo: fmt(f.lo), hi: fmt(f.hi) }), { size: M, weight: 'bold', gap: 0.004 });
    else pen.line(t(`greenNeed_${f.need}`, { n: fmtInt(f.input) }), { size: M, weight: 'bold', gap: 0.004 });
    pen.line(T.kind === 'energy' ? t('greenConf', { n: fmtInt(f.conf * 100) }) : t('greenNeedCap', { cap: f.cap }), { size: M, col: color('xr-panel-muted') });
  } else if (T && plot && plot.area !== T.area && !plot.built) {
    pen.para(t(`greenWrong_${T.area}`), { weight: 'bold', col: color('xr-warning'), maxLines: 5 });
  } else if (v.coach) {
    pen.para(v.coach.text, { size: M, weight: 'bold', col: color('xr-panel-text'), maxLines: 7 });
  } else if (T) {
    const best = game.plots.filter((p) => !p.built && p.area === T.area).map((p) => ({ p, f: game.forecast(type, p.id) })).sort((a, b) => b.f.value - a.f.value)[0];
    if (best) {
      pen.line(`Top: ${plotName(best.p)}`, { size: M, weight: 'bold', gap: 0.004 });
      pen.line(T.kind === 'energy' ? `${fmt(best.f.value)} GWh` : `+${fmtInt(best.f.value)}`, { size: 0.06, weight: 'black', col: color(T.token), gap: 0.004 });
      if (T.kind === 'energy') pen.line(t('greenRangeVal', { lo: fmt(best.f.lo), hi: fmt(best.f.hi) }), { size: M, gap: 0.004 });
      else pen.line(t(`greenNeed_${best.f.need}`, { n: fmtInt(best.f.input) }), { size: M, gap: 0.004 });
      pen.line(T.kind === 'energy' ? t('greenConf', { n: fmtInt(best.f.conf * 100) }) : t('greenNeedCap', { cap: best.f.cap }), { size: M, col: color('xr-panel-muted') });
    } else pen.para(t('greenTaken'), { col: color('xr-warning') });
  } else if (plot?.built) {
    pen.line(typeName(plot.built), { size: M, weight: 'bold', col: color(TYPES[plot.built].token) });
    pen.line(plotName(plot), { size: M, col: color('xr-panel-muted') });
  } else if (plot && v.bets && game.canBet(plot.id)) {
    const f = game.forecast('wind', plot.id);
    pen.line(plotName(plot), { size: M, weight: 'bold', gap: 0.004 });
    pen.line(`${fmt(f.value)} GWh ±${fmt((f.hi - f.lo) / 2)}`, { size: M, weight: 'black', col: color('xr-green-wind'), gap: 0.004 });
    pen.para(game.bet?.id === plot.id ? t('greenBetSet', { plot: plotName(plot), dir: t(game.bet.dir > 0 ? 'greenBetUp' : 'greenBetDown') }) : t('greenBetHint'), { weight: 'bold', col: color('xr-accent'), maxLines: 5 });
  } else {
    pen.para(game.bet ? t('greenBetSet', { plot: t(`greenPlot_${game.bet.id}`), dir: t(game.bet.dir > 0 ? 'greenBetUp' : 'greenBetDown') }) : t('greenAIHint'), { size: M, col: color('xr-panel-text'), maxLines: 6 });
  }
}

/** Wide panels: continue in the right column (once). */
function column(pen) {
  if (!pen.right || pen.inRight) return;
  pen.inRight = true;
  pen.x = pen.right.x;
  pen.w = pen.right.w;
  pen.y = pen.right.top;
}

function drawPlan(pen, v) {
  const { game, type, plot } = v;
  const T = type ? TYPES[type] : null;
  if (v.coach) coachBox(pen, v.coach);
  else {
    const sub = !T ? t('greenAIHint') : T.kind === 'social' ? t('greenAISubNeed') : t(type === 'wind' ? 'greenAISubWind' : 'greenAISubSun');
    pen.para(sub, { gap: 0.004, maxLines: 2 });
  }
  if (pen.right) {
    if (v.map && T) { pen.space(0.006); legend(pen, v.map); }
    if (!T && v.bets) { pen.space(0.006); betLine(pen, game, { maxLines: 3 }); }
    column(pen);
  } else if (!v.coach) pen.rule();
  if (!T) {
    if (plot?.built) builtInfo(pen, v);
    else if (plot && v.bets && game.canBet(plot.id)) betInfo(pen, v);
    else {
      overview(pen, game);
      if (!pen.right && v.bets) { pen.space(0.01); betLine(pen, game); }
    }
    return;
  }
  if (plot && plot.built) { builtInfo(pen, v); return; }
  if (plot && !plot.built && plot.area === T.area) {
    const f = game.forecast(type, plot.id);
    pen.line(`${typeName(type)} · ${plotName(plot)}`, { weight: 'bold', gap: 0.002 });
    const big = T.kind === 'energy' ? fmt(f.value) : `+${fmtInt(f.value)}`;
    const unit = T.kind === 'energy' ? t('greenPerYear', { v: '' }).trim() : t('greenQol');
    const { ctx, c } = pen;
    ctx.font = font('black', c.m(0.07));
    ctx.fillStyle = color(T.token);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(big, pen.x, pen.y + c.m(0.06));
    const bw = ctx.measureText(big).width;
    ctx.font = font('bold', c.m(SM()));
    ctx.fillStyle = color('xr-panel-muted');
    ctx.fillText(unit, pen.x + bw + c.m(0.012), pen.y + c.m(0.058), pen.w - bw - c.m(0.012));
    pen.y += c.m(0.078);
    if (T.kind === 'energy') {
      // The usual range (four years in five) as a band, the forecast as the marker.
      const top = Math.max(f.hi * 1.08, game.bestFor(type) * 1.1, 1);
      bar(pen, { lo: f.lo / top, hi: f.hi / top, mark: f.value / top, token: T.token, h: 0.018, gap: 0.008 });
      pen.line(t('greenRangeTitle'), { col: color('xr-panel-muted'), gap: 0 });
      pen.line(`${t('greenRangeVal', { lo: fmt(f.lo), hi: fmt(f.hi) })} GWh`, { weight: 'bold', gap: 0.004 });
      pen.line(t('greenConf', { n: fmtInt(f.conf * 100) }), { col: color('xr-panel-muted'), gap: 0.002 });
      if (!v.coach) pen.line(t('greenHouseholds', { n: fmtInt((f.value * 1000) / HOUSEHOLD_MWH) }), { col: color('xr-panel-muted'), gap: 0.004 });
    } else {
      // The predicted demand (its usual range) against the places the project offers (marker).
      const top = Math.max(f.needHi, f.cap) * 1.12;
      bar(pen, { lo: f.needLo / top, hi: f.needHi / top, mark: f.cap / top, token: T.token, h: 0.018, gap: 0.008 });
      pen.line(t(`greenNeed_${f.need}`, { n: fmtInt(f.input) }), { weight: 'bold', gap: 0.002 });
      pen.line(`${t('greenNeedCap', { cap: f.cap })} · ${t('greenConf', { n: fmtInt(f.conf * 100) })}`, { col: color('xr-panel-muted'), gap: 0.004 });
      // The citizens' wish here, if it is for this project.
      const w = game.wishes.find((x) => x.district === plot.district && x.type === type);
      if (w) pen.para(t('greenWishLabel', { text: t(`greenWish_${w.type}_${w.level}`) }), { col: color('xr-green-social'), weight: 'bold', maxLines: 2 });
    }
    if (game.budget < T.cost - 1e-9) pen.para(t('greenNoMoney'), { col: color('xr-danger'), weight: 'bold' });
  } else if (plot) {
    pen.para(t(`greenWrong_${T.area}`), { col: color('xr-warning'), weight: 'bold', maxLines: 3 });
  } else {
    // The AI's top picks for this project, with their ranges.
    // (Town plots: one row per district, they share its demand.)
    const seen = new Set();
    const list = game.plots.filter((p) => !p.built && p.area === T.area).map((p) => ({ p, f: game.forecast(type, p.id) })).sort((a, b) => b.f.value - a.f.value)
      .filter(({ p }) => { const k = plotName(p); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 3);
    const top = Math.max(1, ...list.map((x) => x.f.hi)) * 1.05;
    for (const { p, f } of list) {
      const val = T.kind === 'energy' ? `${fmt(f.value)} GWh` : `+${fmtInt(f.value)}`;
      if (!pair(pen, plotName(p), val, { valueCol: color(T.token), valueWeight: 'black' })) break;
      if (T.kind === 'energy') bar(pen, { lo: f.lo / top, hi: f.hi / top, mark: f.value / top, token: T.token, h: 0.01, gap: 0.012 });
      else { const nt = Math.max(f.needHi, f.cap) * 1.12; bar(pen, { lo: f.needLo / nt, hi: f.needHi / nt, mark: f.cap / nt, token: T.token, h: 0.01, gap: 0.012 }); }
    }
    if (!list.length) pen.para(t('greenTaken'), { col: color('xr-warning') });
    else if (!pen.right && !v.coach) pen.para(t(v.hint ?? 'greenAIHintPlot'), { maxLines: 3 });
  }
  if (v.map && !pen.right) {
    const { c } = pen;
    const top = c.canvas.height - c.m(0.03 + 0.014) - c.m(SM()) * 1.4;
    if (pen.y <= top) { pen.y = top; legend(pen, v.map); }
  }
}

/** No project chosen: the AI's best place for every project type this year. */
function overview(pen, game) {
  if (!pen.right) pen.line(t('greenAITips'), { weight: 'bold', col: color('xr-panel-muted'), gap: 0.004 });
  for (const type of Object.keys(TYPES)) {
    const T = TYPES[type];
    const best = game.plots.filter((p) => !p.built && p.area === T.area).map((p) => ({ p, f: game.forecast(type, p.id) })).sort((a, b) => b.f.value - a.f.value)[0];
    const value = !best ? '' : T.kind === 'energy' ? `${fmt(best.f.value)} GWh` : `+${fmtInt(best.f.value)}`;
    if (!pair(pen, best ? plotName(best.p) : '–', value, { icon: T.icon, iconCol: color(T.token), valueCol: color(T.token), valueWeight: 'black', rowH: pen.right ? 0.042 : 0.047 })) break;
  }
}

function builtInfo(pen, v) {
  const { game, plot } = v;
  pen.line(t('greenBuiltIn', { type: typeName(plot.built), year: FIRST_YEAR + plot.year }), { weight: 'bold', col: color(TYPES[plot.built].token), gap: 0.004 });
  pen.line(plotName(plot), { col: color('xr-panel-muted'), gap: 0.006 });
  const last = [...game.history].reverse().find((h) => h.projects.some((x) => x.id === plot.id));
  const pr = last?.projects.find((x) => x.id === plot.id);
  if (pr) {
    pen.para(t('greenLastYear', { v: `${fmt(pr.actual)} GWh`, f: fmt(pr.forecast) }), { col: color('xr-panel-text'), maxLines: 2, gap: 0.004 });
    const d = pr.actual / pr.forecast - 1;
    pen.line(pct(d), { size: num('xr-text-md'), weight: 'black', col: color(d >= 0 ? 'xr-green-up' : 'xr-green-down'), gap: 0.002 });
    // Without the year's weather: the AI's error at this very place (a hint for bets).
    const wx = WEATHER[last.weather][pr.type === 'wind' ? 'wind' : 'sun'];
    pen.para(t('greenAdjusted', { d: pct(pr.actual / (pr.forecast * wx) - 1) }), { maxLines: 2 });
  } else if (TYPES[plot.built].kind === 'energy') {
    const f = game.forecast(plot.built, plot.id);
    pen.line(`${fmt(f.value)} GWh`, { weight: 'bold' });
    pen.para(`${t('greenRangeTitle')} ${t('greenRangeVal', { lo: fmt(f.lo), hi: fmt(f.hi) })}`, { maxLines: 2 });
  }
  if (game.pending.includes(plot.id)) pen.para(t(v.undoHint ?? 'greenUndoHint'), { maxLines: 3 });
}

function drawSim(pen, v) {
  const { report, month, news } = v;
  const names = t('greenMonthNames').split(',');
  pen.line(names[Math.min(11, Math.floor(month))], { weight: 'bold', col: color('xr-panel-muted'), gap: 0.004 });
  if (!pen.right) pen.rule();
  // Running totals so far (the months that passed).
  const k = Math.min(12, month);
  let w = 0;
  let s = 0;
  let wf = 0;
  let sf = 0;
  for (let i = 0; i < 12; i++) {
    const f = Math.max(0, Math.min(1, k - i));
    w += report.months[i].wind * f;
    s += report.months[i].sun * f;
    wf += report.windFc * MONTH_WIND[i] * f;
    sf += report.sunFc * MONTH_SUN[i] * f;
  }
  const row = (label, a, fc, token) => {
    pair(pen, label, `${fmt(a)} GWh`, { labelCol: color(token), weight: 'black' });
    if (fc > 0.01) pair(pen, t('greenAITitle'), `${fmt(fc)} · ${pct(a / fc - 1)}`, { labelCol: color('xr-panel-muted'), valueCol: color('xr-panel-muted'), weight: 'regular' });
  };
  if (report.windFc > 0) row(t('greenRepWind'), w, wf, 'xr-green-wind');
  if (report.sunFc > 0) row(t('greenRepSun'), s, sf, 'xr-green-sun');
  if (!report.windFc && !report.sunFc) pen.para(t('greenRepNone'), { maxLines: 3 });
  if (v.game?.battery) pen.line(t('greenBattery'), { weight: 'bold', col: color('xr-green-sun'), gap: 0.002 });
  pen.space(0.008);
  const fcMonths = report.windFc || report.sunFc ? MONTH_WIND.map((m, i) => report.windFc * m + report.sunFc * MONTH_SUN[i]) : null;
  if (pen.right) {
    column(pen);
    if (news) pen.para(news, { weight: 'bold', col: color('xr-warning'), maxLines: 2 });
    monthChart(pen, report.months, k, { h: 0.2, forecast: fcMonths });
    return;
  }
  monthChart(pen, report.months, k, { h: 0.085, forecast: fcMonths });
  if (news) pen.para(news, { weight: 'bold', col: color('xr-warning'), maxLines: 4 });
}

function drawReport(pen, v) {
  const { report: r } = v;
  if (!pen.right) pen.rule(0.008);
  const rows = [];
  if (r.windFc > 0) rows.push([t('greenRepWind'), r.windSum, r.windFc, 'xr-green-wind']);
  if (r.sunFc > 0) rows.push([t('greenRepSun'), r.sunSum, r.sunFc, 'xr-green-sun']);
  if (rows.length > 1) rows.push([t('greenRepTotal'), r.energy, r.forecastEnergy, 'xr-green-energy']);
  const top = Math.max(1, ...rows.map((x) => Math.max(x[1], x[2]))) * 1.1;
  if (rows.length && !pen.right) pen.line(t('greenRepHead'), { col: color('xr-panel-muted'), gap: 0.002 });
  for (const [label, a, f, token] of rows) {
    const d = a / f - 1;
    pair(pen, label, `${fmt(a)} GWh  ${pct(d)}`, { labelCol: color(token), valueCol: color(d >= 0 ? 'xr-green-up' : 'xr-green-down') });
    bar(pen, { k: a / top, mark: f / top, token, h: 0.012, gap: 0.01 });
  }
  if (!rows.length) pen.para(t('greenRepNone'), { maxLines: 3 });
  column(pen);
  // The points so far: what this year added.
  if (v.points !== undefined) pen.line(t('greenRepPoints', { n: fmtInt(v.points), d: signed(v.gained ?? 0) }), { weight: 'black', col: color('xr-warning'), gap: 0.006 });
  const met = (r.wishes ?? []).filter((w) => w.met).length;
  const dq = r.qol - r.qolBefore;
  pen.para(`${t('greenRepQol', { d: `${dq >= 0 ? '+' : '−'}${fmtInt(Math.abs(dq))}`, qol: fmtInt(r.qol) })}${met ? ` · ${t('greenRepWish', { n: met })}` : ''}`, { weight: 'bold', col: color('xr-green-qol'), maxLines: 2, gap: 0.004 });
  const live = r.live ?? [];
  if (live.length) pen.para(t('greenRepLive', { good: live.filter((e) => e.good).length, n: live.length }), { weight: 'bold', col: color(live.every((e) => e.good) ? 'xr-green-up' : 'xr-warning'), maxLines: 2, gap: 0.004 });
  if (r.bet) betResult(pen, r.bet);
  const last = r.year >= YEARS - 1;
  const money2 = [r.revenue > 0.05 && !last ? t('greenRepReturns', { n: money(r.revenue) }) : null, r.costs > 0.05 ? t('greenRepCosts', { n: `−${money(r.costs)}` }) : null].filter(Boolean).join(' · ');
  if (money2) pen.para(money2, { maxLines: 2, gap: 0.004 });
  // The mix: the whole portfolio was closer to the forecast than its parts.
  if (r.windFc > 0 && r.sunFc > 0) {
    const dw = Math.abs(r.windSum / r.windFc - 1);
    const ds = Math.abs(r.sunSum / r.sunFc - 1);
    const dt = Math.abs(r.energy / r.forecastEnergy - 1);
    if (dt < Math.max(dw, ds) - 0.01) pen.para(t('greenRepMix', { p: `${fmtInt(dt * 100)} %` }), { col: color('xr-green-energy'), weight: 'bold', maxLines: 2, gap: 0.004 });
  }
  if (r.waiting.length) pen.para(t('greenRepWaiting', { list: r.waiting.map((k) => t(`greenDistrict_${k}`)).join(', ') }), { col: color('xr-warning'), maxLines: 2 });
}

/** The year's bet: who was right, the player or the AI. */
function betResult(pen, b) {
  const name = t(`greenPlot_${b.id}`);
  const text = b.winner === 'player' ? t('greenBetWin', { plot: name, d: pct(b.d), pts: b.pts }) : t('greenBetLose', { plot: name, d: pct(b.d), pts: b.pts });
  pen.para(text, { weight: 'bold', col: color(b.winner === 'player' ? 'xr-green-up' : 'xr-green-down'), maxLines: 2, gap: 0.004 });
}

/** The bet of this year (or how to place one). */
function betLine(pen, game, opt = {}) {
  if (game.bet) pen.para(t('greenBetSet', { plot: t(`greenPlot_${game.bet.id}`), dir: t(game.bet.dir > 0 ? 'greenBetUp' : 'greenBetDown') }), { col: color('xr-accent'), weight: 'bold', maxLines: 3, ...opt });
  else pen.para(t('greenBetHint'), { maxLines: 4, ...opt });
}

/** An uncertain plot (no project chosen): the AI's wind forecast and the bet on it. */
function betInfo(pen, v) {
  const { game, plot } = v;
  const f = game.forecast('wind', plot.id);
  pen.line(`${plotName(plot)} · ${t('greenType_wind')}`, { weight: 'bold', gap: 0.002 });
  pen.line(`${fmt(f.value)} GWh · ${t('greenConf', { n: fmtInt(f.conf * 100) })}`, { weight: 'black', col: color('xr-green-wind'), gap: 0.004 });
  const top = Math.max(f.hi * 1.08, 1);
  bar(pen, { lo: f.lo / top, hi: f.hi / top, mark: f.value / top, token: 'xr-green-wind', h: 0.014, gap: 0.008 });
  betLine(pen, game);
  pen.para(t('greenBetInfo'), { maxLines: 3 });
}

// ---------- the region dashboard ----------

/** Region status: budget, green power, CO2, quality of life, the points, the portfolio mix. */
export function dashPanel(w, h, view) {
  return new Panel(w, h, (ctx, c) => {
    c.surface();
    const v = view();
    const { game } = v;
    const pen = new Pen(ctx, c, 0.03);
    const year = v.year ?? Math.min(game.year, YEARS - 1);
    pen.line(t('greenDash', { year: FIRST_YEAR + year }), { size: num('xr-text-md'), weight: 'black', gap: 0.002 });
    // One dot per year: done (filled), now (a ring in the accent color), to come (dim).
    for (let i = 0; i < YEARS; i++) {
      const cx = pen.x + c.m(0.009) + i * c.m(0.03);
      const cy = pen.y + c.m(0.01);
      ctx.beginPath();
      ctx.arc(cx, cy, c.m(0.0085), 0, Math.PI * 2);
      ctx.fillStyle = color(i < year ? 'xr-green-energy' : 'xr-button-bg');
      ctx.fill();
      if (i === year) { ctx.lineWidth = c.m(0.004); ctx.strokeStyle = color('xr-accent'); ctx.stroke(); }
    }
    pen.y += c.m(0.032);
    const kv = (label, value, token = 'xr-panel-text') => pair(pen, label, value, { labelCol: color('xr-panel-muted'), valueCol: color(token), valueWeight: 'black', rowH: 0.046 });
    kv(t('greenBudget'), money(game.budget), 'xr-warning');
    const last = v.report ?? game.history[game.history.length - 1];
    const power = v.power ?? last?.energy ?? 0;
    kv(t('greenPower'), `${fmt(power)} GWh`, 'xr-green-energy');
    kv(t('greenCO2'), t('greenTons', { n: fmtInt(v.co2 ?? game.co2Total) }), 'xr-green-co2');
    kv(t('greenQol'), `${fmtInt(v.qol ?? game.qol)} %`, 'xr-green-qol');
    bar(pen, { k: (v.qol ?? game.qol) / 100, token: 'xr-green-qol', h: 0.014, gap: 0.01 });
    if (v.points !== undefined) kv(t('greenPoints'), fmtInt(v.points), 'xr-warning');
    // Portfolio: money in energy and social projects, and how many of each type.
    pen.space(0.004);
    const total = game.spentBy.energy + game.spentBy.social;
    const H = c.m(0.016);
    ctx.fillStyle = color('xr-button-bg');
    rr(ctx, pen.x, pen.y, pen.w, H, H / 2);
    ctx.fill();
    if (total > 0) {
      const ke = game.spentBy.energy / total;
      ctx.save();
      rr(ctx, pen.x, pen.y, pen.w, H, H / 2);
      ctx.clip();
      ctx.fillStyle = color('xr-green-energy');
      ctx.fillRect(pen.x, pen.y, pen.w * ke, H);
      ctx.fillStyle = color('xr-green-social');
      ctx.fillRect(pen.x + pen.w * ke, pen.y, pen.w * (1 - ke), H);
      ctx.restore();
    }
    pen.y += H + c.m(0.004);
    pair(pen, t('greenEnergy'), t('greenSocial'), { labelCol: color('xr-green-energy'), valueCol: color('xr-green-social') });
    // Counts per type with their icons.
    const keys = Object.keys(TYPES);
    const cw = pen.w / keys.length;
    const px = c.m(SM());
    keys.forEach((k, i) => {
      const n = game.plots.filter((p) => p.built === k).length;
      const cx = pen.x + cw * i + cw / 2;
      drawIcon(ctx, TYPES[k].icon, cx - px * 0.55, pen.y + px * 0.7, px * 1.05, color(n ? TYPES[k].token : 'xr-panel-muted'));
      ctx.font = font('black', px);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color(n ? 'xr-panel-text' : 'xr-panel-muted');
      ctx.fillText(String(n), cx + px * 0.15, pen.y + px * 0.72);
    });
    pen.y += px * 1.5;
    if (last) monthChart(pen, last.months, v.upto ?? 12, { h: 0.075 });
  });
}

// ---------- the AI's warning ----------

/** A small round badge with a check mark (good) or a cross (bad): the outcome, not by color alone. */
function verdict(ctx, c, x, y, r, good) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = color(good ? 'xr-green-up' : 'xr-green-down');
  ctx.fill();
  ctx.strokeStyle = color('xr-green-alert-bg');
  ctx.lineWidth = r * 0.3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (good) { ctx.moveTo(x - r * 0.45, y + r * 0.02); ctx.lineTo(x - r * 0.12, y + r * 0.38); ctx.lineTo(x + r * 0.48, y - r * 0.32); } else { ctx.moveTo(x - r * 0.38, y - r * 0.38); ctx.lineTo(x + r * 0.38, y + r * 0.38); ctx.moveTo(x + r * 0.38, y - r * 0.38); ctx.lineTo(x - r * 0.38, y + r * 0.38); }
  ctx.stroke();
}

/**
 * The AI's warning while the year runs. view() -> { ev, secs (null: no countdown), lead, reacted,
 * waited, outcome, act, cost, risk, waitAct }: countdown ring around the event's icon, the
 * confidence, what reacting costs and what waiting risks, then the decision and the outcome.
 */
export function alertPanel(w, h, view, kind = 'bar') {
  return new Panel(w, h, (ctx, c) => {
    const v = view();
    if (!v?.ev) return;
    const { ev } = v;
    const L = LIVE[ev.type];
    const done = !!v.outcome;
    const tok = done ? (v.outcome.good ? 'xr-green-up' : 'xr-green-down') : v.reacted ? 'xr-green-up' : 'xr-warning';
    c.surface({ fill: color('xr-green-alert-bg'), stroke: color(tok), strokeWidth: num('xr-border-width') * 2 });
    if (kind === 'card') { drawAlertCard(ctx, c, v, tok); return; }
    const H = c.canvas.height;
    const R = c.m(0.062);
    const cx = c.m(0.03) + R;
    const cy = H / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = color('xr-button-bg');
    ctx.fill();
    if (!done && v.secs !== null) {
      // The countdown runs out around the icon.
      ctx.beginPath();
      ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, v.secs / v.lead)));
      ctx.lineWidth = c.m(0.008);
      ctx.strokeStyle = color(tok);
      ctx.stroke();
    }
    drawIcon(ctx, L.icon, cx, cy, R * 1.15, color(L.token));
    if (done) verdict(ctx, c, cx + R * 0.72, cy + R * 0.72, R * 0.42, v.outcome.good);
    const x = cx + R + c.m(0.025);
    const tw = c.canvas.width - x - c.m(0.025);
    const pen = new Pen(ctx, c, 0.02);
    pen.x = x;
    pen.w = tw;
    pen.y = c.m(0.016);
    const name = t(`greenLive_${ev.type}`);
    if (done) {
      pen.line(`${name} · ${t('greenWarnConf', { n: fmtInt(ev.conf * 100) })}${v.outcome.pts ? ` · +${v.outcome.pts} ${t('greenPoints')}` : ''}`, { weight: 'bold', col: color(v.outcome.pts ? tok : 'xr-panel-muted'), gap: 0.006 });
      pen.para(v.outcome.text, { size: num('xr-text-md'), weight: 'black', col: color(tok), maxLines: 3 });
      return;
    }
    pen.line(`${t('greenWarnTitle')}: ${v.secs !== null ? t('greenWarn', { event: name, s: Math.max(0, Math.ceil(v.secs)) }) : name}`, { size: num('xr-text-md'), weight: 'black', col: color('xr-warning'), gap: 0.006 });
    // The confidence as a bar.
    const bh = c.m(0.016);
    const bw = tw * 0.5;
    ctx.fillStyle = color('xr-button-bg');
    rr(ctx, x, pen.y, bw, bh, bh / 2);
    ctx.fill();
    ctx.fillStyle = color('xr-accent');
    rr(ctx, x, pen.y, bw * ev.conf, bh, bh / 2);
    ctx.fill();
    ctx.font = font('black', c.m(SM()));
    ctx.fillStyle = color('xr-accent');
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(t('greenWarnConf', { n: fmtInt(ev.conf * 100) }), x + bw + c.m(0.014), pen.y + bh / 2, tw - bw - c.m(0.014));
    pen.y += bh + c.m(0.016);
    if (v.reacted) pen.line(t(`greenActDone_${ev.type}`), { weight: 'black', col: color('xr-green-up') });
    else if (v.waited) pen.line(t('greenWaitDone'), { weight: 'black', col: color('xr-panel-text') });
    else {
      // A star marks the AI's tip (first warning of a round, relaxed mode).
      pen.line(`${v.tip === 'react' ? '★ ' : ''}${v.act}: ${v.cost}`, { weight: 'bold', col: color(v.tip === 'react' ? 'xr-accent' : v.tip ? 'xr-panel-muted' : 'xr-panel-text'), gap: 0.002 });
      pen.line(`${v.tip === 'wait' ? '★ ' : ''}${v.waitAct}: ${v.risk}`, { weight: 'bold', col: color(v.tip === 'wait' ? 'xr-accent' : 'xr-panel-muted') });
    }
  });
}

/** The warning as a small card (phones held sideways: in the corner instead of the AI panel). */
function drawAlertCard(ctx, c, v, tok) {
  const { ev } = v;
  const L = LIVE[ev.type];
  const pen = new Pen(ctx, c, 0.024);
  const R = c.m(0.045);
  const cx = pen.x + R;
  const cy = pen.y + R;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fillStyle = color('xr-button-bg');
  ctx.fill();
  if (!v.outcome && v.secs !== null) {
    ctx.beginPath();
    ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, v.secs / v.lead)));
    ctx.lineWidth = c.m(0.007);
    ctx.strokeStyle = color(tok);
    ctx.stroke();
  }
  drawIcon(ctx, L.icon, cx, cy, R * 1.15, color(L.token));
  if (v.outcome) verdict(ctx, c, cx + R * 0.72, cy + R * 0.72, R * 0.42, v.outcome.good);
  const M = SM() * 1.15;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const tx = cx + R + c.m(0.02);
  const tw = pen.w - 2 * R - c.m(0.02);
  // The event and how sure the AI is, next to the icon.
  ctx.font = font('black', c.m(M));
  ctx.fillStyle = color(v.outcome ? tok : 'xr-warning');
  const head = v.outcome || v.secs === null ? t(`greenLive_${ev.type}`) : `${t(`greenLive_${ev.type}`)} ${Math.max(0, Math.ceil(v.secs))} s`;
  ctx.fillText(head, tx, cy - R * 0.45, tw);
  ctx.fillStyle = color('xr-accent');
  ctx.fillText(t('greenWarnConf', { n: fmtInt(ev.conf * 100) }), tx, cy + R * 0.5, tw);
  pen.y += 2 * R + c.m(0.014);
  if (v.outcome) { pen.para(v.outcome.text, { size: M, weight: 'black', col: color(tok), maxLines: 6 }); return; }
  if (v.reacted) { pen.para(t(`greenActDone_${ev.type}`), { size: M, weight: 'black', col: color('xr-green-up'), maxLines: 3 }); return; }
  if (v.waited) { pen.para(t('greenWaitDone'), { size: M, weight: 'black', col: color('xr-panel-text'), maxLines: 3 }); return; }
  pen.para(`${v.tip === 'react' ? '★ ' : ''}${v.act}: ${v.cost}`, { weight: 'bold', col: color(v.tip === 'react' ? 'xr-accent' : v.tip ? 'xr-panel-muted' : 'xr-panel-text'), maxLines: 3, gap: 0.006 });
  pen.para(`${v.tip === 'wait' ? '★ ' : ''}${v.waitAct}: ${v.risk}`, { weight: 'bold', col: color(v.tip === 'wait' ? 'xr-accent' : 'xr-panel-muted'), maxLines: 3 });
}

/** A short message in a framed panel (opaque, so nothing shines through). */
export function toast(text, sub, token, w = 0.62) {
  const blocks = [{ text, size: 'xr-text-md', weight: 'black', color: color(token), gap: sub ? 0.008 : 0 }];
  if (sub) blocks.push({ text: sub, size: 'xr-text-sm', color: color('xr-panel-text') });
  const p = textPanel(w, 0.08, blocks, { surface: { fill: color('xr-green-alert-bg'), stroke: color(token) } });
  p.userData.noFit = true;
  return p;
}
