// "Stein auf Stein" / "Brick by Brick": a decision game about building a house. A brief says who
// builds, where, and how much money there is. Then the player only decides: six required parts
// (walls, roof, windows, front door, heating, garden), each from three cards with a price and
// plain tags, and after that a list of extras (none, one or several). Every choice costs money,
// the budget pays for the basic version and two or three things more, and it cannot be
// overdrawn: cards that are too expensive are locked, and the money for the cheapest remaining
// parts stays reserved. After each choice the house gains the part by itself (the crane sets the
// roof); next door the Winters build with the same budget. An AI adviser (bricks-ai.js) shows
// before each choice how coherent the house would end up with each option, with a confidence: it
// has learned from houses built so far, is unsure on rare combinations and does not know the
// family's wishes. At the end the coherence check ("Stimmigkeits-Check") compares both houses on
// five criteria with a reason each, names what the money bought and gives one tip.
//
// No timing, no dragging, no countdown. Browser: the house in the middle, the neighbors beside
// it, the cards in a row below (a column on upright phones), the brief with the budget bar and
// the adviser beside. Headset (AR and VR): the plot as a diorama at table height, the cards on
// an arc at eye height. Relaxed mode and calm motion (assist.js), controls per device, pause-safe.
import * as THREE from 'three';
import { BaseScene } from '../scene.js';
import { Button, textPanel, placeOnArc, measureBlocks } from '../ui3d.js';
import { color, hex, num } from '../tokens.js';
import { t, L as loc } from '../i18n.js';
import { SPONSOR } from '../content.js';
import { sfx } from '../sfx.js';
import { music } from '../music.js';
import { assist } from '../assist.js';
import { sceneLook, softSun, bloom, contactShadow, gfxTier } from '../gfx.js';
import { CHRISTMAS, makeBulbs } from '../christmas.js';
import { makeSnowfall, setSnowAmount } from '../snow.js';
import { radialTexture } from '../robot-visuals.js';
import '../bricks-text.js';
import { DECISIONS, STEPS, OPTION, makeRound, judge, bestFrom, bestChange, bestHouse, priceOf, reserve, clashes, needMet } from '../bricks-data.js';
import { Adviser } from '../bricks-ai.js';
import { TOP, FOUND, HOUSE_Z } from '../bricks-plan.js';
import { House, ROOF_SLINGS } from '../bricks-house.js';
import { loadBricks, Crane, Puffs, bsfx, makeFamily } from '../bricks-visuals.js';
import { OptionCard, briefPanel, aiPanel, strip, neighborSign, checkPanel, euro, optName, BRIEF_H, SIGN_H, SIGN_W, SIGN_SMALL, CHECK_SIZE } from '../bricks-panels.js';

// Points: the coherence total (0..100) times RATE, a bonus for beating the neighbors and a
// little for every point of lead. A perfect round stays below the 5000 the leaderboard allows.
const RATE = 42;
const BEAT = 400;
const LEAD = 10; // per point ahead, at most 25 points
const RATING = [2900, 3600]; // points for the second and the third rating (times the relaxed mode's share)
// Headset placement: the plot below eye height within reach.
const PLOT_DROP = 0.58;
const PLOT_Z = -0.52;
const HOUSE = new THREE.Vector3(0, FOUND, HOUSE_Z);
const CRANE_AT = new THREE.Vector3(-0.06, 0, -0.335);
const FIR = new THREE.Vector3(-0.4, 0, 0.27);
// Card sizes in meters per layout: [required part, extra].
const CARD = { row: [[0.72, 0.4], [0.5, 0.3]], col: [[0.9, 0.275], [0.5, 0.27]], side: [[0.9, 0.3], [0.5, 0.25]], xr: [[0.6, 0.5], [0.52, 0.3]] };
const clamp = THREE.MathUtils.clamp;
/** "1 Punkt", "8 Punkte". */
const points = (n) => t(n === 1 ? 'bricksPoint' : 'bricksPoints', { n });
const ease = (k) => k * k * (3 - 2 * k);

// "Again" on the result starts the next round at once (no intro a second time), with another brief.
let skipIntro = false;
let lastBrief = null;

export class BricksScene extends BaseScene {
  constructor(app) {
    super(app);
    this.gameKey = 'bricks';
    this.mode = 'intro';
    this.time = 0;
    this.calm = assist.reducedMotion; // gentle animations, few particles, no camera moves
    this.easy = assist.easy; // the cards point out clashes, the confidence comes in words too
    this.ar = this.engine.isXR && this.engine.xrMode === 'immersive-ar';
    // Relaxed mode: a little more money, so one more wish fits in.
    this.round = makeRound(lastBrief, assist.pick(0, 12));
    lastBrief = { people: this.round.brief.people, place: this.round.brief.place.id };
    this.ai = new Adviser(this.round);
    this.step = 0;
    this.choices = []; // the required parts chosen so far (option ids)
    this.extras = []; // the extras taken
    this.records = []; // per required part: what the adviser picked, what the player picked
    this.undone = new Set(); // steps whose choice was changed once already
    this.nbStep = 0;
    this.cards = [];
    this.note = null; // feedback after a choice

    this.setupLook();
    this.world = new THREE.Group();
    this.world.userData.noFit = true;
    // On screens the plot would stand in front of the intro panel: it appears with the start.
    this.world.visible = this.engine.isXR;
    this.group.add(this.world);
    this.plotRoot = new THREE.Group();
    this.plotRoot.position.set(0, this.eye - PLOT_DROP, PLOT_Z);
    this.world.add(this.plotRoot);
    this.puffs = new Puffs(this.plotRoot);
    this.addLights();
    // Everything on panels: placed on the screen (browser) or around the player (headset).
    this.ui = new THREE.Group();
    this.ui.userData.noFit = true;
    this.ui.visible = false;
    this.group.add(this.ui);

    this.ready = loadBricks().then((M) => { if (!this.disposed) this.build(M); });
    this.setupKeys();
    this.onUpdate((dt) => this.update(dt));
    const rows = (dev, n) => Array.from({ length: n }, (_, i) => [t(`bricksCtl_${dev}${i + 1}k`), t(`bricksCtl_${dev}${i + 1}a`)]);
    this.setControls({ desktop: rows('desk', 4), touch: rows('touch', 2), xr: rows('xr', 2) });
    const again = skipIntro;
    skipIntro = false;
    if (again) this.start();
    else this.showIntro();
  }

  /** The intro: two sentences and the controls. Phones held sideways get a wide, low panel, so the text stays big enough to read. */
  showIntro() {
    if (!this.engine.touchUI || window.innerWidth / window.innerHeight < 1.3) {
      this.intro(t('bricksName'), t('bricksIntro'), () => this.start());
      return;
    }
    this.clearLayer();
    const blocks = [
      { text: t('bricksName'), size: 'xr-text-title', weight: 'black', gap: 0.03 },
      { text: t('bricksIntro'), size: 'xr-text-md', color: color('xr-panel-muted'), gap: 0.03 },
      ...this.controlsBlocks(),
      { text: loc(SPONSOR.presentedBy), size: 'xr-text-sm', weight: 'bold', color: color('xr-warning') },
    ];
    const w = 2.0;
    const z = -0.8;
    const panel = this.add(textPanel(w, measureBlocks(blocks, w, num('xr-padding')) + 0.02, blocks));
    panel.position.set(0, this.eye + 0.2 - panel.h / 2, z);
    const go = this.add(new Button(0.5, 0.12, { label: t('start'), variant: 'primary', labelSize: 'xr-text-lg', onClick: () => { this.startMusic(-1); this.start(); } }));
    go.position.set(0, panel.position.y - panel.h / 2 - 0.03 - go.h / 2, z);
    this.popIn(panel);
    this.popIn(go, 0.1);
    this.app.host?.introduce(this, 'bricks', panel);
    this.prepareMusic();
  }

  /** Calm motion: fewer particles. */
  burst(worldPos, token, count = 22) {
    super.burst(worldPos, token, this.calm ? Math.ceil(count * 0.3) : count);
  }

  // ---------- world ----------

