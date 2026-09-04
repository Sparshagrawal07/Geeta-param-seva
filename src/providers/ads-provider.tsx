import { getRemoteConfig, fetchAndActivate, getValue } from 'firebase/remote-config';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';

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
  isAdmin: boolean;
  unitIdFor: (slot: 1 | 2) => string | null;
  canShow: (screen: AdScreen, slot?: 1 | 2) => boolean;
  refresh: () => Promise<void>;
}

const AdsContext = createContext<AdsContextValue | null>(null);

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
  const [native] = useState<AdsNativeModule | null>(() => loadAdsNative());
  const [config, setConfig] = useState<AdsRuntimeConfig>(DEFAULT_ADS_CONFIG);
  const [ready, setReady] = useState(false);
  const [sdkReady, setSdkReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const rc = getRemoteConfig(app);
      rc.settings = {
        minimumFetchIntervalMillis: __DEV__ ? 0 : 60 * 60 * 1000,
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
      setConfig(next);
    } catch {
      const next = readRemoteConfig();
      if (__DEV__ && !next.enabled) {
        next.enabled = true;
      }
      setConfig(next);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!native) {
      setSdkReady(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await native.mobileAds().initialize();
        if (!cancelled) setSdkReady(true);
      } catch {
        if (!cancelled) setSdkReady(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [native]);

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
      isAdmin,
      unitIdFor,
      canShow,
      refresh,
    }),
    [ready, config, native, isAdmin, unitIdFor, canShow, refresh]
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
