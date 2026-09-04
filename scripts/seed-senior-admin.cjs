/**
 * Seeds bootstrap senior admins (Admin SDK / ADC).
 * Seniors are created only via DB/seed — never in the app.
 *
 * Run: node scripts/seed-senior-admin.cjs
 *
 * Data source (first match wins):
 *   1. SENIOR_ADMINS_FILE — path to JSON array
 *   2. scripts/data/senior-admins.local.json (gitignored)
 *
 * Copy scripts/data/senior-admins.example.json → senior-admins.local.json
 * and fill real phones/names locally. Never commit real PII.
 *
 * PIN env vars (optional defaults only for local bootstrap):
 *   SENIOR_ADMIN_PIN
 *   HRIDYA_SENIOR_ADMIN_PIN
 *   Or set "pin" / "pinEnv" per entry in the JSON file.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const admin = require(path.join(__dirname, '../functions/node_modules/firebase-admin'));

const PROJECT_ID = 'geeta-param-seva-6aa03';
const LOCAL_DATA = path.join(__dirname, 'data/senior-admins.local.json');

function loadSeniors() {
  const fromEnv = process.env.SENIOR_ADMINS_FILE
    ? path.resolve(process.env.SENIOR_ADMINS_FILE)
    : null;
  const dataPath = fromEnv && fs.existsSync(fromEnv) ? fromEnv : LOCAL_DATA;

  if (!fs.existsSync(dataPath)) {
    console.error(
      'Missing senior admin data file.\n' +
        `  Expected: ${LOCAL_DATA}\n` +
        '  Or set SENIOR_ADMINS_FILE to a JSON path.\n' +
        '  Copy scripts/data/senior-admins.example.json → senior-admins.local.json (gitignored).'
    );
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error(`Senior admin file must be a non-empty JSON array: ${dataPath}`);
  }

  return raw.map((entry, index) => {
    const name = String(entry.name || '').trim();
    const phoneNumber = String(entry.phoneNumber || '').trim();
    const phoneId = String(entry.phoneId || phoneNumber.replace(/\D/g, '')).trim();
    const pinEnv = entry.pinEnv ? String(entry.pinEnv) : null;
    const pin =
      (entry.pin != null ? String(entry.pin) : null) ||
      (pinEnv && process.env[pinEnv]) ||
      process.env.SENIOR_ADMIN_PIN ||
      null;

    if (!name || !phoneNumber || !phoneId) {
      throw new Error(`Invalid senior admin entry at index ${index} in ${dataPath}`);
    }
    if (!pin) {
      throw new Error(
        `Missing PIN for ${name}. Set "pin" in JSON, or pinEnv / SENIOR_ADMIN_PIN.`
      );
    }

    return { name, phoneNumber, phoneId, pin };
  });
}

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
  const seniors = loadSeniors();
  const db = admin.firestore();
  for (const senior of seniors) {
    await seedSenior(db, senior);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
