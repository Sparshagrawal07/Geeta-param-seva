import { createHash, randomInt, timingSafeEqual } from 'crypto';

import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

import { adminAuth, db } from './firebase-admin';
import { claimPinHash, isPinHashTaken, releasePinHash } from './pin-hashes';
import { getAccessRoster } from './roster';

const PIN_MIN_LENGTH = 4;
const PIN_MAX_LENGTH = 8;
const JOIN_PIN_TTL_MS = 72 * 60 * 60 * 1000;

export function normalizePin(pin: unknown): string {
  if (typeof pin !== 'string') {
    return '';
  }
  return pin.replace(/\D/g, '');
}

export function assertValidPin(pin: string) {
  if (pin.length < PIN_MIN_LENGTH || pin.length > PIN_MAX_LENGTH) {
    throw new HttpsError(
      'invalid-argument',
      `PIN must be ${PIN_MIN_LENGTH}–${PIN_MAX_LENGTH} digits.`
    );
  }
}

export function hashPin(pin: string): string {
  return createHash('sha256').update(`gps-pin:${pin}`).digest('hex');
}

export function pinsMatch(pin: string, pinHash: string | undefined): boolean {
  if (!pinHash || typeof pinHash !== 'string') {
    return false;
  }
  const next = Buffer.from(hashPin(pin), 'utf8');
  const prev = Buffer.from(pinHash, 'utf8');
  if (next.length !== prev.length) {
    return false;
  }
  return timingSafeEqual(next, prev);
}

export function phoneToUid(phoneNumber: string): string {
  const digits = phoneNumber.replace(/\D/g, '');
  return `u${digits}`;
}

export function normalizeE164Phone(input: unknown): string {
  if (typeof input !== 'string') {
    throw new HttpsError('invalid-argument', 'Phone number is required.');
  }
  const compact = input.trim().replace(/[\s()-]/g, '');
  const withPlus = compact.startsWith('+') ? compact : `+${compact.replace(/\+/g, '')}`;
  if (!/^\+[1-9]\d{7,14}$/.test(withPlus)) {
    throw new HttpsError('invalid-argument', 'Enter a valid mobile number.');
  }
  return withPlus;
}

export async function ensureAuthUser(input: {
  preferredUid: string;
  phoneNumber: string;
  displayName?: string;
}): Promise<string> {
  try {
    const byPhone = await adminAuth.getUserByPhoneNumber(input.phoneNumber);
    await adminAuth.updateUser(byPhone.uid, {
      displayName: input.displayName || byPhone.displayName || undefined,
    });
    return byPhone.uid;
  } catch {
    // No Auth user for this phone yet.
  }

  try {
    await adminAuth.getUser(input.preferredUid);
    await adminAuth.updateUser(input.preferredUid, {
      phoneNumber: input.phoneNumber,
      displayName: input.displayName || undefined,
    });
    return input.preferredUid;
  } catch {
    // Preferred uid not found either.
  }

  try {
    await adminAuth.createUser({
      uid: input.preferredUid,
      phoneNumber: input.phoneNumber,
      displayName: input.displayName || undefined,
    });
    return input.preferredUid;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/phone.*already|already.*phone|exists/i.test(message)) {
      const byPhone = await adminAuth.getUserByPhoneNumber(input.phoneNumber);
      return byPhone.uid;
    }
    throw error;
  }
}

export type ResolvedLogin =
  | {
      role: 'senior_admin';
      name: string;
      phoneNumber: string;
      groupId: null;
      assignedGroupIds: string[];
      needsPersonalPin: boolean;
    }
  | {
      role: 'admin';
      name: string;
      phoneNumber: string;
      groupId: null;
      assignedGroupIds: string[];
      matchedGroupId: string | null;
      needsPersonalPin: boolean;
    }
  | {
      role: 'user';
      name: string;
      phoneNumber: string;
      groupId: string;
      assignedGroupIds: string[];
      needsPersonalPin: false;
    };

function joinPinExpiry(data: Record<string, unknown> | undefined): Date | null {
  const raw = data?.expiresAt;
  if (raw instanceof Timestamp) {
    return raw.toDate();
  }
  if (raw && typeof raw === 'object' && 'toDate' in raw && typeof (raw as { toDate: () => Date }).toDate === 'function') {
    return (raw as { toDate: () => Date }).toDate();
  }
  // Missing expiresAt = expired (legacy permanent pins no longer valid).
  return null;
}

function isJoinPinUnexpired(data: Record<string, unknown> | undefined): boolean {
  const expires = joinPinExpiry(data);
  if (!expires) return false;
  return expires.getTime() > Date.now();
}

/**
 * Match pin against allowed group join PINs.
 * Throws JOIN_PIN_EXPIRED if hash matches but expired.
 */
