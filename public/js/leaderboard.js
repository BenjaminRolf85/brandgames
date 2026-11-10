// Leaderboard UI pieces: 3D keyboard for name entry and the ranking list panel.
import { Button, Panel, measureBlocks, wrap } from './ui3d.js';
import { color, font, num } from './tokens.js';
import { t, getLang } from './i18n.js';
import { NAME_RE, OVERALL } from './api.js';
import { nameForm } from './touch-ui.js';

const MAX_LEN = 14;

/** Virtual keyboard (works with controllers, hands, mouse) plus physical keyboard support. */
export function nameEntry(scene, { initial = '', onSubmit, onCancel }) {
  const { eye, dist } = scene;
  let name = initial.slice(0, MAX_LEN);

  const field = scene.add(new Panel(0.9, 0.16, (ctx, p) => {
    const valid = NAME_RE.test(name.trim());
    p.surface({ stroke: color(valid ? 'xr-accent' : 'xr-panel-border'), strokeWidth: num('xr-border-width') * 2 });
    p.blocks([
      { text: t('yourName'), size: 'xr-text-sm', weight: 'bold', color: color('xr-panel-muted'), gap: 0.01 },
      { text: `${name}|`, size: 'xr-text-lg', weight: 'bold' },
    ], { align: 'left', pad: 0.03 });
  }));
  field.position.set(0, eye + 0.4, -dist);

  // Phones: the phone's own keyboard instead of the 3D one; the 3D field shows the name.
  if (scene.engine.touchUI) {
    let done = false;
    const form = nameForm({
      initial: name,
      maxLength: MAX_LEN,
      valid: (v) => NAME_RE.test(v),
      onInput: (v) => { name = v.slice(0, MAX_LEN); field.redraw(); },
      onSubmit: (v) => { if (done) return; done = true; form.remove(); onSubmit(v); },
      onCancel: () => { if (done) return; done = true; form.remove(); onCancel(); },
    });
    scene.onDispose(() => form.remove());
    return;
  }

  const rows = getLang() === 'de'
    ? ['1234567890', 'QWERTZUIOPÜ', 'ASDFGHJKLÖÄ', 'YXCVBNM-._']
    : ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM-._'];
  const key = 0.075;
  const gap = 0.008;
  const update = () => { field.redraw(); ok.set({ disabled: !NAME_RE.test(name.trim()) }); };
  const type = (ch) => {
    if (name.length >= MAX_LEN) return;
    name += name.length === 0 || name.endsWith(' ') ? ch : ch.toLowerCase();
    update();
  };
  let y = field.position.y - field.h / 2 - 0.03 - key / 2;
  rows.forEach((row) => {
    const width = row.length * key + (row.length - 1) * gap;
    [...row].forEach((ch, i) => {
      const b = new Button(key, key, { label: ch, labelSize: 'xr-text-md', grow: false, onClick: () => type(ch) });
      b.position.set(-width / 2 + key / 2 + i * (key + gap), y, -dist);
      scene.add(b);
    });
    y -= key + gap;
  });
  const space = new Button(0.34, key, { label: t('space'), labelSize: 'xr-text-sm', grow: false, onClick: () => { if (name && !name.endsWith(' ') && name.length < MAX_LEN) { name += ' '; update(); } } });
  const del = new Button(0.22, key, { label: t('delete'), labelSize: 'xr-text-sm', grow: false, onClick: () => { name = name.slice(0, -1); update(); } });
  const cancel = new Button(0.24, key, { label: t('cancel'), labelSize: 'xr-text-sm', grow: false, onClick: () => onCancel() });
  const ok = new Button(0.26, key, { label: t('send'), variant: 'primary', labelSize: 'xr-text-sm', grow: false, onClick: () => submit() });
  const bottom = [cancel, space, del, ok];
  const total = bottom.reduce((s, b) => s + b.w, 0) + gap * 3;
  let x = -total / 2;
  bottom.forEach((b) => { b.position.set(x + b.w / 2, y, -dist); x += b.w + gap; scene.add(b); });

  let sent = false;
  const submit = () => {
    const clean = name.trim();
    if (sent || !NAME_RE.test(clean)) return;
    sent = true;
    onSubmit(clean);
  };

  // Desktop preview: allow typing on a real keyboard.
  const onKey = (e) => {
    if (e.key === 'Enter') submit();
    else if (e.key === 'Backspace') { name = name.slice(0, -1); update(); }
    else if (e.key.length === 1 && /[\p{L}\p{N} ._-]/u.test(e.key) && name.length < MAX_LEN) { name += e.key; update(); }
    else return;
    e.preventDefault();
  };
  window.addEventListener('keydown', onKey);
  scene.onDispose(() => window.removeEventListener('keydown', onKey));
  update();
}

/**
 * Ranking panel. data: { top: [{ rank, name, score, id, games? }], total, you?, games? }.
 * mode 'overall' (the overall ranking) adds how many games each player has played. An optional
 * note is shown under the title. Returns the y of the panel's bottom edge.
 */
