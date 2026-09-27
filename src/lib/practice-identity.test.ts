/**
 * Regression cover for "member added on People never shows on Practice/Dashboard".
 *
 * These run the real Cloud Function cores against an in-memory Firestore that
 * can be told to reject composite queries, which is exactly how the two screens
 * drifted apart: People had a client-side fallback, Practice did not.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

/** In-memory Firestore keyed by full document path. */
const docs = new Map<string, Row>();
/** Collection names whose 2+ filter queries reject, simulating a missing index. */
const rejectComposite = new Set<string>();
/** phone → auth uid. */
const authUsersByPhone = new Map<string, string>();

const SERVER_TS = '__SERVER_TIMESTAMP__';
const DELETE = '__DELETE__';

function children(path: string): [string, Row][] {
  const prefix = `${path}/`;
  return [...docs.entries()].filter(([key]) => key.startsWith(prefix));
}

function writeDoc(path: string, data: Row, merge = false) {
  const existing = merge ? (docs.get(path) ?? {}) : {};
  const next: Row = { ...existing };
  for (const [key, value] of Object.entries(data)) {
    if (value === DELETE) delete next[key];
    else next[key] = value;
  }
  docs.set(path, next);
}

type Filter = { field: string; op: string; value: unknown };

/** Explicit shapes break the makeQuery <-> makeDocRef inference cycle. */
interface FakeDocRef {
  id: string;
  path: string;
  readonly exists: boolean;
  data: () => Row | undefined;
  get: () => Promise<{
    id: string;
    path: string;
    exists: boolean;
    data: () => Row | undefined;
  }>;
  collection: (name: string) => FakeQuery;
  set: (data: Row, options?: { merge?: boolean }) => Promise<void>;
  create: (data: Row) => Promise<void>;
  delete: () => Promise<void>;
  update: (data: Row) => Promise<void>;
}

interface FakeQueryDoc {
  id: string;
  path: string;
  ref: FakeDocRef;
  data: () => Row;
}

interface FakeQueryResult {
  docs: FakeQueryDoc[];
  size: number;
  empty: boolean;
}

interface FakeQuery {
  where: (field: string, op: string, value: unknown) => FakeQuery;
  orderBy: (field?: unknown) => FakeQuery;
  limit: (n: number) => FakeQuery;
  startAfter: (doc: { id: string }) => FakeQuery;
  get: () => Promise<FakeQueryResult>;
  count: () => { get: () => Promise<{ data: () => { count: number } }> };
  doc: (id: string) => FakeDocRef;
}

function matches(row: Row, filter: Filter): boolean {
  const actual = row[filter.field];
  if (filter.op === '==') return actual === filter.value;
  if (filter.op === 'array-contains') return Array.isArray(actual) && actual.includes(filter.value);
  if (filter.op === '>=') return String(actual) >= String(filter.value);
  if (filter.op === '<=') return String(actual) <= String(filter.value);
  throw new Error(`unsupported op ${filter.op}`);
}

/** `FieldPath.documentId()` stringifies to `__name__`. */
const DOCUMENT_ID = '__name__';

