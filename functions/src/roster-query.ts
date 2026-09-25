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
 *  1. `groupId` + `status` equality (cheapest, needs a composite index)
 *  2. `groupId` only, status/role defaulted in memory (single-field index only)
 *  3. bounded unfiltered scan, everything filtered in memory
 */

import { type DocumentData, type Query } from 'firebase-admin/firestore';

import { db } from './firebase-admin';
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
  groupId: string | null;
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
    groupId: typeof data.groupId === 'string' ? data.groupId : null,
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
  if (filter.groupId && member.groupId !== filter.groupId) return false;
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
 * Roster rows for a filter, sorted by name. Degrades instead of failing so a
 * missing index can never blank a screen.
 */
export async function loadRosterMembers(
  filter: RosterFilter,
  limit = ROSTER_SCAN_LIMIT
): Promise<GroupRosterMember[]> {
  const scoped = filter.groupId
    ? db.collection('access_roster').where('groupId', '==', filter.groupId)
    : db.collection('access_roster');

  let docs = await runQuery(scoped.limit(limit));
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
