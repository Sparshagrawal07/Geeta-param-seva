import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LegalConsentCheckbox } from '@/components/legal/legal-consent-checkbox';
import { AppButton } from '@/components/ui/button';
import { AppText } from '@/components/ui/app-text';
import { AppTextField } from '@/components/ui/text-field';
import { useAppColors } from '@/hooks/use-app-colors';
import { useFormFlow } from '@/hooks/use-form-flow';
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
  const { scrollRef, register, focusAndReveal, scrollFieldIntoView, dismissKeyboard } =
    useFormFlow();
  const [name, setName] = useState('');
  const [phoneDigits, setPhoneDigits] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!visible) return;
    // Open ready for the first field.
    const timer = setTimeout(() => {
      focusAndReveal('name', 16);
    }, 320);
    return () => clearTimeout(timer);
  }, [visible, focusAndReveal]);

  const resetAndClose = () => {
    dismissKeyboard();
    setName('');
    setPhoneDigits('');
    setAgreedToTerms(false);
    setErrorMessage('');
    setSuccess(false);
    setLoading(false);
    onClose();
  };

  const handleSubmit = async () => {
    dismissKeyboard();
    const trimmedName = normalizeJoinApplicantName(name);
    if (!isValidJoinApplicantName(trimmedName)) {
      setErrorMessage(t('errorName'));
      void triggerHaptic('warning');
      focusAndReveal('name');
      return;
    }
    if (!isValidIndianMobileDigits(phoneDigits)) {
      setErrorMessage(t('errorPhone'));
      void triggerHaptic('warning');
      focusAndReveal('phone');
      return;
    }
    if (!agreedToTerms) {
      setErrorMessage(t('termsAgreeRequired'));
      void triggerHaptic('warning');
      scrollFieldIntoView('phone', 120);
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

  const handlePhoneChange = (value: string) => {
    const next = sanitizeIndianMobileDigits(value);
    setPhoneDigits(next);
    if (errorMessage) setErrorMessage('');
    // Phone-pad has no Next — when digits are complete, reveal consent + submit.
    if (isValidIndianMobileDigits(next)) {
      dismissKeyboard();
      setTimeout(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={resetAndClose}>
      <View className="flex-1 justify-end bg-black/50">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
          className="max-h-[92%]">
          <SafeAreaView
            edges={['bottom']}
            className="max-h-full rounded-t-3xl border border-gp-border bg-gp-card dark:border-gp-border-dark dark:bg-gp-card-dark">
            <ScrollView
              ref={scrollRef}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 24 }}
              bounces={false}>
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
                    ref={register('name')}
                    label={t('name')}
                    value={name}
                    onChangeText={(value) => {
                      setName(value);
                      if (errorMessage) setErrorMessage('');
                    }}
                    autoComplete="name"
                    textContentType="name"
                    placeholder={t('namePlaceholder')}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => focusAndReveal('phone')}
                    onFocus={() => scrollFieldIntoView('name', 16)}
                  />

                  <AppTextField
                    ref={register('phone')}
                    label={t('phoneLabel')}
                    value={phoneDigits}
                    onChangeText={handlePhoneChange}
                    keyboardType="phone-pad"
                    autoComplete="tel-national"
                    textContentType="telephoneNumber"
                    maxLength={15}
                    prefix={INDIA_COUNTRY_CODE}
                    placeholder={t('phonePlaceholder')}
                    helperText={t('phoneHelper')}
                    onFocus={() => scrollFieldIntoView('phone', 24)}
                  />

                  <LegalConsentCheckbox
                    checked={agreedToTerms}
                    onCheckedChange={(value) => {
                      setAgreedToTerms(value);
                      if (errorMessage) setErrorMessage('');
                    }}
                  />

                  {errorMessage ? (
                    <View
                      className="rounded-2xl px-4 py-3"
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
                    disabled={!agreedToTerms}
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
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
