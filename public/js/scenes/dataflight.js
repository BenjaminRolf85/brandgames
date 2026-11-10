// "Datenflug" (Data Flight): Echo flies through the data stream and follows your hand in all
// three dimensions (left/right, up/down, forwards/back) while you stand still. Data rushes
// towards you out of a vortex: good data (glowing crystals) fills the database, bad data (red
// blocks with an X) must be dodged, because it deletes part of the database. Every piece of
// data carries its kind (verified, outdated, duplicate ...); what hit you is explained at the
// end. Hackers come out of the vortex now and then, fire attacks at Echo (phishing, malware,
// ransomware, data poisoning, prompt injection) and then swoop at it; dodge them all and the
// attack counts as fended off. Echomotion gold coins give bonus points and a fact each.
// The flight passes through four worlds (data highway, data center, data storm, firewall tunnel;
// WORLDS in dataflight-worlds.js), each with its own colors, props, formations and a twist, and
// a ring portal between them. Data gates (fly through, a full run gives a bonus), power-ups
// (shield, data magnet, slow motion) and, at the end, the hacker mothership: every good data
// caught then fires an antivirus pulse at one of its three cores.
// The look follows the game coin (assets/cards/dataflight.webp).
import * as THREE from 'three';
import { BaseScene } from '../scene.js';
import { Panel, textPanel } from '../ui3d.js';
import { color, hex, num, font } from '../tokens.js';
import { t, L } from '../i18n.js';
import { sfx } from '../sfx.js';
import { music } from '../music.js';
import { quality } from '../quality.js';
import { EVENT } from '../event.js';
import { FLIGHT_GOOD, FLIGHT_BAD, FLIGHT_ATTACKS } from '../content.js';
import { loadGLTF } from '../models.js';
import { COIN_FACTS, CITY_FACTS, OFFICE_FACTS } from '../parkour-level.js';
import { loadParkourModels, logoTexture } from '../parkour-models.js';
import { factCard } from '../fact-card.js';
import { makeEnvironment, radialTexture } from '../robot-visuals.js';
import {
  FlightEcho, DataItems, makeVortex, makeStream, makeBinaryStreams, makeCircuitFloor, makeSpace, makeDatabase, makeGoldCoin,
  makeHacker, makeAttackKit, makeBeam, HACKER_URL,
} from '../dataflight-visuals.js';
import {
  WORLDS, POWER_TOKEN, makeRacks, makeStorm, makeFirewall, makePortal, makeGate, makePowerUp, makeShieldBubble,
  makeMagnetRings, makeBoss, makePulse,
} from '../dataflight-worlds.js';

const NEED = 40; // good data until the database is full
const LOSS = 4; // bad data or an attack deletes this much (10 %)
const WORLD_T = EVENT ? 16 : 28; // seconds per world
const BOSS_AT = WORLD_T * WORLDS.length; // then the hacker mothership comes
const BOSS_MAX = EVENT ? 26 : 38; // ... and gets away after this long
const DURATION = BOSS_AT + BOSS_MAX; // the longest possible flight
const RAMP = BOSS_AT * 0.9; // the stream gets faster and denser until here
const PORTAL_LEAD = 1.9; // the portal to the next world starts this long before it begins
// Points (a perfect flight stays below the leaderboard's maximum of 8000: MAX_TOTAL).
const GATE_POINTS = 40;
const GATE_RUN = 100; // all gates of a run
const FULL_BONUS = 300; // the database is full (the flight goes on)
const BOSS_POINTS = 700; // the mothership defeated, plus 8 per second left
const CORE_HP = EVENT ? 4 : 6; // pulses per core
const MAX_TOTAL = 7900;
// Power-ups: when they come (seconds of flight) and how long they work.
const POWER_TIMES = (EVENT ? [8, 26, 44] : [10, 29, 49, 69, 92]).filter((t0) => t0 < BOSS_AT - 4);
const POWER_KINDS = ['shield', 'magnet', 'slow'];
const POWER_T = { shield: 20, magnet: 8, slow: 6 };
const C_DROP = 0.2; // Echo's flight space: center below eye height ...
const C_Z = -0.85; // ... and in front of you
const BOX = { x: 0.48, y: 0.3, z: 0.22 }; // half sizes of Echo's flight space
const Z0 = -9; // data appears here, out of the vortex
const VORTEX_Z = -9.6;
const GONE_Z = -0.3; // data that got past Echo dissolves here (well before your face)
const GAIN = new THREE.Vector3(1.6, 1.6, 1.5); // hand movement -> Echo movement
const R_GOOD = 0.13; // catch radius (generous)
const R_BAD = 0.1; // hit radius (a bit forgiving)
const MAX_ITEMS = 40;
// Echomotion gold coins: bonus points and a fact each. Only facts from echomotion.ai, the same
// texts as the coins of Echo Parkour (parkour-level.js), the data-related ones first.
const FACT_PICK = ['Data Solutions', 'Datenschutz', 'Nur EU-Rechenzentren', 'Lokal oder Cloud', 'Mitten zwischen den Systemen', 'Du gibst frei', 'KI-Agenten', 'Kein Vendor Lock-in', '50+ KI-Projekte', 'Kostenloser Start'];
const FLIGHT_FACTS = FACT_PICK.map((de) => [...COIN_FACTS, ...CITY_FACTS, ...OFFICE_FACTS].find((f) => f.title.de === de)).filter(Boolean);
const COIN_POINTS = 120;
const COIN_TIME = (i) => 6 + (i * (BOSS_AT - 14)) / Math.max(1, FLIGHT_FACTS.length - 1); // spread over the worlds
const CARD_TIME = 5.5;
// Hackers: the first after 18 s (event mode 14 s), then every 21 s, none in the last 14 s.
const HACKER_TIMES = Array.from({ length: 8 }, (_, i) => (EVENT ? 14 : 18) + i * 21).filter((t0) => t0 < BOSS_AT - 8);
const R_ATTACK = 0.1; // an attack hits Echo within this distance
const R_HACKER = 0.17; // the hacker's swoop hits within this distance
const BLOCK_POINTS = 100; // a hacker that never hit Echo
const DODGE_SHOT = 15;
const clamp = THREE.MathUtils.clamp;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const _seg = new THREE.Vector3();
const _rel = new THREE.Vector3();
/** Closest distance of p to the path a -> b of this frame (so fast things never skip Echo). */
function sweptDist(a, b, p) {
  _seg.subVectors(b, a);
  _rel.subVectors(p, a);
  const k = clamp(_rel.dot(_seg) / Math.max(_seg.lengthSq(), 1e-9), 0, 1);
  return _rel.sub(_seg.multiplyScalar(k)).length();
}

export class DataflightScene extends BaseScene {
  constructor(app) {
    super(app);
    this.gameKey = 'dataflight';
    this.time = 0;
    this.mode = 'intro';
    this.speed = 1.4;
    this.items = [];
    this.free = { good: [...Array(MAX_ITEMS).keys()], bad: [...Array(MAX_ITEMS).keys()] };
    this.C = new THREE.Vector3(0, this.eye - C_DROP, C_Z);
    this.depth = 0; // browser preview: depth offset (mouse wheel)

    this.envTarget = makeEnvironment(this.engine.renderer);
    this.prevEnvironment = this.engine.scene.environment;
    this.engine.scene.environment = this.envTarget.texture;
    // The data space replaces the preview room (grid floor and walls).
    this.prevBackdrop = this.engine.backdrop.visible;
    this.engine.backdrop.visible = false;

    loadParkourModels().then((M) => { this.M = M; }).catch(() => {});
    loadGLTF(HACKER_URL).then((g) => { this.hackerGltf = g; }).catch(() => {});
    this.coins = [];
    this.shots = [];
    this.hacker = null;
    this.buildWorld();
    this.setupInput();
    this.onUpdate((dt) => this.update(dt));
    const hint = this.engine.isXR ? '' : ` ${t(this.engine.touchUI ? 'dataflightIntroTouch' : 'dataflightIntroScreen')}`;
    this.intro(t('dataflightName'), `${t('dataflightIntro')}${hint}`, () => this.start());
  }

  // ---------- world ----------

