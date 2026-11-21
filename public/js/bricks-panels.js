// "Stein auf Stein": 2D drawings on panels. The decision cards (a small picture, the price, plain
// tags, the AI adviser's forecast; locked when the money does not allow them), the brief with the
// budget bar, the adviser's note, the neighbors' sign, and the coherence check with a bar for
// you and one for the neighbors per criterion.
import { Panel, wrap, roundRect } from './ui3d.js';
import { color, num, font } from './tokens.js';
import { t, getLang } from './i18n.js';
import { OPTION, wishCost } from './bricks-data.js';

// ---------- words ----------

/** Thousand euros as money: "24.000 €" or "€24,000". */
export function euro(k) {
  const n = Math.round(k * 1000);
  return getLang() === 'en' ? `€${n.toLocaleString('en-US')}` : `${n.toLocaleString('de-DE')} €`;
}
export const optName = (id) => t(`bricksOpt_${id}`);
export const styleName = (s) => t(`bricksStyle_${s ?? 'none'}`);

/** The plain tags of an option: [{ text, kind: 'style' | 'good' | 'bad' | 'wish' }]. */
export function tagsOf(o) {
  const out = [];
  if (o.gives) out.push({ text: t(`bricksNeed_${o.gives}`), kind: 'wish' });
  if (o.e) out.push({ text: t(`bricksTagE${o.e}`), kind: o.e > 0 ? 'good' : 'bad' });
  for (const [k, v] of Object.entries(o.w ?? {})) out.push({ text: t(v > 0 ? 'bricksWGood' : 'bricksWBad', { w: t(`bricksWeather_${k}`) }), kind: v > 0 ? 'good' : 'bad' });
  if (o.u) out.push({ text: t(`bricksTagU${o.u}`), kind: o.u > 0 ? 'good' : 'bad' });
  const style = { text: o.style ? t('bricksStyleTag', { style: styleName(o.style) }) : styleName(null), kind: 'style', style: o.style };
  if (o.decision !== 'extras') out.unshift(style);
  else if (o.style || !out.length) out.push(style);
  return out;
}

/** The text of a reason from the check (bricks-data.js judge()). */
export function whyText(why) {
  const v = { ...why };
  if (v.a) v.a = optName(v.a);
  if (v.b) v.b = optName(v.b);
  if (v.style) v.style = styleName(v.style);
  if (v.need) v.need = t(`bricksNeed_${v.need}`);
  if (v.weather) v.w = t(`bricksWeather_${v.weather}`);
  if (v.left !== undefined) v.left = euro(v.left);
  return t(`bricksWhy_${why.key}`, v);
}

function fitText(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxW) s = s.slice(0, -1);
  return `${s.trimEnd()}…`;
}

// ---------- small pictures of the options ----------

