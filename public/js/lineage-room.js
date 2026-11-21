// "Datenspur": the playing field in the data room, the same on every device. Data fields are
// small 3D tokens whose shape says what kind of data they hold (a calendar block for dates, a
// coin for amounts, a cube for numbers, a slab of lines for text, a switch for yes/no, a page
// for a description; tables are stacks of discs, the transformation is a turning gear, the
// warehouse a hall, a report a screen whose bars grow when it is fed). Every token carries a
// label of dark glass that always faces the viewer: name, metadata line, an owner band with the
// owner's name. Links are 3D pipes that arch out of the field with packets of light travelling
// in them; the AI assistant's proposals are dotted beams with a percentage tag, and a small drone
// hovers at the proposal it is pointing out (it bows when it is corrected).
//   Stage 1: the tokens stand in a row under a scanner light; the odd one is lifted out and the
//            other three snap together with a link.
//   Stages 2 and 3: press one label, then the other; or press, hold, move and release on the
//            counterpart (a cable follows the pointer). Mouse, finger, controller ray and pinch
//            all come through the engine's pointers; the keyboard moves a focus ring (moveFocus).
// Browser: the camera frames frameBox() so the labels fill the screen (upright phones get their
// own arrangement); the status strip is HTML (lineage-hud.js). Headset: the field stands at
// arm's length with a panel for stage, points, prompt and feedback above it.
// Budget: one draw call per label and token (textures are redrawn only when a label changes),
// all pipes of one kind are one mesh, dots and packets are instanced.
import * as THREE from 'three';
import { Panel, Button, roundRect, wrap, textPanel } from './ui3d.js';
import { color, hex, num, font } from './tokens.js';
import { t } from './i18n.js';
import { nodeView, linesOf } from './lineage-model.js';
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';

const mctx = document.createElement('canvas').getContext('2d');
const M = 0.014; // margin around a label for its soft shadow (m)
const PAD = 0.018; // padding inside a label (m)
const LH = 1.22;
const C = (k) => color(`xr-lineage-${k}`);

const fontOf = (b, px) => (b.mono ? `${color('font-weight-bold')} ${Math.round(px)}px ${color('font-mono')}` : font(b.weight ?? 'regular', px));

/** Wraps a technical name at its separators (CUST_NO, CRM.CUSTOMER), other text at spaces. */
function wrapText(ctx, b, maxW) {
  if (!b.mono) return wrap(ctx, b.text, maxW);
  const lines = [];
  let line = '';
  for (const part of String(b.text).split(/(?<=[_.\s])/)) {
    if (line && ctx.measureText(line + part).width > maxW) { lines.push(line); line = part; } else line += part;
  }
  lines.push(line);
  return lines;
}
const indentOf = (b, px) => (b.glyph ? px * 2.5 : b.icon ? px * 1.3 : 0);

/** Height (m) of text blocks inside a label of width w. */
function measure(blocks, w, band = 0) {
  const ppm = num('xr-px-per-meter');
  let h = 0;
  blocks.forEach((b, i) => {
    const px = b.size * ppm;
    mctx.font = fontOf(b, px);
    h += wrapText(mctx, b, (w - PAD * 2 - band) * ppm - indentOf(b, px)).length * b.size * LH + (i < blocks.length - 1 ? (b.gap ?? 0.007) : 0);
  });
  return h + PAD * 2;
}

function drawMark(ctx, kind, x, y, s) {
  ctx.save();
  ctx.lineWidth = s * 0.16;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = ctx.fillStyle;
  ctx.beginPath();
  if (kind === 'good') { ctx.moveTo(x + s * 0.15, y + s * 0.52); ctx.lineTo(x + s * 0.42, y + s * 0.78); ctx.lineTo(x + s * 0.88, y + s * 0.24); }
  else if (kind === 'bad') { ctx.moveTo(x + s * 0.2, y + s * 0.2); ctx.lineTo(x + s * 0.8, y + s * 0.8); ctx.moveTo(x + s * 0.8, y + s * 0.2); ctx.lineTo(x + s * 0.2, y + s * 0.8); }
  else if (kind === 'change') { ctx.moveTo(x + s * 0.5, y + s * 0.12); ctx.lineTo(x + s * 0.9, y + s * 0.85); ctx.lineTo(x + s * 0.1, y + s * 0.85); ctx.closePath(); }
  else if (kind === 'ai') { // a four-pointed spark
    ctx.moveTo(x + s * 0.5, y + s * 0.05); ctx.lineTo(x + s * 0.62, y + s * 0.38); ctx.lineTo(x + s * 0.95, y + s * 0.5); ctx.lineTo(x + s * 0.62, y + s * 0.62);
    ctx.lineTo(x + s * 0.5, y + s * 0.95); ctx.lineTo(x + s * 0.38, y + s * 0.62); ctx.lineTo(x + s * 0.05, y + s * 0.5); ctx.lineTo(x + s * 0.38, y + s * 0.38); ctx.closePath();
    ctx.fill();
  } else if (kind === 'info') { ctx.arc(x + s * 0.5, y + s * 0.5, s * 0.36, 0, Math.PI * 2); }
  ctx.stroke();
  ctx.restore();
}

/** Text blocks into a label; block: { text, size, weight, mono, color, glyph, icon, gap, hot }. mm: meters to pixels. */
function drawBlocks(ctx, mm, blocks, x0, y0, w) {
  let y = mm(y0);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  blocks.forEach((b) => {
    const px = mm(b.size);
    ctx.font = fontOf(b, px);
    const indent = indentOf(b, px);
    const lines = wrapText(ctx, b, mm(w) - indent);
    if (b.hot) { // the metadata that decides: a marked field, not a color alone
      ctx.fillStyle = C('pulse-soft');
      roundRect(ctx, mm(x0) - px * 0.3, y - px * 0.1, mm(w) + px * 0.6, lines.length * px * LH + px * 0.2, px * 0.3);
      ctx.fill();
      ctx.lineWidth = Math.max(1, px * 0.08);
      ctx.strokeStyle = C('pulse-line');
      ctx.stroke();
    }
    lines.forEach((line, i) => {
      let x = mm(x0);
      const cy = y + (px * LH) / 2;
      if (i === 0 && b.glyph) {
        ctx.fillStyle = C('ink');
        roundRect(ctx, x, cy - px * 0.62, px * 2.1, px * 1.24, px * 0.25);
        ctx.fill();
        ctx.fillStyle = C('tag');
        ctx.font = `${color('font-weight-bold')} ${Math.round(px * 0.8)}px ${color('font-mono')}`;
        ctx.textAlign = 'center';
        ctx.fillText(b.glyph, x + px * 1.05, cy + 1);
        ctx.textAlign = 'left';
        ctx.font = fontOf(b, px);
      }
      if (i === 0 && b.icon) { ctx.fillStyle = b.color; drawMark(ctx, b.icon, x, cy - px * 0.5, px); }
      if (i === 0) x += indent;
      ctx.fillStyle = b.color ?? C('ink');
      ctx.fillText(line, x, cy);
      y += px * LH;
    });
    y += mm(b.gap ?? 0.007);
  });
}

