import AsyncStorage from '@react-native-async-storage/async-storage';

import type { CacheDriver } from '@/lib/cache/driver';
import type {
  CacheEntryRecord,
  MutationOutboxRecord,
  OutboxListOptions,
} from '@/lib/cache/types';

const STORAGE_KEY = 'app.local-cache.fallback.v1';

interface StoredCache {
  version: 1;
  entries: Record<string, CacheEntryRecord>;
  outbox: Record<string, MutationOutboxRecord>;
}

function emptyCache(): StoredCache {
  return { version: 1, entries: {}, outbox: {} };
}

function entryId(scope: string, key: string): string {
  return JSON.stringify([scope, key]);
}

export class AsyncStorageCacheDriver implements CacheDriver {
  private queue: Promise<unknown> = Promise.resolve();

  async initialize(): Promise<void> {
    await this.read();
  }

  async getCacheEntry(scope: string, key: string): Promise<CacheEntryRecord | null> {
    return this.serialized(async () => {
      const state = await this.read();
      return state.entries[entryId(scope, key)] ?? null;
    });
  }

  async setCacheEntry(entry: CacheEntryRecord): Promise<void> {
    await this.mutate((state) => {
      state.entries[entryId(entry.scope, entry.key)] = entry;
    });
  }

  async removeCacheEntry(scope: string, key: string): Promise<void> {
    await this.mutate((state) => {
      delete state.entries[entryId(scope, key)];
    });
  }

  async clearScope(scope: string): Promise<void> {
    await this.mutate((state) => {
      for (const [id, entry] of Object.entries(state.entries)) {
        if (entry.scope === scope) delete state.entries[id];
      }
      for (const [id, mutation] of Object.entries(state.outbox)) {
        if (mutation.scope === scope) delete state.outbox[id];
      }
    });
  }

  async prune(now: number, maxEntries: number, limit: number): Promise<number> {
    let removed = 0;
    await this.mutate((state) => {
      const expired = Object.entries(state.entries)
        .filter(([, entry]) => entry.expiresAt <= now)
        .sort((a, b) => a[1].expiresAt - b[1].expiresAt);
      for (const [id] of expired) {
        if (removed >= limit) break;
        delete state.entries[id];
        removed += 1;
      }

      const remaining = Object.entries(state.entries);
      const overflow = Math.max(0, remaining.length - maxEntries);
      const count = Math.min(overflow, limit - removed);
      if (count > 0) {
        remaining.sort((a, b) => a[1].updatedAt - b[1].updatedAt);
        for (let index = 0; index < count; index += 1) {
          delete state.entries[remaining[index][0]];
          removed += 1;
        }
      }
    });
    return removed;
  }

  async enqueueOutbox(record: MutationOutboxRecord): Promise<void> {
    await this.mutate((state) => {
      state.outbox[record.id] = record;
    });
  }

  async listOutbox(options: OutboxListOptions = {}): Promise<MutationOutboxRecord[]> {
    return this.serialized(async () => {
      const state = await this.read();
      const statuses = options.statuses ? new Set(options.statuses) : null;
      return Object.values(state.outbox)
        .filter((item) => !options.scope || item.scope === options.scope)
        .filter((item) => !statuses || statuses.has(item.status))
        .filter((item) => options.readyAt === undefined || item.nextAttemptAt <= options.readyAt)
        .sort((a, b) => a.createdAt - b.createdAt)
        .slice(0, options.limit ?? 100);
    });
  }

  async updateOutbox(
    id: string,
    patch: Partial<
      Pick<
        MutationOutboxRecord,
        'status' | 'attempts' | 'updatedAt' | 'nextAttemptAt' | 'lastError'
      >
    >
  ): Promise<boolean> {
    let updated = false;
    await this.mutate((state) => {
      const existing = state.outbox[id];
      if (!existing) return;
      state.outbox[id] = { ...existing, ...patch };
      updated = true;
    });
    return updated;
  }

  async deleteOutbox(id: string): Promise<boolean> {
    let deleted = false;
    await this.mutate((state) => {
      if (!state.outbox[id]) return;
      delete state.outbox[id];
      deleted = true;
    });
    return deleted;
  }

  private async mutate(change: (state: StoredCache) => void): Promise<void> {
    await this.serialized(async () => {
      const state = await this.read();
      change(state);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    });
  }

  private async read(): Promise<StoredCache> {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (!stored) return emptyCache();
    try {
      const parsed = JSON.parse(stored) as Partial<StoredCache>;
      if (parsed.version !== 1 || !parsed.entries || !parsed.outbox) return emptyCache();
      return parsed as StoredCache;
    } catch {
      return emptyCache();
    }
  }

  private serialized<T>(task: () => Promise<T>): Promise<T> {
    const result = this.queue.then(task, task);
    this.queue = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }
}

