import { useEffect, type ReactNode } from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useAppColors } from '@/hooks/use-app-colors';
import { brandPalette } from '@/lib/brand-palette';
import { useReduceMotion } from '@/lib/motion';
import { resolveSpiritualAssetSource, type SpiritualAssetSlot } from '@/lib/spiritual-assets';
import { visualTokens } from '@/lib/visual-tokens';

type AtmosphericVariant = 'home' | 'auth';

interface AtmosphericHeroProps {
  children?: ReactNode;
  /** Home uses fuller height; auth bridges into brand/form. */
  variant?: AtmosphericVariant;
  /** Optional decorative layer (e.g. feather) rendered above the artwork. */
  ornament?: ReactNode;
  style?: StyleProp<ViewStyle>;
  className?: string;
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace('#', '');
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/**
 * Composes transparent temple PNGs as environmental atmosphere —
 * not a rectangular image card. Architecture stays sharp; only the
 * handoff into the canvas softens.
 */
export function AtmosphericHero({
  children,
  variant = 'home',
  ornament,
  style,
  className,
}: AtmosphericHeroProps) {
  const { isDark, background } = useAppColors();
  const reduceMotion = useReduceMotion();
  const hero = visualTokens.hero;
  const atmosphere = visualTokens.atmosphere;
  const harmony = isDark ? visualTokens.harmony.dark : visualTokens.harmony.light;

  const slot: SpiritualAssetSlot = variant === 'auth' ? 'authTemple' : 'heroTemple';
  const source = resolveSpiritualAssetSource(slot, isDark);

  const minHeight = variant === 'auth' ? hero.authMinHeight : hero.minHeight;
  const maxHeight = variant === 'auth' ? hero.authMaxHeight : hero.maxHeight;

  const opacity = useSharedValue(reduceMotion ? 1 : 0);
  const scale = useSharedValue(reduceMotion ? 1 : hero.enterScaleFrom);

  useEffect(() => {
    if (reduceMotion) {
      opacity.value = 1;
      scale.value = 1;
      return;
    }
    opacity.value = withTiming(1, {
      duration: hero.enterDuration,
      easing: Easing.out(Easing.cubic),
    });
    scale.value = withTiming(1, {
      duration: hero.enterDuration,
      easing: Easing.out(Easing.cubic),
    });
  }, [hero.enterDuration, hero.enterScaleFrom, opacity, reduceMotion, scale]);

  const artStyle = useAnimatedStyle(() => ({
    opacity: opacity.value * hero.imageOpacity,
    transform: [{ scale: scale.value }],
  }));

  // Bias artwork so temple focal (~0.68) sits toward the right / upper-right.
  const focalShiftX = (0.5 - hero.focalPointX) * 18;
  const focalShiftY = (hero.focalPointY - 0.5) * 10 + hero.verticalOffset;

  const canvas = background;
  const spill = variant === 'auth' ? hero.spill + 8 : hero.spill;

  return (
    <View
      className={className}
      style={[
        {
          position: 'relative',
          minHeight,
          maxHeight,
          marginBottom: spill * 0.4,
          overflow: 'visible',
        },
        style,
      ]}>
      {/* Soft atmospheric wash — borrows warmth from the art without replacing brand bg */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: hexToRgba(harmony.glow, atmosphere.glowOpacity),
          },
        ]}
      />

      {/* Primary artwork — contain preserves transparent silhouette */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: 'absolute',
            left: hero.horizontalBleed,
            right: hero.horizontalBleed,
            top: 0,
            bottom: -spill,
            overflow: 'visible',
            alignItems: 'center',
            justifyContent: 'flex-start',
          },
          artStyle,
        ]}>
        <Image
          source={source}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
          style={{
            width: '108%',
            maxWidth: 720,
            aspectRatio: hero.aspectRatio,
            marginLeft: focalShiftX,
            marginTop: focalShiftY,
          }}
        />
      </Animated.View>

      {/* Optional ornament (feather) — above art, below copy */}
      {ornament ? (
        <View pointerEvents="none" style={{ position: 'absolute', inset: 0, zIndex: 3 }}>
          {ornament}
        </View>
      ) : null}

      {/* Quiet left veil for text safe-zone — never a heavy dark plate */}
      {variant === 'home' ? (
        <LinearGradient
          pointerEvents="none"
          colors={[
            `rgba(${harmony.veil},${atmosphere.textVeilOpacity})`,
            `rgba(${harmony.veil},${atmosphere.textVeilOpacity * 0.45})`,
            `rgba(${harmony.veil},0)`,
          ]}
          start={{ x: 0, y: 0.35 }}
          end={{ x: 0.72, y: 0.55 }}
          style={[StyleSheet.absoluteFill, { zIndex: 2 }]}
        />
      ) : (
        <LinearGradient
          pointerEvents="none"
          colors={[
            `rgba(${harmony.veil},${atmosphere.overlayOpacity})`,
            `rgba(${harmony.veil},0.06)`,
            'transparent',
          ]}
          locations={[0, 0.35, 0.7]}
          style={[StyleSheet.absoluteFill, { zIndex: 2 }]}
        />
      )}

      {/*
        Soft image diffusion: canvas-matched alpha fade so the artwork
        gradually disappears into the screen — no hard horizontal edge,
        no heavy full-image blur (architecture stays sharp).
      */}
      <LinearGradient
        pointerEvents="none"
        colors={[
          `${canvas}00`,
          `${canvas}00`,
          `${canvas}28`,
          `${canvas}78`,
          `${canvas}D0`,
          canvas,
        ]}
        locations={[0, hero.fadeStart, hero.fadeMid, hero.fadeLate, 0.96, hero.fadeEnd]}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: -spill,
          zIndex: 4,
        }}
      />

      {/* Warm contact glow near the dissolve — atmospheric, not a card shadow */}
      <LinearGradient
        pointerEvents="none"
        colors={[
          'transparent',
          hexToRgba(harmony.glow, atmosphere.glowOpacity * 0.9),
          'transparent',
        ]}
        locations={[0.55, 0.78, 1]}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          bottom: -spill,
          zIndex: 4,
        }}
      />

      <View
        style={{
          position: 'relative',
          zIndex: 5,
          paddingBottom: hero.contentSafeBottom,
          flexGrow: 1,
          justifyContent: 'flex-start',
        }}>
        {children}
      </View>
    </View>
  );
}

/** Brand canvas colors for callers that need explicit harmony (optional). */
export const atmosphericCanvas = {
  light: brandPalette.background,
  dark: brandPalette.backgroundDark,
} as const;
