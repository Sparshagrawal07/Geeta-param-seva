import { View } from 'react-native';

import { StatsGrid } from '@/components/admin/stats-grid';
import { SpiritualSurface, SpiritualSurfaceBody } from '@/components/spiritual/spiritual-surface';

function StatCardSkeleton() {
  return (
    <SpiritualSurface variant="elevated" className="flex-1" style={{ minHeight: 104, opacity: 0.55 }}>
      <SpiritualSurfaceBody className="justify-center py-4">
        <View className="h-4 rounded-md bg-gp-border dark:bg-gp-border-dark" style={{ width: '70%' }} />
        <View
          className="mt-3 h-8 rounded-md bg-gp-border dark:bg-gp-border-dark"
          style={{ width: '40%' }}
        />
      </SpiritualSurfaceBody>
    </SpiritualSurface>
  );
}

export function StatsGridSkeleton() {
  return (
    <StatsGrid>
      <StatCardSkeleton />
      <StatCardSkeleton />
    </StatsGrid>
  );
}
