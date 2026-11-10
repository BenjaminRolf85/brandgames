// Phones and tablets in the browser preview (engine.touchUI): screen elements on top of the 3D
// view, styled with the design tokens (app.css, .mhud and .mtouch):
//   screenHud     the status bar with the menu button (instead of the 3D bar)
//   touchButtons  big buttons for the thumbs, e.g. "flap" in the Echo Parkour
//   dragPad       steering by swiping anywhere on the screen (relative, like a trackpad), so the
//                 finger never covers what it steers (Pong paddle, Echo in the Data Flight)
//   nameForm      the leaderboard name with the phone's own keyboard (instead of the 3D one)
//   aimPad        a control field that stands for a game area: where you touch or drag in it is
//                 where the thing goes (the Pong paddle); it also shows where it and the ball are
// Elements with data-inset keep their part of the screen free of 3D content (engine.insets).
import { t } from './i18n.js';
import { iconSVG } from './icons.js';

const stage = () => document.getElementById('stage');

/** Status bar at the top: a menu button and the game's status line. */
export function screenHud({ onMenu }) {
  const el = document.createElement('div');
  el.className = 'mhud';
  el.dataset.inset = 'top';
  const menu = Object.assign(document.createElement('button'), { type: 'button', className: 'mhud__menu', textContent: t('menu') });
  menu.addEventListener('click', onMenu);
  const text = Object.assign(document.createElement('p'), { className: 'mhud__text' });
  el.append(menu, text);
  stage()?.append(el);
  return {
    set(s) { if (text.textContent !== s) text.textContent = s; },
    remove() { el.remove(); },
  };
}

/**
 * Buttons for the thumbs at the bottom of the screen. items: [{ icon, label, onPress, onRelease,
 * primary, group }]. They react on touch down (no delay). In portrait they get their own strip
 * below the game; in landscape they float in the corner over it. With { grid: true } (many
 * buttons, e.g. the six moves of the AI Arena) they come in two groups ('left' and 'right'):
 * in portrait one row each, in landscape one cluster per thumb in the lower corners.
 */
export function touchButtons(items, { grid = false } = {}) {
  const el = document.createElement('div');
  el.className = `mtouch${grid ? ' mtouch--grid' : ''}`;
  el.dataset.inset = 'bottom';
  el.hidden = true;
  const groups = {};
  const btns = [];
  for (const it of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `mtouch__btn${it.primary ? ' mtouch__btn--primary' : ''}`;
    b.innerHTML = `${iconSVG(it.icon, grid ? 24 : 30)}<span class="mtouch__label"></span>`;
    b.querySelector('.mtouch__label').textContent = it.label;
    b.setAttribute('aria-label', it.label);
    const up = () => { b.classList.remove('is-down'); it.onRelease?.(); };
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (b.disabled) return;
      b.classList.add('is-down');
      it.onPress?.();
      try { b.setPointerCapture(e.pointerId); } catch { /* no capture for this pointer */ }
    });
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    // Keyboard and screen readers: a click without a pointer press.
    b.addEventListener('click', (e) => { if (e.detail === 0) it.onPress?.(); });
    btns.push(b);
    if (!grid) { el.append(b); continue; }
    const key = it.group ?? 'left';
    if (!groups[key]) {
      groups[key] = Object.assign(document.createElement('div'), { className: `mtouch__group mtouch__group--${key}` });
      el.append(groups[key]);
    }
    groups[key].append(b);
  }
  stage()?.append(el);
  return {
    show(on) { if (el.hidden === on) el.hidden = !on; },
    /** Enables or disables the buttons (e.g. a move that is not possible right now). */
    disable(i, off) { const b = btns[i]; if (b && b.disabled !== off) b.disabled = off; },
    /** New icon and label for a button (e.g. Santa's special, which changes after each use). */
    relabel(i, icon, label) {
      const b = btns[i];
      if (!b || b.dataset.key === `${icon}|${label}`) return;
      b.dataset.key = `${icon}|${label}`;
      b.innerHTML = `${iconSVG(icon, grid ? 24 : 30)}<span class="mtouch__label"></span>`;
      b.querySelector('.mtouch__label').textContent = label;
      b.setAttribute('aria-label', label);
    },
    remove() { el.remove(); },
  };
}

/**
 * Relative steering: while a finger is down anywhere on the 3D view, onMove(dx, dy) gets how far
 * it moved since it touched down (CSS px, y up). A hint chip explains it. onStart/onEnd optional.
 */