function makeQuery(
  path: string,
  filters: Filter[],
  max: number | null,
  options: { afterId?: string | null; byDocumentId?: boolean } = {}
): FakeQuery {
  const { afterId = null, byDocumentId = false } = options;
  const next = (patch: { max?: number | null; afterId?: string | null; byDocumentId?: boolean }) =>
    makeQuery(path, filters, patch.max ?? max, {
      afterId: patch.afterId ?? afterId,
      byDocumentId: patch.byDocumentId ?? byDocumentId,
    });

  return {
    where(field: string, op: string, value: unknown) {
      return makeQuery(path, [...filters, { field, op, value }], max, {
        afterId,
        byDocumentId,
      });
    },
    orderBy(field?: unknown) {
      // `FieldPath.documentId()` stringifies to `__name__`.
      return next({ byDocumentId: String(field ?? '') === DOCUMENT_ID });
    },
    limit(n: number) {
      return next({ max: n });
    },
    startAfter(doc: { id: string }) {
      return next({ afterId: doc.id });
    },
    async get(): Promise<FakeQueryResult> {
      const name = path.split('/')[0] ?? '';
      if (filters.length >= 2 && rejectComposite.has(name)) {
        throw new Error(`The query requires an index. Collection: ${name}`);
      }
      let found: FakeQueryDoc[] = children(path)
        .map(([key, row]) => ({
          id: key.slice(path.length + 1),
          path: key,
          ref: makeDocRef(key),
          data: () => row,
        }))
        .filter((doc) => filters.every((filter) => matches(doc.data(), filter)))
        .filter((doc) => (afterId === null ? true : doc.id > afterId));
      if (byDocumentId) {
        found = found.sort((a, b) => a.id.localeCompare(b.id));
      }
      const limited = max === null ? found : found.slice(0, max);
      return { docs: limited, size: limited.length, empty: limited.length === 0 };
    },
    count() {
      return {
        async get() {
          const result: FakeQueryResult = await makeQuery(path, filters, null, {
            afterId,
            byDocumentId,
          }).get();
          return { data: () => ({ count: result.size }) };
        },
      };
    },
    doc(id: string) {
      return makeDocRef(`${path}/${id}`);
    },
  };
}

function makeDocRef(path: string): FakeDocRef {
  return {
    id: path.slice(path.lastIndexOf('/') + 1),
    path,
    get exists() {
      return docs.has(path);
    },
    data: () => docs.get(path),
    async get() {
      const row = docs.get(path);
      // Real Admin SDK snapshots carry their own `ref`; callers rely on it to map a
      // batch of reads back to the document they asked for.
      const ref = makeDocRef(path);
      return {
        id: path.slice(path.lastIndexOf('/') + 1),
        path,
        ref,
        exists: row !== undefined,
        data: () => row,
      };
    },
    collection(name: string) {
      return makeQuery(`${path}/${name}`, [], null);
    },
    async set(data: Row, options?: { merge?: boolean }) {
      writeDoc(path, data, options?.merge === true);
    },
    async create(data: Row) {
      if (docs.has(path)) {
        const error = new Error('ALREADY_EXISTS') as Error & { code: string };
        error.code = '6';
        throw error;
      }
      writeDoc(path, data, false);
    },
    async delete() {
      docs.delete(path);
    },
    async update(data: Row) {
      writeDoc(path, data, true);
    },
  };
}

const fakeDb = {
  collection(name: string) {
    return makeQuery(name, [], null);
  },
  async getAll(...refs: FakeDocRef[]) {
    return Promise.all(refs.map((ref) => ref.get()));
  },
  batch() {
    const writes: Array<() => void> = [];
    return {
      set(ref: FakeDocRef, data: Row, options?: { merge?: boolean }) {
        writes.push(() => writeDoc(ref.path, data, options?.merge === true));
      },
      delete(ref: FakeDocRef) {
        writes.push(() => docs.delete(ref.path));
      },
      async commit() {
        for (const write of writes) write();
      },
    };
  },
};

const fakeAdminAuth = {
  async getUserByPhoneNumber(phone: string) {
    const uid = authUsersByPhone.get(phone);
    if (!uid) throw new Error('user-not-found');
    return { uid, phoneNumber: phone };
  },
  async getUser(uid: string) {
    for (const [phone, id] of authUsersByPhone) {
      if (id === uid) return { uid, phoneNumber: phone };
    }
    throw new Error('user-not-found');
  },
};

vi.mock('../../functions/src/firebase-admin', () => ({
  get db() {
    return fakeDb;
  },
  get adminAuth() {
    return fakeAdminAuth;
  },
}));

