// "Stein auf Stein": 2D drawings on panels, kept quiet: few words, icons, one thing at a time.
// The decision cards (the picture of the real part, name, price, at most two chips, the
// adviser as a thin bar and a badge), and the small panels at the edge: who builds with their
// wishes as icon chips, the money as one bar with one number, the duel with the neighbors, the
// button of the extras. The whole brief and the check's details open on demand.
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
/** A short name for narrow places (the wish list). */
export const optShort = (id) => { const s = t(`bricksOptS_${id}`); return s === `bricksOptS_${id}` ? optName(id) : s; };
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

/**
 * Draws the picture of an option into a rounded square (canvas px): the little photo of the
 * real 3D part when there is one (thumb, a canvas), else a schematic drawing.
 */
export function drawOption(ctx, id, x, y, size, thumb = null) {
  ctx.save();
  roundRect(ctx, x, y, size, size, size * 0.14);
  ctx.clip();
  if (thumb) {
    ctx.drawImage(thumb, x, y, size, size);
    ctx.restore();
    return;
  }
  ctx.translate(x, y);
  ctx.scale(size, size);
  ctx.fillStyle = color('xr-bricks-pic-bg');
  ctx.fillRect(0, 0, 1, 1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  PIC[id]?.(ctx, (rx, ry, rw, rh, token) => { ctx.fillStyle = color(token); ctx.fillRect(rx, ry, rw, rh); });
  ctx.restore();
}

// ---------- little icons (drawn, so nothing hangs on words or colors alone) ----------

/** Draws an icon centered at (x, y), about s px high, in the current fill and stroke color. */
function glyph(ctx, key, x, y, s) {
  const u = s / 2;
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = Math.max(1.2, s * 0.11);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  if (key === 'space') { ctx.rect(-u * 0.8, -u * 0.35, u * 1.6, u * 1.15); ctx.moveTo(-u, -u * 0.35); ctx.lineTo(u, -u * 0.35); ctx.moveTo(-u * 0.25, u * 0.05); ctx.lineTo(u * 0.25, u * 0.05); ctx.moveTo(-u * 0.8, -u * 0.35); ctx.lineTo(-u * 0.5, -u * 0.85); ctx.lineTo(u * 0.5, -u * 0.85); ctx.lineTo(u * 0.8, -u * 0.35); ctx.stroke(); }
  else if (key === 'kids') { ctx.arc(0, 0, u * 0.85, 0, 7); ctx.moveTo(-u * 0.85, 0); ctx.quadraticCurveTo(0, -u * 0.6, u * 0.85, 0); ctx.moveTo(0, -u * 0.85); ctx.quadraticCurveTo(-u * 0.6, 0, 0, u * 0.85); ctx.stroke(); }
  else if (key === 'access') { ctx.moveTo(-u, u * 0.7); ctx.lineTo(u, u * 0.7); ctx.lineTo(u, -u * 0.5); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.arc(-u * 0.35, -u * 0.45, u * 0.3, 0, 7); ctx.fill(); }
  else if (key === 'light') { ctx.arc(0, 0, u * 0.42, 0, 7); ctx.fill(); ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; ctx.moveTo(Math.cos(a) * u * 0.65, Math.sin(a) * u * 0.65); ctx.lineTo(Math.cos(a) * u, Math.sin(a) * u); } ctx.stroke(); }
  else if (key === 'car') { ctx.moveTo(-u, u * 0.3); ctx.lineTo(-u, -u * 0.05); ctx.lineTo(-u * 0.55, -u * 0.15); ctx.lineTo(-u * 0.3, -u * 0.65); ctx.lineTo(u * 0.4, -u * 0.65); ctx.lineTo(u * 0.7, -u * 0.15); ctx.lineTo(u, -u * 0.05); ctx.lineTo(u, u * 0.3); ctx.closePath(); ctx.stroke(); ctx.beginPath(); ctx.arc(-u * 0.5, u * 0.42, u * 0.24, 0, 7); ctx.arc(u * 0.5, u * 0.42, u * 0.24, 0, 7); ctx.fill(); }
  else if (key === 'easy') { ctx.moveTo(-u * 0.75, u * 0.75); ctx.quadraticCurveTo(-u * 0.6, -u * 0.8, u * 0.8, -u * 0.8); ctx.quadraticCurveTo(u * 0.8, u * 0.6, -u * 0.75, u * 0.75); ctx.moveTo(-u * 0.75, u * 0.75); ctx.lineTo(u * 0.35, -u * 0.35); ctx.stroke(); }
  else if (key === 'unity') { ctx.rect(-u * 0.9, -u * 0.9, u * 1.15, u * 1.15); ctx.rect(-u * 0.25, -u * 0.25, u * 1.15, u * 1.15); ctx.stroke(); }
  else if (key === 'people' || key === 'who') { ctx.arc(0, -u * 0.42, u * 0.38, 0, 7); ctx.fill(); ctx.beginPath(); ctx.moveTo(-u * 0.8, u * 0.9); ctx.quadraticCurveTo(-u * 0.8, u * 0.1, 0, u * 0.1); ctx.quadraticCurveTo(u * 0.8, u * 0.1, u * 0.8, u * 0.9); ctx.closePath(); ctx.fill(); }
  else if (key === 'place') { ctx.moveTo(0, u * 0.95); ctx.quadraticCurveTo(-u * 0.9, -u * 0.1, -u * 0.6, -u * 0.55); ctx.arc(0, -u * 0.4, u * 0.62, Math.PI * 0.95, Math.PI * 0.05); ctx.quadraticCurveTo(u * 0.9, -u * 0.1, 0, u * 0.95); ctx.stroke(); ctx.beginPath(); ctx.arc(0, -u * 0.4, u * 0.2, 0, 7); ctx.fill(); }
  else if (key === 'future') { ctx.moveTo(0, u * 0.95); ctx.lineTo(0, -u * 0.1); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -u * 0.05); ctx.quadraticCurveTo(u * 0.1, -u * 0.95, u * 0.95, -u * 0.85); ctx.quadraticCurveTo(u * 0.9, -u * 0.05, 0, -u * 0.05); ctx.moveTo(0, u * 0.35); ctx.quadraticCurveTo(-u * 0.15, -u * 0.35, -u * 0.9, -u * 0.3); ctx.quadraticCurveTo(-u * 0.8, u * 0.35, 0, u * 0.35); ctx.fill(); }
  else if (key === 'value') { ctx.arc(0, 0, u * 0.9, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(u * 0.08, 0, u * 0.42, Math.PI * 0.32, Math.PI * 1.68); ctx.moveTo(-u * 0.5, -u * 0.14); ctx.lineTo(u * 0.12, -u * 0.14); ctx.moveTo(-u * 0.5, u * 0.14); ctx.lineTo(u * 0.12, u * 0.14); ctx.stroke(); }
  else if (key === 'ai') { ctx.rect(-u * 0.6, -u * 0.6, u * 1.2, u * 1.2); for (const d of [-0.3, 0.3]) { ctx.moveTo(u * d, -u * 0.6); ctx.lineTo(u * d, -u); ctx.moveTo(u * d, u * 0.6); ctx.lineTo(u * d, u); ctx.moveTo(-u * 0.6, u * d); ctx.lineTo(-u, u * d); ctx.moveTo(u * 0.6, u * d); ctx.lineTo(u, u * d); } ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, u * 0.22, 0, 7); ctx.fill(); }
  else if (key === 'tick') { ctx.moveTo(-u * 0.7, 0); ctx.lineTo(-u * 0.2, u * 0.55); ctx.lineTo(u * 0.75, -u * 0.6); ctx.stroke(); }
  else if (key === 'up' || key === 'down') { const d = key === 'up' ? -1 : 1; ctx.moveTo(-u * 0.7, -d * u * 0.25); ctx.lineTo(0, d * u * 0.45); ctx.lineTo(u * 0.7, -d * u * 0.25); ctx.lineWidth = s * 0.2; ctx.stroke(); }
  else if (key === 'lock') { ctx.fillRect(-u * 0.7, -u * 0.1, u * 1.4, u); ctx.beginPath(); ctx.arc(0, -u * 0.1, u * 0.45, Math.PI, 0); ctx.stroke(); }
  ctx.restore();
}

