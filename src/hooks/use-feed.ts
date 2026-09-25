import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { LOCAL_CACHE_POLICY, shouldRefreshCache } from '@/lib/cache/keys';
import { registerRefreshTask } from '@/lib/cache/refresh-coordinator';
import {
  getCachedFeed,
  refreshCachedFeed,
  updateCachedFeed,
} from '@/services/feed';
import type { FeedItem } from '@/types/feed';
import { useLocale } from '@/providers/locale-provider';

/** Cache-first group feed with stale-while-revalidate refreshes. */
export function useFeed(groupId?: string | null) {
  const { profile } = useAuth();
  const { t } = useLocale();
  const uid = profile?.uid ?? null;
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestIdRef = useRef(0);
  const taskId = useId();

  const refresh = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!uid || !groupId) {
        setItems([]);
        setError('');
        setLoading(false);
        return;
      }
      const requestId = ++requestIdRef.current;
      try {
        if (!silent) setLoading(true);
        setError('');
        const nextItems = await refreshCachedFeed(uid, groupId);
        if (requestId === requestIdRef.current) setItems(nextItems);
      } catch {
        if (requestId === requestIdRef.current) setError(t('errorFeedLoad'));
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [groupId, t, uid]
  );

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    if (!uid || !groupId) {
      void Promise.resolve().then(() => {
        if (requestId !== requestIdRef.current) return;
        setItems([]);
        setError('');
        setLoading(false);
      });
      return;
    }

    void Promise.resolve()
      .then(() => {
        if (requestId !== requestIdRef.current) return null;
        setItems([]);
        setLoading(true);
        setError('');
        return getCachedFeed(uid, groupId);
      })
      .then(async (cached) => {
        if (requestId !== requestIdRef.current) return;
        if (cached) {
          setItems(cached.value);
          setLoading(false);
        }
        if (shouldRefreshCache(cached?.freshness ?? null)) {
          const nextItems = await refreshCachedFeed(uid, groupId);
          if (requestId === requestIdRef.current) setItems(nextItems);
        }
      })
      .catch(() => {
        if (requestId === requestIdRef.current) setError(t('errorFeedLoad'));
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });
  }, [groupId, t, uid]);

  useEffect(() => {
    if (!uid || !groupId) return;
    return registerRefreshTask(
      `feed:${taskId}:${uid}:${groupId}`,
      () => refresh({ silent: true }),
      { cooldownMs: LOCAL_CACHE_POLICY.refreshCooldownMs }
    );
  }, [groupId, refresh, taskId, uid]);

  const removeItem = useCallback(
    (itemId: string) => {
      setItems((current) => current.filter((item) => item.id !== itemId));
      if (uid && groupId) {
        void updateCachedFeed(uid, groupId, (current) =>
          current.filter((item) => item.id !== itemId)
        );
      }
    },
    [groupId, uid]
  );

  return { items, loading, error, refresh, removeItem, setItems };
}
