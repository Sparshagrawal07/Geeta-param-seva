import { useCallback } from 'react';
import { RefreshControl, View } from 'react-native';

import { useGroupFeed, GroupFeedList } from '@/components/feed/group-feed';
import { SafeBannerAd } from '@/components/ads/safe-banner-ad';
import { Screen } from '@/components/layout/screen';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionHeader } from '@/components/ui/section-header';
import { useAuth } from '@/hooks/use-auth';
import { useLocale } from '@/providers/locale-provider';

export default function UserSevaScreen() {
  const { profile } = useAuth();
  const { t } = useLocale();
  const groupId = profile?.groupId ?? null;
  const feed = useGroupFeed(groupId);

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
      contentClassName="px-5 pb-10 pt-2"
      animateContent={false}
      scrollProps={{
        refreshControl: (
          <RefreshControl refreshing={feed.refreshing} onRefresh={() => void handleRefresh()} />
        ),
      }}>
      <SectionHeader title={t('sevaTabTitle')} subtitle={t('sevaTabSubtitle')} showLotus={false} />

      <GroupFeedList
        groupId={groupId}
        items={feed.items}
        loading={feed.loading}
        error={feed.error}
        refreshing={feed.refreshing}
        onRefresh={() => void handleRefresh()}
      />

      <View className="mt-10">
        <SafeBannerAd screen="seva" slot={1} />
      </View>
    </Screen>
  );
}
