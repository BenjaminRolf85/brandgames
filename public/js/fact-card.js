// Fact card for the Echomotion gold coins (Echo Parkour, Datenflug): a drawn coin with the E,
// "coin n of 12", the title and the text of the fact.
import { Panel, measureBlocks } from './ui3d.js';
import { color, num, font } from './tokens.js';
import { t, L } from './i18n.js';

/** Fact card: a drawn coin, "coin n of 12", the title and the text. */
export function factCard(n, total, fact, w) {
  const pad = num('xr-padding');
  const coin = 0.075;
  const col = coin + pad * 0.5;
  const blocks = [
    { text: t('parkourCoin', { n, total }), size: 'xr-text-sm', weight: 'bold', color: color('xr-panel-muted'), gap: 0.006 },
    { text: L(fact.title), size: 'xr-text-md', weight: 'black', color: color('xr-parkour-coin'), gap: 0.01 },
    { text: L(fact.text), size: 'xr-text-sm', color: color('xr-panel-text') },
  ];
  const h = Math.max(0.14, measureBlocks(blocks, w - col, pad));
  return new Panel(w, h, (ctx, p) => {
    p.surface({ stroke: color('xr-parkour-coin'), strokeWidth: num('xr-border-width') * 1.5, stripe: false });
    const cx = p.m(pad + coin / 2);
    const cy = p.m(pad + coin / 2);
    const r = p.m(coin / 2);
    ctx.fillStyle = color('xr-parkour-coin');
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color('xr-parkour-back');
    ctx.lineWidth = p.m(0.004);
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.74, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = color('xr-parkour-back');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font('black', Math.round(r * 1.05));
    ctx.fillText('E', cx, cy + r * 0.05);
    p.blocks(blocks, { x: col, w: w - col, align: 'left', valign: 'top', pad });
  });
}
