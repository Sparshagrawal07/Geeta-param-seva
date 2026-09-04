import { useRef } from 'react';

import { GroupFeedList, useGroupFeed, type GroupFeedListHandle } from '@/components/feed/group-feed';
import { GroupScopeSelector } from '@/components/admin/group-scope-selector';
import { Screen } from '@/components/layout/screen';
import { SpiritualSurface, SpiritualSurfaceBody } from '@/components/spiritual/spiritual-surface';
import { SectionHeader } from '@/components/ui/section-header';
import { useGroups } from '@/hooks/use-groups';
import { useSelectedGroup } from '@/hooks/use-selected-group';
import { useLocale } from '@/providers/locale-provider';

export default function AdminFeedScreen() {
  const { t } = useLocale();
  const { groups } = useGroups();
  const { selectedGroupId, setSelectedGroupId } = useSelectedGroup(groups);
  const feed = useGroupFeed(selectedGroupId, true, true);
  const feedListRef = useRef<GroupFeedListHandle>(null);

  return (
    <Screen
      contentClassName="relative px-5 pb-10 pt-2"
      animateContent={false}
      scrollProps={{
        refreshControl: feed.refreshControl,
        onScrollBeginDrag: () => feedListRef.current?.dismissDeleteMode(),
      }}>
      <SectionHeader title={t('feedTitle')} subtitle={t('feedSubtitle')} />

      <SpiritualSurface variant="elevated" className="mb-4">
        <SpiritualSurfaceBody className="py-4">
          <GroupScopeSelector
            groups={groups}
            selectedGroupId={selectedGroupId}
            onSelect={(id) => void setSelectedGroupId(id)}
            hint={groups.length > 1 ? t('feedGroupHint') : undefined}
          />
        </SpiritualSurfaceBody>
      </SpiritualSurface>

      <GroupFeedList
        ref={feedListRef}
        groupId={selectedGroupId}
        items={feed.items}
        loading={feed.loading}
        error={feed.error}
        refreshing={feed.refreshing}
        deletingId={feed.deletingId}
        onRefresh={() => void feed.handleRefresh()}
        canDeletePost={feed.canDeletePost}
        confirmDelete={feed.confirmDelete}
      />
    </Screen>
  );
}

