// "Röstmeister" (Roast Master): a festive delicatessen counter with a drum roaster, in front of
// you in the room, on the day of the Christmas rush. Two guests come calmly (to learn the
// counter), then the shop fills up: up to three guests wait at once, each with a patience bar,
// and at the end come the last guests before closing. For the guest you serve now (highlighted)
// you pick two of four green coffees (tags show their flavors), set the blend and roast: the
// beans go from green to yellow, cinnamon, medium and dark, and you stop at the right moment
// (first and second crack can be heard). While one batch roasts you already blend the next (it
// waits for the drum), the roasted beans cool in the tray and the cup appears in front of its
// guest; serve it with a tap. Fast service earns a tip, guests who wait too long leave.
// The AI is a recommender: it learns from every rating which cups guests like, recognises
// similar guests from what they say ("guests like you liked ...") and regulars, and from the
// third guest on suggests a blend and a roast with its confidence; "take AI suggestion" blends and
// roasts it with one tap. Its panel shows what it hears, similar guests, the suggestion and a
// taste map of all rated cups. The finale: a gift basket (three of six treats) for a guest the AI
// got to know. Score: taste (stars), roast timing and tips per guest plus the basket (at most 4401).
import * as THREE from 'three';
import { BaseScene } from '../scene.js';
import { Button, textPanel, placeOnArc } from '../ui3d.js';
import { SPONSOR } from '../content.js';
import { color, hex, num } from '../tokens.js';
import { t, L, getLang } from '../i18n.js';
import { sfx } from '../sfx.js';
import { music } from '../music.js';
import { quality } from '../quality.js';
import { CHRISTMAS, makeLightString, makeTree } from '../christmas.js';
import { radialTexture } from '../robot-visuals.js';
import { sceneLook, contactShadow, gfxTier } from '../gfx.js';
import '../roast-text.js';
import {
  GUESTS, BASKET_GUEST, BEANS, RATIOS, ITEMS, CUES, FIRST_CRACK, SECOND_CRACK, Recommender,
  cupFlavor, rate, guestPoints, basketResult, basketFor, mapPos,
} from '../roast-ai.js';
import {
  loadShop, part, shopMaterials, shopDetail, makeJar, Roaster, makeScale, makeCup, makeItem, makeBasket, Puffs, BeanFlight, Guest, makeLights, beanColor,
} from '../roast-visuals.js';
import {
  bubblePanel, jarTag, itemTag, AiPanel, blendPanel, gaugePanel, starSprite, scoreSprite, beanName, stageName, ratioIndex,
} from '../roast-panels.js';
import { RoastAudio } from '../roast-audio.js';

const DROP = num('xr-roast-counter-drop') || 0.6; // counter top below eye height
const ROAST_RATE = 0.17; // roast level per second (about 5.5 s from green to burnt: a lively rush)
const POUR_TIME = 0.45; // beans flying into the hopper
const COOL_TIME = 1.0; // beans cooling in the tray before the cup is brewed
const COUNTER_AT = new THREE.Vector3(0, 0, -1.0); // shop space: y = 0 is the counter top
const JAR_X = [-0.63, -0.42, -0.21, 0.0];
const JAR_Z = -0.86;
const TAG_Z = -0.675;
const SCALE_AT = new THREE.Vector3(0.27, 0, -0.8);
const ROASTER_AT = new THREE.Vector3(1.12, 0, -1.02);
const ROASTER_BASE_MIN = -0.8; // the roaster stands on a pedestal so its drum is about counter height
const SLOT_X = [-0.53, -0.07, 0.4]; // up to three guests wait at the counter
const SLOT_Z = -1.56;
const LANE_Z = -1.95; // guests come and go behind the waiting ones
const CUP_Y = 0.336; // finished cups stand on the display case's lid, in front of their guest
const CUP_Z = -1.16;
const ENTER_X = -1.9;
const EXIT_X = 1.9;
const RUSH_AT = [0, 3, 7, 12]; // seconds into the rush when its guests come (if a place is free)
const PEAK_AT = [0, 2.5, 5]; // the last guests before closing
const PEAK_AFTER = 30; // the closing peak starts after this long (or when the counter is nearly empty)
const ORDERED_DRAIN = 0.6; // patience runs slower once the order is being made
const ITEM_X = [-0.65, -0.46, -0.27, -0.08, 0.11, 0.3];
const BASKET_AT = new THREE.Vector3(0.54, 0, -0.93);
const clamp = THREE.MathUtils.clamp;
const short = (id) => t(`roastShort_${id}`);
const basketWord = () => t(CHRISTMAS ? 'roastBasketXmas' : 'roastBasketPlain');

