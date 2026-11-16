/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { UserContext, UserContextValue } from '../src/app/UserContext';
import { approvedCoordinatorUser } from '../src/data/mock/fixtures/demoUsers';
import {
  MockCoordinatorIdentity,
  MockCoordinatorRepository,
} from '../src/data/mock/MockCoordinatorRepository';
import { MockDashboardRepository } from '../src/data/mock/MockDashboardRepository';
import { MockEventRepository } from '../src/data/mock/MockEventRepository';
import { MockProfileRepository } from '../src/data/mock/MockProfileRepository';
import {
  createCoordinatorEventsFixture,
  createFixedClock,
  createSequentialIdGenerator,
  deepClone,
} from '../src/data/mock/mockUtils';
import type { CreateEventWizardDraft } from '../src/domain/models/coordinator';
import { CreateEventWizardScreen } from '../src/features/coordinator';
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

function safeStringify(node: any): string {
  try {
    return JSON.stringify(node);
  } catch {
    return '';
  }
}

function createDraftPayload(
  overrides: Partial<CreateEventWizardDraft> = {},
): CreateEventWizardDraft {
  return {
    title: 'Test Event',
    purposeType: 'charity_event',
    charityFieldCodes: ['environment'],
    locationName: 'Test Location',
    latitude: 16.8,
    longitude: 96.15,
    geoRadiusM: 200,
    geoCheckinEnabled: true,
    geoCheckinOpensBeforeMin: 30,
    requireCheckinConfirmation: true,
    mapProvider: 'openstreetmap',
    startAt: '2026-12-01T08:00:00+06:30',
    endAt: '2026-12-01T15:00:00+06:30',
    acceptanceMode: 'manual',
    autoAssignEnabled: true,
    leaderStrategy: 'none',
    mealsProvided: true,
    lodgingProvided: false,
    travelSupportProvided: true,
    compensationKind: 'unpaid',
    requireOnboardingAck: true,
    qrRegistrationEnabled: true,
    ...overrides,
  };
}

