import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

import { auth, db, functions } from '@/lib/firebase';
import type { UserDevice } from '@/types/device';

function toDate(value: unknown): Date | undefined {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return undefined;
}

function devicesCollection(uid: string) {
  return collection(db, 'users', uid, 'devices');
}

async function syncPushTokenIndexRemote(input: {
  deviceId: string;
  token?: string;
  enabled?: boolean;
  remove?: boolean;
}) {
  try {
    const callable = httpsCallable(functions, 'syncPushTokenIndex');
    await callable(input);
  } catch {
    // Index sync is best-effort; push still works via legacy fallback when empty.
  }
}

export async function fetchMyDevices(): Promise<UserDevice[]> {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    return [];
  }
  const snapshot = await getDocs(devicesCollection(uid));
  return snapshot.docs.map((entry) => {
    const data = entry.data();
    return {
      id: entry.id,
      token: String(data.token ?? ''),
      enabled: data.enabled !== false,
      platform: typeof data.platform === 'string' ? data.platform : undefined,
      updatedAt: toDate(data.updatedAt),
    };
  });
}

/** Register or refresh an Expo push token for the signed-in user. */
export async function upsertDeviceToken(input: {
  deviceId: string;
  token: string;
  platform?: string;
  enabled?: boolean;
}) {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('Sign in required.');
  }
  const enabled = input.enabled !== false;
  await setDoc(
    doc(db, 'users', uid, 'devices', input.deviceId),
    {
      token: input.token,
      platform: input.platform ?? null,
      enabled,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  await syncPushTokenIndexRemote({
    deviceId: input.deviceId,
    token: input.token,
    enabled,
  });
}

export async function setDeviceEnabled(deviceId: string, enabled: boolean) {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('Sign in required.');
  }
  await setDoc(
    doc(db, 'users', uid, 'devices', deviceId),
    {
      enabled,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  await syncPushTokenIndexRemote({ deviceId, enabled });
}

export async function removeDevice(deviceId: string) {
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('Sign in required.');
  }
  await deleteDoc(doc(db, 'users', uid, 'devices', deviceId));
  await syncPushTokenIndexRemote({ deviceId, remove: true });
}
