// One shared glTF loader for all 3D models (Draco-compressed GLBs from Blender), with a cache,
// so every model downloads and decodes once. preloadModels() warms the cache in the
// background so games open without waiting.
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from '../vendor/addons/loaders/DRACOLoader.js';

const draco = new DRACOLoader();
draco.setDecoderPath('vendor/addons/libs/draco/gltf/');
draco.setDecoderConfig({ type: 'wasm' });

const loader = new GLTFLoader();
loader.setDRACOLoader(draco);

const cache = new Map();

/** Loads a GLB once; later calls share the same promise. */
export function loadGLTF(url) {
  if (!cache.has(url)) cache.set(url, loader.loadAsync(url));
  return cache.get(url);
}

export const MODELS = [
  'assets/models/echo.glb',
  'assets/models/echo-goggles.glb', // Datenflug
  'assets/models/santa-hat.glb', // Christmas (SEASON in config.js)
  'assets/models/xmas.glb',
  'assets/models/hacker.glb', // Datenflug
  'assets/models/coin.glb', // menu coins
  'assets/models/parkour.glb',
  'assets/models/forest.glb',
  'assets/models/city.glb',
  'assets/models/office.glb',
  'assets/models/fighter-human.glb',
  'assets/models/fighter-santa.glb', // AI Arena, Christmas edition
  'assets/models/glove.glb', // AI Arena boxing gloves
  'assets/models/quizbot.glb', // AI Quiz robot buddy
  'assets/models/pong-arena.glb',
  'assets/models/pong-balls.glb',
];

/** Loads all models one after another in idle time (Echo first, it flies everywhere). */
export function preloadModels() {
  let chain = Promise.resolve();
  for (const url of MODELS) chain = chain.then(() => loadGLTF(url).catch(() => null));
  return chain;
}
