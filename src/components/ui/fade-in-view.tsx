import type { ReactNode } from 'react';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { listItemDelay, useReduceMotion } from '@/lib/motion';

interface FadeInViewProps {
  children: ReactNode;
  /** Stagger list items slightly (capped). */
  index?: number;
  /** Use a small upward slide — good for cards and rows. */
  slide?: boolean;
  className?: string;
  /** Skip entrance animation (e.g. when parent Screen already animates). */
  disabled?: boolean;
  delay?: number;
}

export function FadeInView({
  children,
  index = 0,
  slide = false,
  delay: delayOverride,
  className,
  disabled = false,
}: FadeInViewProps) {
  const reduceMotion = useReduceMotion();

  if (disabled || reduceMotion) {
    return <Animated.View className={className}>{children}</Animated.View>;
  }

  const delay = delayOverride ?? listItemDelay(index, false);
  const entering = slide
    ? FadeInDown.duration(260).delay(delay).damping(24).stiffness(180)
    : FadeIn.duration(220).delay(delay);

  return (
    <Animated.View entering={entering} className={className}>
      {children}
    </Animated.View>
  );
}
