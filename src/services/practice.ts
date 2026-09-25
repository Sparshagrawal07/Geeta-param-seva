import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import { getLocalCache } from '@/lib/cache';
import {
  adminPracticeCacheKey,
  groupCacheScope,
  LOCAL_CACHE_POLICY,
  practiceMutationId,
  todayPracticeCacheKey,
  userCacheScope,
} from '@/lib/cache/keys';
import { auth, db, functions } from '@/lib/firebase';
import {
  normalizePracticeItems,
  practiceDateKey,
  type MemberPracticeAssignment,
  type MyPracticeToday,
  type PracticeAdminOverview,
  type PracticeItem,
  type PracticeItemToday,
} from '@/lib/practice';
import {
  applyOptimisticPracticeCompletion,
  applyPendingPracticeMutations,
  pendingPracticeItemKeys,
  PRACTICE_MARK_ALL_OPERATION,
  PRACTICE_MARK_ONE_OPERATION,
  practiceRetryDelay,
  type PracticeCompletionMutation,
} from '@/lib/practice-local';

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
const todayRefreshInFlight = new Map<string, Promise<MyPracticeToday>>();
const adminPracticeRefreshInFlight = new Map<string, Promise<PracticeAdminOverview>>();

function phoneToUid(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, '');
  return `u${digits}`;
}

function enrichLocal(items: PracticeItem[], completedKeys: Set<string>): PracticeItemToday[] {
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
    const title = CHAPTER_TITLE_FALLBACK[chapter];
    return {
      ...item,
      completed: completedKeys.has(item.itemKey),
      titleEn: title?.titleEn ?? `Adhyay ${chapter}`,
      titleHi: title?.titleHi ?? `अध्याय ${chapter}`,
    };
  });
}

/** Direct Firestore read — avoids callable + Gen2 cost on every home open. */
export async function getMyPracticeTodayRemote(): Promise<MyPracticeToday> {
  const uid = auth.currentUser?.uid;
  const dateKey = practiceDateKey();
  if (!uid) {
    return { practiceDateKey: dateKey, assignment: null, items: [] };
  }

  try {
    const assignmentSnap = await getDoc(doc(db, 'member_practice_assignments', uid));
    if (!assignmentSnap.exists()) {
      return { practiceDateKey: dateKey, assignment: null, items: [] };
    }
    const data = assignmentSnap.data() as Record<string, unknown>;
    const items = normalizePracticeItems(data.items);
    const groupId = String(data.groupId ?? '');

    // Point reads by known doc ids — no composite index required.
    const completedKeys = new Set<string>();
    await Promise.all(
      items.map(async (item) => {
        const logId = `${uid}_${dateKey}_${item.itemKey}`;
        try {
          const logSnap = await getDoc(doc(db, 'practice_completion_logs', logId));
          if (logSnap.exists()) completedKeys.add(item.itemKey);
        } catch {
          // Ignore individual log read failures.
        }
      })
    );

    return {
      practiceDateKey: dateKey,
      assignment: { uid, groupId, items },
      items: enrichLocal(items, completedKeys),
    };
  } catch (error) {
    console.warn('[practice] direct today read failed, falling back to callable', error);
    const callable = httpsCallable(functions, 'getMyPracticeToday');
    const response = await callable({});
    const data = response.data as MyPracticeToday;
    return {
      practiceDateKey: String(data?.practiceDateKey ?? dateKey),
      assignment: data?.assignment
        ? {
            uid: String(data.assignment.uid ?? ''),
            groupId: String(data.assignment.groupId ?? ''),
            items: normalizePracticeItems(data.assignment.items),
          }
        : null,
      items: Array.isArray(data?.items)
        ? data.items.map((item) => ({
            ...normalizePracticeItems([item])[0]!,
            completed: Boolean(item.completed),
            titleEn: typeof item.titleEn === 'string' ? item.titleEn : undefined,
            titleHi: typeof item.titleHi === 'string' ? item.titleHi : undefined,
          }))
        : [],
    };
  }
}

export async function getCachedMyPracticeToday(uid: string, dateKey = practiceDateKey()) {
  const cache = await getLocalCache();
  return cache.get<MyPracticeToday>(todayPracticeCacheKey(dateKey), {
    scope: userCacheScope(uid),
  });
}

async function listPracticeMutations(uid: string) {
  const cache = await getLocalCache();
  return cache.listMutations<PracticeCompletionMutation>({
    scope: userCacheScope(uid),
    statuses: ['pending', 'processing', 'failed'],
  });
}

