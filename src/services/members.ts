import {
  collection,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from 'firebase/firestore';

import type { UserProfile } from '@/lib/users';
import { profileGroupIds } from '@/lib/users';
import { db } from '@/lib/firebase';
import {
  MEMBER_LIST_MAX_PAGES,
  MEMBER_LIST_PAGE_SIZE,
} from '@/lib/backend-query-policy';

function mapUser(id: string, data: Record<string, unknown>): UserProfile {
  const role = data.role === 'senior_admin' ? 'senior_admin' : data.role === 'admin' ? 'admin' : 'user';
  const groupIds = profileGroupIds({
    groupId: typeof data.groupId === 'string' ? data.groupId : null,
    groupIds: Array.isArray(data.groupIds) ? data.groupIds.map(String) : undefined,
  });
  return {
    uid: id,
    name: String(data.name ?? ''),
    phoneNumber: String(data.phoneNumber ?? ''),
    role,
    groupId: groupIds[0] ?? null,
    groupIds,
    assignedGroupIds: Array.isArray(data.assignedGroupIds) ? data.assignedGroupIds.map(String) : [],
  };
}

function mergeMembers(members: UserProfile[], currentProfile?: UserProfile | null): UserProfile[] {
  const byUid = new Map<string, UserProfile>();

  for (const member of members) {
    byUid.set(member.uid, member);
  }

  if (currentProfile) {
    byUid.set(currentProfile.uid, currentProfile);
  }

  return [...byUid.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchScopedMembersFromFirestore(scopeGroupIds: string[]): Promise<UserProfile[]> {
  if (scopeGroupIds.length === 0) {
    return [];
  }

  const byUid = new Map<string, UserProfile>();

  for (let i = 0; i < scopeGroupIds.length; i += 10) {
    const batch = scopeGroupIds.slice(i, i + 10);
    // `groupIds` is the source of truth, but the scalar `groupId` is still indexed
    // and still set on every row, so this second query keeps members visible during
    // the window before the array index is live or a row has been backfilled.
    const memberQueries = [
      query(collection(db, 'users'), where('groupIds', 'array-contains-any', batch)),
      query(collection(db, 'users'), where('groupId', 'in', batch)),
    ];
    for (const memberQuery of memberQueries) {
      const memberSnapshot = await getDocs(memberQuery);
      for (const entry of memberSnapshot.docs) {
        byUid.set(entry.id, mapUser(entry.id, entry.data() as Record<string, unknown>));
      }
    }
  }

  for (const groupId of scopeGroupIds) {
    const adminSnapshot = await getDocs(
      query(collection(db, 'users'), where('assignedGroupIds', 'array-contains', groupId))
    );
    for (const entry of adminSnapshot.docs) {
      byUid.set(entry.id, mapUser(entry.id, entry.data() as Record<string, unknown>));
    }
  }

  const seniorSnapshot = await getDocs(
    query(collection(db, 'users'), where('role', '==', 'senior_admin'))
  );
  for (const entry of seniorSnapshot.docs) {
    byUid.set(entry.id, mapUser(entry.id, entry.data() as Record<string, unknown>));
  }

  return [...byUid.values()];
}

async function fetchBoundedSeniorMembers(): Promise<UserProfile[]> {
  const members: UserProfile[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < MEMBER_LIST_MAX_PAGES; page += 1) {
    const constraints = [
      orderBy(documentId(), 'asc'),
      ...(cursor ? [startAfter(cursor)] : []),
      limit(MEMBER_LIST_PAGE_SIZE),
    ];
    const snapshot = await getDocs(query(collection(db, 'users'), ...constraints));
    members.push(
      ...snapshot.docs.map((entry) =>
        mapUser(entry.id, entry.data() as Record<string, unknown>)
      )
    );
    if (snapshot.size < MEMBER_LIST_PAGE_SIZE) break;
    cursor = snapshot.docs[snapshot.docs.length - 1]!.id;
  }

  return members;
}

/**
 * Fetch members.
 * - Senior admin: paginated/capped users, or scoped to selected group(s).
 * - Regular admin: users in assigned groups only.
 */
export async function fetchMembers(
  currentProfile?: UserProfile | null,
  scopeGroupIds?: string[]
): Promise<UserProfile[]> {
  if (scopeGroupIds !== undefined) {
    const scoped = await fetchScopedMembersFromFirestore(scopeGroupIds);
    return mergeMembers(scoped, currentProfile);
  }

  if (currentProfile?.role === 'admin') {
    const scoped = await fetchScopedMembersFromFirestore(
      currentProfile.assignedGroupIds ?? []
    );
    return mergeMembers(scoped, currentProfile);
  }

  if (currentProfile?.role !== 'senior_admin') {
    return mergeMembers([], currentProfile);
  }

  return mergeMembers(await fetchBoundedSeniorMembers(), currentProfile);
}
