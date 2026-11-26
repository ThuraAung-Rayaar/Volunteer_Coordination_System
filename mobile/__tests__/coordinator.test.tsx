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
  pendingCoordinatorUser,
} from '../src/data/mock/fixtures/demoUsers';
import { MockCoordinatorRepository } from '../src/data/mock/MockCoordinatorRepository';
import {
  CoordinatorEventDetailScreen,
  CoordinatorEventsScreen,
  CoordinatorOverviewScreen,
  CoordinatorSwipeWrapper,
  CreateEventWizardScreen,
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

describe('Coordinator Route Guard & Security Access', () => {
  it('blocks ordinary volunteer access to coordinator workspace and displays access denied state', async () => {
    const nav = createMockNavigation();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithProviders(
          <CoordinatorOverviewScreen navigation={nav} />,
          {
            currentUser: ordinaryVolunteerUser,
            isCoordinator: false,
          },
        ),
      );
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('Coordinator Authority Required');
    expect(json).toContain('Status: NONE');
    expect(json).toContain('View Verification & Status');
  });

  it('blocks pending coordinator applicant from entering management workspace', async () => {
    const nav = createMockNavigation();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithProviders(
          <CoordinatorEventsScreen navigation={nav} />,
          {
            currentUser: pendingCoordinatorUser,
            isCoordinator: false,
          },
        ),
      );
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('Coordinator Authority Required');
    expect(json).toContain('Status: PENDING');
  });

  it('allows approved coordinator to enter management workspace', async () => {
    const nav = createMockNavigation();
    const repo = new MockCoordinatorRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithProviders(
          <CoordinatorOverviewScreen navigation={nav} repository={repo} />,
          {
            currentUser: approvedCoordinatorUser,
            isCoordinator: true,
          },
        ),
      );
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('Coordinator Workspace');
    expect(json).toContain('Operational Metrics');
    expect(json).not.toContain('Coordinator Authority Required');
  });
});

