import { describe, expect, it } from 'vitest';

import {
  buildRunKey,
  computeNextRunAt,
  normalizeWeekdays,
  zonedDateKey,
  zonedTimeToUtc,
} from '../../functions/src/schedule-math';
import { buildThemeColors, resolveScheme } from '@/lib/theme';
import { brandPalette } from '@/lib/brand-palette';
import { hiMessages } from '@/lib/i18n/messages-hi';
import { messages, type MessageKey } from '@/lib/i18n/messages';
import {
  canAddRosterRole,
  canAssignRosterGroups,
  canManageRoster,
} from '@/lib/roster-policy';

describe('schedule-math', () => {
  it('normalizes weekday presets', () => {
    expect(normalizeWeekdays([], 'weekdays')).toEqual([1, 2, 3, 4, 5]);
    expect(normalizeWeekdays([], 'weekends')).toEqual([0, 6]);
    expect(normalizeWeekdays([1, 3, 1], 'custom')).toEqual([1, 3]);
  });

  it('computes next daily run in Asia/Kolkata', () => {
    // 2026-08-27 10:00 IST = 2026-08-27 04:30 UTC
    const from = new Date('2026-08-27T04:30:00.000Z');
    const next = computeNextRunAt({
      from,
      timezone: 'Asia/Kolkata',
      timeOfDay: { hour: 6, minute: 30 },
      recurrence: 'daily',
    });
    expect(next?.toISOString()).toBe('2026-08-28T01:00:00.000Z'); // 06:30 IST next day
  });

  it('skips to next weekday for weekdays recurrence', () => {
    // Friday 2026-08-28 08:00 IST
    const from = new Date('2026-08-28T02:30:00.000Z');
    const next = computeNextRunAt({
      from,
      timezone: 'Asia/Kolkata',
      timeOfDay: { hour: 7, minute: 0 },
      recurrence: 'weekdays',
      afterExclusive: from,
    });
    // Next matching after Friday morning → Monday 07:00 IST
    expect(next?.toISOString()).toBe('2026-08-31T01:30:00.000Z');
  });

  it('builds idempotent run keys and date keys', () => {
    const at = new Date('2026-08-27T01:00:00.000Z');
    expect(buildRunKey('abc', at)).toBe('abc_2026-08-27T01:00:00.000Z');
    expect(zonedDateKey(at, 'Asia/Kolkata')).toBe('2026-08-27');
  });

  it('converts IST wall time to UTC', () => {
    const utc = zonedTimeToUtc(
      { year: 2026, month: 8, day: 27, hour: 6, minute: 30 },
      'Asia/Kolkata'
    );
    expect(utc.toISOString()).toBe('2026-08-27T01:00:00.000Z');
  });
});

describe('theme tokens', () => {
  it('resolves system/light/dark modes', () => {
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme('dark', 'light')).toBe('dark');
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', 'light')).toBe('light');
    expect(resolveScheme('system', 'unspecified')).toBe('light');
    expect(resolveScheme('system', null)).toBe('light');
  });

  it('applies accent colors with readable on-accent', () => {
    const light = buildThemeColors('light', 'saffron');
    const dark = buildThemeColors('dark', 'saffron');
    expect(light.saffron).toBe(brandPalette.primary);
    expect(dark.saffron).toBe(brandPalette.primaryDark);
    expect(light.onAccent).toBe('#FFFFFF');
    expect(light.accentRgb).toBe('166 124 0');
    expect(dark.accentRgb).toBe('224 195 90');
  });
});

describe('practice helpers', () => {
  it('builds stable practice day keys around noon IST', async () => {
    const { practiceDateKey, practiceLogDocId } = await import('@/lib/practice');
    const beforeNoon = new Date('2026-08-29T11:59:00+05:30');
    const afterNoon = new Date('2026-08-29T12:00:00+05:30');
    expect(practiceDateKey(beforeNoon)).toBe('2026-08-28');
    expect(practiceDateKey(afterNoon)).toBe('2026-08-29');
    expect(practiceLogDocId('u1', '2026-08-29', 'adhyay_01')).toBe('u1_2026-08-29_adhyay_01');
  });
});

