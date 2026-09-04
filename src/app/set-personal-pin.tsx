import { useState } from 'react';
import { View } from 'react-native';
import { Redirect, router } from 'expo-router';

import { AppBrand } from '@/components/app-brand';
import { LanguageToggle } from '@/components/language-toggle';
import { SpiritualAuthShell } from '@/components/layout/spiritual-screen';
import { SpiritualSurface, SpiritualSurfaceBody } from '@/components/spiritual/spiritual-surface';
import { AuthHeroHeader } from '@/components/verse/home-hero-header';
import { AppButton } from '@/components/ui/button';
import { AppText } from '@/components/ui/app-text';
import { FadeInView } from '@/components/ui/fade-in-view';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { AppTextField } from '@/components/ui/text-field';
import { useAuth } from '@/hooks/use-auth';
import { useAppColors } from '@/hooks/use-app-colors';
import { triggerHaptic } from '@/lib/haptics';
import {
  isValidGroupPin,
  mapPinAuthError,
  normalizeGroupPin,
  setPersonalPinRemote,
} from '@/lib/pin-auth';
import { getDashboardRoute, needsPersonalPinSetup } from '@/lib/routes';
import { isAdminRole } from '@/lib/users';
import { useLocale } from '@/providers/locale-provider';

export default function SetPersonalPinScreen() {
  const { profile, loading, refreshProfile } = useAuth();
  const { t } = useLocale();
  const colors = useAppColors();
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (loading) {
    return <LoadingScreen />;
  }

  if (!profile) {
    return <Redirect href="/sign-in" />;
  }

  if (!isAdminRole(profile.role)) {
    return <Redirect href={getDashboardRoute(profile.role)} />;
  }

  const isForcedSetup = needsPersonalPinSetup(profile);

  const handleSave = async () => {
    if (!isValidGroupPin(pin)) {
      setErrorMessage(t('errorPersonalPin'));
      void triggerHaptic('warning');
      return;
    }
    if (pin !== confirmPin) {
      setErrorMessage(t('errorPersonalPinMismatch'));
      void triggerHaptic('warning');
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage('');
      await setPersonalPinRemote({ pin });
      const next = await refreshProfile();
      if (!next?.hasPersonalPin) {
        throw new Error(t('errorPersonalPinSave'));
      }
      void triggerHaptic('success');
      if (isForcedSetup) {
        router.replace(getDashboardRoute(next.role));
      } else if (router.canGoBack()) {
        router.back();
      } else {
        router.replace(getDashboardRoute(next.role));
      }
    } catch (error) {
      const mapped = mapPinAuthError(error, t('errorPersonalPinSave'));
      setErrorMessage(mapped === 'JOIN_PIN_EXPIRED' ? t('errorJoinPinExpired') : mapped);
      void triggerHaptic('error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SpiritualAuthShell>
      <View className="flex-1">
        <View className="absolute right-5 top-14 z-10">
          <LanguageToggle />
        </View>

        <AuthHeroHeader
          title={isForcedSetup ? t('setPersonalPinTitle') : t('changePersonalPinTitle')}
          subtitle={isForcedSetup ? t('setPersonalPinPrompt') : t('changePersonalPinPrompt')}
        />

        <View className="px-5 pb-10">
          <FadeInView className="mb-6 items-center">
            <AppBrand />
          </FadeInView>

          <FadeInView delay={80}>
            <SpiritualSurface variant="auth">
              <SpiritualSurfaceBody>
                <View className="gap-5">
                  <AppTextField
                    label={t('personalPinLabel')}
                    value={pin}
                    onChangeText={(value) => {
                      setPin(normalizeGroupPin(value));
                      if (errorMessage) setErrorMessage('');
                    }}
                    keyboardType="number-pad"
                    secureTextEntry
                    maxLength={8}
                    placeholder={t('personalPinPlaceholder')}
                    helperText={t('personalPinHelper')}
                  />
                  <AppTextField
                    label={t('personalPinConfirmLabel')}
                    value={confirmPin}
                    onChangeText={(value) => {
                      setConfirmPin(normalizeGroupPin(value));
                      if (errorMessage) setErrorMessage('');
                    }}
                    keyboardType="number-pad"
                    secureTextEntry
                    maxLength={8}
                    placeholder={t('personalPinPlaceholder')}
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
                    label={isForcedSetup ? t('setPersonalPinContinue') : t('savePersonalPin')}
                    loading={submitting}
                    fullWidth
                    onPress={() => void handleSave()}
                  />
                </View>
              </SpiritualSurfaceBody>
            </SpiritualSurface>
          </FadeInView>
        </View>
      </View>
    </SpiritualAuthShell>
  );
}
