import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { Screen } from '@/components/layout/screen';
import { MandalaWashBackdrop } from '@/components/spiritual/mandala-accent';
import { SpiritualSurface, SpiritualSurfaceBody } from '@/components/spiritual/spiritual-surface';
import { AppText } from '@/components/ui/app-text';
import { AppSpinner } from '@/components/ui/app-spinner';
import { TranslatedAppText } from '@/components/ui/translated-app-text';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { FadeInView } from '@/components/ui/fade-in-view';
import { SectionHeader } from '@/components/ui/section-header';
import { useAuth } from '@/hooks/use-auth';
import { useNotifications } from '@/hooks/use-notifications';
import { formatDateTime } from '@/lib/format';
import { triggerHaptic } from '@/lib/haptics';
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

  const renderItem = (item: AppNotification, index: number) => {
    const unread = lastSeenAt != null && item.createdAt.getTime() > lastSeenAt;
    return (
      <FadeInView key={item.id} index={index} slide>
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
              {formatDateTime(item.createdAt, locale)}
            </AppText>
          </SpiritualSurfaceBody>
        </SpiritualSurface>
      </FadeInView>
    );
  };

  return (
    <Screen
      contentClassName="relative px-5 pb-10 pt-2"
      animateContent={false}
      scrollProps={{
        refreshControl: (
          <RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} />
        ),
      }}>
      <MandalaWashBackdrop opacity={0.05} />
      <SectionHeader title={t('notificationsTitle')} subtitle={t('notificationsSubtitle')} />

      <Pressable onPress={() => void triggerHaptic('light')} className="mb-4">
        <SpiritualSurface variant="elevated" withMandala>
          <SpiritualSurfaceBody className="py-3">
            <AppText className="text-sm leading-6 text-gp-muted dark:text-gp-muted-dark">
              {t('notificationsSettingsHint')}
            </AppText>
          </SpiritualSurfaceBody>
        </SpiritualSurface>
      </Pressable>

      {loading && !refreshing ? (
        <View className="mt-8 items-center">
          <AppSpinner size="md" />
        </View>
      ) : null}
      {error ? <ErrorState message={error} onRetry={() => void refresh()} /> : null}

      {!loading && !error && items.length === 0 ? (
        <EmptyState title={t('notificationsEmptyTitle')} message={t('notificationsEmptyMessage')} />
      ) : null}

      {!loading && !error && today.length > 0 ? (
        <View className="mb-5 gap-3">
          <AppText bold className="text-sm uppercase tracking-wide text-gp-muted dark:text-gp-muted-dark">
            {t('notificationsToday')}
          </AppText>
          {today.map((item, index) => renderItem(item, index))}
        </View>
      ) : null}

      {!loading && !error && earlier.length > 0 ? (
        <View className="gap-3">
          <AppText bold className="text-sm uppercase tracking-wide text-gp-muted dark:text-gp-muted-dark">
            {t('notificationsEarlier')}
          </AppText>
          {earlier.map((item, index) => renderItem(item, index))}
        </View>
      ) : null}
    </Screen>
  );
}
