import { getRemoteConfig, fetchAndActivate, getValue } from 'firebase/remote-config';
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
import { InteractionManager, Platform } from 'react-native';

import { app } from '@/lib/firebase';
import {
  ADS_REMOTE_KEYS,
  DEFAULT_ADS_CONFIG,
  parseAdsRemoteValues,
  resolveBannerUnitId,
  shouldShowAdsOnScreen,
  shouldShowHomeSlot2,
  type AdScreen,
  type AdsRuntimeConfig,
} from '@/lib/ads-config';
import { loadAdsNative, type AdsNativeModule } from '@/lib/ads-native';
import { useAuth } from '@/hooks/use-auth';
import { isAdminRole } from '@/lib/users';

interface AdsContextValue {
  ready: boolean;
  config: AdsRuntimeConfig;
  native: AdsNativeModule | null;
  nativeResolved: boolean;
  sdkResolved: boolean;
  isAdmin: boolean;
  unitIdFor: (slot: 1 | 2) => string | null;
  canShow: (screen: AdScreen, slot?: 1 | 2) => boolean;
  refresh: () => Promise<void>;
}

const AdsContext = createContext<AdsContextValue | null>(null);
const ADS_CONFIG_CACHE_KEY = 'gps.ads.runtimeConfig.v1';

function parseCachedConfig(raw: string | null): AdsRuntimeConfig | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<AdsRuntimeConfig>;
    return parseAdsRemoteValues(
      {
        [ADS_REMOTE_KEYS.enabled]: String(value.enabled ?? ''),
        [ADS_REMOTE_KEYS.maxHome]: String(value.maxHome ?? ''),
        [ADS_REMOTE_KEYS.showHome]: String(value.showHome ?? ''),
        [ADS_REMOTE_KEYS.showSeva]: String(value.showSeva ?? ''),
        [ADS_REMOTE_KEYS.showProfile]: String(value.showProfile ?? ''),
        [ADS_REMOTE_KEYS.showAdmins]: String(value.showAdmins ?? ''),
        [ADS_REMOTE_KEYS.bannerAndroid]: value.bannerAndroid,
        [ADS_REMOTE_KEYS.bannerIos]: value.bannerIos,
        [ADS_REMOTE_KEYS.bannerAndroid2]: value.bannerAndroid2,
        [ADS_REMOTE_KEYS.bannerIos2]: value.bannerIos2,
      },
      DEFAULT_ADS_CONFIG
    );
  } catch {
    return null;
  }
}

function readRemoteConfig(): AdsRuntimeConfig {
  try {
    const rc = getRemoteConfig(app);
    const values: Partial<Record<(typeof ADS_REMOTE_KEYS)[keyof typeof ADS_REMOTE_KEYS], string>> =
      {};
    for (const key of Object.values(ADS_REMOTE_KEYS)) {
      values[key] = getValue(rc, key).asString();
    }
    return parseAdsRemoteValues(values, DEFAULT_ADS_CONFIG);
  } catch {
    return { ...DEFAULT_ADS_CONFIG };
  }
}

