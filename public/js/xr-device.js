// Headset profiles for the best image per device (Nov 2026). The Quest 3 (and 3S) has about
// twice the GPU power of the Quest 2, so it renders sharper (higher framebuffer scale), with
// lighter fixed foveation and at 90 Hz; the Quest 2 and Pro keep the previous settings; other
// headsets get safe defaults. A small governor watches the frame time in the headset and steps
// back (90 -> 72 Hz, then stronger foveation) when a scene gets too heavy, so it never stutters.
// gfxTier() tells the games how much they can afford: 'high' (Quest 3 with full effects, and
// the desktop browser), 'medium' (phones, Quest 3 lite, Quest 2/Pro full), 'low' (lite elsewhere).
import { quality } from './quality.js';

const UA = typeof navigator !== 'undefined' ? navigator.userAgent : '';

/** 'quest3' (also 3S), 'quest2' (also Pro and 1), or 'other'. */
export function headsetModel() {
  if (/Quest 3/i.test(UA)) return 'quest3';
  if (/Quest|Oculus/i.test(UA)) return 'quest2';
  return 'other';
}

/** Settings for a new XR session on this device and effects level. */
export function xrProfile() {
  const model = headsetModel();
  const lite = quality.lite;
  if (model === 'quest3') {
    return lite
      ? { scale: 1.0, foveation: 0.6, hz: 72, model }
      : { scale: 1.2, foveation: 0.35, hz: 90, model };
  }
  if (model === 'quest2') return lite ? { scale: 0.85, foveation: 1, hz: 72, model } : { scale: 1.0, foveation: 0.5, hz: 72, model };
  return lite ? { scale: 0.85, foveation: 1, hz: null, model } : { scale: 1.0, foveation: 0.5, hz: null, model };
}

let inXR = false;
/** Set by the engine when an XR session starts or ends. */
export function setInXR(v) { inXR = v; }

/** How much a game can afford right now: 'high' | 'medium' | 'low'. */
export function gfxTier() {
  const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (inXR) {
    const model = headsetModel();
    if (model === 'quest3') return quality.lite ? 'medium' : 'high';
    return quality.lite ? 'low' : 'medium';
  }
  if (coarse) return quality.lite ? 'low' : 'medium';
  return quality.lite ? 'medium' : 'high';
}

/** Asks the session for a refresh rate (90 Hz on Quest 3), where the browser supports it. */
export async function applyFrameRate(session, hz) {
  if (!hz || !session?.updateTargetFrameRate || !session.supportedFrameRates) return null;
  const rates = [...session.supportedFrameRates];
  const pick = rates.filter((r) => r <= hz).sort((a, b) => b - a)[0] ?? rates.sort((a, b) => a - b)[0];
  if (!pick) return null;
  try { await session.updateTargetFrameRate(pick); return pick; } catch { return null; }
}

/**
 * Keeps the headset smooth: when frames take clearly longer than the target for about 2 s,
 * steps down once per stage (90 -> 72 Hz, then stronger foveation). tick(dt) every frame.
 */
export class XrGovernor {
  constructor(renderer, session, profile) {
    this.renderer = renderer;
    this.session = session;
    this.hz = session.frameRate ?? profile.hz ?? 72;
    this.foveation = profile.foveation;
    this.slow = 0;
    this.stage = 0;
    this.cool = 3; // seconds before the first check (loading spikes)
  }

  tick(dt) {
    if (!this.session) return;
    this.cool -= dt;
    if (this.cool > 0) return;
    const budget = 1 / this.hz;
    this.slow = dt > budget * 1.25 ? this.slow + dt : Math.max(0, this.slow - dt * 0.5);
    if (this.slow < 2) return;
    this.slow = 0;
    this.cool = 3;
    if (this.hz > 72 && this.session.updateTargetFrameRate) {
      this.hz = 72;
      applyFrameRate(this.session, 72);
    } else if (this.foveation < 1) {
      this.foveation = Math.min(1, this.foveation + 0.3);
      this.renderer.xr.setFoveation(this.foveation);
    }
  }
}