// ---------- the tokens: one shape per kind of data ----------
const tint = (geo, col) => {
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
};
const box = (w, h, d, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const disc = (r, h, x = 0, y = 0, z = 0, seg = 20) => new THREE.CylinderGeometry(r, r, h, seg).translate(x, y, z);
const lines3 = (w, z) => [0.22, 0, -0.22].map((y) => box(w, 0.07, 0.05, 0, y, z));
// [main parts, light parts] per kind (about one unit large)
const SHAPES = {
  date: () => [[box(1, 0.9, 0.3)], [box(1.04, 0.24, 0.34, 0, 0.36), box(0.5, 0.07, 0.05, 0, -0.1, 0.16), box(0.5, 0.07, 0.05, 0, -0.28, 0.16)]],
  amt: () => [[disc(0.5, 0.2, 0, 0, 0, 28).rotateX(Math.PI / 2)], [disc(0.3, 0.26, 0, 0, 0, 20).rotateX(Math.PI / 2)]],
  num: () => [[box(0.74, 0.74, 0.74).rotateY(Math.PI / 4).rotateX(0.5)], [box(0.3, 0.3, 0.3, 0, 0, 0.42)]],
  text: () => [[box(1.1, 0.8, 0.14)], lines3(0.8, 0.07)],
  bool: () => [[disc(0.27, 1, 0, 0, 0, 16).rotateZ(Math.PI / 2), new THREE.SphereGeometry(0.27, 14, 10).translate(-0.5, 0, 0), new THREE.SphereGeometry(0.27, 14, 10).translate(0.5, 0, 0)], [new THREE.SphereGeometry(0.34, 16, 12).translate(0.36, 0, 0.12)]],
  desc: () => [[box(0.82, 1.05, 0.08)], [...lines3(0.56, 0.04), box(0.3, 0.07, 0.05, -0.13, 0.4, 0.04)]],
  src: () => [[disc(0.5, 0.24, 0, -0.32), disc(0.5, 0.24, 0, 0), disc(0.5, 0.24, 0, 0.32)], [disc(0.52, 0.04, 0, -0.16), disc(0.52, 0.04, 0, 0.16)]],
  tr: () => [[new THREE.TorusGeometry(0.4, 0.14, 8, 12)], [box(0.26, 0.26, 0.26)]],
  wh: () => [[box(1, 0.6, 0.7, 0, -0.2), new THREE.CylinderGeometry(0.5, 0.5, 0.72, 3, 1).rotateX(Math.PI / 2).rotateZ(Math.PI).scale(1.3, 0.6, 1).translate(0, 0.25, 0)], [box(0.26, 0.36, 0.05, 0, -0.32, 0.36)]],
  rep: () => [[box(1.15, 0.82, 0.08), box(0.12, 0.2, 0.08, 0, -0.5, 0), box(0.5, 0.06, 0.2, 0, -0.62, 0)], []],
};
const TOK_COLOR = { date: 'tok-date', amt: 'tok-amt', num: 'tok-num', text: 'tok-text', bool: 'tok-bool', desc: 'tok-desc', src: 'source', tr: 'machine', wh: 'house', rep: 'screen' };

export function roomView(scene, { onPickOdd, onNode, onLink, onAccept, onHint, onNext, onMenu, calm = false, screen = false, ar = false }) {
  const { engine } = scene;
  const K = screen ? 1.5 : 1; // labels are drawn larger than shown in the browser, so they stay sharp
  const LIFT = num('xr-lineage-lift');
  const TUBE = num('xr-lineage-tube');
  const ZONE = num('xr-lineage-zone');
  const T1 = Math.max(num('xr-text-sm'), 0.035); // metadata: never below the small text token
  const T2 = 0.04; // names
  const holder = new THREE.Group();
  holder.userData.noFit = true;
  holder.visible = false;
  scene.group.add(holder);
  const baseY = screen ? scene.eye - 0.05 : scene.eye - num('xr-lineage-xr-drop');
  const baseZ = screen ? -1.3 : -num('xr-lineage-xr-dist');
  holder.position.set(0, baseY, baseZ);
  const content = new THREE.Group(); // rebuilt for every row and every board
  holder.add(content);

  const basic = (k, extra = {}) => new THREE.MeshBasicMaterial({ color: hex(`xr-lineage-${k}`), toneMapped: false, ...extra });
  const mats = {
    fixed: basic('line'), done: basic('good-line'), pulse: basic('pulse-line'), ai: basic('ai'), light: basic('flow-light'), drag: basic('accent'),
    bad: basic('bad', { transparent: true }), rack: basic('card-border'),
    scan: basic('accent', { transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    token: new THREE.MeshLambertMaterial({ vertexColors: true, emissive: hex('xr-lineage-tok-glow') }),
    bars: basic('bar'),
  };
  const geos = new Map();
  const lightCol = new THREE.Color(hex('xr-lineage-tok-light'));
  const tokenGeo = (kind) => {
    if (!geos.has(kind)) {
      const [main, light] = SHAPES[kind]();
      const col = new THREE.Color(hex(`xr-lineage-${TOK_COLOR[kind]}`));
      const g = mergeGeometries([...main.map((x) => tint(x, col)), ...light.map((x) => tint(x, lightCol))]);
      [...main, ...light].forEach((x) => x.dispose());
      geos.set(kind, g);
    }
    return geos.get(kind);
  };
  const barsGeo = mergeGeometries([[-0.3, 0.3], [0, 0.55], [0.3, 0.42]].map(([x, h]) => new THREE.BoxGeometry(0.2, h, 0.05).translate(x, h / 2, 0)));
  const dotGeo = new THREE.SphereGeometry(1, 10, 8);
  const DOTS = 220;
  const dots = new THREE.InstancedMesh(dotGeo, mats.ai, DOTS);
  const PULSES = 60;
  const pulses = new THREE.InstancedMesh(dotGeo, mats.light, PULSES);
  dots.frustumCulled = false;
  pulses.frustumCulled = false;
  dots.count = 0;
  pulses.count = 0;
  holder.add(dots, pulses);
  const rubber = new THREE.Mesh(new THREE.CylinderGeometry(TUBE, TUBE, 1, 8).translate(0, 0.5, 0), mats.drag);
  rubber.visible = false;
  holder.add(rubber);
  // the assistant's drone: a small body with a ring and an eye
  const drone = new THREE.Group();
  drone.add(new THREE.Mesh(new THREE.SphereGeometry(0.026, 14, 10), mats.ai), new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.005, 6, 20).rotateX(1.2), mats.ai), new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6).translate(0, 0.004, 0.024), mats.light));
  drone.visible = false;
  holder.add(drone);
  const droneTo = new THREE.Vector3();
  let droneAct = null; // { kind, t }

  const state = { hud: null, prompt: '', fb: null, fbText: '', hint: false };
  const bounds = { x0: -0.5, x1: 0.5, y0: -0.3, y1: 0.3 };
  let head = null;
  let menuBtn = null;
  let hintBtn = null;
  let backing = null;
  let headW = 0;
  const HEAD_H = 0.29;
  const tall = () => screen && window.innerWidth < window.innerHeight * 0.8;
  // A phone: the camera frames only the two layers of the graph that are being linked.
  const small = () => screen && Math.min(window.innerWidth, window.innerHeight) < 520;

  // ---- headset only: one panel for stages, points, streak, prompt and feedback ----
  function buildHead(W) {
    [head, menuBtn, hintBtn].forEach((o) => { if (o) { o.removeFromParent(); o.dispose(); } });
    headW = W;
    head = new Panel(W, HEAD_H, (ctx, p) => {
      roundRect(ctx, 2, 2, p.canvas.width - 4, p.canvas.height - 4, p.m(0.026));
      ctx.fillStyle = C(ar ? 'board-solid' : 'card');
      ctx.fill();
      ctx.lineWidth = p.m(0.005);
      ctx.strokeStyle = C('board-edge');
      ctx.stroke();
      const hud = state.hud;
      ctx.textBaseline = 'middle';
      if (hud) {
        let x = p.m(0.025);
        const cy = p.m(0.052);
        ctx.font = font('bold', p.m(T1));
        for (let i = 0; i < 3; i++) {
          // The stage that is played shows its name; the others are a number (done: a check).
          const now = i === hud.stage;
          const done = i < hud.stage;
          const name = now ? `${i + 1}  ${t(`lineageStage${i + 1}`)}` : String(i + 1);
          const w = now ? ctx.measureText(name).width + p.m(0.04) : p.m(0.056);
          roundRect(ctx, x, cy - p.m(0.028), w, p.m(0.056), p.m(0.028));
          ctx.fillStyle = done ? C('good-soft') : now ? C('accent-soft') : C('tag');
          ctx.fill();
          if (now) { ctx.lineWidth = p.m(0.004); ctx.strokeStyle = C('accent'); ctx.stroke(); }
          ctx.fillStyle = done ? C('good') : now ? C('ink') : C('muted');
          if (done) drawMark(ctx, 'good', x + p.m(0.011), cy - p.m(0.017), p.m(0.034));
          else { ctx.textAlign = now ? 'left' : 'center'; ctx.fillText(name, now ? x + p.m(0.02) : x + w / 2, cy + 1); }
          x += w + p.m(0.014);
        }
        ctx.textAlign = 'right';
        ctx.fillStyle = C('ink');
        ctx.font = font('black', p.m(T2));
        const right = p.m(W - 0.3);
        const sc = t('lineageScore', { n: hud.score });
        ctx.fillText(sc, right, cy + 1);
        const scW = ctx.measureText(sc).width;
        ctx.font = font('bold', p.m(T1));
        ctx.fillStyle = hud.mult > 1 ? C('good') : C('muted');
        ctx.fillText(`${t('lineageStreak', { n: hud.streak })}${hud.mult > 1 ? ` ${hud.multText}` : ''}`, right - scW - p.m(0.03), cy + 1);
      }
      ctx.textAlign = 'left';
      ctx.fillStyle = C('ink');
      ctx.font = font('bold', p.m(T1));
      wrap(ctx, state.prompt, p.m(W - 0.05 - (state.hint ? 0.3 : 0))).slice(0, 2).forEach((line, i) => ctx.fillText(line, p.m(0.025), p.m(0.112 + i * T1 * LH)));
      if (state.fb) { // a mark and a colored field, not color alone
        const y0 = p.m(0.185);
        roundRect(ctx, p.m(0.015), y0, p.m(W - 0.03), p.m(0.092), p.m(0.02));
        ctx.fillStyle = C(state.fb === 'good' ? 'good-soft' : state.fb === 'bad' ? 'bad-soft' : 'tag');
        ctx.fill();
        ctx.fillStyle = C(state.fb === 'good' ? 'good' : state.fb === 'bad' ? 'bad' : 'muted');
        drawMark(ctx, state.fb, p.m(0.03), y0 + p.m(0.026), p.m(0.04));
        ctx.font = font('bold', p.m(T1));
        const lines = wrap(ctx, state.fbText, p.m(W - 0.13)).slice(0, 2);
        lines.forEach((line, i) => ctx.fillText(line, p.m(0.085), y0 + p.m(0.046 + (i - (lines.length - 1) / 2) * T1 * LH)));
      }
    });
    menuBtn = new Button(0.24, 0.07, { label: t('menu'), labelSize: 'xr-text-sm', grow: false, onClick: () => onMenu?.() });
    hintBtn = new Button(0.27, 0.07, { label: t('lineageHint'), labelSize: 'xr-text-sm', grow: false, variant: 'sponsor', onClick: () => onHint?.() });
    hintBtn.visible = state.hint;
    holder.add(head, menuBtn, hintBtn);
  }

  /** After a layout: the plane behind the field and (headset) the panel above it. */
  function frame() {
    if (backing) { backing.removeFromParent(); backing.dispose(); backing = null; }
    const W = bounds.x1 - bounds.x0 + 0.1;
    const H = bounds.y1 - bounds.y0 + 0.1;
    const cx = (bounds.x0 + bounds.x1) / 2;
    const cy = (bounds.y0 + bounds.y1) / 2;
    if (!screen) {
      backing = new Panel(W, H, (ctx, p) => {
        roundRect(ctx, 3, 3, p.canvas.width - 6, p.canvas.height - 6, p.m(0.03));
        ctx.fillStyle = C(ar ? 'board-solid' : 'board');
        ctx.fill();
        ctx.lineWidth = p.m(0.006);
        ctx.strokeStyle = C('board-edge');
        ctx.stroke();
      });
      backing.position.set(cx, cy, -0.012);
      backing.renderOrder = -1;
      holder.add(backing);
      const hw = Math.max(1.5, W);
      if (Math.abs(hw - headW) > 1e-3) buildHead(hw); else head.redraw();
      const hy = cy + H / 2 + 0.02 + HEAD_H / 2;
      head.position.set(cx, hy, 0);
      menuBtn.position.set(cx + hw / 2 - 0.14, hy + HEAD_H / 2 - 0.052, 0.006);
      hintBtn.position.set(cx + hw / 2 - 0.155, hy + HEAD_H / 2 - 0.135, 0.006);
    }
  }

  /** A label: a rounded plate of dark glass. look() returns { fill, stroke, dash, wide, blocks, band, badge, opacity }. */
  function makeCard(w, h, look, band = 0) {
    const card = new Panel((w + M * 2) * K, (h + M * 2) * K, (ctx, p) => {
      const mm = (x) => p.m(x * K);
      const L = look();
      ctx.save();
      ctx.shadowColor = C('card-shadow');
      ctx.shadowBlur = mm(0.012);
      ctx.shadowOffsetY = mm(0.004);
      roundRect(ctx, mm(M), mm(M), mm(w), mm(h), mm(0.02));
      ctx.fillStyle = L.fill;
      ctx.fill();
      ctx.restore();
      if (L.band) { // the owner's band along the left edge (the owner's name is in the metadata line)
        ctx.save();
        roundRect(ctx, mm(M), mm(M), mm(w), mm(h), mm(0.02));
        ctx.clip();
        ctx.fillStyle = L.band;
        ctx.fillRect(mm(M), mm(M), mm(0.012), mm(h));
        ctx.restore();
      }
      ctx.lineWidth = mm(L.wide ? 0.007 : 0.004);
      ctx.strokeStyle = L.stroke;
      if (L.dash) ctx.setLineDash([mm(0.016), mm(0.012)]);
      roundRect(ctx, mm(M), mm(M), mm(w), mm(h), mm(0.02));
      ctx.stroke();
      ctx.setLineDash([]);
      drawBlocks(ctx, mm, L.blocks, M + PAD + band, M + PAD, w - PAD * 2 - band);
      if (L.badge) { // a mark in the corner (the source that changes): more than a color
        const r = mm(0.022);
        const cx = mm(M + w) - r * 1.1;
        const cy = mm(M) + r * 1.1;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = L.badgeFill ?? C('pulse-line');
        ctx.fill();
        ctx.fillStyle = C('on-good');
        drawMark(ctx, L.badge, cx - r * 0.62, cy - r * 0.7, r * 1.24);
      }
      p.material.opacity = L.opacity ?? 1;
    });
    sharp(card);
    card.scale.setScalar(1 / K);
    Object.assign(card.userData, { w, h, lift: 0, hover: false, focus: false, interactive: true });
    card.userData.setHover = (v) => { if (card.userData.hover !== v) { card.userData.hover = v; card.redraw(); } };
    card.userData.setFocus = (v) => { if (card.userData.focus !== v) { card.userData.focus = v; card.redraw(); } };
    return card;
  }
  // Labels are shown smaller than they are drawn: no mip levels (they would blend in older content).
  function sharp(panel) { panel.texture.generateMipmaps = false; panel.texture.minFilter = THREE.LinearFilter; panel.texture.needsUpdate = true; }
  const ring = (u, base) => (u.focus ? C('focus') : u.hover ? C('accent') : base);

  let cards = []; // { mesh, token, x, y, w, h, id | i, ... }
  let model = null;
  let sel = null;
  let vertical = false; // links run from top to bottom (the graph on an upright phone)
  let lineMeshes = [];
  let flows = [];
  let pills = [];
  let pillKey = '';
  let drag = null;
  let cardUi = [];
  let extras = []; // scanner, rack, links of stage 1
  let scanner = null;
  let time = 0;
  const us = Array.from({ length: PULSES }, (_, i) => (i * 0.31) % 1);
  const m4 = new THREE.Matrix4();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const v3 = new THREE.Vector3();
  const qI = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);

  const drop = (o) => { o.removeFromParent(); o.geometry.dispose(); };
  function clearLines() {
    lineMeshes.forEach((o) => { o.removeFromParent(); o.geometry.dispose(); });
    lineMeshes = [];
    flows = [];
  }
  function clearContent() {
    for (const o of [...content.children]) { o.removeFromParent(); o.dispose?.(); }
    extras.forEach(drop);
    extras = [];
    scanner = null;
    clearLines();
    pills.forEach((o) => { o.removeFromParent(); o.userData.pill.dispose(); o.geometry.dispose(); });
    pills = [];
    pillKey = '';
    cards = [];
    dots.count = 0;
    pulses.count = 0;
    drag = null;
    rubber.visible = false;
    drone.visible = false;
    if (engine.focus && !engine.focus.parent) engine.setFocus(null);
  }

  function token(kind, size) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(tokenGeo(kind), mats.token);
    g.add(m);
    if (kind === 'rep') { const b = new THREE.Mesh(barsGeo, mats.bars); b.position.set(0, -0.3, 0.05); b.scale.y = 0.15; g.add(b); g.userData.bars = b; }
    g.scale.setScalar(size);
    g.userData.kind = kind;
    g.userData.ph = Math.random() * 6;
    return g;
  }

  /** A label and its token arrive: they grow in with a little overshoot (calm motion: they are simply there). */
  function arrive(mesh, tok, delay) {
    if (calm) return;
    const size = tok.scale.x;
    mesh.scale.setScalar(0.001);
    tok.scale.setScalar(0.001);
    scene.delay(delay, () => scene.tween(0.38, (k) => {
      const kk = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2); // back-out easing
      mesh.scale.setScalar(Math.max(0.001, kk) / K);
      tok.scale.setScalar(Math.max(0.001, kk) * size);
    }, { ease: (k) => k }));
  }

  function place(mesh, x, y, extra) {
    mesh.position.set(x, y, 0.012);
    content.add(mesh);
    const c = { mesh, x, y, w: mesh.userData.w, h: mesh.userData.h, ...extra };
    cards.push(c);
    bounds.x0 = Math.min(bounds.x0, x - c.w / 2); bounds.x1 = Math.max(bounds.x1, x + c.w / 2);
    bounds.y0 = Math.min(bounds.y0, y - c.h / 2); bounds.y1 = Math.max(bounds.y1, y + c.h / 2);
    return c;
  }
  const resetBounds = () => Object.assign(bounds, { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity });
  const toZone = () => { holder.position.x = screen ? ((state.hud?.stage ?? 0) - 1) * ZONE : 0; };

  /** A phone shows two layers of the graph at a time: from the report back to the sources. */
  function focusCols() {
    if (model?.kind !== 'graph' || !small()) return null;
    const open = model.needs.filter((n) => !n.done).map((n) => model.nodes.find((x) => x.id === n.asker).col);
    const c = model.impact?.active || !open.length ? 3 : Math.max(...open);
    return [c - 1, c];
  }
  function applyFocus() {
    const f = focusCols();
    for (const c of cards) {
      const on = !f || f.includes(c.node.col);
      c.mesh.visible = on;
      c.token.visible = on;
    }
  }

  // ---- links as 3D pipes ----
  function buildLines() {
    clearLines();
    if (!model) return;
    const byId = new Map(cards.map((c) => [c.id, c]));
    const list = linesOf(model).filter((l) => byId.has(l.a) && byId.has(l.b) && byId.get(l.a).mesh.visible && byId.get(l.b).mesh.visible);
    const side = new Map();
    for (const l of list) for (const [id, s] of [[l.a, 'out'], [l.b, 'in']]) { const k = `${id}:${s}`; if (!side.has(k)) side.set(k, []); side.get(k).push(l); }
    for (const [k, ls] of side) {
      const [id, s] = k.split(':');
      const c = byId.get(id);
      const other = (l) => byId.get(s === 'out' ? l.b : l.a);
      ls.sort((p, q) => (vertical ? other(p).x - other(q).x : other(q).y - other(p).y));
      ls.forEach((l, i) => {
        const f = (i + 1) / (ls.length + 1);
        const pt = vertical
          ? new THREE.Vector3(c.x - c.w / 2 + c.w * f, c.y + (s === 'out' ? -c.h / 2 : c.h / 2), 0.018)
          : new THREE.Vector3(c.x + (s === 'out' ? c.w / 2 : -c.w / 2), c.y + c.h / 2 - c.h * f, 0.018);
        if (s === 'out') l.p = pt; else l.q = pt;
      });
    }
    const flowAll = model.needs.every((n) => n.done);
    const tubes = { fixed: [], done: [], pulse: [] };
    let nd = 0;
    const aiLines = [];
    for (const l of list) {
      const d = Math.max(0.03, (vertical ? l.p.y - l.q.y : l.q.x - l.p.x) / 2);
      const bulge = l.kind === 'ai' ? 0.05 : l.kind === 'fixed' ? 0.02 : 0.035; // the pipe arches towards the viewer
      const c1 = vertical ? new THREE.Vector3(l.p.x, l.p.y - d, l.p.z + bulge) : new THREE.Vector3(l.p.x + d, l.p.y, l.p.z + bulge);
      const c2 = vertical ? new THREE.Vector3(l.q.x, l.q.y + d, l.q.z + bulge) : new THREE.Vector3(l.q.x - d, l.q.y, l.q.z + bulge);
      l.curve = new THREE.CubicBezierCurve3(l.p, c1, c2, l.q);
      if (l.kind === 'ai') {
        aiLines.push(l);
        for (let i = 1; i < 13 && nd < DOTS; i++) {
          l.curve.getPoint(i / 13, v1);
          dots.setMatrixAt(nd++, m4.compose(v1, qI, v2.setScalar(TUBE * 1.15)));
        }
      } else {
        tubes[l.kind].push(new THREE.TubeGeometry(l.curve, 18, TUBE * (l.kind === 'fixed' ? 0.85 : 1.3), 6, false));
        if (l.kind !== 'fixed' || flowAll) flows.push(l.curve);
      }
    }
    dots.count = nd;
    dots.instanceMatrix.needsUpdate = true;
    for (const kind of ['fixed', 'done', 'pulse']) {
      if (!tubes[kind].length) continue;
      const merged = tubes[kind].length > 1 ? mergeGeometries(tubes[kind]) : tubes[kind][0];
      if (tubes[kind].length > 1) tubes[kind].forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, mats[kind]);
      holder.add(mesh);
      lineMeshes.push(mesh);
    }
    pulses.count = Math.min(PULSES, flows.length * (calm ? 1 : 3));
    // The assistant's tag on each proposal: one press accepts it (a finger-sized invisible target).
    const key = aiLines.map((l) => `${l.a}>${l.b}`).join();
    if (key !== pillKey) {
      pillKey = key;
      pills.forEach((o) => { o.removeFromParent(); o.userData.pill.dispose(); o.geometry.dispose(); });
      pills = aiLines.map((l, li) => {
        const need = model.needs.find((n) => !n.done && n.aiState === 'open' && ((n.asker === l.a && n.ai.id === l.b) || (n.asker === l.b && n.ai.id === l.a)));
        const text = `${t('lineageAi')} ${need.ai.conf} %`;
        const pill = new Panel(0.188 * K, 0.066 * K, (ctx, p) => {
          const mm = (x) => p.m(x * K);
          roundRect(ctx, 3, 3, p.canvas.width - 6, p.canvas.height - 6, mm(0.033));
          ctx.fillStyle = p.state.hover ? C('tag') : C('ai-soft');
          ctx.fill();
          ctx.lineWidth = mm(p.state.focus ? 0.008 : 0.005);
          ctx.setLineDash(p.state.focus ? [] : [mm(0.012), mm(0.009)]);
          ctx.strokeStyle = p.state.focus ? C('focus') : C('ai');
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = C('ai');
          drawMark(ctx, 'ai', mm(0.013), mm(0.017), mm(0.032));
          ctx.font = font('bold', mm(T1));
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, mm(0.05), p.canvas.height / 2 + 1);
        });
        sharp(pill);
        pill.scale.setScalar(1 / K);
        const hit = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.115), new THREE.MeshBasicMaterial({ visible: false }));
        l.curve.getPoint(aiLines.length > 1 ? [0.5, 0.3, 0.7, 0.4, 0.6][li % 5] : 0.5, hit.position);
        hit.position.z += 0.012;
        hit.add(pill);
        const name = model.nodes.find((x) => x.id === need.ai.id).title;
        Object.assign(hit.userData, { pill, interactive: true, w: 0.188, h: 0.066, label: t('lineageAiChipLabel', { conf: need.ai.conf, name }), onClick: () => onAccept?.(need.id) });
        hit.userData.setHover = (v) => { pill.set({ hover: v }); pill.scale.setScalar((v ? 1.08 : 1) / K); };
        hit.userData.setFocus = (v) => { pill.set({ focus: v }); };
        holder.add(hit);
        return hit;
      });
    }
    for (let it = 0; it < 24; it++) {
      for (let i = 0; i < pills.length; i++) for (let j = i + 1; j < pills.length; j++) {
        const a = pills[i].position; const b = pills[j].position;
        if (Math.abs(a.x - b.x) > 0.215 || Math.abs(a.y - b.y) > 0.118) continue;
        const push = (0.124 - Math.abs(a.y - b.y)) / 2 * (a.y >= b.y ? 1 : -1);
        a.y += push; b.y -= push;
      }
    }
    drone.visible = pills.length > 0;
    if (pills.length) droneTo.copy(pills[0].position).add(v1.set(0, 0.075, 0.03));
  }

  // ---- looks ----
  const tileLook = (c) => () => {
    const { tl, st } = c;
    const kind = st.kind;
    const u = c.mesh?.userData ?? {};
    const off = kind === 'dim' || kind === 'rest'; // out of the game: darker and muted, but still solid and readable
    const blocks = [{ text: tl.title, size: tl.mono ? 0.044 : 0.04, mono: tl.mono, weight: 'bold', gap: 0.016, color: off ? C('muted') : C('ink') }];
    for (const p of tl.parts) blocks.push({ text: p.glyph ? p.text : `${p.label}  ${p.text}`, size: T1 + 0.003, gap: 0.011, color: C('muted'), glyph: p.glyph ?? null, hot: p.key || (st.showKey && p.k === st.keyK) });
    if (kind === 'right' || kind === 'answer') blocks.push({ text: t('lineageOdd'), size: T1, weight: 'bold', color: C('good'), icon: 'good' });
    if (kind === 'wrong') blocks.push({ text: t('lineageWrong'), size: T1, weight: 'bold', color: C('bad'), icon: 'bad' });
    return {
      blocks, band: tl.owKey ? C(`own-${tl.owKey}`) : null,
      fill: kind === 'right' ? C('good-soft') : kind === 'wrong' ? C('bad-soft') : off ? C('card-soft') : C('card'),
      stroke: ring(u, kind === 'right' || kind === 'answer' ? C('good-line') : kind === 'wrong' ? C('bad') : C('card-border')),
      dash: kind === 'answer', wide: !!kind || u.hover || u.focus,
      opacity: 1,
    };
  };

  const nodeBlocks = (n, v, forSize = false) => {
    const blocks = [{ text: n.title, size: T1, mono: n.mono, weight: 'bold', gap: 0.008 }];
    if (n.meta) blocks.push({ text: `${n.meta.ty} · ${n.meta.ex} · ${n.meta.ow}`, size: T1, color: C('muted'), glyph: n.meta.glyph });
    else if (n.text) blocks.push({ text: n.text, size: T1, color: C('muted') });
    if (v.need.length) blocks.push({ text: t('lineageNeeds', { need: v.need.join(' + ') }), size: T1, weight: 'bold', color: C('accent') });
    if (v.mark === 'hit') blocks.push({ text: t('lineageAffected'), size: T1, weight: 'bold', color: C('pulse'), icon: 'good' });
    else if (v.mark === 'miss') blocks.push({ text: t('lineageNotAffected'), size: T1, weight: 'bold', color: C('bad'), icon: 'bad' });
    else if (v.missed) blocks.push({ text: t('lineageAiMissed'), size: T1, weight: 'bold', color: C('bad'), icon: 'bad' });
    else if (v.done && !v.need.length && n.kind !== 'desc' && n.kind !== 'field') blocks.push({ text: t('lineageDone'), size: T1, weight: 'bold', color: C('good'), icon: 'good' });
    // Room for the line that comes later ("not affected"), so a label never grows.
    else if (forSize && n.col === 3) blocks.push({ text: t('lineageNotAffected'), size: T1, weight: 'bold', icon: 'bad' });
    return blocks;
  };

  const nodeLook = (c) => () => {
    const v = c.v;
    const u = c.mesh?.userData ?? {};
    const pick = !!model?.impact?.active && v.selectable; // a report that can be picked
    return {
      blocks: nodeBlocks(c.node, v), band: c.node.meta?.owKey ? C(`own-${c.node.meta.owKey}`) : null,
      fill: v.selected ? C('accent-soft') : v.changed || v.mark === 'hit' ? C('pulse-soft') : v.done ? C('good-soft') : v.selectable ? C('card') : C('card-soft'),
      stroke: ring(u, v.selected ? C('accent') : v.changed || v.mark === 'hit' || pick ? C('pulse-line') : v.mark === 'miss' ? C('bad') : v.done ? C('good-line') : v.need.length ? C('accent') : C('card-border')),
      dash: (v.need.length > 0 || pick) && !v.selected && !u.focus,
      wide: v.selected || v.changed || !!v.mark || pick || u.hover || u.focus,
      badge: v.changed ? 'change' : v.done && (c.node.kind === 'desc' || c.node.kind === 'field') ? 'good' : null, badgeFill: v.changed ? C('pulse-line') : C('good-line'),
      opacity: 1,
    };
  };

  /** A wrong link: a red pipe that wobbles and fades, and the label it was drawn to shakes. */
  function shake(a, b) {
    const ca = cards.find((c) => c.id === a);
    const cb = cards.find((c) => c.id === b);
    if (!ca || !cb) return;
    const p = new THREE.Vector3(ca.x, ca.y, 0.03);
    const q = new THREE.Vector3(cb.x, cb.y, 0.03);
    const mid = p.clone().add(q).multiplyScalar(0.5);
    mid.z = 0.09;
    const mat = mats.bad.clone();
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(p, mid, q), 18, TUBE * 1.3, 6, false), mat);
    holder.add(mesh);
    const x0 = ca.mesh.position.x;
    scene.tween(0.7, (k) => {
      mat.opacity = 1 - k;
      if (!calm) {
        mesh.position.y = Math.sin(k * 18) * 0.012 * (1 - k) - k * 0.03;
        ca.mesh.position.x = x0 + Math.sin(k * 22) * 0.012 * (1 - k);
      }
    }, { ease: (k) => k, onDone: () => { mesh.removeFromParent(); mesh.geometry.dispose(); mat.dispose(); ca.mesh.position.x = x0; } });
  }

  const interactives = () => [...cards.map((c) => c.mesh), ...pills].filter((o) => o.userData.interactive && o.parent && content.visible);
  const rectOf = (o) => { const u = o.userData; const p = o.position; return { x0: p.x - u.w / 2, x1: p.x + u.w / 2, y0: p.y - u.h / 2, y1: p.y + u.h / 2, x: p.x, y: p.y }; };

  const api = {
    holder,

    show(on) {
      holder.visible = on;
      if (!on) { clearContent(); cardUi.forEach((o) => { o.removeFromParent(); o.dispose?.(); }); cardUi = []; }
    },

    setHud(h) { state.hud = h; head?.redraw(); },
    setPrompt(text) { if (state.prompt !== text) { state.prompt = text; head?.redraw(); } },
    setFeedback(kind, text) { state.fb = kind; state.fbText = text ?? ''; head?.redraw(); },
    setSpeed() { /* the bonus counts; the room shows no clock (the browser's strip does) */ },
    setHint(s) { state.hint = s === 'ready'; if (hintBtn) hintBtn.visible = state.hint; },

    /** The field's box in the scene's coordinates: the browser's camera frames exactly this. */
    frameBox() {
      const p = holder.position;
      const m = 0.014;
      let b = bounds;
      if (model?.kind === 'graph' && small()) {
        // from the report back to the sources: the layer that still needs a link, and the one before it
        const f = focusCols();
        b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
        for (const k of cards) {
          if (!f.includes(k.node.col)) continue;
          b.x0 = Math.min(b.x0, k.x - k.w / 2 - 0.012); b.x1 = Math.max(b.x1, k.x + k.w / 2);
          b.y0 = Math.min(b.y0, k.y - k.h / 2); b.y1 = Math.max(b.y1, k.y + k.h / 2 + (tall() ? 0.075 : 0.01));
        }
      }
      return { x0: p.x + b.x0 - m, x1: p.x + b.x1 + m, y0: p.y + b.y0 - m, y1: p.y + b.y1 + m, z: p.z + 0.02 };
    },

    // ---- stage 1: tokens in a row under the scanner ----
    showOdd({ tiles, key }) {
      clearContent();
      model = null;
      resetBounds();
      toZone();
      const up2 = tall();
      const cols = up2 ? (tiles.length === 4 ? 2 : 1) : tiles.length;
      const tw = up2 ? (cols === 2 ? 0.41 : 0.84) : 0.42;
      const gap = 0.04;
      const side = up2 && cols === 1; // the token stands beside its label
      const band = side ? 0.13 : 0;
      const items = tiles.map((tl, i) => ({ tl, i, st: { kind: null, keyK: key, showKey: false } }));
      const th = Math.max(0.15, ...items.map((it) => measure(tileLook({ ...it, st: { kind: 'right' } })().blocks, tw, band)));
      const rowH = th + (side ? 0.03 : 0.15);
      const rows = Math.ceil(tiles.length / cols);
      items.forEach((c) => {
        const col = c.i % cols;
        const row = Math.floor(c.i / cols);
        const x = (col - (cols - 1) / 2) * (tw + gap);
        const y = ((rows - 1) / 2 - row) * rowH - (side ? 0 : 0.06);
        const mesh = makeCard(tw, th, tileLook(c), band);
        c.mesh = mesh;
        Object.assign(c, place(mesh, x, y, c));
        cards[cards.length - 1] = c;
        mesh.userData.label = `${c.tl.title}. ${c.tl.parts.map((p) => `${p.label} ${p.text}`).join('. ')}`;
        mesh.userData.onClick = () => onPickOdd?.(c.i);
        // its token: on top of the label like on a pedestal (or beside it in a single column)
        const tok = token(c.tl.tok, side ? 0.085 : 0.1);
        tok.position.set(side ? x - tw / 2 + 0.075 : x, side ? y : y + th / 2 + 0.065, 0.06);
        content.add(tok);
        c.token = tok;
        c.home = new THREE.Vector3(x, y, 0.012);
        c.tokHome = tok.position.clone();
        if (!side) bounds.y1 = Math.max(bounds.y1, y + th / 2 + 0.125);
        arrive(mesh, tok, c.i * 0.07);
      });
      // the scanner: a bar of light above the row and a beam that sweeps over the tokens
      const W = bounds.x1 - bounds.x0;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(W, 0.008, 0.02), mats.drag);
      bar.position.set(0, bounds.y1 + 0.02, 0.06);
      const beam = new THREE.Mesh(new THREE.PlaneGeometry(tw * 0.9, bounds.y1 - bounds.y0 + 0.02), mats.scan);
      beam.position.set(0, (bounds.y0 + bounds.y1) / 2 + 0.01, 0.09);
      holder.add(bar, beam);
      extras.push(bar, beam);
      bounds.y1 += 0.05; // room for the token that is lifted out
      scanner = { beam, x0: bounds.x0 + tw * 0.45, x1: bounds.x1 - tw * 0.45, to: null };
      bounds.x0 -= 0.05;
      bounds.x1 += 0.05;
      frame();
    },

    markOdd(i, kind) {
      const c = cards[i];
      if (!c) return;
      c.st.kind = kind;
      if (kind === 'dim') c.mesh.userData.interactive = false;
      if (kind === 'wrong' || kind === 'answer') cards.forEach((x) => { x.st.showKey = true; x.mesh.redraw(); }); // the scanner shows what decides
      if (kind === 'right' || kind === 'answer') { if (scanner) scanner.to = c.x; }
      c.mesh.redraw();
      if (kind !== 'right') return;
      // The odd one is lifted out; the others snap together and are linked.
      const rest = cards.filter((x) => x !== c);
      const mid = rest.reduce((s, x) => s.add(x.home), new THREE.Vector3()).multiplyScalar(1 / rest.length);
      const away = c.home.clone().sub(mid).setZ(0);
      if (away.lengthSq() < 1e-4) away.set(0, 1, 0);
      away.normalize().multiplyScalar(0.035);
      const link = () => {
        if (rest.length < 2 || !c.mesh.parent) return;
        const pts = [...rest].sort((p, q) => p.mesh.position.x - q.mesh.position.x || q.mesh.position.y - p.mesh.position.y).map((x) => new THREE.Vector3(x.mesh.position.x, x.mesh.position.y + x.h / 2 + 0.012, 0.03));
        const curve = new THREE.CatmullRomCurve3(pts);
        const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, TUBE * 1.3, 6, false), mats.done);
        holder.add(mesh);
        extras.push(mesh);
        flows = [curve];
        pulses.count = calm ? 1 : 3;
      };
      scene.tween(calm ? 0.01 : 0.45, (k) => {
        const kk = k * (2 - k) + (calm ? 0 : Math.sin(k * Math.PI) * 0.12); // ease out with a little overshoot
        c.mesh.position.copy(c.home).addScaledVector(away, kk).setZ(0.012 + 0.05 * kk);
        c.token.position.copy(c.tokHome).addScaledVector(away, kk).setZ(0.06 + 0.08 * kk);
        for (const x of rest) {
          const d = v1.copy(mid).sub(x.home).multiplyScalar(0.07 * kk);
          x.mesh.position.set(x.home.x + d.x, x.home.y + d.y, 0.012);
          x.token.position.set(x.tokHome.x + d.x, x.tokHome.y + d.y, x.tokHome.z);
        }
      }, { ease: (k) => k, onDone: link });
    },

    lockOdd() {
      cards.forEach((c) => {
        c.mesh.userData.interactive = false;
        if (!c.st.kind) { c.st.kind = 'rest'; c.mesh.redraw(); }
      });
    },

    // ---- stages 2 and 3 ----
    showBoard(b) {
      clearContent();
      model = b;
      sel = null;
      resetBounds();
      toZone();
      const graph = b.kind === 'graph';
      const up2 = tall();
      vertical = graph && up2;
      const n = b.cols.length;
      const TOK = 0.075;
      const layers = b.cols.map((label, ci) => b.nodes.filter((nd) => nd.col === ci));
      const mk = (nd, w, band) => ({ node: nd, w, band, h: Math.max(0.11, measure(nodeBlocks(nd, nodeView(b, nd, null), true), w, band) + 0.004) });
      // A phone held sideways has little height: the token sits inside its label (a band on the left)
      // and the labels stand close; everywhere else the token stands on the label's corner.
      const flat = small() && !up2;
      const BAND = flat ? 0.085 : 0;
      const GAP = flat ? 0.014 : 0.062;
      let placed = [];
      if (vertical) {
        // an upright phone: four layers from the sources (top) to the reports (bottom)
        const W = 0.86;
        const gapX = 0.025;
        let y = 0;
        layers.forEach((list) => {
          const w = (W - gapX * (list.length - 1)) / list.length;
          const its = list.map((nd) => mk(nd, w, 0));
          const h = Math.max(...its.map((it) => it.h));
          its.forEach((it, i) => placed.push({ ...it, h, x: -W / 2 + w / 2 + i * (w + gapX), y: y - h / 2 }));
          y -= h + 0.14;
        });
      } else {
        const wideCols = graph && small(); // a phone held sideways: wide columns, two of them in view
        const lineGap = graph ? (wideCols ? 0.22 : 0.19) : up2 ? 0.09 : 0.26;
        const cw = graph ? (wideCols ? 0.5 : 0.335) : up2 ? 0.385 : flat ? 0.78 : 0.6;
        const colsL = layers.map((list, ci) => {
          const its = list.map((nd) => mk(nd, cw, BAND));
          return { its, x: (ci - (n - 1) / 2) * (cw + lineGap), total: its.reduce((s, it) => s + it.h, 0) + (its.length - 1) * GAP };
        });
        const H = Math.max(...colsL.map((c) => c.total));
        colsL.forEach((col) => {
          let y = H / 2 - (H - col.total) / 2;
          col.its.forEach((it) => { placed.push({ ...it, x: col.x, y: y - it.h / 2 }); y -= it.h + GAP; });
        });
      }
      placed.forEach((it) => {
        const c = { node: it.node, v: nodeView(b, it.node, null), mesh: null };
        const mesh = makeCard(it.w, it.h, nodeLook(c), it.band);
        c.mesh = mesh;
        Object.assign(c, place(mesh, it.x, it.y, { id: it.node.id, node: it.node, v: c.v }));
        cards[cards.length - 1] = c;
        Object.assign(mesh.userData, { nodeId: it.node.id, label: it.node.title });
        // its token sits on the label's upper left corner
        const kind = it.node.kind === 'field' ? it.node.meta.tyKey : it.node.kind;
        const tok = token(kind, flat ? 0.06 : TOK);
        if (flat) tok.position.set(it.x - it.w / 2 + 0.056, it.y, 0.05);
        else tok.position.set(it.x - it.w / 2 + 0.03, it.y + it.h / 2 + 0.034, 0.05);
        content.add(tok);
        c.token = tok;
        bounds.x0 = Math.min(bounds.x0, it.x - it.w / 2 - 0.012);
        if (!flat) bounds.y1 = Math.max(bounds.y1, it.y + it.h / 2 + 0.075);
        // Press and release on the same label selects it; released on another label it links them.
        mesh.userData.onGrab = (p) => { drag = { id: it.node.id, p, card: c }; };
        mesh.userData.onRelease = (p, over) => {
          drag = null;
          rubber.visible = false;
          const other = over?.userData.nodeId;
          if (other && other !== it.node.id) onLink?.(it.node.id, other); else onNode?.(it.node.id);
        };
        mesh.userData.onClick = () => onNode?.(it.node.id); // the keyboard's Enter
      });
      if (!graph) { // the table rack that holds the field tokens: two posts and a shelf under each field
        const fields = cards.filter((c) => c.node.kind === 'field');
        const rack = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mats.rack, fields.length + 2);
        const fx = fields[0].x;
        const fw = fields[0].w;
        const top = Math.max(...fields.map((c) => c.y + c.h / 2));
        const bot = Math.min(...fields.map((c) => c.y - c.h / 2));
        [-1, 1].forEach((s, i) => rack.setMatrixAt(i, m4.makeScale(0.006, top - bot + 0.03, 0.006).setPosition(fx + s * (fw / 2 + 0.012), (top + bot) / 2, -0.004)));
        fields.forEach((c, i) => rack.setMatrixAt(i + 2, m4.makeScale(fw + 0.03, 0.005, 0.03).setPosition(fx, c.y - c.h / 2 - 0.012, 0)));
        holder.add(rack);
        extras.push(rack);
        bounds.x1 += 0.02;
      }
      if (!screen) bounds.y1 += 0.01;
      droneTo.set(bounds.x1 - 0.04, bounds.y1 + 0.02, 0.06);
      drone.position.copy(droneTo);
      frame();
    },

    refresh({ sel: s }) {
      if (!model) return;
      sel = s;
      for (const c of cards) {
        const v = nodeView(model, c.node, sel);
        const key = JSON.stringify([v.need, v.selectable, v.selected, v.done, v.changed, v.mark, v.missed, !!model.impact?.active]);
        c.v = v;
        c.mesh.userData.interactive = v.selectable;
        if (key !== c.key) { c.key = key; c.mesh.redraw(); }
        // a report's chart comes alive when it is fed, and turns with the change that reaches it
        if (c.token.userData.bars) c.fed = v.mark === 'hit' || (v.done && !v.need.length) ? 1 : c.node.col === 3 && model.links.some((l) => l.b === c.id) ? 0.6 : 0.15;
      }
      applyFocus();
      buildLines();
    },

    shake,

    /** The drone reacts: it bows when it is corrected, shakes when it was followed into a mistake. */
    aiReact(kind) { droneAct = { kind, t: 0 }; },

    pop(text, target) {
      const c = target?.tile != null ? cards[target.tile] : cards.find((x) => x.id === target?.node);
      if (!c) return;
      const p = new Panel(0.26 * K, 0.085 * K, (ctx, pp) => {
        roundRect(ctx, 2, 2, pp.canvas.width - 4, pp.canvas.height - 4, pp.canvas.height / 2);
        ctx.fillStyle = C('good');
        ctx.fill();
        ctx.fillStyle = C('on-good');
        ctx.font = font('black', pp.m(0.05 * K));
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, pp.canvas.width / 2, pp.canvas.height / 2 + 2);
      });
      sharp(p);
      p.position.set(c.x, c.y + c.h / 2, 0.1);
      holder.add(p);
      scene.tween(1.1, (k) => {
        const sc = calm ? 1 : k < 0.15 ? 0.6 + (k / 0.15) * 0.5 : 1.1 - Math.min(0.1, (k - 0.15) * 0.5);
        p.scale.setScalar(sc / K);
        if (!calm) p.position.y = c.y + c.h / 2 + k * 0.1;
        p.material.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      }, { ease: (k) => k, onDone: () => { p.removeFromParent(); p.dispose(); } });
    },

    /** Headset: the card that opens a stage (the browser shows it as HTML). */
    showCard(card) {
      cardUi.forEach((o) => { o.removeFromParent(); o.dispose?.(); });
      cardUi = [];
      if (card) { clearContent(); toZone(); }
      if (!card || screen) return;
      const panel = textPanel(1.0, 0.3, [
        { text: card.title, size: 'xr-text-lg', weight: 'black', color: C('ink'), gap: 0.03 },
        { text: card.lines[0], size: 'xr-text-sm', color: C('ink'), gap: 0.022 },
        { text: card.lines[1], size: 'xr-text-sm', weight: 'bold', color: C('ai') },
      ], { surface: { fill: C('board-solid'), stroke: C('board-edge'), stripe: false } });
      const cy = (bounds.y0 + bounds.y1) / 2;
      panel.position.set(0, cy + 0.06, 0.05);
      const go = new Button(0.4, 0.11, { label: card.button, variant: 'primary', onClick: () => onNext?.() });
      go.position.set(0, panel.position.y - panel.h / 2 - 0.03 - go.h / 2, 0.05);
      holder.add(panel, go);
      cardUi = [panel, go];
    },

    // ---- keyboard: a focus ring that moves between the labels ----
    focusFirst() { const l = interactives(); if (l.length) engine.setFocus(l[0]); },
    focusNode(id) { const c = cards.find((x) => x.id === id); if (c?.mesh.userData.interactive) engine.setFocus(c.mesh); },
    moveFocus(dx, dy) {
      const all = interactives();
      const list = all.filter((o) => !o.userData.pill); // the arrows move between the labels (Tab also reaches the assistant's tags)
      if (!list.length) return;
      const cur = all.includes(engine.focus) ? engine.focus : null;
      if (!cur) { engine.setFocus(list[0]); return; }
      const c = rectOf(cur);
      let best = null;
      let bestD = Infinity;
      for (const o of list) {
        if (o === cur) continue;
        const r = rectOf(o);
        const ox = r.x - c.x;
        const oy = c.y - r.y; // screen-wise: down is positive
        const along = ox * dx + oy * dy;
        const overlap = dx ? r.y0 < c.y1 && r.y1 > c.y0 : r.x0 < c.x1 && r.x1 > c.x0;
        const across = overlap ? 0 : Math.abs(ox * dy) + Math.abs(oy * dx);
        if (along < 0.01 || across > along * 2.5 + 0.1) continue;
        const d = along + across * 2;
        if (d < bestD) { bestD = d; best = o; }
      }
      if (best) engine.setFocus(best);
    },

    /** For tests and tools: the things that can be pressed, with a key each. */
    targets() {
      return [...cards.map((c) => ({ key: c.id ?? `tile${c.i}`, mesh: c.mesh })), ...pills.map((o, i) => ({ key: `pill${i}`, mesh: o, label: o.userData.label }))];
    },

    tick(dt) {
      if (!holder.visible) return;
      time += dt;
      for (const c of cards) {
        const u = c.mesh.userData;
        const want = u.hover || u.focus || (c.id && c.id === sel) ? 1 : 0;
        if (Math.abs(want - u.lift) > 0.002) {
          u.lift += (want - u.lift) * Math.min(1, dt * (calm ? 30 : 12));
          if (!c.st?.kind) c.mesh.position.z = 0.012 + u.lift * LIFT;
        }
        // tokens turn a little, the gear keeps turning, a fed report's bars grow
        const tk = c.token;
        if (tk && !calm) {
          if (tk.userData.kind === 'tr') tk.rotation.z += dt * 1.2;
          else tk.rotation.y = Math.sin(time * 0.9 + tk.userData.ph) * 0.45;
        }
        if (tk?.userData.bars && c.fed != null) tk.userData.bars.scale.y += (c.fed - tk.userData.bars.scale.y) * Math.min(1, dt * (calm ? 30 : 3));
      }
      if (scanner) { // the beam sweeps over the row; after the answer it rests on the odd token
        const x = scanner.to ?? (calm ? 0 : (scanner.x0 + scanner.x1) / 2 + Math.sin(time * 1.3) * (scanner.x1 - scanner.x0) / 2);
        scanner.beam.position.x += (x - scanner.beam.position.x) * Math.min(1, dt * (calm ? 30 : 6));
      }
      if (pulses.count && flows.length) { // packets of light travel along the links
        const per = Math.max(1, Math.round(pulses.count / flows.length));
        for (let i = 0; i < pulses.count; i++) {
          const curve = flows[Math.min(flows.length - 1, Math.floor(i / per))];
          us[i] = (us[i] + dt * (calm ? 0.15 : 0.45)) % 1;
          curve.getPoint(us[i], v1);
          pulses.setMatrixAt(i, m4.compose(v1, qI, v2.setScalar(TUBE * 2.1)));
        }
        pulses.instanceMatrix.needsUpdate = true;
      }
      if (drone.visible) { // the drone hovers at the proposal it points out
        drone.position.lerp(droneTo, Math.min(1, dt * (calm ? 30 : 3)));
        if (!calm) drone.position.y += Math.sin(time * 2.4) * 0.0006;
        drone.rotation.set(0, calm ? 0 : Math.sin(time * 1.1) * 0.5, 0);
        if (droneAct) {
          droneAct.t += dt;
          const k = Math.min(1, droneAct.t / 0.9);
          const w = Math.sin(k * Math.PI);
          if (droneAct.kind === 'corrected') drone.rotation.x = w * 1.0; // a bow
          else if (droneAct.kind === 'followed' && !calm) drone.rotation.z = Math.sin(k * 20) * 0.5 * (1 - k);
          else if (droneAct.kind === 'confirm' && !calm) drone.rotation.y += k * Math.PI * 2;
          drone.scale.setScalar(1 + w * 0.35);
          if (k >= 1) { droneAct = null; drone.scale.setScalar(1); }
        }
      }
      if (drag) { // a cable follows the pointer while a label is held
        const ray = drag.p.ray;
        holder.worldToLocal(v1.copy(ray.origin));
        holder.worldToLocal(v2.copy(ray.origin).add(ray.direction));
        v2.sub(v1);
        const k = Math.abs(v2.z) > 1e-5 ? (0.03 - v1.z) / v2.z : -1;
        if (k > 0) {
          v1.addScaledVector(v2, k);
          const c = drag.card;
          v3.set(c.x, c.y, 0.03);
          v2.copy(v1).sub(v3);
          const len = v2.length();
          if (len > Math.min(c.w, c.h) * 0.55) {
            rubber.visible = true;
            rubber.position.copy(v3);
            rubber.scale.set(1, len, 1);
            rubber.quaternion.setFromUnitVectors(up, v2.divideScalar(len));
          } else rubber.visible = false;
        }
      }
    },

    remove() {
      clearContent();
      cardUi.forEach((o) => { o.removeFromParent(); o.dispose?.(); });
      [head, menuBtn, hintBtn, backing].forEach((o) => { if (o) { o.removeFromParent(); o.dispose(); } });
      Object.values(mats).forEach((m) => m.dispose());
      geos.forEach((g) => g.dispose());
      barsGeo.dispose();
      dotGeo.dispose();
      rubber.geometry.dispose();
      drone.children.forEach((o) => o.geometry.dispose());
      holder.removeFromParent();
    },
  };
  return api;
}
