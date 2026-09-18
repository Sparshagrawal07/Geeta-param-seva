import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GroupScopeSelector } from '@/components/admin/group-scope-selector';
import { PracticeAssignmentPicker } from '@/components/practice/practice-assignment-picker';
import { PracticeWhatsAppCopyButton } from '@/components/practice/practice-whatsapp-copy-button';
import { FormSection, FormStack } from '@/components/layout/form-stack';
import { Screen } from '@/components/layout/screen';
import { SpiritualSurface, SpiritualSurfaceBody } from '@/components/spiritual/spiritual-surface';
import { AppButton } from '@/components/ui/button';
import { AppText } from '@/components/ui/app-text';
import { InfoCard } from '@/components/ui/info-card';
import { SemanticText } from '@/components/ui/semantic-text';
import { SectionHeader } from '@/components/ui/section-header';
import { useAppColors } from '@/hooks/use-app-colors';
import { useGroups } from '@/hooks/use-groups';
import { useSelectedGroup } from '@/hooks/use-selected-group';
import { useTransientMessage } from '@/hooks/use-transient-message';
import { triggerHaptic } from '@/lib/haptics';
import {
  REQUIRED_ADHYAY_COUNT,
  type PracticeItem,
  type PracticeMemberOverviewRow,
  validatePracticeItems,
} from '@/lib/practice';
import { formatIncompletePracticeWhatsAppMessage } from '@/lib/practice-whatsapp';
import { useAlert } from '@/providers/alert-provider';
import { useLocale } from '@/providers/locale-provider';
import {
  getPracticeAdminOverviewRemote,
  sendPracticeReminderRemote,
  setMemberPracticeAssignmentRemote,
} from '@/services/practice';
import { downloadPracticeMonthlyReport } from '@/lib/practice-report-download';

type FilterMode = 'all' | 'incomplete' | 'complete';

function itemLabel(item: { type: string; chapterNumber?: number; titleEn?: string; titleHi?: string }, locale: string) {
  if (item.type === 'aarti') return locale === 'hi' ? 'आरती' : 'Aarti';
  const title = locale === 'hi' ? item.titleHi || item.titleEn : item.titleEn;
  return title ? `${item.chapterNumber}. ${title}` : `Adhyay ${item.chapterNumber}`;
}

