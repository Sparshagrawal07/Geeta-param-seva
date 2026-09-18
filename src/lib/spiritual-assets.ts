import type { ImageSourcePropType, ImageStyle, ViewStyle } from 'react-native';

import { brandPalette } from '@/lib/brand-palette';

/**
 * Replaceable artwork under assets/images/spiritual/.
 * Swap PNGs without changing layouts — filenames are stable contracts.
 *
 * | File | Slot | Usage |
 * |------|------|-------|
 * | temple-hero-light/dark | heroTemple, authTemple | Home + auth header backdrop |
 * | feather-light/dark | verseFeather, authFeather | Card-bridge + auth feather |
 * | lotus-divider-light/dark | lotusDivider | Section / header ornament |
 * | krishna-art-light/dark | verseKrishna | Verse card watermark |
 * | nav-lotus-bg-light/dark | navLotusBg | Tab bar decorative lotus |
 * | mandala-1 | mandalaPrimary | Practice / verse card watermark |
 * | mandala-2 | mandalaGold | Gita screens, soft accents |
 * | mandala-3 | mandalaSeal | Compact corner / entry seal |
 * | mandala-4 | mandalaWash | Screen background wash |
 * | mandala-5 | mandalaFestive | Aarti / celebration accents |
 */
export const spiritualAssetFiles = {
  lotusDividerLight: require('../../assets/images/spiritual/lotus-divider-light.png'),
  lotusDividerDark: require('../../assets/images/spiritual/lotus-divider-dark.png'),
  featherLight: require('../../assets/images/spiritual/feather-light.png'),
  featherDark: require('../../assets/images/spiritual/feather-dark.png'),
  krishnaArtLight: require('../../assets/images/spiritual/krishna-art-light.png'),
  krishnaArtDark: require('../../assets/images/spiritual/krishna-art-dark.png'),
  templeHeroLight: require('../../assets/images/spiritual/temple-hero-light.png'),
  templeHeroDark: require('../../assets/images/spiritual/temple-hero-dark.png'),
  navLotusBgLight: require('../../assets/images/spiritual/nav-lotus-bg-light.png'),
  navLotusBgDark: require('../../assets/images/spiritual/nav-lotus-bg-dark.png'),
  mandala1: require('../../assets/images/spiritual/mandala-1.png'),
  mandala2: require('../../assets/images/spiritual/mandala-2.png'),
  mandala3: require('../../assets/images/spiritual/mandala-3.png'),
  mandala4: require('../../assets/images/spiritual/mandala-4.png'),
  mandala5: require('../../assets/images/spiritual/mandala-5.png'),
} as const;

export type SpiritualAssetSlot =
  | 'lotusDivider'
  | 'heroTemple'
  | 'verseFeather'
  | 'authTemple'
  | 'authFeather'
  | 'verseKrishna'
  | 'navLotusBg'
  | 'mandalaPrimary'
  | 'mandalaGold'
  | 'mandalaSeal'
  | 'mandalaWash'
  | 'mandalaFestive';

export type AssetAnchor = 'top' | 'center' | 'bottom';

export interface SpiritualAssetSlotConfig {
  light: ImageSourcePropType;
  dark: ImageSourcePropType;
  /** width as fraction of container (0–1) or absolute number */
  width: number | `${number}%`;
  height: number | `${number}%`;
  opacity: { light: number; dark: number };
  position: 'center' | 'topRight' | 'bottomRight' | 'bottomRightInset' | 'fill';
  resizeMode: 'contain' | 'cover';
  anchor?: AssetAnchor;
  /** Height multiplier for fill+cover slots (nav lotus needs ~4× to fill wide tab bars). */
  coverScale?: number;
  accessibilityHidden: boolean;
  /** Max width cap for dividers */
  maxWidth?: number;
}

