import { describe, expect, it } from 'vitest';

import {
  notificationSoundAllowed,
  shouldRequestNotificationPermission,
} from '@/lib/notification-permission';

describe('shouldRequestNotificationPermission', () => {
  it('does not ask when already granted', () => {
    expect(
      shouldRequestNotificationPermission(
        { granted: true, status: 'granted', canAskAgain: false },
        false
      )
    ).toBe(false);
  });

  it('asks when undetermined', () => {
    expect(
      shouldRequestNotificationPermission(
        { granted: false, status: 'undetermined', canAskAgain: true },
        false
      )
    ).toBe(true);
  });

  it('asks on first Android install when status is denied but never asked locally', () => {
    // Android 13+ commonly reports denied before the first system prompt.
    expect(
      shouldRequestNotificationPermission(
        { granted: false, status: 'denied', canAskAgain: true },
        false
      )
    ).toBe(true);
    expect(
      shouldRequestNotificationPermission(
        { granted: false, status: 'denied', canAskAgain: false },
        false
      )
    ).toBe(true);
  });

  it('does not re-ask after local ask when permanently denied', () => {
    expect(
      shouldRequestNotificationPermission(
        { granted: false, status: 'denied', canAskAgain: false },
        true
      )
    ).toBe(false);
  });

  it('re-asks when OS still allows it after a prior attempt', () => {
    expect(
      shouldRequestNotificationPermission(
        { granted: false, status: 'denied', canAskAgain: true },
        true
      )
    ).toBe(true);
  });
});

describe('notificationSoundAllowed', () => {
  it('requires granted status', () => {
    expect(notificationSoundAllowed({ granted: false, status: 'denied' })).toBe(false);
    expect(notificationSoundAllowed({ granted: true, status: 'granted' })).toBe(true);
  });

  it('fails when iOS Sounds toggle is off', () => {
    expect(
      notificationSoundAllowed({
        granted: true,
        status: 'granted',
        ios: { allowsSound: false },
      })
    ).toBe(false);
  });

  it('passes when iOS Sounds are enabled or unspecified', () => {
    expect(
      notificationSoundAllowed({
        granted: true,
        status: 'granted',
        ios: { allowsSound: true },
      })
    ).toBe(true);
    expect(
      notificationSoundAllowed({
        status: 'granted',
        ios: { allowsSound: null },
      })
    ).toBe(true);
  });
});
