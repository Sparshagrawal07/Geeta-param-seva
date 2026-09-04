import { describe, expect, it } from 'vitest';

import {
  buildAdhyayItem,
  buildAartiItem,
  practiceDateKey,
  validatePracticeItems,
} from '@/lib/practice';

function istDate(isoLocal: string) {
  // Interpret as IST wall time by appending offset.
  return new Date(`${isoLocal}+05:30`);
}

describe('practiceDateKey noon IST boundary', () => {
  it('uses yesterday before noon IST', () => {
    expect(practiceDateKey(istDate('2026-08-29T11:59:00'))).toBe('2026-08-28');
  });

  it('uses today from noon IST inclusive', () => {
    expect(practiceDateKey(istDate('2026-08-29T12:00:00'))).toBe('2026-08-29');
    expect(practiceDateKey(istDate('2026-08-29T12:01:00'))).toBe('2026-08-29');
  });

  it('keeps evening completion on the same practice day until next noon', () => {
    expect(practiceDateKey(istDate('2026-08-28T22:00:00'))).toBe('2026-08-28');
    expect(practiceDateKey(istDate('2026-08-29T11:00:00'))).toBe('2026-08-28');
  });
});

describe('validatePracticeItems', () => {
  it('requires exactly two distinct adhyays', () => {
    expect(validatePracticeItems([buildAdhyayItem(1)])).toBe('need_two_adhyays');
    expect(validatePracticeItems([buildAdhyayItem(1), buildAdhyayItem(1)])).toBe('duplicate_adhyay');
    expect(validatePracticeItems([buildAdhyayItem(1), buildAdhyayItem(2)])).toBeNull();
  });

  it('allows optional single aarti', () => {
    expect(
      validatePracticeItems([buildAdhyayItem(5), buildAdhyayItem(12), buildAartiItem()])
    ).toBeNull();
    expect(
      validatePracticeItems([
        buildAdhyayItem(1),
        buildAdhyayItem(2),
        buildAartiItem(),
        buildAartiItem(),
      ])
    ).toBe('need_two_adhyays');
  });
});
