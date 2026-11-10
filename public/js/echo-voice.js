// Echo's voice: short bat chirps, synthesized and played where Echo is (HRTF panning).
// Recorded lines are optional: list them in assets/sounds/echo/clips.json as
//   { "<line id>": { "de": "hello-de.mp3", "en": "hello-en.mp3" } }
// (files next to clips.json). A line without a recording is "spoken" as a chirp melody that
// follows the rhythm of the text, so Echo always sounds like Echo and never like a browser voice.
import { audioContext } from './sfx.js';
import { spatialOut } from './room-utils.js';
import { getLang } from './i18n.js';

const BASE = 'assets/sounds/echo/';
let manifest = null;
const buffers = new Map();

function loadManifest() {
  manifest ??= fetch(`${BASE}clips.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
  return manifest;
}

async function clipFor(id) {
  const list = await loadManifest();
  const file = list?.[id]?.[getLang()];
  if (!file || !/^[\w.-]+\.(mp3|ogg|m4a|wav)$/.test(file)) return null;
  const ctx = audioContext();
  if (!ctx) return null;
  if (!buffers.has(file)) {
    buffers.set(file, fetch(BASE + file)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((b) => (b ? ctx.decodeAudioData(b) : null))
      .catch(() => null));
  }
  return buffers.get(file);
}

/** One chirp: a fast sweep with a soft overtone, at a world position. */
function chirp(engine, pos, f0, f1, dur, gain, delay) {
  const out = spatialOut(engine, pos);
  if (!out) return;
  const { a, p } = out;
  const t0 = a.currentTime + delay;
  for (const [type, k, g] of [['sine', 1, gain], ['triangle', 2, gain * 0.18]]) {
    const o = a.createOscillator();
    const v = a.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0 * k, t0);
    o.frequency.exponentialRampToValueAtTime(f1 * k, t0 + dur);
    v.gain.setValueAtTime(0.0001, t0);
    v.gain.exponentialRampToValueAtTime(g, t0 + Math.min(0.012, dur * 0.3));
    v.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(v).connect(p);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }
}

// Little phrases: [delay, f0, f1, duration]
const PHRASES = {
  hello: [[0, 2100, 3300, 0.07], [0.12, 2500, 3900, 0.09]],
  happy: [[0, 2200, 2900, 0.05], [0.07, 2500, 3300, 0.05], [0.14, 2800, 3800, 0.06], [0.23, 3200, 4300, 0.09]],
  sad: [[0, 2700, 1700, 0.2], [0.26, 2000, 1300, 0.26]],
  tap: [[0, 2600, 4100, 0.05], [0.08, 3400, 2600, 0.06]],
  question: [[0, 2200, 2000, 0.06], [0.1, 2100, 3400, 0.12]],
};

export const echoVoice = {
  /** A short phrase (hello, happy, sad, tap, question) at a world position. */
  chirp(engine, pos, kind = 'hello', gain = 0.2) {
    for (const [d, f0, f1, dur] of PHRASES[kind] ?? PHRASES.hello) chirp(engine, pos, f0, f1, dur, gain, d);
  },

  /**
   * Speaks a line: the recording if there is one, else chirp syllables in the rhythm of the
   * text. onSyllable(delaySeconds) is called for each syllable (to move the mouth).
   * Returns the duration in seconds.
   */
  async talk(engine, pos, { id = null, text = '', gain = 0.16, onSyllable = null } = {}) {
    const buf = id ? await clipFor(id) : null;
    const a = audioContext();
    if (buf && a) {
      const out = spatialOut(engine, pos);
      if (out) {
        const src = a.createBufferSource();
        src.buffer = buf;
        src.connect(out.p);
        src.start();
        for (let s = 0; s < buf.duration; s += 0.22) onSyllable?.(s);
        return buf.duration;
      }
    }
    // Chirp melody: about one syllable per word (at most 9), a rising end for questions.
    const words = text.split(/\s+/).filter(Boolean).length;
    const n = Math.max(2, Math.min(9, Math.round(words * 0.7)));
    const question = /\?\s*$/.test(text);
    let at = 0;
    for (let i = 0; i < n; i++) {
      const last = i === n - 1;
      const f0 = 1900 + Math.random() * 1100;
      const up = last ? question : Math.random() < 0.55;
      const f1 = up ? f0 * (1.2 + Math.random() * 0.35) : f0 * (0.72 + Math.random() * 0.15);
      const dur = last ? 0.1 : 0.045 + Math.random() * 0.04;
      chirp(engine, pos, f0, f1, dur, gain * (0.8 + Math.random() * 0.3), at);
      onSyllable?.(at);
      at += dur + 0.05 + Math.random() * 0.06 + (Math.random() < 0.2 ? 0.08 : 0);
    }
    return at;
  },
};
