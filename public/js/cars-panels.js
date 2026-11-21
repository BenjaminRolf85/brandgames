// "Autohof" in the headset (AR and VR): the same panels as on the screen (cars-screen.js), as 3D
// cards around the lot on the table. Left: the AI forecast. Right: the three decisions as big
// buttons (point and press). Above the far side of the lot: what is going on (the coach's line,
// visitors against cars, the running week, the week's summary, a news flash, a car's numbers).
// Everything is drawn with the shared 3D panels (ui3d.js) and the design tokens; text never
// goes below the smallest text token.
import * as THREE from 'three';
import { Panel, Button, textPanel, placeOnArc, roundRect } from './ui3d.js';
import { color, num, font } from './tokens.js';
import { t } from './i18n.js';
import { sfx } from './sfx.js';
import { drawSegIcon } from './cars-visuals.js';

const SM = 'xr-text-sm';
const MD = 'xr-text-md';

/** A clickable card with its own drawing (an offer with the car's icon). */
class Card extends Panel {
  constructor(w, h, opts) {
    super(w, h, (ctx, p) => p.paint());
    this.opts = opts;
    this.userData.interactive = true;
    this.userData.label = opts.label;
    this.userData.setHover = (v) => this.set({ hover: v });
    this.userData.setFocus = (v) => this.set({ focus: v });
    this.userData.onClick = (pointer) => {
      if (this.opts.disabled) return;
      sfx.click();
      this.opts.onClick?.(pointer, this);
    };
    this.redraw();
  }

  paint() {
    if (!this.opts) return;
    const { hover, focus } = this.state;
    const o = this.opts;
    const active = hover && !o.disabled;
    this.surface({
      fill: color(active ? 'xr-button-hover' : 'xr-button-bg'),
      stroke: color(focus ? 'xr-focus' : o.edge ?? 'xr-panel-border'),
      strokeWidth: num('xr-border-width') * (focus ? 3 : active || o.edge ? 2 : 1), stripe: false,
    });
    o.draw(this.ctx, this, active);
    this.material.opacity = o.disabled ? 0.72 : 1;
  }
}

/** Small drawn marks (no color alone): 'yes', 'no', 'up', 'flat', 'down'. */
function drawMark(ctx, kind, x, y, s, col) {
  ctx.save();
  ctx.strokeStyle = col;
  ctx.lineWidth = s * 0.16;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  const P = (px, py) => [x + px * s, y + py * s];
  const path = {
    yes: [[0.1, 0.55], [0.4, 0.85], [0.9, 0.2]],
    up: [[0.1, 0.8], [0.9, 0.2], [0.5, 0.2], [0.9, 0.2], [0.9, 0.6]],
    flat: [[0.1, 0.5], [0.9, 0.5], [0.65, 0.25], [0.9, 0.5], [0.65, 0.75]],
    down: [[0.1, 0.2], [0.9, 0.8], [0.5, 0.8], [0.9, 0.8], [0.9, 0.4]],
  }[kind];
  if (kind === 'no') {
    ctx.moveTo(...P(0.15, 0.15)); ctx.lineTo(...P(0.85, 0.85)); ctx.moveTo(...P(0.85, 0.15)); ctx.lineTo(...P(0.15, 0.85));
  } else path.forEach((q, i) => (i ? ctx.lineTo(...P(...q)) : ctx.moveTo(...P(...q))));
  ctx.stroke();
  ctx.restore();
}

function fit(ctx, text, weight, px, maxW, minPx) {
  let s = px;
  ctx.font = font(weight, s);
  while (ctx.measureText(text).width > maxW && s > minPx) { s -= 1; ctx.font = font(weight, s); }
  return s;
}

export class CarsBoard {
  /** cb: the same callbacks as the screen (onBuy, onHaggle, onStance, onAd, onTarget, onNext, onBack). */
  constructor(scene, cb) {
    this.scene = scene;
    this.cb = cb;
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.group.add(this.group);
    this.col = new THREE.Group(); // the decisions, on the right
    placeOnArc(this.col, 0.66, scene.eye, 1.08);
    this.group.add(this.col);
    this.keys = {};
    this.shape = 'xr';
  }

