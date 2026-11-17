/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { mockEventsFixture } from '../src/data/mock/fixtures/eventFixtures';
import { MockEventRepository } from '../src/data/mock/MockEventRepository';
import {
  CharityCategoryChips,
  EventCard,
  EventFilterSheet,
  EventPostCard,
} from '../src/features/events/components';
import { EventDetailScreen } from '../src/features/events/screens/EventDetailScreen';
import {
  EventDiscoveryScreen,
  resetDiscoveryCache,
} from '../src/features/events/screens/EventDiscoveryScreen';
import {
  MyApplicationsScreen,
  resetApplicationsCache,
} from '../src/features/events/screens/MyApplicationsScreen';
import {
  MyAssignmentsScreen,
  resetAssignmentsCache,
} from '../src/features/events/screens/MyAssignmentsScreen';
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

describe('Event Repository & Business Constraints', () => {
  let repo: MockEventRepository;

  beforeEach(() => {
    repo = new MockEventRepository();
  });

  it('exposes only published and active events in public discovery fixtures', async () => {
    const events = await repo.getEvents();
    expect(events.length).toBeGreaterThan(0);

    for (const evt of events) {
      expect(['published', 'active']).toContain(evt.status);
    }
  });

  it('filters events by search query matching title, description, and location', async () => {
    // Title match
    const titleResults = await repo.getEvents({ query: 'Riverbank' });
    expect(titleResults.length).toBeGreaterThanOrEqual(1);
    expect(titleResults[0].title).toContain('Riverbank');

    // Location match
    const locationResults = await repo.getEvents({ query: 'Inya Relief' });
    expect(locationResults.length).toBeGreaterThanOrEqual(1);
    expect(locationResults[0].locationName).toContain('Inya Relief');

    // Case-insensitive match
    const caseResults = await repo.getEvents({ query: 'clean' });
    expect(caseResults.length).toBeGreaterThanOrEqual(1);
  });

  it('filters events by charity category codes from the official taxonomy', async () => {
    const envEvents = await repo.getEvents({
      charityFieldCodes: ['environment'],
    });
    expect(envEvents.length).toBeGreaterThanOrEqual(1);
    expect(envEvents[0].charityFields).toContain('environment');

    const foodEvents = await repo.getEvents({
      charityFieldCodes: ['food_distribution'],
    });
    expect(foodEvents.length).toBeGreaterThanOrEqual(1);
    expect(foodEvents[0].charityFields).toContain('food_distribution');
  });

  it('filters events by status (published vs active)', async () => {
    const publishedOnly = await repo.getEvents({ statuses: ['published'] });
    expect(publishedOnly.length).toBeGreaterThan(0);
    for (const evt of publishedOnly) {
      expect(evt.status).toBe('published');
    }

    const activeOnly = await repo.getEvents({ statuses: ['active'] });
    expect(activeOnly.length).toBeGreaterThan(0);
    for (const evt of activeOnly) {
      expect(evt.status).toBe('active');
    }
  });

  it('filters events by volunteer support flags (meals, lodging, travel)', async () => {
    const lodgingEvents = await repo.getEvents({ lodgingProvided: true });
    expect(lodgingEvents.length).toBeGreaterThan(0);
    for (const evt of lodgingEvents) {
      expect(evt.lodgingProvided).toBe(true);
    }

    const travelEvents = await repo.getEvents({ travelSupportProvided: true });
    expect(travelEvents.length).toBeGreaterThan(0);
    for (const evt of travelEvents) {
      expect(evt.travelSupportProvided).toBe(true);
    }
  });

  it('returns empty array when search query matches no events', async () => {
    const noResults = await repo.getEvents({ query: 'NonExistentXYZ999' });
    expect(noResults).toHaveLength(0);
  });

  it('fetches full event detail by ID including posts and current user application', async () => {
    const event = await repo.getEventById('evt-101');
    expect(event).not.toBeNull();
    expect(event?.id).toBe('evt-101');
    expect(event?.posts.length).toBeGreaterThan(0);
    expect(event?.userApplication).toBeDefined();
    expect(event?.userApplication?.status).toBe('pending');
  });

  it('returns null for non-existent event ID', async () => {
    const event = await repo.getEventById('unknown-id');
    expect(event).toBeNull();
  });

  it('applies to open post with Demo-only message and updates remaining capacity', async () => {
    const beforeEvent = await repo.getEventById('evt-102');
    const targetPost = beforeEvent?.posts.find(p => p.status === 'open');
    expect(targetPost).toBeDefined();

    const result = await repo.applyToPost(
      'evt-102',
      targetPost!.id,
      'Demo volunteer application note',
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain('Demo only — not submitted to server');
    expect(result.application).toBeDefined();
    expect(result.application?.status).toBe('pending');
    expect(result.application?.volunteerNote).toBe(
      'Demo volunteer application note',
    );

    // Verify event detail has updated application
    const afterEvent = await repo.getEventById('evt-102');
    expect(afterEvent?.userApplication?.postId).toBe(targetPost!.id);
  });

  it('prevents duplicate application to the same post', async () => {
    const firstResult = await repo.applyToPost(
      'evt-105',
      'post-105-1',
      'First apply',
    );
    expect(firstResult.success).toBe(true);

    const duplicateResult = await repo.applyToPost(
      'evt-105',
      'post-105-1',
      'Second apply',
    );
    expect(duplicateResult.success).toBe(false);
    expect(duplicateResult.message).toContain('already applied');
  });

  it('prevents apply to a closed post', async () => {
    const result = await repo.applyToPost('evt-104', 'post-104-2');
    expect(result.success).toBe(false);
    expect(result.message).toContain('closed');
  });
});

describe('Event Feature Components', () => {
  it('renders EventCard with title, location, category chips, and triggers onPress', async () => {
    const onPressMock = jest.fn();
    const event = mockEventsFixture[0];

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(<EventCard event={event} onPress={onPressMock} />),
      );
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain(event.title);
    expect(json).toContain(event.locationName);
    expect(json).toContain('spots remaining');

    const pressable = renderer.root.findByProps({
      accessibilityRole: 'button',
    });
    await ReactTestRenderer.act(async () => {
      pressable.props.onPress();
    });
    expect(onPressMock).toHaveBeenCalledWith(event.id);
  });

  it('renders EventPostCard with physical level, capacity, required skills', async () => {
    const onApplyMock = jest.fn();
    const post = mockEventsFixture[0].posts[0];

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <EventPostCard
            post={post}
            isApplied={false}
            onApplyPress={onApplyMock}
          />,
        ),
      );
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain(post.title);
    expect(json).toContain(post.physicalLevel.toUpperCase());
    expect(json).toContain('filled');
    expect(json).toContain('Apply for Role');
  });

  it('disables apply in EventPostCard when already applied or closed', async () => {
    const onApplyMock = jest.fn();
    const post = mockEventsFixture[0].posts[0];

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <EventPostCard
            post={post}
            isApplied={true}
            onApplyPress={onApplyMock}
          />,
        ),
      );
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('Already Applied');
  });

  it('renders CharityCategoryChips and calls onSelectCategory', async () => {
    const onSelectMock = jest.fn();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <CharityCategoryChips
            selectedCategory="all"
            onSelectCategory={onSelectMock}
          />,
        ),
      );
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('All Categories');
    expect(json).toContain('Teaching');
    expect(json).toContain('Environment');
    expect(json).toContain('Food Distribution');
  });

  it('renders EventFilterSheet with status, support, charity categories, and action buttons', async () => {
    const onApplyMock = jest.fn();
    const onCloseMock = jest.fn();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <EventFilterSheet
            visible={true}
            filters={{}}
            onApply={onApplyMock}
            onClose={onCloseMock}
          />,
        ),
      );
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('Filter Events');
    expect(json).toContain('EVENT STATUS');
    expect(json).toContain('VOLUNTEER SUPPORT');
    expect(json).toContain('CHARITY CATEGORIES');
    expect(json).toContain('Clear all');
    expect(json).toContain('Apply filters');
  });

  it('selects and deselects charity categories and applies filters', async () => {
    const onApplyMock = jest.fn();
    const onCloseMock = jest.fn();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <EventFilterSheet
            visible={true}
            filters={{}}
            onApply={onApplyMock}
            onClose={onCloseMock}
          />,
        ),
      );
    });

    // Find Environment category chip checkbox
    const checkboxes = renderer.root.findAllByProps({ accessibilityRole: 'checkbox' });
    const envChip = checkboxes.find(b => b.props.accessibilityLabel === 'Environment');
    expect(envChip).toBeDefined();

    // Select Environment
    await ReactTestRenderer.act(async () => {
      envChip!.props.onPress();
    });

    // Tap Apply filters
    const buttons = renderer.root.findAllByProps({ accessibilityRole: 'button' });
    const applyButton = buttons.find(b => b.props.accessibilityLabel === 'Apply filters');
    expect(applyButton).toBeDefined();

    await ReactTestRenderer.act(async () => {
      applyButton!.props.onPress();
    });

    expect(onApplyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        charityFieldCodes: ['environment'],
      }),
    );
    expect(onCloseMock).toHaveBeenCalled();
  });
});