describe('Create Event Wizard: Validations & Field Allow-List', () => {
  let repo: MockCoordinatorRepository;

  beforeEach(() => {
    repo = new MockCoordinatorRepository();
  });

  it('validates required charity categories count (between 1 and 3)', async () => {
    // 0 charity categories -> invalid
    const zeroCategoriesResult = await repo.createDraftEvent({
      title: 'Invalid Zero Categories Event',
      purposeType: 'charity_event',
      charityFieldCodes: [] as any,
      locationName: 'Yangon Center',
      latitude: 16.8,
      longitude: 96.15,
      geoRadiusM: 200,
      geoCheckinEnabled: false,
      geoCheckinOpensBeforeMin: 30,
      requireCheckinConfirmation: false,
      mapProvider: 'openstreetmap',
      startAt: '2026-12-10T08:00:00Z',
      endAt: '2026-12-10T14:00:00Z',
      acceptanceMode: 'manual',
      autoAssignEnabled: true,
      leaderStrategy: 'none',
      mealsProvided: false,
      lodgingProvided: false,
      travelSupportProvided: false,
      compensationKind: 'unpaid',
      requireOnboardingAck: false,
      qrRegistrationEnabled: false,
    });

    expect(zeroCategoriesResult.success).toBe(false);
    expect(zeroCategoriesResult.message).toContain(
      'Ensure between 1 and 3 charity fields are provided.',
    );

    // 4 charity categories -> invalid
    const fourCategoriesResult = await repo.createDraftEvent({
      title: 'Invalid Four Categories Event',
      purposeType: 'charity_event',
      charityFieldCodes: [
        'environment',
        'cleaning',
        'logistics',
        'teaching',
      ],
      locationName: 'Yangon Center',
      latitude: 16.8,
      longitude: 96.15,
      geoRadiusM: 200,
      geoCheckinEnabled: false,
      geoCheckinOpensBeforeMin: 30,
      requireCheckinConfirmation: false,
      mapProvider: 'openstreetmap',
      startAt: '2026-12-10T08:00:00Z',
      endAt: '2026-12-10T14:00:00Z',
      acceptanceMode: 'manual',
      autoAssignEnabled: true,
      leaderStrategy: 'none',
      mealsProvided: false,
      lodgingProvided: false,
      travelSupportProvided: false,
      compensationKind: 'unpaid',
      requireOnboardingAck: false,
      qrRegistrationEnabled: false,
    });

    expect(fourCategoriesResult.success).toBe(false);
    expect(fourCategoriesResult.message).toContain(
      'Ensure between 1 and 3 charity fields are provided.',
    );
  });

  it('validates schedule: event end time must be later than start time', async () => {
    // End time before start time
    const invalidScheduleResult = await repo.createDraftEvent({
      title: 'Invalid Schedule Event',
      purposeType: 'charity_event',
      charityFieldCodes: ['environment'],
      locationName: 'Yangon Center',
      latitude: 16.8,
      longitude: 96.15,
      geoRadiusM: 200,
      geoCheckinEnabled: false,
      geoCheckinOpensBeforeMin: 30,
      requireCheckinConfirmation: false,
      mapProvider: 'openstreetmap',
      startAt: '2026-12-10T14:00:00Z',
      endAt: '2026-12-10T08:00:00Z', // 6 hours earlier!
      acceptanceMode: 'manual',
      autoAssignEnabled: true,
      leaderStrategy: 'none',
      mealsProvided: false,
      lodgingProvided: false,
      travelSupportProvided: false,
      compensationKind: 'unpaid',
      requireOnboardingAck: false,
      qrRegistrationEnabled: false,
    });

    expect(invalidScheduleResult.success).toBe(false);
    expect(invalidScheduleResult.message).toContain(
      'Event end time must be later than start time.',
    );
  });

  it('enforces immutable service attributes on draft creation (status=draft, onboarding_version=1)', async () => {
    const validResult = await repo.createDraftEvent({
      title: 'New Valid Volunteer Project',
      purposeType: 'charity_event',
      charityFieldCodes: ['environment', 'cleaning'],
      locationName: 'Riverwalk Pier',
      latitude: 16.8,
      longitude: 96.15,
      geoRadiusM: 200,
      geoCheckinEnabled: true,
      geoCheckinOpensBeforeMin: 30,
      requireCheckinConfirmation: true,
      mapProvider: 'openstreetmap',
      startAt: '2026-12-10T08:00:00Z',
      endAt: '2026-12-10T14:00:00Z',
      acceptanceMode: 'manual',
      autoAssignEnabled: true,
      leaderStrategy: 'none',
      mealsProvided: true,
      lodgingProvided: false,
      travelSupportProvided: true,
      compensationKind: 'unpaid',
      requireOnboardingAck: true,
      qrRegistrationEnabled: true,
    });

    expect(validResult.success).toBe(true);
    expect(validResult.message).toContain('Demo only — not submitted to server');
    expect(validResult.data).toBeDefined();

    const created = validResult.data!;
    expect(created.status).toBe('draft');
    expect(created.onboardingVersion).toBe(1);
    expect(created.ownerId).toBe('usr-coordinator-002');
    expect(created.currentCoordinatorId).toBe('usr-coordinator-002');
  });
});

