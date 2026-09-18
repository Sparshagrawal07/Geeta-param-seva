import { Redirect, Stack } from 'expo-router';

import { LoadingScreen } from '@/components/ui/loading-screen';
import { useAndroidBackExit } from '@/hooks/use-android-back-exit';
import { useAuth } from '@/hooks/use-auth';
import { isAdminRole, profileNeedsName } from '@/lib/users';

export default function UserLayout() {
  const { loading, profile } = useAuth();
  useAndroidBackExit();

  if (loading) return <LoadingScreen />;
  if (!profile) return <Redirect href="/sign-in" />;
  if (profileNeedsName(profile)) return <Redirect href="/complete-profile" />;
  if (isAdminRole(profile.role)) return <Redirect href="/(admin)/(tabs)" />;

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'default' }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="practice/aarti" />
      <Stack.Screen name="gita/index" />
      <Stack.Screen name="gita/chapter/[chapterNumber]" />
      <Stack.Screen name="gita/verse/[chapterNumber]/[verseNumber]" />
    </Stack>
  );
}
