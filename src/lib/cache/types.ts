export const CACHE_SCHEMA_VERSION = 1;

export const CACHE_SCOPES = {
  global: 'global',
  session: 'session',
} as const;

export type CacheFreshness = 'fresh' | 'stale';

export interface CacheEntryRecord {
  key: string;
  scope: string;
  payload: string;
  schemaVersion: number;
  updatedAt: number;
  staleAt: number;
  expiresAt: number;
}

export interface CacheValue<T> {
  value: T;
  freshness: CacheFreshness;
  updatedAt: number;
  staleAt: number;
  expiresAt: number;
}

export type OutboxStatus = 'pending' | 'processing' | 'failed';

export interface MutationOutboxRecord {
  id: string;
  scope: string;
  operation: string;
  payload: string;
  status: OutboxStatus;
  attempts: number;
  createdAt: number;
  updatedAt: number;
  nextAttemptAt: number;
  lastError: string | null;
}

export interface MutationOutboxItem<T = unknown>
  extends Omit<MutationOutboxRecord, 'payload'> {
  payload: T;
}

export interface OutboxListOptions {
  scope?: string;
  statuses?: OutboxStatus[];
  readyAt?: number;
  limit?: number;
}

export interface CacheSetOptions {
  scope?: string;
  schemaVersion?: number;
  staleForMs?: number;
  expiresInMs?: number;
  staleAt?: number;
  expiresAt?: number;
}

export interface CacheGetOptions {
  scope?: string;
  schemaVersion?: number;
}

export interface CacheLoadOptions extends CacheSetOptions {
  forceRefresh?: boolean;
  staleWhileRevalidate?: boolean;
}

