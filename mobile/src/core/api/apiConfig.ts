/**
 * @format
 */

export interface ApiConfig {
  baseUrl: string;
  apiPrefix: string;
  defaultTimeoutMs: number;
}

/**
 * Host presets for development workflows:
 * - USB_DEVICE: For actual physical devices connected via USB cable.
 *   Using `adb reverse tcp:8000 tcp:8000`, the phone can route directly to the host PC's
 *   port 8000 over USB without needing Wi-Fi or changing local IP addresses.
 * - ANDROID_EMULATOR: For Android Studio QEMU Virtual Devices (AVD).
 * - IOS_SIMULATOR: For iOS simulators running on macOS host.
 */
export const API_HOST_PRESETS = {
  USB_DEVICE: 'http://localhost:8000',
  ANDROID_EMULATOR: 'http://10.0.2.2:8000',
  IOS_SIMULATOR: 'http://localhost:8000',
} as const;

export type ApiHostPreset = 'usb' | 'emulator';

/**
 * Resolves the default base host depending on platform and workflow.
 * Defaults to 'http://localhost:8000' so physical Android devices over USB
 * (with `adb reverse tcp:8000 tcp:8000`), iOS simulators, and web work immediately
 * without requiring Wi-Fi LAN setup.
 */
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
 * Subscribes to API configuration updates.
 * Returns an unsubscribe callback.
 */
export function addApiConfigListener(
  listener: (config: ApiConfig) => void,
): () => void {
  apiConfigListeners.add(listener);
  return () => {
    apiConfigListeners.delete(listener);
  };
}

/**
 * Returns current API configuration.
 */
export function getApiConfig(): ApiConfig {
  return { ...currentConfig };
}

/**
 * Updates partial or full API configuration and notifies subscribers.
 */
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

/**
 * Convenience helper to switch between USB device and emulator host presets.
 */
export function setApiHostPreset(preset: ApiHostPreset): void {
  setApiConfig({
    baseUrl:
      preset === 'usb'
        ? API_HOST_PRESETS.USB_DEVICE
        : API_HOST_PRESETS.ANDROID_EMULATOR,
  });
}

/**
 * Resets API configuration to platform defaults and notifies subscribers.
 */
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
