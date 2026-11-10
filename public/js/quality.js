// Effects level, chosen in the settings: 'full' (all effects) or 'lite' (saves GPU power on
// the headset: no digital rain, no light tiles and sparkles, fewer floor waves, stronger
// foveated rendering and a slightly lower render resolution in XR). Also the optional
// frame-rate display for testing on the Quest.
const KEY = 'kiar.fx';
const FPS_KEY = 'kiar.fps';
const listeners = new Set();

let level = 'full';
let fps = false;
try {
  level = localStorage.getItem(KEY) === 'lite' ? 'lite' : 'full';
  fps = localStorage.getItem(FPS_KEY) === 'on';
} catch { /* private mode */ }

export const quality = {
  get level() { return level; },
  get lite() { return level === 'lite'; },
  get fps() { return fps; },
  set(next) {
    level = next === 'lite' ? 'lite' : 'full';
    try { localStorage.setItem(KEY, level); } catch { /* ignore */ }
    listeners.forEach((fn) => fn(level));
  },
  setFps(on) {
    fps = !!on;
    try { localStorage.setItem(FPS_KEY, fps ? 'on' : 'off'); } catch { /* ignore */ }
    listeners.forEach((fn) => fn(level));
  },
  onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};
