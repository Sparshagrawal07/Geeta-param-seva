import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const JS_BUNDLE_BASELINE_BYTES = Math.round(6.3 * 1024 * 1024);
export const JS_BUNDLE_MAX_BYTES = Math.round(6.5 * 1024 * 1024);
export const JS_BUNDLE_MAX_GROWTH_RATIO = 0.05;

export function evaluateBundleSize(
  bytes,
  {
    baselineBytes = JS_BUNDLE_BASELINE_BYTES,
    maxBytes = JS_BUNDLE_MAX_BYTES,
    maxGrowthRatio = JS_BUNDLE_MAX_GROWTH_RATIO,
  } = {}
) {
  const growthLimitBytes = Math.floor(baselineBytes * (1 + maxGrowthRatio));
  const effectiveLimitBytes = Math.min(maxBytes, growthLimitBytes);
  return {
    bytes,
    baselineBytes,
    maxBytes,
    growthLimitBytes,
    effectiveLimitBytes,
    growthRatio: (bytes - baselineBytes) / baselineBytes,
    passes: bytes <= effectiveLimitBytes,
  };
}

async function collectHermesBundles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const bundles = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      bundles.push(...(await collectHermesBundles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith('.hbc')) {
      bundles.push(fullPath);
    }
  }
  return bundles;
}

async function main() {
  const exportDirectory = path.resolve(
    ROOT,
    process.argv[2] ?? '.size-report/bundle'
  );
  const bundles = await collectHermesBundles(exportDirectory).catch(() => []);
  if (bundles.length === 0) {
    throw new Error(`No Hermes .hbc bundle found under ${exportDirectory}`);
  }

  const sizes = await Promise.all(bundles.map(async (bundle) => (await stat(bundle)).size));
  const totalBytes = sizes.reduce((total, size) => total + size, 0);
  const result = evaluateBundleSize(totalBytes);
  const mib = (totalBytes / (1024 * 1024)).toFixed(2);
  const limitMib = (result.effectiveLimitBytes / (1024 * 1024)).toFixed(2);

  console.log(
    `Android Hermes bundle: ${totalBytes} bytes (${mib} MiB); limit ${result.effectiveLimitBytes} bytes (${limitMib} MiB).`
  );
  if (!result.passes) {
    throw new Error(
      `JS bundle regression: ${(result.growthRatio * 100).toFixed(1)}% versus the 6.3 MiB baseline.`
    );
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  await main();
}
