import { startTransition } from 'react';
import { View } from 'react-native';
import SegmentedControl from '@react-native-segmented-control/segmented-control';

import { useAppColors } from '@/hooks/use-app-colors';
import { type Locale } from '@/lib/i18n/messages';
import { triggerHaptic } from '@/lib/haptics';
import { useLocale } from '@/providers/locale-provider';

const VALUES = ['EN', 'हिं'] as const;

/**
 * iOS: real UISegmentedControl with selectedSegmentTintColor = saffron.
 * (@expo/ui SwiftUI Picker ignores tint on segmented style — this package does not.)
 */
export function LanguageToggle() {
  const { locale, setLocale } = useLocale();
  const { isDark, saffron, gpCard, placeholder } = useAppColors();

  const select = (nextLocale: Locale) => {
    if (nextLocale === locale) return;
    void triggerHaptic('selection');
    startTransition(() => {
      setLocale(nextLocale);
    });
  };

  return (
    <View accessibilityRole="tablist" accessibilityLabel="Language">
      <SegmentedControl
        values={[...VALUES]}
        selectedIndex={locale === 'hi' ? 1 : 0}
        onChange={(event) => {
          select(event.nativeEvent.selectedSegmentIndex === 1 ? 'hi' : 'en');
        }}
        tintColor={saffron}
        backgroundColor={gpCard}
        appearance={isDark ? 'dark' : 'light'}
        fontStyle={{
          color: placeholder,
          fontSize: 13,
          fontWeight: '600',
        }}
        activeFontStyle={{
          color: '#FFFFFF',
          fontSize: 13,
          fontWeight: '700',
        }}
        style={{ width: 118, height: 32 }}
      />
    </View>
  );
}