  buildWorld() {
    const { C } = this;
    const lite = quality.lite;
    const w = (this.world = new THREE.Group());
    w.userData.noFit = true;
    this.group.add(w);
    // The data space dims the room in passthrough, so the stream reads well.
    this.space = makeSpace(this.engine.isXR ? 0.55 : 0.9);
    w.add(this.space);
    this.vortex = makeVortex(2.6);
    this.vortex.position.set(C.x, C.y + 0.15, VORTEX_Z);
    w.add(this.vortex);
    this.stream = makeStream({ center: C, lite });
    w.add(this.stream);
    if (!lite) {
      this.binary = makeBinaryStreams({ center: C });
      w.add(this.binary);
    }
    this.floor = makeCircuitFloor({});
    w.add(this.floor);
    this.data = new DataItems(w, MAX_ITEMS);
    this.echo = new FlightEcho(w, 0.16);
    this.echo.group.position.copy(C);
    this.echo.group.visible = false;
    // The database, low on the left, outside Echo's flight space.
    this.dbLabel = new Panel(0.32, 0.075, (ctx, c) => this.drawDb(ctx, c));
    this.db = makeDatabase(this.dbLabel);
    this.db.position.set(-0.78, this.eye - 0.47, -0.95);
    this.db.visible = false;
    w.add(this.db);
    this.feeds = []; // light dots flying from Echo into the database
    this.attackKit = makeAttackKit();
    this.beam = makeBeam();
    w.add(this.beam);
    // The worlds: props (server racks, lightning, firewall rings), the portal between them, and
    // the power-up effects around Echo.
    this.racks = makeRacks({ center: C });
    this.storm = makeStorm({ center: C });
    this.firewall = makeFirewall({ center: C });
    this.portal = makePortal();
    this.shieldFx = makeShieldBubble();
    this.magnetFx = makeMagnetRings();
    w.add(this.racks, this.storm, this.firewall, this.portal, this.shieldFx, this.magnetFx);
    this.palettes = WORLDS.map((wd) => ({
      a: new THREE.Color(hex(wd.a)), b: new THREE.Color(hex(wd.b)), c: new THREE.Color(hex(wd.c)),
      space: new THREE.Color(hex(wd.space)), streaks: wd.streaks.map((k) => new THREE.Color(hex(k))),
    }));
    this.theme = { from: 0, to: 0, k: 1 };
    this.gates = [];
    this.powers = [];
    this.pulses = [];
    this.applyTheme();
  }

  // ---------- worlds ----------

  /** Colors and props between two worlds (k: 0 = from, 1 = to). */
  applyTheme() {
    const { from, to, k } = this.theme;
    const A = this.palettes[from];
    const B = this.palettes[to];
    const u = this.vortex.material.uniforms;
    u.uA.value.copy(A.a).lerp(B.a, k);
    u.uB.value.copy(A.b).lerp(B.b, k);
    u.uC.value.copy(A.c).lerp(B.c, k);
    this.space.material.color.copy(A.space).lerp(B.space, k);
    this.stream.userData.setPalette(A.streaks.map((c, i) => c.clone().lerp(B.streaks[i], k)));
    const weight = (i) => (from === i ? 1 - k : 0) + (to === i ? k : 0);
    this.racks.userData.setAmount(weight(1));
    this.stormAmt = weight(2);
    // The firewall rings step back while the mothership is there.
    this.firewall.userData.setAmount(weight(3) * (this.bossDim ?? 1));
  }

  /** The next world begins: colors glide over, its name and twist show. */
  enterWorld(i) {
    this.wi = i;
    this.theme = { from: this.theme.to, to: i, k: 0 };
    this.tween(1.4, (k) => { this.theme.k = k; this.applyTheme(); });
    const key = WORLDS[i].key;
    this.toast(t('dataflightWorld', { n: i + 1, total: WORLDS.length, name: t(`dataflightWorld_${key}`) }), t(`dataflightWorldHint_${key}`), WORLDS[i].a, true);
    sfx.announce();
    this.refreshHud?.();
  }

  /** The ring portal to the next world flies at you. */
  launchPortal(i) {
    const P = this.portal;
    P.userData.setColor(WORLDS[i].a);
    P.userData.setFade(1);
    P.position.set(this.C.x, this.C.y + 0.08, VORTEX_Z + 0.3);
    P.visible = true;
    this.portalNext = i;
    sfx.whoosh();
  }

  updatePortal(dt) {
    const P = this.portal;
    if (!P.visible) return;
    P.position.z += 5 * dt;
    P.rotation.z += dt * 0.8;
    P.userData.setFade(clamp((P.position.z - VORTEX_Z) / 1.2, 0, 1) * clamp((0.6 - P.position.z) / 1.0, 0, 1));
    if (this.portalNext !== null && P.position.z >= this.C.z) {
      this.enterWorld(this.portalNext);
      this.portalNext = null;
    }
    if (P.position.z > 0.8) P.visible = false;
  }

  drawDb(ctx, c) {
    const W = c.canvas.width;
    const H = c.canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = color('xr-flight-label-good');
    ctx.beginPath();
    ctx.roundRect(2, 2, W - 4, H - 4, H / 2);
    ctx.fill();
    ctx.lineWidth = c.m(0.004);
    ctx.strokeStyle = color('xr-flight-db-ring');
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = font('black', c.m(num('xr-text-sm')));
    ctx.fillStyle = color('xr-panel-text');
    ctx.fillText(`${t('dataflightDb')}  ${Math.round((this.fill ?? 0) * 100)} %`, W / 2, H / 2);
  }

  // ---------- input ----------

  setupInput() {
    const canvas = this.engine.canvas;
    const wheel = (e) => {
      if (this.engine.isXR || this.mode !== 'play') return;
      this.depth = clamp(this.depth + e.deltaY * 0.0006, -BOX.z, BOX.z);
      e.preventDefault();
    };
    canvas.addEventListener('wheel', wheel, { passive: false });
    this.onDispose(() => canvas.removeEventListener('wheel', wheel));
    // Phones: swipe anywhere and Echo moves along (relative, so the finger never covers Echo).
    this.swipe = this.dragPad({
      enabled: () => this.mode === 'ready' || this.mode === 'play',
      onStart: () => { this.swipeFrom = this.echo?.group.position.clone() ?? this.C.clone(); this.swiped = true; },
      onMove: (dx, dy) => {
        const k = (2 * BOX.x) / (Math.min(window.innerWidth, window.innerHeight * 1.2) * 0.75);
        this.swipeTo = this.swipeFrom.clone().add(new THREE.Vector3(dx * k, dy * k, 0));
      },
    });
  }

  /** Pointer rays are hidden while flying: the hand itself steers Echo. */
  setRays(visible) {
    for (const p of this.engine.pointers) if (p.line) p.line.visible = visible && p.source?.targetRayMode !== 'screen';
  }

  /** Where Echo should be: from the tracked hand (relative to where it was at the start) or the ray. */
  readTarget() {
    const e = this.engine;
    const { C } = this;
    const v = new THREE.Vector3();
    if (this.swipe) return this.swipeTo?.clone() ?? null; // phones: swipe steering
    const tracked = e.pointers.filter((p) => p.active && p.kind === 'xr' && p.source?.targetRayMode === 'tracked-pointer');
    if (e.isXR && tracked.length) {
      // Keep the hand it started with; prefer the right hand.
      if (!tracked.includes(this.hand)) this.hand = tracked.sort((a, b) => (b.source.handedness === 'right') - (a.source.handedness === 'right'))[0];
      this.group.worldToLocal(v.setFromMatrixPosition(this.hand.controller.matrixWorld));
      if (!this.ref) this.ref = new THREE.Vector3(clamp(v.x, -0.3, 0.3), clamp(v.y, this.eye - 0.6, this.eye - 0.05), clamp(v.z, -0.6, -0.15));
      return v.sub(this.ref).multiply(GAIN).add(C);
    }
    const p = e.pointers.find((q) => q.active && (q.kind === 'xr') === e.isXR);
    if (!p) return null;
    this.hand = p;
    // Ray onto the plane at Echo's depth.
    const inv = new THREE.Matrix4().copy(this.group.matrixWorld).invert();
    const ray = p.ray.clone().applyMatrix4(inv);
    const z = C.z + this.depth;
    if (Math.abs(ray.direction.z) < 1e-4) return null;
    const k = (z - ray.origin.z) / ray.direction.z;
    if (k <= 0) return null;
    return v.set(ray.origin.x + ray.direction.x * k, ray.origin.y + ray.direction.y * k, z);
  }

  // ---------- flow ----------

