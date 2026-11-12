import { Engine } from './engine.js';
import { MenuScene } from './scenes/menu.js';
import { LeaderboardScene } from './scenes/leaderboard.js';
import { LabScene } from './scenes/lab.js';
import { t, L, getLang, setLang, onLangChange } from './i18n.js';
import { LAB_IMAGES } from './content.js';
import { LEADERBOARD_MODES, OVERALL, fetchTop, track } from './api.js';
import { sfx } from './sfx.js';
import { music } from './music.js';
import { VERSION } from './version.js';
import { VISIBLE_MODES, CLIENT_GAMES } from './config.js';
import { readLink } from './deep-link.js';
import { CARD_ART } from './menu-coins.js';
import { getSkin, setSkin, onSkinChange, loadSkinFonts } from './skin.js';
import { iconSVG } from './icons.js';
import { EchoMascot } from './echo-mascot.js';
import { preloadModels } from './models.js';
import { FpsMeter } from './fps.js';
import { EchoHost } from './echo-host.js';
import { OnboardScene, setOnboarded } from './scenes/onboard.js';
import { AttractScene } from './scenes/attract.js';
import { EVENT, EventKiosk } from './event.js';
import { CHRISTMAS } from './christmas.js';
import { decoratePage } from './xmas-page.js';

// Games load on demand, so the first load only holds the menu, Echo and the shared parts.
// Each entry resolves to a scene factory.
const SCENES = {
  quiz: () => import('./scenes/quiz.js').then((m) => (app) => new m.QuizScene(app, 'quiz')),
  review: () => import('./scenes/quiz.js').then((m) => (app) => new m.QuizScene(app, 'review')),
  robot: () => import('./scenes/robot.js').then((m) => (app) => new m.RobotScene(app)),
  parkour: () => import('./scenes/parkour.js').then((m) => (app) => new m.ParkourScene(app, 1)),
  // Echo Parkour: level 1 forest ('parkour'), level 2 city ('parkour3'), level 3 office ('parkour2')
  parkour3: () => import('./scenes/parkour.js').then((m) => (app) => new m.ParkourScene(app, 2)),
  parkour2: () => import('./scenes/parkour.js').then((m) => (app) => new m.ParkourScene(app, 3)),
  pong: () => import('./scenes/pong.js').then((m) => (app) => new m.PongScene(app)),
  dataflight: () => import('./scenes/dataflight.js').then((m) => (app) => new m.DataflightScene(app)),
  arch: () => import('./scenes/arch.js').then((m) => (app) => new m.ArchScene(app)),
  fight: () => import('./scenes/fight.js').then((m) => (app) => new m.FightScene(app)),
  factmyth: () => import('./scenes/factmyth.js').then((m) => (app) => new m.FactMythScene(app)),
  sort: () => import('./scenes/sort.js').then((m) => (app) => new m.SortScene(app)),
  timeline: () => import('./scenes/timeline.js').then((m) => (app) => new m.TimelineScene(app)),
  // Games for our clients (CLIENT_GAMES in config.js)
  bike: () => import('./scenes/bike.js').then((m) => (app) => new m.BikeScene(app)),
  roast: () => import('./scenes/roast.js').then((m) => (app) => new m.RoastScene(app)),
  bricks: () => import('./scenes/bricks.js').then((m) => (app) => new m.BricksScene(app)),
  green: () => import('./scenes/green.js').then((m) => (app) => new m.GreenScene(app)),
  dock: () => import('./scenes/dock.js').then((m) => (app) => new m.DockScene(app)),
  pinball: () => import('./scenes/pinball.js').then((m) => (app) => new m.PinballScene(app)),
  summit: () => import('./scenes/summit.js').then((m) => (app) => new m.SummitScene(app)),
};

/** Fetches the visible games one after another in idle time, so they open without waiting. */
function prefetchScenes() {
  return VISIBLE_MODES.filter((k) => SCENES[k]).reduce((chain, k) => chain.then(() => SCENES[k]().catch(() => null)), Promise.resolve());
}

class App {
  constructor() {
    this.stage = document.getElementById('stage');
    this.engine = new Engine(this.stage);
    this.engine.onXREnd = () => this.closeStage();
    // Echo, the mascot, flies around the player in every scene (it stays out of the view).
    this.echo = new EchoMascot(this.engine);
    this.engine.updaters.add((dt) => this.echo.update(dt));
    // Warm the caches in the background (models, then game code) so games open without waiting.
    setTimeout(() => preloadModels().then(prefetchScenes), 1500);
    this.fps = new FpsMeter(this.engine);
    this.host = new EchoHost(this);
    // Event mode: attract screen between guests, reset after inactivity.
    this.visitActive = !EVENT;
    if (EVENT) this.kiosk = new EventKiosk(this);
    this.current = null;
  }

