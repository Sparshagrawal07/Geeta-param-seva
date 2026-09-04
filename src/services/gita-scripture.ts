import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  where,
} from 'firebase/firestore';

import { db } from '@/lib/firebase';
import {
  formatGitaReference,
  gitaVerseDocId,
  type GitaChapter,
  type GitaVerse,
} from '@/types/gita-scripture';

function mapChapter(id: string, data: Record<string, unknown>): GitaChapter {
  return {
    id,
    chapterNumber: Number(data.chapterNumber ?? id),
    titleEn: String(data.titleEn ?? ''),
    titleHi: String(data.titleHi ?? ''),
    nameMeaning: String(data.nameMeaning ?? ''),
    verseCount: Number(data.verseCount ?? 0),
    summaryEn: String(data.summaryEn ?? ''),
    summaryHi: String(data.summaryHi ?? ''),
  };
}

function mapVerse(id: string, data: Record<string, unknown>): GitaVerse {
  const chapterNumber = Number(data.chapterNumber ?? 0);
  const verseNumber = Number(data.verseNumber ?? 0);
  return {
    id,
    chapterNumber,
    verseNumber,
    reference: String(data.reference ?? formatGitaReference(chapterNumber, verseNumber, 'en')),
    referenceHi: String(data.referenceHi ?? formatGitaReference(chapterNumber, verseNumber, 'hi')),
    verseText: String(data.verseText ?? ''),
    transliteration: String(data.transliteration ?? ''),
    meaningEn: String(data.meaningEn ?? ''),
    meaningHi: String(data.meaningHi ?? ''),
  };
}

let chaptersCache: GitaChapter[] | null = null;
const versesByChapterCache = new Map<number, GitaVerse[]>();

export async function fetchGitaChapters(): Promise<GitaChapter[]> {
  if (chaptersCache) return chaptersCache;
  const snap = await getDocs(query(collection(db, 'gita_chapters'), orderBy('chapterNumber', 'asc')));
  chaptersCache = snap.docs.map((entry) => mapChapter(entry.id, entry.data() as Record<string, unknown>));
  return chaptersCache;
}

export async function fetchGitaChapter(chapterNumber: number): Promise<GitaChapter | null> {
  const cached = chaptersCache?.find((c) => c.chapterNumber === chapterNumber);
  if (cached) return cached;
  const snap = await getDoc(doc(db, 'gita_chapters', String(chapterNumber)));
  if (!snap.exists()) return null;
  return mapChapter(snap.id, snap.data() as Record<string, unknown>);
}

export async function fetchGitaVersesForChapter(chapterNumber: number): Promise<GitaVerse[]> {
  const cached = versesByChapterCache.get(chapterNumber);
  if (cached) return cached;
  const snap = await getDocs(
    query(
      collection(db, 'gita_verses'),
      where('chapterNumber', '==', chapterNumber),
      orderBy('verseNumber', 'asc')
    )
  );
  const verses = snap.docs.map((entry) => mapVerse(entry.id, entry.data() as Record<string, unknown>));
  versesByChapterCache.set(chapterNumber, verses);
  return verses;
}

export async function fetchGitaVerse(
  chapterNumber: number,
  verseNumber: number
): Promise<GitaVerse | null> {
  const snap = await getDoc(doc(db, 'gita_verses', gitaVerseDocId(chapterNumber, verseNumber)));
  if (!snap.exists()) return null;
  return mapVerse(snap.id, snap.data() as Record<string, unknown>);
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
