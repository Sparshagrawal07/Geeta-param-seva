import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Screen } from '@/components/layout/screen';
import { SpiritualSurface, SpiritualSurfaceBody } from '@/components/spiritual/spiritual-surface';
import { AppText } from '@/components/ui/app-text';
import { SectionHeader } from '@/components/ui/section-header';
import { useAppColors } from '@/hooks/use-app-colors';
import { useAuth } from '@/hooks/use-auth';
import { triggerHaptic } from '@/lib/haptics';
import { isSeniorAdmin } from '@/lib/users';
import { useLocale } from '@/providers/locale-provider';

function MoreRow({
  icon,
  label,
  subtitle,
  onPress,
  last = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  subtitle?: string;
  onPress: () => void;
  last?: boolean;
}) {
  const colors = useAppColors();
  return (
    <Pressable
      onPress={() => {
        void triggerHaptic('light');
        onPress();
      }}
      className={`flex-row items-center gap-3 px-1 py-3.5 ${
        last ? '' : 'border-b border-saffron/10 dark:border-gold/15'
      }`}>
      <View className="h-11 w-11 items-center justify-center rounded-2xl bg-saffron/12 dark:bg-gold/15">
        <Ionicons name={icon} size={22} color={colors.saffron} />
      </View>
      <View className="min-w-0 flex-1">
        <AppText bold className="text-base text-gp-text dark:text-gp-text-dark">
          {label}
        </AppText>
        {subtitle ? (
          <AppText className="mt-0.5 text-sm text-gp-muted dark:text-gp-muted-dark">{subtitle}</AppText>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.placeholder} />
    </Pressable>
  );
}

export default function AdminMoreScreen() {
  const { t } = useLocale();
  const { profile } = useAuth();
  const router = useRouter();
  const senior = profile ? isSeniorAdmin(profile.role) : false;

  return (
    <Screen contentClassName="relative px-5 pb-10 pt-2" animateContent={false}>
      <SectionHeader title={t('moreTitle')} subtitle={t('moreSubtitle')} />
      <SpiritualSurface variant="elevated">
        <SpiritualSurfaceBody className="py-2">
          <MoreRow
            icon="newspaper-outline"
            label={t('tabFeed')}
            subtitle={t('feedGroupHint')}
            onPress={() => router.push('/(admin)/feed')}
          />
          <MoreRow
            icon="flag-outline"
            label={t('contentReportsTitle')}
            subtitle={t('contentReportsSubtitle')}
            onPress={() => router.push('/(admin)/reports')}
          />
          {senior ? (
            <MoreRow
              icon="layers-outline"
              label={t('groupsTitle')}
              subtitle={t('groupsSubtitle')}
              onPress={() => router.push('/(admin)/groups')}
            />
          ) : null}
          <MoreRow
            icon="settings-outline"
            label={t('accountSettings')}
            subtitle={t('settingsAccountHint')}
            onPress={() => router.push('/settings')}
          />
          <MoreRow
            icon="shield-checkmark-outline"
            label={t('privacyPolicy')}
            onPress={() => router.push('/legal/privacy')}
          />
          <MoreRow
            icon="document-text-outline"
            label={t('termsOfService')}
            onPress={() => router.push('/legal/terms')}
            last
          />
        </SpiritualSurfaceBody>
      </SpiritualSurface>
    </Screen>
  );
}
