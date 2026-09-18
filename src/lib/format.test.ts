import { describe, expect, it } from 'vitest';

import { formatFeedDateTime } from '@/lib/format';

describe('formatFeedDateTime', () => {
  const now = new Date(2026, 8, 18, 12, 0, 0); // 18 Sep 2026

  it('formats English with ordinal and dotted minutes', () => {
    const date = new Date(2026, 1, 12, 14, 30, 0); // 12 Feb 2:30 PM
    expect(formatFeedDateTime(date, 'en', now)).toBe('12th Feb 2.30 PM');
  });

  it('uses st/nd/rd/th ordinals correctly', () => {
    expect(formatFeedDateTime(new Date(2026, 0, 1, 9, 5), 'en', now)).toBe('1st Jan 9.05 AM');
    expect(formatFeedDateTime(new Date(2026, 0, 2, 9, 5), 'en', now)).toBe('2nd Jan 9.05 AM');
    expect(formatFeedDateTime(new Date(2026, 0, 3, 9, 5), 'en', now)).toBe('3rd Jan 9.05 AM');
    expect(formatFeedDateTime(new Date(2026, 0, 4, 9, 5), 'en', now)).toBe('4th Jan 9.05 AM');
    expect(formatFeedDateTime(new Date(2026, 0, 11, 9, 5), 'en', now)).toBe('11th Jan 9.05 AM');
    expect(formatFeedDateTime(new Date(2026, 0, 12, 9, 5), 'en', now)).toBe('12th Jan 9.05 AM');
    expect(formatFeedDateTime(new Date(2026, 0, 13, 9, 5), 'en', now)).toBe('13th Jan 9.05 AM');
    expect(formatFeedDateTime(new Date(2026, 0, 21, 9, 5), 'en', now)).toBe('21st Jan 9.05 AM');
  });

  it('includes year when not the current year', () => {
    const date = new Date(2025, 1, 12, 14, 30, 0);
    expect(formatFeedDateTime(date, 'en', now)).toBe('12th Feb 2025 2.30 PM');
  });

  it('returns a hindi locale string without throwing', () => {
    const date = new Date(2026, 1, 12, 14, 30, 0);
    const result = formatFeedDateTime(date, 'hi', now);
    expect(result.length).toBeGreaterThan(4);
  });
});
