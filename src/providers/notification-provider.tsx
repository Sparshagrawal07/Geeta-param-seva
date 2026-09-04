import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router, usePathname } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState, InteractionManager, Platform } from 'react-native';

import { isProtectedRoute } from '@/lib/auth-navigation';
import { shouldRequestNotificationPermission } from '@/lib/notification-permission';
import { useAuth } from '@/hooks/use-auth';
import { registerDisablePushOnSignOut } from '@/lib/push-signout';
import {
  ANDROID_REMINDER_CHANNEL_ID,
  ANDROID_REMINDER_CHANNEL_ID_LEGACY,
  ANDROID_REMINDER_CHANNEL_NAME,
  REMINDER_SOUND_FILENAME,
} from '@/lib/push-constants';
import { SELECTED_GROUP_STORAGE_KEY, getStableDeviceId } from '@/lib/session';
import { isAdminRole } from '@/lib/users';
import { setDeviceEnabled, upsertDeviceToken } from '@/services/devices';

/** Marks that we already showed (or attempted) the OS notification permission dialog. */
const NOTIFICATION_PERMISSION_ASKED_KEY = 'gps.notifications.permissionAsked.v1';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

interface NotificationContextValue {
  permissionStatus: Notifications.PermissionStatus | null;
  expoPushToken: string | null;
  notificationsEnabled: boolean;
  requestPermissions: () => Promise<boolean>;
  setNotificationsEnabled: (enabled: boolean) => Promise<void>;
  previewReminderSound: () => Promise<void>;
  refreshPushRegistration: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

function resolveProjectId(): string | undefined {
  return (
    Constants.easConfig?.projectId ??
    (Constants.expoConfig?.extra?.eas as { projectId?: string } | undefined)?.projectId
  );
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;

  // Android 13+: the OS permission prompt will NOT appear until at least one
  // notification channel exists. Create the channel before any permission request.
  try {
    await Notifications.deleteNotificationChannelAsync(ANDROID_REMINDER_CHANNEL_ID_LEGACY);
  } catch {
    // Ignore if the legacy channel was never created.
  }

  await Notifications.setNotificationChannelAsync(ANDROID_REMINDER_CHANNEL_ID, {
    name: ANDROID_REMINDER_CHANNEL_NAME,
    description: 'Seva reminders, practice alerts, and community updates',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: false,
    sound: REMINDER_SOUND_FILENAME,
  });
}

function readDataString(data: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = data?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

async function navigateFromNotificationData(
  data: Record<string, unknown> | undefined,
  isAdmin: boolean
) {
  const groupId = readDataString(data, 'groupId');
  if (groupId) {
    await AsyncStorage.setItem(SELECTED_GROUP_STORAGE_KEY, groupId);
  }

  const screen = readDataString(data, 'screen')?.toLowerCase();
  const type = readDataString(data, 'type')?.toLowerCase();

  if (type === 'practice_reminder' || type === 'practice_assigned' || type === 'practice_report' || screen === 'practice') {
    router.push((isAdmin ? '/(admin)/practice' : '/(user)') as never);
    return;
  }

  // Legacy verse-system notifications → practice home
  if (
    type === 'verse_assigned' ||
    type === 'verse_reminder' ||
    type === 'daily_verse' ||
    screen === 'verse'
  ) {
    router.push((isAdmin ? '/(admin)/practice' : '/(user)') as never);
    return;
  }

  const goFeed =
    screen === 'feed' || screen === 'group' || type === 'seva' || type === 'announcement';
  const goAlerts =
    screen === 'alerts' || screen === 'notifications' || type === 'reminder';

  if (isAdmin) {
    if (goAlerts && !goFeed) {
      router.push('/(admin)/practice' as never);
      return;
    }
    router.push('/(admin)/feed');
    return;
  }

  if (goFeed && !goAlerts) {
    router.push('/(user)/seva' as never);
    return;
  }
  router.push('/(user)');
}

export async function previewReminderSound() {
  await ensureAndroidChannel();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Community reminder',
      body: 'This is how reminder alerts will sound.',
      sound: REMINDER_SOUND_FILENAME,
      ...(Platform.OS === 'android' ? { channelId: ANDROID_REMINDER_CHANNEL_ID } : {}),
    },
    trigger: null,
  });
}

