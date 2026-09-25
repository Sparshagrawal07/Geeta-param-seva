import { describe, expect, it } from 'vitest';

import {
  getTabLifecycleOptions,
  shouldAnimateThemeContentOpacity,
} from '@/lib/platform-performance-policy';

describe('platform performance policy', () => {
  it('freezes and lazily mounts only Android JavaScript tabs', () => {
    expect(getTabLifecycleOptions('android')).toEqual({
      lazy: true,
      freezeOnBlur: true,
    });
    expect(getTabLifecycleOptions('ios')).toEqual({});
    expect(getTabLifecycleOptions('web')).toEqual({});
  });

  it('never animates content opacity above capable iOS Liquid Glass', () => {
    expect(shouldAnimateThemeContentOpacity('ios', true, false)).toBe(false);
    expect(shouldAnimateThemeContentOpacity('ios', false, false)).toBe(true);
    expect(shouldAnimateThemeContentOpacity('android', false, false)).toBe(true);
  });

  it('honors reduced motion on every platform', () => {
    expect(shouldAnimateThemeContentOpacity('ios', false, true)).toBe(false);
    expect(shouldAnimateThemeContentOpacity('android', false, true)).toBe(false);
  });
});
