import { useCallback, useEffect, useState } from 'react';
import { Redirect, useRouter } from 'expo-router';
import { View } from 'react-native';

import { LegalConsentCheckbox } from '@/components/legal/legal-consent-checkbox';
import { LanguageToggle } from '@/components/language-toggle';
import { SpiritualAuthShell } from '@/components/layout/spiritual-screen';
import { SpiritualSurface, SpiritualSurfaceBody } from '@/components/spiritual/spiritual-surface';
import { AppButton } from '@/components/ui/button';
import { AppText } from '@/components/ui/app-text';
import { FadeInView } from '@/components/ui/fade-in-view';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { useAndroidBackExit } from '@/hooks/use-android-back-exit';
import { getTermsOfServiceSections } from '@/lib/legal-content';
import { triggerHaptic } from '@/lib/haptics';
import { acceptTerms, hasAcceptedTerms } from '@/lib/terms-agreement';
import { useLocale } from '@/providers/locale-provider';

export default function TermsAgreementScreen() {
  const { t } = useLocale();
  const router = useRouter();
  useAndroidBackExit();
  const [checking, setChecking] = useState(true);
  const [alreadyAccepted, setAlreadyAccepted] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const sections = getTermsOfServiceSections('member');

  useEffect(() => {
    let cancelled = false;
    void hasAcceptedTerms().then((accepted) => {
      if (cancelled) return;
      setAlreadyAccepted(accepted);
      setChecking(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAgree = useCallback(async () => {
    if (!agreed) {
      void triggerHaptic('warning');
      return;
    }
    try {
      setSaving(true);
      await acceptTerms();
      void triggerHaptic('success');
      router.replace('/sign-in');
    } catch {
      void triggerHaptic('error');
    } finally {
      setSaving(false);
    }
  }, [agreed, router]);

  if (checking) {
    return <LoadingScreen />;
  }

  if (alreadyAccepted) {
    return <Redirect href="/sign-in" />;
  }

  return (
    <SpiritualAuthShell>
      <View className="absolute right-5 top-14 z-10">
        <LanguageToggle />
      </View>

      <FadeInView className="px-5 pb-10 pt-4">
        <AppText bold className="text-center text-2xl text-gp-text dark:text-gp-text-dark">
          {t('termsAgreementTitle')}
        </AppText>
        <AppText className="mt-2 text-center text-sm leading-6 text-gp-muted dark:text-gp-muted-dark">
          {t('termsAgreementSubtitle')}
        </AppText>

        <SpiritualSurface variant="auth" className="mt-6">
          <SpiritualSurfaceBody>
            <View className="gap-4">
              {sections.map((section) => (
                <View key={section.title} className="gap-1.5">
                  <AppText bold className="text-[15px] text-gp-text dark:text-gp-text-dark">
                    {section.title}
                  </AppText>
                  <AppText className="text-sm leading-6 text-gp-muted dark:text-gp-muted-dark">
                    {section.body}
                  </AppText>
                </View>
              ))}
            </View>

            <View className="mt-5 gap-4 border-t border-saffron/15 pt-5 dark:border-gold/20">
              <LegalConsentCheckbox checked={agreed} onCheckedChange={setAgreed} />
              <AppButton
                label={t('termsAgreeContinue')}
                loading={saving}
                disabled={!agreed}
                fullWidth
                onPress={() => void handleAgree()}
              />
            </View>
          </SpiritualSurfaceBody>
        </SpiritualSurface>
      </FadeInView>
    </SpiritualAuthShell>
  );
}
