// "AI Arena": a fighting game on a holographic platform in your room, in two modes.
// Real time (main mode): the robot announces every move for a moment (wind-up, the move with its
// name over its head, a shrinking ring) and you answer in time; good timing is "perfect". A
// stopped attack leaves the robot open for a moment: hit back (the counter). Now and then it
// covers up instead (block or duck, shown the same way), and the right attack breaks that. The AI
// learns how you answer each of its announcements and, from the second robot on, feints: it
// shows one attack and throws another that your habit does not stop. In the headset you can
// punch with your hand, raise both hands to block and really duck. Tactics: program three moves
// with buttons, then both fighters act at the same time; the AI learns which moves you tend to
// choose (per position and after which move) and counters them.
// In the browser (Nov 2026) the arena is a game of its own: the fighters fill the screen, the
// moves are big buttons under the table (mouse) and keys under one hand (arrows or WASD, Space,
// Enter), on phones thumb buttons; a coach names the answer the first times, every hit says why
// it landed, and a cheat sheet shows what stops what. Relaxed mode (assist.js): longer
// announcements, weaker robots, the coach always helps. Calm motion: no flashes, fewer sparks.
// Moves: punch and kick beat a throw, block stops punch and kick, ducking dodges punch and throw
// (but a kick hits low), throw breaks a block. Every fighter has a special move of its own (full
// energy), each stopped or weakened by other moves (SPECIALS).
import * as THREE from 'three';
import { BaseScene, layoutRow } from '../scene.js';
import { Panel, Button, textPanel, placeOnArc, roundRect } from '../ui3d.js';
import { color, hex, num, font } from '../tokens.js';
import { t } from '../i18n.js';
import { sfx } from '../sfx.js';
import { FIGHT_OPPONENTS } from '../content.js';
import { Fighter, POSES, makeArena, makeBeam, makeNumber, makeLabel } from '../fight-visuals.js';
import { Shockwaves, makeDust } from '../pong-visuals.js';
import { RibbonTrail } from '../pong-shaders.js';
import { makeEnvironment } from '../robot-visuals.js';
import { Announcer } from '../pong-announcer.js';
import { music } from '../music.js';
import { drawIcon } from '../icons.js';
import { ARRoom } from '../ar-room.js';
import { EchoFighter } from '../echo-fighter.js';
import { holoUniforms, holoize, tickHolo } from '../holo.js';
import { EVENT, EVENT_ROUNDS } from '../event.js';
import { WINTER, makeSnowfall, makeSnowCover, winterizeTree, setSnowAmount, snowSettled } from '../snow.js';
import { CHRISTMAS } from '../christmas.js';
import { santaColors, grumpyHat } from '../xmas-fighters.js';
import { sceneLook, bloom, gfxTier } from '../gfx.js';
import { assist } from '../assist.js';
import '../fight-text.js';

const MOVES = ['punch', 'kick', 'block', 'duck', 'throw', 'special'];
const ICON = { punch: 'punch', kick: 'kick', block: 'block', duck: 'duck', throw: 'throw', special: 'special' };
// The AI's answer to a move it expects (the player's special: see SPECIALS[kind].counter).
const COUNTER = { punch: 'duck', kick: 'block', block: 'throw', duck: 'kick', throw: 'punch' };
// Real-time mode: how long the robot announces its move (per stage) and the attacks it can show.
const TELL = [1.25, 1.05, 0.9];
const ATTACKS = ['punch', 'kick', 'throw'];
// The keys: the four main moves on the arrows or WASD (back = block, down = duck, forward =
// punch, up = kick), the throw on Space, the special on Enter or E; 1 to 6 as before.
const KEYS = {
  1: 'punch', 2: 'kick', 3: 'block', 4: 'duck', 5: 'throw', 6: 'special',
  ArrowLeft: 'block', a: 'block', ArrowDown: 'duck', s: 'duck', ArrowRight: 'punch', d: 'punch', ArrowUp: 'kick', w: 'kick',
  ' ': 'throw', Enter: 'special', e: 'special',
};
const KEYCAP = { block: '←', duck: '↓', punch: '→', kick: '↑' }; // throw and special: translated key names
const DESK_ORDER = ['block', 'duck', 'punch', 'kick', 'throw', 'special']; // the browser's button row
// The coach's simplest answer to what the robot shows (the cheat sheet lists all of them).
const BEST = { punch: 'block', kick: 'block', throw: 'punch', block: 'throw', duck: 'kick', counter: 'punch' };
const COACH_TIMES = 2; // how often the coach names the answer to each announcement (relaxed: always)
// The first robot opens the same way every time, so the first exchange teaches the game: a slow
// punch (block it, then counter), a kick, then it covers up (a throw breaks a block).
const OPENING = ['punch', 'kick', 'block'];
// The counter after a stopped attack: seconds the robot is open, damage and energy per move.
const COUNTER_TIME = 1.0;
const COUNTER_DMG = { punch: 7, kick: 10, throw: 9 };
const COUNTER_ENERGY = { punch: 18, kick: 8, throw: 12 };
const RANKS = [0, 900, 2400]; // points for the ratings fightRank1 to fightRank3
const MAX_SCORE = 5000; // the leaderboard's limit
// Real time: the robots' hits count a little less than in tactics (more exchanges, and a counter
// after every stopped attack), and much less in relaxed mode.
const LIVE_DMG = 0.8;
const EASY_DMG = 0.6;
const MODE_KEY = 'kiar.fightMode';
// Special moves: damage, the moves that stop it (no damage) or weaken it (damage given), the
// AI's best answer, its look (fx) and its icon. Special against special: both take 20.
//   beam      Nova (and Santa outside Christmas): block weakens it
//   sonar     Echo: only a punch (or a special) stops it, the punch even lands
//   Santa (Christmas) has three of his own, taking turns with every use (SANTA_SPECIALS):
//   snowball  a volley of snowballs: ducking dodges it, block weakens it
//   gift      a present that explodes: a kick sends it back (and hits Santa), block weakens it
//   stardust  golden star dust: block weakens it, nothing else helps
//   shock     VOLT-7: only block stops it
//   boulder   GRANIT: ducking dodges it, block weakens it
//   laser     OMEGA: block weakens it, nothing else helps
const SPECIALS = {
  beam: { dmg: 32, weak: { block: 8 }, counter: 'block', fx: 'beam', icon: 'special' },
  sonar: { dmg: 30, stop: ['punch'], counter: 'punch', fx: 'rings', icon: 'sonar' },
  snowball: { dmg: 30, stop: ['duck'], weak: { block: 8 }, counter: 'duck', fx: 'snow', icon: 'snowball' },
  gift: { dmg: 32, stop: ['kick'], weak: { block: 10 }, counter: 'kick', fx: 'gift', icon: 'gift', token: 'xr-xmas-red' },
  stardust: { dmg: 30, weak: { block: 10 }, counter: 'block', fx: 'beam', icon: 'stardust', token: 'xr-xmas-gold' },
  shock: { dmg: 28, stop: ['block'], counter: 'block', fx: 'beam', icon: 'special' },
  boulder: { dmg: 32, stop: ['duck'], weak: { block: 10 }, counter: 'duck', fx: 'rock', icon: 'rock' },
  laser: { dmg: 36, weak: { block: 12 }, counter: 'block', fx: 'beam', icon: 'laser' },
};
const SANTA_SPECIALS = ['snowball', 'gift', 'stardust'];
/** The icon of a move (a special shows the fighter's own). */
const iconFor = (m, kind) => (m === 'special' ? SPECIALS[kind]?.icon ?? 'special' : ICON[m]);
const SLOTS = 3;
const STAGES = EVENT ? EVENT_ROUNDS.fightOpponents : FIGHT_OPPONENTS.length; // event mode: one opponent
const ARENA_R = 0.6;
const ARENA_Z = -1.25;
const ARENA_DROP = 0.72; // platform below eye height (table height in the room)
const GAP = 0.33; // fighters stand at x = -GAP and +GAP
const HUD_UP = 1.24; // scoreboard height above the platform (above the robot's announcement)
const BEAT = 1.45; // seconds per move
const IMPACT = 0.52; // when hits land within a beat
const THROW_SLAM = 0.56; // after a landed throw: when the thrown fighter hits the floor
const PLAYER_HP = 100;

/**
 * Damage the move `a` (special kind ka) deals to a fighter doing `b` (special kind kb); both act
 * at the same time.
 */
function damage(a, b, ka, kb) {
  switch (a) {
    // idle: no move chosen in time (real-time mode), nothing stops the attack
    case 'punch': return { block: 0, duck: 0, throw: 12, special: kb === 'sonar' ? 9 : 0, punch: 9, kick: 9, idle: 9 }[b];
    case 'kick': return { block: 0, duck: 15, throw: 15, special: kb === 'gift' ? 12 : 0, punch: 13, kick: 13, idle: 13 }[b];
    case 'throw': return b === 'block' || b === 'idle' ? 16 : 0;
    case 'special': {
      const s = SPECIALS[ka] ?? SPECIALS.beam;
      if (b === 'special') return 20;
      if (s.stop?.includes(b)) return 0;
      return s.weak?.[b] ?? s.dmg;
    }
    default: return 0;
  }
}

// ---------- the AI's memory of your moves ----------

class MoveModel {
  constructor() {
    this.byPrev = Array.from({ length: MOVES.length + 1 }, () => new Float32Array(MOVES.length));
    this.bySlot = Array.from({ length: SLOTS }, () => new Float32Array(MOVES.length));
    this.global = new Float32Array(MOVES.length);
  }

  dist(prev, slot) {
    const parts = [[this.global, 1], [this.bySlot[slot], 1.4], [this.byPrev[prev + 1], 1.6]];
    const p = new Float32Array(MOVES.length);
    let wsum = 0;
    for (const [c, k] of parts) {
      const n = c.reduce((a, b) => a + b, 0);
      if (n < 0.5) continue;
      const w = (k * Math.min(n, 5)) / 5;
      for (let i = 0; i < MOVES.length; i++) p[i] += (w * (c[i] + 0.1)) / (n + 0.1 * MOVES.length);
      wsum += w;
    }
    if (!wsum) return p.fill(1 / MOVES.length);
    for (let i = 0; i < MOVES.length; i++) p[i] /= wsum;
    return p;
  }

  learn(prev, slot, move) {
    const i = MOVES.indexOf(move);
    const fade = (c) => { for (let k = 0; k < c.length; k++) c[k] *= 0.9; };
    for (const c of [this.global, this.bySlot[slot], this.byPrev[prev + 1]]) { fade(c); c[i] += 1; }
  }
}

// ---------- small UI pieces ----------

function wrapText(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const w of text.split(/\s+/)) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width <= maxWidth || !line) line = test;
    else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  return lines;
}

function iconTile(w, h, draw) {
  const st = { hover: false, disabled: false, focus: false, hint: false };
  const p = new Panel(w, h, (ctx, c) => {
    draw(ctx, c, st);
    // Keyboard focus (engine.js): a clear ring in the focus color.
    if (st.focus) {
      const sw = c.m(num('xr-border-width') * 3);
      roundRect(ctx, sw / 2, sw / 2, c.canvas.width - sw, c.canvas.height - sw, c.m(num('xr-radius')));
      ctx.lineWidth = sw;
      ctx.strokeStyle = color('xr-focus');
      ctx.stroke();
    }
  });
  p.userData.interactive = true;
  p.userData.setHover = (v) => { st.hover = v; p.scale.setScalar(v && !st.disabled ? num('xr-hover-scale') : 1); p.redraw(); };
  p.userData.setFocus = (v) => { st.focus = v; p.redraw(); };
  p.userData.setDisabled = (v) => { if (st.disabled !== v) { st.disabled = v; p.redraw(); } };
  p.userData.isDisabled = () => st.disabled;
  // The coach's hint: this move is a good answer right now (drawn by the tile's draw function).
  p.userData.setHint = (v) => { if (st.hint !== v) { st.hint = v; p.redraw(); } };
  return p;
}

export class FightScene extends BaseScene {
  constructor(app) {
    super(app);
    this.prepareMusic('fight'); // buffer the track during the intro
    this.time = 0;
    this.gt = 0; // game time (slowed down for hit-stop and K.O.)
    this.timeScale = 1;
    this.events = [];
    this.mode = 'intro';
    this.queue = [];
    // The browser view (desktop and phones) has its own layout and controls; desk: mouse and keys.
    this.flat = !this.engine.isXR;
    this.desk = this.flat && !this.engine.touchUI;
    this.easy = assist.easy; // relaxed mode, read once per visit to the arena
    this.calm = assist.reducedMotion; // calm motion: no flashes, fewer sparks
    this.resetRun();
    this.announcer = new Announcer(this);
    this.announcer.calm = this.calm;
    // Browser: the big callouts appear in front of the table's edge, so they never cover the
    // fighters, the robot's announcement or the scoreboard.
    if (this.flat) {
      this.announcer.place = (g, k) => {
        g.position.set(0, this.eye - ARENA_DROP + 0.1, ARENA_Z + 0.58);
        g.scale.setScalar(k * 0.6);
      };
    }
    try { this.liveMode = localStorage.getItem(MODE_KEY) !== 'tactic'; } catch { this.liveMode = true; }
    this.onKey = (e) => this.key(e);
    window.addEventListener('keydown', this.onKey);
    this.buildArena();
    // Phones: the status bar with the menu button (pause) at the top of the screen.
    if (this.engine.touchUI) this.refreshBar = this.hud(() => this.barText());
    // AR: room scan, light pool, shock waves over the real floor and light tiles under your feet.
    this.room = new ARRoom(this, { scan: 'xr-fight-rim', grid: 'xr-fight-player', tileEdge: 'xr-fight-rim', tileLit: 'xr-fight-player' });
    this.room.onStep = () => sfx.step();
    this.onUpdate((dt) => this.update(dt));
    this.showIntro();
  }

  /** A fresh run: the robots know nothing about you yet. */
  resetRun() {
    this.model = new MoveModel();
    this.lastPlayerMove = -1;
    this.lastTurn = null;
    this.predLog = [];
    this.moveCount = Object.fromEntries(MOVES.map((m) => [m, 0]));
    this.resp = {}; // the AI's memory: how you answer what it shows (kept over all robots)
    this.feints = 0;
    this.perfects = 0;
    this.santaNext = 0;
    this.seenTell = {}; // how often each announcement came (the coach helps the first times)
    // What went wrong how often (the tip on the result screen) and how the counters went.
    this.stats = { late: 0, feint: 0, pair: 0, chances: 0, counters: 0 };
    this.ex = null;
    this.cw = null;
  }

