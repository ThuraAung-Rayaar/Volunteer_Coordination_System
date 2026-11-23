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
import { eventApi } from '../src/data/endpoints/eventApi';

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
      routes: [
        { key: 'Settings-key', name: 'Settings' },
      ],
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
  it('renders appearance options (System, Light, Dark) and changes theme mode', async () => {
    const nav = createMockNavigation();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(<SettingsScreen navigation={nav} />),
      );
    });

    let json = safeStringify(renderer.toJSON());
    expect(json).toContain('Appearance & Theme');
    expect(json).toContain('System');
    expect(json).toContain('Light');
    expect(json).toContain('Dark');

    // Switch to dark
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

  it('does NOT render the Volunteer/Coordinator role switch in Settings', async () => {
    const nav = createMockNavigation();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(<SettingsScreen navigation={nav} />),
      );
    });

    const json = safeStringify(renderer.toJSON());

    // Role switcher should NOT exist in Settings
    expect(json).not.toContain('QA DEMO PROFILE SWITCHER');
    expect(json).not.toContain('Switch to Ordinary Volunteer');
    expect(json).not.toContain('Switch to Approved Coordinator');
    expect(json).not.toContain('DEMO FIXTURE SWITCHER');
    expect(json).not.toContain('Current Mock Account');
  });

  it('renders application information and demo logout action with feedback', async () => {
    const nav = createMockNavigation();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(<SettingsScreen navigation={nav} />),
      );
    });

    let json = safeStringify(renderer.toJSON());
    expect(json).toContain('About Application');
    expect(json).toContain('Volunteer Coordination System');
    expect(json).toContain('Version: 0.8.1');

    // Logout button
    const logoutButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === 'Log Out (Demo)');

    expect(logoutButton).toBeDefined();

    await ReactTestRenderer.act(async () => {
      logoutButton!.props.onPress();
    });

    json = safeStringify(renderer.toJSON());
    expect(json).toContain(
      'Demo only — session logout will be handled by authentication provider in production.',
    );
  });

  describe('Connection & DataMode Diagnostics (Phase 9)', () => {
    beforeEach(async () => {
      await ReactTestRenderer.act(async () => {
        resetDataMode();
      });
      jest.restoreAllMocks();
    });

    afterEach(async () => {
      await ReactTestRenderer.act(async () => {
        resetDataMode();
      });
      jest.restoreAllMocks();
    });

    it('renders API diagnostics panel in development mode without exposing secrets', async () => {
      const originalDev = (globalThis as any).__DEV__;
      (globalThis as any).__DEV__ = true;

      try {
        const nav = createMockNavigation();
        let renderer!: ReactTestRenderer.ReactTestRenderer;
        await ReactTestRenderer.act(async () => {
          renderer = ReactTestRenderer.create(
            renderWithTheme(<SettingsScreen navigation={nav} />),
          );
        });

        const json = safeStringify(renderer.toJSON());
        expect(json).toContain('Template & API Diagnostics');
        expect(json).toContain('Active Data Mode: TEMPLATE');
        expect(json).toContain('API Base URL:');
        expect(json).toContain('Test BFF Connection');

        // STRICT CONSTRAINT 1: NEVER display tokens, phone numbers, or secrets
        expect(json).not.toMatch(/token/i);
        expect(json).not.toMatch(/\+?[0-9]{10,}/);
        expect(json).not.toContain('password');
        expect(json).not.toContain('secret');

        await ReactTestRenderer.act(async () => {
          renderer.unmount();
        });
      } finally {
        (globalThis as any).__DEV__ = originalDev;
      }
    });

    it('hides API diagnostics panel in production mode (__DEV__ = false)', async () => {
      const originalDev = (globalThis as any).__DEV__;
      (globalThis as any).__DEV__ = false;

      try {
        const nav = createMockNavigation();
        let renderer!: ReactTestRenderer.ReactTestRenderer;
        await ReactTestRenderer.act(async () => {
          renderer = ReactTestRenderer.create(
            renderWithTheme(<SettingsScreen navigation={nav} />),
          );
        });

        const json = safeStringify(renderer.toJSON());
        expect(json).not.toContain('Template & API Diagnostics');
        expect(json).not.toContain('Test BFF Connection');

        await ReactTestRenderer.act(async () => {
          renderer.unmount();
        });
      } finally {
        (globalThis as any).__DEV__ = originalDev;
      }
    });

    it('switches data mode between mock and http safely via diagnostic buttons', async () => {
      const originalDev = (globalThis as any).__DEV__;
      (globalThis as any).__DEV__ = true;

      try {
        const nav = createMockNavigation();
        let renderer!: ReactTestRenderer.ReactTestRenderer;
        await ReactTestRenderer.act(async () => {
          renderer = ReactTestRenderer.create(
            renderWithTheme(<SettingsScreen navigation={nav} />),
          );
        });

        expect(getDataMode()).toBe('mock');

        // Switch to HTTP
        const httpButton = renderer.root
          .findAllByProps({ accessibilityRole: 'button' })
          .find(b => b.props.accessibilityLabel === 'Switch to HTTP');
        expect(httpButton).toBeDefined();

        await ReactTestRenderer.act(async () => {
          httpButton!.props.onPress();
        });

        expect(getDataMode()).toBe('http');
        let json = safeStringify(renderer.toJSON());
        expect(json).toContain('Active Data Mode: HTTP');

        // Switch back to Template Mode
        const mockButton = renderer.root
          .findAllByProps({ accessibilityRole: 'button' })
          .find(b => b.props.accessibilityLabel === 'Switch to Template Mode');
        expect(mockButton).toBeDefined();

        await ReactTestRenderer.act(async () => {
          mockButton!.props.onPress();
        });

        expect(getDataMode()).toBe('mock');
        json = safeStringify(renderer.toJSON());
        expect(json).toContain('Active Data Mode: TEMPLATE');

        await ReactTestRenderer.act(async () => {
          renderer.unmount();
        });
      } finally {
        (globalThis as any).__DEV__ = originalDev;
      }
    });

    it('pings BFF and displays reachability and latency', async () => {
      const originalDev = (globalThis as any).__DEV__;
      (globalThis as any).__DEV__ = true;

      jest.spyOn(eventApi, 'getCharityFields').mockResolvedValueOnce({
        ok: true,
        status: 200,
        data: [],
      });

      try {
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
          pingButton!.props.onPress();
        });

        const json = safeStringify(renderer.toJSON());
        expect(json).toContain('BFF Reachable: HTTP 200');

        await ReactTestRenderer.act(async () => {
          renderer.unmount();
        });
      } finally {
        (globalThis as any).__DEV__ = originalDev;
      }
    });
  });
});

