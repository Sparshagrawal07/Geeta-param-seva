#!/usr/bin/env node
/**
 * Download the latest finished Android APK from EAS and save it with a clean name.
 *
 * EAS CDN always sets Content-Disposition to `application-<buildId>.apk`, so browser
 * and raw URL downloads get opaque names. This script renames on save.
 *
 * Usage:
 *   node scripts/download-android-apk.mjs
 *   node scripts/download-android-apk.mjs --profile preview-arm64
 *   node scripts/download-android-apk.mjs --build-id <uuid>
 *   node scripts/download-android-apk.mjs --versioned
 *   node scripts/download-android-apk.mjs --out dist/custom.apk
 */

import { createWriteStream, mkdirSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_BASE = 'Geeta-Param-Seva';
const DEFAULT_PROFILE = 'preview';

function parseArgs(argv) {
  const opts = {
    profile: DEFAULT_PROFILE,
    buildId: null,
    versioned: false,
    out: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--versioned') opts.versioned = true;
    else if (arg === '--profile' || arg === '-e') opts.profile = argv[++i];
    else if (arg === '--build-id' || arg === '--id') opts.buildId = argv[++i];
    else if (arg === '--out' || arg === '-o') opts.out = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return opts;
}

function printHelp() {
  console.log(`Download latest EAS Android APK and save as ${DEFAULT_BASE}.apk

Options:
  --profile, -e <name>   EAS build profile (default: ${DEFAULT_PROFILE})
  --build-id, --id <id>  Specific build UUID
  --versioned            Include app version in filename (e.g. ${DEFAULT_BASE}-1.0.0.apk)
  --out, -o <path>       Explicit output path
  --help, -h             Show help
`);
}

function runEasJson(args) {
  const result = spawnSync('npx', ['eas-cli', ...args, '--json', '--non-interactive'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });

  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || '').trim();
    throw new Error(`eas ${args.join(' ')} failed:\n${err}`);
  }

  const stdout = (result.stdout || '').trim();
  // eas may print warnings before JSON; prefer the first top-level array/object.
  const arrayStart = stdout.indexOf('\n[');
  const objectStart = stdout.indexOf('\n{');
  let start = -1;
  if (stdout.startsWith('[') || stdout.startsWith('{')) {
    start = 0;
  } else if (arrayStart >= 0 || objectStart >= 0) {
    const candidates = [arrayStart, objectStart].filter((i) => i >= 0);
    start = Math.min(...candidates) + 1; // skip the leading newline
  }
  if (start < 0) {
    throw new Error(`eas returned no JSON:\n${stdout}`);
  }
  return JSON.parse(stdout.slice(start));
}

function artifactUrl(build) {
  return build?.artifacts?.applicationArchiveUrl || build?.artifacts?.buildUrl || '';
}

function isApkUrl(url) {
  return /\.apk(\?|$)/i.test(String(url));
}

function pickApkBuild(builds, profile) {
  const list = Array.isArray(builds) ? builds : [builds];
  const match = list.find((b) => {
    if (!b) return false;
    const url = artifactUrl(b);
    if (!isApkUrl(url)) return false;
    if (profile && b.buildProfile && b.buildProfile !== profile) return false;
    return true;
  });
  if (!match) {
    throw new Error(
      `No finished Android APK found${profile ? ` for profile "${profile}"` : ''}. Run npm run build:android:apk first.`
    );
  }
  return match;
}

function resolveOutPath(opts, build) {
  if (opts.out) return resolve(ROOT, opts.out);
  const version = build.appVersion || '0.0.0';
  const name = opts.versioned ? `${DEFAULT_BASE}-${version}.apk` : `${DEFAULT_BASE}.apk`;
  return join(ROOT, 'dist', name);
}

async function downloadToFile(url, destPath) {
  mkdirSync(dirname(destPath), { recursive: true });
  const tmpPath = `${destPath}.partial`;
  if (existsSync(tmpPath)) unlinkSync(tmpPath);

  const response = await fetch(url, { redirect: 'follow' });
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}) for ${url}`);
  }
  if (!response.body) {
    throw new Error('Download response had no body');
  }

  await pipeline(Readable.fromWeb(response.body), createWriteStream(tmpPath));
  renameSync(tmpPath, destPath);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }

  let build;
  if (opts.buildId) {
    build = runEasJson(['build:view', opts.buildId]);
    if (!isApkUrl(artifactUrl(build))) {
      throw new Error(`Build ${opts.buildId} is not an APK artifact`);
    }
  } else {
    const builds = runEasJson([
      'build:list',
      '-p',
      'android',
      '--status',
      'finished',
      '--distribution',
      'internal',
      '-e',
      opts.profile,
      '--limit',
      '10',
    ]);
    build = pickApkBuild(builds, opts.profile);
  }

  const url = artifactUrl(build);
  if (!url) {
    throw new Error(`Build ${build.id} has no application archive URL`);
  }

  const outPath = resolveOutPath(opts, build);
  console.log(`Build:   ${build.id}`);
  console.log(`Profile: ${build.buildProfile || opts.profile}`);
  console.log(`Version: ${build.appVersion || '?'} (${build.appBuildVersion || '?'})`);
  console.log(`Saving:  ${outPath}`);

  await downloadToFile(url, outPath);
  console.log(`Saved Geeta Param Seva APK → ${outPath}`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
