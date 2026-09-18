import type { ReactNode } from 'react';
import { View } from 'react-native';

import { SpiritualAssetImage } from '@/components/spiritual/spiritual-asset-image';
import { HomeHeroHeader } from '@/components/verse/home-hero-header';
import { spiritualDesignTokens } from '@/lib/spiritual-assets';

interface HomeHeroSectionProps {
  name: string;
  showNotificationBell?: boolean;
  rightAction?: ReactNode;
}

/** Hero + peacock feather overlapping the practice card (per reference mockup). */
export function HomeHeroSection({ name, showNotificationBell, rightAction }: HomeHeroSectionProps) {
  const bridge = spiritualDesignTokens.featherBridge;

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
        style={{ bottom: bridge.bottom, width: bridge.width, height: bridge.height }}>
        <SpiritualAssetImage slot="verseFeather" style={{ right: bridge.rightBleed, top: 0 }} />
      </View>
    </View>
  );
}
