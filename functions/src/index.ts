import { setGlobalOptions } from 'firebase-functions/v2';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

import {
  cleanupExpiredBackendRecords,
  wipeDailyFeedContent,
} from './feed-cleanup';
import {
  notifyCommunityPostPublishedCore,
  type CommunityPostNotifyType,
} from './feed-notify';
import { adminAuth, db } from './firebase-admin';
import { enforceAppCheck } from './env';
import {
  assertValidPin,
  ensureAuthUser,
  generateUniqueJoinPinPlaintext,
  normalizeE164Phone,
  normalizePin,
  phoneToUid,
  resolveLogin,
  setPersonalPinForUser,
  upsertProfileFromLogin,
  writeGroupJoinPin,
} from './pin-auth';
import { registerSoleSession } from './sessions';
import {
  deactivateAccessRosterEntry,
  listAccessRosterCore,
  migrateWhitelistToRoster as runMigrateWhitelistToRoster,
  upsertAccessRosterEntry,
} from './roster';
import { deleteUserAccount } from './users';
import { syncUserPushTokenIndex } from './push';
import {
  getMyPracticeTodayCore,
  getPracticeAdminOverviewCore,
  markPracticeItemCompleteCore,
  markAllPracticeCompleteCore,
  sendPracticeReminderCore,
  syncPracticeAssignmentToAuthUid,
  setMemberPracticeAssignmentCore,
} from './practice';
import {
  getPracticeMonthlyReportCore,
  notifyPracticeMonthlyReportCore,
} from './practice-report';
import {
  listJoinApplicationsCore,
  markJoinApplicationAddedCore,
  rejectJoinApplicationCore,
  submitJoinApplicationCore,
} from './join-applications';

const region = 'asia-south1';

/**
 * asia-south1 Cloud Run CPU quota is tight. Gen2 defaults to 1 vCPU each, and
 * a full deploy health-checks new revisions while old ones still run — that
 * doubles CPU and hits "Quota exceeded for total allowable CPU per project per region".
 * `gcf_gen1` keeps fractional CPU (1st-gen style) so batch deploys fit the quota.
 */
setGlobalOptions({
  region,
  cpu: 'gcf_gen1',
});

const callableOptions = {
  region,
  enforceAppCheck: enforceAppCheck(),
};

function toHttpsError(error: unknown) {
  if (error instanceof HttpsError) {
    return error;
  }
  const message = error instanceof Error ? error.message : 'Something went wrong.';
  if (message === 'JOIN_PIN_EXPIRED') {
    return new HttpsError('failed-precondition', 'JOIN_PIN_EXPIRED');
  }
  if (/phone.*already|already.*exists/i.test(message)) {
    return new HttpsError(
      'already-exists',
      'This phone number is already linked to an account. Please try again.'
    );
  }
  return new HttpsError('internal', message);
}

async function assertCanManageGroup(uid: string, groupId: string) {
  const snap = await db.collection('users').doc(uid).get();
  const data = snap.data();
  if (!data) {
    throw new HttpsError('permission-denied', 'Not allowed.');
  }
  if (data.role === 'senior_admin') {
    return;
  }
  if (data.role === 'admin') {
    const assigned = Array.isArray(data.assignedGroupIds) ? data.assignedGroupIds.map(String) : [];
    if (assigned.includes(groupId)) {
      return;
    }
  }
  throw new HttpsError('permission-denied', 'Not allowed for this group.');
}

/** Phone + PIN → Firebase custom token (no SMS / reCAPTCHA). */
export const signInWithGroupPin = onCall(callableOptions, async (request) => {
  try {
    const phoneNumber = normalizeE164Phone(request.data?.phoneNumber);
    const pin = normalizePin(request.data?.pin);
    assertValidPin(pin);
    const deviceId =
      typeof request.data?.deviceId === 'string' ? request.data.deviceId.trim() : '';
    if (!deviceId) {
      throw new HttpsError('invalid-argument', 'Device id is required.');
    }
    const platform =
      typeof request.data?.platform === 'string' ? request.data.platform.trim() : 'unknown';

    const login = await resolveLogin(phoneNumber, pin);
    const preferredUid = phoneToUid(phoneNumber);

    const uid = await ensureAuthUser({
      preferredUid,
      phoneNumber,
      displayName: login.name || undefined,
    });
    await upsertProfileFromLogin(uid, login);
    await syncPracticeAssignmentToAuthUid({ uid, phoneNumber });
    await registerSoleSession({ uid, deviceId, platform });

    const token = await adminAuth.createCustomToken(uid);
    return {
      token,
      role: login.role,
      phoneNumber,
      groupId: login.role === 'user' ? login.groupId : null,
      needsPersonalPin: login.needsPersonalPin,
      sessionId: deviceId,
    };
  } catch (error) {
    throw toHttpsError(error);
  }
});

