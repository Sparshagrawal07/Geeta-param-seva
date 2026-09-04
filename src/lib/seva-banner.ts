import type { SevaBanner } from '@/types/feed';

export const DEFAULT_BANNER_BACKGROUND = '#9B8B7E';
export const DEFAULT_BANNER_TEXT_SCALE = 1;
export const MIN_BANNER_TEXT_SCALE = 0.7;
export const MAX_BANNER_TEXT_SCALE = 1.4;

/** Ten most-used seva banner backgrounds (readable with white text) */
export const BANNER_COLOR_PRESETS = [
  '#9B8B7E',
  '#8B7355',
  '#6B5344',
  '#7D6B5D',
  '#A67C00',
  '#5C4033',
  '#800020',
  '#704214',
  '#355E3B',
  '#4A3728',
] as const;

/** HSL used when picking a custom hue — keeps white text readable */
export const CUSTOM_BANNER_SATURATION = 38;
export const CUSTOM_BANNER_LIGHTNESS = 42;

export function createEmptySevaBanner(overrides?: Partial<SevaBanner>): SevaBanner {
  return {
    backgroundColor: DEFAULT_BANNER_BACKGROUND,
    textScale: DEFAULT_BANNER_TEXT_SCALE,
    salutation: '',
    serviceLine: '',
    name: '',
    gotra: '',
    age: '',
    location: '',
    ...overrides,
  };
}

export function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  const match = trimmed.match(/^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/);
  if (!match) {
    return null;
  }

  let hex = match[1].toUpperCase();
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((char) => char + char)
      .join('');
  }

  return `#${hex}`;
}

export function isPresetBannerColor(color: string): boolean {
  const normalized = normalizeHexColor(color);
  if (!normalized) {
    return false;
  }
  return BANNER_COLOR_PRESETS.some((preset) => preset.toUpperCase() === normalized);
}

export function clampBannerTextScale(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return DEFAULT_BANNER_TEXT_SCALE;
  }
  return Math.min(MAX_BANNER_TEXT_SCALE, Math.max(MIN_BANNER_TEXT_SCALE, numeric));
}

export function hslToHex(h: number, s: number, l: number): string {
  const saturation = s / 100;
  const lightness = l / 100;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const huePrime = h / 60;
  const x = chroma * (1 - Math.abs((huePrime % 2) - 1));

  let r = 0;
  let g = 0;
  let b = 0;

  if (huePrime >= 0 && huePrime < 1) {
    r = chroma;
    g = x;
  } else if (huePrime >= 1 && huePrime < 2) {
    r = x;
    g = chroma;
  } else if (huePrime >= 2 && huePrime < 3) {
    g = chroma;
    b = x;
  } else if (huePrime >= 3 && huePrime < 4) {
    g = x;
    b = chroma;
  } else if (huePrime >= 4 && huePrime < 5) {
    r = x;
    b = chroma;
  } else {
    r = chroma;
    b = x;
  }

  const m = lightness - chroma / 2;
  const toByte = (channel: number) => Math.round((channel + m) * 255);

  const hex = [toByte(r), toByte(g), toByte(b)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();

  return `#${hex}`;
}

export function hexToHue(hex: string): number {
  const normalized = normalizeHexColor(hex);
  if (!normalized) {
    return 30;
  }

  const value = normalized.slice(1);
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  if (delta === 0) {
    return 30;
  }

  let hue = 0;
  if (max === r) {
    hue = ((g - b) / delta) % 6;
  } else if (max === g) {
    hue = (b - r) / delta + 2;
  } else {
    hue = (r - g) / delta + 4;
  }

  hue *= 60;
  if (hue < 0) {
    hue += 360;
  }

  return hue;
}

export function customBannerColorFromHue(hue: number): string {
  return hslToHex(hue, CUSTOM_BANNER_SATURATION, CUSTOM_BANNER_LIGHTNESS);
}

export function getSevaBannerLines(banner: SevaBanner): string[] {
  return [
    banner.salutation,
    banner.serviceLine,
    banner.name,
    banner.gotra,
    banner.age,
    banner.location,
  ]
    .map((line) => line.trim())
    .filter(Boolean);
}

export function hasSevaBannerContent(banner: SevaBanner | null | undefined): boolean {
  if (!banner) {
    return false;
  }
  return getSevaBannerLines(banner).length > 0;
}

export function getSevaBannerTextMetrics(
  lineCount: number,
  compact = false,
  textScale = DEFAULT_BANNER_TEXT_SCALE
) {
  let base: { fontSize: number; lineHeight: number };

  if (lineCount <= 2) {
    base = compact ? { fontSize: 15, lineHeight: 22 } : { fontSize: 24, lineHeight: 34 };
  } else if (lineCount <= 4) {
    base = compact ? { fontSize: 13, lineHeight: 19 } : { fontSize: 20, lineHeight: 30 };
  } else if (lineCount <= 5) {
    base = compact ? { fontSize: 12, lineHeight: 17 } : { fontSize: 18, lineHeight: 28 };
  } else {
    base = compact ? { fontSize: 11, lineHeight: 15 } : { fontSize: 16, lineHeight: 24 };
  }

  const scale = clampBannerTextScale(textScale);
  return {
    fontSize: Math.round(base.fontSize * scale),
    lineHeight: Math.round(base.lineHeight * scale),
  };
}

export function mapSevaBannerFromData(data: unknown): SevaBanner | undefined {
  if (!data || typeof data !== 'object') {
    return undefined;
  }

  const record = data as Record<string, unknown>;
  const hasAnyField =
    'backgroundColor' in record ||
    'salutation' in record ||
    'serviceLine' in record ||
    'name' in record;

  if (!hasAnyField) {
    return undefined;
  }

  const backgroundColor =
    normalizeHexColor(String(record.backgroundColor ?? '')) ?? DEFAULT_BANNER_BACKGROUND;

  return {
    backgroundColor,
    textScale: clampBannerTextScale(record.textScale),
    salutation: String(record.salutation ?? ''),
    serviceLine: String(record.serviceLine ?? ''),
    name: String(record.name ?? ''),
    gotra: String(record.gotra ?? ''),
    age: String(record.age ?? ''),
    location: String(record.location ?? ''),
  };
}
