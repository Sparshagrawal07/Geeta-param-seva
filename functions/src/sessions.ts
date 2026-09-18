import { FieldValue } from 'firebase-admin/firestore';

import { adminAuth, db } from './firebase-admin';
import { syncUserPushTokenIndex } from './push';

/** Register this device as the sole active session; revoke others + refresh tokens. */
export async function registerSoleSession(input: {
  uid: string;
  deviceId: string;
  platform?: string;
}): Promise<{ sessionId: string }> {
  const deviceId = input.deviceId.trim();
  if (!deviceId) {
    throw new Error('deviceId is required');
  }

  const userRef = db.collection('users').doc(input.uid);
  const sessionsRef = userRef.collection('sessions');
  const devicesRef = userRef.collection('devices');

  const [sessionsSnap, devicesSnap] = await Promise.all([sessionsRef.get(), devicesRef.get()]);
  const batch = db.batch();
  const now = FieldValue.serverTimestamp();
  const revokedDeviceIds: string[] = [];
  let currentDeviceHadToken = false;
  let currentDeviceToken: string | undefined;

  for (const entry of sessionsSnap.docs) {
    if (entry.id === deviceId) continue;
    batch.set(entry.ref, { active: false, revokedAt: now }, { merge: true });
  }

  batch.set(
    sessionsRef.doc(deviceId),
    {
      deviceId,
      platform: input.platform ?? 'unknown',
      active: true,
      createdAt: now,
      lastSeenAt: now,
    },
    { merge: true }
  );

  for (const entry of devicesSnap.docs) {
    if (entry.id === deviceId) {
      const data = entry.data();
      currentDeviceHadToken = true;
      if (typeof data.token === 'string' && data.token.trim()) {
        currentDeviceToken = data.token.trim();
      }
      // Re-enable the signing-in device so fan-out is not stuck on enabled:false
      // while the client finishes (or fails) push registration.
      batch.set(entry.ref, { enabled: true, updatedAt: now }, { merge: true });
      continue;
    }
    batch.set(entry.ref, { enabled: false, updatedAt: now }, { merge: true });
    revokedDeviceIds.push(entry.id);
  }

  batch.set(
    userRef,
    {
      activeSessionId: deviceId,
      activeSessionUpdatedAt: now,
    },
    { merge: true }
  );

  await batch.commit();

  await Promise.all([
    ...revokedDeviceIds.map((id) =>
      syncUserPushTokenIndex({
        uid: input.uid,
        deviceId: id,
        enabled: false,
      })
    ),
    currentDeviceHadToken
      ? syncUserPushTokenIndex({
          uid: input.uid,
          deviceId,
          token: currentDeviceToken,
          enabled: true,
        })
      : Promise.resolve(),
  ]);

  await adminAuth.revokeRefreshTokens(input.uid);

  return { sessionId: deviceId };
}

/**
 * Force-sign-out every device for a user (e.g. roster deactivation).
 * Marks sessions inactive, disables devices/push, clears activeSessionId, revokes refresh tokens.
 */
export async function revokeAllUserSessions(uid: string): Promise<void> {
  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    try {
      await adminAuth.revokeRefreshTokens(uid);
    } catch {
      // User may not exist in Auth yet.
    }
    return;
  }

  const sessionsRef = userRef.collection('sessions');
  const devicesRef = userRef.collection('devices');
  const [sessionsSnap, devicesSnap] = await Promise.all([sessionsRef.get(), devicesRef.get()]);
  const batch = db.batch();
  const now = FieldValue.serverTimestamp();
  const deviceIds: string[] = [];

  for (const entry of sessionsSnap.docs) {
    batch.set(entry.ref, { active: false, revokedAt: now }, { merge: true });
  }

  for (const entry of devicesSnap.docs) {
    batch.set(entry.ref, { enabled: false, updatedAt: now }, { merge: true });
    deviceIds.push(entry.id);
  }

  batch.set(
    userRef,
    {
      activeSessionId: FieldValue.delete(),
      activeSessionUpdatedAt: now,
    },
    { merge: true }
  );

  await batch.commit();

  await Promise.all(
    deviceIds.map((id) =>
      syncUserPushTokenIndex({
        uid,
        deviceId: id,
        enabled: false,
      })
    )
  );

  try {
    await adminAuth.revokeRefreshTokens(uid);
  } catch {
    // Ignore if Auth user is missing.
  }
}

export function isSessionActive(data: Record<string, unknown> | undefined): boolean {
  return data?.active === true;
}
