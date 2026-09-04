/**
 * Generates / refreshes replaceable spiritual artwork placeholders.
 * Temple heroes are cropped from review mockups; other slots get labeled PNG stubs.
 *
 * Run: node scripts/prepare-spiritual-placeholders.mjs
 */
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets/images/spiritual');

const REVIEW_LIGHT = path.join(
  ROOT,
  '../.cursor/projects/Users-sparsh-GeetaParamSeva/assets/ChatGPT_Image_Aug_29__2026__12_36_47_AM-7d47a627-2c62-4a2c-b3a0-83ca02ad7eb4.jpg'
);
const REVIEW_DARK = path.join(
  ROOT,
  '../.cursor/projects/Users-sparsh-GeetaParamSeva/assets/ChatGPT_Image_Aug_29__2026__12_36_39_AM-d8e03f47-d80f-4752-b82d-fb1f6aa44525.jpg'
);

mkdirSync(OUT, { recursive: true });

async function cropTempleHero(inputPath, outputPath) {
  if (!existsSync(inputPath)) {
    console.warn(`Review mockup missing, skipping crop: ${inputPath}`);
    return false;
  }
  const meta = await sharp(inputPath).metadata();
  const width = meta.width ?? 1080;
  const height = meta.height ?? 1920;
  const cropHeight = Math.round(height * 0.34);
  await sharp(inputPath)
    .extract({ left: 0, top: 0, width, height: cropHeight })
    .resize(1200, 420, { fit: 'cover', position: 'top' })
    .png()
    .toFile(outputPath);
  return true;
}

async function labeledPlaceholder(outputPath, label, bg, fg) {
  const svg = `
    <svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${bg[0]}"/>
          <stop offset="100%" stop-color="${bg[1]}"/>
        </linearGradient>
      </defs>
      <rect width="800" height="600" fill="url(#g)"/>
      <rect x="24" y="24" width="752" height="552" rx="20" fill="none" stroke="${fg}" stroke-width="2" stroke-dasharray="12 8" opacity="0.55"/>
      <text x="400" y="290" text-anchor="middle" font-family="system-ui,sans-serif" font-size="28" fill="${fg}" opacity="0.85">${label}</text>
      <text x="400" y="330" text-anchor="middle" font-family="system-ui,sans-serif" font-size="16" fill="${fg}" opacity="0.55">Replace assets/images/spiritual/${path.basename(outputPath)}</text>
    </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(outputPath);
}

const legacyKrishna = path.join(OUT, 'krishna-art.png');

if (existsSync(legacyKrishna)) {
  copyFileSync(legacyKrishna, path.join(OUT, 'krishna-art-light.png'));
  copyFileSync(legacyKrishna, path.join(OUT, 'krishna-art-dark.png'));
} else if (existsSync(path.join(OUT, 'krishna-art-light.png'))) {
  copyFileSync(path.join(OUT, 'krishna-art-light.png'), path.join(OUT, 'krishna-art-dark.png'));
} else {
  await labeledPlaceholder(
    path.join(OUT, 'krishna-art-light.png'),
    'Krishna Art (Light)',
    ['#FFFCF7', '#F5EBDD'],
    '#A67C00'
  );
  copyFileSync(path.join(OUT, 'krishna-art-light.png'), path.join(OUT, 'krishna-art-dark.png'));
}

const templeLight = path.join(OUT, 'temple-hero-light.png');
const templeDark = path.join(OUT, 'temple-hero-dark.png');

const gotLight = await cropTempleHero(REVIEW_LIGHT, templeLight);
const gotDark = await cropTempleHero(REVIEW_DARK, templeDark);

if (!gotLight) {
  await labeledPlaceholder(
    templeLight,
    'Temple Hero (Light)',
    ['#F8E8D0', '#E8C89A'],
    '#8B6914'
  );
}
if (!gotDark) {
  await labeledPlaceholder(
    templeDark,
    'Temple Hero (Dark)',
    ['#1A1410', '#0D0A09'],
    '#E8C547'
  );
}

await labeledPlaceholder(
  path.join(OUT, 'nav-lotus-bg-light.png'),
  'Nav Lotus (Light)',
  ['#3D2E24', '#28140a'],
  '#E8C547'
);
await labeledPlaceholder(
  path.join(OUT, 'nav-lotus-bg-dark.png'),
  'Nav Lotus (Dark)',
  ['#1A1410', '#0D0A09'],
  '#E8C547'
);
await labeledPlaceholder(
  path.join(OUT, 'mandala-1.png'),
  'Mandala 1 Primary',
  ['#1A1008', '#0D0905'],
  '#E8C547'
);
await labeledPlaceholder(
  path.join(OUT, 'mandala-2.png'),
  'Mandala 2 Gold',
  ['#1A1008', '#0D0905'],
  '#E8C547'
);
await labeledPlaceholder(
  path.join(OUT, 'mandala-3.png'),
  'Mandala 3 Seal',
  ['#1A1008', '#0D0905'],
  '#C45C26'
);
await labeledPlaceholder(
  path.join(OUT, 'mandala-4.png'),
  'Mandala 4 Wash',
  ['#1A1008', '#0D0905'],
  '#F5EBDD'
);
await labeledPlaceholder(
  path.join(OUT, 'mandala-5.png'),
  'Mandala 5 Festive',
  ['#1A1008', '#0D0905'],
  '#C45C26'
);

console.log('Spiritual placeholders ready in assets/images/spiritual/');