vi.mock('../../functions/src/push', () => ({
  sendUserPracticePush: vi.fn(async () => ({ sent: 1, tokenCount: 1, ticketErrors: [] })),
  syncUserPushTokenIndex: vi.fn(async () => undefined),
  reindexUserPushTokens: vi.fn(async () => undefined),
  collectGroupPushTokens: vi.fn(async () => []),
  collectUserPushTokens: vi.fn(async () => []),
  sendExpoPush: vi.fn(async () => ({ sent: 0, ticketErrors: [] })),
  sendGroupCommunityPush: vi.fn(async () => ({ sent: 0, tokenCount: 0, ticketErrors: [] })),
  createAndPushGroupNotification: vi.fn(),
}));

// eslint-disable-next-line import/first
import { phoneToUid } from '../../functions/src/member-identity';
// eslint-disable-next-line import/first
import {
  getMyPracticeTodayCore,
  getPracticeAdminOverviewCore,
  markPracticeItemCompleteCore,
  setMemberPracticeAssignmentCore,
} from '../../functions/src/practice';
// eslint-disable-next-line import/first
import { backfillGroupIds, listAccessRosterCore, upsertAccessRosterEntry } from '../../functions/src/roster';

const GROUP = 'grp_test';
const ADMIN = 'admin_uid';
const PHONE = '+919876500001';
const MEMBER_KEY = phoneToUid(PHONE);
const ITEMS = [
  { type: 'adhyay', chapterNumber: 1, itemKey: 'adhyay_01' },
  { type: 'adhyay', chapterNumber: 2, itemKey: 'adhyay_02' },
];

function set(path: string, row: Row) {
  docs.set(path, { ...row });
}

beforeEach(() => {
  docs.clear();
  rejectComposite.clear();
  authUsersByPhone.clear();
  vi.useRealTimers();

  set(`users/${ADMIN}`, { role: 'senior_admin', assignedGroupIds: [] });
  set(`groups/${GROUP}`, { name: 'Test Group', memberCount: 0 });
});

function addRosterMember(overrides: Row = {}) {
  set(`access_roster/919876500001`, {
    name: 'Asha',
    phoneNumber: PHONE,
    role: 'user',
    groupId: GROUP,
    groupIds: [GROUP],
    assignedGroupIds: [],
    status: 'active',
    ...overrides,
  });
}

/** The group-scoped assignment doc the server writes today. */
function addAssignment(groupId = GROUP, overrides: Row = {}) {
  set(`member_practice_assignments/${MEMBER_KEY}_${groupId}`, {
    uid: MEMBER_KEY,
    memberKey: MEMBER_KEY,
    groupId,
    phoneNumber: PHONE,
    items: ITEMS,
    ...overrides,
  });
}

/** A member who has actually signed in, so their profile carries the group grants. */
function addSignedInMember(authUid: string, groupIds: string[]) {
  authUsersByPhone.set(PHONE, authUid);
  set(`users/${authUid}`, {
    name: 'Asha',
    phoneNumber: PHONE,
    role: 'user',
    groupId: groupIds[0] ?? null,
    groupIds,
    assignedGroupIds: [],
    memberKey: MEMBER_KEY,
  });
}

