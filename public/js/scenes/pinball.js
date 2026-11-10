// "Kampagnen-Flipper" / "Campaign Pinball": a pinball machine in front of you (in AR it stands
// on the real floor at table height). The ball is your message; the channels are poster (the
// advertising column), social media (pop bumpers), e-mail (drop targets), app (right ramp),
// branch office (the saucer at the little house) and video (left ramp). Every hit reaches
// people of the current target group (chosen with the four lanes at the top) and some of them
// respond. The AI campaign planner, a multi-armed bandit with Thompson sampling, learns the
// response rates from these hits, shows its estimates with their uncertainty on a panel and
// lights up the channel it recommends next; following its tip pays a bonus when it was right.
// All six channels with one ball: campaign complete, reach x2 for that ball. 3 balls, ball save at
// the start of each ball, 3 minutes. Own 2D physics (pinball-physics.js) with 1 ms sub-steps.
// Classic extras: four persona standups light an extra ball (collected at the branch), the
// kickback in the left outlane (lit at the start and by the four lanes), a spinner on the top
// arch, in- and outlane rollovers, chimes and solenoid sounds, a match at game over.
import * as THREE from 'three';
import { BaseScene } from '../scene.js';
import { Panel, Button, textPanel, placeOnArc, wrap } from '../ui3d.js';
import { color, hex, num, font } from '../tokens.js';
import { t, L } from '../i18n.js';
import '../pinball-text.js';
import { sfx } from '../sfx.js';
import { music } from '../music.js';
import { quality } from '../quality.js';
import { EVENT } from '../event.js';
import { SPONSOR } from '../content.js';
import { makeEnvironment } from '../robot-visuals.js';
import { WINTER, makeSnowfall, makeSnowCover, setSnowAmount, snowSettled, winterize } from '../snow.js';
import { buildTable, setPlunger, inShooterLane, launchSpeed, CHANNELS, GROUPS, LANE_X, PLUNGER_Y, BALL_R } from '../pinball-layout.js';
import { Planner, makeTruth, respond, rng } from '../pinball-ai.js';
import { loadPinballModel, buildMachine, CH_TOKEN, TARGETS, FUNNEL, drawGlyph, glyphSVG, fp } from '../pinball-visuals.js';
import { ICON } from '../pinball-fx.js';
import { psfx } from '../pinball-sound.js';
import { fmt } from '../pinball-backglass.js';

const BALLS = 3;
const DURATION = EVENT ? 120 : 180; // seconds of campaign time
const SAVE_TIME = 10; // ball save after each launch
const MAX_SCORE = 5000;
const DROP = 0.72; // playfield front below eye height (table height)
const FRONT_Z = -0.4; // playfield front edge in front of the player
const AUTO_LAUNCH = 12; // seconds in the shooter lane before the ball launches by itself
const REPLAN = 15; // seconds before the planner gives a new tip if its tip was not followed
const PULL_TIME = 0.9; // seconds to pull the plunger all the way
const PULL = 0.62; // intro and results: the UI layer is pulled towards the eyes by this factor
const PEOPLE = 50; // people reached per contact (the KPIs on the display)
const CLICKS = 2; // clicks per response
const AWARE = 3000; // funnel: people reached for awareness ...
const INTEREST = 45; // ... then clicks for interest; then a visit to the branch closes the deal
const PERSONA_PTS = 5; // a persona standup
const PERSONAS_PTS = 30; // all four personas (and the extra ball lights, once per game)
const KICK_SPEED = 1.45; // the kickback's shot along its path (m/s)
const clamp = THREE.MathUtils.clamp;
const KEYS = {
  ArrowLeft: 'left', KeyA: 'left', ShiftLeft: 'left', KeyY: 'left', KeyZ: 'left',
  ArrowRight: 'right', KeyL: 'right', ShiftRight: 'right', KeyM: 'right',
  Space: 'plunger', ArrowDown: 'plunger', Enter: 'plunger',
};

export class PinballScene extends BaseScene {
  constructor(app) {
    super(app);
    this.gameKey = 'pinball';
    this.mode = 'intro';
    this.time = 0;
    this.S = num('xr-pinball-scale') || 0.9;
    this.input = { left: false, right: false, plunger: false };
    this.xrHeld = new Map(); // input source -> { select, squeeze }
    this.pull = 0;
    this.popups = [];
    this.envTarget = makeEnvironment(this.engine.renderer);
    this.prevEnvironment = this.engine.scene.environment;
    this.engine.scene.environment = this.envTarget.texture;
    this.table = buildTable();
    this.table.world.paused = true;
    this.table.world.on((type, obj, info) => this.onPhysics(type, obj, info));
    this.setupLights();
    this.setupInput();
    if (WINTER) {
      this.snow = makeSnowfall({ density: 0.55 });
      this.cover = makeSnowCover({ x: 0, z: -0.9, radius: 1.6 });
      this.group.add(this.snow.points, this.cover.mesh);
    }
    this.ready = loadPinballModel().then((model) => {
      if (this.disposed) return;
      this.buildWorld(model);
    }).catch((e) => console.error('pinball model', e));
    this.onUpdate((dt) => this.update(dt));
    this.showIntro();
  }

  // ---------- world ----------

  setupLights() {
    const key = (this.key = new THREE.DirectionalLight(hex('xr-pinball-light'), 1.15));
    key.position.set(0.35, this.eye + 1.2, -0.2);
    key.target.position.set(0, this.eye - DROP, FRONT_Z - 0.5);
    this.group.add(key, key.target);
    if (!quality.lite) {
      const r = this.engine.renderer;
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFSoftShadowMap;
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      Object.assign(key.shadow.camera, { left: -0.55, right: 0.55, top: 0.75, bottom: -0.75, near: 0.3, far: 3.2 });
      key.shadow.camera.updateProjectionMatrix();
      key.shadow.bias = -0.0004;
      key.shadow.normalBias = 0.006;
    }
    // A flasher that lights up where something happens (in the channel's color).
    this.flasher = new THREE.PointLight(hex('xr-pinball-light'), 0, 0.5, 2);
    this.group.add(this.flasher);
  }