export function dragPad(canvas, { hint, onStart, onMove, onEnd, enabled = () => true }) {
  let id = null;
  let sx = 0;
  let sy = 0;
  const down = (e) => {
    if (id !== null || !enabled()) return;
    id = e.pointerId;
    sx = e.clientX;
    sy = e.clientY;
    onStart?.();
  };
  const move = (e) => {
    if (e.pointerId !== id) return;
    onMove(e.clientX - sx, sy - e.clientY);
  };
  const up = (e) => {
    if (e.pointerId !== id) return;
    id = null;
    onEnd?.();
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  const chip = document.createElement('p');
  if (hint === false) chip.hidden = true; // the game shows its own controls
  chip.className = 'mtouch-hint';
  chip.innerHTML = `${iconSVG('swipe', 22)}<span></span>`;
  chip.querySelector('span').textContent = hint ?? t('touchSwipe');
  chip.hidden = true;
  chip.dataset.inset = 'bottom';
  if (hint !== false) stage()?.append(chip);
  return {
    get active() { return id !== null; },
    show(on) { if (chip.hidden === on) chip.hidden = !on; },
    remove() {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      chip.remove();
    },
  };
}

/**
 * The leaderboard name with the phone's keyboard: a field with "cancel" and "submit" at the top
 * of the screen (the keyboard covers the bottom). onInput(name) on every change.
 */
export function nameForm({ initial, maxLength, valid, onInput, onSubmit, onCancel }) {
  const form = document.createElement('form');
  form.className = 'mname';
  form.dataset.inset = 'top';
  form.noValidate = true;
  const label = Object.assign(document.createElement('label'), { className: 'mname__label', htmlFor: 'mname-input', textContent: t('yourName') });
  const input = Object.assign(document.createElement('input'), {
    id: 'mname-input', className: 'mname__input', type: 'text', value: initial, maxLength,
    autocomplete: 'nickname', autocapitalize: 'words', spellcheck: false, enterKeyHint: 'send',
  });
  const cancel = Object.assign(document.createElement('button'), { type: 'button', className: 'mname__btn', textContent: t('cancel') });
  const send = Object.assign(document.createElement('button'), { type: 'submit', className: 'mname__btn mname__btn--primary', textContent: t('send') });
  const row = Object.assign(document.createElement('div'), { className: 'mname__row' });
  row.append(cancel, send);
  form.append(label, input, row);
  const update = () => { send.disabled = !valid(input.value.trim()); onInput(input.value); };
  input.addEventListener('input', update);
  cancel.addEventListener('click', () => onCancel());
  form.addEventListener('submit', (e) => { e.preventDefault(); if (valid(input.value.trim())) onSubmit(input.value.trim()); });
  stage()?.append(form);
  update();
  input.focus({ preventScroll: true });
  return { remove() { form.remove(); } };
}

/**
 * A control field for the thumb that stands for a game area of the given aspect (width / height):
 * touching or dragging in it calls onAim(nx, ny) with -1..1 (y up), so the thing goes exactly
 * there. update({ x, y, w, h }, ball) shows the thing (normalized center and size) and, if given,
 * the ball ({ x, y, s, on }) as on a radar. Portrait: below the game; landscape: to its right.
 */
export function aimPad({ aspect, label, onAim }) {
  const el = document.createElement('div');
  el.className = 'mpad';
  el.dataset.inset = 'bottom';
  el.dataset.insetLand = 'right';
  el.hidden = true;
  el.style.setProperty('--mpad-aspect', String(aspect));
  el.innerHTML = '<p class="mpad__label"></p><div class="mpad__field" role="application"><span class="mpad__grid"></span><span class="mpad__paddle"></span><span class="mpad__ball"></span></div>';
  el.querySelector('.mpad__label').textContent = label;
  const field = el.querySelector('.mpad__field');
  field.setAttribute('aria-label', label);
  const paddle = el.querySelector('.mpad__paddle');
  const ball = el.querySelector('.mpad__ball');
  let id = null;
  const aim = (e) => {
    const r = field.getBoundingClientRect();
    const nx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width) * 2 - 1));
    const ny = Math.max(-1, Math.min(1, 1 - ((e.clientY - r.top) / r.height) * 2));
    onAim(nx, ny);
  };
  field.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    id = e.pointerId;
    try { field.setPointerCapture(e.pointerId); } catch { /* no capture */ }
    field.classList.add('is-down');
    aim(e);
  });
  field.addEventListener('pointermove', (e) => { if (e.pointerId === id) aim(e); });
  const up = (e) => { if (e.pointerId !== id) return; id = null; field.classList.remove('is-down'); };
  field.addEventListener('pointerup', up);
  field.addEventListener('pointercancel', up);
  stage()?.append(el);
  const pct = (v) => `${(v * 100).toFixed(2)}%`;
  return {
    show(on) { if (el.hidden === on) el.hidden = !on; },
    update(p, b) {
      paddle.style.left = pct((p.x + 1) / 2);
      paddle.style.top = pct((1 - p.y) / 2);
      paddle.style.width = pct(p.w);
      paddle.style.height = pct(p.h);
      ball.hidden = !b?.on;
      if (b?.on) {
        ball.style.left = pct((b.x + 1) / 2);
        ball.style.top = pct((1 - b.y) / 2);
        ball.style.transform = `translate(-50%, -50%) scale(${b.s.toFixed(3)})`;
      }
    },
    remove() { el.remove(); },
  };
}