/** A chip: an icon and one or two words in a pill. kind: 'up' | 'down' (what the money buys), 'wish', 'tag'. Returns its width. */
function chip(ctx, c, x, y, px, draw = true) {
  const h = px * 1.6;
  ctx.font = font('bold', px);
  const tw = c.text ? ctx.measureText(c.text).width : 0;
  const w = px * 1.5 + tw + (c.text ? px * 0.55 : 0);
  if (!draw) return w;
  const token = c.kind === 'up' ? 'xr-success' : c.kind === 'down' ? 'xr-danger' : c.kind === 'wish' ? 'xr-warning' : 'xr-panel-muted';
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = color(c.on ? 'xr-bricks-gain-bg' : c.kind === 'up' ? 'xr-bricks-gain-bg' : c.kind === 'down' ? 'xr-bricks-loss-bg' : 'xr-bricks-chip-bg');
  ctx.fill();
  ctx.lineWidth = Math.max(1, px * 0.09);
  ctx.strokeStyle = color(c.on ? 'xr-success' : token);
  ctx.stroke();
  ctx.fillStyle = ctx.strokeStyle = color(c.on ? 'xr-success' : token);
  glyph(ctx, c.on ? 'tick' : c.icon, x + px * 0.8, y + h / 2, px * 0.95);
  if (c.text) {
    ctx.fillStyle = color('xr-panel-text');
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = font('bold', px);
    ctx.fillText(c.text, x + px * 1.45, y + h / 2 + px * 0.05);
  }
  return w;
}

/** Draws chips in one row as long as they fit; returns how many were drawn. */
function chipRow(ctx, list, x, y, w, px) {
  let cx = x;
  let n = 0;
  for (const c of list) {
    const cw = chip(ctx, c, 0, 0, px, false);
    if (cx + cw > x + w + 1) break;
    chip(ctx, c, cx, y, px);
    cx += cw + px * 0.4;
    n += 1;
  }
  return n;
}

/** A tick box (an extra that is on the list). */
function tickBox(ctx, x, y, b, on) {
  ctx.lineWidth = Math.max(1.5, b * 0.1);
  ctx.strokeStyle = color(on ? 'xr-success' : 'xr-panel-muted');
  roundRect(ctx, x, y, b, b, b * 0.22);
  if (on) { ctx.fillStyle = color('xr-success'); ctx.fill(); }
  ctx.stroke();
  if (on) { ctx.strokeStyle = color('xr-on-primary'); glyph(ctx, 'tick', x + b / 2, y + b / 2, b * 0.72); }
}

/** Text that always fits its width: smaller down to `min` of its size, never cut off. */
function fitFont(ctx, text, weight, px, maxW, min = 0.72) {
  ctx.font = font(weight, px);
  const w = ctx.measureText(text).width;
  if (w <= maxW) return px;
  const next = Math.max(px * min, (px * maxW) / w);
  ctx.font = font(weight, next);
  return next;
}

// ---------- the decision card ----------