  show(on) { this.group.visible = on; }

  layout() { return false; }

  setStatus() { /* the headset shows the status in the bar at the top (BaseScene.hud) */ }

  drop(o) {
    if (!o) return;
    o.removeFromParent();
    o.traverse((x) => x.dispose?.());
  }

  // ---------- left: the AI forecast ----------

  setForecast(v) {
    const key = JSON.stringify(v);
    if (key === this.keys.fc) return;
    this.keys.fc = key;
    this.drop(this.fc);
    const w = 0.66;
    const sm = num(SM);
    const rowH = 0.074;
    const h = 0.13 + v.rows.length * rowH + 0.15;
    const p = new Panel(w, h, (ctx, pn) => {
      pn.surface();
      const m = (x) => pn.m(x);
      const pad = 0.035;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillStyle = color('xr-panel-text');
      ctx.font = font('black', m(num(MD)));
      ctx.fillText(v.title, m(pad), m(0.058));
      ctx.fillStyle = color('xr-panel-muted');
      ctx.font = font('regular', m(sm));
      ctx.fillText(v.check ? v.note : t('carsFcSureShort'), m(pad), m(0.105));
      v.rows.forEach((r, i) => {
        const y = 0.13 + i * rowH + rowH / 2;
        const seg = color(`xr-cars-seg-${r.seg}`);
        drawSegIcon(ctx, r.seg, m(pad), m(y - 0.02), m(0.072), seg, color('xr-panel-bg'));
        ctx.fillStyle = color('xr-panel-text');
        ctx.font = font('bold', m(sm));
        ctx.textAlign = 'left';
        ctx.fillText(t(`carsShort_${r.seg}`), m(pad + 0.085), m(y));
        // the range as a band on a scale, the real number as a ring
        const x0 = 0.26;
        const tw = 0.17;
        ctx.fillStyle = color('xr-cars-track');
        roundRect(ctx, m(x0), m(y - 0.011), m(tw), m(0.022), m(0.011));
        ctx.fill();
        ctx.fillStyle = seg;
        roundRect(ctx, m(x0 + (r.lo / r.max) * tw), m(y - 0.011), m((Math.max(0.5, r.hi - r.lo) / r.max) * tw), m(0.022), m(0.011));
        ctx.fill();
        if (v.check) {
          ctx.beginPath();
          ctx.arc(m(x0 + (Math.min(r.max, r.actual) / r.max) * tw), m(y), m(0.013), 0, Math.PI * 2);
          ctx.fillStyle = color('xr-on-primary');
          ctx.fill();
          ctx.lineWidth = m(0.005);
          ctx.strokeStyle = color('xr-bg-preview');
          ctx.stroke();
        }
        ctx.fillStyle = color('xr-panel-text');
        ctx.font = font('bold', m(sm));
        ctx.fillText(v.check ? `${r.lo}–${r.hi} → ${r.actual}` : t('carsFcRangeShort', r), m(0.45), m(y));
        const mk = v.check ? (r.hit ? 'yes' : 'no') : r.trend;
        const mc = color(mk === 'yes' || mk === 'up' ? 'xr-success' : mk === 'no' || mk === 'down' ? 'xr-danger' : 'xr-panel-muted');
        drawMark(ctx, mk, m(w - pad - 0.036), m(y - 0.018), m(0.036), mc);
      });
      pn.blocks([
        { text: `${v.whyLabel}: ${v.reason}`, size: SM, weight: 'bold', color: color('xr-accent') },
      ], { x: 0, y: 0.13 + v.rows.length * rowH - 0.01, w, h: 0.16, pad, align: 'left', valign: 'top' });
    });
    placeOnArc(p, -0.66, this.scene.eye + 0.02, 1.08);
    this.group.add(p);
    this.fc = p;
  }

