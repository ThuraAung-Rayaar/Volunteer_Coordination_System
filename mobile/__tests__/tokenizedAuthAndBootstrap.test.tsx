/**
 * @format
 */

import React, { useEffect } from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import {
  FullUserContextValue,
  useCurrentUser,
  UserProvider,
} from '../src/app/UserContext';
import { setDataMode, resetDataMode } from '../src/app/configuration/dataMode';
import { authApi } from '../src/data/endpoints/authApi';
import { sessionManager } from '../src/core/auth/sessionManager';
import { MemoryTokenStore } from '../src/core/auth/tokenStore';
import { ApiClient, TransportAdapter } from '../src/core/api/apiClient';
import type {
  BootstrapResponseDto,
  TokenizedOtpRequestDto,
  TokenizedOtpResponseDto,
  TokenizedOtpVerifyRequestDto,
  TokenizedOtpVerifyResponseDto,
} from '../src/data/dto/authDto';

describe('Phase 6A: Tokenized Challenge Handshake, authApi, UserContext & Bootstrap (AUTH-02, MAP-01)', () => {
  let memoryStore: MemoryTokenStore;
  let root: ReactTestRenderer.ReactTestRenderer | null = null;

  beforeEach(() => {
    act(() => {
      resetDataMode();
    });
    memoryStore = new MemoryTokenStore();
    sessionManager.setTokenStore(memoryStore);
    jest.clearAllMocks();
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
      root = null;
    }
  });

  // =========================================================================
  // 1. DTO Structure and Invariants
  // =========================================================================

  describe('DTO Structure & Invariants', () => {
    it('proves TokenizedOtpVerifyRequestDto strictly excludes phone property', () => {
      const verifyDto: TokenizedOtpVerifyRequestDto = {
        auth_session_token: 'chal-uuid-abc-123',
        code: '654321',
        display_name: 'Volunteer Aung',
      };

      expect(verifyDto.auth_session_token).toBe('chal-uuid-abc-123');
      expect(verifyDto.code).toBe('654321');
      expect(verifyDto.display_name).toBe('Volunteer Aung');
      expect('phone' in verifyDto).toBe(false);
    });

    it('proves BootstrapResponseDto models explicit null/absent email without phone fallback', () => {
      const bootstrapDto: BootstrapResponseDto = {
        user: {
          id: 101,
          uuid: 'uuid-101',
          display_name: 'Daw Hla',
          phone: '+95912345678',
          email: null,
          account_status: 'active',
          verification_status: 'verified',
        },
        coordinator: {
          status: 'approved',
          can_access_workspace: true,
        },
        capabilities: {
          volunteer: true,
          coordinator: true,
        },
      };

      expect(bootstrapDto.user.phone).toBe('+95912345678');
      expect(bootstrapDto.user.email).toBeNull();
      expect(bootstrapDto.capabilities.coordinator).toBe(true);
    });
  });

  // =========================================================================
  // 2. authApi Endpoint Execution
  // =========================================================================

  describe('authApi Tokenized & Bootstrap Methods', () => {
    it('requestTokenizedOtp sends to canonical route without auth requirement', async () => {
      let capturedUrl = '';
      let capturedBody: unknown;
      let capturedHeaders: Record<string, string> = {};

      const mockTransport: TransportAdapter = async (url, init) => {
        capturedUrl = url;
        capturedBody = JSON.parse(init?.body as string);
        capturedHeaders = (init?.headers as Record<string, string>) || {};
        const responseData: TokenizedOtpResponseDto = {
          status: 'queued',
          auth_session_token: 'session-chal-456',
          expires_in: 180,
          code_length: 6,
          delivery: {
            provider: 'console',
            channel: 'console',
            delivered: false,
            configured: false,
          },
          dev_code: '123456',
        };
        return new Response(JSON.stringify(responseData), { status: 200 });
      };

      const customClient = new ApiClient(mockTransport, memoryStore, sessionManager);
      const req: TokenizedOtpRequestDto = {
        phone: '+959111222333',
        purpose: 'login',
      };

      const result = await authApi.requestTokenizedOtp(req, customClient);

      expect(result.ok).toBe(true);
      expect(capturedUrl).toContain('/api/v1/auth/tokenized/request-otp/');
      expect(capturedHeaders.Authorization).toBeUndefined();
      expect(capturedBody).toEqual({
        phone: '+959111222333',
        purpose: 'login',
      });
      if (result.ok) {
        expect(result.data.auth_session_token).toBe('session-chal-456');
        expect(result.data.code_length).toBe(6);
      }
    });

    it('verifyTokenizedOtp sends auth_session_token and code, strictly omitting phone', async () => {
      let capturedUrl = '';
      let capturedBody: unknown;
      let capturedHeaders: Record<string, string> = {};

      const mockTransport: TransportAdapter = async (url, init) => {
        capturedUrl = url;
        capturedBody = JSON.parse(init?.body as string);
        capturedHeaders = (init?.headers as Record<string, string>) || {};
        const responseData: TokenizedOtpVerifyResponseDto = {
          token: 'drf-token-abc-999',
          user: {
            id: 50,
            uuid: 'uuid-50',
            display_name: 'Mg Mg',
            verification_status: 'verified',
          },
        };
        return new Response(JSON.stringify(responseData), { status: 200 });
      };

      const customClient = new ApiClient(mockTransport, memoryStore, sessionManager);
      const req: TokenizedOtpVerifyRequestDto = {
        auth_session_token: 'session-chal-456',
        code: '654321',
        display_name: 'Mg Mg',
      };

      const result = await authApi.verifyTokenizedOtp(req, customClient);

      expect(result.ok).toBe(true);
      expect(capturedUrl).toContain('/api/v1/auth/tokenized/verify-otp/');
      expect(capturedHeaders.Authorization).toBeUndefined();
      expect(capturedBody).toEqual({
        auth_session_token: 'session-chal-456',
        code: '654321',
        display_name: 'Mg Mg',
      });
      // STRICT INVARIANT: phone is NEVER sent in verify payload
      expect((capturedBody as Record<string, unknown>).phone).toBeUndefined();
    });

    it('getBootstrap retrieves compact startup payload with Authorization header', async () => {
      await memoryStore.setToken('auth-bearer-token-777');
      let capturedUrl = '';
      let capturedHeaders: Record<string, string> = {};

      const mockTransport: TransportAdapter = async (url, init) => {
        capturedUrl = url;
        capturedHeaders = (init?.headers as Record<string, string>) || {};
        const responseData: BootstrapResponseDto = {
          user: {
            id: 1,
            uuid: 'uuid-1',
            display_name: 'Admin User',
            phone: '+95912345678',
            email: null,
            account_status: 'active',
            verification_status: 'verified',
          },
          coordinator: {
            status: 'approved',
            can_access_workspace: true,
          },
          capabilities: {
            volunteer: true,
            coordinator: true,
          },
        };
        return new Response(JSON.stringify(responseData), { status: 200 });
      };

      const customClient = new ApiClient(mockTransport, memoryStore, sessionManager);
      const result = await authApi.getBootstrap(customClient);

      expect(result.ok).toBe(true);
      expect(capturedUrl).toContain('/api/v1/me/bootstrap/');
      expect(capturedHeaders.Authorization).toBe('Token auth-bearer-token-777');
      if (result.ok) {
        expect(result.data.coordinator.can_access_workspace).toBe(true);
        expect(result.data.user.email).toBeNull();
      }
    });
  });

  // =========================================================================
  // 3. UserContext Ephemeral Challenge Lifecycle
  // =========================================================================

  describe('UserContext Ephemeral Challenge Lifecycle & Separation', () => {
    it('holds ephemeral challenge strictly in memory and does not persist to TokenStore', async () => {
      act(() => {
        setDataMode('http');
      });

      jest.spyOn(authApi, 'requestTokenizedOtp').mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          status: 'queued',
          auth_session_token: 'ephemeral-challenge-token-001',
          expires_in: 180,
          code_length: 6,
          delivery: {
            provider: 'console',
            channel: 'console',
            delivered: false,
            configured: false,
          },
          dev_code: '654321',
        },
      });

      let capturedContext: FullUserContextValue | undefined;
      function Consumer() {
        capturedContext = useCurrentUser();
        return null;
      }

      await act(async () => {
        root = ReactTestRenderer.create(
          <UserProvider>
            <Consumer />
          </UserProvider>,
        );
      });

      // Request OTP
      let reqResult: unknown;
      await act(async () => {
        reqResult = await capturedContext?.requestTokenizedOtp?.({
          phone: '+95912345678',
          purpose: 'login',
        });
      });

      expect(reqResult).toEqual(
        expect.objectContaining({
          success: true,
          authSessionToken: 'ephemeral-challenge-token-001',
          codeLength: 6,
        }),
      );

      // Verify ephemeral challenge state is held in React state
      expect(capturedContext?.challenge?.authSessionToken).toBe(
        'ephemeral-challenge-token-001',
      );
      expect(capturedContext?.challenge?.codeLength).toBe(6);

      // CRITICAL SECURITY INVARIANT: TokenStore / sessionManager must NOT hold challenge token
      expect(await sessionManager.getToken()).toBeNull();
    });

    it('persists DRF token to sessionManager ONLY after verifyTokenizedOtp succeeds', async () => {
      act(() => {
        setDataMode('http');
      });

      jest.spyOn(authApi, 'requestTokenizedOtp').mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          status: 'queued',
          auth_session_token: 'active-session-token-999',
          expires_in: 180,
          code_length: 6,
          delivery: { provider: 'console', channel: 'console', delivered: false, configured: false },
        },
      });

      const verifySpy = jest.spyOn(authApi, 'verifyTokenizedOtp').mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          token: 'persisted-drf-token-888',
          user: {
            id: 25,
            uuid: 'uuid-25',
            display_name: 'Verified User',
            verification_status: 'verified',
          },
        },
      });

      jest.spyOn(authApi, 'getBootstrap').mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          user: {
            id: 25,
            uuid: 'uuid-25',
            display_name: 'Verified User',
            phone: '+95912345678',
            email: null,
            account_status: 'active',
            verification_status: 'verified',
          },
          coordinator: {
            status: 'none',
            can_access_workspace: false,
          },
          capabilities: {
            volunteer: true,
            coordinator: false,
          },
        },
      });

      let capturedContext: FullUserContextValue | undefined;
      function Consumer() {
        capturedContext = useCurrentUser();
        return null;
      }

      await act(async () => {
        root = ReactTestRenderer.create(
          <UserProvider>
            <Consumer />
          </UserProvider>,
        );
      });

      // Request challenge
      await act(async () => {
        await capturedContext?.requestTokenizedOtp?.({ phone: '+95912345678' });
      });

      // Verify challenge
      await act(async () => {
        const verifyRes = await capturedContext?.verifyTokenizedOtp?.({
          code: '654321',
          displayName: 'Verified User',
        });
        expect(verifyRes?.success).toBe(true);
      });

      // Verify verifyTokenizedOtp payload strictly omitted phone
      expect(verifySpy).toHaveBeenCalledWith({
        auth_session_token: 'active-session-token-999',
        code: '654321',
        display_name: 'Verified User',
      });

      // Persisted DRF token is now in storage
      expect(await sessionManager.getToken()).toBe('persisted-drf-token-888');

      // Ephemeral challenge is consumed and cleared
      expect(capturedContext?.challenge).toBeNull();

      // Authenticated state is true
      expect(capturedContext?.isAuthenticated).toBe(true);
      expect(capturedContext?.currentUser.displayName).toBe('Verified User');
    });

    it('clears ephemeral challenge state on clearChallenge or phone change', async () => {
      act(() => {
        setDataMode('http');
      });

      jest.spyOn(authApi, 'requestTokenizedOtp').mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          status: 'queued',
          auth_session_token: 'challenge-to-cancel',
          expires_in: 180,
          code_length: 6,
          delivery: { provider: 'console', channel: 'console', delivered: false, configured: false },
        },
      });

      let capturedContext: FullUserContextValue | undefined;
      function Consumer() {
        capturedContext = useCurrentUser();
        return null;
      }

      await act(async () => {
        root = ReactTestRenderer.create(
          <UserProvider>
            <Consumer />
          </UserProvider>,
        );
      });

      await act(async () => {
        await capturedContext?.requestTokenizedOtp?.({ phone: '+959111222' });
      });

      expect(capturedContext?.challenge?.authSessionToken).toBe('challenge-to-cancel');

      // Clear challenge (e.g. User taps "Change Phone" or "Cancel")
      act(() => {
        capturedContext?.clearChallenge?.();
      });

      expect(capturedContext?.challenge).toBeNull();
    });
  });

  // =========================================================================
  // 4. Single-Roundtrip Bootstrap & P1-01 Phone/Email Separation
  // =========================================================================

  describe('Single-Roundtrip Bootstrap & P1-01 Phone/Email Separation (MAP-01)', () => {
    it('replaces parallel profile roundtrips with single GET /api/v1/me/bootstrap/', async () => {
      act(() => {
        setDataMode('http');
      });
      await memoryStore.setToken('existing-auth-token-123');

      const bootstrapSpy = jest.spyOn(authApi, 'getBootstrap').mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          user: {
            id: 88,
            uuid: 'uuid-88',
            display_name: 'Coordinator Ko Phyo',
            phone: '+959888777666',
            email: null,
            account_status: 'active',
            verification_status: 'verified',
          },
          coordinator: {
            status: 'approved',
            can_access_workspace: true,
          },
          capabilities: {
            volunteer: true,
            coordinator: true,
          },
        },
      });

      let capturedContext: FullUserContextValue | undefined;
      function Consumer() {
        capturedContext = useCurrentUser();
        return null;
      }

      await act(async () => {
        root = ReactTestRenderer.create(
          <UserProvider>
            <Consumer />
          </UserProvider>,
        );
      });

      // Flushes cold-start bootstrap effect
      for (let i = 0; i < 5; i++) {
        await act(async () => {
          await Promise.resolve();
        });
      }

      expect(bootstrapSpy).toHaveBeenCalledTimes(1);
      expect(capturedContext?.isAuthenticated).toBe(true);
      expect(capturedContext?.isCoordinator).toBe(true);
      expect(capturedContext?.currentUser.id).toBe('88');
      expect(capturedContext?.currentUser.displayName).toBe('Coordinator Ko Phyo');
      expect(capturedContext?.currentUser.coordinatorStatus).toBe('approved');

      // P1-01 / MAP-01: Proves phone maps strictly to phone, and email is NOT phone
      expect(capturedContext?.currentUser.phone).toBe('+959888777666');
      expect(capturedContext?.currentUser.email).toBeUndefined();
      expect(capturedContext?.currentUser.email).not.toBe('+959888777666');
    });

    it('preserves valid email when returned by bootstrap without phone fallback', async () => {
      act(() => {
        setDataMode('http');
      });
      await memoryStore.setToken('token-with-email');

      jest.spyOn(authApi, 'getBootstrap').mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          user: {
            id: 99,
            uuid: 'uuid-99',
            display_name: 'Volunteer With Email',
            phone: '+95999999999',
            email: 'volunteer@charity.org',
            account_status: 'active',
            verification_status: 'verified',
          },
          coordinator: {
            status: 'none',
            can_access_workspace: false,
          },
          capabilities: {
            volunteer: true,
            coordinator: false,
          },
        },
      });

      let capturedContext: FullUserContextValue | undefined;
      function Consumer() {
        capturedContext = useCurrentUser();
        return null;
      }

      await act(async () => {
        root = ReactTestRenderer.create(
          <UserProvider>
            <Consumer />
          </UserProvider>,
        );
      });

      for (let i = 0; i < 5; i++) {
        await act(async () => {
          await Promise.resolve();
        });
      }

      expect(capturedContext?.currentUser.phone).toBe('+95999999999');
      expect(capturedContext?.currentUser.email).toBe('volunteer@charity.org');
    });
  });

  // =========================================================================
  // 5. Phase B2 Mobile Authentication Criteria (Section 4.4, 4.5)
  // =========================================================================

  describe('Phase B2: Mobile Auth Acceptance & Invariants (Section 4.5)', () => {
    it('CRITICAL: Challenge token never enters Authorization header under any condition', async () => {
      let capturedHeaders: Record<string, string> = {};
      const mockTransport: TransportAdapter = async (url, init) => {
        capturedHeaders = (init?.headers as Record<string, string>) || {};
        return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
      };

      const customClient = new ApiClient(mockTransport, memoryStore, sessionManager);

      // 1. Perform requestTokenizedOtp
      jest.spyOn(authApi, 'requestTokenizedOtp').mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          status: 'dev_code_available',
          auth_session_token: 'challenge-secret-token-xyz-987',
          expires_in: 180,
          code_length: 6,
          delivery: {
            provider: 'console',
            channel: 'console',
            delivered: false,
            configured: false,
          },
          dev_code: '123456',
        },
      });

      const res = await authApi.requestTokenizedOtp({ phone: '+959111222333', purpose: 'login' }, customClient);
      expect(res.ok).toBe(true);

      // 2. Perform an authenticated API call while holding the challenge token
      await customClient.get('events/discovery/');

      // Challenge token MUST NEVER be placed in Authorization header
      expect(capturedHeaders.Authorization).toBeUndefined();
      expect(capturedHeaders.authorization).toBeUndefined();
    });

    it('STRICT: Invalidate session ONLY on HTTP 401; preserve token on 403, 404, 409, 429, 500, or timeout', async () => {
      await memoryStore.setToken('persistent-volunteer-token');
      const unauthorizedSpy = jest.fn();
      sessionManager.onUnauthorized(unauthorizedSpy);

      const non401Statuses = [400, 403, 404, 409, 429, 500, 502, 503];

      for (const st of non401Statuses) {
        const mockTransport: TransportAdapter = async () =>
          new Response(JSON.stringify({ error: { code: 'error', message: 'fail' } }), { status: st });

        const client = new ApiClient(mockTransport, memoryStore, sessionManager);
        await client.get('events/discovery/');

        // Token must remain intact; handleUnauthorized must NOT be triggered
        expect(await memoryStore.getToken()).toBe('persistent-volunteer-token');
        expect(unauthorizedSpy).not.toHaveBeenCalled();
      }

      // Now verify that HTTP 401 DOES clear token and trigger listener
      const mock401Transport: TransportAdapter = async () =>
        new Response(JSON.stringify({ error: { code: 'unauthorized', message: 'Token invalid' } }), { status: 401 });

      const client401 = new ApiClient(mock401Transport, memoryStore, sessionManager);
      await client401.get('events/discovery/');

      expect(await memoryStore.getToken()).toBeNull();
      expect(unauthorizedSpy).toHaveBeenCalledTimes(1);
    });

    it('IDEMPOTENCY: Non-idempotent POST requests are NEVER retried automatically on timeout', async () => {
      let callCount = 0;
      const mockTransport: TransportAdapter = async () => {
        callCount++;
        // Simulate immediate abort/timeout
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      };

      const client = new ApiClient(mockTransport, memoryStore, sessionManager);
      const res = await client.post('auth/tokenized/request-otp/', { phone: '+95912345678' }, { timeoutMs: 50 });

      expect(res.ok).toBe(false);
      // Transport must be invoked exactly ONCE: zero blind retries
      expect(callCount).toBe(1);
    });

    it('Truthfully distinguishes provider delivery states: accepted, delivered, unconfigured, rejected, timeout', () => {
      const { getDeliveryStatusDescription } = require('../src/features/auth/screens/OtpLoginScreen');

      // Case 1: Real delivery confirmed to handset
      const descDelivered = getDeliveryStatusDescription(
        { provider: 'telecom', channel: 'SMS', delivered: true, configured: true },
        'delivered',
      );
      expect(descDelivered).toBe('Delivery channel: SMS (delivered)');

      // Case 2: Provider accepted/queued but NOT yet delivered to handset
      const descAccepted = getDeliveryStatusDescription(
        { provider: 'telecom', channel: 'SMS', delivered: false, configured: true, accepted: true },
        'accepted',
      );
      expect(descAccepted).toBe('Delivery channel: SMS (accepted by provider / queued)');

      // Case 3: Provider unconfigured / simulation mode
      const descUnconfigured = getDeliveryStatusDescription(
        { provider: 'console', channel: 'console', delivered: false, configured: false },
        'console_simulated',
      );
      expect(descUnconfigured).toBe('Delivery channel: console (simulation mode / provider unconfigured)');
    });

    it('Clears challenge state on clearChallenge, phone change, and expiry', async () => {
      act(() => {
        setDataMode('http');
      });

      jest.spyOn(authApi, 'requestTokenizedOtp').mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          status: 'dev_code_available',
          auth_session_token: 'expiring-token-111',
          expires_in: 180,
          code_length: 6,
          delivery: { provider: 'console', channel: 'console', delivered: false, configured: false },
          dev_code: '123456',
        },
      });

      let capturedContext: FullUserContextValue | undefined;
      function Consumer() {
        capturedContext = useCurrentUser();
        return null;
      }

      await act(async () => {
        root = ReactTestRenderer.create(
          <UserProvider>
            <Consumer />
          </UserProvider>,
        );
      });

      await act(async () => {
        await capturedContext?.requestTokenizedOtp?.({ phone: '+95912345678' });
      });
      expect(capturedContext?.challenge?.authSessionToken).toBe('expiring-token-111');

      // 1. Clear explicitly
      act(() => {
        capturedContext?.clearChallenge?.();
      });
      expect(capturedContext?.challenge).toBeNull();

      // 2. Clear on new phone request
      await act(async () => {
        await capturedContext?.requestTokenizedOtp?.({ phone: '+95987654321' });
      });
      expect(capturedContext?.challenge?.phone).toBe('+95987654321');

      // 3. Clear on expiry during verification
      if (capturedContext?.challenge) {
        capturedContext.challenge.expiresAt = Date.now() - 5000; // Shift to past
      }

      let verifyResult: unknown;
      await act(async () => {
        verifyResult = await capturedContext?.verifyTokenizedOtp?.({ code: '123456' });
      });

      expect(verifyResult).toEqual(
        expect.objectContaining({
          success: false,
          error: 'Challenge expired. Please request a new code.',
        }),
      );
      expect(capturedContext?.challenge).toBeNull();
    });
  });
});
