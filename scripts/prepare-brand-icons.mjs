#!/usr/bin/env node
/**
 * Builds Expo-facing brand assets from assets/images/icons (platform master set).
 *
 * Masters stay under assets/images/icons/{ios,android}.
 * Generated lean files land in assets/images/ for app.config.js + in-app use.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const IMAGES = path.join(ROOT, 'assets/images');
const ICONS = path.join(IMAGES, 'icons');

const ICON_BG = '#28140a';
const MAX_ICON_BYTES = 300 * 1024;
const MAX_LOGO_BYTES = 300 * 1024;

const SOURCES = {
  ios1024: path.join(ICONS, 'ios/iTunesArtwork@2x.png'),
  iosAppStore: path.join(ICONS, 'ios/AppIcon.appiconset/ItunesArtwork@2x.png'),
  androidForeground: path.join(ICONS, 'android/mipmap-xxxhdpi/ic_launcher_foreground.png'),
  playstore: path.join(ICONS, 'android/playstore-icon.png'),
};

function ensureSource(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${path.relative(ROOT, filePath)}`);
  }
}

async function writePng(filePath, buffer) {
  fs.writeFileSync(filePath, buffer);
  const relative = path.relative(ROOT, filePath);
  console.log(`  ${relative}: ${(buffer.length / 1024).toFixed(1)} KB`);
  return buffer.length;
}

async function optimizeSquare(inputPath, size, { maxBytes, background } = {}) {
  let quality = 80;
  let colors = 256;
  let pipeline = () => {
    let img = sharp(inputPath).resize(size, size, { fit: 'cover', position: 'centre' });
    if (background) {
      img = img.flatten({ background });
    }
    return img.png({ compressionLevel: 9, palette: true, quality, colors }).toBuffer();
  };

  let buffer = await pipeline();

  while (maxBytes && buffer.length > maxBytes && (quality > 40 || colors > 64)) {
    if (quality > 40) quality -= 10;
    else colors = Math.max(64, Math.floor(colors / 2));
    buffer = await pipeline();
  }

  return buffer;
}

/**
 * In-app logo: keep the seal, knock out the dark square plate so it sits
 * cleanly on cream/white UI without a visible background box.
 */
async function buildTransparentLogo(inputPath, size = 512, { maxBytes } = {}) {
  const { data, info } = await sharp(inputPath)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Sample corners to detect plate color (dark brown / near-black fill).
  const sample = (x, y) => {
    const i = (y * info.width + x) * 4;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const corners = [
    sample(2, 2),
    sample(info.width - 3, 2),
    sample(2, info.height - 3),
    sample(info.width - 3, info.height - 3),
  ];
  const plate = corners
    .reduce((acc, c) => [acc[0] + c[0], acc[1] + c[1], acc[2] + c[2]], [0, 0, 0])
    .map((v) => v / corners.length);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a < 8) {
      data[i + 3] = 0;
      continue;
    }
    const dr = r - plate[0];
    const dg = g - plate[1];
    const db = b - plate[2];
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // Knock out plate + near-black fill; keep gold seal pixels.
    if (dist < 42 || luminance < 22) {
      data[i + 3] = 0;
    }
  }

  let quality = 80;
  let colors = 256;
  let buffer = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9, palette: true, quality, colors })
    .toBuffer();

  while (maxBytes && buffer.length > maxBytes && (quality > 40 || colors > 64)) {
    if (quality > 40) quality -= 10;
    else colors = Math.max(64, Math.floor(colors / 2));
    buffer = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
      .png({ compressionLevel: 9, palette: true, quality, colors })
      .toBuffer();
  }

  return buffer;
}

/**
 * Adaptive icons: upscale the Android master foreground (already padded for the
 * 108dp safe zone) and composite on the official adaptive background color.
 */
async function buildAdaptiveForeground(sourcePath, size = 1024) {
  const content = await sharp(sourcePath)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: ICON_BG,
    },
  })
    .composite([{ input: content, gravity: 'centre' }])
    .png({ compressionLevel: 9, palette: true, quality: 70, colors: 192 })
    .toBuffer();
}

/** Android notification icons must be white alpha masks on transparent. */
async function buildNotificationIcon(sourcePath, size = 96) {
  const padded = Math.round(size * 0.78);
  const inset = Math.round((size - padded) / 2);

  const resized = await sharp(sourcePath)
    .resize(padded, padded, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const out = Buffer.alloc(size * size * 4, 0);
  for (let y = 0; y < resized.info.height; y++) {
    for (let x = 0; x < resized.info.width; x++) {
      const src = (y * resized.info.width + x) * 4;
      const r = resized.data[src];
      const g = resized.data[src + 1];
      const b = resized.data[src + 2];
      const a = resized.data[src + 3];
      const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (a < 32 || luminance < 28) continue;
      const dx = x + inset;
      const dy = y + inset;
      if (dx < 0 || dy < 0 || dx >= size || dy >= size) continue;
      const dest = (dy * size + dx) * 4;
      out[dest] = 255;
      out[dest + 1] = 255;
      out[dest + 2] = 255;
      out[dest + 3] = Math.min(255, Math.round(a * (0.55 + luminance / 255)));
    }
  }

  return sharp(out, { raw: { width: size, height: size, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

async function main() {
  ensureSource(SOURCES.ios1024, 'iOS 1024 master');
  ensureSource(SOURCES.androidForeground, 'Android adaptive foreground');
  ensureSource(SOURCES.playstore, 'Play Store icon');

  const iosMaster = fs.existsSync(SOURCES.iosAppStore) ? SOURCES.iosAppStore : SOURCES.ios1024;

  console.log('Preparing Expo brand icons from assets/images/icons …');

  const iconPng = await optimizeSquare(iosMaster, 1024, {
    maxBytes: MAX_ICON_BYTES,
    background: ICON_BG,
  });
  await writePng(path.join(IMAGES, 'icon.png'), iconPng);

  const adaptive = await buildAdaptiveForeground(SOURCES.androidForeground, 1024);
  await writePng(path.join(IMAGES, 'adaptive-icon.png'), adaptive);

  const logo = await buildTransparentLogo(iosMaster, 1024, { maxBytes: MAX_LOGO_BYTES });
  await writePng(path.join(IMAGES, 'logo.png'), logo);

  const favicon = await optimizeSquare(SOURCES.playstore, 48, { background: ICON_BG });
  await writePng(path.join(IMAGES, 'favicon.png'), favicon);

  const notification = await buildNotificationIcon(SOURCES.androidForeground, 96);
  await writePng(path.join(IMAGES, 'notification-icon.png'), notification);

  const oversized = [
    ['icon.png', iconPng.length, MAX_ICON_BYTES],
    ['logo.png', logo.length, MAX_LOGO_BYTES],
  ].filter(([, bytes, max]) => bytes > max);

  if (oversized.length) {
    console.warn('Warning: size budget exceeded for', oversized.map(([name]) => name).join(', '));
    process.exitCode = 1;
  } else {
    console.log('Done. Icon background:', ICON_BG);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
