// "Stein auf Stein": 2D drawings on panels. The life-event card (pictogram, what happened, the
// two choices with their effect on the house, the target and the time), the AI forecast chart
// for you and the neighbors (duel bars, both savings lines in % of each target, your forecast with
// its 80 % band, the neighbors' forecast, the weather timer) and the neighbors' sign.
import { Panel, wrap, measureBlocks } from './ui3d.js';
import { color, num, font } from './tokens.js';
import { t } from './i18n.js';

// ---------- pictograms (24 x 24 line art like icons.js) ----------

const PICTO = {
  rings: 'M9 14.5a5 5 0 1 1 0-.01zM15 14.5a5 5 0 1 1 0-.01zM7.5 4.5l1.5-2 1.5 2-1.5 1.8z',
  stroller: 'M4 6h7v6H4zM11 12h7l2-6M4 12c0 2.5 2 4 4.5 4H15c2 0 3-1.5 3-4M7 20a1.6 1.6 0 1 0 0-.01zM16 20a1.6 1.6 0 1 0 0-.01z',
  briefcase: 'M3.5 8h17v11h-17zM9 8V5.5h6V8M3.5 13h17M11 12v2.5h2V12',
  hands: 'M12 20s-7-4.2-7-9.5A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.5C19 15.8 12 20 12 20zM3 15l3 3M21 15l-3 3',
  scroll: 'M6 4h11a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2zM6 4a2 2 0 0 0-2 2v2h2M9.5 9h6M9.5 12h6M9.5 15h4',
  snow: 'M12 2.5v19M3.8 7.2l16.4 9.6M3.8 16.8l16.4-9.6M9.5 4l2.5 2 2.5-2M9.5 20l2.5-2 2.5 2',
};
const cache = new Map();

export function drawPicto(ctx, key, x, y, size, stroke, width = 1.7) {
  const d = PICTO[key];
  if (!d) return;
  if (!cache.has(key)) cache.set(key, new Path2D(d));
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(size / 24, size / 24);
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke;
  ctx.stroke(cache.get(key));
  ctx.restore();
}

// ---------- the life-event card ----------