describe('EventDiscoveryScreen', () => {
  beforeEach(() => {
    resetDiscoveryCache();
  });

  it('renders discovery screen with horizontal search row and no large chip row', async () => {
    const nav = createMockNavigation();
    const repo = new MockEventRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <EventDiscoveryScreen navigation={nav} repository={repo} />,
        ),
      );
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('Discover Events');
    expect(json).toContain('Search by title');
    // Large chip row must be removed from the discovery page
    expect(json).not.toContain('All Categories');
    expect(json).toContain('Riverbank Environmental Cleanup');

    // Filter button exists on the search row
    const filterBtn = renderer.root.findByProps({
      accessibilityLabel: 'Filter events. 0 active filters.',
    });
    expect(filterBtn).toBeDefined();
  });

  it('navigates to EventDetail with returnTo=Events when an event card is tapped', async () => {
    const nav = createMockNavigation();
    const repo = new MockEventRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <EventDiscoveryScreen navigation={nav} repository={repo} />,
        ),
      );
    });

    // Find the first event card button
    const buttons = renderer.root.findAllByProps({ accessibilityRole: 'button' });
    const eventCardButton = buttons.find(b =>
      b.props.accessibilityLabel?.startsWith('Event:'),
    );

    expect(eventCardButton).toBeDefined();
    await ReactTestRenderer.act(async () => {
      eventCardButton!.props.onPress();
    });

    expect(nav.navigate).toHaveBeenCalledWith('EventDetail', {
      eventId: 'evt-101',
      returnTo: 'Events',
    });
  });

  it('preserves query and filter state across navigation and remount', async () => {
    const nav = createMockNavigation();
    const repo = new MockEventRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <EventDiscoveryScreen navigation={nav} repository={repo} />,
        ),
      );
    });

    // Set search query
    const searchInput = renderer.root.findByProps({
      placeholder: 'Search by title, location, or landmark...',
    });
    await ReactTestRenderer.act(async () => {
      searchInput.props.onChangeText('Riverbank');
    });

    // Open filter sheet and apply filter
    const filterSheet = renderer.root.findByType(EventFilterSheet);
    await ReactTestRenderer.act(async () => {
      filterSheet.props.onApply({
        charityFieldCodes: ['environment'],
      });
    });

    // Verify filter badge is rendered with count
    let json = safeStringify(renderer.toJSON());
    expect(json).toContain('Showing filtered results');

    // Simulate unmounting and returning from EventDetail
    await ReactTestRenderer.act(async () => {
      renderer.unmount();
    });

    // Remount screen
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <EventDiscoveryScreen navigation={nav} repository={repo} />,
        ),
      );
    });

    json = safeStringify(renderer.toJSON());
    // Preserved search text and active filter state
    const remountedInput = renderer.root.findByProps({
      placeholder: 'Search by title, location, or landmark...',
    });
    expect(remountedInput.props.value).toBe('Riverbank');
    expect(json).toContain('Showing filtered results');
    expect(json).toContain('Riverbank Environmental Cleanup');
  });

  it('shows empty state when search matches no events and allows resetting', async () => {
    const nav = createMockNavigation();
    const repo = new MockEventRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <ThemeProvider>
            <EventDiscoveryScreen navigation={nav} repository={repo} />
          </ThemeProvider>
        </SafeAreaProvider>,
      );
    });

    // Search for non-existent item
    const searchInput = renderer.root.findByProps({
      placeholder: 'Search by title, location, or landmark...',
    });

    await ReactTestRenderer.act(async () => {
      searchInput.props.onChangeText('XYZNonExistentPattern999');
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('No events found');
    expect(json).toContain('Reset Filters');
  });
});

