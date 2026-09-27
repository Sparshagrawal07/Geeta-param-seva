import { profileGroupIds } from '@/lib/users';

interface ScopedMember {
  role: 'senior_admin' | 'admin' | 'user';
  groupId?: string | null;
  groupIds?: string[];
  assignedGroupIds?: string[];
}

/** Filter members to a group scope. */
export function filterMembersByScope<T extends ScopedMember>(
  members: T[],
  scopeGroupIds?: string[]
): T[] {
  if (scopeGroupIds === undefined) {
    return members;
  }

  if (scopeGroupIds.length === 0) {
    return [];
  }

  return members.filter(
    (member) =>
      (member.role === 'user' &&
        profileGroupIds(member).some((groupId) => scopeGroupIds.includes(groupId))) ||
      (member.role === 'admin' &&
        member.assignedGroupIds?.some((groupId) => scopeGroupIds.includes(groupId))) ||
      member.role === 'senior_admin'
  );
}
