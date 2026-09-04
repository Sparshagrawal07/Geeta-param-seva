import { View } from 'react-native';

import { SpiritualSurface, SpiritualSurfaceBody } from '@/components/spiritual/spiritual-surface';
import { AppText } from '@/components/ui/app-text';

interface StatCardProps {
  label: string;
  value: string | number;
}

export function StatCard({ label, value }: StatCardProps) {
  return (
    <SpiritualSurface variant="elevated" className="flex-1" style={{ minHeight: 104 }}>
      <SpiritualSurfaceBody className="justify-center py-4">
        <AppText
          className="text-sm leading-5 text-gp-muted dark:text-gp-muted-dark"
          numberOfLines={2}
          style={{ flexShrink: 1 }}>
          {label}
        </AppText>
        <AppText bold className="mt-2 text-2xl leading-8 text-saffron dark:text-saffron-light">
          {value}
        </AppText>
      </SpiritualSurfaceBody>
    </SpiritualSurface>
  );
}