describe('EventDetailScreen', () => {
  it('renders event details, location, map placeholder, and posts', async () => {
    const nav = createMockNavigation();
    const repo = new MockEventRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <EventDetailScreen
            eventId="evt-101"
            navigation={nav}
            repository={repo}
          />,
        ),
      );
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('Riverbank Environmental Cleanup');
    expect(json).toContain('Downtown Riverwalk Plaza');
    expect(json).toContain('OpenStreetMap Geographic Preview');
    expect(json).toContain('Interactive map SDK not connected in UI preview');
    expect(json).toContain('Volunteer Support & Amenities');
    expect(json).toContain('Your Application Status');
    expect(json).toContain('Available Roles & Posts');
  });

  it('displays user application status panel for demo user', async () => {
    const nav = createMockNavigation();
    const repo = new MockEventRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <EventDetailScreen
            eventId="evt-101"
            navigation={nav}
            repository={repo}
          />,
        ),
      );
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('PENDING');
    expect(json).toContain('Recycling & Waste Data Auditor');
  });

  it('opens demo apply confirmation modal and confirms application locally', async () => {
    const nav = createMockNavigation();
    const repo = new MockEventRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <EventDetailScreen
            eventId="evt-102"
            navigation={nav}
            repository={repo}
          />,
        ),
      );
    });

    // Find the apply button for the open post on evt-102
    const applyButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === 'Apply for Role');

    expect(applyButton).toBeDefined();

    await ReactTestRenderer.act(async () => {
      applyButton!.props.onPress();
    });

    // Verify modal is open with Demo-only warning
    let json = safeStringify(renderer.toJSON());
    expect(json).toContain('Demo only — not submitted to server');
    expect(json).toContain('Confirm Application');

    // Confirm application
    const confirmButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === 'Confirm Application');

    expect(confirmButton).toBeDefined();

    await ReactTestRenderer.act(async () => {
      await confirmButton!.props.onPress();
    });

    // Verify confirmation banner is shown
    json = safeStringify(renderer.toJSON());
    expect(json).toContain('Application recorded locally');
  });

  it('navigates back to Events discovery when returnTo=Events on back press', async () => {
    const nav = createMockNavigation();
    const repo = new MockEventRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <EventDetailScreen
            eventId="evt-101"
            navigation={nav}
            route={{ params: { eventId: 'evt-101', returnTo: 'Events' } } as any}
            repository={repo}
          />,
        ),
      );
    });

    const backButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === 'Go back');

    expect(backButton).toBeDefined();

    await ReactTestRenderer.act(async () => {
      backButton!.props.onPress();
    });

    expect(nav.navigate).toHaveBeenCalledWith('Events');
    expect(nav.navigate).not.toHaveBeenCalledWith('Dashboard');
  });

  it('navigates back to calling origin without hard-coding Dashboard', async () => {
    const nav = createMockNavigation();
    const repo = new MockEventRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <EventDetailScreen
            eventId="evt-101"
            navigation={nav}
            route={
              {
                params: { eventId: 'evt-101', returnTo: 'MyApplications' },
              } as any
            }
            repository={repo}
          />,
        ),
      );
    });

    const backButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === 'Go back');

    expect(backButton).toBeDefined();

    await ReactTestRenderer.act(async () => {
      backButton!.props.onPress();
    });

    expect(nav.navigate).toHaveBeenCalledWith('MyApplications');
  });
});

