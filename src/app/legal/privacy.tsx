import { LegalDocument } from '@/components/legal/legal-document';
import { Screen } from '@/components/layout/screen';
import { SpiritualSurface, SpiritualSurfaceBody } from '@/components/spiritual/spiritual-surface';
import { AppText } from '@/components/ui/app-text';
import { useAuth } from '@/hooks/use-auth';
import { getPrivacyPolicySections, resolveLegalAudience } from '@/lib/legal-content';
import { useLocale } from '@/providers/locale-provider';

export default function PrivacyPolicyScreen() {
  const { t } = useLocale();
  const { profile } = useAuth();
  const audience = resolveLegalAudience(profile?.role);
  const signedOut = !profile;
  const sections = getPrivacyPolicySections(audience);

  return (
    <Screen
      scrollable
      showBack
      title={t('privacyPolicy')}
      animateContent={false}
      contentClassName="px-5 pb-10 pt-2">
      <SpiritualSurface>
        <SpiritualSurfaceBody className="py-4">
          <AppText className="text-sm text-gp-muted dark:text-gp-muted-dark">{t('legalLastUpdated')}</AppText>
          <LegalDocument
            audience={audience}
            signedOut={signedOut}
            sections={sections}
            document="privacy"
          />
        </SpiritualSurfaceBody>
      </SpiritualSurface>
    </Screen>
  );
}
