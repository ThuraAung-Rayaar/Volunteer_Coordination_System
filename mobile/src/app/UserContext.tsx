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
import type { OtpDeliveryDto } from '../data/dto/authDto';
import { profileApi } from '../data/endpoints/profileApi';
import { resetDiscoveryCache } from '../features/events/screens/EventDiscoveryScreen';
import { resetApplicationsCache } from '../features/events/screens/MyApplicationsScreen';
import { resetAssignmentsCache } from '../features/events/screens/MyAssignmentsScreen';

export type UserPreset = 'volunteer' | 'coordinator' | 'pending';

export interface RequestOtpResult {
  success: boolean;
  status?: string;
  delivery?: OtpDeliveryDto;
  devCode?: string;
  error?: string;
}

export interface VerifyOtpResult {
  success: boolean;
  error?: string;
}

export interface UserContextValue {
  currentUser: UserProfileSnapshot;
  setCurrentUser: (user: UserProfileSnapshot) => void;
  isCoordinator: boolean;
  switchUserPreset: (preset: UserPreset) => void;
  isAuthenticated?: boolean;
  isBootstrapping?: boolean;
  requestOtp?: (
    phone: string,
    purpose?: 'login' | 'qr_registration',
  ) => Promise<RequestOtpResult>;
  verifyOtp?: (
    phone: string,
    code: string,
    displayName?: string,
  ) => Promise<VerifyOtpResult>;
  logout?: () => Promise<void>;
  refreshSessionUser?: () => Promise<void>;
}

export interface FullUserContextValue extends UserContextValue {
  isAuthenticated: boolean;
  isBootstrapping: boolean;
  requestOtp: (
    phone: string,
    purpose?: 'login' | 'qr_registration',
  ) => Promise<RequestOtpResult>;
  verifyOtp: (
    phone: string,
    code: string,
    displayName?: string,
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

  // Sync with global dataMode changes
  useEffect(() => {
    const unsubscribe = addDataModeListener(newMode => {
      setDataModeState(newMode);
      if (newMode === 'mock') {
        setIsAuthenticated(true);
        setIsBootstrapping(false);
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
      if (getDataMode() === 'http') {
        setIsAuthenticated(false);
      }
    });
    return unsubscribe;
  }, []);

  const refreshSessionUser = useCallback(async () => {
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
      email: meRes.data.phone || 'volunteer@example.com',
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

  const requestOtp = useCallback(
    async (
      phone: string,
      purpose: 'login' | 'qr_registration' = 'login',
    ): Promise<RequestOtpResult> => {
      const res = await authApi.requestOtp({ phone, purpose });
      if (!res.ok) {
        return {
          success: false,
          error: res.error.message,
        };
      }
      return {
        success: true,
        status: res.data.status,
        delivery: res.data.delivery,
        devCode: res.data.dev_code,
      };
    },
    [],
  );

  const verifyOtp = useCallback(
    async (
      phone: string,
      code: string,
      displayName?: string,
    ): Promise<VerifyOtpResult> => {
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

      try {
        await refreshSessionUser();
      } catch {
        // Fallback to minimal snapshot from verify response if profile call fails
        const snapshot: UserProfileSnapshot = {
          id: String(res.data.user.id),
          displayName: res.data.user.display_name,
          phone: phone,
          email: phone,
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
    [refreshSessionUser],
  );

  const logout = useCallback(async (): Promise<void> => {
    resetDiscoveryCache();
    resetApplicationsCache();
    resetAssignmentsCache();
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
      requestOtp,
      verifyOtp,
      logout,
      refreshSessionUser,
    }),
    [
      currentUser,
      isCoordinator,
      switchUserPreset,
      isAuthenticated,
      isBootstrapping,
      requestOtp,
      verifyOtp,
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
  requestOtp: async () => ({ success: true }),
  verifyOtp: async () => ({ success: true }),
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
