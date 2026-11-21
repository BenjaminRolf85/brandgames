// "AI Pong": 3D tunnel pong played with your own hand against an AI opponent.
// Your paddle moves in width and height at the near end of a neon tunnel; the ball flies
// in all three axes, bounces off the four walls and curves when you hit it with spin.
// The AI counts where you play (per situation), predicts your next shot and moves there
// early. It also remembers where you miss and aims for that spot. Each opponent has its
// own reaction time, paddle speed and precision (PONG_CAST in pong-cast.js; made-up players).
// Browser (Nov 2026 upgrade): desktop and phones look down the tunnel from behind the paddle,
// the keyboard steers too, matches are shorter, and the far wall shows where the AI expects
// your next shot (brighter = more likely): play into the dark and you surprise it.
import * as THREE from 'three';
import { BaseScene, layoutRow } from '../scene.js';
import { Button, Panel, textPanel, placeOnArc } from '../ui3d.js';
import { color, hex, num, font } from '../tokens.js';
import { t } from '../i18n.js';
import { sfx } from '../sfx.js';
import { radialTexture } from '../robot-visuals.js';
import { Shockwaves, makeDust, makeBrain, makeTunnel, makeGlassPaddle, frameGeometry } from '../pong-visuals.js';
import { DataStorm, Obstacles, POWERUPS } from '../pong-events.js';
import { HoloFX, makePortal, makeFresnelShell, RibbonTrail } from '../pong-shaders.js';
import { Announcer } from '../pong-announcer.js';
import { music } from '../music.js';
import { loadPongArena, loadPongBalls } from '../pong-models.js';
import { makePaddleEcho, makePaddleRobot, PONG_CAST, makeGridFloor, makeSkyline, makeHandle } from '../pong-cast.js';
import { makeDataRain } from '../pong-rain.js';
import { ARRoom } from '../ar-room.js';
import { quality } from '../quality.js';
import { aimPad } from '../touch-ui.js';
import { EVENT, EVENT_ROUNDS } from '../event.js';
import { pongLook } from '../pong-look.js';
import { assist } from '../assist.js';
import { pinToScreen, drawOnTop, hudHolder, solid, closeFit } from '../pong-screen.js';

const HW = 0.3; // half tunnel width (m)
const HH = 0.21; // half tunnel height
const LEN = 1.5; // tunnel length
const ZP = LEN / 2; // player paddle plane (near end)
const ZA = -LEN / 2; // AI paddle plane (far end)
const R = 0.028; // ball radius
const PW = 0.085; // half paddle width
const PH = 0.065; // half paddle height
const PPW = 0.1; // your paddle is a bit larger than the AI's (easier)
const PPH = 0.078;
// The whole arena is scaled uniformly (same proportions, same physics in local units).
const SCALE = 1.25;
const NEAR_GAP = 0.5; // distance from the eyes to your paddle plane (m)
const TUNNEL_Z = -(NEAR_GAP + (LEN * SCALE) / 2); // tunnel center in front of the player
const TUNNEL_DROP = 0.17; // tunnel center below eye height (hands rest a bit lower)
const WIN_XR = 5; // points for a match in the headset
const WIN_SCREEN = 3; // ... and in the browser, so a whole tournament takes about three minutes
const MATCH_POINTS = 500; // a match's points are worth this much in total (100 each in the headset)
const TRICK_POINTS = 20; // a shot into a zone the AI did not expect
const RANKS = [900, 3300]; // result: from here "pro" (about one opponent beaten), from here "champion" (about all three)
const KEY_SPEED = 1.25; // keyboard: paddle speed (m/s in tunnel units)
const HUD_PX = 76; // desktop: screen height kept free for the status bar
const LEARNED = 3; // shots the AI needs before it shows and uses a prediction
const S0 = 0.75; // serve speed along the tunnel (m/s)
const S_MAX = 1.7;
const S_UP = 1.05;
// Global ease-up for all opponents: slower paddle, slightly later reaction, aims at
// your weak spots less often.
// speed: paddle speed factor, reaction: extra seconds, randomAim: share of shots not aimed
// at your weak spot, catchError: how much imprecision spoils catching, misjudge: chance of
// badly misreading a shot. Opponents can override it (the nemesis is eased far less).
const PONG_EASE = { speed: 0.82, reaction: 0.05, randomAim: 0.5, catchError: 1.25, misjudge: 0.08 };
const MAX_HIT_POINTS = 600; // per match, so endless rallies don't break the leaderboard
const CURVE = 1.0; // how strongly paddle movement at the hit becomes spin
const SPIN_DECAY = 1.1;
const TRACK_Z = 0.03; // the AI only "sees" the real path once the ball is about halfway
const STEP = 0.006; // physics sub-step (s)
const ZONES = 9; // 3 x 3 target zones on the far wall
const VIEW_FOV = 64; // browser: field of view of the first-person camera

const clamp = THREE.MathUtils.clamp;
const WHITE = new THREE.Color(0xffffff);
const LX = HW - R;
const LY = HH - R;

// Ball types: r radius, rest wall bounce (1 = normal), decay how fast spin fades,
// curve how much spin a hit gives, speed factor, slide: spin keeps pushing along walls.
const BALLS = [
  { key: 'energy', r: R, rest: 1, decay: SPIN_DECAY, curve: 1, speed: 1, slide: false, tint: null, mix: 0 },
  { key: 'damper', r: R * 1.2, rest: 0.5, decay: 1.6, curve: 0.6, speed: 0.92, slide: false, tint: 'xr-pong-damper', mix: 0.35 },
  { key: 'ice', r: R, rest: 0.9, decay: 0.3, curve: 1.8, speed: 1, slide: true, tint: 'xr-pong-ice', mix: 0.45 },
  { key: 'bouncy', r: R * 0.85, rest: 1.35, decay: 1.1, curve: 1, speed: 1.05, slide: false, tint: 'xr-pong-bouncy', mix: 0.4 },
];
const zoneOf = (x, y) => clamp(Math.floor(((x + HW) / (2 * HW)) * 3), 0, 2) + 3 * clamp(Math.floor(((HH - y) / (2 * HH)) * 3), 0, 2);
/** The opponents' names are made up and live in i18n.js. */
const oppName = (o) => t(`pongOpp_${o.key}`);
const zoneXY = (z) => ({ x: -HW + ((z % 3) + 0.5) * ((2 * HW) / 3), y: HH - (Math.floor(z / 3) + 0.5) * ((2 * HH) / 3) });

// ---------- the AI's memory ----------

class PatternModel {
  constructor() {
    this.global = new Float32Array(ZONES);
    this.byIn = Array.from({ length: ZONES }, () => new Float32Array(ZONES)); // where the ball reached you
    this.byLast = Array.from({ length: ZONES }, () => new Float32Array(ZONES)); // your previous shot
    this.n = 0;
  }

  /** Probability per zone, blending your general habit with situation-specific habits. */
  dist(inZone, last) {
    const parts = [[this.global, 1], [this.byIn[inZone], 1.5]];
    if (last >= 0) parts.push([this.byLast[last], 1.5]);
    const p = new Float32Array(ZONES);
    let wsum = 0;
    for (const [c, k] of parts) {
      const n = c.reduce((a, b) => a + b, 0);
      if (n < 0.5) continue;
      const w = (k * Math.min(n, 6)) / 6;
      for (let z = 0; z < ZONES; z++) p[z] += (w * (c[z] + 0.15)) / (n + 0.15 * ZONES);
      wsum += w;
    }
    if (!wsum) return p.fill(1 / ZONES);
    for (let z = 0; z < ZONES; z++) p[z] /= wsum;
    return p;
  }

  learn(inZone, last, zone) {
    // Older habits fade slowly, so the AI adapts when you change your style.
    const fade = (c) => { for (let z = 0; z < ZONES; z++) c[z] *= 0.93; };
    fade(this.global);
    fade(this.byIn[inZone]);
    this.global[zone] += 1;
    this.byIn[inZone][zone] += 1;
    if (last >= 0) { fade(this.byLast[last]); this.byLast[last][zone] += 1; }
    this.n += 1;
  }
}

// ---------- scene ----------

export class PongScene extends BaseScene {
  constructor(app) {
    super(app);
    this.prepareMusic('pong'); // buffer the track during the intro
    this.time = 0;
    this.mode = 'intro';
    const e = this.engine;
    this.screen = !e.isXR; // browser (desktop or phone): first-person view, screen-anchored texts
    this.desktop = !e.isXR && !e.touchUI;
    this.win = EVENT ? EVENT_ROUNDS.pongWin : e.isXR ? WIN_XR : WIN_SCREEN;
    this.pointValue = EVENT ? 100 : Math.round(MATCH_POINTS / this.win);
    this.calm = assist.reducedMotion; // calm motion: no flashes, fewer particles
    this.hinted = {}; // one short hint per topic, the first time it matters
    this.setControls({
      desktop: [
        [t('pongCtlKeys'), t('pongCtlMove')],
        [t('pongCtlSpin'), t('pongCtlSpinDo')],
        [t('pongCtlPick'), t('pongCtlPickDo')],
        [t('pongCtlPause'), t('pongCtlPauseDo')],
      ],
      touch: [
        [t('pongCtlPad'), t('pongCtlMove')],
        [t('pongCtlSwipe'), t('pongCtlMove')],
        [t('pongCtlSpin'), t('pongCtlSpinDo')],
        [t('menu'), t('pongCtlPauseDo')],
      ],
      xr: [
        [t('pongCtlHand'), t('pongCtlMove')],
        [t('pongCtlSpin'), t('pongCtlSpinDo')],
      ],
    });
    this.refreshHud = this.hud(() => this.hudText());
    this.pinHud();
    this.buildArena();
    this.announcer = new Announcer(this);
    this.announcer.calm = this.calm;
    if (this.screen) this.announcer.place = (g, k) => this.placeCallout(g, k);
    this.setupTouch();
    this.setupKeys();
    this.onUpdate((dt) => this.update(dt));
    this.chooseOpponent();
  }

  /** Calm motion: far fewer particles in every burst. */
  burst(worldPos, tokenName, count = 22) {
    super.burst(worldPos, tokenName, this.calm ? Math.ceil(count * 0.4) : count);
  }

  /** The paddle follows the player: a point is being played, served or just ended. */
  live() {
    return this.mode === 'point' || this.mode === 'serve' || this.mode === 'play';
  }

  /** The tunnel fills the browser view (also in the short break between two opponents). */
  inTunnel() {
    return (this.live() || this.mode === 'between') && this.arena.visible;
  }

  hudText() {
    if (!this.opp || this.mode === 'intro') return t('pongName');
    const parts = [`${t('pongYou')} ${this.pts?.[0] ?? 0} : ${this.pts?.[1] ?? 0} ${this.aiName()}`];
    if (this.ladder?.length > 1) parts.push(t('pongStage', { n: this.stage + 1, total: this.ladder.length }));
    parts.push(`${t('score')} ${(this.totalScore ?? 0) + (this.mode === 'over' || this.mode === 'between' ? 0 : this.matchScore(false))}`);
    return parts.join('  ·  ');
  }

  /** Points of the running match (a win adds a bonus that grows with each opponent). */
  matchScore(win) {
    const you = this.pts?.[0] ?? 0;
    return you * this.pointValue + Math.min(MAX_HIT_POINTS, (this.hits ?? 0) * 10 + (this.tricks ?? 0) * TRICK_POINTS) + (win ? 300 + this.stage * 200 : 0);
  }

  // ----- keyboard (desktop) -----

