import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { SpiritualAssetImage } from '@/components/spiritual/spiritual-asset-image';
import { useAppColors } from '@/hooks/use-app-colors';
import { brandPalette } from '@/lib/brand-palette';
import { spiritualAssetSlots, spiritualDesignTokens } from '@/lib/spiritual-assets';

/** Krishna watermark with left-side fade so verse text stays readable. */
export function VerseKrishnaBackdrop() {
  const { isDark } = useAppColors();
  const fadeFrom = isDark ? brandPalette.verseCardDark : brandPalette.verseCard;
  const slot = spiritualAssetSlots.verseKrishna;
  const clip = spiritualDesignTokens.krishnaClip;
  const slotW = typeof slot.width === 'number' ? slot.width : 158;
  const slotH = typeof slot.height === 'number' ? slot.height : 190;

  return (
    <View
      pointerEvents="none"
      className="absolute bottom-0 right-0 overflow-hidden"
      style={{
        width: slotW + clip.widthPad,
        height: slotH + clip.heightPad,
      }}>
      <SpiritualAssetImage
        slot="verseKrishna"
        style={{ right: clip.rightBleed, bottom: 0 }}
      />
      <LinearGradient
        colors={[`${fadeFrom}FF`, `${fadeFrom}CC`, `${fadeFrom}00`]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        locations={[0, 0.32, 1]}
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: clip.gradientLeft,
          top: 0,
          bottom: 0,
          width: clip.gradientWidth,
        }}
      />
    </View>
  );
}