describe('MockCoordinatorRepository Identity & Dynamic Draft Ownership', () => {
  it('initializes with default approved coordinator identity', () => {
    const repo = new MockCoordinatorRepository();
    const identity = repo.getCoordinatorIdentity();

    expect(identity.id).toBe(approvedCoordinatorUser.id);
    expect(identity.displayName).toBe(approvedCoordinatorUser.displayName);
  });

  it('injects custom coordinator identity via constructor options', async () => {
    const customIdentity: MockCoordinatorIdentity = {
      id: 'usr-coord-custom-88',
      displayName: 'Thiri Win (Team Lead)',
      email: 'thiri.win@volunteer.local',
    };

    const repo = new MockCoordinatorRepository(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { coordinatorIdentity: customIdentity },
    );

    expect(repo.getCoordinatorIdentity()).toEqual(customIdentity);

    // Create a draft event and verify it inherits the injected identity
    const result = await repo.createDraftEvent(
      createDraftPayload({
        title: 'Mangrove Reforestation Drive',
        charityFieldCodes: ['environment'],
        locationName: 'Bogale Coastal Estuary',
      }),
    );

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data!.ownerId).toBe('usr-coord-custom-88');
    expect(result.data!.currentCoordinatorId).toBe('usr-coord-custom-88');
    expect(result.data!.coordinatorName).toBe('Thiri Win (Team Lead)');
  });

  it('updates draft ownership dynamically when switching demo profile', async () => {
    const repo = new MockCoordinatorRepository();

    // 1. Initial draft created with default coordinator
    const res1 = await repo.createDraftEvent(
      createDraftPayload({
        title: 'Initial Event',
        charityFieldCodes: ['teaching'],
        locationName: 'Central Library',
        startAt: '2026-12-05T09:00:00+06:30',
        endAt: '2026-12-05T12:00:00+06:30',
      }),
    );
    expect(res1.data!.ownerId).toBe(approvedCoordinatorUser.id);
    expect(res1.data!.coordinatorName).toBe(approvedCoordinatorUser.displayName);

    // 2. Switch demo profile / identity
    const newCoordinator: MockCoordinatorIdentity = {
      id: 'usr-coord-alternate-99',
      displayName: 'Aung Kyaw (Senior Coordinator)',
    };
    repo.setCoordinatorIdentity(newCoordinator);

    // 3. Second draft should now belong to the new fixture identity
    const res2 = await repo.createDraftEvent(
      createDraftPayload({
        title: 'Second Event',
        charityFieldCodes: ['food_distribution'],
        locationName: 'Community Clinic',
        startAt: '2026-12-10T08:00:00+06:30',
        endAt: '2026-12-10T14:00:00+06:30',
      }),
    );
    expect(res2.data!.ownerId).toBe('usr-coord-alternate-99');
    expect(res2.data!.coordinatorName).toBe('Aung Kyaw (Senior Coordinator)');
  });

  it('reflects active demo coordinator identity on CreateEventWizard Review screen (Step 7)', async () => {
    const nav = createMockNavigation();
    const repo = new MockCoordinatorRepository();

    const customCoordinatorUser = {
      id: 'usr-coord-test-77',
      displayName: 'Dr. Khin Mar (Disaster Relief)',
      email: 'khin.mar@volunteer.local',
      coordinatorStatus: 'approved' as const,
      accountStatus: 'active' as const,
    };

    const userContext: UserContextValue = {
      currentUser: customCoordinatorUser,
      setCurrentUser: jest.fn(),
      isCoordinator: true,
      switchUserPreset: jest.fn(),
    };

    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SafeAreaProvider initialMetrics={initialMetrics}>
          <ThemeProvider>
            <UserContext.Provider value={userContext}>
              <CreateEventWizardScreen navigation={nav} repository={repo} />
            </UserContext.Provider>
          </ThemeProvider>
        </SafeAreaProvider>,
      );
    });

    // Advance to Step 7
    const titleInput = renderer.root.findByProps({
      placeholder: 'e.g. Riverbank Cleanup & Recycling Drive',
    });
    await ReactTestRenderer.act(async () => {
      titleInput.props.onChangeText('Relief Supply Distribution');
    });

    const nextButton = renderer.root
      .findAllByProps({ accessibilityRole: 'button' })
      .find(b => b.props.accessibilityLabel === 'Next')!;

    // Step 1 -> 2
    await ReactTestRenderer.act(async () => {
      nextButton.props.onPress();
    });
    // Step 2 -> 3
    const locInput = renderer.root.findByProps({
      placeholder: 'e.g. Downtown Riverwalk Plaza, Pier 4',
    });
    await ReactTestRenderer.act(async () => {
      locInput.props.onChangeText('Bahan Aid Depot');
    });
    await ReactTestRenderer.act(async () => {
      nextButton.props.onPress();
    });
    // Step 3 -> 4 -> 5 -> 6 -> 7
    for (let step = 3; step < 7; step++) {
      await ReactTestRenderer.act(async () => {
        nextButton.props.onPress();
      });
    }

    const json = safeStringify(renderer.toJSON());
    expect(json).toContain('Coordinator: Dr. Khin Mar (Disaster Relief)');
  });
});

describe('Deterministic ID Generation & Collision Prevention', () => {
  it('generates predictable, unique IDs in rapid repeated event creation without collisions', async () => {
    const repo = new MockCoordinatorRepository(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { idGenerator: createSequentialIdGenerator(5000) },
    );

    const generatedIds: string[] = [];

    // Create 10 events synchronously in rapid succession
    for (let i = 1; i <= 10; i++) {
      const res = await repo.createDraftEvent(
        createDraftPayload({
          title: `Rapid Event ${i}`,
          locationName: `Site ${i}`,
        }),
      );

      expect(res.success).toBe(true);
      generatedIds.push(res.data!.id);
    }

    // Verify all 10 IDs are unique
    const uniqueIds = new Set(generatedIds);
    expect(uniqueIds.size).toBe(10);

    // Verify sequential deterministic pattern
    expect(generatedIds[0]).toBe('evt-draft-5001');
    expect(generatedIds[1]).toBe('evt-draft-5002');
    expect(generatedIds[9]).toBe('evt-draft-5010');
  });

  it('injects custom ID generator into MockEventRepository and avoids Date.now() collisions', async () => {
    const customGen = (prefix: string) => `${prefix}-deterministic-fixed`;
    const repo = new MockEventRepository(undefined, undefined, undefined, {
      idGenerator: customGen,
    });

    const res = await repo.applyToPost(
      'evt-101',
      'post-101-1',
      'Test application',
    );
    expect(res.success).toBe(true);
    expect(res.application?.id).toBe('app-demo-deterministic-fixed');
  });

  it('injects custom ID generator into MockProfileRepository for rules and exceptions', async () => {
    const repo = new MockProfileRepository(undefined, undefined, undefined, {
      idGenerator: createSequentialIdGenerator(9000),
    });

    const ruleRes = await repo.saveWeeklyRule({
      weekday: 2,
      weekdayName: 'Tuesday',
      startTime: '09:00',
      endTime: '12:00',
    });
    expect(ruleRes.success).toBe(true);
    expect(ruleRes.data?.id).toBe('rule-9001');

    const excRes = await repo.saveException({
      date: '2026-12-25',
      isAvailable: false,
      note: 'Holiday',
    });
    expect(excRes.success).toBe(true);
    expect(excRes.data?.id).toBe('exc-9002');
  });
});

