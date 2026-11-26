/**
 * @format
 */

export const DEFAULT_BFF_PORT = 8000;

export interface ApiConfig {
  baseUrl: string;
  apiPrefix: string;
  defaultTimeoutMs: number;
}

/**
 * Host presets for development workflows:
 * - USB_DEVICE: Physical devices connected via USB (`adb reverse tcp:8000 tcp:8000`),
 *   iOS simulator, or local desktop loopback.
 * - ANDROID_EMULATOR: Android Studio QEMU Virtual Devices (AVD).
 * - IOS_SIMULATOR: iOS simulators running on macOS host.
 */
export const API_HOST_PRESETS = {
  USB_DEVICE: `http://localhost:${DEFAULT_BFF_PORT}`,
  ANDROID_EMULATOR: `http://10.0.2.2:${DEFAULT_BFF_PORT}`,
  IOS_SIMULATOR: `http://localhost:${DEFAULT_BFF_PORT}`,
} as const;

export type ApiHostPreset = 'usb' | 'emulator';

function getDefaultBaseHost(): string {
  return API_HOST_PRESETS.USB_DEVICE;
}

const DEFAULT_CONFIG: ApiConfig = {
  baseUrl: getDefaultBaseHost(),
  apiPrefix: '/api/v1',
  defaultTimeoutMs: 15000,
};

let currentConfig: ApiConfig = { ...DEFAULT_CONFIG };
const apiConfigListeners = new Set<(config: ApiConfig) => void>();

/**
 * Normalizes a user-supplied host or URL into a clean http(s)://host:port origin.
 */
export function normalizeBaseUrlInput(rawInput: string, defaultPort: number = DEFAULT_BFF_PORT): string {
  const trimmed = rawInput.trim().replace(/\/+$/, '');
  if (!trimmed) {
    return getDefaultBaseHost();
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (/^\d+$/.test(trimmed)) {
    return `http://localhost:${trimmed}`;
  }
  if (trimmed.includes(':')) {
    return `http://${trimmed}`;
  }
  return `http://${trimmed}:${defaultPort}`;
}

/**
 * Builds prioritized candidate BFF base URLs for automatic localhost/emulator discovery.
 */
export function buildCandidateBaseUrls(
  port: number = DEFAULT_BFF_PORT,
  preferredBaseUrl?: string,
): string[] {
  const safePort = Number.isFinite(port) && port > 0 ? Math.floor(port) : DEFAULT_BFF_PORT;
  const candidates: string[] = [];

  const pushUnique = (url?: string) => {
    if (!url) return;
    const normalized = url.trim().replace(/\/+$/, '');
    if (normalized && !candidates.includes(normalized)) {
      candidates.push(normalized);
    }
  };

  if (preferredBaseUrl) {
    pushUnique(normalizeBaseUrlInput(preferredBaseUrl, safePort));
  }
  pushUnique(`http://localhost:${safePort}`);
  pushUnique(`http://10.0.2.2:${safePort}`);
  pushUnique(`http://127.0.0.1:${safePort}`);

  return candidates;
}

export function addApiConfigListener(
  listener: (config: ApiConfig) => void,
): () => void {
  apiConfigListeners.add(listener);
  return () => {
    apiConfigListeners.delete(listener);
  };
}

export function getApiConfig(): ApiConfig {
  return { ...currentConfig };
}

export function setApiConfig(overrides: Partial<ApiConfig>): void {
  currentConfig = {
    ...currentConfig,
    ...overrides,
  };
  apiConfigListeners.forEach(listener => {
    try {
      listener({ ...currentConfig });
    } catch {
      // Listener error must not crash
    }
  });
}

export function setApiHostPreset(preset: ApiHostPreset): void {
  setApiConfig({
    baseUrl:
      preset === 'usb'
        ? API_HOST_PRESETS.USB_DEVICE
        : API_HOST_PRESETS.ANDROID_EMULATOR,
  });
}

export function setApiPort(port: number): void {
  const safePort = Number.isFinite(port) && port > 0 ? Math.floor(port) : DEFAULT_BFF_PORT;
  const match = currentConfig.baseUrl.match(/^(https?:\/\/[^:/]+)(?::\d+)?/i);
  const hostPrefix = match ? match[1] : 'http://localhost';
  setApiConfig({ baseUrl: `${hostPrefix}:${safePort}` });
}

export function resetApiConfig(): void {
  currentConfig = { ...DEFAULT_CONFIG };
  apiConfigListeners.forEach(listener => {
    try {
      listener({ ...currentConfig });
    } catch {
      // Listener error must not crash
    }
  });
}

export function buildApiUrl(endpointPath: string, config: ApiConfig = currentConfig): string {
  const normalizedBase = config.baseUrl.replace(/\/+$/, '');
  const prefix = config.apiPrefix ? `/${config.apiPrefix.replace(/^\/+|\/+$/g, '')}` : '';
  const cleanPath = endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`;

  if (prefix && cleanPath.startsWith(prefix)) {
    return `${normalizedBase}${cleanPath}`;
  }

  return `${normalizedBase}${prefix}${cleanPath}`;
}
