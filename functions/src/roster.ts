import { FieldPath, FieldValue, type DocumentData, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

import { adminAuth, db } from './firebase-admin';
import {
  addedGroupIds,
  groupFieldsFor,
  normalizeGroupIds,
  readGroupIds,
  readPrimaryGroupId,
  removedGroupIds,
  resolveMemberships,
} from './group-membership';
import { findUserDocIdsByPhone, phoneToRosterId, phoneToUid } from './member-identity';
import { carryMemberPracticeGroups, pruneMemberPracticeGroups } from './practice';
import { reindexUserPushTokens } from './push';
import {
  loadGroupAdmins,
  loadRosterMembers,
  ROSTER_MAX_PAGE_SIZE,
  ROSTER_SCAN_LIMIT,
  type GroupRosterMember,
} from './roster-query';
import { revokeAllUserSessions } from './sessions';

export { phoneToRosterId };

export type RosterRole = 'user' | 'admin';
export type RosterStatus = 'active' | 'inactive';

export interface AccessRosterEntry {
  name: string;
  phoneNumber: string;
  role: RosterRole;
  /** Primary group, kept in sync with `groupIds[0]` for legacy readers. */
  groupId?: string | null;
  /** Every group this member belongs to. Empty for admins (see `assignedGroupIds`). */
  groupIds?: string[];
  assignedGroupIds?: string[];
  status: RosterStatus;
  createdBy: string;
}

/** Indian mobile numbers, which is every number this app accepts. */
const DEFAULT_COUNTRY_CODE = '91';
const INDIA_MOBILE_LENGTH = 10;

/**
 * Collapse the many ways a human types the same number onto one stored value.
 *
 * `+9876543210` and `+919876543210` are the same person, but they produced two
 * different `access_roster` doc ids (`phoneToRosterId` strips the `+` and keeps
 * every digit), so the same human could exist twice in one group with two rosters,
 * two assignments and two completion histories. Normalising to `+91` on the way in
 * means the duplicate can no longer be created.
 */
function normalizeRosterPhone(input: unknown): string {
  if (typeof input !== 'string') {
    throw new HttpsError('invalid-argument', 'Phone number is required.');
  }
  const compact = input.trim().replace(/[\s()-]/g, '');
  const withPlus = compact.startsWith('+') ? compact : `+${compact.replace(/\+/g, '')}`;
  if (!/^\+[1-9]\d{7,14}$/.test(withPlus)) {
    throw new HttpsError('invalid-argument', 'Enter a valid mobile number.');
  }

  const digits = withPlus.slice(1);
  if (digits.length === INDIA_MOBILE_LENGTH) {
    return `+${DEFAULT_COUNTRY_CODE}${digits}`;
  }
  // A number that already carries a country code is left alone: guessing would be
  // worse than storing what the admin typed.
  return withPlus;
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
    groupId: readPrimaryGroupId(data),
    groupIds: readGroupIds(data),
    assignedGroupIds: Array.isArray(data.assignedGroupIds) ? data.assignedGroupIds.map(String) : [],
    status: data.status === 'inactive' ? 'inactive' : 'active',
    createdBy: typeof data.createdBy === 'string' ? data.createdBy : undefined,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
  };
}

