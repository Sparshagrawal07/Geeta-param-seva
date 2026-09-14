import type { TextStyle, ViewStyle } from 'react-native';

import { brandPalette } from '@/lib/brand-palette';

/** Mirrors spiritualDesignTokens.tabBar without importing image-backed assets (testable). */
const tabBarChrome = {
  background: brandPalette.iconBackground,
  border: '#4A3728',
} as const;

/** Content chrome height before system bottom inset (icons + labels + padding). */
export const TAB_BAR_CONTENT_HEIGHT = 64;
export const TAB_BAR_PADDING_TOP = 4;
export const TAB_BAR_PADDING_BOTTOM_BASE = 6;
export const TAB_BAR_ITEM_HEIGHT = 52;

export function resolveSpiritualTabBarMetrics(bottomInset: number) {
  const safeBottom = Math.max(0, bottomInset);
  return {
    height: TAB_BAR_CONTENT_HEIGHT + safeBottom,
    paddingTop: TAB_BAR_PADDING_TOP,
    paddingBottom: TAB_BAR_PADDING_BOTTOM_BASE + safeBottom,
    itemHeight: TAB_BAR_ITEM_HEIGHT,
  };
}

export function buildSpiritualTabBarStyle(bottomInset: number): ViewStyle {
  const metrics = resolveSpiritualTabBarMetrics(bottomInset);
  return {
    backgroundColor: tabBarChrome.background,
    borderTopColor: tabBarChrome.border,
    borderTopWidth: 1,
    height: metrics.height,
    paddingTop: metrics.paddingTop,
    paddingBottom: metrics.paddingBottom,
  };
}

export function buildSpiritualTabBarItemStyle(bottomInset: number): ViewStyle {
  const metrics = resolveSpiritualTabBarMetrics(bottomInset);
  return {
    paddingTop: 2,
    height: metrics.itemHeight,
  };
}

export function buildSpiritualTabBarLabelStyle(): TextStyle {
  return {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
    marginBottom: 0,
  };
}
