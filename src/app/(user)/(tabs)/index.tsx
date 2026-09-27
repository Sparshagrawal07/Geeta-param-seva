import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GitaExploreEntry } from '@/components/gita/gita-explore-entry';
import { SafeBannerAd } from '@/components/ads/safe-banner-ad';
import { GroupScopeSelector } from '@/components/admin/group-scope-selector';
import { TodaysPracticeList } from '@/components/practice/todays-practice-list';
import { HomeHeroSection } from '@/components/verse/home-hero-section';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useAuth } from '@/hooks/use-auth';
import { useLocalPerformanceSpan } from '@/hooks/use-local-performance-span';
import { useMemberSelectedGroup } from '@/hooks/use-member-selected-group';
import { useTodaysPractice } from '@/hooks/use-todays-practice';
import { requestCoordinatedRefresh } from '@/lib/cache/refresh-coordinator';
import { LOCAL_PERFORMANCE_BUDGETS } from '@/lib/local-performance';
import { useLocale } from '@/providers/locale-provider';

export default function UserHomeScreen() {
  const { profile, loading: authLoading } = useAuth();
  const { t } = useLocale();

  const { groups, groupId: selectedGroupId, setGroupId: setSelectedGroupId } =
    useMemberSelectedGroup();
  const practice = useTodaysPractice(selectedGroupId);
  const [refreshing, setRefreshing] = useState(false);
  useLocalPerformanceSpan(
    'screen.home.cached-ready',
    !authLoading && !practice.loading,
    LOCAL_PERFORMANCE_BUDGETS.cachedScreenReadyMs
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    requestCoordinatedRefresh('manual');
    await practice.refresh();
    setRefreshing(false);
  }, [practice]);

  if (!selectedGroupId && !authLoading) {
    return (
      <SafeAreaView className="flex-1 bg-gp-bg px-5 dark:bg-gp-bg-dark" edges={['top']}>
        <EmptyState title={t('pendingGroupTitle')} message={t('pendingGroupMessage')} />
      </SafeAreaView>
    );
  }

  return (
    <View testID="screen-home" className="flex-1 bg-gp-bg dark:bg-gp-bg-dark">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} />}>
        <HomeHeroSection name={profile?.name ?? ''} />

        {/* Practice CTA stack sits above decorative feather; ads never share this layer. */}
        <View className="relative z-30 px-5" collapsable={false}>
          {/* Hidden for a single group — a one-option picker is noise, not choice. */}
          {groups.length > 1 ? (
            <GroupScopeSelector
              groups={groups}
              selectedGroupId={selectedGroupId}
              onSelect={(id) => void setSelectedGroupId(id)}
            />
          ) : null}

          {practice.error ? (
            <View className="mb-4">
              <ErrorState message={practice.error} onRetry={() => void practice.refresh()} />
            </View>
          ) : null}

          <View className="-mt-1">
            <TodaysPracticeList
              items={practice.items}
              loading={practice.loading}
              pendingItemKeys={practice.pendingItemKeys}
              onMarkAllComplete={practice.markAllComplete}
            />
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
