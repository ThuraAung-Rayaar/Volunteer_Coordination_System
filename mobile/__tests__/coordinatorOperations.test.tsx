/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { UserContext, UserContextValue } from '../src/app/UserContext';
import {
  approvedCoordinatorUser,
  ordinaryVolunteerUser,
} from '../src/data/mock/fixtures/demoUsers';
import {
  mockCoordinatorApplications,
  mockCoordinatorAttendance,
} from '../src/data/mock/fixtures/coordinatorFixtures';
import { MockCoordinatorRepository } from '../src/data/mock/MockCoordinatorRepository';
import {
  ApplicationReviewCard,
  AssignmentRow,
  AttendanceRow,
  CoordinatorApplicationsScreen,
  CoordinatorAssignmentsScreen,
  CoordinatorAttendanceScreen,
} from '../src/features/coordinator';
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
    canGoBack: jest.fn(() => true),
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
  userContext: Partial<UserContextValue> = {},
) {
  const defaultContext: UserContextValue = {
    currentUser: approvedCoordinatorUser,
    setCurrentUser: jest.fn(),
    isCoordinator: true,
    switchUserPreset: jest.fn(),
    ...userContext,
  };

  return (
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <ThemeProvider>
        <UserContext.Provider value={defaultContext}>
          {ui}
        </UserContext.Provider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function safeStringify(obj: unknown): string {
  const seen = new WeakSet();
  return JSON.stringify(obj, (_key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return undefined;
      }
      seen.add(value);
    }
    return value;
  });
}

describe('Privacy Tier Model: T2 Visibility Rules', () => {
  it('renders T2 capabilities ONLY for accepted applicants and hides them for pending applicants', async () => {
    const acceptedApp = mockCoordinatorApplications.find(
      a => a.id === 'app-105' && a.status === 'accepted',
    )!;
    const pendingApp = mockCoordinatorApplications.find(
      a => a.id === 'app-101' && a.status === 'pending',
    )!;

    // Render accepted applicant card
    let acceptedRenderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      acceptedRenderer = ReactTestRenderer.create(
        renderWithProviders(
          <ApplicationReviewCard
            application={acceptedApp}
            isMonitorMode={false}
          />,
        ),
      );
    });
    const acceptedJson = safeStringify(acceptedRenderer.toJSON());

    // Accepted applicant should have T2 section, skills, and capabilities
    expect(acceptedJson).toContain('T2 Volunteer Capabilities & Profile');
    expect(acceptedJson).toContain('first_aid');
    expect(acceptedJson).toContain('Heavy Lifting OK');
    expect(acceptedJson).toContain('VERIFIED');

    // Render pending applicant card
    let pendingRenderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      pendingRenderer = ReactTestRenderer.create(
        renderWithProviders(
          <ApplicationReviewCard
            application={pendingApp}
            isMonitorMode={false}
          />,
        ),
      );
    });
    const pendingJson = safeStringify(pendingRenderer.toJSON());

    // Pending applicant should NOT have T2 capabilities
    expect(pendingJson).not.toContain('T2 Volunteer Capabilities & Profile');
    expect(pendingJson).not.toContain('Heavy Lifting OK');
    expect(pendingJson).toContain('T2 capabilities hidden per BR-PRIV-T2');
    // But should have minimal identity (T1)
    expect(pendingJson).toContain(pendingApp.applicantName);
    expect(pendingJson).toContain('Pending Review');
  });

  it('hides T2 capabilities for waitlisted and rejected applicants', async () => {
    const waitlistedApp = mockCoordinatorApplications.find(
      a => a.status === 'waitlisted',
    )!;
    const rejectedApp = mockCoordinatorApplications.find(
      a => a.status === 'rejected',
    )!;

    let waitlistedRenderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      waitlistedRenderer = ReactTestRenderer.create(
        renderWithProviders(
          <ApplicationReviewCard
            application={waitlistedApp}
            isMonitorMode={false}
          />,
        ),
      );
    });
    const waitlistedJson = safeStringify(waitlistedRenderer.toJSON());
    expect(waitlistedJson).not.toContain('T2 Volunteer Capabilities & Profile');
    expect(waitlistedJson).toContain('T2 capabilities hidden per BR-PRIV-T2');

    let rejectedRenderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      rejectedRenderer = ReactTestRenderer.create(
        renderWithProviders(
          <ApplicationReviewCard
            application={rejectedApp}
            isMonitorMode={false}
          />,
        ),
      );
    });
    const rejectedJson = safeStringify(rejectedRenderer.toJSON());
    expect(rejectedJson).not.toContain('T2 Volunteer Capabilities & Profile');
    expect(rejectedJson).toContain('T2 capabilities hidden per BR-PRIV-T2');
  });
});

