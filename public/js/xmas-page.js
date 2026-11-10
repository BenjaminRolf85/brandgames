// Christmas edition of the landing page (SEASON 'christmas'): a string of twinkling fairy lights
// along the top of the welcome area and gentle snowfall behind it. Colors from the design tokens
// (--color-xmas-*). With reduced motion the lights stay still and the snow does not fall. The
// snow pauses while the 3D view is open or the page is hidden.
const LIGHTS = 5; // --color-xmas-light-1 .. -5

/** The fairy lights: a wire in soft swags with bulbs, sized to the band's width. */
function lights(band) {
  const holder = document.createElement('div');
  holder.className = 'xmas-lights';
  holder.setAttribute('aria-hidden', 'true');
  band.prepend(holder);
  const draw = () => {
    const w = Math.max(320, band.clientWidth);
    const h = 44;
    const swag = Math.max(160, Math.min(260, w / 5));
    const n = Math.round(w / swag);
    const step = w / n;
    let wire = `M0 6`;
    for (let i = 0; i < n; i++) wire += ` Q${(i + 0.5) * step} ${h - 4} ${(i + 1) * step} 6`;
    const bulbs = [];
    const per = Math.max(5, Math.round(step / 34));
    for (let i = 0; i < n; i++) {
      for (let k = 1; k < per; k++) {
        const u = k / per;
        const x = i * step + u * step;
        // a point on the quadratic curve of this swag
        const y = (1 - u) * (1 - u) * 6 + 2 * (1 - u) * u * (h - 4) + u * u * 6;
        const c = (bulbs.length % LIGHTS) + 1;
        bulbs.push(`<g class="xmas-lights__bulb xmas-lights__bulb--${c}" style="animation-delay:${((bulbs.length * 0.37) % 2.4).toFixed(2)}s">`
          + `<rect x="${(x - 1.6).toFixed(1)}" y="${(y - 1).toFixed(1)}" width="3.2" height="4" rx="1"/>`
          + `<ellipse cx="${x.toFixed(1)}" cy="${(y + 7).toFixed(1)}" rx="4.2" ry="6"/></g>`);
      }
    }
    holder.innerHTML = `<svg viewBox="0 0 ${w} ${h + 14}" width="${w}" height="${h + 14}" focusable="false"><path class="xmas-lights__wire" d="${wire}"/>${bulbs.join('')}</svg>`;
  };
  draw();
  let timer = 0;
  window.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(draw, 150); });
}

/** Gentle snowfall on a canvas behind the welcome area. */
function snow(band) {
  const canvas = document.createElement('canvas');
  canvas.className = 'xmas-snow';
  canvas.setAttribute('aria-hidden', 'true');
  band.prepend(canvas);
  const ctx = canvas.getContext('2d');
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const flakeColor = getComputedStyle(document.documentElement).getPropertyValue('--color-xmas-snow').trim() || '#fff';
  let w = 0;
  let h = 0;
  let flakes = [];
  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    w = band.clientWidth;
    h = band.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(Math.min(110, (w * h) / 9000));
    flakes = Array.from({ length: n }, () => ({
      x: Math.random() * w, y: Math.random() * h, r: 0.8 + Math.random() * 2.4, v: 12 + Math.random() * 26, ph: Math.random() * 6.3,
    }));
    if (still) paint(0);
  };
  const paint = (t) => {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = flakeColor;
    for (const f of flakes) {
      ctx.globalAlpha = 0.35 + f.r / 5;
      ctx.beginPath();
      ctx.arc(f.x + Math.sin(t * 0.8 + f.ph) * 6, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
  resize();
  // The band grows when the picture has loaded or the language changes: keep the canvas sharp.
  if (typeof ResizeObserver === 'function') new ResizeObserver(resize).observe(band);
  else window.addEventListener('resize', resize);
  if (still) return;
  let visible = true;
  new IntersectionObserver((e) => { visible = e[0].isIntersecting; }).observe(band);
  let last = performance.now();
  const frame = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (visible && !document.hidden && !document.body.classList.contains('is-playing')) {
      for (const f of flakes) {
        f.y += f.v * dt;
        if (f.y > h + 4) { f.y = -4; f.x = Math.random() * w; }
      }
      paint(now / 1000);
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

/** Decorates the landing page's welcome area (call once, in the Christmas edition). */
export function decoratePage() {
  const band = document.querySelector('.hero-band');
  if (!band) return;
  band.classList.add('hero-band--xmas');
  snow(band);
  lights(band);
  document.querySelectorAll('[data-xmas]').forEach((el) => { el.hidden = false; });
}
