// "Stein auf Stein": 2D drawings on panels. The decision cards (a picture, the price, what the
// price buys as arrows per criterion, plain tags, the AI adviser's forecast; locked when the
// money does not allow them), the chips of the wish list, the brief with the budget bar (spent,
// earmarked, reserved, free; savings and loan), the live meter, the neighbors' sign, the staged
// coherence check with its second page about the money, and the builders' speech tag.
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

// ---------- chips ----------

const CHIP = { style: 'xr-accent', good: 'xr-success', bad: 'xr-danger', wish: 'xr-warning', plain: 'xr-panel-muted', up: 'xr-success', down: 'xr-danger' };

/** A little shape in front of a chip's text, so its kind does not hang on the color alone. */
function chipMark(ctx, kind, style, x, y, s, strong = false) {
  ctx.fillStyle = ctx.strokeStyle = color(CHIP[kind]);
  ctx.lineWidth = s * 0.22;
  ctx.beginPath();
  if (kind === 'up' || kind === 'down') {
    // What the money buys: an arrow up (a gain for this criterion) or down (a loss); two for a big one.
    const d = kind === 'up' ? -1 : 1;
    for (const off of strong ? [-0.28, 0.28] : [0]) {
      ctx.moveTo(x + s * 0.05, y - d * s * 0.3 + off * s);
      ctx.lineTo(x + s * 0.5, y + d * s * 0.3 + off * s);
      ctx.lineTo(x + s * 0.95, y - d * s * 0.3 + off * s);
    }
    ctx.lineWidth = s * 0.26;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  } else if (kind === 'good') { ctx.moveTo(x, y); ctx.lineTo(x + s, y); ctx.moveTo(x + s / 2, y - s / 2); ctx.lineTo(x + s / 2, y + s / 2); ctx.stroke(); }
  else if (kind === 'bad') { ctx.moveTo(x, y); ctx.lineTo(x + s, y); ctx.stroke(); }
  else if (kind === 'wish') { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 ? s * 0.26 : s * 0.6; ctx.lineTo(x + s / 2 + Math.cos(a) * r, y + Math.sin(a) * r); } ctx.fill(); }
  else if (style === 'trad') { ctx.moveTo(x, y + s * 0.4); ctx.lineTo(x + s / 2, y - s * 0.5); ctx.lineTo(x + s, y + s * 0.4); ctx.fill(); }
  else if (style === 'mod') ctx.fillRect(x + s * 0.1, y - s * 0.4, s * 0.8, s * 0.8);
  else if (style === 'nat') { ctx.ellipse(x + s / 2, y, s * 0.5, s * 0.3, -0.6, 0, 7); ctx.fill(); }
  else { ctx.arc(x + s / 2, y, s * 0.36, 0, 7); ctx.stroke(); }
}

/**
 * Lays chips out in rows inside (x, y, w); returns the height used (px). maxRows: rows that
 * fit; draw false only measures. Chips of kind 'up' and 'down' are filled (what the money buys).
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
      const gain = chip.kind === 'up' || chip.kind === 'down';
      roundRect(ctx, cx, cy, cw, h, gain ? h * 0.28 : h / 2);
      ctx.fillStyle = color(gain ? (chip.kind === 'up' ? 'xr-bricks-gain-bg' : 'xr-bricks-loss-bg') : 'xr-bricks-chip-bg');
      ctx.fill();
      ctx.lineWidth = Math.max(1, px * 0.09);
      ctx.strokeStyle = color(CHIP[chip.kind] ?? CHIP.plain);
      ctx.stroke();
      chipMark(ctx, chip.kind, chip.style, cx + px * 0.45, cy + h / 2, mark, chip.strong);
      ctx.fillStyle = color('xr-panel-text');
      ctx.font = font('bold', px);
      ctx.fillText(fitText(ctx, chip.text, tw + 1), cx + px * 0.75 + mark, cy + h / 2 + px * 0.04);
    }
    cx += cw + gap;
  }
  ctx.restore();
  return (Math.min(row, maxRows - 1) + 1) * (h + gap) - gap;
}

/** A tick box (an extra that is on the wish list). */
function tickBox(ctx, x, y, b, on) {
  ctx.lineWidth = Math.max(1.5, b * 0.1);
  ctx.strokeStyle = color(on ? 'xr-success' : 'xr-panel-muted');
  roundRect(ctx, x, y, b, b, b * 0.2);
  if (on) { ctx.fillStyle = color('xr-success'); ctx.fill(); }
  ctx.stroke();
  if (on) { ctx.strokeStyle = color('xr-on-primary'); ctx.lineWidth = b * 0.16; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x + b * 0.2, y + b * 0.52); ctx.lineTo(x + b * 0.42, y + b * 0.74); ctx.lineTo(x + b * 0.8, y + b * 0.26); ctx.stroke(); }
}

