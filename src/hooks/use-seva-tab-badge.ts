import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { LOCAL_CACHE_POLICY, shouldRefreshCache } from '@/lib/cache/keys';
import { registerRefreshTask } from '@/lib/cache/refresh-coordinator';
import { hasUnreadFeed, latestFeedAt } from '@/lib/feed-cache';
import {
  fetchLatestFeedAt,
  getCachedFeed,
  refreshCachedFeed,
} from '@/services/feed';

export function sevaLastSeenKey(uid: string, groupId: string) {
  return `seva.lastSeenAt.${uid}.${groupId}`;
}

export async function markSevaFeedSeen(uid: string, groupId: string, at = Date.now()) {
  await AsyncStorage.setItem(sevaLastSeenKey(uid, groupId), String(at));
}

/** Dot badge on Seva tab when the group has posts newer than last visit. */
export function useSevaTabBadge(groupId: string | null) {
  const { profile } = useAuth();
  const uid = profile?.uid ?? null;
  const [hasUnread, setHasUnread] = useState(false);

  const refresh = useCallback(async () => {
    if (!uid || !groupId) {
      setHasUnread(false);
      return;
    }
    try {
      const [cached, lastSeenRaw] = await Promise.all([
        getCachedFeed(uid, groupId),
        AsyncStorage.getItem(sevaLastSeenKey(uid, groupId)),
      ]);
      let latestAt: number | null;
      if (cached) {
        latestAt = latestFeedAt(cached.value);
        setHasUnread(hasUnreadFeed(latestAt, lastSeenRaw ? Number(lastSeenRaw) : 0));
        if (shouldRefreshCache(cached.freshness)) {
          latestAt = latestFeedAt(await refreshCachedFeed(uid, groupId));
        }
      } else {
        latestAt = await fetchLatestFeedAt(groupId);
      }
      const lastSeenAt = lastSeenRaw ? Number(lastSeenRaw) : 0;
      setHasUnread(hasUnreadFeed(latestAt, lastSeenAt));
    } catch {
      // Keep previous badge state on transient errors.
    }
  }, [groupId, uid]);

  useEffect(() => {
    void Promise.resolve().then(refresh);
  }, [refresh]);

  useEffect(() => {
    if (!uid || !groupId) return;
    return registerRefreshTask(`seva-badge:${uid}:${groupId}`, refresh, {
      cooldownMs: LOCAL_CACHE_POLICY.refreshCooldownMs,
    });
  }, [groupId, refresh, uid]);

  const clearBadge = useCallback(async () => {
    if (!uid || !groupId) return;
    await markSevaFeedSeen(uid, groupId);
    setHasUnread(false);
  }, [groupId, uid]);

  return { hasUnread, refresh, clearBadge };
}
