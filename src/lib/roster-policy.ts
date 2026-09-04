import type { RosterRole } from '@/types/roster';
import type { UserRole } from '@/lib/users';

/** Pure authorization helpers mirroring Cloud Function roster rules. */
export function canManageRoster(role: UserRole | null | undefined): boolean {
  return role === 'senior_admin' || role === 'admin';
}

export function canAddRosterRole(
  actorRole: UserRole | null | undefined,
  targetRole: RosterRole
): boolean {
  if (actorRole === 'senior_admin') {
    return targetRole === 'user' || targetRole === 'admin';
  }
  if (actorRole === 'admin') {
    return targetRole === 'user';
  }
  return false;
}

export function canAssignRosterGroups(
  actorRole: UserRole | null | undefined,
  actorAssignedGroupIds: string[] | undefined,
  targetGroupIds: string[]
): boolean {
  if (actorRole === 'senior_admin') {
    return targetGroupIds.length > 0;
  }
  if (actorRole === 'admin') {
    const assigned = new Set(actorAssignedGroupIds ?? []);
    return targetGroupIds.length > 0 && targetGroupIds.every((id) => assigned.has(id));
  }
  return false;
}
