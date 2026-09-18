import { Redirect, Stack } from 'expo-router';

import { LoadingScreen } from '@/components/ui/loading-screen';
import { useAndroidBackExit } from '@/hooks/use-android-back-exit';
import { useAuth } from '@/hooks/use-auth';
import { needsPersonalPinSetup } from '@/lib/routes';
import { isAdminRole, profileNeedsName } from '@/lib/users';

export default function AdminLayout() {
  const { loading, profile } = useAuth();
  useAndroidBackExit();

  if (loading) return <LoadingScreen />;
  if (!profile) return <Redirect href="/sign-in" />;
  if (profileNeedsName(profile)) return <Redirect href="/complete-profile" />;
  if (needsPersonalPinSetup(profile)) return <Redirect href="/set-personal-pin" />;
  if (!isAdminRole(profile.role)) return <Redirect href="/(user)/(tabs)" />;

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'default' }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="feed" />
      <Stack.Screen name="reports" />
      <Stack.Screen name="groups" />
      <Stack.Screen name="groups/[id]" />
    </Stack>
  );
}
