// Campaign Pinball: the printed playfield art, calm on purpose (the 3D world above it is the
// show): a deep navy base with a fine city plan in thin lines, a river and the park as soft
// tints, a few line drawings (the head office, branches, speech bubbles, coins), red pinstripes
// and the title ribbon above the drain. Drawn at runtime from tokens; the inserts, lane names
// and arrows are drawn on top by pinball-visuals.js and pinball-details.js.
import { color, font } from './tokens.js';
import { t } from './i18n.js';
import { ARC, GUIDE_X, LANE_Y } from './pinball-layout.js';

/** Draws the base art onto ctx. X, Y: field -> canvas, M: meters -> pixels. */
export function drawCity(ctx, { X, Y, M, W, H }) {
  const path = (pts) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
  };
  // Base: navy, a little lighter towards the middle.
  const g = ctx.createRadialGradient(X(0.02), Y(0.55), M(0.05), X(0.02), Y(0.55), M(0.8));
  g.addColorStop(0, color('xr-pinball-field'));
  g.addColorStop(1, color('xr-pinball-field-2'));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // The city plan: fine street lines (a slightly turned grid) and block outlines.
  ctx.save();
  ctx.strokeStyle = color('xr-pinball-plan');
  ctx.lineWidth = M(0.0016);
  for (let y = -0.05; y < 1.32; y += 0.06) {
    path([[-0.3, y], [0.35, y + 0.025]]);
    ctx.stroke();
  }
  for (let x = -0.3; x < 0.36; x += 0.06) {
    path([[x, -0.05], [x - 0.04, 1.32]]);
    ctx.stroke();
  }
  ctx.lineWidth = M(0.004);
  for (const pts of [[[-0.3, 0.13], [0.35, 0.19]], [[-0.3, 0.63], [0.35, 0.57]], [[-0.3, 1.0], [0.35, 1.05]], [[-0.18, -0.05], [-0.06, 1.3]], [[0.2, -0.05], [0.08, 1.3]]]) {
    path(pts);
    ctx.stroke();
  }
  ctx.restore();
  // River and park as soft tints with a fine outline.
  const river = [];
  for (let i = 0; i <= 40; i++) {
    const u = i / 40;
    river.push([-0.3 + u * 0.65, 0.9 - u * 0.5 + Math.sin(u * 7) * 0.035]);
  }
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = color('xr-pinball-plan-light');
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = M(0.032);
  path(river);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color('xr-pinball-field-2');
  ctx.lineWidth = M(0.028);
  path(river);
  ctx.stroke();
  ctx.setLineDash([M(0.012), M(0.012)]);
  ctx.strokeStyle = color('xr-pinball-plan-light');
  ctx.lineWidth = M(0.0012);
  path(river);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.fillStyle = color('xr-pinball-park');
  ctx.globalAlpha = 0.28;
  ctx.beginPath();
  ctx.ellipse(X(0), Y(0.72), M(0.16), M(0.12), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = color('xr-pinball-park');
  ctx.lineWidth = M(0.0015);
  ctx.stroke();
  // Trees as small line circles.
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(X(Math.cos(a) * 0.14), Y(0.72 + Math.sin(a) * 0.1), M(0.006), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  // The plaza around the advertising column: two rings and spokes.
  ctx.save();
  ctx.strokeStyle = color('xr-pinball-plan-light');
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = M(0.0014);
  for (const r of [0.045, 0.09]) {
    ctx.beginPath();
    ctx.arc(X(0), Y(0.5), M(r), 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    path([[Math.cos(a) * 0.045, 0.5 + Math.sin(a) * 0.045], [Math.cos(a) * 0.09, 0.5 + Math.sin(a) * 0.09]]);
    ctx.stroke();
  }
  ctx.restore();
  // A few line drawings in light ink: branches, speech bubbles, coins.
  const ink = (fn, alpha = 0.5) => {
    ctx.save();
    ctx.strokeStyle = color('xr-pinball-plan-light');
    ctx.fillStyle = color('xr-pinball-plan-light');
    ctx.globalAlpha = alpha;
    ctx.lineWidth = M(0.0014);
    ctx.lineJoin = 'round';
    fn();
    ctx.restore();
  };
  const house = (x, y, s) => ink(() => {
    path([[x - s, y], [x - s, y + s * 1.1], [x, y + s * 1.8], [x + s, y + s * 1.1], [x + s, y], [x - s, y]]);
    ctx.stroke();
    ctx.strokeRect(X(x - s * 0.25), Y(y + s * 0.6), M(s * 0.5), M(s * 0.6));
  });
  const bubble = (x, y, r, text) => ink(() => {
    ctx.beginPath();
    ctx.ellipse(X(x), Y(y), M(r * 1.3), M(r), 0, 0, Math.PI * 2);
    ctx.stroke();
    path([[x - r * 0.4, y - r * 0.85], [x - r * 0.9, y - r * 1.5], [x - r * 0.05, y - r * 0.98]]);
    ctx.stroke();
    ctx.font = font('black', M(r * 1.1));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, X(x), Y(y));
  });
  const coin = (x, y, r) => ink(() => {
    ctx.beginPath();
    ctx.arc(X(x), Y(y), M(r), 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(X(x), Y(y), M(r * 0.65), 0, Math.PI * 2);
    ctx.stroke();
  });
  house(-0.215, 0.33, 0.012);
  house(0.215, 0.6, 0.01);
  house(-0.05, 0.86, 0.008);
  bubble(-0.205, 0.94, 0.012, '@');
  bubble(0.17, 0.95, 0.011, '#');
  bubble(0.11, 0.42, 0.008, '+1');
  coin(-0.07, 0.42, 0.008);
  coin(-0.085, 0.44, 0.006);
  coin(0.18, 0.7, 0.007);
  // The town behind the arch: a paved square for the buildings, and the van's road.
  ink(() => {
    for (let k = 0; k < 9; k++) {
      path([[-0.26, 1.08 + k * 0.02], [0.31, 1.08 + k * 0.02]]);
      ctx.stroke();
    }
  }, 0.25);
  ctx.save();
  ctx.fillStyle = color('xr-pinball-street');
  ctx.fillRect(X(-0.27), Y(1.268), M(0.6), M(0.026));
  ctx.setLineDash([M(0.008), M(0.008)]);
  ctx.strokeStyle = color('xr-pinball-street-line');
  ctx.lineWidth = M(0.0014);
  path([[-0.27, 1.255], [0.33, 1.255]]);
  ctx.stroke();
  ctx.restore();
  // Behind the flippers: soft rays in two navy tones with red edges, and the title ribbon.
  ctx.save();
  const cx = X(0);
  const cy = Y(0.04);
  for (let k = 0; k < 18; k++) {
    const a0 = Math.PI + (k / 18) * Math.PI;
    ctx.fillStyle = color(k % 2 ? 'xr-pinball-field' : 'xr-pinball-plan');
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, M(0.2), a0, a0 + Math.PI / 18);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = color('xr-pinball-accent');
  ctx.lineWidth = M(0.0022);
  ctx.beginPath();
  ctx.arc(cx, cy, M(0.2), Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
  ctx.save();
  ctx.translate(X(0), Y(0.085));
  const bw = M(0.17);
  const bh = M(0.03);
  ctx.fillStyle = color('xr-pinball-accent');
  ctx.beginPath();
  ctx.moveTo(-bw / 2 - bh * 0.6, -bh * 0.25);
  ctx.lineTo(-bw / 2, -bh * 0.5);
  ctx.lineTo(bw / 2, -bh * 0.5);
  ctx.lineTo(bw / 2 + bh * 0.6, -bh * 0.25);
  ctx.lineTo(bw / 2 + bh * 0.2, bh * 0.15);
  ctx.lineTo(bw / 2 + bh * 0.6, bh * 0.55);
  ctx.lineTo(bw / 2, bh * 0.5);
  ctx.lineTo(-bw / 2, bh * 0.5);
  ctx.lineTo(-bw / 2 - bh * 0.6, bh * 0.55);
  ctx.lineTo(-bw / 2 - bh * 0.2, bh * 0.15);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = color('xr-pinball-white');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let px = bh * 0.62;
  ctx.font = font('black', px);
  const title = t('pinballName').toUpperCase();
  while (ctx.measureText(title).width > bw * 0.95 && px > 8) { px -= 1; ctx.font = font('black', px); }
  ctx.fillText(title, 0, bh * 0.04);
  ctx.restore();
}

/** Clean shot arrows with names, the arch's dashed line and red pinstripes. */
export function drawShots(ctx, { X, Y, M }) {
  const arrow = (x, y, ang, len, tok, label) => {
    ctx.save();
    ctx.translate(X(x), Y(y));
    ctx.rotate(-ang);
    ctx.strokeStyle = color(tok);
    ctx.lineWidth = M(0.0018);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(M(len / 2), 0);
    ctx.lineTo(M(len / 2 - 0.014), -M(0.009));
    ctx.lineTo(M(len / 2 - 0.014), -M(0.0045));
    ctx.lineTo(-M(len / 2), -M(0.0045));
    ctx.lineTo(-M(len / 2), M(0.0045));
    ctx.lineTo(M(len / 2 - 0.014), M(0.0045));
    ctx.lineTo(M(len / 2 - 0.014), M(0.009));
    ctx.closePath();
    ctx.stroke();
    if (label) {
      ctx.fillStyle = color(tok);
      ctx.font = font('black', M(0.0062));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, -M(0.006), M(0.0002));
    }
    ctx.restore();
  };
  arrow(-0.06, 0.255, 2.05, 0.07, 'xr-pinball-ch-video', t('pinballCh_video').toUpperCase());
  arrow(0.06, 0.255, 1.09, 0.07, 'xr-pinball-ch-app', t('pinballTownHq'));
  ctx.save();
  ctx.strokeStyle = color('xr-pinball-accent');
  ctx.lineWidth = M(0.0016);
  ctx.setLineDash([M(0.005), M(0.004)]);
  ctx.beginPath();
  ctx.arc(X(ARC.x), Y(ARC.y), M(ARC.r - 0.03), Math.PI * 1.05, Math.PI * 1.95);
  ctx.stroke();
  ctx.restore();
  for (const x of GUIDE_X) {
    ctx.fillStyle = color('xr-pinball-lane-light');
    ctx.beginPath();
    ctx.arc(X(x), Y(LANE_Y[0] - 0.006), M(0.002), 0, Math.PI * 2);
    ctx.fill();
  }
}
