import { beforeEach, describe, expect, it, vi } from 'vitest';

const CACHE_KEY = 'app.i18n.hi-dynamic-cache';
const BATCH_SEPARATOR = '\n␞\n';

async function loadTranslationModule() {
  vi.resetModules();
  return Promise.all([
    import('@/lib/i18n/translate'),
    import('@react-native-async-storage/async-storage').then((module) => module.default),
  ]);
}

function installTranslationFetch() {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const payload = new URL(String(input)).searchParams.get('q') ?? '';
    const translated = payload
      .split(BATCH_SEPARATOR)
      .map((text) => `hi:${text}`)
      .join(BATCH_SEPARATOR);

    return {
      ok: true,
      json: async () => [[[translated]]],
    } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('dynamic translation batching', () => {
  it('coalesces visible single and list requests into one micro-batch', async () => {
    const fetchMock = installTranslationFetch();
    const [{ translateDynamicText, translateDynamicTexts }] = await loadTranslationModule();

    const [first, second, list] = await Promise.all([
      translateDynamicText('First item'),
      translateDynamicText('Second item'),
      translateDynamicTexts(['First item', 'Third item']),
    ]);

    expect(first).toBe('hi:First item');
    expect(second).toBe('hi:Second item');
    expect(list).toEqual(['hi:First item', 'hi:Third item']);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const request = new URL(String(fetchMock.mock.calls[0][0]));
    expect(request.searchParams.get('q')?.split(BATCH_SEPARATOR)).toEqual([
      'First item',
      'Second item',
      'Third item',
    ]);
  });

  it('deduplicates in-flight and durably cached source text', async () => {
    const fetchMock = installTranslationFetch();
    const [{ translateDynamicText }, AsyncStorage] = await loadTranslationModule();

    const results = await Promise.all([
      translateDynamicText('Shared text'),
      translateDynamicText('Shared text'),
      translateDynamicText('Shared text'),
    ]);
    expect(results).toEqual(['hi:Shared text', 'hi:Shared text', 'hi:Shared text']);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await expect(translateDynamicText('Shared text')).resolves.toBe('hi:Shared text');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const persisted = JSON.parse((await AsyncStorage.getItem(CACHE_KEY)) ?? '{}') as {
      entries?: Record<string, string>;
    };
    expect(persisted.entries?.['Shared text']).toBe('hi:Shared text');
  });

  it('prunes the oldest translations to the durable cache bound', async () => {
    const fetchMock = installTranslationFetch();
    const [
      { DYNAMIC_TRANSLATION_CACHE_MAX_ENTRIES, translateDynamicTexts },
      AsyncStorage,
    ] = await loadTranslationModule();
    const texts = Array.from(
      { length: DYNAMIC_TRANSLATION_CACHE_MAX_ENTRIES + 5 },
      (_, index) => `Item ${index}`
    );

    await expect(translateDynamicTexts(texts)).resolves.toHaveLength(texts.length);

    const persisted = JSON.parse((await AsyncStorage.getItem(CACHE_KEY)) ?? '{}') as {
      entries: Record<string, string>;
      order: string[];
    };
    expect(Object.keys(persisted.entries)).toHaveLength(
      DYNAMIC_TRANSLATION_CACHE_MAX_ENTRIES
    );
    expect(persisted.order).toHaveLength(DYNAMIC_TRANSLATION_CACHE_MAX_ENTRIES);
    expect(persisted.entries['Item 0']).toBeUndefined();
    expect(persisted.entries[`Item ${texts.length - 1}`]).toBe(
      `hi:Item ${texts.length - 1}`
    );
    expect(fetchMock).toHaveBeenCalledTimes(Math.ceil(texts.length / 24));
  });
});
