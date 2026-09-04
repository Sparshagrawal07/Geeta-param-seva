/**
 * Standing Adhyay / Aarti practice assignments + noon-IST daily completion logs.
 */

import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

import { db } from './firebase-admin';
import { phoneToUid } from './pin-auth';
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

function resolveMemberUid(input: { uid?: string; phoneNumber?: string }): string {
  if (typeof input.uid === 'string' && input.uid.trim()) {
    return input.uid.trim();
  }
  if (typeof input.phoneNumber === 'string' && input.phoneNumber.trim()) {
    return phoneToUid(input.phoneNumber.trim());
  }
  throw new HttpsError('invalid-argument', 'Member uid or phone number is required.');
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
            titleEn: String(data.titleEn ?? CHAPTER_TITLE_FALLBACK[chapterNumber]?.titleEn ?? `Adhyay ${chapterNumber}`),
            titleHi: String(data.titleHi ?? CHAPTER_TITLE_FALLBACK[chapterNumber]?.titleHi ?? `अध्याय ${chapterNumber}`),
          });
        }
      }
    } catch {
      chapterTitleCache = new Map(Object.entries(CHAPTER_TITLE_FALLBACK).map(([k, v]) => [Number(k), v]));
    }
  }

  for (const n of unique) {
    const cached = chapterTitleCache.get(n);
    if (cached) map.set(n, cached);
  }
  return map;
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
  const uid = resolveMemberUid(input);
  const items = normalizePracticeItems(input.items);
  assertValidPracticeItems(items);

  const groupSnap = await db.collection('groups').doc(groupId).get();
  if (!groupSnap.exists) {
    throw new HttpsError('not-found', 'Group not found.');
  }

  await db
    .collection(COLLECTION_ASSIGNMENTS)
    .doc(uid)
    .set(
      {
        uid,
        groupId,
        items,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: input.actorUid,
      },
      { merge: true }
    );

  return { uid, groupId, items };
}

export async function getMyPracticeTodayCore(input: { uid: string }) {
  const dateKey = practiceDateKey();
  const assignmentSnap = await db.collection(COLLECTION_ASSIGNMENTS).doc(input.uid).get();
  if (!assignmentSnap.exists) {
    return { practiceDateKey: dateKey, assignment: null, items: [] as ReturnType<typeof enrichItems> };
  }

  const data = assignmentSnap.data() ?? {};
  const items = normalizePracticeItems(data.items);
  const groupId = String(data.groupId ?? '');
  const completedKeys = await loadCompletedKeys(input.uid, dateKey);
  const titles = await loadChapterTitles(
    items.filter((i) => i.type === 'adhyay').map((i) => Number(i.chapterNumber))
  );

  return {
    practiceDateKey: dateKey,
    assignment: {
      uid: input.uid,
      groupId,
      items,
    },
    items: enrichItems(items, completedKeys, titles),
  };
}

export async function markPracticeItemCompleteCore(input: {
  uid: string;
  itemKey: string;
}) {
  const itemKey = input.itemKey.trim();
  if (!itemKey) {
    throw new HttpsError('invalid-argument', 'itemKey is required.');
  }

  const assignmentSnap = await db.collection(COLLECTION_ASSIGNMENTS).doc(input.uid).get();
  if (!assignmentSnap.exists) {
    throw new HttpsError('failed-precondition', 'No Adhyays found for your practice today.');
  }
  const data = assignmentSnap.data() ?? {};
  const items = normalizePracticeItems(data.items);
  const matched = items.find((item) => item.itemKey === itemKey);
  if (!matched) {
    throw new HttpsError('invalid-argument', 'This Adhyay or Aarti is not part of your practice today.');
  }

  const dateKey = practiceDateKey();
  const logId = practiceLogDocId(input.uid, dateKey, itemKey);
  const logRef = db.collection(COLLECTION_LOGS).doc(logId);
  const existing = await logRef.get();
  if (existing.exists) {
    return { logId, practiceDateKey: dateKey, alreadyComplete: true };
  }

  await logRef.set({
    uid: input.uid,
    groupId: String(data.groupId ?? ''),
    practiceDateKey: dateKey,
    itemKey,
    type: matched.type,
    chapterNumber: matched.type === 'adhyay' ? matched.chapterNumber : null,
    completedAt: FieldValue.serverTimestamp(),
    completedBy: input.uid,
    reminderSentAt: null,
    reminderCount: 0,
  });

  return { logId, practiceDateKey: dateKey, alreadyComplete: false };
}

/** Mark every pending Adhyay/Aarti complete for the current practice day. */
export async function markAllPracticeCompleteCore(input: { uid: string }) {
  const assignmentSnap = await db.collection(COLLECTION_ASSIGNMENTS).doc(input.uid).get();
  if (!assignmentSnap.exists) {
    throw new HttpsError('failed-precondition', 'No Adhyays found for your practice today.');
  }
  const data = assignmentSnap.data() ?? {};
  const items = normalizePracticeItems(data.items);
  if (items.length === 0) {
    throw new HttpsError('failed-precondition', 'No Adhyays found for your practice today.');
  }

  const dateKey = practiceDateKey();
  const completedKeys = await loadCompletedKeys(input.uid, dateKey);
  const pending = items.filter((item) => !completedKeys.has(item.itemKey));
  if (pending.length === 0) {
    return { practiceDateKey: dateKey, completedCount: 0, alreadyComplete: true };
  }

  const groupId = String(data.groupId ?? '');
  const batch = db.batch();
  for (const matched of pending) {
    const logId = practiceLogDocId(input.uid, dateKey, matched.itemKey);
    const logRef = db.collection(COLLECTION_LOGS).doc(logId);
    batch.set(logRef, {
      uid: input.uid,
      groupId,
      practiceDateKey: dateKey,
      itemKey: matched.itemKey,
      type: matched.type,
      chapterNumber: matched.type === 'adhyay' ? matched.chapterNumber : null,
      completedAt: FieldValue.serverTimestamp(),
      completedBy: input.uid,
      reminderSentAt: null,
      reminderCount: 0,
    });
  }
  await batch.commit();

  return {
    practiceDateKey: dateKey,
    completedCount: pending.length,
    alreadyComplete: false,
  };
}

