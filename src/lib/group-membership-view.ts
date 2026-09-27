/**
 * Which groups an account's group switcher should offer.
 *
 * Membership is authoritative and comes from the profile; the group documents only
 * supply display names. These helpers are kept free of React so the rules can be
 * tested directly — the switcher silently disappearing is the exact failure they
 * exist to prevent.
 */

import type { Group } from '@/types/group';

/** A group the account belongs to but whose document could not be read. */
function placeholderGroup(id: string, label: string): Group {
  return {
    id,
    // A raw document id is not a name. Showing it read as a bug on screen, so an
    // unreadable group is labelled honestly and the id stays out of the label.
    name: label,
    createdAt: new Date(0),
    createdBy: '',
  };
}

/**
 * Union of the groups whose documents loaded and the groups the account belongs to.
 *
 * This has to be a union, not a fallback. Treating it as "use the loaded list, or
 * else invent one" meant that a member in two groups whose *second* group document
 * failed to read was left with a single group — so the switcher never appeared and
 * the member could not reach their other group at all.
 *
 * Names resolve in order: the freshly read document, then the name the server
 * stamped on the profile, and only then a placeholder. The stamped name is what
 * makes the switcher reliable — a group whose document cannot be read from the
 * client still shows its real name.
 *
 * Order follows the membership list, not the document dates: the first entry is the
 * primary group, and the server guarantees `groupId === groupIds[0]`.
 *
 * @param stampedNames group id → name, as written by the server
 * @param unreadableLabel last-resort label, when no name is available at all
 */
export function mergeMembershipGroups(
  loaded: Group[],
  membershipIds: string[],
  stampedNames: Record<string, string> = {},
  unreadableLabel = 'Group'
): { groups: Group[]; unnamedGroupIds: string[] } {
  const byId = new Map<string, Group>();
  for (const group of loaded) {
    byId.set(group.id, group);
  }
  // Preserve membership order, then append anything loaded that is not a membership
  // (a senior admin sees every group).
  const ordered: Group[] = [];
  const unnamedGroupIds: string[] = [];
  const seen = new Set<string>();
  for (const id of membershipIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    const group = byId.get(id);
    if (group) {
      ordered.push(group);
      continue;
    }
    const stamped = stampedNames[id]?.trim();
    if (!stamped) unnamedGroupIds.push(id);
    ordered.push(
      placeholderGroup(id, stamped || unreadableLabel)
    );
  }
  for (const group of loaded) {
    if (seen.has(group.id)) continue;
    seen.add(group.id);
    ordered.push(group);
  }
  return { groups: ordered, unnamedGroupIds };
}

/**
 * The ids the account may select, derived from its role.
 *
 * Admins manage `assignedGroupIds`; members belong to `groupIds` (or the legacy
 * scalar `groupId`). Returns a stable, de-duplicated, order-preserving list.
 */
export function membershipIdsFor(input: {
  role?: string | null;
  groupId?: string | null;
  groupIds?: string[];
  assignedGroupIds?: string[];
}): string[] {
  if (input.role === 'senior_admin' || input.role === 'admin') {
    return dedupe(input.assignedGroupIds ?? []);
  }
  const list = Array.isArray(input.groupIds)
    ? input.groupIds.filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
    : [];
  if (list.length > 0) return dedupe(list);
  return typeof input.groupId === 'string' && input.groupId ? [input.groupId] : [];
}

function dedupe(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    const trimmed = typeof id === 'string' ? id.trim() : '';
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}