describe('MyApplicationsScreen', () => {
  beforeEach(() => {
    resetApplicationsCache();
  });

  it('renders application items with event title, role name, and status badge', async () => {
    const nav = createMockNavigation();
    const repo = new MockEventRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <MyApplicationsScreen navigation={nav} repository={repo} />,
        ),
      );
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('My Applications');
    expect(json).toContain('Riverbank Environmental Cleanup & Waste Audit');
    expect(json).toContain('Recycling & Waste Data Auditor');
    expect(json).toContain('Pending Review');
    expect(json).toContain('Emergency Food Bank Packaging & Logistics');
    expect(json).toContain('Accepted');
  });

  it('navigates to EventDetail with actual eventId and returnTo=MyApplications when tapped', async () => {
    const nav = createMockNavigation();
    const repo = new MockEventRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <MyApplicationsScreen navigation={nav} repository={repo} />,
        ),
      );
    });

    const cardButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b =>
        b.props.accessibilityLabel ===
        'View details for Riverbank Environmental Cleanup & Waste Audit',
      );

    expect(cardButton).toBeDefined();

    await ReactTestRenderer.act(async () => {
      cardButton!.props.onPress();
    });

    expect(nav.navigate).toHaveBeenCalledWith('EventDetail', {
      eventId: 'evt-101',
      returnTo: 'MyApplications',
    });
  });

  it('filters applications by status chip and updates list view', async () => {
    const nav = createMockNavigation();
    const repo = new MockEventRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <MyApplicationsScreen navigation={nav} repository={repo} />,
        ),
      );
    });

    // Find the 'Accepted' filter chip
    const acceptedChip = renderer.root
      .findAllByProps({ accessibilityRole: 'checkbox' })
      .find(b => b.props.accessibilityLabel === 'Accepted');

    expect(acceptedChip).toBeDefined();

    await ReactTestRenderer.act(async () => {
      acceptedChip!.props.onPress();
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('Emergency Food Bank Packaging & Logistics');
    expect(json).not.toContain('Riverbank Environmental Cleanup & Waste Audit');
  });

  it('withdraws application with confirmation modal and shows Demo-only feedback', async () => {
    const nav = createMockNavigation();
    const repo = new MockEventRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <MyApplicationsScreen navigation={nav} repository={repo} />,
        ),
      );
    });

    // Find withdraw button for the pending role
    const withdrawBtn = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b =>
        b.props.accessibilityLabel ===
        'Withdraw application for Recycling & Waste Data Auditor',
      );

    expect(withdrawBtn).toBeDefined();

    await ReactTestRenderer.act(async () => {
      withdrawBtn!.props.onPress();
    });

    // Modal is now open
    let json = safeStringify(renderer.toJSON());
    expect(json).toContain('Withdraw Application');
    expect(json).toContain('Demo only');

    // Confirm withdrawal
    const confirmBtn = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === 'Confirm Withdrawal');

    expect(confirmBtn).toBeDefined();

    await ReactTestRenderer.act(async () => {
      await confirmBtn!.props.onPress();
    });

    // Verification banner is displayed
    json = safeStringify(renderer.toJSON());
    expect(json).toContain('Riverbank Environmental Cleanup & Waste Audit');
    expect(json).toContain('(Recycling & Waste Data Auditor) withdrawn');
    expect(json).toContain('Demo only');
  });

  it('preserves status filter across remounts', async () => {
    const nav = createMockNavigation();
    const repo = new MockEventRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <MyApplicationsScreen navigation={nav} repository={repo} />,
        ),
      );
    });

    // Select 'Pending' chip
    const pendingChip = renderer.root
      .findAllByProps({ accessibilityRole: 'checkbox' })
      .find(b => b.props.accessibilityLabel === 'Pending');

    await ReactTestRenderer.act(async () => {
      pendingChip!.props.onPress();
    });

    // Unmount and remount (simulating returning from EventDetail)
    await ReactTestRenderer.act(async () => {
      renderer.unmount();
    });

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <MyApplicationsScreen navigation={nav} repository={repo} />,
        ),
      );
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('Riverbank Environmental Cleanup & Waste Audit');
    expect(json).not.toContain('Emergency Food Bank Packaging & Logistics');
  });
});

