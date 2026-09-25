import AsyncStorage from '@react-native-async-storage/async-storage';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, SectionList, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { Screen } from '@/components/layout/screen';
import { MandalaWashBackdrop } from '@/components/spiritual/mandala-accent';
import { SpiritualSurface, SpiritualSurfaceBody } from '@/components/spiritual/spiritual-surface';
import { AppText } from '@/components/ui/app-text';
import { AppSpinner } from '@/components/ui/app-spinner';
import { TranslatedAppText } from '@/components/ui/translated-app-text';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { SectionHeader } from '@/components/ui/section-header';
import { useAuth } from '@/hooks/use-auth';
import { useNotifications } from '@/hooks/use-notifications';
import { formatFeedDateTime } from '@/lib/format';
import type { Locale } from '@/lib/i18n/messages';
import { useLocale } from '@/providers/locale-provider';
import type { AppNotification } from '@/types/feed';

const LAST_SEEN_KEY = 'alerts.lastSeenAt';

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const NotificationRow = memo(function NotificationRow({
  item,
  unread,
  locale,
}: {
  item: AppNotification;
  unread: boolean;
  locale: Locale;
}) {
  return (
    <SpiritualSurface
      variant={unread ? 'elevated' : 'default'}
      className={unread ? 'border-saffron/50' : undefined}>
      <SpiritualSurfaceBody className="py-4">
        <View className="flex-row items-start justify-between gap-2">
          <TranslatedAppText bold className="min-w-0 flex-1 text-base text-gp-text dark:text-gp-text-dark">
            {item.title}
          </TranslatedAppText>
          {unread ? <View className="mt-1 h-2 w-2 rounded-full bg-saffron" /> : null}
        </View>
        <TranslatedAppText className="mt-2 text-base leading-7 text-gp-muted dark:text-gp-muted-dark">
          {item.body}
        </TranslatedAppText>
        <AppText className="mt-2 text-xs text-gp-muted dark:text-gp-muted-dark">
          {formatFeedDateTime(item.createdAt, locale)}
        </AppText>
      </SpiritualSurfaceBody>
    </SpiritualSurface>
  );
});

const notificationKeyExtractor = (item: AppNotification) => item.id;

export default function UserNotificationsScreen() {
  const { locale, t } = useLocale();
  const { profile } = useAuth();

  const groupId = profile?.groupId ?? null;
  const { items, loading, error, refresh } = useNotifications(groupId);
  const [refreshing, setRefreshing] = useState(false);
  const [lastSeenAt, setLastSeenAt] = useState<number | null>(null);

  useEffect(() => {
    void AsyncStorage.getItem(LAST_SEEN_KEY).then((raw) => {
      const parsed = raw ? Number(raw) : NaN;
      setLastSeenAt(Number.isFinite(parsed) ? parsed : null);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      const markSeen = async () => {
        const now = Date.now();
        await AsyncStorage.setItem(LAST_SEEN_KEY, String(now));
        setLastSeenAt(now);
      };
      // Defer so unread styling is visible briefly on entry.
      const timer = setTimeout(() => {
        void markSeen();
      }, 800);
      return () => clearTimeout(timer);
    }, [])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh({ silent: true });
    setRefreshing(false);
  }, [refresh]);

  const { today, earlier } = useMemo(() => {
    const todayStart = startOfToday();
    const todayItems: AppNotification[] = [];
    const earlierItems: AppNotification[] = [];
    for (const item of items) {
      if (isSameDay(item.createdAt, todayStart)) {
        todayItems.push(item);
      } else {
        earlierItems.push(item);
      }
    }
    return { today: todayItems, earlier: earlierItems };
  }, [items]);

  const sections = useMemo(
    () => [
      { key: 'today', title: t('notificationsToday'), data: today },
      { key: 'earlier', title: t('notificationsEarlier'), data: earlier },
    ].filter((section) => section.data.length > 0),
    [earlier, t, today]
  );
  const renderItem = useCallback(
    ({ item }: { item: AppNotification }) => (
      <NotificationRow
        item={item}
        unread={lastSeenAt != null && item.createdAt.getTime() > lastSeenAt}
        locale={locale}
      />
    ),
    [lastSeenAt, locale]
  );

  return (
    <Screen
      showBack
      scrollable={false}
      contentClassName="relative px-0 pt-2"
      animateContent={false}>
      <MandalaWashBackdrop />
      <SectionList
        sections={!loading && !error ? sections : []}
        keyExtractor={notificationKeyExtractor}
        renderItem={renderItem}
        renderSectionHeader={({ section }) => (
          <AppText bold className="mb-3 mt-2 text-sm uppercase tracking-wide text-gp-muted dark:text-gp-muted-dark">
            {section.title}
          </AppText>
        )}
        SectionSeparatorComponent={() => <View className="h-3" />}
        ItemSeparatorComponent={() => <View className="h-3" />}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View>
            <SectionHeader title={t('notificationsTitle')} subtitle={t('notificationsSubtitle')} />
            <View className="mb-4">
              <SpiritualSurface variant="elevated" withMandala>
                <SpiritualSurfaceBody className="py-3">
                  <AppText className="text-sm leading-6 text-gp-muted dark:text-gp-muted-dark">
                    {t('notificationsSettingsHint')}
                  </AppText>
                </SpiritualSurfaceBody>
              </SpiritualSurface>
            </View>
          </View>
        }
        ListEmptyComponent={
          loading && !refreshing ? (
            <View className="mt-8 items-center">
              <AppSpinner size="md" />
            </View>
          ) : error ? (
            <ErrorState message={error} onRetry={() => void refresh()} />
          ) : (
            <EmptyState title={t('notificationsEmptyTitle')} message={t('notificationsEmptyMessage')} />
          )
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} />
        }
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingBottom: 40 }}
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        windowSize={7}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}
