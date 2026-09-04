import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';

const DEFAULT_SUCCESS_MS = 3500;
const DEFAULT_NOTICE_MS = 4500;

/**
 * Status messages that auto-dismiss (success/notice) and clear when the screen loses focus.
 * Use `setProgress` for in-flight states like "Publishing…" that should stay until replaced.
 */
export function useTransientMessage(
  successDismissMs = DEFAULT_SUCCESS_MS,
  noticeDismissMs = DEFAULT_NOTICE_MS
) {
  const [message, setMessageState] = useState('');
  const [tone, setTone] = useState<'success' | 'neutral'>('neutral');
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clearMessage = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    setMessageState('');
    setTone('neutral');
  }, []);

  const setProgress = useCallback((msg: string) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    setTone('neutral');
    setMessageState(msg);
  }, []);

  const showSuccess = useCallback(
    (msg: string) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      setTone('success');
      setMessageState(msg);
      timerRef.current = setTimeout(clearMessage, successDismissMs);
    },
    [clearMessage, successDismissMs]
  );

  const showNotice = useCallback(
    (msg: string) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      setTone('neutral');
      setMessageState(msg);
      timerRef.current = setTimeout(clearMessage, noticeDismissMs);
    },
    [clearMessage, noticeDismissMs]
  );

  useFocusEffect(
    useCallback(() => {
      return () => clearMessage();
    }, [clearMessage])
  );

  return { message, tone, setProgress, showSuccess, showNotice, clearMessage };
}
