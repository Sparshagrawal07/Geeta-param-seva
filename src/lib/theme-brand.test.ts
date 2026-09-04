import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { brandPalette } from '@/lib/brand-palette';
import { ACCENTS, buildThemeColors, DEFAULT_ACCENT } from '@/lib/theme';

const ROOT = path.resolve(__dirname, '../..');

function isHexColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

function relativeLuminance(hex: string): number {
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const transformed = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * transformed[0] + 0.7152 * transformed[1] + 0.0722 * transformed[2];
}

function contrastRatio(foreground: string, background: string): number {
  const l1 = relativeLuminance(foreground);
  const l2 = relativeLuminance(background);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('brand palette', () => {
  it('defines valid hex colors', () => {
    for (const value of Object.values(brandPalette)) {
      expect(isHexColor(value)).toBe(true);
    }
  });

  it('uses warm cream background and deep text', () => {
    expect(brandPalette.background).toBe('#F5EDE6');
    expect(brandPalette.text).toBe('#2B221E');
  });
});

describe('buildThemeColors', () => {
  it('uses brand primary for default saffron accent in light mode', () => {
    const colors = buildThemeColors('light', 'saffron');
    expect(colors.saffron).toBe(brandPalette.primary);
    expect(colors.background).toBe(brandPalette.background);
  });

  it('uses brand primary dark variant in dark mode', () => {
    const colors = buildThemeColors('dark', 'saffron');
    expect(colors.saffron).toBe(brandPalette.primaryDark);
    expect(colors.background).toBe(brandPalette.backgroundDark);
  });

  it('defaults accent to saffron brand primary', () => {
    expect(DEFAULT_ACCENT).toBe('saffron');
    expect(ACCENTS.saffron.light).toBe(brandPalette.primary);
  });

  it('meets contrast threshold for primary on white', () => {
    expect(contrastRatio(brandPalette.primary, '#FFFFFF')).toBeGreaterThan(3);
  });

  it('meets contrast threshold for body text on card background', () => {
    expect(contrastRatio(brandPalette.text, brandPalette.card)).toBeGreaterThan(4);
  });

  it('meets contrast threshold for primary on dark background', () => {
    expect(contrastRatio(brandPalette.primaryDark, brandPalette.backgroundDark)).toBeGreaterThan(3);
  });
  it('exposes semantic devotional tokens', () => {
    const colors = buildThemeColors('light', 'saffron');
    expect(colors.spiritualAccent).toBe(brandPalette.primary);
    expect(colors.cardElevated).toBe('#FFFBF7');
    expect(colors.radiusMd).toBe(14);
  });
});

describe('tailwind sync', () => {
  it('matches saffron and gp tokens to brand palette', () => {
    const tailwind = readFileSync(path.join(ROOT, 'tailwind.config.js'), 'utf8');
    expect(tailwind).toContain(`rgb(var(--color-accent) / <alpha-value>)`);
    expect(tailwind).toContain(`'--color-accent': '166 124 0'`);
    expect(tailwind).toContain(`bg: brandPalette.background`);
    expect(tailwind).toContain(`text: brandPalette.text`);
  });

  it('app config uses brand palette for splash and adaptive icon', () => {
    const appConfig = readFileSync(path.join(ROOT, 'app.config.js'), 'utf8');
    expect(appConfig).toContain("require('./brand-palette.js')");
    expect(appConfig).toContain('brandPalette.iconBackground');
    expect(appConfig).toContain('brandPalette.primary');
  });

  it('exposes icon background matching Android adaptive master', () => {
    expect(brandPalette.iconBackground).toBe('#28140a');
  });
});
