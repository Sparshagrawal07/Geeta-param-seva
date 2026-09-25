/**
 * Recompress runtime spiritual artwork and precompose the temple reflection.
 *
 * Run directly with: node scripts/optimize-spiritual-assets.mjs
 */
import { renameSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSET_DIR = path.join(ROOT, 'assets/images/spiritual');
const MAX_ASSET_BYTES = 1024 * 1024;

const targets = [
  ['temple-hero-light.png', 1200, 676],
  ['temple-hero-dark.png', 1200, 676],
  ['feather-light.png', 512, 768],
  ['feather-dark.png', 512, 768],
  ['krishna-art-light.png', 512, 768],
  ['krishna-art-dark.png', 512, 768],
  ['nav-lotus-bg-light.png', 1000, 640],
  ['nav-lotus-bg-dark.png', 1000, 640],
  ['mandala-1.png', 768, 768],
  ['mandala-2.png', 768, 768],
  ['mandala-3.png', 768, 768],
  ['mandala-4.png', 512, 768],
  ['mandala-5.png', 768, 768],
];

async function optimizePng(filename, width, height) {
  const input = path.join(ASSET_DIR, filename);
  const temporary = `${input}.tmp.png`;
  await sharp(input)
    .resize(width, height, { fit: 'inside', withoutEnlargement: true })
    .png({ compressionLevel: 9, effort: 10, palette: true, colours: 256, quality: 90 })
    .toFile(temporary);
  renameSync(temporary, input);
}

async function createReflection(theme) {
  const input = path.join(ASSET_DIR, `temple-hero-${theme}.png`);
  const output = path.join(ASSET_DIR, `temple-reflection-${theme}.png`);
  const source = sharp(input).ensureAlpha();
  const metadata = await source.metadata();
  const width = metadata.width ?? 1200;
  const height = metadata.height ?? 676;
  const reflectionHeight = Math.min(170, Math.round(height * 0.25));
  const fade = Buffer.from(`
    <svg width="${width}" height="${reflectionHeight}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="white" stop-opacity="${theme === 'dark' ? '0.32' : '0.42'}"/>
          <stop offset="0.55" stop-color="white" stop-opacity="${theme === 'dark' ? '0.13' : '0.18'}"/>
          <stop offset="1" stop-color="white" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#fade)"/>
    </svg>
  `);

  const bottomStrip = await sharp(input)
    .ensureAlpha()
    .extract({ left: 0, top: height - reflectionHeight, width, height: reflectionHeight })
    .png()
    .toBuffer();

  await sharp(bottomStrip)
    .flip()
    .blur(3.2)
    .composite([{ input: fade, blend: 'dest-in' }])
    .png({ compressionLevel: 9, effort: 10, palette: true, colours: 256, quality: 88 })
    .toFile(output);
}

for (const [filename, width, height] of targets) {
  await optimizePng(filename, width, height);
}

await createReflection('light');
await createReflection('dark');

for (const filename of [...targets.map(([filename]) => filename), 'temple-reflection-light.png', 'temple-reflection-dark.png']) {
  const bytes = statSync(path.join(ASSET_DIR, filename)).size;
  if (bytes > MAX_ASSET_BYTES) {
    throw new Error(`${filename} exceeds the 1 MiB runtime budget (${bytes} bytes)`);
  }
}

console.log('Optimized spiritual artwork and generated temple reflections.');
