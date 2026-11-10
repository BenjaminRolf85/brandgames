// QR codes for the 3D panels (canvas) and the HTML pages (SVG), drawn with the vendored
// qrcode-generator (MIT). Black on white with a quiet zone, so every phone camera reads them.
import qrcode from '../vendor/qrcode.mjs';

const QUIET = 4; // modules of white border

function matrix(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  return { n, dark: (r, c) => qr.isDark(r, c) };
}

/** Draws a QR code into a square of `size` pixels at (x, y), modules snapped to whole pixels. */
export function drawQR(ctx, text, x, y, size, dark, light) {
  const { n, dark: isDark } = matrix(text);
  const cell = Math.max(1, Math.floor(size / (n + QUIET * 2)));
  const off = Math.floor((size - cell * n) / 2);
  ctx.fillStyle = light;
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = dark;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (isDark(r, c)) ctx.fillRect(x + off + c * cell, y + off + r * cell, cell, cell);
  }
}

/** SVG markup of a QR code (for HTML pages); colors are CSS values, e.g. var(--color-qr-dark). */
export function qrSVG(text, { dark = 'currentColor', light = 'transparent', label = '' } = {}) {
  const { n, dark: isDark } = matrix(text);
  const size = n + QUIET * 2;
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (isDark(r, c)) d += `M${c + QUIET} ${r + QUIET}h1v1h-1z`;
  }
  return `<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="${label}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
}