export function AuthNavigationBoundary({ children }: PropsWithChildren) {
  const { profile, loading } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    if (loading || profile) return;
    if (isProtectedRoute(pathname)) {
      router.replace('/sign-in');
    }
  }, [loading, pathname, profile]);

  return children;
}

export function NotificationProvider({ children }: PropsWithChildren) {
  const { profile, loading: authLoading } = useAuth();
  const [permissionStatus, setPermissionStatus] = useState<Notifications.PermissionStatus | null>(
    null
  );
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabledState] = useState(true);
  const deviceIdRef = useRef<string | null>(null);
  const registeringRef = useRef(false);
  /** Prevents overlapping OS permission dialogs from open + sign-in + resume. */
  const permissionPromptRef = useRef(false);
  /** Bumped on register so a stale sign-out disable cannot clobber a newer enable. */
  const pushGenerationRef = useRef(0);

  const disableRegisteredDevice = useCallback(async () => {
    const generationAtStart = pushGenerationRef.current;
    const deviceId = deviceIdRef.current ?? (await getStableDeviceId());
    deviceIdRef.current = deviceId;
    try {
      await setDeviceEnabled(deviceId, false);
    } catch {
      // Auth may already be cleared; push disable is best-effort on sign-out.
    }
    if (pushGenerationRef.current === generationAtStart) {
      setExpoPushToken(null);
    }
  }, []);

  useEffect(() => {
    registerDisablePushOnSignOut(disableRegisteredDevice);
    return () => {
      registerDisablePushOnSignOut(null);
    };
  }, [disableRegisteredDevice]);

  // Push disable runs only via signOutUser → disableDeviceTokenOnSignOut.
  // Do not auto-disable when profile is briefly null during auth transitions;
  // that raced sole-session login and left group tokens stuck at enabled:false.

  const refreshPermissionStatus = useCallback(async () => {
    const current = await Notifications.getPermissionsAsync();
    setPermissionStatus(current.status);
    return current;
  }, []);

  const registerPushToken = useCallback(async () => {
    if (!profile?.uid || registeringRef.current) return;
    if (!Device.isDevice) return;

    registeringRef.current = true;
    const generation = ++pushGenerationRef.current;
    try {
      await ensureAndroidChannel();

      const permissions = await Notifications.getPermissionsAsync();
      setPermissionStatus(permissions.status);
      if (permissions.status !== 'granted') {
        return;
      }

      const projectId = resolveProjectId();
      const tokenResponse = projectId
        ? await Notifications.getExpoPushTokenAsync({ projectId })
        : await Notifications.getExpoPushTokenAsync();

      const token = tokenResponse.data;
      if (pushGenerationRef.current !== generation) return;

      setExpoPushToken(token);

      const deviceId = deviceIdRef.current ?? (await getStableDeviceId());
      deviceIdRef.current = deviceId;

      await upsertDeviceToken({
        deviceId,
        token,
        platform: Platform.OS,
        enabled: notificationsEnabled,
      });
    } catch {
      // Push registration is best-effort; UI can retry via refreshPushRegistration.
    } finally {
      registeringRef.current = false;
    }
  }, [notificationsEnabled, profile?.uid]);

  /**
   * Ask the OS for notification permission on first open / while still askable.
   * Important: do NOT require status === 'undetermined' — Android 13+ often returns
   * 'denied' + canAskAgain before the first prompt, and the dialog only appears after
   * a notification channel has been created.
   */
  const promptForPermissionsIfNeeded = useCallback(async () => {
    if (Platform.OS === 'web') {
      return false;
    }

    // Channel must exist before Android 13 will show the permission dialog.
    await ensureAndroidChannel();

    let permissions = await Notifications.getPermissionsAsync();
    setPermissionStatus(permissions.status);

    if (permissions.granted || permissions.status === 'granted') {
      await AsyncStorage.setItem(NOTIFICATION_PERMISSION_ASKED_KEY, '1');
      return true;
    }

    const alreadyAskedLocally =
      (await AsyncStorage.getItem(NOTIFICATION_PERMISSION_ASKED_KEY)) === '1';

    if (!shouldRequestNotificationPermission(permissions, alreadyAskedLocally)) {
      return false;
    }

    if (permissionPromptRef.current) {
      return false;
    }
    permissionPromptRef.current = true;
    try {
      permissions = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      setPermissionStatus(permissions.status);
      await AsyncStorage.setItem(NOTIFICATION_PERMISSION_ASKED_KEY, '1');
    } catch {
      // Still mark asked so we don't loop on a broken native module.
      await AsyncStorage.setItem(NOTIFICATION_PERMISSION_ASKED_KEY, '1');
    } finally {
      permissionPromptRef.current = false;
    }

    return permissions.status === 'granted' || permissions.granted === true;
  }, []);

  const requestPermissions = useCallback(async () => {
    // Settings / explicit enable: always attempt the OS dialog when not granted.
    await ensureAndroidChannel();

    let permissions = await Notifications.getPermissionsAsync();
    if (!permissions.granted && permissions.status !== 'granted') {
      if (permissionPromptRef.current) {
        return false;
      }
      permissionPromptRef.current = true;
      try {
        permissions = await Notifications.requestPermissionsAsync({
          ios: {
            allowAlert: true,
            allowBadge: true,
            allowSound: true,
          },
        });
      } finally {
        permissionPromptRef.current = false;
      }
    }

    setPermissionStatus(permissions.status);
    await AsyncStorage.setItem(NOTIFICATION_PERMISSION_ASKED_KEY, '1');

    if (permissions.granted || permissions.status === 'granted') {
      await registerPushToken();
      return true;
    }
    return false;
  }, [registerPushToken]);

  const setNotificationsEnabled = useCallback(
    async (enabled: boolean) => {
      setNotificationsEnabledState(enabled);
      const deviceId = deviceIdRef.current ?? (await getStableDeviceId());
      deviceIdRef.current = deviceId;
      if (profile?.uid) {
        await setDeviceEnabled(deviceId, enabled);
      }
      if (enabled) {
        await registerPushToken();
      }
    },
    [profile?.uid, registerPushToken]
  );

  const refreshPushRegistration = useCallback(async () => {
    await refreshPermissionStatus();
    await registerPushToken();
  }, [refreshPermissionStatus, registerPushToken]);

  // App open (first install / cold start): ask after UI is interactive.
  useEffect(() => {
    let cancelled = false;
    let delayTimer: ReturnType<typeof setTimeout> | undefined;

    const task = InteractionManager.runAfterInteractions(() => {
      // Wait past splash / first paint so the Activity can present the system dialog.
      delayTimer = setTimeout(() => {
        void (async () => {
          if (cancelled) return;
          if (AppState.currentState !== 'active') return;
          deviceIdRef.current = await getStableDeviceId();
          await promptForPermissionsIfNeeded();
        })();
      }, 900);
    });

    return () => {
      cancelled = true;
      task.cancel?.();
      if (delayTimer) clearTimeout(delayTimer);
    };
  }, [promptForPermissionsIfNeeded]);

  // After sign-in: ensure permission then register Expo token + group index.
  useEffect(() => {
    if (authLoading || !profile?.uid) return;
    void (async () => {
      await promptForPermissionsIfNeeded();
      await registerPushToken();
    })();
  }, [authLoading, profile?.uid, promptForPermissionsIfNeeded, registerPushToken]);

  // Foreground resume: ask only if still askable / never asked on this install.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void (async () => {
        await promptForPermissionsIfNeeded();
        if (profile?.uid) {
          await registerPushToken();
        }
      })();
    });
    return () => subscription.remove();
  }, [profile?.uid, promptForPermissionsIfNeeded, registerPushToken]);

  useEffect(() => {
    const receivedSub = Notifications.addNotificationReceivedListener(() => {
      // Foreground display is handled by setNotificationHandler; keep listener for future analytics.
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      void navigateFromNotificationData(data, isAdminRole(profile?.role));
    });

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response || !profile) return;
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      void navigateFromNotificationData(data, isAdminRole(profile.role));
    });

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, [profile]);

  const value = useMemo(
    () => ({
      permissionStatus,
      expoPushToken,
      notificationsEnabled,
      requestPermissions,
      setNotificationsEnabled,
      previewReminderSound,
      refreshPushRegistration,
    }),
    [
      expoPushToken,
      notificationsEnabled,
      permissionStatus,
      refreshPushRegistration,
      requestPermissions,
      setNotificationsEnabled,
    ]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotificationsSetup() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotificationsSetup must be used within NotificationProvider');
  }
  return context;
}
