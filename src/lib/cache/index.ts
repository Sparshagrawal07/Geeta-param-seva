import { Platform } from 'react-native';

import { AsyncStorageCacheDriver } from '@/lib/cache/async-storage-driver';
import { LocalFirstCache } from '@/lib/cache/cache';
import { CACHE_SCOPES } from '@/lib/cache/types';

export * from '@/lib/cache/cache';
export * from '@/lib/cache/driver';
export * from '@/lib/cache/types';

let activeCache: LocalFirstCache | null = null;
let initialization: Promise<LocalFirstCache> | null = null;

async function createCache(): Promise<LocalFirstCache> {
  if (Platform.OS !== 'web') {
    try {
      const { SQLiteCacheDriver } = await import('@/lib/cache/sqlite-driver');
      const sqliteCache = new LocalFirstCache(new SQLiteCacheDriver());
      await sqliteCache.initialize();
      return sqliteCache;
    } catch (error) {
      if (__DEV__) {
        console.warn('SQLite cache unavailable; using AsyncStorage fallback.', error);
      }
    }
  }

  const fallback = new LocalFirstCache(new AsyncStorageCacheDriver());
  await fallback.initialize();
  return fallback;
}

export function initializeLocalCache(): Promise<LocalFirstCache> {
  initialization ??= createCache().then(async (cache) => {
    activeCache = cache;
    await cache.prune();
    return cache;
  });
  return initialization;
}

export async function getLocalCache(): Promise<LocalFirstCache> {
  return activeCache ?? initializeLocalCache();
}

export async function clearSessionCache(): Promise<void> {
  const cache = await getLocalCache();
  await cache.clearScope(CACHE_SCOPES.session);
}

