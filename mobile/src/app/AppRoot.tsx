/**
 * @format
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StatusBar } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { MainDrawerNavigator } from '../navigation/MainDrawerNavigator';
import { useAppTheme } from '../theme';
import { AppProviders } from './AppProviders';
import { useCurrentUser } from './UserContext';
import { useRepositories } from './RepositoryProvider';
import {
  addDataModeListener,
  DataMode,
  getDataMode,
  setDataMode,
} from './configuration/dataMode';
import { isConsumerOnlyMode } from './configuration/consumerMode';
import { discoverAndConnectBff } from '../core/api/bffDiscovery';
import { getApiConfig } from '../core/api/apiConfig';
import {
  defaultInstallSetupStorage,
} from '../core/storage/appInstallStorage';
import {
  openAppPermissionSettings,
  requestStartupPermissionsIfNeeded,
  StartupPermissionSnapshot,
} from '../core/permissions/startupPermissions';
import {
  hydrateOfflineCacheFromStorage,
  startOfflineCachePersistence,
  warmOfflineCache,
} from '../data/cache';
import {
  BootStageKey,
  OtpLoginScreen,
  StartupSplashScreen,
} from '../features/auth';

const isJestTestEnv = (): boolean =>
  typeof process !== 'undefined' && Boolean(process.env?.JEST_WORKER_ID);

export interface AppNavigationRootProps {
  /** Override startup splash delay (ms), useful for deterministic tests. */
  minSplashDurationMs?: number;
  /** Override BFF auto-discovery during startup (defaults to enabled in runtime, skipped in Jest). */
  enableStartupDiscovery?: boolean;
  /** Override startup permission prompts (defaults to enabled in runtime, skipped in Jest). */
  enableStartupPermissions?: boolean;
  /** Override interactive first-install gate (defaults to enabled in runtime, skipped in Jest). */
  enableInteractiveInstallFlow?: boolean;
}

