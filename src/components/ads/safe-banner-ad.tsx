import { useState } from 'react';
import { Platform, View } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { useAds } from '@/providers/ads-provider';
import { useLocale } from '@/providers/locale-provider';
import type { AdScreen } from '@/lib/ads-config';

interface SafeBannerAdProps {
  screen: AdScreen;
  /** Home may use slot 2 when Remote Config max_home >= 2 (Profile/Seva ignore slot 2). */
  slot?: 1 | 2;
  className?: string;
}

/**
 * Non-sticky, labeled banner with padding so it sits away from primary taps.
 * Collapses entirely if ads are disabled, native SDK missing, or load fails.
 * Does not overlay a click blocker (AdMob policy).
 */
export function SafeBannerAd({ screen, slot = 1, className = '' }: SafeBannerAdProps) {
  const { t } = useLocale();
  const {
    canShow,
    unitIdFor,
    native,
    ready,
    config,
    isAdmin,
    nativeResolved,
    sdkResolved,
  } = useAds();
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const unitId = unitIdFor(slot);
  const screenEnabled =
    screen === 'home'
      ? config.showHome && (slot === 1 || config.maxHome >= 2)
      : screen === 'seva'
        ? config.showSeva && slot === 1
        : config.showProfile && slot === 1;
  const reservePlacement =
    ready &&
    config.enabled &&
    screenEnabled &&
    (!isAdmin || config.showAdmins) &&
    Boolean(unitId);

  if (
    !reservePlacement ||
    failed ||
    (nativeResolved && !native) ||
    (sdkResolved && !canShow(screen, slot))
  ) {
    return null;
  }

  if (!unitId) return null;

  const BannerAd = native?.BannerAd;
  const size = native?.BannerAdSize.BANNER || native?.BannerAdSize.ANCHORED_ADAPTIVE_BANNER;
  const showBanner = Boolean(BannerAd && size && canShow(screen, slot));

  return (
    <View
      className={`overflow-hidden rounded-2xl border border-gp-border/50 bg-gp-card/70 px-3 pb-3 pt-2 dark:border-gp-border-dark/50 dark:bg-gp-card-dark/70 ${className}`}
      collapsable={false}
      accessibilityRole="summary"
      accessibilityLabel={t('adLabel')}>
      <AppText className="mb-2 text-center text-[10px] uppercase tracking-widest text-gp-muted dark:text-gp-muted-dark">
        {t('adLabel')}
      </AppText>
      <View
        className="items-center justify-center overflow-hidden rounded-xl"
        style={{ minHeight: 50 }}
        collapsable={false}>
        {showBanner && BannerAd && size ? (
          <BannerAd
            unitId={unitId}
            size={size}
            requestOptions={{
              requestNonPersonalizedAdsOnly: true,
            }}
            onAdLoaded={() => setLoaded(true)}
            onAdFailedToLoad={() => setFailed(true)}
          />
        ) : null}
        {!loaded && Platform.OS !== 'web' ? (
          <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
            <AppText className="text-xs text-gp-muted dark:text-gp-muted-dark">{t('adLoading')}</AppText>
          </View>
        ) : null}
      </View>
    </View>
  );
}
