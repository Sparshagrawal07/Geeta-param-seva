/** Standing Adhyay/Aarti practice — shared client helpers & types. */

export type PracticeItemType = 'adhyay' | 'aarti';

export interface PracticeItem {
  type: PracticeItemType;
  /** Present when type === 'adhyay' (1–18). */
  chapterNumber?: number;
  /** Stable id: adhyay_01 … adhyay_18 | aarti */
  itemKey: string;
}

export interface MemberPracticeAssignment {
  uid: string;
  groupId: string;
  items: PracticeItem[];
  updatedAt?: Date;
  updatedBy?: string;
}

export interface PracticeItemToday extends PracticeItem {
  completed: boolean;
  completedAt?: Date | null;
  titleEn?: string;
  titleHi?: string;
}

export interface MyPracticeToday {
  practiceDateKey: string;
  assignment: MemberPracticeAssignment | null;
  items: PracticeItemToday[];
}

export interface PracticeMemberOverviewRow {
  uid: string;
  name: string;
  phoneNumber: string;
  items: PracticeItemToday[];
  allComplete: boolean;
  incompleteCount: number;
}

export interface PracticeAdminOverview {
  practiceDateKey: string;
  groupId: string;
  memberCount: number;
  completeCount: number;
  incompleteCount: number;
  members: PracticeMemberOverviewRow[];
}

export const AARTI_ITEM_KEY = 'aarti';
export const PRACTICE_TIMEZONE = 'Asia/Kolkata';
export const REQUIRED_ADHYAY_COUNT = 2;

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

/**
 * Rolling practice day key (YYYY-MM-DD) with noon IST boundary.
 * Before 12:00 local → yesterday's calendar date; from 12:00 onward → today.
 */
export function practiceDateKey(now: Date = new Date(), timeZone = PRACTICE_TIMEZONE): string {
  const parts = getZonedYmdH(now, timeZone);
  let { year, month, day } = parts;
  if (parts.hour < 12) {
    const prev = addCalendarDays(year, month, day, -1);
    year = prev.year;
    month = prev.month;
    day = prev.day;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function practiceLogDocId(uid: string, dateKey: string, itemKey: string): string {
  return `${uid}_${dateKey}_${itemKey}`;
}

export type PracticeValidationError =
  | 'need_two_adhyays'
  | 'duplicate_adhyay'
  | 'invalid_chapter'
  | 'too_many_aarti'
  | 'invalid_item';

export function validatePracticeItems(items: PracticeItem[]): PracticeValidationError | null {
  if (!Array.isArray(items) || items.length < 2 || items.length > 3) {
    return 'need_two_adhyays';
  }

  const adhyays = items.filter((item) => item.type === 'adhyay');
  const aartis = items.filter((item) => item.type === 'aarti');

  if (adhyays.length !== REQUIRED_ADHYAY_COUNT) {
    return 'need_two_adhyays';
  }
  if (aartis.length > 1) {
    return 'too_many_aarti';
  }

  const chapters = new Set<number>();
  for (const item of adhyays) {
    const chapter = Number(item.chapterNumber);
    if (!Number.isInteger(chapter) || chapter < 1 || chapter > 18) {
      return 'invalid_chapter';
    }
    if (chapters.has(chapter)) {
      return 'duplicate_adhyay';
    }
    chapters.add(chapter);
    if (item.itemKey !== adhyayItemKey(chapter)) {
      return 'invalid_item';
    }
  }

  for (const item of aartis) {
    if (item.itemKey !== AARTI_ITEM_KEY) {
      return 'invalid_item';
    }
  }

  return null;
}

export function normalizePracticeItems(raw: unknown): PracticeItem[] {
  if (!Array.isArray(raw)) return [];
  const items: PracticeItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const data = entry as Record<string, unknown>;
    const type = data.type === 'aarti' ? 'aarti' : data.type === 'adhyay' ? 'adhyay' : null;
    if (!type) continue;
    if (type === 'aarti') {
      items.push(buildAartiItem());
      continue;
    }
    const chapterNumber = Number(data.chapterNumber);
    if (!Number.isInteger(chapterNumber) || chapterNumber < 1 || chapterNumber > 18) continue;
    items.push(buildAdhyayItem(chapterNumber));
  }
  return items;
}

function getZonedYmdH(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
  };
}

function addCalendarDays(year: number, month: number, day: number, delta: number) {
  const utc = new Date(Date.UTC(year, month - 1, day + delta));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  };
}
