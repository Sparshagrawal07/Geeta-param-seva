import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppSpinner } from '@/components/ui/app-spinner';
import { AppText } from '@/components/ui/app-text';
import { useLocale } from '@/providers/locale-provider';

interface LoadingScreenProps {
  message?: string;
}

export function LoadingScreen({ message }: LoadingScreenProps) {
  const { t } = useLocale();

  return (
    <SafeAreaView
      edges={['top', 'bottom']}
      className="flex-1 items-center justify-center bg-gp-bg px-6 dark:bg-gp-bg-dark">
      <View className="items-center">
        <AppSpinner size="md" />
        <AppText className="mt-4 text-center text-lg leading-8 text-gp-muted dark:text-gp-muted-dark">
          {message ?? t('pleaseWait')}
        </AppText>
      </View>
    </SafeAreaView>
  );
}