  /**
   * The look: neutral tone mapping with a soft studio environment, a warm evening key light with
   * soft shadows (none with "lite" effects), the app's general lights dimmed. In the browser
   * and in VR a winter-evening sky with stars; in AR the real room stays visible (no sky, no
   * backdrop). Bloom for the lights in the desktop browser. Scaled by gfxTier().
   */
  setupLook() {
    const e = this.engine;
    this.tier = gfxTier();
    this.onSceneDispose(sceneLook(e, { tone: 'neutral', exposure: 1.0, env: 'studio', envIntensity: 0.55, shadows: this.tier === 'low' ? false : 'soft' }));
    const lights = [e.hemi, ...e.scene.children.filter((o) => o.isDirectionalLight)];
    const prev = lights.map((l) => l.intensity);
    e.hemi.intensity = 0.5;
    lights.slice(1).forEach((l) => { l.intensity = 0.35; });
    this.onSceneDispose(() => lights.forEach((l, i) => { l.intensity = prev[i]; }));
    // On 'medium' the shadow map is drawn only while the house changes, not every frame.
    if (this.tier === 'medium') {
      const sm = e.renderer.shadowMap;
      const auto = sm.autoUpdate;
      sm.autoUpdate = false;
      sm.needsUpdate = true;
      this.shadowSig = -1;
      this.onSceneDispose(() => { sm.autoUpdate = auto; sm.needsUpdate = true; });
    }
    if (!this.ar) this.makeSky();
    const glow = this.tier === 'high' && !e.isXR && !e.touchUI;
    this.glowBoost = glow ? 3 : 1;
    if (glow) this.onSceneDispose(bloom(e, { strength: 0.55, radius: 0.5, threshold: 2.8 }));
  }