/** A padlock with the amount missing, in a pill. */
function lockPill(ctx, cx, y, text, px) {
  ctx.font = font('black', px);
  const tw = ctx.measureText(text).width;
  const lk = px * 1.1;
  const bw = tw + lk * 2.4;
  const bh = lk * 1.7;
  const bx = cx - bw / 2;
  roundRect(ctx, bx, y, bw, bh, bh / 2);
  ctx.fillStyle = color('xr-bricks-lock-bg');
  ctx.fill();
  ctx.fillStyle = ctx.strokeStyle = color('xr-bricks-lock-text');
  ctx.lineWidth = lk * 0.16;
  ctx.fillRect(bx + lk * 0.55, y + bh * 0.48, lk * 0.8, lk * 0.56);
  ctx.beginPath();
  ctx.arc(bx + lk * 0.95, y + bh * 0.48, lk * 0.27, Math.PI, 0);
  ctx.stroke();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + lk * 1.75, y + bh / 2 + lk * 0.05);
  return bh;
}

// ---------- the decision card ----------

/**
 * A card for one option. state: { id, index (1..), locked, missing (thousand euros), selected
 * (an extra: on the wish list), forecast: { value | gain, conf, level, top | tip } | null,
 * compact (an extra), basic, more, gains: [{ text, kind: 'up' | 'down', strong }] (what the
 * money buys, in the check's own criteria), wish (it fulfills a wish of the brief), warn, good,
 * words (the confidence in words too), thumb (a canvas with its picture), hover, focus }.
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
    this.userData.label = [optName(s.id), euro(o.price), s.locked ? t('bricksLocked', { n: euro(s.missing) }) : '', s.selected ? t('bricksTaken') : '', ...(s.gains ?? []).map((g) => `${g.kind === 'up' ? '+' : '-'} ${g.text}`), ...tagsOf(o).map((c) => c.text)].filter(Boolean).join('. ');
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
    const lg = this.m(num('xr-text-lg'));
    const pad = this.m(0.022);
    const active = (s.hover || s.focus) && !s.locked;
    const edge = s.focus ? 'xr-focus' : s.selected ? 'xr-success' : s.forecast?.top || s.forecast?.tip ? 'xr-bricks-ai' : 'xr-panel-border';
    this.surface({ fill: color(s.selected ? 'xr-bricks-card-on' : active ? 'xr-bricks-card-hover' : 'xr-bricks-card-bg'), stroke: color(edge), strokeWidth: num('xr-border-width') * (s.focus ? 3 : s.selected || active ? 2 : 1.2), stripe: false });
    // picture with the key number
    const pic = s.compact ? Math.min(Hh * 0.34, W * 0.2) : Math.min(Hh * 0.42, W * 0.24, this.m(0.17));
    drawOption(ctx, s.id, pad, pad, pic, s.thumb);
    const nb = sm * 1.2;
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
    const tick = s.selected !== undefined ? sm * 1.5 : 0;
    const w = W - x - pad - tick;
    let y = pad;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = color(s.locked ? 'xr-panel-muted' : 'xr-panel-text');
    const name = s.compact ? optShort(s.id) : optName(s.id);
    let tpx = s.compact ? sm : md;
    ctx.font = font('black', tpx);
    if (ctx.measureText(name).width > w) { tpx *= Math.max(0.82, w / ctx.measureText(name).width); ctx.font = font('black', tpx); }
    ctx.fillText(fitText(ctx, name, w), x, y);
    y += (s.compact ? sm : md) * 1.2;
    const ppx = s.compact ? md * 0.95 : lg;
    ctx.font = font('black', ppx);
    ctx.fillStyle = color(s.locked ? 'xr-panel-muted' : 'xr-bricks-price');
    const price = euro(o.price);
    ctx.fillText(price, x, y);
    const pw = ctx.measureText(price).width;
    if (!s.compact && (s.basic || s.more)) {
      ctx.font = font('bold', sm * 0.95);
      ctx.fillStyle = color('xr-panel-muted');
      const note = s.basic ? t('bricksBasic') : t('bricksUpcharge', { n: euro(s.more) });
      if (pw + sm + ctx.measureText(note).width < w) ctx.fillText(note, x + pw + sm * 0.6, y + ppx * 0.3);
    }
    y += ppx * 1.15;
    if (s.selected !== undefined) tickBox(ctx, W - pad - sm * 1.2, pad, sm * 1.2, s.selected);
    // from the bottom: what the adviser says, then help in the relaxed mode
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
      const signed = (n) => `${n > 0 ? '+' : ''}${n}`;
      const main = f.value !== undefined ? (f.top ? `${f.value} %` : t('bricksAi', { n: f.value })) : (f.tip ? signed(f.gain) : t('bricksAiGain', { n: signed(f.gain) }));
      const options = [`${main} · ${t('bricksConf', { n: conf })}${s.words ? ` (${t(`bricksConf_${f.level}`)})` : ''}`, `${main} · ${t('bricksConf', { n: conf })}`, `${main} · ${t(`bricksConf_${f.level}`)}`, main];
      const room = left + full - ax;
      ctx.fillText(options.find((text) => ctx.measureText(text).width <= room) ?? main, ax, cy + sm * 0.04);
    }
    ctx.textBaseline = 'top';
    const note = s.warn ?? s.good;
    if (note && bottom - y > sm * 3.4) {
      bottom -= sm * 1.25;
      ctx.font = font('bold', sm * 0.95);
      ctx.fillStyle = color(s.warn ? 'xr-danger' : 'xr-success');
      ctx.fillText(fitText(ctx, `${s.warn ? '! ' : '+ '}${note}`, full), left, bottom);
    }
    // the middle: what the money buys (gains), the plain tags, the one-liner if there is room
    const chipPx = sm * 0.9;
    const rowH = chipPx * 1.9;
    const top = Math.max(y, pad + pic) + sm * 0.3;
    const list = [...(s.gains ?? []), ...(s.wish ? [{ text: t(`bricksNeed_${o.gives}`), kind: 'wish' }] : []), ...tagsOf(o).filter((c) => !(s.wish && c.kind === 'wish'))];
    const need = chips(ctx, list, left, 0, full, chipPx, 9, false);
    let cy = top;
    if (!s.compact && bottom - top - need > sm * 1.5) {
      ctx.font = font('regular', sm * 0.95);
      ctx.fillStyle = color('xr-panel-muted');
      ctx.fillText(fitText(ctx, t(`bricksOptD_${s.id}`), full), left, cy);
      cy += sm * 1.45;
    }
    chips(ctx, list, left, cy, full, chipPx, Math.max(1, Math.floor((bottom - cy + chipPx * 0.35) / rowH)));
    // locked: dimmed, with a padlock and the amount missing
    if (s.locked) {
      ctx.fillStyle = color('xr-bricks-lock-veil');
      roundRect(ctx, 0, 0, W, Hh, this.m(num('xr-radius')));
      ctx.fill();
      const px = s.compact ? sm : md;
      lockPill(ctx, W / 2, Hh - px * 1.1 * 1.7 - pad * 0.6, t('bricksLocked', { n: euro(s.missing) }), px);
    }
  }
}

/**
 * A small chip for the wish list: an extra with its price, a tick when it is earmarked, a
 * star when it fulfills a wish of the brief, a padlock when the money does not allow it.
 * state: { id, index, selected, locked, wish, thumb, hover, focus }.
 */
