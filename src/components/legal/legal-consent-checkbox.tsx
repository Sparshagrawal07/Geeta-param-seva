import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, View } from 'react-native';

import { LegalLinks } from '@/components/legal/legal-links';
import { AppText } from '@/components/ui/app-text';
import { useAppColors } from '@/hooks/use-app-colors';
import { triggerHaptic } from '@/lib/haptics';
import { useLocale } from '@/providers/locale-provider';

interface LegalConsentCheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
  /** When false, only the checkbox label is shown (links rendered elsewhere). */
  showLinks?: boolean;
}

export function LegalConsentCheckbox({
  checked,
  onCheckedChange,
  className,
  showLinks = true,
}: LegalConsentCheckboxProps) {
  const { t } = useLocale();
  const colors = useAppColors();

  return (
    <View className={`gap-2 ${className ?? ''}`}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked }}
        onPress={() => {
          void triggerHaptic('light');
          onCheckedChange(!checked);
        }}
        className="flex-row items-start gap-3">
        <View
          className="mt-0.5 h-6 w-6 items-center justify-center rounded-md border-2"
          style={{
            borderColor: checked ? colors.saffron : colors.gpBorder,
            backgroundColor: checked ? colors.saffron : 'transparent',
          }}>
          {checked ? <Ionicons name="checkmark" size={16} color="#FFFFFF" /> : null}
        </View>
        <AppText className="flex-1 text-sm leading-6 text-gp-text dark:text-gp-text-dark">
          {t('termsAgreeCheckbox')}
        </AppText>
      </Pressable>
      {showLinks ? <LegalLinks className="pl-9" /> : null}
    </View>
  );
}
