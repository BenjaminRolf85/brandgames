// "Gipfelgespräch" / "Summit Talk": a climbing wall that is a sales conversation. Five sections
// of the wall are the five stages of the talk (opening, needs, value, objections, closing at
// the summit). The customer waits at the summit and says something; the holds within Echo's
// reach are the possible replies. Choosing a reply means taking hold of it and pulling yourself
// up on it: strong replies are solid holds (a soft click, Echo climbs, trust rises), acceptable
// ones wobble, weak ones break in the hand (a jolt, Echo slips, trust and strength drop; pick
// again). Strength drains while you hesitate, and every pull costs a little. Three customers of different types (analytical,
// relationship-oriented, decisive), each a full climb.
// The AI idea: an AI coach reads the customer's words (a small lexicon-based sentiment and
// customer-type analysis, summit-ai.js) and shows mood and type with its confidence, the signal
// words it reacted to and a tip; after the reply it shows whether it read the customer right.
// It misses irony, hesitation and problem words that are not aimed at you: the human reads more.
// Controls: Quest: grab a hold (grip, trigger or pinch near it, or point at it) and pull the hand
// down: the wall moves with the hand; let go and grab the next one. Comfort option in the intro:
// moves in jumps behind a short fade instead of continuous; a vignette while the wall moves.
// Desktop and phones: press on a hold (or its reply) and drag it down; a ring shows how far.
// Keys 1 to 3, a click without dragging and the answer buttons pull by themselves.
import * as THREE from 'three';
import { BaseScene } from '../scene.js';
import { textPanel, Button } from '../ui3d.js';
import { color, hex, num } from '../tokens.js';
import { t, L, getLang } from '../i18n.js';
import { sfx } from '../sfx.js';
import { music } from '../music.js';
import { quality } from '../quality.js';
import { EVENT } from '../event.js';
import { WINTER, makeSnowfall } from '../snow.js';
import { makeEnvironment } from '../robot-visuals.js';
import '../summit-text.js';
import { CUSTOMERS, STAGES } from '../summit-talks.js';
import { readLine, readType, isUnsure } from '../summit-ai.js';
import {
  loadSummitModels, makeMountain, Hold, makeDecorHolds, makeShards, Rope, ClimberEcho, makeSummitDecor,
  makeSky, makePeaks, makeClouds, surfaceZ, cutUniform, makePullHint, TOP, PLATEAU_Y, BOLTS,
} from '../summit-visuals.js';
import { holder, makeBubble, makeLabel, makeFeedback, makeCoach, makeStatus } from '../summit-panels.js';
import { phoneTalk } from '../summit-phone.js';
import { CustomerFigure } from '../summit-customer.js';

