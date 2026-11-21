// "Stein auf Stein": the AI adviser. It has "seen" a few hundred houses built in this kind of
// place (generated here: common parts and tidy single-style houses are frequent, unusual parts
// and mixes are rare), each with what it cost and the coherence its own builders got. Before a
// decision it forecasts, for each option, how coherent the house would end up: the average of the
// houses that have this part, weighted by how much they resemble the house so far, pulled towards
// the overall average when there are only few of them. For an extra it compares similar houses
// with and without it. Its confidence is the number of similar houses behind the forecast. It
// is good where it has seen a lot and unsure or wrong on rare combinations, and it knows the
// place and the prices, but not this family's wishes: which extra fits them it can only guess.
import { DECISIONS, PEOPLE, STYLES, judge, priceOf } from './bricks-data.js';

const HOUSES = 280; // houses it has seen
const UNLIKE = 0.4; // weight of a house per earlier decision that differs from this house
const PRIOR = 2.5; // pull towards the overall average (in houses)
const HALF = 3.5; // similar houses for a confidence of 50 %
const TIP = 1.5; // an extra it recommends: at least this much coherence gained

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
    this.houses = [];
    for (let i = 0; i < HOUSES; i++) {
      // Most builders stick to one style (often the one of the houses around), some mix.
      const theme = Math.random() < 0.18 ? null : Math.random() < 0.5 ? place.style : STYLES[Math.floor(Math.random() * STYLES.length)];
      const like = (o) => o.pop * (!theme ? 1 : o.style === theme ? 3 : o.style ? 0.4 : 1.4);
      // Their own family: other wishes, more or less money.
      const who = PEOPLE[Math.floor(Math.random() * PEOPLE.length)];
      const own = { needs: who.needs, budget: round.basic + who.spare + Math.round((Math.random() - 0.5) * 30), place };
      let ids = DECISIONS.map((d) => weighted(catalogue[d], like).id);
      // Too expensive for them: cheaper parts until it fits.
      for (let k = 0; k < DECISIONS.length && priceOf(ids) > own.budget; k++) ids[k] = round.cheapest[DECISIONS[k]].id;
      // Extras as long as the money lasts: the common ones more often.
      let left = own.budget - priceOf(ids);
      for (const x of [...extras].sort(() => Math.random() - 0.5)) {
        if (x.price <= left && Math.random() < 0.09 * like(x)) { ids.push(x.id); left -= x.price; }
      }
      this.houses.push({ ids, set: new Set(ids), total: judge(ids, round, own).total });
    }
    this.mean = this.houses.reduce((s, h) => s + h.total, 0) / HOUSES;
    this.count = HOUSES;
  }

  /** How much a seen house resembles the required parts chosen so far. */
  like(h, choices) {
    let w = 1;
    for (let j = 0; j < choices.length; j++) if (h.ids[j] !== choices[j]) w *= UNLIKE;
    return w;
  }

  /**
   * Forecasts for the next required part after `choices` (option ids so far):
   * [{ id, value (0..100), conf (0..1), level, top }]. locked: ids the money does not allow
   * (they get a forecast, but are never the tip).
   */
  advise(choices, locked = []) {
    const k = choices.length;
    const out = this.round.catalogue[DECISIONS[k]].map((o) => {
      let n = 0;
      let sum = 0;
      for (const h of this.houses) {
        if (h.ids[k] !== o.id) continue;
        const w = this.like(h, choices);
        n += w;
        sum += w * h.total;
      }
      const raw = (sum + PRIOR * this.mean) / (n + PRIOR);
      const conf = n / (n + HALF);
      return { id: o.id, value: Math.round(raw), raw, conf, level: levelOf(conf), price: o.price };
    });
    const open = out.filter((f) => !locked.includes(f.id));
    const top = (open.length ? open : out).reduce((a, b) => (b.raw > a.raw ? b : a));
    for (const f of out) f.top = f === top;
    return out;
  }

  /**
   * Forecasts for the extras of a house with these six required parts:
   * [{ id, gain (coherence points with it, compared with similar houses without), conf, level,
   * tip, perEuro }]. Its tips: the extras with a clear gain, best value for money first, as
   * long as `left` (thousand euros) pays for them.
   */
  adviseExtras(choices, left) {
    const out = this.round.extras.map((x) => {
      let n1 = 0;
      let s1 = 0;
      let n0 = 0;
      let s0 = 0;
      for (const h of this.houses) {
        const w = this.like(h, choices);
        if (h.set.has(x.id)) { n1 += w; s1 += w * h.total; } else { n0 += w; s0 += w * h.total; }
      }
      const without = (s0 + PRIOR * this.mean) / (n0 + PRIOR);
      const withIt = (s1 + PRIOR * without) / (n1 + PRIOR);
      const gain = withIt - without;
      const conf = n1 / (n1 + HALF);
      return { id: x.id, gain: Math.round(gain), raw: gain, conf, level: levelOf(conf), price: x.price, perEuro: gain / x.price, tip: false };
    });
    let money = left;
    for (const f of [...out].sort((a, b) => b.perEuro - a.perEuro)) {
      if (f.raw >= TIP && f.price <= money) { f.tip = true; money -= f.price; }
    }
    return out;
  }
}
