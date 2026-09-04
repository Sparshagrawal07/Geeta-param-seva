import { describe, expect, it } from 'vitest';

import {
  ADMOB_TEST_BANNER_UNIT_ID,
  DEFAULT_ADS_CONFIG,
  parseAdsRemoteValues,
  resolveBannerUnitId,
  shouldShowAdsOnScreen,
  shouldShowHomeSlot2,
} from '@/lib/ads-config';

describe('ads config', () => {
  it('defaults to ads disabled until Remote Config enables them', () => {
    expect(DEFAULT_ADS_CONFIG.enabled).toBe(false);
    expect(DEFAULT_ADS_CONFIG.showAdmins).toBe(false);
    expect(DEFAULT_ADS_CONFIG.maxHome).toBe(2);
  });

  it('parses remote config strings', () => {
    const config = parseAdsRemoteValues({
      ads_enabled: 'true',
      ads_max_home: '1',
      ads_show_home: 'true',
      ads_show_seva: 'false',
      ads_show_profile: 'true',
      ads_show_admins: 'false',
      ads_banner_android: 'ca-app-pub-111/222',
      ads_banner_ios: 'ca-app-pub-333/444',
    });
    expect(config.enabled).toBe(true);
    expect(config.maxHome).toBe(1);
    expect(config.showSeva).toBe(false);
    expect(config.bannerAndroid).toBe('ca-app-pub-111/222');
    expect(config.bannerIos).toBe('ca-app-pub-333/444');
  });

  it('rejects invalid unit ids', () => {
    const config = parseAdsRemoteValues({
      ads_banner_android: 'not-a-unit',
      ads_banner_ios: '',
    });
    expect(config.bannerAndroid).toBe('');
    expect(config.bannerIos).toBe('');
  });

  it('resolves platform unit with optional test fallback', () => {
    const empty = { ...DEFAULT_ADS_CONFIG };
    expect(resolveBannerUnitId(empty, 'android', 1)).toBeNull();
    expect(resolveBannerUnitId(empty, 'android', 1, { allowTestFallback: true })).toBe(
      ADMOB_TEST_BANNER_UNIT_ID
    );

    const live = parseAdsRemoteValues({
      ads_banner_android: 'ca-app-pub-1/a',
      ads_banner_ios: 'ca-app-pub-1/i',
      ads_banner_android_2: 'ca-app-pub-1/a2',
    });
    expect(resolveBannerUnitId(live, 'android', 1)).toBe('ca-app-pub-1/a');
    expect(resolveBannerUnitId(live, 'android', 2)).toBe('ca-app-pub-1/a2');
    expect(resolveBannerUnitId(live, 'ios', 2)).toBe('ca-app-pub-1/i');
    expect(resolveBannerUnitId(live, 'web', 1)).toBeNull();
  });

  it('gates screens for members only by default', () => {
    const config = parseAdsRemoteValues({
      ads_enabled: 'true',
      ads_banner_android: 'ca-app-pub-1/a',
    });
    expect(
      shouldShowAdsOnScreen(config, 'home', {
        isAdmin: false,
        hasNativeAds: true,
        unitId: 'ca-app-pub-1/a',
      })
    ).toBe(true);
    expect(
      shouldShowAdsOnScreen(config, 'home', {
        isAdmin: true,
        hasNativeAds: true,
        unitId: 'ca-app-pub-1/a',
      })
    ).toBe(false);
    expect(
      shouldShowAdsOnScreen(config, 'home', {
        isAdmin: false,
        hasNativeAds: false,
        unitId: 'ca-app-pub-1/a',
      })
    ).toBe(false);
  });

  it('allows home slot 2 only when maxHome is 2', () => {
    expect(shouldShowHomeSlot2({ ...DEFAULT_ADS_CONFIG, maxHome: 2 }, 'u')).toBe(true);
    expect(shouldShowHomeSlot2({ ...DEFAULT_ADS_CONFIG, maxHome: 1 }, 'u')).toBe(false);
    expect(shouldShowHomeSlot2({ ...DEFAULT_ADS_CONFIG, maxHome: 2 }, null)).toBe(false);
  });
});
