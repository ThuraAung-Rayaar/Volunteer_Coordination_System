/**
 * @format
 */

import {
  buildCandidateBaseUrls,
  DEFAULT_BFF_PORT,
  getApiConfig,
  normalizeBaseUrlInput,
  setApiConfig,
} from './apiConfig';
import { ApiClient, defaultApiClient } from './apiClient';
import {
  isConsumerOnlyMode,
  setConsumerModeState,
} from '../../app/configuration/consumerMode';
import { getDataMode, setDataMode } from '../../app/configuration/dataMode';

export type BffConnectionStatus = 'idle' | 'checking' | 'online' | 'offline';

export interface BffConnectionState {
  status: BffConnectionStatus;
  activeBaseUrl: string;
  port: number;
  latencyMs: number | null;
  lastCheckedAt: number | null;
  errorMessage: string | null;
  probedUrls: string[];
}

export interface BffProbeResult {
  baseUrl: string;
  ok: boolean;
  status: number;
  latencyMs: number;
  errorMessage?: string;
}

const DEFAULT_PROBE_TIMEOUT_MS = 1800;

let connectionState: BffConnectionState = {
  status: 'idle',
  activeBaseUrl: getApiConfig().baseUrl,
  port: DEFAULT_BFF_PORT,
  latencyMs: null,
  lastCheckedAt: null,
  errorMessage: null,
  probedUrls: [],
};

const listeners = new Set<(state: BffConnectionState) => void>();

function notifyListeners(): void {
  const snapshot = getBffConnectionState();
  listeners.forEach(listener => {
    try {
      listener(snapshot);
    } catch {
      // Listener errors must not break discovery
    }
  });
}

export function getBffConnectionState(): BffConnectionState {
  return { ...connectionState, probedUrls: [...connectionState.probedUrls] };
}

