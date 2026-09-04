import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';

import { auth, db } from '@/lib/firebase';
import { getUserProfile, isSeniorAdmin } from '@/lib/users';
import type { Group } from '@/types/group';

function toDate(value: unknown): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return new Date();
}

function mapGroup(id: string, data: Record<string, unknown>): Group {
  return {
    id,
    name: String(data.name ?? ''),
    description: typeof data.description === 'string' ? data.description : undefined,
    hasPin: data.hasPin === true,
    pinExpiresAt: data.pinExpiresAt ? toDate(data.pinExpiresAt) : null,
    memberCount: typeof data.memberCount === 'number' ? data.memberCount : 0,
    postCount: typeof data.postCount === 'number' ? data.postCount : 0,
    pollCount: typeof data.pollCount === 'number' ? data.pollCount : 0,
    todaysPollResponseCount:
      typeof data.todaysPollResponseCount === 'number' ? data.todaysPollResponseCount : 0,
    createdAt: toDate(data.createdAt),
    createdBy: String(data.createdBy ?? ''),
  };
}

async function assertSeniorAdminCaller() {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('UNAUTHENTICATED');
  }
  const profile = await getUserProfile(uid);
  if (!isSeniorAdmin(profile?.role)) {
    throw new Error('PERMISSION_DENIED');
  }
}

export async function fetchGroups(): Promise<Group[]> {
  const snapshot = await getDocs(query(collection(db, 'groups'), orderBy('createdAt', 'asc')));
  return snapshot.docs.map((entry) => mapGroup(entry.id, entry.data() as Record<string, unknown>));
}

export async function fetchGroupsByIds(ids: string[]): Promise<Group[]> {
  if (ids.length === 0) return [];

  const uniqueIds = [...new Set(ids.filter(Boolean))];
  const snapshots = await Promise.all(uniqueIds.map((id) => getDoc(doc(db, 'groups', id))));

  return snapshots
    .filter((snapshot) => snapshot.exists())
    .map((snapshot) => mapGroup(snapshot.id, snapshot.data() as Record<string, unknown>))
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

export function subscribeGroups(onChange: (groups: Group[]) => void, onError?: (error: Error) => void): Unsubscribe {
  return onSnapshot(
    query(collection(db, 'groups'), orderBy('createdAt', 'asc')),
    (snapshot) => {
      onChange(
        snapshot.docs.map((entry) => mapGroup(entry.id, entry.data() as Record<string, unknown>))
      );
    },
    onError
  );
}

export function subscribeGroupsByIds(
  ids: string[],
  onChange: (groups: Group[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) {
    onChange([]);
    return () => undefined;
  }

  const byId = new Map<string, Group>();
  const emit = () => {
    onChange([...byId.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()));
  };

  const unsubs = uniqueIds.map((id) =>
    onSnapshot(
      doc(db, 'groups', id),
      (snapshot) => {
        if (snapshot.exists()) {
          byId.set(id, mapGroup(snapshot.id, snapshot.data() as Record<string, unknown>));
        } else {
          byId.delete(id);
        }
        emit();
      },
      onError
    )
  );

  return () => {
    unsubs.forEach((unsubscribe) => unsubscribe());
  };
}

export async function createGroup(input: {
  name: string;
  description?: string;
  createdBy: string;
}): Promise<Group> {
  await assertSeniorAdminCaller();

  const docRef = await addDoc(collection(db, 'groups'), {
    name: input.name.trim(),
    description: input.description?.trim() ?? '',
    createdBy: input.createdBy,
    createdAt: serverTimestamp(),
    memberCount: 0,
    postCount: 0,
    pollCount: 0,
    todaysPollResponseCount: 0,
  });

  return {
    id: docRef.id,
    name: input.name.trim(),
    description: input.description?.trim(),
    memberCount: 0,
    postCount: 0,
    pollCount: 0,
    todaysPollResponseCount: 0,
    createdAt: new Date(),
    createdBy: input.createdBy,
  };
}

export async function deleteGroup(groupId: string): Promise<void> {
  await assertSeniorAdminCaller();
  await deleteDoc(doc(db, 'groups', groupId));
}

export async function isGroupNameAvailable(
  name: string,
  excludeGroupId?: string
): Promise<boolean> {
  const normalized = name.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  const groups = await fetchGroups();
  return !groups.some(
    (group) => group.id !== excludeGroupId && group.name.trim().toLowerCase() === normalized
  );
}

export async function updateGroupName(groupId: string, name: string): Promise<Group> {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error('Group name is required');
  }

  const available = await isGroupNameAvailable(trimmed, groupId);
  if (!available) {
    throw new Error('GROUP_NAME_TAKEN');
  }

  await updateDoc(doc(db, 'groups', groupId), { name: trimmed });
  const snapshot = await getDoc(doc(db, 'groups', groupId));
  if (!snapshot.exists()) {
    throw new Error('Group not found');
  }
  return mapGroup(snapshot.id, snapshot.data() as Record<string, unknown>);
}

/** Append groupId to admin's assignedGroupIds (idempotent via arrayUnion) */
export async function assignAdminToGroup(adminUid: string, groupId: string): Promise<void> {
  await updateDoc(doc(db, 'users', adminUid), {
    assignedGroupIds: arrayUnion(groupId),
  });
}

/** Remove groupId from admin's assignedGroupIds */
export async function removeAdminFromGroup(adminUid: string, groupId: string): Promise<void> {
  await updateDoc(doc(db, 'users', adminUid), {
    assignedGroupIds: arrayRemove(groupId),
  });
}

/** Set member's single groupId */
export async function assignMemberToGroup(
  memberUid: string,
  groupId: string | null
): Promise<void> {
  await updateDoc(doc(db, 'users', memberUid), {
    groupId: groupId ?? null,
  });
}

/** Assign multiple unassigned members to a group at once */
export async function assignMembersToGroup(
  memberUids: string[],
  groupId: string
): Promise<void> {
  if (memberUids.length === 0) {
    return;
  }

  await Promise.all(
    memberUids.map((uid) =>
      updateDoc(doc(db, 'users', uid), {
        groupId,
      })
    )
  );
}

/** Fetch users that belong to a specific group (admins may list). */
export async function fetchGroupMembers(
  groupId: string
): Promise<Array<{ uid: string; name: string; phoneNumber: string }>> {
  try {
    const snapshot = await getDocs(query(collection(db, 'users'), where('groupId', '==', groupId)));
    return snapshot.docs.map((entry) => {
      const data = entry.data() as Record<string, unknown>;
      return {
        uid: entry.id,
        name: String(data.name ?? ''),
        phoneNumber: String(data.phoneNumber ?? ''),
      };
    });
  } catch (error) {
    console.warn('[groups] fetchGroupMembers users query failed, using roster', error);
    const { fetchAccessRosterPage } = await import('@/services/roster');
    const page = await fetchAccessRosterPage({
      groupId,
      role: 'user',
      status: 'active',
      pageSize: 200,
    });
    return page.entries.map((entry) => ({
      uid: `u${entry.phoneNumber.replace(/\D/g, '')}`,
      name: entry.name,
      phoneNumber: entry.phoneNumber,
    }));
  }
}
