/**
 * Banner-only AdMob config + Firebase Remote Config keys.
 * Defaults keep ads off in production until unit IDs are configured.
 */

export const ADS_REMOTE_KEYS = {
  enabled: 'ads_enabled',
  maxHome: 'ads_max_home',
  showHome: 'ads_show_home',
  showSeva: 'ads_show_seva',
  showProfile: 'ads_show_profile',
  showAdmins: 'ads_show_admins',
  bannerAndroid: 'ads_banner_android',
  bannerIos: 'ads_banner_ios',
  bannerAndroid2: 'ads_banner_android_2',
  bannerIos2: 'ads_banner_ios_2',
} as const;

/** Google sample AdMob app IDs — replace via EXPO_PUBLIC_ADMOB_* for store builds. */
export const ADMOB_TEST_ANDROID_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
export const ADMOB_TEST_IOS_APP_ID = 'ca-app-pub-3940256099942544~1458002511';

/** Google sample banner unit — used only in __DEV__ when no Remote Config unit is set. */
export const ADMOB_TEST_BANNER_UNIT_ID = 'ca-app-pub-3940256099942544/6300978111';

export type AdScreen = 'home' | 'seva' | 'profile';

export interface AdsRuntimeConfig {
  enabled: boolean;
  maxHome: 1 | 2;
  showHome: boolean;
  showSeva: boolean;
  showProfile: boolean;
  showAdmins: boolean;
  bannerAndroid: string;
  bannerIos: string;
  bannerAndroid2: string;
  bannerIos2: string;
}

export const DEFAULT_ADS_CONFIG: AdsRuntimeConfig = {
  enabled: false,
  maxHome: 2,
  showHome: true,
  showSeva: true,
  showProfile: true,
  showAdmins: false,
  bannerAndroid: '',
  bannerIos: '',
  bannerAndroid2: '',
  bannerIos2: '',
};

function parseBool(raw: string | undefined, fallback: boolean): boolean {
  if (raw == null || raw === '') return fallback;
  const v = raw.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes') return true;
  if (v === 'false' || v === '0' || v === 'no') return false;
  return fallback;
}

function parseMaxHome(raw: string | undefined, fallback: 1 | 2): 1 | 2 {
  const n = Number(raw);
  if (n === 1) return 1;
  if (n === 2) return 2;
  return fallback;
}

function parseUnit(raw: string | undefined): string {
  const v = (raw ?? '').trim();
  if (!v || !v.startsWith('ca-app-pub-')) return '';
  return v;
}

export function parseAdsRemoteValues(
  values: Partial<Record<(typeof ADS_REMOTE_KEYS)[keyof typeof ADS_REMOTE_KEYS], string>>,
  defaults: AdsRuntimeConfig = DEFAULT_ADS_CONFIG
): AdsRuntimeConfig {
  return {
    enabled: parseBool(values[ADS_REMOTE_KEYS.enabled], defaults.enabled),
    maxHome: parseMaxHome(values[ADS_REMOTE_KEYS.maxHome], defaults.maxHome),
    showHome: parseBool(values[ADS_REMOTE_KEYS.showHome], defaults.showHome),
    showSeva: parseBool(values[ADS_REMOTE_KEYS.showSeva], defaults.showSeva),
    showProfile: parseBool(values[ADS_REMOTE_KEYS.showProfile], defaults.showProfile),
    showAdmins: parseBool(values[ADS_REMOTE_KEYS.showAdmins], defaults.showAdmins),
    bannerAndroid: parseUnit(values[ADS_REMOTE_KEYS.bannerAndroid]) || defaults.bannerAndroid,
    bannerIos: parseUnit(values[ADS_REMOTE_KEYS.bannerIos]) || defaults.bannerIos,
    bannerAndroid2: parseUnit(values[ADS_REMOTE_KEYS.bannerAndroid2]) || defaults.bannerAndroid2,
    bannerIos2: parseUnit(values[ADS_REMOTE_KEYS.bannerIos2]) || defaults.bannerIos2,
  };
}

export function resolveBannerUnitId(
  config: AdsRuntimeConfig,
  platform: 'ios' | 'android' | 'web' | string,
  slot: 1 | 2,
  options?: { allowTestFallback?: boolean }
): string | null {
  if (platform !== 'ios' && platform !== 'android') return null;

  const primaryIos = config.bannerIos;
  const primaryAndroid = config.bannerAndroid;
  const secondaryIos = config.bannerIos2;
  const secondaryAndroid = config.bannerAndroid2;

  let chosen = '';
  if (platform === 'ios') {
    if (slot === 1) {
      chosen = primaryIos || primaryAndroid;
    } else {
      chosen = secondaryIos || primaryIos || secondaryAndroid || primaryAndroid;
    }
  } else {
    if (slot === 1) {
      chosen = primaryAndroid || primaryIos;
    } else {
      chosen = secondaryAndroid || primaryAndroid || secondaryIos || primaryIos;
    }
  }

  if (chosen) return chosen;

  if (options?.allowTestFallback) {
    return ADMOB_TEST_BANNER_UNIT_ID;
  }
  return null;
}

export function shouldShowAdsOnScreen(
  config: AdsRuntimeConfig,
  screen: AdScreen,
  options: { isAdmin: boolean; hasNativeAds: boolean; unitId: string | null }
): boolean {
  if (!config.enabled) return false;
  if (!options.hasNativeAds) return false;
  if (!options.unitId) return false;
  if (options.isAdmin && !config.showAdmins) return false;

  if (screen === 'home') return config.showHome;
  if (screen === 'seva') return config.showSeva;
  if (screen === 'profile') return config.showProfile;
  return false;
}

/** Home slot 2 only when maxHome allows and a unit resolves. */
export function shouldShowHomeSlot2(config: AdsRuntimeConfig, unitId: string | null): boolean {
  return config.maxHome >= 2 && Boolean(unitId);
}
