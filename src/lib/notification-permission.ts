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