export const spiritualAssetSlots: Record<SpiritualAssetSlot, SpiritualAssetSlotConfig> = {
  lotusDivider: {
    light: spiritualAssetFiles.lotusDividerLight,
    dark: spiritualAssetFiles.lotusDividerDark,
    width: '100%',
    height: 28,
    opacity: { light: 1, dark: 1 },
    position: 'center',
    resizeMode: 'contain',
    accessibilityHidden: true,
    maxWidth: 340,
  },
  heroTemple: {
    light: spiritualAssetFiles.templeHeroLight,
    dark: spiritualAssetFiles.templeHeroDark,
    width: '100%',
    height: '100%',
    opacity: { light: 1, dark: 1 },
    position: 'fill',
    resizeMode: 'cover',
    anchor: 'top',
    accessibilityHidden: true,
  },
  /** Peacock feather bridging hero bottom → verse card top (see HomeHeroSection). */
  verseFeather: {
    light: spiritualAssetFiles.featherLight,
    dark: spiritualAssetFiles.featherDark,
    width: 118,
    height: 210,
    opacity: { light: 0.98, dark: 0.94 },
    position: 'topRight',
    resizeMode: 'contain',
    accessibilityHidden: true,
  },
  authTemple: {
    light: spiritualAssetFiles.templeHeroLight,
    dark: spiritualAssetFiles.templeHeroDark,
    width: '100%',
    height: '100%',
    opacity: { light: 1, dark: 1 },
    position: 'fill',
    resizeMode: 'cover',
    anchor: 'top',
    accessibilityHidden: true,
  },
  authFeather: {
    light: spiritualAssetFiles.featherLight,
    dark: spiritualAssetFiles.featherDark,
    width: 92,
    height: 138,
    opacity: { light: 0.8, dark: 0.75 },
    position: 'topRight',
    resizeMode: 'contain',
    accessibilityHidden: true,
  },
  verseKrishna: {
    light: spiritualAssetFiles.krishnaArtLight,
    dark: spiritualAssetFiles.krishnaArtDark,
    width: 158,
    height: 190,
    opacity: { light: 0.24, dark: 0.3 },
    position: 'bottomRightInset',
    resizeMode: 'contain',
    accessibilityHidden: true,
  },
  /**
   * Tab bar lotus — ideal source export: 1200×200 px (6:1), lotus centered.
   * Tall square sources still work via coverScale vertical crop.
   */
  navLotusBg: {
    light: spiritualAssetFiles.navLotusBgLight,
    dark: spiritualAssetFiles.navLotusBgDark,
    width: '100%',
    height: '100%',
    opacity: { light: 0.5, dark: 0.58 },
    position: 'fill',
    resizeMode: 'cover',
    anchor: 'center',
    coverScale: 4.2,
    accessibilityHidden: true,
  },
  /** Warm saffron lotus — practice / verse card watermark. */
  mandalaPrimary: {
    light: spiritualAssetFiles.mandala1,
    dark: spiritualAssetFiles.mandala1,
    width: '100%',
    height: '100%',
    opacity: { light: 0.1, dark: 0.16 },
    position: 'fill',
    resizeMode: 'contain',
    anchor: 'center',
    accessibilityHidden: true,
  },
  /** Fine gold filigree — Gita explore / chapter accents. */
  mandalaGold: {
    light: spiritualAssetFiles.mandala2,
    dark: spiritualAssetFiles.mandala2,
    width: '78%',
    height: '78%',
    opacity: { light: 0.09, dark: 0.14 },
    position: 'center',
    resizeMode: 'contain',
    accessibilityHidden: true,
  },
  /** Dense seal — compact entry cards / corners. */
  mandalaSeal: {
    light: spiritualAssetFiles.mandala3,
    dark: spiritualAssetFiles.mandala3,
    width: 96,
    height: 96,
    opacity: { light: 0.18, dark: 0.26 },
    position: 'bottomRight',
    resizeMode: 'contain',
    accessibilityHidden: true,
  },
  /** Soft ethereal wash — full-screen / profile backdrop. */
  mandalaWash: {
    light: spiritualAssetFiles.mandala4,
    dark: spiritualAssetFiles.mandala4,
    width: '100%',
    height: '100%',
    opacity: { light: 0.07, dark: 0.12 },
    position: 'fill',
    resizeMode: 'contain',
    anchor: 'center',
    accessibilityHidden: true,
  },
  /** Festive vermillion/gold — aarti & celebration moments. */
  mandalaFestive: {
    light: spiritualAssetFiles.mandala5,
    dark: spiritualAssetFiles.mandala5,
    width: 160,
    height: 160,
    opacity: { light: 0.16, dark: 0.24 },
    position: 'topRight',
    resizeMode: 'contain',
    accessibilityHidden: true,
  },
};

export function resolveSpiritualAssetSource(
  slot: SpiritualAssetSlot,
  isDark: boolean
): ImageSourcePropType {
  const config = spiritualAssetSlots[slot];
  return isDark ? config.dark : config.light;
}

export function resolveAssetPosition(
  position: SpiritualAssetSlotConfig['position']
): Pick<ViewStyle, 'position' | 'top' | 'right' | 'bottom' | 'left' | 'alignSelf'> {
  switch (position) {
    case 'center':
      return { alignSelf: 'center' };
    case 'topRight':
      return { position: 'absolute', top: 0, right: 0 };
    case 'bottomRight':
      return { position: 'absolute', bottom: 0, right: 0 };
    case 'bottomRightInset':
      return { position: 'absolute', bottom: 4, right: 0 };
    case 'fill':
      return { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 };
    default:
      return {};
  }
}

