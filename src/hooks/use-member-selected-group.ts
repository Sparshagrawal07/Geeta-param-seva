import { useAuth } from '@/hooks/use-auth';
import { useGroups } from '@/hooks/use-groups';
import { useSelectedGroup } from '@/hooks/use-selected-group';
import { membershipIdsFor, mergeMembershipGroups } from '@/lib/group-membership-view';
import { useLocale } from '@/providers/locale-provider';
import type { Group } from '@/types/group';

interface MemberSelectedGroup {
  /** Every group the account belongs to, named where the document could be read. */
  groups: Group[];
  groupId: string | null;
  setGroupId: (id: string | null) => Promise<void>;
  /** Memberships with no readable document and no stamped name. */
  unnamedGroupIds: string[];
}

/**
 * The member's active group, resolved from their memberships.
 *
 * Screens that show group-scoped content use this instead of `profile.groupId`
 * directly: for a member in more than one group the group they are looking at is a
 * choice, not a property of the profile, and the choice has to survive navigation.
 */
export function useMemberSelectedGroup(): MemberSelectedGroup {
  const { profile } = useAuth();
  const { t } = useLocale();
  const { groups: loadedGroups } = useGroups();

  const membershipIds = membershipIdsFor({
    role: profile?.role,
    groupId: profile?.groupId ?? null,
    groupIds: profile?.groupIds,
    assignedGroupIds: profile?.assignedGroupIds,
  });

  // Merged before selection so the switcher and the persisted choice both see every
  // group the account belongs to, not only the ones that happened to load. The
  // server-stamped names keep every option labelled even when a group document
  // cannot be read from the client.
  const { groups, unnamedGroupIds } = mergeMembershipGroups(
    loadedGroups,
    membershipIds,
    profile?.groupNames ?? {},
    t('groupNameUnavailable')
  );
  const { selectedGroupId, setSelectedGroupId } = useSelectedGroup(groups);

  return {
    groups,
    groupId: selectedGroupId,
    setGroupId: setSelectedGroupId,
    unnamedGroupIds,
  };
}
