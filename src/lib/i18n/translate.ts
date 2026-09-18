import AsyncStorage from '@react-native-async-storage/async-storage';

import { type MessageKey, messages } from '@/lib/i18n/messages';

const DYNAMIC_CACHE_KEY = 'app.i18n.hi-dynamic-cache';
const CACHE_VERSION = '11';

/** English terms replaced with Hindi before machine translation */
const DOMAIN_TERMS = [
  { pattern: /\bChapters?\b/g, hi: 'अध्याय' },
  { pattern: /\bAdhyays?\b/g, hi: 'अध्याय' },
  { pattern: /\bVerses?\b/g, hi: 'श्लोक' },
  { pattern: /\bShlokas?\b/gi, hi: 'श्लोक' },
  { pattern: /\bFeed\b/g, hi: 'अपडेट' },
  { pattern: /\bfeed\b/g, hi: 'अपडेट' },
] as const;

const LEAKED_TOKEN_RESOLVERS: Array<{ pattern: RegExp; hi: string }> = [
  { pattern: /\[\[\s*ADHYAY\s*\]\]/gi, hi: 'अध्याय' },
  { pattern: /\[\[\s*FEED\s*\]\]/gi, hi: 'अपडेट' },
];

type DynamicTranslationCache = {
  version: string;
  entries: Record<string, string>;
};

/** In-memory mirror so locale flips stay sync after the first warm load. */
let memoryCache: DynamicTranslationCache | null = null;
let memoryCacheLoad: Promise<DynamicTranslationCache> | null = null;

export function applyDomainTerms(text: string): string {
  return DOMAIN_TERMS.reduce(
    (current, { pattern, hi }) => current.replace(pattern, hi),
    text
  );
}

/** Cleans leaked glossary markers from older cached translations */
export function sanitizeHiText(text: string): string {
  let result = text;

  for (const { pattern, hi } of LEAKED_TOKEN_RESOLVERS) {
    result = result.replace(pattern, hi);
  }

  result = result.replace(/\[\[[^\]]*\]\]/g, '');
  result = result.replace(/\s{2,}/g, ' ');

  return result.trim();
}

function finalizeHiText(text: string): string {
  return sanitizeHiText(text);
}

/** Sync lookup for already-warmed translations (seamless EN ↔ HI toggles). */
export function getCachedDynamicTranslation(text: string): string | null {
  if (!memoryCache) return null;
  const cached = memoryCache.entries[text];
  return cached ? finalizeHiText(cached) : null;
}

async function loadDynamicCache(): Promise<DynamicTranslationCache> {
  if (memoryCache) return memoryCache;
  if (memoryCacheLoad) return memoryCacheLoad;

  memoryCacheLoad = (async () => {
    try {
      const raw = await AsyncStorage.getItem(DYNAMIC_CACHE_KEY);
      if (!raw) {
        memoryCache = { version: CACHE_VERSION, entries: {} };
        return memoryCache;
      }
      const parsed = JSON.parse(raw) as DynamicTranslationCache;
      memoryCache =
        parsed.version !== CACHE_VERSION
          ? { version: CACHE_VERSION, entries: {} }
          : parsed;
      return memoryCache;
    } catch {
      memoryCache = { version: CACHE_VERSION, entries: {} };
      return memoryCache;
    } finally {
      memoryCacheLoad = null;
    }
  })();

  return memoryCacheLoad;
}

/** Prefetch AsyncStorage cache into memory so the first Hindi switch is not blocked. */
export function warmTranslationCache(): void {
  void loadDynamicCache();
}

async function saveDynamicCache(cache: DynamicTranslationCache) {
  memoryCache = cache;
  await AsyncStorage.setItem(DYNAMIC_CACHE_KEY, JSON.stringify(cache));
}

async function translateBatchRaw(texts: string[]): Promise<string[]> {
  if (texts.length === 0) return [];

  const separator = '\n␞\n';
  const payload = texts.join(separator);
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=hi&dt=t&q=${encodeURIComponent(payload)}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Translation request failed');
  }

  const data = (await response.json()) as [Array<[string]>, ...unknown[]];
  const translated = data[0]?.map((part) => part[0]).join('') ?? payload;
  const parts = translated.split(separator);

  if (parts.length !== texts.length) {
    return texts;
  }

  return parts;
}

async function translateEnglishTexts(texts: string[]): Promise<string[]> {
  if (texts.length === 0) return [];

  const prepared = texts.map(applyDomainTerms);
  const translated = await translateBatchRaw(prepared);
  return translated.map(finalizeHiText);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function translateDynamicText(text: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return text;

  const cache = await loadDynamicCache();
  const cached = cache.entries[text];
  if (cached) return finalizeHiText(cached);

  try {
    const [translated] = await translateEnglishTexts([text]);
    cache.entries[text] = translated;
    await saveDynamicCache(cache);
    return translated;
  } catch {
    return text;
  }
}

export async function translateDynamicTexts(texts: string[]): Promise<string[]> {
  if (texts.length === 0) return [];

  const cache = await loadDynamicCache();
  const results = [...texts];
  const missingIndexes: number[] = [];
  const missingTexts: string[] = [];

  for (let index = 0; index < texts.length; index++) {
    const text = texts[index];
    const trimmed = text.trim();
    if (!trimmed) continue;

    const cached = cache.entries[text];
    if (cached) {
      results[index] = finalizeHiText(cached);
      continue;
    }

    missingIndexes.push(index);
    missingTexts.push(text);
  }

  if (missingTexts.length === 0) return results;

  const BATCH_SIZE = 12;
  for (let i = 0; i < missingTexts.length; i += BATCH_SIZE) {
    const batchTexts = missingTexts.slice(i, i + BATCH_SIZE);
    const batchIndexes = missingIndexes.slice(i, i + BATCH_SIZE);

    try {
      const translated = await translateEnglishTexts(batchTexts);
      for (let j = 0; j < batchIndexes.length; j++) {
        const source = batchTexts[j];
        const value = translated[j];
        results[batchIndexes[j]] = value;
        cache.entries[source] = value;
      }
      await saveDynamicCache(cache);
    } catch {
      for (let j = 0; j < batchIndexes.length; j++) {
        results[batchIndexes[j]] = batchTexts[j];
      }
    }

    if (i + BATCH_SIZE < missingTexts.length) {
      await delay(300);
    }
  }

  return results;
}

export function getEnglishMessage(key: MessageKey): string {
  return messages[key];
}
