// "Datenspur": the playing field in the data room, the same on every device. Data fields are
// small 3D tokens whose shape says what kind of data they hold (a calendar block for dates, a
// coin for amounts, a cube for numbers, a slab of lines for text, a switch for yes/no, a page
// for a description; tables are stacks of discs, the transformation is a turning gear, the
// warehouse a hall, a report a screen whose bars grow when it is fed). Every token carries a
// label of dark glass that always faces the viewer: name, metadata line, an owner band with the
// owner's name. A link exists only once the player has made a pair: it appears as a 3D pipe that
// arches out of the field, with packets of light travelling in it and a check mark (a wrong pair
// shows for a moment in red with a cross, then goes). Nothing on the field hints at the answer.
//   Stage 1: the tokens stand in a row under a scanner light; the odd one is lifted out and the
//            other three snap together with a link.
//   Stages 2 and 3: press one label, then the other; or press, hold, move and release on the
//            counterpart (a cable follows the pointer). Mouse, finger, controller ray and pinch
//            all come through the engine's pointers; the keyboard moves a focus ring (moveFocus).
// Browser: the camera frames frameBox() so the labels fill the screen (upright phones get their
// own arrangement); the status strip is HTML (lineage-hud.js). Headset: the field stands at
// arm's length with a panel for stage, points, prompt and feedback above it.
// Budget: one draw call per label and token (textures are redrawn only when a label changes),
// all pipes of one kind are one mesh, sockets, check marks and packets are instanced.
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
  if (b.keep) { // metadata (types, example values, owners): between words only, never a hyphen
    const out = [];
    let cur = '';
    for (const w of String(b.text).split(' ')) {
      if (cur && ctx.measureText(`${cur} ${w}`).width > maxW) { out.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
      while (ctx.measureText(cur).width > maxW && cur.length > 1) { // too long for a line: at a fixed space, else (an e-mail address) where it must
        let k = cur.length - 1;
        const fixed = [...cur.matchAll(/\u00a0/g)].map((m) => m.index).reverse().find((i) => i > 0 && ctx.measureText(cur.slice(0, i)).width <= maxW);
        if (fixed) { out.push(cur.slice(0, fixed)); cur = cur.slice(fixed + 1); continue; }
        while (k > 1 && ctx.measureText(cur.slice(0, k)).width > maxW) k -= 1;
        out.push(cur.slice(0, k));
        cur = cur.slice(k);
      }
    }
    out.push(cur);
    return out;
  }
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
    h += wrapText(mctx, b, (w - PAD * 2 - band - (b.indent ?? 0)) * ppm - indentOf(b, px)).length * b.size * LH + (i < blocks.length - 1 ? (b.gap ?? 0.007) : 0);
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
  else if (kind === 'info') { ctx.arc(x + s * 0.5, y + s * 0.5, s * 0.36, 0, Math.PI * 2); }
  else if (kind === 'flag') { ctx.moveTo(x + s * 0.25, y + s * 0.92); ctx.lineTo(x + s * 0.25, y + s * 0.1); ctx.lineTo(x + s * 0.85, y + s * 0.3); ctx.lineTo(x + s * 0.25, y + s * 0.5); }
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
    const indent = indentOf(b, px) + mm(b.indent ?? 0);
    const lines = wrapText(ctx, b, mm(w) - indent);
    if (b.hot) { // the metadata that decides: a marked field, not a color alone
      ctx.fillStyle = C('pulse-soft');
      roundRect(ctx, mm(x0 + (b.indent ?? 0)) - px * 0.3, y - px * 0.1, mm(w - (b.indent ?? 0)) + px * 0.6, lines.length * px * LH + px * 0.2, px * 0.3);
      ctx.fill();
      ctx.lineWidth = Math.max(1, px * 0.08);
      ctx.strokeStyle = C('pulse-line');
      ctx.stroke();
    }
    lines.forEach((line, i) => {
      let x = mm(x0 + (b.indent ?? 0));
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
      if (i === 0) x += indent - mm(b.indent ?? 0);
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
const torusZ = (r, tube, z = 0, arc = Math.PI * 2, turn = 0) => new THREE.TorusGeometry(r, tube, 6, 20, arc).rotateZ(turn).translate(0, 0, z);
const ringY = (x, y) => new THREE.TorusGeometry(0.08, 0.025, 6, 12).rotateY(Math.PI / 2).translate(x, y, 0);
const ball = (r, x, y, z) => new THREE.SphereGeometry(r, 10, 8).translate(x, y, z);
const tooth = (k) => box(0.17, 0.17, 0.2, 0.52, 0, 0).rotateZ((k * Math.PI) / 4);
// [main parts, light parts] per kind (about one unit large)
const SHAPES = {
  // a calendar block: a ring binding, a header band and a day number
  date: () => [[box(1, 0.9, 0.3)], [box(1.04, 0.24, 0.34, 0, 0.36), ringY(-0.25, 0.5), ringY(0.25, 0.5), box(0.09, 0.36, 0.05, -0.16, -0.14, 0.16), box(0.09, 0.36, 0.05, 0.14, -0.14, 0.16), box(0.2, 0.09, 0.05, 0.08, 0.0, 0.16)]],
  // a coin: a rim and an embossed euro sign
  amt: () => [[disc(0.46, 0.14, 0, 0, 0, 28).rotateX(Math.PI / 2), torusZ(0.47, 0.07)], [torusZ(0.2, 0.045, 0.08, 4.1, 1.1), box(0.3, 0.05, 0.05, -0.08, 0.06, 0.08), box(0.3, 0.05, 0.05, -0.08, -0.06, 0.08)]],
  // a number cube with pips
  num: () => [[box(0.78, 0.78, 0.78)], [ball(0.075, -0.2, 0.2, 0.39), ball(0.075, 0, 0, 0.39), ball(0.075, 0.2, -0.2, 0.39), ball(0.075, 0, 0.39, 0), ball(0.075, 0.39, 0.15, 0.1), ball(0.075, 0.39, -0.15, -0.1)]],
  // a slab with engraved lines of text
  text: () => [[box(1.1, 0.8, 0.14)], [...lines3(0.8, 0.07), box(0.4, 0.07, 0.05, -0.2, 0.3, 0.07)]],
  // a switch with its lever
  bool: () => [[disc(0.27, 1, 0, 0, 0, 16).rotateZ(Math.PI / 2), ball(0.27, -0.5, 0, 0), ball(0.27, 0.5, 0, 0)], [ball(0.33, 0.36, 0, 0.12), disc(0.06, 0.3, 0.36, 0, 0.3, 8).rotateX(Math.PI / 2)]],
  // a glossary page: a sheet on a little stand
  desc: () => [[box(0.82, 0.96, 0.06, 0, 0.16, 0), disc(0.035, 0.36, 0, -0.5, -0.03, 8)], [...lines3(0.56, 0.035).map((g) => g.translate(0, 0.12, 0)), box(0.3, 0.07, 0.05, -0.13, 0.5, 0.035), disc(0.26, 0.05, 0, -0.7, 0)]],
  // a table: a stack of discs
  src: () => [[disc(0.5, 0.24, 0, -0.32), disc(0.5, 0.24, 0, 0), disc(0.5, 0.24, 0, 0.32)], [disc(0.52, 0.04, 0, -0.16), disc(0.52, 0.04, 0, 0.16)]],
  // the transformation: a gear with teeth and a hub
  tr: () => [[torusZ(0.36, 0.13), ...[0, 1, 2, 3, 4, 5, 6, 7].map(tooth)], [disc(0.15, 0.3, 0, 0, 0, 12).rotateX(Math.PI / 2)]],
  // the warehouse: a hall with a gate
  wh: () => [[box(1, 0.6, 0.7, 0, -0.2), new THREE.CylinderGeometry(0.5, 0.5, 0.72, 3, 1).rotateX(Math.PI / 2).rotateZ(Math.PI).scale(1.3, 0.6, 1).translate(0, 0.25, 0)], [box(0.26, 0.36, 0.05, 0, -0.32, 0.36), box(0.12, 0.12, 0.05, -0.32, -0.08, 0.36), box(0.12, 0.12, 0.05, 0.32, -0.08, 0.36)]],
  // a report: a dashboard on a stand (its bars are a part of their own, they grow)
  rep: () => [[box(1.15, 0.82, 0.08), box(0.12, 0.2, 0.08, 0, -0.5, 0), box(0.5, 0.06, 0.2, 0, -0.62, 0)], [box(1.0, 0.03, 0.05, 0, -0.33, 0.04)]],
};
const TOK_COLOR = { date: 'tok-date', amt: 'tok-amt', num: 'tok-num', text: 'tok-text', bool: 'tok-bool', desc: 'tok-desc', src: 'source', tr: 'machine', wh: 'house', rep: 'screen' };

export function roomView(scene, { onPickOdd, onNode, onLink, onHint, onNext, onMenu, calm = false, screen = false, ar = false }) {
  const { engine } = scene;
  const K = screen ? 1.5 : 1; // labels are drawn larger than shown in the browser, so they stay sharp
  const LIFT = num('xr-lineage-lift');
  const TUBE = num('xr-lineage-tube');
  const ZONE = num('xr-lineage-zone');
  const T1 = Math.max(num('xr-text-sm'), 0.035); // metadata: never below the small text token
  const T2 = 0.04; // names
  const TS = screen ? 0.039 : T1; // the browser's gantry: the line under a tile's name (the smallest text in stage 1)
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
    fixed: basic('line'), done: basic('good-line'), pulse: basic('pulse-line'), light: basic('flow-light'), drag: basic('accent'),
    bad: basic('bad', { transparent: true }), rack: basic('card-border'),
    bed: basic('pipe', { side: THREE.DoubleSide }), roadFixed: basic('map-fixed', { side: THREE.DoubleSide }),
    roadDone: basic('good-line', { side: THREE.DoubleSide }), roadPulse: basic('pulse-line', { side: THREE.DoubleSide }),
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
  const PULSES = 60;
  const pulses = new THREE.InstancedMesh(dotGeo, mats.light, PULSES);
  pulses.frustumCulled = false;
  pulses.count = 0;
  holder.add(pulses);
  // a check mark on every finished link (one instanced mesh): a link is marked by more than its color
  const checkGeo = mergeGeometries([
    tint(new THREE.CylinderGeometry(1, 1, 0.3, 20).rotateX(Math.PI / 2), new THREE.Color(hex('xr-lineage-good-line'))),
    tint(new THREE.BoxGeometry(0.5, 0.2, 0.2).rotateZ(-0.8).translate(-0.3, -0.12, 0.2), new THREE.Color(hex('xr-lineage-on-good'))),
    tint(new THREE.BoxGeometry(1.0, 0.2, 0.2).rotateZ(0.9).translate(0.2, 0.05, 0.2), new THREE.Color(hex('xr-lineage-on-good'))),
  ]);
  const CHECKS = 16;
  const checkMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  const checks = new THREE.InstancedMesh(checkGeo, checkMat, CHECKS);
  checks.frustumCulled = false;
  checks.count = 0;
  holder.add(checks);
  const SOCKETS = 64;
  const sockets = new THREE.InstancedMesh(dotGeo, basic('ink'), SOCKETS);
  sockets.frustumCulled = false;
  sockets.count = 0;
  holder.add(sockets);
  const seenDone = new Set();
  let linesBuilt = false;
  let needId = null; // the unit whose tag says what it needs
  let oddLabel = ''; // what the right tile of stage 1 is called ("does not belong", "fits")
  let routeView = false; // the finished route in full, while the car drives it
  const curveOf = new Map(); // 'a>b' -> the curve of a link
  let lane = null; // an upright phone, stage 2: { x } where the cables run down beside the rows
  let barY = 0; // stage 1: the time bar's height (holder coordinates)
  let map = false; // the browser, stage 2: the graph is an interchange seen from above at an angle
  let TILT = 0; // set per board: an upright phone tilts the map less (its far row would get too small)
  const ROAD = num('xr-lineage-map-road');
  let ground = null; // the interchange's ground (made once)
  let callout = null; // the map: what the open gap needs, a sign in the gap
  let needKey = '';
  let entryAt = null; // the map: where the car stands at the entry, and its way in
  let nameSize = T2; // names on the tags (a little smaller on a phone held sideways)
  const rubber = new THREE.Mesh(new THREE.CylinderGeometry(TUBE, TUBE, 1, 8).translate(0, 0.5, 0), mats.drag);
  rubber.visible = false;
  holder.add(rubber);
  const state = { hud: null, prompt: '', fb: null, fbText: '', hint: false };
  const bounds = { x0: -0.5, x1: 0.5, y0: -0.3, y1: 0.3 };
  const fullBounds = bounds;
  let focusKey = '';
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
        for (let i = 0; i < 2; i++) {
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
  function frame(bounds = fullBounds) {
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
      holder.position.x = -cx;
      const hy = cy + H / 2 + 0.02 + HEAD_H / 2;
      head.position.set(cx, hy, 0);
      menuBtn.position.set(cx + hw / 2 - 0.14, hy + HEAD_H / 2 - 0.052, 0.006);
      hintBtn.position.set(cx + hw / 2 - 0.155, hy + HEAD_H / 2 - 0.135, 0.006);
    }
  }

  /**
   * One field: the room for its token on a lit pedestal (a band on the left, zone.bx, or on top,
   * zone.by) and a compact tag of dark glass for its name and metadata. The whole unit is one
   * pressable panel. look() returns { fill, stroke, dash, wide, blocks, band, glow, owner, badge, opacity }.
   */
  function makeCard(w, h, look, zone = {}) {
    const bx = zone.bx ?? 0;
    const by = zone.by ?? 0;
    const bz = zone.bz ?? 0; // the map: room for the place's token below the tag
    const card = new Panel((w + M * 2) * K, (h + M * 2) * K, (ctx, p) => {
      const mm = (x) => p.m(x * K);
      const L = look();
      const u = p.userData;
      const inset = !!zone.inset; // the token stands inside the tag, beside the lines below the name
      const px = M + (inset ? 0 : bx); // the tag
      let py = M + by;
      const pw = w - (inset ? 0 : bx);
      let ph = h - by - bz;
      if (zone.grow) { // the tag sits on its token and is as tall as what it says (the need adds a line on top)
        const ch = Math.min(ph, measure(L.blocks, pw, 0));
        py += ph - ch;
        ph = ch;
      }
      if ((bx || by) && !inset) { // the pedestal: a lit ellipse in the owner's (or the kind's) color, with the owner's initial
        const cx = mm(bx ? M + bx / 2 : M + w / 2);
        const cy = mm(bx ? M + h / 2 + Math.min(bx, h) * 0.4 : M + by * 0.92);
        const rx = mm(Math.min(bx || w, bx ? h * 1.1 : by * 1.2) * 0.44);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(1, 0.3);
        ctx.beginPath();
        ctx.arc(0, 0, rx, 0, Math.PI * 2);
        ctx.globalAlpha = u.hover || u.focus || L.lit ? 0.6 : 0.3;
        ctx.fillStyle = L.glow;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.lineWidth = mm(0.01);
        ctx.strokeStyle = u.focus ? C('focus') : L.glow;
        ctx.stroke();
        ctx.restore();
        if (L.owner) {
          const r = mm(0.021);
          ctx.beginPath();
          ctx.arc(cx + rx * 0.82, cy, r, 0, Math.PI * 2);
          ctx.fillStyle = L.glow;
          ctx.fill();
          ctx.fillStyle = C('on-good');
          ctx.font = font('black', r * 1.25);
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(L.owner[0].toUpperCase(), cx + rx * 0.82, cy + 1);
        }
      }
      ctx.save();
      ctx.shadowColor = C('card-shadow');
      ctx.shadowBlur = mm(0.01);
      ctx.shadowOffsetY = mm(0.003);
      roundRect(ctx, mm(px), mm(py), mm(pw), mm(ph), mm(0.018));
      ctx.fillStyle = L.fill;
      ctx.fill();
      ctx.restore();
      if (L.band) { // the owner's band along the tag's left edge (the owner's name is in the metadata line)
        ctx.save();
        roundRect(ctx, mm(px), mm(py), mm(pw), mm(ph), mm(0.018));
        ctx.clip();
        ctx.fillStyle = L.band;
        ctx.fillRect(mm(px), mm(py), mm(0.01), mm(ph));
        ctx.restore();
      }
      ctx.lineWidth = mm(L.wide ? 0.007 : 0.004);
      ctx.strokeStyle = L.stroke;
      if (L.dash) ctx.setLineDash([mm(0.016), mm(0.012)]);
      if (L.halo) { ctx.shadowColor = L.stroke; ctx.shadowBlur = mm(0.012); } // the selected unit glows softly
      roundRect(ctx, mm(px), mm(py), mm(pw), mm(ph), mm(0.018));
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.setLineDash([]);
      drawBlocks(ctx, mm, L.blocks, px + PAD, py + PAD, pw - PAD * 2);
      if (L.ownerNote) { // the owner's full name, on the name's line (phones: when the unit is pointed at or selected)
        ctx.font = font('bold', mm(T1));
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = L.glow;
        ctx.fillText(L.ownerNote, mm(M + w - PAD), mm(py + PAD) + mm(T2) * LH / 2);
      }
      if (bz && (L.lit || u.hover || u.focus)) { // the map: a short stem from the tag down to its place
        ctx.fillStyle = u.focus ? C('focus') : L.stroke;
        ctx.fillRect(mm(M + w / 2) - mm(0.003), mm(py + ph), mm(0.006), mm(Math.min(0.03, bz * 0.3)));
      }
      if (L.badge) { // a mark in the tag's corner (connected; the source that changes): more than a color
        const r = mm(0.022);
        const cx = mm(M + w) - r * 1.1;
        const cy = mm(py) + r * 1.1;
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
    Object.assign(card.userData, { w, h, bx, by, lift: 0, hover: false, focus: false, interactive: true });
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
    cards = [];
    checks.count = 0;
    pulses.count = 0;
    drag = null;
    rubber.visible = false;
    sockets.count = 0;
    seenDone.clear();
    linesBuilt = false;
    needId = null;
    needKey = '';
    overview = 0;
    if (callout) { callout.removeFromParent(); callout.dispose(); callout = null; }
    entryAt = null;
    routeView = false;
    focusKey = '';
    lane = null;
    if (engine.focus && !engine.focus.parent) engine.setFocus(null);
  }

  function token(kind, size) {
    const g = new THREE.Group();
    const m = new THREE.Mesh(tokenGeo(kind), mats.token);
    g.add(m);
    if (kind === 'rep') { const b = new THREE.Mesh(barsGeo, mats.bars); b.position.set(0, -0.3, 0.05); b.scale.y = 0.15; g.add(b); g.userData.bars = b; }
    g.scale.setScalar(size);
    g.userData.size = size;
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
  let overview = 0; // the map: seconds the whole interchange stays in view (the impact question begins with it)
  function focusCols() {
    if (model?.kind !== 'graph' || (routeView && screen) || overview > 0) return null;
    if (screen && !small() && !model.impact?.active && model.needs.every((n) => n.done)) return null; // desktop: the finished trail in full
    const open = model.needs.filter((n) => !n.done).map((n) => model.nodes.find((x) => x.id === n.asker).col);
    const c = model.impact?.active || !open.length ? 3 : Math.max(...open);
    return [c - 1, c];
  }
  /** The box of what is in view: the two layers in focus, else everything (holder coordinates). */
  function focusBox() {
    const f = focusCols();
    if (!f) return bounds;
    const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    for (const k of cards) {
      if (!f.includes(k.node.col)) continue;
      b.x0 = Math.min(b.x0, k.x - k.w / 2); b.x1 = Math.max(b.x1, k.x + k.w / 2);
      b.y0 = Math.min(b.y0, k.y - k.h / 2); b.y1 = Math.max(b.y1, k.y + k.h / 2);
    }
    return b;
  }
  function applyFocus() {
    const f = focusCols();
    for (const c of cards) {
      const on = !f || f.includes(c.node.col); // the other layers step aside until the trail is complete
      c.mesh.visible = on;
      c.token.visible = on || map; // the map: the places stay, only their tags step aside
      if (routeView && map) c.mesh.userData.interactive = false; // while the car drives the route nothing is picked
    }
    // Headset: the board and the panel above it follow the layers in view, centred in front of the player.
    const key = f ? f.join() : 'all';
    if (!screen && key !== focusKey) { focusKey = key; frame(focusBox()); }
  }

  /** A flat road along a curve in the map's plane (z: its height above the ground). */
  function ribbon(curve, w, z, segs = 20) {
    const pos = new Float32Array((segs + 1) * 6);
    const idx = [];
    for (let i = 0; i <= segs; i++) {
      curve.getPoint(i / segs, v1);
      curve.getTangent(i / segs, v2);
      const l = Math.hypot(v2.x, v2.y) || 1;
      const nx = (-v2.y / l) * (w / 2);
      const ny = (v2.x / l) * (w / 2);
      pos.set([v1.x + nx, v1.y + ny, z, v1.x - nx, v1.y - ny, z], i * 6);
      if (i < segs) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
  }

  /** The map's ground: dark glass with a faint grid, far larger than the view (the haze takes its far part). */
  function makeGround() {
    const cv = document.createElement('canvas');
    cv.width = 128;
    cv.height = 128;
    const g = cv.getContext('2d');
    g.fillStyle = C('ground');
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = C('ground-line');
    g.lineWidth = 2;
    g.strokeRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(40, 40);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    m.renderOrder = -2;
    return m;
  }

  /** The car's pose on the map: nose along the direction d (in the map's plane), roof up from the ground. */
  const zA = new THREE.Vector3();
  const xA = new THREE.Vector3();
  const nA = new THREE.Vector3(0, 0, 1);
  const basisM = new THREE.Matrix4();
  function orient(obj, d) {
    zA.set(-d.x, -d.y, 0).normalize();
    xA.crossVectors(nA, zA).normalize();
    obj.quaternion.setFromRotationMatrix(basisM.makeBasis(xA, nA, zA));
  }

  /** The map: the entry left of the sources (an upright phone: behind the first row), the car's spot and its way in. */
  function entry() {
    const src = cards.filter((c) => c.node?.col === 0);
    if (!src.length) return null;
    if (vertical) {
      const y = Math.max(...src.map((c) => c.y + c.h / 2)) + 0.2;
      const x = src.reduce((a, c) => a + c.x, 0) / src.length;
      return { p: new THREE.Vector3(x, y, 0), d: new THREE.Vector3(0, -1, 0) };
    }
    const x = Math.min(...src.map((c) => c.x - c.w / 2)) - 0.26;
    const y = src.reduce((a, c) => a + c.y, 0) / src.length;
    return { p: new THREE.Vector3(x, y, 0), d: new THREE.Vector3(1, 0, 0) };
  }

  // ---- links as 3D pipes (the browser's map: as roads on the ground) ----
  function buildLines() {
    clearLines();
    curveOf.clear();
    if (!model) return;
    const byId = new Map(cards.map((c) => [c.id, c]));
    const list = linesOf(model).filter((l) => byId.has(l.a) && byId.has(l.b) && (map || (byId.get(l.a).mesh.visible && byId.get(l.b).mesh.visible)));
    if (map) { // roads into the interchange: from the entry to every source (they say nothing about the route)
      entryAt = entry();
      if (entryAt) for (const c of cards.filter((x) => x.node.col === 0)) list.push({ a: '@entry', b: c.id, kind: 'fixed', entry: true });
    }
    const side = new Map();
    for (const l of list) for (const [id, s] of [[l.a, 'out'], [l.b, 'in']]) { const k = `${id}:${s}`; if (!side.has(k)) side.set(k, []); side.get(k).push(l); }
    for (const [k, ls] of side) {
      const [id, s] = k.split(':');
      const c = byId.get(id);
      if (!c) { ls.forEach((l) => { l.p = entryAt.p.clone().addScaledVector(entryAt.d, 0.14); }); continue; } // the entry
      const other = (l) => byId.get(s === 'out' ? l.b : l.a);
      ls.sort((p, q) => (vertical ? other(p).x - other(q).x : other(q).y - other(p).y));
      ls.forEach((l, i) => {
        const f = (i + 1) / (ls.length + 1);
        const pt = vertical
          ? new THREE.Vector3(c.x - c.w / 2 + c.w * (0.25 + f * 0.5), c.y + (s === 'out' ? -c.h / 2 : c.h / 2 - 0.02), 0.03)
          : new THREE.Vector3(c.x + (s === 'out' ? c.w / 2 : -c.w / 2 + 0.012), c.y + c.h / 2 - c.h * f, 0.03);
        if (s === 'out') l.p = pt; else l.q = pt;
      });
    }
    if (lane) {
      list.forEach((l, i) => {
        const a = byId.get(l.a);
        const b = byId.get(l.b);
        l.p = new THREE.Vector3(a.x + a.w / 2, a.y, 0.03);
        l.q = new THREE.Vector3(b.x + b.w / 2, b.y, 0.03);
        l.reach = 0.035 + (i % 4) * 0.017; // each cable its own track in the lane
      });
    }
    if (map) list.forEach((l) => { l.p.z = 0.004; l.q.z = 0.004; });
    const flowAll = model.needs.every((n) => n.done);
    const tubes = { fixed: [], done: [], pulse: [] };
    const beds = [];
    let ns = 0;
    let nc = 0;
    for (const l of list) {
      const d = Math.max(0.03, (vertical ? l.p.y - l.q.y : l.q.x - l.p.x) / 2);
      const bulge = l.kind === 'fixed' ? 0.02 : 0.035; // the pipe arches towards the viewer
      const c1 = vertical ? new THREE.Vector3(l.p.x, l.p.y - d, l.p.z + bulge) : new THREE.Vector3(l.p.x + d, l.p.y, l.p.z + bulge);
      const c2 = vertical ? new THREE.Vector3(l.q.x, l.q.y + d, l.q.z + bulge) : new THREE.Vector3(l.q.x - d, l.q.y, l.q.z + bulge);
      l.curve = lane
        ? new THREE.CubicBezierCurve3(l.p, new THREE.Vector3(lane.x + l.reach * 1.33, l.p.y, 0.05), new THREE.Vector3(lane.x + l.reach * 1.33, l.q.y, 0.05), l.q)
        : new THREE.CubicBezierCurve3(l.p, c1, c2, l.q);
      if (map) { // flat: the road lies on the ground
        c1.z = 0.004; c2.z = 0.004;
        l.curve = new THREE.CubicBezierCurve3(l.p, c1, c2, l.q);
      }
      curveOf.set(`${l.a}>${l.b}`, l.curve);
      if (map) { // a dark road bed with a lit middle: dim for the roads that were there, bright for the player's
        beds.push(ribbon(l.curve, ROAD * 1.5, 0.002));
        tubes[l.kind].push(ribbon(l.curve, l.kind === 'fixed' ? ROAD * 0.4 : ROAD * 0.75, 0.005));
      } else tubes[l.kind].push(new THREE.TubeGeometry(l.curve, 18, TUBE * (l.kind === 'fixed' ? 0.9 : 1.9), 6, false)); // the player's links are lit roads
      if (l.kind !== 'fixed' || (flowAll && !l.entry)) flows.push(l.curve);
      // every pipe plugs into a socket at both ends; the player's links carry a check mark; a new link sparks once
      if (!map) for (const pt of [l.p, l.q]) if (ns < SOCKETS) sockets.setMatrixAt(ns++, m4.compose(pt, qI, v2.setScalar(TUBE * 2.3)));
      if (model.links.some((x) => x.state === 'done' && x.a === l.a && x.b === l.b) && nc < CHECKS) {
        l.curve.getPoint(0.5, v1);
        v1.z += 0.012;
        checks.setMatrixAt(nc++, m4.compose(v1, qI, v2.setScalar(0.017)));
      }
      const key2 = `${l.a}>${l.b}`;
      if (l.kind === 'done' && !seenDone.has(key2)) {
        seenDone.add(key2);
        if (linesBuilt) scene.burst(holder.localToWorld(v1.copy(l.q)), 'xr-lineage-flow', 10);
      }
    }
    sockets.count = ns;
    sockets.instanceMatrix.needsUpdate = true;
    checks.count = nc;
    checks.instanceMatrix.needsUpdate = true;
    linesBuilt = true;
    if (beds.length) tubes.bed = beds;
    const MAT = map ? { bed: mats.bed, fixed: mats.roadFixed, done: mats.roadDone, pulse: mats.roadPulse } : mats;
    for (const kind of ['bed', 'fixed', 'done', 'pulse']) {
      if (!tubes[kind]?.length) continue;
      const merged = tubes[kind].length > 1 ? mergeGeometries(tubes[kind]) : tubes[kind][0];
      if (tubes[kind].length > 1) tubes[kind].forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, MAT[kind]);
      holder.add(mesh);
      lineMeshes.push(mesh);
    }
    pulses.count = Math.min(PULSES, flows.length * (calm ? 1 : 3));
  }

  /**
   * What a unit of the graph needs is written on one tag at a time: the unit that is selected or
   * pointed at, else the open gap nearest the report (so the graph is machines and pipes, not text).
   */
  function showNeed() {
    let c = null;
    if (model?.kind === 'graph' && !model.impact?.active) {
      const askers = cards.filter((x) => x.v.need.length && x.mesh.visible);
      c = askers.find((x) => x.id === sel) ?? askers.find((x) => x.mesh.userData.hover || x.mesh.userData.focus) ?? askers.sort((p, q) => q.node.col - p.node.col)[0] ?? null;
    }
    const id = c?.id ?? null;
    if (map) {
      const key = c ? `${id}:${c.v.need.join('+')}` : '';
      needId = id;
      if (key !== needKey) { needKey = key; placeCallout(c); }
      return;
    }
    if (id === needId) return;
    const old = cards.find((x) => x.id === needId);
    needId = id;
    old?.mesh.redraw();
    c?.mesh.redraw();
  }

  /** The map: what the open gap needs, on a sign in the gap beside (an upright phone: behind) the place that needs it. */
  function placeCallout(c) {
    if (callout) { callout.removeFromParent(); callout.dispose(); callout = null; }
    if (!c || !map) return;
    const cw = vertical ? Math.min(0.62, Math.max(0.4, c.w)) : 0.4;
    const blocks = [{ text: t('lineageNeeds', { need: c.v.need.join(' + ') }), size: T1, weight: 'bold', color: C('accent') }];
    const h = measure(blocks, cw);
    callout = new Panel((cw + M * 2) * K, (h + M * 2) * K, (ctx, p) => {
      const mm = (x) => p.m(x * K);
      roundRect(ctx, mm(M), mm(M), mm(cw), mm(h), mm(0.016));
      ctx.fillStyle = C('accent-soft');
      ctx.fill();
      ctx.setLineDash([mm(0.014), mm(0.01)]);
      ctx.lineWidth = mm(0.005);
      ctx.strokeStyle = C('accent');
      ctx.stroke();
      ctx.setLineDash([]);
      drawBlocks(ctx, mm, blocks, M + PAD, M + PAD, cw - PAD * 2);
    });
    sharp(callout);
    callout.scale.setScalar(1 / K);
    if (vertical) callout.position.set(THREE.MathUtils.clamp(c.x, -0.43 + cw / 2, 0.43 - cw / 2), c.y + c.h / 2 + 0.012 + h / 2, 0.02);
    else callout.position.set(c.x - c.w / 2 - 0.03 - cw / 2, c.y, 0.02);
    holder.add(callout);
  }

  // ---- looks ----
  const tileLook = (c) => () => {
    const { tl, st } = c;
    const kind = st.kind;
    const u = c.mesh?.userData ?? {};
    const off = kind === 'dim' || kind === 'rest'; // out of the game: darker and muted, but still solid and readable
    const ind = c.indent ?? 0;
    let nameSize = tl.mono ? 0.044 : 0.04;
    if (c.textW) { // a long name without breaks gets a little smaller, never below the metadata's size
      mctx.font = fontOf({ mono: tl.mono, weight: 'bold' }, 100);
      const longest = Math.max(...String(tl.title).split(/(?<=[_.\s])/).map((part) => mctx.measureText(part).width)) / 100;
      nameSize = Math.max(T1 + 0.002, Math.min(nameSize, (c.textW / longest) * 0.98));
    }
    const blocks = [{ text: tl.title, size: nameSize, mono: tl.mono, weight: 'bold', gap: 0.014, color: off ? C('muted') : C('ink') }];
    const tokCol = C(TOK_COLOR[tl.tok] ?? 'accent');
    const hot = (p) => p.key || (st.showKey && p.k === st.keyK);
    if (ind && tl.parts.length) { // the browser's gantry: name and one short line (type, example or owner), the token beside it
      const g = tl.parts.find((p) => p.glyph);
      const nb = (x) => String(x).replace(/ /g, '\u00a0'); // a part breaks between the parts first ("z. B. 1.250,00 €" stays one)
      blocks.push({ text: tl.parts.map((p) => nb(p.glyph ? p.text : `${p.label} ${p.text}`)).join(' · '), size: TS, gap: 0.006, color: C('muted'), glyph: g?.glyph ?? null, hot: tl.parts.some(hot), indent: ind, keep: true });
    } else for (const p of tl.parts) blocks.push({ text: p.glyph ? p.text : `${p.label}  ${p.text}`, size: T1 + 0.003, gap: 0.011, color: C('muted'), glyph: p.glyph ?? null, hot: hot(p) });
    // (the browser marks right and wrong with a badge in the corner; the headset writes it on the tile)
    if (!ind && (kind === 'right' || kind === 'answer')) blocks.push({ text: oddLabel, size: T1, weight: 'bold', color: C('good'), icon: 'good' });
    if (!ind && kind === 'wrong') blocks.push({ text: t('lineageWrong'), size: T1, weight: 'bold', color: C('bad'), icon: 'bad' });
    return {
      blocks, band: tl.owKey ? C(`own-${tl.owKey}`) : null, glow: tl.owKey ? C(`own-${tl.owKey}`) : tokCol, owner: tl.owKey ? tl.parts.find((p) => p.k === 'ow')?.text : null, lit: kind === 'right' || kind === 'answer',
      fill: kind === 'right' ? C('good-soft') : kind === 'wrong' ? C('bad-soft') : off ? C('card-soft') : C('card'),
      stroke: ring(u, kind === 'right' || kind === 'answer' ? C('good-line') : kind === 'wrong' ? C('bad') : C('card-border')),
      dash: kind === 'answer', wide: !!kind || u.hover || u.focus,
      badge: ind && (kind === 'right' || kind === 'answer') ? 'good' : ind && kind === 'wrong' ? 'bad' : null,
      badgeFill: kind === 'wrong' ? C('bad') : C('good-line'),
      opacity: 1,
    };
  };

  const nodeBlocks = (n, v, forSize = false) => {
    const blocks = [{ text: n.title, size: n.kind === 'desc' ? T1 + 0.002 : nameSize, mono: n.mono, weight: 'bold', gap: 0.008 }];
    if (n.meta) blocks.push({ text: small() ? `${n.meta.ty} · ${n.meta.ex}` : `${n.meta.ty} · ${n.meta.ex} · ${n.meta.ow}`, size: T1, color: C('muted'), glyph: n.meta.glyph, keep: true });
    else if (n.text) blocks.push({ text: n.text, size: T1, color: C('muted') });
    if (map && n.id === 'r1') blocks.push({ text: t('lineageGoal'), size: T1, weight: 'bold', color: C('accent'), icon: 'flag' });
    if (!map && v.need.length && n.kind !== 'desc' && (forSize || n.id === needId)) blocks.push({ text: t('lineageNeeds', { need: v.need.join(' + ') }), size: T1, weight: 'bold', color: C('accent') });
    if (v.mark === 'hit') blocks.push({ text: t('lineageAffected'), size: T1, weight: 'bold', color: C('pulse'), icon: 'good' });
    else if (v.mark === 'miss') blocks.push({ text: t('lineageNotAffected'), size: T1, weight: 'bold', color: C('bad'), icon: 'bad' });
    else if (!map && v.done && !v.need.length && n.kind !== 'desc' && n.kind !== 'field') blocks.push({ text: t('lineageDone'), size: T1, weight: 'bold', color: C('good'), icon: 'good' });
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
      ownerNote: small() && c.node.meta && (u.hover || u.focus || v.selected) ? c.node.meta.ow : null,
      glow: v.changed ? C('pulse-line') : c.node.meta?.owKey ? C(`own-${c.node.meta.owKey}`) : C(TOK_COLOR[c.node.kind] ?? 'accent'), owner: c.node.meta?.ow ?? null, lit: v.selected || v.done || v.changed,
      fill: v.selected ? C('accent-soft') : v.changed || v.mark === 'hit' ? C('pulse-soft') : v.done ? C('good-soft') : v.selectable ? C('card') : C('card-soft'),
      stroke: ring(u, v.selected ? C('accent') : v.changed || v.mark === 'hit' || pick ? C('pulse-line') : v.mark === 'miss' ? C('bad') : v.done ? C('good-line') : v.need.length ? C('accent') : C('card-border')),
      dash: (v.need.length > 0 || pick) && !v.selected && !u.focus,
      wide: v.selected || v.changed || !!v.mark || pick || u.hover || u.focus,
      badge: v.changed ? 'change' : v.done && (map || c.node.kind === 'desc' || c.node.kind === 'field') ? 'good' : null,
      badgeFill: v.changed ? C('pulse-line') : v.need.length ? C('accent') : C('good-line'),
      halo: v.selected,
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
    const curve = new THREE.QuadraticBezierCurve3(p, mid, q);
    const at = curve.getPoint(0.5);
    const mat = mats.bad.clone();
    const mesh = new THREE.Mesh(mergeGeometries([
      new THREE.TubeGeometry(curve, 18, TUBE * 1.3, 6, false),
      new THREE.BoxGeometry(0.05, 0.011, 0.011).rotateZ(Math.PI / 4).translate(at.x, at.y, at.z + 0.012), // the cross
      new THREE.BoxGeometry(0.05, 0.011, 0.011).rotateZ(-Math.PI / 4).translate(at.x, at.y, at.z + 0.012),
    ]), mat);
    holder.add(mesh);
    const x0 = ca.mesh.position.x;
    scene.tween(1.1, (k) => {
      mat.opacity = k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45;
      if (!calm) {
        mesh.position.y = Math.sin(k * 20) * 0.008 * Math.max(0, 1 - k * 2);
        ca.mesh.position.x = x0 + Math.sin(k * 24) * 0.012 * Math.max(0, 1 - k * 1.6);
      }
    }, { ease: (k) => k, onDone: () => { mesh.removeFromParent(); mesh.geometry.dispose(); mat.dispose(); ca.mesh.position.x = x0; } });
  }

  /** The map: the car drives in from the entry along the lit roads to the destination and stays there. */
  function driveMap(obj, done, onMove) {
    const path = [];
    let at = 'r1';
    for (let i = 0; i < 4; i++) {
      const l = model.links.find((x) => x.b === at && x.state === 'done' && curveOf.has(`${x.a}>${x.b}`)) ?? model.links.find((x) => x.b === at && curveOf.has(`${x.a}>${x.b}`));
      if (!l) break;
      path.unshift(curveOf.get(`${l.a}>${l.b}`));
      at = l.a;
    }
    const lead = curveOf.get(`@entry>${at}`);
    const legs = [];
    if (lead) legs.push(new THREE.LineCurve3(obj.position.clone().setZ(0.004), lead.getPoint(0)), lead);
    path.forEach((c, i) => { // across each place from where the road comes in to where the next one leaves
      if (legs.length) legs.push(new THREE.LineCurve3(legs[legs.length - 1].getPoint(1), c.getPoint(0)));
      legs.push(c);
    });
    const stopAt = 0.13; // it stops on the road in front of the destination, its tag stays free
    const end = () => { routeView = false; applyFocus(); buildLines(); done?.(); };
    if (!legs.length) { end(); return; }
    const lens = legs.map((c) => Math.max(1e-4, c.getLength()));
    const total = Math.max(0.01, lens.reduce((a, b) => a + b, 0) - stopAt);
    const tan = new THREE.Vector3();
    let last = 0;
    scene.tween(calm ? 1.4 : Math.min(4.2, 1.6 + total * 0.45), (k) => {
      let d = k * total;
      onMove?.(d - last);
      last = d;
      let i = 0;
      while (i < legs.length - 1 && d > lens[i]) { d -= lens[i]; i += 1; }
      const u = Math.min(1, d / lens[i]);
      legs[i].getPoint(u, obj.position);
      obj.position.z = 0.004;
      legs[i].getTangent(u, tan);
      if (Math.hypot(tan.x, tan.y) > 1e-4) orient(obj, tan);
    }, { ease: (k) => k * k * (3 - 2 * k), onDone: end });
  }

  const interactives = () => cards.map((c) => c.mesh).filter((o) => o.userData.interactive && o.parent && o.visible);
  const rectOf = (o) => { const u = o.userData; const p = o.position; return { x0: p.x - u.w / 2, x1: p.x + u.w / 2, y0: p.y - u.h / 2, y1: p.y + u.h / 2, x: p.x, y: p.y }; };

  const api = {
    holder,

    show(on) {
      holder.visible = on;
      if (!on) { clearContent(); cardUi.forEach((o) => { o.removeFromParent(); o.dispose?.(); }); cardUi = []; }
    },

    clear() { clearContent(); model = null; map = false; holder.rotation.x = 0; ground?.removeFromParent(); },
    setHud(h) { state.hud = h; head?.redraw(); },
    setPrompt(text) { if (state.prompt !== text) { state.prompt = text; head?.redraw(); } },
    setFeedback(kind, text) { state.fb = kind; state.fbText = text ?? ''; head?.redraw(); },
    setSpeed() { /* the bonus counts; the room shows no clock (the browser's strip does) */ },
    setHint(s) { state.hint = s === 'ready'; if (hintBtn) hintBtn.visible = state.hint; },

    /** The field's box in the scene's coordinates: the browser's camera frames exactly this. */
    frameBox() {
      const p = holder.position;
      const m = 0.014;
      const b = focusBox();
      return { x0: p.x + b.x0 - m, x1: p.x + b.x1 + m, y0: p.y + b.y0 - m, y1: p.y + b.y1 + m, z: p.z + 0.02, bar: p.y + barY };
    },

    /** The browser: the points the camera must show (world), for the labels in view and, on the map, their places. */
    framePoints(out = []) {
      holder.updateMatrixWorld(true);
      for (const c of cards) {
        if (!c.mesh.visible) continue;
        const u = c.mesh.userData;
        for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) out.push(c.mesh.localToWorld(new THREE.Vector3(sx * (u.w / 2 + 0.01) * K, sy * (u.h / 2 + 0.006) * K, 0)));
        if (map) { // its token (it stands up from the map) and a little of the map around the tags
          const tk = c.token;
          if (!vertical) out.push(holder.localToWorld(new THREE.Vector3(tk.position.x - tk.userData.size * 0.6, tk.position.y, tk.position.z + tk.userData.size * 0.5)));
          if (!vertical) for (const sx of [-1, 1]) out.push(holder.localToWorld(new THREE.Vector3(c.x + sx * (c.w / 2 + 0.12), c.y, 0)));
        }
      }
      if (scanner && !map) out.push(holder.localToWorld(new THREE.Vector3(0, barY + 0.035, 0.06)));
      return out;
    },

    // ---- stage 1: tokens in a row under the scanner ----
    showOdd({ tiles, key, rightLabel, delay = 0 }) {
      oddLabel = rightLabel ?? t('lineageOdd');
      clearContent();
      model = null;
      resetBounds();
      toZone();
      holder.rotation.x = 0;
      map = false;
      ground?.removeFromParent();
      const up2 = tall();
      // The browser: the tiles hang on the gantry over the road, each token beside its tag (compact,
      // so the road and the car below stay in view); an upright phone hangs them in two rows.
      // (the headset hangs them compact too, a little narrower: the row stands at arm's length)
      const cols = up2 ? 2 : tiles.length;
      const side = false;
      const tw = screen ? (up2 ? 0.43 : 0.47) : 0.43;
      const zone = { bx: up2 ? 0.095 : screen ? 0.11 : 0.085, inset: true };
      const gap = 0.03;
      const items = tiles.map((tl, i) => ({ tl, i, st: { kind: null, keyK: key, showKey: false }, indent: zone.inset ? zone.bx : 0, textW: zone.inset ? tw - PAD * 2 : 0 }));
      const th = Math.max(side ? 0.2 : 0, ...items.map((it) => measure(tileLook({ ...it, st: { kind: 'right' } })().blocks, tw, zone.inset ? 0 : zone.bx ?? 0))) + (zone.by ?? 0);
      const rows = Math.ceil(tiles.length / cols);
      items.forEach((c) => {
        const col = c.i % cols;
        const row = Math.floor(c.i / cols);
        const inRow = Math.min(cols, tiles.length - row * cols); // a short last row stands in the middle
        const x = (col - (inRow - 1) / 2) * (tw + gap);
        const y = ((rows - 1) / 2 - row) * (th + gap);
        const mesh = makeCard(tw, th, tileLook(c), zone);
        c.mesh = mesh;
        Object.assign(c, place(mesh, x, y, c));
        cards[cards.length - 1] = c;
        mesh.userData.label = `${c.tl.title}. ${c.tl.parts.map((p) => `${p.label} ${p.text}`).join('. ')}`;
        mesh.userData.onClick = () => onPickOdd?.(c.i);
        // its token stands on the pedestal: large enough to tell a coin from a calendar at a glance
        const tok = token(c.tl.tok, (zone.bx ?? zone.by) * (zone.inset ? 0.62 : 0.7));
        // (inset: below the name, beside the lines; the name's line is about 0.07 m)
        tok.position.set(zone.bx ? x - tw / 2 + zone.bx / 2 + (zone.inset ? PAD * 0.6 : 0) : x, zone.inset ? y - 0.035 : zone.bx ? y + 0.012 : y + th / 2 - zone.by / 2 + 0.014, 0.075);
        content.add(tok);
        c.token = tok;
        c.home = new THREE.Vector3(x, y, 0.012);
        c.tokHome = tok.position.clone();
        arrive(mesh, tok, delay + c.i * 0.07);
      });
      // the scanner: a bar of light above the row and a beam that passes over the tokens
      const W = bounds.x1 - bounds.x0;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(W, 0.016, 0.02), mats.drag);
      bar.position.set(0, bounds.y1 + 0.02, 0.06);
      const oneRow = rows === 1 && !side && !zone.bx;
      const bh = oneRow ? zone.by + 0.03 : bounds.y1 - bounds.y0 + 0.02;
      const beam = new THREE.Mesh(new THREE.PlaneGeometry(zone.bx ? zone.bx : tw * 0.62, bh), mats.scan);
      beam.position.set(0, oneRow ? bounds.y1 - zone.by / 2 + 0.01 : (bounds.y0 + bounds.y1) / 2 + 0.01, 0.13);
      beam.visible = !screen; // the browser: the gantry's time bar is enough
      holder.add(bar, beam);
      extras.push(bar, beam);
      barY = bar.position.y;
      bounds.y1 += screen ? 0.03 : 0.05; // room for the token that is lifted out
      scanner = side ? { bar, beam, x0: -tw / 2 + zone.bx / 2, x1: -tw / 2 + zone.bx / 2, to: null, side: true } : { bar, beam, x0: bounds.x0 + tw * 0.5, x1: bounds.x1 - tw * 0.5, to: null };
      bounds.x0 -= up2 ? 0.01 : 0.045;
      bounds.x1 += up2 ? 0.01 : 0.045;
      frame();
    },

    /** The time that is left before the car reaches the obstacle (1 to 0): the bar above the tiles shrinks and turns red. */
    setTimer(k) {
      if (!scanner) return;
      scanner.bar.visible = k != null;
      if (k == null) return;
      scanner.bar.scale.x = Math.max(0.001, k);
      scanner.bar.material = k < 0.3 ? mats.bad : mats.drag;
    },

    markOdd(i, kind) {
      const c = cards[i];
      if (!c) return;
      c.st.kind = kind;
      if (kind === 'dim') c.mesh.userData.interactive = false;
      if (kind === 'wrong' || kind === 'answer') cards.forEach((x) => { x.st.showKey = true; x.mesh.redraw(); }); // the scanner shows what decides
      if (kind === 'right' || kind === 'answer') { if (scanner && !scanner.side) scanner.to = c.x; }
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
      const flat = small() && !up2; // a phone held sideways
      vertical = graph && up2;
      // The browser: the graph is an interchange, a map that lies tilted back; its places stand on it, the links are roads.
      map = screen && graph;
      TILT = THREE.MathUtils.degToRad(num(up2 ? 'xr-lineage-map-tilt-tall' : 'xr-lineage-map-tilt'));
      holder.rotation.x = map ? -TILT : 0;
      if (map) {
        if (!ground) ground = makeGround();
        holder.add(ground);
      } else ground?.removeFromParent();
      const n = b.cols.length;
      const layers = b.cols.map((label, ci) => b.nodes.filter((nd) => nd.col === ci));
      // The unit: the token on its pedestal beside the tag; on an upright phone the graph's machines stand on top of their tags.
      const zoneOf = (nd) => (map ? (vertical ? { by: 0.13 } : { bx: flat ? 0.12 : 0.14 }) : vertical ? { by: 0.2 } : { bx: flat ? (graph ? 0.15 : 0.11) : up2 ? (nd.kind === 'field' ? 0.17 : 0.11) : graph ? 0.2 : 0.17 });
      nameSize = flat ? T1 + 0.001 : T2;
      const stack = !graph && up2; // an upright phone, stage 2: full-width rows, the pages above the rack
      const mk = (nd, w) => {
        const zone = zoneOf(nd);
        const bx = zone.bx ?? 0;
        const minH = stack ? (nd.kind === 'field' ? 0.15 : 0.11) : bx ? Math.max(0.11, bx * 0.92) : 0;
        return { node: nd, w, zone, h: Math.max(minH, measure(nodeBlocks(nd, nodeView(b, nd, null), true), w, bx) + 0.004) + (zone.by ?? 0) };
      };
      const GAP = map ? 0.05 : flat || stack ? 0.008 : 0.02;
      const placed = [];
      if (stack) {
        const W = 0.86;
        const LANE = 0.085; // room at the right for the cables
        const fw = W - LANE;
        const pw = fw;
        let y = 0;
        layers[0].forEach((nd) => { const it = mk(nd, pw); placed.push({ ...it, x: -W / 2 + pw / 2, y: y - it.h / 2 }); y -= it.h + GAP; });
        y -= 0.03;
        layers[1].forEach((nd) => { const it = mk(nd, fw); placed.push({ ...it, x: -W / 2 + fw / 2, y: y - it.h / 2 }); y -= it.h + GAP; });
        lane = { x: -W / 2 + fw };
      } else if (vertical) {
        // an upright phone: four layers from the sources (top) to the reports (bottom)
        const W = 0.86;
        const gapX = 0.025;
        let y = 0;
        layers.forEach((list) => {
          const w = (W - gapX * (list.length - 1)) / list.length;
          const its = list.map((nd) => mk(nd, w));
          const h = Math.max(...its.map((it) => it.h));
          its.forEach((it, i) => placed.push({ ...it, h, x: -W / 2 + w / 2 + i * (w + gapX), y: y - h / 2 }));
          y -= h + (map ? 0.2 : 0.12);
        });
      } else {
        const lineGap = map ? 0.47 : graph ? 0.24 : 0.26;
        const cw = map ? (flat ? 0.46 : 0.5) : graph ? 0.54 : flat ? 0.8 : 0.72;
        const colsL = layers.map((list, ci) => {
          const its = list.map((nd) => mk(nd, cw));
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
        const bx = it.zone.bx ?? 0;
        const by = it.zone.by ?? 0;
        const mesh = makeCard(it.w, it.h, nodeLook(c), it.zone);
        c.mesh = mesh;
        Object.assign(c, place(mesh, it.x, it.y, { id: it.node.id, node: it.node, v: c.v }));
        cards[cards.length - 1] = c;
        Object.assign(mesh.userData, { nodeId: it.node.id, label: it.node.meta ? `${it.node.title}. ${it.node.meta.ty}, ${it.node.meta.ex}, ${it.node.meta.ow}` : it.node.title });
        const kind = it.node.kind === 'field' ? it.node.meta.tyKey : it.node.kind;
        const big = map && it.node.id === 'r1' ? 1.2 : 1; // the destination: a large sign
        const tok = token(kind, (by ? by : Math.min(bx, it.h)) * (stack && kind !== 'desc' ? 0.9 : 0.72) * big);
        if (by) tok.position.set(it.x, it.y + it.h / 2 - by / 2 + 0.012, 0.07);
        else tok.position.set(it.x - it.w / 2 + bx / 2, it.y + 0.01, 0.07);
        if (map) { tok.rotation.x = TILT; tok.position.z = 0.06 * big; } // the places stand upright on the map
        content.add(tok);
        c.token = tok;
        // Press and release on the same unit selects it; released on another unit it links them.
        mesh.userData.onGrab = (p) => { drag = { id: it.node.id, p, card: c }; };
        mesh.userData.onRelease = (p, over) => {
          drag = null;
          rubber.visible = false;
          const other = over?.userData.nodeId;
          if (other && other !== it.node.id) onLink?.(it.node.id, other); else onNode?.(it.node.id);
        };
        mesh.userData.onClick = () => onNode?.(it.node.id); // the keyboard's Enter
      });
      if (!graph) { // the table rack: posts, a shelf under each field and a slot that holds its token
        const fields = cards.filter((c) => c.node.kind === 'field');
        const rack = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mats.rack, fields.length * 2 + 2);
        const fx = fields[0].x;
        const fw = fields[0].w;
        const bx = fields[0].mesh.userData.bx;
        const top = Math.max(...fields.map((c) => c.y + c.h / 2));
        const bot = Math.min(...fields.map((c) => c.y - c.h / 2));
        [-1, 1].forEach((s, i) => rack.setMatrixAt(i, m4.makeScale(0.007, top - bot + 0.03, 0.007).setPosition(fx - fw / 2 + (s < 0 ? -0.008 : bx + 0.004), (top + bot) / 2, 0.004)));
        fields.forEach((c, i) => {
          rack.setMatrixAt(2 + i * 2, m4.makeScale(bx + 0.012, 0.006, 0.05).setPosition(fx - fw / 2 + bx / 2 - 0.002, c.y - c.h / 2 + 0.004, 0.02));
          rack.setMatrixAt(3 + i * 2, m4.makeScale(bx + 0.012, 0.004, 0.004).setPosition(fx - fw / 2 + bx / 2 - 0.002, c.y + c.h / 2 - 0.004, 0.004));
        });
        holder.add(rack);
        extras.push(rack);
        bounds.x0 -= 0.012;
        if (lane) bounds.x1 = Math.max(bounds.x1, lane.x + 0.085);
      }
      if (!screen) bounds.y1 += 0.01;
      if (ground) ground.position.set((bounds.x0 + bounds.x1) / 2, (bounds.y0 + bounds.y1) / 2, -0.004);
      frame();
    },

    /** The browser: the car stands parked at the entry of the interchange (obj: the car with Echo). */
    parkCar(obj) {
      if (!map) return;
      const e = entry();
      if (!e) return;
      holder.add(obj);
      obj.scale.setScalar(num('xr-lineage-map-car'));
      obj.position.copy(e.p);
      orient(obj, e.d);
      obj.visible = true;
    },

    refresh({ sel: s }) {
      if (!model) return;
      if (map && model.impact?.active && !model.impact.shown) { model.impact.shown = true; overview = 2.6; }
      sel = s;
      for (const c of cards) {
        const v = nodeView(model, c.node, sel);
        const key = JSON.stringify([v.need, v.selectable, v.selected, v.done, v.changed, v.mark, !!model.impact?.active]);
        c.v = v;
        c.mesh.userData.interactive = v.selectable;
        if (key !== c.key) { c.key = key; c.mesh.redraw(); }
        // a report's chart comes alive when it is fed, and turns with the change that reaches it
        if (c.token.userData.bars) c.fed = v.mark === 'hit' || (v.done && !v.need.length) ? 1 : c.node.col === 3 && model.links.some((l) => l.b === c.id) ? 0.6 : 0.15;
      }
      applyFocus();
      buildLines();
      showNeed();
    },

    shake,

    /**
     * The route is complete: the whole interchange shows and a small car drives it from a source
     * to the destination (obj: the car, about 0.5 m long). done() when it has arrived.
     */
    driveRoute(obj, done, onMove) {
      routeView = true;
      applyFocus();
      buildLines();
      if (map) { driveMap(obj, done, onMove); return; }
      // from the destination back along the lit roads to a source
      const path = [];
      let at = 'r1';
      for (let i = 0; i < 4; i++) {
        const l = model.links.find((x) => x.b === at && curveOf.has(`${x.a}>${x.b}`) && x.state === 'done') ?? model.links.find((x) => x.b === at && curveOf.has(`${x.a}>${x.b}`));
        if (!l) break;
        path.unshift(curveOf.get(`${l.a}>${l.b}`));
        at = l.a;
      }
      const end = () => { obj.removeFromParent(); routeView = false; applyFocus(); buildLines(); done?.(); };
      if (!path.length) { end(); return; }
      obj.scale.setScalar(0.3);
      holder.add(obj);
      const tan = new THREE.Vector3();
      const zAxis = new THREE.Vector3();
      const xAxis = new THREE.Vector3();
      const yAxis = new THREE.Vector3(0, 0, 1);
      const basis = new THREE.Matrix4();
      scene.tween(calm ? 1.2 : 2.6, (k) => {
        const f = Math.min(path.length - 1e-4, k * path.length);
        const c = path[Math.floor(f)];
        c.getPoint(f % 1, obj.position);
        obj.position.z += 0.03;
        c.getTangent(f % 1, tan).setZ(0).normalize();
        zAxis.copy(tan).negate(); // the car's nose points along the road, its roof at the viewer
        xAxis.crossVectors(yAxis, zAxis).normalize();
        obj.quaternion.setFromRotationMatrix(basis.makeBasis(xAxis, yAxis, zAxis));
      }, { ease: (k) => k * k * (3 - 2 * k), onDone: end });
    },

    /** For tests: the whole map is in view for a moment (the impact question begins with it). */
    get overview() { return overview > 0; },

    /** For tests: the smallest text size on the field right now (m). */
    textMin: () => (model ? T1 : scanner && screen ? TS : T1),

    /** For tests: the car's place on the map (holder coordinates). */
    carSpot: () => entryAt?.p ?? null,

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
      // It stays where the unit stood when the points were made (the board may move on to the next layers).
      const base = scene.group.worldToLocal(holder.localToWorld(new THREE.Vector3(c.x, c.y + c.h / 2, 0.1)));
      p.position.copy(base);
      p.userData.noFit = true;
      scene.group.add(p);
      scene.tween(1.1, (k) => {
        const sc = calm ? 1 : k < 0.15 ? 0.6 + (k / 0.15) * 0.5 : 1.1 - Math.min(0.1, (k - 0.15) * 0.5);
        p.scale.setScalar(sc / K);
        if (!calm) p.position.y = base.y + k * 0.1;
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
        { text: card.lines[1], size: 'xr-text-sm', weight: 'bold', color: C('accent') },
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
      const list = interactives();
      if (!list.length) return;
      const cur = list.includes(engine.focus) ? engine.focus : null;
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
      return cards.map((c) => ({ key: c.id ?? `tile${c.i}`, mesh: c.mesh }));
    },

    tick(dt) {
      if (!holder.visible) return;
      time += dt;
      if (overview > 0) { overview -= dt; if (overview <= 0) { applyFocus(); buildLines(); showNeed(); } }
      for (const c of cards) {
        const u = c.mesh.userData;
        const want = u.hover || u.focus || (c.id && c.id === sel) ? 1 : 0;
        if (Math.abs(want - u.lift) > 0.002) {
          u.lift += (want - u.lift) * Math.min(1, dt * (calm ? 30 : 12));
          if (!c.st?.kind) c.mesh.position.z = 0.012 + u.lift * LIFT;
        }
        // tokens turn a little, the gear keeps turning, a fed report's bars grow
        const tk = c.token;
        if (tk && u.lift > 0.002 && tk.scale.x > 0.01) tk.scale.setScalar(tk.userData.size * (1 + 0.16 * u.lift));
        if (tk && !calm) {
          if (tk.userData.kind === 'tr') tk.rotation.z += dt * 1.2;
          else tk.rotation.y = Math.sin(time * 0.9 + tk.userData.ph) * 0.45;
        }
        if (tk?.userData.bars && c.fed != null) tk.userData.bars.scale.y += (c.fed - tk.userData.bars.scale.y) * Math.min(1, dt * (calm ? 30 : 3));
      }
      const hov = cards.find((x) => x.mesh.userData.hover || x.mesh.userData.focus)?.id ?? '';
      if (hov !== api.hov) { api.hov = hov; showNeed(); }
      if (scanner) { // the beam sweeps over the row; after the answer it rests on the odd token
        const x = scanner.to ?? (scanner.x0 + scanner.x1) / 2 + (calm ? 0 : Math.sin(time * 1.3) * (scanner.x1 - scanner.x0) / 2);
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
      if (ground) { ground.removeFromParent(); ground.geometry.dispose(); ground.material.map.dispose(); ground.material.dispose(); }
      Object.values(mats).forEach((m) => m.dispose());
      geos.forEach((g) => g.dispose());
      barsGeo.dispose();
      dotGeo.dispose();
      rubber.geometry.dispose();
      checkGeo.dispose();
      checkMat.dispose();
      holder.removeFromParent();
    },
  };
  return api;
}