export class WishChip extends Panel {
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
    this.userData.label = [t('bricksWishList'), optName(s.id), euro(OPTION[s.id].price), s.selected ? t('bricksEarmarked') : '', s.locked ? t('bricksLocked', { n: euro(s.missing) }) : ''].filter(Boolean).join('. ');
  }

  paint() {
    if (!this.ready) return;
    const { ctx } = this;
    const s = this.state;
    const W = this.canvas.width;
    const Hh = this.canvas.height;
    const sm = this.m(num('xr-text-sm'));
    const pad = this.m(0.012);
    const active = (s.hover || s.focus) && !s.locked;
    this.surface({ fill: color(s.selected ? 'xr-bricks-card-on' : active ? 'xr-bricks-card-hover' : 'xr-bricks-card-bg'), stroke: color(s.focus ? 'xr-focus' : s.selected ? 'xr-success' : s.wish ? 'xr-warning' : 'xr-panel-border'), strokeWidth: num('xr-border-width') * (s.focus ? 3 : s.selected || active || s.wish ? 1.6 : 1), stripe: false });
    const pic = Hh - 2 * pad;
    drawOption(ctx, s.id, pad, pad, pic, s.thumb);
    const x = pad + pic + pad;
    const b = sm * 0.95;
    const w = W - x - pad - b - pad * 0.5;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = s.locked ? 0.5 : 1;
    let px = sm * 0.9;
    const name = optShort(s.id);
    ctx.font = font('black', px);
    if (ctx.measureText(name).width > w) { px *= Math.max(0.8, w / ctx.measureText(name).width); ctx.font = font('black', px); }
    ctx.fillStyle = color('xr-panel-text');
    ctx.fillText(fitText(ctx, name, w), x, Hh * 0.33);
    ctx.font = font('black', sm * 0.9);
    ctx.fillStyle = color('xr-bricks-price');
    ctx.fillText(euro(OPTION[s.id].price), x, Hh * 0.7);
    ctx.globalAlpha = 1;
    if (s.locked && !s.selected) {
      // a small padlock instead of the tick box
      ctx.fillStyle = ctx.strokeStyle = color('xr-panel-muted');
      ctx.lineWidth = b * 0.14;
      ctx.fillRect(W - pad - b, Hh * 0.5 - b * 0.1, b * 0.8, b * 0.55);
      ctx.beginPath();
      ctx.arc(W - pad - b * 0.6, Hh * 0.5 - b * 0.1, b * 0.26, Math.PI, 0);
      ctx.stroke();
    } else tickBox(ctx, W - pad - b, pad, b, s.selected);
    if (s.wish) chipMark(ctx, 'wish', null, W - pad - b * 0.95, Hh - pad - b * 0.55, b * 0.9);
  }
}

