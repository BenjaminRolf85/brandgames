// "Stein auf Stein" / "Brick by Brick": a decision game about building a house, and about what
// the money is spent on. A brief says who builds, where, and how much money there is (their
// savings plus a loan). The player only decides: six required parts (walls, roof, windows, front
// door, heating, garden), each from three cards with a price, and the extras, which lie on a
// wish list from the first step on: an extra can be earmarked at any time, its money is then set
// aside, and at the end the list is confirmed or changed. The budget pays for the basic version
// and two or three things more and cannot be overdrawn: cards that are too expensive are
// locked, the money for the cheapest remaining parts stays reserved. Every card shows what its
// price buys in the check's own criteria (arrows up and down), a live meter shows after every
// choice how coherent the house is so far and where the neighbors stand, and the family on the
// plot shows what they think of it. After each choice the house gains the part by itself (the
// crane sets the roof); next door the Winters build with the same budget and a temperament of
// their own. An AI adviser (bricks-ai.js) forecasts for each card how coherent the house could
// become: it has learned from houses built so far, is unsure on rare combinations and knows
// neither the family's wishes nor their budget. The coherence check at the end is staged,
// criterion by criterion, with both houses in view; then the lights go on and the family moves
// in. A second page says what the money bought and what the best plan would have been.
//
// No timing, no dragging, no countdown. Browser: the house in the middle, the brief with the
// budget bar at the left, the live meter at the right, the wish list and the cards below (on
// phones the wish list opens with a button). Headset (AR and VR): the plot as a diorama at table
// height, the cards on an arc at eye height, the wish list and the meter at the right. Relaxed
// mode and calm motion (assist.js), controls per device, pause-safe.
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
import { DECISIONS, STEPS, OPTION, makeRound, judge, bestFrom, bestHouse, priceOf, reserve, clashes, needMet, gains } from '../bricks-data.js';
import { Adviser } from '../bricks-ai.js';
import { TOP, OX, OZ, FOUND, HOUSE_Z } from '../bricks-plan.js';
import { House, ROOF_SLINGS } from '../bricks-house.js';
import { Thumbs } from '../bricks-thumbs.js';
import { loadBricks, Crane, Puffs, bsfx, makeFamily } from '../bricks-visuals.js';
import { OptionCard, WishChip, briefPanel, meterPanel, strip, neighborSign, checkPanel, drawTag, euro, optName, whyText, BRIEF, METER, SIGN, CHECK_SIZE } from '../bricks-panels.js';

// Points: the coherence total (0..100) times RATE, a bonus for beating the neighbors, a little
// for every point of lead and for money left over (it reduces the loan). A perfect round stays
// below the 5000 the leaderboard allows.
const RATE = 42;
const BEAT = 400;
const LEAD = 10; // per point ahead, at most 25 points
const SAVED = 6; // per thousand euros left over, at most 15
const RATING = [2900, 3600]; // points for the second and the third rating (times the relaxed mode's share)
// Headset placement: the plot below eye height within reach.
const PLOT_DROP = 0.58;
const PLOT_Z = -0.52;
const HOUSE = new THREE.Vector3(0, FOUND, HOUSE_Z);
const CRANE_AT = new THREE.Vector3(-0.06, 0, -0.335);
const FIR = new THREE.Vector3(-0.4, 0, 0.27);
const FAMILY_AT = new THREE.Vector3(0.25, 0.002, 0.31);
// Card sizes in meters per layout: [required part, extra].
const CARD = { row: [[0.72, 0.44], [0.5, 0.31]], col: [[0.9, 0.3], [0.44, 0.27]], side: [[0.62, 0.235], [0.42, 0.19]], xr: [[0.6, 0.54], [0.52, 0.32]] };
const CHIP = [0.36, 0.118]; // a chip of the wish list
// Where a part is on the house (house-local), for the pointer in the check.
const SPOT = {
  walls: [0.09, TOP * 0.62, OZ + 0.03], roof: [0, TOP + 0.2, 0.06], windows: [-0.144, 0.17, OZ + 0.03], door: [0, 0.2, OZ + 0.04], heating: [-OX - 0.03, 0.15, 0.115], garden: [-0.12, 0.09, 0.33],
  tank: [OX + 0.045, 0.13, 0.12], pond: [0.3, 0.07, 0.25], smart: [0.144, 0.22, OZ + 0.05], carport: [0.48, 0.2, 0.01], solar: [0.1, TOP + 0.2, 0.09], cellar: [0.21, 0.1, OZ + 0.05], conservatory: [-OX - 0.06, 0.2, -0.07], annex: [-OX - 0.085, 0.21, -0.07],
};
const COACH_KEY = 'kiar.bricks.coached';
const clamp = THREE.MathUtils.clamp;
const ease = (k) => k * k * (3 - 2 * k);
/** "1 Punkt", "8 Punkte". */
const points = (n) => t(n === 1 ? 'bricksPoint' : 'bricksPoints', { n });
const signed = (n) => `${n > 0 ? '+' : ''}${n}`;

// "Again" on the result starts the next round at once (no intro a second time), with another
// brief; the brief screen then also offers the same brief once more.
let skipIntro = false;
let lastBrief = null;
let lastGame = null; // { round, total }
let replaySame = false;

