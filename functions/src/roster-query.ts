/**
 * The single source of truth for "who is in this group".
 *
 * People, Dashboard and Practice used to build this list with three different
 * Firestore queries. Two of them ran only on the Cloud Function with no
 * fallback, so a single rejected query (composite index still building, an
 * older roster doc with no `status` field, a stale `groupId` stamp) left the
 * member visible on one screen and invisible on the others. Every caller now
 * goes through this module, so all three screens cannot disagree.
 *
 * Degradation ladder — the first level that returns wins:
 *  1. `groupIds array-contains` UNION `groupId ==`, deduped in memory
 *  2. bounded unfiltered scan, everything filtered in memory
 *
 * Level 1 is a union rather than a single `array-contains` on purpose. A query that
 * *succeeds* but cannot see a legacy doc is far worse than one that fails loudly:
 * `array-contains groupIds` silently skips every roster row written before the
 * backfill, so a half-migrated database would quietly show a short member list with
 * no error anywhere. Unioning in the scalar query covers both shapes during the
 * rollout and is still correct once every row carries `groupIds`.
 */

import { type DocumentData, type Query, type QueryDocumentSnapshot } from 'firebase-admin/firestore';

import { db } from './firebase-admin';
import { readGroupIds, readPrimaryGroupId } from './group-membership';
import { phoneToUid } from './member-identity';

export type RosterRole = 'user' | 'admin';
export type RosterStatus = 'active' | 'inactive';

export interface GroupRosterMember {
  /** access_roster doc id — digits of the phone number. */
  id: string;
  name: string;
  phoneNumber: string;
  /** Stable phone-keyed id; valid before the member has ever signed in. */
  memberKey: string;
  role: RosterRole;
  /** Every group this member belongs to. `groupId` is `groupIds[0]`. */
  groupId: string | null;
  groupIds: string[];
  assignedGroupIds: string[];
  status: RosterStatus;
}

export const ROSTER_SCAN_LIMIT = 500;
export const ROSTER_MAX_PAGE_SIZE = 200;

export function rosterRole(data: DocumentData): RosterRole {
  return data.role === 'admin' ? 'admin' : 'user';
}

export function rosterStatus(data: DocumentData): RosterStatus {
  return data.status === 'inactive' ? 'inactive' : 'active';
}

export function toRosterMember(id: string, data: DocumentData): GroupRosterMember {
  const phoneNumber = typeof data.phoneNumber === 'string' && data.phoneNumber ? data.phoneNumber : `+${id}`;
  return {
    id,
    name: typeof data.name === 'string' ? data.name : '',
    phoneNumber,
    memberKey: phoneToUid(phoneNumber),
    role: rosterRole(data),
    groupId: readPrimaryGroupId(data),
    groupIds: readGroupIds(data),
    assignedGroupIds: Array.isArray(data.assignedGroupIds) ? data.assignedGroupIds.map(String) : [],
    status: rosterStatus(data),
  };
}

export interface RosterFilter {
  groupId: string | null;
  role: RosterRole | 'all';
  status: RosterStatus | 'all';
}

export function matchesRosterFilter(member: GroupRosterMember, filter: RosterFilter): boolean {
  if (filter.groupId && !member.groupIds.includes(filter.groupId)) return false;
  if (filter.role !== 'all' && member.role !== filter.role) return false;
  if (filter.status !== 'all' && member.status !== filter.status) return false;
  return true;
}

async function runQuery(query: Query) {
  try {
    return (await query.get()).docs;
  } catch (error) {
    console.warn('roster_query_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Every roster row that could belong to `groupId`, from either storage shape.
 * Returns null only when *both* queries fail, so the caller can fall back to a scan.
 */
async function runGroupQueries(
  groupId: string,
  limit: number
): Promise<QueryDocumentSnapshot[] | null> {
  const [byArray, byScalar] = await Promise.all([
    runQuery(db.collection('access_roster').where('groupIds', 'array-contains', groupId).limit(limit)),
    runQuery(db.collection('access_roster').where('groupId', '==', groupId).limit(limit)),
  ]);

  if (byArray === null && byScalar === null) {
    return null;
  }

  const byId = new Map<string, QueryDocumentSnapshot>();
  for (const doc of [...(byScalar ?? []), ...(byArray ?? [])]) {
    byId.set(doc.id, doc);
  }
  return [...byId.values()];
}

/**
 * Roster rows for a filter, sorted by name. Degrades instead of failing so a
 * missing index can never blank a screen.
 */
export async function loadRosterMembers(
  filter: RosterFilter,
  limit = ROSTER_SCAN_LIMIT
): Promise<GroupRosterMember[]> {
  let docs = filter.groupId
    ? await runGroupQueries(filter.groupId, limit)
    : await runQuery(db.collection('access_roster').limit(limit));
  if (!docs) {
    docs = await runQuery(db.collection('access_roster').limit(limit));
  }
  if (!docs) return [];

  return docs
    .map((doc) => toRosterMember(doc.id, doc.data() ?? {}))
    .filter((member) => matchesRosterFilter(member, filter))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Active member rows for a group — the list every member-facing screen shows. */
export function loadActiveGroupMembers(groupId: string, limit = ROSTER_SCAN_LIMIT) {
  return loadRosterMembers({ groupId, role: 'all', status: 'active' }, limit);
}

/** Admins assigned to a group (admins carry `assignedGroupIds`, not `groupId`). */
export async function loadGroupAdmins(
  groupId: string,
  status: RosterStatus | 'all' = 'all',
  limit = ROSTER_SCAN_LIMIT
): Promise<GroupRosterMember[]> {
  const docs = await runQuery(
    db
      .collection('access_roster')
      .where('assignedGroupIds', 'array-contains', groupId)
      .limit(limit)
  );
  if (!docs) return [];

  return docs
    .map((doc) => toRosterMember(doc.id, doc.data() ?? {}))
    .filter((member) => {
      if (member.role !== 'admin') return false;
      if (status === 'all') return true;
      return member.status === status;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