// ---------- the budget bar ----------

/**
 * Where the money is: spent | earmarked for the wish list (dotted) | kept for the cheapest
 * version of the open parts (hatched) | free. A mark shows where the savings end and the loan
 * begins. Values in thousand euros.
 */
function budgetBar(ctx, x, y, w, h, { budget, spent, earmarked = 0, reserve = 0, savings = 0 }, token = 'xr-bricks-you') {
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
  if (savings > 0) {
    const sx = x + (w * savings) / budget;
    ctx.strokeStyle = color('xr-panel-text');
    ctx.lineWidth = Math.max(1.5, h * 0.14);
    ctx.beginPath(); ctx.moveTo(sx, y - h * 0.3); ctx.lineTo(sx, y + h * 1.3); ctx.stroke();
  }
}

/** The legend swatch of a bar segment: plain, dotted or hatched (a pattern, not only a color). */
function swatch(ctx, x, y, s, token, pattern) {
  ctx.fillStyle = color(token);
  ctx.fillRect(x, y, s, s);
  ctx.strokeStyle = ctx.fillStyle = color('xr-bricks-bar-hatch');
  ctx.lineWidth = 1.5;
  if (pattern === 'hatch') { ctx.beginPath(); ctx.moveTo(x, y + s); ctx.lineTo(x + s, y); ctx.stroke(); }
  if (pattern === 'dots') { ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s * 0.2, 0, 7); ctx.fill(); }
}

// ---------- the brief ----------

/**
 * The brief with the budget. get(): { round, spent, earmarked, reserve }. kind: 'full' (desktop,
 * headset), 'strip' (phone upright), 'mini' (phone sideways). Returns a Panel.
 */
