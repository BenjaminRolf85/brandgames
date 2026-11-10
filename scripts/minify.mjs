// Deploy-time minification (Netlify build command). Minifies the published JavaScript and CSS
// in place, so visitors download less; the repository keeps the readable sources, because the
// build runs on Netlify's copy only. Already minified files (*.min.js) and data are untouched.
// Usage: node scripts/minify.mjs [dir]   (default: public)
import { transform } from 'esbuild';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';

const root = process.argv[2] ?? 'public';

// Build stamp for the settings screen (UTC), so a headset shows which deploy it runs.
const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
await writeFile(join(root, 'js', 'version.js'), `export const VERSION = '${stamp} UTC';\n`);

async function* walk(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

let before = 0;
let after = 0;
let files = 0;
for await (const file of walk(root)) {
  const ext = extname(file);
  // Skip what is minified already, and the Draco decoder (a worker script, packed already).
  if (!['.js', '.mjs', '.css'].includes(ext) || file.endsWith('.min.js') || file.includes('/libs/')) continue;
  const src = await readFile(file, 'utf8');
  // ES modules stay modules; classic scripts stay classic scripts.
  const isModule = ext === '.mjs' || /^\s*(import|export)\b/m.test(src);
  const out = await transform(src, {
    loader: ext === '.css' ? 'css' : 'js',
    format: ext !== '.css' && isModule ? 'esm' : undefined,
    minify: true,
    legalComments: 'inline', // keep license headers (/*! ... */, @license, @preserve)
    target: 'es2022',
  });
  await writeFile(file, out.code);
  before += src.length;
  after += out.code.length;
  files += 1;
}
console.log(`minified ${files} files: ${(before / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB`);
