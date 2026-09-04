import { Text, View } from 'react-native';

import { AppButton } from '@/components/ui/button';
import { useAppColors } from '@/hooks/use-app-colors';
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
      style={{
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 20,
        backgroundColor: colors.destructiveMutedBg,
        borderWidth: 1,
        borderColor: colors.destructiveBorder,
        alignItems: 'center',
      }}>
      <Text
        style={{
          color: colors.destructiveText,
          textAlign: 'center',
          fontSize: 15,
          lineHeight: 22,
        }}>
        {message}
      </Text>
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
