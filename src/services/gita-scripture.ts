import bundledContent from '@/generated/gita-content.json';
import {
  formatGitaReference,
  type GitaChapter,
  type GitaVerse,
} from '@/types/gita-scripture';

type BundledChapter = [
  id: string,
  chapterNumber: number,
  titleEn: string,
  titleHi: string,
  nameMeaning: string,
  verseCount: number,
  summaryEn: string,
  summaryHi: string,
];

type BundledVerse = [
  id: string,
  chapterNumber: number,
  verseNumber: number,
  verseText: string,
  transliteration: string,
  meaningEn: string,
  meaningHi: string,
];

type BundledGitaContent = {
  schemaVersion: number;
  contentVersion: string;
  chapters: BundledChapter[];
  verses: BundledVerse[];
};

const content = bundledContent as unknown as BundledGitaContent;

function mapChapter(data: BundledChapter): GitaChapter {
  return {
    id: data[0],
    chapterNumber: data[1],
    titleEn: data[2],
    titleHi: data[3],
    nameMeaning: data[4],
    verseCount: data[5],
    summaryEn: data[6],
    summaryHi: data[7],
  };
}

function mapVerse(data: BundledVerse): GitaVerse {
  const chapterNumber = data[1];
  const verseNumber = data[2];
  return {
    id: data[0],
    chapterNumber,
    verseNumber,
    reference: formatGitaReference(chapterNumber, verseNumber, 'en'),
    referenceHi: formatGitaReference(chapterNumber, verseNumber, 'hi'),
    verseText: data[3],
    transliteration: data[4],
    meaningEn: data[5],
    meaningHi: data[6],
  };
}

export const GITA_CONTENT_VERSION = content.contentVersion;

const chaptersCache = content.chapters.map(mapChapter);
const chapterByNumberCache = new Map(
  chaptersCache.map((chapter) => [chapter.chapterNumber, chapter] as const)
);
const versesByChapterCache = new Map<number, GitaVerse[]>();
const verseByCoordinatesCache = new Map<string, GitaVerse>();

for (const bundledVerse of content.verses) {
  const verse = mapVerse(bundledVerse);
  const chapterVerses = versesByChapterCache.get(verse.chapterNumber) ?? [];
  chapterVerses.push(verse);
  versesByChapterCache.set(verse.chapterNumber, chapterVerses);
  verseByCoordinatesCache.set(`${verse.chapterNumber}:${verse.verseNumber}`, verse);
}

export async function fetchGitaChapters(): Promise<GitaChapter[]> {
  return chaptersCache;
}

export async function fetchGitaChapter(chapterNumber: number): Promise<GitaChapter | null> {
  return chapterByNumberCache.get(chapterNumber) ?? null;
}

export async function fetchGitaVersesForChapter(chapterNumber: number): Promise<GitaVerse[]> {
  return versesByChapterCache.get(chapterNumber) ?? [];
}

export async function fetchGitaVerse(
  chapterNumber: number,
  verseNumber: number
): Promise<GitaVerse | null> {
  return verseByCoordinatesCache.get(`${chapterNumber}:${verseNumber}`) ?? null;
}

export function resolveGitaVerseContent(verse: GitaVerse, locale: string) {
  const isHi = locale === 'hi';
  return {
    reference: isHi ? verse.referenceHi : verse.reference,
    verseText: verse.verseText,
    meaning: isHi ? verse.meaningHi || verse.meaningEn : verse.meaningEn || verse.meaningHi,
    transliteration: verse.transliteration,
  };
}
