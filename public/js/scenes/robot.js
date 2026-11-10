// "Train Echo": Echo, the mascot, flies over a field on the real floor and learns with tabular Q-learning,
// live in the browser. Level 1 shows learning, level 2 lets the player lay out a route
// with arrows that Echo flies along and learns from (learning from demonstration), level 3 lets
// the player design the reward and discover reward hacking.
import * as THREE from 'three';
import { BaseScene, layoutRow } from '../scene.js';
import { Button, Panel, textPanel, placeOnArc } from '../ui3d.js';
import { color, hex, num, font } from '../tokens.js';
import { t, L } from '../i18n.js';
import { ROBOT_LEVELS, ROBOT_RULES, ROBOT_FINAL, SPONSOR } from '../content.js';
import { sfx } from '../sfx.js';
import { makeArena, makeBlock, makeGoal, makeTrailDot, makeEnvironment, makePlanLayer } from '../robot-visuals.js';
import { EchoBuddy } from '../echo-buddy.js';
import { award } from '../badges.js';
import { track } from '../api.js';
import { EVENT } from '../event.js';

const N = 7;
const TILE = 0.22;
const ARENA_Z = -1.3;
const GAMMA = 0.95;
const ALPHA = 0.5;
const MAX_STEPS = 40;
const SHOW_STEPS = 24;
const LIVE_STEPS = 20; // random live episodes stay short so nobody waits too long
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // away from the player, right, towards, left
const SPEED = { live: 0.32, run: 0.5, show: 0.34 };
const TURBO_STEPS_PER_FRAME = 8; // turbo speed independent of the frame rate
const REPLAYS = 5; // how often Echo replays the walked route in its memory after a run
const PRACTICE_EPS = 0.3; // exploration when Echo practices alone after the demonstration

// ---------- learning ----------

class Learner {
  constructor(level, rule) {
    this.rule = rule;
    this.Q = new Float32Array(N * N * 4);
    this.blocked = new Set(level.walls.map(([x, z]) => x + z * N));
    this.goal = level.goal[0] + level.goal[1] * N;
    this.start = level.start[0] + level.start[1] * N;
  }

  move(s, a) {
    const x = (s % N) + DIRS[a][0];
    const z = Math.floor(s / N) + DIRS[a][1];
    if (x < 0 || z < 0 || x >= N || z >= N || this.blocked.has(x + z * N)) return { s2: s, bump: true };
    return { s2: x + z * N, bump: false };
  }

  dist(s) {
    return Math.abs((s % N) - (this.goal % N)) + Math.abs(Math.floor(s / N) - Math.floor(this.goal / N));
  }

  reward(s, s2, bump) {
    const done = s2 === this.goal;
    let r = done ? 10 : 0;
    if (bump) r -= 1;
    r += this.rule === 'steps' ? 1 : -0.1;
    if (this.rule === 'shaping' && !bump && !done) r += this.dist(s2) < this.dist(s) ? 0.5 : -0.5;
    return { r, done };
  }

  best(s) {
    let best = 0;
    let bv = -Infinity;
    for (let a = 0; a < 4; a++) {
      const v = this.Q[s * 4 + a] + Math.random() * 1e-6;
      if (v > bv) { bv = v; best = a; }
    }
    return best;
  }

  value(s) {
    return Math.max(this.Q[s * 4], this.Q[s * 4 + 1], this.Q[s * 4 + 2], this.Q[s * 4 + 3]);
  }

  act(s, eps) {
    return Math.random() < eps ? Math.floor(Math.random() * 4) : this.best(s);
  }

  /** Demo policy: the best action that does not walk into a wall or the edge. */
  bestFree(s) {
    const order = [0, 1, 2, 3].sort((a, b) => this.Q[s * 4 + b] - this.Q[s * 4 + a] + (Math.random() - 0.5) * 1e-6);
    return order.find((a) => !this.move(s, a).bump) ?? order[0];
  }

  learn(s, a, r, s2, done) {
    const i = s * 4 + a;
    const target = r + (done ? 0 : GAMMA * this.value(s2));
    this.Q[i] += ALPHA * (target - this.Q[i]);
  }
}

// ---------- 3D helpers ----------

function cellPos(s) {
  return new THREE.Vector3(((s % N) - (N - 1) / 2) * TILE, 0, (Math.floor(s / N) - (N - 1) / 2) * TILE);
}

// ---------- scene ----------

