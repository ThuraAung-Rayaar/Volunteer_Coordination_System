/**
 * @format
 */

export type DataMode = 'http' | 'offline' | 'mock';

let currentDataMode: DataMode = 'http';
const dataModeListeners = new Set<(mode: DataMode) => void>();

/**
 * Returns the active data mode ('http', 'offline', or test-only 'mock').
 * Defaults to 'http' so the app always connects to the BFF rather than template mode.
 */
export function getDataMode(): DataMode {
  return currentDataMode;
}

/**
 * Subscribes to runtime data mode changes.
 * Returns an unsubscribe callback.
 */
export function addDataModeListener(
  listener: (mode: DataMode) => void,
): () => void {
  dataModeListeners.add(listener);
  return () => {
    dataModeListeners.delete(listener);
  };
}

/**
 * Updates the active data mode and notifies registered listeners.
 */
export function setDataMode(mode: DataMode): void {
  currentDataMode = mode;
  dataModeListeners.forEach(listener => {
    try {
      listener(mode);
    } catch {
      // Listener error must not crash
    }
  });
}

/**
 * Convenience check for live HTTP mode.
 */
export function isHttpMode(): boolean {
  return currentDataMode === 'http';
}

/**
 * Convenience check for Offline cache mode.
 */
export function isOfflineMode(): boolean {
  return currentDataMode === 'offline';
}

/**
 * Convenience check for test-only Mock mode.
 */
export function isMockMode(): boolean {
  return currentDataMode === 'mock';
}

/**
 * Resets the data mode back to 'http' and notifies listeners.
 */
export function resetDataMode(): void {
  setDataMode('http');
}
