/**
 * @format
 */

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../../../theme/ThemeProvider';
import { ApiClient } from '../../../core/api/apiClient';
import { MemoryTokenStore } from '../../../core/auth/tokenStore';
import { SessionManager } from '../../../core/auth/sessionManager';
import { eventApi } from '../../endpoints/eventApi';
import { profileApi } from '../../endpoints/profileApi';
import { HttpEventRepository } from '../HttpEventRepository';
import { HttpDashboardRepository } from '../HttpDashboardRepository';
import { HttpProfileRepository } from '../HttpProfileRepository';
import { queryCache } from '../../cache';
import { DashboardScreen } from '../../../features/dashboard/screens/DashboardScreen';
import { UserContext, FullUserContextValue } from '../../../app/UserContext';
import { RepositoryProvider } from '../../../app/RepositoryProvider';
import { ordinaryVolunteerUser } from '../../mock/fixtures/demoUsers';
import { AppText } from '../../../shared';
import type {
  CharityFieldDto,
  PublicEventDetailDto,
  PublicEventDto,
  PublicEventPostDto,
  VolunteerApplicationDto,
  VolunteerAssignmentDto,
} from '../../dto/eventDto';
import type {
  AttendanceHistoryItemDto,
  AvailabilityResponseDto,
  CoordinatorProfileEnvelopeDto,
  FeedbackSummaryResponseDto,
  UserProfileDto,
  VerificationStatusResponseDto,
} from '../../dto/profileDto';

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