/** Auto-generate a 24h group join PIN (shown once to the caller). */
export const generateGroupJoinPin = onCall(callableOptions, async (request) => {
  try {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const groupId = typeof request.data?.groupId === 'string' ? request.data.groupId.trim() : '';
    if (!groupId) {
      throw new HttpsError('invalid-argument', 'Group is required.');
    }
    await assertCanManageGroup(request.auth.uid, groupId);

    const groupRef = db.collection('groups').doc(groupId);
    const snap = await groupRef.get();
    if (!snap.exists) {
      throw new HttpsError('not-found', 'Group not found.');
    }

    const { pin, pinHash } = await generateUniqueJoinPinPlaintext();
    const { expiresAt } = await writeGroupJoinPin({
      groupId,
      actorUid: request.auth.uid,
      pinHash,
    });

    return {
      pin,
      expiresAt: expiresAt.toISOString(),
    };
  } catch (error) {
    throw toHttpsError(error);
  }
});

/** Admin / senior sets or rotates their personal PIN (join PIN stops working for admins). */
export const setPersonalPin = onCall(callableOptions, async (request) => {
  try {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const pin = normalizePin(request.data?.pin);
    await setPersonalPinForUser({ uid: request.auth.uid, pin });
    return { ok: true };
  } catch (error) {
    throw toHttpsError(error);
  }
});

/** @deprecated Prefer generateGroupJoinPin — kept briefly for older clients. */
export const setGroupPin = onCall(callableOptions, async (request) => {
  try {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const groupId = typeof request.data?.groupId === 'string' ? request.data.groupId.trim() : '';
    if (!groupId) {
      throw new HttpsError('invalid-argument', 'Group is required.');
    }
    await assertCanManageGroup(request.auth.uid, groupId);
    const { pin, pinHash } = await generateUniqueJoinPinPlaintext();
    const { expiresAt } = await writeGroupJoinPin({
      groupId,
      actorUid: request.auth.uid,
      pinHash,
    });
    return { ok: true, pin, expiresAt: expiresAt.toISOString() };
  } catch (error) {
    throw toHttpsError(error);
  }
});

/** Add or update access_roster entry (CF-only writes). */
export const upsertAccessRoster = onCall(callableOptions, async (request) => {
  try {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    return await upsertAccessRosterEntry({
      actorUid: request.auth.uid,
      phoneNumber: request.data?.phoneNumber,
      name: request.data?.name,
      role: request.data?.role,
      groupId: request.data?.groupId,
      assignedGroupIds: request.data?.assignedGroupIds,
      status: request.data?.status,
    });
  } catch (error) {
    throw toHttpsError(error);
  }
});

/** Soft-deactivate an access_roster entry. */
export const deactivateAccessRoster = onCall(callableOptions, async (request) => {
  try {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    return await deactivateAccessRosterEntry({
      actorUid: request.auth.uid,
      phoneNumber: request.data?.phoneNumber,
    });
  } catch (error) {
    throw toHttpsError(error);
  }
});

/** Public: submit name + phone to apply for community membership. */
export const submitJoinApplication = onCall(callableOptions, async (request) => {
  try {
    return await submitJoinApplicationCore({
      name: request.data?.name,
      phoneNumber: request.data?.phoneNumber,
    });
  } catch (error) {
    throw toHttpsError(error);
  }
});

/** Admin: list join applications (default pending). */
export const listJoinApplications = onCall(callableOptions, async (request) => {
  try {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const status =
      request.data?.status === 'pending' ||
      request.data?.status === 'rejected' ||
      request.data?.status === 'added' ||
      request.data?.status === 'all'
        ? request.data.status
        : 'pending';
    return await listJoinApplicationsCore({
      actorUid: request.auth.uid,
      status,
      pageSize: typeof request.data?.pageSize === 'number' ? request.data.pageSize : undefined,
    });
  } catch (error) {
    throw toHttpsError(error);
  }
});

/** Admin: reject a join application. */
export const rejectJoinApplication = onCall(callableOptions, async (request) => {
  try {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    return await rejectJoinApplicationCore({
      actorUid: request.auth.uid,
      phoneNumber: request.data?.phoneNumber,
    });
  } catch (error) {
    throw toHttpsError(error);
  }
});

