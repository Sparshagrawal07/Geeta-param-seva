import type { FeedItem } from '@/types/feed';

export function latestFeedAt(items: FeedItem[]): number | null {
  let latest: number | null = null;
  for (const item of items) {
    const timestamp = item.createdAt.getTime();
    if (!Number.isFinite(timestamp)) continue;
    if (latest === null || timestamp > latest) latest = timestamp;
  }
  return latest;
}

export function hasUnreadFeed(latestAt: number | null, lastSeenAt: number): boolean {
  return latestAt !== null && (!Number.isFinite(lastSeenAt) || latestAt > lastSeenAt);
}
