/**
 * Backend retention policy. These helpers are deliberately Firestore-free so
 * cutoff and candidate selection can be unit tested without an emulator.
 */

export const RETENTION_DELETE_BATCH_SIZE = 400;
export const RETENTION_MAX_DELETES_PER_COLLECTION_PER_RUN = 1_200;

/** Delivery audits are operational diagnostics, not user-visible history. */
export const NOTIFICATION_DELIVERY_RETENTION_DAYS = 90;

/**
 * Keep more than a full year of completion logs. Monthly reports only read the
 * current month, so 400 days is conservative while still bounding storage.
 */
export const PRACTICE_COMPLETION_RETENTION_DAYS = 400;

export const FEED_NOTIFICATION_TYPES = [
  'seva',
  'announcement',
  'poll',
  'poll_published',
] as const;

export const FEED_NOTIFICATION_ID_PREFIXES = ['post_', 'poll_'] as const;

const DAY_MS = 24 * 60 * 60 * 1_000;

export function dateDaysBefore(now: Date, days: number): Date {
  if (!Number.isInteger(days) || days < 0) {
    throw new Error('days must be a non-negative integer');
  }
  return new Date(now.getTime() - days * DAY_MS);
}

export function utcDateKey(value: Date): string {
  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, '0'),
    String(value.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

export function retentionCutoffs(now: Date = new Date()) {
  return {
    notificationDeliveriesBefore: dateDaysBefore(
      now,
      NOTIFICATION_DELIVERY_RETENTION_DAYS
    ),
    practiceLogsBeforeDateKey: utcDateKey(
      dateDaysBefore(now, PRACTICE_COMPLETION_RETENTION_DAYS)
    ),
  };
}

export function isFeedOriginNotification(input: {
  id: string;
  type?: unknown;
  postId?: unknown;
  pollId?: unknown;
}): boolean {
  const type = typeof input.type === 'string' ? input.type.trim().toLowerCase() : '';
  if ((FEED_NOTIFICATION_TYPES as readonly string[]).includes(type)) {
    return true;
  }
  if (typeof input.postId === 'string' && input.postId.trim()) {
    return true;
  }
  if (typeof input.pollId === 'string' && input.pollId.trim()) {
    return true;
  }
  return FEED_NOTIFICATION_ID_PREFIXES.some((prefix) => input.id.startsWith(prefix));
}

export function boundedDeletePageSize(
  deletedSoFar: number,
  maximum = RETENTION_MAX_DELETES_PER_COLLECTION_PER_RUN,
  batchSize = RETENTION_DELETE_BATCH_SIZE
): number {
  return Math.max(0, Math.min(batchSize, maximum - deletedSoFar));
}

export function selectExpiredRecords<T>(
  records: readonly T[],
  cutoff: Date,
  maximum: number,
  timestamp: (record: T) => Date | null
): T[] {
  return records
    .filter((record) => {
      const value = timestamp(record);
      return value != null && value.getTime() < cutoff.getTime();
    })
    .sort((left, right) => {
      const leftTime = timestamp(left)?.getTime() ?? Number.POSITIVE_INFINITY;
      const rightTime = timestamp(right)?.getTime() ?? Number.POSITIVE_INFINITY;
      return leftTime - rightTime;
    })
    .slice(0, Math.max(0, maximum));
}
