import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useEffect } from 'react';

import { useAppColors } from '@/hooks/use-app-colors';
import { useReduceMotion } from '@/lib/motion';

type AppSpinnerSize = 'sm' | 'md' | 'lg';

const SIZES: Record<AppSpinnerSize, { box: number; stroke: number }> = {
  sm: { box: 28, stroke: 2.5 },
  md: { box: 56, stroke: 3 },
  lg: { box: 96, stroke: 3.5 },
};

interface AppSpinnerProps {
  size?: AppSpinnerSize;
  color?: string;
}

export function AppSpinner({ size = 'md', color }: AppSpinnerProps) {
  const { saffron } = useAppColors();
  const reduceMotion = useReduceMotion();
  const metrics = SIZES[size];
  const accent = color ?? saffron;
  const rotation = useSharedValue(0);
  const counterRotation = useSharedValue(0);
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (reduceMotion) {
      rotation.value = 0;
      counterRotation.value = 0;
      pulse.value = 1;
      return;
    }
    rotation.value = withRepeat(
      withTiming(360, { duration: 1100, easing: Easing.linear }),
      -1,
      false
    );
    counterRotation.value = withRepeat(
      withTiming(-360, { duration: 1800, easing: Easing.linear }),
      -1,
      false
    );
    pulse.value = withRepeat(
      withTiming(0.45, { duration: 700, easing: Easing.inOut(Easing.quad) }),
      -1,
      true
    );
  }, [counterRotation, pulse, reduceMotion, rotation]);

  const outerArcStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const innerArcStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${counterRotation.value}deg` }],
    opacity: reduceMotion ? 0.5 : 0.7,
  }));

  const dotStyle = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 0.6 : pulse.value,
  }));

  const innerSize = metrics.box * 0.62;

  return (
    <View
      style={{ width: metrics.box, height: metrics.box, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: metrics.box,
            height: metrics.box,
            borderRadius: metrics.box / 2,
            borderWidth: metrics.stroke,
            borderColor: `${accent}33`,
            borderTopColor: accent,
          },
          outerArcStyle,
        ]}
      />
      {size !== 'sm' ? (
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: innerSize,
              height: innerSize,
              borderRadius: innerSize / 2,
              borderWidth: metrics.stroke - 0.5,
              borderColor: `${accent}22`,
              borderBottomColor: accent,
            },
            innerArcStyle,
          ]}
        />
      ) : (
        <Animated.View
          style={[
            {
              width: metrics.box * 0.22,
              height: metrics.box * 0.22,
              borderRadius: metrics.box * 0.11,
              backgroundColor: accent,
            },
            dotStyle,
          ]}
        />
      )}
    </View>
  );
}
