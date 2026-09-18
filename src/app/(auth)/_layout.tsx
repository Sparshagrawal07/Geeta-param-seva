import { useEffect, useState } from 'react';
import { Redirect, Stack, usePathname } from 'expo-router';

import { LoadingScreen } from '@/components/ui/loading-screen';
import { useAuth } from '@/hooks/use-auth';
import { getPostAuthRoute } from '@/lib/routes';
import { hasAcceptedTerms } from '@/lib/terms-agreement';

export default function AuthLayout() {
  const { loading, profile } = useAuth();
  const pathname = usePathname();
  const [termsReady, setTermsReady] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void hasAcceptedTerms().then((accepted) => {
      if (cancelled) return;
      setTermsAccepted((prev) => prev || accepted);
      setTermsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (loading || !termsReady) {
    return <LoadingScreen />;
  }

  if (profile) {
    return <Redirect href={getPostAuthRoute(profile)} />;
  }

  const onTermsScreen =
    pathname === '/terms-agreement' || pathname.endsWith('/terms-agreement');

  if (!termsAccepted && !onTermsScreen) {
    return <Redirect href="/terms-agreement" />;
  }

  return <Stack screenOptions={{ headerShown: false }} />;
}
