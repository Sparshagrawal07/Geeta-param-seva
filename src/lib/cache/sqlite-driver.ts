import * as SQLite from 'expo-sqlite';

import type { CacheDriver } from '@/lib/cache/driver';
import type {
  CacheEntryRecord,
  MutationOutboxRecord,
  OutboxListOptions,
} from '@/lib/cache/types';

const DATABASE_NAME = 'geeta-param-seva-cache.db';
const DATABASE_VERSION = 1;

interface CacheRow {
  cache_key: string;
  scope: string;
  payload: string;
  schema_version: number;
  updated_at: number;
  stale_at: number;
  expires_at: number;
}

interface OutboxRow {
  id: string;
  scope: string;
  operation: string;
  payload: string;
  status: MutationOutboxRecord['status'];
  attempts: number;
  created_at: number;
  updated_at: number;
  next_attempt_at: number;
  last_error: string | null;
}

export class SQLiteCacheDriver implements CacheDriver {
  private databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

  async initialize(): Promise<void> {
    await this.database();
  }

  async getCacheEntry(scope: string, key: string): Promise<CacheEntryRecord | null> {
    const db = await this.database();
    const row = await db.getFirstAsync<CacheRow>(
      `SELECT cache_key, scope, payload, schema_version, updated_at, stale_at, expires_at
       FROM cache_entries WHERE scope = ? AND cache_key = ?`,
      [scope, key]
    );
    return row ? this.toCacheEntry(row) : null;
  }

  async setCacheEntry(entry: CacheEntryRecord): Promise<void> {
    const db = await this.database();
    await db.runAsync(
      `INSERT INTO cache_entries
        (cache_key, scope, payload, schema_version, updated_at, stale_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(scope, cache_key) DO UPDATE SET
         payload = excluded.payload,
         schema_version = excluded.schema_version,
         updated_at = excluded.updated_at,
         stale_at = excluded.stale_at,
         expires_at = excluded.expires_at`,
      [
        entry.key,
        entry.scope,
        entry.payload,
        entry.schemaVersion,
        entry.updatedAt,
        entry.staleAt,
        entry.expiresAt,
      ]
    );
  }

  async removeCacheEntry(scope: string, key: string): Promise<void> {
    const db = await this.database();
    await db.runAsync(
      'DELETE FROM cache_entries WHERE scope = ? AND cache_key = ?',
      [scope, key]
    );
  }

  async clearScope(scope: string): Promise<void> {
    const db = await this.database();
    await db.withTransactionAsync(async () => {
      await db.runAsync('DELETE FROM cache_entries WHERE scope = ?', [scope]);
      await db.runAsync('DELETE FROM mutation_outbox WHERE scope = ?', [scope]);
    });
  }

  async prune(now: number, maxEntries: number, limit: number): Promise<number> {
    const db = await this.database();
    let removed = 0;
    await db.withTransactionAsync(async () => {
      const expired = await db.runAsync(
        `DELETE FROM cache_entries WHERE rowid IN (
           SELECT rowid FROM cache_entries
           WHERE expires_at <= ?
           ORDER BY expires_at ASC
           LIMIT ?
         )`,
        [now, limit]
      );
      removed += expired.changes;

      if (removed >= limit) return;
      const countRow = await db.getFirstAsync<{ count: number }>(
        'SELECT COUNT(*) AS count FROM cache_entries'
      );
      const overflow = Math.max(0, (countRow?.count ?? 0) - maxEntries);
      const overflowLimit = Math.min(overflow, limit - removed);
      if (overflowLimit <= 0) return;

      const old = await db.runAsync(
        `DELETE FROM cache_entries WHERE rowid IN (
           SELECT rowid FROM cache_entries
           ORDER BY updated_at ASC
           LIMIT ?
         )`,
        [overflowLimit]
      );
      removed += old.changes;
    });
    return removed;
  }