  show(factory) {
    this.nav = (this.nav ?? 0) + 1;
    this.current?.dispose();
    this.current = factory(this);
    this.engine.root.add(this.current.group);
  }

  /**
   * The lobby (the 3D menu). Every start goes straight there; Echo's tour runs only when it is
   * asked for in the settings (startTour).
   */
  showMenu() {
    if (this.tourWanted) {
      this.tourWanted = false;
      this.show((app) => new OnboardScene(app));
    } else this.show((app) => new MenuScene(app));
  }

  /** Start screen: the attract loop between guests in event mode, else the menu. */
  showHome() {
    if (EVENT && !this.visitActive) this.show((app) => new AttractScene(app));
    else this.showMenu();
    // Christmas edition: "Danke" plays when the app opens (once per visit to the 3D view).
    if (!this.welcomed) { this.welcomed = true; music.welcome(); }
    // A direct link (?spiel=...) or a game picked on the page: straight into that game, once.
    // Afterwards the menu opens the clients' view for their games.
    const game = this.pendingGame;
    if (game && !EVENT) {
      this.pendingGame = null;
      if (CLIENT_GAMES.includes(game)) MenuScene.lastView = 'clients';
      this.startGame(game);
    }
  }

  /** Event mode: a new guest starts (straight into the lobby). */
  startVisit() {
    this.visitActive = true;
    track('guest', '-', true);
    this.showMenu();
  }

  /** Replays Echo's tour (settings). */
  startTour() {
    setOnboarded(false);
    this.tourWanted = true;
    this.showMenu();
  }

  showLab(index = 0) {
    this.show((app) => new LabScene(app, index));
  }

  showLeaderboard(mode) {
    this.show((app) => new LeaderboardScene(app, mode));
  }

  async startGame(key) {
    // Load the game's code (usually prefetched already); skip if the player went elsewhere meanwhile.
    const nav = (this.nav = (this.nav ?? 0) + 1);
    let factory;
    try { factory = await SCENES[key](); } catch (e) { console.error(e); return; }
    if (nav !== this.nav) return;
    this.currentGame = key;
    track('start', key, EVENT);
    this.show(factory);
  }

  async enterXR(mode) {
    sfx.unlock();
    music.unlock(); // inside the click: lets the recorded music play later on every browser
    try {
      await this.engine.enterXR(mode);
      document.body.classList.add('is-xr');
      track('session', '-', EVENT);
      this.showHome();
    } catch (err) {
      console.error(err);
      setStatus('xrFailed', 'is-error');
    }
  }

  /**
   * Opens the 3D view in the browser (the lobby, or the AI Lab). gesture: called inside a tap or
   * click; at the app start it is not, so sound and full screen wait for the first tap.
   */
  openPreview(labIndex = null, { gesture = true } = {}) {
    const unlock = () => {
      sfx.unlock();
      music.unlock(); // inside a tap: lets the recorded music play later on every browser
      // Phones: full screen without the browser bars (where the browser allows it, e.g. Android).
      if (this.engine.touchUI && !this.stage.hidden && !document.fullscreenElement) {
        const go = this.stage.requestFullscreen ?? this.stage.webkitRequestFullscreen;
        try { go?.call(this.stage, { navigationUI: 'hide' })?.catch?.(() => {}); } catch { /* not allowed */ }
      }
    };
    if (gesture) unlock();
    else {
      const first = (e) => {
        window.removeEventListener('pointerdown', first, true);
        window.removeEventListener('keydown', first, true);
        unlock();
      };
      window.addEventListener('pointerdown', first, true);
      window.addEventListener('keydown', first, true);
    }
    document.body.classList.add('is-playing');
    this.stage.hidden = false;
    this.engine._fit();
    this.engine.recenter();
    track('session', '-', EVENT);
    if (labIndex === null) this.showHome();
    else this.showLab(labIndex);
    this.engine.start();
  }

  exit() {
    if (this.engine.isXR) this.engine.exitXR();
    else this.closeStage();
  }

