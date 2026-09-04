import { getLocales } from 'expo-localization';

import type { Locale } from '@/lib/i18n/messages';

export function getSystemLocale(): Locale {
  const languageCode = getLocales()[0]?.languageCode?.toLowerCase() ?? 'en';
  return languageCode === 'hi' ? 'hi' : 'en';
}