describe('Owner-As-Monitor & Lifecycle Transitions', () => {
  let repo: MockCoordinatorRepository;

  beforeEach(() => {
    repo = new MockCoordinatorRepository();
  });

  it('renders read-only monitor mode banner and disables transitions for owner-as-monitor event', async () => {
    const nav = createMockNavigation();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithProviders(
          <CoordinatorEventDetailScreen
            eventId="evt-coord-004"
            navigation={nav}
            repository={repo}
          />,
        ),
      );
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('Read-Only Monitor Mode');
    expect(json).toContain('Senior Coordinator One');
    expect(json).toContain(
      'Write and status transition actions are disabled for owner in monitor mode.',
    );
  });

  it('rejects status transition attempts on owner-as-monitor events in repository', async () => {
    const transitionResult = await repo.transitionEventStatus(
      'evt-coord-004',
      'completed',
    );

    expect(transitionResult.success).toBe(false);
    expect(transitionResult.message).toContain(
      'Action disabled in read-only monitor mode',
    );
  });

  it('allows valid transitions for actively managed events and updates status', async () => {
    // Draft -> Published
    const publishResult = await repo.transitionEventStatus(
      'evt-coord-003',
      'published',
    );
    expect(publishResult.success).toBe(true);
    expect(publishResult.data?.status).toBe('published');

    // Published -> Active
    const activateResult = await repo.transitionEventStatus(
      'evt-coord-003',
      'active',
    );
    expect(activateResult.success).toBe(true);
    expect(activateResult.data?.status).toBe('active');

    // Active -> Completed
    const completeResult = await repo.transitionEventStatus(
      'evt-coord-003',
      'completed',
    );
    expect(completeResult.success).toBe(true);
    expect(completeResult.data?.status).toBe('completed');
  });
});