  start() {
    this.clearLayer();
    this.refreshHud ??= this.hud(() => this.hudText());
    this.app.echo?.suppress(true);
    this.setRays(false);
    this.startMusic(1, 'dataflight');
    Object.assign(this, { fill: 0, fillN: 0, good: 0, bad: 0, dodged: 0, score: 0, streak: 0, best: 0, hits: {}, playT: 0, nextSpawn: 1.0, invuln: 0, ref: null, swipeTo: null, coinsTaken: 0, nextCoin: 0, attacks: 0, attackHits: {}, hackers: 0, blocked: 0, nextHacker: 0 });
    // Worlds, gates, power-ups and the boss
    this.bossDim = 1;
    Object.assign(this, { wi: 0, portalNext: null, gatesPassed: 0, gateRuns: 0, nextPower: 0, powersTaken: 0, shieldT: 0, magnetT: 0, slowT: 0, saves: 0, fullBonus: false, phase: 'worlds', bossT: 0, bossWon: false, boss: null, wind: 0, stormAmt: 0 });
    this.theme = { from: 0, to: 0, k: 1 };
    this.applyTheme();
    this.portal.visible = false;
    this.clearItems();
    this.dbLabel.redraw();
    this.db.userData.setFill(0);
    this.db.visible = true;
    this.tween(0.4, (k) => this.db.scale.setScalar(Math.max(0.001, k)));
    // Echo appears, looks at you, then turns and flies into the stream.
    const eg = this.echo.group;
    eg.visible = true;
    eg.position.copy(this.C);
    this.echo.wantTurn = 1;
    this.echo.trail.reset(this.C);
    this.burst(eg.getWorldPosition(new THREE.Vector3()), 'xr-flight-good', 26);
    sfx.appear();
    this.mode = 'ready';
    this.toast(t('dataflightGo'), null, 'xr-flight-good', true);
    this.delay(0.8, () => { if (!this.disposed) this.echo.wantTurn = 0; });
    this.delay(1.4, () => { if (!this.disposed && this.mode === 'ready') this.mode = 'play'; });
    this.refreshHud();
  }

  hudText() {
    // Time: until the mothership comes, then until it gets away.
    const boss = this.phase === 'boss';
    const left = Math.max(0, Math.ceil(boss ? BOSS_MAX - this.bossT : BOSS_AT - (this.playT ?? 0)));
    const time = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    const where = boss
      ? t('dataflightBossHud', { n: this.boss ? this.boss.obj.userData.cores.filter((c) => c.hp > 0).length : 3 })
      : t('dataflightWorld', { n: (this.wi ?? 0) + 1, total: WORLDS.length, name: t(`dataflightWorld_${WORLDS[this.wi ?? 0].key}`) });
    return t('dataflightHud', { name: where, n: Math.round((this.fill ?? 0) * 100), coins: this.coinsTaken ?? 0, total: FLIGHT_FACTS.length, time, score: this.score ?? 0 });
  }

