import { describe, expect, it } from 'vitest';

import { LocalFirstCache } from '@/lib/cache/cache';
import { InMemoryCacheDriver } from '@/lib/cache/driver';
import {
  adminPracticeCacheKey,
  groupCacheScope,
  groupsCacheKey,
  practiceMutationId,
  shouldRefreshCache,
  todayPracticeCacheKey,
  userCacheScope,
} from '@/lib/cache/keys';
import { hasUnreadFeed, latestFeedAt } from '@/lib/feed-cache';
import type { MyPracticeToday } from '@/lib/practice';
import {
  applyPendingPracticeMutations,
  PRACTICE_MARK_ALL_OPERATION,
  PRACTICE_MARK_ONE_OPERATION,
  practiceRetryDelay,
  applyOptimisticPracticeCompletion,
  type PracticeCompletionMutation,
} from '@/lib/practice-local';
import type { FeedItem } from '@/types/feed';

describe('local-first cache identity and freshness', () => {
  it('isolates account and group scopes and canonicalizes group keys', () => {
    expect(userCacheScope('user-a')).not.toBe(userCacheScope('user-b'));
    expect(groupCacheScope('user-a', 'group-1')).not.toBe(
      groupCacheScope('user-a', 'group-2')
    );
    expect(groupsCacheKey('admin', ['b', 'a', 'a'])).toBe(
      groupsCacheKey('admin', ['a', 'b'])
    );
    expect(todayPracticeCacheKey('2026-09-24', 'group-1')).toContain('2026-09-24');
  });

  it('keeps each group on its own practice cache entry', () => {
    expect(todayPracticeCacheKey('2026-09-24', 'group-1')).not.toBe(
      todayPracticeCacheKey('2026-09-24', 'group-2')
    );
    expect(todayPracticeCacheKey('2026-09-24', 'group-1')).not.toBe(
      todayPracticeCacheKey('2026-09-23', 'group-1')
    );
  });

  it('refreshes missing, stale, or explicitly forced cache values', () => {
    expect(shouldRefreshCache(null)).toBe(true);
    expect(shouldRefreshCache('stale')).toBe(true);
    expect(shouldRefreshCache('fresh')).toBe(false);
    expect(shouldRefreshCache('fresh', true)).toBe(true);
  });
});

describe('admin practice overview cache', () => {
  it('drops the whole overview on removal so a roster change cannot survive it', async () => {
    const cache = new LocalFirstCache(new InMemoryCacheDriver());
    const scope = groupCacheScope('admin-1', 'group-1');
    const key = adminPracticeCacheKey('group-1', '2026-09-24');
    // Still considered fresh, so only an explicit removal can dislodge it.
    await cache.set(
      key,
      { members: [{ uid: 'a' }, { uid: 'b' }] },
      { scope, staleForMs: 120_000, expiresInMs: 86_400_000 }
    );
    expect((await cache.get(key, { scope }))?.freshness).toBe('fresh');

    await cache.remove(key, scope);

    // A miss, not a stale hit: the next reader has to ask the server, which is
    // the only place that knows member `b` was deactivated.
    expect(await cache.get(key, { scope })).toBeNull();
  });

  it('keeps each group and practice day on its own entry', () => {
    expect(adminPracticeCacheKey('group-1', '2026-09-24')).not.toBe(
      adminPracticeCacheKey('group-2', '2026-09-24')
    );
    expect(adminPracticeCacheKey('group-1', '2026-09-24')).not.toBe(
      adminPracticeCacheKey('group-1', '2026-09-23')
    );
  });
});

describe('feed badge derivation', () => {
  it('derives the latest valid post date and unread state', () => {
    const items = [
      { id: 'old', createdAt: new Date('2026-09-24T08:00:00Z') },
      { id: 'new', createdAt: new Date('2026-09-24T10:00:00Z') },
    ] as FeedItem[];
    const latest = latestFeedAt(items);
    expect(latest).toBe(new Date('2026-09-24T10:00:00Z').getTime());
    expect(hasUnreadFeed(latest, new Date('2026-09-24T09:00:00Z').getTime())).toBe(true);
    expect(hasUnreadFeed(latest, latest!)).toBe(false);
    expect(hasUnreadFeed(null, 0)).toBe(false);
  });
});