const PIC = {
  brick(c, r) {
    r(0, 0, 1, 1, 'xr-bricks-clay');
    c.strokeStyle = color('xr-bricks-quoin'); c.lineWidth = 0.035;
    for (let i = 1; i < 4; i++) line(c, 0, i / 4, 1, i / 4);
    for (let i = 0; i < 4; i++) for (let x = (i % 2) * 0.25 + 0.25; x < 1; x += 0.5) line(c, x, i / 4, x, (i + 1) / 4);
  },
  timber(c, r) {
    r(0, 0, 1, 1, 'xr-bricks-plaster');
    c.strokeStyle = color('xr-bricks-beam'); c.lineWidth = 0.09;
    c.strokeRect(0.045, 0.045, 0.91, 0.91); line(c, 0.5, 0, 0.5, 1); line(c, 0, 0.5, 1, 0.5); line(c, 0.05, 0.95, 0.5, 0.5); line(c, 0.95, 0.95, 0.5, 0.5);
  },
  concrete(c, r) {
    r(0, 0, 1, 1, 'xr-bricks-concrete-wall');
    c.strokeStyle = color('xr-bricks-dark'); c.lineWidth = 0.025; line(c, 0, 0.5, 1, 0.5); line(c, 0.5, 0, 0.5, 1);
    c.fillStyle = color('xr-bricks-dark');
    for (const x of [0.15, 0.35, 0.65, 0.85]) for (const y of [0.15, 0.35, 0.65, 0.85]) { c.beginPath(); c.arc(x, y, 0.025, 0, 7); c.fill(); }
  },
  wood(c, r) {
    r(0, 0, 1, 1, 'xr-bricks-plank');
    c.strokeStyle = color('xr-bricks-beam'); c.lineWidth = 0.03;
    for (let i = 1; i < 6; i++) line(c, 0, i / 6, 1, i / 6);
  },
  tiles(c, r) { sky(r); poly(c, [[0.05, 0.75], [0.5, 0.2], [0.95, 0.75]], 'xr-bricks-roof'); r(0.14, 0.75, 0.72, 0.2, 'xr-bricks-gable'); r(0.66, 0.24, 0.12, 0.26, 'xr-bricks-clay'); },
  thatch(c, r) {
    sky(r); r(0.16, 0.74, 0.68, 0.21, 'xr-bricks-plaster');
    c.fillStyle = color('xr-bricks-thatch'); c.beginPath(); c.moveTo(0.02, 0.8); c.quadraticCurveTo(0.2, 0.2, 0.5, 0.14); c.quadraticCurveTo(0.8, 0.2, 0.98, 0.8); c.lineTo(0.84, 0.74); c.lineTo(0.16, 0.74); c.closePath(); c.fill();
    c.strokeStyle = color('xr-bricks-thatch-dark'); c.lineWidth = 0.05; line(c, 0.32, 0.2, 0.68, 0.2);
  },
  green(c, r) {
    sky(r); r(0.12, 0.6, 0.76, 0.35, 'xr-bricks-plaster'); r(0.06, 0.5, 0.88, 0.1, 'xr-bricks-dark'); r(0.08, 0.42, 0.84, 0.08, 'xr-bricks-sedum');
    c.fillStyle = color('xr-bricks-leaf'); for (const x of [0.2, 0.4, 0.62, 0.8]) { c.beginPath(); c.arc(x, 0.42, 0.06, Math.PI, 0); c.fill(); }
  },
  metal(c, r) {
    sky(r); poly(c, [[0.12, 0.95], [0.12, 0.35], [0.88, 0.6], [0.88, 0.95]], 'xr-bricks-plaster'); poly(c, [[0.04, 0.24], [0.96, 0.54], [0.96, 0.64], [0.04, 0.34]], 'xr-bricks-metal-roof');
  },
  plain(c, r) { win(c, r, 'xr-bricks-frame'); },
  lattice(c, r) {
    r(0.3, 0.12, 0.4, 0.76, 'xr-bricks-frame'); r(0.35, 0.17, 0.3, 0.66, 'xr-bricks-glass');
    c.strokeStyle = color('xr-bricks-frame'); c.lineWidth = 0.035; line(c, 0.5, 0.17, 0.5, 0.83); line(c, 0.35, 0.4, 0.65, 0.4); line(c, 0.35, 0.62, 0.65, 0.62);
    r(0.06, 0.12, 0.2, 0.76, 'xr-bricks-shutter'); r(0.74, 0.12, 0.2, 0.76, 'xr-bricks-shutter');
  },
  woodwin(c, r) { win(c, r, 'xr-bricks-plank'); c.strokeStyle = color('xr-bricks-crane-glass'); c.lineWidth = 0.025; c.strokeRect(0.3, 0.2, 0.4, 0.6); c.strokeRect(0.34, 0.24, 0.32, 0.52); },
  panorama(c, r) { r(0.04, 0.08, 0.92, 0.84, 'xr-bricks-slim'); r(0.08, 0.12, 0.4, 0.8, 'xr-bricks-glass'); r(0.52, 0.12, 0.4, 0.8, 'xr-bricks-glass'); c.strokeStyle = color('xr-bricks-crane-glass'); c.lineWidth = 0.03; line(c, 0.14, 0.5, 0.3, 0.2); line(c, 0.58, 0.5, 0.74, 0.2); },
  painted(c, r) { door(c, r, 'xr-bricks-door'); },
  canopy(c, r) { door(c, r, 'xr-bricks-plank'); poly(c, [[0.08, 0.3], [0.5, 0.04], [0.92, 0.3], [0.92, 0.2], [0.5, -0.04], [0.08, 0.2]].map(([x, y]) => [x, y + 0.08]), 'xr-bricks-roof'); },
  glassdoor(c, r) { r(0.26, 0.1, 0.48, 0.82, 'xr-bricks-slim'); r(0.31, 0.15, 0.38, 0.77, 'xr-bricks-glass'); r(0.6, 0.45, 0.03, 0.2, 'xr-bricks-metal'); r(0.1, 0.92, 0.8, 0.05, 'xr-bricks-concrete-wall'); },
  ramp(c, r) { r(0.2, 0.08, 0.5, 0.7, 'xr-bricks-frame'); r(0.25, 0.13, 0.4, 0.65, 'xr-bricks-door'); poly(c, [[0.2, 0.78], [0.7, 0.78], [0.98, 0.96], [0.2, 0.96]], 'xr-bricks-plank'); c.strokeStyle = color('xr-bricks-metal'); c.lineWidth = 0.035; line(c, 0.72, 0.56, 0.98, 0.74); line(c, 0.72, 0.56, 0.72, 0.78); line(c, 0.98, 0.74, 0.98, 0.95); },
  gas(c, r) { r(0.2, 0.08, 0.6, 0.84, 'xr-bricks-gas'); flame(c, 0.5, 0.5, 0.26, 'xr-bricks-crane-glass'); },
  pellets(c, r) { r(0.22, 0.12, 0.56, 0.8, 'xr-bricks-dark'); r(0.3, 0.4, 0.4, 0.36, 'xr-bricks-interior'); flame(c, 0.5, 0.6, 0.15, 'xr-bricks-gold-glow'); r(0.42, 0, 0.16, 0.14, 'xr-bricks-dark'); },
  heatpump(c, r) {
    r(0.08, 0.2, 0.84, 0.64, 'xr-bricks-unit'); r(0.14, 0.84, 0.12, 0.08, 'xr-bricks-dark'); r(0.74, 0.84, 0.12, 0.08, 'xr-bricks-dark');
    c.fillStyle = color('xr-bricks-dark'); c.beginPath(); c.arc(0.4, 0.52, 0.24, 0, 7); c.fill();
    c.strokeStyle = color('xr-bricks-unit'); c.lineWidth = 0.05; for (let i = 0; i < 3; i++) { const a = (i * Math.PI * 2) / 3; line(c, 0.4, 0.52, 0.4 + Math.cos(a) * 0.2, 0.52 + Math.sin(a) * 0.2); }
  },
  gravel(c, r) {
    r(0, 0.55, 1, 0.45, 'xr-bricks-pebble'); c.fillStyle = color('xr-bricks-stone');
    for (const [x, y, s] of [[0.2, 0.74, 0.1], [0.55, 0.82, 0.07], [0.8, 0.7, 0.12]]) { c.beginPath(); c.ellipse(x, y, s, s * 0.7, 0, 0, 7); c.fill(); }
    c.strokeStyle = color('xr-bricks-slim'); c.lineWidth = 0.035; line(c, 0, 0.3, 1, 0.3); for (let x = 0.08; x < 1; x += 0.14) line(c, x, 0.2, x, 0.58);
  },
  hedge(c, r) {
    r(0, 0.7, 1, 0.3, 'xr-bricks-grass'); c.fillStyle = color('xr-bricks-hedge'); roundRect(c, 0.04, 0.22, 0.92, 0.5, 0.14); c.fill();
    for (const [x, y, tok] of [[0.2, 0.86, 'xr-bricks-flower-1'], [0.45, 0.9, 'xr-bricks-flower-2'], [0.7, 0.84, 'xr-bricks-flower-1'], [0.88, 0.92, 'xr-bricks-flower-2']]) { c.fillStyle = color(tok); c.beginPath(); c.arc(x, y, 0.045, 0, 7); c.fill(); }
  },
  playlawn(c, r) {
    r(0, 0.72, 1, 0.28, 'xr-bricks-grass'); c.strokeStyle = color('xr-bricks-beam'); c.lineWidth = 0.05;
    line(c, 0.1, 0.78, 0.25, 0.14); line(c, 0.9, 0.78, 0.75, 0.14); line(c, 0.2, 0.16, 0.8, 0.16);
    c.strokeStyle = color('xr-bricks-dark'); c.lineWidth = 0.02; line(c, 0.42, 0.16, 0.42, 0.56); line(c, 0.58, 0.16, 0.58, 0.56); r(0.38, 0.54, 0.24, 0.06, 'xr-bricks-flower-2');
  },
  picket(c, r) {
    r(0, 0.74, 1, 0.26, 'xr-bricks-grass');
    for (let x = 0.06; x < 0.95; x += 0.18) poly(c, [[x, 0.86], [x, 0.3], [x + 0.06, 0.2], [x + 0.12, 0.3], [x + 0.12, 0.86]], 'xr-bricks-fence');
    r(0.02, 0.42, 0.96, 0.06, 'xr-bricks-fence'); r(0.02, 0.66, 0.96, 0.06, 'xr-bricks-fence');
  },
  tank(c, r) { c.fillStyle = color('xr-bricks-shutter'); roundRect(c, 0.24, 0.2, 0.52, 0.72, 0.08); c.fill(); r(0.2, 0.14, 0.6, 0.09, 'xr-bricks-dark'); drop(c, 0.5, 0.58, 0.14); },
  pond(c, r) {
    r(0, 0, 1, 1, 'xr-bricks-grass'); c.fillStyle = color('xr-bricks-crane-glass'); c.beginPath(); c.ellipse(0.5, 0.58, 0.4, 0.26, 0, 0, 7); c.fill();
    c.strokeStyle = color('xr-bricks-sedum'); c.lineWidth = 0.04; line(c, 0.2, 0.5, 0.16, 0.12); line(c, 0.28, 0.5, 0.3, 0.2); c.fillStyle = color('xr-bricks-leaf'); c.beginPath(); c.ellipse(0.62, 0.62, 0.1, 0.06, 0, 0, 7); c.fill();
  },
  smart(c, r) {
    c.fillStyle = color('xr-bricks-dark'); roundRect(c, 0.26, 0.4, 0.48, 0.54, 0.06); c.fill(); r(0.32, 0.46, 0.36, 0.3, 'xr-bricks-lamp');
    c.strokeStyle = color('xr-bricks-crane-glass'); c.lineWidth = 0.05; for (const rr of [0.14, 0.26, 0.38]) { c.beginPath(); c.arc(0.5, 0.42, rr, Math.PI * 1.2, Math.PI * 1.8); c.stroke(); }
  },
  carport(c, r) {
    r(0.04, 0.2, 0.92, 0.08, 'xr-bricks-dark'); r(0.08, 0.28, 0.04, 0.66, 'xr-bricks-slim'); r(0.88, 0.28, 0.04, 0.66, 'xr-bricks-slim');
    c.fillStyle = color('xr-bricks-car'); roundRect(c, 0.2, 0.62, 0.6, 0.2, 0.05); c.fill(); roundRect(c, 0.3, 0.46, 0.4, 0.2, 0.06); c.fill();
    c.fillStyle = color('xr-bricks-dark'); for (const x of [0.33, 0.67]) { c.beginPath(); c.arc(x, 0.84, 0.08, 0, 7); c.fill(); }
  },
  solar(c, r) {
    poly(c, [[0.1, 0.9], [0.3, 0.14], [0.98, 0.14], [0.78, 0.9]], 'xr-bricks-solar'); c.strokeStyle = color('xr-bricks-metal'); c.lineWidth = 0.03;
    line(c, 0.2, 0.52, 0.88, 0.52); line(c, 0.33, 0.9, 0.53, 0.14); line(c, 0.56, 0.9, 0.76, 0.14); c.fillStyle = color('xr-bricks-gold-glow'); c.beginPath(); c.arc(0.12, 0.16, 0.1, 0, 7); c.fill();
  },
  cellar(c, r) {
    r(0, 0, 1, 0.34, 'xr-bricks-plaster'); r(0, 0.34, 1, 0.06, 'xr-bricks-grass'); r(0, 0.4, 1, 0.6, 'xr-bricks-soil-dark'); r(0.12, 0.46, 0.76, 0.46, 'xr-bricks-concrete-wall');
    c.strokeStyle = color('xr-bricks-dark'); c.lineWidth = 0.035; for (let i = 0; i < 4; i++) { line(c, 0.2 + i * 0.14, 0.52 + i * 0.1, 0.34 + i * 0.14, 0.52 + i * 0.1); line(c, 0.34 + i * 0.14, 0.52 + i * 0.1, 0.34 + i * 0.14, 0.62 + i * 0.1); }
  },
  conservatory(c, r) {
    poly(c, [[0.1, 0.94], [0.1, 0.4], [0.5, 0.12], [0.9, 0.4], [0.9, 0.94]], 'xr-bricks-crane-glass'); c.strokeStyle = color('xr-bricks-frame'); c.lineWidth = 0.045;
    c.beginPath(); c.moveTo(0.1, 0.94); c.lineTo(0.1, 0.4); c.lineTo(0.5, 0.12); c.lineTo(0.9, 0.4); c.lineTo(0.9, 0.94); c.closePath(); c.stroke(); line(c, 0.1, 0.4, 0.9, 0.4); line(c, 0.37, 0.4, 0.37, 0.94); line(c, 0.63, 0.4, 0.63, 0.94);
  },
  annex(c, r) { r(0.4, 0.14, 0.56, 0.8, 'xr-bricks-plaster'); poly(c, [[0.36, 0.2], [0.68, 0], [1, 0.2]], 'xr-bricks-roof'); r(0.04, 0.46, 0.4, 0.48, 'xr-bricks-gable'); r(0, 0.4, 0.46, 0.07, 'xr-bricks-roof-dark'); r(0.14, 0.58, 0.18, 0.2, 'xr-bricks-glass'); c.strokeStyle = color('xr-warning'); c.lineWidth = 0.05; line(c, 0.24, 0.12, 0.24, 0.32); line(c, 0.14, 0.22, 0.34, 0.22); },
};
function line(c, x0, y0, x1, y1) { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }
function poly(c, pts, token) { c.fillStyle = color(token); c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fill(); }
function sky(r) { r(0, 0, 1, 1, 'xr-bricks-sky-mid'); }
function win(c, r, token) { r(0.2, 0.1, 0.6, 0.8, token); r(0.27, 0.17, 0.46, 0.66, 'xr-bricks-glass'); c.strokeStyle = color(token); c.lineWidth = 0.04; line(c, 0.5, 0.17, 0.5, 0.83); }
function door(c, r, token) { r(0.24, 0.12, 0.52, 0.84, 'xr-bricks-frame'); r(0.29, 0.17, 0.42, 0.79, token); r(0.38, 0.24, 0.24, 0.16, 'xr-bricks-glass'); c.fillStyle = color('xr-bricks-gold'); c.beginPath(); c.arc(0.64, 0.6, 0.03, 0, 7); c.fill(); }
function flame(c, x, y, s, token) { c.fillStyle = color(token); c.beginPath(); c.moveTo(x, y - s * 1.3); c.quadraticCurveTo(x + s * 1.2, y, x, y + s); c.quadraticCurveTo(x - s * 1.2, y, x, y - s * 1.3); c.fill(); }
function drop(c, x, y, s) { c.fillStyle = color('xr-bricks-crane-glass'); c.beginPath(); c.moveTo(x, y - s * 1.5); c.quadraticCurveTo(x + s * 1.3, y + s * 0.3, x, y + s); c.quadraticCurveTo(x - s * 1.3, y + s * 0.3, x, y - s * 1.5); c.fill(); }

