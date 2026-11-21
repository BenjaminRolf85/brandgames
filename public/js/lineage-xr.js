// "Datenspur" in the headset (AR and VR): the same boards as 3D panels at arm's length. A light,
// solid board (readable over a bright room in AR) carries one card per tile or node; every card
// is its own panel that comes forward when pointed at. Links are real 3D curves (tubes) that
// arch out of the board from card to card: grey for given links, green with travelling light
// for the player's links, a dotted violet curve with a tag ("KI 83 %") for the assistant's
// proposals. Connecting: press one card, then the other; or press and hold on a card, move, and
// release on its counterpart (a line follows the ray). Above the board one panel shows the
// stages, the points, the prompt and the feedback.
// Budget: one draw call per card (canvas textures are redrawn only when a card's content
// changes), all tubes of one kind are merged into one mesh, dots and light pulses are instanced.
import * as THREE from 'three';
import { Panel, Button, roundRect, wrap, textPanel } from './ui3d.js';
import { color, hex, num, font } from './tokens.js';
import { t } from './i18n.js';
import { nodeView, linesOf } from './lineage-model.js';
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';

const mctx = document.createElement('canvas').getContext('2d');
const M = 0.016; // margin around a card for its soft shadow (m)
const PAD = 0.02; // padding inside a card (m)
const LH = 1.22;

const fontOf = (b, px) => (b.mono ? `${color('font-weight-bold')} ${Math.round(px)}px ${color('font-mono')}` : font(b.weight ?? 'regular', px));

/** Wraps a technical name at its separators (CUST_NO, CRM.CUSTOMER), other text at spaces. */
function wrapText(ctx, b, maxW) {
  if (!b.mono) return wrap(ctx, b.text, maxW);
  const parts = String(b.text).split(/(?<=[_.\s])/);
  const lines = [];
  let line = '';
  for (const part of parts) {
    if (line && ctx.measureText(line + part).width > maxW) { lines.push(line); line = part; } else line += part;
  }
  lines.push(line);
  return lines;
}

