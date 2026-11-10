// Event mode: the attract screen between guests. Echo hovers next to the title, does a loop
// now and then and invites the next guest; tapping Echo or the start button begins the visit.
import { BaseScene } from '../scene.js';
import { Button, textPanel } from '../ui3d.js';
import { color } from '../tokens.js';
import { t, L } from '../i18n.js';
import { SPONSOR } from '../content.js';
import { line } from '../echo-host.js';
import { echoVoice } from '../echo-voice.js';
import { fetchStats } from '../api.js';

export class AttractScene extends BaseScene {
  constructor(app) {
    super(app);
    const { eye, dist } = this;
    this.app.echo?.setCompanion(null);
    const title = this.add(textPanel(1.0, 0.2, [
      { text: t('appTitle'), size: 0.1, weight: 'black', gap: 0.012 },
      { text: `by ${SPONSOR.name} - ${SPONSOR.tagline}`, size: 'xr-text-md', weight: 'bold', color: color('xr-warning'), gap: 0.012 },
      { text: L(SPONSOR.offer), size: 'xr-text-sm', color: color('xr-panel-muted') },
    ]));
    title.position.set(0, eye + 0.3 - title.h / 2, -dist);
    this.popIn(title);
    const bubble = app.host.say(this, line('attract'), { anchor: title, side: -1, id: 'attract', force: true });
    const go = this.add(new Button(0.5, 0.14, { label: t('eventStart'), variant: 'primary', labelSize: 'xr-text-lg', onClick: () => app.startVisit() }));
    go.position.set(0, title.position.y - title.h / 2 - 0.06 - go.h / 2, -dist);
    this.popIn(go, 0.15);
    const hint = this.add(textPanel(1.2, 0.065, () => [
      { text: this.rounds ? `${t('eventTap')}  ·  ${t('eventRounds', { n: this.rounds })}` : t('eventTap'), size: 'xr-text-sm', weight: 'bold', color: color('xr-bg-muted') },
    ], { surface: false, grow: false, layout: { pad: 0.01 } }));
    hint.position.set(0, go.position.y - go.h / 2 - 0.045, -dist);
    app.host.tappable(this, () => {
      app.echo.celebrate();
      this.delay(0.5, () => app.startVisit());
    });

    // Echo shows off now and then: a loop and a chirp.
    let t0 = 0;
    this.onUpdate((dt) => {
      t0 += dt;
      if (t0 < 9) return;
      t0 = 0;
      app.echo?.celebrate();
      if (app.echo?.root.visible) echoVoice.chirp(this.engine, app.echo.worldPos(), 'happy', 0.08);
    });

    // Social proof: rounds played today (anonymous counter).
    fetchStats(1).then((s) => {
      if (this.disposed) return;
      this.rounds = s?.today?.finishes ?? 0;
      hint.redraw();
    }).catch(() => {});
    this.bubble = bubble;
  }
}