const WALL_Z = -num('xr-summit-wall-z');
const LS = num('xr-summit-label-scale');
const GRAB_R = num('xr-summit-grab-radius');
const ROUND = EVENT ? 2 : 3; // customers per round
const ROWS = [0.21, 0.45, 0.69, 0.93, 1.04]; // wall-local height of the reply holds per stage
// Where the view centers per stage (the last two lower, so the customer at the summit is in view).
const FOCUS = [0.21, 0.45, 0.69, 1.03, 1.2];
const XS = [-0.27, 0, 0.27]; // where the three reply holds sit
const START = new THREE.Vector3(0.02, 0.022, 0.06); // Echo's feet on the start ledge
const SUMMIT_SPOT = new THREE.Vector3(-0.01, PLATEAU_Y, 0.05); // Echo on the summit
const CUSTOMER_SPOT = new THREE.Vector3(0.16, PLATEAU_Y - 0.004, 0.03);
const CUSTOMER_SIZE = 0.44; // height of the customer at the summit (m)
const PORTRAIT_R = 0.11; // the close-up portrait next to the speech bubble (m)
const VIEW_TOP = TOP - 0.1; // focus while meeting the customer at the summit
const STAND_TO_HANG = new THREE.Vector3(0, 0.15, -0.075); // grip point standing (feet) -> hanging (wings)
// Points: per stage up to 200 (solid at the first try, with a speed bonus), at the summit 200
// plus 4 per % of trust, 200 more when every deal closes with at least 80 % trust: max 5000.
const PTS = { solid: 140, speed: 60, solidRetry: 70, ok: 60, okRetry: 30, summit: 200, trust: 4, bonus: 200 };
const TRUST = { start: 20, good: 16, ok: 6, bad: -10 };
const STAMINA = { drain: 1.1, grace: 1.5, bad: -20, good: 8, ok: 3, pull: 4 }; // pulling costs a little
const PULL_M = num('xr-summit-pull-reach'); // hand travel for one move (headset)
const BREAK_AT = 0.3; // a weak hold breaks when this much of the pull is on it
const COMFORT_KEY = 'kiar.summitComfort';
const clamp = THREE.MathUtils.clamp;
const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2);
const shuffle = (a) => { const r = [...a]; for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export class SummitScene extends BaseScene {
  constructor(app) {
    super(app);
    this.gameKey = 'summit';
    this.time = 0;
    this.mode = 'intro';
    this.timers = [];
    this.anims = [];
    this.shards = [];
    this.options = [];
    this.route = [];
    this.focus = 0.45;
    this.focusTo = 0.45;
    this.depth = -1.8;
    this.depthTo = -1.8;
    this.HOLD_Y = this.eye - 0.13;
    this.CLOUD_Y = this.eye - 0.8;
    this.ar = this.engine.isXR && this.engine.xrMode === 'immersive-ar';

    // Lighting and the room: a dusk sky replaces the preview room (not in AR).
    this.envTarget = makeEnvironment(this.engine.renderer);
    this.prevEnvironment = this.engine.scene.environment;
    this.engine.scene.environment = this.envTarget.texture;
    this.prevBackdrop = this.engine.backdrop.visible;
    this.engine.backdrop.visible = false;
    this.prevFog = this.engine.scene.fog?.color.getHex();
    this.engine.scene.fog?.color.setHex(hex('xr-summit-sky-mid'));
    this.shadows = !quality.lite;
    if (this.shadows) {
      this.prevShadow = this.engine.renderer.shadowMap.enabled;
      this.engine.renderer.shadowMap.enabled = true;
      this.engine.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    this.world = new THREE.Group();
    this.world.userData.noFit = true;
    this.group.add(this.world);
    this.hudGroup = new THREE.Group();
    this.hudGroup.visible = false;
    this.group.add(this.hudGroup);
    this.buildLights();
    this.buildBackdrop();
    this.buildPortrait();
    this.ready = loadSummitModels().then((M) => { if (!this.disposed) this.buildMountain(M); }).catch((e) => {
      // Without the models the game still runs (simple stand-ins).
      console.warn('Summit models not loaded', e);
      if (!this.disposed && !this.M) this.buildMountain({ wall: null, cust: null });
    });

    this.customers = this.pickCustomers();
    this.setupInput();
    this.onUpdate((dt) => this.update(dt));
    const hint = this.engine.isXR ? 'summitIntroXR' : this.engine.touchUI ? 'summitIntroTouch' : 'summitIntroScreen';
    this.intro(t('summitName'), `${t('summitIntro')} ${t(hint)}`, () => this.start());
    try { this.comfortSnap = localStorage.getItem(COMFORT_KEY) === 'snap'; } catch { this.comfortSnap = false; }
    if (this.engine.isXR) {
      this.addComfortButton();
      this.buildVignette();
    }
  }

  /** Headset: below the start button, continuous moves or moves in jumps (comfort). */
  addComfortButton() {
    const go = this.layer.children.find((o) => o instanceof Button && o.opts?.label === t('start'));
    if (!go) return;
    const label = () => t('summitComfort', { mode: t(this.comfortSnap ? 'summitComfortSnap' : 'summitComfortSmooth') });
    const btn = this.add(new Button(0.5, 0.09, {
      label: label(),
      onClick: (_, b) => {
        this.comfortSnap = !this.comfortSnap;
        try { localStorage.setItem(COMFORT_KEY, this.comfortSnap ? 'snap' : 'smooth'); } catch { /* private mode */ }
        b.opts.label = label();
        b.redraw();
      },
    }));
    btn.position.set(0, go.position.y - go.h / 2 - 0.04 - btn.h / 2, go.position.z);
    this.popIn(btn, 0.2);
    this.comfortBtn = btn;
  }

  /** Headset: a dark ring around the view while the wall moves (and a short fade for jumps). */
  buildVignette() {
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: { uA: { value: 0 }, uB: { value: 0 }, uColor: { value: new THREE.Color(hex('xr-summit-vignette')) } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform float uA; uniform float uB; uniform vec3 uColor; varying vec2 vUv;
        void main() {
          float r = length(vUv - 0.5);
          float a = max(smoothstep(0.1, 0.3, r) * uA, uB);
          if (a < 0.004) discard;
          gl_FragColor = vec4(uColor, a);
          #include <colorspace_fragment>
        }`,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), mat);
    m.position.z = -0.25;
    m.renderOrder = 9999;
    m.frustumCulled = false;
    m.visible = false;
    this.engine.camera.add(m);
    this.vignette = m;
    this.blinkT = 0;
  }

  /** One customer of every type (shuffled), the B2B or B2C one at random. */
  pickCustomers() {
    const byType = (type) => pick(CUSTOMERS.filter((c) => c.type === type));
    return shuffle(['analytical', 'relational', 'decisive'].map(byType)).slice(0, ROUND);
  }

  // ---------- world ----------

  buildLights() {
    const { eye } = this;
    const sun = new THREE.DirectionalLight(hex('xr-summit-sun'), 1.5);
    sun.position.set(1.1, eye + 1.3, 0.7);
    sun.target.position.set(0, eye - 0.2, WALL_Z);
    if (this.shadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      const s = sun.shadow.camera;
      s.left = -0.75; s.right = 0.75; s.top = 0.8; s.bottom = -0.8; s.near = 0.3; s.far = 3.5;
      sun.shadow.bias = -0.0008;
      sun.shadow.normalBias = 0.01;
    }
    const fill = new THREE.DirectionalLight(hex('xr-summit-fill'), 0.55);
    fill.position.set(-1.4, eye + 0.4, 0.4);
    fill.target.position.set(0, eye - 0.2, WALL_Z);
    this.group.add(sun, sun.target, fill, fill.target);
  }

  /** A round window with the customer's close-up (head and chest), next to the speech bubble. */
  buildPortrait() {
    this.portraitCut = { value: -100 };
    const fr = (this.portraitFrame = new THREE.Group());
    fr.visible = false;
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 76, 4, 64, 64, 64);
    g.addColorStop(0, color('xr-summit-sky-glow'));
    g.addColorStop(0.45, color('xr-summit-sky-low'));
    g.addColorStop(1, color('xr-summit-sky-mid'));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(PORTRAIT_R, 48), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(PORTRAIT_R, PORTRAIT_R + 0.007, 48), new THREE.MeshBasicMaterial({ color: hex('xr-accent'), toneMapped: false }));
    ring.position.z = 0.001;
    this.portraitSlot = new THREE.Group();
    fr.add(disc, ring, this.portraitSlot);
    this.group.add(fr);
  }

  buildBackdrop() {
    if (!this.ar) {
      this.sky = makeSky();
      this.world.add(this.sky);
    }
    this.clouds = makeClouds(this.CLOUD_Y, { count: quality.lite ? 55 : 90, ar: this.ar });
    this.world.add(this.clouds);
    if (WINTER) {
      this.snow = makeSnowfall({ density: 0.6, box: [-2.4, -3.0, 2.4, 1.6] });
      this.world.add(this.snow.points);
    }
  }

  buildMountain(M) {
    this.M = M;
    const m = makeMountain(M.wall);
    this.mountain = m.group;
    this.wall = m.wall;
    this.mats = m.mats;
    this.world.add(this.mountain);
    this.placeMountain();
    // Where the rope runs through the quickdraws (lower carabiner), wall-local.
    this.clips = BOLTS.map((b) => new THREE.Vector3(b.x, b.y - 0.076, surfaceZ(this.wall, b.x, b.y - 0.012) + 0.02));
    this.mountain.add(makeDecorHolds(M.wall, this.wall, (x, y) => ROWS.some((r) => Math.abs(y - r) < 0.07 && XS.some((hx) => Math.abs(x - hx) < 0.09))
      || Math.abs(y) < 0.06 || BOLTS.some((b) => Math.abs(x - b.x) < 0.05 && Math.abs(y - b.y) < 0.06)));
    this.decor = makeSummitDecor(M.wall, this.mats);
    this.mountain.add(this.decor);
    const peaks = makePeaks(M.wall, this.mats);
    peaks.position.y = this.CLOUD_Y;
    if (this.ar) { peaks.scale.setScalar(0.5); peaks.position.z = -0.4; }
    this.world.add(peaks);
    this.climber = new ClimberEcho(this.mountain, M.wall, this.mats);
    this.climber.group.visible = false;
    this.climber.grip.copy(START);
    this.rope = new Rope(this.mountain);
    this.rope.mesh.visible = false;
    this.showClimber();
    if (this.customer) this.setCustomer(this.customer);
  }

  /** Panels of the layer (intro, cards, results) draw over the clouds. */
  add(obj, parent = this.layer) {
    super.add(obj, parent);
    if (parent === this.layer) obj.traverse((o) => { if (o.isMesh || o.isSprite) o.renderOrder = Math.max(o.renderOrder, 10); });
    return obj;
  }

  /** Echo on the start ledge (once the models are there). */
  showClimber() {
    if (!this.climber || this.mode === 'intro') return;
    this.climber.group.visible = true;
    this.rope.mesh.visible = true;
    if (!this.climberPlaced) {
      this.climberPlaced = true;
      this.climber.grip.copy(START);
      this.climber.pose = 'stand';
    }
  }

  /** Standing Echo takes hold of the wall: the grip point moves from the feet to the wings. */
  toWall() {
    const cl = this.climber;
    if (cl.pose !== 'stand' && cl.pose !== 'cheer') return;
    cl.grip.add(STAND_TO_HANG);
    cl.pose = 'hang';
  }

  placeMountain() {
    if (!this.mountain) return;
    this.mountain.position.set(0, this.HOLD_Y - this.focus, WALL_Z + this.depth);
  }

  // ---------- input ----------

  setupInput() {
    this.onKey = (e) => {
      if (e.repeat) return;
      const n = Number(e.key);
      if (n >= 1 && n <= 3 && this.mode === 'choose') {
        const i = this.options.findIndex((o) => o.n === n && !o.gone);
        if (i >= 0) { e.preventDefault(); this.choose(i); }
      } else if ((e.key === 'Enter' || e.key === ' ') && this.waitNext) {
        e.preventDefault();
        this.next();
      }
    };
    window.addEventListener('keydown', this.onKey);
    // Quest: reach out and grab a hold (grip, trigger or pinch while the hand is near it), then
    // pull the hand down; letting go before the end finishes the move by itself.
    this.grabbers = [];
    for (const p of this.engine.pointers) {
      if (p.kind !== 'xr' || !p.controller) continue;
      const fn = () => this.tryGrab(p);
      const up = () => this.releasePull(p);
      p.controller.addEventListener('selectstart', fn);
      p.controller.addEventListener('squeezestart', fn);
      p.controller.addEventListener('selectend', up);
      p.controller.addEventListener('squeezeend', up);
      this.grabbers.push([p.controller, fn, up]);
    }
    // Mouse and finger: where the press started, so a drag downward pulls.
    const c = this.engine.canvas;
    this.onDown = (e) => { this.downY = e.clientY; };
    this.onMove = (e) => {
      const P = this.pull;
      if (!P || P.via !== 'drag' || this.downY == null) return;
      P.dragP = clamp((e.clientY - this.downY) / this.pullPx(), 0, 1);
    };
    c.addEventListener('pointerdown', this.onDown);
    c.addEventListener('pointermove', this.onMove);
    // Phones: the talk with big answer buttons.
    if (this.engine.touchUI) {
      this.talk = phoneTalk({ onPick: (i) => this.choose(i), onNext: () => this.next() });
      this.onSceneDispose(() => this.talk.remove());
      this.mobileView((cam, dt, ins) => this.phoneCamera(cam, dt, ins));
    }
  }

  tryGrab(p) {
    if (this.mode !== 'choose') return;
    const near = this.options.find((o) => o.nearBy === p && !o.gone);
    if (near) this.choose(this.options.indexOf(near), 'hand', p);
  }

  /** A hold was taken by a pointer: headset hands pull, mouse and finger drag. */
  grabOption(opt, p) {
    const i = this.options.indexOf(opt);
    if (p?.kind === 'xr') this.choose(i, 'hand', p);
    else this.choose(i, this.engine.isXR ? 'auto' : 'drag');
  }

  /** Let go: a move that was pulled only part of the way finishes by itself. */
  releasePull(p) {
    const P = this.pull;
    if (!P || this.mode !== 'pull') return;
    if (P.via === 'hand' && P.hand !== p) return;
    if (P.via === 'drag') this.downY = null;
    P.release = true;
  }

  // ---------- flow ----------

  start() {
    this.clearLayer();
    this.refreshHud ??= this.hud(() => this.hudText());
    this.placeHudButtons();
    this.app.echo?.suppress(true);
    this.startMusic(1, 'summit');
    Object.assign(this, { score: 0, deals: 0, trustSum: 0, aiRight: 0, aiTotal: 0, index: -1, climbs: [] });
    this.buildPanels();
    this.depthTo = 0;
    this.focusTo = VIEW_TOP;
    this.mode = 'approach';
    this.showClimber();
    sfx.whoosh();
    // The models are normally loaded during the intro; wait for them if not.
    Promise.resolve(this.ready).then(() => { if (!this.disposed) this.after(1.0, () => this.nextCustomer()); });
  }

  buildPanels() {
    if (this.coach) return;
    this.coach = makeCoach();
    this.status = makeStatus(() => this.statusState());
    this.coachHolder = holder(this.coach, 0.6);
    this.statusHolder = holder(this.status, 0.6);
    this.bubble = makeBubble();
    this.bubbleHolder = new THREE.Group();
    this.bubbleHolder.scale.setScalar(0.5);
    this.hudGroup.add(this.coachHolder, this.statusHolder, this.bubbleHolder);
    this.hudGroup.visible = !this.engine.touchUI;
    this.layoutPanels(true);
  }

  /** The base HUD's 3D bar is replaced by the status panel; the menu button sits below it. */
  placeHudButtons() {
    this.hudBits = this.group.children.filter((o) => o.userData.hud);
  }

  /** Coach left, status right; angled towards you in the headset, flat on a screen. */
  layoutPanels(force = false) {
    const xr = this.engine.isXR;
    if (!force && this.laidOutXR === xr) return;
    this.laidOutXR = xr;
    const { eye } = this;
    if (xr) {
      // Larger in the headset: the text stays above the minimum size at about one meter.
      this.coachHolder.position.set(-0.7, eye - 0.08, -0.8);
      this.coachHolder.rotation.y = 0.66;
      this.statusHolder.position.set(0.7, eye - 0.08, -0.8);
      this.statusHolder.rotation.y = -0.66;
    } else {
      this.coachHolder.position.set(-0.68, eye - 0.06, -0.6);
      this.coachHolder.rotation.y = 0;
      this.statusHolder.position.set(0.68, eye - 0.06, -0.6);
      this.statusHolder.rotation.y = 0;
    }
    const s = xr ? 0.76 : 0.6;
    const sb = xr ? 0.55 : 0.4;
    this.coachHolder.scale.setScalar(s);
    this.statusHolder.scale.setScalar(s);
    // Menu button below the status panel (the base HUD's text bar is not needed here).
    for (const o of this.hudBits ?? []) {
      if (o.isMesh && o.userData.onClick) {
        o.scale.setScalar(sb);
        o.position.copy(this.statusHolder.position);
        o.position.y -= (this.status.h * s) / 2 + 0.02 + (o.h * sb) / 2;
        o.rotation.y = this.statusHolder.rotation.y;
        o.visible = !this.engine.touchUI && this.mode !== 'over';
      } else o.visible = false;
    }
  }

  hudText() {
    const c = this.customer;
    if (!c) return t('summitName');
    const stage = this.stepIndex ?? 0;
    const st = STAGES[Math.min(STAGES.length - 1, stage)];
    return t('summitHud', { name: L(c.name), n: this.index + 1, total: this.customers.length, stage: t('summitStage', { n: Math.min(5, stage + 1), name: L(st.name) }), trust: Math.round(this.trust ?? 0), stamina: Math.round(this.stamina ?? 0), score: this.score ?? 0 });
  }

  statusState() {
    return { customer: this.customer, index: this.index, total: this.customers.length, stage: this.stepIndex ?? 0, climbing: this.mode !== 'summit' && this.mode !== 'meet', trust: this.trust ?? 0, stamina: this.stamina ?? 0, score: this.score ?? 0, time: this.time };
  }

  setCustomer(c) {
    if (this.figure) {
      const old = this.figure;
      this.anim(0.4, (k) => old.group.scale.setScalar(Math.max(0.001, 1 - k)), () => old.dispose());
    }
    this.portrait?.dispose();
    this.figure = null;
    this.portrait = null;
    if (!this.M) return;
    // The customer at the summit, and the same person as a close-up next to the speech bubble.
    // A little smaller in the headset, where the summit is close above you.
    const f = new CustomerFigure(this.M.cust, c, { size: this.engine.isXR ? 0.37 : CUSTOMER_SIZE });
    f.group.position.copy(CUSTOMER_SPOT);
    f.group.rotation.y = -0.25;
    f.group.scale.setScalar(0.001);
    this.mountain.add(f.group);
    this.figure = f;
    this.anim(0.5, (k) => f.group.scale.setScalar(Math.max(0.001, k)), null, 0.3);
    this.portrait = new CustomerFigure(this.M.cust, c, { size: 0.36, cut: this.portraitCut });
    this.portrait.group.position.set(0, -0.835 * 0.36 + 0.022, 0.014);
    this.portraitSlot.add(this.portrait.group);
  }

  /** Both figures of the customer do the same (summit and portrait). */
  both(fn) {
    if (this.figure) fn(this.figure);
    if (this.portrait) fn(this.portrait);
  }

  /** The close-up portrait: beside the bubble (headset, desktop), at the top of the wall (phones). */
  placePortrait(show) {
    const fr = this.portraitFrame;
    if (!fr) return;
    fr.visible = show && !!this.portrait;
    if (!fr.visible) return;
    if (this.engine.touchUI) fr.position.set(0.27, this.eye + 0.075, -0.6);
    else fr.position.set(this.bubbleHolder.position.x - (this.bubble.panel.w * this.bubbleHolder.scale.x) / 2 - PORTRAIT_R - 0.012, this.bubbleHolder.position.y + 0.01, -0.585);
  }

  /** The next customer waits at the summit: a short meeting, then Echo climbs from the bottom. */
  nextCustomer() {
    if (this.mode === 'over' || this.disposed) return;
    this.index += 1;
    if (this.index >= this.customers.length) { this.finish(); return; }
    const c = (this.customer = this.customers[this.index]);
    Object.assign(this, { trust: TRUST.start, stamina: 100, stepIndex: 0, typeVotes: { A: 0, Rel: 0, D: 0 }, climbPoints: 0, aiType: null, fell: false });
    this.mode = 'meet';
    this.clearCard();
    this.placePortrait(false);
    this.clearRoute();
    this.focusTo = VIEW_TOP;
    this.setCustomer(c);
    this.after(0.6, () => this.both((f) => { f.setMood('neutral'); f.setTrust(this.trust); f.wave(2.2); }));
    sfx.appear();
    // Echo goes back down to the start (a quick abseil if it stood on the summit).
    if (this.climber && this.climber.grip.distanceTo(START) > 0.05) this.abseil();
    const card = this.card = this.add(holder(textPanel(1.0, 0.3, [
      { text: t('summitCustomerOf', { n: this.index + 1, total: this.customers.length }), size: 'xr-text-sm', weight: 'bold', color: color('xr-panel-muted'), gap: 0.01 },
      { text: L(c.name), size: 'xr-text-lg', weight: 'black', gap: 0.01 },
      { text: `${L(c.role)} · ${c.market}`, size: 'xr-text-sm', color: color('xr-panel-muted'), gap: 0.015 },
      { text: `${L(c.topic)} – ${t('summitWaiting')}`, size: 'xr-text-md', weight: 'bold', color: color('xr-accent') },
    ]), 0.5));
    card.position.set(0, this.eye - 0.3, -0.58);
    this.popIn(card.userData.panel);
    card.visible = !this.engine.touchUI;
    this.talk?.show(true);
    this.talk?.setSummary([`${t('summitCustomerOf', { n: this.index + 1, total: this.customers.length })}: ${L(c.name)}`, `${L(c.role)} · ${c.market}`, `${L(c.topic)} – ${t('summitWaiting')}`], null);
    this.coach.userData.set({ phase: 'idle', mood: null, type: null, words: [], verdict: null });
    this.status.redraw();
    this.refreshHud?.();
    this.after(2.4, () => {
      this.clearCard();
      this.focusTo = FOCUS[0];
      sfx.whoosh();
      this.after(1.1, () => this.beginStep());
    });
  }

  clearCard() {
    if (!this.card) return;
    const c = this.card;
    this.card = null;
    c.removeFromParent();
    c.userData.panel?.dispose?.();
    this.nextBtn = null;
    this.waitNext = false;
  }

  /** Echo abseils from where it is down to the start ledge, the rope unclipping on the way. */
  abseil() {
    const cl = this.climber;
    this.toWall();
    const from = cl.grip.clone();
    const to = START.clone().add(STAND_TO_HANG);
    cl.pose = 'slip';
    cl.focus();
    this.anim(1.6, (k) => {
      cl.grip.lerpVectors(from, to, ease(k));
      cl.grip.z += Math.sin(k * Math.PI) * 0.12;
    }, () => { cl.grip.copy(START); cl.pose = 'stand'; });
  }

  /** A stage of the talk: the customer's line, the AI coach's reading and three reply holds. */
  beginStep() {
    if (this.mode === 'over' || this.disposed) return;
    const c = this.customer;
    const step = c.steps[this.stepIndex];
    this.step = step;
    this.mode = 'talk';
    this.stepFails = 0;
    this.chooseT = 0;
    this.firstPick = true;
    const lang = getLang();
    const text = L(step.say);
    const r = readLine(text, lang);
    for (const k in this.typeVotes) this.typeVotes[k] += r.type[k];
    const type = readType(this.typeVotes);
    const shown = r.hits.filter((h) => h.weight >= 0.5); // the strong signal words are shown
    this.reading = { mood: r.mood, type, hits: shown, unsure: isUnsure(r.mood), words: dedupe(shown) };
    this.aiType = type[0];
    // The bubble: beside the customer's close-up (or at the top without it), and once the summit
    // is in view to the left of the customer up there.
    const near = this.stepIndex >= 3;
    const tail = near ? 'right' : this.portrait ? 'left' : 'up';
    const panel = this.bubble.show(c, text, shown, tail);
    if (panel.parent !== this.bubbleHolder) { this.bubbleHolder.clear(); this.bubbleHolder.add(panel); }
    const bs = tail === 'right' ? 0.42 : 0.5;
    this.bubbleHolder.scale.setScalar(bs);
    if (tail === 'up') this.bubbleHolder.position.set(0, this.eye + 0.08 + (panel.h * bs) / 2, -0.6);
    else if (tail === 'left') {
      const bw = panel.w * bs;
      const total = PORTRAIT_R * 2 + 0.012 + bw;
      this.bubbleHolder.position.set(-total / 2 + PORTRAIT_R * 2 + 0.012 + bw / 2, this.eye + 0.1 + Math.max((panel.h * bs) / 2, PORTRAIT_R), -0.6);
    } else {
      // Next to the customer's head, in front of the summit (it covers the cross).
      const head = Math.min(this.eye + 0.24, this.HOLD_Y - FOCUS[this.stepIndex] + PLATEAU_Y + 0.27);
      this.bubbleHolder.position.set(0.1 - (panel.w * bs) / 2, head - (panel.h * bs) * 0.2, WALL_Z + 0.2);
    }
    this.bubbleHolder.visible = true;
    this.popIn(panel);
    this.placePortrait(!near);
    // The customer says it, and shows the mood with the body (the AI only reads the words).
    this.both((f) => { f.setMood(step.mood); f.setTrust(this.trust); f.say(2.4); });
    sfx.tick();
    music.intensity = this.stepIndex >= 3 ? 2 : 1;
    this.coach.userData.set({ phase: 'reading', verdict: null, reveal: 0 });
    this.talk?.setQuote(c, text, []);
    this.talk?.setCoach({ phase: 'reading' });
    this.talk?.clearAnswers();
    // Three reply holds above Echo, in random order.
    const replies = shuffle(step.replies);
    const xs = XS.map((x) => x + (Math.random() - 0.5) * 0.05);
    this.options = replies.map((reply, i) => this.spawnOption(reply, i + 1, xs[i], ROWS[this.stepIndex] + (Math.random() - 0.5) * 0.03, i));
    this.talk?.setAnswers(this.options.map((o) => ({ n: o.n, text: L(o.reply.text) })));
    this.talk?.lock(true);
    this.after(0.65, () => {
      if (this.mode !== 'talk') return;
      this.coach.userData.set({ phase: 'shown', reveal: 0, mood: this.reading.mood, type: this.reading.type, words: this.reading.words, unsure: this.reading.unsure });
      this.revealT = 0;
      this.talk?.setCoach({ phase: 'shown', mood: this.reading.mood, type: this.reading.type, unsure: this.reading.unsure });
      this.talk?.setQuote(c, text, shown);
      this.talk?.lock(false);
      this.mode = 'choose';
    });
    this.status.redraw();
    this.refreshHud?.();
  }

  spawnOption(reply, n, x, y, i) {
    const hold = new Hold(this.M?.wall, this.mats ?? {}, Math.floor(Math.random() * 4), n);
    const z = surfaceZ(this.wall, x, y);
    hold.group.position.set(x, y, z);
    hold.setState('option');
    this.mountain?.add(hold.group);
    const opt = { reply, n, hold, gone: false, nearBy: null, x, y, z };
    hold.hit.userData.onGrab = (p) => this.grabOption(opt, p);
    hold.hit.userData.onRelease = (p) => this.releasePull(p);
    hold.hit.userData.label = L(reply.text);
    hold.group.scale.setScalar(0.001);
    this.anim(0.35, (k) => hold.group.scale.setScalar(Math.max(0.001, k)), null, 0.1 + i * 0.08);
    // Reply plate above the hold (not on phones: the answers are on the screen there).
    if (!this.engine.touchUI) {
      const label = makeLabel(n, L(reply.text), () => this.choose(this.options.indexOf(opt)));
      label.userData.onGrab = (p) => this.grabOption(opt, p);
      label.userData.onRelease = (p) => this.releasePull(p);
      const h = holder(label, LS);
      h.position.set(x, y + 0.05 + (label.h * LS) / 2, this.stepIndex === 4 ? 0.2 : z + 0.09);
      this.mountain?.add(h);
      this.popIn(label, 0.15 + i * 0.08);
      opt.label = h;
    }
    return opt;
  }

  /**
   * The player takes hold of reply i: via 'hand' (Quest, the hand pulls), 'drag' (mouse or
   * finger drags the hold down) or 'auto' (click, key, answer button, pointing: pulls by itself).
   * A solid hold clicks, a wobbly one wobbles, a weak one breaks as soon as weight comes on it.
   */
  choose(i, via = 'auto', hand = null) {
    if (this.mode !== 'choose') return;
    const opt = this.options[i];
    if (!opt || opt.gone) return;
    this.mode = 'pull';
    const q = opt.reply.q;
    const kind = q === 2 ? 'good' : q === 1 ? 'ok' : 'bad';
    // Did the AI coach read the customer right? (counted once per stage)
    if (this.firstPick) {
      this.firstPick = false;
      const right = this.reading.mood[0].key === this.step.mood;
      this.aiTotal += 1;
      this.aiRight += right ? 1 : 0;
      const verdict = { right, truth: this.step.mood, note: this.step.note ? L(this.step.note) : t('summitCoachGeneric') };
      this.coach.userData.set({ verdict });
      this.talk?.setCoach({ verdict });
    }
    this.talk?.lock(true);
    const cl = this.climber;
    this.toWall();
    const next = this.stepIndex + 1 < FOCUS.length ? FOCUS[this.stepIndex + 1] : VIEW_TOP;
    this.pull = { opt, i, kind, via, hand, p: 0, dragP: 0, release: false, tick: 0, from: cl.grip.clone(), to: new THREE.Vector3(opt.x, opt.y, opt.z), base: this.focusTo, next, startY: null };
    if (hand) this.pull.startY = this.handPos(hand).y;
    cl.reach = Math.sign(opt.x - cl.grip.x);
    cl.pose = 'climb';
    cl.focus();
    opt.hold.setPull(0);
    sfx.grab();
    if (kind === 'good') {
      // Solid: a soft click and a tick in the hand.
      this.after(0.06, () => sfx.tick());
      this.buzz(0.35, 25);
    } else {
      this.buzz(0.2, 30);
      if (kind === 'ok') opt.hold.shake = 1.0;
    }
    if (kind !== 'bad') {
      opt.hold.setState(kind);
      this.showFeedback(opt, i, kind);
      this.both((f) => { f.react(kind); f.setTrust(this.trust); });
      // The other holds fade away; this one stays on the wall as part of the route.
      for (const o of this.options) {
        if (o === opt) continue;
        if (o.label) { const l = o.label; o.label = null; l.removeFromParent(); l.userData.panel.dispose(); }
        if (o.gone) continue;
        o.gone = true;
        const h = o.hold;
        this.anim(0.35, (k) => h.group.scale.setScalar(Math.max(0.001, 1 - k)), () => h.dispose());
      }
    }
    // Pulling by hand or by dragging: a hint below the hold.
    if (via !== 'auto') {
      const hint = makePullHint(t(via === 'hand' ? 'summitPullHintXR' : 'summitPullHint'));
      const hh = holder(hint, LS);
      hh.position.set(opt.x, opt.y - 0.075, opt.z + 0.11);
      this.mountain.add(hh);
      this.pullHint = hh;
    }
  }

  /** The reply plate turns into the verdict with a tip (on phones: the answer button). */
  showFeedback(opt, i, kind) {
    const tip = L(opt.reply.tip);
    this.talk?.mark(i, kind, tip);
    if (opt.label) {
      const old = opt.label;
      old.removeFromParent();
      old.userData.panel.dispose();
      const fb = makeFeedback(kind, tip);
      const h = holder(fb, LS);
      h.position.set(opt.x, opt.y + 0.05 + (fb.h * LS) / 2, this.stepIndex === 4 ? 0.21 : opt.z + 0.1);
      this.mountain.add(h);
      this.popIn(fb);
      opt.label = h;
    }
  }

  /** A haptic pulse in the pulling hand (or any active controller). */
  buzz(strength, ms) {
    const hand = this.pull?.hand ?? this.engine.pointers.find((p) => p.kind === 'xr' && p.active);
    this.engine.haptic(hand, strength, ms);
  }

  handPos(p, out = new THREE.Vector3()) {
    return out.setFromMatrixPosition(p.controller.matrixWorld);
  }

  removePullHint() {
    if (!this.pullHint) return;
    const h = this.pullHint;
    this.pullHint = null;
    h.removeFromParent();
    h.userData.panel.dispose();
  }

  /** Every frame while pulling: progress from the hand, the drag or by itself. */
  updatePull(dt) {
    const P = this.pull;
    if (!P || this.mode !== 'pull') return;
    let want = P.p;
    if (P.via === 'auto' || P.release) want = Math.min(1, P.p + dt / 0.8);
    else if (P.via === 'drag') want = Math.max(P.p, P.dragP);
    else if (P.via === 'hand' && P.hand?.active) {
      const d = P.startY - this.handPos(P.hand).y;
      want = Math.max(P.p, clamp(d / PULL_M, 0, 1));
    } else if (P.via === 'hand') want = Math.min(1, P.p + dt / 0.8);
    P.p = want;
    P.opt.hold.setPull(P.p);
    this.pullHint?.userData.panel.userData.tick(this.time);
    if (P.p > 0.12) this.removePullHint();
    // A little tick in the hand every quarter of the way.
    const q = Math.floor(P.p * 4);
    if (q > P.tick && P.p < 1) { P.tick = q; if (P.kind !== 'bad') { this.buzz(0.15, 12); sfx.bounce(); } }
    // A weak hold breaks as soon as weight comes on it.
    if (P.kind === 'bad' && P.p >= BREAK_AT) { this.breakHold(); return; }
    // Echo follows the pull, and so does the wall (in the headset it moves with the hand).
    const cl = this.climber;
    cl.grip.lerpVectors(P.from, P.to, ease(P.p));
    cl.grip.z += Math.sin(P.p * Math.PI) * 0.03;
    if (!this.snapMoves()) {
      this.focusTo = P.base + (P.next - P.base) * (P.via === 'hand' ? P.p : ease(P.p));
      if (P.via === 'hand') this.focus = this.focusTo;
    }
    if (P.p >= 1) this.arrive();
  }

  /** Arrived on the hold: points, trust, strength, and on to the next stage. */
  arrive() {
    const P = this.pull;
    const { opt, kind } = P;
    this.pull = null;
    this.removePullHint();
    opt.hold.setPull(-1);
    this.mode = 'move';
    const cl = this.climber;
    const good = kind === 'good';
    const speed = good && !this.stepFails ? Math.round(PTS.speed * clamp(1 - (this.chooseT - 2) / 9, 0, 1)) : 0;
    const pts = good ? (this.stepFails ? PTS.solidRetry : PTS.solid + speed) : (this.stepFails ? PTS.okRetry : PTS.ok);
    this.addScore(pts);
    this.addTrust(good ? TRUST.good : TRUST.ok);
    this.stamina = clamp(this.stamina + (good ? STAMINA.good : STAMINA.ok) - STAMINA.pull, 0, 100);
    this.both((f) => f.setTrust(this.trust));
    if (good) sfx.correct(); else sfx.point();
    this.buzz(0.5, 40);
    sfx.flap();
    this.popScore(`+${pts}`, new THREE.Vector3(opt.x, opt.y + 0.02, opt.z + 0.08), good ? 'xr-summit-hold-good' : 'xr-summit-hold-ok');
    cl.grip.copy(P.to);
    cl.pose = 'hang';
    cl.reach = 0;
    if (good) cl.happy(1.3);
    this.route.push(opt);
    this.stepIndex += 1;
    this.focusTo = this.stepIndex < FOCUS.length ? FOCUS[this.stepIndex] : VIEW_TOP;
    this.after(good ? 0.9 : 1.3, () => {
      if (opt.label) { const l = opt.label; opt.label = null; l.removeFromParent(); l.userData.panel.dispose(); }
      opt.hold.setState('route');
      const last = this.stepIndex >= this.customer.steps.length;
      this.coach.userData.set(last ? { phase: 'shown', reveal: 1, mood: null, words: [], verdict: null, unsure: false } : { phase: 'idle', verdict: null });
      if (last) this.reachSummit();
      else this.beginStep();
    });
  }

  /** The weak hold breaks in the hand: shards, a jolt, Echo slips into the rope; pick again. */
  breakHold() {
    const P = this.pull;
    const { opt, i } = P;
    this.pull = null;
    this.removePullHint();
    this.mode = 'move';
    const cl = this.climber;
    this.stepFails += 1;
    this.addTrust(TRUST.bad);
    this.stamina = Math.max(0, this.stamina + STAMINA.bad);
    sfx.wrong();
    opt.hold.setState('bad');
    opt.hold.setPull(-1);
    this.showFeedback(opt, i, 'bad');
    this.both((f) => { f.react('bad'); f.setTrust(this.trust); });
    opt.gone = true;
    opt.hold.group.visible = false;
    const sh = makeShards('xr-summit-hold-bad', new THREE.Vector3(opt.x, opt.y, opt.z + 0.03));
    this.mountain.add(sh);
    this.shards.push(sh);
    sfx.shatter();
    sfx.crash();
    this.engine.haptic(P.hand ?? this.engine.pointers.find((p) => p.kind === 'xr' && p.active), 1.0, 180);
    // The wall drops back (a jolt below where it was) and settles again.
    this.focusTo = P.base;
    if (!this.snapMoves()) this.focus = P.base - 0.06;
    cl.pose = 'slip';
    cl.hurt();
    const at = cl.grip.clone();
    const low = P.from.clone().add(new THREE.Vector3(0, -0.11, 0.02));
    this.anim(0.3, (k) => cl.grip.lerpVectors(at, low, k * k), () => {
      cl.swing = 1;
      this.anim(0.6, (k) => cl.grip.lerpVectors(low, P.from, ease(k)), () => {
        cl.grip.copy(P.from);
        cl.pose = 'hang';
        cl.reach = 0;
        if (this.stamina <= 0) { this.fallOff(); return; }
        this.mode = 'choose';
        this.talk?.lock(false);
        this.chooseT = STAMINA.grace;
      }, 0.25);
    });
  }

  /** Comfort setting in the headset: moves as quick jumps behind a short fade. */
  snapMoves() {
    return this.engine.isXR && this.comfortSnap;
  }

  /** How far (CSS px) a drag goes for one move. */
  pullPx() {
    return clamp(window.innerHeight * 0.18, 70, 170);
  }

  addTrust(d) { this.trust = clamp(this.trust + d, 0, 100); }
  addScore(n) { this.score += n; this.climbPoints += n; }

  /** A floating "+140" over the hold. */
  popScore(text, local, token) {
    const p = textPanel(0.3, 0.09, [{ text, size: 'xr-text-lg', weight: 'black', color: color(token) }], { surface: false });
    const h = holder(p, 0.6);
    h.position.copy(local);
    this.mountain?.add(h);
    const y0 = local.y;
    this.anim(1.1, (k) => { h.position.y = y0 + k * 0.08; p.material.opacity = 1 - k * k; }, () => { h.removeFromParent(); p.dispose(); });
  }

  /** Top: the deal is closed. Echo pulls itself up, the flag goes up, handshake. */
  reachSummit() {
    const cl = this.climber;
    this.mode = 'summit';
    this.bubbleHolder.visible = false;
    this.placePortrait(false);
    this.focusTo = VIEW_TOP;
    const from = cl.grip.clone();
    cl.pose = 'climb';
    const to = SUMMIT_SPOT.clone().add(STAND_TO_HANG);
    this.anim(0.9, (k) => {
      cl.grip.lerpVectors(from, to, ease(k));
      cl.grip.y += Math.sin(k * Math.PI) * 0.06;
    }, () => {
      cl.grip.copy(SUMMIT_SPOT);
      cl.pose = 'cheer';
      cl.happy(4);
      this.decor?.userData.raise(true);
      cl.shakeT = 2.4;
      this.both((f) => { f.setMood('ready'); f.handshake(2.6); });
      this.after(2.7, () => this.both((f) => f.cheer(2.2)));
      sfx.finish();
      this.after(0.3, () => sfx.powerup());
      this.burst(this.mountain.localToWorld(SUMMIT_SPOT.clone().add(new THREE.Vector3(0, 0.15, 0))), 'xr-summit-gold', 36);
      this.after(0.25, () => this.burst(this.mountain.localToWorld(SUMMIT_SPOT.clone().add(new THREE.Vector3(0.15, 0.2, 0))), 'xr-summit-hold-1', 24));
      const bonus = PTS.summit + Math.round(PTS.trust * this.trust);
      this.addScore(bonus);
      this.deals += 1;
      this.trustSum += this.trust;
      this.climbs.push({ deal: true, trust: this.trust });
      this.after(2.2, () => { cl.pose = 'stand'; });
      this.summaryCard(true);
    });
  }

  /** Out of strength: Echo lets go and hangs in the rope. No deal this time. */
  fallOff() {
    const cl = this.climber;
    this.mode = 'fall';
    this.fell = true;
    this.bubbleHolder.visible = false;
    this.placePortrait(false);
    for (const o of this.options) {
      if (o.gone) continue;
      o.gone = true;
      o.hold.dispose();
      if (o.label) { o.label.removeFromParent(); o.label.userData.panel.dispose(); o.label = null; }
    }
    const from = cl.grip.clone();
    const low = from.clone().add(new THREE.Vector3(0, -0.3, 0.05));
    cl.pose = 'fall';
    cl.sad();
    this.both((f) => { f.setMood('skeptical'); f.react('bad'); });
    sfx.crash();
    this.anim(0.5, (k) => cl.grip.lerpVectors(from, low, k * k), () => { cl.swing = 1.5; });
    this.trustSum += this.trust;
    this.climbs.push({ deal: false, trust: this.trust });
    this.after(0.8, () => this.summaryCard(false));
  }

  summaryCard(deal) {
    const c = this.customer;
    const type = this.aiType;
    const right = type?.key === c.type;
    const lines = [
      { text: t(deal ? 'summitDeal' : 'summitFall'), size: 'xr-text-lg', weight: 'black', color: color(deal ? 'xr-success' : 'xr-danger'), gap: 0.012 },
      ...(deal ? [{ text: t('summitTrustEnd', { n: Math.round(this.trust) }), size: 'xr-text-md', weight: 'bold', color: color('xr-summit-trust'), gap: 0.018 }]
        : [{ text: t('summitNoDeal'), size: 'xr-text-md', weight: 'bold', gap: 0.018 }]),
      { text: t(`summitTypeDesc_${c.type}`), size: 'xr-text-sm', weight: 'bold', gap: 0.008 },
      { text: t(right ? 'summitTypeGuessRight' : 'summitTypeGuess', { guess: t(`summitType_${type?.key ?? c.type}`), p: Math.round((type?.p ?? 0) * 100) }), size: 'xr-text-sm', color: color(right ? 'xr-success' : 'xr-warning') },
    ];
    const last = this.index + 1 >= this.customers.length;
    const label = t(last ? 'summitLastCustomer' : 'summitNextCustomer');
    const panel = textPanel(1.0, 0.3, lines, { layout: { align: 'left' } });
    const btn = new Button(0.5, 0.12, { label, variant: 'primary', onClick: () => this.next() });
    const card = new THREE.Group();
    card.add(panel, btn);
    btn.position.y = -panel.h / 2 - 0.03 - btn.h / 2;
    const s = 0.5;
    card.scale.setScalar(s);
    card.position.set(0, this.eye - 0.2 - (panel.h * s) / 2, -0.56);
    card.userData.panel = panel;
    card.visible = !this.engine.touchUI;
    this.add(card);
    this.popIn(panel);
    this.popIn(btn, 0.1);
    this.card = card;
    this.waitNext = true;
    this.talk?.setSummary([
      t(deal ? 'summitDeal' : 'summitFall'),
      deal ? t('summitTrustEnd', { n: Math.round(this.trust) }) : t('summitNoDeal'),
      t(`summitTypeDesc_${c.type}`),
      t(right ? 'summitTypeGuessRight' : 'summitTypeGuess', { guess: t(`summitType_${type?.key ?? c.type}`), p: Math.round((type?.p ?? 0) * 100) }),
    ], label);
    this.status.redraw();
    this.refreshHud?.();
    // Goes on by itself after a while, so the round keeps its pace.
    const idx = this.index;
    this.after(12, () => { if (this.waitNext && this.index === idx) this.next(); });
  }

  next() {
    if (!this.waitNext) return;
    this.waitNext = false;
    this.clearCard();
    this.decor?.userData.raise(false);
    sfx.click();
    this.nextCustomer();
  }

  clearRoute() {
    for (const o of this.route) {
      const h = o.hold;
      this.anim(0.4, (k) => h.group.scale.setScalar(Math.max(0.001, 1 - k)), () => h.dispose());
    }
    this.route = [];
    this.options = [];
  }

  finish() {
    if (this.mode === 'over') return;
    this.mode = 'over';
    this.clearCard();
    this.hudGroup.visible = false;
    this.placePortrait(false);
    this.talk?.show(false);
    for (const o of this.hudBits ?? []) o.visible = false;
    this.app.echo?.suppress(false);
    this.depthTo = -1.8;
    this.focusTo = 0.45;
    if (this.climber) { this.climber.grip.copy(SUMMIT_SPOT); this.climber.pose = 'cheer'; this.climber.happy(5); }
    const perfect = this.climbs.length === this.customers.length && this.climbs.every((r) => r.deal && r.trust >= 80);
    if (perfect) this.addScore(PTS.bonus);
    const score = Math.min(5000, Math.round(this.score));
    const n = this.customers.length;
    const avg = Math.round(this.trustSum / Math.max(1, n));
    this.results({
      gameKey: 'summit', score, correct: this.deals, total: n,
      line: t('summitLine', { deals: this.deals, total: n, trust: avg, right: this.aiRight, n: this.aiTotal }),
      learned: [
        { q: t('summitLearnQ1'), a: t('summitLearnA1') },
        { q: t('summitLearnQ2'), a: t('summitLearnA2', { right: this.aiRight, n: this.aiTotal }) },
        { q: t('summitLearnQ3'), a: t('summitLearnA3') },
      ],
      onAgain: () => this.app.startGame('summit'),
    });
  }

  // ---------- timing (in game time, so a test can step update() directly) ----------

  after(sec, fn) { this.timers.push({ t: sec, fn }); }

  anim(dur, fn, done, delay = 0) { this.anims.push({ t: -delay, dur, fn, done }); }

  tickTimers(dt) {
    for (const a of [...this.anims]) {
      a.t += dt;
      if (a.t < 0) continue;
      const k = Math.min(1, a.t / a.dur);
      a.fn(k);
      if (k >= 1) {
        this.anims.splice(this.anims.indexOf(a), 1);
        a.done?.();
      }
    }
    for (const tm of [...this.timers]) {
      tm.t -= dt;
      if (tm.t <= 0) {
        this.timers.splice(this.timers.indexOf(tm), 1);
        if (!this.disposed) tm.fn();
      }
    }
  }

  // ---------- frame loop ----------

  update(dt) {
    if (this.disposed) return;
    this.time += dt;
    this.tickTimers(dt);
    const e = this.engine;
    // The wall scrolls with the climb, so the holds within reach stay at arm's length.
    const was = this.focus;
    this.updatePull(dt);
    if (this.snapMoves()) {
      // Comfort: the wall jumps to its new place behind a short fade.
      const off = Math.abs(this.focusTo - this.focus) + Math.abs(this.depthTo - this.depth);
      if (off > 0.003 && !this.blinkT) this.blinkT = 0.001;
    } else {
      this.focus += (this.focusTo - this.focus) * (1 - Math.exp(-dt * 3.2));
      this.depth += (this.depthTo - this.depth) * (1 - Math.exp(-dt * 2.4));
    }
    if (this.vignette) {
      let blink = 0;
      if (this.blinkT) {
        const b0 = this.blinkT;
        this.blinkT += dt;
        if (b0 < 0.12 && this.blinkT >= 0.12) { this.focus = this.focusTo; this.depth = this.depthTo; }
        blink = this.blinkT < 0.12 ? this.blinkT / 0.12 : clamp(1 - (this.blinkT - 0.12) / 0.18, 0, 1);
        if (this.blinkT > 0.3) this.blinkT = 0;
      }
      const speed = Math.abs(this.focus - was) / Math.max(dt, 1e-3);
      const u = this.vignette.material.uniforms;
      u.uA.value += (clamp(speed / 0.25, 0, 1) * 0.75 - u.uA.value) * (1 - Math.exp(-dt * 10));
      u.uB.value = blink;
      this.vignette.visible = this.engine.isXR && (u.uA.value > 0.01 || blink > 0);
    }
    this.placeMountain();
    cutUniform.value = this.group.localToWorld(new THREE.Vector3(0, this.CLOUD_Y + 0.02, 0)).y;
    this.sky?.userData.tick(this.time);
    this.clouds?.userData.tick(this.time);
    if (this.snow) {
      const floor = e.floorY - e.root.position.y;
      this.snow.setGround(floor);
      this.snow.setHole(-0.62, WALL_Z + this.depth - 0.55, 0.62, WALL_Z + this.depth + 0.14, 20);
      this.snow.update(dt);
    }
    if (this.coachHolder) this.layoutPanels();
    // Strength drains while you think (after a moment to read).
    if (this.mode === 'choose') {
      this.chooseT += dt;
      if (this.chooseT > STAMINA.grace) {
        this.stamina = Math.max(0, this.stamina - STAMINA.drain * dt);
        if (this.stamina < 25 && !this.warned) { this.warned = true; sfx.tick(); }
        if (this.stamina <= 0) { this.mode = 'move'; this.fallOff(); }
      }
    }
    if (this.mode !== 'choose') this.warned = false;
    if (this.coach && this.coach.userData.state.phase !== 'idle') {
      const st = this.coach.userData.state;
      st.time = this.time;
      if (st.phase === 'reading' || st.reveal < 1) {
        st.reveal = st.phase === 'shown' ? Math.min(1, st.reveal + dt * 2.2) : 0;
        this.coach.redraw();
      }
    }
    this.bubble?.setReveal(this.mode === 'talk' ? 0 : 1);
    if (this.climber) {
      const look = this.figure ? this.figure.headWorld() : null;
      this.climber.update(dt, { look: this.mode === 'choose' || this.mode === 'talk' ? look : null, tremble: this.mode === 'choose' ? clamp((30 - this.stamina) / 30, 0, 1) : 0 });
      this.updateRope();
    }
    this.figure?.tick(dt);
    if (this.portrait && this.portraitFrame?.visible) {
      this.portrait.tick(dt);
      this.portraitCut.value = this.portraitFrame.localToWorld(new THREE.Vector3(0, -PORTRAIT_R + 0.004, 0)).y;
    }
    this.decor?.userData.tick(dt, this.time);
    for (const o of [...this.options, ...this.route]) if (!o.hold.disposed) o.hold.tick(dt, this.time);
    this.shards = this.shards.filter((s) => s.userData.tick(dt));
    if (e.isXR) this.updateGrab();
    if (Math.floor(this.time * 4) !== this.hudTick) {
      this.hudTick = Math.floor(this.time * 4);
      if (this.mode !== 'intro' && this.mode !== 'over') {
        this.refreshHud?.();
        this.talk?.setMeters(this.trust ?? 0, this.stamina ?? 0);
        if (this.status && (this.mode === 'choose' || this.stamina < 30)) this.status.redraw();
      }
    }
    if (!e.isXR && !e.touchUI) this.previewCamera(dt);
  }

  /** The rope: from Echo's harness down through the clipped quickdraws into the clouds. */
  updateRope() {
    if (!this.rope || !this.clips) return;
    this.rope.mesh.visible = this.climber.group.visible;
    const tie = this.climber.tiePoint();
    const pts = [tie];
    for (let k = this.clips.length - 1; k >= 0; k--) {
      if (this.climber.grip.y > BOLTS[k].y + 0.03 && this.mode !== 'intro') pts.push(this.clips[k]);
    }
    pts.push(new THREE.Vector3(0.05, -0.55, 0.16));
    this.rope.set(pts);
  }

  /** Quest: a hand near a reply hold lights it up (and a short buzz); grabbing picks it. */
  updateGrab() {
    const hands = this.engine.pointers.filter((p) => p.kind === 'xr' && p.active && p.controller);
    const v = new THREE.Vector3();
    const w = new THREE.Vector3();
    for (const o of this.options) {
      if (o.gone) { o.hold.near = 0; continue; }
      o.hold.group.getWorldPosition(w);
      let best = null;
      let bestD = Infinity;
      for (const p of hands) {
        v.setFromMatrixPosition(p.controller.matrixWorld);
        const d = v.distanceTo(w);
        if (d < bestD) { bestD = d; best = p; }
      }
      const near = this.mode === 'choose' && bestD < GRAB_R;
      if (near && o.nearBy !== best) this.engine.haptic(best, 0.25, 25);
      o.nearBy = near ? best : null;
      o.hold.near += ((near ? 1 : 0) - o.hold.near) * 0.3;
    }
  }

  /** The framing of a box (group-local) in the free part of the screen. */
  frame(cam, dt, box, ins = { top: 0, bottom: 0, right: 0 }) {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const tv = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const aspect = cam.aspect;
    const fracH = Math.max(0.3, (H - ins.top - ins.bottom) / H);
    const fracW = Math.max(0.3, (W - ins.right) / W);
    const halfH = (box.y1 - box.y0) / 2 / fracH;
    const halfW = (box.x1 - box.x0) / 2 / fracW;
    const d = Math.max(halfH / tv, halfW / (tv * aspect)) * 1.03;
    const cyN = (ins.bottom - ins.top) / H;
    const cxN = -ins.right / W;
    const target = new THREE.Vector3((box.x0 + box.x1) / 2 - cxN * d * tv * aspect, (box.y0 + box.y1) / 2 - cyN * d * tv, box.z + d);
    this.group.localToWorld(target);
    if (!this.camInit) { cam.position.copy(target); this.camInit = true; }
    cam.position.lerp(target, Math.min(1, dt * 4));
    cam.rotation.set(0, 0, 0);
  }

  playing3D() {
    return this.mode !== 'intro' && this.mode !== 'over';
  }

  /** Desktop: the wall with the coach on the left and the status on the right. */
  previewCamera(dt) {
    const e = this.engine;
    const on = this.playing3D();
    e.fitEnabled = !on;
    if (!on) { this.camInit = false; return; }
    const { eye } = this;
    this.frame(e.camera, dt, { x0: -0.9, x1: 0.9, y0: eye - 0.55, y1: eye + 0.44, z: -0.62 });
  }

  /** Phones: the climb (or the summit) in the space the talk leaves free. */
  phoneCamera(cam, dt, ins) {
    if (!this.playing3D()) { this.camInit = false; return false; }
    if (cam.fov !== 60 || cam.rotation.x !== 0) { cam.fov = 60; cam.updateProjectionMatrix(); }
    const { eye } = this;
    const top = this.mode === 'meet' || this.mode === 'summit' || this.mode === 'approach';
    // The last two stages: the customer at the summit is in the picture too.
    const late = (this.stepIndex ?? 0) >= 3 && this.mode !== 'fall';
    const box = top ? { x0: -0.42, x1: 0.48, y0: eye - 0.16, y1: eye + 0.46, z: -0.62 }
      : late ? { x0: -0.45, x1: 0.45, y0: eye - 0.5, y1: eye + 0.47, z: -0.62 }
        : { x0: -0.42, x1: 0.42, y0: eye - 0.5, y1: eye + (this.portraitFrame?.visible ? 0.2 : 0.0), z: -0.62 };
    this.frame(cam, dt, box, ins);
    return true;
  }

  dispose() {
    this.mode = 'over';
    window.removeEventListener('keydown', this.onKey);
    for (const [c, fn, up] of this.grabbers ?? []) {
      c.removeEventListener('selectstart', fn);
      c.removeEventListener('squeezestart', fn);
      c.removeEventListener('selectend', up);
      c.removeEventListener('squeezeend', up);
    }
    this.engine.canvas.removeEventListener('pointerdown', this.onDown);
    this.engine.canvas.removeEventListener('pointermove', this.onMove);
    this.removePullHint();
    if (this.vignette) {
      this.vignette.removeFromParent();
      this.vignette.geometry.dispose();
      this.vignette.material.dispose();
    }
    this.app.echo?.suppress(false);
    this.engine.fitEnabled = true;
    this.engine.backdrop.visible = this.prevBackdrop;
    if (this.prevFog !== undefined) this.engine.scene.fog?.color.setHex(this.prevFog);
    if (this.shadows) this.engine.renderer.shadowMap.enabled = this.prevShadow;
    if (!this.engine.isXR) this.engine.camera.rotation.set(0, 0, 0);
    this.engine.scene.environment = this.prevEnvironment ?? null;
    this.envTarget?.dispose();
    this.climber?.dispose();
    this.rope?.dispose();
    for (const o of [...this.options, ...this.route]) o.hold.dispose();
    this.figure?.dispose();
    this.portrait?.dispose();
    super.dispose();
  }
}

/** The signal words of a reading (each word once), strongest first. */
function dedupe(hits) {
  const seen = new Set();
  return [...hits].sort((a, b) => b.weight - a.weight).filter((h) => !seen.has(h.word) && seen.add(h.word));
}