export function leaderboardList(scene, { mode, data, highlight, top, loading = false, error = false, note = '' }) {
  const rows = data?.top ?? [];
  const you = data?.you && !rows.some((r) => r.id === data.you.id) ? data.you : null;
  const isOverall = mode === OVERALL;
  const W = 0.92;
  const rowH = num('xr-text-sm') * 1.7;
  const noteSize = num('xr-text-min');
  const noteH = note ? measureBlocks([{ text: note, size: 'xr-text-min' }], W, 0.04) - 0.08 + 0.02 : 0;
  const head = 0.13 + noteH;
  const count = Math.max(rows.length + (you ? 1 : 0), 1);
  // Loading, error and empty messages wrap onto as many lines as they need.
  const state = loading ? 'loading' : error ? 'lbError' : rows.length ? '' : 'lbEmpty';
  const stateLineH = num('xr-text-sm') * 1.25;
  const stateH = state ? measureBlocks([{ text: t(state), size: 'xr-text-sm', weight: 'bold' }], W, 0.04) - 0.08 + (rowH - stateLineH) : 0;
  const h = head + Math.max(count * rowH, stateH) + 0.06;
  const panel = scene.add(new Panel(W, h, (ctx, p) => {
    p.surface();
    const pad = p.m(0.04);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillStyle = color('xr-panel-text');
    // Count on the right; the title shrinks (down to the minimum size) so the two never overlap.
    ctx.font = font('regular', p.m(num('xr-text-sm')));
    const countKey = isOverall ? 'overallPlayers' : 'players';
    const countText = data?.total ? t(data.total === 1 ? `${countKey}One` : countKey, { n: data.total }) : '';
    const countW = countText ? ctx.measureText(countText).width + p.m(0.03) : 0;
    const title = `${t('leaderboard')}: ${t(`${mode}Name`)}`;
    let size = p.m(num('xr-text-lg'));
    ctx.font = font('black', size);
    while (ctx.measureText(title).width > p.canvas.width - pad * 2 - countW && size > p.m(num('xr-text-min'))) { size -= 1; ctx.font = font('black', size); }
    ctx.fillText(title, pad, p.m(0.06));
    ctx.font = font('regular', p.m(num('xr-text-sm')));
    ctx.fillStyle = color('xr-panel-muted');
    ctx.textAlign = 'right';
    if (countText) ctx.fillText(countText, p.canvas.width - pad, p.m(0.06));
    ctx.textAlign = 'left';
    if (note) {
      ctx.font = font('regular', p.m(noteSize));
      wrap(ctx, note, p.canvas.width - pad * 2).forEach((line, i) => ctx.fillText(line, pad, p.m(0.115 + noteSize * 1.25 * (i + 0.5))));
    }
    const startY = p.m(head);
    if (state) {
      ctx.fillStyle = color(error ? 'xr-danger' : 'xr-panel-muted');
      ctx.font = font('bold', p.m(num('xr-text-sm')));
      wrap(ctx, t(state), p.canvas.width - pad * 2).forEach((line, i) => ctx.fillText(line, pad, startY + p.m(rowH / 2 + i * stateLineH)));
      return;
    }
    const list = you ? [...rows, null, you] : rows;
    let y = startY;
    list.forEach((r) => {
      if (!r) return;
      const mine = r.id === highlight;
      if (mine) {
        ctx.fillStyle = color('xr-primary');
        ctx.globalAlpha = 0.45;
        ctx.fillRect(pad * 0.5, y, p.canvas.width - pad, p.m(rowH));
        ctx.globalAlpha = 1;
      }
      const mid = y + p.m(rowH / 2);
      const medal = r.rank <= 3;
      ctx.font = font('black', p.m(num('xr-text-sm')));
      ctx.fillStyle = color(medal ? 'xr-warning' : 'xr-panel-muted');
      ctx.textAlign = 'left';
      ctx.fillText(`${r.rank}.`, pad, mid);
      ctx.fillStyle = color('xr-panel-text');
      ctx.font = font(mine ? 'black' : 'bold', p.m(num('xr-text-sm')));
      ctx.fillText(r.name, pad + p.m(0.1), mid);
      ctx.textAlign = 'right';
      ctx.fillText(String(r.score), p.canvas.width - pad, mid);
      if (isOverall && r.games) {
        const scoreW = ctx.measureText(String(r.score)).width;
        ctx.font = font('regular', p.m(noteSize));
        ctx.fillStyle = color('xr-panel-muted');
        ctx.fillText(t('overallGames', { n: r.games, total: data.games ?? r.games }), p.canvas.width - pad - scoreW - p.m(0.04), mid);
      }
      y += p.m(rowH);
    });
  }));
  panel.position.set(0, top - h / 2, -scene.dist);
  scene.popIn(panel);
  return top - h;
}
