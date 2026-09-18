import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { TERMS_ACCEPTED_STORAGE_KEY } from '@/lib/terms-agreement';

export const SELECTED_GROUP_STORAGE_KEY = 'app.selected-group-id';
export const THEME_STORAGE_KEY = 'app.theme.v1';
export const LOCALE_STORAGE_KEY = 'app.locale';
export const PUSH_DEVICE_ID_KEY = 'app.push-device-id';
const DYNAMIC_I18N_CACHE_KEY = 'app.i18n.hi-dynamic-cache';

const SESSION_KEYS = [SELECTED_GROUP_STORAGE_KEY, DYNAMIC_I18N_CACHE_KEY] as const;

const PRESERVED_KEYS = new Set<string>([
  THEME_STORAGE_KEY,
  LOCALE_STORAGE_KEY,
  PUSH_DEVICE_ID_KEY,
  TERMS_ACCEPTED_STORAGE_KEY,
]);

/** Stable per-install device id (also used for push + sole-session enforcement). */
export async function getStableDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(PUSH_DEVICE_ID_KEY);
  if (existing) return existing;
  const generated = `${Platform.OS}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  await AsyncStorage.setItem(PUSH_DEVICE_ID_KEY, generated);
  return generated;
}

/** Clears user-scoped AsyncStorage keys on sign-out. Preserves theme, locale, and device id. */
export async function clearSessionState(): Promise<void> {
  const keysToRemove: string[] = [...SESSION_KEYS];
  try {
    if (typeof AsyncStorage.getAllKeys === 'function') {
      const allKeys = await AsyncStorage.getAllKeys();
      for (const key of allKeys) {
        if (key.startsWith('seva.lastSeenAt.')) {
          keysToRemove.push(key);
        }
      }
    }
  } catch {
    // Ignore enumeration failures; still clear known session keys.
  }
  await AsyncStorage.multiRemove(keysToRemove);
}

export function isPreservedSessionKey(key: string): boolean {
  return PRESERVED_KEYS.has(key);
}
