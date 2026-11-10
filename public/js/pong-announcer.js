// Arena announcer for AI Pong and the AI Arena: big glowing callouts in 3D plus recorded
// voice lines. No synthesized browser voice: lines without a recording are shown only.
// Callouts are bilingual (i18n keys, variants separated by "|").
import * as THREE from 'three';
import { Panel } from './ui3d.js';
import { color, hex, font } from './tokens.js';
import { t, getLang } from './i18n.js';
import { radialTexture } from './robot-visuals.js';
import { sfx, audioContext } from './sfx.js';
import { music } from './music.js';

const KEY = 'kiar.announcer';

// Recorded announcer lines (German voice, public/assets/sounds/pong). The file name matches
// the spoken text. The callout shows that text in German and its meaning in English.
const CLIP_TEXT = {
  losgehts: { de: 'Los geht\u2019s!', en: 'Here we go!' },
  treffer: { de: 'Treffer!', en: 'Hit!' },
  nice: { de: 'Nice!', en: 'Nice!' },
  fantastisch: { de: 'Fantastisch!', en: 'Fantastic!' },
  dreifachschlag: { de: 'Dreifachschlag!', en: 'Triple strike!' },
  dudominierst: { de: 'Du dominierst!', en: 'You dominate!' },
  dubisteseinfach: { de: 'Du bist es einfach!', en: 'You are simply the one!' },
  megaballwechsel: { de: 'Mega-Ballwechsel!', en: 'Mega rally!' },
  kurvenball: { de: 'Kurvenball!', en: 'Curveball!' },
  abpraller: { de: 'Abpraller!', en: 'Ricochet!' },
  matchball: { de: 'Matchball!', en: 'Match point!' },
  diekitrifft: { de: 'Die KI trifft!', en: 'The AI scores!' },
  diekidominiert: { de: 'Die KI dominiert!', en: 'The AI dominates!' },
  duverlierst: { de: 'Du verlierst!', en: 'You lose!' },
  waswardassdenn: { de: 'Was war das denn?', en: 'What was that?' },
};
// Which recordings fit which moment (several = picked at random).
const CLIPS = {
  pongCallFight: ['losgehts'], pongCallScore: ['treffer', 'nice', 'fantastisch'], pongCallDouble: ['nice', 'fantastisch'],
  pongCallTriple: ['dreifachschlag'], pongCallUnstoppable: ['dudominierst'], pongCallRallyWin: ['megaballwechsel'],
  pongCallAiScore: ['diekitrifft', 'diekitrifft', 'waswardassdenn'], pongCallAiDominate: ['diekidominiert'],
  pongCallMatchPoint: ['matchball'], pongCallPerfect: ['dubisteseinfach'], pongCallWin: ['dubisteseinfach', 'fantastisch'],
  pongCallLose: ['duverlierst'], pongCallRally10: ['megaballwechsel'],
  pongCallRally20: ['fantastisch'], pongCallCurve: ['kurvenball'], pongCallChampion: ['dubisteseinfach'],
  pongCallRead: ['waswardassdenn'],
  fightCallFirst: ['losgehts'], fightCallChampion: ['dubisteseinfach'], fightCallSpecial: ['fantastisch'],
  fightCallThrow: ['treffer'], fightCallBlock: ['abpraller'], fightCallRead: ['diekitrifft', 'waswardassdenn'],
};
const buffers = new Map();
function loadClip(name) {
  if (!buffers.has(name)) {
    const ctx = audioContext();
    buffers.set(name, !ctx ? Promise.resolve(null) : fetch(`assets/sounds/pong/${name}.mp3`)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((b) => (b ? ctx.decodeAudioData(b) : null))
      .catch(() => null));
  }
  return buffers.get(name);
}

export class Announcer {
  constructor(scene) {
    this.scene = scene;
    try { this.enabled = localStorage.getItem(KEY) !== 'off'; } catch { this.enabled = true; }
    this.current = null;
    this.busyUntil = 0;
    // Preload the recordings so they play without delay.
    Object.keys(CLIP_TEXT).forEach(loadClip);
  }