describe('spiritual asset registry', () => {
  it('defines stable slot geometry for replaceable artwork', async () => {
    const { readFileSync, existsSync, readdirSync } = await import('node:fs');
    const path = await import('node:path');

    const ROOT = path.resolve(__dirname, '../..');
    const source = readFileSync(path.join(ROOT, 'src/lib/spiritual-assets.ts'), 'utf8');
    expect(source).toContain("heroTemple:");
    expect(source).toContain("authTemple:");
    expect(source).toContain("navLotusBg:");
    expect(source).toContain("mandalaPrimary:");
    expect(source).toContain("mandalaWash:");
    expect(source).toContain("krishnaArtLight:");
    expect(source).toContain("krishnaArtDark:");
    expect(source).toContain("templeHeroLight:");
    expect(source).toContain("templeHeroDark:");
    expect(source).toContain("templeReflectionLight:");
    expect(source).toContain("templeReflectionDark:");

    const spiritualDir = path.join(ROOT, 'assets/images/spiritual');
    expect(
      readdirSync(spiritualDir)
        .filter((name) => name.endsWith('.png'))
        .sort()
    ).toEqual([
      'feather-dark.png',
      'feather-light.png',
      'krishna-art-dark.png',
      'krishna-art-light.png',
      'lotus-divider-dark.png',
      'lotus-divider-light.png',
      'mandala-1.png',
      'mandala-2.png',
      'mandala-3.png',
      'mandala-4.png',
      'mandala-5.png',
      'nav-lotus-bg-dark.png',
      'nav-lotus-bg-light.png',
      'temple-hero-dark.png',
      'temple-hero-light.png',
      'temple-reflection-dark.png',
      'temple-reflection-light.png',
    ]);
    for (const file of readdirSync(spiritualDir)) {
      expect(existsSync(path.join(spiritualDir, file))).toBe(true);
    }
  });
});

describe('legacy verse cutover', () => {
  it('does not reference retired collections or cloud functions in app source', async () => {
    const { readFileSync, readdirSync, statSync } = await import('node:fs');
    const path = await import('node:path');

    const ROOT = path.resolve(__dirname, '../..');
    const SRC = path.join(ROOT, 'src');
    const banned = [
      'published_daily_verses',
      'daily_verse_posts',
      'daily_verse_schedules',
      'upsertDailyVerseSchedule',
      'fetchTodaysDailyVerse',
      'notification-schedule',
      'home-hero-light.jpg',
      'home-hero-dark.jpg',
      'verse_publications',
      'verse_assignments',
      'publishDailyVerse',
      'processScheduledNotifications',
      'AssignedVerseHero',
      'GitaVersePicker',
      'dailyVerseTitle',
      'assignedVerseTitle',
      'verseCompletedToday',
      'versePublishTitle',
      'quickActionPublishVerse',
      'tabVerse',
    ];

    function walk(dir: string): string[] {
      const results: string[] = [];
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
          results.push(...walk(full));
          continue;
        }
        if (full.endsWith('.ts') || full.endsWith('.tsx')) {
          results.push(full);
        }
      }
      return results;
    }

    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      if (file.endsWith('.test.ts')) continue;
      const content = readFileSync(file, 'utf8');
      for (const token of banned) {
        if (content.includes(token)) {
          offenders.push(`${path.relative(ROOT, file)} → ${token}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('static i18n dictionaries', () => {
  it('covers every English key in Hindi without missing entries', () => {
    const keys = Object.keys(messages) as MessageKey[];
    for (const key of keys) {
      expect(hiMessages[key]).toBeTruthy();
      expect(typeof hiMessages[key]).toBe('string');
    }
    expect(Object.keys(hiMessages).length).toBe(keys.length);
  });
});

describe('roster authorization policy', () => {
  it('blocks admins from creating admins or senior roles', () => {
    expect(canManageRoster('admin')).toBe(true);
    expect(canAddRosterRole('admin', 'user')).toBe(true);
    expect(canAddRosterRole('admin', 'admin')).toBe(false);
    expect(canAddRosterRole('senior_admin', 'admin')).toBe(true);
    expect(canAddRosterRole('user', 'user')).toBe(false);
  });

  it('scopes admin group assignment to assigned groups only', () => {
    expect(canAssignRosterGroups('admin', ['g1'], ['g1'])).toBe(true);
    expect(canAssignRosterGroups('admin', ['g1'], ['g2'])).toBe(false);
    expect(canAssignRosterGroups('senior_admin', [], ['g9'])).toBe(true);
  });
});
