import type { ComponentType } from 'react';
import { Platform } from 'react-native';

export type AdsNativeModule = {
  mobileAds: () => {
    initialize: () => Promise<unknown>;
    setRequestConfiguration?: (config: {
      tagForChildDirectedTreatment?: boolean;
      tagForUnderAgeOfConsent?: boolean;
    }) => Promise<unknown>;
  };
  BannerAd: ComponentType<{
    unitId: string;
    size: string;
    requestOptions?: { requestNonPersonalizedAdsOnly?: boolean };
    onAdLoaded?: () => void;
    onAdFailedToLoad?: (error: unknown) => void;
  }>;
  BannerAdSize: { ANCHORED_ADAPTIVE_BANNER: string; BANNER: string };
  TestIds: { BANNER: string };
};

/**
 * Lazy-load AdMob native module. Returns null on web, Expo Go, or missing native binary.
 */
export function loadAdsNative(): AdsNativeModule | null {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-google-mobile-ads') as AdsNativeModule & {
      default?: AdsNativeModule['mobileAds'];
    };
    const mobileAds = mod.mobileAds ?? mod.default;
    if (typeof mobileAds !== 'function' || !mod.BannerAd || !mod.BannerAdSize) {
      return null;
    }
    return {
      mobileAds,
      BannerAd: mod.BannerAd,
      BannerAdSize: mod.BannerAdSize,
      TestIds: mod.TestIds,
    };
  } catch {
    return null;
  }
}
