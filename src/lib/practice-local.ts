import type { MutationOutboxItem } from '@/lib/cache';
import type { MyPracticeToday } from '@/lib/practice';

export const PRACTICE_MARK_ONE_OPERATION = 'practice.mark-one';
export const PRACTICE_MARK_ALL_OPERATION = 'practice.mark-all';

export interface PracticeCompletionMutation {
  uid: string;
  /** Which group's practice this completion belongs to. */
  groupId: string;
  dateKey: string;
  itemKey?: string;
}

export const PRACTICE_RETRY_BASE_MS = 2_000;
export const PRACTICE_RETRY_MAX_MS = 5 * 60 * 1000;

export function practiceRetryDelay(attempts: number): number {
  const exponent = Math.max(0, Math.min(20, attempts - 1));
  return Math.min(PRACTICE_RETRY_MAX_MS, PRACTICE_RETRY_BASE_MS * 2 ** exponent);
}

export function applyOptimisticPracticeCompletion(
  today: MyPracticeToday,
  mutation: PracticeCompletionMutation
): MyPracticeToday {
  if (
    today.practiceDateKey !== mutation.dateKey ||
    today.assignment?.uid !== mutation.uid ||
    today.groupId !== mutation.groupId
  ) {
    return today;
  }

  return {
    ...today,
    items: today.items.map((item) =>
      !mutation.itemKey || item.itemKey === mutation.itemKey
        ? { ...item, completed: true }
        : item
    ),
  };
}

export function applyPendingPracticeMutations(
  today: MyPracticeToday,
  mutations: MutationOutboxItem<PracticeCompletionMutation>[]
): MyPracticeToday {
  return mutations.reduce((current, mutation) => {
    if (
      mutation.operation !== PRACTICE_MARK_ONE_OPERATION &&
      mutation.operation !== PRACTICE_MARK_ALL_OPERATION
    ) {
      return current;
    }
    return applyOptimisticPracticeCompletion(current, mutation.payload);
  }, today);
}

export function pendingPracticeItemKeys(
  today: MyPracticeToday,
  mutations: MutationOutboxItem<PracticeCompletionMutation>[]
): Set<string> {
  const result = new Set<string>();
  for (const mutation of mutations) {
    if (
      mutation.payload.uid !== today.assignment?.uid ||
      mutation.payload.dateKey !== today.practiceDateKey ||
      mutation.payload.groupId !== today.groupId
    ) {
      continue;
    }
    if (mutation.operation === PRACTICE_MARK_ALL_OPERATION) {
      for (const item of today.items) result.add(item.itemKey);
    } else if (
      mutation.operation === PRACTICE_MARK_ONE_OPERATION &&
      mutation.payload.itemKey
    ) {
      result.add(mutation.payload.itemKey);
    }
  }
  return result;
}
