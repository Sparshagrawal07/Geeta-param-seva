import { FieldValue, type DocumentData } from 'firebase-admin/firestore';
import { HttpsError } from 'firebase-functions/v2/https';

import { db } from './firebase-admin';
import { getAccessRoster, phoneToRosterId } from './roster';

export type JoinApplicationStatus = 'pending' | 'rejected' | 'added';

const COLLECTION = 'join_applications';
const NAME_MAX_LENGTH = 80;
const RESUBMIT_COOLDOWN_MS = 10 * 60 * 1000;

function normalizeApplicationPhone(input: unknown): string {
  if (typeof input !== 'string') {
    throw new HttpsError('invalid-argument', 'Phone number is required.');
  }
  const compact = input.trim().replace(/[\s()-]/g, '');
  const withPlus = compact.startsWith('+') ? compact : `+${compact.replace(/\+/g, '')}`;
  if (!/^\+91[6-9]\d{9}$/.test(withPlus)) {
    throw new HttpsError('invalid-argument', 'Enter a valid 10-digit Indian mobile number.');
  }
  return withPlus;
}

export function normalizeJoinApplicantName(input: unknown): string {
  if (typeof input !== 'string') {
    throw new HttpsError('invalid-argument', 'Name is required.');
  }
  const name = input.trim().replace(/\s+/g, ' ');
  if (!name) {
    throw new HttpsError('invalid-argument', 'Name is required.');
  }
  if (name.length > NAME_MAX_LENGTH) {
    throw new HttpsError('invalid-argument', `Name must be at most ${NAME_MAX_LENGTH} characters.`);
  }
  return name;
}

function serializeApplication(id: string, data: DocumentData) {
  const toIso = (value: unknown) => {
    if (
      value &&
      typeof value === 'object' &&
      'toDate' in value &&
      typeof (value as { toDate: () => Date }).toDate === 'function'
    ) {
      return (value as { toDate: () => Date }).toDate().toISOString();
    }
    if (value instanceof Date) return value.toISOString();
    return null;
  };

  const statusRaw = String(data.status ?? 'pending');
  const status: JoinApplicationStatus =
    statusRaw === 'rejected' || statusRaw === 'added' ? statusRaw : 'pending';

  return {
    id,
    name: String(data.name ?? ''),
    phoneNumber: String(data.phoneNumber ?? ''),
    status,
    createdAt: toIso(data.createdAt),
    updatedAt: toIso(data.updatedAt),
    reviewedBy: typeof data.reviewedBy === 'string' ? data.reviewedBy : undefined,
    reviewedAt: toIso(data.reviewedAt),
  };
}

async function assertCallerIsAdmin(actorUid: string) {
  const snap = await db.collection('users').doc(actorUid).get();
  const data = snap.data();
  if (!data || (data.role !== 'admin' && data.role !== 'senior_admin')) {
    throw new HttpsError('permission-denied', 'Not allowed.');
  }
  return data;
}

/**
 * Public (signed-out) submit: name + phone → pending join application.
 */
export async function submitJoinApplicationCore(input: { name: unknown; phoneNumber: unknown }) {
  const name = normalizeJoinApplicantName(input.name);
  const phoneNumber = normalizeApplicationPhone(input.phoneNumber);
  const phoneId = phoneToRosterId(phoneNumber);

  const roster = await getAccessRoster(phoneId);
  if (roster && roster.status !== 'inactive') {
    throw new HttpsError(
      'already-exists',
      'This phone number is already on the community roster. Sign in with your PIN.'
    );
  }

  const ref = db.collection(COLLECTION).doc(phoneId);
  const existing = await ref.get();
  const previous = existing.data() ?? {};
  const previousStatus = String(previous.status ?? '');

  if (previousStatus === 'pending' && previous.updatedAt && typeof previous.updatedAt.toDate === 'function') {
    const updatedAt = previous.updatedAt.toDate() as Date;
    if (Date.now() - updatedAt.getTime() < RESUBMIT_COOLDOWN_MS) {
      throw new HttpsError(
        'resource-exhausted',
        'You already submitted an application recently. Please wait a few minutes before trying again.'
      );
    }
  }

  if (previousStatus === 'added') {
    throw new HttpsError(
      'already-exists',
      'This phone number was already approved. Ask an admin for the join PIN, then sign in.'
    );
  }

  const payload: Record<string, unknown> = {
    name,
    nameLower: name.toLowerCase(),
    phoneNumber,
    status: 'pending',
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (existing.exists) {
    payload.reviewedBy = FieldValue.delete();
    payload.reviewedAt = FieldValue.delete();
  } else {
    payload.createdAt = FieldValue.serverTimestamp();
  }

  await ref.set(payload, { merge: true });
  return { ok: true as const, id: phoneId, status: 'pending' as const };
}

export async function listJoinApplicationsCore(input: {
  actorUid: string;
  status?: 'pending' | 'rejected' | 'added' | 'all';
  pageSize?: number;
}) {
  await assertCallerIsAdmin(input.actorUid);
  const status = input.status ?? 'pending';
  const pageSize = Math.min(Math.max(Number(input.pageSize) || 50, 1), 100);

  const snap =
    status === 'all'
      ? await db.collection(COLLECTION).limit(Math.max(pageSize * 3, 100)).get()
      : await db.collection(COLLECTION).where('status', '==', status).limit(Math.max(pageSize * 3, 100)).get();

  const entries = snap.docs
    .map((doc) => serializeApplication(doc.id, doc.data()))
    .sort((a, b) => {
      const aTime = a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const bTime = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      return bTime - aTime;
    })
    .slice(0, pageSize);

  return { entries };
}

export async function rejectJoinApplicationCore(input: { actorUid: string; phoneNumber: unknown }) {
  await assertCallerIsAdmin(input.actorUid);
  const phoneNumber = normalizeApplicationPhone(input.phoneNumber);
  const phoneId = phoneToRosterId(phoneNumber);
  const ref = db.collection(COLLECTION).doc(phoneId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Application not found.');
  }
  if (snap.data()?.status === 'added') {
    throw new HttpsError('failed-precondition', 'This applicant is already on the community roster.');
  }

  await ref.set(
    {
      status: 'rejected',
      reviewedBy: input.actorUid,
      reviewedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return { ok: true as const, id: phoneId, status: 'rejected' as const };
}

/**
 * Called after roster upsert succeeds from Approve & Add to Community.
 */
export async function markJoinApplicationAddedCore(input: {
  actorUid: string;
  phoneNumber: unknown;
}) {
  await assertCallerIsAdmin(input.actorUid);
  const phoneNumber = normalizeApplicationPhone(input.phoneNumber);
  const phoneId = phoneToRosterId(phoneNumber);
  const ref = db.collection(COLLECTION).doc(phoneId);
  const snap = await ref.get();
  if (!snap.exists) {
    return { ok: true as const, id: phoneId, status: 'added' as const, missing: true as const };
  }

  await ref.set(
    {
      status: 'added',
      reviewedBy: input.actorUid,
      reviewedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  return { ok: true as const, id: phoneId, status: 'added' as const, missing: false as const };
}
