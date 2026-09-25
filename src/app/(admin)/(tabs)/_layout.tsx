import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

import { DevotionalTabIcon } from '@/components/navigation/devotional-tab-icon';
import { useSpiritualTabBarScreenOptions } from '@/components/navigation/spiritual-tab-bar';
import { getTabLifecycleOptions } from '@/lib/platform-performance-policy';
import { useLocale } from '@/providers/locale-provider';

/** Android / default: keep the existing solid spiritual tab bar. */
export default function AdminTabsLayout() {
  const { t } = useLocale();
  const tabBarOptions = useSpiritualTabBarScreenOptions();

  return (
    <Tabs screenOptions={{ ...tabBarOptions, ...getTabLifecycleOptions(Platform.OS) }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabDashboard'),
          tabBarIcon: ({ color, size, focused }) => (
            <DevotionalTabIcon name="home-outline" focusedName="home" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="practice"
        options={{
          title: t('tabPractice'),
          tabBarIcon: ({ color, size, focused }) => (
            <DevotionalTabIcon name="book-outline" focusedName="book" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="create"
        options={{
          title: t('tabCreate'),
          tabBarIcon: ({ color, size, focused }) => (
            <DevotionalTabIcon name="create-outline" focusedName="create" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="members"
        options={{
          title: t('tabMembers'),
          tabBarIcon: ({ color, size, focused }) => (
            <DevotionalTabIcon name="people-outline" focusedName="people" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: t('tabMore'),
          tabBarIcon: ({ color, size, focused }) => (
            <DevotionalTabIcon name="menu-outline" focusedName="menu" color={color} size={size} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
