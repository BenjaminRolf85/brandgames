// "AI Arena": a fighting game on a holographic platform in your room, in two modes.
// Real time (main mode): the robot announces every attack for a moment (wind-up, its move over
// its head, a shrinking ring) and you react in time; good timing is "perfect". The AI learns how
// you answer each of its attacks and, from the second robot on, feints: it shows one attack
// and throws another that your habit does not stop. In the headset you can punch with your
// hand, raise both hands to block and really duck. Tactics: program three moves with buttons,
// then both fighters act at the same time; the AI learns which moves you tend to choose (per
// position and after which move) and counters them.
// Moves: punch and kick beat a throw, block stops punch and kick, ducking dodges punch and throw
// (but a kick hits low), throw breaks a block. Every fighter has a special move of its own (full
// energy), each stopped or weakened by other moves (SPECIALS).
import * as THREE from 'three';
import { BaseScene, layoutRow } from '../scene.js';
import { Panel, textPanel, placeOnArc } from '../ui3d.js';
import { color, hex, num, font } from '../tokens.js';
import { t } from '../i18n.js';
import { sfx } from '../sfx.js';
import { FIGHT_OPPONENTS } from '../content.js';
import { Fighter, POSES, makeArena, makeBeam, makeNumber } from '../fight-visuals.js';
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

