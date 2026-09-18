import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, View } from 'react-native';
import { useRouter } from 'expo-router';

import { Screen } from '@/components/layout/screen';
import { SpiritualSurface, SpiritualSurfaceBody } from '@/components/spiritual/spiritual-surface';
import { AppButton } from '@/components/ui/button';
import { AppSpinner } from '@/components/ui/app-spinner';
import { AppText } from '@/components/ui/app-text';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { SectionHeader } from '@/components/ui/section-header';
import { useGroups } from '@/hooks/use-groups';
import { formatFeedDateTime } from '@/lib/format';
import { triggerHaptic } from '@/lib/haptics';
import { useAlert } from '@/providers/alert-provider';
import { useLocale } from '@/providers/locale-provider';
import {
  dismissContentReport,
  listOpenContentReports,
  resolveContentReport,
} from '@/services/content-reports';
import { deleteFeedItem } from '@/services/feed';
import type { ContentReport, ContentReportReason } from '@/types/content-report';
import type { FeedItem } from '@/types/feed';

const REASON_LABEL_KEYS: Record<
  ContentReportReason,
  | 'reportReasonInappropriate'
  | 'reportReasonOffensive'
  | 'reportReasonHarassment'
  | 'reportReasonSpam'
  | 'reportReasonIncorrect'
  | 'reportReasonOther'
> = {
  inappropriate: 'reportReasonInappropriate',
  offensive: 'reportReasonOffensive',
  harassment: 'reportReasonHarassment',
  spam: 'reportReasonSpam',
  incorrect: 'reportReasonIncorrect',
  other: 'reportReasonOther',
};

function toDeletableFeedItem(report: ContentReport): FeedItem {
  return {
    id: report.contentId,
    type: 'announcement',
    groupId: report.groupId,
    title: report.contentTitle,
    message: '',
    createdBy: report.contentCreatorUid,
    createdByName: report.contentCreatorName,
    createdAt: report.createdAt,
  };
}

