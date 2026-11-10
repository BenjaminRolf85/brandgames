// Line icons (24 x 24 grid, stroked, round caps), drawn for this app. One source for the
// 3D menu (canvas Path2D) and the landing page (inline SVG). No emojis, no icon fonts.

const circ = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

export const ICONS = {
  // Train Echo (the training game, key 'robot'): the bat mascot
  robot: `${circ(12, 13.5, 3.6)}M9.6 10.8L9 5.5l2.4 4.3M14.4 10.8L15 5.5l-2.4 4.3M8.4 13.5c-2-2.2-4.6-2.6-6.4-1.6 1.2.6 1.8 1.6 1.7 2.9 1.2-.6 2.4-.4 3.2.6M15.6 13.5c2-2.2 4.6-2.6 6.4-1.6-1.2.6-1.8 1.6-1.7 2.9-1.2-.6-2.4-.4-3.2.6`,
  // AI Pong: 3D tunnel with a ball
  pong: `M3 4h18v16H3zM8.5 8.5h7v7h-7zM3 4l5.5 4.5M21 4l-5.5 4.5M3 20l5.5-4.5M21 20l-5.5-4.5${circ(13.6, 12.6, 1.5)}M5.5 17.4h3.5`,
  // Data Flight: a database with data rushing in
  dataflight: 'M5 7c0-1.7 3.1-3 7-3s7 1.3 7 3-3.1 3-7 3-7-1.3-7-3zM5 7v10c0 1.7 3.1 3 7 3s7-1.3 7-3V7M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3M1 5h2M1 10h2M21 14h2M21 19h2',
  // Bank data landscape: architecture diagram
  arch: 'M3 3.5h6v5H3zM15 3.5h6v5h-6zM9 15.5h6v5H9zM6 8.5V12h12V8.5M12 12v3.5M5 6h2M17 6h2M11 18h2',
  // AI quiz: speech bubble with a question mark
  quiz: `M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-4.5 3.5V17H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9.6 8.6a2.4 2.4 0 1 1 3.4 2.2c-.6.3-1 .8-1 1.5v.4${circ(12, 14.7, 0.35)}`,
  // Fact or myth: check against cross
  factmyth: 'M12 3v18M3 12.5l2.5 2.5 4-5M15 9.5l5 5M20 9.5l-5 5',
  // Sort the concepts: two tagged cards
  sort: 'M4 5h9l3 3-3 3H4zM8 13h9l3 3-3 3H8z',
  // Timeline: line with milestones
  timeline: `M3 12h18${circ(6, 12, 1.6)}${circ(12, 12, 1.6)}${circ(18, 12, 1.6)}M6 6v4.4M12 13.6V18M18 6v4.4`,
  // Review: circular arrows
  review: 'M20 12a8 8 0 0 1-13.7 5.6M4 12a8 8 0 0 1 13.7-5.6M17.7 3v3.6h-3.6M6.3 21v-3.6h3.6',
  // Echo, the bat mascot: round body, pointed ears, spread wings
  bat: `${circ(12, 13.5, 3.6)}M9.6 10.8L9 5.5l2.4 4.3M14.4 10.8L15 5.5l-2.4 4.3M8.4 13.5c-2-2.2-4.6-2.6-6.4-1.6 1.2.6 1.8 1.6 1.7 2.9 1.2-.6 2.4-.4 3.2.6M15.6 13.5c2-2.2 4.6-2.6 6.4-1.6-1.2.6-1.8 1.6-1.7 2.9-1.2-.6-2.4-.4-3.2.6`,
  // AI arena: impact burst
  fight: 'M12 2.5l1.9 5.3 5.1-2.3-2.2 5.1 5.2 1.4-5.2 1.4 2.2 5.1-5.1-2.3L12 21.5l-1.9-5.3-5.1 2.3 2.2-5.1-5.2-1.4 5.2-1.4L5 5.5l5.1 2.3z',
  // Fighting moves
  punch: 'M6.5 11V8.5a1.5 1.5 0 0 1 3 0V11M9.5 10V7.5a1.5 1.5 0 0 1 3 0V10M12.5 10V8a1.5 1.5 0 0 1 3 0v2M15.5 10.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-.5a5.5 5.5 0 0 1-5.5-5.5V11.5a1.5 1.5 0 0 1 3 0v1.5',
  kick: 'M8 3h5v8.5l5.2 2.4a2.5 2.5 0 0 1 1.5 2.3V19H8zM8 16h11.7M4 8h2.5M3 12h3.5',
  block: 'M12 3l7.5 3v5.2c0 4.6-3.1 8.1-7.5 9.8-4.4-1.7-7.5-5.2-7.5-9.8V6zM12 7.5v9M8.5 11h7',
  throw: 'M4.5 14.5c1.5-5.5 7.5-9 13.5-7M15 4l3 3-3 3M19.5 9.5c-1.5 5.5-7.5 9-13.5 7M9 20l-3-3 3-3',
  special: 'M13.5 2L5 13.5h6.5L10 22l9-11.5h-6.5z',
  // AI Arena: ducking under, and the fighters' own special moves
  duck: 'M12 3v9M8 8.5l4 4 4-4M4 16h16M7 20h10',
  sonar: `${circ(5, 12, 1.6)}M9 8.5a5 5 0 0 1 0 7M12.5 6a8.5 8.5 0 0 1 0 12M16 3.5a12 12 0 0 1 0 17`,
  snowball: `${circ(14, 12, 6)}M12 10h.01M15.5 9h.01M13.5 14h.01M2 9h4M2 13h3M3 17h4`,
  rock: 'M4.5 16.5L6.5 9l6-3.5 5.5 3 2 7-4.5 4h-7.5zM8.5 9.5l3.5 2 4.5-1M12 11.5l-1 7',
  laser: 'M3 12h3M6 8.5h4v7H6zM10 12h11M17.5 8.5L21 12l-3.5 3.5',
  gift: 'M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-1.5-3.5-5.5-3.5-4.5-.5M12 7c1.5-3.5 5.5-3.5 4.5-.5',
  stardust: 'M15.5 3l1.4 3 3.3.4-2.4 2.3.6 3.3-2.9-1.6-2.9 1.6.6-3.3-2.4-2.3 3.3-.4zM3 21l6.5-6.5M5 14.5l2.5-2.5M9.5 19l2.5-2.5',
  // Bottom bar
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 5.5H5.5A2.5 2.5 0 0 0 8 9.5M16 5.5h2.5A2.5 2.5 0 0 1 16 9.5M12 13v3.5M9.5 16.5h5v3.5h-5zM8 20h8',
  // Overall leaderboard: a podium with a star
  overall: 'M3 20h18M9 20v-8h6v8M3 20v-5h6M15 20v-3.5h6M12 3.2l1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4z',
  lab: `${circ(12, 12, 8.5)}M3.5 12h17M12 3.5c-2.5 2.5-3.5 5.5-3.5 8.5s1 6 3.5 8.5c2.5-2.5 3.5-5.5 3.5-8.5s-1-6-3.5-8.5z`,
  settings: `M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1${circ(15, 6, 2)}${circ(9, 12, 2)}${circ(17, 18, 2)}`,
  exit: 'M14 4H6.5a1.5 1.5 0 0 0-1.5 1.5v13A1.5 1.5 0 0 0 6.5 20H14M10 12h10M17 8.5l3.5 3.5-3.5 3.5',
  back: 'M15 5l-7 7 7 7',
  // Touch controls on phones: flap (up arrow under a wing arc) and swipe to steer
  flap: 'M12 21V10M7.5 14.5L12 10l4.5 4.5M3 9.5C5.5 6.2 8.6 4.8 12 4.8s6.5 1.4 9 4.7',
  swipe: `${circ(12, 12, 2.2)}M12 3.5v4M12 16.5v4M3.5 12h4M16.5 12h4M10.2 5.3L12 3.5l1.8 1.8M10.2 18.7l1.8 1.8 1.8-1.8M5.3 10.2L3.5 12l1.8 1.8M18.7 10.2l1.8 1.8-1.8 1.8`,
  // Echo Parkour: a jumping arc over steps, with a coin
  parkour: `M3 20h5v-4h5v-4h8M5 14c1.5-4 4.5-6.5 8-6.5${circ(17.5, 6.5, 2.5)}M17.5 5.4v2.2`,
  // Echo Parkour level 2: a desk with a monitor and a flight arc above it
  parkour3: 'M3 21h18M5 21V10h4v11M9 21V6h5v15M14 21v-9h5v9M6.5 13h1M6.5 16h1M11 9h1M11 12h1M11 15h1M16 15h1',
  parkour2: `M3 20h18M5 20v-5h14v5M9 15v-3h6v3M4 9c3-4 8-6 14-4${circ(19, 5.5, 1.6)}`,
  // AI licence: an ID card with a portrait and two lines
  licence: `M4.5 5h15A1.5 1.5 0 0 1 21 6.5v11a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-11A1.5 1.5 0 0 1 4.5 5zM13.5 10h4.5M13.5 13.5h3${circ(8.5, 10.2, 2)}M5.6 16.2c.6-1.5 1.6-2.3 2.9-2.3s2.3.8 2.9 2.3`,
  // Badge: a rosette with ribbons
  badge: `${circ(12, 9.5, 5.5)}${circ(12, 9.5, 2.4)}M8.6 13.8L7 21l5-2.6 5 2.6-1.6-7.2`,
  // Games for our clients: the gift coin of the section, then one icon per game
  clients: 'M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-1.5-3.5-5.5-3.5-4.5-.5M12 7c1.5-3.5 5.5-3.5 4.5-.5',
  bike: `${circ(6, 16, 3.5)}${circ(18, 16, 3.5)}M6 16l4-7h6l2 7M10 9L8.8 6.5H7M16 9l1-3h2M12.5 16L10 9`,
  roast: 'M5 10h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 11h1.5a2.5 2.5 0 0 1 0 5H16M8 3c-1 1.5 1 2.5 0 4M12 3c-1 1.5 1 2.5 0 4',
  bricks: 'M3 11l9-7 9 7M5 9.5V20h14V9.5M5 14h14M5 17h14M9 14v3M15 14v3M12 17v3M12 11v3',
  green: `${circ(12, 10, 1.3)}M12 11.3V21M9 21h6M11.4 8.8L10 3M13.2 10.6l5.3 3M10.8 10.6l-5.3 3`,
  dock: `${circ(7, 8, 2.2)}${circ(17, 8, 2.2)}${circ(12, 17, 2.6)}M8.2 9.9l2.6 4.8M15.8 9.9l-2.6 4.8M9.2 8h5.6`,
  pinball: `${circ(15, 7, 2.5)}M3.5 19.5l7.5-3M20.5 19.5l-7.5-3M6 4v7M19 12v3`,
  summit: 'M2 20l7-11 4 6 3-4 6 9zM16 11V4l4 1.5-4 1.5',
};

/** Inline SVG markup for the landing page (inherits currentColor). */
export function iconSVG(key, size = 24) {
  const d = ICONS[key];
  if (!d) return '';
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
}

const cache = new Map();
/** Strokes an icon onto a canvas: centered at (x, y), size in pixels. */
export function drawIcon(ctx, key, x, y, size, strokeStyle, glow = null) {
  const d = ICONS[key];
  if (!d) return;
  if (!cache.has(key)) cache.set(key, new Path2D(d));
  const k = size / 24;
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(k, k);
  ctx.lineWidth = 1.8;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = strokeStyle;
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 6; }
  ctx.stroke(cache.get(key));
  ctx.restore();
}
