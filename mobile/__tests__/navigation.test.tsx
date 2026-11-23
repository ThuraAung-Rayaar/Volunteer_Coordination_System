/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { UserContext, UserContextValue } from '../src/app/UserContext';
import {
  approvedCoordinatorUser,
  ordinaryVolunteerUser,
  pendingCoordinatorUser,
  suspendedCoordinatorUser,
} from '../src/data/mock/fixtures/demoUsers';
import { hasCoordinatorAccess, UserProfileSnapshot } from '../src/domain/models';
import { MainDrawerContent } from '../src/navigation/MainDrawerContent';
import { RouteNames } from '../src/navigation/routeNames';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import App from '../App';

const initialMetrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function createMockDrawerProps(
  currentRoute: string = 'Dashboard',
  routes: string[] = ['Dashboard', 'Events', 'Friends', 'Settings'],
) {
  const routeObjects = routes.map((name, index) => ({
    key: `route-${index}`,
    name,
    params: undefined,
  }));
  const currentIndex = routes.indexOf(currentRoute);

  return {
    state: {
      type: 'drawer' as const,
      key: 'drawer-key',
      routeNames: routes,
      routes: routeObjects,
      index: currentIndex >= 0 ? currentIndex : 0,
      stale: false,
      history: [],
    },
    navigation: {
      navigate: jest.fn(),
      closeDrawer: jest.fn(),
      openDrawer: jest.fn(),
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
    } as any,
    descriptors: {} as any,
  };
}

describe('Navigation & Role Derivation Logic', () => {
  it('correctly derives coordinator access according to business rules', () => {
    expect(hasCoordinatorAccess(ordinaryVolunteerUser)).toBe(false);
    expect(hasCoordinatorAccess(approvedCoordinatorUser)).toBe(true);
    expect(hasCoordinatorAccess(pendingCoordinatorUser)).toBe(false);
    expect(hasCoordinatorAccess(suspendedCoordinatorUser)).toBe(false);

    const blockedUser: UserProfileSnapshot = {
      ...approvedCoordinatorUser,
      accountStatus: 'blocked',
    };
    expect(hasCoordinatorAccess(blockedUser)).toBe(false);

    const closedUser: UserProfileSnapshot = {
      ...approvedCoordinatorUser,
      accountStatus: 'closed',
    };
    expect(hasCoordinatorAccess(closedUser)).toBe(false);
  });

  it('contains all 10 required routes in RouteNames', () => {
    const expectedRoutes = [
      'Dashboard',
      'Events',
      'Notifications',
      'Friends',
      'MyApplications',
      'MyAssignments',
      'Profile',
      'Availability',
      'VerificationCoordinatorStatus',
      'CoordinatorWorkspace',
      'Settings',
    ];

    for (const route of expectedRoutes) {
      expect(RouteNames[route as keyof typeof RouteNames]).toBe(route);
    }
  });
});

describe('MainDrawerContent & Conditional Visibility', () => {
  it('hides Coordinator Workspace when user is an ordinary volunteer', async () => {
    const mockValue: UserContextValue = {
      currentUser: ordinaryVolunteerUser,
      setCurrentUser: jest.fn(),
      isCoordinator: false,
      switchUserPreset: jest.fn(),
    };
    const drawerProps = createMockDrawerProps('Dashboard');

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <ThemeProvider>
            <UserContext.Provider value={mockValue}>
              <MainDrawerContent {...(drawerProps as any)} />
            </UserContext.Provider>
          </ThemeProvider>
        </SafeAreaProvider>,
      );
    });

    const str = JSON.stringify(renderer.toJSON());
    expect(str).toContain('Dashboard');
    expect(str).toContain('Events');
    expect(str).toContain('Alex Morgan');
    // Coordinator Workspace must be hidden
    expect(str).not.toContain('Coordinator Workspace');
  });

  it('renders Coordinator Workspace when user is an approved coordinator', async () => {
    const mockValue: UserContextValue = {
      currentUser: approvedCoordinatorUser,
      setCurrentUser: jest.fn(),
      isCoordinator: true,
      switchUserPreset: jest.fn(),
    };
    const drawerProps = createMockDrawerProps('Dashboard', [
      'Dashboard',
      'Events',
      'CoordinatorWorkspace',
      'Settings',
    ]);

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <ThemeProvider>
            <UserContext.Provider value={mockValue}>
              <MainDrawerContent {...(drawerProps as any)} />
            </UserContext.Provider>
          </ThemeProvider>
        </SafeAreaProvider>,
      );
    });

    const str = JSON.stringify(renderer.toJSON());
    expect(str).toContain('Dashboard');
    expect(str).toContain('Coordinator Workspace');
    expect(str).toContain('Jordan Lee (Coordinator)');
  });

  it('navigates when a drawer item is pressed', async () => {
    const mockValue: UserContextValue = {
      currentUser: ordinaryVolunteerUser,
      setCurrentUser: jest.fn(),
      isCoordinator: false,
      switchUserPreset: jest.fn(),
    };
    const drawerProps = createMockDrawerProps('Dashboard');

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <ThemeProvider>
            <UserContext.Provider value={mockValue}>
              <MainDrawerContent {...(drawerProps as any)} />
            </UserContext.Provider>
          </ThemeProvider>
        </SafeAreaProvider>,
      );
    });

    // Find and press the Events drawer item
    const eventsButton = renderer.root.findByProps({
      accessibilityLabel: 'Events',
    });
    eventsButton.props.onPress();
    expect(drawerProps.navigation.navigate).toHaveBeenCalledWith('Events');
  });

  it('renders root App without crashing', async () => {
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<App />);
    });
    expect(renderer.toJSON()).toBeTruthy();
  });
});
