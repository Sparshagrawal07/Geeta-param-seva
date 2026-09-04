import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

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
  rows?: Array<{
    name: string;
    phoneNumber: string;
    assignment: string;
    cells: Record<string, 'Yes' | 'No' | ''>;
  }>;
};

/** Admin: fetch beautified monthly Yes/No practice Excel (base64 + row fallback). */
export async function getPracticeMonthlyReportRemote(groupId: string) {
  const callable = httpsCallable(functions, 'getPracticeMonthlyReport', {
    timeout: 120_000,
  });
  const response = await callable({ groupId });
  return response.data as PracticeMonthlyReportFile;
}