export class RobotScene extends BaseScene {
  constructor(app) {
    super(app);
    this.levelIndex = 0;
    this.time = 0;
    this.mode = 'idle';
    this.showMind = true;
    this.history = [];
    this.refreshHud = this.hud(() => {
      const lv = ROBOT_LEVELS[this.levelIndex];
      const rate = this.successRate();
      return `${t('robotName')}  ·  ${L(lv.title).split(':')[0]}  ·  ${t('robotEpisode')} ${this.history.length}  ·  ${t('robotSuccess')} ${rate}%`;
    });

    this.buildArena();
    this.onUpdate((dt) => this.update(dt));
    this.startLevel(0);
  }

  // ----- arena -----

  buildArena() {
    const arena = (this.arena = new THREE.Group());
    arena.position.set(0, 0, ARENA_Z);
    this.group.add(arena);
    const built = makeArena(N, TILE);
    arena.add(built.group);
    Object.assign(this, { tiles: built.tiles, heat: built.heat, arrows: built.arrows, surfaceY: built.surfaceY });

    // Everything that stands on the tiles lives in "field", lifted to the tile surface.
    this.field = new THREE.Group();
    this.field.position.y = this.surfaceY;
    arena.add(this.field);
    // The learner is Echo, the mascot (the free-flying Echo pauses meanwhile).
    this.bit = new EchoBuddy();
    this.app.echo?.suppress(true);
    this.robot = this.bit.group;
    this.coin = makeGoal();
    this.walls = new THREE.Group();
    this.trail = new THREE.Group();
    this.field.add(this.walls, this.trail, this.coin, this.robot);
    this.bubble = this.makeBubble();
    this.field.add(this.bubble);

    // Level 2: arrows the player places. The tiles become tappable while planning.
    this.planLayer = makePlanLayer(N, TILE);
    this.planLayer.group.position.y = this.surfaceY;
    this.planLayer.group.visible = false;
    arena.add(this.planLayer.group);
    this.plan = new Int8Array(N * N).fill(-1);
    this.planUndo = [];
    this.tiles.userData.onClick = (p) => {
      const id = p.pressHit?.object === this.tiles ? p.pressHit.instanceId : p.hit?.instanceId;
      if (this.mode !== 'plan' || id == null) return;
      this.tapTile(id);
    };

    // Glossy reflections for the robot and blocks (removed again when the scene closes).
    this.envTarget = makeEnvironment(this.engine.renderer);
    this.prevEnvironment = this.engine.scene.environment;
    this.engine.scene.environment = this.envTarget.texture;
  }

