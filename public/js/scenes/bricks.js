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
import { DECISIONS, STEPS, OPTION, makeRound, judge, bestFrom, bestHouse, bestChange, priceOf, reserve, clashes, needMet, gains } from '../bricks-data.js';
import { Adviser } from '../bricks-ai.js';
import { TOP, OX, OZ, FOUND, HOUSE_Z } from '../bricks-plan.js';
import { House, ROOF_SLINGS } from '../bricks-house.js';
import { Thumbs } from '../bricks-thumbs.js';
import { loadBricks, Crane, Puffs, bsfx, makeFamily } from '../bricks-visuals.js';
import { OptionCard, briefPanel, briefChip, moneyBar, duelPanel, extrasButton, dotsPanel, strip, checkPanel, drawTag, euro, optShort, tagsOf, BRIEF, CHECK_SIZE } from '../bricks-panels.js';

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
const CARD = { row: [[0.78, 0.275], [0.56, 0.2]], col: [[0.9, 0.235], [0.9, 0.105]], side: [[0.7, 0.24], [0.42, 0.19]], xr: [[0.62, 0.34], [0.56, 0.21]] };
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
    this.extras = []; // the extras earmarked (and, in the last step, built)
    this.built = new Set(); // extras that stand on the plot
    this.records = []; // per required part: what the adviser picked, what the player picked
    this.undone = new Set(); // steps whose choice was changed once already
    this.nbStep = 0;
    this.nbIds = []; // what the neighbors have built so far
    this.cards = [];
    this.drawer = false; // the extras are open instead of the step's cards
    this.briefOpen = false; // the whole brief, on demand
    this.legendOn = false; // the legend of the money bar, on demand
    this.note = null; // the one short message near the house
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
    // The figures stand on a soft blob and throw no shadow of their own (fewer draw calls in the shadow pass).
    this.family.group.traverse((o) => { if (o.isMesh) o.castShadow = false; });
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
    for (const c of this.cards) if (c.optId === id) { c.state.thumb = pic; c.redraw(); }
    if (this.extras.includes(id)) this.extrasBtn?.redraw();
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

  /**
   * Few panels, and small ones: who builds (a press opens the whole brief), the money as one bar
   * and one number, the duel with the neighbors, the button of the extras, and one strip for a
   * short message. Everything else opens on demand.
   */
  buildPanels() {
    const ui = (o) => { o.userData.noFit = true; this.ui.add(o); return o; };
    const money = () => ({ round: this.round, budget: this.round.brief.budget, spent: this.spent(), earmarked: this.earmarked(), reserve: reserve(this.round, this.step), legend: this.legendOn });
    const who = () => ({ round: this.round, met: this.round.brief.needs.filter((n) => needMet(n, this.plan().map((id) => OPTION[id])) && this.plan().length > 0), step: this.step });
    const live = () => ({ me: this.live, them: this.nbLive });
    const openBrief = () => { this.briefOpen = !this.briefOpen; this.act(); sfx.click?.(); this.relayout(); };
    const legend = () => { this.legendOn = !this.legendOn; sfx.click?.(); this.redrawSmall(); };
    this.brief = ui(briefPanel(...BRIEF, money));
    this.who = { tall: ui(briefChip(0.52, 0.27, who, openBrief)), low: ui(briefChip(0.52, 0.2, who, openBrief)), half: ui(briefChip(0.56, 0.13, who, openBrief)) };
    this.money = { tall: ui(moneyBar(0.52, 0.16, money, legend)), half: ui(moneyBar(0.34, 0.13, money, legend)) };
    this.duel = { tall: ui(duelPanel(0.52, 0.24, live)), wide: ui(duelPanel(0.9, 0.105, live)) };
    this.extrasBtn = ui(extrasButton(0.52, 0.11, () => ({ ids: this.extras, sum: priceOf(this.extras), open: this.drawer, thumb: (id) => this.thumbs?.get(id) ?? null, star: this.wishNeedsExtra() }), () => this.toggleDrawer()));
    this.dots = ui(dotsPanel(0.36, 0.03, () => ({ step: this.step })));
    this.ask = ui(strip(1.5, 0.13, () => (this.note ? { text: this.note.text, token: this.note.token, icon: this.note.icon, small: true } : { text: '' })));
    this.coach = ui(strip(1.5, 0.13, () => ({ text: this.coachText ?? '', small: true, token: 'xr-accent' })));
    this.hint = ui(strip(1.5, 0.13, () => ({ text: this.mode === 'brief' ? (this.replay ? `${t('bricksSameBest', { n: this.replay.total })}. ${t('bricksBriefHint')}` : t('bricksBriefHint')) : '', small: true })));
    this.labelMe = ui(strip(0.6, 0.09, () => ({ text: t('bricksYourHouse'), small: true, token: 'xr-bricks-you' })));
    this.labelNb = ui(strip(0.6, 0.09, () => ({ text: t('bricksWho_winter'), small: true, token: 'xr-bricks-neighbor' })));
    const btn = (label, variant, onClick, w = 0.34) => ui(new Button(w, 0.1, { label, variant, labelSize: 'xr-text-sm', grow: false, onClick }));
    this.backBtn = btn(t('bricksBack'), 'secondary', () => this.back(), 0.26);
    this.goBtn = btn(t('bricksBuild'), 'primary', () => this.primary(), 0.46);
    this.detailsBtn = btn(t('bricksDetails'), 'secondary', () => this.toggleDetails(), 0.3);
    this.sameBtn = btn(t('bricksSame'), 'secondary', () => { replaySame = true; skipIntro = true; this.app.startGame('bricks'); }, 0.46);
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

  /** Money set aside for the extras that are earmarked. */
  earmarked() { return priceOf(this.extras.filter((id) => !this.built.has(id))); }

  /** Money free to decide about: the budget minus the house, the earmarked extras and the cheapest version of the open parts. */
  free() { return this.round.brief.budget - priceOf(this.choices) - priceOf(this.extras) - reserve(this.round, this.step); }

  plan() { return [...this.choices, ...this.extras]; }

  /** A wish that only an extra can still fulfill (the button of the extras then shows a star). */
  wishNeedsExtra() {
    const opts = this.plan().map((id) => OPTION[id]);
    return this.round.brief.needs.some((n) => n !== 'easy' && !needMet(n, opts) && !DECISIONS.slice(this.step).some((d) => this.round.catalogue[d].some((o) => o.gives === n)) && this.round.extras.some((x) => x.gives === n));
  }

  redrawSmall() {
    for (const p of [...Object.values(this.who ?? {}), ...Object.values(this.money ?? {}), ...Object.values(this.duel ?? {}), this.extrasBtn, this.dots, this.brief]) p?.redraw();
  }

  /** The coherence so far, for the duel: the player's plan and what the neighbors have built. */
  refreshLive() {
    // Nothing built yet: all bars at zero.
    const none = (res) => ({ ...res, total: 0, rows: res.rows.map((r) => ({ ...r, score: 0 })) });
    const me = judge(this.plan(), this.round);
    const them = judge(this.nbIds, this.round, this.round.nbBrief);
    this.live = this.plan().length ? me : none(me);
    this.nbLive = this.nbIds.length ? them : none(them);
    for (const d of Object.values(this.duel ?? {})) d.redraw();
  }

  /** Exactly one short message near the house, for about two seconds (a speech tag of the builders goes away for it). */
  say(text, token = 'xr-panel-text', icon = null) {
    this.clearTags();
    this.coachText = null;
    this.coach.redraw();
    this.note = { text, token, icon, until: this.time + (this.calm ? 3 : 2.3) };
    this.ask.redraw();
    this.relayout();
  }

  /** Every action of the player: what was open on demand closes, the hint goes away. */
  act() {
    this.legendOn = false;
    if (this.coachText) { this.coachText = null; this.coach.redraw(); }
    this.coachWait = null;
    this.relayout();
  }

  /** One short sentence beside the thing it explains, once (first round, or the relaxed mode); it waits while a message shows. */
  coachSay(key) {
    if (!this.coachOn || !key || this.told.has(key)) return;
    this.told.add(key);
    this.coachWait = key;
    if (key === 'meter') { try { localStorage.setItem(COACH_KEY, '1'); } catch { /* private mode */ } }
  }

  clearTags() {
    for (const s of this.tags) { s.removeFromParent(); s.material.map.dispose(); s.material.dispose(); }
    this.tags = [];
  }

  /** A short speech tag over the builders (instead of a message, never beside one). */
  tag(text, token) {
    this.clearTags();
    this.note = null;
    this.ask.redraw();
    const c = document.createElement('canvas');
    const px = 44;
    c.width = 1024;
    c.height = 128;
    const ctx = c.getContext('2d');
    const [w, h] = drawTag(ctx, text, token, px);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.repeat.set(w / c.width, h / c.height);
    tex.offset.set(0, 1 - h / c.height);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, toneMapped: false }));
    sp.renderOrder = 8;
    sp.userData.noFit = true;
    sp.userData.aspect = w / h;
    sp.userData.until = this.time + (this.calm ? 3.2 : 2.6);
    sp.position.copy(this.family.group.position).add(new THREE.Vector3(0, this.family.height * 1.25 + 0.07, 0));
    this.plotRoot.add(sp);
    this.tags = [sp];
    this.sizeTags();
  }

  /** Speech tags keep a readable size on every screen (about 16 px of text; in the headset the smallest text size). */
  sizeTags() {
    if (!this.tags.length) return;
    const lineH = this.engine.isXR ? num('xr-text-sm') * 1.15 : 16 / (window.innerHeight / (2 * (this.camD ?? 1) * Math.tan(THREE.MathUtils.degToRad(30))));
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
      } else if ((k === 'd' || k === 'D') && this.mode === 'check') {
        e.preventDefault();
        this.toggleDetails();
      } else if ((k === 'e' || k === 'E') && this.mode === 'choose') {
        e.preventDefault();
        this.toggleDrawer();
      } else if (k.startsWith('Arrow') && this.mode === 'choose' && this.cards.length) {
        e.preventDefault();
        const cols = this.cardCols ?? this.cards.length;
        const i = this.cards.indexOf(focus);
        const d = k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : k === 'ArrowUp' ? -cols : cols;
        const next = i < 0 ? 0 : (cols === 1 && (k === 'ArrowLeft' || k === 'ArrowRight') ? i : clamp(i + d, 0, this.cards.length - 1));
        this.engine.setFocus(this.cards[next]);
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

  /** The big button: build (after the brief), confirm the extras, go on in the check. */
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
    return t('bricksHud', { n: Math.min(this.step + 1, STEPS.length), name: t(`bricksStep_${STEPS[this.step]}`) });
  }

  /** Which layout the cards use: a row (desktop), a column (phone upright), beside (phone sideways), or the headset. */
  kind() {
    if (this.engine.isXR) return 'xr';
    const a = window.innerWidth / window.innerHeight;
    if (a < 0.85) return 'col';
    return this.engine.touchUI && window.innerHeight < 520 ? 'side' : 'row';
  }

  /** Shows the cards of the current step. */
  openStep() {
    this.mode = 'choose';
    const extras = this.step === DECISIONS.length;
    this.drawer = false;
    this.briefOpen = false;
    // What can no longer change becomes one mesh per material (few draw calls): everything but the last choice and the extras.
    this.house.freeze([DECISIONS[this.step - 1], 'extras']);
    this.nb.house.freeze();
    if (extras) {
      // The list becomes real: what is earmarked gets built, one after the other.
      this.extras.filter((id) => !this.built.has(id)).forEach((id, i) => this.delay(0.15 + i * 0.4, () => { if (!this.disposed && this.extras.includes(id) && this.step === DECISIONS.length && this.mode === 'choose') this.buildExtra(id); }));
    } else {
      this.advice = this.ai.advise(this.choices, this.lockedNow());
    }
    this.makeCards();
    this.setLabel(this.goBtn, t('bricksConfirm'));
    this.backBtn.set({ disabled: this.step === 0 || this.undone.has(this.step - 1) });
    this.refreshPanels();
    this.relayout();
    if (this.engine.focus && !this.engine.isXR) this.engine.setFocus(null);
    this.coachSay(['budget', 'chips', 'ai'][this.step]);
  }

  /** The cards of the current step the money does not allow. */
  lockedNow() {
    const room = this.free() + reserve(this.round, this.step) - reserve(this.round, this.step + 1);
    return this.round.catalogue[DECISIONS[this.step]].filter((o) => o.price > room).map((o) => o.id);
  }

  /**
   * At most two chips for a card: a wish of the family it fulfills, then what its price buys
   * (an arrow up or down and the criterion), then its plainest tag.
   */
  chipsFor(o) {
    const out = [];
    const b = this.round.brief;
    const mine = this.plan().filter((id) => id !== o.id).map((id) => OPTION[id]);
    if (this.easy) {
      // Relaxed mode: the card says what it clashes with.
      const clash = mine.find((x) => clashes(x.id, o.id));
      const styles = mine.map((x) => x.style).filter(Boolean);
      const main = styles.sort((x, y) => styles.filter((z) => z === y).length - styles.filter((z) => z === x).length)[0];
      if (clash) out.push({ icon: 'down', text: t('bricksWarnClash', { a: optShort(clash.id) }), kind: 'down' });
      else if (o.style && main && o.style !== main) out.push({ icon: 'down', text: t('bricksWarnStyle'), kind: 'down' });
    }
    const wish = !!o.gives && b.needs.includes(o.gives) && !needMet(o.gives, mine);
    if (wish) out.push({ icon: o.gives, text: t(`bricksNeed_${o.gives}`), kind: 'wish' });
    const g = gains(this.plan(), o, this.round);
    const keys = ['unity', 'people', 'place', 'future'];
    keys.map((key, i) => ({ key, v: g[i] })).filter((x) => Math.abs(x.v) >= 5 && !(wish && x.key === 'people')).sort((a, c) => Math.abs(c.v) - Math.abs(a.v))
      .forEach((x) => out.push({ icon: x.v > 0 ? 'up' : 'down', text: t(`bricksCritShort_${x.key}`), kind: x.v > 0 ? 'up' : 'down' }));
    if (out.length < 2) {
      const tag = tagsOf(o).find((c) => c.kind !== 'wish') ?? tagsOf(o)[0];
      if (tag) out.push({ icon: tag.kind === 'style' ? 'unity' : tag.kind === 'wish' ? o.gives : 'future', text: tag.text, kind: 'tag' });
    }
    return out.slice(0, 2);
  }

  /** What a card says about itself right now. */
  cardState(o, i) {
    const extras = o.decision === 'extras';
    const selected = extras ? this.extras.includes(o.id) : undefined;
    const room = extras ? this.free() : this.free() + reserve(this.round, this.step) - reserve(this.round, this.step + 1);
    const locked = !selected && o.price > room;
    const f = (extras ? this.extrasAdvice : this.advice)?.find((a) => a.id === o.id) ?? null;
    const s = { id: o.id, index: i + 1, locked, missing: locked ? o.price - room : 0, selected, forecast: f, compact: extras, words: this.easy, chips: this.chipsFor(o), thumb: this.thumbs?.get(o.id) ?? null };
    if (!extras) {
      const cheap = this.round.cheapest[o.decision];
      s.basic = cheap.id === o.id;
      s.more = s.basic ? 0 : o.price - cheap.price;
    }
    return s;
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
    this.cards.forEach((c, i) => { c.state = { ...this.cardState(OPTION[c.optId], i), hover: c.state.hover, focus: c.state.focus }; c.relabel(); c.redraw(); });
  }

  refreshPanels() {
    this.redrawSmall();
    this.refreshCards();
    this.refreshHud?.();
  }

  /** The extras open in place of the step's cards, and close again. */
  toggleDrawer() {
    if (this.mode !== 'choose' || this.step === DECISIONS.length) return;
    this.act();
    this.drawer = !this.drawer;
    this.briefOpen = false;
    sfx.click?.();
    this.makeCards();
    this.refreshPanels();
    this.relayout();
    if (this.engine.focus && !this.engine.isXR) this.engine.setFocus(null);
  }

  /** A card is pressed (a click, a tap, a number key, the trigger). */
  pick(card) {
    if (this.mode !== 'choose') return;
    this.act();
    this.briefOpen = false;
    const o = OPTION[card.optId];
    if (o.decision === 'extras') { this.toggleExtra(o); return; }
    if (card.state.locked) {
      sfx.bounce?.();
      const wish = this.earmarked();
      this.say(wish > 0 ? t('bricksLockedWish', { n: euro(card.state.missing), w: euro(wish) }) : t('bricksNoMoney', { n: euro(card.state.missing) }), 'xr-danger', 'lock');
      return;
    }
    this.choose(o);
  }

  /** One short message right after a choice: the reason in a few words and the criterion it moved. */
  feedback(o, before, after) {
    const mine = this.plan().filter((id) => id !== o.id);
    const b = this.round.brief;
    // The criterion's change in points, where it says the same as the message (not at the very first choice, where every bar starts from nothing).
    const delta = (key, good) => {
      if (!mine.length) return '';
      const i = ['unity', 'people', 'place', 'future', 'value'].indexOf(key);
      const d = after.rows[i].score - before.rows[i].score;
      return d && d > 0 === good ? ` · ${t(`bricksCritShort_${key}`)} ${signed(d)}` : '';
    };
    const clash = mine.find((id) => clashes(id, o.id));
    if (clash) return [t('bricksFb_clash', { a: optShort(clash), b: optShort(o.id) }) + delta('unity', false), 'xr-danger', 'down'];
    for (const k of b.place.weather) if (o.w?.[k] < 0) return [t('bricksFb_weatherBad', { w: t(`bricksWeather_${k}`) }) + delta('place', false), 'xr-danger', 'down'];
    for (const k of b.place.weather) if (o.w?.[k] > 0) return [t('bricksFb_weatherGood', { w: t(`bricksWeather_${k}`) }) + delta('place', true), 'xr-success', 'up'];
    const styles = mine.map((id) => OPTION[id].style).filter(Boolean);
    if (o.style && styles.length && styles.every((s) => s === o.style)) return [t('bricksFb_style') + delta('unity', true), 'xr-success', 'up'];
    const d = mine.length ? after.total - before.total : 0;
    return [`${t('bricksFb_plain', { a: optShort(o.id) })}${d ? ` · ${signed(d)}` : ''}`, 'xr-panel-text', d > 0 ? 'up' : d < 0 ? 'down' : null];
  }

  /** The builders react: joy when a wish comes true, doubt when its chance has passed. Returns whether they said something. */
  react(o, decided = null) {
    const b = this.round.brief;
    const opts = this.plan().map((id) => OPTION[id]);
    const others = opts.filter((x) => x !== o);
    if (o.gives && b.needs.includes(o.gives) && !needMet(o.gives, others)) {
      this.family.cheer();
      this.tag(t(`bricksTagYes_${o.gives}`), 'xr-success');
      return true;
    }
    if (b.needs.includes('easy') && o.u < 0) { this.family.doubt(); this.tag(t('bricksTagNo_easy'), 'xr-warning'); return true; }
    if (!decided) return false;
    // A wish this step could have fulfilled, still open, and no extra earmarked for it.
    const missed = b.needs.find((n) => n !== 'easy' && !needMet(n, opts) && this.round.catalogue[decided].some((x) => x.gives === n));
    if (missed) { this.family.doubt(); this.tag(t(`bricksTagNo_${missed}`), 'xr-warning'); return true; }
    return false;
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
    this.mode = 'build';
    bsfx.pick();
    this.hideCards();
    // Exactly one reaction: the builders' speech tag when a wish is at stake, else a short message.
    if (!this.react(o, o.decision)) this.say(...this.feedback(o, before, this.live));
    let time;
    if (o.decision === 'roof') time = this.craneRoof(o.id);
    else {
      time = this.house.build(o.decision, o.id);
      this.buildFx(o.decision, time);
    }
    if (this.nbStep < this.step) this.delay(0.35, () => { if (!this.disposed) this.neighborBuilds(); });
    if (o.decision === 'garden') { this.parkCrane(); if (this.firLights) this.firLights.visible = this.house.firVisible; }
    this.refreshPanels();
    this.relayout();
    this.coachSay(this.step === 1 ? 'wish' : this.step === 3 ? 'meter' : null);
    this.delay(time + 0.25, () => { if (!this.disposed && this.mode === 'build') this.openStep(); });
  }

  buildExtra(id) {
    if (this.built.has(id)) return;
    this.built.add(id);
    const time = this.house.build('extras', id);
    this.buildFx('extras', time, id);
    this.redrawSmall();
  }

  /** An extra is earmarked or struck off again (as often as the player likes, until confirming). */
  toggleExtra(o) {
    if (this.mode !== 'choose') return;
    const before = this.live;
    if (this.extras.includes(o.id)) {
      this.extras = this.extras.filter((id) => id !== o.id);
      if (this.built.has(o.id)) { this.built.delete(o.id); this.house.remove('extras', o.id); }
      bsfx.undo();
      this.refreshLive();
      this.say(t('bricksFb_unear', { a: optShort(o.id) }), 'xr-panel-muted');
    } else {
      if (o.price > this.free()) {
        sfx.bounce?.();
        this.say(t('bricksNoMoney', { n: euro(o.price - this.free()) }), 'xr-danger', 'lock');
        return;
      }
      this.extras.push(o.id);
      bsfx.pick();
      this.refreshLive();
      if (this.step === DECISIONS.length) this.buildExtra(o.id);
      if (!this.react(o)) {
        const d = this.live.total - before.total;
        this.say(`${t('bricksFb_ear', { a: optShort(o.id) })}${d ? ` · ${signed(d)}` : ''}`, d < 0 ? 'xr-danger' : 'xr-success', d < 0 ? 'down' : 'up');
      }
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
    this.act();
    // What stood of the extras comes down again (they stay earmarked).
    for (const id of this.built) this.house.remove('extras', id);
    this.built.clear();
    this.step -= 1;
    const id = this.choices.pop();
    this.records.pop();
    this.undone.add(this.step);
    this.house.remove(DECISIONS[this.step]);
    if (DECISIONS[this.step] === 'garden' && this.firLights) this.firLights.visible = false;
    if (DECISIONS[this.step] === 'roof') this.crane.setSlings(null);
    bsfx.undo();
    this.refreshLive();
    this.say(t('bricksUndo', { a: optShort(id) }), 'xr-panel-muted');
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
    const id = (this.parkId = (this.parkId ?? 0) + 1); // a new job for the crane cancels the parking
    this.tween(1.0, (k) => { if (this.parkId === id) c.root.scale.set(1, Math.max(0.02, 1 - k), 1); }, { ease, onDone: () => { if (this.parkId === id) c.root.visible = false; } });
  }

  /** The crane lowers the roof onto the walls by itself. Returns the time it takes (s). */
  craneRoof(id) {
    const c = this.crane;
    const slow = this.calm ? 1.3 : 1;
    this.parkId = (this.parkId ?? 0) + 1;
    c.root.visible = true;
    c.root.scale.set(1, 1, 1);
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
      if (!this.disposed) this.parkCrane(); // its work is done
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

  /** The extras are confirmed: the plan is final, the neighbors finish, the check begins. */
  confirmExtras() {
    if (this.mode !== 'choose') return;
    this.act();
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
    const diff = me.total - them.total;
    const names = (list) => list.map((b) => optShort(b.id ?? b)).join(', ');
    const paid = me.bought.filter((b) => b.gain > 0).sort((a, b) => b.gain - a.gain);
    const not = me.bought.filter((b) => b.gain <= 0).sort((a, b) => b.price - a.price);
    // One tip: the single change that would have added most, else what the best plan had instead.
    const change = bestChange(all, this.round);
    const other = bestHouse(this.round).filter((id) => !all.includes(id));
    const tip = change ? t(`bricksTipShort_${change.key}`, { a: optShort(change.a), b: change.b ? optShort(change.b) : '' })
      : this.round.best > me.total && other.length ? t('bricksTipShort_plan', { list: names(other.slice(0, 2)) }) : t('bricksTipShort_none');
    const budget = this.round.brief.budget;
    // The summary: at most three short lines.
    const lines = [
      paid.length ? { text: t('bricksBestBuy', { a: optShort(paid[0].id), n: Math.max(1, Math.round(paid[0].gain)) }), token: 'xr-success' } : { text: t('bricksBoughtNone') },
      not.length ? { text: t('bricksWorstBuy', { a: optShort(not[0].id) }), token: 'xr-danger' } : { text: t('bricksNoWaste'), token: 'xr-success' },
      { text: tip, token: 'xr-warning' },
    ];
    // The details, on demand: both shopping lists and budgets, the best plan, the loan.
    const details = [
      { text: t('bricksDetMe', { spent: euro(me.price), budget: euro(budget), list: me.bought.length ? names(me.bought) : t('bricksBoughtNone') }), token: 'xr-bricks-you' },
      { text: t('bricksDetNb', { kind: t(`bricksNbKind_${this.round.neighbor.kind}`), spent: euro(them.price), list: them.bought.length ? names(them.bought) : t('bricksBoughtNone') }), token: 'xr-bricks-neighbor' },
      { text: t('bricksDetBest', { n: this.round.best, list: names(bestHouse(this.round)) }) },
      me.left > 0 ? { text: t('bricksDetLoan', { n: euro(me.left) }), token: 'xr-success' } : null,
    ].filter(Boolean);
    this.loanText = me.left > 0 ? t('bricksLoanLess', { n: euro(me.left) }) : t('bricksLoanAll', { n: euro(this.round.brief.loan) });
    this.buyText = lines.map((l) => l.text).join('. ');
    const verdict = diff > 0 ? t('bricksWin', { n: points(diff) }) : diff < 0 ? t('bricksLose', { n: points(-diff) }) : t('bricksTie');
    this.mode = 'check';
    this.note = null;
    this.clearTags();
    this.ask.redraw();
    this.check = { me, them, stage: 0, grow: 0, t: 0, verdict, lines, details, wait: this.calm ? 2.2 : 1.6, final: false };
    this.checkPanel = checkPanel(() => this.check);
    this.checkPanel.userData.noFit = true;
    this.ui.add(this.checkPanel);
    this.setLabel(this.goBtn, t('bricksSkip'));
    if (this.engine.isXR) this.sideBySideXR();
    this.refreshPanels();
    this.relayout();
  }

  /** The button in the check: skip to the summary, then on to the result. */
  checkOn() {
    const c = this.check;
    if (c.stage < c.me.rows.length) { c.wait = 0; this.showSummary(); return; }
    this.finish();
  }

  toggleDetails() {
    const c = this.check;
    if (!c?.final) return;
    c.stage = c.stage === c.me.rows.length ? c.me.rows.length + 1 : c.me.rows.length;
    sfx.click?.();
    this.checkPanel.redraw();
  }

  showSummary() {
    const c = this.check;
    c.stage = c.me.rows.length;
    c.grow = 0;
    c.t = 0;
    this.markMe.visible = false;
    this.markNb.visible = false;
  }

  /** Puts the pointer over the part a reason is about (or hides it). */
  point(mark, house, why) {
    const id = why?.a;
    const spot = id ? SPOT[id] ?? SPOT[OPTION[id].decision] : null;
    if (!spot) { mark.visible = false; return; }
    const y = OPTION[id].decision === 'roof' || id === 'solar' ? (house.roofTop ?? TOP) + 0.07 : spot[1] + 0.05;
    mark.visible = true;
    mark.position.set(spot[0], y + (this.calm ? 0 : Math.abs(Math.sin(this.time * 4)) * 0.012), spot[2]);
  }

  /** The check is staged: one criterion at a time, then the summary; then the lights go on. */
  updateCheck(dt) {
    const c = this.check;
    if (!c || this.mode !== 'check') return;
    if (c.wait > 0) { c.wait -= dt; if (c.wait <= 0) { this.house.freeze(); this.nb.house.freeze(); bsfx.row(); } return; }
    const rows = c.me.rows.length;
    const grow = c.grow;
    c.t += dt;
    c.grow = Math.min(1, c.t / (this.calm ? 0.9 : 0.6));
    if (c.stage < rows) {
      this.point(this.markMe, this.house, c.me.rows[c.stage].why);
      this.point(this.markNb, this.nb.house, c.them.rows[c.stage].why);
      if (c.t > (this.calm ? 3.2 : 2.5)) {
        if (c.stage + 1 < rows) { c.stage += 1; c.grow = 0; c.t = 0; bsfx.row(); } else this.showSummary();
      }
    } else if (c.grow >= 1 && !c.final) {
      c.final = true;
      this.setLabel(this.goBtn, t('bricksNext'));
      this.celebrate();
      this.relayout();
    }
    if (c.grow !== grow || !c.drawn || c.drawnStage !== c.stage) { c.drawn = true; c.drawnStage = c.stage; this.checkPanel.redraw(); }
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
    // The builders walk up to their door.
    const g = this.family.group;
    const from = g.position.clone();
    const to = new THREE.Vector3(0.07, 0.002, HOUSE_Z + OZ + 0.1);
    this.tween(this.calm ? 2.4 : 1.6, (k) => g.position.lerpVectors(from, to, k), { ease, onDone: () => { if (!this.disposed && this.mode === 'check') this.tag(t('bricksTagHome'), 'xr-success'); } });
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
    this.clearTags();
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
      { q: t('bricksLearn3Q'), a: `${this.buyText}. ${this.loanText}` },
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
    if (this.note && this.time > this.note.until) { this.note = null; this.ask.redraw(); this.relayout(); }
    if (this.tags.length && this.time > this.tags[0].userData.until) this.clearTags();
    // A hint waits until no message shows, and only appears while the player decides.
    if (this.coachWait && !this.note && !this.tags.length && this.mode === 'choose') {
      this.coachAt = this.coachWait;
      this.coachText = t(`bricksCoach_${this.coachWait}`);
      this.coachWait = null;
      this.coach.redraw();
      this.relayout();
    }
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
   * The screen layout (CSS px) for the current mode: where the plot is seen, and where the few
   * panels go. Desktop: who builds, the money and the extras at the left edge, the duel and
   * the neighbors' plot at the right, the house large between them, the three cards below.
   * Phone upright: who and the money in one row, the duel in the next, the house, the buttons,
   * the cards in a column. Phone sideways: the small panels at the left, the house in the
   * middle, the cards at the right. Text is at least 16 px on the desktop and 14 px on phones.
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
      const rowW = clamp(free, 300, 600);
      const ppm = rowW / 1.27;
      hud = { ppm, x0: m + Math.max(0, (free - rowW) / 2), y: m };
      top = m + 0.15 * ppm + 6;
    }
    const out = { W, Hh, kind, hud, show: {} };
    const s = out.show;
    const extras = this.step === DECISIONS.length;
    const grid = extras || this.drawer;
    const n = this.cards.length;
    const [cw, ch] = CARD[kind][grid ? 1 : 0];
    const [bw, bh] = BRIEF;
    if (this.mode === 'brief') {
      const pw = Math.min(W - 2 * m, 460, ((Hh - top - (this.offerSame ? 200 : 140)) / bh) * bw);
      const ph = (pw / bw) * bh;
      const y0 = top + Math.max(m, (Hh - top - ph - (this.offerSame ? 190 : 130)) / 2);
      s.brief = { x: (W - pw) / 2, y: y0, w: pw, h: ph };
      s.hint = { x: (W - Math.min(W - 2 * m, 560)) / 2, y: y0 + ph + 2, w: Math.min(W - 2 * m, 560), h: 62, wrap: kind === 'row' ? 470 : 410 };
      s.go = { x: W / 2 - 115, y: y0 + ph + 68, w: 230, h: 52 };
      if (this.offerSame) s.same = { x: W / 2 - 115, y: y0 + ph + 126, w: 230, h: 48 };
      out.plot = { x: 0, y: top, w: W, h: Hh - top };
      return out;
    }
    if (this.mode === 'check' || this.mode === 'over') {
      const [pw, ph] = CHECK_SIZE;
      const btnH = 50;
      const final = !!this.check?.final;
      if (kind === 'side') {
        const ppm = Math.min(410, (Hh - top - btnH - 2 * m) / ph);
        const w = pw * ppm;
        s.check = { x: W - m - w, y: top, w, h: ph * ppm };
        s.go = { x: W - m - 190, y: Hh - m - btnH + 4, w: 190, h: btnH - 4 };
        if (final) s.details = { x: W - m - w, y: Hh - m - btnH + 4, w: 130, h: btnH - 4 };
        out.plot = { x: 0, y: top + 30, w: W - w - 2 * m, h: Hh - top - 30 - m };
      } else {
        const ppm = kind === 'row' ? clamp(W / 2.3, 460, 560) : (W - 2 * m) / pw;
        const w = pw * ppm;
        const h = ph * ppm;
        const y = Hh - m - btnH - m - h;
        s.check = { x: (W - w) / 2, y, w, h };
        s.go = { x: W / 2 + (final ? 4 : -100), y: Hh - btnH - m + 4, w: 200, h: btnH - 4 };
        if (final) s.details = { x: W / 2 - 154, y: Hh - btnH - m + 4, w: 150, h: btnH - 4 };
        out.plot = { x: 0, y: top + 30, w: W, h: y - top - 34 };
      }
      const lw = Math.min(180, out.plot.w * 0.44);
      s.labelMe = { x: out.plot.x + out.plot.w * 0.25 - lw / 2, y: top, w: lw, h: 28, wrap: kind === 'row' ? 460 : 400 };
      s.labelNb = { x: out.plot.x + out.plot.w * 0.75 - lw / 2, y: top, w: lw, h: 28, wrap: kind === 'row' ? 460 : 400 };
      out.both = true;
      return out;
    }
    const cardsOn = this.mode === 'choose';
    const msg = { h: 40, wrap: kind === 'row' ? 460 : 400 }; // the one message, and a hint
    if (kind === 'row') {
      const cols = grid ? 4 : 3;
      const rows = grid ? 2 : 1;
      const cardW = Math.min((W - (cols + 1) * m) / cols, grid ? 330 : 440);
      const cardH = (cardW / cw) * ch;
      const cardsH = rows * cardH + (rows - 1) * m;
      const cardsY = Hh - m - cardsH;
      const x0 = (W - cols * cardW - (cols - 1) * m) / 2;
      out.cards = Array.from({ length: n }, (_, i) => ({ x: x0 + (i % cols) * (cardW + m), y: cardsY + Math.floor(i / cols) * (cardH + m), w: cardW, h: cardH }));
      out.cols = cols;
      const sideW = clamp(W * 0.22, 240, 330);
      const k = sideW / 0.52;
      let y = top + 4;
      s.whoTall = { x: m, y, w: sideW, h: 0.27 * k };
      y += 0.27 * k + 6;
      s.moneyTall = { x: m, y, w: sideW, h: 0.16 * k };
      const moneyY = y;
      y += 0.16 * k + 6;
      const extrasY = y;
      if (extras) s.go = { x: m, y, w: sideW, h: 0.11 * k };
      else s.extras = { x: m, y, w: sideW, h: 0.11 * k };
      y += 0.11 * k + 6;
      s.back = { x: m, y, w: 120, h: 44 };
      s.duelTall = { x: W - m - sideW, y: top + 4, w: sideW, h: 0.24 * k };
      out.pip = { x: W - m - sideW, y: top + 0.24 * k + 12, w: sideW, h: Math.min(sideW * 0.62, cardsY - top - 0.24 * k - 60) };
      s.nbTag = { x: W - m - sideW, y: out.pip.y + out.pip.h, w: sideW, h: 30, wrap: 460 };
      const px = sideW + 2 * m;
      const pw = W - 2 * sideW - 4 * m;
      out.plot = { x: px, y: top + 16, w: pw, h: cardsY - top - 16 - msg.h - 6 };
      s.dots = { x: px + pw / 2 - 80, y: top + 2, w: 160, h: 13 };
      s.ask = { x: px, y: cardsY - msg.h - 4, w: pw, ...msg };
      const at = { budget: { x: px, y: moneyY, w: 330 }, wish: { x: px, y: extrasY, w: 330 }, meter: { x: W - sideW - 2 * m - 330, y: top + 20, w: 330 } }[this.coachAt] ?? { x: px, y: cardsY - msg.h - 4, w: pw };
      if (this.coachText) s.coach = { ...at, ...msg, h: 60 };
      if (this.briefOpen) s.brief = { x: px + pw / 2 - 210, y: top + 20, w: 420, h: (420 / bw) * bh };
    } else if (kind === 'col') {
      const cols = 1;
      const rows = grid ? 8 : 3;
      const cardW = W - 2 * m;
      const k = cardW / 0.9;
      const rowH = 0.13 * k;
      const duelH = 0.105 * k;
      const btnH = 48;
      const cardH = Math.min((cardW / cw) * ch, (Hh - top - rowH - duelH - btnH - (grid ? 84 : 190) - (rows + 4) * 5) / rows);
      const cardsH = rows * cardH + (rows - 1) * 5;
      const cardsY = Hh - m - cardsH;
      out.cards = Array.from({ length: n }, (_, i) => ({ x: m, y: cardsY + i * (cardH + 5), w: cardW, h: cardH }));
      out.cols = cols;
      const whoW = (cardW * 0.56) / 0.9 - 3;
      s.whoHalf = { x: m, y: top + 2, w: whoW, h: rowH };
      s.moneyHalf = { x: m + whoW + 6, y: top + 2, w: cardW - whoW - 6, h: rowH };
      const y0 = top + rowH + 7;
      s.duelWide = { x: m, y: y0, w: cardW, h: duelH };
      const btnY = cardsY - btnH - 4;
      const py = y0 + duelH + 4;
      s.dots = { x: W / 2 - 70, y: py, w: 140, h: 12 };
      out.plot = { x: 0, y: py + 14, w: W, h: btnY - py - 14 - msg.h };
      out.pip = { x: W * 0.7, y: py + 14, w: W * 0.3 - 4, h: Math.min(70, out.plot.h * 0.4) };
      s.ask = { x: m, y: btnY - msg.h, w: cardW, ...msg };
      if (this.coachText) s.coach = { x: m, y: this.coachAt === 'budget' || this.coachAt === 'meter' ? py + 16 : btnY - 62, w: cardW, ...msg, h: 60 };
      s.back = { x: m, y: btnY, w: 104, h: btnH - 4 };
      if (extras) s.go = { x: m + 112, y: btnY, w: cardW - 112, h: btnH - 4 };
      else s.extras = { x: m + 112, y: btnY, w: cardW - 112, h: btnH - 4 };
      if (this.briefOpen) s.brief = { x: m, y: py + 4, w: cardW, h: Math.min((cardW / bw) * bh, btnY - py - 8) };
    } else {
      // A phone held sideways: the cards at the right, the small panels at the left, the house between them.
      const cols = grid ? 2 : 1;
      const rows = grid ? 4 : 3;
      const availH = Hh - top - m;
      // Small phones: a narrower side column, and cards never so wide that no room is left for the house.
      const sideW = Math.min(214, Math.max(150, W * 0.275));
      const minPlot = 96;
      let cardH = Math.min((availH - (rows - 1) * 5) / rows, ch * 420);
      let cardW = (cardH / ch) * cw;
      const maxColW = W - m - (sideW + 2 * m) - m - minPlot;
      if (cols * cardW + (cols - 1) * 5 > maxColW) {
        cardW = (maxColW - (cols - 1) * 5) / cols;
        cardH = (cardW / cw) * ch;
      }
      const colW = cols * cardW + (cols - 1) * 5;
      const x0 = W - m - colW;
      out.cards = Array.from({ length: n }, (_, i) => ({ x: x0 + (i % cols) * (cardW + 5), y: top + Math.floor(i / cols) * (cardH + 5), w: cardW, h: cardH }));
      out.cols = cols;
      const k = sideW / 0.52;
      let y = top;
      s.whoLow = { x: m, y, w: sideW, h: 0.2 * k };
      y += 0.2 * k + 4;
      s.moneyTall = { x: m, y, w: sideW, h: 0.16 * k };
      y += 0.16 * k + 4;
      s.duelTall = { x: m, y, w: sideW, h: 0.24 * k };
      y += 0.24 * k + 4;
      if (extras) s.go = { x: m, y, w: sideW, h: Math.max(44, 0.11 * k) };
      else s.extras = { x: m, y, w: sideW, h: Math.max(44, 0.11 * k) };
      const px = sideW + 2 * m;
      const pw = x0 - px - m;
      s.dots = { x: px + pw / 2 - 60, y: top, w: 120, h: 11 };
      out.plot = { x: px, y: top + 12, w: pw, h: availH - 12 - 48 };
      out.pip = { x: px + pw * 0.6, y: top + 12, w: pw * 0.4, h: 56 };
      s.back = { x: px, y: Hh - m - 44, w: 84, h: 44 };
      s.ask = { x: px + 88, y: Hh - m - 46, w: pw - 88, ...msg, h: 46 };
      if (this.coachText) s.coach = { x: px, y: top + 14, w: pw, ...msg, h: 66 };
      if (this.briefOpen) s.brief = { x: px, y: top + 4, w: Math.max(pw, 300), h: availH - 8 };
    }
    if (!cardsOn) { out.cards = []; delete s.go; delete s.back; delete s.extras; delete s.coach; delete s.brief; }
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
    const has = (list) => list.some((id) => this.extras.includes(id));
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
    set(this.brief, s.brief);
    set(this.who.tall, s.whoTall);
    set(this.who.low, s.whoLow);
    set(this.who.half, s.whoHalf);
    set(this.money.tall, s.moneyTall);
    set(this.money.half, s.moneyHalf);
    set(this.duel.tall, s.duelTall);
    set(this.duel.wide, s.duelWide);
    set(this.extrasBtn, s.extras);
    set(this.dots, s.dots);
    set(this.ask, this.note ? s.ask : null);
    set(this.coach, this.coachText ? s.coach : null);
    set(this.hint, s.hint);
    set(this.labelMe, s.labelMe);
    set(this.labelNb, s.labelNb);
    set(this.backBtn, s.back);
    set(this.goBtn, s.go);
    set(this.detailsBtn, s.details);
    set(this.sameBtn, s.same);
    if (this.checkPanel) set(this.checkPanel, s.check);
    this.cardCols = lay.cols;
    this.cards.forEach((c, i) => { const r = lay.cards?.[i]; if (r) this.fit(c, r); else c.visible = false; });
    // The neighbors: a little picture of their plot in a corner; in the check they stand next to the player's.
    const nb = this.nb;
    if (both) {
      nb.root.visible = true;
      nb.root.position.copy(this.plotRoot.position).add(wide ? new THREE.Vector3(1.2, 0, 0) : new THREE.Vector3(0.66, 0, -0.96));
      nb.root.quaternion.identity();
      nb.root.scale.setScalar(1);
    } else if (lay.pip && lay.pip.h > 36 && !this.briefOpen) {
      const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.5, 0.25, 0, 'YXZ'));
      const ppm = Math.min(lay.pip.w / 1.45, lay.pip.h / 0.8);
      nb.root.visible = true;
      this.pin(nb.root, lay.pip.x + lay.pip.w / 2, lay.pip.y + lay.pip.h / 2 + ppm * 0.2, ppm, 0.6, tilt);
    } else nb.root.visible = false;
    set(this.labelNb, both ? s.labelNb : nb.root.visible ? s.nbTag : null);
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
   * behind it with a name tag. Three cards hang on an arc at eye height about a meter away
   * (pointing and pressing reaches them). Who builds, the money and the button of the extras
   * are small panels at the left, the duel at the right; the whole brief and the extras open
   * on demand. Nothing is behind the player. Panels are a little larger than their drawing
   * size, so no text is below the smallest size.
   */
  placeXR() {
    const key = `${this.mode}|${this.step}|${this.cards.length}|${this.drawer}|${this.checkPanel ? this.check.final : 0}|${this.coachText ? this.coachAt : 0}|${this.note ? 1 : 0}|${this.briefOpen}`;
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
      arc(this.brief, 0, eye + 0.3, 1.0);
      arc(this.hint, 0, eye - 0.12, 0.98);
      arc(this.goBtn, 0, eye - 0.27, 0.95, 1.3);
      if (this.offerSame) arc(this.sameBtn, 0.62, eye - 0.27, 0.95, 1.2);
    } else if (this.mode === 'check') {
      arc(this.checkPanel, 0, eye + 0.3, 1.05);
      arc(this.labelMe, -0.7, eye - 0.2, 1.0);
      arc(this.labelNb, 0.8, eye - 0.2, 1.0);
      arc(this.goBtn, this.check.final ? 0.2 : 0, eye - 0.1, 1.0, 1.3);
      if (this.check.final) arc(this.detailsBtn, -0.24, eye - 0.1, 1.0, 1.3);
    } else {
      const extras = this.step === DECISIONS.length;
      const grid = extras || this.drawer;
      arc(this.who.tall, -1.12, eye + 0.36, 1.0);
      arc(this.money.tall, -1.12, eye + 0.13, 1.0);
      if (!extras) arc(this.extrasBtn, -1.12, eye - 0.05, 1.0);
      arc(this.duel.tall, 1.12, eye + 0.32, 1.0);
      arc(this.dots, 0, eye + (grid ? 0.82 : 0.44), 1.05, 1.4);
      if (this.note) arc(this.ask, 0, eye + (grid ? 0.92 : 0.56), 1.05);
      if (this.coachText && this.mode === 'choose') arc(this.coach, this.coachAt === 'meter' ? 0.62 : this.coachAt === 'budget' || this.coachAt === 'wish' ? -0.6 : 0, eye + (grid ? 0.92 : 0.56), 1.05);
      if (this.briefOpen) arc(this.brief, -0.62, eye + 0.2, 0.92);
      if (this.mode === 'choose') {
        if (grid) {
          // Three columns: eight extras; in the last step the button to confirm takes the ninth place.
          this.cards.forEach((c, i) => arc(c, ((i % 3) - 1) * 0.66, eye + 0.6 - Math.floor(i / 3) * 0.27));
          if (extras) arc(this.goBtn, 0.66, eye + 0.6 - 2 * 0.27, 1.05, 1.3);
        } else this.cards.forEach((c, i) => arc(c, (i - 1) * 0.74, eye + 0.14));
        this.cardCols = 3;
        arc(this.backBtn, -1.12, eye - 0.21, 1.0, 1.3);
      }
    }
    if (this.mode !== 'check') {
      nb.root.position.set(-0.98, eye - 0.66, -1.12);
      nb.root.rotation.set(0, 0.55, 0);
      nb.root.scale.setScalar(0.55);
      if (this.mode !== 'brief') { const tg = this.labelNb; tg.visible = true; tg.scale.setScalar(S); tg.position.set(-0.98, eye - 0.36, -1.12); tg.rotation.set(0, 0.7, 0); }
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
    this.clearTags();
    for (const c of this.cards) c.dispose();
    for (const o of this.ui?.children ?? []) o.dispose?.();
    super.dispose();
  }
}
