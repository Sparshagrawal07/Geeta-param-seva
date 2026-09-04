import { collection, getDocs, query, where } from 'firebase/firestore';

import type { UserProfile } from '@/lib/users';
import { db } from '@/lib/firebase';

function mapUser(id: string, data: Record<string, unknown>): UserProfile {
  const role = data.role === 'senior_admin' ? 'senior_admin' : data.role === 'admin' ? 'admin' : 'user';
  return {
    uid: id,
    name: String(data.name ?? ''),
    phoneNumber: String(data.phoneNumber ?? ''),
    role,
    groupId: typeof data.groupId === 'string' ? data.groupId : null,
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
    const memberSnapshot = await getDocs(
      query(collection(db, 'users'), where('groupId', 'in', batch))
    );
    for (const entry of memberSnapshot.docs) {
      byUid.set(entry.id, mapUser(entry.id, entry.data() as Record<string, unknown>));
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

/**
 * Fetch members.
 * - Senior admin: all users, or scoped to selected group(s).
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

  const snapshot = await getDocs(collection(db, 'users'));
  const members = snapshot.docs.map((entry) => mapUser(entry.id, entry.data() as Record<string, unknown>));
  return mergeMembers(members, currentProfile);
}
