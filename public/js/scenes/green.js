// "Grünes Portfolio" (key 'green'): a region diorama on the table (AR) or in front of you. Every
// round is a year with a budget: finance wind turbines, solar parks, homes, schools and daycare
// centres by placing them on free plots. An AI map forecasts the wind speed or sun hours of every
// plot from weather data (a heat map with hatching where it is unsure), the yield of a project
// with its usual range, and the demand of the town's districts. Then the year runs: weather,
// spinning rotors, glinting panels, a growing town, and the real yields with weather surprises
// (a calm, a storm, a sunny summer). While the year runs the AI warns of live events (storm,
// heat peak, dark lull, flood) with a calibrated confidence: react (it has a price) or wait (it
// has a risk); a high number usually comes true, a low one is usually a false alarm. Citizens
// voice wishes over their districts (louder when ignored, a party when met), and from the second
// year on the player may bet against the AI's wind forecast on the uncertain hills.
// Four years, then the score: green power, CO2, quality of life, mix, budget, warnings judged
// right and bets won (at most 5000), a rating in three steps and one tip for the next round.
//
// The browser is a product of its own: a short intro with the controls, a coach that names the
// next step in the first year, the whole round on the keyboard alone (1 to 5, arrow keys, space
// bar, Enter, J/N) or with the mouse alone, thumb buttons on phones. Relaxed mode (assist.js):
// no time limit, the year waits for the answer to a warning, the AI's tip on every warning,
// extra budget. Calm motion: no pulsing, trembling or bobbing, fewer particles.
// Controls: headset: point and pull the trigger (or pinch) on a project card and then a plot, or
// grab a card and drop it on a plot. Desktop: click, or the keys above. Phones: big thumb
// buttons for the projects, then tap a plot.
import * as THREE from 'three';
import { BaseScene } from '../scene.js';
import { placeOnArc, Button, textPanel } from '../ui3d.js';
import { num, color } from '../tokens.js';
import { t, L } from '../i18n.js';
import { SPONSOR } from '../content.js';
import { sfx } from '../sfx.js';
import { music } from '../music.js';
import { CHRISTMAS } from '../christmas.js';
import { sceneLook, gfxTier } from '../gfx.js';
import { assist } from '../assist.js';
import '../green-text.js';
import { GreenGame, TYPES, TYPE_KEYS, YEARS, WEATHER, MONTH_WIND, MONTH_SUN, CHEAPEST, LIVE, LIVE_STAKES } from '../green-sim.js';
import { Region, loadGreen } from '../green-visuals.js';
import { forecastPanel, dashPanel, projectCard, actionTile, alertPanel, toast, fmt, fmtInt, money, pct, typeName, plotName } from '../green-ui.js';

const PLAN_TIME = [75, 50, 50, 50]; // seconds to plan each year (relaxed mode: no limit)
const SIM_TIME = 24; // seconds the year takes on the diorama (with two live events)
const LEAD = 8; // seconds the AI warns ahead (a decision fast-forwards to the event)
const EASY_BONUS = 2; // relaxed mode: extra budget in the first year (million euros)
const RANKS = [2400, 3300]; // points for the second and the third step of the rating
const monthAt = (sec) => clamp((sec / (SIM_TIME - 1)) * 12, 0, 12);
const secAt = (month) => (month / 12) * (SIM_TIME - 1);
const KEYS = { 1: 'wind', 2: 'solar', 3: 'homes', 4: 'school', 5: 'kita' };
const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1], a: [-1, 0], d: [1, 0], w: [0, 1], s: [0, -1] };
// When the year's weather surprise shows (month), per weather.
const SURPRISE = { normal: 7, calm: 4.3, stormy: 9.4, sunny: 6.2, windy: 1.2, dull: 5.6 };
const clamp = THREE.MathUtils.clamp;
let again = false; // "Nochmal": the next round starts at once, without the intro

export class GreenScene extends BaseScene {
  constructor(app) {
    super(app);
    this.gameKey = 'green';
    this.mode = 'intro';
    this.time = 0;
    this.sel = null; // the chosen project type
    this.hoverPlot = null; // plot under a pointer (or marked with the keyboard)
    this.pinPlot = null; // last tapped plot (phones)
    this.cursor = null; // the plot marked with the keyboard (number keys, arrow keys)
    this.drag = null; // a card held by a pointer (grab and drop)
    this.game = new GreenGame();
    this.vis = { wind: 0.55, sun: 1, cloud: 0.35, rain: 0, snowfall: CHRISTMAS ? 0.25 : 0, snow: 0.65, night: 0, storm: 0, heat: 0, month: 2.4, cutout: false, throttle: false, blackout: false, calm: assist.reducedMotion };
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
    const yes = t('greenCtlWarn');
    this.setControls({
      desktop: [[t('greenCtlMouse'), t('greenCtlMouseDo')], [t('greenCtlKeys'), t('greenCtlKeysDo')], [t('greenCtlEnter'), t('greenCtlEnterDo')], [yes, t('greenCtlWarnDo')]],
      touch: [[t('greenCtlTapCard'), t('greenCtlTapCardDo')], [t('greenCtlTapPlot'), t('greenCtlTapPlotDo')], [t('greenCtlGo'), t('greenCtlGoDo')], [t('greenCtlWarnAny'), t('greenCtlWarnAnyDo')]],
      xr: [[t('greenCtlPoint'), t('greenCtlPointDo')], [t('greenCtlGrab'), t('greenCtlGrabDo')], [t('greenCtlBig'), t('greenCtlBigDo')], [t('greenCtlWarnAny'), t('greenCtlWarnAnyDo')]],
    });
    if (again) {
      // "Nochmal": straight into the next round.
      again = false;
      this.startMusic(-1);
      this.layout(true);
      this.start();
    } else {
      if (this.engine.touchUI && !this.portrait) this.wideIntro();
      else this.intro(t('greenName'), t('greenIntro'), () => this.start());
      this.layout(true);
    }
  }

