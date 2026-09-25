import { describe, expect, it } from 'vitest';

import {
  GROUP_LIST_MAX_DOCS,
  GROUP_LIST_MAX_PAGES,
  GROUP_LIST_PAGE_SIZE,
  MEMBER_LIST_MAX_DOCS,
  MEMBER_LIST_MAX_PAGES,
  MEMBER_LIST_PAGE_SIZE,
  SENIOR_STATS_MAX_GROUPS,
  normalizeGroupName,
} from '@/lib/backend-query-policy';
import {
  NOTIFICATION_DELIVERY_RETENTION_DAYS,
  PRACTICE_COMPLETION_RETENTION_DAYS,
  RETENTION_DELETE_BATCH_SIZE,
  RETENTION_MAX_DELETES_PER_COLLECTION_PER_RUN,
  boundedDeletePageSize,
  isFeedOriginNotification,
  retentionCutoffs,
  selectExpiredRecords,
} from '../../functions/src/retention-policy';

describe('selective feed notification cleanup', () => {
  it('selects post and poll notifications by type or deterministic ID', () => {
    expect(isFeedOriginNotification({ id: 'random', type: 'seva' })).toBe(true);
    expect(isFeedOriginNotification({ id: 'random', type: 'poll' })).toBe(true);
    expect(isFeedOriginNotification({ id: 'post_abc' })).toBe(true);
    expect(isFeedOriginNotification({ id: 'poll_xyz' })).toBe(true);
  });

  it('retains personal practice and report history', () => {
    expect(
      isFeedOriginNotification({ id: 'personal-1', type: 'practice_reminder' })
    ).toBe(false);
    expect(
      isFeedOriginNotification({ id: 'personal-2', type: 'practice_report' })
    ).toBe(false);
  });
});

describe('backend retention policy', () => {
  it('uses documented conservative cutoffs', () => {
    const now = new Date('2026-09-24T12:00:00.000Z');
    const cutoffs = retentionCutoffs(now);

    expect(NOTIFICATION_DELIVERY_RETENTION_DAYS).toBe(90);
    expect(PRACTICE_COMPLETION_RETENTION_DAYS).toBe(400);
    expect(cutoffs.notificationDeliveriesBefore.toISOString()).toBe(
      '2026-06-26T12:00:00.000Z'
    );
    expect(cutoffs.practiceLogsBeforeDateKey).toBe('2025-08-20');
  });

  it('bounds each cleanup invocation across paginated batches', () => {
    expect(RETENTION_DELETE_BATCH_SIZE).toBeLessThan(500);
    expect(boundedDeletePageSize(0)).toBe(RETENTION_DELETE_BATCH_SIZE);
    expect(
      boundedDeletePageSize(RETENTION_MAX_DELETES_PER_COLLECTION_PER_RUN - 100)
    ).toBe(100);
    expect(
      boundedDeletePageSize(RETENTION_MAX_DELETES_PER_COLLECTION_PER_RUN)
    ).toBe(0);
  });

  it('selects only old records up to the requested cap', () => {
    const records = [
      { id: 'new', at: new Date('2026-09-01T00:00:00.000Z') },
      { id: 'oldest', at: new Date('2026-01-01T00:00:00.000Z') },
      { id: 'old', at: new Date('2026-02-01T00:00:00.000Z') },
    ];

    expect(
      selectExpiredRecords(
        records,
        new Date('2026-06-01T00:00:00.000Z'),
        1,
        (record) => record.at
      ).map((record) => record.id)
    ).toEqual(['oldest']);
  });
});

describe('senior collection query bounds', () => {
  it('keeps list pages and total reads explicitly bounded', () => {
    expect(GROUP_LIST_MAX_DOCS).toBe(GROUP_LIST_PAGE_SIZE * GROUP_LIST_MAX_PAGES);
    expect(MEMBER_LIST_MAX_DOCS).toBe(
      MEMBER_LIST_PAGE_SIZE * MEMBER_LIST_MAX_PAGES
    );
    expect(SENIOR_STATS_MAX_GROUPS).toBeLessThanOrEqual(GROUP_LIST_MAX_DOCS);
  });

  it('normalizes group names for indexed equality queries', () => {
    expect(normalizeGroupName('  North   Group  ')).toBe('north group');
    expect(normalizeGroupName('NORTH GROUP')).toBe('north group');
  });
});
