import type {
  CacheEntryRecord,
  MutationOutboxRecord,
  OutboxListOptions,
} from '@/lib/cache/types';

export interface CacheDriver {
  initialize(): Promise<void>;
  getCacheEntry(scope: string, key: string): Promise<CacheEntryRecord | null>;
  setCacheEntry(entry: CacheEntryRecord): Promise<void>;
  removeCacheEntry(scope: string, key: string): Promise<void>;
  clearScope(scope: string): Promise<void>;
  prune(now: number, maxEntries: number, limit: number): Promise<number>;
  enqueueOutbox(record: MutationOutboxRecord): Promise<void>;
  listOutbox(options?: OutboxListOptions): Promise<MutationOutboxRecord[]>;
  updateOutbox(
    id: string,
    patch: Partial<
      Pick<
        MutationOutboxRecord,
        'status' | 'attempts' | 'updatedAt' | 'nextAttemptAt' | 'lastError'
      >
    >
  ): Promise<boolean>;
  deleteOutbox(id: string): Promise<boolean>;
}

function entryId(scope: string, key: string): string {
  return JSON.stringify([scope, key]);
}

export class InMemoryCacheDriver implements CacheDriver {
  private readonly entries = new Map<string, CacheEntryRecord>();
  private readonly outbox = new Map<string, MutationOutboxRecord>();

  async initialize(): Promise<void> {}

  async getCacheEntry(scope: string, key: string): Promise<CacheEntryRecord | null> {
    return this.entries.get(entryId(scope, key)) ?? null;
  }

  async setCacheEntry(entry: CacheEntryRecord): Promise<void> {
    this.entries.set(entryId(entry.scope, entry.key), { ...entry });
  }

  async removeCacheEntry(scope: string, key: string): Promise<void> {
    this.entries.delete(entryId(scope, key));
  }

  async clearScope(scope: string): Promise<void> {
    for (const [id, entry] of this.entries) {
      if (entry.scope === scope) this.entries.delete(id);
    }
    for (const [id, mutation] of this.outbox) {
      if (mutation.scope === scope) this.outbox.delete(id);
    }
  }

  async prune(now: number, maxEntries: number, limit: number): Promise<number> {
    let removed = 0;
    const expired = [...this.entries.entries()]
      .filter(([, entry]) => entry.expiresAt <= now)
      .sort((a, b) => a[1].expiresAt - b[1].expiresAt);

    for (const [id] of expired) {
      if (removed >= limit) break;
      this.entries.delete(id);
      removed += 1;
    }

    const overflow = Math.max(0, this.entries.size - maxEntries);
    if (overflow > 0 && removed < limit) {
      const oldest = [...this.entries.entries()].sort(
        (a, b) => a[1].updatedAt - b[1].updatedAt
      );
      const count = Math.min(overflow, limit - removed);
      for (let index = 0; index < count; index += 1) {
        this.entries.delete(oldest[index][0]);
        removed += 1;
      }
    }
    return removed;
  }

  async enqueueOutbox(record: MutationOutboxRecord): Promise<void> {
    this.outbox.set(record.id, { ...record });
  }

  async listOutbox(options: OutboxListOptions = {}): Promise<MutationOutboxRecord[]> {
    const statuses = options.statuses ? new Set(options.statuses) : null;
    return [...this.outbox.values()]
      .filter((item) => !options.scope || item.scope === options.scope)
      .filter((item) => !statuses || statuses.has(item.status))
      .filter((item) => options.readyAt === undefined || item.nextAttemptAt <= options.readyAt)
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, options.limit ?? 100)
      .map((item) => ({ ...item }));
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
    const existing = this.outbox.get(id);
    if (!existing) return false;
    this.outbox.set(id, { ...existing, ...patch });
    return true;
  }

  async deleteOutbox(id: string): Promise<boolean> {
    return this.outbox.delete(id);
  }
}