  closeStage() {
    this.nav = (this.nav ?? 0) + 1;
    this.current?.dispose();
    this.current = null;
    music.stop();
    this.welcomed = false; // the next visit to the 3D view starts with the welcome song again
    this.engine.stop();
    this.stage.hidden = true;
    if (document.fullscreenElement) document.exitFullscreen?.().catch?.(() => {});
    document.body.classList.remove('is-playing', 'is-xr');
    loadPageLeaderboard();
  }
}

// ---------- landing page ----------

function applyPageLang() {
  document.documentElement.lang = getLang();
  document.title = t('appTitle');
  // The Christmas edition has its own welcome texts (data-i18n-xmas).
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(CHRISTMAS && el.dataset.i18nXmas ? el.dataset.i18nXmas : el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-alt]').forEach((el) => { el.alt = t(el.dataset.i18nAlt); });
  document.querySelectorAll('[data-lang]').forEach((el) => {
    el.setAttribute('aria-pressed', String(el.dataset.lang === getLang()));
  });
  document.querySelectorAll('.lab-thumb[data-lab-open]').forEach((el) => {
    const caption = L(LAB_IMAGES[Number(el.dataset.labOpen)].caption);
    el.setAttribute('aria-label', `${t('labOpenBrowser')}: ${caption}`);
    el.querySelector('img').alt = caption;
  });
  if (statusKey) setStatus(statusKey, statusClass);
  loadPageLeaderboard();
}

let statusKey = null;
let statusClass = '';
function setStatus(key, cls = '') {
  statusKey = key;
  statusClass = cls;
  const el = document.getElementById('status');
  el.textContent = t(key);
  el.className = `status ${cls}`;
}

async function detectXR() {
  const ar = document.getElementById('btn-ar');
  const vr = document.getElementById('btn-vr');
  let arOk = false;
  let vrOk = false;
  if (navigator.xr && window.isSecureContext) {
    try { arOk = await navigator.xr.isSessionSupported('immersive-ar'); } catch { /* unsupported */ }
    try { vrOk = await navigator.xr.isSessionSupported('immersive-vr'); } catch { /* unsupported */ }
  }
  ar.hidden = !arOk;
  vr.hidden = !vrOk;
  vr.classList.toggle('btn--primary', !arOk);
  vr.classList.toggle('btn--secondary', arOk);
  if (arOk) setStatus('supportAR', 'is-ok');
  else if (vrOk) setStatus('supportVR', 'is-ok');
  else setStatus('supportNone');
}

// HTML leaderboard on the landing page (same data as in AR).
let lbMode = OVERALL;
let lbRequest = 0;
async function loadPageLeaderboard() {
  const list = document.getElementById('lb-list');
  if (!list) return;
  document.querySelectorAll('[data-lb]').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.lb === lbMode)));
  const note = document.getElementById('lb-note');
  if (note) note.hidden = lbMode !== OVERALL;
  const req = ++lbRequest;
  list.innerHTML = `<li class="lb__state">${t('loading')}</li>`;
  try {
    const data = await fetchTop(lbMode);
    if (req !== lbRequest) return;
    if (!data.top.length) {
      list.innerHTML = `<li class="lb__state">${t('lbEmpty')}</li>`;
      return;
    }
    list.innerHTML = '';
    data.top.forEach((r) => {
      const li = document.createElement('li');
      li.className = `lb__row${r.rank <= 3 ? ' lb__row--top' : ''}`;
      const rank = document.createElement('span');
      rank.className = 'lb__rank';
      rank.textContent = `${r.rank}.`;
      const name = document.createElement('span');
      name.className = 'lb__name';
      name.textContent = r.name;
      if (lbMode === OVERALL && r.games) {
        const meta = document.createElement('small');
        meta.className = 'lb__meta';
        meta.textContent = t('overallGames', { n: r.games, total: data.games ?? r.games });
        name.append(meta);
      }
      const score = document.createElement('span');
      score.className = 'lb__score';
      score.textContent = r.score;
      li.append(rank, name, score);
      list.append(li);
    });
  } catch {
    if (req === lbRequest) list.innerHTML = `<li class="lb__state lb__state--error">${t('lbError')}</li>`;
  }
}

// ---------- direct links and the clients' games on the page ----------

/**
 * A direct link (?spiel=pannenfrei&fuer=Team%20Nord&score=3200) shows a personal invitation in
 * the hero and opens that game (in the browser and in the headset); the clients' section lists
 * their seven games as coins that open the game directly.
 */
