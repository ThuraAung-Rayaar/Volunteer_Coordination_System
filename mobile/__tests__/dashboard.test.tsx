/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { UserContext, UserContextValue } from '../src/app/UserContext';
import {
  emptyDashboardSummary,
  volunteerDashboardSummary,
} from '../src/data/mock/fixtures/dashboardFixture';
import {
  approvedCoordinatorUser,
  ordinaryVolunteerUser,
  pendingCoordinatorUser,
  suspendedCoordinatorUser,
} from '../src/data/mock/fixtures/demoUsers';
import {
  defaultDashboardRepository,
  MockDashboardRepository,
} from '../src/data/mock/MockDashboardRepository';
import { defaultCoordinatorRepository } from '../src/data/mock/MockCoordinatorRepository';
import { defaultEventRepository } from '../src/data/mock/MockEventRepository';
import { mapDashboardSummary } from '../src/data/mappers/dashboardMapper';
import { appEventBus, AppEvents } from '../src/core/events/eventBus';
import { DashboardScreen } from '../src/features/dashboard/screens/DashboardScreen';
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
    canGoBack: jest.fn(() => false),
    getParent: jest.fn(),
    getState: jest.fn(),
    addListener: jest.fn(() => () => {}),
    removeListener: jest.fn(),
    setParams: jest.fn(),
    setOptions: jest.fn(),
  } as any;
}