async function findMatchingJoinPin(
  pin: string,
  allowedGroupIds: string[]
): Promise<{ id: string } | null> {
  if (allowedGroupIds.length === 0) {
    return null;
  }

  const snaps = await Promise.all(
    allowedGroupIds.map((groupId) => db.collection('group_pins').doc(groupId).get())
  );

  let matchedExpired = false;
  for (const snap of snaps) {
    const data = snap.data() as Record<string, unknown> | undefined;
    if (!pinsMatch(pin, typeof data?.pinHash === 'string' ? data.pinHash : undefined)) {
      continue;
    }
    if (!isJoinPinUnexpired(data)) {
      matchedExpired = true;
      continue;
    }
    return { id: snap.id };
  }

  if (matchedExpired) {
    throw new HttpsError('failed-precondition', 'JOIN_PIN_EXPIRED');
  }
  return null;
}

export async function resolveLogin(phoneNumber: string, pin: string): Promise<ResolvedLogin> {
  const phoneId = phoneNumber.replace(/^\+/, '');

  // 1) Senior personal PIN only.
  const seniorSnap = await db.collection('senior_admins').doc(phoneId).get();
  if (seniorSnap.exists) {
    const data = seniorSnap.data() ?? {};
    const seniorHash = typeof data.pinHash === 'string' ? data.pinHash : undefined;
    if (pinsMatch(pin, seniorHash)) {
      return {
        role: 'senior_admin',
        name: typeof data.name === 'string' ? data.name : '',
        phoneNumber,
        groupId: null,
        assignedGroupIds: [],
        needsPersonalPin: !seniorHash,
      };
    }
    // Senior phone with wrong PIN — do not fall through to join PIN.
    throw new HttpsError('permission-denied', 'Incorrect phone number or PIN.');
  }

  const roster = await getAccessRoster(phoneId);
  if (!roster) {
    throw new HttpsError('permission-denied', 'Incorrect phone number or PIN.');
  }
  if (roster.status !== 'active') {
    throw new HttpsError('permission-denied', 'This account is inactive. Contact an admin.');
  }

  const rosterRole = roster.role === 'admin' ? 'admin' : 'user';
  const name = typeof roster.name === 'string' ? roster.name : '';
  const personalHash = typeof roster.pinHash === 'string' ? roster.pinHash : undefined;

  // 2) Admin with personal PIN — join PIN never accepted.
  if (rosterRole === 'admin' && personalHash) {
    if (pinsMatch(pin, personalHash)) {
      const assignedGroupIds = Array.isArray(roster.assignedGroupIds)
        ? roster.assignedGroupIds.map(String)
        : [];
      return {
        role: 'admin',
        name,
        phoneNumber,
        groupId: null,
        assignedGroupIds,
        matchedGroupId: null,
        needsPersonalPin: false,
      };
    }
    throw new HttpsError('permission-denied', 'Incorrect phone number or PIN.');
  }

  // 3) Admin first login — must already be roster admin; join PIN of assigned group.
  if (rosterRole === 'admin' && !personalHash) {
    const assignedGroupIds = Array.isArray(roster.assignedGroupIds)
      ? roster.assignedGroupIds.map(String)
      : [];
    if (assignedGroupIds.length === 0) {
      throw new HttpsError('permission-denied', 'No groups assigned. Contact a senior admin.');
    }
    const matched = await findMatchingJoinPin(pin, assignedGroupIds);
    if (!matched) {
      throw new HttpsError('permission-denied', 'Incorrect phone number or PIN.');
    }
    return {
      role: 'admin',
      name,
      phoneNumber,
      groupId: null,
      assignedGroupIds,
      matchedGroupId: matched.id,
      needsPersonalPin: true,
    };
  }

  // 4) Member with personal PIN (seeded / App Review demos) — join PIN never accepted.
  if (rosterRole === 'user' && personalHash) {
    const groupId = typeof roster.groupId === 'string' ? roster.groupId : '';
    if (!groupId) {
      throw new HttpsError('permission-denied', 'No group assigned. Contact an admin.');
    }
    if (pinsMatch(pin, personalHash)) {
      return {
        role: 'user',
        name,
        phoneNumber,
        groupId,
        assignedGroupIds: [],
        needsPersonalPin: false,
      };
    }
    throw new HttpsError('permission-denied', 'Incorrect phone number or PIN.');
  }

  // 5) Member — join PIN only; never elevates to admin.
  const groupId = typeof roster.groupId === 'string' ? roster.groupId : '';
  if (!groupId) {
    throw new HttpsError('permission-denied', 'No group assigned. Contact an admin.');
  }
  const matched = await findMatchingJoinPin(pin, [groupId]);
  if (!matched) {
    throw new HttpsError('permission-denied', 'Incorrect phone number or PIN.');
  }
  return {
    role: 'user',
    name,
    phoneNumber,
    groupId,
    assignedGroupIds: [],
    needsPersonalPin: false,
  };
}

