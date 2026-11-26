/**
 * @format
 */

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  isConsumerOnlyMode,
  resetConsumerModeState,
  sanitizeConsumerMessage,
  setConsumerModeState,
} from '../src/app/configuration/consumerMode';
import { UserContext, FullUserContextValue } from '../src/app/UserContext';
import { resetBffConnectionState, syncClientRuntimeConfig } from '../src/core/api/bffDiscovery';
import { ordinaryVolunteerUser } from '../src/data/mock/fixtures/demoUsers';
import { defaultDashboardRepository } from '../src/data/mock/MockDashboardRepository';
import { OtpLoginScreen, StartupSplashScreen } from '../src/features/auth';
import { DashboardScreen } from '../src/features/dashboard/screens/DashboardScreen';
import { SettingsScreen } from '../src/features/settings/screens/SettingsScreen';
import { EmptyFormTemplate, EmptyState, ErrorState } from '../src/shared';
import { ThemeProvider } from '../src/theme/ThemeProvider';

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

describe('Consumer-Only Mode & Empty Form Placeholders', () => {
  beforeEach(() => {
    resetConsumerModeState();
    resetBffConnectionState();
    defaultDashboardRepository.setShouldFail(false);
  });

  afterEach(() => {
    resetConsumerModeState();
    resetBffConnectionState();
    defaultDashboardRepository.setShouldFail(false);
  });

  it('defaults to Consumer-Only Mode and syncs dynamically from /api/v1/client-config/', async () => {
    expect(isConsumerOnlyMode()).toBe(true);

    const mockClient = {
      get: jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          dev_options_enabled: true,
          consumer_only: false,
          expose_debug_errors: true,
        },
      }),
    } as any;

    await syncClientRuntimeConfig('http://localhost:8000', 1000, mockClient);
    expect(isConsumerOnlyMode()).toBe(false);

    mockClient.get.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: {
        dev_options_enabled: false,
        consumer_only: true,
        expose_debug_errors: false,
      },
    });
    await syncClientRuntimeConfig('http://localhost:8000', 1000, mockClient);
    expect(isConsumerOnlyMode()).toBe(true);
  });

  it('hides BFF endpoints, host presets, and technical diagnostics on Settings, Login, and Splash screens', async () => {
    let settingsTree!: ReactTestRenderer.ReactTestRenderer;
    let loginTree!: ReactTestRenderer.ReactTestRenderer;
    let splashTree!: ReactTestRenderer.ReactTestRenderer;

    const mockCtx: FullUserContextValue = {
      currentUser: ordinaryVolunteerUser,
      setCurrentUser: jest.fn(),
      isCoordinator: false,
      switchUserPreset: jest.fn(),
      isAuthenticated: false,
      isBootstrapping: false,
      requestOtp: jest.fn(),
      verifyOtp: jest.fn(),
      logout: jest.fn(),
      refreshSessionUser: jest.fn(),
    };

    await act(async () => {
      settingsTree = ReactTestRenderer.create(
        renderWithProviders(
          <UserContext.Provider value={mockCtx}>
            <SettingsScreen />
          </UserContext.Provider>,
        ),
      );
      loginTree = ReactTestRenderer.create(
        renderWithProviders(
          <UserContext.Provider value={mockCtx}>
            <OtpLoginScreen />
          </UserContext.Provider>,
        ),
      );
      splashTree = ReactTestRenderer.create(
        renderWithProviders(
          <StartupSplashScreen
            statusText="Connecting to VCS..."
            targetEndpoint="http://10.0.2.2:8000"
          />,
        ),
      );
    });

    const settingsJson = JSON.stringify(settingsTree.toJSON());
    expect(settingsJson).toContain('Appearance & Theme');
    expect(settingsJson).not.toContain('BFF Host / Port');
    expect(settingsJson).not.toContain('Active Endpoint:');
    expect(settingsJson).not.toContain('10.0.2.2');

    const loginJson = JSON.stringify(loginTree.toJSON());
    expect(loginJson).toContain('VCS Sign In');
    expect(loginJson).not.toContain('BFF Connected');
    expect(loginJson).not.toContain('localhost:8000');

    const splashJson = JSON.stringify(splashTree.toJSON());
    expect(splashJson).toContain('Connecting to VCS...');
    expect(splashJson).not.toContain('http://10.0.2.2:8000');

    await act(async () => {
      settingsTree.unmount();
      loginTree.unmount();
      splashTree.unmount();
    });
  });

  it('renders EmptyFormTemplate instead of error banners when ErrorState or EmptyState has no data', async () => {
    expect(
      sanitizeConsumerMessage(
        'TypeError: Network request failed at http://127.0.0.1:8000',
        'Fallback message',
      ),
    ).toBe('Fallback message');

    let errTree!: ReactTestRenderer.ReactTestRenderer;
    let emptyTree!: ReactTestRenderer.ReactTestRenderer;
    let tplTree!: ReactTestRenderer.ReactTestRenderer;

    await act(async () => {
      errTree = ReactTestRenderer.create(
        renderWithProviders(
          <ErrorState
            title="Failed to load events"
            description="Network request failed http://localhost:8000/api/v1/events"
            onRetry={() => {}}
          />,
        ),
      );
      emptyTree = ReactTestRenderer.create(
        renderWithProviders(
          <EmptyState
            title="No events found"
            description="No events match right now."
          />,
        ),
      );
      tplTree = ReactTestRenderer.create(
        renderWithProviders(
          <EmptyFormTemplate
            title="Profile Template"
            fields={[
              { label: 'Full Name', placeholder: 'Enter name' },
              { label: 'Area', placeholder: 'Enter area' },
            ]}
          />,
        ),
      );
    });

    const errJson = JSON.stringify(errTree.toJSON());
    expect(errJson).toContain('empty-form-template');
    expect(errJson).not.toContain('Failed to load events');
    expect(errJson).not.toContain('http://localhost:8000');

    const emptyJson = JSON.stringify(emptyTree.toJSON());
    expect(emptyJson).toContain('empty-state-form-template');
    expect(emptyJson).toContain('No record yet');

    const tplJson = JSON.stringify(tplTree.toJSON());
    expect(tplJson).toContain('Profile Template');
    expect(tplJson).toContain('Full Name');

    // Consumer mode DashboardScreen when data fails to load renders calm placeholder template
    defaultDashboardRepository.setShouldFail(true);

    const dashCtx: FullUserContextValue = {
      currentUser: ordinaryVolunteerUser,
      setCurrentUser: jest.fn(),
      isCoordinator: false,
      switchUserPreset: jest.fn(),
      isAuthenticated: true,
      isBootstrapping: false,
      requestOtp: jest.fn(),
      verifyOtp: jest.fn(),
      logout: jest.fn(),
      refreshSessionUser: jest.fn(),
    };
    let dashTree!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      setConsumerModeState({ devOptionsEnabled: false });
      dashTree = ReactTestRenderer.create(
        renderWithProviders(
          <UserContext.Provider value={dashCtx}>
            <DashboardScreen />
          </UserContext.Provider>,
        ),
      );
    });

    const dashJson = JSON.stringify(dashTree.toJSON());
    expect(dashJson).toContain('empty-form-template');
    expect(dashJson).toContain('Upcoming Shifts');
    expect(dashJson).not.toContain('Failed to load dashboard');

    await act(async () => {
      errTree.unmount();
      emptyTree.unmount();
      tplTree.unmount();
      dashTree.unmount();
    });
  });
});