export function AdsProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const isAdmin = isAdminRole(profile?.role);
  const [native, setNative] = useState<AdsNativeModule | null>(null);
  const [nativeResolved, setNativeResolved] = useState(false);
  const [config, setConfig] = useState<AdsRuntimeConfig>(DEFAULT_ADS_CONFIG);
  const [ready, setReady] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);
  const [sdkResolved, setSdkResolved] = useState(false);

  const refresh = useCallback(async (options?: { apply?: boolean }) => {
    try {
      const rc = getRemoteConfig(app);
      rc.settings = {
        // Keep short enough that Play closed-test / Remote Config toggles apply without a long wait.
        // Still avoid hammering RC on every focus: 5 minutes in release, immediate in __DEV__.
        minimumFetchIntervalMillis: __DEV__ ? 0 : 5 * 60 * 1000,
        fetchTimeoutMillis: 15_000,
      };
      rc.defaultConfig = {
        [ADS_REMOTE_KEYS.enabled]: 'false',
        [ADS_REMOTE_KEYS.maxHome]: '2',
        [ADS_REMOTE_KEYS.showHome]: 'true',
        [ADS_REMOTE_KEYS.showSeva]: 'true',
        [ADS_REMOTE_KEYS.showProfile]: 'true',
        [ADS_REMOTE_KEYS.showAdmins]: 'false',
        [ADS_REMOTE_KEYS.bannerAndroid]: '',
        [ADS_REMOTE_KEYS.bannerIos]: '',
        [ADS_REMOTE_KEYS.bannerAndroid2]: '',
        [ADS_REMOTE_KEYS.bannerIos2]: '',
      };
      await fetchAndActivate(rc);
      const next = readRemoteConfig();
      // Local builds: show Google test banners without publishing Remote Config.
      if (__DEV__ && !next.enabled) {
        next.enabled = true;
      }
      if (options?.apply !== false) setConfig(next);
      await AsyncStorage.setItem(ADS_CONFIG_CACHE_KEY, JSON.stringify(next));
    } catch {
      const next = readRemoteConfig();
      if (__DEV__ && !next.enabled) {
        next.enabled = true;
      }
      if (options?.apply !== false) setConfig(next);
      await AsyncStorage.setItem(ADS_CONFIG_CACHE_KEY, JSON.stringify(next)).catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(ADS_CONFIG_CACHE_KEY)
      .then((raw) => {
        if (cancelled) return;
        const cached = parseCachedConfig(raw);
        if (cached) setConfig(cached);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let delayTimer: ReturnType<typeof setTimeout> | undefined;
    const task = InteractionManager.runAfterInteractions(() => {
      delayTimer = setTimeout(() => {
        if (cancelled) return;
        const loadedNative = loadAdsNative();
        setNative(loadedNative);
        setNativeResolved(true);
        if (!loadedNative) setSdkResolved(true);
        // Keep this session's placement geometry stable; freshly fetched values
        // are persisted and become active on the next launch.
        void refresh({ apply: false });
      }, 500);
    });
    return () => {
      cancelled = true;
      task.cancel?.();
      if (delayTimer) clearTimeout(delayTimer);
    };
  }, [refresh]);

  useEffect(() => {
    if (!native) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const ads = native.mobileAds();
        await ads.initialize();
        if (typeof ads.setRequestConfiguration === 'function') {
          await ads.setRequestConfiguration({
            tagForChildDirectedTreatment: false,
            tagForUnderAgeOfConsent: false,
          });
        }
        if (!cancelled) setSdkReady(true);
      } catch {
        if (!cancelled) setSdkReady(false);
      } finally {
        if (!cancelled) setSdkResolved(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [native, nativeResolved]);

  const unitIdFor = useCallback(
    (slot: 1 | 2) =>
      resolveBannerUnitId(config, Platform.OS, slot, {
        allowTestFallback: __DEV__,
      }),
    [config]
  );

  const canShow = useCallback(
    (screen: AdScreen, slot: 1 | 2 = 1) => {
      if (!ready || !sdkReady) return false;
      const unitId = unitIdFor(slot);
      if (screen === 'home' && slot === 2 && !shouldShowHomeSlot2(config, unitId)) {
        return false;
      }
      // Seva/Profile never use slot 2
      if (screen !== 'home' && slot === 2) return false;
      return shouldShowAdsOnScreen(config, screen, {
        isAdmin,
        hasNativeAds: Boolean(native),
        unitId,
      });
    },
    [ready, sdkReady, unitIdFor, config, isAdmin, native]
  );

  const value = useMemo<AdsContextValue>(
    () => ({
      ready,
      config,
      native,
      nativeResolved,
      sdkResolved,
      isAdmin,
      unitIdFor,
      canShow,
      refresh,
    }),
    [ready, config, native, nativeResolved, sdkResolved, isAdmin, unitIdFor, canShow, refresh]
  );

  return <AdsContext.Provider value={value}>{children}</AdsContext.Provider>;
}

export function useAds() {
  const ctx = useContext(AdsContext);
  if (!ctx) {
    throw new Error('useAds must be used within AdsProvider');
  }
  return ctx;
}
