import { Image, View, type DimensionValue, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';

import { useAppColors } from '@/hooks/use-app-colors';
import {
  resolveAssetDimensions,
  resolveAssetPosition,
  spiritualAssetSlots,
  type AssetAnchor,
  type SpiritualAssetSlot,
} from '@/lib/spiritual-assets';

interface SpiritualAssetImageProps {
  slot: SpiritualAssetSlot;
  style?: StyleProp<ViewStyle>;
  className?: string;
  /** Optional opacity override (0–1). Uses slot defaults when omitted. */
  opacity?: number;
  /** Native image blur radius, used by masked decorative blends. */
  blurRadius?: number;
}

function resolveCoverAnchorStyle(
  anchor: AssetAnchor = 'center',
  coverScale = 1.15
): ImageStyle {
  const heightPercent = `${coverScale * 100}%` as DimensionValue;
  switch (anchor) {
    case 'top':
      return { top: 0, height: heightPercent };
    case 'bottom':
      return { bottom: 0, height: heightPercent };
    default:
      return {
        top: `${-((coverScale - 1) / 2) * 100}%` as DimensionValue,
        height: heightPercent,
      };
  }
}

/** Renders a replaceable artwork slot with fixed geometry — swap PNGs without changing layouts. */
export function SpiritualAssetImage({
  slot,
  style,
  className,
  opacity: opacityOverride,
  blurRadius,
}: SpiritualAssetImageProps) {
  const { isDark } = useAppColors();
  const config = spiritualAssetSlots[slot];
  const source = isDark ? config.dark : config.light;
  const opacity =
    typeof opacityOverride === 'number'
      ? opacityOverride
      : isDark
        ? config.opacity.dark
        : config.opacity.light;
  const positionStyle = resolveAssetPosition(config.position);
  const dimensions = resolveAssetDimensions(config.width, config.height);
  const isFill = config.position === 'fill';
  const coverScale = config.coverScale ?? 1.15;

  const imageStyle: ImageStyle = isFill
    ? {
        position: 'absolute',
        left: 0,
        right: 0,
        width: '100%',
        opacity,
        ...(config.resizeMode === 'cover'
          ? resolveCoverAnchorStyle(config.anchor, coverScale)
          : { height: '100%' }),
      }
    : { ...dimensions, opacity };

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden={config.accessibilityHidden}
      importantForAccessibility={config.accessibilityHidden ? 'no-hide-descendants' : 'auto'}
      className={className}
      style={[
        positionStyle,
        isFill ? { overflow: 'hidden' } : undefined,
        config.maxWidth ? { maxWidth: config.maxWidth, width: '100%' as const } : undefined,
        isFill && config.resizeMode === 'contain'
          ? {
              alignItems: 'center' as const,
              justifyContent:
                config.anchor === 'bottom'
                  ? ('flex-end' as const)
                  : config.anchor === 'top'
                    ? ('flex-start' as const)
                    : ('center' as const),
            }
          : undefined,
        !isFill && typeof config.width === 'string'
          ? { width: '100%' as const, alignItems: 'center' as const }
          : undefined,
        style,
      ]}>
      <Image
        source={source}
        resizeMode={config.resizeMode}
        blurRadius={blurRadius}
        style={imageStyle}
      />
    </View>
  );
}
