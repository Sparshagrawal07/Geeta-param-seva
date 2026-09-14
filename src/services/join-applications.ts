import { httpsCallable } from 'firebase/functions';

import { functions } from '@/lib/firebase';
import type { JoinApplication, JoinApplicationStatus } from '@/types/join-application';

function mapApplication(entry: Record<string, unknown>): JoinApplication {
  const statusRaw = String(entry.status ?? 'pending');
  const status: JoinApplicationStatus =
    statusRaw === 'rejected' || statusRaw === 'added' ? statusRaw : 'pending';
  return {
    id: String(entry.id ?? ''),
    name: String(entry.name ?? ''),
    phoneNumber: String(entry.phoneNumber ?? ''),
    status,
    createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : null,
    updatedAt: typeof entry.updatedAt === 'string' ? entry.updatedAt : null,
    reviewedBy: typeof entry.reviewedBy === 'string' ? entry.reviewedBy : undefined,
    reviewedAt: typeof entry.reviewedAt === 'string' ? entry.reviewedAt : null,
  };
}

export async function submitJoinApplicationRemote(input: {
  name: string;
  phoneNumber: string;
}): Promise<void> {
  const callable = httpsCallable(functions, 'submitJoinApplication');
  await callable(input);
}

export async function listJoinApplicationsRemote(input?: {
  status?: JoinApplicationStatus | 'all';
  pageSize?: number;
}): Promise<JoinApplication[]> {
  const callable = httpsCallable(functions, 'listJoinApplications');
  const response = await callable({
    status: input?.status ?? 'pending',
    pageSize: input?.pageSize,
  });
  const data = response.data as { entries?: Array<Record<string, unknown>> };
  return Array.isArray(data.entries) ? data.entries.map(mapApplication) : [];
}

export async function rejectJoinApplicationRemote(phoneNumber: string): Promise<void> {
  const callable = httpsCallable(functions, 'rejectJoinApplication');
  await callable({ phoneNumber });
}

export async function markJoinApplicationAddedRemote(phoneNumber: string): Promise<void> {
  const callable = httpsCallable(functions, 'markJoinApplicationAdded');
  await callable({ phoneNumber });
}

export function mapJoinApplicationError(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback;
  const code = 'code' in error ? String((error as { code: unknown }).code) : '';
  const message = 'message' in error ? String((error as { message: unknown }).message) : '';
  const details = 'details' in error ? String((error as { details: unknown }).details ?? '') : '';
  const haystack = `${code} ${message} ${details}`.toLowerCase();

  if (haystack.includes('already-exists') || haystack.includes('already on the community')) {
    return 'ALREADY_ON_ROSTER';
  }
  if (haystack.includes('already approved') || haystack.includes('ask an admin for the join pin')) {
    return 'ALREADY_APPROVED';
  }
  if (haystack.includes('resource-exhausted') || haystack.includes('already submitted')) {
    return 'RATE_LIMITED';
  }
  if (haystack.includes('invalid-argument') || haystack.includes('valid 10-digit')) {
    return 'INVALID_INPUT';
  }
  return fallback;
}
