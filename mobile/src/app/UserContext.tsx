/**
 * @format
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { defaultCoordinatorRepository } from '../data/mock/MockCoordinatorRepository';
import {
  approvedCoordinatorUser,
  ordinaryVolunteerUser,
  pendingCoordinatorUser,
} from '../data/mock/fixtures/demoUsers';
import {
  CoordinatorStatus,
  hasCoordinatorAccess,
  UserAccountStatus,
  UserProfileSnapshot,
} from '../domain/models';
import {
  addDataModeListener,
  DataMode,
  getDataMode,
} from './configuration/dataMode';
import { sessionManager } from '../core/auth/sessionManager';
import { authApi } from '../data/endpoints/authApi';
import type {
  OtpDeliveryDto,
  TokenizedOtpDeliveryDto,
} from '../data/dto/authDto';
import { profileApi } from '../data/endpoints/profileApi';
import { resetDiscoveryCache } from '../features/events/screens/EventDiscoveryScreen';
import { resetApplicationsCache } from '../features/events/screens/MyApplicationsScreen';
import { resetAssignmentsCache } from '../features/events/screens/MyAssignmentsScreen';

export type UserPreset = 'volunteer' | 'coordinator' | 'pending';

/**
 * Ephemeral OTP challenge state held strictly in React memory.
 * Never persisted to AsyncStorage or hardware Keystore/Keychain.
 */
export interface EphemeralChallengeState {
  authSessionToken: string;
  expiresIn: number;
  expiresAt: number;
  codeLength: number;
  delivery: TokenizedOtpDeliveryDto | OtpDeliveryDto;
  devCode?: string | null;
  status?: string;
  phone?: string;
  requestId?: string;
}

export interface RequestOtpResult {
  success: boolean;
  status?: string;
  authSessionToken?: string;
  expiresIn?: number;
  codeLength?: number;
  delivery?: TokenizedOtpDeliveryDto | OtpDeliveryDto;
  devCode?: string | null;
  idempotentReissue?: boolean;
  error?: string;
  errorCode?: string;
}

export interface VerifyOtpResult {
  success: boolean;
  error?: string;
  errorCode?: string;
}

export interface RequestTokenizedOtpParams {
  phone: string;
  purpose?: 'login' | 'qr_registration';
  requestId?: string;
}

export interface VerifyTokenizedOtpParams {
  code: string;
  purpose?: 'login' | 'qr_registration';
  displayName?: string;
}

export interface UserContextValue {
  currentUser: UserProfileSnapshot;
  setCurrentUser: (user: UserProfileSnapshot) => void;
  isCoordinator: boolean;
  switchUserPreset: (preset: UserPreset) => void;
  isAuthenticated?: boolean;
  isBootstrapping?: boolean;
  challenge?: EphemeralChallengeState | null;
  clearChallenge?: () => void;
  requestOtp?: (
    phone: string,
    purpose?: 'login' | 'qr_registration',
    requestId?: string,
  ) => Promise<RequestOtpResult>;
  verifyOtp?: (
    phone: string,
    code: string,
    displayName?: string,
  ) => Promise<VerifyOtpResult>;
  requestTokenizedOtp?: (
    params: RequestTokenizedOtpParams,
  ) => Promise<RequestOtpResult>;
  verifyTokenizedOtp?: (
    params: VerifyTokenizedOtpParams,
  ) => Promise<VerifyOtpResult>;
  logout?: () => Promise<void>;
  refreshSessionUser?: () => Promise<void>;
}

export interface FullUserContextValue extends UserContextValue {
  isAuthenticated: boolean;
  isBootstrapping: boolean;
  challenge?: EphemeralChallengeState | null;
  clearChallenge?: () => void;
  requestOtp: (
    phone: string,
    purpose?: 'login' | 'qr_registration',
    requestId?: string,
  ) => Promise<RequestOtpResult>;
  verifyOtp: (
    phone: string,
    code: string,
    displayName?: string,
  ) => Promise<VerifyOtpResult>;
  requestTokenizedOtp?: (
    params: RequestTokenizedOtpParams,
  ) => Promise<RequestOtpResult>;
  verifyTokenizedOtp?: (
    params: VerifyTokenizedOtpParams,
  ) => Promise<VerifyOtpResult>;
  logout: () => Promise<void>;
  refreshSessionUser: () => Promise<void>;
}

export const UserContext = createContext<UserContextValue | undefined>(
  undefined,
);

export interface UserProviderProps {
  children: React.ReactNode;
  initialUser?: UserProfileSnapshot;
  initialAuthenticated?: boolean;
}

