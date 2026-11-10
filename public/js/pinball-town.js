// Campaign Pinball: the 3D world above the playfield (assets/models/pinball-toys.glb, built by
// blender/build_pinball.py "toys"). The story: a campaign made in the agency's studio reaches the
// customers of the bank. Behind the arch: the client's headquarters tower (the right ramp runs
// through it; jackpot: everyone cheers, lights chase up the tower, confetti), the vault (its door
// opens for the ball lock), the agency's studio where the courier bird starts, the printing
// press for flyers, the billboard, the advisory desk (consultant and customer shake hands), the
// piggy bank whose money box fills up, and the van driving between the buildings. In the field:
// the ATM next to the branch spits out coins, coins roll down the coin chute, the megaphone turns
// on the advertising column, the mailbox sits on the e-mail bank.
import * as THREE from 'three';
import { color, font, hex } from './tokens.js';
import { t } from './i18n.js';
import { drawGlyph } from './pinball-visuals.js';
import { drawPosters, drawFigure } from './pinball-props.js';
import { HQ, VAULT } from './pinball-layout.js';
import { ICON } from './pinball-fx.js';

const fp = (x, y, h = 0) => new THREE.Vector3(x, h, -y);

/** Where the toys stand (field x, y; height above the playfield; turn about y). */
export const TOYS = {
  hq: { x: HQ.x, y: HQ.y, rot: 0 },
  vault: { x: VAULT.x, y: VAULT.y, rot: 0.35 },
  agency: { x: -0.105, y: 1.235, rot: 0.1, s: 0.62 },
  press: { x: -0.245, y: 1.085, rot: 1.25 },
  billboard: { x: 0.262, y: 1.14, rot: -0.35 },
  desk: { x: 0.165, y: 1.135, rot: -0.15 },
  piggy: { x: 0.272, y: 1.035, rot: -2.4 },
  atm: { x: 0.229, y: 0.538, rot: -1.2 },
  megaphone: { x: 0, y: 0.5, h: 0.093 },
  mailbox: { x: -0.2328, y: 0.465, h: 0.0388, rot: Math.PI / 2 },
};
/** The target groups stand in front of the headquarters (they cheer at the jackpot). */
export const PEOPLE_SPOTS = [[-0.058, 1.105], [-0.02, 1.1], [0.024, 1.1], [0.06, 1.105]];
export const PEOPLE_SCALE = 0.5;
/** The van's road behind the town. */
const ROAD = { y: 1.255, x0: -0.2, x1: 0.24 };

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

/** Puts a texture on the materials named `name` inside obj (a fresh material per toy). */
function skin(obj, name, tex, owned, glow = 0) {
  tex.flipY = false; // glTF UVs have v = 0 at the top, like the canvas
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const list = [].concat(o.material).map((m) => {
      if (m.name !== name) return m;
      const mm = new THREE.MeshStandardMaterial({ name, map: tex, roughness: 0.4, emissive: hex('xr-pinball-white'), emissiveMap: tex, emissiveIntensity: glow });
      owned.push(mm);
      return mm;
    });
    o.material = list.length === 1 ? list[0] : list;
  });
}

/** A person cut-out (transparent canvas) for the advisory desk. */
function figurePlane(g, owned, flip) {
  const ct = canvasTex(128, 192);
  drawFigure(ct.ctx, g, 64, 186, 176);
  owned.push(ct.tex);
  const mat = new THREE.MeshBasicMaterial({ map: ct.tex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, toneMapped: false });
  owned.push(mat);
  const geo = new THREE.PlaneGeometry(0.022, 0.033);
  geo.translate(0, 0.0165, 0);
  owned.push(geo);
  const m = new THREE.Mesh(geo, mat);
  if (flip) m.scale.x = -1;
  return m;
}

