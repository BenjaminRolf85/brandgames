// Base class for every screen plus shared building blocks (HUD, intro, results, effects).
import * as THREE from 'three';
import { Button, textPanel } from './ui3d.js';
import { color, hex, num } from './tokens.js';
import { t, L } from './i18n.js';
import { sfx } from './sfx.js';
import { SPONSOR } from './content.js';
import { GAME_MODES, savedName, saveName, submitScore } from './api.js';
import { nameEntry, leaderboardList } from './leaderboard.js';
import { awardFor } from './badges.js';
import { track } from './api.js';
import { EVENT } from './event.js';
import { line } from './echo-host.js';
import { music } from './music.js';
import { MUSIC } from './config.js';
import { screenHud, touchButtons, dragPad } from './touch-ui.js';
import { gameUrl } from './deep-link.js';

export class BaseScene {
  constructor(app) {
    this.app = app;
    this.engine = app.engine;
    this.eye = this.engine.eye;
    this.dist = this.engine.dist;
    this.group = new THREE.Group();
    this.layer = new THREE.Group(); // content that gets cleared between steps
    this.group.add(this.layer);
    this._updaters = [];
    this._tweens = [];
    this._cleanups = [];
    this._sceneCleanups = []; // run only when the scene closes (not between steps)
    this.disposed = false;
  }

  onUpdate(fn) {
    this.engine.updaters.add(fn);
    this._updaters.push(fn);
    return fn;
  }

  offUpdate(fn) {
    this.engine.updaters.delete(fn);
  }

  onDispose(fn) {
    this._cleanups.push(fn);
  }

  /** Like onDispose, but only when the whole scene closes (clearLayer does not run it). */
  onSceneDispose(fn) {
    this._sceneCleanups.push(fn);
  }

  // ---------- phones (browser preview, engine.touchUI) ----------

  /** Big thumb buttons at the bottom of the screen (removed with the scene); null off phones. */
  touchButtons(items, opts) {
    if (!this.engine.touchUI) return null;
    const pad = touchButtons(items, opts);
    this.onSceneDispose(() => pad.remove());
    return pad;
  }

  /** Swipe-to-steer anywhere on the screen (removed with the scene); null off phones. */
  dragPad(opts) {
    if (!this.engine.touchUI) return null;
    const pad = dragPad(this.engine.canvas, opts);
    this.onSceneDispose(() => pad.remove());
    return pad;
  }

  /** Phones: the scene places the camera itself while view(camera, dt, insets) returns true. */
  mobileView(view) {
    if (!this.engine.touchUI) return;
    this.engine.viewOverride = view;
    this.onSceneDispose(() => { if (this.engine.viewOverride === view) this.engine.viewOverride = null; });
  }

  tween(duration, onUpdate, opts) {
    const tw = this.engine.tween(duration, onUpdate, opts);
    this._tweens.push(tw);
    return tw;
  }

  delay(sec, fn) {
    return this.tween(sec, () => {}, { onDone: fn });
  }

  add(obj, parent = this.layer) {
    parent.add(obj);
    return obj;
  }

  /** Fades and scales an object in. */
  popIn(obj, delay = 0) {
    obj.scale.setScalar(0.001);
    const mats = [];
    obj.traverse((o) => { if (o.material) mats.push(o.material); });
    mats.forEach((m) => { m.transparent = true; m.opacity = 0; });
    this.delay(delay, () => {
      this.tween(num('xr-pop-duration'), (k) => {
        obj.scale.setScalar(0.85 + 0.15 * k);
        mats.forEach((m) => { m.opacity = k; });
      }, { onDone: () => obj.redraw?.() });
    });
    return obj;
  }

  clearLayer() {
    this._cleanups.splice(0).forEach((fn) => fn());
    disposeTree(this.layer);
    this.layer.clear();
  }

