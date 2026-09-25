import {
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useMemo,
  useState,
  type ReactElement,
} from 'react';
import { FlatList, RefreshControl, View } from 'react-native';

import { AnnouncementPostCard } from '@/components/feed/announcement-post-card';
import { FeedDeleteOverlay } from '@/components/feed/feed-delete-overlay';
import { ReportContentModal } from '@/components/feed/report-content-modal';
import { SevaPostCard } from '@/components/feed/seva-post-card';
import { AppSpinner } from '@/components/ui/app-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { useAuth } from '@/hooks/use-auth';
import { useFeed } from '@/hooks/use-feed';
import { isAdminRole } from '@/lib/users';
import { triggerHaptic } from '@/lib/haptics';
import { useAlert } from '@/providers/alert-provider';
import { useLocale } from '@/providers/locale-provider';
import { deleteFeedItem } from '@/services/feed';
import type { FeedItem } from '@/types/feed';

interface ActiveDeleteState {
  itemId: string;
  buttonX: number;
  buttonY: number;
}

export function useGroupFeed(groupId: string | null, _refreshOnFocus = false, allowDelete = false) {
  const { profile } = useAuth();
  const { t } = useLocale();
  const { alert, confirm } = useAlert();
  const { items, loading, error, refresh, removeItem } = useFeed(groupId);
  const [deletingId, setDeletingId] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh({ silent: true });
    setRefreshing(false);
  }, [refresh]);

  const canDeletePost = useCallback(
    (item: FeedItem) =>
      allowDelete &&
      !!profile &&
      isAdminRole(profile.role) &&
      item.createdBy === profile.uid,
    [allowDelete, profile]
  );

  const handleDelete = useCallback(
    async (item: FeedItem) => {
      const previousId = item.id;
      removeItem(previousId);
      try {
        setDeletingId(item.id);
        await deleteFeedItem(item);
        void triggerHaptic('success');
      } catch {
        await refresh({ silent: true });
        alert({ title: t('deletePost'), message: t('deletePostFailed') });
        void triggerHaptic('error');
      } finally {
        setDeletingId('');
      }
    },
    [alert, refresh, removeItem, t]
  );

  const confirmDelete = useCallback(
    (item: FeedItem, onDismissOverlay: () => void) => {
      confirm({
        title: t('deletePost'),
        message: t('deletePostConfirm'),
        confirmLabel: t('deletePost'),
        cancelLabel: t('cancel'),
        destructive: true,
        onConfirm: () => void handleDelete(item),
        onCancel: onDismissOverlay,
      });
    },
    [confirm, handleDelete, t]
  );

  const refreshControl = (
    <RefreshControl refreshing={refreshing} onRefresh={() => void handleRefresh()} />
  );

  return {
    items,
    loading,
    error,
    refreshing,
    handleRefresh,
    handleDelete,
    confirmDelete,
    canDeletePost,
    deletingId,
    refreshControl,
  };
}

interface GroupFeedListProps {
  groupId: string | null;
  items: ReturnType<typeof useFeed>['items'];
  loading: boolean;
  error: string;
  refreshing: boolean;
  deletingId?: string;
  onRefresh: () => void;
  canDeletePost?: (item: FeedItem) => boolean;
  confirmDelete?: (item: FeedItem, onDismissOverlay: () => void) => void;
  /** When true (default), show Report Content on each post. */
  allowReport?: boolean;
  header?: ReactElement | null;
  footer?: ReactElement | null;
  onScrollBeginDrag?: () => void;
}

export interface GroupFeedListHandle {
  dismissDeleteMode: () => void;
}

interface FeedRowProps {
  item: FeedItem;
  canDelete: boolean;
  deleteActive: boolean;
  reportable: boolean;
  onShowDelete: (item: FeedItem, position: { x: number; y: number }) => void;
  onReport: (item: FeedItem) => void;
}

