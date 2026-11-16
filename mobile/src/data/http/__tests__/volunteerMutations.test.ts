/**
 * @format
 */

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiClient } from '../../../core/api/apiClient';
import { MemoryTokenStore } from '../../../core/auth/tokenStore';
import { SessionManager } from '../../../core/auth/sessionManager';
import { eventApi } from '../../endpoints/eventApi';
import { profileApi } from '../../endpoints/profileApi';
import { HttpEventRepository } from '../HttpEventRepository';
import { HttpProfileRepository } from '../HttpProfileRepository';
import { HttpDashboardRepository } from '../HttpDashboardRepository';
import { MockEventRepository } from '../../mock/MockEventRepository';
import { UserContext, FullUserContextValue } from '../../../app/UserContext';
import { ThemeProvider } from '../../../theme/ThemeProvider';
import { setDataMode, resetDataMode, isMockMode } from '../../../app/configuration/dataMode';
import { MyApplicationsScreen } from '../../../features/events/screens/MyApplicationsScreen';
import { MyAssignmentsScreen } from '../../../features/events/screens/MyAssignmentsScreen';
import { EventDetailScreen } from '../../../features/events/screens/EventDetailScreen';
import { DashboardScreen } from '../../../features/dashboard/screens/DashboardScreen';
import { ordinaryVolunteerUser } from '../../mock/fixtures/demoUsers';
import type {
  AvailabilityResponseDto,
  UserProfileDto,
  CoordinatorProfileEnvelopeDto,
} from '../../dto/profileDto';
import type {
  PublicEventDetailDto,
  VolunteerApplicationDto,
  VolunteerAssignmentDto,
} from '../../dto/eventDto';
import type {
  VolunteerApplicationItem,
  VolunteerAssignmentItem,
} from '../../../domain/models/event';

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

function renderWithProviders(ui: React.ReactElement, userContext: FullUserContextValue) {
  return React.createElement(
    SafeAreaProvider,
    { initialMetrics },
    React.createElement(
      ThemeProvider,
      {
        initialMode: 'light',
        children: React.createElement(UserContext.Provider, { value: userContext }, ui),
      },
    ),
  );
}