/** Draws the picture of an option into a rounded square (canvas px). */
export function drawOption(ctx, id, x, y, size) {
  ctx.save();
  roundRect(ctx, x, y, size, size, size * 0.14);
  ctx.clip();
  ctx.translate(x, y);
  ctx.scale(size, size);
  ctx.fillStyle = color('xr-bricks-pic-bg');
  ctx.fillRect(0, 0, 1, 1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  PIC[id]?.(ctx, (rx, ry, rw, rh, token) => { ctx.fillStyle = color(token); ctx.fillRect(rx, ry, rw, rh); });
  ctx.restore();
}

// ---------- chips ----------

const CHIP = { style: 'xr-accent', good: 'xr-success', bad: 'xr-danger', wish: 'xr-warning', plain: 'xr-panel-muted' };

/** A little shape in front of a chip's text, so its kind does not hang on the color alone. */
function chipMark(ctx, kind, style, x, y, s) {
  ctx.fillStyle = ctx.strokeStyle = color(CHIP[kind]);
  ctx.lineWidth = s * 0.22;
  ctx.beginPath();
  if (kind === 'good') { ctx.moveTo(x, y); ctx.lineTo(x + s, y); ctx.moveTo(x + s / 2, y - s / 2); ctx.lineTo(x + s / 2, y + s / 2); ctx.stroke(); }
  else if (kind === 'bad') { ctx.moveTo(x, y); ctx.lineTo(x + s, y); ctx.stroke(); }
  else if (kind === 'wish') { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 ? s * 0.26 : s * 0.6; ctx.lineTo(x + s / 2 + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.fill(); }
  else if (style === 'trad') { ctx.moveTo(x, y + s * 0.4); ctx.lineTo(x + s / 2, y - s * 0.5); ctx.lineTo(x + s, y + s * 0.4); ctx.fill(); }
  else if (style === 'mod') ctx.fillRect(x + s * 0.1, y - s * 0.4, s * 0.8, s * 0.8);
  else if (style === 'nat') { ctx.ellipse(x + s / 2, y, s * 0.5, s * 0.3, -0.6, 0, 7); ctx.fill(); }
  else { ctx.arc(x + s / 2, y, s * 0.36, 0, 7); ctx.stroke(); }
}

/**
 * Lays chips out in rows inside (x, y, w); returns the height used (px). maxRows: rows that
 * fit; draw false only measures.
 */
function chips(ctx, list, x, y, w, px, maxRows = 9, draw = true) {
  ctx.save();
  const h = px * 1.55;
  const gap = px * 0.35;
  const mark = px * 0.6;
  ctx.font = font('bold', px);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  let cx = x;
  let row = 0;
  for (const chip of list) {
    const tw = Math.min(ctx.measureText(chip.text).width, w - mark - px * 1.3);
    const cw = tw + mark + px * 1.3;
    if (cx > x && cx + cw > x + w) { cx = x; row += 1; }
    if (row >= maxRows) break;
    if (draw) {
      const cy = y + row * (h + gap);
      roundRect(ctx, cx, cy, cw, h, h / 2);
      ctx.fillStyle = color('xr-bricks-chip-bg');
      ctx.fill();
      ctx.lineWidth = Math.max(1, px * 0.09);
      ctx.strokeStyle = color(CHIP[chip.kind] ?? CHIP.plain);
      ctx.stroke();
      chipMark(ctx, chip.kind, chip.style, cx + px * 0.45, cy + h / 2, mark);
      ctx.fillStyle = color('xr-panel-text');
      ctx.font = font('bold', px);
      ctx.fillText(fitText(ctx, chip.text, tw + 1), cx + px * 0.75 + mark, cy + h / 2 + px * 0.04);
    }
    cx += cw + gap;
  }
  ctx.restore();
  return (Math.min(row, maxRows - 1) + 1) * (h + gap) - gap;
}

// ---------- the decision card ----------

/**
 * A card for one option. state: { id, index (1..), locked, missing (thousand euros), selected,
 * forecast: { value | gain, conf, level, top | tip } | null, compact, basic, more, warn, good,
 * words (the confidence in words too), hover, focus }.
 */
export class OptionCard extends Panel {
  constructor(w, h, state, onClick) {
    super(w, h, (ctx, p) => p.paint());
    this.state = state;
    this.ready = true;
    this.userData.interactive = true;
    this.userData.setHover = (v) => this.set({ hover: v });
    this.userData.setFocus = (v) => this.set({ focus: v });
    this.userData.onClick = (pointer) => onClick(this, pointer);
    this.relabel();
    this.redraw();
  }

  relabel() {
    const s = this.state;
    const o = OPTION[s.id];
    this.userData.label = [optName(s.id), euro(o.price), s.locked ? t('bricksLocked', { n: euro(s.missing) }) : '', s.selected ? t('bricksTaken') : '', ...tagsOf(o).map((c) => c.text)].filter(Boolean).join('. ');
  }

  paint() {
    if (!this.ready) return;
    const { ctx } = this;
    const s = this.state;
    const o = OPTION[s.id];
    const W = this.canvas.width;
    const Hh = this.canvas.height;
    const sm = this.m(num('xr-text-sm'));
    const md = this.m(num('xr-text-md'));
    const pad = this.m(0.024);
    const active = (s.hover || s.focus) && !s.locked;
    const edge = s.focus ? 'xr-focus' : s.selected ? 'xr-success' : s.forecast?.top || s.forecast?.tip ? 'xr-bricks-ai' : 'xr-panel-border';
    this.surface({ fill: color(s.selected ? 'xr-bricks-card-on' : active ? 'xr-bricks-card-hover' : 'xr-bricks-card-bg'), stroke: color(edge), strokeWidth: num('xr-border-width') * (s.focus ? 3 : s.selected || active ? 2 : 1.2), stripe: false });
    // picture with the key number
    const pic = s.compact ? Math.min(Hh * 0.36, W * 0.2) : Math.min(Hh * 0.42, W * 0.24, this.m(0.17));
    drawOption(ctx, s.id, pad, pad, pic);
    const nb = sm * 1.25;
    ctx.fillStyle = color('xr-bricks-key-bg');
    roundRect(ctx, pad - nb * 0.2, pad - nb * 0.2, nb, nb, nb * 0.3);
    ctx.fill();
    ctx.fillStyle = color('xr-bricks-key-text');
    ctx.font = font('black', sm * 0.9);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(s.index), pad + nb * 0.3, pad + nb * 0.34);
    // title and price
    const x = pad + pic + pad * 0.8;
    const w = W - x - pad;
    let y = pad;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = color('xr-panel-text');
    const tick = s.selected !== undefined ? sm * 1.5 : 0;
    ctx.font = font('black', s.compact ? sm : md);
    ctx.fillText(fitText(ctx, optName(s.id), w - tick), x, y);
    y += (s.compact ? sm : md) * 1.2;
    ctx.font = font('black', s.compact ? md : this.m(num('xr-text-lg')));
    ctx.fillStyle = color(s.locked ? 'xr-panel-muted' : 'xr-bricks-price');
    const price = euro(o.price);
    ctx.fillText(price, x, y);
    const pw = ctx.measureText(price).width;
    const ph = (s.compact ? md : this.m(num('xr-text-lg'))) * 1.15;
    if (!s.compact && (s.basic || s.more)) {
      ctx.font = font('bold', sm * 0.95);
      ctx.fillStyle = color('xr-panel-muted');
      const note = s.basic ? t('bricksBasic') : t('bricksUpcharge', { n: euro(s.more) });
      if (pw + sm + ctx.measureText(note).width < w) ctx.fillText(note, x + pw + sm * 0.6, y + ph * 0.3);
    }
    y += ph;
    // the tick box of an extra
    if (s.selected !== undefined) {
      const b = sm * 1.2;
      const bx = W - pad - b;
      ctx.lineWidth = Math.max(1.5, sm * 0.12);
      ctx.strokeStyle = color(s.selected ? 'xr-success' : 'xr-panel-muted');
      roundRect(ctx, bx, pad, b, b, b * 0.2);
      if (s.selected) { ctx.fillStyle = color('xr-success'); ctx.fill(); }
      ctx.stroke();
      if (s.selected) { ctx.strokeStyle = color('xr-on-primary'); ctx.lineWidth = b * 0.16; ctx.beginPath(); ctx.moveTo(bx + b * 0.2, pad + b * 0.52); ctx.lineTo(bx + b * 0.42, pad + b * 0.74); ctx.lineTo(bx + b * 0.8, pad + b * 0.26); ctx.stroke(); }
    }
    // the lower part: what the adviser says (bottom line), help in the relaxed mode, tags, the one-liner
    const full = W - 2 * pad;
    const left = pad;
    let bottom = Hh - pad;
    const f = s.forecast;
    if (f) {
      const lineH = sm * 1.3;
      bottom -= lineH;
      ctx.textBaseline = 'middle';
      const cy = bottom + lineH / 2;
      let ax = left;
      if (f.top || f.tip) {
        ctx.font = font('black', sm * 0.9);
        const label = t('bricksAiTip');
        const bw = ctx.measureText(label).width + sm * 0.8;
        roundRect(ctx, ax, cy - lineH * 0.46, bw, lineH * 0.92, lineH * 0.3);
        ctx.fillStyle = color('xr-bricks-ai');
        ctx.fill();
        ctx.fillStyle = color('xr-bricks-ai-text');
        ctx.fillText(label, ax + sm * 0.4, cy + sm * 0.04);
        ax += bw + sm * 0.4;
      }
      ctx.font = font('bold', sm * 0.95);
      ctx.fillStyle = color('xr-bricks-ai');
      const conf = Math.round(f.conf * 100);
      const main = f.value !== undefined ? (f.top || f.tip ? `${f.value} %` : t('bricksAi', { n: f.value })) : (f.tip ? `${f.gain > 0 ? '+' : ''}${f.gain}` : t('bricksAiGain', { n: `${f.gain > 0 ? '+' : ''}${f.gain}` }));
      const sure = s.words ? `${t('bricksConf', { n: conf })} (${t(`bricksConf_${f.level}`)})` : t('bricksConf', { n: conf });
      const both = `${main} · ${sure}`;
      const room = left + full - ax;
      ctx.fillText(ctx.measureText(both).width <= room ? both : fitText(ctx, `${main} · ${t(`bricksConf_${f.level}`)}`, room), ax, cy + sm * 0.04);
    }
    ctx.textBaseline = 'top';
    const note = s.warn ?? s.good;
    if (note && bottom - y > sm * 2.6) {
      bottom -= sm * 1.25;
      ctx.font = font('bold', sm * 0.95);
      ctx.fillStyle = color(s.warn ? 'xr-danger' : 'xr-success');
      ctx.fillText(fitText(ctx, `${s.warn ? '! ' : '+ '}${note}`, full), left, bottom);
    }
    const tags = tagsOf(o);
    const chipPx = sm * 0.9;
    const rowH = chipPx * 1.9;
    const need = chips(ctx, tags, left, 0, full, chipPx, 9, false);
    const top = Math.max(y, pad + pic) + sm * 0.3;
    const showDesc = !s.compact && bottom - top - need > sm * 1.5;
    let cy = top;
    if (showDesc) {
      ctx.font = font('regular', sm * 0.95);
      ctx.fillStyle = color('xr-panel-muted');
      ctx.fillText(fitText(ctx, t(`bricksOptD_${s.id}`), full), left, cy);
      cy += sm * 1.45;
    }
    chips(ctx, tags, left, cy, full, chipPx, Math.max(1, Math.floor((bottom - cy + chipPx * 0.35) / rowH)));
    // locked: dimmed, with a padlock and the amount missing
    if (s.locked) {
      ctx.fillStyle = color('xr-bricks-lock-veil');
      roundRect(ctx, 0, 0, W, Hh, this.m(num('xr-radius')));
      ctx.fill();
      const text = t('bricksLocked', { n: euro(s.missing) });
      ctx.font = font('black', s.compact ? sm : md);
      const tw = ctx.measureText(text).width;
      const lk = (s.compact ? sm : md) * 1.1;
      const bw = tw + lk * 2.4;
      const bh = lk * 1.8;
      const bx = (W - bw) / 2;
      const by = Hh - bh - pad * 0.6;
      roundRect(ctx, bx, by, bw, bh, bh / 2);
      ctx.fillStyle = color('xr-bricks-lock-bg');
      ctx.fill();
      ctx.fillStyle = ctx.strokeStyle = color('xr-bricks-lock-text');
      ctx.lineWidth = lk * 0.16;
      ctx.fillRect(bx + lk * 0.55, by + bh * 0.48, lk * 0.8, lk * 0.6);
      ctx.beginPath();
      ctx.arc(bx + lk * 0.95, by + bh * 0.48, lk * 0.27, Math.PI, 0);
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, bx + lk * 1.75, by + bh / 2 + lk * 0.05);
    }
  }
}