export function briefPanel(w, h, get, kind = 'full') {
  return new Panel(w, h, (ctx, p) => {
    const { round, spent, earmarked, reserve } = get();
    const b = round.brief;
    const sm = p.m(num('xr-text-sm'));
    const md = p.m(num('xr-text-md'));
    const pad = p.m(kind === 'full' ? 0.03 : 0.02);
    const W = p.canvas.width;
    const Hh = p.canvas.height;
    p.surface({ fill: color('xr-bricks-card-bg'), stripe: false });
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    let y = pad;
    const free = b.budget - spent - earmarked - reserve;
    const money = { budget: b.budget, spent, earmarked, reserve, savings: b.savings };
    const costs = b.needs.map((n) => wishCost(round, n));
    if (kind !== 'full') {
      // who and where on one or two lines, the wishes as one line, the bar, what is free
      ctx.font = font('black', sm);
      ctx.fillStyle = color('xr-panel-text');
      for (const ln of wrap(ctx, `${t(`bricksWho_${b.people}`)} · ${t(`bricksWhere_${b.place.id}`)}`, W - 2 * pad).slice(0, kind === 'mini' ? 2 : 1)) { ctx.fillText(ln, pad, y); y += sm * 1.2; }
      ctx.font = font('bold', sm * 0.95);
      ctx.fillStyle = color('xr-panel-muted');
      for (const ln of wrap(ctx, [styleName(b.place.style), ...b.place.weather.map((k) => t(`bricksWeather_${k}`))].join(' · '), W - 2 * pad).slice(0, 1)) { ctx.fillText(ln, pad, y); y += sm * 1.2; }
      ctx.fillStyle = color('xr-warning');
      for (const ln of wrap(ctx, `${t('bricksLblWishes')}: ${b.needs.map((n) => t(`bricksNeed_${n}`)).join(', ')}`, W - 2 * pad).slice(0, 2)) { ctx.fillText(ln, pad, y); y += sm * 1.2; }
      const bh = sm * 0.8;
      y = Hh - pad - bh - sm * 1.55;
      budgetBar(ctx, pad, y, W - 2 * pad, bh, money);
      y += bh + sm * 0.4;
      ctx.font = font('black', sm);
      ctx.fillStyle = color('xr-bricks-price');
      const freeText = t('bricksFree', { n: euro(free) });
      ctx.fillText(freeText, pad, y);
      const fw = ctx.measureText(freeText).width + sm * 0.6;
      ctx.font = font('bold', sm * 0.95);
      ctx.fillStyle = color('xr-panel-text');
      const rest = [earmarked > 0 ? t('bricksEarmarkedSum', { n: euro(earmarked) }) : '', t('bricksSpent', { n: euro(spent) })].filter(Boolean);
      const fits = rest.filter((text) => ctx.measureText(text).width <= W - 2 * pad - fw);
      if (fits.length) ctx.fillText(fits[0], pad + fw, y);
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
    y += sm * 0.25;
    y += chips(ctx, [{ text: styleName(b.place.style), kind: 'style', style: b.place.style }, ...b.place.weather.map((k) => ({ text: t(`bricksWeather_${k}`), kind: 'plain' }))], pad, y, W - 2 * pad, sm * 0.9) + sm * 0.6;
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
      const room = W - 2 * pad - sm * 1.5 - nw;
      if (ctx.measureText(how).width <= room) ctx.fillText(how, pad + sm * 1.5 + nw, y + sm * 0.04);
      else { y += sm * 1.15; ctx.fillText(fitText(ctx, how, W - 2 * pad - sm), pad + sm * 1.0, y); }
      y += sm * 1.3;
    });
    // The money: where it comes from, where it is.
    y += sm * 0.3;
    ctx.font = font('black', sm);
    ctx.fillStyle = color('xr-panel-text');
    ctx.fillText(`${t('bricksLblBudget')} ${euro(b.budget)}`, pad, y);
    y += sm * 1.25;
    ctx.font = font('bold', sm * 0.9);
    ctx.fillStyle = color('xr-panel-muted');
    for (const ln of wrap(ctx, t('bricksMoneyFrom', { a: euro(b.savings), b: euro(b.loan) }), W - 2 * pad)) { ctx.fillText(ln, pad, y); y += sm * 1.15; }
    y += sm * 0.35;
    const bh = sm * 0.9;
    budgetBar(ctx, pad, y, W - 2 * pad, bh, money);
    y += bh + sm * 0.55;
    const row = (token, pattern, label, amount, big) => {
      const px = big ? md * 0.95 : sm * 0.95;
      swatch(ctx, pad, y + px * 0.16, sm * 0.8, token, pattern);
      ctx.fillStyle = color(big ? 'xr-bricks-price' : 'xr-panel-text');
      ctx.font = font(big ? 'black' : 'bold', px);
      ctx.textAlign = 'left';
      ctx.fillText(label, pad + sm * 1.2, y);
      ctx.textAlign = 'right';
      ctx.fillText(euro(amount), W - pad, y);
      ctx.textAlign = 'left';
      y += px * 1.3;
    };
    row('xr-bricks-you', null, t('bricksLegSpent'), spent);
    if (earmarked > 0) row('xr-bricks-bar-wish', 'dots', t('bricksLegWish'), earmarked);
    if (reserve > 0) row('xr-bricks-bar-reserve', 'hatch', t('bricksLegReserve'), reserve);
    row('xr-bricks-bar-free', null, t('bricksLegFree'), free, true);
  });
}

/** Sizes (m) of the brief: full, the strip for upright phones, the mini for phones held sideways. */
export const BRIEF = { full: [0.62, 0.92], strip: [0.9, 0.27], mini: [0.56, 0.3] };

// ---------- the live meter ----------

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
 * The coherence so far, criterion by criterion, for you and for the neighbors. get(): { me,
 * them (results of judge() for the houses so far), last (one line about the latest change),
 * count (houses the adviser has seen) }. kind: 'full' or 'strip' (one row for phones).
 */