  buildWorld(model) {
    const m = (this.machine = buildMachine(this.table, model, { lite: quality.lite }));
    const root = m.root;
    root.scale.setScalar(this.S);
    this.machineY = this.eye - DROP;
    root.position.set(-0.025 * this.S, this.machineY, FRONT_Z);
    this.group.add(root);
    if (WINTER) {
      // Snow on the head's top and on the branch office's roof; the room snow keeps out of the
      // machine (the glass is over the playfield).
      root.traverse((o) => {
        if (!o.isMesh) return;
        for (const mat of [].concat(o.material)) if (mat.name === 'PbRoof' || mat.name === 'PbBody') winterize(mat);
      });
      this.snow.setHole(-0.33, FRONT_Z - 1.3, 0.33, FRONT_Z + 0.12, this.machineY + 1.0);
    }
    // XR and browser: the plunger knob can be grabbed (pull back and let go).
    const knob = (this.knob = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 8), new THREE.MeshBasicMaterial({ visible: false })));
    knob.userData.interactive = true;
    knob.userData.noFit = true;
    knob.userData.label = t('pinballGrab');
    knob.userData.onGrab = (p) => this.grabPlunger(p);
    knob.userData.onRelease = () => this.releasePlunger();
    m.field.add(knob);
    this.placePanels();
    m.dmd.show(t('pinballName').toUpperCase());
    m.setFloor(-10);
  }

  /**
   * The left column: the AI planner's panel (estimates per channel with uncertainty, its tip,
   * explore / exploit) and, in the headset and on desktops, the status and the menu button above
   * it (phones have the status bar on the screen).
   */
  buildPlanPanel() {
    if (!this.column) {
      this.column = new THREE.Group();
      this.group.add(this.column);
    }
    this.planPanel?.removeFromParent();
    this.planPanel?.dispose();
    const compact = this.layoutMode === 'portrait' || this.engine.touchUI;
    const p = (this.planPanel = compact ? new Panel(0.78, 0.36, (ctx, c) => this.drawPlanCompact(ctx, c)) : new Panel(0.66, 0.74, (ctx, c) => this.drawPlan(ctx, c)));
    p.userData.noFit = true;
    this.column.add(p);
    this.planKey = '';
    if (!this.engine.touchUI && !this.status) {
      this.status = textPanel(0.5, 0.2, () => [
        { text: t('pinballStatus1', { score: this.shownScore() }), size: 'xr-text-md', weight: 'black', color: color('xr-pinball-dmd'), gap: 0.006 },
        { text: this.statusLine(), size: 'xr-text-sm', weight: 'bold', gap: 0.004 },
        { text: t('pinballStatus3', { ch: this.chBall?.size ?? 0 }), size: 'xr-text-sm', weight: 'bold', color: color('xr-panel-muted') },
      ], { grow: false, layout: { align: 'left', pad: 0.03 } });
      this.menuBtn = new Button(0.15, 0.2, { label: t('menu'), labelSize: 'xr-text-sm', grow: false, onClick: () => this.menuPressed() });
      this.column.add(this.status, this.menuBtn);
    }
    if (this.status) {
      const y = p.h / 2 + 0.02 + 0.1;
      this.status.position.set(-0.08, y, 0);
      this.menuBtn.position.set(0.255, y, 0);
    }
  }

  /** In the headset a stray pinch must not end the game: during play the menu asks once more. */
  menuPressed() {
    const live = this.mode === 'play' || this.mode === 'ready' || this.mode === 'drain';
    if (this.engine.isXR && live && !(this.menuArmed > this.time)) {
      this.menuArmed = this.time + 3;
      this.menuBtn.opts.label = t('pinballMenuSure');
      this.menuBtn.redraw();
      this.after(3, () => { if (this.menuBtn && !(this.menuArmed > this.time)) { this.menuBtn.opts.label = t('menu'); this.menuBtn.redraw(); } });
      return;
    }
    this.app.showMenu();
  }

  statusLine() {
    const left = Math.max(0, Math.ceil(DURATION - (this.playT ?? 0)));
    const time = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    return t('pinballStatus2', { ball: Math.min(BALLS, this.ballNo ?? 1), balls: BALLS, time });
  }

  // ---------- input ----------

  setupInput() {
    this.onKey = (e) => {
      const k = KEYS[e.code] ?? KEYS[e.key];
      if (!k || this.mode === 'intro' || this.mode === 'over' || this.engine.isXR) return;
      e.preventDefault();
      const down = e.type === 'keydown';
      if (down && e.repeat) return;
      this.setInput(k, down);
    };
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKey);
    // Headset: triggers and squeeze buttons (or pinching) of each hand work the flipper on its side.
    this.xrListeners = [];
    for (let i = 0; i < 2; i++) {
      const ctrl = this.engine.renderer.xr.getController(i);
      for (const [type, kind, on] of [['selectstart', 'select', true], ['selectend', 'select', false], ['squeezestart', 'squeeze', true], ['squeezeend', 'squeeze', false]]) {
        const fn = (e) => this.onXR(e.data, kind, on);
        ctrl.addEventListener(type, fn);
        this.xrListeners.push([ctrl, type, fn]);
      }
    }
    // Phones: big thumb buttons (left, launch, right).
    this.pad = this.touchButtons([
      { icon: '', label: t('pinballLeft'), onPress: () => this.setInput('left', true), onRelease: () => this.setInput('left', false) },
      { icon: '', label: t('pinballLaunch'), onPress: () => this.setInput('plunger', true), onRelease: () => this.setInput('plunger', false) },
      { icon: '', label: t('pinballRight'), onPress: () => this.setInput('right', true), onRelease: () => this.setInput('right', false) },
    ]);
    if (this.pad) {
      const el = [...document.querySelectorAll('#stage .mtouch')].pop();
      if (el) {
        el.classList.add('pinball-pad');
        const btns = el.querySelectorAll('.mtouch__btn');
        ['flipL', 'launch', 'flipR'].forEach((g, i) => btns[i]?.insertAdjacentHTML('afterbegin', glyphSVG(g, 34)));
        btns[1]?.classList.add('pinball-pad__launch');
      }
      this.pad.show(false);
    }
  }

  onXR(source, kind, on) {
    if (!source || !this.engine.isXR) return;
    // A hand at the plunger knob grabs it (pull back and let go); it does not flip then.
    const ptr = this.engine.pointers.find((q) => q.kind === 'xr' && q.source === source);
    if (on && this.mode === 'ready' && !this.grab && ptr?.controller && this.knob) {
      const hand = new THREE.Vector3().setFromMatrixPosition(ptr.controller.matrixWorld);
      if (hand.distanceTo(this.knob.getWorldPosition(new THREE.Vector3())) < 0.11) {
        this.grabPlunger(ptr);
        this.grab.hand = source;
        return;
      }
    }
    if (!on && this.grab?.hand === source) { this.releasePlunger(); return; }
    const st = this.xrHeld.get(source) ?? { select: false, squeeze: false };
    st[kind] = on;
    this.xrHeld.set(source, st);
    const side = source.handedness === 'left' ? 'left' : 'right';
    // Both buttons of this hand count; the side is held while either is down.
    let held = false;
    for (const [src, s] of this.xrHeld) if ((src.handedness === 'left' ? 'left' : 'right') === side && (s.select || s.squeeze)) held = true;
    if (this.grab?.p?.source === source && kind === 'select') return; // that hand holds the plunger
    this.setInput(side, held);
  }

  setInput(k, down) {
    if (this.input[k] === down) return;
    this.input[k] = down;
    const f = this.table.flippers[k];
    if (f) {
      if (this.mode !== 'play' && this.mode !== 'ready' && this.mode !== 'drain') { f.pressed = false; return; }
      f.pressed = down;
      if (!down) psfx.flipperDown();
      if (down) {
        psfx.flipper();
        const p = this.engine.pointers.find((q) => q.kind === 'xr' && q.active && q.source?.handedness === k);
        this.engine.haptic(p, 0.35, 18);
      }
    }
    if (k === 'plunger' && !down) this.launch();
  }

  grabPlunger(p) {
    if (this.mode !== 'ready' || this.grab) return;
    const pos = p.kind === 'xr' && p.controller ? new THREE.Vector3().setFromMatrixPosition(p.controller.matrixWorld) : null;
    this.grab = { p, start: pos };
    sfx.grab();
  }

  releasePlunger() {
    if (!this.grab) return;
    this.grab = null;
    this.launch();
  }

  /** The plunger lets go: the ball shoots up the shooter lane (if it lies on the plunger). */
  launch() {
    const pull = this.pull;
    this.pull = 0;
    setPlunger(this.table, 0);
    if (this.mode !== 'ready' || pull < 0.04) return;
    const b = this.table.world.ball;
    if (!inShooterLane(b) || b.y > PLUNGER_Y + BALL_R + 0.03) return;
    // The plunger snaps forward and takes the ball along.
    b.y = PLUNGER_Y + BALL_R + 0.0035;
    b.x = LANE_X;
    b.vy = launchSpeed(pull);
    b.vx = 0;
    this.mode = 'play';
    // A ball that was just saved is not saved twice.
    if (!this.savedServe) this.saveUntil = this.playT + SAVE_TIME;
    this.savedServe = false;
    this.launchedAt = this.playT;
    this.skillOpen = true;
    sfx.whoosh();
    this.pad?.disable(1, true);
  }

  // ---------- flow ----------

  showIntro() {
    this.clearLayer();
    const hint = this.engine.isXR ? 'pinballIntroXR' : this.engine.touchUI ? 'pinballIntroTouch' : 'pinballIntroKeys';
    const panel = this.add(textPanel(1.12, 0.4, [
      { text: t('pinballName'), size: 'xr-text-title', weight: 'black', gap: 0.03 },
      { text: t('pinballIntro'), size: 'xr-text-sm', color: color('xr-panel-text'), gap: 0.025 },
      { text: t(hint), size: 'xr-text-sm', color: color('xr-panel-muted'), gap: 0.03 },
      { text: L(SPONSOR.presentedBy), size: 'xr-text-sm', weight: 'bold', color: color('xr-warning') },
    ]));
    panel.position.set(0, this.eye + 0.42 - panel.h / 2, -1.15);
    const go = this.add(new Button(0.42, 0.13, {
      label: t('start'), variant: 'primary', labelSize: 'xr-text-lg',
      onClick: () => this.ready.then(() => { if (!this.disposed && this.machine) this.start(); }),
    }));
    go.position.set(0, panel.position.y - panel.h / 2 - 0.04 - go.h / 2, -1.15);
    this.introPanel = panel;
    this.introGo = go;
    this.popIn(panel);
    this.popIn(go, 0.1);
    this.app.host?.introduce(this, 'pinball', panel);
    this.prepareMusic();
  }

  start() {
    this.clearLayer();
    // Phones: the status bar on the screen; headset and desktop: the panel in the left column.
    if (this.engine.touchUI) this.refreshHud ??= this.hud(() => this.hudText());
    else this.refreshHud = () => this.status?.redraw();
    this.app.echo?.suppress(true);
    this.startMusic(1);
    const r = rng();
    Object.assign(this, {
      rand: r, truth: makeTruth(r), planner: new Planner(r),
      score: 0, ballNo: 1, playT: 0, mult: 1, campaigns: 0, conv: 0, contacts: 0, tipsRight: 0, tipsFollowed: 0,
      chBall: new Set(), lanesLit: new Set(), aud: GROUPS[Math.floor(r() * GROUPS.length)],
      tip: null, tipSince: 0, msg: null, hurried: false, saveUntil: 0, idle: 0,
      funnel: { stage: 0, reach: 0, clicks: 0 }, kpi: { reach: 0, clicks: 0, customers: 0, history: [0], perChannel: {} },
      launches: 0, multi: false, showUntil: 0, shake: 0, kpiT: 0, histT: 0,
      personas: new Set(), xbLit: false, xbUsed: false, extraBalls: 0, kbLit: true, match: null,
      vaultLit: false, hqLit: false,
    });
    this.machine?.chars.setCurrent(this.aud);
    this.buildPlanPanel();
    this.placePanels();
    this.mode = 'drain';
    sfx.appear();
    this.after(0.9, () => { if (!this.disposed) this.serve(); });
    this.replan();
    this.refreshHud();
  }

  /** A new ball in the shooter lane. */
  serve(auto = false) {
    const t0 = this.table;
    setPlunger(t0, 0);
    this.pull = 0;
    t0.world.ball.place(LANE_X, PLUNGER_Y + BALL_R + 0.0035);
    t0.drops.forEach((d) => { d.down = false; d.seg.enabled = true; });
    t0.world.paused = false;
    this.mode = 'ready';
    this.idle = 0;
    this.pad?.disable(1, false);
    this.message(t('pinballDmdBall', { n: this.ballNo }), t(this.engine.isXR ? 'pinballDmdReady' : this.engine.touchUI ? 'pinballDmdReadyTouch' : 'pinballDmdReadyKeys'), 2.4);
    this.savedServe = auto;
    if (auto) {
      this.pull = 0.62;
      this.after(0.7, () => { if (!this.disposed && this.mode === 'ready') this.launch(); });
    }
  }

  hudText() {
    const left = Math.max(0, Math.ceil(DURATION - (this.playT ?? 0)));
    const time = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    return t('pinballHud', { name: t('pinballName'), ball: Math.min(BALLS, this.ballNo ?? 1), balls: BALLS, time, score: this.shownScore(), ch: this.chBall?.size ?? 0 });
  }

  shownScore() { return Math.min(MAX_SCORE, Math.round(this.score ?? 0)); }

  // ---------- the AI campaign planner ----------

  replan() {
    if (!this.planner) return;
    this.tip = this.planner.recommend(this.aud);
    this.tipSince = this.playT ?? 0;
    this.machine?.tip.point(TARGETS[this.tip.channel]);
  }

  // ---------- scoring ----------

  onPhysics(type, obj, info) {
    if (this.mode !== 'play' && this.mode !== 'ready') return;
    const T = this.table;
    switch (type) {
      case 'bumper': {
        const i = obj.index;
        if (this.machine) this.machine.bumpers[i].flash = 1;
        psfx.bumper();
        for (const q of this.engine.pointers) if (q.kind === 'xr' && q.active) this.engine.haptic(q, 0.15, 12);
        this.channelHit('social', obj.x, obj.y);
        break;
      }
      case 'kick':
        this.score += 1;
        psfx.sling();
        if (this.machine) {
          this.machine.slings[obj.side > 0 ? 0 : 1].userData.flash.opacity = 1;
          this.machine.det.slingFlash(obj.side > 0 ? 0 : 1);
        }
        break;
      case 'hit':
        if (obj.tag === 'email') {
          const d = T.drops[obj.index];
          if (d.down) break;
          d.down = true;
          obj.enabled = false;
          psfx.drop();
          this.channelHit('email', d.x + 0.02, d.y);
          if (T.drops.every((q) => q.down)) {
            this.addPoints(60);
            if (!this.vaultLit && !this.multi) {
              this.vaultLit = true;
              this.machine?.town.vault(true);
              this.message(t('pinballDmdVaultLit'), t('pinballDmdVaultWhere'), 2.2);
            } else this.message(t('pinballDmdDrops', { n: 60 * this.factor() }), '', 1.6);
            this.after(1.2, () => { if (!this.disposed) T.drops.forEach((q) => { q.down = false; q.seg.enabled = true; }); });
          }
        } else if (obj.tag === 'poster') {
          sfx.tink();
          this.channelHit('poster', obj.x, obj.y);
        } else if (obj.tag === 'standup') {
          this.personaHit(obj.index);
        }
        break;
      case 'saucer':
        psfx.hole();
        this.channelHit('branch', obj.x, obj.y);
        if (this.xbLit) this.collectExtraBall();
        break;
      case 'kickout': {
        // The branch's hole lifts the ball into the coin chute: over the playfield to the left inlane.
        psfx.kick();
        const b = info.ball;
        if (b && this.mode === 'play') {
          b.mode = 'ramp';
          b.z = 0;
          b.ramp = { ramp: T.chute, s: 0, u: 2.0 };
          this.machine?.town.coins();
          psfx.coins();
        }
        break;
      }
      case 'rampEnter':
        sfx.whoosh();
        if (info.ball) { info.ball.hqDone = false; info.ball.vaultDone = false; }
        break;
      case 'rampDone': {
        if (obj.id === 'kick' || obj.id === 'chute') break; // the kickback's flight, the coin chute
        sfx.powerup();
        this.addPoints(15);
        const end = obj.pts[obj.pts.length - 1];
        this.channelHit(obj.channel, end[0], end[1]);
        break;
      }
      case 'sensor':
        if (obj.tag === 'lane') this.laneHit(obj.index);
        else if (obj.tag === 'spinner') this.spinnerHit(info.ball);
        else if (info.dir < 0 && (obj.tag === 'inlane' || obj.tag === 'outlane')) this.rollover(obj);
        else if (info.dir < 0 && obj.tag === 'kickback') this.kickback(info.ball);
        break;
      case 'drain':
        this.drained(info.ball);
        break;
      default:
    }
  }

  /** Reach x2 after a complete campaign or during the multiball (they do not stack). */
  factor() { return Math.max(this.mult, this.multi ? 2 : 1); }

  addPoints(n) {
    const p = n * this.factor();
    this.score += p;
    psfx.chime(p >= 100 ? 2 : p >= 20 ? 1 : 0);
  }

  /** A persona standup: four different ones light the extra ball (once per game). */
  personaHit(i) {
    const g = GROUPS[i];
    psfx.standup();
    this.machine?.det.standupHit(i);
    this.machine?.chars.react(g, 'wave');
    this.addPoints(PERSONA_PTS);
    if (this.personas.has(i)) return;
    this.personas.add(i);
    const n = this.personas.size;
    if (n < GROUPS.length) {
      this.message(t('pinballDmdPersona', { n }), t(`pinballGr_${g}`).toUpperCase(), 1.4);
      return;
    }
    this.personas.clear();
    this.addPoints(PERSONAS_PTS);
    this.machine?.chars.cheerAll();
    if (!this.xbUsed && !this.xbLit) {
      this.xbLit = true;
      this.message(t('pinballDmdXbLit'), t('pinballDmdXbWhere'), 2.4);
      psfx.chimes(4);
    } else {
      this.message(t('pinballDmdPersonas'), `+${PERSONAS_PTS * this.factor()}`, 1.8);
    }
  }

  collectExtraBall() {
    this.xbLit = false;
    this.xbUsed = true;
    this.extraBalls += 1;
    psfx.knocker();
    this.message(t('pinballDmdXb'), t('pinballDmdShootAgain'), 2.4);
    this.lightShow(1.6);
  }

  /** The spinner turns with the ball's speed: views (a point every three turns). */
  spinnerHit(ball) {
    const sp = Math.hypot(ball?.vx ?? 0, ball?.vy ?? 0);
    const n = Math.max(2, Math.min(12, Math.round(sp * 6)));
    this.machine?.det.spin(sp);
    this.addPoints(Math.ceil(n / 3));
    if (!this.msg) this.message(t('pinballDmdViews', { n: fmt(n * 100) }), '', 0.9);
  }

  /** In- and outlane rollovers. */
  rollover(s) {
    const i = this.table.rollovers.findIndex((r) => r.sensor === s);
    this.machine?.det.rollPress(i);
    psfx.rollover();
    if (s.tag === 'inlane') {
      this.addPoints(2);
      this.inlaneLit = { i: s.side > 0 ? 0 : 1, until: this.time + 1.2 };
    } else {
      this.addPoints(5);
    }
  }

  /** The kickback fires a ball back up the left outlane, onto its guided path into the field. */
  kickback(ball) {
    if (!this.kbLit || !ball || ball.mode !== 'field' || this.mode !== 'play') return;
    this.kbLit = false;
    ball.mode = 'ramp';
    ball.z = 0;
    ball.ramp = { ramp: this.table.kickback.path, s: 0, u: KICK_SPEED };
    psfx.kick();
    this.machine?.det.kick();
    this.machine?.flash(0, 0.8);
    this.addPoints(5);
    this.message(t('pinballDmdKickback'), '', 1.2);
    for (const q of this.engine.pointers) if (q.kind === 'xr' && q.active) this.engine.haptic(q, 0.5, 40);
  }

  /** A channel was hit: people of the current target group are reached, some respond. */
  channelHit(ch, x, y) {
    const n = ch === 'social' ? 3 : 10;
    const p = this.truth[this.aud][ch];
    const k = respond(n, p, this.rand);
    this.planner.observe(this.aud, ch, k, n);
    this.conv += k;
    this.contacts += n;
    // KPIs: people reached and clicks (shown on the display and the studio's monitor).
    const people = n * PEOPLE;
    const clicks = k * CLICKS;
    const K = this.kpi;
    K.reach += people;
    K.clicks += clicks;
    K.perChannel[ch] = (K.perChannel[ch] ?? 0) + clicks;
    this.kpiDirty = true;
    let pts = ch === 'social' ? 2 + 3 * k : 8 + 4 * k;
    const followed = this.tip?.channel === ch;
    let line = t('pinballKpiRate', { r: fmt((100 * K.clicks) / Math.max(1, K.reach), 1) });
    if (followed) {
      // Right when this channel reached more people than the group's channels do on average.
      const avg = CHANNELS.reduce((s, c) => s + this.truth[this.aud][c], 0) / CHANNELS.length;
      this.tipsFollowed += 1;
      if (k / n >= avg) {
        this.tipsRight += 1;
        pts += 30;
        line = t('pinballDmdTipRight', { n: 30 * this.factor() });
        sfx.coin();
      } else {
        line = t('pinballDmdTipWeak');
      }
      this.replan();
    }
    this.addPoints(pts);
    this.popup(`+${pts * this.factor()}`, CH_TOKEN[ch], x, y);
    if (ch !== 'social' || followed || !this.msg) this.message(t('pinballKpiReachUp', { n: fmt(people) }), line, ch === 'social' && !followed ? 0.8 : 1.6);
    this.flash(CH_TOKEN[ch], x, y);
    this.machine?.town.hit(ch);
    this.themed(ch, x, y, k, n);
    this.chBall.add(ch);
    this.funnelStep(ch, people, clicks);
    if (this.chBall.size === CHANNELS.length) this.campaignComplete();
  }

  /** What a channel does when it is hit: its own icons, props and the target group's cut-out. */
  themed(ch, x, y, k, n) {
    const m = this.machine;
    if (!m) return;
    const lite = quality.lite;
    const c = (v) => (lite ? Math.ceil(v / 2) : v);
    switch (ch) {
      case 'social':
        m.burst([ICON.heart, ICON.like, ICON.comment], x, y, 0.06, { count: c(2 + k), up: 0.2, speed: 0.1 });
        break;
      case 'email':
        m.burst(ICON.mail, x, y, 0.03, { count: c(2 + Math.ceil(k / 2)), up: 0.17, speed: 0.16, size: 0.03 });
        break;
      case 'app':
        m.phone.hit();
        m.burst(ICON.badge, 0.19, 0.62, 0.16, { count: c(3 + Math.ceil(k / 3)), up: 0.12, speed: 0.12, size: 0.028 });
        break;
      case 'video':
        m.tv.hit();
        m.burst([ICON.play, ICON.star], -0.19, 0.62, 0.13, { count: c(5), up: 0.13, speed: 0.14 });
        break;
      case 'poster':
        m.flipPoster();
        m.burst([ICON.poster, ICON.eye], x, y, 0.09, { count: c(3 + Math.ceil(k / 3)), up: 0.15, speed: 0.12 });
        break;
      case 'branch':
        m.burst([ICON.person, ICON.star], x, y, 0.03, { count: c(3), up: 0.16, speed: 0.1 });
        break;
      default:
    }
    m.giPulse(0.6);
    // The target group's cut-out waves when the channel went down well with it.
    if (k / n >= 0.3) m.chars.react(this.aud, 'wave');
  }

  /** The funnel: enough reach lights awareness, enough clicks interest; then the branch closes. */
  funnelStep(ch, people, clicks) {
    const F = this.funnel;
    const m = this.machine;
    F.reach += people;
    if (F.stage >= 1) F.clicks += clicks;
    if (F.stage === 0 && F.reach >= AWARE) {
      F.stage = 1;
      this.addPoints(40);
      this.message(t('pinballDmdAware'), t('pinballKpiReachUp', { n: fmt(F.reach) }), 1.8);
      sfx.powerup();
      m?.burst(ICON.eye, FUNNEL[0].x, FUNNEL[0].y, 0.02, { count: 5, up: 0.14 });
      m?.flash(0);
    } else if (F.stage === 1 && F.clicks >= INTEREST) {
      F.stage = 2;
      this.addPoints(60);
      this.message(t('pinballDmdInterest'), t('pinballDmdToBranch'), 2.4);
      sfx.powerup();
      m?.burst(ICON.cursor, FUNNEL[1].x, FUNNEL[1].y, 0.02, { count: 5, up: 0.14 });
      m?.flash(1);
    } else if (F.stage === 2 && ch === 'branch') {
      this.funnelComplete();
    }
  }

  /** A new customer: the campaign is launched (light show, cheering, multiball). */
  funnelComplete() {
    const m = this.machine;
    this.funnel = { stage: 3, reach: 0, clicks: 0 };
    this.kpi.customers += 1;
    this.kpiDirty = true;
    this.launches += 1;
    this.addPoints(200);
    this.message(t('pinballDmdCustomer'), t('pinballDmdLaunch'), 2.2);
    sfx.finish();
    psfx.chimes(6);
    m?.branch.welcome();
    m?.chars.cheerAll();
    m?.burst([ICON.person, ICON.star, ICON.spark], this.table.saucer.x, this.table.saucer.y, 0.03, { count: quality.lite ? 6 : 14, up: 0.22, speed: 0.2, size: 0.03 });
    this.lightShow(3.4);
    if (!this.hqLit) {
      this.hqLit = true;
      this.after(2.4, () => { if (!this.disposed && this.mode === 'play') this.message(t('pinballDmdJackpotLit'), t('pinballDmdJackpotWhere'), 2.2); });
    }
    this.after(2.3, () => {
      if (this.disposed || this.mode !== 'play') return;
      this.funnel = { stage: 0, reach: 0, clicks: 0 };
      this.startMultiball();
    });
  }

  /** The ramps' stops: the headquarters (right ramp) and the vault (left ramp, when lit). */
  rampStops() {
    const T = this.table;
    for (const b of T.world.balls) {
      if (b.mode !== 'ramp' || !b.ramp) continue;
      const { ramp, s } = b.ramp;
      if (ramp.id === 'right' && !b.hqDone && s >= T.stops.hq) {
        b.hqDone = true;
        this.hqVisit(b);
      } else if (ramp.id === 'left' && !b.vaultDone && this.vaultLit && s >= T.stops.vault) {
        b.vaultDone = true;
        this.vaultLock(b);
      }
    }
  }

  /** Holds a ball where it is on its ramp and lets it roll on after sec seconds. */
  holdOnRamp(b, sec, then) {
    const keep = { ...b.ramp };
    b.mode = 'lock';
    this.after(sec, () => {
      if (this.disposed || b.mode !== 'lock') return;
      b.mode = 'ramp';
      b.ramp = { ...keep, u: 0.6 };
      then?.();
    });
  }

  /** Through the headquarters: a light run; the jackpot when lit (everyone cheers). */
  hqVisit(b) {
    const m = this.machine;
    if (!this.hqLit) {
      this.addPoints(20);
      m?.town.hqPass();
      psfx.chimes(3);
      return;
    }
    this.hqLit = false;
    this.holdOnRamp(b, 2.4);
    this.addPoints(150);
    this.message(t('pinballDmdJackpot'), t('pinballDmdJackpotHq', { n: 150 * this.factor() }), 2.6);
    m?.town.hqCheer();
    m?.chars.cheerAll();
    psfx.jingle();
    this.lightShow(2.6);
  }

  /** The vault opens for the ball, keeps it, a second ball comes; then both play (multiball). */
  vaultLock(b) {
    this.vaultLit = false;
    psfx.vault();
    this.message(t('pinballDmdVaultLocked'), t('pinballDmdMultiball'), 2.4);
    this.addPoints(40);
    this.holdOnRamp(b, 2.8, () => { this.machine?.town.vault(false); psfx.vault(); });
    this.after(0.6, () => { if (!this.disposed && this.mode === 'play') this.startMultiball(); });
  }

  /** Kampagnenstart: a second ball comes out of the shooter lane. */
  startMultiball() {
    const W = this.table.world;
    if (W.balls.filter((b) => b.mode !== 'gone').length >= 2) return;
    const b = W.balls.find((q) => q.mode === 'gone') ?? W.addBall();
    b.place(LANE_X, PLUNGER_Y + BALL_R + 0.0035);
    b.vy = launchSpeed(0.72);
    this.multi = true;
    this.saveUntil = Math.max(this.saveUntil, this.playT + 10);
    this.message(t('pinballDmdMultiball'), t('pinballDmdMultiDouble'), 2.4);
    sfx.whoosh();
    this.machine?.flash(0);
    this.machine?.flash(1);
  }

  /** A short light show: GI strobes, flashers fire, inserts chase, the screen shakes a little. */
  lightShow(dur = 2.6) {
    this.showUntil = Math.max(this.showUntil ?? 0, this.time + dur);
    this.shake = Math.max(this.shake ?? 0, 1);
    for (const q of this.engine.pointers) if (q.kind === 'xr' && q.active) this.engine.haptic(q, 0.6, 120);
  }

  campaignComplete() {
    this.campaigns += 1;
    this.mult = 2; // reach x2 for the rest of this ball
    this.addPoints(120);
    this.chBall.clear();
    sfx.finish();
    this.message(t('pinballDmdComplete'), t('pinballDmdMulti', { n: this.mult }), 2.6);
    this.lightShow(2.6);
    const m = this.machine;
    if (m) {
      for (const ch of CHANNELS) {
        const [x, y] = TARGETS[ch];
        m.burst(ICON.star, x, y, 0.05, { count: 2, up: 0.2 });
      }
      m.chars.cheerAll();
    }
  }

  laneHit(i) {
    const g = GROUPS[i];
    this.addPoints(5);
    psfx.rollover();
    this.machine?.det.lanePress(i);
    if (this.skillOpen && this.playT - this.launchedAt < 4) {
      this.addPoints(25);
      this.message(t('pinballDmdSkill', { n: 25 * this.factor() }), t(`pinballGr_${g}`).toUpperCase(), 1.6);
    }
    this.skillOpen = false;
    this.lanesLit.add(i);
    if (g !== this.aud) {
      this.aud = g;
      this.message(t('pinballDmdGroup', { g: t(`pinballGr_${g}`).toUpperCase() }), '', 1.6);
      this.machine?.chars.setCurrent(g);
      this.machine?.chars.react(g, 'wave');
      this.replan();
    }
    if (this.lanesLit.size === GROUPS.length) {
      this.addPoints(60);
      if (!this.kbLit) {
        this.kbLit = true;
        this.message(t('pinballDmdAllGroups', { n: 60 * this.factor() }), t('pinballDmdKickbackLit'), 1.8);
      } else {
        this.message(t('pinballDmdAllGroups', { n: 60 * this.factor() }), '', 1.8);
      }
      this.machine?.chars.cheerAll();
      this.after(0.6, () => { if (!this.disposed) this.lanesLit.clear(); });
    }
  }

  drained(ball) {
    if (this.mode !== 'play' && this.mode !== 'ready') return;
    const W = this.table.world;
    const live = W.balls.filter((q) => q.mode !== 'gone');
    if (live.length > 0) {
      // Multiball: another ball is still in play. During the save, this one comes back.
      if (this.playT < this.saveUntil && ball) {
        ball.place(LANE_X, PLUNGER_Y + BALL_R + 0.0035);
        ball.vy = launchSpeed(0.7);
        this.message(t('pinballDmdSave'), '', 1.2);
        return;
      }
      if (ball) W.removeBall(ball);
      if (W.balls.filter((q) => q.mode !== 'gone').length <= 1) this.multi = false;
      return;
    }
    this.multi = false;
    if (this.playT < this.saveUntil) {
      this.saveUntil = 0; // one save per ball
      this.mode = 'drain';
      this.message(t('pinballDmdSave'), '', 1.6);
      sfx.appear();
      this.after(0.8, () => { if (!this.disposed && this.mode === 'drain') this.serve(true); });
      return;
    }
    this.mode = 'drain';
    psfx.drain();
    this.mult = 1;
    this.chBall.clear();
    if (this.extraBalls > 0 && this.playT < DURATION) {
      // Extra ball: the same ball number once more.
      this.extraBalls -= 1;
      this.message(t('pinballDmdShootAgain'), '', 1.6);
      this.after(1.6, () => { if (!this.disposed && this.mode === 'drain') this.serve(); });
      return;
    }
    this.ballNo += 1;
    if (this.ballNo > BALLS) {
      this.gameOver('pinballDmdOver');
      return;
    }
    this.message(t('pinballDmdLost'), '', 1.6);
    this.after(1.6, () => { if (!this.disposed && this.mode === 'drain') this.serve(); });
  }

  gameOver(key) {
    if (this.mode === 'over') return;
    this.mode = 'over';
    this.table.world.paused = true;
    this.table.world.ball.mode = 'gone';
    for (const f of Object.values(this.table.flippers)) f.pressed = false;
    this.machine?.tip.point(null);
    this.message(t(key), String(this.shownScore()), 1.5);
    this.refreshHud?.();
    sfx.finish();
    this.pad?.show(false);
    // The match: two digits roll; the same as the score's last two (in tens) is a match.
    const final = Math.floor(this.rand() * 10) * 10;
    const mine = Math.floor((this.shownScore() % 100) / 10) * 10;
    this.match = { from: this.time + 1.5, until: this.time + 3.1, final, hit: final === mine, tick: -1 };
    this.after(3.1, () => {
      if (this.disposed) return;
      const m = this.match;
      this.message(String(m.final).padStart(2, '0'), m.hit ? t('pinballDmdMatchWin') : t('pinballDmdMatch'), 1.6);
      if (m.hit) { psfx.knocker(); this.lightShow(1.2); }
    });
    this.after(4.3, () => { if (!this.disposed) this.finish(); });
  }

  finish() {
    this.app.echo?.suppress(false);
    const score = this.shownScore();
    const P = this.planner;
    // What the planner learned: the group with the most data, its best-known channel.
    let best = null;
    for (const g of GROUPS) {
      const n = CHANNELS.reduce((s, c) => s + P.hits[g][c], 0);
      if (!best || n > best.n) best = { g, n };
    }
    const learned = [{ q: t('pinballLearnExploreQ'), a: t('pinballLearnExploreA', { x: P.explores, y: P.exploits }) }];
    if (best && best.n >= 3) {
      const g = best.g;
      const tried = CHANNELS.filter((c) => P.hits[g][c] > 0);
      const ch = tried.sort((a, b) => P.posterior(g, b).mean - P.posterior(g, a).mean)[0];
      learned.push({
        q: t('pinballLearnFeedbackQ'),
        a: t('pinballLearnFeedbackA', { g: t(`pinballGr_${g}`), ch: t(`pinballCh_${ch}`), est: Math.round(P.posterior(g, ch).mean * 100), real: Math.round(this.truth[g][ch] * 100) }),
      });
    } else {
      learned.push({ q: t('pinballLearnFeedbackQ'), a: t('pinballLearnFeedbackNone') });
    }
    learned.push({ q: t('pinballLearnAbQ'), a: t('pinballLearnAbA') });
    this.results({
      gameKey: 'pinball', score, correct: score, total: 3500,
      line: t('pinballLine', { reach: fmt(this.kpi.reach), clicks: fmt(this.kpi.clicks), cust: this.kpi.customers, tips: this.tipsRight }),
      learned,
      onAgain: () => this.app.startGame('pinball'),
    });
  }

  // ---------- feedback ----------

  /** A message on the dot matrix display (big line, small line) for a while. */
  message(big, small = '', dur = 1.6) {
    this.msg = { big: String(big), small, until: this.time + dur };
  }

  updateDmd() {
    const d = this.machine?.dmd;
    if (!d) return;
    const m = this.match;
    if (m && this.time >= m.from && this.time < m.until) {
      // The match wheel: the digits roll, slowing down.
      const k = Math.floor((this.time - m.from) * 14 * (1 - 0.6 * ((this.time - m.from) / (m.until - m.from))));
      if (k !== m.tick) { m.tick = k; psfx.matchTick(); }
      d.show(String(((k * 30 + m.final) % 100) - (((k * 30 + m.final) % 100) % 10)).padStart(2, '0'), t('pinballDmdMatch'));
      return;
    }
    if (this.msg && this.time < this.msg.until) { d.show(this.msg.big, this.msg.small); return; }
    this.msg = null;
    if (this.mode === 'intro' || !this.planner) { d.show(t('pinballName').toUpperCase()); return; }
    if (this.mode === 'over') { d.show(String(this.shownScore()), t('pinballDmdOver')); return; }
    const tip = this.tip ? t('pinballAiTip', { ch: t(`pinballCh_${this.tip.channel}`) }).toUpperCase() : '';
    d.show(String(this.shownScore()), `${t('pinballDmdBall', { n: Math.min(BALLS, this.ballNo) })}  ·  ${tip}`);
  }

  /** The flasher lights up where something happened. */
  flash(token, x, y) {
    if (!this.machine) return;
    this.flasher.color.set(color(token));
    this.flasher.position.copy(this.group.worldToLocal(this.machine.world(x, y, 0.06)));
    this.flasher.intensity = 1.2;
  }

  /** "+34" rising from a hit. */
  popup(text, token, x, y) {
    if (!this.machine) return;
    let s = this.popups.find((q) => q.life <= 0);
    if (!s) {
      if (this.popups.length >= 6) return;
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 96;
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, toneMapped: false }));
      sp.renderOrder = 20;
      sp.userData.noFit = true;
      this.group.add(sp);
      s = { sp, c, tex, life: 0 };
      this.popups.push(s);
    }
    const ctx = s.c.getContext('2d');
    ctx.clearRect(0, 0, 256, 96);
    ctx.font = font('black', 64);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 10;
    ctx.strokeStyle = color('xr-pinball-dark');
    ctx.strokeText(text, 128, 50);
    ctx.fillStyle = color(token);
    ctx.fillText(text, 128, 50);
    s.tex.needsUpdate = true;
    s.life = 1;
    s.at = this.group.worldToLocal(this.machine.world(x, y, 0.06));
    s.sp.scale.set(0.08, 0.03, 1);
  }

  // ---------- layout (panels and the browser camera) ----------

  /** XR / desktop / phone landscape: the planner panel left of the machine; portrait: above it. */
  placePanels() {
    const e = this.engine;
    const mode = e.isXR ? 'xr' : e.touchUI && window.innerWidth < window.innerHeight ? 'portrait' : 'wide';
    if (mode !== this.layoutMode) {
      this.layoutMode = mode;
      if (this.planPanel) this.buildPlanPanel();
    }
    const p = this.column;
    if (!p || !this.machine) return;
    if (e.touchUI) {
      // Phones: the planner as a small strip under the status bar, fixed to the screen.
      const cam = e.camera;
      const d = 0.5;
      const halfH = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * d;
      const halfW = halfH * cam.aspect;
      const pw = this.planPanel?.w ?? 0.78;
      const ph = this.planPanel?.h ?? 0.36;
      const k = (mode === 'portrait' ? 1.3 * halfW : 0.62 * halfW) / pw;
      const top = halfH - (2 * halfH * 70) / window.innerHeight;
      const x = mode === 'portrait' ? 0 : -halfW + (pw * k) / 2 + 0.01;
      cam.updateMatrixWorld();
      const world = cam.localToWorld(new THREE.Vector3(x, top - (ph * k) / 2, -d));
      p.position.copy(this.group.worldToLocal(world));
      const gq = this.group.getWorldQuaternion(new THREE.Quaternion()).invert();
      p.quaternion.copy(gq.multiply(cam.getWorldQuaternion(new THREE.Quaternion())));
      p.scale.setScalar(k);
      if (!p.userData.onTop) {
        p.traverse((o) => { if (o.material) { o.material.depthTest = false; o.renderOrder = 60; } });
        p.userData.onTop = this.planPanel;
      } else if (p.userData.onTop !== this.planPanel) p.userData.onTop = null;
      return;
    }
    if (mode === 'portrait') {
      const top = this.machineY + 0.92 * this.S;
      p.rotation.set(-(this.pitch ?? 0.98), 0, 0);
      p.position.set(0, top + 0.12, FRONT_Z - 1.12 * this.S);
    } else if (mode === 'xr') {
      placeOnArc(p, -0.62, this.eye - 0.3, 1.05);
    } else {
      // Browser: left of the machine, facing the camera.
      p.rotation.set(-(this.pitch ?? 0.78), 0, 0);
      p.position.set(-0.66, this.eye - 0.42, FRONT_Z - 0.62);
    }
  }

  /**
   * Phones: a player's view from the front end of the machine, low and close, looking up the
   * playfield (about 40 degrees). The flippers are big at the bottom; when a ball is high up the
   * view glides a little upwards (damped, a small range) and comes back.
   */
  playerCamera(dt, cam, ins) {
    const m = this.machine;
    const portrait = cam.aspect < 0.85;
    const H = window.innerHeight;
    // The highest ball on the playfield pulls the view up a little.
    let hi = 0;
    for (const b of this.table.world.balls) if (b.mode !== 'gone') hi = Math.max(hi, b.y);
    const want = clamp((hi - 0.45) * 0.22, 0, 0.09);
    this.follow = (this.follow ?? 0) + (want - (this.follow ?? 0)) * Math.min(1, dt * 1.5);
    const f = this.follow;
    // Field-space eye and target; then into the world.
    const eyeF = portrait ? [0.035, -0.32 + f * 0.5, 0.45] : [0.025, -0.4 + f * 0.6, 0.42];
    const tgtF = portrait ? [0.035, 0.64 + f, 0] : [0.025, 0.42 + f, 0];
    const eye = m.world(...eyeF);
    const tgt = m.world(...tgtF);
    const fov = portrait ? 70 : 46;
    if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
    // The thumb buttons cover the bottom: shift the picture up by half of what they cover.
    const shift = ((ins.bottom - ins.top) / H) * 0.5;
    const tmpCam = this.tmpCam ?? (this.tmpCam = new THREE.PerspectiveCamera()); // (a camera looks along -z)
    tmpCam.position.copy(eye);
    tmpCam.up.set(0, 1, 0);
    tmpCam.lookAt(tgt);
    tmpCam.rotateX(-shift * THREE.MathUtils.degToRad(fov));
    const k = this.camInit ? Math.min(1, dt * 4) : 1;
    this.camInit = true;
    cam.position.lerp(tmpCam.position, k);
    cam.quaternion.slerp(tmpCam.quaternion, k);
    this.pitch = 0.75;
    if (this.shake > 0.01) {
      const a = this.shake * 0.006;
      cam.position.x += (Math.random() - 0.5) * a;
      cam.position.y += (Math.random() - 0.5) * a;
    }
    return true;
  }

  /** Points the browser camera so the given world points fill the free part of the screen. */
  fitCamera(cam, pitch, pts, ins, margin = 1.04) {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, 0, 0));
    const qi = q.clone().invert();
    const tv = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const th = tv * cam.aspect;
    const H = window.innerHeight;
    const free = Math.max(0.35, 1 - (ins.top + ins.bottom) / H);
    const shift = (ins.bottom - ins.top) / H;
    const loc = pts.map((p) => p.clone().applyQuaternion(qi));
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity;
    for (const v of loc) { minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x); minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y); }
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    let z = -Infinity;
    for (const v of loc) z = Math.max(z, v.z + (margin * Math.abs(v.x - cx)) / th, v.z + (margin * Math.abs(v.y - cy)) / (tv * free));
    const camLoc = new THREE.Vector3(cx, 0, z);
    camLoc.y = cy - shift * (z - (loc.reduce((s, v) => s + v.z, 0) / loc.length)) * tv;
    return { pos: camLoc.applyQuaternion(q), quat: q };
  }

  /** The corners of what the browser camera should show (world space). */
  framePoints() {
    const m = this.machine;
    const pts = [];
    const add = (o) => {
      if (!o?.visible) return;
      const hw = (o.w ?? 0.5) / 2;
      const hh = (o.h ?? 0.3) / 2;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pts.push(o.localToWorld(new THREE.Vector3(sx * hw, sy * hh, 0)));
    };
    // Phones held sideways: the intro text needs the whole height.
    if (this.mode === 'intro' && this.engine.touchUI && window.innerWidth > window.innerHeight) {
      for (const o of this.layer.children) if (o.w && o.h) add(o);
      if (pts.length) return pts;
    }
    const field = [[-0.27, -0.03], [0.32, -0.03], [-0.27, 1.2], [0.32, 1.2]];
    for (const [x, y] of field) pts.push(m.world(x, y, 0), m.world(x, y, 0.07));
    const head = m.root;
    // Phones held sideways frame the playfield (the head may be cut off at the top).
    const tight = this.engine.touchUI && window.innerWidth > window.innerHeight;
    // Browser: the backglass's lower part (its studio scene); the headset sees all of it anyway.
    const top = new THREE.Vector3(0, tight ? 0.36 : this.engine.isXR ? 0.9 : 0.7, -1.26);
    for (const x of [-0.29, 0.34]) pts.push(head.localToWorld(top.clone().setX(x)));
    pts.push(head.localToWorld(new THREE.Vector3(0.025, -0.05, 0.15))); // plunger knob, lockdown
    if (this.mode !== 'intro' && this.planPanel?.visible) {
      add(this.planPanel);
      add(this.status);
      add(this.menuBtn);
      // Keep the machine in the middle of the screen: mirror the panel's outer edge.
      if (this.layoutMode === 'wide') pts.push(this.planPanel.localToWorld(new THREE.Vector3(-this.planPanel.w / 2, 0, 0)).multiply(new THREE.Vector3(-1, 1, 1)));
    }
    if (this.mode === 'intro') for (const o of this.layer.children) if (o.w && o.h) add(o); // incl. Echo's bubble
    return pts;
  }

  /** Browser preview: the player's view down onto the machine (phones and desktop). */
  previewCamera(dt, cam, ins) {
    if (!this.machine || this.mode === 'over') return false;
    if (this.engine.touchUI && this.mode !== 'intro') return this.playerCamera(dt, cam, ins);
    const portrait = cam.aspect < 0.85;
    const intro = this.mode === 'intro';
    const pitch = intro ? 0.3 : portrait ? 0.98 : this.engine.touchUI ? 0.9 : 0.78;
    this.pitch = pitch;
    // Panels face the camera, so they read without distortion.
    if (intro) for (const o of this.layer.children) o.rotation.x = -pitch; // incl. Echo's bubble
    this.group.updateMatrixWorld(true);
    const { pos, quat } = this.fitCamera(cam, pitch, this.framePoints(), ins, portrait ? 1.02 : 1.05);
    const k = this.camInit ? Math.min(1, dt * 4) : 1;
    this.camInit = true;
    if (cam.fov !== 60) { cam.fov = 60; cam.updateProjectionMatrix(); }
    cam.position.lerp(pos, k);
    cam.quaternion.slerp(quat, k);
    // A short shake on big moments (browser only; in the headset the controllers buzz instead).
    if (this.shake > 0.01) {
      const a = this.shake * 0.012;
      cam.position.x += (Math.random() - 0.5) * a;
      cam.position.y += (Math.random() - 0.5) * a;
    }
    return true;
  }

  /** Game timers run on the scene's own clock (update), not on the engine's tweens. */
  after(sec, fn) {
    (this.timers ??= []).push({ at: this.time + sec, fn });
  }

  // ---------- frame loop ----------

  update(dt) {
    this.time += dt;
    if (this.timers?.length) {
      const due = this.timers.filter((q) => q.at <= this.time);
      if (due.length) {
        this.timers = this.timers.filter((q) => q.at > this.time);
        due.forEach((q) => { if (!this.disposed) q.fn(); });
      }
    }
    const e = this.engine;
    const T = this.table;
    const playing = this.mode === 'play' || this.mode === 'ready';
    if (playing || this.mode === 'drain') this.playT += dt;
    // Plunger: held key / button / both flippers in XR, or the grabbed knob.
    if (this.mode === 'ready') {
      this.idle += dt;
      const both = this.input.left && this.input.right;
      this.bothT = both ? (this.bothT ?? 0) + dt : 0;
      if (this.grab?.p?.kind === 'xr' && this.grab.start) {
        const now = new THREE.Vector3().setFromMatrixPosition(this.grab.p.controller.matrixWorld);
        const toward = new THREE.Vector3(0, 0, 1).transformDirection(this.machine.field.matrixWorld);
        this.pull = clamp(now.sub(this.grab.start).dot(toward) / (0.12 * this.S), 0, 1);
      } else if (this.input.plunger || this.grab || this.bothT > 0.25) {
        this.pull = Math.min(1, this.pull + dt / PULL_TIME);
      } else if (this.pull > 0 && this.bothT === 0 && this.wasBoth) {
        this.launch();
      }
      this.wasBoth = this.bothT > 0.25;
      if (this.pull > 0) this.idle = 0;
      setPlunger(T, this.pull);
      if (this.idle > AUTO_LAUNCH) { this.pull = 0.6; this.launch(); }
    }
    if (playing || this.mode === 'drain') { T.world.step(dt); this.rampStops(); }
    for (const b of T.world.balls) {
      // The gate swings when a ball leaves the shooter lane.
      if (this.machine && b.mode === 'field' && b.x > 0.245 && b.y > 0.78 && b.y < 0.86 && b.vy > 0) this.machine.gate.rotation.x = Math.min(1.2, b.vy * 0.6);
      // Ball search: a ball resting somewhere away from the flippers gets a little nudge.
      if (this.mode !== 'play') continue;
      const still = b.mode === 'field' && b.speed < 0.03 && b.y > 0.28 && !inShooterLane(b);
      b.stillT = still ? (b.stillT ?? 0) + dt : 0;
      if (b.stillT > 4) {
        b.stillT = 0;
        b.vx = (this.rand() - 0.5) * 0.8;
        b.vy = -0.5;
        sfx.thud();
      }
    }
    if (playing) {
      if (this.tip && this.playT - this.tipSince > REPLAN) this.replan();
      if (!this.hurried && DURATION - this.playT < 30) {
        this.hurried = true;
        this.message(t('pinballDmdHurry'), '', 2);
        music.intensity = 2;
      }
      if (this.playT >= DURATION) this.gameOver('pinballDmdTime');
    }
    this.pad?.show(this.mode === 'ready' || this.mode === 'play' || this.mode === 'drain');
    if (this.machine) {
      const m = this.machine;
      // Browser: the results get the screen to themselves (in the headset they float in front).
      m.root.visible = !(this.mode === 'over' && !e.isXR && this.resultData);
      const showing = this.time < (this.showUntil ?? 0);
      m.update(dt, this.time, { pull: this.pull, eye: e.camera.getWorldPosition(new THREE.Vector3()), hot: showing || this.multi, onSpinTurn: () => psfx.spin() });
      // Inserts: channels hit with this ball glow, the AI's tip blinks, lanes, funnel, multiplier,
      // save. Before the launch an attract chase runs over all of them; light shows strobe.
      const blink = 0.5 + 0.5 * Math.sin(this.time * 9);
      const attract = this.mode === 'intro' || this.mode === 'over' || this.mode === 'ready';
      const chase = (i, n, speed = 5) => Math.max(0, Math.sin(this.time * speed - (i / n) * Math.PI * 2)) ** 2;
      const strobe = (i) => (Math.floor(this.time * 12 + i) % 3 === 0 ? 1 : 0.1);
      m.setGI(showing ? 'show' : attract ? 'attract' : 'normal');
      CHANNELS.forEach((ch, i) => {
        const ins = m.inserts[ch];
        if (showing) ins.level = strobe(i);
        else if (attract) ins.level = 0.15 + 0.85 * chase(i, CHANNELS.length);
        else if (ch === 'branch' && this.funnel?.stage === 2) ins.level = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.time * 14));
        else ins.level = this.tip?.channel === ch ? 0.35 + 0.65 * blink : this.chBall?.has(ch) ? 0.75 : 0.1;
      });
      GROUPS.forEach((g, i) => {
        const ins = m.inserts[`lane${i}`];
        if (showing) ins.level = strobe(i + 2);
        else if (attract) ins.level = 0.15 + 0.85 * chase(i, GROUPS.length, 7);
        else ins.level = g === this.aud ? 0.55 + 0.45 * blink : this.lanesLit?.has(i) ? 0.7 : 0.12;
      });
      FUNNEL.forEach((f, i) => {
        const ins = m.inserts[`funnel${i}`];
        const stage = this.funnel?.stage ?? 0;
        if (showing) ins.level = Math.floor(this.time * 8 - i) % 3 === 0 ? 1 : 0.2;
        else if (attract) ins.level = 0.15 + 0.85 * chase(2 - i, 3, 4);
        else ins.level = i < stage ? 0.85 : i === stage ? 0.25 + 0.4 * blink : 0.1;
      });
      m.inserts.multi.level = showing ? strobe(1) : attract ? 0.3 : this.mult > 1 || this.multi ? 0.6 + 0.4 * blink : 0.08;
      const live = this.mode === 'play' || this.mode === 'ready';
      m.inserts.save.level = !attract && ((this.playT < this.saveUntil && live) || this.extraBalls > 0) ? 0.5 + 0.5 * blink : 0.05;
      // Classic inserts: kickback, extra ball, personas, spinner, inlanes, drop numbers.
      const I = m.inserts;
      const sweep = (x, y) => 0.12 + 0.88 * Math.max(0, Math.sin(this.time * 4 - y * 9 - Math.abs(x) * 4)) ** 3;
      const pos = { kickback: [-0.22, 0.17], extra: [0.085, 0.395], spinner: [-0.11, 0.99], inlane0: [-0.18, 0.27], inlane1: [0.18, 0.27] };
      for (const [k, [x, y]] of Object.entries(pos)) {
        const ins = I[k];
        if (!ins) continue;
        if (showing) ins.level = strobe(x * 10 + y * 7);
        else if (attract) ins.level = sweep(x, y);
        else if (k === 'kickback') ins.level = this.kbLit ? 0.55 + 0.45 * blink : 0.06;
        else if (k === 'extra') ins.level = this.xbLit ? 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.time * 12)) : 0.06;
        else if (k === 'spinner') ins.level = 0.15 + 0.25 * (0.5 + 0.5 * Math.sin(this.time * 3));
        else ins.level = this.inlaneLit?.i === Number(k.slice(-1)) && this.time < this.inlaneLit.until ? 1 : 0.1;
      }
      GROUPS.forEach((g, i) => {
        const ins = I[`persona${i}`];
        if (!ins) return;
        if (showing) ins.level = strobe(i + 5);
        else if (attract) ins.level = 0.15 + 0.85 * chase(i, GROUPS.length, 6);
        else ins.level = this.personas?.has(i) ? 0.9 : 0.12 + (this.xbUsed ? 0 : 0.15 * blink);
      });
      for (let i = 0; i < 4; i++) {
        const ins = I[`star${i}`];
        if (ins) ins.level = showing ? strobe(i + 3) : 0.15 + 0.85 * chase(i, 4, attract ? 7 : 2.5);
      }
      this.table.drops.forEach((q, i) => {
        const ins = I[`drop${i}`];
        if (!ins) return;
        ins.level = showing ? strobe(i + 9) : attract ? 0.15 + 0.85 * chase(i, 3, 8) : q.down ? 0.9 : 0.1;
      });
      // Spare balls in the trough window.
      m.det.setTrough(this.mode === 'intro' || !this.planner ? BALLS - 1 : Math.max(0, BALLS - (this.ballNo ?? 1)) + (this.extraBalls ?? 0));
      // The studio's monitor: live KPIs (reach over time, clicks per channel, new customers).
      if (this.kpi) {
        this.histT += dt;
        if (this.histT > 4 && this.mode !== 'over') {
          this.histT = 0;
          this.kpi.history.push(this.kpi.reach);
          if (this.kpi.history.length > 46) this.kpi.history.shift();
          this.kpiDirty = true;
        }
        this.kpiT += dt;
        if (this.kpiDirty && this.kpiT > 0.5) {
          this.kpiT = 0;
          this.kpiDirty = false;
          m.chart.set({ ...this.kpi, history: [...this.kpi.history, this.kpi.reach] });
        }
      }
      // Legs to the real floor.
      const at = m.root.getWorldPosition(new THREE.Vector3());
      m.setFloor(m.root.worldToLocal(at.setY(e.floorY)).y);
      this.knob.position.copy(fp(LANE_X, PLUNGER_Y - this.pull * 0.05 - 0.205, 0.012));
      this.knob.visible = this.mode === 'ready';
    }
    this.flasher.intensity = Math.max(0, this.flasher.intensity - dt * 6);
    this.shake = Math.max(0, (this.shake ?? 0) - dt * 2.5);
    for (const s of this.popups) {
      if (s.life <= 0) { s.sp.visible = false; continue; }
      s.life -= dt * 1.1;
      s.sp.visible = true;
      s.sp.position.copy(s.at).add(new THREE.Vector3(0, (1 - s.life) * 0.07, 0));
      s.sp.material.opacity = Math.min(1, s.life * 2.5);
    }
    if (this.snow) {
      const floor = e.floorY - e.root.position.y;
      this.cover.mesh.visible = e.isXR; // the snow cover belongs on a real floor
      this.snow.setGround(floor);
      this.cover.setGround(floor);
      this.snow.update(dt);
      this.cover.update(dt);
      setSnowAmount(0.35 + 0.65 * snowSettled());
    }
    this.updateDmd();
    this.updatePlan();
    this.placePanels();
    if (Math.floor(this.time * 4) !== this.hudTick) {
      this.hudTick = Math.floor(this.time * 4);
      if (this.refreshHud && this.mode !== 'intro' && this.mode !== 'over') this.refreshHud();
    }
    // Intro and results stand in front of the machine: the whole layer is pulled towards the
    // eyes (same apparent size, but closer than the machine's head).
    const k = this.mode === 'over' || this.mode === 'intro' ? PULL : 1;
    this.layer.scale.setScalar(k);
    this.layer.position.set(0, this.eye * (1 - k), 0);
    if (this.mode === 'over' || this.mode === 'intro') {
      this.layer.traverse((o) => {
        if (!o.material || o.userData.onTop) return;
        o.material.depthTest = false;
        o.renderOrder = 100;
        o.userData.onTop = true;
      });
    }
    if (!e.isXR && !e.touchUI) {
      // Desktop: the player's view down onto the machine (the engine frames the results).
      const own = this.machine && this.mode !== 'over';
      e.fitEnabled = !own;
      if (own) this.previewCamera(dt, e.camera, { top: 0, bottom: 0 });
    }
    if (e.touchUI && !this.viewSet) {
      this.viewSet = true;
      this.mobileView((cam, d, ins) => this.previewCamera(d, cam, ins));
    }
  }

  // ---------- the planner's panel ----------

  updatePlan() {
    const p = this.planPanel;
    if (!p || !this.planner) return;
    if (this.column) this.column.visible = this.mode !== 'over' && this.mode !== 'intro';
    const key = `${this.planner.version}|${this.aud}|${this.tip?.channel}|${this.layoutMode}`;
    if (key === this.planKey) return;
    this.planKey = key;
    p.redraw();
  }

  drawPlan(ctx, c) {
    c.surface({ stroke: color('xr-pinball-ai') });
    const P = this.planner;
    if (!P) return;
    const W = c.canvas.width;
    const pad = c.m(0.035);
    const sm = c.m(num('xr-text-sm'));
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = color('xr-pinball-ai');
    ctx.font = font('black', c.m(num('xr-text-md')));
    ctx.fillText(t('pinballAiTitle'), pad, c.m(0.05));
    drawGlyph(ctx, this.aud, pad + c.m(0.02), c.m(0.11), c.m(0.04), color('xr-panel-text'));
    ctx.fillStyle = color('xr-panel-text');
    ctx.font = font('bold', sm);
    ctx.fillText(t('pinballAiGroup', { g: t(`pinballGr_${this.aud}`) }), pad + c.m(0.05), c.m(0.11));
    const rowH = c.m(0.058);
    const y0 = c.m(0.165);
    const barX = pad + c.m(0.27);
    const barW = W - barX - pad - c.m(0.06);
    CHANNELS.forEach((ch, i) => {
      const y = y0 + i * rowH;
      const post = P.posterior(this.aud, ch);
      const tip = this.tip?.channel === ch;
      if (tip) {
        ctx.fillStyle = color('xr-pinball-ai-band');
        ctx.beginPath();
        ctx.roundRect(pad - c.m(0.012), y - rowH / 2 + c.m(0.004), W - 2 * pad + c.m(0.024), rowH - c.m(0.008), c.m(0.012));
        ctx.fill();
      }
      drawGlyph(ctx, ch, pad + c.m(0.02), y, c.m(0.036), color(CH_TOKEN[ch]));
      ctx.fillStyle = color('xr-panel-text');
      ctx.font = font(tip ? 'black' : 'bold', sm);
      fitText(ctx, t(`pinballCh_${ch}`), barX - pad - c.m(0.065), sm, tip ? 'black' : 'bold');
      ctx.fillText(t(`pinballCh_${ch}`), pad + c.m(0.05), y);
      // Bar: the band is the uncertainty (90 %), the bright bar the estimate.
      const bh = c.m(0.022);
      ctx.fillStyle = color('xr-pinball-bar-bg');
      ctx.fillRect(barX, y - bh / 2, barW, bh);
      ctx.fillStyle = color('xr-pinball-ai-band');
      ctx.fillRect(barX + post.lo * barW, y - bh, (post.hi - post.lo) * barW, bh * 2);
      ctx.fillStyle = color(CH_TOKEN[ch]);
      ctx.fillRect(barX, y - bh / 2, post.mean * barW, bh);
      ctx.fillStyle = color('xr-panel-text');
      ctx.fillRect(barX + post.mean * barW - c.m(0.002), y - bh, c.m(0.004), bh * 2);
      ctx.textAlign = 'right';
      ctx.font = font('bold', sm);
      ctx.fillStyle = color('xr-panel-muted');
      ctx.fillText(`${Math.round(post.mean * 100)}`, W - pad, y);
      ctx.textAlign = 'left';
    });
    // The tip with explore / exploit.
    const yT = y0 + CHANNELS.length * rowH + c.m(0.015);
    const any = CHANNELS.some((ch) => P.hits[this.aud][ch] > 0);
    if (this.tip) {
      const name = t(`pinballCh_${this.tip.channel}`);
      const others = GROUPS.some((g) => g !== this.aud && CHANNELS.some((c) => P.hits[g][c] > 0));
      const txt = !any ? t(others ? 'pinballAiBorrow' : 'pinballAiStart') : t(this.tip.explore ? 'pinballAiExplore' : 'pinballAiExploit', { ch: name });
      ctx.fillStyle = color(this.tip.explore ? 'xr-pinball-explore' : 'xr-pinball-exploit');
      ctx.font = font('black', sm);
      wrap(ctx, txt, W - 2 * pad).slice(0, 2).forEach((ln, i) => ctx.fillText(ln, pad, yT + i * sm * 1.2));
    }
    const mn = c.m(num('xr-text-min'));
    ctx.fillStyle = color('xr-panel-muted');
    ctx.font = font('regular', mn);
    wrap(ctx, t('pinballAiLegend'), W - 2 * pad).slice(0, 2).forEach((ln, i) => ctx.fillText(ln, pad, yT + sm * 2.55 + i * mn * 1.2));
  }

  /** Phones held upright: six columns of bars under a one-line header. */
  drawPlanCompact(ctx, c) {
    c.surface({ stroke: color('xr-pinball-ai') });
    const P = this.planner;
    if (!P) return;
    const W = c.canvas.width;
    const H = c.canvas.height;
    const pad = c.m(0.03);
    const sm = c.m(num('xr-text-sm'));
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = color('xr-pinball-ai');
    ctx.font = font('black', sm);
    const head = `${t('pinballAiTitle')}  ·  ${t(`pinballGr_${this.aud}`)}`;
    fitText(ctx, head, W - 2 * pad, sm, 'black');
    ctx.fillText(head, pad, c.m(0.04));
    const colW = (W - 2 * pad) / CHANNELS.length;
    const top = c.m(0.08);
    const bottom = H - c.m(0.1);
    CHANNELS.forEach((ch, i) => {
      const x = pad + colW * (i + 0.5);
      const post = P.posterior(this.aud, ch);
      const tip = this.tip?.channel === ch;
      if (tip) {
        ctx.fillStyle = color('xr-pinball-ai-band');
        ctx.beginPath();
        ctx.roundRect(x - colW / 2 + c.m(0.004), top - c.m(0.01), colW - c.m(0.008), H - top - c.m(0.012), c.m(0.012));
        ctx.fill();
      }
      const bw = colW * 0.36;
      const hgt = bottom - top;
      ctx.fillStyle = color('xr-pinball-bar-bg');
      ctx.fillRect(x - bw / 2, top, bw, hgt);
      ctx.fillStyle = color('xr-pinball-ai-band');
      ctx.fillRect(x - bw, bottom - post.hi * hgt, bw * 2, (post.hi - post.lo) * hgt);
      ctx.fillStyle = color(CH_TOKEN[ch]);
      ctx.fillRect(x - bw / 2, bottom - post.mean * hgt, bw, post.mean * hgt);
      ctx.fillStyle = color('xr-panel-text');
      ctx.fillRect(x - bw, bottom - post.mean * hgt - c.m(0.002), bw * 2, c.m(0.004));
      drawGlyph(ctx, ch, x, H - c.m(0.05), c.m(0.05), color(CH_TOKEN[ch]), tip ? 2.6 : 1.9);
    });
  }

  dispose() {
    this.mode = 'over';
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKey);
    for (const [ctrl, type, fn] of this.xrListeners ?? []) ctrl.removeEventListener(type, fn);
    this.app.echo?.suppress(false);
    this.engine.fitEnabled = true;
    if (!this.engine.isXR) this.engine.camera.rotation.set(0, 0, 0);
    this.engine.renderer.shadowMap.enabled = false;
    this.engine.scene.environment = this.prevEnvironment ?? null;
    this.envTarget?.dispose();
    for (const s of this.popups ?? []) s?.tex?.dispose?.();
    this.planPanel?.dispose?.();
    this.machine?.dispose?.(); // every ball's trail, the effects and what the machine made itself
    this.machine = null;
    this.timers = [];
    super.dispose();
  }
}

/** Shrinks the current font until text fits maxW. */
function fitText(ctx, text, maxW, px, weight) {
  let p = px;
  const min = (px / num('xr-text-sm')) * num('xr-text-min'); // never below the design minimum
  while (ctx.measureText(text).width > maxW && p > min) {
    p -= 1;
    ctx.font = font(weight, p);
  }
}
