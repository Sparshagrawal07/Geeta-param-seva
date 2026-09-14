import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  buildSpiritualTabBarItemStyle,
  buildSpiritualTabBarLabelStyle,
  buildSpiritualTabBarStyle,
} from '@/components/navigation/spiritual-tab-bar-metrics';
import { SpiritualAssetImage } from '@/components/spiritual/spiritual-asset-image';
import { spiritualTabBar } from '@/lib/spiritual-ui';

export {
  TAB_BAR_CONTENT_HEIGHT,
  TAB_BAR_ITEM_HEIGHT,
  TAB_BAR_PADDING_BOTTOM_BASE,
  TAB_BAR_PADDING_TOP,
  buildSpiritualTabBarItemStyle,
  buildSpiritualTabBarStyle,
  resolveSpiritualTabBarMetrics,
} from '@/components/navigation/spiritual-tab-bar-metrics';

export function TabBarLotusBackdrop() {
  return (
    <View className="absolute inset-0 overflow-hidden bg-gp-tab">
      <SpiritualAssetImage slot="navLotusBg" />
    </View>
  );
}

/** Shared Tabs `screenOptions` chrome for user + admin layouts. */
export function useSpiritualTabBarScreenOptions() {
  const insets = useSafeAreaInsets();
  const bottomInset = insets.bottom;

  return {
    headerShown: false as const,
    tabBarActiveTintColor: spiritualTabBar.active,
    tabBarInactiveTintColor: spiritualTabBar.inactive,
    tabBarLabelStyle: buildSpiritualTabBarLabelStyle(),
    tabBarItemStyle: buildSpiritualTabBarItemStyle(bottomInset),
    tabBarIconStyle: { marginTop: 0 },
    tabBarStyle: buildSpiritualTabBarStyle(bottomInset),
    tabBarBackground: () => <TabBarLotusBackdrop />,
  };
}
