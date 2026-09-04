/**
 * Wipe existing members + practice data, then seed Group 1 from spreadsheet JSON.
 *
 * Preserves senior_admin / admin accounts.
 *
 * Dry-run:  node scripts/seed-group1-roster.cjs
 * Apply:    node scripts/seed-group1-roster.cjs --apply
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const admin = require(path.join(__dirname, '../functions/node_modules/firebase-admin'));

const PROJECT_ID = 'geeta-param-seva-6aa03';
const GROUP_ID = 'group-1';
const GROUP_NAME = 'Group 1';
const JOIN_PIN = process.env.GROUP1_JOIN_PIN || '101010';
const JOIN_PIN_TTL_MS = 10 * 365 * 24 * 60 * 60 * 1000;
const APPLY = process.argv.includes('--apply');
const DATA_PATH = path.join(__dirname, 'data/group-1-roster.json');

function hashPin(value) {
  return crypto.createHash('sha256').update(`gps-pin:${value}`).digest('hex');
}

function normalizePhone(digits) {
  const cleaned = String(digits || '').replace(/\D/g, '');
  if (!/^[6-9]\d{9}$/.test(cleaned)) {
    throw new Error(`Invalid Indian mobile: ${digits}`);
  }
  return `+91${cleaned}`;
}

function phoneId(phoneNumber) {
  return phoneNumber.replace(/^\+/, '');
}

function phoneToUid(phoneNumber) {
  return `u${phoneId(phoneNumber)}`;
}

function adhyayItem(chapterNumber) {
  return {
    type: 'adhyay',
    chapterNumber,
    itemKey: `adhyay_${String(chapterNumber).padStart(2, '0')}`,
  };
}

function buildItems(adhyays, aarti) {
  if (!Array.isArray(adhyays) || adhyays.length !== 2) {
    throw new Error(`Expected exactly 2 Adhyays, got ${JSON.stringify(adhyays)}`);
  }
  const [a, b] = adhyays.map(Number);
  if (a < 1 || a > 18 || b < 1 || b > 18 || a === b) {
    throw new Error(`Invalid Adhyay pair: ${a}, ${b}`);
  }
  const items = [adhyayItem(a), adhyayItem(b)];
  if (aarti) items.push({ type: 'aarti', itemKey: 'aarti' });
  return items;
}

async function deleteQueryInBatches(db, query, label) {
  let deleted = 0;
  for (;;) {
    const snap = await query.limit(400).get();
    if (snap.empty) break;
    if (!APPLY) {
      deleted += snap.size;
      // Can't paginate dry-run easily without cursor; count via full scan once.
      break;
    }
    const batch = db.batch();
    for (const doc of snap.docs) batch.delete(doc.ref);
    await batch.commit();
    deleted += snap.size;
  }
  return deleted;
}

async function countCollection(db, name) {
  const snap = await db.collection(name).get();
  return snap.size;
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: PROJECT_ID,
});

const db = admin.firestore();

async function main() {
  const raw = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'));
  console.log(APPLY ? 'APPLYING Group 1 roster seed…' : 'DRY-RUN Group 1 roster seed (pass --apply to write)');
  console.log(`Loaded ${raw.length} spreadsheet rows from ${path.relative(process.cwd(), DATA_PATH)}`);

  // Validate + de-dupe by phone (last wins)
  const byPhone = new Map();
  const duplicates = [];
  for (const row of raw) {
    const phoneNumber = normalizePhone(row.phone);
    const items = buildItems(row.adhyays, Boolean(row.aarti));
    const prev = byPhone.get(phoneNumber);
    if (prev) {
      duplicates.push({
        phone: phoneNumber,
        kept: row.name,
        dropped: prev.name,
        keptAssignment: row.adhyays.join(' ') + (row.aarti ? ' AARTI' : ''),
        droppedAssignment: prev.adhyays.join(' ') + (prev.aarti ? ' AARTI' : ''),
      });
    }
    byPhone.set(phoneNumber, {
      name: String(row.name).trim(),
      phoneNumber,
      adhyays: row.adhyays,
      aarti: Boolean(row.aarti),
      items,
    });
  }

  if (duplicates.length) {
    console.warn(`\n⚠ ${duplicates.length} duplicate phone(s) — keeping LAST row from sheet:`);
    for (const d of duplicates) {
      console.warn(`  ${d.phone}: drop "${d.dropped}" (${d.droppedAssignment}) → keep "${d.kept}" (${d.keptAssignment})`);
    }
  }

  const members = [...byPhone.values()];
  console.log(`Unique members to seed: ${members.length}`);

  // --- Wipe existing member data (preserve admins) ---
  const rosterSnap = await db.collection('access_roster').get();
  const memberRosterDocs = rosterSnap.docs.filter((d) => (d.data().role || 'user') === 'user');
  const adminRosterDocs = rosterSnap.docs.filter((d) => d.data().role === 'admin' || d.data().role === 'senior_admin');

  const usersSnap = await db.collection('users').get();
  const memberUserDocs = usersSnap.docs.filter((d) => (d.data().role || 'user') === 'user');

  const practiceCount = await countCollection(db, 'member_practice_assignments');
  const logsCount = await countCollection(db, 'practice_completion_logs');

  console.log('\nCurrent state:');
  console.log(`  access_roster members to delete: ${memberRosterDocs.length}`);
  console.log(`  access_roster admins preserved:  ${adminRosterDocs.length}`);
  console.log(`  users (role=user) to delete:     ${memberUserDocs.length}`);
  console.log(`  practice assignments to delete:  ${practiceCount}`);
  console.log(`  practice completion logs:        ${logsCount}`);

  if (!APPLY) {
    console.log('\nDry-run only. Re-run with --apply to wipe + seed.');
    console.log(`Would create/update group ${GROUP_ID} ("${GROUP_NAME}") with join PIN ${JOIN_PIN}`);
    console.log(`Would write ${members.length} roster + practice docs.`);
    return;
  }

  // Delete member roster
  {
    let batch = db.batch();
    let ops = 0;
    for (const doc of memberRosterDocs) {
      batch.delete(doc.ref);
      ops += 1;
      if (ops >= 400) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }
    if (ops) await batch.commit();
  }

  // Delete member user profiles
  {
    let batch = db.batch();
    let ops = 0;
    for (const doc of memberUserDocs) {
      batch.delete(doc.ref);
      ops += 1;
      if (ops >= 400) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }
    if (ops) await batch.commit();
  }

  // Delete all practice assignments
  {
    const snap = await db.collection('member_practice_assignments').get();
    let batch = db.batch();
    let ops = 0;
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
      ops += 1;
      if (ops >= 400) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }
    if (ops) await batch.commit();
  }

  // Delete all practice completion logs
  {
    const snap = await db.collection('practice_completion_logs').get();
    let batch = db.batch();
    let ops = 0;
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
      ops += 1;
      if (ops >= 400) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }
    if (ops) await batch.commit();
  }

  // Reset memberCount on existing groups
  const groupsSnap = await db.collection('groups').get();
  {
    let batch = db.batch();
    for (const doc of groupsSnap.docs) {
      batch.set(doc.ref, { memberCount: 0, statsUpdatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }
    await batch.commit();
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  const joinPinHash = hashPin(JOIN_PIN);
  const expiresAt = new Date(Date.now() + JOIN_PIN_TTL_MS);

  // Create / update Group 1
  await db.doc(`groups/${GROUP_ID}`).set(
    {
      name: GROUP_NAME,
      description: 'Production Group 1 roster (spreadsheet import)',
      hasPin: true,
      pinExpiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      pinUpdatedAt: now,
      memberCount: members.length,
      createdAt: now,
      createdBy: 'seed-group1-roster',
      statsUpdatedAt: now,
    },
    { merge: true }
  );

  await db.doc(`group_pins/${GROUP_ID}`).set(
    {
      pinHash: joinPinHash,
      expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      updatedAt: now,
      updatedBy: 'seed-group1-roster',
      createdAt: now,
    },
    { merge: true }
  );

  await db.doc(`pin_hashes/${joinPinHash}`).set(
    {
      kind: 'join',
      ref: `group_pins/${GROUP_ID}`,
      updatedAt: now,
    },
    { merge: true }
  );

  // Point QA admin at Group 1 so admin panel can manage it
  const qaAdminRef = db.doc('access_roster/919876987622');
  const qaAdminSnap = await qaAdminRef.get();
  if (qaAdminSnap.exists) {
    await qaAdminRef.set(
      {
        assignedGroupIds: [GROUP_ID],
        updatedAt: now,
      },
      { merge: true }
    );
    const qaUid = 'u919876987622';
    await db.doc(`users/${qaUid}`).set({ assignedGroupIds: [GROUP_ID] }, { merge: true });
  }

  // Seed members + practice
  let batch = db.batch();
  let ops = 0;
  let written = 0;

  for (const member of members) {
    const rosterDocId = phoneId(member.phoneNumber);
    const uid = phoneToUid(member.phoneNumber);

    batch.set(
      db.doc(`access_roster/${rosterDocId}`),
      {
        name: member.name,
        nameLower: member.name.toLowerCase(),
        phoneNumber: member.phoneNumber,
        role: 'user',
        status: 'active',
        groupId: GROUP_ID,
        assignedGroupIds: [],
        createdBy: 'seed-group1-roster',
        createdAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    batch.set(
      db.doc(`member_practice_assignments/${uid}`),
      {
        uid,
        groupId: GROUP_ID,
        items: member.items,
        updatedAt: now,
        updatedBy: 'seed-group1-roster',
      },
      { merge: true }
    );

    ops += 2;
    written += 1;
    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }

  if (ops) await batch.commit();

  // Verify
  const finalRoster = await db.collection('access_roster').where('groupId', '==', GROUP_ID).get();
  const finalPractice = await db.collection('member_practice_assignments').where('groupId', '==', GROUP_ID).get();
  const aartiCount = finalPractice.docs.filter((d) =>
    Array.isArray(d.data().items) && d.data().items.some((i) => i.type === 'aarti')
  ).length;

  console.log('\nDone.');
  console.log(`  Group: ${GROUP_ID} (${GROUP_NAME})`);
  console.log(`  Join PIN: ${JOIN_PIN} (expires ${expiresAt.toISOString()})`);
  console.log(`  Roster members in Group 1: ${finalRoster.size}`);
  console.log(`  Practice assignments: ${finalPractice.size} (with Aarti: ${aartiCount})`);
  console.log(`  Spreadsheet rows written (unique phones): ${written}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
