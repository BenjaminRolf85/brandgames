// "Stein auf Stein": the AI adviser. It has "seen" a few hundred houses built in this kind of
// place (generated here: common parts and tidy single-style houses are frequent, unusual parts
// and mixes are rare), each with the coherence its own builders got. Before a decision it
// forecasts, for each option, how coherent the house would end up: the average of the houses that
// have this part, weighted by how much they resemble the house so far, pulled towards the overall
// average when there are only few of them. Its confidence is the number of similar houses behind
// the forecast. It is good where it has seen a lot and unsure or wrong on rare combinations, and
// it knows the place, but not this family's wishes or budget.
import { DECISIONS, PEOPLE, STYLES, judge } from './bricks-data.js';

const HOUSES = 260; // houses it has seen
const UNLIKE = 0.4; // weight of a house per earlier decision that differs from this house
const PRIOR = 2.5; // pull towards the overall average (in houses)
const HALF = 3.5; // similar houses for a confidence of 50 %

function weighted(list, weight) {
  let r = Math.random() * list.reduce((s, x) => s + weight(x), 0);
  for (const x of list) { r -= weight(x); if (r <= 0) return x; }
  return list[list.length - 1];
}

export class Adviser {
  /** catalogue: { decision: [option, option, option] }; place: { style, weather }. */
  constructor(catalogue, place) {
    this.catalogue = catalogue;
    this.houses = [];
    for (let i = 0; i < HOUSES; i++) {
      // Most builders stick to one style (often the one of the houses around), some mix.
      const theme = Math.random() < 0.18 ? null : Math.random() < 0.5 ? place.style : STYLES[Math.floor(Math.random() * STYLES.length)];
      const ids = DECISIONS.map((d) => weighted(catalogue[d], (o) => o.pop * (!theme ? 1 : o.style === theme ? 3 : o.style ? 0.4 : 1.4)).id);
      // Their coherence was judged for their own family: other wishes, another budget.
      const who = PEOPLE[Math.floor(Math.random() * PEOPLE.length)];
      this.houses.push({ ids, total: judge(ids, { needs: who.needs, budget: who.budget, place }).total });
    }
    this.mean = this.houses.reduce((s, h) => s + h.total, 0) / HOUSES;
    this.count = HOUSES;
  }

  /**
   * Forecasts for the next decision after `choices` (option ids so far):
   * [{ id, value (0..100), conf (0..1), level: 'high' | 'mid' | 'low', seen, top }].
   */
  advise(choices) {
    const k = choices.length;
    const out = this.catalogue[DECISIONS[k]].map((o) => {
      let n = 0;
      let sum = 0;
      let seen = 0;
      for (const h of this.houses) {
        if (h.ids[k] !== o.id) continue;
        let w = 1;
        for (let j = 0; j < k; j++) if (h.ids[j] !== choices[j]) w *= UNLIKE;
        n += w;
        sum += w * h.total;
        if (w > 0.3) seen += 1;
      }
      const value = (sum + PRIOR * this.mean) / (n + PRIOR);
      const conf = n / (n + HALF);
      return { id: o.id, value: Math.round(value), raw: value, conf, level: conf >= 0.66 ? 'high' : conf >= 0.4 ? 'mid' : 'low', seen };
    });
    const top = out.reduce((a, b) => (b.raw > a.raw ? b : a));
    for (const f of out) f.top = f === top;
    return out;
  }
}
