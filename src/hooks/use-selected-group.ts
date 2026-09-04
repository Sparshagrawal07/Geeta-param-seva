import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { isSeniorAdmin } from '@/lib/users';
import type { Group } from '@/types/group';

import { SELECTED_GROUP_STORAGE_KEY } from '@/lib/session';

/**
 * Persists the currently active group for admins managing multiple groups.
 * Senior admins default to the first group when none is persisted.
 * Regular admins default to their first assigned group.
 */
export function useSelectedGroup(groups: Group[]) {
  const { profile } = useAuth();
  const [selectedGroupId, setSelectedGroupIdState] = useState<string | null>(null);

  useEffect(() => {
    if (groups.length === 0) return;

    const load = async () => {
      const stored = await AsyncStorage.getItem(SELECTED_GROUP_STORAGE_KEY);
      if (stored && groups.some((g) => g.id === stored)) {
        setSelectedGroupIdState(stored);
        return;
      }

      // Fall back to first available group
      const defaultId = isSeniorAdmin(profile?.role)
        ? (groups[0]?.id ?? null)
        : (profile?.assignedGroupIds?.[0] ?? groups[0]?.id ?? null);

      setSelectedGroupIdState(defaultId);
    };

    void load();
  }, [groups, profile]);

  const setSelectedGroupId = useCallback(async (id: string | null) => {
    setSelectedGroupIdState(id);
    if (id) {
      await AsyncStorage.setItem(SELECTED_GROUP_STORAGE_KEY, id);
    } else {
      await AsyncStorage.removeItem(SELECTED_GROUP_STORAGE_KEY);
    }
  }, []);

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
