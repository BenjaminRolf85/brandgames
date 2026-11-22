// "Stein auf Stein": the AI adviser. It has "seen" a few hundred houses built in this kind of
// place (generated here: common parts and tidy single-style houses are frequent, unusual parts
// and mixes are rare), each with what it cost and the coherence its own builders got. From them
// it estimates the coherence of any house: the average of the seen houses, weighted by how much
// they resemble it, pulled towards the overall average when only few are similar. Before a
// decision it forecasts for each card how coherent the finished house could become with it: the
// best houses it can imagine from there. For an extra it compares similar houses with and
// without it. Its confidence is the number of similar houses behind the forecast.
// Its blind spot: it knows the place and the prices, but not this family's wishes and not their
// budget. Where a wish decides, it is confidently off, and the brief tells the player so.
import { DECISIONS, PEOPLE, STYLES, judge, priceOf } from './bricks-data.js';

const HOUSES = 280; // houses it has seen
const UNLIKE = 0.2; // weight of a seen house per part that differs
const PRIOR = 0.6; // pull towards the overall average (in houses)
const HALF = 2.5; // similar houses for a confidence of 50 %
const TIP = 0.5; // an extra it recommends: at least this much coherence gained

function weighted(list, weight) {
  let r = Math.random() * list.reduce((s, x) => s + weight(x), 0);
  for (const x of list) { r -= weight(x); if (r <= 0) return x; }
  return list[list.length - 1];
}
const levelOf = (conf) => (conf >= 0.66 ? 'high' : conf >= 0.4 ? 'mid' : 'low');

export class Adviser {
  constructor(round) {
    this.round = round;
    const { catalogue, extras, brief } = round;
    const place = brief.place;
    // Option ids as numbers, so the many comparisons are cheap.
    this.index = DECISIONS.map((d) => new Map(catalogue[d].map((o, i) => [o.id, i])));
    this.houses = [];
    for (let i = 0; i < HOUSES; i++) {
      // Most builders stick to one style (often the one of the houses around), some mix.
      const theme = Math.random() < 0.18 ? null : Math.random() < 0.5 ? place.style : STYLES[Math.floor(Math.random() * STYLES.length)];
      const like = (o) => o.pop * (!theme ? 1 : o.style === theme ? 3 : o.style ? 0.4 : 1.4);
      // Their own family: other wishes, more or less money.
      const who = PEOPLE[Math.floor(Math.random() * PEOPLE.length)];
      const own = { needs: who.needs, budget: round.basic + who.spare + Math.round((Math.random() - 0.5) * 30), place };
      const ids = DECISIONS.map((d) => weighted(catalogue[d], like).id);
      // Too expensive for them: cheaper parts until it fits.
      for (let k = 0; k < DECISIONS.length && priceOf(ids) > own.budget; k++) ids[k] = round.cheapest[DECISIONS[k]].id;
      // Extras as long as the money lasts: the common ones more often.
      let left = own.budget - priceOf(ids);
      for (const x of [...extras].sort(() => Math.random() - 0.5)) {
        if (x.price <= left && Math.random() < 0.09 * like(x)) { ids.push(x.id); left -= x.price; }
      }
      // What it learned from: how well each house fits together, its place, the future and its
      // price. What the family wanted is not in its data.
      const rows = judge(ids, round, own).rows;
      this.houses.push({ key: ids.slice(0, DECISIONS.length).map((id, k) => this.index[k].get(id)), set: new Set(ids), total: (rows[0].score + rows[2].score + rows[3].score + rows[4].score) / 4 });
    }
    this.mean = this.houses.reduce((s, h) => s + h.total, 0) / HOUSES;
    this.count = HOUSES;
  }

  /** Its estimate for a house (six option numbers): [coherence, similar houses behind it]. */
  estimate(key) {
    let n = 0;
    let sum = 0;
    for (const h of this.houses) {
      let w = 1;
      for (let j = 0; j < key.length; j++) if (h.key[j] !== key[j]) w *= UNLIKE;
      n += w;
      sum += w * h.total;
    }
    return [(sum + PRIOR * this.mean) / (n + PRIOR), n];
  }

  /**
   * Forecasts for the next required part after `choices` (option ids so far):
   * [{ id, value (0..100), conf (0..1), level, top }]: how coherent the finished house could
   * become with this card, as far as the adviser can tell. locked: ids the money does not
   * allow (they get a forecast, but are never the tip).
   */
  advise(choices, locked = []) {
    const k = choices.length;
    const base = choices.map((id, j) => this.index[j].get(id));
    const rest = DECISIONS.length - k - 1;
    const out = this.round.catalogue[DECISIONS[k]].map((o, oi) => {
      // The three best houses it can imagine with this card.
      const best = [];
      const key = [...base, oi, ...new Array(rest).fill(0)];
      for (let c = 0; c < 3 ** rest; c++) {
        let v = c;
        for (let j = 0; j < rest; j++) { key[k + 1 + j] = v % 3; v = Math.floor(v / 3); }
        const e = this.estimate(key);
        if (best.length < 3 || e[0] > best[best.length - 1][0]) { best.push(e); best.sort((a, b) => b[0] - a[0]); if (best.length > 3) best.pop(); }
      }
      const raw = best.reduce((s, e) => s + e[0], 0) / best.length;
      const n = best.reduce((s, e) => s + e[1], 0) / best.length;
      const conf = n / (n + HALF);
      return { id: o.id, value: Math.round(raw), raw, conf, level: levelOf(conf), price: o.price };
    });
    const open = out.filter((f) => !locked.includes(f.id));
    const top = (open.length ? open : out).reduce((a, b) => (b.raw > a.raw ? b : a));
    for (const f of out) f.top = f === top;
    return out;
  }

  /**
   * Forecasts for the extras, given the required parts chosen so far: [{ id, gain (coherence
   * points with it, compared with similar houses without), conf, level, tip }]. Its tips: the
   * two extras it expects most from, if `left` (thousand euros) pays for them.
   */
  adviseExtras(choices, left) {
    const base = choices.map((id, j) => this.index[j].get(id));
    const out = this.round.extras.map((x) => {
      let n1 = 0;
      let s1 = 0;
      let n0 = 0;
      let s0 = 0;
      for (const h of this.houses) {
        let w = 1;
        for (let j = 0; j < base.length; j++) if (h.key[j] !== base[j]) w *= 0.5;
        if (h.set.has(x.id)) { n1 += w; s1 += w * h.total; } else { n0 += w; s0 += w * h.total; }
      }
      const without = (s0 + PRIOR * this.mean) / (n0 + PRIOR);
      const withIt = (s1 + without) / (n1 + 1);
      const gain = withIt - without;
      const conf = n1 / (n1 + HALF * 2);
      return { id: x.id, gain: Math.round(gain), raw: gain, conf, level: levelOf(conf), price: x.price, tip: false };
    });
    let money = left;
    let tips = 0;
    for (const f of [...out].sort((a, b) => b.raw - a.raw)) {
      if (tips < 2 && f.raw >= TIP && f.price <= money) { f.tip = true; money -= f.price; tips += 1; }
    }
    return out;
  }
}