export function meterPanel(w, h, get, kind = 'full') {
  return new Panel(w, h, (ctx, p) => {
    const s = get();
    const sm = p.m(num('xr-text-sm'));
    const md = p.m(num('xr-text-md'));
    const pad = p.m(kind === 'full' ? 0.03 : 0.02);
    const W = p.canvas.width;
    const Hh = p.canvas.height;
    p.surface({ fill: color('xr-bricks-card-bg'), stripe: false });
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    if (kind !== 'full') {
      // totals at the left, five little pairs of bars beside them
      ctx.font = font('black', sm);
      ctx.fillStyle = color('xr-bricks-you');
      const a = `${t('bricksYou')} ${s.me.total}`;
      ctx.fillText(a, pad, Hh * 0.32);
      ctx.fillStyle = color('xr-bricks-neighbor');
      const c = `${t('bricksThem')} ${s.them.total}`;
      ctx.fillText(c, pad, Hh * 0.7);
      const x0 = pad + Math.max(ctx.measureText(a).width, ctx.measureText(c).width) + sm * 0.8;
      const cw = (W - pad - x0) / 5;
      s.me.rows.forEach((r, i) => {
        const x = x0 + i * cw;
        ctx.font = font('bold', sm * 0.86);
        ctx.fillStyle = color('xr-panel-muted');
        ctx.fillText(fitText(ctx, t(`bricksCritShort_${r.key}`), cw - sm * 0.3), x, Hh * 0.24);
        scoreBar(ctx, x, Hh * 0.47, cw - sm * 0.5, sm * 0.38, r.score / 100, 'xr-bricks-you', false);
        scoreBar(ctx, x, Hh * 0.47 + sm * 0.55, cw - sm * 0.5, sm * 0.38, s.them.rows[i].score / 100, 'xr-bricks-neighbor', true);
      });
      return;
    }
    let y = pad;
    ctx.font = font('black', sm * 0.9);
    ctx.fillStyle = color('xr-accent');
    ctx.fillText(t('bricksMeter').toUpperCase(), pad, y + sm * 0.5);
    y += sm * 1.5;
    // the totals, large
    ctx.font = font('black', md);
    ctx.fillStyle = color('xr-bricks-you');
    ctx.fillText(`${t('bricksYou')} ${s.me.total}`, pad, y + md * 0.5);
    ctx.textAlign = 'right';
    ctx.fillStyle = color('xr-bricks-neighbor');
    ctx.fillText(`${t('bricksThem')} ${s.them.total}`, W - pad, y + md * 0.5);
    ctx.textAlign = 'left';
    y += md * 1.3;
    const nameW = p.m(0.2);
    const barW = W - 2 * pad - nameW - sm * 1.9;
    const barH = sm * 0.42;
    s.me.rows.forEach((r, i) => {
      ctx.font = font('bold', sm * 0.92);
      ctx.fillStyle = color('xr-panel-text');
      ctx.fillText(t(`bricksCritShort_${r.key}`), pad, y + barH + sm * 0.08);
      for (const [res, token, hatch, k] of [[s.me, 'xr-bricks-you', false, 0], [s.them, 'xr-bricks-neighbor', true, 1]]) {
        const yy = y + k * (barH + sm * 0.16);
        scoreBar(ctx, pad + nameW, yy, barW, barH, res.rows[i].score / 100, token, hatch);
        ctx.font = font('bold', sm * 0.8);
        ctx.fillStyle = color('xr-panel-text');
        ctx.fillText(String(res.rows[i].score), pad + nameW + barW + sm * 0.35, yy + barH / 2 + sm * 0.03);
      }
      y += 2 * barH + sm * 0.62;
    });
    // the latest change in one line, and the permanent note about the adviser
    ctx.textBaseline = 'top';
    if (s.last) {
      ctx.font = font('bold', sm * 0.92);
      ctx.fillStyle = color(s.lastToken ?? 'xr-panel-text');
      for (const ln of wrap(ctx, s.last, W - 2 * pad).slice(0, 2)) { ctx.fillText(ln, pad, y); y += sm * 1.15; }
    }
    ctx.font = font('bold', sm * 0.9);
    ctx.fillStyle = color('xr-bricks-ai');
    const note = wrap(ctx, t('bricksAiNote', { n: s.count }), W - 2 * pad);
    let ny = Hh - pad - note.length * sm * 1.12;
    for (const ln of note) { ctx.fillText(ln, pad, ny); ny += sm * 1.12; }
  });
}
export const METER = { full: [0.62, 0.66], strip: [0.9, 0.125], mini: [0.56, 0.125] };

// ---------- a strip of text (the question, a message, a coach line) ----------

