// "Pannenfrei": the AI terrain scanner. A small classifier compares a sensor reading (surface
// roughness, wetness, temperature) with learned terrain prototypes and turns the distances into
// probabilities (softmax): its confidence. From the top class it recommends a tire profile and a
// pressure. When the data is unclear (fog, wet leaves, slush) the reading drifts towards another
// terrain: the confidence drops and the AI can be wrong, so the player has to look for themselves.
// Also the grip model: how well a tire and pressure suit a terrain.

export const TERRAINS = ['asphalt', 'gravel', 'mud', 'snow'];
export const TIRES = ['slick', 'allround', 'knobby', 'spikes'];
export const PRESSURES = ['low', 'mid', 'high'];

// Learned prototypes (normalized 0..1): roughness, wetness, temperature.
const PROTO = {
  asphalt: [0.12, 0.18, 0.6],
  gravel: [0.68, 0.22, 0.55],
  mud: [0.52, 0.86, 0.45],
  snow: [0.3, 0.62, 0.06],
};
// What fits each terrain best.
export const BEST = {
  asphalt: { tire: 'slick', pressure: 'high' },
  gravel: { tire: 'allround', pressure: 'mid' },
  mud: { tire: 'knobby', pressure: 'low' },
  snow: { tire: 'spikes', pressure: 'low' },
};
// Grip of a tire on a terrain (0..1).
const TIRE_GRIP = {
  slick: { asphalt: 1, gravel: 0.55, mud: 0.25, snow: 0.2 },
  allround: { asphalt: 0.82, gravel: 1, mud: 0.6, snow: 0.42 },
  knobby: { asphalt: 0.66, gravel: 0.82, mud: 1, snow: 0.58 },
  spikes: { asphalt: 0.58, gravel: 0.66, mud: 0.68, snow: 1 },
};
// Unclear data: which terrain the reading drifts towards, and why.
const CONFUSE = {
  gravel: [{ to: 'asphalt', why: 'dust' }, { to: 'asphalt', why: 'fog' }],
  mud: [{ to: 'gravel', why: 'leaves' }, { to: 'gravel', why: 'fog' }],
  snow: [{ to: 'mud', why: 'slush' }, { to: 'mud', why: 'fog' }],
  asphalt: [{ to: 'mud', why: 'glare' }],
};
const BETA = 8; // softmax sharpness (1 / temperature)

/** Probabilities over TERRAINS for a reading [rough, wet, temp] (all 0..1). */
export function classify(reading) {
  const d = TERRAINS.map((k) => {
    const p = PROTO[k];
    return -((reading[0] - p[0]) ** 2 + (reading[1] - p[1]) ** 2 + (reading[2] - p[2]) ** 2) * BETA;
  });
  const m = Math.max(...d);
  const e = d.map((x) => Math.exp(x - m));
  const sum = e.reduce((a, b) => a + b, 0);
  return TERRAINS.map((k, i) => ({ key: k, p: e[i] / sum })).sort((a, b) => b.p - a.p);
}

/** Readable sensor values: roughness in mm, wetness in %, temperature in degrees C. */
export function sensorText(reading) {
  return {
    rough: Math.round(reading[0] * 14 * 10) / 10,
    wet: Math.round(reading[1] * 100),
    temp: Math.round(-8 + reading[2] * 28),
  };
}

/**
 * The scans of one round: section 1 always clear; among sections 2 to 4 one scan is misled by
 * unclear data (the AI is wrong) and another one is unsure but right.
 * rnd: () => 0..1. Returns [{ terrain, reading, probs, top, conf, tricky: 'wrong'|'unsure'|null, why }].
 */
export function planScans(rnd) {
  const order = [1, 2, 3].sort(() => rnd() - 0.5);
  const wrongAt = order[0];
  const unsureAt = order[1];
  return TERRAINS.map((terrain, i) => {
    const p = PROTO[terrain];
    let tricky = null;
    let why = null;
    let base = p;
    let noise = 0.025;
    if (i === wrongAt || i === unsureAt) {
      const c = CONFUSE[terrain][Math.floor(rnd() * CONFUSE[terrain].length)];
      why = c.why;
      tricky = i === wrongAt ? 'wrong' : 'unsure';
      const q = PROTO[c.to];
      // Wrong: the reading lands a bit past the middle (wrong class, about 50 to 60 %).
      // Unsure: it drifts towards the other class but stays on the right side (55 to 70 %).
      const k = tricky === 'wrong' ? 0.56 + rnd() * 0.04 : 0.36 + rnd() * 0.06;
      base = p.map((v, j) => v + (q[j] - v) * k);
      noise = 0.006;
    }
    let reading;
    let probs;
    for (let tries = 0; tries < 40; tries++) {
      reading = base.map((v) => Math.min(1, Math.max(0, v + (rnd() * 2 - 1) * noise)));
      probs = classify(reading);
      const top = probs[0];
      const ok = tricky === 'wrong' ? top.key !== terrain && top.p < 0.66
        : tricky === 'unsure' ? top.key === terrain && top.p < 0.74
          : top.key === terrain && top.p > 0.8;
      if (ok) break;
    }
    return { terrain, reading, probs, top: probs[0].key, conf: Math.round(probs[0].p * 100), tricky, why };
  });
}

const PIDX = { low: 0, mid: 1, high: 2 };

/**
 * The live re-scan when the weather turns mid-section: a new reading near the new surface (clear,
 * about 75 to 90 %), or in fog a reading halfway towards a wet surface (unsure, about 50 %)
 * while the ground did not change. Returns { reading, probs, top, conf, before }.
 */
export function liveScan(from, to, rnd) {
  const p = PROTO[from];
  let base;
  let noise = 0.02;
  if (to) base = PROTO[to];
  else {
    const q = PROTO[from === 'mud' ? 'snow' : 'mud'];
    base = p.map((v, j) => v + (q[j] - v) * 0.53);
    noise = 0.005;
  }
  let reading;
  let probs;
  for (let tries = 0; tries < 40; tries++) {
    reading = base.map((v) => Math.min(1, Math.max(0, v + (rnd() * 2 - 1) * noise)));
    probs = classify(reading);
    const ok = to ? probs[0].key === to && probs[0].p > 0.72 : probs[0].p < 0.62;
    if (ok) break;
  }
  return { reading, probs, top: probs[0].key, conf: Math.round(probs[0].p * 100), before: p };
}

/**
 * How well a choice suits a terrain: grip 0..1 and the parts of it, plus the points for the
 * choice (tire 120, pressure 80, one step off 32).
 */
export function rate(terrain, tire, pressure) {
  const best = BEST[terrain];
  const tireGrip = TIRE_GRIP[tire][terrain];
  const off = Math.abs(PIDX[pressure] - PIDX[best.pressure]);
  const pressGrip = [1, 0.84, 0.7][off];
  const points = (tire === best.tire ? 120 : 0) + (off === 0 ? 80 : off === 1 ? 32 : 0);
  return {
    grip: tireGrip * pressGrip,
    tireOk: tire === best.tire,
    pressOk: off === 0,
    tooHard: PIDX[pressure] > PIDX[best.pressure],
    tooSoft: PIDX[pressure] < PIDX[best.pressure],
    points,
  };
}
