import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { LOCAL_CACHE_POLICY, shouldRefreshCache } from '@/lib/cache/keys';
import { registerRefreshTask } from '@/lib/cache/refresh-coordinator';
import { practiceDateKey, type MyPracticeToday } from '@/lib/practice';
import { applyOptimisticPracticeCompletion } from '@/lib/practice-local';
import { useLocale } from '@/providers/locale-provider';
import {
  getCachedMyPracticeToday,
  getPendingPracticeItemKeys,
  queuePracticeCompletion,
  refreshMyPracticeToday,
  replayPracticeOutbox,
} from '@/services/practice';

function emptyToday(groupId: string): MyPracticeToday {
  return { practiceDateKey: practiceDateKey(), groupId, assignment: null, items: [] };
}

export function useTodaysPractice(groupId: string | null, enabled = true) {
  const { profile, loading: authLoading } = useAuth();
  const { t } = useLocale();
  const uid = profile?.uid ?? null;
  const [today, setToday] = useState<MyPracticeToday>(() => emptyToday(groupId ?? ''));
  const [pendingItemKeys, setPendingItemKeys] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestIdRef = useRef(0);
  const taskId = useId();

  const updatePending = useCallback(
    async (nextToday: MyPracticeToday) => {
      if (!uid) {
        setPendingItemKeys(new Set());
        return;
      }
      setPendingItemKeys(await getPendingPracticeItemKeys(uid, nextToday));
    },
    [uid]
  );

  const refresh = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!uid || !groupId || !enabled || authLoading) {
        setLoading(false);
        return;
      }
      const requestId = ++requestIdRef.current;
      try {
        if (!options?.silent) setLoading(true);
        setError('');
        await replayPracticeOutbox(uid);
        const nextToday = await refreshMyPracticeToday(uid, groupId);
        if (requestId !== requestIdRef.current) return;
        setToday(nextToday);
        await updatePending(nextToday);
      } catch {
        if (requestId === requestIdRef.current) setError(t('errorUnexpected'));
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [authLoading, enabled, groupId, t, uid, updatePending]
  );

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    if (!uid || !groupId || !enabled || authLoading) {
      if (!authLoading) {
        void Promise.resolve().then(() => {
          if (requestId === requestIdRef.current) setLoading(false);
        });
      }
      return;
    }

    void Promise.resolve()
      .then(() => {
        if (requestId !== requestIdRef.current) return null;
        setToday(emptyToday(groupId));
        setPendingItemKeys(new Set());
        setLoading(true);
        setError('');
        return getCachedMyPracticeToday(uid, groupId);
      })
      .then(async (cached) => {
        if (requestId !== requestIdRef.current) return;
        if (cached) {
          setToday(cached.value);
          setLoading(false);
          await updatePending(cached.value);
        }
        if (shouldRefreshCache(cached?.freshness ?? null)) {
          await replayPracticeOutbox(uid);
          const nextToday = await refreshMyPracticeToday(uid, groupId);
          if (requestId !== requestIdRef.current) return;
          setToday(nextToday);
          await updatePending(nextToday);
        }
      })
      .catch(() => {
        if (requestId === requestIdRef.current) setError(t('errorUnexpected'));
      })
      .finally(() => {
        if (requestId === requestIdRef.current) setLoading(false);
      });
  }, [authLoading, enabled, groupId, t, uid, updatePending]);

  useEffect(() => {
    if (!uid || !groupId || !enabled) return;
    return registerRefreshTask(
      `today-practice:${taskId}:${uid}:${groupId}`,
      () => refresh({ silent: true }),
      { cooldownMs: LOCAL_CACHE_POLICY.refreshCooldownMs }
    );
  }, [enabled, groupId, refresh, taskId, uid]);

  const markComplete = useCallback(
    async (itemKey?: string) => {
      if (!uid || !groupId) return;
      const mutation = {
        uid,
        groupId,
        dateKey: today.practiceDateKey,
        ...(itemKey ? { itemKey } : {}),
      };
      const previous = today;
      const optimistic = applyOptimisticPracticeCompletion(today, mutation);
      setToday(optimistic);
      setPendingItemKeys((current) => {
        const next = new Set(current);
        if (itemKey) next.add(itemKey);
        else for (const item of optimistic.items) next.add(item.itemKey);
        return next;
      });
      try {
        const stored = await queuePracticeCompletion({
          uid,
          today,
          ...(itemKey ? { itemKey } : {}),
        });
        setToday(stored);
        void replayPracticeOutbox(uid)
          .then(() => updatePending(stored))
          .catch(() => undefined);
      } catch (caught) {
        setToday(previous);
        await updatePending(previous);
        throw caught;
      }
    },
    [groupId, today, uid, updatePending]
  );

  return {
    today,
    items: today.items,
    pendingItemKeys,
    loading,
    error,
    refresh,
    markItemComplete: (itemKey: string) => markComplete(itemKey),
    markAllComplete: () => markComplete(),
  };
}
