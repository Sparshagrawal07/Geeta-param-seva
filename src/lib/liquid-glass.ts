import { Platform } from 'react-native';
import {
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';

import { brandPalette } from '@/lib/brand-palette';

/** True only when Apple's native Liquid Glass can safely render (iOS 26+ API present). */
export function canUseLiquidGlass(): boolean {
  if (Platform.OS !== 'ios') return false;
  try {
    return isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
  } catch {
    return false;
  }
}

/**
 * Optional warm tint for UIGlassEffect. Keep this very light — heavy fills
 * read as fake glass. Most chrome should stay untinted so the system material shows.
 */
export const liquidGlassTint = {
  regular: `${brandPalette.gold}14`,
  clear: `${brandPalette.gold}0A`,
  interactive: `${brandPalette.goldLight}18`,
} as const;