// ---------- the budget bar ----------

/** spent | reserve for the open parts (hatched) | free; values in thousand euros. */
function budgetBar(ctx, x, y, w, h, { budget, spent, reserve }, token = 'xr-bricks-you') {
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.save();
  ctx.clip();
  ctx.fillStyle = color('xr-bricks-bar-bg');
  ctx.fillRect(x, y, w, h);
  const a = (w * spent) / budget;
  const b = (w * reserve) / budget;
  ctx.fillStyle = color(token);
  ctx.fillRect(x, y, a, h);
  if (b > 0) {
    ctx.fillStyle = color('xr-bricks-bar-reserve');
    ctx.fillRect(x + a, y, b, h);
    ctx.strokeStyle = color('xr-bricks-bar-hatch');
    ctx.lineWidth = Math.max(1, h * 0.12);
    for (let k = x + a - h; k < x + a + b; k += h * 0.55) { ctx.beginPath(); ctx.moveTo(k, y + h); ctx.lineTo(k + h, y); ctx.stroke(); }
    ctx.fillStyle = color('xr-bricks-bar-bg');
    ctx.fillRect(x + a + b, y, w - a - b, h);
  }
  ctx.fillStyle = color('xr-bricks-bar-free');
  ctx.fillRect(x + a + b, y, w - a - b, h);
  ctx.restore();
}

