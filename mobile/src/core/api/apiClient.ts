/**
 * @format
 */

import { isOfflineMode } from '../../app/configuration/dataMode';
import { buildApiUrl, getApiConfig } from './apiConfig';
import {
  createNetworkError,
  createTimeoutError,
  normalizeApiError,
} from './apiError';
import { apiFailure, apiSuccess, ApiResult } from './apiResult';
import { defaultTokenStore, TokenStore } from '../auth/tokenStore';
import { sessionManager, SessionManager } from '../auth/sessionManager';

export type TransportAdapter = (
  input: string,
  init?: RequestInit,
) => Promise<Response>;

export interface RequestOptions {
  headers?: Record<string, string>;
  authRequired?: boolean;
  timeoutMs?: number;
  baseUrl?: string;
  signal?: AbortSignal;
  params?: Record<
    string,
    string | number | boolean | undefined | null | Array<string | number>
  >;
}

export interface RequestTelemetry {
  requestId: string;
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  url: string;
  status?: number;
  durationMs: number;
  ok: boolean;
  errorCode?: string;
}

export type TelemetryObserver = (telemetry: RequestTelemetry) => void;

/**
 * Standard fetch transport implementation.
 */
const defaultTransport: TransportAdapter = (input, init) => fetch(input, init);

/**
 * Generates a collision-resistant per-request correlation ID.
 */
function generateRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // Fallback to timestamp + random entropy
    }
  }
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 11);
  return `req-${ts}-${rand}`;
}

/**
 * Keys whose values must NEVER appear in client telemetry or diagnostic logs.
 */
const SENSITIVE_KEY_PATTERN =
  /^(authorization|phone|raw_phone|otp|code|token|auth_token|auth_session_token|identity_token|cit|password|secret)$/i;

/**
 * Recursively redacts sensitive credentials, tokens, phone numbers, and OTPs from log/telemetry objects.
 */
export function redactSensitiveData(data: unknown): unknown {
  if (data === null || data === undefined) {
    return data;
  }
  if (typeof data !== 'object') {
    return data;
  }
  if (Array.isArray(data)) {
    return data.map(item => redactSensitiveData(item));
  }
  const redacted: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      redacted[key] = '[REDACTED]';
    } else if (typeof val === 'object' && val !== null) {
      redacted[key] = redactSensitiveData(val);
    } else {
      redacted[key] = val;
    }
  }
  return redacted;
}

/**
 * Serializes query parameters into URL search string.
 */
function serializeQueryParams(
  params?: Record<
    string,
    string | number | boolean | undefined | null | Array<string | number>
  >,
): string {
  if (!params) {
    return '';
  }
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        searchParams.append(key, String(item));
      }
    } else {
      searchParams.append(key, String(value));
    }
  }
  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : '';
}

export class ApiClient {
  private transport: TransportAdapter;
  private tokenStore: TokenStore;
  private sessionMgr: SessionManager;
  private telemetryObservers: Set<TelemetryObserver> = new Set();

  constructor(
    transport: TransportAdapter = defaultTransport,
    tokenStore: TokenStore = defaultTokenStore,
    sessionMgr: SessionManager = sessionManager,
  ) {
    this.transport = transport;
    this.tokenStore = tokenStore;
    this.sessionMgr = sessionMgr;
  }

  /**
   * Registers a callback for request timing and status telemetry.
   * Telemetry payloads strictly redact Authorization, phone, OTP, CIT, and challenge tokens.
   */
  public onTelemetry(observer: TelemetryObserver): () => void {
    this.telemetryObservers.add(observer);
    return () => {
      this.telemetryObservers.delete(observer);
    };
  }

  private emitTelemetry(telemetry: RequestTelemetry): void {
    for (const observer of this.telemetryObservers) {
      try {
        observer(telemetry);
      } catch {
        // Telemetry observer exceptions must never affect API execution
      }
    }
  }

  /**
   * Allows injecting a custom TransportAdapter (e.g. mock transport in unit tests).
   */
  public setTransport(transport: TransportAdapter): void {
    this.transport = transport;
  }

  /**
   * Checks whether a non-empty session token is stored.
   */
  public async hasValidToken(): Promise<boolean> {
    return this.sessionMgr.hasValidToken();
  }

