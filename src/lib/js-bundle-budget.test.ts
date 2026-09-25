import { describe, expect, it } from 'vitest';

import { evaluateBundleSize } from '../../scripts/check-js-bundle-size.mjs';

describe('JavaScript bundle regression budget', () => {
  const options = {
    baselineBytes: 1_000,
    maxBytes: 1_100,
    maxGrowthRatio: 0.05,
  };

  it('uses the stricter absolute or growth limit', () => {
    expect(evaluateBundleSize(1_050, options)).toMatchObject({
      effectiveLimitBytes: 1_050,
      passes: true,
    });
    expect(evaluateBundleSize(1_051, options).passes).toBe(false);
  });

  it('still enforces the absolute cap when it is lower', () => {
    expect(
      evaluateBundleSize(1_081, {
        baselineBytes: 1_000,
        maxBytes: 1_080,
        maxGrowthRatio: 0.1,
      })
    ).toMatchObject({
      effectiveLimitBytes: 1_080,
      passes: false,
    });
  });
});