export function resolveAssetDimensions(
  width: SpiritualAssetSlotConfig['width'],
  height: SpiritualAssetSlotConfig['height']
): Pick<ImageStyle, 'width' | 'height'> {
  if (positionUsesFill(width, height)) {
    return { width: '100%', height: '100%' };
  }
  if (typeof width === 'string') {
    return { width, height: height as number | `${number}%` };
  }
  return { width, height: height as number };
}

function positionUsesFill(
  width: SpiritualAssetSlotConfig['width'],
  height: SpiritualAssetSlotConfig['height']
): boolean {
  return width === '100%' && height === '100%';
}

export const spiritualDesignTokens = {
  canvas: {
    light: brandPalette.background,
    dark: brandPalette.backgroundDark,
  },
  elevated: {
    light: '#FFFBF7',
    dark: '#332A24',
  },
  verseSurface: {
    light: brandPalette.verseCard,
    dark: brandPalette.verseCardDark,
  },
  ornament: brandPalette.gold,
  ornamentLight: brandPalette.goldLight,
  devotional: {
    light: brandPalette.devotionalBrown,
    dark: brandPalette.devotionalBrownDark,
  },
  tabBar: {
    background: brandPalette.iconBackground,
    border: '#4A3728',
    active: brandPalette.goldLight,
    inactive: '#A89B94',
  },
  radius: {
    sm: 10,
    md: 14,
    lg: 20,
    xl: 24,
  },
  spacing: {
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  contentMaxWidth: 520,
  /** Soft screen/card wash — use once; avoid stacking opacity wrappers. */
  washOpacity: {
    screen: 0.07,
    screenDark: 0.12,
    empty: 0.1,
    error: 0.06,
  },
  /** Home peacock feather bridge over practice card. */
  featherBridge: {
    bottom: -72,
    width: 110,
    height: 170,
    rightBleed: -4,
  },
  /**
   * Bottom-only temple blend. A blurred copy is revealed through a continuous
   * alpha ramp, so the image becomes gently misted instead of forming a strip.
   */
  heroTempleBlend: {
    home: {
      blurRadius: 6,
      maskStart: 0.5,
      maskMid: 0.78,
      midOpacity: 0.3,
      bottomOpacity: 0.82,
      reflectionRatio: 0.2,
      reflectionMinHeight: 44,
      reflectionMaxHeight: 56,
    },
    auth: {
      blurRadius: 5,
      maskStart: 0.54,
      maskMid: 0.8,
      midOpacity: 0.26,
      bottomOpacity: 0.76,
      reflectionRatio: 0.2,
      reflectionMinHeight: 36,
      reflectionMaxHeight: 48,
    },
    /** Reflection alpha ramp: previous +20%, then another +15%. */
    reflectionOpacity: {
      top: 0.2484,
      middle: 0.1656,
      lower: 0.0552,
    },
    /** Light canvas needs more image presence; dark mode remains restrained. */
    reflectionMode: {
      light: {
        visibilityMultiplier: 1.4,
        canvasFadeMiddleOpacity: 0.22,
        canvasFadeMiddleLocation: 0.72,
      },
      dark: {
        visibilityMultiplier: 1,
        canvasFadeMiddleOpacity: 0.4,
        canvasFadeMiddleLocation: 0.62,
      },
    },
    /** Tiny image-to-reflection bleed; net layout extension remains unchanged. */
    reflectionSeamOverlap: 2,
    reflectionBands: [
      { start: 0, end: 0.4, blurRadius: 3, xOffset: -0.5 },
      { start: 0.36, end: 0.73, blurRadius: 6, xOffset: 1.25 },
      { start: 0.69, end: 1, blurRadius: 10, xOffset: -1.75 },
    ],
  },
  /** Krishna watermark clip (slightly larger than slot for soft crop). */
  krishnaClip: {
    widthPad: 14,
    heightPad: 38,
    rightBleed: -4,
    gradientWidth: 130,
    gradientLeft: -28,
  },
} as const;

export type SpiritualDesignTokens = typeof spiritualDesignTokens;

/** Recommended nav-lotus export size (width × height). */
export const NAV_LOTUS_EXPORT_SIZE = { width: 1200, height: 200 } as const;
export const SPIRITUAL_ASSET_FILENAMES = [
  'temple-hero-light.png',
  'temple-hero-dark.png',
  'feather-light.png',
  'feather-dark.png',
  'lotus-divider-light.png',
  'lotus-divider-dark.png',
  'krishna-art-light.png',
  'krishna-art-dark.png',
  'nav-lotus-bg-light.png',
  'nav-lotus-bg-dark.png',
  'mandala-1.png',
  'mandala-2.png',
  'mandala-3.png',
  'mandala-4.png',
  'mandala-5.png',
] as const;
