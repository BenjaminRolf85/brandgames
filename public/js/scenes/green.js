// "Grünes Portfolio" (key 'green'): a region diorama on the table (AR) or in front of you. Every
// round is a year with a budget: finance wind turbines, solar parks, homes, schools and daycare
// centres by placing them on free plots. An AI map forecasts the wind speed or sun hours of every
// plot from weather data (a heat map with hatching where it is unsure), the yield of a project
// with its 80 % range, and the demand of the town's districts. Then the year runs: weather,
// spinning rotors, glinting panels, a growing town, and the real yields with weather surprises
// (a calm, a storm, a sunny summer). While the year runs the AI warns of live events (storm,
// heat peak, dark lull, flood) with a calibrated confidence: react in time, or judge it a false
// alarm. Citizens voice wishes over their districts (louder when ignored, a party when met), and
// on the uncertain hills the player may bet against the AI's wind forecast (human versus AI).
// Four years, then the score: green power, CO2, quality of life, mix, budget, warnings judged
// right and bets won (at most 5000).
// Controls: headset: point and pull the trigger (or pinch) on a project card and then a plot, or
// grab a card and drop it on a plot. Desktop: click (keys 1 to 5, Enter, Esc, Backspace). Phones:
// big thumb buttons for the projects, then tap a plot.
import * as THREE from 'three';
import { BaseScene } from '../scene.js';
import { placeOnArc } from '../ui3d.js';
import { num, color } from '../tokens.js';
import { t } from '../i18n.js';
import { sfx } from '../sfx.js';
import { music } from '../music.js';
import { CHRISTMAS } from '../christmas.js';
import { sceneLook, gfxTier } from '../gfx.js';
import '../green-text.js';
import { GreenGame, TYPES, TYPE_KEYS, YEARS, WEATHER, MONTH_WIND, MONTH_SUN, CHEAPEST, LIVE } from '../green-sim.js';
import { Region, loadGreen } from '../green-visuals.js';
import { forecastPanel, dashPanel, projectCard, actionTile, alertPanel, toast, fmt, fmtInt, money, pct, typeName } from '../green-ui.js';

const PLAN_TIME = [45, 35, 35, 35]; // seconds to plan each year
const SIM_TIME = 22; // seconds the year takes on the diorama (with two live events)
const LEAD = 6; // seconds the AI warns ahead
const monthAt = (sec) => clamp((sec / (SIM_TIME - 1)) * 12, 0, 12);
const secAt = (month) => (month / 12) * (SIM_TIME - 1);
const KEYS = { 1: 'wind', 2: 'solar', 3: 'homes', 4: 'school', 5: 'kita' };
// When the year's weather surprise shows (month), per weather.
const SURPRISE = { normal: 7, calm: 4.3, stormy: 9.4, sunny: 6.2, windy: 1.2, dull: 5.6 };
const clamp = THREE.MathUtils.clamp;

export class GreenScene extends BaseScene {
  constructor(app) {
    super(app);
    this.gameKey = 'green';
    this.mode = 'intro';
    this.time = 0;
    this.sel = null; // the chosen project type
    this.hoverPlot = null; // plot under a pointer
    this.pinPlot = null; // last tapped plot (phones)
    this.drag = null; // a card held by a pointer (grab and drop)
    this.game = new GreenGame();
    this.vis = { wind: 0.55, sun: 1, cloud: 0.35, rain: 0, snowfall: CHRISTMAS ? 0.25 : 0, snow: 0.65, night: 0, storm: 0, heat: 0, month: 2.4, cutout: false, throttle: false, blackout: false };
    const r = this.engine.renderer;
    this.setLook();
    this.board = new THREE.Group(); // the diorama's place (table in the headset, tilted easel in the browser)
    this.group.add(this.board);
    this.ui = new THREE.Group(); // panels and cards, kept between the steps
    this.group.add(this.ui);
    this.onKey = (e) => this.key(e);
    window.addEventListener('keydown', this.onKey);
    this.onUpdate((dt) => this.update(dt));
    loadGreen().then((gltf) => {
      if (this.disposed) return;
      this.region = new Region(gltf, r, { xr: this.engine.isXR });
      this.board.add(this.region.root);
      this.wirePlots();
      this.layout(true);
    }).catch((e) => console.error('green.glb not loaded', e));
    const hint = this.engine.isXR ? 'greenIntroXR' : this.engine.touchUI ? 'greenIntroTouch' : 'greenIntroScreen';
    this.intro(t('greenName'), `${t('greenIntro')} ${t(hint)}`, () => this.start());
    this.layout(true);
  }

  // ---------- the look (gfx.js) ----------