  /** Billboard speech bubble above Echo, e.g. "No arrow?" when it gets stuck. */
  makeBubble() {
    const c = document.createElement('canvas');
    c.width = 520;
    c.height = 220;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0, depthTest: false }));
    sprite.scale.set(0.34, 0.144, 1);
    sprite.renderOrder = 10;
    sprite.visible = false;
    sprite.userData.noFit = true;
    sprite.userData.canvas = c;
    sprite.userData.life = 0;
    return sprite;
  }

  /** Shows the speech bubble with a short text for a few seconds. */
  say(text, seconds = 2.5) {
    const c = this.bubble.userData.canvas;
    const W = c.width;
    const H = c.height;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    const r = 40;
    ctx.fillStyle = color('xr-panel-bg');
    ctx.strokeStyle = color('xr-warning');
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(r, 8);
    ctx.lineTo(W - r, 8);
    ctx.quadraticCurveTo(W - 8, 8, W - 8, r);
    ctx.lineTo(W - 8, H - 70);
    ctx.quadraticCurveTo(W - 8, H - 50, W - r, H - 50);
    ctx.lineTo(W / 2 + 30, H - 50);
    ctx.lineTo(W / 2, H - 8);
    ctx.lineTo(W / 2 - 30, H - 50);
    ctx.lineTo(r, H - 50);
    ctx.quadraticCurveTo(8, H - 50, 8, H - 70);
    ctx.lineTo(8, r);
    ctx.quadraticCurveTo(8, 8, r, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color('xr-panel-text');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let px = 78;
    do { ctx.font = font('black', px); px -= 4; } while (ctx.measureText(text).width > W - 60);
    ctx.fillText(text, W / 2, (H - 50) / 2 + 6);
    this.bubble.material.map.needsUpdate = true;
    this.bubble.userData.life = seconds;
  }

  setupLevel(level) {
    this.walls.children.slice().forEach((w) => {
      w.removeFromParent();
      w.traverse((o) => { o.geometry?.dispose(); o.material?.dispose(); });
    });
    level.walls.forEach(([x, z], i) => {
      const b = makeBlock(TILE);
      b.position.copy(cellPos(x + z * N));
      b.userData.phase = i * 0.7;
      this.walls.add(b);
    });
    this.coin.position.copy(cellPos(level.goal[0] + level.goal[1] * N));
    this.placeRobot(level.start[0] + level.start[1] * N);
    this.history = [];
    this.updateMind();
  }

  placeRobot(s) {
    this.robotCell = s;
    this.robot.position.copy(cellPos(s));
    this.robot.rotation.y = Math.PI; // face away from the player, towards the field
    this.anim = null;
  }

  // ----- levels -----

  startLevel(i) {
    this.levelIndex = i;
    const level = ROBOT_LEVELS[i];
    this.level = level;
    this.mode = 'idle';
    this.learner = new Learner(level, level.rule ?? 'coin');
    this.setupLevel(level);
    this.eps = 1;
    this.plan.fill(-1);
    this.planUndo = [];
    this.planLayer.group.visible = false;
    this.refreshPlan();
    this.refreshHud();
    const buttons = level.choose
      ? ROBOT_RULES.map((rule) => new Button(1.0, 0.1, { label: L(rule.label), labelSize: 'xr-text-sm', onClick: () => this.chooseRule(rule) }))
      : level.plan
        ? [new Button(0.42, 0.12, { label: t('robotPlanStart'), variant: 'primary', onClick: () => this.startPlan() })]
        : [new Button(0.42, 0.12, { label: t('robotStart'), variant: 'primary', onClick: () => this.startLive() })];
    const p = this.panel(L(level.title), L(level.intro), buttons, { column: !!level.choose });
    this.app.host?.introduce(this, `robot${i}`, p);
    this.startMusic(-1, 'robot'); // calm, so Echo's learning steps stay audible
  }

  startLive() {
    const level = this.level;
    if (!level.live) { this.startTurbo(); return; }
    this.mode = 'live';
    this.liveLeft = level.live;
    this.liveTime = 0;
    this.newEpisode();
    const buttons = [new Button(0.44, 0.12, { label: t('robotTurbo', { n: level.turbo }), variant: 'primary', onClick: () => this.startTurbo() })];
    this.panel(L(level.title), t('robotLearning'), buttons);
  }

  // ----- level 2: lay out arrows, Echo walks the route and learns from it -----

  startPlan() {
    this.mode = 'plan';
    this.newEpisode();
    this.planLayer.group.visible = true;
    this.refreshPlan();
    this.updateMind();
    this.planPanel();
  }

  planPanel() {
    const undo = new Button(0.26, 0.12, { label: t('robotPlanUndo'), onClick: () => this.undoPlan() });
    const clear = new Button(0.3, 0.12, { label: t('robotPlanClear'), onClick: () => this.clearPlan() });
    const go = new Button(0.34, 0.12, { label: t('robotPlanGo'), variant: 'primary', onClick: () => this.startRun() });
    undo.set({ disabled: this.planUndo.length === 0 });
    clear.set({ disabled: this.planUndo.length === 0 });
    this.planButtons = { undo, clear };
    this.panel(L(this.level.title), t('robotPlanHint'), [undo, clear, go]);
  }

  /** Follows the arrows from the start: route cells, end cell and how the route ends. */
  tracePlan() {
    const L_ = this.learner;
    const cells = [L_.start];
    const seen = new Set(cells);
    let s = L_.start;
    for (;;) {
      if (s === L_.goal) return { cells, end: s, status: 'goal' };
      const a = this.plan[s];
      if (a < 0) return { cells, end: s, status: 'open' };
      const { s2, bump } = L_.move(s, a);
      if (bump) return { cells, end: s, status: 'wall' };
      if (seen.has(s2)) return { cells, end: s, status: 'loop' };
      cells.push(s2);
      seen.add(s2);
      s = s2;
    }
  }

  /** Tap on a tile: extend the route next to its end, or turn an existing arrow. */
  tapTile(s) {
    const L_ = this.learner;
    if (L_.blocked.has(s)) return;
    const route = this.tracePlan();
    const ex = s % N;
    const ez = Math.floor(s / N);
    const dir = DIRS.findIndex(([dx, dz]) => (route.end % N) + dx === ex && Math.floor(route.end / N) + dz === ez);
    sfx.click();
    if (route.status === 'open' && dir >= 0 && !route.cells.includes(s)) {
      this.planUndo.push({ s: route.end, prev: this.plan[route.end] });
      this.plan[route.end] = dir;
    } else if (s !== L_.goal) {
      this.planUndo.push({ s, prev: this.plan[s] });
      this.plan[s] = this.plan[s] >= 3 ? -1 : this.plan[s] + 1;
    } else {
      return;
    }
    const before = route.status;
    this.refreshPlan();
    if (before !== 'goal' && this.planRoute.status === 'goal') {
      sfx.correct();
      this.burst(this.coin.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.1, 0)), 'xr-robot-plan', 14);
    }
    this.syncPlanButtons();
  }

  undoPlan() {
    const last = this.planUndo.pop();
    if (!last) return;
    this.plan[last.s] = last.prev;
    this.refreshPlan();
    this.syncPlanButtons();
  }

  clearPlan() {
    this.plan.fill(-1);
    this.planUndo = [];
    this.refreshPlan();
    this.syncPlanButtons();
  }

  syncPlanButtons() {
    const empty = this.planUndo.length === 0;
    this.planButtons?.undo.set({ disabled: empty });
    this.planButtons?.clear.set({ disabled: empty });
  }

  /** Colors the arrows (on the route, off the route, into a wall) and marks the next tiles. */
  refreshPlan() {
    const layer = this.planLayer;
    const L_ = this.learner;
    const route = (this.planRoute = this.tracePlan());
    const onRoute = new Set(route.cells);
    for (let s = 0; s < N * N; s++) {
      const dir = this.plan[s];
      let token = null;
      if (dir >= 0) {
        if (route.status === 'wall' && s === route.end) token = 'xr-danger';
        else if (route.status === 'loop' && s === route.end) token = 'xr-danger';
        else token = onRoute.has(s) ? 'xr-robot-plan' : 'xr-robot-plan-off';
      }
      layer.setArrow(s, dir, token);
      layer.setMark(s, null);
    }
    if (this.mode === 'plan' && route.status === 'open') {
      layer.setMark(route.end, 'xr-robot-plan', 0.9);
      DIRS.forEach((_, a) => {
        const { s2, bump } = L_.move(route.end, a);
        if (!bump && !onRoute.has(s2)) layer.setMark(s2, 'xr-robot-plan', 0.35);
      });
    }
    layer.commit();
  }

  startRun() {
    this.mode = 'run';
    this.newEpisode();
    this.runPath = [];
    this.visited = new Set([this.learner.start]);
    this.planLayer.setHover(null);
    this.refreshPlan();
    this.panel(L(this.level.title), t('robotRunning'), []);
  }

  /** One step along the player's arrows; Echo learns from every step like in normal training. */
  runStep() {
    const L_ = this.learner;
    const s = this.robotCell;
    const a = this.plan[s];
    if (a < 0) { this.endRun('noArrow'); return; }
    const { s2, bump } = L_.move(s, a);
    const { r, done } = L_.reward(s, s2, bump);
    L_.learn(s, a, r, s2, done);
    this.runPath.push({ s, a, r, s2, done });
    this.steps += 1;
    this.animateMove(s, s2, a, bump);
    this.updateMind();
    if (done) this.endRun('goal');
    else if (bump) this.endRun('wall');
    else if (this.visited.has(s2)) this.endRun('loop');
    else this.visited.add(s2);
  }

  endRun(reason) {
    this.mode = 'idle';
    const L_ = this.learner;
    // Echo replays the walked route in its memory, so the reward spreads back along the way.
    for (let k = 0; k < REPLAYS; k++) {
      for (let i = this.runPath.length - 1; i >= 0; i--) {
        const { s, a, r, s2, done } = this.runPath[i];
        L_.learn(s, a, r, s2, done);
      }
    }
    const success = reason === 'goal';
    this.history.push(success ? 1 : 0);
    this.refreshHud();
    this.chart?.redraw();
    this.updateMind();
    const level = this.level;
    this.delay(SPEED.run, () => {
      if (this.disposed || this.mode !== 'idle') return;
      if (success) {
        this.planSteps = this.steps;
        sfx.correct();
        this.coinPop();
        this.planLayer.group.visible = false; // now the floor shows Echo's own arrows
        this.updateMind();
        this.panel(t('robotRunGoal'), t('robotRunLearned', { n: this.steps }), [
          new Button(0.32, 0.12, { label: t('robotPlanFix'), onClick: () => this.startPlan() }),
          new Button(0.5, 0.12, { label: t('robotSelfPractice', { n: level.turbo }), variant: 'primary', onClick: () => { this.eps = PRACTICE_EPS; this.startTurbo(); } }),
        ]);
        return;
      }
      sfx.wrong();
      this.mood('sad');
      this.say(t({ noArrow: 'robotNoArrow', wall: 'robotWallHit', loop: 'robotLoopHit' }[reason]), 3);
      const why = t({ noArrow: 'robotRunFailNoArrow', wall: 'robotRunFailWall', loop: 'robotRunFailLoop' }[reason]);
      this.panel(t('robotRunFail'), why, [
        new Button(0.42, 0.12, { label: t('robotPlanFix'), variant: 'primary', onClick: () => this.startPlan() }),
      ]);
    });
  }

  startTurbo(count = this.level.turbo) {
    this.mode = 'turbo';
    this.planLayer.group.visible = false;
    this.turboLeft = count;
    this.eps = Math.min(this.eps, 0.9);
    this.newEpisode();
    sfx.build();
    this.panel(L(this.level.title), t('robotTurboRunning', { n: count }), []);
  }

  startShow() {
    this.mode = 'show';
    this.newEpisode();
    this.panel(L(this.level.title), t('robotShowRunning'), []);
  }

  chooseRule(rule) {
    this.rule = rule;
    this.learner = new Learner(this.level, rule.key);
    this.history = [];
    this.eps = 1;
    this.updateMind();
    this.startTurbo();
  }

  onTurboDone() {
    this.mode = 'idle';
    this.panel(L(this.level.title), t('robotTurboDone'), [
      new Button(0.48, 0.12, { label: t('robotShow'), variant: 'primary', onClick: () => this.startShow() }),
    ]);
  }

  onShowDone(success) {
    this.mode = 'idle';
    const level = this.level;
    if (level.choose) {
      const hack = this.rule.key === 'steps';
      if (hack) sfx.wrong(); else this.celebrate();
      const buttons = [new Button(0.46, 0.12, { label: t('robotOtherRule'), onClick: () => this.startLevel(this.levelIndex) })];
      if (!hack) buttons.push(new Button(0.42, 0.12, { label: t('robotFinish'), variant: 'primary', onClick: () => this.finish() }));
      this.panel(hack ? t('robotHackTitle') : t('robotRuleWorks'), L(this.rule.result), buttons, { warn: hack });
      return;
    }
    if (!success) {
      this.panel(L(level.title), t('robotMorePractice'), [
        new Button(0.44, 0.12, { label: t('robotTurbo', { n: 30 }), variant: 'primary', onClick: () => this.startTurbo(30) }),
      ]);
      return;
    }
    this.celebrate();
    let text = L(level.lesson);
    if (level.plan && this.planSteps) {
      const compare = t('robotPathCompare', { you: this.planSteps, bit: this.steps });
      text = `${compare}${this.steps < this.planSteps ? ` ${t('robotShortcut')}` : ''}\n\n${text}`;
    }
    this.panel(t('robotLevelDone'), text, [
      new Button(0.42, 0.12, { label: t('robotNextLevel'), variant: 'primary', onClick: () => this.startLevel(this.levelIndex + 1) }),
    ]);
  }

  finish() {
    sfx.finish();
    this.mode = 'idle';
    const finalPanel = this.panel(L(ROBOT_FINAL.title), `${L(ROBOT_FINAL.lessons)}\n\n${L(SPONSOR.presentedBy)}  ·  ${L(SPONSOR.offer)}`, [
      new Button(0.36, 0.12, { label: t('again'), variant: 'primary', onClick: () => this.startLevel(0) }),
      new Button(0.36, 0.12, { label: t('menu'), onClick: () => this.app.showMenu() }),
    ]);
    this.burst(this.robot.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.3, 0)), 'xr-warning', 50);
    track('finish', 'robot', EVENT);
    // AI licence: all three levels done = the reinforcement learning badge.
    const badge = award('rl');
    if (badge) this.app.host?.badge(this, badge, finalPanel);
  }

  // ----- episodes -----

  newEpisode() {
    this.placeRobot(this.learner.start);
    this.steps = 0;
    this.acc = 0;
    this.trail.children.slice().forEach((d) => { d.removeFromParent(); d.geometry.dispose(); d.material.dispose(); });
  }

  stepOnce() {
    const L_ = this.learner;
    const s = this.robotCell;
    const eps = this.mode === 'show' ? 0 : this.mode === 'turbo' ? this.eps : 1;
    const a = this.mode === 'show' ? L_.bestFree(s) : L_.act(s, eps);
    const { s2, bump } = L_.move(s, a);
    const { r, done } = L_.reward(s, s2, bump);
    if (this.mode !== 'show') L_.learn(s, a, r, s2, done);
    this.steps += 1;
    this.animateMove(s, s2, a, bump);
    if (this.mode !== 'turbo') this.updateMind();

    // A long player route may need more steps than the default show limit.
    const showLimit = Math.max(SHOW_STEPS, (this.planSteps ?? 0) + 4);
    const limit = this.mode === 'show' ? showLimit : this.mode === 'live' ? LIVE_STEPS : MAX_STEPS;
    if (done) this.endEpisode(true);
    else if (this.steps >= limit) this.endEpisode(false);
  }

  endEpisode(success) {
    if (this.mode !== 'show') this.history.push(success ? 1 : 0);
    if (success && this.mode !== 'turbo') { sfx.correct(); this.coinPop(); }
    this.refreshHud();
    this.chart?.redraw();
    this.updateMind();
    if (this.mode === 'turbo') {
      this.eps = Math.max(0.05, this.eps * 0.94);
      this.turboLeft -= 1;
      if (this.turboLeft <= 0) { this.onTurboDone(); return; }
      this.newEpisode();
    } else if (this.mode === 'live') {
      this.liveLeft -= 1;
      if (this.liveLeft <= 0) { this.mode = 'idle'; this.startTurbo(); return; }
      this.mode = 'live-wait';
      this.delay(0.5, () => {
        if (this.mode !== 'live-wait') return;
        this.newEpisode();
        this.mode = 'live';
      });
    } else if (this.mode === 'show') {
      const wasMode = this.mode;
      this.mode = 'idle';
      this.delay(success ? 0.6 : 0.2, () => { if (wasMode === 'show') this.onShowDone(success); });
    }
  }

  successRate() {
    const last = this.history.slice(-10);
    return last.length ? Math.round((last.reduce((a, b) => a + b, 0) / last.length) * 100) : 0;
  }

  // ----- visuals -----

  animateMove(s, s2, a, bump) {
    const from = cellPos(s);
    const to = cellPos(s2);
    const yaw = Math.atan2(DIRS[a][0], DIRS[a][1]);
    const dur = SPEED[this.mode] ?? 0.3; // turbo never animates
    if (this.mode === 'turbo') {
      this.robot.position.copy(to);
      this.robot.rotation.y = yaw;
      this.robotCell = s2;
      if (this.steps % 2 === 0) this.dropTrail(to);
      return;
    }
    this.robotCell = s2;
    this.anim = { from, to, yaw0: this.robot.rotation.y, yaw, t: 0, dur: dur * 0.85, bump };
    if (bump) this.mood('sad');
  }

  dropTrail(p) {
    const dot = makeTrailDot();
    dot.position.set(p.x, 0.004, p.z);
    dot.userData.life = 0.9;
    this.trail.add(dot);
  }

  mood(kind) {
    this.bit.setMood(kind, kind === 'happy' ? 1.2 : 0.8);
    if (kind === 'sad') this.shake = 0.35;
    if (kind === 'happy') this.hop = 0.45;
  }

  coinPop() {
    const p = this.coin.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.12, 0));
    this.burst(p, 'xr-robot-coin', 20);
    this.mood('happy');
  }

  celebrate() {
    sfx.finish();
    this.mood('happy');
    this.burst(this.robot.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.3, 0)), 'xr-success', 36);
  }

  /** Glowing floor (expected reward) and chevrons (preferred direction) = what the AI "thinks". */
  updateMind() {
    const Q = this.learner;
    const hot = new THREE.Color(hex('xr-robot-hot'));
    const cold = new THREE.Color(hex('xr-robot-cold'));
    let maxAbs = 1;
    for (let s = 0; s < N * N; s++) maxAbs = Math.max(maxAbs, Math.abs(Q.value(s)));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    for (let s = 0; s < N * N; s++) {
      const blocked = Q.blocked.has(s);
      const v = Q.value(s);
      const learned = Q.Q[s * 4] !== 0 || Q.Q[s * 4 + 1] !== 0 || Q.Q[s * 4 + 2] !== 0 || Q.Q[s * 4 + 3] !== 0;
      // Additive glow: black = no glow. Positive expectation glows strongly, negative only faintly.
      if (!this.showMind || blocked || !learned) c.setRGB(0, 0, 0);
      else if (v >= 0) c.copy(hot).multiplyScalar(0.25 + 0.75 * Math.min(1, v / maxAbs));
      else c.copy(cold).multiplyScalar(0.07 * Math.min(1, -v / maxAbs));
      this.heat.setColorAt(s, c);
      const p = cellPos(s);
      const a = Q.best(s);
      const show = this.showMind && learned && !blocked && s !== Q.goal && !this.planLayer.group.visible;
      q.setFromAxisAngle(up, -Math.atan2(DIRS[a][0], -DIRS[a][1]));
      m.compose(new THREE.Vector3(p.x, this.surfaceY + 0.004, p.z), q, new THREE.Vector3(show ? 1 : 0.0001, 1, show ? 1 : 0.0001));
      this.arrows.setMatrixAt(s, m);
    }
    this.heat.instanceColor.needsUpdate = true;
    this.arrows.instanceMatrix.needsUpdate = true;
  }

  update(dt) {
    this.time += dt;
    const engine = this.engine;
    // In XR the arena sits on the real floor (root space is anchored at eye level);
    // in the browser preview it stands at table height so everything fits on screen.
    this.arena.position.y = engine.isXR ? engine.floorY - engine.root.position.y : this.eye - 0.85;

    if (this.mode === 'turbo') {
      for (let i = 0; i < TURBO_STEPS_PER_FRAME && this.mode === 'turbo'; i++) this.stepOnce();
    } else if (this.mode === 'live' || this.mode === 'show' || this.mode === 'run') {
      const interval = SPEED[this.mode];
      this.acc += dt;
      let guard = 0;
      while (this.acc >= interval && guard++ < 4 && (this.mode === 'live' || this.mode === 'show' || this.mode === 'run')) {
        this.acc -= interval;
        if (this.mode === 'run') this.runStep(); else this.stepOnce();
      }
    }

    // Planning: highlight the tile under the pointer, pulse the tile where the route ends.
    if (this.mode === 'plan') {
      const p = this.engine.pointers.find((ptr) => ptr.hovered === this.tiles && ptr.hit?.instanceId != null);
      const s = p?.hit.instanceId;
      this.planLayer.setHover(s != null && !this.learner.blocked.has(s) ? s : null);
      this.planLayer.hover.material.opacity = 0.6 + Math.sin(this.time * 8) * 0.25;
      const route = this.planRoute;
      if (route?.status === 'open') {
        this.planLayer.setMark(route.end, 'xr-robot-plan', 0.6 + Math.sin(this.time * 5) * 0.4);
        this.planLayer.marks.instanceColor.needsUpdate = true;
      }
    } else {
      this.planLayer.setHover(null);
    }
    this.tiles.userData.interactive = this.mode === 'plan';

    // Speech bubble above Echo (e.g. "No arrow?").
    const bubble = this.bubble;
    bubble.userData.life = Math.max(0, bubble.userData.life - dt);
    const talking = bubble.userData.life > 0 && !this.anim;
    bubble.visible = talking;
    if (talking) {
      bubble.position.set(this.robot.position.x, 0.5 + Math.sin(this.time * 4) * 0.01, this.robot.position.z);
      bubble.material.opacity = Math.min(1, bubble.material.opacity + dt * 6, bubble.userData.life * 3);
    } else {
      bubble.material.opacity = 0;
    }
    this.bit.glow.material.color.setHex(hex(this.mode === 'plan' ? 'xr-robot-plan' : 'xr-robot-accent'));

    // Robot motion
    let moving = 0;
    if (this.anim) {
      const an = this.anim;
      an.t += dt;
      const k = Math.min(1, an.t / an.dur);
      const e = k * k * (3 - 2 * k);
      if (an.bump) {
        const lunge = Math.sin(k * Math.PI) * 0.06;
        this.robot.position.copy(an.from).add(new THREE.Vector3(Math.sin(an.yaw) * lunge, 0, Math.cos(an.yaw) * lunge));
      } else {
        this.robot.position.lerpVectors(an.from, an.to, e);
      }
      let dy = an.yaw - an.yaw0;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.robot.rotation.y = an.yaw0 + dy * Math.min(1, k * 2);
      moving = Math.sin(k * Math.PI);
      if (k >= 1) this.anim = null;
    } else if (this.mode === 'turbo') {
      moving = 1;
    }
    this.hop = Math.max(0, (this.hop ?? 0) - dt);
    this.shake = Math.max(0, (this.shake ?? 0) - dt);
    this.robot.position.y = Math.sin(Math.min(1, this.hop / 0.45) * Math.PI) * 0.06;
    this.robot.rotation.z = this.shake ? Math.sin(this.time * 40) * 0.12 * this.shake : 0;
    // Echo looks at the coin while idle, a little to the side while moving.
    const toCoin = this.coin.position.clone().sub(this.robot.position);
    const facing = new THREE.Vector3(Math.sin(this.robot.rotation.y), 0, Math.cos(this.robot.rotation.y));
    const lookX = THREE.MathUtils.clamp(facing.clone().cross(toCoin.normalize()).y * 1.5, -1, 1);
    const e = this.engine;
    const viewer = e.isXR ? e.head.pos : e.camera.getWorldPosition(new THREE.Vector3());
    this.bit.update(dt, { moving, lookX, viewer });

    // Goal, blocks and trail
    this.coin.userData.tick(dt);
    this.walls.children.forEach((w) => {
      w.userData.light.scale.x = 0.8 + Math.sin(this.time * 2.5 + w.userData.phase) * 0.2;
    });
    for (const d of this.trail.children.slice()) {
      d.userData.life -= dt;
      d.material.opacity = Math.max(0, d.userData.life);
      if (d.userData.life <= 0) { d.removeFromParent(); d.geometry.dispose(); d.material.dispose(); }
    }
  }

  // ----- UI -----

  /** Main info panel with buttons, plus the learning-curve chart on the right. */
  panel(title, text, buttons, { column = false, warn = false } = {}) {
    const { eye, dist } = this;
    this.clearLayer();
    const p = this.add(textPanel(1.12, 0.2, [
      { text: title, size: 'xr-text-lg', weight: 'black', color: warn ? color('xr-danger') : undefined, gap: 0.02 },
      { text, size: 'xr-text-sm' },
    ], { layout: { align: 'left' }, surface: warn ? { stroke: color('xr-danger') } : undefined }));
    p.position.set(0, eye + 0.48 - p.h / 2, -dist - 0.1);
    this.popIn(p);
    let y = p.position.y - p.h / 2 - 0.03;
    if (column) {
      buttons.forEach((b, i) => {
        b.position.set(0, y - b.h / 2, -dist - 0.1);
        y -= b.h + 0.02;
        this.add(b);
        this.popIn(b, 0.05 * i);
      });
    } else if (buttons.length) {
      const h = Math.max(...buttons.map((b) => b.h));
      layoutRow(buttons, y - h / 2, -dist - 0.1, 0.03);
      buttons.forEach((b, i) => { this.add(b); this.popIn(b, 0.05 * i); });
    }
    const mind = new Button(0.34, 0.09, {
      label: `${t('robotMind')}: ${this.showMind ? t('on') : t('off')}`,
      labelSize: 'xr-text-sm',
      onClick: (ptr, btn) => {
        this.showMind = !this.showMind;
        btn.opts.label = `${t('robotMind')}: ${this.showMind ? t('on') : t('off')}`;
        btn.redraw();
        this.updateMind();
      },
    });
    this.chart = this.add(new Panel(0.5, 0.36, (ctx, c) => this.drawChart(ctx, c)));
    placeOnArc(this.chart, 0.62, eye + 0.12, dist + 0.1);
    placeOnArc(mind, 0.62, eye + 0.12 - 0.18 - 0.06, dist + 0.1);
    this.add(mind);
    return p;
  }

  drawChart(ctx, c) {
    c.surface();
    const pad = c.m(0.03);
    const W = c.canvas.width;
    const H = c.canvas.height;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = color('xr-panel-text');
    ctx.font = font('bold', c.m(num('xr-text-sm')));
    ctx.fillText(t('robotChart'), pad, pad);
    ctx.textAlign = 'right';
    ctx.fillStyle = color('xr-accent');
    ctx.fillText(`${this.successRate()}%`, W - pad, pad);
    const top = pad + c.m(0.06);
    const bottom = H - pad;
    const left = pad;
    const right = W - pad;
    ctx.strokeStyle = color('xr-panel-muted');
    ctx.lineWidth = c.m(0.002);
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, bottom);
    ctx.lineTo(right, bottom);
    ctx.stroke();
    const h = this.history;
    if (h.length < 2) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = color('xr-panel-muted');
      ctx.font = font('regular', c.m(num('xr-text-sm')));
      ctx.fillText(t('robotChartEmpty'), W / 2, (top + bottom) / 2);
      return;
    }
    // Moving average of successes over the last 8 episodes.
    ctx.strokeStyle = color('xr-success');
    ctx.lineWidth = c.m(0.006);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    h.forEach((_, i) => {
      const win = h.slice(Math.max(0, i - 7), i + 1);
      const v = win.reduce((a, b) => a + b, 0) / win.length;
      const x = left + (i / (h.length - 1)) * (right - left);
      const yv = bottom - v * (bottom - top);
      if (i === 0) ctx.moveTo(x, yv); else ctx.lineTo(x, yv);
    });
    ctx.stroke();
  }

  dispose() {
    this.app.echo?.suppress(false);
    this.bit.disposed = true;
    this.mode = 'idle';
    this.engine.scene.environment = this.prevEnvironment ?? null;
    this.envTarget?.dispose();
    super.dispose();
  }
}
