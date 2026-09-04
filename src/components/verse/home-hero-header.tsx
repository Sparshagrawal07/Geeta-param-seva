import type { ReactNode } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SpiritualAssetImage } from '@/components/spiritual/spiritual-asset-image';
import { LotusDivider } from '@/components/verse/lotus-divider';
import { AppText } from '@/components/ui/app-text';
import { FadeInView } from '@/components/ui/fade-in-view';
import { useAppColors } from '@/hooks/use-app-colors';
import { brandPalette } from '@/lib/brand-palette';
import { useLocale } from '@/providers/locale-provider';

const GREETING_SECONDARY_KEYS = [
  'greetingSecondary1',
  'greetingSecondary2',
  'greetingSecondary3',
] as const;

function pickSecondaryKey(name: string) {
  return GREETING_SECONDARY_KEYS[name.length % GREETING_SECONDARY_KEYS.length];
}

interface HomeHeroHeaderProps {
  name: string;
  showNotificationBell?: boolean;
  /** Optional top-right control (e.g. admin settings). */
  rightAction?: ReactNode;
}

function HeroScrim({ isDark }: { isDark: boolean }) {
  const colors = isDark
    ? ([
        'rgba(13,10,9,0.05)',
        'rgba(13,10,9,0.35)',
        'rgba(26,20,18,0.78)',
        brandPalette.backgroundDark,
      ] as const)
    : ([
        'rgba(0,0,0,0.08)',
        'rgba(0,0,0,0.18)',
        'rgba(245,237,230,0.82)',
        brandPalette.background,
      ] as const);

  return (
    <LinearGradient
      colors={[...colors]}
      locations={[0, 0.38, 0.72, 1]}
      className="absolute inset-0"
      pointerEvents="none"
    />
  );
}

export function HomeHeroHeader({
  name,
  showNotificationBell = true,
  rightAction,
}: HomeHeroHeaderProps) {
  const { t } = useLocale();
  const { isDark } = useAppColors();
  const insets = useSafeAreaInsets();
  const displayName = name.trim() || t('welcome');
  const secondaryKey = pickSecondaryKey(displayName);
  const topPad = Math.max(insets.top, 8);

  return (
    <View className="mb-0 overflow-hidden">
      <View className="relative min-h-[248px] px-5 pb-5" style={{ paddingTop: topPad }}>
        <SpiritualAssetImage slot="heroTemple" />
        <HeroScrim isDark={isDark} />

        <View className="relative z-10 flex-row items-start justify-end gap-2">
          {rightAction}
          {showNotificationBell ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('notificationsTitle')}
              onPress={() => router.push('/(user)/notifications' as never)}
              className="h-10 w-10 items-center justify-center rounded-full bg-black/30 dark:bg-black/40">
              <Ionicons name="notifications-outline" size={22} color="#F5EDE8" />
            </Pressable>
          ) : null}
        </View>

        <FadeInView slide className="relative z-10 mt-2 pr-4">
          <AppText
            variant="greeting"
            bold
            className={`text-[25px] leading-9 ${isDark ? 'text-gold-light' : 'text-white'}`}
            style={{
              color: isDark ? brandPalette.goldLight : '#FFFFFF',
              textShadowColor: 'rgba(0,0,0,0.45)',
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 6,
            }}>
            {t('greetingRamRam')} {displayName} 🙏
          </AppText>
          <AppText
            className={`mt-2 max-w-[95%] text-[15px] leading-7 ${
              isDark ? 'text-gp-text-dark' : 'text-white/95'
            }`}
            style={{
              color: isDark ? brandPalette.textDark : 'rgba(255,255,255,0.95)',
              textShadowColor: 'rgba(0,0,0,0.35)',
              textShadowOffset: { width: 0, height: 1 },
              textShadowRadius: 4,
            }}>
            {t(secondaryKey)}
          </AppText>
          <LotusDivider className="my-3" />
        </FadeInView>
      </View>
    </View>
  );
}

/** Auth/onboarding hero with temple backdrop + feather decoration */
export function AuthHeroHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const { isDark } = useAppColors();
  const insets = useSafeAreaInsets();
  const topPad = Math.max(insets.top, 12);

  return (
    <View className="relative min-h-[200px] overflow-hidden px-5 pb-6" style={{ paddingTop: topPad }}>
      <SpiritualAssetImage slot="authTemple" />
      <HeroScrim isDark={isDark} />

      <View
        className="absolute right-0 overflow-hidden"
        pointerEvents="none"
        style={{ top: topPad, width: 96, height: 144 }}>
        <SpiritualAssetImage slot="authFeather" style={{ right: -4, top: 0 }} />
      </View>

      <AppText
        variant="display"
        bold
        className={`relative z-10 pr-[96px] ${isDark ? 'text-gold-light' : 'text-white'}`}
        style={{
          color: isDark ? brandPalette.goldLight : '#FFFFFF',
          textShadowColor: 'rgba(0,0,0,0.4)',
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 4,
        }}>
        {title}
      </AppText>
      {subtitle ? (
        <AppText
          className={`relative z-10 mt-2 pr-20 text-base leading-7 ${
            isDark ? 'text-gp-muted-dark' : 'text-white/90'
          }`}>
          {subtitle}
        </AppText>
      ) : null}
      <LotusDivider className="relative z-10 my-2" />
    </View>
  );
}
