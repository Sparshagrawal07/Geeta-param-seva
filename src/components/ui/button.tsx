import {
  ActivityIndicator,
  Text,
  View,
  type PressableProps,
  type ViewStyle,
} from 'react-native';

import { AppPressable } from '@/components/ui/app-pressable';
import { useAppColors } from '@/hooks/use-app-colors';
import { type HapticKind, hapticForButtonVariant } from '@/lib/haptics';

type ButtonVariant = 'primary' | 'secondary' | 'destructive' | 'ghost';
type ButtonSize = 'sm' | 'md';

interface AppButtonProps extends Omit<PressableProps, 'style'> {
  label: string;
  loading?: boolean;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretch button to fill its container width */
  fullWidth?: boolean;
  containerStyle?: ViewStyle;
  /** Haptic feedback on press; defaults by variant */
  haptic?: HapticKind | 'auto' | 'none';
}

const SIZE_STYLES = {
  sm: {
    minHeight: 34,
    paddingVertical: 6,
    paddingHorizontal: 11,
    fontSize: 13,
    lineHeight: 18,
    borderRadius: 8,
  },
  md: {
    minHeight: 42,
    paddingVertical: 9,
    paddingHorizontal: 14,
    fontSize: 15,
    lineHeight: 20,
    borderRadius: 10,
  },
} as const;

export function AppButton({
  label,
  loading = false,
  disabled,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  containerStyle,
  haptic = 'auto',
  onPress,
  ...props
}: AppButtonProps) {
  const colors = useAppColors();
  const isDisabled = disabled || loading;
  const metrics = SIZE_STYLES[size];

  const backgroundColor = (() => {
    switch (variant) {
      case 'primary':
        return colors.saffron;
      case 'secondary':
        return colors.gpCard;
      case 'destructive':
        return colors.destructiveBg;
      case 'ghost':
        return colors.destructiveMutedBg;
    }
  })();

  const borderWidth = variant === 'secondary' || variant === 'ghost' ? 1 : 0;
  const borderColor =
    variant === 'secondary' ? colors.gpBorder : variant === 'ghost' ? colors.destructiveBorder : undefined;

  const labelColor = (() => {
    switch (variant) {
      case 'primary':
      case 'destructive':
        return '#FFFFFF';
      case 'secondary':
        return colors.gpText;
      case 'ghost':
        return colors.destructiveText;
    }
  })();

  const resolvedHaptic =
    haptic === 'auto' ? hapticForButtonVariant(variant) : haptic === 'none' ? 'none' : haptic;

  return (
    <View
      style={[
        { alignSelf: fullWidth ? 'stretch' : 'flex-start', width: fullWidth ? '100%' : undefined },
        containerStyle,
      ]}>
      <AppPressable
        {...props}
        disabled={isDisabled}
        onPress={onPress}
        haptic={isDisabled ? 'none' : resolvedHaptic}
        minTouchSize={0}
        style={{
          width: fullWidth ? '100%' : undefined,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          opacity: isDisabled ? 0.65 : 1,
        }}>
        <View
          style={{
            width: fullWidth ? '100%' : undefined,
            minHeight: metrics.minHeight,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: metrics.borderRadius,
            paddingHorizontal: metrics.paddingHorizontal,
            paddingVertical: metrics.paddingVertical,
            backgroundColor,
            borderWidth,
            borderColor,
          }}>
          {loading ? (
            <ActivityIndicator size="small" color={labelColor} />
          ) : (
            <Text
              numberOfLines={1}
              style={{
                color: labelColor,
                fontSize: metrics.fontSize,
                lineHeight: metrics.lineHeight,
                fontWeight: '600',
                textAlign: 'center',
              }}>
              {label}
            </Text>
          )}
        </View>
      </AppPressable>
    </View>
  );
}
