const TYPE_KEY = '__geeta_cache_type__';
const DATE_TYPE = 'Date';

export function serializeCacheValue(value: unknown): string {
  const serialized = JSON.stringify(value, function cacheReplacer(key, currentValue) {
    const originalValue = key === '' ? value : this[key];
    if (originalValue instanceof Date) {
      return { [TYPE_KEY]: DATE_TYPE, value: originalValue.toISOString() };
    }
    return currentValue;
  });

  if (serialized === undefined) {
    throw new TypeError('Cache values must be JSON-serializable.');
  }
  return serialized;
}

export function deserializeCacheValue<T>(payload: string): T {
  return JSON.parse(payload, (_key, value: unknown) => {
    if (
      value !== null &&
      typeof value === 'object' &&
      (value as Record<string, unknown>)[TYPE_KEY] === DATE_TYPE &&
      typeof (value as Record<string, unknown>).value === 'string'
    ) {
      return new Date((value as Record<string, string>).value);
    }
    return value;
  }) as T;
}