/**
 * A card for one option: the picture of the real part, its name, its price with the surcharge
 * small beside it, at most two chips, and the adviser as a thin bar (how well it expects the
 * house to fit with this card) with a badge on its pick. The exact forecast shows on hover,
 * focus and in the relaxed mode. state: { id, index, locked, missing, selected (an extra: on
 * the list), forecast, compact (an extra), basic, more, chips: [{ icon, text, kind }], words,
 * thumb, hover, focus }.
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
    const f = s.forecast;
    this.userData.label = [optName(s.id), euro(o.price), s.locked ? t('bricksLocked', { n: euro(s.missing) }) : '', s.selected ? t('bricksEarmarked') : '', ...(s.chips ?? []).map((c) => `${c.kind === 'up' ? '+' : c.kind === 'down' ? '-' : ''} ${c.text}`), ...tagsOf(o).map((c) => c.text), f?.top || f?.tip ? t('bricksAiTip') : ''].filter(Boolean).join('. ');
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
    const pad = this.m(0.02);
    const active = (s.hover || s.focus) && !s.locked;
    const f = s.forecast;
    const tip = f?.top || f?.tip;
    const edge = s.focus ? 'xr-focus' : s.selected ? 'xr-success' : tip ? 'xr-bricks-ai' : 'xr-panel-border';
    this.surface({ fill: color(s.selected ? 'xr-bricks-card-on' : active ? 'xr-bricks-card-hover' : 'xr-bricks-card-bg'), stroke: color(edge), strokeWidth: num('xr-border-width') * (s.focus ? 3 : s.selected || active ? 2 : 1.2), stripe: false });
    const slim = W / Hh > 5; // a row of the extras list on a narrow screen
    const pic = Math.min(Hh - 2 * pad, slim ? Hh : W * 0.4);
    drawOption(ctx, s.id, pad, pad, pic, s.thumb);
    // the key number
    const nb = sm * 1.15;
    ctx.fillStyle = color('xr-bricks-key-bg');
    roundRect(ctx, pad - nb * 0.2, pad - nb * 0.2, nb, nb, nb * 0.3);
    ctx.fill();
    ctx.fillStyle = color('xr-bricks-key-text');
    ctx.font = font('black', sm * 0.85);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(s.index), pad + nb * 0.3, pad + nb * 0.34);
    const x = pad + pic + pad;
    const right = W - pad;
    ctx.textAlign = 'left';
    const ink = color(s.locked ? 'xr-panel-muted' : 'xr-panel-text');
    const name = optShort(s.id);
    const price = euro(o.price);
    const b = sm * 1.25;
    if (slim) {
      // one line: name, one chip, the price, the tick box
      const cy = Hh / 2;
      ctx.font = font('black', sm);
      const pw = ctx.measureText(price).width;
      const px0 = right - b - sm * 0.6 - pw;
      const nameW = Math.min(ctx.measureText(name).width, px0 - x - sm);
      ctx.fillStyle = ink;
      fitFont(ctx, name, 'black', sm, nameW + 1);
      ctx.fillText(name, x, cy + sm * 0.05);
      const cx = x + nameW + sm * 0.6;
      if (s.chips?.length) chipRow(ctx, s.chips.slice(0, 1), cx, cy - sm * 0.72, px0 - cx - sm * 0.4, sm * 0.9);
      ctx.font = font('black', sm);
      ctx.fillStyle = color(s.locked ? 'xr-panel-muted' : 'xr-bricks-price');
      ctx.fillText(price, px0, cy + sm * 0.05);
      tickBox(ctx, right - b, cy - b / 2, b, !!s.selected);
    } else {
      // the badge: top right; where the tick box sits there, or the card is narrow, bottom right
      const tile = s.selected !== undefined || right - x < sm * 11;
      const badge = tip ? this.badge(ctx, right, tile ? Hh - pad - sm * 1.4 - (s.selected !== undefined ? 0 : sm * 0.6) : pad, sm) : 0;
      const box = s.selected !== undefined ? b + sm * 0.4 : 0;
      let y = pad;
      ctx.textBaseline = 'top';
      // the name (never cut off: it shrinks a little, then takes the room of the badge)
      const nameW = right - x - (tile ? box : badge);
      ctx.fillStyle = ink;
      const npx = fitFont(ctx, name, 'black', s.compact ? sm * 1.05 : md, nameW, 0.74);
      ctx.fillText(name, x, y + ((s.compact ? sm * 1.05 : md) - npx) * 0.5);
      y += (s.compact ? sm * 1.05 : md) * 1.22;
      // the price, the surcharge small beside it
      const ppx = s.compact ? md * 0.92 : md * 1.12;
      ctx.font = font('black', ppx);
      ctx.fillStyle = color(s.locked ? 'xr-panel-muted' : 'xr-bricks-price');
      ctx.fillText(price, x, y);
      const pw = ctx.measureText(price).width;
      const barY = Hh - pad - sm * 0.36;
      const detail = f && (active || s.words);
      const detailText = !detail ? '' : f.value !== undefined ? `${t('bricksAi', { n: f.value })} · ${t(`bricksConf_${f.level}`)}` : `${t('bricksAiGain', { n: `${f.gain > 0 ? '+' : ''}${f.gain}` })} · ${t(`bricksConf_${f.level}`)}`;
      // the exact forecast gets its own line where there is room, else it takes the place of the surcharge
      const roomy = barY - (y + ppx * 1.2 + sm * 1.7) > sm * 1.25;
      if (detail && !roomy) {
        ctx.fillStyle = color('xr-bricks-ai');
        fitFont(ctx, detailText, 'bold', sm * 0.94, right - x - pw - sm * 0.6, 0.75);
        ctx.fillText(detailText, x + pw + sm * 0.6, y + ppx * 0.22);
      } else if (!s.compact && (s.basic || s.more)) {
        const note = s.basic ? t('bricksBasic') : t('bricksUpcharge', { n: euro(s.more) });
        ctx.fillStyle = color('xr-panel-muted');
        fitFont(ctx, note, 'bold', sm, right - x - pw - sm * 0.6, 0.8);
        ctx.fillText(note, x + pw + sm * 0.6, y + ppx * 0.22);
      }
      y += ppx * 1.2;
      if (s.selected !== undefined) tickBox(ctx, right - b, pad, b, s.selected);
      // at most two chips (one on the small tiles)
      const chipY = y + sm * 0.1;
      if (s.chips?.length) chipRow(ctx, s.chips.slice(0, s.compact ? 1 : 2), x, chipY, right - x - (tile ? badge : 0), sm * 0.94);
      // the adviser: a thin bar (its forecast), the exact numbers on hover, focus or in the relaxed mode
      if (f && f.value !== undefined) {
        const bw = right - x;
        roundRect(ctx, x, barY, bw, sm * 0.3, sm * 0.15);
        ctx.fillStyle = color('xr-bricks-bar-bg');
        ctx.fill();
        roundRect(ctx, x, barY, Math.max(sm * 0.3, (bw * clamp01((f.value - 40) / 55))), sm * 0.3, sm * 0.15);
        ctx.fillStyle = color('xr-bricks-ai');
        ctx.fill();
      }
      if (detail && roomy) {
        ctx.fillStyle = color('xr-bricks-ai');
        fitFont(ctx, detailText, 'bold', sm * 0.94, right - x - (tile ? badge : 0), 0.8);
        ctx.fillText(detailText, x, barY - sm * 1.2);
      }
    }
    // locked: dimmed, with a padlock and the amount missing
    if (s.locked) {
      ctx.fillStyle = color('xr-bricks-lock-veil');
      roundRect(ctx, 0, 0, W, Hh, this.m(num('xr-radius')));
      ctx.fill();
      const text = t('bricksLocked', { n: euro(s.missing) });
      const px = fitFont(ctx, text, 'black', sm, W - pic - pad * 5 - sm * 2);
      const tw = ctx.measureText(text).width;
      const bw = tw + px * 2.6;
      const bh = px * 1.8;
      const bx = Math.min(W - pad - bw, x);
      const by = Hh - pad - bh;
      roundRect(ctx, bx, by, bw, bh, bh / 2);
      ctx.fillStyle = color('xr-bricks-lock-bg');
      ctx.fill();
      ctx.fillStyle = ctx.strokeStyle = color('xr-bricks-lock-text');
      glyph(ctx, 'lock', bx + px * 1.0, by + bh / 2, px * 0.9);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, bx + px * 1.9, by + bh / 2 + px * 0.05);
    }
  }

  /** The adviser's badge on the card it recommends; returns the width it takes. */
  badge(ctx, right, y, sm) {
    const label = t('bricksAiTip');
    ctx.font = font('black', sm * 0.86);
    const w = ctx.measureText(label).width + sm * 1.9;
    const h = sm * 1.4;
    roundRect(ctx, right - w, y, w, h, h * 0.3);
    ctx.fillStyle = color('xr-bricks-ai');
    ctx.fill();
    ctx.fillStyle = ctx.strokeStyle = color('xr-bricks-ai-text');
    glyph(ctx, 'ai', right - w + sm * 0.8, y + h / 2, sm * 0.85);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, right - w + sm * 1.5, y + h / 2 + sm * 0.04);
    ctx.textBaseline = 'top';
    return w + sm * 0.4;
  }
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// ---------- small panels at the edge: who builds, the money, the duel, the extras ----------