describe('roster and practice agree on group membership', () => {
  it('lists a member on both People and Practice', async () => {
    addRosterMember();
    addAssignment();

    const people = await listAccessRosterCore({
      actorUid: ADMIN,
      groupId: GROUP,
      role: 'all',
      status: 'active',
    });
    const practice = await getPracticeAdminOverviewCore({ groupId: GROUP });

    expect(people.entries.map((e) => e.phoneNumber)).toContain(PHONE);
    expect(practice.members.map((m) => m.phoneNumber)).toContain(PHONE);
    expect(practice.memberCount).toBe(1);
    expect(practice.members[0]?.items).toHaveLength(2);
  });

  it('still lists the member when the roster and log composite indexes are unavailable', async () => {
    addRosterMember();
    addAssignment();
    rejectComposite.add('access_roster');
    rejectComposite.add('practice_completion_logs');

    const practice = await getPracticeAdminOverviewCore({ groupId: GROUP });
    expect(practice.members.map((m) => m.phoneNumber)).toContain(PHONE);
    expect(practice.memberCount).toBe(1);
  });

  it('lists the member even when their assignment doc carries a stale groupId', async () => {
    addRosterMember();
    // The doc id scopes it to GROUP; a stale groupId field inside cannot move it.
    addAssignment(GROUP, { groupId: 'grp_old' });

    const practice = await getPracticeAdminOverviewCore({ groupId: GROUP });
    const member = practice.members.find((m) => m.phoneNumber === PHONE);
    expect(member).toBeDefined();
    expect(member?.items).toHaveLength(2);
  });

  it('lists roster docs written before the status and groupIds fields existed', async () => {
    set(`access_roster/919876500009`, {
      name: 'Legacy',
      phoneNumber: '+919876500009',
      role: 'user',
      groupId: GROUP,
    });

    const practice = await getPracticeAdminOverviewCore({ groupId: GROUP });
    expect(practice.members.map((m) => m.phoneNumber)).toContain('+919876500009');
  });

  it('excludes admins and deactivated members', async () => {
    set(`access_roster/919876500002`, {
      name: 'Admin Person',
      phoneNumber: '+919876500002',
      role: 'admin',
      groupId: null,
      assignedGroupIds: [GROUP],
      status: 'active',
    });
    set(`access_roster/919876500003`, {
      name: 'Gone',
      phoneNumber: '+919876500003',
      role: 'user',
      groupId: GROUP,
      status: 'inactive',
    });

    const practice = await getPracticeAdminOverviewCore({ groupId: GROUP });
    const phones = practice.members.map((m) => m.phoneNumber);
    expect(phones).not.toContain('+919876500002');
    expect(phones).not.toContain('+919876500003');
  });
});

