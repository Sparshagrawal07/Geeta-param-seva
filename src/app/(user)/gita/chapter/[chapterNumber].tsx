import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';

import { Screen } from '@/components/layout/screen';
import { MandalaGoldBackdrop } from '@/components/spiritual/mandala-accent';
import { SpiritualSurface, SpiritualSurfaceBody } from '@/components/spiritual/spiritual-surface';
import { LotusDivider } from '@/components/verse/lotus-divider';
import { AppText } from '@/components/ui/app-text';
import { AppSpinner } from '@/components/ui/app-spinner';
import { ErrorState } from '@/components/ui/error-state';
import { FadeInView } from '@/components/ui/fade-in-view';
import { useLocale } from '@/providers/locale-provider';
import {
  fetchGitaChapter,
  fetchGitaVersesForChapter,
  resolveGitaVerseContent,
} from '@/services/gita-scripture';
import type { GitaChapter, GitaVerse } from '@/types/gita-scripture';

export default function GitaChapterScreen() {
  const { chapterNumber: chapterParam } = useLocalSearchParams<{ chapterNumber: string }>();
  const chapterNumber = Number(chapterParam);
  const { t, locale } = useLocale();
  const [chapter, setChapter] = useState<GitaChapter | null>(null);
  const [verses, setVerses] = useState<GitaVerse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!Number.isFinite(chapterNumber) || chapterNumber < 1) {
      setError(t('errorUnexpected'));
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError('');
      const [chapterData, verseData] = await Promise.all([
        fetchGitaChapter(chapterNumber),
        fetchGitaVersesForChapter(chapterNumber),
      ]);
      if (!chapterData) {
        setError(t('gitaNoScripture'));
        setChapter(null);
        setVerses([]);
        return;
      }
      setChapter(chapterData);
      setVerses(verseData);
    } catch {
      setError(t('errorUnexpected'));
    } finally {
      setLoading(false);
    }
  }, [chapterNumber, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <Screen showBack title={t('gitaExploreTitle')} animateContent={false}>
        <View className="items-center py-16">
          <AppSpinner />
        </View>
      </Screen>
    );
  }

  if (error || !chapter) {
    return (
      <Screen showBack title={t('gitaExploreTitle')} animateContent={false}>
        <ErrorState message={error || t('errorUnexpected')} onRetry={() => void load()} />
      </Screen>
    );
  }

  const title = locale === 'hi' ? chapter.titleHi || chapter.titleEn : chapter.titleEn;
  const summary = locale === 'hi' ? chapter.summaryHi || chapter.summaryEn : chapter.summaryEn;

  return (
    <Screen
      showBack
      title={`${t('gitaChapterWord')} ${chapter.chapterNumber}`}
      subtitle={title}
      contentClassName="relative px-5 pb-10"
      animateContent={false}>
      <MandalaGoldBackdrop />

      {summary ? (
        <FadeInView slide>
          <AppText className="text-base leading-7 text-gp-muted dark:text-gp-muted-dark">{summary}</AppText>
          <LotusDivider className="my-5" />
        </FadeInView>
      ) : null}

      <View className="gap-3">
        {verses.map((verse, index) => {
          const content = resolveGitaVerseContent(verse, locale);
          return (
            <FadeInView key={verse.id} index={index} slide>
              <Pressable
                onPress={() =>
                  router.push(`/(user)/gita/verse/${chapter.chapterNumber}/${verse.verseNumber}` as never)
                }>
                <SpiritualSurface variant="elevated" withMandala mandalaKind="gold">
                  <SpiritualSurfaceBody className="py-4">
                    <AppText bold className="text-xs uppercase tracking-widest text-saffron dark:text-gold">
                      {content.reference}
                    </AppText>
                    <AppText
                      className="mt-2 text-base leading-7 text-gp-text dark:text-gp-text-dark"
                      numberOfLines={3}
                      style={locale === 'hi' ? { fontFamily: 'NotoSansDevanagari_400Regular' } : undefined}>
                      {content.verseText}
                    </AppText>
                    <AppText className="mt-2 text-xs text-saffron dark:text-gold">{t('gitaReadVerse')} →</AppText>
                  </SpiritualSurfaceBody>
                </SpiritualSurface>
              </Pressable>
            </FadeInView>
          );
        })}
      </View>
    </Screen>
  );
}
