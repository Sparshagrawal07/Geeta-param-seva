import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GitaExploreEntry } from '@/components/gita/gita-explore-entry';
import { SafeBannerAd } from '@/components/ads/safe-banner-ad';
import { TodaysPracticeList } from '@/components/practice/todays-practice-list';
import { HomeHeroSection } from '@/components/verse/home-hero-section';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useAuth } from '@/hooks/use-auth';
import type { PracticeItemToday } from '@/lib/practice';
import { useLocale } from '@/providers/locale-provider';
import { getMyPracticeTodayRemote } from '@/services/practice';

export default function UserHomeScreen() {
  const { profile, loading: authLoading } = useAuth();
  const { t } = useLocale();

  const groupId = profile?.groupId ?? null;
  const [items, setItems] = useState<PracticeItemToday[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (authLoading) return;
    if (!groupId) {
      setItems([]);
      setError('');
      setLoading(false);
      return;
    }
    try {
      setError('');
      const today = await getMyPracticeTodayRemote();
      setItems(today.items);
    } catch {
      setItems([]);
      setError(t('errorUnexpected'));
    } finally {
      setLoading(false);
    }
  }, [authLoading, groupId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (!groupId) {
    return (
      <SafeAreaView className="flex-1 bg-gp-bg px-5 dark:bg-gp-bg-dark" edges={['top']}>
        <EmptyState title={t('pendingGroupTitle')} message={t('pendingGroupMessage')} />
      </SafeAreaView>
    );
  }

  return (
    <View className="flex-1 bg-gp-bg dark:bg-gp-bg-dark">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} />}>
        <HomeHeroSection name={profile?.name ?? ''} />

        {/* Practice CTA stack sits above decorative feather; ads never share this layer. */}
        <View className="relative z-30 px-5" collapsable={false}>
          {error ? (
            <View className="mb-4">
              <ErrorState message={error} onRetry={() => void load()} />
            </View>
          ) : null}

          <View className="-mt-1">
            <TodaysPracticeList items={items} loading={loading} onCompleted={() => void load()} />
          </View>

          <GitaExploreEntry />
        </View>

        {/* Ads only after all primary UI — single banner, scroll-bound, no z-index fight. */}
        <View className="z-0 mt-10 px-5 pb-2" pointerEvents="box-none">
          <SafeBannerAd screen="home" slot={1} />
        </View>
      </ScrollView>
    </View>
  );
}
