import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { LOCAL_CACHE_POLICY, shouldRefreshCache } from '@/lib/cache/keys';
import { registerRefreshTask } from '@/lib/cache/refresh-coordinator';
import { type PracticeAdminOverview } from '@/lib/practice';
import {
  getCachedPracticeAdminOverview,
  refreshCachedPracticeAdminOverview,
} from '@/services/practice';

export function usePracticeAdminOverview(groupId?: string | null) {
  const { profile } = useAuth();
  const uid = profile?.uid ?? null;
  const [overview, setOverview] = useState<PracticeAdminOverview | null>(null);
  const [loading, setLoading] = useState(Boolean(groupId));
  const [error, setError] = useState(false);
  const requestIdRef = useRef(0);
  const taskId = useId();

  const refresh = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!uid || !groupId) {
        setOverview(null);
        setLoading(false);
        return;
      }
      const requestId = ++requestIdRef.current;
      try {
        if (!options?.silent) setLoading(true);
        setError(false);
        const next = await refreshCachedPracticeAdminOverview(uid, groupId);
        if (requestId === requestIdRef.current) setOverview(next);
      } catch {
        if (requestId === requestIdRef.current) setError(true);
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [groupId, uid]
  );

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    if (!uid || !groupId) {
      void Promise.resolve().then(() => {
        if (requestId !== requestIdRef.current) return;
        setOverview(null);
        setLoading(false);
      });
      return;
    }
    void Promise.resolve()
      .then(() => {
        if (requestId !== requestIdRef.current) return null;
        setOverview(null);
        setLoading(true);
        setError(false);
        return getCachedPracticeAdminOverview(uid, groupId);
      })
      .then((cached) => {
        if (requestId !== requestIdRef.current) return;
        if (cached) {
          setOverview(cached.value);
          setLoading(false);
        }
        if (shouldRefreshCache(cached?.freshness ?? null)) {
          void refresh({ silent: Boolean(cached) });
        }
      })
      .catch(() => {
        if (requestId === requestIdRef.current) void refresh();
      });
  }, [groupId, refresh, uid]);

  useEffect(() => {
    if (!uid || !groupId) return;
    return registerRefreshTask(
      `admin-practice:${taskId}:${uid}:${groupId}`,
      () => refresh({ silent: true }),
      { cooldownMs: LOCAL_CACHE_POLICY.refreshCooldownMs }
    );
  }, [groupId, refresh, taskId, uid]);

  return { overview, loading, error, refresh };
}
