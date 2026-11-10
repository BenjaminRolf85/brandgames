// Campaign Pinball: the classic electro-mechanical sounds, synthesized like the rest of the app
// (no audio files): solenoid clacks for flippers, slingshots and kickers, pop bumper thumps,
// the knocker, chime tones for scoring (three bells like an old chime box), drop and standup
// targets, the spinner's ticking and the match wheel.
import { audioContext } from './sfx.js';

let noise = null;

/** One second of white noise (shared), for clicks and clacks. */
function noiseBuffer(a) {
  if (noise && noise.sampleRate === a.sampleRate) return noise;
  noise = a.createBuffer(1, a.sampleRate, a.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noise;
}

/** A filtered noise burst: the mechanical part of a clack. */
function burst(a, start, dur, freq, gain, q = 1.2, type = 'bandpass') {
  const t0 = a.currentTime + start;
  const src = a.createBufferSource();
  src.buffer = noiseBuffer(a);
  const f = a.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t0, Math.random() * 0.5);
  src.stop(t0 + dur + 0.02);
}

/** A tone with a fast attack and an exponential decay; f1 slides the pitch. */
function tone(a, freq, start, dur, type, gain, f1 = 0) {
  const t0 = a.currentTime + start;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(a.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

/** A struck bell: a few inharmonic partials that ring out (the chime box). */
function bell(a, freq, start, gain) {
  [[1, 1, 1.4], [2.76, 0.35, 0.7], [5.4, 0.12, 0.35]].forEach(([k, g, d]) => tone(a, freq * k, start, d, 'sine', gain * g));
}

const play = (fn) => (...args) => {
  let a = null;
  try { a = audioContext(); } catch { a = null; }
  if (a) fn(a, ...args);
};

// Chimes come at most every 70 ms each (a fast run of hits stays musical).
const lastChime = [0, 0, 0];

export const psfx = {
  // Flipper coil: a hard clack with a low thump; the release is a softer click.
  flipper: play((a) => { burst(a, 0, 0.05, 2400, 0.22, 0.8); tone(a, 140, 0, 0.07, 'triangle', 0.12, 70); }),
  flipperDown: play((a) => { burst(a, 0, 0.03, 1800, 0.07, 1); }),
  // Slingshot: a sharp snap and the rubber's twang.
  sling: play((a) => { burst(a, 0, 0.045, 3200, 0.2, 0.9); tone(a, 220, 0, 0.09, 'square', 0.035, 110); }),
  // Pop bumper: a deep thump and a bright pop.
  bumper: play((a) => { tone(a, 110, 0, 0.12, 'sine', 0.22, 55); burst(a, 0, 0.06, 1500, 0.16, 1.4); tone(a, 1250, 0.005, 0.05, 'triangle', 0.03); }),
  // Drop target falls: a click and a wooden knock.
  drop: play((a) => { burst(a, 0, 0.04, 2600, 0.14); tone(a, 330, 0, 0.06, 'triangle', 0.08, 180); }),
  // Standup target: a short plastic tock.
  standup: play((a) => { burst(a, 0, 0.03, 3600, 0.13, 2); tone(a, 520, 0, 0.05, 'triangle', 0.06, 380); }),
  // Rollover switch: a tiny tick.
  rollover: play((a) => { burst(a, 0, 0.02, 5200, 0.06, 3); }),
  // One turn of the spinner.
  spin: play((a) => { burst(a, 0, 0.018, 4200, 0.06, 4); tone(a, 1900, 0, 0.02, 'square', 0.012); }),
  // Kickback and saucer kicker: a big coil with a bang.
  kick: play((a) => { tone(a, 90, 0, 0.16, 'sine', 0.26, 45); burst(a, 0, 0.08, 900, 0.22, 0.7); burst(a, 0.01, 0.05, 3000, 0.1, 1); }),
  // The ball drops into a hole.
  hole: play((a) => { tone(a, 180, 0, 0.12, 'sine', 0.12, 90); burst(a, 0.02, 0.06, 700, 0.08, 0.8, 'lowpass'); }),
  // The knocker: the loud wooden bang inside the cabinet (extra ball, match).
  knocker: play((a) => { tone(a, 70, 0, 0.3, 'sine', 0.42, 38); burst(a, 0, 0.12, 400, 0.35, 0.6, 'lowpass'); burst(a, 0, 0.05, 2200, 0.15, 1); }),
  // Scoring chimes: 0 = high (small scores), 1 = middle, 2 = low (big scores).
  chime: play((a, level = 0) => {
    const now = a.currentTime;
    const i = Math.max(0, Math.min(2, level));
    if (now - lastChime[i] < 0.07) return;
    lastChime[i] = now;
    bell(a, [1318.5, 987.8, 659.3][i], 0, [0.05, 0.06, 0.07][i]);
  }),
  // A chime run (bonus, campaign launch): bells going down.
  chimes: play((a, n = 6) => {
    for (let k = 0; k < n; k++) bell(a, [1318.5, 987.8, 659.3][k % 3], k * 0.11, 0.05);
  }),
  // Coins rolling and clinking (the coin chute, the ATM).
  coins: play((a) => { for (let k = 0; k < 6; k++) { tone(a, 2400 + Math.random() * 900, k * 0.07, 0.08, 'sine', 0.03); burst(a, k * 0.07, 0.02, 5000, 0.04, 3); } }),
  // The jackpot jingle: a bright fanfare on bells over a bass line.
  jingle: play((a) => {
    const notes = [523.3, 659.3, 784, 1046.5, 784, 1046.5, 1318.5];
    notes.forEach((f, k) => { bell(a, f, k * 0.12, 0.06); tone(a, f / 4, k * 0.12, 0.14, 'triangle', 0.05); });
    bell(a, 1568, notes.length * 0.12, 0.08);
    tone(a, 130.8, notes.length * 0.12, 0.6, 'triangle', 0.08);
  }),
  // The vault door: a heavy turn and a clunk.
  vault: play((a) => { tone(a, 70, 0, 0.5, 'sawtooth', 0.04, 55); burst(a, 0.35, 0.12, 300, 0.25, 0.7, 'lowpass'); tone(a, 95, 0.35, 0.2, 'sine', 0.2, 50); }),
  // The match wheel clicking.
  matchTick: play((a) => { burst(a, 0, 0.015, 3000, 0.07, 3); }),
  // Tilt-like buzz for a lost ball (soft, not scary).
  drain: play((a) => { tone(a, 196, 0, 0.35, 'sawtooth', 0.035, 98); tone(a, 147, 0.12, 0.4, 'triangle', 0.04, 73); }),
};
