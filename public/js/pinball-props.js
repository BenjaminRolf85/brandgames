// Campaign Pinball: the props that make every channel read as marketing at a glance.
//   makePhoneGate     the app ramp starts in a giant phone: app tiles, a notification badge that
//                     counts up and a push banner on every app hit
//   makeTvGate        the video ramp starts under an LED wall that plays a short ad when hit
//   drawPosters       the advertising column's poster band (sets that change with every hit)
//   makeEnvelope      e-mail drop targets wear an envelope with an @ seal
//   makeBubbleTop     social media bumpers wear a chat bubble with a heart, like or comment
//   makeBranchFx      the branch office: a sign, a door that opens and a customer walking in
//   makeCharacters    the four target groups as cardboard cut-outs behind the top arch: they
//                     light up when their group is targeted, wave when it is reached and cheer
//                     for a new customer
// Everything is drawn from the design tokens; texts come from pinball-text.js.
import * as THREE from 'three';
import { color, hex, font } from './tokens.js';
import { t } from './i18n.js';
import { radialTexture } from './robot-visuals.js';
import { fp, drawGlyph, CH_TOKEN } from './pinball-visuals.js';
import { CHANNELS, GROUPS } from './pinball-layout.js';

const additive = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false };

function canvasTex(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { c, ctx: c.getContext('2d'), tex };
}

/** A rounded-rectangle outline with an opening at the bottom (for the ball), in the x / y plane. */
function frameShape(w, h, r, ow = 0, oh = 0) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(-w / 2, h - r);
  s.quadraticCurveTo(-w / 2, h, -w / 2 + r, h);
  s.lineTo(w / 2 - r, h);
  s.quadraticCurveTo(w / 2, h, w / 2, h - r);
  s.lineTo(w / 2, 0);
  if (ow) {
    s.lineTo(ow / 2, 0);
    s.lineTo(ow / 2, oh);
    s.lineTo(-ow / 2, oh);
    s.lineTo(-ow / 2, 0);
  }
  s.closePath();
  return s;
}

/** Group standing at a ramp's mouth, facing down the ramp (towards the flippers). */
function atMouth(ramp, into = 0.03) {
  const { M, d } = ramp.mouth;
  const g = new THREE.Group();
  g.userData.noFit = true;
  g.position.copy(fp(M[0] + d[0] * into, M[1] + d[1] * into, 0));
  g.rotation.y = Math.atan2(-d[0], d[1]);
  return g;
}

function wrapLines(ctx, text, maxW) {
  const out = [];
  let line = '';
  for (const w of String(text).split(' ')) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width <= maxW || !line) line = test;
    else { out.push(line); line = w; }
  }
  if (line) out.push(line);
  return out;
}

// ---------- the giant phone (app ramp) ----------

