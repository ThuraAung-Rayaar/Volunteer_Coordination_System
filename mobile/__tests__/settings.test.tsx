/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SettingsScreen } from '../src/features/settings/screens/SettingsScreen';
import { MainDrawerContent } from '../src/navigation/MainDrawerContent';
import { UserContext, UserContextValue } from '../src/app/UserContext';
import { ordinaryVolunteerUser } from '../src/data/mock/fixtures/demoUsers';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import {
  getDataMode,
  resetDataMode,
  setDataMode,
} from '../src/app/configuration/dataMode';
import {
  resetConsumerModeState,
  setConsumerModeState,
} from '../src/app/configuration/consumerMode';
import { defaultApiClient } from '../src/core/api/apiClient';
import { resetBffConnectionState } from '../src/core/api/bffDiscovery';

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

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

function createMockDrawerProps() {
  return {
    state: {
      index: 0,
      routes: [{ key: 'Settings-key', name: 'Settings' }],
      routeNames: ['Settings'],
      type: 'drawer',
      stale: false,
      key: 'drawer-key',
    },
    navigation: createMockNavigation(),
    descriptors: {},
  } as any;
}

function renderWithTheme(ui: React.ReactElement) {
  return (
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>
  );
}

function safeStringify(obj: unknown): string {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, value) => {
    if (key === '_owner') {
      return undefined;
    }
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return undefined;
      }
      seen.add(value);
    }
    return value;
  });
}

