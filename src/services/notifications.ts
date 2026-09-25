import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';

import { auth, db } from '@/lib/firebase';
import type { AppNotification } from '@/types/feed';

const NOTIFICATIONS_PAGE_SIZE = 30;

function toDate(value: unknown) {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date();
}

function mapNotification(id: string, data: Record<string, unknown>): AppNotification {
  return {
    id,
    groupId: String(data.groupId ?? ''),
    title: String(data.title ?? ''),
    body: String(data.body ?? ''),
    createdAt: toDate(data.createdAt),
  };
}

function isVisibleNotification(data: Record<string, unknown>, uid: string | null) {
  const type = String(data.type ?? '');
  const owner = typeof data.uid === 'string' ? data.uid : '';

  // Personal practice alerts
  if (
    type === 'practice_reminder' ||
    type === 'practice_assigned' ||
    type === 'practice_report'
  ) {
    return Boolean(uid && owner === uid);
  }

  // Group community notifications (and legacy types still in the wild)
  if (
    type === 'seva' ||
    type === 'announcement' ||
    type === 'reminder' ||
    type === 'community' ||
    type === 'verse_assigned' ||
    type === 'verse_reminder' ||
    type === 'daily_verse' ||
    type === ''
  ) {
    return !owner || owner === uid;
  }

  return !owner || owner === uid;
}

async function safeGetDocs(label: string, q: ReturnType<typeof query>) {
  try {
    return await getDocs(q);
  } catch (error) {
    console.warn(`[notifications] ${label} query failed`, error);
    return null;
  }
}

/**
 * One-shot fetch — resilient to missing indexes / partial permission failures.
 * Prefer group query (always deployable); merge personal uid rows when available.
 */
export async function fetchNotifications(groupId?: string | null): Promise<AppNotification[]> {
  const uid = auth.currentUser?.uid ?? null;
  const byId = new Map<string, AppNotification>();
  let attemptedQueries = 0;
  let successfulQueries = 0;

  // Primary path: group-scoped list (works with deployed groupId+createdAt index).
  if (groupId) {
    attemptedQueries += 1;
    const groupSnap = await safeGetDocs(
      'group',
      query(
        collection(db, 'notifications'),
        where('groupId', '==', groupId),
        orderBy('createdAt', 'desc'),
        limit(NOTIFICATIONS_PAGE_SIZE)
      )
    );
    if (groupSnap) {
      successfulQueries += 1;
      for (const entry of groupSnap.docs) {
        const raw = entry.data() as Record<string, unknown>;
        if (!isVisibleNotification(raw, uid)) continue;
        byId.set(entry.id, mapNotification(entry.id, raw));
      }
    }
  }

  // Optional personal rows (practice reminders). Never fail the whole screen if this errors.
  if (uid) {
    attemptedQueries += 1;
    const personalSnap = await safeGetDocs(
      'personal',
      query(
        collection(db, 'notifications'),
        where('uid', '==', uid),
        orderBy('createdAt', 'desc'),
        limit(NOTIFICATIONS_PAGE_SIZE)
      )
    );
    if (personalSnap) {
      successfulQueries += 1;
      for (const entry of personalSnap.docs) {
        const raw = entry.data() as Record<string, unknown>;
        if (!isVisibleNotification(raw, uid)) continue;
        byId.set(entry.id, mapNotification(entry.id, raw));
      }
    }
  }

  if (attemptedQueries > 0 && successfulQueries === 0) {
    throw new Error('Notifications are temporarily unavailable.');
  }

  return [...byId.values()]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, NOTIFICATIONS_PAGE_SIZE);
}
