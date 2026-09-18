import type { Locale } from '@/lib/i18n/messages';

export function formatDate(date: Date, locale: Locale) {
  return date.toLocaleDateString(locale === 'hi' ? 'hi-IN' : 'en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatTime(date: Date, locale: Locale) {
  return date.toLocaleTimeString(locale === 'hi' ? 'hi-IN' : 'en-IN', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatDateTime(date: Date, locale: Locale) {
  return date.toLocaleString(locale === 'hi' ? 'hi-IN' : 'en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function englishOrdinal(day: number) {
  const mod100 = day % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`;
  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

const EN_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/**
 * Feed metadata time — calm, human readable.
 * en example: "12th Feb 2.30 PM" (year only when not current year).
 */
export function formatFeedDateTime(date: Date, locale: Locale, now = new Date()) {
  const hours24 = date.getHours();
  const minutes = date.getMinutes();
  const minutePart = minutes.toString().padStart(2, '0');

  if (locale === 'hi') {
    const dayMonth = date.toLocaleDateString('hi-IN', {
      day: 'numeric',
      month: 'short',
      ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' as const }),
    });
    const time = date.toLocaleTimeString('hi-IN', {
      hour: 'numeric',
      minute: '2-digit',
    });
    return `${dayMonth} ${time}`;
  }

  const ampm = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  const time = `${hours12}.${minutePart} ${ampm}`;
  const dayMonth = `${englishOrdinal(date.getDate())} ${EN_MONTHS[date.getMonth()]}`;
  if (date.getFullYear() === now.getFullYear()) {
    return `${dayMonth} ${time}`;
  }
  return `${dayMonth} ${date.getFullYear()} ${time}`;
}

export function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function sameCalendarDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