/** Admin: mark application added after roster save from Approve & Add. */
export const markJoinApplicationAdded = onCall(callableOptions, async (request) => {
  try {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    return await markJoinApplicationAddedCore({
      actorUid: request.auth.uid,
      phoneNumber: request.data?.phoneNumber,
    });
  } catch (error) {
    throw toHttpsError(error);
  }
});

/** Admin list roster (Admin SDK — reliable vs client list rules). */
export const listAccessRoster = onCall(callableOptions, async (request) => {
  try {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    return await listAccessRosterCore({
      actorUid: request.auth.uid,
      groupId: typeof request.data?.groupId === 'string' ? request.data.groupId : null,
      role:
        request.data?.role === 'user' || request.data?.role === 'admin' || request.data?.role === 'all'
          ? request.data.role
          : 'all',
      status:
        request.data?.status === 'active' ||
        request.data?.status === 'inactive' ||
        request.data?.status === 'all'
          ? request.data.status
          : 'all',
      search: typeof request.data?.search === 'string' ? request.data.search : '',
      pageSize: typeof request.data?.pageSize === 'number' ? request.data.pageSize : undefined,
    });
  } catch (error) {
    throw toHttpsError(error);
  }
});

/** Senior admin: copy admin_whitelist / known users into access_roster. */
export const migrateWhitelistToRoster = onCall(callableOptions, async (request) => {
  try {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    return await runMigrateWhitelistToRoster(request.auth.uid);
  } catch (error) {
    throw toHttpsError(error);
  }
});

/** Admin sets standing Adhyay/Aarti practice for a member. */
export const setMemberPracticeAssignment = onCall(callableOptions, async (request) => {
  try {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const groupId = typeof request.data?.groupId === 'string' ? request.data.groupId.trim() : '';
    if (!groupId) {
      throw new HttpsError('invalid-argument', 'Group is required.');
    }
    await assertCanManageGroup(request.auth.uid, groupId);
    return await setMemberPracticeAssignmentCore({
      actorUid: request.auth.uid,
      groupId,
      uid: typeof request.data?.uid === 'string' ? request.data.uid : undefined,
      phoneNumber: typeof request.data?.phoneNumber === 'string' ? request.data.phoneNumber : undefined,
      items: request.data?.items,
    });
  } catch (error) {
    throw toHttpsError(error);
  }
});

/** Member home: today's standing practice + completion flags. */
export const getMyPracticeToday = onCall(callableOptions, async (request) => {
  try {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    return await getMyPracticeTodayCore({ uid: request.auth.uid });
  } catch (error) {
    throw toHttpsError(error);
  }
});

/** Member marks one Adhyay/Aarti complete for the current practice day. */
export const markPracticeItemComplete = onCall(callableOptions, async (request) => {
  try {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const itemKey = typeof request.data?.itemKey === 'string' ? request.data.itemKey.trim() : '';
    if (!itemKey) {
      throw new HttpsError('invalid-argument', 'itemKey is required.');
    }
    return await markPracticeItemCompleteCore({
      uid: request.auth.uid,
      itemKey,
    });
  } catch (error) {
    throw toHttpsError(error);
  }
});

/** Member marks all pending Adhyays/Aarti complete for the current practice day. */
export const markAllPracticeComplete = onCall(callableOptions, async (request) => {
  try {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    return await markAllPracticeCompleteCore({ uid: request.auth.uid });
  } catch (error) {
    throw toHttpsError(error);
  }
});

/** Admin: per-member practice completion for current practice day. */
export const getPracticeAdminOverview = onCall(callableOptions, async (request) => {
  try {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const groupId = typeof request.data?.groupId === 'string' ? request.data.groupId.trim() : '';
    if (!groupId) {
      throw new HttpsError('invalid-argument', 'Group is required.');
    }
    await assertCanManageGroup(request.auth.uid, groupId);
    return await getPracticeAdminOverviewCore({ groupId });
  } catch (error) {
    throw toHttpsError(error);
  }
});

/** Admin: push reminder to one incomplete member or all incomplete. */
export const sendPracticeReminder = onCall(callableOptions, async (request) => {
  try {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const groupId = typeof request.data?.groupId === 'string' ? request.data.groupId.trim() : '';
    if (!groupId) {
      throw new HttpsError('invalid-argument', 'Group is required.');
    }
    await assertCanManageGroup(request.auth.uid, groupId);
    return await sendPracticeReminderCore({
      actorUid: request.auth.uid,
      groupId,
      uid: typeof request.data?.uid === 'string' ? request.data.uid : undefined,
      phoneNumber:
        typeof request.data?.phoneNumber === 'string' ? request.data.phoneNumber : undefined,
      remindAllIncomplete: request.data?.remindAllIncomplete === true,
    });
  } catch (error) {
    throw toHttpsError(error);
  }
});

