/**
 * Nightly feed wipe and bounded backend retention cleanup.
 * Personal practice/report notifications are intentionally retained.
 */

import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore';

import { db } from './firebase-admin';
import {
  boundedDeletePageSize,
  FEED_NOTIFICATION_ID_PREFIXES,
  FEED_NOTIFICATION_TYPES,
  retentionCutoffs,
} from './retention-policy';

const DELETE_BATCH_SIZE = 400;

async function deleteQueryInBatches(
  collectionName: string,
  field?: string,
  value?: string
): Promise<number> {
  let deleted = 0;
  for (;;) {
    let query = db.collection(collectionName).limit(DELETE_BATCH_SIZE);
    if (field && value) {
      query = db.collection(collectionName).where(field, '==', value).limit(DELETE_BATCH_SIZE);
    }
    const snap = await query.get();
    if (snap.empty) break;

    const batch = db.batch();
    for (const entry of snap.docs) {
      batch.delete(entry.ref);
    }
    await batch.commit();
    deleted += snap.size;
    if (snap.size < DELETE_BATCH_SIZE) break;
  }
  return deleted;
}

async function deleteFeedNotifications(): Promise<number> {
  let deleted = 0;

  // Current rows are selected by type; deterministic IDs catch legacy rows
  // that predate the type field. Neither query can select personal alerts.
  for (;;) {
    const snap = await db
      .collection('notifications')
      .where('type', 'in', [...FEED_NOTIFICATION_TYPES])
      .limit(DELETE_BATCH_SIZE)
      .get();
    if (snap.empty) break;

    const batch = db.batch();
    for (const entry of snap.docs) batch.delete(entry.ref);
    await batch.commit();
    deleted += snap.size;
    if (snap.size < DELETE_BATCH_SIZE) break;
  }

  for (const prefix of FEED_NOTIFICATION_ID_PREFIXES) {
    for (;;) {
      const snap = await db
        .collection('notifications')
        .orderBy(FieldPath.documentId())
        .startAt(prefix)
        .endBefore(`${prefix}\uf8ff`)
        .limit(DELETE_BATCH_SIZE)
        .get();
      if (snap.empty) break;

      const batch = db.batch();
      for (const entry of snap.docs) batch.delete(entry.ref);
      await batch.commit();
      deleted += snap.size;
      if (snap.size < DELETE_BATCH_SIZE) break;
    }
  }

  return deleted;
}

async function deleteExpiredTimestampedRecords(input: {
  collectionName: string;
  field: string;
  cutoff: Date | string;
}): Promise<number> {
  let deleted = 0;

  for (;;) {
    const pageSize = boundedDeletePageSize(deleted);
    if (pageSize === 0) break;

    const cutoff =
      input.cutoff instanceof Date ? Timestamp.fromDate(input.cutoff) : input.cutoff;
    const snap = await db
      .collection(input.collectionName)
      .where(input.field, '<', cutoff)
      .orderBy(input.field, 'asc')
      .limit(pageSize)
      .get();
    if (snap.empty) break;

    const batch = db.batch();
    for (const entry of snap.docs) batch.delete(entry.ref);
    await batch.commit();
    deleted += snap.size;
    if (snap.size < pageSize) break;
  }

  return deleted;
}

async function resetGroupFeedCounters(): Promise<number> {
  let updated = 0;
  let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;

  for (;;) {
    let query = db
      .collection('groups')
      .orderBy(FieldPath.documentId())
      .limit(DELETE_BATCH_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const groupsSnap = await query.get();
    if (groupsSnap.empty) break;

    const batch = db.batch();
    for (const group of groupsSnap.docs) {
      batch.set(
        group.ref,
        {
          postCount: 0,
          pollCount: 0,
          todaysPollResponseCount: 0,
          statsUpdatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
    await batch.commit();
    updated += groupsSnap.size;
    cursor = groupsSnap.docs[groupsSnap.docs.length - 1];
    if (groupsSnap.size < DELETE_BATCH_SIZE) break;
  }

  return updated;
}

/** Wipe all feed-related docs and reset per-group counters. */
export async function wipeDailyFeedContent(): Promise<{
  posts: number;
  polls: number;
  votes: number;
  notifications: number;
}> {
  const [posts, polls, votes, notifications] = await Promise.all([
    deleteQueryInBatches('posts'),
    deleteQueryInBatches('polls'),
    deleteQueryInBatches('votes'),
    deleteFeedNotifications(),
  ]);

  await resetGroupFeedCounters();

  return { posts, polls, votes, notifications };
}

/**
 * Delete old operational records with a hard per-collection budget. Repeated
 * nightly runs drain any backlog without one unbounded invocation.
 */
export async function cleanupExpiredBackendRecords(now: Date = new Date()): Promise<{
  notificationDeliveries: number;
  practiceCompletionLogs: number;
}> {
  const cutoffs = retentionCutoffs(now);
  const [notificationDeliveries, practiceCompletionLogs] = await Promise.all([
    deleteExpiredTimestampedRecords({
      collectionName: 'notification_deliveries',
      field: 'createdAt',
      cutoff: cutoffs.notificationDeliveriesBefore,
    }),
    deleteExpiredTimestampedRecords({
      collectionName: 'practice_completion_logs',
      field: 'practiceDateKey',
      cutoff: cutoffs.practiceLogsBeforeDateKey,
    }),
  ]);

  return { notificationDeliveries, practiceCompletionLogs };
}
