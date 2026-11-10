// Facial animation for Echo (flying mascot and arena fighter): blinking (sometimes twice),
// pupils that look at a target and make small saccades, lids and eye shape by mood, ears that
// twitch, perk up or droop, and a mouth that opens for calls and widens when happy.
// Works on the nodes of echo.glb: EyeL/EyeR (children PupilL/R, LidL/R), EarL/EarR, Mouth,
// MouthOpen.
import * as THREE from 'three';

const clamp = THREE.MathUtils.clamp;

// lid / low: upper and lower lid closure (0 open .. 1 closed) · squash: eye height ·
// pupil: pupil size · ear: + droops outwards, - perks up · open: open mouth · smile: width
export const MOODS = {
  neutral: { lid: 0.02, low: 0, squash: 1, pupil: 1, ear: 0, open: 0, smile: 1 },
  happy: { lid: 0.06, low: 0.5, squash: 0.94, pupil: 1.06, ear: -0.12, open: 0, smile: 1.3 },
  surprised: { lid: 0, low: 0, squash: 1.1, pupil: 0.74, ear: -0.28, open: 0.8, smile: 0.7 },
  call: { lid: 0.04, low: 0.12, squash: 1.04, pupil: 0.88, ear: -0.22, open: 1, smile: 0.55 },
  focus: { lid: 0.36, low: 0.2, squash: 0.95, pupil: 0.95, ear: 0.1, open: 0, smile: 0.85 },
  sad: { lid: 0.48, low: 0.04, squash: 0.96, pupil: 1.12, ear: 0.55, open: 0, smile: 0.6 },
  dizzy: { lid: 0.3, low: 0.16, squash: 1, pupil: 0.82, ear: 0.6, open: 0.45, smile: 0.5 },
  sleepy: { lid: 0.88, low: 0.12, squash: 1, pupil: 1, ear: 0.35, open: 0.95, smile: 0.4 },
};
const KEYS = Object.keys(MOODS.neutral);

export class EchoFace {
  /** parts: { eyes: [{ node, pupil, lid, low, side }], ears: [{ node, side }], mouth, mouthOpen } */
  constructor(parts) {
    this.parts = parts;
    for (const e of parts.eyes) {
      e.pupilBase = e.pupil.position.clone();
      e.eyeScale = e.node.scale.clone();
    }
    for (const e of parts.ears) e.baseRot = e.node.rotation.clone();
    this.mouthScale = parts.mouth?.scale.clone() ?? new THREE.Vector3(1, 1, 1);
    this.cur = { ...MOODS.neutral };
    this.mood = 'neutral';
    this.moodUntil = Infinity;
    this.baseMood = 'neutral';
    this.time = 0;
    this.nextBlink = 1 + Math.random() * 3;
    this.blinkT = -1;
    this.gaze = new THREE.Vector2();
    this.idleGaze = new THREE.Vector2();
    this.nextSaccade = 0.5;
    this.twitch = { side: 0, t: -1 };
    this.nextTwitch = 2 + Math.random() * 5;
  }

  /** A mood for some seconds (0 = until the next call), then back to the base mood. */
  setMood(name, seconds = 0) {
    if (!MOODS[name]) return;
    if (seconds > 0) {
      this.mood = name;
      this.moodUntil = this.time + seconds;
    } else {
      this.baseMood = name;
      if (this.moodUntil === Infinity || this.time >= this.moodUntil) { this.mood = name; this.moodUntil = Infinity; }
    }
  }

  blink() {
    if (this.blinkT < 0) this.blinkT = 0;
  }

  /** lookWorld: a world point to look at, or null for a wandering gaze. */
  update(dt, lookWorld = null) {
    this.time += dt;
    if (this.time >= this.moodUntil) { this.mood = this.baseMood; this.moodUntil = Infinity; }
    const target = MOODS[this.mood];
    const k = 1 - Math.exp(-dt * 12);
    for (const key of KEYS) this.cur[key] += (target[key] - this.cur[key]) * k;
    const c = this.cur;

    // Blinking: quick close, short hold, a bit slower opening; sometimes twice.
    this.nextBlink -= dt;
    if (this.nextBlink <= 0 && this.blinkT < 0) {
      this.blinkT = 0;
      this.double = Math.random() < 0.18;
      this.nextBlink = 2 + Math.random() * 3.5;
    }
    let blink = 0;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const t = this.blinkT;
      blink = t < 0.07 ? t / 0.07 : t < 0.11 ? 1 : t < 0.21 ? 1 - (t - 0.11) / 0.1 : 0;
      if (t >= 0.21) {
        if (this.double) { this.double = false; this.blinkT = -0.08; } else this.blinkT = -1;
      }
    } else if (this.blinkT > -1 && this.blinkT < 0) {
      this.blinkT += dt; // short gap before the second blink
      if (this.blinkT >= 0) this.blinkT = 0;
    }