/** Admin: monthly Yes/No practice attendance Excel (1st → current practice day). */
export const getPracticeMonthlyReport = onCall(
  {
    ...callableOptions,
    // Excel generation for large groups can take a bit longer than default.
    timeoutSeconds: 120,
    memory: '512MiB',
  },
  async (request) => {
    try {
      if (!request.auth?.uid) {
        throw new HttpsError('unauthenticated', 'Sign in required.');
      }
      const groupId = typeof request.data?.groupId === 'string' ? request.data.groupId.trim() : '';
      if (!groupId) {
        throw new HttpsError('invalid-argument', 'Group is required.');
      }
      await assertCanManageGroup(request.auth.uid, groupId);
      return await getPracticeMonthlyReportCore({ groupId });
    } catch (error) {
      throw toHttpsError(error);
    }
  }
);

/** Last day of month (IST): remind admins to download the full monthly practice Excel. */
export const notifyPracticeMonthlyReport = onSchedule(
  {
    schedule: '0 18 * * *',
    region,
    timeZone: 'Asia/Kolkata',
  },
  async () => {
    const result = await notifyPracticeMonthlyReportCore();
    console.log('notifyPracticeMonthlyReport', result);
  }
);

/**
 * The single post-notification path. Firestore create events are at-least-once,
 * so the deterministic notification ID keeps retries idempotent.
 */
export const onCommunityPostCreated = onDocumentCreated(
  {
    document: 'posts/{postId}',
    region,
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const data = snap.data() ?? {};
    const postTypeRaw = typeof data.type === 'string' ? data.type.trim().toLowerCase() : '';
    const postType =
      postTypeRaw === 'seva' || postTypeRaw === 'announcement'
        ? (postTypeRaw as CommunityPostNotifyType)
        : null;
    if (!postType) return;

    const groupId = typeof data.groupId === 'string' ? data.groupId.trim() : '';
    if (!groupId) {
      console.warn('onCommunityPostCreated_missing_groupId', { postId: snap.id });
      return;
    }

    const postTitle =
      typeof data.title === 'string'
        ? data.title.trim()
        : typeof data.message === 'string'
          ? data.message.trim()
          : '';

    try {
      const result = await notifyCommunityPostPublishedCore({
        groupId,
        postType,
        postTitle,
        postId: snap.id,
      });
      console.log('onCommunityPostCreated', {
        postId: snap.id,
        postType,
        groupId,
        pushSent: result.pushSent,
        alreadyNotified: 'alreadyNotified' in result ? result.alreadyNotified : false,
      });
    } catch (error) {
      console.error('onCommunityPostCreated_failed', {
        postId: snap.id,
        groupId,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
);

/** Wipe previous day's feed content overnight to keep query costs flat. */
export const wipeDailyFeed = onSchedule(
  {
    schedule: '0 2 * * *',
    region,
    timeZone: 'Asia/Kolkata',
  },
  async () => {
    const [feed, retention] = await Promise.all([
      wipeDailyFeedContent(),
      cleanupExpiredBackendRecords(),
    ]);
    console.log('wipeDailyFeed', { feed, retention });
  }
);

/** Client helper: mirror push token into group indexes after device register. */
export const syncPushTokenIndex = onCall(callableOptions, async (request) => {
  try {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }
    const deviceId =
      typeof request.data?.deviceId === 'string' ? request.data.deviceId.trim() : '';
    if (!deviceId) {
      throw new HttpsError('invalid-argument', 'deviceId is required.');
    }
    const remove = request.data?.remove === true;
    const token = typeof request.data?.token === 'string' ? request.data.token.trim() : undefined;
    const enabled =
      typeof request.data?.enabled === 'boolean' ? request.data.enabled : undefined;

    await syncUserPushTokenIndex({
      uid: request.auth.uid,
      deviceId,
      token,
      enabled,
      remove,
    });
    return { ok: true };
  } catch (error) {
    throw toHttpsError(error);
  }
});

export const deleteAccount = onCall(callableOptions, async (request) => {
  try {
    if (!request.auth?.uid) {
      throw new HttpsError('unauthenticated', 'Sign in required.');
    }

    const uid = request.auth.uid;
    await deleteUserAccount(uid);
    await adminAuth.deleteUser(uid);

    return { deleted: true };
  } catch (error) {
    throw toHttpsError(error);
  }
});
