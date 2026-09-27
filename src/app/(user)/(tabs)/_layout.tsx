import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

import { DevotionalTabIcon } from '@/components/navigation/devotional-tab-icon';
import { useSpiritualTabBarScreenOptions } from '@/components/navigation/spiritual-tab-bar';
import { useMemberSelectedGroup } from '@/hooks/use-member-selected-group';
import { useSevaTabBadge } from '@/hooks/use-seva-tab-badge';
import { getTabLifecycleOptions } from '@/lib/platform-performance-policy';
import { useLocale } from '@/providers/locale-provider';

/** Android / default: keep the existing solid spiritual tab bar. */
export default function UserTabsLayout() {
  const { t } = useLocale();
  const { groupId } = useMemberSelectedGroup();
  const { hasUnread, clearBadge } = useSevaTabBadge(groupId);
  const tabBarOptions = useSpiritualTabBarScreenOptions();

  return (
    <Tabs screenOptions={{ ...tabBarOptions, ...getTabLifecycleOptions(Platform.OS) }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabHome'),
          tabBarButtonTestID: 'tab-home',
          tabBarIcon: ({ color, size, focused }) => (
            <DevotionalTabIcon name="home-outline" focusedName="home" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="seva"
        listeners={{
          focus: () => {
            void clearBadge();
          },
        }}
        options={{
          title: t('tabSeva'),
          tabBarButtonTestID: 'tab-seva',
          tabBarBadge: hasUnread ? '' : undefined,
          tabBarBadgeStyle: {
            backgroundColor: '#C45C26',
            minWidth: 10,
            maxHeight: 10,
            borderRadius: 5,
            top: 2,
          },
          tabBarIcon: ({ color, size, focused }) => (
            <DevotionalTabIcon name="heart-outline" focusedName="heart" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('tabProfile'),
          tabBarButtonTestID: 'tab-profile',
          tabBarIcon: ({ color, size, focused }) => (
            <DevotionalTabIcon name="person-outline" focusedName="person" color={color} size={size} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}