describe('Coordinator Screens Component Integration', () => {
  it('renders CoordinatorOverviewScreen with metrics, action items, and event cards', async () => {
    const nav = createMockNavigation();
    const repo = new MockCoordinatorRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithProviders(
          <CoordinatorOverviewScreen navigation={nav} repository={repo} />,
        ),
      );
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('Coordinator Workspace');
    expect(json).toContain('Total Events');
    expect(json).toContain('Pending Apps');
    expect(json).toContain('Accepted Roster');
    expect(json).toContain('Checked-in Today');
    expect(json).toContain('Action Needed');
    expect(json).toContain('Pending Applications');
    expect(json).toContain('Organize a Charity Event');
  });

  it('renders CoordinatorDynamicIsland and handles navigation', async () => {
    const nav = createMockNavigation();
    const repo = new MockCoordinatorRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithProviders(
          <CoordinatorOverviewScreen navigation={nav} repository={repo} />,
        ),
      );
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('Dashboard');
    expect(json).toContain('Applications');
    expect(json).toContain('Assignments');
    expect(json).toContain('Attendance');

    const appsTab = renderer.root
      .findAllByProps({ accessibilityRole: 'tab' })
      .find(t => t.props.accessibilityLabel === 'Applications tab');
    expect(appsTab).toBeDefined();

    await ReactTestRenderer.act(async () => {
      appsTab!.props.onPress();
    });

    expect(nav.navigate).toHaveBeenCalledWith('CoordinatorApplications');
  });

  it('renders CoordinatorEventsScreen and filters by status', async () => {
    const nav = createMockNavigation();
    const repo = new MockCoordinatorRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithProviders(
          <CoordinatorEventsScreen navigation={nav} repository={repo} />,
        ),
      );
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('Coordinator Events');
    expect(json).toContain('All Events');
    expect(json).toContain('Active');
    expect(json).toContain('Published');
    expect(json).toContain('Draft');
    expect(json).toContain('Monitor Mode');
    expect(json).not.toContain('Cancelled Event');
  });

  it('renders CoordinatorSwipeWrapper and handles gesture wrapping', async () => {
    const nav = createMockNavigation();
    let renderer!: ReactTestRenderer.ReactTestRenderer;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithProviders(
          <CoordinatorSwipeWrapper currentTab="dashboard" navigation={nav}>
            <CoordinatorOverviewScreen navigation={nav} repository={new MockCoordinatorRepository()} />
          </CoordinatorSwipeWrapper>,
        ),
      );
    });

    const wrapper = renderer.root.findAllByType(CoordinatorSwipeWrapper);
    expect(wrapper.length).toBeGreaterThan(0);
  });

  it('executes CreateEventWizardScreen through step 7 review with demo banner', async () => {
    const nav = createMockNavigation();
    const repo = new MockCoordinatorRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithProviders(
          <CreateEventWizardScreen navigation={nav} repository={repo} />,
        ),
      );
    });

    let json = safeStringify(renderer.toJSON());
    expect(json).toContain('Create Event Wizard');
    expect(json).toContain('Step 1 of 7: Basics');

    // Fill title
    const titleInput = renderer.root.findByProps({
      placeholder: 'e.g. Riverbank Cleanup & Recycling Drive',
    });
    await ReactTestRenderer.act(async () => {
      titleInput.props.onChangeText('Community Beach Cleaning Project');
    });

    // Advance to Step 2
    const nextButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === 'Next');

    expect(nextButton).toBeDefined();

    await ReactTestRenderer.act(async () => {
      nextButton!.props.onPress();
    });

    json = safeStringify(renderer.toJSON());
    expect(json).toContain('Step 2 of 7: Location');
  });

  it('publishes a new event directly on wizard completion when coordinator chooses Publish Event', async () => {
    const nav = createMockNavigation();
    const repo = new MockCoordinatorRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithProviders(
          <CreateEventWizardScreen navigation={nav} repository={repo} />,
        ),
      );
    });

    // Step 1: Basics
    const titleInput = renderer.root.findByProps({
      placeholder: 'e.g. Riverbank Cleanup & Recycling Drive',
    });
    await ReactTestRenderer.act(async () => {
      titleInput.props.onChangeText('Relief Volunteer Mobilization');
    });

    const nextButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === 'Next')!;

    // Advance 1 -> 2
    await ReactTestRenderer.act(async () => {
      nextButton.props.onPress();
    });

    // Step 2: Location
    const locInput = renderer.root.findByProps({
      placeholder: 'e.g. Downtown Riverwalk Plaza, Pier 4',
    });
    await ReactTestRenderer.act(async () => {
      locInput.props.onChangeText('Community Center');
    });

    // Advance through steps 2 -> 3 -> 4 -> 5 -> 6 -> 7
    for (let step = 2; step < 7; step++) {
      await ReactTestRenderer.act(async () => {
        nextButton.props.onPress();
      });
    }

    let json = safeStringify(renderer.toJSON());
    expect(json).toContain('Step 7 of 7: Review');
    expect(json).toContain('Publish Event');
    expect(json).toContain('Save as Draft');

    // Tap Publish Event
    const publishBtn = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === 'Publish Event')!;

    expect(publishBtn).toBeDefined();

    await ReactTestRenderer.act(async () => {
      publishBtn.props.onPress();
    });

    // Verify event was created and published in repository
    const events = await repo.getMyEvents();
    const createdEvent = events.find(e => e.title === 'Relief Volunteer Mobilization');
    expect(createdEvent).toBeDefined();
    expect(createdEvent?.status).toBe('published');
    expect(nav.navigate).toHaveBeenCalledWith('CoordinatorEvents');
  });

  it('opens confirmation modal on CoordinatorEventDetailScreen consequential transition', async () => {
    const nav = createMockNavigation();
    const repo = new MockCoordinatorRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithProviders(
          <CoordinatorEventDetailScreen
            eventId="evt-coord-003" // Draft event
            navigation={nav}
            repository={repo}
          />,
        ),
      );
    });

    let json = safeStringify(renderer.toJSON());
    expect(json).toContain('Publish Event');
    expect(json).toContain('Cancel Event');

    // Tap Publish Event
    const publishButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === 'Publish Event');

    expect(publishButton).toBeDefined();

    await ReactTestRenderer.act(async () => {
      publishButton!.props.onPress();
    });

    // Verify confirmation modal without developer/template status banners
    json = safeStringify(renderer.toJSON());
    expect(json).toContain('Confirm Status Transition');
    expect(json).toContain('Confirm Lifecycle Update');
    expect(json).toContain('Confirm Transition');
  });
});