/** Height (m) of text blocks inside a card of width w. */
function measure(blocks, w) {
  const ppm = num('xr-px-per-meter');
  let h = 0;
  blocks.forEach((b, i) => {
    const px = b.size * ppm;
    mctx.font = fontOf(b, px);
    const indent = b.glyph ? px * 2.5 : b.icon ? px * 1.3 : 0;
    h += wrapText(mctx, b, (w - PAD * 2) * ppm - indent).length * b.size * LH + (i < blocks.length - 1 ? (b.gap ?? 0.008) : 0);
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

/** Draws text blocks into a card; block: { text, size, weight, mono, color, glyph, icon, gap }. */
function drawBlocks(ctx, p, blocks, x0, y0, w) {
  let y = p.m(y0);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  blocks.forEach((b) => {
    const px = p.m(b.size);
    ctx.font = fontOf(b, px);
    const indent = b.glyph ? px * 2.5 : b.icon ? px * 1.3 : 0;
    const lines = wrapText(ctx, b, p.m(w) - indent);
    lines.forEach((line, i) => {
      let x = p.m(x0);
      const cy = y + (px * LH) / 2;
      if (i === 0 && b.glyph) {
        ctx.fillStyle = color('xr-lineage-ink');
        roundRect(ctx, x, cy - px * 0.62, px * 2.1, px * 1.24, px * 0.25);
        ctx.fill();
        ctx.fillStyle = color('xr-lineage-card');
        ctx.font = `${color('font-weight-bold')} ${Math.round(px * 0.8)}px ${color('font-mono')}`;
        ctx.textAlign = 'center';
        ctx.fillText(b.glyph, x + px * 1.05, cy + 1);
        ctx.textAlign = 'left';
        ctx.font = fontOf(b, px);
      }
      if (i === 0 && b.icon) { ctx.fillStyle = b.color; drawMark(ctx, b.icon, x, cy - px * 0.5, px); }
      if (i === 0) x += indent;
      ctx.fillStyle = b.color ?? color('xr-lineage-ink');
      ctx.fillText(line, x, cy);
      y += px * LH;
    });
    y += p.m(b.gap ?? 0.008);
  });
}

/** A card: a rounded, softly shadowed panel. look() returns { fill, stroke, dash, blocks, opacity }. */
function makeCard(w, h, look) {
  const card = new Panel(w + M * 2, h + M * 2, (ctx, p) => {
    const L = look();
    ctx.save();
    ctx.shadowColor = color('xr-lineage-card-shadow');
    ctx.shadowBlur = p.m(0.012);
    ctx.shadowOffsetY = p.m(0.004);
    roundRect(ctx, p.m(M), p.m(M), p.m(w), p.m(h), p.m(0.022));
    ctx.fillStyle = L.fill;
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = p.m(L.wide ? 0.008 : 0.005);
    ctx.strokeStyle = L.stroke;
    if (L.dash) ctx.setLineDash([p.m(0.016), p.m(0.012)]);
    roundRect(ctx, p.m(M), p.m(M), p.m(w), p.m(h), p.m(0.022));
    ctx.stroke();
    ctx.setLineDash([]);
    drawBlocks(ctx, p, L.blocks, M + PAD, M + PAD, w - PAD * 2);
    if (L.badge) { // a mark in the corner (e.g. the source that changes): more than a color
      const r = p.m(0.024);
      const cx = p.m(M + w) - r * 1.1;
      const cy = p.m(M) + r * 1.1;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = color('xr-lineage-pulse-line');
      ctx.fill();
      ctx.fillStyle = color('xr-lineage-ink');
      drawMark(ctx, L.badge, cx - r * 0.62, cy - r * 0.7, r * 1.24);
    }
    p.material.opacity = L.opacity ?? 1;
  });
  card.userData.w = w;
  card.userData.h = h;
  card.userData.lift = 0;
  card.userData.hover = false;
  card.userData.setHover = (v) => { card.userData.hover = v; };
  card.userData.setFocus = (v) => { card.userData.hover = v; };
  return card;
}

export function xrView(scene, { onPickOdd, onNode, onLink, onAccept, onHint, onNext, onMenu, calm = false }) {
  const { engine } = scene;
  const DIST = num('xr-lineage-xr-dist');
  const LIFT = num('xr-lineage-xr-lift');
  const TUBE = num('xr-lineage-xr-tube');
  const T1 = num('xr-text-sm'); // meta lines: never below this token
  const T2 = Math.max(T1, 0.04); // names
  const holder = new THREE.Group();
  holder.position.set(0, scene.eye - num('xr-lineage-xr-drop'), -DIST);
  holder.visible = false;
  scene.group.add(holder);
  const content = new THREE.Group(); // rebuilt for every tile row and every board
  holder.add(content);

  const C = (k) => color(`xr-lineage-${k}`);
  const mats = {
    fixed: new THREE.MeshBasicMaterial({ color: hex('xr-lineage-line'), toneMapped: false }),
    done: new THREE.MeshBasicMaterial({ color: hex('xr-lineage-good'), toneMapped: false }),
    pulse: new THREE.MeshBasicMaterial({ color: hex('xr-lineage-pulse-line'), toneMapped: false }),
    ai: new THREE.MeshBasicMaterial({ color: hex('xr-lineage-ai'), toneMapped: false }),
    light: new THREE.MeshBasicMaterial({ color: hex('xr-lineage-flow-light'), toneMapped: false }),
    drag: new THREE.MeshBasicMaterial({ color: hex('xr-lineage-accent'), toneMapped: false }),
    bad: new THREE.MeshBasicMaterial({ color: hex('xr-lineage-bad'), toneMapped: false, transparent: true }),
  };
  const dotGeo = new THREE.SphereGeometry(1, 10, 8);
  const DOTS = 220;
  const dots = new THREE.InstancedMesh(dotGeo, mats.ai, DOTS);
  const PULSES = 48;
  const pulses = new THREE.InstancedMesh(dotGeo, mats.light, PULSES);
  dots.frustumCulled = false;
  pulses.frustumCulled = false;
  dots.count = 0;
  pulses.count = 0;
  holder.add(dots, pulses);
  const rubber = new THREE.Mesh(new THREE.CylinderGeometry(TUBE, TUBE, 1, 8).translate(0, 0.5, 0), mats.drag);
  rubber.visible = false;
  holder.add(rubber);

  // ---- the head panel: stages, points, streak, prompt, feedback ----
  const state = { hud: null, prompt: '', fb: null, fbText: '', speed: null, hint: false };
  let W = num('xr-lineage-xr-width');
  let H = num('xr-lineage-xr-height');
  let head = null;
  let menuBtn = null;
  let hintBtn = null;
  let boardPanel = null;
  const HEAD_H = 0.29;

  function buildHead() {
    [head, menuBtn, hintBtn].forEach((o) => { if (o) { o.removeFromParent(); o.dispose(); } });
    head = new Panel(W, HEAD_H, (ctx, p) => {
      roundRect(ctx, 2, 2, p.canvas.width - 4, p.canvas.height - 4, p.m(0.026));
      ctx.fillStyle = C('card');
      ctx.fill();
      ctx.lineWidth = p.m(0.005);
      ctx.strokeStyle = C('board-edge');
      ctx.stroke();
      const hud = state.hud;
      ctx.textBaseline = 'middle';
      // row 1: the three stages, the points and the streak (the menu button sits at the right end)
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
          if (now) {
            ctx.save();
            ctx.clip();
            ctx.fillStyle = C('accent');
            ctx.globalAlpha = 0.28;
            ctx.fillRect(x, cy - p.m(0.028), w * (hud.done / Math.max(1, hud.total)), p.m(0.056));
            ctx.restore();
            roundRect(ctx, x, cy - p.m(0.028), w, p.m(0.056), p.m(0.028));
            ctx.lineWidth = p.m(0.004);
            ctx.strokeStyle = C('accent');
            ctx.stroke();
          }
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
        const st = `${t('lineageStreak', { n: hud.streak })}${hud.mult > 1 ? ` ${hud.multText}` : ''}`;
        ctx.font = font('bold', p.m(T1));
        ctx.fillStyle = hud.mult > 1 ? C('good') : C('muted');
        ctx.fillText(st, right - ctx.measureText(sc).width * 1.2 - p.m(0.03), cy + 1);
      }
      // row 2: the prompt
      ctx.textAlign = 'left';
      ctx.fillStyle = C('ink');
      ctx.font = font('bold', p.m(T1));
      const pw = p.m(W - 0.05 - (state.hint ? 0.3 : 0));
      wrap(ctx, state.prompt, pw).slice(0, 2).forEach((line, i) => ctx.fillText(line, p.m(0.025), p.m(0.112 + i * T1 * LH)));
      // row 3: feedback (a mark and a colored field, not color alone)
      if (state.fb) {
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
    head.position.set(0, H / 2 + 0.02 + HEAD_H / 2, 0);
    holder.add(head);
    menuBtn = new Button(0.24, 0.07, { label: t('menu'), labelSize: 'xr-text-sm', grow: false, onClick: () => onMenu?.() });
    menuBtn.position.set(W / 2 - 0.14, head.position.y + HEAD_H / 2 - 0.052, 0.006);
    holder.add(menuBtn);
    hintBtn = new Button(0.27, 0.07, { label: t('lineageHint'), labelSize: 'xr-text-sm', grow: false, variant: 'sponsor', onClick: () => onHint?.() });
    hintBtn.position.set(W / 2 - 0.155, head.position.y + HEAD_H / 2 - 0.135, 0.006);
    hintBtn.visible = state.hint;
    holder.add(hintBtn);
  }

  function buildBoard(labels) {
    if (boardPanel) { boardPanel.removeFromParent(); boardPanel.dispose(); }
    boardPanel = new Panel(W, H, (ctx, p) => {
      roundRect(ctx, 3, 3, p.canvas.width - 6, p.canvas.height - 6, p.m(0.03));
      ctx.fillStyle = C('board');
      ctx.fill();
      ctx.lineWidth = p.m(0.006);
      ctx.strokeStyle = C('board-edge');
      ctx.stroke();
      ctx.font = font('black', p.m(T1));
      ctx.fillStyle = C('muted');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      (labels ?? []).forEach((l) => ctx.fillText(l.text.toUpperCase(), p.m(W / 2 + l.x), p.m(0.04)));
    });
    boardPanel.renderOrder = -1;
    holder.add(boardPanel);
  }

  let cards = []; // { mesh, id | i, x, y, w, h }
  let model = null;
  let sel = null;
  let lineMeshes = [];
  let flows = []; // curves that carry light pulses
  let pills = [];
  let pillKey = '';
  let drag = null;
  let cardUi = [];
  const us = Array.from({ length: PULSES }, (_, i) => (i * 0.31) % 1);
  const m4 = new THREE.Matrix4();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const v3 = new THREE.Vector3();
  const qI = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);

  function clearContent() {
    for (const o of [...content.children]) { o.removeFromParent(); o.dispose?.(); }
    lineMeshes.forEach((o) => { o.removeFromParent(); o.geometry.dispose(); });
    lineMeshes = [];
    pills.forEach((o) => { o.removeFromParent(); o.dispose(); });
    pills = [];
    pillKey = '';
    flows = [];
    cards = [];
    dots.count = 0;
    pulses.count = 0;
    drag = null;
    rubber.visible = false;
  }

  function resize(w, h, labels) {
    const changed = Math.abs(w - W) > 1e-4 || Math.abs(h - H) > 1e-4 || !head;
    W = w; H = h;
    buildBoard(labels);
    if (changed) buildHead(); else head.redraw();
  }

  function place(mesh, x, y, extra) {
    mesh.position.set(x, y, 0.012);
    content.add(mesh);
    const c = { mesh, x, y, w: mesh.userData.w, h: mesh.userData.h, ...extra };
    cards.push(c);
    return c;
  }

  // ---- lines as 3D curves ----
  function buildLines() {
    lineMeshes.forEach((o) => { o.removeFromParent(); o.geometry.dispose(); });
    lineMeshes = [];
    flows = [];
    if (!model) return;
    const byId = new Map(cards.map((c) => [c.id, c]));
    const list = linesOf(model).filter((l) => byId.has(l.a) && byId.has(l.b));
    const side = new Map();
    for (const l of list) for (const [id, s] of [[l.a, 'out'], [l.b, 'in']]) { const k = `${id}:${s}`; if (!side.has(k)) side.set(k, []); side.get(k).push(l); }
    for (const [k, ls] of side) {
      const [id, s] = k.split(':');
      const c = byId.get(id);
      ls.sort((p, q) => byId.get(s === 'out' ? q.b : q.a).y - byId.get(s === 'out' ? p.b : p.a).y);
      ls.forEach((l, i) => {
        const f = (i + 1) / (ls.length + 1);
        const pt = new THREE.Vector3(c.x + (s === 'out' ? c.w / 2 : -c.w / 2), c.y + c.h / 2 - c.h * f, 0.018);
        if (s === 'out') l.p = pt; else l.q = pt;
      });
    }
    const geos = { fixed: [], done: [], pulse: [] };
    let nd = 0;
    const aiLines = [];
    for (const l of list) {
      const d = Math.max(0.04, (l.q.x - l.p.x) / 2);
      // The curve arches out of the board towards the player.
      const bulge = l.kind === 'ai' ? 0.05 : l.kind === 'fixed' ? 0.02 : 0.035;
      l.curve = new THREE.CubicBezierCurve3(l.p, new THREE.Vector3(l.p.x + d, l.p.y, l.p.z + bulge), new THREE.Vector3(l.q.x - d, l.q.y, l.q.z + bulge), l.q);
      if (l.kind === 'ai') {
        aiLines.push(l);
        const n = 13;
        for (let i = 1; i < n && nd < DOTS; i++) {
          l.curve.getPoint(i / n, v1);
          dots.setMatrixAt(nd++, m4.compose(v1, qI, v2.setScalar(TUBE * 1.15)));
        }
      } else {
        geos[l.kind].push(new THREE.TubeGeometry(l.curve, 18, TUBE * (l.kind === 'fixed' ? 0.8 : 1.25), 6, false));
        if (l.kind !== 'fixed') flows.push(l.curve);
      }
    }
    dots.count = nd;
    dots.instanceMatrix.needsUpdate = true;
    for (const kind of ['fixed', 'done', 'pulse']) {
      if (!geos[kind].length) continue;
      const merged = geos[kind].length > 1 ? mergeGeometries(geos[kind]) : geos[kind][0];
      if (geos[kind].length > 1) geos[kind].forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, mats[kind]);
      holder.add(mesh);
      lineMeshes.push(mesh);
    }
    pulses.count = calm ? 0 : Math.min(PULSES, flows.length * 3);
    // The assistant's tag on each proposal: one press accepts it.
    const key = aiLines.map((l) => `${l.a}>${l.b}`).join();
    if (key !== pillKey) {
      pillKey = key;
      pills.forEach((o) => { o.removeFromParent(); o.dispose(); });
      pills = aiLines.map((l) => {
        const need = model.needs.find((n) => !n.done && n.aiState === 'open' && ((n.asker === l.a && n.ai.id === l.b) || (n.asker === l.b && n.ai.id === l.a)));
        const text = `${t('lineageAi')} ${need.ai.conf} %`;
        const pill = new Panel(0.188, 0.066, (ctx, p) => {
          const hot = p.state.hover;
          roundRect(ctx, 3, 3, p.canvas.width - 6, p.canvas.height - 6, p.m(0.035));
          ctx.fillStyle = hot ? C('card') : C('ai-soft');
          ctx.fill();
          ctx.lineWidth = p.m(0.005);
          ctx.setLineDash([p.m(0.012), p.m(0.009)]);
          ctx.strokeStyle = C('ai');
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = C('ai');
          drawMark(ctx, 'ai', p.m(0.013), p.m(0.017), p.m(0.032));
          ctx.font = font('bold', p.m(T1));
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, p.m(0.05), p.canvas.height / 2 + 1);
        });
        l.curve.getPoint(0.5, pill.position);
        pill.position.z += 0.012;
        pill.userData.interactive = true;
        pill.userData.setHover = (v) => { pill.set({ hover: v }); pill.scale.setScalar(v ? 1.08 : 1); };
        pill.userData.setFocus = pill.userData.setHover;
        const name = model.nodes.find((x) => x.id === need.ai.id).title;
        pill.userData.label = t('lineageAiChipLabel', { conf: need.ai.conf, name });
        pill.userData.onClick = () => onAccept?.(need.id);
        holder.add(pill);
        return pill;
      });
    }
  }

  // ---- card looks ----
  const tileLook = (tl, st) => () => {
    const kind = st.kind;
    const blocks = [{ text: tl.title, size: tl.mono ? 0.046 : 0.042, mono: tl.mono, weight: 'bold', gap: 0.02 }];
    for (const p of tl.parts) blocks.push({ text: p.glyph ? p.text : `${p.label}  ${p.text}`, size: 0.039, gap: 0.012, color: p.key ? C('pulse') : C('muted'), weight: p.key ? 'bold' : 'regular', glyph: p.glyph ?? null });
    if (kind === 'right' || kind === 'answer') blocks.push({ text: t('lineageOdd'), size: T1, weight: 'bold', color: C('good'), icon: 'good' });
    if (kind === 'wrong') blocks.push({ text: t('lineageWrong'), size: T1, weight: 'bold', color: C('bad'), icon: 'bad' });
    return {
      blocks,
      fill: kind === 'right' ? C('good-soft') : kind === 'wrong' ? C('bad-soft') : C('card'),
      stroke: kind === 'right' || kind === 'answer' ? C('good-line') : kind === 'wrong' ? C('bad') : st.hover ? C('accent') : C('card-border'),
      dash: kind === 'answer', wide: !!kind || st.hover,
      opacity: kind === 'dim' || kind === 'rest' ? 0.45 : 1,
    };
  };

  const nodeBlocks = (n, v, forSize = false) => {
    const blocks = [{ text: n.title, size: n.mono ? T1 : T1, mono: n.mono, weight: 'bold', gap: 0.01 }];
    if (n.meta) blocks.push({ text: `${n.meta.ty} · ${n.meta.ex} · ${n.meta.ow}`, size: T1, color: C('muted'), glyph: n.meta.glyph });
    else if (n.text) blocks.push({ text: n.text, size: T1, color: C('muted') });
    if (v.need.length) blocks.push({ text: t('lineageNeeds', { need: v.need.join(' + ') }), size: T1, weight: 'bold', color: C('accent') });
    if (v.mark === 'hit') blocks.push({ text: t('lineageAffected'), size: T1, weight: 'bold', color: C('pulse'), icon: 'good' });
    else if (v.mark === 'miss') blocks.push({ text: t('lineageNotAffected'), size: T1, weight: 'bold', color: C('bad'), icon: 'bad' });
    else if (v.missed) blocks.push({ text: t('lineageAiMissed'), size: T1, weight: 'bold', color: C('bad'), icon: 'bad' });
    else if (v.done && !v.need.length) blocks.push({ text: t('lineageDone'), size: T1, weight: 'bold', color: C('good'), icon: 'good' });
    // Room for the line that comes later ("connected", "not affected"), so a card never grows.
    else if (forSize && (n.col === 3 || n.kind === 'desc' || n.kind === 'field')) blocks.push({ text: t(n.col === 3 ? 'lineageNotAffected' : 'lineageDone'), size: T1, weight: 'bold', icon: 'bad' });
    return blocks;
  };

  const nodeLook = (c) => () => {
    const v = c.v;
    const pick = !!model?.impact?.active && v.selectable; // a report that can be picked
    return {
      blocks: nodeBlocks(c.node, v),
      fill: v.selected ? C('accent-soft') : v.changed || v.mark === 'hit' ? C('pulse-soft') : v.done ? C('good-soft') : v.selectable ? C('card') : C('card-soft'),
      stroke: v.selected ? C('accent') : v.changed || v.mark === 'hit' || pick ? C('pulse-line') : v.mark === 'miss' ? C('bad') : v.done ? C('good-line') : v.need.length || c.mesh?.userData.hover ? C('accent') : C('card-border'),
      dash: (v.need.length > 0 || pick) && !v.selected,
      wide: v.selected || v.changed || !!v.mark || pick || c.mesh?.userData.hover,
      badge: v.changed ? 'change' : null,
      opacity: 1,
    };
  };

  /** A wrong link: a red curve that wobbles and fades, and the card it was drawn to shakes. */
  function shake(a, b) {
    const ca = cards.find((c) => c.id === a);
    const cb = cards.find((c) => c.id === b);
    if (!ca || !cb) return;
    const [lo, hi] = ca.x < cb.x ? [ca, cb] : [cb, ca];
    const p = new THREE.Vector3(lo.x + lo.w / 2, lo.y, 0.02);
    const q = new THREE.Vector3(hi.x - hi.w / 2, hi.y, 0.02);
    const d = (q.x - p.x) / 2;
    const curve = new THREE.CubicBezierCurve3(p, new THREE.Vector3(p.x + d, p.y, 0.06), new THREE.Vector3(q.x - d, q.y, 0.06), q);
    const mat = mats.bad.clone();
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 18, TUBE * 1.3, 6, false), mat);
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

  const api = {
    holder,

    show(on) {
      holder.visible = on;
      if (!on) { clearContent(); cardUi.forEach((o) => { o.removeFromParent(); o.dispose?.(); }); cardUi = []; }
    },

    setHud(h) { state.hud = h; head?.redraw(); },
    setPrompt(text) { if (state.prompt !== text) { state.prompt = text; head?.redraw(); } },
    setFeedback(kind, text) { state.fb = kind; state.fbText = text ?? ''; head?.redraw(); },
    setSpeed() { /* the bonus counts; the headset shows no clock */ },
    setHint(s) {
      state.hint = s === 'ready';
      if (hintBtn) hintBtn.visible = state.hint;
    },

    // ---- stage 1 ----
    showOdd({ tiles }) {
      clearContent();
      model = null;
      const w0 = num('xr-lineage-xr-width');
      const gap = 0.03;
      const tw = (w0 - 0.08 - gap * (tiles.length - 1)) / tiles.length;
      const looks = tiles.map((tl) => {
        const st = { kind: null, hover: false };
        return { tl, st, look: tileLook(tl, st) };
      });
      const sizeBlocks = (tl) => [...tileLook(tl, { kind: 'right' })().blocks];
      const th = Math.max(0.3, ...tiles.map((tl) => measure(sizeBlocks(tl), tw)));
      resize(w0, Math.max(num('xr-lineage-xr-height') * 0.62, th + 0.12), null);
      looks.forEach((it, i) => {
        const mesh = makeCard(tw, th, it.look);
        const c = place(mesh, -w0 / 2 + 0.04 + tw / 2 + i * (tw + gap), 0, { i, st: it.st });
        mesh.userData.interactive = true;
        mesh.userData.label = `${it.tl.title}. ${it.tl.parts.map((p) => `${p.label} ${p.text}`).join('. ')}`;
        mesh.userData.setHover = (v) => { mesh.userData.hover = v; it.st.hover = v; mesh.redraw(); };
        mesh.userData.setFocus = mesh.userData.setHover;
        mesh.userData.onClick = () => onPickOdd?.(i);
        scene.popIn(mesh, i * 0.05);
        return c;
      });
    },

    markOdd(i, kind) {
      const c = cards[i];
      if (!c) return;
      c.st.kind = kind;
      if (kind === 'dim') c.mesh.userData.interactive = false;
      c.mesh.redraw();
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
      const graph = b.kind === 'graph';
      const w0 = num(graph ? 'xr-lineage-xr-width-graph' : 'xr-lineage-xr-width');
      const lineGap = graph ? 0.19 : 0.26;
      const n = b.cols.length;
      const cw = (w0 - 0.08 - lineGap * (n - 1)) / n;
      const cols = b.cols.map((label, ci) => {
        const x = -w0 / 2 + 0.04 + cw / 2 + ci * (cw + lineGap);
        const list = b.nodes.filter((nd) => nd.col === ci).map((nd) => ({ node: nd, h: measure(nodeBlocks(nd, nodeView(b, nd, null), true), cw) + 0.004 }));
        return { x, label, list, total: list.reduce((s, it) => s + it.h, 0) + (list.length - 1) * 0.022 };
      });
      const top = 0.075; // room for the column labels
      const h0 = Math.max(num('xr-lineage-xr-height'), Math.max(...cols.map((c) => c.total)) + top + 0.05);
      resize(w0, h0, cols.map((c) => ({ text: c.label, x: c.x })));
      cols.forEach((col) => {
        let y = (h0 - top - 0.03 - col.total) / 2 * -1 + h0 / 2 - top; // centered in the room below the labels
        col.list.forEach((it) => {
          const c = { node: it.node, v: nodeView(b, it.node, null), mesh: null };
          const mesh = makeCard(cw, it.h, nodeLook(c));
          c.mesh = mesh;
          Object.assign(c, place(mesh, col.x, y - it.h / 2, { id: it.node.id, node: it.node, v: c.v }));
          cards[cards.length - 1] = c;
          y -= it.h + 0.022;
          mesh.userData.nodeId = it.node.id;
          mesh.userData.label = it.node.title;
          mesh.userData.setHover = (v) => { if (mesh.userData.hover !== v) { mesh.userData.hover = v; mesh.redraw(); } };
          mesh.userData.setFocus = mesh.userData.setHover;
          // Press and release on the same card selects it; released on another card it links them.
          mesh.userData.onGrab = (p) => { drag = { id: it.node.id, p, card: c }; };
          mesh.userData.onRelease = (p, over) => {
            drag = null;
            rubber.visible = false;
            const other = over?.userData.nodeId;
            if (other && other !== it.node.id) onLink?.(it.node.id, other); else onNode?.(it.node.id);
          };
        });
      });
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
      }
      buildLines();
    },

    shake,

    pop(text, target) {
      const c = target?.tile != null ? cards[target.tile] : cards.find((x) => x.id === target?.node);
      if (!c) return;
      const p = new Panel(0.26, 0.085, (ctx, pp) => {
        roundRect(ctx, 2, 2, pp.canvas.width - 4, pp.canvas.height - 4, pp.m(0.04));
        ctx.fillStyle = C('good');
        ctx.fill();
        ctx.fillStyle = C('card');
        ctx.font = font('black', pp.m(0.05));
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, pp.canvas.width / 2, pp.canvas.height / 2 + 2);
      });
      p.position.set(c.x, c.y + c.h / 2, 0.07);
      holder.add(p);
      scene.tween(1.1, (k) => {
        if (!calm) { p.position.y = c.y + c.h / 2 + k * 0.1; p.scale.setScalar(k < 0.15 ? 0.6 + (k / 0.15) * 0.5 : 1.1 - Math.min(0.1, (k - 0.15) * 0.5)); }
        p.material.opacity = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      }, { ease: (k) => k, onDone: () => { p.removeFromParent(); p.dispose(); } });
    },

    showCard(card) {
      cardUi.forEach((o) => { o.removeFromParent(); o.dispose?.(); });
      cardUi = [];
      content.visible = !card;
      lineMeshes.forEach((o) => { o.visible = !card; });
      pills.forEach((o) => { o.visible = !card; });
      dots.visible = !card;
      pulses.visible = !card;
      if (!card) return;
      clearContent();
      const panel = textPanel(1.0, 0.3, [
        { text: card.title, size: 'xr-text-lg', weight: 'black', color: C('ink'), gap: 0.03 },
        { text: card.lines[0], size: 'xr-text-sm', color: C('ink'), gap: 0.022 },
        { text: card.lines[1], size: 'xr-text-sm', weight: 'bold', color: C('ai') },
      ], { surface: { fill: C('card'), stroke: C('board-edge'), stripe: false } });
      panel.position.set(0, 0.06, 0.05);
      const go = new Button(0.4, 0.11, { label: card.button, variant: 'primary', onClick: () => onNext?.() });
      go.position.set(0, panel.position.y - panel.h / 2 - 0.03 - go.h / 2, 0.05);
      holder.add(panel, go);
      cardUi = [panel, go];
    },

    focusFirst() {}, focusNode() {}, moveFocus() {},

    tick(dt) {
      if (!holder.visible) return;
      // cards come forward when pointed at or selected
      for (const c of cards) {
        const want = c.mesh.userData.hover || (c.id && c.id === sel) ? 1 : 0;
        const u = c.mesh.userData;
        if (Math.abs(want - u.lift) > 0.002) {
          u.lift += (want - u.lift) * Math.min(1, dt * (calm ? 30 : 12));
          c.mesh.position.z = 0.012 + u.lift * LIFT;
        }
      }
      // light travels along the player's links
      if (pulses.count) {
        for (let i = 0; i < pulses.count; i++) {
          const curve = flows[Math.floor(i / 3)];
          us[i] = (us[i] + dt * 0.45) % 1;
          curve.getPoint(us[i], v1);
          pulses.setMatrixAt(i, m4.compose(v1, qI, v2.setScalar(TUBE * 2.1)));
        }
        pulses.instanceMatrix.needsUpdate = true;
      }
      // a line follows the ray while a card is held
      if (drag) {
        const ray = drag.p.ray;
        holder.worldToLocal(v1.copy(ray.origin));
        holder.worldToLocal(v2.copy(ray.origin).add(ray.direction));
        v2.sub(v1);
        const k = Math.abs(v2.z) > 1e-5 ? (0.03 - v1.z) / v2.z : -1;
        if (k > 0) {
          v1.addScaledVector(v2, k); // where the ray meets the board
          const c = drag.card;
          v3.set(c.x + (v1.x > c.x ? c.w / 2 : -c.w / 2), c.y, 0.03);
          v2.copy(v1).sub(v3);
          const len = v2.length();
          if (len > 0.03) {
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
      [head, menuBtn, hintBtn, boardPanel].forEach((o) => { if (o) { o.removeFromParent(); o.dispose(); } });
      Object.values(mats).forEach((m) => m.dispose());
      dotGeo.dispose();
      rubber.geometry.dispose();
      holder.removeFromParent();
    },
  };
  return api;
}
