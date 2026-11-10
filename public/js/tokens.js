// Reads design tokens from css/tokens.css so the 3D UI shares one source of truth.
let style = null;

function raw(name) {
  if (!style) style = getComputedStyle(document.documentElement);
  return style.getPropertyValue(`--${name}`).trim();
}

export function color(name) {
  return raw(name);
}

export function num(name) {
  return parseFloat(raw(name));
}

export function font(weightToken, px) {
  return `${raw(`font-weight-${weightToken}`)} ${Math.round(px)}px ${raw('font-sans')}`;
}

// Converts any CSS color token into a THREE-compatible hex number (alpha dropped).
const probe = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
export function hex(name) {
  probe.fillStyle = '#000';
  probe.fillStyle = color(name);
  const v = probe.fillStyle;
  if (v.startsWith('#')) return parseInt(v.slice(1), 16);
  const m = v.match(/[\d.]+/g).map(Number);
  return (m[0] << 16) | (m[1] << 8) | m[2];
}