export class BricksScene extends BaseScene {
  constructor(app) {
    super(app);
    this.gameKey = 'bricks';
    this.mode = 'intro';
    this.time = 0;
    this.calm = assist.reducedMotion; // gentle animations, few particles, no camera moves
    this.easy = assist.easy; // the cards point out clashes, the confidence comes in words too
    this.ar = this.engine.isXR && this.engine.xrMode === 'immersive-ar';
    // The same brief once more (chosen on the brief screen), or a new one. Relaxed mode: a
    // little more money, so one more wish fits in.
    this.replay = replaySame && lastGame ? lastGame : null;
    replaySame = false;
    this.round = this.replay ? this.replay.round : makeRound(lastBrief, assist.pick(0, 12));
    this.offerSame = skipIntro && lastGame && !this.replay ? lastGame : null;
    lastBrief = { people: this.round.brief.people, place: this.round.brief.place.id };
    this.ai = new Adviser(this.round);
    this.step = 0;
    this.choices = []; // the required parts chosen so far (option ids)
    this.extras = []; // the wish list: extras earmarked (and, in the last step, built)
    this.built = new Set(); // extras that stand on the plot
    this.records = []; // per required part: what the adviser picked, what the player picked
    this.undone = new Set(); // steps whose choice was changed once already
    this.nbStep = 0;
    this.nbIds = []; // what the neighbors have built so far
    this.cards = [];
    this.chips = [];
    this.drawer = false; // phones: the wish list is open instead of the step's cards
    this.note = null; // a message in the strip over the house
    this.told = new Set();
    // The coach explains four things once, in the very first round (and always in the relaxed mode).
    let coached = false;
    try { coached = localStorage.getItem(COACH_KEY) === '1'; } catch { /* private mode */ }
    this.coachOn = !coached || this.easy;
    this.tags = [];

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
    this.setControls({ desktop: rows('desk', 5), touch: rows('touch', 3), xr: rows('xr', 3) });
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
   * The look: neutral tone mapping with a soft studio environment, one warm key light with soft
   * shadows (none with "lite" effects), the app's general lights dimmed. In the browser and in
   * VR a sky in the colors of the place; in AR the real room stays visible (no sky, no
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
    if (glow) this.onSceneDispose(bloom(e, { strength: 0.5, radius: 0.5, threshold: 2.8 }));
  }

  /** A winter-evening sky: a gradient dome and a few stars (browser and VR only). */
  makeSky() {
    const e = this.engine;
    const place = this.round.brief.place.id;
    const sky = new THREE.Group();
    sky.userData.noFit = true;
    const dome = new THREE.Mesh(new THREE.SphereGeometry(16, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
      uniforms: { uTop: { value: new THREE.Color(hex(`xr-bricks-sky-${place}-top`)) }, uMid: { value: new THREE.Color(hex(`xr-bricks-sky-${place}-mid`)) }, uLow: { value: new THREE.Color(hex('xr-bricks-sky-low')) } },
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
    // One warm key light from the front left (the only shadow caster), tinted by the place, and a cool rim from behind.
    const place = this.round.brief.place.id;
    const key = new THREE.DirectionalLight(hex(`xr-bricks-key-${place}`), 2.6);
    key.position.set(-0.75, 1.05, 0.7);
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
    // The ground in the colors of the place.
    const place = this.round.brief.place.id;
    M.mats.Grass.color.setHex(hex(`xr-bricks-grass-${place}`));
    M.mats.GrassDark.color.setHex(hex(`xr-bricks-grass-${place}`)).multiplyScalar(0.78);
    // The house throws shadows where the device affords it; the neighbors never do.
    this.house = new House(this.plotRoot, M, { cast: this.tier !== 'low', calm: this.calm });
    this.house.decorate(place);
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
    this.snow.density = place === 'hill' ? (this.calm ? 0.2 : 0.45) : 0;
    this.group.add(this.snow.points);
    setSnowAmount(0);
    // The builders stand in their front garden and say what they think.
    this.family = makeFamily(this.round.brief.people);
    this.family.group.position.copy(FAMILY_AT);
    this.family.group.scale.setScalar(1.25);
    this.family.group.rotation.y = -0.25;
    const blob = contactShadow(0.08, 0.35);
    blob.position.y = 0.001;
    this.family.group.add(blob);
    this.family.group.traverse((o) => { if (o.isMesh && o !== blob) o.castShadow = this.tier === 'high'; });
    this.plotRoot.add(this.family.group);
    this.buildNeighbors(M);
    // Headset: a soft shadow under each plot, so the dioramas sit on the table or the floor.
    if (this.engine.isXR) {
      for (const root of [this.plotRoot, this.nb.root]) {
        const shade = contactShadow(0.62, 0.42);
        shade.position.set(root === this.plotRoot ? 0.06 : -0.06, -0.074, 0);
        shade.scale.set(1.25, 0.9, 1);
        root.add(shade);
      }
    }
    // The pointers of the check: an arrow over the part a reason is about, on each house.
    const arrow = (token, parent) => {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.05, 4), new THREE.MeshBasicMaterial({ color: hex(token), transparent: true, opacity: 0.95, depthTest: false, toneMapped: false }));
      m.rotation.x = Math.PI;
      m.renderOrder = 6;
      m.visible = false;
      m.userData.noFit = true;
      parent.add(m);
      return m;
    };
    this.markMe = arrow('xr-bricks-you', this.house.home);
    this.markNb = arrow('xr-bricks-neighbor', this.nb.house.home);
    // Little photos of the real parts for the cards, one per frame.
    this.thumbs = new Thumbs(this.engine, M, this.round, (id) => this.thumbReady(id));
    this.refreshLive();
    this.buildPanels();
  }

  thumbReady(id) {
    const pic = this.thumbs.get(id);
    for (const c of [...this.cards, ...this.chips]) if (c.optId === id) { c.state.thumb = pic; c.redraw(); }
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
    nb.house.decorate(this.round.brief.place.id);
    nb.family = makeFamily('winter');
    nb.family.group.position.set(-0.25, 0.002, 0.31);
    nb.family.group.scale.setScalar(1.25);
    const blob = contactShadow(0.07, 0.35);
    blob.position.y = 0.001;
    nb.family.group.add(blob);
    nb.family.group.traverse((o) => { if (o.isMesh) o.castShadow = false; });
    root.add(nb.family.group);
  }

  /** The Winters build the same part (after the player's choice), in their own way. */
  neighborBuilds() {
    const nb = this.nb;
    const plan = this.round.neighbor.ids;
    const built = (id) => { nb.spent += OPTION[id].price; nb.last = id; this.nbIds.push(id); this.refreshLive(); };
    if (this.nbStep < DECISIONS.length) {
      const id = plan[this.nbStep];
      nb.house.build(DECISIONS[this.nbStep], id);
      built(id);
      this.nbStep += 1;
      if (Math.random() < 0.5) nb.family.wave();
    } else if (this.nbStep === DECISIONS.length) {
      plan.slice(DECISIONS.length).forEach((id, i) => this.delay(0.2 + i * 0.3, () => { if (!this.disposed) { nb.house.build('extras', id); built(id); } }));
      this.nbStep += 1;
    }
  }

  // ---------- panels ----------

  buildPanels() {
    const ui = (o) => { o.userData.noFit = true; this.ui.add(o); return o; };
    const money = () => ({ round: this.round, spent: this.spent(), earmarked: this.earmarked(), reserve: reserve(this.round, this.step) });
    this.briefs = { full: ui(briefPanel(...BRIEF.full, money, 'full')), strip: ui(briefPanel(...BRIEF.strip, money, 'strip')), mini: ui(briefPanel(...BRIEF.mini, money, 'mini')) };
    const live = () => ({ me: this.live, them: this.nbLive, last: this.lastChange?.text, lastToken: this.lastChange?.token, count: this.ai.count });
    this.meters = { full: ui(meterPanel(...METER.full, live, 'full')), strip: ui(meterPanel(...METER.strip, live, 'strip')), mini: ui(meterPanel(...METER.mini, live, 'strip')) };
    const nbState = () => ({ kind: this.round.neighbor.kind, last: this.nb.last, spent: this.nb.spent, budget: this.round.nbBrief.budget });
    this.signs = { full: ui(neighborSign(...SIGN.full, nbState)), small: ui(neighborSign(...SIGN.small, nbState, true)) };
    this.ask = ui(strip(1.5, 0.17, () => this.askState()));
    this.coach = ui(strip(1.5, 0.2, () => ({ text: this.coachText ?? '', small: true, token: 'xr-accent', lines: 3 })));
    this.hint = ui(strip(1.5, 0.2, () => ({ text: this.mode === 'brief' ? (this.replay ? `${t('bricksSameBest', { n: this.replay.total })}. ${t('bricksBriefHint')}` : t('bricksBriefHint')) : '', small: true, scale: 0.95, lines: 3 })));
    this.labelMe = ui(strip(0.6, 0.09, () => ({ text: t('bricksYourHouse'), small: true, token: 'xr-bricks-you' })));
    this.labelNb = ui(strip(0.6, 0.09, () => ({ text: t('bricksWho_winter'), small: true, token: 'xr-bricks-neighbor' })));
    const btn = (label, variant, onClick, w = 0.34) => ui(new Button(w, 0.1, { label, variant, labelSize: 'xr-text-sm', grow: false, onClick }));
    this.backBtn = btn(t('bricksBack'), 'secondary', () => this.back(), 0.28);
    this.goBtn = btn(t('bricksBuild'), 'primary', () => this.primary(), 0.46);
    this.wishBtn = btn(t('bricksWishBtn', { n: 0 }), 'sponsor', () => this.toggleDrawer(), 0.46);
    this.sameBtn = btn(t('bricksSame'), 'secondary', () => { replaySame = true; skipIntro = true; this.app.startGame('bricks'); }, 0.6);
    // The wish list as chips (desktop and headset): every extra with its price, from the first step on.
    this.chips = this.round.extras.map((o, i) => {
      const chip = new WishChip(...CHIP, this.chipState(o, i), () => this.toggleExtra(o));
      chip.optId = o.id;
      return ui(chip);
    });
    for (const o of this.ui.children) o.visible = false;
  }

  /** A button's text (also for the keyboard focus and screen readers). */
  setLabel(btn, text) {
    if (btn.opts.label === text) return;
    btn.opts.label = text;
    btn.userData.label = text;
    btn.redraw();
  }

  /** Money in the house: the required parts chosen and the extras that stand. */
  spent() { return priceOf(this.choices) + priceOf(this.extras.filter((id) => this.built.has(id))); }

  /** Money set aside for the wish list. */
  earmarked() { return priceOf(this.extras.filter((id) => !this.built.has(id))); }

  /** Money free to decide about: the budget minus the house, the wish list and the cheapest version of the open parts. */
  free() { return this.round.brief.budget - priceOf(this.choices) - priceOf(this.extras) - reserve(this.round, this.step); }

  plan() { return [...this.choices, ...this.extras]; }

  /** The coherence so far, for the live meter: the player's plan and what the neighbors have built. */
  refreshLive() {
    // Nothing built yet: all bars at zero.
    const none = (res) => ({ ...res, total: 0, rows: res.rows.map((r) => ({ ...r, score: 0 })) });
    const me = judge(this.plan(), this.round);
    const them = judge(this.nbIds, this.round, this.round.nbBrief);
    this.live = this.plan().length ? me : none(me);
    this.nbLive = this.nbIds.length ? them : none(them);
    for (const m of Object.values(this.meters ?? {})) m.redraw();
    for (const s of Object.values(this.signs ?? {})) s.redraw();
  }

  askState() {
    const small = this.engine.touchUI || this.engine.isXR;
    if (this.note) return { text: this.note.text, token: this.note.token, small: small || this.note.text.length > 34, lines: 3 };
    if (this.mode !== 'choose') return { text: '' };
    const key = this.drawer ? 'wish' : STEPS[this.step];
    // Headset: the money in the question too (the brief stands off to the side there).
    const money = this.engine.isXR ? ` ${t('bricksLeftMoney', { n: euro(this.free()) })}.` : '';
    return { text: `${t(`bricksAsk_${key}`)}${money}`, small: small || key === 'wish' || key === 'extras' };
  }

  /** A message in the strip over the house for a few seconds. */
  say(text, token = 'xr-panel-text', sec = 3.4) {
    this.note = { text, token, until: this.time + sec };
    this.ask.redraw();
  }

  /** One sentence of explanation, once (first round, or the relaxed mode). */
  coachSay(key) {
    if (!this.coachOn || this.told.has(key)) return;
    this.told.add(key);
    this.coachText = t(`bricksCoach_${key}`);
    this.coachUntil = this.time + (this.calm ? 9 : 7);
    this.coach.redraw();
    this.relayout();
    if (key === 'meter') { try { localStorage.setItem(COACH_KEY, '1'); } catch { /* private mode */ } }
  }

  /** A short speech tag over the builders. */
  tag(text, token) {
    for (const s of this.tags) { s.removeFromParent(); s.material.map.dispose(); s.material.dispose(); }
    const c = document.createElement('canvas');
    const px = 44;
    let ctx = c.getContext('2d');
    ctx.font = `900 ${px}px sans-serif`;
    c.width = 1024;
    c.height = 128;
    ctx = c.getContext('2d');
    const [w, h] = drawTag(ctx, text, token, px);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.repeat.set(w / c.width, h / c.height);
    tex.offset.set(0, 1 - h / c.height);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, toneMapped: false }));
    sp.renderOrder = 8;
    sp.userData.noFit = true;
    sp.userData.aspect = w / h;
    sp.userData.until = this.time + 3.2;
    sp.position.copy(FAMILY_AT).add(new THREE.Vector3(0, this.family.height * 1.25 + 0.07, 0));
    this.plotRoot.add(sp);
    this.tags = [sp];
    this.sizeTags();
  }

  /** Speech tags keep a readable size on every screen (about 15 px of text; in the headset the smallest text size). */
  sizeTags() {
    if (!this.tags.length) return;
    const lineH = this.engine.isXR ? num('xr-text-sm') * 1.15 : 15 / (window.innerHeight / (2 * (this.camD ?? 1) * Math.tan(THREE.MathUtils.degToRad(30))));
    for (const sp of this.tags) { const h = lineH * (128 / 44) * 0.82; sp.scale.set(h * sp.userData.aspect, h, 1); }
  }

  // ---------- input ----------

  setupKeys() {
    const onKey = (e) => {
      if (this.disposed || this.engine.paused || this.engine.isXR || e.altKey || e.ctrlKey || e.metaKey) return;
      if (!['brief', 'choose', 'check'].includes(this.mode)) return;
      const k = e.key;
      const focus = this.engine.focus;
      if (/^[1-8]$/.test(k) && this.mode === 'choose') {
        const card = this.cards[Number(k) - 1];
        if (card) { e.preventDefault(); this.pick(card); }
      } else if ((k === 'w' || k === 'W') && this.mode === 'choose' && this.step < DECISIONS.length) {
        // The wish list: on the desktop the first chip gets the focus, on phones the list opens.
        e.preventDefault();
        if (this.chips[0]?.visible) this.engine.setFocus(this.chips.includes(focus) ? this.cards[0] : this.chips[0]);
        else this.toggleDrawer();
      } else if (k.startsWith('Arrow') && this.mode === 'choose' && this.cards.length) {
        e.preventDefault();
        const list = this.chips.includes(focus) ? this.chips : this.cards;
        const cols = list === this.chips ? list.length : this.cardCols ?? list.length;
        const i = list.indexOf(focus);
        if (list === this.chips && k === 'ArrowDown') { this.engine.setFocus(this.cards[0]); return; }
        if (list === this.cards && k === 'ArrowUp' && i >= 0 && i < cols && this.chips[0]?.visible) { this.engine.setFocus(this.chips[0]); return; }
        const d = k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : k === 'ArrowUp' ? -cols : cols;
        const next = i < 0 ? 0 : (cols === 1 && (k === 'ArrowLeft' || k === 'ArrowRight') ? i : clamp(i + d, 0, list.length - 1));
        this.engine.setFocus(list[next]);
      } else if ((k === 'Enter' || k === ' ') && !focus) {
        if (this.goBtn.visible) { e.preventDefault(); this.primary(); }
      } else if (k === 'Backspace' && this.backBtn.visible && !this.backBtn.state.disabled) {
        e.preventDefault();
        this.back();
      }
    };
    window.addEventListener('keydown', onKey);
    this.onSceneDispose(() => window.removeEventListener('keydown', onKey));
  }

  /** The big button: build (after the brief), confirm the wish list, go on in the check. */
  primary() {
    if (this.mode === 'brief') this.beginChoosing();
    else if (this.mode === 'choose' && this.step === DECISIONS.length) this.confirmExtras();
    else if (this.mode === 'check') this.checkOn();
  }

  // ---------- the round ----------

  start() {
    this.clearLayer();
    this.ready.then(() => { if (!this.disposed && this.mode === 'intro') this.begin(); });
  }

  /** The brief, large: who builds, where, the money. One press and the building starts. */
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
    this.setLabel(this.goBtn, t('bricksBuild'));
    this.raiseCrane();
    this.refreshHud();
    this.relayout();
  }

  beginChoosing() {
    bsfx.pick();
    this.family.wave();
    this.openStep();
  }

  hudText() {
    if (this.mode === 'over') return t('bricksName');
    if (this.mode === 'check') return t('bricksHudCheck');
    return t('bricksHud', { n: Math.min(this.step + 1, STEPS.length), name: t(`bricksStep_${STEPS[this.step]}`), left: euro(this.free()) });
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
    const extras = this.step === DECISIONS.length;
    this.drawer = false;
    // What can no longer change becomes one mesh per material (few draw calls): everything but the last choice and the extras.
    this.house.freeze([DECISIONS[this.step - 1], 'extras']);
    this.nb.house.freeze();
    if (extras) {
      // The wish list becomes real: what is earmarked gets built, one after the other.
      this.extras.filter((id) => !this.built.has(id)).forEach((id, i) => this.delay(0.15 + i * 0.4, () => { if (!this.disposed && this.extras.includes(id) && this.step === DECISIONS.length) this.buildExtra(id); }));
    } else {
      this.advice = this.ai.advise(this.choices, this.lockedNow());
    }
    this.makeCards();
    this.setLabel(this.goBtn, t('bricksConfirm'));
    this.backBtn.set({ disabled: this.step === 0 || this.undone.has(this.step - 1) });
    this.refreshPanels();
    this.relayout();
    if (this.engine.focus && !this.engine.isXR) this.engine.setFocus(null);
    this.coachSay(['budget', 'chips', 'ai'][this.step] ?? '');
  }

  /** The cards of the current step the money does not allow. */
  lockedNow() {
    const room = this.free() + reserve(this.round, this.step) - reserve(this.round, this.step + 1);
    return this.round.catalogue[DECISIONS[this.step]].filter((o) => o.price > room).map((o) => o.id);
  }

  /** What an option does for the criteria, as chips: an arrow up or down and the criterion's short name. */
  gainChips(o) {
    const g = gains(this.plan(), o, this.round);
    const out = [];
    ['unity', 'people', 'place', 'future'].forEach((key, i) => {
      if (Math.abs(g[i]) >= 5) out.push({ text: t(`bricksCritShort_${key}`), kind: g[i] > 0 ? 'up' : 'down', strong: Math.abs(g[i]) >= 24, v: g[i] });
    });
    return out.sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
  }

  /** What a card says about itself right now (locked, selected, forecast, gains, help). */
  cardState(o, i) {
    const extras = o.decision === 'extras';
    const selected = extras ? this.extras.includes(o.id) : undefined;
    const room = extras ? this.free() : this.free() + reserve(this.round, this.step) - reserve(this.round, this.step + 1);
    const locked = !selected && o.price > room;
    const f = (extras ? this.extrasAdvice : this.advice)?.find((a) => a.id === o.id) ?? null;
    const s = { id: o.id, index: i + 1, locked, missing: locked ? o.price - room : 0, selected, forecast: f, compact: extras, words: this.easy, gains: this.gainChips(o), wish: !!o.gives && this.round.brief.needs.includes(o.gives), thumb: this.thumbs?.get(o.id) ?? null };
    if (!extras) {
      const cheap = this.round.cheapest[o.decision];
      s.basic = cheap.id === o.id;
      s.more = s.basic ? 0 : o.price - cheap.price;
    }
    if (this.easy) {
      // Relaxed mode: the card says what it clashes with, or that it fulfills a wish.
      const mine = this.plan().filter((id) => id !== o.id);
      const clash = mine.find((id) => clashes(id, o.id));
      const styles = mine.map((id) => OPTION[id].style).filter(Boolean);
      const main = styles.sort((a, b) => styles.filter((x) => x === b).length - styles.filter((x) => x === a).length)[0];
      if (clash) s.warn = t('bricksWarnClash', { a: optName(clash) });
      else if (o.style && main && o.style !== main) s.warn = t('bricksWarnStyle');
      else if (s.wish && !needMet(o.gives, mine.map((id) => OPTION[id]))) s.good = t('bricksGoodWish');
    }
    return s;
  }

  chipState(o, i) {
    const selected = this.extras.includes(o.id);
    const locked = !selected && o.price > this.free();
    return { id: o.id, index: i + 1, selected, locked, missing: locked ? o.price - this.free() : 0, wish: !!o.gives && this.round.brief.needs.includes(o.gives), thumb: this.thumbs?.get(o.id) ?? null };
  }

  makeCards() {
    for (const c of this.cards) { c.removeFromParent(); c.dispose(); }
    const extras = this.step === DECISIONS.length || this.drawer;
    if (extras) this.extrasAdvice = this.ai.adviseExtras(this.choices, this.free() + this.earmarked());
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
    const redo = (c, state) => { c.state = { ...state, hover: c.state.hover, focus: c.state.focus }; c.relabel(); c.redraw(); };
    this.cards.forEach((c, i) => redo(c, this.cardState(OPTION[c.optId], i)));
    this.chips.forEach((c, i) => redo(c, this.chipState(OPTION[c.optId], i)));
  }

  refreshPanels() {
    for (const p of [...Object.values(this.briefs), this.ask]) p.redraw();
    this.setLabel(this.wishBtn, this.drawer ? t('bricksWishClose', { name: t(`bricksStep_${STEPS[this.step]}`) }) : t('bricksWishBtn', { n: this.extras.length }));
    this.refreshCards();
    this.refreshHud?.();
  }

  /** Phones: the wish list opens in place of the step's cards, and closes again. */
  toggleDrawer() {
    if (this.mode !== 'choose' || this.step === DECISIONS.length) return;
    this.drawer = !this.drawer;
    sfx.click?.();
    this.note = null;
    this.makeCards();
    this.refreshPanels();
    this.relayout();
  }

  /** A card is pressed (a click, a tap, a number key, the trigger). */
  pick(card) {
    if (this.mode !== 'choose') return;
    const o = OPTION[card.optId];
    if (o.decision === 'extras') { this.toggleExtra(o); return; }
    if (card.state.locked) {
      sfx.bounce?.();
      const wish = this.earmarked();
      this.say(wish > 0 ? t('bricksLockedWish', { n: euro(card.state.missing), w: euro(wish) }) : t('bricksNoMoney', { n: euro(card.state.missing) }), 'xr-danger');
      return;
    }
    this.choose(o);
  }

  /** One sentence right after a choice: what it means, and which criterion moved by how much. */
  feedback(o, before, after) {
    const mine = this.plan().filter((id) => id !== o.id);
    const b = this.round.brief;
    const a = optName(o.id);
    const delta = (key) => { const i = ['unity', 'people', 'place', 'future', 'value'].indexOf(key); const d = after.rows[i].score - before.rows[i].score; return d ? ` · ${t(`bricksCritShort_${key}`)} ${signed(d)}` : ''; };
    const clash = mine.find((id) => clashes(id, o.id));
    if (clash) return [t('bricksFb_clash', { a: optName(clash), b: a }) + delta('unity'), 'xr-danger'];
    for (const k of b.place.weather) if (o.w?.[k] < 0) return [t('bricksFb_weatherBad', { a, w: t(`bricksWeather_${k}`) }) + delta('place'), 'xr-danger'];
    if (o.gives && b.needs.includes(o.gives) && !needMet(o.gives, mine.map((id) => OPTION[id]))) return [t('bricksFb_wish', { need: t(`bricksNeed_${o.gives}`) }) + delta('people'), 'xr-success'];
    for (const k of b.place.weather) if (o.w?.[k] > 0) return [t('bricksFb_weatherGood', { a, w: t(`bricksWeather_${k}`) }) + delta('place'), 'xr-success'];
    const styles = mine.map((id) => OPTION[id].style).filter(Boolean);
    if (o.style && styles.length && styles.every((s) => s === o.style)) return [t('bricksFb_style', { a }) + delta('unity'), 'xr-success'];
    const d = after.total - before.total;
    return [`${t('bricksFb_plain', { a })}${d ? ` · ${t('bricksTotal')} ${signed(d)}` : ''}`, 'xr-panel-text'];
  }

  /** The builders react: joy when a wish comes true, doubt when its chance has passed. */
  react(o, decided = null) {
    const b = this.round.brief;
    const opts = this.plan().map((id) => OPTION[id]);
    const others = opts.filter((x) => x !== o);
    if (o.gives && b.needs.includes(o.gives) && !needMet(o.gives, others)) {
      this.family.cheer();
      this.tag(t(`bricksTagYes_${o.gives}`), 'xr-success');
      return;
    }
    if (b.needs.includes('easy') && o.u < 0) { this.family.doubt(); this.tag(t('bricksTagNo_easy'), 'xr-warning'); return; }
    if (!decided) return;
    // A wish this step could have fulfilled, still open, and nothing on the wish list for it.
    const missed = b.needs.find((n) => n !== 'easy' && !needMet(n, opts) && this.round.catalogue[decided].some((x) => x.gives === n));
    if (missed) { this.family.doubt(); this.tag(t(`bricksTagNo_${missed}`), 'xr-warning'); }
  }

  /** A required part is chosen: it gets built, the neighbors build theirs, then the next step. */
  choose(o) {
    const locked = this.lockedNow();
    const open = this.round.catalogue[o.decision].filter((x) => !locked.includes(x.id));
    const reach = (id) => bestFrom([...this.choices, id], this.round);
    const best = Math.max(...open.map((x) => reach(x.id)));
    const top = this.advice.find((f) => f.top).id;
    const bestIds = open.filter((x) => reach(x.id) >= best).map((x) => x.id);
    this.records.push({ step: o.decision, aiTop: top, pick: o.id, aiBest: reach(top) >= best, pickBest: reach(o.id) >= best, best: bestIds });
    const before = this.live;
    this.choices.push(o.id);
    this.step += 1;
    this.refreshLive();
    const [text, token] = this.feedback(o, before, this.live);
    this.lastChange = { text, token };
    this.mode = 'build';
    bsfx.pick();
    this.say(text, token, 3.8);
    this.hideCards();
    let time;
    if (o.decision === 'roof') time = this.craneRoof(o.id);
    else {
      time = this.house.build(o.decision, o.id);
      this.buildFx(o.decision, time);
    }
    this.react(o, o.decision);
    if (this.nbStep < this.step) this.delay(0.35, () => { if (!this.disposed) this.neighborBuilds(); });
    if (o.decision === 'garden') { this.parkCrane(); if (this.firLights) this.firLights.visible = this.house.firVisible; }
    this.refreshLive();
    this.refreshPanels();
    this.relayout();
    this.coachSay(this.step === 1 ? 'wish' : this.step === 3 ? 'meter' : '');
    this.delay(time + 0.25, () => { if (!this.disposed && this.mode === 'build') this.openStep(); });
  }

  buildExtra(id) {
    if (this.built.has(id)) return;
    this.built.add(id);
    const time = this.house.build('extras', id);
    this.buildFx('extras', time, id);
    for (const p of Object.values(this.briefs)) p.redraw();
  }

  /** An extra goes on the wish list or comes off it (as often as the player likes, until confirming). */
  toggleExtra(o) {
    if (this.mode !== 'choose') return;
    const before = this.live;
    if (this.extras.includes(o.id)) {
      this.extras = this.extras.filter((id) => id !== o.id);
      if (this.built.has(o.id)) { this.built.delete(o.id); this.house.remove('extras', o.id); }
      bsfx.undo();
      this.refreshLive();
      this.say(t('bricksFb_unear', { a: optName(o.id), n: euro(o.price) }), 'xr-panel-muted');
    } else {
      if (o.price > this.free()) {
        sfx.bounce?.();
        this.say(t('bricksNoMoney', { n: euro(o.price - this.free()) }), 'xr-danger');
        return;
      }
      this.extras.push(o.id);
      bsfx.pick();
      this.refreshLive();
      if (this.step === DECISIONS.length) {
        this.buildExtra(o.id);
        const [text, token] = this.feedback(o, before, this.live);
        this.say(text, token);
      } else {
        const d = this.live.total - before.total;
        this.say(`${t('bricksFb_ear', { a: optName(o.id), n: euro(o.price) })}${d ? ` · ${t('bricksTotal')} ${signed(d)}` : ''}`, 'xr-success');
      }
      this.react(o);
    }
    if (this.step < DECISIONS.length) this.advice = this.ai.advise(this.choices, this.lockedNow());
    this.refreshPanels();
  }

  /** Sound, dust and a little sparkle while a part appears. */
  buildFx(decision, time, id = null) {
    const spot = id ? new THREE.Vector3(...SPOT[id]).setY(0.02) : new THREE.Vector3(0, 0.02, decision === 'garden' ? 0.3 : 0);
    const at = HOUSE.clone().add(spot);
    const knocks = this.calm ? 2 : decision === 'walls' ? 6 : 3;
    for (let i = 0; i < knocks; i++) this.delay((i / knocks) * time * 0.8, () => { if (!this.disposed) bsfx.place(); });
    this.delay(time * 0.75, () => {
      if (this.disposed) return;
      this.puffs.puff(at.clone().setY(0.02), { n: this.calm ? 4 : 10, spread: id ? 0.1 : 0.2, size: 0.03 });
      if (!this.calm) this.burst(this.plotRoot.localToWorld(at.clone().setY(TOP * 0.5)), 'xr-bricks-puff', 10);
    });
  }

  /** "Back": the last required part goes away again and its money comes back (once per part). */
  back() {
    if (this.mode !== 'choose' || this.step === 0 || this.undone.has(this.step - 1)) return;
    // What stood of the wish list comes down again (it stays earmarked).
    for (const id of this.built) this.house.remove('extras', id);
    this.built.clear();
    this.step -= 1;
    const id = this.choices.pop();
    this.records.pop();
    this.undone.add(this.step);
    this.extrasAdvice = null;
    this.house.remove(DECISIONS[this.step]);
    if (DECISIONS[this.step] === 'garden' && this.firLights) this.firLights.visible = false;
    if (DECISIONS[this.step] === 'roof') this.crane.setSlings(null);
    bsfx.undo();
    this.refreshLive();
    this.say(t('bricksUndo', { a: optName(id) }), 'xr-panel-muted');
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

  // ---------- the check ----------

  /** The wish list is confirmed: the plan is final, the neighbors finish, the check begins. */
  confirmExtras() {
    if (this.mode !== 'choose') return;
    bsfx.pick();
    this.hideCards();
    for (const id of this.extras) this.buildExtra(id);
    this.neighborBuilds();
    this.parkCrane();
    const all = this.plan();
    const me = judge(all, this.round);
    const them = this.round.neighbor.result;
    this.result = me;
    // What the adviser recommended among the extras, and whether that fitted this family.
    const tips = (this.extrasAdvice ?? []).filter((f) => f.tip).map((f) => f.id);
    const sum4 = (r) => r.rows[0].score + 2 * r.rows[1].score + r.rows[2].score + r.rows[3].score;
    const fitted = tips.filter((id) => {
      const bought = me.bought.find((b) => b.id === id);
      return bought ? bought.gain > 0 : sum4(judge([...all, id], this.round)) > sum4(me);
    });
    this.extraRecord = { tips, fitted: fitted.length };
    // The second page: what the money did.
    const diff = me.total - them.total;
    const names = (list) => list.map((b) => optName(b.id)).join(', ');
    const paid = me.bought.filter((b) => b.gain > 0).sort((a, b) => b.gain - a.gain);
    const not = me.bought.filter((b) => b.gain <= 0);
    const best = bestHouse(this.round);
    const other = best.filter((id) => !all.includes(id));
    const budget = this.round.brief.budget;
    const weakest = [...me.rows].sort((a, b) => a.score - b.score)[0];
    this.moneyLines = [
      { text: me.left > 0 ? t('bricksLoanLess', { n: euro(me.left) }) : t('bricksLoanAll', { n: euro(this.round.brief.loan) }), token: me.left > 0 ? 'xr-success' : 'xr-panel-text', big: true },
      paid.length ? { text: `${t('bricksPaidMost', { a: optName(paid[0].id), n: Math.max(1, Math.round(paid[0].gain)) })}${paid.length > 1 ? `. ${t('bricksPaid', { list: names(paid.slice(1)) })}` : ''}`, token: 'xr-success' } : { text: t('bricksBoughtNone') },
      not.length ? { text: t('bricksNotPaid', { list: names(not) }), token: 'xr-danger' } : null,
      { text: t('bricksWeakest', { crit: t(`bricksCrit_${weakest.key}`), why: whyText(weakest.why) }) },
      { text: this.round.best > me.total && other.length ? t('bricksBestPlan', { n: this.round.best, list: other.map(optName).join(', ') }) : t('bricksBestIs'), token: 'xr-warning', big: true },
      { text: `${t('bricksMoneyLine', { who: t('bricksWho_winter'), spent: euro(them.price), budget: euro(budget) })} (${t(`bricksNbKind_${this.round.neighbor.kind}`)}). ${them.bought.length ? t('bricksBought', { list: names(them.bought) }) : t('bricksBoughtNone')}`, token: 'xr-bricks-neighbor' },
    ].filter(Boolean);
    this.paidText = [paid.length ? t('bricksPaid', { list: names(paid) }) : t('bricksBoughtNone'), not.length ? t('bricksNotPaid', { list: names(not) }) : ''].filter(Boolean).join('. ');
    this.planText = this.moneyLines.find((m) => m.token === 'xr-warning').text;
    const verdict = diff > 0 ? t('bricksWin', { n: points(diff) }) : diff < 0 ? t('bricksLose', { n: points(-diff) }) : t('bricksTie');
    this.mode = 'check';
    this.note = null;
    this.coachText = null;
    this.checkKind = this.engine.isXR ? 'xr' : this.kind() === 'col' ? 'tall' : this.kind() === 'side' ? 'side' : 'wide';
    this.check = { me, them, shown: 0, rows: me.rows.length, verdict, page: 0, money: this.moneyLines, wait: this.calm ? 2.2 : 1.6, heard: -1, final: false };
    this.checkPanel = checkPanel(this.checkKind, () => this.check);
    this.checkPanel.userData.noFit = true;
    this.ui.add(this.checkPanel);
    this.setLabel(this.goBtn, t('bricksSkip'));
    if (this.engine.isXR) this.sideBySideXR();
    this.refreshPanels();
    this.relayout();
  }

  /** The button in the check: show everything at once, then the second page, then the result. */
  checkOn() {
    const c = this.check;
    if (!c.final) { c.wait = 0; c.shown = c.rows + 1; return; }
    if (c.page === 0) {
      c.page = 1;
      this.checkPanel.redraw();
      this.setLabel(this.goBtn, t('bricksToResult'));
      sfx.click?.();
      return;
    }
    this.finish();
  }

  /** Puts the pointer over the part a reason is about (or hides it). */
  point(mark, house, why) {
    const id = why?.a;
    if (!id || !SPOT[id] && !SPOT[OPTION[id]?.decision]) { mark.visible = false; return; }
    const spot = SPOT[id] ?? SPOT[OPTION[id].decision];
    const y = OPTION[id].decision === 'roof' || id === 'solar' ? (house.roofTop ?? TOP) + 0.07 : spot[1] + 0.05;
    mark.visible = true;
    mark.position.set(spot[0], y + (this.calm ? 0 : Math.abs(Math.sin(this.time * 4)) * 0.012), spot[2]);
  }

  /** The check is staged: one criterion after the other, the total, the verdict, then the lights go on. */
  updateCheck(dt) {
    const c = this.check;
    if (!c || this.mode !== 'check') return;
    if (c.wait > 0) { c.wait -= dt; if (c.wait <= 0) { this.house.freeze(); this.nb.house.freeze(); } return; }
    const before = c.shown;
    if (c.shown < c.rows) c.shown = Math.min(c.rows, c.shown + dt / (this.calm ? 2.8 : 2.2));
    else if (c.shown < c.rows + 1) c.shown = Math.min(c.rows + 1, c.shown + dt / 1.3);
    const row = Math.min(c.rows - 1, Math.floor(c.shown - 0.0001));
    if (c.shown < c.rows) {
      if (row > c.heard) { c.heard = row; bsfx.row(); }
      this.point(this.markMe, this.house, c.me.rows[row].why);
      this.point(this.markNb, this.nb.house, c.them.rows[row].why);
    } else { this.markMe.visible = false; this.markNb.visible = false; }
    if (c.shown !== before || !c.drawn) { c.drawn = true; this.checkPanel.redraw(); }
    if (c.shown >= c.rows + 1 && !c.final) {
      c.final = true;
      this.checkPanel.redraw();
      this.setLabel(this.goBtn, t('bricksNext'));
      this.celebrate();
    }
  }

  /** After the verdict: lights on, the door opens, the family moves in, the neighbors applaud. */
  celebrate() {
    const c = this.check;
    const win = c.me.total > c.them.total;
    bsfx.lights();
    this.tween(1.2, (k) => { this.house.lights(1.6 * this.glowBoost * k); this.nb.house.lights(1.4 * this.glowBoost * k); });
    this.delay(0.5, () => { if (!this.disposed) { bsfx.door(); this.tween(1.0, (k) => this.house.openDoor(k), { ease }); } });
    this.smoking = !!this.house.smokeAt;
    this.family.cheer();
    this.tag(t('bricksTagHome'), 'xr-success');
    // The builders walk up to their door.
    const g = this.family.group;
    const from = g.position.clone();
    const to = new THREE.Vector3(0.07, 0.002, HOUSE_Z + OZ + 0.1);
    this.tween(this.calm ? 2.4 : 1.6, (k) => g.position.lerpVectors(from, to, k), { ease });
    if (win) { this.nb.family.clap(); sfx.powerup?.(); } else { this.nb.family.cheer(); sfx.correct?.(); }
    this.burst(this.plotRoot.localToWorld(HOUSE.clone().add(new THREE.Vector3(0, TOP + 0.2, 0))), win ? 'xr-success' : 'xr-warning', win ? 34 : 16);
  }

  finish() {
    if (this.mode === 'over') return;
    this.mode = 'over';
    this.app.echo?.suppress(false);
    this.exitPlayView();
    if (this.engine.isXR) for (const { o, pos } of this.hudHome ?? []) { o.position.copy(pos); o.quaternion.identity(); }
    this.ui.visible = false;
    for (const s of this.tags) s.visible = false;
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
    lastGame = { round: this.round, total: Math.max(me.total, this.replay?.total ?? 0) };
    const score = clamp(Math.round(me.total * RATE + (diff > 0 ? BEAT + Math.min(25, diff) * LEAD : 0) + Math.min(15, me.left) * SAVED), 0, 5000);
    const shown = Math.round(score * assist.scoreFactor);
    const marks = RATING.map((v) => Math.round(v * assist.scoreFactor));
    const step = shown >= marks[1] ? 2 : shown >= marks[0] ? 1 : 0;
    const rating = step === 2 ? t('bricksRateTop', { name: t('bricksRate_2') }) : t('bricksRateNext', { name: t(`bricksRate_${step}`), n: marks[step] - shown, next: t(`bricksRate_${step + 1}`) });
    const aiBest = this.records.filter((r) => r.aiBest).length;
    const followed = this.records.filter((r) => r.pick === r.aiTop).length;
    // The moment the adviser was off, and why: a wish it could not know, money it did not count, or too few houses seen.
    const miss = this.records.find((r) => !r.aiBest && r.best.some((id) => OPTION[id].gives && this.round.brief.needs.includes(OPTION[id].gives))) ?? this.records.find((r) => !r.aiBest);
    let moment = '';
    if (miss) {
      const wish = miss.best.map((id) => OPTION[id].gives).find((n) => n && this.round.brief.needs.includes(n));
      const dear = OPTION[miss.aiTop].price > Math.min(...miss.best.map((id) => OPTION[id].price));
      moment = ` ${t(wish ? 'bricksAiMiss_wish' : dear ? 'bricksAiMiss_money' : 'bricksAiMiss_rare', { step: t(`bricksStep_${miss.step}`), need: wish ? t(`bricksNeed_${wish}`) : '' })}`;
    }
    const x = this.extraRecord;
    const learned = [
      { q: t('bricksLearn1Q'), a: t('bricksLearn1A', { a: aiBest, b: followed }) + (x.tips.length ? t('bricksLearn1X', { n: x.tips.length, m: x.fitted }) : '') + moment },
      { q: t('bricksLearn2Q'), a: t('bricksLearn2A') },
      { q: t('bricksLearn3Q'), a: `${this.paidText ? `${this.paidText}. ` : ''}${this.planText}` },
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
    if (this.note && this.time > this.note.until) { this.note = null; this.ask.redraw(); }
    if (this.coachText && this.time > this.coachUntil) { this.coachText = null; this.coach.redraw(); this.relayout(); }
    if (this.tags.length && this.time > this.tags[0].userData.until) { for (const s of this.tags) { s.removeFromParent(); s.material.map.dispose(); s.material.dispose(); } this.tags = []; }
    this.thumbs?.step();
    this.house.update(dt);
    this.nb.house.update(dt);
    this.updateHang();
    this.crane.sway = this.calm ? 0 : 0.4;
    this.crane.apply(this.time);
    this.puffs.update(dt);
    this.firLights?.userData.tick(this.time);
    this.family.tick(dt, this.time);
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
    this.sizeTags();
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
   * panel goes. Desktop: the brief at the left, the house in the middle with the neighbors'
   * plot in the corner, their sign and the live meter at the right, the wish list and the cards
   * below. Phone upright: the brief as a strip, the house with the meter over it, the buttons,
   * the cards in a column. Phone sideways: brief, meter and buttons at the left, the house in
   * the middle, the cards at the right. Text on phones is never smaller than about 14 px.
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
      const rowW = clamp(free, 300, 660);
      const ppm = rowW / 1.27;
      hud = { ppm, x0: m + Math.max(0, (free - rowW) / 2), y: m };
      top = m + 0.15 * ppm + 6;
    }
    const out = { W, Hh, kind, hud, show: {}, chips: null };
    const s = out.show;
    const extras = this.step === DECISIONS.length;
    const grid = extras || this.drawer;
    const n = this.cards.length;
    const [cw, ch] = CARD[kind][grid ? 1 : 0];
    if (this.mode === 'brief') {
      const [bw, bh] = BRIEF.full;
      const pw = Math.min(W - 2 * m, 440, ((Hh - top - (this.offerSame ? 236 : 176)) / bh) * bw);
      const ph = (pw / bw) * bh;
      const y0 = top + Math.max(m, (Hh - top - ph - (this.offerSame ? 216 : 156)) / 2);
      s.briefFull = { x: (W - pw) / 2, y: y0, w: pw, h: ph };
      s.hint = { x: (W - Math.min(W - 2 * m, 600)) / 2, y: y0 + ph + 4, w: Math.min(W - 2 * m, 600), h: 84, wrap: kind === 'row' ? 440 : 400 };
      s.go = { x: W / 2 - 115, y: y0 + ph + 92, w: 230, h: 52 };
      if (this.offerSame) s.same = { x: W / 2 - 150, y: y0 + ph + 152, w: 300, h: 50 };
      out.plot = { x: 0, y: top, w: W, h: Hh - top };
      return out;
    }
    if (this.mode === 'check' || this.mode === 'over') {
      const [pw, ph] = CHECK_SIZE[this.checkKind];
      const btnH = 52;
      if (kind === 'side') {
        // Beside each other: the houses at the left, the check at the right, the button under it.
        const availH = Hh - top - m;
        const ppm = Math.min((W * 0.62 - 2 * m) / pw, (availH - btnH - m) / ph);
        const w = pw * ppm;
        s.check = { x: W - m - w, y: top, w, h: ph * ppm };
        s.go = { x: W - m - w + (w - 230) / 2, y: Hh - m - btnH + 4, w: 230, h: btnH - 4 };
        out.plot = { x: 0, y: top + 30, w: W - w - 2 * m, h: availH - 30 };
        s.labelMe = { x: 4, y: top, w: out.plot.w * 0.5, h: 28, wrap: 400 };
        s.labelNb = { x: out.plot.w * 0.5, y: top, w: out.plot.w * 0.5, h: 28, wrap: 400 };
      } else {
        const availH = Hh - top - btnH - 3 * m;
        const housesMin = kind === 'col' ? 150 : Math.max(200, availH * 0.36);
        const ppm = Math.min((W - 2 * m) / pw, (availH - housesMin) / ph, kind === 'row' ? 520 : 440);
        const h = ph * ppm;
        const w = pw * ppm;
        const housesH = availH - h;
        out.plot = { x: 0, y: top + 26, w: W, h: housesH - 26 };
        s.check = { x: (W - w) / 2, y: top + housesH + m, w, h };
        s.go = { x: W / 2 - 115, y: Hh - btnH - m + 4, w: 230, h: btnH - 4 };
        const lw = Math.min(190, W * 0.4);
        s.labelMe = { x: W * 0.27 - lw / 2, y: top, w: lw, h: 28, wrap: kind === 'row' ? 420 : 400 };
        s.labelNb = { x: W * 0.73 - lw / 2, y: top, w: lw, h: 28, wrap: kind === 'row' ? 420 : 400 };
      }
      out.both = true;
      return out;
    }
    const cardsOn = this.mode === 'choose';
    const coachOn = !!this.coachText;
    if (kind === 'row') {
      const cols = grid ? 4 : 3;
      const rows = grid ? 2 : 1;
      const cardW = Math.min((W - (cols + 1) * m) / cols, grid ? 300 : 380, (((Hh - top) * (grid ? 0.2 : 0.29)) / ch) * cw);
      const cardH = (cardW / cw) * ch;
      const cardsH = rows * cardH + (rows - 1) * m;
      const cardsY = Hh - m - cardsH;
      const x0 = (W - cols * cardW - (cols - 1) * m) / 2;
      out.cards = Array.from({ length: n }, (_, i) => ({ x: x0 + (i % cols) * (cardW + m), y: cardsY + Math.floor(i / cols) * (cardH + m), w: cardW, h: cardH }));
      out.cols = cols;
      // the wish list: a row of chips above the cards (not in the last step, where the cards are the list)
      let stripY = cardsY;
      if (!extras) {
        const gap = 5;
        const chipW = Math.min((W - 2 * m - 7 * gap) / 8, 168);
        const chipH = (chipW / CHIP[0]) * CHIP[1];
        stripY = cardsY - chipH - 7;
        const cx0 = (W - 8 * chipW - 7 * gap) / 2;
        out.chips = this.chips.map((_, i) => ({ x: cx0 + i * (chipW + gap), y: stripY, w: chipW, h: chipH }));
      }
      const colH = stripY - top - m;
      const [bw, bh] = BRIEF.full;
      const leftW = Math.min(clamp(W * 0.25, 220, 350), (colH / bh) * bw);
      s.briefFull = { x: m, y: top + m / 2, w: leftW, h: (leftW / bw) * bh };
      const [mw, mh] = METER.full;
      const [sw, sh] = SIGN.full;
      const rightW = Math.min(clamp(W * 0.25, 220, 350), (colH / (mh + sh + 0.02)) * mw);
      s.signFull = { x: W - m - rightW, y: top + m / 2, w: rightW, h: (rightW / sw) * sh };
      s.meterFull = { x: W - m - rightW, y: top + m + (rightW / sw) * sh, w: rightW, h: (rightW / mw) * mh };
      const px = leftW + 2 * m;
      const pw = W - leftW - rightW - 4 * m;
      out.plot = { x: px, y: top, w: pw, h: stripY - top - 8 };
      out.pip = { x: px + pw * 0.72, y: top + 2, w: pw * 0.28, h: Math.min(pw * 0.2, colH * 0.3) };
      if (coachOn) s.coach = { x: px, y: top, w: pw * 0.7, h: 64, wrap: 420 };
      s.ask = { x: px + 124, y: stripY - 50, w: pw - 248 - (extras ? 120 : 0), h: 46, wrap: 440 };
      s.back = { x: px, y: stripY - 48, w: 118, h: 42 };
      if (extras) s.go = { x: px + pw - 236, y: stripY - 48, w: 236, h: 42 };
    } else if (kind === 'col') {
      const cols = grid ? 2 : 1;
      const rows = grid ? 4 : 3;
      const cardW = (W - (cols + 1) * m) / cols;
      const briefH = ((W - 2 * m) / BRIEF.strip[0]) * BRIEF.strip[1];
      const btnH = 48;
      const cardH = Math.min((cardW / cw) * ch, (Hh - top - briefH - btnH - (grid ? 120 : 200) - (rows + 3) * 6) / rows);
      const cardsH = rows * cardH + (rows - 1) * 6;
      const cardsY = Hh - m - cardsH;
      out.cards = Array.from({ length: n }, (_, i) => ({ x: m + (i % cols) * (cardW + m), y: cardsY + Math.floor(i / cols) * (cardH + 6), w: cardW, h: cardH }));
      out.cols = cols;
      s.briefStrip = { x: m, y: top + 2, w: W - 2 * m, h: briefH };
      const btnY = cardsY - btnH - 4;
      const y0 = top + briefH + 6;
      const meterH = ((W - 2 * m) / METER.strip[0]) * METER.strip[1];
      // the meter lies over the top of the house's part of the screen (there is only sky)
      s.meterStrip = { x: m, y: y0, w: W - 2 * m, h: meterH };
      out.plot = { x: 0, y: y0 + meterH * 0.7, w: W, h: btnY - y0 - meterH * 0.7 - 34 };
      out.pip = { x: W * 0.68, y: y0 + meterH + 2, w: W * 0.32 - 4, h: Math.min(84, (btnY - y0 - meterH) * 0.42) };
      if (coachOn) s.coach = { x: m, y: y0 + meterH + 2, w: W * 0.68 - m, h: 70, wrap: 400 };
      s.ask = { x: m, y: btnY - 36, w: W - 2 * m, h: 34, wrap: 400 };
      s.back = { x: m, y: btnY, w: 104, h: btnH - 4 };
      if (extras) s.go = { x: m + 112, y: btnY, w: W - 2 * m - 112, h: btnH - 4 };
      else s.wish = { x: m + 112, y: btnY, w: W - 2 * m - 112, h: btnH - 4 };
    } else {
      // A phone held sideways: the cards at the right, the brief, the meter and the buttons at the left.
      const cols = grid ? 2 : 1;
      const rows = grid ? 4 : 3;
      const availH = Hh - top - m;
      const cardH = (availH - (rows - 1) * 5) / rows;
      const cardW = (cardH / ch) * cw;
      const colW = cols * cardW + (cols - 1) * 5;
      const x0 = W - m - colW;
      out.cards = Array.from({ length: n }, (_, i) => ({ x: x0 + (i % cols) * (cardW + 5), y: top + Math.floor(i / cols) * (cardH + 5), w: cardW, h: cardH }));
      out.cols = cols;
      const leftW = 232;
      const briefH = (leftW / BRIEF.mini[0]) * BRIEF.mini[1];
      const meterH = (leftW / METER.mini[0]) * METER.mini[1];
      s.briefMini = { x: m, y: top, w: leftW, h: briefH };
      s.meterMini = { x: m, y: top + briefH + 5, w: leftW, h: meterH };
      const btnY = Hh - m - 46;
      s.back = { x: m, y: btnY, w: 84, h: 46 };
      if (extras) s.go = { x: m + 90, y: btnY, w: leftW - 90, h: 46 };
      else s.wish = { x: m + 90, y: btnY, w: leftW - 90, h: 46 };
      const px = leftW + 2 * m;
      const pw = x0 - px - m;
      out.pip = { x: m, y: top + briefH + meterH + 10, w: leftW * 0.6, h: btnY - (top + briefH + meterH + 14) };
      if (coachOn) s.coach = { x: px, y: top, w: pw, h: 84, wrap: 400 };
      s.ask = { x: px, y: Hh - m - 56, w: pw, h: 56, wrap: 400 };
      out.plot = { x: px, y: top + (coachOn ? 60 : 0), w: pw, h: availH - 50 - (coachOn ? 60 : 0) };
    }
    if (!cardsOn) { out.cards = []; out.chips = null; delete s.go; delete s.back; delete s.wish; }
    return out;
  }

  /** The browser's view: the camera frames the plot inside its part of the screen; the panels are pinned around it. */
  previewCamera(dt) {
    const e = this.engine;
    const cam = e.camera;
    if (!['brief', 'choose', 'build', 'check'].includes(this.mode)) return;
    e.fitEnabled = false;
    this.viewOn = true;
    if (this.mode === 'choose' && this.cardKind !== this.kind()) this.makeCards(); // the window was resized or the phone turned
    const lay = this.layout();
    const both = !!lay.both;
    const plot = lay.plot;
    // In the check both plots are in view: beside each other where the room is wide, the neighbors' behind where it is narrow.
    const wide = !both || plot.w / plot.h > 1.5;
    const R = new THREE.Quaternion().setFromEuler(new THREE.Euler(both ? -0.42 : -0.4, both ? -0.12 : -0.24, 0, 'YXZ'));
    const Ri = R.clone().invert();
    // The house with its garden; more room for a room at the left, the carport at the right, and the crane while it works.
    const has = (list) => list.some((id) => this.extras.includes(id) || this.built.has(id));
    const tall = this.crane?.root.visible && (this.step <= 1 || !!this.roofHang);
    const box = both
      ? (wide ? [[-0.5, 1.82], [0, 0.42], [-0.36, 0.38]] : [[-0.5, 1.25], [0, 0.42], [-1.3, 0.38]])
      : [[has(['annex', 'conservatory']) ? -0.48 : -0.4, has(['carport']) ? 0.6 : 0.44], [0, tall ? 0.56 : 0.4], [-0.24, 0.38]];
    const C = new THREE.Vector3((box[0][0] + box[0][1]) / 2, (box[1][0] + box[1][1]) / 2, (box[2][0] + box[2][1]) / 2);
    this.plotRoot.updateMatrixWorld(true);
    const Cw = this.plotRoot.localToWorld(C.clone());
    const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
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
    this.camC = (this.camC ?? Cw.clone()).lerp(Cw, k);
    cam.position.copy(this.camC).add(new THREE.Vector3(0, 0, this.camD).applyQuaternion(R));
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
    const set = (obj, r) => { if (r) this.fit(obj, r, r.max); else obj.visible = false; };
    set(this.briefs.full, s.briefFull);
    set(this.briefs.strip, s.briefStrip);
    set(this.briefs.mini, s.briefMini);
    set(this.meters.full, s.meterFull);
    set(this.meters.strip, s.meterStrip);
    set(this.meters.mini, s.meterMini);
    set(this.signs.full, s.signFull);
    set(this.signs.small, s.signSmall);
    set(this.ask, s.ask);
    set(this.coach, s.coach);
    set(this.hint, s.hint);
    set(this.labelMe, s.labelMe);
    set(this.labelNb, s.labelNb);
    set(this.backBtn, s.back);
    set(this.goBtn, s.go);
    set(this.wishBtn, s.wish);
    set(this.sameBtn, s.same);
    if (this.checkPanel) set(this.checkPanel, s.check);
    this.cardCols = lay.cols;
    this.cards.forEach((c, i) => { const r = lay.cards?.[i]; if (r) this.fit(c, r); else c.visible = false; });
    this.chips.forEach((c, i) => { const r = lay.chips?.[i]; if (r) this.fit(c, r); else c.visible = false; });
    // The neighbors: a little picture of their plot in a corner; in the check they stand next to the player's.
    const nb = this.nb;
    if (both) {
      nb.root.visible = true;
      nb.root.position.copy(this.plotRoot.position).add(wide ? new THREE.Vector3(1.2, 0, 0) : new THREE.Vector3(0.66, 0, -0.96));
      nb.root.quaternion.identity();
      nb.root.scale.setScalar(1);
    } else if (lay.pip && lay.pip.h > 40) {
      const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, 0.25, 0, 'YXZ'));
      const ppm = Math.min(lay.pip.w / 1.45, lay.pip.h / 0.8);
      nb.root.visible = true;
      this.pin(nb.root, lay.pip.x + lay.pip.w / 2, lay.pip.y + lay.pip.h / 2 + ppm * 0.2, ppm, 0.6, tilt);
    } else nb.root.visible = false;
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
   * reaches them), the brief to the left, the live meter and the wish list to the right,
   * nothing behind the player. Panels are a little larger than their drawing size, so no text
   * is below the smallest size.
   */
  placeXR() {
    const key = `${this.mode}|${this.step}|${this.cards.length}|${this.drawer}|${this.checkPanel ? 1 : 0}|${this.coachText ? 1 : 0}`;
    if (key === this.layoutKey) return;
    this.layoutKey = key;
    const S = 1.12;
    const eye = this.eye;
    const arc = (o, angle, y, dist = 1.05, scale = S) => { o.visible = true; o.scale.setScalar(scale); placeOnArc(o, angle, y, dist); };
    for (const o of this.ui.children) o.visible = false;
    const nb = this.nb;
    // The status bar and the menu button hang up at the left, clear of the cards.
    for (const o of this.hudObjs ?? []) placeOnArc(o, o.w > 0.5 ? -1.5 : -0.92, eye + 0.86, 1.05);
    if (this.mode === 'brief') {
      arc(this.briefs.full, 0, eye + 0.32, 1.0);
      arc(this.hint, 0, eye - 0.18, 0.98);
      arc(this.goBtn, 0, eye - 0.33, 0.95, 1.3);
      if (this.offerSame) arc(this.sameBtn, 0.62, eye - 0.33, 0.95, 1.2);
    } else if (this.mode === 'check') {
      arc(this.checkPanel, 0, eye + 0.36, 1.2, S);
      arc(this.labelMe, -0.45, eye - 0.16, 1.0);
      arc(this.labelNb, 0.62, eye - 0.16, 1.0);
      arc(this.goBtn, 0, eye - 0.16, 1.1, 1.3);
    } else {
      const extras = this.step === DECISIONS.length;
      arc(this.briefs.full, -1.2, eye + 0.14, 1.0);
      arc(this.meters.full, 1.2, eye + 0.44, 1.0);
      arc(this.ask, 0, eye + (extras && this.mode === 'choose' ? 0.92 : 0.6), 1.05);
      if (this.coachText) arc(this.coach, 0, eye + (extras ? 1.06 : 0.76), 1.05);
      if (this.mode === 'choose') {
        if (extras) {
          // Three columns: eight extras and the button to confirm in the ninth place.
          this.cards.forEach((c, i) => arc(c, ((i % 3) - 1) * 0.6, eye + 0.55 - Math.floor(i / 3) * 0.37));
          arc(this.goBtn, 0.6, eye + 0.55 - 2 * 0.37, 1.05, 1.3);
        } else {
          this.cards.forEach((c, i) => arc(c, (i - 1) * 0.68, eye + 0.16));
          // The wish list: two columns of chips under the meter, at the right.
          this.chips.forEach((c, i) => arc(c, 1.2 + ((i % 2) - 0.5) * 0.42, eye - 0.03 - Math.floor(i / 2) * 0.15, 1.0));
        }
        this.cardCols = 3;
        arc(this.backBtn, -0.68, eye - 0.2, 1.0, 1.3);
      }
    }
    if (this.mode !== 'check') {
      nb.root.position.set(-0.98, eye - 0.66, -1.12);
      nb.root.rotation.set(0, 0.55, 0);
      nb.root.scale.setScalar(0.55);
      if (this.mode !== 'brief') { const sg = this.signs.small; sg.visible = true; sg.scale.setScalar(S); sg.position.set(-1.06, eye - 0.42, -1.02); sg.rotation.set(0, 0.75, 0); }
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
    this.thumbs?.dispose?.();
    for (const s of this.tags) { s.material.map.dispose(); s.material.dispose(); }
    for (const c of this.cards) c.dispose();
    for (const o of this.ui?.children ?? []) o.dispose?.();
    super.dispose();
  }
}
