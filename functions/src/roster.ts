import { FieldValue, type DocumentData, type Query } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

import { adminAuth, db } from './firebase-admin';
import { revokeAllUserSessions } from './sessions';

export type RosterRole = 'user' | 'admin';
export type RosterStatus = 'active' | 'inactive';

export interface AccessRosterEntry {
  name: string;
  phoneNumber: string;
  role: RosterRole;
  groupId?: string | null;
  assignedGroupIds?: string[];
  status: RosterStatus;
  createdBy: string;
}

function normalizeRosterPhone(input: unknown): string {
  if (typeof input !== 'string') {
    throw new HttpsError('invalid-argument', 'Phone number is required.');
  }
  const compact = input.trim().replace(/[\s()-]/g, '');
  const withPlus = compact.startsWith('+') ? compact : `+${compact.replace(/\+/g, '')}`;
  if (!/^\+[1-9]\d{7,14}$/.test(withPlus)) {
    throw new HttpsError('invalid-argument', 'Enter a valid mobile number.');
  }
  return withPlus;
}

export function phoneToRosterId(phoneNumber: string): string {
  return phoneNumber.replace(/^\+/, '').replace(/\D/g, '');
}

export async function getAccessRoster(
  phoneId: string
): Promise<Record<string, unknown> | null> {
  const snap = await db.collection('access_roster').doc(phoneId).get();
  if (!snap.exists) {
    return null;
  }
  return { id: snap.id, ...(snap.data() as Record<string, unknown>) };
}