  /** Status line of the phone's top bar. */
  barText() {
    if (!this.opp || this.mode === 'intro') return t('fightName');
    return t('fightBarText', { name: t('fightName'), stage: t('fightStage', { n: this.stage + 1, total: STAGES }), score: this.totalScore ?? 0 });
  }

  /** Scoreboard and status bar show the new numbers. */
  redrawBoard() {
    this.board.redraw();
    this.refreshBar?.();
  }

  /** Keyboard (browser). Real time: the moves; tactics: 1 to 6, Backspace, Enter. */
  key(e) {
    if (e.repeat || e.altKey || e.ctrlKey || e.metaKey || this.engine.isXR || this.engine.paused || this.disposed) return;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const go = k === 'Enter' || k === ' ';
    if (this.mode === 'live') {
      const m = KEYS[k];
      if (!m) return;
      e.preventDefault();
      this.pressFx(m);
      this.liveMove(m);
    } else if (this.mode === 'program') {
      if (k >= '1' && k <= '6') { e.preventDefault(); this.addMove(MOVES[Number(k) - 1]); } else if (k === 'Backspace') { e.preventDefault(); this.removeMove(this.queue.length - 1); } else if (k === 'Enter') { e.preventDefault(); this.execute(); }
    } else if (this.mode === 'intro' && go) {
      e.preventDefault();
      sfx.click();
      this.startLadder();
    } else if (this.mode === 'between' && go) {
      e.preventDefault();
      sfx.click();
      this.nextOpponent();
    }
  }

  /** The button of a move gives way for a moment when its key is pressed. */
  pressFx(m) {
    const b = this.moveButtons?.[MOVES.indexOf(m)];
    if (!b?.parent || !this.console?.visible || b.userData.isDisabled()) return;
    this.tween(0.16, (k) => b.scale.setScalar(0.9 + 0.1 * k));
  }

  /** Particle bursts are smaller with calm motion. */
  burst(worldPos, tokenName, count = 22) {
    super.burst(worldPos, tokenName, this.calm ? Math.ceil(count * 0.35) : count);
  }

  // ---------- arena ----------

