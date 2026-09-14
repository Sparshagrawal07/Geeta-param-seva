/** Shared push channel / sound identifiers (keep in sync with functions/src/push.ts). */

/** Bump when Android channel sound/importance must change (channels are immutable). */
export const ANDROID_REMINDER_CHANNEL_ID = 'community-reminders-v4';
export const ANDROID_REMINDER_CHANNEL_NAME = 'Community reminders';
/** Filename registered via expo-notifications plugin `sounds` (keep extension). */
export const REMINDER_SOUND_FILENAME = 'community_reminder.wav';
/** Older channel ids — deleted on upgrade so devices pick up the new sound. */
export const ANDROID_REMINDER_CHANNEL_IDS_LEGACY = [
  'community-reminders-v1',
  'community-reminders-v2',
  'community-reminders-v3',
] as const;
/** @deprecated use ANDROID_REMINDER_CHANNEL_IDS_LEGACY */
export const ANDROID_REMINDER_CHANNEL_ID_LEGACY = 'community-reminders-v3';
