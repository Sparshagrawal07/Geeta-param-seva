/**
 * Pure schedule helpers (no Firebase). Timezone math targets Asia/Kolkata (IST, UTC+5:30)
 * and other fixed/known zones via Intl where possible.
 */

export type Recurrence = 'once' | 'daily' | 'weekdays' | 'weekends' | 'custom';

export interface TimeOfDay {
  hour: number;
  minute: number;
}

export interface ZonedParts {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 0=Sun … 6=Sat
}

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

const WEEKDAY_SHORT: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function assertTimeOfDay(timeOfDay: TimeOfDay) {
  if (
    !Number.isInteger(timeOfDay.hour) ||
    timeOfDay.hour < 0 ||
    timeOfDay.hour > 23 ||
    !Number.isInteger(timeOfDay.minute) ||
    timeOfDay.minute < 0 ||
    timeOfDay.minute > 59
  ) {
    throw new Error('timeOfDay must use hour 0–23 and minute 0–59.');
  }
}

export function normalizeWeekdays(weekdays: unknown, recurrence: Recurrence): number[] {
  if (recurrence === 'weekdays') {
    return [1, 2, 3, 4, 5];
  }
  if (recurrence === 'weekends') {
    return [0, 6];
  }
  if (recurrence === 'custom') {
    if (!Array.isArray(weekdays) || weekdays.length === 0) {
      throw new Error('custom recurrence requires at least one weekday.');
    }
    const normalized = [
      ...new Set(
        weekdays.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
      ),
    ].sort((a, b) => a - b);
    if (normalized.length === 0) {
      throw new Error('custom recurrence requires weekdays 0–6.');
    }
    return normalized;
  }
  return [];
}

function isIst(timeZone: string) {
  return timeZone === 'Asia/Kolkata' || timeZone === 'Asia/Calcutta';
}

/** Wall-clock parts of `date` in `timeZone`. */
export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  if (isIst(timeZone)) {
    const shifted = new Date(date.getTime() + IST_OFFSET_MS);
    return {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
      hour: shifted.getUTCHours(),
      minute: shifted.getUTCMinutes(),
      second: shifted.getUTCSeconds(),
      weekday: shifted.getUTCDay(),
    };
  }

  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const weekday = WEEKDAY_SHORT[parts.weekday ?? ''] ?? 0;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday,
  };
}

/** Convert a wall-clock local time in `timeZone` to a UTC Date. */
export function zonedTimeToUtc(
  parts: { year: number; month: number; day: number; hour: number; minute: number; second?: number },
  timeZone: string
): Date {
  const second = parts.second ?? 0;
  if (isIst(timeZone)) {
    return new Date(
      Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, second) - IST_OFFSET_MS
    );
  }

  // Guess via iterative offset (works for most IANA zones without DST edge cases we care about).
  const guess = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, second));
  const asZoned = getZonedParts(guess, timeZone);
  const desiredAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, second);
  const actualAsUtc = Date.UTC(
    asZoned.year,
    asZoned.month - 1,
    asZoned.day,
    asZoned.hour,
    asZoned.minute,
    asZoned.second
  );
  return new Date(guess.getTime() + (desiredAsUtc - actualAsUtc));
}

function addCalendarDays(
  parts: { year: number; month: number; day: number },
  days: number
): { year: number; month: number; day: number; weekday: number } {
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
    weekday: utc.getUTCDay(),
  };
}

function occurrenceMatches(
  weekday: number,
  recurrence: Recurrence,
  weekdays: number[]
): boolean {
  if (recurrence === 'once' || recurrence === 'daily') {
    return true;
  }
  if (recurrence === 'weekdays') {
    return weekday >= 1 && weekday <= 5;
  }
  if (recurrence === 'weekends') {
    return weekday === 0 || weekday === 6;
  }
  return weekdays.includes(weekday);
}

/**
 * Next run at or after `from` (inclusive of exact `from` wall time if it matches).
 * For `once`, returns that single occurrence or null if it is already past `from`.
 */
export function computeNextRunAt(input: {
  from: Date;
  timezone: string;
  timeOfDay: TimeOfDay;
  recurrence: Recurrence;
  weekdays?: number[];
  /** When set (e.g. just-ran occurrence), search strictly after this instant. */
  afterExclusive?: Date;
}): Date | null {
  assertTimeOfDay(input.timeOfDay);
  const weekdays = normalizeWeekdays(input.weekdays ?? [], input.recurrence);
  const start = input.afterExclusive
    ? new Date(input.afterExclusive.getTime() + 1000)
    : input.from;

  const zonedNow = getZonedParts(start, input.timezone);

  for (let offset = 0; offset < 370; offset += 1) {
    const day = addCalendarDays(
      { year: zonedNow.year, month: zonedNow.month, day: zonedNow.day },
      offset
    );
    if (!occurrenceMatches(day.weekday, input.recurrence, weekdays)) {
      continue;
    }

    const candidate = zonedTimeToUtc(
      {
        year: day.year,
        month: day.month,
        day: day.day,
        hour: input.timeOfDay.hour,
        minute: input.timeOfDay.minute,
        second: 0,
      },
      input.timezone
    );

    if (candidate.getTime() < start.getTime()) {
      continue;
    }

    if (input.recurrence === 'once') {
      return candidate;
    }
    return candidate;
  }

  return null;
}

/** Idempotency key for a scheduled occurrence. */
export function buildRunKey(scheduleId: string, runAt: Date): string {
  return `${scheduleId}_${runAt.toISOString()}`;
}

/** Calendar date key in the schedule timezone (YYYY-MM-DD). */
export function zonedDateKey(date: Date, timeZone: string): string {
  const p = getZonedParts(date, timeZone);
  const mm = String(p.month).padStart(2, '0');
  const dd = String(p.day).padStart(2, '0');
  return `${p.year}-${mm}-${dd}`;
}
