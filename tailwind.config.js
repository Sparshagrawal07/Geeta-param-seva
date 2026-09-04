const brandPalette = require('./brand-palette.js');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        /** Dynamic accent — set `--color-accent` (RGB channels) from ThemeProvider */
        saffron: {
          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
          dark: 'rgb(var(--color-accent) / <alpha-value>)',
          light: 'rgb(var(--color-accent) / <alpha-value>)',
        },
        gp: {
          bg: brandPalette.background,
          'bg-dark': brandPalette.backgroundDark,
          card: brandPalette.card,
          'card-dark': brandPalette.cardDark,
          border: brandPalette.border,
          'border-dark': brandPalette.borderDark,
          text: brandPalette.text,
          'text-dark': brandPalette.textDark,
          muted: brandPalette.muted,
          'muted-dark': brandPalette.mutedDark,
          notice: '#F0E4DA',
          'notice-dark': '#352E28',
          verse: brandPalette.verseCard,
          'verse-dark': brandPalette.verseCardDark,
          devotional: brandPalette.devotionalBrown,
          'devotional-dark': brandPalette.devotionalBrownDark,
          gold: brandPalette.gold,
          'gold-light': brandPalette.goldLight,
          tab: brandPalette.iconBackground,
        },
        gold: {
          DEFAULT: brandPalette.gold,
          light: brandPalette.goldLight,
        },
        destructive: {
          DEFAULT: '#DC2626',
          dark: '#EF4444',
          foreground: '#FFFFFF',
          muted: '#FEE2E2',
          'muted-dark': '#450A0A',
          border: '#FECACA',
          'border-dark': '#991B1B',
          text: '#B91C1C',
          'text-dark': '#FCA5A5',
        },
        success: {
          DEFAULT: '#16A34A',
          dark: '#22C55E',
          muted: '#DCFCE7',
          'muted-dark': '#14532D',
          text: '#15803D',
          'text-dark': '#86EFAC',
        },
      },
    },
  },
  plugins: [
    ({ addBase }) =>
      addBase({
        ':root': {
          // Default brand saffron (#A67C00) until ThemeProvider hydrates accent
          '--color-accent': '166 124 0',
        },
      }),
  ],
};
