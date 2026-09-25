/**
 * Standing Adhyay / Aarti practice assignments + noon-IST daily completion logs.
 */

import { FieldValue, type Query } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

import { db } from './firebase-admin';
import {
  findAuthUidByPhone,
  phoneToUid,
  resolveMemberAliases,
  type MemberAliases,
} from './member-identity';
import { sendUserPracticePush } from './push';
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
const COLLECTION_ROSTER = 'access_roster';
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

export function practiceLogDocId(uid: string, dateKey: string, itemKey: string): string {
  return `${uid}_${dateKey}_${itemKey}`;
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

async function loadAssignmentForAliases(aliases: MemberAliases): Promise<AssignmentRecord | null> {
  const order = aliasReadOrder(aliases);
  if (order.length === 0) return null;

  const snaps = await db.getAll(...order.map((uid) => db.collection(COLLECTION_ASSIGNMENTS).doc(uid)));
  const found: AssignmentRecord[] = snaps
    .filter((snap) => snap.exists)
    .map((snap) => {
      const data = (snap.data() ?? {}) as Record<string, unknown>;
      return { uid: snap.id, data, items: normalizePracticeItems(data.items) };
    });

  return found.find((entry) => entry.items.length > 0) ?? found[0] ?? null;
}

/**
 * Persist a standing assignment under *every* alias id.
 *
 * The member's home screen reads `member_practice_assignments/{authUid}` straight
 * from Firestore, so a write that only lands on the phone-keyed doc stays
 * invisible until the next sign-in. Writing all aliases is what makes an admin's
 * change show up straight away, with no new app build required.
 */
async function writeAssignmentDocs(input: {
  aliases: MemberAliases;
  groupId: string;
  items: PracticeItem[];
  actorUid: string;
}) {
  const { aliases, groupId, items, actorUid } = input;
  const memberKey = aliases.memberKey ?? phoneToUid(aliases.phoneNumber ?? '');
  const batch = db.batch();
  for (const uid of aliasReadOrder(aliases)) {
    batch.set(
      db.collection(COLLECTION_ASSIGNMENTS).doc(uid),
      {
        uid,
        memberKey,
        groupId,
        phoneNumber: aliases.phoneNumber,
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

/** Copy the phone-keyed assignment onto the Auth uid after the first sign-in. */
export async function syncPracticeAssignmentToAuthUid(input: { uid: string; phoneNumber: string }) {
  const uid = input.uid.trim();
  const phoneNumber = input.phoneNumber.trim();
  if (!uid || !phoneNumber) return;

  const memberKey = phoneToUid(phoneNumber);
  const source = await db.collection(COLLECTION_ASSIGNMENTS).doc(memberKey).get();
  if (!source.exists) return;
  const items = normalizePracticeItems(source.data()?.items);
  if (items.length === 0) return;

  const dest = await db.collection(COLLECTION_ASSIGNMENTS).doc(uid).get();
  const destItems = normalizePracticeItems(dest.data()?.items);
  if (destItems.length > 0 && sameItems(destItems, items)) return;

  await writeAssignmentDocs({
    aliases: { uid, memberKey, authUid: uid, phoneNumber, uids: [uid, memberKey] },
    groupId: String(source.data()?.groupId ?? ''),
    items,
    actorUid: '',
  });
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

async function loadCompletedKeys(uid: string, dateKey: string): Promise<Set<string>> {
  const snap = await db
    .collection(COLLECTION_LOGS)
    .where('uid', '==', uid)
    .where('practiceDateKey', '==', dateKey)
    .get();
  const keys = new Set<string>();
  for (const doc of snap.docs) {
    const itemKey = doc.data()?.itemKey;
    if (typeof itemKey === 'string' && itemKey) keys.add(itemKey);
  }
  return keys;
}

async function loadCompletedKeysForUids(uids: string[], dateKey: string): Promise<Set<string>> {
  const unique = [...new Set(uids)];
  if (unique.length === 0) return new Set();

  const keys = new Set<string>();
  await Promise.all(
    unique.map(async (uid) => {
      for (const key of await loadCompletedKeys(uid, dateKey)) keys.add(key);
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
}) {
  const groupId = input.groupId.trim();
  if (!groupId) {
    throw new HttpsError('invalid-argument', 'Group is required.');
  }

  const aliases = await requireMemberAliases(input);
  const items = normalizePracticeItems(input.items);

  // The roster editor always calls this right after saving a member, even when the
  // admin never touched the practice picker. Rejecting an empty list is what made
  // "add member" fail outright, so treat it as "nothing to assign" instead.
  if (items.length === 0) {
    return {
      uid: aliases.uid,
      phoneNumber: aliases.phoneNumber,
      groupId,
      items: [] as PracticeItem[],
      changed: false,
    };
  }

  assertValidPracticeItems(items);

  const groupSnap = await db.collection('groups').doc(groupId).get();
  if (!groupSnap.exists) {
    throw new HttpsError('not-found', 'Group not found.');
  }

  const previous = await loadAssignmentForAliases(aliases);
  const changed = !previous || !sameItems(previous.items, items);

  await writeAssignmentDocs({ aliases, groupId, items, actorUid: input.actorUid });

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
 * Re-stamp a member's standing assignment (and today's completions) after they
 * are moved to another group by a roster edit. Without this the new group's
 * practice screen shows "no assignment" for a member who already has one, which
 * reads as the admin's change having silently failed.
 *
 * History before the move intentionally keeps the old `groupId`, so past days
 * stay in the monthly report of the group they were actually practised in.
 */
export async function reassignMemberPracticeGroup(input: {
  phoneNumber: string;
  groupId: string | null;
  actorUid: string;
}) {
  const aliases = await resolveMemberAliases({ phoneNumber: input.phoneNumber });
  if (aliases.uids.length === 0) return { moved: false, groupId: input.groupId };

  const existing = await loadAssignmentForAliases(aliases);
  if (!existing || existing.items.length === 0) {
    return { moved: false, groupId: input.groupId };
  }

  const nextGroupId = input.groupId ?? '';
  const previousGroupId = String(existing.data.groupId ?? '');
  if (previousGroupId === nextGroupId) {
    return { moved: false, groupId: nextGroupId };
  }

  const batch = db.batch();
  for (const uid of aliasReadOrder(aliases)) {
    batch.set(
      db.collection(COLLECTION_ASSIGNMENTS).doc(uid),
      {
        groupId: nextGroupId,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: input.actorUid,
      },
      { merge: true }
    );
  }

  // Today's rows only — the live admin overview is what the move has to fix.
  const dateKey = practiceDateKey();
  const todayLogs = await tryQueryDocs(
    db
      .collection(COLLECTION_LOGS)
      .where('groupId', '==', previousGroupId)
      .where('practiceDateKey', '==', dateKey)
  );
  for (const doc of todayLogs ?? []) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    if (!logIdentityKeys(data).some((key) => aliases.uids.includes(key))) continue;
    batch.set(doc.ref, { groupId: nextGroupId }, { merge: true });
  }

  await batch.commit();
  return { moved: true, groupId: nextGroupId, from: previousGroupId };
}

export async function getMyPracticeTodayCore(input: { uid: string }) {
  const dateKey = practiceDateKey();
  const aliases = await requireMemberAliases({ uid: input.uid });
  const assignment = await loadAssignmentForAliases(aliases);
  if (!assignment || assignment.items.length === 0) {
    return { practiceDateKey: dateKey, assignment: null, items: [] as ReturnType<typeof enrichItems> };
  }

  const items = assignment.items;
  const groupId = String(assignment.data.groupId ?? '');
  const completedKeys = await loadCompletedKeysForUids(aliases.uids, dateKey);
  const titles = await loadChapterTitles(
    items.filter((i) => i.type === 'adhyay').map((i) => Number(i.chapterNumber))
  );

  return {
    practiceDateKey: dateKey,
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

export async function markPracticeItemCompleteCore(input: { uid: string; itemKey: string }) {
  const itemKey = input.itemKey.trim();
  if (!itemKey) {
    throw new HttpsError('invalid-argument', 'itemKey is required.');
  }

  const aliases = await requireMemberAliases({ uid: input.uid });
  const assignment = await loadAssignmentForAliases(aliases);
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
  const logId = practiceLogDocId(input.uid, dateKey, itemKey);
  const logRef = db.collection(COLLECTION_LOGS).doc(logId);
  const existing = await logRef.get();
  if (existing.exists) {
    return { logId, practiceDateKey: dateKey, alreadyComplete: true };
  }

  // An earlier session may have logged this under a different alias id. Still record
  // it under the caller's own uid (keeping the original timestamp) so the member's
  // direct read and the admin's per-member reporting stay consistent.
  const alreadyComplete = (await loadCompletedKeysForUids(aliases.uids, dateKey)).has(itemKey);
  let completedAt: unknown;
  if (alreadyComplete) {
    const aliasIds = aliases.uids.filter((uid) => uid !== input.uid);
    const aliasLogs = await db.getAll(
      ...aliasIds.map((uid) =>
        db.collection(COLLECTION_LOGS).doc(practiceLogDocId(uid, dateKey, itemKey))
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
      groupId: String(assignment.data.groupId ?? ''),
      dateKey,
      item: matched,
      completedAt,
    })
  );

  return { logId, practiceDateKey: dateKey, alreadyComplete };
}

/** Mark every pending Adhyay/Aarti complete for the current practice day. */
export async function markAllPracticeCompleteCore(input: { uid: string }) {
  const aliases = await requireMemberAliases({ uid: input.uid });
  const assignment = await loadAssignmentForAliases(aliases);
  if (!assignment || assignment.items.length === 0) {
    throw new HttpsError('failed-precondition', 'No Adhyays found for your practice today.');
  }

  const dateKey = practiceDateKey();
  const completedKeys = await loadCompletedKeysForUids(aliases.uids, dateKey);
  const pending = assignment.items.filter((item) => !completedKeys.has(item.itemKey));
  if (pending.length === 0) {
    return { practiceDateKey: dateKey, completedCount: 0, alreadyComplete: true };
  }

  // The member's home screen reads `practice_completion_logs/{uid}_{date}_{item}`,
  // so a completion logged under a different alias id has to be mirrored onto the
  // caller's own uid or it would show up as still pending in the app.
  const aliasIds = aliases.uids.filter((uid) => uid !== input.uid);
  const carried = new Map<string, unknown>();
  if (aliasIds.length > 0) {
    const aliasLogs = await db.getAll(
      ...assignment.items.flatMap((item) =>
        aliasIds.map((uid) =>
          db.collection(COLLECTION_LOGS).doc(practiceLogDocId(uid, dateKey, item.itemKey))
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

  const groupId = String(assignment.data.groupId ?? '');
  const batch = db.batch();
  for (const item of assignment.items) {
    batch.set(
      db.collection(COLLECTION_LOGS).doc(practiceLogDocId(input.uid, dateKey, item.itemKey)),
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

  // 4 queries total (not N+1): roster + assignments + today's logs + group profiles.
  const [rosterDocs, assignmentDocs, logDocs, userDocs] = await Promise.all([
    loadActiveRosterMembers(groupId),
    loadGroupAssignments(groupId),
    loadGroupLogsForDate(groupId, dateKey),
    loadGroupUserProfiles(groupId),
  ]);

  /** memberKey → account ids seen for that member. */
  const authUidByMemberKey = new Map<string, string | null>();
  const rememberAuthUid = (memberKey: string, uid: string | null) => {
    if (!uid) return;
    if (uid === memberKey) return;
    const existing = authUidByMemberKey.get(memberKey);
    if (existing === undefined || existing === null) authUidByMemberKey.set(memberKey, uid);
  };

  for (const doc of userDocs) {
    const data = doc.data() ?? {};
    const phone = typeof data.phoneNumber === 'string' ? data.phoneNumber.trim() : '';
    if (!phone) continue;
    rememberAuthUid(phoneToUid(phone), doc.id);
  }

  // memberKey → items. Every alias of a doc points at the same standing list.
  const itemsByMemberKey = new Map<string, PracticeItem[]>();
  const chapterSet = new Set<number>();
  for (const doc of assignmentDocs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    const items = normalizePracticeItems(data.items);
    if (items.length === 0) continue;

    const keys = assignmentIdentityKeys(doc.id, data);
    const docUid = typeof data.uid === 'string' ? data.uid : '';
    for (const key of keys) rememberAuthUid(key, docUid);

    for (const key of keys) itemsByMemberKey.set(key, items);
    for (const item of items) {
      if (item.type === 'adhyay' && item.chapterNumber) chapterSet.add(item.chapterNumber);
    }
  }

  // Completion keys per identity. New logs carry `memberKey`; legacy ones only `uid`.
  const completedByKey = new Map<string, Set<string>>();
  for (const doc of logDocs) {
    const data = doc.data() ?? {};
    const itemKey = typeof data.itemKey === 'string' ? data.itemKey : '';
    if (!itemKey) continue;
    for (const key of logIdentityKeys(data)) {
      const set = completedByKey.get(key) ?? new Set<string>();
      set.add(itemKey);
      completedByKey.set(key, set);
    }
  }

  const titles = await loadChapterTitles([...chapterSet]);
  const members: PracticeOverviewMember[] = [];
  const usedRowIds = new Set<string>();

  for (const doc of rosterDocs) {
    const data = doc.data() ?? {};
    if (data.role && data.role !== 'user') continue;

    const phoneNumber = typeof data.phoneNumber === 'string' ? data.phoneNumber : `+${doc.id}`;
    const memberKey = phoneToUid(phoneNumber);
    const authUid = authUidByMemberKey.get(memberKey) ?? null;
    const aliasUids = [...new Set([authUid, memberKey].filter((id): id is string => Boolean(id)))];

    // Roster doc ids (and therefore phone numbers) are unique, so this row id is
    // stable across refreshes. The suffix is a guard against a malformed phone
    // field producing a duplicate React key — it must never drop a member.
    const rowId = usedRowIds.has(memberKey) ? `${memberKey}#${doc.id}` : memberKey;
    usedRowIds.add(rowId);

    const name = typeof data.name === 'string' && data.name ? data.name : phoneNumber;
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
  const filtered = await tryQueryDocs(
    db.collection(COLLECTION_ROSTER).where('groupId', '==', groupId).where('status', '==', 'active')
  );
  if (filtered) return filtered;

  const loose = await tryQueryDocs(db.collection(COLLECTION_ROSTER).where('groupId', '==', groupId));
  return (loose ?? []).filter((doc) => (doc.data() ?? {}).status !== 'inactive');
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