class Press extends Panel {
  /** A small panel that can be pressed; get(): its state, paint(ctx, panel, state, hot). */
  constructor(w, h, get, paint, onClick, label) {
    super(w, h, (ctx, p) => { if (p.ready) paint(ctx, p, get(), !!(p.state.hover || p.state.focus)); });
    this.ready = true;
    this.userData.interactive = true;
    this.userData.setHover = (v) => this.set({ hover: v });
    this.userData.setFocus = (v) => this.set({ focus: v });
    this.userData.onClick = () => onClick?.(this);
    this.userData.label = label;
    this.redraw();
  }
}

function plate(p, hot, token = 'xr-panel-border') {
  p.surface({ fill: color(hot ? 'xr-bricks-card-hover' : 'xr-bricks-card-bg'), stroke: color(p.state.focus ? 'xr-focus' : token), strokeWidth: num('xr-border-width') * (p.state.focus ? 3 : hot ? 1.8 : 1), stripe: false });
}

/**
 * The wishes as chips with an icon and a word; a wish that is fulfilled shows a tick. They
 * wrap into `rows` rows; the words only go when even that is too narrow.
 */
function wishChips(ctx, round, met, x, y, w, px, rows = 1) {
  const list = round.brief.needs.map((n) => ({ icon: n, text: t(`bricksNeed_${n}`), kind: 'wish', on: met.includes(n) }));
  const lay = (items) => {
    const out = [];
    let cx = x;
    let row = 0;
    for (const c of items) {
      const cw = chip(ctx, c, 0, 0, px, false);
      if (cx > x && cx + cw > x + w + 1) { cx = x; row += 1; }
      out.push([c, cx, row]);
      cx += cw + px * 0.4;
    }
    return out.some(([, , r]) => r >= rows) || out.some(([c, cx]) => cx + chip(ctx, c, 0, 0, px, false) > x + w + 1) ? null : out;
  };
  const placed = lay(list) ?? lay(list.map((c) => ({ ...c, text: '' }))) ?? [];
  for (const [c, cx, row] of placed) chip(ctx, c, cx, y + row * px * 1.9, px);
}

/**
 * Who builds and what they wish for, in one slim line (a press opens the whole brief).
 * get(): { round, met: [wishes fulfilled], step }.
 */
export function briefChip(w, h, get, onClick) {
  return new Press(w, h, get, (ctx, p, s, hot) => {
    const sm = p.m(num('xr-text-sm'));
    const pad = p.m(0.018);
    const W = p.canvas.width;
    const Hh = p.canvas.height;
    plate(p, hot);
    const who = t(`bricksWhoS_${s.round.brief.people}`);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color('xr-accent');
    const two = Hh > sm * 3.6; // two lines: who above, the wishes below
    const cy = two ? pad + sm * 0.75 : Hh / 2;
    glyph(ctx, 'who', pad + sm * 0.55, cy, sm * 1.05);
    ctx.fillStyle = color('xr-panel-text');
    const px = fitFont(ctx, who, 'black', sm, two ? W - 2 * pad - sm * 1.4 : W * 0.4, 0.8);
    ctx.fillText(who, pad + sm * 1.35, cy + px * 0.05);
    if (two) { const rows = Math.max(1, Math.floor((Hh - 2 * pad - sm * 1.7) / (sm * 0.94 * 1.9))); wishChips(ctx, s.round, s.met, pad, pad + sm * 1.75, W - 2 * pad, sm * 0.94, rows); }
    else { const x = pad + sm * 1.7 + ctx.measureText(who).width; wishChips(ctx, s.round, s.met, x, Hh / 2 - sm * 0.75, W - pad - x, sm * 0.94); }
  }, onClick, t('bricksBrief'));
}

