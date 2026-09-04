import { View } from 'react-native';

import { GitaChapterGrid } from '@/components/gita/gita-chapter-grid';
import { Screen } from '@/components/layout/screen';
import { MandalaWashBackdrop } from '@/components/spiritual/mandala-accent';
import { useLocale } from '@/providers/locale-provider';

export default function GitaExploreScreen() {
  const { t } = useLocale();

  return (
    <Screen
      showBack
      title={t('gitaExploreTitle')}
      subtitle={t('gitaExploreSubtitle')}
      scrollable={false}
      centered={false}
      contentClassName="flex-1 px-0 pb-0 pt-0"
      animateContent={false}>
      <View className="relative flex-1">
        <MandalaWashBackdrop />
        <GitaChapterGrid />
      </View>
    </Screen>
  );
}
