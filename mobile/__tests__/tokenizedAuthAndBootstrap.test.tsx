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
});
