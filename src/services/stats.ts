import { collection, doc, getDoc, getDocs } from 'firebase/firestore';

import { db } from '@/lib/firebase';

export interface AdminStats {
  totalMembers: number;
  totalPosts: number;
}

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

  const groupsSnap = await getDocs(collection(db, 'groups'));
  let totalMembers = 0;
  let totalPosts = 0;

  for (const entry of groupsSnap.docs) {
    const data = entry.data();
    totalMembers += Math.max(0, Number(data.memberCount ?? 0));
    totalPosts += Math.max(0, Number(data.postCount ?? 0));
  }

  return { totalMembers, totalPosts };
}