function renderWithProviders(ui: React.ReactElement, userContext: FullUserContextValue) {
  return (
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <ThemeProvider initialMode="light">
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

describe('Phase 5: Volunteer Read Experiences Integration', () => {
  let memoryStore: MemoryTokenStore;
  let testSessionMgr: SessionManager;
  let testClient: ApiClient;
  let eventRepo: HttpEventRepository;
  let dashboardRepo: HttpDashboardRepository;
  let profileRepo: HttpProfileRepository;
  let root: ReactTestRenderer.ReactTestRenderer | null = null;

  const mockPublicEventDto: PublicEventDto = {
    id: 101,
    title: 'Yangon River Cleanup Initiative',
    description: 'Community volunteer river cleaning drive along the jetty.',
    purpose_type: 'charity_event',
    location_name: 'Botahtaung Jetty Pier 3',
    landmark_text: 'Opposite Night Market Gate',
    latitude: '16.7681',
    longitude: '96.1662',
    geo_radius_m: 200,
    geo_checkin_enabled: true,
    map_provider: 'openstreetmap',
    start_at: '2026-12-01T08:00:00+06:30',
    end_at: '2026-12-01T12:00:00+06:30',
    application_deadline: '2026-11-28T23:59:59+06:30',
    status: 'active',
    acceptance_mode: 'manual',
    max_participants: 50,
    meals_provided: true,
    lodging_provided: false,
    travel_support_provided: true,
    compensation_kind: 'unpaid',
    coordinator_name: 'Daw Khin',
    charity_fields: ['environment', 'cleaning'],
    spots_remaining: 15,
  };

  const mockPosts: PublicEventPostDto[] = [
    {
      id: 501,
      title: 'Waste Sorting Team Leader',
      description: 'Coordinates sorting plastic vs organic bins',
      status: 'open',
      physical_level: 'medium',
      required_skills: ['Waste Sorting', 'Leadership'],
      leader_needed: true,
      new_volunteers_allowed: false,
      required_headcount: 5,
      assigned_count: 2,
      remaining: 3,
    },
  ];

  const mockUserApp: VolunteerApplicationDto = {
    id: 88,
    event_id: 101,
    event_title: 'Yangon River Cleanup Initiative',
    event_status: 'active',
    post_id: 501,
    post_title: 'Waste Sorting Team Leader',
    source: 'browse',
    status: 'accepted',
    applied_at: '2026-11-20T10:00:00+06:30',
    decided_at: '2026-11-21T10:00:00+06:30',
    note: 'Experienced with recycling coordination',
  };

  beforeEach(() => {
    queryCache.clearAll();
    memoryStore = new MemoryTokenStore();
    testSessionMgr = new SessionManager(memoryStore);
    testClient = new ApiClient(undefined, memoryStore, testSessionMgr);
    eventRepo = new HttpEventRepository(testClient);
    dashboardRepo = new HttpDashboardRepository(testClient);
    profileRepo = new HttpProfileRepository(testClient);
    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
      root = null;
    }
    await memoryStore.clearToken();
    jest.restoreAllMocks();
  });

  describe('1. Public Event Feed & Filters (GET /api/v1/events/, GET /api/v1/charity-fields/)', () => {
    it('unwraps PaginatedResponseDto results and maps to domain EventSummary', async () => {
      jest.spyOn(eventApi, 'getEvents').mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          count: 1,
          next: null,
          previous: null,
          results: [mockPublicEventDto],
        },
      });

      const events = await eventRepo.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].id).toBe('101');
      expect(events[0].title).toBe('Yangon River Cleanup Initiative');
      expect(events[0].charityFields).toEqual(['environment', 'cleaning']);
      expect(events[0].mealsProvided).toBe(true);
      expect(events[0].spotsRemaining).toBe(15);
    });

    it('strictly maps EventFilters to allow-listed BFF query parameters', async () => {
      const getEventsSpy = jest.spyOn(eventApi, 'getEvents').mockResolvedValue({
        ok: true,
        status: 200,
        data: { count: 1, next: null, previous: null, results: [mockPublicEventDto] },
      });

      // Filter with single status ('active') and rich criteria
      await eventRepo.getEvents({
        query: '  Cleanup  ',
        charityFieldCodes: ['environment', 'cleaning'],
        statuses: ['active'],
        mealsProvided: true,
        lodgingProvided: true,
        travelSupportProvided: true,
        startAfter: '2026-12-01T00:00:00Z',
        endBefore: '2026-12-02T00:00:00Z',
      });

      expect(getEventsSpy).toHaveBeenCalledWith(
        {
          search: 'Cleanup',
          charity_field: 'environment,cleaning',
          status: 'active',
          meals_provided: 'true',
          lodging_provided: 'true',
          travel_support_provided: 'true',
          starts_after: '2026-12-01T00:00:00Z',
          starts_before: '2026-12-02T00:00:00Z',
        },
        testClient,
      );
    });

    it('omits status parameter when statuses length is 0 or 2 (published and active)', async () => {
      const getEventsSpy = jest.spyOn(eventApi, 'getEvents').mockResolvedValue({
        ok: true,
        status: 200,
        data: { count: 0, next: null, previous: null, results: [] },
      });

      // When length is 2 (both published and active), status must be omitted
      await eventRepo.getEvents({
        statuses: ['published', 'active'],
      });

      expect(getEventsSpy).toHaveBeenCalledWith({}, testClient);

      // When length is 0, status must also be omitted
      await eventRepo.getEvents({
        statuses: [],
      });

      expect(getEventsSpy).toHaveBeenCalledWith({}, testClient);
    });

    it('fetches and unwraps active charity fields taxonomy', async () => {
      const mockFields: CharityFieldDto[] = [
        { code: 'education', label: 'Education', sort_order: 10 },
        { code: 'environment', label: 'Environment', sort_order: 20 },
      ];

      jest.spyOn(eventApi, 'getCharityFields').mockResolvedValue({
        ok: true,
        status: 200,
        data: mockFields,
      });

      const fields = await eventRepo.getCharityFields();
      expect(fields).toHaveLength(2);
      expect(fields[0].code).toBe('education');
      expect(fields[1].label).toBe('Environment');
    });

    it('throws descriptive error when getEvents API fails', async () => {
      jest.spyOn(eventApi, 'getEvents').mockResolvedValue({
        ok: false,
        status: 500,
        error: { kind: 'server', code: 'server_error', message: 'Database connection failed' },
      });

      await expect(eventRepo.getEvents()).rejects.toThrow('Failed to load events: Database connection failed');
    });
  });

  describe('2. Public Event Detail & Posts (GET /api/v1/events/{id}/, GET /api/v1/events/{id}/posts/)', () => {
    it('composes event detail, open posts, and user application when authenticated', async () => {
      await memoryStore.setToken('valid-auth-token-123');

      const detailDto: PublicEventDetailDto = {
        ...mockPublicEventDto,
        onboarding_text: 'Welcome! Please bring rubber boots and gloves.',
        compensation_note: 'Travel stipend of 5000 MMK provided at end of shift.',
        posts: mockPosts,
      };

      jest.spyOn(eventApi, 'getEventDetail').mockResolvedValue({
        ok: true,
        status: 200,
        data: detailDto,
      });

      jest.spyOn(eventApi, 'getEventPosts').mockResolvedValue({
        ok: true,
        status: 200,
        data: mockPosts,
      });

      const myAppsSpy = jest.spyOn(eventApi, 'getMyApplications').mockResolvedValue({
        ok: true,
        status: 200,
        data: { results: [mockUserApp] },
      });

      const detail = await eventRepo.getEventById('101');
      expect(detail).not.toBeNull();
      expect(detail!.id).toBe('101');
      expect(detail!.title).toBe('Yangon River Cleanup Initiative');
      expect(detail!.posts).toHaveLength(1);
      expect(detail!.posts[0].title).toBe('Waste Sorting Team Leader');

      // Verified authenticated application binding
      expect(myAppsSpy).toHaveBeenCalledWith({ event_id: '101' }, testClient);
      expect(detail!.userApplication).not.toBeNull();
      expect(detail!.userApplication?.id).toBe('88');
      expect(detail!.userApplication?.status).toBe('accepted');

      // Verified T2 fields mapped
      expect(detail!.onboardingText).toBe('Welcome! Please bring rubber boots and gloves.');
      expect(detail!.compensationNote).toBe('Travel stipend of 5000 MMK provided at end of shift.');
    });

    it('skips me/applications/ query when unauthenticated to prevent 401', async () => {
      // No token stored -> unauthenticated
      const detailDto: PublicEventDetailDto = {
        ...mockPublicEventDto,
        posts: mockPosts,
      };

      jest.spyOn(eventApi, 'getEventDetail').mockResolvedValue({
        ok: true,
        status: 200,
        data: detailDto,
      });

      jest.spyOn(eventApi, 'getEventPosts').mockResolvedValue({
        ok: true,
        status: 200,
        data: mockPosts,
      });

      const myAppsSpy = jest.spyOn(eventApi, 'getMyApplications');

      const detail = await eventRepo.getEventById('101');
      expect(detail).not.toBeNull();
      expect(myAppsSpy).not.toHaveBeenCalled();
      expect(detail!.userApplication).toBeNull();
    });

    it('returns null when event does not exist (HTTP 404)', async () => {
      jest.spyOn(eventApi, 'getEventDetail').mockResolvedValue({
        ok: false,
        status: 404,
        error: { kind: 'notFound', code: 'not_found', message: 'Event not found' },
      });

      jest.spyOn(eventApi, 'getEventPosts').mockResolvedValue({
        ok: false,
        status: 404,
        error: { kind: 'notFound', code: 'not_found', message: 'Event not found' },
      });

      const detail = await eventRepo.getEventById('999999');
      expect(detail).toBeNull();
    });

    it('omits T2 fields when masked or not returned by BFF', async () => {
      const detailDto: PublicEventDetailDto = {
        ...mockPublicEventDto,
        onboarding_text: null,
        compensation_note: null,
        posts: mockPosts,
      };

      jest.spyOn(eventApi, 'getEventDetail').mockResolvedValue({
        ok: true,
        status: 200,
        data: detailDto,
      });

      jest.spyOn(eventApi, 'getEventPosts').mockResolvedValue({
        ok: true,
        status: 200,
        data: mockPosts,
      });

      const detail = await eventRepo.getEventById('101');
      expect(detail!.onboardingText).toBeUndefined();
      expect(detail!.compensationNote).toBeUndefined();
    });
  });

  describe('3. Volunteer Dashboard (GET /api/v1/me/assignments/, /attendance/, /feedback/)', () => {
    const mockAssignments: VolunteerAssignmentDto[] = [
      {
        id: 301,
        event_id: 101,
        event_title: 'Yangon River Cleanup Initiative',
        event_status: 'active',
        post_id: 501,
        post_title: 'Waste Sorting Team Leader',
        group_code: null,
        is_group_leader: false,
        status: 'confirmed',
        schedule_start: '2026-12-01T08:00:00+06:30',
        schedule_end: '2026-12-01T12:00:00+06:30',
        confirmed_at: '2026-11-15T00:00:00Z',
      },
    ];

    const mockAttendance: AttendanceHistoryItemDto[] = [
      {
        id: 401,
        event_id: 99,
        event_title: 'Downtown Tree Planting',
        post_title: 'Planter',
        status: 'completed',
        method: 'qr_scanner',
        confirmation_status: 'confirmed',
        checkin_at: '2026-11-10T08:00:00Z',
        checkout_at: '2026-11-10T12:30:00Z',
        verified_hours: 4.5,
        location_name: 'Maha Bandula Park',
      },
      {
        id: 402,
        event_id: 98,
        event_title: 'Library Book Restoration',
        post_title: 'Book Sorter',
        status: 'completed',
        method: 'manual',
        confirmation_status: 'confirmed',
        checkin_at: '2026-11-05T09:00:00Z',
        checkout_at: '2026-11-05T12:00:00Z',
        verified_hours: 3.0,
        location_name: 'Yangon Public Library',
      },
      {
        id: 403,
        event_id: 97,
        event_title: 'Cancelled Flood Relief Event',
        post_title: 'Relief Worker',
        status: 'cancelled',
        method: null,
        confirmation_status: null,
        checkin_at: null,
        checkout_at: null,
        verified_hours: 0,
        location_name: 'Relief Camp',
      },
    ];

    const mockFeedback: FeedbackSummaryResponseDto = {
      results: [],
      summary: {
        volunteer_avg_rating: 4.9,
        volunteer_rating_count: 8,
        coordinator_avg_rating: null,
        coordinator_rating_count: 0,
        overall_avg_rating: 4.9,
        total_count: 8,
      },
    };

    it('composes assignments, completed attendance records, and feedback into DashboardSummary', async () => {
      jest.spyOn(eventApi, 'getMyAssignments').mockResolvedValue({
        ok: true,
        status: 200,
        data: { results: mockAssignments },
      });

      jest.spyOn(profileApi, 'getAttendanceHistory').mockResolvedValue({
        ok: true,
        status: 200,
        data: { results: mockAttendance },
      });

      jest.spyOn(profileApi, 'getFeedbackSummary').mockResolvedValue({
        ok: true,
        status: 200,
        data: mockFeedback,
      });

      const summary = await dashboardRepo.getDashboardSummary();
      expect(summary.upcomingCommitments).toHaveLength(1);
      expect(summary.upcomingCommitmentCount).toBe(1);

      // Only status === 'completed' attendance records must be mapped
      expect(summary.recentCompletedActivities).toHaveLength(2);
      expect(summary.completedShiftCount).toBe(2);
      expect(summary.recentCompletedActivities[0].verifiedHours).toBe(4.5);
      expect(summary.recentCompletedActivities[1].verifiedHours).toBe(3.0);
      expect(summary.ratingAverage).toBe(4.9);
      expect(summary.ratingCount).toBe(8);
    });

    it('DashboardScreen renders sum of verified hours in hero subtitle', async () => {
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

      jest.spyOn(eventApi, 'getMyAssignments').mockResolvedValue({
        ok: true,
        status: 200,
        data: { results: mockAssignments },
      });

      jest.spyOn(profileApi, 'getAttendanceHistory').mockResolvedValue({
        ok: true,
        status: 200,
        data: { results: mockAttendance },
      });

      jest.spyOn(profileApi, 'getFeedbackSummary').mockResolvedValue({
        ok: true,
        status: 200,
        data: mockFeedback,
      });

      await act(async () => {
        root = ReactTestRenderer.create(
          renderWithProviders(
            <DashboardScreen
              repository={dashboardRepo}
              navigation={createMockNavigation()}
              route={{} as any}
            />,
            mockContext,
          ),
        );
      });

      const str = safeStringify(root!.toJSON());
      // 4.5 + 3.0 = 7.5 hours given
      expect(str).toContain('7.5 hours given');
    }, 15000);
  });

  describe('4. My Applications & My Assignments', () => {
    it('getUserApplications unwraps results and maps VolunteerApplicationItem[]', async () => {
      jest.spyOn(eventApi, 'getMyApplications').mockResolvedValue({
        ok: true,
        status: 200,
        data: { results: [mockUserApp] },
      });

      const apps = await eventRepo.getUserApplications();
      expect(apps).toHaveLength(1);
      expect(apps[0].id).toBe('88');
      expect(apps[0].eventId).toBe('101');
      expect(apps[0].eventTitle).toBe('Yangon River Cleanup Initiative');
      expect(apps[0].postTitle).toBe('Waste Sorting Team Leader');
      expect(apps[0].status).toBe('accepted');
    });

    it('getUserAssignments unwraps results and maps VolunteerAssignmentItem[]', async () => {
      const mockAssignment: VolunteerAssignmentDto = {
        id: 701,
        event_id: 101,
        event_title: 'Yangon River Cleanup Initiative',
        event_status: 'active',
        post_id: 501,
        post_title: 'Waste Sorting Team Leader',
        group_code: null,
        is_group_leader: false,
        status: 'confirmed',
        schedule_start: '2026-12-01T08:00:00+06:30',
        schedule_end: '2026-12-01T12:00:00+06:30',
        confirmed_at: '2026-11-15T00:00:00Z',
      };

      jest.spyOn(eventApi, 'getMyAssignments').mockResolvedValue({
        ok: true,
        status: 200,
        data: { results: [mockAssignment] },
      });

      const assignments = await eventRepo.getUserAssignments();
      expect(assignments).toHaveLength(1);
      expect(assignments[0].id).toBe('701');
      expect(assignments[0].eventId).toBe('101');
      expect(assignments[0].postTitle).toBe('Waste Sorting Team Leader');
      expect(assignments[0].status).toBe('confirmed');
    });
  });

  describe('5. My Profile, Eligibility & Verification Status (GET /api/v1/me/, /coordinator/, /verification-images/)', () => {
    const mockProfileDto: UserProfileDto = {
      id: 42,
      uuid: 'uuid-42',
      display_name: 'Daw Khin Thiri',
      phone: '+95912345678',
      preferred_language: 'my',
      home_area: 'Hledan, Yangon',
      emergency_contact_name: 'U Ba Myint',
      emergency_contact_phone: '+95998765432',
      blood_type: 'B+',
      is_willing_to_donate: true,
      is_willing_to_donate_blood: true,
      is_willing_to_donate_items: false,
      physical_ok: true,
      good_eyesight: true,
      needs_glasses: false,
      can_lift_heavy: false,
      can_work_outdoor: true,
      has_leader_experience: true,
      new_to_volunteer: false,
      skills: ['Teaching', 'First Aid'],
      needs_meal_support: false,
      needs_travel_support: true,
      accepts_unpaid: true,
      verification_status: 'verified',
      account_status: 'active',
      charity_interests: ['education'],
      created_at: '2025-01-01T00:00:00Z',
    };

    const mockCoordEnvelope: CoordinatorProfileEnvelopeDto = {
      coordinator: null,
    };

    const mockVerImages: VerificationStatusResponseDto = {
      verification_status: 'verified',
      images: [
        {
          id: 11,
          image_type: 'nrc_front',
          status: 'verified',
          is_current: true,
          reviewed_at: '2025-01-02T00:00:00Z',
          created_at: '2025-01-01T00:00:00Z',
        },
      ],
    };

    it('getProfile composes profile, coordinator status, feedback and charity interests', async () => {
      jest.spyOn(profileApi, 'getProfile').mockResolvedValue({
        ok: true,
        status: 200,
        data: mockProfileDto,
      });

      jest.spyOn(profileApi, 'getCoordinatorProfile').mockResolvedValue({
        ok: true,
        status: 200,
        data: mockCoordEnvelope,
      });

      jest.spyOn(profileApi, 'getFeedbackSummary').mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          results: [],
          summary: { overall_avg_rating: 4.8, total_count: 10 },
        },
      });

      jest.spyOn(profileApi, 'getCharityInterests').mockResolvedValue({
        ok: true,
        status: 200,
        data: { field_codes: ['education', 'environment'] },
      });

      const profile = await profileRepo.getProfile();
      expect(profile.displayName).toBe('Daw Khin Thiri');
      expect(profile.emergencyContactName).toBe('U Ba Myint');
      expect(profile.charityInterests).toEqual(['education', 'environment']);
      expect(profile.ratingAverage).toBe(4.8);
      expect(profile.coordinatorStatus).toBe('none');
    });

    it('getVerificationStatus composes verification status and coordinator record', async () => {
      jest.spyOn(profileApi, 'getVerificationStatus').mockResolvedValue({
        ok: true,
        status: 200,
        data: mockVerImages,
      });

      jest.spyOn(profileApi, 'getCoordinatorProfile').mockResolvedValue({
        ok: true,
        status: 200,
        data: mockCoordEnvelope,
      });

      const verData = await profileRepo.getVerificationStatus();
      expect(verData.verificationStatus).toBe('verified');
      expect(verData.canApplyForCoordinator).toBe(true);
      expect(verData.coordinatorStatus).toBe('none');
      expect(verData.imageSlots).toBeDefined();
    });

    it('getCoordinatorEligibility sets meets requirements = true when isVerified is true (Rule W34)', async () => {
      jest.spyOn(profileApi, 'getVerificationStatus').mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          verification_status: 'verified',
          images: [],
        },
      });

      jest.spyOn(profileApi, 'getCoordinatorProfile').mockResolvedValue({
        ok: true,
        status: 200,
        data: mockCoordEnvelope,
      });

      // Even if attendance count is 0, rule W34 specifies verified status alone permits applying
      jest.spyOn(profileApi, 'getAttendanceHistory').mockResolvedValue({
        ok: true,
        status: 200,
        data: { results: [] },
      });

      jest.spyOn(profileApi, 'getFeedbackSummary').mockResolvedValue({
        ok: true,
        status: 200,
        data: { results: [], summary: {} },
      });

      const eligibility = await profileRepo.getCoordinatorEligibility();
      expect(eligibility.isVerified).toBe(true);
      expect(eligibility.completedAttendanceEventsCount).toBe(0);
      expect(eligibility.meetsCompletedEventsRequirement).toBe(true);
      expect(eligibility.meetsGoodRatingRequirement).toBe(true);
    });

    it('getCoordinatorEligibility evaluates event count and rating when unverified', async () => {
      jest.spyOn(profileApi, 'getVerificationStatus').mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          verification_status: 'unverified',
          images: [],
        },
      });

      jest.spyOn(profileApi, 'getCoordinatorProfile').mockResolvedValue({
        ok: true,
        status: 200,
        data: mockCoordEnvelope,
      });

      jest.spyOn(profileApi, 'getAttendanceHistory').mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          results: [
            {
              id: 1,
              event_id: 10,
              event_title: 'E1',
              post_title: 'P1',
              status: 'completed',
              method: 'manual',
              confirmation_status: 'confirmed',
              checkin_at: '2026-11-01T00:00:00Z',
              checkout_at: '2026-11-01T03:00:00Z',
              verified_hours: 3,
              location_name: 'L1',
            },
          ],
        },
      });

      jest.spyOn(profileApi, 'getFeedbackSummary').mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          results: [],
          summary: { volunteer_avg_rating: 3.5, volunteer_rating_count: 2 },
        },
      });

      const eligibility = await profileRepo.getCoordinatorEligibility();
      expect(eligibility.isVerified).toBe(false);
      expect(eligibility.completedAttendanceEventsCount).toBe(1);
      expect(eligibility.meetsCompletedEventsRequirement).toBe(false); // 1 < 5
      expect(eligibility.meetsGoodRatingRequirement).toBe(false); // 3.5 < 4.0
    });
  });

  describe('6. My Availability (GET /api/v1/me/availability/)', () => {
    it('getAvailability queries me/availability/ and maps rules and exceptions', async () => {
      const mockAvailDto: AvailabilityResponseDto = {
        rules: [
          {
            id: 101,
            weekday: 6, // Saturday
            start_time: '08:00:00',
            end_time: '14:00:00',
          },
        ],
        exceptions: [
          {
            id: 201,
            date: '2026-12-25',
            start_time: '00:00:00',
            end_time: '23:59:59',
            is_available: false,
            note: 'Christmas holiday',
          },
        ],
      };

      jest.spyOn(profileApi, 'getAvailability').mockResolvedValue({
        ok: true,
        status: 200,
        data: mockAvailDto,
      });

      const avail = await profileRepo.getAvailability();
      expect(avail.weeklyRules).toHaveLength(1);
      expect(avail.weeklyRules[0].weekday).toBe(6);
      expect(avail.weeklyRules[0].weekdayName).toBe('Saturday');
      expect(avail.weeklyRules[0].startTime).toBe('08:00');
      expect(avail.weeklyRules[0].endTime).toBe('14:00');

      expect(avail.exceptions).toHaveLength(1);
      expect(avail.exceptions[0].date).toBe('2026-12-25');
      expect(avail.exceptions[0].isAvailable).toBe(false);
      expect(avail.exceptions[0].note).toBe('Christmas holiday');
    });
  });
});
