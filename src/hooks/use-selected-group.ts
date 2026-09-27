import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { isAdminRole, profileGroupIds } from '@/lib/users';
import type { Group } from '@/types/group';

import { selectedGroupStorageKey } from '@/lib/session';

/**
 * The current group is stored per account, not as one device-wide value: two
 * people sharing a phone must not inherit each other's group, and the first
 * launch has to resolve before any write happens.
 */

/**
 * Persists the currently active group for admins managing multiple groups, and for
 * members who belong to more than one group.
 *
 * The default is the profile's first group — `groupIds[0]`, which the server
 * guarantees is the primary group — then the first group in the loaded list. A
 * persisted selection is dropped if the account is no longer in that group, so
 * removing a member from a group cannot leave them stuck on it.
 */
export function useSelectedGroup(groups: Group[]) {
  const { profile } = useAuth();
  const uid = profile?.uid ?? null;
  const defaultGroupId = isAdminRole(profile?.role)
    ? (profile?.assignedGroupIds?.[0] ?? null)
    : (profileGroupIds(profile ?? {})[0] ?? null);
  const [selectedGroupId, setSelectedGroupIdState] = useState<string | null>(null);

  /**
   * A member's own groups are known from their profile, so the active group is
   * resolved from that and does not wait on the group documents. Waiting made the
   * member's screen show "no group assigned" for as long as the group fetch took —
   * and forever if it failed — even though the profile plainly listed two groups.
   */
  const candidateIds = groups.length > 0 ? groups.map((g) => g.id) : null;
  const availableKey = (candidateIds ?? profileGroupIds(profile ?? {})).join('|');
  // Rebuilt only when the membership set actually changes, so the effect below can
  // depend on a stable value instead of a fresh array on every render.
  const availableIds = useMemo(() => availableKey.split('|').filter(Boolean), [availableKey]);

  useEffect(() => {
    if (!uid || availableIds.length === 0) return;

    let active = true;
    const load = async () => {
      const stored = await AsyncStorage.getItem(selectedGroupStorageKey(uid));
      if (!active) return;
      if (stored && availableIds.includes(stored)) {
        setSelectedGroupIdState(stored);
        return;
      }

      // Fall back to first available group
      const fallback =
        defaultGroupId && availableIds.includes(defaultGroupId)
          ? defaultGroupId
          : (availableIds[0] ?? null);

      setSelectedGroupIdState(fallback);
    };

    void load();
    return () => {
      active = false;
    };
  }, [availableIds, defaultGroupId, uid]);

  const setSelectedGroupId = useCallback(
    async (id: string | null) => {
      setSelectedGroupIdState(id);
      if (!uid) return;
      if (id) {
        await AsyncStorage.setItem(selectedGroupStorageKey(uid), id);
      } else {
        await AsyncStorage.removeItem(selectedGroupStorageKey(uid));
      }
    },
    [uid]
  );

  const selectedGroup =
    (selectedGroupId ? groups.find((g) => g.id === selectedGroupId) : null) ??
    groups[0] ??
    null;

  return {
    selectedGroup,
    selectedGroupId: selectedGroupId ?? selectedGroup?.id ?? null,
    setSelectedGroupId,
  };
}
