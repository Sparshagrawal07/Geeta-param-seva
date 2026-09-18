import AsyncStorage from '@react-native-async-storage/async-storage';

/** Bump when Terms require re-acceptance on device. */
export const TERMS_AGREEMENT_VERSION = 'v1';

export const TERMS_ACCEPTED_STORAGE_KEY = `app.legal.termsAccepted.${TERMS_AGREEMENT_VERSION}`;

/** In-memory cache so post-accept navigation is not redirected by a stale layout read. */
let acceptedCache: boolean | null = null;

export async function hasAcceptedTerms(): Promise<boolean> {
  if (acceptedCache === true) return true;
  try {
    const value = await AsyncStorage.getItem(TERMS_ACCEPTED_STORAGE_KEY);
    const accepted = value === '1';
    acceptedCache = accepted;
    return accepted;
  } catch {
    return false;
  }
}

export async function acceptTerms(): Promise<void> {
  await AsyncStorage.setItem(TERMS_ACCEPTED_STORAGE_KEY, '1');
  acceptedCache = true;
}

/** Test helper — clears the in-memory acceptance cache. */
export function resetTermsAcceptanceCacheForTests(): void {
  acceptedCache = null;
}
