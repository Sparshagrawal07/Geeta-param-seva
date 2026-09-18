import { type ReactNode } from 'react';
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import { GlassContainer, GlassView } from 'expo-glass-effect';

import { canUseLiquidGlass, liquidGlassTint } from '@/lib/liquid-glass';
import { useThemeSettings } from '@/providers/theme-provider';

type GlassKind = 'regular' | 'clear';

export interface GlassSurfaceProps extends Omit<ViewProps, 'children'> {
  children?: ReactNode;
  /** Fallback styles when Liquid Glass is unavailable (Android / older iOS). */
  fallbackStyle?: StyleProp<ViewStyle>;
  /** Extra styles applied on both glass and fallback. */
  style?: StyleProp<ViewStyle>;
  /** NativeWind classes for the non-glass fallback only. */
  fallbackClassName?: string;
  glassStyle?: GlassKind;
  /** Interactive liquid glass for buttons / chips. */
  interactive?: boolean;
  /** Soft brand gold tint. Default false so Apple's material stays native. */
  tinted?: boolean;
  /** When false, always render the fallback View. */
  enabled?: boolean;
}

/**
 * iOS 26+ native Liquid Glass (UIGlassEffect) with the existing solid fallback elsewhere.
 * Do not put opacity animations on this or ancestors — glass will blank out.
 */
export function GlassSurface({
  children,
  style,
  fallbackStyle,
  fallbackClassName,
  glassStyle = 'regular',
  interactive = false,
  tinted = false,
  enabled = true,
  className,
  ...props
}: GlassSurfaceProps & { className?: string }) {
  const { scheme } = useThemeSettings();
  const useGlass = enabled && canUseLiquidGlass();

  if (!useGlass) {
    return (
      <View
        {...props}
        className={[fallbackClassName, className].filter(Boolean).join(' ') || undefined}
        style={[fallbackStyle, style]}>
        {children}
      </View>
    );
  }

  return (
    <GlassView
      {...props}
      glassEffectStyle={glassStyle}
      isInteractive={interactive}
      colorScheme={scheme}
      tintColor={
        tinted
          ? interactive
            ? liquidGlassTint.interactive
            : glassStyle === 'clear'
              ? liquidGlassTint.clear
              : liquidGlassTint.regular
          : undefined
      }
      style={[styles.base, style]}>
      {children}
    </GlassView>
  );
}

/** Morphs neighboring GlassViews on iOS 26; plain row layout everywhere else. */
export function GlassCluster({
  children,
  spacing = 12,
  style,
  className,
}: {
  children: ReactNode;
  spacing?: number;
  style?: StyleProp<ViewStyle>;
  className?: string;
}) {
  const row: ViewStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  };

  if (!canUseLiquidGlass()) {
    return (
      <View className={className} style={[row, style]}>
        {children}
      </View>
    );
  }

  return <GlassContainer spacing={spacing} style={[row, style]}>{children}</GlassContainer>;
}

const styles = StyleSheet.create({
  base: {
    borderCurve: 'continuous',
    overflow: 'visible',
  },
});
