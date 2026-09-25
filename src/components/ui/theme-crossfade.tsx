import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { useEffect, useRef, type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useReduceMotion, themeCrossfade } from '@/lib/motion';
import { shouldAnimateThemeContentOpacity } from '@/lib/platform-performance-policy';
import { useThemeSettings } from '@/providers/theme-provider';

/**
 * Soft root opacity dissolve on light/dark scheme changes.
 * Liquid Glass capable iOS fades only a background sibling because opacity on
 * GlassView or any ancestor corrupts the system effect.
 */
export function ThemeCrossfade({ children }: { children: ReactNode }) {
  const { scheme, colors } = useThemeSettings();
  const reduceMotion = useReduceMotion();
  const liquidGlassAvailable = Platform.OS === 'ios' && isLiquidGlassAvailable();
  const animateContentOpacity = shouldAnimateThemeContentOpacity(
    Platform.OS,
    liquidGlassAvailable,
    reduceMotion
  );
  const contentOpacity = useSharedValue(1);
  const backgroundOpacity = useSharedValue(0);
  const previousBackground = useRef(colors.background);
  const transitionBackground = useSharedValue(colors.background);

  useEffect(() => {
    const fromBackground = previousBackground.current;
    previousBackground.current = colors.background;
    const { duration, easing } = themeCrossfade(reduceMotion);

    if (duration === 0 || fromBackground === colors.background) {
      contentOpacity.value = 1;
      backgroundOpacity.value = 0;
      transitionBackground.value = colors.background;
      return;
    }

    if (animateContentOpacity) {
      backgroundOpacity.value = 0;
      contentOpacity.value = 0.92;
      contentOpacity.value = withTiming(1, { duration, easing });
      return;
    }

    // This overlay is behind the app, never an ancestor of NativeTabs/Liquid Glass.
    contentOpacity.value = 1;
    transitionBackground.value = fromBackground;
    backgroundOpacity.value = 1;
    backgroundOpacity.value = withTiming(0, { duration, easing });
  }, [
    animateContentOpacity,
    backgroundOpacity,
    colors.background,
    contentOpacity,
    reduceMotion,
    scheme,
    transitionBackground,
  ]);

  const contentAnimatedStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));
  const backgroundAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backgroundOpacity.value,
    backgroundColor: transitionBackground.value,
  }));

  if (liquidGlassAvailable) {
    return (
      <View style={[styles.fill, { backgroundColor: colors.background }]}>
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            backgroundAnimatedStyle,
          ]}
        />
        <View style={styles.fill}>{children}</View>
      </View>
    );
  }

  return (
    <Animated.View
      style={[styles.fill, { backgroundColor: colors.background }, contentAnimatedStyle]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
