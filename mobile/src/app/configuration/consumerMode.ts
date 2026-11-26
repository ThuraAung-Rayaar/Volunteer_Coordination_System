/**
 * @format
 */

import { useEffect, useState } from 'react';

export interface ConsumerModeState {
  devOptionsEnabled: boolean;
  consumerOnly: boolean;
  exposeDebugErrors: boolean;
}

const DEFAULT_STATE: ConsumerModeState = {
  devOptionsEnabled: false,
  consumerOnly: true,
  exposeDebugErrors: false,
};

let currentState: ConsumerModeState = { ...DEFAULT_STATE };
const listeners = new Set<(state: ConsumerModeState) => void>();

function emitState(): void {
  const snapshot = getConsumerModeState();
  listeners.forEach(listener => {
    try {
      listener(snapshot);
    } catch {
      // Listener errors must never crash callers
    }
  });
}

export function getConsumerModeState(): ConsumerModeState {
  return { ...currentState };
}

export function isConsumerOnlyMode(): boolean {
  return currentState.consumerOnly;
}

export function isDevOptionsEnabled(): boolean {
  return currentState.devOptionsEnabled;
}

export function setConsumerModeState(
  next: Partial<ConsumerModeState> & { dev_options_enabled?: boolean; consumer_only?: boolean; expose_debug_errors?: boolean },
): ConsumerModeState {
  const devEnabled =
    typeof next.devOptionsEnabled === 'boolean'
      ? next.devOptionsEnabled
      : typeof next.dev_options_enabled === 'boolean'
        ? next.dev_options_enabled
        : typeof next.consumerOnly === 'boolean'
          ? !next.consumerOnly
          : typeof next.consumer_only === 'boolean'
            ? !next.consumer_only
            : currentState.devOptionsEnabled;

  const consumerOnly = !devEnabled;
  const exposeDebug = devEnabled
    ? Boolean(next.exposeDebugErrors ?? next.expose_debug_errors ?? currentState.exposeDebugErrors)
    : false;

  currentState = {
    devOptionsEnabled: devEnabled,
    consumerOnly,
    exposeDebugErrors: exposeDebug,
  };
  emitState();
  return getConsumerModeState();
}

export function resetConsumerModeState(): void {
  currentState = { ...DEFAULT_STATE };
  emitState();
}

export function addConsumerModeListener(
  listener: (state: ConsumerModeState) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useConsumerMode(): ConsumerModeState {
  const [state, setState] = useState<ConsumerModeState>(() =>
    getConsumerModeState(),
  );

  useEffect(() => {
    return addConsumerModeListener(next => {
      setState(next);
    });
  }, []);

  return state;
}

const TECHNICAL_ERROR_PATTERN =
  /(https?:\/\/|localhost|10\.0\.2\.2|127\.0\.0\.1|typeerror|syntaxerror|sqlite|postgres|traceback|exception|network request failed|timed out|timeout|http\s*\d{3}|econnrefused|status\s*code|\bdatabase\b|\bbff\b|\bfailed\b|\bfailure\b|\berror\b|\bsimulated\b)/i;

/**
 * Prevents developer diagnostics, URLs, stack traces, or technical error text
 * from reaching consumer-facing UI when Consumer-Only Mode is active.
 */
export function sanitizeConsumerMessage(
  rawMessage: string | null | undefined,
  fallbackMessage: string = 'Information will appear here once available.',
): string {
  const trimmed = (rawMessage ?? '').trim();
  if (!trimmed) {
    return fallbackMessage;
  }
  if (!currentState.consumerOnly) {
    return trimmed;
  }
  if (TECHNICAL_ERROR_PATTERN.test(trimmed)) {
    return fallbackMessage;
  }
  return trimmed;
}