function serializeRosterDoc(id: string, data: DocumentData) {
  const toIso = (value: unknown) => {
    if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate: () => Date }).toDate === 'function') {
      return (value as { toDate: () => Date }).toDate().toISOString();
    }
    if (value instanceof Date) return value.toISOString();
    return null;
  };
  return {
    id,
    name: String(data.name ?? ''),
    phoneNumber: String(data.phoneNumber ?? ''),
    role: data.role === 'admin' ? 'admin' : 'user',
    groupId: typeof data.groupId === 'string' ? data.groupId : null,
    assignedGroupIds: Array.isArray(data.assignedGroupIds) ? data.assignedGroupIds.map(String) : [],
    status: data.status === 'inactive' ? 'inactive' : 'active',
    createdBy: typeof data.createdBy === 'string' ? data.createdBy : undefined,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

/**
 * Admin-safe roster list via Admin SDK (avoids client list-rule failures).
 */
export async function listAccessRosterCore(input: {
  actorUid: string;
  groupId?: string | null;
  role?: 'user' | 'admin' | 'all';
  status?: 'active' | 'inactive' | 'all';
  search?: string;
  pageSize?: number;
}) {
  const caller = await assertCallerCanManageRoster(input.actorUid);
  const groupId = typeof input.groupId === 'string' ? input.groupId.trim() : '';
  const role = input.role === 'user' || input.role === 'admin' ? input.role : 'all';
  const status = input.status === 'active' || input.status === 'inactive' ? input.status : 'all';
  const search = typeof input.search === 'string' ? input.search.trim().toLowerCase() : '';
  const pageSize = Math.min(Math.max(Number(input.pageSize) || 50, 1), 200);

  if (groupId) {
    assertCallerCanTouchGroups(caller, [groupId]);
  } else if (caller.role !== 'senior_admin') {
    throw new HttpsError('invalid-argument', 'Group is required.');
  }

  const byId = new Map<string, ReturnType<typeof serializeRosterDoc>>();

  if (!groupId || role !== 'admin') {
    let q: Query = db.collection('access_roster');
    if (groupId) q = q.where('groupId', '==', groupId);
    if (role === 'user') q = q.where('role', '==', 'user');
    if (status !== 'all') q = q.where('status', '==', status);
    q = q.orderBy('name').limit(Math.max(pageSize, 100));
    const snap = await q.get();
    for (const doc of snap.docs) {
      byId.set(doc.id, serializeRosterDoc(doc.id, doc.data()));
    }
  }

  if (groupId && (role === 'all' || role === 'admin')) {
    let adminQuery: Query = db
      .collection('access_roster')
      .where('assignedGroupIds', 'array-contains', groupId)
      .where('role', '==', 'admin');
    if (status !== 'all') adminQuery = adminQuery.where('status', '==', status);
    adminQuery = adminQuery.orderBy('name').limit(50);
    const adminSnap = await adminQuery.get();
    for (const doc of adminSnap.docs) {
      byId.set(doc.id, serializeRosterDoc(doc.id, doc.data()));
    }
  }

  let entries = [...byId.values()];
  if (search) {
    if (/^\d+$/.test(search)) {
      entries = entries.filter((entry) => entry.phoneNumber.includes(search));
    } else {
      entries = entries.filter((entry) => entry.name.toLowerCase().startsWith(search));
    }
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  const page = entries.slice(0, pageSize);

  return {
    entries: page,
    hasMore: entries.length > pageSize,
  };
}

export async function assertCallerCanManageRoster(uid: string) {
  const snap = await db.collection('users').doc(uid).get();
  const data = snap.data();
  if (!data) {
    throw new HttpsError('permission-denied', 'Not allowed.');
  }
  if (data.role === 'senior_admin') {
    return { role: 'senior_admin' as const, assignedGroupIds: [] as string[] };
  }
  if (data.role === 'admin') {
    const assignedGroupIds = Array.isArray(data.assignedGroupIds)
      ? data.assignedGroupIds.map(String)
      : [];
    return { role: 'admin' as const, assignedGroupIds };
  }
  throw new HttpsError('permission-denied', 'Admin access required.');
}

function assertCallerCanTouchGroups(
  caller: { role: 'senior_admin' | 'admin'; assignedGroupIds: string[] },
  groupIds: string[]
) {
  if (caller.role === 'senior_admin') {
    return;
  }
  for (const groupId of groupIds) {
    if (!caller.assignedGroupIds.includes(groupId)) {
      throw new HttpsError('permission-denied', 'Not allowed for this group.');
    }
  }
}

async function assertGroupsExist(groupIds: string[]) {
  const snaps = await Promise.all(groupIds.map((groupId) => db.collection('groups').doc(groupId).get()));
  for (let i = 0; i < snaps.length; i++) {
    if (!snaps[i]!.exists) {
      throw new HttpsError('not-found', `Group not found: ${groupIds[i]}`);
    }
  }
}

/**
 * Add or update an access_roster entry.
 * - Senior admin: any group; may create admins with assignedGroupIds
 * - Admin: members only, and only into one of their assigned groups
 * - Nobody may create senior_admin via this path
 */
export async function upsertAccessRosterEntry(input: {
  actorUid: string;
  phoneNumber: unknown;
  name: unknown;
  role: unknown;
  groupId?: unknown;
  assignedGroupIds?: unknown;
  status?: unknown;
}) {
  const caller = await assertCallerCanManageRoster(input.actorUid);
  const phoneNumber = normalizeRosterPhone(input.phoneNumber);
  const phoneId = phoneToRosterId(phoneNumber);
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name) {
    throw new HttpsError('invalid-argument', 'Name is required.');
  }

  const roleRaw = typeof input.role === 'string' ? input.role.trim() : '';
  if (roleRaw === 'senior_admin') {
    throw new HttpsError('invalid-argument', 'Cannot create senior admin via the app.');
  }
  if (roleRaw !== 'user' && roleRaw !== 'admin') {
    throw new HttpsError('invalid-argument', 'Role must be user or admin.');
  }
  const role = roleRaw as RosterRole;

  if (caller.role === 'admin' && role === 'admin') {
    throw new HttpsError('permission-denied', 'Only senior admins can add admins.');
  }

  const statusRaw = typeof input.status === 'string' ? input.status.trim() : 'active';
  if (statusRaw !== 'active' && statusRaw !== 'inactive') {
    throw new HttpsError('invalid-argument', 'Status must be active or inactive.');
  }
  const status = statusRaw as RosterStatus;

  let groupId: string | null = null;
  let assignedGroupIds: string[] = [];

  if (role === 'user') {
    const gid = typeof input.groupId === 'string' ? input.groupId.trim() : '';
    if (!gid) {
      throw new HttpsError('invalid-argument', 'groupId is required for members.');
    }
    assertCallerCanTouchGroups(caller, [gid]);
    await assertGroupsExist([gid]);
    groupId = gid;
    assignedGroupIds = [];
  } else {
    const rawIds = Array.isArray(input.assignedGroupIds)
      ? input.assignedGroupIds.map(String).map((id) => id.trim()).filter(Boolean)
      : [];
    const unique = [...new Set(rawIds)];
    if (unique.length === 0) {
      throw new HttpsError('invalid-argument', 'assignedGroupIds is required for admins.');
    }
    assertCallerCanTouchGroups(caller, unique);
    await assertGroupsExist(unique);
    groupId = null;
    assignedGroupIds = unique;
  }

  const ref = db.collection('access_roster').doc(phoneId);
  const existing = await ref.get();
  const previous = existing.data() ?? {};
  const previousRole = previous.role === 'admin' ? 'admin' : previous.role === 'user' ? 'user' : null;
  const previousStatus = previous.status === 'inactive' ? 'inactive' : existing.exists ? 'active' : null;
  const previousGroupId = typeof previous.groupId === 'string' ? previous.groupId : null;

  const payload: Record<string, unknown> = {
    name,
    nameLower: name.toLowerCase(),
    phoneNumber,
    role,
    groupId,
    assignedGroupIds,
    status,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (!existing.exists) {
    payload.createdBy = input.actorUid;
    payload.createdAt = FieldValue.serverTimestamp();
  }

  await ref.set(payload, { merge: true });

  // Maintain cheap memberCount counters on groups (active members only).
  const wasActiveMember = previousRole === 'user' && previousStatus === 'active' && previousGroupId;
  const isActiveMember = role === 'user' && status === 'active' && groupId;

  if (wasActiveMember && previousGroupId && (!isActiveMember || previousGroupId !== groupId)) {
    await db
      .collection('groups')
      .doc(previousGroupId)
      .set({ memberCount: FieldValue.increment(-1), statsUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  if (isActiveMember && groupId && (!wasActiveMember || previousGroupId !== groupId)) {
    await db
      .collection('groups')
      .doc(groupId)
      .set({ memberCount: FieldValue.increment(1), statsUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }

  return { id: phoneId, ...payload, createdBy: existing.data()?.createdBy ?? input.actorUid };
}

export async function deactivateAccessRosterEntry(input: {
  actorUid: string;
  phoneNumber: unknown;
}) {
  const caller = await assertCallerCanManageRoster(input.actorUid);
  const phoneNumber = normalizeRosterPhone(input.phoneNumber);
  const phoneId = phoneToRosterId(phoneNumber);
  const ref = db.collection('access_roster').doc(phoneId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Roster entry not found.');
  }

  const data = snap.data() ?? {};
  const role = data.role === 'admin' ? 'admin' : 'user';
  if (role === 'user') {
    const gid = typeof data.groupId === 'string' ? data.groupId : '';
    if (gid) {
      assertCallerCanTouchGroups(caller, [gid]);
    } else if (caller.role !== 'senior_admin') {
      throw new HttpsError('permission-denied', 'Not allowed.');
    }
  } else {
    const assigned = Array.isArray(data.assignedGroupIds) ? data.assignedGroupIds.map(String) : [];
    if (caller.role === 'admin') {
      // Regular admins cannot deactivate other admins.
      throw new HttpsError('permission-denied', 'Only senior admins can deactivate admins.');
    }
    if (assigned.length === 0 && caller.role !== 'senior_admin') {
      throw new HttpsError('permission-denied', 'Not allowed.');
    }
  }

  const wasActiveMember = role === 'user' && data.status !== 'inactive' && typeof data.groupId === 'string';

  await ref.set(
    {
      status: 'inactive',
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  if (wasActiveMember) {
    await db
      .collection('groups')
      .doc(String(data.groupId))
      .set({ memberCount: FieldValue.increment(-1), statsUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }

  // End any live sessions immediately so deactivated accounts lose access now.
  try {
    const authUser = await adminAuth.getUserByPhoneNumber(phoneNumber);
    await revokeAllUserSessions(authUser.uid);
  } catch {
    const usersSnap = await db
      .collection('users')
      .where('phoneNumber', '==', phoneNumber)
      .limit(1)
      .get();
    if (!usersSnap.empty) {
      await revokeAllUserSessions(usersSnap.docs[0]!.id);
    }
  }

  return { id: phoneId, status: 'inactive' as const };
}

/**
 * One-shot migration: copy admin_whitelist (+ known user profiles) into access_roster.
 * Senior admin only. Does not overwrite existing roster docs.
 */
export async function migrateWhitelistToRoster(actorUid: string) {
  const caller = await assertCallerCanManageRoster(actorUid);
  if (caller.role !== 'senior_admin') {
    throw new HttpsError('permission-denied', 'Senior admin only.');
  }

  let created = 0;
  let skipped = 0;

  const whitelist = await db.collection('admin_whitelist').get();
  for (const entry of whitelist.docs) {
    const phoneId = entry.id;
    const existing = await db.collection('access_roster').doc(phoneId).get();
    if (existing.exists) {
      skipped += 1;
      continue;
    }

    const data = entry.data();
    const phoneNumber =
      typeof data.phoneNumber === 'string' && data.phoneNumber.startsWith('+')
        ? data.phoneNumber
        : `+${phoneId}`;

    const userSnap = await db.collection('users').where('phoneNumber', '==', phoneNumber).limit(1).get();
    const userData = userSnap.empty ? {} : userSnap.docs[0]!.data();
    const assignedGroupIds = Array.isArray(userData.assignedGroupIds)
      ? userData.assignedGroupIds.map(String)
      : [];

    await db
      .collection('access_roster')
      .doc(phoneId)
      .set({
        name: typeof userData.name === 'string' ? userData.name : '',
        phoneNumber,
        role: 'admin',
        groupId: null,
        assignedGroupIds,
        status: 'active',
        createdBy: actorUid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        migratedFrom: 'admin_whitelist',
      });
    created += 1;
  }

  // Also migrate plain members that already have a users doc with groupId.
  const users = await db.collection('users').where('role', '==', 'user').get();
  for (const entry of users.docs) {
    const data = entry.data();
    const phoneNumber = typeof data.phoneNumber === 'string' ? data.phoneNumber : '';
    if (!phoneNumber) {
      continue;
    }
    const phoneId = phoneToRosterId(phoneNumber);
    const existing = await db.collection('access_roster').doc(phoneId).get();
    if (existing.exists) {
      skipped += 1;
      continue;
    }
    const groupId = typeof data.groupId === 'string' ? data.groupId : null;
    if (!groupId) {
      continue;
    }
    await db
      .collection('access_roster')
      .doc(phoneId)
      .set({
        name: typeof data.name === 'string' ? data.name : '',
        phoneNumber,
        role: 'user',
        groupId,
        assignedGroupIds: [],
        status: 'active',
        createdBy: actorUid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        migratedFrom: 'users',
      });
    created += 1;
  }

  return { created, skipped };
}

/** Upsert roster from a successful legacy login resolution (auto-migration). */
export async function upsertRosterFromLegacyLogin(input: {
  phoneNumber: string;
  name: string;
  role: 'admin' | 'user';
  groupId: string | null;
  assignedGroupIds: string[];
}) {
  const phoneId = phoneToRosterId(input.phoneNumber);
  const ref = db.collection('access_roster').doc(phoneId);
  const existing = await ref.get();
  if (existing.exists) {
    return;
  }

  await ref.set({
    name: input.name,
    phoneNumber: input.phoneNumber,
    role: input.role,
    groupId: input.role === 'user' ? input.groupId : null,
    assignedGroupIds: input.role === 'admin' ? input.assignedGroupIds : [],
    status: 'active',
    createdBy: 'legacy-login-migration',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    migratedFrom: 'legacy_login',
  });
}