export function AppNavigationRoot({
  minSplashDurationMs,
  enableStartupDiscovery,
  enableStartupPermissions,
  enableInteractiveInstallFlow,
}: AppNavigationRootProps = {}): React.JSX.Element {
  const { isDark } = useAppTheme();
  const { isAuthenticated, isBootstrapping } = useCurrentUser();
  const repositories = useRepositories();
  const [dataMode, setDataModeState] = useState<DataMode>(() => getDataMode());
  const [isStartupComplete, setIsStartupComplete] = useState<boolean>(() =>
    getDataMode() === 'mock' || isJestTestEnv(),
  );
  const [startupStatus, setStartupStatus] = useState<string>(
    'Initializing VCS workspace...',
  );
  const [startupTarget, setStartupTarget] = useState<string>(
    () => getApiConfig().baseUrl,
  );
  const [startupProgress, setStartupProgress] = useState<number>(15);
  const [startupStage, setStartupStage] = useState<BootStageKey>('cache');
  const [isFirstInstall, setIsFirstInstall] = useState<boolean>(false);
  const [isBootReady, setIsBootReady] = useState<boolean>(false);
  const [isBffUnreachable, setIsBffUnreachable] = useState<boolean>(false);
  const [permissionSnapshot, setPermissionSnapshot] =
    useState<StartupPermissionSnapshot | null>(null);

  // Always start on the Login page after startup splash in live/offline runtime
  const [hasCompletedLogin, setHasCompletedLogin] = useState<boolean>(false);
  const warmedSessionRef = useRef<boolean>(false);
  const isMountedRef = useRef<boolean>(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = addDataModeListener(newMode => {
      setDataModeState(newMode);
      if (newMode === 'mock') {
        setIsStartupComplete(true);
      }
    });
    return unsubscribe;
  }, []);

  // Reset login gate if session becomes unauthenticated (logout or HTTP 401)
  useEffect(() => {
    if (!isAuthenticated) {
      setHasCompletedLogin(false);
      warmedSessionRef.current = false;
    }
  }, [isAuthenticated]);

  const handleRequestPermissions = useCallback(async (): Promise<void> => {
    const snapshot = await requestStartupPermissionsIfNeeded();
    if (isMountedRef.current) {
      setPermissionSnapshot(snapshot);
    }
  }, []);

  const handleRetryBff = useCallback(async () => {
    if (isMountedRef.current) {
      setStartupStage('network');
      setStartupStatus('Reconnecting to VCS server...');
      setIsBffUnreachable(false);
    }
    const bffState = await discoverAndConnectBff();
    if (isMountedRef.current) {
      setStartupTarget(bffState.activeBaseUrl);
      setIsBffUnreachable(bffState.status !== 'online');
      setStartupStage('ready');
      setStartupProgress(100);
      setStartupStatus(
        bffState.status === 'online'
          ? isConsumerOnlyMode()
            ? 'Connected to VCS'
            : `Connected (${bffState.latencyMs ?? 0}ms)`
          : isConsumerOnlyMode()
            ? 'Unable to connect right now — tap Retry'
            : 'Server unreachable — retry or use Offline Mode',
      );
    }
  }, []);

  const handleContinueFromBoot = useCallback(async () => {
    await defaultInstallSetupStorage.setHasCompletedSetup(true).catch(() => null);
    if (isMountedRef.current) {
      setIsFirstInstall(false);
      setIsStartupComplete(true);
    }
  }, []);

  const handleUseOfflineFromBoot = useCallback(async () => {
    setDataMode('offline');
    await defaultInstallSetupStorage.setHasCompletedSetup(true).catch(() => null);
    if (isMountedRef.current) {
      setIsFirstInstall(false);
      setIsStartupComplete(true);
    }
  }, []);

  // Startup sequence:
  // 1. Hydrate offline cache & inspect install setup status
  // 2. Check & request startup permissions (skip if already permanently granted; re-request if one-time)
  // 3. Auto-detect localhost/port & test BFF
  // 4. Present interactive installation view on first install, or proceed cleanly
  useEffect(() => {
    if (dataMode === 'mock') {
      setIsStartupComplete(true);
      return;
    }

    const shouldRunDiscovery = enableStartupDiscovery ?? !isJestTestEnv();
    const shouldRunPermissions = enableStartupPermissions ?? !isJestTestEnv();
    const shouldRunInteractiveInstall =
      enableInteractiveInstallFlow ?? !isJestTestEnv();
    const minDuration = minSplashDurationMs ?? (isJestTestEnv() ? 0 : 1400);

    if (
      !shouldRunDiscovery &&
      !shouldRunPermissions &&
      !shouldRunInteractiveInstall &&
      minDuration === 0
    ) {
      setIsStartupComplete(true);
      return;
    }

    let isMounted = true;
    const stopPersistence = startOfflineCachePersistence();

    async function runStartup() {
      const startedAt = Date.now();
      setIsStartupComplete(false);
      setIsBootReady(false);

      if (isMounted) {
        setStartupStage('cache');
        setStartupProgress(20);
        setStartupStatus('Restoring local workspace & cache...');
      }

      const [hasCompletedSetup] = await Promise.all([
        defaultInstallSetupStorage.getHasCompletedSetup().catch(() => false),
        hydrateOfflineCacheFromStorage().catch(() => null),
      ]);

      const firstInstall = !hasCompletedSetup && shouldRunInteractiveInstall;
      if (isMounted) {
        setIsFirstInstall(firstInstall);
      }

      if (shouldRunPermissions) {
        if (isMounted) {
          setStartupStage('permissions');
          setStartupProgress(50);
          setStartupStatus('Checking device permissions...');
        }
        const perms = await requestStartupPermissionsIfNeeded().catch(() => null);
        if (isMounted && perms) {
          setPermissionSnapshot(perms);
        }
      }

      if (shouldRunDiscovery) {
        if (isMounted) {
          setStartupStage('network');
          setStartupProgress(78);
          setStartupStatus('Connecting to VCS server...');
          setStartupTarget('Probing localhost:8000 / 10.0.2.2:8000');
        }
        const bffState = await discoverAndConnectBff();
        if (isMounted) {
          setStartupTarget(bffState.activeBaseUrl);
          setIsBffUnreachable(bffState.status !== 'online');
          setStartupStatus(
            bffState.status === 'online'
              ? isConsumerOnlyMode()
                ? 'Connected to VCS'
                : `Connected (${bffState.latencyMs ?? 0}ms)`
              : isConsumerOnlyMode()
                ? 'Unable to connect right now'
                : 'Server unreachable — ready for retry or Offline Mode',
          );
        }
      }

      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, minDuration - elapsed);
      if (remaining > 0) {
        await new Promise(resolve => setTimeout(resolve, remaining));
      }

      if (isMounted) {
        setStartupStage('ready');
        setStartupProgress(100);
        setIsBootReady(true);
        if (!firstInstall) {
          setIsStartupComplete(true);
        } else {
          setStartupStatus('VCS setup complete — tap Get Started to continue');
        }
      }
    }

    runStartup();

    return () => {
      isMounted = false;
      stopPersistence();
    };
  }, [
    dataMode,
    enableInteractiveInstallFlow,
    enableStartupDiscovery,
    enableStartupPermissions,
    minSplashDurationMs,
  ]);

  // Warm offline cache in the background right after a live sign-in
  useEffect(() => {
    if (
      dataMode === 'http' &&
      isAuthenticated &&
      hasCompletedLogin &&
      !warmedSessionRef.current &&
      !isJestTestEnv()
    ) {
      warmedSessionRef.current = true;
      warmOfflineCache(repositories).catch(() => {
        // Non-fatal background cache warm failure
      });
    }
  }, [dataMode, hasCompletedLogin, isAuthenticated, repositories]);

  if (dataMode === 'mock') {
    return (
      <>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <NavigationContainer>
          <MainDrawerNavigator />
        </NavigationContainer>
      </>
    );
  }

  if (!isStartupComplete || isBootstrapping) {
    return (
      <>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <StartupSplashScreen
          statusText={startupStatus}
          targetEndpoint={startupTarget}
          progressPercent={startupProgress}
          activeStage={startupStage}
          isFirstInstall={isFirstInstall}
          isBootReady={isBootReady}
          isOfflineReachable={isBffUnreachable}
          permissionSnapshot={permissionSnapshot}
          onRequestPermissions={handleRequestPermissions}
          onOpenPermissionSettings={openAppPermissionSettings}
          onRetryConnection={handleRetryBff}
          onUseOfflineMode={handleUseOfflineFromBoot}
          onContinue={handleContinueFromBoot}
        />
      </>
    );
  }

  if (!hasCompletedLogin || !isAuthenticated) {
    return (
      <>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <OtpLoginScreen onLoginSuccess={() => setHasCompletedLogin(true)} />
      </>
    );
  }

  return (
    <>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <NavigationContainer>
        <MainDrawerNavigator />
      </NavigationContainer>
    </>
  );
}

export function AppRoot(): React.JSX.Element {
  return (
    <AppProviders>
      <AppNavigationRoot />
    </AppProviders>
  );
}
