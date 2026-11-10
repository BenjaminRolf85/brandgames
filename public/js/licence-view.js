// AI licence views for the 3D menu: the badge grid and the certificate card (QR code, short
// address and a six-character code to type on the phone after the headset is off).
import * as THREE from 'three';
import { Button, Panel, textPanel, measureBlocks, placeOnArc } from './ui3d.js';
import { layoutRow } from './scene.js';
import { color, num } from './tokens.js';
import { t, L } from './i18n.js';
import { drawIcon } from './icons.js';
import { BADGES, earnedBadges, certificateCode, certificateURL, certificateShortURL, prettyCode } from './badges.js';
import { drawQR } from './qr.js';

const MEDAL = 0.075;

function tileBlocks(b, earned) {
  return [
    { text: L(b.name), size: 'xr-text-sm', weight: 'black', color: color(earned ? 'xr-panel-text' : 'xr-panel-muted'), gap: 0.006 },
    { text: earned ? t('badgeEarned') : L(b.how), size: 'xr-text-sm', weight: earned ? 'bold' : 'regular', color: color(earned ? 'xr-success' : 'xr-panel-muted') },
  ];
}

/** A round medal with the game icon: gold when earned, a dashed outline when not yet. */
export function drawMedal(ctx, p, icon, cx, cy, r, earned) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  if (earned) {
    ctx.fillStyle = color('xr-badge-soft');
    ctx.fill();
    ctx.lineWidth = p.m(0.004);
    ctx.strokeStyle = color('xr-badge');
  } else {
    ctx.setLineDash([p.m(0.008), p.m(0.006)]);
    ctx.lineWidth = p.m(0.0025);
    ctx.strokeStyle = color('xr-badge-locked');
  }
  ctx.stroke();
  ctx.restore();
  drawIcon(ctx, icon, cx, cy, r * 1.15, color(earned ? 'xr-badge' : 'xr-badge-locked'));
}

const TILE_PAD = () => num('xr-padding') * 0.7;
const MEDAL_ROW = () => MEDAL + TILE_PAD() * 1.4;

/** Height a badge tile needs: medal on top, name and how-to below. */
const tileHeight = (b, earned, w) => MEDAL_ROW() + measureBlocks(tileBlocks(b, earned), w, TILE_PAD()) - TILE_PAD();

function badgeTile(b, earned, w, h) {
  const pad = TILE_PAD();
  return new Panel(w, h, (ctx, p) => {
    p.surface({ stroke: color(earned ? 'xr-badge' : 'xr-panel-border'), strokeWidth: num('xr-border-width') * (earned ? 1.5 : 1), stripe: false });
    drawMedal(ctx, p, b.game, p.m(w / 2), p.m(pad + MEDAL / 2), p.m(MEDAL / 2), earned);
    p.blocks(tileBlocks(b, earned), { y: MEDAL_ROW() - pad, h: h - MEDAL_ROW() + pad, align: 'center', valign: 'top', pad });
  });
}

