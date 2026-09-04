#!/usr/bin/env node
/**
 * Run an EAS Android APK cloud build, wait for it, then save as Geeta-Param-Seva.apk.
 *
 * Usage:
 *   node scripts/build-and-save-android-apk.mjs
 *   node scripts/build-and-save-android-apk.mjs --profile preview-arm64
 *   node scripts/build-and-save-android-apk.mjs --versioned
 */

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const opts = { profile: 'preview', versioned: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--versioned') opts.versioned = true;
    else if (arg === '--profile' || arg === '-e') opts.profile = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(`Build Android APK on EAS and save as Geeta-Param-Seva.apk

Options:
  --profile, -e <name>   EAS profile (default: preview)
  --versioned            Include app version in filename
`);
    return;
  }

  console.log(`Starting EAS Android APK build (profile: ${opts.profile})...`);
  const build = spawnSync(
    'npx',
    [
      'eas-cli',
      'build',
      '--platform',
      'android',
      '--profile',
      opts.profile,
      '--wait',
      '--json',
      '--non-interactive',
    ],
    { cwd: ROOT, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, stdio: ['inherit', 'pipe', 'pipe'] }
  );

  if (build.status !== 0) {
    console.error((build.stderr || build.stdout || '').trim());
    process.exit(build.status || 1);
  }

  const stdout = (build.stdout || '').trim();
  let start = -1;
  if (stdout.startsWith('[') || stdout.startsWith('{')) {
    start = 0;
  } else {
    const arrayStart = stdout.indexOf('\n[');
    const objectStart = stdout.indexOf('\n{');
    const candidates = [arrayStart, objectStart].filter((i) => i >= 0);
    if (candidates.length > 0) start = Math.min(...candidates) + 1;
  }
  if (start < 0) {
    console.error('EAS build finished but returned no JSON; run: npm run download:android:apk');
    process.exit(1);
  }

  const payload = JSON.parse(stdout.slice(start));
  const entry = Array.isArray(payload) ? payload[0] : payload;
  const buildId = entry?.id;
  if (!buildId) {
    console.error('Could not read build id from EAS JSON; run: npm run download:android:apk');
    process.exit(1);
  }

  const downloadArgs = ['scripts/download-android-apk.mjs', '--build-id', buildId];
  if (opts.versioned) downloadArgs.push('--versioned');

  const download = spawnSync(process.execPath, downloadArgs, {
    cwd: ROOT,
    stdio: 'inherit',
  });
  process.exit(download.status || 0);
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exit(1);
}
