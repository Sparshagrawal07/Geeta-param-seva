import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppSpinner } from '@/components/ui/app-spinner';
import { AppText } from '@/components/ui/app-text';
import { EmptyState } from '@/components/ui/empty-state';
import { useAppColors } from '@/hooks/use-app-colors';
import { triggerHaptic } from '@/lib/haptics';
import { useLocale } from '@/providers/locale-provider';
import { fetchGitaChapters } from '@/services/gita-scripture';
import type { GitaChapter } from '@/types/gita-scripture';

function chunkPairs<T>(items: T[]): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += 2) {
    rows.push(items.slice(i, i + 2));
  }
  return rows;
}

function ChapterCard({ chapter }: { chapter: GitaChapter }) {
  const { t, locale } = useLocale();
  const colors = useAppColors();
  const title = locale === 'hi' ? chapter.titleHi || chapter.titleEn : chapter.titleEn;

  return (
    <Pressable
      accessibilityRole="button"
      className="flex-1"
      onPress={() => {
        void triggerHaptic('selection');
        router.push(`/(user)/gita/chapter/${chapter.chapterNumber}` as never);
      }}>
      <View className="min-h-[132px] flex-1 overflow-hidden rounded-2xl border border-saffron/20 bg-gp-card dark:border-gold/25 dark:bg-gp-card-dark">
        <View className="flex-1 justify-between px-3.5 py-3.5">
          <View>
            <View className="flex-row items-center gap-2">
              <View className="h-8 w-8 items-center justify-center rounded-full bg-saffron/12 dark:bg-gold/15">
                <AppText bold className="text-sm text-saffron dark:text-gold">
                  {chapter.chapterNumber}
                </AppText>
              </View>
              <AppText
                bold
                className="flex-1 text-[11px] uppercase tracking-widest text-saffron dark:text-gold"
                numberOfLines={1}>
                {t('gitaChapterWord')}
              </AppText>
            </View>

            <AppText
              bold
              className="mt-3 text-[15px] leading-5 text-gp-text dark:text-gp-text-dark"
              numberOfLines={2}>
              {title}
            </AppText>
          </View>

          <View className="mt-3 flex-row items-center justify-between">
            <AppText className="text-xs text-gp-muted dark:text-gp-muted-dark">
              {chapter.verseCount} {t('gitaVersesWord')}
            </AppText>
            <Ionicons name="chevron-forward" size={14} color={colors.placeholder} />
          </View>
        </View>
      </View>
    </Pressable>
  );
}

export function GitaChapterGrid() {
  const { t } = useLocale();
  const [chapters, setChapters] = useState<GitaChapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const rows = useMemo(() => chunkPairs(chapters), [chapters]);

  useEffect(() => {
    let active = true;
    void fetchGitaChapters()
      .then((data) => {
        if (!active) return;
        setChapters(data);
        setError(data.length === 0);
      })
      .catch(() => {
        if (!active) return;
        setChapters([]);
        setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center py-16">
        <AppSpinner size="md" />
      </View>
    );
  }

  if (error) {
    return (
      <View className="flex-1 px-5 pt-6">
        <EmptyState title={t('gitaExploreTitle')} message={t('gitaNoScripture')} />
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 28 }}>
      <View className="gap-3">
        {rows.map((row) => (
          <View key={row.map((c) => c.id).join('-')} className="flex-row gap-3">
            {row.map((chapter) => (
              <ChapterCard key={chapter.id} chapter={chapter} />
            ))}
            {row.length === 1 ? <View className="flex-1" /> : null}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