describe('MyAssignmentsScreen', () => {
  beforeEach(() => {
    resetAssignmentsCache();
  });

  it('renders assignment rows with event title, role, location, and date/time', async () => {
    const nav = createMockNavigation();
    const repo = new MockEventRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <MyAssignmentsScreen navigation={nav} repository={repo} />,
        ),
      );
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('My Assignments');
    expect(json).toContain('Riverbank Environmental Cleanup & Waste Audit');
    expect(json).toContain('Confirmed Shift');
    expect(json).toContain('Emergency Food Bank Packaging & Logistics');
    expect(json).toContain('Assigned Shift');
    expect(json).toContain('Animal Shelter Wellness & Adoption Fair');
    expect(json).toContain('Attendance Verified');
  });

  it('navigates to EventDetail with actual eventId and returnTo=MyAssignments when tapped', async () => {
    const nav = createMockNavigation();
    const repo = new MockEventRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <MyAssignmentsScreen navigation={nav} repository={repo} />,
        ),
      );
    });

    const cardButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b =>
        b.props.accessibilityLabel ===
        'View details for Riverbank Environmental Cleanup & Waste Audit',
      );

    expect(cardButton).toBeDefined();

    await ReactTestRenderer.act(async () => {
      cardButton!.props.onPress();
    });

    expect(nav.navigate).toHaveBeenCalledWith('EventDetail', {
      eventId: 'evt-101',
      returnTo: 'MyAssignments',
    });
  });

  it('shows Cancel participation for active shifts and never calls it Cancel Event', async () => {
    const nav = createMockNavigation();
    const repo = new MockEventRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <MyAssignmentsScreen navigation={nav} repository={repo} />,
        ),
      );
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('Cancel participation');
    expect(json).not.toContain('Cancel Event');
    expect(json).not.toContain('Cancel event');
  });

  it('does not display cancel button for completed attendance', async () => {
    const nav = createMockNavigation();
    const repo = new MockEventRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <MyAssignmentsScreen navigation={nav} repository={repo} />,
        ),
      );
    });

    const buttons = renderer.root.findAllByProps({ accessibilityRole: 'button' });
    const completedCancelBtn = buttons.find(
      b =>
        b.props.accessibilityLabel ===
        'Cancel participation for Kennel Grooming & Exercise Assistant',
    );
    expect(completedCancelBtn).toBeUndefined();
  });

  it('cancels own assignment with modal confirmation and Demo-only feedback', async () => {
    const nav = createMockNavigation();
    const repo = new MockEventRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <MyAssignmentsScreen navigation={nav} repository={repo} />,
        ),
      );
    });

    const cancelBtn = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b =>
        b.props.accessibilityLabel ===
        'Cancel participation for Recycling & Waste Data Auditor',
      );

    expect(cancelBtn).toBeDefined();

    await ReactTestRenderer.act(async () => {
      cancelBtn!.props.onPress();
    });

    let json = safeStringify(renderer.toJSON());
    expect(json).toContain('Cancel Participation');
    expect(json).toContain('Demo only');

    // Confirm cancellation
    const confirmBtn = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === 'Cancel Participation');

    expect(confirmBtn).toBeDefined();

    await ReactTestRenderer.act(async () => {
      await confirmBtn!.props.onPress();
    });

    json = safeStringify(renderer.toJSON());
    expect(json).toContain('Riverbank Environmental Cleanup & Waste Audit');
    expect(json).toContain('(Recycling & Waste Data Auditor) cancelled');
    expect(json).toContain('Demo only');
  });

  it('rejects cancellation of completed assignment at repository level', async () => {
    const repo = new MockEventRepository();
    const result = await repo.cancelAssignment('asgn-303');
    expect(result.success).toBe(false);
    expect(result.message).toBe('Completed participation cannot be cancelled.');
  });

  it('preserves assignment filter tab across remounts', async () => {
    const nav = createMockNavigation();
    const repo = new MockEventRepository();

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <MyAssignmentsScreen navigation={nav} repository={repo} />,
        ),
      );
    });

    // Select 'Completed' tab
    const completedChip = renderer.root
      .findAllByProps({ accessibilityRole: 'checkbox' })
      .find(b => b.props.accessibilityLabel === 'Completed');

    await ReactTestRenderer.act(async () => {
      completedChip!.props.onPress();
    });

    // Unmount and remount (simulating return from EventDetail)
    await ReactTestRenderer.act(async () => {
      renderer.unmount();
    });

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        renderWithTheme(
          <MyAssignmentsScreen navigation={nav} repository={repo} />,
        ),
      );
    });

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('Animal Shelter Wellness & Adoption Fair');
    expect(json).not.toContain('Emergency Food Bank Packaging & Logistics');
  });
});
