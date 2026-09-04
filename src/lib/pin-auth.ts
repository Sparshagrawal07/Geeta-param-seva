import { httpsCallable } from 'firebase/functions';
import { signInWithCustomToken } from 'firebase/auth';
import { Platform } from 'react-native';

import { auth, functions } from '@/lib/firebase';
import { getStableDeviceId } from '@/lib/session';
import { getUserProfile, type UserProfile } from '@/lib/users';

export function normalizeGroupPin(input: string) {
  return input.replace(/\D/g, '').slice(0, 8);
}

export function isValidGroupPin(pin: string) {
  return /^\d{4,8}$/.test(pin);
}

export async function signInWithPhoneAndGroupPin(input: {
  phoneNumber: string;
  pin: string;
}): Promise<UserProfile> {
  const deviceId = await getStableDeviceId();
  const callable = httpsCallable(functions, 'signInWithGroupPin');
  const response = await callable({
    phoneNumber: input.phoneNumber,
    pin: input.pin,
    deviceId,
    platform: Platform.OS,
  });
  const data = response.data as { token?: string };
  if (!data?.token) {
    throw new Error('Sign in failed. Please try again.');
  }

  await signInWithCustomToken(auth, data.token);
  await auth.currentUser?.getIdToken(true);
  const uid = auth.currentUser?.uid;
  if (!uid) {
    throw new Error('Sign in failed. Please try again.');
  }

  const profile = await getUserProfile(uid);
  if (!profile) {
    throw new Error('Account created but profile could not be loaded. Please try again.');
  }
  return profile;
}

export async function generateGroupJoinPinRemote(input: {
  groupId: string;
}): Promise<{ pin: string; expiresAt: string }> {
  const callable = httpsCallable(functions, 'generateGroupJoinPin');
  const response = await callable(input);
  const data = response.data as { pin?: string; expiresAt?: string };
  if (!data?.pin || !data?.expiresAt) {
    throw new Error('Could not generate join PIN.');
  }
  return { pin: data.pin, expiresAt: data.expiresAt };
}

export async function setPersonalPinRemote(input: { pin: string }) {
  const callable = httpsCallable(functions, 'setPersonalPin');
  await callable(input);
}

export function mapPinAuthError(error: unknown, fallback: string) {
  if (error && typeof error === 'object') {
    const code = 'code' in error ? String(error.code) : '';
    const message = 'message' in error ? String(error.message) : '';
    if (message.includes('JOIN_PIN_EXPIRED')) {
      return 'JOIN_PIN_EXPIRED';
    }
    if (code.includes('permission-denied') || message.toLowerCase().includes('incorrect')) {
      return 'Incorrect phone number or PIN.';
    }
    if (code.includes('already-exists') || message.toLowerCase().includes('already in use')) {
      return 'This PIN is already in use. Choose another.';
    }
    if (code.includes('invalid-argument')) {
      return message.replace(/^.*?:\s*/, '') || fallback;
    }
    if (message) {
      return message.replace(/^Firebase:\s*/i, '').replace(/\s*\(.*\)\s*$/, '') || fallback;
    }
  }
  return fallback;
}
