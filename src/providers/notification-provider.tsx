import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import type {
  EventSubscription,
  NotificationPermissionsStatus,
  PermissionStatus,
} from 'expo-notifications';
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
import { AppState, InteractionManager, Linking, Platform } from 'react-native';

import { isProtectedRoute } from '@/lib/auth-navigation';
import {
  notificationSoundAllowed,
  shouldRequestNotificationPermission,
} from '@/lib/notification-permission';
import { useAuth } from '@/hooks/use-auth';
import {
  getNotificationsModule,
  isExpoGoRuntime,
  notificationsAvailable,
} from '@/lib/notifications-runtime';
import { registerDisablePushOnSignOut } from '@/lib/push-signout';
import {
  ANDROID_REMINDER_CHANNEL_ID,
  ANDROID_REMINDER_CHANNEL_IDS_LEGACY,
  ANDROID_REMINDER_CHANNEL_NAME,
  REMINDER_SOUND_FILENAME,
} from '@/lib/push-constants';
import { SELECTED_GROUP_STORAGE_KEY, getStableDeviceId } from '@/lib/session';
import { isAdminRole } from '@/lib/users';
import { setDeviceEnabled, upsertDeviceToken } from '@/services/devices';

/** Marks that we already showed (or attempted) the OS notification permission dialog. */
const NOTIFICATION_PERMISSION_ASKED_KEY = 'gps.notifications.permissionAsked.v1';

const Notifications = getNotificationsModule();

if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

interface NotificationContextValue {
  permissionStatus: PermissionStatus | null;
  expoPushToken: string | null;
  notificationsEnabled: boolean;
  requestPermissions: () => Promise<boolean>;
  setNotificationsEnabled: (enabled: boolean) => Promise<void>;
  previewReminderSound: () => Promise<void>;
  openSystemNotificationSettings: () => Promise<void>;
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
  if (Platform.OS !== 'android' || !Notifications) return;

  // Android channels are immutable — delete older ids so sound/importance updates apply.
  for (const legacyId of ANDROID_REMINDER_CHANNEL_IDS_LEGACY) {
    try {
      await Notifications.deleteNotificationChannelAsync(legacyId);
    } catch {
      // Ignore if the legacy channel was never created.
    }
  }

  // Android 13+: the OS permission prompt will NOT appear until at least one
  // notification channel exists. Create the channel before any permission request.
  await Notifications.setNotificationChannelAsync(ANDROID_REMINDER_CHANNEL_ID, {
    name: ANDROID_REMINDER_CHANNEL_NAME,
    description: 'Seva reminders, practice alerts, and community updates',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    enableVibrate: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: false,
    // Must match a file registered via expo-notifications plugin `sounds`.
    sound: REMINDER_SOUND_FILENAME,
    audioAttributes: {
      usage: Notifications.AndroidAudioUsage.NOTIFICATION,
      contentType: Notifications.AndroidAudioContentType.SONIFICATION,
      flags: {
        enforceAudibility: true,
        requestHardwareAudioVideoSynchronization: false,
      },
    },
  });
}

const IOS_NOTIFICATION_PERMISSIONS = {
  allowAlert: true,
  allowBadge: true,
  allowSound: true,
  allowCriticalAlerts: false,
  provideAppNotificationSettings: false,
} as const;

export async function openSystemNotificationSettings() {
  try {
    await Linking.openSettings();
  } catch {
    // Best-effort; some environments block Settings deep-links.
  }
}

