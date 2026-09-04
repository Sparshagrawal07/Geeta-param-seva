import { Redirect, Stack } from 'expo-router';

import { LoadingScreen } from '@/components/ui/loading-screen';
import { useAuth } from '@/hooks/use-auth';
import { getPostAuthRoute } from '@/lib/routes';

export default function AuthLayout() {
  const { loading, profile } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (profile) {
    return <Redirect href={getPostAuthRoute(profile)} />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}