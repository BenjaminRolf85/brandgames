// Campaign Pinball: the printed playfield art. A whole town seen from above, in saturated
// colors: districts of rooftops, a river with bridges, streets with crosswalks and cars, a park
// with a pond, the plaza around the advertising column, people, speech bubbles with icons, tag
// signs, campaign sketches, shot arrows with names, starbursts around the flippers and the
// title banner above the drain. Everything is drawn at runtime from tokens into one canvas
// (the inserts and labels are drawn on top of it by pinball-visuals.js).
import { color, font } from './tokens.js';
import { t } from './i18n.js';
import { ARC, GUIDE_X, LANE_Y } from './pinball-layout.js';
import { drawGlyph } from './pinball-visuals.js';

const DISTRICTS = [1, 2, 3, 4, 5, 6].map((i) => `xr-pinball-district-${i}`);

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** Draws the town onto ctx. X, Y: field -> canvas, M: meters -> pixels. */
export function drawCity(ctx, { X, Y, M, W, H, table }) {
  const rnd = mulberry(7);
  const path = (pts) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(X(x), Y(y)) : ctx.moveTo(X(x), Y(y))));
  };
  // Ground.
  ctx.fillStyle = color('xr-pinball-ground');
  ctx.fillRect(0, 0, W, H);
  // City blocks: larger districts in one color each; per block a few buildings seen from above
  // (a dark facade below the roof, the roof in the district's color, rooftop details), now and
  // then a parking lot or a small square.
  const zone = (x, y) => DISTRICTS[(Math.floor((x + 0.3) / 0.16) + Math.floor((y + 0.05) / 0.24) * 4 + 60) % DISTRICTS.length];
  const step = 0.064;
  for (let gy = -0.04; gy < 1.3; gy += step) {
    const row = Math.round(gy / step);
    for (let gx = -0.3; gx < 0.34; gx += step) {
      const x = gx + ((row % 2) * step) / 2;
      const wide = rnd() < 0.25;
      const bw = (wide ? 2 * step : step) - 0.014;
      const bh = step - 0.014;
      if (wide) gx += step;
      const tok = zone(x + bw / 2, gy + bh / 2);
      ctx.save();
      // Sidewalk / block ground.
      ctx.fillStyle = color(tok);
      ctx.globalAlpha = 0.28;
      ctx.beginPath();
      ctx.roundRect(X(x), Y(gy + bh), M(bw), M(bh), M(0.004));
      ctx.fill();
      const kind = rnd();
      if (kind < 0.1) {
        // Parking lot.
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = color('xr-pinball-street');
        ctx.fillRect(X(x + 0.003), Y(gy + bh - 0.003), M(bw - 0.006), M(bh - 0.006));
        ctx.strokeStyle = color('xr-pinball-white');
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = M(0.0008);
        for (let k = 0.008; k < bw - 0.006; k += 0.008) {
          ctx.beginPath();
          ctx.moveTo(X(x + k), Y(gy + bh - 0.004));
          ctx.lineTo(X(x + k), Y(gy + bh * 0.62));
          ctx.stroke();
        }
        ctx.restore();
        continue;
      }
      const n = wide ? 3 + Math.floor(rnd() * 3) : 1 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        const rw = Math.min(bw - 0.006, (wide ? bw / n : bw) * (0.55 + rnd() * 0.4));
        const rh = bh * (0.4 + rnd() * 0.5);
        const rx = x + 0.003 + (wide ? (k * (bw - 0.006)) / n : rnd() * (bw - rw - 0.006));
        const ry = gy + 0.003 + rnd() * (bh - rh - 0.006);
        // Facade (the building's south side, in shadow) and the roof above it.
        ctx.globalAlpha = 0.75;
        ctx.fillStyle = color('xr-pinball-dark');
        ctx.fillRect(X(rx + 0.0015), Y(ry + rh - 0.004), M(rw), M(rh));
        ctx.globalAlpha = 1;
        ctx.fillStyle = color(tok);
        ctx.fillRect(X(rx), Y(ry + rh), M(rw), M(rh));
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = color(rnd() < 0.5 ? 'xr-pinball-white' : 'xr-pinball-dark');
        ctx.fillRect(X(rx + 0.0025), Y(ry + rh - 0.0025), M(rw - 0.005), M(rh - 0.005));
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = color('xr-pinball-white');
        ctx.lineWidth = M(0.0007);
        ctx.strokeRect(X(rx), Y(ry + rh), M(rw), M(rh));
        ctx.globalAlpha = 1;
        const d = rnd();
        if (d < 0.3) {
          ctx.fillStyle = color('xr-pinball-chrome');
          ctx.fillRect(X(rx + rw * 0.25), Y(ry + rh * 0.75), M(0.005), M(0.004));
          ctx.fillRect(X(rx + rw * 0.6), Y(ry + rh * 0.75), M(0.004), M(0.004));
        } else if (d < 0.5) {
          ctx.fillStyle = color('xr-pinball-tree-light');
          ctx.beginPath();
          ctx.roundRect(X(rx + rw * 0.2), Y(ry + rh * 0.8), M(rw * 0.6), M(rh * 0.6), M(0.002));
          ctx.fill();
        } else if (d < 0.68) {
          ctx.strokeStyle = color('xr-pinball-river-deep');
          ctx.lineWidth = M(0.0012);
          for (let q = 0; q < 4; q++) {
            ctx.beginPath();
            ctx.moveTo(X(rx + 0.003), Y(ry + rh * (0.2 + q * 0.18)));
            ctx.lineTo(X(rx + rw - 0.003), Y(ry + rh * (0.2 + q * 0.18)));
            ctx.stroke();
          }
        } else if (d < 0.78) {
          ctx.fillStyle = color('xr-pinball-white');
          ctx.font = font('black', M(Math.min(rw, rh) * 0.5));
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('H', X(rx + rw / 2), Y(ry + rh / 2));
        }
      }
      ctx.restore();
    }
  }
  // Streets between the blocks (horizontal rows) and diagonal avenues, dashed center lines.
  const street = (pts, wid, dash = true) => {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color('xr-pinball-street');
    ctx.lineWidth = M(wid);
    path(pts);
    ctx.stroke();
    if (dash) {
      ctx.setLineDash([M(0.007), M(0.007)]);
      ctx.strokeStyle = color('xr-pinball-street-line');
      ctx.lineWidth = M(0.0016);
      path(pts);
      ctx.stroke();
    }
    ctx.restore();
  };
  street([[-0.3, 0.12], [0.35, 0.2]], 0.018);
  street([[-0.3, 0.62], [0.35, 0.56]], 0.016);
  street([[-0.3, 0.98], [0.35, 1.04]], 0.016);
  street([[-0.18, -0.05], [-0.06, 1.3]], 0.014);
  street([[0.2, -0.05], [0.08, 1.3]], 0.014);
  // The river with its banks and two bridges.
  const river = [];
  for (let i = 0; i <= 40; i++) {
    const u = i / 40;
    river.push([-0.3 + u * 0.65, 0.9 - u * 0.5 + Math.sin(u * 7) * 0.035]);
  }
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = color('xr-pinball-river-bank');
  ctx.lineWidth = M(0.05);
  path(river);
  ctx.stroke();
  ctx.strokeStyle = color('xr-pinball-river-deep');
  ctx.lineWidth = M(0.04);
  path(river);
  ctx.stroke();
  ctx.strokeStyle = color('xr-pinball-river');
  ctx.lineWidth = M(0.026);
  path(river);
  ctx.stroke();
  ctx.setLineDash([M(0.01), M(0.02)]);
  ctx.strokeStyle = color('xr-pinball-white');
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = M(0.002);
  path(river);
  ctx.stroke();
  ctx.restore();
  for (const u of [0.25, 0.72]) {
    const i = Math.round(u * 40);
    const [x, y] = river[i];
    ctx.save();
    ctx.translate(X(x), Y(y));
    ctx.rotate(0.6);
    ctx.fillStyle = color('xr-pinball-bridge');
    ctx.fillRect(-M(0.012), -M(0.034), M(0.024), M(0.068));
    ctx.fillStyle = color('xr-pinball-street-line');
    for (let k = -3; k <= 3; k++) ctx.fillRect(-M(0.012), k * M(0.009), M(0.003), M(0.004));
    ctx.restore();
  }
  // The park around the pop bumpers, with a pond and paths.
  ctx.save();
  ctx.fillStyle = color('xr-pinball-park');
  ctx.beginPath();
  ctx.ellipse(X(0), Y(0.72), M(0.17), M(0.13), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color('xr-pinball-river');
  ctx.beginPath();
  ctx.ellipse(X(0.1), Y(0.66), M(0.035), M(0.022), 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color('xr-pinball-plaza');
  ctx.lineWidth = M(0.006);
  ctx.setLineDash([M(0.004), M(0.003)]);
  ctx.beginPath();
  ctx.ellipse(X(0), Y(0.72), M(0.12), M(0.085), 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  for (let i = 0; i < 70; i++) {
    const a = rnd() * Math.PI * 2;
    const r = 0.07 + rnd() * 0.1;
    const x = Math.cos(a) * r * 1.05;
    const y = 0.72 + Math.sin(a) * r * 0.75;
    ctx.fillStyle = color('xr-pinball-tree');
    ctx.beginPath();
    ctx.arc(X(x + 0.002), Y(y - 0.002), M(0.0075), 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color(rnd() < 0.2 ? 'xr-pinball-district-1' : 'xr-pinball-tree-light');
    ctx.beginPath();
    ctx.arc(X(x), Y(y), M(0.0065), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // The plaza around the advertising column: radial paving and a ring road.
  ctx.save();
  ctx.fillStyle = color('xr-pinball-plaza');
  ctx.beginPath();
  ctx.arc(X(0), Y(0.5), M(0.078), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color('xr-pinball-plaza-line');
  ctx.lineWidth = M(0.0015);
  for (let k = 0; k < 24; k++) {
    const a = (k / 24) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(X(Math.cos(a) * 0.03), Y(0.5 + Math.sin(a) * 0.03));
    ctx.lineTo(X(Math.cos(a) * 0.076), Y(0.5 + Math.sin(a) * 0.076));
    ctx.stroke();
  }
  for (const r of [0.04, 0.058]) {
    ctx.beginPath();
    ctx.arc(X(0), Y(0.5), M(r), 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  const ring = [];
  for (let i = 0; i <= 48; i++) ring.push([Math.cos((i / 48) * Math.PI * 2) * 0.09, 0.5 + Math.sin((i / 48) * Math.PI * 2) * 0.09]);
  street(ring, 0.016);
  // Crosswalks at the ring road.
  for (const a of [0.3, 1.2, 2.0, 2.9, 3.6, 4.4, 5.3]) {
    ctx.save();
    ctx.translate(X(Math.cos(a) * 0.09), Y(0.5 + Math.sin(a) * 0.09));
    ctx.rotate(-a);
    ctx.fillStyle = color('xr-pinball-white');
    for (let k = -2; k <= 2; k++) ctx.fillRect(-M(0.008), k * M(0.003) - M(0.001), M(0.016), M(0.0018));
    ctx.restore();
  }
  // Cars on the streets.
  const car = (x, y, ang, tok) => {
    ctx.save();
    ctx.translate(X(x), Y(y));
    ctx.rotate(-ang);
    ctx.fillStyle = color('xr-pinball-dark');
    ctx.globalAlpha = 0.4;
    ctx.fillRect(-M(0.0075) + M(0.001), -M(0.0042) + M(0.001), M(0.015), M(0.0084));
    ctx.globalAlpha = 1;
    ctx.fillStyle = color(tok);
    ctx.beginPath();
    ctx.roundRect(-M(0.0075), -M(0.0042), M(0.015), M(0.0084), M(0.002));
    ctx.fill();
    ctx.fillStyle = color('xr-pinball-river-deep');
    ctx.fillRect(M(0.0015), -M(0.003), M(0.003), M(0.006));
    ctx.restore();
  };
  [[-0.2, 0.135, 0.12], [0.05, 0.172, 0.12], [0.25, 0.195, 0.12], [-0.22, 0.618, -0.09], [0.2, 0.575, -0.09], [-0.12, 1.0, 0.09], [0.22, 1.035, 0.09],
    [-0.126, 0.42, 1.48], [0.15, 0.4, 1.66], [0.064, 0.564, 0.8], [-0.08, 0.44, -0.8]]
    .forEach(([x, y, a], i) => car(x, y, a, DISTRICTS[(i * 2 + 1) % 6]));
  // People on the sidewalks (seen from above: a head and shoulders).
  for (let i = 0; i < 80; i++) {
    const x = -0.25 + rnd() * 0.54;
    const y = 0.05 + rnd() * 1.2;
    ctx.fillStyle = color(DISTRICTS[i % 6]);
    ctx.beginPath();
    ctx.ellipse(X(x), Y(y), M(0.0038), M(0.0026), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color(['xr-pinball-skin-1', 'xr-pinball-skin-2', 'xr-pinball-skin-3'][i % 3]);
    ctx.beginPath();
    ctx.arc(X(x), Y(y), M(0.0019), 0, Math.PI * 2);
    ctx.fill();
  }
  // Speech bubbles with icons and tag signs floating over the town.
  const bub = (x, y, r, kind, tok) => {
    ctx.save();
    ctx.fillStyle = color('xr-pinball-white');
    ctx.strokeStyle = color(tok);
    ctx.lineWidth = M(0.0018);
    ctx.beginPath();
    ctx.ellipse(X(x), Y(y), M(r * 1.25), M(r), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(X(x - r * 0.5), Y(y - r * 0.75));
    ctx.lineTo(X(x - r * 1.0), Y(y - r * 1.4));
    ctx.lineTo(X(x - r * 0.05), Y(y - r * 0.95));
    ctx.fill();
    ctx.fillStyle = color(tok);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (kind === '#' || kind === '@' || kind === '+1') {
      ctx.font = font('black', M(r * 1.25));
      ctx.fillText(kind, X(x), Y(y) + M(r * 0.05));
    } else if (kind === 'heart') {
      const s = M(r * 0.9);
      ctx.translate(X(x), Y(y) + s * 0.1);
      ctx.beginPath();
      ctx.moveTo(0, s * 0.4);
      ctx.bezierCurveTo(-s * 0.9, -s * 0.15, -s * 0.45, -s * 0.85, 0, -s * 0.4);
      ctx.bezierCurveTo(s * 0.45, -s * 0.85, s * 0.9, -s * 0.15, 0, s * 0.4);
      ctx.fill();
    } else {
      drawGlyph(ctx, kind, X(x), Y(y), M(r * 1.3), color(tok), 2.4);
    }
    ctx.restore();
  };
  [[-0.2, 0.92, 0.011, 'heart', 'xr-pinball-ch-social'], [0.16, 0.94, 0.01, '#', 'xr-pinball-ch-app'], [-0.06, 0.62, 0.009, '@', 'xr-pinball-ch-email'],
    [0.11, 0.72, 0.009, '+1', 'xr-pinball-ch-poster'], [-0.17, 0.53, 0.008, 'video', 'xr-pinball-ch-video'], [0.19, 0.53, 0.008, 'app', 'xr-pinball-ch-app'],
    [-0.205, 0.39, 0.008, '#', 'xr-pinball-district-1'], [0.06, 0.43, 0.007, 'heart', 'xr-pinball-ch-social'], [-0.04, 0.395, 0.007, '@', 'xr-pinball-ch-email'],
    [0.21, 1.15, 0.012, 'heart', 'xr-pinball-ch-social'], [-0.22, 1.21, 0.011, '#', 'xr-pinball-ch-poster'], [0.04, 1.255, 0.01, '+1', 'xr-pinball-ch-video'],
    [-0.1, 0.18, 0.009, 'heart', 'xr-pinball-ch-social'], [0.1, 0.17, 0.009, '#', 'xr-pinball-ch-app']]
    .forEach(([x, y, r, k, tok]) => bub(x, y, r, k, tok));
  // Campaign sketches: a storyboard of three frames in the lower left and right.
  const board = (x, y, flip) => {
    for (let k = 0; k < 3; k++) {
      const fx = x + flip * k * 0.022;
      const fy = y - k * 0.012;
      ctx.save();
      ctx.translate(X(fx), Y(fy));
      ctx.rotate(flip * 0.12);
      ctx.fillStyle = color('xr-pinball-apron-card');
      ctx.fillRect(-M(0.009), -M(0.007), M(0.018), M(0.014));
      ctx.strokeStyle = color('xr-pinball-apron-ink');
      ctx.lineWidth = M(0.0009);
      ctx.strokeRect(-M(0.009), -M(0.007), M(0.018), M(0.014));
      ctx.beginPath();
      ctx.arc(-M(0.003), -M(0.001), M(0.0022), 0, Math.PI * 2);
      ctx.moveTo(-M(0.003), M(0.0012));
      ctx.lineTo(-M(0.003), M(0.005));
      ctx.moveTo(M(0.002), M(0.004));
      ctx.lineTo(M(0.006), -M(0.004));
      ctx.stroke();
      ctx.restore();
    }
  };
  board(-0.24, 0.47, 1);
  board(0.235, 0.33, -1);
  // Starbursts behind the flippers and the title banner above the drain.
  ctx.save();
  const cx = X(0);
  const cy = Y(0.04);
  for (let k = 0; k < 28; k++) {
    const a0 = Math.PI + (k / 28) * Math.PI;
    ctx.fillStyle = color(DISTRICTS[k % 6]);
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, M(0.24), a0, a0 + Math.PI / 28);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  // The title on a ribbon between the flippers.
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
  ctx.strokeStyle = color('xr-pinball-lane-light');
  ctx.lineWidth = M(0.0018);
  ctx.stroke();
  ctx.fillStyle = color('xr-pinball-white');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let px = bh * 0.62;
  ctx.font = font('black', px);
  const title = t('pinballName').toUpperCase();
  while (ctx.measureText(title).width > bw * 0.95 && px > 8) { px -= 1; ctx.font = font('black', px); }
  ctx.fillText(title, 0, bh * 0.04);
  ctx.restore();
  // The town behind the arch: a plaza for the agency's buildings.
  ctx.save();
  ctx.fillStyle = color('xr-pinball-plaza');
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.roundRect(X(-0.07), Y(1.255), M(0.14), M(0.15), M(0.01));
  ctx.fill();
  ctx.strokeStyle = color('xr-pinball-plaza-line');
  ctx.lineWidth = M(0.0012);
  for (let k = 0; k < 12; k++) {
    ctx.beginPath();
    ctx.moveTo(X(-0.07), Y(1.105 + k * 0.0125));
    ctx.lineTo(X(0.07), Y(1.105 + k * 0.0125));
    ctx.stroke();
  }
  ctx.restore();
}

/** Shot arrows printed towards the ramps, the branch and the e-mail targets, with names. */
export function drawShots(ctx, { X, Y, M }) {
  const arrow = (x, y, ang, len, tok, label) => {
    ctx.save();
    ctx.translate(X(x), Y(y));
    ctx.rotate(-ang);
    ctx.fillStyle = color(tok);
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(M(len / 2), 0);
    ctx.lineTo(M(len / 2 - 0.016), -M(0.011));
    ctx.lineTo(M(len / 2 - 0.016), -M(0.005));
    ctx.lineTo(-M(len / 2), -M(0.004));
    ctx.lineTo(-M(len / 2), M(0.004));
    ctx.lineTo(M(len / 2 - 0.016), M(0.005));
    ctx.lineTo(M(len / 2 - 0.016), M(0.011));
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = color('xr-pinball-white');
    ctx.lineWidth = M(0.001);
    ctx.stroke();
    if (label) {
      ctx.fillStyle = color('xr-pinball-white');
      ctx.font = font('black', M(0.0068));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, -M(0.006), M(0.0002));
    }
    ctx.restore();
  };
  arrow(-0.06, 0.255, 2.05, 0.07, 'xr-pinball-ch-video', 'VIDEO');
  arrow(0.06, 0.255, 1.09, 0.07, 'xr-pinball-ch-app', 'APP');
  // Lane names in the arch.
  ctx.save();
  ctx.strokeStyle = color('xr-pinball-lane-light');
  ctx.lineWidth = M(0.0016);
  ctx.setLineDash([M(0.004), M(0.004)]);
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
