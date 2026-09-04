import { useEffect, useMemo, useState } from 'react';

import { translateDynamicText, translateDynamicTexts } from '@/lib/i18n/translate';
import { useLocale } from '@/providers/locale-provider';

export function useTranslatedText(text: string): string {
  const { locale } = useLocale();
  const [translated, setTranslated] = useState(text);

  useEffect(() => {
    if (locale === 'en' || !text.trim()) {
      setTranslated(text);
      return;
    }

    let cancelled = false;
    void translateDynamicText(text).then((result) => {
      if (!cancelled) {
        setTranslated(result);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [locale, text]);

  return locale === 'en' ? text : translated;
}

export function useTranslatedTexts(texts: string[]): string[] {
  const { locale } = useLocale();
  const [translated, setTranslated] = useState(texts);
  const signature = useMemo(() => texts.join('\u001e'), [texts]);

  useEffect(() => {
    if (locale === 'en') {
      setTranslated(texts);
      return;
    }

    if (texts.length === 0) {
      setTranslated(texts);
      return;
    }

    let cancelled = false;
    void translateDynamicTexts(texts).then((result) => {
      if (!cancelled) {
        setTranslated(result);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [locale, signature]);

  return locale === 'en' ? texts : translated;
}
