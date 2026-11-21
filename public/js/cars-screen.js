// "Autohof" in the browser (desktop and phones; not in the headset): the three decisions, the AI
// forecast and the week's summary as screen elements, so every number is comfortable to read
// and works with the mouse, the keyboard, a finger and a screen reader. The 3D lot shows in the
// part of the screen these panels leave free (lotRect()):
//   desktop            status, forecast and decisions in a column on the left, the lot beside it
//   phone, upright     status, the lot, the forecast, the decisions (top to bottom)
//   phone, sideways    status and decisions on the left, the lot with the forecast on the right
// Styles: css/game-cars.css.
import { t } from './i18n.js';
import { segSVG } from './cars-visuals.js';

const stage = () => document.getElementById('stage');
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const svg = (d, cls = 'cars-mark') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${d}"/></svg>`;
// Marks that work without color: check, cross, arrows, a clock, a warning triangle, a light bulb.
export const MARK = {
  yes: 'M5 12.5l4.5 4.5L19 7.5',
  no: 'M6 6l12 12M18 6L6 18',
  up: 'M5 16l6-7 4 4 5-6M15 7h5v5',
  flat: 'M4 12h16M15 7l5 5-5 5',
  down: 'M5 8l6 7 4-4 5 6M15 17h5v-5',
  clock: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 7v5l3.5 2',
  warn: 'M12 4L2.5 20h19zM12 10v5M12 17.6v.4',
  tip: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z',
};
const mark = (name, cls) => svg(MARK[name], cls);

/**
 * The screen. cb: onMenu, onBuy(id), onHaggle(id), onStance(s), onAd(level), onTarget(seg | null),
 * onNext(), onBack(), onStep(name), onSkip(), onCarOver(id | null), onCarPick(id), onCloseInfo().
 */
