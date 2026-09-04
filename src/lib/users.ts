import { doc, getDoc, setDoc } from 'firebase/firestore';

import { auth, db } from '@/lib/firebase';

export type UserRole = 'senior_admin' | 'admin' | 'user';

export interface UserProfile {
  uid: string;
  name: string;
  phoneNumber: string;
  role: UserRole;
  /** Set for role === 'user' — the single group they belong to */
  groupId?: string | null;
  /** Set for role === 'admin' — the groups they can manage */
  assignedGroupIds?: string[];
  /** Admin/senior personal PIN has been set (join PIN no longer works for them). */
  hasPersonalPin?: boolean;
  /** Sole active device session id (matches push device id). */
  activeSessionId?: string | null;
}

export function isAdminRole(role: UserRole | null | undefined): boolean {
  return role === 'senior_admin' || role === 'admin';
}

export function isSeniorAdmin(role: UserRole | null | undefined): boolean {
  return role === 'senior_admin';
}

function normalizeRole(value: unknown): UserRole {
  if (value === 'senior_admin') return 'senior_admin';
  if (value === 'admin') return 'admin';
  return 'user';
}

export function userProfileRef(uid: string) {
  return doc(db, 'users', uid);
}

export { profileNeedsName } from '@/lib/profile';

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snapshot = await getDoc(userProfileRef(uid));

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data() as Partial<UserProfile>;

  return {
    uid,
    name: typeof data.name === 'string' ? data.name : '',
    phoneNumber: typeof data.phoneNumber === 'string' ? data.phoneNumber : '',
    role: normalizeRole(data.role),
    groupId: typeof data.groupId === 'string' ? data.groupId : null,
    assignedGroupIds: Array.isArray(data.assignedGroupIds) ? data.assignedGroupIds.map(String) : [],
    hasPersonalPin: data.hasPersonalPin === true,
    activeSessionId: typeof data.activeSessionId === 'string' ? data.activeSessionId : null,
  };
}

/** Name-only profile completion after PIN login (role/group already set by Cloud Function). */
export async function upsertUserProfile(input: {
  uid: string;
  name: string;
  phoneNumber: string;
}): Promise<UserProfile> {
  const existingProfile = await getUserProfile(input.uid);
  if (!existingProfile) {
    throw new Error('Profile not found. Please sign in again.');
  }

  const authPhone = auth.currentUser?.phoneNumber?.trim() ?? '';
  const phoneNumber =
    authPhone || input.phoneNumber.trim() || existingProfile.phoneNumber || '';
  const name = input.name.trim() || existingProfile.name.trim() || '';

  await setDoc(
    userProfileRef(input.uid),
    {
      name,
      phoneNumber,
    },
    { merge: true }
  );

  return {
    ...existingProfile,
    name,
    phoneNumber,
  };
}

export async function ensureUserProfile(input: {
  uid: string;
  phoneNumber: string;
}): Promise<UserProfile> {
  const existingProfile = await getUserProfile(input.uid);
  if (existingProfile) {
    return existingProfile;
  }

  throw new Error('Profile not found. Please sign in again.');
}
