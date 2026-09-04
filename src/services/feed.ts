import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import { db, functions } from '@/lib/firebase';
import { messages } from '@/lib/i18n/messages';
import { mapSevaBannerFromData } from '@/lib/seva-banner';
import type { AnnouncementPost, FeedItem, SevaPost } from '@/types/feed';

/** Keep feed listeners cheap — daily wipe + hard cap. */
export const FEED_PAGE_SIZE = 40;

function toDate(value: unknown) {
  if (value instanceof Timestamp) {
    return value.toDate();
  }

  if (value instanceof Date) {
    return value;
  }

  return new Date();
}

function mapSevaPost(id: string, data: Record<string, unknown>): SevaPost {
  const banner = mapSevaBannerFromData(data.banner);
  const imageUrl = data.imageUrl ? String(data.imageUrl) : undefined;

  return {
    id,
    type: 'seva',
    groupId: String(data.groupId ?? ''),
    title: String(data.title ?? ''),
    description: String(data.description ?? ''),
    ...(banner ? { banner } : {}),
    ...(imageUrl ? { imageUrl } : {}),
    createdBy: String(data.createdBy ?? ''),
    createdByName: String(data.createdByName ?? messages.defaultAdminName),
    createdAt: toDate(data.createdAt),
  };
}

function mapAnnouncementPost(id: string, data: Record<string, unknown>): AnnouncementPost {
  return {
    id,
    type: 'announcement',
    groupId: String(data.groupId ?? ''),
    title: String(data.title ?? ''),
    message: String(data.message ?? data.description ?? ''),
    createdBy: String(data.createdBy ?? ''),
    createdByName: String(data.createdByName ?? messages.defaultAdminName),
    createdAt: toDate(data.createdAt),
  };
}

function mapPostDoc(id: string, data: Record<string, unknown>): FeedItem | null {
  const type = String(data.type ?? 'announcement');
  if (type === 'seva') {
    return mapSevaPost(id, data);
  }
  if (type === 'announcement') {
    return mapAnnouncementPost(id, data);
  }
  // Legacy poll docs (if any were written into posts) are ignored.
  return null;
}

async function notifyCommunityPostPublished(input: {
  groupId: string;
  postType: 'seva' | 'announcement';
  postTitle: string;
  postId: string;
}) {
  // Prefer the callable for instant fan-out; Firestore `onCommunityPostCreated`
  // is the reliability backstop if this fails (network / cold start).
  const callable = httpsCallable(functions, 'notifyCommunityPostPublished');
  try {
    await callable(input);
  } catch (error) {
    console.warn('notifyCommunityPostPublished_failed_trigger_will_retry', error);
  }
}

/**
 * Fetch feed for a specific group. Pass null/undefined to fetch across all groups
 * (senior admin only — relies on security rules to enforce scope).
 */
export async function fetchFeed(groupId?: string | null): Promise<FeedItem[]> {
  const postsQuery = groupId
    ? query(
        collection(db, 'posts'),
        where('groupId', '==', groupId),
        orderBy('createdAt', 'desc'),
        limit(FEED_PAGE_SIZE)
      )
    : query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(FEED_PAGE_SIZE));

  const postsSnapshot = await getDocs(postsQuery);
  return postsSnapshot.docs
    .map((entry) => mapPostDoc(entry.id, entry.data() as Record<string, unknown>))
    .filter((item): item is FeedItem => item != null);
}

/** Latest post timestamp for a group (for unread badge). */
export async function fetchLatestFeedAt(groupId: string): Promise<number | null> {
  const snap = await getDocs(
    query(
      collection(db, 'posts'),
      where('groupId', '==', groupId),
      orderBy('createdAt', 'desc'),
      limit(1)
    )
  );
  if (snap.empty) return null;
  const createdAt = snap.docs[0]!.data().createdAt;
  return toDate(createdAt).getTime();
}

/** Live feed updates for a group (or all groups when groupId is null/undefined). */
export function subscribeFeed(
  groupId: string | null | undefined,
  onChange: (items: FeedItem[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const postsQuery = groupId
    ? query(
        collection(db, 'posts'),
        where('groupId', '==', groupId),
        orderBy('createdAt', 'desc'),
        limit(FEED_PAGE_SIZE)
      )
    : query(collection(db, 'posts'), orderBy('createdAt', 'desc'), limit(FEED_PAGE_SIZE));

  return onSnapshot(
    postsQuery,
    (snapshot) => {
      const items = snapshot.docs
        .map((entry) => mapPostDoc(entry.id, entry.data() as Record<string, unknown>))
        .filter((item): item is FeedItem => item != null);
      onChange(items);
    },
    (error) => onError?.(error)
  );
}

export async function createSevaPost(input: Omit<SevaPost, 'id' | 'type' | 'createdAt'>) {
  const docRef = await addDoc(collection(db, 'posts'), {
    type: 'seva',
    groupId: input.groupId,
    title: input.title,
    description: input.description,
    ...(input.banner ? { banner: input.banner } : {}),
    ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'groups', input.groupId), {
    postCount: increment(1),
    statsUpdatedAt: serverTimestamp(),
  }).catch(() => undefined);

  await notifyCommunityPostPublished({
    groupId: input.groupId,
    postType: 'seva',
    postTitle: input.title,
    postId: docRef.id,
  });

  return mapSevaPost(docRef.id, { ...input, createdAt: new Date() });
}

export async function createAnnouncementPost(
  input: Omit<AnnouncementPost, 'id' | 'type' | 'createdAt'>
) {
  const docRef = await addDoc(collection(db, 'posts'), {
    type: 'announcement',
    groupId: input.groupId,
    title: input.title,
    message: input.message,
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, 'groups', input.groupId), {
    postCount: increment(1),
    statsUpdatedAt: serverTimestamp(),
  }).catch(() => undefined);

  await notifyCommunityPostPublished({
    groupId: input.groupId,
    postType: 'announcement',
    postTitle: input.title || input.message,
    postId: docRef.id,
  });

  return mapAnnouncementPost(docRef.id, { ...input, createdAt: new Date() });
}

export async function deleteFeedItem(item: FeedItem) {
  await deleteDoc(doc(db, 'posts', item.id));
  await updateDoc(doc(db, 'groups', item.groupId), {
    postCount: increment(-1),
    statsUpdatedAt: serverTimestamp(),
  }).catch(() => undefined);
}
