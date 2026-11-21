// Play assistance for everyone (Nov 2026), chosen in the settings and kept on the device:
//   difficulty 'normal' | 'easy'  ("Entspannt": more time, more help, slower pace; the result
//                                  counts EASY_SCORE of its points, so the leaderboards stay fair)
//   motion     'full' | 'reduced' (no camera shake, no flashes, calmer effects; follows the
//                                  system's "reduce motion" setting until the player chooses)
// Games read it when a round starts:
//   const time = assist.pick(60, 90);          // normal, easy
//   if (!assist.reducedMotion) this.shake(0.02);
const KEY_D = 'kiar.difficulty';
const KEY_M = 'kiar.motion';
export const EASY_SCORE = 0.8;
const listeners = new Set();

let difficulty = 'normal';
let motion = null; // null: follow the system setting
try {
  difficulty = localStorage.getItem(KEY_D) === 'easy' ? 'easy' : 'normal';
  const m = localStorage.getItem(KEY_M);
  motion = m === 'reduced' || m === 'full' ? m : null;
} catch { /* private mode */ }

const systemReduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export const assist = {
  get difficulty() { return difficulty; },
  /** The relaxed mode: games give more time, more hints and a slower pace. */
  get easy() { return difficulty === 'easy'; },
  /** Calm effects: no shake, no flashes, no fast camera moves. */
  get reducedMotion() { return motion ? motion === 'reduced' : systemReduced(); },
  /** Share of the points that count in the result (1 or EASY_SCORE). */
  get scoreFactor() { return difficulty === 'easy' ? EASY_SCORE : 1; },
  /** One value for the normal mode, one for the relaxed mode. */
  pick(normal, easy) { return difficulty === 'easy' ? easy : normal; },
  setDifficulty(next) {
    difficulty = next === 'easy' ? 'easy' : 'normal';
    try { localStorage.setItem(KEY_D, difficulty); } catch { /* ignore */ }
    listeners.forEach((fn) => fn());
  },
  setMotion(next) {
    motion = next === 'reduced' ? 'reduced' : 'full';
    try { localStorage.setItem(KEY_M, motion); } catch { /* ignore */ }
    listeners.forEach((fn) => fn());
  },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};
