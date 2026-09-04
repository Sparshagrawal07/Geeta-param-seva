import { View } from 'react-native';
import { Redirect, Tabs } from 'expo-router';

import { DevotionalTabIcon } from '@/components/navigation/devotional-tab-icon';
import { SpiritualAssetImage } from '@/components/spiritual/spiritual-asset-image';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { useAndroidBackExit } from '@/hooks/use-android-back-exit';
import { useAuth } from '@/hooks/use-auth';
import { useSevaTabBadge } from '@/hooks/use-seva-tab-badge';
import { isAdminRole, profileNeedsName } from '@/lib/users';
import { spiritualTabBar } from '@/lib/spiritual-ui';
import { useLocale } from '@/providers/locale-provider';

function TabBarLotusBackdrop() {
  return (
    <View className="absolute inset-0 overflow-hidden bg-gp-tab">
      <SpiritualAssetImage slot="navLotusBg" />
    </View>
  );
}

function UserTabs() {
  const { t } = useLocale();
  useAndroidBackExit();
  const { hasUnread, refresh, clearBadge } = useSevaTabBadge();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: spiritualTabBar.active,
        tabBarInactiveTintColor: spiritualTabBar.inactive,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2, marginBottom: 0 },
        tabBarItemStyle: { paddingTop: 2, height: 52 },
        tabBarIconStyle: { marginTop: 0 },
        tabBarStyle: {
          backgroundColor: spiritualTabBar.background,
          borderTopColor: spiritualTabBar.border,
          borderTopWidth: 1,
          height: 64,
          paddingTop: 4,
          paddingBottom: 6,
          overflow: 'hidden',
        },
        tabBarBackground: () => <TabBarLotusBackdrop />,
      }}
      screenListeners={{
        focus: () => {
          void refresh();
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabHome'),
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
          tabBarIcon: ({ color, size, focused }) => (
            <DevotionalTabIcon name="person-outline" focusedName="person" color={color} size={size} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="practice/aarti" options={{ href: null }} />
      <Tabs.Screen name="gita/index" options={{ href: null }} />
      <Tabs.Screen name="gita/chapter/[chapterNumber]" options={{ href: null }} />
      <Tabs.Screen name="gita/verse/[chapterNumber]/[verseNumber]" options={{ href: null }} />
    </Tabs>
  );
}

export default function UserLayout() {
  const { loading, profile } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!profile) return <Redirect href="/sign-in" />;
  if (profileNeedsName(profile)) return <Redirect href="/complete-profile" />;
  if (isAdminRole(profile.role)) return <Redirect href="/(admin)" />;
  return <UserTabs />;
}
