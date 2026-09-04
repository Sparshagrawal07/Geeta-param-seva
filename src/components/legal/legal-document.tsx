import { View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import type { LegalAudience, LegalSection } from '@/lib/legal-content';
import { useLocale } from '@/providers/locale-provider';

interface LegalDocumentProps {
  audience: LegalAudience;
  /** When true, viewer is signed out — show member copy plus admin note. */
  signedOut?: boolean;
  sections: LegalSection[];
}

export function LegalDocument({ audience, signedOut = false, sections }: LegalDocumentProps) {
  const { t } = useLocale();

  const audienceLabel = signedOut
    ? t('legalAudienceSignedOutNote')
    : audience === 'admin'
      ? t('legalAudienceAdmin')
      : t('legalAudienceMember');

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
    </View>
  );
}
