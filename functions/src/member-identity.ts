/**
 * One place that knows how a member can be addressed in Firestore.
 *
 * The same person is reachable through three ids:
 *  - `rosterId`    digits only, derived from the phone number (access_roster doc id)
 *  - `memberKey`   `u<digits>` — the phone-keyed doc id used by
 *                  member_practice_assignments / practice_completion_logs
 *  - `authUid`     the real Firebase Auth uid
 *
 * `memberKey` and `authUid` are identical for members created through the current
 * PIN flow, but they diverge for accounts that were created before the phone-keyed
 * id was adopted, or when an Auth user already existed for that phone number.
 * Writing to only one of the two makes a change invisible until the member signs
 * in again, so every roster / practice / report path resolves all of them and
 * writes to the whole alias set.
 */

import { db, adminAuth } from './firebase-admin';

/** A member should never have more than a couple of profile docs per phone number. */
const PHONE_LOOKUP_LIMIT = 10;

export function phoneToUid(phoneNumber: string): string {
  return `u${phoneNumber.replace(/\D/g, '')}`;
}

export function phoneToRosterId(phoneNumber: string): string {
  return phoneNumber.replace(/^\+/, '').replace(/\D/g, '');
}

export function isPhoneNumber(value: unknown): value is string {
  return typeof value === 'string' && /^\+[1-9]\d{7,14}$/.test(value.trim());
}

export interface MemberAliases {
  /** Best id to use for new writes / notifications (Auth uid when known). */
  uid: string;
  /** Stable phone-keyed id — always present when a phone number is known. */
  memberKey: string | null;
  /** Auth uid, or null when the member has never signed in. */
  authUid: string | null;
  phoneNumber: string | null;
  /** Every id this member may be stored under, primary first. */
  uids: string[];
}

function addUid(target: Set<string>, value: unknown) {
  if (typeof value === 'string' && value.trim()) target.add(value.trim());
}

/** Recover the phone number for any known member id, without throwing. */
async function readPhoneForUid(uid: string): Promise<string | null> {
  try {
    const snap = await db.collection('users').doc(uid).get();
    const phone = snap.data()?.phoneNumber;
    if (isPhoneNumber(phone)) return phone.trim();
  } catch (error) {
    console.warn('member_identity_profile_read_failed', { uid, error });
  }

  // Phone-keyed ids encode the number themselves, so no lookup is needed.
  if (uid.startsWith('u')) {
    const digits = uid.slice(1);
    if (/^[1-9]\d{7,14}$/.test(digits)) return `+${digits}`;
  }

  try {
    const authUser = await adminAuth.getUser(uid);
    if (isPhoneNumber(authUser.phoneNumber)) return String(authUser.phoneNumber).trim();
  } catch {
    // Not an Auth user (or not created yet) — fine.
  }

  return null;
}

/** Auth uid for a phone number, or null when the member has never signed in. */
export async function findAuthUidByPhone(phoneNumber: string): Promise<string | null> {
  try {
    const authUser = await adminAuth.getUserByPhoneNumber(phoneNumber);
    return authUser.uid;
  } catch {
    return null;
  }
}

/** Every `users` doc id that carries this phone number. */
export async function findUserDocIdsByPhone(phoneNumber: string): Promise<string[]> {
  try {
    const snap = await db
      .collection('users')
      .where('phoneNumber', '==', phoneNumber)
      .limit(PHONE_LOOKUP_LIMIT)
      .get();
    return snap.docs.map((doc) => doc.id);
  } catch (error) {
    console.warn('member_identity_phone_lookup_failed', { phoneNumber, error });
    return [];
  }
}

/**
 * Resolve every id a member may be stored under.
 * Accepts a uid and/or a phone number and never throws for a missing member —
 * an unresolvable target is reported by the caller.
 */
export async function resolveMemberAliases(input: {
  uid?: string | null;
  phoneNumber?: string | null;
}): Promise<MemberAliases> {
  const seedUid = typeof input.uid === 'string' ? input.uid.trim() : '';
  const seedPhone =
    typeof input.phoneNumber === 'string' && input.phoneNumber.trim()
      ? input.phoneNumber.trim()
      : null;

  const found = new Set<string>();
  addUid(found, seedUid);

  let phoneNumber = seedPhone;
  if (seedUid) {
    const profilePhone = await readPhoneForUid(seedUid);
    if (profilePhone) phoneNumber = phoneNumber ?? profilePhone;
  }

  const memberKey = phoneNumber ? phoneToUid(phoneNumber) : null;
  if (memberKey) addUid(found, memberKey);

  // Both lookups only need the phone number, so they run concurrently — this is
  // the difference between 3 and 2 round trips on every admin write.
  let authUid: string | null = null;
  if (phoneNumber) {
    const [resolvedAuthUid, userDocIds] = await Promise.all([
      findAuthUidByPhone(phoneNumber),
      findUserDocIdsByPhone(phoneNumber),
    ]);
    authUid = resolvedAuthUid;
    addUid(found, authUid);
    for (const id of userDocIds) addUid(found, id);
  }

  const all = [...found];
  if (all.length === 0) {
    return { uid: '', memberKey: null, authUid: null, phoneNumber: null, uids: [] };
  }

  // Prefer a real account id over the phone-keyed fallback so notifications and
  // push fan-out land on the device that actually belongs to this member.
  const realUids = memberKey ? all.filter((id) => id !== memberKey) : all;
  const primary =
    (authUid && realUids.includes(authUid) ? authUid : null) ??
    realUids[0] ??
    all[0]!;

  return {
    uid: primary,
    memberKey,
    authUid: authUid ?? (realUids[0] ?? null),
    phoneNumber,
    uids: [primary, ...all.filter((id) => id !== primary)],
  };
}
