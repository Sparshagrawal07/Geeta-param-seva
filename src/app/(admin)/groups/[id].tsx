import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { GroupSettingsModal } from '@/components/admin/group-settings-modal';
import { Screen } from '@/components/layout/screen';
import { SpiritualSurface, SpiritualSurfaceBody } from '@/components/spiritual/spiritual-surface';
import { AppText } from '@/components/ui/app-text';
import { AppSpinner } from '@/components/ui/app-spinner';
import { GlassIconButton } from '@/components/ui/glass-pressable';
import { ErrorState } from '@/components/ui/error-state';
import { InfoCard } from '@/components/ui/info-card';
import { LoadingOverlay } from '@/components/ui/loading-overlay';
import { useAuth } from '@/hooks/use-auth';
import { useAppColors } from '@/hooks/use-app-colors';
import { useTransientMessage } from '@/hooks/use-transient-message';
import { formatDateTime } from '@/lib/format';
import { triggerHaptic } from '@/lib/haptics';
import { isSeniorAdmin } from '@/lib/users';
import { fetchGroups, fetchGroupMembers } from '@/services/groups';
import { fetchMembers } from '@/services/members';
import type { Group } from '@/types/group';
import { useLocale } from '@/providers/locale-provider';

export default function GroupDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const { t, locale } = useLocale();
  const colors = useAppColors();

  const [group, setGroup] = useState<Group | null>(null);
  const [adminCount, setAdminCount] = useState(0);
  const [memberCount, setMemberCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { message: statusMessage, showSuccess, showNotice } = useTransientMessage();

  const reportSuccess = (msg: string) => {
    showSuccess(msg);
    void triggerHaptic('success');
  };

  const reportFailure = (msg: string) => {
    showNotice(msg);
    void triggerHaptic('error');
  };

  const load = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!id) return;

      const silent = options?.silent ?? false;

      try {
        if (silent) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }
        setError('');

        const [groups, groupMembers, users] = await Promise.all([
          fetchGroups(),
          fetchGroupMembers(id),
          fetchMembers(profile),
        ]);
        const found = groups.find((g) => g.id === id) ?? null;
        setGroup(found);
        setMemberCount(groupMembers.length);
        setAdminCount(
          users.filter((user) => user.role === 'admin' && user.assignedGroupIds?.includes(id)).length
        );
      } catch {
        setError(t('errorGroupsLoad'));
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id, profile, t]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load({ silent: true });
    }, [load])
  );

  if (!isSeniorAdmin(profile?.role)) {
    return <Redirect href="/(admin)/(tabs)" />;
  }

  if (loading && !group) {
    return (
      <Screen showBack title={t('groupDetails')}>
        <View className="flex-1 items-center justify-center py-16">
          <AppSpinner size="md" />
        </View>
      </Screen>
    );
  }

  if (error || !group) {
    return (
      <Screen showBack title={t('groupDetails')} contentClassName="px-5 pb-10 pt-2">
        <ErrorState message={error || t('errorGroupsLoad')} onRetry={() => void load()} />
      </Screen>
    );
  }

  return (
    <Screen
      showBack
      title={group.name}
      contentClassName="relative px-5 pb-10 pt-2"
      rightAction={
        <GlassIconButton
          accessibilityLabel={t('groupSettings')}
          disabled={refreshing}
          haptic="light"
          onPress={() => setSettingsOpen(true)}
          fallbackClassName="items-center justify-center rounded-full border border-saffron/20 bg-saffron/10 dark:border-gold/25 dark:bg-gold/15">
          <Ionicons name="settings-outline" size={22} color={colors.saffron} />
        </GlassIconButton>
      }>
      <View style={{ opacity: refreshing ? 0.55 : 1 }}>
        {group.description ? (
          <AppText className="mb-4 text-base leading-7 text-gp-muted dark:text-gp-muted-dark">
            {group.description}
          </AppText>
        ) : null}

        {statusMessage ? (
          <AppText className="mb-4 text-sm text-gp-muted dark:text-gp-muted-dark">{statusMessage}</AppText>
        ) : null}

        <AppText bold className="mb-3 text-base text-gp-text dark:text-gp-text-dark">
          {t('groupDetails')}
        </AppText>

        <SpiritualSurface variant="elevated" className="mb-4">
          <SpiritualSurfaceBody className="py-4">
            <View className="flex-row gap-3">
              <InfoCard label={t('adminsCount')} value={String(adminCount)} />
              <InfoCard label={t('membersCount')} value={String(memberCount)} />
            </View>
          </SpiritualSurfaceBody>
        </SpiritualSurface>

        <SpiritualSurface variant="elevated" className="mb-4">
          <SpiritualSurfaceBody className="py-4">
            <AppText className="text-sm text-gp-muted dark:text-gp-muted-dark">{t('groupDescription')}</AppText>
            <AppText bold className="mt-2 text-base text-gp-text dark:text-gp-text-dark">
              {group.description || t('emptyValue')}
            </AppText>
          </SpiritualSurfaceBody>
        </SpiritualSurface>

        <SpiritualSurface variant="elevated">
          <SpiritualSurfaceBody className="py-4">
            <AppText className="text-sm text-gp-muted dark:text-gp-muted-dark">{t('createdAt')}</AppText>
            <AppText bold className="mt-2 text-base text-gp-text dark:text-gp-text-dark">
              {formatDateTime(group.createdAt, locale)}
            </AppText>
          </SpiritualSurfaceBody>
        </SpiritualSurface>
      </View>

      <LoadingOverlay visible={refreshing} />

      <GroupSettingsModal
        visible={settingsOpen}
        group={group}
        onClose={() => setSettingsOpen(false)}
        onGroupUpdated={(updated) => {
          setGroup(updated);
        }}
        onDeleted={() => router.back()}
        onSuccess={reportSuccess}
        onError={reportFailure}
        onDataChanged={() => load({ silent: true })}
      />
    </Screen>
  );
}