  async enqueueOutbox(record: MutationOutboxRecord): Promise<void> {
    const db = await this.database();
    await db.runAsync(
      `INSERT OR REPLACE INTO mutation_outbox
        (id, scope, operation, payload, status, attempts, created_at, updated_at,
         next_attempt_at, last_error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.scope,
        record.operation,
        record.payload,
        record.status,
        record.attempts,
        record.createdAt,
        record.updatedAt,
        record.nextAttemptAt,
        record.lastError,
      ]
    );
  }

  async listOutbox(options: OutboxListOptions = {}): Promise<MutationOutboxRecord[]> {
    const db = await this.database();
    const clauses: string[] = [];
    const parameters: (string | number)[] = [];

    if (options.scope) {
      clauses.push('scope = ?');
      parameters.push(options.scope);
    }
    if (options.statuses?.length) {
      clauses.push(`status IN (${options.statuses.map(() => '?').join(', ')})`);
      parameters.push(...options.statuses);
    }
    if (options.readyAt !== undefined) {
      clauses.push('next_attempt_at <= ?');
      parameters.push(options.readyAt);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    parameters.push(Math.max(1, options.limit ?? 100));
    const rows = await db.getAllAsync<OutboxRow>(
      `SELECT id, scope, operation, payload, status, attempts, created_at, updated_at,
              next_attempt_at, last_error
       FROM mutation_outbox ${where}
       ORDER BY created_at ASC
       LIMIT ?`,
      parameters
    );
    return rows.map((row: OutboxRow) => this.toOutboxRecord(row));
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
    const columns: string[] = [];
    const parameters: (string | number | null)[] = [];
    const mapping = {
      status: 'status',
      attempts: 'attempts',
      updatedAt: 'updated_at',
      nextAttemptAt: 'next_attempt_at',
      lastError: 'last_error',
    } as const;

    for (const field of Object.keys(mapping) as (keyof typeof mapping)[]) {
      if (!(field in patch)) continue;
      columns.push(`${mapping[field]} = ?`);
      parameters.push(patch[field] ?? null);
    }
    if (columns.length === 0) return false;

    parameters.push(id);
    const db = await this.database();
    const result = await db.runAsync(
      `UPDATE mutation_outbox SET ${columns.join(', ')} WHERE id = ?`,
      parameters
    );
    return result.changes > 0;
  }

  async deleteOutbox(id: string): Promise<boolean> {
    const db = await this.database();
    const result = await db.runAsync('DELETE FROM mutation_outbox WHERE id = ?', [id]);
    return result.changes > 0;
  }

  private database(): Promise<SQLite.SQLiteDatabase> {
    this.databasePromise ??= this.openAndMigrate();
    return this.databasePromise;
  }

  private async openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
    const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
    await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
    const versionRow = await db.getFirstAsync<{ user_version: number }>(
      'PRAGMA user_version'
    );
    const version = versionRow?.user_version ?? 0;
    if (version > DATABASE_VERSION) {
      throw new Error(`Cache database version ${version} is newer than supported.`);
    }
    if (version < 1) {
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS cache_entries (
          cache_key TEXT NOT NULL,
          scope TEXT NOT NULL,
          payload TEXT NOT NULL,
          schema_version INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          stale_at INTEGER NOT NULL,
          expires_at INTEGER NOT NULL,
          PRIMARY KEY (scope, cache_key)
        );
        CREATE INDEX IF NOT EXISTS cache_entries_expiry
          ON cache_entries (expires_at);
        CREATE INDEX IF NOT EXISTS cache_entries_updated
          ON cache_entries (updated_at);

        CREATE TABLE IF NOT EXISTS mutation_outbox (
          id TEXT PRIMARY KEY NOT NULL,
          scope TEXT NOT NULL,
          operation TEXT NOT NULL,
          payload TEXT NOT NULL,
          status TEXT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          next_attempt_at INTEGER NOT NULL,
          last_error TEXT
        );
        CREATE INDEX IF NOT EXISTS mutation_outbox_ready
          ON mutation_outbox (status, next_attempt_at, created_at);
        CREATE INDEX IF NOT EXISTS mutation_outbox_scope
          ON mutation_outbox (scope);
      `);
      await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
    }
    return db;
  }

  private toCacheEntry(row: CacheRow): CacheEntryRecord {
    return {
      key: row.cache_key,
      scope: row.scope,
      payload: row.payload,
      schemaVersion: row.schema_version,
      updatedAt: row.updated_at,
      staleAt: row.stale_at,
      expiresAt: row.expires_at,
    };
  }

  private toOutboxRecord(row: OutboxRow): MutationOutboxRecord {
    return {
      id: row.id,
      scope: row.scope,
      operation: row.operation,
      payload: row.payload,
      status: row.status,
      attempts: row.attempts,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      nextAttemptAt: row.next_attempt_at,
      lastError: row.last_error,
    };
  }
}

