import { FieldValue } from 'firebase-admin/firestore';

import { db } from './firebase-admin';

export type PinHashKind = 'personal' | 'join';

export async function isPinHashTaken(pinHash: string, ignoreRef?: string): Promise<boolean> {
  const snap = await db.collection('pin_hashes').doc(pinHash).get();
  if (!snap.exists) {
    return false;
  }
  const ref = typeof snap.data()?.ref === 'string' ? snap.data()!.ref : '';
  if (ignoreRef && ref === ignoreRef) {
    return false;
  }
  return true;
}

export async function claimPinHash(input: {
  pinHash: string;
  kind: PinHashKind;
  ref: string;
  previousHash?: string | null;
}) {
  const batch = db.batch();
  if (input.previousHash && input.previousHash !== input.pinHash) {
    batch.delete(db.collection('pin_hashes').doc(input.previousHash));
  }
  batch.set(db.collection('pin_hashes').doc(input.pinHash), {
    kind: input.kind,
    ref: input.ref,
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
}

export async function releasePinHash(pinHash: string | null | undefined) {
  if (!pinHash) return;
  await db.collection('pin_hashes').doc(pinHash).delete().catch(() => undefined);
}