export function makePhoneGate(ramp) {
  const g = atMouth(ramp, 0.028);
  const W = 0.09;
  const H = 0.145;
  const body = new THREE.Mesh(
    new THREE.ExtrudeGeometry(frameShape(W, H, 0.015, 0.064, 0.05), { depth: 0.012, bevelEnabled: true, bevelSize: 0.0025, bevelThickness: 0.0025, bevelSegments: 3, curveSegments: 8 }),
    new THREE.MeshPhysicalMaterial({ color: hex('xr-pinball-phone'), metalness: 0.6, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 }),
  );
  body.position.z = -0.006;
  body.castShadow = true;
  g.add(body);
  // Screen: app tiles, the badge and a push banner.
  const SW = 0.076;
  const SH = 0.08;
  const scr = canvasTex(240, 252);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), new THREE.MeshBasicMaterial({ map: scr.tex, toneMapped: false }));
  screen.position.set(0, 0.056 + SH / 2, 0.0096); // in front of the bevelled body
  // Speaker slot above the screen.
  const slot = new THREE.Mesh(new THREE.PlaneGeometry(0.016, 0.0025), new THREE.MeshBasicMaterial({ color: hex('xr-pinball-dark') }));
  slot.position.set(0, 0.056 + SH + 0.0045, 0.0096);
  g.add(slot);
  g.add(screen);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(SW * 1.8, SH * 1.5), new THREE.MeshBasicMaterial({ map: radialTexture(), color: hex('xr-pinball-ch-app'), ...additive, opacity: 0.35 }));
  glow.position.set(0, 0.056 + SH / 2, -0.012);
  g.add(glow);
  const state = { badge: 0, pop: 0, banner: 0 };
  const draw = () => {
    const { ctx } = scr;
    const Wc = 240;
    const Hc = 252;
    const bg = ctx.createLinearGradient(0, 0, Wc, Hc);
    bg.addColorStop(0, color('xr-pinball-ch-app'));
    bg.addColorStop(1, color('xr-pinball-ch-email'));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, Wc, Hc);
    // Status bar.
    ctx.fillStyle = color('xr-pinball-sticker');
    ctx.globalAlpha = 0.85;
    ctx.fillRect(18, 14, 34, 8);
    for (let i = 0; i < 4; i++) ctx.fillRect(170 + i * 9, 22 - i * 3, 6, 4 + i * 3);
    ctx.fillRect(208, 12, 18, 10);
    ctx.globalAlpha = 1;
    // App tiles: the six channels and two more; the campaign app (big) with the badge.
    const tw = 46;
    CHANNELS.forEach((ch, i) => {
      const x = 22 + (i % 3) * 72;
      const y = 136 + Math.floor(i / 3) * 58;
      ctx.fillStyle = color(CH_TOKEN[ch]);
      ctx.beginPath();
      ctx.roundRect(x, y, tw, tw, 12);
      ctx.fill();
      drawGlyph(ctx, ch, x + tw / 2, y + tw / 2, 30, color('xr-pinball-sticker'), 2.4);
    });
    // The campaign app: big tile at the top with the notification badge.
    ctx.fillStyle = color('xr-pinball-sticker');
    ctx.beginPath();
    ctx.roundRect(78, 30, 84, 84, 22);
    ctx.fill();
    drawGlyph(ctx, 'app', 120, 72, 56, color('xr-pinball-ch-app'), 2.6);
    if (state.badge > 0) {
      const r = 20 + state.pop * 9;
      ctx.fillStyle = color('xr-pinball-accent');
      ctx.beginPath();
      ctx.arc(160, 34, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color('xr-pinball-sticker');
      ctx.font = font('black', r * 1.15);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(state.badge), 160, 36);
    }
    // Push banner.
    if (state.banner > 0) {
      ctx.globalAlpha = Math.min(1, state.banner * 3);
      ctx.fillStyle = color('xr-pinball-sticker');
      ctx.beginPath();
      ctx.roundRect(10, 26, 220, 64, 14);
      ctx.fill();
      ctx.fillStyle = color('xr-pinball-apron-ink');
      ctx.font = font('black', 20);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      wrapLines(ctx, t('pinballAppPush'), 196).slice(0, 2).forEach((ln, i) => ctx.fillText(ln, 22, 38 + i * 24));
      ctx.globalAlpha = 1;
    }
    scr.tex.needsUpdate = true;
  };
  draw();
  let last = '';
  return {
    group: g,
    /** An app hit: the badge counts up and a push banner slides in. */
    hit() { state.badge += 1; state.pop = 1; state.banner = 1.6; },
    update(dt) {
      state.pop = Math.max(0, state.pop - dt * 3);
      state.banner = Math.max(0, state.banner - dt);
      const key = `${state.badge}|${Math.round(state.pop * 6)}|${state.banner > 0}`;
      if (key !== last) { last = key; draw(); }
      glow.material.opacity = 0.3 + state.pop * 0.6;
    },
  };
}

// ---------- the LED wall (video ramp) ----------

