import { useCallback, useEffect, useRef, useState } from 'react';

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
  const { t } = useLocale();
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

        if (requestId !== requestIdRef.current) return;

        cursorRef.current = page.cursor;
        setHasMore(page.hasMore);
        setEntries((prev) => {
          if (mode === 'replace') return page.entries;
          const byId = new Map(prev.map((entry) => [entry.id, entry]));
          for (const entry of page.entries) byId.set(entry.id, entry);
          return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
        });
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
    [input.groupId, input.role, input.search, input.status, t]
  );

  useEffect(() => {
    void load('replace');
  }, [load]);

  const refresh = useCallback(async () => {
    await load('replace');
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || loading) return;
    await load('append');
  }, [hasMore, load, loading, loadingMore]);

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
