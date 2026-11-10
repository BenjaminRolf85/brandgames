// Frame-rate display for testing (settings: "Show frame rate"). Sits low on the left of the
// view and follows the head; shows the average frames per second over half a second.
import * as THREE from 'three';
import { Panel } from './ui3d.js';
import { color, font } from './tokens.js';
import { quality } from './quality.js';

export class FpsMeter {
  constructor(engine) {
    this.engine = engine;
    this.frames = 0;
    this.acc = 0;
    this.value = 0;
    this.panel = new Panel(0.16, 0.055, (ctx, p) => {
      const W = p.canvas.width;
      const H = p.canvas.height;
      ctx.clearRect(0, 0, W, H);
      p.surface({ stroke: color(this.value >= 68 ? 'xr-success' : this.value >= 55 ? 'xr-warning' : 'xr-danger') });
      ctx.fillStyle = color('xr-panel-text');
      ctx.font = font('black', H * 0.5);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${this.value} fps`, W / 2, H / 2);
    });
    this.panel.material.depthTest = false;
    this.panel.renderOrder = 999;
    this.panel.userData.noFit = true;
    this.panel.visible = false;
    engine.scene.add(this.panel);
    engine.updaters.add((dt) => this.update(dt));
  }

  update(dt) {
    this.panel.visible = quality.fps;
    if (!quality.fps) return;
    this.frames += 1;
    this.acc += dt;
    if (this.acc >= 0.5) {
      this.value = Math.round(this.frames / this.acc);
      this.frames = 0;
      this.acc = 0;
      this.panel.redraw();
    }
    const e = this.engine;
    const pos = e.isXR ? e.head.pos : e.camera.getWorldPosition(new THREE.Vector3());
    const quat = e.isXR ? e.head.quat : e.camera.getWorldQuaternion(new THREE.Quaternion());
    this.panel.position.copy(new THREE.Vector3(-0.22, -0.2, -0.65).applyQuaternion(quat).add(pos));
    this.panel.quaternion.copy(quat);
  }
}
