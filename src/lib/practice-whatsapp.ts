import type { PracticeMemberOverviewRow } from '@/lib/practice';

/** Group key + display label for assigned Adhyay chapters, e.g. "1..2". */
export function formatAdhyayRangeLabel(chapterNumbers: number[]): string {
  const sorted = [...new Set(chapterNumbers.filter((n) => Number.isFinite(n) && n > 0))].sort(
    (a, b) => a - b
  );
  if (sorted.length === 0) return '';
  return sorted.join('..');
}

/**
 * WhatsApp-ready list of incomplete members grouped by assigned Adhyays.
 * No phone numbers. Skips members with no Adhyay assignment or already complete.
 */
export function formatIncompletePracticeWhatsAppMessage(
  members: PracticeMemberOverviewRow[],
  options?: { practiceDateKey?: string; title?: string }
): string {
  const groups = new Map<string, string[]>();

  for (const member of members) {
    if (!member.items.length || member.allComplete) continue;
    const chapters = member.items
      .filter((item) => item.type === 'adhyay' && typeof item.chapterNumber === 'number')
      .map((item) => Number(item.chapterNumber));
    const range = formatAdhyayRangeLabel(chapters);
    if (!range) continue;

    const name = member.name.trim();
    if (!name) continue;

    const list = groups.get(range) ?? [];
    list.push(name);
    groups.set(range, list);
  }

  const ranges = [...groups.keys()].sort((a, b) => {
    const aFirst = Number(a.split('..')[0] || 0);
    const bFirst = Number(b.split('..')[0] || 0);
    return aFirst - bFirst;
  });

  if (ranges.length === 0) {
    return '';
  }

  const title = (options?.title || 'Incomplete Adhyay practice').trim();
  const lines = [title];
  if (options?.practiceDateKey) {
    lines.push(`Date: ${options.practiceDateKey}`);
  }
  lines.push('');

  for (const range of ranges) {
    const names = groups.get(range) ?? [];
    lines.push(`${range} → ${names.join(', ')}`);
  }

  return lines.join('\n').trim();
}
