import type { ReactNode } from 'react';
import { View } from 'react-native';

import { SpiritualAssetImage } from '@/components/spiritual/spiritual-asset-image';
import { HomeHeroHeader } from '@/components/verse/home-hero-header';

interface HomeHeroSectionProps {
  name: string;
  showNotificationBell?: boolean;
  rightAction?: ReactNode;
}

/** Hero + peacock feather overlapping the practice card (per reference mockup). */
export function HomeHeroSection({ name, showNotificationBell, rightAction }: HomeHeroSectionProps) {
  return (
    <View className="relative">
      <HomeHeroHeader
        name={name}
        showNotificationBell={showNotificationBell}
        rightAction={rightAction}
      />

      {/* Decorative only — keep clear of the Mark-complete CTA hit area. */}
      <View
        pointerEvents="none"
        className="absolute right-0 z-0"
        style={{ bottom: -72, width: 110, height: 170 }}>
        <SpiritualAssetImage slot="verseFeather" style={{ right: -4, top: 0 }} />
      </View>
    </View>
  );
}