function serializeRosterEntry(member: GroupRosterMember) {
  return {
    id: member.id,
    name: member.name,
    phoneNumber: member.phoneNumber,
    role: member.role,
    groupId: member.groupId,
    groupIds: member.groupIds,
    assignedGroupIds: member.assignedGroupIds,
    status: member.status,
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
  const pageSize = Math.min(Math.max(Number(input.pageSize) || 50, 1), ROSTER_MAX_PAGE_SIZE);

  if (groupId) {
    assertCallerCanTouchGroups(caller, [groupId]);
  } else if (caller.role !== 'senior_admin') {
    throw new HttpsError('invalid-argument', 'Group is required.');
  }

  const scanLimit = Math.max(pageSize, ROSTER_SCAN_LIMIT);
  const byId = new Map<string, ReturnType<typeof serializeRosterEntry>>();

  if (!groupId || role !== 'admin') {
    const members = await loadRosterMembers({ groupId: groupId || null, role, status }, scanLimit);
    for (const member of members) {
      byId.set(member.id, serializeRosterEntry(member));
    }
  }

  if (groupId && (role === 'all' || role === 'admin')) {
    for (const member of await loadGroupAdmins(groupId, status, scanLimit)) {
      byId.set(member.id, serializeRosterEntry(member));
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
    total: entries.length,
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

/**
 * Queries here deliberately avoid `orderBy` and are re-filtered in memory.
 *
 * Two failure modes made a freshly added member "not appear at all":
 *  - a composite index that had not finished building, and
 *  - older roster docs with no `status` field, which a `status == 'active'`
 *    filter silently drops.
 * `roster-query` owns that degradation ladder so People, Dashboard and Practice
 * all resolve the same member set.
 */

async function assertGroupsExist(groupIds: string[]) {
  const snaps = await Promise.all(groupIds.map((groupId) => db.collection('groups').doc(groupId).get()));
  for (let i = 0; i < snaps.length; i++) {
    if (!snaps[i]!.exists) {
      throw new HttpsError('not-found', `Group not found: ${groupIds[i]}`);
    }
  }
}

/** Every Auth uid that has ever signed in with this phone number. */
async function listAuthUidsForPhone(phoneNumber: string): Promise<string[]> {
  const uids = new Set<string>();
  try {
    const authUser = await adminAuth.getUserByPhoneNumber(phoneNumber);
    uids.add(authUser.uid);
  } catch {
    // Member has never signed in — nothing to sync yet.
  }
  for (const uid of await findUserDocIdsByPhone(phoneNumber)) {
    uids.add(uid);
  }
  return [...uids];
}

/**
 * Group names for a set of groups, for stamping onto a member's profile.
 *
 * The member's switcher needs a label for every group they belong to. Reading the
 * group documents again from the client is not dependable — a single denied or
 * missing document would leave that group unlabelled — so the names are resolved
 * here, where the Admin SDK is already reading the groups for validation.
 */
async function resolveGroupNames(groupIds: string[]): Promise<Record<string, string>> {
  const { groupNames } = await resolveMemberships(groupIds);
  return groupNames;
}

/**
 * Push a roster decision straight onto the member's `users` profile.
 *
 * Firestore rules (and the client's group scoping) read role / groupId /
 * assignedGroupIds from `users`, not from `access_roster`. Without this the
 * profile only catches up the next time the member signs in, which is why an
 * admin's change looked like it "took effect only after reopening the app".
 */
async function syncAuthProfilesForPhone(input: {
  phoneNumber: string;
  name: string;
  role: RosterRole;
  groupId: string | null;
  groupIds: string[];
  assignedGroupIds: string[];
  status: RosterStatus;
  hasPersonalPin: boolean;
}): Promise<string[]> {
  // A senior admin's authority lives in `senior_admins`; never let a roster row
  // downgrade their profile.
  const seniorSnap = await db
    .collection('senior_admins')
    .doc(phoneToRosterId(input.phoneNumber))
    .get()
    .catch(() => null);
  if (seniorSnap?.exists) return [];

  const uids = await listAuthUidsForPhone(input.phoneNumber);
  if (uids.length === 0) return [];

  const profilePatch: Record<string, unknown> = {
    phoneNumber: input.phoneNumber,
    role: input.role,
    groupId: input.role === 'user' ? input.groupId : null,
  // `groupIds` drives multi-group access; `groupId` stays the primary so the
  // client's single selected group and every legacy reader keep working.
  groupIds: input.role === 'user' ? input.groupIds : [],
  // Names travel with the membership, so the member's group switcher can label every
  // group without a separate read of each group document.
  groupNames: input.role === 'user' ? await resolveGroupNames(input.groupIds) : {},
    // Mirrored so Firestore rules can recognise a member's own practice
    // assignment doc by memberKey now that the doc id carries the group too.
    memberKey: phoneToUid(input.phoneNumber),
    assignedGroupIds: input.role === 'admin' ? input.assignedGroupIds : [],
    hasPersonalPin: input.hasPersonalPin,
    // Mirrors upsertProfileFromLogin so the profile stays identical whichever
    // path wrote it last. Only read as a protected field by the rules.
    whitelistKey: input.role === 'admin' ? phoneToRosterId(input.phoneNumber) : null,
    rosterStatus: input.status,
    rosterUpdatedAt: FieldValue.serverTimestamp(),
  };
  if (input.name) profilePatch.name = input.name;
  if (input.status === 'inactive') {
    // Deactivated members lose group read access immediately (rules check
    // `groupIds`), and the restored value is written again on reactivation.
    profilePatch.groupId = null;
    profilePatch.groupIds = [];
    profilePatch.assignedGroupIds = [];
  }

  await Promise.all(
    uids.map((uid) =>
      db
        .collection('users')
        .doc(uid)
        .set(profilePatch, { merge: true })
        .catch((error) => {
          console.warn('roster_profile_sync_failed', { uid, error });
        })
    )
  );

  return uids;
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
  groupIds?: unknown;
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
  let groupIds: string[] = [];
  let assignedGroupIds: string[] = [];

  if (role === 'user') {
    // `groupIds` is the input; `groupId` is still accepted so an older client build
    // (which can only send one group) keeps working.
    const requested = normalizeGroupIds(input.groupIds);
    const single = typeof input.groupId === 'string' ? input.groupId.trim() : '';
    const resolved = requested.length > 0 ? requested : single ? [single] : [];

    if (resolved.length === 0) {
      throw new HttpsError('invalid-argument', 'Select at least one group for the member.');
    }
    assertCallerCanTouchGroups(caller, resolved);
    await assertGroupsExist(resolved);
    // Order is the admin's, and `groupId` mirrors the first entry, so the member
    // lands on the group the admin listed first.
    groupIds = resolved;
    groupId = resolved[0]!;
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
  const previousStatus = previous.status === 'inactive' ? 'inactive' : existing.exists ? 'active' : null;
  const previousGroupIds = readGroupIds(previous);
  const hasPersonalPin = typeof previous.pinHash === 'string' && previous.pinHash.length > 0;

  const payload: Record<string, unknown> = {
    name,
    nameLower: name.toLowerCase(),
    phoneNumber,
    role,
    groupId,
    groupIds,
    assignedGroupIds,
    status,
    hasPersonalPin,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (!existing.exists) {
    payload.createdBy = input.actorUid;
    payload.createdAt = FieldValue.serverTimestamp();
  }

  await ref.set(payload, { merge: true });

  // Maintain cheap memberCount counters on groups (active members only).
  // Compared as sets because a member can now join or leave several groups in one
  // edit, and only the groups they actually joined or left may move a counter.
  const countedGroups = status === 'active' ? groupIds : [];
  const countedGroupsBefore = previousStatus === 'active' ? previousGroupIds : [];
  const joined = addedGroupIds(countedGroupsBefore, countedGroups);
  const left = removedGroupIds(countedGroupsBefore, countedGroups);

  for (const groupIdLeft of left) {
    await db
      .collection('groups')
      .doc(groupIdLeft)
      .set({ memberCount: FieldValue.increment(-1), statsUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  for (const groupIdJoined of joined) {
    await db
      .collection('groups')
      .doc(groupIdJoined)
      .set({ memberCount: FieldValue.increment(1), statsUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }

  // Keep already-signed-in profiles in step with the roster so the member sees
  // the new name / groups on their next read instead of after a fresh sign-in.
  const syncedUids = await syncAuthProfilesForPhone({
    phoneNumber,
    name,
    role,
    groupId,
    groupIds,
    assignedGroupIds,
    status,
    hasPersonalPin,
  });

  // A group move leaves the old group's push-token index behind. Re-index every
  // known device so reminders reach the member under their new group.
  const groupSetChanged =
    previousGroupIds.length > 0 && previousGroupIds.join('|') !== groupIds.join('|');
  if (groupSetChanged) {
    await Promise.all(
      syncedUids.map((uid) =>
        reindexUserPushTokens(uid).catch((error) => {
          console.warn('roster_push_reindex_failed', { uid, error });
        })
      )
    );
  }

  // A move must not cost the member the plan they were already given, so carry it
  // across first, then drop it from the groups they left. Their *completion
  // history* is never touched, so the leaving groups' reports keep their rows.
  if (left.length > 0 && joined.length > 0) {
    await carryMemberPracticeGroups({
      phoneNumber,
      fromGroupIds: left,
      toGroupIds: joined,
      actorUid: input.actorUid,
    }).catch((error) => {
      console.warn('roster_practice_carry_failed', { phoneNumber, left, joined, error });
    });
  }
  if (left.length > 0) {
    await pruneMemberPracticeGroups({
      phoneNumber,
      groupIds: left,
      actorUid: input.actorUid,
    }).catch((error) => {
      console.warn('roster_practice_prune_failed', { phoneNumber, groupIds: left, error });
    });
  }

  const saved = await ref.get();
  return {
    ...serializeRosterDoc(phoneId, saved.data() ?? {}),
    created: !existing.exists,
  };
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
    const groupIds = readGroupIds(data);
    if (groupIds.length > 0) {
      assertCallerCanTouchGroups(caller, groupIds);
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

  const wasActiveMember = role === 'user' && data.status !== 'inactive';
  const groupIdsAtDeactivation = readGroupIds(data);

  await ref.set(
    {
      status: 'inactive',
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // A deactivated member leaves *every* group they were counted in, not just the
  // primary one, or the per-group counters drift apart from the roster.
  if (wasActiveMember) {
    for (const groupId of groupIdsAtDeactivation) {
      await db
        .collection('groups')
        .doc(groupId)
        .set({ memberCount: FieldValue.increment(-1), statsUpdatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
  }

  // End any live sessions immediately so deactivated accounts lose access now,
  // and drop the group grants from the profile so Firestore rules stop serving
  // this member's group content on the device they are holding.
  const revokedUids: string[] = [];
  try {
    const authUser = await adminAuth.getUserByPhoneNumber(phoneNumber);
    await revokeAllUserSessions(authUser.uid);
    revokedUids.push(authUser.uid);
  } catch {
    const usersSnap = await db
      .collection('users')
      .where('phoneNumber', '==', phoneNumber)
      .limit(1)
      .get();
    if (!usersSnap.empty) {
      await revokeAllUserSessions(usersSnap.docs[0]!.id);
      revokedUids.push(usersSnap.docs[0]!.id);
    }
  }

  await syncAuthProfilesForPhone({
    phoneNumber,
    name: typeof data.name === 'string' ? data.name : '',
    role,
    groupId: null,
    groupIds: [],
    assignedGroupIds: [],
    status: 'inactive',
    hasPersonalPin: typeof data.pinHash === 'string' && data.pinHash.length > 0,
  });

  return { id: phoneId, status: 'inactive' as const, revokedUids };
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
        groupIds: [],
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
    const groupIds = readGroupIds(data);
    if (groupIds.length === 0) {
      continue;
    }
    await db
      .collection('access_roster')
      .doc(phoneId)
      .set({
        name: typeof data.name === 'string' ? data.name : '',
        phoneNumber,
        role: 'user',
        groupId: groupIds[0]!,
        groupIds,
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

/**
 * The `memberKey` a profile is missing, or null when it already matches.
 *
 * Only real members get one — an admin or senior admin has no member alias, and
 * stamping one on them would let a member-key rule match an admin's assignments.
 */
function memberKeyPatchFor(data: Record<string, unknown>): { memberKey: string } | null {
  const phoneNumber = typeof data.phoneNumber === 'string' ? data.phoneNumber.trim() : '';
  if (!phoneNumber) return null;
  const role = typeof data.role === 'string' ? data.role : 'user';
  if (role === 'admin' || role === 'senior_admin') return null;
  if (readGroupIds(data).length === 0) return null;

  const memberKey = phoneToUid(phoneNumber);
  return data.memberKey === memberKey ? null : { memberKey };
}

/**
 * Backfill `groupIds` on every roster row and profile that only has the scalar
 * `groupId`, so `groupIds array-contains` queries and the new rules can rely on it.
 *
 * Idempotent and safe to re-run: a doc is only touched when the two disagree, and
 * `groupId` is written as `groupIds[0]` so the legacy field keeps its meaning.
 * Senior admin only — it rewrites access for every member in the app.
 */
export async function backfillGroupIds(actorUid: string) {
  const caller = await assertCallerCanManageRoster(actorUid);
  if (caller.role !== 'senior_admin') {
    throw new HttpsError('permission-denied', 'Senior admin only.');
  }

  let scanned = 0;
  let updated = 0;

  const syncCollection = async (collectionName: string) => {
    let lastDoc: QueryDocumentSnapshot | null = null;
    for (;;) {
      let query = db.collection(collectionName).orderBy(FieldPath.documentId()).limit(200);
      if (lastDoc) {
        query = query.startAfter(lastDoc);
      }
      const snap = await query.get();
      if (snap.empty) return;

      const batch = db.batch();
      let batchCount = 0;
      for (const doc of snap.docs) {
        lastDoc = doc;
        scanned += 1;
        const data = doc.data() ?? {};
        const stored = Array.isArray(data.groupIds)
          ? data.groupIds.filter((id): id is string => typeof id === 'string')
          : null;
        const scalar = typeof data.groupId === 'string' ? data.groupId.trim() : '';
        // Profiles also need the memberKey, because the transitional rules identify
        // an assignment owner by it before the client has ever re-signed-in.
        const memberKeyPatch =
          collectionName === 'users' ? memberKeyPatchFor(data) : null;

        if (stored !== null) {
          // Already has the array — only fix a drifted primary.
          const primary = stored[0] ?? scalar ?? null;
          if (stored.length > 0 && primary === data.groupId && !memberKeyPatch) continue;
          if (stored.length === 0 && !scalar && !memberKeyPatch) continue;
          batch.set(
            doc.ref,
            {
              ...groupFieldsFor(stored.length > 0 ? stored : scalar ? [scalar] : []),
              ...memberKeyPatch,
            },
            { merge: true }
          );
        } else {
          // Legacy row: derive the array from the scalar.
          if (!scalar && !memberKeyPatch) continue;
          batch.set(
            doc.ref,
            { ...groupFieldsFor(scalar ? [scalar] : []), ...memberKeyPatch },
            { merge: true }
          );
        }
        batchCount += 1;
        updated += 1;
      }

      if (batchCount > 0) {
        await batch.commit();
      }
    }
  };

  await syncCollection('access_roster');
  await syncCollection('users');

  return { scanned, updated };
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

  const memberGroups = input.role === 'user' && input.groupId ? [input.groupId] : [];

  await ref.set({
    name: input.name,
    phoneNumber: input.phoneNumber,
    role: input.role,
    groupId: input.role === 'user' ? input.groupId : null,
    groupIds: memberGroups,
    assignedGroupIds: input.role === 'admin' ? input.assignedGroupIds : [],
    status: 'active',
    createdBy: 'legacy-login-migration',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    migratedFrom: 'legacy_login',
  });
}