export async function previewReminderSound() {
  if (!Notifications || isExpoGoRuntime()) {
    // Custom sounds + channels are not available in Expo Go.
    return;
  }

  await ensureAndroidChannel();

  const permissions = await Notifications.getPermissionsAsync();
  if (!notificationSoundAllowed(permissions)) {
    throw new Error('NOTIFICATION_SOUND_DENIED');
  }

  // Short delay so the banner is delivered as a real system notification
  // (more reliable for custom channel/bundle sounds than a pure foreground present).
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Community reminder',
      body: 'This is how reminder alerts will sound.',
      sound: REMINDER_SOUND_FILENAME,
      ...(Platform.OS === 'android'
        ? { channelId: ANDROID_REMINDER_CHANNEL_ID }
        : { interruptionLevel: 'timeSensitive' }),
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 1,
      channelId: Platform.OS === 'android' ? ANDROID_REMINDER_CHANNEL_ID : undefined,
    },
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

  if (
    type === 'practice_reminder' ||
    type === 'practice_assigned' ||
    type === 'practice_report' ||
    screen === 'practice'
  ) {
    router.push((isAdmin ? '/(admin)/(tabs)/practice' : '/(user)/(tabs)') as never);
    return;
  }

  if (
    type === 'verse_assigned' ||
    type === 'verse_reminder' ||
    type === 'daily_verse' ||
    screen === 'verse'
  ) {
    router.push((isAdmin ? '/(admin)/(tabs)/practice' : '/(user)/(tabs)') as never);
    return;
  }

  const goFeed =
    screen === 'feed' || screen === 'group' || type === 'seva' || type === 'announcement';
  const goAlerts =
    screen === 'alerts' || screen === 'notifications' || type === 'reminder';

  if (isAdmin) {
    if (goAlerts && !goFeed) {
      router.push('/(admin)/(tabs)/practice' as never);
      return;
    }
    router.push('/(admin)/feed');
    return;
  }

  if (goFeed && !goAlerts) {
    router.push('/(user)/(tabs)/seva' as never);
    return;
  }
  router.push('/(user)/(tabs)');
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
  const [permissionStatus, setPermissionStatus] = useState<PermissionStatus | null>(null);
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabledState] = useState(true);
  const deviceIdRef = useRef<string | null>(null);
  const registeringRef = useRef(false);
  const permissionPromptRef = useRef(false);
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

  const refreshPermissionStatus = useCallback(async () => {
    if (!Notifications) return null;
    const current = await Notifications.getPermissionsAsync();
    setPermissionStatus(current.status);
    return current;
  }, []);

  const registerPushToken = useCallback(async () => {
    if (!Notifications || !notificationsAvailable()) return;
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

  const promptForPermissionsIfNeeded = useCallback(async () => {
    if (Platform.OS === 'web' || !Notifications) {
      return false;
    }

    await ensureAndroidChannel();

    let permissions: NotificationPermissionsStatus = await Notifications.getPermissionsAsync();
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
        ios: { ...IOS_NOTIFICATION_PERMISSIONS },
      });
      setPermissionStatus(permissions.status);
      await AsyncStorage.setItem(NOTIFICATION_PERMISSION_ASKED_KEY, '1');
    } catch {
      await AsyncStorage.setItem(NOTIFICATION_PERMISSION_ASKED_KEY, '1');
    } finally {
      permissionPromptRef.current = false;
    }

    return notificationSoundAllowed(permissions);
  }, []);

  const requestPermissions = useCallback(async () => {
    if (!Notifications) return false;
    await ensureAndroidChannel();

    let permissions = await Notifications.getPermissionsAsync();
    if (!permissions.granted && permissions.status !== 'granted') {
      if (permissionPromptRef.current) {
        return false;
      }
      permissionPromptRef.current = true;
      try {
        permissions = await Notifications.requestPermissionsAsync({
          ios: { ...IOS_NOTIFICATION_PERMISSIONS },
        });
      } finally {
        permissionPromptRef.current = false;
      }
    }

    setPermissionStatus(permissions.status);
    await AsyncStorage.setItem(NOTIFICATION_PERMISSION_ASKED_KEY, '1');

    if (notificationSoundAllowed(permissions)) {
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

  useEffect(() => {
    if (!Notifications) return;
    let cancelled = false;
    let delayTimer: ReturnType<typeof setTimeout> | undefined;

    const task = InteractionManager.runAfterInteractions(() => {
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

  useEffect(() => {
    if (!Notifications || authLoading || !profile?.uid) return;
    void (async () => {
      await promptForPermissionsIfNeeded();
      await registerPushToken();
    })();
  }, [authLoading, profile?.uid, promptForPermissionsIfNeeded, registerPushToken]);

  useEffect(() => {
    if (!Notifications) return;
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
    if (!Notifications) return;

    const receivedSub: EventSubscription = Notifications.addNotificationReceivedListener(() => {
      // Foreground display is handled by setNotificationHandler.
    });

    const responseSub: EventSubscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as
          | Record<string, unknown>
          | undefined;
        void navigateFromNotificationData(data, isAdminRole(profile?.role));
      }
    );

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
      openSystemNotificationSettings,
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
