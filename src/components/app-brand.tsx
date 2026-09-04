import { Image, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { useLocale } from '@/providers/locale-provider';

const LOGO_SIZE = 144;

export function AppBrand() {
  const { t } = useLocale();

  return (
    <View className="w-full items-center px-2">
      <Image
        source={require('../../assets/images/logo.png')}
        style={{ width: LOGO_SIZE, height: LOGO_SIZE }}
        resizeMode="contain"
      />
      <AppText
        bold
        className="mt-4 w-full text-center text-2xl leading-10 text-saffron dark:text-saffron-light">
        {t('appName')}
      </AppText>
    </View>
  );
}