describe('Deterministic Clock Injection', () => {
  it('uses injected fixed clock for timestamps across operations', async () => {
    const fixedTime = '2026-11-20T14:30:00.000Z';
    const clock = createFixedClock(fixedTime);

    const coordRepo = new MockCoordinatorRepository(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { clock },
    );

    // Auto-assignment
    const autoRes = await coordRepo.runAutoAssignment('evt-coord-001');
    expect(autoRes.success).toBe(true);
    if (autoRes.data && autoRes.data.length > 0) {
      expect(autoRes.data[0].assignedAt).toBe(fixedTime);
    }

    // Event repository application timestamp
    const eventRepo = new MockEventRepository(undefined, undefined, undefined, {
      clock,
    });
    const appRes = await eventRepo.applyToPost('evt-101', 'post-101-1');
    expect(appRes.success).toBe(true);
    expect(appRes.application?.appliedAt).toBe(fixedTime);
  });
});

describe('Isolated Test State & Reset/Seed Methods', () => {
  it('resets repository state cleanly between test runs without leaking mutations', async () => {
    const repo = new MockCoordinatorRepository();

    // Mutate state: add an event
    const initialEvents = await repo.getMyEvents();
    const countBefore = initialEvents.length;

    await repo.createDraftEvent(
      createDraftPayload({
        title: 'Ephemeral Test Event',
        charityFieldCodes: ['teaching'],
        locationName: 'Test School',
      }),
    );

    const mutatedEvents = await repo.getMyEvents();
    expect(mutatedEvents.length).toBe(countBefore + 1);

    // Reset repository to clean state
    repo.reset();

    const resetEvents = await repo.getMyEvents();
    expect(resetEvents.length).toBe(countBefore);
    expect(resetEvents.some(e => e.title === 'Ephemeral Test Event')).toBe(
      false,
    );
  });

  it('seeds custom test data into MockCoordinatorRepository', async () => {
    const repo = new MockCoordinatorRepository();

    const customEvent = createCoordinatorEventsFixture()[0];
    customEvent.id = 'evt-seeded-999';
    customEvent.title = 'Seeded Test Event';

    repo.seed({
      events: [customEvent],
      coordinatorIdentity: {
        id: 'usr-seeded-coord',
        displayName: 'Seeded Coordinator',
      },
    });

    const events = await repo.getMyEvents();
    expect(events.length).toBe(1);
    expect(events[0].id).toBe('evt-seeded-999');
    expect(events[0].title).toBe('Seeded Test Event');
    expect(repo.getCoordinatorIdentity().id).toBe('usr-seeded-coord');
  });

  it('verifies deepClone utility provides isolation without mutation bleed', () => {
    const original = {
      id: 'item-1',
      date: new Date('2026-11-12T10:00:00Z'),
      tags: ['alpha', 'beta'],
      nested: { count: 42, active: true, optional: undefined },
    };

    const cloned = deepClone(original);

    // Modify clone
    cloned.tags.push('gamma');
    cloned.nested.count = 99;

    // Verify original is untouched
    expect(original.tags).toEqual(['alpha', 'beta']);
    expect(original.nested.count).toBe(42);
    expect(cloned.date).toBeInstanceOf(Date);
    expect(cloned.date.getTime()).toBe(original.date.getTime());
    expect(cloned.nested.optional).toBeUndefined();
  });
});

