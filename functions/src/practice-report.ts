/**
 * Monthly practice attendance Excel for admins.
 * Columns: Name | Phone | Assigned practice | date… (Yes/No).
 * Range: 1st of current practice month → current practice day (noon IST).
 */

import ExcelJS from 'exceljs';
import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

import { db } from './firebase-admin';
import { phoneToUid } from './member-identity';
import {
  PRACTICE_TIMEZONE,
  assignmentIdentityKeys,
  loadAssignmentsByMemberKey,
  logIdentityKeys,
  normalizePracticeItems,
  practiceDateKey,
  type PracticeItem,
} from './practice';
import { sendUserPracticePush } from './push';
import { loadActiveGroupMembers, ROSTER_SCAN_LIMIT } from './roster-query';
import { getZonedParts } from './schedule-math';

const COLLECTION_ASSIGNMENTS = 'member_practice_assignments';
const COLLECTION_LOGS = 'practice_completion_logs';
const COLLECTION_NOTIFICATIONS = 'notifications';
const COLLECTION_GROUPS = 'groups';
const COLLECTION_USERS = 'users';
const COLLECTION_REPORT_REMINDERS = 'practice_report_reminders';

/** The Excel is generated for the whole group, so scan the full roster. */
const ROSTER_REPORT_SCAN_LIMIT = ROSTER_SCAN_LIMIT;

/** Firestore caps an `in` query at 30 values. */
const PHONE_IN_QUERY_LIMIT = 30;

const BRAND_SAFFRON = 'FFC45C26';
const BRAND_GOLD = 'FFD4A017';
const HEADER_FILL = 'FFF8F1E7';
const YES_FILL = 'FFE8F5E9';
const NO_FILL = 'FFFFEBEE';
const ZEBRA_FILL = 'FFFBF7F2';

function addCalendarDays(year: number, month: number, day: number, delta: number) {
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + delta);
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  };
}

function parseDateKey(dateKey: string): { year: number; month: number; day: number } {
  const [y, m, d] = dateKey.split('-').map((part) => Number(part));
  if (!y || !m || !d) {
    throw new HttpsError('invalid-argument', 'Invalid practice date key.');
  }
  return { year: y, month: m, day: d };
}

