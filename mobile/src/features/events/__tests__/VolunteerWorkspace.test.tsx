/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { VolunteerDynamicIsland } from '../components/VolunteerDynamicIsland';
import { VolunteerWorkspaceScreen } from '../screens/VolunteerWorkspaceScreen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../../../theme/ThemeProvider';
import { MockEventRepository } from '../../../data/mock/MockEventRepository';

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderWithTheme(ui: React.ReactElement) {
  return (
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <ThemeProvider initialMode="light">{ui}</ThemeProvider>
    </SafeAreaProvider>
  );
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

describe('VolunteerDynamicIsland', () => {
  it('renders both applications and assignments tabs', async () => {
    const onTabPress = jest.fn();
    let root!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        renderWithTheme(
          <VolunteerDynamicIsland
            activeTab="applications"
            onTabPress={onTabPress}
          />,
        ),
      );
    });

    const tabs = root.root.findAll(
      el =>
        el.props.accessibilityRole === 'tab' &&
        typeof el.props.onPress === 'function',
    );
    expect(tabs.length).toBe(2);
    expect(tabs[0].props.accessibilityLabel).toContain('Applications');
    expect(tabs[1].props.accessibilityLabel).toContain('Assignments');
  });

  it('triggers onTabPress when a tab is pressed', async () => {
    const onTabPress = jest.fn();
    let root!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        renderWithTheme(
          <VolunteerDynamicIsland
            activeTab="applications"
            onTabPress={onTabPress}
          />,
        ),
      );
    });

    const tabs = root.root.findAll(
      el =>
        el.props.accessibilityRole === 'tab' &&
        typeof el.props.onPress === 'function',
    );
    await ReactTestRenderer.act(async () => {
      tabs[1].props.onPress();
    });

    expect(onTabPress).toHaveBeenCalledWith('assignments');
  });
});

describe('VolunteerWorkspaceScreen', () => {
  it('renders header and dynamic island', async () => {
    const nav = createMockNavigation();
    const repo = new MockEventRepository();

    let root!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      root = ReactTestRenderer.create(
        renderWithTheme(
          <VolunteerWorkspaceScreen navigation={nav} repository={repo} />,
        ),
      );
    });

    const island = root.root.findByType(VolunteerDynamicIsland);
    expect(island).toBeTruthy();
    expect(island.props.activeTab).toBe('applications');
  });
});
