import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import bundledContent from '@/generated/gita-content.json';
import {
  fetchGitaChapter,
  fetchGitaChapters,
  fetchGitaVerse,
  fetchGitaVersesForChapter,
  GITA_CONTENT_VERSION,
} from '@/services/gita-scripture';
import { gitaVerseDocId } from '@/types/gita-scripture';

const SOURCE_DIR = path.resolve(process.cwd(), 'data/gita/source');

function readSource(fileName: string) {
  return JSON.parse(readFileSync(path.join(SOURCE_DIR, fileName), 'utf8')) as Record<
    string,
    unknown
  >[];
}

function cleanVerseText(text: unknown) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .replace(/।।\d+\.\d+।।/g, '')
    .trim();
}

function sourceTranslations() {
  const translations = new Map<number, { en: string; hi: string }>();

  for (const entry of readSource('translation.json')) {
    const sourceVerseId = Number(entry.verse_id);
    const current = translations.get(sourceVerseId) ?? { en: '', hi: '' };
    const text = String(entry.description ?? '').trim();

    if (text && entry.lang === 'english' && !current.en) current.en = text;
    if (text && entry.lang === 'hindi' && !current.hi) current.hi = text;
    translations.set(sourceVerseId, current);
  }

  return translations;
}

describe('bundled Gita content parity', () => {
  it('matches every source chapter field in canonical order', () => {
    const expected = readSource('chapters.json')
      .map((chapter) => {
        const chapterNumber = Number(chapter.chapter_number);
        return [
          String(chapter.id ?? chapterNumber),
          chapterNumber,
          String(chapter.name_translation ?? chapter.name_meaning ?? `Chapter ${chapterNumber}`),
          String(chapter.name ?? ''),
          String(chapter.name_meaning ?? ''),
          Number(chapter.verses_count ?? 0),
          String(chapter.chapter_summary ?? '').trim(),
          String(chapter.chapter_summary_hindi ?? '').trim(),
        ];
      })
      .sort((left, right) => Number(left[1]) - Number(right[1]));

    expect(bundledContent.chapters).toHaveLength(18);
    expect(bundledContent.chapters).toEqual(expected);
  });

  it('matches every source verse id, order, and content', () => {
    const translations = sourceTranslations();
    const expected = readSource('verse.json')
      .map((verse) => {
        const chapterNumber = Number(verse.chapter_number);
        const verseNumber = Number(verse.verse_number);
        const meaning = translations.get(Number(verse.id)) ?? { en: '', hi: '' };
        return [
          gitaVerseDocId(chapterNumber, verseNumber),
          chapterNumber,
          verseNumber,
          cleanVerseText(verse.text),
          String(verse.transliteration ?? '').trim(),
          meaning.en,
          meaning.hi,
        ];
      })
      .sort(
        (left, right) =>
          Number(left[1]) - Number(right[1]) || Number(left[2]) - Number(right[2])
      );

    expect(bundledContent.verses).toHaveLength(701);
    expect(bundledContent.verses).toEqual(expected);
  });

  it('derives its content version from the complete canonical payload', () => {
    const versionedContent = {
      schemaVersion: bundledContent.schemaVersion,
      chapters: bundledContent.chapters,
      verses: bundledContent.verses,
    };
    const digest = createHash('sha256')
      .update(JSON.stringify(versionedContent))
      .digest('hex')
      .slice(0, 16);

    expect(bundledContent.contentVersion).toBe(`gita-1-${digest}`);
    expect(GITA_CONTENT_VERSION).toBe(bundledContent.contentVersion);
  });
});

describe('local Gita scripture service', () => {
  it('indexes chapters and verses while retaining the async API', async () => {
    const chapters = await fetchGitaChapters();
    expect(chapters.map((chapter) => chapter.chapterNumber)).toEqual(
      Array.from({ length: 18 }, (_, index) => index + 1)
    );

    for (const chapter of chapters) {
      const verses = await fetchGitaVersesForChapter(chapter.chapterNumber);
      expect(verses).toHaveLength(chapter.verseCount);
      expect(verses.map((verse) => verse.verseNumber)).toEqual(
        Array.from({ length: chapter.verseCount }, (_, index) => index + 1)
      );
    }

    await expect(fetchGitaChapter(19)).resolves.toBeNull();
    await expect(fetchGitaVerse(18, 78)).resolves.toMatchObject({
      id: 'c18v078',
      reference: 'BG 18.78',
      referenceHi: 'गीता 18.78',
    });
    await expect(fetchGitaVerse(18, 79)).resolves.toBeNull();
  });
});
