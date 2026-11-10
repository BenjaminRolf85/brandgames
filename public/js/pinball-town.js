// Campaign Pinball: the agency town, the 3D toys on the playfield (assets/models/pinball-toys.glb,
// blender/build_pinball.py "toys"). Behind the top arch, where the two ramps wind through:
// the agency's creative studio with its rooftop sign, the video studio (camera on a dolly,
// studio light, a screen), the broadcast tower with its blinking beacon, the billboard on
// stilts with a changing campaign poster, the like wheel, the delivery van with its campaign
// wrap. In the field: the megaphone that turns on top of the advertising column and the
// mailbox on the e-mail plastic. The app paints the sign, screen, poster and wrap from tokens.
import * as THREE from 'three';
import { color, font, hex } from './tokens.js';
import { t } from './i18n.js';
import { drawGlyph } from './pinball-visuals.js';
import { drawPosters } from './pinball-props.js';
import { radialTexture } from './robot-visuals.js';

const fp = (x, y, h = 0) => new THREE.Vector3(x, h, -y);

/** Where the toys stand (field x, y; height above the playfield; turn about y). */
export const TOYS = {
  agency: { x: 0.0, y: 1.2, rot: 0 },
  studio: { x: -0.135, y: 1.11, rot: 0.15 },
  tower: { x: -0.238, y: 1.17, rot: 0.4 },
  billboard: { x: 0.262, y: 1.13, rot: -0.35 },
  wheel: { x: 0.135, y: 1.11, rot: -0.1 },
  van: { x: 0.258, y: 1.045, rot: 2.2 },
  megaphone: { x: 0, y: 0.5, h: 0.093 },
  mailbox: { x: -0.2328, y: 0.465, h: 0.0388 },
};
/** The target groups stand in the town (young people, families, founders, seniors). */
export const PEOPLE_SPOTS = [[-0.1, 1.05], [-0.032, 1.088], [0.036, 1.088], [0.165, 1.05]];
export const PEOPLE_SCALE = 0.66;

function canvasTex(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { c, ctx: c.getContext('2d'), tex };
}

function fitFont(ctx, text, px, maxW, weight = 'black') {
  let p = px;
  ctx.font = font(weight, p);
  while (ctx.measureText(text).width > maxW && p > 8) { p -= 1; ctx.font = font(weight, p); }
}

/** Puts a texture on every mesh material of `obj` named `name` (a clone per toy). */
function skin(obj, name, tex, owned, glow = 0) {
  // glTF UVs have v = 0 at the top (like the canvas).
  tex.flipY = false;
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const list = [].concat(o.material).map((m) => {
      if (m.name !== name) return m;
      const mm = new THREE.MeshStandardMaterial({ name, map: tex, roughness: 0.45, emissive: hex('xr-pinball-white'), emissiveMap: tex, emissiveIntensity: glow });
      owned.push(mm);
      return mm;
    });
    o.material = list.length === 1 ? list[0] : list;
  });
}

