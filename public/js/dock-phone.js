// "Andock-Labor" on phones: the key numbers as a readable strip on the screen (instead of small
// 3D panels): the fit meter with its contact spots and the status, the AI's ranking as chips you
// can tap to pick a candidate, the AI's estimate for your own molecule, and the lab result.
// It sits right below the status bar (data-inset="top", so the 3D view keeps clear of it).
// Styled with the design tokens only (inline custom properties, 16 px text, 14 px at least).
import { t } from './i18n.js';

const css = (el, styles) => Object.assign(el.style, styles);
const box = {
  background: 'var(--xr-panel-bg)', border: '1px solid var(--xr-panel-border)', borderRadius: 'var(--radius-md)',
  color: 'var(--xr-panel-text)', boxSizing: 'border-box',
};

/** Creates the strip in the 3D stage. onPick(candidate) when a chip is tapped. */
export function phoneStrip({ onPick }) {
  const stage = document.getElementById('stage');
  const el = document.createElement('div');
  el.className = 'dock-strip';
  el.dataset.inset = 'top';
  css(el, {
    ...box, position: 'absolute', left: 'max(var(--space-3), env(safe-area-inset-left))', right: 'max(var(--space-3), env(safe-area-inset-right))',
    zIndex: '1', padding: 'var(--space-2) var(--space-3)', display: 'flex', flexDirection: 'column', gap: 'var(--space-1)',
    fontSize: 'var(--text-md)', lineHeight: '1.25', pointerEvents: 'auto', touchAction: 'manipulation',
  });
  el.hidden = true;
  const row1 = document.createElement('div');
  const row2 = document.createElement('div');
  css(row1, { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: '0' });
  css(row2, { display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexWrap: 'wrap', minWidth: '0' });
  el.append(row1, row2);
  stage?.append(el);
  let key = '';
  let cands = [];
  row2.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (b) onPick?.(cands[Number(b.dataset.i)]);
  });

  const span = (text, styles = {}) => {
    const s = document.createElement('span');
    s.textContent = text;
    css(s, styles);
    return s;
  };

  return {
    /** st: { fit, good, bad, special, status, statusToken, chips, own, lab } (see the scene). */
    set(st) {
      const k = JSON.stringify(st, (n, v) => (n === 'cand' ? undefined : v));
      if (k === key) return;
      key = k;
      // Row 1: the lab result while there is one, else the fit meter and the status.
      row1.replaceChildren();
      if (st.lab) {
        const L = st.lab;
        row1.append(span(L.done ? t('dockLabValue', { n: L.value }) : `${t('dockLabTitle', { c: L.letter })}: ${L.value} %`, {
          fontWeight: 'var(--font-weight-black)', color: L.done ? (L.ok ? 'var(--xr-dock-good)' : 'var(--xr-dock-bad)') : 'var(--xr-dock-lab)', whiteSpace: 'nowrap',
        }));
        if (L.done) row1.append(span(`${t('dockLabAI', { n: L.ai })} · ${L.verdict}`, { color: 'var(--xr-panel-text)', fontSize: 'var(--text-sm)', minWidth: '0' }));
      } else {
        const fitTok = st.fit >= 0.7 ? 'var(--xr-dock-good)' : st.fit >= 0.45 ? 'var(--xr-dock-mid)' : 'var(--xr-dock-bad)';
        row1.append(span(`${t('dockFit')} ${Math.round(st.fit * 100)} %`, { fontWeight: 'var(--font-weight-black)', color: fitTok, whiteSpace: 'nowrap' }));
        const dots = span('', { display: 'inline-flex', gap: '4px', flex: 'none' });
        for (let i = 0; i < st.special; i++) {
          const tok = i < st.good ? 'var(--xr-dock-good)' : i < st.good + st.bad ? 'var(--xr-dock-bad)' : 'var(--xr-dock-ai-track)';
          dots.append(span('', { width: '12px', height: '12px', borderRadius: '50%', background: tok, display: 'inline-block' }));
        }
        row1.append(dots);
        row1.append(span(st.status, {
          color: `var(--${st.statusToken})`, fontSize: 'var(--text-sm)', fontWeight: 'var(--font-weight-bold)',
          minWidth: '0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }));
      }
      // Row 2: the AI's ranking as chips (tap to pick), your own molecule with the AI's estimate.
      row2.replaceChildren();
      cands = st.chips.map((c) => c.cand);
      row2.append(span(t('dockChipAI'), { color: 'var(--xr-dock-ai)', fontWeight: 'var(--font-weight-black)' }));
      st.chips.forEach((c, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.i = String(i);
        const border = c.tested ? (c.ok ? 'var(--xr-dock-good)' : 'var(--xr-dock-bad)') : c.top ? 'var(--xr-warning)' : c.own ? 'var(--xr-dock-you)' : 'var(--xr-panel-border)';
        css(b, {
          font: 'inherit', fontSize: 'var(--text-md)', fontWeight: 'var(--font-weight-bold)', minHeight: '36px', padding: '2px 10px',
          borderRadius: 'var(--radius-pill)', border: `2px solid ${border}`, color: 'var(--xr-panel-text)',
          background: c.active ? 'var(--xr-dock-row-hi)' : 'var(--xr-button-bg)', textDecoration: c.tested && !c.ok ? 'line-through' : 'none',
        });
        b.textContent = c.own ? `${t('dockOwnShort')} ${c.ai} %` : `${c.letter} ${c.ai} %`;
        b.setAttribute('aria-label', c.own ? t('dockOwnEst', { n: c.ai }) : `${t('dockCandidate', { c: c.letter })}: ${c.ai} %`);
        row2.append(b);
      });
    },
    show(on) { if (el.hidden === on) el.hidden = !on; },
    /** Keeps the strip right below the status bar. */
    place() {
      const hud = stage?.querySelector('.mhud');
      const top = hud && !hud.hidden ? hud.getBoundingClientRect().bottom + 6 : 12;
      const v = `${Math.round(top)}px`;
      if (el.style.top !== v) el.style.top = v;
    },
    remove() { el.remove(); },
  };
}
