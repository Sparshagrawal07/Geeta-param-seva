import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormStack } from '@/components/layout/form-stack';
import { PracticeAssignmentPicker } from '@/components/practice/practice-assignment-picker';
import { AppButton } from '@/components/ui/button';
import { AppSelect } from '@/components/ui/app-select';
import { AppText } from '@/components/ui/app-text';
import { SemanticText } from '@/components/ui/semantic-text';
import { AppTextField } from '@/components/ui/text-field';
import { triggerHaptic } from '@/lib/haptics';
import {
  INDIA_COUNTRY_CODE,
  isValidIndianMobileDigits,
  sanitizeIndianMobileDigits,
  toE164IndianMobile,
} from '@/lib/phone';
import { validatePracticeItems, type PracticeItem } from '@/lib/practice';
import { useLocale } from '@/providers/locale-provider';
import {
  fetchMemberPracticeAssignment,
  setMemberPracticeAssignmentRemote,
} from '@/services/practice';
import {
  deactivateAccessRosterRemote,
  upsertAccessRosterRemote,
} from '@/services/roster';
import type { Group } from '@/types/group';
import type { AccessRosterEntry, RosterRole } from '@/types/roster';

export type RosterEditorMode = 'member' | 'admin' | 'choose';

interface RosterEditorSheetProps {
  visible: boolean;
  mode: RosterEditorMode;
  groups: Group[];
  /** Pre-selected group for member form (optional). */
  defaultGroupId?: string | null;
  /** When editing an existing roster entry. */
  editing?: AccessRosterEntry | null;
  /** Prefill for new member from a join application (ignored when editing). */
  prefill?: { name: string; phoneNumber: string } | null;
  /** Admin role users can only assign members to these groups. */
  allowedGroupIds?: string[];
  allowAdminCreate: boolean;
  onClose: () => void;
  onSaved: (saved: { phoneNumber: string; name: string }) => void | Promise<void>;
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

export function RosterEditorSheet({
  visible,
  mode: initialMode,
  groups,
  defaultGroupId,
  editing = null,
  prefill = null,
  allowedGroupIds,
  allowAdminCreate,
  onClose,
  onSaved,
  onSuccess,
  onError,
}: RosterEditorSheetProps) {
  const { t } = useLocale();

  const availableGroups = useMemo(() => {
    if (!allowedGroupIds || allowedGroupIds.length === 0) return groups;
    const allowed = new Set(allowedGroupIds);
    return groups.filter((group) => allowed.has(group.id));
  }, [allowedGroupIds, groups]);

  const [mode, setMode] = useState<RosterEditorMode>(initialMode);
  const [name, setName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [groupId, setGroupId] = useState<string | null>(null);
  const [assignedGroupIds, setAssignedGroupIds] = useState<string[]>([]);
  const [practiceItems, setPracticeItems] = useState<PracticeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;

    setMode(editing ? (editing.role === 'admin' ? 'admin' : 'member') : initialMode);
    setName(editing?.name ?? prefill?.name ?? '');
    const sourcePhone = editing?.phoneNumber ?? prefill?.phoneNumber ?? '';
    setPhoneDigits(sourcePhone ? sanitizeIndianMobileDigits(sourcePhone.replace(/^\+91/, '')) : '');
    setGroupId(editing?.groupId ?? defaultGroupId ?? availableGroups[0]?.id ?? null);
    setAssignedGroupIds(
      editing?.assignedGroupIds?.length
        ? editing.assignedGroupIds
        : defaultGroupId
          ? [defaultGroupId]
          : availableGroups[0]
            ? [availableGroups[0].id]
            : []
    );
    setPracticeItems([]);
    setError('');
    setLoading(false);
    setDeactivating(false);

    if (editing?.role === 'user' && editing.phoneNumber) {
      void fetchMemberPracticeAssignment(editing.phoneNumber)
        .then((assignment) => {
          if (assignment?.items?.length) setPracticeItems(assignment.items);
        })
        .catch(() => undefined);
    }
  }, [availableGroups, defaultGroupId, editing, initialMode, prefill, visible]);

  const title = (() => {
    if (mode === 'choose') return t('addPersonTitle');
    if (editing) return mode === 'admin' ? t('editAdminTitle') : t('editMemberTitle');
    return mode === 'admin' ? t('addAdminTitle') : t('addMemberTitle');
  })();

  const toggleAssignedGroup = (id: string) => {
    void triggerHaptic('selection');
    setAssignedGroupIds((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
    );
  };

  const handleSave = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError(t('errorName'));
      void triggerHaptic('warning');
      return;
    }
    if (!isValidIndianMobileDigits(phoneDigits)) {
      setError(t('errorPhone'));
      void triggerHaptic('warning');
      return;
    }

    const role: RosterRole = mode === 'admin' ? 'admin' : 'user';
    if (role === 'user' && !groupId) {
      setError(t('selectGroup'));
      void triggerHaptic('warning');
      return;
    }
    if (role === 'admin' && assignedGroupIds.length === 0) {
      setError(t('selectGroup'));
      void triggerHaptic('warning');
      return;
    }
    if (role === 'user' && validatePracticeItems(practiceItems)) {
      setError(t('practicePickAdhyaysRequired'));
      void triggerHaptic('warning');
      return;
    }

