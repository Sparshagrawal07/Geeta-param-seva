import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { getLocalCache } from '@/lib/cache';
import {
  LOCAL_CACHE_POLICY,
  rosterFirstPageCacheKey,
  shouldRefreshCache,
  userCacheScope,
} from '@/lib/cache/keys';
import { auth } from '@/lib/firebase';
import {
  fetchAccessRosterPage,
  type RosterPageCursor,
  ROSTER_PAGE_SIZE,
} from '@/services/roster';
import type { AccessRosterEntry, RosterRole, RosterStatus } from '@/types/roster';
import { useLocale } from '@/providers/locale-provider';

export function useRosterPage(input: {
  groupId?: string | null;
  role?: RosterRole | 'all';
  status?: RosterStatus | 'all';
  search?: string;
}) {
  const { profile } = useAuth();
  const { t } = useLocale();
  const uid = profile?.uid ?? null;
  const [entries, setEntries] = useState<AccessRosterEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const cursorRef = useRef<RosterPageCursor>(null);
  const requestIdRef = useRef(0);

  const load = useCallback(
    async (mode: 'replace' | 'append') => {
      const requestId = ++requestIdRef.current;
      try {
        if (mode === 'replace') {
          setLoading(true);
          cursorRef.current = null;
        } else {
          setLoadingMore(true);
        }
        setError('');

        const page = await fetchAccessRosterPage({
          groupId: input.groupId,
          role: input.role,
          status: input.status,
          search: input.search,
          cursor: mode === 'append' ? cursorRef.current : null,
          pageSize: ROSTER_PAGE_SIZE,
        });

        if (uid && auth.currentUser?.uid !== uid) return;
        if (requestId !== requestIdRef.current) return;

        cursorRef.current = page.cursor;
        setHasMore(page.hasMore);
        setEntries((prev) => {
          if (mode === 'replace') return page.entries;
          const byId = new Map(prev.map((entry) => [entry.id, entry]));
          for (const entry of page.entries) byId.set(entry.id, entry);
          return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
        });
        if (mode === 'replace' && uid) {
          const cache = await getLocalCache();
          await cache.set(
            rosterFirstPageCacheKey({
              groupId: input.groupId,
              role: input.role,
              status: input.status,
              search: input.search,
              pageSize: ROSTER_PAGE_SIZE,
            }),
            { entries: page.entries, hasMore: page.hasMore },
            {
              scope: userCacheScope(uid),
              staleForMs: LOCAL_CACHE_POLICY.rosterStaleMs,
              expiresInMs: LOCAL_CACHE_POLICY.rosterExpiresMs,
            }
          );
        }
      } catch (error) {
        console.warn('[roster] load failed', error);
        if (requestId === requestIdRef.current) {
          setError(t('errorMembersLoad'));
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [input.groupId, input.role, input.search, input.status, t, uid]
  );

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    if (!uid) {
      void Promise.resolve().then(() => {
        if (requestId !== requestIdRef.current) return;
        setEntries([]);
        setLoading(false);
      });
      return;
    }
    void Promise.resolve()
      .then(() => {
        if (requestId !== requestIdRef.current) return null;
        setEntries([]);
        setHasMore(false);
        setLoading(true);
        setError('');
        return getLocalCache();
      })
      .then((cache) =>
        cache
          ? cache.get<{ entries: AccessRosterEntry[]; hasMore: boolean }>(
              rosterFirstPageCacheKey({
                groupId: input.groupId,
                role: input.role,
                status: input.status,
                search: input.search,
                pageSize: ROSTER_PAGE_SIZE,
              }),
              { scope: userCacheScope(uid) }
            )
          : null
      )
      .then((cached) => {
        if (requestId !== requestIdRef.current) return;
        if (cached) {
          setEntries(cached.value.entries);
          setHasMore(cached.value.hasMore);
          setLoading(false);
        }
        if (shouldRefreshCache(cached?.freshness ?? null)) void load('replace');
      })
      .catch(() => {
        if (requestId === requestIdRef.current) void load('replace');
      });
  }, [input.groupId, input.role, input.search, input.status, load, uid]);

  const refresh = useCallback(async () => {
    await load('replace');
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || loading) return;
    if (!cursorRef.current && entries.length > 0) {
      await load('replace');
      if (!cursorRef.current) return;
    }
    await load('append');
  }, [entries.length, hasMore, load, loading, loadingMore]);

  return {
    entries,
    loading,
    loadingMore,
    error,
    hasMore,
    refresh,
    loadMore,
  };
}
