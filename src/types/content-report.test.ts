import { describe, expect, it } from 'vitest';

import {
  CONTENT_REPORT_REASONS,
  contentReportDocId,
  isContentReportReason,
  isValidReportDetails,
} from '@/types/content-report';

describe('content report helpers', () => {
  it('builds a stable duplicate-guard document id', () => {
    expect(contentReportDocId('post-1', 'uid-a')).toBe('post-1_uid-a');
  });

  it('exposes the community report reasons', () => {
    expect(CONTENT_REPORT_REASONS).toEqual([
      'inappropriate',
      'offensive',
      'harassment',
      'spam',
      'incorrect',
      'other',
    ]);
    expect(isContentReportReason('spam')).toBe(true);
    expect(isContentReportReason('incorrect')).toBe(true);
    expect(isContentReportReason('block')).toBe(false);
  });

  it('requires details for other and accepts optional details elsewhere', () => {
    expect(isValidReportDetails('other', 'short')).toBe(false);
    expect(isValidReportDetails('other', 'This post is incorrect.')).toBe(true);
    expect(isValidReportDetails('spam', '')).toBe(true);
    expect(isValidReportDetails('spam', 'Repeated promotional noise')).toBe(true);
  });
});
