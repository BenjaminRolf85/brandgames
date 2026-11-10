// "Röstmeister" (Roast Master): the roaster's sounds, synthesized with WebAudio (no files):
// the drum's rumble while roasting, the first crack (loud single pops, like popcorn), the second
// crack (fast, quiet crackling), beans pouring into the hopper and rattling into the tray.
import { audioContext } from './sfx.js';

let noise = null;
function noiseBuffer(a) {
  if (noise && noise.sampleRate === a.sampleRate) return noise;
  noise = a.createBuffer(1, a.sampleRate, a.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return noise;
}

/** One short noise burst through a band-pass filter (a pop or a click). */
function pop(a, when, { freq = 1800, q = 1.2, gain = 0.2, dur = 0.03 } = {}) {
  const src = a.createBufferSource();
  src.buffer = noiseBuffer(a);
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = a.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(gain, when + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(when, Math.random() * 0.8, dur + 0.02);
}

export class RoastAudio {
  constructor() {
    this.hum = null;
  }

  get ctx() {
    try { return audioContext(); } catch { return null; }
  }

  /** The drum turning over the flame: filtered noise plus a low hum. */
  rumble(on) {
    const a = this.ctx;
    if (!a) return;
    if (on && !this.hum) {
      const src = a.createBufferSource();
      src.buffer = noiseBuffer(a);
      src.loop = true;
      const lp = a.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 220;
      const g = a.createGain();
      g.gain.setValueAtTime(0.0001, a.currentTime);
      g.gain.exponentialRampToValueAtTime(0.05, a.currentTime + 0.4);
      const osc = a.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 52;
      const og = a.createGain();
      og.gain.value = 0.35;
      // the drum's beat: a slow wobble of the volume
      const lfo = a.createOscillator();
      lfo.frequency.value = 1.6;
      const lg = a.createGain();
      lg.gain.value = 0.015;
      lfo.connect(lg).connect(g.gain);
      src.connect(lp).connect(g);
      osc.connect(og).connect(g);
      g.connect(a.destination);
      src.start();
      osc.start();
      lfo.start();
      this.hum = { src, osc, lfo, g };
    } else if (!on && this.hum) {
      const { src, osc, lfo, g } = this.hum;
      const t0 = a.currentTime;
      g.gain.cancelScheduledValues(t0);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.35);
      [src, osc, lfo].forEach((n) => n.stop(t0 + 0.4));
      this.hum = null;
    }
  }

  /** First crack: loud, single pops over about two seconds. */
  firstCrack() {
    const a = this.ctx;
    if (!a) return;
    let t = a.currentTime + 0.02;
    for (let i = 0; i < 16; i++) {
      pop(a, t, { freq: 1400 + Math.random() * 1400, q: 1.1, gain: 0.22 + Math.random() * 0.12, dur: 0.035 + Math.random() * 0.02 });
      t += 0.06 + Math.random() * 0.2;
    }
  }

  /** Second crack: fast, quiet crackling like rice crispies. */
  secondCrack() {
    const a = this.ctx;
    if (!a) return;
    let t = a.currentTime + 0.02;
    for (let i = 0; i < 38; i++) {
      pop(a, t, { freq: 3200 + Math.random() * 2400, q: 2, gain: 0.06 + Math.random() * 0.06, dur: 0.012 + Math.random() * 0.01 });
      t += 0.025 + Math.random() * 0.06;
    }
  }

  /** Beans rattling (pouring into the hopper or into the tray). */
  pour(dur = 0.8, gain = 0.07) {
    const a = this.ctx;
    if (!a) return;
    let t = a.currentTime + 0.02;
    const end = t + dur;
    while (t < end) {
      pop(a, t, { freq: 2500 + Math.random() * 3000, q: 3, gain: gain * (0.5 + Math.random()), dur: 0.01 + Math.random() * 0.01 });
      t += 0.012 + Math.random() * 0.03;
    }
  }

  stop() {
    this.rumble(false);
  }
}