export function makeTvGate(ramp) {
  const g = atMouth(ramp, 0.03);
  const W = 0.13;
  const H = 0.08;
  const y0 = 0.054;
  const frameMat = new THREE.MeshPhysicalMaterial({ color: hex('xr-pinball-phone'), metalness: 0.5, roughness: 0.3, clearcoat: 1 });
  const frame = new THREE.Mesh(new THREE.ExtrudeGeometry(frameShape(W, H, 0.008), { depth: 0.01, bevelEnabled: true, bevelSize: 0.002, bevelThickness: 0.002, bevelSegments: 2 }), frameMat);
  frame.position.set(0, y0, -0.005);
  frame.castShadow = true;
  g.add(frame);
  for (const x of [-0.05, 0.05]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0045, y0, 10), new THREE.MeshStandardMaterial({ color: hex('xr-pinball-chrome'), metalness: 1, roughness: 0.2 }));
    leg.position.set(x, y0 / 2, 0);
    leg.castShadow = true;
    g.add(leg);
  }
  const SW = 0.118;
  const SH = 0.066;
  const scr = canvasTex(320, 180);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), new THREE.MeshBasicMaterial({ map: scr.tex, toneMapped: false }));
  screen.position.set(0, y0 + H / 2, 0.0078);
  g.add(screen);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(SW * 1.7, SH * 2), new THREE.MeshBasicMaterial({ map: radialTexture(), color: hex('xr-pinball-ch-video'), ...additive, opacity: 0.3 }));
  glow.position.set(0, y0 + H / 2, -0.008);
  g.add(glow);
  let playT = -1;
  let frameT = 0;
  const leds = (ctx) => {
    // LED pixel grid on top of every frame.
    ctx.fillStyle = color('xr-pinball-led-grid');
    for (let x = 0; x < 320; x += 4) ctx.fillRect(x, 0, 1, 180);
    for (let y = 0; y < 180; y += 4) ctx.fillRect(0, y, 320, 1);
  };
  const idle = () => {
    const { ctx } = scr;
    const bg = ctx.createLinearGradient(0, 0, 320, 180);
    bg.addColorStop(0, color('xr-pinball-cabinet-dark'));
    bg.addColorStop(1, color('xr-pinball-field-2'));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, 320, 180);
    ctx.fillStyle = color('xr-pinball-ch-video');
    ctx.beginPath();
    ctx.arc(160, 78, 40, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color('xr-pinball-sticker');
    ctx.beginPath();
    ctx.moveTo(146, 56);
    ctx.lineTo(182, 78);
    ctx.lineTo(146, 100);
    ctx.fill();
    ctx.font = font('black', 26);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(t('pinballCh_video').toUpperCase(), 160, 148);
    leds(ctx);
    scr.tex.needsUpdate = true;
  };
  /** One frame of the ad: u 0..1 over three short scenes. */
  const ad = (u, time) => {
    const { ctx } = scr;
    const scene = Math.min(2, Math.floor(u * 3));
    const k = u * 3 - scene;
    const tones = ['xr-pinball-ch-social', 'xr-pinball-ch-app', 'xr-pinball-ch-poster'];
    ctx.fillStyle = color(tones[scene]);
    ctx.fillRect(0, 0, 320, 180);
    // Rotating light rays.
    ctx.save();
    ctx.translate(160, 90);
    ctx.rotate(time * 1.5);
    ctx.fillStyle = color('xr-pinball-sticker');
    ctx.globalAlpha = 0.18;
    for (let i = 0; i < 12; i++) {
      ctx.rotate(Math.PI / 6);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(260, -30);
      ctx.lineTo(260, 30);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (scene === 0) {
      const s = 0.4 + Math.min(1, k * 2) * 0.8 + Math.sin(time * 12) * 0.04;
      ctx.save();
      ctx.translate(160, 90);
      ctx.scale(s, s);
      ctx.fillStyle = color('xr-pinball-sticker');
      ctx.beginPath();
      ctx.arc(0, 0, 54, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color('xr-pinball-ch-video');
      ctx.beginPath();
      ctx.moveTo(-18, -30);
      ctx.lineTo(32, 0);
      ctx.lineTo(-18, 30);
      ctx.fill();
      ctx.restore();
    } else {
      const text = t(scene === 1 ? 'pinballAd1' : 'pinballAd2');
      const x = 160 + (1 - Math.min(1, k * 3)) * 320;
      ctx.font = font('black', 44);
      let px = 44;
      while (ctx.measureText(text).width > 296 && px > 20) { px -= 2; ctx.font = font('black', px); }
      ctx.lineWidth = 8;
      ctx.strokeStyle = color('xr-pinball-apron-ink');
      ctx.strokeText(text, x, 80);
      ctx.fillStyle = color('xr-pinball-sticker');
      ctx.fillText(text, x, 80);
      ctx.font = font('bold', 22);
      ctx.fillText(t(scene === 1 ? 'pinballAd1b' : 'pinballAd2b'), x, 132);
      // Confetti.
      for (let i = 0; i < 24; i++) {
        const cx = (i * 53 + time * 90) % 320;
        const cy = (i * 31 + time * (60 + i * 3)) % 180;
        ctx.fillStyle = color(CH_TOKEN[CHANNELS[i % 6]]);
        ctx.fillRect(cx, cy, 6, 10);
      }
    }
    leds(ctx);
    scr.tex.needsUpdate = true;
  };
  idle();
  return {
    group: g,
    /** A video hit: the ad plays for three seconds. */
    hit() { playT = 0; },
    update(dt, time) {
      if (playT < 0) { glow.material.opacity = 0.25; return; }
      playT += dt;
      frameT += dt;
      glow.material.opacity = 0.45 + 0.25 * Math.sin(time * 10);
      if (playT > 3.2) { playT = -1; idle(); return; }
      if (frameT >= 1 / 15) { frameT = 0; ad(playT / 3.2, time); }
    },
  };
}

// ---------- the advertising column's posters ----------

/** Four posters around the column (set: 0, 1, 2 ...), drawn into a 1024 x 256 canvas. */
export function drawPosters(ctx, set) {
  const W = 1024;
  const H = 256;
  const words = t('pinballPosters').split('|');
  const tones = ['xr-pinball-ch-poster', 'xr-pinball-ch-social', 'xr-pinball-ch-email', 'xr-pinball-ch-app', 'xr-pinball-accent', 'xr-pinball-ch-video'];
  const icons = ['star', 'heart', 'founders', 'branch', 'young', 'video'];
  ctx.fillStyle = color('xr-pinball-house');
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 4; i++) {
    const k = set * 4 + i;
    const x = i * 256 + 10;
    const tone = tones[k % tones.length];
    ctx.fillStyle = color(tone);
    ctx.fillRect(x, 16, 236, 224);
    ctx.fillStyle = color('xr-pinball-sticker');
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc(x + 180, 70, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    const icon = icons[k % icons.length];
    if (icon === 'star' || icon === 'heart') {
      ctx.fillStyle = color('xr-pinball-sticker');
      ctx.beginPath();
      for (let j = 0; j < 10; j++) {
        const a = -Math.PI / 2 + (j * Math.PI) / 5;
        const rr = j % 2 ? 18 : 42;
        ctx.lineTo(x + 118 + Math.cos(a) * rr, 84 + Math.sin(a) * rr);
      }
      ctx.fill();
    } else {
      drawGlyph(ctx, icon, x + 118, 84, 86, color('xr-pinball-sticker'), 2.6);
    }
    const word = words[k % words.length];
    let px = 58;
    ctx.font = font('black', px);
    while (ctx.measureText(word).width > 214 && px > 24) { px -= 2; ctx.font = font('black', px); }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color('xr-pinball-sticker');
    ctx.fillText(word, x + 118, 178);
    ctx.fillStyle = color('xr-pinball-dark');
    ctx.fillRect(x + 64, 214, 108, 8);
  }
}

// ---------- envelopes on the drop targets ----------

let envTex = null;
function envelopeTexture() {
  if (envTex) return envTex;
  const { ctx, tex } = canvasTex(128, 108);
  ctx.fillStyle = color('xr-pinball-sticker');
  ctx.beginPath();
  ctx.roundRect(4, 8, 120, 92, 10);
  ctx.fill();
  ctx.strokeStyle = color('xr-pinball-ch-email');
  ctx.lineWidth = 7;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(10, 14);
  ctx.lineTo(64, 60);
  ctx.lineTo(118, 14);
  ctx.stroke();
  ctx.fillStyle = color('xr-pinball-accent');
  ctx.beginPath();
  ctx.arc(64, 66, 24, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color('xr-pinball-sticker');
  ctx.font = font('black', 34);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('@', 64, 67);
  envTex = tex;
  return tex;
}

/** An envelope on a drop target's face (the target faces +x). */
export function makeEnvelope() {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.028, 0.0236), new THREE.MeshStandardMaterial({ map: envelopeTexture(), roughness: 0.5, emissive: hex('xr-pinball-white'), emissiveMap: envelopeTexture(), emissiveIntensity: 0.35 }));
  m.rotation.y = Math.PI / 2;
  m.position.set(0.0016, 0.017, 0);
  return m;
}

