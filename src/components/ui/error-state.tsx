import { View } from 'react-native';

import { MandalaAccent } from '@/components/spiritual/mandala-accent';
import { AppButton } from '@/components/ui/button';
import { AppText } from '@/components/ui/app-text';
import { useAppColors } from '@/hooks/use-app-colors';
import { spiritualDesignTokens } from '@/lib/spiritual-assets';
import { useLocale } from '@/providers/locale-provider';

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorState({ message, onRetry, retryLabel }: ErrorStateProps) {
  const { t } = useLocale();
  const colors = useAppColors();

  return (
    <View
      className="relative items-center overflow-hidden rounded-2xl border px-4 py-5"
      style={{
        backgroundColor: colors.destructiveMutedBg,
        borderColor: colors.destructiveBorder,
      }}>
      <View pointerEvents="none" className="absolute inset-0 overflow-hidden opacity-80">
        <MandalaAccent kind="wash" opacity={spiritualDesignTokens.washOpacity.error} />
      </View>
      <AppText
        className="relative z-[1] text-center text-[15px] leading-[22px]"
        style={{ color: colors.destructiveText }}>
        {message}
      </AppText>
      {onRetry ? (
        <AppButton
          label={retryLabel ?? t('retry')}
          size="sm"
          containerStyle={{ marginTop: 12, alignSelf: 'center' }}
          onPress={onRetry}
        />
      ) : null}
    </View>
  );
}
