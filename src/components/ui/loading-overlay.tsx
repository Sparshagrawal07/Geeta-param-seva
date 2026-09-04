import { StyleSheet, View } from 'react-native';

import { AppSpinner } from '@/components/ui/app-spinner';

interface LoadingOverlayProps {
  visible: boolean;
}

/** Subtle in-place loader — keeps content visible underneath */
export function LoadingOverlay({ visible }: LoadingOverlayProps) {
  if (!visible) {
    return null;
  }

  return (
    <View pointerEvents="auto" style={StyleSheet.absoluteFill} className="z-10 items-center justify-center">
      <View style={StyleSheet.absoluteFill} className="bg-gp-bg/70 dark:bg-gp-bg-dark/70" />
      <View className="rounded-2xl bg-gp-card px-7 py-6 shadow-sm dark:bg-gp-card-dark">
        <AppSpinner size="md" />
      </View>
    </View>
  );
}
