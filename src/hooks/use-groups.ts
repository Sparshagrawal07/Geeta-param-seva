import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { getLocalCache } from '@/lib/cache';
import {
  groupsCacheKey,
  LOCAL_CACHE_POLICY,
  shouldRefreshCache,
  userCacheScope,
} from '@/lib/cache/keys';
import { auth } from '@/lib/firebase';
import { isAdminRole, isSeniorAdmin, profileGroupIds } from '@/lib/users';
import { fetchGroups, fetchGroupsByIds } from '@/services/groups';
import type { Group } from '@/types/group';
import { useLocale } from '@/providers/locale-provider';

/** One-shot fetch + manual refresh — no per-screen realtime listeners. */
export function useGroups() {
  const { profile } = useAuth();
  const { t } = useLocale();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /**
   * Admins manage their assigned groups; members see the groups they belong to.
   * Anything else has no group scope, so the list stays empty.
   *
   * Serialized first so the array identity is stable across renders and can be
   * used as an effect dependency.
   */
  const scopeKey = JSON.stringify(
    isAdminRole(profile?.role)
      ? (profile?.assignedGroupIds ?? [])
      : profileGroupIds(profile ?? {})
  );
  const scopeGroupIds = useMemo(() => JSON.parse(scopeKey) as string[], [scopeKey]);

  const refresh = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!profile) {
        setGroups([]);
        setLoading(false);
        return;
      }
      const silent = options?.silent ?? false;
      try {
        if (!silent) setLoading(true);
        setError('');
        let nextGroups: Group[] = [];
        if (isSeniorAdmin(profile.role)) {
          nextGroups = await fetchGroups();
        } else if (scopeGroupIds.length > 0) {
          nextGroups = await fetchGroupsByIds(scopeGroupIds);
        }
        if (auth.currentUser?.uid !== profile.uid) return;
        setGroups(nextGroups);
        const cache = await getLocalCache();
        await cache.set(groupsCacheKey(profile.role, scopeGroupIds), nextGroups, {
          scope: userCacheScope(profile.uid),
          staleForMs: LOCAL_CACHE_POLICY.groupsStaleMs,
          expiresInMs: LOCAL_CACHE_POLICY.groupsExpiresMs,
        });
      } catch {
        setError(t('errorGroupsLoad'));
      } finally {
        setLoading(false);
      }
    },
    [profile, scopeGroupIds, t]
  );

  useEffect(() => {
    if (!profile) {
      void Promise.resolve().then(() => {
        setGroups([]);
        setLoading(false);
      });
      return;
    }
    let active = true;
    void Promise.resolve()
      .then(() => {
        if (!active) return null;
        setGroups([]);
        setLoading(true);
        return getLocalCache();
      })
      .then((cache) =>
        cache
          ? cache.get<Group[]>(groupsCacheKey(profile.role, scopeGroupIds), {
              scope: userCacheScope(profile.uid),
            })
          : null
      )
      .then((cached) => {
        if (!active) return;
        if (cached) {
          setGroups(cached.value);
          setLoading(false);
        }
        if (shouldRefreshCache(cached?.freshness ?? null)) {
          void refresh({ silent: Boolean(cached) });
        }
      })
      .catch(() => {
        if (active) void refresh({ silent: false });
      });
    return () => {
      active = false;
    };
  }, [profile, refresh, scopeGroupIds]);

  return { groups, loading, error, refresh, setGroups };
}
