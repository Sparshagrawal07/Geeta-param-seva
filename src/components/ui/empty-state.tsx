import { View } from 'react-native';

import { MandalaAccent } from '@/components/spiritual/mandala-accent';
import { AppText } from '@/components/ui/app-text';
import { spiritualDesignTokens } from '@/lib/spiritual-assets';

interface EmptyStateProps {
  title: string;
  message?: string;
}

export function EmptyState({ title, message }: EmptyStateProps) {
  return (
    <View className="relative items-center overflow-hidden rounded-2xl border border-dashed border-gp-border bg-gp-card px-6 py-10 dark:border-gp-border-dark dark:bg-gp-card-dark">
      <View pointerEvents="none" className="absolute inset-0 overflow-hidden">
        <MandalaAccent kind="wash" opacity={spiritualDesignTokens.washOpacity.empty} />
      </View>
      <AppText bold className="relative z-[1] text-center text-lg text-gp-text dark:text-gp-text-dark">
        {title}
      </AppText>
      {message ? (
        <AppText className="relative z-[1] mt-2 text-center text-base leading-7 text-gp-muted dark:text-gp-muted-dark">
          {message}
        </AppText>
      ) : null}
    </View>
  );
}
