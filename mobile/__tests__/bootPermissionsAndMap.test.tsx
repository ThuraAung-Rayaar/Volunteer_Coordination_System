/**
 * @format
 */

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Keyboard, PermissionsAndroid, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { KeyboardLiftView, VcsLogo } from '../src/shared';
import { StartupSplashScreen } from '../src/features/auth';
import {
  defaultStartupPermissionStorage,
  inspectStartupPermissions,
  PersistedPermissionState,
  requestStartupPermissionsIfNeeded,
  resetStartupPermissionSessionFlag,
  StartupPermissionStorage,
} from '../src/core/permissions/startupPermissions';
import { defaultInstallSetupStorage, InstallSetupStorage } from '../src/core/storage/appInstallStorage';
import { AppNavigationRoot } from '../src/app/AppRoot';
import { UserContext, FullUserContextValue } from '../src/app/UserContext';
import { ordinaryVolunteerUser } from '../src/data/mock/fixtures/demoUsers';
import { resetDataMode } from '../src/app/configuration/dataMode';
import { EventDiscoveryScreen } from '../src/features/events/screens/EventDiscoveryScreen';
import { MockEventRepository } from '../src/data/mock/MockEventRepository';
import { SettingsScreen } from '../src/features/settings/screens/SettingsScreen';

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderWithProviders(ui: React.ReactElement) {
  return (
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <ThemeProvider initialMode="light">{ui}</ThemeProvider>
    </SafeAreaProvider>
  );
}

function createMemoryPermStorage(): StartupPermissionStorage {
  let state: PersistedPermissionState = {
    locationPermanent: false,
    cameraPermanent: false,
  };
  return {
    async load() {
      return { ...state };
    },
    async save(next) {
      state = { ...next };
    },
    async clear() {
      state = { locationPermanent: false, cameraPermanent: false };
    },
  };
}

function createMemoryInstallStorage(initial = false): InstallSetupStorage {
  let completed = initial;
  return {
    async getHasCompletedSetup() {
      return completed;
    },
    async setHasCompletedSetup(val) {
      completed = val;
    },
  };
}

function createMockNavigation() {
  return {
    navigate: jest.fn(),
    openDrawer: jest.fn(),
    closeDrawer: jest.fn(),
    toggleDrawer: jest.fn(),
    dispatch: jest.fn(),
    reset: jest.fn(),
    goBack: jest.fn(),
    isFocused: jest.fn(() => true),
    canGoBack: jest.fn(() => true),
    getParent: jest.fn(),
    getState: jest.fn(),
    addListener: jest.fn(() => () => {}),
    removeListener: jest.fn(),
    setParams: jest.fn(),
    setOptions: jest.fn(),
  } as any;
}

