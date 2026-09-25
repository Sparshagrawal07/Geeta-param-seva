import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { AppState, type AppStateStatus } from 'react-native';

export type RefreshReason = 'foreground' | 'network' | 'manual';
export type RefreshTask = (reason: RefreshReason) => Promise<void> | void;

interface RegisteredTask {
  refresh: RefreshTask;
  cooldownMs: number;
  lastStartedAt: number;
  inFlight: Promise<void> | null;
  pendingReason: RefreshReason | null;
  timer: ReturnType<typeof setTimeout> | null;
}

const tasks = new Map<string, RegisteredTask>();
let stopListeners: (() => void) | null = null;
let appState: AppStateStatus = AppState.currentState;
let connected: boolean | null = null;

export interface RegisterRefreshOptions {
  cooldownMs?: number;
}

export function registerRefreshTask(
  id: string,
  refresh: RefreshTask,
  options: RegisterRefreshOptions = {}
): () => void {
  const existing = tasks.get(id);
  if (existing?.timer) clearTimeout(existing.timer);
  tasks.set(id, {
    refresh,
    cooldownMs: Math.max(0, options.cooldownMs ?? 30_000),
    lastStartedAt: 0,
    inFlight: null,
    pendingReason: null,
    timer: null,
  });
  return () => {
    const task = tasks.get(id);
    if (task?.timer) clearTimeout(task.timer);
    tasks.delete(id);
  };
}

export function requestCoordinatedRefresh(reason: RefreshReason = 'manual'): void {
  for (const task of tasks.values()) scheduleTask(task, reason);
}

export function startRefreshCoordinator(): () => void {
  if (stopListeners) return stopListeners;

  const appStateSubscription = AppState.addEventListener('change', (nextState) => {
    const becameActive = appState !== 'active' && nextState === 'active';
    appState = nextState;
    if (becameActive && connected !== false) {
      requestCoordinatedRefresh('foreground');
    }
  });

  const netInfoUnsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
    const wasConnected = connected;
    connected = isOnline(state);
    if (connected && wasConnected === false && appState === 'active') {
      requestCoordinatedRefresh('network');
    }
  });

  stopListeners = () => {
    appStateSubscription.remove();
    netInfoUnsubscribe();
    stopListeners = null;
    for (const task of tasks.values()) {
      if (task.timer) clearTimeout(task.timer);
      task.timer = null;
      task.pendingReason = null;
    }
  };
  return stopListeners;
}

function isOnline(state: NetInfoState): boolean {
  return state.isConnected !== false && state.isInternetReachable !== false;
}

function scheduleTask(task: RegisteredTask, reason: RefreshReason): void {
  if (task.inFlight) {
    task.pendingReason = reason;
    return;
  }

  const waitMs = task.lastStartedAt + task.cooldownMs - Date.now();
  if (waitMs > 0) {
    task.pendingReason = reason;
    if (!task.timer) {
      task.timer = setTimeout(() => {
        task.timer = null;
        const pendingReason = task.pendingReason;
        task.pendingReason = null;
        if (pendingReason) scheduleTask(task, pendingReason);
      }, waitMs);
    }
    return;
  }

  task.lastStartedAt = Date.now();
  task.inFlight = Promise.resolve(task.refresh(reason))
    .catch((error: unknown) => {
      if (__DEV__) console.warn('Coordinated refresh failed.', error);
    })
    .finally(() => {
      task.inFlight = null;
      const pendingReason = task.pendingReason;
      task.pendingReason = null;
      if (pendingReason) scheduleTask(task, pendingReason);
    });
}

