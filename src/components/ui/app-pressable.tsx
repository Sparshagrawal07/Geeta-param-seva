import {
  Pressable,
  Platform,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useAppColors } from '@/hooks/use-app-colors';
import { type HapticKind, triggerHaptic } from '@/lib/haptics';

export interface AppPressableProps extends Omit<PressableProps, 'style'> {
  /** Visual press feedback. Default true. */
  pressOpacity?: number;
  haptic?: HapticKind | 'none';
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  /** Ensure comfortable touch target without growing layout. */
  minTouchSize?: number;
}

/**
 * Shared pressable with platform-native feedback + optional haptic.
 * iOS: opacity dip. Android: subtle saffron ripple.
 */
export function AppPressable({
  children,
  disabled,
  onPress,
  pressOpacity = 0.85,
  haptic = 'none',
  style,
  minTouchSize = 44,
  hitSlop,
  ...props
}: AppPressableProps) {
  const colors = useAppColors();

  const handlePress: PressableProps['onPress'] = (event) => {
    if (!disabled && haptic !== 'none') {
      void triggerHaptic(haptic);
    }
    onPress?.(event);
  };

  return (
    <Pressable
      {...props}
      disabled={disabled}
      onPress={handlePress}
      hitSlop={hitSlop ?? (minTouchSize > 0 ? 8 : undefined)}
      android_ripple={
        Platform.OS === 'android' && !disabled
          ? { color: `${colors.saffron}22`, borderless: false }
          : undefined
      }
      style={(state) => {
        const resolved = typeof style === 'function' ? style(state) : style;
        const opacity =
          Platform.OS === 'ios' && state.pressed && !disabled ? pressOpacity : disabled ? 0.55 : 1;
        return [
          { minHeight: minTouchSize > 0 ? undefined : undefined, opacity },
          resolved,
        ];
      }}>
      {children}
    </Pressable>
  );
}
