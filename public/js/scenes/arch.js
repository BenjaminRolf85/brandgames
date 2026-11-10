// "Bank data landscape": a walkable IT architecture that fills the room. 42 components in
// seven zones around the player (the data platform floats above), 80 animated data flows.
// Explore: walk up to a system or tap it to discover it and read what it does.
// Data journeys: follow a real process and find the next station in the room.
import * as THREE from 'three';
import { BaseScene, layoutRow } from '../scene.js';
import { Button, Panel, textPanel } from '../ui3d.js';
import { color, hex, num, font } from '../tokens.js';
import { t, L } from '../i18n.js';
import { sfx } from '../sfx.js';
import { ARCH_ZONES, ARCH_COMPONENTS, ARCH_FLOWS, ARCH_MISSIONS } from '../content.js';
import { makeShape, makeLabel, FlowNetwork, makeFloor, makeFloorTitle, makeBeam } from '../arch-visuals.js';
import { makeEnvironment, radialTexture } from '../robot-visuals.js';

const SIZES = { S: 1.5, M: 2.1, L: 2.9 }; // ring radius in meters per room size
const SIZE_KEY = 'kiar.arch.size';
const FOUND_KEY = 'kiar.arch.found';
// External partners sit just outside the ring, next to the systems they talk to: [angle, radius factor].
const EXT_PLACES = { customer: [-0.42, 1.5], swift: [0.42, 1.55], bureau: [0.8, 1.5], market: [5.75, 1.5], authority: [3.45, 1.55] };
// Data platform around and above the center: [angle, radius factor, height].
const PLATFORM = { lake: [0, 0, 2.3], lakehouse: [0.9, 0.42, 2.0], dwh: [2.0, 0.48, 1.55], vault: [3.0, 0.45, 1.8], marts: [4.0, 0.48, 1.5], feature: [5.0, 0.45, 1.75], realtime: [5.9, 0.48, 1.6] };
const HEIGHTS = [1.15, 1.55, 1.3, 1.7, 1.05, 1.45, 1.25, 1.6];
const DISCOVER_DIST = 0.75;
const WALK_SPEED = 1.4; // m/s in the browser preview
const zoneOf = (key) => ARCH_ZONES.find((z) => z.key === key);

export class ArchScene extends BaseScene {
  constructor(app) {
    super(app);
    const engine = this.engine;
    this.time = 0;
    this.score = 0;
    this.mission = null;
    this.selected = null;
    try { this.sizeKey = localStorage.getItem(SIZE_KEY) || 'M'; } catch { this.sizeKey = 'M'; }
    if (!SIZES[this.sizeKey]) this.sizeKey = 'M';
    try { this.found = new Set(JSON.parse(localStorage.getItem(FOUND_KEY) || '[]')); } catch { this.found = new Set(); }
    this.done = new Set();

    // Browser preview: we walk with our own camera instead of auto-fitting the scene.
    engine.fitEnabled = false;
    this.prevBackdrop = engine.backdrop.visible;
    engine.backdrop.visible = false;
    this.rig = { x: 0, z: 0, yaw: 0, pitch: -0.08 };
    this.envTarget = makeEnvironment(engine.renderer);
    this.prevEnvironment = engine.scene.environment;
    engine.scene.environment = this.envTarget.texture;

    this.world = new THREE.Group();
    this.group.add(this.world);
    this.build();
    this.setupInput();
    this.onUpdate((dt) => this.update(dt));
    this.layerAnchored = false;
    this.showIntro();
  }

  // ---------- building the architecture ----------

