// "Autohof" (key 'cars'): six weeks on a used-car lot, a small business simulation. Every week
// the same three decisions, each one or two taps:
//   1. Ankauf   buy trade-ins and auction lots (one haggling try each: cheaper, or the seller walks)
//   2. Preis    one stance for the whole lot: quick sale, normal, patient
//   3. Werbung  a budget in four steps, optionally aimed at one kind of car; the screen shows the
//               expected visitors against the cars on offer before the week starts
// Then the week plays out on the lot (about seven seconds, skippable): visitors come, look for
// their kind of car, buy it, find it too dear or leave empty-handed; then a short summary.
// The AI forecast shows the expected buyers per kind of car as a range with a trend and one
// line of reason; it learns from the weeks so far (the ranges narrow), and once or twice per
// round a news flash brings something it could not know. After each week: forecast against
// what really happened. The lesson: a forecast with a range helps planning, it is no promise.
//
// Rules: cars-sim.js. The lot: cars-visuals.js. Browser (desktop and phones): the panels are
// screen elements around the 3D lot (cars-screen.js); the whole round works with the keyboard
// alone (1 to 5, arrows, space bar, Enter, H, Backspace), the mouse alone or a finger alone.
// Headset (AR and VR): the lot stands on a table in front of the player, the panels are 3D
// cards around it (cars-panels.js): point and press.
// Relaxed mode (assist.js): an AI tip for every decision, milder news, a smaller loss on
// leftovers, more money to start with. Calm motion: cars and visitors appear and vanish in
// place, no camera moves, few particles.
import * as THREE from 'three';
import { BaseScene } from '../scene.js';
import { num, hex } from '../tokens.js';
import { t, getLang } from '../i18n.js';
import { sfx } from '../sfx.js';
import { sceneLook, bloom, gfxTier } from '../gfx.js';
import { assist } from '../assist.js';
import '../cars-text.js';
import { CarsGame, SEGMENTS, STANCES, TUNE, WEEKS } from '../cars-sim.js';
import { Lot } from '../cars-visuals.js';
import { carsScreen } from '../cars-screen.js';
import { CarsBoard } from '../cars-panels.js';

const RANKS = [0, 2000, 3300]; // rating in three steps (points before the relaxed mode's share)
const STEPS = ['buy', 'price', 'ads'];
const TILT = { desk: 0.9, port: 0.64, land: 0.66 }; // browser: how far the lot tilts towards the camera
const SKIP = 12; // a skipped week runs this much faster
const FOV = 34; // browser: a long lens, so the lot looks like a miniature (the engine resets its own after the game)
const MOODS = { spring: ['spring', null], snow: ['snow', 'snow'], rain: ['rain', 'rain'], fair: ['warm', null], bonus: ['warm', null] };
const NEWS_MOODS = { hail: ['rain', 'rain'], heat: ['spring', null] };
let again = false; // "Nochmal": the next round starts at once, without the intro

export class CarsScene extends BaseScene {
  constructor(app) {
    super(app);
    this.gameKey = 'cars';
    this.mode = 'intro';
    this.time = 0;
    this.easy = assist.easy;
    this.calm = assist.reducedMotion;
    this.xr = this.engine.isXR;
    this.ar = this.xr && this.engine.xrMode === 'immersive-ar';
    this.game = new CarsGame({ easy: this.easy });
    this.coached = new Set();
    this.pinCar = null;
    this.hoverCar = null;
    this.log = [];
    this.setLook();
    this.board = new THREE.Group();
    this.group.add(this.board);
    this.lot = new Lot(this.engine.renderer, {
      xr: this.xr, ar: this.ar, calm: this.calm, name: t('carsName'),
      signText: (car) => this.signText(car),
      onCar: (id, kind) => this.carEvent(id, kind),
    });
    // Lights that glow a little in the browser's bloom (values above 1 only matter there).
    this.lot.lightMat.color.setScalar(2.2);
    this.lot.glowMat.color.setScalar(1.2);
    this.board.add(this.lot.root);
    this.lot.sync(this.game);
    this.setControls({
      desktop: [[t('carsCtlKeys'), t('carsCtlKeysDo')], [t('carsCtlEnter'), t('carsCtlEnterDo')], [t('carsCtlH'), t('carsCtlHDo')], [t('carsCtlMouse'), t('carsCtlMouseDo')]],
      touch: [[t('carsCtlTap'), t('carsCtlTapDo')], [t('carsCtlTapCar'), t('carsCtlTapCarDo')]],
      xr: [[t('carsCtlPoint'), t('carsCtlPointDo')], [t('carsCtlLook'), t('carsCtlLookDo')]],
    });
    const cb = {
      onMenu: () => this.menuOrPause(),
      onBuy: (id) => this.buy(id),
      onHaggle: (id) => this.haggle(id),
      onStance: (s) => { this.game.setStance(s); sfx.click(); this.refresh(); },
      onAd: (i) => { this.game.setAd(i); sfx.click(); this.refresh(); },
      onTarget: (seg) => { this.game.setTarget(seg); sfx.click(); this.refresh(); },
      onNext: () => this.next(),
      onBack: () => this.back(),
      onStep: (name) => this.goStep(name),
      onCarOver: (id) => this.carEvent(id, id == null ? 'out' : 'over'),
      onCarPick: (id) => this.carEvent(id, 'click'),
      onCloseInfo: () => this.closeInfo(),
    };
    this.ui = this.xr ? new CarsBoard(this, cb) : carsScreen(cb, { calm: this.calm });
    this.onSceneDispose(() => this.ui.remove());
    if (!this.xr) {
      this.onKey = (e) => this.key(e);
      window.addEventListener('keydown', this.onKey);
      this.onResize = () => { this.shapeDirty = true; };
      window.addEventListener('resize', this.onResize);
      this.mobileView((cam, dt) => this.frameLot(cam, dt));
      // A tap or click on the lot (beside the cars) skips the running week.
      const prevEmpty = this.engine.onEmptyPress;
      this.engine.onEmptyPress = () => { if (this.mode === 'run') this.skip(); };
      this.onSceneDispose(() => { this.engine.onEmptyPress = prevEmpty; });
    }
    this.onUpdate((dt) => this.update(dt));
    this.layout();
    if (again) {
      again = false;
      this.startMusic(-1);
      this.start();
    } else this.intro(t('carsName'), t(this.easy ? 'carsIntroEasy' : 'carsIntro'), () => this.start());
  }

