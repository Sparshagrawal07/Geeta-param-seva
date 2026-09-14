/**
 * Android often reports status "denied" (not "undetermined") before the user has
 * ever been prompted. Decide whether we should call requestPermissionsAsync.
 */
export function shouldRequestNotificationPermission(
  permissions: {
    granted: boolean;
    /** expo-notifications PermissionStatus string values */
    status: string;
    canAskAgain: boolean;
  },
  alreadyAskedLocally: boolean
): boolean {
  if (permissions.granted || permissions.status === 'granted') {
    return false;
  }

  if (permissions.status === 'undetermined') {
    return true;
  }

  // First launch / never asked by this app install.
  if (!alreadyAskedLocally) {
    return true;
  }

  // OS still allows showing the dialog (common Android 13+ pre-prompt state).
  return permissions.canAskAgain === true;
}

/**
 * iOS can report overall notification status "granted" while Sounds is off in
 * Settings → Notifications → App. Custom reminder audio will not play then.
 */
export function notificationSoundAllowed(permissions: {
  granted?: boolean;
  status?: string;
  ios?: {
    allowsSound?: boolean | null;
  } | null;
}): boolean {
  const granted = permissions.granted === true || permissions.status === 'granted';
  if (!granted) return false;

  const allowsSound = permissions.ios?.allowsSound;
  if (allowsSound === false) return false;
  return true;
}