describe('completion attribution across alias ids', () => {
  it('credits a completion stored only under the Auth uid to the roster member', async () => {
    const authUid = 'auth_uid_1';
    authUsersByPhone.set(PHONE, authUid);
    addRosterMember();
    addAssignment();
    // Legacy-shaped logs: no memberKey, only the account uid.
    for (const itemKey of ['adhyay_01', 'adhyay_02']) {
      set(`practice_completion_logs/${authUid}_2026-01-01_${itemKey}`, {
        uid: authUid,
        groupId: GROUP,
        practiceDateKey: '2026-01-01',
        itemKey,
      });
    }

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T08:00:00Z'));
    const practice = await getPracticeAdminOverviewCore({ groupId: GROUP });
    vi.useRealTimers();

    const member = practice.members.find((m) => m.phoneNumber === PHONE);
    expect(member?.allComplete).toBe(true);
    expect(practice.completeCount).toBe(1);
    expect(practice.incompleteCount).toBe(0);
  });

  it('writes a completion under the caller uid and stamps the memberKey', async () => {
    addRosterMember();
    addSignedInMember('auth_uid_1', [GROUP]);
    addAssignment();

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T08:00:00Z'));
    const result = await markPracticeItemCompleteCore({
      uid: 'auth_uid_1',
      groupId: GROUP,
      itemKey: 'adhyay_01',
    });
    vi.useRealTimers();

    expect(docs.get(`practice_completion_logs/${result.logId}`)).toMatchObject({
      uid: 'auth_uid_1',
      memberKey: MEMBER_KEY,
      itemKey: 'adhyay_01',
    });
  });

  it('refuses a completion for a group the member does not belong to', async () => {
    addRosterMember();
    addSignedInMember('auth_uid_1', [GROUP]);
    addAssignment();

    // The member is in GROUP only; a groupId the client supplies is not authority.
    await expect(
      markPracticeItemCompleteCore({
        uid: 'auth_uid_1',
        groupId: 'some_other_group',
        itemKey: 'adhyay_01',
      })
    ).rejects.toThrow(/not a member of this group/);
  });

  it('keeps each group’s completions separate for a member in two groups', async () => {
    addRosterMember({ groupIds: [GROUP, 'grp_two'] });
    addSignedInMember('auth_uid_1', [GROUP, 'grp_two']);
    addAssignment();
    addAssignment('grp_two');

    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T08:00:00Z'));
    const first = await markPracticeItemCompleteCore({
      uid: 'auth_uid_1',
      groupId: GROUP,
      itemKey: 'adhyay_01',
    });

    expect(first.logId).toContain(`_${GROUP}_`);

    // The other group must not show it: same member, same day, different group.
    const otherDay = await getMyPracticeTodayCore({ uid: 'auth_uid_1', groupId: 'grp_two' });
    expect(otherDay.assignment?.groupId).toBe('grp_two');
    expect(otherDay.items.find((i) => i.itemKey === 'adhyay_01')?.completed).toBe(false);

    const firstDay = await getMyPracticeTodayCore({ uid: 'auth_uid_1', groupId: GROUP });
    expect(firstDay.items.find((i) => i.itemKey === 'adhyay_01')?.completed).toBe(true);
    vi.useRealTimers();
  });

  it('lists a multi-group member in both groups on the roster', async () => {
    addRosterMember({ groupIds: [GROUP, 'grp_two'] });
    addSignedInMember('auth_uid_1', [GROUP, 'grp_two']);

    const peopleInGroup1 = await listAccessRosterCore({
      actorUid: ADMIN,
      groupId: GROUP,
      role: 'all',
      status: 'active',
    });
    const peopleInGroup2 = await listAccessRosterCore({
      actorUid: ADMIN,
      groupId: 'grp_two',
      role: 'all',
      status: 'active',
    });

    expect(peopleInGroup1.entries.map((e) => e.phoneNumber)).toContain(PHONE);
    expect(peopleInGroup2.entries.map((e) => e.phoneNumber)).toContain(PHONE);

    const member1 = peopleInGroup1.entries.find((e) => e.phoneNumber === PHONE);
    const member2 = peopleInGroup2.entries.find((e) => e.phoneNumber === PHONE);
    expect(member1?.groupIds).toEqual([GROUP, 'grp_two']);
    expect(member2?.groupIds).toEqual([GROUP, 'grp_two']);
  });

  it('allows a multi-group member to log in and resolves all their groups', async () => {
    const { hashPin } = await import('../../functions/src/pin-auth');
    addRosterMember({
      groupIds: [GROUP, 'grp_two'],
      pinHash: hashPin('1234'), // join PIN
    });

    // Member logs in with join PIN from their primary group
    const { resolveLogin } = await import('../../functions/src/pin-auth');
    const login = await resolveLogin(PHONE, '1234');

    expect(login.role).toBe('user');
    if (login.role === 'user') {
      expect(login.groupIds).toEqual([GROUP, 'grp_two']);
      expect(login.groupId).toBe(GROUP); // primary group

      // Profile should be created with all groups
      const { upsertProfileFromLogin } = await import('../../functions/src/pin-auth');
      await upsertProfileFromLogin('auth_uid_1', login);

      const profile = docs.get('users/auth_uid_1');
      expect(profile?.groupIds).toEqual([GROUP, 'grp_two']);
      expect(profile?.groupId).toBe(GROUP);
      // Names travel with the membership so the switcher can label both groups even
      // if reading a group document from the client fails.
      expect(profile?.groupNames).toEqual({ [GROUP]: 'Test Group' });
    }
  });

  it('stamps group names onto the profile at login, including the secondary group', async () => {
    const { hashPin } = await import('../../functions/src/pin-auth');
    set('groups/grp_two', { name: 'Second Group' });
    addRosterMember({ groupIds: [GROUP, 'grp_two'], pinHash: hashPin('1234') });

    const { resolveLogin, upsertProfileFromLogin } = await import('../../functions/src/pin-auth');
    const login = await resolveLogin(PHONE, '1234');
    await upsertProfileFromLogin('auth_uid_names', login);

    expect(docs.get('users/auth_uid_names')?.groupNames).toEqual({
      [GROUP]: 'Test Group',
      grp_two: 'Second Group',
    });
  });

  it('allows a multi-group member to log in using a join PIN from their secondary group', async () => {
    const { hashPin, writeGroupJoinPin } = await import('../../functions/src/pin-auth');
    addRosterMember({
      groupIds: [GROUP, 'grp_two'],
    });

    // Generate join PIN for the SECONDARY group only
    const pinHash = hashPin('4321');
    await writeGroupJoinPin({ groupId: 'grp_two', actorUid: ADMIN, pinHash });

    // Member logs in with the secondary group's PIN
    const { resolveLogin } = await import('../../functions/src/pin-auth');
    const login = await resolveLogin(PHONE, '4321');

    expect(login.role).toBe('user');
    if (login.role === 'user') {
      // Should resolve ALL groups the member belongs to, not just the one the PIN came from
      expect(login.groupIds).toEqual([GROUP, 'grp_two']);
      expect(login.groupId).toBe(GROUP); // primary group
    }
  });

  it('rejects login when roster has no groupIds (exact error from user report)', async () => {
    const { hashPin, writeGroupJoinPin } = await import('../../functions/src/pin-auth');
    // Roster entry exists but has NO groupIds (legacy or buggy)
    set(`access_roster/919876500001`, {
      name: 'Test User',
      phoneNumber: PHONE,
      role: 'user',
      // NO groupId, NO groupIds
      status: 'active',
    });
    // Generate PIN for some group
    const pinHash = hashPin('1234');
    await writeGroupJoinPin({ groupId: GROUP, actorUid: ADMIN, pinHash });

    const { resolveLogin } = await import('../../functions/src/pin-auth');
    await expect(resolveLogin(PHONE, '1234')).rejects.toThrow('No group assigned');
  });
});

