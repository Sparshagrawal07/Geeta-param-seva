import { useEffect, useMemo, useState } from 'react';

import {
  getCachedDynamicTranslation,
  translateDynamicText,
  translateDynamicTexts,
} from '@/lib/i18n/translate';
import { useLocale } from '@/providers/locale-provider';

function resolveInitial(locale: string, text: string) {
  if (locale === 'en' || !text.trim()) return text;
  return getCachedDynamicTranslation(text) ?? text;
}

export function useTranslatedText(text: string): string {
  const { locale } = useLocale();
  const [translated, setTranslated] = useState(() => resolveInitial(locale, text));

  useEffect(() => {
    if (locale === 'en' || !text.trim()) {
      setTranslated(text);
      return;
    }

    const cached = getCachedDynamicTranslation(text);
    if (cached) {
      setTranslated(cached);
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
  const signature = useMemo(() => texts.join('\u001e'), [texts]);
  const [translated, setTranslated] = useState(() => {
    if (locale === 'en') return texts;
    return texts.map((text) => getCachedDynamicTranslation(text) ?? text);
  });

  useEffect(() => {
    if (locale === 'en') {
      setTranslated(texts);
      return;
    }

    if (texts.length === 0) {
      setTranslated(texts);
      return;
    }

    const fromMemory = texts.map((text) => getCachedDynamicTranslation(text));
    if (fromMemory.every((value) => value != null)) {
      setTranslated(fromMemory as string[]);
      return;
    }

    // Show whatever we already know immediately, then fill gaps.
    setTranslated(texts.map((text, index) => fromMemory[index] ?? text));

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
