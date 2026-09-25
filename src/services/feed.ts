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

import { feedCacheKey, groupCacheScope, LOCAL_CACHE_POLICY } from '@/lib/cache/keys';
import { getLocalCache } from '@/lib/cache';
import { auth, db } from '@/lib/firebase';
import { messages } from '@/lib/i18n/messages';
import { mapSevaBannerFromData } from '@/lib/seva-banner';
import type { AnnouncementPost, FeedItem, SevaPost } from '@/types/feed';

/** Keep feed listeners cheap — daily wipe + hard cap. */
export const FEED_PAGE_SIZE = 40;
const feedRefreshInFlight = new Map<string, Promise<FeedItem[]>>();

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

export async function getCachedFeed(
  uid: string,
  groupId: string
) {
  const cache = await getLocalCache();
  return cache.get<FeedItem[]>(feedCacheKey(), {
    scope: groupCacheScope(uid, groupId),
  });
}

export async function refreshCachedFeed(
  uid: string,
  groupId: string
): Promise<FeedItem[]> {
  if (auth.currentUser?.uid !== uid) throw new Error('AUTH_CHANGED');
  const scope = groupCacheScope(uid, groupId);
  const existing = feedRefreshInFlight.get(scope);
  if (existing) return existing;
  const request = (async () => {
    const cache = await getLocalCache();
    const items = await fetchFeed(groupId);
    if (auth.currentUser?.uid !== uid) throw new Error('AUTH_CHANGED');
    await cache.set(feedCacheKey(), items, {
      scope,
      staleForMs: LOCAL_CACHE_POLICY.feedStaleMs,
      expiresInMs: LOCAL_CACHE_POLICY.feedExpiresMs,
    });
    return items;
  })().finally(() => {
    if (feedRefreshInFlight.get(scope) === request) {
      feedRefreshInFlight.delete(scope);
    }
  });
  feedRefreshInFlight.set(scope, request);
  return request;
}

export async function updateCachedFeed(
  uid: string,
  groupId: string,
  update: (items: FeedItem[]) => FeedItem[]
): Promise<void> {
  const cache = await getLocalCache();
  const scope = groupCacheScope(uid, groupId);
  const cached = await cache.get<FeedItem[]>(feedCacheKey(), { scope });
  if (!cached) return;
  await cache.set(feedCacheKey(), update(cached.value), {
    scope,
    staleForMs: LOCAL_CACHE_POLICY.feedStaleMs,
    expiresInMs: LOCAL_CACHE_POLICY.feedExpiresMs,
  });
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

  const created = mapSevaPost(docRef.id, { ...input, createdAt: new Date() });
  await updateCachedFeed(input.createdBy, input.groupId, (items) =>
    [created, ...items.filter((item) => item.id !== created.id)].slice(0, FEED_PAGE_SIZE)
  );
  return created;
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

  const created = mapAnnouncementPost(docRef.id, { ...input, createdAt: new Date() });
  await updateCachedFeed(input.createdBy, input.groupId, (items) =>
    [created, ...items.filter((item) => item.id !== created.id)].slice(0, FEED_PAGE_SIZE)
  );
  return created;
}

export async function deleteFeedItem(item: FeedItem) {
  await deleteDoc(doc(db, 'posts', item.id));
  await updateDoc(doc(db, 'groups', item.groupId), {
    postCount: increment(-1),
    statsUpdatedAt: serverTimestamp(),
  }).catch(() => undefined);
  const uid = auth.currentUser?.uid;
  if (uid) {
    await updateCachedFeed(uid, item.groupId, (items) =>
      items.filter((entry) => entry.id !== item.id)
    );
  }
}
