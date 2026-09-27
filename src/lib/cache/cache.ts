import type { CacheDriver } from '@/lib/cache/driver';
import {
  deserializeCacheValue,
  serializeCacheValue,
} from '@/lib/cache/serialization';
import {
  CACHE_SCHEMA_VERSION,
  CACHE_SCOPES,
  type CacheEntryRecord,
  type CacheGetOptions,
  type CacheLoadOptions,
  type CacheSetOptions,
  type CacheValue,
  type MutationOutboxItem,
  type MutationOutboxRecord,
  type OutboxListOptions,
} from '@/lib/cache/types';

const DEFAULT_STALE_MS = 5 * 60 * 1000;
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface LocalFirstCacheOptions {
  now?: () => number;
  maxEntries?: number;
  pruneLimit?: number;
}

export interface EnqueueMutationInput<T> {
  id?: string;
  scope?: string;
  operation: string;
  payload: T;
  nextAttemptAt?: number;
}

type OutboxPatch = Partial<
  Pick<
    MutationOutboxRecord,
    'status' | 'attempts' | 'nextAttemptAt' | 'lastError'
  >
>;

function cacheId(scope: string, key: string): string {
  return JSON.stringify([scope, key]);
}

function createMutationId(now: number): string {
  return `${now.toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export class LocalFirstCache {
  private readonly l1 = new Map<string, CacheEntryRecord>();
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private readonly now: () => number;
  private readonly maxEntries: number;
  private readonly pruneLimit: number;
  private initializePromise: Promise<void> | null = null;

  constructor(
    private readonly driver: CacheDriver,
    options: LocalFirstCacheOptions = {}
  ) {
    this.now = options.now ?? Date.now;
    this.maxEntries = Math.max(1, options.maxEntries ?? 500);
    this.pruneLimit = Math.max(1, options.pruneLimit ?? 50);
  }

  initialize(): Promise<void> {
    this.initializePromise ??= this.driver.initialize();
    return this.initializePromise;
  }

  async get<T>(
    key: string,
    options: CacheGetOptions = {}
  ): Promise<CacheValue<T> | null> {
    await this.initialize();
    const scope = options.scope ?? CACHE_SCOPES.session;
    const schemaVersion = options.schemaVersion ?? CACHE_SCHEMA_VERSION;
    const id = cacheId(scope, key);
    const entry = this.l1.get(id) ?? (await this.driver.getCacheEntry(scope, key));

    if (!entry) return null;
    if (entry.schemaVersion !== schemaVersion || entry.expiresAt <= this.now()) {
      this.l1.delete(id);
      await this.driver.removeCacheEntry(scope, key);
      return null;
    }

    try {
      const value = deserializeCacheValue<T>(entry.payload);
      this.touchL1(id, entry);
      return {
        value,
        freshness: entry.staleAt <= this.now() ? 'stale' : 'fresh',
        updatedAt: entry.updatedAt,
        staleAt: entry.staleAt,
        expiresAt: entry.expiresAt,
      };
    } catch {
      this.l1.delete(id);
      await this.driver.removeCacheEntry(scope, key);
      return null;
    }
  }

  async set<T>(
    key: string,
    value: T,
    options: CacheSetOptions = {}
  ): Promise<CacheValue<T>> {
    await this.initialize();
    const now = this.now();
    const scope = options.scope ?? CACHE_SCOPES.session;
    const staleAt = options.staleAt ?? now + (options.staleForMs ?? DEFAULT_STALE_MS);
    const expiresAt =
      options.expiresAt ?? now + (options.expiresInMs ?? DEFAULT_TTL_MS);

    if (expiresAt <= now) {
      throw new RangeError('expiresAt must be in the future.');
    }
    if (staleAt > expiresAt) {
      throw new RangeError('staleAt cannot be later than expiresAt.');
    }

    const entry: CacheEntryRecord = {
      key,
      scope,
      payload: serializeCacheValue(value),
      schemaVersion: options.schemaVersion ?? CACHE_SCHEMA_VERSION,
      updatedAt: now,
      staleAt,
      expiresAt,
    };
    this.touchL1(cacheId(scope, key), entry);
    await this.driver.setCacheEntry(entry);
    return {
      value,
      freshness: staleAt <= now ? 'stale' : 'fresh',
      updatedAt: now,
      staleAt,
      expiresAt,
    };
  }

  async remove(key: string, scope: string = CACHE_SCOPES.session): Promise<void> {
    await this.initialize();
    this.l1.delete(cacheId(scope, key));
    await this.driver.removeCacheEntry(scope, key);
  }

  async clearScope(scope: string): Promise<void> {
    await this.initialize();
    for (const [id, entry] of this.l1) {
      if (entry.scope === scope) this.l1.delete(id);
    }
    await this.driver.clearScope(scope);
  }

  async prune(): Promise<number> {
    await this.initialize();
    const removed = await this.driver.prune(
      this.now(),
      this.maxEntries,
      this.pruneLimit
    );
    if (removed > 0) this.l1.clear();
    return removed;
  }

  async getOrLoad<T>(
    key: string,
    loader: () => Promise<T>,
    options: CacheLoadOptions = {}
  ): Promise<CacheValue<T>> {
    const scope = options.scope ?? CACHE_SCOPES.session;
    const cached = options.forceRefresh ? null : await this.get<T>(key, options);
    if (cached?.freshness === 'fresh') return cached;

    if (cached && options.staleWhileRevalidate) {
      void this.loadAndStore(key, scope, loader, options).catch(() => undefined);
      return cached;
    }

    try {
      return await this.loadAndStore(key, scope, loader, options);
    } catch (error) {
      if (cached) return cached;
      throw error;
    }
  }

  async enqueueMutation<T>(
    input: EnqueueMutationInput<T>
  ): Promise<MutationOutboxItem<T>> {
    await this.initialize();
    const now = this.now();
    const record: MutationOutboxRecord = {
      id: input.id ?? createMutationId(now),
      scope: input.scope ?? CACHE_SCOPES.session,
      operation: input.operation,
      payload: serializeCacheValue(input.payload),
      status: 'pending',
      attempts: 0,
      createdAt: now,
      updatedAt: now,
      nextAttemptAt: input.nextAttemptAt ?? now,
      lastError: null,
    };
    await this.driver.enqueueOutbox(record);
    return this.deserializeMutation<T>(record);
  }

  async listMutations<T = unknown>(
    options: OutboxListOptions = {}
  ): Promise<MutationOutboxItem<T>[]> {
    await this.initialize();
    const records = await this.driver.listOutbox(options);
    const result: MutationOutboxItem<T>[] = [];
    for (const record of records) {
      try {
        result.push(this.deserializeMutation<T>(record));
      } catch {
        await this.driver.deleteOutbox(record.id);
      }
    }
    return result;
  }

  async updateMutation(id: string, patch: OutboxPatch): Promise<boolean> {
    await this.initialize();
    return this.driver.updateOutbox(id, { ...patch, updatedAt: this.now() });
  }

  async deleteMutation(id: string): Promise<boolean> {
    await this.initialize();
    return this.driver.deleteOutbox(id);
  }

  private touchL1(id: string, entry: CacheEntryRecord): void {
    this.l1.delete(id);
    this.l1.set(id, entry);
    while (this.l1.size > this.maxEntries) {
      const oldest = this.l1.keys().next().value;
      if (oldest === undefined) break;
      this.l1.delete(oldest);
    }
  }

  private loadAndStore<T>(
    key: string,
    scope: string,
    loader: () => Promise<T>,
    options: CacheSetOptions
  ): Promise<CacheValue<T>> {
    const id = cacheId(scope, key);
    const existing = this.inFlight.get(id) as Promise<CacheValue<T>> | undefined;
    if (existing) return existing;

    const request = loader()
      .then((value) => this.set(key, value, { ...options, scope }))
      .finally(() => {
        if (this.inFlight.get(id) === request) this.inFlight.delete(id);
      });
    this.inFlight.set(id, request);
    return request;
  }

  private deserializeMutation<T>(
    record: MutationOutboxRecord
  ): MutationOutboxItem<T> {
    return {
      ...record,
      payload: deserializeCacheValue<T>(record.payload),
    };
  }
}

