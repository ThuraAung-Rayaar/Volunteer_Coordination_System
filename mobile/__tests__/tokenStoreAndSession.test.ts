/**
 * @format
 */

import {
  AUTH_TOKEN_STORAGE_KEY,
  defaultTokenStore,
  getStorageCapabilityStatus,
  KeychainTokenStore,
  MemoryTokenStore,
  PluggableTokenStore,
  SessionStorageError,
} from '../src/core/auth/tokenStore';
import { SessionManager } from '../src/core/auth/sessionManager';

describe('TokenStore & SessionManager', () => {
  describe('MemoryTokenStore (Injected Test Store)', () => {
    it('sets, retrieves, and clears token in memory', async () => {
      const store = new MemoryTokenStore();
      expect(await store.getToken()).toBeNull();

      await store.setToken('test-drf-token-12345');
      expect(await store.getToken()).toBe('test-drf-token-12345');

      await store.clearToken();
      expect(await store.getToken()).toBeNull();
    });

    it('trims whitespace when storing token', async () => {
      const store = new MemoryTokenStore();
      await store.setToken('   abc123token   ');
      expect(await store.getToken()).toBe('abc123token');
    });

    it('supports preloading an initial token via constructor', async () => {
      const store = new MemoryTokenStore('  preloaded-token  ');
      expect(await store.getToken()).toBe('preloaded-token');
    });
  });

  describe('KeychainTokenStore (Declared Secure Storage)', () => {
    it('confirms defaultTokenStore defaults to Keychain hardware storage tier', async () => {
      expect(await defaultTokenStore.getStorageTier()).toBe('keychain');
    });

    it('isolates authentication token storage key from theme preference key', () => {
      expect(AUTH_TOKEN_STORAGE_KEY).toBe('@volunteer_mgmt:auth_token');
      expect(AUTH_TOKEN_STORAGE_KEY).not.toBe('@volunteer_mgmt:theme_preference');
    });

    it('successfully persists, retrieves, and clears token when Keychain is available', async () => {
      const mockStorage = new Map<string, string>();
      const mockKeychain = {
        setGenericPassword: jest.fn(async (username: string, password: string, options?: { service?: string }) => {
          const service = options?.service || AUTH_TOKEN_STORAGE_KEY;
          mockStorage.set(service, password);
          return true;
        }),
        getGenericPassword: jest.fn(async (options?: { service?: string }) => {
          const service = options?.service || AUTH_TOKEN_STORAGE_KEY;
          const password = mockStorage.get(service);
          return password ? { username: 'auth_token', password, service } : false;
        }),
        resetGenericPassword: jest.fn(async (options?: { service?: string }) => {
          const service = options?.service || AUTH_TOKEN_STORAGE_KEY;
          mockStorage.delete(service);
          return true;
        }),
      };

      const store = new KeychainTokenStore();
      (store as unknown as { getKeychain: () => unknown }).getKeychain = () => mockKeychain;

      expect(store.isAvailable()).toBe(true);

      // Initially null
      expect(await store.getToken()).toBeNull();

      // Persist
      await store.setToken('secure-hardware-token-001');
      expect(mockKeychain.setGenericPassword).toHaveBeenCalledWith(
        'auth_token',
        'secure-hardware-token-001',
        { service: AUTH_TOKEN_STORAGE_KEY },
      );
      expect(await store.getToken()).toBe('secure-hardware-token-001');

      // Clear
      await store.clearToken();
      expect(mockKeychain.resetGenericPassword).toHaveBeenCalledWith({
        service: AUTH_TOKEN_STORAGE_KEY,
      });
      expect(await store.getToken()).toBeNull();
    });

    it('clears token when setToken is called with an empty string', async () => {
      const store = new KeychainTokenStore();
      const clearSpy = jest.spyOn(store, 'clearToken').mockResolvedValue(undefined);

      await store.setToken('   ');
      expect(clearSpy).toHaveBeenCalled();
    });

    it('FAIL-CLOSED: throws SessionStorageError when Keychain is unavailable', async () => {
      const store = new KeychainTokenStore();
      (store as unknown as { getKeychain: () => unknown }).getKeychain = () => null;

      expect(store.isAvailable()).toBe(false);

      await expect(store.getToken()).rejects.toThrow(SessionStorageError);
      await expect(store.getToken()).rejects.toThrow(/unavailable/i);

      await expect(store.setToken('token-fail')).rejects.toThrow(SessionStorageError);
      await expect(store.clearToken()).rejects.toThrow(SessionStorageError);
    });

    it('FAIL-CLOSED: throws SessionStorageError when setGenericPassword returns false (rejected write)', async () => {
      const mockKeychain = {
        setGenericPassword: jest.fn(async () => false),
        getGenericPassword: jest.fn(async () => false),
        resetGenericPassword: jest.fn(async () => true),
      };

      const store = new KeychainTokenStore();
      (store as unknown as { getKeychain: () => unknown }).getKeychain = () => mockKeychain;

      await expect(store.setToken('rejected-token')).rejects.toThrow(SessionStorageError);
      try {
        await store.setToken('rejected-token');
      } catch (err) {
        expect(err).toBeInstanceOf(SessionStorageError);
        expect((err as SessionStorageError).code).toBe('SECURE_STORAGE_WRITE_REJECTED');
      }
    });

    it('FAIL-CLOSED: wraps driver native exceptions in SessionStorageError', async () => {
      const mockKeychain = {
        setGenericPassword: jest.fn(async () => {
          throw new Error('Keystore corrupted or locked');
        }),
        getGenericPassword: jest.fn(async () => {
          throw new Error('Keymaster communication fault');
        }),
        resetGenericPassword: jest.fn(async () => {
          throw new Error('Keychain item removal failed');
        }),
      };

      const store = new KeychainTokenStore();
      (store as unknown as { getKeychain: () => unknown }).getKeychain = () => mockKeychain;

      await expect(store.setToken('crash-token')).rejects.toThrow(SessionStorageError);
      try {
        await store.setToken('crash-token');
      } catch (err) {
        expect((err as SessionStorageError).code).toBe('SECURE_STORAGE_WRITE_ERROR');
      }

      await expect(store.getToken()).rejects.toThrow(SessionStorageError);
      try {
        await store.getToken();
      } catch (err) {
        expect((err as SessionStorageError).code).toBe('SECURE_STORAGE_READ_ERROR');
      }

      await expect(store.clearToken()).rejects.toThrow(SessionStorageError);
      try {
        await store.clearToken();
      } catch (err) {
        expect((err as SessionStorageError).code).toBe('SECURE_STORAGE_CLEAR_ERROR');
      }
    });
  });

  describe('Storage Capability Status & Diagnostics', () => {
    it('returns memory tier for MemoryTokenStore without leaking token values', () => {
      const memory = new MemoryTokenStore('secret-confidential-token-999');
      const status = getStorageCapabilityStatus(memory);

      expect(status.tier).toBe('memory');
      expect(status.isSecure).toBe(false);
      expect(status.isAvailable).toBe(true);

      const serialized = JSON.stringify(status);
      expect(serialized).not.toContain('secret-confidential');
    });

    it('returns keychain tier for KeychainTokenStore without leaking token values', () => {
      const status = getStorageCapabilityStatus(defaultTokenStore);
      expect(status.tier).toBe('keychain');
      expect(status.isSecure).toBe(true);
      expect(typeof status.isAvailable).toBe('boolean');
    });
  });

  describe('PluggableTokenStore Delegation', () => {
    it('uses custom storage backend when set', async () => {
      const memory = new MemoryTokenStore();
      const pluggable = new PluggableTokenStore();
      pluggable.setCustomStorage(memory);

      expect(await pluggable.getStorageTier()).toBe('custom');
      await pluggable.setToken('custom-token-xyz');
      expect(await pluggable.getToken()).toBe('custom-token-xyz');
      expect(await memory.getToken()).toBe('custom-token-xyz');

      await pluggable.clearToken();
      expect(await pluggable.getToken()).toBeNull();
      expect(await memory.getToken()).toBeNull();
    });

    it('uses explicitly injected fallback when provided', async () => {
      const memory = new MemoryTokenStore('fallback-token-456');
      const pluggable = new PluggableTokenStore(memory);

      expect(await pluggable.getStorageTier()).toBe('memory');
      expect(await pluggable.getToken()).toBe('fallback-token-456');

      await pluggable.setToken('updated-token');
      expect(await pluggable.getToken()).toBe('updated-token');
      expect(await memory.getToken()).toBe('updated-token');

      await pluggable.clearToken();
      expect(await pluggable.getToken()).toBeNull();
    });

    it('delegates to KeychainTokenStore when no custom storage or fallback is set', async () => {
      const pluggable = new PluggableTokenStore();
      expect(await pluggable.getStorageTier()).toBe('keychain');
    });
  });

  describe('SessionManager Lifecycle and Invariants', () => {
    let memoryStore: MemoryTokenStore;
    let sessionMgr: SessionManager;

    beforeEach(() => {
      memoryStore = new MemoryTokenStore();
      sessionMgr = new SessionManager(memoryStore);
    });

    it('correctly tracks authentication status with hasValidToken', async () => {
      expect(await sessionMgr.hasValidToken()).toBe(false);

      await sessionMgr.setToken('valid-token-777');
      expect(await sessionMgr.hasValidToken()).toBe(true);
      expect(await sessionMgr.getToken()).toBe('valid-token-777');

      await sessionMgr.logout();
      expect(await sessionMgr.hasValidToken()).toBe(false);
      expect(await sessionMgr.getToken()).toBeNull();
    });

    it('returns false for hasValidToken when token is only whitespace or empty', async () => {
      await sessionMgr.setToken('');
      expect(await sessionMgr.hasValidToken()).toBe(false);

      await sessionMgr.setToken('   ');
      expect(await sessionMgr.hasValidToken()).toBe(false);
    });

    it('fails closed: hasValidToken returns false when storage throws SessionStorageError', async () => {
      const brokenStore = new MemoryTokenStore();
      brokenStore.getToken = async () => {
        throw new SessionStorageError('Keystore unavailable', 'SECURE_STORAGE_UNAVAILABLE');
      };

      const manager = new SessionManager(brokenStore);
      expect(await manager.hasValidToken()).toBe(false);
    });

    it('invokes onUnauthorized listener ONLY when handleUnauthorized is called (HTTP 401)', async () => {
      await sessionMgr.setToken('session-token-999');

      let unauthorizedTriggered = false;
      const unsubscribe = sessionMgr.onUnauthorized(() => {
        unauthorizedTriggered = true;
      });

      await sessionMgr.handleUnauthorized();

      expect(unauthorizedTriggered).toBe(true);
      expect(await sessionMgr.getToken()).toBeNull();
      expect(await sessionMgr.hasValidToken()).toBe(false);

      unsubscribe();
    });

    it('allows unsubscribing from onUnauthorized callback', async () => {
      let callCount = 0;
      const unsubscribe = sessionMgr.onUnauthorized(() => {
        callCount++;
      });

      await sessionMgr.handleUnauthorized();
      expect(callCount).toBe(1);

      unsubscribe();

      await sessionMgr.handleUnauthorized();
      expect(callCount).toBe(1);
    });

    it('handles listener exceptions gracefully without aborting subsequent listeners', async () => {
      let secondListenerFired = false;
      sessionMgr.onUnauthorized(() => {
        throw new Error('Faulty listener');
      });
      sessionMgr.onUnauthorized(() => {
        secondListenerFired = true;
      });

      await expect(sessionMgr.handleUnauthorized()).resolves.toBeUndefined();
      expect(secondListenerFired).toBe(true);
    });

    it('CRITICAL INVARIANT: token is preserved on non-401 scenarios', async () => {
      await sessionMgr.setToken('secure-user-token');

      // Simulating what happens during 403, 404, 409, 429, 500, network/timeout errors:
      // handleUnauthorized is NOT called
      expect(await sessionMgr.getToken()).toBe('secure-user-token');
      expect(await sessionMgr.hasValidToken()).toBe(true);
    });

    it('allows dynamically swapping the TokenStore via setTokenStore', async () => {
      const anotherStore = new MemoryTokenStore('swapped-token-111');
      sessionMgr.setTokenStore(anotherStore);

      expect(await sessionMgr.getToken()).toBe('swapped-token-111');
      expect(await sessionMgr.hasValidToken()).toBe(true);
    });
  });
});
