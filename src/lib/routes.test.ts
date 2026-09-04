import { describe, expect, it } from 'vitest';

import { getDashboardRoute, getPostAuthRoute, needsPersonalPinSetup } from '@/lib/routes';

type TestProfile = {
  uid: string;
  name: string;
  phoneNumber: string;
  role: 'senior_admin' | 'admin' | 'user';
  groupId?: string | null;
  assignedGroupIds?: string[];
  hasPersonalPin?: boolean;
};

function profile(overrides: Partial<TestProfile>): TestProfile {
  return {
    uid: 'u1',
    name: 'Test User',
    phoneNumber: '+919876543210',
    role: 'user',
    assignedGroupIds: ['g1'],
    ...overrides,
  };
}

describe('getDashboardRoute', () => {
  it('routes senior admin to admin dashboard', () => {
    expect(getDashboardRoute('senior_admin')).toBe('/(admin)');
  });

  it('routes admin to admin dashboard', () => {
    expect(getDashboardRoute('admin')).toBe('/(admin)');
  });

  it('routes member to user home', () => {
    expect(getDashboardRoute('user')).toBe('/(user)');
  });
});

describe('needsPersonalPinSetup', () => {
  it('is true for admin without personal pin', () => {
    expect(needsPersonalPinSetup(profile({ role: 'admin', hasPersonalPin: false }))).toBe(true);
  });

  it('is false for admin with personal pin', () => {
    expect(needsPersonalPinSetup(profile({ role: 'admin', hasPersonalPin: true }))).toBe(false);
  });

  it('is false for members', () => {
    expect(needsPersonalPinSetup(profile({ role: 'user' }))).toBe(false);
  });
});

describe('getPostAuthRoute', () => {
  it('returns sign-in when profile is null', () => {
    expect(getPostAuthRoute(null)).toBe('/sign-in');
  });

  it('returns complete-profile when name is missing', () => {
    expect(getPostAuthRoute(profile({ name: '' }))).toBe('/complete-profile');
  });

  it('returns set-personal-pin for admin without personal pin', () => {
    expect(
      getPostAuthRoute(profile({ role: 'admin', name: 'Admin', hasPersonalPin: false }))
    ).toBe('/set-personal-pin');
  });

  it('returns admin dashboard for admin with personal pin', () => {
    expect(
      getPostAuthRoute(profile({ role: 'admin', hasPersonalPin: true }))
    ).toBe('/(admin)');
    expect(
      getPostAuthRoute(profile({ role: 'senior_admin', hasPersonalPin: true }))
    ).toBe('/(admin)');
  });

  it('returns user home for members', () => {
    expect(getPostAuthRoute(profile({ role: 'user' }))).toBe('/(user)');
  });
});
