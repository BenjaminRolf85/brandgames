// Online leaderboard: the overall ranking (first tab) and one tab per game.
import { BaseScene, layoutRow } from '../scene.js';
import { Button } from '../ui3d.js';
import { t } from '../i18n.js';
import { LEADERBOARD_MODES, OVERALL, fetchTop } from '../api.js';
import { leaderboardList } from '../leaderboard.js';

export class LeaderboardScene extends BaseScene {
  constructor(app, mode = LEADERBOARD_MODES[0]) {
    super(app);
    const { eye, dist } = this;
    // Tabs in rows of four, 0.32 m wide; long names wrap onto two lines without breaking words,
    // and all tabs get the same height so the rows stay tidy (many tabs with the clients' games).
    const tw = 0.32;
    const opts = (m) => ({ label: t(`${m}Name`), labelSize: 'xr-text-sm', onClick: () => this.show(m) });
    const tabH = Math.max(...LEADERBOARD_MODES.map((m) => Button.measure(tw, 0.09, opts(m))));
    this.tabs = LEADERBOARD_MODES.map((m) => new Button(tw, tabH, { ...opts(m), grow: false }));
    let y = eye + 0.66;
    for (let i = 0; i < this.tabs.length; i += 4) {
      layoutRow(this.tabs.slice(i, i + 4), y - tabH / 2, -dist, 0.015);
      y -= tabH + 0.015;
    }
    this.tabs.forEach((b, i) => { this.add(b, this.group); this.popIn(b, i * 0.04); });
    this.listTop = y - 0.02;
    this.menu = new Button(0.3, 0.11, { label: t('menu'), onClick: () => app.showMenu() });
    this.add(this.menu, this.group);
    this.show(mode);
  }

  async show(mode) {
    this.mode = mode;
    this.tabs.forEach((b, i) => b.set({ status: LEADERBOARD_MODES[i] === mode ? 'selected' : null }));
    this.render({ loading: true });
    try {
      const data = await fetchTop(mode);
      if (!this.disposed && this.mode === mode) this.render({ data });
    } catch {
      if (!this.disposed && this.mode === mode) this.render({ error: true });
    }
  }

  render(opts) {
    this.clearLayer();
    const note = this.mode === OVERALL ? t('overallHint') : '';
    const bottom = leaderboardList(this, { mode: this.mode, top: this.listTop, note, ...opts });
    this.menu.position.set(0, bottom - 0.04 - this.menu.h / 2, -this.dist);
  }
}