  // ---------- center: what is going on ----------

  setNews(text, kind = 'news', label = '') {
    this.news = text ? { text, kind, label } : null;
    this.drawInfo();
  }

  setInfo(v) {
    this.car = v;
    this.drawInfo();
  }

  drawInfo() {
    const blocks = [];
    const muted = color('xr-panel-muted');
    const view = this.view;
    let edge = null;
    if (this.news) {
      edge = color(this.news.kind === 'reward' ? 'xr-success' : 'xr-warning');
      if (this.news.label) blocks.push({ text: this.news.label.toUpperCase(), size: SM, weight: 'black', color: color('xr-warning'), gap: 0.012 });
      blocks.push({ text: this.news.text, size: MD, weight: 'bold', gap: 0.03 });
    }
    if (this.car) {
      blocks.push({ text: `${t(`carsSeg_${this.car.seg}`)} · ${t(`carsCond_${this.car.cond}`)}`, size: MD, weight: 'bold', color: color(`xr-cars-seg-${this.car.seg}`), gap: 0.012 });
      this.car.lines.forEach((l, i) => blocks.push({ text: l, size: SM, gap: i === this.car.lines.length - 1 ? 0.03 : 0.008 }));
    } else if (view) {
      if (view.step === 'sum') {
        blocks.push({ text: `${view.title}: ${view.net}`, size: 'xr-text-lg', weight: 'black', color: color(view.netGood ? 'xr-success' : 'xr-danger'), gap: 0.02 });
        for (const r of view.rows) blocks.push({ text: `${r.label}${r.value ? `: ${r.value}` : ''}${r.sub ? ` (${r.sub})` : ''}`, size: SM, weight: 'bold', gap: 0.01 });
        for (const n of view.notes) blocks.push({ text: n.text, size: SM, color: color(n.kind === 'good' ? 'xr-success' : n.kind === 'warn' ? 'xr-warning' : 'xr-accent'), gap: 0.012 });
      } else if (view.step === 'run') {
        blocks.push({ text: view.title, size: MD, weight: 'black', gap: 0.016 });
        blocks.push({ text: `${t('carsRunVisitors')} ${view.visitors} · ${t('carsRunSold')} ${view.sold} · ${view.gain}`, size: MD, weight: 'bold', color: color('xr-success'), gap: 0.016 });
        for (const l of view.log.slice(-4)) blocks.push({ text: l.text, size: SM, color: l.kind === 'buy' ? color('xr-panel-text') : muted, gap: 0.008 });
      } else {
        if (view.coach) blocks.push({ text: view.coach, size: SM, weight: 'bold', color: color('xr-warning'), gap: 0.016 });
        if (view.step === 'buy') blocks.push({ text: view.head, size: SM, color: muted });
        if (view.step === 'price' && view.standAll) blocks.push({ text: view.standAll, size: SM, color: muted });
        if (view.step === 'ads') {
          blocks.push({ text: view.matchHead, size: MD, weight: 'bold', gap: 0.014 });
          blocks.push({ text: view.match.map((r) => `${t(`carsShort_${r.seg}`)} ${r.visitors} : ${r.cars}`).join('   '), size: SM, weight: 'bold', gap: 0.014 });
          for (const l of view.matchLines) blocks.push({ text: l.text, size: SM, color: color(l.kind === 'warn' ? 'xr-warning' : l.kind === 'good' ? 'xr-success' : 'xr-accent'), gap: 0.01 });
        }
      }
    }
    const key = JSON.stringify(blocks) + edge;
    if (key === this.keys.info) return;
    this.keys.info = key;
    this.drop(this.info);
    this.info = null;
    if (!blocks.length) return;
    const p = textPanel(0.72, 0.12, blocks, { layout: { align: 'left' }, surface: edge ? { stroke: edge, strokeWidth: num('xr-border-width') * 2 } : undefined });
    p.position.set(0, this.scene.eye - 0.2 + p.h / 2, -1.36);
    this.group.add(p);
    this.info = p;
  }

