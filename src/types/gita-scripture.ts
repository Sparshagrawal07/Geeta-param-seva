/** Canonical Bhagavad Gita chapter metadata (Firestore: gita_chapters). */
export interface GitaChapter {
  id: string;
  chapterNumber: number;
  titleEn: string;
  titleHi: string;
  nameMeaning: string;
  verseCount: number;
  summaryEn: string;
  summaryHi: string;
}

/** Canonical verse (Firestore: gita_verses). */
export interface GitaVerse {
  id: string;
  chapterNumber: number;
  verseNumber: number;
  reference: string;
  referenceHi: string;
  verseText: string;
  transliteration: string;
  meaningEn: string;
  meaningHi: string;
}

export interface GitaScriptureRef {
  chapterNumber: number;
  verseNumber: number;
}

export function gitaVerseDocId(chapterNumber: number, verseNumber: number): string {
  return `c${String(chapterNumber).padStart(2, '0')}v${String(verseNumber).padStart(3, '0')}`;
}

export function formatGitaReference(chapterNumber: number, verseNumber: number, locale: 'en' | 'hi' = 'en'): string {
  return locale === 'hi'
    ? `गीता ${chapterNumber}.${verseNumber}`
    : `BG ${chapterNumber}.${verseNumber}`;
}