export async function upsertProfileFromLogin(uid: string, login: ResolvedLogin) {
  const ref = db.collection('users').doc(uid);
  const existing = await ref.get();
  const existingData = existing.data() ?? {};

  const payload: Record<string, unknown> = {
    phoneNumber: login.phoneNumber,
    name:
      (typeof existingData.name === 'string' && existingData.name.trim()) ||
      login.name ||
      '',
    role: login.role,
    hasPersonalPin: login.role === 'user' ? false : !login.needsPersonalPin,
  };

  if (login.role === 'senior_admin') {
    payload.seniorAdminKey = login.phoneNumber.replace(/^\+/, '');
    payload.groupId = null;
    payload.assignedGroupIds = [];
  } else if (login.role === 'admin') {
    payload.whitelistKey = login.phoneNumber.replace(/^\+/, '');
    payload.groupId = null;
    payload.assignedGroupIds = login.assignedGroupIds;
  } else {
    payload.groupId = login.groupId;
    payload.assignedGroupIds = [];
  }

  await ref.set(payload, { merge: true });
}

export async function generateUniqueJoinPinPlaintext(): Promise<{ pin: string; pinHash: string }> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const pin = String(randomInt(100000, 1000000));
    const pinHash = hashPin(pin);
    if (!(await isPinHashTaken(pinHash))) {
      return { pin, pinHash };
    }
  }
  throw new HttpsError('resource-exhausted', 'Could not generate a unique PIN. Try again.');
}

export async function writeGroupJoinPin(input: {
  groupId: string;
  actorUid: string;
  pinHash: string;
}): Promise<{ expiresAt: Date }> {
  const groupRef = db.collection('groups').doc(input.groupId);
  const pinRef = db.collection('group_pins').doc(input.groupId);
  const existing = await pinRef.get();
  const previousHash =
    existing.exists && typeof existing.data()?.pinHash === 'string'
      ? String(existing.data()!.pinHash)
      : null;

  const expiresAt = new Date(Date.now() + JOIN_PIN_TTL_MS);
  await claimPinHash({
    pinHash: input.pinHash,
    kind: 'join',
    ref: `group_pins/${input.groupId}`,
    previousHash,
  });

  await Promise.all([
    pinRef.set(
      {
        pinHash: input.pinHash,
        expiresAt: Timestamp.fromDate(expiresAt),
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: input.actorUid,
        createdAt: existing.exists ? existing.data()?.createdAt ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
      },
      { merge: true }
    ),
    groupRef.update({
      hasPin: true,
      pinExpiresAt: Timestamp.fromDate(expiresAt),
      pinUpdatedAt: FieldValue.serverTimestamp(),
    }),
  ]);

  return { expiresAt };
}

export async function setPersonalPinForUser(input: {
  uid: string;
  pin: string;
}): Promise<void> {
  assertValidPin(input.pin);
  const pinHash = hashPin(input.pin);
  const userSnap = await db.collection('users').doc(input.uid).get();
  const userData = userSnap.data();
  if (!userData) {
    throw new HttpsError('permission-denied', 'Not allowed.');
  }

  const role = userData.role;
  const phoneNumber = typeof userData.phoneNumber === 'string' ? userData.phoneNumber : '';
  const phoneId = phoneNumber.replace(/^\+/, '');
  if (!phoneId) {
    throw new HttpsError('failed-precondition', 'Phone number missing on profile.');
  }

  if (await isPinHashTaken(pinHash, role === 'senior_admin' ? `senior_admins/${phoneId}` : `access_roster/${phoneId}`)) {
    throw new HttpsError('already-exists', 'This PIN is already in use. Choose another.');
  }

  if (role === 'senior_admin') {
    const seniorRef = db.collection('senior_admins').doc(phoneId);
    const seniorSnap = await seniorRef.get();
    const previousHash =
      seniorSnap.exists && typeof seniorSnap.data()?.pinHash === 'string'
        ? String(seniorSnap.data()!.pinHash)
        : null;
    await claimPinHash({
      pinHash,
      kind: 'personal',
      ref: `senior_admins/${phoneId}`,
      previousHash,
    });
    await seniorRef.set(
      {
        pinHash,
        pinSetAt: FieldValue.serverTimestamp(),
        phoneNumber,
      },
      { merge: true }
    );
  } else if (role === 'admin') {
    const rosterRef = db.collection('access_roster').doc(phoneId);
    const rosterSnap = await rosterRef.get();
    if (!rosterSnap.exists || rosterSnap.data()?.role !== 'admin') {
      throw new HttpsError('permission-denied', 'Admin roster entry required.');
    }
    const previousHash =
      typeof rosterSnap.data()?.pinHash === 'string' ? String(rosterSnap.data()!.pinHash) : null;
    await claimPinHash({
      pinHash,
      kind: 'personal',
      ref: `access_roster/${phoneId}`,
      previousHash,
    });
    await rosterRef.set(
      {
        pinHash,
        pinSetAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  } else {
    throw new HttpsError('permission-denied', 'Only admins and senior admins set a personal PIN.');
  }

  await db.collection('users').doc(input.uid).set(
    {
      hasPersonalPin: true,
    },
    { merge: true }
  );
}

export { releasePinHash, JOIN_PIN_TTL_MS };
