import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  Timestamp,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type QueryConstraint,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import { db, functions } from '@/lib/firebase';
import type { AccessRosterEntry, RosterRole, RosterStatus } from '@/types/roster';

export const ROSTER_PAGE_SIZE = 50;

function toDate(value: unknown): Date | undefined {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return undefined;
}

function mapRoster(id: string, data: Record<string, unknown>): AccessRosterEntry {
  return {
    id,
    name: String(data.name ?? ''),
    phoneNumber: String(data.phoneNumber ?? ''),
    role: data.role === 'admin' ? 'admin' : 'user',
    groupId: typeof data.groupId === 'string' ? data.groupId : null,
    assignedGroupIds: Array.isArray(data.assignedGroupIds)
      ? data.assignedGroupIds.map(String)
      : [],
    status: data.status === 'inactive' ? 'inactive' : 'active',
    createdBy: typeof data.createdBy === 'string' ? data.createdBy : undefined,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt),
  };
}

export type RosterPageCursor = QueryDocumentSnapshot<DocumentData> | null;

export interface RosterPageResult {
  entries: AccessRosterEntry[];
  cursor: RosterPageCursor;
  hasMore: boolean;
}

export interface RosterPageQuery {
  groupId?: string | null;
  role?: RosterRole | 'all';
  status?: RosterStatus | 'all';
  search?: string;
  cursor?: RosterPageCursor;
  pageSize?: number;
}

async function fetchAccessRosterViaCallable(input: RosterPageQuery): Promise<RosterPageResult> {
  const callable = httpsCallable(functions, 'listAccessRoster');
  const response = await callable({
    groupId: input.groupId ?? null,
    role: input.role ?? 'all',
    status: input.status ?? 'all',
    search: input.search ?? '',
    pageSize: input.pageSize ?? ROSTER_PAGE_SIZE,
  });
  const data = response.data as {
    entries?: Array<Record<string, unknown>>;
    hasMore?: boolean;
  };
  const entries = Array.isArray(data.entries)
    ? data.entries.map((entry) => mapRoster(String(entry.id ?? ''), entry))
    : [];
  return {
    entries,
    cursor: null,
    hasMore: Boolean(data.hasMore),
  };
}

/**
 * Prefer Cloud Function (Admin SDK). Fall back to direct Firestore if callable fails.
 */
export async function fetchAccessRosterPage(input: RosterPageQuery): Promise<RosterPageResult> {
  // Cursor paging is Firestore-only; CF returns a full filtered page.
  if (!input.cursor) {
    try {
      return await fetchAccessRosterViaCallable(input);
    } catch (error) {
      console.warn('[roster] listAccessRoster callable failed, trying Firestore', error);
    }
  }

  try {
    return await fetchAccessRosterFromFirestore(input);
  } catch (error) {
    console.warn('[roster] Firestore roster query failed', error);
    throw error;
  }
}

async function fetchAccessRosterFromFirestore(input: RosterPageQuery): Promise<RosterPageResult> {
  const pageSize = input.pageSize ?? ROSTER_PAGE_SIZE;
  const search = input.search?.trim().toLowerCase() ?? '';
  const role = input.role ?? 'all';
  const status = input.status ?? 'all';
  const groupId = input.groupId?.trim() || null;

  const scanSize = Math.min(200, Math.max(pageSize * 5, 100));
  const constraints: QueryConstraint[] = [];

  if (groupId && role !== 'admin') {
    constraints.push(where('groupId', '==', groupId));
  } else if (role === 'admin' && groupId) {
    constraints.push(where('assignedGroupIds', 'array-contains', groupId));
    constraints.push(where('role', '==', 'admin'));
  } else if (role === 'admin') {
    constraints.push(where('role', '==', 'admin'));
  }

  // Avoid status/role composites that may be missing — filter client-side.
  constraints.push(orderBy('name'), limit(scanSize));
  if (input.cursor) constraints.push(startAfter(input.cursor));

  const snapshot = await getDocs(query(collection(db, 'access_roster'), ...constraints));

  let docs = snapshot.docs;
  if (groupId && role === 'all' && !input.cursor) {
    try {
      const adminSnap = await getDocs(
        query(
          collection(db, 'access_roster'),
          where('assignedGroupIds', 'array-contains', groupId),
          where('role', '==', 'admin'),
          orderBy('name'),
          limit(50)
        )
      );
      const byId = new Map<string, (typeof docs)[number]>();
      for (const entry of adminSnap.docs) byId.set(entry.id, entry);
      for (const entry of docs) byId.set(entry.id, entry);
      docs = [...byId.values()].sort((a, b) =>
        String(a.data().name ?? '').localeCompare(String(b.data().name ?? ''))
      );
    } catch (error) {
      console.warn('[roster] admin merge query failed', error);
    }
  }

  const filtered = docs.filter((entry) => {
    const data = entry.data() as Record<string, unknown>;
    if (status !== 'all' && data.status !== status) return false;
    if (role === 'user' && data.role === 'admin') return false;
    if (role === 'admin' && data.role !== 'admin') return false;
    if (search) {
      if (/^\d+$/.test(search)) {
        return String(data.phoneNumber ?? '').includes(search);
      }
      const nameLower = String(data.nameLower ?? data.name ?? '').toLowerCase();
      return nameLower.startsWith(search);
    }
    return true;
  });

  const hasMore = filtered.length > pageSize || snapshot.docs.length >= scanSize;
  const pageDocs = filtered.slice(0, pageSize);
  return {
    entries: pageDocs.map((entry) => mapRoster(entry.id, entry.data() as Record<string, unknown>)),
    cursor: pageDocs.length > 0 ? pageDocs[pageDocs.length - 1]! : null,
    hasMore,
  };
}

/** @deprecated Prefer fetchAccessRosterPage */
export async function fetchAccessRoster(scopeGroupIds?: string[]): Promise<AccessRosterEntry[]> {
  if (scopeGroupIds && scopeGroupIds.length === 1) {
    const page = await fetchAccessRosterPage({
      groupId: scopeGroupIds[0],
      pageSize: 200,
    });
    return page.entries;
  }

  if (scopeGroupIds && scopeGroupIds.length > 1) {
    const byId = new Map<string, AccessRosterEntry>();
    for (const groupId of scopeGroupIds) {
      const page = await fetchAccessRosterPage({ groupId, pageSize: 200 });
      for (const entry of page.entries) byId.set(entry.id, entry);
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  const page = await fetchAccessRosterPage({ pageSize: 200 });
  return page.entries;
}

export async function upsertAccessRosterRemote(input: {
  phoneNumber: string;
  name: string;
  role: RosterRole;
  groupId?: string | null;
  assignedGroupIds?: string[];
  status?: RosterStatus;
}) {
  const callable = httpsCallable(functions, 'upsertAccessRoster');
  const response = await callable(input);
  return response.data as { id: string };
}

export async function deactivateAccessRosterRemote(phoneNumber: string) {
  const callable = httpsCallable(functions, 'deactivateAccessRoster');
  const response = await callable({ phoneNumber });
  return response.data as { id: string; status: 'inactive' };
}

export async function migrateWhitelistToRosterRemote() {
  const callable = httpsCallable(functions, 'migrateWhitelistToRoster');
  const response = await callable({});
  return response.data as { created: number; skipped: number };
}