  build() {
    const R = SIZES[this.sizeKey];
    this.R = R;
    this.world.children.slice().forEach((c) => {
      c.removeFromParent();
      c.traverse((o) => { o.geometry?.dispose(); o.material?.map?.dispose?.(); o.material?.dispose?.(); });
    });
    this.comps = new Map();
    const lang = (o) => L(o);

    // Positions
    const place = new Map();
    for (const z of ARCH_ZONES) {
      if (z.key === 'plat' || z.key === 'ext') continue;
      const list = ARCH_COMPONENTS.filter((c) => c.zone === z.key);
      const n = list.length;
      const spread = Math.min(1.05, 0.24 * (n - 1));
      list.forEach((c, i) => {
        const a = n > 1 ? z.angle - spread / 2 + (i * spread) / (n - 1) : z.angle;
        const r = R * z.r + (i % 2 ? 0.3 : -0.12);
        place.set(c.id, new THREE.Vector3(Math.sin(a) * r, HEIGHTS[i % HEIGHTS.length], -Math.cos(a) * r));
      });
    }
    for (const [id, [a, rf]] of Object.entries(EXT_PLACES)) place.set(id, new THREE.Vector3(Math.sin(a) * R * rf, 1.35, -Math.cos(a) * R * rf));
    for (const [id, [a, rf, h]] of Object.entries(PLATFORM)) place.set(id, new THREE.Vector3(Math.sin(a) * R * rf, h, -Math.cos(a) * R * rf));

    // Floor with zone sectors and titles
    this.world.add(makeFloor(ARCH_ZONES, R));
    for (const z of ARCH_ZONES) {
      const title = makeFloorTitle(lang(z.name), z.token);
      if (z.key === 'plat') {
        title.position.set(0, 0.006, -0.55);
      } else {
        const r = R * z.r - 0.55;
        title.position.set(Math.sin(z.angle) * r, 0.006, -Math.cos(z.angle) * r);
        title.rotation.z = -z.angle; // reads upright when facing the zone from the center
      }
      this.world.add(title);
    }

    // Components
    for (const c of ARCH_COMPONENTS) {
      const z = zoneOf(c.zone);
      const pos = place.get(c.id);
      const g = new THREE.Group();
      g.position.copy(pos);
      const shape = makeShape(c.type, z.token);
      g.add(shape);
      const label = makeLabel(lang(c.name), lang(z.name), z.token);
      label.position.y = c.type === 'lake' ? 0.22 : 0.27;
      g.add(label);
      // Discovered marker: a ring that lights up green.
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.006, 8, 48), new THREE.MeshBasicMaterial({ color: hex('xr-arch-found'), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -0.2;
      g.add(ring);
      // Invisible hit sphere for pointing and tapping.
      const hit = new THREE.Mesh(new THREE.SphereGeometry(c.type === 'lake' ? 0.42 : 0.2, 12, 8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
      hit.userData.interactive = true;
      hit.userData.onClick = () => this.onComponent(c.id);
      hit.userData.setHover = (v) => { shape.scale.setScalar(v ? 1.15 : 1); label.scale.set(v ? 0.48 : 0.42, v ? 0.11 : 0.096, 1); };
      g.add(hit);
      if (pos.y > 0.3) {
        const beam = makeBeam(pos.y - 0.2, z.token);
        beam.position.set(pos.x, (pos.y - 0.2) / 2, pos.z);
        this.world.add(beam);
      }
      this.world.add(g);
      this.comps.set(c.id, { c, z, g, shape, label, ring, pos });
    }

    // Flows
    const flows = ARCH_FLOWS.map(([from, to, kind]) => ({ from, to, kind, a: place.get(from).clone(), b: place.get(to).clone() }));
    this.net = new FlowNetwork(this.world, flows);

    // Invisible floor for teleporting (point and press / tap).
    const floor = new THREE.Mesh(new THREE.CircleGeometry(R * 1.75, 48), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.01;
    floor.userData.interactive = true;
    floor.userData.onClick = (p) => this.onFloor(p);
    this.floor = floor;
    this.world.add(floor);
    this.marker = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.16, 40), new THREE.MeshBasicMaterial({ color: hex('xr-arch-packet'), transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    this.world.add(this.marker);

    // Beacon for the current mission station, and the travelling data packet.
    this.beacon = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.012, 8, 64), new THREE.MeshBasicMaterial({ color: hex('xr-arch-packet'), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.beacon.visible = false;
    this.world.add(this.beacon);
    this.packet = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), color: hex('xr-arch-packet'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.packet.scale.setScalar(0.22);
    this.packet.visible = false;
    this.world.add(this.packet);

    this.found.forEach((id) => this.markFound(id, false));
    this.net.setFocus(this.selected);
  }

  // ---------- input ----------

  setupInput() {
    const engine = this.engine;
    const canvas = engine.canvas;
    this.keys = new Set();
    const kd = (e) => { if (!engine.isXR) this.keys.add(e.key.toLowerCase()); };
    const ku = (e) => this.keys.delete(e.key.toLowerCase());
    let drag = null;
    const down = (e) => { if (!engine.isXR) drag = { x: e.clientX, y: e.clientY, yaw: this.rig.yaw, pitch: this.rig.pitch, moved: 0 }; };
    const move = (e) => {
      if (!drag) return;
      const k = 3 / Math.max(canvas.clientWidth, 1);
      drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.x, e.clientY - drag.y));
      if (drag.moved < 6) return;
      // Only look around when the drag did not start on a button or component.
      if (engine.mouse.pressed && engine.mouse.pressed !== this.floor) return;
      this.rig.yaw = drag.yaw + (e.clientX - drag.x) * k;
      this.rig.pitch = THREE.MathUtils.clamp(drag.pitch + (e.clientY - drag.y) * k, -1.1, 1.0);
    };
    const up = () => { this.dragMoved = drag?.moved ?? 0; drag = null; };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    canvas.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    this.cleanupInput = () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      canvas.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }

  /** Head position (world-local, i.e. relative to the architecture) and flat forward direction. */
  head() {
    const cam = this.engine.camera;
    cam.updateMatrixWorld();
    const p = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
    const q = new THREE.Quaternion();
    cam.getWorldQuaternion(q);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
    const inv = new THREE.Quaternion();
    this.world.getWorldQuaternion(inv).invert();
    fwd.applyQuaternion(inv);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, -1);
    fwd.normalize();
    return { pos: this.world.worldToLocal(p), fwd };
  }

  onFloor(p) {
    if (this.dragMoved > 6) return;
    const point = p.pressHit?.point ?? p.hit?.point;
    if (!point) return;
    const target = this.world.worldToLocal(point.clone());
    const h = this.head().pos;
    const dx = target.x - h.x;
    const dz = target.z - h.z;
    if (Math.hypot(dx, dz) < 0.3) return;
    sfx.click();
    if (this.engine.isXR) {
      // In the headset the architecture moves so that the target ends up under you.
      const from = this.world.position.clone();
      this.tween(0.35, (k) => { this.world.position.set(from.x - dx * k, this.world.position.y, from.z - dz * k); });
    } else {
      const fx = this.rig.x;
      const fz = this.rig.z;
      this.tween(0.45, (k) => { this.rig.x = fx + dx * k; this.rig.z = fz + dz * k; });
    }
  }

  // ---------- frame loop ----------

  update(dt) {
    this.time += dt;
    const engine = this.engine;
    // Architecture stands on the real floor (XR) or on the preview floor.
    this.world.position.y = engine.floorY - engine.root.position.y;

    if (!engine.isXR) {
      // Walk with WASD / arrow keys in the browser preview.
      const f = new THREE.Vector3(-Math.sin(this.rig.yaw), 0, -Math.cos(this.rig.yaw));
      const r = new THREE.Vector3(Math.cos(this.rig.yaw), 0, -Math.sin(this.rig.yaw));
      const k = this.keys;
      const mv = new THREE.Vector3();
      if (k.has('w') || k.has('arrowup')) mv.add(f);
      if (k.has('s') || k.has('arrowdown')) mv.sub(f);
      if (k.has('d') || k.has('arrowright')) mv.add(r);
      if (k.has('a') || k.has('arrowleft')) mv.sub(r);
      if (mv.lengthSq()) {
        mv.normalize().multiplyScalar(WALK_SPEED * dt);
        this.rig.x += mv.x;
        this.rig.z += mv.z;
      }
      const lim = this.R * 1.7;
      const d = Math.hypot(this.rig.x, this.rig.z);
      if (d > lim) { this.rig.x *= lim / d; this.rig.z *= lim / d; }
      const wp = this.world.localToWorld(new THREE.Vector3(this.rig.x, 0, this.rig.z));
      engine.camera.position.set(wp.x, 1.6, wp.z);
      engine.camera.rotation.set(this.rig.pitch, this.rig.yaw, 0, 'YXZ');
    }

    const head = this.head();
    this.followUI(head, dt);
    // You stand inside the architecture: the UI is always drawn on top so systems never hide it.
    ArchScene.onTop(this.layer, 100);
    if (this.infoPanel) ArchScene.onTop(this.infoPanel, 90);

    // Animate components, flows and labels; discover what you walk up to.
    for (const [id, o] of this.comps) {
      o.shape.userData.tick(dt, this.time + o.pos.x);
      o.shape.userData.halo.material.opacity = 0.25 + 0.1 * Math.sin(this.time * 2 + o.pos.z * 3);
      if (o.ring.material.opacity > 0) o.ring.rotation.z += dt * 0.8;
      const near = Math.hypot(head.pos.x - o.pos.x, head.pos.z - o.pos.z) < DISCOVER_DIST && Math.abs(head.pos.y - o.pos.y) < 0.6;
      if (near && !this.found.has(id)) this.discover(id);
    }
    this.net.update(dt);

    // Teleport marker under the pointer.
    const p = engine.pointers.find((ptr) => ptr.hovered === this.floor && ptr.hit);
    this.marker.visible = !!p;
    if (p) {
      const v = this.world.worldToLocal(p.hit.point.clone());
      this.marker.position.set(v.x, 0.012, v.z);
      this.marker.scale.setScalar(1 + Math.sin(this.time * 6) * 0.08);
    }

    // Mission beacon and packet
    if (this.mission) {
      const at = this.comps.get(this.mission.m.path[this.mission.step - 1]);
      this.beacon.visible = true;
      this.beacon.position.copy(at.pos);
      this.beacon.rotation.set(Math.PI / 2 + Math.sin(this.time) * 0.2, 0, this.time);
      this.beacon.scale.setScalar(1 + Math.sin(this.time * 4) * 0.08);
      if (!this.mission.flying) {
        this.packet.visible = true;
        this.packet.position.copy(at.pos).add(new THREE.Vector3(0, 0.05 + Math.sin(this.time * 3) * 0.03, 0));
      }
    } else {
      this.beacon.visible = false;
      this.packet.visible = false;
    }
    this.infoPanel?.userData.face?.(head.pos);
  }

  static onTop(root, order) {
    root.traverse((o) => {
      if (!o.material || o.userData.onTop) return;
      o.material.depthTest = false;
      o.material.depthWrite = false;
      o.renderOrder = order;
      o.userData.onTop = true;
    });
  }

  /** The UI layer lazily follows you while you walk (so menus and missions stay in reach). */
  followUI(head, dt) {
    const yaw = Math.atan2(-head.fwd.x, -head.fwd.z);
    // Layer lives in group space; the world is only shifted, so add its offset back.
    const target = new THREE.Vector3(head.pos.x + this.world.position.x, head.pos.y + this.world.position.y - this.eye, head.pos.z + this.world.position.z);
    const L_ = this.layer;
    if (!this.layerAnchored) {
      L_.position.copy(target);
      L_.rotation.y = yaw;
      this.layerAnchored = true;
      return;
    }
    let dy = yaw - L_.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const dist = Math.hypot(target.x - L_.position.x, target.z - L_.position.z);
    if (Math.abs(dy) > 0.55 || dist > 0.6) this.following = true;
    if (this.following) {
      const k = Math.min(1, dt * 3);
      L_.position.lerp(target, k);
      L_.rotation.y += dy * k;
      if (Math.abs(dy) < 0.03 && dist < 0.05) this.following = false;
    } else {
      L_.position.y += (target.y - L_.position.y) * Math.min(1, dt * 3);
    }
  }

  // ---------- discovering ----------

  discover(id) {
    this.found.add(id);
    try { localStorage.setItem(FOUND_KEY, JSON.stringify([...this.found])); } catch { /* private mode */ }
    this.markFound(id, true);
    this.refreshStatus();
    if (this.found.size === ARCH_COMPONENTS.length) {
      sfx.finish();
      this.toast(t('archAllFound'));
    }
  }

  markFound(id, effect) {
    const o = this.comps.get(id);
    if (!o) return;
    o.ring.material.opacity = 0.85;
    if (effect) {
      sfx.correct();
      this.burst(o.g.getWorldPosition(new THREE.Vector3()), 'xr-arch-found', 18);
    }
  }

  onComponent(id) {
    sfx.click();
    if (!this.found.has(id)) this.discover(id);
    if (this.mission && !this.mission.flying) { this.answer(id); return; }
    if (this.selected === id) { this.closeInfo(); return; }
    this.showInfo(id);
  }

  showInfo(id) {
    this.closeInfo();
    const o = this.comps.get(id);
    this.selected = id;
    this.net.setFocus(id);
    const names = ARCH_FLOWS.filter((f) => f[0] === id || f[1] === id).map((f) => L(this.comps.get(f[0] === id ? f[1] : f[0]).c.name));
    const panel = textPanel(0.62, 0.3, [
      { text: L(o.c.name), size: 'xr-text-md', weight: 'black', color: color(o.z.token), gap: 0.008 },
      { text: L(o.z.name), size: 'xr-text-sm', weight: 'bold', color: color('xr-panel-muted'), gap: 0.015 },
      { text: L(o.c.desc), size: 'xr-text-sm', gap: 0.015 },
      { text: t('archLinks', { list: [...new Set(names)].join(', ') }), size: 'xr-text-sm', color: color('xr-panel-muted') },
    ], { layout: { align: 'left' } });
    const holder = new THREE.Group();
    holder.add(panel);
    const close = new Button(0.24, 0.08, { label: t('archClose'), labelSize: 'xr-text-sm', onClick: () => this.closeInfo() });
    close.position.set(0, -panel.h / 2 - 0.05, 0);
    holder.add(close);
    this.world.add(holder);
    holder.userData.face = (headPos) => {
      // Sit between the component and you, turned towards you.
      const dir = headPos.clone().sub(o.pos);
      dir.y = 0;
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      dir.normalize();
      holder.position.copy(o.pos).addScaledVector(dir, 0.38);
      holder.position.y = THREE.MathUtils.clamp(o.pos.y, 1.0, 1.7);
      holder.rotation.y = Math.atan2(dir.x, dir.z);
    };
    holder.userData.face(this.head().pos);
    this.popIn(panel);
    this.infoPanel = holder;
  }

  closeInfo() {
    if (this.infoPanel) {
      this.infoPanel.removeFromParent();
      this.infoPanel.traverse((o) => { o.geometry?.dispose(); o.material?.map?.dispose?.(); o.material?.dispose?.(); });
    }
    this.infoPanel = null;
    this.selected = null;
    if (!this.mission) this.net.setFocus(null);
  }

  // ---------- UI (follows you) ----------

  showIntro() {
    this.clearLayer();
    const { eye } = this;
    const hint = this.engine.isXR ? t('archIntroXR') : t('archIntroScreen');
    const p = this.add(textPanel(1.0, 0.3, [
      { text: t('archName'), size: 'xr-text-title', weight: 'black', gap: 0.02 },
      { text: t('archIntro'), size: 'xr-text-sm', color: color('xr-panel-muted'), gap: 0.015 },
      { text: hint, size: 'xr-text-sm', weight: 'bold' },
    ], { layout: { align: 'left' } }));
    p.position.set(0, eye + 0.12 - p.h / 2, -1.2);
    const buttons = [
      new Button(0.34, 0.12, { label: t('archExplore'), variant: 'primary', onClick: () => { this.startMusic(-1, 'arch'); this.showHud(); } }),
      new Button(0.34, 0.12, { label: t('archMissions'), variant: 'sponsor', onClick: () => { this.startMusic(-1, 'arch'); this.showMissionList(); } }),
    ];
    layoutRow(buttons, p.position.y - p.h / 2 - 0.08, -1.2, 0.03);
    buttons.forEach((b, i) => { this.add(b); this.popIn(b, 0.1 + i * 0.05); });
    this.popIn(p);
    this.app.host?.introduce(this, 'arch', p);
    this.prepareMusic('arch');
  }

  /** Status and buttons low in front of you, tilted up like a console. */
  showHud(extra = []) {
    this.clearLayer();
    const { eye } = this;
    const tilt = -0.42;
    this.status = this.add(textPanel(0.9, 0.08, () => [{ text: this.statusText(), size: 'xr-text-sm', weight: 'bold' }], { grow: false }));
    this.status.position.set(0, eye - 0.33, -0.86);
    this.status.rotation.x = tilt;
    const cycle = { S: 'M', M: 'L', L: 'S' };
    const row = [
      ...extra,
      new Button(0.24, 0.085, { label: t('archMissions'), labelSize: 'xr-text-sm', variant: 'sponsor', onClick: () => this.showMissionList() }),
      new Button(0.2, 0.085, { label: t('archRoom', { s: this.sizeKey }), labelSize: 'xr-text-sm', onClick: () => this.setSize(cycle[this.sizeKey]) }),
      new Button(0.2, 0.085, { label: t('archCenter'), labelSize: 'xr-text-sm', onClick: () => this.toCenter() }),
      new Button(0.17, 0.085, { label: t('menu'), labelSize: 'xr-text-sm', onClick: () => this.app.showMenu() }),
    ];
    const g = new THREE.Group();
    g.position.set(0, eye - 0.43, -0.81);
    g.rotation.x = tilt;
    this.add(g);
    layoutRow(row, 0, 0, 0.015);
    row.forEach((b) => g.add(b));
    // Legend of the flow colors
    this.legend = this.add(new Panel(0.9, 0.05, (ctx, c) => this.drawLegend(ctx, c)));
    this.legend.position.set(0, eye - 0.27, -0.88);
    this.legend.rotation.x = tilt;
  }

  statusText() {
    const parts = [t('archFound', { n: this.found.size, total: ARCH_COMPONENTS.length }), `${t('score')}: ${this.score}`];
    if (this.mission) parts.push(t('archStation', { n: this.mission.step, total: this.mission.m.path.length - 1 }));
    return parts.join('  ·  ');
  }

  refreshStatus() {
    this.status?.redraw();
  }

  drawLegend(ctx, c) {
    const items = [['rt', 'xr-arch-flow-rt'], ['batch', 'xr-arch-flow-batch'], ['rep', 'xr-arch-flow-rep'], ['meta', 'xr-arch-flow-meta'], ['sec', 'xr-arch-flow-sec']];
    const W = c.canvas.width;
    const H = c.canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.font = font('bold', c.m(num('xr-text-sm')) * 0.85);
    ctx.textBaseline = 'middle';
    const labels = items.map(([k]) => t(`archFlow_${k}`));
    const widths = labels.map((l) => ctx.measureText(l).width + c.m(0.05));
    let x = (W - widths.reduce((a, b) => a + b, 0)) / 2;
    items.forEach(([, token], i) => {
      ctx.fillStyle = color(token);
      ctx.beginPath();
      ctx.arc(x + c.m(0.012), H / 2, c.m(0.009), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color('xr-bg-muted');
      ctx.fillText(labels[i], x + c.m(0.028), H / 2);
      x += widths[i];
    });
  }

  setSize(key) {
    this.sizeKey = key;
    try { localStorage.setItem(SIZE_KEY, key); } catch { /* private mode */ }
    this.closeInfo();
    this.build();
    if (this.mission) this.net.setFocus(this.mission.m.path[this.mission.step - 1]);
    this.showHud(this.mission ? [] : []);
    if (this.mission) this.showMissionCard();
  }

  toCenter() {
    if (this.engine.isXR) {
      const h = this.head().pos;
      const from = this.world.position.clone();
      this.tween(0.4, (k) => { this.world.position.set(from.x + h.x * k, this.world.position.y, from.z + h.z * k); });
    } else {
      this.rig.x = 0;
      this.rig.z = 0;
    }
  }

  toast(text) {
    this.toastPanel?.removeFromParent();
    const p = this.add(textPanel(0.7, 0.1, [{ text, size: 'xr-text-md', weight: 'black', color: color('xr-arch-found') }], { surface: { stroke: color('xr-arch-found') } }));
    p.position.set(0, this.eye + 0.05, -1.0);
    this.popIn(p);
    this.toastPanel = p;
    this.delay(2.2, () => { if (this.toastPanel === p) { p.removeFromParent(); this.toastPanel = null; } });
  }

  // ---------- data journeys ----------

  showMissionList() {
    this.closeInfo();
    this.mission = null;
    this.net.setFocus(null);
    this.clearLayer();
    const { eye } = this;
    const head = this.add(textPanel(1.2, 0.14, [
      { text: t('archMissions'), size: 'xr-text-lg', weight: 'black', gap: 0.012 },
      { text: t('archChoose'), size: 'xr-text-sm', color: color('xr-panel-muted') },
    ], { layout: { align: 'left' } }));
    head.position.set(0, eye + 0.32 - head.h / 2, -1.15);
    this.popIn(head);
    // Journeys as a 2 x 2 grid, all cards the same height.
    const w = 0.59;
    const opts = (m) => ({
      label: `${L(m.title)}${this.done.has(m.id) ? `  ·  ${t('archDone')}` : ''}`,
      body: `${L(m.intro)}  ·  ${t('archStations', { n: m.path.length - 1 })}`,
      labelSize: 'xr-text-sm',
      variant: this.done.has(m.id) ? 'secondary' : 'primary',
      onClick: () => this.startMission(m),
    });
    const h = Math.max(...ARCH_MISSIONS.map((m) => Button.measure(w, 0.1, opts(m))));
    const top = head.position.y - head.h / 2 - 0.03;
    ARCH_MISSIONS.forEach((m, i) => {
      const b = new Button(w, h, opts(m));
      b.position.set((i % 2 ? 1 : -1) * (w / 2 + 0.01), top - h / 2 - Math.floor(i / 2) * (h + 0.02), -1.15);
      this.add(b);
      this.popIn(b, 0.05 * i);
    });
    const back = new Button(0.3, 0.09, { label: t('archExplore'), labelSize: 'xr-text-sm', onClick: () => this.showHud() });
    back.position.set(0, top - 2 * (h + 0.02) - 0.05, -1.15);
    this.add(back);
  }

  startMission(m) {
    this.closeInfo();
    this.mission = { m, step: 1, tries: 0, t0: this.time, points: 0, firstTry: 0 };
    this.missionCollapsed = false;
    this.lastLead = null;
    this.lastTone = null;
    this.net.setFocus(m.path[0]);
    this.showHud();
    this.showMissionCard(null);
    sfx.build();
  }

  /**
   * Mission card: low in front of you, tilted like a console (above the status bar), so it
   * never covers the systems you are looking for. It can be collapsed to a small pill.
   */
  showMissionCard(lead = this.lastLead ?? null, tone = this.lastTone ?? null) {
    const ms = this.mission;
    this.lastLead = lead;
    this.lastTone = tone;
    this.missionCard?.removeFromParent();
    const step = ms.m.steps[ms.step - 1];
    const g = new THREE.Group();
    g.position.set(0, this.eye - 0.255, -0.9);
    g.rotation.x = -0.32;
    if (this.legend) this.legend.visible = false; // the card takes the legend's place during a journey
    const station = t('archStation', { n: ms.step, total: ms.m.path.length - 1 });
    if (this.missionCollapsed) {
      const pill = new Button(0.5, 0.075, { label: `${station}  ·  ${t('archShowQuestion')}`, labelSize: 'xr-text-sm', variant: 'sponsor', onClick: () => { this.missionCollapsed = false; this.showMissionCard(); } });
      pill.position.y = pill.h / 2;
      g.add(pill);
      this.add(g);
      this.missionCard = g;
      this.refreshStatus();
      return;
    }
    const blocks = [{ text: `${L(ms.m.title)}  ·  ${station}`, size: 'xr-text-sm', weight: 'bold', color: color('xr-panel-muted'), gap: 0.008 }];
    if (lead) blocks.push({ text: lead, size: 'xr-text-sm', weight: 'bold', color: tone ? color(tone) : undefined, gap: 0.01 });
    blocks.push({ text: L(step.q), size: 'xr-text-sm', weight: 'black' });
    const card = textPanel(0.74, 0.12, blocks, { layout: { align: 'left' }, surface: { stroke: color('xr-arch-packet') } });
    g.add(card);
    // Buttons stacked to the right of the card, so the card stays low and flat.
    const bw = 0.26;
    const side = [
      new Button(bw, 0.07, { label: t('archHint'), labelSize: 'xr-text-sm', onClick: () => this.hint() }),
      new Button(bw, 0.07, { label: t('archHide'), labelSize: 'xr-text-sm', onClick: () => { this.missionCollapsed = true; this.showMissionCard(); } }),
      new Button(bw, 0.07, { label: t('archCancel'), labelSize: 'xr-text-sm', onClick: () => this.showMissionList() }),
    ];
    const colH = side.reduce((a, b) => a + b.h, 0) + 0.01 * (side.length - 1);
    let y = colH / 2;
    side.forEach((b) => { b.position.set(card.w / 2 + 0.02 + bw / 2, y - b.h / 2, 0); y -= b.h + 0.01; g.add(b); });
    // Card bottom sits just above the status bar; card + buttons centered in front of you.
    const lift = Math.max(card.h, colH) / 2;
    g.position.x = -(0.02 + bw) / 2;
    g.position.y += lift * Math.cos(0.32);
    g.position.z -= lift * Math.sin(0.32);
    this.add(g);
    this.popIn(card);
    this.missionCard = g;
    this.refreshStatus();
  }

  hint() {
    const ms = this.mission;
    if (!ms) return;
    const target = this.comps.get(ms.m.path[ms.step]);
    ms.tries = Math.max(ms.tries, 2);
    this.showMissionCard(t('archHintText', { zone: L(target.z.name) }), 'xr-arch-packet');
    // Make the target's halo pulse brightly for a moment.
    const halo = target.shape.userData.halo;
    this.tween(2.5, (k) => { halo.scale.setScalar((target.c.type === 'lake' ? 1.1 : 0.55) * (1 + Math.sin(k * Math.PI * 6) * 0.5 * (1 - k))); });
  }

  answer(id) {
    const ms = this.mission;
    const want = ms.m.path[ms.step];
    if (id !== want) {
      ms.tries += 1;
      sfx.wrong();
      const o = this.comps.get(id);
      const x0 = o.shape.position.x;
      this.tween(0.4, (k) => { o.shape.position.x = x0 + Math.sin(k * Math.PI * 6) * 0.03 * (1 - k); });
      this.missionCollapsed = false;
      this.showMissionCard(t('archWrong', { name: L(o.c.name) }), 'xr-danger');
      if (ms.tries >= 3) this.hint();
      return;
    }
    // Correct: points, then the data packet flies along the flow to the station.
    const secs = this.time - ms.t0;
    const pts = (ms.tries === 0 ? 100 : ms.tries === 1 ? 50 : 25) + Math.max(0, Math.round(50 - secs * 2));
    if (ms.tries === 0) ms.firstTry += 1;
    ms.points += pts;
    this.score += pts;
    sfx.correct();
    const flow = this.net.find(ms.m.path[ms.step - 1], want);
    ms.flying = true;
    this.packet.visible = true;
    const v = new THREE.Vector3();
    this.tween(1.1, (k) => { flow.curve.getPointAt(k, v); this.packet.position.copy(v); }, {
      onDone: () => {
        if (this.disposed || this.mission !== ms) return;
        ms.flying = false;
        const o = this.comps.get(want);
        this.burst(o.g.getWorldPosition(new THREE.Vector3()), 'xr-arch-packet', 24);
        const explain = `${t('archCorrect')} +${pts}  ·  ${L(ms.m.steps[ms.step - 1].a)}`;
        ms.step += 1;
        ms.tries = 0;
        ms.t0 = this.time;
        if (ms.step >= ms.m.path.length) { this.finishMission(explain); return; }
        this.net.setFocus(want);
        this.missionCollapsed = false;
        this.showMissionCard(explain, 'xr-arch-found');
      },
    });
  }

  finishMission(explain) {
    const ms = this.mission;
    const bonus = 200;
    this.score += bonus;
    this.done.add(ms.m.id);
    this.mission = null;
    this.net.setFocus(null);
    const total = ms.m.path.length - 1;
    this.results({
      gameKey: 'arch', score: this.score, correct: ms.firstTry, total,
      line: t('archMissionDone', { title: L(ms.m.title) }),
      learned: [
        { q: t('archPath'), a: ms.m.path.map((id) => L(this.comps.get(id).c.name)).join(' → ') },
        { q: L(ms.m.steps[ms.m.steps.length - 1].q), a: explain.split('·').pop().trim() },
      ],
      onAgain: () => this.showMissionList(),
    });
  }

  dispose() {
    this.cleanupInput?.();
    const engine = this.engine;
    engine.fitEnabled = true;
    engine.backdrop.visible = this.prevBackdrop;
    engine.scene.environment = this.prevEnvironment ?? null;
    this.envTarget?.dispose();
    if (!engine.isXR) {
      engine.camera.rotation.set(0, 0, 0);
    }
    super.dispose();
  }
}