// ---------- chat bubbles on the pop bumpers ----------

/** A chat bubble lid for a pop bumper with an icon from the effects atlas (cell). */
export function makeBubbleTop(atlasTex, cell) {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.absarc(0, 0, 0.024, 0, Math.PI * 2, false);
  const tail = new THREE.Shape();
  tail.moveTo(-0.012, -0.016);
  tail.lineTo(-0.03, -0.03);
  tail.lineTo(-0.002, -0.022);
  tail.closePath();
  const mat = new THREE.MeshStandardMaterial({ color: hex('xr-pinball-sticker'), roughness: 0.35, emissive: hex('xr-pinball-sticker'), emissiveIntensity: 0.25 });
  for (const s of [shape, tail]) {
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: true, bevelSize: 0.0015, bevelThickness: 0.0015, bevelSegments: 2, curveSegments: 24 });
    geo.rotateX(-Math.PI / 2);
    g.add(new THREE.Mesh(geo, mat));
  }
  const tex = atlasTex.clone();
  tex.repeat.set(0.25, 0.25);
  tex.offset.set((cell % 4) * 0.25, 0.75 - Math.floor(cell / 4) * 0.25);
  tex.needsUpdate = true;
  const icon = new THREE.Mesh(new THREE.PlaneGeometry(0.034, 0.034).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }));
  icon.position.y = 0.0062;
  g.add(icon);
  g.position.y = 0.047;
  g.userData.mat = mat;
  return g;
}

