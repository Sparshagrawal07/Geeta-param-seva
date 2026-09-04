import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AdminQuickActionCard } from '@/components/admin/admin-quick-action-card';
import { AdminWelcomeCard } from '@/components/admin/admin-welcome-card';
import { GroupScopeSelector } from '@/components/admin/group-scope-selector';
import { StatCard } from '@/components/admin/stat-card';
import { StatsGrid } from '@/components/admin/stats-grid';
import { StatsGridSkeleton } from '@/components/admin/stats-grid-skeleton';
import { AccountSettingsButton } from '@/components/legal/account-settings-button';
import { Screen } from '@/components/layout/screen';
import { SpiritualSurface, SpiritualSurfaceBody } from '@/components/spiritual/spiritual-surface';
import { AppText } from '@/components/ui/app-text';
import { ErrorState } from '@/components/ui/error-state';
import { FadeInView } from '@/components/ui/fade-in-view';
import { InfoCard } from '@/components/ui/info-card';
import { HomeHeroSection } from '@/components/verse/home-hero-section';
import { useAdminStats } from '@/hooks/use-admin-stats';
import { useAuth } from '@/hooks/use-auth';
import { useGroups } from '@/hooks/use-groups';
import { useSelectedGroup } from '@/hooks/use-selected-group';
import { isSeniorAdmin } from '@/lib/users';
import { useLocale } from '@/providers/locale-provider';
import { getPracticeAdminOverviewRemote } from '@/services/practice';
import type { PracticeAdminOverview } from '@/lib/practice';
import type { MessageKey } from '@/lib/i18n/messages';

const SECTION_GAP = 28;
const STATS_SECTION_MIN_HEIGHT = 180;

type QuickAction = {
  key: string;
  labelKey: MessageKey;
  icon: keyof typeof Ionicons.glyphMap;
  href: string;
};

export default function AdminDashboardScreen() {
  const { profile } = useAuth();
  const { t } = useLocale();
  const isSenior = isSeniorAdmin(profile?.role);

  const { groups } = useGroups();
  const { selectedGroupId, setSelectedGroupId } = useSelectedGroup(groups);

  const scopeId = isSenior ? (selectedGroupId ?? null) : selectedGroupId;
  const { stats, loading, error, refresh } = useAdminStats(scopeId);
  const [practiceOverview, setPracticeOverview] = useState<PracticeAdminOverview | null>(null);

  const loadPracticeOverview = useCallback(async () => {
    if (!selectedGroupId) {
      setPracticeOverview(null);
      return;
    }
    try {
      setPracticeOverview(await getPracticeAdminOverviewRemote(selectedGroupId));
    } catch {
      setPracticeOverview(null);
    }
  }, [selectedGroupId]);

  useFocusEffect(
    useCallback(() => {
      void refresh({ silent: true });
      void loadPracticeOverview();
    }, [refresh, loadPracticeOverview])
  );

  const seniorActions: QuickAction[] = [
    { key: 'member', labelKey: 'quickActionAddMember', icon: 'person-add-outline', href: '/(admin)/members' },
    { key: 'admin', labelKey: 'quickActionAddAdmin', icon: 'shield-outline', href: '/(admin)/members' },
    { key: 'group', labelKey: 'quickActionCreateGroup', icon: 'layers-outline', href: '/(admin)/groups' },
    { key: 'practice', labelKey: 'quickActionPractice', icon: 'book-outline', href: '/(admin)/practice' },
    { key: 'create', labelKey: 'quickActionCreatePost', icon: 'create-outline', href: '/(admin)/create' },
  ];

  const adminActions: QuickAction[] = [
    { key: 'member', labelKey: 'quickActionAddMember', icon: 'person-add-outline', href: '/(admin)/members' },
    { key: 'practice', labelKey: 'quickActionPractice', icon: 'book-outline', href: '/(admin)/practice' },
    { key: 'create', labelKey: 'quickActionCreatePost', icon: 'create-outline', href: '/(admin)/create' },
    { key: 'feed', labelKey: 'tabFeed', icon: 'newspaper-outline', href: '/(admin)/feed' },
  ];

  const actions = isSenior ? seniorActions : adminActions;
  const roleLabel = isSenior ? t('roleSeniorAdmin') : t('roleAdmin');

  return (
    <Screen
      contentClassName="relative px-0 pb-10 pt-0"
      edges={['bottom']}
      animateContent={false}>
      <HomeHeroSection
        name={profile?.name ?? ''}
        showNotificationBell={false}
        rightAction={<AccountSettingsButton light />}
      />

      <View className="relative z-20 px-5" style={{ marginTop: 8 }}>
        <AdminWelcomeCard
          name={profile?.name || t('emptyValue')}
          phone={profile?.phoneNumber || undefined}
          roleLabel={roleLabel}
          nameLabel={t('name')}
          phoneLabel={t('phoneLabel')}
          roleFieldLabel={t('adminDashboardTitle')}
        />

        <View style={{ marginTop: 20 }}>
          <GroupScopeSelector
            groups={groups}
            selectedGroupId={selectedGroupId}
            onSelect={(id) => void setSelectedGroupId(id)}
            hint={groups.length > 1 ? t('selectGroupHint') : undefined}
            disabled={loading}
          />
        </View>

        <View style={{ marginTop: SECTION_GAP, minHeight: STATS_SECTION_MIN_HEIGHT }}>
          <AppText bold className="mb-3 text-base text-gp-text dark:text-gp-text-dark">
            {t('adminDashboardSubtitle')}
          </AppText>
          {loading ? <StatsGridSkeleton /> : null}

          {!loading && error ? <ErrorState message={error} onRetry={() => void refresh()} /> : null}

          {!loading && !error && stats ? (
            <FadeInView key={selectedGroupId ?? 'all'}>
              <StatsGrid>
                <StatCard label={t('statTotalMembers')} value={stats.totalMembers} />
                <StatCard label={t('statTotalPosts')} value={stats.totalPosts} />
              </StatsGrid>
            </FadeInView>
          ) : null}
        </View>

        {selectedGroupId && practiceOverview ? (
          <View style={{ marginTop: SECTION_GAP }}>
            <AppText bold className="mb-3 text-base text-gp-text dark:text-gp-text-dark">
              {t('practiceTodaySection')}
            </AppText>
            <SpiritualSurface variant="elevated">
              <SpiritualSurfaceBody className="py-4">
                <View className="flex-row gap-3">
                  <InfoCard label={t('practiceAssignedMembers')} value={String(practiceOverview.memberCount)} />
                  <InfoCard label={t('practiceCompleteCount')} value={String(practiceOverview.completeCount)} />
                  <InfoCard label={t('practiceIncompleteCount')} value={String(practiceOverview.incompleteCount)} />
                </View>
                <AppText className="mt-3 text-xs text-gp-muted dark:text-gp-muted-dark">
                  {t('practiceDayLabel')}: {practiceOverview.practiceDateKey}
                </AppText>
              </SpiritualSurfaceBody>
            </SpiritualSurface>
          </View>
        ) : null}

        <View style={{ marginTop: SECTION_GAP }}>
          <AppText bold className="mb-3 text-base text-gp-text dark:text-gp-text-dark">
            {t('quickActionsTitle')}
          </AppText>
          <View className="flex-row flex-wrap gap-3">
            {actions.map((action) => (
              <AdminQuickActionCard
                key={action.key}
                label={t(action.labelKey)}
                icon={action.icon}
                href={action.href}
              />
            ))}
          </View>
        </View>
      </View>
    </Screen>
  );
}
