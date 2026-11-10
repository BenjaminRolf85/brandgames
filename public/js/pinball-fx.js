// Campaign Pinball: effects that make the machine feel alive, all light on the GPU.
//   IconBurst   marketing icons that pop out of the playfield and fly off (hearts, likes and
//               comments from the social bumpers, envelopes with an @ from the e-mail targets,
//               notification badges from the app, play buttons from the video wall, a new
//               customer from the branch, stars for big moments). One instanced, billboarded draw
//               call for all of them, the icons come from one canvas atlas painted from tokens.
//   makeLamps   general illumination: small lamps along the playfield's walls (two draw calls),
//               each with its own brightness and color, for chases and light shows
//   makeFlasher a flasher dome with a halo that strobes on big events
import * as THREE from 'three';
import { color, hex, font } from './tokens.js';
import { radialTexture } from './robot-visuals.js';

export const ICON = { heart: 0, like: 1, comment: 2, mail: 3, badge: 4, play: 5, star: 6, person: 7, eye: 8, cursor: 9, spark: 10, poster: 11, coin: 12, confetti1: 13, confetti2: 14, confetti3: 15 };
const CELLS = 4; // atlas: 4 x 4 cells

let atlasTex = null;
/** The icon atlas (painted once from the design tokens). */
function atlas() {
  if (atlasTex) return atlasTex;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S * CELLS;
  const ctx = c.getContext('2d');
  const cell = (i, fn) => {
    ctx.save();
    ctx.translate((i % CELLS) * S, Math.floor(i / CELLS) * S);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    fn(ctx, S);
    ctx.restore();
  };
  const outline = (draw) => {
    // A white sticker edge keeps every icon readable on any background.
    ctx.save();
    ctx.lineWidth = 14;
    ctx.strokeStyle = color('xr-pinball-sticker');
    draw();
    ctx.stroke();
    ctx.restore();
    draw();
  };
  const heart = (x, y, s) => {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.35);
    ctx.bezierCurveTo(x - s * 0.9, y - s * 0.2, x - s * 0.45, y - s * 0.85, x, y - s * 0.38);
    ctx.bezierCurveTo(x + s * 0.45, y - s * 0.85, x + s * 0.9, y - s * 0.2, x, y + s * 0.35);
    ctx.closePath();
  };
  cell(ICON.heart, (g) => {
    outline(() => heart(64, 70, 58));
    g.fillStyle = color('xr-pinball-ch-social');
    g.fill();
    g.fillStyle = color('xr-pinball-sticker');
    g.globalAlpha = 0.5;
    g.beginPath();
    g.ellipse(44, 48, 9, 6, -0.6, 0, Math.PI * 2);
    g.fill();
  });
  cell(ICON.like, (g) => {
    outline(() => { g.beginPath(); g.arc(64, 64, 50, 0, Math.PI * 2); });
    g.fillStyle = color('xr-pinball-like');
    g.fill();
    g.fillStyle = color('xr-pinball-sticker');
    g.fillRect(34, 62, 14, 32);
    g.beginPath();
    g.moveTo(52, 94);
    g.lineTo(52, 62);
    g.lineTo(64, 36);
    g.quadraticCurveTo(74, 34, 72, 50);
    g.lineTo(70, 58);
    g.lineTo(90, 58);
    g.quadraticCurveTo(98, 60, 94, 70);
    g.lineTo(88, 90);
    g.quadraticCurveTo(86, 96, 78, 96);
    g.closePath();
    g.fill();
  });
  cell(ICON.comment, (g) => {
    outline(() => {
      g.beginPath();
      g.roundRect(14, 22, 100, 66, 22);
      g.moveTo(40, 86);
      g.lineTo(30, 110);
      g.lineTo(62, 88);
    });
    g.fillStyle = color('xr-pinball-sticker');
    g.fill();
    g.fillStyle = color('xr-pinball-ch-social');
    for (const x of [42, 64, 86]) { g.beginPath(); g.arc(x, 55, 8, 0, Math.PI * 2); g.fill(); }
  });
  cell(ICON.mail, (g) => {
    outline(() => { g.beginPath(); g.roundRect(12, 30, 104, 70, 8); });
    g.fillStyle = color('xr-pinball-sticker');
    g.fill();
    g.strokeStyle = color('xr-pinball-ch-email');
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(16, 34);
    g.lineTo(64, 72);
    g.lineTo(112, 34);
    g.stroke();
    g.fillStyle = color('xr-pinball-accent');
    g.beginPath();
    g.arc(64, 74, 22, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = color('xr-pinball-sticker');
    g.font = font('black', 34);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('@', 64, 75);
  });
  cell(ICON.badge, (g) => {
    outline(() => { g.beginPath(); g.roundRect(22, 22, 84, 84, 22); });
    g.fillStyle = color('xr-pinball-ch-app');
    g.fill();
    g.fillStyle = color('xr-pinball-sticker');
    g.globalAlpha = 0.85;
    g.fillRect(40, 44, 48, 8);
    g.fillRect(40, 60, 34, 8);
    g.globalAlpha = 1;
    g.fillStyle = color('xr-pinball-accent');
    g.beginPath();
    g.arc(98, 30, 22, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = color('xr-pinball-sticker');
    g.font = font('black', 28);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('1', 98, 31);
  });
  cell(ICON.play, (g) => {
    outline(() => { g.beginPath(); g.arc(64, 64, 50, 0, Math.PI * 2); });
    g.fillStyle = color('xr-pinball-ch-video');
    g.fill();
    g.fillStyle = color('xr-pinball-sticker');
    g.beginPath();
    g.moveTo(50, 38);
    g.lineTo(92, 64);
    g.lineTo(50, 90);
    g.closePath();
    g.fill();
  });
  const star = (g, x, y, r, r2) => {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? r2 : r;
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.closePath();
  };
  cell(ICON.star, (g) => {
    outline(() => star(g, 64, 68, 56, 24));
    g.fillStyle = color('xr-pinball-ch-poster');
    g.fill();
  });
  cell(ICON.person, (g) => {
    outline(() => { g.beginPath(); g.arc(64, 64, 52, 0, Math.PI * 2); });
    g.fillStyle = color('xr-pinball-exploit');
    g.fill();
    g.fillStyle = color('xr-pinball-sticker');
    g.beginPath();
    g.arc(58, 48, 15, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.ellipse(58, 92, 28, 22, 0, Math.PI, 0);
    g.fill();
    g.font = font('black', 40);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('+', 96, 44);
  });
  cell(ICON.eye, (g) => {
    outline(() => {
      g.beginPath();
      g.moveTo(10, 64);
      g.quadraticCurveTo(64, 10, 118, 64);
      g.quadraticCurveTo(64, 118, 10, 64);
    });
    g.fillStyle = color('xr-pinball-sticker');
    g.fill();
    g.fillStyle = color('xr-pinball-funnel-1');
    g.beginPath();
    g.arc(64, 64, 24, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = color('xr-pinball-dark');
    g.beginPath();
    g.arc(64, 64, 10, 0, Math.PI * 2);
    g.fill();
  });
  cell(ICON.cursor, (g) => {
    outline(() => {
      g.beginPath();
      g.moveTo(34, 14);
      g.lineTo(98, 70);
      g.lineTo(68, 74);
      g.lineTo(86, 108);
      g.lineTo(72, 114);
      g.lineTo(54, 80);
      g.lineTo(34, 100);
      g.closePath();
    });
    g.fillStyle = color('xr-pinball-funnel-2');
    g.fill();
  });
  cell(ICON.spark, (g) => {
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 60);
    grd.addColorStop(0, color('xr-pinball-sticker'));
    grd.addColorStop(1, color('xr-pinball-clear'));
    g.fillStyle = grd;
    star(g, 64, 64, 60, 12);
    g.fill();
  });
  cell(ICON.poster, (g) => {
    outline(() => { g.beginPath(); g.roundRect(24, 12, 80, 104, 8); });
    g.fillStyle = color('xr-pinball-ch-poster');
    g.fill();
    g.fillStyle = color('xr-pinball-sticker');
    star(g, 64, 50, 24, 10);
    g.fill();
    g.fillRect(38, 84, 52, 8);
    g.fillRect(46, 98, 36, 6);
  });
  cell(ICON.coin, (g) => {
    outline(() => { g.beginPath(); g.arc(64, 64, 44, 0, Math.PI * 2); });
    g.fillStyle = color('xr-pinball-gold');
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = color('xr-pinball-gold-dark');
    g.beginPath();
    g.arc(64, 64, 32, 0, Math.PI * 2);
    g.stroke();
    star(g, 64, 64, 18, 8);
    g.fillStyle = color('xr-pinball-gold-dark');
    g.fill();
  });
  // Confetti: little paper strips in three colors.
  ['xr-pinball-ch-social', 'xr-pinball-ch-poster', 'xr-pinball-ch-email'].forEach((tok, i) => cell(ICON.confetti1 + i, (g) => {
    g.translate(64, 64);
    g.rotate(0.5 + i);
    g.fillStyle = color(tok);
    g.fillRect(-14, -34, 28, 68);
  }));
  atlasTex = new THREE.CanvasTexture(c);
  atlasTex.colorSpace = THREE.SRGBColorSpace;
  atlasTex.generateMipmaps = true;
  atlasTex.minFilter = THREE.LinearMipmapLinearFilter;
  return atlasTex;
}

const VERT = /* glsl */ `
attribute vec3 aStart;
attribute vec3 aVel;
attribute vec4 aInfo; // birth, life, cell, size
attribute float aSpin;
uniform float uTime;
uniform float uGrav;
varying vec2 vUv;
varying float vAlpha;
void main() {
  float age = uTime - aInfo.x;
  float k = age / max(aInfo.y, 0.001);
  float alive = step(0.0, k) * step(k, 1.0);
  vec3 p = aStart + aVel * age + vec3(0.0, -0.5 * uGrav * age * age, 0.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float pop = k < 0.12 ? k / 0.12 * 1.25 : 1.0 + 0.25 * max(0.0, 1.0 - (k - 0.12) * 6.0);
  float s = aInfo.w * alive * pop;
  float a = aSpin * age;
  vec2 q = vec2(position.x * cos(a) - position.y * sin(a), position.x * sin(a) + position.y * cos(a));
  mv.xy += q * s;
  gl_Position = projectionMatrix * mv;
  float cell = aInfo.z;
  vec2 c0 = vec2(mod(cell, ${CELLS}.0), ${CELLS - 1}.0 - floor(cell / ${CELLS}.0)) / ${CELLS}.0;
  vUv = c0 + uv / ${CELLS}.0;
  vAlpha = alive * (1.0 - smoothstep(0.6, 1.0, k));
}`;
const FRAG = /* glsl */ `
uniform sampler2D uMap;
varying vec2 vUv;
varying float vAlpha;
void main() {
  vec4 c = texture2D(uMap, vUv);
  if (c.a * vAlpha < 0.02) discard;
  gl_FragColor = vec4(c.rgb, c.a * vAlpha);
  #include <colorspace_fragment>
}`;

/**
 * Icons popping out of the playfield. parent: the group whose space positions are given in
 * (the field group: y is up from the playfield). emit(icon, position, options).
 */
export class IconBurst {
  constructor(parent, { max = 128 } = {}) {
    this.max = max;
    this.next = 0;
    const plane = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = plane.index;
    g.setAttribute('position', plane.attributes.position);
    g.setAttribute('uv', plane.attributes.uv);
    this.start = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.vel = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.info = new THREE.InstancedBufferAttribute(new Float32Array(max * 4).fill(-100), 4);
    this.spin = new THREE.InstancedBufferAttribute(new Float32Array(max), 1);
    for (const a of [this.start, this.vel, this.info, this.spin]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aStart', this.start);
    g.setAttribute('aVel', this.vel);
    g.setAttribute('aInfo', this.info);
    g.setAttribute('aSpin', this.spin);
    g.instanceCount = max;
    this.uniforms = { uTime: { value: 0 }, uGrav: { value: 0.12 }, uMap: { value: atlas() } };
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false }));
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.userData.noFit = true;
    parent.add(this.mesh);
  }

  /** count icons fly up and out from p (Vector3 in the parent's space). */
  emit(icon, p, { count = 4, speed = 0.12, up = 0.16, size = 0.026, life = 1.3, spread = 1, spin = 0.6 } = {}) {
    const t = this.uniforms.uTime.value;
    for (let i = 0; i < count; i++) {
      const k = this.next;
      this.next = (this.next + 1) % this.max;
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (0.5 + Math.random() * 0.7) * spread;
      this.start.setXYZ(k, p.x + (Math.random() - 0.5) * 0.01, p.y + 0.01, p.z + (Math.random() - 0.5) * 0.01);
      this.vel.setXYZ(k, Math.cos(a) * sp, up * (0.7 + Math.random() * 0.6), Math.sin(a) * sp);
      this.info.setXYZW(k, t + i * 0.03, life * (0.8 + Math.random() * 0.4), Array.isArray(icon) ? icon[i % icon.length] : icon, size * (0.8 + Math.random() * 0.4));
      this.spin.setX(k, (Math.random() - 0.5) * spin * 2);
    }
    for (const a of [this.start, this.vel, this.info, this.spin]) a.needsUpdate = true;
  }

  update(time) { this.uniforms.uTime.value = time; }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

/**
 * Small lamps (points in the parent's space): instanced bulbs plus soft halos. set(i, k, color)
 * per lamp (k = brightness 0..1, color a THREE.Color), then commit() once per frame.
 */
export function makeLamps(points, { size = 0.0035, halo = 0.03, lite = false } = {}) {
  const group = new THREE.Group();
  group.userData.noFit = true;
  const n = points.length;
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(size, 8, 6), new THREE.MeshBasicMaterial({ toneMapped: false }), n);
  bulbs.frustumCulled = false;
  const m = new THREE.Matrix4();
  points.forEach((p, i) => { bulbs.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)); bulbs.setColorAt(i, new THREE.Color()); });
  group.add(bulbs);
  let halos = null;
  let col = null;
  if (!lite) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    points.forEach((p, i) => pos.set([p.x, p.y, p.z], i * 3));
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    col = new THREE.BufferAttribute(new Float32Array(n * 3), 3);
    geo.setAttribute('color', col);
    halos = new THREE.Points(geo, new THREE.PointsMaterial({ size: halo, map: radialTexture(), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, toneMapped: false }));
    halos.frustumCulled = false;
    group.add(halos);
  }
  const c = new THREE.Color();
  return {
    group,
    n,
    set(i, k, base) {
      c.copy(base).multiplyScalar(0.18 + 0.82 * k);
      bulbs.setColorAt(i, c);
      if (col) col.setXYZ(i, base.r * k, base.g * k, base.b * k);
    },
    commit() {
      bulbs.instanceColor.needsUpdate = true;
      if (col) col.needsUpdate = true;
    },
  };
}

/** A flasher dome on a short post with a big soft halo: flash(k) 0..1. */
export function makeFlasher(token) {
  const g = new THREE.Group();
  g.userData.noFit = true;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.012, 16), new THREE.MeshStandardMaterial({ color: hex('xr-pinball-chrome'), metalness: 1, roughness: 0.2 }));
  base.position.y = 0.006;
  const domeMat = new THREE.MeshStandardMaterial({ color: hex(token), roughness: 0.15, transparent: true, opacity: 0.9, emissive: hex(token), emissiveIntensity: 0.25 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.013, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), domeMat);
  dome.position.y = 0.012;
  const haloMat = new THREE.SpriteMaterial({ map: radialTexture(), color: hex(token), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, toneMapped: false });
  const halo = new THREE.Sprite(haloMat);
  halo.position.y = 0.02;
  halo.scale.setScalar(0.16);
  g.add(base, dome, halo);
  g.userData.flash = (k) => {
    domeMat.emissiveIntensity = 0.25 + k * 3;
    haloMat.opacity = k * 0.9;
    halo.scale.setScalar(0.08 + k * 0.14);
  };
  return g;
}
