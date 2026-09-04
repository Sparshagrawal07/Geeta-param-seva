import { describe, expect, it } from 'vitest';

/**
 * Mirrors functions/src/practice-report.ts listDateKeysThrough for a quick
 * client-side sanity check without pulling Cloud Functions into Vitest.
 */
function listDateKeysThrough(toDateKey: string): string[] {
  const [y, m, d] = toDateKey.split('-').map(Number);
  let year = y!;
  let month = m!;
  let day = 1;
  const keys: string[] = [];
  const format = (yy: number, mm: number, dd: number) =>
    `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  while (format(year, month, day) <= toDateKey) {
    keys.push(format(year, month, day));
    const utc = new Date(Date.UTC(year, month - 1, day));
    utc.setUTCDate(utc.getUTCDate() + 1);
    year = utc.getUTCFullYear();
    month = utc.getUTCMonth() + 1;
    day = utc.getUTCDate();
  }
  return keys;
}

describe('practice monthly report date range', () => {
  it('lists 1st through current day inclusive', () => {
    expect(listDateKeysThrough('2026-09-04')).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
      '2026-09-04',
    ]);
  });

  it('handles single-day month start', () => {
    expect(listDateKeysThrough('2026-09-01')).toEqual(['2026-09-01']);
  });
});
