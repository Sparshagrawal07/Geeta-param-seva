import AsyncStorage from '@react-native-async-storage/async-storage';

import { type MessageKey, messages } from '@/lib/i18n/messages';

const DYNAMIC_CACHE_KEY = 'app.i18n.hi-dynamic-cache';
const CACHE_VERSION = '12';
export const DYNAMIC_TRANSLATION_CACHE_MAX_ENTRIES = 400;
const DYNAMIC_TRANSLATION_CACHE_MAX_CHARACTERS = 250_000;
const TRANSLATION_BATCH_SIZE = 24;
const TRANSLATION_BATCH_MAX_SOURCE_CHARACTERS = 4_000;

/** English terms replaced with Hindi before machine translation */
const DOMAIN_TERMS = [
  { pattern: /\bChapters?\b/g, hi: 'अध्याय' },
  { pattern: /\bAdhyays?\b/g, hi: 'अध्याय' },
  { pattern: /\bVerses?\b/g, hi: 'श्लोक' },
  { pattern: /\bShlokas?\b/gi, hi: 'श्लोक' },
  { pattern: /\bFeed\b/g, hi: 'अपडेट' },
  { pattern: /\bfeed\b/g, hi: 'अपडेट' },
] as const;

const LEAKED_TOKEN_RESOLVERS: { pattern: RegExp; hi: string }[] = [
  { pattern: /\[\[\s*ADHYAY\s*\]\]/gi, hi: 'अध्याय' },
  { pattern: /\[\[\s*FEED\s*\]\]/gi, hi: 'अपडेट' },
];

type DynamicTranslationCache = {
  version: string;
  entries: Record<string, string>;
  order: string[];
};

/** In-memory mirror so locale flips stay sync after the first warm load. */
let memoryCache: DynamicTranslationCache | null = null;
let memoryCacheLoad: Promise<DynamicTranslationCache> | null = null;
let persistQueue: Promise<void> = Promise.resolve();

type PendingTranslation = {
  promise: Promise<string>;
  resolve: (value: string) => void;
};

const pendingTranslations = new Map<string, PendingTranslation>();
const queuedTexts = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

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

function emptyDynamicCache(): DynamicTranslationCache {
  return { version: CACHE_VERSION, entries: Object.create(null), order: [] };
}

function pruneDynamicCache(cache: DynamicTranslationCache): void {
  cache.order = cache.order.filter(
    (key, index, order) =>
      Object.prototype.hasOwnProperty.call(cache.entries, key) && order.indexOf(key) === index
  );

  for (const key of Object.keys(cache.entries)) {
    if (!cache.order.includes(key)) cache.order.push(key);
  }

  while (cache.order.length > DYNAMIC_TRANSLATION_CACHE_MAX_ENTRIES) {
    const oldest = cache.order.shift();
    if (oldest != null) delete cache.entries[oldest];
  }

  while (
    cache.order.length > 0 &&
    JSON.stringify(cache).length > DYNAMIC_TRANSLATION_CACHE_MAX_CHARACTERS
  ) {
    const oldest = cache.order.shift();
    if (oldest != null) delete cache.entries[oldest];
  }
}

function parseDynamicCache(raw: string): DynamicTranslationCache {
  const parsed = JSON.parse(raw) as Partial<DynamicTranslationCache>;
  if (
    parsed.version !== CACHE_VERSION ||
    !parsed.entries ||
    typeof parsed.entries !== 'object' ||
    Array.isArray(parsed.entries)
  ) {
    return emptyDynamicCache();
  }

  const entries: Record<string, string> = Object.create(null);
  for (const [key, value] of Object.entries(parsed.entries)) {
    if (typeof value === 'string') entries[key] = value;
  }

  const cache = {
    version: CACHE_VERSION,
    entries,
    order: Array.isArray(parsed.order)
      ? parsed.order.filter((key): key is string => typeof key === 'string')
      : Object.keys(entries),
  };
  pruneDynamicCache(cache);
  return cache;
}

