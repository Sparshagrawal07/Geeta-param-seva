import { memo, useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { GroupScopeSelector } from '@/components/admin/group-scope-selector';
import { RosterEditorSheet, type RosterEditorMode } from '@/components/admin/roster-editor-sheet';
import { Screen } from '@/components/layout/screen';
import { SpiritualSurface, SpiritualSurfaceBody } from '@/components/spiritual/spiritual-surface';
import { AppButton } from '@/components/ui/button';
import { AppSelect } from '@/components/ui/app-select';
import { AppText } from '@/components/ui/app-text';
import { AppSpinner } from '@/components/ui/app-spinner';
import { AppTextField } from '@/components/ui/text-field';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { SectionHeader } from '@/components/ui/section-header';
import { useAuth } from '@/hooks/use-auth';
import { useAppColors } from '@/hooks/use-app-colors';
import { useGroups } from '@/hooks/use-groups';
import { useRosterPage } from '@/hooks/use-roster';
import { useSelectedGroup } from '@/hooks/use-selected-group';
import { useTransientMessage } from '@/hooks/use-transient-message';
import { triggerHaptic } from '@/lib/haptics';
import { isSeniorAdmin } from '@/lib/users';
import { useLocale } from '@/providers/locale-provider';
import {
  listJoinApplicationsRemote,
  markJoinApplicationAddedRemote,
  rejectJoinApplicationRemote,
} from '@/services/join-applications';
import type { JoinApplication } from '@/types/join-application';
import type { AccessRosterEntry, RosterRole, RosterStatus } from '@/types/roster';
import type { MessageKey } from '@/lib/i18n/messages';

const SECTION_GAP = 28;

type RoleFilter = 'all' | RosterRole;
type StatusFilter = 'all' | RosterStatus;

function roleBadgeText(role: RosterRole, t: (key: MessageKey) => string): string {
  return role === 'admin' ? t('roleAdmin') : t('roleMember');
}

const MemberRow = memo(function MemberRow({
  entry,
  groupLabel,
  roleLabel,
  inactiveLabel,
  saffron,
  onPress,
}: {
  entry: AccessRosterEntry;
  groupLabel: string;
  roleLabel: string;
  inactiveLabel: string;
  saffron: string;
  onPress: (entry: AccessRosterEntry) => void;
}) {
  const handlePress = useCallback(() => onPress(entry), [entry, onPress]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${entry.name}, ${roleLabel}, ${groupLabel}`}
      onPress={handlePress}>
      <SpiritualSurface variant="elevated">
        <SpiritualSurfaceBody className="gap-1 py-3.5">
          <View className="flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-full bg-saffron/12 dark:bg-gold/15">
              <Ionicons
                name={entry.role === 'admin' ? 'shield-outline' : 'person-outline'}
                size={18}
                color={saffron}
              />
            </View>
            <View className="min-w-0 flex-1">
              <AppText bold className="text-base text-gp-text dark:text-gp-text-dark">
                {entry.name}
              </AppText>
              <AppText className="text-sm text-gp-muted dark:text-gp-muted-dark">
                {entry.phoneNumber}
              </AppText>
            </View>
          </View>
          <View className="mt-1 flex-row flex-wrap items-center gap-2 pl-[52px]">
            <View className="rounded-full bg-saffron/10 px-2.5 py-1 dark:bg-gold/15">
              <AppText bold className="text-xs text-saffron dark:text-gold">
                {roleLabel}
                {entry.status === 'inactive' ? ` · ${inactiveLabel}` : ''}
              </AppText>
            </View>
            <AppText className="text-xs text-gp-muted dark:text-gp-muted-dark">
              {groupLabel}
            </AppText>
          </View>
        </SpiritualSurfaceBody>
      </SpiritualSurface>
    </Pressable>
  );
});

const memberKeyExtractor = (entry: AccessRosterEntry) => entry.id;
const MemberSeparator = () => <View className="h-2" />;

export default function AdminMembersScreen() {
  const { t } = useLocale();
  const { profile } = useAuth();
  const colors = useAppColors();
  const { groups } = useGroups();
  const { selectedGroupId, setSelectedGroupId } = useSelectedGroup(groups);
  const [query, setQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetMode, setSheetMode] = useState<RosterEditorMode>('member');
  const [editing, setEditing] = useState<AccessRosterEntry | null>(null);
  const [prefill, setPrefill] = useState<{ name: string; phoneNumber: string } | null>(null);
  const [addingFromApplication, setAddingFromApplication] = useState(false);
  const [applications, setApplications] = useState<JoinApplication[]>([]);
  const [applicationsLoading, setApplicationsLoading] = useState(true);
  const [applicationsError, setApplicationsError] = useState('');
  const [rejectingPhone, setRejectingPhone] = useState<string | null>(null);
  const { message: statusMessage, showSuccess, showNotice } = useTransientMessage();

  const isSenior = isSeniorAdmin(profile?.role);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { entries, loading, loadingMore, error, hasMore, refresh, loadMore } = useRosterPage({
    groupId: selectedGroupId,
    role: roleFilter,
    status: statusFilter,
    search: debouncedSearch,
  });

  const refreshApplications = useCallback(async () => {
    try {
      setApplicationsLoading(true);
      setApplicationsError('');
      const pending = await listJoinApplicationsRemote({ status: 'pending' });
      setApplications(pending);
    } catch {
      setApplicationsError(t('joinApplicationsLoadFailed'));
    } finally {
      setApplicationsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refreshApplications();
  }, [refreshApplications]);

  const openAdd = () => {
    void triggerHaptic('light');
    setEditing(null);
    setPrefill(null);
    setAddingFromApplication(false);
    setSheetMode(isSenior ? 'choose' : 'member');
    setSheetOpen(true);
  };

  const openEdit = useCallback((entry: AccessRosterEntry) => {
    void triggerHaptic('selection');
    setEditing(entry);
    setPrefill(null);
    setAddingFromApplication(false);
    setSheetMode(entry.role === 'admin' ? 'admin' : 'member');
    setSheetOpen(true);
  }, []);

  const openApproveAndAdd = (application: JoinApplication) => {
    void triggerHaptic('light');
    setEditing(null);
    setPrefill({ name: application.name, phoneNumber: application.phoneNumber });
    setAddingFromApplication(true);
    setSheetMode('member');
    setSheetOpen(true);
  };

  const handleReject = async (application: JoinApplication) => {
    try {
      setRejectingPhone(application.phoneNumber);
      await rejectJoinApplicationRemote(application.phoneNumber);
      showSuccess(t('joinApplicationRejected'));
      void triggerHaptic('success');
      await refreshApplications();
    } catch {
      showNotice(t('joinApplicationRejectFailed'));
      void triggerHaptic('error');
    } finally {
      setRejectingPhone(null);
    }
  };

  const groupLabel = useCallback((entry: AccessRosterEntry) => {
    if (entry.role === 'admin') {
      const names = (entry.assignedGroupIds ?? [])
        .map((id) => groups.find((group) => group.id === id)?.name ?? id)
        .filter(Boolean);
      return names.length > 0 ? names.join(', ') : t('noGroupAssigned');
    }
    if (!entry.groupId) return t('noGroupAssigned');
    return groups.find((group) => group.id === entry.groupId)?.name ?? entry.groupId;
  }, [groups, t]);
  const renderMember = useCallback(
    ({ item }: { item: AccessRosterEntry }) => (
      <MemberRow
        entry={item}
        groupLabel={groupLabel(item)}
        roleLabel={roleBadgeText(item.role, t)}
        inactiveLabel={t('statusInactive')}
        saffron={colors.saffron}
        onPress={openEdit}
      />
    ),
    [colors.saffron, groupLabel, openEdit, t]
  );

  return (
    <Screen scrollable={false} contentClassName="relative px-0 pt-2" animateContent={false}>
      <FlatList
        data={!loading && !error ? entries : []}
        keyExtractor={memberKeyExtractor}
        renderItem={renderMember}
        ItemSeparatorComponent={MemberSeparator}
        ListHeaderComponent={
          <View>
            <SectionHeader
        title={t('peopleTitle')}
        subtitle={t('peopleSubtitle')}
        action={
          <Pressable
            accessibilityLabel={t('addPerson')}
            onPress={openAdd}
            hitSlop={12}
            className="rounded-full border border-saffron/20 bg-saffron/10 p-2 dark:border-gold/25 dark:bg-gold/15">
            <Ionicons name="person-add-outline" size={22} color={colors.saffron} />
          </Pressable>
        }
            />

      <AppButton label={t('addPerson')} fullWidth onPress={openAdd} />

      {statusMessage ? (
        <AppText className="mt-4 text-sm text-gp-muted dark:text-gp-muted-dark">{statusMessage}</AppText>
      ) : null}

      <View style={{ marginTop: SECTION_GAP }}>
        <SectionHeader title={t('joinApplicationsTitle')} subtitle={t('joinApplicationsSubtitle')} />

        {applicationsLoading ? (
          <View className="items-center py-4">
            <AppSpinner size="md" />
          </View>
        ) : null}

        {applicationsError ? (
          <ErrorState message={applicationsError} onRetry={() => void refreshApplications()} />
        ) : null}

        {!applicationsLoading && !applicationsError && applications.length === 0 ? (
          <EmptyState title={t('joinApplicationsEmpty')} message={t('joinApplicationsEmptyMessage')} />
        ) : null}

        {!applicationsLoading && !applicationsError && applications.length > 0 ? (
          <View className="gap-3">
            {applications.map((application) => (
              <SpiritualSurface key={application.id} variant="elevated">
                <SpiritualSurfaceBody className="gap-3 py-3.5">
                  <View className="flex-row items-center gap-3">
                    <View className="h-10 w-10 items-center justify-center rounded-full bg-saffron/12 dark:bg-gold/15">
                      <Ionicons name="mail-unread-outline" size={18} color={colors.saffron} />
                    </View>
                    <View className="min-w-0 flex-1">
                      <AppText bold className="text-base text-gp-text dark:text-gp-text-dark">
                        {application.name}
                      </AppText>
                      <AppText className="text-sm text-gp-muted dark:text-gp-muted-dark">
                        {application.phoneNumber}
                      </AppText>
                    </View>
                  </View>
                  <View className="gap-2">
                    <AppButton
                      label={t('joinApplicationApproveAdd')}
                      fullWidth
                      size="sm"
                      onPress={() => openApproveAndAdd(application)}
                    />
                    <AppButton
                      label={t('joinApplicationReject')}
                      variant="secondary"
                      fullWidth
                      size="sm"
                      loading={rejectingPhone === application.phoneNumber}
                      onPress={() => void handleReject(application)}
                    />
                  </View>
                </SpiritualSurfaceBody>
              </SpiritualSurface>
            ))}
          </View>
        ) : null}
      </View>

      <SpiritualSurface variant="elevated" className="mt-7">
        <SpiritualSurfaceBody className="py-4">
          {isSenior || (profile?.assignedGroupIds?.length ?? 0) > 1 ? (
            <GroupScopeSelector
              groups={groups}
              selectedGroupId={selectedGroupId}
              onSelect={(id) => void setSelectedGroupId(id)}
              hint={groups.length > 1 ? t('membersGroupHint') : undefined}
            />
          ) : null}

          <AppTextField
            label={t('searchLabel')}
            value={query}
            onChangeText={setQuery}
            placeholder={t('searchPlaceholder')}
            helperText={t('peopleSearchHelper')}
          />

          <View className="mt-4 gap-3">
            <AppSelect
              label={t('filterRole')}
              value={roleFilter}
              options={[
                { value: 'all', label: t('filterAllRoles') },
                { value: 'user', label: t('roleMember') },
                { value: 'admin', label: t('roleAdmin') },
              ]}
              onSelect={(value) => setRoleFilter(value as RoleFilter)}
            />
            <AppSelect
              label={t('filterStatus')}
              value={statusFilter}
              options={[
                { value: 'all', label: t('filterAllStatuses') },
                { value: 'active', label: t('statusActive') },
                { value: 'inactive', label: t('statusInactive') },
              ]}
              onSelect={(value) => setStatusFilter(value as StatusFilter)}
            />
          </View>
        </SpiritualSurfaceBody>
      </SpiritualSurface>

      {loading ? (
        <View className="items-center py-6" style={{ marginTop: SECTION_GAP }}>
          <AppSpinner size="md" />
        </View>
      ) : null}

      {error ? (
        <View style={{ marginTop: SECTION_GAP }}>
          <ErrorState message={error} onRetry={() => void refresh()} />
        </View>
      ) : null}

            {!loading && !error && entries.length === 0 ? (
        <View style={{ marginTop: SECTION_GAP }}>
          <EmptyState title={t('peopleEmpty')} message={t('peopleEmptyMessage')} />
        </View>
      ) : null}
          </View>
        }
        ListHeaderComponentStyle={{ marginBottom: entries.length > 0 && !loading && !error ? SECTION_GAP : 0 }}
        ListFooterComponent={
          hasMore && !loading && !error ? (
            <View className="mt-3">
              <AppButton
                label={loadingMore ? t('pleaseWait') : t('loadMorePeople')}
                variant="secondary"
                fullWidth
                loading={loadingMore}
                onPress={() => void loadMore()}
              />
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={10}
        maxToRenderPerBatch={10}
        windowSize={7}
        showsVerticalScrollIndicator={false}
      />

      <RosterEditorSheet
        visible={sheetOpen}
        mode={sheetMode}
        groups={groups}
        defaultGroupId={selectedGroupId}
        editing={editing}
        prefill={prefill}
        allowedGroupIds={isSenior ? undefined : profile?.assignedGroupIds}
        allowAdminCreate={isSenior}
        onClose={() => {
          setSheetOpen(false);
          setEditing(null);
          setPrefill(null);
          setAddingFromApplication(false);
        }}
        onSaved={async (saved) => {
          await refresh();
          if (addingFromApplication) {
            try {
              await markJoinApplicationAddedRemote(saved.phoneNumber);
              showSuccess(t('joinApplicationAdded'));
            } catch {
              // Roster save already succeeded; still refresh pending list.
            }
            setAddingFromApplication(false);
            await refreshApplications();
          }
        }}
        onSuccess={showSuccess}
        onError={showNotice}
      />
    </Screen>
  );
}