  /**
   * The intro for a phone held sideways: the same content as BaseScene.intro(), on a wide and
   * short panel that fills the low screen (the browser camera keeps its distance, so the panel
   * itself is enlarged), with large letters. The diorama waits behind "start".
   */
  wideIntro() {
    this.clearLayer();
    this.introWide = true;
    const k = 1.5;
    const pivot = new THREE.Vector3(0, this.eye + 0.05, -this.dist);
    this.layer.scale.setScalar(k);
    this.layer.position.copy(pivot).multiplyScalar(1 - k);
    const panel = this.add(textPanel(1.9, 0.3, [
      { text: t('greenName'), size: 'xr-text-title', weight: 'black', gap: 0.025 },
      { text: t('greenIntro'), size: 'xr-text-md', color: color('xr-panel-muted'), gap: 0.03 },
      ...this.controlsBlocks(),
      { text: L(SPONSOR.presentedBy), size: 'xr-text-sm', weight: 'bold', color: color('xr-warning') },
    ]));
    panel.position.set(0, this.eye + 0.36 - panel.h / 2, -this.dist);
    const go = this.add(new Button(0.5, 0.14, { label: t('start'), variant: 'primary', labelSize: 'xr-text-lg', onClick: () => { this.startMusic(-1); this.start(); } }));
    go.position.set(0, panel.position.y - panel.h / 2 - 0.04 - go.h / 2, -this.dist);
    this.popIn(panel);
    this.popIn(go, 0.1);
    this.prepareMusic();
  }

