import { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';

import { LoadingScreen } from '@/components/ui/loading-screen';
import { useAuth } from '@/hooks/use-auth';
import { getPostAuthRoute } from '@/lib/routes';
import { hasAcceptedTerms } from '@/lib/terms-agreement';

export default function HomeScreen() {
  const { loading, profile } = useAuth();
  const [termsReady, setTermsReady] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void hasAcceptedTerms().then((accepted) => {
      if (cancelled) return;
      setTermsAccepted(accepted);
      setTermsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading || !termsReady) {
    return <LoadingScreen />;
  }

  if (!profile) {
    return <Redirect href={termsAccepted ? '/sign-in' : '/terms-agreement'} />;
  }

  return <Redirect href={getPostAuthRoute(profile)} />;
}
