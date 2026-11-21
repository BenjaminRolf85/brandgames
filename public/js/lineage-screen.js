// "Datenspur" in the browser (desktop and phones; not in the headset): the boards as screen
// elements, so every name and every metadata line is crisp, and the mouse, the keyboard, a
// finger and a screen reader all work. A status bar (menu, points, streak) at the top; below it
// the three stages as a strip, the prompt, the board (tiles, or cards with lines drawn as SVG
// curves between them) and one line of feedback. Connecting: click or tap one card, then the
// other; or drag from one to the other; or the arrow keys and Enter. Styles: css/game-lineage.css.
import { t } from './i18n.js';
import { nodeView, linesOf } from './lineage-model.js';

const stage = () => document.getElementById('stage');
const SVG = 'http://www.w3.org/2000/svg';
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const svg = (tag, cls, attrs = {}) => {
  const e = document.createElementNS(SVG, tag);
  if (cls) e.setAttribute('class', cls);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
};
/** A technical name that may wrap after its separators (CUST_NO, CRM.CUSTOMER), not inside a word. */
const mono = (cls, text) => {
  const e = el('span', cls);
  String(text).split(/(?<=[_.])/).forEach((part, i) => { if (i) e.append(document.createElement('wbr')); e.append(part); });
  return e;
};
/**
 * A press on a button: the click, and for a finger or a pen already the lift-off on the same
 * spot (some browsers skip the click right after a drag gesture). One press never counts twice.
 */
function onPress(elm, fn) {
  let down = null;
  let last = -1e9;
  elm.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, id: e.pointerId }; });
  elm.addEventListener('pointerup', (e) => {
    const d = down;
    down = null;
    if (!d || d.id !== e.pointerId || e.pointerType === 'mouse' || elm.disabled) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10) return;
    last = e.timeStamp;
    fn(e);
  });
  elm.addEventListener('click', (e) => { if (e.timeStamp - last > 700) fn(e); });
}
// Icons (currentColor): marks that say right and wrong without color, the assistant's spark,
// and what kind of thing a card is.
const ICONS = {
  good: 'M5 12.5l4.5 4.5L19 7.5',
  bad: 'M6 6l12 12M18 6L6 18',
  info: 'M12 8v.01M12 11.5V17',
  ai: 'M12 3l1.9 5.6L19.5 10.5 13.9 12.4 12 18l-1.9-5.6L4.5 10.5l5.6-1.9zM19 16l.7 2.1 2.1.7-2.1.7L19 21.6l-.7-2.1-2.1-.7 2.1-.7z',
  bolt: 'M13 3L5 13.5h6L10 21l8-10.5h-6z',
  change: 'M4 9a8 8 0 0 1 14-3l2 2M20 4v4h-4M20 15a8 8 0 0 1-14 3l-2-2M4 20v-4h4',
  desc: 'M4 6h16M4 12h16M4 18h10',
  field: 'M4 5h16v14H4zM4 10h16M10 5v14',
  src: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3v12c0 1.7-3.6 3-8 3s-8-1.3-8-3zM4 6c0 1.7 3.6 3 8 3s8-1.3 8-3M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  tr: 'M4 8h13l-3-3M20 16H7l3 3',
  wh: 'M3 10l9-6 9 6v10H3zM8 20v-6h8v6',
  rep: 'M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6',
};
const icon = (kind) => `<svg class="lin-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="${ICONS[kind]}"/></svg>`;