// ---------- the branch office: sign, door, customer ----------

export function makeBranchFx(house) {
  // house: { x0, x1, y0, y1 } (the door faces -x, at the saucer's height up the playfield)
  const g = new THREE.Group();
  g.userData.noFit = true;
  const doorY = 0.468;
  const x = house.x0 - 0.0045; // in front of the portico columns
  // Sign above the door.
  const sign = canvasTex(256, 64);
  sign.ctx.fillStyle = color('xr-pinball-accent');
  sign.ctx.fillRect(0, 0, 256, 64);
  drawGlyph(sign.ctx, 'branch', 34, 32, 44, color('xr-pinball-sticker'), 2.4);
  sign.ctx.fillStyle = color('xr-pinball-sticker');
  sign.ctx.font = font('black', 34);
  sign.ctx.textAlign = 'left';
  sign.ctx.textBaseline = 'middle';
  sign.ctx.fillText(t('pinballCh_branch').toUpperCase(), 66, 34);
  const signM = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.0075), new THREE.MeshBasicMaterial({ map: sign.tex, toneMapped: false }));
  signM.rotation.y = -Math.PI / 2;
  signM.position.copy(fp(x - 0.0012, doorY, 0.0296));
  g.add(signM);
  // Warm light inside (seen when the door opens) and the door on its hinge.
  const inside = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.019), new THREE.MeshBasicMaterial({ color: hex('xr-pinball-window'), toneMapped: false }));
  inside.rotation.y = -Math.PI / 2;
  inside.position.copy(fp(house.x0 - 0.0019, doorY, 0.0105));
  g.add(inside);
  const hinge = new THREE.Group();
  hinge.position.copy(fp(house.x0 - 0.0024, doorY - 0.0062, 0));
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.0012, 0.02, 0.0124), new THREE.MeshStandardMaterial({ color: hex('xr-pinball-door'), roughness: 0.5 }));
  door.position.set(0, 0.0105, -0.0062);
  hinge.add(door);
  g.add(hinge);
  // A customer (head, body, legs) who walks in through the door.
  const person = new THREE.Group();
  const coat = new THREE.MeshStandardMaterial({ color: hex('xr-pinball-ch-email'), roughness: 0.6 });
  const skin = new THREE.MeshStandardMaterial({ color: hex('xr-pinball-skin-2'), roughness: 0.7 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.0045, 0.009, 4, 10), coat);
  body.position.y = 0.0125;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.0042, 12, 8), skin);
  head.position.y = 0.0245;
  const legs = [-1, 1].map((s) => {
    const l = new THREE.Mesh(new THREE.CapsuleGeometry(0.0017, 0.006, 3, 6), new THREE.MeshStandardMaterial({ color: hex('xr-pinball-apron-ink'), roughness: 0.6 }));
    l.position.set(0, 0.0045, s * 0.0022);
    person.add(l);
    return l;
  });
  person.add(body, head);
  person.visible = false;
  person.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.add(person);
  const from = fp(house.x0 - 0.045, doorY - 0.028, 0);
  const to = fp(house.x0 - 0.004, doorY, 0);
  let walk = -1;
  let open = 0;
  return {
    group: g,
    /** A new customer walks in through the opening door. */
    welcome() { walk = 0; person.visible = true; },
    update(dt, time) {
      let wantOpen = 0;
      if (walk >= 0) {
        walk += dt / 1.3;
        const k = Math.min(1, walk);
        person.position.lerpVectors(from, to, k);
        person.position.y = Math.abs(Math.sin(time * 18)) * 0.0015;
        person.rotation.y = Math.atan2(to.x - from.x, to.z - from.z); // walks towards the door
        legs[0].rotation.x = Math.sin(time * 18) * 0.6;
        legs[1].rotation.x = -Math.sin(time * 18) * 0.6;
        wantOpen = k > 0.35 ? 1 : 0;
        const s = k > 0.92 ? Math.max(0.001, 1 - (k - 0.92) / 0.08) : 1;
        person.scale.setScalar(s);
        if (walk > 1.4) { walk = -1; person.visible = false; }
      }
      open += (wantOpen - open) * Math.min(1, dt * 8);
      hinge.rotation.y = open * 1.6; // swings outwards
      inside.material.color.setHex(hex('xr-pinball-window'));
    },
  };
}

