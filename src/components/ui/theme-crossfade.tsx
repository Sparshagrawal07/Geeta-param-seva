import { useEffect, type ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useReduceMotion, themeCrossfade } from '@/lib/motion';
import { useThemeSettings } from '@/providers/theme-provider';

/**
 * Soft root opacity dissolve on light/dark scheme changes.
 * Covers NativeWind/asset hard-cuts without per-widget animation.
 */
export function ThemeCrossfade({ children }: { children: ReactNode }) {
  const { scheme, colors } = useThemeSettings();
  const reduceMotion = useReduceMotion();
  const opacity = useSharedValue(1);

  useEffect(() => {
    const { duration } = themeCrossfade(reduceMotion);
    if (duration === 0) {
      opacity.value = 1;
      return;
    }
    opacity.value = 0.92;
    opacity.value = withTiming(1, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [scheme, reduceMotion, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    flex: 1,
    opacity: opacity.value,
    backgroundColor: colors.background,
  }));

  return <Animated.View style={[styles.fill, animatedStyle]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
