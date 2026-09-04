import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export type HapticKind =
  | 'none'
  | 'selection'
  | 'light'
  | 'medium'
  | 'heavy'
  | 'success'
  | 'warning'
  | 'error';

function canHaptic() {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

export async function triggerHaptic(kind: HapticKind = 'light') {
  if (!canHaptic() || kind === 'none') {
    return;
  }

  try {
    switch (kind) {
      case 'selection':
        await Haptics.selectionAsync();
        break;
      case 'light':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case 'medium':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        break;
      case 'heavy':
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        break;
      case 'success':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      case 'warning':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
      case 'error':
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        break;
    }
  } catch {
    // Haptics unavailable on some devices/simulators
  }
}

export function hapticForButtonVariant(
  variant: 'primary' | 'secondary' | 'destructive' | 'ghost'
): HapticKind {
  switch (variant) {
    case 'primary':
      return 'light';
    case 'destructive':
      return 'medium';
    case 'secondary':
      return 'selection';
    case 'ghost':
      return 'light';
  }
}