  // ---------- the look (gfx.js) ----------

  /**
   * Neutral tone mapping, the studio environment for the car paint and glass, soft shadows; the
   * room's own lights turned down (the lot has its key and fill). Browser and VR get a soft sky
   * around the lot; in AR nothing hides the real room. The browser adds a gentle bloom on lamps
   * and car lights (never in the headset).
   */
  setLook() {
    const e = this.engine;
    const tier = gfxTier();
    this.onSceneDispose(sceneLook(e, { tone: 'neutral', exposure: 1.0, env: 'studio', envIntensity: 0.55, shadows: tier === 'low' ? false : 'soft' }));
    const sun = e.scene.children.find((o) => o.isDirectionalLight);
    const prev = { hemi: e.hemi.intensity, sun: sun?.intensity, backdrop: e.backdrop.visible, fog: e.scene.fog?.color.getHex() };
    e.hemi.intensity = prev.hemi * 0.3;
    if (sun) sun.intensity = prev.sun * 0.2;
    this.onSceneDispose(() => { e.hemi.intensity = prev.hemi; if (sun) sun.intensity = prev.sun; });
    if (this.ar) return;
    // A sky dome: deep blue above, light at the horizon (vertex colors, no texture).
    const geo = new THREE.SphereGeometry(30, 24, 12);
    const top = new THREE.Color(hex('xr-cars-sky-top'));
    const mid = new THREE.Color(hex('xr-cars-sky-mid'));
    const low = new THREE.Color(hex('xr-cars-sky-bottom'));
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const k = THREE.MathUtils.clamp(pos.getY(i) / 30, -1, 1);
      if (k > 0.12) c.copy(mid).lerp(top, Math.min(1, (k - 0.12) / 0.6)); else c.copy(low).lerp(mid, THREE.MathUtils.clamp((k + 0.25) / 0.37, 0, 1));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false, toneMapped: false }));
    dome.userData.noFit = true;
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    this.group.add(dome);
    this.dome = dome;
    // The browser shows only the sky; VR keeps the floor grid as a place to stand on.
    const fog = e.scene.fog;
    const fogRange = fog ? [fog.near, fog.far] : null;
    if (!this.xr) {
      e.backdrop.visible = false;
      if (fog) { fog.near = 30; fog.far = 60; } // the long lens stands far back: no haze over the lot
    }
    fog?.color.setHex(hex('xr-cars-sky-bottom'));
    this.onSceneDispose(() => { e.backdrop.visible = prev.backdrop; if (fog && e.scene.fog === fog) { fog.color.setHex(prev.fog); [fog.near, fog.far] = fogRange; } });
    if (!this.xr && !this.calm) this.onSceneDispose(bloom(e, { strength: 0.3, radius: 0.45, threshold: 1.2 }));
  }

  // ---------- layout ----------

  get playing() { return this.mode !== 'intro' && this.mode !== 'over'; }

  /** Places the lot for the headset (a table in front of the player) or the browser (tilted towards the camera). */
  layout() {
    const e = this.engine;
    const { eye, board } = this;
    if (this.xr) {
      const over = this.mode === 'over';
      const s = num('xr-cars-table-scale');
      // Behind the results the lot is smaller, lower and closer: below the sight lines to the buttons.
      board.position.set(0, eye - num('xr-cars-table-drop') - (over ? 0.2 : 0), num('xr-cars-table-z') + (over ? 0.22 : 0));
      board.rotation.set(0, 0, 0);
      board.scale.setScalar(over ? s * 0.62 : s);
      board.visible = true;
      this.lot.setFace(-0.62);
      return;
    }
    const shape = this.ui.shape;
    const tilt = TILT[shape] ?? TILT.desk;
    this.lot.setFace(-tilt);
    board.rotation.set(tilt, 0, 0);
    if (this.mode === 'intro') {
      // Below the intro panel and its start button (not on a phone held sideways: no room).
      board.visible = !(e.touchUI && shape === 'land');
      board.position.set(0, eye - 1.02, -1.5);
      board.scale.setScalar(0.92);
    } else if (this.mode === 'over') {
      board.visible = false;
    } else {
      board.visible = true;
      board.position.set(0, eye - 0.2, -1.6);
      board.scale.setScalar(1);
    }
    this.lot.root.userData.noFit = this.mode !== 'intro';
    this.frameKey = '';
  }

  /**
   * Browser: the camera frames the lot in the part of the screen the panels leave free. It
   * looks straight ahead (the lot is tilted instead), so pointing with the mouse stays simple.
   */
  frameLot(cam, dt) {
    if (!this.playing) { this.frameKey = ''; this.framed = false; return false; }
    const r = this.ui.lotRect();
    // The stage's close button sits in the top right corner: the lot stays below it.
    const close = document.querySelector('#stage .stage__close')?.getBoundingClientRect();
    if (close && close.width && close.left < r.right && close.bottom > r.top && r.bottom - close.bottom > 90) r.top = close.bottom + 4;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const key = `${Math.round(r.left)}|${Math.round(r.top)}|${Math.round(r.right)}|${Math.round(r.bottom)}|${W}|${H}|${this.ui.shape}`;
    if (key !== this.frameKey) {
      this.frameKey = key;
      this.frameTo = this.fitCamera(cam, r, W, H);
    }
    if (cam.fov !== FOV || cam.rotation.x !== 0 || cam.rotation.y !== 0) { cam.fov = FOV; cam.rotation.set(0, 0, 0); cam.updateProjectionMatrix(); }
    if (!this.framed || this.calm) { cam.position.copy(this.frameTo); this.framed = true; } else cam.position.lerp(this.frameTo, Math.min(1, dt * 5));
    return true;
  }

  /** The camera position from which the lot's box just fits the screen rectangle r. */
  fitCamera(cam, r, W, H) {
    this.board.updateMatrixWorld(true);
    const pts = [];
    for (const x of [-0.675, 0.675]) for (const y of [-0.03, 0.2]) for (const z of [-0.49, 0.53]) pts.push(new THREE.Vector3(x, y, z).applyMatrix4(this.board.matrixWorld));
    // The flag poles are taller than the rest, but thin: they may touch the edge. The showroom's
    // roof and the pylon sign stay inside.
    pts.push(new THREE.Vector3(-0.5, 0.27, -0.4).applyMatrix4(this.board.matrixWorld));
    for (const [x, y, z] of [[-0.37, 0.23, -0.465], [0.3, 0.23, -0.465], [-0.44, 0.25, -0.3]]) pts.push(new THREE.Vector3(x, y, z).applyMatrix4(this.board.matrixWorld));
    const tv = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    const th = tv * (W / H);
    const pad = this.ui.shape === 'desk' ? 0.93 : 0.97;
    const w = Math.max(60, r.right - r.left);
    const h = Math.max(60, r.bottom - r.top);
    const cx = ((r.left + r.right) / W) - 1;
    const cy = 1 - ((r.top + r.bottom) / H);
    const hx = (w / W) * pad;
    const hy = (h / H) * pad;
    const c = new THREE.Vector3();
    pts.forEach((p) => c.add(p));
    c.multiplyScalar(1 / pts.length);
    const out = new THREE.Vector3(c.x, c.y, c.z + 2);
    const bounds = (X, Y, Z) => {
      let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
      for (const p of pts) {
        const d = Math.max(0.05, Z - p.z);
        const nx = (p.x - X) / (d * th);
        const ny = (p.y - Y) / (d * tv);
        x0 = Math.min(x0, nx); x1 = Math.max(x1, nx); y0 = Math.min(y0, ny); y1 = Math.max(y1, ny);
      }
      return { x0, x1, y0, y1 };
    };
    let lo = 0.5;
    let hi = 24;
    for (let i = 0; i < 26; i++) {
      const d = (lo + hi) / 2;
      const Z = c.z + d;
      let X = out.x;
      let Y = out.y;
      let b = bounds(X, Y, Z);
      for (let k = 0; k < 3; k++) {
        X += ((b.x0 + b.x1) / 2 - cx) * d * th;
        Y += ((b.y0 + b.y1) / 2 - cy) * d * tv;
        b = bounds(X, Y, Z);
      }
      out.set(X, Y, Z);
      if (b.x1 - b.x0 <= 2 * hx && b.y1 - b.y0 <= 2 * hy) hi = d; else lo = d;
    }
    const Z = c.z + hi;
    let b = bounds(out.x, out.y, Z);
    for (let k = 0; k < 4; k++) {
      out.x += ((b.x0 + b.x1) / 2 - cx) * hi * th;
      out.y += ((b.y0 + b.y1) / 2 - cy) * hi * tv;
      b = bounds(out.x, out.y, Z);
    }
    out.z = Z;
    return out;
  }

  // ---------- numbers as text ----------

  money(n) { return new Intl.NumberFormat(getLang() === 'de' ? 'de-DE' : 'en-US', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Math.round(n)).replace(/ /g, ' '); }

  signed(n) { const v = Math.round(n); return `${v > 0 ? '+' : v < 0 ? '−' : ''}${this.money(Math.abs(v))}`; }

  segNames(list) { return list.map((s) => t(`carsSeg_${s}`)).join(', '); }

  /** What a car's price sign says. */
  signText(car) {
    return {
      price: this.money(this.game.price(car)),
      tag: car.weeks >= 2 ? t('carsSinceShort', { n: car.weeks }) : null,
      sub: t(`carsCond_${car.cond}`),
    };
  }

  statusText() {
    const g = this.game;
    const short = !this.xr && this.ui.shape !== 'desk';
    return t(short ? 'carsHudShort' : 'carsHud', { week: Math.min(WEEKS, g.week), weeks: WEEKS, cash: this.money(this.shownCash ?? g.cash), profit: this.signed(this.shownProfit ?? g.profit) });
  }

  // ---------- the round ----------

  start() {
    this.clearLayer();
    if (this.xr) this.refreshHud = this.hud(() => this.statusText());
    this.ui.show(true);
    this.beginWeek();
  }

  /** A new week: offers arrive on the transporters, the forecast is up, light and weather follow its signal. */
  beginWeek() {
    const g = this.game;
    this.mode = 'buy';
    this.res = null;
    this.shownCash = null;
    this.shownProfit = null;
    this.closeInfo();
    this.layout();
    this.lot.sync(g);
    this.lot.ambient.on = true;
    this.lot.showTrucks(g.transporters);
    const [mood, weather] = MOODS[g.signal] ?? ['calm', null];
    this.lot.setMood(mood, weather);
    if (g.loanNote) this.flash(t('carsLoan', { amount: this.money(g.loanNote.amount), fee: this.money(g.loanNote.fee) }), 'loan', 6);
    else this.ui.setNews(null);
    if (g.week > 1) sfx.whoosh();
    this.refresh();
  }

  /** A line over the lot for a few seconds. */
  flash(text, kind = 'news', secs = 5, label = '') {
    this.ui.setNews(text, kind, label);
    this.flashT = secs;
  }

  buy(id) {
    if (this.mode !== 'buy') return;
    const g = this.game;
    const i = g.offers.findIndex((o) => o.id === id);
    const car = g.buy(id);
    if (!car) { sfx.wrong(); return; }
    sfx.build();
    this.lot.addCar(car, { roll: true, from: g.transporters > 1 ? i % 2 : 0 });
    this.refresh();
  }

  haggle(id) {
    if (this.mode !== 'buy') return;
    const res = this.game.haggle(id);
    if (!res) return;
    if (res.ok) { sfx.correct(); this.flash(t('carsHaggleWon', { price: this.money(res.ask) }), 'reward', 2.6); } else { sfx.wrong(); this.flash(t('carsHaggleLost'), 'news', 2.6); }
    this.refresh();
  }

  goStep(name) {
    if (!STEPS.includes(this.mode) || !STEPS.includes(name) || name === this.mode) return;
    sfx.click();
    this.mode = name;
    this.lot.showTrucks(name === 'buy' ? this.game.transporters : 0);
    this.refresh();
  }

  /** The main button and Enter: the next step, start the week, skip it, the next week. */
  next() {
    const m = this.mode;
    if (m === 'buy') this.goStep('price');
    else if (m === 'price') this.goStep('ads');
    else if (m === 'ads') this.run();
    else if (m === 'run') this.skip();
    else if (m === 'sum') this.nextWeek();
  }

  back() {
    if (this.mode === 'price') this.goStep('buy');
    else if (this.mode === 'ads') this.goStep('price');
  }

  /** The week runs: the game decides everything at once, the lot plays it back. */
  run() {
    const g = this.game;
    this.closeInfo();
    this.shownCash = g.cash;
    this.shownProfit = g.profit;
    const res = g.runWeek();
    this.res = res;
    this.mode = 'run';
    this.runT = 0;
    this.seen = 0;
    this.soldN = 0;
    this.gain = 0;
    this.log = [];
    this.skipping = false;
    this.lot.showTrucks(0);
    this.lot.ambient.on = false;
    this.ui.setNews(null);
    this.flashT = 0;
    sfx.whoosh();
    const n = res.visitors.length;
    const gap = n ? Math.min(0.55, 3.0 / n) : 0;
    const start = res.surprise ? 1.4 : 0.4;
    this.queue = res.visitors.map((v, i) => ({ at: start + i * gap, v, side: i % 2 ? -1 : 1 }));
    this.pending = new Set();
    this.runEnd = start + n * gap + (this.calm ? 2.4 : 4.1);
    this.newsAt = res.surprise ? 0.15 : null;
    this.refresh();
  }

  skip() {
    if (this.mode !== 'run' || this.skipping) return;
    this.skipping = true;
    sfx.click();
  }

  updateRun(dt) {
    this.runT += dt;
    const res = this.res;
    if (this.newsAt !== null && this.runT >= this.newsAt) {
      this.newsAt = null;
      this.ui.setNews(t(`carsNews_${res.surprise}`), 'news', t('carsNews'));
      if (!this.skipping) sfx.announce();
      const m = NEWS_MOODS[res.surprise];
      if (m) this.lot.setMood(m[0], m[1]);
    }
    while (this.queue.length && this.queue[0].at <= this.runT) {
      const { v, side } = this.queue.shift();
      const outcome = v.outcome === 'buy' ? 'buy' : v.carId ? 'dear' : 'none';
      this.pending.add(v);
      this.lot.visit({ seg: v.seg, carId: v.carId, outcome, side, onResolve: (p) => this.resolved(v, outcome, p) });
    }
    if (this.runT >= this.runEnd) this.endRun();
  }

  /** A visitor has decided: the tally, a line in the log, a tag over the lot. */
  resolved(v, outcome, p) {
    if (this.mode !== 'run' || !this.pending.delete(v)) return;
    this.seen += 1;
    const view = v.carId ? this.lot.cars.get(v.carId) : null;
    const x = view ? view.home.x : p?.x ?? 0;
    const z = view ? view.home.z : p?.z ?? 0;
    const car = view?.car;
    if (outcome === 'buy') {
      this.soldN += 1;
      this.gain += v.profit;
      if (!this.skipping) sfx.coin();
      this.lot.popup(this.signed(v.profit), x, z, 'gain');
      this.log.push({ kind: 'buy', text: t(v.sub ? 'carsLogSub' : 'carsLogBuy', { gain: this.signed(v.profit), seg: t(`carsSeg_${car?.seg ?? v.seg}`) }) });
    } else if (outcome === 'dear') {
      if (!this.skipping) sfx.bounce();
      this.lot.popup(t('carsDear'), x, z, 'miss');
      this.log.push({ kind: 'dear', text: t('carsLogDear', { seg: t(`carsSeg_${v.seg}`) }) });
    } else {
      if (!this.skipping) sfx.bounce();
      this.lot.popup(t(`carsNo_${v.seg}`), x, z, 'miss');
      this.log.push({ kind: 'none', text: t('carsLogNone', { seg: t(`carsSeg_${v.seg}`) }) });
    }
    this.refresh();
  }

  /** The week is over: the books, the forecast against what happened, a reward for a good week. */
  endRun() {
    const g = this.game;
    const res = this.res;
    // Whatever is still on its way arrives now (a skipped week).
    while (this.queue.length) this.pending.add(this.queue.shift().v);
    for (const v of [...this.pending]) this.resolved(v, v.outcome === 'buy' ? 'buy' : v.carId ? 'dear' : 'none', null);
    if (this.skipping) { this.lot.clearPeople(); this.lot.flush(); }
    this.lot.setBays(g.bays, true); // a new bay: its barrier pops away
    this.lot.sync(g);
    this.lot.ambient.on = true;
    this.mode = 'sum';
    this.skipping = false;
    this.shownCash = null;
    this.shownProfit = null;
    this.ui.setNews(null);
    if (res.reward) {
      sfx.powerup();
      this.flash(t(`carsReward_${res.reward.kind}`, { n: res.reward.bays }), 'reward', 6);
      if (!this.calm) this.burst(this.board.localToWorld(new THREE.Vector3(0, 0.2, 0)), 'xr-warning', 24);
    } else if (res.net >= 0) sfx.point(); else sfx.thud();
    this.refresh();
  }

  nextWeek() {
    if (this.mode !== 'sum') return;
    if (this.game.over) { this.finish(); return; }
    this.game.nextWeek();
    this.beginWeek();
  }

  finish() {
    const g = this.game;
    const f = g.final;
    const st = g.stats;
    this.mode = 'over';
    this.ui.show(false);
    this.closeInfo();
    this.layout();
    const score = Math.min(4950, f.score);
    // A rating in three steps, with the points missing to the next one (as the result counts them).
    const rank = RANKS.reduce((r, at, k) => (score >= at ? k : r), 0);
    const nextAt = RANKS[rank + 1];
    const rating = nextAt
      ? t('carsRankNext', { rank: t(`carsRank${rank}`), n: Math.ceil((nextAt - score) * assist.scoreFactor), next: t(`carsRank${rank + 1}`) })
      : t('carsRankTop', { rank: t(`carsRank${rank}`) });
    // What went well.
    const waste = st.adSpend ? st.adWaste / st.adSpend : 1;
    let well = f.profit > 0 ? t('carsWell_profit', { sold: st.sold, profit: this.money(f.profit) }) : t('carsWell_try');
    if (f.profit > 0) {
      if (st.adSpend >= 1500 && waste <= 0.4) well += ` ${t('carsWell_ads')}`;
      else if (f.left === 0) well += ` ${t('carsWell_empty')}`;
      else if (st.haggleWins >= 2) well += ` ${t('carsWell_haggle', { n: st.haggleWins })}`;
    }
    // One tip from the weakest number.
    const weak = [
      [f.left === 1 ? 'left1' : 'left', f.markdownLoss, { n: f.left, loss: this.money(f.markdownLoss) }],
      ['stand', st.standCost * 0.7, { n: this.money(st.standCost) }],
      ['missed', st.missed * 110, { n: st.missed }],
      ['adWaste', st.adWaste * 1.2, { n: this.money(st.adWaste) }],
      ['noAds', st.adSpend < 900 ? 2600 : 0, {}],
    ].sort((a, b) => b[1] - a[1])[0];
    const tip = weak[1] < 1500 ? t('carsTip_good') : t(`carsTip_${weak[0]}`, weak[2]);
    const learn = t('carsLearnA', {
      hits: f.hits, n: f.checks, surprise: t(f.surprises > 1 ? 'carsLearnSurprise2' : 'carsLearnSurprise1'), fav: st.favoured, bought: st.bought,
    });
    this.results({
      gameKey: 'cars', score, correct: st.sold, total: Math.max(1, st.sold + st.missed),
      line: `${rating} ${t('carsLine', { profit: this.signed(f.profit), sold: st.sold })}`,
      learned: [
        { q: t('carsWellQ'), a: well },
        { q: t('carsTipQ'), a: tip },
        { q: t('carsLearnQ'), a: learn },
      ],
      onAgain: () => { again = true; this.app.startGame('cars'); },
    });
  }

  // ---------- a car's numbers (hover, tap, pointing in the headset) ----------

  carEvent(id, kind) {
    if (!this.playing || this.mode === 'run') return;
    if (kind === 'click') {
      this.pinCar = this.pinCar === id ? null : id;
      if (this.pinCar != null) sfx.tick();
    } else if (kind === 'over') this.hoverCar = id;
    else if (this.hoverCar === id || id == null) this.hoverCar = null;
    this.showInfo();
  }

  closeInfo() {
    this.pinCar = null;
    this.hoverCar = null;
    this.showInfo();
  }

  showInfo() {
    const id = this.pinCar ?? this.hoverCar;
    const car = id == null ? null : this.game.lot.find((c) => c.id === id);
    this.lot.highlight(car ? car.id : null);
    if (!car) { if (this.pinCar != null) this.pinCar = null; this.ui.setInfo(null); return; }
    const g = this.game;
    const price = g.price(car);
    const lines = [
      `${t('carsInfoPrice', { n: this.money(price) })} · ${t('carsInfoPaid', { n: this.money(car.paid) })} · ${t('carsMargin', { n: this.signed(price - car.paid) })}`,
      t('carsInfoStand', { n: this.money(g.standCost(car)) }),
    ];
    if (car.weeks >= 1) lines.push(car.weeks === 1 ? t('carsSince1') : t('carsSince', { n: car.weeks }));
    this.ui.setInfo({ seg: car.seg, cond: car.cond, lines, pinned: this.pinCar === car.id && !this.xr });
  }

  // ---------- what the panels show ----------

  refresh() {
    if (!this.playing) return;
    this.ui.setStatus(this.statusText());
    this.refreshHud?.();
    this.ui.setForecast(this.forecastView());
    this.ui.setPanel(this.panelView());
    this.lot.refreshSigns();
    if (this.pinCar != null || this.hoverCar != null) this.showInfo();
  }

  forecastView() {
    const g = this.game;
    const res = this.mode === 'sum' ? this.res : null;
    const rows = SEGMENTS.map((seg) => {
      const r = g.forecast.rows[seg];
      const c = res?.checks[seg];
      return { seg, lo: r.lo, hi: r.hi, trend: r.trend, actual: c?.actual ?? null, hit: c?.hit ?? null };
    });
    const max = Math.max(8, ...rows.map((r) => Math.max(r.hi, r.actual ?? 0) + 1));
    rows.forEach((r) => { r.max = max; });
    const n = g.forecast.dataWeeks;
    const badge = getLang() === 'de' ? 'KI' : 'AI';
    if (res) {
      return {
        badge, title: t('carsFcCheck'), note: t('carsFcHits', { n: res.hits, total: SEGMENTS.length }), check: true, rows,
        whyLabel: res.surprise ? t('carsNews') : t('carsWhy'),
        reason: res.surprise ? `${t(`carsNews_${res.surprise}`)} ${t('carsFcSurprise')}` : t(`carsSig_${g.signal}`),
        foot: '',
      };
    }
    return {
      badge, title: `${t('carsFc')} · ${t('carsWeek', { week: g.week, weeks: WEEKS })}`, check: false, rows,
      note: n === 0 ? t('carsFcFew') : n === 1 ? t('carsFcLearned1') : t('carsFcLearned', { n }),
      whyLabel: t('carsWhy'), reason: t(`carsSig_${g.signal}`), foot: `${t('carsFcSub')} · ${t('carsFcSure')}`,
    };
  }

  /** The first week names each step once; the last week reminds of the leftovers. */
  coachFor(step) {
    const g = this.game;
    if (g.week === 1) return { text: t(`carsCoach_${step}`), kind: 'coach' };
    if (g.lastWeek && step !== 'ads') return { text: t('carsCoachLast', { pct: Math.round((1 - g.markdown) * 100) }), kind: 'warn' };
    return null;
  }

  panelView() {
    const g = this.game;
    const m = this.mode;
    const coach = STEPS.includes(m) ? this.coachFor(m) : null;
    const base = { step: m, coach: coach?.text ?? null, coachKind: coach?.kind ?? null, back: m === 'price' || m === 'ads' };
    if (m === 'buy') {
      const best = this.easy ? g.bestOffer() : null;
      const offers = g.offers.map((o) => {
        const blocked = o.state === 'open' ? g.blocked(o) : null;
        return {
          id: o.id, seg: o.seg, cond: o.cond, state: o.state, ask: this.money(o.ask), list: this.money(o.list), margin: this.signed(o.list - o.ask),
          was: o.ask !== o.firstAsk ? this.money(o.firstAsk) : null, speed: g.speed(o.seg), chance: Math.round(o.chance * 100), haggled: o.haggled,
          blocked, blockedText: blocked === 'cash' ? t('carsNoCash') : blocked === 'bays' ? t('carsNoBay') : '', tip: best?.id === o.id,
        };
      });
      if (this.easy && g.week > 1 && !best && g.offers.some((o) => o.state === 'open')) { base.coach = t('carsTipNone'); base.coachKind = 'tip'; }
      return { ...base, offers, head: t('carsBuyHead', { free: g.freeBays, bays: g.bays, cash: this.money(g.cash) }), next: t('carsNextPrice') };
    }
    if (m === 'price') {
      const tip = this.easy ? g.stanceAdvice() : null;
      const cars = [...g.lot].sort((a, b) => a.bay - b.bay).map((car) => {
        const price = g.price(car);
        const since = car.weeks === 1 ? t('carsSince1') : t('carsSince', { n: car.weeks });
        return {
          id: car.id, seg: car.seg, price: this.money(price), cost: t('carsPerWeek', { n: this.signed(-g.standCost(car)) }), dusty: car.weeks >= 2, since: t('carsSinceShort', { n: car.weeks }),
          label: `${t(`carsSeg_${car.seg}`)}, ${t(`carsCond_${car.cond}`)}: ${t('carsInfoPrice', { n: this.money(price) })}, ${t('carsMargin', { n: this.signed(price - car.paid) })}, ${t('carsInfoStand', { n: this.money(g.standCost(car)) })}${car.weeks ? `, ${since}` : ''}`,
        };
      });
      const all = g.lot.reduce((s, c) => s + g.standCost(c), 0);
      if (tip && g.week > 1) { base.coach = t('carsTipStance', { name: t(`carsStance_${tip}`) }); base.coachKind = 'tip'; }
      return { ...base, stances: STANCES.map((key) => ({ key, on: g.stance === key, tip: tip === key })), cars, standAll: g.lot.length ? t('carsStandAll', { n: this.money(all) }) : '', next: t('carsNextAds') };
    }
    if (m === 'ads') {
      const adv = this.easy ? g.adAdvice() : null;
      const pv = g.preview();
      const ads = TUNE.ads.map((a, i) => ({
        on: g.ad === i, tip: adv?.ad === i, cost: this.money(a.cost),
        extra: i ? t('carsAdExtra', { n: Math.max(1, Math.round(g.preview(i, g.target).extra)) }) : t('carsAdNone'),
      }));
      const onLot = SEGMENTS.filter((s) => g.count(s) > 0);
      const targets = [{ seg: null, on: !g.target }, ...onLot.map((seg) => ({ seg, on: g.target === seg }))];
      const match = SEGMENTS.map((seg) => {
        const r = pv.rows[seg];
        const v = Math.round(r.visitors);
        const verdict = !r.cars ? (v >= 1 ? 'empty' : 'none') : r.visitors - r.cars >= 1 ? 'empty' : r.staying >= 0.6 ? 'stay' : 'ok';
        return { seg, visitors: String(v), cars: r.cars, verdict };
      });
      const lines = [];
      if (!g.lot.length) lines.push({ text: t('carsMatchLineNoCars'), kind: 'warn' });
      else {
        const e = match.filter((r) => r.verdict === 'empty').map((r) => r.seg);
        const s = match.filter((r) => r.verdict === 'stay').map((r) => r.seg);
        if (Math.round(pv.empty) >= 2 && e.length) lines.push({ text: t('carsMatchLineEmpty', { n: Math.round(pv.empty), segs: this.segNames(e) }), kind: 'warn' });
        if (Math.round(pv.staying) >= 1 && s.length) lines.push({ text: t(Math.round(pv.staying) === 1 ? 'carsMatchLineStay1' : 'carsMatchLineStay', { n: Math.round(pv.staying), segs: this.segNames(s) }), kind: 'coach' });
        if (!lines.length) lines.push({ text: t('carsMatchLineOk'), kind: 'good' });
      }
      if (adv && g.week > 1) lines.unshift({ text: adv.target ? t('carsTipAdTarget', { name: t(`carsAd_${adv.ad}`), seg: t(`carsSeg_${adv.target}`) }) : t('carsTipAd', { name: t(`carsAd_${adv.ad}`) }), kind: 'tip' });
      return {
        ...base, ads, adOff: g.ad === 0, targets, match, matchLines: lines,
        matchHead: t('carsMatchHead', { v: Math.round(pv.visitors), c: pv.cars }), next: t('carsGo'),
      };
    }
    if (m === 'run') {
      return {
        ...base, title: t('carsRun', { week: g.week }), visitors: `${this.seen}/${this.res.visitors.length}`, sold: String(this.soldN), gain: this.signed(this.gain),
        log: this.log.slice(-8), next: t('carsSkip'),
      };
    }
    // The week's summary.
    const r = this.res;
    const rows = [{ label: r.sold.length === 1 ? t('carsSumSold1') : r.sold.length ? t('carsSumSold', { n: r.sold.length }) : t('carsSumSold0'), value: this.signed(r.gross), kind: r.gross > 0 ? 'good' : '' }];
    if (r.carsLeft) rows.push({ label: r.carsLeft === 1 ? t('carsSumStand1') : t('carsSumStand', { n: r.carsLeft }), value: this.signed(-r.standCost), kind: 'bad' });
    if (r.ad) rows.push({ label: t('carsSumAds', { name: t(`carsAd_${r.ad}`) }), sub: r.perSale ? t('carsSumPerSale', { n: this.money(r.perSale) }) : null, value: this.signed(-r.adCost), kind: 'bad' });
    else rows.push({ label: t('carsSumNoAds'), value: '' });
    if (r.missed) rows.push({ label: t(r.missed === 1 ? 'carsSumMissed1' : 'carsSumMissed', { n: r.missed }), sub: t('carsSumMissedSegs', { segs: this.segNames(Object.keys(r.missedBy)) }), value: '' });
    if (r.dear) rows.push({ label: t(r.dear === 1 ? 'carsSumDear1' : 'carsSumDear', { n: r.dear }), value: '' });
    const notes = [];
    if (g.over) {
      const f = g.final;
      notes.push(f.left ? { text: t(f.left === 1 ? 'carsLeftOver1' : 'carsLeftOver', { n: f.left, loss: this.money(f.markdownLoss) }), kind: 'warn' } : { text: t('carsLeftNone'), kind: 'good' });
    } else {
      const a = r.advice;
      const vars = { ...a.vars };
      if (vars.seg) vars.seg = t(`carsSeg_${vars.seg}`);
      if (vars.cost) vars.cost = this.money(vars.cost);
      if (vars.segs) vars.segs = this.segNames(vars.segs);
      notes.push({ text: t(`carsAdvice_${a.key}`, vars), kind: a.key === 'good' ? 'good' : 'coach' });
      if (r.reward) notes.push({ text: t(`carsReward_${r.reward.kind}`, { n: r.reward.bays }), kind: 'good' });
    }
    return { ...base, title: t('carsSum', { week: r.week }), net: this.signed(r.net), netGood: r.net >= 0, rows, notes, next: g.over ? t('carsToResult') : t('carsNextWeek') };
  }

  // ---------- keyboard (browser) ----------

  key(e) {
    if (this.disposed || this.engine.paused || !this.playing) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key;
    if (k === 'Escape') {
      // Only when it closes the picked car's numbers; otherwise the game pauses (pause.js).
      if (this.pinCar != null) { e.preventDefault(); this.closeInfo(); }
      return;
    }
    if (k === 'Enter') {
      if (this.ui.ownsEnter()) return;
      e.preventDefault();
      if (!e.repeat) this.next();
      return;
    }
    if (this.mode === 'run') {
      if (k === ' ') { e.preventDefault(); if (!e.repeat) this.skip(); }
      return;
    }
    if (/^[1-5]$/.test(k)) {
      e.preventDefault();
      if (!e.repeat) this.ui.press(Number(k) - 1);
    } else if (k === 'ArrowRight' || k === 'ArrowDown' || k === 'ArrowLeft' || k === 'ArrowUp') {
      e.preventDefault();
      this.ui.focusMove(k === 'ArrowRight' || k === 'ArrowDown' ? 1 : -1);
    } else if (k === 'h' || k === 'H') {
      if (this.mode !== 'buy') return;
      e.preventDefault();
      if (!e.repeat) this.ui.haggleTarget()?.click();
    } else if (k === 'Backspace') {
      e.preventDefault();
      if (!e.repeat) this.back();
    }
  }

  // ---------- time ----------

  update(dt) {
    this.time += dt;
    const e = this.engine;
    if (!this.xr) {
      if (this.shapeDirty) {
        this.shapeDirty = false;
        if (this.ui.layout()) { this.layout(); if (this.playing) { this.ui.setForecast(this.forecastView()); this.ui.setPanel(this.panelView()); this.ui.setStatus(this.statusText()); } }
        this.frameKey = '';
      }
      // Desktop: the scene frames the lot itself while it is played (phones: mobileView).
      if (!e.touchUI) {
        e.fitEnabled = !this.playing;
        if (this.playing) this.frameLot(e.camera, dt); else this.framed = false;
      } else if (!this.playing) this.framed = false;
    }
    const k = this.mode === 'run' && this.skipping ? SKIP : 1;
    if (this.mode === 'run') this.updateRun(dt * k);
    this.lot.tick(dt * k);
    if (this.flashT > 0 && this.mode !== 'run') {
      this.flashT -= dt;
      if (this.flashT <= 0) this.ui.setNews(null);
    }
  }

  dispose() {
    this.mode = 'over';
    if (this.onKey) window.removeEventListener('keydown', this.onKey);
    if (this.onResize) window.removeEventListener('resize', this.onResize);
    this.engine.fitEnabled = true;
    if (!this.engine.isXR) this.engine.camera.rotation.set(0, 0, 0);
    this.lot.dispose();
    super.dispose();
  }
}
