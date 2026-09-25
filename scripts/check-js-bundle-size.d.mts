export interface BundleBudgetOptions {
  baselineBytes?: number;
  maxBytes?: number;
  maxGrowthRatio?: number;
}

export interface BundleBudgetResult {
  bytes: number;
  baselineBytes: number;
  maxBytes: number;
  growthLimitBytes: number;
  effectiveLimitBytes: number;
  growthRatio: number;
  passes: boolean;
}

export const JS_BUNDLE_BASELINE_BYTES: number;
export const JS_BUNDLE_MAX_BYTES: number;
export const JS_BUNDLE_MAX_GROWTH_RATIO: number;

export function evaluateBundleSize(
  bytes: number,
  options?: BundleBudgetOptions
): BundleBudgetResult;
