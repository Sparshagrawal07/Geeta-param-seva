import { AccessibilityInfo } from 'react-native';
import { useEffect, useState } from 'react';
import {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

export function useReduceMotion() {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return reduceMotion;
}

export function pageEnter(reduceMotion: boolean) {
  if (reduceMotion) {
    return FadeIn.duration(120);
  }
  return FadeInDown.duration(280).easing(Easing.out(Easing.cubic));
}

export function contentCrossfade(reduceMotion: boolean) {
  if (reduceMotion) {
    return {
      entering: FadeIn.duration(100),
      exiting: FadeOut.duration(80),
      layout: LinearTransition.duration(120),
    };
  }
  return {
    entering: FadeIn.duration(220),
    exiting: FadeOut.duration(160),
    layout: LinearTransition.springify().damping(18),
  };
}

export function listItemDelay(index: number, reduceMotion: boolean, cap = 6) {
  if (reduceMotion) return 0;
  return Math.min(index, cap) * 40;
}

export function themeCrossfade(reduceMotion: boolean) {
  if (reduceMotion) {
    return { duration: 0 };
  }
  return {
    duration: 320,
    easing: Easing.out(Easing.cubic),
  };
}

export function springSelect(reduceMotion: boolean) {
  return (value: number) =>
    reduceMotion
      ? withTiming(value, { duration: 120 })
      : withSpring(value, { damping: 16, stiffness: 220 });
}
