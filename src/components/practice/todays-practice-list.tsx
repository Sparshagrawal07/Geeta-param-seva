import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { SpiritualSurface, SpiritualSurfaceBody } from '@/components/spiritual/spiritual-surface';
import { CompletionBadge } from '@/components/verse/completion-badge';
import { SpiritualPrimaryButton } from '@/components/verse/spiritual-primary-button';
import { AppText } from '@/components/ui/app-text';
import { FadeInView } from '@/components/ui/fade-in-view';
import { EmptyState } from '@/components/ui/empty-state';
import { useAppColors } from '@/hooks/use-app-colors';
import { triggerHaptic } from '@/lib/haptics';
import type { PracticeItemToday } from '@/lib/practice';
import { useLocale } from '@/providers/locale-provider';
import { markAllPracticeCompleteRemote } from '@/services/practice';

interface TodaysPracticeListProps {
  items: PracticeItemToday[];
  loading?: boolean;
  onCompleted?: () => void;
}

function PracticeCardSkeleton() {
  return (
    <SpiritualSurface variant="verse">
      <SpiritualSurfaceBody>
        <View className="h-3 w-36 rounded bg-gp-border/60 dark:bg-gp-border-dark/60" />
        <View className="mt-4 h-6 w-28 rounded-full bg-gp-border/50 dark:bg-gp-border-dark/50" />
        <View className="mt-6 h-14 w-full rounded-2xl bg-gp-border/35 dark:bg-gp-border-dark/35" />
      </SpiritualSurfaceBody>
    </SpiritualSurface>
  );
}

function itemTitle(item: PracticeItemToday, locale: string, chapterWord: string) {
  if (item.type === 'aarti') {
    return locale === 'hi' ? item.titleHi || 'आरती' : item.titleEn || 'Aarti';
  }
  const name = locale === 'hi' ? item.titleHi || item.titleEn : item.titleEn;
  const chapter = `${chapterWord} ${item.chapterNumber}`;
  return name ? `${chapter} · ${name}` : chapter;
}

export function TodaysPracticeList({ items, loading = false, onCompleted }: TodaysPracticeListProps) {
  const { t, locale } = useLocale();
  const colors = useAppColors();
  const [completing, setCompleting] = useState(false);

  const allComplete = useMemo(
    () => items.length > 0 && items.every((item) => item.completed),
    [items]
  );
  const hasAarti = useMemo(() => items.some((item) => item.type === 'aarti'), [items]);
  const hasAdhyay = useMemo(() => items.some((item) => item.type === 'adhyay'), [items]);

  const markLabel =
    hasAdhyay && hasAarti
      ? t('practiceMarkAllAdhyayAarti')
      : hasAarti
        ? t('practiceMarkAllAarti')
        : t('practiceMarkAllAdhyays');

  if (loading) {
    return (
      <View className="gap-4">
        <PracticeCardSkeleton />
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <FadeInView slide>
        <EmptyState title={t('practiceEmptyTitle')} message={t('practiceEmptyMessage')} />
      </FadeInView>
    );
  }

  const openItem = (item: PracticeItemToday) => {
    if (item.type === 'aarti') {
      router.push('/(user)/practice/aarti' as never);
      return;
    }
    router.push(`/(user)/gita/chapter/${item.chapterNumber}` as never);
  };

  const handleMarkAllComplete = async () => {
    if (allComplete) return;
    try {
      setCompleting(true);
      await markAllPracticeCompleteRemote();
      void triggerHaptic('success');
      onCompleted?.();
    } catch {
      void triggerHaptic('error');
    } finally {
      setCompleting(false);
    }
  };

  return (
    <View className="gap-4">
      <View className="mb-1">
        <AppText bold className="text-lg text-gp-text dark:text-gp-text-dark">
          {t('practiceTodayTitle')}
        </AppText>
        <AppText className="mt-1 text-sm text-gp-muted dark:text-gp-muted-dark">
          {t('practiceTodaySubtitle')}
        </AppText>
      </View>

      <FadeInView slide>
        <SpiritualSurface variant={allComplete ? 'elevated' : 'verse'}>
          <SpiritualSurfaceBody className="py-4">
            <View className="gap-3">
              {items.map((item) => (
                <Pressable
                  key={item.itemKey}
                  onPress={() => openItem(item)}
                  className="flex-row items-center gap-3 rounded-2xl border border-saffron/10 bg-gp-bg/60 px-3 py-3 dark:border-gold/15 dark:bg-gp-bg-dark/40">
                  <View
                    className={`h-11 w-11 items-center justify-center rounded-full ${
                      item.completed ? 'bg-saffron/15 dark:bg-gold/15' : 'bg-gp-card dark:bg-gp-card-dark'
                    }`}>
                    <Ionicons
                      name={item.type === 'aarti' ? 'flame-outline' : 'book-outline'}
                      size={22}
                      color={item.completed ? colors.saffron : colors.placeholder}
                    />
                  </View>
                  <View className="min-w-0 flex-1">
                    <AppText bold className="text-base text-gp-text dark:text-gp-text-dark">
                      {itemTitle(item, locale, t('gitaChapterWord'))}
                    </AppText>
                    <AppText className="mt-1 text-xs text-gp-muted dark:text-gp-muted-dark">
                      {item.completed ? t('practiceItemComplete') : t('practiceItemOpenHint')}
                    </AppText>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.placeholder} />
                </Pressable>
              ))}
            </View>

            <View className="relative z-10 mt-5">
              {allComplete ? (
                <CompletionBadge variant="completed" />
              ) : (
                <>
                  <SpiritualPrimaryButton
                    label={markLabel}
                    size="lg"
                    loading={completing}
                    onPress={() => void handleMarkAllComplete()}
                  />
                  <CompletionBadge variant="pending" />
                </>
              )}
            </View>
          </SpiritualSurfaceBody>
        </SpiritualSurface>
      </FadeInView>
    </View>
  );
}
