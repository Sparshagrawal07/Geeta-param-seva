import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentData,
} from 'firebase/firestore';

import { auth, db } from '@/lib/firebase';
import {
  contentReportDocId,
  isContentReportReason,
  normalizeReportDetails,
  type ContentReport,
  type ContentReportReason,
  type ContentReportStatus,
} from '@/types/content-report';
import type { FeedItem } from '@/types/feed';

const COLLECTION = 'content_reports';

function mapReport(id: string, data: DocumentData): ContentReport | null {
  if (typeof data.contentId !== 'string' || typeof data.groupId !== 'string') return null;
  if (typeof data.reporterUid !== 'string') return null;
  if (!isContentReportReason(data.reason)) return null;
  const status =
    data.status === 'resolved' || data.status === 'dismissed' || data.status === 'open'
      ? (data.status as ContentReportStatus)
      : 'open';

  const createdAt =
    typeof data.createdAt?.toDate === 'function' ? data.createdAt.toDate() : new Date();
  const updatedAt =
    typeof data.updatedAt?.toDate === 'function' ? data.updatedAt.toDate() : createdAt;
  const resolvedAt =
    typeof data.resolvedAt?.toDate === 'function' ? data.resolvedAt.toDate() : undefined;

  const details =
    typeof data.details === 'string' ? normalizeReportDetails(data.details) : undefined;

  return {
    id,
    reporterUid: data.reporterUid,
    reporterName: typeof data.reporterName === 'string' ? data.reporterName : '',
    contentId: data.contentId,
    contentType: 'post',
    groupId: data.groupId,
    contentCreatorUid: typeof data.contentCreatorUid === 'string' ? data.contentCreatorUid : '',
    contentCreatorName: typeof data.contentCreatorName === 'string' ? data.contentCreatorName : '',
    contentTitle: typeof data.contentTitle === 'string' ? data.contentTitle : '',
    reason: data.reason,
    details: details || undefined,
    status,
    createdAt,
    updatedAt,
    resolvedBy: typeof data.resolvedBy === 'string' ? data.resolvedBy : undefined,
    resolvedAt,
  };
}

export type SubmitContentReportResult = 'submitted' | 'already_reported';

export async function submitContentReport(input: {
  item: FeedItem;
  reason: ContentReportReason;
  reporterName: string;
  details?: string;
}): Promise<SubmitContentReportResult> {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('Not signed in');
  }
  if (input.item.createdBy === uid) {
    throw new Error('Cannot report own content');
  }

  const reportId = contentReportDocId(input.item.id, uid);
  const ref = doc(db, COLLECTION, reportId);
  const details = normalizeReportDetails(input.details ?? '');

  const payload = {
    reporterUid: uid,
    reporterName: input.reporterName.trim() || 'Member',
    contentId: input.item.id,
    contentType: 'post' as const,
    groupId: input.item.groupId,
    contentCreatorUid: input.item.createdBy,
    contentCreatorName: input.item.createdByName?.trim() || 'Member',
    contentTitle: input.item.title?.trim() || 'Post',
    reason: input.reason,
    ...(details ? { details } : {}),
    status: 'open' as const,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  // Prefer create-first: a pre-read getDoc on a missing report was denied by rules
  // (resource == null), which surfaced as a generic submit failure.
  try {
    await setDoc(ref, payload);
    return 'submitted';
  } catch (error) {
    const existing = await getDoc(ref);
    if (existing.exists()) {
      return 'already_reported';
    }
    throw error;
  }
}

export async function listOpenContentReports(groupIds: string[]): Promise<ContentReport[]> {
  const uniqueGroupIds = [...new Set(groupIds.filter(Boolean))];
  if (uniqueGroupIds.length === 0) return [];

  const chunks: string[][] = [];
  for (let i = 0; i < uniqueGroupIds.length; i += 30) {
    chunks.push(uniqueGroupIds.slice(i, i + 30));
  }

  const reports: ContentReport[] = [];
  for (const chunk of chunks) {
    const snap = await getDocs(
      query(
        collection(db, COLLECTION),
        where('groupId', 'in', chunk),
        where('status', '==', 'open')
      )
    );
    for (const entry of snap.docs) {
      const mapped = mapReport(entry.id, entry.data());
      if (mapped) reports.push(mapped);
    }
  }

  reports.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return reports;
}

async function updateReportStatus(
  reportId: string,
  status: 'resolved' | 'dismissed'
): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('Not signed in');
  }
  await updateDoc(doc(db, COLLECTION, reportId), {
    status,
    updatedAt: serverTimestamp(),
    resolvedBy: uid,
    resolvedAt: serverTimestamp(),
  });
}

export async function resolveContentReport(reportId: string): Promise<void> {
  await updateReportStatus(reportId, 'resolved');
}

export async function dismissContentReport(reportId: string): Promise<void> {
  await updateReportStatus(reportId, 'dismissed');
}