async function loadDynamicCache(): Promise<DynamicTranslationCache> {
  if (memoryCache) return memoryCache;
  if (memoryCacheLoad) return memoryCacheLoad;

  memoryCacheLoad = (async () => {
    try {
      const raw = await AsyncStorage.getItem(DYNAMIC_CACHE_KEY);
      if (!raw) {
        memoryCache = emptyDynamicCache();
        return memoryCache;
      }
      memoryCache = parseDynamicCache(raw);
      return memoryCache;
    } catch {
      memoryCache = emptyDynamicCache();
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
  pruneDynamicCache(cache);
  memoryCache = cache;
  const serialized = JSON.stringify(cache);
  persistQueue = persistQueue
    .catch(() => undefined)
    .then(() => AsyncStorage.setItem(DYNAMIC_CACHE_KEY, serialized));

  try {
    await persistQueue;
  } catch {
    // Translation remains usable in memory when durable storage is unavailable.
  }
}

function setCachedTranslation(
  cache: DynamicTranslationCache,
  source: string,
  translated: string
): void {
  cache.entries[source] = translated;
  cache.order = cache.order.filter((key) => key !== source);
  cache.order.push(source);
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

  const data = (await response.json()) as [[string][], ...unknown[]];
  const translated = data[0]?.map((part) => part[0]).join('') ?? payload;
  const parts = translated.split(separator);

  if (parts.length !== texts.length) {
    throw new Error('Translation response did not preserve batch boundaries');
  }

  return parts;
}

async function translateEnglishTexts(texts: string[]): Promise<string[]> {
  if (texts.length === 0) return [];

  const prepared = texts.map(applyDomainTerms);
  const translated = await translateBatchRaw(prepared);
  return translated.map(finalizeHiText);
}

function enqueueTranslation(text: string): Promise<string> {
  const existing = pendingTranslations.get(text);
  if (existing) return existing.promise;

  let resolve!: (value: string) => void;
  const promise = new Promise<string>((done) => {
    resolve = done;
  });
  pendingTranslations.set(text, { promise, resolve });
  queuedTexts.add(text);

  if (flushTimer == null) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flushQueuedTranslations();
    }, 0);
  }

  return promise;
}

function createTranslationBatches(texts: string[]): string[][] {
  const batches: string[][] = [];
  let batch: string[] = [];
  let sourceCharacters = 0;

  for (const text of texts) {
    if (
      batch.length > 0 &&
      (batch.length >= TRANSLATION_BATCH_SIZE ||
        sourceCharacters + text.length > TRANSLATION_BATCH_MAX_SOURCE_CHARACTERS)
    ) {
      batches.push(batch);
      batch = [];
      sourceCharacters = 0;
    }
    batch.push(text);
    sourceCharacters += text.length;
  }

  if (batch.length > 0) batches.push(batch);
  return batches;
}

async function flushQueuedTranslations(): Promise<void> {
  const texts = [...queuedTexts];
  queuedTexts.clear();
  if (texts.length === 0) return;

  const cache = await loadDynamicCache();
  const resolved = new Map<string, string>();
  const missing = texts.filter((text) => {
    const cached = cache.entries[text];
    if (!cached) return true;
    resolved.set(text, finalizeHiText(cached));
    return false;
  });
  let cacheChanged = false;

  for (const batch of createTranslationBatches(missing)) {
    try {
      const translated = await translateEnglishTexts(batch);
      for (let batchIndex = 0; batchIndex < batch.length; batchIndex++) {
        const source = batch[batchIndex];
        const value = translated[batchIndex];
        resolved.set(source, value);
        setCachedTranslation(cache, source, value);
        cacheChanged = true;
      }
    } catch {
      for (const source of batch) resolved.set(source, source);
    }
  }

  if (cacheChanged) await saveDynamicCache(cache);

  for (const text of texts) {
    const pending = pendingTranslations.get(text);
    pendingTranslations.delete(text);
    pending?.resolve(resolved.get(text) ?? text);
  }
}

export async function translateDynamicText(text: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return text;

  const cache = await loadDynamicCache();
  const cached = cache.entries[text];
  if (cached) return finalizeHiText(cached);

  return enqueueTranslation(text);
}

export async function translateDynamicTexts(texts: string[]): Promise<string[]> {
  if (texts.length === 0) return [];
  return Promise.all(texts.map((text) => translateDynamicText(text)));
}

export function getEnglishMessage(key: MessageKey): string {
  return messages[key];
}
