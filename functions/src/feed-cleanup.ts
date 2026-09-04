/**
 * Nightly wipe of feed content so unbounded history does not inflate Firestore reads.
 * Deletes posts, polls, votes, and in-app notifications (not schedules / roster).
 */

import { FieldValue } from 'firebase-admin/firestore';

import { db } from './firebase-admin';

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
    deleteQueryInBatches('notifications'),
  ]);

  const groupsSnap = await db.collection('groups').get();
  const batchSize = 400;
  let batch = db.batch();
  let ops = 0;

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
    ops += 1;
    if (ops >= batchSize) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) {
    await batch.commit();
  }

  return { posts, polls, votes, notifications };
}
