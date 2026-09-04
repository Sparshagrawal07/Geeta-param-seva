import { Linking, Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import type { LegalAudience, LegalSection } from '@/lib/legal-content';
import { LEGAL_PRIVACY_URL, LEGAL_TERMS_URL } from '@/lib/legal-content';
import { useLocale } from '@/providers/locale-provider';

interface LegalDocumentProps {
  audience: LegalAudience;
  /** When true, viewer is signed out — show member copy plus admin note. */
  signedOut?: boolean;
  sections: LegalSection[];
  /** Which public GitHub Pages document this screen mirrors. */
  document?: 'privacy' | 'terms';
}

export function LegalDocument({
  audience,
  signedOut = false,
  sections,
  document,
}: LegalDocumentProps) {
  const { t } = useLocale();

  const audienceLabel = signedOut
    ? t('legalAudienceSignedOutNote')
    : audience === 'admin'
      ? t('legalAudienceAdmin')
      : t('legalAudienceMember');

  const publicUrl =
    document === 'privacy' ? LEGAL_PRIVACY_URL : document === 'terms' ? LEGAL_TERMS_URL : null;

  return (
    <View className="mt-4 gap-5">
      <View className="rounded-2xl border border-gp-border bg-gp-card px-4 py-3.5 dark:border-gp-border-dark dark:bg-gp-card-dark">
        <AppText className="text-sm leading-6 text-gp-muted dark:text-gp-muted-dark">
          {audienceLabel}
        </AppText>
      </View>

      {sections.map((section) => (
        <View
          key={section.title}
          className="rounded-2xl border border-gp-border bg-gp-card px-4 py-4 dark:border-gp-border-dark dark:bg-gp-card-dark">
          <AppText bold className="text-[15px] text-gp-text dark:text-gp-text-dark">
            {section.title}
          </AppText>
          <AppText className="mt-2 text-base leading-7 text-gp-muted dark:text-gp-muted-dark">
            {section.body}
          </AppText>
        </View>
      ))}

      {publicUrl ? (
        <Pressable
          accessibilityRole="link"
          onPress={() => {
            void Linking.openURL(publicUrl);
          }}
          className="rounded-2xl border border-gp-border bg-gp-card px-4 py-3.5 dark:border-gp-border-dark dark:bg-gp-card-dark">
          <AppText className="text-sm text-saffron dark:text-saffron-light">{t('legalViewOnline')}</AppText>
          <AppText className="mt-1 text-xs leading-5 text-gp-muted dark:text-gp-muted-dark">
            {publicUrl}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}
