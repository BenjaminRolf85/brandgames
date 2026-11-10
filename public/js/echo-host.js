// Echo as host: speech bubbles next to the game panels, Echo flying beside them, chirping
// while it "talks", and a tappable Echo. Everything a scene creates here lives in the scene's
// layer, so it disappears with the next clearLayer() and Echo goes back to free flight.
import * as THREE from 'three';
import { Panel, measureBlocks } from './ui3d.js';
import { color, num } from './tokens.js';
import { L } from './i18n.js';
import { drawIcon } from './icons.js';
import { echoVoice } from './echo-voice.js';
import { ECHO_LINES } from './echo-lines.js';
import { allEarned } from './badges.js';
import { SEASON } from './config.js';

const CHRISTMAS = SEASON === 'christmas';

const BW = 0.56; // default bubble width (m)
const ICON = 0.07; // speaker badge
const WPS = 9; // words per second while the text types itself

/** A host line in the current language; {name}-style placeholders are filled from vars. */
export function line(id, vars = {}) {
  const obj = ECHO_LINES[id];
  return (obj ? L(obj) : id).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}

/**
 * Speech bubble: speaker badge (icon in a soft circle), name, and a text that appears word by
 * word (greedy wrapping is prefix-stable, so lines never jump while it types).
 */
export function speechBubble(text, { w = BW, icon = 'bat', name = 'Echo', token = 'xr-accent' } = {}) {
  const pad = num('xr-padding');
  const col = ICON + pad * 0.4; // text column starts right of the speaker badge
  const words = text.split(' ');
  const blocks = (shown) => [
    { text: name.toUpperCase(), size: 'xr-text-sm', weight: 'black', color: color(token), gap: 0.008 },
    { text: shown, size: 'xr-text-sm', color: color('xr-panel-text') },
  ];
  const h = Math.max(0.13, measureBlocks(blocks(text), w - col, pad));
  const bubble = new Panel(w, h, (ctx, p) => {
    p.surface({ stroke: color(token), strokeWidth: num('xr-border-width') * 1.5, stripe: false });
    const cx = p.m(pad + ICON / 2);
    const cy = p.m(pad + ICON / 2);
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = color(token);
    ctx.beginPath();
    ctx.arc(cx, cy, p.m(ICON / 2), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    drawIcon(ctx, icon, cx, cy, p.m(ICON * 0.66), color(token));
    const n = p.state.words ?? words.length;
    p.blocks(blocks(words.slice(0, n).join(' ')), { x: col, w: w - col, align: 'left', valign: 'top', pad });
  });
  bubble.words = words.length;
  return bubble;
}

export class EchoHost {
  constructor(app) {
    this.app = app;
    this.engine = app.engine;
    this.echo = app.echo;
    this.heard = new Set(); // lines already spoken (with chirps) in this session
  }

  /** Narrow browser screens (phone in portrait): bubbles go above the panel. */
  get narrow() {
    return !this.engine.isXR && window.innerWidth / window.innerHeight < 0.95;
  }

  /**
   * Echo flies to a point given in obj's local space and looks at the player; returns a
   * release function that restores what Echo did before (free flight or a game companion).
   */
  hold(obj, local, { force = false } = {}) {
    const e = this.echo;
    if (!e || e.suppressed || (!e.enabled && !force)) return () => {};
    const prev = { fn: e.companion, forced: e.forced };
    const p = local.clone();
    const claim = (h) => ({ target: obj.localToWorld(p.clone()), look: h.pos });
    e.setCompanion(claim, { force });
    return () => { if (e.companion === claim) e.setCompanion(prev.fn, { force: prev.forced }); };
  }

  /**
   * Echo says something. Placement: next to `anchor` (a panel in the scene's layer, on `side`
   * -1 left / 1 right; above it on narrow screens) or at `at` = { x, top, z }.
   * id: line id (recording, and chirps only the first time per session).
   */
  say(scene, text, { anchor = null, at = null, side = -1, w = BW, id = null, icon = 'bat', force = false, mood = null } = {}) {
    const narrow = this.narrow;
    const bw = narrow && anchor ? Math.min(Math.max(anchor.w, BW), 0.9) : w;
    const bubble = speechBubble(text, { w: bw, icon });
    const xr = this.engine.isXR;
    let spot;
    if (anchor) {
      const top = anchor.position.y + anchor.h / 2;
      if (narrow) {
        // Above the panel, and above the status bar if the scene has one.
        let bottom = top + 0.035;
        scene.group.traverse((o) => { if (o.userData.hud && o.visible) bottom = Math.max(bottom, o.position.y + o.h / 2 + 0.03); });
        bubble.position.set(anchor.position.x, bottom + bubble.h / 2, anchor.position.z);
        spot = new THREE.Vector3(-bw / 2 + 0.06, bubble.h / 2 + 0.13, 0.06);
      } else {
        bubble.position.set(anchor.position.x + side * (anchor.w / 2 + 0.035 + bw / 2), top - bubble.h / 2, anchor.position.z + 0.03);
        // In the headset the bubble turns to the player; the browser camera looks straight on.
        if (xr) bubble.rotation.set(0, Math.atan2(-bubble.position.x, -bubble.position.z), 0);
        spot = new THREE.Vector3(side * (bw / 2 + 0.13), bubble.h / 2 - 0.02, 0.06);
      }
    } else {
      const a = at ?? { x: 0, top: scene.eye + 0.4, z: -scene.dist };
      bubble.position.set(a.x, a.top - bubble.h / 2, a.z);
      spot = narrow ? new THREE.Vector3(-bw / 2 + 0.06, bubble.h / 2 + 0.13, 0.06) : new THREE.Vector3(side * (bw / 2 + 0.14), bubble.h / 2 - 0.03, 0.06);
    }
    scene.add(bubble);
    scene.popIn(bubble);
    bubble.spot = spot;
    if (!xr) {
      // Browser preview: an invisible box where Echo hovers, so the camera fit keeps Echo on screen.
      const fit = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.05), new THREE.MeshBasicMaterial({ visible: false }));
      fit.position.copy(spot);
      bubble.add(fit);
    }
    const release = this.hold(bubble, spot, { force });
    scene.onDispose(release);
    if (mood === 'happy') this.echo?.celebrate();

    // Speak: the first time with the text typing itself and chirps, afterwards at once.
    const key = id ?? text;
    const first = !this.heard.has(key);
    this.heard.add(key);
    const pos = () => (this.echo?.root.visible ? this.echo.worldPos() : bubble.getWorldPosition(new THREE.Vector3()));
    if (first) {
      bubble.set({ words: 0 });
      let t = 0;
      const fn = scene.onUpdate((dt) => {
        if (!bubble.parent) { scene.offUpdate(fn); return; }
        t += dt;
        const n = Math.min(bubble.words, 1 + Math.floor(t * WPS));
        bubble.set({ words: n });
        if (n >= bubble.words) scene.offUpdate(fn);
      });
      echoVoice.talk(this.engine, pos(), {
        id, text,
        onSyllable: (s) => scene.delay(s, () => this.echo?.face?.setMood('call', 0.09)),
      });
    } else {
      echoVoice.chirp(this.engine, pos(), mood === 'happy' ? 'happy' : 'hello', 0.12);
    }
    return bubble;
  }

  /** Echo introduces a game next to its intro panel (key: e.g. 'pong', 'robot0'). */
  introduce(scene, key, anchor, opts = {}) {
    // The Christmas edition has its own lines for some games (e.g. the quiz's tree).
    const id = CHRISTMAS && ECHO_LINES[`intro_${key}_xmas`] ? `intro_${key}_xmas` : `intro_${key}`;
    if (!ECHO_LINES[id] || !this.echo?.enabled) return null;
    return this.say(scene, line(id), { anchor, id, ...opts });
  }

  /** Echo announces a new badge of the AI licence next to a results panel. */
  badge(scene, badge, anchor) {
    const text = allEarned() ? line('badgeAll') : line('badgeNew', { name: L(badge.name) });
    return this.say(scene, text, { anchor, id: allEarned() ? 'badgeAll' : null, icon: 'badge', mood: 'happy' });
  }

  /** Makes Echo tappable while the scene's layer lives: an invisible hit sphere follows it. */
  tappable(scene, onTap, { radius = 0.17 } = {}) {
    const e = this.echo;
    if (!e) return null;
    const hit = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.userData.noFit = true;
    hit.userData.interactive = true;
    hit.userData.label = 'Echo';
    hit.userData.setHover = (v) => { if (v) e.face?.setMood('surprised', 0.45); };
    hit.userData.onClick = () => {
      echoVoice.chirp(this.engine, e.worldPos(), 'tap');
      onTap?.();
    };
    scene.add(hit);
    const tmp = new THREE.Vector3();
    const fn = scene.onUpdate(() => {
      if (!hit.parent) { scene.offUpdate(fn); return; }
      hit.visible = e.ready && e.root.visible;
      if (hit.visible) hit.position.copy(hit.parent.worldToLocal(e.worldPos(tmp)));
    });
    return hit;
  }
}