// ---------- the brief ----------

/**
 * The brief with the budget. get(): { round, spent, reserve }. compact: a short strip for
 * phones ('slim': shorter still, the wishes as one line). Returns a Panel.
 */
export function briefPanel(w, h, get, compact = false) {
  return new Panel(w, h, (ctx, p) => {
    const { round, spent, reserve } = get();
    const b = round.brief;
    const sm = p.m(num('xr-text-sm'));
    const md = p.m(num('xr-text-md'));
    const pad = p.m(compact ? 0.02 : 0.03);
    const W = p.canvas.width;
    p.surface({ fill: color('xr-bricks-card-bg'), stripe: false });
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let y = pad;
    const costs = b.needs.map((n) => wishCost(round, n));
    const wishes = b.needs.map((n, i) => ({ text: costs[i] ? `${t(`bricksNeed_${n}`)} ${t('bricksFrom', { n: euro(costs[i].price) })}` : t(`bricksNeed_${n}`), kind: 'wish' }));
    const weather = b.place.weather.map((k) => ({ text: t(`bricksWeather_${k}`), kind: 'plain' }));
    const around = [{ text: styleName(b.place.style), kind: 'style', style: b.place.style }];
    const free = b.budget - spent - reserve;
    if (compact) {
      const Hh = p.canvas.height;
      ctx.font = font('black', sm);
      ctx.fillStyle = color('xr-panel-text');
      ctx.fillText(fitText(ctx, t(`bricksWho_${b.people}`), W - 2 * pad), pad, y);
      y += sm * 1.25;
      const bh = sm * 0.8;
      const foot = bh + sm * 1.75;
      if (compact === 'slim') {
        // The extras step on an upright phone: the wishes as one line, so the cards get the room.
        ctx.font = font('bold', sm * 0.92);
        ctx.fillStyle = color('xr-warning');
        ctx.fillText(fitText(ctx, `${t('bricksLblWishes')}: ${b.needs.map((n) => t(`bricksNeed_${n}`)).join(', ')}`, W - 2 * pad), pad, y);
      } else {
        ctx.font = font('bold', sm * 0.92);
        ctx.fillStyle = color('xr-panel-muted');
        ctx.fillText(fitText(ctx, [t(`bricksWhere_${b.place.id}`), styleName(b.place.style), ...b.place.weather.map((k) => t(`bricksWeather_${k}`))].join(' · '), W - 2 * pad), pad, y);
        y += sm * 1.35;
        const rows = Math.max(1, Math.floor((Hh - pad - foot - y) / (sm * 0.86 * 1.9)));
        chips(ctx, wishes, pad, y, W - 2 * pad, sm * 0.86, rows);
      }
      y = Hh - pad - foot + sm * 0.2;
      budgetBar(ctx, pad, y, W - 2 * pad, bh, { budget: b.budget, spent, reserve });
      y += bh + sm * 0.3;
      ctx.font = font('black', sm);
      ctx.fillStyle = color('xr-bricks-price');
      const freeText = t('bricksFree', { n: euro(free) });
      ctx.fillText(freeText, pad, y);
      const fw = ctx.measureText(freeText).width + sm * 0.6;
      ctx.font = font('bold', sm * 0.92);
      ctx.fillStyle = color('xr-panel-text');
      ctx.fillText(fitText(ctx, `${t('bricksSpent', { n: euro(spent) })}${reserve > 0 ? ` · ${t('bricksReserve', { n: euro(reserve) })}` : ''}`, W - 2 * pad - fw), pad + fw, y + sm * 0.06);
      return;
    }
    ctx.font = font('black', sm * 0.9);
    ctx.fillStyle = color('xr-accent');
    ctx.fillText(t('bricksBrief').toUpperCase(), pad, y);
    y += sm * 1.4;
    ctx.fillStyle = color('xr-panel-text');
    ctx.font = font('black', md * 0.92);
    for (const ln of wrap(ctx, t(`bricksWho_${b.people}`), W - 2 * pad)) { ctx.fillText(ln, pad, y); y += md * 1.1; }
    ctx.font = font('bold', sm);
    for (const ln of wrap(ctx, `${t(`bricksWhere_${b.place.id}`)}, ${t(`bricksAround_${b.place.id}`)}`, W - 2 * pad)) { ctx.fillText(ln, pad, y); y += sm * 1.25; }
    y += sm * 0.4;
    const group = (label, list) => {
      ctx.font = font('bold', sm * 0.9);
      ctx.fillStyle = color('xr-panel-muted');
      ctx.fillText(label, pad, y);
      y += sm * 1.2;
      y += chips(ctx, list, pad, y, W - 2 * pad, sm * 0.9) + sm * 0.65;
    };
    // The wishes, each with the cheapest way to fulfill it (so the money can be planned).
    ctx.font = font('bold', sm * 0.9);
    ctx.fillStyle = color('xr-panel-muted');
    ctx.fillText(t('bricksLblWishes'), pad, y);
    y += sm * 1.25;
    b.needs.forEach((n, i) => {
      chipMark(ctx, 'wish', null, pad, y + sm * 0.55, sm * 0.7);
      ctx.font = font('black', sm * 0.95);
      ctx.fillStyle = color('xr-panel-text');
      const name = t(`bricksNeed_${n}`);
      ctx.fillText(name, pad + sm * 1.0, y);
      const nw = ctx.measureText(name).width;
      ctx.font = font('bold', sm * 0.9);
      ctx.fillStyle = color('xr-panel-muted');
      const how = costs[i] ? `${t(`bricksStep_${costs[i].step}`)} ${t('bricksFrom', { n: euro(costs[i].price) })}` : t('bricksNoWork');
      ctx.fillText(fitText(ctx, how, W - 2 * pad - sm * 1.5 - nw), pad + sm * 1.5 + nw, y + sm * 0.04);
      y += sm * 1.3;
    });
    y += sm * 0.35;
    group(`${t('bricksLblAround')} · ${t('bricksLblWeather')}`, [...around, ...weather]);
    y += sm * 0.2;
    ctx.font = font('bold', sm * 0.95);
    ctx.fillStyle = color('xr-panel-muted');
    ctx.fillText(`${t('bricksLblBudget')} ${euro(b.budget)}`, pad, y);
    y += sm * 1.35;
    const bh = sm * 0.9;
    budgetBar(ctx, pad, y, W - 2 * pad, bh, { budget: b.budget, spent, reserve });
    y += bh + sm * 0.5;
    const row = (token, hatch, text, big) => {
      const px = big ? md : sm * 0.95;
      ctx.fillStyle = color(token);
      ctx.fillRect(pad, y + px * 0.18, sm * 0.8, sm * 0.8);
      if (hatch) { ctx.strokeStyle = color('xr-bricks-bar-hatch'); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(pad, y + sm * 0.95); ctx.lineTo(pad + sm * 0.8, y + sm * 0.15); ctx.stroke(); }
      ctx.fillStyle = color(big ? 'xr-bricks-price' : 'xr-panel-text');
      ctx.font = font(big ? 'black' : 'bold', px);
      ctx.fillText(fitText(ctx, text, W - 2 * pad - sm * 1.2), pad + sm * 1.2, y);
      y += px * 1.32;
    };
    row('xr-bricks-you', false, t('bricksSpent', { n: euro(spent) }));
    if (reserve > 0) row('xr-bricks-bar-reserve', true, t('bricksReserve', { n: euro(reserve) }));
    row('xr-bricks-bar-free', false, t('bricksFree', { n: euro(free) }), true);
  });
}

