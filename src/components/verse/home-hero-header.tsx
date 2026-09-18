import Ionicons from '@expo/vector-icons/Ionicons';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SpiritualAssetImage } from '@/components/spiritual/spiritual-asset-image';
import { AppText } from '@/components/ui/app-text';
import { FadeInView } from '@/components/ui/fade-in-view';
import { GlassIconButton } from '@/components/ui/glass-pressable';
import { GlassCluster } from '@/components/ui/glass-surface';
import { LotusDivider } from '@/components/verse/lotus-divider';
import { useAppColors } from '@/hooks/use-app-colors';
import { brandPalette } from '@/lib/brand-palette';
import {
    spiritualDesignTokens,
    type SpiritualAssetSlot,
} from '@/lib/spiritual-assets';
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

function HeroTempleArtwork({
  slot,
  variant,
}: {
  slot: Extract<SpiritualAssetSlot, 'heroTemple' | 'authTemple'>;
  variant: 'home' | 'auth';
}) {
  const blend = spiritualDesignTokens.heroTempleBlend[variant];
  const midAlpha = Math.round(blend.midOpacity * 255)
    .toString(16)
    .padStart(2, '0');
  const bottomAlpha = Math.round(blend.bottomOpacity * 255)
    .toString(16)
    .padStart(2, '0');

  return (
    <>
      <SpiritualAssetImage slot={slot} />
      <MaskedView
        pointerEvents="none"
        style={{ position: 'absolute', inset: 0 }}
        maskElement={
          <LinearGradient
            colors={[
              'rgba(0,0,0,0)',
              'rgba(0,0,0,0)',
              `#000000${midAlpha}`,
              `#000000${bottomAlpha}`,
            ]}
            locations={[0, blend.maskStart, blend.maskMid, 1]}
            style={{ flex: 1 }}
          />
        }>
        <SpiritualAssetImage slot={slot} blurRadius={blend.blurRadius} />
      </MaskedView>
    </>
  );
}

function resolveReflectionOpacity(isDark: boolean) {
  const base = spiritualDesignTokens.heroTempleBlend.reflectionOpacity;
  const mode = isDark
    ? spiritualDesignTokens.heroTempleBlend.reflectionMode.dark
    : spiritualDesignTokens.heroTempleBlend.reflectionMode.light;

  return {
    top: Math.min(1, base.top * mode.visibilityMultiplier),
    middle: Math.min(1, base.middle * mode.visibilityMultiplier),
    lower: Math.min(1, base.lower * mode.visibilityMultiplier),
    canvasFadeMiddleOpacity: mode.canvasFadeMiddleOpacity,
    canvasFadeMiddleLocation: mode.canvasFadeMiddleLocation,
  };
}

function HeroTempleReflection({
  slot,
  variant,
  heroHeight,
  isDark,
}: {
  slot: Extract<SpiritualAssetSlot, 'heroTemple' | 'authTemple'>;
  variant: 'home' | 'auth';
  heroHeight: number;
  isDark: boolean;
}) {
  const blend = spiritualDesignTokens.heroTempleBlend[variant];
  const reflectionHeight = Math.min(
    blend.reflectionMaxHeight,
    Math.max(blend.reflectionMinHeight, Math.round(heroHeight * blend.reflectionRatio))
  );
  const canvas = isDark ? brandPalette.backgroundDark : brandPalette.background;
  const reflectionOpacity = resolveReflectionOpacity(isDark);
  const seamOverlap = spiritualDesignTokens.heroTempleBlend.reflectionSeamOverlap;
  const renderedHeight = reflectionHeight + seamOverlap;
  const canvasFadeAlpha = Math.round(reflectionOpacity.canvasFadeMiddleOpacity * 255)
    .toString(16)
    .padStart(2, '0');

  return (
    <View
      pointerEvents="none"
      style={{
        height: renderedHeight,
        marginTop: -seamOverlap,
        overflow: 'hidden',
        backgroundColor: canvas,
      }}>
      <MaskedView
        pointerEvents="none"
        style={{ position: 'absolute', inset: 0 }}
        maskElement={
          <LinearGradient
            colors={[
              `rgba(0,0,0,${reflectionOpacity.top})`,
              `rgba(0,0,0,${reflectionOpacity.middle})`,
              `rgba(0,0,0,${reflectionOpacity.lower})`,
              'rgba(0,0,0,0)',
            ]}
            locations={[0, 0.38, 0.76, 1]}
            style={{ flex: 1 }}
          />
        }>
        <View style={{ flex: 1 }}>
          {spiritualDesignTokens.heroTempleBlend.reflectionBands.map((band) => {
            const top = Math.round(renderedHeight * band.start);
            const height = Math.ceil(renderedHeight * (band.end - band.start)) + 1;

            return (
              <View
                key={`${band.start}-${band.end}`}
                style={{
                  position: 'absolute',
                  top,
                  right: 0,
                  left: 0,
                  height,
                  overflow: 'hidden',
                }}>
                <View
                  style={{
                    position: 'absolute',
                    top: -top,
                    right: -band.xOffset,
                    left: band.xOffset,
                    height: heroHeight,
                    transform: [{ scaleY: -1 }],
                  }}>
                  <SpiritualAssetImage slot={slot} blurRadius={band.blurRadius} />
                </View>
              </View>
            );
          })}
        </View>
      </MaskedView>

      <LinearGradient
        pointerEvents="none"
        colors={[`${canvas}00`, `${canvas}${canvasFadeAlpha}`, canvas]}
        locations={[0, reflectionOpacity.canvasFadeMiddleLocation, 1]}
        style={{ position: 'absolute', inset: 0 }}
      />
    </View>
  );
}

