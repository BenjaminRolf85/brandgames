// Echo as the runner in Echo Parkour (level units): hops along with quick wing beats, takes off
// with the wings up, flaps hard for the double jump, glides when falling, gets dizzy when a
// glitch or bug hits it and cheers at the goal. Same model and face as the flying mascot.
import * as THREE from 'three';
import { loadEchoParts, bendWing } from './echo-mascot.js';
import { EchoFace } from './echo-face.js';

const SIZE = 0.95; // model scale in level units (body about one block wide)
const LIFT = 0.62; // body center above the feet

export class ParkourEcho {
  constructor() {
    this.group = new THREE.Group();
    this.body = new THREE.Group(); // bob, squash, tilt
    this.group.add(this.body);
    this.time = 0;
    this.phase = 0;
    this.flapT = 0;
    this.squash = 0;
    this.yaw = 0.3;
    this.spin = 0;
    loadEchoParts().then((p) => this.attach(p)).catch((e) => console.warn('Echo not loaded', e));
  }

  attach({ model, wings, rings, face }) {
    if (this.disposed) return;
    model.scale.setScalar(SIZE);
    model.position.y = LIFT;
    model.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.body.add(model);
    this.wings = wings;
    this.rings = rings;
    this.face = new EchoFace(face);
    this.face.setMood('focus');
  }

  /** Double jump: a strong wing beat. */
  flap() { this.flapT = 1; this.face?.setMood('call', 0.25); }

  /** Takeoff and landing squash. */
  jump() { this.squash = -0.6; this.face?.setMood('surprised', 0.3); }
  land(strength = 1) { this.squash = Math.min(1, 0.5 * strength); }
  happy(sec = 0.8) { this.face?.setMood('happy', sec); }
  hurt() { this.face?.setMood('dizzy', 1); }
  cheer() { this.spin = 1; this.face?.setMood('happy', 3); }

  /**
   * state: 'idle' | 'run' | 'push' (against a wall) | 'air' | 'hit' | 'win'
   * vy: vertical speed (units/s), look: world point for the eyes (or null), blink: invulnerable.
   */
  update(dt, { state = 'idle', vy = 0, look = null, blink = false } = {}) {
    this.time += dt;
    const t = this.time;
    this.flapT = Math.max(0, this.flapT - dt * 3.2);
    this.spin = Math.max(0, this.spin - dt * 0.8);
    this.squash += (0 - this.squash) * Math.min(1, dt * 10);

    // Heading: towards the run direction, turned a bit to the player; to the player when idle.
    const wantYaw = state === 'idle' || state === 'win' ? 0.25 : Math.PI / 2 - 0.55;
    this.yaw += (wantYaw - this.yaw) * Math.min(1, dt * 8);
    this.group.rotation.y = this.yaw;

    let bob = 0;
    let tilt = 0;
    if (state === 'run' || state === 'push') {
      this.phase += dt * (state === 'push' ? 7 : 9.5);
      bob = Math.abs(Math.sin(this.phase)) * 0.16;
      tilt = state === 'push' ? 0.32 : 0.18;
    } else if (state === 'air') {
      tilt = THREE.MathUtils.clamp(-vy * 0.02, -0.25, 0.3);
    } else if (state === 'idle') {
      bob = Math.sin(t * 2.4) * 0.03 + 0.03;
    }
    const loop = this.spin > 0 ? (1 - this.spin) * Math.PI * 2 : 0;
    this.body.position.y = bob;
    this.body.rotation.set(tilt - loop, 0, state === 'hit' ? Math.sin(t * 18) * 0.25 : 0, 'YXZ');
    const sq = this.squash;
    this.body.scale.set(1 + sq * 0.18, 1 - sq * 0.22, 1 + sq * 0.18);
    this.group.visible = !blink || Math.floor(t * 12) % 2 === 0;

    // Wings
    let a;
    if (this.flapT > 0) {
      a = THREE.MathUtils.lerp(-0.45, 1.15, this.flapT ** 0.6); // up, then a hard downstroke
    } else if (state === 'run') {
      a = 0.28 + Math.sin(this.phase * 2) * 0.32;
    } else if (state === 'push') {
      a = 0.5 + Math.sin(t * 22) * 0.4;
    } else if (state === 'air') {
      a = vy > 0 ? 0.95 : 0.22 + Math.sin(t * 12) * 0.08; // up on the way up, gliding down
    } else if (state === 'hit') {
      a = -0.2 + Math.sin(t * 6) * 0.05;
    } else if (state === 'win') {
      a = 0.9 + Math.sin(t * 14) * 0.35;
    } else {
      a = 0.18 + Math.sin(t * 3) * 0.1;
    }
    for (const w of this.wings ?? []) {
      w.node.rotation.z = w.side * a;
      bendWing(w, a * 0.55);
    }
    this.rings?.forEach((mats, i) => {
      const k = state === 'win' ? 1 : 0.25 + 0.75 * (0.5 - 0.5 * Math.cos(((t - i * 0.4) / 1.6) * Math.PI * 2));
      for (const m of mats) m.opacity = k;
    });
    this.face?.update(dt, look);
  }
}
