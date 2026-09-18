import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { JoinPinRevealModal } from '@/components/admin/join-pin-reveal-modal';
import { ListRow } from '@/components/layout/form-stack';
import { AppButton } from '@/components/ui/button';
import { AppText } from '@/components/ui/app-text';
import { AppTextField } from '@/components/ui/text-field';
import { LoadingOverlay } from '@/components/ui/loading-overlay';
import { useAuth } from '@/hooks/use-auth';
import { useAppColors } from '@/hooks/use-app-colors';
import { triggerHaptic } from '@/lib/haptics';
import type { UserProfile } from '@/lib/users';
import { isAdminRole, isSeniorAdmin } from '@/lib/users';
import { useLocale } from '@/providers/locale-provider';
import { useAlert } from '@/providers/alert-provider';
import {
  deleteGroup,
  fetchGroupMembers,
  updateGroupName,
} from '@/services/groups';
import { generateGroupJoinPinRemote, mapPinAuthError } from '@/lib/pin-auth';
import { fetchMembers } from '@/services/members';
import type { Group } from '@/types/group';

const SECTION_GAP = 24;

interface GroupSettingsModalProps {
  visible: boolean;
  group: Group;
  onClose: () => void;
  onGroupUpdated: (group: Group) => void;
  onDeleted: () => void;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
  onDataChanged?: () => void | Promise<void>;
}