function HeroScrim({ isDark }: { isDark: boolean }) {
  const reflectionTopOpacity = resolveReflectionOpacity(isDark).top;
  const seamCanvasOpacity = 1 - reflectionTopOpacity;
  const preSeamCanvasOpacity = Math.min(0.82, seamCanvasOpacity + 0.05);
  const colors = isDark
    ? ([
        'rgba(13,10,9,0.04)',
        'rgba(13,10,9,0.28)',
        'rgba(26,20,18,0.72)',
        `rgba(26,20,18,${preSeamCanvasOpacity})`,
        `rgba(26,20,18,${seamCanvasOpacity})`,
      ] as const)
    : ([
        'rgba(0,0,0,0.06)',
        'rgba(0,0,0,0.14)',
        'rgba(245,237,230,0.7)',
        `rgba(245,237,230,${preSeamCanvasOpacity})`,
        `rgba(245,237,230,${seamCanvasOpacity})`,
      ] as const);

  return (
    <LinearGradient
      colors={[...colors]}
      locations={[0, 0.36, 0.68, 0.92, 1]}
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
  const [heroHeight, setHeroHeight] = useState(248);

  return (
    <View className="mb-0 overflow-hidden">
      <View
        className="relative min-h-[248px] px-5 pb-5"
        style={{ paddingTop: topPad }}
        onLayout={(event) => {
          const nextHeight = Math.round(event.nativeEvent.layout.height);
          setHeroHeight((current) => (current === nextHeight ? current : nextHeight));
        }}>
        <HeroTempleArtwork slot="heroTemple" variant="home" />
        <HeroScrim isDark={isDark} />

        <View className="relative z-10 flex-row items-start justify-end">
          <GlassCluster>
            {rightAction}
            {showNotificationBell ? (
              <GlassIconButton
                light
                accessibilityRole="button"
                accessibilityLabel={t('notificationsTitle')}
                haptic="light"
                onPress={() => router.push('/(user)/notifications' as never)}>
                <Ionicons name="notifications-outline" size={22} color="#F5EDE8" />
              </GlassIconButton>
            ) : null}
          </GlassCluster>
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
      <HeroTempleReflection
        slot="heroTemple"
        variant="home"
        heroHeight={heroHeight}
        isDark={isDark}
      />
    </View>
  );
}

/** Auth/onboarding hero with temple backdrop + feather decoration */
export function AuthHeroHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const { isDark } = useAppColors();
  const insets = useSafeAreaInsets();
  const topPad = Math.max(insets.top, 12);
  const [heroHeight, setHeroHeight] = useState(200);

  return (
    <View className="overflow-hidden">
      <View
        className="relative min-h-[200px] overflow-hidden px-5 pb-6"
        style={{ paddingTop: topPad }}
        onLayout={(event) => {
          const nextHeight = Math.round(event.nativeEvent.layout.height);
          setHeroHeight((current) => (current === nextHeight ? current : nextHeight));
        }}>
        <HeroTempleArtwork slot="authTemple" variant="auth" />
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
      <HeroTempleReflection
        slot="authTemple"
        variant="auth"
        heroHeight={heroHeight}
        isDark={isDark}
      />
    </View>
  );
}
