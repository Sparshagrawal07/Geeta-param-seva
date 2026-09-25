import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, '..');
const SOURCE_DIR = path.join(ROOT, 'data/gita/source');
const OUTPUT_PATH = path.join(ROOT, 'src/generated/gita-content.json');
const SCHEMA_VERSION = 1;

function cleanVerseText(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .replace(/।।\d+\.\d+।।/g, '')
    .trim();
}

function verseId(chapterNumber, verseNumber) {
  return `c${String(chapterNumber).padStart(2, '0')}v${String(verseNumber).padStart(3, '0')}`;
}

function pickTranslations(translations) {
  const byVerse = new Map();

  for (const entry of translations) {
    const sourceVerseId = Number(entry.verse_id);
    const current = byVerse.get(sourceVerseId) ?? { en: '', hi: '' };
    const text = String(entry.description ?? '').trim();

    if (text && entry.lang === 'english' && !current.en) current.en = text;
    if (text && entry.lang === 'hindi' && !current.hi) current.hi = text;
    byVerse.set(sourceVerseId, current);
  }

  return byVerse;
}

function assertSourceParity(chapters, verses) {
  const actualCounts = new Map();
  const seenIds = new Set();

  for (const verse of verses) {
    const chapterNumber = Number(verse[1]);
    const id = String(verse[0]);
    if (seenIds.has(id)) throw new Error(`Duplicate generated verse id: ${id}`);
    seenIds.add(id);
    actualCounts.set(chapterNumber, (actualCounts.get(chapterNumber) ?? 0) + 1);
  }

  for (const chapter of chapters) {
    const chapterNumber = Number(chapter[1]);
    const declaredCount = Number(chapter[5]);
    const actualCount = actualCounts.get(chapterNumber) ?? 0;
    if (declaredCount !== actualCount) {
      throw new Error(
        `Chapter ${chapterNumber} declares ${declaredCount} verses but contains ${actualCount}`
      );
    }
  }
}

async function generate() {
  const [chapterSource, verseSource, translationSource] = await Promise.all(
    ['chapters.json', 'verse.json', 'translation.json'].map(async (fileName) =>
      JSON.parse(await readFile(path.join(SOURCE_DIR, fileName), 'utf8'))
    )
  );
  const translations = pickTranslations(translationSource);

  const chapters = chapterSource
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
    .sort((left, right) => left[1] - right[1]);

  const verses = verseSource
    .map((verse) => {
      const chapterNumber = Number(verse.chapter_number);
      const verseNumber = Number(verse.verse_number);
      const meaning = translations.get(Number(verse.id)) ?? { en: '', hi: '' };

      return [
        verseId(chapterNumber, verseNumber),
        chapterNumber,
        verseNumber,
        cleanVerseText(verse.text),
        String(verse.transliteration ?? '').trim(),
        meaning.en,
        meaning.hi,
      ];
    })
    .sort((left, right) => left[1] - right[1] || left[2] - right[2]);

  assertSourceParity(chapters, verses);

  const versionedContent = { schemaVersion: SCHEMA_VERSION, chapters, verses };
  const digest = createHash('sha256')
    .update(JSON.stringify(versionedContent))
    .digest('hex')
    .slice(0, 16);

  return {
    schemaVersion: SCHEMA_VERSION,
    contentVersion: `gita-${SCHEMA_VERSION}-${digest}`,
    chapters,
    verses,
  };
}

const content = await generate();
const serialized = `${JSON.stringify(content)}\n`;

if (process.argv.includes('--check')) {
  const existing = await readFile(OUTPUT_PATH, 'utf8').catch(() => '');
  if (existing !== serialized) {
    console.error('Bundled Gita content is stale. Run: node scripts/generate-gita-content.mjs');
    process.exitCode = 1;
  }
} else {
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, serialized);
  console.log(
    `Generated ${path.relative(ROOT, OUTPUT_PATH)} (${content.chapters.length} chapters, ${content.verses.length} verses, ${content.contentVersion})`
  );
}
