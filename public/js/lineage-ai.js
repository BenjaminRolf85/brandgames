// "Datenspur": the AI catalog assistant. It knows nothing about meaning: it only compares names.
// A technical name is split into its parts and the usual abbreviations are spelled out
// (CUST_NO -> customer id); a business description is reduced to the key words a simple word
// list finds in it (given with the content, language independent). The similarity of the two
// word sets is the assistant's confidence. That is right for obvious names and confidently wrong
// for false friends (ORDER_DT is not the day the order arrives), which is the lesson of the game.
// No browser imports: the content checks (node) use this file too.

// Abbreviations and word forms of technical names -> one key word.
const LEX = {
  cust: 'customer', customer: 'customer', customers: 'customer', kd: 'customer',
  no: 'id', nr: 'id', id: 'id', num: 'id',
  dt: 'date', date: 'date', ts: 'time', time: 'time',
  ord: 'order', order: 'order', orders: 'order',
  amt: 'amount', amount: 'amount', stat: 'status', status: 'status',
  name: 'name', names: 'name', contact: 'contact', since: 'since', ctry: 'country', cd: 'code', code: 'code',
  segment: 'segment', mail: 'mail', arrival: 'arrival', inv: 'invoice', invoice: 'invoice', invoices: 'invoice',
  hire: 'hire', birth: 'birth', sal: 'salary', grs: 'gross', net: 'net', mgr: 'manager', emp: 'employee',
  employees: 'employee', dept: 'department', exit: 'exit', exits: 'exit', due: 'due', pay: 'payment',
  payments: 'payment', tax: 'tax', prod: 'product', stock: 'stock', qty: 'quantity', unit: 'unit',
  price: 'price', wh: 'warehouse', min: 'minimum', camp: 'campaign', campaign: 'campaign', sent: 'sent',
  sends: 'sent', cnt: 'count', count: 'count', counts: 'count', open: 'open', rate: 'rate', rates: 'rate',
  click: 'click', clicks: 'click', opt: 'opt', in: 'in', unsub: 'unsubscribe', ship: 'shipping', dlv: 'delivery',
  delivery: 'delivery', deliveries: 'delivery', weight: 'weight', kg: 'kg', carrier: 'carrier', ret: 'return',
  flag: 'flag', addr: 'address', visit: 'visit', visits: 'visit', visitor: 'visitor', page: 'page', url: 'url',
  device: 'device', duration: 'duration', sec: 'second', contract: 'contract', start: 'start', end: 'end',
  notice: 'notice', days: 'day', day: 'day', monthly: 'month', month: 'month', fee: 'fee', auto: 'auto',
  renew: 'renew', sign: 'sign', sales: 'sales', region: 'region', list: 'list', revenue: 'revenue',
  template: 'template', templates: 'template', ar: 'ar', items: 'item', receivables: 'receivable',
  hand: 'hand', on: 'on', range: 'range', lines: 'line', demand: 'demand', turnover: 'turnover', eur: 'eur',
  attrition: 'attrition', events: 'event', shop: 'shop', lead: 'lead', cost: 'cost', costs: 'cost',
  freight: 'freight', layout: 'layout', inventory: 'inventory', applicants: 'applicant',
};
// Parts of a name that say how a table is built, not what is in it.
const STOP = new Set(['fact', 'dim', 'join', 'calc', 'map', 'load', 'match', 'sum', 'agg', 'hist', 'archive']);

/** The key words of a technical name ("CRM.CUST_NO" -> customer, id). The system before a dot is dropped. */
export function nameWords(name) {
  const base = String(name).includes('.') ? String(name).split('.').pop() : String(name);
  const parts = base.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const out = new Set();
  for (const p of parts) {
    if (STOP.has(p)) continue;
    out.add(LEX[p] ?? p);
  }
  return out;
}

/** Similarity 0..1 of key words and a name: half overlap of both sets, half "how much of the name is explained". */
export function similarity(keys, name) {
  const a = new Set(String(keys).split(/\s+/).filter(Boolean));
  const b = nameWords(name);
  if (!a.size || !b.size) return 0;
  let both = 0;
  a.forEach((w) => { if (b.has(w)) both += 1; });
  const dice = (2 * both) / (a.size + b.size);
  return (dice + both / b.size) / 2;
}

const MIN = 0.55; // below this the assistant says nothing
const MARGIN = 0.08; // two candidates that close: it says nothing either

/**
 * The assistant's proposal for one need: the candidate whose name fits the key words best.
 * candidates: [{ id, name }]. Returns { id, conf (percent) } or null (not sure enough).
 */
export function propose(keys, candidates) {
  const scored = candidates.map((c) => ({ id: c.id, s: similarity(keys, c.name) })).sort((x, y) => y.s - x.s);
  if (!scored.length || scored[0].s < MIN) return null;
  if (scored[1] && scored[0].s - scored[1].s < MARGIN) return null;
  return { id: scored[0].id, conf: Math.min(97, Math.round(scored[0].s * 100)) };
}
