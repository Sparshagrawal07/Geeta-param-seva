import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { type Locale, type MessageKey, messages } from '@/lib/i18n/messages';
import { hiMessages } from '@/lib/i18n/messages-hi';
import { getSystemLocale } from '@/lib/i18n/system-locale';

const LOCALE_STORAGE_KEY = 'app.locale';

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey) => string;
  isTranslating: boolean;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getSystemLocale);

  useEffect(() => {
    void AsyncStorage.getItem(LOCALE_STORAGE_KEY).then((stored) => {
      if (stored === 'en' || stored === 'hi') {
        setLocaleState(stored);
        return;
      }
      setLocaleState(getSystemLocale());
    });
  }, []);

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
    void AsyncStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
  }, []);

  const t = useCallback(
    (key: MessageKey) => {
      if (locale === 'hi') {
        return hiMessages[key] ?? messages[key];
      }
      return messages[key];
    },
    [locale]
  );

  const value = useMemo(
    () => ({ locale, setLocale, t, isTranslating: false }),
    [locale, setLocale, t]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);

  if (!context) {
    const fallback = getSystemLocale();
    return {
      locale: fallback,
      setLocale: () => undefined,
      t: (key: MessageKey) => (fallback === 'hi' ? hiMessages[key] ?? messages[key] : messages[key]),
      isTranslating: false,
    };
  }

  return context;
}
