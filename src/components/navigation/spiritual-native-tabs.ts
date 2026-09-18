import { DynamicColorIOS, Platform } from 'react-native';

import { brandPalette } from '@/lib/brand-palette';
import { spiritualTabBar } from '@/lib/spiritual-ui';

const SEVA_BADGE = '#C45C26';

/** Brand tint for iOS NativeTabs Liquid Glass — keeps identity without painting over glass. */
export function getSpiritualNativeTabsChrome() {
  const tintColor =
    Platform.OS === 'ios'
      ? DynamicColorIOS({
          light: spiritualTabBar.active,
          dark: brandPalette.goldLight,
        })
      : spiritualTabBar.active;

  const labelColor =
    Platform.OS === 'ios'
      ? DynamicColorIOS({
          light: spiritualTabBar.inactive,
          dark: brandPalette.mutedDark,
        })
      : spiritualTabBar.inactive;

  return {
    tintColor,
    iconColor: {
      default: labelColor,
      selected: tintColor,
    },
    labelStyle: {
      default: {
        color: labelColor,
        fontSize: 11,
        fontWeight: '600' as const,
      },
      selected: {
        color: tintColor,
        fontSize: 11,
        fontWeight: '600' as const,
      },
    },
    badgeBackgroundColor: SEVA_BADGE,
    /** Soft material on iOS 18 and earlier; ignored when Liquid Glass draws the bar. */
    blurEffect: 'systemChromeMaterial' as const,
    disableTransparentOnScrollEdge: true,
    minimizeBehavior: 'automatic' as const,
  };
}