/** A patience bar (dark track, fill from green over yellow to red); set(frac, time). */
function patienceBar() {
  const g = new THREE.Group();
  g.userData.noFit = true;
  const W = 0.34;
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(W + 0.016, 0.034), new THREE.MeshBasicMaterial({ color: hex('xr-roast-patience-bg'), transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.022).translate(0.5, 0, 0), new THREE.MeshBasicMaterial({ color: hex('xr-success'), toneMapped: false }));
  fill.position.set(-W / 2, 0, 0.002);
  g.add(bg, fill);
  const ok = new THREE.Color(hex('xr-success'));
  const warn = new THREE.Color(hex('xr-warning'));
  const bad = new THREE.Color(hex('xr-danger'));
  g.userData.set = (f, time) => {
    fill.scale.x = Math.max(0.001, W * clamp(f, 0, 1));
    if (f > 0.5) fill.material.color.copy(warn).lerp(ok, (f - 0.5) / 0.5);
    else fill.material.color.copy(bad).lerp(warn, clamp((f - 0.15) / 0.35, 0, 1));
    const pulse = f < 0.25 ? 1 + 0.12 * Math.sin(time * 12) : 1;
    g.scale.set(1, pulse, 1);
  };
  g.userData.dispose = () => { [bg, fill].forEach((m) => { m.geometry.dispose(); m.material.dispose(); }); };
  return g;
}

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
    this.guests = [];
    this.ready = [];
    this.cooling = [];
    this.sel = [];
    this.ratioIdx = 2;

    // The look by graphics tier ('high': desktop and Quest 3, 'medium': phones and Quest 3 lite,
    // 'low': lite elsewhere): neutral tone mapping, image based light from the studio environment
    // (brass, copper, glass and porcelain reflect it), one soft shadow map unless effects are lite.
    this.tier = gfxTier();
    this.shadows = !quality.lite;
    this.onSceneDispose(sceneLook(this.engine, {
      tone: 'neutral', exposure: 0.97, env: 'studio', envIntensity: this.tier === 'low' ? 0.45 : 0.5, shadows: this.shadows ? 'soft' : false,
    }));
    shopDetail(this.tier);

    // The shop: counter top at eye height - DROP; everything in it is in "shop space".
    this.shop = new THREE.Group();
    this.shop.position.set(0, this.eye - DROP, 0);
    this.shop.userData.noFit = true; // the browser camera frames this.fit and the panels instead
    this.group.add(this.shop);
    this.lights = makeLights(this.tier, this.shadows);
    this.shop.add(this.lights);
    // Game panels live here (not in the layer, which the intro and results clear).
    this.ui = new THREE.Group();
    this.ui.visible = false;
    this.group.add(this.ui);
    // Browser: an invisible box that the camera fit frames (the 3D shop itself is left out).
    this.fit = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ visible: false }));
    this.fit.visible = false; // shown while playing (the intro frames its own panel)
    this.group.add(this.fit);

    this.ready$ = loadShop().then((m) => { if (!this.disposed) this.buildShop(m); }).catch((e) => console.warn('roast models not loaded', e));
    this.onKey = (e) => this.key(e);
    window.addEventListener('keydown', this.onKey);
    this.onUpdate((dt) => this.update(dt));
    const hint = t(this.engine.isXR ? 'roastIntroXR' : this.engine.touchUI ? 'roastIntroTouch' : 'roastIntroScreen');
    this.showIntro(t('roastName'), `${t('roastIntro', { basket: basketWord() })} ${hint}`);
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

  /** Phones and tablets in the browser: big screen buttons and the order strip instead of small 3D text. */
  get phone() { return !this.engine.isXR && this.engine.touchUI; }

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
    // small, busy shapes cast no shadow (a cheaper shadow pass, no speckles on the counter)
    garland?.traverse((o) => { o.castShadow = false; });
    if (CHRISTMAS) {
      this.string = makeLightString({ x0: -0.68, x1: 0.48, y: 0.335, z: -0.035, sag: 0.03, swags: 4, bulbs: 30 });
      this.counter.add(this.string);
      this.tree = makeTree();
      this.tree.group.scale.setScalar(0.72);
      this.tree.group.position.set(-1.22, 0, -1.78);
      this.tree.group.traverse((o) => { o.castShadow = false; });
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
    // soft contact shadows on the (real) floor: under the counter, the roaster and the tree
    this.contacts = [];
    const blob = (x, z, sx, sz, op) => {
      const m = contactShadow(0.5, op);
      m.scale.set(sx, sz, 1);
      m.position.set(x, -1, z);
      s.add(m);
      this.contacts.push(m);
      return m;
    };
    blob(COUNTER_AT.x - 0.1, COUNTER_AT.z - 0.05, 3.0, 1.5, 0.5);
    blob(ROASTER_AT.x, ROASTER_AT.z, 1.3, 1.3, 0.5);
    if (this.tree) blob(-1.22, -1.78, 1.0, 1.0, 0.4);
    // a warm haze behind the counter (shop light in the dark): in the browser, and in VR on Quest 3
    // with full effects; never in AR (the real room stays visible)
    {
      this.haze = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 2.8), new THREE.MeshBasicMaterial({ map: radialTexture(), color: hex('xr-roast-light'), transparent: true, opacity: 0.2, depthWrite: false, toneMapped: false }));
      this.haze.position.set(0.1, 0.35, -2.9);
      this.haze.userData.noFit = true;
      this.haze.renderOrder = -2;
      s.add(this.haze);
    }
    this.smoke = new Puffs(s, { count: 22, token: 'xr-roast-smoke', size: 0.16, rise: 0.3, life: 2.6 });
    this.steam = new Puffs(s, { count: 18, token: 'xr-roast-steam', size: 0.05, rise: 0.12, life: 1.4 });
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
    // a warm light behind the guest you serve now
    this.spot = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), color: hex('xr-roast-active'), transparent: true, opacity: 0.3, depthWrite: false }));
    this.spot.scale.set(0.95, 1.25, 1);
    this.spot.visible = false;
    this.spot.userData.noFit = true;
    s.add(this.spot);
    this.popShop();
  }

  /** The shop appears with a little pop (the models arrive after the intro panel). */
  popShop() {
    const s = this.shop;
    s.scale.setScalar(0.001);
    this.tween(0.6, (k) => s.scale.setScalar(Math.max(0.001, k)));
  }

  // ---------- flow: waves of guests ----------

  async start() {
    this.clearLayer();
    this.mode = 'loading';
    await this.ready$;
    if (this.disposed || !this.M) return;
    this.refreshHud ??= this.hud(() => this.hudText());
    this.startMusic(0, 'roast');
    Object.assign(this, { score: 0, next: 0, stats: [], basketStars: 0, sel: [], ratioIdx: 2, active: null, drumBatch: null, nextBatch: null, r: 0, spawnCool: 0, hints: 0 });
    this.ui.visible = true;
    this.fit.visible = !this.engine.isXR;
    this.buildUi();
    this.buildStrip();
    this.mode = 'play';
    this.startWave('calm');
  }

  startWave(w) {
    this.wave = w;
    this.waveT = 0;
    const key = { calm: 'roastWaveCalm', rush: 'roastWaveRush', peak: 'roastWavePeak', basket: 'roastWaveBasket' }[w];
    this.banner(t(key, { basket: basketWord() }));
    if (w === 'rush' || w === 'peak') { sfx.announce(); music.intensity = w === 'peak' ? 2 : 1; } else sfx.appear();
    if (w === 'basket') this.delay(1.4, () => { if (!this.disposed) this.startBasket(); });
    this.refreshHud?.();
  }

  /** Who comes next: one at a time while it is calm, then whenever a place at the counter is free. */
  waves(dt) {
    this.waveT += dt;
    this.spawnCool = Math.max(0, this.spawnCool - dt);
    const free = this.freeSlot();
    if (this.wave === 'calm') {
      if (this.guests.length === 0 && this.spawnCool <= 0) {
        if (this.next < 2) this.spawnGuest(this.next);
        else this.startWave('rush');
      }
    } else if (this.wave === 'rush') {
      const k = this.next - 2;
      if (k < RUSH_AT.length && this.waveT >= RUSH_AT[k] && free >= 0 && this.spawnCool <= 0) this.spawnGuest(this.next);
      const present = this.guests.filter((g) => g.state !== 'leave').length;
      if (this.next >= 6 && (this.waveT >= PEAK_AFTER || present <= 1)) this.startWave('peak');
    } else if (this.wave === 'peak') {
      const k = this.next - 6;
      if (k < PEAK_AT.length && this.waveT >= PEAK_AT[k] && free >= 0 && this.spawnCool <= 0) this.spawnGuest(this.next);
      if (this.next >= GUESTS.length && this.guests.length === 0 && !this.drumBatch && !this.nextBatch && !this.ready.length && !this.cooling.length) this.startWave('basket');
    }
  }

  /** A free place at the counter (the middle one first), or -1. */
  freeSlot() {
    for (const i of [1, 0, 2]) if (!this.guests.some((g) => g.slot === i && g.state !== 'leave')) return i;
    return -1;
  }

  /** A guest walks in behind the others and steps up to a free place at the counter. */
  spawnGuest(i) {
    const def = GUESTS[i];
    const slot = this.wave === 'calm' ? 1 : this.freeSlot();
    if (slot < 0) return;
    this.next = i + 1;
    this.spawnCool = 0.8;
    const vis = new Guest(this.G, def.model, def.look);
    this.groundGuest(vis);
    vis.group.position.set(ENTER_X, this.floorShop ?? -1, LANE_Z);
    vis.group.rotation.y = Math.PI / 2;
    this.shop.add(vis.group);
    // tap the guest to prepare their order
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.36), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 1.3;
    const g = { def, i, vis, slot, state: 'enter', patience: def.patience, patienceMax: def.patience, batch: null, bubble: null, bar: patienceBar(), hit };
    hit.userData.interactive = true;
    hit.userData.label = t(`roastGuest_${def.id}`);
    hit.userData.onClick = () => this.selectGuest(g, true);
    vis.group.add(hit);
    g.bar.visible = false;
    this.ui.add(g.bar);
    this.guests.push(g);
    vis.walking = 1;
    const x0 = ENTER_X;
    const x1 = SLOT_X[slot];
    this.tween(1.5, (k) => {
      const a = clamp(k / 0.78, 0, 1);
      const b = clamp((k - 0.78) / 0.22, 0, 1);
      vis.group.position.x = x0 + (x1 - x0) * a;
      vis.group.position.z = LANE_Z + (SLOT_Z - LANE_Z) * b;
      if (b > 0) vis.turnTo = Math.atan2(-x1, -SLOT_Z);
    }, {
      ease: (k) => k,
      onDone: () => {
        if (this.disposed || g.state !== 'enter') return;
        vis.walking = 0;
        g.state = 'wait';
        let ask = t(`roastAsk_${def.key}`);
        if (def.returning) {
          const last = [...this.ai.log].reverse().find((e) => e.id === def.id);
          ask = t(`roastAsk_${def.key}_${last && last.stars >= 4 ? 'good' : 'bad'}`);
        }
        g.ask = ask;
        g.bar.visible = true;
        vis.talking = true;
        this.delay(1.6, () => { vis.talking = false; });
        sfx.tink();
        this.setBubble(g, { body: ask });
        this.ensureActive();
        this.refreshHud?.();
      },
    });
  }

  // ---------- guests: bubbles, the active guest, patience ----------

  /** The guest's bubble: the request (or a reaction), a status line, stars. */
  setBubble(g, data) {
    g.bubbleData = data;
    g.bubbleActive = g === this.active;
    g.bubble?.removeFromParent();
    g.bubble?.dispose();
    // phones: a compact bubble (the name, stars after the cup); the request and the order's state are in the order strip
    const b = this.phone
      ? bubblePanel({ name: short(g.def.id), body: data.keep ? data.body : null, stars: data.stars ?? 0, w: data.keep || data.stars ? 0.26 : 0.2, active: g.bubbleActive, tail: 'center', bodySize: 'xr-text-sm' })
      : bubblePanel({ name: t(`roastGuest_${g.def.id}`), body: data.body, sub: data.sub ?? null, stars: data.stars ?? 0, w: 0.44, active: g.bubbleActive, tail: 'center', bodySize: 'xr-text-sm' });
    b.userData.interactive = true;
    b.userData.label = t(`roastGuest_${g.def.id}`);
    b.userData.onClick = () => this.selectGuest(g, true);
    this.ui.add(b);
    g.bubble = b;
    this.placeBubble(g);
  }

  /** Status of an order in the guest's bubble. */
  orderStatus(g) {
    const b = g.batch;
    if (!b) return null;
    return t(b.state === 'ready' ? 'roastStatusReady' : b.state === 'queued' ? 'roastStatusQueued' : 'roastStatusRoasting');
  }

  placeBubble(g) {
    const b = g.bubble;
    if (!b) return;
    const portrait = this.layoutKind === 'portrait';
    const active = g === this.active;
    const s = this.phone ? (active ? 2.2 : 1.95) : active ? (portrait ? 1.14 : 1.06) : portrait ? 0.84 : 0.92;
    b.scale.setScalar(s);
    const x = SLOT_X[g.slot];
    const y = this.eye + 0.05 + (b.h * s) / 2; // clear of tall hats, also when a head hangs
    b.position.set(x, y, SLOT_Z + (active ? 0.32 : 0.28));
    b.rotation.set(0, this.engine.isXR ? Math.atan2(-x, -b.position.z) : 0, 0);
    g.bar.position.set(x, y + (b.h * s) / 2 + 0.03, b.position.z + 0.01);
    g.bar.rotation.copy(b.rotation);
  }

  /** Redraws the bubbles whose highlight changed (the active guest has a warm border). */
  refreshBubbles() {
    for (const g of this.guests) {
      if (g.state !== 'wait' || !g.bubbleData) continue;
      if ((g === this.active) !== g.bubbleActive) this.setBubble(g, g.bubbleData);
    }
  }

  /** Choose the guest to prepare for (a tap on the guest, their bubble or Tab). */
  selectGuest(g, manual = false) {
    if (this.mode !== 'play' || g.state !== 'wait' || g.batch) { if (manual) sfx.tick(); return; }
    if (this.active === g) return;
    this.active = g;
    if (manual) sfx.click();
    this.activeChanged();
  }

  /** Keeps a guest active: the waiting one (without an order) with the least patience left. */
  ensureActive(force = false) {
    const ok = (g) => g && g.state === 'wait' && !g.batch;
    if (ok(this.active) && !force) return;
    const cand = this.guests.filter(ok).sort((a, b) => a.patience / a.patienceMax - b.patience / b.patienceMax);
    const next = ok(this.active) ? this.active : cand[0] ?? null;
    if (next === this.active && !force) return;
    this.active = next;
    this.activeChanged();
  }

  activeChanged() {
    this.refreshBubbles();
    this.showAI(this.active);
    this.refreshBlend();
    this.refreshHud?.();
  }

  nextGuestKey() {
    const cand = this.guests.filter((g) => g.state === 'wait' && !g.batch);
    if (!cand.length) return;
    const i = cand.indexOf(this.active);
    this.selectGuest(cand[(i + 1) % cand.length], true);
  }

  /** Waited too long: a sad shake of the head, then the guest leaves (their order is lost). */
  timeout(g) {
    g.state = 'upset';
    g.bar.visible = false;
    const b = g.batch;
    if (b) {
      b.orphan = true;
      if (this.nextBatch === b) this.nextBatch = null;
      if (this.drumBatch === b) this.abortDrum();
      if (b.state === 'ready') this.dropCup(b);
    }
    this.stats.push({ key: g.def.key, left: true, stars: 0, usedAI: false });
    g.vis.react('sad');
    g.vis.slump = true;
    sfx.wrong();
    this.setBubble(g, { body: t('roastTooLong'), keep: true });
    if (this.active === g) { this.active = null; this.ensureActive(true); }
    // a little grey cloud over the head
    this.burst(g.vis.main.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.22, 0)), 'xr-roast-smoke-dark', 14);
    this.delay(1.4, () => { if (!this.disposed) this.leave(g); });
    this.refreshHud?.();
  }

  /** The guest steps back and walks out to the right. */
  leave(g) {
    g.state = 'leave';
    g.bar.visible = false;
    g.bubble?.removeFromParent();
    g.bubble?.dispose();
    g.bubble = null;
    if (this.active === g) { this.active = null; this.ensureActive(true); }
    const vis = g.vis;
    vis.walking = vis.slump ? 0.6 : 1;
    vis.talking = false;
    const x0 = vis.group.position.x;
    const z0 = vis.group.position.z;
    this.tween(vis.slump ? 2.6 : 1.9, (k) => {
      const a = clamp(k / 0.2, 0, 1);
      const b = clamp((k - 0.2) / 0.8, 0, 1);
      vis.group.position.z = z0 + (LANE_Z - z0) * a;
      vis.group.position.x = x0 + (EXIT_X - x0) * b;
      if (a >= 1) vis.turnTo = Math.PI / 2;
    }, { ease: (k) => k, onDone: () => this.removeGuest(g) });
  }

  /** A soft contact shadow at the guest's feet (walks with them). */
  groundGuest(vis) {
    const m = contactShadow(0.24, 0.5);
    m.position.y = 0.004;
    vis.group.add(m);
    vis.blob = m;
  }

  removeGuest(g) {
    const i = this.guests.indexOf(g);
    if (i >= 0) this.guests.splice(i, 1);
    g.vis.group.removeFromParent();
    g.vis.dispose();
    g.vis.blob?.geometry.dispose();
    g.vis.blob?.material.dispose();
    g.hit.geometry.dispose();
    g.bar.removeFromParent();
    g.bar.userData.dispose();
    g.bubble?.removeFromParent();
    g.bubble?.dispose();
    if (g.cup) this.disposeCup(g.cup);
  }

  // ---------- the AI panel ----------

  /** What the AI makes of the active guest, shown on its panel. */
  showAI(g) {
    if (!this.aiPanel) return;
    if (!g) {
      this.sug = null;
      this.aiPanel.show({ count: this.ai.count, cues: [], status: t('roastNobody'), kind: 'wait', lines: [], title2: null, conf: null, aim: null, dots: this.dots(), learned: null });
      this.refreshControls();
      return;
    }
    const s = (this.sug = this.ai.suggest(g.def));
    const cues = CUES.filter((k) => g.def.cues[k]).sort((a, b) => g.def.cues[b] - g.def.cues[a]).map((k) => t(`roastCue_${k}`));
    const view = { count: this.ai.count, cues, cueLabel: 'roastAiHears', lines: [], title2: null, conf: null, aim: null, dots: this.dots(), learned: null };
    if (s.recipe) {
      const liked = s.neighbors.find((n) => n.stars >= 3 && n.id !== g.def.id) ?? s.neighbors.find((n) => n.stars >= 3) ?? s.neighbors[0];
      view.kind = s.regular ? 'regular' : 'suggest';
      view.status = s.regular ? t('roastAiRegular', { n: s.regular.stars }) : t('roastAiSimilar', { list: s.neighbors.slice(0, 2).map((n) => `${short(n.id)} ${Math.round(n.sim * 100)} %`).join(', ') });
      // a regular who liked their last cup: that cup; else what similar guests liked
      view.title2 = s.regular && s.regular.stars >= 3 ? t('roastAiRegularLiked', { name: short(g.def.id) }) : t('roastAiLiked', { name: short(liked.id) });
      view.lines = [this.recipeText(s.recipe), t('roastRecipeRoast', { stage: stageName(s.roast) })];
      view.conf = s.conf;
      view.aim = { ...mapPos(s.profile, s.roast), conf: s.conf };
    } else if (s.avoid) {
      view.kind = 'avoid';
      view.status = t('roastAiAvoid', { name: short(s.avoid.id), recipe: this.recipeText(s.avoid.recipe) });
    } else {
      view.kind = 'cold';
      view.status = this.ai.count ? t('roastAiColdNew') : t('roastAiCold');
    }
    this.aiPanel.show(view);
    this.pulse(this.aiPanel);
    this.refreshControls();
  }

  /** The rated cups as dots on the taste map. */
  dots() {
    return this.ai.log.map((e, i) => ({ ...mapPos(e.cup, e.roast), stars: e.stars, label: short(e.id).slice(0, 1), big: i === this.ai.log.length - 1 }));
  }

  recipeText(rc) {
    return t('roastRecipe', { a: beanName(rc.a), pa: Math.round(rc.ratio * 100), b: beanName(rc.b), pb: Math.round((1 - rc.ratio) * 100) });
  }

  // ---------- station 1: blending ----------

  toggleJar(i) {
    if (this.mode === 'basket') { this.toggleItem(i); return; }
    if (this.mode !== 'play') return;
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
    if (this.mode !== 'play' || this.sel.length < 2) return;
    const n = clamp(this.ratioIdx + d, 0, RATIOS.length - 1);
    if (n !== this.ratioIdx) { this.ratioIdx = n; sfx.tick(); this.refreshBlend(); }
  }

  /** Jars lift when chosen; tags, blend bar, scale and buttons follow the choice. */
  refreshBlend() {
    if (!this.blend) return;
    this.jars?.forEach((j, i) => {
      const k = this.sel.indexOf(i);
      j.userData.want = k >= 0 ? 1 : 0;
      this.tags[i].set({ selected: k >= 0, order: k + 1 });
    });
    const [a = null, b = null] = this.sel;
    const share = RATIOS[this.ratioIdx];
    this.blend.set({ a, b, share, who: this.active ? short(this.active.def.id) : null });
    this.scale?.userData.set(share, this.sel.length === 2);
    const two = this.sel.length === 2;
    this.setLabel(this.moreA, two ? t('roastMore', { name: beanName(a) }) : '+');
    this.setLabel(this.moreB, two ? t('roastMore', { name: beanName(b) }) : '+');
    this.moreA.set({ disabled: !two || this.ratioIdx >= RATIOS.length - 1 });
    this.moreB.set({ disabled: !two || this.ratioIdx <= 0 });
    this.refreshControls();
    this.refreshHud?.();
  }

  setLabel(btn, label, size = btn.opts.labelSize) {
    if (btn.opts.label === label && btn.opts.labelSize === size) return;
    btn.opts.label = label;
    btn.opts.labelSize = size;
    btn.redraw();
  }

  /** Buttons that depend on the stations: roast or queue, the AI's one tap, stop. */
  refreshControls() {
    if (!this.roastBtn) return;
    const busy = !!this.drumBatch;
    const full = busy && !!this.nextBatch;
    this.setLabel(this.roastBtn, t(busy ? 'roastQueue' : 'roastRoast'), busy ? 'xr-text-sm' : 'xr-text-md');
    this.roastBtn.set({ disabled: !this.active || this.sel.length < 2 || full });
    const canAI = this.mode === 'play' && !!this.active && !!this.sug?.recipe && !full;
    this.aiBtn.visible = !this.engine.touchUI && (this.mode === 'basket' ? !!this.sugAvailable() : canAI);
    this.stopBtn.set({ disabled: this.drumBatch?.state !== 'roasting' });
    this.updatePads();
    this.refreshStrip();
  }

  sugAvailable() {
    if (this.mode === 'basket') return this.bsug?.profile && this.bsug.pick.length;
    return this.mode === 'play' && this.active && this.sug?.recipe;
  }

  /** One tap: the AI's beans, share and roast mark, straight into the drum (or the queue). */
  useAI() {
    if (this.mode === 'basket') {
      if (!this.sugAvailable()) return;
      this.picks = this.bsug.pick.map((k) => ITEMS.findIndex((it) => it.key === k));
      this.refreshItems();
      sfx.powerup();
      return;
    }
    if (!this.sugAvailable()) { sfx.tick(); return; }
    const rc = this.sug.recipe;
    this.sel = [rc.a, rc.b];
    this.ratioIdx = ratioIndex(rc.ratio);
    sfx.powerup();
    this.commit(true);
  }

  /** Puts the blend for the active guest into the drum, or in line for it while it is busy. */
  commit(usedAI = false) {
    if (this.mode !== 'play') return;
    const g = this.active;
    if (!g || this.sel.length < 2) { this.toast(t('roastNeedTwo'), 'xr-warning'); sfx.wrong(); return; }
    if (this.drumBatch && this.nextBatch) { this.toast(t('roastBusy'), 'xr-warning'); sfx.wrong(); return; }
    const batch = {
      g, a: this.sel[0], b: this.sel[1], ratio: RATIOS[this.ratioIdx], usedAI,
      conf: usedAI ? this.sug?.conf ?? 0 : null, aiStop: this.sug?.recipe ? this.sug.roast : null, state: 'queued',
    };
    g.batch = batch;
    this.sel = [];
    this.ratioIdx = 2;
    if (!this.drumBatch) this.startBatch(batch);
    else { this.nextBatch = batch; sfx.build(); }
    this.setBubble(g, { body: g.ask, sub: this.orderStatus(g) });
    this.active = null;
    this.ensureActive(true);
    this.refreshBlend();
    this.updateGauge();
  }

  // ---------- station 2: the drum ----------

  startBatch(batch) {
    this.drumBatch = batch;
    batch.state = 'pour';
    const froms = [batch.a, batch.b].map((i) => this.jars[i].position.clone().add(new THREE.Vector3(0, 0.24, 0)));
    const to = this.shop.worldToLocal(this.roaster.hopper.getWorldPosition(new THREE.Vector3()));
    this.flight.start(froms, to);
    this.audio.pour(0.6, 0.08);
    sfx.whoosh();
    if (batch.g.state === 'wait') this.setBubble(batch.g, { body: batch.g.ask, sub: t('roastStatusRoasting') });
    this.delay(POUR_TIME, () => {
      if (this.disposed || this.drumBatch !== batch) return;
      batch.state = 'roasting';
      if (this.flashes) delete this.flashes.drum; // a crack of the batch before
      this.r = 0;
      this.cracked = 0;
      this.roaster.showDrum(true);
      this.audio.rumble(true);
      this.updateGauge();
      if (this.hints < 2) {
        this.hints += 1;
        this.toast(t(this.engine.isXR ? 'roastStopHintXR' : this.engine.touchUI ? 'roastStopHintTouch' : 'roastStopHintScreen'), 'xr-roast-flame');
      }
      this.refreshControls();
    });
    this.refreshControls();
  }

  /** The gauge shows who the drum roasts for and who is next. */
  updateGauge(done = false) {
    if (!this.gauge) return;
    const b = this.drumBatch;
    const roasting = b?.state === 'roasting' || b?.state === 'pour';
    this.gauge.set({
      r: roasting ? Math.round((this.r ?? 0) * 300) / 300 : done ? this.lastR ?? 0 : 0,
      aiStop: roasting ? b.aiStop : null,
      done: !roasting && done,
      idle: !roasting && !done,
      who: roasting ? short(b.g.def.id) : null,
      next: this.nextBatch ? short(this.nextBatch.g.def.id) : null,
    });
  }

  grabLever(p) {
    if (this.drumBatch?.state !== 'roasting') return;
    if (p.kind === 'xr' && p.controller) {
      this.leverHold = { p, from: new THREE.Vector3().setFromMatrixPosition(p.controller.matrixWorld) };
      this.engine.haptic(p, 0.4, 30);
    } else this.stopRoast();
  }

  releaseLever() {
    if (this.leverHold && this.drumBatch?.state === 'roasting') this.stopRoast();
    this.leverHold = null;
  }

  /** Real hand movement: pulling the grabbed lever down (or towards you) stops the roast. */
  readLever() {
    const h = this.leverHold;
    if (!h) return 0;
    const now = new THREE.Vector3().setFromMatrixPosition(h.p.controller.matrixWorld);
    const d = h.from.clone().sub(now);
    const pull = clamp(Math.max(d.y, 0) / 0.1 + Math.max(-d.z, 0) / 0.25, 0, 1);
    if (pull >= 1 && this.drumBatch?.state === 'roasting') {
      this.engine.haptic(h.p, 0.8, 60);
      this.leverHold = null;
      this.stopRoast();
    }
    return pull;
  }

  updateRoast(dt) {
    this.r = Math.min(1, this.r + dt * ROAST_RATE * (this.r > FIRST_CRACK ? 1.08 : 1));
    this.gauge.set({ r: Math.round(this.r * 300) / 300 });
    if (this.cracked < 1 && this.r >= FIRST_CRACK) {
      this.cracked = 1;
      this.audio.firstCrack();
      this.hapticAll(0.5, 80);
      this.toast(t('roastCrack1'), 'xr-roast-bean-cinnamon');
    } else if (this.cracked < 2 && this.r >= SECOND_CRACK) {
      this.cracked = 2;
      this.audio.secondCrack();
      this.hapticAll(0.3, 60);
      this.toast(t('roastCrack2'), 'xr-roast-bean-cinnamon');
    }
    // smoke from the chimney, thicker and darker the darker the roast
    this.smokeT = (this.smokeT ?? 0) - dt;
    if (this.smokeT <= 0 && this.r > 0.28) {
      this.smokeT = 0.42 - 0.3 * this.r;
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

  /** Stop: the beans fall into the cooling tray; the next blend in line goes into the drum. */
  stopRoast() {
    const batch = this.drumBatch;
    if (!batch || batch.state !== 'roasting') return;
    batch.state = 'cooling';
    batch.r = this.r;
    this.lastR = this.r;
    this.drumBatch = null;
    this.leverHold = null;
    this.leverKick = 1;
    this.audio.rumble(false);
    this.audio.pour(0.5, 0.06);
    sfx.thud();
    this.roaster.showDrum(false);
    this.roaster.fillTray(batch.r);
    batch.coolT = COOL_TIME;
    this.cooling.push(batch);
    this.updateGauge(true);
    this.feedNext();
    this.refreshControls();
  }

  /** The blend waiting in line goes into the drum after a short moment (the drum is reserved for it). */
  feedNext() {
    const nb = this.nextBatch;
    if (!nb) return;
    this.nextBatch = null;
    this.drumBatch = nb;
    this.delay(0.5, () => {
      if (this.disposed || this.drumBatch !== nb) return;
      if (nb.orphan || this.mode !== 'play') { this.drumBatch = null; this.updateGauge(); this.refreshControls(); return; }
      this.startBatch(nb);
    });
  }

  /** The guest of the batch in the drum has left: the drum is emptied for the next blend. */
  abortDrum() {
    this.drumBatch = null;
    this.leverHold = null;
    this.audio.rumble(false);
    this.roaster.showDrum(false);
    this.updateGauge();
    this.feedNext();
    this.refreshControls();
  }

  // ---------- station 3: cooling, brewing, serving ----------

  /** The beans have cooled: the cup is brewed and stands in front of its guest. */
  coolDone(batch) {
    const g = batch.g;
    if (batch.orphan || g.state !== 'wait') {
      this.toast(t('roastTooLate', { name: short(g.def.id) }), 'xr-warning');
      return;
    }
    const cup = makeCup(this.M);
    cup.position.set(SLOT_X[g.slot], CUP_Y, CUP_Z);
    cup.rotation.y = 0.5;
    this.shop.add(cup);
    this.popScale(cup);
    this.tween(0.6, (k) => cup.userData.fill(k));
    // a warm ring under the cup and a generous hit sphere: tap it to serve
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.085, 0.105, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: hex('xr-roast-active'), transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false }));
    ring.position.y = 0.004;
    cup.add(ring);
    const hit = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.y = 0.05;
    hit.userData.interactive = true;
    hit.userData.label = t('roastServeTo', { name: short(g.def.id) });
    hit.userData.onClick = () => this.serve(batch);
    cup.add(hit);
    cup.userData.ring = ring;
    batch.cup = cup;
    batch.state = 'ready';
    this.ready.push(batch);
    sfx.appear();
    this.setBubble(g, { body: g.ask, sub: this.orderStatus(g) });
    this.refreshControls();
    this.refreshHud?.();
  }

  dropCup(batch) {
    const i = this.ready.indexOf(batch);
    if (i >= 0) this.ready.splice(i, 1);
    if (batch.cup) {
      this.burst(batch.cup.getWorldPosition(new THREE.Vector3()), 'xr-roast-smoke', 10);
      this.disposeCup(batch.cup);
      batch.cup = null;
    }
  }

  disposeCup(cup) {
    cup.removeFromParent();
    cup.traverse((o) => {
      if (!o.isMesh) return;
      if (o.userData.own || o.geometry.type === 'RingGeometry' || o.geometry.type === 'SphereGeometry') { o.geometry.dispose(); o.material.dispose(); }
    });
  }

  serveNext() {
    if (this.ready.length) this.serve(this.ready[0]);
  }

  /** The cup goes to its guest, who drinks, rates it and leaves; the AI learns from the rating. */
  serve(batch) {
    if (this.mode !== 'play' || batch.state !== 'ready') return;
    const g = batch.g;
    const i = this.ready.indexOf(batch);
    if (i >= 0) this.ready.splice(i, 1);
    batch.state = 'served';
    g.state = 'drink';
    g.bar.visible = false;
    const { a, b, ratio, r } = batch;
    const cupF = cupFlavor(a, b, ratio, r);
    const res = rate(g.def, cupF, r);
    const left = g.patience / g.patienceMax;
    const pts = guestPoints(g.def, res.stars, r, left);
    this.score += pts.total;
    this.stats.push({ key: g.def.key, left: false, stars: res.stars, usedAI: batch.usedAI, conf: batch.conf, tip: pts.tip });
    if (this.active === g) { this.active = null; this.ensureActive(true); }
    sfx.grab();
    const cup = batch.cup;
    cup.userData.ring.visible = false;
    const vis = g.vis;
    const from = cup.position.clone();
    this.tween(0.45, (k) => {
      const to = this.shop.worldToLocal(vis.hand.getWorldPosition(new THREE.Vector3()));
      cup.position.lerpVectors(from, to, k);
      cup.position.y += Math.sin(k * Math.PI) * 0.12;
    }, {
      onDone: () => {
        if (this.disposed || !cup.parent) return;
        vis.hand.attach(cup);
        cup.position.set(0, -0.02, 0.03);
        g.cup = cup;
        batch.cup = null;
      },
    });
    this.tween(0.45, (k) => { vis.drinkK = k * 0.5; });
    this.delay(0.5, () => { if (!this.disposed) this.tween(0.6, (k) => { vis.drinkK = 0.5 + 0.5 * k; }); });
    this.delay(1.3, () => {
      if (this.disposed) return;
      this.tween(0.4, (k) => { vis.drinkK = 1 - 0.75 * k; });
      vis.react(res.stars >= 4 ? 'happy' : res.stars <= 2 ? 'sad' : 'neutral');
      (res.stars >= 4 ? sfx.correct : res.stars <= 2 ? sfx.wrong : sfx.point)();
      const hint = res.hint && res.stars < 5 ? t(`roastHint_${res.hint}`) : null;
      this.setBubble(g, { body: t(`roastReact${res.stars}`), sub: hint, stars: res.stars });
      const head = vis.main.head.getWorldPosition(new THREE.Vector3());
      this.floatText(t('roastPoints', { n: pts.total }), head.clone().add(new THREE.Vector3(0, 0.12, 0.35)), 'xr-roast-star');
      if (pts.tip) this.delay(0.35, () => { if (!this.disposed) this.floatText(t('roastTip', { n: pts.tip }), head.clone().add(new THREE.Vector3(0, 0.02, 0.38)), 'xr-success', 0.26); });
      // the AI learns from this rating
      this.ai.record(g.def, { a, b, ratio }, cupF, r, res.stars);
      this.learnFx(res.stars, g);
      this.refreshHud?.();
    });
    this.delay(3.4, () => { if (!this.disposed && g.state === 'drink') this.leave(g); });
    this.refreshControls();
  }

  /** A light dot flies from the guest to the AI panel; the new cup appears on the taste map. */
  learnFx(stars, g) {
    if (this.phone) {
      sfx.build();
      this.stripFlash('ai', t('roastAiLearned', { name: short(g.def.id), n: stars }));
      if (this.mode === 'play' && this.active) this.showAI(this.active);
      this.aiPanel.show({ count: this.ai.count, dots: this.dots() });
      return;
    }
    const from = g.vis.main.head.getWorldPosition(new THREE.Vector3());
    const to = this.aiPanel.getWorldPosition(new THREE.Vector3());
    const dot = starSprite(true, 0.05);
    const a = this.group.worldToLocal(from.clone());
    const b = this.group.worldToLocal(to.clone());
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
        // the active guest's suggestion may change with what was just learned
        if (this.mode === 'play' && this.active) this.showAI(this.active);
        this.aiPanel.show({ count: this.ai.count, dots: this.dots(), learned: t('roastAiLearned', { name: short(g.def.id), n: stars }), flash: 1 });
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

  floatText(text, worldPos, token, size = 0.32) {
    const s = scoreSprite(text, token, size);
    s.material.depthTest = false;
    const p = this.group.worldToLocal(worldPos.clone());
    s.position.copy(p);
    this.group.add(s);
    this.tween(1.6, (k) => { s.position.y = p.y + k * 0.15; s.material.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3; }, {
      ease: (k) => k,
      onDone: () => { s.removeFromParent(); s.material.map.dispose(); s.material.dispose(); },
    });
  }

  /** Pops a 3D model in by its scale only (its materials are shared with the rest of the shop). */
  popScale(obj, delay = 0, size = 1) {
    obj.scale.setScalar(0.001);
    this.delay(delay, () => this.tween(0.35, (k) => obj.scale.setScalar(Math.max(0.001, size * k * (1 + 0.15 * Math.sin(k * Math.PI))))));
  }

  pulse(obj) {
    const s0 = obj.userData.base ?? obj.scale.x;
    this.tween(0.35, (k) => obj.scale.setScalar(s0 * (1 + 0.05 * Math.sin(k * Math.PI))));
  }

  // ---------- the gift basket finale ----------

  startBasket() {
    this.mode = 'basket';
    this.picks = [];
    this.active = null;
    this.spot.visible = false;
    this.roaster.fillTray(null);
    this.showControls('none');
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
      g.add(makeItem(this.M, it.model));
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
    // the student comes back for her grandma's present
    const vis = new Guest(this.G, BASKET_GUEST.model);
    this.groundGuest(vis);
    vis.group.position.set(ENTER_X, this.floorShop ?? -1, LANE_Z);
    vis.group.rotation.y = Math.PI / 2;
    this.shop.add(vis.group);
    vis.walking = 1;
    this.basketGuest = vis;
    this.tween(1.5, (k) => {
      const a = clamp(k / 0.78, 0, 1);
      const b = clamp((k - 0.78) / 0.22, 0, 1);
      vis.group.position.x = ENTER_X + (SLOT_X[1] - ENTER_X) * a;
      vis.group.position.z = LANE_Z + (SLOT_Z - LANE_Z) * b;
      if (b > 0) vis.turnTo = Math.atan2(-SLOT_X[1], -SLOT_Z);
    }, { ease: (k) => k, onDone: () => { vis.walking = 0; } });
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
    this.delay(1.5, () => {
      if (this.disposed) return;
      this.sayBasket(t(CHRISTMAS ? 'roastAsk_basket' : 'roastAsk_basket_plain'));
      vis.talking = true;
      this.delay(2, () => { vis.talking = false; });
      this.showControls('basket');
      this.refreshItems();
      this.refreshHud?.();
      this.pulse(this.aiPanel);
    });
    this.refreshHud?.();
  }

  sayBasket(body, stars = 0) {
    this.basketBubble?.removeFromParent();
    this.basketBubble?.dispose();
    const b = this.phone
      ? bubblePanel({ name: short('student'), body: null, stars, w: stars ? 0.26 : 0.2, active: true, tail: 'center' })
      : bubblePanel({ name: t('roastGuest_student'), body, stars, w: 0.62, active: true, tail: 'center', bodySize: 'xr-text-sm' });
    if (this.phone) b.scale.setScalar(2.2);
    const x = SLOT_X[1];
    b.position.set(x, this.eye + 0.01 + (b.h * b.scale.y) / 2, SLOT_Z + 0.16);
    b.rotation.set(0, this.engine.isXR ? Math.atan2(-x, -b.position.z) : 0, 0);
    this.ui.add(b);
    if (this.phone) this.popScale(b, 0, 2.2);
    else this.popIn(b);
    this.basketBubble = b;
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
    this.refreshControls();
  }

  pack() {
    if (this.mode !== 'basket') return;
    if (this.picks.length < 3) { this.toast(t('roastBasketNeed'), 'xr-warning'); sfx.wrong(); return; }
    this.mode = 'pack';
    this.showControls('none');
    const keys = this.picks.map((i) => ITEMS[i].key);
    const res = basketResult(basketFor(), keys);
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
      if (this.disposed) return;
      this.burst(this.basket.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.15, 0)), 'xr-roast-star', 30);
      this.basketGuest.react(res.stars >= 4 ? 'happy' : res.stars <= 2 ? 'sad' : 'neutral');
      (res.stars >= 4 ? sfx.finish : res.stars <= 2 ? sfx.wrong : sfx.point)();
      this.sayBasket(t(`roastBasketThanks${res.stars}`), res.stars);
      this.score += res.points;
      this.basketStars = res.stars;
      const head = this.basketGuest.main.head.getWorldPosition(new THREE.Vector3());
      this.floatText(t('roastPoints', { n: res.points }), head.add(new THREE.Vector3(0, 0.12, 0.35)), 'xr-roast-star');
      this.refreshHud?.();
    });
    this.delay(4.4, () => { if (!this.disposed) this.finish(); });
  }

  finish() {
    if (this.mode === 'over') return;
    this.mode = 'over';
    this.audio.stop();
    this.ui.visible = false;
    this.fit.visible = false;
    this.updatePads();
    if (this.strip) this.strip.el.hidden = true;
    // the shop makes way for the results
    const s = this.shop;
    this.tween(0.5, (k) => s.scale.setScalar(Math.max(0.001, 1 - k)), { onDone: () => { s.visible = false; } });
    const served = this.stats.filter((x) => !x.left);
    const avg = served.length ? served.reduce((a, x) => a + x.stars, 0) / served.length : 0;
    const withAI = served.filter((x) => x.usedAI);
    const aiAvg = withAI.length ? withAI.reduce((a, x) => a + x.stars, 0) / withAI.length : 0;
    const good = served.filter((x) => x.stars >= 4).length + (this.basketStars >= 4 ? 1 : 0);
    const fmt = (v) => v.toFixed(1).replace('.', getLang() === 'de' ? ',' : '.');
    const learned = [{ q: t('roastLearnQ1'), a: t('roastLearnA1') }, { q: t('roastLearnQ2'), a: t('roastLearnA2') }];
    // trusting an unsure suggestion went wrong: say why the confidence matters, else when it pays off
    if (withAI.some((x) => x.conf !== null && x.conf < 0.3 && x.stars <= 3)) learned.push({ q: t('roastLearnQ4'), a: t('roastLearnA4') });
    else learned.push({ q: t('roastLearnQ5'), a: t('roastLearnA5') });
    const line = withAI.length
      ? t('roastLineAi', { served: served.length, total: GUESTS.length, avg: fmt(avg), n: withAI.length, ai: fmt(aiAvg) })
      : t('roastLineNoAi', { served: served.length, total: GUESTS.length, avg: fmt(avg) });
    this.results({
      gameKey: 'roast',
      score: Math.min(5000, Math.round(this.score)),
      correct: good,
      total: GUESTS.length + 1,
      line,
      learned,
      onAgain: () => this.app.startGame('roast'),
    });
  }

  // ---------- panels and buttons ----------

  hudText() {
    const touch = this.engine.touchUI;
    const name = '';
    const wave = this.wave === 'basket' ? basketWord() : t(`roastWave_${this.wave ?? 'calm'}`);
    let s = this.mode === 'basket' || this.mode === 'pack'
      ? t('roastHudBasket', { name, basket: basketWord(), score: this.score })
      : t('roastHud', { name, wave, done: this.stats?.length ?? 0, total: GUESTS.length, score: this.score });
    s = s.replace(/^ · /, '');
    // Phones: the order strip shows the request, the AI and the drum; the status bar the round.
    if (this.strip) {
      if (this.mode !== 'play' || window.innerWidth <= window.innerHeight) return s;
      const d = this.drumState();
      const drum = d.stage === t('roastDrumFree') ? [d.stage, ...d.lines] : [`${t('roastStripDrum')}: ${d.stage}`, ...d.lines];
      return `${drum.join(' · ')} · ${s}`;
    }
    // (touch without the strip) the line that matters most right now comes first
    if (touch && this.mode === 'play') {
      let first = '';
      if (this.drumBatch?.state === 'roasting') first = `${t('roastRoasting')}: ${stageName(this.r)}`;
      else if (this.ready.length) first = t('roastHudReady', { name: short(this.ready[0].g.def.id) });
      else if (this.active && this.sel.length === 2) first = `${short(this.active.def.id)}: ${this.recipeText({ a: this.sel[0], b: this.sel[1], ratio: RATIOS[this.ratioIdx] })}`;
      else if (this.active && this.sug?.recipe) first = `${t('roastHudFor', { name: short(this.active.def.id) })} · ${t('roastAiStop')}: ${this.recipeText(this.sug.recipe)} (${Math.round(this.sug.conf * 100)} %)`;
      else if (this.active) first = t('roastHudFor', { name: short(this.active.def.id) });
      if (first) s = `${first} · ${s}`;
    } else if (touch && this.mode === 'basket' && this.sugAvailable()) {
      s = `${t('roastAiStop')}: ${this.bsug.pick.map((k) => t(`roastItem_${k}`)).join(', ')} (${Math.round(this.bsug.conf * 100)} %) · ${s}`;
    }
    return s;
  }

  /** Panels and buttons of a round (created once per game). */
  buildUi() {
    const ui = this.ui;
    this.aiPanel = new AiPanel(0.66, 0.92);
    ui.add(this.aiPanel);
    this.aiBtn = new Button(0.48, 0.1, { label: t('roastAiTake'), variant: 'primary', labelSize: 'xr-text-sm', onClick: () => this.useAI() });
    this.aiPanel.add(this.aiBtn);
    // blending: the bar with the share buttons and "roast" (or "queue" while the drum is busy)
    this.blend = blendPanel();
    this.blend.userData.label = t('roastBlend');
    this.blend.userData.onGrab = (p) => { if (this.mode === 'play' && this.sel.length === 2) this.drag = p; };
    this.blend.userData.onRelease = () => { this.drag = null; };
    ui.add(this.blend);
    this.moreA = new Button(0.27, 0.085, { label: '+', labelSize: 'xr-text-min', onClick: () => this.shift(1) });
    this.moreB = new Button(0.27, 0.085, { label: '+', labelSize: 'xr-text-min', onClick: () => this.shift(-1) });
    this.roastBtn = new Button(0.27, 0.16, { label: t('roastRoast'), variant: 'primary', labelSize: 'xr-text-md', onClick: () => this.commit(false) });
    [this.moreA, this.moreB, this.roastBtn].forEach((b) => this.blend.add(b));
    // the drum: gauge and stop button
    this.gauge = gaugePanel();
    ui.add(this.gauge);
    this.stopBtn = new Button(0.36, 0.11, { label: t('roastStop'), variant: 'primary', labelSize: 'xr-text-lg', onClick: () => this.stopRoast() });
    this.gauge.add(this.stopBtn);
    // basket finale: what is in the basket, and "pack"
    this.basketInfo = textPanel(0.62, 0.12, () => [
      { text: t('roastBasketPick'), size: 'xr-text-min', weight: 'bold', color: color('xr-panel-muted'), gap: 0.008 },
      { text: t('roastBasketChosen', { list: (this.picks ?? []).map((k) => t(`roastItem_${ITEMS[k].key}`)).join(', ') || '–' }), size: 'xr-text-sm', weight: 'bold' },
    ], { grow: false });
    ui.add(this.basketInfo);
    this.packBtn = new Button(0.3, 0.09, { label: t('roastBasketPack'), variant: 'primary', labelSize: 'xr-text-sm', onClick: () => this.pack() });
    this.basketInfo.add(this.packBtn);
    this.packBtn.position.set(0, -0.06 - 0.06, 0.002);
    this.showControls('play');
    this.layout(true);
    this.updateGauge();
    this.showAI(null);
    this.refreshBlend();
  }

  /** Which station panels are visible: 'play' (blend and drum), 'basket' or 'none'. */
  showControls(which) {
    this.controls = which;
    // phones: the order strip shows the blend and the roast stage (the 3D text would be too small)
    this.blend.visible = which === 'play' && !this.phone;
    this.gauge.visible = which === 'play' && !this.phone;
    this.basketInfo.visible = which === 'basket' && !this.phone;
    // phones use the big screen buttons instead of the 3D ones
    const touch = this.engine.touchUI;
    [this.moreA, this.moreB, this.roastBtn, this.stopBtn, this.packBtn].forEach((b) => { b.visible = !touch; });
    this.refreshControls();
  }

  /** Short message above the drum (or the basket). */
  toast(text, token = 'xr-accent') {
    if (this.phone) { this.stripFlash(this.mode === 'play' ? 'drum' : 'ai', text); return; }
    this.toastPanel?.removeFromParent();
    this.toastPanel?.dispose();
    const p = textPanel(0.56, 0.08, [{ text, size: 'xr-text-sm', weight: 'black', color: color(token) }], { surface: { stroke: color(token) } });
    this.ui.add(p);
    const c = this.basketInfo.visible ? this.basketInfo : this.gauge;
    p.position.set(c.position.x, c.position.y + c.h / 2 + 0.07, c.position.z + 0.01);
    p.rotation.copy(c.rotation);
    this.popIn(p);
    this.toastPanel = p;
    this.delay(2.0, () => { if (this.toastPanel === p) { p.removeFromParent(); p.dispose(); this.toastPanel = null; } });
  }

  /** A big banner when a new wave begins. */
  banner(text) {
    this.bannerPanel?.removeFromParent();
    this.bannerPanel?.dispose();
    const p = textPanel(0.9, 0.1, [{ text, size: 'xr-text-lg', weight: 'black', color: color('xr-roast-wave') }], { surface: { stroke: color('xr-roast-wave') } });
    p.userData.noFit = true;
    p.position.set(0, this.eye - 0.1, -1.25);
    this.ui.add(p);
    this.popIn(p);
    this.bannerPanel = p;
    this.delay(2.6, () => {
      if (this.bannerPanel !== p) return;
      this.tween(0.4, (k) => { p.material.opacity = 1 - k; }, { onDone: () => { if (this.bannerPanel === p) { p.removeFromParent(); p.dispose(); this.bannerPanel = null; } } });
    });
  }

  key(e) {
    if (e.repeat) return;
    const k = e.key;
    if (this.mode === 'play') {
      if (k >= '1' && k <= '4') this.toggleJar(Number(k) - 1);
      else if (k === 'ArrowRight') this.shift(1);
      else if (k === 'ArrowLeft') this.shift(-1);
      else if (k === 'a' || k === 'A') this.useAI();
      else if (k === 'Enter') this.commit(false);
      else if (k === ' ') this.stopRoast();
      else if (k === 's' || k === 'S') this.serveNext();
      else if (k === 'Tab') this.nextGuestKey();
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
    if (this.mode === 'play') kind = this.sel?.length === 2 ? 'blend' : 'jars';
    else if (this.mode === 'basket') kind = this.picks?.length === 3 ? 'pack' : 'items';
    const portrait = window.innerWidth < window.innerHeight;
    const key = `${kind}|${portrait}`;
    if (key !== this.padKind) {
      this.padKind = key;
      this.pads?.remove();
      this.pads = null;
      // the stations on the right: the AI's one tap, serving, stopping the drum
      const station = [
        { icon: 'lab', label: t('roastAiTake'), onPress: () => this.useAI(), group: 'right' },
        { icon: 'roast', label: t('roastServe'), onPress: () => this.serveNext(), group: 'right' },
        { icon: 'special', label: t('roastStop'), onPress: () => this.stopRoast(), group: 'right', primary: true },
      ];
      // the bean and its main note ("Ethiopia · fruity"), since the 3D tags are small on a phone
      const note = (i) => `${beanName(i)}\n${t(`roastBeanNote_${BEANS[i].key}`).split(',')[0]}`;
      let items = null;
      if (kind === 'jars') items = [0, 1, 2, 3].map((i) => ({ icon: '', label: note(i), onPress: () => this.toggleJar(i), group: 'left' })).concat(station);
      else if (kind === 'blend') {
        items = [
          { icon: '', label: '+', onPress: () => this.shift(1), group: 'left' },
          { icon: '', label: '+', onPress: () => this.shift(-1), group: 'left' },
          { icon: 'review', label: t('roastChange'), onPress: () => { this.sel = []; this.refreshBlend(); }, group: 'left' },
          { icon: 'roast', label: t('roastRoast'), onPress: () => this.commit(false), group: 'left' },
        ].concat(station);
      } else if (kind === 'items') items = ITEMS.map((it, i) => ({ icon: 'gift', label: t(`roastItem_${it.key}`), onPress: () => this.toggleItem(i), group: i < 3 ? 'left' : 'right' }));
      else if (kind === 'pack') {
        items = [
          { icon: 'review', label: t('roastChangeItems'), onPress: () => { this.picks = []; this.refreshItems(); }, group: 'left' },
          ...(this.sugAvailable() ? [{ icon: 'lab', label: t('roastAiUse'), onPress: () => this.useAI(), group: 'left' }] : []),
          { icon: 'gift', label: t('roastBasketPack'), onPress: () => this.pack(), group: 'right', primary: true },
        ];
      }
      if (items) {
        this.pads = this.touchButtons(items, { grid: true });
        this.padEl = [...document.querySelectorAll('#stage > .mtouch')].pop() ?? null;
        this.padEl?.classList.add('roast-pads');
        this.pads?.show(true);
        // four bean buttons: one row of four when upright, a 2 x 2 block when sideways
        const left = this.padEl?.querySelector('.mtouch__group--left');
        if (left && left.children.length === 4) {
          if (portrait) left.style.gridTemplateColumns = 'repeat(4, minmax(0, 1fr))';
          else left.lastElementChild.style.gridColumn = 'auto';
        }
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
    if (kind === 'jars' || kind === 'blend') {
      const full = !!this.drumBatch && !!this.nextBatch;
      if (kind === 'jars') [0, 1, 2, 3].forEach((i) => { mark(i, this.sel.includes(i)); this.pads?.disable(i, !this.active); });
      else {
        const [a, b] = this.sel;
        this.pads?.relabel(0, '', t('roastMore', { name: beanName(a) }));
        this.pads?.relabel(1, '', t('roastMore', { name: beanName(b) }));
        this.pads?.disable(0, this.ratioIdx >= RATIOS.length - 1);
        this.pads?.disable(1, this.ratioIdx <= 0);
        this.pads?.relabel(3, 'roast', t(this.drumBatch ? 'roastQueue' : 'roastRoast'));
        this.pads?.disable(3, !this.active || full);
      }
      this.pads?.disable(4, !(this.active && this.sug?.recipe) || full);
      this.pads?.relabel(5, 'roast', this.ready.length ? t('roastServeTo', { name: short(this.ready[0].g.def.id) }) : t('roastServe'));
      this.pads?.disable(5, !this.ready.length);
      this.pads?.disable(6, this.drumBatch?.state !== 'roasting');
    } else if (kind === 'items') ITEMS.forEach((_, i) => mark(i, this.picks.includes(i)));
  }

  // ---------- phones: the order strip ----------

  /**
   * Phones: a strip of screen cards that stays readable however small the 3D view is: the active
   * guest's request (their speech bubble), the AI's suggestion with its confidence, the drum with
   * the roast stage. Upright under the status bar; sideways in two columns above the thumb buttons.
   */
  buildStrip() {
    if (!this.phone || this.strip) return;
    const el = document.createElement('div');
    el.className = 'roast-strip';
    el.innerHTML = `
      <section class="roast-strip__card roast-strip__guest"><p class="roast-strip__name"></p><p class="roast-strip__ask"></p><p class="roast-strip__sub"></p><div class="roast-strip__bar"><i></i></div></section>
      <section class="roast-strip__card roast-strip__ai"><p class="roast-strip__label"></p><p class="roast-strip__main"></p><p class="roast-strip__conf"></p></section>
      <section class="roast-strip__card roast-strip__drum"><p class="roast-strip__label"></p><p class="roast-strip__main"><span class="roast-strip__chip"></span><span class="roast-strip__stage"></span></p><p class="roast-strip__sub"></p></section>`;
    document.getElementById('stage')?.append(el);
    const q = (sel) => el.querySelector(sel);
    const guest = q('.roast-strip__guest');
    const ai = q('.roast-strip__ai');
    const drum = q('.roast-strip__drum');
    this.strip = {
      el, guest, ai, drum,
      name: guest.querySelector('.roast-strip__name'), ask: guest.querySelector('.roast-strip__ask'), sub: guest.querySelector('.roast-strip__sub'),
      bar: guest.querySelector('.roast-strip__bar'), fill: guest.querySelector('.roast-strip__bar > i'),
      aiLabel: ai.querySelector('.roast-strip__label'), aiMain: ai.querySelector('.roast-strip__main'), aiConf: ai.querySelector('.roast-strip__conf'),
      drumLabel: drum.querySelector('.roast-strip__label'), chip: drum.querySelector('.roast-strip__chip'), stage: drum.querySelector('.roast-strip__stage'), drumSub: drum.querySelector('.roast-strip__sub'),
    };
    this.flashes = {};
    this.refreshStrip();
  }

  /** A short message in a card of the strip (a crack, a hint, what the AI just learned). */
  stripFlash(card, text) {
    this.flashes[card] = { text, until: this.time + 2.4 };
    this.refreshStrip();
    this.refreshHud?.();
  }

  refreshStrip() {
    const S = this.strip;
    if (!S) return;
    const show = this.mode === 'play' || this.mode === 'basket' || this.mode === 'pack';
    S.el.hidden = !show;
    if (!show) return;
    const put = (node, text) => { if (node.textContent !== text) node.textContent = text; node.hidden = !text; };
    const flash = (k) => (this.flashes[k] && this.flashes[k].until > this.time ? this.flashes[k] : null);
    const basket = this.mode !== 'play';
    const land = window.innerWidth > window.innerHeight;
    // the guest you prepare for: their request, your blend, their patience
    let name = '';
    let ask = '';
    let sub = '';
    let frac = null;
    if (basket) {
      name = t('roastGuest_student');
      ask = t(CHRISTMAS ? 'roastAsk_basket' : 'roastAsk_basket_plain');
      sub = t('roastBasketChosen', { list: (this.picks ?? []).map((k) => t(`roastItem_${ITEMS[k].key}`)).join(', ') || '–' });
    } else if (this.active) {
      const g = this.active;
      name = t(`roastGuest_${g.def.id}`);
      ask = g.ask ?? '';
      const recipe = this.sel.length === 2 ? this.recipeText({ a: this.sel[0], b: this.sel[1], ratio: RATIOS[this.ratioIdx] }) : null;
      sub = !recipe ? t('roastStripPick') : land ? recipe : t('roastStripBlend', { recipe });
      frac = clamp(g.patience / g.patienceMax, 0, 1);
    } else if (this.ready.length) ask = t('roastHudReady', { name: short(this.ready[0].g.def.id) });
    else {
      // nobody to prepare for: the guest whose cup is on its way, else nobody
      const g = this.guests.find((x) => x.state === 'wait' && x.batch);
      if (g) { name = t(`roastGuest_${g.def.id}`); ask = g.ask ?? ''; sub = this.orderStatus(g) ?? ''; } else ask = t('roastNobody');
    }
    put(S.name, name);
    put(S.ask, ask);
    put(S.sub, sub);
    S.bar.hidden = frac === null;
    if (frac !== null) {
      S.fill.style.width = `${Math.round(frac * 100)}%`;
      S.fill.style.background = `var(--${frac > 0.5 ? 'xr-success' : frac > 0.25 ? 'xr-warning' : 'xr-danger'})`;
    }
    // the AI: its suggestion and how sure it is (or what it just learned)
    let main = '';
    let conf = null;
    const fa = flash('ai');
    if (fa) main = fa.text;
    else if (basket) {
      if (this.bsug?.profile) { main = t('roastStripBasketAi', { list: this.bsug.pick.map((k) => t(`roastItem_${k}`)).join(', ') }); conf = this.bsug.conf; } else main = t('roastAiBasketCold');
    } else if (this.active && this.sug) {
      const sg = this.sug;
      if (sg.recipe) { main = `${this.recipeText(sg.recipe)}, ${stageName(sg.roast)}`; conf = sg.conf; } else if (sg.avoid) main = t('roastAiAvoid', { name: short(sg.avoid.id), recipe: this.recipeText(sg.avoid.recipe) });
      else main = t('roastStripCold');
    } else main = this.ai.count === 1 ? t('roastAiCount1') : t('roastAiCount', { n: this.ai.count });
    put(S.aiLabel, t('roastStripAi'));
    put(S.aiMain, main);
    put(S.aiConf, conf === null ? '' : `${t('roastAiConf', { n: Math.round(conf * 100) })}${conf < 0.3 ? ` · ${t('roastAiUnsure')}` : ''}`);
    S.aiConf.className = `roast-strip__conf roast-strip__conf--${conf >= 0.6 ? 'high' : conf >= 0.3 ? 'mid' : 'low'}`;
    S.ai.classList.toggle('is-flash', !!fa);
    // the drum: the stage while it roasts (with its color), who it is for, who is next
    // (sideways it is the first line of the status bar instead, see hudText)
    S.drum.hidden = basket || land;
    S.el.classList.toggle('is-basket', basket);
    if (!S.drum.hidden) {
      const d = this.drumState();
      put(S.drumLabel, t('roastStripDrum'));
      put(S.stage, d.stage);
      S.chip.hidden = !d.col;
      if (d.col) S.chip.style.background = `#${d.col.getHexString()}`;
      put(S.drumSub, d.lines.join(' · '));
      S.drum.classList.toggle('is-flash', d.flash);
    }
    this.placeStrip();
  }

  /** The drum for the strip and the status bar: stage (and its color), who it roasts for, who is next. */
  drumState() {
    const b = this.drumBatch;
    const fd = this.flashes?.drum && this.flashes.drum.until > this.time ? this.flashes.drum : null;
    let stage = t('roastDrumFree');
    let col = null;
    const lines = [];
    if (b?.state === 'roasting') {
      stage = stageName(this.r);
      col = beanColor(this.r);
      lines.push(t('roastRoastFor', { name: short(b.g.def.id) }));
    } else if (b?.state === 'pour') lines.push(t('roastRoastFor', { name: short(b.g.def.id) }));
    else if (this.cooling.length) stage = t('roastStripCooling', { name: short(this.cooling[0].g.def.id) });
    if (this.nextBatch) lines.push(t('roastNext', { name: short(this.nextBatch.g.def.id) }));
    if (fd) lines.unshift(fd.text);
    return { stage, col, lines, flash: !!fd };
  }

  /** Under the status bar; sideways the columns end above the thumb buttons. */
  placeStrip() {
    const S = this.strip;
    if (!S || S.el.hidden) return;
    const H = window.innerHeight;
    const land = window.innerWidth > H;
    const hud = document.querySelector('#stage > .mhud');
    const top = Math.round((hud?.getBoundingClientRect().bottom ?? 56) + 8);
    S.el.style.top = `${top}px`;
    if (land) {
      const groups = this.padEl ? [...this.padEl.querySelectorAll('.mtouch__group')] : [];
      const padTop = groups.length ? Math.min(...groups.map((g) => g.getBoundingClientRect().top)) : H;
      S.el.style.bottom = `${Math.round(H - padTop + 8)}px`;
      delete S.el.dataset.inset;
    } else {
      S.el.style.bottom = '';
      S.el.dataset.inset = 'top'; // the 3D view is framed below it
    }
  }

  /** Landscape on phones: the screen width the strip's columns cover on the left and right. */
  stripSides() {
    const S = this.strip;
    if (!S || S.el.hidden || window.innerWidth <= window.innerHeight) return { left: 0, right: 0 };
    const W = window.innerWidth;
    const g = S.guest.getBoundingClientRect();
    const right = [S.ai, S.drum].filter((c) => !c.hidden).map((c) => c.getBoundingClientRect().left);
    return { left: g.width ? g.right + 6 : 0, right: right.length ? W - Math.min(...right) + 6 : 0 };
  }

  // ---------- layout ----------

  /**
   * Places the panels: in the headset and on wide screens the AI panel on the left (on the arc),
   * the blend in the middle right above the counter, the drum's gauge higher up beside the
   * roaster. Phones held upright: blend and gauge side by side over the counter's front, the AI
   * panel below them.
   */
  layout(force = false) {
    const e = this.engine;
    const portrait = !e.isXR && e.touchUI && window.innerWidth < window.innerHeight;
    const kind = e.isXR ? 'xr' : portrait ? 'portrait' : e.touchUI ? 'land' : 'desk';
    if (!force && kind === this.layoutKind && this.layoutBuilt) return;
    this.layoutKind = kind;
    this.padKind = null;
    if (!this.aiPanel) return;
    this.layoutBuilt = true;
    const eye = this.eye;
    const top = eye - DROP;
    // Phones: a wide AI panel upright (text left, taste map right), a shorter one sideways.
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
    ai.visible = !this.phone; // phones: the order strip shows the AI's suggestion
    if (kind === 'portrait') {
      ai.rotation.set(0, 0, 0);
      ai.scale.setScalar(1.2);
      ai.userData.base = 1.2;
      ai.position.set(-0.02, top - 0.27 - (ai.h * 1.2) / 2, -0.6);
      this.blend.rotation.set(-0.15, 0, 0);
      this.blend.position.set(-0.33, top - 0.08, -0.6);
      this.gauge.rotation.set(-0.15, 0, 0);
      this.gauge.position.set(0.33, top - 0.08, -0.6);
      this.basketInfo.rotation.set(-0.15, 0, 0);
      this.basketInfo.position.set(0.05, top + 0.37, -0.66);
      this.fit.position.set(-0.02, top + 0.12, -0.96);
      this.fit.scale.set(1.46, 0.85, 0.68);
    } else {
      ai.scale.setScalar(1);
      ai.userData.base = 1;
      if (kind === 'xr') placeOnArc(ai, -1.05, eye - 0.02, 1.05);
      // phones held sideways: higher, clear of the thumb buttons in the lower corners
      else if (kind === 'land') placeOnArc(ai, -0.86, eye + 0.2, 1.16);
      else placeOnArc(ai, -1.0, eye - 0.02, 1.12);
      if (kind !== 'xr') ai.rotation.y *= 0.6;
      const yaw = kind === 'xr' ? -0.42 : -0.15;
      this.blend.position.set(0.48, top + 0.33, -0.8);
      this.blend.rotation.set(-0.22, yaw, 0, 'YXZ');
      this.gauge.position.set(0.95, top + 0.68, -0.9);
      this.gauge.rotation.set(-0.12, kind === 'xr' ? -0.7 : -0.2, 0, 'YXZ');
      this.basketInfo.position.set(0.5, top + 0.5, -0.8);
      this.basketInfo.rotation.set(-0.22, yaw, 0, 'YXZ');
      this.fit.position.set(0.25, top + 0.17, -0.97);
      this.fit.scale.set(2.2, 0.95, 0.7);
    }
    // the share buttons under the blend bar, "roast" beside it; "stop" under the gauge
    const by = -this.blend.h / 2 - 0.012 - this.moreA.h / 2;
    this.moreA.position.set(-this.moreA.w / 2 - 0.008, by, 0.002);
    this.moreB.position.set(this.moreB.w / 2 + 0.008, by, 0.002);
    this.roastBtn.position.set(this.blend.w / 2 + 0.02 + this.roastBtn.w / 2, -0.03, 0.002);
    this.stopBtn.position.set(0, -this.gauge.h / 2 - 0.014 - this.stopBtn.h / 2, 0.002);
    this.aiBtn.position.set(0, -ai.h / 2 - 0.012 - this.aiBtn.h / 2, 0.002);
    // phones: the camera frames just the counter and the guests (the strip carries the panels' text)
    if (this.phone) {
      this.fit.position.set(-0.08, top + 0.08, -0.96);
      this.fit.scale.set(1.3, 0.55, 0.68);
    }
    this.guests.forEach((g) => this.placeBubble(g));
    this.updatePads();
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
    const W = window.innerWidth;
    const side = this.stripSides();
    const freeW = Math.max(0.35, 1 - (side.left + side.right) / W);
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
      need = Math.max(need, (margin * Math.abs(q.x)) / (th * freeW) - f, (margin * Math.abs(q.dot(up))) / (tv * free) - f);
    }
    const want = T.clone().addScaledVector(fwd, -need).addScaledVector(up, -center * need * tv);
    want.x += ((side.right - side.left) / W) * need * th;
    const k = this.camReady ? Math.min(1, dt * 4) : 1;
    this.camReady = true;
    cam.position.lerp(want, k);
    cam.rotation.set(-tilt, 0, 0);
    return true;
  }

  // ---------- frame loop ----------

  update(dt) {
    this.time += dt;
    const e = this.engine;
    this.layout();
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
    this.contacts?.forEach((m) => { if (!m.userData.guest) m.position.y = this.floorShop + 0.003; });
    if (this.haze) this.haze.visible = !e.isXR || (!!e.scene.background && gfxTier() === 'high');
    if (this.roaster) {
      const base = Math.max(this.floorShop, ROASTER_BASE_MIN);
      this.roaster.group.position.y = base;
      this.pedestal.scale.y = Math.max(0.001, base - this.floorShop);
      this.pedestal.visible = base - this.floorShop > 0.01;
      const lever = this.leverHold ? this.readLever() : 0;
      this.leverKick = Math.max(0, (this.leverKick ?? 0) - dt * 1.5);
      const roasting = this.drumBatch?.state === 'roasting';
      this.roaster.update(dt, this.time, { roasting, r: roasting ? this.r : this.lastR ?? 0, lever: Math.max(lever, this.leverKick > 0.5 ? 1 : 0) });
    }
    if (this.tree) {
      this.tree.group.position.y = this.floorShop;
      this.tree.tick(this.time);
    }
    this.string?.userData.tick(this.time);
    if (this.mode === 'play') {
      this.waves(dt);
      if (this.drumBatch?.state === 'roasting') this.updateRoast(dt);
      // cooling beans become cups
      for (const b of [...this.cooling]) {
        b.coolT -= dt;
        if (b.coolT <= 0) { this.cooling.splice(this.cooling.indexOf(b), 1); this.coolDone(b); }
      }
      // patience runs out while a guest waits for their cup
      for (const g of [...this.guests]) {
        if (g.state !== 'wait') continue;
        g.patience -= dt * (g.batch ? ORDERED_DRAIN : 1);
        g.bar.userData.set(g.patience / g.patienceMax, this.time);
        if (g.patience <= 0) this.timeout(g);
      }
    }
    if (this.flight) this.flight.update(dt);
    this.smoke?.update(dt);
    this.steam?.update(dt);
    // steam from finished cups, and their rings pulse
    this.steamT = (this.steamT ?? 0) - dt;
    if (this.steamT <= 0 && this.ready.length) {
      this.steamT = 0.2;
      for (const b of this.ready) if (b.cup) this.steam.emit(this.shop.worldToLocal(b.cup.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(0, 0.09, 0)));
    }
    for (const b of this.ready) if (b.cup?.userData.ring) b.cup.userData.ring.material.opacity = 0.55 + 0.35 * Math.sin(this.time * 6);
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
    // the guests stand on the floor and turn towards you; the active one has a warm light behind
    const figures = this.guests.map((g) => g.vis);
    if (this.basketGuest) figures.push(this.basketGuest);
    for (const vis of figures) {
      vis.group.position.y = this.floorShop;
      if (vis.turnTo !== undefined) vis.group.rotation.y += (vis.turnTo - vis.group.rotation.y) * Math.min(1, dt * 6);
      vis.update(dt);
    }
    for (const g of this.guests) {
      this.placeBubble(g);
      // a cup in the guest's hand stays upright and tips towards the mouth while drinking
      if (g.cup && g.cup.parent === g.vis.hand) {
        const want = g.vis.group.getWorldQuaternion(new THREE.Quaternion())
          .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.7 * clamp((g.vis.drinkK - 0.5) * 2, 0, 1), 0, 0)));
        g.cup.quaternion.copy(g.vis.hand.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(want));
      }
    }
    if (this.spot) {
      const a = this.active;
      this.spot.visible = !!a && this.mode === 'play';
      if (a) {
        this.spot.position.set(a.vis.group.position.x, this.floorShop + 1.25, SLOT_Z - 0.12);
        this.spot.material.opacity = 0.26 + 0.06 * Math.sin(this.time * 3);
      }
    }
    // dragging the blend bar (mouse or controller ray)
    if (this.drag && this.mode === 'play' && this.sel.length === 2) this.dragBlend();
    if (Math.floor(this.time * 4) !== this.hudTick) {
      this.hudTick = Math.floor(this.time * 4);
      if (this.mode !== 'intro' && this.mode !== 'over') {
        this.refreshHud?.();
        this.updatePads();
        this.refreshStrip();
      }
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
    this.strip?.el.remove();
    for (const g of [...this.guests]) this.removeGuest(g);
    this.basketGuest?.dispose();
    this.basketGuest?.blob?.geometry.dispose();
    this.basketGuest?.blob?.material.dispose();
    this.smoke?.dispose();
    this.steam?.dispose();
    this.contacts?.forEach((m) => { m.geometry.dispose(); m.material.dispose(); });
    this.haze?.geometry.dispose();
    this.haze?.material.dispose();
    super.dispose();
  }
}
