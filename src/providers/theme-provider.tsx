import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Appearance, useColorScheme as useSystemColorScheme } from 'react-native';

import {
  ACCENTS,
  DEFAULT_ACCENT,
  DEFAULT_THEME_MODE,
  THEME_STORAGE_KEY,
  buildThemeColors,
  resolveScheme,
  type AccentId,
  type ResolvedScheme,
  type ThemeColors,
  type ThemeMode,
} from '@/lib/theme';

interface ThemeContextValue {
  mode: ThemeMode;
  accentId: AccentId;
  scheme: ResolvedScheme;
  colors: ThemeColors;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
  setAccentId: (accentId: AccentId) => void;
  accents: typeof ACCENTS;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

interface StoredTheme {
  mode?: ThemeMode;
  accentId?: AccentId;
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'system' || value === 'light' || value === 'dark';
}

function isAccentId(value: unknown): value is AccentId {
  return value === 'saffron';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useSystemColorScheme();
  const [mode, setModeState] = useState<ThemeMode>(DEFAULT_THEME_MODE);
  const [accentId, setAccentIdState] = useState<AccentId>(DEFAULT_ACCENT);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(THEME_STORAGE_KEY).then((raw) => {
      if (!active) return;
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as StoredTheme;
          if (isThemeMode(parsed.mode)) setModeState(parsed.mode);
          if (isAccentId(parsed.accentId)) setAccentIdState(parsed.accentId);
        } catch {
          // ignore corrupt storage
        }
      }
      setHydrated(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void AsyncStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ mode, accentId }));
  }, [mode, accentId, hydrated]);

  const scheme = resolveScheme(mode, systemScheme);
  const colors = useMemo(() => buildThemeColors(scheme, accentId), [scheme, accentId]);

  useEffect(() => {
    // RN 0.86+: pass 'unspecified' to follow the system (null is no longer accepted).
    Appearance.setColorScheme(mode === 'system' ? 'unspecified' : mode);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
  }, []);

  const setAccentId = useCallback((next: AccentId) => {
    setAccentIdState(next);
  }, []);

  const value = useMemo(
    () => ({
      mode,
      accentId,
      scheme,
      colors,
      isDark: scheme === 'dark',
      setMode,
      setAccentId,
      accents: ACCENTS,
    }),
    [mode, accentId, scheme, colors, setMode, setAccentId]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useThemeSettings() {
  const context = useContext(ThemeContext);
  if (!context) {
    const system = Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
    const colors = buildThemeColors(system, DEFAULT_ACCENT);
    return {
      mode: DEFAULT_THEME_MODE,
      accentId: DEFAULT_ACCENT,
      scheme: system as ResolvedScheme,
      colors,
      isDark: system === 'dark',
      setMode: () => undefined,
      setAccentId: () => undefined,
      accents: ACCENTS,
    } satisfies ThemeContextValue;
  }
  return context;
}
