/**
 * Seeds bootstrap senior admins (Admin SDK / ADC).
 * Seniors are created only via DB/seed — never in the app.
 *
 * Run: node scripts/seed-senior-admin.cjs
 *
 * Optional overrides:
 *   SENIOR_ADMIN_PIN — PIN for Sparsh only (default 246810)
 *   HRIDYA_SENIOR_ADMIN_PIN — PIN for Hridya (default 321456)
 */
const path = require('path');
const crypto = require('crypto');
const admin = require(path.join(__dirname, '../functions/node_modules/firebase-admin'));

const PROJECT_ID = 'geeta-param-seva-6aa03';

const SENIORS = [
  {
    name: 'Sparsh Agrawal',
    phoneNumber: '+919599679802',
    phoneId: '919599679802',
    pin: process.env.SENIOR_ADMIN_PIN || '246810',
  },
  {
    name: 'Hridya Hirawat',
    phoneNumber: '+918810419061',
    phoneId: '918810419061',
    pin: process.env.HRIDYA_SENIOR_ADMIN_PIN || '321456',
  },
];

function hashPin(value) {
  return crypto.createHash('sha256').update(`gps-pin:${value}`).digest('hex');
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: PROJECT_ID,
});

async function seedSenior(db, senior) {
  const { name, phoneNumber, phoneId, pin } = senior;
  const pinHash = hashPin(pin);
  const now = admin.firestore.FieldValue.serverTimestamp();
  const seniorRef = `senior_admins/${phoneId}`;

  const existingHashSnap = await db.doc(seniorRef).get();
  const previousHash =
    existingHashSnap.exists && typeof existingHashSnap.data()?.pinHash === 'string'
      ? String(existingHashSnap.data().pinHash)
      : null;

  if (previousHash && previousHash !== pinHash) {
    await db.doc(`pin_hashes/${previousHash}`).delete().catch(() => {});
  }

  const taken = await db.doc(`pin_hashes/${pinHash}`).get();
  if (taken.exists) {
    const owner = taken.data()?.ref;
    if (owner && owner !== seniorRef) {
      throw new Error(`PIN already in use by ${owner} (cannot assign to ${name})`);
    }
  }

  // If this phone was previously on the member/admin roster, clear it so login resolves as senior.
  const rosterRef = db.doc(`access_roster/${phoneId}`);
  const rosterSnap = await rosterRef.get();
  if (rosterSnap.exists) {
    const oldRosterHash =
      typeof rosterSnap.data()?.pinHash === 'string' ? String(rosterSnap.data().pinHash) : null;
    if (oldRosterHash && oldRosterHash !== pinHash) {
      await db.doc(`pin_hashes/${oldRosterHash}`).delete().catch(() => {});
    }
    await rosterRef.delete();
    console.log(`Removed access_roster/${phoneId} (promoted to senior_admin)`);
  }

  await db.doc(seniorRef).set(
    {
      name,
      phoneNumber,
      pinHash,
      pinSetAt: now,
      createdAt: existingHashSnap.exists
        ? existingHashSnap.data()?.createdAt || new Date().toISOString()
        : new Date().toISOString(),
      updatedAt: now,
    },
    { merge: true }
  );

  await db.doc(`pin_hashes/${pinHash}`).set(
    {
      kind: 'personal',
      ref: seniorRef,
      updatedAt: now,
    },
    { merge: true }
  );

  const uid = `u${phoneId}`;
  await db.doc(`users/${uid}`).set(
    {
      phoneNumber,
      name,
      role: 'senior_admin',
      groupId: null,
      assignedGroupIds: [],
      hasPersonalPin: true,
      seniorAdminKey: phoneId,
    },
    { merge: true }
  );

  console.log(`Seeded ${seniorRef} → ${name} (${phoneNumber})`);
  console.log(`  PIN (store offline): ${pin}`);
}

async function main() {
  const db = admin.firestore();
  for (const senior of SENIORS) {
    await seedSenior(db, senior);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
