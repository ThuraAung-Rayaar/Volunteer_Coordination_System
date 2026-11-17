/**
 * @format
 */

import {
  AUTH_TOKEN_STORAGE_KEY,
  MemoryTokenStore,
  PluggableTokenStore,
} from '../src/core/auth/tokenStore';
import { SessionManager } from '../src/core/auth/sessionManager';

describe('TokenStore & SessionManager', () => {
  describe('MemoryTokenStore', () => {
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
  });

  describe('PluggableTokenStore', () => {
    it('uses custom storage backend when provided', async () => {
      const memory = new MemoryTokenStore();
      const pluggable = new PluggableTokenStore();
      pluggable.setCustomStorage(memory);

      await pluggable.setToken('custom-token-xyz');
      expect(await pluggable.getToken()).toBe('custom-token-xyz');

      await pluggable.clearToken();
      expect(await pluggable.getToken()).toBeNull();
    });

    it('isolates authentication token storage key from theme preference key', () => {
      expect(AUTH_TOKEN_STORAGE_KEY).toBe('@volunteer_mgmt:auth_token');
      expect(AUTH_TOKEN_STORAGE_KEY).not.toBe('@volunteer_mgmt:theme_preference');
    });

    it('falls back to internal memory storage when AsyncStorage is absent', async () => {
      const pluggable = new PluggableTokenStore();
      await pluggable.setToken('fallback-token');
      expect(await pluggable.getToken()).toBe('fallback-token');
      await pluggable.clearToken();
      expect(await pluggable.getToken()).toBeNull();
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

    it('CRITICAL INVARIANT: token is preserved on non-401 scenarios', async () => {
      await sessionMgr.setToken('secure-user-token');

      // Simulating what happens during 403, 404, 409, 429, 500, network/timeout errors:
      // handleUnauthorized is NOT called
      expect(await sessionMgr.getToken()).toBe('secure-user-token');
      expect(await sessionMgr.hasValidToken()).toBe(true);
    });
  });
});
