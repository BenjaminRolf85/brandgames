// Event and trade fair mode (open the app with ?event, end it with ?event=off):
// shorter rounds, an attract screen with Echo, and a fresh start for every guest. A guest's
// data (badges, best scores, learning progress, name) is cleared when the headset is taken off
// for a while or nobody has done anything for a while.
import * as THREE from 'three';
import { Button, textPanel } from './ui3d.js';
import { layoutRow } from './scene.js';
import { color } from './tokens.js';
import { t } from './i18n.js';
import { resetBadges } from './badges.js';
import { resetProgress } from './progress.js';

function detect() {
  try {
    const q = new URLSearchParams(location.search);
    if (q.get('event') === 'off') { sessionStorage.removeItem('kiar.event'); return false; }
    if (q.has('event')) sessionStorage.setItem('kiar.event', '1');
    return sessionStorage.getItem('kiar.event') === '1';
  } catch { return false; }
}

export const EVENT = detect();

/** Round lengths in event mode. */
export const EVENT_ROUNDS = { pongWin: 3, fightOpponents: 1 };

const IDLE_ASK = 75; // s without input (and a still headset) until "still there?"
const IDLE_COUNTDOWN = 15; // s to answer before the next guest starts
const AWAY_RESET = 20; // s with the headset taken off (session hidden) until the reset

/** Clears everything a guest leaves on this device. */
export function clearGuestData() {
  resetBadges();
  resetProgress();
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k.startsWith('kiar.best.') || k === 'kiar.name' || k === 'kiar.onboarded') localStorage.removeItem(k);
    }
  } catch { /* private mode */ }
}

export class EventKiosk {
  constructor(app) {
    this.app = app;
    this.engine = app.engine;
    this.idle = 0;
    this.away = 0;
    this.prompt = null;
    this.lastPos = new THREE.Vector3();
    this.lastQuat = new THREE.Quaternion();
    const wake = () => this.activity();
    this.engine.onPress = wake;
    ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'].forEach((ev) => window.addEventListener(ev, wake, { passive: true }));
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.hiddenAt = performance.now(); else this.back(); });
    this.engine.updaters.add((dt) => this.update(dt));
  }

  activity() {
    this.idle = 0;
  }

  /** The page or the headset view came back: reset if it was away long enough. */
  back() {
    if (this.hiddenAt && performance.now() - this.hiddenAt > AWAY_RESET * 1000) this.nextGuest();
    this.hiddenAt = 0;
  }

  watchSession() {
    const s = this.engine.session;
    if (!s || s === this.session) return;
    this.session = s;
    // Quest: taking the headset off hides the immersive session; putting it on shows it again.
    s.addEventListener('visibilitychange', () => {
      if (s.visibilityState === 'hidden') this.hiddenAt = performance.now();
      else this.back();
    });
  }

  update(dt) {
    this.watchSession();
    if (!this.app.visitActive) { this.idle = 0; return; }
    // In the headset, a moving head counts as activity (watching, dodging in Pong).
    if (this.engine.isXR && this.engine.head?.pos) {
      const { pos, quat } = this.engine.head;
      if (pos.distanceTo(this.lastPos) > 0.03 || quat.angleTo(this.lastQuat) > 0.06) {
        this.lastPos.copy(pos);
        this.lastQuat.copy(quat);
        this.activity();
      }
    }
    this.idle += dt;
    if (!this.prompt && this.idle > IDLE_ASK) this.ask();
    if (this.prompt) {
      this.prompt.left -= dt;
      this.prompt.panel.redraw();
      if (this.idle < 1) this.dismiss();
      else if (this.prompt.left <= 0) this.nextGuest();
    }
  }

  /** "Still there?" in front of the player with a countdown. */
  ask() {
    const { engine } = this;
    const group = new THREE.Group();
    const eye = engine.eye;
    const dist = engine.dist * 0.9;
    const state = { left: IDLE_COUNTDOWN };
    const panel = textPanel(0.8, 0.2, () => [
      { text: t('eventIdle'), size: 'xr-text-md', weight: 'bold', gap: 0.015 },
      { text: `${Math.max(0, Math.ceil(state.left))}`, size: 'xr-text-title', weight: 'black', color: color('xr-warning') },
    ], { surface: { stroke: color('xr-warning') } });
    panel.position.set(0, eye + 0.05, -dist);
    const stay = new Button(0.36, 0.12, { label: t('eventStay'), variant: 'primary', onClick: () => this.dismiss() });
    const next = new Button(0.34, 0.12, { label: t('eventNext'), onClick: () => this.nextGuest() });
    layoutRow([stay, next], panel.position.y - panel.h / 2 - 0.04 - stay.h / 2, -dist, 0.04);
    group.add(panel, stay, next);
    engine.root.add(group);
    // Only the question is visible meanwhile.
    this.hidden = this.app.current?.group;
    if (this.hidden) this.hidden.visible = false;
    this.prompt = Object.assign(state, { group, panel });
    this.idle = IDLE_ASK + 0.5; // the prompt itself is not activity
  }

  dismiss() {
    if (!this.prompt) return;
    if (this.hidden) this.hidden.visible = true;
    this.hidden = null;
    this.prompt.group.removeFromParent();
    this.prompt.group.traverse((o) => { if (o.dispose) o.dispose(); });
    this.prompt = null;
    this.idle = 0;
  }

  /** Clears the guest's data and goes back to the attract screen. */
  nextGuest() {
    this.dismiss();
    clearGuestData();
    this.app.host?.heard.clear();
    this.app.visitActive = false;
    if (this.app.current) this.app.showHome();
  }
}
