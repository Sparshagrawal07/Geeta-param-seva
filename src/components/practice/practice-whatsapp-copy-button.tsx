import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/components/ui/app-text';
import { useAppColors } from '@/hooks/use-app-colors';

interface PracticeWhatsAppCopyButtonProps {
  disabled?: boolean;
  onPress: () => void;
  label: string;
  accessibilityLabel?: string;
}

/** Compact icon + label control for copying incomplete Adhyay WhatsApp text. */
export function PracticeWhatsAppCopyButton({
  disabled = false,
  onPress,
  label,
  accessibilityLabel,
}: PracticeWhatsAppCopyButtonProps) {
  const colors = useAppColors();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || label}
      disabled={disabled}
      onPress={onPress}
      className={`flex-row items-center justify-center gap-2 rounded-2xl border border-saffron/20 bg-saffron/10 px-4 py-3 dark:border-gold/25 dark:bg-gold/10 ${
        disabled ? 'opacity-45' : ''
      }`}>
      <View className="h-9 w-9 items-center justify-center rounded-full bg-saffron/15 dark:bg-gold/15">
        <Ionicons name="copy-outline" size={20} color={colors.saffron} />
      </View>
      <AppText bold className="flex-1 text-sm text-saffron dark:text-gold">
        {label}
      </AppText>
      <Ionicons name="logo-whatsapp" size={20} color={colors.saffron} />
    </Pressable>
  );
}
