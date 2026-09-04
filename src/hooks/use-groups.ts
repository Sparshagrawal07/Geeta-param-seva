import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { fetchGroups, fetchGroupsByIds } from '@/services/groups';
import type { Group } from '@/types/group';
import { useLocale } from '@/providers/locale-provider';

/** One-shot fetch + manual refresh — no per-screen realtime listeners. */
export function useGroups() {
  const { profile } = useAuth();
  const { t } = useLocale();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!profile) {
        setGroups([]);
        setLoading(false);
        return;
      }
      const silent = options?.silent ?? false;
      try {
        if (!silent) setLoading(true);
        setError('');
        if (profile.role === 'senior_admin') {
          setGroups(await fetchGroups());
        } else if (profile.role === 'admin' && profile.assignedGroupIds?.length) {
          setGroups(await fetchGroupsByIds(profile.assignedGroupIds));
        } else {
          setGroups([]);
        }
      } catch {
        setError(t('errorGroupsLoad'));
      } finally {
        setLoading(false);
      }
    },
    [profile, t]
  );

  useEffect(() => {
    void refresh({ silent: false });
  }, [refresh]);

  return { groups, loading, error, refresh, setGroups };
}
