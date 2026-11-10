// "Röstmeister" (Roast Master): a festive delicatessen counter with a drum roaster, in front of
// you in the room. Guests come one at a time and say roughly what they fancy. You pick two of
// four green coffees (tags show their flavors), set the blend and roast: the drum turns, the
// beans go from green to yellow, cinnamon, medium and dark, and you stop at the right moment
// (first and second crack can be heard). The guest drinks and rates the cup with stars.
// The AI is a recommender: it learns from every rating which cups guests like, recognises
// similar guests from what they say ("guests like you liked ...") and regulars, and from the
// third guest on suggests a blend and a roast with its confidence. Its panel shows what it
// hears, similar guests, the suggestion and a taste map of all rated cups. At the end comes a
// Christmas round: pack a gift basket (three of six treats) for a guest the AI got to know.
// Score: taste (stars), roast timing and speed per guest plus the basket (at most about 4400).
import * as THREE from 'three';
import { BaseScene } from '../scene.js';
import { Button, textPanel, placeOnArc } from '../ui3d.js';
import { SPONSOR } from '../content.js';
import { color, num } from '../tokens.js';
import { t, L, getLang } from '../i18n.js';
import { sfx } from '../sfx.js';
import { music } from '../music.js';
import { quality } from '../quality.js';
import { CHRISTMAS, makeLightString, makeTree } from '../christmas.js';
import { makeEnvironment } from '../robot-visuals.js';
import '../roast-text.js';
import {
  GUESTS, BASKET_GUEST, BEANS, RATIOS, ITEMS, CUES, FIRST_CRACK, SECOND_CRACK, Recommender,
  cupFlavor, rate, guestPoints, basketResult, basketFor, mapPos,
} from '../roast-ai.js';
import {
  loadShop, part, shopMaterials, makeJar, Roaster, makeScale, makeCup, makeItem, makeBasket, Puffs, BeanFlight, Guest, makeLights,
} from '../roast-visuals.js';
import {
  bubblePanel, jarTag, itemTag, AiPanel, blendPanel, gaugePanel, starSprite, scoreSprite, beanName, stageName, ratioIndex,
} from '../roast-panels.js';
import { RoastAudio } from '../roast-audio.js';

const DROP = num('xr-roast-counter-drop') || 0.6; // counter top below eye height
const ROAST_RATE = 0.1; // roast level per second (about 9 s from green to burnt)
const COUNTER_AT = new THREE.Vector3(0, 0, -1.0); // shop space: y = 0 is the counter top
const JAR_X = [-0.63, -0.42, -0.21, 0.0];
const JAR_Z = -0.86;
const TAG_Z = -0.675;
const SCALE_AT = new THREE.Vector3(0.19, 0, -0.86);
const CUP_AT = new THREE.Vector3(0.36, 0, -0.92);
const ROASTER_AT = new THREE.Vector3(1.12, 0, -1.02);
const ROASTER_BASE_MIN = -0.8; // the roaster stands on a pedestal so its drum is about counter height
const GUEST_AT = new THREE.Vector3(-0.17, 0, -1.56);
const ENTER_X = -1.9;
const EXIT_X = 1.9;
const ITEM_X = [-0.65, -0.46, -0.27, -0.08, 0.11, 0.3];
const BASKET_AT = new THREE.Vector3(0.54, 0, -0.93);
const clamp = THREE.MathUtils.clamp;
const short = (id) => t(`roastShort_${id}`);