describe('VCS Brand Logo, Startup Permissions, Interactive Boot, Keyboard & Map', () => {
  const originalOs = Platform.OS;

  beforeEach(() => {
    resetDataMode();
    resetStartupPermissionSessionFlag();
    (Platform as any).OS = 'android';
    jest.restoreAllMocks();
  });

  afterEach(() => {
    (Platform as any).OS = originalOs;
    defaultStartupPermissionStorage.setCustomStorage(null);
    defaultInstallSetupStorage.setCustomStorage(null);
    resetDataMode();
    resetStartupPermissionSessionFlag();
  });

  it('renders VcsLogo with accessible VCS label', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(renderWithProviders(<VcsLogo size={72} />));
    });
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain('VCS');
    expect(json).toContain('VCS logo');
    await act(async () => {
      renderer.unmount();
    });
  });

  it('requests permissions on boot when granted only once (false on next cold start), and skips forever once permanent', async () => {
    const storage = createMemoryPermStorage();

    // Launch 1: fresh install -> OS check returns false -> requests permissions
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
    const reqSpy = jest
      .spyOn(PermissionsAndroid, 'requestMultiple')
      .mockResolvedValue({
        'android.permission.ACCESS_FINE_LOCATION': PermissionsAndroid.RESULTS.GRANTED,
        'android.permission.ACCESS_COARSE_LOCATION': PermissionsAndroid.RESULTS.GRANTED,
        'android.permission.CAMERA': PermissionsAndroid.RESULTS.GRANTED,
      } as any);

    const firstBoot = await requestStartupPermissionsIfNeeded(storage);
    expect(reqSpy).toHaveBeenCalledTimes(1);
    expect(firstBoot.location).toBe('session_granted');
    expect(firstBoot.camera).toBe('session_granted');

    // Launch 2 (simulated cold start after "Only this time" expired -> check() is false again)
    resetStartupPermissionSessionFlag();
    reqSpy.mockClear();
    const secondBoot = await requestStartupPermissionsIfNeeded(storage);
    expect(reqSpy).toHaveBeenCalledTimes(1);
    expect(secondBoot.location).toBe('session_granted');

    // Launch 3 (user granted permanently -> OS check() returns true at cold start)
    resetStartupPermissionSessionFlag();
    reqSpy.mockClear();
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);

    const inspected = await inspectStartupPermissions(storage);
    expect(inspected.allPermanentlyGranted).toBe(true);

    const thirdBoot = await requestStartupPermissionsIfNeeded(storage);
    expect(thirdBoot.allPermanentlyGranted).toBe(true);
    expect(reqSpy).not.toHaveBeenCalled();
  });

  it('renders interactive StartupSplashScreen tour, proverb cycler, and permission controls', async () => {
    const onContinue = jest.fn();
    const onRequestPermissions = jest.fn();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithProviders(
          <StartupSplashScreen
            statusText="VCS setup complete"
            progressPercent={100}
            activeStage="ready"
            isFirstInstall
            isBootReady
            permissionSnapshot={{
              location: 'denied',
              camera: 'permanent_granted',
              needsRequestOnBoot: true,
              allPermanentlyGranted: false,
            }}
            onRequestPermissions={onRequestPermissions}
            onContinue={onContinue}
          />,
        ),
      );
    });

    let json = JSON.stringify(renderer.toJSON());
    expect(json).toContain('Interactive Event Map');
    expect(json).toContain('APP PERMISSIONS');
    expect(json).toContain('Grant Permissions');
    expect(json).toContain('Get Started with VCS');

    // Tap Next Tip interactively
    const nextTipBtn = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(p => p.props.accessibilityLabel === 'Next feature highlight');
    expect(nextTipBtn).toBeDefined();
    await act(async () => {
      nextTipBtn!.props.onPress();
    });
    json = JSON.stringify(renderer.toJSON());
    expect(json).toContain('GPS & QR Shift Check-In');

    // Tap Grant Permissions
    const grantBtn = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === 'Grant Permissions');
    await act(async () => {
      await grantBtn!.props.onPress();
    });
    expect(onRequestPermissions).toHaveBeenCalledTimes(1);

    // Tap Get Started
    const startBtn = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === 'Get Started with VCS');
    await act(async () => {
      startBtn!.props.onPress();
    });
    expect(onContinue).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer.unmount();
    });
  });

  it('holds interactive installation view on first install until user taps Get Started', async () => {
    const installStorage = createMemoryInstallStorage(false);
    defaultInstallSetupStorage.setCustomStorage(installStorage);

    const mockUserCtx: FullUserContextValue = {
      currentUser: ordinaryVolunteerUser,
      setCurrentUser: jest.fn(),
      isCoordinator: false,
      switchUserPreset: jest.fn(),
      isAuthenticated: true,
      isBootstrapping: false,
      challenge: null,
      clearChallenge: jest.fn(),
      requestOtp: jest.fn(),
      verifyOtp: jest.fn(),
      logout: jest.fn(),
      refreshSessionUser: jest.fn(),
      enterOfflineMode: jest.fn(),
      offlineCachedUser: null,
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithProviders(
          <UserContext.Provider value={mockUserCtx}>
            <AppNavigationRoot
              minSplashDurationMs={0}
              enableStartupDiscovery={false}
              enableStartupPermissions={false}
              enableInteractiveInstallFlow
            />
          </UserContext.Provider>,
        ),
      );
    });

    const getStartedBtn = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === 'Get Started with VCS');
    expect(getStartedBtn).toBeDefined();

    await act(async () => {
      await getStartedBtn!.props.onPress();
    });

    expect(await installStorage.getHasCompletedSetup()).toBe(true);
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain('VCS Sign In');

    await act(async () => {
      renderer.unmount();
    });
  });

  it('toggles EventDiscoveryScreen to connected interactive MapLibre exploration view', async () => {
    const nav = createMockNavigation();
    const repo = new MockEventRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithProviders(
          <EventDiscoveryScreen navigation={nav} repository={repo} />,
        ),
      );
    });

    const mapToggleBtn = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(p => p.props.accessibilityLabel === 'Switch to Map View');
    expect(mapToggleBtn).toBeDefined();

    await act(async () => {
      mapToggleBtn!.props.onPress();
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain('maplibre-map');
    expect(json).toContain('View Event Details');

    await act(async () => {
      renderer.unmount();
    });
  });

  it('lifts KeyboardLiftView on Android when keyboardDidShow fires in modal', async () => {
    let showCallback: ((e: any) => void) | null = null;
    let hideCallback: (() => void) | null = null;

    jest.spyOn(Keyboard, 'addListener').mockImplementation(((event: string, cb: any) => {
      if (event === 'keyboardDidShow') showCallback = cb;
      if (event === 'keyboardDidHide') hideCallback = cb;
      return { remove: jest.fn() };
    }) as any);

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        <KeyboardLiftView inModal>
          <View />
        </KeyboardLiftView>,
      );
    });

    expect(showCallback).not.toBeNull();
    await act(async () => {
      showCallback!({ endCoordinates: { height: 300, screenY: 544 } });
    });

    const liftedView = renderer.root.findAllByType(View)[0];
    const styleArr = Array.isArray(liftedView.props.style)
      ? liftedView.props.style
      : [liftedView.props.style];
    const hasPadding = styleArr.some((s: any) => s && s.paddingBottom > 0);
    expect(hasPadding).toBe(true);

    await act(async () => {
      hideCallback!();
    });

    await act(async () => {
      renderer.unmount();
    });
  });

  it('removes developer framework/architecture status from SettingsScreen', async () => {
    const nav = createMockNavigation();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithProviders(<SettingsScreen navigation={nav} />),
      );
    });
    const json = JSON.stringify(renderer.toJSON());
    expect(json).not.toContain('React Native 0.88.1');
    expect(json).not.toContain('Fabric / New Architecture');
    await act(async () => {
      renderer.unmount();
    });
  });
});
