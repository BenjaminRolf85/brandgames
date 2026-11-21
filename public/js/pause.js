// Pause for the browser view (desktop and phones; Nov 2026). Escape or P, the game's menu
// button, or leaving the tab opens a dialog over the game: the game's time and all sound stand
// still (engine.setPaused, music.pause). The dialog is plain HTML, so the keyboard and screen
// readers work as usual: "Weiter" (Escape too), "Neu starten", "Menü", plus the game's controls
// for this device (BaseScene.setControls). In the headset there is no pause dialog: taking the
// headset off pauses the session, and the menu button leaves the game as before.
import { t } from './i18n.js';
import { music } from './music.js';

export class Pause {
  constructor(app) {
    this.app = app;
    this.el = null;
    document.addEventListener('keydown', (e) => this.onKey(e));
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.open(); });
  }

  get isOpen() { return !!this.el; }

  /** A game is on the screen in the browser (not the lobby, not the headset). */
  get available() {
    const a = this.app;
    return !a.stage.hidden && !a.engine.isXR && !!a.current?.pausable && !a.current.disposed;
  }

  onKey(e) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const tag = e.target?.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (this.isOpen) {
      if (e.key === 'Escape') { e.preventDefault(); this.close(); } else if (e.key === 'Tab') this.trap(e);
      return;
    }
    if (typing || !this.available) return;
    // After the other key handlers: a game that uses Escape itself (e.g. to drop a selection)
    // calls preventDefault and keeps the key.
    if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') setTimeout(() => { if (!e.defaultPrevented) this.open(); }, 0);
  }

  /** Keeps the keyboard focus inside the dialog. */
  trap(e) {
    const items = [...this.el.querySelectorAll('button')];
    if (!items.length) return;
    const i = items.indexOf(document.activeElement);
    e.preventDefault();
    items[(i + (e.shiftKey ? -1 : 1) + items.length) % items.length].focus();
  }

  open() {
    if (this.isOpen || !this.available) return false;
    const { app } = this;
    app.engine.setPaused(true);
    music.pause();
    const el = document.createElement('div');
    el.className = 'pause';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'pause-title');
    const card = document.createElement('div');
    card.className = 'pause__card';
    const title = Object.assign(document.createElement('h2'), { id: 'pause-title', className: 'pause__title', textContent: t('pauseTitle') });
    card.append(title);

    const controls = app.current.controlsFor?.() ?? [];
    if (controls.length) {
      const head = Object.assign(document.createElement('h3'), { className: 'pause__sub', textContent: t('controlsTitle') });
      const list = document.createElement('dl');
      list.className = 'pause__controls';
      for (const [keys, action] of controls) {
        const dt = Object.assign(document.createElement('dt'), { textContent: keys });
        const dd = Object.assign(document.createElement('dd'), { textContent: action });
        list.append(dt, dd);
      }
      card.append(head, list);
    }

    const row = document.createElement('div');
    row.className = 'pause__actions';
    const button = (key, cls, fn) => {
      const b = Object.assign(document.createElement('button'), { type: 'button', className: `btn ${cls}`, textContent: t(key) });
      b.addEventListener('click', fn);
      row.append(b);
      return b;
    };
    const go = button('pauseResume', 'btn--primary', () => this.close());
    button('pauseRestart', 'btn--secondary', () => { this.close(false); app.startGame(app.currentGame); });
    button('menu', 'btn--secondary', () => { this.close(false); app.showMenu(); });
    card.append(row);
    el.append(card);
    // A click beside the card continues, like Escape.
    el.addEventListener('pointerdown', (e) => { if (e.target === el) this.close(); });
    app.stage.append(el);
    this.el = el;
    go.focus();
    return true;
  }

  /** Closes the dialog; the game and its sound go on. */
  close(resumeSound = true) {
    if (!this.el) return;
    this.el.remove();
    this.el = null;
    this.app.engine.setPaused(false);
    if (resumeSound) music.resume(); else music.held = null;
    this.app.engine.canvas.focus?.();
  }
}
