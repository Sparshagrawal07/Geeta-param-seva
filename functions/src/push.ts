/**
 * Cost-efficient group push token index.
 * Tokens are mirrored at groups/{groupId}/push_tokens/{deviceId}
 * so fan-out is one collection read instead of N user + N device reads.
 */

import { FieldValue } from 'firebase-admin/firestore';

import { db } from './firebase-admin';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
/** Bumped when channel sound/importance must change (Android channels are immutable). */
export const ANDROID_CHANNEL_ID = 'community-reminders-v4';
export const SOUND_FILENAME = 'community_reminder.wav';

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  sound?: string;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
  /** iOS Focus / Lock Screen urgency — requires Time Sensitive capability for full effect. */
  interruptionLevel?: 'active' | 'critical' | 'passive' | 'timeSensitive';
  data?: Record<string, unknown>;
}

export type ExpoPushResult = {
  sent: number;
  ticketErrors: Array<{ token: string; message: string }>;
};

function isExpoPushToken(token: string): boolean {
  return token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[');
}

function readToken(data: Record<string, unknown>): string {
  const token = typeof data.token === 'string' ? data.token.trim() : '';
  return isExpoPushToken(token) ? token : '';
}

/**
 * A device is pushable when explicitly enabled, or when it is the user's sole
 * active session (enabled can lag false after PIN re-login / account switch).
 */
function isDevicePushable(
  data: Record<string, unknown>,
  deviceId: string,
  activeSessionId: string | undefined
): boolean {
  if (data.enabled === false) {
    return Boolean(activeSessionId && deviceId === activeSessionId);
  }
  return true;
}

export async function collectGroupPushTokens(groupId: string): Promise<string[]> {
  const tokens = new Set<string>();
  const snap = await db.collection('groups').doc(groupId).collection('push_tokens').get();

  // Only resolve activeSessionId for tokens with enabled:false (avoids N user reads).
  const needsSessionCheck = new Set<string>();
  for (const entry of snap.docs) {
    const data = entry.data();
    if (data.enabled === false && typeof data.uid === 'string' && data.uid) {
      needsSessionCheck.add(data.uid);
    }
  }
  const activeByUid = new Map<string, string>();
  if (needsSessionCheck.size > 0) {
    const userSnaps = await Promise.all(
      [...needsSessionCheck].map((uid) => db.collection('users').doc(uid).get())
    );
    for (const userSnap of userSnaps) {
      const active = userSnap.data()?.activeSessionId;
      if (typeof active === 'string' && active) {
        activeByUid.set(userSnap.id, active);
      }
    }
  }

  for (const entry of snap.docs) {
    const data = entry.data();
    const uid = typeof data.uid === 'string' ? data.uid : '';
    if (!isDevicePushable(data, entry.id, activeByUid.get(uid))) continue;
    const token = readToken(data);
    if (token) tokens.add(token);
  }

  // Union legacy when the index yields nothing usable.
  if (tokens.size === 0) {
    for (const token of await collectGroupPushTokensLegacy(groupId)) {
      tokens.add(token);
    }
  }

  return [...tokens];
}

/** Legacy path: walk users + devices (expensive). Used when index has no enabled tokens. */
async function collectGroupPushTokensLegacy(groupId: string): Promise<string[]> {
  const tokens = new Set<string>();
  const [memberSnap, adminSnap] = await Promise.all([
    db.collection('users').where('groupId', '==', groupId).get(),
    db.collection('users').where('assignedGroupIds', 'array-contains', groupId).get(),
  ]);

  const users = new Map<string, Record<string, unknown>>();
  for (const doc of memberSnap.docs) users.set(doc.id, doc.data() ?? {});
  for (const doc of adminSnap.docs) users.set(doc.id, doc.data() ?? {});

  const deviceSnaps = await Promise.all(
    [...users.keys()].map((uid) => db.collection('users').doc(uid).collection('devices').get())
  );

  let index = 0;
  for (const uid of users.keys()) {
    const profile = users.get(uid) ?? {};
    const activeSessionId =
      typeof profile.activeSessionId === 'string' ? profile.activeSessionId : undefined;
    const devices = deviceSnaps[index++];
    for (const device of devices.docs) {
      const data = device.data();
      if (!isDevicePushable(data, device.id, activeSessionId)) continue;
      const token = readToken(data);
      if (token) tokens.add(token);
    }
  }

  return [...tokens];
}

/** Collect push tokens for a single user (devices + group index entries). */
export async function collectUserPushTokens(uid: string, groupId?: string): Promise<string[]> {
  const tokens = new Set<string>();

  const userSnap = await db.collection('users').doc(uid).get();
  const profile = userSnap.data() ?? {};
  const activeSessionId =
    typeof profile.activeSessionId === 'string' ? profile.activeSessionId : undefined;

  const devicesSnap = await db.collection('users').doc(uid).collection('devices').get();
  for (const device of devicesSnap.docs) {
    const data = device.data();
    if (!isDevicePushable(data, device.id, activeSessionId)) continue;
    const token = readToken(data);
    if (token) tokens.add(token);
  }

  // Prefer devices subcollection. Only hit the group index when devices yielded nothing.
  if (tokens.size > 0) {
    return [...tokens];
  }

  const resolvedGroupId =
    groupId || (typeof profile.groupId === 'string' ? profile.groupId : undefined);
  if (resolvedGroupId) {
    const indexSnap = await db
      .collection('groups')
      .doc(resolvedGroupId)
      .collection('push_tokens')
      .where('uid', '==', uid)
      .get();
    for (const entry of indexSnap.docs) {
      const data = entry.data();
      if (!isDevicePushable(data, entry.id, activeSessionId)) continue;
      const token = readToken(data);
      if (token) tokens.add(token);
    }
  }

  return [...tokens];
}

export async function sendUserPracticePush(input: {
  uid: string;
  groupId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}) {
  const tokens = await collectUserPushTokens(input.uid, input.groupId);
  if (tokens.length === 0) {
    console.warn('sendUserPracticePush_no_tokens', { uid: input.uid, groupId: input.groupId });
    return { sent: 0, tokenCount: 0, ticketErrors: [] as Array<{ token: string; message: string }> };
  }

  const messages: ExpoPushMessage[] = tokens.map((to) => ({
    to,
    title: input.title,
    body: input.body,
    sound: SOUND_FILENAME,
    channelId: ANDROID_CHANNEL_ID,
    priority: 'high',
    data: {
      groupId: input.groupId,
      uid: input.uid,
      screen: 'practice',
      ...(input.data ?? {}),
    },
  }));

  const result = await sendExpoPush(messages);
  return { ...result, tokenCount: tokens.length };
}

/** Sync a device token into each group the user belongs to. */
export async function syncUserPushTokenIndex(input: {
  uid: string;
  deviceId: string;
  token?: string | null;
  enabled?: boolean;
  remove?: boolean;
}) {
  const userSnap = await db.collection('users').doc(input.uid).get();
  const data = userSnap.data() ?? {};
  const groupIds = new Set<string>();
  if (typeof data.groupId === 'string' && data.groupId) {
    groupIds.add(data.groupId);
  }
  if (Array.isArray(data.assignedGroupIds)) {
    for (const id of data.assignedGroupIds) {
      if (typeof id === 'string' && id) groupIds.add(id);
    }
  }
  if (groupIds.size === 0) return;

  const batch = db.batch();
  for (const groupId of groupIds) {
    const ref = db.collection('groups').doc(groupId).collection('push_tokens').doc(input.deviceId);
    if (input.remove) {
      batch.delete(ref);
      continue;
    }
    const payload: Record<string, unknown> = {
      uid: input.uid,
      deviceId: input.deviceId,
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (typeof input.token === 'string') payload.token = input.token;
    if (typeof input.enabled === 'boolean') payload.enabled = input.enabled;
    batch.set(ref, payload, { merge: true });
  }
  await batch.commit();
}

export async function sendExpoPush(messages: ExpoPushMessage[]): Promise<ExpoPushResult> {
  if (messages.length === 0) {
    return { sent: 0, ticketErrors: [] };
  }

  const chunks: ExpoPushMessage[][] = [];
  for (let i = 0; i < messages.length; i += 100) {
    chunks.push(messages.slice(i, i + 100));
  }

  const ticketErrors: Array<{ token: string; message: string }> = [];
  let sent = 0;

  for (const chunk of chunks) {
    const payload = chunk.map((msg) => ({
      to: msg.to,
      title: msg.title,
      body: msg.body,
      // iOS plays this custom file; Android uses the notification channel sound.
      sound: msg.sound ?? SOUND_FILENAME,
      channelId: msg.channelId ?? ANDROID_CHANNEL_ID,
      priority: msg.priority ?? 'high',
      interruptionLevel: msg.interruptionLevel ?? 'timeSensitive',
      data: msg.data ?? {},
    }));

    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Expo push failed (${response.status}): ${text}`);
    }

    let parsed: { data?: Array<{ status?: string; message?: string; details?: { error?: string } }> };
    try {
      parsed = JSON.parse(text) as typeof parsed;
    } catch {
      throw new Error(`Expo push returned non-JSON body: ${text.slice(0, 500)}`);
    }

    const tickets = Array.isArray(parsed.data) ? parsed.data : [];
    for (let i = 0; i < tickets.length; i += 1) {
      const ticket = tickets[i];
      const token = chunk[i]?.to ?? '';
      if (ticket?.status === 'ok') {
        sent += 1;
        continue;
      }
      const message =
        ticket?.message ||
        ticket?.details?.error ||
        (ticket?.status ? `status=${ticket.status}` : 'unknown Expo ticket error');
      ticketErrors.push({ token, message });
      console.error('expo_push_ticket_error', { token: token.slice(0, 48), message });
    }

    // If Expo omitted tickets, count the HTTP-accepted chunk as sent (legacy behavior).
    if (tickets.length === 0) {
      sent += chunk.length;
    }
  }

  return { sent, ticketErrors };
}

export async function sendGroupCommunityPush(input: {
  groupId: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  notificationId?: string;
  /** Deep-link target; defaults to alerts. Use `feed` for seva/announcement. */
  screen?: string;
}) {
  const tokens = await collectGroupPushTokens(input.groupId);
  if (tokens.length === 0) {
    console.warn('sendGroupCommunityPush_no_tokens', { groupId: input.groupId });
  }

  const screen =
    (typeof input.data?.screen === 'string' && input.data.screen.trim()) ||
    input.screen?.trim() ||
    'alerts';

  const messages: ExpoPushMessage[] = tokens.map((to) => ({
    to,
    title: input.title,
    body: input.body,
    sound: SOUND_FILENAME,
    channelId: ANDROID_CHANNEL_ID,
    priority: 'high',
    data: {
      groupId: input.groupId,
      screen,
      ...(input.notificationId ? { notificationId: input.notificationId } : {}),
      ...(input.data ?? {}),
    },
  }));

  const result = await sendExpoPush(messages);

  if (input.notificationId) {
    await db.collection('notification_deliveries').add({
      notificationId: input.notificationId,
      groupId: input.groupId,
      pushSent: result.sent,
      tokenCount: tokens.length,
      ticketErrorCount: result.ticketErrors.length,
      ticketErrors: result.ticketErrors.slice(0, 10),
      createdAt: FieldValue.serverTimestamp(),
    });
  }

  if (result.ticketErrors.length > 0) {
    console.error('sendGroupCommunityPush_ticket_errors', {
      groupId: input.groupId,
      tokenCount: tokens.length,
      sent: result.sent,
      errors: result.ticketErrors.slice(0, 5),
    });
  }

  return { ...result, tokenCount: tokens.length };
}

/** Create an in-app notification row and fan out a mobile push banner. */
export async function createAndPushGroupNotification(input: {
  groupId: string;
  title: string;
  body: string;
  type?: string;
  data?: Record<string, unknown>;
  screen?: string;
  /**
   * When set (e.g. `post_{postId}`), create-or-skip so callable + Firestore
   * trigger can both invoke without double-pushing members.
   */
  idempotencyKey?: string;
}) {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title || !body) {
    throw new Error('Title and message are both required.');
  }

  const type = input.type?.trim() || 'reminder';
  const screen =
    (typeof input.data?.screen === 'string' && input.data.screen.trim()) ||
    input.screen?.trim() ||
    (type === 'seva' || type === 'announcement' ? 'feed' : 'alerts');

  const idempotencyKey = input.idempotencyKey?.trim();
  const notifRef = idempotencyKey
    ? db.collection('notifications').doc(idempotencyKey)
    : db.collection('notifications').doc();

  const payload = {
    groupId: input.groupId,
    title,
    body,
    type,
    createdAt: FieldValue.serverTimestamp(),
    ...(input.data?.postId ? { postId: String(input.data.postId) } : {}),
  };

  if (idempotencyKey) {
    try {
      // Atomic create — callable and Firestore trigger can race safely.
      await notifRef.create(payload);
    } catch (error) {
      const code =
        typeof error === 'object' && error && 'code' in error
          ? String((error as { code?: unknown }).code)
          : '';
      if (code === '6' || code === 'already-exists' || /ALREADY_EXISTS/i.test(String(error))) {
        return {
          id: notifRef.id,
          groupId: input.groupId,
          title,
          body,
          pushSent: 0,
          tokenCount: 0,
          alreadyNotified: true as const,
        };
      }
      throw error;
    }
  } else {
    await notifRef.set(payload);
  }

  const push = await sendGroupCommunityPush({
    groupId: input.groupId,
    title,
    body,
    notificationId: notifRef.id,
    screen,
    data: {
      type,
      screen,
      ...(input.data ?? {}),
    },
  });

  return {
    id: notifRef.id,
    groupId: input.groupId,
    title,
    body,
    pushSent: push.sent,
    tokenCount: push.tokenCount,
    ticketErrorCount: push.ticketErrors.length,
  };
}