  /**
   * Arrow keys or W A S D move the paddle at a steady speed; the mouse takes over again as soon
   * as it moves. In the opponent choice 1, 2, 3 pick an opponent, Enter or Space the first one.
   */
  setupKeys() {
    this.keys = new Set();
    this.keyVel = new THREE.Vector2();
    this.keyTo = new THREE.Vector2();
    this.input = 'mouse';
    const MOVE = { ArrowLeft: 'l', a: 'l', A: 'l', ArrowRight: 'r', d: 'r', D: 'r', ArrowUp: 'u', w: 'u', W: 'u', ArrowDown: 'd', s: 'd', S: 'd' };
    const down = (e) => {
      const en = this.engine;
      if (en.isXR || en.paused || this.disposed || e.altKey || e.ctrlKey || e.metaKey) return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const dir = MOVE[e.key];
      if (dir && this.live()) {
        if (this.input !== 'keys') { this.input = 'keys'; this.keyTo.copy(this.pp); this.keyVel.set(0, 0); }
        this.keys.add(dir);
        e.preventDefault(); // no page scrolling
        return;
      }
      if (this.mode !== 'intro' || e.repeat) return;
      const i = ['1', '2', '3'].indexOf(e.key);
      const pick = i >= 0 ? PONG_CAST[i] : (e.key === 'Enter' || e.key === ' ') && !en.focus ? PONG_CAST[0] : null;
      if (!pick) return;
      e.preventDefault();
      sfx.click();
      this.startLadder(pick);
    };
    const up = (e) => { const dir = MOVE[e.key]; if (dir) this.keys.delete(dir); };
    const clear = () => this.keys.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    this.onSceneDispose(() => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
    });
  }

  // ----- browser view: first person, texts pinned to the screen -----

  /** Camera position (world) so the tunnel's near frame fills the free part of the screen. */
  tunnelView(cam, ins) {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const tv = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const th = tv * (W / H);
    const freeH = Math.max(0.35, 1 - (ins.top + ins.bottom) / H);
    const freeW = Math.max(0.35, 1 - ins.right / W);
    const hw = (HW + 0.05) * SCALE;
    const hh = (HH + 0.05) * SCALE;
    const d = Math.max(NEAR_GAP, hw / (th * freeW), hh / (tv * freeH));
    const yT = this.eye - TUNNEL_DROP;
    const nearZ = TUNNEL_Z + ZP * SCALE;
    return new THREE.Vector3((ins.right / W) * d * th, yT - ((ins.bottom - ins.top) / H) * d * tv, nearZ + d).add(this.engine.root.position);
  }

  /** Screen space the desktop view keeps free: the status bar at the top, the AI's thoughts on the right. */
  desktopInsets() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const side = W / H >= 1.35 ? clamp(W * 0.24, 220, 440) : 0;
    return { top: HUD_PX, bottom: 0, right: side };
  }

  /** Desktop: the camera sits behind your paddle while a match runs; menus use the app's own framing. */
  desktopView() {
    const e = this.engine;
    const on = this.inTunnel();
    e.fitEnabled = !on;
    if (!on) return;
    const cam = e.camera;
    if (cam.fov !== VIEW_FOV) { cam.fov = VIEW_FOV; cam.updateProjectionMatrix(); }
    cam.rotation.set(0, 0, 0);
    cam.position.copy(this.tunnelView(cam, this.desktopInsets()));
  }

  /** Puts a holder where a screen rectangle is (pong-screen.js). */
  pin(holder, w, cx, cy, wPx) {
    pinToScreen(this, holder, w, cx, cy, wPx);
  }

  /** Draws an object over the 3D view (texts pinned to the screen). */
  onTop(obj, order = 30) {
    return drawOnTop(obj, order);
  }

  /** Desktop: the 3D status bar and its menu button move into a holder that follows the view. */
  pinHud() {
    if (!this.desktop) return;
    const hud = hudHolder(this);
    if (!hud) return;
    this.hudHolder = hud.holder;
    this.hudHome = hud.home;
    this.hudWidth = hud.width;
  }

  /** Free screen area of the browser view: { x0, x1, top, bottom } in CSS px. */
  freeArea() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const ins = this.desktop ? this.desktopInsets() : this.engine.insets();
    return { x0: 0, x1: W - ins.right, top: ins.top, bottom: H - ins.bottom };
  }

  /** Browser view: status bar, AI thoughts, hints and the break panel sit at fixed screen places. */
  layoutScreen() {
    if (!this.screen) return;
    const on = this.inTunnel();
    const W = window.innerWidth;
    const a = this.freeArea();
    const cx = (a.x0 + a.x1) / 2;
    const fw = a.x1 - a.x0;
    if (this.hudHolder) {
      if (on) this.pin(this.hudHolder, this.hudWidth, W / 2, HUD_PX / 2, Math.min(W - 24, 600));
      else { this.hudHolder.position.copy(this.hudHome); this.hudHolder.scale.setScalar(1); }
    }
    if (this.mindHolder?.parent && this.desktop) {
      const side = W - a.x1;
      this.mindHolder.visible = on && side > 0;
      if (this.mindHolder.visible) this.pin(this.mindHolder, this.mind.w, a.x1 + side / 2 - 4, a.top + 12 + (side - 20) * (this.mind.h / this.mind.w) / 2, side - 20);
    }
    if (this.toastPanel?.parent && this.toastPanel.userData.w) {
      const wPx = Math.min(fw - 16, 560);
      const hPx = wPx * (this.toastPanel.userData.h / this.toastPanel.userData.w);
      this.pin(this.toastPanel, this.toastPanel.userData.w, cx, a.top + 10 + hPx / 2, wPx);
    }
    if (this.breakHolder?.parent) this.pin(this.breakHolder, this.breakHolder.userData.w, cx, (a.top + a.bottom) / 2, Math.min(fw - 24, 640));
  }

  /** Announcer callouts: in the browser below the hints, smaller while the ball is in play. */
  placeCallout(g, k) {
    if (!this.inTunnel()) return;
    const a = this.freeArea();
    const fw = a.x1 - a.x0;
    const wPx = Math.min(fw * (this.mode === 'play' ? 0.5 : 0.8), 620) * k;
    this.pin(g, 1.3, (a.x0 + a.x1) / 2, a.top + (a.bottom - a.top) * 0.27, wPx);
  }

  // ----- phones (browser preview) -----

  /**
   * Phones: you look down the tunnel from behind your paddle (it fills the screen instead of a
   * small arena far away). Instead of the AI's thoughts there is a control field (below the tunnel
   * in portrait, to its right in landscape): where you touch or drag in it is where your paddle
   * goes, and it shows the paddle and the ball like a radar. Swiping on the tunnel works too.
   */
  setupTouch() {
    if (!this.engine.touchUI) return;
    const live = () => this.live();
    this.swipe = this.dragPad({
      hint: false,
      enabled: live,
      onStart: () => { this.swipeFrom = this.pp.clone(); },
      onMove: (dx, dy) => {
        // About two thirds of the screen width move the paddle across the whole tunnel.
        const k = (2 * HW) / (Math.min(window.innerWidth, window.innerHeight * 1.2) * 0.62);
        this.swipeTo = new THREE.Vector2(this.swipeFrom.x + dx * k, this.swipeFrom.y + dy * k);
      },
    });
    this.aim = aimPad({
      aspect: HW / HH,
      label: t('pongPad'),
      onAim: (nx, ny) => { this.swipeTo = new THREE.Vector2(nx * (HW - PPW * 0.7), ny * (HH - PPH * 0.7)); },
    });
    this.onSceneDispose(() => this.aim.remove());
    // A phone turned while the opponents are shown: lay them out again for the new format.
    const turned = () => { if (this.mode === 'intro' && !this.disposed && this.wideIntro !== this.isWide()) this.chooseOpponent(); };
    window.addEventListener('resize', turned);
    this.onSceneDispose(() => window.removeEventListener('resize', turned));
    this.mobileView((cam, dt, ins) => {
      // Menus (opponents, result): framed closely, so texts and buttons stay large enough.
      if (!this.inTunnel()) return closeFit(this, cam, dt, ins);
      // The near frame of the tunnel fits the free part of the screen (between the status bar,
      // the control field and the screen edges).
      if (cam.fov !== VIEW_FOV) { cam.fov = VIEW_FOV; cam.updateProjectionMatrix(); }
      cam.rotation.set(0, 0, 0);
      const want = this.tunnelView(cam, ins);
      cam.position.lerp(want, this.calm ? 1 : Math.min(1, dt * 4));
      return true;
    });
  }

  /** The control field: shown while you play; paddle and ball on it like on a radar. */
  updateAimPad() {
    const on = this.live() || this.mode === 'between';
    this.aim.show(on);
    if (!on) return;
    const k = this.padK?.player ?? 1;
    const near = clamp((this.b.z - ZA) / (ZP - ZA), 0, 1); // 0 far end, 1 at your paddle
    this.aim.update(
      { x: this.pp.x / HW, y: this.pp.y / HH, w: (PPW * k) / HW, h: (PPH * k) / HH },
      { x: clamp(this.b.x / HW, -1, 1), y: clamp(this.b.y / HH, -1, 1), s: 0.45 + 0.75 * near, on: this.mode !== 'point' },
    );
  }

  aiName() {
    return this.opp ? oppName(this.opp) : t('pongAI');
  }

  // ----- opponent choice -----

  /** A phone held sideways: the opponents stand beside the intro text instead of below it. */
  isWide() {
    return this.engine.touchUI && window.innerWidth > window.innerHeight * 1.3;
  }

  chooseOpponent() {
    const { eye, dist } = this;
    this.clearLayer();
    this.mode = 'intro';
    this.arena.visible = false; // the tunnel builds up when the match starts
    this.room.rainOn = false;
    this.room.tilesOn = false;
    this.setRays(true);
    if (this.screen) this.engine.fitEnabled = true;
    // Two short sentences, the controls for this device, then straight to the opponents.
    const wide = (this.wideIntro = this.isWide());
    const w = wide ? 0.46 : 0.4;
    const h = 0.27;
    const hw = wide ? 1.2 : 1.26; // width of the text panel
    const hx = wide ? -(w + 0.03) / 2 : 0; // ... and its center
    const head = this.add(textPanel(hw, 0.26, [
      { text: t('pongName'), size: 'xr-text-title', weight: 'black', gap: 0.02 },
      { text: t('pongIntro', { n: this.win }), size: 'xr-text-md', color: color('xr-panel-muted'), gap: 0.03 },
      ...this.controlsBlocks(),
      { text: t(EVENT ? 'pongChooseEvent' : 'pongChoose'), size: 'xr-text-md', weight: 'bold' },
    ], { layout: { align: 'left' } }));
    head.position.set(hx, eye + 0.5 - head.h / 2, -dist);
    this.popIn(head);
    this.app.host?.introduce(this, 'pong', head);
    // The opponents: a row below the text, or (phone held sideways) a column beside it.
    const y = wide ? head.position.y : head.position.y - head.h / 2 - 0.03 - h / 2;
    PONG_CAST.forEach((o, i) => {
      const card = this.add(this.opponentCard(o, w, h, i + 1));
      if (wide) card.position.set(hx + hw / 2 + 0.03 + w / 2, eye + 0.5 - h / 2 - i * (h + 0.03), -dist);
      else card.position.set((i - 1) * (w + 0.03), y, -dist);
      this.popIn(card, 0.08 + i * 0.06);
    });
    // Music and announcer can be switched off (saved per device).
    const label = (key, on) => `${t(key)}: ${on ? t('on') : t('off')}`;
    const bh = this.engine.touchUI ? 0.15 : 0.1; // phones: a full finger target
    const musicBtn = new Button(0.34, bh, { label: label('pongMusic', music.enabled), labelSize: 'xr-text-sm', onClick: (ptr, btn) => {
      music.setEnabled(!music.enabled);
      btn.opts.label = label('pongMusic', music.enabled);
      btn.redraw();
    } });
    const voiceBtn = new Button(0.34, bh, { label: label('pongVoice', this.announcer.enabled), labelSize: 'xr-text-sm', onClick: (ptr, btn) => {
      this.announcer.setEnabled(!this.announcer.enabled);
      btn.opts.label = label('pongVoice', this.announcer.enabled);
      btn.redraw();
    } });
    const rowY = (wide ? head.position.y - head.h / 2 : y - h / 2) - 0.03 - bh / 2;
    layoutRow([musicBtn, voiceBtn], rowY, -dist, 0.03);
    [musicBtn, voiceBtn].forEach((b, i) => { b.position.x += hx; this.add(b); this.popIn(b, 0.25 + i * 0.05); });
    if (wide) return; // no room for the footnote on a phone held sideways
    const note = this.add(textPanel(hw, 0.05, [{ text: t('pongSource'), size: 'xr-text-sm', color: color('xr-bg-muted') }], { surface: false }));
    note.position.set(hx, rowY - bh / 2 - 0.02 - note.h / 2, -dist);
  }

  /** Clickable card: name plus three rating bars (reaction, speed, precision). */
  opponentCard(o, w, h, number) {
    let hover = false;
    let focus = false;
    const card = new Panel(w, h, (ctx, c) => {
      const accent = color(o.token);
      c.surface({ stroke: focus ? color('xr-focus') : accent, strokeWidth: num('xr-border-width') * (focus ? 3 : hover ? 2.5 : 1.2), stripe: false });
      const pad = c.m(0.025);
      const W = c.canvas.width;
      ctx.fillStyle = accent;
      ctx.fillRect(pad, pad * 0.6, W - 2 * pad, c.m(0.008));
      ctx.fillStyle = color('xr-panel-text');
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = font('black', c.m(num('xr-text-md')));
      ctx.fillText(oppName(o), pad, pad + c.m(0.012));
      // Desktop: the number key that picks this opponent.
      if (this.desktop) {
        ctx.textAlign = 'right';
        ctx.fillStyle = color('xr-panel-muted');
        ctx.font = font('bold', c.m(num('xr-text-sm')));
        ctx.fillText(String(number), W - pad, pad + c.m(0.016));
        ctx.textAlign = 'left';
        ctx.fillStyle = color('xr-panel-text');
      }
      if (o.boss) {
        // Badge for the nemesis, top right.
        ctx.font = font('black', c.m(num('xr-text-sm')) * 0.85);
        const label = t('pongNemesis').toUpperCase();
        const bw = ctx.measureText(label).width + c.m(0.02);
        const bx = pad;
        const by = pad + c.m(0.068);
        ctx.fillStyle = color('xr-danger');
        ctx.fillRect(bx, by - c.m(0.016), bw, c.m(0.032));
        ctx.fillStyle = color('xr-on-primary');
        ctx.textBaseline = 'middle';
        ctx.fillText(label, bx + c.m(0.01), by + c.m(0.001));
        ctx.textBaseline = 'top';
      }
      const rows = [['pongReaction', o.ratings.reaction], ['pongTempo', o.ratings.speed], ['pongPrecision', o.ratings.precision]];
      const sm = c.m(num('xr-text-sm'));
      rows.forEach(([key, val], r) => {
        const ry = pad + c.m(0.1) + r * c.m(0.05);
        ctx.font = font('bold', sm);
        ctx.fillStyle = color('xr-panel-muted');
        ctx.textBaseline = 'middle';
        ctx.fillText(t(key), pad, ry + c.m(0.012));
        const segW = c.m(0.03);
        const gap = c.m(0.007);
        const x0 = W - pad - 5 * segW - 4 * gap;
        for (let k = 0; k < 5; k++) {
          ctx.fillStyle = k < val ? accent : color('xr-panel-muted');
          ctx.globalAlpha = k < val ? 1 : 0.25;
          ctx.fillRect(x0 + k * (segW + gap), ry + c.m(0.002), segW, c.m(0.02));
        }
        ctx.globalAlpha = 1;
      });
    });
    card.userData.interactive = true;
    card.userData.setHover = (v) => {
      hover = v;
      card.scale.setScalar(v ? num('xr-hover-scale') : 1);
      card.redraw();
    };
    card.userData.setFocus = (v) => { focus = v; card.redraw(); };
    card.userData.onClick = () => { sfx.click(); this.startLadder(o); };
    card.userData.label = `${oppName(o)}${o.boss ? `, ${t('pongNemesis')}` : ''}. ${t('pongReaction')} ${o.ratings.reaction}/5, ${t('pongTempo')} ${o.ratings.speed}/5, ${t('pongPrecision')} ${o.ratings.precision}/5`;
    return card;
  }

  /** Pointer rays are hidden while playing: the hand itself is the controller. */
  setRays(visible) {
    for (const p of this.engine.pointers) if (p.line) p.line.visible = visible && p.source?.targetRayMode !== 'screen';
  }

  // ----- 3D arena -----

  buildArena() {
    const arena = (this.arena = new THREE.Group());
    arena.position.set(0, this.eye - TUNNEL_DROP, TUNNEL_Z);
    arena.scale.setScalar(SCALE);
    this.group.add(arena);

    // Holographic walls: hit ripples in blue (you), red (AI), violet (walls) and green (obstacles).
    this.fx = new HoloFX('xr-pong-rail', ['xr-pong-player', 'xr-pong-ai', 'xr-pong-rail', 'xr-pong-obstacle'].map(hex));
    this.tunnel = makeTunnel(HW, HH, LEN, 'xr-pong-rail', this.fx);
    arena.add(this.tunnel.group);
    // Graphics: tone mapping, studio reflections, key and rim light, shadows, sky, bloom
    // (scaled per device in pong-look.js). Neon parts are pushed above white where bloom runs.
    this.look = pongLook(this, arena, { hw: HW, hh: HH, len: LEN });
    const neon = this.look.neon;
    for (const m of [...this.tunnel.edges.map((x) => x.material), this.tunnel.near.material, this.tunnel.far.material]) m.color.multiplyScalar(neon);
    // Blender-built frame: metal beams with light seams, gates with data nodes and server
    // pillars behind the AI.
    this.cRail = new THREE.Color(hex('xr-pong-rail'));
    this.neonKick = 0;
    loadPongArena().then((model) => {
      if (this.disposed) return;
      this.frameModel = model;
      for (const m of model.mats.NeonPlayer ?? []) m.color.multiplyScalar(neon);
      arena.add(model.group);
      if (this.opp) this.applyOpponent(this.opp);
    }).catch((e) => console.warn('Pong arena model not loaded', e));
    // Digital rain falls around the arena down to the room floor.
    this.rain = makeDataRain({ hw: HW, len: LEN, floorY: -(this.eye - TUNNEL_DROP) / SCALE, top: 0.85 });
    arena.add(this.rain);
    this.rain.visible = !quality.lite; // lite: no digital rain
    // Energy vortex behind the AI.
    this.portal = makePortal(HW, HH, hex('xr-pong-ai'));
    this.portal.position.z = ZA - 0.03;
    arena.add(this.portal);

    this.player = makeGlassPaddle(PPW, PPH, 'xr-pong-player');
    this.player.position.z = ZP;
    this.ai = makeGlassPaddle(PW, PH, 'xr-pong-ai');
    this.ai.position.z = ZA;
    arena.add(this.player, this.ai);
    // Like the menu coin: table-tennis handles, Echo holds your paddle, the AI is an Arena robot
    // behind its paddle (made in applyOpponent), a neon grid floor and a data city behind the AI.
    this.player.add(makeHandle(PPH));
    this.ai.add(makeHandle(PH));
    this.player.children.concat(this.ai.children).forEach((o) => this.look.casters(o));
    this.paddleEcho = makePaddleEcho(this.player, PPW, PPH, (model) => this.look.casters(model, 6));
    // Browser: you look past Echo down the tunnel, so it is smaller and sits lower, out of the ball's way.
    if (this.screen) {
      this.paddleEcho.holder.scale.setScalar(0.62);
      this.paddleEcho.holder.position.y -= 0.035;
    }
    arena.add(makeGridFloor(HW, HH, LEN));
    if (!quality.lite) arena.add(makeSkyline(HW, HH, ZA - 0.95));

    // Ball: glowing core, halo, a real light that lights up the tunnel, and a comet trail.
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 24), new THREE.MeshPhysicalMaterial({
      color: hex('xr-pong-ball'), emissive: hex('xr-pong-ball'), emissiveIntensity: 0.7, roughness: 0.2, clearcoat: 1,
    }));
    const glowMat = (opacity) => new THREE.SpriteMaterial({ map: radialTexture(), color: hex('xr-pong-player'), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
    this.ballGlow = new THREE.Sprite(glowMat(0.85));
    this.ballGlow.userData.noFit = true;
    this.ballLight = new THREE.PointLight(hex('xr-pong-player'), 0.8, 0.9, 2);
    this.trail = new RibbonTrail(arena, 40, 0.024);
    this.shell = makeFresnelShell(R * 1.5, hex('xr-pong-player'));
    this.ball.add(this.shell);
    // Looks of the special balls: a ring for the damper ball, a crystal for the ice ball.
    this.ballRing = new THREE.Mesh(new THREE.TorusGeometry(R * 1.45, R * 0.18, 12, 48), new THREE.MeshPhysicalMaterial({
      color: hex('xr-pong-ball'), metalness: 0.6, roughness: 0.25, clearcoat: 1, emissive: hex('xr-pong-ball'), emissiveIntensity: 0.3,
    }));
    this.ballCrystal = new THREE.Mesh(new THREE.IcosahedronGeometry(R * 1.12, 0), new THREE.MeshPhysicalMaterial({
      color: hex('xr-pong-ball'), roughness: 0.05, metalness: 0, clearcoat: 1, flatShading: true, transparent: true, opacity: 0.55,
      emissive: hex('xr-pong-ball'), emissiveIntensity: 0.25,
    }));
    this.ball.add(this.ballRing, this.ballCrystal);
    // Detailed Blender balls (unit radius) replace the simple looks once loaded.
    this.ballBody = new THREE.Group();
    this.ball.add(this.ballBody);
    loadPongBalls().then((set) => {
      if (this.disposed) return;
      this.ballModels = set;
      for (const { root } of Object.values(set)) {
        this.look.casters(root, 3);
        root.scale.setScalar(R);
        root.visible = false;
        this.ballBody.add(root);
      }
      if (this.ballType) this.showBallModel(this.ballType);
    }).catch((e) => console.warn('Pong ball models not loaded', e));
    this.ballType = null;
    this.look.casters(this.ball, 2);
    arena.add(this.ball, this.ballGlow, this.ballLight);

    // Depth cue: a bright frame that runs along the tunnel at the ball's depth,
    // plus glowing dots where the ball projects onto the four walls.
    this.depthFrame = new THREE.Mesh(frameGeometry(HW + 0.004, HH + 0.004, 0.01, 0.01), new THREE.MeshBasicMaterial({
      color: hex('xr-pong-player'), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    arena.add(this.depthFrame);
    this.wallDots = [0, 1, 2, 3].map(() => {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.06), new THREE.MeshBasicMaterial({
        map: radialTexture(), color: hex('xr-pong-player'), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }));
      arena.add(d);
      return d;
    });
    this.wallDots[0].rotation.x = -Math.PI / 2; // floor
    this.wallDots[1].rotation.x = Math.PI / 2; // ceiling
    this.wallDots[2].rotation.y = Math.PI / 2; // left
    this.wallDots[3].rotation.y = -Math.PI / 2; // right

    this.shock = new Shockwaves(arena, 18);
    this.storm = new DataStorm(arena, HW, HH, LEN);
    this.obstacles = new Obstacles(arena);
    this.dust = makeDust(2 * HW + 1.2, LEN + 0.8, 1.0, 180, 'xr-pong-rail');
    this.dust.position.y = -HH - 0.1;
    arena.add(this.dust);
    this.dust.visible = !quality.lite;

    // The AI's brain floats above the far end; a beam points to where it expects your shot.
    this.brain = makeBrain(0.1, 'xr-pong-ai');
    this.brain.position.set(0, HH + 0.37, ZA - 0.05);
    arena.add(this.brain);
    this.guess = new THREE.Mesh(frameGeometry(PW * 0.9, PH * 0.9, 0.008, 0.02), new THREE.MeshBasicMaterial({
      color: hex('xr-pong-predict'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    this.guess.position.z = ZA - 0.01;
    this.beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
      new THREE.LineBasicMaterial({ color: hex('xr-pong-predict'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.beam.frustumCulled = false;
    arena.add(this.guess, this.beam);

    // Where the AI expects your next shot: a 3 x 3 grid on the far wall, brighter = more likely
    // (the frame above marks its first guess). Playing into a dark field surprises it.
    this.heat = Array.from({ length: ZONES }, (_, z) => {
      const c = zoneXY(z);
      const m = new THREE.Mesh(new THREE.PlaneGeometry((2 * HW) / 3 - 0.014, (2 * HH) / 3 - 0.014), new THREE.MeshBasicMaterial({
        color: hex('xr-pong-expect'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      m.position.set(c.x, c.y, ZA - 0.004);
      m.userData.noFit = true;
      arena.add(m);
      return m;
    });

    this.b = { x: 0, y: 0, z: ZA + 0.05, vx: 0, vy: 0, vz: 0, sx: 0, sy: 0 };
    // Power-up state: extra balls, turbo for the current flight, XXL paddle timers and sizes.
    this.extras = [];
    this.turbo = false;
    this.giant = { player: 0, ai: 0 };
    this.padK = { player: 1, ai: 1 };
    this.pp = new THREE.Vector2(); // player paddle
    this.pv = new THREE.Vector2(); // player paddle velocity
    this.ap = new THREE.Vector2(); // AI paddle
    this.aiTarget = new THREE.Vector2();
    this.speed = S0;
    this.aiSpeed = 1;
    this.reaction = 0.2;
    this.aiError = 0.03;
    this.aiToken = 'xr-pong-ai';
    this.ease = { ...PONG_EASE };

    // AR: the game reaches into the real room (scan wave, code rain on real walls, floor
    // ripples, light pool, the ball escaping after a point).
    this.room = new ARRoom(this, { scan: 'xr-pong-rail', grid: 'xr-pong-circuit', tileEdge: 'xr-pong-rail', tileLit: 'xr-pong-player' });
    // Floor tiles light up where you step while playing.
    this.room.onStep = (p) => { sfx.step(); this.room.ripple(p, hex('xr-pong-player'), 0.25); };
    this.tmpV = new THREE.Vector3();
  }

  /** Colors the AI side (paddle, brain, far frame) in the opponent's color and sets its skills. */
  applyOpponent(opp) {
    this.opp = opp;
    this.aiToken = opp.token;
    const c = hex(opp.token);
    this.ai.userData.setColor(c);
    this.brain.userData.setColor(c);
    this.tunnel.far.material.color.setHex(c).multiplyScalar(this.look.neon);
    this.portal.userData.setColor(c);
    this.fx.setHitColor(1, c);
    for (const m of this.frameModel?.mats.NeonAI ?? []) m.color.setHex(c).multiplyScalar(this.look.neon);
    // The opponent as one of the Arena's robots, in its color, behind the AI paddle.
    this.robot?.dispose();
    this.robot = makePaddleRobot(opp.robot ?? 'light', opp.token, { hh: HH, hw: HW, z: ZA - 0.08 });
    this.look.casters(this.robot.group, 10);
    this.arena.add(this.robot.group);
    this.ease = { ...PONG_EASE, ...(opp.ease ?? {}) };
    this.reaction = opp.reaction + this.ease.reaction;
    this.aiSpeed = opp.speed * this.ease.speed;
    this.aiError = opp.error;
    // Relaxed mode: every opponent moves slower, reacts later, misreads more shots and rarely
    // aims at your weak spot.
    if (assist.easy) {
      this.aiSpeed *= 0.8;
      this.reaction += 0.06;
      this.ease.misjudge += 0.2;
      this.ease.catchError *= 1.4;
      this.ease.randomAim = Math.max(this.ease.randomAim, 0.8);
    }
  }

  /** Switches the ball type (physics and look) and announces it. */
  setBall(type, announce) {
    this.ballType = type;
    Object.assign(this.b, { r: type.r, rest: type.rest, decay: type.decay, slide: type.slide });
    this.showBallModel(type);
    if (announce) {
      this.toast(`${t(`pongBall_${type.key}`)}: ${t(`pongBallInfo_${type.key}`)}`);
      if (!this.calm) this.shock.spawn(this.b.x, this.b.y, this.b.z, new THREE.Vector3(0, 0, 1), 'xr-pong-predict', 0.25, 0.6);
    }
    this.refreshHud();
  }

  /** Shows the Blender model of a ball type, or the simple fallback look while it loads. */
  showBallModel(type) {
    const models = this.ballModels;
    const model = models?.[type.key];
    this.ballRing.visible = !model && type.key === 'damper';
    this.ballCrystal.visible = !model && type.key === 'ice';
    this.ball.material.visible = !model;
    if (models) for (const [key, m] of Object.entries(models)) m.root.visible = key === type.key;
  }

  // ----- match flow -----

  /**
   * Tournament: the chosen opponent first, then the others, the nemesis always last.
   * Choosing the nemesis directly means a single match against it.
   */
  startLadder(first) {
    const boss = PONG_CAST.find((o) => o.boss);
    this.ladder = first.boss || EVENT ? [first] : [first, ...PONG_CAST.filter((o) => o !== first && !o.boss), boss];
    this.stage = 0;
    this.totalScore = 0;
    this.startMatch(this.ladder[0]);
  }

  startMatch(opp) {
    this.app.echo?.suppress(true); // Echo plays: it holds your paddle, the flying one takes a break
    this.applyOpponent(opp);
    this.clearLayer();
    this.setRays(false);
    // The tunnel shoots out of the near frame.
    this.arena.visible = true;
    this.arena.scale.set(0.2 * SCALE, 0.2 * SCALE, 0.01 * SCALE);
    this.tween(0.8, (k) => {
      const s = 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2;
      this.arena.scale.set(s * SCALE, s * SCALE, Math.max(0.01, k) * SCALE);
    });
    sfx.build();
    // The room gets scanned from the arena outwards; then code rain runs down the real walls.
    this.delay(0.55, () => {
      if (this.disposed) return;
      this.room.scan(this.arena.getWorldPosition(new THREE.Vector3()));
      this.room.rainOn = true;
      this.room.tilesOn = true;
      sfx.scan();
    });

    this.pts = [0, 0];
    this.rally = 0;
    this.hits = 0;
    this.tricks = 0; // shots into a zone the AI did not expect
    this.reads = 0; // shots the AI predicted
    // Relaxed mode: a slower ball that speeds up less, and a larger paddle.
    this.s0 = S0 * assist.pick(1, 0.8);
    this.sMax = S_MAX * assist.pick(1, 0.7);
    this.padBase = assist.pick(1, 1.35);
    this.storm.setCalm(this.calm);
    this.model = new PatternModel();
    this.lastZone = -1;
    this.att = new Float32Array(ZONES);
    this.miss = new Float32Array(ZONES);
    this.shotLog = []; // 1 = the AI predicted your shot correctly
    this.zoneCount = new Float32Array(ZONES);
    this.prediction = new Float32Array(ZONES).fill(1 / ZONES);
    this.patternShown = false;
    this.ballType = null;
    this.liveIn = -1;
    this.firstServe = this.stage === 0;
    this.firstWait = 0;
    this.firstFrom = this.pp.clone();
    this.nextObstacle = this.stage ? 5 : 9; // seconds of play until the first obstacle (later in the first match)
    this.nextStorm = 14; // ... and until the first data storm
    this.obstacles.clear();
    this.clearExtras();
    this.turbo = false;
    this.giant = { player: 0, ai: 0 };

    // Scoreboard far away at the tunnel end, so it sits in an enlarged holder.
    this.boardHolder = this.add(new THREE.Group());
    this.boardHolder.position.set(0, this.eye - TUNNEL_DROP + (HH + 0.19) * SCALE, TUNNEL_Z + ZA * SCALE);
    this.boardHolder.scale.setScalar(1.35);
    this.board = new Panel(0.9, 0.15, (ctx, c) => this.drawBoard(ctx, c));
    this.boardHolder.add(this.board);
    this.mind = new Panel(0.6, 0.52, (ctx, c) => this.drawMind(ctx, c));
    // Desktop: the panel is pinned to the right edge of the screen (layoutScreen).
    this.mindHolder = this.add(new THREE.Group());
    this.mindHolder.add(this.mind);
    if (this.desktop) { solid(this.mind); this.onTop(this.mind); this.mindHolder.visible = false; } else placeOnArc(this.mindHolder, 0.72, this.eye - 0.02, this.dist + 0.1);
    this.mind.visible = !this.engine.touchUI; // phones: the control field takes its place, the far wall shows the AI's guess
    this.popIn(this.board, 0.3);
    this.popIn(this.mind, 0.4);
    this.refreshHud();
    this.swipeTo = null;
    this.mode = 'point'; // paddle already follows the hand during the build-up
    this.streak = 0;
    this.startMusic(0, 'pong');
    this.delay(0.5, () => { if (!this.disposed) this.announcer.say('pongCallFight', {}, 'xr-pong-predict', { priority: true }); });
    this.delay(1.4, () => {
      if (this.disposed) return;
      this.serve();
      this.hint('block');
    });
  }

  /** One short hint per topic, the first time it matters in this round. */
  hint(key) {
    if (this.hinted[key] || !this.live()) return;
    this.hinted[key] = true;
    this.toast(t(`pongHint_${key}`), 3.8);
  }

  serve() {
    this.mode = 'serve';
    this.ballGone = false;
    this.turbo = false;
    this.clearExtras();
    this.rally = 0;
    this.speed = this.s0;
    this.serveTime = 0.8;
    Object.assign(this.b, { vx: 0, vy: 0, vz: 0, sx: 0, sy: 0 });
    // Now and then a different ball comes into play (always the energy ball first).
    const first = !this.ballType;
    let type = this.ballType ?? BALLS[0];
    if (!first && Math.random() < 0.6) {
      const others = BALLS.filter((x) => x !== type);
      type = others[Math.floor(Math.random() * others.length)];
    }
    this.setBall(type, !first && type !== this.ballType);
    if (this.pts && Math.max(...this.pts) === this.win - 1) {
      this.delay(0.3, () => { if (!this.disposed) this.announcer.say('pongCallMatchPoint', {}, 'xr-pong-predict', { priority: true }); });
    }
    this.shot = null;
    this.aiGuess = null;
    this.refreshHud();
  }

  point(toPlayer) {
    this.mode = 'point';
    this.clearExtras(true);
    this.pts[toPlayer ? 0 : 1] += 1;
    sfx.point();
    const token = toPlayer ? 'xr-pong-player' : this.aiToken;
    const z = toPlayer ? ZA : ZP;
    const x = clamp(this.b.x, -HW, HW);
    const y = clamp(this.b.y, -HH, HH);
    this.burst(this.arena.localToWorld(new THREE.Vector3(x, y, z)), token, this.calm ? 12 : 44);
    if (toPlayer) this.popup(`+${this.pointValue}`, 'xr-pong-player', 0, 0.02, ZA + 0.05, 0.13);
    // The whole tunnel flashes in the scorer's color, a big wave runs through it (not with calm motion).
    if (!this.calm) {
      this.shock.spawn(x, y, z, new THREE.Vector3(0, 0, 1), token, 0.5, 0.9);
      this.fx.flash(hex(token), 1);
      this.fx.ripple(z, toPlayer ? 0 : 1, 2);
      if (toPlayer) this.portal.userData.pulse(1.5);
      this.endFlash = { frame: toPlayer ? this.tunnel.far : this.tunnel.near, k: 1 };
    }
    if (!toPlayer) this.brain.userData.pulse(1);
    this.escapeBall(toPlayer, token);
    this.board.redraw();
    this.refreshHud();
    // Announcer: streaks, long rallies and the end of the match.
    this.streak = toPlayer ? Math.max(0, this.streak) + 1 : Math.min(0, this.streak) - 1;
    const over = this.pts[0] >= this.win || this.pts[1] >= this.win;
    const name = this.aiName();
    if (over) {
      const champion = this.pts[0] >= this.win && this.ladder && this.stage === this.ladder.length - 1 && this.ladder.length > 1;
      if (champion) this.announcer.say('pongCallChampion', {}, 'xr-pong-predict', { priority: true });
      else if (this.pts[0] >= this.win) this.announcer.say(this.pts[1] === 0 ? 'pongCallPerfect' : 'pongCallWin', {}, 'xr-pong-predict', { priority: true });
      else this.announcer.say('pongCallLose', { name }, this.aiToken, { priority: true });
    } else if (toPlayer) {
      const key = this.rally >= 12 ? 'pongCallRallyWin' : this.streak >= 4 ? 'pongCallUnstoppable' : this.streak === 3 ? 'pongCallTriple' : this.streak === 2 ? 'pongCallDouble' : 'pongCallScore';
      this.announcer.say(key, {}, 'xr-pong-player', { priority: true });
    } else {
      this.announcer.say(this.streak <= -3 ? 'pongCallAiDominate' : 'pongCallAiScore', { name }, this.aiToken, { priority: true });
    }
    this.delay(over ? 2.0 : 1.1, () => {
      if (this.disposed) return;
      if (over) this.finish();
      else this.serve();
    });
  }

  /** A short text that rises and fades in the tunnel (points, "surprised", "read"). */
  popup(text, token, x, y, z, size = 0.07) {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 128;
    const ctx = c.getContext('2d');
    let px = 92;
    do { ctx.font = font('black', px); px -= 4; } while (ctx.measureText(text).width > 488 && px > 30);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 12;
    ctx.strokeStyle = color('xr-pong-pu-label');
    ctx.strokeText(text, 256, 66);
    ctx.fillStyle = color(token);
    ctx.fillText(text, 256, 66);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }));
    sp.scale.set(size * 4, size, 1);
    sp.renderOrder = 15;
    sp.userData.noFit = true;
    const lim = Math.max(0, HW - size * 1.3);
    sp.position.set(clamp(x, -lim, lim), clamp(y, -HH + size, HH - size * 1.6), z);
    const y0 = sp.position.y;
    this.arena.add(sp);
    this.tween(1.1, (k) => {
      sp.position.y = y0 + k * size * 0.9;
      sp.material.opacity = k < 0.65 ? 1 : 1 - (k - 0.65) / 0.35;
    }, { ease: (k) => k, onDone: () => { sp.removeFromParent(); tex.dispose(); sp.material.dispose(); } });
  }

  // ----- power-ups -----

  /** Unlocks the effect of a power-up for the shooter ('player' or 'ai'). */
  triggerPower(kind, pos, shooter) {
    const b = this.b;
    const token = POWERUPS[kind].token;
    sfx.powerup();
    if (!this.calm) this.fx.flash(hex(token), 0.5);
    this.room.ripple(this.floorBelow(this.arena.localToWorld(pos.clone())), hex(token), 0.7);
    if (kind === 'turbo') {
      for (const k of ['vx', 'vy', 'vz']) b[k] *= 1.45;
      this.turbo = true;
      this.shock.spawn(b.x, b.y, b.z, new THREE.Vector3(0, 0, 1), token, 0.3, 0.5);
      this.toast(t('pongPUGot_turbo'));
    } else if (kind === 'multi') {
      this.spawnExtra();
      this.toast(t('pongPUGot_multi'));
    } else if (kind === 'morph') {
      const others = BALLS.filter((x) => x.key !== (this.ballType ?? BALLS[0]).key);
      const next = others[Math.floor(Math.random() * others.length)];
      this.setBall(next, false);
      this.burst(this.arena.localToWorld(new THREE.Vector3(b.x, b.y, b.z)), next.tint ?? 'xr-pong-ball', 24);
      this.toast(t('pongPUGot_morph', { ball: t(`pongBall_${next.key}`) }));
    } else if (kind === 'giant') {
      this.giant[shooter] = 8;
      const who = shooter === 'player' ? t('pongPUYou') : t('pongPUAi', { name: this.aiName() });
      this.toast(t('pongPUGot_giant', { who }));
    }
  }

  /** A second ball splits off the main ball and flies on with it. */
  spawnExtra() {
    const b = this.b;
    const type = this.ballType ?? BALLS[0];
    const side = b.vx >= 0 ? -1 : 1;
    const e = {
      x: b.x, y: b.y, z: b.z, vx: -b.vx * 0.6 + side * 0.35 + (Math.random() - 0.5) * 0.2, vy: b.vy * 0.8 + (Math.random() - 0.5) * 0.4,
      vz: b.vz, sx: 0, sy: 0, r: b.r ?? R, rest: b.rest, decay: b.decay, slide: b.slide,
    };
    b.vx -= side * 0.15;
    const g = new THREE.Group();
    const model = this.ballModels?.[type.key];
    let body;
    if (model) {
      body = model.root.clone(true);
      body.visible = true;
      body.scale.setScalar(R * ((b.r ?? R) / R));
    } else {
      body = new THREE.Mesh(this.ball.geometry, this.ball.material);
      body.scale.setScalar((b.r ?? R) / R);
    }
    body.traverse((o) => { if (o.material) o.material = [].concat(o.material).map((m) => m.clone())[0]; });
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), color: hex('xr-pong-pu-multi'), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(0.14);
    glow.userData.noFit = true;
    g.add(body, glow);
    g.position.set(e.x, e.y, e.z);
    this.arena.add(g);
    this.extras.push({ b: e, g, body, glow });
    this.shock.spawn(e.x, e.y, e.z, new THREE.Vector3(0, 0, 1), 'xr-pong-pu-multi', 0.25, 0.5);
  }

  /** Physics for the extra balls: walls, both paddles, points. */
  stepExtras(h) {
    for (const ex of this.extras.slice()) {
      const e = ex.b;
      const z0 = e.z;
      e.wx = this.b.wx;
      e.wy = this.b.wy;
      if (PongScene.advance(e, h)) sfx.bounce();
      if (e.vz > 0 && z0 < ZP && e.z >= ZP
        && Math.abs(e.x - this.pp.x) <= PPW * this.padK.player + e.r && Math.abs(e.y - this.pp.y) <= PPH * this.padK.player + e.r) {
        e.vz = -Math.abs(e.vz) * 1.03;
        e.vx = e.vx * 0.4 + (e.x - this.pp.x) * 4 + clamp(this.pv.x * 0.2, -0.3, 0.3);
        e.vy = e.vy * 0.4 + (e.y - this.pp.y) * 3 + clamp(this.pv.y * 0.2, -0.3, 0.3);
        this.player.userData.flash = 1;
        this.hits += 1;
        sfx.hit();
        this.shock.spawn(e.x, e.y, ZP - 0.005, new THREE.Vector3(0, 0, 1), 'xr-pong-player', 0.18, 0.4);
      }
      if (e.vz < 0 && z0 > ZA && e.z <= ZA
        && Math.abs(e.x - this.ap.x) <= PW * this.padK.ai + e.r && Math.abs(e.y - this.ap.y) <= PH * this.padK.ai + e.r) {
        e.vz = Math.abs(e.vz);
        e.vx += (Math.random() - 0.5) * 0.5;
        e.vy += (Math.random() - 0.5) * 0.4;
        this.ai.userData.flash = 1;
        sfx.hit();
        this.shock.spawn(e.x, e.y, ZA + 0.005, new THREE.Vector3(0, 0, 1), this.aiToken, 0.18, 0.4);
      }
      if (e.vz > 0 && e.z > ZP + 0.18) this.extraPoint(ex, false);
      else if (e.vz < 0 && e.z < ZA - 0.18) this.extraPoint(ex, true);
      if (this.mode !== 'play') return;
    }
  }

  /** An extra ball got past a paddle: a point, the rally with the main ball goes on. */
  extraPoint(ex, toPlayer) {
    const e = ex.b;
    if (this.pts[toPlayer ? 0 : 1] + 1 >= this.win) {
      // Match ball: the extra ball becomes the deciding ball.
      Object.assign(this.b, { x: e.x, y: e.y, z: e.z, vx: e.vx, vy: e.vy, vz: e.vz });
      this.removeExtra(ex);
      this.point(toPlayer);
      return;
    }
    this.pts[toPlayer ? 0 : 1] += 1;
    const token = toPlayer ? 'xr-pong-player' : this.aiToken;
    sfx.point();
    if (!this.calm) {
      this.fx.flash(hex(token), 0.7);
      this.fx.ripple(toPlayer ? ZA : ZP, toPlayer ? 0 : 1, 1.5);
    }
    if (toPlayer) this.popup(`+${this.pointValue}`, 'xr-pong-player', 0, 0.02, ZA + 0.05, 0.13);
    this.burst(this.arena.localToWorld(new THREE.Vector3(e.x, e.y, toPlayer ? ZA : ZP)), token, this.calm ? 10 : 30);
    this.board.redraw();
    this.refreshHud();
    this.announcer.say(toPlayer ? 'pongCallScore' : 'pongCallAiScore', { name: this.aiName() }, token, { priority: true });
    // The extra ball flies on into the room.
    const q = this.arena.getWorldQuaternion(new THREE.Quaternion());
    const pos = this.arena.localToWorld(new THREE.Vector3(e.x, e.y, e.z));
    const vel = new THREE.Vector3(e.vx * 0.6, 0.7, e.vz).applyQuaternion(q).multiplyScalar(SCALE);
    this.extras = this.extras.filter((x) => x !== ex);
    ex.g.removeFromParent();
    ex.g.scale.setScalar(SCALE);
    ex.glow.material.color.setHex(hex(token));
    this.room.launch(ex.g, pos, vel, {
      radius: e.r * SCALE, color: hex(token), life: 3, bounces: 3,
      onDone: (p) => {
        this.burst(p, token, 16);
        ex.g.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => m.dispose()); });
      },
    });
  }

  removeExtra(ex, sparkle = false) {
    if (sparkle) this.burst(this.arena.localToWorld(new THREE.Vector3(ex.b.x, ex.b.y, ex.b.z)), 'xr-pong-pu-multi', 14);
    ex.g.removeFromParent();
    ex.g.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => m.dispose()); });
    this.extras = this.extras.filter((x) => x !== ex);
  }

  clearExtras(sparkle = false) {
    for (const ex of (this.extras ?? []).slice()) this.removeExtra(ex, sparkle);
  }

  renderExtras() {
    for (const ex of this.extras) {
      const e = ex.b;
      ex.g.position.set(e.x, e.y, e.z);
      const c = new THREE.Color(hex(e.vz < 0 ? 'xr-pong-player' : this.aiToken)).lerp(new THREE.Color(hex('xr-pong-pu-multi')), 0.35);
      ex.glow.material.color.copy(c);
      ex.body.rotation.x -= e.vz * 0.06;
      ex.body.rotation.y += e.vx * 0.06;
      ex.body.traverse((o) => { if (o.material?.name === 'NeonBall') o.material.color.copy(c); });
    }
  }

  /** World point on the real floor below a world position. */
  floorBelow(p) {
    return new THREE.Vector3(p.x, this.engine.floorY, p.z);
  }

  /**
   * After a point the ball breaks out of the tunnel into the real room: past your shoulder
   * when the AI scores, through the portal when you score. It bounces off the real floor
   * and walls (spatial sound) and dissolves into sparks.
   */
  escapeBall(toPlayer, token) {
    const b = this.b;
    const type = this.ballType ?? BALLS[0];
    const model = this.ballModels?.[type.key];
    const ws = this.ball.getWorldScale(new THREE.Vector3()).x;
    const ghost = new THREE.Group();
    let body;
    if (model) {
      body = model.root.clone(true);
      body.visible = true;
      body.scale.setScalar(R * ws);
    } else {
      body = new THREE.Mesh(this.ball.geometry, this.ball.material);
      body.scale.setScalar(ws);
    }
    body.traverse((o) => { if (o.material) o.material = [].concat(o.material).map((m) => m.clone())[0]; });
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), color: hex(token), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.setScalar(0.16 * SCALE);
    ghost.add(body, glow);
    const z = toPlayer ? ZA - 0.03 : ZP + 0.03;
    const pos = this.arena.localToWorld(new THREE.Vector3(clamp(b.x, -LX, LX), clamp(b.y, -LY, LY), z));
    const q = this.arena.getWorldQuaternion(new THREE.Quaternion());
    const dir = toPlayer ? -1 : 1;
    const speed = Math.max(0.9, Math.abs(b.vz));
    // Local velocity: keep the flight direction, add an arc; when it comes at you, it passes beside your head.
    const side = Math.sign(b.x) || 1;
    const local = new THREE.Vector3(b.vx * 0.6 + (toPlayer ? 0 : side * 0.55), 0.75, dir * speed);
    const vel = local.applyQuaternion(q).multiplyScalar(SCALE);
    this.ballGone = true;
    this.room.launch(ghost, pos, vel, {
      radius: R * ws, color: hex(token), life: 3.4, bounces: 4,
      onBounce: (p) => this.burst(p.clone().setY(p.y + 0.02), toPlayer ? 'xr-pong-player' : this.aiToken, 8),
      onDone: (p) => {
        this.burst(p, toPlayer ? 'xr-pong-player' : this.aiToken, 20);
        ghost.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => m.dispose()); });
      },
    });
  }

  finish() {
    if (this.mode === 'over' || this.mode === 'between') return;
    const [you, ai] = this.pts;
    const win = you > ai;
    this.totalScore = (this.totalScore ?? 0) + this.matchScore(win);
    this.allReads = (this.allReads ?? 0) + this.reads;
    this.allShots = (this.allShots ?? 0) + this.shotLog.length;
    const next = win ? this.ladder?.[this.stage + 1] : null;
    if (next) { this.between(next); return; }
    this.mode = 'over';
    music.stop();
    this.app.echo?.suppress(false);
    this.obstacles.clear();
    this.clearExtras();
    this.storm.stop();
    this.arena.visible = false;
    this.setRays(true);
    if (this.screen) this.engine.fitEnabled = true;
    const score = this.totalScore;
    const champion = win && this.ladder?.length > 1;
    const total = this.zoneCount.reduce((a, b) => a + b, 0) || 1;
    const fav = this.zoneCount.indexOf(Math.max(...this.zoneCount));
    const pct = (arr) => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) : 0);
    // A rating in three steps, with the points missing to the next one (as shown: the relaxed
    // mode counts a share of the points).
    const shown = Math.round(score * assist.scoreFactor);
    const rank = shown >= RANKS[1] ? 3 : shown >= RANKS[0] ? 2 : 1;
    const rating = rank === 3
      ? t('pongRankTop', { rank: t('pongRank3') })
      : t('pongRankLine', { n: rank, rank: t(`pongRank${rank}`), pts: RANKS[rank - 1] - shown, next: t(`pongRank${rank + 1}`) });
    // One tip that fits this round: the AI read you, it found your weak spot, or how to aim.
    let weak = -1;
    let ws = 0.34;
    for (let z = 0; z < ZONES; z++) {
      const k = this.miss[z] >= 2 ? this.miss[z] / Math.max(1, this.att[z]) : 0;
      if (k > ws) { ws = k; weak = z; }
    }
    const readShare = this.allShots ? this.allReads / this.allShots : 0;
    const tip = readShare >= 0.34 ? t('pongTipVary') : weak >= 0 && !win ? t('pongTipWeak', { zone: t(`pongZone${weak}`) }) : t('pongTipEdge');
    this.results({
      gameKey: 'pong', score, correct: you, total: this.win,
      line: `${champion ? t('pongChampion') : `${t(win ? 'pongWon' : 'pongLost', { name: this.aiName() })} · ${you} : ${ai}`}\n${rating}`,
      learned: [
        { q: t('pongLearnFav'), a: `${t(`pongZone${fav}`)} · ${Math.round((this.zoneCount[fav] / total) * 100)} %` },
        { q: t('pongLesson'), a: `${t('pongLessonText')} ${t('pongAccStartEnd', { a: pct(this.shotLog.slice(0, 6)), b: pct(this.shotLog.slice(-6)) })}` },
        { q: t('pongTip'), a: tip },
      ],
      onAgain: () => this.app.startGame('pong'),
    });
  }

  /** Won, but the tournament goes on: short break, then the next opponent. */
  between(next) {
    this.mode = 'between';
    this.obstacles.clear();
    this.clearExtras();
    this.storm.stop();
    this.clearLayer();
    const { eye, dist } = this;
    const isBoss = next.boss;
    this.toastPanel = null;
    this.toastTick = null;
    const panel = textPanel(1.0, 0.3, [
      { text: t('pongBeat', { name: this.aiName() }), size: 'xr-text-lg', weight: 'black', color: color('xr-pong-player'), gap: 0.02 },
      { text: t(isBoss ? 'pongNextBoss' : 'pongNextUp', { name: oppName(next) }), size: 'xr-text-md', weight: 'bold', color: color(isBoss ? 'xr-danger' : 'xr-panel-text'), gap: 0.015 },
      { text: `${t('pongStage', { n: this.stage + 2, total: this.ladder.length })}  ·  ${t('score')}: ${this.totalScore}`, size: 'xr-text-sm', color: color('xr-panel-muted') },
    ]);
    // Browser: the panel sits in the middle of the tunnel view (layoutScreen); headset: in the room.
    const holder = this.add(new THREE.Group());
    holder.add(panel);
    holder.position.set(0, eye + 0.02 - panel.h / 2, -dist); // below the announcer callout
    if (this.screen) {
      holder.userData.w = panel.w;
      solid(panel);
      this.breakHolder = this.onTop(holder);
      this.layoutScreen();
    }
    this.popIn(panel);
    this.refreshHud();
    this.delay(0.6, () => { if (!this.disposed && !this.screen) this.announcer.say(isBoss ? 'pongCallBoss' : 'pongCallNext', { name: oppName(next) }, isBoss ? 'xr-danger' : 'xr-pong-predict', { priority: true }); });
    this.delay(this.screen ? 3.0 : 4.2, () => {
      if (this.disposed || this.mode !== 'between') return;
      this.stage += 1;
      this.startMatch(next);
    });
  }

  // ----- input -----

  /** Paddle position from the hand/controller nearest to it; mouse, touch and phone via the ray. */
  readPaddle(dt) {
    const e = this.engine;
    const inv = new THREE.Matrix4().copy(this.arena.matrixWorld).invert();
    const v = new THREE.Vector3();
    let best = null;
    for (const p of e.pointers) {
      if (!p.active || (p.kind === 'xr') !== e.isXR) continue;
      if (p.kind === 'xr' && p.source?.targetRayMode === 'tracked-pointer') {
        v.setFromMatrixPosition(p.controller.matrixWorld).applyMatrix4(inv);
        const d = Math.hypot(v.x - this.pp.x, v.y - this.pp.y) + Math.abs(v.z - ZP) * 0.5;
        if (!best || d < best.d) best = { x: v.x, y: v.y, d, p };
      } else if (!best) {
        // Ray onto the paddle plane.
        const ray = p.ray.clone().applyMatrix4(inv);
        if (Math.abs(ray.direction.z) < 1e-4) continue;
        const k = (ZP - ray.origin.z) / ray.direction.z;
        if (k <= 0) continue;
        best = { x: ray.origin.x + ray.direction.x * k, y: ray.origin.y + ray.direction.y * k, d: 1, p };
      }
    }
    // Phones: the swipe sets where the paddle goes (the finger's own ray is not used).
    if (this.swipe) best = this.swipeTo ? { x: this.swipeTo.x, y: this.swipeTo.y, d: 1, p: null } : null;
    // Desktop: the keyboard steers until the mouse moves again.
    if (this.desktop) {
      const m = e.mouse.ndc;
      if (this.lastNdc && (Math.abs(m.x - this.lastNdc.x) + Math.abs(m.y - this.lastNdc.y) > 1e-4) && !this.keys.size) this.input = 'mouse';
      (this.lastNdc ??= new THREE.Vector2()).copy(m);
      if (this.input === 'keys') {
        const kx = (this.keys.has('r') ? 1 : 0) - (this.keys.has('l') ? 1 : 0);
        const ky = (this.keys.has('u') ? 1 : 0) - (this.keys.has('d') ? 1 : 0);
        const norm = kx && ky ? Math.SQRT1_2 : 1;
        const acc = Math.min(1, dt * 16); // a short ramp, so a tap makes a small step
        this.keyVel.x += (kx * norm * KEY_SPEED - this.keyVel.x) * acc;
        this.keyVel.y += (ky * norm * KEY_SPEED - this.keyVel.y) * acc;
        this.keyTo.x = clamp(this.keyTo.x + this.keyVel.x * dt, -HW + PPW * 0.7, HW - PPW * 0.7);
        this.keyTo.y = clamp(this.keyTo.y + this.keyVel.y * dt, -HH + PPH * 0.7, HH - PPH * 0.7);
        best = { x: this.keyTo.x, y: this.keyTo.y, d: 1, p: null };
      }
    }
    const px = this.pp.x;
    const py = this.pp.y;
    if (best) {
      const s = Math.min(1, dt * 30);
      this.pp.x += (clamp(best.x, -HW + PPW * 0.7, HW - PPW * 0.7) - this.pp.x) * s;
      this.pp.y += (clamp(best.y, -HH + PPH * 0.7, HH - PPH * 0.7) - this.pp.y) * s;
      this.activePointer = best.p;
    }
    const idt = 1 / Math.max(dt, 1e-3);
    this.pv.x = this.pv.x * 0.6 + (this.pp.x - px) * idt * 0.4;
    this.pv.y = this.pv.y * 0.6 + (this.pp.y - py) * idt * 0.4;
  }

  // ----- physics -----

  update(dt) {
    if (this.aim) this.updateAimPad(); // phones: the control field
    this.time += dt;
    this.arena.position.y = this.eye - TUNNEL_DROP;
    if (this.desktop) this.desktopView();
    if (this.mode === 'serve' || this.mode === 'play' || this.mode === 'point') this.readPaddle(dt);

    if (this.mode === 'serve') {
      Object.assign(this.b, { x: this.ap.x, y: this.ap.y, z: ZA + 0.05 });
      // The very first serve of a round waits (at most a few seconds) for the player's first move.
      if (this.firstServe) {
        this.firstWait += dt;
        if (this.pp.distanceTo(this.firstFrom) > 0.03 || this.firstWait > 3.5) this.firstServe = false;
      }
      if (!this.firstServe) this.serveTime -= dt;
      if (this.serveTime <= 0) {
        this.mode = 'play';
        this.aiShoot(true);
      }
    } else if (this.mode === 'play') {
      this.events(dt);
      let left = dt;
      while (left > 1e-6 && this.mode === 'play') {
        const h = Math.min(STEP, left);
        left -= h;
        this.step(h);
      }
    }
    // The soundtrack gets more intense with long rallies and during a data storm.
    if (this.mode === 'play') music.intensity = this.storm.active || this.rally >= 10 ? 2 : this.rally >= 4 ? 1 : 0;
    this.moveAI(dt);
    this.expect();
    this.render(dt);
    this.layoutScreen();
    this.announcer.update(dt);
  }

  /**
   * While the ball flies to you, the AI already shows what it expects from you in this
   * situation (the far wall and the "AI thoughts" panel), so you can decide where to play.
   */
  expect() {
    if (this.mode !== 'play' || this.b.vz <= 0 || !this.model) return;
    const inZone = zoneOf(this.b.x, this.b.y);
    if (inZone === this.liveIn) return;
    this.liveIn = inZone;
    this.prediction = this.model.dist(inZone, this.lastZone);
    if (this.mind.visible) this.mind.redraw();
  }

  /** Obstacles pop up now and then, a data storm blows through every 25 to 35 seconds. */
  events(dt) {
    this.nextObstacle -= dt;
    if (this.nextObstacle <= 0) {
      this.nextObstacle = 6 + Math.random() * 4;
      if (this.obstacles.items.length === 0) { // only ever one power-up in the tunnel
        for (let tries = 0; tries < 8; tries++) {
          const x = (Math.random() * 2 - 1) * (HW - 0.1);
          const y = (Math.random() * 2 - 1) * (HH - 0.08);
          const z = (Math.random() * 2 - 1) * 0.32;
          if (Math.hypot(x - this.b.x, y - this.b.y, z - this.b.z) < 0.3) continue;
          // Relaxed mode: no turbo and no second ball.
          const kinds = Object.keys(POWERUPS).filter((k) => (k !== 'multi' || !this.extras.length) && !(assist.easy && (k === 'turbo' || k === 'multi')));
          const kind = kinds[Math.floor(Math.random() * kinds.length)];
          this.obstacles.spawn(x, y, z, kind);
          this.shock.spawn(x, y, z, new THREE.Vector3(0, 0, 1), POWERUPS[kind].token, 0.2, 0.5);
          sfx.appear();
          this.hint('power');
          break;
        }
      }
    }
    this.nextStorm -= dt;
    if (this.nextStorm <= 0 && !this.storm.active) {
      this.nextStorm = 25 + Math.random() * 10;
      this.storm.start(5.5);
      this.room.ripple(this.floorBelow(this.arena.getWorldPosition(new THREE.Vector3())), hex('xr-pong-storm'), 1);
      this.toast(t('pongStorm'));
      sfx.storm();
    }
    const w = this.storm.wind();
    const push = assist.pick(1, 0.4); // relaxed mode: the storm pushes the ball far less
    this.b.wx = w.x * push;
    this.b.wy = w.y * push;
  }

  /** Advances a ball state by h seconds: spin and wind curve it, walls reflect it. Returns the wall hit. */
  static advance(b, h) {
    b.vx += (b.sx + (b.wx ?? 0)) * h;
    b.vy += (b.sy + (b.wy ?? 0)) * h;
    const decay = Math.exp(-(b.decay ?? SPIN_DECAY) * h);
    b.sx *= decay;
    b.sy *= decay;
    b.x += b.vx * h;
    b.y += b.vy * h;
    b.z += b.vz * h;
    const lx = HW - (b.r ?? R);
    const ly = HH - (b.r ?? R);
    const rest = b.rest ?? 1;
    const maxN = Math.abs(b.vz) * 0.9; // a bouncy ball never flies straight across
    let wall = null;
    if (b.x > lx || b.x < -lx) {
      const s = Math.sign(b.x);
      b.x = 2 * s * lx - b.x;
      b.vx = clamp(-b.vx * rest, -Math.max(maxN, Math.abs(b.vx)), Math.max(maxN, Math.abs(b.vx)));
      if (!b.slide) b.sx = -b.sx; // the ice ball keeps sliding along the wall
      wall = s > 0 ? 'right' : 'left';
    }
    if (b.y > ly || b.y < -ly) {
      const s = Math.sign(b.y);
      b.y = 2 * s * ly - b.y;
      b.vy = clamp(-b.vy * rest, -Math.max(maxN, Math.abs(b.vy)), Math.max(maxN, Math.abs(b.vy)));
      if (!b.slide) b.sy = -b.sy;
      wall = s > 0 ? 'top' : 'bottom';
    }
    return wall;
  }

  step(h) {
    const b = this.b;
    const z0 = b.z;
    const wall = PongScene.advance(b, h);
    if (wall) {
      const n = { left: [1, 0, 0], right: [-1, 0, 0], top: [0, -1, 0], bottom: [0, 1, 0] }[wall];
      const pos = { left: [-HW + 0.002, b.y], right: [HW - 0.002, b.y], top: [b.x, HH - 0.002], bottom: [b.x, -HH + 0.002] }[wall];
      this.shock.spawn(pos[0], pos[1], b.z, new THREE.Vector3(...n), 'xr-pong-rail', 0.1, 0.35);
      this.fx.ripple(b.z, 2, 0.6);
      const key = this.ballType?.key;
      if (key === 'bouncy') {
        sfx.boing();
        this.burst(this.arena.localToWorld(new THREE.Vector3(pos[0], pos[1], b.z)), 'xr-pong-bouncy', 10);
      } else if (key === 'damper') sfx.thud();
      else if (key === 'ice') { sfx.tink(); this.shock.spawn(pos[0], pos[1], b.z, new THREE.Vector3(...n), 'xr-pong-ice', 0.16, 0.5); } else sfx.bounce();
    }
    // Obstacles deflect the ball and shatter. The AI only notices at its next re-plan.
    const hit = this.obstacles.collide(b, b.r);
    if (hit) {
      const p = hit.position.clone();
      const { power, token } = hit.userData;
      this.burst(this.arena.localToWorld(p.clone()), token, 30);
      this.shock.spawn(p.x, p.y, p.z, new THREE.Vector3(0, 0, 1), token, 0.35, 0.6);
      this.fx.ripple(p.z, 3, 1.2);
      this.obstacles.remove(hit);
      sfx.shatter();
      // The shooter (whoever hit the ball last) gets the effect.
      this.triggerPower(power, p, b.vz < 0 ? 'player' : 'ai');
    }
    // Player plane
    if (b.vz > 0 && z0 < ZP && b.z >= ZP) {
      const zone = zoneOf(b.x, b.y);
      this.att[zone] += 1;
      if (Math.abs(b.x - this.pp.x) <= PPW * this.padK.player + b.r && Math.abs(b.y - this.pp.y) <= PPH * this.padK.player + b.r) this.playerHit();
      else this.miss[zone] += 1;
    }
    if (b.vz > 0 && b.z > ZP + 0.18) { this.point(false); return; }
    // AI plane
    if (b.vz < 0 && z0 > ZA && b.z <= ZA) {
      this.readShot();
      if (Math.abs(b.x - this.ap.x) <= PW * this.padK.ai + b.r && Math.abs(b.y - this.ap.y) <= PH * this.padK.ai + b.r) this.aiShoot(false);
    }
    if (b.vz < 0 && b.z < ZA - 0.18) { this.point(true); return; }
    if (this.extras.length) this.stepExtras(h);
  }

  playerHit() {
    const b = this.b;
    const ox = clamp((b.x - this.pp.x) / (PPW * this.padK.player + b.r), -1, 1);
    const oy = clamp((b.y - this.pp.y) / (PPH * this.padK.player + b.r), -1, 1);
    this.turbo = false;
    this.rally += 1;
    this.hits += 1;
    this.speed = Math.min(this.speedCap(), this.speed * S_UP);
    const s = this.speed * this.ballType.speed;
    b.vz = -s;
    b.vx = ox * s * 0.7 + clamp(this.pv.x * 0.2, -0.3, 0.3);
    b.vy = oy * s * 0.55 + clamp(this.pv.y * 0.2, -0.3, 0.3);
    // Moving the hand while hitting gives spin: the ball curves in that direction.
    const curve = CURVE * this.ballType.curve;
    b.sx = clamp(this.pv.x * curve, -1.6 * this.ballType.curve, 1.6 * this.ballType.curve);
    b.sy = clamp(this.pv.y * curve, -1.2 * this.ballType.curve, 1.2 * this.ballType.curve);
    b.z = ZP - 0.001;
    if (this.rally === 10 || this.rally === 20) this.announcer.say(this.rally === 10 ? 'pongCallRally10' : 'pongCallRally20', {}, 'xr-pong-predict', { priority: true });
    else if (Math.hypot(b.sx, b.sy) > 1.0 && Math.random() < 0.4) this.announcer.say('pongCallCurve', {}, 'xr-pong-player');
    this.player.userData.flash = 1;
    this.paddleEcho?.swing();
    this.neonKick = 1;
    this.room.ripple(this.floorBelow(this.arena.localToWorld(new THREE.Vector3(b.x, b.y, ZP))), hex('xr-pong-player'), 0.45);
    sfx.hit();
    if (this.activePointer?.kind === 'xr') this.engine.haptic?.(this.activePointer, 0.7, 45);
    this.burst(this.arena.localToWorld(new THREE.Vector3(b.x, b.y, ZP)), 'xr-pong-player', this.calm ? 6 : 16);
    this.shock.spawn(b.x, b.y, ZP - 0.005, new THREE.Vector3(0, 0, 1), 'xr-pong-player', 0.22 + s * 0.06, 0.45);
    this.fx.ripple(ZP, 0, 1);
    this.player.userData.ripple(b.x - this.pp.x, b.y - this.pp.y, this.time);
    if (Math.hypot(b.sx, b.sy) > 0.6) this.shock.spawn(b.x, b.y, ZP - 0.01, new THREE.Vector3(0, 0, 1), 'xr-pong-heat', 0.12, 0.6);
    if (this.screen) this.popup('+10', 'xr-pong-player', b.x, b.y + 0.07, ZP - 0.02, 0.04);
    if (this.hits === 1) this.hint('aim');

    // The AI reads the situation and guesses where you aimed, before the ball is halfway.
    const inZone = zoneOf(b.x, b.y);
    const p = this.model.dist(inZone, this.lastZone);
    let pred = 0;
    for (let z = 1; z < ZONES; z++) if (p[z] > p[pred]) pred = z;
    const conf = p[pred];
    const mean = { x: 0, y: 0 };
    for (let z = 0; z < ZONES; z++) { const c = zoneXY(z); mean.x += p[z] * c.x; mean.y += p[z] * c.y; }
    this.aiGuess = conf >= 0.3 ? zoneXY(pred) : mean;
    this.aiConf = conf;
    this.prediction = p;
    this.shot = { inZone, last: this.lastZone, pred, p };
    this.nextPlan = this.reaction; // the model needs its response time before it moves
    this.brain.userData.pulse(0.6);
    if (!this.patternShown && this.model.n >= 4 && conf >= 0.4) {
      this.patternShown = true;
      this.announcer.say('pongCallRead', {}, this.aiToken, { priority: true });
    }
    this.liveIn = -1;
    this.refreshHud();
    this.mind.redraw();
  }

  /** The ball reached the AI's plane: the AI learns where your shot really went. */
  readShot() {
    if (!this.shot) return;
    const zone = zoneOf(this.b.x, this.b.y);
    const right = this.shot.pred === zone;
    this.shotLog.push(right ? 1 : 0);
    this.brain.userData.pulse(right ? 1 : 0.4);
    // Once the AI has learned a little: a shot into a field it thought unlikely (dark on the
    // far wall) surprises it and gives bonus points; a shot into its first guess was read.
    if (this.model.n >= LEARNED) {
      if (right) {
        this.reads += 1;
        this.popup(t('pongRead'), this.aiToken, this.b.x, this.b.y, ZA + 0.05, 0.1);
      } else if (this.shot.p[zone] < 1 / ZONES) {
        this.tricks += 1;
        sfx.tink();
        this.popup(t('pongTrick', { n: TRICK_POINTS }), 'xr-pong-player', this.b.x, this.b.y, ZA + 0.05, 0.1);
      }
    }
    this.model.learn(this.shot.inZone, this.shot.last, zone);
    if (this.model.n === LEARNED) this.hint('grid');
    this.zoneCount[zone] += 1;
    this.lastZone = zone;
    this.shot = null;
    this.mind.redraw();
  }

  /** AI return (or serve): aims for where you miss most and away from your paddle. */
  aiShoot(isServe) {
    const b = this.b;
    this.turbo = false;
    if (!isServe) {
      this.rally += 1;
      this.speed = Math.min(this.speedCap(), this.speed * S_UP);
      this.ai.userData.flash = 1;
      this.robot?.hit();
      this.neonKick = 1;
      this.room.ripple(this.floorBelow(this.arena.localToWorld(new THREE.Vector3(b.x, b.y, ZA))), hex(this.aiToken), 0.45);
      sfx.hit();
      this.burst(this.arena.localToWorld(new THREE.Vector3(b.x, b.y, ZA)), this.aiToken, this.calm ? 6 : 16);
      this.shock.spawn(b.x, b.y, ZA + 0.005, new THREE.Vector3(0, 0, 1), this.aiToken, 0.22 + this.speed * 0.06, 0.45);
      this.fx.ripple(ZA, 1, 1);
      this.ai.userData.ripple(b.x - this.ap.x, b.y - this.ap.y, this.time);
      this.portal.userData.pulse(0.6);
    }
    let tz = Math.floor(Math.random() * ZONES);
    // Two or more points behind: the AI goes for your weak spot less often (a chance to catch up).
    const randomAim = this.pts[1] - this.pts[0] >= 2 ? Math.max(this.ease.randomAim, 0.8) : this.ease.randomAim;
    if (!isServe && Math.random() > randomAim) {
      let bestS = -Infinity;
      for (let z = 0; z < ZONES; z++) {
        const c = zoneXY(z);
        const weak = (this.miss[z] + 0.3) / (this.att[z] + 1);
        const away = Math.hypot(c.x - this.pp.x, c.y - this.pp.y) / (2 * HW);
        const sc = weak + 0.4 * away + Math.random() * 0.08;
        if (sc > bestS) { bestS = sc; tz = z; }
      }
    }
    const c = zoneXY(isServe ? 4 : tz);
    const err = () => (Math.random() - 0.5) * 2 * this.aiError;
    const target = {
      x: c.x + (isServe ? (Math.random() - 0.5) * 0.2 : 0) + err(),
      y: c.y + (isServe ? (Math.random() - 0.5) * 0.14 : 0) + err(),
    };
    const s = this.speed * this.ballType.speed;
    const T = (ZP - ZA) / s;
    // Direct path or one bounce off a wall, whichever fits the angle limits (picked at random).
    const solve = (x0, tgt, lim, maxV) => {
      const opts = [tgt, 2 * lim - tgt, -2 * lim - tgt].map((u) => (u - x0) / T).filter((vel) => Math.abs(vel) <= maxV);
      return opts.length ? opts[Math.floor(Math.random() * opts.length)] : (tgt - x0) / T;
    };
    // An imprecise opponent can't risk the edges: its usable target area shrinks.
    const lx = HW - b.r;
    const ly = HH - b.r;
    const mx = lx - this.aiError * 0.6;
    const my = ly - this.aiError * 0.6;
    b.vx = solve(b.x, clamp(target.x, -mx, mx), lx, s * 0.7);
    b.vy = solve(b.y, clamp(target.y, -my, my), ly, s * 0.55);
    b.vz = s;
    b.sx = 0;
    b.sy = 0;
    b.z = ZA + 0.001;
    this.refreshHud();
  }

  /** Very long rallies keep getting faster, so every rally ends at some point. */
  speedCap() {
    return (this.sMax ?? S_MAX) + Math.max(0, this.rally - 24) * 0.05;
  }

  /** Where the ball will cross the AI plane (simulated, including spin and bounces). */
  predictLanding() {
    const s = { ...this.b };
    for (let i = 0; i < 600 && s.z > ZA; i++) PongScene.advance(s, 0.01);
    return { x: s.x, y: s.y };
  }

  moveAI(dt) {
    const b = this.b;
    let speed = this.aiSpeed;
    if (this.mode === 'play' && b.vz < 0) {
      // The AI re-plans only every "reaction" seconds (its response time).
      this.nextPlan = (this.nextPlan ?? 0) - dt;
      if (this.nextPlan <= 0) {
        this.nextPlan = this.reaction;
        if (b.z < TRACK_Z) {
          const l = this.predictLanding();
          if (!this.aimErr) {
            // Catch error grows with ball speed; now and then the AI misreads the shot badly.
            const e = this.aiError * this.ease.catchError * (0.6 + this.speed / (this.sMax ?? S_MAX)) + (Math.random() < this.ease.misjudge ? 0.13 : 0);
            const a = Math.random() * Math.PI * 2;
            const k = 0.5 + Math.random() * 0.5;
            this.aimErr = { x: Math.cos(a) * e * k, y: Math.sin(a) * e * k };
          }
          this.aiTarget.set(l.x + this.aimErr.x, l.y + this.aimErr.y);
        } else if (this.model.n >= LEARNED && this.aiGuess) {
          this.aiTarget.set(this.aiGuess.x, this.aiGuess.y); // only what it learned about you
        }
      }
    } else {
      this.aimErr = null;
      if (this.mode !== 'serve') this.aiTarget.set(0, 0);
      speed *= 0.5;
    }
    this.aiTarget.x = clamp(this.aiTarget.x, -HW + PW * 0.7, HW - PW * 0.7);
    this.aiTarget.y = clamp(this.aiTarget.y, -HH + PH * 0.7, HH - PH * 0.7);
    const d = this.aiTarget.clone().sub(this.ap);
    const len = d.length();
    if (len > 1e-5) this.ap.add(d.multiplyScalar(Math.min(1, (speed * dt) / len)));
  }

  // ----- visuals -----

  render(dt) {
    const b = this.b;
    const live = this.mode === 'serve' || this.mode === 'play' || this.mode === 'point';
    const flying = this.mode === 'play';
    const heat = flying ? (this.turbo ? 1 : clamp((this.speed - (this.s0 ?? S0)) / ((this.sMax ?? S_MAX) - (this.s0 ?? S0)), 0, 1)) : 0;
    // Blue while your shot flies towards the AI, red when the AI's shot comes back.
    const own = new THREE.Color(hex(b.vz < 0 ? 'xr-pong-player' : this.aiToken));
    // Each special ball adds its own tint (dark damper, frosty ice, golden bouncy).
    const bt = this.ballType ?? BALLS[0];
    if (bt.tint) own.lerp(new THREE.Color(hex(bt.tint)), bt.mix);
    if (flying && bt.key === 'ice') {
      this.frostT = (this.frostT ?? 0) + dt;
      if (this.frostT > 0.07) { this.frostT = 0; this.burst(this.arena.localToWorld(new THREE.Vector3(b.x, b.y, b.z)), 'xr-pong-ice', 2); }
    }

    const shown = live && !this.ballGone;
    this.ball.visible = shown;
    this.ballGlow.visible = shown;
    this.ball.position.set(b.x, b.y, b.z);
    const pulse = this.mode === 'serve' ? 1 + Math.sin(this.time * 10) * 0.15 : 1;
    const type = this.ballType ?? BALLS[0];
    const size = (type.r / R) * pulse;
    if (type.key === 'bouncy') {
      // The bouncy ball wobbles like rubber.
      const w = Math.sin(this.time * 18) * 0.08;
      this.ball.scale.set(size * (1 + w), size * (1 - w), size);
    } else {
      this.ball.scale.setScalar(size);
    }
    this.ballRing.rotation.x += dt * 3;
    this.ballRing.rotation.y += dt * 1.7;
    this.ballCrystal.rotation.x += dt * 1.2;
    this.ballCrystal.rotation.z += dt * 0.9;
    this.ballRing.material.emissive.copy(own);
    this.ballCrystal.material.emissive.copy(own);
    this.ball.material.emissive.copy(own);
    this.ball.material.color.copy(own).lerp(new THREE.Color(type.key === 'damper' ? 0x222222 : 0xffffff), type.key === 'ice' ? 0.6 : 0.35);
    this.ball.material.emissiveIntensity = 0.9 + heat * 0.8;
    const model = this.ballModels?.[type.key];
    if (model) {
      // Neon parts glow in the owner's color (hotter = whiter); the ball rolls with its flight.
      const glow = own.clone().lerp(WHITE, 0.15 + heat * 0.35);
      for (const m of model.mats.NeonBall ?? []) m.color.copy(glow).multiplyScalar(this.look.neon);
      for (const m of model.mats.BallIce ?? []) { m.emissive.copy(own); m.emissiveIntensity = 0.3 + heat * 0.3; }
      const rr = Math.max(b.r ?? R, 0.01);
      this.ballBody.rotation.x -= ((flying ? b.vz : 0.5) * dt * 0.35) / rr;
      this.ballBody.rotation.y += ((flying ? b.vx + b.sx * 0.3 : 0.3) * dt * 0.35) / rr;
    }
    this.ballGlow.position.copy(this.ball.position);
    this.ballGlow.material.color.copy(own);
    this.ballGlow.scale.setScalar((0.15 + heat * 0.07) * pulse);
    this.ballLight.position.copy(this.ball.position);
    this.ballLight.color.copy(own);
    this.ballLight.intensity = live ? 0.7 + heat * 0.8 : 0;

    // Ribbon comet trail and fresnel shell, longer and brighter when fast.
    if (!flying) this.trail.reset(this.ball.position);
    this.trail.update(this.ball.position.clone(), own, flying ? 0.9 + heat * 0.6 : 0, 1 + heat * 0.6);
    this.shell.material.uniforms.uColor.value.copy(own);
    this.shell.material.uniforms.uIntensity.value = 1.1 + heat * 0.9 + Math.sin(this.time * 12) * 0.15;
    this.shell.scale.setScalar(1 + Math.sin(this.time * 9) * 0.06);

    // Depth frame and wall dots follow the ball.
    this.depthFrame.visible = shown;
    this.depthFrame.position.z = b.z;
    this.depthFrame.material.color.copy(own);
    this.depthFrame.material.opacity = 0.55 + heat * 0.35;
    const dots = [[b.x, -HH + 0.003, b.z], [b.x, HH - 0.003, b.z], [-HW + 0.003, b.y, b.z], [HW - 0.003, b.y, b.z]];
    const gap = [b.y + HH, HH - b.y, b.x + HW, HW - b.x];
    this.wallDots.forEach((d, i) => {
      d.visible = shown;
      d.position.set(...dots[i]);
      d.material.color.copy(own);
      const k = 1 - clamp(gap[i] / (2 * HH), 0, 1);
      d.scale.setScalar(0.6 + k * 0.9);
      d.material.opacity = 0.25 + k * 0.6;
    });

    // XXL paddles grow and shrink smoothly; extra balls follow their state.
    for (const side of ['player', 'ai']) {
      if (this.giant[side] > 0 && (this.mode === 'play' || this.mode === 'serve')) this.giant[side] = Math.max(0, this.giant[side] - dt);
      const want = (this.giant[side] > 0 ? 1.5 : 1) * (side === 'player' ? this.padBase ?? 1 : 1);
      this.padK[side] += (want - this.padK[side]) * Math.min(1, dt * 6);
    }
    this.renderExtras();
    // Paddles, Echo holding yours, the robot behind the AI's
    this.player.position.set(this.pp.x, this.pp.y, ZP);
    this.ai.position.set(this.ap.x, this.ap.y, ZA);
    this.paddleEcho?.update(dt, this.time);
    this.robot?.update(dt, this.ap);
    for (const pad of [this.player, this.ai]) {
      const u = pad.userData;
      u.flash = Math.max(0, u.flash - dt * 4);
      pad.scale.setScalar((1 + (this.calm ? 0 : u.flash * 0.12)) * (pad === this.player ? this.padK.player : this.padK.ai));
      // Browser: you look through your own paddle, so it is far more see-through and barely glows.
      const see = this.screen && pad === this.player ? 0.4 : 1;
      u.tick(this.time, (1 + u.flash * (this.calm ? 0.4 : 1.5)) * see);
      u.glow.material.opacity = (0.3 + u.flash * (this.calm ? 0.1 : 0.5)) * (see < 1 ? 0.25 : 1);
    }

    // Tunnel energy, end-frame flash after a point, effects.
    for (const e of this.tunnel.edges) e.userData.tick(dt, (flying ? this.speed : 0.3) + this.storm.env * 3);
    // Blender frame: light seams flash on every hit (not with calm motion).
    this.neonKick = this.calm ? 0 : Math.max(0, this.neonKick - dt * 2.5);
    if (this.frameModel) {
      for (const m of this.frameModel.mats.NeonRail ?? []) m.color.copy(this.cRail).lerp(WHITE, this.neonKick * 0.55).multiplyScalar(this.look.neon);
    }
    this.rain.userData.tick(this.time, (flying ? heat * 0.8 : 0) + this.storm.env);
    // Real room: light pool below the arena in the color of the action, rain boost in a storm.
    if (this.arena.visible) this.room.setPool(this.arena.getWorldPosition(this.tmpV), own, 0.22 + heat * 0.3 + this.neonKick * 0.35, 2.4);
    else this.room.setPool(this.tmpV, own, 0);
    this.room.wallShared.uBoost.value = this.storm.env * 1.5 + heat * 0.5;
    this.room.update(dt);
    if (this.endFlash) {
      this.endFlash.k = Math.max(0, this.endFlash.k - dt * 1.2);
      this.endFlash.frame.material.opacity = 0.7 + this.endFlash.k * 0.3;
      this.endFlash.frame.scale.setScalar(1 + this.endFlash.k * 0.08);
      if (!this.endFlash.k) this.endFlash = null;
    }
    this.shock.update(dt);
    this.fx.update(dt, this.time, flying ? this.speed : 0.2);
    this.portal.userData.update(dt, this.time);
    this.storm.update(dt);
    this.obstacles.update(dt, this.time);
    this.dust.userData.tick(dt);
    this.brain.userData.tick(dt);
    this.brain.position.y = HH + 0.37 + Math.sin(this.time * 1.4) * 0.015;

    // The AI's guess on the far plane and a beam from its brain: where it waits while your shot
    // flies, and (dimmer) the field it expects most while the ball comes to you.
    const learned = this.model?.n >= LEARNED;
    const guessing = flying && b.vz < 0 && this.aiGuess && learned;
    const p = this.prediction;
    let top = 0;
    let max = 1e-6;
    if (p) for (let z = 0; z < ZONES; z++) if (p[z] > max) { max = p[z]; top = z; }
    const waiting = flying && b.vz > 0 && learned && p;
    const target = guessing ? 0.35 + 0.65 * (this.aiConf ?? 0) : waiting ? 0.3 : 0;
    this.guess.material.opacity += (target - this.guess.material.opacity) * Math.min(1, dt * 8);
    if (guessing) this.guess.position.set(this.aiGuess.x, this.aiGuess.y, ZA - 0.01);
    else if (waiting) { const c = zoneXY(top); this.guess.position.set(c.x, c.y, ZA - 0.01); }
    // The far wall as a heat map of the AI's expectation.
    const lit = learned && p && (this.mode === 'play' || this.mode === 'serve');
    this.heat.forEach((m, z) => {
      const want = lit ? 0.04 + 0.5 * (p[z] / max) ** 1.5 : 0;
      m.material.opacity += (want - m.material.opacity) * Math.min(1, dt * 6);
      m.visible = m.material.opacity > 0.005;
    });
    this.guess.scale.setScalar(1 + Math.sin(this.time * 8) * 0.05);
    const pos = this.beam.geometry.attributes.position;
    pos.setXYZ(0, this.brain.position.x, this.brain.position.y - 0.05, this.brain.position.z);
    pos.setXYZ(1, this.guess.position.x, this.guess.position.y, this.guess.position.z);
    pos.needsUpdate = true;
    this.beam.material.opacity = this.guess.material.opacity * 0.7;
    this.toastTick?.(dt);
  }

  /**
   * Short message: in the headset in front of the scoreboard, in the browser at the top of the
   * view (layoutScreen). Long texts wrap.
   */
  toast(text, seconds = 2.4) {
    this.toastPanel?.removeFromParent();
    const holder = this.add(new THREE.Group());
    holder.position.copy(this.boardHolder.position).add(new THREE.Vector3(0, 0, 0.03));
    holder.scale.setScalar(1.35);
    const p = textPanel(0.86, 0.1, [{ text, size: 'xr-text-md', weight: 'black' }], { surface: { stroke: color('xr-pong-predict') }, layout: { pad: 0.022 } });
    holder.add(p);
    this.toastPanel = holder;
    if (this.screen) {
      holder.userData.w = p.w;
      holder.userData.h = p.h;
      solid(p);
      this.onTop(holder, 31);
      this.layoutScreen();
    }
    this.popIn(p);
    sfx.build();
    let life = seconds;
    this.toastTick = (dt) => {
      life -= dt;
      if (life <= 0) { holder.removeFromParent(); this.toastTick = null; }
    };
  }

  drawBoard(ctx, c) {
    c.surface();
    const W = c.canvas.width;
    const H = c.canvas.height;
    ctx.textBaseline = 'middle';
    ctx.font = font('black', c.m(0.08));
    ctx.textAlign = 'right';
    ctx.fillStyle = color('xr-pong-player');
    ctx.fillText(String(this.pts?.[0] ?? 0), W / 2 - c.m(0.035), H * 0.55);
    ctx.textAlign = 'left';
    ctx.fillStyle = color(this.aiToken);
    ctx.fillText(String(this.pts?.[1] ?? 0), W / 2 + c.m(0.035), H * 0.55);
    ctx.textAlign = 'center';
    ctx.fillStyle = color('xr-panel-muted');
    ctx.fillText(':', W / 2, H * 0.5);
    ctx.font = font('bold', c.m(num('xr-text-sm')));
    ctx.textAlign = 'left';
    ctx.fillStyle = color('xr-pong-player');
    ctx.fillText(t('pongYou'), c.m(0.03), H * 0.5);
    ctx.textAlign = 'right';
    ctx.fillStyle = color(this.aiToken);
    ctx.fillText(this.aiName(), W - c.m(0.03), H * 0.5);
  }

  /** "AI thoughts": 3 x 3 heat map of where it expects your next shot. */
  drawMind(ctx, c) {
    c.surface();
    const pad = c.m(0.03);
    const W = c.canvas.width;
    const H = c.canvas.height;
    const sm = c.m(num('xr-text-sm'));
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = color('xr-panel-text');
    ctx.font = font('bold', c.m(num('xr-text-md')));
    ctx.fillText(t('pongMind'), pad, pad);
    ctx.font = font('regular', sm);
    ctx.fillStyle = color('xr-panel-muted');
    ctx.fillText(t('pongWhere'), pad, pad + c.m(0.055));

    const p = this.prediction ?? new Float32Array(ZONES).fill(1 / ZONES);
    let best = 0;
    for (let z = 1; z < ZONES; z++) if (p[z] > p[best]) best = z;
    const top = pad + c.m(0.1);
    const gw = W - 2 * pad;
    const gh = H - top - pad - c.m(0.1);
    const cw = gw / 3;
    const ch = gh / 3;
    const max = Math.max(...p);
    for (let z = 0; z < ZONES; z++) {
      const x = pad + (z % 3) * cw;
      const y = top + Math.floor(z / 3) * ch;
      ctx.fillStyle = color(z === best && this.model?.n ? 'xr-pong-predict' : 'xr-pong-player');
      ctx.globalAlpha = 0.12 + 0.88 * (p[z] / max) * (this.model?.n ? 1 : 0.3);
      ctx.fillRect(x + c.m(0.004), y + c.m(0.004), cw - c.m(0.008), ch - c.m(0.008));
      ctx.globalAlpha = 1;
      ctx.fillStyle = color('xr-panel-text');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = font('bold', sm);
      ctx.fillText(`${Math.round(p[z] * 100)}`, x + cw / 2, y + ch / 2);
    }
    const log = (this.shotLog ?? []).slice(-8);
    const acc = log.length ? Math.round((log.reduce((a, b) => a + b, 0) / log.length) * 100) : 0;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = color('xr-panel-text');
    ctx.font = font('bold', sm);
    ctx.fillText(t('pongAccuracy', { n: acc }), pad, H - pad - c.m(0.085));
    let weak = -1;
    let ws = 0;
    for (let z = 0; z < ZONES; z++) {
      const s = this.miss?.[z] >= 1 ? this.miss[z] / Math.max(1, this.att[z]) : 0;
      if (s > ws) { ws = s; weak = z; }
    }
    ctx.fillStyle = color('xr-danger');
    const weakText = weak >= 0 ? t('pongWeak', { zone: t(`pongZone${weak}`) }) : t('pongWeakUnknown');
    let fs = sm;
    while (ctx.measureText(weakText).width > W - 2 * pad && fs > sm * 0.7) { fs -= 1; ctx.font = font('bold', fs); }
    ctx.fillText(weakText, pad, H - pad - c.m(0.04));
  }

  dispose() {
    this.mode = 'over';
    music.stop();
    this.app.echo?.suppress(false);
    this.announcer.stop();
    this.setRays(true);
    this.room?.dispose();
    if (this.screen) {
      this.engine.fitEnabled = true;
      this.engine.camera.rotation.set(0, 0, 0);
    }
    super.dispose();
  }
}
