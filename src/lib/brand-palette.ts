/** Brand colors sampled from the seal in assets/images/icons — single source for theme + native config. */
export const brandPalette = {
  primary: '#A67C00',
  primaryDark: '#E0C35A',
  background: '#F5EDE6',
  backgroundDark: '#1A1412',
  /** Native icon / splash plate (matches Android adaptive background) */
  iconBackground: '#28140a',
  text: '#2B221E',
  textDark: '#F5EDE8',
  muted: '#6B5B52',
  mutedDark: '#B8A89E',
  border: '#D9C4B0',
  borderDark: '#4A4038',
  card: '#FFFFFF',
  cardDark: '#2A2420',
  /** Devotional home — warm cream verse card surface */
  verseCard: '#FDF8F2',
  verseCardDark: '#2E2620',
  /** Deep brown tab bar / primary CTA gradient end */
  devotionalBrown: '#5D4037',
  devotionalBrownDark: '#3D2B1F',
  gold: '#D4AF37',
  goldLight: '#E8C547',
} as const;

export type BrandPalette = typeof brandPalette;
