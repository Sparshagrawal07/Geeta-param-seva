import { describe, expect, it } from 'vitest';

import type { PracticeMemberOverviewRow } from '@/lib/practice';
import {
  formatAdhyayRangeLabel,
  formatIncompletePracticeWhatsAppMessage,
} from '@/lib/practice-whatsapp';

function row(
  partial: Partial<PracticeMemberOverviewRow> & Pick<PracticeMemberOverviewRow, 'uid' | 'name'>
): PracticeMemberOverviewRow {
  return {
    phoneNumber: '+910000000000',
    items: [],
    allComplete: false,
    incompleteCount: 0,
    ...partial,
  };
}

describe('practice whatsapp copy', () => {
  it('formats adhyay ranges', () => {
    expect(formatAdhyayRangeLabel([2, 1])).toBe('1..2');
    expect(formatAdhyayRangeLabel([7])).toBe('7');
    expect(formatAdhyayRangeLabel([])).toBe('');
  });

  it('groups incomplete members by adhyay, omits phones and complete rows', () => {
    const members = [
      row({
        uid: '1',
        name: 'Sumitra G',
        items: [
          { type: 'adhyay', chapterNumber: 1, itemKey: 'adhyay_01', completed: false },
          { type: 'adhyay', chapterNumber: 2, itemKey: 'adhyay_02', completed: false },
        ],
        allComplete: false,
      }),
      row({
        uid: '2',
        name: 'Tara G',
        items: [
          { type: 'adhyay', chapterNumber: 3, itemKey: 'adhyay_03', completed: false },
          { type: 'adhyay', chapterNumber: 4, itemKey: 'adhyay_04', completed: true },
        ],
        allComplete: false,
      }),
      row({
        uid: '3',
        name: 'Annu G',
        phoneNumber: '+911111111111',
        items: [
          { type: 'adhyay', chapterNumber: 3, itemKey: 'adhyay_03', completed: false },
          { type: 'adhyay', chapterNumber: 4, itemKey: 'adhyay_04', completed: false },
        ],
        allComplete: false,
      }),
      row({
        uid: '4',
        name: 'Done Person',
        items: [
          { type: 'adhyay', chapterNumber: 5, itemKey: 'adhyay_05', completed: true },
          { type: 'adhyay', chapterNumber: 6, itemKey: 'adhyay_06', completed: true },
        ],
        allComplete: true,
      }),
    ];

    const text = formatIncompletePracticeWhatsAppMessage(members, {
      practiceDateKey: '2026-09-05',
      title: 'Incomplete Adhyay practice',
    });

    expect(text).toContain('Incomplete Adhyay practice');
    expect(text).toContain('Date: 2026-09-05');
    expect(text).toContain('1..2 → Sumitra G');
    expect(text).toContain('3..4 → Tara G, Annu G');
    expect(text).not.toContain('Done Person');
    expect(text).not.toContain('+91');
    expect(text).not.toContain('1111');
  });

  it('returns empty when nobody is incomplete', () => {
    expect(
      formatIncompletePracticeWhatsAppMessage([
        row({
          uid: '1',
          name: 'Done',
          allComplete: true,
          items: [{ type: 'adhyay', chapterNumber: 1, itemKey: 'adhyay_01', completed: true }],
        }),
      ])
    ).toBe('');
  });
});
