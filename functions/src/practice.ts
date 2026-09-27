/**
 * Standing Adhyay / Aarti practice assignments + noon-IST daily completion logs.
 */

import {
  FieldValue,
  type DocumentData,
  type DocumentReference,
  type Query,
} from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

import { db } from './firebase-admin';
import { readGroupIds } from './group-membership';
import {
  findAuthUidByPhone,
  phoneToRosterId,
  phoneToUid,
  resolveMemberAliases,
  type MemberAliases,
} from './member-identity';
import { sendUserPracticePush } from './push';
import { loadActiveGroupMembers, type GroupRosterMember } from './roster-query';
import { getZonedParts, zonedDateKey } from './schedule-math';

export const PRACTICE_TIMEZONE = 'Asia/Kolkata';
export const AARTI_ITEM_KEY = 'aarti';
export const REQUIRED_ADHYAY_COUNT = 2;

export type PracticeItemType = 'adhyay' | 'aarti';

export interface PracticeItem {
  type: PracticeItemType;
  chapterNumber?: number;
  itemKey: string;
}

const COLLECTION_ASSIGNMENTS = 'member_practice_assignments';
const COLLECTION_LOGS = 'practice_completion_logs';
const COLLECTION_NOTIFICATIONS = 'notifications';
const COLLECTION_CHAPTERS = 'gita_chapters';
const COLLECTION_USERS = 'users';

export function adhyayItemKey(chapterNumber: number): string {
  return `adhyay_${String(chapterNumber).padStart(2, '0')}`;
}

export function buildAdhyayItem(chapterNumber: number): PracticeItem {
  return {
    type: 'adhyay',
    chapterNumber,
    itemKey: adhyayItemKey(chapterNumber),
  };
}

export function buildAartiItem(): PracticeItem {
  return { type: 'aarti', itemKey: AARTI_ITEM_KEY };
}