describe('Consistent Demo Feedback Messaging Audit', () => {
  it('enforces "Demo only — not submitted to server" across MockCoordinatorRepository mutations', async () => {
    const repo = new MockCoordinatorRepository();

    // 1. Create draft
    const draftRes = await repo.createDraftEvent(
      createDraftPayload({
        title: 'Demo Test Event',
        charityFieldCodes: ['environment'],
        locationName: 'Test Area',
      }),
    );
    expect(draftRes.message).toBe('Demo only — not submitted to server');

    // 2. Transition status
    const transRes = await repo.transitionEventStatus(
      draftRes.data!.id,
      'published',
    );
    expect(transRes.message).toBe('Demo only — not submitted to server');

    // 3. Update application status
    const appRes = await repo.updateApplicationStatus('app-101', 'accepted');
    expect(appRes.message).toBe('Demo only — not submitted to server');

    // 4. Auto assign
    const autoRes = await repo.runAutoAssignment('evt-coord-001');
    expect(autoRes.message).toBe('Demo only — not submitted to server');

    // 5. Manual assign
    const manualRes = await repo.assignVolunteerManually(
      'app-107',
      'post-c1-1',
    );
    expect(manualRes.message).toBe('Demo only — not submitted to server');

    // 6. Cancel assignment
    const cancelRes = await repo.cancelAssignment('asg-101');
    expect(cancelRes.message).toBe('Demo only — not submitted to server');

    // 7. Confirm geo attendance
    const confirmRes = await repo.confirmGeoAttendance('att-102');
    expect(confirmRes.message).toBe('Demo only — not submitted to server');

    // 8. Reject geo attendance
    const rejectRes = await repo.rejectGeoAttendance('att-102');
    expect(rejectRes.message).toBe('Demo only — not submitted to server');

    // 9. Manual check-in
    const checkinRes = await repo.manualCheckIn('att-103');
    expect(checkinRes.message).toBe('Demo only — not submitted to server');
  });

  it('enforces "Demo only — not submitted to server" across MockEventRepository mutations', async () => {
    const repo = new MockEventRepository();

    const applyRes = await repo.applyToPost('evt-101', 'post-101-1');
    expect(applyRes.message).toBe('Demo only — not submitted to server');

    const withdrawRes = await repo.withdrawApplication('app-901');
    expect(withdrawRes.message).toContain('Demo only — not submitted to server');

    const cancelRes = await repo.cancelAssignment('asgn-301');
    expect(cancelRes.message).toContain('Demo only — not submitted to server');
  });

  it('enforces "Demo only — not submitted to server" across MockDashboardRepository mutations', async () => {
    const repo = new MockDashboardRepository();

    const cancelRes = await repo.cancelUpcomingParticipation(
      'comm-preview-001',
    );
    expect(cancelRes.message).toContain('Demo only — not submitted to server');
  });

  it('enforces "Demo only — not submitted to server" across MockProfileRepository mutations', async () => {
    const repo = new MockProfileRepository();

    const updateRes = await repo.updateProfile({ displayName: 'Updated Name' });
    expect(updateRes.message).toBe('Demo only — not submitted to server');

    const ruleRes = await repo.saveWeeklyRule({
      weekday: 3,
      weekdayName: 'Wednesday',
      startTime: '10:00',
      endTime: '13:00',
    });
    expect(ruleRes.message).toBe('Demo only — not submitted to server');

    const delRuleRes = await repo.deleteWeeklyRule(ruleRes.data!.id);
    expect(delRuleRes.message).toBe('Demo only — not submitted to server');

    const excRes = await repo.saveException({
      date: '2026-12-31',
      isAvailable: false,
    });
    expect(excRes.message).toBe('Demo only — not submitted to server');

    const delExcRes = await repo.deleteException(excRes.data!.id);
    expect(delExcRes.message).toBe('Demo only — not submitted to server');

    const appRes = await repo.submitCoordinatorApplication('Volunteer lead');
    expect(appRes.message).toBe('Demo only — not submitted to server');
  });
});