/** Where the money is, as one bar: spent | earmarked (dotted) | reserved (hatched) | free. */
function budgetBar(ctx, x, y, w, h, { budget, spent, earmarked = 0, reserve = 0 }, token = 'xr-bricks-you') {
  ctx.save();
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.clip();
  ctx.fillStyle = color('xr-bricks-bar-free');
  ctx.fillRect(x, y, w, h);
  const a = (w * spent) / budget;
  const e = (w * earmarked) / budget;
  const b = (w * reserve) / budget;
  ctx.fillStyle = color(token);
  ctx.fillRect(x, y, a, h);
  if (e > 0) {
    ctx.fillStyle = color('xr-bricks-bar-wish');
    ctx.fillRect(x + a, y, e, h);
    ctx.fillStyle = color('xr-bricks-bar-hatch');
    for (let k = x + a + h * 0.3; k < x + a + e; k += h * 0.6) { ctx.beginPath(); ctx.arc(k, y + h / 2, h * 0.14, 0, 7); ctx.fill(); }
  }
  if (b > 0) {
    ctx.fillStyle = color('xr-bricks-bar-reserve');
    ctx.fillRect(x + a + e, y, b, h);
    ctx.strokeStyle = color('xr-bricks-bar-hatch');
    ctx.lineWidth = Math.max(1, h * 0.12);
    for (let k = x + a + e - h; k < x + a + e + b; k += h * 0.55) { ctx.beginPath(); ctx.moveTo(k, y + h); ctx.lineTo(k + h, y); ctx.stroke(); }
    ctx.fillStyle = color('xr-bricks-bar-free');
    ctx.fillRect(x + a + e + b, y, w - a - e - b, h);
  }
  ctx.restore();
}

/**
 * The money: one bar and one big number (what is free). A press, hover or focus shows a tiny
 * legend of the bar's parts instead of the number. get(): { budget, spent, earmarked, reserve, legend }.
 */
export function moneyBar(w, h, get, onClick) {
  return new Press(w, h, get, (ctx, p, s, hot) => {
    const sm = p.m(num('xr-text-sm'));
    const md = p.m(num('xr-text-md'));
    const pad = p.m(0.018);
    const W = p.canvas.width;
    const Hh = p.canvas.height;
    plate(p, hot);
    const free = s.budget - s.spent - s.earmarked - s.reserve;
    const two = Hh > sm * 3.4;
    ctx.textBaseline = 'middle';
    const bh = sm * 0.62;
    if (s.legend || hot) {
      // the legend: a swatch with its pattern and one word each
      const items = [['xr-bricks-you', null, t('bricksLegSpent')], ['xr-bricks-bar-wish', 'dots', t('bricksLegWish')], ['xr-bricks-bar-reserve', 'hatch', t('bricksLegReserve')], ['xr-bricks-bar-free', null, t('bricksLegFree')]];
      const px = sm * 0.9;
      ctx.font = font('bold', px);
      const total = items.reduce((n, it) => n + px * 1.25 + ctx.measureText(it[2]).width + px * 0.7, 0);
      const k = Math.min(1, (W - 2 * pad) / total);
      ctx.font = font('bold', px * k);
      let x = pad;
      const cy = two ? pad + sm * 0.8 : Hh / 2;
      for (const [token, pattern, word] of items) {
        const q = px * k * 0.85;
        ctx.fillStyle = color(token);
        ctx.fillRect(x, cy - q / 2, q, q);
        ctx.fillStyle = ctx.strokeStyle = color('xr-bricks-bar-hatch');
        ctx.lineWidth = 1.5;
        if (pattern === 'hatch') { ctx.beginPath(); ctx.moveTo(x, cy + q / 2); ctx.lineTo(x + q, cy - q / 2); ctx.stroke(); }
        if (pattern === 'dots') { ctx.beginPath(); ctx.arc(x + q / 2, cy, q * 0.2, 0, 7); ctx.fill(); }
        ctx.fillStyle = color('xr-panel-text');
        ctx.textAlign = 'left';
        ctx.fillText(word, x + q * 1.35, cy + px * 0.05);
        x += px * k * 1.25 + ctx.measureText(word).width + px * k * 0.7;
      }
      if (two) budgetBar(ctx, pad, Hh - pad - bh, W - 2 * pad, bh, s);
      return;
    }
    const text = euro(free);
    ctx.font = font('bold', sm);
    const lw = ctx.measureText(t('bricksLegFree')).width + sm * 0.4;
    const npx = fitFont(ctx, text, 'black', md, two ? W - 2 * pad - lw : W * 0.5, 0.8);
    const tw = ctx.measureText(text).width;
    ctx.font = font('bold', sm);
    if (two) {
      ctx.textAlign = 'left';
      ctx.fillStyle = color('xr-panel-muted');
      ctx.fillText(t('bricksLegFree'), pad, pad + md * 0.55);
      ctx.font = font('black', npx);
      ctx.fillStyle = color('xr-bricks-price');
      ctx.fillText(text, pad + lw, pad + md * 0.5);
      budgetBar(ctx, pad, Hh - pad - bh, W - 2 * pad, bh, s);
    } else {
      // one line: the bar, then the number
      const x = W - pad - tw - lw;
      budgetBar(ctx, pad, Hh / 2 - bh / 2, x - pad - sm * 0.6, bh, s);
      ctx.textAlign = 'left';
      ctx.fillStyle = color('xr-panel-muted');
      ctx.fillText(t('bricksLegFree'), x, Hh / 2 + sm * 0.05);
      ctx.font = font('black', npx);
      ctx.fillStyle = color('xr-bricks-price');
      ctx.fillText(text, x + lw, Hh / 2 + md * 0.04);
    }
  }, onClick, t('bricksLblBudget'));
}

