/**
 * Seeds QA test admin + member accounts (Admin SDK / ADC).
 *
 * Admin:  +911111111111 / personal PIN 111111
 * Member: +912222222222 / join PIN 222222 (long QA expiry)
 *
 * Senior remains scripts/seed-senior-admin.cjs only.
 * Run: node scripts/seed-test-accounts.cjs
 */
const path = require('path');
const crypto = require('crypto');
const admin = require(path.join(__dirname, '../functions/node_modules/firebase-admin'));

const PROJECT_ID = 'geeta-param-seva-6aa03';
const TEST_GROUP_ID = 'qa-test-group';
const ADMIN_PHONE = '+919876987622';
const ADMIN_PHONE_ID = '919876987622';
const ADMIN_PIN = '111111';
const MEMBER_PHONE = '+919876987623';
const MEMBER_PHONE_ID = '919876987623';
const JOIN_PIN = '222222';
/** ~10 years so QA does not constantly regenerate */
const JOIN_PIN_TTL_MS = 10 * 365 * 24 * 60 * 60 * 1000;

function hashPin(value) {
  return crypto.createHash('sha256').update(`gps-pin:${value}`).digest('hex');
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: PROJECT_ID,
});

const db = admin.firestore();

async function main() {
  const adminPinHash = hashPin(ADMIN_PIN);
  const joinPinHash = hashPin(JOIN_PIN);
  const expiresAt = new Date(Date.now() + JOIN_PIN_TTL_MS);
  const now = admin.firestore.FieldValue.serverTimestamp();

  await db.doc(`groups/${TEST_GROUP_ID}`).set(
    {
      name: 'QA Test Group',
      description: 'Seeded test group for admin/member PIN QA',
      hasPin: true,
      pinExpiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      pinUpdatedAt: now,
      createdAt: now,
      createdBy: 'seed-test-accounts',
    },
    { merge: true }
  );

  await db.doc(`group_pins/${TEST_GROUP_ID}`).set(
    {
      pinHash: joinPinHash,
      expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
      updatedAt: now,
      updatedBy: 'seed-test-accounts',
      createdAt: now,
    },
    { merge: true }
  );

  await db.doc(`pin_hashes/${joinPinHash}`).set(
    {
      kind: 'join',
      ref: `group_pins/${TEST_GROUP_ID}`,
      updatedAt: now,
    },
    { merge: true }
  );

  await db.doc(`access_roster/${ADMIN_PHONE_ID}`).set(
    {
      phoneNumber: ADMIN_PHONE,
      name: 'QA Admin',
      role: 'admin',
      status: 'active',
      assignedGroupIds: [TEST_GROUP_ID],
      pinHash: adminPinHash,
      pinSetAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  await db.doc(`pin_hashes/${adminPinHash}`).set(
    {
      kind: 'personal',
      ref: `access_roster/${ADMIN_PHONE_ID}`,
      updatedAt: now,
    },
    { merge: true }
  );

  const adminUid = `u${ADMIN_PHONE_ID}`;
  await db.doc(`users/${adminUid}`).set(
    {
      phoneNumber: ADMIN_PHONE,
      name: 'QA Admin',
      role: 'admin',
      groupId: null,
      assignedGroupIds: [TEST_GROUP_ID],
      hasPersonalPin: true,
      whitelistKey: ADMIN_PHONE_ID,
    },
    { merge: true }
  );

  await db.doc(`access_roster/${MEMBER_PHONE_ID}`).set(
    {
      phoneNumber: MEMBER_PHONE,
      name: 'QA Member',
      role: 'user',
      status: 'active',
      groupId: TEST_GROUP_ID,
      updatedAt: now,
    },
    { merge: true }
  );

  const memberUid = `u${MEMBER_PHONE_ID}`;
  await db.doc(`users/${memberUid}`).set(
    {
      phoneNumber: MEMBER_PHONE,
      name: 'QA Member',
      role: 'user',
      groupId: TEST_GROUP_ID,
      assignedGroupIds: [],
      hasPersonalPin: false,
    },
    { merge: true }
  );

  console.log(`Seeded group ${TEST_GROUP_ID}`);
  console.log(`Admin  ${ADMIN_PHONE} personal PIN ${ADMIN_PIN} (uid ${adminUid})`);
  console.log(`Member ${MEMBER_PHONE} join PIN ${JOIN_PIN} expires ${expiresAt.toISOString()}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