  // ---------- right: the decisions ----------

  setPanel(view) {
    this.view = view;
    this.drawInfo();
    const key = JSON.stringify(view);
    if (key === this.keys.panel) return;
    this.keys.panel = key;
    // Remember which button was under the pointer, so the redraw does not flicker.
    for (const o of [...this.col.children]) this.drop(o);
    const W = 0.86;
    let y = 0.44;
    const put = (o, x = 0) => { o.position.set(x, y - o.h / 2, 0); this.col.add(o); return o; };
    const down = (o, gap = 0.014) => { y -= o.h + gap; };
    // The three steps: done, now, to come.
    if (view.step === 'buy' || view.step === 'price' || view.step === 'ads') {
      const order = ['buy', 'price', 'ads'];
      const at = order.indexOf(view.step);
      const head = new Panel(W, 0.085, (ctx, p) => {
        p.surface();
        order.forEach((name, i) => {
          const x = p.m(0.012 + i * ((W - 0.024) / 3));
          const w = p.m((W - 0.024) / 3 - 0.008);
          if (i === at) { ctx.fillStyle = color('xr-primary'); roundRect(ctx, x, p.m(0.012), w, p.m(0.061), p.m(0.014)); ctx.fill(); }
          ctx.fillStyle = color(i === at ? 'xr-on-primary' : i < at ? 'xr-panel-text' : 'xr-panel-muted');
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = font('bold', p.m(num(SM)));
          ctx.fillText(`${i + 1} ${t(`carsStep_${name}`)}`, x + w / 2, p.m(0.044));
        });
      });
      down(put(head));
    }
    if (view.step === 'buy') this.buyColumn(view, W, put, down);
    else if (view.step === 'price') {
      for (const s of view.stances) {
        const b = new Button(W, 0.15, {
          label: `${t(`carsStance_${s.key}`)} · ${t(`carsStanceP_${s.key}`)}${s.tip ? ` · ${t('carsTip')}` : ''}`, body: t(`carsStanceS_${s.key}`),
          labelSize: MD, onClick: () => this.cb.onStance?.(s.key),
        });
        if (s.on) b.set({ status: 'selected' });
        down(put(b));
      }
    } else if (view.step === 'ads') {
      view.ads.forEach((a, i) => {
        const b = new Button(W, 0.105, { label: `${t(`carsAd_${i}`)} · ${a.cost}${a.tip ? ` · ${t('carsTip')}` : ''}`, body: a.extra, labelSize: MD, onClick: () => this.cb.onAd?.(i) });
        if (a.on) b.set({ status: 'selected' });
        down(put(b));
      });
      if (view.targets.length > 1) {
        const n = view.targets.length;
        const bw = (W - 0.012 * (n - 1)) / n;
        let h = 0;
        view.targets.forEach((g, i) => {
          const b = new Button(bw, 0.085, { label: g.seg ? t(`carsShort_${g.seg}`) : t('carsTargetAll'), labelSize: SM, onClick: () => this.cb.onTarget?.(g.seg) });
          if (g.on) b.set({ status: 'selected' });
          if (view.adOff) b.set({ disabled: true });
          put(b, -W / 2 + bw / 2 + i * (bw + 0.012));
          h = Math.max(h, b.h);
        });
        y -= h + 0.014;
      }
    }
    // Back and the main button.
    const backW = 0.24;
    let nextW = W;
    if (view.back) {
      const back = new Button(backW, 0.11, { label: t('carsBack'), labelSize: SM, onClick: () => this.cb.onBack?.() });
      put(back, -W / 2 + backW / 2);
      nextW = W - backW - 0.014;
    }
    const go = new Button(nextW, 0.11, { label: view.next, variant: 'primary', labelSize: MD, onClick: () => this.cb.onNext?.() });
    put(go, W / 2 - nextW / 2);
    this.next = go;
    // The whole column is centered at about eye height.
    const total = 0.44 - (y - go.h);
    for (const o of this.col.children) o.position.y += total / 2 - 0.44 + 0.02;
  }

