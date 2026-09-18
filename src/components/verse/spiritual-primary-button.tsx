import { ActivityIndicator, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { AppPressable } from '@/components/ui/app-pressable';
import { AppText } from '@/components/ui/app-text';
import { useAppColors } from '@/hooks/use-app-colors';
import { spiritualGradients } from '@/lib/spiritual-ui';

interface SpiritualPrimaryButtonProps {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  /** Larger CTA used for marking today's Adhyay/Aarti complete. */
  size?: 'md' | 'lg';
}

export function SpiritualPrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  size = 'md',
}: SpiritualPrimaryButtonProps) {
  const { isDark } = useAppColors();
  const colors = isDark ? spiritualGradients.primaryButton.dark : spiritualGradients.primaryButton.light;
  const isLarge = size === 'lg';
  const isDisabled = disabled || loading;

  return (
    <AppPressable
      disabled={isDisabled}
      onPress={onPress}
      haptic="light"
      minTouchSize={0}
      className="w-full overflow-hidden rounded-2xl shadow-md shadow-black/20"
      style={{ opacity: isDisabled ? 0.65 : 1 }}>
      <LinearGradient
        colors={[...colors]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{
          minHeight: isLarge ? 64 : 52,
          paddingVertical: isLarge ? 16 : 14,
          paddingHorizontal: 18,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}>
        {loading ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <View className="max-w-full flex-row flex-wrap items-center justify-center gap-2 px-1">
            <AppText className={isLarge ? 'text-lg' : 'text-base'}>🪷</AppText>
            <AppText
              bold
              numberOfLines={2}
              className={`${isLarge ? 'text-lg' : 'text-base'} shrink text-center text-white`}>
              {label}
            </AppText>
          </View>
        )}
      </LinearGradient>
    </AppPressable>
  );
}