function scoreBar(ctx, x, y, w, h, share, token, hatch) {
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = color('xr-bricks-bar-bg');
  ctx.fill();
  if (share <= 0) return;
  const fw = Math.max(h, w * Math.min(1, share));
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

/**
 * The duel: your coherence so far and the neighbors', as two numbers with a bar each, and the
 * five criteria as icons with a little pair of bars. Their names show on hover or focus only.
 * get(): { me, them (results of judge() for the houses so far) }.
 */
export function duelPanel(w, h, get) {
  return new Press(w, h, get, (ctx, p, s, hot) => {
    const sm = p.m(num('xr-text-sm'));
    const md = p.m(num('xr-text-md'));
    const pad = p.m(0.018);
    const W = p.canvas.width;
    const Hh = p.canvas.height;
    plate(p, hot);
    ctx.textBaseline = 'middle';
    if (W / Hh > 5) {
      // one low row (phone upright): the two totals with their bars at the left, the five criteria at the right
      const half = W * 0.5;
      [[s.me, 'xr-bricks-you', false, t('bricksYou')], [s.them, 'xr-bricks-neighbor', true, t('bricksThem')]].forEach(([res, token, hatch, who], i) => {
        const cy = Hh * (i ? 0.72 : 0.3);
        ctx.textAlign = 'left';
        ctx.font = font('black', sm);
        ctx.fillStyle = color(token);
        ctx.fillText(who, pad, cy + sm * 0.05);
        ctx.textAlign = 'right';
        ctx.fillText(String(res.total), half - pad, cy + sm * 0.05);
        const x0 = pad + p.m(0.12);
        scoreBar(ctx, x0, cy - sm * 0.2, half - pad - sm * 1.6 - x0, sm * 0.4, res.total / 100, token, hatch);
      });
      const cw = (W - half - pad) / 5;
      s.me.rows.forEach((r, i) => {
        const cx = half + cw * (i + 0.5);
        ctx.fillStyle = ctx.strokeStyle = color('xr-panel-muted');
        glyph(ctx, r.key, cx, Hh * 0.3, sm * 0.95);
        scoreBar(ctx, cx - cw * 0.36, Hh * 0.58, cw * 0.72, sm * 0.22, r.score / 100, 'xr-bricks-you', false);
        scoreBar(ctx, cx - cw * 0.36, Hh * 0.58 + sm * 0.32, cw * 0.72, sm * 0.22, s.them.rows[i].score / 100, 'xr-bricks-neighbor', true);
      });
      return;
    }
    let y = pad;
    for (const [res, token, hatch, who] of [[s.me, 'xr-bricks-you', false, t('bricksYou')], [s.them, 'xr-bricks-neighbor', true, t('bricksThem')]]) {
      ctx.textAlign = 'left';
      ctx.font = font('black', sm);
      ctx.fillStyle = color(token);
      ctx.fillText(who, pad, y + md * 0.5);
      const nw = p.m(0.13);
      ctx.textAlign = 'right';
      ctx.font = font('black', md);
      ctx.fillText(String(res.total), W - pad, y + md * 0.5);
      scoreBar(ctx, pad + nw, y + md * 0.5 - sm * 0.26, W - 2 * pad - nw - md * 1.5, sm * 0.52, res.total / 100, token, hatch);
      y += md * 1.12;
    }
    // the five criteria: an icon and two little bars each
    const cw = (W - 2 * pad) / 5;
    const iy = y + sm * 0.75;
    const room = Hh - pad - iy;
    s.me.rows.forEach((r, i) => {
      const cx = pad + cw * (i + 0.5);
      if (hot && room > sm * 2.4) {
        ctx.fillStyle = color('xr-panel-text');
        ctx.textAlign = 'center';
        fitFont(ctx, t(`bricksCritShort_${r.key}`), 'bold', sm * 0.8, cw - 2, 0.7);
        ctx.fillText(t(`bricksCritShort_${r.key}`), cx, iy);
      } else {
        ctx.fillStyle = ctx.strokeStyle = color('xr-panel-muted');
        glyph(ctx, r.key, cx, iy, sm * 1.0);
      }
      const by = iy + sm * 0.85;
      scoreBar(ctx, cx - cw * 0.38, by, cw * 0.76, sm * 0.26, r.score / 100, 'xr-bricks-you', false);
      scoreBar(ctx, cx - cw * 0.38, by + sm * 0.36, cw * 0.76, sm * 0.26, s.them.rows[i].score / 100, 'xr-bricks-neighbor', true);
    });
  }, null, t('bricksMeter'));
}

/**
 * The button of the extras: how many are earmarked and what they cost together, with their
 * little pictures. get(): { ids, sum, open, thumb(id), star (a wish still needs an extra) }.
 */
export function extrasButton(w, h, get, onClick) {
  return new Press(w, h, get, (ctx, p, s, hot) => {
    const sm = p.m(num('xr-text-sm'));
    const pad = p.m(0.018);
    const W = p.canvas.width;
    const Hh = p.canvas.height;
    plate(p, hot, s.star ? 'xr-warning' : 'xr-accent');
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const text = s.open ? t('bricksWishClose') : s.ids.length ? t('bricksWishBtn', { n: s.ids.length, sum: euro(s.sum) }) : t('bricksWishBtn0');
    let x = pad;
    if (s.star && !s.open) { ctx.fillStyle = color('xr-warning'); chipStar(ctx, x + sm * 0.5, Hh / 2, sm * 0.95); x += sm * 1.2; }
    const pics = s.open ? [] : s.ids.slice(0, 4);
    const pw = pics.length * (Hh - 2 * pad + pad * 0.5);
    ctx.fillStyle = color('xr-panel-text');
    const px = fitFont(ctx, text, 'black', sm, W - pad - x - pw - (pics.length ? sm * 0.4 : 0), 0.8);
    ctx.fillText(text, x, Hh / 2 + px * 0.05);
    let ix = W - pad - pw + pad * 0.5;
    for (const id of pics) { drawOption(ctx, id, ix, pad, Hh - 2 * pad, s.thumb(id)); ix += Hh - 2 * pad + pad * 0.5; }
  }, onClick, t('bricksWishList'));
}
function chipStar(ctx, x, y, s) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 ? s * 0.24 : s * 0.55; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  ctx.fill();
}

