// Rendering, WebXR session handling and unified pointer input
// (Quest controllers, hand-tracking pinch, phone AR taps, mouse and touch).
import * as THREE from 'three';
import { quality } from './quality.js';
import { num, hex } from './tokens.js';

const easeOutCubic = (k) => 1 - Math.pow(1 - k, 3);
// Phones and tablets (a finger is the main pointer): the browser preview gets touch controls, a
// status bar on the screen and a tighter framing. Never in the headset.
const TOUCH = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const FOV = 60;

export class Engine {
  constructor(host) {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio, quality.lite ? 1.25 : 2));
    r.setSize(window.innerWidth, window.innerHeight);
    r.xr.enabled = true;
    host.appendChild(r.domElement);
    this.renderer = r;
    this.canvas = r.domElement;

    this.eye = num('xr-eye-height');
    this.dist = num('xr-distance');
    this.rayLength = num('xr-ray-length');

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.02, 60);
    // Browser preview on phones: a scene can place the camera itself (e.g. first person in Pong);
    // viewOverride(camera, dt, insets) returns true while it does.
    this.viewOverride = null;
    this.scene.add(this.camera);
    this.root = new THREE.Group();
    this.scene.add(this.root);

    this.hemi = new THREE.HemisphereLight(0xffffff, hex('xr-bg-preview'), 1.4);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.2);
    sun.position.set(1, 3, 2);
    this.scene.add(sun);

    this.backdrop = new THREE.Group();
    this._buildGrid();
    this.scene.add(this.backdrop);
    this.previewBg = new THREE.Color(hex('xr-bg-preview'));
    this.scene.background = this.previewBg;
    this.scene.fog = new THREE.Fog(hex('xr-bg-preview'), 6, 18);

    this.mode = 'preview';
    this.head = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), valid: 0, waited: 0 };
    this.heightOffset = 0;
    try { this.heightOffset = Number(localStorage.getItem('kiar.heightOffset')) || 0; } catch { /* ignore */ }
    this.pointers = [];
    this.tweens = [];
    this.updaters = new Set();
    this.roomPlanes = new Map(); // XRPlane -> { matrix, inverse, polygon, orientation, label, version }
    this.raycaster = new THREE.Raycaster();
    this.clock = new THREE.Clock();
    this.running = false;
    this.onXREnd = null;

    this._setupMouse();
    this._setupControllers();
    window.addEventListener('resize', () => this._fit());
    this._fit();
  }

  _buildGrid() {
    if (this.grid) {
      this.grid.removeFromParent();
      this.grid.geometry.dispose();
      this.grid.material.dispose();
    }
    this.grid = new THREE.GridHelper(24, 48, hex('xr-floor-grid'), hex('xr-floor-grid'));
    this.grid.material.transparent = true;
    this.grid.material.opacity = 0.55;
    this.backdrop.add(this.grid);
  }

  /** Re-reads the color tokens after the design skin changed. */
  applySkin() {
    this.previewBg.setHex(hex('xr-bg-preview'));
    this.scene.fog?.color.setHex(hex('xr-bg-preview'));
    this.hemi.groundColor.setHex(hex('xr-bg-preview'));
    this._buildGrid();
    this.lineMat.color.setHex(hex('xr-pointer'));
    this.cursorMat.color.setHex(hex('xr-pointer'));
    this.reticle?.material.color.setHex(hex('xr-reticle'));
  }

  // ---------- lifecycle ----------

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.getDelta();
    this.renderer.setAnimationLoop((t, frame) => this._loop(t, frame));
  }

  stop() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  async enterXR(sessionMode) {
    // Lite effects: slightly lower resolution and stronger foveated rendering in the headset.
    this.renderer.xr.setFramebufferScaleFactor(quality.lite ? 0.85 : 1);
    this.renderer.xr.setFoveation(quality.lite ? 1 : 0.5);
    const session = await navigator.xr.requestSession(sessionMode, {
      // plane-detection: real walls, floor and tables from the Quest's room setup (AR effects).
      optionalFeatures: ['local-floor', 'hand-tracking', 'hit-test', 'plane-detection'],
    });
    const floor = !session.enabledFeatures || session.enabledFeatures.includes('local-floor');
    this.floorRef = floor;
    this.floorWorld = 0;
    this.renderer.xr.setReferenceSpaceType(floor ? 'local-floor' : 'local');
    await this.renderer.xr.setSession(session);
    this.session = session;
    this.mode = 'xr';
    this.xrMode = sessionMode;
    const ar = sessionMode === 'immersive-ar';
    this.scene.background = ar ? null : this.previewBg;
    this.scene.fog = ar ? null : this.scene.fog;
    this.backdrop.visible = !ar;
    this.mouse.active = false;
    this.head.valid = 0;
    this.head.waited = 0;
    this._recenterPending = true;
    this.canPlace = ar && !!session.requestHitTestSource
      && (!session.enabledFeatures || session.enabledFeatures.includes('hit-test'));
    session.addEventListener('end', () => {
      this.cancelPlacement();
      this.pointers.forEach((p) => { p.hitSource?.cancel?.(); p.hitSource = null; p.hitRequested = false; });
      this.canPlace = false;
      this.roomPlanes.clear();
      this.session = null;
      this.mode = 'preview';
      this.scene.background = this.previewBg;
      this.scene.fog = new THREE.Fog(hex('xr-bg-preview'), 6, 18);
      this.backdrop.visible = true;
      this.pointers.forEach((p) => { if (p.kind === 'xr') this._deactivate(p); });
      this._fit();
      this.recenter();
      this.onXREnd?.();
    });
    this.start();
  }

  exitXR() {
    this.session?.end();
  }

  get isXR() {
    return this.mode === 'xr';
  }

  /** Browser preview on a phone or tablet (touch controls, screen status bar, tight framing). */
  get touchUI() {
    return TOUCH && this.mode !== 'xr';
  }

  /**
   * Screen space (CSS px) the preview keeps free for the screen status bar at the top and the
   * touch controls: elements with data-inset="top" / "bottom" in the stage (in landscape
   * data-inset-land="right" if they move to the right side, else bottom controls float).
   */
  insets() {
    if (!this.touchUI) return { top: 0, bottom: 0, right: 0 };
    const W = window.innerWidth;
    const H = window.innerHeight;
    const landscape = W > H;
    let top = 0;
    let bottom = 0;
    let right = 0;
    document.querySelectorAll('#stage [data-inset]').forEach((el) => {
      if (el.hidden || !el.offsetParent) return;
      const side = landscape && el.dataset.inset !== 'top' ? el.dataset.insetLand : el.dataset.inset;
      const r = el.getBoundingClientRect();
      if (side === 'top') top = Math.max(top, r.bottom + 6);
      else if (side === 'bottom') bottom = Math.max(bottom, H - r.top + 6);
      else if (side === 'right') right = Math.max(right, W - r.left + 6);
    });
    return { top, bottom, right };
  }

  /**
   * Re-anchors the content root in front of the viewer at eye level (plus the
   * player's manual height offset). In XR it waits for a tracked head pose.
   */
  recenter() {
    if (this.mode !== 'xr') {
      this.root.position.set(0, 1.6 - this.eye, 0);
      this.root.rotation.set(0, 0, 0);
      return;
    }
    if (this.head.valid < 3) {
      this._recenterPending = true;
      return;
    }
    this._recenterPending = false;
    const { pos, quat } = this.head;
    // Without a floor-based reference space, estimate the floor from the head height.
    if (!this.floorRef) this.floorWorld = pos.y - 1.6;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(quat);
    this.root.position.set(pos.x, pos.y - this.eye + this.heightOffset, pos.z);
    this.root.rotation.set(0, Math.atan2(-fwd.x, -fwd.z), 0);
  }

  /** World height of the real floor (0 with a floor-based reference space and in the preview). */
  get floorY() {
    return this.mode === 'xr' ? this.floorWorld ?? 0 : 0;
  }

  /** Moves the content up or down (meters) and remembers it for later recenters. */
  adjustHeight(delta) {
    this.heightOffset = THREE.MathUtils.clamp(this.heightOffset + delta, -0.6, 0.6);
    this.root.position.y += delta;
    try { localStorage.setItem('kiar.heightOffset', String(this.heightOffset)); } catch { /* ignore */ }
  }

  /** Reads the head pose straight from the XR frame (reliable from the first tracked frame). */
  _trackHead(frame) {
    const pose = frame.getViewerPose(this.renderer.xr.getReferenceSpace());
    if (!pose) return;
    const { position: p, orientation: o } = pose.transform;
    this.head.pos.set(p.x, p.y, p.z);
    this.head.quat.set(o.x, o.y, o.z, o.w);
    // Skip untracked startup frames that report the head at the origin.
    if (!pose.emulatedPosition && (p.x !== 0 || p.y !== 0 || p.z !== 0)) this.head.valid += 1;
    else if (++this.head.waited > 90) this.head.valid += 1;
  }

  // ---------- AR room placement (WebXR hit test) ----------

  /** Starts placement: the next trigger/pinch on a real surface anchors the quiz there. */
  startPlacement(onDone) {
    if (!this.canPlace) return false;
    if (!this.reticle) {
      const geo = new THREE.RingGeometry(0.07, 0.09, 40).rotateX(-Math.PI / 2);
      const dot = new THREE.CircleGeometry(0.015, 16).rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({ color: hex('xr-reticle'), transparent: true, opacity: 0.9, depthTest: false });
      this.reticle = new THREE.Mesh(geo, mat);
      this.reticle.add(new THREE.Mesh(dot, mat));
      this.reticle.matrixAutoUpdate = false;
      this.reticle.renderOrder = 998;
      this.scene.add(this.reticle);
    }
    this.reticle.visible = false;
    this.placing = { onDone, hit: null };
    return true;
  }

  cancelPlacement() {
    if (!this.placing) return;
    const { onDone } = this.placing;
    this.placing = null;
    if (this.reticle) this.reticle.visible = false;
    onDone?.(false);
  }

  _updatePlacement(frame) {
    const refSpace = this.renderer.xr.getReferenceSpace();
    let best = null;
    for (const p of this.pointers) {
      if (p.kind !== 'xr' || !p.active || !p.source) continue;
      if (!p.hitRequested) {
        p.hitRequested = true;
        this.session.requestHitTestSource({ space: p.source.targetRaySpace })
          .then((src) => { p.hitSource = src; })
          .catch(() => { /* surface detection unavailable for this input */ });
      }
      if (!p.hitSource) continue;
      const results = frame.getHitTestResults(p.hitSource);
      if (results.length) {
        const pose = results[0].getPose(refSpace);
        if (pose) best = pose;
      }
    }
    this.placing.hit = null;
    this.reticle.visible = !!best;
    if (!best) return;
    this.reticle.matrix.fromArray(best.transform.matrix);
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    this.reticle.matrix.decompose(pos, quat, new THREE.Vector3());
    this.placing.hit = { pos, normal: new THREE.Vector3(0, 1, 0).applyQuaternion(quat) };
  }

  /** Mirrors the detected real-world planes (walls, floor, tables) into three.js space. */
  _updatePlanes(frame) {
    const ref = this.renderer.xr.getReferenceSpace();
    const planes = frame.detectedPlanes;
    for (const plane of planes) {
      const pose = frame.getPose(plane.planeSpace, ref);
      if (!pose) continue;
      let e = this.roomPlanes.get(plane);
      if (!e) {
        e = { matrix: new THREE.Matrix4(), inverse: new THREE.Matrix4(), changed: -1, version: 0 };
        this.roomPlanes.set(plane, e);
      }
      e.matrix.fromArray(pose.transform.matrix);
      e.inverse.copy(e.matrix).invert();
      e.orientation = plane.orientation;
      e.label = plane.semanticLabel ?? '';
      if (e.changed !== plane.lastChangedTime) {
        e.changed = plane.lastChangedTime;
        e.polygon = plane.polygon.map((q) => new THREE.Vector2(q.x, q.z));
        e.version += 1;
      }
    }
    for (const key of this.roomPlanes.keys()) if (!planes.has(key)) this.roomPlanes.delete(key);
  }

  _place({ pos, normal }) {
    const camPos = this.head.pos;
    if (Math.abs(normal.y) < 0.5) {
      // Wall: put the content plane flat on the wall, centered at the hit point.
      const n = new THREE.Vector3(normal.x, 0, normal.z).normalize();
      const y = THREE.MathUtils.clamp(pos.y, 1.0, 2.0);
      this.root.position.set(pos.x + n.x * (this.dist + 0.03), y - this.eye + this.heightOffset, pos.z + n.z * (this.dist + 0.03));
      this.root.rotation.set(0, Math.atan2(n.x, n.z), 0);
    } else {
      // Floor or table: content stands above the hit point at eye level, facing the player.
      const dir = new THREE.Vector3(pos.x - camPos.x, 0, pos.z - camPos.z);
      if (dir.lengthSq() < 0.01) dir.set(0, 0, -1);
      dir.normalize();
      this.root.position.set(pos.x - dir.x * this.dist, camPos.y - this.eye + this.heightOffset, pos.z - dir.z * this.dist);
      this.root.rotation.set(0, Math.atan2(-dir.x, -dir.z), 0);
    }
    const { onDone } = this.placing;
    this.placing = null;
    this.reticle.visible = false;
    onDone?.(true);
  }

  // ---------- animation helpers ----------

  tween(duration, onUpdate, { ease = easeOutCubic, onDone } = {}) {
    const tw = { t: 0, duration, onUpdate, ease, onDone, cancelled: false };
    this.tweens.push(tw);
    return tw;
  }

  haptic(pointer, intensity = 0.4, ms = 30) {
    try {
      pointer?.source?.gamepad?.hapticActuators?.[0]?.pulse(intensity, ms);
    } catch { /* not supported */ }
  }

  // ---------- input ----------

  _makePointer(kind) {
    const p = {
      kind, active: false, ray: new THREE.Ray(), hovered: null, hit: null,
      pressed: null, held: null, queue: [], source: null,
    };
    this.pointers.push(p);
    return p;
  }

  _setupMouse() {
    const p = this._makePointer('mouse');
    this.mouse = p;
    const ndc = new THREE.Vector2();
    p.ndc = ndc;
    const setNdc = (e) => {
      const rect = this.canvas.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    };
    const c = this.canvas;
    c.style.touchAction = 'none';
    c.addEventListener('pointermove', (e) => {
      if (this.mode === 'xr') return;
      setNdc(e);
      p.active = true;
    });
    c.addEventListener('pointerdown', (e) => {
      if (this.mode === 'xr') return;
      setNdc(e);
      p.active = true;
      c.setPointerCapture?.(e.pointerId);
      p.queue.push('press');
    });
    c.addEventListener('pointerup', (e) => {
      if (this.mode === 'xr') return;
      setNdc(e);
      p.queue.push('release');
      if (e.pointerType !== 'mouse') p.queue.push('leave');
    });
    c.addEventListener('pointercancel', () => p.queue.push('release', 'leave'));
    c.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') p.queue.push('leave');
    });
  }

  _setupControllers() {
    const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);
    const lineMat = this.lineMat = new THREE.LineBasicMaterial({ color: hex('xr-pointer'), transparent: true, opacity: 0.75 });
    const cursorGeo = new THREE.RingGeometry(0.008, 0.014, 24);
    const cursorMat = this.cursorMat = new THREE.MeshBasicMaterial({ color: hex('xr-pointer'), depthTest: false, transparent: true });

    for (let i = 0; i < 2; i++) {
      const controller = this.renderer.xr.getController(i);
      const line = new THREE.Line(lineGeo, lineMat);
      line.scale.z = this.rayLength;
      controller.add(line);
      this.scene.add(controller);
      const cursor = new THREE.Mesh(cursorGeo, cursorMat);
      cursor.renderOrder = 999;
      cursor.visible = false;
      this.scene.add(cursor);

      const p = this._makePointer('xr');
      Object.assign(p, { controller, line, cursor });
      controller.addEventListener('connected', (e) => {
        p.hitSource?.cancel?.();
        p.hitSource = null;
        p.hitRequested = false;
        p.source = e.data;
        p.active = true;
        line.visible = e.data.targetRayMode !== 'screen';
      });
      controller.addEventListener('disconnected', () => {
        p.queue.push('release', 'leave');
        p.active = false;
      });
      controller.addEventListener('selectstart', () => p.queue.push('press'));
      controller.addEventListener('selectend', () => p.queue.push('release'));
    }
  }

  _deactivate(p) {
    p.queue.length = 0;
    if (p.held) this._release(p);
    p.pressed = null;
    p.hovered = null;
    p.hit = null;
    p.active = false;
    if (p.cursor) p.cursor.visible = false;
  }

  _press(p) {
    const target = p.hovered;
    this.onPress?.(p); // e.g. the event mode's inactivity timer
    this.haptic(p, 0.25, 15);
    if (this.placing && !target) {
      if (this.placing.hit) this._place(this.placing.hit);
      return;
    }
    if (!target) {
      this.onEmptyPress?.(p); // e.g. a jump in Echo Parkour
      return;
    }
    if (target.userData.onGrab) {
      p.held = target;
      target.userData.onGrab(p);
    } else {
      p.pressed = target;
      p.pressHit = p.hit; // e.g. which tile of an instanced floor was pressed
    }
  }

  _release(p) {
    if (p.held) {
      const obj = p.held;
      p.held = null;
      obj.userData.onRelease?.(p, p.hovered);
    } else if (p.pressed) {
      const target = p.pressed;
      p.pressed = null;
      if (target.parent && target.userData.onClick) target.userData.onClick(p);
    }
  }

  _updatePointers(targets) {
    const hovered = new Set();
    for (const p of this.pointers) {
      const usable = p.kind === 'xr' ? this.mode === 'xr' : this.mode !== 'xr';
      if (!usable) continue;
      if (p.kind === 'xr' && p.active) {
        p.controller.updateMatrixWorld(true);
        const m = p.controller.matrixWorld;
        p.ray.origin.setFromMatrixPosition(m);
        p.ray.direction.set(0, 0, -1).transformDirection(m);
      } else if (p.kind === 'mouse') {
        this.raycaster.setFromCamera(p.ndc, this.camera);
        p.ray.copy(this.raycaster.ray);
      }

      p.hovered = null;
      p.hit = null;
      if (p.active) {
        this.raycaster.ray.copy(p.ray);
        // Mouse/touch rays start at the preview camera, which may sit far back to fit the scene.
        this.raycaster.far = p.kind === 'mouse' ? Infinity : this.rayLength;
        const hits = this.raycaster.intersectObjects(targets, false);
        const hit = hits.find((h) => h.object !== p.held);
        if (hit) {
          p.hovered = hit.object;
          p.hit = hit;
        }
      }

      while (p.queue.length) {
        const ev = p.queue.shift();
        if (ev === 'press') this._press(p);
        else if (ev === 'release') this._release(p);
        else if (ev === 'leave') { p.hovered = null; p.hit = null; p.active = false; }
      }

      if (p.hovered && !p.held) hovered.add(p.hovered);
      if (p.held && p.hovered) hovered.add(p.hovered);

      if (p.cursor) {
        p.cursor.visible = !!p.hit && this.mode === 'xr';
        if (p.hit) {
          p.cursor.position.copy(p.hit.point);
          p.cursor.lookAt(p.ray.origin);
          p.line.scale.z = p.hit.distance;
        } else {
          p.line.scale.z = this.rayLength;
        }
      }
    }
    for (const obj of targets) {
      const h = hovered.has(obj);
      if (obj.userData._hover !== h) {
        obj.userData._hover = h;
        obj.userData.setHover?.(h);
      }
    }
  }

  // ---------- frame loop ----------

  _fit() {
    if (this.renderer.xr.isPresenting) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cam = this.camera;
    cam.aspect = w / h;
    // Pull the camera back until the whole UI (about 1.6 m x 1.25 m) fits on screen.
    const tv = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const th = tv * cam.aspect;
    const d = Math.max(0.8 / th, 0.64 / tv);
    if (this._fitZ === undefined) cam.position.set(0, 1.6, Math.max(0, d - this.dist));
    cam.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  /**
   * Browser preview: smoothly centers the camera on the content and moves it back until everything
   * fits. On phones the content fills the screen between the status bar and the touch controls.
   */
  _autoFit(dt) {
    if (this.pointers.some((p) => p.held)) return;
    const cam = this.camera;
    const touch = this.touchUI;
    const ins = this.insets();
    if (touch && this.viewOverride?.(cam, dt, ins)) return;
    if (cam.fov !== FOV || cam.rotation.x !== 0 || cam.rotation.y !== 0) {
      cam.fov = FOV;
      cam.rotation.set(0, 0, 0);
      cam.updateProjectionMatrix();
    }
    const tv = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const th = tv * cam.aspect;
    const margin = touch ? 1.02 : 1.08;
    // The free part of the screen (phones: between the status bar and the controls).
    const H = window.innerHeight;
    const free = Math.max(0.35, 1 - (ins.top + ins.bottom) / H);
    const center = (ins.bottom - ins.top) / H; // where its middle is (NDC, up is positive)
    const box = new THREE.Box3();
    const pts = [];
    const visit = (o) => {
      if (!o.visible || o.userData.noFit || o.scale.x < 0.5) return;
      if (o.isMesh && o.geometry) {
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        box.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
        for (let i = 0; i < 8; i++) {
          pts.push(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
        }
      }
      o.children.forEach(visit);
    };
    this.root.children.forEach(visit);
    if (!pts.length) return;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    pts.forEach((v) => {
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y); maxY = Math.max(maxY, v.y);
      minZ = Math.min(minZ, v.z); maxZ = Math.max(maxZ, v.z);
    });
    const cy = (minY + maxY) / 2;
    // Phones: also centered sideways, so a panel on one side does not shrink everything.
    const cx = touch ? (minX + maxX) / 2 : 0;
    let need = 0.2;
    pts.forEach((v) => {
      need = Math.max(need, v.z + (margin * Math.abs(v.x - cx)) / th, v.z + (margin * Math.abs(v.y - cy)) / (tv * free));
    });
    // Shift the camera so the content sits in the middle of the free area.
    const camY = cy - center * (need - (minZ + maxZ) / 2) * tv;
    if (this._fitZ === undefined) { this._fitZ = need; this._fitY = camY; this._fitX = cx; }
    const k = Math.min(1, dt * 5);
    this._fitZ += (need - this._fitZ) * k;
    this._fitY += (camY - this._fitY) * k;
    this._fitX = (this._fitX ?? cx) + (cx - (this._fitX ?? cx)) * k;
    cam.position.z = this._fitZ;
    cam.position.y = this._fitY;
    cam.position.x = this._fitX;
  }

  _loop(time, frame) {
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.mode === 'xr' && frame) {
      this._trackHead(frame);
      if (this._recenterPending) this.recenter();
    }
    if (this.mode === 'xr' && this.placing && frame) this._updatePlacement(frame);
    if (this.mode === 'xr' && frame?.detectedPlanes) this._updatePlanes(frame);

    const targets = [];
    this.root.traverseVisible((o) => { if (o.userData.interactive) targets.push(o); });
    this.root.updateMatrixWorld(true);
    this._updatePointers(targets);

    for (let i = this.tweens.length - 1; i >= 0; i--) {
      const tw = this.tweens[i];
      if (tw.cancelled) { this.tweens.splice(i, 1); continue; }
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.duration);
      tw.onUpdate(tw.ease(k));
      if (k >= 1) {
        this.tweens.splice(i, 1);
        tw.onDone?.();
      }
    }
    this.updaters.forEach((fn) => fn(dt));
    if (this.mode !== 'xr' && this.fitEnabled !== false) {
      this.root.updateMatrixWorld(true);
      this._autoFit(dt);
    }
    // Post effects (gfx.js bloom) only in the browser view; the headset renders directly.
    if (this.post && this.mode !== 'xr') this.post(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}
