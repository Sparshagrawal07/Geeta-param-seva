import Ionicons from '@expo/vector-icons/Ionicons';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';

import { useAppColors } from '@/hooks/use-app-colors';
import { triggerHaptic } from '@/lib/haptics';

/** Opens the shared Settings screen for all roles. */
export function AccountSettingsButton({ light = false }: { light?: boolean }) {
  const colors = useAppColors();
  const router = useRouter();

  return (
    <Pressable
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="Settings"
      onPress={() => {
        void triggerHaptic('light');
        router.push('/settings');
      }}
      className={
        light
          ? 'h-10 w-10 items-center justify-center rounded-full bg-black/30 dark:bg-black/40'
          : undefined
      }>
      <Ionicons name="settings-outline" size={light ? 22 : 24} color={light ? '#F5EDE8' : colors.saffron} />
    </Pressable>
  );
}
