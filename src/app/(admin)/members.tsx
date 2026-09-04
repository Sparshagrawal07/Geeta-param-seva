import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
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
import type { AccessRosterEntry, RosterRole, RosterStatus } from '@/types/roster';
import type { MessageKey } from '@/lib/i18n/messages';

const SECTION_GAP = 28;

type RoleFilter = 'all' | RosterRole;
type StatusFilter = 'all' | RosterStatus;

function roleBadgeText(role: RosterRole, t: (key: MessageKey) => string): string {
  return role === 'admin' ? t('roleAdmin') : t('roleMember');
}

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

  const openAdd = () => {
    void triggerHaptic('light');
    setEditing(null);
    setSheetMode(isSenior ? 'choose' : 'member');
    setSheetOpen(true);
  };

  const openEdit = (entry: AccessRosterEntry) => {
    void triggerHaptic('selection');
    setEditing(entry);
    setSheetMode(entry.role === 'admin' ? 'admin' : 'member');
    setSheetOpen(true);
  };

  const groupLabel = (entry: AccessRosterEntry) => {
    if (entry.role === 'admin') {
      const names = (entry.assignedGroupIds ?? [])
        .map((id) => groups.find((group) => group.id === id)?.name ?? id)
        .filter(Boolean);
      return names.length > 0 ? names.join(', ') : t('noGroupAssigned');
    }
    if (!entry.groupId) return t('noGroupAssigned');
    return groups.find((group) => group.id === entry.groupId)?.name ?? entry.groupId;
  };

  return (
    <Screen contentClassName="relative px-5 pb-10 pt-2">
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

      {!loading && !error && entries.length > 0 ? (
        <View style={{ marginTop: SECTION_GAP, gap: 8 }}>
          {entries.map((entry) => (
            <Pressable key={entry.id} onPress={() => openEdit(entry)}>
              <SpiritualSurface variant="elevated">
                <SpiritualSurfaceBody className="gap-1 py-3.5">
                  <View className="flex-row items-center gap-3">
                    <View className="h-10 w-10 items-center justify-center rounded-full bg-saffron/12 dark:bg-gold/15">
                      <Ionicons
                        name={entry.role === 'admin' ? 'shield-outline' : 'person-outline'}
                        size={18}
                        color={colors.saffron}
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
                        {roleBadgeText(entry.role, t)}
                        {entry.status === 'inactive' ? ` · ${t('statusInactive')}` : ''}
                      </AppText>
                    </View>
                    <AppText className="text-xs text-gp-muted dark:text-gp-muted-dark">
                      {groupLabel(entry)}
                    </AppText>
                  </View>
                </SpiritualSurfaceBody>
              </SpiritualSurface>
            </Pressable>
          ))}

          {hasMore ? (
            <View className="mt-3">
              <AppButton
                label={loadingMore ? t('pleaseWait') : t('loadMorePeople')}
                variant="secondary"
                fullWidth
                loading={loadingMore}
                onPress={() => void loadMore()}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      <RosterEditorSheet
        visible={sheetOpen}
        mode={sheetMode}
        groups={groups}
        defaultGroupId={selectedGroupId}
        editing={editing}
        allowedGroupIds={isSenior ? undefined : profile?.assignedGroupIds}
        allowAdminCreate={isSenior}
        onClose={() => {
          setSheetOpen(false);
          setEditing(null);
        }}
        onSaved={() => void refresh()}
        onSuccess={showSuccess}
        onError={showNotice}
      />
    </Screen>
  );
}
