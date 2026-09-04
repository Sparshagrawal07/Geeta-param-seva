import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { fetchFeed } from '@/services/feed';
import type { FeedItem } from '@/types/feed';
import { useLocale } from '@/providers/locale-provider';

/** Poll-on-mount / focus refresh — avoids always-on onSnapshot billing. */
export function useFeed(groupId?: string | null) {
  const { t } = useLocale();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      try {
        if (!silent) setLoading(true);
        setError('');
        setItems(await fetchFeed(groupId));
      } catch {
        setError(t('errorFeedLoad'));
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

  const removeItem = useCallback((itemId: string) => {
    setItems((current) => current.filter((item) => item.id !== itemId));
  }, []);

  return { items, loading, error, refresh, removeItem, setItems };
}
