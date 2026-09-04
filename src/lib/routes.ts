import { profileNeedsName } from '@/lib/profile';
import { isAdminRole, type UserProfile, type UserRole } from '@/lib/users';

export type AppRoute =
  | '/(admin)'
  | '/(user)'
  | '/sign-in'
  | '/complete-profile'
  | '/set-personal-pin';

export function getDashboardRoute(role: UserRole | null | undefined): AppRoute {
  return isAdminRole(role) ? '/(admin)' : '/(user)';
}

export function needsPersonalPinSetup(profile: UserProfile | null | undefined): boolean {
  if (!profile || !isAdminRole(profile.role)) {
    return false;
  }
  return profile.hasPersonalPin !== true;
}

export function getPostAuthRoute(profile: UserProfile | null): AppRoute {
  if (!profile) {
    return '/sign-in';
  }

  if (profileNeedsName(profile)) {
    return '/complete-profile';
  }

  if (needsPersonalPinSetup(profile)) {
    return '/set-personal-pin';
  }

  return getDashboardRoute(profile.role);
}
