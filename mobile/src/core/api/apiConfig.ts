/**
 * @format
 */

import { Platform } from 'react-native';

export interface ApiConfig {
  baseUrl: string;
  apiPrefix: string;
  defaultTimeoutMs: number;
}

/**
 * Resolves the default base host depending on platform.
 * Android emulator routes host machine loopback to 10.0.2.2.
 * iOS simulators and web default to localhost.
 */
function getDefaultBaseHost(): string {
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8000';
  }
  return 'http://localhost:8000';
}

const DEFAULT_CONFIG: ApiConfig = {
  baseUrl: getDefaultBaseHost(),
  apiPrefix: '/api/v1',
  defaultTimeoutMs: 15000,
};

let currentConfig: ApiConfig = { ...DEFAULT_CONFIG };

/**
 * Returns current API configuration.
 */
export function getApiConfig(): ApiConfig {
  return { ...currentConfig };
}

/**
 * Updates partial or full API configuration.
 */
export function setApiConfig(overrides: Partial<ApiConfig>): void {
  currentConfig = {
    ...currentConfig,
    ...overrides,
  };
}

/**
 * Resets API configuration to platform defaults.
 */
export function resetApiConfig(): void {
  currentConfig = { ...DEFAULT_CONFIG };
}

/**
 * Builds a normalized, absolute URL for a given BFF endpoint path.
 * Guarantees exactly one leading slash on prefix and endpoint without duplicate slashes.
 *
 * Example:
 * buildApiUrl('/events/') -> "http://10.0.2.2:8000/api/v1/events/"
 * buildApiUrl('auth/otp/request/') -> "http://10.0.2.2:8000/api/v1/auth/otp/request/"
 */
export function buildApiUrl(endpointPath: string, config: ApiConfig = currentConfig): string {
  const normalizedBase = config.baseUrl.replace(/\/+$/, '');
  const prefix = config.apiPrefix ? `/${config.apiPrefix.replace(/^\/+|\/+$/g, '')}` : '';
  const cleanPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;

  // If path already starts with the prefix, don't duplicate it
  if (prefix && cleanPath.startsWith(prefix)) {
    return `${normalizedBase}${cleanPath}`;
  }

  return `${normalizedBase}${prefix}${cleanPath}`;
}