async function storeMyPracticeToday(uid: string, today: MyPracticeToday) {
  const cache = await getLocalCache();
  await cache.set(todayPracticeCacheKey(today.practiceDateKey), today, {
    scope: userCacheScope(uid),
    staleForMs: LOCAL_CACHE_POLICY.practiceStaleMs,
    expiresInMs: LOCAL_CACHE_POLICY.practiceExpiresMs,
  });
}

export function refreshMyPracticeToday(uid: string): Promise<MyPracticeToday> {
  if (auth.currentUser?.uid !== uid) return Promise.reject(new Error('AUTH_CHANGED'));
  const existing = todayRefreshInFlight.get(uid);
  if (existing) return existing;
  const request = (async () => {
    const remote = await getMyPracticeTodayRemote();
    if (auth.currentUser?.uid !== uid) throw new Error('AUTH_CHANGED');
    const pending = await listPracticeMutations(uid);
    const today = applyPendingPracticeMutations(remote, pending);
    await storeMyPracticeToday(uid, today);
    return today;
  })().finally(() => {
    if (todayRefreshInFlight.get(uid) === request) todayRefreshInFlight.delete(uid);
  });
  todayRefreshInFlight.set(uid, request);
  return request;
}

export async function getPendingPracticeItemKeys(
  uid: string,
  today: MyPracticeToday
): Promise<Set<string>> {
  return pendingPracticeItemKeys(today, await listPracticeMutations(uid));
}

export async function queuePracticeCompletion(input: {
  uid: string;
  today: MyPracticeToday;
  itemKey?: string;
}): Promise<MyPracticeToday> {
  if (auth.currentUser?.uid !== input.uid) throw new Error('AUTH_CHANGED');
  const dateKey = input.today.practiceDateKey;
  const payload: PracticeCompletionMutation = {
    uid: input.uid,
    dateKey,
    ...(input.itemKey ? { itemKey: input.itemKey } : {}),
  };
  const cache = await getLocalCache();
  const scope = userCacheScope(input.uid);

  if (!input.itemKey) {
    const queued = await cache.listMutations<PracticeCompletionMutation>({
      scope,
      statuses: ['pending', 'processing', 'failed'],
    });
    await Promise.all(
      queued
        .filter(
          (item) =>
            item.operation === PRACTICE_MARK_ONE_OPERATION &&
            item.payload.dateKey === dateKey
        )
        .map((item) => cache.deleteMutation(item.id))
    );
  }

  await cache.enqueueMutation({
    id: practiceMutationId(payload),
    scope,
    operation: input.itemKey
      ? PRACTICE_MARK_ONE_OPERATION
      : PRACTICE_MARK_ALL_OPERATION,
    payload,
  });

  const optimistic = applyOptimisticPracticeCompletion(input.today, payload);
  await storeMyPracticeToday(input.uid, optimistic);
  return optimistic;
}

const replayInFlight = new Map<string, Promise<void>>();

export function replayPracticeOutbox(uid: string): Promise<void> {
  const existing = replayInFlight.get(uid);
  if (existing) return existing;
  const request = replayPracticeOutboxInternal(uid).finally(() => {
    if (replayInFlight.get(uid) === request) replayInFlight.delete(uid);
  });
  replayInFlight.set(uid, request);
  return request;
}

