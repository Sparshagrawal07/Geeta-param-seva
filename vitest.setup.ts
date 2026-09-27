import { vi } from 'vitest';

(globalThis as { __DEV__?: boolean }).__DEV__ = false;

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  AppState: {
    addEventListener: vi.fn(() => ({ remove: vi.fn() })),
  },
}));

vi.mock('react-native-get-random-values', () => ({}));

vi.mock('@react-native-async-storage/async-storage', () => {
  const storage = new Map<string, string>();
  return {
    default: {
      getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
      setItem: vi.fn(async (key: string, value: string) => {
        storage.set(key, value);
      }),
      removeItem: vi.fn(async (key: string) => {
        storage.delete(key);
      }),
      getAllKeys: vi.fn(async () => [...storage.keys()]),
      multiRemove: vi.fn(async (keys: string[]) => {
        for (const key of keys) storage.delete(key);
      }),
      clear: vi.fn(async () => {
        storage.clear();
      }),
    },
  };
});