describe('Production Safety: Side-Drawer QA Demo Switcher', () => {
  it('excludes QA profile switcher from drawer when __DEV__ is false (production)', async () => {
    const originalDev = (globalThis as any).__DEV__;
    (globalThis as any).__DEV__ = false;

    try {
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
      });

      const json = safeStringify(renderer.toJSON());
      expect(json).not.toContain('QA DEMO PROFILE SWITCHER');
      expect(json).not.toContain('Switch to ordinary volunteer');
      expect(json).not.toContain('Switch to coordinator');
    } finally {
      (globalThis as any).__DEV__ = originalDev;
    }
  });

  it('includes QA profile switcher in drawer when __DEV__ is true (development)', async () => {
    const originalDev = (globalThis as any).__DEV__;
    (globalThis as any).__DEV__ = true;

    try {
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
      });

      const json = safeStringify(renderer.toJSON());
      expect(json).toContain('QA DEMO PROFILE SWITCHER');
      expect(json).toContain('Volunteer');
      expect(json).toContain('Coordinator');
    } finally {
      (globalThis as any).__DEV__ = originalDev;
    }
  });

  it('renders Notifications section in SettingsScreen and navigates to Notifications', async () => {
    const nav = createMockNavigation();
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <ThemeProvider>
            <SettingsScreen navigation={nav} />
          </ThemeProvider>
        </SafeAreaProvider>,
      );
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