async function replayPracticeOutboxInternal(uid: string): Promise<void> {
  if (auth.currentUser?.uid !== uid) return;
  const cache = await getLocalCache();
  const mutations = await cache.listMutations<PracticeCompletionMutation>({
    scope: userCacheScope(uid),
    statuses: ['pending', 'processing', 'failed'],
    readyAt: Date.now(),
    limit: 25,
  });

  for (const mutation of mutations) {
    if (mutation.payload.uid !== uid || auth.currentUser?.uid !== uid) continue;
    await cache.updateMutation(mutation.id, {
      status: 'processing',
      lastError: null,
    });
    try {
      if (
        mutation.operation === PRACTICE_MARK_ONE_OPERATION &&
        mutation.payload.itemKey
      ) {
        await markPracticeItemCompleteRemote(mutation.payload.itemKey);
      } else if (mutation.operation === PRACTICE_MARK_ALL_OPERATION) {
        await markAllPracticeCompleteRemote();
      } else {
        await cache.deleteMutation(mutation.id);
        continue;
      }
      await cache.deleteMutation(mutation.id);
    } catch (error) {
      const attempts = mutation.attempts + 1;
      await cache.updateMutation(mutation.id, {
        status: 'failed',
        attempts,
        nextAttemptAt: Date.now() + practiceRetryDelay(attempts),
        lastError: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export async function fetchMemberPracticeAssignment(
  uidOrPhone: string
): Promise<MemberPracticeAssignment | null> {
  const uid = uidOrPhone.startsWith('u') ? uidOrPhone : phoneToUid(uidOrPhone);
  const snap = await getDoc(doc(db, 'member_practice_assignments', uid));
  if (!snap.exists()) return null;
  const data = snap.data() as Record<string, unknown>;
  return {
    uid,
    groupId: String(data.groupId ?? ''),
    items: normalizePracticeItems(data.items),
  };
}

export { phoneToUid };

export async function markPracticeItemCompleteRemote(itemKey: string) {
  const callable = httpsCallable(functions, 'markPracticeItemComplete');
  const response = await callable({ itemKey });
  return response.data as {
    logId: string;
    practiceDateKey: string;
    alreadyComplete?: boolean;
  };
}

export async function markAllPracticeCompleteRemote() {
  const callable = httpsCallable(functions, 'markAllPracticeComplete');
  const response = await callable({});
  return response.data as {
    practiceDateKey: string;
    completedCount: number;
    alreadyComplete?: boolean;
  };
}

export async function setMemberPracticeAssignmentRemote(input: {
  groupId: string;
  uid?: string;
  phoneNumber?: string;
  items: PracticeItem[];
}) {
  const callable = httpsCallable(functions, 'setMemberPracticeAssignment');
  const response = await callable(input);
  return response.data as { uid: string; groupId: string; items: PracticeItem[] };
}

export async function getPracticeAdminOverviewRemote(groupId: string): Promise<PracticeAdminOverview> {
  const callable = httpsCallable(functions, 'getPracticeAdminOverview');
  const response = await callable({ groupId });
  const data = response.data as PracticeAdminOverview;
  return {
    practiceDateKey: String(data?.practiceDateKey ?? ''),
    groupId: String(data?.groupId ?? groupId),
    memberCount: Number(data?.memberCount ?? 0),
    completeCount: Number(data?.completeCount ?? 0),
    incompleteCount: Number(data?.incompleteCount ?? 0),
    members: Array.isArray(data?.members) ? data.members : [],
  };
}

export async function getCachedPracticeAdminOverview(
  uid: string,
  groupId: string,
  dateKey = practiceDateKey()
) {
  const cache = await getLocalCache();
  return cache.get<PracticeAdminOverview>(
    adminPracticeCacheKey(groupId, dateKey),
    { scope: groupCacheScope(uid, groupId) }
  );
}

export function refreshCachedPracticeAdminOverview(
  uid: string,
  groupId: string
): Promise<PracticeAdminOverview> {
  if (auth.currentUser?.uid !== uid) return Promise.reject(new Error('AUTH_CHANGED'));
  const scope = groupCacheScope(uid, groupId);
  const existing = adminPracticeRefreshInFlight.get(scope);
  if (existing) return existing;
  const request = (async () => {
    const overview = await getPracticeAdminOverviewRemote(groupId);
    if (auth.currentUser?.uid !== uid) throw new Error('AUTH_CHANGED');
    const cache = await getLocalCache();
    await cache.set(
      adminPracticeCacheKey(groupId, overview.practiceDateKey || practiceDateKey()),
      overview,
      {
        scope,
        staleForMs: LOCAL_CACHE_POLICY.adminPracticeStaleMs,
        expiresInMs: LOCAL_CACHE_POLICY.adminPracticeExpiresMs,
      }
    );
    return overview;
  })().finally(() => {
    if (adminPracticeRefreshInFlight.get(scope) === request) {
      adminPracticeRefreshInFlight.delete(scope);
    }
  });
  adminPracticeRefreshInFlight.set(scope, request);
  return request;
}

export async function sendPracticeReminderRemote(input: {
  groupId: string;
  uid?: string;
  remindAllIncomplete?: boolean;
}) {
  const callable = httpsCallable(functions, 'sendPracticeReminder');
  const response = await callable(input);
  return response.data as { sent: number; practiceDateKey: string };
}

export type PracticeMonthlyReportFile = {
  groupId: string;
  groupName: string;
  monthKey: string;
  fromDateKey: string;
  toDateKey: string;
  dateKeys: string[];
  memberCount: number;
  fileName: string;
  mimeType: string;
  base64?: string;
  rows?: {
    name: string;
    phoneNumber: string;
    assignment: string;
    cells: Record<string, 'Yes' | 'No' | ''>;
  }[];
};

/** Admin: fetch beautified monthly Yes/No practice Excel (base64 + row fallback). */
export async function getPracticeMonthlyReportRemote(groupId: string) {
  const callable = httpsCallable(functions, 'getPracticeMonthlyReport', {
    timeout: 120_000,
  });
  const response = await callable({ groupId });
  return response.data as PracticeMonthlyReportFile;
}