export function strip(w, h, get) {
  return new Panel(w, h, (ctx, p) => {
    const s = get();
    if (!s.text) return;
    const px = p.m(num(s.small ? 'xr-text-sm' : 'xr-text-md')) * (s.scale ?? 1);
    ctx.font = font('black', px);
    // wrapW (meters): the room the layout has for it (the panel itself may be wider than the screen).
    const lines = wrap(ctx, s.text, Math.min(p.canvas.width, p.m(p.wrapW ?? p.w)) - px * 1.6).slice(0, s.lines ?? 2);
    if (!lines.length) return;
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

/** get(): { kind (what builders they are), last (option id or null), spent, budget }. small: for phones. */
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
    let y = pad + sm * 1.25;
    ctx.font = font('bold', sm * 0.92);
    ctx.fillStyle = color('xr-panel-muted');
    for (const ln of wrap(ctx, t(`bricksNbKind_${s.kind}`), W - 2 * pad).slice(0, small ? 1 : 2)) { ctx.fillText(ln, pad, y); y += sm * 1.15; }
    y += sm * 0.15;
    budgetBar(ctx, pad, y, W - 2 * pad, sm * 0.5, { budget: s.budget, spent: s.spent }, 'xr-bricks-neighbor');
    y += sm * 0.85;
    ctx.fillStyle = color('xr-panel-text');
    const lines = [s.last ? t('bricksNbBuilds', { a: optName(s.last) }) : t('bricksNbStart'), t('bricksNbMoney', { n: euro(s.budget - s.spent) })];
    for (const text of lines) for (const ln of wrap(ctx, text, W - 2 * pad).slice(0, 1)) { ctx.fillText(ln, pad, y); y += sm * 1.15; }
  });
}
export const SIGN = { full: [0.62, 0.3], small: [0.46, 0.24] };

// ---------- the coherence check ----------

export const CHECK_SIZE = { wide: [2.3, 0.58], tall: [0.95, 0.98], side: [1.08, 0.66], xr: [1.9, 0.6] };

/**
 * The check, staged. get(): { me, them (results of judge()), shown (rows revealed, with a
 * fraction while a bar grows), verdict, page (0: the criteria, 1: what the money did), money:
 * [{ text, token }] }. kind: 'wide' (desktop), 'tall' (phone upright), 'side' (phone sideways,
 * beside the houses), 'xr' (headset). The narrow kinds show the reason of the row being
 * revealed in a box at the bottom (no cut-off text), the wide ones beside every row.
 */
