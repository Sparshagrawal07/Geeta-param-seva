import { forwardRef, useCallback, useImperativeHandle, useState, type ReactNode } from 'react';
import { RefreshControl, View } from 'react-native';

import { AnnouncementPostCard } from '@/components/feed/announcement-post-card';
import { FeedDeleteOverlay } from '@/components/feed/feed-delete-overlay';
import { ReportContentModal } from '@/components/feed/report-content-modal';
import { SevaPostCard } from '@/components/feed/seva-post-card';
import { AppSpinner } from '@/components/ui/app-spinner';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { FadeInView } from '@/components/ui/fade-in-view';
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
}

export interface GroupFeedListHandle {
  dismissDeleteMode: () => void;
}

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

  if (!groupId) {
    return <EmptyState title={t('noGroupAssigned')} message={t('selectGroup')} />;
  }

  return (
    <>
      <View className="gap-6">
        {loading && !refreshing ? (
          <View className="items-center py-6">
            <AppSpinner size="md" />
          </View>
        ) : null}

        {error ? <ErrorState message={error} onRetry={onRefresh} /> : null}

        {!loading && !error && items.length === 0 ? (
          <EmptyState title={t('feedEmptyTitle')} message={t('feedEmptyMessage')} />
        ) : null}

        <View className="gap-4">
          {items.map((item, index) => {
            const canDelete = canDeletePost?.(item) ?? false;
            const deleteProps = canDelete && confirmDelete
              ? {
                  deletable: true,
                  deleteActive: activeDelete?.itemId === item.id,
                  onShowDelete: (position: { x: number; y: number }) =>
                    setActiveDelete({ itemId: item.id, buttonX: position.x, buttonY: position.y }),
                }
              : {};

            const reportProps =
              allowReport && profile && item.createdBy !== profile.uid
                ? {
                    reportable: true as const,
                    onReport: () => setReportItem(item),
                  }
                : {};

            const wrap = (card: ReactNode) => (
              <FadeInView key={item.id} index={index} slide>
                {card}
              </FadeInView>
            );

            if (item.type === 'seva') {
              return wrap(<SevaPostCard post={item} {...deleteProps} {...reportProps} />);
            }

            return wrap(<AnnouncementPostCard post={item} {...deleteProps} {...reportProps} />);
          })}
        </View>
      </View>

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