describe('Owner-as-Monitor Read-Only Constraints', () => {
  it('disables application decision actions in monitor mode', async () => {
    const pendingApp = mockCoordinatorApplications.find(
      a => a.id === 'app-mon-001',
    )!;

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithProviders(
          <ApplicationReviewCard
            application={pendingApp}
            isMonitorMode={true}
          />,
        ),
      );
    });
    const json = safeStringify(renderer.toJSON());

    // Should render monitor notice
    expect(json).toContain('Review actions disabled in Read-Only Monitor Mode');
  });

  it('disables assignment actions in monitor mode', async () => {
    const unassignedApp = mockCoordinatorApplications.find(
      a => a.id === 'app-mon-004',
    )!;

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithProviders(
          <AssignmentRow
            unassignedApplication={unassignedApp}
            isMonitorMode={true}
          />,
        ),
      );
    });
    const json = safeStringify(renderer.toJSON());

    expect(json).toContain('Assignment disabled in monitor mode');
  });

  it('disables attendance geo confirmation actions in monitor mode', async () => {
    const pendingGeoItem = mockCoordinatorAttendance.find(
      a => a.id === 'att-mon-101',
    )!;

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithProviders(
          <AttendanceRow
            attendance={pendingGeoItem}
            isMonitorMode={true}
          />,
        ),
      );
    });
    const json = safeStringify(renderer.toJSON());

    expect(json).toContain('Geo confirmation disabled in monitor mode');
  });

  it('enforces owner-as-monitor write lock in repository contract methods', async () => {
    const repo = new MockCoordinatorRepository();

    // 1. Application decision on monitor event (evt-coord-004)
    const appResult = await repo.updateApplicationStatus(
      'app-mon-001',
      'accepted',
    );
    expect(appResult.success).toBe(false);
    expect(appResult.message).toContain('read-only monitor mode');

    // 2. Auto-assignment on monitor event
    const autoResult = await repo.runAutoAssignment('evt-coord-004');
    expect(autoResult.success).toBe(false);
    expect(autoResult.message).toContain('read-only monitor mode');

    // 3. Manual assignment on monitor event
    const manualResult = await repo.assignVolunteerManually(
      'app-mon-004',
      'post-c4-1',
    );
    expect(manualResult.success).toBe(false);
    expect(manualResult.message).toContain('read-only monitor mode');

    // 4. Cancel assignment on monitor event
    const cancelResult = await repo.cancelAssignment('asg-mon-101');
    expect(cancelResult.success).toBe(false);
    expect(cancelResult.message).toContain('read-only monitor mode');

    // 5. Confirm geo attendance on monitor event
    const confirmResult = await repo.confirmGeoAttendance('att-mon-101');
    expect(confirmResult.success).toBe(false);
    expect(confirmResult.message).toContain('read-only monitor mode');

    // 6. Reject geo attendance on monitor event
    const rejectResult = await repo.rejectGeoAttendance('att-mon-101');
    expect(rejectResult.success).toBe(false);
    expect(rejectResult.message).toContain('read-only monitor mode');

    // 7. Manual check-in on monitor event
    const checkinResult = await repo.manualCheckIn('att-mon-101');
    expect(checkinResult.success).toBe(false);
    expect(checkinResult.message).toContain('read-only monitor mode');
  });
});

describe('Coordinator Operational Screens Flow', () => {
  it('renders CoordinatorApplicationsScreen with filters and event context header', async () => {
    const nav = createMockNavigation();
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithProviders(
          <CoordinatorApplicationsScreen
            navigation={nav}
            route={{ key: 'apps', name: 'CoordinatorApplications', params: { eventId: 'evt-coord-001' } }}
          />,
        ),
      );
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('Volunteer Applications');
    expect(json).toContain('Hlaing Riverbank Conservation');
    expect(json).toContain('All');
    expect(json).toContain('Pending');
    expect(json).toContain('Accepted');
    expect(json).toContain('Thura Aung');
  });

  it('renders CoordinatorAssignmentsScreen separating unassigned and assigned volunteers', async () => {
    const nav = createMockNavigation();
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithProviders(
          <CoordinatorAssignmentsScreen
            navigation={nav}
            route={{ key: 'asg', name: 'CoordinatorAssignments', params: { eventId: 'evt-coord-001' } }}
          />,
        ),
      );
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('Shift Assignments');
    expect(json).toContain('Auto-Assignment Engine');
    expect(json).toContain('Run Auto-Assignment (Demo Preview)');
    expect(json).toContain('Unassigned Accepted Volunteers');
    expect(json).toContain('Current Shift Assignments');
    expect(json).toContain('Nilar Win');
    expect(json).toContain('Group Leader');
  });

  it('renders CoordinatorAttendanceScreen with pending geo confirmation queue and privacy disclosure', async () => {
    const nav = createMockNavigation();
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithProviders(
          <CoordinatorAttendanceScreen
            navigation={nav}
            route={{ key: 'att', name: 'CoordinatorAttendance', params: { eventId: 'evt-coord-001' } }}
          />,
        ),
      );
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('Attendance & Check-In');
    expect(json).toContain('Pending Geo Confirmation Queue');
    expect(json).toContain('Pending Geo Check-In Confirmation');
    expect(json).toContain('Confirm Check-In');
    expect(json).toContain('Reject');
    // Privacy disclaimer per BR-PRIV-T4
    expect(json).toContain('Raw GPS coordinates and device telemetry are hidden');
    expect(json).toContain('Attendance Roster');
  });

  it('blocks unapproved coordinator from viewing operational screens', async () => {
    const nav = createMockNavigation();
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithProviders(
          <CoordinatorApplicationsScreen navigation={nav} />,
          {
            currentUser: ordinaryVolunteerUser,
            isCoordinator: false,
          },
        ),
      );
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('Coordinator Authority Required');
    expect(json).toContain('The management workspace is restricted');
  });
});
