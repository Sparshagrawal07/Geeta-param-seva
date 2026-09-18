import { brandPalette } from '@/lib/brand-palette';

/**
 * Visual Composition System tokens.
 * Temple heroes are transparent environmental PNGs — compose, don’t “box” them.
 */
export const visualTokens = {
  hero: {
    maxHeight: 430,
    minHeight: 300,
    /** Auth hero can sit shorter while still bridging into the emblem. */
    authMinHeight: 260,
    authMaxHeight: 380,

    horizontalBleed: 0,
    verticalOffset: -12,

    imageOpacity: 0.96,
    /** Asset intrinsic aspect (temple-hero-* @ 1672×941). */
    aspectRatio: 1672 / 941,

    /** Soft bottom dissolve stops (0–1 along hero height). */
    fadeStart: 0.52,
    fadeMid: 0.72,
    fadeLate: 0.88,
    fadeEnd: 1,

    focalPointX: 0.68,
    focalPointY: 0.46,

    /** How far the dissolve may spill under following content. */
    spill: 36,

    contentSafeTop: 72,
    contentSafeBottom: 36,

    /** Subtle entrance — alive, not looping. */
    enterDuration: 380,
    enterScaleFrom: 1.015,
  },

  atmosphere: {
    overlayOpacity: 0.14,
    glowOpacity: 0.08,
    backgroundBlendOpacity: 0.72,
    /** Left-side text veil strength (home greeting). */
    textVeilOpacity: 0.22,
  },

  /** Harmonize with existing brand — do not replace the app palette. */
  harmony: {
    dark: {
      glow: brandPalette.devotionalBrownDark,
      veil: '13, 10, 9',
    },
    light: {
      glow: brandPalette.devotionalBrown,
      veil: '80, 58, 40',
    },
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
    hero: 40,
  },

  radius: {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
  },
} as const;

export type VisualTokens = typeof visualTokens;