    try {
      setLoading(true);
      setError('');
      const phoneNumber = toE164IndianMobile(phoneDigits);
      await upsertAccessRosterRemote({
        name: trimmedName,
        phoneNumber,
        role,
        groupId: role === 'user' ? groupId : null,
        assignedGroupIds: role === 'admin' ? assignedGroupIds : [],
        status: 'active',
      });
      if (role === 'user' && groupId) {
        await setMemberPracticeAssignmentRemote({
          groupId,
          phoneNumber,
          items: practiceItems,
        });
      }
      onClose();
      await onSaved({ phoneNumber, name: trimmedName });
      onSuccess(editing ? t('rosterUpdated') : t('rosterSaved'));
      void triggerHaptic('success');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t('rosterSaveFailed');
      setError(message);
      onError(message);
      void triggerHaptic('error');
    } finally {
      setLoading(false);
    }
  };

  const handleDeactivate = async () => {
    if (!editing) return;
    try {
      setDeactivating(true);
      await deactivateAccessRosterRemote(editing.phoneNumber);
      onClose();
      await onSaved({ phoneNumber: editing.phoneNumber, name: editing.name });
      onSuccess(t('rosterDeactivated'));
      void triggerHaptic('success');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : t('rosterSaveFailed');
      setError(message);
      onError(message);
      void triggerHaptic('error');
    } finally {
      setDeactivating(false);
    }
  };

  const busy = loading || deactivating;
  const hideGroupSelector = mode === 'member' && availableGroups.length === 1;
  const canReturnToChooser = allowAdminCreate && initialMode === 'choose';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView className="flex-1 bg-gp-bg dark:bg-gp-bg-dark" edges={['top', 'bottom']}>
        <View className="flex-row items-center justify-between border-b border-gp-border px-5 py-4 dark:border-gp-border-dark">
          <AppText bold className="flex-1 text-lg text-gp-text dark:text-gp-text-dark">
            {title}
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

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {mode === 'choose' ? (
            <FormStack>
              <AppText className="text-base leading-7 text-gp-muted dark:text-gp-muted-dark">
                {t('addPersonHint')}
              </AppText>
              <AppButton label={t('addMember')} fullWidth onPress={() => setMode('member')} />
              {allowAdminCreate ? (
                <AppButton
                  label={t('addAdmin')}
                  variant="secondary"
                  fullWidth
                  onPress={() => setMode('admin')}
                />
              ) : null}
            </FormStack>
          ) : (
            <FormStack>
              <AppTextField
                label={t('name')}
                value={name}
                onChangeText={(value) => {
                  setName(value);
                  if (error) setError('');
                }}
                placeholder={t('namePlaceholder')}
                editable={!busy}
              />

              <AppTextField
                label={t('phoneLabel')}
                value={phoneDigits}
                onChangeText={(value) => {
                  setPhoneDigits(sanitizeIndianMobileDigits(value));
                  if (error) setError('');
                }}
                placeholder={t('phonePlaceholder')}
                keyboardType="phone-pad"
                prefix={INDIA_COUNTRY_CODE}
                helperText={t('phoneHelper')}
                editable={!busy && !editing}
              />

              {mode === 'member' ? (
                <>
                  {hideGroupSelector ? (
                    <AppText className="text-sm text-gp-muted dark:text-gp-muted-dark">
                      {t('groupContext')}: {availableGroups[0]?.name}
                    </AppText>
                  ) : (
                    <AppSelect
                      label={t('selectGroup')}
                      value={groupId}
                      options={availableGroups.map((group) => ({ value: group.id, label: group.name }))}
                      onSelect={setGroupId}
                      hint={t('rosterMemberGroupHint')}
                      disabled={busy}
                    />
                  )}
                  <AppText bold className="text-sm text-gp-text dark:text-gp-text-dark">
                    {t('practiceAssignSection')}
                  </AppText>
                  <View className="overflow-hidden rounded-2xl border border-gp-border dark:border-gp-border-dark">
                    <PracticeAssignmentPicker value={practiceItems} onChange={setPracticeItems} />
                  </View>
                </>
              ) : (
                <View className="gap-2">
                  <AppText className="text-sm leading-5 text-gp-muted dark:text-gp-muted-dark">
                    {t('rosterAdminGroupsHint')}
                  </AppText>
                  {availableGroups.map((group) => {
                    const active = assignedGroupIds.includes(group.id);
                    return (
                      <Pressable
                        key={group.id}
                        disabled={busy}
                        onPress={() => toggleAssignedGroup(group.id)}
                        className={`rounded-lg border px-4 py-3 ${
                          active
                            ? 'border-saffron bg-saffron/10'
                            : 'border-gp-border bg-gp-card dark:border-gp-border-dark dark:bg-gp-card-dark'
                        }`}>
                        <AppText
                          bold={active}
                          className={active ? 'text-saffron' : 'text-gp-text dark:text-gp-text-dark'}>
                          {group.name}
                        </AppText>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              {error ? <SemanticText tone="destructive">{error}</SemanticText> : null}

              <AppButton
                label={t('confirm')}
                fullWidth
                loading={loading}
                disabled={busy}
                onPress={() => void handleSave()}
              />

              {editing && editing.status === 'active' ? (
                <AppButton
                  label={t('deactivatePerson')}
                  variant="ghost"
                  fullWidth
                  loading={deactivating}
                  disabled={busy}
                  onPress={() => void handleDeactivate()}
                />
              ) : null}

              {!editing && canReturnToChooser ? (
                <AppButton
                  label={t('back')}
                  variant="secondary"
                  fullWidth
                  disabled={busy}
                  onPress={() => setMode('choose')}
                />
              ) : null}
            </FormStack>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
