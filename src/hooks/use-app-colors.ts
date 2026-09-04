import { useThemeSettings } from '@/providers/theme-provider';

export function useAppColors() {
  const { colors, isDark } = useThemeSettings();

  return {
    isDark,
    primarySpinner: '#FFFFFF',
    secondarySpinner: colors.saffron,
    ...colors,
  };
}
