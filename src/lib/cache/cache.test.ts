import { describe, expect, it, vi } from 'vitest';

import { LocalFirstCache } from '@/lib/cache/cache';
import { InMemoryCacheDriver } from '@/lib/cache/driver';

function createCache(options: { now?: () => number; maxEntries?: number; pruneLimit?: number } = {}) {
  const driver = new InMemoryCacheDriver();
  const cache = new LocalFirstCache(driver, options);
  return { cache, driver };
}

describe('LocalFirstCache freshness', () => {
  it('distinguishes fresh, stale, and expired values', async () => {
    let now = 1_000;
    const { cache } = createCache({ now: () => now });
    await cache.set('feed', { count: 1 }, { staleForMs: 100, expiresInMs: 1_000 });

    expect((await cache.get<{ count: number }>('feed'))?.freshness).toBe('fresh');
    now = 1_100;
    expect((await cache.get<{ count: number }>('feed'))?.freshness).toBe('stale');
    now = 2_000;
    expect(await cache.get('feed')).toBeNull();
  });

  it('invalidates records with a different schema version', async () => {
    const { cache } = createCache();
    await cache.set('groups', ['one'], { schemaVersion: 1 });
    expect(await cache.get('groups', { schemaVersion: 2 })).toBeNull();
  });
});

describe('LocalFirstCache loading', () => {
  it('deduplicates concurrent loader promises', async () => {
    const { cache } = createCache();
    let resolve!: (value: { id: number }) => void;
    const loader = vi.fn(
      () => new Promise<{ id: number }>((done) => {
        resolve = done;
      })
    );

    const first = cache.getOrLoad('practice', loader);
    const second = cache.getOrLoad('practice', loader);
    await vi.waitFor(() => expect(loader).toHaveBeenCalledTimes(1));
    resolve({ id: 7 });

    await expect(first).resolves.toMatchObject({ value: { id: 7 } });
    await expect(second).resolves.toMatchObject({ value: { id: 7 } });
  });

  it('returns stale data and coalesces background refreshes', async () => {
    let now = 10;
    const { cache } = createCache({ now: () => now });
    await cache.set('feed', ['old'], { staleForMs: 1, expiresInMs: 100 });
    now = 12;
    const loader = vi.fn(async () => ['new']);

    const value = await cache.getOrLoad('feed', loader, {
      staleWhileRevalidate: true,
      staleForMs: 10,
      expiresInMs: 100,
    });
    expect(value).toMatchObject({ value: ['old'], freshness: 'stale' });
    await vi.waitFor(async () => {
      expect((await cache.get<string[]>('feed'))?.value).toEqual(['new']);
    });
    expect(loader).toHaveBeenCalledTimes(1);
  });
});

describe('LocalFirstCache scopes and serialization', () => {
  it('clears only the requested cache and outbox scope', async () => {
    const { cache } = createCache();
    await cache.set('profile', { name: 'user' }, { scope: 'session' });
    await cache.set('scripture', { chapter: 1 }, { scope: 'global' });
    await cache.enqueueMutation({
      id: 'session-mutation',
      scope: 'session',
      operation: 'complete-practice',
      payload: { date: '2026-09-24' },
    });
    await cache.enqueueMutation({
      id: 'global-mutation',
      scope: 'global',
      operation: 'global-op',
      payload: {},
    });

    await cache.clearScope('session');

    expect(await cache.get('profile', { scope: 'session' })).toBeNull();
    expect(await cache.get('scripture', { scope: 'global' })).not.toBeNull();
    expect(await cache.listMutations({ scope: 'session' })).toEqual([]);
    expect(await cache.listMutations({ scope: 'global' })).toHaveLength(1);
  });

  it('round-trips nested Dates in JSON payloads', async () => {
    const { cache } = createCache();
    const createdAt = new Date('2026-09-24T08:00:00.000Z');
    await cache.set('dated', { createdAt, nested: [createdAt] });

    const value = (await cache.get<{ createdAt: Date; nested: Date[] }>('dated'))?.value;
    expect(value?.createdAt).toBeInstanceOf(Date);
    expect(value?.createdAt.toISOString()).toBe(createdAt.toISOString());
    expect(value?.nested[0]).toBeInstanceOf(Date);
  });

  it('rejects values that cannot be JSON serialized', async () => {
    const { cache } = createCache();
    const circular: { self?: unknown } = {};
    circular.self = circular;
    await expect(cache.set('circular', circular)).rejects.toBeInstanceOf(TypeError);
  });
});

describe('LocalFirstCache pruning and outbox', () => {
  it('bounds each prune and removes oldest overflow entries', async () => {
    let now = 100;
    const { cache, driver } = createCache({
      now: () => now,
      maxEntries: 2,
      pruneLimit: 1,
    });
    for (const key of ['one', 'two', 'three', 'four']) {
      await cache.set(key, key);
      now += 1;
    }

    expect(await cache.prune()).toBe(1);
    expect(await driver.getCacheEntry('session', 'one')).toBeNull();
    expect(await driver.getCacheEntry('session', 'two')).not.toBeNull();
    expect(await cache.prune()).toBe(1);
    expect(await driver.getCacheEntry('session', 'two')).toBeNull();
  });

  it('enqueues, filters, updates, and deletes mutations', async () => {
    let now = 5_000;
    const { cache } = createCache({ now: () => now });
    await cache.enqueueMutation({
      id: 'first',
      operation: 'complete-practice',
      payload: { completedAt: new Date('2026-09-24T09:00:00.000Z') },
      nextAttemptAt: 5_100,
    });
    await cache.enqueueMutation({
      id: 'second',
      operation: 'complete-practice',
      payload: { id: 2 },
    });

    expect(await cache.listMutations({ readyAt: now })).toHaveLength(1);
    now = 5_200;
    expect(await cache.updateMutation('first', {
      status: 'failed',
      attempts: 1,
      lastError: 'offline',
      nextAttemptAt: 6_000,
    })).toBe(true);

    const failed = await cache.listMutations<{ completedAt: Date }>({
      statuses: ['failed'],
    });
    expect(failed).toHaveLength(1);
    expect(failed[0].attempts).toBe(1);
    expect(failed[0].payload.completedAt).toBeInstanceOf(Date);
    expect(await cache.deleteMutation('first')).toBe(true);
    expect(await cache.deleteMutation('missing')).toBe(false);
  });
});

