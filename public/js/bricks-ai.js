// "Stein auf Stein": the AI forecast. It learns from the months so far how many bricks the
// player saves per month on average and how much that varies (newer months count more, so a
// raise or a slow phase shows quickly), and projects the trend into the future: the expected
// path to the target and an 80 % band around it. The band is the uncertainty of the monthly
// rate (shrinks with more data) plus the month-to-month ups and downs (grows with the time still
// ahead), so it narrows as data comes in and the target gets closer. Before any data it uses the
// plan (1 brick per month) as a weak prior.

const Z80 = 1.2816; // 80 % two-sided band
const MAX_H = 120; // months ahead it looks at most

export class Forecaster {
  constructor({ target, prior = 1, priorWeight = 1, priorVar = 0.5, forget = 0.86 }) {
    Object.assign(this, { target, prior, priorWeight, priorVar, forget });
    this.saved = [0]; // cumulative savings at the end of each month (index 0: the start)
  }

  /** Savings at the end of the month that just ended. */
  push(saved) { this.saved.push(saved); }

  get months() { return this.saved.length - 1; }

  /** Weighted mean and spread of the monthly savings (with the plan as a weak prior). */
  stats() {
    const n = this.months;
    const k0 = this.priorWeight;
    let sw = k0;
    let sw2 = k0 * k0;
    let sum = k0 * this.prior;
    const d = [];
    for (let i = 1; i <= n; i++) d.push(this.saved[i] - this.saved[i - 1]);
    d.forEach((v, i) => {
      const w = this.forget ** (n - 1 - i);
      sw += w;
      sw2 += w * w;
      sum += w * v;
    });
    const mu = sum / sw;
    let ss = k0 * this.priorVar;
    d.forEach((v, i) => { const w = this.forget ** (n - 1 - i); ss += w * (v - mu) ** 2; });
    const sigma2 = Math.max(0.04, ss / sw);
    const neff = (sw * sw) / sw2;
    return { mu, sigma2, seMu2: sigma2 / neff, neff, n };
  }

  /** Expected savings and the band h months after (month0, saved0). */
  path(h, saved0, st = this.stats()) {
    const sd = Math.sqrt(Math.max(0, h * st.sigma2 + h * h * st.seMu2));
    const mid = saved0 + st.mu * h;
    return { mid, lo: mid - Z80 * sd, hi: mid + Z80 * sd };
  }

  /**
   * When the target will be reached, seen from (month0, saved0): median month and the 80 %
   * band [lo, hi] (hi = Infinity if the slow edge never gets there within MAX_H months).
   */
  predict(month0, saved0) {
    const st = this.stats();
    const left = this.target - saved0;
    if (left <= 0) return { ...st, median: month0, lo: month0, hi: month0, done: true };
    let median = Infinity;
    let lo = Infinity;
    let hi = Infinity;
    for (let h = 0.05; h <= MAX_H; h += 0.05) {
      const p = this.path(h, saved0, st);
      if (lo === Infinity && p.hi >= this.target) lo = month0 + h;
      if (median === Infinity && p.mid >= this.target) median = month0 + h;
      if (hi === Infinity && p.lo >= this.target) { hi = month0 + h; break; }
    }
    return { ...st, median, lo, hi, done: false };
  }
}
