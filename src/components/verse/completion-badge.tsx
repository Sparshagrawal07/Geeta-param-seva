import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

import { AppText } from '@/components/ui/app-text';
import { useAppColors } from '@/hooks/use-app-colors';
import { useLocale } from '@/providers/locale-provider';

interface CompletionBadgeProps {
  variant?: 'completed' | 'pending';
}

export function CompletionBadge({ variant = 'completed' }: CompletionBadgeProps) {
  const { t } = useLocale();
  const { saffron, isDark } = useAppColors();
  const isCompleted = variant === 'completed';
  const iconColor = isCompleted ? saffron : isDark ? '#A89B94' : '#8B7355';
  const label = isCompleted ? t('practiceDayComplete') : t('practiceDayPending');

  return (
    <View className="mt-4 flex-row items-center justify-center gap-2">
      <Ionicons
        name={isCompleted ? 'checkmark-circle' : 'ellipse-outline'}
        size={18}
        color={iconColor}
      />
      <AppText
        className={`text-sm ${isCompleted ? 'text-saffron dark:text-saffron-light' : 'text-gp-muted dark:text-gp-muted-dark'}`}>
        {label}
      </AppText>
    </View>
  );
}
