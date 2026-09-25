import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
} from 'firebase/firestore';

import {
  SENIOR_STATS_CACHE_MS,
  SENIOR_STATS_MAX_GROUPS,
} from '@/lib/backend-query-policy';
import { db } from '@/lib/firebase';

export interface AdminStats {
  totalMembers: number;
  totalPosts: number;
  capped?: boolean;
}

let seniorStatsCache:
  | { value: AdminStats; expiresAt: number }
  | undefined;

/** Cheap stats from group counters. */
export async function fetchAdminStats(groupId?: string | null): Promise<AdminStats> {
  if (groupId) {
    const groupSnap = await getDoc(doc(db, 'groups', groupId));
    const data = groupSnap.data() ?? {};
    const memberCount = Number(data.memberCount ?? 0);
    const postCount = Number(data.postCount ?? 0);

    return {
      totalMembers: Math.max(0, memberCount),
      totalPosts: Math.max(0, postCount),
    };
  }

  const now = Date.now();
  if (seniorStatsCache && seniorStatsCache.expiresAt > now) {
    return seniorStatsCache.value;
  }

  /**
   * A global rollup would add a transaction/write to every counter mutation,
   * which costs more than this dashboard's infrequent reads at current scale.
   * Cache the bounded counter scan instead; the extra row detects truncation.
   */
  const groupsSnap = await getDocs(
    query(
      collection(db, 'groups'),
      orderBy(documentId(), 'asc'),
      limit(SENIOR_STATS_MAX_GROUPS + 1)
    )
  );
  let totalMembers = 0;
  let totalPosts = 0;

  for (const entry of groupsSnap.docs.slice(0, SENIOR_STATS_MAX_GROUPS)) {
    const data = entry.data();
    totalMembers += Math.max(0, Number(data.memberCount ?? 0));
    totalPosts += Math.max(0, Number(data.postCount ?? 0));
  }

  const value = {
    totalMembers,
    totalPosts,
    capped: groupsSnap.size > SENIOR_STATS_MAX_GROUPS,
  };
  seniorStatsCache = {
    value,
    expiresAt: now + SENIOR_STATS_CACHE_MS,
  };
  return value;
}