/** Noon IST boundary: before 12:00 → yesterday; from 12:00 → today. */
export function practiceDateKey(now: Date = new Date(), timeZone = PRACTICE_TIMEZONE): string {
  const parts = getZonedParts(now, timeZone);
  if (parts.hour < 12) {
    const prev = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
    prev.setUTCDate(prev.getUTCDate() - 1);
    return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}-${String(prev.getUTCDate()).padStart(2, '0')}`;
  }
  return zonedDateKey(now, timeZone);
}

/**
 * Completion log id, per (member, group, day, item).
 *
 * The group is part of the id because a member in two groups practises separately:
 * without it, marking Adhyay 1 done in one group would tick it off in the other.
 */
export function practiceLogDocId(
  uid: string,
  groupId: string,
  dateKey: string,
  itemKey: string
): string {
  return `${uid}_${groupId}_${dateKey}_${itemKey}`;
}

/** Pre-multi-group log id. Read as a fallback so old history still shows. */
export function legacyPracticeLogDocId(uid: string, dateKey: string, itemKey: string): string {
  return `${uid}_${dateKey}_${itemKey}`;
}

/** Standing assignment id, per (member, group) — one plan per group. */
export function assignmentDocId(aliasUid: string, groupId: string): string {
  return `${aliasUid}_${groupId}`;
}

/**
 * Pre-multi-group assignment id: a single plan for the whole member, stamped with
 * the group it belonged to. Read as a fallback for that group only.
 */
export function legacyAssignmentDocId(aliasUid: string): string {
  return aliasUid;
}

export function normalizePracticeItems(raw: unknown): PracticeItem[] {
  if (!Array.isArray(raw)) return [];
  const items: PracticeItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const data = entry as Record<string, unknown>;
    if (data.type === 'aarti') {
      items.push(buildAartiItem());
      continue;
    }
    if (data.type === 'adhyay') {
      const chapterNumber = Number(data.chapterNumber);
      if (!Number.isInteger(chapterNumber) || chapterNumber < 1 || chapterNumber > 18) continue;
      items.push(buildAdhyayItem(chapterNumber));
    }
  }
  return items;
}

export function assertValidPracticeItems(items: PracticeItem[]) {
  if (items.length < 2 || items.length > 3) {
    throw new HttpsError('invalid-argument', 'Assign exactly 2 Adhyays, and optionally Aarti.');
  }
  const adhyays = items.filter((item) => item.type === 'adhyay');
  const aartis = items.filter((item) => item.type === 'aarti');
  if (adhyays.length !== REQUIRED_ADHYAY_COUNT) {
    throw new HttpsError('invalid-argument', 'Assign exactly 2 Adhyays.');
  }
  if (aartis.length > 1) {
    throw new HttpsError('invalid-argument', 'Aarti can be assigned at most once.');
  }
  const chapters = new Set<number>();
  for (const item of adhyays) {
    const chapter = Number(item.chapterNumber);
    if (!Number.isInteger(chapter) || chapter < 1 || chapter > 18) {
      throw new HttpsError('invalid-argument', 'Adhyay must be between 1 and 18.');
    }
    if (chapters.has(chapter)) {
      throw new HttpsError('invalid-argument', 'Adhyays must be different chapters.');
    }
    chapters.add(chapter);
  }
}

function sameItems(a: PracticeItem[], b: PracticeItem[]): boolean {
  if (a.length !== b.length) return false;
  const key = (item: PracticeItem) => `${item.type}:${item.itemKey}`;
  const left = new Set(a.map(key));
  return b.every((item) => left.has(key(item)));
}

/** Resilient query runner: a composite index can lag behind a functions deploy. */
async function tryQueryDocs(query: Query) {
  try {
    return (await query.get()).docs;
  } catch (error) {
    console.warn('practice_query_failed', { error: error instanceof Error ? error.message : error });
    return null;
  }
}

async function requireMemberAliases(input: {
  uid?: string | null;
  phoneNumber?: string | null;
}): Promise<MemberAliases> {
  const aliases = await resolveMemberAliases(input);
  if (aliases.uids.length === 0) {
    throw new HttpsError('invalid-argument', 'Member uid or phone number is required.');
  }
  return aliases;
}

/**
 * Ids to read/write, phone-keyed id first. It exists before the member ever
 * signs in, so it is the reliable source; the Auth uid is mirrored onto it.
 */
function aliasReadOrder(aliases: MemberAliases): string[] {
  if (!aliases.memberKey) return aliases.uids;
  return [aliases.memberKey, ...aliases.uids.filter((uid) => uid !== aliases.memberKey)];
}

type AssignmentRecord = {
  uid: string;
  data: Record<string, unknown>;
  items: PracticeItem[];
};

async function loadAssignmentForAliases(
  aliases: MemberAliases,
  groupId: string
): Promise<AssignmentRecord | null> {
  const order = aliasReadOrder(aliases);
  if (order.length === 0 || !groupId) return null;

  const toRecord = (snap: { id: string; exists: boolean; data: () => DocumentData | undefined }) =>
    snap.exists
      ? {
          uid: snap.id,
          data: (snap.data() ?? {}) as Record<string, unknown>,
          items: normalizePracticeItems(snap.data()?.items),
        }
      : null;

  // Group-scoped docs first — this is the shape every new write uses.
  const scopedSnaps = await db.getAll(
    ...order.map((uid) => db.collection(COLLECTION_ASSIGNMENTS).doc(assignmentDocId(uid, groupId)))
  );
  const scoped = scopedSnaps.map(toRecord).filter((entry): entry is AssignmentRecord => entry !== null);
  const scopedHit = scoped.find((entry) => entry.items.length > 0) ?? scoped[0] ?? null;
  if (scopedHit) return scopedHit;

  // Fallback to the pre-multi-group doc, but only for the group it was stamped
  // with. Without that check a single legacy plan would show up in every group the
  // member belongs to, which is exactly the double-count this scheme exists to stop.
  const legacySnaps = await db.getAll(
    ...order.map((uid) => db.collection(COLLECTION_ASSIGNMENTS).doc(legacyAssignmentDocId(uid)))
  );
  const legacy = legacySnaps
    .map(toRecord)
    .filter((entry): entry is AssignmentRecord => entry !== null)
    .filter((entry) => String(entry.data.groupId ?? '') === groupId);

  return legacy.find((entry) => entry.items.length > 0) ?? legacy[0] ?? null;
}

/**
 * Persist a standing assignment under *every* alias id, for one group.
 *
 * The member's home screen reads `member_practice_assignments/{authUid}_{groupId}`
 * straight from Firestore, so a write that only lands on the phone-keyed doc stays
 * invisible until the next sign-in. Writing all aliases is what makes an admin's
 * change show up straight away, with no new app build required.
 */
async function writeAssignmentDocs(input: {
  aliases: MemberAliases;
  groupId: string;
  items: PracticeItem[];
  actorUid: string;
  name?: string;
}) {
  const { aliases, groupId, items, actorUid } = input;
  const memberKey = aliases.memberKey ?? phoneToUid(aliases.phoneNumber ?? '');
  const batch = db.batch();
  for (const uid of aliasReadOrder(aliases)) {
    batch.set(
      db.collection(COLLECTION_ASSIGNMENTS).doc(assignmentDocId(uid, groupId)),
      {
        uid: assignmentDocId(uid, groupId),
        memberKey,
        // Recorded so the admin screens can address notifications and push at the
        // real account without a users scan or an Auth round trip.
        authUid: aliases.authUid && aliases.authUid !== uid ? aliases.authUid : null,
        groupId,
        groupIds: [groupId],
        phoneNumber: aliases.phoneNumber,
        // Carried on the doc so a member removed from the group can still be shown
        // by name in that group's monthly report, which keeps their history.
        name: input.name ?? null,
        items,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: actorUid,
      },
      { merge: true }
    );
  }
  await batch.commit();
}

/** Tell the member their standing practice changed (the client already renders this type). */
async function notifyPracticeAssignmentChanged(input: {
  aliases: MemberAliases;
  groupId: string;
  items: PracticeItem[];
}) {
  const { aliases, groupId, items } = input;
  const targetUid = aliases.authUid;
  if (!targetUid || items.length === 0) return;

  const body = `Your standing practice is now: ${assignmentLabel(items)}.`;

  // Deterministic id per (member, item set) keeps retries and double taps quiet.
  const fingerprint = items
    .map((item) => item.itemKey)
    .sort()
    .join('_')
    .slice(0, 80);
  const ref = db
    .collection(COLLECTION_NOTIFICATIONS)
    .doc(`practice_assigned_${aliases.memberKey ?? targetUid}_${fingerprint}`);

  try {
    await ref.create({
      uid: targetUid,
      groupId,
      type: 'practice_assigned',
      title: 'Practice updated',
      body,
      createdAt: FieldValue.serverTimestamp(),
      readAt: null,
      data: { screen: 'practice' },
    });
  } catch (error) {
    const alreadyExists =
      (typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: unknown }).code)
        : '') === '6' || /ALREADY_EXISTS/i.test(String(error));
    if (!alreadyExists) {
      console.warn('practice_assigned_notification_failed', { uid: targetUid, error });
    }
  }
}

/**
 * Copy the phone-keyed assignment onto the Auth uid after the first sign-in, for
 * every group the member belongs to.
 *
 * This doubles as the assignment migration: a pre-multi-group doc (id = the alias
 * id, stamped with one `groupId`) is copied to the new `{alias}_{groupId}` id the
 * first time its owner signs in, so no separate backfill job is needed and the
 * legacy doc is left untouched as a rollback path.
 */
export async function syncPracticeAssignmentToAuthUid(input: { uid: string; phoneNumber: string }) {
  const uid = input.uid.trim();
  const phoneNumber = input.phoneNumber.trim();
  if (!uid || !phoneNumber) return;

  const memberKey = phoneToUid(phoneNumber);
  const groupIds = await loadMemberGroupIds(uid, phoneNumber);
  if (groupIds.length === 0) return;

  for (const groupId of groupIds) {
    const destRef = db.collection(COLLECTION_ASSIGNMENTS).doc(assignmentDocId(uid, groupId));
    const destSnap = await destRef.get();
    const destItems = normalizePracticeItems(destSnap.data()?.items);
    if (destItems.length > 0) continue;

    const sourceRef = db
      .collection(COLLECTION_ASSIGNMENTS)
      .doc(assignmentDocId(memberKey, groupId));
    const sourceSnap = await sourceRef.get();
    let items = normalizePracticeItems(sourceSnap.data()?.items);

    if (items.length === 0) {
      // Not migrated yet — read the pre-multi-group doc, but only if it belongs to
      // this group, so one legacy plan never leaks into the member's other groups.
      const legacySnap = await db
        .collection(COLLECTION_ASSIGNMENTS)
        .doc(legacyAssignmentDocId(memberKey))
        .get();
      if (String(legacySnap.data()?.groupId ?? '') === groupId) {
        items = normalizePracticeItems(legacySnap.data()?.items);
      }
    }
    if (items.length === 0) continue;

    await writeAssignmentDocs({
      aliases: { uid, memberKey, authUid: uid, phoneNumber, uids: [uid, memberKey] },
      groupId,
      items,
      actorUid: '',
      name: typeof sourceSnap.data()?.name === 'string' ? sourceSnap.data()?.name : undefined,
    });
  }
}

/**
 * The groups a member belongs to, from their profile, falling back to the roster.
 * The profile is preferred because it is what the client and the rules also read.
 */
async function loadMemberGroupIds(uid: string, phoneNumber: string): Promise<string[]> {
  try {
    const snap = await db.collection(COLLECTION_USERS).doc(uid).get();
    const fromProfile = readGroupIds(snap.data());
    if (fromProfile.length > 0) return fromProfile;
  } catch (error) {
    console.warn('practice_group_lookup_failed', { uid, error });
  }

  try {
    const roster = await db.collection('access_roster').doc(phoneToRosterId(phoneNumber)).get();
    return readGroupIds(roster.data());
  } catch (error) {
    console.warn('practice_roster_group_lookup_failed', { phoneNumber, error });
    return [];
  }
}

/**
 * Reject a member-supplied `groupId` they are not a member of.
 *
 * With one group per member this was implicit. Now that a member carries a list of
 * groups, `groupId` arrives from the client, so without this check a member could
 * read another group's practice, tick off items they were never assigned, and
 * write completions into a report they have nothing to do with.
 */
async function assertMemberBelongsToGroup(uid: string, groupId: string): Promise<void> {
  if (!groupId) {
    throw new HttpsError('invalid-argument', 'Group is required.');
  }
  const snap = await db.collection(COLLECTION_USERS).doc(uid).get();
  const data = snap.data();
  if (!data) {
    throw new HttpsError('permission-denied', 'Not allowed.');
  }
  // An inactive member keeps no group grants at all.
  if (data.rosterStatus === 'inactive') {
    throw new HttpsError('permission-denied', 'This account is inactive.');
  }
  const groupIds = readGroupIds(data);
  if (!groupIds.includes(groupId)) {
    throw new HttpsError('permission-denied', 'You are not a member of this group.');
  }
}

const CHAPTER_TITLE_FALLBACK: Record<number, { titleEn: string; titleHi: string }> = {
  1: { titleEn: 'Arjuna Vishada Yoga', titleHi: 'अर्जुन विषाद योग' },
  2: { titleEn: 'Sankhya Yoga', titleHi: 'सांख्य योग' },
  3: { titleEn: 'Karma Yoga', titleHi: 'कर्म योग' },
  4: { titleEn: 'Jnana Karma Sanyasa Yoga', titleHi: 'ज्ञान कर्म संन्यास योग' },
  5: { titleEn: 'Karma Sanyasa Yoga', titleHi: 'कर्म संन्यास योग' },
  6: { titleEn: 'Dhyana Yoga', titleHi: 'ध्यान योग' },
  7: { titleEn: 'Jnana Vijnana Yoga', titleHi: 'ज्ञान विज्ञान योग' },
  8: { titleEn: 'Akshara Brahma Yoga', titleHi: 'अक्षर ब्रह्म योग' },
  9: { titleEn: 'Raja Vidya Raja Guhya Yoga', titleHi: 'राजविद्या राजगुह्य योग' },
  10: { titleEn: 'Vibhuti Yoga', titleHi: 'विभूति योग' },
  11: { titleEn: 'Vishwarupa Darshana Yoga', titleHi: 'विश्वरूप दर्शन योग' },
  12: { titleEn: 'Bhakti Yoga', titleHi: 'भक्ति योग' },
  13: { titleEn: 'Kshetra Kshetragna Vibhaga Yoga', titleHi: 'क्षेत्र क्षेत्रज्ञ विभाग योग' },
  14: { titleEn: 'Gunatraya Vibhaga Yoga', titleHi: 'गुणत्रय विभाग योग' },
  15: { titleEn: 'Purushottama Yoga', titleHi: 'पुरुषोत्तम योग' },
  16: { titleEn: 'Daivasura Sampad Vibhaga Yoga', titleHi: 'दैवासुर संपद विभाग योग' },
  17: { titleEn: 'Shraddhatraya Vibhaga Yoga', titleHi: 'श्रद्धात्रय विभाग योग' },
  18: { titleEn: 'Moksha Sanyasa Yoga', titleHi: 'मोक्ष संन्यास योग' },
};

let chapterTitleCache: Map<number, { titleEn: string; titleHi: string }> | null = null;

async function loadChapterTitles(chapterNumbers: number[]) {
  const unique = [...new Set(chapterNumbers.filter((n) => n >= 1 && n <= 18))];
  const map = new Map<number, { titleEn: string; titleHi: string }>();
  for (const n of unique) {
    map.set(n, CHAPTER_TITLE_FALLBACK[n] ?? { titleEn: `Adhyay ${n}`, titleHi: `अध्याय ${n}` });
  }

  // Warm once per function instance from Firestore; fall back to static map.
  if (!chapterTitleCache) {
    try {
      const snap = await db.collection(COLLECTION_CHAPTERS).get();
      chapterTitleCache = new Map();
      for (const doc of snap.docs) {
        const data = doc.data() ?? {};
        const chapterNumber = Number(data.chapterNumber ?? doc.id);
        if (chapterNumber >= 1 && chapterNumber <= 18) {
          chapterTitleCache.set(chapterNumber, {
            titleEn: String(
              data.titleEn ?? CHAPTER_TITLE_FALLBACK[chapterNumber]?.titleEn ?? `Adhyay ${chapterNumber}`
            ),
            titleHi: String(
              data.titleHi ?? CHAPTER_TITLE_FALLBACK[chapterNumber]?.titleHi ?? `अध्याय ${chapterNumber}`
            ),
          });
        }
      }
    } catch {
      chapterTitleCache = new Map(
        Object.entries(CHAPTER_TITLE_FALLBACK).map(([k, v]) => [Number(k), v])
      );
    }
  }

  for (const n of unique) {
    const cached = chapterTitleCache.get(n);
    if (cached) map.set(n, cached);
  }
  return map;
}

function assignmentLabel(items: PracticeItem[]): string {
  return items
    .map((item) => (item.type === 'aarti' ? 'Aarti' : `Adhyay ${item.chapterNumber}`))
    .join(', ');
}

function enrichItems(
  items: PracticeItem[],
  completedKeys: Set<string>,
  titles: Map<number, { titleEn: string; titleHi: string }>
) {
  return items.map((item) => {
    if (item.type === 'aarti') {
      return {
        ...item,
        completed: completedKeys.has(item.itemKey),
        titleEn: 'Aarti',
        titleHi: 'आरती',
      };
    }
    const chapter = Number(item.chapterNumber);
    const title = titles.get(chapter);
    return {
      ...item,
      completed: completedKeys.has(item.itemKey),
      titleEn: title?.titleEn ?? `Adhyay ${chapter}`,
      titleHi: title?.titleHi ?? `अध्याय ${chapter}`,
    };
  });
}

/**
 * Completed item keys for one group on one practice day.
 *
 * `groupId` is part of the query, not just the doc id: a member practises each
 * group separately, so Group 1's Adhyay 1 must not tick off Group 7's.
 */
async function loadCompletedKeys(
  uid: string,
  groupId: string,
  dateKey: string
): Promise<Set<string>> {
  const snap = await db
    .collection(COLLECTION_LOGS)
    .where('uid', '==', uid)
    .where('groupId', '==', groupId)
    .where('practiceDateKey', '==', dateKey)
    .get();
  const keys = new Set<string>();
  for (const doc of snap.docs) {
    const itemKey = doc.data()?.itemKey;
    if (typeof itemKey === 'string' && itemKey) keys.add(itemKey);
  }
  return keys;
}

async function loadCompletedKeysForUids(
  uids: string[],
  groupId: string,
  dateKey: string
): Promise<Set<string>> {
  const unique = [...new Set(uids)];
  if (unique.length === 0) return new Set();

  const keys = new Set<string>();
  await Promise.all(
    unique.map(async (uid) => {
      for (const key of await loadCompletedKeys(uid, groupId, dateKey)) keys.add(key);
    })
  );
  return keys;
}

export async function setMemberPracticeAssignmentCore(input: {
  actorUid: string;
  uid?: string;
  phoneNumber?: string;
  groupId: string;
  items: unknown;
  name?: string;
}) {
  const groupId = input.groupId.trim();
  if (!groupId) {
    throw new HttpsError('invalid-argument', 'Group is required.');
  }

  const items = normalizePracticeItems(input.items);

  // The roster editor always calls this right after saving a member, even when the
  // admin never touched the practice picker. Rejecting an empty list is what made
  // "add member" fail outright, so treat it as "nothing to assign" instead.
  if (items.length === 0) {
    const aliases = await requireMemberAliases(input);
    return {
      uid: aliases.uid,
      phoneNumber: aliases.phoneNumber,
      groupId,
      items: [] as PracticeItem[],
      changed: false,
    };
  }

  assertValidPracticeItems(items);

  // Group existence and member identity are independent — resolve them together.
  const [aliases, groupSnap] = await Promise.all([
    requireMemberAliases(input),
    db.collection('groups').doc(groupId).get(),
  ]);
  if (!groupSnap.exists) {
    throw new HttpsError('not-found', 'Group not found.');
  }

  const previous = await loadAssignmentForAliases(aliases, groupId);
  const changed = !previous || !sameItems(previous.items, items);

  await writeAssignmentDocs({
    aliases,
    groupId,
    items,
    actorUid: input.actorUid,
    name: input.name,
  });

  if (changed) {
    await notifyPracticeAssignmentChanged({ aliases, groupId, items });
  }

  return {
    uid: aliases.uid,
    phoneNumber: aliases.phoneNumber,
    groupId,
    items,
    changed,
  };
}

/**
 * Drop a member's standing assignment for the groups they have just left.
 *
 * Only the assignment is removed. Their *completion logs are deliberately left
 * alone*: history stays filed under the group it was practised in, so the monthly
 * report of a group they used to belong to keeps showing their row and their
 * days. Reinstating them later re-uses the same history rather than starting over.
 *
 * This replaces the old "move member between groups" re-stamp, which only made
 * sense when a member had exactly one group.
 */
export async function pruneMemberPracticeGroups(input: {
  phoneNumber: string;
  groupIds: string[];
  actorUid: string;
}) {
  const groupIds = input.groupIds.filter(Boolean);
  if (groupIds.length === 0) return { pruned: [] as string[] };

  const aliases = await resolveMemberAliases({ phoneNumber: input.phoneNumber });
  if (aliases.uids.length === 0) return { pruned: [] as string[] };

  // Read before deleting: the Admin SDK's `delete` only takes a lastUpdateTime
  // precondition, and a batch aborts entirely if any doc is already gone. Skipping
  // missing docs up front makes this safe to re-run.
  const refs: DocumentReference[] = [];
  for (const groupId of groupIds) {
    for (const aliasUid of aliasReadOrder(aliases)) {
      refs.push(db.collection(COLLECTION_ASSIGNMENTS).doc(assignmentDocId(aliasUid, groupId)));
    }
  }
  if (refs.length === 0) return { pruned: [] as string[] };

  const snaps = await db.getAll(...refs);
  const existing = snaps.filter((snap) => snap.exists);
  if (existing.length === 0) return { pruned: [] as string[] };

  const batch = db.batch();
  for (const snap of existing) {
    batch.delete(snap.ref);
  }
  await batch.commit();

  return { pruned: groupIds };
}

/**
 * Carry a member's standing practice from the groups they just left to the groups
 * they just joined.
 *
 * Without this, moving a member between groups would silently drop the plan they
 * had already been given. A joined group only receives a plan if it has none yet,
 * so an admin who has already assigned a fresh plan for the new group keeps it.
 * Completion history is untouched — it stays with the group it happened in.
 */
export async function carryMemberPracticeGroups(input: {
  phoneNumber: string;
  fromGroupIds: string[];
  toGroupIds: string[];
  actorUid: string;
}) {
  const from = input.fromGroupIds.filter(Boolean);
  const to = input.toGroupIds.filter(Boolean);
  if (from.length === 0 || to.length === 0) return { carried: [] as string[] };

  const aliases = await resolveMemberAliases({ phoneNumber: input.phoneNumber });
  if (aliases.uids.length === 0) return { carried: [] as string[] };

  const readOrder = aliasReadOrder(aliases);
  // Exact doc ids per group — matching on a suffix would confuse group `a_g` with
  // group `g`.
  const groupDocIds = (groupIds: string[]) =>
    new Map(
      groupIds.flatMap((groupId) =>
        readOrder.map((aliasUid) => [assignmentDocId(aliasUid, groupId), groupId] as const)
      )
    );

  const fromDocIds = groupDocIds(from);
  const toDocIds = groupDocIds(to);
  const [fromSnaps, toSnaps] = await Promise.all([
    db.getAll(...[...fromDocIds.keys()].map((id) => db.collection(COLLECTION_ASSIGNMENTS).doc(id))),
    db.getAll(...[...toDocIds.keys()].map((id) => db.collection(COLLECTION_ASSIGNMENTS).doc(id))),
  ]);

  // The first leaving group that still has a plan is the one to carry forward.
  const carriedItems = from
    .flatMap((groupId) =>
      fromSnaps.filter(
        (snap) => snap.exists && fromDocIds.get(snap.ref.id) === groupId
      )
    )
    .map((snap) => (snap.data() as { items?: unknown }).items)
    .find((items) => Array.isArray(items) && items.length > 0);
  if (!carriedItems) return { carried: [] as string[] };

  const carried: string[] = [];
  for (const groupId of to) {
    const alreadyPlanned = toSnaps.some(
      (snap) => snap.exists && toDocIds.get(snap.ref.id) === groupId
    );
    if (alreadyPlanned) continue;

    await setMemberPracticeAssignmentCore({
      actorUid: input.actorUid,
      phoneNumber: input.phoneNumber,
      groupId,
      items: carriedItems as PracticeItem[],
    });
    carried.push(groupId);
  }

  return { carried };
}

export async function getMyPracticeTodayCore(input: { uid: string; groupId: string }) {
  const groupId = input.groupId.trim();
  await assertMemberBelongsToGroup(input.uid, groupId);

  const dateKey = practiceDateKey();
  const aliases = await requireMemberAliases({ uid: input.uid });
  const assignment = await loadAssignmentForAliases(aliases, groupId);
  if (!assignment || assignment.items.length === 0) {
    return { practiceDateKey: dateKey, groupId, assignment: null, items: [] as ReturnType<typeof enrichItems> };
  }

  const items = assignment.items;
  const completedKeys = await loadCompletedKeysForUids(aliases.uids, groupId, dateKey);
  const titles = await loadChapterTitles(
    items.filter((i) => i.type === 'adhyay').map((i) => Number(i.chapterNumber))
  );

  return {
    practiceDateKey: dateKey,
    groupId,
    assignment: {
      uid: input.uid,
      memberKey: aliases.memberKey,
      groupId,
      items,
    },
    items: enrichItems(items, completedKeys, titles),
  };
}

function buildCompletionLog(input: {
  uid: string;
  aliases: MemberAliases;
  groupId: string;
  dateKey: string;
  item: PracticeItem;
  completedAt?: unknown;
}) {
  return {
    uid: input.uid,
    // Stable phone-keyed id so the admin overview and the monthly report can match
    // a completion to a roster row without an extra Auth lookup.
    memberKey: input.aliases.memberKey ?? phoneToUid(input.aliases.phoneNumber ?? ''),
    phoneNumber: input.aliases.phoneNumber,
    groupId: input.groupId,
    practiceDateKey: input.dateKey,
    itemKey: input.item.itemKey,
    type: input.item.type,
    chapterNumber: input.item.type === 'adhyay' ? input.item.chapterNumber ?? null : null,
    completedAt: input.completedAt ?? FieldValue.serverTimestamp(),
    completedBy: input.uid,
    reminderSentAt: null,
    reminderCount: 0,
  };
}

export async function markPracticeItemCompleteCore(input: {
  uid: string;
  groupId: string;
  itemKey: string;
}) {
  const itemKey = input.itemKey.trim();
  if (!itemKey) {
    throw new HttpsError('invalid-argument', 'itemKey is required.');
  }
  const groupId = input.groupId.trim();
  await assertMemberBelongsToGroup(input.uid, groupId);

  const aliases = await requireMemberAliases({ uid: input.uid });
  const assignment = await loadAssignmentForAliases(aliases, groupId);
  if (!assignment || assignment.items.length === 0) {
    throw new HttpsError('failed-precondition', 'No Adhyays found for your practice today.');
  }
  const matched = assignment.items.find((item) => item.itemKey === itemKey);
  if (!matched) {
    throw new HttpsError(
      'invalid-argument',
      'This Adhyay or Aarti is not part of your practice today.'
    );
  }

  const dateKey = practiceDateKey();
  const logId = practiceLogDocId(input.uid, groupId, dateKey, itemKey);
  const logRef = db.collection(COLLECTION_LOGS).doc(logId);
  const existing = await logRef.get();
  if (existing.exists) {
    return { logId, groupId, practiceDateKey: dateKey, alreadyComplete: true };
  }

  // An earlier session may have logged this under a different alias id. Still record
  // it under the caller's own uid (keeping the original timestamp) so the member's
  // direct read and the admin's per-member reporting stay consistent.
  const alreadyComplete = (
    await loadCompletedKeysForUids(aliases.uids, groupId, dateKey)
  ).has(itemKey);
  let completedAt: unknown;
  if (alreadyComplete) {
    const aliasIds = aliases.uids.filter((uid) => uid !== input.uid);
    const aliasLogs = await db.getAll(
      ...aliasIds.map((uid) =>
        db.collection(COLLECTION_LOGS).doc(practiceLogDocId(uid, groupId, dateKey, itemKey))
      )
    );
    for (const snap of aliasLogs) {
      if (snap.exists) {
        completedAt = snap.data()?.completedAt ?? null;
        break;
      }
    }
  }

  await logRef.set(
    buildCompletionLog({
      uid: input.uid,
      aliases,
      groupId,
      dateKey,
      item: matched,
      completedAt,
    })
  );

  return { logId, groupId, practiceDateKey: dateKey, alreadyComplete };
}

/** Mark every pending Adhyay/Aarti complete for the current practice day. */
export async function markAllPracticeCompleteCore(input: { uid: string; groupId: string }) {
  const groupId = input.groupId.trim();
  await assertMemberBelongsToGroup(input.uid, groupId);

  const aliases = await requireMemberAliases({ uid: input.uid });
  const assignment = await loadAssignmentForAliases(aliases, groupId);
  if (!assignment || assignment.items.length === 0) {
    throw new HttpsError('failed-precondition', 'No Adhyays found for your practice today.');
  }

  const dateKey = practiceDateKey();
  const completedKeys = await loadCompletedKeysForUids(aliases.uids, groupId, dateKey);
  const pending = assignment.items.filter((item) => !completedKeys.has(item.itemKey));
  if (pending.length === 0) {
    return { groupId, practiceDateKey: dateKey, completedCount: 0, alreadyComplete: true };
  }

  // The member's home screen reads `practice_completion_logs/{uid}_{group}_{date}_{item}`,
  // so a completion logged under a different alias id has to be mirrored onto the
  // caller's own uid or it would show up as still pending in the app.
  const aliasIds = aliases.uids.filter((uid) => uid !== input.uid);
  const carried = new Map<string, unknown>();
  if (aliasIds.length > 0) {
    const aliasLogs = await db.getAll(
      ...assignment.items.flatMap((item) =>
        aliasIds.map((uid) =>
          db.collection(COLLECTION_LOGS).doc(
            practiceLogDocId(uid, groupId, dateKey, item.itemKey)
          )
        )
      )
    );
    for (let i = 0; i < aliasLogs.length; i += 1) {
      const snap = aliasLogs[i]!;
      if (!snap.exists) continue;
      const item = assignment.items[Math.floor(i / aliasIds.length)];
      if (!item) continue;
      carried.set(item.itemKey, snap.data()?.completedAt ?? null);
    }
  }

  const batch = db.batch();
  for (const item of assignment.items) {
    batch.set(
      db.collection(COLLECTION_LOGS).doc(practiceLogDocId(input.uid, groupId, dateKey, item.itemKey)),
      buildCompletionLog({
        uid: input.uid,
        aliases,
        groupId,
        dateKey,
        item,
        completedAt: pending.some((p) => p.itemKey === item.itemKey)
          ? FieldValue.serverTimestamp()
          : (carried.get(item.itemKey) ?? FieldValue.serverTimestamp()),
      })
    );
  }
  await batch.commit();

  return {
    groupId,
    practiceDateKey: dateKey,
    completedCount: pending.length,
    alreadyComplete: false,
  };
}

export interface PracticeOverviewMember {
  uid: string;
  name: string;
  phoneNumber: string;
  /** Phone-keyed id — stable even before the member signs in. */
  memberKey: string;
  authUid: string | null;
  /** Every id this member may be addressed by (primary first). */
  aliasUids: string[];
  items: ReturnType<typeof enrichItems>;
  allComplete: boolean;
  incompleteCount: number;
}

export interface PracticeAdminOverview {
  practiceDateKey: string;
  groupId: string;
  memberCount: number;
  completeCount: number;
  incompleteCount: number;
  members: PracticeOverviewMember[];
}

export async function getPracticeAdminOverviewCore(input: {
  groupId: string;
}): Promise<PracticeAdminOverview> {
  const groupId = input.groupId.trim();
  const dateKey = practiceDateKey();

  // 3 reads, not N+1: roster + today's logs + one batched assignment read.
  const [rosterMembers, logDocs] = await Promise.all([
    loadActiveRosterMembers(groupId),
    loadGroupLogsForDate(groupId, dateKey),
  ]);

  // Batched point reads keyed by the phone — authoritative for "what does this
  // member practise in *this* group", independent of any other group they are in.
  const memberAssignments = await loadAssignmentsByMemberKey(
    rosterMembers.map((member) => member.memberKey),
    groupId
  );

  // Older completion rows only carry an account uid. Repair them once so their
  // phone-keyed id is recorded; after that the extra profile scan disappears.
  const legacyLogs = logDocs.filter((doc) => {
    const memberKey = (doc.data() ?? {}).memberKey;
    return !(typeof memberKey === 'string' && memberKey.length > 0);
  });
  const bridgedUidToMemberKey =
    legacyLogs.length > 0
      ? await backfillLegacyLogMemberKeys({
          groupId,
          dateKey,
          legacyLogs,
          rosterMembers,
        })
      : new Map<string, string>();

  /** memberKey → the account id seen for that member, if any. */
  const authUidByMemberKey = new Map<string, string>();
  const rememberAuthUid = (memberKey: string, uid: unknown) => {
    if (typeof uid !== 'string') return;
    const trimmed = uid.trim();
    if (!trimmed || trimmed === memberKey) return;
    if (!authUidByMemberKey.has(memberKey)) authUidByMemberKey.set(memberKey, trimmed);
  };

  for (const [uid, memberKey] of bridgedUidToMemberKey) {
    rememberAuthUid(memberKey, uid);
  }

  // memberKey → items, plus the account id recorded on the assignment doc.
  const itemsByMemberKey = new Map<string, PracticeItem[]>();
  const chapterSet = new Set<number>();
  for (const [memberKey, entry] of memberAssignments) {
    itemsByMemberKey.set(memberKey, entry.items);
    rememberAuthUid(memberKey, entry.data.authUid);
    for (const item of entry.items) {
      if (item.type === 'adhyay' && item.chapterNumber) chapterSet.add(item.chapterNumber);
    }
  }

  // Completion keys per identity. New logs carry `memberKey`; legacy ones are
  // bridged above (and repaired in place so this stays a one-off).
  const completedByKey = new Map<string, Set<string>>();
  for (const doc of logDocs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    const itemKey = typeof data.itemKey === 'string' ? data.itemKey : '';
    if (!itemKey) continue;
    for (const key of logIdentityKeys(data)) {
      const set = completedByKey.get(key) ?? new Set<string>();
      set.add(itemKey);
      completedByKey.set(key, set);
    }
  }
  // Attribute bridged legacy rows to their member too.
  for (const [uid, memberKey] of bridgedUidToMemberKey) {
    const set = completedByKey.get(uid);
    if (!set) continue;
    const target = completedByKey.get(memberKey) ?? new Set<string>();
    for (const itemKey of set) target.add(itemKey);
    completedByKey.set(memberKey, target);
  }

  const titles = await loadChapterTitles([...chapterSet]);
  const members: PracticeOverviewMember[] = [];
  const usedRowIds = new Set<string>();

  for (const rosterMember of rosterMembers) {
    // Admins manage a group from the People tab; this screen tracks members only.
    if (rosterMember.role !== 'user') continue;

    const { memberKey, phoneNumber } = rosterMember;
    const authUid = authUidByMemberKey.get(memberKey) ?? null;
    const aliasUids = [...new Set([authUid, memberKey].filter((id): id is string => Boolean(id)))];

    // memberKey derives from the phone number and roster ids are unique, so this
    // is stable across refreshes. The suffix guards a malformed phone field
    // without ever dropping a member.
    const rowId = usedRowIds.has(memberKey) ? `${memberKey}#${rosterMember.id}` : memberKey;
    usedRowIds.add(rowId);

    const name = rosterMember.name || phoneNumber;
    const items = itemsByMemberKey.get(memberKey) ?? [];
    if (items.length === 0) {
      members.push({
        uid: rowId,
        name,
        phoneNumber,
        memberKey,
        authUid,
        aliasUids,
        items: [],
        allComplete: false,
        incompleteCount: 0,
      });
      continue;
    }

    const completedKeys = new Set<string>();
    for (const key of aliasUids) {
      for (const itemKey of completedByKey.get(key) ?? []) completedKeys.add(itemKey);
    }

    const enriched = enrichItems(items, completedKeys, titles);
    const incompleteCount = enriched.filter((item) => !item.completed).length;
    members.push({
      uid: rowId,
      name,
      phoneNumber,
      memberKey,
      authUid,
      aliasUids,
      items: enriched,
      allComplete: incompleteCount === 0,
      incompleteCount,
    });
  }

  members.sort((a, b) => a.name.localeCompare(b.name));
  const withAssignment = members.filter((m) => m.items.length > 0);
  const completeCount = withAssignment.filter((m) => m.allComplete).length;

  return {
    practiceDateKey: dateKey,
    groupId,
    memberCount: withAssignment.length,
    completeCount,
    incompleteCount: withAssignment.length - completeCount,
    members,
  };
}

