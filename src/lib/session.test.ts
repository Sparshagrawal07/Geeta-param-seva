import { beforeEach, describe, expect, it, vi } from 'vitest';

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearSessionState,
  isPreservedSessionKey,
  LOCALE_STORAGE_KEY,
  PUSH_DEVICE_ID_KEY,
  SELECTED_GROUP_STORAGE_KEY,
  THEME_STORAGE_KEY,
} from '@/lib/session';
import { TERMS_ACCEPTED_STORAGE_KEY } from '@/lib/terms-agreement';

describe('clearSessionState', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('removes selected group key', async () => {
    await AsyncStorage.setItem(SELECTED_GROUP_STORAGE_KEY, 'group-1');
    await clearSessionState();
    expect(await AsyncStorage.getItem(SELECTED_GROUP_STORAGE_KEY)).toBeNull();
  });

  it('preserves theme storage key', async () => {
    await AsyncStorage.setItem(THEME_STORAGE_KEY, '{"mode":"dark"}');
    await clearSessionState();
    expect(await AsyncStorage.getItem(THEME_STORAGE_KEY)).toBe('{"mode":"dark"}');
  });

  it('preserves locale storage key', async () => {
    await AsyncStorage.setItem(LOCALE_STORAGE_KEY, 'hi');
    await clearSessionState();
    expect(await AsyncStorage.getItem(LOCALE_STORAGE_KEY)).toBe('hi');
  });

  it('preserves terms agreement key', async () => {
    await AsyncStorage.setItem(TERMS_ACCEPTED_STORAGE_KEY, '1');
    await clearSessionState();
    expect(await AsyncStorage.getItem(TERMS_ACCEPTED_STORAGE_KEY)).toBe('1');
  });

  it('does not delete push device id key', async () => {
    await AsyncStorage.setItem(PUSH_DEVICE_ID_KEY, 'android-abc');
    await clearSessionState();
    expect(await AsyncStorage.getItem(PUSH_DEVICE_ID_KEY)).toBe('android-abc');
  });

  it('is idempotent when called twice', async () => {
    await AsyncStorage.setItem(SELECTED_GROUP_STORAGE_KEY, 'group-1');
    await clearSessionState();
    await clearSessionState();
    expect(await AsyncStorage.getItem(SELECTED_GROUP_STORAGE_KEY)).toBeNull();
  });

  it('handles missing keys gracefully', async () => {
    await expect(clearSessionState()).resolves.toBeUndefined();
  });

  it('clears dynamic i18n cache', async () => {
    await AsyncStorage.setItem('app.i18n.hi-dynamic-cache', '{"version":"7","entries":{}}');
    await clearSessionState();
    expect(await AsyncStorage.getItem('app.i18n.hi-dynamic-cache')).toBeNull();
  });
});

describe('isPreservedSessionKey', () => {
  it('returns true for theme, locale, and device keys', () => {
    expect(isPreservedSessionKey(THEME_STORAGE_KEY)).toBe(true);
    expect(isPreservedSessionKey(LOCALE_STORAGE_KEY)).toBe(true);
    expect(isPreservedSessionKey(PUSH_DEVICE_ID_KEY)).toBe(true);
    expect(isPreservedSessionKey(TERMS_ACCEPTED_STORAGE_KEY)).toBe(true);
  });

  it('returns false for session-scoped keys', () => {
    expect(isPreservedSessionKey(SELECTED_GROUP_STORAGE_KEY)).toBe(false);
  });
});