  /** '' on a desktop, 'Touch' on a phone, 'XR' in the headset: picks the text for the device. */
  get dev() { return this.engine.isXR ? 'XR' : this.engine.touchUI ? 'Touch' : ''; }

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
    // Behind the results only in the headset (on the table); not behind the wide intro of a
    // phone held sideways.
    board.visible = (xr || !over) && !(intro && this.introWide && touch && !portrait);
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
      // Below the intro panel and its start button (the panel also lists the controls).
      board.position.set(0, eye - (touch && portrait ? 1.16 : 1.12), -1.6);
      board.rotation.set(tilt, 0, 0);
      board.scale.setScalar(touch && portrait ? 1 : 0.95);
    } else if (over) {
      board.position.set(0, eye - 0.95, -2.3);
      board.rotation.set(tilt, 0, 0);
      board.scale.setScalar(1.2);
    } else if (!touch) {
      // A little below the middle: the warning and the messages have their slot above the hills.
      board.position.set(0, eye - 0.19, -1.4);
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
      this.alertPanel = ashape === 'card' ? alertPanel(0.46, 0.5, () => this.alertView(), 'card') : alertPanel(0.9, 0.24, () => this.alertView());
      this.alertPanel.renderOrder = 31;
      this.alertPanel.material.depthTest = false;
      this.alert.add(this.alertPanel);
      if (was) { was.removeFromParent(); was.dispose(); }
    }
    // The cards: the headset's tray keeps the small cards, the desktop gets larger ones.
    if (this.cardsXR !== xr) this.buildCards(xr);
    this.fc.rotation.set(0, 0, 0);
    this.fc.scale.setScalar(1);
    this.dash.scale.setScalar(1);
    this.cards.scale.setScalar(xr ? 0.86 : 1);
    this.dash.visible = !touch;
    this.cards.visible = !touch;
    // Phones: the 3D card row and the dashboard are not rendered at all (thumb buttons and the
    // status bar take their place).
    if (touch) { this.cards.removeFromParent(); this.dash.removeFromParent(); } else if (!this.cards.parent || !this.dash.parent) this.ui.add(this.cards, this.dash);
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
      this.cards.position.set(0, eye - 0.87, -1.4);
      this.cards.rotation.set(0, 0, 0);
    } else if (portrait) {
      // As wide as the upright screen allows: larger letters.
      this.fc.scale.setScalar(1.2);
      this.fc.position.set(0, eye + 0.49, -1.4);
    } else this.landFrame();
    // One slot above the diorama for the warning and the messages (a message waits while a
    // warning is up). Phones held upright: that slot is the AI panel's place (it steps aside).
    this.alert.rotation.set(0, 0, 0);
    if (xr) {
      this.alert.position.set(0, eye + 0.04, num('xr-green-table-z') - 0.16);
      this.alert.scale.setScalar(0.86); // fits between the two side panels
      this.toastSlot = { pos: this.alert.position.clone(), scale: 1, w: 0.72, shared: true };
    } else if (!touch) {
      this.alert.position.set(0, eye + 0.33, -1.25);
      this.alert.scale.setScalar(1.0);
      this.toastSlot = { pos: new THREE.Vector3(0, eye + 0.315, -1.25), scale: 1.12, w: 0.72, shared: true };
    } else if (portrait) {
      this.alert.position.set(0, eye + 0.49, -1.3);
      this.alert.scale.setScalar((1.04 / 0.9) * 1.2);
      this.toastSlot = { pos: this.alert.position.clone(), scale: 1.2, w: 1.04, shared: true };
    }
    this.placeToast();
    this.syncTray();
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
    this.buildCards(this.engine.isXR);
    // The AI's live warnings while the year runs.
    // (In a holder: the holder is placed and scaled per screen, the panel pops in inside it.)
    this.alert = new THREE.Group(); // the warning panel itself is made per screen (placePanels)
    this.alert.visible = false;
    this.ui.add(this.alert);
    // Phones in landscape: keeps the lower corners (thumb buttons) free in the camera's framing.
    this.spacer = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.001), new THREE.MeshBasicMaterial({ visible: false }));
    this.ui.add(this.spacer);
    // Phones: big thumb buttons (projects left and right, the action bottom right). While the
    // year runs, the last two answer the AI's warning: wait, or react.
    const groups = { wind: 'left', solar: 'left', homes: 'left', school: 'right', kita: 'right' };
    this.pad = this.touchButtons([
      ...TYPE_KEYS.map((k, i) => ({ icon: TYPES[k].icon, label: this.padLabel(k), onPress: () => (this.mode === 'sim' ? (i === 4 ? this.wait() : null) : this.choose(k)), group: groups[k] })),
      { icon: 'greenGo', label: t('greenStartShort'), onPress: () => (this.mode === 'sim' ? this.react() : this.action()), group: 'right' },
    ], { grid: true });
    if (this.pad) this.padEls = [...document.querySelectorAll('#stage .mtouch--grid .mtouch__btn')].slice(-6);
  }

  padLabel(k) { return `${t(`greenShort_${k}`)} ${t('greenCostShort', { n: TYPES[k].cost })}`; }

  /**
   * The row below the map (desktop and headset): five project cards and the action button; while
   * the year runs, the two answers to a warning take their place. An invisible spacer of the
   * row's size keeps the browser camera's framing still when the row changes.
   */
  buildCards(xr) {
    const old = this.cards;
    if (old) {
      old.removeFromParent();
      old.traverse((o) => { if (o !== old) o.dispose?.(); });
    }
    this.cardsXR = xr;
    const desk = !xr && !this.engine.touchUI;
    const cw = num(desk ? 'xr-green-card-lg' : 'xr-green-card');
    const cards = new THREE.Group();
    this.cardTiles = TYPE_KEYS.map((k, i) => {
      const tile = projectCard(k, () => ({ selected: this.sel === k, disabled: !this.canChoose(k), key: desk ? String(i + 1) : null }), cw);
      tile.userData.onGrab = (p) => this.grabCard(k, p);
      tile.userData.onRelease = (p) => this.releaseCard(k, p);
      // The keyboard focus (Tab, then Enter): choose it; the focus moves on to the AI's best plot.
      tile.userData.onClick = () => {
        this.choose(k);
        if (this.sel === k && this.bestPlot) this.engine.setFocus(this.region.plots.get(this.bestPlot).box);
      };
      cards.add(tile);
      return tile;
    });
    const h = this.cardTiles[0].h;
    this.actionBtn = actionTile(() => this.actionState(), cw * 1.45, h);
    this.actionBtn.userData.onClick = () => this.action();
    cards.add(this.actionBtn);
    const items = [...this.cardTiles, this.actionBtn];
    const gap = 0.012;
    const total = items.reduce((s, b) => s + b.w, 0) + gap * (items.length - 1);
    let x = -total / 2;
    for (const b of items) { b.position.set(x + b.w / 2, 0, 0); x += b.w + gap; }
    // The answers to a warning: react (it has a price) or wait (it has a risk).
    const dw = desk ? 0.44 : 0.3;
    this.reactBtn = actionTile(() => this.decideState(true), dw, h);
    this.reactBtn.userData.onClick = () => this.react();
    this.waitBtn = actionTile(() => this.decideState(false), dw, h);
    this.waitBtn.userData.onClick = () => this.wait();
    this.reactBtn.position.set(-(dw + 0.03) / 2, 0, 0);
    this.waitBtn.position.set((dw + 0.03) / 2, 0, 0);
    cards.add(this.reactBtn, this.waitBtn);
    const spacer = new THREE.Mesh(new THREE.PlaneGeometry(total, h), new THREE.MeshBasicMaterial({ visible: false }));
    cards.add(spacer);
    this.cards = cards;
    this.ui.add(cards);
    this.syncTray();
  }

  /** Cards while planning and after the year; the two answers while a warning waits. */
  syncTray() {
    if (!this.cardTiles) return;
    const sim = this.mode === 'sim';
    const ask = this.asking;
    for (const c of this.cardTiles) c.visible = !sim;
    this.actionBtn.visible = !sim;
    this.reactBtn.visible = ask;
    this.waitBtn.visible = ask;
  }

  /** A warning is up and waits for the player's answer. */
  get asking() {
    const ev = this.alertEv;
    return this.mode === 'sim' && !!ev && !ev.outcome && !ev.reacted && !ev.waited;
  }

  // ---------- views for the panels ----------

  /** The next step for a newcomer (first year; relaxed mode: every year), null otherwise. */
  coach() {
    const g = this.game;
    if (this.mode !== 'plan' || (g.year > 0 && !this.easy)) return null;
    const dev = this.dev;
    if (this.sel) return g.pending.length && g.year > 0 ? null : { text: t(`greenCoach2${dev}`) };
    if (!g.pending.length) return { text: t(`greenCoach1${dev}`) };
    if (TYPE_KEYS.some((k) => this.canChoose(k))) return { text: t('greenCoach3', { n: money(g.budget) }) };
    return { text: t(`greenCoach4${dev}`) };
  }

  fcView(touch) {
    const g = this.game;
    if (this.mode === 'sim') return { mode: 'sim', report: this.report, month: this.month ?? 0, news: this.news, game: g };
    if (this.mode === 'report') return { mode: 'report', report: this.report, game: g, points: this.points, gained: this.gained };
    const id = this.hoverPlot ?? this.pinPlot;
    return { mode: 'plan', game: g, type: this.sel, plot: id ? g.plot(id) : null, map: this.mapMode, touch: touch || this.engine.touchUI, coach: this.coach(), bets: this.betsOn, hint: `greenAIHint${this.dev || 'Plot'}`, undoHint: `greenUndoHint${this.dev}` };
  }

  dashView() {
    const g = this.game;
    const points = this.points;
    if (this.mode === 'sim') {
      const k = clamp((this.month ?? 0) / 12, 0, 1);
      const r = this.report;
      return { game: g, year: r.year, report: r, upto: this.month ?? 0, power: r.energy * this.monthFrac(), co2: g.co2Total - r.co2 * (1 - k), qol: r.qolBefore + (r.qol - r.qolBefore) * k, points };
    }
    if (this.mode === 'report') return { game: g, year: this.report.year, report: this.report, points };
    if (this.mode === 'plan') {
      // The forecast for this year's portfolio (what is built so far).
      const power = g.plots.filter((p) => p.built && TYPES[p.built].kind === 'energy').reduce((s, p) => s + g.forecast(p.built, p.id).value, 0);
      return { game: g, power, points };
    }
    return { game: g, points };
  }

  /** What reacting to a warning costs and what waiting risks, as short texts. */
  stakes(ev) {
    const S = LIVE_STAKES[ev.type];
    const battery = ev.type === 'dark' && this.game.battery;
    const turbines = Math.max(1, this.report.projects.filter((p) => p.type === 'wind').length);
    return {
      act: t(battery ? 'greenAct_darkBattery' : `greenAct_${ev.type}`),
      cost: battery ? t('greenCost_darkBattery') : t(`greenCost_${ev.type}`, { n: money(S.cost.money ?? 0) }),
      risk: t(`greenRisk_${ev.type}`, { n: money(ev.type === 'storm' ? S.risk.perTurbine * turbines : S.risk.money ?? 0) }),
    };
  }

  alertView() {
    const ev = this.alertEv;
    if (!ev) return null;
    // Relaxed mode: no countdown, the year waits for the answer.
    return { ev, secs: this.easy ? null : ev.tHit - this.simT, lead: LEAD, reacted: ev.reacted, waited: ev.waited, outcome: ev.outcome, waitAct: t('greenWaitAct'), tip: this.tipFor(ev), ...this.stakes(ev) };
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
    const touch = this.engine.touchUI;
    const month = () => t('greenMonthNames').split(',')[Math.min(11, Math.floor(this.month ?? 0))];
    if (this.mode === 'sim') {
      const ev = this.alertEv;
      const open = ev && !ev.outcome;
      if (touch) return `${this.report.label} · ${month()}`;
      const base = t('greenHudSim', { name, year: this.report.label, month: month() });
      return open && !this.easy ? `${base} · ${t('greenWarn', { event: t(`greenLive_${ev.type}`), s: Math.max(0, Math.ceil(ev.tHit - this.simT)) })}` : base;
    }
    if (this.mode === 'report') return t(touch ? 'greenHudReportTouch' : 'greenHudReport', { name, year: this.report.label, gwh: fmt(this.report.energy), qol: fmtInt(g.qol) });
    const head = t(touch ? 'greenHudTouch' : 'greenHud', { name, year: g.yearLabel, n: g.year + 1, total: YEARS, budget: money(g.budget) });
    if (!Number.isFinite(this.planT ?? Infinity)) return head;
    const left = Math.max(0, Math.ceil(this.planT));
    const time = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    return `${head} · ${touch ? time : t('greenHudTime', { time })}`;
  }

  /** Nothing more fits into the budget: time to run the year. */
  get planned() { return this.mode === 'plan' && !TYPE_KEYS.some((k) => this.canChoose(k)); }

  actionState() {
    if (this.mode === 'report') return { label: t(this.game.over ? 'greenFinish' : 'greenNext'), icon: 'greenNext' };
    if (this.mode === 'sim') return { label: t('greenWait'), icon: 'greenGo', disabled: true };
    // "Run year" stands out once the budget is planned (until then it is an outlined button).
    return { label: t('greenStart'), icon: 'greenGo', sub: this.mode === 'plan' ? money(this.game.budget) : null, disabled: this.mode !== 'plan', primary: this.planned };
  }

  /** The AI's own tip for a warning: react from one half upwards, else wait. */
  tipReact(ev) { return ev.conf >= 0.5; }

  /**
   * The tip as shown ('react' | 'wait' | null): on the first warning of a round (learning by
   * doing: a star marks the answer the number suggests) and on every warning in relaxed mode.
   */
  tipFor(ev) {
    if (!ev || !(this.easy || this.hintWarn === ev)) return null;
    return this.tipReact(ev) ? 'react' : 'wait';
  }

  /** The two answers to a warning (react: true, wait: false) as button states. */
  decideState(react) {
    const ev = this.alertEv;
    if (!ev) return { label: t('greenWaitAct'), icon: 'greenWait', disabled: true };
    const battery = ev.type === 'dark' && this.game.battery;
    const tip = this.tipFor(ev) === (react ? 'react' : 'wait');
    const key = this.dev ? null : t('greenKey', { k: react ? t('greenCtlWarn').split(' / ')[0] : 'N' });
    return {
      label: react ? t(battery ? 'greenActShort_darkBattery' : `greenActShort_${ev.type}`) : t('greenWaitAct'),
      icon: react ? LIVE[ev.type].icon : 'greenWait',
      sub: [key, tip ? t('greenTip') : null].filter(Boolean).join(' · ') || null,
      primary: tip,
      disabled: !this.asking,
    };
  }

  // ---------- flow ----------

  start() {
    if (!this.region) { this.waitStart = true; return; }
    this.waitStart = false;
    this.clearLayer();
    this.layer.scale.setScalar(1); // (the wide intro of a phone held sideways enlarged it)
    this.layer.position.set(0, 0, 0);
    this.mode = 'plan';
    music.intensity = 0;
    this.easy = assist.easy; // relaxed mode, read when the round starts
    if (this.easy) { this.game.budget += EASY_BONUS; this.game.available += EASY_BONUS; }
    this.buildUI();
    this.refreshHud = this.hud(() => this.hudText());
    this.layout(true);
    this.beginPlan();
  }

  /** Bets against the AI open in the second year (the first one is for the basics). */
  get betsOn() { return this.game.year >= 1; }

  beginPlan() {
    const g = this.game;
    g.beginYear();
    this.mode = 'plan';
    this.planT = this.easy ? Infinity : PLAN_TIME[g.year] ?? 50;
    this.sel = null;
    this.pinPlot = null;
    this.report = null;
    this.alertEv = null;
    this.confirmRun = 0;
    this.flash = null;
    this.cursor = null;
    this.region.repairTurbines();
    this.region.setFlood(0);
    this.region.setSandbags(false);
    this.region.showMarker(null);
    this.layout();
    this.updateWishes(false);
    this.refresh();
    sfx.build();
    // The year's messages, one after the other: the budget, what is new in town, what is new in the game.
    // (A phone held upright shows messages in the AI panel's place: in the first year the coach
    // keeps it, the status bar has the budget anyway.)
    const list = [];
    if (this.easy && g.year === 0) list.push([t('greenYearStart', { year: g.yearLabel, budget: money(g.budget) }), t('greenEasyBudget', { n: money(EASY_BONUS) }), 'xr-green-energy', 3.4]);
    else if (!(g.year === 0 && this.engine.touchUI && this.portrait)) list.push([t('greenYearStart', { year: g.yearLabel, budget: money(g.budget) }), null, 'xr-green-energy', 2.2]);
    if (g.announce) list.push([t(`greenEv_${g.announce}`), null, 'xr-green-social', 3.6, () => sfx.announce()]);
    if (g.year === 1) list.push([t('greenHintBet'), t('greenHintBetSub'), 'xr-accent', 3.6]);
    if (g.year === YEARS - 1) list.push([t('greenHintLast'), null, 'xr-warning', 3]);
    this.toastSeq(list, g.year);
  }

  /** Messages one after the other while this year is planned (dropped once the year runs). */
  toastSeq(list, year) {
    let at = 0;
    for (const [text, sub, token, secs, fx] of list) {
      const show = () => {
        if (this.disposed || this.mode !== 'plan' || this.game.year !== year) return;
        fx?.();
        this.toast(text, sub, token, secs);
      };
      if (at === 0) show(); else this.delay(at, show);
      at += secs + 0.2;
    }
  }

  /** The year runs: the game decides the real weather at once, the diorama plays it back. */
  runYear(timeUp = false) {
    if (this.mode !== 'plan') return;
    const g = this.game;
    const pending = [...g.pending];
    if (timeUp) this.toast(t('greenTimeUp'), null, 'xr-warning');
    else if (g.budget >= CHEAPEST && g.budget > 0.05 && g.year < YEARS - 1) this.toast(t('greenLeftover', { n: money(g.budget) }), null, 'xr-panel-muted');
    this.report = g.runYear();
    this.mode = 'sim';
    this.simT = 0;
    this.month = 0;
    this.news = null;
    this.surprised = false;
    this.liveQueue = this.report.plan.map((e) => ({ ...e, tHit: secAt(e.month), reacted: false, waited: false, outcome: null }));
    this.alertEv = null;
    this.vis.throttle = false;
    this.vis.blackout = false;
    this.sel = null;
    this.drag = null;
    this.flash = null;
    this.region.hideGhost();
    this.cursor = null;
    if (this.engine.focus?.userData.plot) this.engine.setFocus(null);
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
    // The points so far, and what this year added.
    const total = this.game.score().total;
    this.gained = total - (this.points ?? 0);
    this.points = total;
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
    // The first warning of the round comes with a hint on how to read it.
    if (!this.hintWarn) { this.hintWarn = ev; this.news = t('greenHintWarn'); }
    sfx.announce();
    this.region.showMarker(ev.type);
    this.alert.visible = true;
    this.alertPanel.redraw();
    this.popIn(this.alertPanel);
    this.refresh();
  }

  /** The player reacts to the warning (button, key, a tap on the marker). */
  react() {
    const ev = this.alertEv;
    if (!this.asking) return;
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

  /** The player decides to wait and see (a low confidence is usually a false alarm). */
  wait() {
    const ev = this.alertEv;
    if (!this.asking) return;
    ev.waited = true;
    sfx.click();
    this.region.showMarker(ev.type, false, true);
    this.alertPanel.redraw();
    this.refresh();
  }

  /** The moment of the event: it comes true or it was a false alarm. */
  resolveAlert(ev) {
    const out = this.game.resolveLive(ev, ev.reacted);
    const kind = ev.real ? (ev.reacted ? 'hit' : 'miss') : ev.reacted ? 'wasted' : 'calm';
    // A warning judged right is worth its share of the 700 points for warnings.
    ev.outcome = { good: out.good, pts: out.good ? Math.round(700 / (YEARS * 2)) : 0, text: t(`greenOut_${ev.type}_${kind}`, { n: money(Math.max(0, -out.money)) }) };
    this.alertPanel.redraw();
    this.news = ev.outcome.text;
    if (ev.real && ev.type === 'storm' && !ev.reacted) { this.region.breakTurbines(2); sfx.crash(); }
    if (ev.real && ev.type === 'storm') sfx.storm();
    if (ev.real && ev.type === 'flood') this.region.setFlood(ev.reacted ? 0.007 : 0.0115);
    if (ev.real && ev.type === 'dark' && !ev.reacted) this.vis.blackout = true;
    if (out.good) { sfx.correct(); this.burst(this.alert.getWorldPosition(new THREE.Vector3()), 'xr-green-up', 16); } else sfx.wrong();
    this.region.showMarker(null);
    ev.hideAt = this.simT + 3.4;
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
    const list = g.wishes.map((w) => {
      const met = g.wishMet(w);
      // The bubble: the project's icon and one word, louder with every ignored year.
      const word = t(`greenWishShort_${w.type}`);
      return { district: w.district, level: w.level, met, icon: TYPES[w.type].icon, text: met ? t('greenWishThanks') : `${w.level >= 3 ? word.toUpperCase() : word}${'!'.repeat(w.level)}` };
    });
    for (const w of list) {
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

  /** The action button / Enter: run the year, or go on after the report. */
  action() {
    if (this.mode === 'plan') {
      const g = this.game;
      // Nothing built although the budget allows it: ask once more (a slip of the finger).
      if (!g.pending.length && TYPE_KEYS.some((k) => this.canChoose(k)) && this.time > this.confirmRun) {
        this.confirmRun = this.time + 5;
        sfx.wrong();
        this.toast(t('greenConfirmRun'), t('greenConfirmRunSub'), 'xr-warning', 3.2);
        return;
      }
      this.runYear();
    } else if (this.mode === 'report') {
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
    this.region?.setFocusRing(null);
    this.toastQueue = [];
    this.hideAlert();
    this.dropToast();
    Object.assign(this.vis, { cloud: 0, rain: 0, snowfall: 0, storm: 0, night: 0, throttle: false, blackout: false });
    this.ui.visible = false;
    this.pad?.show(false);
    this.layout(true);
    const p = (v) => `${fmtInt(v * 100)} %`;
    const learned = [
      { q: t('greenLearn4Q'), a: t('greenLearn4A', { good: sc.liveGood, n: sc.liveTotal }) },
      { q: t('greenLearn2Q'), a: t('greenLearn2A', { p: p(sc.projectErr) }) },
      g.betLog.length ? { q: t('greenLearn2bQ'), a: t('greenLearn2bA', { p: sc.betWins, a: sc.betAi }) }
        : sc.both && sc.portfolioErr < sc.projectErr ? { q: t('greenLearn3Q'), a: t('greenLearn3AMix', { p: p(sc.portfolioErr), q: p(sc.projectErr) }) } : { q: t('greenLearn3Q'), a: t('greenLearn3A') },
    ];
    // A rating in three steps (by the points that count), the points missing to the next one,
    // and one tip: the weakest part of the score.
    const counted = Math.round(sc.total * (this.easy ? assist.scoreFactor : 1));
    const rank = counted >= RANKS[1] ? 3 : counted >= RANKS[0] ? 2 : 1;
    const rankLine = `${t('greenRankLine', { n: rank, name: t(`greenRank${rank}`) })}. ${rank < 3 ? t('greenRankNext', { n: fmtInt(RANKS[rank - 1] - counted), name: t(`greenRank${rank + 1}`) }) : t('greenRankTop')}`;
    const share = { energy: sc.parts.energy / 1200, social: sc.parts.social / 1200, mix: sc.parts.mix / 600, budget: sc.parts.budget / 300, live: sc.parts.live / 700 };
    let weak = Object.keys(share).reduce((a, b) => (share[b] < share[a] ? b : a));
    if (share[weak] > 0.7 && sc.parts.bets < 100) weak = 'bets';
    this.results({
      gameKey: 'green', score: sc.total, correct: Math.round(sc.total / 50), total: 100,
      line: `${t('greenLine', { gwh: fmtInt(g.energyTotal), qol: fmtInt(g.qol) })}\n${rankLine}\n${t(`greenTip_${weak}`)}`,
      learned,
      onAgain: () => { again = true; this.app.startGame('green'); },
    });
  }

  /** Calm motion: far fewer particles. */
  burst(pos, token, count = 22) {
    super.burst(pos, token, assist.reducedMotion ? Math.max(3, Math.round(count / 5)) : count);
  }

  // ---------- choosing and building ----------

  canChoose(type) {
    const g = this.game;
    return this.mode === 'plan' && g.budget >= TYPES[type].cost - 1e-9 && g.plots.some((p) => !p.built && p.area === TYPES[type].area);
  }

  choose(type) {
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

  /** A number key chose a project: mark the AI's best plot for it (the space bar builds there). */
  chooseByKey(type) {
    this.engine.setFocus(null);
    if (this.sel !== type) this.choose(type); // (pressing the key again keeps the project)
    this.mark(this.sel === type ? this.bestPlot : null);
  }

  /**
   * Marks a plot for the keyboard (a ring; the space bar builds there). Not the engine's Tab
   * focus, so Enter stays free for "run the year". A screen reader hears the plot's label.
   */
  mark(id) {
    this.cursor = id && this.region?.plots.has(id) ? id : null;
    this.markNdc = this.engine.mouse?.ndc?.clone() ?? null; // (moving the mouse takes over again)
    const live = this.engine.live;
    if (this.cursor && live) live.textContent = String(this.region.plots.get(this.cursor).box.userData.label ?? '');
  }

  /** Arrow keys: the next plot in that direction on the screen. */
  moveFocus([dx, dy]) {
    const R = this.region;
    const cam = this.engine.camera;
    const T = this.sel ? TYPES[this.sel] : null;
    const list = [...R.plots.values()].filter((P) => !T || P.area === T.area);
    const cur = R.plots.get(this.cursor);
    if (!cur) { this.mark(list.some((P) => P.id === this.bestPlot) ? this.bestPlot : list[0]?.id); sfx.tick(); return; }
    const at = (P) => { const v = P.group.getWorldPosition(new THREE.Vector3()).project(cam); return [v.x * cam.aspect, v.y]; };
    const [cx, cy] = at(cur);
    let best = null;
    let bs = Infinity;
    for (const P of list) {
      if (P === cur) continue;
      const [x, y] = at(P);
      const along = (x - cx) * dx + (y - cy) * dy;
      const off = Math.abs((x - cx) * dy - (y - cy) * dx);
      if (along < 0.01) continue;
      const s = along + 2.2 * off;
      if (s < bs) { bs = s; best = P; }
    }
    if (best) { this.mark(best.id); sfx.tick(); }
  }

  /** A pointer pressed a card: choose it; dragging it onto a plot builds there. */
  grabCard(type, p) {
    if (this.mode !== 'plan') return;
    this.cursor = null;
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
      let bd = this.easy ? 0.1 : 0.075; // relaxed mode: a larger catch area around every plot
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
    for (const P of R.plots.values()) {
      P.box.userData.onClick = () => this.clickPlot(P.id);
      P.box.userData.label = t('greenPlotLabel', { name: plotName(this.game.plot(P.id)) });
    }
    R.hit.userData.interactive = true;
    R.hit.userData.focusable = false;
    R.hit.userData.label = t('greenName');
    R.hit.userData.onClick = (p) => {
      if (this.mode !== 'plan') return;
      const id = this.plotUnderHit(p.pressHit ?? p.hit);
      if (id) this.clickPlot(id);
    };
    R.markerHit.userData.focusable = false;
    R.markerHit.userData.label = t('greenWarnTitle');
    R.markerHit.userData.onClick = () => this.react();
  }

  plotUnderHit(hit) {
    if (!hit) return null;
    return this.plotUnder({ hovered: this.region.hit, hit });
  }

  /** A plot was pressed (pointer, Tab focus, or byKey: the space bar on the marked plot). */
  clickPlot(id, byKey = false) {
    const g = this.game;
    const P = g.plot(id);
    if (!P || this.mode !== 'plan') return;
    const byTab = this.engine.focus?.userData.plot === id; // pressed through the Tab focus
    if (!byKey) this.cursor = null;
    this.pinPlot = id;
    // No project chosen and an uncertain plot: bet against the AI (more wind, less, none).
    if (!this.sel && !P.built && this.betsOn && g.canBet(id)) {
      const b = g.cycleBet(id);
      sfx.tick();
      this.toast(b ? t('greenBetSet', { plot: t(`greenPlot_${id}`), dir: t(b.dir > 0 ? 'greenBetUp' : 'greenBetDown') }) : t('greenBetOff'), b && this.engine.touchUI ? t('greenBetInfo') : null, 'xr-accent', 2.6);
      this.refresh();
      return;
    }
    if (P.built) {
      // Placed this year: take it back (money returns).
      if (g.pending.includes(id) && (!this.sel || this.sel === P.built)) {
        const type = P.built;
        g.undo(id);
        this.region.unbuild(id);
        this.flash = null;
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
    const f = g.forecast(type, id);
    g.build(type, id);
    const R = this.region;
    R.build(id, type);
    sfx.build();
    this.delay(0.25, () => { if (!this.disposed) sfx.appear(); });
    const P3 = R.plots.get(id);
    this.burst(P3.group.localToWorld(new THREE.Vector3(0, 0.02, 0)), TYPES[type].token, 16);
    for (const ptr of this.engine.pointers) this.engine.haptic(ptr, 0.5, 40);
    // What it brings, as a tag over the new project for a moment.
    const flash = { id, text: T.kind === 'energy' ? `+${fmt(f.value)} GWh` : `+${fmtInt(f.value)} %`, token: T.token };
    this.flash = flash;
    this.delay(1.8, () => { if (this.flash === flash) { this.flash = null; if (!this.disposed && this.mode === 'plan') this.refresh(); } });
    // Keep the type while there is money and room for another one.
    if (!this.canChoose(type)) this.sel = null;
    this.updateWishes();
    this.refresh();
    // Keyboard: on to the next best plot, or let go once the type is used up.
    if (byKey) this.mark(this.sel ? this.bestPlot : null);
    if (byTab) this.engine.setFocus(this.sel && this.bestPlot ? R.plots.get(this.bestPlot).box : null);
  }

  // ---------- keyboard ----------

  key(e) {
    if (this.mode === 'intro' || this.mode === 'over' || this.engine.paused || this.engine.isXR) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (this.mode === 'sim') {
      // A warning: J (or Y, or the space bar) reacts, N waits.
      if (k === ' ' || k === 'j' || k === 'y') { e.preventDefault(); this.react(); } else if (k === 'n') { e.preventDefault(); this.wait(); }
      return;
    }
    if (this.mode === 'report') {
      if (k === 'Enter' || k === ' ') { e.preventDefault(); if (!e.repeat) this.action(); }
      return;
    }
    if (KEYS[k]) { e.preventDefault(); this.chooseByKey(KEYS[k]); return; }
    if (ARROWS[k]) { e.preventDefault(); this.moveFocus(ARROWS[k]); return; }
    if (k === 'Enter') { e.preventDefault(); if (!e.repeat) this.action(); return; }
    // The space bar builds on the marked plot; without a mark it marks the AI's best one first.
    if (k === ' ') {
      e.preventDefault();
      if (e.repeat) return;
      if (this.cursor) this.clickPlot(this.cursor, true); else if (this.sel) this.mark(this.bestPlot); else this.moveFocus([0, 1]);
      return;
    }
    if (k === 'Escape') {
      // Drops the selection; with nothing selected the key pauses the game (pause.js).
      if (this.sel || this.pinPlot || this.cursor) { e.preventDefault(); this.sel = null; this.pinPlot = null; this.cursor = null; sfx.click(); this.refresh(); }
      return;
    }
    if ((k === 'Backspace' || k === 'z') && this.game.pending.length) {
      e.preventDefault();
      this.pinPlot = null;
      this.cursor = null;
      const last = this.game.pending[this.game.pending.length - 1];
      const type = this.game.plot(last).built;
      // Takes back the last project (whatever is selected).
      const sel = this.sel;
      this.sel = null;
      this.clickPlot(last);
      this.sel = sel && this.canChoose(sel) ? sel : this.canChoose(type) ? type : null;
      this.refresh();
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
        const tags = vals.map(({ p, f }) => ({ id: p.id, text: T.kind === 'energy' ? fmt(f.value) : `+${fmtInt(f.value)}`, token: T.token, strong: p.id === this.bestPlot }));
        if (this.flash) tags.push({ ...this.flash, strong: false });
        R.setTags(tags);
      } else if (this.mode === 'plan') {
        // Nothing chosen: the wind map faintly (its hatching marks where the AI is unsure) and,
        // from the second year on, the plots that take a bet against the AI.
        this.mapMode = 'wind';
        R.showMap('wind', null, 0.36);
        this.bestPlot = null;
        const tags = !this.betsOn ? [] : g.plots.filter((p) => !p.built && g.canBet(p.id)).map((p) => {
          const b = g.bet?.id === p.id ? g.bet : null;
          return { id: p.id, text: b ? t(b.dir > 0 ? 'greenBetUpTag' : 'greenBetDownTag') : t('greenBetAsk'), token: b ? 'xr-accent' : 'xr-panel-border', strong: !!b };
        });
        if (this.flash) tags.push({ ...this.flash, strong: false });
        R.setTags(tags);
      } else if (this.mode === 'report' && this.report) {
        this.mapMode = null;
        R.showMap(null);
        const tags = this.report.projects.map((pr) => ({ id: pr.id, text: pct(pr.actual / pr.forecast - 1), token: pr.actual >= pr.forecast ? 'xr-green-up' : 'xr-green-down' }));
        for (const s of this.report.social) tags.push({ id: s.id, text: `+${fmtInt(s.gain)}`, token: 'xr-green-qol' });
        const b = this.report.bet;
        if (b) {
          const i = tags.findIndex((x) => x.id === b.id);
          const tag = { id: b.id, text: `${b.winner === 'player' ? '+' : ''}${b.pts}`, token: b.winner === 'player' ? 'xr-green-up' : 'xr-green-down', strong: true };
          if (i >= 0) tags[i] = tag; else tags.push(tag);
        }
        R.setTags(tags);
      } else {
        this.mapMode = null;
        R.showMap(null);
        R.setTags(null);
      }
      // What a screen reader hears on a plot, and which plots the Tab key visits.
      const T = this.mode === 'plan' && this.sel ? TYPES[this.sel] : null;
      for (const P of R.plots.values()) {
        const gp = g.plot(P.id);
        const name = plotName(gp);
        let label = t('greenPlotLabel', { name });
        if (gp.built) label = t('greenPlotLabelBuilt', { name, type: typeName(gp.built) });
        else if (T && gp.area === T.area) {
          const f = g.forecast(this.sel, P.id);
          label = t('greenPlotLabelFc', { name, type: typeName(this.sel), value: T.kind === 'energy' ? `${fmt(f.value)} GWh` : `+${fmtInt(f.value)} %` });
        } else if (this.mode === 'plan' && !this.sel && this.betsOn && g.canBet(P.id)) label = t('greenPlotLabelBet', { name });
        P.box.userData.label = label;
        P.box.userData.focusable = this.mode === 'plan';
      }
    }
    this.syncTray();
    this.fc?.redraw();
    this.dash?.redraw();
    this.cardTiles?.forEach((c) => c.redraw());
    if (this.actionBtn) {
      this.actionBtn.userData.label = this.actionState().label;
      this.actionBtn.redraw();
      this.reactBtn.userData.label = this.decideState(true).label;
      this.waitBtn.userData.label = this.decideState(false).label;
      this.reactBtn.redraw();
      this.waitBtn.redraw();
    }
    this.refreshHud?.();
    if (this.pad) {
      const sim = this.mode === 'sim';
      const ask = this.asking;
      const tip = this.tipFor(this.alertEv);
      TYPE_KEYS.forEach((k, i) => {
        // While the year runs: the project buttons go, the fifth one is "wait".
        if (this.padEls?.[i]) this.padEls[i].style.visibility = sim && i < 4 ? 'hidden' : '';
        const tipWait = ask && tip === 'wait';
        if (i === 4) this.pad.relabel(4, sim ? 'greenWait' : TYPES[k].icon, sim ? `${tipWait ? '★ ' : ''}${t('greenWaitAct')}` : this.padLabel(k));
        this.pad.disable(i, sim ? i < 4 || !ask : !this.canChoose(k));
        this.padEls?.[i]?.classList.toggle('mtouch__btn--primary', sim ? i === 4 && tipWait : this.sel === k);
      });
      const a = sim ? this.decideState(true) : this.actionState();
      const tipReact = ask && tip === 'react';
      this.pad.relabel(5, a.icon, this.mode === 'plan' ? t('greenStartShort') : sim && !this.alertEv ? t('greenWait') : `${tipReact ? '★ ' : ''}${a.label}`);
      this.pad.disable(5, !!a.disabled);
      // "Go" stands out once nothing more fits into the budget and to go on after the report;
      // the AI's tip for a warning stands out (a star and the main color).
      this.padEls?.[5]?.classList.toggle('mtouch__btn--primary', this.mode === 'report' || this.planned || tipReact);
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
    // The year's clock: once the player has answered a warning it runs fast up to the event (no
    // waiting); in relaxed mode it stops just before the event until the answer is given.
    let speed = 1;
    const open = this.alertEv && !this.alertEv.outcome ? this.alertEv : null;
    if (open) {
      const left = open.tHit - this.simT;
      if (open.reacted || open.waited) speed = left > 0.9 ? 3 : 1;
      else if (this.easy && left <= 0.6) speed = 0;
    }
    this.simT += dt * speed;
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
        // Only as a toast (and in the AI panel) when no warning is on the screen.
        if (!this.alertEv) { this.news = t(`greenWx_${r.weather}`); sfx.announce(); this.toast(t(`greenWx_${r.weather}`), null, r.weather === 'calm' || r.weather === 'dull' ? 'xr-green-down' : 'xr-green-up', 3.2); }
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
    this.vis.calm = assist.reducedMotion;
    if (this.mode === 'plan' || this.mode === 'report' || this.mode === 'intro' || this.mode === 'over') {
      if (this.mode === 'plan') {
        if (Number.isFinite(this.planT)) {
          const before = this.planT;
          this.planT -= dt;
          // The last ten seconds: a message, then a tick every second.
          if (before > 10 && this.planT <= 10) { sfx.announce(); this.toast(t('greenTime10'), null, 'xr-warning', 2); this.actionBtn?.redraw(); } else if (this.planT <= 10 && Math.ceil(this.planT) !== Math.ceil(before)) sfx.tick();
          if (this.planT <= 0) this.runYear(true);
        }
        if (Math.floor(this.time * 2) !== this.hudTick) { this.hudTick = Math.floor(this.time * 2); this.refreshHud?.(); }
      }
      // Calm planning weather (a winter morning at Christmas).
      const calm = { wind: 0.55, sun: 1, cloud: this.engine.isXR && this.mode !== 'over' ? 0.3 : 0, rain: 0, snowfall: CHRISTMAS && this.mode !== 'over' ? 0.22 : 0, snow: 0.65, night: 0, storm: 0, heat: 0 };
      for (const k of Object.keys(calm)) this.vis[k] += (calm[k] - this.vis[k]) * Math.min(1, dt * 1.5);
      this.vis.month += (2.4 - this.vis.month) * Math.min(1, dt);
      this.vis.cutout = false;
    }
    if (this.mode === 'sim') this.updateSim(dt);
    R.update(dt, this.vis);
    this.syncSlots();
    this.pad?.show(this.mode === 'plan' || this.mode === 'report' || this.mode === 'sim');
    this.updatePointers();
  }

  /** Hover over plots (all pointers, the keyboard's mark), dragging a card, the plots' highlight. */
  updatePointers() {
    const R = this.region;
    const e = this.engine;
    let hover = null;
    for (const p of e.pointers) {
      if (!p.active) continue;
      const id = this.plotUnder(p);
      if (id && !hover) hover = id;
    }
    // The keyboard's mark (number and arrow keys, Tab) counts like a pointer over the plot, and
    // goes before a mouse that merely rests somewhere; moving the mouse takes over again.
    if (this.cursor && this.markNdc && e.mouse?.active && e.mouse.ndc.distanceTo(this.markNdc) > 0.02) this.cursor = null;
    const mark = !e.isXR && this.mode === 'plan' ? this.cursor ?? e.focus?.userData.plot ?? null : null;
    if (mark) hover = mark;
    R.setFocusRing(mark);
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
          gh.position.y += 0.004 + (this.vis.calm ? 0 : 0.003 * Math.sin(this.time * 8));
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
    if (this.engine.focus?.userData.plot) this.engine.setFocus(null);
    this.region?.dispose(this.engine.renderer);
    super.dispose();
  }
}
