export const CONTENT_REPORT_REASONS = [
  'inappropriate',
  'offensive',
  'harassment',
  'spam',
  'incorrect',
  'other',
] as const;

export type ContentReportReason = (typeof CONTENT_REPORT_REASONS)[number];

export type ContentReportStatus = 'open' | 'resolved' | 'dismissed';

export type ContentReportContentType = 'post';

export interface ContentReport {
  id: string;
  reporterUid: string;
  reporterName: string;
  contentId: string;
  contentType: ContentReportContentType;
  groupId: string;
  contentCreatorUid: string;
  contentCreatorName: string;
  contentTitle: string;
  reason: ContentReportReason;
  /** Free-text details; required when reason is other. */
  details?: string;
  status: ContentReportStatus;
  createdAt: Date;
  updatedAt: Date;
  resolvedBy?: string;
  resolvedAt?: Date;
}

export function contentReportDocId(contentId: string, reporterUid: string): string {
  return `${contentId}_${reporterUid}`;
}

export function isContentReportReason(value: unknown): value is ContentReportReason {
  return (
    typeof value === 'string' &&
    (CONTENT_REPORT_REASONS as readonly string[]).includes(value)
  );
}

export const CONTENT_REPORT_DETAILS_MIN = 8;
export const CONTENT_REPORT_DETAILS_MAX = 300;

export function normalizeReportDetails(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function isValidReportDetails(reason: ContentReportReason, details: string): boolean {
  const normalized = normalizeReportDetails(details);
  if (reason === 'other') {
    return (
      normalized.length >= CONTENT_REPORT_DETAILS_MIN &&
      normalized.length <= CONTENT_REPORT_DETAILS_MAX
    );
  }
  return normalized.length <= CONTENT_REPORT_DETAILS_MAX;
}