export async function getPracticeAdminOverviewCore(input: { groupId: string }) {
  const groupId = input.groupId.trim();
  const dateKey = practiceDateKey();

  // 3 queries total (not N+1): roster + assignments + today's completion logs.
  const [rosterSnap, assignmentsSnap, logsSnap] = await Promise.all([
    db
      .collection(COLLECTION_ROSTER)
      .where('groupId', '==', groupId)
      .where('status', '==', 'active')
      .get(),
    db.collection(COLLECTION_ASSIGNMENTS).where('groupId', '==', groupId).get(),
    db
      .collection(COLLECTION_LOGS)
      .where('groupId', '==', groupId)
      .where('practiceDateKey', '==', dateKey)
      .get(),
  ]);

  const assignmentsByUid = new Map<string, PracticeItem[]>();
  const chapterSet = new Set<number>();
  for (const doc of assignmentsSnap.docs) {
    const data = doc.data() ?? {};
    const items = normalizePracticeItems(data.items);
    assignmentsByUid.set(doc.id, items);
    for (const item of items) {
      if (item.type === 'adhyay' && item.chapterNumber) chapterSet.add(item.chapterNumber);
    }
  }

  const completedByUid = new Map<string, Set<string>>();
  for (const doc of logsSnap.docs) {
    const data = doc.data() ?? {};
    const uid = typeof data.uid === 'string' ? data.uid : '';
    const itemKey = typeof data.itemKey === 'string' ? data.itemKey : '';
    if (!uid || !itemKey) continue;
    const set = completedByUid.get(uid) ?? new Set<string>();
    set.add(itemKey);
    completedByUid.set(uid, set);
  }

  const titles = await loadChapterTitles([...chapterSet]);
  const members: Array<{
    uid: string;
    name: string;
    phoneNumber: string;
    items: ReturnType<typeof enrichItems>;
    allComplete: boolean;
    incompleteCount: number;
  }> = [];

  for (const doc of rosterSnap.docs) {
    const data = doc.data() ?? {};
    if (data.role && data.role !== 'user') continue;
    const phoneNumber = typeof data.phoneNumber === 'string' ? data.phoneNumber : `+${doc.id}`;
    const uid = phoneToUid(phoneNumber);
    const name = typeof data.name === 'string' ? data.name : phoneNumber;
    const items = assignmentsByUid.get(uid) ?? [];
    if (items.length === 0) {
      members.push({
        uid,
        name,
        phoneNumber,
        items: [],
        allComplete: false,
        incompleteCount: 0,
      });
      continue;
    }
    const completedKeys = completedByUid.get(uid) ?? new Set<string>();
    const enriched = enrichItems(items, completedKeys, titles);
    const incompleteCount = enriched.filter((item) => !item.completed).length;
    members.push({
      uid,
      name,
      phoneNumber,
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

export async function sendPracticeReminderCore(input: {
  actorUid: string;
  groupId: string;
  uid?: string;
  remindAllIncomplete?: boolean;
}) {
  const groupId = input.groupId.trim();
  const dateKey = practiceDateKey();
  const overview = await getPracticeAdminOverviewCore({ groupId });

  const targets = overview.members.filter((member) => {
    if (member.items.length === 0) return false;
    if (!member.allComplete) {
      if (input.remindAllIncomplete) return true;
      if (input.uid && member.uid === input.uid) return true;
    }
    return false;
  });

  if (targets.length === 0) {
    throw new HttpsError('failed-precondition', 'No incomplete members to remind.');
  }

  let sent = 0;
  for (const member of targets) {
    const pending = member.items.filter((item) => !item.completed);
    const labels = pending
      .map((item) => (item.type === 'aarti' ? 'Aarti' : `Adhyay ${item.chapterNumber}`))
      .join(', ');
    const title = 'Practice reminder';
    const body = `Please complete today's Adhyay${pending.some((p) => p.type === 'aarti') ? ' & Aarti' : ''}: ${labels}`;

    await Promise.all([
      db.collection(COLLECTION_NOTIFICATIONS).add({
        uid: member.uid,
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
      }),
      sendUserPracticePush({
        uid: member.uid,
        groupId,
        title,
        body,
        data: {
          type: 'practice_reminder',
          screen: 'practice',
          practiceDateKey: dateKey,
        },
      }),
      db.collection(COLLECTION_ASSIGNMENTS).doc(member.uid).set(
        {
          lastReminderAt: FieldValue.serverTimestamp(),
          lastReminderBy: input.actorUid,
          lastReminderPracticeDateKey: dateKey,
        },
        { merge: true }
      ),
    ]);
    sent += 1;
  }

  return { sent, practiceDateKey: dateKey };
}
