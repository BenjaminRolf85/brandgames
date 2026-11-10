// "Grünes Portfolio" (key 'green'): a region diorama on the table (AR) or in front of you. Every
// round is a year with a budget: finance wind turbines, solar parks, homes, schools and daycare
// centres by placing them on free plots. An AI map forecasts the wind speed or sun hours of every
// plot from weather data (a heat map with hatching where it is unsure), the yield of a project
// with its 80 % range, and the demand of the town's districts. Then the year runs: weather,
// spinning rotors, glinting panels, a growing town, and the real yields with weather surprises
// (a calm, a storm, a sunny summer). Five years, then the score: green power, CO2, quality of
// life, a good mix and the budget used (at most 5000).
// Controls: headset: point and pull the trigger (or pinch) on a project card and then a plot, or
// grab a card and drop it on a plot. Desktop: click (keys 1 to 5, Enter, Esc, Backspace). Phones:
// big thumb buttons for the projects, then tap a plot.
import * as THREE from 'three';
import { BaseScene } from '../scene.js';
import { placeOnArc } from '../ui3d.js';
import { num } from '../tokens.js';
import { t } from '../i18n.js';
import { sfx } from '../sfx.js';
import { music } from '../music.js';
import { CHRISTMAS } from '../christmas.js';
import { makeEnvironment } from '../robot-visuals.js';
import '../green-text.js';
import { GreenGame, TYPES, TYPE_KEYS, YEARS, WEATHER, MONTH_WIND, MONTH_SUN, CHEAPEST } from '../green-sim.js';
import { Region, loadGreen } from '../green-visuals.js';
import { forecastPanel, dashPanel, projectCard, actionTile, toast, fmt, fmtInt, money, pct, typeName } from '../green-ui.js';

