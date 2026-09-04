import { Text, type TextProps, type TextStyle } from 'react-native';
import type { ReactNode } from 'react';

import { useLocale } from '@/providers/locale-provider';

const DEVANAGARI_REGULAR = 'NotoSansDevanagari_400Regular';
const DEVANAGARI_BOLD = 'NotoSansDevanagari_700Bold';
const DISPLAY_FONT = 'SplineSans_700Bold';
const DISPLAY_FONT_MEDIUM = 'SplineSans_600SemiBold';

/** Optical size boost — Devanagari reads smaller than Latin at the same px. */
const HI_SIZE_BOOST = 1.08;

interface AppTextProps extends TextProps {
  className?: string;
  bold?: boolean;
  variant?: 'body' | 'display' | 'greeting' | 'verse' | 'caption';
  children?: ReactNode;
}

export type { AppTextProps };

function boostHiClassName(className: string | undefined): string | undefined {
  if (!className) return className;
  return className
    .replace(/\btext-xs\b/g, 'text-[13px]')
    .replace(/\btext-sm\b/g, 'text-[15px]')
    .replace(/\btext-base\b/g, 'text-[17px]')
    .replace(/\btext-lg\b/g, 'text-[20px]')
    .replace(/\btext-xl\b/g, 'text-[22px]')
    .replace(/\btext-2xl\b/g, 'text-[26px]')
    .replace(/\btext-3xl\b/g, 'text-[32px]');
}

function scaleFontSize(style: TextStyle, boost: number): TextStyle {
  const next: TextStyle = { ...style };
  if (typeof style.fontSize === 'number') {
    next.fontSize = Math.round(style.fontSize * boost * 10) / 10;
  }
  if (typeof style.lineHeight === 'number') {
    next.lineHeight = Math.round(style.lineHeight * boost * 10) / 10;
  }
  return next;
}

export function AppText({ className, bold, variant = 'body', style, ...props }: AppTextProps) {
  const { locale } = useLocale();
  const useDevanagari = locale === 'hi';

  const variantStyle: TextStyle | undefined =
    variant === 'display'
      ? { fontFamily: DISPLAY_FONT, letterSpacing: 0.3, fontSize: 28, lineHeight: 34 }
      : variant === 'greeting'
        ? { fontFamily: useDevanagari ? DEVANAGARI_BOLD : DISPLAY_FONT_MEDIUM, letterSpacing: 0.2 }
        : variant === 'verse'
          ? { lineHeight: 32, fontSize: 18 }
          : variant === 'caption'
            ? { fontSize: 13, lineHeight: 18, opacity: 0.85 }
            : undefined;

  const resolvedVariant =
    useDevanagari && variantStyle ? scaleFontSize(variantStyle, HI_SIZE_BOOST) : variantStyle;

  return (
    <Text
      className={useDevanagari ? boostHiClassName(className) : className}
      style={[
        useDevanagari && {
          fontFamily: bold || variant === 'greeting' ? DEVANAGARI_BOLD : DEVANAGARI_REGULAR,
        },
        resolvedVariant,
        { includeFontPadding: true },
        style,
      ]}
      {...props}
    />
  );
}
