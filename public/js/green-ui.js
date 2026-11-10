// "Grünes Portfolio" (key 'green'): the 3D UI. Project cards (tiles to click or grab), the AI
// forecast panel (heat-map legend, forecast with its 80 % range and confidence, the AI's top
// picks, the running year, forecast versus result), the region dashboard and number formats.
// Colors and sizes from the tokens; the shared Panel/textPanel building blocks from ui3d.js.
import { Panel, textPanel, roundRect } from './ui3d.js';
import { color, num, font } from './tokens.js';
import { ICONS, drawIcon } from './icons.js';
import { t, getLang } from './i18n.js';
import { TYPES, YEARS, FIRST_YEAR, HOUSEHOLD_MWH, CO2_PER_GWH, MONTH_WIND, MONTH_SUN } from './green-sim.js';

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
export const typeName = (k) => t(`greenType_${k}`);
export const plotName = (p) => (p.area === 'land' ? t(`greenPlot_${p.id}`) : t(`greenDistrict_${p.district}`));

// ---------- tiles ----------

/** Interactive canvas tile (like the AI Arena's): hover grows it, draw(ctx, panel, state). */
export function iconTile(w, h, draw) {
  let hover = false;
  const p = new Panel(w, h, (ctx, c) => draw(ctx, c, { hover }));
  p.userData.interactive = true;
  p.userData.setHover = (v) => { hover = v; p.scale.setScalar(v ? num('xr-hover-scale') : 1); p.redraw(); };
  return p;
}

/** Fits a text into maxW by shrinking the font (not below minPx). */
function fitText(ctx, text, weight, px, maxW, minPx) {
  let s = px;
  ctx.font = font(weight, s);
  while (ctx.measureText(text).width > maxW && s > minPx) { s -= 1; ctx.font = font(weight, s); }
  return s;
}

/** A project card: icon, name, cost; state() -> { selected, disabled }. */
export function projectCard(type, state) {
  const T = TYPES[type];
  const w = num('xr-green-card');
  const tile = iconTile(w, w * 1.04, (ctx, c, s) => {
    const st = state();
    const W = c.canvas.width;
    const H = c.canvas.height;
    c.surface({ fill: color(st.selected ? 'xr-button-hover' : s.hover && !st.disabled ? 'xr-button-hover' : 'xr-button-bg'), stroke: color(st.selected ? T.token : 'xr-panel-border'), strokeWidth: num('xr-border-width') * (st.selected ? 2.6 : 1), stripe: false });
    ctx.globalAlpha = st.disabled ? 0.38 : 1;
    // A band in the project's color along the top.
    ctx.save();
    roundRect(ctx, c.m(0.008), c.m(0.008), W - c.m(0.016), H - c.m(0.016), c.m(num('xr-radius') * 0.8));
    ctx.clip();
    ctx.fillStyle = color(T.token);
    ctx.fillRect(0, 0, W, c.m(0.012));
    ctx.restore();
    drawIcon(ctx, T.icon, W / 2, H * 0.36, c.m(0.058), color(T.token));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color('xr-button-text');
    fitText(ctx, typeName(type), 'black', c.m(num('xr-text-sm')), W - c.m(0.014), c.m(0.022));
    ctx.fillText(typeName(type), W / 2, H * 0.66);
    ctx.fillStyle = color('xr-panel-muted');
    fitText(ctx, t('greenCost', { n: T.cost }), 'bold', c.m(num('xr-text-min')) * 0.9, W - c.m(0.02), c.m(0.02));
    ctx.fillText(t('greenCost', { n: T.cost }), W / 2, H * 0.85);
    // Keyboard: the number key in the corner.
    if (st.key) {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = font('bold', c.m(0.022));
      ctx.fillText(st.key, c.m(0.012), c.m(0.016));
    }
    ctx.globalAlpha = 1;
  });
  tile.userData.label = typeName(type);
  tile.userData.type = type;
  return tile;
}