/** Badge grid with a counter and the way to the certificate. */
export function showLicence(scene, { top, onBack }) {
  const { dist } = scene;
  const earned = earnedBadges();
  let y = top;
  const head = scene.add(textPanel(1.2, 0.1, [
    { text: t('licence'), size: 'xr-text-lg', weight: 'black', gap: 0.008 },
    { text: `${t('licenceCount', { n: earned.size, total: BADGES.length })}  ·  ${t('licenceHint')}`, size: 'xr-text-sm', color: color('xr-panel-muted') },
  ], { layout: { align: 'left' } }));
  head.position.set(0, y - head.h / 2, -dist);
  scene.popIn(head);
  y -= head.h + 0.025;

  const narrow = scene.app.host?.narrow;
  const per = narrow ? 2 : 4;
  const w = narrow ? 0.44 : 0.31;
  const gap = 0.02;
  const h = Math.max(0.14, ...BADGES.map((b) => tileHeight(b, earned.has(b.id), w)));
  BADGES.forEach((b, i) => {
    const row = Math.floor(i / per);
    const inRow = Math.min(per, BADGES.length - row * per);
    const k = i % per;
    const tile = scene.add(badgeTile(b, earned.has(b.id), w, h));
    if (narrow) tile.position.set((k - (inRow - 1) / 2) * (w + gap), y - row * (h + gap) - h / 2, -dist);
    else placeOnArc(tile, ((k - (inRow - 1) / 2) * (w + gap)) / dist, y - row * (h + gap) - h / 2, dist);
    scene.popIn(tile, 0.04 + i * 0.03);
  });
  y -= Math.ceil(BADGES.length / per) * (h + gap) + 0.015;

  const buttons = [
    new Button(0.48, 0.12, { label: t('certificate'), variant: 'sponsor', onClick: () => { scene.clearLayer(); certificateCard(scene, { top, onBack: () => { scene.clearLayer(); showLicence(scene, { top, onBack }); } }); } }),
    new Button(0.3, 0.12, { label: t('back'), onClick: onBack }),
  ];
  layoutRow(buttons, y - 0.06, -dist, 0.03);
  buttons.forEach((b, i) => { scene.add(b); scene.popIn(b, 0.3 + i * 0.05); });
}

/** Square QR code panel (crisp modules: nearest filtering). */
export function qrPanel(text, size = 0.34) {
  const p = new Panel(size, size, (ctx, c) => drawQR(ctx, text, 0, 0, c.canvas.width, color('xr-qr-dark'), color('xr-qr-light')));
  p.texture.magFilter = THREE.NearestFilter;
  p.texture.needsUpdate = true;
  return p;
}

/** QR code, short address and code; also used on the event results screen. Returns { bottom, card }. */
export function certificateCard(scene, { top, onBack = null, extra = [] }) {
  const { dist } = scene;
  const code = certificateCode();
  const earned = earnedBadges();
  const narrow = scene.app.host?.narrow;
  const qr = scene.add(qrPanel(certificateURL(code), 0.34));
  const info = scene.add(textPanel(narrow ? 0.7 : 0.66, 0.34, [
    { text: t('certificate'), size: 'xr-text-lg', weight: 'black', gap: 0.012 },
    { text: t('certScan'), size: 'xr-text-sm', color: color('xr-panel-muted'), gap: 0.02 },
    { text: t('certAddress'), size: 'xr-text-sm', weight: 'bold', color: color('xr-panel-muted'), gap: 0.004 },
    { text: certificateShortURL(), size: 'xr-text-md', weight: 'black', color: color('xr-accent'), gap: 0.016 },
    { text: t('certCode'), size: 'xr-text-sm', weight: 'bold', color: color('xr-panel-muted'), gap: 0.004 },
    { text: prettyCode(code), size: 'xr-text-title', weight: 'black', color: color('xr-badge'), gap: 0.012 },
    { text: t('licenceCount', { n: earned.size, total: BADGES.length }), size: 'xr-text-sm', weight: 'bold' },
  ], { layout: { align: 'left' } }));
  let bottom;
  if (narrow) {
    qr.position.set(0, top - qr.h / 2, -dist);
    info.position.set(0, top - qr.h - 0.025 - info.h / 2, -dist);
    bottom = info.position.y - info.h / 2;
  } else {
    const total = qr.w + 0.03 + info.w;
    qr.position.set(-total / 2 + qr.w / 2, top - qr.h / 2, -dist);
    info.position.set(total / 2 - info.w / 2, top - info.h / 2, -dist);
    bottom = top - Math.max(qr.h, info.h);
  }
  scene.popIn(qr);
  scene.popIn(info, 0.06);
  const buttons = [...extra, ...(onBack ? [new Button(0.3, 0.12, { label: t('back'), onClick: onBack })] : [])];
  if (buttons.length) {
    layoutRow(buttons, bottom - 0.035 - 0.06, -dist, 0.03);
    buttons.forEach((b, i) => { scene.add(b); scene.popIn(b, 0.15 + i * 0.05); });
    bottom -= 0.035 + 0.12;
  }
  return { bottom, card: info };
}