export function checkPanel(kind, get) {
  const [w, h] = CHECK_SIZE[kind];
  const narrow = kind === 'tall' || kind === 'side';
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
    ctx.font = font('black', sm * 0.95);
    ctx.fillStyle = color('xr-accent');
    ctx.fillText((s.page ? t('bricksMoneyTitle') : t('bricksCheck')).toUpperCase(), pad, pad + sm * 0.6);
    let y = pad + sm * 1.6;
    if (s.page) {
      // What the money did: every line whole, wrapped.
      ctx.textBaseline = 'top';
      for (const item of s.money) {
        ctx.font = font(item.big ? 'black' : 'bold', item.big ? sm * 1.08 : sm * 0.98);
        ctx.fillStyle = color(item.token ?? 'xr-panel-text');
        for (const ln of wrap(ctx, item.text, W - 2 * pad)) { if (y + sm * 1.2 > Hh - pad) return; ctx.fillText(ln, pad, y); y += sm * 1.24; }
        y += sm * 0.45;
      }
      return;
    }
    // legend: you (plain bar), the neighbors (hatched bar)
    ctx.textAlign = 'right';
    let lx = W - pad;
    for (const [label, token, hatch] of [[t(narrow ? 'bricksThem' : 'bricksWho_winter'), 'xr-bricks-neighbor', true], [t('bricksYou'), 'xr-bricks-you', false]]) {
      ctx.font = font('bold', sm * 0.9);
      ctx.fillStyle = color('xr-panel-text');
      ctx.fillText(label, lx, pad + sm * 0.6);
      lx -= ctx.measureText(label).width + sm * 0.4;
      scoreBar(ctx, lx - sm * 1.4, pad + sm * 0.3, sm * 1.4, sm * 0.6, 1, token, hatch);
      lx -= sm * 2.0;
    }
    ctx.textAlign = 'left';
    const nameW = p.m(narrow ? 0.36 : kind === 'wide' ? 0.56 : 0.58);
    const barW = narrow ? W - 2 * pad - nameW - sm * 1.9 : p.m(kind === 'wide' ? 0.5 : 0.5);
    const barH = sm * (narrow ? 0.5 : 0.62);
    const rowH = barH * 2 + sm * (narrow ? 0.85 : 0.95);
    const bars = (row, k, x, yy) => {
      for (const [res, token, hatch] of [[s.me, 'xr-bricks-you', false], [s.them, 'xr-bricks-neighbor', true]]) {
        const v = row < 0 ? res.total : res.rows[row].score;
        scoreBar(ctx, x, yy, barW, barH, (v / 100) * k, token, hatch);
        ctx.font = font('black', sm * 0.92);
        ctx.fillStyle = color('xr-panel-text');
        ctx.fillText(String(Math.round(v * k)), x + barW + sm * 0.35, yy + barH / 2 + sm * 0.04);
        yy += barH + sm * 0.22;
      }
    };
    const now = Math.min(s.me.rows.length - 1, Math.floor(s.shown - 0.001));
    s.me.rows.forEach((r, i) => {
      const k = Math.max(0, Math.min(1, (s.shown - i) * 2.2));
      if (s.shown > i) {
        // the row being revealed stands out
        if (i === now && s.shown < s.me.rows.length) { ctx.fillStyle = color('xr-bricks-row-now'); roundRect(ctx, pad * 0.4, y - sm * 0.15, W - pad * 0.8, rowH - sm * 0.1, sm * 0.4); ctx.fill(); }
        ctx.font = font('black', sm * (narrow ? 0.95 : 1));
        ctx.fillStyle = color('xr-panel-text');
        const name = narrow ? t(`bricksCritShort_${r.key}`) : t(`bricksCrit_${r.key}`);
        ctx.fillText(name, pad, y + rowH / 2 - sm * 0.25);
        if (r.key === 'people') {
          ctx.font = font('bold', sm * 0.8);
          ctx.fillStyle = color('xr-warning');
          ctx.fillText(t('bricksDouble'), pad, y + rowH / 2 + sm * 0.62);
        }
        bars(i, k, pad + nameW, y + sm * 0.2);
        if (!narrow) {
          const rx = pad + nameW + barW + sm * 2.4;
          const rw = W - rx - pad;
          ctx.font = font('regular', sm * 0.92);
          ctx.fillStyle = color('xr-panel-text');
          ctx.fillText(fitText(ctx, whyText(r.why), rw), rx, y + sm * 0.2 + barH / 2);
          ctx.fillStyle = color('xr-bricks-neighbor');
          ctx.fillText(fitText(ctx, whyText(s.them.rows[i].why), rw), rx, y + sm * 0.2 + barH * 1.5 + sm * 0.22);
        }
      }
      y += rowH;
    });
    // the total
    const done = s.shown >= s.me.rows.length;
    const k = Math.max(0, Math.min(1, (s.shown - s.me.rows.length) * 1.6));
    ctx.strokeStyle = color('xr-panel-border');
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - pad, y); ctx.stroke();
    y += sm * 0.35;
    if (done) {
      ctx.font = font('black', md * 0.85);
      ctx.fillStyle = color('xr-panel-text');
      ctx.fillText(t('bricksTotal'), pad, y + rowH / 2 - sm * 0.1);
      bars(-1, k, pad + nameW, y + sm * 0.2);
    }
    const final = s.shown >= s.me.rows.length + 1;
    const win = s.me.total > s.them.total;
    if (!narrow) {
      if (final) {
        const rx = pad + nameW + barW + sm * 2.4;
        ctx.font = font('black', md * 0.8);
        ctx.fillStyle = color(win ? 'xr-success' : s.me.total === s.them.total ? 'xr-warning' : 'xr-bricks-neighbor');
        for (const [j, ln] of wrap(ctx, s.verdict, W - rx - pad).slice(0, 2).entries()) ctx.fillText(ln, rx, y + sm * 0.7 + j * md * 0.95);
      }
      return;
    }
    // narrow: one box at the bottom with the reasons of the row being revealed, then the verdict
    y += rowH + sm * 0.1;
    ctx.textBaseline = 'top';
    if (final) {
      ctx.font = font('black', sm * 1.05);
      ctx.fillStyle = color(win ? 'xr-success' : s.me.total === s.them.total ? 'xr-warning' : 'xr-bricks-neighbor');
      for (const ln of wrap(ctx, s.verdict, W - 2 * pad).slice(0, 3)) { ctx.fillText(ln, pad, y); y += sm * 1.25; }
    } else if (now >= 0 && !done) {
      ctx.font = font('bold', sm * 0.95);
      for (const [res, token, who] of [[s.me, 'xr-panel-text', t('bricksYou')], [s.them, 'xr-bricks-neighbor', t('bricksThem')]]) {
        ctx.fillStyle = color(token);
        for (const ln of wrap(ctx, `${who}: ${whyText(res.rows[now].why)}`, W - 2 * pad).slice(0, 2)) { ctx.fillText(ln, pad, y); y += sm * 1.18; }
      }
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
export const tagFont = (px) => font('black', px);
