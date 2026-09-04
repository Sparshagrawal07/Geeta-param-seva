import Ionicons from '@expo/vector-icons/Ionicons';
import { View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { useAppColors } from '@/hooks/use-app-colors';

interface VerseReferencePillProps {
  reference: string;
  compact?: boolean;
}

export function VerseReferencePill({ reference, compact = false }: VerseReferencePillProps) {
  const { isDark } = useAppColors();
  const bg = isDark ? 'bg-devotional-dark' : 'bg-devotional';
  const textColor = isDark ? 'text-gold' : 'text-white';

  return (
    <View
      className={`flex-row items-center gap-2 self-start rounded-full ${bg} ${compact ? 'px-2.5 py-1' : 'px-3.5 py-1.5'}`}>
      <Ionicons name="book-outline" size={compact ? 12 : 14} color={isDark ? '#E8C547' : '#FFFFFF'} />
      <AppText bold className={`${textColor} ${compact ? 'text-xs' : 'text-sm'}`}>
        {reference}
      </AppText>
    </View>
  );
}
