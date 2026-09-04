import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { SpiritualSurface, SpiritualSurfaceBody } from '@/components/spiritual/spiritual-surface';
import { AppText } from '@/components/ui/app-text';
import { useAppColors } from '@/hooks/use-app-colors';
import { triggerHaptic } from '@/lib/haptics';
import { useLocale } from '@/providers/locale-provider';

/** Compact home entry that opens the full Gita explore screen. */
export function GitaExploreEntry() {
  const { t } = useLocale();
  const colors = useAppColors();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        void triggerHaptic('selection');
        router.push('/(user)/gita' as never);
      }}
      className="mt-8">
      <SpiritualSurface variant="elevated" withMandala>
        <SpiritualSurfaceBody className="py-4">
          <View className="flex-row items-center gap-3">
            <View className="h-12 w-12 items-center justify-center rounded-2xl bg-saffron/12 dark:bg-gold/15">
              <Ionicons name="book-outline" size={24} color={colors.saffron} />
            </View>
            <View className="min-w-0 flex-1 pr-8">
              <AppText bold className="text-base text-gp-text dark:text-gp-text-dark">
                {t('gitaExploreTitle')}
              </AppText>
              <AppText className="mt-1 text-sm leading-5 text-gp-muted dark:text-gp-muted-dark" numberOfLines={2}>
                {t('gitaExploreSubtitle')}
              </AppText>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.placeholder} />
          </View>
          <View className="mt-3 self-start rounded-full bg-saffron/10 px-3 py-1.5 dark:bg-gold/15">
            <AppText bold className="text-xs text-saffron dark:text-gold">
              {t('gitaExploreOpen')}
            </AppText>
          </View>
        </SpiritualSurfaceBody>
      </SpiritualSurface>
    </Pressable>
  );
}
