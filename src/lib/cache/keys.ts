import type { CacheFreshness } from '@/lib/cache/types';

export const LOCAL_CACHE_POLICY = {
  feedStaleMs: 2 * 60 * 1000,
  feedExpiresMs: 7 * 24 * 60 * 60 * 1000,
  notificationsStaleMs: 5 * 60 * 1000,
  notificationsExpiresMs: 3 * 24 * 60 * 60 * 1000,
  groupsStaleMs: 10 * 60 * 1000,
  groupsExpiresMs: 7 * 24 * 60 * 60 * 1000,
  rosterStaleMs: 5 * 60 * 1000,
  rosterExpiresMs: 24 * 60 * 60 * 1000,
  practiceStaleMs: 2 * 60 * 1000,
  practiceExpiresMs: 2 * 24 * 60 * 60 * 1000,
  adminPracticeStaleMs: 2 * 60 * 1000,
  adminPracticeExpiresMs: 24 * 60 * 60 * 1000,
  refreshCooldownMs: 30 * 1000,
} as const;

function safeSegment(value: string): string {
  return encodeURIComponent(value.trim());
}

export function userCacheScope(uid: string): string {
  return `user:${safeSegment(uid)}`;
}

export function groupCacheScope(uid: string, groupId: string): string {
  return `${userCacheScope(uid)}:group:${safeSegment(groupId)}`;
}

export function feedCacheKey(): string {
  return 'feed:first-page';
}

export function notificationsCacheKey(groupId?: string | null): string {
  return `notifications:first-page:${safeSegment(groupId || 'personal')}`;
}

export function groupsCacheKey(role: string, assignedGroupIds: string[] = []): string {
  return `groups:${safeSegment(role)}:${[...new Set(assignedGroupIds)].sort().map(safeSegment).join(',')}`;
}

export function rosterFirstPageCacheKey(input: {
  groupId?: string | null;
  role?: string;
  status?: string;
  search?: string;
  pageSize?: number;
}): string {
  return [
    'roster:first-page',
    safeSegment(input.groupId || 'all'),
    safeSegment(input.role || 'all'),
    safeSegment(input.status || 'all'),
    safeSegment(input.search?.trim().toLowerCase() || ''),
    String(input.pageSize ?? 50),
  ].join(':');
}

export function todayPracticeCacheKey(dateKey: string, groupId: string): string {
  return `practice:today:${safeSegment(groupId)}:${safeSegment(dateKey)}`;
}

export function adminPracticeCacheKey(groupId: string, dateKey: string): string {
  return `practice:admin:${safeSegment(groupId)}:${safeSegment(dateKey)}`;
}

export function shouldRefreshCache(
  freshness: CacheFreshness | null,
  forceRefresh = false
): boolean {
  return forceRefresh || freshness !== 'fresh';
}

/**
 * Id for a queued completion. The group is part of it so marking Adhyay 1 done in
 * one group is never collapsed into the queued completion for another — the two
 * would otherwise share one outbox row and one of them would be silently lost.
 */
export function practiceMutationId(input: {
  uid: string;
  groupId: string;
  dateKey: string;
  itemKey?: string;
}): string {
  const target = input.itemKey ? `one:${safeSegment(input.itemKey)}` : 'all';
  return `practice:${safeSegment(input.uid)}:${safeSegment(input.groupId)}:${safeSegment(input.dateKey)}:${target}`;
}