export function screenView({ onPickOdd, onNode, onLink, onAccept, onHint, onNext, onMenu, onPointer, desk = false, calm = false }) {
  // ---- status bar ----
  const bar = el('div', `mhud lin-bar${desk ? ' lin-bar--desk' : ''}`);
  bar.dataset.inset = 'top';
  const menu = el('button', 'mhud__menu', t('menu'));
  menu.type = 'button';
  onPress(menu, () => onMenu?.());
  const score = el('span', 'lin-bar__score');
  const streak = el('span', 'lin-bar__streak');
  bar.append(menu, score, streak);
  bar.hidden = true;

  // ---- play area ----
  const root = el('div', `lin-play${desk ? ' lin-play--desk' : ''}${calm ? ' is-calm' : ''}`);
  root.hidden = true;
  const head = el('div', 'lin-head');
  const strip = el('ol', 'lin-strip');
  const pills = [1, 2, 3].map((n) => {
    const li = el('li', 'lin-strip__item');
    const fill = el('span', 'lin-strip__fill');
    li.append(fill, el('span', 'lin-strip__num', String(n)), el('span', 'lin-strip__name', t(`lineageStage${n}`)));
    strip.append(li);
    return { li, fill };
  });
  const row = el('div', 'lin-row');
  const prompt = el('p', 'lin-prompt');
  prompt.setAttribute('aria-live', 'polite');
  const speed = el('span', 'lin-speed');
  const speedText = el('span', 'lin-speed__text');
  const speedBar = el('span', 'lin-speed__bar');
  const speedFill = el('span', 'lin-speed__fill');
  speedBar.append(speedFill);
  speed.append(speedText, speedBar);
  speed.hidden = true;
  const hint = el('button', 'lin-hint');
  hint.type = 'button';
  hint.innerHTML = icon('ai');
  hint.append(t(desk ? 'lineageHintKey' : 'lineageHint'));
  hint.hidden = true;
  onPress(hint, () => onHint?.());
  row.append(prompt, speed, hint);
  head.append(strip, row);
  const board = el('div', 'lin-board');
  const feedback = el('p', 'lin-feedback');
  feedback.setAttribute('role', 'status');
  root.append(head, board, feedback);

  const cardWrap = el('div', `lin-cardwrap${calm ? ' is-calm' : ''}`);
  cardWrap.hidden = true;
  stage()?.append(bar, root, cardWrap);

  let model = null; // the link board that is shown
  let nodes = new Map(); // id -> { box, main, need, tag, chips, node }
  let tiles = [];
  let lines = null; // svg
  let gLines = null;
  let gTemp = null;
  let drag = null;
  let noClick = false;
  const drawn = new Set(); // links that were drawn already (a new one draws itself in)

  root.addEventListener('pointerdown', (e) => {
    onPointer?.();
    if (!e.target.closest('button')) onNext?.();
  });
  cardWrap.addEventListener('pointerdown', () => onPointer?.());

  // ---- lines ----
  const vertical = () => model?.kind === 'graph' && getComputedStyle(board).flexDirection === 'column';

  /** Where a line leaves or enters a card: spread along the card's edge when several lines meet. */
  function anchors(list) {
    const v = vertical();
    const base = board.getBoundingClientRect();
    const rect = (id) => {
      const r = nodes.get(id).box.getBoundingClientRect();
      return { x0: r.left - base.left, x1: r.right - base.left, y0: r.top - base.top, y1: r.bottom - base.top };
    };
    const rects = new Map();
    const side = new Map(); // "id:out" | "id:in" -> lines
    for (const l of list) {
      for (const [id, s] of [[l.a, 'out'], [l.b, 'in']]) {
        if (!rects.has(id)) rects.set(id, rect(id));
        const k = `${id}:${s}`;
        if (!side.has(k)) side.set(k, []);
        side.get(k).push(l);
      }
    }
    const mid = (r) => (v ? (r.x0 + r.x1) / 2 : (r.y0 + r.y1) / 2);
    for (const [k, ls] of side) {
      const [id, s] = k.split(':');
      const r = rects.get(id);
      ls.sort((p, q) => mid(rects.get(s === 'out' ? p.b : p.a)) - mid(rects.get(s === 'out' ? q.b : q.a)));
      ls.forEach((l, i) => {
        const f = (i + 1) / (ls.length + 1);
        const pt = v
          ? { x: r.x0 + (r.x1 - r.x0) * f, y: s === 'out' ? r.y1 : r.y0 }
          : { x: s === 'out' ? r.x1 : r.x0, y: r.y0 + (r.y1 - r.y0) * f };
        if (s === 'out') l.p = pt; else l.q = pt;
      });
    }
    return v;
  }

  const curve = (p, q, v) => {
    if (v) { const d = Math.max(10, (q.y - p.y) / 2); return `M${p.x} ${p.y}C${p.x} ${p.y + d} ${q.x} ${q.y - d} ${q.x} ${q.y}`; }
    const d = Math.max(10, (q.x - p.x) / 2);
    return `M${p.x} ${p.y}C${p.x + d} ${p.y} ${q.x - d} ${q.y} ${q.x} ${q.y}`;
  };

  function drawLines() {
    if (!model || !gLines) return;
    const list = linesOf(model).filter((l) => nodes.has(l.a) && nodes.has(l.b));
    const v = anchors(list);
    gLines.replaceChildren();
    // The assistant's proposals lie below, the links above.
    const order = { ai: 0, fixed: 1, done: 2, pulse: 3 };
    list.sort((a, b) => order[a.kind] - order[b.kind]);
    for (const l of list) {
      const d = curve(l.p, l.q, v);
      const key = `${l.a}>${l.b}`;
      gLines.append(svg('path', 'lin-line lin-line--under', { d }));
      const main = svg('path', `lin-line lin-line--${l.kind}`, { d });
      if (l.kind === 'done' && !drawn.has(key)) { drawn.add(key); main.setAttribute('pathLength', '1'); main.classList.add('lin-line--draw'); }
      gLines.append(main);
      if (l.kind === 'done') {
        gLines.append(svg('path', 'lin-line lin-line--flow', { d }));
        // A check in the middle: a finished link is marked by more than its color.
        const mx = (l.p.x + l.q.x) / 2;
        const my = (l.p.y + l.q.y) / 2;
        gLines.append(svg('circle', 'lin-dot', { cx: mx, cy: my, r: 8 }));
        gLines.append(svg('path', 'lin-dot__mark', { d: `M${mx - 3.5} ${my + 0.3}l2.4 2.4 4.4-5` }));
      } else if (l.kind === 'pulse') gLines.append(svg('path', 'lin-line lin-line--pulseflow', { d }));
    }
  }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => drawLines()) : null;
  ro?.observe(board);

  // ---- dragging a line ----
  const centerOf = (id, toward) => {
    const base = board.getBoundingClientRect();
    const r = nodes.get(id).box.getBoundingClientRect();
    if (vertical()) return { x: (r.left + r.right) / 2 - base.left, y: (toward.y > (r.top + r.bottom) / 2 ? r.bottom : r.top) - base.top };
    return { x: (toward.x > (r.left + r.right) / 2 ? r.right : r.left) - base.left, y: (r.top + r.bottom) / 2 - base.top };
  };
  const onMove = (e) => {
    if (!drag || e.pointerId !== drag.pid) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 10) return;
    drag.moved = true;
    const base = board.getBoundingClientRect();
    const p = centerOf(drag.id, { x: e.clientX, y: e.clientY });
    drag.line ??= gTemp.appendChild(svg('path', 'lin-line lin-line--drag'));
    drag.line.setAttribute('d', `M${p.x} ${p.y}L${e.clientX - base.left} ${e.clientY - base.top}`);
  };
  const endDrag = (e) => {
    if (!drag || (e && e.pointerId !== drag.pid)) return;
    const d = drag;
    drag = null;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
    d.line?.remove();
    if (!d.moved || !e || e.type === 'pointercancel') return;
    noClick = true; // the click that may follow a drag is not a selection
    const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest('.lin-node');
    const id = hit?.dataset.id;
    if (id && id !== d.id && nodes.has(id)) onLink?.(d.id, id);
  };
  board.addEventListener('pointerdown', (e) => {
    noClick = false;
    const main = e.target.closest('.lin-node__main');
    if (!main || main.disabled || !model || e.button > 0) return;
    drag = { id: main.parentElement.dataset.id, x: e.clientX, y: e.clientY, pid: e.pointerId, moved: false, line: null };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  });

  // ---- keyboard focus ----
  const focusables = () => [...root.querySelectorAll('button:not(:disabled)'), ...cardWrap.querySelectorAll('button')].filter((b) => b.offsetParent);

  function buildNode(n) {
    const box = el('div', `lin-node lin-node--${n.kind}`);
    box.dataset.id = n.id;
    const main = el('button', 'lin-node__main');
    main.type = 'button';
    const title = el('span', `lin-node__title${n.mono ? ' lin-mono' : ''}`);
    title.innerHTML = icon(n.kind);
    title.append(n.mono ? mono('', n.title) : el('span', '', n.title));
    main.append(title);
    if (n.meta) {
      const meta = el('span', 'lin-node__meta');
      meta.append(el('span', 'lin-glyph', n.meta.glyph), el('b', '', n.meta.ty), ` · `, el('b', 'lin-mono', n.meta.ex), ` · ${n.meta.ow}`);
      main.append(meta);
    } else if (n.text) main.append(el('span', 'lin-node__meta', n.text));
    const need = el('span', 'lin-node__need');
    const tag = el('span', 'lin-node__tag');
    main.append(need, tag);
    const chips = el('div', 'lin-node__chips');
    box.append(main, chips);
    onPress(main, () => { if (noClick) { noClick = false; return; } onNode?.(n.id); });
    nodes.set(n.id, { box, main, need, tag, chips, node: n, chipKey: '' });
    return box;
  }

  return {
    show(on) {
      bar.hidden = !on;
      root.hidden = !on;
      if (!on) cardWrap.hidden = true;
    },

    setHud({ score: s, streak: n, multText, mult, stage: st, done, total }) {
      // Narrow phones show the numbers only (the words are still read out).
      const txt = t('lineageScore', { n: s });
      if (score.dataset.v !== txt) {
        score.dataset.v = txt;
        const [num, ...rest] = txt.split(' ');
        score.replaceChildren(num, el('span', 'lin-bar__word', ` ${rest.join(' ')}`));
        score.setAttribute('aria-label', txt);
      }
      const sTxt = `${t('lineageStreak', { n })}${mult > 1 ? ` ${multText}` : ''}`;
      if (streak.dataset.v !== sTxt) {
        streak.dataset.v = sTxt;
        streak.innerHTML = icon('bolt');
        streak.append(el('span', 'lin-bar__word', `${t('lineageStreak', { n: '' }).trim()} `), `${n}${mult > 1 ? ` ${multText}` : ''}`);
        streak.setAttribute('aria-label', sTxt);
        streak.classList.toggle('is-hot', mult > 1);
        streak.classList.remove('is-pop');
        if (n > 0) { void streak.offsetWidth; streak.classList.add('is-pop'); }
      }
      pills.forEach((p, i) => {
        p.li.classList.toggle('is-done', i < st);
        p.li.classList.toggle('is-now', i === st);
        p.li.setAttribute('aria-current', i === st ? 'step' : 'false');
        p.fill.style.width = i === st ? `${Math.round((done / Math.max(1, total)) * 100)}%` : '0';
      });
    },

    setPrompt(text) { if (prompt.textContent !== text) prompt.textContent = text; },

    setFeedback(kind, text) {
      const box = el('span', `lin-feedback__box${kind ? ` is-${kind} is-new` : ''}`);
      box.innerHTML = kind ? icon(kind) : '';
      box.append(el('span', '', text ?? ''));
      feedback.replaceChildren(box);
    },

    setSpeed(k, points) {
      speed.hidden = k == null;
      if (k == null) return;
      const s = `${t('lineageSpeed')} +${points}`;
      if (speedText.textContent !== s) speedText.textContent = s;
      speedFill.style.width = `${Math.round(k * 100)}%`;
    },

    setHint(state) { hint.hidden = state !== 'ready'; },

    // ---- stage 1 ----
    showOdd({ tiles: list }) {
      model = null;
      nodes = new Map();
      lines = null; gLines = null; gTemp = null;
      board.className = `lin-board lin-board--odd lin-n${list.length}`;
      root.dataset.kind = 'odd';
      tiles = list.map((tl, i) => {
        const b = el('button', 'lin-tile');
        b.type = 'button';
        b.append(el('span', 'lin-tile__num', String(i + 1)), tl.mono ? mono('lin-tile__name lin-mono', tl.title) : el('span', 'lin-tile__name', tl.title));
        if (tl.parts.length) {
          const meta = el('span', 'lin-tile__meta');
          for (const p of tl.parts) {
            const part = el('span', `lin-part${p.key ? ' is-key' : ''}`);
            const text = el('span', `lin-part__text${p.k === 'ex' ? ' lin-mono' : ''}`);
            if (p.glyph) text.append(el('span', 'lin-glyph', p.glyph));
            text.append(p.text);
            part.append(el('span', 'lin-part__label', p.label), text);
            meta.append(part);
          }
          b.append(meta);
        }
        b.append(el('span', 'lin-tile__mark'));
        onPress(b, () => onPickOdd?.(i));
        return b;
      });
      board.replaceChildren(...tiles);
    },

    markOdd(i, kind) {
      const b = tiles[i];
      if (!b) return;
      b.classList.add(`is-${kind}`);
      const mark = b.querySelector('.lin-tile__mark');
      if (kind === 'dim') { b.disabled = true; return; }
      mark.innerHTML = icon(kind === 'wrong' ? 'bad' : 'good');
      if (kind !== 'wrong') mark.append(t('lineageOdd'));
    },

    lockOdd() {
      tiles.forEach((b) => {
        if (b === document.activeElement) b.blur();
        b.disabled = true;
        if (!/is-(right|wrong|answer|dim)/.test(b.className)) b.classList.add('is-rest');
      });
    },

    // ---- stages 2 and 3 ----
    showBoard(b) {
      model = b;
      nodes = new Map();
      tiles = [];
      drawn.clear();
      board.className = `lin-board lin-board--${b.kind}`;
      root.dataset.kind = b.kind;
      const cols = b.cols.map((label, c) => {
        const col = el('div', 'lin-col');
        col.append(el('p', 'lin-col__label', label));
        b.nodes.filter((n) => n.col === c).forEach((n) => col.append(buildNode(n)));
        return col;
      });
      lines = svg('svg', 'lin-lines', { 'aria-hidden': 'true' });
      gLines = svg('g');
      gTemp = svg('g');
      lines.append(gLines, gTemp);
      board.replaceChildren(lines, ...cols);
    },

    refresh({ sel }) {
      if (!model) return;
      for (const it of nodes.values()) {
        const v = nodeView(model, it.node, sel);
        const { box, main } = it;
        const wasDone = box.classList.contains('is-done');
        box.classList.toggle('is-on', v.selectable);
        box.classList.toggle('is-off', !v.selectable);
        box.classList.toggle('is-sel', v.selected);
        box.classList.toggle('is-done', v.done);
        box.classList.toggle('is-ask', v.need.length > 0 && !v.selected);
        box.classList.toggle('is-changed', v.changed);
        box.classList.toggle('is-pick', !!model.impact?.active && v.selectable);
        box.classList.toggle('is-hit', v.mark === 'hit');
        box.classList.toggle('is-miss', v.mark === 'miss');
        if (v.done && !wasDone) { box.classList.remove('is-snap'); void box.offsetWidth; box.classList.add('is-snap'); }
        if (main.disabled === v.selectable) {
          if (!v.selectable && main === document.activeElement) main.blur();
          main.disabled = !v.selectable;
        }
        main.setAttribute('aria-pressed', v.selected ? 'true' : 'false');
        const needText = v.need.length ? t('lineageNeeds', { need: v.need.join(' + ') }) : '';
        it.need.hidden = !needText;
        if (it.need.textContent !== needText) it.need.textContent = needText;
        const tagKind = v.changed ? 'change' : v.mark === 'hit' ? 'good' : v.mark === 'miss' ? 'bad' : v.done ? 'good' : '';
        const tagText = v.changed ? `${t('lineageChanged')}: ${model.impact.field}` : v.mark === 'hit' ? t('lineageAffected') : v.mark === 'miss' ? t('lineageNotAffected') : v.done ? t('lineageDone') : '';
        if (it.tag.dataset.v !== tagText) {
          it.tag.dataset.v = tagText;
          it.tag.innerHTML = tagKind ? icon(tagKind) : '';
          it.tag.append(el('span', 'lin-node__tagtext', tagText));
        }
        it.tag.hidden = !tagText;
        // The assistant's proposals for this card: one tap accepts.
        const key = `${v.chips.map((n) => n.id).join()}|${v.missed}`;
        if (key !== it.chipKey) {
          it.chipKey = key;
          const els = v.chips.map((n) => {
            const name = model.nodes.find((x) => x.id === n.ai.id).title;
            const c = el('button', 'lin-chip');
            c.type = 'button';
            c.innerHTML = icon('ai');
            const [lead, ...tail] = t('lineageAiChip', { conf: n.ai.conf, name: '|' }).split('|');
            c.append(el('span', 'lin-chip__conf', lead.replace(/[:\s]+$/, '')), mono('lin-chip__name lin-mono', name), tail.join(''));
            c.setAttribute('aria-label', t('lineageAiChipLabel', { conf: n.ai.conf, name }));
            onPress(c, () => onAccept?.(n.id));
            return c;
          });
          if (v.missed) {
            const m = el('span', 'lin-chip lin-chip--missed');
            m.innerHTML = icon('bad');
            m.append(t('lineageAiMissed'));
            els.push(m);
          }
          it.chips.replaceChildren(...els);
        }
      }
      // Too tall for the screen (long texts on a small phone): one tighter step.
      board.classList.remove('is-tight');
      if (board.scrollHeight > board.clientHeight + 1) board.classList.add('is-tight');
      drawLines();
    },

    /** A wrong link: the line shakes off (calm motion: fades), the card it was drawn to shakes. */
    shake(a, b) {
      if (!model || !nodes.has(a) || !nodes.has(b)) return;
      const [lo, hi] = model.nodes.find((n) => n.id === a).col < model.nodes.find((n) => n.id === b).col ? [a, b] : [b, a];
      const l = { a: lo, b: hi };
      const v = anchors([l]);
      const g = svg('g', 'lin-line--wrong');
      const d = curve(l.p, l.q, v);
      const mx = (l.p.x + l.q.x) / 2;
      const my = (l.p.y + l.q.y) / 2;
      g.append(svg('path', 'lin-line lin-line--under', { d }), svg('path', 'lin-line', { d, stroke: 'currentColor', 'stroke-width': 4 }),
        svg('circle', '', { cx: mx, cy: my, r: 9, fill: 'currentColor' }),
        svg('path', 'lin-dot__mark', { d: `M${mx - 3.5} ${my - 3.5}l7 7M${mx + 3.5} ${my - 3.5}l-7 7` }));
      g.style.color = 'var(--xr-lineage-bad)';
      g.addEventListener('animationend', () => g.remove());
      gTemp.append(g);
      const box = nodes.get(a).box;
      box.classList.remove('is-shake');
      void box.offsetWidth;
      box.classList.add('is-shake');
      box.addEventListener('animationend', () => box.classList.remove('is-shake'), { once: true });
    },

    /** Points that rise from a tile or a card. */
    pop(text, target) {
      const at = target?.tile != null ? tiles[target.tile] : nodes.get(target?.node)?.box;
      if (!at) return;
      const r = at.getBoundingClientRect();
      const p = el('span', 'lin-pop', text);
      p.style.left = `${(r.left + r.right) / 2}px`;
      p.style.top = `${r.top + 4}px`;
      p.addEventListener('animationend', () => p.remove());
      root.append(p);
      while (root.querySelectorAll('.lin-pop').length > 4) root.querySelector('.lin-pop').remove();
    },

    /** The free room below the board (px from the top): where the scene shows its landscape. */
    band() {
      const H = window.innerHeight;
      if (root.hidden) return { top: H, bottom: H };
      const card = cardWrap.hidden ? null : cardWrap.firstElementChild;
      const top = card ? card.getBoundingClientRect().bottom + 8 : root.getBoundingClientRect().bottom;
      return { top: Math.min(H, top), bottom: H };
    },

    showCard(card) {
      cardWrap.hidden = !card;
      root.classList.toggle('is-card', !!card);
      if (!card) { cardWrap.replaceChildren(); return; }
      const box = el('div', 'lin-card');
      box.setAttribute('role', 'dialog');
      box.append(el('h2', '', card.title), el('p', '', card.lines[0]));
      const ai = el('p', 'lin-card__ai');
      ai.innerHTML = icon('ai');
      ai.append(el('span', '', card.lines[1]));
      const go = el('button', 'lin-card__go', card.button);
      go.type = 'button';
      onPress(go, () => onNext?.());
      box.append(ai, go);
      cardWrap.replaceChildren(box);
      go.focus({ preventScroll: true });
    },

    focusFirst() {
      const list = focusables().filter((b) => b.classList.contains('lin-tile') || b.classList.contains('lin-node__main'));
      list[0]?.focus({ preventScroll: true });
    },

    focusNode(id) { const m = nodes.get(id)?.main; if (m && !m.disabled) m.focus({ preventScroll: true }); },

    /** Arrow keys: the focus moves to the nearest button in that direction. */
    moveFocus(dx, dy) {
      const list = focusables();
      if (!list.length) return;
      const cur = list.includes(document.activeElement) ? document.activeElement : null;
      if (!cur) { this.focusFirst(); if (!list.includes(document.activeElement)) list[0].focus({ preventScroll: true }); return; }
      const c = cur.getBoundingClientRect();
      const cx = (c.left + c.right) / 2;
      const cy = (c.top + c.bottom) / 2;
      let best = null;
      let bestD = Infinity;
      for (const b of list) {
        if (b === cur) continue;
        const r = b.getBoundingClientRect();
        const ox = (r.left + r.right) / 2 - cx;
        const oy = (r.top + r.bottom) / 2 - cy;
        const along = ox * dx + oy * dy;
        // Buttons that lie in the same row or column (their spans overlap) count as straight ahead.
        const overlap = dx ? r.top < c.bottom && r.bottom > c.top : r.left < c.right && r.right > c.left;
        const across = overlap ? 0 : Math.abs(ox * dy) + Math.abs(oy * dx);
        if (along < 4 || across > along * 2.5 + 40) continue;
        const d = along + across * 2;
        if (d < bestD) { bestD = d; best = b; }
      }
      best?.focus({ preventScroll: true });
    },

    remove() {
      ro?.disconnect();
      endDrag();
      root.remove();
      bar.remove();
      cardWrap.remove();
    },
  };
}
