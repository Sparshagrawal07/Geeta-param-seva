import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/hooks/use-auth';
import { fetchLatestFeedAt } from '@/services/feed';

export function sevaLastSeenKey(groupId: string) {
  return `seva.lastSeenAt.${groupId}`;
}

export async function markSevaFeedSeen(groupId: string, at = Date.now()) {
  await AsyncStorage.setItem(sevaLastSeenKey(groupId), String(at));
}

/** Dot badge on Seva tab when the group has posts newer than last visit. */
export function useSevaTabBadge() {
  const { profile } = useAuth();
  const groupId = profile?.groupId ?? null;
  const [hasUnread, setHasUnread] = useState(false);

  const refresh = useCallback(async () => {
    if (!groupId) {
      setHasUnread(false);
      return;
    }
    try {
      const [latestAt, lastSeenRaw] = await Promise.all([
        fetchLatestFeedAt(groupId),
        AsyncStorage.getItem(sevaLastSeenKey(groupId)),
      ]);
      if (latestAt == null) {
        setHasUnread(false);
        return;
      }
      const lastSeenAt = lastSeenRaw ? Number(lastSeenRaw) : 0;
      setHasUnread(Number.isFinite(lastSeenAt) ? latestAt > lastSeenAt : true);
    } catch {
      // Keep previous badge state on transient errors.
    }
  }, [groupId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refresh();
      }
    });
    return () => sub.remove();
  }, [refresh]);

  const clearBadge = useCallback(async () => {
    if (!groupId) return;
    await markSevaFeedSeen(groupId);
    setHasUnread(false);
  }, [groupId]);

  return { hasUnread, refresh, clearBadge };
}
