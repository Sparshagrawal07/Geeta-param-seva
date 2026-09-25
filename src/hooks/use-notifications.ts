import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { getLocalCache } from '@/lib/cache';
import {
  LOCAL_CACHE_POLICY,
  notificationsCacheKey,
  shouldRefreshCache,
  userCacheScope,
} from '@/lib/cache/keys';
import { registerRefreshTask } from '@/lib/cache/refresh-coordinator';
import { auth } from '@/lib/firebase';
import { fetchNotifications } from '@/services/notifications';
import type { AppNotification } from '@/types/feed';
import { useLocale } from '@/providers/locale-provider';

/** Cache-first notifications with coordinated foreground/network refresh. */
export function useNotifications(groupId?: string | null) {
  const { profile } = useAuth();
  const { t } = useLocale();
  const uid = profile?.uid ?? null;
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestIdRef = useRef(0);

  const refresh = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!uid) {
        setItems([]);
        setLoading(false);
        return;
      }
      const silent = options?.silent ?? false;
      const requestId = ++requestIdRef.current;
      try {
        if (!silent) setLoading(true);
        setError('');
        const nextItems = await fetchNotifications(groupId);
        if (auth.currentUser?.uid !== uid) return;
        const cache = await getLocalCache();
        await cache.set(notificationsCacheKey(groupId), nextItems, {
          scope: userCacheScope(uid),
          staleForMs: LOCAL_CACHE_POLICY.notificationsStaleMs,
          expiresInMs: LOCAL_CACHE_POLICY.notificationsExpiresMs,
        });
        if (requestId === requestIdRef.current) setItems(nextItems);
      } catch (error) {
        console.warn('[notifications] load failed', error);
        if (requestId === requestIdRef.current) setError(t('errorNotificationsLoad'));
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [groupId, t, uid]
  );

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    if (!uid) {
      void Promise.resolve().then(() => {
        if (requestId !== requestIdRef.current) return;
        setItems([]);
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
        return getLocalCache();
      })
      .then((cache) =>
        cache
          ? cache.get<AppNotification[]>(notificationsCacheKey(groupId), {
              scope: userCacheScope(uid),
            })
          : null
      )
      .then((cached) => {
        if (requestId !== requestIdRef.current) return;
        if (cached) {
          setItems(cached.value);
          setLoading(false);
        }
        if (shouldRefreshCache(cached?.freshness ?? null)) {
          void refresh({ silent: Boolean(cached) });
        }
      })
      .catch(() => {
        if (requestId === requestIdRef.current) setError(t('errorNotificationsLoad'));
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });
  }, [groupId, refresh, t, uid]);

  useEffect(() => {
    if (!uid) return;
    return registerRefreshTask(`notifications:${uid}:${groupId ?? 'personal'}`, () =>
      refresh({ silent: true }), {
      cooldownMs: LOCAL_CACHE_POLICY.refreshCooldownMs,
    });
  }, [groupId, refresh, uid]);

  return { items, loading, error, refresh };
}
