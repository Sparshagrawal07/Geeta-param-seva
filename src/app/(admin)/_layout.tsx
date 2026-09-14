import { Redirect, Tabs } from 'expo-router';

import { DevotionalTabIcon } from '@/components/navigation/devotional-tab-icon';
import { useSpiritualTabBarScreenOptions } from '@/components/navigation/spiritual-tab-bar';
import { LoadingScreen } from '@/components/ui/loading-screen';
import { useAndroidBackExit } from '@/hooks/use-android-back-exit';
import { useAuth } from '@/hooks/use-auth';
import { needsPersonalPinSetup } from '@/lib/routes';
import { isAdminRole, profileNeedsName } from '@/lib/users';
import { useLocale } from '@/providers/locale-provider';

function AdminTabs() {
  const { t } = useLocale();
  useAndroidBackExit();
  const tabBarOptions = useSpiritualTabBarScreenOptions();

  return (
    <Tabs screenOptions={tabBarOptions}>
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
      <Tabs.Screen name="feed" options={{ href: null, title: t('tabFeed') }} />
      <Tabs.Screen name="groups" options={{ href: null, title: t('tabGroups') }} />
      <Tabs.Screen name="groups/[id]" options={{ href: null }} />
    </Tabs>
  );
}

export default function AdminLayout() {
  const { loading, profile } = useAuth();

  if (loading) return <LoadingScreen />;
  if (!profile) return <Redirect href="/sign-in" />;
  if (profileNeedsName(profile)) return <Redirect href="/complete-profile" />;
  if (needsPersonalPinSetup(profile)) return <Redirect href="/set-personal-pin" />;
  if (!isAdminRole(profile.role)) return <Redirect href="/(user)" />;
  return <AdminTabs />;
}