/** Height (m) the full brief needs. */
export const BRIEF_H = 0.84;

// ---------- the adviser's note ----------

/** get(): { count, tip (option id or null), noTip, followed, of }. */
export function aiPanel(w, h, get) {
  return new Panel(w, h, (ctx, p) => {
    const s = get();
    const sm = p.m(num('xr-text-sm'));
    const pad = p.m(0.03);
    const W = p.canvas.width;
    p.surface({ fill: color('xr-bricks-card-bg'), stroke: color('xr-bricks-ai'), stripe: false });
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let y = pad;
    ctx.font = font('black', sm * 0.9);
    ctx.fillStyle = color('xr-bricks-ai');
    ctx.fillText(t('bricksAiTitle').toUpperCase(), pad, y);
    y += sm * 1.4;
    ctx.font = font('regular', sm * 0.95);
    ctx.fillStyle = color('xr-panel-text');
    for (const ln of wrap(ctx, t('bricksAiAbout', { n: s.count }), W - 2 * pad)) { ctx.fillText(ln, pad, y); y += sm * 1.22; }
    y += sm * 0.3;
    ctx.font = font('black', sm);
    ctx.fillStyle = color('xr-bricks-ai');
    const tip = s.tip ? t('bricksAiSays', { a: s.tip.map(optName).join(', ') }) : s.noTip ? t('bricksAiNoTip') : '';
    for (const ln of wrap(ctx, tip, W - 2 * pad)) { ctx.fillText(ln, pad, y); y += sm * 1.22; }
    if (s.of > 0) {
      ctx.font = font('bold', sm * 0.95);
      ctx.fillStyle = color('xr-panel-muted');
      ctx.fillText(t('bricksAiRecord', { n: s.followed, of: s.of }), pad, y + sm * 0.2);
    }
  });
}

