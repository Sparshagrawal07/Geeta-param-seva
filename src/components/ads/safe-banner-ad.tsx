import { useState } from 'react';
import { Platform, View, useWindowDimensions } from 'react-native';

import { AppText } from '@/components/ui/app-text';
import { useAds } from '@/providers/ads-provider';
import { useLocale } from '@/providers/locale-provider';
import type { AdScreen } from '@/lib/ads-config';

interface SafeBannerAdProps {
  screen: AdScreen;
  /** Home may use slot 2 when Remote Config max_home >= 2 and space allows. */
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
  const { canShow, unitIdFor, native } = useAds();
  const { height } = useWindowDimensions();
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Second home banner only when the viewport is tall enough that both can sit in scroll without crowding CTAs.
  const spaceAllowsSecond = height >= 720;
  if (screen === 'home' && slot === 2 && !spaceAllowsSecond) {
    return null;
  }

  if (!canShow(screen, slot) || failed || !native) {
    return null;
  }

  const unitId = unitIdFor(slot);
  if (!unitId) return null;

  const BannerAd = native.BannerAd;
  // Standard 320x50-class banner — smaller and less UI intrusion than adaptive.
  const size = native.BannerAdSize.BANNER || native.BannerAdSize.ANCHORED_ADAPTIVE_BANNER;

  return (
    <View
      className={`mt-6 mb-2 overflow-hidden rounded-2xl border border-gp-border/70 bg-gp-card/80 px-3 pb-3 pt-2 dark:border-gp-border-dark/70 dark:bg-gp-card-dark/80 ${className}`}
      // Keep clear of neighboring press targets
      style={{ marginHorizontal: 2 }}
      accessibilityRole="summary"
      accessibilityLabel={t('adLabel')}>
      <AppText className="mb-2 text-center text-[10px] uppercase tracking-widest text-gp-muted dark:text-gp-muted-dark">
        {t('adLabel')}
      </AppText>
      <View className="min-h-[50px] items-center justify-center overflow-hidden rounded-xl">
        <BannerAd
          unitId={unitId}
          size={size}
          requestOptions={{
            requestNonPersonalizedAdsOnly: true,
          }}
          onAdLoaded={() => setLoaded(true)}
          onAdFailedToLoad={() => setFailed(true)}
        />
        {!loaded && Platform.OS !== 'web' ? (
          <View className="absolute inset-0 items-center justify-center">
            <AppText className="text-xs text-gp-muted dark:text-gp-muted-dark">{t('adLoading')}</AppText>
          </View>
        ) : null}
      </View>
    </View>
  );
}
