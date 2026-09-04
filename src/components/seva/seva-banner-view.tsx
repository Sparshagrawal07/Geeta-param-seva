import { useMemo } from 'react';
import { Text, View, type ViewStyle } from 'react-native';

import { getSevaBannerLines, getSevaBannerTextMetrics } from '@/lib/seva-banner';
import { useTranslatedTexts } from '@/hooks/use-translated-content';
import { useLocale } from '@/providers/locale-provider';
import type { SevaBanner } from '@/types/feed';

const DEVANAGARI_REGULAR = 'NotoSansDevanagari_400Regular';
const DEVANAGARI_BOLD = 'NotoSansDevanagari_700Bold';

function containsDevanagari(text: string) {
  return /[\u0900-\u097F]/.test(text);
}

interface SevaBannerViewProps {
  banner: SevaBanner;
  compact?: boolean;
  style?: ViewStyle;
}

export function SevaBannerView({ banner, compact = false, style }: SevaBannerViewProps) {
  const { locale } = useLocale();
  const lines = getSevaBannerLines(banner);
  const translationCandidates = useMemo(
    () => lines.map((line) => (containsDevanagari(line) ? '' : line)),
    [lines]
  );
  const translatedCandidates = useTranslatedTexts(translationCandidates);
  const displayLines = useMemo(
    () =>
      lines.map((line, index) => {
        if (locale === 'en' || containsDevanagari(line)) {
          return line;
        }

        const translated = translatedCandidates[index]?.trim();
        return translated || line;
      }),
    [lines, locale, translatedCandidates]
  );
  const displayLineCount = Math.max(lines.length, 1);
  const { fontSize, lineHeight } = getSevaBannerTextMetrics(
    displayLineCount,
    compact,
    banner.textScale
  );
  const useDevanagari = locale === 'hi';

  return (
    <View
      style={[
        {
          width: '100%',
          aspectRatio: 1,
          backgroundColor: banner.backgroundColor,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: compact ? 14 : 24,
          paddingVertical: compact ? 14 : 24,
        },
        style,
      ]}>
      {lines.length === 0 ? (
        <Text
          style={{
            color: 'rgba(255,255,255,0.55)',
            fontSize,
            lineHeight,
            textAlign: 'center',
            ...(useDevanagari ? { fontFamily: DEVANAGARI_REGULAR } : {}),
          }}>
          —
        </Text>
      ) : (
        displayLines.map((line, index) => {
          const isNameLine = lines[index] === banner.name.trim() && banner.name.trim().length > 0;
          const lineFontSize = isNameLine ? fontSize + (compact ? 1 : 2) : fontSize;
          const lineLineHeight = isNameLine ? lineHeight + (compact ? 2 : 4) : lineHeight;

          return (
            <Text
              key={`${index}-${line}`}
              style={{
                color: '#FFFFFF',
                fontSize: lineFontSize,
                lineHeight: lineLineHeight,
                textAlign: 'center',
                width: '100%',
                fontWeight: isNameLine ? '700' : '400',
                ...(useDevanagari
                  ? { fontFamily: isNameLine ? DEVANAGARI_BOLD : DEVANAGARI_REGULAR }
                  : {}),
              }}>
              {line}
            </Text>
          );
        })
      )}
    </View>
  );
}
