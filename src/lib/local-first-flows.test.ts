import { describe, expect, it } from 'vitest';

import {
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
    expect(todayPracticeCacheKey('2026-09-24')).toContain('2026-09-24');
  });

  it('refreshes missing, stale, or explicitly forced cache values', () => {
    expect(shouldRefreshCache(null)).toBe(true);
    expect(shouldRefreshCache('stale')).toBe(true);
    expect(shouldRefreshCache('fresh')).toBe(false);
    expect(shouldRefreshCache('fresh', true)).toBe(true);
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
    const one = { uid: 'user-a', dateKey: '2026-09-24', itemKey: 'adhyay_01' };
    expect(practiceMutationId(one)).toBe(practiceMutationId(one));

    const oneComplete = applyPendingPracticeMutations(today, [
      mutation(PRACTICE_MARK_ONE_OPERATION, one),
    ]);
    expect(oneComplete.items.map((item) => item.completed)).toEqual([true, false]);

    const allComplete = applyPendingPracticeMutations(today, [
      mutation(PRACTICE_MARK_ALL_OPERATION, {
        uid: 'user-a',
        dateKey: '2026-09-24',
      }),
    ]);
    expect(allComplete.items.every((item) => item.completed)).toBe(true);
  });

  it('bounds exponential replay delay', () => {
    expect(practiceRetryDelay(1)).toBe(2_000);
    expect(practiceRetryDelay(2)).toBe(4_000);
    expect(practiceRetryDelay(100)).toBe(5 * 60 * 1000);
  });
});
