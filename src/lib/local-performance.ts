export const LOCAL_PERFORMANCE_BUDGETS = {
  cachedScreenReadyMs: 100,
  warmTabReadyMs: 100,
  jsStallMs: 100,
} as const;

export type PerformanceBudgetStatus = 'within-budget' | 'over-budget' | 'unbudgeted';

export interface LocalPerformanceSample {
  name: string;
  durationMs: number;
  budgetMs?: number;
  status: PerformanceBudgetStatus;
}

export function evaluatePerformanceBudget(
  durationMs: number,
  budgetMs?: number
): PerformanceBudgetStatus {
  if (budgetMs === undefined) return 'unbudgeted';
  return durationMs <= budgetMs ? 'within-budget' : 'over-budget';
}

interface LocalPerformanceRecorderOptions {
  enabled: boolean;
  now?: () => number;
  sink?: (sample: LocalPerformanceSample) => void;
  mark?: (name: string) => void;
}

export interface LocalPerformanceRecorder {
  mark: (name: string) => void;
  start: (name: string, budgetMs?: number) => () => LocalPerformanceSample | null;
}

export function createLocalPerformanceRecorder({
  enabled,
  now = () => globalThis.performance?.now?.() ?? Date.now(),
  sink = (sample) => console.info(`[local-perf] ${JSON.stringify(sample)}`),
  mark = (name) => {
    try {
      globalThis.performance?.mark?.(name);
    } catch {
      // React Native runtimes may expose performance.now without User Timing.
    }
  },
}: LocalPerformanceRecorderOptions): LocalPerformanceRecorder {
  return {
    mark(name) {
      if (!enabled) return;
      mark(name);
    },
    start(name, budgetMs) {
      if (!enabled) return () => null;
      const startedAt = now();
      mark(`${name}.start`);
      let finished = false;

      return () => {
        if (finished) return null;
        finished = true;
        const durationMs = Math.max(0, now() - startedAt);
        const sample: LocalPerformanceSample = {
          name,
          durationMs: Math.round(durationMs * 10) / 10,
          ...(budgetMs === undefined ? {} : { budgetMs }),
          status: evaluatePerformanceBudget(durationMs, budgetMs),
        };
        mark(`${name}.end`);
        sink(sample);
        return sample;
      };
    },
  };
}

const localRecorder = createLocalPerformanceRecorder({
  enabled: process.env.EXPO_PUBLIC_LOCAL_PROFILE === '1',
});

export function markLocalPerformance(name: string): void {
  localRecorder.mark(name);
}

export function startLocalPerformanceSpan(
  name: string,
  budgetMs?: number
): () => LocalPerformanceSample | null {
  return localRecorder.start(name, budgetMs);
}
