import { useState } from 'react';
import { Modal, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppButton } from '@/components/ui/button';
import { AppText } from '@/components/ui/app-text';
import { AppTextField } from '@/components/ui/text-field';
import { useAppColors } from '@/hooks/use-app-colors';
import { isValidJoinApplicantName, normalizeJoinApplicantName } from '@/lib/join-application';
import { triggerHaptic } from '@/lib/haptics';
import {
  INDIA_COUNTRY_CODE,
  isValidIndianMobileDigits,
  sanitizeIndianMobileDigits,
  toE164IndianMobile,
} from '@/lib/phone';
import { useLocale } from '@/providers/locale-provider';
import {
  mapJoinApplicationError,
  submitJoinApplicationRemote,
} from '@/services/join-applications';

interface ApplyToJoinSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function ApplyToJoinSheet({ visible, onClose }: ApplyToJoinSheetProps) {
  const { t } = useLocale();
  const colors = useAppColors();
  const [name, setName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [success, setSuccess] = useState(false);

  const resetAndClose = () => {
    setName('');
    setPhoneDigits('');
    setErrorMessage('');
    setSuccess(false);
    setLoading(false);
    onClose();
  };

  const handleSubmit = async () => {
    const trimmedName = normalizeJoinApplicantName(name);
    if (!isValidJoinApplicantName(trimmedName)) {
      setErrorMessage(t('errorName'));
      void triggerHaptic('warning');
      return;
    }
    if (!isValidIndianMobileDigits(phoneDigits)) {
      setErrorMessage(t('errorPhone'));
      void triggerHaptic('warning');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage('');
      await submitJoinApplicationRemote({
        name: trimmedName,
        phoneNumber: toE164IndianMobile(phoneDigits),
      });
      setSuccess(true);
      void triggerHaptic('success');
    } catch (error) {
      const mapped = mapJoinApplicationError(error, t('applyToJoinError'));
      const message =
        mapped === 'ALREADY_ON_ROSTER'
          ? t('applyToJoinAlreadyOnRoster')
          : mapped === 'ALREADY_APPROVED'
            ? t('applyToJoinAlreadyApproved')
            : mapped === 'RATE_LIMITED'
              ? t('applyToJoinRateLimited')
              : mapped === 'INVALID_INPUT'
                ? t('errorPhone')
                : mapped;
      setErrorMessage(message);
      void triggerHaptic('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={resetAndClose}>
      <View className="flex-1 justify-end bg-black/50">
        <SafeAreaView edges={['bottom']} className="rounded-t-3xl border border-gp-border bg-gp-card dark:border-gp-border-dark dark:bg-gp-card-dark">
          <View className="px-5 pb-6 pt-5">
            <AppText bold className="text-lg text-gp-text dark:text-gp-text-dark">
              {t('applyToJoinTitle')}
            </AppText>
            <AppText className="mt-2 text-sm leading-6 text-gp-muted dark:text-gp-muted-dark">
              {success ? t('applyToJoinSuccess') : t('applyToJoinSubtitle')}
            </AppText>

            {success ? (
              <View className="mt-6">
                <AppButton label={t('applyToJoinClose')} fullWidth onPress={resetAndClose} />
              </View>
            ) : (
              <View className="mt-5 gap-5">
                <AppTextField
                  label={t('name')}
                  value={name}
                  onChangeText={(value) => {
                    setName(value);
                    if (errorMessage) setErrorMessage('');
                  }}
                  autoComplete="name"
                  textContentType="name"
                  placeholder={t('namePlaceholder')}
                />

                <AppTextField
                  label={t('phoneLabel')}
                  value={phoneDigits}
                  onChangeText={(value) => {
                    setPhoneDigits(sanitizeIndianMobileDigits(value));
                    if (errorMessage) setErrorMessage('');
                  }}
                  keyboardType="phone-pad"
                  autoComplete="tel-national"
                  textContentType="telephoneNumber"
                  maxLength={15}
                  prefix={INDIA_COUNTRY_CODE}
                  placeholder={t('phonePlaceholder')}
                  helperText={t('phoneHelper')}
                />

                {errorMessage ? (
                  <View
                    className="rounded-xl px-4 py-3"
                    style={{
                      backgroundColor: colors.destructiveMutedBg,
                      borderWidth: 1,
                      borderColor: colors.destructiveBorder,
                    }}>
                    <AppText style={{ color: colors.destructiveText }}>{errorMessage}</AppText>
                  </View>
                ) : null}

                <AppButton
                  label={t('applyToJoinSubmit')}
                  loading={loading}
                  fullWidth
                  onPress={() => void handleSubmit()}
                />
                <AppButton
                  label={t('cancel')}
                  variant="secondary"
                  fullWidth
                  disabled={loading}
                  onPress={resetAndClose}
                />
              </View>
            )}
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
