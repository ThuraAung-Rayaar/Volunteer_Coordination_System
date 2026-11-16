/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  FriendsPlaceholderScreen,
  FriendsScreen,
} from '../src/features/friends';
import { ThemeProvider } from '../src/theme/ThemeProvider';

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
    canGoBack: jest.fn(() => false),
    getParent: jest.fn(),
    getState: jest.fn(),
    addListener: jest.fn(() => () => {}),
    removeListener: jest.fn(),
    setParams: jest.fn(),
    setOptions: jest.fn(),
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

describe('FriendsPlaceholderScreen', () => {
  it('renders clean minimal placeholder with title Friends and single explanation sentence', async () => {
    const nav = createMockNavigation();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(<FriendsPlaceholderScreen navigation={nav} />),
      );
    });

    const json = safeStringify(renderer.toJSON());
    // Page title and clean empty-state
    expect(json).toContain('Friends');
    expect(json).toContain(
      'Volunteer connections will be available when this feature is implemented.',
    );

    // Verify removal of redundant sub-tabs, cards, and decorative blocks
    expect(json).not.toContain('Privacy & Relationship Architecture');
    expect(json).not.toContain('Past Coordinators');
    expect(json).not.toContain('Shift Invites');
    expect(json).not.toContain('Peer Connections');
    expect(json).not.toContain('Feature Planned');
    expect(json).not.toContain('Backend Relationship Specification Pending');

    // No tab buttons rendered
    const tabs = renderer.root.findAllByProps({ accessibilityRole: 'tab' });
    expect(tabs).toHaveLength(0);
  });

  it('has accessible drawer menu button that opens the drawer on press', async () => {
    const nav = createMockNavigation();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(<FriendsPlaceholderScreen navigation={nav} />),
      );
    });

    const menuButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === 'Open navigation menu');

    expect(menuButton).toBeDefined();

    await ReactTestRenderer.act(async () => {
      menuButton!.props.onPress();
    });

    expect(nav.openDrawer).toHaveBeenCalledTimes(1);
  });

  it('FriendsScreen adapter renders FriendsPlaceholderScreen successfully', async () => {
    const nav = createMockNavigation();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <FriendsScreen navigation={nav} route={{} as any} />,
        ),
      );
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('Friends');
    expect(json).toContain(
      'Volunteer connections will be available when this feature is implemented.',
    );
  });
});