/** Seven dots: the steps done, the step now, the steps to come. get(): { step }. */
export function dotsPanel(w, h, get) {
  return new Panel(w, h, (ctx, p) => {
    const { step } = get();
    const n = 7;
    const r = p.canvas.height * 0.26;
    const gap = (p.canvas.width - 2 * r) / (n - 1);
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.arc(r + i * gap, p.canvas.height / 2, i === step ? r * 1.25 : r * 0.8, 0, 7);
      if (i <= step) { ctx.fillStyle = color(i === step ? 'xr-accent' : 'xr-success'); ctx.fill(); }
      else { ctx.strokeStyle = color('xr-panel-muted'); ctx.lineWidth = Math.max(1.5, r * 0.3); ctx.stroke(); }
    }
  });
}

// ---------- the whole brief (the intro, and on demand) ----------

/** get(): { round, spent, earmarked, reserve }. */
export function briefPanel(w, h, get) {
  return new Panel(w, h, (ctx, p) => {
    const { round, spent, earmarked, reserve } = get();
    const b = round.brief;
    const sm = p.m(num('xr-text-sm'));
    const md = p.m(num('xr-text-md'));
    const pad = p.m(0.03);
    const W = p.canvas.width;
    p.surface({ fill: color('xr-bricks-card-bg'), stripe: false });
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let y = pad;
    ctx.font = font('black', sm * 0.9);
    ctx.fillStyle = color('xr-accent');
    ctx.fillText(t('bricksBrief').toUpperCase(), pad, y);
    y += sm * 1.5;
    ctx.fillStyle = color('xr-panel-text');
    ctx.font = font('black', md);
    for (const ln of wrap(ctx, t(`bricksWho_${b.people}`), W - 2 * pad)) { ctx.fillText(ln, pad, y); y += md * 1.12; }
    ctx.font = font('bold', sm);
    ctx.fillStyle = color('xr-panel-muted');
    for (const ln of wrap(ctx, `${t(`bricksWhere_${b.place.id}`)}: ${[styleName(b.place.style), ...b.place.weather.map((k) => t(`bricksWeather_${k}`))].join(', ')}`, W - 2 * pad)) { ctx.fillText(ln, pad, y); y += sm * 1.25; }
    y += sm * 0.6;
    // the wishes, each with the cheapest way to fulfill it
    for (const n of b.needs) {
      const c = wishCost(round, n);
      ctx.fillStyle = ctx.strokeStyle = color('xr-warning');
      glyph(ctx, n, pad + sm * 0.5, y + sm * 0.55, sm);
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillStyle = color('xr-panel-text');
      ctx.font = font('black', sm);
      const name = t(`bricksNeed_${n}`);
      ctx.fillText(name, pad + sm * 1.35, y);
      if (c) {
        const how = `${t(`bricksStep_${c.step}`)} ${t('bricksFrom', { n: euro(c.price) })}`;
        ctx.textAlign = 'right';
        ctx.fillStyle = color('xr-panel-muted');
        fitFont(ctx, how, 'bold', sm, W - 2 * pad - sm * 1.9 - ctx.measureText(name).width, 0.8);
        ctx.fillText(how, W - pad, y);
        ctx.textAlign = 'left';
      }
      y += sm * 1.42;
    }
    y += sm * 0.5;
    // the money and where it comes from
    ctx.font = font('black', md);
    ctx.fillStyle = color('xr-bricks-price');
    ctx.fillText(euro(b.budget), pad, y);
    y += md * 1.2;
    ctx.fillStyle = color('xr-panel-muted');
    fitFont(ctx, t('bricksMoneyFrom', { a: euro(b.savings), b: euro(b.loan) }), 'bold', sm, W - 2 * pad, 0.8);
    ctx.fillText(t('bricksMoneyFrom', { a: euro(b.savings), b: euro(b.loan) }), pad, y);
    y += sm * 1.5;
    budgetBar(ctx, pad, y, W - 2 * pad, sm * 0.8, { budget: b.budget, spent, earmarked, reserve });
  });
}
export const BRIEF = [0.66, 0.6];

// ---------- a strip of text (a hint, a message, a name tag) ----------