  /** A winter-evening sky: a gradient dome and a few stars (browser and VR only). */
  makeSky() {
    const e = this.engine;
    const sky = new THREE.Group();
    sky.userData.noFit = true;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(16, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
      uniforms: { uTop: { value: new THREE.Color(hex('xr-bricks-sky-top')) }, uMid: { value: new THREE.Color(hex('xr-bricks-sky-mid')) }, uLow: { value: new THREE.Color(hex('xr-bricks-sky-low')) } },
      vertexShader: 'varying float vH; void main() { vH = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uLow; varying float vH;
        void main() { vec3 c = vH > 0.0 ? mix(uMid, uTop, smoothstep(0.0, 0.55, vH)) : mix(uMid, uLow, smoothstep(0.0, 0.3, -vH));
          gl_FragColor = vec4(c, 1.0);
          #include <colorspace_fragment>
        }`,
    }));
    dome.renderOrder = -10;
    dome.userData.noFit = true;
    dome.frustumCulled = false;
    const n = this.tier === 'high' ? 320 : 140;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const h = 0.08 + Math.random() * 0.9;
      const r = Math.sqrt(1 - h * h) * 14;
      pos.set([Math.cos(a) * r, h * 14, Math.sin(a) * r], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({ color: hex('xr-bricks-star'), size: 0.09, map: radialTexture(), transparent: true, depthWrite: false, fog: false, toneMapped: false, sizeAttenuation: true }));
    stars.userData.noFit = true;
    stars.frustumCulled = false;
    sky.add(dome, stars);
    sky.position.y = this.eye;
    this.group.add(sky);
    const back = e.backdrop.visible;
    e.backdrop.visible = false;
    this.onSceneDispose(() => { e.backdrop.visible = back; });
  }

  addLights() {
    // Warm evening key light from the left (the only shadow caster), a cool rim from behind.
    const key = new THREE.DirectionalLight(hex('xr-bricks-key-light'), 2.6);
    key.position.set(-0.95, 1.05, 0.3);
    key.target.position.set(0.05, 0, 0);
    const rim = new THREE.DirectionalLight(hex('xr-bricks-rim-light'), 1.1);
    rim.position.set(0.7, 0.8, -0.9);
    rim.target = key.target;
    this.plotRoot.add(key, key.target, rim);
    if (this.tier !== 'low') softSun(key, { size: 1.5, near: 0.3, far: 3, bias: -0.0004, normalBias: 0.006, radius: 3 });
  }

  build(M) {
    this.M = M;
    if (this.glowBoost > 1) M.mats.LampGlow.color.multiplyScalar(4);
    // The house throws shadows where the device affords it; the neighbors never do.
    this.house = new House(this.plotRoot, M, { cast: this.tier !== 'low', calm: this.calm });
    this.crane = new Crane(M, this.plotRoot, CRANE_AT);
    if (this.tier !== 'high') this.crane.root.traverse((o) => { o.castShadow = false; });
    this.crane.root.visible = false;
    if (CHRISTMAS) {
      const pts = [];
      [[0.035, 0.07], [0.095, 0.054], [0.15, 0.038], [0.198, 0.022]].forEach(([y, r], k) => {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + k * 0.6;
          pts.push(new THREE.Vector3(FIR.x + Math.cos(a) * (r + 0.006), y, FIR.z + Math.sin(a) * (r + 0.006)));
        }
      });
      this.firLights = makeBulbs(pts, { size: 0.0042, halo: 0.03 });
      this.firLights.visible = false;
      this.plotRoot.add(this.firLights);
    }
    // The weather of the place: in the windy hillside village it snows (the snow does not
    // settle, so the roofs and walls keep showing what was chosen).
    this.snow = makeSnowfall({ density: 0.6 });
    this.snow.density = this.round.brief.place.id === 'hill' ? (this.calm ? 0.2 : 0.45) : 0;
    this.group.add(this.snow.points);
    setSnowAmount(0);
    this.buildNeighbors(M);
    // Headset: a soft shadow under each plot, so the dioramas sit on the table or the floor.
    if (this.engine.isXR) {
      for (const root of [this.plotRoot, this.nb.root]) {
        const blob = contactShadow(0.62, 0.42);
        blob.position.set(root === this.plotRoot ? 0.06 : -0.06, -0.074, 0);
        blob.scale.set(1.25, 0.9, 1);
        root.add(blob);
      }
    }
    this.buildPanels();
  }

  // ---------- the neighbors ----------

  buildNeighbors(M) {
    const nb = (this.nb = { spent: 0, last: null });
    const root = (nb.root = new THREE.Group());
    root.userData.noFit = true;
    this.world.add(root);
    const inner = new THREE.Group(); // mirrored copy of the plot
    inner.scale.set(-1, 1, 1);
    root.add(inner);
    nb.house = new House(inner, M, { cast: false, calm: this.calm });
    nb.family = makeFamily();
    nb.family.group.position.set(-0.05, 0, 0.3);
    nb.family.group.scale.setScalar(1.5);
    const blob = contactShadow(0.07, 0.35);
    blob.position.y = 0.002;
    nb.family.group.add(blob);
    nb.family.group.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    root.add(nb.family.group);
  }

  /** The Winters build the same part (after the player's choice), with their own taste. */
  neighborBuilds() {
    const nb = this.nb;
    const plan = this.round.neighbor.ids;
    if (this.nbStep < DECISIONS.length) {
      const id = plan[this.nbStep];
      nb.house.build(DECISIONS[this.nbStep], id);
      nb.spent += OPTION[id].price;
      nb.last = id;
      this.nbStep += 1;
      if (Math.random() < 0.5) nb.family.wave();
    } else if (this.nbStep === DECISIONS.length) {
      plan.slice(DECISIONS.length).forEach((id, i) => this.delay(0.3 + i * 0.35, () => { if (!this.disposed) { nb.house.build('extras', id); nb.spent += OPTION[id].price; nb.last = id; this.redrawSign(); } }));
      this.nbStep += 1;
    }
    this.redrawSign();
  }

  // ---------- panels ----------

  buildPanels() {
    const ui = (o) => { o.userData.noFit = true; this.ui.add(o); return o; };
    const money = () => ({ round: this.round, spent: this.spent(), reserve: this.step < DECISIONS.length ? reserve(this.round, this.step) : 0 });
    this.brief = ui(briefPanel(0.62, BRIEF_H, money));
    this.briefSmall = { slim: ui(briefPanel(0.9, 0.225, money, 'slim')), col: ui(briefPanel(0.9, 0.375, money, true)), side: ui(briefPanel(0.7, 0.42, money, true)) };
    this.aiNote = ui(aiPanel(0.62, 0.34, () => this.aiState()));
    this.ask = ui(strip(1.5, 0.13, () => this.askState()));
    this.sign = ui(neighborSign(SIGN_W, SIGN_H, () => ({ last: this.nb.last, spent: this.nb.spent, budget: this.round.nbBrief.budget, needs: this.round.nbBrief.needs })));
    this.signSmall = ui(neighborSign(...SIGN_SMALL, () => ({ last: this.nb.last, spent: this.nb.spent, budget: this.round.nbBrief.budget, needs: this.round.nbBrief.needs }), true));
    const btn = (label, variant, onClick, w = 0.34) => ui(new Button(w, 0.1, { label, variant, labelSize: 'xr-text-sm', grow: false, onClick }));
    this.backBtn = btn(t('bricksBack'), 'secondary', () => this.back(), 0.28);
    this.goBtn = btn(t('bricksBuild'), 'primary', () => this.primary(), 0.44);
    this.labelMe = ui(strip(0.6, 0.09, () => ({ text: t('bricksYourHouse'), small: true, token: 'xr-bricks-you' })));
    this.labelNb = ui(strip(0.6, 0.09, () => ({ text: t('bricksWho_winter'), small: true, token: 'xr-bricks-neighbor' })));
    this.hint = ui(strip(1.5, 0.2, () => ({ text: this.mode === 'brief' ? `${t('bricksBriefHint')} ${t('bricksAiAboutShort', { n: this.ai.count })}` : '', small: true, scale: 0.95 })));
    for (const o of this.ui.children) o.visible = false;
  }

  /** The big button's text (also for the keyboard focus and screen readers). */
  setGo(key) {
    this.goBtn.opts.label = t(key);
    this.goBtn.userData.label = t(key);
    this.goBtn.redraw();
  }

  redrawSign() { this.sign.redraw(); this.signSmall.redraw(); }

  spent() { return priceOf(this.choices) + priceOf(this.extras); }

  left() { return this.round.brief.budget - this.spent(); }

  aiState() {
    const of = this.records.length;
    const followed = this.records.filter((r) => r.pick === r.aiTop).length;
    if (this.mode !== 'choose') return { count: this.ai.count, tip: null, followed, of };
    if (this.step < DECISIONS.length) return { count: this.ai.count, tip: [this.advice.find((f) => f.top).id], followed, of };
    const tips = this.advice.filter((f) => f.tip).map((f) => f.id);
    return { count: this.ai.count, tip: tips.length ? tips : null, noTip: !tips.length, followed, of };
  }

  askState() {
    if (this.mode === 'choose') {
      // Headset: the money in the question too (the brief stands off to the side there).
      const money = this.engine.isXR ? ` ${t('bricksLeftMoney', { n: euro(this.left()) })}.` : '';
      return { text: this.note?.sticky ? this.note.text : `${t(`bricksAsk_${STEPS[this.step]}`)}${money}`, small: this.step === DECISIONS.length || this.engine.touchUI, token: this.note?.sticky ? this.note.token : null };
    }
    if (this.note) return { text: this.note.text, token: this.note.token, small: this.engine.touchUI };
    return { text: '' };
  }

  // ---------- input ----------

  setupKeys() {
    const onKey = (e) => {
      if (this.disposed || this.engine.paused || this.engine.isXR || e.altKey || e.ctrlKey || e.metaKey) return;
      if (!['brief', 'choose', 'check'].includes(this.mode)) return;
      const k = e.key;
      if (/^[1-8]$/.test(k) && this.mode === 'choose') {
        const card = this.cards[Number(k) - 1];
        if (card) { e.preventDefault(); this.pick(card); }
      } else if (k.startsWith('Arrow') && this.mode === 'choose' && this.cards.length) {
        e.preventDefault();
        const cols = this.cardCols ?? this.cards.length;
        const i = this.cards.indexOf(this.engine.focus);
        const d = k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : k === 'ArrowUp' ? -cols : cols;
        const next = i < 0 ? 0 : (cols === 1 && (k === 'ArrowLeft' || k === 'ArrowRight') ? i : clamp(i + d, 0, this.cards.length - 1));
        this.engine.setFocus(this.cards[next]);
      } else if ((k === 'Enter' || k === ' ') && !this.engine.focus) {
        if (this.goBtn.visible) { e.preventDefault(); this.primary(); }
      } else if (k === 'Backspace' && this.backBtn.visible && !this.backBtn.state.disabled) {
        e.preventDefault();
        this.back();
      }
    };
    window.addEventListener('keydown', onKey);
    this.onSceneDispose(() => window.removeEventListener('keydown', onKey));
  }

  /** The big button: build (after the brief), confirm the extras, go on in the check. */
  primary() {
    if (this.mode === 'brief') this.beginChoosing();
    else if (this.mode === 'choose' && this.step === DECISIONS.length) this.confirmExtras();
    else if (this.mode === 'check') { if (this.check.shown < this.check.rows) this.check.shown = this.check.rows - 0.001; else this.finish(); }
  }

  // ---------- the round ----------

  start() {
    this.clearLayer();
    this.ready.then(() => { if (!this.disposed && this.mode === 'intro') this.begin(); });
  }

  /** The brief, large: who builds, where, the budget. One press and the building starts. */
  begin() {
    this.mode = 'brief';
    this.world.visible = true;
    this.ui.visible = true;
    this.startMusic(0);
    music.intensity = 0;
    this.refreshHud ??= this.hud(() => this.hudText());
    this.hudObjs = this.group.children.filter((o) => o.userData.hud);
    this.hudHome = this.hudObjs.map((o) => ({ o, pos: o.position.clone() }));
    if (!this.engine.isXR) this.app.echo?.suppress(true);
    this.setGo('bricksBuild');
    this.raiseCrane();
    this.refreshHud();
    this.relayout();
  }

  beginChoosing() {
    bsfx.pick();
    this.openStep();
  }

  hudText() {
    if (this.mode === 'over') return t('bricksName');
    if (this.mode === 'check' || this.mode === 'finale') return t('bricksHudCheck');
    return t('bricksHud', { n: Math.min(this.step + 1, STEPS.length), name: t(`bricksStep_${STEPS[this.step]}`), left: euro(this.left()) });
  }

  /** Which layout the cards use: a row (desktop), a column (phone upright), beside (phone sideways), or the headset. */
  kind() {
    if (this.engine.isXR) return 'xr';
    const a = window.innerWidth / window.innerHeight;
    if (a < 0.85) return 'col';
    return this.engine.touchUI && window.innerHeight < 520 ? 'side' : 'row';
  }

  /** Shows the cards of the current step with the adviser's forecasts. */
  openStep() {
    this.mode = 'choose';
    if (!this.note?.sticky) this.note = null;
    const extras = this.step === DECISIONS.length;
    if (!extras) {
      const room = this.left() - reserve(this.round, this.step + 1);
      this.lockedIds = this.round.catalogue[DECISIONS[this.step]].filter((o) => o.price > room).map((o) => o.id);
      this.advice = this.ai.advise(this.choices, this.lockedIds);
    } else if (!this.extrasAdvice) {
      this.extrasAdvice = this.ai.adviseExtras(this.choices, this.left());
      this.advice = this.extrasAdvice;
    } else this.advice = this.extrasAdvice;
    // What can no longer change becomes one mesh per material (few draw calls): everything but the last choice and the extras.
    this.house.freeze([DECISIONS[this.step - 1], 'extras']);
    this.nb.house.freeze();
    this.makeCards();
    this.setGo('bricksConfirm');
    this.backBtn.set({ disabled: this.step === 0 || this.undone.has(this.step - 1) });
    this.refreshPanels();
    this.relayout();
    if (this.engine.focus && !this.engine.isXR) this.engine.setFocus(null);
  }

  /** What a card says about itself right now (locked, selected, forecast, help). */
  cardState(o, i) {
    const extras = o.decision === 'extras';
    const selected = extras ? this.extras.includes(o.id) : undefined;
    const room = extras ? this.left() : this.left() - reserve(this.round, this.step + 1);
    const locked = !selected && o.price > room;
    const f = this.advice.find((a) => a.id === o.id);
    const s = { id: o.id, index: i + 1, locked, missing: locked ? o.price - room : 0, selected, forecast: f, compact: extras, words: this.easy };
    if (!extras) {
      const cheap = this.round.cheapest[o.decision];
      s.basic = cheap.id === o.id;
      s.more = s.basic ? 0 : o.price - cheap.price;
    }
    if (this.easy) {
      // Relaxed mode: the card says what it clashes with, or that it fulfills a wish.
      const mine = [...this.choices, ...this.extras].filter((id) => id !== o.id);
      const clash = mine.find((id) => clashes(id, o.id));
      const styles = mine.map((id) => OPTION[id].style).filter(Boolean);
      const main = styles.sort((a, b) => styles.filter((x) => x === b).length - styles.filter((x) => x === a).length)[0];
      if (clash) s.warn = t('bricksWarnClash', { a: optName(clash) });
      else if (o.style && main && o.style !== main) s.warn = t('bricksWarnStyle');
      else if (o.gives && this.round.brief.needs.includes(o.gives) && !needMet(o.gives, mine.map((id) => OPTION[id]))) s.good = t('bricksGoodWish');
    }
    return s;
  }

  makeCards() {
    for (const c of this.cards) { c.removeFromParent(); c.dispose(); }
    const extras = this.step === DECISIONS.length;
    const list = extras ? this.round.extras : this.round.catalogue[DECISIONS[this.step]];
    this.cardKind = this.kind();
    const [w, h] = CARD[this.cardKind][extras ? 1 : 0];
    this.cards = list.map((o, i) => {
      const card = new OptionCard(w, h, this.cardState(o, i), (c) => this.pick(c));
      card.userData.noFit = true;
      card.optId = o.id;
      this.ui.add(card);
      return card;
    });
  }

  refreshCards() {
    this.cards.forEach((c, i) => {
      const keep = { hover: c.state.hover, focus: c.state.focus };
      c.state = { ...this.cardState(OPTION[c.optId], i), ...keep };
      c.relabel();
      c.redraw();
    });
  }

  refreshPanels() {
    for (const p of [this.brief, this.briefSmall.slim, this.briefSmall.col, this.briefSmall.side, this.aiNote, this.ask, this.sign, this.signSmall]) p.redraw();
    this.refreshHud?.();
  }

  say(text, token = 'xr-panel-text', sticky = false) {
    this.note = { text, token, sticky };
    this.ask.redraw();
  }

  /** A card is pressed (a click, a tap, a number key, the trigger). */
  pick(card) {
    if (this.mode !== 'choose') return;
    const o = OPTION[card.optId];
    if (card.state.locked) {
      sfx.bounce?.();
      this.say(t('bricksNoMoney', { n: euro(card.state.missing) }), 'xr-danger', true);
      this.noteClear = this.time + 2.5;
      return;
    }
    if (o.decision === 'extras') this.toggleExtra(o);
    else this.choose(o);
  }

  /** One sentence right after a choice: what it means for the house so far. */
  feedback(o) {
    const mine = [...this.choices, ...this.extras].filter((id) => id !== o.id);
    const b = this.round.brief;
    const clash = mine.find((id) => clashes(id, o.id));
    const a = optName(o.id);
    if (clash) return [t('bricksFb_clash', { a: optName(clash), b: a }), 'xr-danger'];
    for (const k of b.place.weather) if (o.w?.[k] < 0) return [t('bricksFb_weatherBad', { a, w: t(`bricksWeather_${k}`) }), 'xr-danger'];
    if (o.gives && b.needs.includes(o.gives) && !needMet(o.gives, mine.map((id) => OPTION[id]))) return [t('bricksFb_wish', { need: t(`bricksNeed_${o.gives}`) }), 'xr-success'];
    for (const k of b.place.weather) if (o.w?.[k] > 0) return [t('bricksFb_weatherGood', { a, w: t(`bricksWeather_${k}`) }), 'xr-success'];
    const styles = mine.map((id) => OPTION[id].style).filter(Boolean);
    if (o.style && styles.length && styles.every((s) => s === o.style)) return [t('bricksFb_style', { a }), 'xr-success'];
    return [t('bricksFb_plain', { a }), 'xr-panel-text'];
  }

  /** A required part is chosen: it gets built, the neighbors build theirs, then the next step. */
  choose(o) {
    const open = this.round.catalogue[o.decision].filter((x) => !this.lockedIds.includes(x.id));
    const reach = (id) => bestFrom([...this.choices, id], this.round);
    const best = Math.max(...open.map((x) => reach(x.id)));
    const top = this.advice.find((f) => f.top).id;
    this.records.push({ aiTop: top, pick: o.id, aiBest: reach(top) >= best, pickBest: reach(o.id) >= best });
    const [text, token] = this.feedback(o);
    this.choices.push(o.id);
    this.mode = 'build';
    bsfx.pick();
    this.say(text, token, true);
    this.noteClear = this.time + 3.6;
    this.hideCards();
    const step = this.step;
    let time;
    if (o.decision === 'roof') time = this.craneRoof(o.id);
    else {
      time = this.house.build(o.decision, o.id);
      this.buildFx(o.decision, time);
    }
    if (this.nbStep <= step) this.delay(0.35, () => { if (!this.disposed) this.neighborBuilds(); });
    if (o.decision === 'garden') { this.parkCrane(); if (this.firLights) this.firLights.visible = this.house.firVisible; }
    this.step += 1;
    this.refreshPanels();
    this.relayout();
    this.delay(time + 0.25, () => { if (!this.disposed && this.mode === 'build') this.openStep(); });
  }

  /** An extra is switched on or off (as often as the player likes, until confirming). */
  toggleExtra(o) {
    if (this.extras.includes(o.id)) {
      this.extras = this.extras.filter((id) => id !== o.id);
      this.house.remove('extras', o.id);
      bsfx.undo();
      this.say(t('bricksFb_off', { a: optName(o.id) }), 'xr-panel-muted', true);
    } else {
      const [text, token] = this.feedback(o);
      this.extras.push(o.id);
      const time = this.house.build('extras', o.id);
      this.buildFx('extras', time);
      bsfx.pick();
      this.say(text, token, true);
    }
    this.noteClear = this.time + 3;
    this.refreshCards();
    this.refreshPanels();
  }

  /** Sound, dust and a little sparkle while a part appears. */
  buildFx(decision, time) {
    const at = HOUSE.clone().add(new THREE.Vector3(0, decision === 'garden' ? 0 : TOP * 0.5, decision === 'garden' ? 0.3 : 0));
    const knocks = this.calm ? 2 : decision === 'walls' ? 6 : 3;
    for (let i = 0; i < knocks; i++) this.delay((i / knocks) * time * 0.8, () => { if (!this.disposed) bsfx.place(); });
    this.delay(time * 0.75, () => {
      if (this.disposed) return;
      this.puffs.puff(at.clone().setY(0.02), { n: this.calm ? 4 : 10, spread: 0.2, size: 0.03 });
      if (!this.calm) this.burst(this.plotRoot.localToWorld(at.clone()), 'xr-bricks-puff', 10);
    });
  }

  /** "Back": the last required part goes away again and its money comes back (once per part). */
  back() {
    if (this.mode !== 'choose' || this.step === 0 || this.undone.has(this.step - 1)) return;
    for (const id of this.extras) this.house.remove('extras', id);
    this.extras = [];
    this.step -= 1;
    const id = this.choices.pop();
    this.records.pop();
    this.undone.add(this.step);
    this.extrasAdvice = null;
    this.house.remove(DECISIONS[this.step]);
    if (DECISIONS[this.step] === 'garden' && this.firLights) this.firLights.visible = false;
    if (DECISIONS[this.step] === 'roof') this.crane.setSlings(null);
    bsfx.undo();
    this.note = null;
    this.say(t('bricksUndo', { a: optName(id) }), 'xr-panel-muted', true);
    this.noteClear = this.time + 3;
    this.openStep();
  }

  hideCards() {
    for (const c of this.cards) c.visible = false;
    if (this.engine.focus && this.cards.includes(this.engine.focus)) this.engine.setFocus(null);
  }

  // ---------- the crane ----------

  craneMove(yaw, reach, drop, dur) {
    const c = this.crane;
    const y0 = c.yaw;
    const r0 = c.reach;
    const d0 = c.drop;
    let dy = yaw - y0;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    bsfx.motor();
    return new Promise((res) => { this.tween(dur, (k) => { c.yaw = y0 + dy * k; c.reach = r0 + (reach - r0) * k; c.drop = d0 + (drop - d0) * k; }, { ease, onDone: res }); });
  }

  raiseCrane() {
    const r = this.crane.root;
    r.visible = true;
    r.scale.set(1, 0.02, 1);
    bsfx.motor();
    this.tween(this.calm ? 1.4 : 0.9, (k) => r.scale.set(1, Math.max(0.02, k), 1), { ease });
  }

  parkCrane() {
    const c = this.crane;
    if (!c.root.visible) return;
    this.tween(1.0, (k) => c.root.scale.set(1, Math.max(0.02, 1 - k), 1), { ease, onDone: () => { c.root.visible = false; } });
  }

  /** The crane lowers the roof onto the walls by itself. Returns the time it takes (s). */
  craneRoof(id) {
    const c = this.crane;
    const slow = this.calm ? 1.3 : 1;
    this.house.build('roof', id, { held: true });
    const part = this.house.parts.roof.home;
    const tgtY = HOUSE.y + this.house.roofTop + 0.012; // where the hook ends, plot-local
    const aim = c.aimAt(HOUSE.x, HOUSE.z);
    this.roofHang = { part, tgtY };
    c.yaw = aim.yaw + 0.5;
    c.reach = aim.reach;
    c.drop = 0.03;
    part.scale.setScalar(0.001);
    this.tween(0.25, (k) => part.scale.setScalar(Math.max(0.001, k)));
    (async () => {
      await this.craneMove(aim.yaw, aim.reach, 0.03, 0.55 * slow);
      await this.craneMove(aim.yaw, aim.reach, c.dropTo(tgtY), 0.75 * slow);
      if (this.disposed) return;
      this.roofHang = null;
      part.position.y = 0;
      c.setSlings(null);
      bsfx.land();
      const at = HOUSE.clone().add(new THREE.Vector3(0, TOP, 0));
      for (const sx of [-0.22, 0.22]) this.puffs.puff(at.clone().add(new THREE.Vector3(sx, 0, 0.15)), { n: this.calm ? 3 : 6, spread: 0.06 });
      if (!this.calm) this.burst(this.plotRoot.localToWorld(at.clone()), 'xr-bricks-puff', 14);
      this.house.changed += 1;
      await this.craneMove(aim.yaw + 0.9, 0.2, 0.05, 0.5);
    })();
    return 1.4 * slow;
  }

  /** While the roof hangs on the hook it follows it, held by two slings. */
  updateHang() {
    const h = this.roofHang;
    if (!h) return;
    const hp = this.crane.hookPoint();
    h.part.position.y = Math.max(0, hp.y - h.tgtY);
    const top = new THREE.Vector3(0, HOUSE.y + this.house.roofTop + h.part.position.y - 0.02, HOUSE.z);
    this.crane.setSlings(ROOF_SLINGS.map((s) => top.clone().add(s)));
    this.house.changed += 1;
  }

  // ---------- the end of the building, the check ----------

  confirmExtras() {
    if (this.mode !== 'choose') return;
    this.mode = 'finale';
    bsfx.pick();
    this.hideCards();
    this.note = null;
    this.say(t('bricksFinished'), 'xr-success');
    this.neighborBuilds();
    this.parkCrane();
    // What the adviser recommended among the extras, and whether that fitted this family.
    const all = [...this.choices, ...this.extras];
    const tips = this.extrasAdvice.filter((f) => f.tip).map((f) => f.id);
    const base = judge(all, this.round);
    const fitted = tips.filter((id) => {
      const bought = base.bought.find((b) => b.id === id);
      if (bought) return bought.gain > 0;
      const withIt = judge([...all, id], this.round);
      return withIt.rows.slice(0, 4).reduce((s, r) => s + r.score, 0) > base.rows.slice(0, 4).reduce((s, r) => s + r.score, 0);
    });
    this.extraRecord = { tips, fitted: fitted.length, taken: tips.filter((id) => this.extras.includes(id)).length };
    this.result = base;
    this.refreshPanels();
    this.relayout();
    // Lights on, the door opens, the neighbors come out to look.
    bsfx.lights();
    this.tween(1.2, (k) => { this.house.lights(1.6 * this.glowBoost * k); this.nb.house.lights(1.4 * this.glowBoost * k); });
    this.delay(0.6, () => { if (!this.disposed) { bsfx.door(); this.tween(1.0, (k) => this.house.openDoor(k), { ease }); } });
    this.smoking = !!this.house.smokeAt;
    this.nb.family.cheer();
    this.burst(this.plotRoot.localToWorld(HOUSE.clone().add(new THREE.Vector3(0, TOP + 0.2, 0))), 'xr-warning', 30);
    this.delay(this.calm ? 2.8 : 2.2, () => { if (!this.disposed) this.openCheck(); });
  }

  openCheck() {
    this.mode = 'check';
    this.house.freeze();
    this.nb.house.freeze();
    const me = this.result;
    const them = this.round.neighbor.result;
    const diff = me.total - them.total;
    const names = (list) => list.map((b) => optName(b.id)).join(', ');
    const paid = me.bought.filter((b) => b.gain > 0);
    const not = me.bought.filter((b) => b.gain <= 0);
    const tip = bestChange([...this.choices, ...this.extras], this.round);
    if (tip) this.tipText = t(`bricksTip_${tip.key}`, { a: optName(tip.a), b: tip.b ? optName(tip.b) : '', n: points(tip.gain) });
    else if (this.round.best > me.total) {
      // No single change helps: what the most coherent house for this money would have had instead.
      const mine = [...this.choices, ...this.extras];
      const other = bestHouse(this.round).filter((id) => !mine.includes(id)).slice(0, 3);
      this.tipText = t('bricksTip_plan', { list: other.map(optName).join(', '), n: points(this.round.best - me.total) });
    } else this.tipText = t('bricksTipNone');
    this.moneyText = [paid.length ? t('bricksPaid', { list: names(paid) }) : '', not.length ? t('bricksNotPaid', { list: names(not) }) : '', !me.bought.length ? t('bricksBoughtNone') : ''].filter(Boolean).join('. ');
    const b = this.round.brief.budget;
    const lines = [
      `${t('bricksMoneyLine', { who: t('bricksYou'), spent: euro(me.price), budget: euro(b) })}. ${this.moneyText}`,
      this.tipText,
      `${t('bricksMoneyLine', { who: t('bricksWho_winter'), spent: euro(them.price), budget: euro(b) })}. ${them.bought.length ? t('bricksBought', { list: names(them.bought) }) : t('bricksBoughtNone')}`,
    ];
    const verdict = diff > 0 ? t('bricksWin', { n: points(diff) }) : diff < 0 ? t('bricksLose', { n: points(-diff) }) : t('bricksTie');
    this.checkKind = this.engine.isXR ? 'xr' : this.kind() === 'col' ? 'tall' : this.kind() === 'side' ? 'mid' : 'wide';
    // A phone held sideways has room for the player's money and the tip only (what the neighbors bought stands on their plot).
    this.check = { me, them, shown: 0, rows: me.rows.length + 1, lines: this.checkKind === 'mid' ? lines.slice(0, 2) : lines, verdict, heard: 0 };
    this.checkPanel = checkPanel(this.checkKind, () => this.check);
    this.checkPanel.userData.noFit = true;
    this.ui.add(this.checkPanel);
    this.setGo('bricksSkip');
    this.note = null;
    if (this.engine.isXR) this.sideBySideXR();
    this.refreshPanels();
    this.relayout();
    if (diff > 0) { this.nb.family.clap(); } else this.nb.family.cheer();
  }

  /** The rows of the check appear one after the other (a press shows all at once). */
  updateCheck(dt) {
    const c = this.check;
    if (!c || this.mode !== 'check') return;
    const before = c.shown;
    if (c.shown < c.rows) c.shown = Math.min(c.rows, c.shown + dt / (this.calm ? 1.1 : 0.8));
    if (Math.floor(c.shown) > c.heard && c.shown < c.rows) { c.heard = Math.floor(c.shown); bsfx.row(); }
    if (c.shown !== before || !c.drawn) {
      c.drawn = true;
      this.checkPanel.redraw();
      if (c.shown >= c.rows && before < c.rows) {
        this.setGo('bricksNext');
        if (c.me.total > c.them.total) { sfx.powerup?.(); this.burst(this.checkPanel.getWorldPosition(new THREE.Vector3()), 'xr-success', 26); } else sfx.correct?.();
      }
    }
  }

  finish() {
    if (this.mode === 'over') return;
    this.mode = 'over';
    this.app.echo?.suppress(false);
    this.exitPlayView();
    if (this.engine.isXR) for (const { o, pos } of this.hudHome ?? []) { o.position.copy(pos); o.quaternion.identity(); }
    this.ui.visible = false;
    if (!this.engine.isXR && !this.engine.touchUI) for (const o of this.hudObjs ?? []) o.visible = false;
    this.refreshHud?.();
    if (this.engine.isXR) {
      // Both houses move aside so the results can be read.
      const p0 = this.plotRoot.position.clone();
      const p1 = new THREE.Vector3(-1.05, this.eye - 0.8, -0.85);
      this.tween(1.2, (k) => { this.plotRoot.position.lerpVectors(p0, p1, k); this.plotRoot.rotation.y = 0.75 * k; }, { ease });
      this.nb.root.visible = false;
    } else this.world.visible = false;
    const me = this.result;
    const them = this.round.neighbor.result;
    const diff = me.total - them.total;
    const score = clamp(Math.round(me.total * RATE + (diff > 0 ? BEAT + Math.min(25, diff) * LEAD : 0)), 0, 5000);
    const shown = Math.round(score * assist.scoreFactor);
    const marks = RATING.map((v) => Math.round(v * assist.scoreFactor));
    const step = shown >= marks[1] ? 2 : shown >= marks[0] ? 1 : 0;
    const rating = step === 2 ? t('bricksRateTop', { name: t('bricksRate_2') }) : t('bricksRateNext', { name: t(`bricksRate_${step}`), n: marks[step] - shown, next: t(`bricksRate_${step + 1}`) });
    const aiBest = this.records.filter((r) => r.aiBest).length;
    const followed = this.records.filter((r) => r.pick === r.aiTop).length;
    const x = this.extraRecord;
    const learned = [
      { q: t('bricksLearn1Q'), a: t('bricksLearn1A', { a: aiBest, b: followed }) + (x.tips.length ? t('bricksLearn1X', { n: x.tips.length, m: x.fitted }) : '') },
      { q: t('bricksLearn2Q'), a: t('bricksLearn2A') },
      { q: t('bricksLearn3Q'), a: `${this.moneyText}. ${this.tipText}` },
    ];
    this.results({
      gameKey: 'bricks',
      score,
      correct: this.records.filter((r) => r.pickBest).length,
      total: DECISIONS.length,
      line: `${rating}\n${t('bricksLine', { a: me.total, b: them.total, c: t(diff > 0 ? 'bricksBeat' : diff < 0 ? 'bricksNotBeat' : 'bricksTie') })}`,
      learned,
      onAgain: () => { skipIntro = true; this.app.startGame('bricks'); },
    });
  }

  // ---------- frame loop ----------

  update(dt) {
    this.time += dt;
    if (!this.M) return;
    if (this.note?.sticky && this.noteClear && this.time > this.noteClear) { this.note = null; this.noteClear = 0; this.ask.redraw(); }
    this.house.update(dt);
    this.nb.house.update(dt);
    this.updateHang();
    this.crane.sway = this.calm ? 0 : 0.4;
    this.crane.apply(this.time);
    this.puffs.update(dt);
    this.firLights?.userData.tick(this.time);
    this.nb.family.tick(dt, this.time);
    if (this.smoking && (this.smokeT = (this.smokeT ?? 0) - dt) <= 0) {
      this.smokeT = this.calm ? 0.9 : 0.45;
      this.puffs.smoke(this.house.smokeAt.clone().add(HOUSE));
    }
    this.updateCheck(dt);
    // 'medium': redraw the frozen shadow map while the house changes.
    if (this.shadowSig !== undefined && this.shadowSig !== this.house.changed) {
      this.shadowSig = this.house.changed;
      this.shadowFrames = 20;
    }
    if (this.shadowFrames > 0) { this.shadowFrames -= 1; this.engine.renderer.shadowMap.needsUpdate = true; }
    this.snow.setGround(this.engine.floorY - this.engine.root.position.y);
    const p = this.plotRoot.position;
    this.snow.setDisc(p.x + 0.06, p.z, 0.55, p.y + 0.002);
    this.snow.update(dt);
    if (this.engine.isXR) this.placeXR();
    else this.previewCamera(dt);
  }

  relayout() { this.layoutKey = ''; }

  // ---------- browser view ----------

  /** Puts an object at a screen spot (px), facing the camera (turned by tilt), ppm pixels per meter. */
  pin(obj, x, y, ppm, dist = 0.5, tilt = null) {
    const cam = this.engine.camera;
    const W = window.innerWidth;
    const Hh = window.innerHeight;
    const camPos = cam.getWorldPosition(new THREE.Vector3());
    const camQ = cam.getWorldQuaternion(new THREE.Quaternion());
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camQ);
    const pt = new THREE.Vector3((x / W) * 2 - 1, -(y / Hh) * 2 + 1, 0.5).unproject(cam);
    const dir = pt.sub(camPos).normalize();
    const world = camPos.clone().addScaledVector(dir, dist / Math.max(0.2, dir.dot(fwd)));
    const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const native = Hh / (2 * dist * tan);
    obj.parent.updateMatrixWorld(true);
    obj.position.copy(obj.parent.worldToLocal(world));
    const pq = obj.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
    obj.quaternion.copy(pq.multiply(camQ));
    if (tilt) obj.quaternion.multiply(tilt);
    obj.scale.setScalar(ppm / native);
  }

  /** Pins a panel into a rectangle (px), as large as fits, centered. Returns its px per meter. */
  fit(obj, r, maxPpm = Infinity, dist = 0.5) {
    let ppm = Math.min(r.w / obj.w, r.h / obj.h, maxPpm);
    if (r.wrap) {
      // A strip of text: a fixed text size, wrapped to the room it has.
      ppm = r.wrap;
      const wrapW = r.w / ppm;
      if (Math.abs((obj.wrapW ?? 0) - wrapW) > 0.01) { obj.wrapW = wrapW; obj.redraw(); }
    }
    obj.visible = true;
    this.pin(obj, r.x + r.w / 2, r.y + r.h / 2, ppm, dist);
    return ppm;
  }

  /**
   * The screen layout (CSS px) for the current mode: where the plot is seen, and where every
   * panel goes. Desktop: brief and adviser at the left, the house in the middle, the neighbors
   * at the right, the cards in a row below. Phone upright: brief strip, house with the
   * neighbors beside it, cards in a column. Phone sideways: brief and neighbors at the left, the
   * house in the middle, the cards at the right.
   */
  layout() {
    const W = window.innerWidth;
    const Hh = window.innerHeight;
    const touch = this.engine.touchUI;
    const ins = this.engine.insets();
    const m = 8;
    const kind = this.kind();
    let top = touch ? ins.top : 0;
    let hud = null;
    if (!touch) {
      // The app's close button sits at the top right of the page: the row stays left of it.
      const free = W - 2 * m - 150;
      const rowW = clamp(free, 300, 700);
      const ppm = rowW / 1.27;
      hud = { ppm, x0: m + Math.max(0, (free - rowW) / 2), y: m };
      top = m + 0.15 * ppm + 6;
    }
    const out = { W, Hh, kind, hud, show: {} };
    const extras = this.step === DECISIONS.length;
    const n = this.cards.length;
    const [cw, ch] = CARD[kind][extras ? 1 : 0];
    if (this.mode === 'brief') {
      const pw = Math.min(W - 2 * m, 460, ((Hh - top - 170) / BRIEF_H) * 0.62);
      const ph = (pw / 0.62) * BRIEF_H;
      const y0 = top + Math.max(m, (Hh - top - ph - 150) / 2);
      out.show.brief = { x: (W - pw) / 2, y: y0, w: pw, h: ph };
      out.show.hint = { x: m, y: y0 + ph + 4, w: Math.min(W - 2 * m, 620), h: 84, wrap: kind === 'row' ? 460 : 400 };
      out.show.hint.x = (W - out.show.hint.w) / 2;
      out.show.go = { x: W / 2 - 110, y: y0 + ph + 92, w: 220, h: 50 };
      out.plot = { x: 0, y: top, w: W, h: Hh - top };
      out.dim = true;
      return out;
    }
    if (this.mode === 'check' || this.mode === 'over') {
      const [pw, ph] = CHECK_SIZE[this.checkKind];
      const btnH = 50;
      const availH = Hh - top - btnH - 3 * m;
      const housesMin = kind === 'side' ? 0 : kind === 'col' ? 120 : 190;
      const ppm = Math.min((W - 2 * m) / pw, (availH - housesMin) / ph, kind === 'row' ? 560 : 460);
      const h = ph * ppm;
      const w = pw * ppm;
      const housesH = availH - h;
      out.plot = housesH > 80 ? { x: 0, y: top, w: W, h: housesH } : null;
      out.both = true;
      out.show.check = { x: (W - w) / 2, y: top + (out.plot ? housesH : m) + m, w, h };
      if (out.plot) {
        const lw = Math.min(170, W * 0.3);
        out.show.labelMe = { x: W * 0.27 - lw / 2, y: top + 2, w: lw, h: 30, wrap: kind === 'row' ? 420 : 340 };
        out.show.labelNb = { x: W * 0.73 - lw / 2, y: top + 2, w: lw, h: 30, wrap: kind === 'row' ? 420 : 340 };
      }
      out.show.go = { x: W / 2 - 110, y: Hh - btnH - m, w: 220, h: btnH - 4 };
      return out;
    }
    const cardsOn = this.mode === 'choose';
    if (kind === 'row') {
      const cols = extras ? 4 : 3;
      const rows = extras ? 2 : 1;
      const cardW = Math.min((W - (cols + 1) * m) / cols, extras ? 300 : 370, (((Hh - top) * (extras ? 0.2 : 0.33)) / ch) * cw);
      const cardH = (cardW / cw) * ch;
      // When the house is finished, it gets the room of the cards too.
      const cardsH = this.mode === 'finale' ? 0 : rows * cardH + (rows - 1) * m;
      const cardsY = Hh - m - cardsH;
      const x0 = (W - cols * cardW - (cols - 1) * m) / 2;
      out.cards = Array.from({ length: n }, (_, i) => ({ x: x0 + (i % cols) * (cardW + m), y: cardsY + Math.floor(i / cols) * (cardH + m), w: cardW, h: cardH }));
      out.cols = cols;
      const askH = 46;
      const askY = cardsY - askH - 2;
      const colH = askY - top - m;
      const leftW = Math.min(clamp(W * 0.27, 220, 360), (colH / BRIEF_H) * 0.62);
      const k = leftW / 0.62;
      out.show.brief = { x: m, y: top + m / 2, w: leftW, h: BRIEF_H * k };
      const rightW = clamp(W * 0.22, 190, 330);
      const signH = (rightW / SIGN_W) * SIGN_H;
      const aiH = (rightW / 0.62) * 0.34;
      out.show.sign = { x: W - m - rightW, y: top + m / 2, w: rightW, h: signH };
      out.pip = { x: W - m - rightW, y: top + m + signH, w: rightW, h: colH - signH - aiH - m };
      out.show.ai = { x: W - m - rightW, y: askY - aiH - m / 2, w: rightW, h: aiH };
      out.plot = { x: leftW + 2 * m, y: top, w: W - leftW - rightW - 4 * m, h: askY - top };
      out.show.back = { x: m, y: askY + 2, w: 120, h: askH - 6 };
      out.show.ask = { x: 140, y: askY, w: W - 280 - (extras ? 250 : 0), h: askH, wrap: 480 };
      if (extras) out.show.go = { x: W - m - 240, y: askY + 2, w: 240, h: askH - 6 };
    } else if (kind === 'col') {
      const cols = extras ? 2 : 1;
      const rows = extras ? 4 : 3;
      const cardW = (W - (cols + 1) * m) / cols;
      const slim = extras && cardsOn;
      const briefH = ((W - 2 * m) / 0.9) * (slim ? 0.225 : 0.375);
      const askH = 48;
      const cardH = Math.min((cardW / cw) * ch, (Hh - top - briefH - askH - (slim ? 120 : 175) - (rows + 3) * m) / rows);
      const cardsH = this.mode === 'finale' ? 0 : rows * cardH + (rows - 1) * (m - 2);
      const cardsY = Hh - m - cardsH;
      out.cards = Array.from({ length: n }, (_, i) => ({ x: m + (i % cols) * (cardW + m), y: cardsY + Math.floor(i / cols) * (cardH + m - 2), w: cardW, h: cardH }));
      out.cols = cols;
      out.show[slim ? 'briefSlim' : 'briefCol'] = { x: m, y: top + 2, w: W - 2 * m, h: briefH };
      const askY = cardsY - askH - 2;
      const y0 = top + briefH + m;
      const signW = 150;
      const signH = (signW / SIGN_SMALL[0]) * SIGN_SMALL[1];
      out.plot = { x: 0, y: y0, w: W - signW * 0.8, h: askY - y0 - 30 };
      out.show.signSmall = { x: W - m - signW, y: y0, w: signW, h: signH };
      out.pip = { x: W - m - signW, y: y0 + signH, w: signW, h: askY - y0 - signH - 30 };
      out.show.ask = { x: m, y: askY - 34, w: W - 2 * m, h: 34, wrap: 400 };
      out.show.back = { x: m, y: askY, w: 110, h: askH - 4 };
      if (extras) out.show.go = { x: W - m - 190, y: askY, w: 190, h: askH - 4 };
    } else {
      // A phone held sideways: the cards at the right, the brief and the neighbors at the left.
      const cols = extras ? 2 : 1;
      const rows = extras ? 4 : 3;
      const availH = Hh - top - m;
      const cardH = (availH - (rows - 1) * 5) / rows;
      const cardW = Math.min((cardH / ch) * cw, extras ? 190 : 330);
      const colW = cols * cardW + (cols - 1) * 5;
      const x0 = W - m - colW;
      out.cards = Array.from({ length: n }, (_, i) => ({ x: x0 + (i % cols) * (cardW + 5), y: top + Math.floor(i / cols) * (cardH + 5), w: cardW, h: cardH }));
      out.cols = cols;
      const leftW = Math.min(240, (W - colW) * 0.5);
      const briefH = (leftW / 0.7) * 0.42;
      out.show.briefSide = { x: m, y: top, w: leftW, h: briefH };
      const signW = Math.min(150, leftW * 0.62);
      const signH = (signW / SIGN_SMALL[0]) * SIGN_SMALL[1];
      out.show.signSmall = { x: m, y: top + briefH + 4, w: signW, h: signH };
      out.pip = { x: m + 104, y: top + briefH + signH * 0.7, w: leftW - 104, h: availH - briefH - signH * 0.7 };
      out.show.back = { x: m, y: Hh - m - 46, w: 100, h: 46 };
      const px = leftW + 2 * m;
      const pw = x0 - px - m;
      // The message above the house; with the extras, the button to confirm below it.
      out.show.ask = { x: px, y: extras ? top : Hh - m - 44, w: pw, h: 44, wrap: 350 };
      if (extras) out.show.go = { x: px + Math.max(0, (pw - 220) / 2), y: Hh - m - 46, w: Math.min(220, pw), h: 46 };
      out.plot = { x: px, y: top + (extras ? 44 : 0), w: pw, h: availH - 46 - (extras ? 44 : 0) };
    }
    if (!cardsOn) { out.cards = []; delete out.show.go; delete out.show.back; }
    return out;
  }

  /** The browser's view: the camera frames the plot inside its part of the screen; the panels are pinned around it. */
  previewCamera(dt) {
    const e = this.engine;
    const cam = e.camera;
    if (!['brief', 'choose', 'build', 'finale', 'check'].includes(this.mode)) return;
    e.fitEnabled = false;
    this.viewOn = true;
    if (this.mode === 'choose' && this.cardKind !== this.kind()) this.makeCards(); // the window was resized or the phone turned
    const lay = this.layout();
    const both = !!lay.both;
    const R = new THREE.Quaternion().setFromEuler(new THREE.Euler(both ? -0.44 : -0.47, both ? 0 : 0.06, 0, 'YXZ'));
    const Ri = R.clone().invert();
    // The house with room for an extension at the left, the carport at the right, and the crane while it works.
    const tall = this.crane?.root.visible && (this.step <= 1 || !!this.roofHang);
    const box = both ? [[-0.5, 1.82], [0, 0.42], [-0.36, 0.36]] : [[-0.5, 0.6], [-0.02, tall ? 0.6 : 0.42], [-0.34, 0.38]];
    const C = new THREE.Vector3((box[0][0] + box[0][1]) / 2, (box[1][0] + box[1][1]) / 2, (box[2][0] + box[2][1]) / 2);
    this.plotRoot.updateMatrixWorld(true);
    const Cw = this.plotRoot.localToWorld(C.clone());
    const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const plot = lay.plot ?? { x: 0, y: -lay.Hh, w: lay.W, h: lay.Hh * 0.8 };
    const tx = (tan * plot.w) / lay.Hh / 1.01;
    const ty = (tan * plot.h) / lay.Hh / 1.01;
    let need = 0.3;
    const q = new THREE.Vector3();
    for (let i = 0; i < 8; i++) {
      q.set(box[0][i & 1], box[1][(i >> 1) & 1], box[2][(i >> 2) & 1]);
      this.plotRoot.localToWorld(q).sub(Cw).applyQuaternion(Ri);
      need = Math.max(need, q.z + Math.abs(q.x) / tx, q.z + Math.abs(q.y) / ty);
    }
    // Calm motion: the view does not glide, it is simply there.
    const k = this.camD === undefined || this.calm ? 1 : Math.min(1, dt * 4);
    this.camD = (this.camD ?? need) + (need - (this.camD ?? need)) * k;
    cam.position.copy(Cw).add(new THREE.Vector3(0, 0, this.camD).applyQuaternion(R));
    cam.quaternion.copy(R);
    if (cam.fov !== 60) cam.fov = 60;
    const cx = plot.x + plot.w / 2;
    const cy = plot.y + plot.h / 2;
    cam.setViewOffset(lay.W, lay.Hh, lay.W / 2 - cx, lay.Hh / 2 - cy, lay.W, lay.Hh);
    cam.updateMatrixWorld(true);
    if (lay.hud) {
      for (const o of this.hudObjs ?? []) {
        const isInfo = o.w > 0.5;
        const x = isInfo ? lay.hud.x0 + (0.98 / 2) * lay.hud.ppm : lay.hud.x0 + (1.27 - 0.13) * lay.hud.ppm;
        this.pin(o, x, lay.hud.y + 0.075 * lay.hud.ppm, lay.hud.ppm, 0.45);
      }
    }
    // Panels: only those the layout names are shown.
    const s = lay.show;
    const set = (obj, r, max) => { if (r) this.fit(obj, r, r.max ?? max); else obj.visible = false; };
    set(this.brief, s.brief);
    set(this.briefSmall.col, s.briefCol);
    set(this.briefSmall.slim, s.briefSlim);
    set(this.briefSmall.side, s.briefSide);
    set(this.aiNote, s.ai);
    set(this.ask, s.ask);
    set(this.hint, s.hint);
    set(this.labelMe, s.labelMe);
    set(this.labelNb, s.labelNb);
    set(this.sign, s.sign);
    set(this.signSmall, s.signSmall);
    set(this.backBtn, s.back);
    set(this.goBtn, s.go);
    if (this.checkPanel) set(this.checkPanel, s.check);
    this.cardCols = lay.cols;
    this.cards.forEach((c, i) => { const r = lay.cards?.[i]; if (r) this.fit(c, r); else c.visible = false; });
    // The neighbors: a little picture of their plot beside the house; in the check they stand next to it.
    const nb = this.nb;
    if (both) {
      nb.root.visible = !!lay.plot;
      nb.root.position.copy(this.plotRoot.position).add(new THREE.Vector3(1.2, 0, 0));
      nb.root.quaternion.identity();
      nb.root.scale.setScalar(1);
    } else if (lay.pip && lay.pip.h > 44) {
      const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.52, -0.2, 0, 'YXZ'));
      const ppm = Math.min(lay.pip.w / 1.45, lay.pip.h / 0.8);
      nb.root.visible = true;
      this.pin(nb.root, lay.pip.x + lay.pip.w / 2, lay.pip.y + lay.pip.h / 2 + ppm * 0.2, ppm, 0.6, tilt);
    } else nb.root.visible = false;
    this.world.visible = !!lay.plot;
  }

  exitPlayView() {
    if (this.engine.isXR || !this.viewOn) return;
    this.viewOn = false;
    const cam = this.engine.camera;
    cam.clearViewOffset();
    cam.rotation.set(0, 0, 0);
    this.engine.fitEnabled = true;
    for (const { o, pos } of this.hudHome ?? []) { o.position.copy(pos); o.quaternion.identity(); o.scale.setScalar(1); }
  }

  // ---------- headset (AR and VR) ----------

  /**
   * The plot stands at table height within reach, the neighbors' plot smaller to the left
   * behind it. The cards hang on an arc at eye height about a meter away (pointing and pressing
   * reaches them), the brief to the left, the adviser to the right, nothing behind the player.
   * Panels are a little larger than their drawing size, so no text is below the smallest size.
   */
  placeXR() {
    const key = `${this.mode}|${this.step}|${this.cards.length}|${this.checkPanel ? 1 : 0}`;
    if (key === this.layoutKey) return;
    this.layoutKey = key;
    const S = 1.12;
    const eye = this.eye;
    const arc = (o, angle, y, dist = 1.05, scale = S) => { o.visible = true; o.scale.setScalar(scale); placeOnArc(o, angle, y, dist); };
    for (const o of this.ui.children) o.visible = false;
    const nb = this.nb;
    // The status bar and the menu button hang up at the left, clear of the cards.
    for (const o of this.hudObjs ?? []) placeOnArc(o, o.w > 0.5 ? -1.5 : -0.92, eye + 0.82, 1.05);
    if (this.mode === 'brief') {
      arc(this.brief, 0, eye + 0.3, 1.0);
      arc(this.hint, 0, eye - 0.12, 0.98);
      arc(this.goBtn, 0, eye - 0.27, 0.95, 1.3);
    } else if (this.mode === 'check') {
      arc(this.checkPanel, 0, eye + 0.36, 1.2, 1.12);
      arc(this.labelMe, -0.45, eye - 0.16, 1.0);
      arc(this.labelNb, 0.62, eye - 0.16, 1.0);
      arc(this.goBtn, 0, eye - 0.16, 1.1, 1.3);
    } else {
      arc(this.brief, -1.18, eye + 0.12, 1.0);
      arc(this.aiNote, 1.15, eye + 0.25, 1.0);
      arc(this.ask, 0, eye + (this.step === DECISIONS.length && this.mode === 'choose' ? 0.8 : 0.56), 1.05);
      if (this.mode === 'choose') {
        const extras = this.step === DECISIONS.length;
        if (extras) {
          // Three columns: eight extras and the button to confirm in the ninth place.
          this.cards.forEach((c, i) => arc(c, ((i % 3) - 1) * 0.6, eye + 0.55 - Math.floor(i / 3) * 0.335));
          arc(this.goBtn, 0.6, eye + 0.55 - 2 * 0.335, 1.05, 1.3);
          this.cardCols = 3;
        } else {
          this.cards.forEach((c, i) => arc(c, (i - 1) * 0.68, eye + 0.16));
          this.cardCols = 3;
        }
        arc(this.backBtn, -1.18, eye - 0.36, 1.0, 1.3);
      }
    }
    if (this.mode !== 'check') {
      nb.root.position.set(-0.98, eye - 0.66, -1.12);
      nb.root.rotation.set(0, 0.55, 0);
      nb.root.scale.setScalar(0.55);
      if (this.mode !== 'brief') { this.sign.visible = true; this.sign.scale.setScalar(S); this.sign.position.set(-0.98, eye - 0.28, -1.12); this.sign.rotation.set(0, 0.7, 0); }
    }
  }

  /** The check in the headset: the neighbors' plot comes forward and stands beside the player's. */
  sideBySideXR() {
    const nb = this.nb;
    const p0 = this.plotRoot.position.clone();
    const p1 = new THREE.Vector3(-0.32, this.eye - PLOT_DROP, PLOT_Z - 0.06);
    const n0 = nb.root.position.clone();
    const n1 = new THREE.Vector3(0.6, this.eye - PLOT_DROP, PLOT_Z - 0.12);
    const s0 = nb.root.scale.x;
    const r0 = nb.root.rotation.y;
    const go = (k) => { this.plotRoot.position.lerpVectors(p0, p1, k); nb.root.position.lerpVectors(n0, n1, k); nb.root.scale.setScalar(s0 + (0.62 - s0) * k); nb.root.rotation.y = r0 + (-0.3 - r0) * k; };
    if (this.calm) go(1); else this.tween(1.0, go, { ease });
  }

  dispose() {
    this.mode = 'over';
    this.app.echo?.suppress(false);
    this.exitPlayView();
    setSnowAmount(0.6);
    for (const c of this.cards) c.dispose();
    for (const o of this.ui?.children ?? []) o.dispose?.();
    super.dispose();
  }
}
