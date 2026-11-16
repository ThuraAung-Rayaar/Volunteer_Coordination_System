/**
 * @format
 */

import { buildApiUrl, getApiConfig } from './apiConfig';
import {
  AppError,
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
  signal?: AbortSignal;
  params?: Record<
    string,
    string | number | boolean | undefined | null | Array<string | number>
  >;
}

/**
 * Standard fetch transport implementation.
 */
const defaultTransport: TransportAdapter = (input, init) => fetch(input, init);

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
   * Internal request executor handling URL construction, auth headers, timeouts,
   * cancellation, 204 handling, and error normalization.
   */
  public async request<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
    endpointPath: string,
    body?: unknown,
    options: RequestOptions = {},
  ): Promise<ApiResult<T>> {
    const config = getApiConfig();
    const query = serializeQueryParams(options.params);
    const fullUrl = `${buildApiUrl(endpointPath, config)}${query}`;

    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(options.headers || {}),
    };

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

    const timeoutTimer = setTimeout(() => {
      isTimedOut = true;
      controller.abort();
    }, timeoutMs);

    // If caller provided their own signal, listen to it as well
    if (options.signal) {
      options.signal.addEventListener('abort', () => {
        controller.abort();
      });
    }

    try {
      const response = await this.transport(fullUrl, {
        method,
        headers,
        body: requestBody,
        signal: controller.signal,
      });

      clearTimeout(timeoutTimer);

      // Handle 204 No Content
      if (response.status === 204) {
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
        return apiSuccess(responseBody as T, response.status);
      }

      // On 401 Unauthorized, invalidate session immediately
      if (response.status === 401) {
        await this.sessionMgr.handleUnauthorized();
      }

      const error = normalizeApiError(response.status, responseBody);
      return apiFailure(error, response.status);
    } catch (err: unknown) {
      clearTimeout(timeoutTimer);

      if (isTimedOut) {
        return apiFailure(createTimeoutError(`Request timed out after ${timeoutMs}ms.`));
      }

      const message =
        err instanceof Error ? err.message : 'Network request failed.';
      return apiFailure(createNetworkError(message));
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
