import { defineConfig } from 'astro/config';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const site = process.env.SITE_URL || 'https://nikkuisryu.github.io';
let base = process.env.BASE_PATH ?? '/deutsch-for-japanese';
if (!base.startsWith('/')) base = '/' + base;
if (base.length > 1) base = base.replace(/\/+$/, '');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

/**
 * After the build: write dist/sw-manifest.json (files to precache, relative to the scope)
 * and stamp a content hash into dist/sw.js so every deploy produces a new worker + cache name.
 */
function serviceWorkerManifest() {
  return {
    name: 'dfj-sw-manifest',
    hooks: {
      'astro:build:done': ({ dir }) => {
        const root = fileURLToPath(dir);
        const skip = new Set(['sw.js', 'sw-manifest.json', 'sw-kill.json']);
        const files = walk(root)
          .map((p) => relative(root, p).split(sep).join('/'))
          .filter((f) => !skip.has(f) && !f.endsWith('.map') && f !== '404.html')
          .sort();
        const hash = createHash('sha1');
        for (const f of files) hash.update(f).update(readFileSync(join(root, f)));
        const version = hash.digest('hex').slice(0, 12);
        // Pages are cached as their directory URL (e.g. "review/"), not "review/index.html".
        const urls = files.map((f) => (f === 'index.html' ? './' : f.endsWith('/index.html') ? f.slice(0, -'index.html'.length) : f));
        writeFileSync(join(root, 'sw-manifest.json'), JSON.stringify({ version, files: urls }));
        const swPath = join(root, 'sw.js');
        writeFileSync(swPath, readFileSync(swPath, 'utf8').replaceAll('__BUILD_VERSION__', version));
      },
    },
  };
}

export default defineConfig({
  site,
  base,
  trailingSlash: 'always',
  build: { format: 'directory' },
  integrations: [serviceWorkerManifest()],
});
