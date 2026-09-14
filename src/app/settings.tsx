import { Redirect } from 'expo-router';

import { Screen } from '@/components/layout/screen';
import { SettingsPanel } from '@/components/settings/settings-panel';
import { SpiritualSurface, SpiritualSurfaceBody } from '@/components/spiritual/spiritual-surface';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { useAuth } from '@/hooks/use-auth';
import { useLocale } from '@/providers/locale-provider';

export default function SettingsScreen() {
  const { t } = useLocale();
  const { profile, loading } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!profile) {
    return <Redirect href="/sign-in" />;
  }

  return (
    <Screen
      title={t('settingsTitle')}
      showBack
      animateContent={false}
      edges={['top', 'bottom']}
      contentClassName="px-5 pb-10 pt-2">
      <SpiritualSurface>
        <SpiritualSurfaceBody className="py-4">
          <SettingsPanel
            showProfileSummary
            name={profile?.name}
            phoneNumber={profile?.phoneNumber}
          />
        </SpiritualSurfaceBody>
      </SpiritualSurface>
    </Screen>
  );
}
