import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Expo Go (SDK 53+) throws if `expo-notifications` is imported on Android.
 * Ads / custom sounds / remote push also require a dev or store native build.
 */
export function isExpoGoRuntime(): boolean {
  return Constants.appOwnership === 'expo';
}

export type NotificationsModule = typeof import('expo-notifications');

let cached: NotificationsModule | null | undefined;

/** Lazy-load expo-notifications only outside Expo Go. Returns null when unavailable. */
export function getNotificationsModule(): NotificationsModule | null {
  if (cached !== undefined) return cached;
  if (isExpoGoRuntime()) {
    cached = null;
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require('expo-notifications') as NotificationsModule;
    return cached;
  } catch {
    cached = null;
    return null;
  }
}

export function notificationsAvailable(): boolean {
  return getNotificationsModule() != null && Platform.OS !== 'web';
}
