// "Kampagnen-Flipper" / "Campaign Pinball": a pinball machine in front of you (in AR it stands
// on the real floor at table height). The ball is your message; the channels are poster (the
// advertising column), social media (pop bumpers), e-mail (drop targets), app (right ramp),
// branch office (the saucer at the little house) and video (left ramp). Every hit reaches
// people of the current target group (chosen with the four lanes at the top) and some of them
// respond. The AI campaign planner, a multi-armed bandit with Thompson sampling, learns the
// response rates from these hits, shows its estimates with their uncertainty on a panel and
// lights up the channel it recommends next; following its tip pays a bonus when it was right.
// All six channels with one ball: campaign complete, reach x2 (then x3). 3 balls, ball save at
// the start of each ball, 3 minutes. Own 2D physics (pinball-physics.js) with 1 ms sub-steps.
import * as THREE from 'three';
import { BaseScene } from '../scene.js';
import { Panel, Button, textPanel, placeOnArc } from '../ui3d.js';
import { color, num, font } from '../tokens.js';
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
import { loadPinballModel, buildMachine, CH_TOKEN, TARGETS, drawGlyph, glyphSVG, fp } from '../pinball-visuals.js';

const BALLS = 3;
const DURATION = EVENT ? 120 : 180; // seconds of campaign time
const SAVE_TIME = 10; // ball save after each launch
const MAX_SCORE = 5000;
const DROP = 0.66; // playfield front below eye height (table height)
const FRONT_Z = -0.4; // playfield front edge in front of the player
const AUTO_LAUNCH = 12; // seconds in the shooter lane before the ball launches by itself
const REPLAN = 15; // seconds before the planner gives a new tip if its tip was not followed
const PULL_TIME = 0.9; // seconds to pull the plunger all the way
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
    const key = (this.key = new THREE.DirectionalLight(0xffffff, 1.15));
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
    this.flasher = new THREE.PointLight(0xffffff, 0, 0.5, 2);
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
    if (this.mode === 'intro') this.machineDown(true, true);
  }

  /** The AI planner's panel: estimates per channel with uncertainty, its tip, explore/exploit. */
  buildPlanPanel() {
    this.planPanel?.removeFromParent();
    this.planPanel?.dispose();
    const compact = this.layoutMode === 'portrait';
    const p = (this.planPanel = compact ? new Panel(0.78, 0.36, (ctx, c) => this.drawPlanCompact(ctx, c)) : new Panel(0.66, 0.62, (ctx, c) => this.drawPlan(ctx, c)));
    p.userData.noFit = true;
    this.group.add(p);
    this.planKey = '';
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
      if (down) {
        sfx.thud();
        const p = this.engine.pointers.find((q) => q.kind === 'xr' && q.active && q.source?.handedness === k);
        this.engine.haptic(p, 0.35, 18);
      }
    }
    if (k === 'plunger' && !down) this.launch();
  }

  grabPlunger(p) {
    if (this.mode !== 'ready') return;
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
    if (this.machine) this.machineDown(true);
  }

  /** The machine sinks a little behind the intro and results, and rises for the game. */
  machineDown(down, instant = false) {
    const m = this.machine;
    if (!m) return;
    const to = this.machineY - (down ? 0.32 : 0);
    const from = m.root.position.y;
    if (instant || Math.abs(to - from) < 1e-4) { m.root.position.y = to; return; }
    this.tween(0.9, (k) => { m.root.position.y = from + (to - from) * k; });
  }

  start() {
    this.clearLayer();
    this.refreshHud ??= this.hud(() => this.hudText());
    this.placeHud();
    this.app.echo?.suppress(true);
    this.startMusic(1);
    const r = rng();
    Object.assign(this, {
      rand: r, truth: makeTruth(r), planner: new Planner(r),
      score: 0, ballNo: 1, playT: 0, mult: 1, campaigns: 0, conv: 0, contacts: 0, tipsRight: 0, tipsFollowed: 0,
      chBall: new Set(), lanesLit: new Set(), aud: GROUPS[Math.floor(r() * GROUPS.length)],
      tip: null, tipSince: 0, msg: null, hurried: false, saveUntil: 0, idle: 0,
    });
    this.machineDown(false);
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
        sfx.boing();
        this.channelHit('social', obj.x, obj.y);
        break;
      }
      case 'kick':
        this.score += 1;
        sfx.bounce();
        if (this.machine) this.machine.slings[obj.side > 0 ? 0 : 1].userData.flash.opacity = 1;
        break;
      case 'hit':
        if (obj.tag === 'email') {
          const d = T.drops[obj.index];
          if (d.down) break;
          d.down = true;
          obj.enabled = false;
          sfx.hit();
          this.channelHit('email', d.x + 0.02, d.y);
          if (T.drops.every((q) => q.down)) {
            this.addPoints(60);
            this.message(t('pinballDmdDrops', { n: 60 * this.mult }), '', 1.6);
            this.after(1.2, () => { if (!this.disposed) T.drops.forEach((q) => { q.down = false; q.seg.enabled = true; }); });
          }
        } else if (obj.tag === 'poster') {
          sfx.tink();
          this.channelHit('poster', obj.x, obj.y);
        }
        break;
      case 'saucer':
        sfx.grab();
        this.channelHit('branch', obj.x, obj.y);
        break;
      case 'kickout':
        sfx.jump();
        break;
      case 'rampEnter':
        sfx.whoosh();
        break;
      case 'rampDone': {
        sfx.powerup();
        this.addPoints(15);
        const end = obj.pts[obj.pts.length - 1];
        this.channelHit(obj.channel, end[0], end[1]);
        break;
      }
      case 'sensor':
        if (obj.tag === 'lane') this.laneHit(obj.index);
        break;
      case 'drain':
        this.drained();
        break;
      default:
    }
  }

  addPoints(n) {
    this.score += n * this.mult;
  }

  /** A channel was hit: people of the current target group are reached, some respond. */
  channelHit(ch, x, y) {
    const n = ch === 'social' ? 3 : 10;
    const p = this.truth[this.aud][ch];
    const k = respond(n, p, this.rand);
    this.planner.observe(this.aud, ch, k, n);
    this.conv += k;
    this.contacts += n;
    let pts = (ch === 'social' ? 2 : 12) + 6 * k;
    const followed = this.tip?.channel === ch;
    let line = t('pinballDmdHit', { ch: t(`pinballCh_${ch}`).toUpperCase(), k, n });
    if (followed) {
      // Right when this channel reached more people than the group's channels do on average.
      const avg = CHANNELS.reduce((s, c) => s + this.truth[this.aud][c], 0) / CHANNELS.length;
      this.tipsFollowed += 1;
      if (k / n >= avg) {
        this.tipsRight += 1;
        pts += 40;
        line = t('pinballDmdTipRight', { n: 40 * this.mult });
        sfx.coin();
      } else {
        line = t('pinballDmdTipWeak');
      }
      this.replan();
    }
    this.addPoints(pts);
    this.popup(`+${pts * this.mult}`, CH_TOKEN[ch], x, y);
    if (ch !== 'social' || followed || !this.msg) this.message(this.shownScore(), line, ch === 'social' && !followed ? 0.8 : 1.6);
    this.flash(CH_TOKEN[ch], x, y);
    this.chBall.add(ch);
    if (this.chBall.size === CHANNELS.length) this.campaignComplete();
  }

  campaignComplete() {
    this.campaigns += 1;
    this.mult = Math.min(3, this.mult + 1);
    this.addPoints(150);
    this.chBall.clear();
    sfx.finish();
    this.message(t('pinballDmdComplete'), t('pinballDmdMulti', { n: this.mult }), 2.6);
    if (this.machine) {
      for (const ch of CHANNELS) {
        const [x, y] = TARGETS[ch];
        this.burst(this.machine.world(x, y, 0.04), CH_TOKEN[ch], 16);
      }
    }
  }

  laneHit(i) {
    const g = GROUPS[i];
    this.addPoints(5);
    sfx.tick();
    if (this.skillOpen && this.playT - this.launchedAt < 4) {
      this.addPoints(25);
      this.message(t('pinballDmdSkill', { n: 25 * this.mult }), t(`pinballGr_${g}`).toUpperCase(), 1.6);
    }
    this.skillOpen = false;
    this.lanesLit.add(i);
    if (g !== this.aud) {
      this.aud = g;
      this.message(t('pinballDmdGroup', { g: t(`pinballGr_${g}`).toUpperCase() }), '', 1.6);
      this.replan();
    }
    if (this.lanesLit.size === GROUPS.length) {
      this.addPoints(60);
      this.message(t('pinballDmdAllGroups', { n: 60 * this.mult }), '', 1.8);
      this.after(0.6, () => { if (!this.disposed) this.lanesLit.clear(); });
    }
  }

  drained() {
    if (this.mode !== 'play' && this.mode !== 'ready') return;
    if (this.playT < this.saveUntil) {
      this.mode = 'drain';
      this.message(t('pinballDmdSave'), '', 1.6);
      sfx.appear();
      this.after(0.8, () => { if (!this.disposed && this.mode === 'drain') this.serve(true); });
      return;
    }
    this.mode = 'drain';
    sfx.wrong();
    this.mult = 1;
    this.chBall.clear();
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
    this.message(t(key), String(this.shownScore()), 3);
    sfx.finish();
    this.pad?.show(false);
    this.after(1.8, () => { if (!this.disposed) this.finish(); });
  }

  finish() {
    this.app.echo?.suppress(false);
    this.machineDown(true);
    this.planPanel.visible = false;
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
      line: t('pinballLine', { score, conv: this.conv, c: this.campaigns, tips: this.tipsRight }),
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
    const p = this.planPanel;
    if (!p || !this.machine) return;
    if (mode === 'portrait') {
      const top = this.machineY + 0.92 * this.S;
      p.rotation.set(-(this.pitch ?? 0.98), 0, 0);
      p.position.set(0, top + 0.12, FRONT_Z - 1.12 * this.S);
    } else if (mode === 'xr') {
      placeOnArc(p, -0.62, this.eye - 0.12, 1.08);
    } else {
      // Browser: left of the machine, facing the camera.
      p.rotation.set(-(this.pitch ?? 0.78), 0, 0);
      p.position.set(-0.66, this.eye - 0.36, FRONT_Z - 0.62);
    }
  }

  /** The 3D status bar and its menu button: above the machine's head. */
  placeHud() {
    if (this.engine.touchUI) return;
    const parts = this.group.children.filter((o) => o.userData.hud);
    const y = this.machineY + 1.0 * this.S;
    for (const o of parts) {
      o.position.y = y;
      o.position.z = FRONT_Z - 1.17 * this.S;
    }
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
    const field = [[-0.27, -0.03], [0.32, -0.03], [-0.27, 1.07], [0.32, 1.07]];
    for (const [x, y] of field) pts.push(m.world(x, y, 0), m.world(x, y, 0.07));
    const head = m.root;
    const top = new THREE.Vector3(0, 0.86, -1.08);
    for (const x of [-0.29, 0.34]) pts.push(head.localToWorld(top.clone().setX(x)));
    pts.push(head.localToWorld(new THREE.Vector3(0.025, -0.05, 0.15))); // plunger knob, lockdown
    const add = (o) => {
      if (!o?.visible) return;
      const hw = (o.w ?? 0.5) / 2;
      const hh = (o.h ?? 0.3) / 2;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pts.push(o.localToWorld(new THREE.Vector3(sx * hw, sy * hh, 0)));
    };
    if (this.mode !== 'intro' && this.planPanel?.visible) {
      add(this.planPanel);
      // Keep the machine in the middle of the screen: mirror the panel's outer edge.
      if (this.layoutMode === 'wide') pts.push(this.planPanel.localToWorld(new THREE.Vector3(-this.planPanel.w / 2, 0, 0)).multiply(new THREE.Vector3(-1, 1, 1)));
    }
    if (this.mode === 'intro') { add(this.introPanel); add(this.introGo); }
    if (!this.engine.touchUI && this.mode !== 'intro') for (const o of this.group.children) if (o.userData.hud) add(o);
    return pts;
  }

  /** Browser preview: the player's view down onto the machine (phones and desktop). */
  previewCamera(dt, cam, ins) {
    if (!this.machine || this.mode === 'over') return false;
    const portrait = cam.aspect < 0.85;
    const intro = this.mode === 'intro';
    const pitch = intro ? 0.3 : portrait ? 0.98 : 0.78;
    this.pitch = pitch;
    // Panels face the camera, so they read without distortion.
    if (intro) for (const o of [this.introPanel, this.introGo]) if (o) o.rotation.x = -pitch;
    if (!this.engine.touchUI) for (const o of this.group.children) if (o.userData.hud) o.rotation.x = -pitch;
    this.group.updateMatrixWorld(true);
    const { pos, quat } = this.fitCamera(cam, pitch, this.framePoints(), ins, portrait ? 1.02 : 1.05);
    const k = this.camInit ? Math.min(1, dt * 4) : 1;
    this.camInit = true;
    if (cam.fov !== 60) { cam.fov = 60; cam.updateProjectionMatrix(); }
    cam.position.lerp(pos, k);
    cam.quaternion.slerp(quat, k);
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
    if (playing || this.mode === 'drain') T.world.step(dt);
    // The gate swings when the ball leaves the shooter lane.
    const b = T.world.ball;
    if (this.machine && b.mode === 'field' && b.x > 0.245 && b.y > 0.78 && b.y < 0.86 && b.vy > 0) this.machine.gate.rotation.x = Math.min(1.2, b.vy * 0.6);
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
      m.update(dt, this.time, { pull: this.pull });
      // Inserts: channels hit with this ball glow, the AI's tip blinks, lanes, multiplier, save.
      const blink = 0.5 + 0.5 * Math.sin(this.time * 9);
      const attract = this.mode === 'intro' || this.mode === 'over';
      CHANNELS.forEach((ch, i) => {
        const ins = m.inserts[ch];
        if (attract) ins.level = 0.5 + 0.5 * Math.sin(this.time * 3 - i * 0.9);
        else ins.level = this.tip?.channel === ch ? 0.35 + 0.65 * blink : this.chBall?.has(ch) ? 0.75 : 0.08;
      });
      GROUPS.forEach((g, i) => {
        const ins = m.inserts[`lane${i}`];
        if (attract) ins.level = 0.5 + 0.5 * Math.sin(this.time * 4 + i);
        else ins.level = g === this.aud ? 0.55 + 0.45 * blink : this.lanesLit?.has(i) ? 0.7 : 0.1;
      });
      m.inserts.multi.level = attract ? 0.3 : this.mult > 1 ? 0.6 + 0.4 * blink : 0.08;
      m.inserts.save.level = !attract && this.playT < this.saveUntil && (this.mode === 'play' || this.mode === 'ready') ? 0.5 + 0.5 * blink : 0.05;
      // Legs to the real floor.
      const at = m.root.getWorldPosition(new THREE.Vector3());
      m.setFloor(m.root.worldToLocal(at.setY(e.floorY)).y);
      this.knob.position.copy(fp(LANE_X, PLUNGER_Y - this.pull * 0.05 - 0.205, 0.012));
      this.knob.visible = this.mode === 'ready';
    }
    this.flasher.intensity = Math.max(0, this.flasher.intensity - dt * 6);
    for (const s of this.popups) {
      if (s.life <= 0) { s.sp.visible = false; continue; }
      s.life -= dt * 1.1;
      s.sp.visible = true;
      s.sp.position.copy(s.at).add(new THREE.Vector3(0, (1 - s.life) * 0.07, 0));
      s.sp.material.opacity = Math.min(1, s.life * 2.5);
    }
    if (this.snow) {
      const floor = e.floorY - e.root.position.y;
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
    // Results stand in front of the machine: draw them on top.
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
    p.visible = this.mode !== 'over' && this.mode !== 'intro';
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
      const txt = !any ? t('pinballAiStart') : t(this.tip.explore ? 'pinballAiExplore' : 'pinballAiExploit', { ch: name });
      ctx.fillStyle = color(this.tip.explore ? 'xr-pinball-explore' : 'xr-pinball-exploit');
      ctx.font = font('black', sm);
      fitText(ctx, txt, W - 2 * pad, sm, 'black');
      ctx.fillText(txt, pad, yT);
    }
    ctx.fillStyle = color('xr-panel-muted');
    ctx.font = font('regular', c.m(num('xr-text-min')));
    fitText(ctx, t('pinballAiLegend'), W - 2 * pad, c.m(num('xr-text-min')), 'regular');
    ctx.fillText(t('pinballAiLegend'), pad, yT + c.m(0.05));
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
    for (const s of this.popups) s.tex.dispose();
    this.planPanel?.dispose();
    this.machine?.trail.mesh.geometry.dispose();
    this.machine?.owned.forEach((o) => o.dispose?.());
    super.dispose();
  }
}

/** Shrinks the current font until text fits maxW. */
function fitText(ctx, text, maxW, px, weight) {
  let p = px;
  while (ctx.measureText(text).width > maxW && p > px * 0.6) {
    p -= 1;
    ctx.font = font(weight, p);
  }
}
