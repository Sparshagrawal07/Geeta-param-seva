import { useEffect, useState } from 'react';

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
  const [translation, setTranslation] = useState(() => ({
    locale,
    source: text,
    value: resolveInitial(locale, text),
  }));

  useEffect(() => {
    if (locale === 'en' || !text.trim()) return;

    let cancelled = false;
    void translateDynamicText(text).then((result) => {
      if (!cancelled) {
        setTranslation({ locale, source: text, value: result });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [locale, text]);

  if (locale === 'en') return text;
  if (translation.locale === locale && translation.source === text) return translation.value;
  return getCachedDynamicTranslation(text) ?? text;
}

export function useTranslatedTexts(texts: string[]): string[] {
  const { locale } = useLocale();
  const signature = JSON.stringify(texts);
  const [translation, setTranslation] = useState(() => ({
    locale,
    signature,
    values:
      locale === 'en'
        ? texts
        : texts.map((text) => getCachedDynamicTranslation(text) ?? text),
  }));

  useEffect(() => {
    if (locale === 'en') return;

    const requestedTexts = JSON.parse(signature) as string[];
    if (requestedTexts.length === 0) return;
    let cancelled = false;
    void translateDynamicTexts(requestedTexts).then((result) => {
      if (!cancelled) {
        setTranslation({ locale, signature, values: result });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [locale, signature]);

  if (locale === 'en') return texts;
  if (translation.locale === locale && translation.signature === signature) {
    return translation.values;
  }
  return texts.map((text) => getCachedDynamicTranslation(text) ?? text);
}