  dispose() {
    this.disposed = true;
    // Leaving a game ends its music; the welcome song (Christmas edition) goes on through the
    // menu and a game's intro until the game's own song starts.
    if (music.track !== 'start') music.stop();
    this._cleanups.splice(0).forEach((fn) => fn());
    this._sceneCleanups.splice(0).forEach((fn) => fn());
    this._updaters.forEach((fn) => this.engine.updaters.delete(fn));
    this._tweens.forEach((tw) => { tw.cancelled = true; });
    disposeTree(this.group);
    this.group.removeFromParent();
  }


  // ---------- music ----------

  /** Shuffles the playlist and buffers its first track during the intro, so it starts without a gap. */
  prepareMusic(key = this.gameKey ?? this.app.currentGame) {
    if (music.enabled && MUSIC[key]) music.prepare(key);
  }

  /** Echomotion's music for this game (MUSIC in config.js). intensity: -1 calm (quizzes) to 2. */
  startMusic(intensity = 0, key = this.gameKey ?? this.app.currentGame) {
    if (!MUSIC[key]) return;
    music.intensity = intensity;
    music.useTrack(key);
    music.start();
  }

  // ---------- shared screens ----------

  /** Top bar with status text and a menu button. Returns a refresh function. */
  hud(getText) {
    // Tall enough for two lines, so long round names never overflow.
    const info = this.add(textPanel(0.98, 0.15, () => [{ text: getText(), size: 'xr-text-sm', weight: 'bold' }],
      { grow: false, layout: { align: 'left', pad: 0.03 } }), this.group);
    const y = this.eye + 0.66 - info.h / 2;
    info.position.set(-0.15, y, -this.dist);
    const menu = this.add(new Button(0.26, info.h, { label: t('menu'), labelSize: 'xr-text-sm', grow: false, onClick: () => this.app.showMenu() }), this.group);
    menu.position.set(0.5, y, -this.dist);
    info.userData.hud = true; // speech bubbles keep clear of it on narrow screens
    menu.userData.hud = true;
    // Phones: the status bar is a screen element at the top, readable and out of the game's way.
    if (this.engine.touchUI) {
      info.visible = false;
      menu.visible = false;
      const bar = screenHud({ onMenu: () => this.app.showMenu() });
      this.onSceneDispose(() => bar.remove());
      bar.set(getText());
      return () => bar.set(getText());
    }
    return () => info.redraw();
  }

  intro(title, text, onStart) {
    this.clearLayer();
    const panel = this.add(textPanel(1.1, 0.4, [
      { text: title, size: 'xr-text-title', weight: 'black', gap: 0.04 },
      { text, size: 'xr-text-md', color: color('xr-panel-muted'), gap: 0.04 },
      { text: L(SPONSOR.presentedBy), size: 'xr-text-sm', weight: 'bold', color: color('xr-warning') },
    ]));
    panel.position.set(0, this.eye + 0.44 - panel.h / 2, -this.dist);
    // Quiz games: the music runs calm under the questions.
    const go = this.add(new Button(0.42, 0.13, { label: t('start'), variant: 'primary', labelSize: 'xr-text-lg', onClick: () => { this.startMusic(-1); onStart(); } }));
    go.position.set(0, panel.position.y - panel.h / 2 - 0.05 - go.h / 2, -this.dist);
    this.popIn(panel);
    this.popIn(go, 0.1);
    this.app.host?.introduce(this, this.gameKey ?? this.app.currentGame, panel);
    this.prepareMusic();
  }

  /**
   * Results screen with a learning recap.
   * learned: [{ q, a }] already localized (question and correct answer of missed items).
   */
  results(data) {
    const { gameKey, score } = data;
    const best = getBest(gameKey);
    data.isNew = score > best;
    data.best = Math.max(best, score);
    if (data.isNew) setBest(gameKey, score);
    data.badge = awardFor(data); // AI licence: a new badge for this game's topic?
    track('finish', gameKey, EVENT);
    sfx.finish(); // the music keeps going ("again" goes straight on); leaving the game ends it
    this.resultData = data;
    this.showResults(true);
  }