const FeedRow = memo(function FeedRow({
  item,
  canDelete,
  deleteActive,
  reportable,
  onShowDelete,
  onReport,
}: FeedRowProps) {
  const handleShowDelete = useCallback(
    (position: { x: number; y: number }) => onShowDelete(item, position),
    [item, onShowDelete]
  );
  const handleReport = useCallback(() => onReport(item), [item, onReport]);
  const actions = {
    ...(canDelete
      ? {
          deletable: true,
          deleteActive,
          onShowDelete: handleShowDelete,
        }
      : {}),
    ...(reportable
      ? {
          reportable: true,
          onReport: handleReport,
        }
      : {}),
  };

  return (
    <View className="px-5">
      {item.type === 'seva' ? (
        <SevaPostCard post={item} {...actions} />
      ) : (
        <AnnouncementPostCard post={item} {...actions} />
      )}
    </View>
  );
});

export const GroupFeedList = forwardRef<GroupFeedListHandle, GroupFeedListProps>(function GroupFeedList(
  {
    groupId,
    items,
    loading,
    error,
    refreshing,
    deletingId = '',
    onRefresh,
    canDeletePost,
    confirmDelete,
    allowReport = true,
    header,
    footer,
    onScrollBeginDrag,
  },
  ref
) {
  const { t } = useLocale();
  const { profile } = useAuth();
  const [activeDelete, setActiveDelete] = useState<ActiveDeleteState | null>(null);
  const [reportItem, setReportItem] = useState<FeedItem | null>(null);

  const dismissDeleteMode = useCallback(() => {
    setActiveDelete(null);
  }, []);

  useImperativeHandle(ref, () => ({ dismissDeleteMode }), [dismissDeleteMode]);

  const activeItem = activeDelete ? items.find((item) => item.id === activeDelete.itemId) : null;
  const showDelete = useCallback((item: FeedItem, position: { x: number; y: number }) => {
    setActiveDelete({ itemId: item.id, buttonX: position.x, buttonY: position.y });
  }, []);
  const showReport = useCallback((item: FeedItem) => setReportItem(item), []);
  const keyExtractor = useCallback((item: FeedItem) => item.id, []);
  const renderItem = useCallback(
    ({ item }: { item: FeedItem }) => (
      <FeedRow
        item={item}
        canDelete={(canDeletePost?.(item) ?? false) && Boolean(confirmDelete)}
        deleteActive={activeDelete?.itemId === item.id}
        reportable={Boolean(allowReport && profile && item.createdBy !== profile.uid)}
        onShowDelete={showDelete}
        onReport={showReport}
      />
    ),
    [activeDelete?.itemId, allowReport, canDeletePost, confirmDelete, profile, showDelete, showReport]
  );
  const empty = useMemo(() => {
    if (!groupId) {
      return (
        <View className="px-5">
          <EmptyState title={t('noGroupAssigned')} message={t('selectGroup')} />
        </View>
      );
    }
    if (loading && !refreshing) {
      return (
        <View className="items-center py-6">
          <AppSpinner size="md" />
        </View>
      );
    }
    if (error) {
      return (
        <View className="px-5">
          <ErrorState message={error} onRetry={onRefresh} />
        </View>
      );
    }
    return (
      <View className="px-5">
        <EmptyState title={t('feedEmptyTitle')} message={t('feedEmptyMessage')} />
      </View>
    );
  }, [error, groupId, loading, onRefresh, refreshing, t]);

  return (
    <>
      <FlatList
        data={groupId && !error ? items : []}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={footer}
        ItemSeparatorComponent={() => <View className="h-4" />}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        onScrollBeginDrag={() => {
          dismissDeleteMode();
          onScrollBeginDrag?.();
        }}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={4}
        maxToRenderPerBatch={6}
        windowSize={7}
        removeClippedSubviews={false}
        showsVerticalScrollIndicator={false}
      />

      <FeedDeleteOverlay
        visible={!!activeDelete}
        buttonX={activeDelete?.buttonX ?? 0}
        buttonY={activeDelete?.buttonY ?? 0}
        deleting={!!activeDelete && deletingId === activeDelete.itemId}
        onDismiss={dismissDeleteMode}
        onDeletePress={() => {
          if (activeItem && confirmDelete) {
            dismissDeleteMode();
            confirmDelete(activeItem, () => undefined);
          }
        }}
      />

      <ReportContentModal
        visible={!!reportItem}
        item={reportItem}
        reporterUid={profile?.uid ?? ''}
        reporterName={profile?.name ?? ''}
        onClose={() => setReportItem(null)}
      />
    </>
  );
});