function renderWithProviders(
  ui: React.ReactElement,
  userContext: UserContextValue,
) {
  return (
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <ThemeProvider>
        <UserContext.Provider value={userContext}>{ui}</UserContext.Provider>
      </ThemeProvider>
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

describe('Dashboard Repository & Domain Constraints', () => {
  it('returns attendance-backed completed activities', async () => {
    const repo = new MockDashboardRepository();
    const data = await repo.getDashboardSummary();

    expect(data.completedShiftCount).toBe(14);
    expect(data.recentCompletedActivities.length).toBeGreaterThan(0);

    for (const activity of data.recentCompletedActivities) {
      expect(activity.attendanceStatus).toBe('completed');
      expect(activity.verifiedHours).toBeGreaterThan(0);
      expect(activity.attendanceVerifiedAt).toBeDefined();
    }
  });

  it('handles empty summary with null rating average', async () => {
    const repo = new MockDashboardRepository(emptyDashboardSummary);
    const data = await repo.getDashboardSummary();

    expect(data.completedShiftCount).toBe(0);
    expect(data.ratingAverage).toBeNull();
    expect(data.ratingCount).toBe(0);
    expect(data.recentCompletedActivities).toHaveLength(0);
  });

  it('handles failure when configured', async () => {
    const repo = new MockDashboardRepository(volunteerDashboardSummary, true);
    await expect(repo.getDashboardSummary()).rejects.toThrow();
  });

  it('cancels upcoming commitment and updates commitment count', async () => {
    const repo = new MockDashboardRepository(volunteerDashboardSummary);
    const beforeData = await repo.getDashboardSummary();
    const initialCount = beforeData.upcomingCommitmentCount;

    const result = await repo.cancelUpcomingParticipation('comm-preview-001');
    expect(result.success).toBe(true);
    expect(result.message).toContain('Demo only');

    const afterData = await repo.getDashboardSummary();
    expect(afterData.upcomingCommitmentCount).toBe(initialCount - 1);
    expect(
      afterData.upcomingCommitments.some(c => c.id === 'comm-preview-001'),
    ).toBe(false);
  });

  it('rejects cancellation of completed participation per business rules', async () => {
    const repo = new MockDashboardRepository(volunteerDashboardSummary);
    const result = await repo.cancelUpcomingParticipation('act-attendance-001');

    expect(result.success).toBe(false);
    expect(result.message).toBe('Completed participation cannot be cancelled.');
  });
});

describe('DashboardScreen UI & Visibility Rules', () => {
  beforeEach(() => {
    defaultDashboardRepository.setSummary(volunteerDashboardSummary);
    defaultDashboardRepository.setShouldFail(false);
  });

  it('renders ordinary volunteer view without coordinator card', async () => {
    const mockUserContext: UserContextValue = {
      currentUser: ordinaryVolunteerUser,
      setCurrentUser: jest.fn(),
      isCoordinator: false,
      switchUserPreset: jest.fn(),
    };
    const navigation = createMockNavigation();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithProviders(
          <DashboardScreen navigation={navigation} route={{} as any} />,
          mockUserContext,
        ),
      );
    });

    const str = safeStringify(renderer.toJSON());
    // Welcome card
    expect(str).toContain('Alex Morgan');
    expect(str).toContain('Active Volunteer');
    // Stats
    expect(str).toContain('Shifts Completed');
    expect(str).toContain('14');
    // Aggregate rating
    expect(str).toContain('4.9');
    expect(str).toContain('26 reviews');
    // Completed activities
    expect(str).toContain('Neighborhood Library Book Fair');
    expect(str).toContain('Attendance Verified');
    // Coordinator Card MUST be hidden
    expect(str).not.toContain('Coordinator Workspace');
  });

  it('renders coordinator card for approved coordinator', async () => {
    const mockUserContext: UserContextValue = {
      currentUser: approvedCoordinatorUser,
      setCurrentUser: jest.fn(),
      isCoordinator: true,
      switchUserPreset: jest.fn(),
    };
    const navigation = createMockNavigation();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithProviders(
          <DashboardScreen navigation={navigation} route={{} as any} />,
          mockUserContext,
        ),
      );
    });

    const str = safeStringify(renderer.toJSON());
    expect(str).toContain('Jordan Lee (Coordinator)');
    expect(str).toContain('Approved Coordinator');
    // Coordinator Card MUST be visible
    expect(str).toContain('Coordinator Workspace');
    expect(str).toContain('Open Coordinator Workspace');
  });

  it('hides coordinator card for pending and suspended users', async () => {
    for (const user of [pendingCoordinatorUser, suspendedCoordinatorUser]) {
      const mockUserContext: UserContextValue = {
        currentUser: user,
        setCurrentUser: jest.fn(),
        isCoordinator: false,
        switchUserPreset: jest.fn(),
      };
      const navigation = createMockNavigation();

      let renderer!: ReactTestRenderer.ReactTestRenderer;
      await ReactTestRenderer.act(async () => {
        renderer = ReactTestRenderer.create(
          renderWithProviders(
            <DashboardScreen navigation={navigation} route={{} as any} />,
            mockUserContext,
          ),
        );
      });

      const str = safeStringify(renderer.toJSON());
      expect(str).not.toContain('Coordinator Workspace');
    }
  });

  it('renders "No ratings yet" when summary has no rating aggregate', async () => {
    defaultDashboardRepository.setSummary(emptyDashboardSummary);

    const mockUserContext: UserContextValue = {
      currentUser: ordinaryVolunteerUser,
      setCurrentUser: jest.fn(),
      isCoordinator: false,
      switchUserPreset: jest.fn(),
    };
    const navigation = createMockNavigation();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithProviders(
          <DashboardScreen navigation={navigation} route={{} as any} />,
          mockUserContext,
        ),
      );
    });

    const str = safeStringify(renderer.toJSON());
    expect(str).toContain('No ratings yet');
    expect(str).not.toContain('reviews)');
  });

  it('handles error state and allows retry', async () => {
    defaultDashboardRepository.setShouldFail(true);

    const mockUserContext: UserContextValue = {
      currentUser: ordinaryVolunteerUser,
      setCurrentUser: jest.fn(),
      isCoordinator: false,
      switchUserPreset: jest.fn(),
    };
    const navigation = createMockNavigation();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithProviders(
          <DashboardScreen navigation={navigation} route={{} as any} />,
          mockUserContext,
        ),
      );
    });

    const str = safeStringify(renderer.toJSON());
    expect(str).toContain('Failed to load dashboard');
    expect(str).toContain('Retry Dashboard');
  });

  it('navigates to EventDetail with returnTo=Dashboard when tapping an upcoming commitment card', async () => {
    const mockUserContext: UserContextValue = {
      currentUser: ordinaryVolunteerUser,
      setCurrentUser: jest.fn(),
      isCoordinator: false,
      switchUserPreset: jest.fn(),
    };
    const navigation = createMockNavigation();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithProviders(
          <DashboardScreen navigation={navigation} route={{} as any} />,
          mockUserContext,
        ),
      );
    });

    const cardButton = renderer.root.findByProps({
      accessibilityLabel: 'View details for Community Garden Revitalization',
    });
    await ReactTestRenderer.act(async () => {
      cardButton.props.onPress();
    });

    expect(navigation.navigate).toHaveBeenCalledWith('EventDetail', {
      eventId: 'evt-preview-101',
      returnTo: 'Dashboard',
    });
  });

  it('navigates to EventDetail with returnTo=Dashboard when tapping a completed event card', async () => {
    const mockUserContext: UserContextValue = {
      currentUser: ordinaryVolunteerUser,
      setCurrentUser: jest.fn(),
      isCoordinator: false,
      switchUserPreset: jest.fn(),
    };
    const navigation = createMockNavigation();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithProviders(
          <DashboardScreen navigation={navigation} route={{} as any} />,
          mockUserContext,
        ),
      );
    });

    const completedCardButton = renderer.root.findByProps({
      accessibilityLabel: 'Completed event: Neighborhood Library Book Fair',
    });
    await ReactTestRenderer.act(async () => {
      completedCardButton.props.onPress();
    });

    expect(navigation.navigate).toHaveBeenCalledWith('EventDetail', {
      eventId: 'evt-past-201',
      returnTo: 'Dashboard',
    });
  });

  it('opens confirmation modal on Cancel participation and cancels in mock state', async () => {
    const mockUserContext: UserContextValue = {
      currentUser: ordinaryVolunteerUser,
      setCurrentUser: jest.fn(),
      isCoordinator: false,
      switchUserPreset: jest.fn(),
    };
    const navigation = createMockNavigation();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithProviders(
          <DashboardScreen navigation={navigation} route={{} as any} />,
          mockUserContext,
        ),
      );
    });

    // Find the cancel participation button for the first upcoming commitment
    const cancelButtons = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .filter(b => b.props.accessibilityLabel === 'Cancel participation');

    expect(cancelButtons.length).toBeGreaterThan(0);

    // Tap Cancel participation
    await ReactTestRenderer.act(async () => {
      cancelButtons[0].props.onPress();
    });

    // Verify modal is open with Demo warning and context
    let str = safeStringify(renderer.toJSON());
    expect(str).toContain('Cancel Participation');
    expect(str).toContain('Demo only — not submitted to server');
    expect(str).toContain('Cancel your participation in this event?');
    expect(str).toContain('Community Garden Revitalization');

    // Confirm cancellation
    const confirmButton = renderer.root.findByProps({
      accessibilityLabel: 'Confirm Cancellation',
    });

    await ReactTestRenderer.act(async () => {
      await confirmButton.props.onPress();
    });

    // Verify feedback banner is shown and commitment count is updated
    str = safeStringify(renderer.toJSON());
    expect(str).toContain('cancelled. Participation cancelled in local mock state');
  });

  it('strictly filters completed activities requiring attendanceStatus=completed', async () => {
    const customSummary = {
      ...volunteerDashboardSummary,
      recentCompletedActivities: [
        {
          id: 'act-completed-1',
          eventId: 'evt-c-1',
          eventTitle: 'Verified Attendance Project',
          roleName: 'Tutor',
          completedAt: '2026-11-01T10:00:00Z',
          attendanceStatus: 'completed' as const,
          verifiedHours: 3.0,
          location: 'Community Hub',
          attendanceVerifiedAt: '2026-11-01T10:30:00Z',
        },
        {
          id: 'act-absent-2',
          eventId: 'evt-c-2',
          eventTitle: 'Unverified No-Show Shift',
          roleName: 'Assistant',
          completedAt: '2026-11-01T10:00:00Z',
          attendanceStatus: 'absent' as any,
          verifiedHours: 0,
          location: 'Community Hub',
          attendanceVerifiedAt: '',
        },
      ],
    };
    defaultDashboardRepository.setSummary(customSummary);
    const mockUserContext: UserContextValue = {
      currentUser: ordinaryVolunteerUser,
      setCurrentUser: jest.fn(),
      isCoordinator: false,
      switchUserPreset: jest.fn(),
    };
    const navigation = createMockNavigation();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithProviders(
          <DashboardScreen
            navigation={navigation}
            route={{} as any}
          />,
          mockUserContext,
        ),
      );
    });

    const str = safeStringify(renderer.toJSON());
    expect(str).toContain('Verified Attendance Project');
    expect(str).not.toContain('Unverified No-Show Shift');
  });

  describe('Cross-Workspace Event Ending & Dashboard Synchronization', () => {
    it('mapDashboardSummary excludes assignments where event_status is completed, ended, or cancelled even if scheduled in the future', () => {
      const futureEnd = new Date(Date.now() + 86400000).toISOString();
      const futureStart = new Date(Date.now() + 3600000).toISOString();

      const assignments: any[] = [
        {
          id: 101,
          event_id: 1,
          event_title: 'Active Event',
          event_status: 'published',
          schedule_start: futureStart,
          schedule_end: futureEnd,
          status: 'confirmed',
        },
        {
          id: 102,
          event_id: 2,
          event_title: 'Completed Event',
          event_status: 'completed',
          schedule_start: futureStart,
          schedule_end: futureEnd,
          status: 'confirmed',
        },
        {
          id: 103,
          event_id: 3,
          event_title: 'Cancelled Event',
          event_status: 'cancelled',
          schedule_start: futureStart,
          schedule_end: futureEnd,
          status: 'confirmed',
        },
        {
          id: 104,
          event_id: 4,
          event_title: 'Ended Event',
          event_status: 'ended',
          schedule_start: futureStart,
          schedule_end: futureEnd,
          status: 'confirmed',
        },
      ];

      const result = mapDashboardSummary(assignments, [], null, new Date());
      expect(result.upcomingCommitmentCount).toBe(1);
      expect(result.upcomingCommitments.length).toBe(1);
      expect(result.upcomingCommitments[0].eventTitle).toBe('Active Event');
    });

    it('MockDashboardRepository removeCommitmentsForEvent removes commitments and updates upcomingCommitmentCount', async () => {
      const repo = new MockDashboardRepository(volunteerDashboardSummary);
      const initial = await repo.getDashboardSummary();
      expect(initial.upcomingCommitmentCount).toBe(2);

      repo.removeCommitmentsForEvent('evt-preview-101');
      const updated = await repo.getDashboardSummary();
      expect(updated.upcomingCommitmentCount).toBe(1);
      expect(updated.upcomingCommitments.some(c => c.eventId === 'evt-preview-101')).toBe(false);
      expect(updated.upcomingCommitments.some(c => c.eventId === 'evt-preview-102')).toBe(true);
    });

    it('transitioning an event to completed in MockCoordinatorRepository cascades to defaultEventRepository, defaultDashboardRepository, and emits AppEvents.EVENT_STATUS_CHANGED', async () => {
      const testEventId = 'evt-coord-001';
      // Ensure event is present in defaultEventRepository
      defaultEventRepository.syncEventStatus(testEventId, 'published');
      defaultDashboardRepository.setSummary({
        ...volunteerDashboardSummary,
        upcomingCommitments: [
          {
            id: 'comm-test-999',
            eventId: testEventId,
            eventTitle: 'Test Event Sync',
            roleName: 'Lead',
            startAt: new Date(Date.now() + 3600000).toISOString(),
            endAt: new Date(Date.now() + 7200000).toISOString(),
            location: 'Downtown Hub',
            status: 'confirmed',
          },
        ],
        upcomingCommitmentCount: 1,
      });

      let emittedPayload: any = null;
      const unsubscribe = appEventBus.on(AppEvents.EVENT_STATUS_CHANGED, payload => {
        emittedPayload = payload;
      });

      try {
        const result = await defaultCoordinatorRepository.transitionEventStatus(
          testEventId,
          'completed',
        );
        expect(result.success).toBe(true);
        expect(result.data?.status).toBe('completed');

        // Check synchronization to defaultEventRepository
        const eventInEventRepo = defaultEventRepository.findEventById(testEventId);
        expect(eventInEventRepo?.status).toBe('completed');

        // Check synchronization to defaultDashboardRepository
        const dashboardData = await defaultDashboardRepository.getDashboardSummary();
        expect(
          dashboardData.upcomingCommitments.some(c => c.eventId === testEventId),
        ).toBe(false);
        expect(dashboardData.upcomingCommitmentCount).toBe(0);

        // Check appEventBus notification
        expect(emittedPayload).toEqual({
          eventId: testEventId,
          status: 'completed',
        });
      } finally {
        unsubscribe();
      }
    });

    it('DashboardScreen re-fetches when focus listener triggers or appEventBus emits EVENT_STATUS_CHANGED', async () => {
      let focusListener: (() => void) | null = null;
      const navigation = {
        ...createMockNavigation(),
        addListener: jest.fn((event: string, cb: () => void) => {
          if (event === 'focus') {
            focusListener = cb;
          }
          return () => {};
        }),
      };

      const spyGetDashboard = jest.spyOn(defaultDashboardRepository, 'getDashboardSummary');
      spyGetDashboard.mockClear();

      const mockUserContext: UserContextValue = {
        currentUser: ordinaryVolunteerUser,
        setCurrentUser: jest.fn(),
        isCoordinator: false,
        switchUserPreset: jest.fn(),
      };

      await ReactTestRenderer.act(async () => {
        ReactTestRenderer.create(
          renderWithProviders(
            <DashboardScreen
              navigation={navigation}
              route={{} as any}
            />,
            mockUserContext,
          ),
        );
      });

      // Called on mount
      expect(spyGetDashboard).toHaveBeenCalledTimes(1);

      // Trigger focus
      await ReactTestRenderer.act(async () => {
        focusListener?.();
      });
      expect(spyGetDashboard).toHaveBeenCalledTimes(2);

      // Trigger appEventBus event_status_changed
      await ReactTestRenderer.act(async () => {
        appEventBus.emit(AppEvents.EVENT_STATUS_CHANGED, {
          eventId: 'evt-test',
          status: 'completed',
        });
      });
      expect(spyGetDashboard).toHaveBeenCalledTimes(3);

      spyGetDashboard.mockRestore();
    });
  });
});
