// "Röstmeister" (Roast Master): the screen elements of the browser view (desktop and phones), plain
// HTML on top of the 3D counter so the texts are crisp at any window size (styles and tokens in
// game-roast.css):
//   makeGauge   the roast gauge: the stages from green to burnt, the two cracks, a needle, the
//               zone the guest wishes for (an outlined box with a label) and the AI's stop mark
//   makeBar     desktop: the stations at the bottom, one button per key: blending (1 to 4, the
//               arrows, Enter) with what the blend tastes of, "serve" while a cup waits, and above
//               its right end the drum's card with the gauge and "stop"; in the finale the six treats
//   keyButton   a button that shows its key
//   makeToast   one line of help or news above the controls (a new wave, a first-time hint)
//   makeStatus  desktop: the round's status with the menu (pause) button, top center
//   wishChips   the guest's wish as two chips (a flavor with its icon, the roast in a word)
import { t } from './i18n.js';
import { color } from './tokens.js';
import { STAGES, FIRST_CRACK, SECOND_CRACK } from './roast-ai.js';
import { flavorIcon } from './roast-panels.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};
const pct = (v) => `${Math.round(Math.min(1, Math.max(0, v)) * 1000) / 10}%`;

/** The roast gauge. set({ r, zone: [lo, hi] | null, aiStop: 0..1 | null, on }). */
export function makeGauge() {
  const root = el('div', 'roast-gauge');
  root.setAttribute('aria-hidden', 'true'); // the stage is also written out beside it
  const track = el('div', 'roast-gauge__track');
  STAGES.forEach((s, i) => {
    const seg = el('i', `roast-gauge__seg roast-gauge__seg--${s.key}`);
    seg.style.width = pct((STAGES[i + 1]?.at ?? 1) - s.at);
    track.append(seg);
  });
  const done = el('i', 'roast-gauge__rest');
  track.append(done);
  root.append(track);
  for (const at of [FIRST_CRACK, SECOND_CRACK]) {
    const c = el('span', 'roast-gauge__crack');
    c.style.left = pct(at);
    root.append(c);
  }
  const zone = el('span', 'roast-gauge__zone');
  zone.append(el('b', '', t('roastWishLabel')));
  const ai = el('span', 'roast-gauge__ai');
  ai.append(el('b', '', t('roastAiStop')));
  const needle = el('span', 'roast-gauge__needle');
  root.append(zone, ai, needle);
  let last = '';
  return {
    el: root,
    set({ r = 0, zone: z = null, aiStop = null, on = false }) {
      const key = `${Math.round(r * 500)}|${z ? z.join() : ''}|${aiStop ?? ''}|${on}`;
      if (key === last) return;
      last = key;
      root.classList.toggle('is-on', on);
      needle.style.left = pct(r);
      done.style.left = pct(r);
      zone.hidden = !z;
      if (z) { zone.style.left = pct(z[0]); zone.style.width = pct(z[1] - z[0]); }
      ai.hidden = aiStop === null;
      if (aiStop !== null) ai.style.left = pct(aiStop);
    },
  };
}

/** A button that shows its key: <kbd>key</kbd> label (and a second, smaller line). */
export function keyButton(act, key, label, note = '', primary = false) {
  const b = el('button', `roast-key${primary ? ' roast-key--primary' : ''}`);
  b.type = 'button';
  b.dataset.act = act;
  b.tabIndex = -1; // the key on it is the keyboard's way; Tab stays with the 3D buttons
  if (key) b.append(el('kbd', 'roast-key__cap', key));
  const text = el('span', 'roast-key__text');
  text.append(el('span', 'roast-key__label', label));
  if (note) text.append(el('small', 'roast-key__note', note));
  b.append(text);
  b.setAttribute('aria-label', note ? `${label}, ${note}` : label);
  return b;
}

/** Changes a key button's label (and note) when it differs. */
export function relabel(b, label, note = '') {
  if (!b) return;
  const l = b.querySelector('.roast-key__label');
  if (l.textContent !== label) { l.textContent = label; b.setAttribute('aria-label', note ? `${label}, ${note}` : label); }
  const n = b.querySelector('.roast-key__note');
  if (n && n.textContent !== note) n.textContent = note;
}