// ---------- a strip of text (the question, a message) ----------

export function strip(w, h, get) {
  return new Panel(w, h, (ctx, p) => {
    const s = get();
    if (!s.text) return;
    const px = p.m(num(s.small ? 'xr-text-sm' : 'xr-text-md')) * (s.scale ?? 1);
    ctx.font = font('black', px);
    // wrapW (meters): the room the layout has for it (the panel itself may be wider than the screen).
    const lines = wrap(ctx, s.text, Math.min(p.canvas.width, p.m(p.wrapW ?? p.w)) - px * 1.6).slice(0, 2);
    const tw = Math.max(...lines.map((ln) => ctx.measureText(ln).width)) + px * 1.6;
    const th = Math.min(p.canvas.height, lines.length * px * 1.25 + px * 0.7);
    const x = (p.canvas.width - tw) / 2;
    const y = (p.canvas.height - th) / 2;
    roundRect(ctx, x, y, tw, th, Math.min(th / 2, px));
    ctx.fillStyle = color('xr-bricks-strip-bg');
    ctx.fill();
    if (s.token) { ctx.lineWidth = Math.max(1.5, px * 0.1); ctx.strokeStyle = color(s.token); ctx.stroke(); }
    ctx.fillStyle = color(s.token ?? 'xr-panel-text');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((ln, i) => ctx.fillText(ln, p.canvas.width / 2, y + th / 2 + (i - (lines.length - 1) / 2) * px * 1.25 + px * 0.05));
  });
}

// ---------- the neighbors' sign ----------

/** get(): { last (option id or null), spent, budget, needs }. small: two lines for phones. */
export function neighborSign(w, h, get, small = false) {
  return new Panel(w, h, (ctx, p) => {
    const s = get();
    const sm = p.m(num('xr-text-sm'));
    const pad = p.m(0.02);
    const W = p.canvas.width;
    p.surface({ fill: color('xr-bricks-card-bg'), stroke: color('xr-bricks-neighbor'), stripe: false });
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = font('black', sm);
    ctx.fillStyle = color('xr-bricks-neighbor');
    ctx.fillText(t('bricksWho_winter'), pad, pad);
    let y = pad + sm * 1.3;
    budgetBar(ctx, pad, y, W - 2 * pad, sm * 0.5, { budget: s.budget, spent: s.spent, reserve: 0 }, 'xr-bricks-neighbor');
    y += sm * 0.8;
    ctx.font = font('bold', sm * 0.92);
    ctx.fillStyle = color('xr-panel-text');
    const builds = s.last ? t('bricksNbBuilds', { a: optName(s.last) }) : t('bricksNbStart');
    const money = t('bricksNbMoney', { n: euro(s.budget - s.spent) });
    if (small) {
      ctx.fillText(fitText(ctx, builds, W - 2 * pad), pad, y);
      ctx.fillText(fitText(ctx, money, W - 2 * pad), pad, y + sm * 1.15);
      return;
    }
    ctx.fillText(fitText(ctx, `${builds} · ${money}`, W - 2 * pad), pad, y);
    y += sm * 1.2;
    ctx.fillStyle = color('xr-panel-muted');
    ctx.fillText(fitText(ctx, s.needs.map((n) => t(`bricksNeed_${n}`)).join(', '), W - 2 * pad), pad, y);
  });
}
export const SIGN_H = 0.17;
export const SIGN_W = 0.7;
export const SIGN_SMALL = [0.46, 0.17];

// ---------- the coherence check ----------

function scoreBar(ctx, x, y, w, h, share, token, hatch) {
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = color('xr-bricks-bar-bg');
  ctx.fill();
  const fw = Math.max(h, w * share);
  ctx.save();
  roundRect(ctx, x, y, fw, h, h / 2);
  ctx.clip();
  ctx.fillStyle = color(token);
  ctx.fillRect(x, y, fw, h);
  if (hatch) {
    ctx.strokeStyle = color('xr-bricks-bar-hatch');
    ctx.lineWidth = Math.max(1, h * 0.14);
    for (let k = x - h; k < x + fw; k += h * 0.7) { ctx.beginPath(); ctx.moveTo(k, y + h); ctx.lineTo(k + h, y); ctx.stroke(); }
  }
  ctx.restore();
}

export const CHECK_SIZE = { wide: [2.4, 0.78], mid: [1.9, 0.72], xr: [1.9, 0.8], tall: [0.98, 1.42] };