  /**
   * Tone mapping, the studio environment for reflections and soft shadows (none on 'low'); the
   * room's own lights softer (the diorama has its own sun); in the browser a night-sky gradient
   * behind the diorama. No bloom: the snow and the white speech bubbles would haze the miniature.
   * In the headset no post effects, and in AR the real room stays visible.
   */
  setLook() {
    const e = this.engine;
    const tier = gfxTier();
    this.onSceneDispose(sceneLook(e, { tone: 'neutral', exposure: 1.0, env: 'studio', envIntensity: 0.45, shadows: tier === 'low' ? false : 'soft' }));
    const sun = e.scene.children.find((o) => o.isDirectionalLight);
    const prev = { hemi: e.hemi.intensity, sun: sun?.intensity };
    e.hemi.intensity = prev.hemi * 0.45;
    if (sun) sun.intensity = prev.sun * 0.35;
    this.onSceneDispose(() => { e.hemi.intensity = prev.hemi; if (sun) sun.intensity = prev.sun; });
    if (!e.isXR) {
      const c = document.createElement('canvas');
      c.width = 4;
      c.height = 256;
      const ctx = c.getContext('2d');
      const g = ctx.createLinearGradient(0, 0, 0, 256);
      g.addColorStop(0, color('xr-green-sky-top'));
      g.addColorStop(0.55, color('xr-green-sky-mid'));
      g.addColorStop(1, color('xr-green-sky-bottom'));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 4, 256);
      const sky = new THREE.CanvasTexture(c);
      sky.colorSpace = THREE.SRGBColorSpace;
      const prevBg = e.scene.background;
      e.scene.background = sky;
      this.onSceneDispose(() => { if (e.scene.background === sky) e.scene.background = prevBg; sky.dispose(); });
    }
  }

  // ---------- layout ----------

  get portrait() { return !this.engine.isXR && window.innerWidth < window.innerHeight; }

  /** Places the diorama and the panels for the headset, a desktop or a phone (either way up). */
  layout(force = false) {
    const e = this.engine;
    const xr = e.isXR;
    const touch = e.touchUI;
    const portrait = this.portrait;
    const key = `${xr}|${touch}|${portrait}|${this.mode}`;
    if (!force && key === this.layoutKey) return;
    this.layoutKey = key;
    const { eye, board } = this;
    const tilt = num('xr-green-tilt');
    const over = this.mode === 'over';
    const intro = this.mode === 'intro';
    board.visible = xr || !over; // behind the results only in the headset (on the table)
    if (this.region) {
      this.region.cloudY = xr ? 0.27 : 0.16;
      this.region.showSun = xr && !over;
      this.region.turbineYaw = -0.35 - (touch && portrait && !intro && !over ? Math.PI / 2 : 0);
    }
    if (xr) {
      // Behind the results the diorama sinks a little and comes closer, below the sight lines.
      board.position.set(0, eye - num('xr-green-table-drop') - (over ? 0.24 : 0), num('xr-green-table-z') + (over ? 0.1 : 0));
      board.rotation.set(0, 0, 0);
      board.scale.setScalar(over ? 0.7 : 1);
    } else if (intro) {
      board.position.set(0, eye - (touch && portrait ? 1.02 : 0.98), -1.6);
      board.rotation.set(tilt, 0, 0);
      board.scale.setScalar(touch && portrait ? 1 : 0.95);
    } else if (over) {
      board.position.set(0, eye - 0.95, -2.3);
      board.rotation.set(tilt, 0, 0);
      board.scale.setScalar(1.2);
    } else if (!touch) {
      board.position.set(0, eye - 0.13, -1.4);
      board.rotation.set(tilt, 0, 0);
      board.scale.setScalar(1.34);
    } else if (portrait) {
      // Phone held upright: the map turns a quarter (sea at the top, fields below) and is
      // seen a little more from above, so it fills the tall screen and the plots get bigger.
      board.position.set(0, eye - 0.42, -1.4);
      board.rotation.set(tilt + 0.14, Math.PI / 2, 0);
      board.scale.setScalar(1.32);
    } else {
      // Phones held sideways: placed by landFrame() between the thumb buttons.
      board.rotation.set(tilt, 0, 0);
    }
    // The diorama counts for the browser camera's framing except behind the results.
    if (this.region) this.region.root.userData.noFit = over;
    this.placePanels();
  }

  /** Builds (once per screen shape) and places the AI panel, the dashboard and the cards. */
  placePanels() {
    if (this.mode === 'intro' || this.mode === 'over' || !this.fc) return;
    const e = this.engine;
    const xr = e.isXR;
    const touch = e.touchUI;
    const portrait = this.portrait;
    const { eye } = this;
    const pw = num('xr-green-panel-w');
    // The AI panel: wide and short above the diorama on a phone held upright.
    // Sideways: a small corner panel with the key numbers (the thumb buttons take the corners).
    const shape = touch ? (portrait ? 'wide' : 'mini') : 'tall';
    if (this.fcShape !== shape) {
      this.fcShape = shape;
      this.fc.removeFromParent();
      this.fc.dispose();
      const size = { wide: [1.04, 0.42], mini: [0.46, 0.5], tall: [pw, 0.74] }[shape];
      this.fc = forecastPanel(size[0], size[1], () => this.fcView(touch), shape);
      this.ui.add(this.fc);
    }
    // The warning: a bar (headset, desktop, phone upright) or a small card (phone sideways).
    const ashape = touch && !portrait ? 'card' : 'bar';
    if (this.alertShape !== ashape) {
      this.alertShape = ashape;
      const was = this.alertPanel;
      this.alertPanel = ashape === 'card' ? alertPanel(0.46, 0.5, () => this.alertView(), 'card') : alertPanel(0.72, 0.22, () => this.alertView());
      this.alertPanel.renderOrder = 31;
      this.alertPanel.material.depthTest = false;
      this.alert.add(this.alertPanel);
      if (was) { was.removeFromParent(); was.dispose(); }
    }
    this.fc.rotation.set(0, 0, 0);
    this.fc.scale.setScalar(1);
    this.dash.scale.setScalar(1);
    this.cards.scale.setScalar(this.engine.isXR ? 0.86 : 1);
    this.dash.visible = !touch;
    this.cards.visible = !touch;
    // Phones: the 3D card row and the dashboard are not rendered at all (thumb buttons and the
    // status bar take their place).
    if (touch) { this.cards.removeFromParent(); this.dash.removeFromParent(); } else if (!this.cards.parent) this.ui.add(this.cards, this.dash);
    this.spacer.visible = false;
    if (xr) {
      placeOnArc(this.fc, -0.66, eye - 0.17, 1.0);
      placeOnArc(this.dash, 0.66, eye - 0.17, 1.0);
      // Tilted back a little towards the eyes (you look down at the table).
      this.fc.rotation.x = -0.18;
      this.dash.rotation.x = -0.18;
      // The cards lie like a tray at the front edge of the table, tilted towards you.
      this.cards.position.set(0, eye - num('xr-green-table-drop') - 0.05, num('xr-green-table-z') + 0.45);
      this.cards.rotation.set(-0.85, 0, 0);
    } else if (!touch) {
      this.fc.scale.setScalar(1.14);
      this.dash.scale.setScalar(1.14);
      this.fc.position.set(-1.08, eye - 0.07, -1.4);
      this.dash.position.set(1.08, eye - 0.07, -1.4);
      this.cards.position.set(0, eye - 0.8, -1.4);
      this.cards.scale.setScalar(1.12);
      this.cards.rotation.set(0, 0, 0);
    } else if (portrait) {
      this.fc.position.set(0, eye + 0.46, -1.4);
    } else this.landFrame();
    // One slot above the diorama for the warning and the messages (a message waits while a
    // warning is up). Phones held upright: that slot is the AI panel's place (it steps aside).
    this.alert.rotation.set(0, 0, 0);
    if (xr) {
      this.alert.position.set(0, eye + 0.04, num('xr-green-table-z') - 0.16);
      this.alert.scale.setScalar(1);
      this.toastSlot = { pos: this.alert.position.clone(), scale: 1, w: 0.72, shared: true };
    } else if (!touch) {
      this.alert.position.set(0, eye + 0.315, -1.25);
      this.alert.scale.setScalar(1.12);
      this.toastSlot = { pos: this.alert.position.clone(), scale: 1.12, w: 0.72, shared: true };
    } else if (portrait) {
      this.alert.position.set(0, eye + 0.46, -1.3);
      this.alert.scale.setScalar(1.04 / 0.72);
      this.toastSlot = { pos: this.alert.position.clone(), scale: 1, w: 1.04, shared: true };
    }
    this.placeToast();
  }

  /**
   * Phones held sideways: the thumb buttons float in the lower corners. An invisible frame with
   * the screen's shape makes the camera framing predictable, so the diorama fills the middle
   * between the button clusters and the AI panel sits in the free corner above the left ones.
   */
  landFrame() {
    const ins = this.engine.insets();
    const sw = window.innerWidth;
    const sh = Math.max(100, window.innerHeight - ins.top);
    // The browser camera never comes closer than 1.6 m to this depth (engine._autoFit): a frame of
    // this height fills the free screen exactly.
    const H = (2 * 1.6 * Math.tan(THREE.MathUtils.degToRad(this.engine.camera.fov / 2)) * (sh / window.innerHeight)) / 1.02;
    const s = sh / H / 1.02; // px per meter at the content's depth
    const z = -1.4;
    const fy = this.eye - 0.12;
    this.spacer.visible = true;
    this.spacer.scale.set((H * sw) / sh, H, 1);
    this.spacer.position.set(0, fy, z);
    const rect = (side) => {
      const r = document.querySelector(`#stage .mtouch--grid .mtouch__group--${side}`)?.getBoundingClientRect();
      if (r && r.width) this[`clusterRect_${side}`] = { left: r.left, right: r.right, top: r.top };
      return this[`clusterRect_${side}`] ?? (side === 'left' ? { left: 0, right: sw * 0.23, top: ins.top + sh * 0.6 } : { left: sw * 0.77, right: sw, top: ins.top + sh * 0.6 });
    };
    const L = rect('left');
    const R = rect('right');
    const mx = (px) => (px - sw / 2) / s;
    const my = (py) => fy + (sh / 2 - py) / s; // py: from the top of the free area
    // The diorama between the clusters, as large as the height allows.
    const x0 = L.right + 4;
    const x1 = R.left - 4;
    const k = Math.min((x1 - x0) / s / 1.06, (sh - 10) / s / 0.92);
    this.board.scale.setScalar(k);
    this.board.position.set(mx((x0 + x1) / 2), my(sh / 2) - 0.03 * k, z);
    // The AI panel in the free corner above the left buttons.
    const cw = L.right - 12;
    const ch = L.top - ins.top - 14;
    const ps = Math.max(0.3, Math.min(cw / s / 0.46, ch / s / 0.5));
    this.fc.scale.setScalar(ps);
    this.fc.position.set(mx(8) + 0.23 * ps, my(6) - 0.25 * ps, z);
    // The warning takes the AI panel's corner (as a card of the same size); messages go to the
    // free corner on the right, above the right thumb buttons: never over the map.
    this.alert.scale.setScalar(ps);
    this.alert.position.set(this.fc.position.x, this.fc.position.y, -1.3);
    const rw = sw - R.left - 12;
    const rh = R.top - ins.top - 14;
    const ts = Math.max(0.3, Math.min(rw / s / 0.46, rh / s / 0.36));
    this.toastSlot = { pos: new THREE.Vector3(mx(R.left + 6) + 0.23 * ts, my(6), -1.3), scale: ts, w: 0.46, shared: false, top: true, maxH: rh / s };
    this.placeToast();
  }

  buildUI() {
    const pw = num('xr-green-panel-w');
    this.fc = forecastPanel(pw, 0.74, () => this.fcView(false));
    this.fcShape = 'tall';
    this.dash = dashPanel(pw, 0.74, () => this.dashView());
    this.ui.add(this.fc, this.dash);
    // Cards (desktop and headset): five projects and the action tile.
    const cards = new THREE.Group();
    this.cardTiles = TYPE_KEYS.map((k, i) => {
      const tile = projectCard(k, () => ({ selected: this.sel === k, disabled: !this.canChoose(k), key: !this.engine.isXR && !this.engine.touchUI ? String(i + 1) : null }));
      tile.userData.onGrab = (p) => this.grabCard(k, p);
      tile.userData.onRelease = (p) => this.releaseCard(k, p);
      cards.add(tile);
      return tile;
    });
    this.actionBtn = actionTile(() => this.actionState());
    this.actionBtn.userData.label = 'action';
    this.actionBtn.userData.onClick = () => this.action();
    cards.add(this.actionBtn);
    const items = [...this.cardTiles, this.actionBtn];
    const gap = 0.012;
    const total = items.reduce((s, b) => s + b.w, 0) + gap * (items.length - 1);
    let x = -total / 2;
    for (const b of items) { b.position.set(x + b.w / 2, 0, 0); x += b.w + gap; }
    this.cards = cards;
    this.ui.add(cards);
    // The AI's live warnings while the year runs.
    // (In a holder: the holder is placed and scaled per screen, the panel pops in inside it.)
    this.alert = new THREE.Group(); // the warning panel itself is made per screen (placePanels)
    this.alert.visible = false;
    this.ui.add(this.alert);
    // Phones in landscape: keeps the lower corners (thumb buttons) free in the camera's framing.
    this.spacer = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.001), new THREE.MeshBasicMaterial({ visible: false }));
    this.ui.add(this.spacer);
    // Phones: big thumb buttons (projects left and right, the action bottom right).
    const groups = { wind: 'left', solar: 'left', homes: 'left', school: 'right', kita: 'right' };
    this.pad = this.touchButtons([
      ...TYPE_KEYS.map((k) => ({ icon: TYPES[k].icon, label: `${t(`greenShort_${k}`)} ${t('greenCostShort', { n: TYPES[k].cost })}`, onPress: () => this.choose(k), group: groups[k] })),
      { icon: 'greenGo', label: t('greenStartShort'), onPress: () => this.action(), group: 'right' },
    ], { grid: true });
    if (this.pad) this.padEls = [...document.querySelectorAll('#stage .mtouch--grid .mtouch__btn')].slice(-6);
  }

  // ---------- views for the panels ----------

  fcView(touch) {
    const g = this.game;
    if (this.mode === 'sim') return { mode: 'sim', report: this.report, month: this.month ?? 0, news: this.news, game: g };
    if (this.mode === 'report') return { mode: 'report', report: this.report, game: g };
    const id = this.hoverPlot ?? this.pinPlot;
    return { mode: 'plan', game: g, type: this.sel, plot: id ? g.plot(id) : null, map: this.mapMode, touch: touch || this.engine.touchUI };
  }

  dashView() {
    const g = this.game;
    if (this.mode === 'sim') {
      const k = clamp((this.month ?? 0) / 12, 0, 1);
      const r = this.report;
      return { game: g, year: r.year, report: r, upto: this.month ?? 0, power: r.energy * this.monthFrac(), co2: g.co2Total - r.co2 * (1 - k), qol: r.qolBefore + (r.qol - r.qolBefore) * k };
    }
    if (this.mode === 'report') return { game: g, year: this.report.year, report: this.report };
    if (this.mode === 'plan') {
      // The forecast for this year's portfolio (what is built so far).
      const power = g.plots.filter((p) => p.built && TYPES[p.built].kind === 'energy').reduce((s, p) => s + g.forecast(p.built, p.id).value, 0);
      return { game: g, power };
    }
    return { game: g };
  }

  alertView() {
    const ev = this.alertEv;
    if (!ev) return null;
    const act = t(ev.type === 'dark' && this.game.battery ? 'greenAct_darkBattery' : `greenAct_${ev.type}`);
    return { ev, secs: ev.tHit - this.simT, lead: LEAD, reacted: ev.reacted, outcome: ev.outcome, act, hint: t(this.engine.isXR ? 'greenActHintXR' : 'greenActHint') };
  }

  /** Share of the year's energy that has come in by now (the months weigh differently). */
  monthFrac() {
    const r = this.report;
    const k = clamp(this.month ?? 0, 0, 12);
    let e = 0;
    for (let i = 0; i < 12; i++) e += (r.months[i].wind + r.months[i].sun) * clamp(k - i, 0, 1);
    return r.energy > 0 ? e / r.energy : k / 12;
  }

  hudText() {
    const g = this.game;
    const name = t('greenName');
    if (this.engine.touchUI && this.mode !== 'plan') return this.mode === 'sim' ? `${this.report.label} · ${t('greenMonthNames').split(',')[Math.min(11, Math.floor(this.month ?? 0))]}` : t('greenHudReportTouch', { year: this.report.label, gwh: fmt(this.report.energy), qol: fmtInt(g.qol) });
    if (this.mode === 'sim' && this.alertEv && !this.alertEv.outcome) return `${t('greenHudSim', { name, year: this.report.label, month: t('greenMonthNames').split(',')[Math.min(11, Math.floor(this.month ?? 0))] })} · ${t('greenWarn', { event: t(`greenLive_${this.alertEv.type}`), s: Math.max(0, Math.ceil(this.alertEv.tHit - this.simT)) })}`;
    if (this.mode === 'sim') return t('greenHudSim', { name, year: this.report.label, month: t('greenMonthNames').split(',')[Math.min(11, Math.floor(this.month ?? 0))] });
    if (this.mode === 'report') return t('greenHudReport', { name, year: this.report.label, gwh: fmt(this.report.energy), qol: fmtInt(g.qol) });
    const left = Math.max(0, Math.ceil(this.planT ?? 0));
    const time = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    if (this.engine.touchUI) return t('greenHudTouch', { year: g.yearLabel, n: g.year + 1, total: YEARS, budget: money(g.budget), time });
    return t('greenHud', { name, year: g.yearLabel, n: g.year + 1, total: YEARS, budget: money(g.budget), time });
  }

  actionState() {
    if (this.mode === 'report') return { label: t(this.game.over ? 'greenFinish' : 'greenNext'), icon: 'greenNext' };
    if (this.mode === 'sim') {
      const ev = this.alertEv;
      if (ev && !ev.outcome && !ev.reacted) return { label: t(ev.type === 'dark' && this.game.battery ? 'greenActShort_darkBattery' : `greenActShort_${ev.type}`), icon: LIVE[ev.type].icon, sub: t('greenWarnConf', { n: fmtInt(ev.conf * 100) }) };
      return { label: t('greenWait'), icon: 'greenGo', disabled: true };
    }
    return { label: t('greenStart'), icon: 'greenGo', sub: this.mode === 'plan' ? money(this.game.budget) : null, disabled: this.mode !== 'plan' };
  }

  // ---------- flow ----------

  start() {
    if (!this.region) { this.waitStart = true; return; }
    this.waitStart = false;
    this.clearLayer();
    this.mode = 'plan';
    music.intensity = 0;
    this.buildUI();
    this.refreshHud = this.hud(() => this.hudText());
    this.layout(true);
    this.beginPlan();
  }

  beginPlan() {
    const g = this.game;
    g.beginYear();
    this.mode = 'plan';
    this.planT = PLAN_TIME[g.year] ?? 40;
    this.sel = null;
    this.pinPlot = null;
    this.report = null;
    this.alertEv = null;
    this.region.repairTurbines();
    this.region.setFlood(0);
    this.region.setSandbags(false);
    this.region.showMarker(null);
    this.layout();
    this.updateWishes(false);
    this.refresh();
    sfx.build();
    this.toast(t('greenYearStart', { year: g.yearLabel, budget: money(g.budget) }), null, 'xr-green-energy');
    if (g.announce) {
      this.delay(2.4, () => {
        if (this.disposed || this.mode !== 'plan') return;
        sfx.announce();
        this.toast(t(`greenEv_${g.announce}`), null, 'xr-green-social', 3.6);
      });
    }
  }

  /** The year runs: the game decides the real weather at once, the diorama plays it back. */
  runYear(timeUp = false) {
    if (this.mode !== 'plan') return;
    const g = this.game;
    const pending = [...g.pending];
    if (timeUp) this.toast(t('greenTimeUp'), null, 'xr-warning');
    else if (g.budget >= CHEAPEST && g.budget > 0.05) this.toast(t('greenLeftover', { n: money(g.budget) }), null, 'xr-panel-muted');
    this.report = g.runYear();
    this.mode = 'sim';
    this.simT = 0;
    this.month = 0;
    this.news = null;
    this.surprised = false;
    this.liveQueue = this.report.plan.map((e) => ({ ...e, tHit: secAt(e.month), reacted: false, outcome: null }));
    this.alertEv = null;
    this.vis.throttle = false;
    this.vis.blackout = false;
    this.sel = null;
    this.drag = null;
    this.region.hideGhost();
    music.intensity = 1;
    sfx.whoosh();
    // New townsfolk: families in new homes, children at new schools and daycare.
    for (const id of pending) {
      const P = this.region.plots.get(id);
      const type = g.plot(id).built;
      if (type === 'homes') for (let i = 0; i < 6; i++) this.region.addWalker(P.pos);
      else if (type === 'school') this.region.addKids(P.pos.clone().add(new THREE.Vector3(-0.01, 0, 0.005)), 7, 0.014);
      else if (type === 'kita') this.region.addKids(P.pos.clone().add(new THREE.Vector3(-0.012, 0, 0.006)), 5, 0.008);
    }
    this.refresh();
  }

  showReport() {
    this.mode = 'report';
    this.month = 12;
    music.intensity = 0;
    this.hideAlert();
    Object.assign(this.vis, { throttle: false, blackout: false });
    this.region.setFlood(0);
    sfx.point();
    const r = this.report;
    if (r.energy > 0) this.burst(this.fc.getWorldPosition(new THREE.Vector3()), 'xr-green-energy', 18);
    if (r.bet) {
      const P = this.region.plots.get(r.bet.id);
      if (r.bet.winner === 'player') { sfx.correct(); this.burst(P.group.localToWorld(new THREE.Vector3(0, 0.05, 0)), 'xr-green-up', 24); } else sfx.wrong();
    }
    this.refresh();
  }

  // ---------- live events while the year runs ----------

  startAlert(ev) {
    this.alertEv = ev;
    ev.started = true;
    if (this.toastSlot?.shared) this.dropToast();
    sfx.announce();
    this.region.showMarker(ev.type);
    this.alert.visible = true;
    this.alertPanel.redraw();
    this.popIn(this.alertPanel);
    this.refresh();
  }

  /** The player reacts to the warning (button, key, a tap on the map or on the marker). */
  react() {
    const ev = this.alertEv;
    if (this.mode !== 'sim' || !ev || ev.reacted || ev.outcome) return;
    ev.reacted = true;
    sfx.powerup();
    for (const ptr of this.engine.pointers) this.engine.haptic(ptr, 0.6, 50);
    this.region.showMarker(ev.type, true);
    this.alertPanel.redraw();
    if (ev.type === 'storm') this.vis.throttle = true;
    if (ev.type === 'flood') this.region.setSandbags(true);
    this.burst(this.region.marker.getWorldPosition(new THREE.Vector3()), 'xr-green-up', 14);
    this.refresh();
  }

  /** The moment of the event: it comes true or it was a false alarm. */
  resolveAlert(ev) {
    const out = this.game.resolveLive(ev, ev.reacted);
    const kind = ev.real ? (ev.reacted ? 'hit' : 'miss') : ev.reacted ? 'wasted' : 'calm';
    ev.outcome = { good: out.good, text: t(`greenOut_${ev.type}_${kind}`, { n: money(Math.max(0, -out.money)) }) };
    this.alertPanel.redraw();
    this.news = ev.outcome.text;
    if (ev.real && ev.type === 'storm' && !ev.reacted) { this.region.breakTurbines(2); sfx.crash(); }
    if (ev.real && ev.type === 'storm') sfx.storm();
    if (ev.real && ev.type === 'flood') this.region.setFlood(ev.reacted ? 0.007 : 0.0115);
    if (ev.real && ev.type === 'dark' && !ev.reacted) this.vis.blackout = true;
    if (out.good) { sfx.correct(); this.burst(this.alert.getWorldPosition(new THREE.Vector3()), 'xr-green-up', 16); } else sfx.wrong();
    this.region.showMarker(null);
    ev.hideAt = this.simT + 3.2;
    this.refresh();
  }

  /** After the outcome: the warning goes, the weather settles. */
  endAlert(ev) {
    this.hideAlert();
    if (ev.type === 'storm') this.vis.throttle = false;
    if (ev.type === 'flood') this.region.setFlood(0);
    if (ev.type === 'dark') this.vis.blackout = false;
    this.refresh();
  }

  hideAlert() {
    this.alertEv = null;
    if (this.alert) this.alert.visible = false;
    this.region?.showMarker(null);
    // Messages that waited for the warning.
    const next = (this.toastQueue ?? []).shift();
    if (next && this.mode !== 'over') this.toast(...next);
  }

  // ---------- citizens' wishes ----------

  /** Speech bubbles for the wishes; a wish met by a new project starts a party in its district. */
  updateWishes(announce = true) {
    const g = this.game;
    const list = g.wishes.map((w) => ({ district: w.district, level: w.level, met: g.wishMet(w), text: '' }));
    for (const w of list) {
      w.text = w.met ? t('greenWishThanks') : t(`greenWish_${g.wishes.find((x) => x.district === w.district).type}_${w.level}`);
      const was = this.wishState?.[w.district];
      if (w.met && was === false && announce) {
        this.region.celebrate(w.district);
        sfx.correct();
        this.delay(0.2, () => { if (!this.disposed) sfx.coin(); });
        this.toast(t('greenWishMet', { district: t(`greenDistrict_${w.district}`) }), null, 'xr-green-up');
        const D = this.region.bubbles.get(w.district);
        if (D) this.burst(D.getWorldPosition(new THREE.Vector3()), 'xr-green-social', 26);
      }
    }
    this.wishState = Object.fromEntries(list.map((w) => [w.district, w.met]));
    this.region.setWishes(this.mode === 'over' ? null : list);
  }

  /** The action button / Enter: run the year, react to a warning, or go on after the report. */
  action() {
    if (this.mode === 'sim') this.react();
    else if (this.mode === 'plan') this.runYear();
    else if (this.mode === 'report') {
      if (this.game.over) this.finish();
      else this.beginPlan();
    }
  }

  finish() {
    if (this.mode === 'over') return;
    const g = this.game;
    const sc = g.score();
    this.mode = 'over';
    this.sel = null;
    this.region?.showMap(null);
    this.region?.setTags(null);
    this.region?.clearSky();
    this.region?.setWishes(null);
    this.toastQueue = [];
    this.hideAlert();
    this.dropToast();
    Object.assign(this.vis, { cloud: 0, rain: 0, snowfall: 0, storm: 0, night: 0, throttle: false, blackout: false });
    this.ui.visible = false;
    this.pad?.show(false);
    this.layout(true);
    const p = (v) => `${fmtInt(v * 100)} %`;
    const learned = [
      { q: t('greenLearn2Q'), a: t('greenLearn2A', { p: p(sc.projectErr) }) },
      { q: t('greenLearn4Q'), a: t('greenLearn4A', { good: sc.liveGood, n: sc.liveTotal }) },
      g.betLog.length ? { q: t('greenLearn2bQ'), a: t('greenLearn2bA', { p: sc.betWins, a: sc.betAi }) }
        : sc.both && sc.portfolioErr < sc.projectErr ? { q: t('greenLearn3Q'), a: t('greenLearn3AMix', { p: p(sc.portfolioErr), q: p(sc.projectErr) }) } : { q: t('greenLearn3Q'), a: t('greenLearn3A') },
    ];
    this.results({
      gameKey: 'green', score: sc.total, correct: Math.round(sc.total / 50), total: 100,
      line: `${t('greenLine', { gwh: fmtInt(g.energyTotal), co2: fmtInt(g.co2Total), qol: fmtInt(g.qol), vs: t('greenVs', { p: sc.betWins, a: sc.betAi }) })}\n${t('greenParts', { e: sc.parts.energy, c: sc.parts.co2, s: sc.parts.social, m: sc.parts.mix, b: sc.parts.budget, l: sc.parts.live, w: sc.parts.bets })}`,
      learned,
      onAgain: () => this.app.startGame('green'),
    });
  }

  // ---------- choosing and building ----------

  canChoose(type) {
    const g = this.game;
    return this.mode === 'plan' && g.budget >= TYPES[type].cost - 1e-9 && g.plots.some((p) => !p.built && p.area === TYPES[type].area);
  }

  choose(type) {
    if (this.mode === 'report') return;
    if (this.mode !== 'plan') return;
    if (this.sel === type) { this.sel = null; sfx.click(); this.refresh(); return; }
    if (!this.canChoose(type)) {
      sfx.wrong();
      this.toast(this.game.budget < TYPES[type].cost ? t('greenNoMoney') : t('greenTaken'), null, 'xr-warning');
      return;
    }
    this.sel = type;
    this.pinPlot = null;
    sfx.click();
    this.refresh();
  }

  /** A pointer pressed a card: choose it; dragging it onto a plot builds there. */
  grabCard(type, p) {
    if (this.mode !== 'plan') { if (this.mode === 'report') this.action(); return; }
    if (this.sel !== type) this.choose(type);
    if (this.sel !== type) return;
    this.drag = { type, p, dir: p.ray.direction.clone(), ndc: p.ndc?.clone(), moved: false };
  }

  releaseCard(type, p) {
    const d = this.drag;
    this.drag = null;
    this.region?.hideGhost();
    if (!d || d.p !== p || !d.moved || this.mode !== 'plan') return;
    const id = this.plotUnder(p);
    if (id) this.clickPlot(id);
  }

  /** The plot a pointer points at (its box, or the nearest pad to where it hits the terrain). */
  plotUnder(p) {
    const R = this.region;
    if (!R || !p.hovered) return null;
    if (p.hovered.userData.plot) return p.hovered.userData.plot;
    if (p.hovered === R.hit && p.hit) {
      const local = R.root.worldToLocal(p.hit.point.clone());
      let best = null;
      let bd = 0.075;
      for (const P of R.plots.values()) {
        const d = Math.hypot(local.x - P.pos.x, local.z - P.pos.z);
        if (d < bd) { bd = d; best = P.id; }
      }
      return best;
    }
    return null;
  }

  wirePlots() {
    const R = this.region;
    for (const P of R.plots.values()) P.box.userData.onClick = () => this.clickPlot(P.id);
    R.hit.userData.interactive = true;
    R.hit.userData.label = 'region';
    R.hit.userData.onClick = (p) => {
      if (this.mode === 'sim') { this.react(); return; }
      const id = this.plotUnderHit(p.pressHit ?? p.hit);
      if (id) this.clickPlot(id);
    };
    R.markerHit.userData.onClick = () => this.react();
  }

  plotUnderHit(hit) {
    if (!hit) return null;
    return this.plotUnder({ hovered: this.region.hit, hit });
  }

  clickPlot(id) {
    const g = this.game;
    const P = g.plot(id);
    if (this.mode === 'sim') { this.react(); return; }
    if (!P || this.mode !== 'plan') return;
    this.pinPlot = id;
    // No project chosen and an uncertain plot: bet against the AI (more wind, less, none).
    if (!this.sel && g.canBet(id)) {
      const b = g.cycleBet(id);
      sfx.tick();
      this.toast(b ? t('greenBetSet', { plot: t(`greenPlot_${id}`), dir: t(b.dir > 0 ? 'greenBetUp' : 'greenBetDown') }) : t('greenBetOff'), b ? t('greenBetInfo') : null, 'xr-accent', 2.6);
      this.refresh();
      return;
    }
    if (P.built) {
      // Placed this year: take it back (money returns).
      if (g.pending.includes(id) && (!this.sel || this.sel === P.built)) {
        const type = P.built;
        g.undo(id);
        this.region.unbuild(id);
        this.updateWishes();
        sfx.thud();
        this.toast(t('greenUndone', { type: typeName(type) }), null, 'xr-panel-muted');
      } else sfx.tick();
      this.refresh();
      return;
    }
    if (!this.sel) { sfx.tick(); this.refresh(); return; }
    const T = TYPES[this.sel];
    if (P.area !== T.area) { sfx.wrong(); this.toast(t(`greenWrong_${T.area}`), null, 'xr-warning'); this.refresh(); return; }
    if (g.budget < T.cost - 1e-9) { sfx.wrong(); this.toast(t('greenNoMoney'), null, 'xr-warning'); return; }
    const type = this.sel;
    g.build(type, id);
    const R = this.region;
    R.build(id, type);
    sfx.build();
    this.delay(0.25, () => { if (!this.disposed) sfx.appear(); });
    const P3 = R.plots.get(id);
    this.burst(P3.group.localToWorld(new THREE.Vector3(0, 0.02, 0)), TYPES[type].token, 16);
    for (const ptr of this.engine.pointers) this.engine.haptic(ptr, 0.5, 40);
    // Keep the type while there is money and room for another one.
    if (!this.canChoose(type)) this.sel = null;
    this.updateWishes();
    this.refresh();
  }

  // ---------- keyboard ----------

  key(e) {
    if (this.mode === 'intro' || this.mode === 'over') return;
    if (KEYS[e.key]) { e.preventDefault(); this.choose(KEYS[e.key]); return; }
    if (e.key === 'Enter' || e.key === ' ' || ((e.key === 'r' || e.key === 'R') && this.mode === 'sim')) { e.preventDefault(); this.action(); return; }
    if (e.key === 'Escape') { this.sel = null; this.pinPlot = null; this.refresh(); return; }
    if ((e.key === 'Backspace' || e.key === 'z') && this.mode === 'plan' && this.game.pending.length) {
      e.preventDefault();
      this.pinPlot = null;
      this.clickPlot(this.game.pending[this.game.pending.length - 1]);
    }
  }

  // ---------- state shown on the diorama and the panels ----------

  /** Redraws panels and recomputes the map, the plot tags and the thumb buttons. */
  refresh() {
    const R = this.region;
    const g = this.game;
    if (R) {
      if (this.mode === 'plan' && this.sel) {
        const T = TYPES[this.sel];
        if (T.kind === 'energy') {
          this.mapMode = this.sel === 'wind' ? 'wind' : 'sun';
          R.showMap(this.mapMode);
        } else {
          this.mapMode = 'need';
          const need = {};
          for (const k of ['old', 'river', 'new']) need[k] = Math.min(1, g.demandForecast(k)[T.need].value / T.cap);
          R.showMap('need', need);
        }
        const free = g.plots.filter((p) => !p.built && p.area === T.area);
        const vals = free.map((p) => ({ p, f: g.forecast(this.sel, p.id) }));
        const best = vals.reduce((a, b) => (b.f.value > (a?.f.value ?? -1) ? b : a), null);
        this.bestPlot = best?.p.id ?? null;
        R.setTags(vals.map(({ p, f }) => ({
          id: p.id,
          text: T.kind === 'energy' ? fmt(f.value) : `+${fmtInt(f.value)}`,
          sub: T.kind === 'energy' ? `±${fmt((f.hi - f.lo) / 2)}` : null,
          token: T.token,
          strong: p.id === this.bestPlot,
        })));
      } else if (this.mode === 'plan') {
        // Nothing chosen: the wind map faintly (its hatching marks where the AI is unsure) and
        // the plots that take a bet against the AI.
        this.mapMode = 'wind';
        R.showMap('wind', null, 0.36);
        this.bestPlot = null;
        R.setTags(g.plots.filter((p) => g.canBet(p.id)).map((p) => {
          const b = g.bet?.id === p.id ? g.bet : null;
          return { id: p.id, text: b ? t(b.dir > 0 ? 'greenBetUp' : 'greenBetDown') : t('greenBetAsk'), sub: null, token: b ? 'xr-accent' : 'xr-panel-border', strong: !!b };
        }));
      } else if (this.mode === 'report' && this.report) {
        this.mapMode = null;
        R.showMap(null);
        const tags = this.report.projects.map((pr) => ({ id: pr.id, text: pct(pr.actual / pr.forecast - 1), sub: null, token: pr.actual >= pr.forecast ? 'xr-green-up' : 'xr-green-down' }));
        for (const s of this.report.social) tags.push({ id: s.id, text: `+${fmtInt(s.gain)}`, sub: null, token: 'xr-green-qol' });
        const b = this.report.bet;
        if (b) {
          const i = tags.findIndex((x) => x.id === b.id);
          const tag = { id: b.id, text: `${b.winner === 'player' ? '+' : ''}${b.pts}`, sub: pct(b.d), token: b.winner === 'player' ? 'xr-green-up' : 'xr-green-down', strong: true };
          if (i >= 0) tags[i] = tag; else tags.push(tag);
        }
        R.setTags(tags);
      } else {
        this.mapMode = null;
        R.showMap(null);
        R.setTags(null);
      }
    }
    this.fc?.redraw();
    this.dash?.redraw();
    this.cardTiles?.forEach((c) => c.redraw());
    this.actionBtn?.redraw();
    this.refreshHud?.();
    if (this.pad) {
      TYPE_KEYS.forEach((k, i) => {
        this.pad.disable(i, !this.canChoose(k));
        this.padEls?.[i]?.classList.toggle('mtouch__btn--primary', this.sel === k);
      });
      const a = this.actionState();
      this.pad.relabel(5, a.icon, this.mode === 'plan' ? t('greenStartShort') : a.label);
      this.pad.disable(5, !!a.disabled);
      // "Go" stands out once nothing more fits into the budget, to go on after the report, and
      // while a warning waits for an answer.
      const done = this.mode === 'plan' && !TYPE_KEYS.some((k) => this.canChoose(k));
      const alerting = this.mode === 'sim' && !a.disabled;
      this.padEls?.[5]?.classList.toggle('mtouch__btn--primary', this.mode === 'report' || done || alerting);
      this.stylePad();
    }
  }

  /**
   * Phones: the thumb buttons get an opaque face. Translucent (and dimmed, disabled) buttons over
   * the WebGL view showed ghost letters of other labels in the browser's compositing; disabled
   * buttons show muted colors instead of transparency.
   */
  stylePad() {
    for (const b of this.padEls ?? []) {
      const primary = b.classList.contains('mtouch__btn--primary');
      b.style.background = primary ? '' : 'var(--xr-green-alert-bg)';
      b.style.opacity = '1';
      b.style.color = b.disabled ? 'var(--xr-panel-muted)' : '';
      b.style.borderColor = b.disabled ? 'var(--xr-button-bg)' : '';
    }
  }

  /**
   * A short message in the message slot (above the diorama; on phones the AI panel's place or a
   * free corner). While a warning holds the same slot, the message waits.
   */
  toast(text, sub, token, secs = 2.4) {
    const slot = this.toastSlot;
    if (slot?.shared && this.alert?.visible) {
      this.toastQueue = [...(this.toastQueue ?? []).slice(-1), [text, sub, token, secs]];
      return;
    }
    this.dropToast();
    const w = slot?.w ?? 0.72;
    const p = toast(text, sub, token, w);
    p.renderOrder = 30;
    p.material.depthTest = false;
    // In a holder: the holder is placed and scaled for the slot, the panel pops in inside it.
    const holder = new THREE.Group();
    holder.add(p);
    this.add(holder);
    this.popIn(p);
    this.toastPanel = holder;
    this.placeToast();
    this.delay(secs, () => {
      if (this.toastPanel !== holder) return;
      this.tween(0.35, (k) => { p.material.opacity = 1 - k; }, { onDone: () => { if (this.toastPanel === holder) this.dropToast(); } });
    });
  }

  placeToast() {
    const h = this.toastPanel;
    const slot = this.toastSlot;
    if (!h || !slot) return;
    const ph = h.children[0].h;
    // Corner slots hang from their top edge and never grow into the thumb buttons below.
    const k = slot.maxH ? Math.min(slot.scale, slot.maxH / ph) : slot.scale;
    h.position.copy(slot.pos);
    h.scale.setScalar(k);
    if (slot.top) { h.position.x += 0.23 * (k - slot.scale); h.position.y -= (ph * k) / 2; }
  }

  dropToast() {
    const h = this.toastPanel;
    if (!h) return;
    this.toastPanel = null;
    h.removeFromParent();
    h.children[0]?.dispose();
  }

  /**
   * Phones: the AI panel steps aside for the warning (and, held upright, for a message). Only its
   * look goes: it still counts for the camera's framing, so the view does not jump.
   */
  syncSlots() {
    if (!this.fc) return;
    const show = !this.engine.touchUI || (!this.alert?.visible && !(this.portrait && this.toastPanel));
    if (this.fc.material.visible !== show) this.fc.material.visible = show;
  }

  // ---------- the year on the diorama ----------

  /** Weather on the diorama for the month m (0..12) of the running year. */
  simVis(m) {
    const name = this.report.weather;
    const wx = WEATHER[name];
    const i = Math.min(11, Math.floor(m));
    const winter = 0.5 + 0.5 * Math.cos(((m - 0.5) / 12) * Math.PI * 2);
    let wind = clamp(0.2 + 0.62 * MONTH_WIND[i] * 12 * wx.wind, 0.1, 1.6);
    let sun = clamp(0.35 + 0.62 * (MONTH_SUN[i] * 12 / 1.55) * wx.sun, 0.2, 1.3);
    let cloud = clamp(0.75 - 0.45 * sun + 0.25 * (wind - 0.6), 0.05, 1);
    let rain = 0;
    let storm = 0;
    let heat = 0;
    let night = m > 10.9 ? Math.min(0.75, (m - 10.9) * 1.4) : m < 0.6 ? 0.6 - m : 0;
    if (name === 'dull' && m > 4 && m < 8) { cloud = Math.max(cloud, 0.85); rain = Math.max(rain, 0.35); }
    if (name === 'calm' && m > 2.5 && m < 7.5) { wind = Math.min(wind, 0.22); cloud = Math.min(cloud, 0.15); }
    if (name === 'sunny' && m > 4.5 && m < 8.5) cloud = Math.min(cloud, 0.1);
    // The live events: signs while the warning runs, the full event if it comes true.
    const lead = monthAt(LEAD);
    for (const e of this.liveQueue ?? []) {
      let k = 0;
      if (m < e.month) k = 0.45 * clamp((m - (e.month - lead)) / lead, 0, 1);
      else if (e.real) k = Math.max(0, 1 - Math.abs(m - e.month - 0.4) / 1.1);
      else k = 0.45 * Math.max(0, 1 - (m - e.month) / 0.5);
      if (k <= 0) continue;
      if (e.type === 'storm') { wind = Math.max(wind, 0.6 + 0.95 * k); cloud = Math.max(cloud, 0.4 + 0.6 * k); storm = Math.max(storm, k); rain = Math.max(rain, k); }
      if (e.type === 'heat') { sun = Math.max(sun, 1 + 0.3 * k); cloud *= 1 - k; heat = Math.max(heat, k); }
      if (e.type === 'dark') { wind = Math.min(wind, 1 - 0.9 * k); sun *= 1 - 0.7 * k; cloud = Math.max(cloud, k); night = Math.max(night, 0.55 * k); }
      if (e.type === 'flood') { rain = Math.max(rain, k); cloud = Math.max(cloud, k); }
    }
    const snowfall = winter > 0.8 ? (winter - 0.8) * 4.5 : 0;
    return { wind, sun, cloud, rain, snowfall, snow: clamp((winter - 0.35) * 1.6, 0, 0.95), night, storm, heat, month: m, cutout: false };
  }

  updateSim(dt) {
    this.simT += dt;
    const m = monthAt(this.simT);
    const prevMonth = Math.floor(this.month ?? 0);
    this.month = m;
    const target = this.simVis(m);
    if (!this.engine.isXR) target.cloud *= 0.6; // the browser's tilted view: fewer clouds over the map
    for (const k of Object.keys(target)) {
      if (typeof target[k] === 'number' && k !== 'month') this.vis[k] = (this.vis[k] ?? 0) + (target[k] - (this.vis[k] ?? 0)) * Math.min(1, dt * 3);
      else this.vis[k] = target[k];
    }
    // Warnings: one at a time, LEAD seconds ahead; the event happens at its month.
    for (const ev of this.liveQueue) {
      if (!ev.started && !this.alertEv && this.simT >= ev.tHit - LEAD) this.startAlert(ev);
      if (ev.started && !ev.outcome && this.simT >= ev.tHit) this.resolveAlert(ev);
      if (ev.outcome && this.alertEv === ev && this.simT >= ev.hideAt) this.endAlert(ev);
    }
    const r = this.report;
    if (!this.surprised && m >= SURPRISE[r.weather]) {
      this.surprised = true;
      if (r.weather !== 'normal') {
        this.news = this.news ?? t(`greenWx_${r.weather}`);
        // Only as a toast when no warning is on the screen.
        if (!this.alertEv) { sfx.announce(); this.toast(t(`greenWx_${r.weather}`), null, r.weather === 'calm' || r.weather === 'dull' ? 'xr-green-down' : 'xr-green-up', 3.2); }
      }
    }
    if (Math.floor(m) !== prevMonth) {
      sfx.tick();
      this.fc.redraw();
      this.dash.redraw();
    }
    if (this.alertEv && Math.floor(this.simT * 4) !== this.alertTick) {
      this.alertTick = Math.floor(this.simT * 4);
      this.alertPanel.redraw();
      this.refreshHud?.();
      this.actionBtn?.redraw();
    }
    if (this.simT >= SIM_TIME && !this.alertEv) this.showReport();
  }

  // ---------- frame loop ----------

  update(dt) {
    this.time += dt;
    const R = this.region;
    if (this.waitStart && R) this.start();
    this.layout();
    if (this.engine.touchUI && !this.portrait && this.fcShape === 'mini' && Math.floor(this.time * 2) !== this.frameTick) {
      this.frameTick = Math.floor(this.time * 2);
      this.landFrame();
    }
    if (!R) return;
    if (this.mode === 'plan' || this.mode === 'report' || this.mode === 'intro' || this.mode === 'over') {
      if (this.mode === 'plan') {
        this.planT -= dt;
        if (this.planT <= 0) this.runYear(true);
        if (Math.floor(this.time * 2) !== this.hudTick) { this.hudTick = Math.floor(this.time * 2); this.refreshHud?.(); }
      }
      // Calm planning weather (a winter morning at Christmas).
      const calm = { wind: 0.55, sun: 1, cloud: this.engine.isXR && this.mode !== 'over' ? 0.3 : 0, rain: 0, snowfall: CHRISTMAS && this.mode !== 'over' ? 0.22 : 0, snow: 0.65, night: 0, storm: 0, heat: 0 };
      for (const k of Object.keys(calm)) this.vis[k] += (calm[k] - this.vis[k]) * Math.min(1, dt * 1.5);
      this.vis.month += (2.4 - this.vis.month) * Math.min(1, dt);
      this.vis.cutout = false;
    } else if (this.mode === 'sim') this.updateSim(dt);
    R.update(dt, this.vis);
    this.syncSlots();
    this.pad?.show(this.mode === 'plan' || this.mode === 'report' || this.mode === 'sim');
    this.updatePointers();
  }

  /** Hover over plots (all pointers), dragging a card, and the plots' highlight. */
  updatePointers() {
    const R = this.region;
    const e = this.engine;
    let hover = null;
    for (const p of e.pointers) {
      if (!p.active) continue;
      const id = this.plotUnder(p);
      if (id && !hover) hover = id;
    }
    // Dragging a card: once the pointer leaves the card, a ghost follows it onto the plots.
    const d = this.drag;
    if (d) {
      if (!d.p.held) { this.drag = null; R.hideGhost(); }
      else {
        if (!d.moved) {
          const turned = d.p.ray.direction.angleTo(d.dir) > 0.06;
          const slid = d.ndc && d.p.ndc && d.ndc.distanceTo(d.p.ndc) > 0.05;
          d.moved = turned || slid;
        }
        const id = this.plotUnder(d.p);
        const gh = R.ghost(d.type);
        if (d.moved && (id || d.p.hit)) {
          gh.visible = true;
          const P = id ? R.plots.get(id) : null;
          if (P && !this.game.plot(id).built && this.game.plot(id).area === TYPES[d.type].area) gh.position.copy(P.pos);
          else gh.position.copy(R.root.worldToLocal(d.p.hit.point.clone()));
          gh.position.y += 0.004 + 0.003 * Math.sin(this.time * 8);
        } else gh.visible = false;
        if (id) hover = id;
      }
    }
    if (hover !== this.hoverPlot) {
      this.hoverPlot = hover;
      if (hover && this.mode === 'plan') sfx.tick();
      this.fc?.redraw();
    }
    // Plot highlights.
    const g = this.game;
    const T = this.sel ? TYPES[this.sel] : null;
    for (const P of R.plots.values()) {
      const gp = g.plot(P.id);
      let st = 'idle';
      if (gp.built) st = 'built';
      else if (this.mode !== 'plan') st = 'idle';
      else if (P.id === this.hoverPlot || (P.id === this.pinPlot && e.touchUI)) st = T && gp.area !== T.area ? 'off' : 'hover';
      else if (T) st = gp.area === T.area ? (P.id === this.bestPlot ? 'best' : 'ok') : 'off';
      R.setPlotState(P.id, st);
    }
  }

  dispose() {
    this.mode = 'over';
    window.removeEventListener('keydown', this.onKey);
    this.region?.dispose(this.engine.renderer);
    super.dispose();
  }
}