  setEnabled(v) {
    this.enabled = v;
    try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch { /* private mode */ }
    if (!v) { try { this.source?.stop(); } catch { /* already stopped */ } }
  }

  /**
   * Shows a line big in the room. Where a recording fits (or `clips` names some), it plays
   * and the callout shows its text; otherwise the callout is shown without voice.
   */
  say(key, params = {}, token = 'xr-pong-predict', { priority = false, clips = CLIPS[key] } = {}) {
    const now = performance.now();
    if (!priority && now < this.busyUntil) return;
    this.busyUntil = now + 1300;
    sfx.announce();
    if (clips?.length) {
      const name = clips[Math.floor(Math.random() * clips.length)];
      this.show(CLIP_TEXT[name][getLang()] ?? CLIP_TEXT[name].de, token);
      this.playClip(name);
      return;
    }
    const variants = t(key, params).split('|');
    this.show(variants[Math.floor(Math.random() * variants.length)], token);
  }

  playClip(name) {
    if (!this.enabled) return;
    loadClip(name).then((buf) => {
      const ctx = audioContext();
      if (!buf || !ctx || !this.enabled) return;
      this.source?.stop();
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const g = ctx.createGain();
      g.gain.value = 1;
      src.connect(g).connect(ctx.destination);
      src.start();
      this.source = src;
      music.duck(buf.duration + 0.2); // music steps back while the announcer speaks
    });
  }

  /** Big callout: zooms in, holds, then rises and fades. */
  show(text, token) {
    const s = this.scene;
    this.current?.removeFromParent();
    const g = new THREE.Group();
    const c = hex(token);
    const panel = new Panel(1.3, 0.22, (ctx, p) => {
      const W = p.canvas.width;
      const H = p.canvas.height;
      ctx.clearRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Measured in capitals, as drawn (the glow stroke adds a little).
      const caps = text.toUpperCase();
      let size = p.m(0.12);
      do { ctx.font = font('black', size); size -= p.m(0.004); } while (ctx.measureText(caps).width + p.m(0.03) > W * 0.94 && size > p.m(0.04));
      ctx.lineJoin = 'round';
      ctx.shadowColor = color(token);
      ctx.shadowBlur = p.m(0.03);
      ctx.lineWidth = p.m(0.012);
      ctx.strokeStyle = color('xr-pong-table');
      ctx.strokeText(text.toUpperCase(), W / 2, H / 2);
      ctx.fillStyle = color(token);
      ctx.fillText(text.toUpperCase(), W / 2, H / 2);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText(text.toUpperCase(), W / 2, H / 2 - p.m(0.004));
    });
    panel.material.depthTest = false;
    panel.renderOrder = 20;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), color: c, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
    glow.scale.set(1.5, 0.45, 1);
    glow.renderOrder = 19;
    glow.userData.noFit = true;
    g.add(glow, panel);
    g.userData.noFit = true;
    g.position.set(0, s.eye + 0.2, -1.2);
    s.add(g);
    this.current = g;
    let age = 0;
    const life = 1.5;
    g.userData.tick = (dt) => {
      age += dt;
      const kIn = Math.min(1, age / 0.18);
      const scale = 1.6 - 0.6 * (1 - (1 - kIn) ** 3);
      const out = Math.max(0, (age - (life - 0.4)) / 0.4);
      g.scale.setScalar(scale * (1 + out * 0.15));
      g.position.y = s.eye + 0.2 + out * 0.08;
      panel.material.opacity = Math.min(kIn, 1 - out);
      glow.material.opacity = 0.5 * Math.min(kIn, 1 - out);
      if (age >= life) { g.removeFromParent(); if (this.current === g) this.current = null; }
    };
  }

  update(dt) {
    this.current?.userData.tick?.(dt);
  }

  stop() {
    try { this.source?.stop(); } catch { /* already stopped */ }
    this.current?.removeFromParent();
    this.current = null;
  }
}
