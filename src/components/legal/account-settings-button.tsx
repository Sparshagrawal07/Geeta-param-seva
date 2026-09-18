import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';

import { GlassIconButton } from '@/components/ui/glass-pressable';
import { useAppColors } from '@/hooks/use-app-colors';
import { triggerHaptic } from '@/lib/haptics';

/** Opens the shared Settings screen for all roles. */
export function AccountSettingsButton({ light = false }: { light?: boolean }) {
  const colors = useAppColors();
  const router = useRouter();

  return (
    <GlassIconButton
      light={light}
      accessibilityRole="button"
      accessibilityLabel="Settings"
      haptic="light"
      onPress={() => {
        void triggerHaptic('light');
        router.push('/settings');
      }}>
      <Ionicons
        name="settings-outline"
        size={light ? 22 : 24}
        color={light ? '#F5EDE8' : colors.saffron}
      />
    </GlassIconButton>
  );
}
