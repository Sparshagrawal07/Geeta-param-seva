import { router } from 'expo-router';

const PROTECTED_ROUTE_PREFIXES = [
  '/(admin)',
  '/(user)',
  '/settings',
  '/complete-profile',
  '/set-personal-pin',
] as const;

export function isProtectedRoute(pathname: string): boolean {
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return PROTECTED_ROUTE_PREFIXES.some(
    (prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`)
  );
}

export function navigateToSignIn(): void {
  router.dismissAll();
  router.replace('/sign-in');
}

export { PROTECTED_ROUTE_PREFIXES };
