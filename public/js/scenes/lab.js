// KI-Lab viewer: a 360° panorama shown as a sphere around the player and wide photos
// shown as large curved screens. In the browser preview you look around by dragging.
import * as THREE from 'three';
import { BaseScene, layoutRow } from '../scene.js';
import { Button, textPanel } from '../ui3d.js';
import { color } from '../tokens.js';
import { t, L } from '../i18n.js';
import { LAB_IMAGES } from '../content.js';

const SPHERE_RADIUS = 8;
const SCREEN_RADIUS = 2.4;
const SCREEN_ARC = THREE.MathUtils.degToRad(110);
const loader = new THREE.TextureLoader();

export class LabScene extends BaseScene {
  constructor(app, index = 0) {
    super(app);
    this.index = index;
    this.view = new THREE.Group(); // rotated by dragging in the browser preview
    this.view.userData.noFit = true;
    this.group.add(this.view);
    this.yaw = 0;
    this.pitch = 0;

    // Hide the preview floor grid while an image surrounds the player.
    const engine = this.engine;
    engine.backdrop.visible = false;
    // Browser preview: stand in the middle of the image instead of auto-fitting the panels.
    engine.fitEnabled = false;
    this.onUpdate(() => {
      if (engine.isXR) return;
      const cam = engine.camera;
      const th = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * cam.aspect;
      // Step back a little so the control strip below the horizon stays fully on screen.
      cam.position.set(0, engine.root.position.y + this.eye, THREE.MathUtils.clamp(0.62 / th - (this.dist - 0.25), 0.6, 1.6));
    });
    this.onCleanup(() => {
      engine.fitEnabled = true;
      engine.backdrop.visible = !(engine.isXR && engine.xrMode === 'immersive-ar');
    });

    this.setupDragLook();
    this.show(index);
  }

  /** Like onDispose, but survives clearLayer (which runs onDispose callbacks between steps). */
  onCleanup(fn) {
    const dispose = this.dispose.bind(this);
    this.dispose = () => { fn(); dispose(); };
  }

  show(index) {
    const { eye, dist } = this;
    this.index = (index + LAB_IMAGES.length) % LAB_IMAGES.length;
    const img = LAB_IMAGES[this.index];
    this.clearLayer();
    this.clearView();
    this.yaw = img.yaw ?? 0;
    this.pitch = 0;
    this.applyView();

    const loading = this.add(textPanel(0.6, 0.12, [{ text: t('loading'), size: 'xr-text-md', weight: 'bold' }]));
    loading.position.set(0, eye + 0.1, -dist);
    const req = (this.req = (this.req ?? 0) + 1);
    const prepare = (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      return tex;
    };
    loader.load(img.src, (tex) => {
      if (this.disposed || req !== this.req) { tex.dispose(); return; }
      loading.removeFromParent();
      loading.dispose();
      const mesh = img.pano ? this.addSphere(prepare(tex)) : this.addScreen(prepare(tex), img.aspect);
      // Sharper version afterwards, swapped in place once it has loaded.
      if (img.srcHi && this.canShowHiRes()) {
        loader.load(img.srcHi, (hi) => {
          if (this.disposed || req !== this.req) { hi.dispose(); return; }
          const old = mesh.material.map;
          mesh.material.map = prepare(hi);
          mesh.material.needsUpdate = true;
          old.dispose();
        });
      }
    });

    // Caption and navigation, low in the field of view so the image stays free.
    const hint = this.engine.isXR ? t('labLookXR') : t('labLookDrag');
    const caption = this.add(textPanel(1.1, 0.12, [
      { text: `${t('labTitle')}  ·  ${this.index + 1}/${LAB_IMAGES.length}`, size: 'xr-text-sm', weight: 'bold', color: color('xr-accent'), gap: 0.008 },
      { text: L(img.caption), size: 'xr-text-md', weight: 'bold', gap: 0.008 },
      { text: img.pano ? hint : t('labScreenHint'), size: 'xr-text-sm', color: color('xr-panel-muted') },
    ]));
    const top = eye - 0.32;
    caption.position.set(0, top - caption.h / 2, -dist + 0.25);
    const buttons = [
      new Button(0.26, 0.11, { label: t('back'), onClick: () => this.show(this.index - 1) }),
      new Button(0.26, 0.11, { label: t('next'), variant: 'primary', onClick: () => this.show(this.index + 1) }),
      new Button(0.26, 0.11, { label: t('menu'), onClick: () => this.app.showMenu() }),
    ];
    const bh = Math.max(...buttons.map((b) => b.h));
    layoutRow(buttons, caption.position.y - caption.h / 2 - 0.03 - bh / 2, -dist + 0.25, 0.03);
    // Tilt the control strip towards the player's eyes.
    [caption, ...buttons].forEach((o) => { o.rotation.x = -0.35; this.add(o); this.popIn(o); });
  }

  /** 8K panoramas need large textures and memory: headsets and desktops yes, phones no. */
  canShowHiRes() {
    const maxTex = this.engine.renderer.capabilities.maxTextureSize;
    const ua = navigator.userAgent;
    const phone = /iPhone|iPad|Android.*Mobile/.test(ua) && !/Quest|OculusBrowser/.test(ua);
    return maxTex >= 8192 && (this.engine.isXR || !phone);
  }

  addSphere(tex) {
    const geo = new THREE.SphereGeometry(SPHERE_RADIUS, 96, 48);
    geo.scale(-1, 1, 1); // view the texture from inside, not mirrored
    const sphere = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, fog: false }));
    sphere.position.y = this.eye;
    this.view.add(sphere);
    return sphere;
  }

  /** Curved screen: a cylinder segment in front of the player, sized to the photo's aspect ratio. */
  addScreen(tex, aspect) {
    const height = (SCREEN_ARC * SCREEN_RADIUS) / aspect;
    const geo = new THREE.CylinderGeometry(SCREEN_RADIUS, SCREEN_RADIUS, height, 64, 1, true, Math.PI - SCREEN_ARC / 2, SCREEN_ARC);
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.x = -1; // seen from inside, so flip horizontally
    tex.offset.x = 1;
    const screen = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, toneMapped: false, fog: false }));
    screen.position.y = this.eye + 0.12;
    this.view.add(screen);
    return screen;
  }

  clearView() {
    this.view.traverse((o) => {
      o.geometry?.dispose();
      if (o.material) { o.material.map?.dispose(); o.material.dispose(); }
    });
    this.view.clear();
  }

  applyView() {
    this.view.rotation.set(0, 0, 0);
    this.view.rotateY(this.yaw);
    this.view.rotateX(this.pitch);
  }

  /** Browser preview: drag on empty space to look around (XR uses head movement instead). */
  setupDragLook() {
    const canvas = this.engine.canvas;
    let drag = null;
    const down = (e) => {
      if (this.engine.isXR || this.engine.mouse.hovered) return;
      drag = { x: e.clientX, y: e.clientY, yaw: this.yaw, pitch: this.pitch };
    };
    const move = (e) => {
      if (!drag) return;
      const k = 3 / Math.max(canvas.clientWidth, 1);
      this.yaw = drag.yaw + (e.clientX - drag.x) * k;
      this.pitch = THREE.MathUtils.clamp(drag.pitch + (e.clientY - drag.y) * k, -0.9, 0.9);
      this.applyView();
    };
    const up = () => { drag = null; };
    canvas.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    this.onCleanup(() => {
      canvas.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      this.clearView();
    });
  }
}
