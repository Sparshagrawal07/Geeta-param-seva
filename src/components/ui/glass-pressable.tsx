import { type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { AppPressable, type AppPressableProps } from '@/components/ui/app-pressable';
import { GlassSurface } from '@/components/ui/glass-surface';
import { canUseLiquidGlass } from '@/lib/liquid-glass';

export interface GlassPressableProps extends AppPressableProps {
  children: ReactNode;
  /** Fallback chrome when glass is unavailable. */
  fallbackClassName?: string;
  fallbackStyle?: StyleProp<ViewStyle>;
  glassStyle?: 'regular' | 'clear';
  contentClassName?: string;
  contentStyle?: StyleProp<ViewStyle>;
}

/**
 * Interactive Liquid Glass control on iOS 26+; AppPressable + fallback chrome otherwise.
 */
export function GlassPressable({
  children,
  fallbackClassName,
  fallbackStyle,
  glassStyle = 'regular',
  contentClassName,
  contentStyle,
  className,
  style,
  ...pressableProps
}: GlassPressableProps) {
  const useGlass = canUseLiquidGlass();

  if (!useGlass) {
    return (
      <AppPressable
        {...pressableProps}
        className={[fallbackClassName, className].filter(Boolean).join(' ') || undefined}
        style={(state) => {
          const resolved = typeof style === 'function' ? style(state) : style;
          return [fallbackStyle, resolved];
        }}>
        {children}
      </AppPressable>
    );
  }

  return (
    <GlassSurface interactive glassStyle={glassStyle} style={style as StyleProp<ViewStyle>}>
      <AppPressable
        {...pressableProps}
        className={contentClassName ?? className}
        style={contentStyle}
        pressOpacity={pressableProps.pressOpacity ?? 0.92}>
        {children}
      </AppPressable>
    </GlassSurface>
  );
}

/** Circular glass icon button (settings, notifications, back). */
export function GlassIconButton({
  children,
  size = 40,
  light = false,
  fallbackClassName,
  fallbackStyle,
  ...props
}: Omit<GlassPressableProps, 'children'> & {
  children: ReactNode;
  size?: number;
  light?: boolean;
}) {
  const dim: ViewStyle = { width: size, height: size, borderRadius: size / 2 };

  return (
    <GlassPressable
      {...props}
      minTouchSize={44}
      glassStyle="clear"
      style={dim}
      fallbackStyle={[
        dim,
        {
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: light ? 'rgba(0,0,0,0.3)' : undefined,
        },
        fallbackStyle,
      ]}
      fallbackClassName={
        light
          ? fallbackClassName
          : (fallbackClassName ??
            'items-center justify-center rounded-full border border-saffron/25 bg-gp-card dark:border-gold/25 dark:bg-gp-card-dark')
      }
      contentClassName="h-full w-full items-center justify-center"
      contentStyle={{ borderRadius: size / 2 }}>
      {children}
    </GlassPressable>
  );
}

/** Segmented control track for language / theme toggles. */
export function GlassSegmentTrack({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <GlassSurface
      glassStyle="regular"
      style={{ borderRadius: 12, padding: 6, flexDirection: 'row', alignSelf: 'flex-end' }}
      fallbackClassName={
        className ??
        'flex-row self-end rounded-xl border border-gp-border bg-gp-card p-1.5 dark:border-gp-border-dark dark:bg-gp-card-dark'
      }>
      <View className="flex-row items-center">{children}</View>
    </GlassSurface>
  );
}
