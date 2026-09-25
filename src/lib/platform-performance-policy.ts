export type RuntimePlatform = 'android' | 'ios' | 'web' | 'windows' | 'macos';

export interface TabLifecycleOptions {
  lazy?: boolean;
  freezeOnBlur?: boolean;
}

/**
 * Android's JS tabs can defer first mount and suspend inactive renders while
 * retaining each mounted route's React state. iOS continues to use NativeTabs.
 */
export function getTabLifecycleOptions(platform: RuntimePlatform): TabLifecycleOptions {
  return platform === 'android' ? { lazy: true, freezeOnBlur: true } : {};
}

/**
 * Liquid Glass must never have an ancestor whose opacity is below one.
 * Reduced-motion also disables the content dissolve on every platform.
 */
export function shouldAnimateThemeContentOpacity(
  platform: RuntimePlatform,
  liquidGlassAvailable: boolean,
  reduceMotion: boolean
): boolean {
  if (reduceMotion) return false;
  return platform !== 'ios' || !liquidGlassAvailable;
}