  showResults(celebrate = false) {
    const { gameKey, score, correct, total, learned = [], onAgain, isNew, best, submitted } = this.resultData;
    const { eye, dist } = this;
    this.clearLayer();
    const top = eye + 0.44;

    const scorePanel = this.add(textPanel(0.58, 0.42, [
      { text: t('results'), size: 'xr-text-md', weight: 'bold', color: color('xr-panel-muted'), gap: 0.02 },
      { text: String(score), size: 0.12, weight: 'black', gap: 0.005 },
      { text: t('score'), size: 'xr-text-md', weight: 'bold', gap: 0.03 },
      { text: this.resultData.line ?? t('correctOf', { n: correct, total }), size: 'xr-text-md', gap: 0.02 },
      { text: isNew ? t('newBest') : `${t('best')}: ${best}`, size: 'xr-text-md', weight: 'bold', color: color(isNew ? 'xr-warning' : 'xr-accent'), gap: 0.03 },
      // The quizzes' knowledge house (only an object with a rating; other games may use the name).
      ...(typeof this.house?.rating === 'function' ? [
        { text: t('houseName'), size: 'xr-text-sm', color: color('xr-panel-muted'), gap: 0.005 },
        { text: t(this.house.rating()), size: 'xr-text-md', weight: 'bold', color: color('xr-success') },
      ] : []),
    ]));
    const recap = learned.length
      ? [{ text: t('takeaway'), size: 'xr-text-lg', weight: 'bold', gap: 0.03 },
        ...learned.slice(0, 3).flatMap((it) => [
          { text: it.q, size: 'xr-text-sm', color: color('xr-panel-muted'), gap: 0.008 },
          { text: it.a, size: 'xr-text-sm', weight: 'bold', color: color('xr-success'), gap: 0.03 },
        ])]
      : [{ text: t('perfectTitle'), size: 'xr-text-lg', weight: 'bold', gap: 0.03 },
        { text: t('perfectText'), size: 'xr-text-md', color: color('xr-panel-muted') }];
    const recapPanel = this.add(textPanel(0.66, 0.42, recap, { layout: { align: 'left' } }));
    const rowH = Math.max(scorePanel.h, recapPanel.h);
    scorePanel.position.set(-0.35, top - scorePanel.h / 2, -dist);
    recapPanel.position.set(0.31, top - recapPanel.h / 2, -dist);

    const sponsor = this.add(textPanel(1.28, 0.1, [
      { text: `${L(SPONSOR.presentedBy)}  ·  ${L(SPONSOR.offer)}`, size: 'xr-text-sm', weight: 'bold', color: color('xr-warning'), gap: 0.01 },
      { text: L(SPONSOR.cta), size: 'xr-text-sm', color: color('xr-panel-muted'), gap: 0.01 },
      { text: SPONSOR.domain, size: 'xr-text-sm', weight: 'bold', color: color('xr-panel-text') },
    ], { surface: { stroke: color('xr-warning') } }));
    sponsor.position.set(0, top - rowH - 0.03 - sponsor.h / 2, -dist);

    const canSubmit = GAME_MODES.includes(gameKey) && score > 0 && !submitted;
    const next = this.resultData.next; // e.g. the next level of Echo Parkour
    const buttons = [
      ...(next ? [new Button(0.42, 0.12, { label: next.label, variant: 'success', onClick: next.onClick })] : []),
      new Button(0.36, 0.12, { label: t('again'), variant: next ? 'secondary' : 'primary', onClick: onAgain }),
      ...(canSubmit ? [new Button(0.46, 0.12, { label: t('submitScore'), variant: 'sponsor', onClick: () => this.submitFlow() })] : []),
      new Button(0.3, 0.12, { label: t('menu'), onClick: () => this.app.showMenu() }),
    ];
    const by = sponsor.position.y - sponsor.h / 2 - 0.04;
    const btnH = Math.max(...buttons.map((b) => b.h));
    layoutRow(buttons, by - btnH / 2, -dist);
    // Event mode: the result (licence code and QR) to take home on the phone.
    if (EVENT) {
      const qr = new Button(0.5, 0.11, { label: t('eventScan'), variant: 'sponsor', labelSize: 'xr-text-sm', onClick: () => this.showTakeaway() });
      qr.position.set(0, by - btnH - 0.03 - qr.h / 2, -dist);
      buttons.push(qr);
    } else if (!this.engine.isXR && score > 0 && (navigator.share || navigator.clipboard)) {
      // Browser and phones: share the result as a link that opens this game with the score to beat.
      const share = new Button(0.42, 0.1, { label: t('shareResult'), labelSize: 'xr-text-sm', onClick: () => this.shareResult(share) });
      share.position.set(0, by - btnH - 0.03 - share.h / 2, -dist);
      buttons.push(share);
    }
    [scorePanel, recapPanel, sponsor, ...buttons].forEach((o, i) => this.popIn(this.add(o), i * 0.06));
    if (celebrate && correct / total >= 0.7) this.burst(scorePanel.getWorldPosition(new THREE.Vector3()), 'xr-warning', 40);
    if (celebrate && this.resultData.badge) this.app.host?.badge(this, this.resultData.badge, scorePanel);
  }

