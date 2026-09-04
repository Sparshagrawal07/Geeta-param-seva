import { brandPalette } from '@/lib/brand-palette';
import { spiritualDesignTokens } from '@/lib/spiritual-assets';

export { spiritualAssetFiles, spiritualAssetSlots, spiritualDesignTokens } from '@/lib/spiritual-assets';
export type { SpiritualAssetSlot } from '@/lib/spiritual-assets';

export const spiritualGradients = {
  primaryButton: {
    light: [brandPalette.devotionalBrown, brandPalette.primary] as const,
    dark: [brandPalette.devotionalBrownDark, brandPalette.primaryDark] as const,
  },
  heroCanvas: {
    light: ['#F8F0E8', brandPalette.background, brandPalette.background] as const,
    dark: ['#0D0A09', brandPalette.backgroundDark, brandPalette.backgroundDark] as const,
  },
  verseCard: {
    light: ['#FFFCF7', brandPalette.verseCard, '#F5EBDD'] as const,
    dark: ['#3A322C', brandPalette.verseCardDark, '#2A2420'] as const,
  },
  authPanel: {
    light: ['#FFFFFF', '#FDF8F2'] as const,
    dark: ['#2A2420', '#1F1A17'] as const,
  },
} as const;

export const spiritualTabBar = spiritualDesignTokens.tabBar;
