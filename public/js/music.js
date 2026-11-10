// Background music: Echomotion's recorded tracks (TRACKS in config.js). They are streamed through
// two <audio> elements, so no large decoded buffers sit in memory, and run as a playlist in random
// order: shuffled for every game, crossfading from track to track, reshuffled after each round
// through all tracks, and never starting with (or repeating) the track that was just heard.
// The level follows the game: calm under quizzes, a little louder in exciting moments. Everything
// runs through one master gain (ducking, fades).
// Christmas edition (SEASON 'christmas', XMAS_SONGS in config.js): each game starts with its own
// song, the app with "Danke"; after the song "EN" follows, then the two take turns.
import { audioContext } from './sfx.js';
import { TRACKS, SEASON, XMAS_SONGS, XMAS_MORE } from './config.js';

const KEY = 'kiar.music';
// Master gain per intensity: -1 calm (quizzes, reading), 0 normal, 1 and 2 a little louder.
const LEVEL = { '-1': 0.17, 0: 0.26, 1: 0.3, 2: 0.34 };
const FADE = 2; // crossfade between tracks (s)

// A tiny silent WAV (8 kHz, 8 bit, 50 ms) to unlock the audio elements during a user gesture.
const SILENCE = (() => {
  const n = 400;
  const b = new Uint8Array(44 + n);
  const v = new DataView(b.buffer);
  const str = (o, x) => [...x].forEach((c, i) => { b[o + i] = c.charCodeAt(0); });
  str(0, 'RIFF'); v.setUint32(4, 36 + n, true); str(8, 'WAVEfmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true); v.setUint16(34, 8, true); str(36, 'data'); v.setUint32(40, n, true);
  b.fill(128, 44);
  return `data:audio/wav;base64,${btoa(String.fromCharCode(...b))}`;
})();

const abs = (url) => new URL(url, document.baseURI).href;

/** All tracks in a random order (Fisher-Yates); `not` (the track just heard) never comes first. */
function shuffled(not) {
  const a = [...TRACKS];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  if (a.length > 1 && a[0] === not) [a[0], a[1]] = [a[1], a[0]];
  return a;
}

const XMAS = SEASON === 'christmas';
const song = (name) => `assets/music/${name}.mp3`;

/** A game's playlist: in the Christmas edition its own song and then "EN"; else all tracks shuffled. */
function playlist(key, not) {
  if (XMAS && XMAS_SONGS[key]) return [song(XMAS_SONGS[key]), song(XMAS_MORE)];
  return shuffled(not);
}

/** Christmas edition: the song a game starts with (null: the shuffled playlist). */
const ownSong = (key) => (XMAS && XMAS_SONGS[key]) || null;

export class Music {
  constructor() {
    this.on = false; // sound is running
    this.wanted = false; // a game asked for music (start until stop)
    this._intensity = 0;
    this.track = null; // the game that asked for music
    this.list = []; // the playlist (grows by a fresh shuffle when it runs out)
    this.pending = null; // the shuffled list prepared for the next start
    this.last = null; // the track heard last (a new playlist never starts with it)
    this.pos = 0; // index of the playing track in the playlist
    this.gen = 0;
    try { this.enabled = localStorage.getItem(KEY) !== 'off'; } catch { this.enabled = true; }
  }

  /** The music switch (settings, Pong): off silences at once, on resumes a running game's music. */
  setEnabled(v) {
    this.enabled = v;
    try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch { /* private mode */ }
    if (v && this.wanted) this.play();
    else if (!v) this.halt();
  }

  get intensity() {
    return this._intensity;
  }

  /** -1..2: calm under quizzes, a little louder in exciting moments. */
  set intensity(v) {
    if (v === this._intensity) return;
    this._intensity = v;
    if (this.on && !(this.duckUntil > this.ctx.currentTime)) {
      const g = this.master.gain;
      const t = this.ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(Math.max(0.0001, g.value), t);
      g.linearRampToValueAtTime(this.level(), t + 1.2);
    }
  }

  /** Master gain for the current intensity. */
  level() {
    return LEVEL[Math.max(-1, Math.min(2, Math.round(this._intensity)))];
  }

  /**
   * A game (key) will want music: while it plays already, the playlist simply goes on, unless the
   * game has a song of its own (Christmas edition): then that song starts.
   */
  useTrack(key) {
    const switching = this.on && key && key !== this.track && ownSong(key) && ownSong(key) !== ownSong(this.track);
    this.track = key || null;
    if (switching) this.halt();
    if (key && !this.on) this.prepare();
  }

  /** Christmas edition: "Danke" when the app opens (the menu is quiet otherwise). */
  welcome() {
    if (!ownSong('start')) return;
    this.intensity = 0;
    this.useTrack('start');
    this.start();
  }

  /** Makes sure the playlist reaches index n (appends the game's list again). */
  ensure(n) {
    while (this.list.length <= n) this.list.push(...playlist(this.track, this.list[this.list.length - 1] ?? this.last));
  }

  /** The two <audio> elements that play every track (crossfade between them). */
  pair() {
    if (!this.els) {
      this.els = [0, 1].map(() => {
        const a = new Audio();
        a.preload = 'auto';
        return a;
      });
    }
    const ctx = audioContext();
    if (ctx && !this.srcs) {
      // An <audio> element can feed the audio graph only once: sources and gains are made once.
      this.srcs = this.els.map((a) => ctx.createMediaElementSource(a));
      this.gains = this.srcs.map((src) => { const g = ctx.createGain(); g.gain.value = 0; src.connect(g); return g; });
    }
    return this.els;
  }

  /** Points an element at a track and starts buffering it, unless it already holds it. */
  load(a, url) {
    if (a.src === abs(url)) return;
    a.src = url;
    a.load();
  }

  /** Makes the next playlist (for key) and buffers its first two tracks (e.g. during a game's intro). */
  prepare(key = this.track) {
    if (this.on) return; // never reload an element that is playing
    const els = this.pair();
    if (!this.pending || this.pendingKey !== key) {
      // A shuffled list stays the same for every game; a list with a game's own song does not.
      if (!this.pending || ownSong(key) || ownSong(this.pendingKey)) this.pending = playlist(key, this.last);
      this.pendingKey = key;
    }
    const list = this.pending;
    this.load(els[0], list[0]);
    this.load(els[1], list[1 % list.length]);
  }

  /**
   * Call inside a real user gesture (a click on Start): plays the elements silently for a moment,
   * so browsers that require a gesture per element (Safari on iPhone and iPad) allow them later.
   */
  unlock() {
    const els = this.pair();
    if (this.unlocked) return;
    this.unlocked = true;
    els.forEach((a) => {
      if (!a.src) a.src = SILENCE;
      a.muted = true;
      // Only the silent unlock sound is paused: a song started meanwhile (the welcome song) plays on.
      const done = () => { a.muted = false; if (a.src === SILENCE) a.pause(); };
      a.play().then(done, done);
    });
  }

  /** Plays an element; when the browser blocks it, it tries again on the next tap or key. */
  playEl(a) {
    a.play().then(() => { this.blocked = false; }).catch((e) => {
      console.warn('Music: playback failed', e?.name ?? e);
      if (e?.name !== 'NotAllowedError' || this.retryArmed) return;
      this.blocked = true;
      this.retryArmed = true;
      const retry = () => {
        window.removeEventListener('pointerdown', retry, true);
        window.removeEventListener('keydown', retry, true);
        this.retryArmed = false;
        if (this.on && this.els[this.cur].paused) this.playEl(this.els[this.cur]);
      };
      window.addEventListener('pointerdown', retry, true);
      window.addEventListener('keydown', retry, true);
    });
  }

  /** A game wants music: plays its playlist (if the music switch is on). */
  start() {
    this.wanted = true;
    this.play();
  }

  /** The game is over or left: fades the music out. */
  stop() {
    this.wanted = false;
    this.halt();
  }

  /** Plays the playlist from its first track; a watcher crossfades into the next one. */
  play() {
    if (!this.enabled || this.on || !this.track) return;
    const ctx = audioContext();
    if (!ctx) return;
    this.ctx = ctx;
    this.gen += 1;
    this.master = ctx.createGain();
    this.master.gain.value = 0.0001;
    this.master.gain.exponentialRampToValueAtTime(this.level(), ctx.currentTime + 1.5);
    this.master.connect(ctx.destination);
    this.prepare();
    this.list = this.pending;
    this.pending = null;
    this.last = this.list[0];
    const els = this.pair();
    const t = ctx.currentTime;
    this.gains.forEach((g, i) => {
      g.disconnect();
      g.connect(this.master);
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(i === 0 ? 1 : 0, t);
    });
    els.forEach((a) => a.pause());
    this.cur = 0;
    this.pos = 0;
    this.fading = false;
    els[0].currentTime = 0;
    this.playEl(els[0]);
    this.on = true;
    this.timer = setInterval(() => this.watch(), 200);
  }

  /** Near the end of a track: crossfade into the next one in the other element. */
  watch() {
    const a = this.els[this.cur];
    if (this.fading || !a.duration || a.paused || a.currentTime < a.duration - FADE) return;
    const next = 1 - this.cur;
    const b = this.els[next];
    b.currentTime = 0;
    this.playEl(b);
    const t = this.ctx.currentTime;
    const out = this.gains[this.cur].gain;
    const inn = this.gains[next].gain;
    out.setValueAtTime(1, t);
    out.linearRampToValueAtTime(0, t + FADE);
    inn.setValueAtTime(0, t);
    inn.linearRampToValueAtTime(1, t + FADE);
    this.cur = next;
    this.pos += 1;
    this.ensure(this.pos + 1);
    this.last = this.list[this.pos];
    this.fading = true;
    const gen = this.gen;
    setTimeout(() => {
      this.fading = false;
      if (gen !== this.gen) return;
      a.pause();
      // The free element buffers the track after the one now playing.
      this.load(a, this.list[this.pos + 1]);
    }, FADE * 1000 + 150);
  }

  /** Fades the sound out and pauses the elements (the game may still want music later). */
  halt() {
    if (!this.on) return;
    this.on = false;
    clearInterval(this.timer);
    const m = this.master;
    const t = this.ctx.currentTime;
    m.gain.cancelScheduledValues(t);
    m.gain.setValueAtTime(Math.max(0.0001, m.gain.value), t);
    m.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    const gen = this.gen;
    setTimeout(() => {
      m.disconnect();
      // Pause after the fade, unless the music started again meanwhile.
      if (gen === this.gen) this.els?.forEach((a) => a.pause());
    }, 1000);
  }

  /** Lowers the music for a few seconds (e.g. while the announcer speaks). */
  duck(seconds) {
    if (!this.on || !this.master) return;
    const g = this.master.gain;
    const t0 = this.ctx.currentTime;
    const base = this.level();
    const low = base * 0.32;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(Math.max(0.0001, g.value), t0);
    g.linearRampToValueAtTime(low, t0 + 0.12);
    g.setValueAtTime(low, t0 + seconds);
    g.linearRampToValueAtTime(base, t0 + seconds + 0.5);
    this.duckUntil = t0 + seconds + 0.5;
  }
}

export const music = new Music();