export default function AdminPracticeScreen() {
  const { t, locale } = useLocale();
  const { alert } = useAlert();
  const colors = useAppColors();
  const { groups } = useGroups();
  const { selectedGroupId, setSelectedGroupId } = useSelectedGroup(groups);

  const [filter, setFilter] = useState<FilterMode>('all');
  const [members, setMembers] = useState<PracticeMemberOverviewRow[]>([]);
  const [practiceDateKey, setPracticeDateKey] = useState('');
  const [completeCount, setCompleteCount] = useState(0);
  const [incompleteCount, setIncompleteCount] = useState(0);
  const [memberCount, setMemberCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [remindingUid, setRemindingUid] = useState<string | null>(null);
  const [remindingAll, setRemindingAll] = useState(false);
  const [downloadingReport, setDownloadingReport] = useState(false);
  const [error, setError] = useState('');
  const { message, tone, showSuccess, clearMessage } = useTransientMessage();

  const [editMember, setEditMember] = useState<PracticeMemberOverviewRow | null>(null);
  const [editItems, setEditItems] = useState<PracticeItem[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  const load = useCallback(async () => {
    if (!selectedGroupId) {
      setMembers([]);
      return;
    }
    try {
      setLoading(true);
      setError('');
      const overview = await getPracticeAdminOverviewRemote(selectedGroupId);
      setMembers(overview.members);
      setPracticeDateKey(overview.practiceDateKey);
      setCompleteCount(overview.completeCount);
      setIncompleteCount(overview.incompleteCount);
      setMemberCount(overview.memberCount);
    } catch {
      setError(t('errorUnexpected'));
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [selectedGroupId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const filtered = useMemo(() => {
    if (filter === 'incomplete') {
      return members.filter((m) => m.items.length > 0 && !m.allComplete);
    }
    if (filter === 'complete') {
      return members.filter((m) => m.items.length > 0 && m.allComplete);
    }
    return members;
  }, [filter, members]);

  const openEdit = (member: PracticeMemberOverviewRow) => {
    setEditMember(member);
    setEditItems(
      member.items.map((item) =>
        item.type === 'aarti'
          ? { type: 'aarti' as const, itemKey: 'aarti' }
          : {
              type: 'adhyay' as const,
              chapterNumber: item.chapterNumber,
              itemKey: item.itemKey,
            }
      )
    );
  };

  const handleSaveEdit = async () => {
    if (!editMember || !selectedGroupId) return;
    if (validatePracticeItems(editItems)) {
      setError(t('practicePickAdhyaysRequired'));
      void triggerHaptic('warning');
      return;
    }
    try {
      setSavingEdit(true);
      setError('');
      await setMemberPracticeAssignmentRemote({
        groupId: selectedGroupId,
        uid: editMember.uid,
        phoneNumber: editMember.phoneNumber,
        items: editItems,
      });
      setEditMember(null);
      showSuccess(t('practiceAssignmentSaved'));
      void triggerHaptic('success');
      await load();
    } catch {
      setError(t('errorUnexpected'));
      void triggerHaptic('error');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleRemind = async (uid?: string) => {
    if (!selectedGroupId) return;
    try {
      if (uid) setRemindingUid(uid);
      else setRemindingAll(true);
      clearMessage();
      const result = await sendPracticeReminderRemote({
        groupId: selectedGroupId,
        uid,
        remindAllIncomplete: !uid,
      });
      const sent = Math.max(0, Number(result?.sent ?? 0));
      const body =
        sent <= 1
          ? t('practiceReminderSentOne')
          : t('practiceReminderSentMany').replace('{count}', String(sent));
      showSuccess(body);
      alert({
        title: t('practiceReminderSentTitle'),
        message: body,
      });
      void triggerHaptic('success');
    } catch {
      setError(t('practiceReminderFailed'));
      alert({
        title: t('practiceReminderFailedTitle'),
        message: t('practiceReminderFailed'),
      });
      void triggerHaptic('error');
    } finally {
      setRemindingUid(null);
      setRemindingAll(false);
    }
  };

  const handleCopyIncompleteWhatsApp = async () => {
    const text = formatIncompletePracticeWhatsAppMessage(members, {
      practiceDateKey: practiceDateKey || undefined,
      title: t('practiceCopyIncompleteWhatsAppTitle'),
    });
    if (!text) {
      setError(t('practiceCopyIncompleteEmpty'));
      void triggerHaptic('error');
      return;
    }
    try {
      await Clipboard.setStringAsync(text);
      clearMessage();
      showSuccess(t('practiceCopyIncompleteSuccess'));
      void triggerHaptic('success');
    } catch {
      setError(t('errorUnexpected'));
      void triggerHaptic('error');
    }
  };

  const handleDownloadReport = async () => {
    if (!selectedGroupId) {
      setError(t('selectGroup'));
      void triggerHaptic('warning');
      return;
    }
    try {
      setDownloadingReport(true);
      setError('');
      clearMessage();
      const report = await downloadPracticeMonthlyReport(selectedGroupId);
      const body = t('practiceDownloadReportSuccess')
        .replace('{from}', report.fromDateKey)
        .replace('{to}', report.toDateKey);
      showSuccess(body);
      alert({
        title: t('practiceDownloadReportSuccessTitle'),
        message: body,
      });
      void triggerHaptic('success');
    } catch (caught) {
      const detail =
        caught instanceof Error && caught.message.trim()
          ? caught.message.trim()
          : t('practiceDownloadReportFailed');
      setError(detail);
      alert({
        title: t('practiceDownloadReportFailedTitle'),
        message: detail,
      });
      void triggerHaptic('error');
    } finally {
      setDownloadingReport(false);
    }
  };

  return (
    <Screen contentClassName="relative px-5 pb-10 pt-2" animateContent={false}>
      <SectionHeader title={t('practiceAdminTitle')} subtitle={t('practiceAdminSubtitle')} />
      <SpiritualSurface variant="elevated">
        <SpiritualSurfaceBody className="py-4">
          <FormStack>
            <GroupScopeSelector
              groups={groups}
              selectedGroupId={selectedGroupId}
              onSelect={(id) => void setSelectedGroupId(id)}
              hint={groups.length > 1 ? t('selectGroupHint') : undefined}
            />

            {error ? <SemanticText tone="destructive">{error}</SemanticText> : null}
            {message ? (
              tone === 'success' ? (
                <SemanticText tone="success">{message}</SemanticText>
              ) : (
                <AppText className="text-sm text-gp-muted dark:text-gp-muted-dark">{message}</AppText>
              )
            ) : null}

            <FormSection title={t('practiceTodaySection')}>
              <View className="gap-3 p-4">
                {practiceDateKey ? (
                  <AppText className="text-xs text-gp-muted dark:text-gp-muted-dark">
                    {t('practiceDayLabel')}: {practiceDateKey}
                  </AppText>
                ) : null}
                <View className="flex-row gap-3">
                  <InfoCard label={t('practiceAssignedMembers')} value={String(memberCount)} />
                  <InfoCard label={t('practiceCompleteCount')} value={String(completeCount)} />
                  <InfoCard label={t('practiceIncompleteCount')} value={String(incompleteCount)} />
                </View>
                {incompleteCount > 0 ? (
                  <AppButton
                    label={t('practiceRemindAll')}
                    variant="secondary"
                    loading={remindingAll}
                    onPress={() => void handleRemind()}
                    fullWidth
                  />
                ) : null}
                <PracticeWhatsAppCopyButton
                  disabled={!selectedGroupId || incompleteCount === 0}
                  label={t('practiceCopyIncompleteWhatsApp')}
                  onPress={() => void handleCopyIncompleteWhatsApp()}
                />
                <AppButton
                  label={t('practiceDownloadReport')}
                  variant="secondary"
                  loading={downloadingReport}
                  disabled={!selectedGroupId}
                  onPress={() => void handleDownloadReport()}
                  fullWidth
                />
                <AppText className="text-xs text-gp-muted dark:text-gp-muted-dark">
                  {t('practiceDownloadReportHint')}
                </AppText>
              </View>
            </FormSection>

            <FormSection title={t('practiceMembersSection')}>
              <View className="flex-row gap-2 border-b border-saffron/10 px-4 py-3 dark:border-gold/15">
                {(['all', 'incomplete', 'complete'] as FilterMode[]).map((mode) => {
                  const active = filter === mode;
                  const label =
                    mode === 'all'
                      ? t('practiceFilterAll')
                      : mode === 'incomplete'
                        ? t('practiceFilterIncomplete')
                        : t('practiceFilterComplete');
                  return (
                    <Pressable
                      key={mode}
                      onPress={() => setFilter(mode)}
                      className={`rounded-full px-3 py-1.5 ${
                        active ? 'bg-saffron/15 dark:bg-gold/15' : 'bg-gp-bg dark:bg-gp-bg-dark'
                      }`}>
                      <AppText
                        bold
                        className={`text-xs ${active ? 'text-saffron dark:text-gold' : 'text-gp-muted dark:text-gp-muted-dark'}`}>
                        {label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </View>

              {loading ? (
                <View className="px-4 py-6">
                  <AppText className="text-sm text-gp-muted dark:text-gp-muted-dark">{t('pleaseWait')}</AppText>
                </View>
              ) : filtered.length === 0 ? (
                <View className="px-4 py-6">
                  <AppText className="text-sm text-gp-muted dark:text-gp-muted-dark">
                    {t('practiceNoMembers')}
                  </AppText>
                </View>
              ) : (
                filtered.map((member, index) => (
                  <View
                    key={member.uid}
                    className={`px-4 py-4 ${
                      index === filtered.length - 1 ? '' : 'border-b border-saffron/10 dark:border-gold/15'
                    }`}>
                    <View className="flex-row items-start gap-3">
                      <View className="min-w-0 flex-1">
                        <AppText bold className="text-base text-gp-text dark:text-gp-text-dark">
                          {member.name}
                        </AppText>
                        <AppText className="mt-0.5 text-xs text-gp-muted dark:text-gp-muted-dark">
                          {member.phoneNumber}
                        </AppText>
                        {member.items.length === 0 ? (
                          <AppText className="mt-2 text-sm text-gp-muted dark:text-gp-muted-dark">
                            {t('practiceNoAssignment')}
                          </AppText>
                        ) : (
                          <View className="mt-2 flex-row flex-wrap gap-2">
                            {member.items.map((item) => (
                              <View
                                key={item.itemKey}
                                className={`rounded-full px-2.5 py-1 ${
                                  item.completed
                                    ? 'bg-saffron/15 dark:bg-gold/15'
                                    : 'bg-gp-bg dark:bg-gp-bg-dark'
                                }`}>
                                <AppText
                                  className={`text-xs ${
                                    item.completed
                                      ? 'text-saffron dark:text-gold'
                                      : 'text-gp-muted dark:text-gp-muted-dark'
                                  }`}>
                                  {item.completed ? '✓ ' : ''}
                                  {itemLabel(item, locale)}
                                </AppText>
                              </View>
                            ))}
                          </View>
                        )}
                      </View>
                      <Ionicons
                        name={member.allComplete && member.items.length > 0 ? 'checkmark-circle' : 'time-outline'}
                        size={22}
                        color={
                          member.allComplete && member.items.length > 0 ? colors.saffron : colors.placeholder
                        }
                      />
                    </View>
                    <View className="mt-3 flex-row gap-2">
                      <View className="flex-1">
                        <AppButton
                          label={t('practiceEditAssignment')}
                          variant="secondary"
                          size="sm"
                          onPress={() => openEdit(member)}
                          fullWidth
                        />
                      </View>
                      {member.items.length > 0 && !member.allComplete ? (
                        <View className="flex-1">
                          <AppButton
                            label={t('practiceSendReminder')}
                            size="sm"
                            loading={remindingUid === member.uid}
                            onPress={() => void handleRemind(member.uid)}
                            fullWidth
                          />
                        </View>
                      ) : null}
                    </View>
                  </View>
                ))
              )}
            </FormSection>
          </FormStack>
        </SpiritualSurfaceBody>
      </SpiritualSurface>

      <Modal
        visible={Boolean(editMember)}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditMember(null)}>
        <SafeAreaView className="flex-1 bg-gp-bg dark:bg-gp-bg-dark" edges={['top', 'bottom']}>
          <View className="flex-row items-center justify-between border-b border-gp-border px-5 py-4 dark:border-gp-border-dark">
            <AppText bold className="text-lg text-gp-text dark:text-gp-text-dark">
              {editMember?.name ?? t('practiceEditAssignment')}
            </AppText>
            <Pressable
              onPress={() => setEditMember(null)}
              hitSlop={12}
              disabled={savingEdit}
              style={{ opacity: savingEdit ? 0.5 : 1 }}>
              <Ionicons name="close" size={24} color={colors.placeholder} />
            </Pressable>
          </View>
          <PracticeAssignmentPicker value={editItems} onChange={setEditItems} />
          <View className="px-5 pb-6">
            <AppText className="mb-3 text-xs text-gp-muted dark:text-gp-muted-dark">
              {t('practicePickAdhyaysHint')} ({REQUIRED_ADHYAY_COUNT})
            </AppText>
            <AppButton
              label={t('confirm')}
              loading={savingEdit}
              fullWidth
              onPress={() => void handleSaveEdit()}
            />
          </View>
        </SafeAreaView>
      </Modal>
    </Screen>
  );
}