/** The big action button next to the cards: run the year, next, results. */
export function actionTile(state) {
  const w = num('xr-green-card') * 1.45;
  return iconTile(w, num('xr-green-card') * 1.04, (ctx, c, s) => {
    const st = state();
    const W = c.canvas.width;
    const H = c.canvas.height;
    c.surface({ fill: color(st.disabled ? 'xr-button-bg' : s.hover ? 'xr-primary-hover' : 'xr-primary'), stroke: color('xr-primary-hover'), stripe: false });
    ctx.globalAlpha = st.disabled ? 0.45 : 1;
    const fg = color(st.disabled ? 'xr-button-text' : 'xr-on-primary');
    drawIcon(ctx, st.icon, W / 2, H * 0.34, c.m(0.056), fg);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    fitText(ctx, st.label, 'black', c.m(num('xr-text-md')), W - c.m(0.02), c.m(0.024));
    ctx.fillText(st.label, W / 2, H * 0.68);
    if (st.sub) {
      ctx.font = font('bold', c.m(num('xr-text-min')) * 0.85);
      ctx.fillText(st.sub, W / 2, H * 0.87);
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
  }

  /** One line of text; size in meters. Returns its height in px. */
  line(text, { size = num('xr-text-sm'), weight = 'regular', col = color('xr-panel-text'), gap = 0.008, align = 'left', min = 0.022 } = {}) {
    const { ctx, c } = this;
    const px = fitText(ctx, text, weight, c.m(size * (this.k ?? 1)), this.w, c.m(min));
    ctx.fillStyle = col;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    const x = align === 'left' ? this.x : align === 'right' ? this.x + this.w : this.x + this.w / 2;
    ctx.fillText(text, x, this.y + px * 0.62);
    this.y += px * 1.24 + c.m(gap);
    return px;
  }

  /** Wrapped text (up to maxLines). */
  para(text, { size = num('xr-text-min'), weight = 'regular', col = color('xr-panel-muted'), gap = 0.008, maxLines = 3 } = {}) {
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
    lines.slice(0, maxLines).forEach((l, i) => {
      const last = i === maxLines - 1 && lines.length > maxLines;
      ctx.fillText(last ? `${l.replace(/\s+\S*$/, '')} …` : l, this.x, this.y + px * 0.62);
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

/** Legend of the AI map: the color ramp, low/high and the hatching for "unsure". */
function legend(pen, mode) {
  const { ctx, c } = pen;
  const kk = pen.k ?? 1;
  const ramp = mode === 'need' ? 'need' : mode;
  const H = c.m(0.014 * kk);
  const w = pen.w * 0.52;
  const g = ctx.createLinearGradient(pen.x, 0, pen.x + w, 0);
  g.addColorStop(0, color(`xr-green-heat-${ramp}-lo`));
  g.addColorStop(0.5, color(`xr-green-heat-${ramp}-mid`));
  g.addColorStop(1, color(`xr-green-heat-${ramp}-hi`));
  ctx.fillStyle = g;
  rr(ctx, pen.x, pen.y, w, H, H / 2);
  ctx.fill();
  // Hatch sample.
  const hx = pen.x + w + c.m(0.02);
  const hw = c.m(0.04);
  ctx.save();
  rr(ctx, hx, pen.y, hw, H, H / 2);
  ctx.clip();
  ctx.fillStyle = color(`xr-green-heat-${ramp}-mid`);
  ctx.fillRect(hx, pen.y, hw, H);
  ctx.strokeStyle = color('xr-panel-bg');
  ctx.lineWidth = c.m(0.004);
  for (let k = -2; k < 8; k++) {
    ctx.beginPath();
    ctx.moveTo(hx + k * c.m(0.008), pen.y + H);
    ctx.lineTo(hx + k * c.m(0.008) + H, pen.y);
    ctx.stroke();
  }
  ctx.restore();
  const ty = pen.y + H + c.m(0.016 * kk);
  ctx.font = font('bold', c.m(0.022 * kk));
  ctx.fillStyle = color('xr-panel-muted');
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(t('greenLegendLow'), pen.x, ty);
  ctx.textAlign = 'right';
  ctx.fillText(t('greenLegendHigh'), pen.x + w, ty);
  ctx.textAlign = 'left';
  ctx.fillText(t('greenLegendUnsure'), hx, ty);
  pen.y = ty + c.m(0.016);
}

/** Monthly energy as stacked bars (wind below, sun on top) up to month `upto`. */
function monthChart(pen, months, upto, { h = 0.09, forecast = null } = {}) {
  const { ctx, c } = pen;
  const H = c.m(h);
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
  pen.y += H + c.m(0.006);
  ctx.font = font('bold', c.m(0.02));
  ctx.fillStyle = color('xr-panel-muted');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  t('greenMonths').split(' ').forEach((m, i) => ctx.fillText(m, pen.x + i * (bw + gap) + bw / 2, pen.y + c.m(0.008)));
  pen.y += c.m(0.022);
}

// ---------- the AI forecast panel ----------

/**
 * The AI panel. view() returns what to show:
 *   { mode: 'plan', type, plot, game, map, touch }   forecast for a type (and a plot)
 *   { mode: 'sim', report, month, news }             the running year
 *   { mode: 'report', report, game }                 forecast versus result
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
    pen.line(title, { size: num('xr-text-md'), weight: 'black', col: color('xr-accent'), gap: 0.002 });
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

/** Phones held sideways: a small corner panel with only the key numbers, in large letters. */
function drawMini(ctx, c, v) {
  const pen = new Pen(ctx, c, 0.026);
  const S = num('xr-text-md');
  const M = num('xr-text-sm') * 1.15;
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
    if (v.news) pen.para(v.news, { size: num('xr-text-sm'), weight: 'bold', col: color('xr-warning'), maxLines: 4 });
    return;
  }
  if (v.mode === 'report') {
    const r = v.report;
    pen.line(t('greenReportTitle', { year: r.label }), { size: S, weight: 'black', col: color('xr-accent') });
    const rows = [];
    if (r.windFc > 0) rows.push([t('greenRepWind'), r.windSum / r.windFc - 1, 'xr-green-wind']);
    if (r.sunFc > 0) rows.push([t('greenRepSun'), r.sunSum / r.sunFc - 1, 'xr-green-sun']);
    if (rows.length) rows.push([t('greenRepTotal'), r.energy / r.forecastEnergy - 1, 'xr-green-energy']);
    for (const [label, d, token] of rows) {
      ctx.font = font('bold', c.m(M));
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillStyle = color(token);
      ctx.fillText(label, pen.x, pen.y + c.m(M * 0.62));
      ctx.textAlign = 'right';
      ctx.fillStyle = color(d >= 0 ? 'xr-green-up' : 'xr-green-down');
      ctx.fillText(pct(d), pen.x + pen.w, pen.y + c.m(M * 0.62));
      pen.y += c.m(M * 1.3);
    }
    const dq = r.qol - r.qolBefore;
    pen.line(`${t('greenQol')} ${dq >= 0 ? '+' : '−'}${fmtInt(Math.abs(dq))}`, { size: M, weight: 'bold', col: color('xr-green-qol') });
    if (!rows.length) pen.para(t('greenRepNone'), { size: num('xr-text-sm'), maxLines: 4 });
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
    if (T.kind === 'energy') pen.line(`80 %: ${fmt(f.lo)} – ${fmt(f.hi)}`, { size: M, weight: 'bold', gap: 0.004 });
    else pen.line(t(`greenNeed_${f.need}`, { n: fmtInt(f.input) }), { size: M, weight: 'bold', gap: 0.004 });
    pen.line(T.kind === 'energy' ? t('greenConf', { n: fmtInt(f.conf * 100) }) : t('greenNeedCap', { cap: f.cap }), { size: M, col: color('xr-panel-muted') });
  } else if (T && plot && plot.area !== T.area && !plot.built) {
    pen.para(t(`greenWrong_${T.area}`), { size: num('xr-text-sm'), weight: 'bold', col: color('xr-warning'), maxLines: 5 });
  } else if (T) {
    const best = game.plots.filter((p) => !p.built && p.area === T.area).map((p) => ({ p, f: game.forecast(type, p.id) })).sort((a, b) => b.f.value - a.f.value)[0];
    if (best) {
      pen.line(`Top: ${plotName(best.p)}`, { size: M, weight: 'bold', gap: 0.004 });
      pen.line(T.kind === 'energy' ? `${fmt(best.f.value)} GWh` : `+${fmtInt(best.f.value)}`, { size: 0.06, weight: 'black', col: color(T.token), gap: 0.004 });
      if (T.kind === 'energy') pen.line(`80 %: ${fmt(best.f.lo)} – ${fmt(best.f.hi)}`, { size: M, gap: 0.004 });
      else pen.line(t(`greenNeed_${best.f.need}`, { n: fmtInt(best.f.input) }), { size: M, gap: 0.004 });
      pen.line(T.kind === 'energy' ? t('greenConf', { n: fmtInt(best.f.conf * 100) }) : t('greenNeedCap', { cap: best.f.cap }), { size: M, col: color('xr-panel-muted') });
    } else pen.para(t('greenTaken'), { size: num('xr-text-sm'), col: color('xr-warning') });
  } else if (plot?.built) {
    pen.line(typeName(plot.built), { size: M, weight: 'bold', col: color(TYPES[plot.built].token) });
    pen.line(plotName(plot), { size: M, col: color('xr-panel-muted') });
  } else {
    pen.para(t('greenIntroTouch'), { size: num('xr-text-sm'), col: color('xr-panel-text'), maxLines: 5 });
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
  const sub = !T ? t('greenAIHint') : T.kind === 'social' ? t('greenAISubNeed') : t(type === 'wind' ? 'greenAISubWind' : 'greenAISubSun');
  pen.para(sub, { gap: 0.004, maxLines: 2 });
  if (pen.right) {
    if (v.map) { pen.space(0.006); legend(pen, v.map); }
    column(pen);
  } else pen.rule();
  if (!T) {
    if (plot?.built) builtInfo(pen, v);
    else overview(pen, game);
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
    ctx.font = font('bold', c.m(num('xr-text-sm')));
    ctx.fillStyle = color('xr-panel-muted');
    ctx.fillText(unit, pen.x + bw + c.m(0.012), pen.y + c.m(0.058));
    pen.y += c.m(0.078);
    if (T.kind === 'energy') {
      // The 80 % range as a band, the forecast as the marker.
      const top = Math.max(f.hi * 1.08, game.bestFor(type) * 1.1, 1);
      bar(pen, { lo: f.lo / top, hi: f.hi / top, mark: f.value / top, token: T.token, h: 0.018, gap: 0.008 });
      pen.line(t('greenRange', { lo: fmt(f.lo), hi: `${fmt(f.hi)} GWh` }), { size: num('xr-text-min'), weight: 'bold', gap: 0.002 });
      const input = type === 'wind' ? t('greenWindIn', { v: fmt(f.input) }) : t('greenSunIn', { v: fmtInt(f.input) });
      pen.line(`${input} · ${t('greenConf', { n: fmtInt(f.conf * 100) })}`, { size: num('xr-text-min'), col: color('xr-panel-muted'), gap: 0.002 });
      pen.line(`${t('greenHouseholds', { n: fmtInt((f.value * 1000) / HOUSEHOLD_MWH) })} · ${t('greenCO2Year', { n: fmtInt(f.value * CO2_PER_GWH) })}`, { size: num('xr-text-min'), col: color('xr-panel-muted'), gap: 0.004 });
    } else {
      // The predicted demand (80 % band) against the places the project offers (marker).
      const top = Math.max(f.needHi, f.cap) * 1.12;
      bar(pen, { lo: f.needLo / top, hi: f.needHi / top, mark: f.cap / top, token: T.token, h: 0.018, gap: 0.008 });
      pen.line(`${t(`greenNeed_${f.need}`, { n: fmtInt(f.input) })} · ${t('greenNeedCap', { cap: f.cap })}`, { size: num('xr-text-min'), weight: 'bold', gap: 0.002 });
      pen.line(`${t('greenRange', { lo: fmtInt(f.needLo), hi: fmtInt(f.needHi) })} · ${t('greenConf', { n: fmtInt(f.conf * 100) })}`, { size: num('xr-text-min'), col: color('xr-panel-muted'), gap: 0.004 });
    }
    if (game.budget < T.cost - 1e-9) pen.para(t('greenNoMoney'), { col: color('xr-danger'), weight: 'bold' });
  } else if (plot) {
    pen.para(t(`greenWrong_${T.area}`), { size: num('xr-text-sm'), col: color('xr-warning'), weight: 'bold', maxLines: 3 });
  } else {
    // The AI's top picks for this project, with their ranges.
    // (Town plots: one row per district, they share its demand.)
    const seen = new Set();
    const list = game.plots.filter((p) => !p.built && p.area === T.area).map((p) => ({ p, f: game.forecast(type, p.id) })).sort((a, b) => b.f.value - a.f.value)
      .filter(({ p }) => { const k = plotName(p); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, pen.right ? 3 : 4);
    const top = Math.max(1, ...list.map((x) => x.f.hi)) * 1.05;
    for (const { p, f } of list) {
      const val = T.kind === 'energy' ? `${fmt(f.value)} GWh` : `+${fmtInt(f.value)} · ${fmtInt(f.input)}`;
      const { ctx, c } = pen;
      const kk = pen.k ?? 1;
      ctx.font = font('bold', c.m(num('xr-text-min') * kk));
      ctx.fillStyle = color('xr-panel-text');
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(plotName(p), pen.x, pen.y + c.m(0.013 * kk));
      ctx.textAlign = 'right';
      ctx.fillStyle = color(T.token);
      ctx.fillText(val, pen.x + pen.w, pen.y + c.m(0.013 * kk));
      pen.y += c.m(0.03 * kk);
      if (T.kind === 'energy') bar(pen, { lo: f.lo / top, hi: f.hi / top, mark: f.value / top, token: T.token, h: 0.01, gap: 0.01 });
      else { const nt = Math.max(f.needHi, f.cap) * 1.12; bar(pen, { lo: f.needLo / nt, hi: f.needHi / nt, mark: f.cap / nt, token: T.token, h: 0.01, gap: 0.01 }); }
    }
    if (!list.length) pen.para(t('greenTaken'), { col: color('xr-warning') });
    else if (!pen.right) pen.para(v.touch ? t('greenAIHintTouch') : t('greenAIHintPlot'), { maxLines: 2 });
  }
  if (v.map && !pen.right) {
    pen.y = Math.max(pen.y, pen.c.canvas.height - pen.c.m(0.03 + 0.055));
    legend(pen, v.map);
  }
}

/** No project chosen: the AI's best place for every project type this year. */
function overview(pen, game) {
  const { ctx, c } = pen;
  const kk = pen.k ?? 1;
  pen.line(t('greenAITips'), { size: num('xr-text-min'), weight: 'bold', col: color('xr-panel-muted'), gap: 0.006 });
  for (const type of Object.keys(TYPES)) {
    const T = TYPES[type];
    const best = game.plots.filter((p) => !p.built && p.area === T.area).map((p) => ({ p, f: game.forecast(type, p.id) })).sort((a, b) => b.f.value - a.f.value)[0];
    const rowH = c.m(0.042 * kk);
    if (pen.y + rowH > c.canvas.height - c.m(0.02)) break;
    drawIcon(ctx, T.icon, pen.x + c.m(0.016 * kk), pen.y + rowH / 2, c.m(0.03 * kk), color(T.token));
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = font('bold', c.m(num('xr-text-min') * kk * 0.92));
    ctx.fillStyle = color('xr-panel-text');
    const name = best ? plotName(best.p) : '–';
    ctx.fillText(name, pen.x + c.m(0.04 * kk), pen.y + rowH / 2, pen.w * 0.6);
    if (best) {
      ctx.textAlign = 'right';
      ctx.fillStyle = color(T.token);
      ctx.fillText(T.kind === 'energy' ? `${fmt(best.f.value)} ±${fmt((best.f.hi - best.f.lo) / 2)}` : `+${fmtInt(best.f.value)}`, pen.x + pen.w, pen.y + rowH / 2);
    }
    pen.y += rowH;
  }
}

function builtInfo(pen, v) {
  const { game, plot } = v;
  pen.line(t('greenBuiltIn', { type: typeName(plot.built), year: FIRST_YEAR + plot.year }), { weight: 'bold', col: color(TYPES[plot.built].token), gap: 0.004 });
  pen.line(plotName(plot), { size: num('xr-text-min'), col: color('xr-panel-muted'), gap: 0.006 });
  const last = [...game.history].reverse().find((h) => h.projects.some((x) => x.id === plot.id));
  const pr = last?.projects.find((x) => x.id === plot.id);
  if (pr) {
    pen.line(t('greenLastYear', { v: `${fmt(pr.actual)} GWh`, f: fmt(pr.forecast) }), { size: num('xr-text-min'), gap: 0.004 });
    const d = pr.actual / pr.forecast - 1;
    pen.line(pct(d), { size: num('xr-text-md'), weight: 'black', col: color(d >= 0 ? 'xr-green-up' : 'xr-green-down') });
  } else if (TYPES[plot.built].kind === 'energy') {
    const f = game.forecast(plot.built, plot.id);
    pen.para(`${fmt(f.value)} GWh · ${t('greenRange', { lo: fmt(f.lo), hi: fmt(f.hi) })}`, { col: color('xr-panel-text'), maxLines: 2 });
  }
}

function drawSim(pen, v) {
  const { report, month, news } = v;
  const names = t('greenMonthNames').split(',');
  pen.line(names[Math.min(11, Math.floor(month))], { size: num('xr-text-sm'), weight: 'bold', col: color('xr-panel-muted'), gap: 0.004 });
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
    const { ctx, c } = pen;
    ctx.font = font('bold', c.m(num('xr-text-sm')));
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = color(token);
    ctx.fillText(label, pen.x, pen.y + c.m(0.016));
    ctx.textAlign = 'right';
    ctx.fillStyle = color('xr-panel-text');
    ctx.fillText(`${fmt(a)} GWh`, pen.x + pen.w, pen.y + c.m(0.016));
    pen.y += c.m(0.04);
    if (fc > 0.01) {
      ctx.font = font('regular', c.m(num('xr-text-min')) * 0.85);
      ctx.fillStyle = color('xr-panel-muted');
      ctx.textAlign = 'right';
      ctx.fillText(`${t('greenAITitle')}: ${fmt(fc)} GWh · ${pct(a / fc - 1)}`, pen.x + pen.w, pen.y + c.m(0.008));
      pen.y += c.m(0.034);
    }
  };
  if (report.windFc > 0) row(t('greenRepWind'), w, wf, 'xr-green-wind');
  if (report.sunFc > 0) row(t('greenRepSun'), s, sf, 'xr-green-sun');
  if (!report.windFc && !report.sunFc) pen.para(t('greenRepNone'), { maxLines: 3 });
  pen.space(0.006);
  const fcMonths = report.windFc || report.sunFc ? MONTH_WIND.map((m, i) => report.windFc * m + report.sunFc * MONTH_SUN[i]) : null;
  if (pen.right) {
    const ty = pen.y;
    column(pen);
    pen.y = Math.max(pen.y, pen.c.m(0.03));
    if (news) pen.para(news, { size: num('xr-text-min'), weight: 'bold', col: color('xr-warning'), maxLines: 3 });
    monthChart(pen, report.months, k, { h: Math.max(0.06, (pen.c.canvas.height - pen.y) / pen.c.px - 0.055), forecast: fcMonths });
    pen.y = Math.max(pen.y, ty);
    return;
  }
  monthChart(pen, report.months, k, { h: 0.085, forecast: fcMonths });
  if (news) pen.para(news, { size: num('xr-text-min'), weight: 'bold', col: color('xr-warning'), maxLines: 3 });
}

function drawReport(pen, v) {
  const { report: r } = v;
  if (!pen.right) pen.rule(0.008);
  const rows = [];
  if (r.windFc > 0) rows.push([t('greenRepWind'), r.windSum, r.windFc, 'xr-green-wind']);
  if (r.sunFc > 0) rows.push([t('greenRepSun'), r.sunSum, r.sunFc, 'xr-green-sun']);
  if (rows.length) rows.push([t('greenRepTotal'), r.energy, r.forecastEnergy, 'xr-green-energy']);
  const top = Math.max(1, ...rows.map((x) => Math.max(x[1], x[2]))) * 1.1;
  const { ctx, c } = pen;
  for (const [label, a, f, token] of rows) {
    const d = a / f - 1;
    ctx.font = font('bold', c.m(num('xr-text-min')));
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = color(token);
    ctx.fillText(label, pen.x, pen.y + c.m(0.012));
    ctx.textAlign = 'right';
    ctx.fillStyle = color(d >= 0 ? 'xr-green-up' : 'xr-green-down');
    ctx.fillText(`${fmt(a)} GWh  ${pct(d)}`, pen.x + pen.w, pen.y + c.m(0.012));
    pen.y += c.m(0.027);
    bar(pen, { k: a / top, mark: f / top, token, h: 0.012, gap: 0.01 });
  }
  if (!rows.length) pen.para(t('greenRepNone'), { maxLines: 2 });
  column(pen);
  pen.para(t(`greenWx_${r.weather}`), { size: num('xr-text-min'), col: color('xr-panel-text'), maxLines: 3 });
  // The mix: the whole portfolio was closer to the forecast than its parts.
  if (r.windFc > 0 && r.sunFc > 0) {
    const dw = Math.abs(r.windSum / r.windFc - 1);
    const ds = Math.abs(r.sunSum / r.sunFc - 1);
    const dt = Math.abs(r.energy / r.forecastEnergy - 1);
    if (dt < Math.max(dw, ds) - 0.01) pen.para(t('greenRepMix', { p: `${fmtInt(dt * 100)} %` }), { col: color('xr-green-energy'), weight: 'bold', maxLines: 2 });
  }
  const dq = r.qol - r.qolBefore;
  pen.line(t('greenRepQol', { d: `${dq >= 0 ? '+' : '−'}${fmtInt(Math.abs(dq))}`, qol: fmtInt(r.qol) }), { size: num('xr-text-min'), weight: 'bold', col: color('xr-green-qol'), gap: 0.002 });
  if (r.revenue > 0.05) pen.line(t('greenRepReturns', { n: money(r.revenue) }), { size: num('xr-text-min'), col: color('xr-panel-muted'), gap: 0.002 });
  if (r.waiting.length) pen.para(t('greenRepWaiting', { list: r.waiting.map((k) => t(`greenDistrict_${k}`)).join(', ') }), { col: color('xr-warning'), maxLines: 2 });
}

// ---------- the region dashboard ----------

/** Region status: budget, green power, CO2, quality of life, the portfolio mix. */
export function dashPanel(w, h, view) {
  return new Panel(w, h, (ctx, c) => {
    c.surface();
    const v = view();
    const { game } = v;
    const pen = new Pen(ctx, c, 0.03);
    const year = v.year ?? Math.min(game.year, YEARS - 1);
    pen.line(t('greenDash', { year: FIRST_YEAR + year }), { size: num('xr-text-md'), weight: 'black', gap: 0.002 });
    // Five dots for the five years.
    for (let i = 0; i < YEARS; i++) {
      ctx.beginPath();
      ctx.arc(pen.x + c.m(0.008) + i * c.m(0.026), pen.y + c.m(0.008), c.m(0.0075), 0, Math.PI * 2);
      ctx.fillStyle = color(i < year ? 'xr-green-energy' : i === year ? 'xr-accent' : 'xr-button-bg');
      ctx.fill();
    }
    pen.y += c.m(0.028);
    const kv = (label, value, token = 'xr-panel-text') => {
      ctx.font = font('bold', c.m(num('xr-text-min')));
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillStyle = color('xr-panel-muted');
      ctx.fillText(label, pen.x, pen.y + c.m(0.02));
      ctx.textAlign = 'right';
      ctx.fillStyle = color(token);
      ctx.font = font('black', c.m(num('xr-text-sm')));
      ctx.fillText(value, pen.x + pen.w, pen.y + c.m(0.02));
      pen.y += c.m(0.046);
    };
    kv(t('greenBudget'), money(game.budget), 'xr-warning');
    const last = v.report ?? game.history[game.history.length - 1];
    const power = v.power ?? last?.energy ?? 0;
    kv(t('greenPower'), `${fmt(power)} GWh`, 'xr-green-energy');
    pen.line(t('greenHouseholds', { n: fmtInt((power * 1000) / HOUSEHOLD_MWH) }), { size: num('xr-text-min') * 0.9, col: color('xr-panel-muted'), align: 'right', gap: 0.0 });
    kv(t('greenCO2'), t('greenTons', { n: fmtInt(v.co2 ?? game.co2Total) }), 'xr-green-co2');
    kv(t('greenQol'), `${fmtInt(v.qol ?? game.qol)} %`, 'xr-green-qol');
    bar(pen, { k: (v.qol ?? game.qol) / 100, token: 'xr-green-qol', h: 0.014, gap: 0.014 });
    // Portfolio: money in energy and social projects, and how many of each type.
    pen.line(t('greenMix'), { size: num('xr-text-min'), weight: 'bold', col: color('xr-panel-muted'), gap: 0.004 });
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
    pen.y += H + c.m(0.008);
    ctx.font = font('bold', c.m(0.021));
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = color('xr-green-energy');
    ctx.fillText(t('greenEnergy'), pen.x, pen.y + c.m(0.008));
    ctx.textAlign = 'right';
    ctx.fillStyle = color('xr-green-social');
    ctx.fillText(t('greenSocial'), pen.x + pen.w, pen.y + c.m(0.008));
    pen.y += c.m(0.024);
    // Counts per type with their icons.
    const keys = Object.keys(TYPES);
    const cw = pen.w / keys.length;
    keys.forEach((k, i) => {
      const n = game.plots.filter((p) => p.built === k).length;
      const cx = pen.x + cw * i + cw / 2;
      drawIcon(ctx, TYPES[k].icon, cx - c.m(0.012), pen.y + c.m(0.016), c.m(0.026), color(n ? TYPES[k].token : 'xr-panel-muted'));
      ctx.font = font('black', c.m(0.024));
      ctx.textAlign = 'left';
      ctx.fillStyle = color(n ? 'xr-panel-text' : 'xr-panel-muted');
      ctx.fillText(String(n), cx + c.m(0.004), pen.y + c.m(0.017));
    });
    pen.y += c.m(0.04);
    if (last && pen.y + c.m(0.11) < c.canvas.height) {
      pen.line(t('greenMonthly'), { size: num('xr-text-min') * 0.9, weight: 'bold', col: color('xr-panel-muted'), gap: 0.004 });
      monthChart(pen, last.months, v.upto ?? 12, { h: Math.min(0.07, (c.canvas.height - pen.y) / c.px - 0.05) });
    }
  });
}

/** A short message in a framed panel. */
export function toast(text, sub, token, w = 0.62) {
  const blocks = [{ text, size: 'xr-text-md', weight: 'black', color: color(token), gap: sub ? 0.008 : 0 }];
  if (sub) blocks.push({ text: sub, size: 'xr-text-sm', color: color('xr-panel-text') });
  const p = textPanel(w, 0.08, blocks, { surface: { stroke: color(token) } });
  p.userData.noFit = true;
  return p;
}

