import { brandPalette } from '@/lib/brand-palette';

export type ThemeMode = 'system' | 'light' | 'dark';
/** Spiritual brand uses fixed saffron/gold accent only */
export type AccentId = 'saffron';
export type ResolvedScheme = 'light' | 'dark';

export const ACCENTS = {
  saffron: {
    id: 'saffron' as const,
    label: 'Gold',
    light: brandPalette.primary,
    dark: brandPalette.primaryDark,
    onAccent: '#FFFFFF',
  },
};

const base = {
  light: {
    background: brandPalette.background,
    placeholder: brandPalette.muted,
    gpText: brandPalette.text,
    gpCard: brandPalette.card,
    gpBorder: brandPalette.border,
    tabBar: brandPalette.iconBackground,
    tabInactive: brandPalette.muted,
    destructiveBg: '#DC2626',
    destructiveFg: '#FFFFFF',
    destructiveMutedBg: '#FEE2E2',
    destructiveBorder: '#FECACA',
    destructiveText: '#B91C1C',
    successText: '#15803D',
  },
  dark: {
    background: brandPalette.backgroundDark,
    placeholder: brandPalette.mutedDark,
    gpText: brandPalette.textDark,
    gpCard: brandPalette.cardDark,
    gpBorder: brandPalette.borderDark,
    tabBar: brandPalette.iconBackground,
    tabInactive: '#A89B94',
    destructiveBg: '#EF4444',
    destructiveFg: '#FFFFFF',
    destructiveMutedBg: '#450A0A',
    destructiveBorder: '#991B1B',
    destructiveText: '#FCA5A5',
    successText: '#86EFAC',
  },
} as const;

export function resolveScheme(
  mode: ThemeMode,
  systemScheme: 'light' | 'dark' | 'unspecified' | null | undefined
): ResolvedScheme {
  if (mode === 'light') return 'light';
  if (mode === 'dark') return 'dark';
  return systemScheme === 'dark' ? 'dark' : 'light';
}

export function hexToRgbChannels(hex: string): string {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return '166 124 0';
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

export function buildThemeColors(scheme: ResolvedScheme, _accentId: AccentId = 'saffron') {
  const accent = ACCENTS.saffron;
  const saffron = scheme === 'dark' ? accent.dark : accent.light;
  const spiritualAccent = scheme === 'dark' ? brandPalette.goldLight : brandPalette.primary;
  return {
    ...base[scheme],
    saffron,
    accent: saffron,
    gold: brandPalette.gold,
    goldLight: brandPalette.goldLight,
    onAccent: accent.onAccent,
    accentId: accent.id,
    accentRgb: hexToRgbChannels(saffron),
    spiritualAccent,
    verseText: scheme === 'dark' ? brandPalette.textDark : brandPalette.text,
    greeting: spiritualAccent,
    cardElevated: scheme === 'dark' ? '#332A24' : '#FFFBF7',
    verseSurface: scheme === 'dark' ? brandPalette.verseCardDark : brandPalette.verseCard,
    devotional: scheme === 'dark' ? brandPalette.devotionalBrownDark : brandPalette.devotionalBrown,
    radiusSm: 10,
    radiusMd: 14,
    radiusLg: 20,
    radiusXl: 24,
    spacingSm: 8,
    spacingMd: 16,
    spacingLg: 24,
    contentMaxWidth: 520,
  };
}

export type ThemeColors = ReturnType<typeof buildThemeColors>;

export { THEME_STORAGE_KEY } from '@/lib/session';
export const DEFAULT_THEME_MODE: ThemeMode = 'system';
export const DEFAULT_ACCENT: AccentId = 'saffron';