  buyColumn(view, W, put, down) {
    const hw = 0.23;
    const cw = W - hw - 0.012;
    view.offers.forEach((o) => {
      const done = o.state !== 'open';
      const card = new Card(cw, 0.13, {
        label: `${t('carsBuy')}: ${t(`carsSeg_${o.seg}`)}, ${t(`carsCond_${o.cond}`)}, ${o.ask}`,
        disabled: done || !!o.blocked,
        edge: o.state === 'bought' ? 'xr-success' : o.tip ? 'xr-warning' : null,
        onClick: () => this.cb.onBuy?.(o.id),
        draw: (ctx, p) => {
          const m = (x) => p.m(x);
          const sm = m(num(SM));
          drawSegIcon(ctx, o.seg, m(0.016), m(0.014), m(0.1), color(`xr-cars-seg-${o.seg}`), color('xr-button-bg'));
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = color('xr-panel-text');
          const x = m(0.13);
          const maxW = m(cw - 0.14);
          const l1 = `${t(`carsShort_${o.seg}`)} · ${t(`carsCond_${o.cond}`)}`;
          ctx.font = font('bold', fit(ctx, l1, 'bold', sm, maxW, sm * 0.94));
          ctx.fillText(l1, x, m(0.036));
          const l2 = done ? t(o.state === 'bought' ? 'carsBought' : 'carsHaggleLost') : o.blocked ? `${o.ask} · ${o.blockedText}` : `${o.ask} · ${t('carsBrings', { price: o.list })}`;
          ctx.fillStyle = color(o.state === 'bought' ? 'xr-success' : o.state === 'gone' ? 'xr-danger' : o.blocked ? 'xr-warning' : 'xr-panel-text');
          ctx.font = font('bold', fit(ctx, l2, 'bold', sm, m(cw - 0.03), sm * 0.94));
          ctx.fillText(l2, m(0.016), m(0.092));
          // how fast it sells, as an arrow and a word
          if (!done) {
            const sp = t(`carsSpeedShort_${o.speed}`);
            ctx.font = font('bold', sm);
            const tw = ctx.measureText(sp).width;
            ctx.fillStyle = color(o.speed === 'fast' ? 'xr-success' : o.speed === 'slow' ? 'xr-danger' : 'xr-panel-muted');
            const right = m(cw - 0.014);
            const kind = o.speed === 'fast' ? 'up' : o.speed === 'slow' ? 'down' : 'flat';
            ctx.font = font('bold', fit(ctx, l1, 'bold', sm, maxW, sm * 0.94));
            const used = x + ctx.measureText(l1).width;
            ctx.font = font('bold', sm);
            if (used + tw + m(0.06) < right) {
              ctx.fillText(sp, right - tw, m(0.036));
              drawMark(ctx, kind, right - tw - m(0.042), m(0.02), m(0.032), ctx.fillStyle);
            } else if (used + m(0.045) < right) drawMark(ctx, kind, right - m(0.036), m(0.02), m(0.032), ctx.fillStyle);
          }
        },
      });
      put(card, -W / 2 + cw / 2);
      const hb = new Button(hw, 0.13, {
        label: done ? '' : t('carsHaggle'), body: done ? '' : o.haggled ? t('carsHaggled') : `${o.chance} %`, labelSize: SM, grow: false,
        onClick: () => this.cb.onHaggle?.(o.id),
      });
      if (done || o.haggled) hb.set({ disabled: true });
      hb.visible = !done;
      put(hb, W / 2 - hw / 2);
      down(card, 0.012);
    });
  }

  // The screen's keyboard helpers have no meaning here.
  options() { return []; }

  press() { return false; }

  focusMove() { return null; }

  haggleTarget() { return null; }

  ownsEnter() { return false; }

  lotRect() { return null; }

  remove() {
    this.drop(this.group);
  }
}
