import { View, type ViewStyle } from 'react-native';

import { AppText } from '@/components/ui/app-text';

interface InfoCardProps {
  label: string;
  value: string;
  style?: ViewStyle;
}

export function InfoCard({ label, value, style }: InfoCardProps) {
  return (
    <View
      className="rounded-2xl border border-saffron/15 bg-saffron/[0.06] p-3.5 dark:border-gold/20 dark:bg-gold/10"
      style={[{ flex: 1, minWidth: 0, minHeight: 84, justifyContent: 'center' }, style]}>
      <AppText
        className="text-xs leading-4 text-gp-muted dark:text-gp-muted-dark"
        numberOfLines={1}>
        {label}
      </AppText>
      <AppText
        bold
        className="mt-1.5 text-lg leading-7 text-gp-text dark:text-gp-text-dark"
        numberOfLines={2}
        style={{ flexShrink: 1 }}>
        {value}
      </AppText>
    </View>
  );
}
