import { describe, expect, it, vi } from 'vitest';

import {
  createLocalPerformanceRecorder,
  evaluatePerformanceBudget,
} from '@/lib/local-performance';

describe('local performance budgets', () => {
  it('classifies measurements at the budget boundary', () => {
    expect(evaluatePerformanceBudget(99.9, 100)).toBe('within-budget');
    expect(evaluatePerformanceBudget(100, 100)).toBe('within-budget');
    expect(evaluatePerformanceBudget(100.1, 100)).toBe('over-budget');
    expect(evaluatePerformanceBudget(10)).toBe('unbudgeted');
  });

  it('records once without telemetry or timers', () => {
    const sink = vi.fn();
    const mark = vi.fn();
    const timestamps = [10, 73.26];
    const recorder = createLocalPerformanceRecorder({
      enabled: true,
      now: () => timestamps.shift() ?? 0,
      sink,
      mark,
    });

    const finish = recorder.start('screen.home.ready', 100);
    expect(finish()).toEqual({
      name: 'screen.home.ready',
      durationMs: 63.3,
      budgetMs: 100,
      status: 'within-budget',
    });
    expect(finish()).toBeNull();
    expect(mark).toHaveBeenCalledTimes(2);
    expect(sink).toHaveBeenCalledTimes(1);
  });

  it('has zero clock and sink work when disabled', () => {
    const now = vi.fn(() => 1);
    const sink = vi.fn();
    const recorder = createLocalPerformanceRecorder({ enabled: false, now, sink });

    expect(recorder.start('disabled')()).toBeNull();
    recorder.mark('disabled.mark');
    expect(now).not.toHaveBeenCalled();
    expect(sink).not.toHaveBeenCalled();
  });
});
