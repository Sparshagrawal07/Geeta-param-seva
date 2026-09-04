import { View } from 'react-native';

import { AppBrand } from '@/components/app-brand';
import { SafeBannerAd } from '@/components/ads/safe-banner-ad';
import { Screen } from '@/components/layout/screen';
import { SettingsPanel } from '@/components/settings/settings-panel';
import { MandalaWashBackdrop } from '@/components/spiritual/mandala-accent';
import { SpiritualSurface, SpiritualSurfaceBody } from '@/components/spiritual/spiritual-surface';
import { SectionHeader } from '@/components/ui/section-header';
import { useAuth } from '@/hooks/use-auth';
import { useLocale } from '@/providers/locale-provider';

export default function UserProfileScreen() {
  const { profile } = useAuth();
  const { t } = useLocale();

  return (
    <Screen contentClassName="px-5 pb-10 pt-2" animateContent={false}>
      <SectionHeader title={t('profileTitle')} subtitle={t('settingsAccountHint')} />

      <SpiritualSurface withMandala>
        <SpiritualSurfaceBody>
          <View className="relative items-center overflow-hidden rounded-2xl py-2">
            <MandalaWashBackdrop opacity={0.1} />
            <View className="relative z-[1]">
              <AppBrand />
            </View>
          </View>
          <View className="mt-5">
            <SettingsPanel showProfileSummary name={profile?.name} phoneNumber={profile?.phoneNumber} />
          </View>
        </SpiritualSurfaceBody>
      </SpiritualSurface>

      <SafeBannerAd screen="profile" slot={1} />
    </Screen>
  );
}
