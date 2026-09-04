import { db } from './firebase-admin';
import { syncUserPushTokenIndex } from './push';

async function deleteSubcollection(uid: string, name: 'devices' | 'sessions') {
  const path = db.collection('users').doc(uid).collection(name);
  for (;;) {
    const snap = await path.limit(400).get();
    if (snap.empty) break;
    const batch = db.batch();
    for (const entry of snap.docs) {
      batch.delete(entry.ref);
    }
    await batch.commit();
    if (snap.size < 400) break;
  }
}

/** Permanently remove profile, device/session subcollections, and push token indexes. */
export async function deleteUserAccount(uid: string) {
  const userRef = db.collection('users').doc(uid);
  const devicesSnap = await userRef.collection('devices').get();

  await Promise.all(
    devicesSnap.docs.map((entry) =>
      syncUserPushTokenIndex({
        uid,
        deviceId: entry.id,
        remove: true,
      }).catch(() => undefined)
    )
  );

  await deleteSubcollection(uid, 'devices');
  await deleteSubcollection(uid, 'sessions');
  await userRef.delete();
}