export function carsScreen(cb, { calm = false } = {}) {
  const root = el('div', `cars-ui${calm ? ' is-calm' : ''}`);
  root.hidden = true;

  // ---- status bar: menu button and one line ----
  const bar = el('div', 'cars-bar');
  const menu = el('button', 'cars-bar__menu', t('menu'));
  menu.type = 'button';
  menu.addEventListener('click', () => cb.onMenu?.());
  const status = el('p', 'cars-bar__text');
  status.setAttribute('role', 'status');
  bar.append(menu, status);

  // ---- the free part of the screen: the lot shows here; a news line and a car's numbers ----
  const lot = el('div', 'cars-lot');
  const news = el('p', 'cars-news');
  news.setAttribute('role', 'alert');
  news.hidden = true;
  const info = el('div', 'cars-info');
  info.hidden = true;
  lot.append(news, info);

  // ---- the AI forecast ----
  const fc = el('section', 'cars-fc');
  fc.setAttribute('aria-live', 'polite');

  // ---- the decisions ----
  const panel = el('section', 'cars-panel');

  root.append(bar, lot, fc, panel);
  stage()?.append(root);

  let shape = '';
  const layout = () => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const next = W < H ? 'port' : H <= 500 ? 'land' : 'desk';
    if (next === shape) return false;
    shape = next;
    root.classList.remove('cars-ui--port', 'cars-ui--land', 'cars-ui--desk');
    root.classList.add(`cars-ui--${shape}`);
    return true;
  };
  layout();

  const btn = (cls, label, onPress) => {
    const b = el('button', `cars-btn ${cls}`);
    b.type = 'button';
    if (label != null) b.textContent = label;
    b.addEventListener('click', () => { if (!b.disabled) onPress(); });
    return b;
  };
  const kbd = (n) => { const k = el('kbd', 'cars-kbd', String(n)); k.setAttribute('aria-hidden', 'true'); return k; };
  const withHTML = (e, html) => { e.innerHTML = html; return e; };
  const seg = (s, short) => {
    const e = el('span', `cars-seg cars-seg--${s}`);
    e.innerHTML = segSVG(s);
    e.append(el('span', 'cars-seg__name', t(`${short ? 'carsShort_' : 'carsSeg_'}${s}`)));
    return e;
  };
  const cond = (c) => {
    const e = el('span', `cars-cond cars-cond--${c}`);
    const n = { top: 3, ok: 2, rough: 1 }[c];
    const pips = el('span', 'cars-cond__pips');
    pips.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 3; i++) pips.append(el('span', i < n ? 'is-on' : ''));
    e.append(pips, el('span', 'cars-cond__name', t(`carsCond_${c}`)));
    return e;
  };

  // The three steps as a row of tabs (done, now, to come); a click goes there.
  const stepper = (view) => {
    const ol = el('ol', 'cars-steps');
    const order = ['buy', 'price', 'ads'];
    const at = order.indexOf(view.step);
    order.forEach((name, i) => {
      const li = el('li', `cars-steps__item${i === at ? ' is-now' : i < at ? ' is-done' : ''}`);
      // Desktop: a click goes to that step. Phones: a progress line only (the big buttons below
      // go on and back; these tabs would be too small for a finger).
      const b = el(shape === 'desk' ? 'button' : 'span', 'cars-steps__btn');
      if (shape === 'desk') { b.type = 'button'; b.addEventListener('click', () => cb.onStep?.(name)); }
      b.innerHTML = `<span class="cars-steps__num">${i < at ? mark('yes', 'cars-mark cars-mark--sm') : i + 1}</span>`;
      b.append(el('span', 'cars-steps__name', t(`carsStep_${name}`)));
      if (i === at) b.setAttribute('aria-current', 'step');
      li.append(b);
      ol.append(li);
    });
    return ol;
  };

  const note = (text, kind = 'coach') => {
    const p = el('p', `cars-note cars-note--${kind}`);
    p.innerHTML = mark(kind === 'warn' ? 'warn' : 'tip', 'cars-mark cars-mark--sm');
    p.append(el('span', '', text));
    return p;
  };

  const footer = (view) => {
    const f = el('div', 'cars-foot');
    if (view.back) {
      const b = btn('cars-btn--ghost cars-foot__back', t('carsBack'), () => cb.onBack?.());
      b.dataset.role = 'back';
      f.append(b);
    }
    const go = btn('cars-btn--primary cars-foot__go', null, () => cb.onNext?.());
    go.dataset.role = 'next';
    go.append(el('span', '', view.next), withHTML(el('span', 'cars-foot__key'), 'Enter'));
    f.append(go);
    return f;
  };

  // ---------- step 1: buying ----------
  const buyBody = (view) => {
    const frag = [];
    frag.push(el('p', 'cars-head', view.head));
    const ul = el('ul', 'cars-offers');
    view.offers.forEach((o, i) => {
      const li = el('li', `cars-offer is-${o.state}${o.tip ? ' is-tip' : ''}`);
      li.classList.add(`cars-seg--${o.seg}`);
      const desk = shape === 'desk';
      const main = el('div', 'cars-offer__main');
      const line1 = el('div', 'cars-offer__line');
      line1.append(seg(o.seg, !desk), cond(o.cond));
      const sp = el('span', `cars-speed cars-speed--${o.speed}`);
      sp.innerHTML = mark(o.speed === 'fast' ? 'up' : o.speed === 'slow' ? 'down' : 'flat', 'cars-mark cars-mark--sm');
      sp.append(el('span', '', t(`${desk ? 'carsSpeed_' : 'carsSpeedShort_'}${o.speed}`)));
      sp.title = t(`carsSpeed_${o.speed}`);
      if (o.tip) line1.append(withHTML(el('span', 'cars-tip'), `${mark('star', 'cars-mark cars-mark--sm')}<span>${t('carsTip')}</span>`));
      const line2 = el('div', 'cars-offer__line cars-offer__money');
      if (o.was && desk) line2.append(el('s', 'cars-offer__was', o.was));
      line2.append(el('strong', 'cars-offer__ask', o.ask), el('span', 'cars-offer__brings', desk ? t('carsBrings', { price: o.list }) : `\u2192 ${o.list}`), el('span', 'cars-offer__margin', o.margin));
      if (desk) { const line3 = el('div', 'cars-offer__line'); line3.append(sp); main.append(line1, line3, line2); } else main.append(line1, line2);
      const acts = el('div', 'cars-offer__acts');
      if (o.state === 'open') {
        const h = btn('cars-btn--ghost cars-offer__haggle', null, () => cb.onHaggle?.(o.id));
        h.append(el('span', '', t('carsHaggle')), el('small', '', o.haggled ? t('carsHaggled') : `${o.chance} %`));
        h.disabled = o.haggled;
        h.dataset.role = 'haggle';
        h.setAttribute('aria-label', `${t('carsHaggle')}: ${t(`carsSeg_${o.seg}`)}, ${t('carsHaggleChance', { pct: o.chance })}`);
        const b = btn('cars-btn--buy cars-offer__buy', null, () => cb.onBuy?.(o.id));
        b.append(kbd(i + 1), el('span', '', t('carsBuy')));
        b.disabled = !!o.blocked;
        b.dataset.nav = String(i);
        b.dataset.key = o.id;
        b.setAttribute('aria-label', `${t('carsBuy')}: ${t(`carsSeg_${o.seg}`)}, ${t(`carsCond_${o.cond}`)}, ${o.ask}. ${t('carsBrings', { price: o.list })}. ${t(`carsSpeed_${o.speed}`)}${o.blocked ? `. ${o.blockedText}` : ''}`);
        acts.append(h, b);
        if (o.blocked) main.append(el('div', 'cars-offer__blocked', o.blockedText));
      } else {
        const s = el('span', `cars-offer__state cars-offer__state--${o.state}`);
        s.innerHTML = mark(o.state === 'bought' ? 'yes' : 'no', 'cars-mark cars-mark--sm');
        s.append(el('span', '', t(o.state === 'bought' ? 'carsBought' : 'carsHaggleLost')));
        acts.append(s);
      }
      if (desk) li.append(main, acts); else li.append(main, sp, acts);
      ul.append(li);
    });
    frag.push(ul);
    return frag;
  };

  // The lot as a strip of small cards: icon, price, and what the car costs per week.
  const lotStrip = (cars) => {
    const wrap = el('div', 'cars-strip');
    if (!cars.length) { wrap.append(el('p', 'cars-strip__empty', t('carsLotEmpty'))); return wrap; }
    for (const c of cars) {
      const b = el('button', `cars-chip cars-seg--${c.seg}${c.dusty ? ' is-dusty' : ''}`);
      b.type = 'button';
      b.innerHTML = segSVG(c.seg);
      b.append(el('strong', 'cars-chip__price', c.price), el('span', 'cars-chip__cost', c.cost));
      if (c.dusty) b.append(withHTML(el('span', 'cars-chip__since'), `${mark('clock', 'cars-mark cars-mark--sm')}<span>${c.since}</span>`));
      b.setAttribute('aria-label', c.label);
      b.title = c.label;
      b.addEventListener('click', () => cb.onCarPick?.(c.id));
      b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') cb.onCarOver?.(c.id); });
      b.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') cb.onCarOver?.(null); });
      b.dataset.car = String(c.id);
      wrap.append(b);
    }
    return wrap;
  };

  // ---------- step 2: pricing ----------
  const priceBody = (view) => {
    const frag = [];
    const row = el('div', 'cars-opts cars-opts--3');
    row.setAttribute('role', 'radiogroup');
    row.setAttribute('aria-label', t('carsStep_price'));
    view.stances.forEach((s, i) => {
      const b = btn(`cars-opt${s.on ? ' is-on' : ''}${s.tip ? ' is-tip' : ''}`, null, () => cb.onStance?.(s.key));
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(s.on));
      b.dataset.nav = String(i);
      b.dataset.key = s.key;
      const head = el('span', 'cars-opt__head');
      head.append(kbd(i + 1), el('strong', '', t(`carsStance_${s.key}`)));
      if (s.tip) head.append(withHTML(el('span', 'cars-tip'), mark('star', 'cars-mark cars-mark--sm')));
      b.append(head, el('span', 'cars-opt__big', t(`carsStanceP_${s.key}`)), el('span', 'cars-opt__sub', t(`carsStanceS_${s.key}`)));
      row.append(b);
    });
    frag.push(row);
    frag.push(el('p', 'cars-head cars-head--sm', t(shape === 'desk' ? 'carsLotHead' : 'carsLotHeadShort')));
    frag.push(lotStrip(view.cars));
    if (view.standAll) frag.push(el('p', 'cars-fine', view.standAll));
    return frag;
  };

  // ---------- step 3: advertising ----------
  const adsBody = (view) => {
    const frag = [];
    frag.push(el('p', 'cars-head cars-head--sm', t('carsAdHead')));
    const row = el('div', 'cars-opts cars-opts--4');
    row.setAttribute('role', 'radiogroup');
    row.setAttribute('aria-label', t('carsStep_ads'));
    view.ads.forEach((a, i) => {
      const b = btn(`cars-opt${a.on ? ' is-on' : ''}${a.tip ? ' is-tip' : ''}`, null, () => cb.onAd?.(i));
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(a.on));
      b.dataset.nav = String(i);
      b.dataset.key = `ad${i}`;
      const head = el('span', 'cars-opt__head');
      head.append(kbd(i + 1), el('strong', '', t(`carsAd_${i}`)));
      if (a.tip) head.append(withHTML(el('span', 'cars-tip'), mark('star', 'cars-mark cars-mark--sm')));
      b.append(head, el('span', 'cars-opt__big', a.cost), el('span', 'cars-opt__sub', a.extra));
      row.append(b);
    });
    frag.push(row);
    if (view.targets.length > 1) {
      const tr = el('div', 'cars-targets');
      tr.setAttribute('role', 'radiogroup');
      tr.append(el('span', 'cars-targets__label', t('carsTarget')));
      for (const g of view.targets) {
        const b = btn(`cars-pill${g.on ? ' is-on' : ''}${g.seg ? ` cars-seg--${g.seg}` : ''}`, null, () => cb.onTarget?.(g.seg));
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(g.on));
        b.disabled = view.adOff;
        if (g.seg) { b.innerHTML = segSVG(g.seg); b.append(el('span', 'cars-pill__name', t(`carsShort_${g.seg}`))); b.setAttribute('aria-label', t(`carsSeg_${g.seg}`)); } else b.textContent = t('carsTargetAll');
        b.dataset.role = 'target';
        tr.append(b);
      }
      frag.push(tr);
    }
    // Visitors against cars, per kind of car, with a verdict.
    const m = el('div', 'cars-match');
    m.append(el('p', 'cars-match__head', view.matchHead));
    const grid = el('div', 'cars-match__grid');
    for (const r of view.match) {
      const c = el('div', `cars-match__cell cars-seg--${r.seg} is-${r.verdict}`);
      c.innerHTML = segSVG(r.seg);
      const nums = el('span', 'cars-match__nums');
      nums.append(el('strong', '', r.visitors), el('span', '', ' : '), el('strong', '', String(r.cars)));
      const v = el('span', 'cars-match__verdict');
      v.innerHTML = mark({ ok: 'yes', empty: 'warn', stay: 'clock', none: 'flat' }[r.verdict], 'cars-mark cars-mark--sm');
      v.append(el('span', 'cars-match__word', t({ ok: 'carsMatchOk', empty: 'carsMatchEmpty', stay: 'carsMatchStay', none: 'carsMatchNone' }[r.verdict])));
      c.append(nums, v);
      c.setAttribute('aria-label', `${t(`carsSeg_${r.seg}`)}: ${r.visitors} ${t('carsRunVisitors')}, ${r.cars}. ${v.textContent}`);
      grid.append(c);
    }
    m.append(grid);
    // A phone held sideways has room for two lines (the AI's tip is the star on its button there).
    const lines = shape === 'land' ? view.matchLines.filter((l) => l.kind !== 'tip').slice(0, 2) : view.matchLines;
    for (const line of lines) m.append(note(line.text, line.kind));
    frag.push(m);
    return frag;
  };

  // ---------- the week runs ----------
  const runBody = (view) => {
    const frag = [];
    const tally = el('div', 'cars-tally');
    const cell = (label, value, cls = '') => { const c = el('div', `cars-tally__cell ${cls}`); c.append(el('strong', 'cars-tally__num', value), el('span', 'cars-tally__label', label)); return c; };
    tally.append(cell(t('carsRunVisitors'), view.visitors), cell(t('carsRunSold'), view.sold), cell(t('carsRunGain'), view.gain, 'cars-tally__cell--gain'));
    frag.push(tally);
    const log = el('ul', 'cars-log');
    for (const l of view.log.slice(shape === 'desk' ? -8 : -3)) {
      const li = el('li', `cars-log__item is-${l.kind}`);
      li.innerHTML = mark(l.kind === 'buy' ? 'yes' : 'no', 'cars-mark cars-mark--sm');
      li.append(el('span', '', l.text));
      log.append(li);
    }
    frag.push(log);
    return frag;
  };

  // ---------- the week's summary ----------
  const sumBody = (view) => {
    const frag = [];
    const big = el('p', `cars-sum__net ${view.netGood ? 'is-good' : 'is-bad'}`);
    big.append(el('span', 'cars-sum__label', t('carsSumNet')), el('strong', 'cars-sum__num', view.net));
    frag.push(big);
    const dl = el('dl', 'cars-sum');
    for (const r of view.rows) {
      const dt = el('dt', '', r.label);
      if (r.sub) dt.append(el('small', '', r.sub));
      const dd = el('dd', r.kind ? `is-${r.kind}` : '', r.value);
      dl.append(dt, dd);
    }
    frag.push(dl);
    for (const n of view.notes) frag.push(note(n.text, n.kind));
    return frag;
  };

  let lastKey = '';
  let lastFocus = null;

  return {
    el: root,
    get shape() { return shape; },

    show(on) { if (root.hidden === on) root.hidden = !on; },

    /** Re-reads the screen's shape; true if it changed (the panels are drawn again then). */
    layout,

    setStatus(text) { if (status.textContent !== text) status.textContent = text; },

    /** A news line over the lot (null hides it). kind: 'news' | 'reward' | 'loan'. */
    setNews(text, kind = 'news', label = '') {
      news.hidden = !text;
      if (!text) return;
      news.className = `cars-news cars-news--${kind}`;
      news.replaceChildren();
      if (label) news.append(el('strong', 'cars-news__label', label));
      news.append(el('span', '', text));
    },

    /** A car's numbers (hovered or picked on the lot): { seg, cond, lines: [], pinned } or null. */
    setInfo(v) {
      info.hidden = !v;
      if (!v) return;
      info.className = `cars-info cars-seg--${v.seg}`;
      info.replaceChildren();
      const head = el('div', 'cars-info__head');
      head.append(seg(v.seg), cond(v.cond));
      info.append(head);
      for (const l of v.lines) info.append(el('p', 'cars-info__line', l));
      if (v.pinned) {
        const x = btn('cars-btn--ghost cars-info__close', t('carsInfoClose'), () => cb.onCloseInfo?.());
        info.append(x);
      }
    },

    /**
     * The forecast: { title, sub, note, reason, check, rows: [{ seg, lo, hi, mean, trend, max,
     * actual, hit, surprised }], foot }.
     */
    setForecast(v) {
      const key = JSON.stringify(v) + shape;
      if (key === fc.dataset.key) return;
      fc.dataset.key = key;
      fc.replaceChildren();
      fc.classList.toggle('is-check', !!v.check);
      const head = el('div', 'cars-fc__head');
      const title = el('h2', 'cars-fc__title');
      title.innerHTML = '<span class="cars-fc__ai" aria-hidden="true">KI</span>';
      title.querySelector('.cars-fc__ai').textContent = v.badge;
      title.append(el('span', '', v.title));
      head.append(title, el('span', 'cars-fc__note', v.note));
      fc.append(head);
      const rows = el('div', 'cars-fc__rows');
      for (const r of v.rows) {
        const row = el('div', `cars-fc__row cars-seg--${r.seg}${v.check ? (r.hit ? ' is-hit' : ' is-miss') : ''}`);
        const name = seg(r.seg, shape !== 'desk' || window.innerWidth < 1500);
        const track = el('span', 'cars-fc__track');
        const band = el('span', 'cars-fc__band');
        band.style.left = `${(r.lo / r.max) * 100}%`;
        band.style.width = `${(Math.max(0.35, r.hi - r.lo) / r.max) * 100}%`;
        track.append(band);
        for (let i = 1; i < r.max; i++) { const tick = el('span', 'cars-fc__tick'); tick.style.left = `${(i / r.max) * 100}%`; track.append(tick); }
        if (v.check) {
          const dot = el('span', 'cars-fc__actual');
          dot.style.left = `${(Math.min(r.max, r.actual) / r.max) * 100}%`;
          track.append(dot);
        }
        const num = el('span', 'cars-fc__num', v.check ? `${t('carsFcRangeShort', r)} → ${r.actual}` : t(shape === 'desk' ? 'carsFcRange' : 'carsFcRangeShort', r));
        if (v.check) num.title = `${t('carsFcBuyers', r)}, ${t('carsFcReal', { n: r.actual })}`;
        const end = el('span', 'cars-fc__end');
        if (v.check) {
          end.innerHTML = mark(r.hit ? 'yes' : 'no', 'cars-mark cars-mark--sm');
          end.append(el('span', 'cars-fc__word', t(r.hit ? 'carsFcHit' : 'carsFcMiss')));
        } else {
          end.innerHTML = mark(r.trend, 'cars-mark cars-mark--sm');
          end.append(el('span', 'cars-fc__word', t(`carsTrend_${r.trend}`)));
          end.classList.add(`is-${r.trend}`);
        }
        row.setAttribute('aria-label', v.check
          ? `${t(`carsSeg_${r.seg}`)}: ${t('carsFcBuyers', r)}, ${t('carsFcReal', { n: r.actual })}, ${t(r.hit ? 'carsFcHit' : 'carsFcMiss')}`
          : `${t(`carsSeg_${r.seg}`)}: ${t('carsFcBuyers', r)}, ${t(`carsTrend_${r.trend}`)}`);
        row.append(name, track, num, end);
        rows.append(row);
      }
      fc.append(rows);
      const foot = el('p', 'cars-fc__why');
      foot.append(el('strong', '', `${v.whyLabel}: `), el('span', '', v.reason));
      fc.append(foot);
      if (v.foot) fc.append(el('p', 'cars-fc__foot', v.foot));
    },

    /** The decision panel for the step in view.step: 'buy' | 'price' | 'ads' | 'run' | 'sum'. */
    setPanel(view) {
      const key = JSON.stringify(view) + shape;
      if (key === lastKey) return;
      lastKey = key;
      // Keep the keyboard's place: the same button gets the focus back after the redraw.
      const active = document.activeElement;
      const focusKey = panel.contains(active) ? (active.dataset.key ?? active.dataset.role ?? null) : null;
      panel.replaceChildren();
      panel.className = `cars-panel cars-panel--${view.step}`;
      const body = el('div', 'cars-panel__body');
      if (view.step === 'run' || view.step === 'sum') {
        const h = el('h2', 'cars-panel__title', view.title);
        panel.append(h);
      } else panel.append(stepper(view));
      if (view.coach && !(shape === 'land' && view.coachKind === 'tip' && view.step === 'price')) body.append(note(view.coach, view.coachKind ?? 'coach'));
      const parts = { buy: buyBody, price: priceBody, ads: adsBody, run: runBody, sum: sumBody }[view.step](view);
      body.append(...parts);
      panel.append(body, footer(view));
      if (focusKey) {
        const again = panel.querySelector(`[data-key="${focusKey}"]:not(:disabled)`) ?? panel.querySelector(`[data-role="${focusKey}"]:not(:disabled)`);
        again?.focus({ preventScroll: true });
      }
      if (view.step !== lastFocus) lastFocus = view.step;
    },

    /** Keyboard: the option buttons of the step (number keys press them, arrows walk them). */
    options() { return [...panel.querySelectorAll('[data-nav]')]; },

    press(i) {
      const b = panel.querySelector(`[data-nav="${i}"]`);
      if (!b || b.disabled) return false;
      b.focus({ preventScroll: true });
      b.click();
      return true;
    },

    /** Moves the keyboard focus through the options (dir -1 | 1); returns the focused button. */
    focusMove(dir) {
      const list = this.options().filter((b) => !b.disabled);
      if (!list.length) return null;
      const at = list.indexOf(document.activeElement);
      const next = at < 0 ? (dir > 0 ? 0 : list.length - 1) : (at + dir + list.length) % list.length;
      list[next].focus({ preventScroll: true });
      return list[next];
    },

    /** The haggle button that belongs to the focused offer (or the first one that can be used). */
    haggleTarget() {
      const row = document.activeElement?.closest?.('.cars-offer');
      return (row ?? panel).querySelector('[data-role="haggle"]:not(:disabled)');
    },

    /** Is the keyboard on a button that Enter should press itself (menu, back, a lot chip)? */
    ownsEnter() {
      const a = document.activeElement;
      return !!a && root.contains(a) && a.tagName === 'BUTTON' && !a.dataset.nav && a.dataset.role !== 'next' && !a.classList.contains('cars-opt');
    },

    /** The part of the screen the lot may fill (CSS px): { left, top, right, bottom }. */
    lotRect() {
      const r = lot.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    },

    remove() { root.remove(); },
  };
}
