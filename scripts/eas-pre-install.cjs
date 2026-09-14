#!/usr/bin/env node
/**
 * Sharp is local icon tooling only. On EAS it often tries to compile from
 * source (Homebrew libvips / missing prebuild) and fails npm ci. Remove it
 * from the lockfile before EAS runs npm ci — the app binary does not need it.
 */
const { spawnSync } = require('node:child_process');

if (!process.env.EAS_BUILD) {
  process.exit(0);
}

process.env.SHARP_IGNORE_GLOBAL_LIBVIPS = '1';
console.log('eas-pre-install: dropping sharp from the EAS install graph');

const result = spawnSync(
  'npm',
  ['uninstall', 'sharp', '--package-lock-only', '--ignore-scripts', '--legacy-peer-deps'],
  { stdio: 'inherit', env: process.env },
);

process.exit(result.status ?? 1);