export function GroupSettingsModal({
  visible,
  group,
  onClose,
  onGroupUpdated,
  onDeleted,
  onSuccess,
  onError,
  onDataChanged,
}: GroupSettingsModalProps) {
  const { profile } = useAuth();
  const { saffron } = useAppColors();
  const { t } = useLocale();
  const { confirm } = useAlert();
  const router = useRouter();

  const [name, setName] = useState(group.name);
  const [nameError, setNameError] = useState('');
  const [pinError, setPinError] = useState('');
  const [savingPin, setSavingPin] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [membersCount, setMembersCount] = useState(0);
  const [groupAdmins, setGroupAdmins] = useState<UserProfile[]>([]);
  const [revealedPin, setRevealedPin] = useState<{ pin: string; expiresAt: string } | null>(null);
  const hasLoadedRef = useRef(false);

  const canManageJoinPin =
    isSeniorAdmin(profile?.role) ||
    (isAdminRole(profile?.role) && profile?.assignedGroupIds?.includes(group.id));

  const load = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? hasLoadedRef.current;

      try {
        if (silent) {
          setRefreshing(true);
        } else {
          setInitialLoading(true);
        }

        const [groupMembers, users] = await Promise.all([
          fetchGroupMembers(group.id),
          fetchMembers(profile),
        ]);
        setMembersCount(groupMembers.length);
        setGroupAdmins(
          users.filter((user) => user.role === 'admin' && user.assignedGroupIds?.includes(group.id))
        );
        hasLoadedRef.current = true;
      } catch {
        onError(t('errorGroupsLoad'));
      } finally {
        setInitialLoading(false);
        setRefreshing(false);
      }
    },
    [group.id, profile, t, onError]
  );

  useEffect(() => {
    if (visible) {
      setName(group.name);
      setNameError('');
      setPinError('');
      hasLoadedRef.current = false;
      void load();
    }
  }, [visible, group.id, load]);

  useEffect(() => {
    if (visible) {
      setName(group.name);
    }
  }, [group.name, visible]);

  const handleSaveName = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(t('errorGroupNameRequired'));
      return;
    }

    if (trimmed === group.name) {
      return;
    }

    try {
      setSavingName(true);
      setNameError('');
      const updated = await updateGroupName(group.id, trimmed);
      onGroupUpdated(updated);
      onSuccess(t('groupNameUpdated'));
      await onDataChanged?.();
    } catch (error) {
      if (error instanceof Error && error.message === 'GROUP_NAME_TAKEN') {
        setNameError(t('groupNameTaken'));
      } else {
        onError(t('groupUpdateFailed'));
      }
    } finally {
      setSavingName(false);
    }
  };

  const handleGeneratePin = async () => {
    try {
      setSavingPin(true);
      setPinError('');
      const generated = await generateGroupJoinPinRemote({ groupId: group.id });
      const expiresAt = new Date(generated.expiresAt);
      onGroupUpdated({
        ...group,
        hasPin: true,
        pinExpiresAt: Number.isNaN(expiresAt.getTime()) ? null : expiresAt,
      });
      setRevealedPin({ pin: generated.pin, expiresAt: generated.expiresAt });
      onSuccess(t('groupPinGenerated'));
      void triggerHaptic('success');
      await onDataChanged?.();
    } catch (caught) {
      setPinError(mapPinAuthError(caught, t('groupPinUpdateFailed')));
      void triggerHaptic('error');
    } finally {
      setSavingPin(false);
    }
  };

  const handleDelete = () => {
    if (!isSeniorAdmin(profile?.role)) {
      onError(t('groupDeleteFailed'));
      return;
    }
    confirm({
      title: t('deleteGroup'),
      message: t('groupDeleteConfirm'),
      confirmLabel: t('deleteGroup'),
      cancelLabel: t('cancel'),
      destructive: true,
      onConfirm: async () => {
        try {
          await deleteGroup(group.id);
          onClose();
          onDeleted();
        } catch {
          onError(t('groupDeleteFailed'));
        }
      },
    });
  };

  const openPeople = () => {
    onClose();
    router.push('/(admin)/(tabs)/members');
  };

  const nameChanged = name.trim() !== group.name;
  const busy = refreshing || savingName || savingPin;
  const pinActive =
    group.hasPin && group.pinExpiresAt != null && group.pinExpiresAt.getTime() > Date.now();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-gp-bg dark:bg-gp-bg-dark" edges={['top', 'bottom']}>
        <View className="flex-row items-center justify-between border-b border-gp-border px-5 py-4 dark:border-gp-border-dark">
          <AppText bold className="flex-1 text-lg text-gp-text dark:text-gp-text-dark">
            {t('groupSettings')}
          </AppText>
          <Pressable
            disabled={busy}
            onPress={() => {
              void triggerHaptic('light');
              onClose();
            }}
            hitSlop={12}
            style={{ opacity: busy ? 0.4 : 1 }}>
            <AppText className="text-base text-saffron dark:text-saffron-light">{t('close')}</AppText>
          </Pressable>
        </View>

        <View className="flex-1">
          {initialLoading ? (
            <View className="flex-1 items-center justify-center">
              <ActivityIndicator color={saffron} />
            </View>
          ) : (
            <View className="flex-1" style={{ opacity: refreshing ? 0.55 : 1 }}>
              <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
                <AppTextField
                  label={t('groupName')}
                  value={name}
                  onChangeText={(value) => {
                    setName(value);
                    if (nameError) {
                      setNameError('');
                    }
                  }}
                  placeholder={t('groupNamePlaceholder')}
                  errorText={nameError}
                  editable={!busy}
                />
                {nameChanged ? (
                  <View className="mt-3">
                    <AppButton
                      label={t('saveChanges')}
                      loading={savingName}
                      disabled={refreshing}
                      onPress={() => void handleSaveName()}
                    />
                  </View>
                ) : null}

                <View style={{ marginTop: SECTION_GAP }}>
                  {canManageJoinPin ? (
                    <>
                      <AppText bold className="mb-2 text-base text-gp-text dark:text-gp-text-dark">
                        {t('groupPinLabel')}
                      </AppText>
                      <AppText className="mb-3 text-sm text-gp-muted dark:text-gp-muted-dark">
                        {pinActive
                          ? `${t('groupPinActiveUntil')} ${group.pinExpiresAt!.toLocaleString()}`
                          : group.hasPin
                            ? t('groupPinExpired')
                            : t('groupPinMissing')}
                      </AppText>
                      <AppText className="mb-3 text-sm text-gp-muted dark:text-gp-muted-dark">
                        {t('groupPinRegenHint')}
                      </AppText>
                      {pinError ? (
                        <AppText className="mb-2 text-sm text-destructive">{pinError}</AppText>
                      ) : null}
                      <AppButton
                        label={group.hasPin ? t('groupPinRegenerate') : t('groupPinGenerate')}
                        loading={savingPin}
                        disabled={refreshing}
                        onPress={() => void handleGeneratePin()}
                      />
                    </>
                  ) : null}
                </View>

                <View style={{ marginTop: SECTION_GAP }}>
                  <AppText bold className="mb-3 text-base text-gp-text dark:text-gp-text-dark">
                    {t('groupAdmins')}
                  </AppText>
                  {groupAdmins.length === 0 ? (
                    <AppText className="text-sm text-gp-muted dark:text-gp-muted-dark">
                      {t('noGroupAssigned')}
                    </AppText>
                  ) : (
                    <View className="gap-2">
                      {groupAdmins.map((admin) => (
                        <ListRow key={admin.uid}>
                          <AppText bold className="text-gp-text dark:text-gp-text-dark">
                            {admin.name}
                          </AppText>
                          <AppText className="text-sm text-gp-muted dark:text-gp-muted-dark">
                            {admin.phoneNumber}
                          </AppText>
                        </ListRow>
                      ))}
                    </View>
                  )}
                  <View className="mt-3">
                    <AppButton
                      label={t('managePeopleInMembers')}
                      variant="secondary"
                      fullWidth
                      onPress={openPeople}
                    />
                  </View>
                </View>

                <View style={{ marginTop: SECTION_GAP }}>
                  <AppText bold className="mb-2 text-base text-gp-text dark:text-gp-text-dark">
                    {t('groupMembers')} ({membersCount})
                  </AppText>
                  <AppText className="text-sm text-gp-muted dark:text-gp-muted-dark">
                    {t('groupMembersManageHint')}
                  </AppText>
                </View>

                {isSeniorAdmin(profile?.role) ? (
                  <View style={{ marginTop: 40 }}>
                    <AppButton
                      label={t('deleteGroup')}
                      variant="destructive"
                      fullWidth
                      disabled={busy}
                      onPress={handleDelete}
                    />
                  </View>
                ) : null}
              </ScrollView>
            </View>
          )}
          <LoadingOverlay visible={refreshing} />
        </View>
      </SafeAreaView>

      {revealedPin ? (
        <JoinPinRevealModal
          visible
          pin={revealedPin.pin}
          expiresAt={revealedPin.expiresAt}
          groupName={group.name}
          onClose={() => setRevealedPin(null)}
        />
      ) : null}
    </Modal>
  );
}
