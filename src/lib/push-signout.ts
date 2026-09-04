let disablePushOnSignOutHandler: (() => Promise<void>) | null = null;

export function registerDisablePushOnSignOut(handler: (() => Promise<void>) | null): void {
  disablePushOnSignOutHandler = handler;
}

export async function disableDeviceTokenOnSignOut(): Promise<void> {
  if (disablePushOnSignOutHandler) {
    await disablePushOnSignOutHandler();
  }
}
