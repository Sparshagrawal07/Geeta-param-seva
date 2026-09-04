/**
 * Seed gita_chapters + gita_verses from gita/gita (The Unlicense).
 *
 * Dry-run:  node scripts/seed-gita-scripture.cjs
 * Apply:    node scripts/seed-gita-scripture.cjs --apply
 *
 * Downloads source JSON on first run into data/gita/source/
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const admin = require(path.join(__dirname, '../functions/node_modules/firebase-admin'));

const PROJECT_ID = 'geeta-param-seva-6aa03';
const APPLY = process.argv.includes('--apply');
const ROOT = path.join(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'data/gita/source');
const BASE_URL = 'https://raw.githubusercontent.com/gita/gita/main/data';

const FILES = {
  chapters: 'chapters.json',
  verses: 'verse.json',
  translations: 'translation.json',
};

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: PROJECT_ID,
});

const db = admin.firestore();

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => file.close(() => resolve(dest)));
      })
      .on('error', reject);
  });
}

async function ensureSource(fileName) {
  fs.mkdirSync(SOURCE_DIR, { recursive: true });
  const dest = path.join(SOURCE_DIR, fileName);
  if (fs.existsSync(dest)) return dest;
  console.log('Downloading', fileName, '…');
  await download(`${BASE_URL}/${fileName}`, dest);
  return dest;
}

function cleanVerseText(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .replace(/।।\d+\.\d+।।/g, '')
    .trim();
}

function pickTranslations(translations) {
  const map = new Map();
  for (const entry of translations) {
    const verseId = entry.verse_id;
    if (!map.has(verseId)) {
      map.set(verseId, { en: '', hi: '' });
    }
    const bucket = map.get(verseId);
    const text = String(entry.description ?? '').trim();
    if (!text) continue;
    if (entry.lang === 'english' && !bucket.en) bucket.en = text;
    if (entry.lang === 'hindi' && !bucket.hi) bucket.hi = text;
  }
  return map;
}

function verseDocId(chapterNumber, verseNumber) {
  return `c${String(chapterNumber).padStart(2, '0')}v${String(verseNumber).padStart(3, '0')}`;
}

async function main() {
  const chaptersPath = await ensureSource(FILES.chapters);
  const versesPath = await ensureSource(FILES.verses);
  const translationsPath = await ensureSource(FILES.translations);

  const chapters = JSON.parse(fs.readFileSync(chaptersPath, 'utf8'));
  const verses = JSON.parse(fs.readFileSync(versesPath, 'utf8'));
  const translations = JSON.parse(fs.readFileSync(translationsPath, 'utf8'));
  const translationMap = pickTranslations(translations);

  console.log(APPLY ? 'Applying Gita seed…' : 'Dry-run Gita seed (pass --apply to write)');
  console.log({ chapters: chapters.length, verses: verses.length });

  let chapterWrites = 0;
  let verseWrites = 0;

  for (const chapter of chapters) {
    const chapterNumber = Number(chapter.chapter_number);
    const doc = {
      chapterNumber,
      titleEn: String(chapter.name_translation ?? chapter.name_meaning ?? `Chapter ${chapterNumber}`),
      titleHi: String(chapter.name ?? ''),
      nameMeaning: String(chapter.name_meaning ?? ''),
      verseCount: Number(chapter.verses_count ?? 0),
      summaryEn: String(chapter.chapter_summary ?? '').trim(),
      summaryHi: String(chapter.chapter_summary_hindi ?? '').trim(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (APPLY) {
      await db.collection('gita_chapters').doc(String(chapterNumber)).set(doc, { merge: true });
    }
    chapterWrites += 1;
  }

  const batchSize = 400;
  let batch = APPLY ? db.batch() : null;
  let batchCount = 0;

  for (const verse of verses) {
    const chapterNumber = Number(verse.chapter_number);
    const verseNumber = Number(verse.verse_number);
    const t = translationMap.get(verse.id) ?? { en: '', hi: '' };
    const id = verseDocId(chapterNumber, verseNumber);
    const doc = {
      chapterNumber,
      verseNumber,
      sourceVerseId: Number(verse.id),
      reference: `BG ${chapterNumber}.${verseNumber}`,
      referenceHi: `गीता ${chapterNumber}.${verseNumber}`,
      verseText: cleanVerseText(verse.text),
      transliteration: String(verse.transliteration ?? '').trim(),
      meaningEn: t.en,
      meaningHi: t.hi,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (APPLY) {
      batch.set(db.collection('gita_verses').doc(id), doc, { merge: true });
      batchCount += 1;
      if (batchCount >= batchSize) {
        await batch.commit();
        batch = db.batch();
        batchCount = 0;
      }
    }
    verseWrites += 1;
  }

  if (APPLY && batchCount > 0) {
    await batch.commit();
  }

  console.log('Done.', { chapterWrites, verseWrites, apply: APPLY });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
