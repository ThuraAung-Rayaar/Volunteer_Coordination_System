/**
 * @format
 */

export type DataMode = 'mock' | 'http';

let currentDataMode: DataMode = 'mock';
const dataModeListeners = new Set<(mode: DataMode) => void>();

/**
 * Returns the active data mode ('mock' or 'http').
 * Defaults to 'mock' to preserve offline/mock baseline until explicitly enabled.
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
 * Convenience check for HTTP mode.
 */
export function isHttpMode(): boolean {
  return currentDataMode === 'http';
}

/**
 * Convenience check for Mock mode.
 */
export function isMockMode(): boolean {
  return currentDataMode === 'mock';
}

/**
 * Resets the data mode back to the default 'mock' and notifies listeners.
 */
export function resetDataMode(): void {
  currentDataMode = 'mock';
  dataModeListeners.forEach(listener => {
    try {
      listener('mock');
    } catch {
      // Listener error must not crash
    }
  });
}
