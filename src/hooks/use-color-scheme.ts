import { useThemeSettings } from '@/providers/theme-provider';

/** App-controlled color scheme (respects System / Light / Dark preference). */
export function useColorScheme(): 'light' | 'dark' {
  return useThemeSettings().scheme;
}