describe('assignment writes', () => {
  it('treats an empty item list as "nothing to assign" instead of failing', async () => {
    addRosterMember();
    const result = await setMemberPracticeAssignmentCore({
      actorUid: ADMIN,
      phoneNumber: PHONE,
      groupId: GROUP,
      items: [],
    });
    expect(result.items).toEqual([]);
    expect(result.changed).toBe(false);
  });

  it('mirrors the assignment onto the Auth uid so the member app reads it directly', async () => {
    addRosterMember();
    authUsersByPhone.set(PHONE, 'auth_uid_1');

    await setMemberPracticeAssignmentCore({
      actorUid: ADMIN,
      phoneNumber: PHONE,
      groupId: GROUP,
      items: ITEMS,
    });

    // Mirrored per group, so the member app can read its own alias directly.
    for (const docId of [`${MEMBER_KEY}_${GROUP}`, `auth_uid_1_${GROUP}`]) {
      const stored = docs.get(`member_practice_assignments/${docId}`);
      expect(stored, `missing assignment for ${docId}`).toBeDefined();
      expect(stored?.groupId).toBe(GROUP);
      expect(stored?.memberKey).toBe(MEMBER_KEY);
      expect(stored?.items).toHaveLength(2);
    }
  });

  it('carries the standing practice to a member moved to another group', async () => {
    addRosterMember();
    authUsersByPhone.set(PHONE, 'auth_uid_1');
    await setMemberPracticeAssignmentCore({
      actorUid: ADMIN,
      phoneNumber: PHONE,
      groupId: GROUP,
      items: ITEMS,
    });
    set(`groups/grp_new`, { name: 'New Group' });

    await upsertAccessRosterEntry({
      actorUid: ADMIN,
      phoneNumber: PHONE,
      name: 'Asha',
      role: 'user',
      groupId: 'grp_new',
      status: 'active',
    });

    // Roster and practice both point at the new group, and the plan is re-stamped
    // under the new group's id so the member's practice follows the move.
    expect(docs.get('access_roster/919876500001')?.groupId).toBe('grp_new');
    expect(docs.get('access_roster/919876500001')?.groupIds).toEqual(['grp_new']);
    expect(docs.get(`member_practice_assignments/${MEMBER_KEY}_grp_new`)?.groupId).toBe(
      'grp_new'
    );

    const moved = await getPracticeAdminOverviewCore({ groupId: 'grp_new' });
    expect(moved.members.map((m) => m.phoneNumber)).toContain(PHONE);
    expect(moved.memberCount).toBe(1);
  });
});

