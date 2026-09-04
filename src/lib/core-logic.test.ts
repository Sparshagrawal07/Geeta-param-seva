import { describe, expect, it } from 'vitest';

import { filterMembersByScope } from '@/lib/member-scope';
import {
  isValidE164PhoneNumber,
  isValidIndianMobileDigits,
  normalizePhoneNumber,
  phoneToDocId,
  phonesMatch,
  sanitizeIndianMobileDigits,
  toE164IndianMobile,
} from '@/lib/phone';
import { profileNeedsName } from '@/lib/profile';
import { applyDomainTerms, sanitizeHiText } from '@/lib/i18n/translate';

type TestMember = {
  uid: string;
  name: string;
  phoneNumber: string;
  role: 'user' | 'admin' | 'senior_admin';
  groupId?: string | null;
  assignedGroupIds?: string[];
};

const sampleMembers: TestMember[] = [
  {
    uid: 'u1',
    name: 'Member One',
    phoneNumber: '+919876543210',
    role: 'user',
    groupId: 'group-1',
  },
  {
    uid: 'a1',
    name: 'Admin North',
    phoneNumber: '+919999999991',
    role: 'admin',
    groupId: null,
    assignedGroupIds: ['group-1'],
  },
  {
    uid: 'a2',
    name: 'Admin South',
    phoneNumber: '+919999999992',
    role: 'admin',
    groupId: null,
    assignedGroupIds: ['group-2'],
  },
  {
    uid: 'sa1',
    name: 'Senior Admin',
    phoneNumber: '+919999999999',
    role: 'senior_admin',
    groupId: null,
    assignedGroupIds: [],
  },
];

describe('phone utilities', () => {
  it('normalizes spacing and formats to E.164', () => {
    expect(normalizePhoneNumber('+91 98765 43210')).toBe('+919876543210');
  });

  it('creates stable doc ids regardless of plus prefix formatting', () => {
    expect(phoneToDocId('+919876543210')).toBe('919876543210');
    expect(phoneToDocId('919876543210')).toBe('919876543210');
  });

  it('matches phones with different formatting', () => {
    expect(phonesMatch('+919876543210', '919876543210')).toBe(true);
    expect(phonesMatch('+919876543210', '+919876543211')).toBe(false);
  });

  it('validates E.164 numbers', () => {
    expect(isValidE164PhoneNumber('+919876543210')).toBe(true);
    expect(isValidE164PhoneNumber('9876543210')).toBe(false);
  });

  it('sanitizes Indian mobile digits to at most 10', () => {
    expect(sanitizeIndianMobileDigits('+91 98765-43210')).toBe('9876543210');
    expect(sanitizeIndianMobileDigits('919876543210')).toBe('9876543210');
    expect(sanitizeIndianMobileDigits('+919599679802')).toBe('9599679802');
    expect(sanitizeIndianMobileDigits('00919599679802')).toBe('9599679802');
    expect(sanitizeIndianMobileDigits('09876543210')).toBe('9876543210');
    expect(sanitizeIndianMobileDigits('98765432101234')).toBe('9876543210');
    expect(sanitizeIndianMobileDigits('98a76b543210')).toBe('9876543210');
    // Legitimate local numbers that start with 91 stay intact when already 10 digits
    expect(sanitizeIndianMobileDigits('9198765432')).toBe('9198765432');
  });

  it('validates 10-digit Indian mobiles', () => {
    expect(isValidIndianMobileDigits('9876543210')).toBe(true);
    expect(isValidIndianMobileDigits('6876543210')).toBe(true);
    expect(isValidIndianMobileDigits('5876543210')).toBe(false);
    expect(isValidIndianMobileDigits('987654321')).toBe(false);
    expect(isValidIndianMobileDigits('+919876543210')).toBe(false);
  });

  it('composes E.164 from Indian mobile digits', () => {
    expect(toE164IndianMobile('9876543210')).toBe('+919876543210');
    expect(toE164IndianMobile('98765 43210')).toBe('+919876543210');
  });
});

describe('profileNeedsName', () => {
  it('returns true when profile is missing', () => {
    expect(profileNeedsName(null)).toBe(true);
    expect(profileNeedsName(undefined)).toBe(true);
  });

  it('returns true for empty or whitespace names', () => {
    expect(profileNeedsName({ name: '' })).toBe(true);
    expect(profileNeedsName({ name: '   ' })).toBe(true);
  });

  it('returns false when a real name exists', () => {
    expect(profileNeedsName({ name: 'Ravi' })).toBe(false);
  });
});

describe('filterMembersByScope', () => {
  it('returns all members when scope is undefined', () => {
    expect(filterMembersByScope(sampleMembers)).toHaveLength(4);
  });

  it('returns empty list for empty scope', () => {
    expect(filterMembersByScope(sampleMembers, [])).toEqual([]);
  });

  it('includes group members, assigned admins, and senior admin for a group', () => {
    const scoped = filterMembersByScope(sampleMembers, ['group-1']);
    expect(scoped.map((member) => member.uid).sort()).toEqual(['a1', 'sa1', 'u1']);
  });

  it('excludes admins not assigned to the scoped group', () => {
    const scoped = filterMembersByScope(sampleMembers, ['group-1']);
    expect(scoped.some((member) => member.uid === 'a2')).toBe(false);
  });

  it('includes south admin when south group is selected', () => {
    const scoped = filterMembersByScope(sampleMembers, ['group-2']);
    expect(scoped.map((member) => member.uid).sort()).toEqual(['a2', 'sa1']);
  });
});

describe('translation sanitization', () => {
  it('replaces domain terms before translation', () => {
    expect(applyDomainTerms('Chapter poll')).toBe('अध्याय poll');
    expect(applyDomainTerms('Feed')).toBe('अपडेट');
    expect(applyDomainTerms('Could not load feed.')).toBe('Could not load अपडेट.');
  });

  it('removes leaked glossary markers from cached translations', () => {
    expect(sanitizeHiText('[[ADHYAY]] चुनाव')).toBe('अध्याय चुनाव');
    expect(sanitizeHiText('[[ FEED ]]')).toBe('अपडेट');
    expect(sanitizeHiText('Some [[UNKNOWN]] text')).toBe('Some text');
  });
});

describe('post-login profile setup', () => {
  it('first-time user requires name setup after login', () => {
    expect(profileNeedsName(null)).toBe(true);
    expect(profileNeedsName({ name: '' })).toBe(true);
  });

  it('returning user with name skips profile setup', () => {
    expect(profileNeedsName({ name: 'Existing User' })).toBe(false);
  });

  it('whitelisted admin first login is detected via empty profile name', () => {
    expect(profileNeedsName({ name: '   ' })).toBe(true);
  });
});

describe('whitelist duplicate detection', () => {
  it('treats differently formatted numbers as duplicates', () => {
    const entries = [{ phoneNumber: '+919876543210' }];
    const candidate = normalizePhoneNumber('919876543210');
    const duplicate = entries.some((entry) => phonesMatch(entry.phoneNumber, candidate));
    expect(duplicate).toBe(true);
  });
});
