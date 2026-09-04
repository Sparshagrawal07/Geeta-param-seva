import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { fetchNotifications } from '@/services/notifications';
import type { AppNotification } from '@/types/feed';
import { useLocale } from '@/providers/locale-provider';

/** Poll on mount / app resume — no always-on listener. */
export function useNotifications(groupId?: string | null) {
  const { t } = useLocale();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      try {
        if (!silent) setLoading(true);
        setError('');
        setItems(await fetchNotifications(groupId));
      } catch (error) {
        console.warn('[notifications] load failed', error);
        setError(t('errorNotificationsLoad'));
      } finally {
        setLoading(false);
      }
    },
    [groupId, t]
  );

  useEffect(() => {
    void refresh({ silent: false });
  }, [refresh]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh({ silent: true });
    });
    return () => sub.remove();
  }, [refresh]);

  return { items, loading, error, refresh };
}