    // Gaze: look at the target, else small saccades around the middle.
    this.nextSaccade -= dt;
    if (this.nextSaccade <= 0) {
      this.idleGaze.set((Math.random() - 0.5) * 0.05, (Math.random() - 0.5) * 0.035);
      this.nextSaccade = 0.7 + Math.random() * 1.6;
    }
    for (const e of this.parts.eyes) {
      let gx = this.idleGaze.x;
      let gy = this.idleGaze.y;
      if (this.mood === 'dizzy') {
        // Dizzy: the pupils circle in opposite directions.
        gx = Math.cos(this.time * 7 * e.side) * 0.03;
        gy = Math.sin(this.time * 7 * e.side) * 0.03;
      } else if (lookWorld) {
        const d = e.node.worldToLocal(lookWorld.clone());
        const depth = Math.max(Math.abs(d.z), 0.15);
        gx = clamp(d.x / depth, -1, 1) * 0.042 + this.idleGaze.x * 0.25;
        gy = clamp(d.y / depth, -1, 1) * 0.034 + this.idleGaze.y * 0.25;
      }
      const len = Math.hypot(gx, gy);
      if (len > 0.042) { gx *= 0.042 / len; gy *= 0.042 / len; }
      e.gx = (e.gx ?? 0) + (gx - (e.gx ?? 0)) * Math.min(1, dt * 18);
      e.gy = (e.gy ?? 0) + (gy - (e.gy ?? 0)) * Math.min(1, dt * 18);
      e.pupil.position.set(e.pupilBase.x + e.gx, e.pupilBase.y + e.gy, e.pupilBase.z);
      e.pupil.scale.setScalar(c.pupil);
      e.node.scale.set(e.eyeScale.x, e.eyeScale.y * c.squash, e.eyeScale.z);
      e.lid.scale.y = Math.max(0.001, Math.max(c.lid, blink));
      if (e.low) e.low.scale.y = Math.max(0.001, Math.max(c.low, blink * 0.18));
    }

    // Ears: mood angle plus a quick twitch now and then.
    this.nextTwitch -= dt;
    if (this.nextTwitch <= 0) {
      this.twitch = { side: Math.random() < 0.5 ? -1 : 1, t: 0 };
      this.nextTwitch = 2.5 + Math.random() * 5;
    }
    let tw = 0;
    if (this.twitch.t >= 0) {
      this.twitch.t += dt;
      tw = Math.sin(Math.min(1, this.twitch.t / 0.22) * Math.PI);
      if (this.twitch.t > 0.22) this.twitch.t = -1;
    }
    const wiggle = this.mood === 'happy' ? Math.sin(this.time * 14) * 0.08 : 0;
    for (const e of this.parts.ears) {
      const twitch = this.twitch.side === e.side ? tw : 0;
      e.node.rotation.set(e.baseRot.x - twitch * 0.35, e.baseRot.y, e.baseRot.z - e.side * (c.ear + wiggle * e.side));
    }

    // Mouth: wider smile when happy, open for calls and surprise.
    const m = this.parts.mouth;
    if (m) {
      const w = c.smile * (1 - 0.45 * c.open);
      m.scale.set(this.mouthScale.x * w, this.mouthScale.y * (1 / Math.sqrt(Math.max(0.3, c.smile))), this.mouthScale.z);
    }
    const mo = this.parts.mouthOpen;
    if (mo) mo.scale.set(Math.max(0.001, c.open * (0.92 + 0.08 * Math.sin(this.time * 18))), Math.max(0.001, c.open * (0.9 + 0.1 * Math.sin(this.time * 18))), Math.max(0.001, c.open));
  }
}