// ---------- the target groups as cardboard cut-outs ----------

const SKIN = ['xr-pinball-skin-1', 'xr-pinball-skin-2', 'xr-pinball-skin-3'];

/** Draws a person (feet at y, height h) with the given outfit onto ctx; returns the shoulder. */
function person(ctx, x, y, h, o) {
  const u = h / 100;
  const P = (px, py) => [x + px * u, y - py * u];
  const fill = (tok) => { ctx.fillStyle = color(tok); };
  // Legs and shoes.
  fill(o.legs);
  ctx.beginPath();
  ctx.roundRect(...P(-13, 46), 11 * u, 44 * u, 4 * u);
  ctx.roundRect(...P(2, 46), 11 * u, 44 * u, 4 * u);
  ctx.fill();
  fill(o.shoes ?? 'xr-pinball-apron-ink');
  ctx.beginPath();
  ctx.roundRect(...P(-16, 4), 15 * u, 5 * u, 2 * u);
  ctx.roundRect(...P(1, 4), 15 * u, 5 * u, 2 * u);
  ctx.fill();
  // Body.
  fill(o.top);
  ctx.beginPath();
  ctx.roundRect(...P(-18, 82), 36 * u, 40 * u, 10 * u);
  ctx.fill();
  if (o.collar) {
    fill(o.collar);
    ctx.beginPath();
    ctx.moveTo(...P(-6, 82));
    ctx.lineTo(...P(0, 72));
    ctx.lineTo(...P(6, 82));
    ctx.fill();
  }
  // Static arm (the other one waves on its own).
  fill(o.top);
  ctx.beginPath();
  ctx.roundRect(...P(-25, 80), 9 * u, 32 * u, 4 * u);
  ctx.fill();
  fill(o.skin);
  ctx.beginPath();
  ctx.arc(...P(-20.5, 46), 4.5 * u, 0, Math.PI * 2);
  ctx.fill();
  // Head, hair.
  fill(o.skin);
  ctx.beginPath();
  ctx.arc(...P(0, 92), 11 * u, 0, Math.PI * 2);
  ctx.fill();
  fill(o.hair);
  ctx.beginPath();
  if (o.hairStyle === 'cap') {
    ctx.arc(...P(0, 95), 11.5 * u, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(...P(-2, 96), 18 * u, 4 * u);
  } else if (o.hairStyle === 'long') {
    ctx.arc(...P(0, 95), 12 * u, Math.PI * 0.95, Math.PI * 2.05);
    ctx.fill();
    ctx.fillRect(...P(-12, 95), 6 * u, 20 * u);
    ctx.fillRect(...P(6, 95), 6 * u, 20 * u);
  } else {
    ctx.arc(...P(0, 96), 11.5 * u, Math.PI * 1.05, Math.PI * 1.95);
    ctx.fill();
  }
  // Face.
  ctx.fillStyle = color('xr-pinball-apron-ink');
  ctx.beginPath();
  ctx.arc(...P(-4, 92), 1.4 * u, 0, Math.PI * 2);
  ctx.arc(...P(4, 92), 1.4 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 1.4 * u;
  ctx.strokeStyle = color('xr-pinball-apron-ink');
  ctx.beginPath();
  ctx.arc(...P(0, 89), 4 * u, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();
  if (o.glasses) {
    ctx.beginPath();
    ctx.arc(...P(-4, 92), 3 * u, 0, Math.PI * 2);
    ctx.arc(...P(4, 92), 3 * u, 0, Math.PI * 2);
    ctx.stroke();
  }
  return P(16, 78);
}

/** A cut-out canvas with a white cardboard edge around whatever draw() paints. */
function cutout(w, h, draw) {
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  draw(off.getContext('2d'));
  const sil = document.createElement('canvas');
  sil.width = w;
  sil.height = h;
  const sctx = sil.getContext('2d');
  sctx.drawImage(off, 0, 0);
  sctx.globalCompositeOperation = 'source-in';
  sctx.fillStyle = color('xr-pinball-sticker');
  sctx.fillRect(0, 0, w, h);
  const { c, ctx, tex } = canvasTex(w, h);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.drawImage(sil, Math.cos(a) * 7, Math.sin(a) * 7);
  }
  ctx.drawImage(off, 0, 0);
  return { c, tex };
}

const OUTFITS = {
  young: [{ top: 'xr-pinball-ch-social', legs: 'xr-pinball-ch-email', skin: SKIN[1], hair: 'xr-pinball-apron-ink', hairStyle: 'cap', shoes: 'xr-pinball-sticker' }],
  families: [
    { top: 'xr-pinball-ch-video', legs: 'xr-pinball-apron-ink', skin: SKIN[0], hair: 'xr-pinball-trunk' },
    { top: 'xr-pinball-ch-poster', legs: 'xr-pinball-ch-email', skin: SKIN[0], hair: 'xr-pinball-trunk', hairStyle: 'long', scale: 0.62 },
    { top: 'xr-pinball-ch-app', legs: 'xr-pinball-apron-ink', skin: SKIN[2], hair: 'xr-pinball-apron-ink', hairStyle: 'long', scale: 0.95 },
  ],
  founders: [{ top: 'xr-pinball-cabinet', collar: 'xr-pinball-sticker', legs: 'xr-pinball-apron-ink', skin: SKIN[2], hair: 'xr-pinball-apron-ink' }],
  seniors: [{ top: 'xr-pinball-accent', legs: 'xr-pinball-cabinet-dark', skin: SKIN[0], hair: 'xr-pinball-hair-gray', glasses: true }],
};

function drawGroup(ctx, g, W, H) {
  const base = H - 14;
  const o = OUTFITS[g];
  if (g === 'families') {
    person(ctx, W * 0.24, base, H * 0.66, o[0]);
    person(ctx, W * 0.5, base, H * 0.66 * 0.62, o[1]);
    person(ctx, W * 0.76, base, H * 0.66 * 0.95, o[2]);
    return;
  }
  person(ctx, W * 0.45, base, H * 0.72, o[0]);
  const u = (H * 0.72) / 100;
  const X = W * 0.45;
  if (g === 'young') {
    // A phone in the static hand.
    ctx.fillStyle = color('xr-pinball-phone');
    ctx.fillRect(X - 26 * u, base - 58 * u, 9 * u, 15 * u);
    ctx.fillStyle = color('xr-pinball-ch-app');
    ctx.fillRect(X - 25 * u, base - 57 * u, 7 * u, 12 * u);
  } else if (g === 'founders') {
    // A laptop under the arm and a light bulb idea above the head.
    ctx.fillStyle = color('xr-pinball-chrome');
    ctx.fillRect(X - 30 * u, base - 62 * u, 8 * u, 24 * u);
    drawGlyph(ctx, 'founders', X, base - 118 * u, 30 * u, color('xr-pinball-ch-poster'), 2.6);
  } else if (g === 'seniors') {
    ctx.strokeStyle = color('xr-pinball-trunk');
    ctx.lineWidth = 3 * u;
    ctx.beginPath();
    ctx.moveTo(X - 21 * u, base - 46 * u);
    ctx.lineTo(X - 24 * u, base);
    ctx.stroke();
  }
}

/**
 * A printed portrait of a target group (head and shoulders in a round frame, the group's color
 * behind): the persona standup targets' faces.
 */
export function drawPortrait(ctx, g, cx, cy, r, bg) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = color(bg);
  ctx.fill();
  ctx.clip();
  const o = OUTFITS[g];
  if (g === 'families') {
    person(ctx, cx - 0.3 * r, cy + 2.61 * r, 3.0 * r, o[0]);
    person(ctx, cx + 0.42 * r, cy + 2.09 * r, 2.0 * r, o[1]);
  } else {
    person(ctx, cx, cy + 3.4 * r, 3.8 * r, o[0]);
  }
  ctx.restore();
  ctx.lineWidth = r * 0.12;
  ctx.strokeStyle = color('xr-pinball-sticker');
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.94, 0, Math.PI * 2);
  ctx.stroke();
}

