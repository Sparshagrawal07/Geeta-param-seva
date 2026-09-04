import type { ReactNode } from 'react';
import { View } from 'react-native';

import { SpiritualAssetImage } from '@/components/spiritual/spiritual-asset-image';
import { AppText } from '@/components/ui/app-text';

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  showLotus?: boolean;
  action?: ReactNode;
}

export function SectionHeader({ title, subtitle, showLotus = true, action }: SectionHeaderProps) {
  return (
    <View className="mb-4">
      {showLotus ? (
        <View className="mb-2 w-full items-center">
          <SpiritualAssetImage slot="lotusDivider" />
        </View>
      ) : null}
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <AppText variant="display" bold className="text-xl text-gp-text dark:text-gp-text-dark">
            {title}
          </AppText>
          {subtitle ? (
            <AppText className="mt-1 text-base leading-7 text-gp-muted dark:text-gp-muted-dark">
              {subtitle}
            </AppText>
          ) : null}
        </View>
        {action}
      </View>
    </View>
  );
}