export function UserProvider({
  children,
  initialUser = ordinaryVolunteerUser,
  initialAuthenticated,
}: UserProviderProps): React.JSX.Element {
  const [dataMode, setDataModeState] = useState<DataMode>(() => getDataMode());
  const [currentUser, setCurrentUser] =
    useState<UserProfileSnapshot>(initialUser);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    if (initialAuthenticated !== undefined) {
      return initialAuthenticated;
    }
    return getDataMode() === 'mock';
  });
  const [isBootstrapping, setIsBootstrapping] = useState<boolean>(
    () => getDataMode() === 'http',
  );

  // Ephemeral challenge state held strictly in memory, isolated from persisted DRF token
  const [challenge, setChallenge] = useState<EphemeralChallengeState | null>(null);

  // Sync with global dataMode changes
  useEffect(() => {
    const unsubscribe = addDataModeListener(newMode => {
      setDataModeState(newMode);
      if (newMode === 'mock') {
        setIsAuthenticated(true);
        setIsBootstrapping(false);
        setChallenge(null);
      }
    });
    return unsubscribe;
  }, []);

  // Update mock coordinator repository whenever identity changes
  useEffect(() => {
    if (defaultCoordinatorRepository.setCoordinatorIdentity) {
      defaultCoordinatorRepository.setCoordinatorIdentity({
        id: currentUser.id,
        displayName: currentUser.displayName,
        email: currentUser.email,
      });
    }
  }, [currentUser]);

  // Subscribe to session manager 401 unauthorized notifications
  useEffect(() => {
    const unsubscribe = sessionManager.onUnauthorized(() => {
      resetDiscoveryCache();
      resetApplicationsCache();
      resetAssignmentsCache();
      setChallenge(null);
      if (getDataMode() === 'http') {
        setIsAuthenticated(false);
      }
    });
    return unsubscribe;
  }, []);

  /**
   * Refreshes active user identity.
   * PHASE 6 / API-01: Uses single-roundtrip GET /api/v1/me/bootstrap/ as primary.
   * P1-01 / MAP-01: Removes phone-to-email fallback (email is null/undefined if absent).
   */
  const refreshSessionUser = useCallback(async () => {
    // Attempt single-roundtrip bootstrap first (Phase 3/6 canonical route)
    const bootRes = await authApi.getBootstrap();
    if (bootRes.ok) {
      const user = bootRes.data.user;
      const coord = bootRes.data.coordinator;
      const snapshot: UserProfileSnapshot = {
        id: String(user.id),
        displayName: user.display_name,
        phone: user.phone ?? null,
        // P1-01 / MAP-01: Absent email remains null/undefined (NO phone fallback)
        email: user.email ?? undefined,
        coordinatorStatus: (coord.status as CoordinatorStatus) || 'none',
        accountStatus: (user.account_status as UserAccountStatus) || 'active',
      };

      setCurrentUser(snapshot);
      setIsAuthenticated(true);
      return;
    }

    if (bootRes.status === 401) {
      setIsAuthenticated(false);
      return;
    }

    // Graceful fallback to legacy profile endpoints in test environments without bootstrap mock
    const [meRes, coordRes] = await Promise.all([
      profileApi.getProfile(),
      profileApi.getCoordinatorProfile(),
    ]);

    if (!meRes.ok) {
      if (meRes.status === 401) {
        setIsAuthenticated(false);
      }
      return;
    }

    const coordStatus: CoordinatorStatus =
      (coordRes.ok &&
        (coordRes.data?.coordinator?.status as CoordinatorStatus)) ||
      'none';
    const acctStatus =
      (meRes.data.account_status as UserAccountStatus) || 'active';

    const snapshot: UserProfileSnapshot = {
      id: String(meRes.data.id),
      displayName: meRes.data.display_name,
      phone: meRes.data.phone ?? null,
      // P1-01 / MAP-01: Absent email remains null/undefined (NO phone fallback)
      email: (meRes.data as { email?: string | null }).email ?? undefined,
      coordinatorStatus: coordStatus,
      accountStatus: acctStatus,
    };

    setCurrentUser(snapshot);
    setIsAuthenticated(true);
  }, []);

  // Session bootstrap on cold start in HTTP mode
  useEffect(() => {
    if (dataMode !== 'http') {
      setIsBootstrapping(false);
      setIsAuthenticated(true);
      return;
    }

    let isMounted = true;
    setIsBootstrapping(true);

    async function bootstrap() {
      const token = await sessionManager.getToken();
      if (!token || token.trim().length === 0) {
        if (isMounted) {
          setIsAuthenticated(false);
          setIsBootstrapping(false);
        }
        return;
      }

      try {
        await refreshSessionUser();
      } catch {
        // Network or non-auth error: preserve token, do not invalidate
      } finally {
        if (isMounted) {
          setIsBootstrapping(false);
        }
      }
    }

    bootstrap();

    return () => {
      isMounted = false;
    };
  }, [dataMode, refreshSessionUser]);

  /**
   * Clears the ephemeral OTP challenge state.
   */
  const clearChallenge = useCallback(() => {
    setChallenge(null);
  }, []);

  /**
   * Requests a tokenized challenge OTP code (POST /api/v1/auth/tokenized/request-otp/).
   * Holds the returned challenge token ephemerally in memory.
   */
  const requestTokenizedOtp = useCallback(
    async (params: RequestTokenizedOtpParams): Promise<RequestOtpResult> => {
      // Clear any prior challenge on new phone, resend, or retry
      setChallenge(null);

      if (!params.phone || !params.phone.trim()) {
        return {
          success: false,
          error: 'Please enter your mobile phone number.',
        };
      }

      const res = await authApi.requestTokenizedOtp({
        phone: params.phone.trim(),
        purpose: params.purpose || 'login',
        request_id: params.requestId,
      });

      if (!res.ok) {
        const errorCode =
          'code' in res.error && typeof res.error.code === 'string'
            ? res.error.code
            : undefined;
        return {
          success: false,
          error: res.error.message,
          errorCode,
        };
      }

      const challengeData: EphemeralChallengeState = {
        authSessionToken: res.data.auth_session_token,
        expiresIn: res.data.expires_in,
        expiresAt: Date.now() + res.data.expires_in * 1000,
        codeLength: res.data.code_length,
        delivery: res.data.delivery,
        devCode: res.data.dev_code,
        status: res.data.status,
        phone: params.phone.trim(),
        requestId: params.requestId,
      };

      setChallenge(challengeData);

      return {
        success: true,
        status: res.data.status,
        authSessionToken: res.data.auth_session_token,
        expiresIn: res.data.expires_in,
        codeLength: res.data.code_length,
        delivery: res.data.delivery,
        devCode: res.data.dev_code,
        idempotentReissue: res.data.idempotent_reissue,
      };
    },
    [],
  );

  /**
   * Verifies an OTP code using the active ephemeral challenge token.
   * STRICT ARCHITECTURAL INVARIANT: Does NOT send phone over the wire.
   * Persists the DRF token to sessionManager ONLY after verification succeeds.
   */
  const verifyTokenizedOtp = useCallback(
    async (params: VerifyTokenizedOtpParams): Promise<VerifyOtpResult> => {
      if (!challenge || !challenge.authSessionToken) {
        return {
          success: false,
          error: 'No active OTP challenge found. Please request a new code.',
        };
      }

      if (Date.now() > challenge.expiresAt) {
        setChallenge(null);
        return {
          success: false,
          error: 'Challenge expired. Please request a new code.',
        };
      }

      const res = await authApi.verifyTokenizedOtp({
        auth_session_token: challenge.authSessionToken,
        code: params.code.trim(),
        purpose: params.purpose,
        display_name: params.displayName?.trim(),
      });

      if (!res.ok) {
        const errorCode =
          'code' in res.error && typeof res.error.code === 'string'
            ? res.error.code
            : undefined;
        if (
          res.status === 409 ||
          errorCode === 'challenge_consumed' ||
          errorCode === 'challenge_expired'
        ) {
          setChallenge(null);
        }
        return {
          success: false,
          error: res.error.message,
          errorCode,
        };
      }

      // Persist DRF token ONLY after successful verification
      await sessionManager.setToken(res.data.token);

      // Challenge is consumed — clear ephemeral challenge state
      const savedPhone = challenge.phone;
      setChallenge(null);

      // Bootstrap session via single round-trip
      try {
        await refreshSessionUser();
      } catch {
        // Fallback minimal snapshot if network fails during bootstrap
        const snapshot: UserProfileSnapshot = {
          id: String(res.data.user.id),
          displayName: res.data.user.display_name,
          phone: savedPhone ?? null,
          email: undefined, // P1-01 / MAP-01: NO phone fallback!
          coordinatorStatus: 'none',
          accountStatus: 'active',
        };
        setCurrentUser(snapshot);
        setIsAuthenticated(true);
      }

      return {
        success: true,
      };
    },
    [challenge, refreshSessionUser],
  );

  /**
   * Request OTP code. Dispatches tokenized challenge if available, falling back to legacy.
   */
  const requestOtp = useCallback(
    async (
      phone: string,
      purpose: 'login' | 'qr_registration' = 'login',
      requestId?: string,
    ): Promise<RequestOtpResult> => {
      setChallenge(null);

      // Attempt canonical tokenized request
      const res = await authApi.requestTokenizedOtp({
        phone,
        purpose,
        request_id: requestId,
      });
      if (res.ok) {
        const challengeData: EphemeralChallengeState = {
          authSessionToken: res.data.auth_session_token,
          expiresIn: res.data.expires_in,
          expiresAt: Date.now() + res.data.expires_in * 1000,
          codeLength: res.data.code_length,
          delivery: res.data.delivery,
          devCode: res.data.dev_code,
          status: res.data.status,
          phone,
          requestId,
        };
        setChallenge(challengeData);
        return {
          success: true,
          status: res.data.status,
          authSessionToken: res.data.auth_session_token,
          expiresIn: res.data.expires_in,
          codeLength: res.data.code_length,
          delivery: res.data.delivery,
          devCode: res.data.dev_code,
          idempotentReissue: res.data.idempotent_reissue,
        };
      }

      // Fallback to legacy requestOtp (e.g. In mock mode or legacy unit test)
      const legacyRes = await authApi.requestOtp({ phone, purpose });
      if (!legacyRes.ok) {
        return {
          success: false,
          error: legacyRes.error.message,
        };
      }
      return {
        success: true,
        status: legacyRes.data.status,
        delivery: legacyRes.data.delivery,
        devCode: legacyRes.data.dev_code,
      };
    },
    [],
  );

  /**
   * Verify OTP code. Dispatches tokenized challenge verification if challenge is active,
   * otherwise falls back to legacy verify endpoint.
   */
  const verifyOtp = useCallback(
    async (
      phone: string,
      code: string,
      displayName?: string,
    ): Promise<VerifyOtpResult> => {
      // If we hold an active tokenized challenge, use verifyTokenizedOtp (NO phone sent!)
      if (challenge && challenge.authSessionToken) {
        return verifyTokenizedOtp({ code, displayName });
      }

      // Legacy fallback
      const res = await authApi.verifyOtp({
        phone,
        code,
        purpose: 'login',
        display_name: displayName,
      });

      if (!res.ok) {
        return {
          success: false,
          error: res.error.message,
        };
      }

      await sessionManager.setToken(res.data.token);
      setChallenge(null);

      try {
        await refreshSessionUser();
      } catch {
        const snapshot: UserProfileSnapshot = {
          id: String(res.data.user.id),
          displayName: res.data.user.display_name,
          phone: phone,
          email: undefined, // P1-01 / MAP-01: NO phone fallback!
          coordinatorStatus: 'none',
          accountStatus: 'active',
        };
        setCurrentUser(snapshot);
        setIsAuthenticated(true);
      }

      return {
        success: true,
      };
    },
    [challenge, verifyTokenizedOtp, refreshSessionUser],
  );

  const logout = useCallback(async (): Promise<void> => {
    resetDiscoveryCache();
    resetApplicationsCache();
    resetAssignmentsCache();
    setChallenge(null);
    if (getDataMode() === 'http') {
      try {
        await authApi.logout();
      } catch {
        // Ignore server error during logout
      }
      await sessionManager.logout();
      setIsAuthenticated(false);
    }
  }, []);

  const isCoordinator = useMemo(
    () => hasCoordinatorAccess(currentUser),
    [currentUser],
  );

  const switchUserPreset = useCallback((preset: UserPreset) => {
    switch (preset) {
      case 'coordinator':
        setCurrentUser(approvedCoordinatorUser);
        break;
      case 'pending':
        setCurrentUser(pendingCoordinatorUser);
        break;
      case 'volunteer':
      default:
        setCurrentUser(ordinaryVolunteerUser);
        break;
    }
  }, []);

  const contextValue = useMemo<FullUserContextValue>(
    () => ({
      currentUser,
      setCurrentUser,
      isCoordinator,
      switchUserPreset,
      isAuthenticated,
      isBootstrapping,
      challenge,
      clearChallenge,
      requestOtp,
      verifyOtp,
      requestTokenizedOtp,
      verifyTokenizedOtp,
      logout,
      refreshSessionUser,
    }),
    [
      currentUser,
      isCoordinator,
      switchUserPreset,
      isAuthenticated,
      isBootstrapping,
      challenge,
      clearChallenge,
      requestOtp,
      verifyOtp,
      requestTokenizedOtp,
      verifyTokenizedOtp,
      logout,
      refreshSessionUser,
    ],
  );

  return (
    <UserContext.Provider value={contextValue}>{children}</UserContext.Provider>
  );
}

const fallbackUserContext: FullUserContextValue = {
  currentUser: ordinaryVolunteerUser,
  setCurrentUser: () => {},
  isCoordinator: false,
  switchUserPreset: () => {},
  isAuthenticated: true,
  isBootstrapping: false,
  challenge: null,
  clearChallenge: () => {},
  requestOtp: async () => ({ success: true }),
  verifyOtp: async () => ({ success: true }),
  requestTokenizedOtp: async () => ({ success: true }),
  verifyTokenizedOtp: async () => ({ success: true }),
  logout: async () => {},
  refreshSessionUser: async () => {},
};

export function useCurrentUser(): FullUserContextValue {
  const context = useContext(UserContext);
  if (!context) {
    return fallbackUserContext;
  }

  return {
    ...fallbackUserContext,
    ...context,
  };
}
