// "Datenspur": the board model that the scene fills and both views draw (the screen layout for
// desktop and phones, lineage-screen.js, and the 3D panels for the headset, lineage-xr.js).
//   board = { kind: 'pairs' | 'graph', cols: [label], nodes: [{ id, col, kind, title, mono, meta }],
//             links: [{ a, b, state: 'fixed' | 'done' }]   a is the node in the lower column
//             needs: [{ id, asker, ans, text, ai: { id, conf } | null, aiState, done, tries }]
//             taken: Set of used candidates (pairs), impact: { src, field, hit, found, wrong, lit, active } }
// A need is one missing link: the asker (a description, or the downstream node of a graph) needs
// the candidate `ans` from the neighbouring column. The assistant's proposal for it is `ai`.
// No browser imports: the content checks (node) use this file too.

export const colOf = (board, id) => board.nodes.find((n) => n.id === id)?.col ?? -1;

/** What a view shows for one node. */
export function nodeView(board, node, sel) {
  const open = board.needs.filter((n) => n.asker === node.id && !n.done);
  const had = board.needs.some((n) => n.asker === node.id);
  const im = board.impact?.active ? board.impact : null;
  const candCols = new Set(board.needs.filter((n) => !n.done).map((n) => colOf(board, n.ans)));
  const taken = board.kind === 'pairs' && board.taken.has(node.id);
  const isCand = candCols.has(node.col) && !taken;
  return {
    need: open.map((n) => n.text).filter(Boolean),
    chips: im ? [] : open.filter((n) => n.ai && n.aiState === 'open'),
    missed: !im && open.some((n) => n.aiState === 'followed'),
    selectable: im ? (node.col === 3 && !im.found.has(node.id) && !im.wrong.has(node.id)) : (open.length > 0 || isCand),
    selected: sel === node.id,
    done: (had && !open.length) || taken,
    changed: !!im && im.src === node.id,
    mark: im ? (im.found.has(node.id) ? 'hit' : im.wrong.has(node.id) ? 'miss' : null) : null,
  };
}

/** Every line a view draws: { a, b, kind: 'fixed' | 'done' | 'ai' | 'pulse', conf }. */
export function linesOf(board) {
  const im = board.impact?.active ? board.impact : null;
  const out = board.links.map((l) => ({ a: l.a, b: l.b, kind: im?.lit.has(`${l.a}>${l.b}`) ? 'pulse' : l.state }));
  if (!im) {
    for (const n of board.needs) {
      if (n.done || !n.ai || n.aiState !== 'open') continue;
      const [a, b] = colOf(board, n.ai.id) < colOf(board, n.asker) ? [n.ai.id, n.asker] : [n.asker, n.ai.id];
      out.push({ a, b, kind: 'ai', conf: n.ai.conf });
    }
  }
  return out;
}

/** The links a change in `src` runs along, up to the warehouse column (the last step is the player's). */
export function litFrom(board, src, edges) {
  const reach = new Set([src]);
  const lit = new Set();
  let grew = true;
  while (grew) {
    grew = false;
    for (const [a, b] of edges) {
      if (!reach.has(a) || colOf(board, b) > 2) continue;
      lit.add(`${a}>${b}`);
      if (!reach.has(b)) { reach.add(b); grew = true; }
    }
  }
  return lit;
}
