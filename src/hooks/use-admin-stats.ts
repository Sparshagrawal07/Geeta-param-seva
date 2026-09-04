import { useCallback, useEffect, useState } from 'react';

import { fetchAdminStats, type AdminStats } from '@/services/stats';
import { useLocale } from '@/providers/locale-provider';

/** Load once per group scope — no 60s polling. */
export function useAdminStats(groupId?: string | null) {
  const { t } = useLocale();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      try {
        if (!silent) setLoading(true);
        setError('');
        setStats(await fetchAdminStats(groupId));
      } catch {
        setError(t('errorStatsLoad'));
      } finally {
        setLoading(false);
      }
    },
    [groupId, t]
  );

  useEffect(() => {
    void refresh({ silent: false });
  }, [refresh]);

  return { stats, loading, error, refresh };
}