/** A target group's person standing (feet at y, height h): side art on the cabinet's walls. */
export function drawFigure(ctx, g, x, y, h) {
  const o = OUTFITS[g];
  person(ctx, x, y, h, o[0]);
  if (g === 'families') person(ctx, x + h * 0.32, y, h * 0.62, o[1]);
}

/** An arm for waving (sleeve and hand), pivot at the top. */
function armTexture(top, skin) {
  return cutout(48, 120, (ctx) => {
    ctx.fillStyle = color(top);
    ctx.beginPath();
    ctx.roundRect(14, 10, 20, 76, 9);
    ctx.fill();
    ctx.fillStyle = color(skin);
    ctx.beginPath();
    ctx.arc(24, 92, 11, 0, Math.PI * 2);
    ctx.fill();
  }).tex;
}

/**
 * The four target groups as cut-outs at playfield positions [[x, y], ...] (standing up from
 * the playfield, facing the player). setCurrent(group), react(group, 'wave' | 'cheer').
 */
export function makeCharacters(spots, scale = 1) {
  const root = new THREE.Group();
  root.userData.noFit = true;
  const W = 0.064;
  const H = 0.094;
  const figs = GROUPS.map((g, i) => {
    const [x, y] = spots[i];
    const fig = new THREE.Group();
    fig.position.copy(fp(x, y, 0));
    fig.scale.setScalar(scale);
    const wide = g === 'families';
    const w = wide ? W * 1.25 : W;
    const tex = cutout(wide ? 320 : 256, 376, (ctx) => drawGroup(ctx, g, wide ? 320 : 256, 376)).tex;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, toneMapped: false });
    const body = new THREE.Mesh(new THREE.PlaneGeometry(w, H), mat);
    body.position.y = H / 2;
    const bob = new THREE.Group();
    bob.add(body);
    // The waving arm at the shoulder (right side of the figure).
    const o = OUTFITS[g][wide ? 2 : 0];
    const armMat = new THREE.MeshBasicMaterial({ map: armTexture(o.top, o.skin), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, toneMapped: false });
    const arm = new THREE.Group();
    const armPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.011, 0.0275), armMat);
    armPlane.position.y = -0.0115;
    arm.add(armPlane);
    // Shoulder: where person() puts it, P(16, 78) in canvas pixels, mapped onto the plane.
    const Wc = wide ? 320 : 256;
    const u = (376 * (wide ? 0.66 * 0.95 : 0.72)) / 100;
    const sxPx = (wide ? 0.76 : 0.45) * Wc + 16 * u;
    const syPx = 362 - 78 * u;
    arm.position.set((sxPx / Wc - 0.5) * w, (1 - syPx / 376) * H, 0.0008);
    arm.scale.setScalar(u / 2.707);
    bob.add(arm);
    // A glow behind the figure and a stand under it.
    const glowMat = new THREE.MeshBasicMaterial({ map: radialTexture(), color: hex(`xr-pinball-group-${i + 1}`), ...additive, opacity: 0 });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(w * 2, H * 1.6), glowMat);
    glow.position.set(0, H / 2, -0.004);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(w * 0.6, 0.004, 0.012), new THREE.MeshStandardMaterial({ color: hex('xr-pinball-cabinet-dark'), roughness: 0.6 }));
    stand.position.y = 0.002;
    fig.add(glow, bob, stand);
    root.add(fig);
    return { g, fig, bob, arm, mat, armMat, glowMat, on: 0, wave: 0, cheer: 0 };
  });
  let current = null;
  return {
    group: root,
    setCurrent(g) { current = g; },
    react(g, kind) {
      const f = figs.find((q) => q.g === g);
      if (!f) return;
      if (kind === 'cheer') f.cheer = 1.6;
      else f.wave = Math.max(f.wave, 1.2);
    },
    cheerAll() { for (const f of figs) f.cheer = 2; },
    update(dt, time) {
      for (const f of figs) {
        const want = f.g === current ? 1 : 0;
        f.on += (want - f.on) * Math.min(1, dt * 5);
        f.wave = Math.max(0, f.wave - dt);
        f.cheer = Math.max(0, f.cheer - dt);
        const k = 0.45 + 0.55 * Math.max(f.on, f.wave > 0 ? 1 : 0, f.cheer > 0 ? 1 : 0);
        f.mat.color.setScalar(k);
        f.armMat.color.setScalar(k);
        f.glowMat.opacity = f.on * (0.45 + 0.15 * Math.sin(time * 4)) + (f.cheer > 0 ? 0.4 : 0);
        const active = f.wave > 0 || f.cheer > 0;
        f.arm.rotation.z = active ? Math.PI * 0.75 + Math.sin(time * 16) * 0.45 : 0.08;
        f.bob.position.y = f.cheer > 0 ? Math.abs(Math.sin(time * 10)) * 0.012 : f.on * Math.abs(Math.sin(time * 3)) * 0.002;
      }
    },
  };
}