export default function AdminContentReportsScreen() {
  const { t, locale } = useLocale();
  const { alert, confirm } = useAlert();
  const router = useRouter();
  const { groups, loading: groupsLoading } = useGroups();
  const [reports, setReports] = useState<ContentReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [actingId, setActingId] = useState('');

  const groupName = useCallback(
    (groupId: string) => groups.find((g) => g.id === groupId)?.name ?? groupId,
    [groups]
  );

  const refresh = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      const groupIds = groups.map((g) => g.id);
      try {
        if (!silent) setLoading(true);
        setError('');
        if (groupIds.length === 0) {
          setReports([]);
          return;
        }
        setReports(await listOpenContentReports(groupIds));
      } catch {
        setError(t('errorUnexpected'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [groups, t]
  );

  useEffect(() => {
    if (groupsLoading) return;
    void refresh({ silent: false });
  }, [groupsLoading, refresh]);

  const handleDismiss = (report: ContentReport) => {
    confirm({
      title: t('contentReportDismiss'),
      message: report.contentTitle,
      confirmLabel: t('contentReportDismiss'),
      cancelLabel: t('cancel'),
      onConfirm: () => {
        void (async () => {
          try {
            setActingId(report.id);
            await dismissContentReport(report.id);
            setReports((prev) => prev.filter((r) => r.id !== report.id));
            void triggerHaptic('success');
            alert({ title: t('contentReportsTitle'), message: t('contentReportDismissedToast') });
          } catch {
            void triggerHaptic('error');
            alert({ title: t('contentReportsTitle'), message: t('errorUnexpected') });
          } finally {
            setActingId('');
          }
        })();
      },
    });
  };

  const handleRemove = (report: ContentReport) => {
    confirm({
      title: t('contentReportRemove'),
      message: t('deletePostConfirm'),
      confirmLabel: t('contentReportRemove'),
      cancelLabel: t('cancel'),
      destructive: true,
      onConfirm: () => {
        void (async () => {
          try {
            setActingId(report.id);
            try {
              await deleteFeedItem(toDeletableFeedItem(report));
            } catch {
              // Post may already be gone; still close the report.
            }
            await resolveContentReport(report.id);
            setReports((prev) => prev.filter((r) => r.id !== report.id));
            void triggerHaptic('success');
            alert({ title: t('contentReportsTitle'), message: t('contentReportRemoved') });
          } catch {
            void triggerHaptic('error');
            alert({ title: t('contentReportsTitle'), message: t('errorUnexpected') });
          } finally {
            setActingId('');
          }
        })();
      },
    });
  };

  return (
    <Screen
      showBack
      title={t('contentReportsTitle')}
      contentClassName="px-5 pb-10 pt-2"
      animateContent={false}
      edges={['top', 'bottom']}
      scrollProps={{
        refreshControl: (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void refresh({ silent: true });
            }}
          />
        ),
      }}>
      <SectionHeader title={t('contentReportsTitle')} subtitle={t('contentReportsSubtitle')} />

      {loading || groupsLoading ? (
        <View className="items-center py-10">
          <AppSpinner size="md" />
        </View>
      ) : null}

      {error ? <ErrorState message={error} onRetry={() => void refresh()} /> : null}

      {!loading && !groupsLoading && !error && reports.length === 0 ? (
        <EmptyState title={t('contentReportsEmptyTitle')} message={t('contentReportsEmptyMessage')} />
      ) : null}

      <View className="mt-2 gap-4">
        {reports.map((report) => {
          const busy = actingId === report.id;
          return (
            <SpiritualSurface key={report.id} variant="elevated">
              <SpiritualSurfaceBody className="gap-3 py-4">
                <View className="flex-row items-start justify-between gap-3">
                  <View className="min-w-0 flex-1">
                    <AppText bold className="text-base text-gp-text dark:text-gp-text-dark">
                      {report.contentTitle || report.contentId}
                    </AppText>
                    <AppText className="mt-1 text-xs text-gp-muted dark:text-gp-muted-dark">
                      {formatFeedDateTime(report.createdAt, locale)} · {groupName(report.groupId)}
                    </AppText>
                  </View>
                  <View className="rounded-full bg-saffron/15 px-2.5 py-1 dark:bg-gold/20">
                    <AppText className="text-xs text-saffron dark:text-saffron-light">
                      {t('contentReportsOpen')}
                    </AppText>
                  </View>
                </View>

                <AppText className="text-sm text-gp-text dark:text-gp-text-dark">
                  {t(REASON_LABEL_KEYS[report.reason])}
                </AppText>

                {report.details ? (
                  <AppText className="text-sm leading-6 text-gp-muted dark:text-gp-muted-dark">
                    {t('contentReportDetails')}: {report.details}
                  </AppText>
                ) : null}

                <AppText className="text-sm text-gp-muted dark:text-gp-muted-dark">
                  {t('contentReportReporter')}: {report.reporterName || report.reporterUid}
                </AppText>
                <AppText className="text-sm text-gp-muted dark:text-gp-muted-dark">
                  {t('contentReportCreator')}: {report.contentCreatorName || report.contentCreatorUid}
                </AppText>

                <View className="mt-1 gap-2">
                  <AppButton
                    label={t('contentReportRemove')}
                    loading={busy}
                    fullWidth
                    onPress={() => handleRemove(report)}
                  />
                  <AppButton
                    label={t('contentReportDismiss')}
                    variant="secondary"
                    disabled={busy}
                    fullWidth
                    onPress={() => handleDismiss(report)}
                  />
                </View>
              </SpiritualSurfaceBody>
            </SpiritualSurface>
          );
        })}
      </View>

      <Pressable
        onPress={() => {
          void triggerHaptic('light');
          router.push('/(admin)/(tabs)/members');
        }}
        className="mt-6 rounded-2xl border border-saffron/20 bg-saffron/8 px-4 py-3.5 dark:border-gold/25 dark:bg-gold/10">
        <AppText className="text-sm leading-6 text-gp-text dark:text-gp-text-dark">
          {t('contentReportDeactivateHint')}
        </AppText>
      </Pressable>
    </Screen>
  );
}
