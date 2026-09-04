import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { SpiritualAssetImage } from '@/components/spiritual/spiritual-asset-image';
import { useAppColors } from '@/hooks/use-app-colors';
import { brandPalette } from '@/lib/brand-palette';

/** Krishna watermark with left-side fade so verse text stays readable. */
export function VerseKrishnaBackdrop() {
  const { isDark } = useAppColors();
  const fadeFrom = isDark ? brandPalette.verseCardDark : brandPalette.verseCard;

  return (
    <View className="pointer-events-none absolute bottom-0 right-0 h-[228px] w-[172px] overflow-hidden">
      <SpiritualAssetImage slot="verseKrishna" style={{ right: -4, bottom: 0 }} />
      <LinearGradient
        colors={[`${fadeFrom}FF`, `${fadeFrom}CC`, `${fadeFrom}00`]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        locations={[0, 0.32, 1]}
        pointerEvents="none"
        style={{ position: 'absolute', left: -28, top: 0, bottom: 0, width: 130 }}
      />
    </View>
  );
}
