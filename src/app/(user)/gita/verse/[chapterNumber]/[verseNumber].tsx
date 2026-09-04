import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { Screen } from '@/components/layout/screen';
import { SpiritualSurface, SpiritualSurfaceBody } from '@/components/spiritual/spiritual-surface';
import { VerseKrishnaBackdrop } from '@/components/verse/verse-krishna-backdrop';
import { LotusDivider } from '@/components/verse/lotus-divider';
import { VerseReferencePill } from '@/components/verse/verse-reference-pill';
import { AppText } from '@/components/ui/app-text';
import { ErrorState } from '@/components/ui/error-state';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { FadeInView } from '@/components/ui/fade-in-view';
import { useLocale } from '@/providers/locale-provider';
import { fetchGitaVerse, resolveGitaVerseContent } from '@/services/gita-scripture';
import type { GitaVerse } from '@/types/gita-scripture';

export default function GitaVerseScreen() {
  const { chapterNumber: chapterParam, verseNumber: verseParam } = useLocalSearchParams<{
    chapterNumber: string;
    verseNumber: string;
  }>();
  const chapterNumber = Number(chapterParam);
  const verseNumber = Number(verseParam);
  const { t, locale } = useLocale();
  const [verse, setVerse] = useState<GitaVerse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!Number.isFinite(chapterNumber) || !Number.isFinite(verseNumber)) {
      setError(t('errorUnexpected'));
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError('');
      const data = await fetchGitaVerse(chapterNumber, verseNumber);
      if (!data) {
        setError(t('gitaNoScripture'));
        setVerse(null);
        return;
      }
      setVerse(data);
    } catch {
      setError(t('errorUnexpected'));
    } finally {
      setLoading(false);
    }
  }, [chapterNumber, t, verseNumber]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingScreen />;

  if (error || !verse) {
    return (
      <Screen showBack title={t('gitaReadVerse')}>
        <ErrorState message={error || t('errorUnexpected')} onRetry={() => void load()} />
      </Screen>
    );
  }

  const content = resolveGitaVerseContent(verse, locale);
  const devanagariBold = locale === 'hi' ? { fontFamily: 'NotoSansDevanagari_700Bold' as const } : undefined;
  const devanagariRegular = locale === 'hi' ? { fontFamily: 'NotoSansDevanagari_400Regular' as const } : undefined;

  return (
    <Screen showBack title={t('gitaReadVerse')} contentClassName="px-5 pb-10">
      <FadeInView slide>
        <View className="items-center">
          <VerseReferencePill reference={content.reference} />
        </View>

        <SpiritualSurface variant="verse" className="mt-5">
          <SpiritualSurfaceBody className="relative overflow-hidden">
            <VerseKrishnaBackdrop />

            <AppText
              variant="verse"
              bold
              className="px-2 pr-28 text-center text-xl leading-8 text-gp-text dark:text-gp-text-dark"
              style={devanagariBold}>
              {content.verseText}
            </AppText>

            {content.transliteration ? (
              <>
                <LotusDivider />
                <View className="items-center px-2">
                  <AppText bold className="text-sm tracking-wide text-saffron dark:text-gold">
                    ✦ {t('gitaTransliteration')} ✦
                  </AppText>
                  <AppText className="mt-3 text-center text-base italic leading-7 text-gp-muted dark:text-gp-muted-dark">
                    {content.transliteration}
                  </AppText>
                </View>
              </>
            ) : null}

            {content.meaning ? (
              <>
                <LotusDivider />
                <View className="items-center px-2">
                  <AppText bold className="text-sm tracking-wide text-saffron dark:text-gold">
                    ✦ {t('gitaMeaningLabel')} ✦
                  </AppText>
                  <AppText
                    className="mt-3 text-center text-base leading-7 text-gp-muted dark:text-gp-muted-dark"
                    style={devanagariRegular}>
                    {content.meaning}
                  </AppText>
                </View>
              </>
            ) : null}
          </SpiritualSurfaceBody>
        </SpiritualSurface>
      </FadeInView>
    </Screen>
  );
}