function formatDateKey(parts: { year: number; month: number; day: number }): string {
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

/** Inclusive list of YYYY-MM-DD keys from month start through `toDateKey`. */
export function listDateKeysThrough(toDateKey: string): string[] {
  const to = parseDateKey(toDateKey);
  let cursor = { year: to.year, month: to.month, day: 1 };
  const keys: string[] = [];
  while (formatDateKey(cursor) <= toDateKey) {
    keys.push(formatDateKey(cursor));
    cursor = addCalendarDays(cursor.year, cursor.month, cursor.day, 1);
  }
  return keys;
}

function monthKeyFromDateKey(dateKey: string): string {
  return dateKey.slice(0, 7);
}

function formatDisplayDate(dateKey: string): string {
  const { year, month, day } = parseDateKey(dateKey);
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${day} ${months[month - 1]} ${year}`;
}

function assignmentLabel(items: PracticeItem[]): string {
  if (items.length === 0) return '—';
  return items
    .map((item) => (item.type === 'aarti' ? 'Aarti' : `Adhyay ${item.chapterNumber}`))
    .join(', ');
}

function isLastCalendarDayOfMonth(now: Date = new Date(), timeZone = PRACTICE_TIMEZONE): boolean {
  const parts = getZonedParts(now, timeZone);
  const tomorrow = addCalendarDays(parts.year, parts.month, parts.day, 1);
  return tomorrow.month !== parts.month;
}

export async function getPracticeMonthlyReportCore(input: { groupId: string }) {
  const groupId = input.groupId.trim();
  if (!groupId) {
    throw new HttpsError('invalid-argument', 'Group is required.');
  }

  const toDateKey = practiceDateKey();
  const fromDateKey = `${monthKeyFromDateKey(toDateKey)}-01`;
  const dateKeys = listDateKeysThrough(toDateKey);

  const [rosterMembers, assignmentsSnap, logsSnap, groupSnap, usersSnap] = await Promise.all([
    loadActiveGroupMembers(groupId, ROSTER_REPORT_SCAN_LIMIT),
    db.collection(COLLECTION_ASSIGNMENTS).where('groupId', '==', groupId).get(),
    db
      .collection(COLLECTION_LOGS)
      .where('groupId', '==', groupId)
      .where('practiceDateKey', '>=', fromDateKey)
      .where('practiceDateKey', '<=', toDateKey)
      .get(),
    db.collection(COLLECTION_GROUPS).doc(groupId).get(),
    db.collection(COLLECTION_USERS).where('groupId', '==', groupId).get(),
  ]);

  // Same batched phone-keyed read the Practice screen uses, so a member whose
  // assignment doc still carries a previous groupId is not reported as blank.
  const memberAssignments = await loadAssignmentsByMemberKey(
    rosterMembers.map((member) => member.memberKey),
    groupId
  );

  const groupName =
    typeof groupSnap.data()?.name === 'string' && groupSnap.data()?.name
      ? String(groupSnap.data()?.name)
      : groupId;

  // A member's standing list and their completion logs can be filed under
  // different ids (phone-keyed id vs. Auth uid). Index both sides by every id
  // they may be read under, then join on the phone-keyed id the roster knows.
  const itemsByMemberKey = new Map<string, PracticeItem[]>();
  const identityKeysByMemberKey = new Map<string, Set<string>>();

  const linkIdentity = (memberKey: string, id: string) => {
    if (!id) return;
    const set = identityKeysByMemberKey.get(memberKey) ?? new Set<string>();
    set.add(id);
    identityKeysByMemberKey.set(memberKey, set);
  };

  for (const [memberKey, entry] of memberAssignments) {
    itemsByMemberKey.set(memberKey, entry.items);
    linkIdentity(memberKey, memberKey);
  }

  for (const doc of assignmentsSnap.docs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    const items = normalizePracticeItems(data.items);
    if (items.length === 0) continue;

    const phone = typeof data.phoneNumber === 'string' ? data.phoneNumber.trim() : '';
    const memberKey =
      (typeof data.memberKey === 'string' && data.memberKey.trim()) ||
      (phone ? phoneToUid(phone) : doc.id);
    if (!itemsByMemberKey.has(memberKey)) itemsByMemberKey.set(memberKey, items);
    linkIdentity(memberKey, memberKey);
    for (const key of assignmentIdentityKeys(doc.id, data)) linkIdentity(memberKey, key);
  }

  // Profiles bridge accounts that predate the phone-keyed assignment docs.
  for (const doc of usersSnap.docs) {
    const phone = doc.data()?.phoneNumber;
    if (typeof phone !== 'string' || !phone.trim()) continue;
    linkIdentity(phoneToUid(phone.trim()), doc.id);
  }

  /**
   * Members who are no longer in this group but still have history here.
   *
   * The roster only knows who belongs to the group *today*, so a member removed
   * last week — or a whole extra group an admin has just pruned — would silently
   * vanish from the month they actually practised in. Their row is rebuilt from the
   * assignment and completion docs that are already loaded above, which is what
   * keeps the report an honest record of the month rather than of the roster.
   */
  const historical = new Map<string, { name: string; phoneNumber: string }>();
  const noteHistorical = (memberKey: string, name: unknown, phone: unknown) => {
    if (!memberKey) return;
    const phoneNumber = typeof phone === 'string' ? phone.trim() : '';
    const existing = historical.get(memberKey);
    const resolvedName = typeof name === 'string' ? name.trim() : '';
    if (existing) {
      // Never downgrade a name we already have to a blank one.
      if (!existing.name && resolvedName) existing.name = resolvedName;
      if (!existing.phoneNumber && phoneNumber) existing.phoneNumber = phoneNumber;
      return;
    }
    historical.set(memberKey, { name: resolvedName, phoneNumber });
  };

  for (const doc of assignmentsSnap.docs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    const phone = typeof data.phoneNumber === 'string' ? data.phoneNumber.trim() : '';
    const memberKey =
      (typeof data.memberKey === 'string' && data.memberKey.trim()) ||
      (phone ? phoneToUid(phone) : doc.id);
    noteHistorical(memberKey, data.name, phone);
    linkIdentity(memberKey, memberKey);
  }

  for (const doc of logsSnap.docs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    const phone = typeof data.phoneNumber === 'string' ? data.phoneNumber.trim() : '';
    for (const key of logIdentityKeys(data)) {
      noteHistorical(key, data.name, phone);
      linkIdentity(key, key);
    }
  }

  // Names for members who have since left the group: the assignment doc carries one
  // from now on, and for older data fall back to whichever profile still has the
  // phone number on file.
  const needName = [...historical.entries()]
    .filter(([, value]) => !value.name && value.phoneNumber)
    .map(([memberKey, value]) => ({ memberKey, phoneNumber: value.phoneNumber }));
  for (let i = 0; i < needName.length; i += PHONE_IN_QUERY_LIMIT) {
    const slice = needName.slice(i, i + PHONE_IN_QUERY_LIMIT);
    try {
      const snap = await db
        .collection(COLLECTION_USERS)
        .where(
          'phoneNumber',
          'in',
          slice.map((entry) => entry.phoneNumber)
        )
        .get();
      const byPhone = new Map<string, string>();
      for (const doc of snap.docs) {
        const phone = doc.data()?.phoneNumber;
        const name = doc.data()?.name;
        if (typeof phone === 'string' && typeof name === 'string' && name.trim()) {
          byPhone.set(phone.trim(), name.trim());
        }
      }
      for (const entry of slice) {
        const name = byPhone.get(entry.phoneNumber);
        const record = historical.get(entry.memberKey);
        if (name && record && !record.name) record.name = name;
      }
    } catch (error) {
      console.warn('practice_report_name_lookup_failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** identity → dateKey → completed itemKeys */
  const completedByKeyDate = new Map<string, Map<string, Set<string>>>();
  for (const doc of logsSnap.docs) {
    const data = (doc.data() ?? {}) as Record<string, unknown>;
    const dateKey = typeof data.practiceDateKey === 'string' ? data.practiceDateKey : '';
    const itemKey = typeof data.itemKey === 'string' ? data.itemKey : '';
    if (!dateKey || !itemKey) continue;
    for (const key of logIdentityKeys(data)) {
      const byDate = completedByKeyDate.get(key) ?? new Map<string, Set<string>>();
      const set = byDate.get(dateKey) ?? new Set<string>();
      set.add(itemKey);
      byDate.set(dateKey, set);
      completedByKeyDate.set(key, byDate);
    }
  }

  type Row = {
    name: string;
    phoneNumber: string;
    assignment: string;
    cells: Record<string, 'Yes' | 'No' | ''>;
  };

  const rows: Row[] = [];

  // Live members first, then anyone whose history is still filed under this group.
  const reportMembers = new Map<string, { name: string; phoneNumber: string }>();
  for (const member of rosterMembers) {
    if (member.role !== 'user') continue;
    const phoneNumber = member.phoneNumber;
    reportMembers.set(member.memberKey, {
      name: member.name.trim() ? member.name.trim() : phoneNumber,
      phoneNumber,
    });
  }
  for (const [memberKey, value] of historical) {
    if (reportMembers.has(memberKey)) continue;
    reportMembers.set(memberKey, {
      name: value.name || value.phoneNumber || memberKey,
      phoneNumber: value.phoneNumber,
    });
  }

  for (const [memberKey, member] of reportMembers) {
    const items = itemsByMemberKey.get(memberKey) ?? [];
    const identityKeys = identityKeysByMemberKey.get(memberKey) ?? new Set([memberKey]);
    identityKeys.add(memberKey);
    const cells: Record<string, 'Yes' | 'No' | ''> = {};

    for (const dateKey of dateKeys) {
      if (items.length === 0) {
        cells[dateKey] = '';
        continue;
      }
      const completed = new Set<string>();
      for (const key of identityKeys) {
        for (const itemKey of completedByKeyDate.get(key)?.get(dateKey) ?? []) {
          completed.add(itemKey);
        }
      }
      const allDone = items.every((item) => completed.has(item.itemKey));
      cells[dateKey] = allDone ? 'Yes' : 'No';
    }

    rows.push({
      name: member.name,
      phoneNumber: member.phoneNumber,
      assignment: assignmentLabel(items),
      cells,
    });
  }

  rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Geeta Param Seva';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Practice report', {
    views: [{ state: 'frozen', xSplit: 3, ySplit: 4 }],
  });

  const lastCol = 3 + dateKeys.length;
  sheet.mergeCells(1, 1, 1, Math.max(lastCol, 3));
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = 'Geeta Param Seva — Monthly Practice Report';
  titleCell.font = { bold: true, size: 16, color: { argb: BRAND_SAFFRON } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };

  sheet.mergeCells(2, 1, 2, Math.max(lastCol, 3));
  const metaCell = sheet.getCell(2, 1);
  metaCell.value = `Group: ${groupName}  ·  Period: ${formatDisplayDate(fromDateKey)} → ${formatDisplayDate(toDateKey)}  ·  Generated: ${formatDisplayDate(toDateKey)}`;
  metaCell.font = { size: 11, color: { argb: 'FF5C4A3A' } };

  sheet.mergeCells(3, 1, 3, Math.max(lastCol, 3));
  const legendCell = sheet.getCell(3, 1);
  legendCell.value =
    'Yes = all assigned Adhyays/Aarti completed that practice day (noon IST). No = incomplete or missed. Blank = no assignment.';
  legendCell.font = { size: 10, italic: true, color: { argb: 'FF7A6A5A' } };

  const header = ['Name', 'Phone', 'Assigned practice', ...dateKeys.map(formatDisplayDate)];
  const headerRow = sheet.getRow(4);
  header.forEach((value, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = value;
    cell.font = { bold: true, color: { argb: 'FF3D2B1F' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.border = {
      bottom: { style: 'thin', color: { argb: BRAND_GOLD } },
    };
    cell.alignment = {
      vertical: 'middle',
      horizontal: index < 3 ? 'left' : 'center',
      wrapText: true,
    };
  });
  headerRow.height = 28;

  rows.forEach((row, rowIndex) => {
    const excelRow = sheet.getRow(5 + rowIndex);
    const values: Array<string> = [row.name, row.phoneNumber, row.assignment];
    for (const dateKey of dateKeys) {
      values.push(row.cells[dateKey] ?? '');
    }
    values.forEach((value, colIndex) => {
      const cell = excelRow.getCell(colIndex + 1);
      cell.value = value;
      cell.alignment = {
        vertical: 'middle',
        horizontal: colIndex < 3 ? 'left' : 'center',
      };
      if (rowIndex % 2 === 1 && colIndex < 3) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA_FILL } };
      }
      if (value === 'Yes') {
        cell.font = { bold: true, color: { argb: 'FF2E7D32' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: YES_FILL } };
      } else if (value === 'No') {
        cell.font = { bold: true, color: { argb: 'FFC62828' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NO_FILL } };
      }
    });
  });

  sheet.getColumn(1).width = 28;
  sheet.getColumn(2).width = 16;
  sheet.getColumn(3).width = 28;
  for (let i = 0; i < dateKeys.length; i += 1) {
    sheet.getColumn(4 + i).width = 12;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  const monthKey = monthKeyFromDateKey(toDateKey);
  const safeGroup = groupName.replace(/[^\w\-]+/g, '_').slice(0, 40) || groupId;
  const fileName = `Practice_Report_${safeGroup}_${monthKey}.xlsx`;

  return {
    groupId,
    groupName,
    monthKey,
    fromDateKey,
    toDateKey,
    dateKeys,
    memberCount: rows.length,
    fileName,
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    base64,
    // Lightweight rows so Expo Go can fall back to CSV if binary share fails.
    rows: rows.map((row) => ({
      name: row.name,
      phoneNumber: row.phoneNumber,
      assignment: row.assignment,
      cells: row.cells,
    })),
  };
}

async function listAdminUidsForGroup(groupId: string): Promise<string[]> {
  const uids = new Set<string>();

  const [adminsSnap, seniorsSnap] = await Promise.all([
    db.collection(COLLECTION_USERS).where('assignedGroupIds', 'array-contains', groupId).get(),
    db.collection(COLLECTION_USERS).where('role', '==', 'senior_admin').get(),
  ]);

  for (const doc of adminsSnap.docs) {
    const role = doc.data()?.role;
    if (role === 'admin' || role === 'senior_admin') {
      uids.add(doc.id);
    }
  }
  for (const doc of seniorsSnap.docs) {
    uids.add(doc.id);
  }
  return [...uids];
}

/**
 * On the last calendar day of the month (IST), remind admins to download
 * the complete monthly practice Excel from the Practice tab.
 */
export async function notifyPracticeMonthlyReportCore(now: Date = new Date()) {
  if (!isLastCalendarDayOfMonth(now)) {
    return { skipped: true as const, reason: 'not_last_day' };
  }

  const dateKey = practiceDateKey(now);
  const monthKey = monthKeyFromDateKey(dateKey);
  const reminderRef = db.collection(COLLECTION_REPORT_REMINDERS).doc(monthKey);
  const existing = await reminderRef.get();
  if (existing.exists) {
    return { skipped: true as const, reason: 'already_sent', monthKey };
  }

  const groupsSnap = await db.collection(COLLECTION_GROUPS).get();
  let notified = 0;

  for (const groupDoc of groupsSnap.docs) {
    const groupId = groupDoc.id;
    const groupName =
      typeof groupDoc.data()?.name === 'string' && groupDoc.data()?.name
        ? String(groupDoc.data()?.name)
        : groupId;
    const adminUids = await listAdminUidsForGroup(groupId);
    const title = 'Download monthly practice report';
    const body = `${groupName}: today's the last day of the month. Open Practice and download the Excel report for a full Yes/No attendance sheet.`;

    for (const uid of adminUids) {
      await Promise.all([
        db.collection(COLLECTION_NOTIFICATIONS).add({
          uid,
          groupId,
          type: 'practice_report',
          title,
          body,
          createdAt: FieldValue.serverTimestamp(),
          readAt: null,
          data: {
            screen: 'practice',
            monthKey,
            type: 'practice_report',
          },
        }),
        sendUserPracticePush({
          uid,
          groupId,
          title,
          body,
          data: {
            type: 'practice_report',
            screen: 'practice',
            monthKey,
          },
        }),
      ]);
      notified += 1;
    }
  }

  await reminderRef.set({
    monthKey,
    notified,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { skipped: false as const, monthKey, notified };
}