export function buildTown({ field, parts, lite }) {
  const owned = [];
  const group = new THREE.Group();
  group.userData.noFit = true;
  field.add(group);
  const place = (name, spot) => {
    const p = parts[name]?.clone(true);
    if (!p) return null;
    p.position.copy(fp(spot.x, spot.y, spot.h ?? 0));
    p.rotation.y = spot.rot ?? 0;
    p.traverse((o) => { if (o.isMesh) { o.castShadow = !lite; o.receiveShadow = true; } });
    group.add(p);
    return p;
  };
  // The agency with its rooftop sign.
  const agency = place('PinAgency', TOYS.agency);
  {
    const s = canvasTex(512, 160);
    const g = s.ctx.createLinearGradient(0, 0, 512, 0);
    g.addColorStop(0, color('xr-pinball-district-1'));
    g.addColorStop(1, color('xr-pinball-district-6'));
    s.ctx.fillStyle = g;
    s.ctx.fillRect(0, 0, 512, 160);
    s.ctx.fillStyle = color('xr-pinball-white');
    s.ctx.textAlign = 'center';
    s.ctx.textBaseline = 'middle';
    fitFont(s.ctx, t('pinballTownSign'), 92, 470);
    s.ctx.fillText(t('pinballTownSign'), 256, 84);
    owned.push(s.tex);
    if (agency) skin(agency, 'PbSign', s.tex, owned, 0.9);
  }
  // The video studio: its screen shows the campaign's video (a play button over color bands).
  const studio = place('PinStudio', TOYS.studio);
  const screen = canvasTex(256, 160);
  const drawScreen = (k) => {
    const c = screen.ctx;
    const bands = ['xr-pinball-district-1', 'xr-pinball-district-2', 'xr-pinball-district-3', 'xr-pinball-district-4', 'xr-pinball-district-5', 'xr-pinball-district-6'];
    bands.forEach((b, i) => { c.fillStyle = color(b); c.fillRect(((i + k) % 6) * 43, 0, 44, 160); });
    c.fillStyle = color('xr-pinball-dark');
    c.globalAlpha = 0.35;
    c.fillRect(0, 0, 256, 160);
    c.globalAlpha = 1;
    drawGlyph(c, 'video', 128, 80, 110, color('xr-pinball-white'), 2.4);
    screen.tex.needsUpdate = true;
  };
  drawScreen(0);
  owned.push(screen.tex);
  if (studio) skin(studio, 'PbScreen', screen.tex, owned, 1.0);
  // The broadcast tower and its beacon (blinks; brighter when a campaign goes out).
  const tower = place('PinTower', TOYS.tower);
  let beacon = null;
  tower?.traverse((o) => {
    if (!o.isMesh) return;
    o.material = [].concat(o.material).map((m) => {
      if (m.name !== 'PbBeacon') return m;
      beacon = new THREE.MeshBasicMaterial({ name: 'PbBeacon', color: hex('xr-pinball-beacon'), toneMapped: false });
      owned.push(beacon);
      return beacon;
    });
    if (o.material.length === 1) o.material = o.material[0];
  });
  const beaconHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialTexture(), color: hex('xr-pinball-beacon'), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
  owned.push(beaconHalo.material);
  beaconHalo.scale.setScalar(0.05);
  beaconHalo.position.copy(fp(TOYS.tower.x, TOYS.tower.y, 0.184));
  group.add(beaconHalo);
  // The billboard: a campaign poster that changes when the poster channel is hit.
  const billboard = place('PinBillboard', TOYS.billboard);
  const bill = canvasTex(512, 320);
  const posters = document.createElement('canvas');
  posters.width = 1024;
  posters.height = 256;
  let billSet = 0;
  const drawBill = () => {
    drawPosters(posters.getContext('2d'), Math.floor(billSet / 4));
    const k = billSet % 4;
    const c = bill.ctx;
    c.fillStyle = color('xr-pinball-white');
    c.fillRect(0, 0, 512, 320);
    c.drawImage(posters, k * 256 + 10, 16, 236, 224, 8, 8, 496, 304);
    bill.tex.needsUpdate = true;
  };
  drawBill();
  owned.push(bill.tex);
  if (billboard) skin(billboard, 'PbBillboard', bill.tex, owned, 0.55);
  // The like wheel: the wheel turns (faster with every social media hit).
  place('PinWheelStand', TOYS.wheel);
  const wheel = parts.PinWheel?.clone(true);
  if (wheel) {
    const holder = new THREE.Group();
    holder.position.copy(fp(TOYS.wheel.x, TOYS.wheel.y, 0.056));
    holder.rotation.y = TOYS.wheel.rot;
    holder.add(wheel);
    group.add(holder);
    // Hearts on the cabins (one sprite each would be 8 draw calls; one plane per side instead).
    const hc = canvasTex(256, 256);
    const c = hc.ctx;
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      const x = 128 + Math.cos(a) * 102;
      const y = 128 - Math.sin(a) * 102;
      c.fillStyle = color('xr-pinball-white');
      c.save();
      c.translate(x, y);
      c.scale(0.55, 0.55);
      c.beginPath();
      c.moveTo(0, 12);
      c.bezierCurveTo(-26, -4, -14, -26, 0, -12);
      c.bezierCurveTo(14, -26, 26, -4, 0, 12);
      c.fill();
      c.restore();
    }
    owned.push(hc.tex);
    const hm = new THREE.MeshBasicMaterial({ map: hc.tex, transparent: true, depthWrite: false, toneMapped: false });
    owned.push(hm);
    for (const z of [0.0052, -0.0052]) {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.1), hm);
      owned.push(plane.geometry);
      plane.position.z = z;
      if (z < 0) plane.rotation.y = Math.PI;
      wheel.add(plane);
    }
  }
  // The delivery van with its campaign wrap.
  const van = place('PinVan', TOYS.van);
  {
    const w = canvasTex(256, 128);
    const c = w.ctx;
    ['xr-pinball-district-1', 'xr-pinball-district-2', 'xr-pinball-district-3', 'xr-pinball-district-5'].forEach((tok, i) => {
      c.fillStyle = color(tok);
      c.beginPath();
      c.moveTo(i * 64 - 30, 128);
      c.lineTo(i * 64 + 40, 0);
      c.lineTo(i * 64 + 104, 0);
      c.lineTo(i * 64 + 34, 128);
      c.fill();
    });
    c.fillStyle = color('xr-pinball-white');
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitFont(c, t('pinballTownVan'), 46, 230);
    c.lineWidth = 8;
    c.strokeStyle = color('xr-pinball-dark');
    c.strokeText(t('pinballTownVan'), 128, 66);
    c.fillText(t('pinballTownVan'), 128, 66);
    owned.push(w.tex);
    if (van) skin(van, 'PbWrap', w.tex, owned, 0.25);
  }
  // The megaphone turning on top of the advertising column, the mailbox.
  const mega = place('PinMegaphone', TOYS.megaphone);
  place('PinMailbox', { ...TOYS.mailbox, rot: Math.PI / 2 });
  const state = { wheel: 0.6, mega: 0.5, beacon: 0, screen: 0, screenT: 0 };
  return {
    group, owned,
    /** A channel was hit: the matching toy reacts. */
    hit(ch) {
      if (ch === 'social') state.wheel = Math.min(6, state.wheel + 1.2);
      if (ch === 'poster') { state.mega = 9; billSet += 1; drawBill(); }
      if (ch === 'video') state.screen = 1;
      state.beacon = 1;
    },
    update(dt, time) {
      state.wheel += (0.6 - state.wheel) * Math.min(1, dt * 0.6);
      if (wheel) wheel.rotation.z -= state.wheel * dt;
      state.mega += (0.5 - state.mega) * Math.min(1, dt * 1.2);
      if (mega) mega.rotation.y += state.mega * dt;
      state.beacon = Math.max(0, state.beacon - dt * 0.7);
      const blink = Math.floor(time * 1.6) % 2 === 0 || state.beacon > 0 ? 1 : 0.15;
      if (beacon) beacon.color.set(color('xr-pinball-beacon')).multiplyScalar(0.25 + 0.75 * blink);
      beaconHalo.material.opacity = blink * (0.55 + 0.45 * state.beacon);
      state.screen = Math.max(0, state.screen - dt * 0.5);
      state.screenT += dt * (1 + state.screen * 8);
      if (state.screenT > 0.5) { state.screenT = 0; drawScreen(Math.floor(time * 2)); }
    },
    dispose() { for (const o of owned) o?.dispose?.(); owned.length = 0; },
  };
}
