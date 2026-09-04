export const INDIA_COUNTRY_CODE = '+91';

export function normalizePhoneNumber(input: string) {
  const compact = input.trim().replace(/[\s()-]/g, '');
  const digits = compact.replace(/\+/g, '');
  return `+${digits}`;
}

export function isValidE164PhoneNumber(input: string) {
  return /^\+[1-9]\d{7,14}$/.test(input);
}

/**
 * Digits only, capped at 10 — for the India mobile input UX.
 * Strips leading country code / trunk prefix from autofill and paste.
 * Do not set TextInput maxLength to 10 or autofill may truncate before this runs.
 */
export function sanitizeIndianMobileDigits(input: string) {
  let digits = input.replace(/\D/g, '');

  // 0091… / 91… / leftover country code when longer than a local mobile
  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  }
  if (digits.startsWith('91') && digits.length > 10) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0') && digits.length === 11) {
    digits = digits.slice(1);
  }

  return digits.slice(0, 10);
}

/** Indian mobile: exactly 10 digits starting with 6–9. */
export function isValidIndianMobileDigits(digits: string) {
  return /^[6-9]\d{9}$/.test(digits);
}

/** Compose E.164 from a 10-digit Indian mobile (caller should validate first). */
export function toE164IndianMobile(digits: string) {
  return `${INDIA_COUNTRY_CODE}${sanitizeIndianMobileDigits(digits)}`;
}

/** Stable Firestore document id for an E.164 phone number */
export function phoneToDocId(phoneNumber: string) {
  return normalizePhoneNumber(phoneNumber).replace(/^\+/, '');
}

export function phonesMatch(a: string, b: string) {
  return phoneToDocId(a) === phoneToDocId(b);
}
