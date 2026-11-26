/**
 * @format
 */

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { StartupSplashScreen, OtpLoginScreen } from '../src/features/auth';
import { VCS_PROVERBS } from '../src/shared/constants/vcsProverbs';
import { AppHeader } from '../src/shared/layout/AppHeader';
import { resetDataMode, setDataMode } from '../src/app/configuration/dataMode';
import {
  resetConsumerModeState,
  setConsumerModeState,
} from '../src/app/configuration/consumerMode';
import {
  OfflineCacheMissError,
  QueryCache,
  CACHE_SCOPE,
} from '../src/data/cache';
import { UserContext, FullUserContextValue } from '../src/app/UserContext';
import { AppNavigationRoot } from '../src/app/AppRoot';
import { ordinaryVolunteerUser } from '../src/data/mock/fixtures/demoUsers';

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

describe('VCS Startup Splash, Always-Login & Offline Cache Mode', () => {
  beforeEach(() => {
    act(() => {
      resetDataMode();
      setConsumerModeState({ devOptionsEnabled: true });
    });
  });

  afterEach(() => {
    act(() => {
      resetDataMode();
      resetConsumerModeState();
    });
  });

  it('renders StartupSplashScreen with VCS text theme and a proverb', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithProviders(
          <StartupSplashScreen
            statusText="Connecting to local BFF..."
            targetEndpoint="http://localhost:8000"
          />,
        ),
      );
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain('VCS');
    expect(json).toContain('VOLUNTEER COORDINATION SYSTEM');
    expect(json).toContain('CommonGround');
    expect(json).toContain('SPIRIT OF SERVICE');
    expect(json).toContain('Connecting to local BFF...');
    expect(json).toContain('http://localhost:8000');

    const matchesProverb = VCS_PROVERBS.some(p => json.includes(p.text));
    expect(matchesProverb).toBe(true);

    await act(async () => {
      renderer.unmount();
    });
  });

  it('always starts at OtpLoginScreen on launch even when a session token is already authenticated', async () => {
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
            />
          </UserContext.Provider>,
        ),
      );
    });

    const loginScreens = renderer.root.findAllByType(OtpLoginScreen);
    expect(loginScreens).toHaveLength(1);
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain(`Continue as ${ordinaryVolunteerUser.displayName}`);

    await act(async () => {
      renderer.unmount();
    });
  });

  it('renders OfflineBanner inside AppHeader when offline mode is active', async () => {
    act(() => {
      setDataMode('offline');
    });

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithProviders(<AppHeader title="Dashboard" />),
      );
    });

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain('Offline Mode · Cached Data');
    expect(json).toContain('Reconnect');

    await act(async () => {
      renderer.unmount();
    });
  });

  it('serves stale cached entries in Offline Mode and on network failure, and supports snapshot hydration', async () => {
    const cache = new QueryCache(10);

    const data = await cache.getOrFetch(
      'public:events:test',
      async () => [{ id: '1', title: 'Tree Planting' }],
      { ttlMs: 1, scope: CACHE_SCOPE.PUBLIC },
    );
    expect(data).toHaveLength(1);

    await new Promise(resolve => setTimeout(resolve, 10));

    // Online network failure falls back to stale entry
    const staleFallback = await cache.getOrFetch(
      'public:events:test',
      async () => {
        throw new Error('Network request failed');
      },
      { ttlMs: 1, scope: CACHE_SCOPE.PUBLIC },
    );
    expect(staleFallback).toEqual([{ id: '1', title: 'Tree Planting' }]);

    // Offline mode serves cached entry and throws OfflineCacheMissError for uncached keys
    setDataMode('offline');
    const offlineRead = await cache.getOrFetch(
      'public:events:test',
      async () => [],
      { ttlMs: 1 },
    );
    expect(offlineRead).toEqual([{ id: '1', title: 'Tree Planting' }]);

    await expect(
      cache.getOrFetch('uncached:key', async () => 'x'),
    ).rejects.toThrow(OfflineCacheMissError);

    // Export and re-hydrate into a fresh QueryCache instance
    const snapshot = cache.exportSnapshot();
    const restoredCache = new QueryCache(10);
    restoredCache.hydrateSnapshot(snapshot);
    expect(restoredCache.get('public:events:test')?.value).toEqual([
      { id: '1', title: 'Tree Planting' },
    ]);
  });
});