/** get(): { text, token, small, icon ('up' | 'down' | a criterion), lines }. */
export function strip(w, h, get) {
  return new Panel(w, h, (ctx, p) => {
    const s = get();
    if (!s.text) return;
    const px = p.m(num(s.small ? 'xr-text-sm' : 'xr-text-md')) * (s.scale ?? 1);
    ctx.font = font('black', px);
    // wrapW (meters): the room the layout has for it (the panel itself may be wider than the screen).
    const iw = s.icon ? px * 1.3 : 0;
    const lines = wrap(ctx, s.text, Math.min(p.canvas.width, p.m(p.wrapW ?? p.w)) - px * 1.6 - iw).slice(0, s.lines ?? 2);
    if (!lines.length) return;
    const tw = Math.max(...lines.map((ln) => ctx.measureText(ln).width)) + px * 1.6 + iw;
    const th = Math.min(p.canvas.height, lines.length * px * 1.25 + px * 0.7);
    const x = (p.canvas.width - tw) / 2;
    const y = (p.canvas.height - th) / 2;
    roundRect(ctx, x, y, tw, th, Math.min(th / 2, px));
    ctx.fillStyle = color('xr-bricks-strip-bg');
    ctx.fill();
    if (s.token) { ctx.lineWidth = Math.max(1.5, px * 0.1); ctx.strokeStyle = color(s.token); ctx.stroke(); }
    ctx.fillStyle = ctx.strokeStyle = color(s.token ?? 'xr-panel-text');
    if (s.icon) glyph(ctx, s.icon, x + px * 1.2, y + th / 2, px * 1.0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    lines.forEach((ln, i) => ctx.fillText(ln, p.canvas.width / 2 + iw / 2, y + th / 2 + (i - (lines.length - 1) / 2) * px * 1.25 + px * 0.05));
  });
}

// ---------- the coherence check ----------

export const CHECK_SIZE = [0.92, 0.46];

/**
 * The check, one thing at a time. get(): { me, them (results of judge()), stage (0..4: that
 * criterion; 5: the summary; 6: the details), grow (0..1, the bars of the stage), verdict,
 * lines: [{ text, token }] (at most three), details: [{ text, token }] }.
 */
export function checkPanel(get) {
  const [w, h] = CHECK_SIZE;
  return new Panel(w, h, (ctx, p) => {
    const s = get();
    const sm = p.m(num('xr-text-sm'));
    const md = p.m(num('xr-text-md'));
    const pad = p.m(0.03);
    const W = p.canvas.width;
    const Hh = p.canvas.height;
    p.surface({ fill: color('xr-bricks-card-bg'), stripe: false });
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    const duel = (y, valueOf, k, big) => {
      for (const [res, token, hatch, who] of [[s.me, 'xr-bricks-you', false, t('bricksYou')], [s.them, 'xr-bricks-neighbor', true, t('bricksThem')]]) {
        const v = valueOf(res);
        const hh = big ? md : sm * 1.1;
        ctx.textAlign = 'left';
        ctx.font = font('black', sm);
        ctx.fillStyle = color(token);
        ctx.fillText(who, pad, y + hh / 2);
        ctx.textAlign = 'right';
        ctx.font = font('black', big ? md * 1.1 : md * 0.9);
        ctx.fillText(String(Math.round(v * k)), W - pad, y + hh / 2);
        scoreBar(ctx, pad + p.m(0.15), y + hh / 2 - sm * 0.3, W - 2 * pad - p.m(0.15) - md * 1.7, sm * 0.6, (v / 100) * k, token, hatch);
        y += hh + sm * 0.5;
      }
      return y;
    };
    if (s.stage < s.me.rows.length) {
      // one criterion: its icon and name, the two bars, one reason
      const r = s.me.rows[s.stage];
      ctx.fillStyle = ctx.strokeStyle = color('xr-accent');
      glyph(ctx, r.key, pad + md * 0.55, pad + md * 0.6, md * 1.1);
      ctx.fillStyle = color('xr-panel-text');
      const name = t(`bricksCrit_${r.key}`);
      fitFont(ctx, name, 'black', md, W - 2 * pad - md * 1.5 - sm * 2.2, 0.75);
      ctx.fillText(name, pad + md * 1.4, pad + md * 0.62);
      ctx.textAlign = 'right';
      ctx.font = font('bold', sm);
      ctx.fillStyle = color('xr-panel-muted');
      ctx.fillText(`${s.stage + 1}/${s.me.rows.length}`, W - pad, pad + md * 0.62);
      ctx.textAlign = 'left';
      let y = pad + md * 1.5;
      if (r.key === 'people') { ctx.font = font('bold', sm * 0.94); ctx.fillStyle = color('xr-warning'); ctx.fillText(t('bricksDouble'), pad + md * 1.4, y); y += sm * 1.0; }
      y = duel(y + sm * 0.2, (res) => res.rows[s.stage].score, s.grow, false);
      ctx.font = font('bold', sm);
      ctx.fillStyle = color('xr-panel-text');
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      for (const ln of wrap(ctx, whyText(r.why), W - 2 * pad).slice(0, 2)) { ctx.fillText(ln, pad, y); y += sm * 1.22; }
      return;
    }
    if (s.stage === s.me.rows.length) {
      // the summary: the two totals, the verdict, three short lines
      let y = duel(pad, (res) => res.total, s.grow, true);
      const win = s.me.total > s.them.total;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = color(win ? 'xr-success' : s.me.total === s.them.total ? 'xr-warning' : 'xr-bricks-neighbor');
      ctx.font = font('black', sm * 1.1);
      for (const ln of wrap(ctx, s.verdict, W - 2 * pad).slice(0, 2)) { ctx.fillText(ln, pad, y); y += sm * 1.35; }
      y += sm * 0.3;
      for (const item of s.lines) {
        ctx.fillStyle = color(item.token ?? 'xr-panel-text');
        const px2 = fitFont(ctx, item.text, 'bold', sm, W - 2 * pad, 0.78);
        ctx.fillText(item.text, pad, y);
        y += Math.max(px2, sm * 0.9) * 1.32;
      }
      return;
    }
    // the details: both shopping lists and budgets, the best plan
    ctx.textBaseline = 'top';
    let y = pad;
    for (const item of s.details) {
      ctx.font = font('bold', sm * 0.94);
      ctx.fillStyle = color(item.token ?? 'xr-panel-text');
      for (const ln of wrap(ctx, item.text, W - 2 * pad)) { if (y + sm > Hh - pad) return; ctx.fillText(ln, pad, y); y += sm * 1.16; }
      y += sm * 0.35;
    }
  });
}

// ---------- a speech tag over the family ----------

/** Draws a short text in a pill with a little tail (for a canvas texture). Returns the size used. */
export function drawTag(ctx, text, token, px) {
  ctx.font = font('black', px);
  const w = Math.ceil(ctx.measureText(text).width + px * 1.4);
  const h = Math.ceil(px * 1.9);
  roundRect(ctx, 2, 2, w - 4, h - 4, h * 0.42);
  ctx.fillStyle = color('xr-bricks-tag-bg');
  ctx.fill();
  ctx.lineWidth = Math.max(2, px * 0.12);
  ctx.strokeStyle = color(token);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(w * 0.42, h - 3); ctx.lineTo(w * 0.5, h + px * 0.45); ctx.lineTo(w * 0.58, h - 3);
  ctx.fillStyle = color('xr-bricks-tag-bg');
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color('xr-bricks-tag-text');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + px * 0.05);
  return [w, h + px * 0.5];
}