const MOVES = ['punch', 'kick', 'block', 'duck', 'throw', 'special'];
const ICON = { punch: 'punch', kick: 'kick', block: 'block', duck: 'duck', throw: 'throw', special: 'special' };
// The AI's answer to a move it expects (the player's special: see SPECIALS[kind].counter).
const COUNTER = { punch: 'duck', kick: 'block', block: 'throw', duck: 'kick', throw: 'punch' };
// Real-time mode: how long the robot announces its attack (per stage), the attacks it can show
// and the keys on a keyboard (1-6 like the order of the buttons).
const TELL = [1.2, 1.0, 0.85];
const ATTACKS = ['punch', 'kick', 'throw'];
const KEYS = { 1: 'punch', 2: 'kick', 3: 'block', 4: 'duck', 5: 'throw', 6: 'special' };
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
const HUD_UP = 0.98; // scoreboard height above the platform
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
  let hover = false;
  let disabled = false;
  const p = new Panel(w, h, (ctx, c) => draw(ctx, c, { hover, disabled }));
  p.userData.interactive = true;
  p.userData.setHover = (v) => { hover = v; p.scale.setScalar(v && !disabled ? num('xr-hover-scale') : 1); p.redraw(); };
  p.userData.setDisabled = (v) => { if (disabled !== v) { disabled = v; p.redraw(); } };
  p.userData.isDisabled = () => disabled;
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
    this.model = new MoveModel();
    this.lastPlayerMove = -1;
    this.predLog = [];
    this.moveCount = Object.fromEntries(MOVES.map((m) => [m, 0]));
    this.announcer = new Announcer(this);
    try { this.liveMode = localStorage.getItem(MODE_KEY) !== 'tactic'; } catch { this.liveMode = true; }
    // Real-time mode on a keyboard: 1 to 6.
    this.onKey = (e) => {
      const m = KEYS[e.key];
      if (m && this.mode === 'live') { e.preventDefault(); this.liveMove(m); }
    };
    window.addEventListener('keydown', this.onKey);
    this.buildArena();
    // AR: room scan, light pool, shock waves over the real floor and light tiles under your feet.
    this.room = new ARRoom(this, { scan: 'xr-fight-rim', grid: 'xr-fight-player', tileEdge: 'xr-fight-rim', tileLit: 'xr-fight-player' });
    this.room.onStep = () => sfx.step();
    this.onUpdate((dt) => this.update(dt));
    this.showIntro();
  }

  // ---------- arena ----------

  buildArena() {
    const stage = (this.stage3d = new THREE.Group());
    stage.position.set(0, this.eye - ARENA_DROP, ARENA_Z);
    this.group.add(stage);
    this.arena = makeArena(ARENA_R, 'xr-fight-player', FIGHT_OPPONENTS[0].token);
    stage.add(this.arena);
    // Phones: the view frames the table top and the fighters (the foot reaches down to the floor).
    if (this.engine.touchUI) this.arena.userData.foot.forEach((o) => { o.userData.noFit = true; });
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
    this.hud = new Panel(1.1, 0.17, (ctx, c) => this.drawHud(ctx, c));
    this.hud.position.set(0, this.eye - ARENA_DROP + HUD_UP, ARENA_Z - 0.25);
    this.group.add(this.hud);

    this.envTarget = makeEnvironment(this.engine.renderer);
    this.prevEnvironment = this.engine.scene.environment;
    this.engine.scene.environment = this.envTarget.texture;
  }

  /** Hologram projection: the figure grows up from the table with a flicker. */
  projectIn(root, delay) {
    root.visible = false;
    this.schedule(delay, () => {
      root.visible = true;
      root.scale.set(1, 0.01, 1);
      sfx.appear();
      this.tween(0.55, (k) => {
        root.scale.set(1 + (1 - k) * 0.15 * Math.sin(k * 40), Math.max(0.01, k), 1);
        root.visible = k > 0.95 || Math.sin(k * 60) > -0.6;
      }, { onDone: () => { root.scale.set(1, 1, 1); root.visible = true; } });
    });
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
    if (this.hud?.isMesh) this.hud.redraw(); // the HUD panel exists once the arena is built
  }

  setOpponent(i) {
    this.stage = i;
    this.opp = FIGHT_OPPONENTS[i];
    if (this.ai) this.ai.root.removeFromParent();
    this.ai = new Fighter({ style: this.opp.style, token: this.opp.token, facing: -1 });
    if (CHRISTMAS) grumpyHat(this.ai); // the robots wear grumpy green hats
    this.ai.root.position.x = GAP;
    this.stage3d.add(this.ai.root);
    holoize(this.ai.root, this.holoA);
    this.ai.onModel = () => holoize(this.ai.root, this.holoA); // e.g. when the gloves arrive
    this.lightA.color.setHex(hex(this.opp.token));
    this.arena.userData.uniforms.uRight.value.setHex(hex(this.opp.token));
    this.hp = { p: PLAYER_HP, a: this.opp.hp };
    this.energy = { p: 0, a: 0 };
    this.player.ko = false;
    this.player.won = false;
    this.player.thrownKO = false;
    this.player.play([]);
    this.round = 1;
    this.hud.redraw();
  }

  // ---------- flow ----------

  showIntro() {
    this.clearLayer();
    // The table is empty until the fight starts; then the figures are projected in.
    this.player.root.visible = false;
    if (this.ai) this.ai.root.visible = false;
    const { eye, dist } = this;
    const p = this.add(textPanel(1.15, 0.3, [
      { text: t('fightName'), size: 'xr-text-title', weight: 'black', gap: 0.015 },
      { text: t(`${EVENT ? 'fightIntroEvent' : 'fightIntro'}${CHRISTMAS ? 'Xmas' : ''}`), size: 'xr-text-sm', color: color('xr-panel-muted'), gap: 0.015 },
      { text: t('fightRules'), size: 'xr-text-sm', weight: 'bold', gap: 0.015 },
      { text: FIGHT_OPPONENTS.slice(0, STAGES).map((o) => o.name).join('  ·  '), size: 'xr-text-sm', weight: 'black', color: color('xr-fight-energy') },
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
        this.liveMode = key === 'live';
        try { localStorage.setItem(MODE_KEY, key); } catch { /* private mode */ }
        modes.forEach((m) => m.redraw());
      };
      tile.position.set((i - 0.5) * 0.55, modeY - 0.05, -dist);
      this.add(tile);
      this.popIn(tile, 0.06 + i * 0.04);
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

  startOpponent(i) {
    this.setOpponent(i);
    this.projectIn(this.ai.root, 0.2);
    if (!this.player.root.visible) this.projectIn(this.player.root, 0);
    this.hud.visible = true;
    this.clearLayer();
    this.mode = 'intro-fight';
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
    this.placePanels();
    this.ex = null;
    this.combo = 0;
    this.resp ??= {}; // the AI's memory: how you answer what it shows (kept over all robots)
    this.feints ??= 0;
    this.perfects ??= 0;
    // Phones: big buttons for the thumbs instead of the small 3D ones.
    if (this.engine.touchUI) {
      this.console.visible = false;
      // Attacks in one group (left thumb), defence and the special in the other (right thumb).
      const group = { punch: 'left', kick: 'left', throw: 'left', block: 'right', duck: 'right', special: 'right' };
      const order = ['punch', 'kick', 'throw', 'block', 'duck', 'special'];
      this.livePad ??= this.touchButtons(order.map((m) => ({ icon: iconFor(m, this.kindP), label: this.moveLabel(m), onPress: () => this.liveMove(m), primary: m === 'punch', group: group[m] })), { grid: true });
      this.livePadOrder = order;
      this.refreshConsole();
    }
    this.announcer.say('fightCallLive', {}, 'xr-fight-energy');
    this.schedule(1.0, () => this.nextExchange());
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
   * The robot's next move. It defends now and then (guessing your attack), else attacks with
   * what your habits do not stop; from the second robot on it may show one attack and throw
   * another (a feint), and with full energy it fires its special.
   */
  liveAI() {
    const opp = this.opp;
    const kp = this.kindP;
    const ka = this.kindA;
    const smart = Math.random() < opp.predict;
    if (this.energy.a >= 100 && Math.random() < opp.special) return { am: 'special', show: 'special' };
    // Defend: when it expects you to attack while it shows nothing.
    if (Math.random() < 0.22) {
      const guess = this.expected('none');
      const am = smart && guess && guess !== 'idle' ? (guess === 'special' ? SPECIALS[kp].counter : COUNTER[guess] ?? 'block') : Math.random() < 0.5 ? 'block' : 'duck';
      if (am === 'block' || am === 'duck') return { am, show: null };
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
    if (this.stage > 0 && Math.random() < 0.18 + 0.14 * this.stage) {
      const fakes = ATTACKS.filter((s2) => s2 !== am && this.expected(s2) && hurts(am, this.expected(s2)));
      if (fakes.length) show = fakes[Math.floor(Math.random() * fakes.length)];
    }
    return { am, show };
  }

  nextExchange() {
    if (this.mode !== 'live') return;
    const { am, show } = this.liveAI();
    const T = (TELL[this.stage] ?? 0.7) * (am === 'special' ? 1.25 : 1);
    const ex = { am, show, seen: show, T, t0: this.gt, pm: null, at: 0, predicted: this.expected(show ?? 'none') };
    this.ex = ex;
    // A feint: halfway through, the real attack shows. Who reacts too early is fooled; who waits
    // for it has less time left.
    if (show && show !== am) {
      this.schedule(T * 0.5, () => {
        if (this.ex !== ex) return;
        ex.seen = am;
        this.feints += 1;
        this.showTell(am, true);
        this.ai.play([[am === 'special' ? 'charge' : 'guard2', T * 0.5, 14]]);
        this.announcer.say('fightCallFeint', {}, this.opp.token);
        sfx.whoosh();
        this.insights?.redraw();
      });
    }
    if (show) {
      // The tell: the robot gets ready and its move appears over its head with a shrinking ring.
      this.ai.play([[show === 'special' ? 'charge' : 'guard2', T, 9]]);
      this.showTell(show);
    } else this.ai.play([['guard', T, 9]]); // waiting: it watches what you do
    this.insights?.redraw();
    this.refreshConsole();
    this.schedule(T, () => this.resolveExchange());
  }

  /** Your move in real time (button, key or gesture): one per attack. */
  liveMove(m) {
    const ex = this.ex;
    if (this.mode !== 'live' || !ex || ex.pm) return;
    if (m === 'special' && this.energy.p < 100) { sfx.wrong(); return; }
    ex.pm = m;
    ex.at = (this.gt - ex.t0) / ex.T;
    ex.answered = ex.seen ?? 'none'; // what you were reacting to
    this.moveCount[m] += 1;
    sfx.click();
    // Defending shows at once (block up, duck down) and holds until the attack is over.
    if (m === 'block' || m === 'duck') this.player.play([[m, ex.T * (1 - ex.at) + 0.7, 16]]);
    this.refreshConsole();
  }

  resolveExchange() {
    const ex = this.ex;
    if (this.mode !== 'live' || !ex) return;
    this.ex = null;
    this.hideTell();
    const pm = ex.pm ?? 'idle';
    const kp = this.kindP;
    const ka = this.kindA;
    // The AI remembers how you answered what you saw (older answers fade).
    const r = this.respOf(ex.pm ? ex.answered : ex.show ?? 'none');
    for (const k of Object.keys(r)) r[k] *= 0.85;
    r[pm] += 1;
    this.predLog.push(ex.predicted && ex.predicted === pm ? 1 : 0);
    const attack = ex.am !== 'block' && ex.am !== 'duck';
    const stopped = attack && damage(ex.am, pm, ka, kp) === 0 && pm !== 'special';
    // Perfect: stopped it late, after the moment a feint would have shown. A perfect block or
    // duck also lands a quick counter.
    const perfect = stopped && ex.at > 0.5;
    const counter = perfect && (pm === 'block' || pm === 'duck') ? 6 : 0;
    const toA = damage(pm, ex.am, kp, ka) + counter;
    this.lastLive = { shown: ex.show, am: ex.am, pm, stopped };
    this.beat(pm, ex.am, 1);
    this.schedule(IMPACT + 0.05, () => {
      if (this.mode !== 'live') return;
      const at = this.stage3d.worldToLocal(this.player.chestPos());
      if (perfect) {
        this.perfects += 1;
        this.energy.p = Math.min(100, this.energy.p + 15);
        this.totalScore += 25;
        this.popNumber(t('fightPerfect'), at.clone().add(new THREE.Vector3(0, 0.12, 0)), 'xr-fight-energy');
        sfx.powerup();
        if (counter) {
          this.hp.a = Math.max(0, this.hp.a - counter);
          this.ai.flash(1);
          this.ai.play([['hit', 0.3, 20], ['guard', 0.2, 10]]);
          this.player.play([['punch', 0.35, 18], ['guard', 0.2, 10]]);
          this.popNumber(`-${counter}`, this.stage3d.worldToLocal(this.ai.chestPos()), 'xr-fight-player');
          sfx.hit();
          if (this.hp.a <= 0) { this.ko(); return; }
        }
      }
      // Combos: hits in a row without being hit.
      if (toA > 0 && damage(ex.am, pm, ka, kp) === 0) {
        this.combo += 1;
        this.totalScore += 5 * this.combo;
        if (this.combo >= 3) this.popNumber(t('fightCombo', { n: this.combo }), at.clone().add(new THREE.Vector3(0, 0.22, 0)), 'xr-fight-player');
      } else if (damage(ex.am, pm, ka, kp) > 0) this.combo = 0;
      this.hud.redraw();
    });
    this.schedule(IMPACT + 0.9, () => this.nextExchange());
  }

  /** The robot's announced move over its head and a ring that shrinks until it strikes. */
  showTell(move, swap = false) {
    if (!this.tell) {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const icon = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
      icon.scale.setScalar(0.11);
      icon.renderOrder = 26;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.075, 0.084, 48), new THREE.MeshBasicMaterial({ color: hex('xr-fight-energy'), transparent: true, depthTest: false, side: THREE.DoubleSide }));
      ring.renderOrder = 27;
      const g = new THREE.Group();
      g.add(icon, ring);
      g.userData.noFit = true;
      this.stage3d.add(g);
      this.tell = { g, icon, ring, c, tex };
    }
    const { c, tex, g } = this.tell;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = color('xr-fight-hud');
    ctx.beginPath();
    ctx.arc(64, 64, 58, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = color(this.opp.token);
    ctx.stroke();
    drawIcon(ctx, iconFor(move, this.kindA), 64, 64, 70, color(move === 'special' ? 'xr-fight-energy' : this.opp.token));
    tex.needsUpdate = true;
    g.position.set(GAP, 0.8, 0.04);
    g.visible = true;
    // A feint turning into the real attack: the icon pops.
    if (swap) this.tween(0.25, (k) => this.tell.icon.scale.setScalar(0.11 * (1 + 0.5 * Math.sin(Math.PI * k))));
  }

  hideTell() {
    if (this.tell) this.tell.g.visible = false;
  }

  /** The tell ring shrinks and gets hotter as the strike comes; the ring faces the viewer. */
  updateTell() {
    const tell = this.tell;
    if (!tell?.g.visible || !this.ex) return;
    const k = Math.min(1, (this.gt - this.ex.t0) / this.ex.T);
    tell.ring.scale.setScalar(1.5 - 0.6 * k);
    tell.ring.material.color.setHex(hex(k > 0.6 ? 'xr-danger' : 'xr-fight-energy'));
    tell.ring.quaternion.copy(this.engine.camera.getWorldQuaternion(new THREE.Quaternion())).premultiply(this.stage3d.getWorldQuaternion(new THREE.Quaternion()).invert());
  }

  /**
   * In the headset (real time): punch with a quick thrust of a hand towards the table, raise
   * both hands in front of the face to block, and really duck (head clearly below its usual
   * height). Kick, throw and the special stay on the buttons.
   */
  readGestures(dt) {
    const e = this.engine;
    if (!e.isXR || this.mode !== 'live' || !this.ex || this.ex.pm || !e.head.valid) return;
    const head = e.head.pos;
    // Usual head height: follows quickly upwards, only slowly downwards.
    if (this.headBase === undefined) this.headBase = head.y;
    this.headBase += (head.y - this.headBase) * Math.min(1, dt * (head.y > this.headBase ? 3 : 0.12));
    if (this.headBase - head.y > 0.2) { this.liveMove('duck'); return; }
    const toTable = this.stage3d.getWorldPosition(new THREE.Vector3()).sub(head).setY(0).normalize();
    this.handPrev ??= new Map();
    const hands = [];
    for (const p of e.pointers) {
      if (p.kind !== 'xr' || !p.active || !p.controller) continue;
      const pos = new THREE.Vector3().setFromMatrixPosition(p.controller.matrixWorld);
      hands.push(pos);
      const prev = this.handPrev.get(p);
      this.handPrev.set(p, pos.clone());
      if (!prev) continue;
      const v = pos.clone().sub(prev).divideScalar(Math.max(dt, 1e-3));
      if (v.dot(toTable) > 1.7 && pos.distanceTo(head) > 0.3) { this.liveMove('punch'); return; }
    }
    if (hands.length >= 2 && hands.every((h) => h.distanceTo(head) < 0.33 && h.y > head.y - 0.3)) this.liveMove('block');
  }

  /**
   * Phones: the move console and the AI's insights face the screen. Portrait: the console below
   * the table, the insights above the scoreboard. Landscape: left and right of the table. In the
   * headset they stay on the arc around the player.
   */
  placePanels() {
    if (!this.engine.touchUI) return;
    const portrait = window.innerWidth < window.innerHeight;
    const y0 = this.eye - ARENA_DROP;
    // Larger than in the headset, so the buttons are easy to hit with a finger.
    if (this.console?.parent) {
      this.console.rotation.set(0, 0, 0);
      this.console.scale.setScalar(portrait ? 1.55 : 1.3);
      if (portrait) this.console.position.set(0, y0 - 0.5, ARENA_Z + 0.55);
      else this.console.position.set(1.22, y0 + 0.28, ARENA_Z + 0.25);
    }
    const ins = this.insights?.parent;
    if (ins) {
      // Real time in landscape: the thumbs' buttons take the lower corners; the insights pause.
      ins.visible = portrait || this.mode !== 'live';
      ins.rotation.set(0, 0, 0);
      ins.scale.setScalar(portrait ? 1.35 : 1.25);
      if (portrait) ins.position.set(0, y0 + HUD_UP + 0.12 + (this.insights.h * 1.35) / 2, ARENA_Z - 0.1);
      else ins.position.set(-1.22, y0 + 0.28, ARENA_Z + 0.25);
    }
  }

  /** The move buttons; live: they act at once (real-time mode), else they fill the 3 slots. */
  buildConsole(live = false) {
    const { eye } = this;
    const g = new THREE.Group();
    placeOnArc(g, 0.8, eye - 0.06, 1.05);
    this.add(g);
    const liveTitle = this.engine.isXR ? 'fightLiveTitleXR' : this.engine.touchUI ? 'fightLiveTitle' : 'fightLiveTitleKeys';
    const title = textPanel(0.66, 0.06, [{ text: live ? t(liveTitle) : t('fightProgram', { n: this.round }), size: 'xr-text-sm', weight: 'black' }], { surface: false });
    title.position.y = 0.2;
    g.add(title);
    // Move buttons
    const bw = 0.118;
    this.moveButtons = MOVES.map((m) => {
      // The special has the fighter's own (longer) name: its button is a little wider.
      const b = iconTile(m === 'special' ? 0.17 : bw, 0.14, (ctx, c, s) => {
        const special = m === 'special';
        const off = s.disabled;
        c.surface({ fill: color(s.hover && !off ? 'xr-button-hover' : 'xr-button-bg'), stroke: color(special ? 'xr-fight-energy' : s.hover ? 'xr-accent' : 'xr-panel-border'), strokeWidth: num('xr-border-width') * (s.hover ? 2 : 1), stripe: false });
        ctx.globalAlpha = off ? 0.35 : 1;
        drawIcon(ctx, iconFor(m, this.kindP), c.canvas.width / 2, c.canvas.height * 0.38, c.m(0.055), color(special ? 'xr-fight-energy' : 'xr-accent'));
        ctx.fillStyle = color('xr-button-text');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        let px = c.m(num('xr-text-sm'));
        const label = this.moveLabel(m);
        do { ctx.font = font('bold', px); px -= 1; } while (ctx.measureText(label).width > c.canvas.width - c.m(0.012) && px > c.m(0.022));
        ctx.fillText(label, c.canvas.width / 2, c.canvas.height * 0.8);
        // Real time on a keyboard: the key in the corner.
        if (live && !this.engine.isXR && !this.engine.touchUI) {
          ctx.font = font('bold', c.m(num('xr-text-min')) * 0.8);
          ctx.fillStyle = color('xr-panel-muted');
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText(String(MOVES.indexOf(m) + 1), c.m(0.008), c.m(0.006));
        }
        ctx.globalAlpha = 1;
      });
      b.userData.label = this.moveLabel(m);
      b.userData.onClick = () => (live ? this.liveMove(m) : this.addMove(m));
      return b;
    });
    layoutRow(this.moveButtons, 0.09, 0, 0.012);
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
      s.userData.label = `slot${i}`;
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
      // Real time: one move per attack; the special needs full energy (Santa's changes after use).
      const off = (i) => !this.ex || !!this.ex.pm || (MOVES[i] === 'special' && this.energy.p < 100);
      this.moveButtons?.forEach((b, i) => b.userData.setDisabled(off(i)));
      const si = MOVES.indexOf('special');
      this.moveButtons?.[si]?.redraw();
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

  /** Left panel: what the AI predicted last turn, its hit rate and the rules. */
  buildInsights() {
    const { eye } = this;
    // Real time: a little taller (what the AI learned per announced move, feints, perfects).
    const panel = new Panel(0.6, this.liveMode ? 0.8 : 0.68, (ctx, c) => this.drawInsights(ctx, c));
    // In a holder, so phones can move and enlarge it while it pops in (placePanels).
    const holder = new THREE.Group();
    holder.add(panel);
    placeOnArc(holder, -0.8, eye - 0.06, 1.05);
    this.add(holder);
    this.popIn(panel, 0.1);
    this.insights = panel;
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
    ctx.font = font('regular', sm * 0.92);
    ctx.fillStyle = color('xr-panel-muted');
    for (const line of t('fightRulesShort').split('\n')) {
      ctx.fillText(line, pad, y, W - 2 * pad);
      y += sm * 1.2;
    }
    // The two special moves and what stops them.
    y += sm * 0.3;
    ctx.font = font('bold', sm * 0.92);
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
   * answer (green if it stops that attack, red if not), then feints, perfect defences, the rules.
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
      // Two cells per line: announced move, arrow, your usual answer.
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
    y += sm * 1.6;
    ctx.font = font('regular', sm * 0.92);
    for (const line of t('fightRulesShort').split('\n')) {
      ctx.fillText(line, pad, y, W - 2 * pad);
      y += sm * 1.2;
    }
    y += sm * 0.3;
    ctx.font = font('bold', sm * 0.92);
    for (const [who, kind, token] of [[this.playerName, this.kindP, 'xr-fight-player'], [this.opp?.name ?? '', this.kindA, this.opp?.token ?? 'xr-fight-energy']]) {
      ctx.fillStyle = color(token);
      for (const line of wrapText(ctx, `${who}: ${t(`fightSpecial_${kind}`)}, ${t(`fightSpecialHow_${kind}`)}`, W - 2 * pad)) {
        ctx.fillText(line, pad, y);
        y += sm * 1.15;
      }
    }
  }

  drawHud(ctx, c) {
    const W = c.canvas.width;
    const H = c.canvas.height;
    ctx.clearRect(0, 0, W, H);
    c.surface({ fill: color('xr-fight-hud'), stroke: color('xr-panel-border'), stripe: false });
    const pad = c.m(0.025);
    const barW = W * 0.38;
    const sides = [
      { name: this.playerName, token: 'xr-fight-player', hp: this.hp?.p ?? PLAYER_HP, max: PLAYER_HP, en: this.energy?.p ?? 0, x: pad, align: 'left' },
      { name: this.opp?.name ?? '', token: this.opp?.token ?? 'xr-fight-player', hp: this.hp?.a ?? 100, max: this.opp?.hp ?? 100, en: this.energy?.a ?? 0, x: W - pad - barW, align: 'right' },
    ];
    for (const s of sides) {
      ctx.textAlign = s.align;
      ctx.textBaseline = 'top';
      ctx.font = font('black', c.m(num('xr-text-md')));
      ctx.fillStyle = color(s.token);
      ctx.fillText(s.name, s.align === 'left' ? s.x : s.x + barW, pad * 0.6);
      // Health bar (drains from the center outwards)
      const by = pad + c.m(0.05);
      const bh = c.m(0.03);
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
      const eh = c.m(0.014);
      ctx.fillStyle = color('xr-fight-dark');
      ctx.fillRect(s.x, ey, barW, eh);
      const e = Math.min(1, s.en / 100);
      ctx.fillStyle = color(e >= 1 ? 'xr-fight-energy' : 'xr-fight-energy-dim');
      if (s.align === 'left') ctx.fillRect(s.x + barW * (1 - e), ey, barW * e, eh);
      else ctx.fillRect(s.x, ey, barW * e, eh);
      ctx.font = font('bold', c.m(0.024));
      ctx.fillStyle = color('xr-panel-muted');
      ctx.fillText(e >= 1 ? t('fightEnergyFull') : t('fightEnergy'), s.align === 'left' ? s.x : s.x + barW, ey + eh + c.m(0.006));
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font('black', c.m(0.06));
    ctx.fillStyle = color('xr-fight-energy');
    ctx.fillText('VS', W / 2, H * 0.42);
    ctx.font = font('bold', c.m(0.024));
    ctx.fillStyle = color('xr-panel-muted');
    if (this.opp) ctx.fillText(t('fightStage', { n: this.stage + 1, total: STAGES }), W / 2, H * 0.78);
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
    this.hud.redraw();
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
    const toP = Math.round(damage(am, pm, ka, kp) * (this.opp.dmg ?? 1));
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
        this.popNumber(t('fightDodge'), stage.worldToLocal(def.chestPos()), 'xr-fight-block');
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
    this.hud.redraw();
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
        if (this.stage + 1 < STAGES) this.between();
        else this.finish(true);
      } else {
        this.totalScore += Math.round((this.opp.hp - this.hp.a) * 3);
        this.finish(false);
      }
    });
  }

  between() {
    this.mode = 'between';
    const next = FIGHT_OPPONENTS[this.stage + 1];
    this.clearLayer();
    const p = this.add(textPanel(0.9, 0.2, [
      { text: t('fightBeat', { name: this.opp.name }), size: 'xr-text-lg', weight: 'black', color: color('xr-fight-player'), gap: 0.015 },
      { text: t(next.boss ? 'fightNextBoss' : 'fightNextUp', { name: next.name }), size: 'xr-text-md', weight: 'bold', color: color(next.boss ? 'xr-danger' : 'xr-panel-text'), gap: 0.01 },
      { text: `${t('score')}: ${this.totalScore}`, size: 'xr-text-sm', color: color('xr-panel-muted') },
    ]));
    p.position.set(0, this.eye + 0.02 - p.h / 2, -this.dist);
    this.popIn(p);
    this.schedule(1.2, () => this.announcer.say(next.boss ? 'fightCallBoss' : 'fightCallNext', { name: next.name }, next.token, { priority: true }));
    this.schedule(4.2, () => { if (this.mode === 'between') this.startOpponent(this.stage + 1); });
  }

  finish(champion) {
    this.mode = 'over';
    this.hud.visible = false;
    music.stop();
    if (champion) this.announcer.say('fightCallChampion', {}, 'xr-fight-energy', { priority: true });
    const fav = MOVES.reduce((a, b) => (this.moveCount[b] > this.moveCount[a] ? b : a), MOVES[0]);
    const total = MOVES.reduce((a, m) => a + this.moveCount[m], 0) || 1;
    const acc = this.predLog.length ? Math.round((this.predLog.reduce((a, b) => a + b, 0) / this.predLog.length) * 100) : 0;
    this.results({
      gameKey: 'fight', score: this.totalScore, correct: this.wins, total: STAGES,
      line: champion ? t('fightChampion') : t('fightLost', { name: this.opp.name }),
      learned: [
        { q: t('fightLearnFav'), a: `${t(`fightMove_${fav}`)} · ${Math.round((this.moveCount[fav] / total) * 100)} %` },
        { q: t('fightLearnAcc'), a: `${acc} %` },
        { q: t('fightLesson'), a: t(this.liveMode ? 'fightLessonLiveText' : 'fightLessonText') },
      ],
      onAgain: () => this.app.startGame('fight'),
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

  showMoveIcons(pm, am) {
    for (const [m, x, token, kind] of [[pm, -GAP, 'xr-fight-player', this.kindP], [am, GAP, this.opp.token, this.kindA]]) {
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
    this.hud.position.y = this.eye - ARENA_DROP + HUD_UP;
    // Scheduled events in game time
    const due = this.events.filter((e) => e.at <= this.gt);
    if (due.length) {
      this.events = this.events.filter((e) => e.at > this.gt);
      due.sort((a, b) => a.at - b.at).forEach((e) => e.fn());
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
    this.engine.scene.environment = this.prevEnvironment ?? null;
    this.envTarget?.dispose();
    this.room?.dispose();
    super.dispose();
  }
}