describe('Phase 6: Volunteer Mutations Integration', () => {
  let memoryStore: MemoryTokenStore;
  let testSessionMgr: SessionManager;
  let testClient: ApiClient;
  let eventRepo: HttpEventRepository;
  let profileRepo: HttpProfileRepository;
  let dashboardRepo: HttpDashboardRepository;
  let mockEventRepo: MockEventRepository;
  let root: ReactTestRenderer.ReactTestRenderer | null = null;

  const mockUserProfileDto: UserProfileDto = {
    id: 12,
    uuid: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
    display_name: 'Alex Morgan',
    phone: '+959123456789',
    preferred_language: 'en',
    home_area: 'Bahan Township',
    emergency_contact_name: 'Daw Khin',
    emergency_contact_phone: '+959987654321',
    blood_type: 'O+',
    is_willing_to_donate: true,
    is_willing_to_donate_blood: true,
    is_willing_to_donate_items: false,
    physical_ok: true,
    good_eyesight: true,
    needs_glasses: false,
    can_lift_heavy: true,
    can_work_outdoor: true,
    has_leader_experience: false,
    new_to_volunteer: false,
    skills: ['Logistics', 'First Aid'],
    needs_meal_support: true,
    needs_travel_support: false,
    accepts_unpaid: true,
    verification_status: 'verified',
    account_status: 'active',
    charity_interests: ['environment', 'education'],
    created_at: '2026-01-01T00:00:00Z',
  };

  const mockContext: FullUserContextValue = {
    currentUser: ordinaryVolunteerUser,
    setCurrentUser: jest.fn(),
    isCoordinator: false,
    switchUserPreset: jest.fn(),
    isAuthenticated: true,
    isBootstrapping: false,
    requestOtp: jest.fn().mockResolvedValue({ success: true }),
    verifyOtp: jest.fn().mockResolvedValue({ success: true }),
    logout: jest.fn(),
    refreshSessionUser: jest.fn(),
  };

  beforeEach(() => {
    resetDataMode();
    memoryStore = new MemoryTokenStore();
    testSessionMgr = new SessionManager(memoryStore);
    testClient = new ApiClient(undefined, memoryStore, testSessionMgr);
    eventRepo = new HttpEventRepository(testClient);
    profileRepo = new HttpProfileRepository(testClient);
    dashboardRepo = new HttpDashboardRepository(testClient);
    mockEventRepo = new MockEventRepository();
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
      root = null;
    }
    await memoryStore.clearToken();
    resetDataMode();
    jest.restoreAllMocks();
  });

  describe('1. Profile Update (PATCH /api/v1/me/) & Charity Interests (PUT /api/v1/me/charity-interests/)', () => {
    it('sends only allow-listed fields in PATCH /api/v1/me/ and never forbidden metadata', async () => {
      const updateProfileSpy = jest.spyOn(profileApi, 'updateProfile').mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          ...mockUserProfileDto,
          display_name: 'Alex Morgan Jr.',
          home_area: 'Kamayut Township',
        },
      });

      const setCharitySpy = jest.spyOn(profileApi, 'setCharityInterests').mockResolvedValue({
        ok: true,
        status: 200,
        data: { field_codes: ['health', 'disaster_relief'] },
      });

      jest.spyOn(profileApi, 'getProfile').mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          ...mockUserProfileDto,
          display_name: 'Alex Morgan Jr.',
          home_area: 'Kamayut Township',
          charity_interests: ['health', 'disaster_relief'],
        },
      });

      jest.spyOn(profileApi, 'getCoordinatorProfile').mockResolvedValue({
        ok: true,
        status: 200,
        data: { coordinator: null },
      });

      jest.spyOn(profileApi, 'getFeedbackSummary').mockResolvedValue({
        ok: true,
        status: 200,
        data: { results: [], summary: { volunteer_avg_rating: 4.8, volunteer_rating_count: 5, coordinator_avg_rating: null, coordinator_rating_count: 0, overall_avg_rating: 4.8, total_count: 5 } },
      });

      jest.spyOn(profileApi, 'getCharityInterests').mockResolvedValue({
        ok: true,
        status: 200,
        data: { field_codes: ['environment', 'cleaning'] },
      });

      const result = await profileRepo.updateProfile({
        displayName: 'Alex Morgan Jr.',
        homeArea: 'Kamayut Township',
        charityInterests: ['environment', 'cleaning'],
        capabilities: {
          physicalOk: true,
          goodEyesight: true,
          needsGlasses: false,
          canLiftHeavy: true,
          canWorkOutdoor: true,
          hasLeaderExperience: false,
          newToVolunteer: false,
        },
        supportPreferences: {
          needsMealSupport: true,
          needsTravelSupport: false,
          acceptsUnpaid: true,
        },
      });

      expect(result.success).toBe(true);
      expect(result.data?.displayName).toBe('Alex Morgan Jr.');

      // Strict allow-list verification
      expect(updateProfileSpy).toHaveBeenCalledTimes(1);
      const patchPayload = updateProfileSpy.mock.calls[0][0];

      // ALLOWED fields
      expect(patchPayload).toEqual({
        display_name: 'Alex Morgan Jr.',
        home_area: 'Kamayut Township',
        physical_ok: true,
        good_eyesight: true,
        needs_glasses: false,
        can_lift_heavy: true,
        can_work_outdoor: true,
        has_leader_experience: false,
        new_to_volunteer: false,
        needs_meal_support: true,
        needs_travel_support: false,
        accepts_unpaid: true,
      });

      // FORBIDDEN fields: must NEVER be in PATCH body
      expect(patchPayload).not.toHaveProperty('id');
      expect(patchPayload).not.toHaveProperty('uuid');
      expect(patchPayload).not.toHaveProperty('email');
      expect(patchPayload).not.toHaveProperty('phone');
      expect(patchPayload).not.toHaveProperty('account_status');
      expect(patchPayload).not.toHaveProperty('verification_status');
      expect(patchPayload).not.toHaveProperty('coordinator_status');
      expect(patchPayload).not.toHaveProperty('charity_interests');

      // Charity interests sent separately via dedicated endpoint
      expect(setCharitySpy).toHaveBeenCalledWith(
        ['environment', 'cleaning'],
        testClient,
      );
    });

    it('returns error result cleanly when updateProfile fails without throwing', async () => {
      jest.spyOn(profileApi, 'updateProfile').mockResolvedValue({
        ok: false,
        status: 400,
        error: { kind: 'validation', code: 'invalid_field', message: "Unsupported field 'extra_param'." },
      });

      const result = await profileRepo.updateProfile({
        displayName: 'Test Name',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain("Unsupported field 'extra_param'.");
    });
  });

  describe('2. Weekly Availability Rules (PUT /api/v1/me/availability/) & Date Exceptions', () => {
    const initialAvailabilityDto: AvailabilityResponseDto = {
      rules: [
        {
          id: 10,
          weekday: 1, // Monday
          start_time: '09:00:00',
          end_time: '12:00:00',
          valid_from: null,
          valid_to: null,
        },
      ],
      exceptions: [
        {
          id: 55,
          date: '2026-12-25',
          is_available: false,
          start_time: null,
          end_time: null,
          note: 'Christmas Holiday',
        },
      ],
    };

    it('saveWeeklyRule read-modifies-writes full rules array with deterministic ID', async () => {
      jest.spyOn(profileApi, 'getAvailability').mockResolvedValue({
        ok: true,
        status: 200,
        data: initialAvailabilityDto,
      });

      const replaceSpy = jest.spyOn(profileApi, 'replaceAvailabilityRules').mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          rules: [
            { id: 10, weekday: 1, start_time: '09:00:00', end_time: '12:00:00' },
            { id: 11, weekday: 6, start_time: '14:00:00', end_time: '18:00:00' },
          ],
        },
      });

      const result = await profileRepo.saveWeeklyRule({
        weekday: 6, // Saturday
        weekdayName: 'Saturday',
        startTime: '14:00',
        endTime: '18:00',
      });

      expect(result.success).toBe(true);
      expect(result.data?.id).toBe('6-14:00-18:00');

      // Verifies full array replacement sent via PUT /api/v1/me/availability/
      expect(replaceSpy).toHaveBeenCalledWith(
        {
          rules: [
            {
              weekday: 1,
              start_time: '09:00:00',
              end_time: '12:00:00',
            },
            {
              weekday: 6,
              start_time: '14:00:00',
              end_time: '18:00:00',
            },
          ],
        },
        testClient,
      );
    });

    it('deleteWeeklyRule filters rule by deterministic id and PUTs remaining array', async () => {
      jest.spyOn(profileApi, 'getAvailability').mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          rules: [
            { id: 10, weekday: 1, start_time: '09:00:00', end_time: '12:00:00' },
            { id: 11, weekday: 6, start_time: '14:00:00', end_time: '18:00:00' },
          ],
          exceptions: [],
        },
      });

      const replaceSpy = jest.spyOn(profileApi, 'replaceAvailabilityRules').mockResolvedValue({
        ok: true,
        status: 200,
        data: { rules: [{ id: 11, weekday: 6, start_time: '14:00:00', end_time: '18:00:00' }] },
      });

      const result = await profileRepo.deleteWeeklyRule('10');
      expect(result.success).toBe(true);

      // Remaining rule only
      expect(replaceSpy).toHaveBeenCalledWith(
        {
          rules: [
            {
              weekday: 6,
              start_time: '14:00:00',
              end_time: '18:00:00',
            },
          ],
        },
        testClient,
      );
    });

    it('saveException posts date exception and deleteException deletes by ID', async () => {
      const upsertSpy = jest.spyOn(profileApi, 'upsertAvailabilityException').mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          id: 99,
          date: '2026-12-31',
          is_available: false,
          start_time: null,
          end_time: null,
          note: "New Year's Eve",
        },
      });

      const deleteSpy = jest.spyOn(profileApi, 'deleteAvailabilityException').mockResolvedValue({
        ok: true,
        status: 204,
        data: {},
      });

      const saveRes = await profileRepo.saveException({
        date: '2026-12-31',
        isAvailable: false,
        note: "New Year's Eve",
      });

      expect(saveRes.success).toBe(true);
      expect(saveRes.data?.id).toBe('99');
      expect(upsertSpy).toHaveBeenCalledWith(
        {
          date: '2026-12-31',
          is_available: false,
          start_time: null,
          end_time: null,
          note: "New Year's Eve",
        },
        testClient,
      );

      const delRes = await profileRepo.deleteException('99');
      expect(delRes.success).toBe(true);
      expect(deleteSpy).toHaveBeenCalledWith('99', testClient);
    });
  });

  describe('3. Coordinator Application Submission (POST /api/v1/me/coordinator/)', () => {
    it('submits coordinator application note and returns success', async () => {
      const applySpy = jest.spyOn(profileApi, 'applyForCoordinator').mockResolvedValue({
        ok: true,
        status: 201,
        data: {
          coordinator: {
            user_id: 12,
            status: 'pending',
            approved_by_id: null,
            approved_at: null,
            notes: 'Experienced volunteer team leader for river cleanups.',
            created_at: '2026-11-15T00:00:00Z',
            updated_at: '2026-11-15T00:00:00Z',
          },
        },
      });

      const result = await profileRepo.submitCoordinatorApplication(
        'Experienced volunteer team leader for river cleanups.',
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('Coordinator application submitted successfully');
      expect(applySpy).toHaveBeenCalledWith(
        'Experienced volunteer team leader for river cleanups.',
        testClient,
      );
    });

    it('returns domain error message when backend rejects unverified user (Rule W34)', async () => {
      jest.spyOn(profileApi, 'applyForCoordinator').mockResolvedValue({
        ok: false,
        status: 400,
        error: {
          kind: 'validation',
          code: 'not_verified',
          message: 'Identity verification must be approved before applying as a coordinator.',
        },
      });

      const result = await profileRepo.submitCoordinatorApplication('Please approve me.');
      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'Identity verification must be approved before applying as a coordinator.',
      );
    });

    it('returns conflict error message on duplicate pending application', async () => {
      jest.spyOn(profileApi, 'applyForCoordinator').mockResolvedValue({
        ok: false,
        status: 409,
        error: {
          kind: 'conflict',
          code: 'duplicate_application',
          message: 'A coordinator application already exists for this account.',
        },
      });

      const result = await profileRepo.submitCoordinatorApplication('Duplicate note.');
      expect(result.success).toBe(false);
      expect(result.message).toBe(
        'A coordinator application already exists for this account.',
      );
    });
  });

  describe('4. Event Application (POST /api/v1/events/{id}/apply/) & Withdrawal', () => {
    it('applies to open post on event and maps EventApplicationState', async () => {
      const applySpy = jest.spyOn(eventApi, 'applyToEvent').mockResolvedValue({
        ok: true,
        status: 201,
        data: {
          id: 888,
          event_id: 101,
          event_title: 'Yangon River Cleanup Initiative',
          event_status: 'active',
          post_id: 501,
          post_title: 'Waste Sorting Team Leader',
          source: 'browse',
          status: 'pending',
          applied_at: '2026-11-15T10:00:00Z',
          decided_at: null,
          note: 'Experienced with sorting equipment',
        },
      });

      const result = await eventRepo.applyToPost('101', '501', 'Experienced with sorting equipment');
      expect(result.success).toBe(true);
      expect(result.application?.id).toBe('888');
      expect(result.application?.status).toBe('pending');
      expect(result.application?.volunteerNote).toBe('Experienced with sorting equipment');

      expect(applySpy).toHaveBeenCalledWith(
        '101',
        {
          event_id: 101,
          post_id: 501,
          source: 'browse',
          note: 'Experienced with sorting equipment',
        },
        testClient,
      );
    });

    it('handles domain errors (schedule_conflict, capacity_full, already_applied, emergency_contact_incomplete)', async () => {
      const errorCases = [
        { code: 'schedule_conflict', message: 'You have a conflicting confirmed assignment during this shift.' },
        { code: 'capacity_full', message: 'This volunteer post has reached its maximum capacity.' },
        { code: 'already_applied', message: 'You already have an active application for this event.' },
        { code: 'emergency_contact_incomplete', message: 'Emergency contact name and phone are required before applying.' },
      ];

      for (const errCase of errorCases) {
        jest.spyOn(eventApi, 'applyToEvent').mockResolvedValueOnce({
          ok: false,
          status: 400,
          error: { kind: 'validation', code: errCase.code, message: errCase.message },
        });

        const result = await eventRepo.applyToPost('101', '501');
        expect(result.success).toBe(false);
        expect(result.message).toBe(errCase.message);
      }
    });

    it('withdraws application via POST /api/v1/applications/{id}/withdraw/', async () => {
      const withdrawSpy = jest.spyOn(eventApi, 'withdrawApplication').mockResolvedValue({
        ok: true,
        status: 200,
        data: { id: 888, status: 'withdrawn' },
      });

      const result = await eventRepo.withdrawApplication('888');
      expect(result.success).toBe(true);
      expect(result.message).toBe('Application withdrawn successfully');
      expect(withdrawSpy).toHaveBeenCalledWith('888', testClient);
    });

    it('handles withdrawal invalid_state error when status cannot be withdrawn', async () => {
      jest.spyOn(eventApi, 'withdrawApplication').mockResolvedValue({
        ok: false,
        status: 400,
        error: { kind: 'validation', code: 'invalid_state', message: "Cannot withdraw an application with status 'rejected'." },
      });

      const result = await eventRepo.withdrawApplication('888');
      expect(result.success).toBe(false);
      expect(result.message).toBe("Cannot withdraw an application with status 'rejected'.");
    });
  });

  describe('5. Assignment Confirmation (POST /confirm/) & Cancellation (POST /cancel/)', () => {
    it('confirms assigned shift via POST /api/v1/assignments/{id}/confirm/', async () => {
      const confirmSpy = jest.spyOn(eventApi, 'confirmAssignment').mockResolvedValue({
        ok: true,
        status: 200,
        data: { id: 301, status: 'confirmed' },
      });

      const result = await eventRepo.confirmAssignment('301');
      expect(result.success).toBe(true);
      expect(result.message).toBe('Assignment confirmed successfully');
      expect(confirmSpy).toHaveBeenCalledWith('301', testClient);
    });

    it('cancels scheduled shift via POST /api/v1/assignments/{id}/cancel/', async () => {
      const cancelSpy = jest.spyOn(eventApi, 'cancelAssignment').mockResolvedValue({
        ok: true,
        status: 200,
        data: { id: 301, status: 'cancelled' },
      });

      const result = await eventRepo.cancelAssignment('301');
      expect(result.success).toBe(true);
      expect(result.message).toBe('Assignment cancelled successfully');
      expect(cancelSpy).toHaveBeenCalledWith(
        '301',
        'Cancelled by volunteer',
        testClient,
      );
    });

    it('handles completed assignment cancellation rejection', async () => {
      jest.spyOn(eventApi, 'cancelAssignment').mockResolvedValue({
        ok: false,
        status: 400,
        error: { kind: 'validation', code: 'invalid_state', message: 'Completed assignments cannot be cancelled.' },
      });

      const result = await eventRepo.cancelAssignment('301');
      expect(result.success).toBe(false);
      expect(result.message).toBe('Completed assignments cannot be cancelled.');
    });

    it('MockEventRepository implements confirmAssignment and updates status locally', async () => {
      // asgn-302 has status 'assigned' in initial mock assignments
      const confirmRes = await mockEventRepo.confirmAssignment('asgn-302');
      expect(confirmRes.success).toBe(true);

      const assignments = await mockEventRepo.getUserAssignments();
      const updated = assignments.find(a => a.id === 'asgn-302');
      expect(updated?.status).toBe('confirmed');

      // Attempting to confirm already confirmed assignment fails
      const duplicateRes = await mockEventRepo.confirmAssignment('asgn-302');
      expect(duplicateRes.success).toBe(false);
      expect(duplicateRes.message).toContain("Cannot confirm an assignment with status 'confirmed'");
    });

    it('HttpDashboardRepository.cancelUpcomingParticipation cancels shift and refetches summary', async () => {
      const cancelSpy = jest.spyOn(eventApi, 'cancelAssignment').mockResolvedValue({
        ok: true,
        status: 200,
        data: { id: 301, status: 'cancelled' },
      });

      jest.spyOn(eventApi, 'getMyAssignments').mockResolvedValue({
        ok: true,
        status: 200,
        data: { results: [] },
      });

      jest.spyOn(profileApi, 'getAttendanceHistory').mockResolvedValue({
        ok: true,
        status: 200,
        data: { results: [] },
      });

      jest.spyOn(profileApi, 'getFeedbackSummary').mockResolvedValue({
        ok: true,
        status: 200,
        data: { results: [], summary: { volunteer_avg_rating: null, volunteer_rating_count: 0, coordinator_avg_rating: null, coordinator_rating_count: 0, overall_avg_rating: null, total_count: 0 } },
      });

      const result = await dashboardRepo.cancelUpcomingParticipation('301');
      expect(result.success).toBe(true);
      expect(cancelSpy).toHaveBeenCalledWith('301', 'Cancelled by volunteer', testClient);
      expect(result.data?.upcomingCommitmentCount).toBe(0);
    });
  });

  describe('6. Screen UI Refinements & Demo Banner Suppression in HTTP Mode', () => {
    it('MyApplicationsScreen allows withdrawing accepted applications in addition to pending/waitlisted', async () => {
      const acceptedApp: VolunteerApplicationItem = {
        id: 'app-accepted-1',
        eventId: '101',
        eventTitle: 'Tree Planting Initiative',
        postId: '501',
        postTitle: 'Planter',
        status: 'accepted',
        appliedAt: '2026-11-10T10:00:00Z',
      };

      jest.spyOn(mockEventRepo, 'getUserApplications').mockResolvedValue([acceptedApp]);

      await act(async () => {
        root = ReactTestRenderer.create(
          renderWithProviders(
            React.createElement(MyApplicationsScreen, {
              repository: mockEventRepo,
              navigation: createMockNavigation(),
              route: {} as any,
            }),
            mockContext,
          ),
        );
      });

      const str = safeStringify(root!.toJSON());
      expect(str).toContain('Tree Planting Initiative');
      expect(str).toContain('Withdraw application');
    });

    it('MyAssignmentsScreen displays Confirm Shift button for assigned shifts', async () => {
      const assignedShift: VolunteerAssignmentItem = {
        id: 'asgn-to-confirm',
        eventId: '101',
        eventTitle: 'Food Distribution Mission',
        postId: '501',
        postTitle: 'Packer',
        status: 'assigned',
        startAt: '2026-12-01T08:00:00Z',
        endAt: '2026-12-01T12:00:00Z',
        location: 'Downtown Center',
        assignedAt: '2026-11-20T10:00:00Z',
      };

      jest.spyOn(mockEventRepo, 'getUserAssignments').mockResolvedValue([assignedShift]);

      await act(async () => {
        root = ReactTestRenderer.create(
          renderWithProviders(
            React.createElement(MyAssignmentsScreen, {
              repository: mockEventRepo,
              navigation: createMockNavigation(),
              route: {} as any,
            }),
            mockContext,
          ),
        );
      });

      const str = safeStringify(root!.toJSON());
      expect(str).toContain('Food Distribution Mission');
      expect(str).toContain('Confirm Shift');
      expect(str).toContain('Cancel participation');
    });

    it('hides yellow demo warning modal banners when dataMode is http', async () => {
      setDataMode('http');
      expect(isMockMode()).toBe(false);

      const mockEventDetail: PublicEventDetailDto = {
        id: 101,
        title: 'Coastal Cleanup',
        description: 'Beach cleanup',
        purpose_type: 'charity_event',
        location_name: 'Beach Pier',
        landmark_text: 'Pier 1',
        latitude: '16.7',
        longitude: '96.1',
        geo_radius_m: 200,
        geo_checkin_enabled: true,
        map_provider: 'openstreetmap',
        start_at: '2026-12-01T08:00:00Z',
        end_at: '2026-12-01T12:00:00Z',
        application_deadline: '2026-11-28T00:00:00Z',
        status: 'active',
        acceptance_mode: 'manual',
        max_participants: 50,
        meals_provided: true,
        lodging_provided: false,
        travel_support_provided: true,
        compensation_kind: 'unpaid',
        coordinator_name: 'Daw Khin',
        charity_fields: ['environment'],
        spots_remaining: 10,
        posts: [
          {
            id: 501,
            title: 'Team Lead',
            description: 'Lead volunteers',
            status: 'open',
            physical_level: 'medium',
            required_skills: [],
            leader_needed: true,
            new_volunteers_allowed: false,
            required_headcount: 5,
            assigned_count: 2,
            remaining: 3,
          },
        ],
      };

      jest.spyOn(eventApi, 'getEventDetail').mockResolvedValue({
        ok: true,
        status: 200,
        data: mockEventDetail,
      });

      jest.spyOn(eventApi, 'getEventPosts').mockResolvedValue({
        ok: true,
        status: 200,
        data: mockEventDetail.posts!,
      });

      jest.spyOn(eventApi, 'getMyApplications').mockResolvedValue({
        ok: true,
        status: 200,
        data: { results: [] },
      });

      await act(async () => {
        root = ReactTestRenderer.create(
          renderWithProviders(
            React.createElement(EventDetailScreen, {
              repository: eventRepo,
              navigation: createMockNavigation(),
              route: { params: { eventId: '101' } } as any,
            }),
            mockContext,
          ),
        );
      });

      const str = safeStringify(root!.toJSON());
      // In HTTP mode, the yellow "Demo only — not submitted to server" modal banner must NOT be rendered
      expect(str).not.toContain('⚠️ Demo only — not submitted to server');
    });
  });
});
