import type { PropsWithChildren, ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { MandalaAccent } from '@/components/spiritual/mandala-accent';
import { useAppColors } from '@/hooks/use-app-colors';
import { spiritualDesignTokens, spiritualGradients } from '@/lib/spiritual-ui';

type SurfaceVariant = 'default' | 'elevated' | 'verse' | 'auth';

interface SpiritualSurfaceProps extends ViewProps {
  children: ReactNode;
  variant?: SurfaceVariant;
  bordered?: boolean;
  className?: string;
  /** Soft mandala watermark for elevated cards (default off). Verse surfaces always include one. */
  withMandala?: boolean;
}

function useSurfaceColors(variant: SurfaceVariant, isDark: boolean) {
  switch (variant) {
    case 'elevated':
      return isDark ? spiritualDesignTokens.elevated.dark : spiritualDesignTokens.elevated.light;
    case 'verse':
      return isDark ? spiritualDesignTokens.verseSurface.dark : spiritualDesignTokens.verseSurface.light;
    case 'auth':
      return isDark ? spiritualDesignTokens.verseSurface.dark : '#FFFFFF';
    default:
      return isDark ? spiritualDesignTokens.elevated.dark : '#FFFFFF';
  }
}

function SurfaceMandala({ variant }: { variant: SurfaceVariant }) {
  if (variant === 'verse') {
    return (
      <View pointerEvents="none" className="absolute inset-0 overflow-hidden">
        <MandalaAccent kind="primary" />
      </View>
    );
  }
  if (variant === 'elevated') {
    return (
      <View pointerEvents="none" className="absolute inset-0 overflow-hidden">
        <MandalaAccent kind="seal" />
      </View>
    );
  }
  return null;
}

export function SpiritualSurface({
  children,
  variant = 'default',
  bordered = true,
  className,
  withMandala = false,
  ...rest
}: SpiritualSurfaceProps) {
  const { isDark } = useAppColors();
  const borderClass = bordered
    ? 'border border-saffron/20 dark:border-gold/25'
    : '';
  const showMandala = variant === 'verse' || withMandala;

  if (variant === 'verse') {
    const colors = isDark ? spiritualGradients.verseCard.dark : spiritualGradients.verseCard.light;
    return (
      <View
        className={`relative overflow-hidden rounded-3xl shadow-lg shadow-black/10 dark:shadow-black/30 ${borderClass} ${className ?? ''}`}
        {...rest}>
        <LinearGradient colors={[...colors]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <SurfaceMandala variant="verse" />
          {children}
        </LinearGradient>
      </View>
    );
  }

  const bg = useSurfaceColors(variant, isDark);
  return (
    <View
      className={`relative overflow-hidden rounded-2xl ${borderClass} ${className ?? ''}`}
      style={{ backgroundColor: bg }}
      {...rest}>
      {showMandala ? (
        <SurfaceMandala variant={variant === 'elevated' || variant === 'default' ? 'elevated' : 'verse'} />
      ) : null}
      {children}
    </View>
  );
}

export function SpiritualSurfaceBody({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) {
  return <View className={`relative px-5 py-6 ${className ?? ''}`} style={{ zIndex: 1 }}>{children}</View>;
}