  /** Shares the result (system share sheet on phones, else the link goes to the clipboard). */
  async shareResult(button) {
    const { gameKey, score } = this.resultData;
    const game = t(`${gameKey}Name`);
    const url = gameUrl(gameKey, { score });
    const text = t('shareText', { score, game });
    try {
      if (navigator.share) {
        await navigator.share({ title: t('appTitle'), text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      button.opts.label = t('shareCopied');
      button.redraw();
    } catch { /* cancelled by the player, or not allowed */ }
  }

  /** Event mode: QR code and certificate code for the phone, with a thank-you from Echo. */
  async showTakeaway() {
    const { certificateCard } = await import('./licence-view.js');
    if (this.disposed) return;
    this.clearLayer();
    const { card } = certificateCard(this, { top: this.eye + 0.4, onBack: () => this.showResults() });
    this.app.host?.say(this, line('eventThanks'), { anchor: card, side: 1, id: 'eventThanks', mood: 'happy' });
  }

  /** Name entry with the 3D keyboard, then posts the score and shows the leaderboard. */
  submitFlow() {
    const data = this.resultData;
    this.clearLayer();
    nameEntry(this, {
      initial: savedName(),
      onCancel: () => this.showResults(),
      onSubmit: async (name) => {
        saveName(name);
        this.clearLayer();
        const wait = this.add(textPanel(0.8, 0.16, [{ text: t('sending'), size: 'xr-text-lg', weight: 'bold' }]));
        wait.position.set(0, this.eye + 0.1, -this.dist);
        try {
          const res = await submitScore(data.gameKey, name, data.score);
          if (this.disposed) return;
          data.submitted = true;
          this.clearLayer();
          let bottom = leaderboardList(this, { mode: data.gameKey, data: res, highlight: res.id, top: this.eye + 0.44 });
          const buttons = [
            new Button(0.36, 0.12, { label: t('again'), variant: 'primary', onClick: data.onAgain }),
            new Button(0.36, 0.12, { label: t('menu'), onClick: () => this.app.showMenu() }),
          ];
          // Where this round puts the player in the overall ranking, with a way to see it.
          if (res.overall) {
            const o = res.overall;
            const info = this.add(textPanel(0.92, 0.08, [{ text: t('overallYou', o), size: 'xr-text-sm', weight: 'bold', color: color('xr-warning') }]));
            info.position.set(0, bottom - 0.02 - info.h / 2, -this.dist);
            this.popIn(info, 0.05);
            bottom -= 0.02 + info.h;
            buttons.push(new Button(0.36, 0.12, { label: t('overallName'), variant: 'sponsor', onClick: () => this.app.showLeaderboard('overall') }));
          }
          layoutRow(buttons, bottom - 0.04 - 0.06, -this.dist);
          buttons.forEach((b, i) => this.popIn(this.add(b), 0.1 + i * 0.05));
          if (res.rank <= 3) this.burst(new THREE.Vector3().setFromMatrixPosition(buttons[0].matrixWorld), 'xr-warning', 40);
        } catch {
          if (this.disposed) return;
          this.clearLayer();
          const err = this.add(textPanel(0.9, 0.16, [{ text: t('lbError'), size: 'xr-text-md', weight: 'bold', color: color('xr-danger') }]));
          err.position.set(0, this.eye + 0.1, -this.dist);
          const back = this.add(new Button(0.36, 0.12, { label: t('back'), onClick: () => this.showResults() }));
          back.position.set(0, this.eye - 0.1, -this.dist);
        }
      },
    });
  }

  /** Particle burst at a world position, colored by a token. */
  burst(worldPos, tokenName = 'xr-success', count = 22) {
    const holder = new THREE.Group();
    holder.userData.noFit = true;
    this.group.add(holder);
    const local = this.group.worldToLocal(worldPos.clone());
    const geo = new THREE.IcosahedronGeometry(0.012, 0);
    const mat = new THREE.MeshBasicMaterial({ color: hex(tokenName), transparent: true });
    const parts = [];
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(local);
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.2).normalize();
      parts.push({ m, v: dir.multiplyScalar(0.4 + Math.random() * 0.6) });
      holder.add(m);
    }
    this.tween(0.9, (k) => {
      for (const p of parts) {
        p.m.position.copy(local).addScaledVector(p.v, k * 0.9);
        p.m.position.y -= k * k * 0.15;
        p.m.scale.setScalar(1 - k * 0.6);
      }
      mat.opacity = 1 - k;
    }, {
      ease: (k) => k,
      onDone: () => {
        holder.removeFromParent();
        geo.dispose();
        mat.dispose();
      },
    });
  }
}

/** Centers a row of buttons horizontally at height y. */
export function layoutRow(items, y, z, gap = 0.03) {
  const total = items.reduce((s, b) => s + b.w, 0) + gap * (items.length - 1);
  let x = -total / 2;
  for (const b of items) {
    b.position.set(x + b.w / 2, y, z);
    x += b.w + gap;
  }
}

export function disposeTree(root) {
  root.traverse((o) => {
    o.geometry?.dispose();
    if (o.material) [].concat(o.material).forEach((m) => { m.map?.dispose(); m.dispose(); });
  });
}

// ---------- local best scores ----------

export function getBest(key) {
  try { return Number(localStorage.getItem(`kiar.best.${key}`)) || 0; } catch { return 0; }
}

function setBest(key, value) {
  try { localStorage.setItem(`kiar.best.${key}`, String(value)); } catch { /* ignore */ }
}

/** Decorative floating neural network made of nodes and links. */
export function neuralCloud({ nodes = 34, radius = 0.5 } = {}) {
  const group = new THREE.Group();
  group.userData.noFit = true;
  const pts = [];
  for (let i = 0; i < nodes; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(radius * (0.45 + Math.random() * 0.55));
    v.y *= 0.6;
    pts.push(v);
  }
  const nodeGeo = new THREE.SphereGeometry(0.014, 12, 8);
  const nodeMat = new THREE.MeshStandardMaterial({ color: hex('xr-node'), emissive: hex('xr-node'), emissiveIntensity: 0.6, roughness: 0.4 });
  const inst = new THREE.InstancedMesh(nodeGeo, nodeMat, nodes);
  const m = new THREE.Matrix4();
  pts.forEach((p, i) => inst.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)));
  group.add(inst);

  const seg = [];
  pts.forEach((a, i) => {
    pts.map((b, j) => ({ j, d: a.distanceTo(b) }))
      .filter((o) => o.j > i)
      .sort((x, y) => x.d - y.d)
      .slice(0, 2)
      .forEach(({ j }) => seg.push(a, pts[j]));
  });
  const lineGeo = new THREE.BufferGeometry().setFromPoints(seg);
  const lineMat = new THREE.LineBasicMaterial({ color: hex('xr-glow'), transparent: true, opacity: 0.35 });
  group.add(new THREE.LineSegments(lineGeo, lineMat));

  let time = 0;
  group.userData.tick = (dt) => {
    time += dt;
    group.rotation.y += dt * 0.12;
    lineMat.opacity = 0.25 + 0.15 * Math.sin(time * 1.6);
    nodeMat.emissiveIntensity = 0.5 + 0.3 * Math.sin(time * 2.1);
  };
  return group;
}