  buildArena() {
    const stage = (this.stage3d = new THREE.Group());
    stage.position.set(0, this.eye - ARENA_DROP, ARENA_Z);
    this.group.add(stage);
    this.arena = makeArena(ARENA_R, 'xr-fight-player', FIGHT_OPPONENTS[0].token);
    stage.add(this.arena);
    // Browser: the view frames the fighters on the table top. The round table's own bounding box
    // would push the camera far back (its front corners are empty air, and its foot reaches down
    // to the floor), so two unseen stand-ins give the frame: the ring's width at the fighters'
    // depth, and the front edge of the table.
    if (this.flat) {
      this.arena.userData.noFit = true;
      const unseen = new THREE.MeshBasicMaterial({ visible: false });
      const ring = new THREE.Mesh(new THREE.PlaneGeometry(ARENA_R * 2.38, 0.74), unseen);
      ring.position.set(0, 0.3, 0);
      const lip = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.04), unseen);
      lip.position.set(0, -0.06, ARENA_R * 1.13);
      stage.add(ring, lip);
      this.fitLip = lip;
    }
    // Calm motion: the table does not flash.
    if (this.calm) this.arena.userData.flash = () => {};
    this.shock = new Shockwaves(stage, 16);
    this.dust = makeDust(1.9, 1.6, 1.1, 140, 'xr-fight-rim');
    stage.add(this.dust);
    // Winter: snow falls in the room (in AR over the real room), lands on the table and the
    // floor and settles; the metal rim of the table gets snow too.
    if (WINTER) {
      this.snow = makeSnowfall({ density: 0.75 });
      this.cover = makeSnowCover({ x: 0, z: -0.65 });
      this.group.add(this.snow.points, this.cover.mesh);
      winterizeTree(this.arena, ['ArenaPedestal']);
    }

    this.playerKind = 'nova';
    this.holoP = holoUniforms('xr-fight-holo');
    this.holoA = holoUniforms('xr-fight-holo');
    this.holoP.calm = this.holoA.calm = this.calm; // calm motion: the holograms do not flicker
    this.makePlayer('nova');

    // Colored rim lights over each fighter
    this.lightP = new THREE.PointLight(hex('xr-fight-player'), 0.9, 1.4, 2);
    this.lightP.position.set(-0.35, 0.55, 0.25);
    this.lightA = new THREE.PointLight(hex(FIGHT_OPPONENTS[0].token), 0.9, 1.4, 2);
    this.lightA.position.set(0.35, 0.55, 0.25);
    stage.add(this.lightP, this.lightA);

    this.beam = makeBeam('xr-fight-player');
    stage.add(this.beam, this.beam.userData.orb);
    this.trails = [new RibbonTrail(stage, 18, 0.015), new RibbonTrail(stage, 18, 0.015)];
    this.numbers = [];

    // Block shield (hexagon disc) per fighter
    this.shields = [-1, 1].map((sx) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.16, 6), new THREE.MeshBasicMaterial({ color: hex('xr-fight-block'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.y = Math.PI / 2;
      m.position.set(sx * (GAP - 0.11), 0.44, 0);
      stage.add(m);
      return m;
    });

    // Scoreboard with health and energy bars above the arena
    this.board = new Panel(1.24, 0.21, (ctx, c) => this.drawBoard(ctx, c));
    this.board.position.set(0, this.eye - ARENA_DROP + HUD_UP, ARENA_Z - 0.25);
    this.board.visible = false; // from the first fight on
    if (this.desk) this.board.scale.setScalar(1.2); // desktop: larger, there is room above the fighters
    this.group.add(this.board);
    // Desktop and headset: a menu button beside it (the browser pauses, the headset leaves);
    // phones have it in their status bar.
    if (!this.engine.touchUI) {
      this.menuBtn = new Button(0.2, 0.09, { label: t('menu'), labelSize: 'xr-text-sm', grow: false, onClick: () => this.menuOrPause() });
      this.menuBtn.position.set(0.62 * this.board.scale.x + 0.13, this.board.position.y + 0.06, ARENA_Z - 0.25);
      this.group.add(this.menuBtn);
    }

    // Look: the arena's own cool environment for the metal, neutral tone mapping (keeps the
    // token colors) and, on the desktop, a soft bloom on the neon lines, lights and beams.
    this.envTarget = makeEnvironment(this.engine.renderer);
    this.onSceneDispose(sceneLook(this.engine, { tone: 'neutral', exposure: 1.05, env: this.envTarget.texture, envIntensity: 1.1, shadows: false }));
    if (gfxTier() === 'high' && !this.engine.isXR && !this.engine.touchUI) {
      this.onSceneDispose(bloom(this.engine, { strength: 0.32, radius: 0.35, threshold: 0.9 }));
    }
  }

  /** Hologram projection: the figure grows up from the table with a flicker. */
  projectIn(root, delay) {
    root.visible = false;
    this.schedule(delay, () => {
      root.visible = true;
      root.scale.set(1, 0.01, 1);
      sfx.appear();
      this.tween(0.55, (k) => {
        // Calm motion: it grows without the flicker.
        if (this.calm) { root.scale.set(1, Math.max(0.01, k), 1); return; }
        root.scale.set(1 + (1 - k) * 0.15 * Math.sin(k * 40), Math.max(0.01, k), 1);
        root.visible = k > 0.95 || Math.sin(k * 60) > -0.6;
      }, { onDone: () => { root.scale.set(1, 1, 1); root.visible = true; } });
    });
  }

  /** Calm motion: a fighter's hit flash stays a soft glow. */
  calmFlash(f) {
    if (!this.calm) return;
    const flash = f.flash.bind(f);
    f.flash = (k = 1) => flash(k * 0.3);
  }

  /** The player's special move: Echo's sonar, Santa's next one (Christmas) or Nova's beam. */
  get kindP() {
    if (this.playerKind === 'echo') return 'sonar';
    return CHRISTMAS ? SANTA_SPECIALS[(this.santaNext ?? 0) % SANTA_SPECIALS.length] : 'beam';
  }

  /** The opponent's special move (one per robot). */
  get kindA() {
    return this.opp?.specialMove ?? 'beam';
  }

  /** Name of the player's fighter on the scoreboard. */
  get playerName() {
    return this.playerKind === 'echo' ? 'ECHO' : CHRISTMAS ? t('fightSantaHud') : 'NOVA';
  }

  /** The player's figure: Nova (human; Santa at Christmas) or Echo (the mascot), as a hologram. */
  makePlayer(kind) {
    if (this.player) { this.player.disposed = true; this.player.root.removeFromParent(); }
    this.playerKind = kind;
    this.player = kind === 'echo'
      ? new EchoFighter({ token: 'xr-fight-player', facing: 1 })
      : new Fighter({ style: CHRISTMAS ? 'santa' : 'hero', token: 'xr-fight-player', facing: 1 });
    this.calmFlash(this.player);
    this.player.root.position.x = -GAP;
    this.stage3d.add(this.player.root);
    holoize(this.player.root, this.holoP);
    // Christmas: the comic Santa model gets its token colors before it becomes a hologram.
    this.player.onModel = (model) => {
      if (CHRISTMAS && kind !== 'echo') santaColors(model);
      holoize(this.player.root, this.holoP);
    };
    // While the player is Echo, the flying mascot stays away (no second Echo in the room).
    this.app.echo?.suppress(kind === 'echo');
    if (this.board?.isMesh) this.board.redraw(); // the HUD panel exists once the arena is built
  }

  setOpponent(i) {
    this.stage = i;
    this.opp = FIGHT_OPPONENTS[i];
    if (this.ai) this.ai.root.removeFromParent();
    this.ai = new Fighter({ style: this.opp.style, token: this.opp.token, facing: -1 });
    this.calmFlash(this.ai);
    if (CHRISTMAS) grumpyHat(this.ai); // the robots wear grumpy green hats
    this.ai.root.position.x = GAP;
    this.stage3d.add(this.ai.root);
    holoize(this.ai.root, this.holoA);
    this.ai.onModel = () => holoize(this.ai.root, this.holoA); // e.g. when the gloves arrive
    this.lightA.color.setHex(hex(this.opp.token));
    this.arena.userData.uniforms.uRight.value.setHex(hex(this.opp.token));
    this.arena.userData.setLightSide(1, this.opp.token);
    this.hp = { p: PLAYER_HP, a: this.opp.hp };
    this.energy = { p: 0, a: 0 };
    this.player.ko = false;
    this.player.won = false;
    this.player.thrownKO = false;
    this.player.play([]);
    this.round = 1;
    this.redrawBoard();
  }

  // ---------- flow ----------

  /** The controls of the chosen mode, per device (intro and pause dialog). */
  applyControls() {
    if (this.liveMode) {
      this.setControls({
        desktop: [[t('fightKeysDefend'), t('fightActDefend')], [t('fightKeysAttack'), t('fightActAttack')], [t('fightKeysMore'), t('fightActMore')], [t('fightKeysMouse'), t('fightActMouse')]],
        touch: [[t('fightTouchDefend'), t('fightActTouchDefend')], [t('fightTouchAttack'), t('fightActTouchAttack')], [t('fightTouchSpecial'), t('fightActTouchSpecial')]],
        xr: [[t('fightXrPunch'), t('fightMove_punch')], [t('fightXrBlock'), t('fightMove_block')], [t('fightXrDuck'), t('fightMove_duck')], [t('fightXrButtons'), t('fightActXrButtons')]],
      });
    } else {
      this.setControls({
        desktop: [[t('fightKeysTactic'), t('fightActTactic')], [t('fightKeysTacticDel'), t('fightActTacticDel')], [t('fightKeysTacticGo'), t('fightActTacticGo')], [t('fightKeysMouse'), t('fightActTacticAll')]],
        touch: [[t('fightTouchTactic'), t('fightActTacticAll')]],
        xr: [[t('fightXrTactic'), t('fightActTacticAll')]],
      });
    }
  }

  /**
   * Browser: the intro and the result are shown larger (the play area keeps its size). The layer
   * is scaled around a point at the top of the UI plane.
   */
  zoom(k, top = 0.5) {
    const pivot = new THREE.Vector3(0, this.eye + top, -this.dist);
    this.layer.scale.setScalar(k);
    this.layer.position.copy(pivot).multiplyScalar(1 - k);
  }

  showIntro(focusMode = null) {
    this.clearLayer();
    this.mode = 'intro';
    // Phones held sideways: the camera cannot come closer, so the panels grow instead.
    const portrait = this.flat && window.innerWidth < window.innerHeight;
    this.zoom(!this.flat ? 1 : this.desk ? 1.3 : portrait ? 1.15 : 1.45, 0.55);
    this.applyControls();
    this.board.visible = false;
    // The table is empty until the fight starts; then the figures are projected in.
    this.player.root.visible = false;
    if (this.ai) this.ai.root.visible = false;
    const { eye, dist } = this;
    // Two short sentences and the controls of this device; the rest is taught in the fight.
    const p = this.add(textPanel(1.15, 0.3, [
      { text: t('fightName'), size: 'xr-text-title', weight: 'black', gap: 0.02 },
      { text: t(this.liveMode ? 'fightIntroShort' : 'fightIntroTactic'), size: 'xr-text-md', color: color('xr-panel-muted'), gap: 0.03 },
      ...this.controlsBlocks(),
    ], { layout: { align: 'left' } }));
    p.position.set(0, eye + 0.55 - p.h / 2, -dist);
    this.popIn(p);
    this.app.host?.introduce(this, 'fight', p);
    // The mode: real time (react to the robot's attacks) or tactics (program three moves).
    const modeY = p.position.y - p.h / 2 - 0.06;
    const modes = [['live', 'fightModeLive', 'fightModeLiveText'], ['tactic', 'fightModeTactic', 'fightModeTacticText']].map(([key, label, text], i) => {
      const tile = iconTile(0.52, 0.1, (ctx, c, s) => {
        const on = (key === 'live') === this.liveMode;
        c.surface({ fill: color(on ? 'xr-button-hover' : 'xr-button-bg'), stroke: color(on ? 'xr-accent' : 'xr-panel-border'), strokeWidth: num('xr-border-width') * (on ? 2 : 1), stripe: false });
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = color(on ? 'xr-accent' : 'xr-button-text');
        ctx.font = font('black', c.m(num('xr-text-md')));
        ctx.fillText(t(label), c.m(0.025), c.canvas.height * 0.33, c.canvas.width - c.m(0.05));
        ctx.fillStyle = color('xr-panel-muted');
        ctx.font = font('regular', c.m(num('xr-text-min')));
        ctx.fillText(t(text), c.m(0.025), c.canvas.height * 0.72, c.canvas.width - c.m(0.05));
      });
      tile.userData.label = t(label);
      tile.userData.onClick = () => {
        sfx.click();
        if ((key === 'live') === this.liveMode) return;
        this.liveMode = key === 'live';
        try { localStorage.setItem(MODE_KEY, key); } catch { /* private mode */ }
        // The intro shows the other mode's sentence and controls (the keyboard focus stays).
        this.showIntro(this.engine.focus === tile ? key : null);
      };
      tile.position.set((i - 0.5) * 0.55, modeY - 0.05, -dist);
      this.add(tile);
      this.popIn(tile, 0.06 + i * 0.04);
      if (focusMode === key) this.engine.setFocus(tile);
      return tile;
    });
    // Choose the fighter: Nova (human) or Echo (the mascot).
    const choice = (kind, icon, label, x, delay) => {
      const go = iconTile(0.52, 0.12, (ctx, c, s) => {
        c.surface({ fill: color(s.hover ? 'xr-primary-hover' : 'xr-primary'), stroke: color('xr-primary-hover'), stripe: false });
        drawIcon(ctx, icon, c.m(0.06), c.canvas.height / 2, c.m(0.06), color('xr-on-primary'));
        ctx.fillStyle = color('xr-on-primary');
        ctx.textBaseline = 'middle';
        const room = c.canvas.width - c.m(0.13);
        const md = c.m(num('xr-text-md'));
        const fits = (text, px) => { ctx.font = font('black', px); return ctx.measureText(text).width <= room; };
        // One line, from large down to medium letters; else two lines ("Als Weihnachtsmann /
        // kämpfen"), split where the longer line is shortest.
        let px = c.m(num('xr-text-lg'));
        while (px > md && !fits(label, px)) px -= 2;
        if (fits(label, px)) {
          ctx.fillText(label, c.m(0.11), c.canvas.height / 2);
        } else {
          const words = label.split(' ');
          ctx.font = font('black', md);
          let best = 1;
          let bestW = Infinity;
          for (let k = 1; k < words.length; k++) {
            const w = Math.max(ctx.measureText(words.slice(0, k).join(' ')).width, ctx.measureText(words.slice(k).join(' ')).width);
            if (w < bestW) { bestW = w; best = k; }
          }
          const lines = [words.slice(0, best).join(' '), words.slice(best).join(' ')];
          px = md;
          while (px > 10 && !lines.every((l) => fits(l, px))) px -= 2;
          ctx.font = font('black', px);
          ctx.fillText(lines[0], c.m(0.11), c.canvas.height / 2 - px * 0.58);
          ctx.fillText(lines[1], c.m(0.11), c.canvas.height / 2 + px * 0.58);
        }
      });
      go.userData.label = label;
      go.userData.onClick = () => {
        sfx.click();
        if (kind !== this.playerKind) this.makePlayer(kind);
        this.startLadder();
      };
      go.position.set(x, modeY - 0.1 - 0.04 - 0.06, -dist);
      this.add(go);
      this.popIn(go, delay);
    };
    choice('nova', 'fight', t(CHRISTMAS ? 'fightAsSanta' : 'fightAsNova'), -0.275, 0.1);
    choice('echo', 'bat', t('fightAsEcho'), 0.275, 0.16);
  }

  startLadder() {
    this.totalScore = 0;
    this.wins = 0;
    this.startMusic(1, 'fight');
    this.startOpponent(0);
  }

  /** "Again": straight into the next run with the same fighter and mode. */
  again() {
    this.clearLayer();
    this.resetRun();
    this.startLadder();
  }

  startOpponent(i) {
    this.setOpponent(i);
    this.projectIn(this.ai.root, 0.2);
    if (!this.player.root.visible) this.projectIn(this.player.root, 0);
    this.board.visible = true;
    this.ex = null;
    this.cw = null;
    this.clearLayer();
    this.zoom(1);
    this.mode = 'intro-fight';
    this.redrawBoard();
    this.announcer.say('fightCallStart', { name: this.opp.name }, this.opp.token, { priority: true });
    sfx.build();
    this.room.scan(this.stage3d.getWorldPosition(new THREE.Vector3()));
    this.room.tilesOn = true;
    sfx.scan();
    this.schedule(1.6, () => (this.liveMode ? this.livePhase() : this.programPhase()));
  }

  /** You pick three moves on the console; the AI thoughts panel shows what it learned. */
  programPhase() {
    this.mode = 'program';
    this.queue = [];
    this.clearLayer();
    this.cheat = null;
    this.buildConsole();
    this.buildInsights();
    this.placePanels();
  }

  // ---------- real-time mode ----------

  livePhase() {
    this.mode = 'live';
    this.clearLayer();
    this.buildConsole(true);
    this.buildInsights();
    this.buildCheat();
    this.placePanels();
    this.ex = null;
    this.cw = null;
    this.combo = 0;
    this.exCount = 0; // announcements of this robot so far
    this.lastGuard = true; // it never opens a fight covered up
    // Phones: big buttons for the thumbs instead of the small 3D ones.
    if (this.engine.touchUI) {
      this.console.visible = false;
      // Attacks in one group (left thumb), defence and the special in the other (right thumb).
      const group = { punch: 'left', kick: 'left', throw: 'left', block: 'right', duck: 'right', special: 'right' };
      const order = ['punch', 'kick', 'throw', 'block', 'duck', 'special'];
      if (!this.livePad) {
        const before = new Set(document.querySelectorAll('.mtouch__btn'));
        this.livePad = this.touchButtons(order.map((m) => ({ icon: iconFor(m, this.kindP), label: this.moveLabel(m), onPress: () => this.liveMove(m), primary: m === 'punch', group: group[m] })), { grid: true });
        // The pad's own buttons, in the order given (for the coach's hint).
        this.livePadEls = [...document.querySelectorAll('.mtouch__btn')].filter((b) => !before.has(b));
      }
      this.livePadOrder = order;
      this.refreshConsole();
    }
    if (this.stage > 0) this.announcer.say('fightCallLive', {}, 'xr-fight-energy');
    this.schedule(this.stage > 0 ? 1.0 : 0.5, () => this.nextExchange());
  }

  /** How you answered the shown move so far: counts per answer (older answers fade). */
  respOf(shown) {
    return (this.resp[shown] ??= Object.fromEntries([...MOVES, 'idle'].map((m) => [m, 0])));
  }

  /** Your most likely answer to a shown move (null without enough data). */
  expected(shown) {
    const r = this.respOf(shown);
    let best = null;
    let n = 0;
    for (const [m, c] of Object.entries(r)) { n += c; if (!best || c > r[best]) best = m; }
    return n >= 1.5 ? best : null;
  }

  /**
   * The robot's next move. It covers up now and then (block or duck, shown like an attack; the
   * right attack breaks it), else it attacks with what your habits do not stop; from the second
   * robot on it may show one attack and throw another (a feint), and with full energy it fires
   * its special.
   */
  liveAI() {
    const opp = this.opp;
    const kp = this.kindP;
    const ka = this.kindA;
    // The first robot's opening is always the same: it teaches block, counter and the throw.
    if (this.stage === 0 && this.exCount < OPENING.length) { const am = OPENING[this.exCount]; return { am, show: am }; }
    const smart = Math.random() < opp.predict * (this.easy ? 0.6 : 1);
    if (this.energy.a >= 100 && Math.random() < opp.special) return { am: 'special', show: 'special' };
    // Covering up (never twice in a row): the guard your usual answer to it does not break.
    if (!this.lastGuard && Math.random() < 0.26) {
      let am = Math.random() < 0.5 ? 'block' : 'duck';
      if (smart) {
        const safe = ['block', 'duck'].filter((g) => { const r = this.expected(g); return r && r !== 'idle' && damage(r, g, kp, ka) === 0; });
        if (safe.length) am = safe[Math.floor(Math.random() * safe.length)];
      }
      return { am, show: am };
    }
    // Attack: the one your usual answer does not stop.
    const hurts = (a, r) => damage(a, r ?? 'idle', ka, kp) > 0;
    let am = ATTACKS[Math.floor(Math.random() * ATTACKS.length)];
    if (smart) {
      const good = ATTACKS.filter((a) => hurts(a, this.expected(a)));
      if (good.length) am = good[Math.floor(Math.random() * good.length)];
    }
    let show = am;
    // Feint (from the second robot on): show s, throw am, when your answer to s does not stop am.
    if (this.stage > 0 && Math.random() < (0.18 + 0.14 * this.stage) * (this.easy ? 0.5 : 1)) {
      const fakes = ATTACKS.filter((s2) => s2 !== am && this.expected(s2) && hurts(am, this.expected(s2)));
      if (fakes.length) show = fakes[Math.floor(Math.random() * fakes.length)];
    }
    return { am, show };
  }

  nextExchange() {
    if (this.mode !== 'live' || this.ex || this.cw) return;
    const { am, show } = this.liveAI();
    const guard = am === 'block' || am === 'duck';
    this.lastGuard = guard;
    // How long the announcement stands: shorter with every robot, longer in relaxed mode, and
    // the very first one of a run leaves time to look and read.
    let T = (TELL[this.stage] ?? 0.9) * (am === 'special' ? 1.25 : 1) * (guard ? 1.15 : 1) * (this.easy ? 1.6 : 1);
    if (this.stage === 0 && this.exCount < OPENING.length) T *= this.exCount === 0 ? 2.2 : 1.4;
    this.exCount += 1;
    const ex = { am, show, seen: show, T, t0: this.gt, end: this.gt + T, pm: null, at: 0, guard, predicted: this.expected(show) };
    // A feint: partway through, the real attack shows. Who reacts too early is fooled; who waits
    // for it has less time left (relaxed mode: it shows earlier).
    if (show !== am) ex.revealAt = this.gt + T * (this.easy ? 0.4 : 0.5);
    this.ex = ex;
    // The tell: the robot gets ready (or covers up) and its move appears over its head, with its
    // name and a ring that shrinks until it strikes.
    if (guard) this.ai.play([[am, T + 0.5, 12]]);
    else this.ai.play([[show === 'special' ? 'charge' : 'guard2', T, 9]]);
    this.showTell(show);
    this.coach(show);
    sfx.tick();
    this.insights?.redraw();
    this.cheat?.redraw();
    this.refreshConsole();
  }

  /** A feint turns into the real attack. */
  revealFeint(ex) {
    ex.revealed = true;
    ex.seen = ex.am;
    this.feints += 1;
    this.showTell(ex.am, true);
    this.ai.play([[ex.am === 'special' ? 'charge' : 'guard2', Math.max(0.1, ex.end - this.gt), 14]]);
    this.announcer.say('fightCallFeint', {}, this.opp.token);
    sfx.whoosh();
    if (!ex.pm) this.coach(ex.am);
    this.insights?.redraw();
    this.cheat?.redraw();
  }

  /** Your move in real time (button, key or gesture): one per announcement, or the counter. */
  liveMove(m) {
    if (this.mode !== 'live') return;
    if (this.cw) { this.counterHit(m); return; }
    const ex = this.ex;
    if (!ex || ex.pm) return;
    if (m === 'special' && this.energy.p < 100) { sfx.wrong(); return; }
    ex.pm = m;
    ex.at = (this.gt - ex.t0) / ex.T;
    ex.answered = ex.seen; // what you were reacting to
    this.moveCount[m] += 1;
    sfx.click();
    // No waiting once you have decided: the strike follows right away (a feint shows first).
    const now = this.gt;
    if (ex.revealAt && !ex.revealed) {
      ex.revealAt = Math.min(ex.revealAt, now + 0.12);
      ex.end = Math.min(ex.end, ex.revealAt + 0.33);
    } else ex.end = Math.min(ex.end, now + 0.3);
    // Defending shows at once (block up, duck down) and holds until the attack is over.
    if (m === 'block' || m === 'duck') this.player.play([[m, ex.end - now + 0.9, 16]]);
    this.hideCoach();
    this.refreshConsole();
  }

  resolveExchange() {
    const ex = this.ex;
    if (this.mode !== 'live' || !ex) return;
    this.ex = null;
    this.hideTell();
    this.hideCoach();
    const pm = ex.pm ?? 'idle';
    const kp = this.kindP;
    const ka = this.kindA;
    // The AI remembers how you answered what you saw (older answers fade).
    const r = this.respOf(ex.pm ? ex.answered : ex.show);
    for (const k of Object.keys(r)) r[k] *= 0.85;
    r[pm] += 1;
    this.predLog.push(ex.predicted && ex.predicted === pm ? 1 : 0);
    const toP = damage(ex.am, pm, ka, kp);
    const toA = damage(pm, ex.am, kp, ka);
    const stopped = !ex.guard && toP === 0 && pm !== 'special';
    // Perfect: stopped it late, after the moment a feint would have shown.
    const perfect = stopped && ex.at > 0.5;
    // A stopped attack (block or duck) leaves the robot open: your counter.
    const defended = stopped && (pm === 'block' || pm === 'duck');
    this.lastLive = { shown: ex.show, am: ex.am, pm, stopped };
    // Why a hit landed, in a few words over your fighter (and counted for the tip at the end).
    let why = null;
    if (toP > 0) {
      if (pm === 'idle') { why = t('fightWhyLate'); this.stats.late += 1; } else if (ex.revealed && ex.answered !== ex.am) { why = t('fightWhyFeint', { a: this.moveName(ex.am, ka) }); this.stats.feint += 1; } else if (ex.am === 'special') why = `${this.moveName('special', ka)}: ${t(`fightSpecialHow_${ka}`)}`;
      else if (toA > 0) why = t('fightWhyTrade');
      else { why = t('fightWhyBeats', { a: this.moveName(ex.am, ka), b: this.moveName(pm, kp) }); this.stats.pair += 1; }
    }
    this.beat(pm, ex.am, 1);
    this.schedule((pm === 'special' || ex.am === 'special' ? IMPACT + 0.12 : IMPACT) + 0.05, () => {
      if (this.mode !== 'live') return;
      const at = this.stage3d.worldToLocal(this.player.chestPos());
      if (why) this.popText(why, at.clone().add(new THREE.Vector3(0, 0.3, 0)), 'xr-panel-text', 1.7);
      // Your attack ran into its guard.
      if (ex.guard && pm !== 'idle' && toA === 0 && ex.am === 'block') this.popText(t('fightGuarded'), this.stage3d.worldToLocal(this.ai.chestPos()).add(new THREE.Vector3(0, 0.14, 0)), 'xr-fight-block');
      if (perfect) {
        this.perfects += 1;
        this.energy.p = Math.min(100, this.energy.p + 15);
        this.totalScore += 25;
        this.popText(t('fightPerfectPts', { p: 25 }), at.clone().add(new THREE.Vector3(0, 0.3, 0)), 'xr-fight-energy');
        sfx.powerup();
      }
      // Combos: hits in a row without being hit.
      if (toP > 0) this.combo = 0;
      else if (toA > 0) this.comboHit();
      this.redrawBoard();
    });
    if (defended) this.schedule(IMPACT + 0.22, () => this.openCounter(perfect));
    // Nothing happened (it covered up, you waited): straight on.
    else this.schedule(ex.guard && pm === 'idle' ? 0.35 : IMPACT + 0.9, () => this.nextExchange());
  }

  /** One more hit in a row: points, and from three on a callout. */
  comboHit() {
    this.combo += 1;
    this.totalScore += 5 * Math.min(this.combo, 8);
    if (this.combo >= 3) {
      const at = this.stage3d.worldToLocal(this.player.chestPos());
      this.popText(t('fightCombo', { n: this.combo }), at.add(new THREE.Vector3(0, 0.42, 0)), 'xr-fight-player');
    }
  }

  // ---------- the counter ----------

  /** After a stopped attack the robot staggers and is open for a moment: any attack lands. */
  openCounter(perfect) {
    if (this.mode !== 'live' || this.hp.a <= 0 || this.hp.p <= 0) return;
    // Longer the first times (you are still learning it) and in relaxed mode.
    const T = this.easy ? 2.0 : (this.seenTell.counter ?? 0) < COACH_TIMES ? 1.7 : COUNTER_TIME;
    this.cw = { t0: this.gt, T, end: this.gt + T, perfect };
    this.stats.chances += 1;
    this.ai.play([['stagger', T, 12]]);
    this.showTell('counter');
    this.coach('counter');
    sfx.tink();
    this.cheat?.redraw();
    this.refreshConsole();
  }

  /** The chance has passed. */
  closeCounter() {
    if (!this.cw) return;
    this.cw = null;
    this.hideTell();
    this.hideCoach();
    this.cheat?.redraw();
    this.refreshConsole();
    this.schedule(0.3, () => this.nextExchange());
  }

  /** Your counter: a quick punch (charges energy), a kick (hits hard), a throw, or the special. */
  counterHit(m) {
    const cw = this.cw;
    if (!cw || m === 'block' || m === 'duck') return;
    if (m === 'special' && this.energy.p < 100) { sfx.wrong(); return; }
    this.cw = null;
    this.hideTell();
    this.hideCoach();
    this.moveCount[m] += 1;
    this.stats.counters += 1;
    sfx.click();
    const kp = this.kindP;
    const taken = this.opp.taken ?? 1;
    if (m === 'special') {
      this.energy.p = 0;
      this.player.play(this.animFor('special'));
      this.announcer.say('fightCallSpecial', {}, 'xr-fight-energy');
      sfx.storm();
      this.schedule(IMPACT + 0.12, () => {
        if (this.mode !== 'live') return;
        this.specialFx(this.player, this.ai, kp, 'xr-fight-player');
        this.arena.userData.flash(1);
        // Santa's special attacks take turns: next time the next one.
        if (this.playerKind !== 'echo' && CHRISTMAS) this.santaNext = (this.santaNext ?? 0) + 1;
        this.landHit(Math.round(SPECIALS[kp].dmg * taken), m);
      });
      this.schedule(IMPACT + 1.25, () => this.nextExchange());
    } else {
      const quick = {
        punch: [['punchWind', 0.1, 22], ['punch', 0.28, 34], ['guard', 0.2, 10]],
        kick: [['kickWind', 0.12, 20], ['kick', 0.32, 30], ['guard', 0.2, 10]],
        throw: [['throwStep', 0.14, 18], ['throwGrab', 0.34, 20], ['guard', 0.3, 8]],
      };
      this.player.play(quick[m]);
      const dmg = Math.round((COUNTER_DMG[m] + (cw.perfect ? 2 : 0)) * taken);
      this.schedule(m === 'throw' ? 0.3 : 0.2, () => { if (this.mode === 'live') this.landHit(dmg, m); });
      // A throw that lands pushes the next announcement back by itself (throwHit).
      this.schedule(0.95, () => this.nextExchange());
    }
    this.cheat?.redraw();
    this.refreshConsole();
  }

  /** Your counter lands: damage, sparks, the combo; a K.O. ends the fight. */
  landHit(dmg, m) {
    const def = this.ai;
    const big = m === 'special';
    this.hp.a = Math.max(0, this.hp.a - dmg);
    if (!big) this.energy.p = Math.min(100, this.energy.p + COUNTER_ENERGY[m]);
    this.energy.a = Math.min(100, this.energy.a + 8);
    if (m === 'throw') this.throwHit(this.player, def, dmg, 'xr-fight-player');
    else {
      const at = def.chestPos();
      const local = this.stage3d.worldToLocal(at.clone());
      def.flash(1);
      if (big) def.play([['hitBack', 0.12, 22], ['stumble', 0.2, 12], ['kneel', 0.34, 10], ['guard', 0.3, 7]]);
      else def.play([['hit', 0.35, 22], ['guard', 0.2, 10]]);
      this.burst(at, 'xr-fight-player', big ? 46 : 22);
      this.shock.spawn(local.x - 0.03, local.y, local.z, new THREE.Vector3(0, 0, 1), 'xr-fight-player', big ? 0.32 : 0.18, 0.45);
      this.arena.userData.ripple(local.x, big ? 1.4 : 0.8, 0);
      if (big) this.room.ripple(at.clone().setY(this.engine.floorY), hex('xr-fight-player'), 0.6);
      this.popNumber(`-${dmg}`, local, big ? 'xr-fight-energy' : 'xr-fight-player');
      (big ? sfx.crash : sfx.hit)();
      this.hitStop(big ? 0.16 : 0.08);
    }
    this.comboHit();
    this.redrawBoard();
    if (this.hp.a < 35) music.intensity = 2;
    if (this.hp.a <= 0) this.ko();
  }

  // ---------- what the robot shows, and the coach ----------

  /** A move's name as the robot's announcement or in a sentence (guards have their own words). */
  moveName(m, kind) {
    if (m === 'special') return t(`fightSpecial_${kind}`);
    return t(`fightMove_${m}`);
  }

  /**
   * The robot's announced move over its head: the icon, its name, and a ring that shrinks until
   * it strikes. 'counter': it is open (your chance), in your color.
   */
  showTell(move, swap = false) {
    const size = this.flat ? 0.3 : 0.24; // sprite width; the disc is 5/8 of it
    if (!this.tell) {
      const c = document.createElement('canvas');
      c.width = 384;
      c.height = 320;
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
      icon.scale.set(size, (size * 320) / 384, 1);
      icon.renderOrder = 26;
      const rr = (size * 104) / 384; // the disc's radius
      const ring = new THREE.Mesh(new THREE.RingGeometry(rr * 1.0, rr * 1.13, 48), new THREE.MeshBasicMaterial({ color: hex('xr-fight-energy'), transparent: true, depthTest: false, side: THREE.DoubleSide }));
      ring.renderOrder = 27;
      ring.position.y = (size * (160 - 208)) / 384; // the disc sits in the lower part of the sprite
      const g = new THREE.Group();
      g.add(icon, ring);
      g.userData.noFit = true;
      this.stage3d.add(g);
      this.tell = { g, icon, ring, c, tex, size };
    }
    const { c, tex, g } = this.tell;
    const counter = move === 'counter';
    const token = counter ? 'xr-fight-player' : this.opp.token;
    const name = counter ? t('fightCounter') : move === 'block' || move === 'duck' ? t(`fightTell_${move}`) : this.moveName(move, this.kindA);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.fillStyle = color('xr-fight-hud');
    ctx.beginPath();
    ctx.arc(192, 208, 100, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = color(token);
    ctx.stroke();
    drawIcon(ctx, counter ? 'fight' : iconFor(move, this.kindA), 192, 208, 124, color(move === 'special' ? 'xr-fight-energy' : token));
    // The name on a dark plate above the disc (never the icon alone), clear of the robot's head.
    let px = 58;
    do { ctx.font = font('black', px); px -= 2; } while (ctx.measureText(name).width > 348 && px > 34);
    const tw = ctx.measureText(name).width;
    roundRect(ctx, 192 - tw / 2 - 16, 6, tw + 32, 80, 18);
    ctx.fillStyle = color('xr-fight-dark');
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = color(token);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color('xr-panel-text');
    ctx.fillText(name, 192, 48);
    tex.needsUpdate = true;
    this.tell.move = move;
    g.position.set(GAP, 0.93, 0.04);
    g.visible = true;
    // A feint turning into the real attack: the icon pops (not with calm motion).
    const s = this.tell.size;
    if (swap && !this.calm) this.tween(0.25, (k) => { const u = 1 + 0.35 * Math.sin(Math.PI * k); this.tell.icon.scale.set(s * u, ((s * 320) / 384) * u, 1); });
  }

  hideTell() {
    if (this.tell) this.tell.g.visible = false;
  }

  /** The tell ring shrinks and changes color as the strike comes; the ring faces the viewer. */
  updateTell() {
    const tell = this.tell;
    const span = this.ex ?? this.cw;
    if (!tell?.g.visible || !span) return;
    const k = Math.max(0, Math.min(1, 1 - (span.end - this.gt) / span.T));
    tell.ring.scale.setScalar(1.55 - 0.55 * k);
    tell.ring.material.color.setHex(hex(this.cw ? 'xr-fight-player' : k > 0.6 ? 'xr-danger' : 'xr-fight-energy'));
    tell.ring.quaternion.copy(this.engine.camera.getWorldQuaternion(new THREE.Quaternion())).premultiply(this.stage3d.getWorldQuaternion(new THREE.Quaternion()).invert());
  }

  /** The moves that answer what the robot shows (for the hints on the buttons). */
  answersTo(shown) {
    const kp = this.kindP;
    const ka = this.kindA;
    if (shown === 'counter') return ['punch', 'kick', 'throw'];
    if (shown === 'special') { const sp = SPECIALS[ka]; return [...(sp.stop ?? []), ...Object.keys(sp.weak ?? {})]; }
    if (shown === 'block' || shown === 'duck') return ATTACKS.filter((m) => damage(m, shown, kp, ka) > 0);
    return ['block', 'duck', 'punch', 'kick'].filter((m) => damage(shown, m, ka, kp) === 0);
  }

  /**
   * The coach: over your fighter, the simplest answer to what the robot shows, and a mark on the
   * fitting buttons. It helps the first times each announcement comes (relaxed mode: always).
   */
  coach(shown) {
    const n = (this.seenTell[shown] = (this.seenTell[shown] ?? 0) + 1);
    if (!this.easy && n > COACH_TIMES) { this.hideCoach(); return; }
    const best = shown === 'special' ? SPECIALS[this.kindA].counter : BEST[shown];
    const key = KEYCAP[best] ?? t(best === 'throw' ? 'fightKeySpace' : 'fightKeyEnter');
    const text = this.desk ? t('fightCoachKey', { move: this.moveName(best, this.kindP), key }) : t('fightCoach', { move: this.moveName(best, this.kindP) });
    this.coachSprite?.removeFromParent();
    this.coachSprite?.material.map?.dispose();
    this.coachSprite?.material.dispose();
    const s = makeLabel(text, 'xr-success');
    s.position.set(-GAP, 0.84, 0.06);
    this.stage3d.add(s);
    this.coachSprite = s;
    this.hintMoves(this.answersTo(shown));
  }

  hideCoach() {
    if (this.coachSprite) {
      this.coachSprite.removeFromParent();
      this.coachSprite.material.map?.dispose();
      this.coachSprite.material.dispose();
      this.coachSprite = null;
    }
    this.hintMoves([]);
  }

  /** Marks the buttons of the given moves (3D buttons; on phones the thumb buttons). */
  hintMoves(list) {
    this.moveButtons?.forEach((b, i) => { if (b.parent) b.userData.setHint(list.includes(MOVES[i])); });
    this.livePadEls?.forEach((el, i) => {
      const on = list.includes(this.livePadOrder[i]);
      el.style.outline = on ? '3px solid var(--xr-success)' : '';
      el.style.outlineOffset = on ? '2px' : '';
    });
  }

  /**
   * In the headset (real time): punch with a quick thrust of a hand towards the table, raise
   * both hands in front of the face to block, and really duck (head clearly below its usual
   * height). Kick, throw and the special stay on the buttons.
   */
  readGestures(dt) {
    const e = this.engine;
    if (!e.isXR || this.mode !== 'live' || !e.head.valid) return;
    const open = this.cw || (this.ex && !this.ex.pm);
    const head = e.head.pos;
    // Usual head height: follows quickly upwards, only slowly downwards.
    if (this.headBase === undefined) this.headBase = head.y;
    this.headBase += (head.y - this.headBase) * Math.min(1, dt * (head.y > this.headBase ? 3 : 0.12));
    if (open && this.headBase - head.y > 0.2) { this.liveMove('duck'); return; }
    const toTable = this.stage3d.getWorldPosition(new THREE.Vector3()).sub(head).setY(0).normalize();
    this.handPrev ??= new Map();
    const hands = [];
    for (const p of e.pointers) {
      if (p.kind !== 'xr' || !p.active || !p.controller) continue;
      const pos = new THREE.Vector3().setFromMatrixPosition(p.controller.matrixWorld);
      hands.push(pos);
      const prev = this.handPrev.get(p);
      this.handPrev.set(p, pos.clone());
      if (!prev || !open) continue;
      const v = pos.clone().sub(prev).divideScalar(Math.max(dt, 1e-3));
      if (v.dot(toTable) > 1.7 && pos.distanceTo(head) > 0.3) { this.liveMove('punch'); return; }
    }
    if (open && hands.length >= 2 && hands.every((h) => h.distanceTo(head) < 0.33 && h.y > head.y - 0.3)) this.liveMove('block');
  }

  /**
   * The browser's layout (the headset keeps its arc around the player). Desktop: the move buttons
   * as a flat row in front of the table, the AI's thoughts on the left and the cheat sheet on the
   * right of the fighters. Phones, portrait: the console (tactics) below the table, the thoughts
   * above the scoreboard; landscape: left and right of the table.
   */
  placePanels() {
    if (!this.flat) return;
    const y0 = this.eye - ARENA_DROP;
    const con = this.console?.parent ? this.console : null;
    const ins = this.insights?.parent;
    const cheat = this.cheat?.parent ? this.cheat : null;
    if (this.desk) {
      if (con?.userData.live) {
        // A control desk in front of the table's edge, tilted towards the viewer.
        con.rotation.set(-0.26, 0, 0);
        con.position.set(0, y0 - 0.17, ARENA_Z + 0.68);
      } else if (con) {
        con.rotation.set(0, 0, 0);
        con.scale.setScalar(0.92);
        con.position.set(0.99, y0 + 0.5, ARENA_Z + 0.1);
      }
      if (ins) {
        ins.rotation.set(0, 0, 0);
        ins.position.set(-0.89, y0 + 1.0 - this.insights.h / 2, ARENA_Z + 0.1);
      }
      if (cheat) {
        cheat.rotation.set(0, 0, 0);
        cheat.position.set(0.89, y0 + 1.0 - cheat.h / 2, ARENA_Z + 0.1);
      }
      return;
    }
    const portrait = window.innerWidth < window.innerHeight;
    // Phones held sideways: the fighters fill the height; the table's front edge may run out of
    // the picture under the thumbs' buttons (portrait frames the whole table top).
    this.fitLip.userData.noFit = !portrait;
    // The scoreboard as wide as the screen allows.
    this.board.scale.setScalar(portrait ? 1.12 : 1.5);
    // Larger than in the headset, so the buttons are easy to hit with a finger.
    if (con) {
      con.rotation.set(0, 0, 0);
      con.scale.setScalar(portrait ? 1.55 : 1.3);
      if (portrait) con.position.set(0, y0 - 0.5, ARENA_Z + 0.55);
      else con.position.set(1.22, y0 + 0.28, ARENA_Z + 0.25);
    }
    if (ins) {
      // Real time in landscape: the thumbs' buttons take the lower corners; the insights pause.
      ins.visible = portrait || this.mode !== 'live';
      ins.rotation.set(0, 0, 0);
      ins.scale.setScalar(portrait ? 1.35 : 1.25);
      if (portrait) ins.position.set(0, y0 + HUD_UP + 0.14 + (this.insights.h * 1.35) / 2, ARENA_Z - 0.1);
      else ins.position.set(-1.22, y0 + 0.28, ARENA_Z + 0.25);
    }
  }

  /** The move buttons; live: they act at once (real-time mode), else they fill the 3 slots. */
  buildConsole(live = false) {
    const { eye } = this;
    const g = new THREE.Group();
    g.userData.live = live;
    placeOnArc(g, 0.8, eye - 0.06, 1.05);
    this.add(g);
    // Desktop, real time: a row of big buttons with their keys; else the compact console.
    const deskLive = live && this.desk;
    if (!deskLive) {
      const title = textPanel(0.66, 0.06, [{ text: live ? t(this.engine.isXR ? 'fightLiveTitleXR' : 'fightLiveTitle') : t('fightProgram', { n: this.round }), size: 'xr-text-sm', weight: 'black' }], { surface: false });
      title.position.y = 0.2;
      g.add(title);
    }
    this.moveButtons = MOVES.map((m) => {
      // The special has the fighter's own (longer) name: its button is a little wider.
      const w = deskLive ? (m === 'special' ? 0.27 : 0.2) : m === 'special' ? 0.17 : 0.118;
      const b = iconTile(w, deskLive ? 0.19 : 0.14, (ctx, c, s) => this.drawMoveButton(ctx, c, s, m, live));
      b.userData.label = this.moveLabel(m);
      b.userData.onClick = () => (live ? this.liveMove(m) : this.addMove(m));
      return b;
    });
    if (deskLive) {
      // Defence, attacks, special: in the order of the keys, with a little room between the groups.
      const row = DESK_ORDER.map((m) => this.moveButtons[MOVES.indexOf(m)]);
      layoutRow(row, 0, 0, 0.014);
      row.forEach((b, i) => { b.position.x += i < 2 ? -0.035 : i === 5 ? 0.035 : 0; });
    } else layoutRow(this.moveButtons, 0.09, 0, 0.012);
    this.moveButtons.forEach((b) => g.add(b));
    if (live) {
      g.children.forEach((o, i) => this.popIn(o, 0.03 * i));
      this.console = g;
      this.refreshConsole();
      return;
    }
    // Slots
    this.slots = Array.from({ length: SLOTS }, (_, i) => {
      const s = iconTile(0.15, 0.12, (ctx, c, st) => {
        const m = this.queue[i];
        c.surface({ fill: color(m ? 'xr-panel-bg' : 'xr-button-bg'), stroke: color(m ? 'xr-accent' : 'xr-panel-border'), strokeWidth: num('xr-border-width') * (st.hover && m ? 2 : 1), stripe: false });
        ctx.fillStyle = color('xr-panel-muted');
        ctx.font = font('black', c.m(num('xr-text-sm')));
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(String(i + 1), c.m(0.012), c.m(0.008));
        if (m) drawIcon(ctx, iconFor(m, this.kindP), c.canvas.width / 2, c.canvas.height / 2, c.m(0.06), color(m === 'special' ? 'xr-fight-energy' : 'xr-accent'));
      });
      s.userData.label = `${t('fightProgram', { n: this.round })} ${i + 1}`;
      s.userData.focusable = false; // the keyboard removes moves with Backspace
      s.userData.onClick = () => this.removeMove(i);
      return s;
    });
    layoutRow(this.slots, -0.07, 0, 0.02);
    this.slots.forEach((s) => g.add(s));
    // Actions
    const clear = iconTile(0.2, 0.09, (ctx, c, s) => {
      c.surface({ fill: color(s.hover ? 'xr-button-hover' : 'xr-button-bg'), stripe: false });
      ctx.fillStyle = color('xr-button-text');
      ctx.font = font('bold', c.m(num('xr-text-sm')));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(t('fightClear'), c.canvas.width / 2, c.canvas.height / 2);
    });
    clear.userData.label = t('fightClear');
    clear.userData.onClick = () => { sfx.click(); this.queue = []; this.refreshConsole(); };
    this.goButton = iconTile(0.36, 0.09, (ctx, c, s) => {
      c.surface({ fill: color(s.disabled ? 'xr-button-bg' : s.hover ? 'xr-primary-hover' : 'xr-primary'), stroke: color('xr-primary-hover'), stripe: false });
      ctx.globalAlpha = s.disabled ? 0.5 : 1;
      drawIcon(ctx, 'fight', c.m(0.05), c.canvas.height / 2, c.m(0.045), color(s.disabled ? 'xr-button-text' : 'xr-on-primary'));
      ctx.fillStyle = color(s.disabled ? 'xr-button-text' : 'xr-on-primary');
      ctx.font = font('black', c.m(num('xr-text-md')));
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(t('fightGo'), c.m(0.09), c.canvas.height / 2);
      ctx.globalAlpha = 1;
    });
    this.goButton.userData.label = t('fightGo');
    this.goButton.userData.onClick = () => { if (!this.goButton.userData.isDisabled()) this.execute(); };
    layoutRow([clear, this.goButton], -0.2, 0, 0.02);
    g.add(clear, this.goButton);
    g.children.forEach((o, i) => this.popIn(o, 0.03 * i));
    this.console = g;
    this.refreshConsole();
  }

  /**
   * A move's button: icon and name; on the desktop also its key (real time: the key cap below,
   * tactics: the number in the corner). The coach's hint is a thick outline with a check mark.
   */
  drawMoveButton(ctx, c, s, m, live) {
    const special = m === 'special';
    const off = s.disabled;
    const hint = s.hint && !off;
    const W = c.canvas.width;
    const H = c.canvas.height;
    const deskLive = live && this.desk;
    c.surface({
      fill: color(s.hover && !off ? 'xr-button-hover' : 'xr-button-bg'),
      stroke: color(hint ? 'xr-success' : special ? 'xr-fight-energy' : s.hover ? 'xr-accent' : 'xr-panel-border'),
      strokeWidth: num('xr-border-width') * (hint ? 3 : s.hover ? 2 : 1),
      stripe: false,
    });
    ctx.globalAlpha = off ? 0.35 : 1;
    const accent = color(special ? 'xr-fight-energy' : 'xr-accent');
    const label = this.moveLabel(m);
    const fit = (weight, px, text, room, min) => {
      let size = px;
      ctx.font = font(weight, size);
      while (ctx.measureText(text).width > room && size > min) { size -= 1; ctx.font = font(weight, size); }
    };
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (deskLive) {
      drawIcon(ctx, iconFor(m, this.kindP), W / 2, H * 0.24, c.m(0.062), accent);
      ctx.fillStyle = color('xr-button-text');
      fit('bold', c.m(num('xr-text-sm')), label, W - c.m(0.04), c.m(0.026));
      ctx.fillText(label, W / 2, H * 0.52);
      // The key cap
      const key = KEYCAP[m] ?? t(m === 'throw' ? 'fightKeySpace' : 'fightKeyEnter');
      fit('bold', c.m(num('xr-text-sm')), key, W - c.m(0.05), c.m(0.028));
      const kw = Math.max(c.m(0.06), ctx.measureText(key).width + c.m(0.03));
      const kh = c.m(0.048);
      roundRect(ctx, (W - kw) / 2, H * 0.8 - kh / 2, kw, kh, c.m(0.01));
      ctx.fillStyle = color('xr-panel-bg');
      ctx.fill();
      ctx.lineWidth = c.m(0.003);
      ctx.strokeStyle = color('xr-panel-muted');
      ctx.stroke();
      ctx.fillStyle = color('xr-panel-text');
      ctx.fillText(key, W / 2, H * 0.8 + c.m(0.002));
    } else {
      drawIcon(ctx, iconFor(m, this.kindP), W / 2, H * 0.38, c.m(0.055), accent);
      ctx.fillStyle = color('xr-button-text');
      fit('bold', c.m(num('xr-text-sm')), label, W - c.m(0.012), c.m(0.022));
      ctx.fillText(label, W / 2, H * 0.8);
      // Tactics on a keyboard: the key in the corner.
      if (!live && this.desk) {
        ctx.font = font('bold', c.m(num('xr-text-min')));
        ctx.fillStyle = color('xr-panel-muted');
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(String(MOVES.indexOf(m) + 1), c.m(0.008), c.m(0.006));
      }
    }
    if (hint) {
      // A check mark in the corner: the hint never rests on the color alone.
      const x = W - c.m(0.026);
      const y = c.m(0.026);
      const k = c.m(0.011);
      ctx.lineWidth = c.m(0.006);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = color('xr-success');
      ctx.beginPath();
      ctx.moveTo(x - k, y);
      ctx.lineTo(x - k * 0.25, y + k * 0.8);
      ctx.lineTo(x + k * 1.1, y - k * 0.9);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** A move's name on its button (the special has the fighter's own name). */
  moveLabel(m) {
    return t(m === 'special' ? `fightSpecial_${this.kindP}` : `fightMove_${m}`);
  }

  addMove(m) {
    if (this.mode !== 'program' || this.queue.length >= SLOTS) return;
    if (m === 'special' && (this.energy.p < 100 || this.queue.includes('special'))) { sfx.wrong(); return; }
    sfx.click();
    this.queue.push(m);
    this.refreshConsole();
  }

  removeMove(i) {
    if (this.mode !== 'program' || !this.queue[i]) return;
    sfx.click();
    this.queue.splice(i, 1);
    this.refreshConsole();
  }

  refreshConsole() {
    if (this.mode === 'live') {
      // Real time: one move per announcement; the special needs full energy (Santa's changes
      // after use). While the robot is open (counter), only attacks count.
      const open = !!this.cw || (!!this.ex && !this.ex.pm);
      const off = (i) => {
        const m = MOVES[i];
        if (!open || (m === 'special' && this.energy.p < 100)) return true;
        return !!this.cw && (m === 'block' || m === 'duck');
      };
      this.moveButtons?.forEach((b, i) => b.userData.setDisabled(off(i)));
      const si = MOVES.indexOf('special');
      const sb = this.moveButtons?.[si];
      if (sb) { sb.userData.label = this.moveLabel('special'); sb.redraw(); }
      if (this.livePad) {
        this.livePadOrder.forEach((m, i) => this.livePad.disable(i, off(MOVES.indexOf(m))));
        this.livePad.relabel(this.livePadOrder.indexOf('special'), iconFor('special', this.kindP), this.moveLabel('special'));
      }
      return;
    }
    this.slots?.forEach((s) => s.redraw());
    this.moveButtons?.forEach((b, i) => {
      const m = MOVES[i];
      b.userData.setDisabled(this.queue.length >= SLOTS || (m === 'special' && (this.energy.p < 100 || this.queue.includes('special'))));
    });
    this.goButton?.userData.setDisabled(this.queue.length < SLOTS);
  }

  /**
   * "AI thoughts": what the AI has learned about you. Real time: a compact panel (headset: under
   * the move buttons; the cheat sheet takes the left side); tactics: the taller panel on the left.
   */
  buildInsights() {
    const { eye } = this;
    const live = this.liveMode;
    const panel = new Panel(0.6, live ? 0.46 : 0.74, (ctx, c) => this.drawInsights(ctx, c));
    // In a holder, so the browser layout can move and enlarge it while it pops in (placePanels).
    const holder = new THREE.Group();
    holder.add(panel);
    if (live) placeOnArc(holder, 0.8, eye - 0.06 - 0.26, 1.05);
    else placeOnArc(holder, -0.8, eye - 0.06, 1.05);
    this.add(holder);
    this.popIn(panel, 0.1);
    this.insights = panel;
  }

  /**
   * The cheat sheet (real time; desktop and headset): what stops each announcement, with the
   * current one marked. Phones have the coach instead (no room beside the fighters).
   */
  buildCheat() {
    this.cheat = null;
    if (this.engine.touchUI) return;
    const panel = new Panel(0.6, 0.64, (ctx, c) => this.drawCheat(ctx, c));
    placeOnArc(panel, -0.8, this.eye - 0.06, 1.05);
    this.add(panel);
    this.popIn(panel, 0.14);
    this.cheat = panel;
  }

  drawCheat(ctx, c) {
    c.surface();
    const W = c.canvas.width;
    const pad = c.m(0.025);
    const sm = c.m(num('xr-text-sm'));
    let y = pad;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = color('xr-panel-text');
    ctx.font = font('black', c.m(num('xr-text-md')));
    ctx.fillText(t('fightCheat'), pad, y);
    y += c.m(0.062);
    const ka = this.kindA;
    const oppToken = this.opp?.token ?? 'xr-accent';
    const rows = [
      ['punch', t('fightMove_punch'), t('fightCheat_punch'), oppToken, 'punch'],
      ['kick', t('fightMove_kick'), t('fightCheat_kick'), oppToken, 'kick'],
      ['throw', t('fightMove_throw'), t('fightCheat_throw'), oppToken, 'throw'],
      ['block', t('fightTell_block'), t('fightCheat_block'), oppToken, 'block'],
      ['duck', t('fightTell_duck'), t('fightCheat_duck'), oppToken, 'duck'],
      ['special', t(`fightSpecial_${ka}`), t(`fightSpecialHow_${ka}`), 'xr-fight-energy', iconFor('special', ka)],
      ['counter', t('fightCheatCounter'), t('fightCheat_counter'), 'xr-fight-player', 'fight'],
    ];
    const active = this.cw ? 'counter' : this.ex?.seen;
    const cell = c.m(0.044);
    const tx = pad + cell + c.m(0.014);
    for (const [key, name, answer, token, icon] of rows) {
      const on = key === active;
      ctx.font = font(on ? 'black' : 'bold', sm);
      const lines = wrapText(ctx, `${name}: ${answer}`, W - tx - pad);
      const h = Math.max(cell, lines.length * sm * 1.18);
      if (on) {
        // The announcement that is up right now: a bar and a frame (not the color alone).
        roundRect(ctx, pad * 0.4, y - c.m(0.006), W - pad * 0.8, h + c.m(0.012), c.m(0.008));
        ctx.fillStyle = color('xr-button-hover');
        ctx.fill();
        ctx.lineWidth = c.m(0.004);
        ctx.strokeStyle = color('xr-success');
        ctx.stroke();
      }
      drawIcon(ctx, icon, pad + cell / 2, y + h / 2, cell * 0.9, color(token));
      ctx.fillStyle = color(on ? 'xr-panel-text' : 'xr-panel-muted');
      lines.forEach((line, i) => ctx.fillText(line, tx, y + (h - lines.length * sm * 1.18) / 2 + i * sm * 1.18 + sm * 0.1));
      y += h + c.m(0.016);
    }
  }

  drawInsights(ctx, c) {
    if (this.liveMode) { this.drawLiveInsights(ctx, c); return; }
    c.surface();
    const W = c.canvas.width;
    const pad = c.m(0.025);
    const sm = c.m(num('xr-text-sm'));
    let y = pad;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = color('xr-panel-text');
    ctx.font = font('black', c.m(num('xr-text-md')));
    ctx.fillText(t('fightMind'), pad, y);
    y += c.m(0.06);
    const last = this.lastTurn;
    ctx.font = font('regular', sm);
    ctx.fillStyle = color('xr-panel-muted');
    const para = (text) => {
      for (const line of wrapText(ctx, text, W - 2 * pad)) { ctx.fillText(line, pad, y); y += sm * 1.2; }
    };
    if (!last) {
      para(t('fightMindEmpty'));
      y += sm * 0.2;
    } else {
      para(t('fightMindLast'));
      y += sm * 0.2;
      // Your moves vs. predictions
      const cell = c.m(0.065);
      last.forEach((r, i) => {
        const x = pad + i * (cell * 2 + c.m(0.03));
        drawIcon(ctx, iconFor(r.you, this.kindP), x + cell / 2, y + cell / 2, cell * 0.7, color('xr-fight-player'));
        drawIcon(ctx, iconFor(r.pred, this.kindP), x + cell * 1.5, y + cell / 2, cell * 0.7, color(r.hit ? 'xr-danger' : 'xr-panel-muted'));
      });
      y += cell + c.m(0.012);
      const hits = last.filter((r) => r.hit).length;
      ctx.font = font('bold', sm);
      ctx.fillStyle = color(hits >= 2 ? 'xr-danger' : 'xr-success');
      ctx.fillText(t('fightMindHits', { n: hits, total: SLOTS }), pad, y);
      y += sm * 1.5;
    }
    const all = this.predLog;
    const acc = all.length ? Math.round((all.reduce((a, b) => a + b, 0) / all.length) * 100) : 0;
    ctx.font = font('bold', sm);
    ctx.fillStyle = color('xr-panel-text');
    ctx.fillText(t('fightMindAcc', { n: acc }), pad, y);
    y += sm * 1.6;
    // Rules
    ctx.font = font('regular', sm);
    ctx.fillStyle = color('xr-panel-muted');
    for (const line of t('fightRulesShort').split('\n')) {
      ctx.fillText(line, pad, y, W - 2 * pad);
      y += sm * 1.2;
    }
    // The two special moves and what stops them.
    y += sm * 0.3;
    ctx.font = font('bold', sm);
    for (const [who, kind, token] of [[this.playerName, this.kindP, 'xr-fight-player'], [this.opp?.name ?? '', this.kindA, this.opp?.token ?? 'xr-fight-energy']]) {
      ctx.fillStyle = color(token);
      for (const line of wrapText(ctx, `${who}: ${t(`fightSpecial_${kind}`)}, ${t(`fightSpecialHow_${kind}`)}`, W - 2 * pad)) {
        ctx.fillText(line, pad, y);
        y += sm * 1.15;
      }
    }
  }

  /**
   * Real time: what the robot has learned about you. For each move it announced: your usual
   * answer with a check (it stops that move) or a cross (it does not), then how often it
   * predicted you, its feints and your perfect defences.
   */
  drawLiveInsights(ctx, c) {
    c.surface();
    const W = c.canvas.width;
    const pad = c.m(0.025);
    const sm = c.m(num('xr-text-sm'));
    let y = pad;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = color('xr-panel-text');
    ctx.font = font('black', c.m(num('xr-text-md')));
    ctx.fillText(t('fightMind'), pad, y);
    y += c.m(0.06);
    ctx.font = font('regular', sm);
    ctx.fillStyle = color('xr-panel-muted');
    const para = (text) => {
      for (const line of wrapText(ctx, text, W - 2 * pad)) { ctx.fillText(line, pad, y); y += sm * 1.2; }
    };
    const shown = [...ATTACKS, 'special'].filter((m) => this.resp && this.expected(m));
    if (!shown.length) {
      para(t('fightMindLiveEmpty'));
      y += sm * 0.3;
    } else {
      para(t('fightMindLive'));
      y += sm * 0.25;
      // Two cells per line: announced move, arrow, your usual answer, check or cross.
      const cell = c.m(0.058);
      const colW = (W - 2 * pad) / 2;
      shown.forEach((m, i) => {
        const x = pad + (i % 2) * colW;
        const cy = y + Math.floor(i / 2) * (cell + c.m(0.012)) + cell / 2;
        const ans = this.expected(m);
        drawIcon(ctx, iconFor(m, this.kindA), x + cell / 2, cy, cell * 0.75, color(m === 'special' ? 'xr-fight-energy' : this.opp?.token ?? 'xr-accent'));
        ctx.strokeStyle = color('xr-panel-muted');
        ctx.lineWidth = c.m(0.003);
        ctx.beginPath();
        ctx.moveTo(x + cell * 1.15, cy);
        ctx.lineTo(x + cell * 1.75, cy);
        ctx.moveTo(x + cell * 1.55, cy - cell * 0.15);
        ctx.lineTo(x + cell * 1.75, cy);
        ctx.lineTo(x + cell * 1.55, cy + cell * 0.15);
        ctx.stroke();
        const stops = damage(m, ans, this.kindA, this.kindP) === 0;
        const tone = color(stops ? 'xr-success' : 'xr-danger');
        if (ans === 'idle') {
          ctx.fillStyle = tone;
          ctx.font = font('black', cell * 0.6);
          ctx.textBaseline = 'middle';
          ctx.fillText('–', x + cell * 2.2, cy);
          ctx.textBaseline = 'top';
        } else drawIcon(ctx, iconFor(ans, this.kindP), x + cell * 2.4, cy, cell * 0.75, tone);
        // Check or cross behind it (not the color alone).
        const mx = x + cell * 3.25;
        const k = cell * 0.2;
        ctx.strokeStyle = tone;
        ctx.lineWidth = c.m(0.005);
        ctx.lineCap = 'round';
        ctx.beginPath();
        if (stops) { ctx.moveTo(mx - k, cy); ctx.lineTo(mx - k * 0.25, cy + k * 0.8); ctx.lineTo(mx + k * 1.1, cy - k * 0.9); } else { ctx.moveTo(mx - k, cy - k); ctx.lineTo(mx + k, cy + k); ctx.moveTo(mx + k, cy - k); ctx.lineTo(mx - k, cy + k); }
        ctx.stroke();
      });
      y += Math.ceil(shown.length / 2) * (cell + c.m(0.012)) + c.m(0.008);
    }
    const all = this.predLog;
    const acc = all.length ? Math.round((all.reduce((a, b) => a + b, 0) / all.length) * 100) : 0;
    ctx.font = font('bold', sm);
    ctx.fillStyle = color('xr-panel-text');
    ctx.fillText(t('fightMindAcc', { n: acc }), pad, y, W - 2 * pad);
    y += sm * 1.3;
    ctx.fillStyle = color('xr-panel-muted');
    ctx.fillText(t('fightMindLiveStats', { f: this.feints ?? 0, p: this.perfects ?? 0 }), pad, y, W - 2 * pad);
  }

  /** The scoreboard: names, health (bar and number), energy, and in the middle the score. */
  drawBoard(ctx, c) {
    const W = c.canvas.width;
    const H = c.canvas.height;
    ctx.clearRect(0, 0, W, H);
    c.surface({ fill: color('xr-fight-hud'), stroke: color('xr-panel-border'), stripe: false });
    const pad = c.m(0.022);
    const barW = W * 0.36;
    const min = c.m(num('xr-text-min'));
    const sides = [
      { name: this.playerName, token: 'xr-fight-player', hp: this.hp?.p ?? PLAYER_HP, max: PLAYER_HP, en: this.energy?.p ?? 0, x: pad, align: 'left' },
      { name: this.opp?.name ?? '', token: this.opp?.token ?? 'xr-fight-player', hp: this.hp?.a ?? 100, max: this.opp?.hp ?? 100, en: this.energy?.a ?? 0, x: W - pad - barW, align: 'right' },
    ];
    for (const s of sides) {
      const outer = s.align === 'left' ? s.x : s.x + barW;
      const inner = s.align === 'left' ? s.x + barW : s.x;
      ctx.textBaseline = 'top';
      // Name on the outside, the health as a number towards the middle.
      ctx.textAlign = s.align;
      let px = c.m(num('xr-text-md'));
      ctx.font = font('black', px);
      while (ctx.measureText(s.name).width > barW - c.m(0.09) && px > min) { px -= 1; ctx.font = font('black', px); }
      ctx.fillStyle = color(s.token);
      ctx.fillText(s.name, outer, pad * 0.8);
      ctx.textAlign = s.align === 'left' ? 'right' : 'left';
      ctx.font = font('black', c.m(num('xr-text-md')));
      ctx.fillStyle = color('xr-panel-text');
      ctx.fillText(String(Math.ceil(s.hp)), inner, pad * 0.8);
      // Health bar (drains from the center outwards)
      const by = pad + c.m(0.052);
      const bh = c.m(0.034);
      ctx.fillStyle = color('xr-fight-dark');
      ctx.fillRect(s.x, by, barW, bh);
      const k = Math.max(0, s.hp / s.max);
      ctx.fillStyle = color(k < 0.3 ? 'xr-fight-hp-low' : 'xr-fight-hp');
      if (s.align === 'left') ctx.fillRect(s.x + barW * (1 - k), by, barW * k, bh);
      else ctx.fillRect(s.x, by, barW * k, bh);
      ctx.strokeStyle = color(s.token);
      ctx.lineWidth = c.m(0.003);
      ctx.strokeRect(s.x, by, barW, bh);
      // Energy bar
      const ey = by + bh + c.m(0.012);
      const eh = c.m(0.016);
      ctx.fillStyle = color('xr-fight-dark');
      ctx.fillRect(s.x, ey, barW, eh);
      const e = Math.min(1, s.en / 100);
      ctx.fillStyle = color(e >= 1 ? 'xr-fight-energy' : 'xr-fight-energy-dim');
      if (s.align === 'left') ctx.fillRect(s.x + barW * (1 - e), ey, barW * e, eh);
      else ctx.fillRect(s.x, ey, barW * e, eh);
      ctx.textAlign = s.align;
      ctx.font = font('bold', min);
      ctx.fillStyle = color(e >= 1 ? 'xr-fight-energy' : 'xr-panel-muted');
      ctx.fillText(e >= 1 ? t('fightEnergyFull') : t('fightEnergy'), outer, ey + eh + c.m(0.007));
    }
    // The middle: the score, and which robot this is.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font('black', c.m(0.064));
    ctx.fillStyle = color('xr-fight-energy');
    ctx.fillText(String(this.totalScore ?? 0), W / 2, H * 0.3);
    ctx.font = font('bold', min);
    ctx.fillStyle = color('xr-panel-muted');
    ctx.fillText(t('score'), W / 2, H * 0.58);
    if (this.opp) ctx.fillText(t('fightStage', { n: this.stage + 1, total: STAGES }), W / 2, H * 0.8, W - 2 * (pad + barW) - c.m(0.02));
  }

  // ---------- AI ----------

  chooseAIMoves() {
    const moves = [];
    const preds = [];
    let prev = this.lastPlayerMove;
    let energy = this.energy.a;
    for (let i = 0; i < SLOTS; i++) {
      const p = this.model.dist(prev, i);
      let best = 0;
      for (let k = 1; k < MOVES.length; k++) if (p[k] > p[best]) best = k;
      const pred = MOVES[best];
      preds.push(pred);
      let m;
      // Its own special only when the move it expects from you would not stop it.
      const stoppers = [...(SPECIALS[this.kindA].stop ?? []), ...Object.keys(SPECIALS[this.kindA].weak ?? {})];
      if (energy >= 100 && !stoppers.includes(pred) && Math.random() < this.opp.special) {
        m = 'special';
        energy = 0;
      } else if (Math.random() < this.opp.predict * Math.min(1, 0.45 + p[best])) {
        m = pred === 'special' ? SPECIALS[this.kindP].counter : COUNTER[pred];
      } else {
        const r = Math.random();
        m = r < 0.25 ? 'punch' : r < 0.5 ? 'kick' : r < 0.67 ? 'block' : r < 0.84 ? 'duck' : 'throw';
      }
      moves.push(m);
      prev = best;
    }
    return { moves, preds };
  }

  // ---------- executing the turn ----------

  execute() {
    if (this.mode !== 'program' || this.queue.length < SLOTS) return;
    sfx.build();
    this.mode = 'execute';
    const mine = [...this.queue];
    const { moves: theirs, preds } = this.chooseAIMoves();
    // Learn from what you actually chose (after the AI committed its moves).
    const turn = [];
    mine.forEach((m, i) => {
      turn.push({ you: m, pred: preds[i], hit: preds[i] === m });
      this.predLog.push(preds[i] === m ? 1 : 0);
      this.model.learn(i === 0 ? this.lastPlayerMove : MOVES.indexOf(mine[i - 1]), i, m);
      this.moveCount[m] += 1;
    });
    this.lastPlayerMove = MOVES.indexOf(mine[SLOTS - 1]);
    this.lastTurn = turn;
    this.console.visible = false;
    this.insights?.redraw();
    for (let i = 0; i < SLOTS; i++) this.schedule(0.35 + i * BEAT, () => this.beat(mine[i], theirs[i], i));
    this.schedule(0.35 + SLOTS * BEAT + 0.2, () => this.endTurn());
  }

  /** One move each, at the same time. */
  beat(pm, am, i) {
    if (this.mode !== 'execute' && this.mode !== 'live') return;
    this.showMoveIcons(pm, am);
    for (const [f, m, side] of [[this.player, pm, 'p'], [this.ai, am, 'a']]) {
      if (m === 'special') this.energy[side] = 0;
      f.play(this.animFor(m));
    }
    this.redrawBoard();
    if (pm === 'special' || am === 'special') {
      this.announcer.say('fightCallSpecial', {}, 'xr-fight-energy');
      sfx.storm();
    }
    const at = pm === 'special' || am === 'special' ? IMPACT + 0.12 : IMPACT;
    this.schedule(at, () => this.impact(pm, am));
    if (i === 0 && this.round === 1 && this.stage === 0) this.announcer.say('fightCallFirst', {}, 'xr-fight-energy');
  }

  animFor(m) {
    switch (m) {
      case 'punch': return [['punchWind', 0.3, 14], ['punch', 0.32, 32], ['guard', 0.2, 10]];
      case 'kick': return [['kickWind', 0.3, 12], ['kick', 0.36, 28], ['guard', 0.2, 10]];
      case 'block': return [['block', 1.0, 16]];
      case 'duck': return [['duck', 1.0, 15]];
      // Approach and grab; what follows depends on the outcome (see impact / throwHit).
      case 'throw': return [['throwStep', 0.24, 13], ['throwGrab', 0.5, 17], ['guard', 0.3, 8]];
      case 'special': return [['charge', 0.6, 9], ['fire', 0.55, 20]];
      default: return [];
    }
  }

  impact(pm, am) {
    if (this.mode !== 'execute' && this.mode !== 'live') return;
    const kp = this.kindP;
    const ka = this.kindA;
    const toA = Math.round(damage(pm, am, kp, ka) * (this.opp.taken ?? 1));
    // Real time and relaxed mode: the robots hit softer.
    const toP = Math.round(damage(am, pm, ka, kp) * (this.opp.dmg ?? 1) * (this.mode === 'live' ? LIVE_DMG : 1) * (this.easy ? EASY_DMG : 1));
    const stage = this.stage3d;
    // Specials: each fighter's own look (beam, sonar rings, snowballs, a boulder).
    for (const [att, def, m, token, kind] of [[this.player, this.ai, pm, 'xr-fight-player', kp], [this.ai, this.player, am, this.opp.token, ka]]) {
      if (m !== 'special') continue;
      this.specialFx(att, def, kind, token);
      this.arena.userData.flash(1);
    }
    let blocked = false;
    for (const [att, def, m, dmg, side, token, dmgSide] of [
      [this.player, this.ai, pm, toA, 1, 'xr-fight-player', 'a'],
      [this.ai, this.player, am, toP, -1, this.opp.token, 'p'],
    ]) {
      const defMove = def === this.ai ? am : pm;
      // Ducked under a punch, a grab or a special: a quick "dodged!" over the defender.
      if (defMove === 'duck' && dmg === 0 && (m === 'punch' || m === 'throw' || m === 'special')) {
        this.popText(t('fightDodge'), stage.worldToLocal(def.chestPos()).add(new THREE.Vector3(0, 0.14, 0)), 'xr-fight-block');
        sfx.whoosh();
      }
      if (m === 'block' || m === 'duck' || (m === 'throw' && dmg === 0)) continue;
      const at = def.chestPos();
      const local = stage.worldToLocal(at.clone());
      if (dmg > 0) {
        this.hp[dmgSide] = Math.max(0, this.hp[dmgSide] - dmg);
        this.energy[dmgSide] = Math.min(100, this.energy[dmgSide] + 8);
        const attSide = dmgSide === 'a' ? 'p' : 'a';
        this.energy[attSide] = Math.min(100, this.energy[attSide] + 12);
        if (m === 'throw') {
          this.throwHit(att, def, dmg, token);
          continue;
        }
        const big = m === 'special';
        def.flash(1);
        if (big) def.play([['hitBack', 0.12, 22], ['stumble', 0.2, 12], ['kneel', 0.34, 10], ['guard', 0.3, 7]]);
        else def.play([['hit', 0.35, 22], ['guard', 0.2, 10]]);
        this.burst(at, token, big ? 46 : 22);
        this.shock.spawn(local.x - side * 0.03, local.y, local.z, new THREE.Vector3(0, 0, 1), token, big ? 0.32 : 0.18, 0.45);
        this.arena.userData.ripple(local.x, big ? 1.4 : 0.8, side > 0 ? 0 : 1);
        if (big) this.room.ripple(at.clone().setY(this.engine.floorY), hex(token), 0.6);
        this.popNumber(`-${dmg}`, local, big ? 'xr-fight-energy' : token);
        (big ? sfx.crash : sfx.hit)();
        this.hitStop(big ? 0.16 : 0.08);
        if (def === this.ai) this.ai.flash(1);
      } else if (defMove === 'block' && (m === 'punch' || m === 'kick' || m === 'special')) {
        blocked = true;
        const sh = this.shields[def === this.ai ? 1 : 0];
        sh.material.opacity = 0.9;
        this.energy[dmgSide] = Math.min(100, this.energy[dmgSide] + 20);
        att.play([['stagger', 0.3, 14], ['guard', 0.2, 10]]);
        this.shock.spawn(local.x - side * 0.08, local.y, local.z, new THREE.Vector3(0, 0, 1), 'xr-fight-block', 0.16, 0.4);
        sfx.thud();
      }
    }
    // Both tried to throw: they lock hands in a clinch and push each other away.
    if (pm === 'throw' && am === 'throw') {
      for (const f of [this.player, this.ai]) f.play([['clinch', 0.32, 15], ['stagger', 0.28, 12], ['guard', 0.3, 8]]);
      this.schedule(0.18, () => {
        this.shock.spawn(0, 0.42, 0, new THREE.Vector3(1, 0, 0), 'xr-fight-block', 0.14, 0.4);
        sfx.thud();
      });
    }
    if (blocked) this.announcer.say('fightCallBlock', {}, 'xr-fight-block');
    // Santa's special attacks take turns: next time the next one.
    if (pm === 'special' && this.playerKind !== 'echo' && CHRISTMAS) this.santaNext = (this.santaNext ?? 0) + 1;
    if (pm === 'throw' && toA > 0) this.announcer.say('fightCallThrow', {}, 'xr-fight-player');
    this.redrawBoard();
    if (this.hp.p <= 0 || this.hp.a <= 0) this.ko();
    if (this.hp.p < 35 || this.hp.a < 35) music.intensity = 2;
  }

  /**
   * A throw that lands: the attacker lifts the opponent and slams them onto their back,
   * the floor shakes; the next moves wait until the thrown fighter is back on their feet.
   */
  throwHit(att, def, dmg, token) {
    const lethal = this.hp[def === this.ai ? 'a' : 'p'] <= 0;
    att.play([['throwLift', 0.3, 15], ['throwSlam', 0.46, 18], ['guard', 0.3, 8]]);
    const down = [['grabbed', 0.08, 22], ['thrownUp', 0.24, 14], ['thrownAir', 0.18, 15], ['slammed', 0.3, 24]];
    def.play(lethal ? [...down, ['koBounce', 0.12, 16], ['ko', 99, 8]] : [...down, ['lie', 0.2, 10], ['sit', 0.28, 9], ['kneel', 0.26, 9], ['guard', 0.3, 7]]);
    def.thrownKO = lethal;
    def.pendingSlam = { token, dmg };
    def.flash(0.6);
    sfx.grab();
    this.schedule(THROW_SLAM, () => this.slamFx(def));
    if (!lethal) this.delayEvents(0.95);
  }

  slamFx(def) {
    const info = def.pendingSlam;
    if (!info) return;
    def.pendingSlam = null;
    const up = new THREE.Vector3(0, 1, 0);
    const p = this.stage3d.worldToLocal(def.root.getWorldPosition(new THREE.Vector3()));
    const x = p.x - def.facing * 0.05;
    this.shock.spawn(x, 0.01, 0, up, 'xr-fight-rim', 0.34, 0.75);
    this.shock.spawn(x, 0.012, 0, up, info.token, 0.2, 0.5);
    this.arena.userData.ripple(x, 1.7, def === this.ai ? 1 : 0);
    const floor = this.stage3d.localToWorld(new THREE.Vector3(x, 0.03, 0));
    this.burst(floor, info.token, 44);
    this.room.ripple(floor.clone().setY(this.engine.floorY), hex(info.token), 0.8);
    if (info.dmg) this.popNumber(`-${info.dmg}`, new THREE.Vector3(x, 0.22, 0), 'xr-fight-energy');
    def.flash(1);
    sfx.crash();
    sfx.thud();
    this.hitStop(0.12);
  }

  /**
   * The look of a special move from att to def: a beam (Nova, VOLT-7's shock, OMEGA's laser),
   * sonar rings (Echo), a volley of snowballs (Santa) or a boulder in a high arc (GRANIT).
   */
  specialFx(att, def, kind, tokenIn) {
    const fx = SPECIALS[kind]?.fx ?? 'beam';
    const token = SPECIALS[kind]?.token ?? tokenIn;
    const stage = this.stage3d;
    const from = () => stage.worldToLocal(att.chestPos());
    const to = () => stage.worldToLocal(def.chestPos());
    if (fx === 'beam') {
      this.beamFx = { from: att, to: def, token, t: 0.45 };
      this.beam.userData.mat.uniforms.uColor.value.setHex(hex(token));
      return;
    }
    if (fx === 'rings') {
      // Sonar: rings of sound that grow on their way over the table.
      sfx.sonar();
      for (let i = 0; i < 6; i++) {
        this.schedule(i * 0.05, () => {
          const a = from();
          const p = a.lerp(to(), (i + 1) / 7);
          this.shock.spawn(p.x, p.y, p.z, new THREE.Vector3(1, 0, 0), token, 0.06 + i * 0.03, 0.45);
        });
      }
      return;
    }
    // Snowballs, a present or a boulder: thrown in an arc, burst on arrival.
    const rock = fx === 'rock';
    const gift = fx === 'gift';
    const n = rock || gift ? 1 : 5;
    const geo = rock ? new THREE.IcosahedronGeometry(0.06, 1) : gift ? new THREE.BoxGeometry(0.08, 0.08, 0.08) : new THREE.SphereGeometry(0.022, 12, 8);
    const mat = new THREE.MeshStandardMaterial({ color: hex(rock ? 'xr-fight-rock' : gift ? 'xr-xmas-red' : 'xr-snow'), roughness: rock ? 0.9 : gift ? 0.5 : 1, flatShading: rock });
    const burstToken = rock ? 'xr-fight-rock' : gift ? 'xr-xmas-gold' : 'xr-snow';
    for (let i = 0; i < n; i++) {
      const ball = new THREE.Mesh(geo, mat);
      if (gift) {
        // Gold ribbon around the present.
        const band = new THREE.MeshStandardMaterial({ color: hex('xr-xmas-gold'), metalness: 1, roughness: 0.3 });
        ball.add(new THREE.Mesh(new THREE.BoxGeometry(0.084, 0.084, 0.018), band), new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.084, 0.084), band));
      }
      ball.userData.noFit = true;
      const spread = rock ? 0 : (i - 2) * 0.03;
      stage.add(ball);
      const t0 = i * 0.07;
      this.tween(t0 + 0.42, (k) => {
        const u = Math.max(0, Math.min(1, (k * (t0 + 0.42) - t0) / 0.42));
        const a = from();
        const b = to();
        ball.visible = u > 0;
        ball.position.lerpVectors(a, b, u);
        ball.position.y += Math.sin(u * Math.PI) * (rock || gift ? 0.3 : 0.12) + spread * (1 - u);
        ball.position.z += spread;
        ball.rotation.set(u * 9, u * 7, 0);
      }, {
        ease: (k) => k,
        onDone: () => {
          this.burst(stage.localToWorld(ball.position.clone()), burstToken, rock || gift ? 30 : 10);
          ball.removeFromParent();
          if (i === n - 1) { geo.dispose(); mat.dispose(); }
        },
      });
    }
    sfx.whoosh();
  }

  /** Pushes all pending events (next moves, end of turn) back. */
  delayEvents(seconds) {
    for (const e of this.events) e.at += seconds;
  }

  endTurn() {
    if (this.mode !== 'execute') return;
    this.round += 1;
    const hits = this.lastTurn.filter((r) => r.hit).length;
    if (hits >= 2) this.announcer.say('fightCallRead', {}, this.opp.token);
    this.programPhase();
  }

  ko() {
    this.mode = 'ko';
    this.events = [];
    this.ex = null;
    this.cw = null;
    this.hideTell();
    this.hideCoach();
    this.moveButtons?.forEach((b) => { if (b.parent) b.userData.setDisabled(true); });
    const youWin = this.hp.a <= 0 && this.hp.p > 0;
    const loser = youWin ? this.ai : this.player;
    const winner = youWin ? this.player : this.ai;
    loser.ko = true;
    const thrown = loser.thrownKO;
    // A lethal throw already plays the fall; its slam effects were cleared with the events.
    if (thrown) this.schedule(THROW_SLAM, () => this.slamFx(loser));
    else loser.play([['hitBack', 0.14, 22], ['stumble', 0.26, 12], ['sit', 0.32, 10], ['lie', 0.38, 9], ['koBounce', 0.12, 16], ['ko', 99, 8]]);
    // Dust, a floor ring and a thud when the body touches down (seat, then back).
    for (const [at, size, big] of thrown ? [] : [[0.5, 0.16, false], [0.86, 0.26, true]]) {
      this.schedule(at, () => {
        const p = this.stage3d.worldToLocal(loser.root.getWorldPosition(new THREE.Vector3()));
        const x = p.x + loser.facing * -0.06 * (big ? 2 : 1);
        this.shock.spawn(x, 0.01, 0, new THREE.Vector3(0, 1, 0), 'xr-fight-rim', size, 0.7);
        this.arena.userData.ripple(x, big ? 1.6 : 0.9, loser === this.ai ? 1 : 0);
        this.burst(this.stage3d.localToWorld(new THREE.Vector3(x, 0.03, 0)), 'xr-fight-rim', big ? 26 : 14);
        sfx.thud();
      });
    }
    winner.won = true;
    this.schedule(thrown ? 1.0 : 0.5, () => winner.play([['victory', 99, 6]]));
    this.timeScale = 0.25;
    this.slowUntil = this.time + 1.8;
    this.arena.userData.flash(1.5);
    // The K.O. shock wave runs over the real floor and up the walls.
    const below = this.stage3d.getWorldPosition(new THREE.Vector3()).setY(this.engine.floorY);
    this.room.ripple(below, hex(youWin ? 'xr-fight-player' : this.opp.token), 1);
    this.schedule(0.86, () => this.room.ripple(below, hex('xr-fight-rim'), 0.8));
    this.announcer.say('fightCallKO', {}, 'xr-fight-energy', { priority: true, clips: youWin ? ['fantastisch', 'dudominierst'] : ['duverlierst'] });
    sfx.finish();
    // Results only after the knockdown animation has played out.
    this.schedule(1.9, () => {
      if (youWin) {
        this.wins += 1;
        const bonus = 300 + this.hp.p * 5 + this.stage * 250 + (this.hp.p === PLAYER_HP ? 300 : 0);
        this.totalScore += bonus;
        this.redrawBoard();
        if (this.stage + 1 < STAGES) this.between();
        else this.finish(true);
      } else {
        this.totalScore += Math.round((this.opp.hp - this.hp.a) * 3);
        this.finish(false);
      }
    });
  }

  /** Between two robots: who is next and what is new about it; on with a key, a click, or by itself. */
  between() {
    this.mode = 'between';
    const next = FIGHT_OPPONENTS[this.stage + 1];
    this.clearLayer();
    this.board.visible = !this.flat; // the browser shows the panel in its place
    const kind = next.specialMove;
    const p = this.add(textPanel(0.98, 0.2, [
      { text: t('fightBeat', { name: this.opp.name }), size: 'xr-text-lg', weight: 'black', color: color('xr-fight-player'), gap: 0.01 },
      { text: `${t('score')}: ${this.totalScore}`, size: 'xr-text-sm', color: color('xr-panel-muted'), gap: 0.02 },
      { text: t(next.boss ? 'fightNextBoss' : 'fightNextUp', { name: next.name }), size: 'xr-text-md', weight: 'bold', color: color(next.boss ? 'xr-danger' : 'xr-panel-text'), gap: 0.01 },
      // Something new with every robot (real time): feints, then speed.
      ...(this.liveMode ? [{ text: t(`fightNew_${Math.min(2, this.stage + 1)}`, { name: next.name }), size: 'xr-text-sm', gap: 0.008 }] : []),
      { text: t('fightNextHint', { special: t(`fightSpecial_${kind}`), how: t(`fightSpecialHow_${kind}`) }), size: 'xr-text-sm', color: color('xr-fight-energy') },
    ]));
    // Browser: above the fighters (the winner cheers below it); headset: in front of the table.
    const y0 = this.eye - ARENA_DROP;
    const z = this.flat ? ARENA_Z + 0.1 : -this.dist;
    p.position.set(0, this.flat ? y0 + 0.76 + p.h / 2 : this.eye + 0.02 - p.h / 2, z);
    this.popIn(p);
    const go = this.add(new Button(0.36, 0.12, { label: t('next'), body: this.desk ? t('fightNextKey') : undefined, variant: 'primary', onClick: () => this.nextOpponent() }));
    go.position.set(this.flat ? 0.49 + 0.2 : 0, this.flat ? p.position.y : p.position.y - p.h / 2 - 0.03 - go.h / 2, z);
    this.popIn(go, 0.1);
    this.schedule(0.9, () => this.announcer.say(next.boss ? 'fightCallBoss' : 'fightCallNext', { name: next.name }, next.token, { priority: true }));
    this.schedule(this.easy ? 10 : 6.5, () => this.nextOpponent());
  }

  nextOpponent() {
    if (this.mode === 'between') this.startOpponent(this.stage + 1);
  }

  finish(champion) {
    this.mode = 'over';
    this.board.visible = false;
    music.stop();
    if (champion) this.announcer.say('fightCallChampion', {}, 'xr-fight-energy', { priority: true });
    const acc = this.predLog.length ? Math.round((this.predLog.reduce((a, b) => a + b, 0) / this.predLog.length) * 100) : 0;
    // The rating in three steps, by the points that count (relaxed mode counts a share).
    const score = Math.min(MAX_SCORE, this.totalScore);
    const counted = Math.round(score * assist.scoreFactor);
    let rank = 0;
    while (rank < RANKS.length - 1 && counted >= RANKS[rank + 1]) rank += 1;
    const rankName = t(`fightRank${rank + 1}`);
    // One tip: what cost the most health in this run.
    const st = this.stats;
    let tip = 'good';
    if (!this.liveMode) tip = 'tactic';
    else {
      const missed = st.chances - st.counters;
      const worst = Math.max(st.late, st.feint, st.pair, missed);
      if (worst >= 2 || !champion) tip = worst === st.late ? 'late' : worst === st.feint ? 'feint' : worst === st.pair ? 'pair' : 'counter';
    }
    const portrait = this.flat && window.innerWidth < window.innerHeight;
    this.zoom(!this.flat || portrait ? 1 : this.desk ? 1.2 : 1.35, 0.44);
    this.results({
      gameKey: 'fight', score, correct: this.wins, total: STAGES,
      line: `${champion ? t('fightChampion') : t('fightLost', { name: this.opp.name })}  ·  ${rankName}`,
      learned: [
        { q: t('fightRank', { rank: rankName }), a: rank < RANKS.length - 1 ? t('fightRankNext', { p: RANKS[rank + 1] - counted, rank: t(`fightRank${rank + 2}`) }) : t('fightRankTop') },
        { q: t('fightLessonAcc', { n: acc }), a: t(this.liveMode ? 'fightLessonLiveText' : 'fightLessonText') },
        { q: t('fightTip'), a: t(`fightTip_${tip}`) },
      ],
      onAgain: () => this.again(),
    });
  }

  // ---------- effects ----------

  hitStop(seconds) {
    if (this.mode === 'ko') return;
    this.hitStopUntil = this.time + seconds;
  }

  popNumber(text, local, token) {
    const s = makeNumber(text, token);
    s.position.set(local.x, local.y + 0.15, local.z + 0.02);
    s.userData.life = 1.1;
    this.stage3d.add(s);
    this.numbers.push(s);
  }

  /** A few words that float up at a spot ("Perfekt!", why a hit landed); kept inside the picture. */
  popText(text, local, token, life = 1.3) {
    const s = makeLabel(text, token);
    s.position.set(Math.max(-0.36, Math.min(0.36, local.x)), local.y, local.z + 0.04);
    s.userData.life = life;
    this.stage3d.add(s);
    this.numbers.push(s);
  }

  showMoveIcons(pm, am) {
    for (const [m, x, token, kind] of [[pm, -GAP, 'xr-fight-player', this.kindP], [am, GAP, this.opp.token, this.kindA]]) {
      if (m === 'idle') continue; // no move chosen in time
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const ctx = c.getContext('2d');
      ctx.fillStyle = color('xr-fight-hud');
      ctx.beginPath();
      ctx.arc(64, 64, 58, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 6;
      ctx.strokeStyle = color(token);
      ctx.stroke();
      drawIcon(ctx, iconFor(m, kind), 64, 64, 70, color(m === 'special' ? 'xr-fight-energy' : token));
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
      s.scale.setScalar(0.1);
      s.renderOrder = 25;
      s.userData.noFit = true;
      s.position.set(x, 0.92, 0);
      s.userData.life = BEAT * 0.95;
      s.userData.icon = true;
      this.stage3d.add(s);
      this.numbers.push(s);
    }
  }

  schedule(delay, fn) {
    this.events.push({ at: this.gt + delay, fn });
  }

  // ---------- frame loop ----------

  update(dt) {
    this.time += dt;
    if (this.hitStopUntil && this.time > this.hitStopUntil) this.hitStopUntil = 0;
    if (this.slowUntil && this.time > this.slowUntil) this.slowUntil = 0;
    // Time eases: it drops quickly into a hit freeze / K.O. slow motion and glides back to normal.
    const wantScale = this.hitStopUntil ? 0.1 : this.slowUntil ? 0.25 : 1;
    this.timeScale += (wantScale - this.timeScale) * (1 - Math.exp(-dt * (wantScale < this.timeScale ? 45 : 9)));
    const gdt = dt * this.timeScale;
    this.gt += gdt;
    this.stage3d.position.y = this.eye - ARENA_DROP;
    this.placePanels(); // phones: follows the screen orientation
    this.updateTell();
    this.readGestures(dt);
    this.livePad?.show(this.mode === 'live');
    this.room.setPool(this.stage3d.getWorldPosition(this.room.pool.position.clone()), hex('xr-fight-rim'), 0.3 + (this.slowUntil ? 0.3 : 0), 2.2);
    this.room.update(dt);
    this.board.position.y = this.eye - ARENA_DROP + HUD_UP;
    if (this.menuBtn) this.menuBtn.position.y = this.board.position.y + 0.06;
    // Scheduled events in game time
    const due = this.events.filter((e) => e.at <= this.gt);
    if (due.length) {
      this.events = this.events.filter((e) => e.at > this.gt);
      due.sort((a, b) => a.at - b.at).forEach((e) => e.fn());
    }
    // Real time: a feint shows, the announcement ends, the chance to counter passes.
    if (this.mode === 'live') {
      const ex = this.ex;
      if (ex) {
        if (ex.revealAt && !ex.revealed && this.gt >= ex.revealAt) this.revealFeint(ex);
        if (this.gt >= ex.end) this.resolveExchange();
      } else if (this.cw && this.gt >= this.cw.end) this.closeCounter();
    }
    this.player.update(gdt);
    tickHolo(this.holoP, dt, this.time, this.player.root);
    if (this.ai) tickHolo(this.holoA, dt, this.time + 1.7, this.ai.root);
    // The table stands on the real floor.
    const sw = this.stage3d.getWorldPosition(new THREE.Vector3());
    this.arena.userData.setFloor(this.stage3d.worldToLocal(sw.setY(this.engine.floorY)).y);
    this.ai?.update(gdt);
    if (this.snow) {
      const floor = this.engine.floorY - this.engine.root.position.y;
      const p = this.stage3d.position;
      this.snow.setGround(floor);
      this.snow.setDisc(p.x, p.z, ARENA_R * 1.13, p.y + 0.004);
      this.cover.setGround(floor);
      this.snow.update(dt);
      this.cover.update(dt);
      setSnowAmount(0.35 + 0.65 * snowSettled());
    }
    this.arena.userData.update(gdt, this.gt);
    this.shock.update(gdt);
    this.dust.userData.tick(dt);
    this.announcer.update(dt);
    // Results stand in front of the arena: always draw them on top of the fighters.
    if (this.mode === 'over') {
      this.layer.traverse((o) => {
        if (!o.material || o.userData.onTop) return;
        o.material.depthTest = false;
        o.renderOrder = 100;
        o.userData.onTop = true;
      });
    }
    // Light pulses follow the fighters' flashes
    this.lightP.intensity = 0.8 + this.player.flashT * 2;
    if (this.ai) this.lightA.intensity = 0.8 + this.ai.flashT * 2;
    // Hand trails while striking
    const stage = this.stage3d;
    [[this.player, 'xr-fight-player'], [this.ai, this.opp?.token]].forEach(([f, token], i) => {
      if (!f) return;
      const name = Object.keys(POSES).find((k) => POSES[k] === f.tgt) ?? '';
      const kick = name === 'kick' || name === 'kickWind';
      const tip = stage.worldToLocal(kick ? f.footPos('r') : f.fistPos('r'));
      const active = ['punch', 'kick', 'throwGrab', 'throwSlam', 'fire'].includes(name);
      this.trails[i].update(tip, new THREE.Color(hex(token ?? 'xr-fight-player')), active ? 1 : 0, 1);
    });
    // Special beam
    if (this.beamFx) {
      const b = this.beamFx;
      b.t -= gdt;
      const from = stage.worldToLocal(b.from.fistPos('r').lerp(b.from.fistPos('l'), 0.5));
      const to = stage.worldToLocal(b.to.chestPos());
      const a = Math.max(0, Math.min(1, b.t / 0.15));
      this.beam.userData.set(from, to, a, this.gt);
      const orb = this.beam.userData.orb;
      orb.position.copy(from);
      orb.material.color.setHex(hex(b.token));
      orb.material.opacity = a;
      orb.scale.setScalar(0.12 + Math.sin(this.gt * 30) * 0.02);
      if (b.t <= 0) { this.beamFx = null; this.beam.visible = false; orb.material.opacity = 0; }
    }
    // Shields fade
    this.shields.forEach((s) => { s.material.opacity = Math.max(0, s.material.opacity - dt * 1.8); s.rotation.x += dt * 2; });
    // Floating numbers and move icons
    for (const s of this.numbers.slice()) {
      s.userData.life -= gdt;
      if (!s.userData.icon) s.position.y += gdt * 0.12;
      s.material.opacity = Math.min(1, s.userData.life * 2.5);
      if (s.userData.life <= 0) {
        s.removeFromParent();
        s.material.map?.dispose();
        s.material.dispose();
        this.numbers = this.numbers.filter((x) => x !== s);
      }
    }
  }

  dispose() {
    this.mode = 'over';
    window.removeEventListener('keydown', this.onKey);
    this.app.echo?.suppress(false);
    music.stop();
    this.announcer.stop();
    this.room?.dispose();
    super.dispose();
    this.envTarget?.dispose(); // after the look is restored (onSceneDispose)
  }
}
