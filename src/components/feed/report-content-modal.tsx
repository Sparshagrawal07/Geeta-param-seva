import { useEffect, useState } from 'react';
import {
  InteractionManager,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppButton } from '@/components/ui/button';
import { AppPressable } from '@/components/ui/app-pressable';
import { AppText } from '@/components/ui/app-text';
import { useAppColors } from '@/hooks/use-app-colors';
import { triggerHaptic } from '@/lib/haptics';
import { useAlert } from '@/providers/alert-provider';
import { useLocale } from '@/providers/locale-provider';
import { submitContentReport } from '@/services/content-reports';
import {
  CONTENT_REPORT_DETAILS_MAX,
  CONTENT_REPORT_REASONS,
  isValidReportDetails,
  type ContentReportReason,
} from '@/types/content-report';
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

interface ReportContentModalProps {
  visible: boolean;
  item: FeedItem | null;
  reporterUid: string;
  reporterName: string;
  onClose: () => void;
}

type SheetStep = 'form' | 'confirm';

/**
 * Report sheet stays a single Modal. Confirm + validation stay inline —
 * nesting AppConfirmDialog (another Modal) on top freezes the app on iOS/Android.
 */
export function ReportContentModal({
  visible,
  item,
  reporterUid,
  reporterName,
  onClose,
}: ReportContentModalProps) {
  const { t } = useLocale();
  const colors = useAppColors();
  const { alert } = useAlert();
  const [reason, setReason] = useState<ContentReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<SheetStep>('form');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (!visible) {
      setReason(null);
      setDetails('');
      setLoading(false);
      setStep('form');
      setFormError('');
    }
  }, [visible]);

  const resetAndClose = () => {
    setReason(null);
    setDetails('');
    setLoading(false);
    setStep('form');
    setFormError('');
    onClose();
  };

  const showAlertAfterClose = (title: string, message: string) => {
    resetAndClose();
    InteractionManager.runAfterInteractions(() => {
      alert({ title, message });
    });
  };

  const performSubmit = async () => {
    if (!item || !reason) return;
    try {
      setLoading(true);
      const result = await submitContentReport({
        item,
        reason,
        reporterName,
        details,
      });
      void triggerHaptic('success');
      if (result === 'already_reported') {
        showAlertAfterClose(t('reportSuccessTitle'), t('reportAlreadySubmitted'));
      } else {
        showAlertAfterClose(t('reportSuccessTitle'), t('reportSuccessMessage'));
      }
    } catch {
      void triggerHaptic('error');
      setLoading(false);
      setStep('form');
      setFormError(t('reportFailed'));
    }
  };

  const handleRequestSubmit = () => {
    if (!item || !reason) {
      void triggerHaptic('warning');
      setFormError(t('reportContentSubtitle'));
      return;
    }
    if (item.createdBy === reporterUid) {
      void triggerHaptic('warning');
      setFormError(t('reportCannotOwn'));
      return;
    }
    if (!isValidReportDetails(reason, details)) {
      void triggerHaptic('warning');
      setFormError(t('reportDetailsRequired'));
      return;
    }

    setFormError('');
    void triggerHaptic('light');
    setStep('confirm');
  };

  const canSubmit =
    Boolean(reason) && (reason ? isValidReportDetails(reason, details) : false);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={resetAndClose}>
      <View className="flex-1 justify-end bg-black/50">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
          className="max-h-[92%]">
          <SafeAreaView
            edges={['bottom']}
            className="max-h-full rounded-t-3xl border border-gp-border bg-gp-card dark:border-gp-border-dark dark:bg-gp-card-dark">
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24 }}>
              {step === 'confirm' ? (
                <>
                  <AppText bold className="text-lg text-gp-text dark:text-gp-text-dark">
                    {t('reportConfirmTitle')}
                  </AppText>
                  <AppText className="mt-2 text-sm leading-6 text-gp-muted dark:text-gp-muted-dark">
                    {t('reportConfirmMessage')}
                  </AppText>
                  {reason ? (
                    <AppText className="mt-3 text-sm text-gp-text dark:text-gp-text-dark">
                      {t(REASON_LABEL_KEYS[reason])}
                    </AppText>
                  ) : null}

                  <View className="mt-5 gap-3">
                    <AppButton
                      label={t('reportConfirmAction')}
                      loading={loading}
                      fullWidth
                      onPress={() => void performSubmit()}
                    />
                    <AppButton
                      label={t('cancel')}
                      variant="secondary"
                      fullWidth
                      disabled={loading}
                      onPress={() => {
                        if (loading) return;
                        setStep('form');
                      }}
                    />
                  </View>
                </>
              ) : (
                <>
                  <View className="mb-1 flex-row items-center justify-between">
                    <AppText bold className="text-lg text-gp-text dark:text-gp-text-dark">
                      {t('reportContentTitle')}
                    </AppText>
                    <AppPressable
                      accessibilityRole="button"
                      accessibilityLabel={t('cancel')}
                      onPress={resetAndClose}
                      haptic="light"
                      className="h-10 w-10 items-center justify-center"
                      minTouchSize={44}>
                      <Ionicons name="close" size={22} color={colors.placeholder} />
                    </AppPressable>
                  </View>
                  <AppText className="text-sm leading-6 text-gp-muted dark:text-gp-muted-dark">
                    {t('reportContentSubtitle')}
                  </AppText>

                  <View className="mt-4 gap-2">
                    {CONTENT_REPORT_REASONS.map((value) => {
                      const selected = reason === value;
                      return (
                        <AppPressable
                          key={value}
                          onPress={() => {
                            setReason(value);
                            if (formError) setFormError('');
                          }}
                          haptic="selection"
                          minTouchSize={0}
                          className="flex-row items-center gap-3 rounded-2xl border px-4 py-3.5"
                          style={{
                            borderColor: selected ? colors.saffron : colors.gpBorder,
                            backgroundColor: selected ? `${colors.saffron}18` : 'transparent',
                          }}>
                          <View
                            className="h-5 w-5 items-center justify-center rounded-full border-2"
                            style={{
                              borderColor: selected ? colors.saffron : colors.placeholder,
                            }}>
                            {selected ? (
                              <View
                                className="h-2.5 w-2.5 rounded-full"
                                style={{ backgroundColor: colors.saffron }}
                              />
                            ) : null}
                          </View>
                          <AppText className="flex-1 text-base text-gp-text dark:text-gp-text-dark">
                            {t(REASON_LABEL_KEYS[value])}
                          </AppText>
                        </AppPressable>
                      );
                    })}
                  </View>

                  {reason ? (
                    <View className="mt-4 gap-2">
                      <AppText className="text-sm text-gp-muted dark:text-gp-muted-dark">
                        {t('reportDetailsLabel')}
                        {reason === 'other' ? ' *' : ''}
                      </AppText>
                      <TextInput
                        value={details}
                        onChangeText={(value) => {
                          setDetails(value);
                          if (formError) setFormError('');
                        }}
                        placeholder={t('reportDetailsPlaceholder')}
                        placeholderTextColor={colors.placeholder}
                        multiline
                        maxLength={CONTENT_REPORT_DETAILS_MAX}
                        textAlignVertical="top"
                        className="min-h-[96px] rounded-2xl border border-gp-border bg-gp-bg px-4 py-3 text-base leading-6 text-gp-text dark:border-gp-border-dark dark:bg-gp-bg-dark dark:text-gp-text-dark"
                      />
                    </View>
                  ) : null}

                  {formError ? (
                    <View
                      className="mt-4 rounded-2xl px-4 py-3"
                      style={{
                        backgroundColor: colors.destructiveMutedBg,
                        borderWidth: 1,
                        borderColor: colors.destructiveBorder,
                      }}>
                      <AppText style={{ color: colors.destructiveText }}>{formError}</AppText>
                    </View>
                  ) : null}

                  <View className="mt-5 gap-3">
                    <AppButton
                      label={t('reportSubmit')}
                      disabled={!canSubmit}
                      fullWidth
                      onPress={handleRequestSubmit}
                    />
                    <AppButton
                      label={t('cancel')}
                      variant="secondary"
                      fullWidth
                      onPress={resetAndClose}
                    />
                  </View>
                </>
              )}
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
