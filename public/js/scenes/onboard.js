// First visit: Echo greets the player and shows the basics in four short steps
// (hello, point and press, tap Echo, badges and certificate). Can be skipped at any time and
// replayed from the settings.
import { BaseScene, layoutRow } from '../scene.js';
import { Button, textPanel } from '../ui3d.js';
import { color } from '../tokens.js';
import { t } from '../i18n.js';
import { sfx } from '../sfx.js';
import { line } from '../echo-host.js';
import { echoVoice } from '../echo-voice.js';

const KEY = 'kiar.onboarded';
const STEPS = 4;

export function isOnboarded() {
  try { return localStorage.getItem(KEY) === '1'; } catch { return true; }
}

export function setOnboarded(v) {
  try { if (v) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch { /* private mode */ }
}

export class OnboardScene extends BaseScene {
  constructor(app) {
    super(app);
    this.host = app.host;
    this.step(1);
  }

  /** Bubble with Echo's text, a step counter and the buttons of this step. */
  page(n, text, buttons, id) {
    this.clearLayer();
    const { eye, dist } = this;
    const w = this.host.narrow ? 0.8 : 0.86;
    const bubble = this.host.say(this, text, { at: { x: 0, top: eye + 0.38, z: -dist }, w, id, force: true });
    const counter = this.add(textPanel(0.5, 0.04, [{ text: t('onboardStep', { n, total: STEPS }), size: 'xr-text-sm', weight: 'bold', color: color('xr-bg-muted') }], { surface: false }));
    counter.position.set(0, bubble.position.y + bubble.h / 2 + 0.03, -dist);
    const bh = Math.max(...buttons.map((b) => b.h));
    layoutRow(buttons, bubble.position.y - bubble.h / 2 - 0.05 - bh / 2, -dist, 0.03);
    buttons.forEach((b, i) => { this.add(b); this.popIn(b, 0.15 + i * 0.05); });
    return bubble;
  }

  skipButton() {
    return new Button(0.3, 0.11, { label: t('onboardSkip'), labelSize: 'xr-text-sm', onClick: () => this.finish() });
  }

  step(n) {
    this.current = n;
    if (n === 1) {
      this.page(1, line('onboardHello'), [
        new Button(0.38, 0.12, { label: t('start'), variant: 'primary', onClick: () => this.step(2) }),
        this.skipButton(),
      ], 'onboardHello');
    } else if (n === 2) {
      const id = this.engine.isXR ? 'onboardPointXR' : 'onboardPointScreen';
      this.page(2, line(id), [
        new Button(0.42, 0.13, { label: t('onboardTry'), variant: 'primary', labelSize: 'xr-text-lg', onClick: () => { sfx.correct(); this.step(3); } }),
        this.skipButton(),
      ], id);
    } else if (n === 3) {
      const next = new Button(0.3, 0.11, { label: t('next'), labelSize: 'xr-text-sm', onClick: () => this.step(4) });
      const skip = this.skipButton();
      const bubble = this.page(3, line('onboardTap'), [next, skip], 'onboardTap');
      // The way on without tapping appears after a moment (or at once if Echo is not there).
      next.visible = false;
      skip.position.x = 0;
      this.delay(this.app.echo?.ready ? 7 : 0, () => {
        next.visible = true;
        layoutRow([next, skip], skip.position.y, skip.position.z, 0.03);
      });
      this.host.tappable(this, () => {
        if (this.current !== 3) return;
        this.current = 0;
        this.app.echo.celebrate();
        echoVoice.chirp(this.engine, this.app.echo.worldPos(), 'happy');
        this.burst(bubble.localToWorld(bubble.spot.clone()), 'xr-accent', 30);
        this.delay(0.6, () => this.step(4));
      });
    } else {
      this.page(4, line('onboardTapped'), [
        new Button(0.42, 0.12, { label: t('onboardDone'), variant: 'primary', onClick: () => this.finish() }),
      ], 'onboardTapped');
    }
  }

  finish() {
    setOnboarded(true);
    this.app.showMenu();
  }
}
