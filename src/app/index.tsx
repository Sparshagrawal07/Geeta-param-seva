import { Redirect } from 'expo-router';

import { LoadingScreen } from '@/components/ui/loading-screen';
import { useAuth } from '@/hooks/use-auth';
import { getPostAuthRoute } from '@/lib/routes';

export default function HomeScreen() {
  const { loading, profile } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!profile) {
    return <Redirect href="/sign-in" />;
  }

  return <Redirect href={getPostAuthRoute(profile)} />;
}
