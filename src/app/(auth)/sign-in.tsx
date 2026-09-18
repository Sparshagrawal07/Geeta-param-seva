import { useState } from 'react';
import { View } from 'react-native';

import { ApplyToJoinSheet } from '@/components/auth/apply-to-join-sheet';
import { AppBrand } from '@/components/app-brand';
import { LegalLinks } from '@/components/legal/legal-links';
import { LanguageToggle } from '@/components/language-toggle';
import { SpiritualAuthShell } from '@/components/layout/spiritual-screen';
import { SpiritualSurface, SpiritualSurfaceBody } from '@/components/spiritual/spiritual-surface';
import { AuthHeroHeader } from '@/components/verse/home-hero-header';
import { AppButton } from '@/components/ui/button';
import { AppText } from '@/components/ui/app-text';
import { FadeInView } from '@/components/ui/fade-in-view';
import { useAppColors } from '@/hooks/use-app-colors';
import { useFormFlow } from '@/hooks/use-form-flow';
import { AppTextField } from '@/components/ui/text-field';
import { useAuth } from '@/hooks/use-auth';
import { useAndroidBackExit } from '@/hooks/use-android-back-exit';
import {
  isValidGroupPin,
  mapPinAuthError,
  normalizeGroupPin,
  signInWithPhoneAndGroupPin,
} from '@/lib/pin-auth';
import {
  INDIA_COUNTRY_CODE,
  isValidIndianMobileDigits,
  sanitizeIndianMobileDigits,
  toE164IndianMobile,
} from '@/lib/phone';
import { triggerHaptic } from '@/lib/haptics';
import { useLocale } from '@/providers/locale-provider';

export default function SignInScreen() {
  const { refreshProfile } = useAuth();
  const { t } = useLocale();
  const colors = useAppColors();
  const { scrollRef, register, focusAndReveal, scrollFieldIntoView, dismissKeyboard } =
    useFormFlow();
  useAndroidBackExit();
  const [phoneDigits, setPhoneDigits] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [applyOpen, setApplyOpen] = useState(false);

  const handlePhoneChange = (value: string) => {
    const next = sanitizeIndianMobileDigits(value);
    setPhoneDigits(next);
    if (errorMessage) setErrorMessage('');
    // Phone-pad has no Next — advance to PIN when digits are complete.
    if (isValidIndianMobileDigits(next)) {
      focusAndReveal('pin', 32);
    }
  };

  const handlePinChange = (value: string) => {
    setPin(normalizeGroupPin(value));
    if (errorMessage) setErrorMessage('');
  };

  const handleSignIn = async () => {
    dismissKeyboard();
    if (!isValidIndianMobileDigits(phoneDigits)) {
      setErrorMessage(t('errorPhone'));
      void triggerHaptic('warning');
      focusAndReveal('phone');
      return;
    }
    if (!isValidGroupPin(pin)) {
      setErrorMessage(t('errorPin'));
      void triggerHaptic('warning');
      focusAndReveal('pin');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage('');
      await signInWithPhoneAndGroupPin({
        phoneNumber: toE164IndianMobile(phoneDigits),
        pin,
      });
      const profile = await refreshProfile();
      if (!profile) throw new Error(t('errorProfile'));
      void triggerHaptic('success');
    } catch (error) {
      const mapped = mapPinAuthError(error, t('errorSignIn'));
      setErrorMessage(mapped === 'JOIN_PIN_EXPIRED' ? t('errorJoinPinExpired') : mapped);
      void triggerHaptic('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SpiritualAuthShell scrollRef={scrollRef}>
      <View className="flex-1">
        <View className="absolute right-5 top-14 z-10">
          <LanguageToggle />
        </View>

        <AuthHeroHeader title={t('appName')} subtitle={t('signInPrompt')} />

        <View className="px-5 pb-10">
          <FadeInView className="mb-6 items-center">
            <AppBrand />
          </FadeInView>

          <FadeInView delay={80}>
            <SpiritualSurface variant="auth">
              <SpiritualSurfaceBody>
                <AppText className="text-center text-sm leading-6 text-gp-muted dark:text-gp-muted-dark">
                  {t('signInPinHint')}
                </AppText>

                <View className="mt-6 gap-5">
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

                  <AppTextField
                    ref={register('pin')}
                    label={t('pinLabel')}
                    value={pin}
                    onChangeText={handlePinChange}
                    keyboardType="number-pad"
                    secureTextEntry
                    maxLength={8}
                    placeholder={t('pinPlaceholder')}
                    helperText={t('pinHelper')}
                    returnKeyType="done"
                    onSubmitEditing={() => void handleSignIn()}
                    onFocus={() => scrollFieldIntoView('pin', 40)}
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

                  <View className="gap-3">
                    <AppText className="text-center text-sm leading-6 text-gp-muted dark:text-gp-muted-dark">
                      {t('signInLegalConsent')}
                    </AppText>
                    <LegalLinks className="justify-center" />
                    <AppButton
                      label={t('signIn')}
                      loading={loading}
                      fullWidth
                      onPress={() => void handleSignIn()}
                    />
                    <View className="mt-2 gap-2">
                      <AppText className="text-center text-sm leading-6 text-gp-muted dark:text-gp-muted-dark">
                        {t('signInCommunityHint')}
                      </AppText>
                      <AppButton
                        label={t('applyToJoinCta')}
                        variant="secondary"
                        fullWidth
                        disabled={loading}
                        onPress={() => {
                          void triggerHaptic('light');
                          setApplyOpen(true);
                        }}
                      />
                    </View>
                  </View>
                </View>
              </SpiritualSurfaceBody>
            </SpiritualSurface>
          </FadeInView>
        </View>
      </View>

      <ApplyToJoinSheet visible={applyOpen} onClose={() => setApplyOpen(false)} />
    </SpiritualAuthShell>
  );
}
