import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';

import { SpiritualSurface, SpiritualSurfaceBody } from '@/components/spiritual/spiritual-surface';
import { AppText } from '@/components/ui/app-text';
import { useAppColors } from '@/hooks/use-app-colors';
import { triggerHaptic } from '@/lib/haptics';

interface AdminQuickActionCardProps {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  href: string;
}

/** Spiritual quick-action tile used on the admin dashboard. */
export function AdminQuickActionCard({ label, icon, href }: AdminQuickActionCardProps) {
  const colors = useAppColors();

  return (
    <SpiritualSurface variant="elevated" className="min-w-[46%] flex-1" style={{ maxWidth: '48%' }}>
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          void triggerHaptic('light');
          router.push(href as never);
        }}
        className="flex-row items-center gap-3 px-4 py-4">
        <View className="h-11 w-11 items-center justify-center rounded-2xl bg-saffron/12 dark:bg-gold/15">
          <Ionicons name={icon} size={22} color={colors.saffron} />
        </View>
        <AppText bold className="min-w-0 flex-1 text-sm leading-5 text-gp-text dark:text-gp-text-dark">
          {label}
        </AppText>
        <Ionicons name="chevron-forward" size={16} color={colors.placeholder} />
      </Pressable>
    </SpiritualSurface>
  );
}