describe('practice optimistic outbox behavior', () => {
  const today: MyPracticeToday = {
    practiceDateKey: '2026-09-24',
    groupId: 'group-1',
    assignment: {
      uid: 'user-a',
      groupId: 'group-1',
      items: [
        { type: 'adhyay', chapterNumber: 1, itemKey: 'adhyay_01' },
        { type: 'aarti', itemKey: 'aarti' },
      ],
    },
    items: [
      { type: 'adhyay', chapterNumber: 1, itemKey: 'adhyay_01', completed: false },
      { type: 'aarti', itemKey: 'aarti', completed: false },
    ],
  };

  function mutation(
    operation: string,
    payload: PracticeCompletionMutation
  ) {
    return {
      id: practiceMutationId(payload),
      scope: userCacheScope(payload.uid),
      operation,
      payload,
      status: 'pending' as const,
      attempts: 0,
      createdAt: 1,
      updatedAt: 1,
      nextAttemptAt: 1,
      lastError: null,
    };
  }

  it('uses stable operation ids and overlays pending completion', () => {
    const one = {
      uid: 'user-a',
      groupId: 'group-1',
      dateKey: '2026-09-24',
      itemKey: 'adhyay_01',
    };
    expect(practiceMutationId(one)).toBe(practiceMutationId(one));

    const oneComplete = applyPendingPracticeMutations(today, [
      mutation(PRACTICE_MARK_ONE_OPERATION, one),
    ]);
    expect(oneComplete.items.map((item) => item.completed)).toEqual([true, false]);

    const allComplete = applyPendingPracticeMutations(today, [
      mutation(PRACTICE_MARK_ALL_OPERATION, {
        uid: 'user-a',
        groupId: 'group-1',
        dateKey: '2026-09-24',
      }),
    ]);
    expect(allComplete.items.every((item) => item.completed)).toBe(true);
  });

  it('never lets one group’s completion settle into another group’s view', () => {
    const otherGroupToday: MyPracticeToday = {
      ...today,
      groupId: 'group-2',
      assignment: { ...today.assignment!, groupId: 'group-2' },
    };

    // Optimistic update is scoped: the same item key in another group is untouched.
    const otherFromOptimistic = applyOptimisticPracticeCompletion(otherGroupToday, {
      uid: 'user-a',
      groupId: 'group-1',
      dateKey: '2026-09-24',
      itemKey: 'adhyay_01',
    });
    expect(otherFromOptimistic).toBe(otherGroupToday);

    // Queued completions are scoped too — group-1's queue must not mark group-2.
    const replayed = applyPendingPracticeMutations(otherGroupToday, [
      mutation(PRACTICE_MARK_ONE_OPERATION, {
        uid: 'user-a',
        groupId: 'group-1',
        dateKey: '2026-09-24',
        itemKey: 'adhyay_01',
      }),
    ]);
    expect(replayed.items.map((item) => item.completed)).toEqual([false, false]);
    expect(replayed.groupId).toBe('group-2');
  });

  it('gives the same item in two groups two distinct outbox rows', () => {
    const base = { uid: 'user-a', dateKey: '2026-09-24', itemKey: 'adhyay_01' };
    // Without the group in the id these collapse into one row and one completion
    // is silently lost when the user practises in both groups the same day.
    expect(practiceMutationId({ ...base, groupId: 'group-1' })).not.toBe(
      practiceMutationId({ ...base, groupId: 'group-2' })
    );
  });

  it('bounds exponential replay delay', () => {
    expect(practiceRetryDelay(1)).toBe(2_000);
    expect(practiceRetryDelay(2)).toBe(4_000);
    expect(practiceRetryDelay(100)).toBe(5 * 60 * 1000);
  });
});
