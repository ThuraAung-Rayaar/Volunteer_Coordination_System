/**
 * @format
 * Persistent installation & onboarding state storage.
 */

export const INSTALL_SETUP_STORAGE_KEY = '@vcs:install_setup_completed_v1';

export interface InstallSetupStorage {
  getHasCompletedSetup(): Promise<boolean>;
  setHasCompletedSetup(completed: boolean): Promise<void>;
}

class MemoryInstallSetupStorage implements InstallSetupStorage {
  private completed = false;

  async getHasCompletedSetup(): Promise<boolean> {
    return this.completed;
  }

  async setHasCompletedSetup(completed: boolean): Promise<void> {
    this.completed = completed;
  }
}

export class PluggableInstallSetupStorage implements InstallSetupStorage {
  private fallback: InstallSetupStorage = new MemoryInstallSetupStorage();
  private customStorage: InstallSetupStorage | null = null;

  public setCustomStorage(storage: InstallSetupStorage | null): void {
    this.customStorage = storage;
  }

  private getAsyncStorage(): {
    getItem: (key: string) => Promise<string | null>;
    setItem: (key: string, value: string) => Promise<void>;
  } | null {
    try {
      const mod = require('@react-native-async-storage/async-storage');
      const asyncStorage = mod?.default || mod;
      if (
        asyncStorage &&
        typeof asyncStorage.getItem === 'function' &&
        typeof asyncStorage.setItem === 'function'
      ) {
        return asyncStorage;
      }
    } catch {
      // Native package not installed; fallback to memory storage
    }
    return null;
  }

  async getHasCompletedSetup(): Promise<boolean> {
    if (this.customStorage) {
      return this.customStorage.getHasCompletedSetup();
    }
    const asyncStorage = this.getAsyncStorage();
    if (asyncStorage) {
      try {
        const val = await asyncStorage.getItem(INSTALL_SETUP_STORAGE_KEY);
        if (val === 'true') return true;
        if (val === 'false') return false;
      } catch {
        // Ignore storage read errors
      }
    }
    return this.fallback.getHasCompletedSetup();
  }

  async setHasCompletedSetup(completed: boolean): Promise<void> {
    if (this.customStorage) {
      return this.customStorage.setHasCompletedSetup(completed);
    }
    const asyncStorage = this.getAsyncStorage();
    if (asyncStorage) {
      try {
        await asyncStorage.setItem(
          INSTALL_SETUP_STORAGE_KEY,
          completed ? 'true' : 'false',
        );
      } catch {
        // Ignore storage write errors
      }
    }
    return this.fallback.setHasCompletedSetup(completed);
  }
}

export const defaultInstallSetupStorage = new PluggableInstallSetupStorage();
