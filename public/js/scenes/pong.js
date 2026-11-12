// "AI Pong": 3D tunnel pong played with your own hand against an AI opponent.
// Your paddle moves in width and height at the near end of a neon tunnel; the ball flies
// in all three axes, bounces off the four walls and curves when you hit it with spin.
// The AI counts where you play (per situation), predicts your next shot and moves there
// early. It also remembers where you miss and aims for that spot. Each opponent has its
// own reaction time, paddle speed and precision (see PONG_OPPONENTS in content.js).
import * as THREE from 'three';
import { BaseScene, layoutRow } from '../scene.js';
import { Button, Panel, textPanel, placeOnArc } from '../ui3d.js';
import { color, hex, num, font } from '../tokens.js';
import { t } from '../i18n.js';
import { sfx } from '../sfx.js';
import { PONG_OPPONENTS } from '../content.js';
import { radialTexture } from '../robot-visuals.js';
import { Shockwaves, makeDust, makeBrain, makeTunnel, makeGlassPaddle, frameGeometry } from '../pong-visuals.js';
import { DataStorm, Obstacles, POWERUPS } from '../pong-events.js';
import { HoloFX, makePortal, makeFresnelShell, RibbonTrail } from '../pong-shaders.js';
import { Announcer } from '../pong-announcer.js';
import { music } from '../music.js';
import { loadPongArena, loadPongBalls } from '../pong-models.js';
import { makePaddleEcho, makePaddleRobot, ROBOT_FOR, makeGridFloor, makeSkyline, makeHandle } from '../pong-cast.js';
import { makeDataRain } from '../pong-rain.js';
import { ARRoom } from '../ar-room.js';
import { quality } from '../quality.js';
import { aimPad } from '../touch-ui.js';
import { EVENT, EVENT_ROUNDS } from '../event.js';
import { pongLook } from '../pong-look.js';

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
const WIN = EVENT ? EVENT_ROUNDS.pongWin : 5; // event mode: shorter matches
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
    this.refreshHud = this.hud(() => `${t('pongName')}  ·  ${t('pongYou')} ${this.pts?.[0] ?? 0} : ${this.pts?.[1] ?? 0} ${this.aiName()}  ·  ${t('pongRally')} ${this.rally ?? 0}${this.ladder?.length > 1 ? `  ·  ${t('pongStage', { n: this.stage + 1, total: this.ladder.length })}` : ''}${this.ballType ? `  ·  ${t(`pongBall_${this.ballType.key}`)}` : ''}`);
    this.buildArena();
    this.announcer = new Announcer(this);
    this.setupTouch();
    this.onUpdate((dt) => this.update(dt));
    this.chooseOpponent();
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
    const live = () => ['point', 'serve', 'play'].includes(this.mode);
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
    this.mobileView((cam, dt, ins) => {
      if (!live() || !this.arena.visible) return false;
      const W = window.innerWidth;
      const H = window.innerHeight;
      const fov = 64;
      const tv = Math.tan(THREE.MathUtils.degToRad(fov / 2));
      const th = tv * (W / H);
      // The near frame of the tunnel fits the free part of the screen (between the status bar,
      // the control field and the screen edges).
      const freeH = Math.max(0.35, 1 - (ins.top + ins.bottom) / H);
      const freeW = Math.max(0.35, 1 - ins.right / W);
      const hw = (HW + 0.05) * SCALE;
      const hh = (HH + 0.05) * SCALE;
      const d = Math.max(NEAR_GAP, hw / (th * freeW), hh / (tv * freeH));
      const yT = this.eye - TUNNEL_DROP;
      const nearZ = TUNNEL_Z + ZP * SCALE;
      const want = new THREE.Vector3((ins.right / W) * d * th, yT - ((ins.bottom - ins.top) / H) * d * tv, nearZ + d).add(this.engine.root.position);
      if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
      cam.rotation.set(0, 0, 0);
      cam.position.lerp(want, Math.min(1, dt * 4));
      return true;
    });
  }

  /** The control field: shown while you play; paddle and ball on it like on a radar. */
  updateAimPad() {
    const on = ['point', 'serve', 'play'].includes(this.mode);
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
    return this.opp?.name ?? t('pongAI');
  }

  // ----- opponent choice -----

  chooseOpponent() {
    const { eye, dist } = this;
    this.clearLayer();
    this.mode = 'intro';
    this.arena.visible = false; // the tunnel builds up when the match starts
    this.room.rainOn = false;
    this.room.tilesOn = false;
    this.setRays(true);
    const head = this.add(textPanel(1.26, 0.26, [
      { text: t('pongName'), size: 'xr-text-title', weight: 'black', gap: 0.02 },
      { text: `${t('pongIntro', { n: WIN })}${this.engine.isXR ? '' : ` ${t(this.engine.touchUI ? 'pongIntroTouch' : 'pongIntroScreen')}`}`, size: 'xr-text-sm', color: color('xr-panel-muted'), gap: 0.02 },
      { text: t(EVENT ? 'pongChooseEvent' : 'pongChoose'), size: 'xr-text-md', weight: 'bold' },
    ], { layout: { align: 'left' } }));
    head.position.set(0, eye + 0.5 - head.h / 2, -dist);
    this.popIn(head);
    this.app.host?.introduce(this, 'pong', head);
    const w = 0.4;
    const h = 0.27;
    const y = head.position.y - head.h / 2 - 0.03 - h / 2;
    PONG_OPPONENTS.forEach((o, i) => {
      const card = this.add(this.opponentCard(o, w, h));
      card.position.set((i - 1) * (w + 0.03), y, -dist);
      this.popIn(card, 0.08 + i * 0.06);
    });
    // Music and announcer can be switched off (saved per device).
    const label = (key, on) => `${t(key)}: ${on ? t('on') : t('off')}`;
    const musicBtn = new Button(0.34, 0.1, { label: label('pongMusic', music.enabled), labelSize: 'xr-text-sm', onClick: (ptr, btn) => {
      music.setEnabled(!music.enabled);
      btn.opts.label = label('pongMusic', music.enabled);
      btn.redraw();
    } });
    const voiceBtn = new Button(0.34, 0.1, { label: label('pongVoice', this.announcer.enabled), labelSize: 'xr-text-sm', onClick: (ptr, btn) => {
      this.announcer.setEnabled(!this.announcer.enabled);
      btn.opts.label = label('pongVoice', this.announcer.enabled);
      btn.redraw();
    } });
    const rowY = y - h / 2 - 0.03 - 0.05;
    layoutRow([musicBtn, voiceBtn], rowY, -dist, 0.03);
    [musicBtn, voiceBtn].forEach((b, i) => { this.add(b); this.popIn(b, 0.25 + i * 0.05); });
    const note = this.add(textPanel(1.26, 0.05, [{ text: t('pongSource'), size: 'xr-text-sm', color: color('xr-bg-muted') }], { surface: false }));
    note.position.set(0, rowY - 0.05 - 0.02 - note.h / 2, -dist);
  }

  /** Clickable card: name plus three rating bars (reaction, speed, precision). */
  opponentCard(o, w, h) {
    let hover = false;
    const card = new Panel(w, h, (ctx, c) => {
      const accent = color(o.token);
      c.surface({ stroke: accent, strokeWidth: num('xr-border-width') * (hover ? 2.5 : 1.2), stripe: false });
      const pad = c.m(0.025);
      const W = c.canvas.width;
      ctx.fillStyle = accent;
      ctx.fillRect(pad, pad * 0.6, W - 2 * pad, c.m(0.008));
      ctx.fillStyle = color('xr-panel-text');
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = font('black', c.m(num('xr-text-md')));
      ctx.fillText(o.name, pad, pad + c.m(0.012));
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
    card.userData.onClick = () => { sfx.click(); this.startLadder(o); };
    card.userData.label = o.name;
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
    this.paddleEcho = makePaddleEcho(this.player, PPW, PPH, (model) => this.look.casters(model));
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
        this.look.casters(root);
        root.scale.setScalar(R);
        root.visible = false;
        this.ballBody.add(root);
      }
      if (this.ballType) this.showBallModel(this.ballType);
    }).catch((e) => console.warn('Pong ball models not loaded', e));
    this.ballType = null;
    this.look.casters(this.ball);
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
    this.robot = makePaddleRobot(ROBOT_FOR[opp.key] ?? 'light', opp.token, { hh: HH, hw: HW, z: ZA - 0.08 });
    this.look.casters(this.robot.group);
    this.arena.add(this.robot.group);
    this.ease = { ...PONG_EASE, ...(opp.ease ?? {}) };
    this.reaction = opp.reaction + this.ease.reaction;
    this.aiSpeed = opp.speed * this.ease.speed;
    this.aiError = opp.error;
  }

  /** Switches the ball type (physics and look) and announces it. */
  setBall(type, announce) {
    this.ballType = type;
    Object.assign(this.b, { r: type.r, rest: type.rest, decay: type.decay, slide: type.slide });
    this.showBallModel(type);
    if (announce) {
      this.toast(`${t(`pongBall_${type.key}`)}: ${t(`pongBallInfo_${type.key}`)}`);
      this.shock.spawn(this.b.x, this.b.y, this.b.z, new THREE.Vector3(0, 0, 1), 'xr-pong-predict', 0.25, 0.6);
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
    const boss = PONG_OPPONENTS.find((o) => o.boss);
    this.ladder = first.boss || EVENT ? [first] : [first, ...PONG_OPPONENTS.filter((o) => o !== first && !o.boss), boss];
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
    this.model = new PatternModel();
    this.lastZone = -1;
    this.att = new Float32Array(ZONES);
    this.miss = new Float32Array(ZONES);
    this.shotLog = []; // 1 = the AI predicted your shot correctly
    this.zoneCount = new Float32Array(ZONES);
    this.prediction = new Float32Array(ZONES).fill(1 / ZONES);
    this.patternShown = false;
    this.ballType = null;
    this.nextObstacle = 5; // seconds of play until the first obstacle
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
    this.mind = this.add(new Panel(0.6, 0.52, (ctx, c) => this.drawMind(ctx, c)));
    placeOnArc(this.mind, 0.72, this.eye - 0.02, this.dist + 0.1);
    this.mind.visible = !this.engine.touchUI; // phones: the control field takes its place
    this.popIn(this.board, 0.3);
    this.popIn(this.mind, 0.4);
    this.refreshHud();
    this.swipeTo = null;
    this.mode = 'point'; // paddle already follows the hand during the build-up
    this.streak = 0;
    this.startMusic(0, 'pong');
    this.delay(0.5, () => { if (!this.disposed) this.announcer.say('pongCallFight', {}, 'xr-pong-predict', { priority: true }); });
    this.delay(1.4, () => { if (!this.disposed) this.serve(); });
  }

  serve() {
    this.mode = 'serve';
    this.ballGone = false;
    this.turbo = false;
    this.clearExtras();
    this.rally = 0;
    this.speed = S0;
    this.serveTime = 1.0;
    Object.assign(this.b, { vx: 0, vy: 0, vz: 0, sx: 0, sy: 0 });
    // Now and then a different ball comes into play (always the energy ball first).
    const first = !this.ballType;
    let type = this.ballType ?? BALLS[0];
    if (!first && Math.random() < 0.6) {
      const others = BALLS.filter((x) => x !== type);
      type = others[Math.floor(Math.random() * others.length)];
    }
    this.setBall(type, !first && type !== this.ballType);
    if (this.pts && Math.max(...this.pts) === WIN - 1) {
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
    this.burst(this.arena.localToWorld(new THREE.Vector3(x, y, z)), token, 44);
    this.shock.spawn(x, y, z, new THREE.Vector3(0, 0, 1), token, 0.5, 0.9);
    // The whole tunnel flashes in the scorer's color, a big wave runs through it.
    this.fx.flash(hex(token), 1);
    this.fx.ripple(z, toPlayer ? 0 : 1, 2);
    if (toPlayer) this.portal.userData.pulse(1.5);
    this.endFlash = { frame: toPlayer ? this.tunnel.far : this.tunnel.near, k: 1 };
    if (!toPlayer) this.brain.userData.pulse(1);
    this.escapeBall(toPlayer, token);
    this.board.redraw();
    this.refreshHud();
    // Announcer: streaks, long rallies and the end of the match.
    this.streak = toPlayer ? Math.max(0, this.streak) + 1 : Math.min(0, this.streak) - 1;
    const over = this.pts[0] >= WIN || this.pts[1] >= WIN;
    const name = this.opp.name;
    if (over) {
      const champion = this.pts[0] >= WIN && this.ladder && this.stage === this.ladder.length - 1 && this.ladder.length > 1;
      if (champion) this.announcer.say('pongCallChampion', {}, 'xr-pong-predict', { priority: true });
      else if (this.pts[0] >= WIN) this.announcer.say(this.pts[1] === 0 ? 'pongCallPerfect' : 'pongCallWin', {}, 'xr-pong-predict', { priority: true });
      else this.announcer.say('pongCallLose', { name }, this.aiToken, { priority: true });
    } else if (toPlayer) {
      const key = this.rally >= 12 ? 'pongCallRallyWin' : this.streak >= 4 ? 'pongCallUnstoppable' : this.streak === 3 ? 'pongCallTriple' : this.streak === 2 ? 'pongCallDouble' : 'pongCallScore';
      this.announcer.say(key, {}, 'xr-pong-player', { priority: true });
    } else {
      this.announcer.say(this.streak <= -3 ? 'pongCallAiDominate' : 'pongCallAiScore', { name }, this.aiToken, { priority: true });
    }
    this.delay(over ? 2.2 : 1.3, () => {
      if (this.disposed) return;
      if (over) this.finish();
      else this.serve();
    });
  }

  // ----- power-ups -----

  /** Unlocks the effect of a power-up for the shooter ('player' or 'ai'). */
  triggerPower(kind, pos, shooter) {
    const b = this.b;
    const token = POWERUPS[kind].token;
    sfx.powerup();
    this.fx.flash(hex(token), 0.5);
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
    if (this.pts[toPlayer ? 0 : 1] + 1 >= WIN) {
      // Match ball: the extra ball becomes the deciding ball.
      Object.assign(this.b, { x: e.x, y: e.y, z: e.z, vx: e.vx, vy: e.vy, vz: e.vz });
      this.removeExtra(ex);
      this.point(toPlayer);
      return;
    }
    this.pts[toPlayer ? 0 : 1] += 1;
    const token = toPlayer ? 'xr-pong-player' : this.aiToken;
    sfx.point();
    this.fx.flash(hex(token), 0.7);
    this.fx.ripple(toPlayer ? ZA : ZP, toPlayer ? 0 : 1, 1.5);
    this.burst(this.arena.localToWorld(new THREE.Vector3(e.x, e.y, toPlayer ? ZA : ZP)), token, 30);
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
    const matchScore = you * 100 + Math.min(MAX_HIT_POINTS, this.hits * 10) + (win ? 300 + this.stage * 200 : 0);
    this.totalScore = (this.totalScore ?? 0) + matchScore;
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
    const score = this.totalScore;
    const champion = win && this.ladder?.length > 1;
    const total = this.zoneCount.reduce((a, b) => a + b, 0) || 1;
    const fav = this.zoneCount.indexOf(Math.max(...this.zoneCount));
    const pct = (arr) => (arr.length ? Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 100) : 0);
    this.results({
      gameKey: 'pong', score, correct: you, total: WIN,
      line: champion ? t('pongChampion') : `${t(win ? 'pongWon' : 'pongLost', { name: this.opp.name })} · ${you} : ${ai}`,
      learned: [
        { q: t('pongLearnFav'), a: `${t(`pongZone${fav}`)} · ${Math.round((this.zoneCount[fav] / total) * 100)} %` },
        { q: t('pongLearnAcc'), a: t('pongAccStartEnd', { a: pct(this.shotLog.slice(0, 6)), b: pct(this.shotLog.slice(-6)) }) },
        { q: t('pongLesson'), a: t('pongLessonText') },
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
    const panel = this.add(textPanel(1.0, 0.3, [
      { text: t('pongBeat', { name: this.opp.name }), size: 'xr-text-lg', weight: 'black', color: color('xr-pong-player'), gap: 0.02 },
      { text: t(isBoss ? 'pongNextBoss' : 'pongNextUp', { name: next.name }), size: 'xr-text-md', weight: 'bold', color: color(isBoss ? 'xr-danger' : 'xr-panel-text'), gap: 0.015 },
      { text: `${t('pongStage', { n: this.stage + 2, total: this.ladder.length })}  ·  ${t('score')}: ${this.totalScore}`, size: 'xr-text-sm', color: color('xr-panel-muted') },
    ]));
    panel.position.set(0, eye + 0.02 - panel.h / 2, -dist); // below the announcer callout
    this.popIn(panel);
    this.delay(0.6, () => { if (!this.disposed) this.announcer.say(isBoss ? 'pongCallBoss' : 'pongCallNext', { name: next.name }, isBoss ? 'xr-danger' : 'xr-pong-predict', { priority: true }); });
    this.delay(4.2, () => {
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
    if (this.mode === 'serve' || this.mode === 'play' || this.mode === 'point') this.readPaddle(dt);

    if (this.mode === 'serve') {
      Object.assign(this.b, { x: this.ap.x, y: this.ap.y, z: ZA + 0.05 });
      this.serveTime -= dt;
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
    this.render(dt);
    this.announcer.update(dt);
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
          const kinds = Object.keys(POWERUPS).filter((k) => k !== 'multi' || !this.extras.length);
          const kind = kinds[Math.floor(Math.random() * kinds.length)];
          this.obstacles.spawn(x, y, z, kind);
          this.shock.spawn(x, y, z, new THREE.Vector3(0, 0, 1), POWERUPS[kind].token, 0.2, 0.5);
          sfx.appear();
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
    this.b.wx = w.x;
    this.b.wy = w.y;
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
    this.burst(this.arena.localToWorld(new THREE.Vector3(b.x, b.y, ZP)), 'xr-pong-player', 16);
    this.shock.spawn(b.x, b.y, ZP - 0.005, new THREE.Vector3(0, 0, 1), 'xr-pong-player', 0.22 + s * 0.06, 0.45);
    this.fx.ripple(ZP, 0, 1);
    this.player.userData.ripple(b.x - this.pp.x, b.y - this.pp.y, this.time);
    if (Math.hypot(b.sx, b.sy) > 0.6) this.shock.spawn(b.x, b.y, ZP - 0.01, new THREE.Vector3(0, 0, 1), 'xr-pong-heat', 0.12, 0.6);

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
    this.shot = { inZone, last: this.lastZone, pred };
    this.nextPlan = this.reaction; // the model needs its response time before it moves
    this.brain.userData.pulse(0.6);
    if (!this.patternShown && this.model.n >= 4 && conf >= 0.4) {
      this.patternShown = true;
      this.announcer.say('pongCallRead', {}, this.aiToken, { priority: true });
    }
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
    this.model.learn(this.shot.inZone, this.shot.last, zone);
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
      this.burst(this.arena.localToWorld(new THREE.Vector3(b.x, b.y, ZA)), this.aiToken, 16);
      this.shock.spawn(b.x, b.y, ZA + 0.005, new THREE.Vector3(0, 0, 1), this.aiToken, 0.22 + this.speed * 0.06, 0.45);
      this.fx.ripple(ZA, 1, 1);
      this.ai.userData.ripple(b.x - this.ap.x, b.y - this.ap.y, this.time);
      this.portal.userData.pulse(0.6);
    }
    let tz = Math.floor(Math.random() * ZONES);
    if (!isServe && Math.random() > this.ease.randomAim) {
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
    return S_MAX + Math.max(0, this.rally - 24) * 0.05;
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
            const e = this.aiError * this.ease.catchError * (0.6 + this.speed / S_MAX) + (Math.random() < this.ease.misjudge ? 0.13 : 0);
            const a = Math.random() * Math.PI * 2;
            const k = 0.5 + Math.random() * 0.5;
            this.aimErr = { x: Math.cos(a) * e * k, y: Math.sin(a) * e * k };
          }
          this.aiTarget.set(l.x + this.aimErr.x, l.y + this.aimErr.y);
        } else if (this.model.n >= 3 && this.aiGuess) {
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
    const heat = flying ? (this.turbo ? 1 : clamp((this.speed - S0) / (S_MAX - S0), 0, 1)) : 0;
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
      const want = this.giant[side] > 0 ? 1.5 : 1;
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
      pad.scale.setScalar((1 + u.flash * 0.12) * (pad === this.player ? this.padK.player : this.padK.ai));
      u.tick(this.time, 1 + u.flash * 1.5);
      u.glow.material.opacity = 0.3 + u.flash * 0.5;
    }

    // Tunnel energy, end-frame flash after a point, effects.
    for (const e of this.tunnel.edges) e.userData.tick(dt, (flying ? this.speed : 0.3) + this.storm.env * 3);
    // Blender frame: light seams flash on every hit.
    this.neonKick = Math.max(0, this.neonKick - dt * 2.5);
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

    // The AI's guess on the far plane and a beam from its brain.
    const guessing = flying && b.vz < 0 && this.aiGuess && this.model?.n >= 3;
    const target = guessing ? 0.35 + 0.65 * (this.aiConf ?? 0) : 0;
    this.guess.material.opacity += (target - this.guess.material.opacity) * Math.min(1, dt * 8);
    if (guessing) this.guess.position.set(this.aiGuess.x, this.aiGuess.y, ZA - 0.01);
    this.guess.scale.setScalar(1 + Math.sin(this.time * 8) * 0.05);
    const pos = this.beam.geometry.attributes.position;
    pos.setXYZ(0, this.brain.position.x, this.brain.position.y - 0.05, this.brain.position.z);
    pos.setXYZ(1, this.guess.position.x, this.guess.position.y, this.guess.position.z);
    pos.needsUpdate = true;
    this.beam.material.opacity = this.guess.material.opacity * 0.7;
    this.toastTick?.(dt);
  }

  /** Short message in front of the scoreboard ("Pattern spotted!"). */
  toast(text) {
    this.toastPanel?.removeFromParent();
    const holder = this.add(new THREE.Group());
    holder.position.copy(this.boardHolder.position).add(new THREE.Vector3(0, 0, 0.03));
    holder.scale.setScalar(1.35);
    const p = new Panel(0.86, 0.1, (ctx, c) => {
      c.surface({ stroke: color('xr-pong-predict') });
      ctx.fillStyle = color('xr-panel-text');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = font('black', c.m(num('xr-text-md')));
      ctx.fillText(text, c.canvas.width / 2, c.canvas.height / 2);
    });
    holder.add(p);
    this.toastPanel = holder;
    this.popIn(p);
    sfx.build();
    let life = 2.4;
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
    super.dispose();
  }
}
