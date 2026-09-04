import { Link } from 'expo-router';
import { View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { useLocale } from '@/providers/locale-provider';

interface LegalLinksProps {
  className?: string;
}

export function LegalLinks({ className }: LegalLinksProps) {
  const { t } = useLocale();

  return (
    <View className={`flex-row flex-wrap items-center gap-x-1 gap-y-1 ${className ?? ''}`}>
      <Link href="/legal/terms" asChild>
        <AppText className="text-sm text-saffron dark:text-saffron-light">{t('termsOfService')}</AppText>
      </Link>
      <AppText className="text-sm text-gp-muted dark:text-gp-muted-dark">·</AppText>
      <Link href="/legal/privacy" asChild>
        <AppText className="text-sm text-saffron dark:text-saffron-light">{t('privacyPolicy')}</AppText>
      </Link>
    </View>
  );
}
