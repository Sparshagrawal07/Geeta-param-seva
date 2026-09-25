/**
 * Group counter self-healing.
 *
 * `groups/{groupId}.memberCount` is kept roughly in step by the roster write
 * path, and `postCount` / `pollCount` are zeroed by the nightly feed wipe — but
 * posts and polls are created by the client straight into Firestore, so nothing
 * ever raises those counters again. The dashboard therefore showed a total that
 * never moved.
 *
 * This recomputes every counter from the source collections. It is idempotent
 * (a plain overwrite, never an increment), so at-least-once retries and
 * overlapping runs cannot inflate anything, and any drift from an earlier bug or
 * a manual console edit repairs itself within one cycle.
 */

import { FieldValue, type Query } from 'firebase-admin/firestore';

import { db } from './firebase-admin';

/** Upper bound on groups processed per run. */
export const COUNTER_SYNC_MAX_GROUPS = 200;
/** Rows read per group per collection. */
const COUNTER_SYNC_PAGE_LIMIT = 1000;

async function countQuery(query: Query): Promise<number> {
  try {
    return (await query.count().get()).data().count;
  } catch {
    // Aggregation can be unavailable on older projects — fall back to a page read.
    try {
      return (await query.limit(COUNTER_SYNC_PAGE_LIMIT).get()).size;
    } catch (error) {
      console.warn('counter_sync_count_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return -1;
    }
  }
}

type GroupCounters = {
  memberCount: number;
  postCount: number;
  pollCount: number;
};

async function countersForGroup(groupId: string): Promise<GroupCounters | null> {
  const [members, posts, polls] = await Promise.all([
    countQuery(
      db
        .collection('access_roster')
        .where('groupId', '==', groupId)
        .where('role', '==', 'user')
        .where('status', '==', 'active')
    ),
    countQuery(db.collection('posts').where('groupId', '==', groupId)),
    countQuery(db.collection('polls').where('groupId', '==', groupId)),
  ]);

  if (members < 0 || posts < 0 || polls < 0) return null;
  return { memberCount: members, postCount: posts, pollCount: polls };
}

/**
 * Overwrite every group counter with the truth.
 * Returns the groups that were actually changed.
 */
export async function recomputeGroupCounters(now: Date = new Date()): Promise<{
  scanned: number;
  updated: number;
  skipped: number;
}> {
  const groupsSnap = await db
    .collection('groups')
    .limit(COUNTER_SYNC_MAX_GROUPS)
    .get();

  let updated = 0;
  let skipped = 0;

  for (const groupDoc of groupsSnap.docs) {
    const counters = await countersForGroup(groupDoc.id);
    if (!counters) {
      skipped += 1;
      continue;
    }

    const current = groupDoc.data() ?? {};
    const unchanged =
      Number(current.memberCount ?? 0) === counters.memberCount &&
      Number(current.postCount ?? 0) === counters.postCount &&
      Number(current.pollCount ?? 0) === counters.pollCount;
    if (unchanged) continue;

    await groupDoc.ref.set(
      { ...counters, statsUpdatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    updated += 1;
    console.log('group_counters_recomputed', { groupId: groupDoc.id, ...counters, at: now.toISOString() });
  }

  return { scanned: groupsSnap.size, updated, skipped };
}

/** Counters for a single group — used to repair one group without a full sweep. */
export async function recomputeGroupCountersFor(groupId: string): Promise<GroupCounters | null> {
  const counters = await countersForGroup(groupId);
  if (!counters) return null;
  await db
    .collection('groups')
    .doc(groupId)
    .set({ ...counters, statsUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return counters;
}
