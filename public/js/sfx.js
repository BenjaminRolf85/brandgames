// Tiny WebAudio synth: no audio files needed.
let ctx = null;

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** Shared AudioContext (for the music engine). */
export function audioContext() {
  return ac();
}

function tone(freq, start, dur, type = 'sine', gain = 0.12) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

/** A tone that slides from f0 to f1 (jumps, wing beats). */
function sweep(f0, f1, start, dur, type = 'triangle', gain = 0.06) {
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f0, t0);
  osc.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const sfx = {
  unlock: () => ac(),
  // Echo Parkour
  jump: () => sweep(330, 720, 0, 0.14, 'square', 0.035),
  flap: () => { sweep(900, 420, 0, 0.12, 'triangle', 0.05); sweep(600, 300, 0.05, 0.1, 'sine', 0.04); },
  coin: () => { tone(988, 0, 0.08, 'square', 0.04); tone(1319, 0.07, 0.22, 'square', 0.04); },
  tick: () => tone(880, 0, 0.07, 'triangle', 0.06),
  click: () => tone(720, 0, 0.06, 'triangle', 0.06),
  grab: () => tone(440, 0, 0.08, 'triangle', 0.07),
  correct: () => { tone(660, 0, 0.12); tone(990, 0.09, 0.2); },
  wrong: () => { tone(220, 0, 0.22, 'sawtooth', 0.05); tone(180, 0.1, 0.25, 'sawtooth', 0.04); },
  build: () => { tone(392, 0.05, 0.08, 'square', 0.035); tone(587, 0.12, 0.1, 'triangle', 0.06); },
  crash: () => { tone(300, 0.05, 0.12, 'sawtooth', 0.05); tone(150, 0.15, 0.3, 'sawtooth', 0.05); tone(90, 0.3, 0.35, 'square', 0.03); },
  hit: () => { tone(880, 0, 0.06, 'square', 0.045); tone(1320, 0.02, 0.05, 'triangle', 0.04); },
  bounce: () => tone(520, 0, 0.05, 'triangle', 0.035),
  appear: () => { tone(660, 0, 0.08, 'sine', 0.04); tone(990, 0.06, 0.12, 'sine', 0.04); },
  shatter: () => { tone(1400, 0, 0.05, 'square', 0.04); tone(1050, 0.03, 0.07, 'triangle', 0.05); tone(700, 0.07, 0.12, 'triangle', 0.04); },
  storm: () => [180, 160, 140, 120].forEach((f, i) => tone(f, i * 0.12, 0.4, 'sawtooth', 0.025)),
  announce: () => { tone(70, 0, 0.5, 'sawtooth', 0.06); tone(140, 0, 0.35, 'square', 0.03); tone(1200, 0.02, 0.12, 'triangle', 0.025); },
  thud: () => tone(150, 0, 0.09, 'sine', 0.08),
  whoosh: () => sweep(900, 220, 0, 0.2, 'sine', 0.05),
  sonar: () => [0, 0.11, 0.22].forEach((d, i) => tone(1500 - i * 260, d, 0.14, 'sine', 0.05)),
  boing: () => { tone(500, 0, 0.06, 'triangle', 0.05); tone(900, 0.03, 0.08, 'triangle', 0.04); },
  tink: () => { tone(1900, 0, 0.05, 'sine', 0.04); tone(2600, 0.02, 0.06, 'sine', 0.03); },
  point: () => { tone(330, 0, 0.12, 'triangle', 0.06); tone(494, 0.1, 0.18, 'triangle', 0.06); },
  finish: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.22)),
  powerup: () => [523, 784, 1047, 1568].forEach((f, i) => tone(f, i * 0.05, 0.14, 'square', 0.03)),
  // Stepping onto a light tile: a soft, slightly random pluck.
  step: () => { const f = 300 + Math.random() * 160; tone(f, 0, 0.14, 'sine', 0.04); tone(f * 3, 0.01, 0.08, 'triangle', 0.012); },
  // Room scan: a rising sweep with a shimmer on top.
  scan: () => {
    const a = ac();
    if (!a) return;
    const t0 = a.currentTime;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(90, t0);
    o.frequency.exponentialRampToValueAtTime(720, t0 + 1.6);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.035, t0 + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.9);
    o.connect(g).connect(a.destination);
    o.start(t0);
    o.stop(t0 + 2);
    [1568, 2093, 2637].forEach((f, i) => tone(f, 0.5 + i * 0.25, 0.25, 'sine', 0.018));
  },
};
