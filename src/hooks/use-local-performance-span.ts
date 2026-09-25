import { useEffect, useRef } from 'react';

import { startLocalPerformanceSpan } from '@/lib/local-performance';

/**
 * Ends on the first animation frame after `ready` so the sample includes the
 * React commit. It is a no-op unless EXPO_PUBLIC_LOCAL_PROFILE=1 at build time.
 */
export function useLocalPerformanceSpan(
  name: string,
  ready: boolean,
  budgetMs?: number
): void {
  const finishRef = useRef<ReturnType<typeof startLocalPerformanceSpan> | null>(null);

  useEffect(() => {
    finishRef.current = startLocalPerformanceSpan(name, budgetMs);
    return () => {
      finishRef.current = null;
    };
  }, [budgetMs, name]);

  useEffect(() => {
    if (!ready || !finishRef.current) return;
    const frame = requestAnimationFrame(() => {
      finishRef.current?.();
      finishRef.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [ready]);
}