export function buildTown({ field, parts, lite, burst, chute }) {
  const owned = [];
  const group = new THREE.Group();
  group.userData.noFit = true;
  field.add(group);
  const place = (name, spot, parent = group) => {
    const p = parts[name]?.clone(true);
    if (!p) return null;
    p.position.copy(fp(spot.x ?? 0, spot.y ?? 0, spot.h ?? 0));
    p.rotation.y = spot.rot ?? 0;
    if (spot.s) p.scale.setScalar(spot.s);
    p.traverse((o) => { if (o.isMesh) { o.castShadow = !lite; o.receiveShadow = true; } });
    parent.add(p);
    return p;
  };

  // ---- the headquarters tower: window facades (lights chase up at the jackpot), sign ----
  const hq = place('PinHQ', TOYS.hq);
  const face = canvasTex(128, 512);
  const FLOORS = 16;
  const drawFace = (lit, chase) => {
    const c = face.ctx;
    c.fillStyle = color('xr-pinball-hq');
    c.fillRect(0, 0, 128, 512);
    for (let f = 0; f < FLOORS; f++) {
      const y = 512 - (f + 1) * (512 / FLOORS) + 6;
      for (let k = 0; k < 4; k++) {
        const on = chase >= 0 ? (f <= chase ? 1 : 0.15) : lit[f * 4 + k];
        c.fillStyle = color(on > 0.5 ? 'xr-pinball-window' : 'xr-pinball-hq-glass');
        c.globalAlpha = 0.35 + 0.65 * on;
        c.fillRect(8 + k * 30, y, 24, 512 / FLOORS - 12);
      }
    }
    c.globalAlpha = 1;
    c.fillStyle = color('xr-pinball-accent');
    c.fillRect(0, 0, 128, 10);
    face.tex.needsUpdate = true;
  };
  const lit = Array.from({ length: FLOORS * 4 }, () => (Math.random() < 0.55 ? 1 : 0));
  drawFace(lit, -1);
  owned.push(face.tex);
  if (hq) skin(hq, 'PbTowerFace', face.tex, owned, 0.8);
  const sign = canvasTex(256, 80);
  {
    const c = sign.ctx;
    c.fillStyle = color('xr-pinball-accent');
    c.fillRect(0, 0, 256, 80);
    c.fillStyle = color('xr-pinball-white');
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitFont(c, t('pinballTownHq'), 54, 236);
    c.fillText(t('pinballTownHq'), 128, 42);
    owned.push(sign.tex);
    if (hq) skin(hq, 'PbHqSign', sign.tex, owned, 1);
  }
  let mast = null;
  hq?.traverse((o) => {
    if (!o.isMesh) return;
    o.material = [].concat(o.material).map((m) => {
      if (m.name !== 'PbBeacon') return m;
      mast = new THREE.MeshBasicMaterial({ color: hex('xr-pinball-beacon'), toneMapped: false });
      owned.push(mast);
      return mast;
    });
    if (o.material.length === 1) o.material = o.material[0];
  });

  // ---- the vault with its door (opens for the ball lock) ----
  const vaultGrp = new THREE.Group();
  vaultGrp.position.copy(fp(TOYS.vault.x, TOYS.vault.y, 0));
  vaultGrp.rotation.y = TOYS.vault.rot;
  group.add(vaultGrp);
  place('PinVault', {}, vaultGrp);
  const door = place('PinVaultDoor', { x: -0.0195, y: 0, h: 0.028 }, vaultGrp);
  door?.position.set(-0.0195, 0.028, 0.001);

  // ---- the agency's studio, where the campaign is made ----
  const agency = place('PinAgency', TOYS.agency);
  {
    const s = canvasTex(512, 160);
    s.ctx.fillStyle = color('xr-pinball-agency-trim');
    s.ctx.fillRect(0, 0, 512, 160);
    s.ctx.fillStyle = color('xr-pinball-white');
    s.ctx.textAlign = 'center';
    s.ctx.textBaseline = 'middle';
    fitFont(s.ctx, t('pinballTownSign'), 92, 470);
    s.ctx.fillText(t('pinballTownSign'), 256, 84);
    owned.push(s.tex);
    if (agency) skin(agency, 'PbSign', s.tex, owned, 0.9);
  }

  // ---- printing press (rollers turn, flyers fly) ----
  const press = place('PinPress', TOYS.press);
  const rollers = [];
  if (press) {
    for (const [z, h] of [[-0.004, 0.03], [0.006, 0.0405]]) {
      const r = place('PinRoller', { x: 0, y: 0, h }, press);
      if (r) { r.position.set(0, h, z); rollers.push(r); }
    }
  }

  // ---- billboard with the campaign poster ----
  const billboard = place('PinBillboard', TOYS.billboard);
  const bill = canvasTex(512, 320);
  const posters = document.createElement('canvas');
  posters.width = 1024;
  posters.height = 256;
  let billSet = 0;
  const drawBill = () => {
    drawPosters(posters.getContext('2d'), Math.floor(billSet / 4));
    const k = billSet % 4;
    bill.ctx.fillStyle = color('xr-pinball-white');
    bill.ctx.fillRect(0, 0, 512, 320);
    bill.ctx.drawImage(posters, k * 256 + 10, 16, 236, 224, 8, 8, 496, 304);
    bill.tex.needsUpdate = true;
  };
  drawBill();
  owned.push(bill.tex);
  if (billboard) skin(billboard, 'PbBillboard', bill.tex, owned, 0.55);

  // ---- advisory desk: consultant and customer ----
  const deskGrp = new THREE.Group();
  deskGrp.position.copy(fp(TOYS.desk.x, TOYS.desk.y, 0));
  deskGrp.rotation.y = TOYS.desk.rot;
  group.add(deskGrp);
  place('PinDesk', {}, deskGrp);
  const consultant = figurePlane('founders', owned, false);
  const customer = figurePlane('seniors', owned, true);
  consultant.position.set(-0.03, 0.006, 0.004);
  customer.position.set(0.03, 0.006, 0.004);
  deskGrp.add(consultant, customer);

  // ---- piggy bank and the money box that fills with coins ----
  const piggy = place('PinPiggy', TOYS.piggy);
  const coinPart = parts.PinCoin;
  const stackMax = 14;
  const stack = new THREE.InstancedMesh(coinPart.children[0]?.geometry ?? coinPart.geometry, (coinPart.children[0] ?? coinPart).material, stackMax);
  stack.count = 0;
  stack.userData.noFit = true;
  if (piggy) piggy.add(stack);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < stackMax; i++) stack.setMatrixAt(i, m4.makeTranslation((i % 2) * 0.002 - 0.032, 0.002 + i * 0.0017, ((i * 7) % 3) * 0.0012 - 0.001));
  let savings = 0;

  // ---- ATM by the branch ----
  const atm = place('PinAtm', TOYS.atm);
  const atmScr = canvasTex(128, 96);
  const drawAtm = (paying) => {
    const c = atmScr.ctx;
    c.fillStyle = color(paying ? 'xr-pinball-funnel-3' : 'xr-pinball-ai');
    c.fillRect(0, 0, 128, 96);
    c.fillStyle = color('xr-pinball-dark');
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = font('black', 40);
    c.fillText(paying ? '+' : '...', 64, 50);
    atmScr.tex.needsUpdate = true;
  };
  drawAtm(false);
  owned.push(atmScr.tex);
  if (atm) skin(atm, 'PbAtmScreen', atmScr.tex, owned, 1);

  // ---- van on its road, the courier bird, the megaphone, the mailbox ----
  const van = place('PinVan', { x: ROAD.x0, y: ROAD.y, rot: 0 });
  {
    const w = canvasTex(256, 128);
    const c = w.ctx;
    c.fillStyle = color('xr-pinball-accent');
    c.fillRect(0, 0, 256, 128);
    c.fillStyle = color('xr-pinball-white');
    c.fillRect(0, 84, 256, 10);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    fitFont(c, t('pinballTownVan'), 46, 230);
    c.fillText(t('pinballTownVan'), 128, 50);
    owned.push(w.tex);
    if (van) skin(van, 'PbWrap', w.tex, owned, 0.25);
  }
  const bird = new THREE.Group();
  const body = parts.PinBird?.clone(true);
  const wingR = parts.PinWing?.clone(true);
  const wingL = parts.PinWing?.clone(true);
  if (body) bird.add(body);
  if (wingR && wingL) { wingL.scale.z = -1; bird.add(wingR, wingL); }
  bird.scale.setScalar(1.3);
  bird.visible = false;
  group.add(bird);
  const flight = { t: 1, from: fp(TOYS.agency.x, TOYS.agency.y, 0.07), to: fp(HQ.x, HQ.y, 0.16), next: 3 };
  const mega = place('PinMegaphone', TOYS.megaphone);
  place('PinMailbox', TOYS.mailbox);
  // Coins rolling down the coin chute (one draw call).
  const runners = new THREE.InstancedMesh(coinPart.children[0]?.geometry ?? coinPart.geometry, (coinPart.children[0] ?? coinPart).material, 6);
  runners.userData.noFit = true;
  runners.frustumCulled = false;
  group.add(runners);

  const st = { mega: 0.5, chase: -1, chaseT: 0, door: 0, doorWant: 0, press: 0, shake: 0, atm: 0, coinSpeed: 0.08, coinT: 0, windowsT: 0, vanX: ROAD.x0, vanDir: 1 };
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const tmp = new THREE.Vector3();
  const api = {
    group, owned,
    /** A channel was hit: the scene that belongs to it moves. */
    hit(ch) {
      if (ch === 'poster') {
        st.press = 1.5;
        billSet += 1;
        drawBill();
        burst?.(ICON.poster, TOYS.press.x, TOYS.press.y, 0.05, { count: lite ? 3 : 6, up: 0.14, speed: 0.08, size: 0.022 });
        st.mega = 9;
      }
      if (ch === 'branch') {
        st.atm = 1.2;
        drawAtm(true);
        burst?.(ICON.coin, TOYS.atm.x, TOYS.atm.y, 0.04, { count: lite ? 4 : 8, up: 0.16, speed: 0.12, size: 0.02 });
        st.shake = 1.2;
        savings = Math.min(stackMax, savings + 2);
        stack.count = savings;
      }
      if (ch === 'email' || ch === 'social' || ch === 'app') api.courier();
    },
    /** The courier bird carries a letter from the agency to the headquarters. */
    courier() { if (flight.t >= 1) flight.t = 0; },
    /** The ball passes through the tower: a quick light run. */
    hqPass() { st.chase = 0; st.chaseT = 0; },
    /** The jackpot: lights chase up the tower again and again, confetti. */
    hqCheer() {
      st.chase = 0;
      st.chaseT = -2;
      if (burst) {
        for (let k = 0; k < (lite ? 1 : 3); k++) {
          burst([ICON.confetti1, ICON.confetti2, ICON.confetti3, ICON.star], HQ.x, HQ.y, 0.18, { count: lite ? 8 : 14, up: 0.18, speed: 0.16, size: 0.018, life: 1.8 });
        }
        burst(ICON.coin, HQ.x, HQ.y, 0.1, { count: lite ? 4 : 8, up: 0.2, speed: 0.14, size: 0.02 });
      }
    },
    /** The vault door: open (true) or shut. */
    vault(open) { st.doorWant = open ? 1 : 0; },
    /** A ball took the coin chute: the coins roll fast for a while. */
    coins() { st.coinSpeed = 0.5; },
    update(dt, time) {
      st.mega += (0.5 - st.mega) * Math.min(1, dt * 1.2);
      if (mega) mega.rotation.y += st.mega * dt;
      if (mast) mast.color.set(color('xr-pinball-beacon')).multiplyScalar(Math.floor(time * 1.5) % 2 ? 1 : 0.25);
      // Tower windows: the chase climbs floor by floor; otherwise a window changes now and then.
      if (st.chase >= 0) {
        st.chaseT += dt;
        const f = Math.floor(Math.max(0, st.chaseT) * 24) % (FLOORS + 4);
        if (f !== st.chase) { st.chase = f; drawFace(lit, f); }
        if (st.chaseT > 0.85) { st.chase = -1; drawFace(lit, -1); }
      } else {
        st.windowsT += dt;
        if (st.windowsT > (lite ? 2 : 0.9)) {
          st.windowsT = 0;
          const i = Math.floor(Math.random() * lit.length);
          lit[i] = 1 - lit[i];
          drawFace(lit, -1);
        }
      }
      // Vault door swings on its hinge.
      st.door += (st.doorWant - st.door) * Math.min(1, dt * 3);
      if (door) door.rotation.y = -st.door * 1.9;
      // Press rollers.
      st.press = Math.max(0, st.press - dt);
      for (const [i, r] of rollers.entries()) r.rotation.x += (i ? -1 : 1) * dt * (1.5 + st.press * 14);
      // ATM, desk handshake.
      if (st.atm > 0) { st.atm -= dt; if (st.atm <= 0) drawAtm(false); }
      st.shake = Math.max(0, st.shake - dt);
      const lean = st.shake > 0 ? 0.12 + Math.sin(time * 18) * 0.06 : 0;
      consultant.rotation.z = -lean;
      customer.rotation.z = lean;
      consultant.position.y = 0.006 + (st.shake > 0 ? Math.abs(Math.sin(time * 18)) * 0.002 : 0);
      // Van drives back and forth behind the town.
      if (van) {
        st.vanX += st.vanDir * dt * 0.05;
        if (st.vanX > ROAD.x1) { st.vanX = ROAD.x1; st.vanDir = -1; }
        if (st.vanX < ROAD.x0) { st.vanX = ROAD.x0; st.vanDir = 1; }
        van.position.copy(fp(st.vanX, ROAD.y, 0));
        van.rotation.y += ((st.vanDir > 0 ? 0 : Math.PI) - van.rotation.y) * Math.min(1, dt * 4);
      }
      // Courier bird: every few seconds (and on hits) from the agency to the headquarters.
      flight.next -= dt;
      if (flight.next <= 0 && flight.t >= 1) { flight.t = 0; flight.next = 7 + Math.random() * 4; }
      if (flight.t < 1) {
        flight.t = Math.min(1, flight.t + dt / 2.6);
        const u = flight.t;
        tmp.lerpVectors(flight.from, flight.to, u);
        tmp.y += Math.sin(u * Math.PI) * 0.08;
        tmp.x += Math.sin(u * Math.PI * 2) * 0.03;
        const ahead = new THREE.Vector3().lerpVectors(flight.from, flight.to, Math.min(1, u + 0.02));
        bird.position.copy(tmp);
        bird.rotation.y = Math.atan2(-(ahead.z - tmp.z), ahead.x - tmp.x);
        const flap = Math.sin(time * 26) * 0.7;
        if (wingR) wingR.rotation.x = flap;
        if (wingL) wingL.rotation.x = -flap;
        bird.visible = u < 0.98;
      } else bird.visible = false;
      // Coins rolling down the chute.
      st.coinSpeed += (0.08 - st.coinSpeed) * Math.min(1, dt * 0.5);
      st.coinT += dt * st.coinSpeed;
      if (chute) {
        for (let i = 0; i < 6; i++) {
          const s = (((st.coinT + i / 6) % 1) * 0.7 + 0.25) * chute.total;
          const p = chute.at(s);
          q.setFromAxisAngle(tmp.set(0, 0, 1), Math.PI / 2);
          runners.setMatrixAt(i, m4.compose(fp(p.x, p.y, p.h + 0.006), q.multiply(new THREE.Quaternion().setFromAxisAngle(tmp.set(1, 0, 0), time * 8 + i)), one));
        }
        runners.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() { for (const o of owned) o?.dispose?.(); owned.length = 0; },
  };
  return api;
}