function setupClientGames(app) {
  const link = readLink();
  const invite = document.getElementById('invite');
  if (link && invite) {
    app.pendingGame = link.game;
    const render = () => {
      const game = t(`${link.game}Name`);
      document.getElementById('invite-coin').src = CARD_ART[link.game] ?? CARD_ART.clients;
      document.getElementById('invite-title').textContent = link.name ? t('inviteGreeting', { name: link.name }) : game;
      document.getElementById('invite-text').textContent = link.score
        ? t('inviteScore', { score: link.score.toLocaleString(getLang() === 'de' ? 'de-DE' : 'en-US'), game })
        : t('inviteText', { game });
      document.getElementById('invite-play').textContent = t('invitePlay', { game });
    };
    render();
    onLangChange(render);
    invite.hidden = false;
    document.getElementById('invite-play').addEventListener('click', () => { app.pendingGame = link.game; app.openPreview(); });
  }
  const section = document.getElementById('clients');
  const grid = document.getElementById('clients-grid');
  const games = CLIENT_GAMES.filter((k) => VISIBLE_MODES.includes(k));
  if (!section || !grid || !games.length) return;
  const build = () => {
    grid.replaceChildren(...games.map((key) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'clients__item';
      const img = Object.assign(document.createElement('img'), { className: 'clients__coin', src: CARD_ART[key] ?? '', width: 104, height: 104, alt: '', loading: 'lazy', decoding: 'async' });
      const name = Object.assign(document.createElement('span'), { className: 'clients__name', textContent: t(`${key}Name`) });
      const tag = Object.assign(document.createElement('span'), { className: 'clients__tag', textContent: t(`${key}Tag`) });
      b.append(img, name, tag);
      b.setAttribute('aria-label', `${t('clientsPlay')}: ${t(`${key}Name`)}`);
      b.addEventListener('click', () => { app.pendingGame = key; app.openPreview(); });
      li.append(b);
      return li;
    }));
  };
  build();
  onLangChange(build);
  section.hidden = false;
}

async function boot() {
  await loadSkinFonts();

  const app = new App();
  const applySkinUi = () => {
    document.querySelectorAll('[data-skin-btn]').forEach((el) => el.setAttribute('aria-pressed', String(el.dataset.skinBtn === getSkin())));
  };
  applySkinUi();
  onSkinChange(() => {
    applySkinUi();
    app.engine.applySkin();
    if (app.current) app.showMenu();
  });
  document.querySelectorAll('[data-skin-btn]').forEach((el) => el.addEventListener('click', () => setSkin(el.dataset.skinBtn)));
  if (CHRISTMAS) decoratePage();
  applyPageLang();
  onLangChange(applyPageLang);
  document.querySelectorAll('[data-lang]').forEach((el) => el.addEventListener('click', () => setLang(el.dataset.lang)));
  document.querySelectorAll('[data-lb]').forEach((el) => el.addEventListener('click', () => {
    if (LEADERBOARD_MODES.includes(el.dataset.lb)) { lbMode = el.dataset.lb; loadPageLeaderboard(); }
  }));
  document.getElementById('btn-ar').addEventListener('click', () => app.enterXR('immersive-ar'));
  document.getElementById('btn-vr').addEventListener('click', () => app.enterXR('immersive-vr'));
  document.getElementById('btn-preview').addEventListener('click', () => app.openPreview());
  setupClientGames(app);
  document.querySelectorAll('[data-lab-open]').forEach((el) => el.addEventListener('click', () => app.openPreview(Number(el.dataset.labOpen))));
  document.getElementById('btn-close').addEventListener('click', () => app.closeStage());
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !app.stage.hidden) app.closeStage(); });
  document.querySelectorAll('[data-mode]').forEach((el) => { el.hidden = !VISIBLE_MODES.includes(el.dataset.mode); });
  // Game icons (same drawings as in the 3D menu).
  document.querySelectorAll('article[data-mode]').forEach((el) => {
    if (el.querySelector('.card__icon')) return;
    const icon = document.createElement('span');
    icon.className = 'card__icon';
    icon.innerHTML = iconSVG(el.dataset.mode, 28);
    el.prepend(icon);
  });
  document.querySelectorAll('[data-lb]').forEach((el) => { el.hidden = !LEADERBOARD_MODES.includes(el.dataset.lb); });
  detectXR();


  if (new URLSearchParams(location.search).has('debug')) window.__kiar = app;
  console.info(`Echomotion AR Experience ${VERSION}`);
}

boot();