/** Clicks on [data-act] buttons inside root call onAct(name); a click never takes the keyboard focus. */
export function wireActs(root, onAct) {
  root.addEventListener('mousedown', (e) => { if (e.target.closest('[data-act]')) e.preventDefault(); });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b && !b.disabled) onAct(b.dataset.act);
  });
}

/**
 * Desktop: the station bar at the bottom. show(kind, buttons) swaps the row of buttons
 * ('play': beans, shares, roast; 'basket': treats, AI, pack); info(html parts) sets the line above.
 */
export function makeBar(onAct) {
  const root = el('div', 'roast-bar');
  root.hidden = true;
  const upper = el('div', 'roast-bar__upper'); // the line about the blend on the left, the drum's card on the right
  const top = el('div', 'roast-bar__top'); // the blend in words, and "serve" while a cup waits
  const info = el('p', 'roast-bar__info');
  const mix = el('span', 'roast-bar__mix');
  const mixA = el('i', 'roast-bar__mix-a');
  mix.append(mixA);
  const infoText = el('span', 'roast-bar__text');
  info.append(infoText, mix);
  top.append(info);
  upper.append(top);
  const row = el('div', 'roast-bar__row');
  root.append(upper, row);
  wireActs(root, onAct);
  let kind = '';
  const btns = {};
  return {
    el: root,
    upper,
    top,
    row,
    btns,
    get kind() { return kind; },
    show(k, list = []) {
      root.hidden = !k;
      if (k === kind) return;
      kind = k;
      row.replaceChildren();
      for (const key of Object.keys(btns)) delete btns[key];
      for (const b of list) {
        if (b === null) { row.append(el('span', 'roast-bar__gap')); continue; }
        btns[b.dataset.act] = b;
        row.append(b);
      }
    },
    /** The line above the buttons; share (0..1) draws the small blend bar, null hides it. */
    info(text, share = null, colA = '', colB = '') {
      if (infoText.textContent !== text) infoText.textContent = text;
      mix.hidden = share === null;
      if (share !== null) {
        mixA.style.width = pct(share);
        mixA.style.background = colA;
        mix.style.background = colB;
      }
    },
    remove() { root.remove(); },
  };
}

/** One line of help or news; show(text, kind) with kind 'wave' | 'hint' | 'good' | 'warn'. */
export function makeToast() {
  const root = el('p', 'roast-toast');
  root.hidden = true;
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  return {
    el: root,
    show(text, kind = 'hint') {
      root.textContent = text;
      root.className = `roast-toast roast-toast--${kind}`;
      root.hidden = false;
    },
    hide() { root.hidden = true; },
    remove() { root.remove(); },
  };
}

/** Desktop: the status line of the round with the menu button (it opens the pause dialog). */
export function makeStatus(onMenu) {
  const root = el('div', 'roast-status');
  const menu = el('button', 'roast-status__menu', t('menu'));
  menu.type = 'button';
  menu.tabIndex = -1; // Escape or P pause as well
  menu.addEventListener('mousedown', (e) => e.preventDefault());
  menu.addEventListener('click', onMenu);
  const text = el('p', 'roast-status__text');
  root.append(menu, text);
  return {
    el: root,
    set(s) { if (text.textContent !== s) text.textContent = s; },
    remove() { root.remove(); },
  };
}

const iconCache = {};
/** A flavor's little icon as an image URL (drawn once per flavor). */
function flavorImage(key) {
  if (!iconCache[key]) {
    const c = document.createElement('canvas');
    c.width = 48;
    c.height = 48;
    flavorIcon(c.getContext('2d'), key, 24, 24, 40, color(`xr-roast-${key}-ink`));
    iconCache[key] = c.toDataURL();
  }
  return iconCache[key];
}

/** Fills a node with the guest's wish: [icon flavor] [roast word]. w: wish() of roast-ai.js or null. */
export function wishChips(node, w) {
  const key = w ? `${w.flavor}|${w.roast}` : '';
  if (node.dataset.key === key) return;
  node.dataset.key = key;
  node.replaceChildren();
  node.hidden = !w;
  if (!w) return;
  const a = el('span', 'roast-chip');
  const img = el('img', 'roast-chip__icon');
  img.alt = '';
  img.src = flavorImage(w.flavor);
  a.append(img, document.createTextNode(t(`roastWish_${w.flavor}`)));
  const b = el('span', `roast-chip roast-chip--${w.roast}`, t(`roastWishRoast_${w.roast}`));
  node.append(a, b);
}
