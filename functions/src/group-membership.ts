/**
 * One place that knows how a member's group membership is stored.
 *
 * `groupIds` is the source of truth for which groups a member belongs to. It was
 * introduced next to the older scalar `groupId`, which is kept as the *primary*
 * group so every existing reader keeps working unchanged: the Firestore rules, the
 * exports, and the client's single currently-selected group.
 *
 * Invariant maintained by every write: `groupId === groupIds[0]`.
 *
 * Reads are tolerant in both directions on purpose. A doc written before the
 * array existed has only `groupId`; a doc written by a newer deploy has both. Both
 * shapes must resolve to the same membership, otherwise a backfill that has only
 * half-run would silently drop people from a group.
 */

import { db } from './firebase-admin';

export function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** De-dupe while preserving order — the first entry is the primary group. */
export function normalizeGroupIds(input: unknown): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of readStringArray(input)) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Every group a member belongs to, from either storage shape. */
export function readGroupIds(data: unknown): string[] {
  if (!data || typeof data !== 'object') {
    return [];
  }
  const doc = data as Record<string, unknown>;
  const list = normalizeGroupIds(doc.groupIds);
  if (list.length > 0) {
    return list;
  }
  const single = typeof doc.groupId === 'string' ? doc.groupId.trim() : '';
  return single ? [single] : [];
}

/** The group a member lands on by default. Always `groupIds[0]`. */
export function readPrimaryGroupId(data: unknown): string | null {
  return readGroupIds(data)[0] ?? null;
}

export function memberBelongsToGroup(data: unknown, groupId: string): boolean {
  if (!groupId) return false;
  return readGroupIds(data).includes(groupId);
}

/** Groups this member belongs to but is no longer in — used to fix `memberCount`. */
export function removedGroupIds(previous: string[], next: string[]): string[] {
  const keep = new Set(next);
  return previous.filter((groupId) => !keep.has(groupId));
}

/** Groups this member has just joined — used to fix `memberCount`. */
export function addedGroupIds(previous: string[], next: string[]): string[] {
  const had = new Set(previous);
  return next.filter((groupId) => !had.has(groupId));
}

/** Both storage fields for a member, ready to merge into a payload. */
export function groupFieldsFor(groupIds: string[]): { groupId: string | null; groupIds: string[] } {
  const ids = normalizeGroupIds(groupIds);
  return { groupId: ids[0] ?? null, groupIds: ids };
}

/**
 * Resolve which of a member's group ids are real, and what they are called.
 *
 * Two problems solved at once:
 *
 *  - A membership pointing at a group document that no longer exists is dropped, so
 *    a stale id cannot leave a member with a permanently unopenable "group" in their
 *    switcher.
 *  - The names are returned so they can be stamped onto the member's profile. The
 *    client then always has a real name to show, instead of depending on a separate
 *    read of each group document that can fail or be denied.
 *
 * A group whose document exists but carries no usable name is kept (the member does
 * belong to it) and simply omitted from the name map.
 */
export async function resolveMemberships(
  groupIds: string[]
): Promise<{ groupIds: string[]; groupNames: Record<string, string> }> {
  const ids = normalizeGroupIds(groupIds);
  if (ids.length === 0) return { groupIds: [], groupNames: {} };

  const refs = ids.map((id) => db.collection('groups').doc(id));
  const snaps = await db.getAll(...refs);

  const existing: string[] = [];
  const groupNames: Record<string, string> = {};
  snaps.forEach((snap, index) => {
    if (!snap.exists) return;
    const id = ids[index];
    if (!id) return;
    existing.push(id);
    const name = snap.data()?.name;
    if (typeof name === 'string' && name.trim()) {
      groupNames[id] = name.trim();
    }
  });

  return { groupIds: existing, groupNames };
}
