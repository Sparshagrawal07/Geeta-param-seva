import { useState } from 'react';
import { View } from 'react-native';
import { Redirect } from 'expo-router';

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
import { auth } from '@/lib/firebase';
import { triggerHaptic } from '@/lib/haptics';
import { getPostAuthRoute } from '@/lib/routes';
import { profileNeedsName, upsertUserProfile } from '@/lib/users';
import { useLocale } from '@/providers/locale-provider';

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="rounded-xl border border-saffron/15 bg-gp-bg/60 px-4 py-3 dark:border-gold/20 dark:bg-gp-bg-dark/60">
      <AppText className="text-sm leading-6 text-gp-muted dark:text-gp-muted-dark">{label}</AppText>
      <AppText className="mt-1 text-lg leading-8 text-gp-text dark:text-gp-text-dark">{value}</AppText>
    </View>
  );
}

export default function CompleteProfileScreen() {
  const { profile, loading, refreshProfile } = useAuth();
  const { t } = useLocale();
  const colors = useAppColors();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (loading) {
    return <LoadingScreen />;
  }

  if (!profile) {
    return <Redirect href="/sign-in" />;
  }

  if (!profileNeedsName(profile)) {
    return <Redirect href={getPostAuthRoute(profile)} />;
  }

  const handleContinue = async () => {
    if (!name.trim()) {
      setErrorMessage(t('errorName'));
      void triggerHaptic('warning');
      return;
    }

    if (!auth.currentUser) {
      setErrorMessage(t('errorSignIn'));
      return;
    }

    try {
      setSubmitting(true);
      setErrorMessage('');

      await upsertUserProfile({
        uid: auth.currentUser.uid,
        name: name.trim(),
        phoneNumber: profile.phoneNumber,
      });

      const nextProfile = await refreshProfile();
      if (!nextProfile || profileNeedsName(nextProfile)) {
        throw new Error(t('errorProfile'));
      }

      void triggerHaptic('success');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('errorProfile'));
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

        <AuthHeroHeader title={t('completeProfileTitle')} subtitle={t('completeProfilePrompt')} />

        <View className="px-5 pb-10">
          <FadeInView className="mb-6 items-center">
            <AppBrand />
          </FadeInView>

          <FadeInView delay={80}>
            <SpiritualSurface variant="auth">
              <SpiritualSurfaceBody>
                <View className="gap-5">
                  <SummaryRow label={t('phoneLabel')} value={profile.phoneNumber || t('emptyValue')} />

                  <AppTextField
                    label={t('name')}
                    value={name}
                    onChangeText={setName}
                    autoCapitalize="words"
                    autoComplete="name"
                    placeholder={t('namePlaceholder')}
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
                    label={t('completeProfileContinue')}
                    loading={submitting}
                    fullWidth
                    onPress={() => void handleContinue()}
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