export function addBffConnectionListener(
  listener: (state: BffConnectionState) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetBffConnectionState(): void {
  connectionState = {
    status: 'idle',
    activeBaseUrl: getApiConfig().baseUrl,
    port: DEFAULT_BFF_PORT,
    latencyMs: null,
    lastCheckedAt: null,
    errorMessage: null,
    probedUrls: [],
  };
  notifyListeners();
}

/**
 * Tests a single BFF origin using the lightweight unauthenticated charity-fields endpoint.
 */
export async function probeBffEndpoint(
  baseUrl: string,
  timeoutMs: number = DEFAULT_PROBE_TIMEOUT_MS,
  client: ApiClient = defaultApiClient,
): Promise<BffProbeResult> {
  const normalizedBase = normalizeBaseUrlInput(baseUrl);
  const start = Date.now();
  const res = await client.get<unknown>('charity-fields/', {
    authRequired: false,
    timeoutMs,
    baseUrl: normalizedBase,
  });
  const latencyMs = Math.max(0, Date.now() - start);

  if (res.ok) {
    return {
      baseUrl: normalizedBase,
      ok: true,
      status: res.status,
      latencyMs,
    };
  }

  return {
    baseUrl: normalizedBase,
    ok: false,
    status: res.status ?? 0,
    latencyMs,
    errorMessage: res.error.message,
  };
}

export interface ClientConfigResponse {
  dev_options_enabled?: boolean;
  consumer_only?: boolean;
  expose_debug_errors?: boolean;
  show_dev_tools?: boolean;
}

/**
 * Fetches public runtime flags from `/api/v1/client-config/` so the backend toggle
 * immediately switches mobile between Consumer-Only Mode and Developer Options.
 */
export async function syncClientRuntimeConfig(
  baseUrl: string = getApiConfig().baseUrl,
  timeoutMs: number = DEFAULT_PROBE_TIMEOUT_MS,
  client: ApiClient = defaultApiClient,
): Promise<void> {
  try {
    const res = await client.get<ClientConfigResponse>('client-config/', {
      authRequired: false,
      timeoutMs,
      baseUrl: normalizeBaseUrlInput(baseUrl),
    });
    if (res.ok && res.data && typeof res.data === 'object') {
      setConsumerModeState({
        dev_options_enabled: res.data.dev_options_enabled,
        consumer_only: res.data.consumer_only,
        expose_debug_errors: res.data.expose_debug_errors,
      });
    }
  } catch {
    // Keep existing consumer-mode default if endpoint is unreachable
  }
}

export interface DiscoverBffOptions {
  port?: number;
  customBaseUrl?: string;
  timeoutMs?: number;
  client?: ApiClient;
}

/**
 * Automatically probes localhost / emulator host candidates (plus any custom host/port),
 * locks ApiConfig onto the first reachable BFF, and records connection diagnostics.
 */
export async function discoverAndConnectBff(
  options: DiscoverBffOptions = {},
): Promise<BffConnectionState> {
  const port = options.port ?? connectionState.port ?? DEFAULT_BFF_PORT;
  const timeoutMs = options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
  const client = options.client ?? defaultApiClient;
  const candidates = buildCandidateBaseUrls(port, options.customBaseUrl);

  connectionState = {
    ...connectionState,
    status: 'checking',
    port,
    errorMessage: null,
    probedUrls: candidates,
  };
  notifyListeners();

  let lastError: string | null = null;
  for (const candidate of candidates) {
    const probe = await probeBffEndpoint(candidate, timeoutMs, client);
    if (probe.ok) {
      setApiConfig({ baseUrl: probe.baseUrl });
      if (getDataMode() === 'offline') {
        setDataMode('http');
      }
      await syncClientRuntimeConfig(probe.baseUrl, timeoutMs, client);
      connectionState = {
        status: 'online',
        activeBaseUrl: probe.baseUrl,
        port,
        latencyMs: probe.latencyMs,
        lastCheckedAt: Date.now(),
        errorMessage: null,
        probedUrls: candidates,
      };
      notifyListeners();
      return getBffConnectionState();
    }
    lastError = probe.errorMessage ?? `HTTP ${probe.status}`;
  }

  connectionState = {
    status: 'offline',
    activeBaseUrl: getApiConfig().baseUrl,
    port,
    latencyMs: null,
    lastCheckedAt: Date.now(),
    errorMessage: isConsumerOnlyMode()
      ? 'Service is currently unavailable.'
      : lastError ||
        `Unable to reach local BFF on port ${port} (tried ${candidates.join(', ')}).`,
    probedUrls: candidates,
  };
  notifyListeners();
  return getBffConnectionState();
}

/**
 * Tests the currently configured BFF URL directly without switching hosts unless requested.
 */
export async function testCurrentBffConnection(
  timeoutMs: number = 3000,
  client: ApiClient = defaultApiClient,
): Promise<BffConnectionState> {
  const currentBase = getApiConfig().baseUrl;
  connectionState = {
    ...connectionState,
    status: 'checking',
    activeBaseUrl: currentBase,
    errorMessage: null,
  };
  notifyListeners();

  const probe = await probeBffEndpoint(currentBase, timeoutMs, client);
  if (probe.ok) {
    if (getDataMode() === 'offline') {
      setDataMode('http');
    }
    await syncClientRuntimeConfig(probe.baseUrl, timeoutMs, client);
    connectionState = {
      ...connectionState,
      status: 'online',
      activeBaseUrl: probe.baseUrl,
      latencyMs: probe.latencyMs,
      lastCheckedAt: Date.now(),
      errorMessage: null,
    };
  } else {
    connectionState = {
      ...connectionState,
      status: 'offline',
      activeBaseUrl: probe.baseUrl,
      latencyMs: probe.latencyMs,
      lastCheckedAt: Date.now(),
      errorMessage: isConsumerOnlyMode()
        ? 'Service is currently unavailable.'
        : probe.errorMessage ?? `BFF returned HTTP ${probe.status}`,
    };
  }
  notifyListeners();
  return getBffConnectionState();
}
