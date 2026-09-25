import { useCallback } from 'react';
import { View } from 'react-native';

import { useGroupFeed, GroupFeedList } from '@/components/feed/group-feed';
import { SafeBannerAd } from '@/components/ads/safe-banner-ad';
import { Screen } from '@/components/layout/screen';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionHeader } from '@/components/ui/section-header';
import { useAuth } from '@/hooks/use-auth';
import { useLocalPerformanceSpan } from '@/hooks/use-local-performance-span';
import { LOCAL_PERFORMANCE_BUDGETS } from '@/lib/local-performance';
import { useLocale } from '@/providers/locale-provider';

export default function UserSevaScreen() {
  const { profile } = useAuth();
  const { t } = useLocale();
  const groupId = profile?.groupId ?? null;
  const feed = useGroupFeed(groupId);
  useLocalPerformanceSpan(
    'screen.seva.cached-ready',
    !feed.loading,
    LOCAL_PERFORMANCE_BUDGETS.cachedScreenReadyMs
  );

  const handleRefresh = useCallback(async () => {
    await feed.handleRefresh();
  }, [feed]);

  if (!groupId) {
    return (
      <Screen contentClassName="px-5 pb-10 pt-2">
        <EmptyState title={t('pendingGroupTitle')} message={t('pendingGroupMessage')} />
      </Screen>
    );
  }

  return (
    <Screen
      scrollable={false}
      contentClassName="px-0 pt-2"
      animateContent={false}>
      <View testID="screen-seva" className="flex-1">
        <GroupFeedList
          groupId={groupId}
          items={feed.items}
          loading={feed.loading}
          error={feed.error}
          refreshing={feed.refreshing}
          onRefresh={() => void handleRefresh()}
          header={
            <View className="px-5">
              <SectionHeader
                title={t('sevaTabTitle')}
                subtitle={t('sevaTabSubtitle')}
                showLotus={false}
              />
            </View>
          }
          footer={
            <View className="mt-10 px-5">
              <SafeBannerAd screen="seva" slot={1} />
            </View>
          }
        />
      </View>
    </Screen>
  );
}