export class RoastScene extends BaseScene {
  constructor(app) {
    super(app);
    this.gameKey = 'roast';
    this.mode = 'intro';
    this.time = 0;
    this.score = 0;
    this.ai = new Recommender();
    this.audio = new RoastAudio();
    this.pads = null;

    const r = this.engine.renderer;
    this.envTarget = makeEnvironment(r);
    this.prevEnvironment = this.engine.scene.environment;
    this.engine.scene.environment = this.envTarget.texture;
    this.prevShadow = r.shadowMap.enabled;
    if (!quality.lite) {
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    // The shop: counter top at eye height - DROP; everything in it is in "shop space".
    this.shop = new THREE.Group();
    this.shop.position.set(0, this.eye - DROP, 0);
    this.shop.userData.noFit = true; // the browser camera frames this.fit and the panels instead
    this.group.add(this.shop);
    this.lights = makeLights(quality.lite);
    this.shop.add(this.lights);
    // Game panels live here (not in the layer, which the intro and results clear).
    this.ui = new THREE.Group();
    this.ui.visible = false;
    this.group.add(this.ui);
    // Browser: an invisible box that the camera fit frames (the 3D shop itself is left out).
    this.fit = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ visible: false }));
    this.fit.visible = false; // shown while playing (the intro frames its own panel)
    this.fit.position.set(0.25, this.eye - DROP + 0.17, -0.97);
    this.fit.scale.set(2.2, 0.95, 0.7);
    this.group.add(this.fit);

    this.ready = loadShop().then((m) => { if (!this.disposed) this.buildShop(m); }).catch((e) => console.warn('roast models not loaded', e));
    this.onKey = (e) => this.key(e);
    window.addEventListener('keydown', this.onKey);
    this.onUpdate((dt) => this.update(dt));
    const hint = t(this.engine.isXR ? 'roastIntroXR' : this.engine.touchUI ? 'roastIntroTouch' : 'roastIntroScreen');
    this.showIntro(t('roastName'), `${t('roastIntro', { basket: t(CHRISTMAS ? 'roastBasketXmas' : 'roastBasketPlain') })} ${hint}`);
    // Phones: the scene places the camera itself while playing (a little from above).
    this.mobileView((cam, dt, ins) => this.gameCamera(cam, dt, ins));
    this.layout(true);
    // The intro shows the counter below its panel (not on a phone held upright: the panel fills it).
    if (!this.engine.isXR && this.layoutKind !== 'portrait') {
      this.fit.position.set(0.1, this.eye - DROP + 0.12, -1.0);
      this.fit.scale.set(1.7, 0.25, 0.3);
      this.fit.visible = true;
    }
  }

  /** Like BaseScene.intro, but higher, so the counter in front never covers it. */
  showIntro(title, text) {
    this.clearLayer();
    const panel = this.add(textPanel(1.1, 0.4, [
      { text: title, size: 'xr-text-title', weight: 'black', gap: 0.04 },
      { text, size: 'xr-text-md', color: color('xr-panel-muted'), gap: 0.04 },
      { text: L(SPONSOR.presentedBy), size: 'xr-text-sm', weight: 'bold', color: color('xr-warning') },
    ]));
    panel.position.set(0, this.eye + 0.64 - panel.h / 2, -this.dist);
    const go = this.add(new Button(0.42, 0.13, { label: t('start'), variant: 'primary', labelSize: 'xr-text-lg', onClick: () => this.start() }));
    go.position.set(0, panel.position.y - panel.h / 2 - 0.04 - go.h / 2, -this.dist);
    this.popIn(panel);
    this.popIn(go, 0.1);
    this.app.host?.introduce(this, 'roast', panel);
    this.prepareMusic();
  }

  // ---------- the shop ----------

  buildShop({ shop, guests }) {
    this.M = shop;
    this.G = guests;
    const s = this.shop;
    // counter with the display case (garland and lights at Christmas) and a plinth to the floor
    this.counter = part(shop, 'Counter');
    this.counter.position.copy(COUNTER_AT);
    s.add(this.counter);
    this.plinth = this.counter.getObjectByName('CounterPlinth');
    const garland = this.counter.getObjectByName('CounterGarland');
    if (garland) garland.visible = CHRISTMAS;
    if (CHRISTMAS) {
      this.string = makeLightString({ x0: -0.68, x1: 0.48, y: 0.335, z: -0.035, sag: 0.03, swags: 4, bulbs: 30 });
      this.counter.add(this.string);
      this.tree = makeTree();
      this.tree.group.scale.setScalar(0.72);
      this.tree.group.position.set(-1.22, 0, -1.78);
      s.add(this.tree.group);
    }
    // the roaster on a pedestal, turned towards the player
    this.roaster = new Roaster(shop);
    this.roaster.group.position.copy(ROASTER_AT);
    this.roaster.group.rotation.y = Math.atan2(-ROASTER_AT.x, -ROASTER_AT.z) * 0.85;
    s.add(this.roaster.group);
    this.pedestal = new THREE.Mesh(new THREE.BoxGeometry(0.56, 1, 0.56).translate(0, -0.5, 0), shopMaterials().RoastPlinth);
    this.pedestal.receiveShadow = true;
    this.roaster.group.add(this.pedestal);
    // soft shadows of the counter, the roaster and the guests on the (real) floor
    if (!quality.lite) {
      this.floorShadow = new THREE.Mesh(new THREE.PlaneGeometry(4, 3).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.32, depthWrite: false }));
      this.floorShadow.position.set(0, -1, -1.2);
      this.floorShadow.receiveShadow = true;
      s.add(this.floorShadow);
    }
    this.smoke = new Puffs(s, { count: 22, token: 'xr-roast-smoke', size: 0.16, rise: 0.3, life: 2.6 });
    this.steam = new Puffs(s, { count: 10, token: 'xr-roast-steam', size: 0.05, rise: 0.12, life: 1.4 });
    // the lever: a generous invisible handle around the knob
    const lever = this.roaster.lever;
    if (lever) {
      const hit = new THREE.Mesh(new THREE.SphereGeometry(0.075, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.set(0.01, 0.26, -0.05);
      hit.userData.interactive = true;
      hit.userData.label = t('roastPull');
      hit.userData.onGrab = (p) => this.grabLever(p);
      hit.userData.onRelease = () => this.releaseLever();
      lever.add(hit);
      this.leverHit = hit;
    }
    // jars with green coffee, their tags hanging from the counter edge, invisible hit boxes
    this.jars = JAR_X.map((x, i) => {
      const g = makeJar(shop, i);
      g.position.set(x, 0, JAR_Z);
      s.add(g);
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.26, 12), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.y = 0.12;
      hit.userData.interactive = true;
      hit.userData.label = beanName(i);
      hit.userData.onClick = () => this.toggleJar(i);
      hit.userData.setHover = (v) => this.tags[i].set({ hover: v });
      g.add(hit);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.068, 0.085, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: color('xr-roast-tag-pick'), transparent: true, opacity: 0, depthWrite: false }));
      ring.position.y = 0.003;
      g.add(ring);
      g.userData.ring = ring;
      g.userData.lift = 0;
      return g;
    });
    this.tags = JAR_X.map((x, i) => {
      const tag = jarTag(i);
      tag.position.set(x, -0.105, TAG_Z);
      tag.rotation.x = -0.32;
      tag.userData.label = beanName(i);
      tag.userData.onClick = () => this.toggleJar(i);
      s.add(tag);
      return tag;
    });
    this.scale = makeScale(shop);
    this.scale.position.copy(SCALE_AT);
    s.add(this.scale);
    this.flight = new BeanFlight(s, shop);
    // a cup on the counter, waiting (decoration)
    const deco = makeCup(shop);
    deco.position.set(0.62, 0, -1.02);
    deco.rotation.y = 0.8;
    s.add(deco);
    this.popShop();
  }

  /** The shop appears with a little pop (the models arrive after the intro panel). */
  popShop() {
    const s = this.shop;
    s.scale.setScalar(0.001);
    this.tween(0.6, (k) => s.scale.setScalar(Math.max(0.001, k)));
  }

  // ---------- flow ----------

  async start() {
    this.clearLayer();
    this.mode = 'loading';
    await this.ready;
    if (this.disposed || !this.M) return;
    this.refreshHud ??= this.hud(() => this.hudText());
    this.startMusic(0, 'roast');
    Object.assign(this, { score: 0, idx: -1, stars: [], perGuest: [], usedAI: 0, basketStars: 0 });
    this.ui.visible = true;
    this.fit.visible = !this.engine.isXR;
    this.buildUi();
    this.nextGuest();
  }

  hudText() {
    // phones: without the game's name, so the line that matters fits the status bar
    const name = this.engine.touchUI ? '' : t('roastName');
    let s = this.idx >= GUESTS.length
      ? t('roastHudBasket', { name, basket: t(CHRISTMAS ? 'roastBasketXmas' : 'roastBasketPlain'), score: this.score })
      : t('roastHud', { name, n: Math.max(1, this.idx + 1), total: GUESTS.length, score: this.score });
    s = s.replace(/^ · /, '');
    // Phones: the line that matters most right now comes first in the status bar (it holds two lines).
    if (this.engine.touchUI) {
      let first = '';
      if (this.mode === 'roast') first = `${t('roastRoasting')}: ${stageName(this.r)}`;
      else if (this.mode === 'basket' && this.sugAvailable()) first = `${t('roastAiStop')}: ${this.bsug.pick.map((k) => t(`roastItem_${k}`)).join(', ')} (${Math.round(this.bsug.conf * 100)}\u00a0%)`;
      else if (this.mode === 'pick' && this.sel?.length === 2) first = this.recipeText({ a: this.sel[0], b: this.sel[1], ratio: RATIOS[this.ratioIdx] });
      else if (this.mode === 'pick' && this.sug?.recipe) first = `${t('roastAiStop')}: ${this.recipeText(this.sug.recipe)} (${Math.round(this.sug.conf * 100)}\u00a0%)`;
      if (first) s = `${first} · ${s}`;
    }
    return s;
  }

  recipeText(rc) {
    return t('roastRecipe', { a: beanName(rc.a), pa: Math.round(rc.ratio * 100), b: beanName(rc.b), pb: Math.round((1 - rc.ratio) * 100) });
  }

  /** Panels and buttons of a round (created once per game). */
  buildUi() {
    const ui = this.ui;
    ui.clear();
    this.aiPanel = new AiPanel(0.66, 0.92);
    ui.add(this.aiPanel);
    this.aiBtn = new Button(0.42, 0.1, { label: t('roastAiUse'), variant: 'secondary', onClick: () => this.useAI() });
    this.aiPanel.add(this.aiBtn);
    this.aiBtn.position.set(0, -0.46 - 0.075, 0.002);
    // blend bar with the share buttons and "roast"
    this.blend = blendPanel();
    this.blend.userData.label = t('roastBlend');
    this.blend.userData.onGrab = (p) => { if (this.mode === 'pick' && this.sel.length === 2) this.drag = p; };
    this.blend.userData.onRelease = () => { this.drag = null; };
    ui.add(this.blend);
    this.moreA = new Button(0.27, 0.085, { label: '+', labelSize: 'xr-text-min', onClick: () => this.shift(1) });
    this.moreB = new Button(0.27, 0.085, { label: '+', labelSize: 'xr-text-min', onClick: () => this.shift(-1) });
    this.roastBtn = new Button(0.22, 0.16, { label: t('roastRoast'), variant: 'primary', labelSize: 'xr-text-md', onClick: () => this.startRoast() });
    [this.moreA, this.moreB, this.roastBtn].forEach((b) => this.blend.add(b));
    // roast gauge and stop button (same place as the blend)
    this.gauge = gaugePanel();
    ui.add(this.gauge);
    this.stopBtn = new Button(0.36, 0.11, { label: t('roastStop'), variant: 'primary', labelSize: 'xr-text-lg', onClick: () => this.stopRoast() });
    this.gauge.add(this.stopBtn);
    // basket round: what is in the basket, and "pack"
    this.basketInfo = textPanel(0.62, 0.12, () => [
      { text: t('roastBasketPick'), size: 'xr-text-min', weight: 'bold', color: color('xr-panel-muted'), gap: 0.008 },
      { text: t('roastBasketChosen', { list: (this.picks ?? []).map((k) => t(`roastItem_${ITEMS[k].key}`)).join(', ') || '–' }), size: 'xr-text-sm', weight: 'bold' },
    ], { grow: false });
    ui.add(this.basketInfo);
    this.packBtn = new Button(0.3, 0.09, { label: t('roastBasketPack'), variant: 'primary', labelSize: 'xr-text-sm', onClick: () => this.pack() });
    this.basketInfo.add(this.packBtn);
    this.packBtn.position.set(0, -0.06 - 0.06, 0.002);
    this.showControls('none');
    this.layout(true);
  }

  /** Which control group is visible: 'blend', 'gauge', 'basket' or 'none'. */
  showControls(which) {
    this.controls = which;
    this.blend.visible = which === 'blend';
    this.gauge.visible = which === 'gauge';
    this.basketInfo.visible = which === 'basket';
    // phones use the big screen buttons instead of the 3D ones
    const touch = this.engine.touchUI;
    [this.moreA, this.moreB, this.roastBtn, this.stopBtn, this.packBtn, this.aiBtn].forEach((b) => { b.visible = !touch; });
    // the AI's button under its panel (phones have it among their big buttons)
    this.aiBtn.visible = !touch && (which === 'blend' || which === 'basket') && !!this.sugAvailable();
    this.updatePads();
  }

  sugAvailable() {
    if (this.mode === 'basket') return this.bsug?.profile && this.bsug.pick.length;
    return this.sug?.recipe;
  }

  nextGuest() {
    this.idx += 1;
    if (this.idx >= GUESTS.length) { this.startBasket(); return; }
    const g = (this.gdef = GUESTS[this.idx]);
    this.sel = [];
    this.ratioIdx = 2;
    this.aiStop = null;
    this.r = 0;
    this.usedNow = false;
    this.roaster.fillTray(null);
    this.spawnGuest(g.model);
    let ask = t(`roastAsk_${g.key}`);
    if (g.returning) {
      const last = [...this.ai.log].reverse().find((e) => e.id === g.id);
      ask = t(`roastAsk_${g.key}_${last && last.stars >= 4 ? 'good' : 'bad'}`);
    }
    this.ask = ask;
    this.mode = 'enter';
    this.sug = null;
    this.aiPanel.show({ count: this.ai.count, cues: [], status: t('roastAiWaiting'), kind: 'wait', lines: [], title2: null, conf: null, aim: null, dots: this.dots(), learned: null });
    this.showControls('none');
    this.delay(1.5, () => {
      if (this.disposed || this.mode !== 'enter') return;
      this.say(t(`roastGuest_${g.id}`), ask);
      this.mode = 'pick';
      this.pickT0 = this.time;
      this.showAI(g);
      this.showControls('blend');
      this.refreshBlend();
      this.refreshHud?.();
    });
    this.refreshHud?.();
  }

  /** A guest walks in from the left to the counter. */
  spawnGuest(model) {
    this.removeGuest();
    const guest = new Guest(this.G, model);
    guest.group.position.set(ENTER_X, this.floorShop ?? -1, GUEST_AT.z);
    guest.group.rotation.y = Math.PI / 2;
    this.shop.add(guest.group);
    this.guest = guest;
    guest.walking = 1;
    const from = ENTER_X;
    this.tween(1.4, (k) => { guest.group.position.x = from + (GUEST_AT.x - from) * k; }, {
      ease: (k) => 1 - (1 - k) ** 2,
      onDone: () => { guest.walking = 0; guest.turnTo = Math.atan2(-GUEST_AT.x, -GUEST_AT.z); },
    });
  }

  /** The guest walks out to the right and is gone. */
  leaveGuest(onDone) {
    const guest = this.guest;
    if (!guest) { onDone?.(); return; }
    this.bubble?.removeFromParent();
    this.bubble = null;
    guest.turnTo = Math.PI / 2; // walks on to the right, facing the way it goes
    guest.walking = 1;
    guest.talking = false;
    const from = guest.group.position.x;
    this.tween(1.3, (k) => { guest.group.position.x = from + (EXIT_X - from) * k; }, {
      ease: (k) => k * k,
      onDone: () => { if (this.guest === guest) this.removeGuest(); onDone?.(); },
    });
  }

  removeGuest() {
    const g = this.guest;
    if (!g) return;
    this.guest = null;
    g.group.removeFromParent();
    g.group.traverse((o) => { if (o.isMesh && o.geometry && o.userData.own) o.geometry.dispose(); });
    g.dispose();
    this.cup?.removeFromParent();
    this.cup?.traverse((o) => { if (o.userData.own) { o.geometry.dispose(); o.material.dispose(); } });
    this.cup = null;
    this.starSprites?.forEach((s) => { s.removeFromParent(); s.material.map.dispose(); s.material.dispose(); });
    this.starSprites = null;
  }

  /** The guest's speech bubble (beside the head, to the right). */
  say(name, body, sub = null, stars = 0) {
    this.bubble?.removeFromParent();
    this.bubble?.dispose();
    const b = bubblePanel({ name, body, sub, stars, w: 0.64 });
    this.bubble = b;
    this.ui.add(b);
    this.placeBubble();
    this.popIn(b);
    if (this.guest) {
      this.guest.talking = true;
      this.delay(Math.min(2.6, 0.5 + body.length * 0.03), () => { if (this.guest) this.guest.talking = false; });
    }
  }

  placeBubble() {
    const b = this.bubble;
    if (!b) return;
    const headTop = this.shop.position.y + (this.floorShop ?? -1) + 1.5;
    const y = Math.min(this.eye + 0.36 - b.h / 2, headTop + 0.06 + b.h / 2);
    const L = this.layoutKind;
    if (L === 'portrait') b.position.set(0.12, y, GUEST_AT.z + 0.25);
    else b.position.set(GUEST_AT.x + 0.14 + b.w / 2, y, GUEST_AT.z + 0.12);
    b.rotation.set(0, this.engine.isXR ? Math.atan2(-b.position.x, -b.position.z) : 0, 0);
  }

  /** What the AI makes of this guest, shown on its panel. */
  showAI(g) {
    const s = (this.sug = this.ai.suggest(g));
    const cues = CUES.filter((k) => g.cues[k]).sort((a, b) => g.cues[b] - g.cues[a]).map((k) => t(`roastCue_${k}`));
    const view = { count: this.ai.count, cues, cueLabel: 'roastAiHears', lines: [], title2: null, conf: null, aim: null, dots: this.dots(), learned: null };
    if (s.recipe) {
      const liked = s.neighbors.find((n) => n.stars >= 3 && n.id !== g.id) ?? s.neighbors.find((n) => n.stars >= 3) ?? s.neighbors[0];
      view.kind = s.regular ? 'regular' : 'suggest';
      view.status = s.regular ? t('roastAiRegular', { n: s.regular.stars }) : t('roastAiSimilar', { list: s.neighbors.slice(0, 2).map((n) => `${short(n.id)}\u00a0${Math.round(n.sim * 100)}\u00a0%`).join(', ') });
      // a regular who liked their last cup: that cup; else what similar guests liked
      view.title2 = s.regular && s.regular.stars >= 3 ? t('roastAiRegularLiked', { name: short(g.id) }) : t('roastAiLiked', { name: short(liked.id) });
      view.lines = [this.recipeText(s.recipe), t('roastRecipeRoast', { stage: stageName(s.roast) })];
      view.conf = s.conf;
      view.aim = { ...mapPos(s.profile, s.roast), conf: s.conf };
      this.aiStop = s.roast;
    } else if (s.avoid) {
      view.kind = 'avoid';
      view.status = t('roastAiAvoid', { name: short(s.avoid.id), recipe: this.recipeText(s.avoid.recipe) });
    } else {
      view.kind = 'cold';
      view.status = this.ai.count ? t('roastAiColdNew') : t('roastAiCold');
    }
    this.aiPanel.show(view);
    this.pulse(this.aiPanel);
  }

  /** The rated cups as dots on the taste map. */
  dots() {
    return this.ai.log.map((e, i) => ({ ...mapPos(e.cup, e.roast), stars: e.stars, label: short(e.id).slice(0, 1), big: i === this.ai.log.length - 1 }));
  }

  /** Pops a 3D model in by its scale only (its materials are shared with the rest of the shop). */
  popScale(obj, delay = 0) {
    obj.scale.setScalar(0.001);
    this.delay(delay, () => this.tween(0.35, (k) => obj.scale.setScalar(Math.max(0.001, k * (1 + 0.15 * Math.sin(k * Math.PI))))));
  }

  pulse(obj) {
    const s0 = obj.userData.base ?? obj.scale.x;
    this.tween(0.35, (k) => obj.scale.setScalar(s0 * (1 + 0.05 * Math.sin(k * Math.PI))));
  }

  // ---------- choosing and blending ----------

  toggleJar(i) {
    if (this.mode === 'basket') { this.toggleItem(i); return; }
    if (this.mode !== 'pick') return;
    const at = this.sel.indexOf(i);
    if (at >= 0) this.sel.splice(at, 1);
    else {
      if (this.sel.length >= 2) this.sel.shift();
      this.sel.push(i);
    }
    sfx.tink();
    this.audio.pour(0.15, 0.05);
    this.refreshBlend();
  }

  shift(d) {
    if (this.mode !== 'pick' || this.sel.length < 2) return;
    const n = clamp(this.ratioIdx + d, 0, RATIOS.length - 1);
    if (n !== this.ratioIdx) { this.ratioIdx = n; sfx.tick(); this.refreshBlend(); }
  }

  /** Jars lift when chosen; tags, blend bar, scale and buttons follow the choice. */
  refreshBlend() {
    this.jars?.forEach((j, i) => {
      const k = this.sel.indexOf(i);
      j.userData.want = k >= 0 ? 1 : 0;
      this.tags[i].set({ selected: k >= 0, order: k + 1 });
    });
    const [a = null, b = null] = this.sel;
    const share = RATIOS[this.ratioIdx];
    this.blend.set({ a, b, share });
    this.scale.userData.set(share, this.sel.length === 2);
    const two = this.sel.length === 2;
    this.moreA.opts.label = two ? t('roastMore', { name: beanName(a) }) : '+';
    this.moreB.opts.label = two ? t('roastMore', { name: beanName(b) }) : '+';
    this.moreA.set({ disabled: !two || this.ratioIdx >= RATIOS.length - 1 });
    this.moreB.set({ disabled: !two || this.ratioIdx <= 0 });
    this.moreA.redraw();
    this.moreB.redraw();
    this.roastBtn.set({ disabled: !two });
    this.updatePads();
    this.refreshHud?.();
  }

  /** Takes the AI's suggestion (beans, share and its stop mark on the gauge). */
  useAI() {
    if (this.mode === 'basket') {
      if (!this.sugAvailable()) return;
      this.picks = this.bsug.pick.map((k) => ITEMS.findIndex((it) => it.key === k));
      this.refreshItems();
      sfx.powerup();
      return;
    }
    if (this.mode !== 'pick' || !this.sug?.recipe) return;
    const rc = this.sug.recipe;
    this.sel = [rc.a, rc.b];
    this.ratioIdx = ratioIndex(rc.ratio);
    this.usedNow = true;
    sfx.powerup();
    this.refreshBlend();
  }

  // ---------- roasting ----------

  startRoast() {
    if (this.mode !== 'pick') return;
    if (this.sel.length < 2) { this.toast(t('roastNeedTwo'), 'xr-warning'); sfx.wrong(); return; }
    this.mode = 'pour';
    this.showControls('none');
    this.drag = null;
    this.scale.userData.set(RATIOS[this.ratioIdx], false);
    // beans fly from both jars into the hopper
    const s = this.shop;
    const froms = this.sel.map((i) => this.jars[i].position.clone().add(new THREE.Vector3(0, 0.24, 0)));
    const to = s.worldToLocal(this.roaster.hopper.getWorldPosition(new THREE.Vector3()));
    this.flight.start(froms, to);
    this.audio.pour(1.0, 0.08);
    sfx.whoosh();
    this.delay(1.05, () => {
      if (this.disposed || this.mode !== 'pour') return;
      this.mode = 'roast';
      this.r = 0;
      this.cracked = 0;
      this.roastT = 0;
      this.roaster.showDrum(true);
      this.audio.rumble(true);
      this.gauge.set({ r: 0, aiStop: this.aiStop, done: false });
      this.showControls('gauge');
      this.toast(t(this.engine.isXR ? 'roastStopHintXR' : this.engine.touchUI ? 'roastStopHintTouch' : 'roastStopHintScreen'), 'xr-roast-flame');
    });
  }

  grabLever(p) {
    if (this.mode !== 'roast') return;
    if (p.kind === 'xr' && p.controller) {
      this.leverHold = { p, from: new THREE.Vector3().setFromMatrixPosition(p.controller.matrixWorld) };
      this.engine.haptic(p, 0.4, 30);
    } else this.stopRoast();
  }

  releaseLever() {
    if (this.leverHold && this.mode === 'roast') this.stopRoast();
    this.leverHold = null;
  }

  /** Real hand movement: pulling the grabbed lever down (or towards you) stops the roast. */
  readLever() {
    const h = this.leverHold;
    if (!h) return 0;
    const now = new THREE.Vector3().setFromMatrixPosition(h.p.controller.matrixWorld);
    const d = h.from.clone().sub(now);
    const pull = clamp(Math.max(d.y, 0) / 0.1 + Math.max(-d.z, 0) / 0.25, 0, 1);
    if (pull >= 1 && this.mode === 'roast') {
      this.engine.haptic(h.p, 0.8, 60);
      this.leverHold = null;
      this.stopRoast();
    }
    return pull;
  }

  updateRoast(dt) {
    this.roastT += dt;
    this.r = Math.min(1, this.r + dt * ROAST_RATE * (this.r > FIRST_CRACK ? 1.08 : 1));
    this.gauge.set({ r: Math.round(this.r * 300) / 300 });
    if (this.cracked < 1 && this.r >= FIRST_CRACK) {
      this.cracked = 1;
      this.audio.firstCrack();
      this.hapticAll(0.5, 80);
      this.toast(t('roastCrack1Toast'), 'xr-roast-bean-cinnamon');
    } else if (this.cracked < 2 && this.r >= SECOND_CRACK) {
      this.cracked = 2;
      this.audio.secondCrack();
      this.hapticAll(0.3, 60);
      this.toast(t('roastCrack2Toast'), 'xr-roast-bean-dark');
    }
    // smoke from the chimney, thicker and darker the darker the roast
    this.smokeT = (this.smokeT ?? 0) - dt;
    if (this.smokeT <= 0 && this.r > 0.28) {
      this.smokeT = 0.5 - 0.35 * this.r;
      const at = this.shop.worldToLocal(this.roaster.chimney.localToWorld(new THREE.Vector3(0, 1.6, -0.3)));
      const c = new THREE.Color(color('xr-roast-smoke')).lerp(new THREE.Color(color('xr-roast-smoke-dark')), clamp((this.r - 0.6) / 0.35, 0, 1));
      this.smoke.emit(at, c, 0.6 + this.r);
    }
    if (this.r >= 1) {
      this.toast(t('roastBurntToast'), 'xr-danger');
      this.stopRoast();
    }
  }

  hapticAll(i, ms) {
    for (const p of this.engine.pointers) if (p.kind === 'xr' && p.active) this.engine.haptic(p, i, ms);
  }

  stopRoast() {
    if (this.mode !== 'roast') return;
    this.mode = 'serve';
    this.leverHold = null;
    this.leverKick = 1;
    const r = this.r;
    const g = this.gdef;
    this.audio.rumble(false);
    this.audio.pour(0.7, 0.06);
    sfx.thud();
    this.roaster.showDrum(false);
    this.roaster.fillTray(r);
    this.gauge.set({ r, done: true });
    const [a, b] = this.sel;
    const share = RATIOS[this.ratioIdx];
    const cup = cupFlavor(a, b, share, r);
    const res = rate(g, cup, r);
    const secs = this.time - this.pickT0;
    const pts = guestPoints(g, res.stars, r, secs);
    if (this.usedNow) this.usedAI += 1;
    this.lastServe = { a, b, share, r, cup, res, pts };
    this.delay(0.6, () => { if (!this.disposed) this.serve(); });
  }

  /** The cup is poured, carried to the guest, tasted and rated; the AI learns from the rating. */
  serve() {
    const { a, b, share, r, cup, res, pts } = this.lastServe;
    const g = this.gdef;
    this.showControls('none');
    const c = makeCup(this.M);
    c.position.copy(CUP_AT);
    this.shop.add(c);
    this.cup = c;
    this.popScale(c);
    sfx.appear();
    this.tween(0.8, (k) => c.userData.fill(k));
    this.steamOn = true;
    const guest = this.guest;
    this.delay(1.1, () => {
      if (this.disposed || this.guest !== guest) return;
      // carry the cup to the guest's hand
      const from = c.position.clone();
      this.tween(0.6, (k) => {
        const to = this.shop.worldToLocal(guest.hand.getWorldPosition(new THREE.Vector3()));
        c.position.lerpVectors(from, to, k);
        c.position.y += Math.sin(k * Math.PI) * 0.12;
      }, { onDone: () => { if (this.guest === guest) { guest.hand.attach(c); c.position.set(0, -0.02, 0.03); c.rotation.set(0, 0, 0); } } });
      this.tween(0.6, (k) => { guest.drinkK = k * 0.5; });
    });
    this.delay(1.8, () => {
      if (this.disposed || this.guest !== guest) return;
      this.steamOn = false;
      this.tween(0.6, (k) => { guest.drinkK = 0.5 + 0.5 * k; });
    });
    this.delay(2.8, () => {
      if (this.disposed || this.guest !== guest) return;
      this.tween(0.5, (k) => { guest.drinkK = 1 - 0.75 * k; });
      const mood = res.stars >= 4 ? 'happy' : res.stars <= 2 ? 'sad' : 'neutral';
      guest.react(mood);
      (res.stars >= 4 ? sfx.correct : res.stars <= 2 ? sfx.wrong : sfx.point)();
      const hint = res.hint && res.stars < 5 ? t(`roastHint_${res.hint}`) : null;
      this.say(t(`roastGuest_${g.id}`), t(`roastReact${res.stars}`), hint, res.stars);
      this.popStars(res.stars);
      this.score += pts.total;
      this.stars.push(res.stars);
      this.perGuest.push({ key: g.key, stars: res.stars, usedAI: this.usedNow });
      const head = guest.main.head.getWorldPosition(new THREE.Vector3());
      this.floatText(t('roastPoints', { n: pts.total }), head.add(new THREE.Vector3(0, 0.2, 0.3)), 'xr-roast-star');
      this.toast(t('roastPointsParts', { a: pts.taste, b: pts.timing, c: pts.speed }), 'xr-roast-star');
      this.refreshHud?.();
    });
    this.delay(3.5, () => {
      if (this.disposed) return;
      // the AI learns from this rating
      this.ai.record(g, { a, b, ratio: share }, cup, r, res.stars);
      this.learnFx(res.stars, mapPos(cup, r), g);
    });
    this.delay(6.0, () => {
      if (this.disposed || this.guest !== guest) return;
      this.leaveGuest(() => { if (!this.disposed && this.mode === 'serve') this.nextGuest(); });
    });
  }

  /** A light dot flies from the guest to the AI panel; the new cup appears on the taste map. */
  learnFx(stars, pos, g) {
    const from = this.guest ? this.guest.main.head.getWorldPosition(new THREE.Vector3()) : this.aiPanel.getWorldPosition(new THREE.Vector3());
    const to = this.aiPanel.getWorldPosition(new THREE.Vector3());
    const dot = starSprite(true, 0.05);
    const local = (v) => this.group.worldToLocal(v.clone());
    const a = local(from);
    const b = local(to);
    dot.position.copy(a);
    this.group.add(dot);
    sfx.build();
    this.tween(0.7, (k) => {
      dot.position.lerpVectors(a, b, k);
      dot.position.y += Math.sin(k * Math.PI) * 0.25;
    }, {
      onDone: () => {
        dot.removeFromParent();
        dot.material.map.dispose();
        dot.material.dispose();
        if (this.disposed) return;
        this.aiPanel.show({ count: this.ai.count, dots: this.dots(), learned: t('roastAiLearned', { name: short(g.id), n: stars }), flash: 1 });
        let step = -1;
        this.tween(0.8, (k) => {
          const n = Math.round(k * 6);
          if (n === step) return;
          step = n;
          this.aiPanel.view.flash = 1 - n / 6;
          this.aiPanel.redraw();
        });
        this.pulse(this.aiPanel);
      },
    });
  }

  popStars(n) {
    const guest = this.guest;
    if (!guest) return;
    this.starSprites?.forEach((s) => s.removeFromParent());
    const head = this.shop.worldToLocal(guest.main.head.getWorldPosition(new THREE.Vector3()));
    this.starSprites = Array.from({ length: 5 }, (_, i) => {
      const s = starSprite(i < n, 0.075);
      s.position.set(head.x - 0.18 + i * 0.09, head.y + 0.42, head.z + 0.1);
      s.scale.multiplyScalar(0.001);
      this.shop.add(s);
      this.delay(0.12 * i, () => {
        if (i < n) sfx.coin();
        this.tween(0.3, (k) => s.scale.setScalar(Math.max(0.001, 0.075 * (k + 0.25 * Math.sin(k * Math.PI)))));
      });
      return s;
    });
  }

  floatText(text, worldPos, token) {
    const s = scoreSprite(text, token, 0.32);
    s.material.depthTest = false;
    const p = this.group.worldToLocal(worldPos.clone());
    s.position.copy(p);
    this.group.add(s);
    this.tween(1.6, (k) => { s.position.y = p.y + k * 0.15; s.material.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3; }, {
      ease: (k) => k,
      onDone: () => { s.removeFromParent(); s.material.map.dispose(); s.material.dispose(); },
    });
  }

  // ---------- the Christmas basket ----------

  startBasket() {
    this.mode = 'enter';
    this.idx = GUESTS.length;
    this.picks = [];
    this.roaster.fillTray(null);
    // the jars, tags and scale make room for the treats and the basket
    this.jars.forEach((j) => { j.visible = false; });
    this.tags.forEach((tg) => { tg.visible = false; });
    this.scale.visible = false;
    this.basket = makeBasket(this.M);
    this.basket.position.copy(BASKET_AT);
    this.basket.rotation.y = -0.4;
    this.shop.add(this.basket);
    this.popScale(this.basket);
    this.items = ITEMS.map((it, i) => {
      const g = new THREE.Group();
      const m = makeItem(this.M, it.model);
      g.add(m);
      g.position.set(ITEM_X[i], 0, JAR_Z);
      g.rotation.y = 0.3 - i * 0.12;
      const hit = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.14), new THREE.MeshBasicMaterial({ visible: false }));
      hit.position.y = 0.07;
      hit.userData.interactive = true;
      hit.userData.label = t(`roastItem_${it.key}`);
      hit.userData.onClick = () => this.toggleItem(i);
      hit.userData.setHover = (v) => this.itemTags[i].set({ hover: v });
      g.add(hit);
      g.userData.home = g.position.clone();
      g.userData.lift = 0;
      this.shop.add(g);
      this.popScale(g, 0.1 + i * 0.06);
      return g;
    });
    this.itemTags = ITEMS.map((it, i) => {
      const tag = itemTag(t(`roastItem_${it.key}`), i + 1);
      tag.position.set(ITEM_X[i], -0.06, TAG_Z);
      tag.rotation.x = -0.32;
      tag.userData.label = t(`roastItem_${it.key}`);
      tag.userData.onClick = () => this.toggleItem(i);
      this.shop.add(tag);
      return tag;
    });
    this.spawnGuest(BASKET_GUEST.model);
    this.bsug = this.ai.basket(BASKET_GUEST.forId);
    const known = !!this.bsug.profile;
    const forG = basketFor();
    this.aiPanel.show({
      count: this.ai.count, cues: [short(forG.id)], cueLabel: 'roastAiFor', kind: known ? 'basket' : 'cold',
      status: known ? t('roastAiBasket') : t('roastAiBasketCold'),
      title2: null,
      lines: known ? [this.bsug.pick.map((k) => t(`roastItem_${k}`)).join(', ')] : [],
      conf: known ? this.bsug.conf : null,
      aim: known ? { ...mapPos(this.bsug.profile, forG.roast), conf: this.bsug.conf } : null,
      dots: this.dots(), learned: null,
    });
    this.showControls('none');
    this.delay(1.5, () => {
      if (this.disposed) return;
      this.say(t('roastGuest_student'), t(CHRISTMAS ? 'roastAsk_basket' : 'roastAsk_basket_plain'));
      this.mode = 'basket';
      this.pickT0 = this.time;
      this.showControls('basket');
      this.refreshItems();
      this.refreshHud?.();
      this.pulse(this.aiPanel);
    });
    this.refreshHud?.();
  }

  toggleItem(i) {
    if (this.mode !== 'basket') return;
    const at = this.picks.indexOf(i);
    if (at >= 0) this.picks.splice(at, 1);
    else {
      if (this.picks.length >= 3) this.picks.shift();
      this.picks.push(i);
    }
    sfx.tink();
    this.refreshItems();
  }

  refreshItems() {
    this.items?.forEach((g, i) => {
      g.userData.want = this.picks.includes(i) ? 1 : 0;
      this.itemTags[i].set({ selected: this.picks.includes(i) });
    });
    this.basketInfo.redraw();
    this.packBtn.set({ disabled: this.picks.length < 3 });
    this.updatePads();
  }

  pack() {
    if (this.mode !== 'basket') return;
    if (this.picks.length < 3) { this.toast(t('roastBasketNeed'), 'xr-warning'); sfx.wrong(); return; }
    this.mode = 'pack';
    this.showControls('none');
    const keys = this.picks.map((i) => ITEMS[i].key);
    const res = basketResult(basketFor(), keys);
    const usedAI = this.bsug?.pick && keys.every((k) => this.bsug.pick.includes(k));
    // the three treats hop into the basket
    this.picks.forEach((i, n) => {
      const g = this.items[i];
      this.delay(0.25 * n, () => {
        const from = g.position.clone();
        const to = BASKET_AT.clone().add(new THREE.Vector3((n - 1) * 0.06, 0.06, (n % 2) * 0.03));
        sfx.boing();
        this.tween(0.5, (k) => {
          g.position.lerpVectors(from, to, k);
          g.position.y += Math.sin(k * Math.PI) * 0.2;
          g.scale.setScalar(1 - 0.3 * k);
        });
      });
    });
    this.delay(1.3, () => {
      if (this.disposed || !this.guest) return;
      this.burst(this.basket.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.15, 0)), 'xr-roast-star', 30);
      this.guest.react(res.stars >= 4 ? 'happy' : res.stars <= 2 ? 'sad' : 'neutral');
      (res.stars >= 4 ? sfx.finish : res.stars <= 2 ? sfx.wrong : sfx.point)();
      this.say(t('roastGuest_student'), t(`roastBasketThanks${res.stars}`), null, res.stars);
      this.popStars(res.stars);
      this.score += res.points;
      this.basketStars = res.stars;
      this.basketAI = usedAI;
      const head = this.guest.main.head.getWorldPosition(new THREE.Vector3());
      this.floatText(t('roastPoints', { n: res.points }), head.add(new THREE.Vector3(0, 0.2, 0.3)), 'xr-roast-star');
      this.refreshHud?.();
    });
    this.delay(4.6, () => { if (!this.disposed) this.finish(); });
  }

  finish() {
    if (this.mode === 'over') return;
    this.mode = 'over';
    this.audio.stop();
    this.ui.visible = false;
    this.fit.visible = false;
    this.updatePads();
    // the shop makes way for the results
    const s = this.shop;
    this.tween(0.5, (k) => s.scale.setScalar(Math.max(0.001, 1 - k)), { onDone: () => { s.visible = false; this.removeGuest(); } });
    const n = this.stars.length;
    const avg = n ? this.stars.reduce((s, v) => s + v, 0) / n : 0;
    const good = this.stars.filter((s) => s >= 4).length + (this.basketStars >= 4 ? 1 : 0);
    const learned = [{ q: t('roastLearnQ1'), a: t('roastLearnA1') }, { q: t('roastLearnQ2'), a: t('roastLearnA2') }];
    const chef = this.perGuest.find((p) => p.key === 'chef');
    if (chef && chef.usedAI && chef.stars <= 3) learned.push({ q: t('roastLearnQ4'), a: t('roastLearnA4') });
    else learned.push({ q: t('roastLearnQ3'), a: t('roastLearnA3') });
    const fmt = (v) => v.toFixed(1).replace('.', getLang() === 'de' ? ',' : '.');
    this.results({
      gameKey: 'roast',
      score: Math.min(5000, Math.round(this.score)),
      correct: good,
      total: GUESTS.length + 1,
      line: t('roastLine', { n, avg: fmt(avg), basket: this.basketStars }),
      learned,
      onAgain: () => this.app.startGame('roast'),
    });
  }

  // ---------- small UI helpers ----------

  toast(text, token = 'xr-accent') {
    this.toastPanel?.removeFromParent();
    this.toastPanel?.dispose();
    const p = textPanel(0.62, 0.08, [{ text, size: 'xr-text-sm', weight: 'black', color: color(token) }], { surface: { stroke: color(token) } });
    this.ui.add(p);
    const L = this.layoutKind;
    // above the controls (where the eyes are while roasting)
    const c = this.gauge.visible ? this.gauge : this.basketInfo.visible ? this.basketInfo : this.blend;
    p.position.set(c.position.x, c.position.y + (L === 'portrait' ? 0.19 : 0.22), c.position.z - 0.02);
    p.rotation.copy(c.rotation);
    this.popIn(p);
    this.toastPanel = p;
    this.delay(2.2, () => { if (this.toastPanel === p) { p.removeFromParent(); p.dispose(); this.toastPanel = null; } });
  }

  key(e) {
    if (e.repeat) return;
    const k = e.key;
    if (this.mode === 'pick') {
      if (k >= '1' && k <= '4') this.toggleJar(Number(k) - 1);
      else if (k === 'ArrowRight') this.shift(1);
      else if (k === 'ArrowLeft') this.shift(-1);
      else if (k === 'a' || k === 'A') this.useAI();
      else if (k === 'Enter') this.startRoast();
      else return;
    } else if (this.mode === 'roast') {
      if (k === ' ' || k === 'Enter') this.stopRoast();
      else return;
    } else if (this.mode === 'basket') {
      if (k >= '1' && k <= '6') this.toggleItem(Number(k) - 1);
      else if (k === 'a' || k === 'A') this.useAI();
      else if (k === 'Enter') this.pack();
      else return;
    } else return;
    e.preventDefault();
  }

  // ---------- phones: big buttons ----------

  updatePads() {
    if (!this.engine.touchUI) return;
    let kind = 'none';
    if (this.mode === 'pick') kind = this.sel?.length === 2 ? 'blend' : 'pick';
    else if (this.mode === 'roast') kind = 'roast';
    else if (this.mode === 'basket') kind = this.picks?.length === 3 ? 'pack' : 'items';
    if (kind !== this.padKind) {
      this.padKind = kind;
      this.pads?.remove();
      this.pads = null;
      const ai = { icon: 'lab', label: t('roastAiUse'), onPress: () => this.useAI(), group: 'right' };
      let items = null;
      let opts = { grid: true };
      // the bean and its main note ("Ethiopia · fruity"), since the 3D tags are small on a phone
      const note = (i) => `${beanName(i)} · ${t(`roastBeanNote_${BEANS[i].key}`).split(',')[0]}`;
      if (kind === 'pick') items = [0, 1, 2, 3].map((i) => ({ icon: '', label: note(i), onPress: () => this.toggleJar(i), group: i < 3 ? 'left' : 'right' })).concat([ai]);
      else if (kind === 'blend') {
        items = [
          { icon: '', label: '+', onPress: () => this.shift(1), group: 'left' },
          { icon: '', label: '+', onPress: () => this.shift(-1), group: 'left' },
          { icon: 'review', label: t('roastChange'), onPress: () => { this.sel = []; this.refreshBlend(); }, group: 'left' },
          ai,
          { icon: 'roast', label: t('roastRoast'), onPress: () => this.startRoast(), group: 'right', primary: true },
        ];
      } else if (kind === 'roast') {
        items = [{ icon: 'roast', label: t('roastStop'), onPress: () => this.stopRoast(), primary: true }];
        opts = {};
      } else if (kind === 'items') items = ITEMS.map((it, i) => ({ icon: 'gift', label: t(`roastItem_${it.key}`), onPress: () => this.toggleItem(i), group: i < 3 ? 'left' : 'right' }));
      else if (kind === 'pack') {
        items = [
          { icon: 'review', label: t('roastChangeItems'), onPress: () => { this.picks = []; this.refreshItems(); }, group: 'left' },
          ...(this.sugAvailable() ? [{ ...ai, group: 'left' }] : []),
          { icon: 'gift', label: t('roastBasketPack'), onPress: () => this.pack(), group: 'right', primary: true },
        ];
      }
      if (items) {
        this.pads = this.touchButtons(items, opts);
        this.padEl = [...document.querySelectorAll('#stage > .mtouch')].pop() ?? null;
        this.pads?.show(true);
      }
    }
    // the state of the buttons: chosen beans or treats are marked, unusable ones disabled
    const btns = this.padEl ? [...this.padEl.querySelectorAll('.mtouch__btn')] : [];
    const mark = (i, on) => {
      const b = btns[i];
      if (!b) return;
      b.setAttribute('aria-pressed', String(on));
      b.style.borderColor = on ? 'var(--xr-roast-tag-pick)' : '';
      b.style.boxShadow = on ? 'inset 0 0 0 3px var(--xr-roast-tag-pick)' : '';
    };
    if (kind === 'pick') {
      [0, 1, 2, 3].forEach((i) => mark(i, this.sel.includes(i)));
      this.pads?.disable(4, !this.sug?.recipe);
    } else if (kind === 'blend') {
      const [a, b] = this.sel;
      this.pads?.relabel(0, '', t('roastMore', { name: beanName(a) }));
      this.pads?.relabel(1, '', t('roastMore', { name: beanName(b) }));
      this.pads?.disable(0, this.ratioIdx >= RATIOS.length - 1);
      this.pads?.disable(1, this.ratioIdx <= 0);
      this.pads?.disable(3, !this.sug?.recipe);
    } else if (kind === 'items') ITEMS.forEach((_, i) => mark(i, this.picks.includes(i)));
  }

  // ---------- layout ----------

  /**
   * Places the panels: in the headset and on wide screens the AI panel on the left (on the arc),
   * the controls on the right above the counter, the bubble beside the guest. Phones held
   * upright stack them: bubble on top, controls over the counter, the AI panel below it.
   */
  layout(force = false) {
    const e = this.engine;
    const portrait = !e.isXR && e.touchUI && window.innerWidth < window.innerHeight;
    const kind = e.isXR ? 'xr' : portrait ? 'portrait' : e.touchUI ? 'land' : 'desk';
    if (!force && kind === this.layoutKind && this.layoutBuilt) return;
    this.layoutKind = kind;
    this.focusRoaster = undefined;
    if (!this.aiPanel) return;
    this.aiPanel.visible = true;
    this.layoutBuilt = true;
    const eye = this.eye;
    const top = eye - DROP;
    // Phones held upright get a wide AI panel (text left, taste map right).
    // Phones held sideways: a shorter one, so it stays clear of the thumb buttons below it.
    const [aw, ah] = kind === 'portrait' ? [1.0, 0.64] : kind === 'land' ? [0.66, 0.8] : [0.66, 0.92];
    if (this.aiPanel.w !== aw || this.aiPanel.h !== ah) {
      const old = this.aiPanel;
      const fresh = new AiPanel(aw, ah);
      fresh.show(old.view);
      fresh.add(this.aiBtn);
      this.ui.add(fresh);
      old.removeFromParent();
      old.dispose();
      this.aiPanel = fresh;
    }
    const ai = this.aiPanel;
    const ctl = [this.blend, this.gauge, this.basketInfo];
    if (kind === 'portrait') {
      ai.rotation.set(0, 0, 0);
      ai.scale.setScalar(1.2);
      ai.userData.base = 1.2;
      ai.position.set(-0.02, top - 0.34 - (ai.h * 1.2) / 2, -0.66);
      ctl.forEach((c) => { c.rotation.set(-0.15, 0, 0); c.position.set(0.05, top + 0.27, -0.66); });
      this.fit.position.set(-0.02, top + 0.1, -0.96);
      this.fit.scale.set(1.46, 0.8, 0.68);
    } else {
      ai.scale.setScalar(1);
      ai.userData.base = 1;
      if (kind === 'xr') placeOnArc(ai, -1.05, eye - 0.02, 1.05);
      // phones held sideways: higher, clear of the thumb buttons in the lower corners
      else if (kind === 'land') placeOnArc(ai, -0.86, eye + 0.2, 1.16);
      else placeOnArc(ai, -1.0, eye - 0.02, 1.12);
      if (kind !== 'xr') ai.rotation.y *= 0.6;
      ctl.forEach((c) => {
        c.position.set(0.5, top + 0.33, -0.8);
        c.rotation.set(-0.22, kind === 'xr' ? -0.42 : -0.15, 0, 'YXZ');
      });
      this.fit.position.set(0.25, top + 0.17, -0.97);
      this.fit.scale.set(2.2, 0.95, 0.7);
    }
    // the basket's panel sits higher, above the basket's handle
    this.basketInfo.position.y += kind === 'portrait' ? 0.1 : 0.17;
    // the share buttons under the blend bar, "roast" beside it
    const by = -this.blend.h / 2 - 0.012 - this.moreA.h / 2;
    this.moreA.position.set(-this.moreA.w / 2 - 0.008, by, 0.002);
    this.moreB.position.set(this.moreB.w / 2 + 0.008, by, 0.002);
    this.roastBtn.position.set(this.blend.w / 2 + 0.02 + this.roastBtn.w / 2, -0.03, 0.002);
    this.stopBtn.position.set(0, -this.gauge.h / 2 - 0.014 - this.stopBtn.h / 2, 0.002);
    this.aiBtn.position.set(0, -ai.h / 2 - 0.012 - this.aiBtn.h / 2, 0.002);
    this.placeBubble();
  }

  /**
   * Browser preview while playing: the camera looks down on the counter a little (like standing
   * behind it) and frames the shop area and every visible panel, between the phone's status bar
   * and its buttons. Returns false (the engine's own fit) for the intro and the results.
   */
  gameCamera(cam, dt, ins = { top: 0, bottom: 0 }) {
    if (this.engine.isXR || !this.ui.visible || this.mode === 'over' || this.mode === 'intro') return false;
    const kind = this.layoutKind;
    const tilt = kind === 'portrait' ? 0.2 : 0.3;
    const up = new THREE.Vector3(0, Math.cos(tilt), -Math.sin(tilt));
    const fwd = new THREE.Vector3(0, -Math.sin(tilt), -Math.cos(tilt));
    const pts = [];
    const box = new THREE.Box3();
    const visit = (o) => {
      if (!o.visible || o.userData.noFit) return;
      if (o.isMesh && o.geometry) {
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
        for (let i = 0; i < 8; i++) pts.push(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
      }
      o.children.forEach(visit);
    };
    this.group.updateMatrixWorld(true);
    visit(this.fit);
    visit(this.ui);
    this.group.children.forEach((o) => { if (o.userData.hud) visit(o); });
    if (!pts.length) return false;
    let a0 = Infinity; let a1 = -Infinity; let b0 = Infinity; let b1 = -Infinity;
    for (const p of pts) {
      a0 = Math.min(a0, p.x); a1 = Math.max(a1, p.x);
      const b = p.dot(up);
      b0 = Math.min(b0, b); b1 = Math.max(b1, b);
    }
    const H = window.innerHeight;
    const free = Math.max(0.35, 1 - (ins.top + ins.bottom) / H);
    const center = (ins.bottom - ins.top) / H;
    const tv = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const th = tv * cam.aspect;
    const margin = this.engine.touchUI ? 1.03 : 1.08;
    // the point the camera aims at: the middle of the content (across and up the view)
    const T = new THREE.Vector3((a0 + a1) / 2, 0, 0);
    const mid = pts.reduce((s, p) => s + p.dot(fwd), 0) / pts.length;
    T.addScaledVector(up, (b0 + b1) / 2).addScaledVector(fwd, mid - T.dot(fwd));
    let need = 0.3;
    for (const p of pts) {
      const q = p.clone().sub(T);
      const f = q.dot(fwd);
      need = Math.max(need, (margin * Math.abs(q.x)) / th - f, (margin * Math.abs(q.dot(up))) / (tv * free) - f);
    }
    const want = T.clone().addScaledVector(fwd, -need).addScaledVector(up, -center * need * tv);
    const k = this.camReady ? Math.min(1, dt * 4) : 1;
    this.camReady = true;
    cam.position.lerp(want, k);
    cam.rotation.set(-tilt, 0, 0);
    return true;
  }

  // ---------- frame loop ----------

  /** Phones held upright: while roasting, the view moves over to the roaster and the gauge. */
  portraitFocus() {
    if (this.layoutKind !== 'portrait' || !this.aiPanel) return;
    const roasting = this.mode === 'pour' || this.mode === 'roast';
    if (roasting === this.focusRoaster) return;
    this.focusRoaster = roasting;
    const top = this.eye - DROP;
    this.aiPanel.visible = !roasting;
    if (roasting) {
      this.fit.position.set(0.62, top + 0.12, -0.98);
      this.fit.scale.set(1.3, 0.75, 0.6);
      this.gauge.position.set(0.55, top + 0.42, -0.72);
    } else {
      this.fit.position.set(-0.02, top + 0.1, -0.96);
      this.fit.scale.set(1.46, 0.8, 0.68);
      this.gauge.position.copy(this.blend.position);
    }
  }

  update(dt) {
    this.time += dt;
    const e = this.engine;
    this.layout();
    this.portraitFocus();
    // desktop browser: our own camera while playing (phones use mobileView)
    if (!e.isXR && !e.touchUI) {
      const own = this.gameCamera(e.camera, dt);
      e.fitEnabled = !own;
      if (!own) this.camReady = false;
    }
    // the floor (the counter's plinth, the roaster's pedestal and the guests stand on it)
    this.floorShop = e.floorY - e.root.position.y - this.group.position.y - this.shop.position.y;
    if (this.plinth) this.plinth.scale.y = Math.max(0.001, -0.9 - this.floorShop);
    if (this.floorShadow) this.floorShadow.position.y = this.floorShop + 0.002;
    if (this.roaster) {
      const base = Math.max(this.floorShop, ROASTER_BASE_MIN);
      this.roaster.group.position.y = base;
      this.pedestal.scale.y = Math.max(0.001, base - this.floorShop);
      this.pedestal.visible = base - this.floorShop > 0.01;
      const lever = this.leverHold ? this.readLever() : 0;
      this.leverKick = Math.max(0, (this.leverKick ?? 0) - dt * 1.5);
      this.roaster.update(dt, this.time, { roasting: this.mode === 'roast', r: this.r ?? 0, lever: Math.max(lever, this.leverKick > 0.5 ? 1 : 0) });
    }
    if (this.tree) {
      this.tree.group.position.y = this.floorShop;
      this.tree.tick(this.time);
    }
    this.string?.userData.tick(this.time);
    if (this.mode === 'roast') this.updateRoast(dt);
    if (this.flight) this.flight.update(dt);
    this.smoke?.update(dt);
    this.steam?.update(dt);
    if (this.steamOn && this.cup) {
      this.steamT = (this.steamT ?? 0) - dt;
      if (this.steamT <= 0) {
        this.steamT = 0.18;
        this.steam.emit(this.shop.worldToLocal(this.cup.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(0, 0.09, 0)));
      }
    }
    this.scale?.userData.tick(dt);
    // chosen jars and treats lift a little and glow at the foot
    this.jars?.forEach((j) => {
      j.userData.lift += ((j.userData.want ?? 0) - j.userData.lift) * Math.min(1, dt * 10);
      j.children[0].position.y = 0.035 * j.userData.lift;
      j.userData.beans.position.y = 0.035 * j.userData.lift;
      j.userData.ring.material.opacity = 0.8 * j.userData.lift;
    });
    if (this.mode === 'basket') {
      this.items?.forEach((g) => {
        g.userData.lift += ((g.userData.want ?? 0) - g.userData.lift) * Math.min(1, dt * 10);
        g.position.y = g.userData.home.y + 0.04 * g.userData.lift + 0.008 * g.userData.lift * Math.sin(this.time * 5);
      });
    }
    // the guest stands on the floor and turns towards you
    const guest = this.guest;
    if (guest) {
      guest.group.position.y = this.floorShop;
      if (guest.turnTo !== undefined) guest.group.rotation.y += (guest.turnTo - guest.group.rotation.y) * Math.min(1, dt * 6);
      guest.update(dt);
    }
    // a cup in the guest's hand stays upright and tips towards the mouth while drinking
    if (guest && this.cup && this.cup.parent === guest.hand) {
      const want = guest.group.getWorldQuaternion(new THREE.Quaternion())
        .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.7 * clamp((guest.drinkK - 0.5) * 2, 0, 1), 0, 0)));
      this.cup.quaternion.copy(guest.hand.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(want));
    }
    // dragging the blend bar (mouse or controller ray)
    if (this.drag && this.mode === 'pick' && this.sel.length === 2) this.dragBlend();
    if (Math.floor(this.time * 4) !== this.hudTick) {
      this.hudTick = Math.floor(this.time * 4);
      if (this.mode !== 'intro' && this.mode !== 'over') this.refreshHud?.();
    }
  }

  dragBlend() {
    const p = this.drag;
    const panel = this.blend;
    panel.updateMatrixWorld();
    const n = new THREE.Vector3(0, 0, 1).transformDirection(panel.matrixWorld);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, panel.getWorldPosition(new THREE.Vector3()));
    const hit = p.ray.intersectPlane(plane, new THREE.Vector3());
    if (!hit) return;
    const x = panel.worldToLocal(hit).x;
    const { x0, x1 } = panel.userData.bar;
    const idx = ratioIndex(clamp((x - x0) / (x1 - x0), 0, 1));
    if (idx !== this.ratioIdx) { this.ratioIdx = idx; sfx.tick(); this.refreshBlend(); }
  }

  dispose() {
    this.mode = 'over';
    this.engine.fitEnabled = true;
    if (!this.engine.isXR) this.engine.camera.rotation.set(0, 0, 0);
    window.removeEventListener('keydown', this.onKey);
    this.audio.stop();
    music.stop();
    this.pads?.remove();
    this.removeGuest();
    this.smoke?.dispose();
    this.steam?.dispose();
    this.engine.renderer.shadowMap.enabled = this.prevShadow;
    this.engine.scene.environment = this.prevEnvironment ?? null;
    this.envTarget?.dispose();
    super.dispose();
  }
}

