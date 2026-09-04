import { describe, expect, it } from 'vitest';

import { formatGitaReference, gitaVerseDocId } from '@/types/gita-scripture';

describe('gita scripture helpers', () => {
  it('builds stable verse document ids', () => {
    expect(gitaVerseDocId(1, 1)).toBe('c01v001');
    expect(gitaVerseDocId(18, 78)).toBe('c18v078');
  });

  it('formats references for en and hi locales', () => {
    expect(formatGitaReference(2, 47, 'en')).toBe('BG 2.47');
    expect(formatGitaReference(2, 47, 'hi')).toBe('गीता 2.47');
  });
});
