import { describe, expect, it, vi } from 'vitest';

const routerMocks = vi.hoisted(() => ({
  dismissAll: vi.fn(),
  replace: vi.fn(),
}));

vi.mock('expo-router', () => ({
  router: routerMocks,
}));

import { isProtectedRoute, navigateToSignIn, PROTECTED_ROUTE_PREFIXES } from '@/lib/auth-navigation';

describe('isProtectedRoute', () => {
  it('treats admin routes as protected', () => {
    expect(isProtectedRoute('/(admin)/members')).toBe(true);
    expect(isProtectedRoute('/(admin)/feed')).toBe(true);
  });

  it('treats user routes as protected', () => {
    expect(isProtectedRoute('/(user)')).toBe(true);
    expect(isProtectedRoute('/(user)/notifications')).toBe(true);
  });

  it('treats settings, complete-profile, and set-personal-pin as protected', () => {
    expect(isProtectedRoute('/settings')).toBe(true);
    expect(isProtectedRoute('/complete-profile')).toBe(true);
    expect(isProtectedRoute('/set-personal-pin')).toBe(true);
  });

  it('does not protect sign-in or legal routes', () => {
    expect(isProtectedRoute('/sign-in')).toBe(false);
    expect(isProtectedRoute('/legal/privacy')).toBe(false);
    expect(isProtectedRoute('/legal/terms')).toBe(false);
  });

  it('lists expected protected prefixes', () => {
    expect(PROTECTED_ROUTE_PREFIXES).toEqual([
      '/(admin)',
      '/(user)',
      '/settings',
      '/complete-profile',
      '/set-personal-pin',
    ]);
  });
});

describe('navigateToSignIn', () => {
  it('dismisses all routes then replaces with sign-in', () => {
    routerMocks.dismissAll.mockClear();
    routerMocks.replace.mockClear();
    navigateToSignIn();
    expect(routerMocks.dismissAll).toHaveBeenCalledTimes(1);
    expect(routerMocks.replace).toHaveBeenCalledWith('/sign-in');
  });
});

describe('signOutUser contract', () => {
  it('auth provider clears session, disables push, signs out, and navigates', () => {
    const source = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '../providers/auth-provider.tsx'),
      'utf8'
    );
    expect(source).toContain('disableDeviceTokenOnSignOut');
    expect(source).toContain('clearSessionState');
    expect(source).toContain('signOut(auth)');
    expect(source).toContain('navigateToSignIn');
    expect(source).toContain('setLoading(true)');
  });

  it('settings panel delegates delete account to signOutUser', () => {
    const source = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '../components/settings/settings-panel.tsx'),
      'utf8'
    );
    expect(source).toContain('deleteUserAccount');
    expect(source).toContain('signOutUser');
    expect(source).not.toMatch(/\bsignOut\s*\(/);
  });

  it('settings screen redirects unauthenticated users', () => {
    const source = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '../app/settings.tsx'),
      'utf8'
    );
    expect(source).toContain('<Redirect href="/sign-in" />');
    expect(source).toContain('LoadingScreen');
  });

  it('root layout wraps navigator with AuthNavigationBoundary', () => {
    const source = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '../app/_layout.tsx'),
      'utf8'
    );
    expect(source).toContain('AuthNavigationBoundary');
  });

  it('notification provider registers push disable on sign-out only', () => {
    const source = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '../providers/notification-provider.tsx'),
      'utf8'
    );
    expect(source).toContain('registerDisablePushOnSignOut');
    expect(source).toContain('setDeviceEnabled(deviceId, false)');
    expect(source).toContain('pushGenerationRef');
    // Must not auto-disable whenever profile is null (races PIN login).
    expect(source).not.toMatch(
      /if \(authLoading \|\| profile\?\.uid\) return;\s*void disableRegisteredDevice\(\)/
    );
  });
});
