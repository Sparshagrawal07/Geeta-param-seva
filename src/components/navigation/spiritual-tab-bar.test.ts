import { describe, expect, it } from 'vitest';

import {
  TAB_BAR_CONTENT_HEIGHT,
  TAB_BAR_PADDING_BOTTOM_BASE,
  TAB_BAR_PADDING_TOP,
  buildSpiritualTabBarItemStyle,
  buildSpiritualTabBarStyle,
  resolveSpiritualTabBarMetrics,
} from '@/components/navigation/spiritual-tab-bar-metrics';

describe('spiritual tab bar metrics', () => {
  it('keeps the original 64px chrome when bottom inset is 0', () => {
    const metrics = resolveSpiritualTabBarMetrics(0);
    expect(metrics).toEqual({
      height: TAB_BAR_CONTENT_HEIGHT,
      paddingTop: TAB_BAR_PADDING_TOP,
      paddingBottom: TAB_BAR_PADDING_BOTTOM_BASE,
      itemHeight: 52,
    });

    const style = buildSpiritualTabBarStyle(0);
    expect(style.height).toBe(64);
    expect(style.paddingBottom).toBe(6);
    expect(style.paddingTop).toBe(4);
  });

  it('lifts the tab bar above Android 3-button nav via bottom inset', () => {
    const inset = 48;
    const metrics = resolveSpiritualTabBarMetrics(inset);
    expect(metrics.height).toBe(TAB_BAR_CONTENT_HEIGHT + inset);
    expect(metrics.paddingBottom).toBe(TAB_BAR_PADDING_BOTTOM_BASE + inset);

    const style = buildSpiritualTabBarStyle(inset);
    expect(style.height).toBe(112);
    expect(style.paddingBottom).toBe(54);

    const itemStyle = buildSpiritualTabBarItemStyle(inset);
    expect(itemStyle.height).toBe(52);
  });

  it('treats negative insets as zero', () => {
    const metrics = resolveSpiritualTabBarMetrics(-12);
    expect(metrics.height).toBe(TAB_BAR_CONTENT_HEIGHT);
    expect(metrics.paddingBottom).toBe(TAB_BAR_PADDING_BOTTOM_BASE);
  });
});
