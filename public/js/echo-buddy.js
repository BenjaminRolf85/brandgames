// Echo, the mascot, as the learner in the training game (scenes/robot.js): it flies low from
// tile to tile. Same interface as the former robot: group, glow, setMood(kind, seconds),
// update(dt, { moving, lookX, viewer }). When it stands still it turns to the player.
import * as THREE from 'three';
import { hex } from './tokens.js';
import { radialTexture } from './robot-visuals.js';
import { loadEchoParts, bendWing } from './echo-mascot.js';
import { EchoFace } from './echo-face.js';

const E = 0.15; // body width (m) on the training field (tiles are 0.22 m)
const HOVER = 0.13; // body center above the tile

const flatGlow = (size, token, opacity) => {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({
    map: radialTexture(), color: hex(token), transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  m.rotation.x = -Math.PI / 2;
  return m;
};

export class EchoBuddy {
  constructor() {
    this.group = new THREE.Group();
    this.hover = new THREE.Group(); // bob, lean and turn to the player
    this.group.add(this.hover);
    this.time = Math.random() * 10;
    this.mood = 'idle';
    this.moodTimer = 0;
    this.flapPhase = 0;
    this.still = 0;
    this.shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.16), new THREE.MeshBasicMaterial({ map: radialTexture(), color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.003;
    this.glow = flatGlow(0.2, 'xr-robot-accent', 0.6);
    this.glow.position.y = 0.005;
    this.group.add(this.shadow, this.glow);
    loadEchoParts().then((parts) => this.attach(parts)).catch((e) => console.warn('Echo not loaded', e));
  }

  attach({ model, wings, ringNodes, rings, face }) {
    if (this.disposed) return;
    model.scale.setScalar(E);
    this.hover.add(model);
    this.model = model;
    this.wings = wings;
    this.ringNodes = ringNodes;
    this.rings = rings;
    this.face = new EchoFace(face);
  }

  /** kind: 'happy' (reached the coin), 'sad' (bumped into a wall), 'idle'. */
  setMood(kind, seconds = 0.8) {
    this.mood = kind;
    this.moodTimer = seconds;
    this.face?.setMood(kind === 'happy' ? 'happy' : kind === 'sad' ? 'sad' : 'neutral', seconds);
    if (kind === 'happy') this.cheer = 1;
  }

  /** moving: 0..1 movement intensity, lookX: -1..1 gaze to the side, viewer: player's head (world). */
  update(dt, { moving = 0, lookX = 0, viewer = null } = {}) {
    this.time += dt;
    const t = this.time;
    this.moodTimer = Math.max(0, this.moodTimer - dt);
    if (this.moodTimer <= 0) this.mood = 'idle';
    this.cheer = Math.max(0, (this.cheer ?? 0) - dt * 1.4);

    // Hover: bob, lean into the flight, a little jump of joy.
    this.hover.position.y = HOVER + Math.sin(t * 2.6) * 0.01 + Math.sin(this.cheer * Math.PI) * 0.05;
    this.hover.rotation.x = THREE.MathUtils.lerp(this.hover.rotation.x, moving * 0.35, Math.min(1, dt * 8));
    // Standing still for a moment: turn to the player.
    this.still = moving > 0.05 ? 0 : this.still + dt;
    let wantYaw = 0;
    if (viewer && this.still > 0.5) {
      const v = this.group.worldToLocal(viewer.clone());
      wantYaw = Math.atan2(v.x, v.z);
    }
    let d = wantYaw - this.hover.rotation.y;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.hover.rotation.y += d * Math.min(1, dt * 4);
    this.shadow.scale.setScalar(1 - Math.sin(t * 2.6) * 0.06);
    this.glow.material.opacity = 0.5 + Math.sin(t * 2.4) * 0.12;

    // Wings: faster beats while flying, waving up when happy.
    this.flapPhase += dt * (3.5 + moving * 4) * Math.PI * 2;
    const amp = 0.22 + moving * 0.3;
    for (const w of this.wings ?? []) {
      let a = 0.15 + Math.sin(this.flapPhase) * amp;
      if (this.mood === 'happy') a = 0.9 + Math.sin(t * 16 + w.side) * 0.3;
      if (this.mood === 'sad') a = -0.25 + Math.sin(this.flapPhase * 0.5) * 0.08;
      w.node.rotation.z = w.side * a;
      bendWing(w, a * 0.55);
    }
    // Echo rings pulse like the loading animation; bright when happy.
    this.rings?.forEach((mats, i) => {
      const k = this.mood === 'happy' ? 1 : 0.25 + 0.75 * (0.5 - 0.5 * Math.cos(((t - i * 0.4) / 1.6) * Math.PI * 2));
      for (const m of mats) m.opacity = k;
    });

    // Eyes: on the player when turned to them, else ahead / towards the coin.
    if (this.face) {
      const look = this.still > 0.5 && viewer ? viewer : this.group.localToWorld(new THREE.Vector3(lookX * 0.6, 0.15, 0.8));
      this.face.update(dt, look);
    }
  }
}