describe('roster writes reach the member profile immediately', () => {
  it('propagates a group change onto an already signed-in profile', async () => {
    addRosterMember();
    authUsersByPhone.set(PHONE, 'auth_uid_1');
    set(`users/auth_uid_1`, {
      phoneNumber: PHONE,
      name: 'Asha',
      role: 'user',
      groupId: 'grp_before',
      assignedGroupIds: [],
    });
    set(`groups/grp_after`, { name: 'After' });

    await upsertAccessRosterEntry({
      actorUid: ADMIN,
      phoneNumber: PHONE,
      name: 'Asha Rao',
      role: 'user',
      groupId: 'grp_after',
      status: 'active',
    });

    const profile = docs.get('users/auth_uid_1');
    expect(profile?.groupId).toBe('grp_after');
    expect(profile?.name).toBe('Asha Rao');
    expect(profile?.rosterStatus).toBe('active');
  });

  it('clears group access on deactivation', async () => {
    addRosterMember();
    authUsersByPhone.set(PHONE, 'auth_uid_1');
    set(`users/auth_uid_1`, {
      phoneNumber: PHONE,
      role: 'user',
      groupId: GROUP,
      assignedGroupIds: [],
    });

    const { deactivateAccessRosterEntry } = await import('../../functions/src/roster');
    await deactivateAccessRosterEntry({ actorUid: ADMIN, phoneNumber: PHONE });

    const profile = docs.get('users/auth_uid_1');
    expect(profile?.groupId).toBeNull();
    expect(profile?.rosterStatus).toBe('inactive');
  });
});

describe('groupIds backfill', () => {
  it('drops a membership whose group document no longer exists', async () => {
    const { resolveMemberships } = await import('../../functions/src/group-membership');
    // grp_gone has no document — a stale id left behind by a deleted group.
    set('groups/grp_real', { name: 'Real Group' });

    const resolved = await resolveMemberships(['grp_real', 'grp_gone', 'grp_real']);

    expect(resolved.groupIds).toEqual(['grp_real']);
    expect(resolved.groupNames).toEqual({ grp_real: 'Real Group' });
  });

  it('derives the array from the scalar and stamps the profile memberKey', async () => {
    // Legacy shapes: scalar groupId only, no array, no memberKey anywhere.
    set('access_roster/919876500007', {
      name: 'Legacy',
      phoneNumber: '+919876500007',
      role: 'user',
      groupId: GROUP,
      status: 'active',
    });
    set('users/legacy_uid', {
      name: 'Legacy',
      phoneNumber: '+919876500007',
      role: 'user',
      groupId: GROUP,
    });

    const result = await backfillGroupIds(ADMIN);

    expect(result.updated).toBeGreaterThan(0);
    expect(docs.get('access_roster/919876500007')?.groupIds).toEqual([GROUP]);
    expect(docs.get('users/legacy_uid')?.groupIds).toEqual([GROUP]);
    // The transitional rules identify an assignment owner by memberKey, so a
    // profile without it cannot read its own group-scoped assignment.
    expect(docs.get('users/legacy_uid')?.memberKey).toBe(phoneToUid('+919876500007'));
  });

  it('is idempotent and leaves an admin profile without a memberKey', async () => {
    addRosterMember();
    addSignedInMember('auth_uid_1', [GROUP]);
    set('users/other_admin_uid', {
      name: 'Admin',
      phoneNumber: '+919876500010',
      role: 'admin',
      groupIds: [],
      assignedGroupIds: [GROUP],
    });

    const first = await backfillGroupIds(ADMIN);
    expect(first.updated).toBe(0);
    const second = await backfillGroupIds(ADMIN);
    expect(second.updated).toBe(0);
    // An admin has no member alias; stamping one would let a member-key rule
    // match an admin's assignments.
    expect(docs.get('users/other_admin_uid')?.memberKey).toBeUndefined();
  });
});

/* Referenced so the sentinel constants stay documented alongside the fake. */
export const FAKE_FIRESTORE_SENTINELS = { SERVER_TS, DELETE };
