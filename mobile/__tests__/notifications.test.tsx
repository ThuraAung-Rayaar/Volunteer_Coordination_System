/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContext } from '@react-navigation/native';
import { NotificationsScreen } from '../src/features/notifications/screens/NotificationsScreen';
import { AppHeader } from '../src/shared/layout/AppHeader';
import { ThemeProvider } from '../src/theme/ThemeProvider';

const activeRenderers: ReactTestRenderer.ReactTestRenderer[] = [];
const originalCreate = ReactTestRenderer.create;
ReactTestRenderer.create = ((...args: Parameters<typeof originalCreate>) => {
  const r = originalCreate(...args);
  activeRenderers.push(r);
  return r;
}) as any;

afterEach(async () => {
  while (activeRenderers.length > 0) {
    const r = activeRenderers.pop();
    try {
      await ReactTestRenderer.act(async () => {
        r?.unmount();
      });
    } catch {}
  }
});

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

function renderWithTheme(ui: React.ReactElement, navigationMock?: any) {
  const content = navigationMock ? (
    <NavigationContext.Provider value={navigationMock}>
      {ui}
    </NavigationContext.Provider>
  ) : (
    ui
  );
  return (
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <ThemeProvider>{content}</ThemeProvider>
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

describe('NotificationsScreen', () => {
  it('renders notifications list with titles, timestamps, and filter tabs', async () => {
    const nav = createMockNavigation();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(<NotificationsScreen navigation={nav} />),
      );
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('Notifications');
    expect(json).toContain('Shift Confirmed');
    expect(json).toContain('Application Received');
    expect(json).toContain('Identity Verification Approved');
    expect(json).toContain('New Nearby Event Published');
    expect(json).toContain('All');
    expect(json).toContain('Unread (2)');
    expect(json).toContain('Shifts');
    expect(json).toContain('System');
  });

  it('filters notifications by Unread tab and updates list view', async () => {
    const nav = createMockNavigation();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(<NotificationsScreen navigation={nav} />),
      );
    });

    const unreadTab = renderer.root
      .findAllByProps({ accessibilityRole: 'checkbox' })
      .find(c => c.props.accessibilityLabel === 'Unread (2)');

    expect(unreadTab).toBeDefined();

    await ReactTestRenderer.act(async () => {
      unreadTab!.props.onPress();
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('Shift Confirmed');
    expect(json).toContain('Application Received');
    // Read notifications should be hidden in Unread tab
    expect(json).not.toContain('Identity Verification Approved');
  });

  it('marks individual notification as read and navigates when action is pressed', async () => {
    const nav = createMockNavigation();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(<NotificationsScreen navigation={nav} />),
      );
    });

    const viewShiftButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === 'View Shift');

    expect(viewShiftButton).toBeDefined();

    await ReactTestRenderer.act(async () => {
      viewShiftButton!.props.onPress();
    });

    expect(nav.navigate).toHaveBeenCalledWith('MyAssignments');
  });

  it('marks all notifications as read when Mark all read is pressed', async () => {
    const nav = createMockNavigation();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(<NotificationsScreen navigation={nav} />),
      );
    });

    const markAllButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === 'Mark all notifications as read');

    expect(markAllButton).toBeDefined();

    await ReactTestRenderer.act(async () => {
      markAllButton!.props.onPress();
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('All caught up');
    expect(json).toContain('Unread (0)');
  });
});

describe('AppHeader Notification Bell', () => {
  it('navigates to Notifications screen when notification bell is pressed', async () => {
    const nav = createMockNavigation();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(<AppHeader title="Test Screen" />, nav),
      );
    });

    const bellButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === 'Notifications');

    expect(bellButton).toBeDefined();

    await ReactTestRenderer.act(async () => {
      bellButton!.props.onPress();
    });

    expect(nav.navigate).toHaveBeenCalledWith('Notifications');
  });
});