/** ev: { key, icon, options: [{ key, ... }, ...] } -> panel with both choices and their effects. */
export function eventPanel(ev, w = 0.68) {
  const pad = num('xr-padding');
  const ic = 0.12;
  const blocks = [
    { text: t('bricksEvent').toUpperCase(), size: 'xr-text-sm', weight: 'black', color: color('xr-bricks-event'), gap: 0.006 },
    { text: t(`bricksEv_${ev.key}`), size: 'xr-text-lg', weight: 'black', gap: 0.008, lineHeight: 1.15 },
    { text: t(`bricksEvSub_${ev.key}`), size: 'xr-text-sm', color: color('xr-panel-muted'), gap: 0.014 },
    ...ev.options.flatMap((o, i) => [
      { text: `${i + 1}  ${t(`bricksOpt_${o.key}`)}`, size: 'xr-text-sm', weight: 'black', color: color(i ? 'xr-bricks-opt-2' : 'xr-bricks-opt-1'), gap: 0.004 },
      { text: t(`bricksOptFx_${o.key}`), size: 'xr-text-sm', color: color('xr-panel-text'), gap: 0.012 },
    ]),
  ];
  const col = w - ic - pad * 0.6;
  const h = Math.max(measureBlocks(blocks, col, pad), ic + pad * 2);
  return new Panel(w, h, (ctx, p) => {
    p.surface({ stroke: color('xr-bricks-event'), strokeWidth: num('xr-border-width') * 1.6, stripe: false });
    const cx = p.m(pad + ic / 2);
    const cy = p.m(pad + ic / 2 + 0.01);
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = color('xr-bricks-event');
    ctx.beginPath();
    ctx.arc(cx, cy, p.m(ic / 2), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    drawPicto(ctx, ev.icon, cx, cy, p.m(ic * 0.66), color('xr-bricks-event'));
    p.blocks(blocks, { x: ic + pad * 0.6, w: col, align: 'left', valign: 'center' });
  });
}

// ---------- the neighbors' sign ----------

export function drawSign(ctx, p, s) {
  p.surface({ stroke: color('xr-bricks-neighbor'), strokeWidth: num('xr-border-width') * 1.4, stripe: false });
  const pad = p.m(0.02);
  const W = p.canvas.width;
  const md = p.m(num('xr-text-md'));
  const sm = p.m(num('xr-text-sm'));
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = color('xr-bricks-neighbor');
  ctx.font = font('black', md);
  ctx.fillText(t('bricksNeighbors'), pad, pad);
  ctx.fillStyle = color('xr-panel-muted');
  ctx.font = font('bold', sm);
  ctx.fillText(t(`bricksStyle_${s.style}`), pad, pad + md * 1.2);
  ctx.textAlign = 'right';
  ctx.fillStyle = color('xr-panel-text');
  ctx.font = font('black', md);
  ctx.fillText(s.done ? t('bricksNeighborsDone') : `${Math.round(s.share * 100)} %`, W - pad, pad);
}

// ---------- the AI forecast chart ----------

function bar(ctx, x, y, w, h, share, fill) {
  ctx.fillStyle = color('xr-bricks-chart-grid');
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.roundRect(x, y, Math.max(h, w * Math.min(1, share)), h, h / 2);
  ctx.fill();
}

/**
 * The forecast panel. s: { month, frac, snowAt, roofOn, you: { share, history (% at month ends),
 * pred, path(h) -> { mid, lo, hi } in %, done, doneMonth }, them: { share, history, pred, done,
 * doneMonth, name }, note, marks, narrow }
 */
export function drawChart(ctx, p, s) {
  p.surface({ stroke: color('xr-bricks-chart-band-edge'), stripe: false });
  const W = p.canvas.width;
  const Hc = p.canvas.height;
  const pad = p.m(0.028);
  const sm = p.m(num('xr-text-sm'));
  const md = p.m(num('xr-text-md'));
  ctx.textBaseline = 'top';
  // Title, month and the weather timer.
  ctx.textAlign = 'left';
  ctx.fillStyle = color('xr-panel-text');
  ctx.font = font('black', md);
  ctx.fillText(t('bricksChartTitle'), pad, pad);
  ctx.textAlign = 'right';
  const left = s.snowAt - (s.month - 1 + s.frac);
  const snowy = left <= 0;
  ctx.fillStyle = color(s.roofOn ? 'xr-success' : snowy ? 'xr-danger' : left < 6 ? 'xr-warning' : 'xr-bricks-snow-icon');
  ctx.font = font('bold', sm);
  const wtext = s.roofOn ? t('bricksRoofOn') : snowy ? t('bricksSnowNow') : t('bricksSnowIn', { n: Math.ceil(left) });
  ctx.fillText(wtext, W - pad, pad + (md - sm) * 0.5);
  const tw = ctx.measureText(wtext).width;
  drawPicto(ctx, 'snow', W - pad - tw - sm * 0.75, pad + (md - sm) * 0.5 + sm * 0.5, sm * 1.1, ctx.fillStyle, 2);
  let y = pad + md * 1.4;
  // Duel: you and the neighbors, with each forecast month.
  const fmtM = (who) => (who.done ? t('bricksChartReached', { m: who.doneMonth }) : who.pred && Number.isFinite(who.pred.median) && s.month > 2 ? t('bricksChartIn', { m: who.pred.median > 60 ? '60+' : Math.ceil(who.pred.median) }) : '…');
  const rows = [[t('bricksYou'), s.you, 'xr-bricks-chart-saved'], [s.them.name, s.them, 'xr-bricks-neighbor']];
  ctx.font = font('bold', sm);
  const lw = Math.max(...rows.map(([n]) => ctx.measureText(n).width)) + sm * 0.5;
  const rw = Math.max(ctx.measureText(t('bricksChartIn', { m: 88 })).width, ctx.measureText(t('bricksChartReached', { m: 88 })).width) + sm * 0.4;
  for (const [name, who, token] of rows) {
    ctx.textAlign = 'left';
    ctx.fillStyle = color(token);
    ctx.fillText(name, pad, y);
    bar(ctx, pad + lw, y + sm * 0.22, W - pad * 2 - lw - rw, sm * 0.62, who.share, color(token));
    ctx.textAlign = 'right';
    ctx.fillStyle = color('xr-panel-text');
    ctx.fillText(fmtM(who), W - pad, y);
    y += sm * 1.3;
  }
  // Your 80 % range.
  const pr = s.you.pred;
  ctx.textAlign = 'left';
  ctx.fillStyle = color('xr-bricks-chart-forecast');
  ctx.font = font('bold', sm);
  let sub;
  if (s.you.done) sub = s.verdict ?? '';
  else if (pr && s.month > 2) sub = Number.isFinite(pr.hi) ? t(s.narrow ? 'bricksChartRangeShort' : 'bricksChartRange', { lo: Math.ceil(pr.lo), hi: Math.ceil(pr.hi) }) : t('bricksChartOpen', { lo: Math.ceil(pr.lo) });
  else sub = t('bricksChartWait');
  for (const ln of wrap(ctx, sub, W - pad * 2).slice(0, s.narrow && !s.you.done ? 1 : 2)) { ctx.fillText(ln, pad, y); y += sm * 1.2; }
  y += sm * 0.2;
  // Note at the bottom.
  ctx.font = font('regular', sm);
  const noteLines = s.note ? wrap(ctx, s.note, W - pad * 2).slice(0, s.narrow ? 2 : 3) : [];
  const noteH = noteLines.length * sm * 1.22;
  const axisH = sm * 1.25;
  const x0 = pad + sm * 1.9;
  const x1 = W - pad;
  const yTop = y + sm * 0.5;
  const yBot = Hc - pad - noteH - axisH - (noteLines.length ? sm * 0.3 : 0);
  if (yBot - yTop > sm * 1.5) {
    const hiM = Math.max(pr && Number.isFinite(pr.hi) && !s.you.done ? pr.hi : 0, s.them.pred && !s.them.done ? Math.min(60, s.them.pred.median) : 0, s.month + 2, s.snowAt + 1);
    const maxM = Math.min(60, Math.ceil(hiM / 6) * 6);
    const X = (m) => x0 + (Math.min(m, maxM) / maxM) * (x1 - x0);
    const Y = (v) => yBot - (Math.max(0, Math.min(v, 115)) / 115) * (yBot - yTop);
    ctx.strokeStyle = color('xr-bricks-chart-grid');
    ctx.lineWidth = p.m(0.0015);
    for (let m = 6; m < maxM; m += 6) { ctx.beginPath(); ctx.moveTo(X(m), yTop); ctx.lineTo(X(m), yBot); ctx.stroke(); }
    // First snow: a cold band from that month on.
    ctx.fillStyle = color('xr-bricks-chart-snow');
    ctx.fillRect(X(s.snowAt), yTop, x1 - X(s.snowAt), yBot - yTop);
    ctx.strokeStyle = color('xr-bricks-chart-axis');
    ctx.lineWidth = p.m(0.002);
    ctx.beginPath();
    ctx.moveTo(x0, yTop);
    ctx.lineTo(x0, yBot);
    ctx.lineTo(x1, yBot);
    ctx.stroke();
    ctx.fillStyle = color('xr-panel-muted');
    ctx.font = font('regular', sm * 0.95);
    ctx.textAlign = 'center';
    for (let m = 0; m <= maxM; m += 12) ctx.fillText(String(m), Math.min(X(m), x1 - sm), yBot + sm * 0.15);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillText('100', x0 - sm * 0.2, Y(100));
    ctx.fillText('0', x0 - sm * 0.2, yBot - sm * 0.3);
    ctx.textBaseline = 'top';
    ctx.strokeStyle = color('xr-bricks-chart-target');
    ctx.lineWidth = p.m(0.003);
    ctx.setLineDash([p.m(0.012), p.m(0.008)]);
    ctx.beginPath();
    ctx.moveTo(x0, Y(100));
    ctx.lineTo(x1, Y(100));
    ctx.stroke();
    ctx.setLineDash([]);
    const now = s.month - 1 + s.frac;
    // Your band and forecast.
    if (pr && !s.you.done && s.you.path) {
      const end = Math.min(maxM, Number.isFinite(pr.hi) ? pr.hi + 1 : maxM);
      const up = [];
      const lo = [];
      for (let i = 0; i <= 30; i++) {
        const m = now + ((end - now) * i) / 30;
        const q = s.you.path(m - now);
        up.push([X(m), Y(q.hi)]);
        lo.push([X(m), Y(q.lo)]);
      }
      ctx.fillStyle = color('xr-bricks-chart-band');
      ctx.beginPath();
      up.forEach(([x, yy], i) => (i ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy)));
      for (let i = lo.length - 1; i >= 0; i--) ctx.lineTo(lo[i][0], lo[i][1]);
      ctx.closePath();
      ctx.fill();
    }
    const series = (who, token, forecastToken) => {
      ctx.strokeStyle = color(token);
      ctx.lineWidth = p.m(0.004);
      ctx.lineJoin = 'round';
      ctx.beginPath();
      who.history.forEach((v, m) => (m ? ctx.lineTo(X(m), Y(v)) : ctx.moveTo(X(m), Y(v))));
      if (!who.done) ctx.lineTo(X(now), Y(who.share * 100));
      ctx.stroke();
      if (!who.done && who.pred && Number.isFinite(who.pred.median) && s.month > 2) {
        ctx.strokeStyle = color(forecastToken);
        ctx.lineWidth = p.m(0.003);
        ctx.setLineDash([p.m(0.01), p.m(0.007)]);
        ctx.beginPath();
        ctx.moveTo(X(now), Y(who.share * 100));
        ctx.lineTo(X(who.pred.median), Y(100));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = color(forecastToken);
        ctx.beginPath();
        ctx.arc(X(who.pred.median), Y(100), p.m(0.008), 0, Math.PI * 2);
        ctx.fill();
      }
    };
    series(s.them, 'xr-bricks-neighbor', 'xr-bricks-neighbor');
    series(s.you, 'xr-bricks-chart-saved', 'xr-bricks-chart-forecast');
    for (const mk of s.marks) {
      ctx.fillStyle = color(mk.kind === 'spend' ? 'xr-bricks-chart-spend' : mk.kind === 'gold' ? 'xr-bricks-chart-gold' : 'xr-bricks-event');
      ctx.beginPath();
      ctx.arc(X(mk.m), Y(mk.v), p.m(mk.kind === 'event' ? 0.008 : 0.006), 0, Math.PI * 2);
      ctx.fill();
    }
    if (!s.you.done) {
      ctx.fillStyle = color('xr-panel-text');
      ctx.beginPath();
      ctx.arc(X(now), Y(s.you.share * 100), p.m(0.007), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = color('xr-panel-text');
  ctx.font = font('regular', sm);
  noteLines.forEach((ln, i) => ctx.fillText(ln, pad, Hc - pad - noteH + i * sm * 1.22));
}
