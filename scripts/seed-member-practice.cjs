/**
 * Pre-seed standing practice assignments (Adhyay 1 + Adhyay 2) for active members.
 * Dry-run by default. Pass --apply to write.
 *
 *   node scripts/seed-member-practice.cjs
 *   node scripts/seed-member-practice.cjs --apply
 */
const path = require('path');
const admin = require(path.join(__dirname, '../functions/node_modules/firebase-admin'));

const PROJECT_ID = 'geeta-param-seva-6aa03';
const APPLY = process.argv.includes('--apply');

function phoneToUid(phoneNumber) {
  const digits = String(phoneNumber || '').replace(/\D/g, '');
  return `u${digits}`;
}

function buildItems() {
  return [
    { type: 'adhyay', chapterNumber: 1, itemKey: 'adhyay_01' },
    { type: 'adhyay', chapterNumber: 2, itemKey: 'adhyay_02' },
  ];
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: PROJECT_ID,
});

const db = admin.firestore();

async function main() {
  console.log(APPLY ? 'Applying member practice seed…' : 'Dry-run member practice seed (pass --apply to write)');

  const snap = await db
    .collection('access_roster')
    .where('status', '==', 'active')
    .get();

  let scanned = 0;
  let wouldWrite = 0;
  let written = 0;
  let skipped = 0;

  const batchSize = 400;
  let batch = db.batch();
  let ops = 0;

  for (const doc of snap.docs) {
    const data = doc.data() || {};
    if (data.role && data.role !== 'user') continue;
    const groupId = typeof data.groupId === 'string' ? data.groupId.trim() : '';
    if (!groupId) continue;

    scanned += 1;
    const phoneNumber = typeof data.phoneNumber === 'string' ? data.phoneNumber : `+${doc.id}`;
    const uid = phoneToUid(phoneNumber);
    const ref = db.collection('member_practice_assignments').doc(uid);
    const existing = await ref.get();
    if (existing.exists && Array.isArray(existing.data()?.items) && existing.data().items.length >= 2) {
      skipped += 1;
      continue;
    }

    wouldWrite += 1;
    if (!APPLY) continue;

    batch.set(
      ref,
      {
        uid,
        groupId,
        items: buildItems(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: 'seed-member-practice',
      },
      { merge: true }
    );
    ops += 1;
    written += 1;
    if (ops >= batchSize) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }

  if (APPLY && ops > 0) {
    await batch.commit();
  }

  console.log('Done.', { scanned, wouldWrite, written, skipped, apply: APPLY });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