describe('SettingsScreen', () => {
  let activeRenderer: ReactTestRenderer.ReactTestRenderer | null = null;

  beforeEach(() => {
    resetDataMode();
    resetBffConnectionState();
    setConsumerModeState({ devOptionsEnabled: true });
    jest.restoreAllMocks();
  });

  afterEach(async () => {
    if (activeRenderer) {
      const toUnmount = activeRenderer;
      activeRenderer = null;
      await ReactTestRenderer.act(async () => {
        toUnmount.unmount();
      });
    }
    await ReactTestRenderer.act(async () => {
      resetDataMode();
      resetBffConnectionState();
      resetConsumerModeState();
    });
    jest.restoreAllMocks();
  });

  it('renders appearance options (System, Light, Dark) and changes theme mode', async () => {
    const nav = createMockNavigation();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(<SettingsScreen navigation={nav} />),
      );
      activeRenderer = renderer;
    });

    let json = safeStringify(renderer.toJSON());
    expect(json).toContain('Appearance & Theme');
    expect(json).toContain('System');
    expect(json).toContain('Light');
    expect(json).toContain('Dark');

    const darkButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === 'Dark');

    expect(darkButton).toBeDefined();

    await ReactTestRenderer.act(async () => {
      darkButton!.props.onPress();
    });

    json = safeStringify(renderer.toJSON());
    expect(json).toContain('Active: DARK (Dark Theme)');
  });

  it('does NOT render Template Mode or QA profile switchers in Settings', async () => {
    const nav = createMockNavigation();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(<SettingsScreen navigation={nav} />),
      );
      activeRenderer = renderer;
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).not.toContain('Template Mode');
    expect(json).not.toContain('Template & API Diagnostics');
    expect(json).not.toContain('QA DEMO PROFILE SWITCHER');
    expect(json).not.toContain('Switch to Ordinary Volunteer');
    expect(json).not.toContain('Switch to Approved Coordinator');
  });

  it('renders application information and Log Out action', async () => {
    const nav = createMockNavigation();
    const mockLogout = jest.fn().mockResolvedValue(undefined);
    const mockUserCtx: UserContextValue = {
      currentUser: ordinaryVolunteerUser,
      setCurrentUser: jest.fn(),
      isCoordinator: false,
      switchUserPreset: jest.fn(),
      logout: mockLogout,
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <UserContext.Provider value={mockUserCtx}>
            <SettingsScreen navigation={nav} />
          </UserContext.Provider>,
        ),
      );
      activeRenderer = renderer;
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('About Application');
    expect(json).toContain('Volunteer Coordination System');
    expect(json).toContain('Mode: Live BFF');

    const logoutButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === 'Log Out');

    expect(logoutButton).toBeDefined();

    await ReactTestRenderer.act(async () => {
      await logoutButton!.props.onPress();
    });

    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  describe('BFF Connection & Offline Mode Diagnostics', () => {
    it('renders BFF Connection & Offline Mode card without exposing secrets', async () => {
      const nav = createMockNavigation();
      let renderer!: ReactTestRenderer.ReactTestRenderer;
      await ReactTestRenderer.act(async () => {
        renderer = ReactTestRenderer.create(
          renderWithTheme(<SettingsScreen navigation={nav} />),
        );
      });

      const json = safeStringify(renderer.toJSON());
      expect(json).toContain('BFF Connection & Offline Mode');
      expect(json).toContain('Active Endpoint:');
      expect(json).toContain('Test BFF');
      expect(json).toContain('Auto-Detect & Connect');
      expect(json).not.toMatch(/auth_token|password|secret/i);
      expect(json).not.toMatch(/\+?[0-9]{10,}/);

      await ReactTestRenderer.act(async () => {
        renderer.unmount();
      });
    });

    it('switches to Offline Mode and clears cached data cleanly', async () => {
      const nav = createMockNavigation();
      let renderer!: ReactTestRenderer.ReactTestRenderer;
      await ReactTestRenderer.act(async () => {
        renderer = ReactTestRenderer.create(
          renderWithTheme(<SettingsScreen navigation={nav} />),
        );
      });

      expect(getDataMode()).toBe('http');

      const offlineBtn = renderer.root
        .findAllByProps({ accessibilityRole: 'button' })
        .find(b => b.props.accessibilityLabel === 'Switch to Offline Mode');
      expect(offlineBtn).toBeDefined();

      await ReactTestRenderer.act(async () => {
        offlineBtn!.props.onPress();
      });

      expect(getDataMode()).toBe('offline');
      const json = safeStringify(renderer.toJSON());
      expect(json).toContain('Offline Mode Active');

      await ReactTestRenderer.act(async () => {
        renderer.unmount();
      });
    });

    it('pings BFF and displays reachability and latency', async () => {
      jest.spyOn(defaultApiClient, 'get').mockResolvedValue({
        ok: true,
        status: 200,
        data: { dev_options_enabled: true },
      });

      const nav = createMockNavigation();
      let renderer!: ReactTestRenderer.ReactTestRenderer;
      await ReactTestRenderer.act(async () => {
        renderer = ReactTestRenderer.create(
          renderWithTheme(<SettingsScreen navigation={nav} />),
        );
      });

      const pingButton = renderer.root
        .findAllByProps({ accessibilityRole: 'button' })
        .find(b => b.props.accessibilityLabel === 'Test BFF Connection');
      expect(pingButton).toBeDefined();

      await ReactTestRenderer.act(async () => {
        await pingButton!.props.onPress();
      });

      const json = safeStringify(renderer.toJSON());
      expect(json).toContain('BFF Reachable:');

      await ReactTestRenderer.act(async () => {
        renderer.unmount();
      });
    });
  });

  it('excludes QA profile switcher from drawer in all builds', async () => {
    const mockValue: UserContextValue = {
      currentUser: ordinaryVolunteerUser,
      setCurrentUser: jest.fn(),
      isCoordinator: false,
      switchUserPreset: jest.fn(),
    };
    const drawerProps = createMockDrawerProps();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <ThemeProvider>
            <UserContext.Provider value={mockValue}>
              <MainDrawerContent {...drawerProps} />
            </UserContext.Provider>
          </ThemeProvider>
        </SafeAreaProvider>,
      );
      activeRenderer = renderer;
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).not.toContain('QA DEMO PROFILE SWITCHER');
    expect(json).not.toContain('Switch to ordinary volunteer');
    expect(json).not.toContain('Switch to coordinator');
  });

  it('renders Notifications section in SettingsScreen and navigates to Notifications', async () => {
    setDataMode('http');
    const nav = createMockNavigation();
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(<SettingsScreen navigation={nav} />),
      );
      activeRenderer = renderer;
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('Notifications');
    expect(json).toContain('Open Notifications');

    const notifBtn = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === 'Open Notifications');
    expect(notifBtn).toBeDefined();

    await ReactTestRenderer.act(async () => {
      notifBtn!.props.onPress();
    });

    expect(nav.navigate).toHaveBeenCalledWith('Notifications');
  });
});
