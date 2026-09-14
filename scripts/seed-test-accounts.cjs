/**
 * Seeds App Review / QA admin + member accounts (Admin SDK / ADC).
 *
 * Uses valid Indian mobiles (must start with 6–9 — client rejects 1…).
 * Both accounts get a permanent personal PIN (no join-PIN / test-group setup).
 * Member is attached to existing group-1 for feed/practice features.
 *
 * Admin:  +919876500001 / personal PIN 111111
 * Member: +919876500002 / personal PIN 222222
 *
 * Requires deployed pin-auth that accepts member personal PINs.
 * Run: node scripts/seed-test-accounts.cjs
 */
const path = require('path');
const crypto = require('crypto');
const admin = require(path.join(__dirname, '../functions/node_modules/firebase-admin'));

const PROJECT_ID = 'geeta-param-seva-6aa03';
const EXISTING_GROUP_ID = process.env.QA_GROUP_ID || 'group-1';

/** Valid Indian mobiles (10 digits, start 6–9). */
const ADMIN_PHONE = process.env.QA_ADMIN_PHONE || '+919876500001';
const ADMIN_PHONE_ID = ADMIN_PHONE.replace(/^\+/, '');
const ADMIN_PIN = process.env.QA_ADMIN_PIN || '111111';

const MEMBER_PHONE = process.env.QA_MEMBER_PHONE || '+919876500002';
const MEMBER_PHONE_ID = MEMBER_PHONE.replace(/^\+/, '');
const MEMBER_PIN = process.env.QA_MEMBER_PIN || '222222';

/** Legacy invalid QA phones (client rejects — clean up if present). */
const LEGACY_PHONE_IDS = ['911111111111', '912222222222'];

function assertValidIndianE164(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  const local = digits.startsWith('91') && digits.length === 12 ? digits.slice(2) : digits;
  if (!/^[6-9]\d{9}$/.test(local)) {
    throw new Error(
      `Invalid Indian mobile ${phone}. App requires exactly 10 digits starting with 6–9.`
    );
  }
}

function hashPin(value) {
  return crypto.createHash('sha256').update(`gps-pin:${value}`).digest('hex');
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId: PROJECT_ID,
});

const db = admin.firestore();

async function releasePinHashIfOwned(pinHash, expectedRef) {
  if (!pinHash) return;
  const ref = db.doc(`pin_hashes/${pinHash}`);
  const snap = await ref.get();
  if (!snap.exists) return;
  const owner = snap.data()?.ref;
  if (owner && owner !== expectedRef) {
    throw new Error(`PIN hash already claimed by ${owner} (wanted ${expectedRef})`);
  }
}

async function deleteLegacyAccounts() {
  for (const phoneId of LEGACY_PHONE_IDS) {
    const rosterRef = db.doc(`access_roster/${phoneId}`);
    const rosterSnap = await rosterRef.get();
    if (rosterSnap.exists) {
      const prevHash =
        typeof rosterSnap.data()?.pinHash === 'string' ? rosterSnap.data().pinHash : null;
      if (prevHash) {
        await db.doc(`pin_hashes/${prevHash}`).delete().catch(() => undefined);
      }
      await rosterRef.delete();
      console.log(`Removed legacy access_roster/${phoneId}`);
    }
    await db
      .doc(`users/u${phoneId}`)
      .delete()
      .catch(() => undefined);
  }
}

async function seedAccount({
  phone,
  phoneId,
  name,
  role,
  pin,
  groupId,
  assignedGroupIds,
}) {
  assertValidIndianE164(phone);
  const pinHash = hashPin(pin);
  const rosterRefPath = `access_roster/${phoneId}`;
  await releasePinHashIfOwned(pinHash, rosterRefPath);

  const now = admin.firestore.FieldValue.serverTimestamp();
  const rosterPayload = {
    phoneNumber: phone,
    name,
    role,
    status: 'active',
    pinHash,
    pinSetAt: now,
    updatedAt: now,
  };

  if (role === 'admin') {
    rosterPayload.assignedGroupIds = assignedGroupIds;
    rosterPayload.groupId = null;
  } else {
    rosterPayload.groupId = groupId;
    rosterPayload.assignedGroupIds = [];
  }

  await db.doc(rosterRefPath).set(rosterPayload, { merge: true });

  await db.doc(`pin_hashes/${pinHash}`).set(
    {
      kind: 'personal',
      ref: rosterRefPath,
      updatedAt: now,
    },
    { merge: true }
  );

  const uid = `u${phoneId}`;
  await db.doc(`users/${uid}`).set(
    {
      phoneNumber: phone,
      name,
      role,
      groupId: role === 'admin' ? null : groupId,
      assignedGroupIds: role === 'admin' ? assignedGroupIds : [],
      hasPersonalPin: true,
      whitelistKey: phoneId,
    },
    { merge: true }
  );

  return { uid, pin };
}

async function main() {
  const groupSnap = await db.doc(`groups/${EXISTING_GROUP_ID}`).get();
  if (!groupSnap.exists) {
    throw new Error(
      `Group ${EXISTING_GROUP_ID} does not exist. Set QA_GROUP_ID to an existing group id.`
    );
  }

  await deleteLegacyAccounts();

  const adminSeed = await seedAccount({
    phone: ADMIN_PHONE,
    phoneId: ADMIN_PHONE_ID,
    name: 'App Review Admin',
    role: 'admin',
    pin: ADMIN_PIN,
    groupId: null,
    assignedGroupIds: [EXISTING_GROUP_ID],
  });

  const memberSeed = await seedAccount({
    phone: MEMBER_PHONE,
    phoneId: MEMBER_PHONE_ID,
    name: 'App Review Member',
    role: 'user',
    pin: MEMBER_PIN,
    groupId: EXISTING_GROUP_ID,
    assignedGroupIds: [],
  });

  console.log(`Attached to existing group ${EXISTING_GROUP_ID} (no new group created)`);
  console.log(`Admin  ${ADMIN_PHONE} personal PIN ${ADMIN_PIN} (uid ${adminSeed.uid})`);
  console.log(`Member ${MEMBER_PHONE} personal PIN ${MEMBER_PIN} (uid ${memberSeed.uid})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
