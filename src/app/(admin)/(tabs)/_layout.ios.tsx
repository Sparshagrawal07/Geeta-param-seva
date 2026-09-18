import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { getSpiritualNativeTabsChrome } from '@/components/navigation/spiritual-native-tabs';
import { useAppColors } from '@/hooks/use-app-colors';
import { brandPalette } from '@/lib/brand-palette';
import { useLocale } from '@/providers/locale-provider';

/** iOS: system NativeTabs → Liquid Glass on iOS 26+, brand tint/icons for identity. */
export default function AdminNativeTabsLayout() {
  const { t } = useLocale();
  const { isDark } = useAppColors();
  const chrome = getSpiritualNativeTabsChrome();

  const navigationTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme.colors : DefaultTheme.colors),
      primary: brandPalette.goldLight,
      background: isDark ? brandPalette.backgroundDark : brandPalette.background,
      card: isDark ? brandPalette.backgroundDark : brandPalette.background,
    },
  };

  return (
    <ThemeProvider value={navigationTheme}>
      <NativeTabs
        tintColor={chrome.tintColor}
        iconColor={chrome.iconColor}
        labelStyle={chrome.labelStyle}
        badgeBackgroundColor={chrome.badgeBackgroundColor}
        blurEffect={chrome.blurEffect}
        disableTransparentOnScrollEdge={chrome.disableTransparentOnScrollEdge}
        minimizeBehavior={chrome.minimizeBehavior}>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Label>{t('tabDashboard')}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="practice">
          <NativeTabs.Trigger.Label>{t('tabPractice')}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: 'book', selected: 'book.fill' }} />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="create">
          <NativeTabs.Trigger.Label>{t('tabCreate')}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: 'square.and.pencil', selected: 'square.and.pencil' }} />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="members">
          <NativeTabs.Trigger.Label>{t('tabMembers')}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: 'person.3', selected: 'person.3.fill' }} />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="more">
          <NativeTabs.Trigger.Label>{t('tabMore')}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: 'line.3.horizontal', selected: 'line.3.horizontal' }} />
        </NativeTabs.Trigger>
      </NativeTabs>
    </ThemeProvider>
  );
}