  /**
   * Internal request executor handling URL construction, correlation ID injection,
   * auth headers, timeouts, cancellation, 204 handling, telemetry, and error normalization.
   *
   * STRICT IDEMPOTENCY INVARIANT:
   * Non-idempotent POST requests are NEVER retried automatically. Explicit idempotency
   * key headers (Idempotency-Key / X-Idempotency-Key) are forwarded directly to the backend.
   */
  public async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    endpointPath: string,
    body?: unknown,
    options: RequestOptions = {},
  ): Promise<ApiResult<T>> {
    const startTime = Date.now();
    if (isOfflineMode() && method !== 'GET') {
      return apiFailure(
        createNetworkError('Offline Mode: reconnect to the BFF to submit changes.'),
      );
    }
    const config = getApiConfig();
    const effectiveConfig = options.baseUrl
      ? { ...config, baseUrl: options.baseUrl }
      : config;
    const query = serializeQueryParams(options.params);
    const fullUrl = `${buildApiUrl(endpointPath, effectiveConfig)}${query}`;

    // Generate or preserve request correlation ID
    const requestId =
      options.headers?.['X-Request-ID'] ||
      options.headers?.['x-request-id'] ||
      generateRequestId();

    const headers: Record<string, string> = {
      Accept: 'application/json',
      'X-Request-ID': requestId,
      ...(options.headers || {}),
    };
    headers['X-Request-ID'] = requestId;

    // Inject DRF Token header when required
    const authRequired = options.authRequired ?? true;
    if (authRequired && !headers.Authorization && !headers.authorization) {
      const token = await this.tokenStore.getToken();
      if (token && token.trim().length > 0) {
        headers.Authorization = `Token ${token.trim()}`;
      }
    }

    let requestBody: RequestInit['body'];
    if (body !== undefined && body !== null) {
      if (typeof FormData !== 'undefined' && body instanceof FormData) {
        requestBody = body as unknown as RequestInit['body'];
      } else if (typeof body === 'string') {
        requestBody = body;
        if (!headers['Content-Type']) {
          headers['Content-Type'] = 'application/json';
        }
      } else {
        requestBody = JSON.stringify(body);
        if (!headers['Content-Type']) {
          headers['Content-Type'] = 'application/json';
        }
      }
    }

    // Timeout & Abort management
    const timeoutMs = options.timeoutMs ?? config.defaultTimeoutMs;
    const controller = new AbortController();
    let isTimedOut = false;

    let timeoutTimer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      isTimedOut = true;
      controller.abort();
    }, timeoutMs);

    let callerAbortListener: (() => void) | null = null;
    if (options.signal) {
      if (options.signal.aborted) {
        controller.abort();
      } else {
        callerAbortListener = () => {
          controller.abort();
        };
        options.signal.addEventListener('abort', callerAbortListener);
      }
    }

    let responseStatus: number | undefined;
    let requestOk = false;
    let reportedErrorCode: string | undefined;

    try {
      const response = await this.transport(fullUrl, {
        method,
        headers,
        body: requestBody,
        signal: controller.signal,
      });

      responseStatus = response.status;

      // Handle 204 No Content
      if (response.status === 204) {
        requestOk = true;
        return apiSuccess(undefined as unknown as T, 204);
      }

      // Read response body safely
      let responseBody: unknown;
      const text = await response.text();
      if (text && text.trim().length > 0) {
        try {
          responseBody = JSON.parse(text);
        } catch {
          responseBody = text;
        }
      }

      // Check success
      if (response.ok) {
        requestOk = true;
        return apiSuccess(responseBody as T, response.status);
      }

      // STRICT 401 INVARIANT: Invalidate session ONLY on HTTP 401 Unauthorized
      if (response.status === 401) {
        await this.sessionMgr.handleUnauthorized();
      }

      const error = normalizeApiError(response.status, responseBody);
      reportedErrorCode =
        'code' in error && typeof (error as { code?: unknown }).code === 'string'
          ? (error as { code: string }).code
          : error.kind;
      return apiFailure(error, response.status);
    } catch (err: unknown) {
      if (isTimedOut) {
        const timeoutErr = createTimeoutError(`Request timed out after ${timeoutMs}ms.`);
        reportedErrorCode = timeoutErr.kind;
        return apiFailure(timeoutErr);
      }

      const message =
        err instanceof Error ? err.message : 'Network request failed.';
      const netErr = createNetworkError(message);
      reportedErrorCode = netErr.kind;
      return apiFailure(netErr);
    } finally {
      // Guarantee timeout timer is cleared and caller AbortSignal listener is detached on ALL exit paths
      if (timeoutTimer !== null) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
      if (options.signal && callerAbortListener) {
        options.signal.removeEventListener('abort', callerAbortListener);
        callerAbortListener = null;
      }

      // Emit structured request telemetry
      this.emitTelemetry({
        requestId,
        method,
        url: fullUrl,
        status: responseStatus,
        durationMs: Math.max(0, Date.now() - startTime),
        ok: requestOk,
        errorCode: reportedErrorCode,
      });
    }
  }

  public async get<T>(
    endpointPath: string,
    options?: RequestOptions,
  ): Promise<ApiResult<T>> {
    return this.request<T>('GET', endpointPath, undefined, options);
  }

  public async post<T>(
    endpointPath: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<ApiResult<T>> {
    return this.request<T>('POST', endpointPath, body, options);
  }

  public async patch<T>(
    endpointPath: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<ApiResult<T>> {
    return this.request<T>('PATCH', endpointPath, body, options);
  }

  public async put<T>(
    endpointPath: string,
    body?: unknown,
    options?: RequestOptions,
  ): Promise<ApiResult<T>> {
    return this.request<T>('PUT', endpointPath, body, options);
  }

  public async delete<T>(
    endpointPath: string,
    options?: RequestOptions,
  ): Promise<ApiResult<T>> {
    return this.request<T>('DELETE', endpointPath, undefined, options);
  }

  public async postMultipart<T>(
    endpointPath: string,
    formData: FormData,
    options?: RequestOptions,
  ): Promise<ApiResult<T>> {
    return this.request<T>('POST', endpointPath, formData, options);
  }
}

export const defaultApiClient = new ApiClient();
