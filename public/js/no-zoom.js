// Touch devices (iPad, iPhone, Android tablets), Nov 2026: while a game is open, a double tap
// or a pinch must not zoom the page, because the game fills the screen and there is no way to
// zoom back out by hand. Three layers:
//   1. CSS (app.css): `touch-action: manipulation` on the stage and `none` on the canvas stop
//      the double-tap zoom in every modern browser, Safari on iOS 13+ included.
//   2. Here: Safari's own pinch gesture (gesturestart / gesturechange) and a stray dblclick are
//      cancelled while the stage is open.
//   3. Here: if the page is zoomed anyway (an older iOS, an accessibility zoom), the viewport is
//      reset once: Safari zooms back out when the viewport tag briefly says maximum-scale=1.
// The landing page stays zoomable, so people who need to enlarge the text can do so there.
const meta = document.querySelector('meta[name="viewport"]');
const base = meta?.getAttribute('content') ?? 'width=device-width, initial-scale=1';
let active = false;
let resetting = false;

const stop = (e) => { if (active) e.preventDefault(); };

function resetZoom() {
  const vv = window.visualViewport;
  if (!active || !meta || !vv || vv.scale <= 1.01 || resetting) return;
  resetting = true;
  meta.setAttribute('content', `${base}, maximum-scale=1`);
  setTimeout(() => {
    meta.setAttribute('content', base);
    resetting = false;
  }, 400);
}

document.addEventListener('gesturestart', stop, { passive: false });
document.addEventListener('gesturechange', stop, { passive: false });
document.addEventListener('dblclick', stop, { passive: false });
window.visualViewport?.addEventListener('resize', resetZoom);

/** Called when the game stage opens (on) and closes (off). */
export function lockZoom(on) {
  active = on;
  if (on) resetZoom();
}
