import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { getSpiritualNativeTabsChrome } from '@/components/navigation/spiritual-native-tabs';
import { useAppColors } from '@/hooks/use-app-colors';
import { useMemberSelectedGroup } from '@/hooks/use-member-selected-group';
import { useSevaTabBadge } from '@/hooks/use-seva-tab-badge';
import { brandPalette } from '@/lib/brand-palette';
import { useLocale } from '@/providers/locale-provider';

/** iOS: system NativeTabs → Liquid Glass on iOS 26+, brand tint/icons for identity. */
export default function UserNativeTabsLayout() {
  const { t } = useLocale();
  const { isDark } = useAppColors();
  const { groupId } = useMemberSelectedGroup();
  const { hasUnread, clearBadge } = useSevaTabBadge(groupId);
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
          <NativeTabs.Trigger.Label>{t('tabHome')}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger
          name="seva"
          listeners={{
            focus: () => {
              void clearBadge();
            },
          }}>
          <NativeTabs.Trigger.Label>{t('tabSeva')}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: 'heart', selected: 'heart.fill' }} />
          {hasUnread ? <NativeTabs.Trigger.Badge /> : null}
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="profile">
          <NativeTabs.Trigger.Label>{t('tabProfile')}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: 'person', selected: 'person.fill' }} />
        </NativeTabs.Trigger>
      </NativeTabs>
    </ThemeProvider>
  );
}
