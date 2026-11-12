// Main menu: compact title, games as 3D coins with name plates in two groups (3D experiences,
// quizzes), a small icon bar (leaderboard, licence, AI lab, settings, exit). Language, design,
// music and the XR room controls live in a separate settings view.
import { BaseScene, neuralCloud, getBest, layoutRow } from '../scene.js';
import { quality } from '../quality.js';
import { Button, Panel, textPanel, placeOnArc, roundRect } from '../ui3d.js';
import { loadCoin, makeCoin } from '../menu-coins.js';
import { color, num, font } from '../tokens.js';
import { t, L, getLang, setLang } from '../i18n.js';
import { SPONSOR } from '../content.js';
import { stats } from '../progress.js';
import { getSkin, setSkin, SKINS } from '../skin.js';
import { VISIBLE_MODES, CLIENT_GAMES } from '../config.js';
import { sfx } from '../sfx.js';
import { music } from '../music.js';
import { drawIcon } from '../icons.js';
import { VERSION } from '../version.js';
import { CHRISTMAS, makeTree, makeLightString } from '../christmas.js';
import { sceneLook, contactShadow } from '../gfx.js';

const ALL_GAMES = [
  { key: 'parkour', name: 'parkourName', tag: 'parkourTag', group: 'play' },
  { key: 'robot', name: 'robotName', tag: 'robotTag', group: 'play' },
  { key: 'pong', name: 'pongName', tag: 'pongTag', group: 'play' },
  { key: 'dataflight', name: 'dataflightName', tag: 'dataflightTag', group: 'play' },
  { key: 'arch', name: 'archName', tag: 'archTag', group: 'play' },
  { key: 'fight', name: 'fightName', tag: 'fightTag', group: 'play' },
  { key: 'quiz', name: 'quizName', tag: 'quizTag', group: 'quiz' },
  { key: 'factmyth', name: 'factmythName', tag: 'fmTag', group: 'quiz' },
  { key: 'sort', name: 'sortName', tag: 'sortTag', group: 'quiz' },
  { key: 'timeline', name: 'timelineName', tag: 'timelineTag', group: 'quiz' },
  { key: 'review', name: 'reviewName', tag: 'reviewTag', group: 'quiz' },
  // Games for our clients: a section of their own below the others ('For our clients').
  { key: 'bike', name: 'bikeName', tag: 'bikeTag', group: 'clients' },
  { key: 'roast', name: 'roastName', tag: 'roastTag', group: 'clients' },
  { key: 'bricks', name: 'bricksName', tag: 'bricksTag', group: 'clients' },
  { key: 'green', name: 'greenName', tag: 'greenTag', group: 'clients' },
  { key: 'dock', name: 'dockName', tag: 'dockTag', group: 'clients' },
  { key: 'pinball', name: 'pinballName', tag: 'pinballTag', group: 'clients' },
  { key: 'summit', name: 'summitName', tag: 'summitTag', group: 'clients' },
];

export const GAMES = ALL_GAMES.filter((g) => VISIBLE_MODES.includes(g.key));

// The menu's rows (Nov 2026): Echo Parkour, AI Pong and the gift coin 'For our clients' on top,
// below AI Quiz, AI Arena and Data Flight. Visible games that are not listed here follow in
// further rows (up to four each). The games for our clients have a view of their own (the gift
// coin opens it): CLIENT_ROWS.
const MENU_ROWS = [['parkour', 'pong', 'clients'], ['quiz', 'fight', 'dataflight']];
const CLIENT_ROWS = [['bike', 'roast', 'bricks', 'green'], ['dock', 'pinball', 'summit']];
// Games that show a 'New' hint on their name plate.
const NEW_GAMES = ['dataflight', ...CLIENT_GAMES];
// The gift coin of the main menu that opens the games for our clients.
const CLIENTS_CARD = { key: 'clients', name: 'menuClients', tag: 'menuClientsTag', group: 'section' };
const clientGames = () => GAMES.filter((g) => g.group === 'clients');

/** The visible games as rows of the menu (the clients' games behind their gift coin). */
function menuRows() {
  const byKey = new Map(GAMES.map((g) => [g.key, g]));
  if (clientGames().length) byKey.set('clients', CLIENTS_CARD);
  const rows = MENU_ROWS.map((r) => r.map((k) => byKey.get(k)).filter(Boolean)).filter((r) => r.length);
  const rest = GAMES.filter((g) => g.group !== 'clients' && !MENU_ROWS.flat().includes(g.key));
  for (let i = 0; i < rest.length; i += 4) rows.push(rest.slice(i, i + 4));
  return rows;
}

