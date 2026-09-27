import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { clearSessionCache } from '@/lib/cache';
import { TERMS_ACCEPTED_STORAGE_KEY } from '@/lib/terms-agreement';

export const SELECTED_GROUP_STORAGE_KEY = 'app.selected-group-id';
export const THEME_STORAGE_KEY = 'app.theme.v1';
export const LOCALE_STORAGE_KEY = 'app.locale';
export const PUSH_DEVICE_ID_KEY = 'app.push-device-id';
const DYNAMIC_I18N_CACHE_KEY = 'app.i18n.hi-dynamic-cache';

const SESSION_KEY_PREFIXES = [SELECTED_GROUP_STORAGE_KEY, DYNAMIC_I18N_CACHE_KEY] as const;

const PRESERVED_KEYS = new Set<string>([
  THEME_STORAGE_KEY,
  LOCALE_STORAGE_KEY,
  PUSH_DEVICE_ID_KEY,
  TERMS_ACCEPTED_STORAGE_KEY,
]);

/**
 * Selected group is stored per account, not as one device-wide value: two people
 * sharing a phone must not inherit each other's group.
 */
export function selectedGroupStorageKey(uid: string): string {
  return `${SELECTED_GROUP_STORAGE_KEY}:${uid}`;
}

/** Stable per-install device id (also used for push + sole-session enforcement). */
export async function getStableDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(PUSH_DEVICE_ID_KEY);
  if (existing) return existing;
  const generated = `${Platform.OS}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  await AsyncStorage.setItem(PUSH_DEVICE_ID_KEY, generated);
  return generated;
}

/** Clears mutable user/session state while preserving global preferences and device identity. */
export async function clearSessionState(): Promise<void> {
  // The exact prefixes go in unconditionally, so signing out still clears them if
  // key enumeration is unavailable; the sweep catches the per-account suffixed ones.
  const keysToRemove: string[] = [...SESSION_KEY_PREFIXES];
  try {
    if (typeof AsyncStorage.getAllKeys === 'function') {
      const allKeys = await AsyncStorage.getAllKeys();
      for (const key of allKeys) {
        if (
          SESSION_KEY_PREFIXES.some((prefix) => key.startsWith(prefix)) ||
          key.startsWith('seva.lastSeenAt.')
        ) {
          keysToRemove.push(key);
        }
      }
    }
  } catch {
    // Ignore enumeration failures; still clear known session keys.
  }
  await Promise.all([
    AsyncStorage.multiRemove(keysToRemove),
    clearSessionCache(),
  ]);
}

export function isPreservedSessionKey(key: string): boolean {
  return PRESERVED_KEYS.has(key);
}
