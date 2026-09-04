import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { type Locale } from '@/lib/i18n/messages';
import { triggerHaptic } from '@/lib/haptics';
import { useLocale } from '@/providers/locale-provider';

function ToggleOption({
  label,
  active,
  onPress,
  bold,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  bold?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      className={`min-w-[52px] items-center rounded-lg px-4 py-2.5 ${active ? 'bg-saffron' : ''}`}
      onPress={onPress}>
      <AppText
        bold={bold || active}
        className={`text-base leading-6 ${active ? 'text-white' : 'text-gp-muted dark:text-gp-muted-dark'}`}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function LanguageToggle() {
  const { locale, setLocale, isTranslating } = useLocale();

  const select = (nextLocale: Locale) => {
    if (nextLocale !== locale) {
      void triggerHaptic('selection');
      setLocale(nextLocale);
    }
  };

  return (
    <View className="items-end gap-1">
      <View className="flex-row self-end rounded-xl border border-gp-border bg-gp-card p-1.5 dark:border-gp-border-dark dark:bg-gp-card-dark">
        <ToggleOption label="EN" active={locale === 'en'} onPress={() => select('en')} />
        <ToggleOption label="हिं" active={locale === 'hi'} onPress={() => select('hi')} bold />
      </View>
      {isTranslating ? (
        <AppText className="text-xs text-gp-muted dark:text-gp-muted-dark">…</AppText>
      ) : null}
    </View>
  );
}
