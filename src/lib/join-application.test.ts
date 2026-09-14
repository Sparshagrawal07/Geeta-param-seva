import { describe, expect, it } from 'vitest';

import {
  JOIN_APPLICANT_NAME_MAX_LENGTH,
  isValidJoinApplicantName,
  normalizeJoinApplicantName,
} from '@/lib/join-application';

describe('join application name helpers', () => {
  it('trims and collapses whitespace', () => {
    expect(normalizeJoinApplicantName('  Sparsh   Agrawal  ')).toBe('Sparsh Agrawal');
  });

  it('rejects empty or oversized names', () => {
    expect(isValidJoinApplicantName('')).toBe(false);
    expect(isValidJoinApplicantName('   ')).toBe(false);
    expect(isValidJoinApplicantName('A'.repeat(JOIN_APPLICANT_NAME_MAX_LENGTH))).toBe(true);
    expect(isValidJoinApplicantName('A'.repeat(JOIN_APPLICANT_NAME_MAX_LENGTH + 1))).toBe(false);
  });
});
