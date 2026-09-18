import { View, type StyleProp, type ViewStyle } from 'react-native';

import { SpiritualAssetImage } from '@/components/spiritual/spiritual-asset-image';
import type { SpiritualAssetSlot } from '@/lib/spiritual-assets';

type MandalaKind = 'primary' | 'gold' | 'seal' | 'wash' | 'festive';

const SLOT_BY_KIND: Record<MandalaKind, SpiritualAssetSlot> = {
  primary: 'mandalaPrimary',
  gold: 'mandalaGold',
  seal: 'mandalaSeal',
  wash: 'mandalaWash',
  festive: 'mandalaFestive',
};

interface MandalaAccentProps {
  kind: MandalaKind;
  /** Optional opacity override (0–1). */
  opacity?: number;
  style?: StyleProp<ViewStyle>;
  className?: string;
}

/** Lightweight decorative mandala for screens/cards — tuned per kind in the asset registry. */
export function MandalaAccent({ kind, opacity, style, className }: MandalaAccentProps) {
  return (
    <SpiritualAssetImage
      slot={SLOT_BY_KIND[kind]}
      opacity={opacity}
      style={style}
      className={className}
    />
  );
}

/** Full-bleed wash wrapper — place as first child of a relative flex container. */
export function MandalaWashBackdrop({ opacity }: { opacity?: number }) {
  return (
    <View pointerEvents="none" className="absolute inset-0 overflow-hidden">
      <MandalaAccent kind="wash" opacity={opacity} />
    </View>
  );
}

/** Gold wash for Gita screens — uses mandalaGold registry slot. */
export function MandalaGoldBackdrop({ opacity }: { opacity?: number }) {
  return (
    <View pointerEvents="none" className="absolute inset-0 overflow-hidden items-center justify-center">
      <MandalaAccent kind="gold" opacity={opacity} />
    </View>
  );
}
