// Design switcher: "night" (default) and "sunny". The skin is a token layer in tokens.css,
// selected by <html data-skin="...">; this module persists it and waits for its font.
export const SKINS = ['night', 'sunny'];
const KEY = 'kiar.skin';
const listeners = new Set();

export function getSkin() {
  return document.documentElement.dataset.skin === 'sunny' ? 'sunny' : 'night';
}

/** Loads the fonts a skin needs before 3D panels are drawn with it (canvas text needs them ready). */
export function loadSkinFonts() {
  const family = getSkin() === 'sunny' ? 'Nunito' : 'Inter';
  const fonts = ['400', '700', '800', '900'].map((w) => document.fonts.load(`${w} 32px ${family}`));
  return Promise.race([Promise.all(fonts), new Promise((r) => setTimeout(r, 2500))]).catch(() => {});
}

export async function setSkin(skin) {
  if (!SKINS.includes(skin) || skin === getSkin()) return;
  if (skin === 'sunny') document.documentElement.dataset.skin = 'sunny';
  else delete document.documentElement.dataset.skin;
  try { localStorage.setItem(KEY, skin); } catch { /* ignore */ }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue(skin === 'sunny' ? '--p-sun-ink' : '--p-ink-900').trim();
  await loadSkinFonts();
  listeners.forEach((fn) => fn(skin));
}

export function onSkinChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