  finish(win) {
    if (this.mode === 'over') return;
    this.mode = 'over';
    this.app.echo?.suppress(false);
    this.setRays(true);
    this.engine.fitEnabled = true;
    this.clearItems();
    this.echo.group.visible = false;
    this.db.visible = false;
    this.toastPanel?.removeFromParent();
    const score = Math.min(MAX_TOTAL, this.score);
    // Takeaways: the attack and the kinds of bad data that hit you, then what makes data good,
    // other attacks and other bad data.
    const ranked = (hits, list) => Object.entries(hits).sort((a, b) => b[1] - a[1]).map(([k]) => list.find((x) => x.key === k)).filter(Boolean);
    const atkHit = ranked(this.attackHits, FLIGHT_ATTACKS);
    const badHit = ranked(this.hits, FLIGHT_BAD);
    const asAttack = (a) => ({ q: t('dataflightLearnAttack', { name: L(a.name) }), a: L(a.why) });
    const asBad = (b) => ({ q: t('dataflightLearnBad', { name: L(b.name) }), a: L(b.why) });
    const asGood = (g) => ({ q: t('dataflightLearnGood', { name: L(g.name) }), a: L(g.why) });
    const learned = [...atkHit.slice(0, 1).map(asAttack), ...badHit.slice(0, 2).map(asBad)].slice(0, 2);
    const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5);
    const more = [shuffle(FLIGHT_GOOD).map(asGood), shuffle(FLIGHT_ATTACKS.filter((a) => !atkHit.includes(a))).map(asAttack), shuffle(FLIGHT_BAD.filter((b) => !badHit.includes(b))).map(asBad)];
    for (let k = 0; learned.length < 3 && k < 30; k++) {
      const next = more[k % 3].pop();
      if (next) learned.push(next);
    }
    this.results({
      gameKey: 'dataflight', score, correct: Math.round(this.fill * 100), total: 100,
      line: `${t(win ? 'dataflightBossDown' : this.bossT > 0 ? 'dataflightBossEscaped' : 'dataflightTimeUp')} · ${t('dataflightLine', { good: this.good, bad: this.bad, blocked: this.blocked, hackers: this.hackers, coins: this.coinsTaken, total: FLIGHT_FACTS.length })}`,
      learned,
      onAgain: () => this.app.startGame('dataflight'),
    });
  }

  // ---------- data ----------

  /** A target point in Echo's flight space from u, v in -1..1. */
  spot(u, v) {
    return [this.C.x + u * BOX.x * 0.92, this.C.y + v * BOX.y * 0.92];
  }

  /** Where Echo is now, as u, v. */
  echoUV() {
    const p = this.echo.group.position;
    return [clamp((p.x - this.C.x) / BOX.x, -1, 1), clamp((p.y - this.C.y) / BOX.y, -1, 1)];
  }

  addItem(kind, u, v, { back = 0, size = 1, label = true } = {}) {
    const slot = this.free[kind].pop();
    if (slot === undefined) return null;
    const [tx, ty] = this.spot(u, v);
    const vx = this.vortex.position.x;
    const vy = this.vortex.position.y;
    const type = pick(kind === 'good' ? FLIGHT_GOOD : FLIGHT_BAD);
    const it = {
      kind, type, slot, size, tx, ty,
      sx: vx + (tx - vx) * 0.12, sy: vy + (ty - vy) * 0.12,
      pos: new THREE.Vector3(0, 0, Z0 - back), prev: new THREE.Vector3(),
      spin: new THREE.Vector3(rnd(-1, 1), rnd(0.8, 2.2) * (Math.random() < 0.5 ? -1 : 1), rnd(-1, 1)).multiplyScalar(kind === 'bad' ? 1.4 : 1),
      fade: 0, tint: Math.random() < 0.5 ? 0 : 1, label: null,
      // Data storm: blown sideways on the way (aimed so it still ends up near its target).
      wind: (this.stormAmt ?? 0) * (this.wind ?? 0),
    };
    // It still ends up inside the flight space.
    if (it.wind) it.tx = clamp(it.tx + it.wind * BOX.x * 0.45, this.C.x - BOX.x * 0.92, this.C.x + BOX.x * 0.92) - it.wind * BOX.x * 0.9;
    if (label) it.label = this.data.takeLabel(L(type.name), kind === 'good');
    this.place(it);
    it.prev.copy(it.pos);
    this.items.push(it);
    return it;
  }

  place(it) {
    const k = (it.pos.z - Z0) / (this.C.z - Z0);
    it.pos.x = it.sx + (it.tx - it.sx) * k + (it.wind ?? 0) * k * k * BOX.x * 0.9;
    it.pos.y = it.sy + (it.ty - it.sy) * k;
  }

  removeItem(it) {
    const i = this.items.indexOf(it);
    if (i >= 0) this.items.splice(i, 1);
    this.free[it.kind].push(it.slot);
    if (it.label) this.data.releaseLabel(it.label);
    it.label = null;
  }

  clearItems() {
    for (const it of [...this.items]) this.removeItem(it);
    for (const c of [...this.coins]) this.removeCoin(c);
    for (const sh of [...this.shots]) this.removeShot(sh);
    for (const g of [...(this.gates ?? [])]) this.removeGate(g);
    for (const pw of [...(this.powers ?? [])]) this.removePower(pw);
    for (const pu of [...(this.pulses ?? [])]) this.removePulse(pu);
    this.removeHacker();
    this.removeBoss();
  }

  // ---------- hackers ----------

  /** A hacker flies out of the vortex to a spot in front, a bit to the side. */
  spawnHacker(i) {
    const side = i % 2 ? 1 : -1;
    const obj = makeHacker(this.hackerGltf);
    const from = this.vortex.position.clone();
    obj.position.copy(from);
    obj.scale.setScalar(0.3);
    this.world.add(obj);
    this.hacker = {
      i, obj, from, t: 0, phase: 'enter', fired: 0, hit: false, dashHit: false,
      hover: new THREE.Vector3(this.C.x + side * rnd(0.45, 0.7), this.C.y + rnd(0.18, 0.4), -3.3),
      // Later hackers fire more often, faster and swoop faster.
      shots: 3 + (i >= 2 ? 1 : 0) + (i >= 4 ? 1 : 0),
      gap: Math.max(0.55, 0.85 - i * 0.05),
      speed: 3 + i * 0.25,
      swoop: 2.8 + i * 0.2,
      target: new THREE.Vector3(), dir: new THREE.Vector3(), prev: new THREE.Vector3(),
    };
    this.hackers += 1;
    sfx.announce();
    this.echo.face?.setMood('surprised', 1);
    this.toast(t('dataflightHacker'), null, 'xr-flight-attack', true);
  }

  removeHacker() {
    const h = this.hacker;
    if (!h) return;
    h.obj.removeFromParent();
    // Its materials are its own; the geometry belongs to the shared model.
    h.obj.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => m.dispose()); });
    this.beam.visible = false;
    this.hacker = null;
  }

  /** The hacker is gone: if it never hit Echo, the attack counts as fended off. */
  endHacker(h) {
    this.burst(this.world.localToWorld(h.obj.position.clone()), 'xr-flight-attack', 18);
    if (!h.hit && this.mode === 'play') {
      this.blocked += 1;
      this.score += BLOCK_POINTS;
      sfx.powerup();
      this.echo.joy();
      this.toast(t('dataflightBlocked', { n: BLOCK_POINTS }), null, 'xr-flight-good', true);
    }
    this.removeHacker();
  }

  updateHacker(dt) {
    const h = this.hacker;
    if (!h) return;
    h.t += dt;
    const o = h.obj;
    const echoPos = this.echo.group.position;
    let shake = 0;
    if (h.phase === 'enter') {
      const k = Math.min(1, h.t / 1.4);
      const e = 1 - (1 - k) ** 3;
      o.position.lerpVectors(h.from, h.hover, e);
      o.scale.setScalar(0.3 + 0.7 * e);
      if (k >= 1) { h.phase = 'aim'; h.t = 0; }
    } else if (h.phase === 'aim' || h.phase === 'fire' || h.phase === 'charge') {
      o.position.copy(h.hover);
      if (h.phase === 'aim' && h.t > 0.5) { h.phase = 'fire'; h.t = h.gap; }
      if (h.phase === 'fire' && h.t >= h.gap) {
        h.t = 0;
        this.fireShot(h);
        h.fired += 1;
        if (h.fired >= h.shots) h.phase = 'charge';
      }
      if (h.phase === 'charge') {
        // Warning: it trembles and a beam shows where it will swoop (locked shortly before).
        shake = Math.min(1, h.t / 0.4);
        if (h.t < 0.75) h.target.copy(echoPos);
        this.beam.visible = true;
        this.beam.userData.set(o.position, h.target, this.time);
        if (h.t >= 1.05) {
          h.phase = 'dash';
          h.t = 0;
          h.dir.subVectors(h.target, o.position).normalize();
          this.beam.visible = false;
          sfx.jump();
        }
      }
    } else if (h.phase === 'dash') {
      h.prev.copy(o.position);
      o.position.addScaledVector(h.dir, h.swoop * dt);
      if (!h.dashHit && this.mode === 'play' && this.invuln <= 0 && sweptDist(h.prev, o.position, echoPos) < R_HACKER) {
        h.dashHit = true;
        this.hitAttack(pick(FLIGHT_ATTACKS), this.world.localToWorld(o.position.clone()));
      }
      o.scale.setScalar(Math.max(0.001, clamp((GONE_Z - o.position.z) / 0.6, 0, 1)));
      if (o.position.z >= GONE_Z || h.t > 3) { this.endHacker(h); return; }
    }
    o.lookAt(this.world.localToWorld(echoPos.clone()));
    o.userData.tick(dt, this.time, shake);
  }

  /** One attack from the hacker's laptop, aimed where Echo is heading. */
  fireShot(h) {
    const kind = pick(FLIGHT_ATTACKS);
    const from = h.obj.position.clone().add(new THREE.Vector3(0, -0.05, 0.12));
    const aim = this.echo.group.position.clone().addScaledVector(this.echo.vel, 0.15);
    const dir = aim.sub(from).normalize();
    const obj = this.attackKit.make();
    obj.position.copy(from);
    this.world.add(obj);
    this.shots.push({ kind, obj, pos: from.clone(), prev: from.clone(), dir, speed: h.speed, life: 0, label: this.data.takeLabel(L(kind.name), false) });
    h.obj.userData.flash();
    sfx.hit();
  }

  removeShot(sh) {
    const i = this.shots.indexOf(sh);
    if (i >= 0) this.shots.splice(i, 1);
    sh.obj.removeFromParent();
    sh.obj.userData.glow.material.dispose();
    if (sh.label) this.data.releaseLabel(sh.label);
  }

  moveShots(dt) {
    const p = this.echo.group.position;
    for (const sh of [...this.shots]) {
      sh.life += dt;
      sh.prev.copy(sh.pos);
      sh.pos.addScaledVector(sh.dir, sh.speed * dt);
      sh.obj.position.copy(sh.pos);
      sh.obj.userData.spin.rotation.set(this.time * 3, this.time * 4, 0);
      const fade = clamp((GONE_Z - sh.pos.z) / 0.35, 0, 1) * clamp(sh.life / 0.2, 0, 1);
      sh.obj.scale.setScalar(Math.max(0.001, fade));
      if (sh.label) {
        const lw = 0.12 + Math.max(0.5, -sh.pos.z) * 0.055;
        sh.label.scale.set(lw, lw * 0.22, 1);
        sh.label.position.set(sh.pos.x, sh.pos.y + 0.07 + lw * 0.16, sh.pos.z);
        sh.label.material.opacity = fade * clamp((-0.7 - sh.pos.z) / 0.5, 0, 1);
      }
      if ((this.mode === 'play' || this.mode === 'ready') && this.invuln <= 0 && sweptDist(sh.prev, sh.pos, p) < R_ATTACK) {
        this.hitAttack(sh.kind, this.world.localToWorld(sh.pos.clone()));
        this.removeShot(sh);
        continue;
      }
      if (sh.pos.z >= GONE_Z || sh.life > 5) {
        if (this.mode === 'play') this.score += DODGE_SHOT;
        this.removeShot(sh);
      }
    }
  }

  // ---------- Echomotion gold coins ----------

  spawnCoin(i) {
    // Often near the edge of the flight space: reaching for it is part of the fun.
    const edge = () => (Math.random() < 0.5 ? -1 : 1) * rnd(0.45, 1);
    const [tx, ty] = this.spot(edge(), rnd(-1, 1));
    const vx = this.vortex.position.x;
    const vy = this.vortex.position.y;
    const obj = makeGoldCoin(this.M, logoTexture());
    this.world.add(obj);
    const c = { i, obj, tx, ty, sx: vx + (tx - vx) * 0.12, sy: vy + (ty - vy) * 0.12, pos: new THREE.Vector3(0, 0, Z0), prev: new THREE.Vector3() };
    this.place(c);
    c.prev.copy(c.pos);
    this.coins.push(c);
    sfx.tink();
  }

  removeCoin(c) {
    const i = this.coins.indexOf(c);
    if (i >= 0) this.coins.splice(i, 1);
    c.obj.removeFromParent();
    c.obj.userData.glow.material.dispose();
  }

  collectCoin(c) {
    this.coinsTaken += 1;
    this.score += COIN_POINTS;
    sfx.coin();
    this.delay(0.12, () => { if (!this.disposed) sfx.tink(); });
    this.engine.haptic(this.hand, 0.5, 40);
    this.echo.joy();
    this.burst(this.world.localToWorld(c.pos.clone()), 'xr-flight-coin', 28);
    this.removeCoin(c);
    this.showFact(c.i);
  }

  /** The coin's fact on the right (opposite the database), on a phone held upright at the top. */
  showFact(i) {
    if (this.card) { const old = this.card; this.card = null; old.removeFromParent(); old.dispose(); }
    const card = factCard(i + 1, FLIGHT_FACTS.length, FLIGHT_FACTS[i], 0.56);
    if (this.portrait) card.position.set(0, this.eye + 0.42 - card.h / 2, -1.2);
    else {
      card.position.set(0.88, this.eye - 0.05, -1.0);
      card.rotation.y = -0.45;
    }
    this.add(card);
    this.popIn(card);
    this.card = card;
    this.delay(CARD_TIME, () => {
      if (this.card !== card) return;
      this.tween(0.4, (k) => { card.material.opacity = 1 - k; }, { onDone: () => { if (this.card === card) { this.card = null; card.removeFromParent(); card.dispose(); } } });
    });
  }

  moveCoins(dt) {
    const p = this.echo.group.position;
    const seg = new THREE.Vector3();
    const rel = new THREE.Vector3();
    for (const c of [...this.coins]) {
      c.prev.copy(c.pos);
      c.pos.z += this.speed * dt;
      this.place(c);
      const z = c.pos.z;
      const fade = clamp((z - Z0) / 0.8, 0, 1) * clamp((GONE_Z - z) / 0.35, 0, 1);
      c.obj.position.copy(c.pos);
      c.obj.userData.spin.rotation.y = this.time * 3 + c.i;
      c.obj.scale.setScalar(Math.max(0.001, fade));
      c.obj.userData.glow.material.opacity = 0.6 * fade * (0.8 + 0.2 * Math.sin(this.time * 6));
      if (this.mode === 'play' || this.mode === 'ready') {
        seg.subVectors(c.pos, c.prev);
        rel.subVectors(p, c.prev);
        const k = clamp(rel.dot(seg) / Math.max(seg.lengthSq(), 1e-9), 0, 1);
        if (rel.sub(seg.multiplyScalar(k)).length() < R_GOOD * 1.1) { this.collectCoin(c); continue; }
      }
      if (z >= GONE_Z) this.removeCoin(c);
    }
  }

  /**
   * The next wave. Every world has its own mix: the data highway brings data gates, the data
   * center spirals and trails, the data storm blown data and sweeping rows, the firewall tunnel
   * grids and walls with one gap. During the boss fight mostly good data (it fuels the pulses).
   */
  spawn() {
    const T = this.playT;
    const boss = this.phase === 'boss';
    const w = WORLDS[this.wi ?? 0].key;
    const is = (k) => (!boss && w === k ? 1 : 0);
    const table = boss
      ? [['good', 3], ['bad', 1.6], ['pair', 1.4]]
      : [
        ['good', 3], ['trail', T > 5 ? 2.2 + is('center') : 0], ['bad', 2.4 + is('storm') * 0.6], ['pair', T > 10 ? 1.6 : 0],
        ['wall', T > 22 ? 1.0 + is('firewall') * 0.8 : 0], ['spam', T > 38 ? 1 : 0],
        ['gates', !this.gates.length && T > 4 ? 0.5 + is('highway') * 0.9 : 0],
        ['spiral', T > 6 ? 0.5 + is('center') * 1.3 : 0], ['ring', T > 14 ? 0.5 + is('center') * 0.6 : 0],
        ['sweep', T > 12 ? 0.4 + is('storm') * 1.1 : 0], ['grid', is('firewall') * 1.5], ['cross', T > 30 ? 0.3 + is('firewall') * 0.6 : 0],
      ];
    let r = Math.random() * table.reduce((sum, [, wt]) => sum + wt, 0);
    const kind = table.find(([, wt]) => (r -= wt) < 0)?.[0] ?? 'good';
    const [eu, ev] = this.echoUV();
    const ru = () => rnd(-1, 1);
    switch (kind) {
      case 'good': this.addItem('good', ru(), ru()); break;
      case 'trail': {
        const [u0, v0, u1, v1] = [ru(), ru(), ru(), ru()];
        for (let i = 0; i < 5; i++) this.addItem('good', u0 + ((u1 - u0) * i) / 4, v0 + ((v1 - v0) * i) / 4, { back: i * 0.55, label: i === 0 });
        break;
      }
      case 'bad': {
        // Often aimed right at Echo, so you have to dodge.
        const aim = Math.random() < 0.55;
        this.addItem('bad', aim ? eu : ru(), aim ? ev : ru());
        break;
      }
      case 'pair': {
        this.addItem('bad', eu, ev);
        const a = Math.random() * Math.PI * 2;
        this.addItem('good', clamp(eu + Math.cos(a) * 0.7, -1, 1), clamp(ev + Math.sin(a) * 0.7, -1, 1), { back: 0.1 });
        break;
      }
      case 'wall': {
        // A row of bad data with one gap; good data waits in the gap.
        const across = Math.random() < 0.6;
        const fixed = rnd(-0.6, 0.6);
        const gap = Math.floor(Math.random() * 5);
        const tag = (gap + 2) % 5;
        for (let i = 0; i < 5; i++) {
          const s0 = -1 + i * 0.5;
          const [u, v] = across ? [s0, fixed] : [fixed, s0];
          if (i === gap) this.addItem('good', u, v, { label: false });
          else this.addItem('bad', u, v, { label: i === tag });
        }
        break;
      }
      case 'gates': this.spawnGates(); break;
      case 'spiral': {
        // Good data on a corkscrew: follow it round.
        const a0 = Math.random() * Math.PI * 2;
        const dir = Math.random() < 0.5 ? 1 : -1;
        for (let i = 0; i < 8; i++) {
          const a = a0 + dir * i * 0.78;
          this.addItem('good', Math.cos(a) * 0.62, Math.sin(a) * 0.62, { back: i * 0.42, label: i === 0 });
        }
        break;
      }
      case 'ring': {
        // A ring of bad data with good data in the middle: fly through the eye.
        const cu = rnd(-0.35, 0.35);
        const cv = rnd(-0.3, 0.3);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          this.addItem('bad', clamp(cu + Math.cos(a) * 0.62, -1, 1), clamp(cv + Math.sin(a) * 0.62, -1, 1), { size: 0.8, label: i === 0 });
        }
        this.addItem('good', cu, cv, { back: 0.05, label: false });
        break;
      }
      case 'sweep': {
        // A column of bad data that sweeps across; good data follows in its wake.
        const dir = Math.random() < 0.5 ? 1 : -1;
        const items = [-0.75, -0.25, 0.25, 0.75].map((v, i) => this.addItem('bad', dir, v, { label: i === 1 }));
        const good = this.addItem('good', dir * 0.2, rnd(-0.5, 0.5), { back: 1.2, label: false });
        for (const it of [...items, good]) {
          if (!it) continue;
          it.sx = this.C.x - dir * BOX.x * 1.6;
          it.tx = this.C.x + dir * BOX.x * (it === good ? 0.2 : 0.95);
          this.place(it);
          it.prev.copy(it.pos);
        }
        break;
      }
      case 'grid': {
        // Firewall grid: 3 x 3, one cell open with good data in it.
        const gap = Math.floor(Math.random() * 9);
        for (let i = 0; i < 9; i++) {
          const u = -0.82 + (i % 3) * 0.82;
          const v = -0.8 + Math.floor(i / 3) * 0.8;
          if (i === gap) this.addItem('good', u, v, { label: false });
          else this.addItem('bad', u, v, { size: 0.9, label: i === (gap + 4) % 9 });
        }
        break;
      }
      case 'cross': {
        // An X of bad data; good data in the four gaps between its arms.
        for (const k of [-1, -0.5, 0.5, 1]) {
          this.addItem('bad', k, k, { size: 0.85, label: k === -1 });
          this.addItem('bad', k, -k, { size: 0.85, label: false });
        }
        this.addItem('bad', 0, 0, { size: 0.85, label: false });
        for (const [u, v] of [[0, 0.75], [0, -0.75], [0.8, 0], [-0.8, 0]]) this.addItem('good', u, v, { back: 0.05, label: false });
        break;
      }
      case 'spam':
      default:
        for (let i = 0; i < 4; i++) this.addItem('bad', ru(), ru(), { back: i * 0.4, size: 0.75, label: i === 0 });
    }
  }

  // ---------- data gates ----------

  /** A run of three gates, alternating sides: fly through all for a bonus. */
  spawnGates() {
    const run = { n: 3, passed: 0, missed: 0 };
    let side = Math.random() < 0.5 ? -1 : 1;
    const vx = this.vortex.position.x;
    const vy = this.vortex.position.y;
    for (let i = 0; i < run.n; i++) {
      const [tx, ty] = this.spot(side * rnd(0.3, 0.7), rnd(-0.6, 0.6));
      side = -side;
      const obj = makeGate();
      this.world.add(obj);
      const g = { run, obj, tx, ty, sx: vx + (tx - vx) * 0.12, sy: vy + (ty - vy) * 0.12, pos: new THREE.Vector3(0, 0, Z0 - i * 1.7), prev: new THREE.Vector3(), done: false };
      this.place(g);
      g.prev.copy(g.pos);
      obj.position.copy(g.pos);
      this.gates.push(g);
    }
  }

  removeGate(g) {
    const i = this.gates.indexOf(g);
    if (i >= 0) this.gates.splice(i, 1);
    g.obj.removeFromParent();
    g.obj.userData.dispose();
  }

  moveGates(dt) {
    const p = this.echo.group.position;
    for (const g of [...this.gates]) {
      g.prev.copy(g.pos);
      g.pos.z += this.speed * dt;
      this.place(g);
      g.obj.position.copy(g.pos);
      g.obj.userData.tick(this.time);
      const z = g.pos.z;
      const fade = clamp((z - Z0) / 0.8, 0, 1) * clamp((GONE_Z - z) / 0.35, 0, 1);
      g.obj.userData.setFade(g.missed ? fade * 0.3 : fade);
      g.obj.scale.setScalar(Math.max(0.001, clamp((z - Z0) / 0.8, 0, 1)));
      // Crossing Echo's depth this frame: through the middle?
      if (!g.done && !g.missed && g.prev.z < p.z && g.pos.z >= p.z && (this.mode === 'play' || this.mode === 'ready')) {
        if (Math.hypot(p.x - g.pos.x, p.y - g.pos.y) < 0.16) this.passGate(g);
        else { g.missed = true; g.run.missed += 1; }
      }
      if (z >= GONE_Z) this.removeGate(g);
    }
  }

  passGate(g) {
    g.done = true;
    g.obj.userData.setState('done');
    g.run.passed += 1;
    this.gatesPassed += 1;
    this.score += GATE_POINTS;
    sfx.tink();
    this.engine.haptic(this.hand, 0.4, 30);
    this.burst(this.world.localToWorld(g.pos.clone()), 'xr-flight-gate', 18);
    if (g.run.passed === g.run.n) {
      this.gateRuns += 1;
      this.score += GATE_RUN;
      sfx.powerup();
      this.echo.joy();
      this.toast(t('dataflightGates', { n: GATE_RUN }), null, 'xr-flight-gate-done', true);
    }
  }

  // ---------- power-ups ----------

  spawnPower() {
    const kind = POWER_KINDS[(this.nextPower + Math.floor(Math.random() * 3)) % 3];
    const [tx, ty] = this.spot(rnd(-0.8, 0.8), rnd(-0.7, 0.7));
    const vx = this.vortex.position.x;
    const vy = this.vortex.position.y;
    const obj = makePowerUp(kind);
    this.world.add(obj);
    const pw = { kind, obj, tx, ty, sx: vx + (tx - vx) * 0.12, sy: vy + (ty - vy) * 0.12, pos: new THREE.Vector3(0, 0, Z0), prev: new THREE.Vector3(), label: this.data.takeLabel(t(`dataflightPower_${kind}`), true) };
    this.place(pw);
    pw.prev.copy(pw.pos);
    this.powers.push(pw);
    sfx.tink();
  }

  removePower(pw) {
    const i = this.powers.indexOf(pw);
    if (i >= 0) this.powers.splice(i, 1);
    pw.obj.removeFromParent();
    pw.obj.userData.dispose();
    if (pw.label) this.data.releaseLabel(pw.label);
  }

  movePowers(dt) {
    const p = this.echo.group.position;
    for (const pw of [...this.powers]) {
      pw.prev.copy(pw.pos);
      pw.pos.z += this.speed * dt;
      this.place(pw);
      const z = pw.pos.z;
      const fade = clamp((z - Z0) / 0.8, 0, 1) * clamp((GONE_Z - z) / 0.35, 0, 1);
      pw.obj.position.copy(pw.pos);
      pw.obj.scale.setScalar(Math.max(0.001, fade));
      pw.obj.userData.tick(this.time);
      if (pw.label) {
        const lw = 0.12 + Math.max(0.5, -z) * 0.055;
        pw.label.scale.set(lw, lw * 0.22, 1);
        pw.label.position.set(pw.pos.x, pw.pos.y + 0.08 + lw * 0.16, z);
        pw.label.material.opacity = fade * clamp((-0.7 - z) / 0.5, 0, 1);
      }
      if ((this.mode === 'play' || this.mode === 'ready') && sweptDist(pw.prev, pw.pos, p) < R_GOOD * 1.2) {
        this.applyPower(pw.kind, this.world.localToWorld(pw.pos.clone()));
        this.removePower(pw);
        continue;
      }
      if (z >= GONE_Z) this.removePower(pw);
    }
  }

  applyPower(kind, at) {
    this.powersTaken += 1;
    this[`${kind}T`] = POWER_T[kind];
    sfx.powerup();
    this.echo.joy();
    this.engine.haptic(this.hand, 0.5, 60);
    this.burst(at, POWER_TOKEN[kind], 26);
    this.toast(t(`dataflightPower_${kind}`), t(`dataflightPowerHint_${kind}`), POWER_TOKEN[kind], true);
  }

  /** The shield takes a hit instead of the database. */
  absorb(at) {
    if (!(this.shieldT > 0)) return false;
    this.shieldT = 0;
    this.saves += 1;
    this.invuln = 0.9;
    this.shieldFx.userData.flash();
    sfx.thud();
    this.burst(at, 'xr-flight-shield', 24);
    this.toast(t('dataflightShieldSaved'), null, 'xr-flight-shield', true);
    return true;
  }

  // ---------- the hacker mothership ----------

  startBoss() {
    this.phase = 'boss';
    this.bossT = 0;
    this.tween(1.5, (k) => { this.bossDim = 1 - 0.7 * k; this.applyTheme(); });
    if (this.hacker) this.endHacker(this.hacker);
    for (const g of [...this.gates]) this.removeGate(g);
    const pilot = this.hackerGltf ? makeHacker(this.hackerGltf) : null;
    const obj = makeBoss(pilot, CORE_HP);
    obj.position.set(this.C.x, this.C.y + 0.4, VORTEX_Z + 0.4);
    obj.scale.setScalar(0.15);
    this.world.add(obj);
    this.boss = { obj, pilot, t: 0, phase: 'enter', next: 3.0, n: 0, from: obj.position.clone(), hover: new THREE.Vector3(this.C.x, this.C.y + 0.5, -3.8) };
    sfx.announce();
    music.intensity = 2;
    this.echo.face?.setMood('surprised', 1);
    this.toast(t('dataflightBoss'), t('dataflightBossHint'), 'xr-flight-boss-rim', true);
    this.refreshHud?.();
  }

  removeBoss() {
    const b = this.boss;
    if (!b) return;
    b.obj.removeFromParent();
    b.obj.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => m.dispose()); });
    this.boss = null;
  }

  updateBoss(dt) {
    const b = this.boss;
    if (!b) return;
    b.t += dt;
    const o = b.obj;
    o.userData.tick(dt, this.time);
    b.pilot?.userData.tick?.(dt, this.time, 0);
    if (b.phase === 'enter') {
      const k = Math.min(1, b.t / 2.6);
      const e = 1 - (1 - k) ** 3;
      o.position.lerpVectors(b.from, b.hover, e);
      // A phone held upright shows less width: a smaller ship that sways less.
      o.scale.setScalar((0.15 + 0.85 * e) * (this.portrait ? 0.6 : 1));
      if (k >= 1) { b.phase = 'fight'; b.t = 0; }
      return;
    }
    if (b.phase === 'fight') {
      o.scale.setScalar(this.portrait ? 0.6 : 1);
      o.position.set(b.hover.x + Math.sin(b.t * 0.55) * (this.portrait ? 0.18 : 0.55), b.hover.y + Math.sin(b.t * 0.9) * 0.07, b.hover.z);
      b.next -= dt;
      if (b.next <= 0 && this.mode === 'play') {
        this.bossVolley(['fan', 'rain', 'ring'][b.n % 3]);
        b.n += 1;
        b.next = Math.max(1.7, 2.7 - b.n * 0.06);
      }
      if (this.bossT >= BOSS_MAX && this.mode === 'play') {
        // It gets away into the vortex.
        b.phase = 'leave';
        b.t = 0;
        b.from = o.position.clone();
        sfx.whoosh();
        this.toast(t('dataflightBossEscaped'), null, 'xr-flight-boss-rim', true);
        this.mode = 'won';
        this.delay(2.2, () => { if (!this.disposed) this.finish(false); });
      }
      return;
    }
    if (b.phase === 'leave') {
      const k = Math.min(1, b.t / 1.8);
      o.position.lerpVectors(b.from, new THREE.Vector3(this.C.x, this.C.y + 0.3, VORTEX_Z), k * k);
      o.scale.setScalar(Math.max(0.001, 1 - k * 0.9));
      return;
    }
    if (b.phase === 'boom') {
      // Shakes, sparks fly off, then it bursts.
      o.position.x = b.hover.x + (Math.random() - 0.5) * 0.06;
      o.rotation.z = (Math.random() - 0.5) * 0.1;
      if (b.t > 1.3 && o.visible) {
        o.visible = false;
        const at = this.world.localToWorld(o.position.clone());
        this.burst(at, 'xr-flight-boss-rim', 60);
        this.burst(at, 'xr-flight-pulse', 40);
        sfx.crash();
      }
    }
  }

  /** A volley of attacks from the mothership: a fan, a rain or a ring around Echo. */
  bossVolley(kind) {
    const b = this.boss;
    const from = b.obj.position.clone().add(new THREE.Vector3(0, -0.12, 0.6));
    const e = this.echo.group.position;
    let targets = [];
    if (kind === 'fan') targets = [-0.34, -0.17, 0, 0.17, 0.34].map((dx) => new THREE.Vector3(e.x + dx, e.y + rnd(-0.04, 0.04), this.C.z));
    else if (kind === 'rain') targets = Array.from({ length: 6 }, () => { const [x, y] = this.spot(rnd(-1, 1), rnd(-1, 1)); return new THREE.Vector3(x, y, this.C.z); });
    else targets = Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return new THREE.Vector3(e.x + Math.cos(a) * 0.3, e.y + Math.sin(a) * 0.22, this.C.z); });
    targets.forEach((to, i) => {
      const start = kind === 'rain' ? from.clone().add(new THREE.Vector3(rnd(-0.7, 0.7), 0, 0)) : from.clone();
      const dir = to.clone().sub(start).normalize();
      const obj = this.attackKit.make();
      obj.position.copy(start);
      this.world.add(obj);
      const atk = pick(FLIGHT_ATTACKS);
      this.shots.push({ kind: atk, obj, pos: start.clone(), prev: start.clone(), dir, speed: kind === 'ring' ? 2.5 : 2.3, life: 0, label: i === 0 ? this.data.takeLabel(L(atk.name), false) : null });
    });
    sfx.hit();
  }

  /** Good data caught during the boss fight: a pulse flies at one of its cores. */
  firePulse(from) {
    const b = this.boss;
    if (!b || b.phase !== 'fight') return;
    const alive = b.obj.userData.cores.map((c, i) => (c.hp > 0 ? i : -1)).filter((i) => i >= 0);
    if (!alive.length) return;
    // The core that is closest to being destroyed first, so progress shows.
    const core = alive.sort((x, y) => b.obj.userData.cores[x].hp - b.obj.userData.cores[y].hp)[0];
    const obj = makePulse();
    obj.position.copy(from);
    this.world.add(obj);
    this.pulses.push({ obj, from: from.clone(), core, t: 0 });
    sfx.point();
  }

  removePulse(pu) {
    const i = this.pulses.indexOf(pu);
    if (i >= 0) this.pulses.splice(i, 1);
    pu.obj.removeFromParent();
    pu.obj.userData.dispose();
  }

  updatePulses(dt) {
    const b = this.boss;
    for (const pu of [...this.pulses]) {
      if (!b) { this.removePulse(pu); continue; }
      pu.t += dt / 0.55;
      const to = this.world.worldToLocal(b.obj.userData.coreWorld(pu.core));
      const k = Math.min(1, pu.t);
      const e = k * k * (3 - 2 * k);
      pu.obj.position.lerpVectors(pu.from, to, e);
      pu.obj.position.y += Math.sin(k * Math.PI) * 0.35;
      if (k >= 1) {
        this.removePulse(pu);
        if (b.phase !== 'fight') continue;
        const cores = b.obj.userData.cores;
        // That core is gone already: the next one takes the hit.
        const target = cores[pu.core].hp > 0 ? pu.core : cores.findIndex((c) => c.hp > 0);
        if (target < 0) continue;
        const destroyed = b.obj.userData.hitCore(target);
        const at = b.obj.userData.coreWorld(target);
        this.burst(at, 'xr-flight-pulse', destroyed ? 40 : 14);
        sfx.hit();
        if (destroyed) {
          sfx.crash();
          this.score += 100;
          this.toast(t('dataflightCore'), null, 'xr-flight-pulse', true);
        }
        if (!b.obj.userData.alive()) this.bossDown();
        this.refreshHud?.();
      }
    }
  }

  bossDown() {
    const b = this.boss;
    b.phase = 'boom';
    b.t = 0;
    this.bossWon = true;
    const bonus = BOSS_POINTS + Math.round(Math.max(0, BOSS_MAX - this.bossT) * 8);
    this.score += bonus;
    for (const sh of [...this.shots]) this.removeShot(sh);
    sfx.finish();
    this.echo.joy();
    this.toast(t('dataflightBossWin', { n: bonus }), null, 'xr-flight-good', true);
    this.mode = 'won';
    this.delay(2.6, () => { if (!this.disposed) this.finish(true); });
  }

  collect(it) {
    this.good += 1;
    this.streak += 1;
    this.best = Math.max(this.best, this.streak);
    this.score += 8 + Math.min(12, this.streak);
    this.fillN = Math.min(NEED, this.fillN + 1);
    // Boss fight: every good data fires an antivirus pulse at the mothership.
    if (this.phase === 'boss') this.firePulse(it.pos.clone());
    sfx.coin();
    this.engine.haptic(this.hand, 0.3, 25);
    this.echo.joy();
    const at = this.world.localToWorld(it.pos.clone());
    this.burst(at, 'xr-flight-good', 12);
    // The label rises and fades; a light dot flies into the database.
    const label = it.label;
    it.label = null;
    if (label) {
      const p0 = label.position.clone();
      this.tween(0.9, (k) => { label.position.set(p0.x, p0.y + k * 0.15, p0.z); label.material.opacity = 1 - k; }, { onDone: () => this.data.releaseLabel(label) });
    }
    this.feed(it.pos.clone(), () => {
      this.fill = this.fillN / NEED;
      this.db.userData.setFill(this.fill);
      this.dbLabel.redraw();
    });
    this.removeItem(it);
    // The database is full: a bonus once, the flight goes on (more data keeps it full).
    if (this.fillN >= NEED && !this.fullBonus) {
      this.fullBonus = true;
      this.score += FULL_BONUS;
      sfx.powerup();
      this.toast(t('dataflightFullBonus', { n: FULL_BONUS }), null, 'xr-flight-good', true);
    }
  }

  hitBad(it) {
    if (this.absorb(this.world.localToWorld(it.pos.clone()))) { this.removeItem(it); return; }
    this.bad += 1;
    this.hits[it.type.key] = (this.hits[it.type.key] ?? 0) + 1;
    this.damage(L(it.type.name), L(it.type.why), this.world.localToWorld(it.pos.clone()), 'xr-flight-bad');
    this.removeItem(it);
  }

  hitAttack(kind, at) {
    if (this.absorb(at)) return;
    this.attacks += 1;
    this.attackHits[kind.key] = (this.attackHits[kind.key] ?? 0) + 1;
    if (this.hacker) this.hacker.hit = true;
    this.damage(L(kind.name), L(kind.why), at, 'xr-flight-attack');
  }

  /** Bad data or an attack hit Echo: part of the database is deleted, and why it is bad. */
  damage(name, why, at, token) {
    this.streak = 0;
    this.fillN = Math.max(0, this.fillN - LOSS);
    this.fill = this.fillN / NEED;
    this.db.userData.setFill(this.fill);
    this.db.userData.flash('xr-flight-bad');
    this.dbLabel.redraw();
    this.invuln = 1.2;
    sfx.crash();
    this.engine.haptic(this.hand, 0.9, 140);
    this.echo.hurt();
    this.burst(at, token, 22);
    // A little data flies out of the database.
    this.burst(this.db.getWorldPosition(new THREE.Vector3()), token, 14);
    this.toast(t('dataflightBad', { name, n: Math.round((LOSS / NEED) * 100) }), why, token);
  }

  /** A light dot from p (world group space) into the database. */
  feed(p, onDone) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), color: hex('xr-flight-good'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.scale.setScalar(0.08);
    s.userData.noFit = true;
    this.world.add(s);
    const to = this.db.position;
    const mid = p.clone().lerp(to, 0.5);
    mid.y += 0.2;
    const curve = new THREE.QuadraticBezierCurve3(p, mid, to.clone());
    this.tween(0.5, (k) => curve.getPoint(k, s.position), {
      ease: (k) => k * k,
      onDone: () => { s.removeFromParent(); s.material.dispose(); if (!this.disposed && this.mode !== 'over') onDone(); },
    });
  }

  /** Short message above the database (a second line explains bad data), or centered. */
  toast(text, sub, token, center = false) {
    this.toastPanel?.removeFromParent();
    const blocks = [{ text, size: 'xr-text-md', weight: 'black', color: color(token), gap: sub ? 0.008 : 0 }];
    if (sub) blocks.push({ text: sub, size: 'xr-text-sm', color: color('xr-panel-text') });
    const p = this.add(textPanel(0.5, 0.08, blocks, { surface: { stroke: color(token) } }));
    if (center || this.portrait) p.position.set(0, this.eye + 0.22, -1.2);
    else {
      p.position.set(-0.86, this.eye - 0.1, -1.0);
      p.rotation.y = 0.45;
    }
    this.popIn(p);
    this.toastPanel = p;
    this.delay(sub ? 3.2 : 1.6, () => { if (this.toastPanel === p) { p.removeFromParent(); this.toastPanel = null; } });
  }

  // ---------- frame loop ----------

  update(dt) {
    this.time += dt;
    const e = this.engine;
    const playing = this.mode === 'play';
    if (playing) this.playT += dt;
    // The stream speeds up over the round (slow motion halves it for a while).
    let want = playing || this.mode === 'won' ? 3 + 2.6 * Math.min(1, this.playT / RAMP) : this.mode === 'ready' ? 2.4 : 1.4;
    if (this.slowT > 0) want *= 0.5;
    this.speed += (want - this.speed) * Math.min(1, dt * 2);
    const boost = this.speed / 6;

    this.floor.position.y = e.floorY - e.root.position.y + 0.01;
    this.vortex.userData.tick(this.time, boost);
    this.stream.userData.tick(dt, this.time, this.speed);
    this.binary?.userData.tick(this.time, this.speed / 0.35);
    this.floor.userData.tick(dt, this.speed);
    this.db.userData.tick(dt, this.time);
    // World props
    const floorY = e.floorY - e.root.position.y;
    this.racks.userData.tick(dt, this.speed, floorY);
    this.firewall.userData.tick(dt, this.speed, this.time);
    this.storm.userData.tick(dt);
    this.wind = Math.sin(this.time * 0.42) * 0.8 + Math.sin(this.time * 1.13) * 0.2;
    if (this.stormAmt > 0.5 && (this.mode === 'play' || this.mode === 'ready') && Math.random() < dt * 0.7) {
      this.storm.userData.strike();
      if (Math.random() < 0.4) sfx.storm();
    }
    this.updatePortal(dt);

    // Echo follows the hand.
    const eg = this.echo.group;
    this.swipe?.show((this.mode === 'ready' || playing) && !this.swiped);
    if (this.mode === 'ready' || playing || this.mode === 'won') {
      const target = this.readTarget();
      if (target) {
        target.x = clamp(target.x, this.C.x - BOX.x, this.C.x + BOX.x);
        target.y = clamp(target.y, this.C.y - BOX.y, this.C.y + BOX.y);
        target.z = clamp(target.z, this.C.z - BOX.z, this.C.z + BOX.z);
        eg.position.lerp(target, Math.min(1, dt * 16));
      }
    }
    this.invuln = Math.max(0, (this.invuln ?? 0) - dt);
    // Power-ups run out; the shield and the magnet show around Echo.
    for (const k of ['shieldT', 'magnetT', 'slowT']) this[k] = Math.max(0, (this[k] ?? 0) - (playing ? dt : 0));
    this.shieldFx.position.copy(eg.position);
    this.shieldFx.userData.setFade(this.shieldT > 0 ? Math.min(1, this.shieldT * 2) * (this.shieldT < 3 ? 0.5 + 0.5 * Math.sin(this.time * 14) : 1) : 0);
    this.shieldFx.userData.tick(this.time);
    this.magnetFx.position.copy(eg.position);
    this.magnetFx.userData.tick(this.time, this.magnetT > 0 ? Math.min(1, this.magnetT * 2) : 0);
    // Echo keeps an eye on the hacker (or the mothership) while one is there.
    const look = (this.boss?.obj ?? this.hacker?.obj ?? this.vortex).getWorldPosition(new THREE.Vector3());
    this.echo.update(dt, { flow: this.speed, blink: this.invuln > 0, lookWorld: look });

    if (playing) {
      if (this.phase === 'boss') this.bossT += dt;
      this.nextSpawn -= dt;
      if (this.nextSpawn <= 0) {
        this.spawn();
        // Less data while a hacker attacks, so dodging stays fair; during the boss fight a
        // steady stream of good data for the pulses.
        this.nextSpawn = this.phase === 'boss' ? rnd(0.7, 1.0) : (1.25 - 0.5 * Math.min(1, this.playT / RAMP) + rnd(-0.1, 0.15)) * (this.hacker ? 1.5 : 1);
      }
      // The next world: the portal flies ahead of it; at the end the mothership comes.
      if (this.phase === 'worlds') {
        const next = this.wi + 1;
        if (next < WORLDS.length && !this.portal.visible && this.portalNext === null && this.playT >= next * WORLD_T - PORTAL_LEAD) this.launchPortal(next);
        if (this.playT >= BOSS_AT) this.startBoss();
      }
      if (this.nextPower < POWER_TIMES.length && this.playT >= POWER_TIMES[this.nextPower]) {
        this.spawnPower();
        this.nextPower += 1;
      }
      if (this.phase === 'worlds' && !this.hacker && this.nextHacker < HACKER_TIMES.length && this.playT >= HACKER_TIMES[this.nextHacker]) {
        this.spawnHacker(this.nextHacker);
        this.nextHacker += 1;
      }
      if (this.nextCoin < FLIGHT_FACTS.length && this.playT >= COIN_TIME(this.nextCoin)) {
        this.spawnCoin(this.nextCoin);
        this.nextCoin += 1;
      }
      music.intensity = this.fill > 0.7 || this.phase === 'boss' ? 2 : 1;
      if (this.playT >= DURATION + 3) this.finish(false);
    }
    this.moveItems(dt);
    this.moveCoins(dt);
    this.moveGates(dt);
    this.movePowers(dt);
    this.updateHacker(dt);
    this.updateBoss(dt);
    this.updatePulses(dt);
    this.moveShots(dt);
    this.data.sync(this.items, this.time);

    if (Math.floor(this.time * 4) !== this.hudTick) {
      this.hudTick = Math.floor(this.time * 4);
      if (this.mode !== 'intro' && this.mode !== 'over') this.refreshHud?.();
    }
    if (!e.isXR) this.previewCamera();
  }

  moveItems(dt) {
    const p = this.echo.group.position;
    const seg = new THREE.Vector3();
    const rel = new THREE.Vector3();
    const magnet = this.magnetT > 0;
    for (const it of [...this.items]) {
      it.prev.copy(it.pos);
      it.pos.z += this.speed * dt;
      // Data magnet: good data close ahead bends towards Echo.
      if (magnet && it.kind === 'good' && it.pos.z > p.z - 2.2 && it.pos.z < p.z) {
        const pull = Math.min(1, dt * 4);
        it.tx += (p.x - (it.wind ?? 0) * BOX.x * 0.9 - it.tx) * pull;
        it.ty += (p.y - it.ty) * pull;
      }
      this.place(it);
      const z = it.pos.z;
      it.fade = clamp((z - Z0) / 0.8, 0, 1) * clamp((GONE_Z - z) / 0.35, 0, 1);
      if (this.mode === 'play' || this.mode === 'ready') {
        // Swept test: closest point of this frame's path to Echo.
        seg.subVectors(it.pos, it.prev);
        rel.subVectors(p, it.prev);
        const k = clamp(rel.dot(seg) / Math.max(seg.lengthSq(), 1e-9), 0, 1);
        const d = rel.sub(seg.multiplyScalar(k)).length();
        if (it.kind === 'good' && d < R_GOOD * it.size * (magnet ? 1.5 : 1)) { this.collect(it); continue; }
        if (it.kind === 'bad' && d < R_BAD * it.size && this.invuln <= 0) { this.hitBad(it); continue; }
      }
      if (z >= GONE_Z) {
        if (it.kind === 'bad' && this.mode === 'play') { this.dodged += 1; this.score += 3; }
        if (it.kind === 'good') this.streak = 0;
        this.removeItem(it);
      }
    }
  }

  /**
   * Browser preview: a fixed view behind Echo that keeps the flight space, the database and
   * the top bar in sight. On a phone held upright the database moves below Echo.
   */
  previewCamera() {
    const e = this.engine;
    const cam = e.camera;
    const portrait = cam.aspect < 0.8;
    if (portrait !== this.portrait) {
      this.portrait = portrait;
      if (portrait) this.db.position.set(0, this.eye - 0.8, -0.9);
      else this.db.position.set(-0.78, this.eye - 0.47, -0.95);
    }
    const flying = this.mode === 'ready' || this.mode === 'play' || this.mode === 'won';
    e.fitEnabled = !flying;
    if (!flying) return;
    const tv = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const th = tv * cam.aspect;
    // Room sideways for Echo's flight space (and the database beside it), upwards for the top
    // bar, downwards for the database.
    const z = portrait
      ? Math.max(0.35, 0.6 / th - 0.85, 0.66 / th - 1.4, 0.8 / tv - 1.4, 1.04 / tv - 0.9)
      : Math.max(0.35, 0.95 / th - 0.95, 0.8 / tv - 1.4, 0.72 / tv - 0.95);
    const local = new THREE.Vector3(0, this.eye + 0.02, z);
    cam.position.copy(this.group.localToWorld(local));
    cam.rotation.set(0, 0, 0);
  }

  dispose() {
    this.mode = 'over';
    this.app.echo?.suppress(false);
    this.setRays(true);
    this.engine.fitEnabled = true;
    this.engine.backdrop.visible = this.prevBackdrop;
    if (!this.engine.isXR) this.engine.camera.rotation.set(0, 0, 0);
    this.echo?.dispose();
    this.engine.scene.environment = this.prevEnvironment ?? null;
    this.envTarget?.dispose();
    super.dispose();
  }
}
