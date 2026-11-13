// Generates PNG icons from public/icon.svg (run: npm run icons).
import sharp from 'sharp';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'public/icon.svg'));
const out = join(root, 'public/icons');
mkdirSync(out, { recursive: true });

const plain = { 'icon-180.png': 180, 'apple-touch-icon.png': 180, 'icon-192.png': 192, 'icon-512.png': 512 };
for (const [name, size] of Object.entries(plain)) {
  await sharp(svg, { density: 384 }).resize(size, size).png().toFile(join(out, name));
}

// Maskable: artwork inside the central safe zone (~70%) on a solid background.
const size = 512, inner = Math.round(size * 0.7);
const art = await sharp(svg, { density: 384 }).resize(inner, inner).png().toBuffer();
await sharp({ create: { width: size, height: size, channels: 4, background: '#3454d1' } })
  .composite([{ input: art, gravity: 'center' }])
  .png()
  .toFile(join(out, 'maskable-512.png'));

console.log('icons written to public/icons');