/**
 * The check as rows. get(): { me, them (results of judge()), shown (rows revealed, with a
 * fraction while a bar grows), lines: [text] (what your money bought, the tip, what the neighbors bought), verdict }.
 * kind: 'wide' (desktop), 'mid' (phone held sideways), 'xr' (headset), 'tall' (phone upright).
 */
export function checkPanel(kind, get) {
  const [w, h] = CHECK_SIZE[kind];
  return new Panel(w, h, (ctx, p) => {
    const s = get();
    const sm = p.m(num('xr-text-sm'));
    const md = p.m(num('xr-text-md'));
    const pad = p.m(0.035);
    const W = p.canvas.width;
    p.surface({ fill: color('xr-bricks-card-bg'), stripe: false });
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.font = font('black', sm);
    ctx.fillStyle = color('xr-accent');
    ctx.fillText(t('bricksCheck').toUpperCase(), pad, pad + sm * 0.6);
    // legend: you (plain bar), the neighbors (hatched bar)
    ctx.textAlign = 'right';
    let lx = W - pad;
    for (const [label, token, hatch] of [[t('bricksWho_winter'), 'xr-bricks-neighbor', true], [t('bricksYou'), 'xr-bricks-you', false]]) {
      ctx.font = font('bold', sm * 0.9);
      ctx.fillStyle = color('xr-panel-text');
      ctx.fillText(label, lx, pad + sm * 0.6);
      lx -= ctx.measureText(label).width + sm * 0.4;
      scoreBar(ctx, lx - sm * 1.6, pad + sm * 0.3, sm * 1.6, sm * 0.6, 1, token, hatch);
      lx -= sm * 2.4;
    }
    ctx.textAlign = 'left';
    let y = pad + sm * 1.7;
    const tall = kind === 'tall';
    const nameW = tall ? 0 : p.m(kind === 'wide' ? 0.56 : 0.58);
    const barW = tall ? W - 2 * pad - sm * 5.4 : p.m(kind === 'wide' ? 0.52 : 0.5);
    const barH = sm * 0.62;
    const rowH = tall ? sm * 4.75 : sm * 2.25;
    const bars = (row, k, x, yy) => {
      for (const [res, token, hatch, label] of [[s.me, 'xr-bricks-you', false, t('bricksYou')], [s.them, 'xr-bricks-neighbor', true, t('bricksThem')]]) {
        const v = row < 0 ? res.total : res.rows[row].score;
        let bx = x;
        if (tall) {
          ctx.font = font('bold', sm * 0.9);
          ctx.fillStyle = color('xr-panel-text');
          ctx.fillText(label, x, yy + barH / 2);
          bx = x + sm * 3.4;
        }
        scoreBar(ctx, bx, yy, barW, barH, (v / 100) * k, token, hatch);
        ctx.font = font('black', sm * 0.95);
        ctx.fillStyle = color('xr-panel-text');
        ctx.fillText(String(Math.round(v * k)), bx + barW + sm * 0.4, yy + barH / 2 + sm * 0.04);
        yy += barH + sm * 0.28;
      }
    };
    s.me.rows.forEach((r, i) => {
      const k = Math.max(0, Math.min(1, s.shown - i));
      if (s.shown <= i) { y += rowH; return; }
      ctx.font = font('black', sm);
      ctx.fillStyle = color('xr-panel-text');
      if (tall) {
        ctx.fillText(t(`bricksCrit_${r.key}`), pad, y + sm * 0.6);
        bars(i, k, pad, y + sm * 1.35);
        ctx.font = font('regular', sm * 0.92);
        ctx.fillStyle = color('xr-panel-muted');
        ctx.fillText(fitText(ctx, whyText(r.why), W - 2 * pad), pad, y + sm * 3.85);
      } else {
        ctx.fillText(fitText(ctx, t(`bricksCrit_${r.key}`), nameW - sm * 0.5), pad, y + rowH / 2 - sm * 0.1);
        bars(i, k, pad + nameW, y + sm * 0.25);
        const rx = pad + nameW + barW + sm * 2.6;
        const rw = W - rx - pad;
        ctx.font = font('regular', sm * 0.92);
        if (kind === 'wide') {
          ctx.fillStyle = color('xr-panel-text');
          ctx.fillText(fitText(ctx, whyText(r.why), rw), rx, y + sm * 0.25 + barH / 2);
          ctx.fillStyle = color('xr-bricks-neighbor');
          ctx.fillText(fitText(ctx, whyText(s.them.rows[i].why), rw), rx, y + sm * 0.25 + barH * 1.5 + sm * 0.28);
        } else {
          ctx.fillStyle = color('xr-panel-muted');
          for (const [j, ln] of wrap(ctx, whyText(r.why), rw).slice(0, 2).entries()) ctx.fillText(ln, rx, y + sm * 0.55 + j * sm * 1.1);
        }
      }
      y += rowH;
    });
    if (s.shown < s.me.rows.length + 0.01) return;
    // the total and what the money did
    const k = Math.max(0, Math.min(1, s.shown - s.me.rows.length));
    ctx.strokeStyle = color('xr-panel-border');
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke();
    y += sm * 0.5;
    ctx.font = font('black', md * 0.9);
    ctx.fillStyle = color('xr-panel-text');
    if (tall) { ctx.fillText(t('bricksTotal'), pad, y + md * 0.5); bars(-1, k, pad, y + md * 1.2); y += md * 1.2 + 2 * (barH + sm * 0.28) + sm * 0.3; }
    else { ctx.fillText(t('bricksTotal'), pad, y + sm * 1.0); bars(-1, k, pad + nameW, y + sm * 0.25); }
    if (k < 1) return;
    const win = s.me.total > s.them.total;
    ctx.font = font('black', tall ? sm * 1.05 : md * 0.82);
    ctx.fillStyle = color(win ? 'xr-success' : s.me.total === s.them.total ? 'xr-warning' : 'xr-bricks-neighbor');
    if (tall) { for (const ln of wrap(ctx, s.verdict, W - 2 * pad)) { ctx.fillText(ln, pad, y + sm * 0.6); y += sm * 1.3; } }
    else { const rx = pad + nameW + barW + sm * 2.6; for (const [j, ln] of wrap(ctx, s.verdict, W - rx - pad).slice(0, 2).entries()) ctx.fillText(ln, rx, y + sm * 0.6 + j * md); y += sm * 2.4; }
    y += sm * 0.35;
    ctx.font = font('bold', sm * 0.92);
    const bottom = p.canvas.height - pad;
    for (const [i, text] of s.lines.entries()) {
      ctx.fillStyle = color(i === 1 ? 'xr-warning' : 'xr-panel-text');
      for (const ln of wrap(ctx, text, W - 2 * pad)) { if (y + sm * 1.1 > bottom) return; ctx.fillText(ln, pad, y + sm * 0.5); y += sm * 1.18; }
    }
  });
}