const PLAN_TIME = [50, 40, 40, 40, 40]; // seconds to plan each year
const SIM_TIME = 10; // seconds the year takes on the diorama
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
    this.vis = { wind: 0.55, sun: 1, cloud: 0.35, rain: 0, snowfall: CHRISTMAS ? 0.25 : 0, snow: 0.65, night: 0, storm: 0, month: 2.4, cutout: false };
    const r = this.engine.renderer;
    this.envTarget = makeEnvironment(r);
    this.prevEnvironment = this.engine.scene.environment;
    this.engine.scene.environment = this.envTarget.texture;
    this.board = new THREE.Group(); // the diorama's place (table in the headset, tilted easel in the browser)
    this.group.add(this.board);
    this.ui = new THREE.Group(); // panels and cards, kept between the steps
    this.group.add(this.ui);
    this.onKey = (e) => this.key(e);
    window.addEventListener('keydown', this.onKey);
    this.onUpdate((dt) => this.update(dt));
    loadGreen().then((gltf) => {
      if (this.disposed) return;
      this.region = new Region(gltf, r);
      this.board.add(this.region.root);
      this.wirePlots();
      this.layout(true);
    }).catch((e) => console.error('green.glb not loaded', e));
    const hint = this.engine.isXR ? 'greenIntroXR' : this.engine.touchUI ? 'greenIntroTouch' : 'greenIntroScreen';
    this.intro(t('greenName'), `${t('greenIntro')} ${t(hint)}`, () => this.start());
    this.layout(true);
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
    if (xr) {
      board.position.set(0, eye - num('xr-green-table-drop') - (over ? 0.16 : 0), num('xr-green-table-z'));
      board.rotation.set(0, 0, 0);
      board.scale.setScalar(over ? 0.8 : 1);
    } else if (intro) {
      board.position.set(0, eye - (touch && portrait ? 0.62 : 0.5), -1.4);
      board.rotation.set(tilt, 0, 0);
      board.scale.setScalar(touch && portrait ? 0.9 : 0.85);
    } else if (over) {
      board.position.set(0, eye - 0.95, -2.3);
      board.rotation.set(tilt, 0, 0);
      board.scale.setScalar(1.2);
    } else if (!touch) {
      board.position.set(0, eye - 0.06, -1.4);
      board.rotation.set(tilt, 0, 0);
      board.scale.setScalar(1);
    } else if (portrait) {
      board.position.set(0, eye - 0.3, -1.4);
      board.rotation.set(tilt, 0, 0);
      board.scale.setScalar(1);
    } else {
      board.position.set(0.3, eye - 0.06, -1.4);
      board.rotation.set(tilt, 0, 0);
      board.scale.setScalar(1);
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
    const shape = touch && portrait ? 'wide' : 'tall';
    if (this.fcShape !== shape) {
      this.fcShape = shape;
      this.fc.removeFromParent();
      this.fc.dispose();
      this.fc = shape === 'wide' ? forecastPanel(1.04, 0.4, () => this.fcView(true)) : forecastPanel(pw, 0.64, () => this.fcView(false));
      this.ui.add(this.fc);
    }
    this.fc.rotation.set(0, 0, 0);
    this.fc.scale.setScalar(1);
    this.dash.visible = !touch;
    this.cards.visible = !touch;
    this.spacer.visible = touch && !portrait;
    if (xr) {
      placeOnArc(this.fc, -0.74, eye - 0.08, 1.0);
      placeOnArc(this.dash, 0.74, eye - 0.08, 1.0);
      // The cards lie like a tray at the front edge of the table, tilted towards you.
      this.cards.position.set(0, eye - num('xr-green-table-drop') - 0.03, num('xr-green-table-z') + 0.47);
      this.cards.rotation.set(-0.95, 0, 0);
    } else if (!touch) {
      this.fc.position.set(-0.86, eye + 0.02, -1.4);
      this.dash.position.set(0.86, eye + 0.02, -1.4);
      this.cards.position.set(0, eye - 0.54, -1.4);
      this.cards.rotation.set(0, 0, 0);
    } else if (portrait) {
      this.fc.position.set(0, eye + 0.24, -1.4);
    } else {
      this.fc.scale.setScalar(1.08);
      this.fc.position.set(-0.6, eye + 0.06, -1.4);
      this.spacer.position.set(0.3, eye - 0.52, -1.4);
    }
    this.toastAt = xr ? new THREE.Vector3(0, eye + 0.06, num('xr-green-table-z') - 0.2)
      : touch && portrait ? new THREE.Vector3(0, eye - 0.12, -1.25)
        : touch ? new THREE.Vector3(0.3, eye + 0.12, -1.25) : new THREE.Vector3(0, eye + 0.36, -1.3);
  }

  buildUI() {
    const pw = num('xr-green-panel-w');
    this.fc = forecastPanel(pw, 0.64, () => this.fcView(false));
    this.fcShape = 'tall';
    this.dash = dashPanel(pw, 0.64, () => this.dashView());
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
    // Phones in landscape: keeps the lower corners (thumb buttons) free in the camera's framing.
    this.spacer = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.28, 0.01), new THREE.MeshBasicMaterial({ visible: false }));
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
    if (this.mode === 'sim') return { mode: 'sim', report: this.report, month: this.month ?? 0, news: this.news };
    if (this.mode === 'report') return { mode: 'report', report: this.report, game: g };
    const id = this.hoverPlot ?? this.pinPlot;
    return { mode: 'plan', game: g, type: this.sel, plot: id ? g.plot(id) : null, map: this.mapMode, touch: touch || this.engine.touchUI };
  }

  dashView() {
    const g = this.game;
    if (this.mode === 'sim') {
      const k = clamp((this.month ?? 0) / 12, 0, 1);
      const r = this.report;
      return { game: g, power: r.energy * this.monthFrac(), co2: g.co2Total - r.co2 * (1 - k), qol: r.qolBefore + (r.qol - r.qolBefore) * k };
    }
    if (this.mode === 'plan') {
      // The forecast for this year's portfolio (what is built so far).
      const power = g.plots.filter((p) => p.built && TYPES[p.built].kind === 'energy').reduce((s, p) => s + g.forecast(p.built, p.id).value, 0);
      return { game: g, power };
    }
    return { game: g };
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
    if (this.mode === 'sim') return t('greenHudSim', { name, year: this.report.label, month: t('greenMonthNames').split(',')[Math.min(11, Math.floor(this.month ?? 0))] });
    if (this.mode === 'report') return t('greenHudReport', { name, year: this.report.label, gwh: fmt(this.report.energy), qol: fmtInt(g.qol) });
    const left = Math.max(0, Math.ceil(this.planT ?? 0));
    return t('greenHud', { name, year: g.yearLabel, n: g.year + 1, total: YEARS, budget: money(g.budget), time: `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` });
  }

  actionState() {
    if (this.mode === 'report') return { label: t(this.game.over ? 'greenFinish' : 'greenNext'), icon: 'greenNext' };
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
    this.layout();
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
    this.stormed = false;
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
    sfx.point();
    const r = this.report;
    if (r.energy > 0) this.burst(this.fc.getWorldPosition(new THREE.Vector3()), 'xr-green-energy', 18);
    this.refresh();
  }

  /** The action button / Enter: run the year, or go on after the report. */
  action() {
    if (this.mode === 'plan') this.runYear();
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
    this.ui.visible = false;
    this.pad?.show(false);
    this.layout(true);
    const p = (v) => `${fmtInt(v * 100)} %`;
    const learned = [
      { q: t('greenLearn1Q'), a: t('greenLearn1A') },
      { q: t('greenLearn2Q'), a: t('greenLearn2A', { p: p(sc.projectErr) }) },
      sc.both && sc.portfolioErr < sc.projectErr ? { q: t('greenLearn3Q'), a: t('greenLearn3AMix', { p: p(sc.portfolioErr), q: p(sc.projectErr) }) } : { q: t('greenLearn3Q'), a: t('greenLearn3A') },
    ];
    this.results({
      gameKey: 'green', score: sc.total, correct: Math.round(sc.total / 50), total: 100,
      line: `${t('greenLine', { gwh: fmtInt(g.energyTotal), co2: fmtInt(g.co2Total), qol: fmtInt(g.qol) })} · ${t('greenParts', { e: sc.parts.energy, c: sc.parts.co2, s: sc.parts.social, m: sc.parts.mix, b: sc.parts.budget })}`,
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
      const id = this.plotUnderHit(p.pressHit ?? p.hit);
      if (id) this.clickPlot(id);
    };
  }

  plotUnderHit(hit) {
    if (!hit) return null;
    return this.plotUnder({ hovered: this.region.hit, hit });
  }

  clickPlot(id) {
    const g = this.game;
    const P = g.plot(id);
    if (!P || this.mode !== 'plan') return;
    this.pinPlot = id;
    if (P.built) {
      // Placed this year: take it back (money returns).
      if (g.pending.includes(id)) {
        const type = P.built;
        g.undo(id);
        this.region.unbuild(id);
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
    this.refresh();
  }

  // ---------- keyboard ----------

  key(e) {
    if (this.mode === 'intro' || this.mode === 'over') return;
    if (KEYS[e.key]) { e.preventDefault(); this.choose(KEYS[e.key]); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.action(); return; }
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
          sub: T.kind === 'energy' ? 'GWh' : null,
          token: T.token,
          strong: p.id === this.bestPlot,
        })));
      } else if (this.mode === 'report' && this.report) {
        this.mapMode = null;
        R.showMap(null);
        const tags = this.report.projects.map((pr) => ({ id: pr.id, text: pct(pr.actual / pr.forecast - 1), sub: null, token: pr.actual >= pr.forecast ? 'xr-green-up' : 'xr-green-down' }));
        for (const s of this.report.social) tags.push({ id: s.id, text: `+${fmtInt(s.gain)}`, sub: null, token: 'xr-green-qol' });
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
      this.pad.relabel(5, a.icon, this.mode === 'report' ? a.label : t('greenStartShort'));
      this.pad.disable(5, !!a.disabled);
      this.padEls?.[5]?.classList.toggle('mtouch__btn--primary', this.mode === 'report' || (this.mode === 'plan' && !this.sel));
    }
  }

  /** A short message over the diorama. */
  toast(text, sub, token, secs = 2.4) {
    this.toastPanel?.removeFromParent();
    const w = this.engine.touchUI && this.portrait ? 0.95 : 0.72;
    const p = toast(text, sub, token, w);
    const at = this.toastAt ?? new THREE.Vector3(0, this.eye + 0.36, -1.3);
    p.position.copy(at);
    p.renderOrder = 30;
    p.material.depthTest = false;
    this.add(p);
    this.popIn(p);
    this.toastPanel = p;
    this.delay(secs, () => {
      if (this.toastPanel !== p) return;
      this.tween(0.35, (k) => { p.material.opacity = 1 - k; }, { onDone: () => { if (this.toastPanel === p) { p.removeFromParent(); p.dispose(); this.toastPanel = null; } } });
    });
  }

  // ---------- the year on the diorama ----------

  /** Weather on the diorama for the month m (0..12) of the running year. */
  simVis(m) {
    const name = this.report.weather;
    const wx = WEATHER[name];
    const i = Math.min(11, Math.floor(m));
    const winter = 0.5 + 0.5 * Math.cos(((m - 0.5) / 12) * Math.PI * 2);
    let wind = clamp(0.2 + 0.62 * MONTH_WIND[i] * 12 * wx.wind, 0.1, 1.6);
    const sun = clamp(0.35 + 0.62 * (MONTH_SUN[i] * 12 / 1.55) * wx.sun, 0.2, 1.3);
    let cloud = clamp(0.75 - 0.45 * sun + 0.25 * (wind - 0.6), 0.05, 1);
    let rain = 0;
    let storm = 0;
    let cutout = false;
    if (wx.storm && m > 8.6 && m < 10.6) {
      storm = Math.sin(((m - 8.6) / 2) * Math.PI);
      wind = Math.max(wind, 1.1 + 0.5 * storm);
      cloud = Math.max(cloud, 0.6 + 0.4 * storm);
      rain = storm;
      cutout = m > 9.5 && m < 9.85;
    }
    if (name === 'dull' && m > 4 && m < 8) { cloud = Math.max(cloud, 0.85); rain = Math.max(rain, 0.35); }
    if (name === 'calm' && m > 2.5 && m < 7.5) { wind = Math.min(wind, 0.22); cloud = Math.min(cloud, 0.15); }
    if (name === 'sunny' && m > 4.5 && m < 8.5) cloud = Math.min(cloud, 0.1);
    const snowfall = winter > 0.8 ? (winter - 0.8) * 4.5 : 0;
    const night = m > 10.9 ? Math.min(0.75, (m - 10.9) * 1.4) : m < 0.6 ? 0.6 - m : 0;
    return { wind, sun, cloud, rain, snowfall, snow: clamp((winter - 0.35) * 1.6, 0, 0.95), night, storm, month: m, cutout };
  }

  updateSim(dt) {
    this.simT += dt;
    const m = clamp((this.simT / (SIM_TIME - 1)) * 12, 0, 12);
    const prevMonth = Math.floor(this.month ?? 0);
    this.month = m;
    const target = this.simVis(m);
    for (const k of Object.keys(target)) {
      if (typeof target[k] === 'number' && k !== 'month') this.vis[k] += (target[k] - this.vis[k]) * Math.min(1, dt * 3);
      else this.vis[k] = target[k];
    }
    const r = this.report;
    if (!this.surprised && m >= SURPRISE[r.weather]) {
      this.surprised = true;
      this.news = t(`greenWx_${r.weather}`);
      if (r.weather !== 'normal') { sfx.announce(); this.toast(this.news, null, r.weather === 'calm' || r.weather === 'dull' ? 'xr-green-down' : 'xr-green-up', 3.2); }
    }
    if (WEATHER[r.weather].storm && !this.stormed && m > 9.4) {
      this.stormed = true;
      sfx.storm();
    }
    if (Math.floor(m) !== prevMonth) {
      sfx.tick();
      this.fc.redraw();
      this.dash.redraw();
      this.refreshHud?.();
    }
    if (this.simT >= SIM_TIME) this.showReport();
  }

  // ---------- frame loop ----------

  update(dt) {
    this.time += dt;
    const R = this.region;
    if (this.waitStart && R) this.start();
    this.layout();
    if (!R) return;
    if (this.mode === 'plan') {
      this.planT -= dt;
      if (this.planT <= 0) this.runYear(true);
      if (Math.floor(this.time * 2) !== this.hudTick) { this.hudTick = Math.floor(this.time * 2); this.refreshHud?.(); }
      // Calm planning weather (a winter morning at Christmas).
      const calm = { wind: 0.55, sun: 1, cloud: 0.3, rain: 0, snowfall: CHRISTMAS ? 0.22 : 0, snow: 0.65, night: 0, storm: 0 };
      for (const k of Object.keys(calm)) this.vis[k] += (calm[k] - this.vis[k]) * Math.min(1, dt * 1.5);
      this.vis.month += (2.4 - this.vis.month) * Math.min(1, dt);
      this.vis.cutout = false;
    } else if (this.mode === 'sim') this.updateSim(dt);
    R.update(dt, this.vis);
    this.pad?.show(this.mode === 'plan' || this.mode === 'report');
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
    this.engine.scene.environment = this.prevEnvironment ?? null;
    this.envTarget?.dispose();
    super.dispose();
  }
}
