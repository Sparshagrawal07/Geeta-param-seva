import { View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { MandalaAccent } from '@/components/spiritual/mandala-accent';
import { SpiritualSurface, SpiritualSurfaceBody } from '@/components/spiritual/spiritual-surface';
import { LotusDivider } from '@/components/verse/lotus-divider';
import { AppText } from '@/components/ui/app-text';
import { FadeInView } from '@/components/ui/fade-in-view';
import { useMemberSelectedGroup } from '@/hooks/use-member-selected-group';
import { useTodaysPractice } from '@/hooks/use-todays-practice';
import { AARTI_CONTENT } from '@/lib/aarti-content';
import { AARTI_ITEM_KEY } from '@/lib/practice';
import { useLocale } from '@/providers/locale-provider';

export default function AartiPracticeScreen() {
  const { t, locale } = useLocale();
  const { groupId } = useMemberSelectedGroup();
  const practice = useTodaysPractice(groupId);
  const aarti = practice.items.find((item) => item.itemKey === AARTI_ITEM_KEY);
  const inTodaysPractice = Boolean(aarti);
  const completed = Boolean(aarti?.completed);

  const title = locale === 'hi' ? AARTI_CONTENT.titleHi : AARTI_CONTENT.titleEn;
  const body = locale === 'hi' ? AARTI_CONTENT.bodyHi : AARTI_CONTENT.bodyEn;

  return (
    <Screen showBack title={title} contentClassName="px-5 pb-10" animateContent={false}>
      <FadeInView slide>
        <SpiritualSurface variant="verse">
          <SpiritualSurfaceBody className="overflow-hidden">
            <MandalaAccent kind="festive" />
            <AppText
              bold
              className="text-center text-xl text-gp-text dark:text-gp-text-dark"
              style={locale === 'hi' ? { fontFamily: 'NotoSansDevanagari_700Bold' } : undefined}>
              {title}
            </AppText>
            <LotusDivider className="my-4" />
            <AppText
              className="text-base leading-8 text-gp-text dark:text-gp-text-dark"
              style={locale === 'hi' ? { fontFamily: 'NotoSansDevanagari_400Regular' } : undefined}>
              {body}
            </AppText>
          </SpiritualSurfaceBody>
        </SpiritualSurface>

        {inTodaysPractice ? (
          <View className="mt-5 rounded-2xl border border-saffron/15 bg-saffron/[0.06] px-4 py-3 dark:border-gold/20 dark:bg-gold/10">
            <AppText className="text-sm leading-6 text-gp-muted dark:text-gp-muted-dark">
              {completed ? t('practiceAartiAlreadyComplete') : t('practiceAartiMarkFromHome')}
            </AppText>
          </View>
        ) : null}
      </FadeInView>
    </Screen>
  );
}