/** The games for our clients as rows of their view. */
function clientRows() {
  const byKey = new Map(clientGames().map((g) => [g.key, g]));
  const rows = CLIENT_ROWS.map((r) => r.map((k) => byKey.get(k)).filter(Boolean)).filter((r) => r.length);
  const rest = clientGames().filter((g) => !CLIENT_ROWS.flat().includes(g.key));
  for (let i = 0; i < rest.length; i += 4) rows.push(rest.slice(i, i + 4));
  return rows;
}

/** Splits text into lines that fit maxWidth (canvas font must be set). */
function wrap(ctx, text, maxWidth, maxLines) {
  // Words may also break after a hyphen ("Kampagnen-|Flipper"); no space is added there.
  const words = text.split(/\s+/).flatMap((w) => w.split(/(?<=\p{L}-)(?=\p{L})/u).map((part, i) => ({ part, glue: i > 0 })));
  const lines = [];
  let line = '';
  for (const { part, glue } of words) {
    const test = line ? `${line}${glue ? '' : ' '}${part}` : part;
    if (ctx.measureText(test).width <= maxWidth || !line) line = test;
    else { lines.push(line); line = part; }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[\s.,;:]+$/, '')}…`;
  }
  return lines;
}

const COIN_D = 0.27; // coin diameter (m)
const CARD_W = 0.3;
const CARD_GAP = 0.012; // between coin and name plate
const LINE = 1.18;
// Ease with a small overshoot for the coins popping in.
const backOut = (k) => 1 + 2.2 * (k - 1) ** 3 + 1.2 * (k - 1) ** 2;

/** Name lines of a card (long single words shrink instead of overflowing). ppm = px per meter. */
function cardLines(ctx, g, w, ppm) {
  const tw = (w - 0.03) * ppm;
  let nameSize = num('xr-text-md');
  const longest = t(g.name).split(/\s+|(?<=\p{L}-)(?=\p{L})/u).reduce((a, b) => (b.length > a.length ? b : a), '');
  ctx.font = font('black', nameSize * ppm);
  while (ctx.measureText(longest).width > tw && nameSize > num('xr-text-sm')) {
    nameSize -= 0.001;
    ctx.font = font('black', nameSize * ppm);
  }
  return { name: wrap(ctx, t(g.name), tw, 2), nameSize };
}

/** Height (m) of the name plate under the coin. */
function plateHeight(g, w) {
  const ctx = document.createElement('canvas').getContext('2d');
  const { name, nameSize } = cardLines(ctx, g, w, 400);
  return name.length * nameSize * LINE + num('xr-text-sm') * LINE + 0.03;
}

/**
 * Game card: the 3D coin (added later by the menu, see menu-coins.js) above a name plate with
 * the best score. The panel is the pointer target for both; its upper part stays transparent.
 */
function gameCard(g, w, h, { footer, onClick }) {
  let hover = false;
  const card = new Panel(w, h, (ctx, c) => {
    const W = c.canvas.width;
    const H = c.canvas.height;
    const ph = c.m(h - COIN_D - CARD_GAP);
    const y0 = H - ph;
    const sw = c.m(num('xr-border-width')) * (hover ? 2 : 1);
    roundRect(ctx, sw / 2, y0 + sw / 2, W - sw, ph - sw, c.m(num('xr-radius')));
    ctx.fillStyle = color(hover ? 'xr-button-hover' : 'xr-panel-bg');
    ctx.fill();
    ctx.lineWidth = sw;
    ctx.strokeStyle = color(hover ? 'xr-accent' : 'xr-panel-border');
    ctx.stroke();
    const { name, nameSize } = cardLines(ctx, g, w, c.px);
    const md = c.m(nameSize);
    const sm = c.m(num('xr-text-sm'));
    let y = y0 + (ph - (name.length * md + sm) * LINE) / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = color('xr-panel-text');
    ctx.font = font('black', md);
    name.forEach((l) => { ctx.fillText(l, W / 2, y); y += md * LINE; });
    ctx.fillStyle = color('xr-accent');
    ctx.font = font('bold', sm);
    ctx.fillText(footer, W / 2, y);
  });
  card.material.alphaTest = 0.02; // the clear upper part must not hide what lies behind it
  card.userData.interactive = true;
  card.userData.label = t(g.name);
  card.userData.setHover = (v) => {
    hover = v;
    card.userData.coin?.setHover(v);
    card.redraw();
  };
  card.userData.onClick = () => { sfx.click(); onClick(); };
  return card;
}

function iconButton(icon, label, onClick, accentToken = 'xr-accent', w = 0.25) {
  let hover = false;
  const b = new Panel(w, 0.13, (ctx, c) => {
    c.surface({ fill: color(hover ? 'xr-button-hover' : 'xr-button-bg'), stroke: color(hover ? accentToken : 'xr-panel-border'), strokeWidth: num('xr-border-width') * (hover ? 2 : 1), stripe: false });
    const W = c.canvas.width;
    const H = c.canvas.height;
    drawIcon(ctx, icon, W / 2, H * 0.38, c.m(0.05), color(accentToken));
    ctx.fillStyle = color('xr-button-text');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let px = c.m(num('xr-text-sm'));
    do { ctx.font = font('bold', px); px -= 1; } while (ctx.measureText(label).width > W - c.m(0.02) && px > c.m(num('xr-text-min')));
    ctx.fillText(label, W / 2, H * 0.78);
  });
  b.userData.interactive = true;
  b.userData.label = label;
  b.userData.setHover = (v) => { hover = v; b.scale.setScalar(v ? num('xr-hover-scale') : 1); b.redraw(); };
  b.userData.onClick = () => { sfx.click(); onClick(); };
  return b;
}

export class MenuScene extends BaseScene {
  constructor(app) {
    super(app);
    const { eye, dist } = this;
    // Look: a soft studio environment for reflections (tree baubles, Echo), neutral tone mapping
    // that keeps the token colors; the coins bring their own reflections (menu-coins.js).
    this.onSceneDispose(sceneLook(this.engine, { tone: 'neutral', exposure: 1.08, env: 'studio', envIntensity: 0.55, shadows: false }));
    const cloud = this.add(neuralCloud({ radius: 0.45 }), this.group);
    cloud.position.set(0, eye + 0.92, -dist - 0.6);
    this.onUpdate(cloud.userData.tick);
    this.coins = [];
    this.onUpdate((dt) => this.coins.forEach((c) => c.update(dt)));
    if (CHRISTMAS) this.decorate();
    // A language or design change rebuilds the menu; come back to the settings view then.
    // Back from a game, the menu opens the view it was started from (main or the clients' games).
    const view = MenuScene.reopen ?? MenuScene.lastView ?? 'main';
    MenuScene.reopen = null;
    if (view === 'settings') this.showSettings();
    else if (view === 'clients' && clientGames().length) this.showClients();
    else this.showMain();
  }

  /**
   * Christmas: a tree on the floor to the right of the coins and a string of lights draped over
   * the title (both stay for every view of the menu).
   */
  decorate() {
    const { eye, dist } = this;
    const tree = makeTree();
    tree.group.position.set(Math.sin(0.8) * (dist + 0.35), 0, -Math.cos(0.8) * (dist + 0.35));
    tree.group.rotation.y = -0.8;
    // Phones: the menu fills the screen; the tree may stand partly outside it.
    if (this.engine.touchUI) tree.group.userData.noFit = true;
    // A soft shadow grounds it on the (real) floor.
    const blob = contactShadow(0.55, 0.55);
    blob.position.y = 0.003;
    tree.group.add(blob);
    this.group.add(tree.group);
    const lights = makeLightString({ x0: -0.68, x1: 0.68, y: eye + 0.625, z: -dist + 0.03, sag: 0.045, swags: 3, bulbs: 36 });
    this.group.add(lights);
    let time = 0;
    this.onUpdate((dt) => {
      time += dt;
      // The tree stands on the real floor (in the preview: the preview floor).
      tree.group.position.y = this.engine.floorY - this.engine.root.position.y;
      tree.tick(time);
      lights.userData.tick(time);
    });
  }

  /** Puts the 3D coins on the cards once the coin model is loaded (usually preloaded). */
  addCoins(cards, h) {
    const gen = (this.coinGen = (this.coinGen ?? 0) + 1);
    this.coins = [];
    this.onDispose(() => {
      this.coins.forEach((c) => { c.group.removeFromParent(); c.dispose(); });
      this.coins = [];
    });
    loadCoin(this.engine.renderer).then(() => {
      if (this.disposed || gen !== this.coinGen) return;
      for (const { card, g, delay } of cards) {
        if (!card.parent) continue;
        const coin = makeCoin(g.key, COIN_D);
        coin.group.position.set(0, h / 2 - COIN_D / 2, 0.035);
        coin.group.scale.setScalar(0.001);
        card.add(coin.group);
        card.userData.coin = coin;
        this.coins.push(coin);
        this.delay(delay, () => this.tween(0.45, (k) => coin.group.scale.setScalar(Math.max(0.001, k)), { ease: backOut }));
      }
    }).catch((e) => console.warn('Menu coins not loaded', e));
  }

  title(top) {
    // Wide enough for "Echomotion AR Experience" on one line.
    const p = this.add(textPanel(1.3, 0.15, [
      { text: t('menuTitle'), size: 'xr-text-title', weight: 'black', gap: 0.008 },
      { text: `by ${SPONSOR.name} - ${SPONSOR.tagline}`, size: 'xr-text-sm', weight: 'bold', color: color('xr-warning') },
    ]));
    p.position.set(0, top - p.h / 2, -this.dist);
    this.popIn(p);
    return p.position.y - p.h / 2;
  }

  showMain() {
    const { app, dist } = this;
    MenuScene.lastView = 'main';
    this.clearLayer();
    const progress = stats();
    let y = this.title(this.eye + 0.6) - 0.035;
    // Games as coins in the rows of MENU_ROWS, on an arc around the player.
    const w = CARD_W;
    const h = COIN_D + CARD_GAP + Math.max(...GAMES.map((g) => plateHeight(g, w)));
    const step = (w + 0.045) / dist; // angle between cards on the arc
    const footer = (g) => {
      if (g.key === 'review') return t('reviewOpen', { n: progress.review });
      if (g.key === 'robot') return t('robotLevels');
      if (g.key === 'clients') return `${t('newBadge')} · ${t('menuClientsCount', { n: clientGames().length })}`;
      const best = `${t('best')}: ${getBest(g.key)}`;
      return NEW_GAMES.includes(g.key) ? `${t('newBadge')} · ${best}` : best;
    };
    const cards = [];
    let delay = 0.05;
    const label = this.add(textPanel(1.3, 0.045, [{ text: t('menuPlay').toUpperCase(), size: 'xr-text-sm', weight: 'black', color: color('xr-bg-muted') }], { surface: false }));
    label.position.set(0, y - label.h / 2, -dist);
    y -= label.h + 0.01;
    for (const row of menuRows()) {
      row.forEach((g, i) => {
        const card = gameCard(g, w, h, { footer: footer(g), onClick: () => (g.key === 'clients' ? this.showClients() : app.startGame(g.key)) });
        this.add(placeOnArc(card, (i - (row.length - 1) / 2) * step, y - h / 2, dist));
        this.popIn(card, delay);
        cards.push({ card, g, delay });
        delay += 0.04;
      });
      y -= h + 0.025;
    }
    y -= 0.01;
    this.addCoins(cards, h);

    const bw = 0.225;
    const bar = [
      iconButton('trophy', t('leaderboard'), () => app.showLeaderboard(), 'xr-warning', bw),
      iconButton('licence', t('licenceShort'), () => this.showLicence(), 'xr-badge', bw),
      // The AI Lab (360° views, scenes/lab.js) is no longer offered in the menu since Nov 2026.
      iconButton('settings', t('settings'), () => this.showSettings(), 'xr-accent', bw),
      iconButton('exit', this.engine.isXR ? t('exitXR') : t('exit'), () => app.exit(), 'xr-panel-muted', bw),
    ];
    layoutRow(bar, y - 0.065, -dist, 0.02);
    bar.forEach((b) => { this.add(b); this.popIn(b, delay); delay += 0.03; });
    y -= 0.13 + 0.02;

    const sponsor = this.add(textPanel(1.1, 0.06, [
      { text: `${L(SPONSOR.presentedBy)}  ·  ${SPONSOR.domain}`, size: 'xr-text-sm', color: color('xr-bg-muted') },
    ], { surface: false }));
    sponsor.position.set(0, y - sponsor.h / 2, -dist);
    // Echo can be tapped when it flies by: a happy loop.
    app.host?.tappable(this, () => app.echo.celebrate());
  }

  /**
   * The games for our clients (Christmas 2026): a thank-you; every game stands for one of our
   * clients without naming them. Coins in CLIENT_ROWS, a back button to the main view.
   */
  showClients() {
    const { app, dist } = this;
    MenuScene.lastView = 'clients';
    this.clearLayer();
    let y = this.title(this.eye + 0.6) - 0.035;
    const intro = this.add(textPanel(1.1, 0.1, [
      { text: t('menuClients').toUpperCase(), size: 'xr-text-sm', weight: 'black', color: color('xr-warning'), gap: 0.008 },
      { text: t('menuClientsIntro'), size: 'xr-text-sm', color: color('xr-panel-muted') },
    ], { surface: false }));
    intro.position.set(0, y - intro.h / 2, -dist);
    this.popIn(intro);
    y -= intro.h + 0.01;
    const games = clientGames();
    const w = CARD_W;
    const h = COIN_D + CARD_GAP + Math.max(...games.map((g) => plateHeight(g, w)));
    const step = (w + 0.045) / dist;
    const cards = [];
    let delay = 0.05;
    for (const row of clientRows()) {
      row.forEach((g, i) => {
        const card = gameCard(g, w, h, { footer: `${t('best')}: ${getBest(g.key)}`, onClick: () => app.startGame(g.key) });
        this.add(placeOnArc(card, (i - (row.length - 1) / 2) * step, y - h / 2, dist));
        this.popIn(card, delay);
        cards.push({ card, g, delay });
        delay += 0.04;
      });
      y -= h + 0.025;
    }
    this.addCoins(cards, h);
    const bw = 0.225;
    const bar = [
      iconButton('back', t('back'), () => this.showMain(), 'xr-accent', bw),
      iconButton('trophy', t('leaderboard'), () => app.showLeaderboard(), 'xr-warning', bw),
    ];
    layoutRow(bar, y - 0.075, -dist, 0.02);
    bar.forEach((b) => { this.add(b); this.popIn(b, delay); delay += 0.03; });
    app.host?.tappable(this, () => app.echo.celebrate());
  }

  /** AI licence: badges per topic and the certificate for the phone. */
  async showLicence() {
    // Loaded on demand (QR code generator included), the menu itself stays light.
    const { showLicence } = await import('../licence-view.js');
    if (this.disposed) return;
    this.clearLayer();
    showLicence(this, { top: this.title(this.eye + 0.6) - 0.04, onBack: () => this.showMain() });
  }

  /** Settings: language, design and (in the headset) where the content sits in the room. */
  showSettings() {
    const { dist } = this;
    this.clearLayer();
    let y = this.title(this.eye + 0.6) - 0.05;
    const section = (key, buttons) => {
      const label = this.add(textPanel(1.0, 0.045, [{ text: t(key).toUpperCase(), size: 'xr-text-sm', weight: 'black', color: color('xr-bg-muted') }], { surface: false }));
      label.position.set(0, y - label.h / 2, -dist);
      y -= label.h + 0.01;
      const bh = Math.max(...buttons.map((b) => b.h));
      layoutRow(buttons, y - bh / 2, -dist, 0.02);
      buttons.forEach((b, i) => { this.add(b); this.popIn(b, 0.03 * i); });
      y -= bh + 0.035;
    };
    // Two small sections side by side (label above its buttons), to keep the screen short.
    const sectionPair = (cols) => {
      const colW = 0.5;
      const bh = Math.max(...cols.flatMap(([, buttons]) => buttons.map((b) => b.h)));
      let lh = 0;
      cols.forEach(([key, buttons], c) => {
        const x = (c - (cols.length - 1) / 2) * colW;
        const label = this.add(textPanel(colW - 0.02, 0.045, [{ text: t(key).toUpperCase(), size: 'xr-text-sm', weight: 'black', color: color('xr-bg-muted') }], { surface: false }));
        label.position.set(x, y - label.h / 2, -dist);
        lh = Math.max(lh, label.h);
        layoutRow(buttons, y - label.h - 0.01 - bh / 2, -dist, 0.02);
        buttons.forEach((b, i) => { b.position.x += x; this.add(b); this.popIn(b, 0.03 * i); });
      });
      y -= lh + 0.01 + bh + 0.035;
    };
    const rebuild = (fn) => { MenuScene.reopen = 'settings'; fn(); this.app.showMenu(); };

    const langs = [['de', 'Deutsch'], ['en', 'English']].map(([code, name]) => {
      const b = new Button(0.28, 0.1, { label: name, labelSize: 'xr-text-sm', onClick: () => rebuild(() => setLang(code)) });
      b.set({ status: getLang() === code ? 'selected' : null });
      return b;
    });
    section('settingsLang', langs);

    // Design: only the night look is offered since November 2026 (SKINS in skin.js), so there
    // is nothing to choose here any more.
    const skins = SKINS.length > 1 ? SKINS.map((key) => {
      const b = new Button(0.28, 0.1, { label: t(key === 'sunny' ? 'skinSunny' : 'skinNight'), labelSize: 'xr-text-sm', onClick: () => { if (getSkin() !== key) rebuild(() => setSkin(key)); } });
      b.set({ status: getSkin() === key ? 'selected' : null });
      return b;
    }) : [];
    if (skins.length) section('design', skins);

    const echo = this.app.echo;
    if (echo) {
      const opts = [[true, 'echoOn'], [false, 'echoOff']].map(([on, key]) => {
        const b = new Button(0.28, 0.1, { label: t(key), labelSize: 'xr-text-sm', onClick: () => rebuild(() => echo.setEnabled(on)) });
        b.set({ status: echo.enabled === on ? 'selected' : null });
        return b;
      });
      // Echo's tour can be replayed from here.
      opts.push(new Button(0.3, 0.1, { label: t('settingsTour'), labelSize: 'xr-text-sm', variant: 'sponsor', onClick: () => this.app.startTour() }));
      section('settingsEcho', opts);
    }

    const fx = [['full', 'fxFull'], ['lite', 'fxLite']].map(([key, label]) => {
      const b = new Button(0.28, 0.1, { label: t(label), labelSize: 'xr-text-sm', onClick: () => rebuild(() => quality.set(key)) });
      b.set({ status: quality.level === key ? 'selected' : null });
      return b;
    });
    section('settingsFx', fx);
    const fpsOpts = [[true, 'on'], [false, 'off']].map(([on, label]) => {
      const b = new Button(0.2, 0.1, { label: t(label), labelSize: 'xr-text-sm', onClick: () => rebuild(() => quality.setFps(on)) });
      b.set({ status: quality.fps === on ? 'selected' : null });
      return b;
    });
    const musicOpts = [[true, 'on'], [false, 'off']].map(([on, label]) => {
      const b = new Button(0.2, 0.1, { label: t(label), labelSize: 'xr-text-sm', onClick: () => rebuild(() => music.setEnabled(on)) });
      b.set({ status: music.enabled === on ? 'selected' : null });
      return b;
    });
    sectionPair([['settingsMusic', musicOpts], ['settingsFps', fpsOpts]]);

    if (this.engine.isXR) {
      const room = [];
      if (this.engine.canPlace) room.push(new Button(0.3, 0.1, { label: t('placeRoom'), labelSize: 'xr-text-sm', variant: 'sponsor', onClick: () => this.place() }));
      room.push(new Button(0.27, 0.1, { label: t('recenter'), labelSize: 'xr-text-sm', onClick: () => this.engine.recenter() }));
      room.push(new Button(0.18, 0.1, { label: t('higher'), labelSize: 'xr-text-sm', onClick: () => this.engine.adjustHeight(0.1) }));
      room.push(new Button(0.18, 0.1, { label: t('lower'), labelSize: 'xr-text-sm', onClick: () => this.engine.adjustHeight(-0.1) }));
      section('settingsRoom', room);
    }

    const back = iconButton('back', t('back'), () => this.showMain());
    back.position.set(0, y - 0.065, -dist);
    this.add(back);
    this.popIn(back, 0.1);
    // Build version: shows at a glance whether the headset runs the latest deploy.
    const ver = this.add(textPanel(0.8, 0.04, [{ text: `${t('version')} ${VERSION}`, size: 'xr-text-sm', color: color('xr-bg-muted') }], { surface: false }));
    ver.position.set(0, y - 0.13 - 0.045, -dist);
  }

  /** AR: hides the menu and lets the player anchor the content on a real surface. */
  place() {
    const { eye, dist } = this;
    this.layer.visible = false;
    const hint = this.add(textPanel(0.9, 0.2, [
      { text: t('placeRoom'), size: 'xr-text-lg', weight: 'bold', gap: 0.02 },
      { text: t('placeHint'), size: 'xr-text-md', color: color('xr-panel-muted') },
    ]), this.group);
    hint.position.set(0, eye + 0.1, -dist);
    const cancel = this.add(new Button(0.3, 0.11, { label: t('cancel'), onClick: () => this.engine.cancelPlacement() }), this.group);
    cancel.position.set(0, hint.position.y - hint.h / 2 - 0.08, -dist);
    this.engine.startPlacement(() => { if (!this.disposed) this.app.showMenu(); });
    this.onDispose(() => this.engine.cancelPlacement());
  }
}