/** Cap on Auth lookups used to bridge a legacy log to its member. */
const LEGACY_BRIDGE_LIMIT = 20;

/**
 * Give pre-`memberKey` completion logs their phone-keyed id, once.
 *
 * Those rows are only attributable by their account uid, so a stale or missing
 * `users` profile makes a finished practice look incomplete forever — the member
 * shows up as "not done" on the admin screen and in the monthly Excel. Stamping
 * `memberKey` repairs the row in place, so the steady state needs no uid bridge
 * at all and the extra profile scan disappears.
 */
async function backfillLegacyLogMemberKeys(input: {
  groupId: string;
  dateKey: string;
  legacyLogs: FirebaseFirestore.QueryDocumentSnapshot[];
  rosterMembers: GroupRosterMember[];
}): Promise<Map<string, string>> {
  const { groupId, dateKey, legacyLogs, rosterMembers } = input;
  const memberKeyByUid = new Map<string, string>();

  // 1) Profiles already scoped to the group (the common case, no Auth calls).
  const [userDocs, assignmentDocs] = await Promise.all([
    loadGroupUserProfiles(groupId),
    loadGroupAssignments(groupId),
  ]);
  for (const doc of userDocs) {
    const phone = (doc.data() ?? {}).phoneNumber;
    if (typeof phone === 'string' && phone.trim()) {
      memberKeyByUid.set(doc.id, phoneToUid(phone.trim()));
    }
  }
  for (const doc of assignmentDocs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    const phone = typeof data.phoneNumber === 'string' ? data.phoneNumber.trim() : '';
    const memberKey =
      (typeof data.memberKey === 'string' && data.memberKey.trim()) ||
      (phone ? phoneToUid(phone) : '');
    const authUid = typeof data.authUid === 'string' ? data.authUid.trim() : '';
    if (!memberKey) continue;
    // Every alias this doc is readable under resolves back to the same member.
    for (const key of assignmentIdentityKeys(doc.id, data)) {
      memberKeyByUid.set(key, memberKey);
    }
    if (authUid) memberKeyByUid.set(authUid, memberKey);
  }

  // 2) Anything still unmapped: a bounded Auth lookup by phone.
  const unmapped = new Set(
    legacyLogs
      .map((doc) => (doc.data() ?? {}).uid)
      .filter((uid): uid is string => typeof uid === 'string' && uid.length > 0)
      .filter((uid) => !memberKeyByUid.has(uid))
  );
  if (unmapped.size > 0) {
    for (const member of rosterMembers.slice(0, LEGACY_BRIDGE_LIMIT)) {
      const uid = await findAuthUidByPhone(member.phoneNumber);
      if (uid) memberKeyByUid.set(uid, member.memberKey);
    }
  }

  // 3) Stamp the rows so the next read is a pure point-read path.
  const batch = db.batch();
  let patched = 0;
  for (const doc of legacyLogs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    const uid = typeof data.uid === 'string' ? data.uid.trim() : '';
    const memberKey = uid ? memberKeyByUid.get(uid) : undefined;
    if (!memberKey) continue;
    batch.set(
      doc.ref,
      { memberKey, practiceDateKey: data.practiceDateKey ?? dateKey },
      { merge: true }
    );
    patched += 1;
  }
  if (patched > 0) {
    await batch.commit().catch((error) => {
      console.warn('practice_legacy_log_backfill_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }

  return memberKeyByUid;
}

/** Ids a completion log can be attributed to. */
export function logIdentityKeys(data: Record<string, unknown>): string[] {
  const keys = new Set<string>();
  const memberKey = typeof data.memberKey === 'string' ? data.memberKey.trim() : '';
  if (memberKey) keys.add(memberKey);
  const uid = typeof data.uid === 'string' ? data.uid.trim() : '';
  if (uid) keys.add(uid);
  const phone = typeof data.phoneNumber === 'string' ? data.phoneNumber.trim() : '';
  if (phone) keys.add(phoneToUid(phone));
  return [...keys];
}

/** Ids an assignment doc can be read back under. */
export function assignmentIdentityKeys(
  docId: string,
  data: Record<string, unknown>
): string[] {
  const keys = new Set<string>([docId]);
  const memberKey = typeof data.memberKey === 'string' ? data.memberKey.trim() : '';
  if (memberKey) keys.add(memberKey);
  const phone = typeof data.phoneNumber === 'string' ? data.phoneNumber.trim() : '';
  if (phone) keys.add(phoneToUid(phone));
  const uid = typeof data.uid === 'string' ? data.uid.trim() : '';
  if (uid) keys.add(uid);
  return [...keys];
}

/**
 * Roster rows for a group, with a degraded single-filter path so a missing
 * `groupId + status` composite index cannot blank the whole screen.
 */
async function loadActiveRosterMembers(groupId: string) {
  return loadActiveGroupMembers(groupId);
}

async function loadGroupAssignments(groupId: string) {
  const docs = await tryQueryDocs(
    db.collection(COLLECTION_ASSIGNMENTS).where('groupId', '==', groupId)
  );
  return docs ?? [];
}

async function loadGroupLogsForDate(groupId: string, dateKey: string) {
  const filtered = await tryQueryDocs(
    db
      .collection(COLLECTION_LOGS)
      .where('groupId', '==', groupId)
      .where('practiceDateKey', '==', dateKey)
  );
  if (filtered) return filtered;

  const loose = await tryQueryDocs(
    db.collection(COLLECTION_LOGS).where('groupId', '==', groupId).limit(2000)
  );
  return (loose ?? []).filter((doc) => (doc.data() ?? {}).practiceDateKey === dateKey);
}

async function loadGroupUserProfiles(groupId: string) {
  const docs = await tryQueryDocs(db.collection(COLLECTION_USERS).where('groupId', '==', groupId));
  return docs ?? [];
}

/**
 * Read every member's phone-keyed assignment doc in a single batched RPC.
 *
 * This — not the group-scoped query — is what makes the practice screen agree
 * with the People screen. A member added seconds ago, or one whose assignment
 * doc still carries a previous `groupId`, is resolved here regardless of index
 * state or stamp drift, so "added on People" always means "listed on Practice".
 */
/**
 * Per-group standing assignments for a set of members, keyed by memberKey.
 *
 * Reads the group-scoped doc id first, then falls back to the pre-multi-group doc
 * when it is stamped with this group. Both are kept forever so a rollback stays
 * survivable and history written before the change is never lost.
 */
export async function loadAssignmentsByMemberKey(memberKeys: string[], groupId: string) {
  const unique = [...new Set(memberKeys.filter(Boolean))];
  const byMemberKey = new Map<string, { data: Record<string, unknown>; items: PracticeItem[] }>();
  if (unique.length === 0 || !groupId) return byMemberKey;

  const record = (snap: {
    id: string;
    exists: boolean;
    data: () => DocumentData | undefined;
  }): { key: string; data: Record<string, unknown>; items: PracticeItem[] } | null => {
    if (!snap.exists) return null;
    const data = (snap.data() ?? {}) as Record<string, unknown>;
    const items = normalizePracticeItems(data.items);
    if (items.length === 0) return null;
    // Newer docs carry `memberKey`; legacy ones are addressed by their own id.
    const key = typeof data.memberKey === 'string' && data.memberKey ? data.memberKey : snap.id;
    return { key, data, items };
  };

  try {
    const [scopedSnaps, legacySnaps] = await Promise.all([
      db.getAll(
        ...unique.map((memberKey) =>
          db.collection(COLLECTION_ASSIGNMENTS).doc(assignmentDocId(memberKey, groupId))
        )
      ),
      db.getAll(
        ...unique.map((memberKey) =>
          db.collection(COLLECTION_ASSIGNMENTS).doc(legacyAssignmentDocId(memberKey))
        )
      ),
    ]);

    // Group-scoped wins, so a member migrated to the new id is not overwritten by
    // their leftover legacy doc.
    for (const entry of legacySnaps.map(record)) {
      if (!entry) continue;
      if (String(entry.data.groupId ?? '') !== groupId) continue;
      byMemberKey.set(entry.key, { data: entry.data, items: entry.items });
    }
    for (const entry of scopedSnaps.map(record)) {
      if (!entry) continue;
      byMemberKey.set(entry.key, { data: entry.data, items: entry.items });
    }
  } catch (error) {
    console.warn('practice_assignment_batch_read_failed', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return byMemberKey;
}

/** Cap on Auth lookups so a large "remind everyone" stays inside the callable budget. */
const AUTH_UID_RECOVERY_LIMIT = 20;
const AUTH_UID_RECOVERY_BATCH = 10;

/**
 * Fill in `authUid` for members whose account id could not be derived from the
 * roster, profile or assignment docs (accounts created before the ids were
 * mirrored). Without it their in-app reminder row would be filed under the
 * phone-keyed id, which the client never reads.
 */
async function backfillAuthUids(members: PracticeOverviewMember[]) {
  const pending = members.filter((m) => !m.authUid).slice(0, AUTH_UID_RECOVERY_LIMIT);
  for (let i = 0; i < pending.length; i += AUTH_UID_RECOVERY_BATCH) {
    const slice = pending.slice(i, i + AUTH_UID_RECOVERY_BATCH);
    await Promise.all(
      slice.map(async (member) => {
        const uid = await findAuthUidByPhone(member.phoneNumber);
        if (!uid) return;
        member.authUid = uid;
        member.aliasUids = [uid, ...member.aliasUids.filter((id) => id !== uid)];
        member.uid = uid;
      })
    );
  }
}

export async function sendPracticeReminderCore(input: {
  actorUid: string;
  groupId: string;
  uid?: string;
  phoneNumber?: string;
  remindAllIncomplete?: boolean;
}) {
  const groupId = input.groupId.trim();
  const dateKey = practiceDateKey();
  const overview = await getPracticeAdminOverviewCore({ groupId });

  const requestedUid = typeof input.uid === 'string' ? input.uid.trim() : '';
  const requestedPhone =
    typeof input.phoneNumber === 'string' ? input.phoneNumber.trim() : '';
  const remindAll = input.remindAllIncomplete === true && !requestedUid && !requestedPhone;

  const targets = overview.members.filter((member) => {
    if (member.items.length === 0) return false;
    if (member.allComplete) return false;
    if (remindAll) return true;
    if (requestedPhone) {
      return (
        member.phoneNumber === requestedPhone ||
        member.memberKey === phoneToUid(requestedPhone)
      );
    }
    if (!requestedUid) return false;
    return member.uid === requestedUid || member.aliasUids.includes(requestedUid);
  });

  if (targets.length === 0) {
    throw new HttpsError('failed-precondition', 'No incomplete members to remind.');
  }

  await backfillAuthUids(targets);

  let sent = 0;
  const failed: string[] = [];
  for (const member of targets) {
    const pending = member.items.filter((item) => !item.completed);
    const title = 'Practice reminder';
    const body = `Please complete today's Adhyay${
      pending.some((p) => p.type === 'aarti') ? ' & Aarti' : ''
    }: ${assignmentLabel(pending)}`;

    // Personal notifications are only visible to the real account uid, so a row
    // written under the phone-keyed id would never show up in the app.
    const notifyUid = member.authUid ?? member.uid;
    try {
      await db.collection(COLLECTION_NOTIFICATIONS).add({
        uid: notifyUid,
        groupId,
        type: 'practice_reminder',
        title,
        body,
        createdAt: FieldValue.serverTimestamp(),
        readAt: null,
        data: {
          screen: 'practice',
          practiceDateKey: dateKey,
        },
      });
    } catch (error) {
      console.warn('practice_reminder_notification_failed', {
        uid: notifyUid,
        phoneNumber: member.phoneNumber,
        error,
      });
    }

    let pushSent = 0;
    for (const uid of member.aliasUids) {
      try {
        const push = await sendUserPracticePush({
          uid,
          groupId,
          title,
          body,
          data: {
            type: 'practice_reminder',
            screen: 'practice',
            practiceDateKey: dateKey,
          },
        });
        pushSent += push.sent;
      } catch (error) {
        console.warn('practice_reminder_push_failed', { uid, error });
      }
      if (pushSent > 0) break;
    }

    // Reminder bookkeeping is best-effort — never fail the whole fan-out for it.
    await Promise.all(
      member.aliasUids.map((uid) =>
        db
          .collection(COLLECTION_ASSIGNMENTS)
          .doc(uid)
          .set(
            {
              lastReminderAt: FieldValue.serverTimestamp(),
              lastReminderBy: input.actorUid,
              lastReminderPracticeDateKey: dateKey,
            },
            { merge: true }
          )
          .catch((error) => {
            console.warn('practice_reminder_bookkeeping_failed', { uid, error });
          })
      )
    );

    sent += 1;
    if (pushSent === 0) failed.push(member.name || member.phoneNumber);
  }

  return {
    sent,
    failed,
    pushless: failed.length,
    total: targets.length,
    practiceDateKey: dateKey,
  };
}
