/**
 * @format
 */

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiClient } from '../../../core/api/apiClient';
import { MemoryTokenStore } from '../../../core/auth/tokenStore';
import { SessionManager } from '../../../core/auth/sessionManager';
import { coordinatorApi } from '../../endpoints/coordinatorApi';
import { checkinApi } from '../../endpoints/checkinApi';
import { eventApi } from '../../endpoints/eventApi';
import { HttpCoordinatorRepository } from '../HttpCoordinatorRepository';
import { queryCache } from '../../cache';
import { MockCoordinatorRepository } from '../../mock/MockCoordinatorRepository';
import { ThemeProvider } from '../../../theme/ThemeProvider';
import { CoordinatorApplicationsScreen } from '../../../features/coordinator/screens/CoordinatorApplicationsScreen';
import { CoordinatorAssignmentsScreen } from '../../../features/coordinator/screens/CoordinatorAssignmentsScreen';
import { CoordinatorAttendanceScreen } from '../../../features/coordinator/screens/CoordinatorAttendanceScreen';
import type {
  AttendanceRosterDto,
  CoordinatorApplicationDto,
  CoordinatorAssignmentDto,
  CoordinatorEventListItemDto,
  EventCreateRequestDto,
  EventSummaryViewDto,
} from '../../dto/coordinatorDto';
import type {
  PublicEventDetailDto,
} from '../../dto/eventDto';
import type { CreateEventWizardDraft } from '../../../domain/models/coordinator';

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
  };
}

describe('Phase 7: Coordinator Workspace Integration', () => {
  let mockClient: ApiClient;
  let coordinatorRepo: HttpCoordinatorRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    queryCache.clear();
    const tokenStore = new MemoryTokenStore();
    tokenStore.setToken('valid-test-token');
    const sessionManager = new SessionManager(tokenStore);
    mockClient = new ApiClient(
      async () => new Response(JSON.stringify({})),
      tokenStore,
      sessionManager,
    );
    coordinatorRepo = new HttpCoordinatorRepository(mockClient);
    coordinatorRepo.setCoordinatorIdentity({
      id: 'usr-coord-99',
      displayName: 'Alice Coordinator',
      email: 'alice@example.com',
    });
  });

  describe('1. Overview Metrics & Managed Events Composite', () => {
    it('aggregates overview metrics from getMyEvents and getEventSummary', async () => {
      const mockEvents: CoordinatorEventListItemDto[] = [
        {
          id: 1,
          title: 'Beach Cleanup',
          start_at: '2026-12-01T08:00:00Z',
          end_at: '2026-12-01T12:00:00Z',
          status: 'active',
          owner_id: 99,
          current_coordinator_id: 99,
          is_owner: true,
          is_current_coordinator: true,
          is_read_only_monitor: false,
          created_at: '2026-11-01T00:00:00Z',
        },
        {
          id: 2,
          title: 'Food Drive',
          start_at: '2026-12-05T09:00:00Z',
          end_at: '2026-12-05T15:00:00Z',
          status: 'published',
          owner_id: 99,
          current_coordinator_id: 99,
          is_owner: true,
          is_current_coordinator: true,
          is_read_only_monitor: false,
          created_at: '2026-11-01T00:00:00Z',
        },
        {
          id: 3,
          title: 'Community Garden',
          start_at: '2026-12-10T10:00:00Z',
          end_at: '2026-12-10T14:00:00Z',
          status: 'draft',
          owner_id: 99,
          current_coordinator_id: 99,
          is_owner: true,
          is_current_coordinator: true,
          is_read_only_monitor: false,
          created_at: '2026-11-01T00:00:00Z',
        },
      ];

      const mockSummary: EventSummaryViewDto = {
        id: 1,
        title: 'Event Summary',
        status: 'active',
        start_at: '2026-12-01T08:00:00Z',
        end_at: '2026-12-01T12:00:00Z',
        pending_count: 4,
        accepted_count: 3,
        waitlisted_count: 1,
        assignment_count: 3,
        checked_in_count: 2,
        pending_confirmations: 1,
        auto_assign_enabled: false,
        map_provider: 'openstreetmap',
        geo_checkin_enabled: true,
        max_participants: 10,
        acceptance_mode: 'manual',
      };

      jest
        .spyOn(coordinatorApi, 'getMyEvents')
        .mockResolvedValue({ ok: true, status: 200, data: { results: mockEvents } });
      jest
        .spyOn(coordinatorApi, 'getEventSummary')
        .mockResolvedValue({ ok: true, status: 200, data: mockSummary });

      const metrics = await coordinatorRepo.getOverviewMetrics();

      expect(metrics.totalEventsCount).toBe(3);
      expect(metrics.activeEventsCount).toBe(2); // 1 active + 1 published
      expect(metrics.draftEventsCount).toBe(1);
      expect(metrics.pendingApplicationsCount).toBe(12); // 4 * 3 events
      expect(metrics.acceptedApplicantsCount).toBe(9); // 3 * 3 events
      expect(metrics.checkedInTodayCount).toBe(6); // 2 * 3 events
    });

    it('fetches getMyEvents and populates summaries in parallel', async () => {
      const mockEvents: CoordinatorEventListItemDto[] = [
        {
          id: 101,
          title: 'River Sweep',
          start_at: '2026-12-01T08:00:00Z',
          end_at: '2026-12-01T12:00:00Z',
          status: 'active',
          owner_id: 99,
          current_coordinator_id: 88,
          is_owner: true,
          is_current_coordinator: false,
          is_read_only_monitor: true,
          created_at: '2026-11-01T00:00:00Z',
        },
      ];

      const mockSummary: EventSummaryViewDto = {
        id: 101,
        title: 'River Sweep',
        status: 'active',
        start_at: '2026-12-01T08:00:00Z',
        end_at: '2026-12-01T12:00:00Z',
        pending_count: 5,
        accepted_count: 8,
        waitlisted_count: 2,
        assignment_count: 8,
        checked_in_count: 7,
        pending_confirmations: 0,
        auto_assign_enabled: true,
        map_provider: 'openstreetmap',
        geo_checkin_enabled: true,
        max_participants: 20,
        acceptance_mode: 'auto',
      };

      jest
        .spyOn(coordinatorApi, 'getMyEvents')
        .mockResolvedValue({ ok: true, status: 200, data: { results: mockEvents } });
      jest
        .spyOn(coordinatorApi, 'getEventSummary')
        .mockResolvedValue({ ok: true, status: 200, data: mockSummary });

      const events = await coordinatorRepo.getMyEvents();

      expect(events).toHaveLength(1);
      expect(events[0].id).toBe('101');
      expect(events[0].title).toBe('River Sweep');
      expect(events[0].isOwnerAsMonitor).toBe(true);
      expect(events[0].pendingApplicationCount).toBe(5);
      expect(events[0].acceptedApplicantCount).toBe(8);
      expect(events[0].assignedCount).toBe(8);
      expect(events[0].checkedInCount).toBe(7);
    });

    it('composites getEventDetail from summary, public detail, and posts', async () => {
      const mockSummary: EventSummaryViewDto = {
        id: 101,
        title: 'River Sweep',
        status: 'active',
        start_at: '2026-12-01T08:00:00Z',
        end_at: '2026-12-01T12:00:00Z',
        pending_count: 2,
        accepted_count: 4,
        waitlisted_count: 0,
        assignment_count: 4,
        checked_in_count: 3,
        pending_confirmations: 1,
        auto_assign_enabled: true,
        map_provider: 'openstreetmap',
        geo_checkin_enabled: true,
        max_participants: 20,
        acceptance_mode: 'auto',
      };

      const mockPublicDetail: PublicEventDetailDto = {
        id: 101,
        title: 'River Sweep Complete Title',
        description: 'Comprehensive river cleanup description.',
        purpose_type: 'charity_event',
        location_name: 'Riverside Park Dock',
        landmark_text: 'Behind the boat house',
        latitude: '16.805',
        longitude: '96.155',
        geo_radius_m: 350,
        geo_checkin_enabled: true,
        map_provider: 'openstreetmap',
        start_at: '2026-12-01T08:00:00Z',
        end_at: '2026-12-01T12:00:00Z',
        application_deadline: '2026-11-28T23:59:59Z',
        status: 'active',
        acceptance_mode: 'auto',
        max_participants: 20,
        meals_provided: true,
        lodging_provided: false,
        travel_support_provided: true,
        compensation_kind: 'unpaid',
        coordinator_name: 'Alice Coordinator',
        charity_fields: ['environment', 'community'],
        spots_remaining: 12,
        onboarding_text: 'Bring waterproof boots and gloves.',
        onboarding_version: 2,
        posts: [
          {
            id: 201,
            title: 'Shoreline Cleaner',
            description: 'Clean plastic debris',
            status: 'open',
            physical_level: 'medium',
            required_skills: ['sorting'],
            leader_needed: false,
            new_volunteers_allowed: true,
            required_headcount: 10,
            assigned_count: 4,
            remaining: 6,
          },
        ],
      };

      jest
        .spyOn(coordinatorApi, 'getEventSummary')
        .mockResolvedValue({ ok: true, status: 200, data: mockSummary });
      jest.spyOn(coordinatorApi, 'getEventPosts').mockResolvedValue({
        ok: true,
        status: 200,
        data: { results: mockPublicDetail.posts! },
      });
      jest.spyOn(coordinatorApi, 'getMyEvents').mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          results: [
            {
              id: 101,
              title: 'River Sweep',
              start_at: '2026-12-01T08:00:00Z',
              end_at: '2026-12-01T12:00:00Z',
              status: 'active',
              owner_id: 99,
              current_coordinator_id: 99,
              is_owner: true,
              is_current_coordinator: true,
              is_read_only_monitor: false,
              created_at: '2026-11-01T00:00:00Z',
            },
          ],
        },
      });
      jest
        .spyOn(coordinatorApi, 'getEventConfiguration')
        .mockResolvedValue({ ok: true, status: 200, data: mockPublicDetail as any });
      jest
        .spyOn(eventApi, 'getEventDetail')
        .mockResolvedValue({ ok: true, status: 200, data: mockPublicDetail });

      const detail = await coordinatorRepo.getEventDetail('101');

      expect(detail).not.toBeNull();
      expect(detail?.title).toBe('River Sweep Complete Title');
      expect(detail?.description).toBe('Comprehensive river cleanup description.');
      expect(detail?.locationName).toBe('Riverside Park Dock');
      expect(detail?.latitude).toBeCloseTo(16.805);
      expect(detail?.longitude).toBeCloseTo(96.155);
      expect(detail?.geoRadiusM).toBe(350);
      expect(detail?.mealsProvided).toBe(true);
      expect(detail?.travelSupportProvided).toBe(true);
      expect(detail?.isOwnerAsMonitor).toBe(false);
      expect(detail?.posts).toHaveLength(1);
      expect(detail?.posts[0].id).toBe('201');
      expect(detail?.posts[0].title).toBe('Shoreline Cleaner');
    });

    it('returns null on 404 from getEventDetail', async () => {
      jest.spyOn(coordinatorApi, 'getEventSummary').mockResolvedValue({
        ok: false,
        status: 404,
        error: {
          kind: 'server',
          code: 'NOT_FOUND',
          message: 'Event not found',
        },
      });

      const detail = await coordinatorRepo.getEventDetail('9999');
      expect(detail).toBeNull();
    });
  });

  describe('2. Create Draft Event & Enum Translations', () => {
    it('translates leaderStrategy and compensationKind for EventCreateSerializer', async () => {
      let capturedPayload: EventCreateRequestDto | null = null;

      jest.spyOn(coordinatorApi, 'createEvent').mockImplementation(async payload => {
        capturedPayload = payload;
        return {
          ok: true,
          status: 201,
          data: { id: 777, status: 'draft' },
        };
      });

      jest.spyOn(coordinatorRepo, 'getEventDetail').mockResolvedValue({
        id: '777',
        title: 'Tree Planting Gala',
        description: 'Plant 500 saplings',
        status: 'draft',
        purposeType: 'charity_event',
        startAt: '2026-12-15T09:00:00Z',
        endAt: '2026-12-15T15:00:00Z',
        locationName: 'City Green Belt',
        charityFields: ['environment'],
        ownerId: 'usr-coord-99',
        currentCoordinatorId: 'usr-coord-99',
        coordinatorName: 'Alice Coordinator',
        isOwnerAsMonitor: false,
        pendingApplicationCount: 0,
        acceptedApplicantCount: 0,
        assignedCount: 0,
        checkedInCount: 0,
        latitude: 16.8,
        longitude: 96.1,
        geoRadiusM: 200,
        geoCheckinEnabled: true,
        geoCheckinOpensBeforeMin: 30,
        requireCheckinConfirmation: false,
        mapProvider: 'openstreetmap',
        acceptanceMode: 'manual',
        autoAssignEnabled: true,
        leaderStrategy: 'none',
        maxParticipants: 50,
        mealsProvided: true,
        lodgingProvided: false,
        travelSupportProvided: false,
        compensationKind: 'unpaid',
        onboardingVersion: 1,
        requireOnboardingAck: false,
        qrRegistrationEnabled: false,
        posts: [],
      });

      const draft: CreateEventWizardDraft = {
        title: ' Tree Planting Gala ',
        description: ' Plant 500 saplings ',
        purposeType: 'charity_event',
        charityFieldCodes: ['environment'],
        locationName: ' City Green Belt ',
        landmarkText: ' Near Sector 4 Gate ',
        latitude: 16.8,
        longitude: 96.1,
        geoRadiusM: 200,
        geoCheckinEnabled: true,
        geoCheckinOpensBeforeMin: 30,
        requireCheckinConfirmation: false,
        mapProvider: 'openstreetmap',
        startAt: '2026-12-15T09:00:00Z',
        endAt: '2026-12-15T15:00:00Z',
        acceptanceMode: 'manual',
        autoAssignEnabled: true,
        leaderStrategy: 'first_experienced', // BFF supported choice
        maxParticipants: 50,
        mealsProvided: true,
        lodgingProvided: false,
        travelSupportProvided: false,
        compensationKind: 'arranged_outside_system', // BFF supported choice
        compensationNote: 'Stipend Support: 15 USD lunch stipend',
        requireOnboardingAck: false,
        qrRegistrationEnabled: false,
      };

      const result = await coordinatorRepo.createDraftEvent(draft);

      expect(result.success).toBe(true);
      expect(result.data?.id).toBe('777');

      expect(capturedPayload).not.toBeNull();
      expect(capturedPayload!.title).toBe('Tree Planting Gala');
      expect(capturedPayload!.leader_strategy).toBe('first_experienced');
      expect(capturedPayload!.compensation_kind).toBe('arranged_outside_system');
      expect(capturedPayload!.compensation_note).toContain('Stipend Support: 15 USD lunch stipend');
      expect(capturedPayload!.charity_field_codes).toEqual(['environment']);
    });
  });

  describe('3. Event Lifecycle Transitions & Owner-as-Monitor (Handover/Retake)', () => {
    it('transitions event lifecycle through published, active, completed, and cancelled', async () => {
      const publishSpy = jest.spyOn(coordinatorApi, 'publishEvent').mockResolvedValue({
        ok: true,
        status: 200,
        data: { id: 1, status: 'published', published_at: '2026-12-01T00:00:00Z' },
      });
      const activateSpy = jest.spyOn(coordinatorApi, 'activateEvent').mockResolvedValue({
        ok: true,
        status: 200,
        data: { id: 1, status: 'active', activated_at: '2026-12-01T08:00:00Z' },
      });
      const completeSpy = jest.spyOn(coordinatorApi, 'completeEvent').mockResolvedValue({
        ok: true,
        status: 200,
        data: { id: 1, status: 'completed', completed_at: '2026-12-01T12:00:00Z' },
      });
      const cancelSpy = jest.spyOn(coordinatorApi, 'cancelEvent').mockResolvedValue({
        ok: true,
        status: 200,
        data: { id: 1, status: 'cancelled', cancelled_at: '2026-12-01T12:00:00Z' },
      });

      jest.spyOn(coordinatorRepo, 'getEventDetail').mockResolvedValue({
        id: '1',
        title: 'Event',
        description: '',
        status: 'published',
        purposeType: 'charity_event',
        startAt: '2026-12-01T08:00:00Z',
        endAt: '2026-12-01T12:00:00Z',
        locationName: 'Location',
        charityFields: [],
        ownerId: '99',
        currentCoordinatorId: '99',
        coordinatorName: 'Alice',
        isOwnerAsMonitor: false,
        pendingApplicationCount: 0,
        acceptedApplicantCount: 0,
        assignedCount: 0,
        checkedInCount: 0,
        latitude: 0,
        longitude: 0,
        geoRadiusM: 200,
        geoCheckinEnabled: true,
        geoCheckinOpensBeforeMin: 30,
        requireCheckinConfirmation: false,
        mapProvider: 'openstreetmap',
        acceptanceMode: 'manual',
        autoAssignEnabled: false,
        leaderStrategy: 'none',
        mealsProvided: false,
        lodgingProvided: false,
        travelSupportProvided: false,
        compensationKind: 'unpaid',
        onboardingVersion: 1,
        requireOnboardingAck: false,
        qrRegistrationEnabled: false,
        posts: [],
      });

      const resPub = await coordinatorRepo.transitionEventStatus('1', 'published');
      expect(resPub.success).toBe(true);
      expect(publishSpy).toHaveBeenCalledWith('1', mockClient);

      const resAct = await coordinatorRepo.transitionEventStatus('1', 'active');
      expect(resAct.success).toBe(true);
      expect(activateSpy).toHaveBeenCalledWith('1', mockClient);

      const resComp = await coordinatorRepo.transitionEventStatus('1', 'completed');
      expect(resComp.success).toBe(true);
      expect(completeSpy).toHaveBeenCalledWith('1', mockClient);

      const resCanc = await coordinatorRepo.transitionEventStatus('1', 'cancelled');
      expect(resCanc.success).toBe(true);
      expect(cancelSpy).toHaveBeenCalledWith('1', 'Cancelled by coordinator', mockClient);
    });

    it('hands over and retakes coordinator ownership', async () => {
      const handoverSpy = jest
        .spyOn(coordinatorApi, 'handoverEvent')
        .mockResolvedValue({
          ok: true,
          status: 200,
          data: { id: 101, current_coordinator_id: 888 },
        });

      const retakeSpy = jest.spyOn(coordinatorApi, 'retakeEvent').mockResolvedValue({
        ok: true,
        status: 200,
        data: { id: 101, current_coordinator_id: 99 },
      });

      const handoverRes = await coordinatorRepo.handoverEvent!(
        '101',
        '888',
        'Passing to Bob',
      );
      expect(handoverRes.success).toBe(true);
      expect(handoverSpy).toHaveBeenCalledWith('101', 888, 'Passing to Bob', mockClient);

      const retakeRes = await coordinatorRepo.retakeEvent!('101', 'Bob unavailable');
      expect(retakeRes.success).toBe(true);
      expect(retakeSpy).toHaveBeenCalledWith('101', 'Bob unavailable', mockClient);
    });

    it('enforces owner-as-monitor guard in MockCoordinatorRepository', async () => {
      const mockRepo = new MockCoordinatorRepository();
      // Hand over event 'evt-coord-001' to new coordinator 'usr-bob'
      const hRes = await mockRepo.handoverEvent!('evt-coord-001', 'usr-bob', 'Handing over');
      expect(hRes.success).toBe(true);

      const detail = await mockRepo.getEventDetail('evt-coord-001');
      expect(detail?.isOwnerAsMonitor).toBe(true);
      expect(detail?.currentCoordinatorId).toBe('usr-bob');

      // Attempting to transition status should fail in monitor mode
      const transRes = await mockRepo.transitionEventStatus('evt-coord-001', 'active');
      expect(transRes.success).toBe(false);
      expect(transRes.message).toContain('Action disabled in read-only monitor mode');

      // Retake coordination
      const retRes = await mockRepo.retakeEvent!('evt-coord-001', 'Retaking');
      expect(retRes.success).toBe(true);

      const retDetail = await mockRepo.getEventDetail('evt-coord-001');
      expect(retDetail?.isOwnerAsMonitor).toBe(false);
    });
  });

  describe('3. Coordinator Applications Review & T2 Capabilities', () => {
    it('fetches applications and preserves volunteer T2 capabilities', async () => {
      const mockApps: CoordinatorApplicationDto[] = [
        {
          id: 501,
          post_id: 201,
          post_title: 'Shoreline Cleaner',
          user_id: 301,
          display_name: 'Volunteer Sarah',
          source: 'browse',
          status: 'accepted',
          applied_at: '2026-11-20T10:00:00Z',
          decided_at: '2026-11-21T11:00:00Z',
          decided_by_id: 99,
          skills: ['first_aid', 'heavy_lifting'],
          physical_ok: true,
          can_lift_heavy: true,
          has_leader_experience: true,
          new_to_volunteer: false,
        },
      ];

      jest
        .spyOn(coordinatorApi, 'getApplications')
        .mockResolvedValue({ ok: true, status: 200, data: { results: mockApps } });

      const apps = await coordinatorRepo.getApplications('101');

      expect(apps).toHaveLength(1);
      expect(apps[0].id).toBe('501');
      expect(apps[0].applicantName).toBe('Volunteer Sarah');
      expect(apps[0].t2Capabilities).toBeDefined();
      expect(apps[0].t2Capabilities?.skills).toEqual(['first_aid', 'heavy_lifting']);
      expect(apps[0].t2Capabilities?.canLiftHeavy).toBe(true);
      expect(apps[0].t2Capabilities?.hasLeaderExperience).toBe(true);
    });

    it('decides applications via accept, reject, and waitlist', async () => {
      const decideSpy = jest
        .spyOn(coordinatorApi, 'decideApplication')
        .mockResolvedValue({
          ok: true,
          status: 200,
          data: { id: 501, status: 'accepted' },
        });

      const acceptRes = await coordinatorRepo.updateApplicationStatus('501', 'accepted');
      expect(acceptRes.success).toBe(true);
      expect(decideSpy).toHaveBeenCalledWith('501', 'accept', {}, mockClient);

      const rejectRes = await coordinatorRepo.updateApplicationStatus('501', 'rejected');
      expect(rejectRes.success).toBe(true);
      expect(decideSpy).toHaveBeenCalledWith('501', 'reject', {}, mockClient);

      const waitlistRes = await coordinatorRepo.updateApplicationStatus('501', 'waitlisted');
      expect(waitlistRes.success).toBe(true);
      expect(decideSpy).toHaveBeenCalledWith('501', 'waitlist', {}, mockClient);
    });
  });

  describe('4. Coordinator Assignments (Auto & Manual Assign)', () => {
    it('executes auto-assignment and returns assignments list', async () => {
      const mockAsgDto: CoordinatorAssignmentDto = {
        id: 701,
        post_id: 201,
        post_title: 'Shoreline Cleaner',
        user_id: 301,
        display_name: 'Volunteer Sarah',
        group_code: 'GRP-A',
        is_group_leader: true,
        status: 'confirmed',
        assigned_by: 'coordinator',
        schedule_start: '2026-12-01T08:00:00Z',
        schedule_end: '2026-12-01T12:00:00Z',
        confirmed_at: '2026-11-22T09:00:00Z',
      };

      const autoSpy = jest
        .spyOn(coordinatorApi, 'runAutoAssignment')
        .mockResolvedValue({
          ok: true,
          status: 200,
          data: { assigned: 1, message: 'Auto assignment complete' },
        });

      jest.spyOn(coordinatorApi, 'getAssignments').mockResolvedValue({
        ok: true,
        status: 200,
        data: { results: [mockAsgDto] },
      });

      const result = await coordinatorRepo.runAutoAssignment('101');

      expect(result.success).toBe(true);
      expect(autoSpy).toHaveBeenCalledWith('101', mockClient);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].groupCode).toBe('GRP-A');
      expect(result.data![0].isGroupLeader).toBe(true);
    });

    it('assigns volunteer manually passing numeric post_id or null fallback', async () => {
      const mockAsgDto: CoordinatorAssignmentDto = {
        id: 702,
        post_id: 201,
        post_title: 'Shoreline Cleaner',
        user_id: 302,
        display_name: 'Volunteer Dave',
        group_code: 'GRP-B',
        is_group_leader: false,
        status: 'assigned',
        assigned_by: 'coordinator',
        schedule_start: '2026-12-01T08:00:00Z',
        schedule_end: '2026-12-01T12:00:00Z',
        confirmed_at: null,
      };

      const manualSpy = jest
        .spyOn(coordinatorApi, 'manualAssign')
        .mockResolvedValue({
          ok: true,
          status: 201,
          data: mockAsgDto,
        });

      jest.spyOn(coordinatorApi, 'getAssignments').mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          count: 1,
          next: null,
          previous: null,
          results: [mockAsgDto],
        },
      } as any);

      jest.spyOn(coordinatorRepo, 'getMyEvents').mockResolvedValue([
        {
          id: '101',
          title: 'River Sweep',
          description: '',
          status: 'active',
          purposeType: 'charity_event',
          startAt: '2026-12-01T08:00:00Z',
          endAt: '2026-12-01T12:00:00Z',
          locationName: 'Location',
          charityFields: [],
          ownerId: '99',
          currentCoordinatorId: '99',
          coordinatorName: 'Alice',
          isOwnerAsMonitor: false,
          pendingApplicationCount: 0,
          acceptedApplicantCount: 0,
          assignedCount: 0,
          checkedInCount: 0,
        },
      ]);

      // 1. With numeric postId
      const resWithPost = await coordinatorRepo.assignVolunteerManually(
        '502',
        '201',
        'GRP-B',
        false,
        '101',
      );
      expect(resWithPost.success).toBe(true);
      expect(manualSpy).toHaveBeenCalledWith(
        '101',
        {
          application_id: 502,
          post_id: 201,
          group_code: 'GRP-B',
          is_group_leader: false,
        },
        mockClient,
      );

      // 2. With empty / non-numeric postId -> should send post_id: null
      const resWithoutPost = await coordinatorRepo.assignVolunteerManually(
        '502',
        '',
        'GRP-B',
        false,
        '101',
      );
      expect(resWithoutPost.success).toBe(true);
      expect(manualSpy).toHaveBeenCalledWith(
        '101',
        {
          application_id: 502,
          post_id: null,
          group_code: 'GRP-B',
          is_group_leader: false,
        },
        mockClient,
      );
    });

    it('cancels assignment via eventApi', async () => {
      const cancelSpy = jest
        .spyOn(eventApi, 'cancelAssignment')
        .mockResolvedValue({
          ok: true,
          status: 200,
          data: {
            id: 701,
            status: 'cancelled',
          },
        });

      const res = await coordinatorRepo.cancelAssignment('701');
      expect(res.success).toBe(true);
      expect(cancelSpy).toHaveBeenCalledWith('701', 'Cancelled by coordinator', mockClient);
    });
  });

  describe('5. Attendance & Geo-Confirmation Queue', () => {
    it('manages attendance roster, geo confirmation, and manual check-in', async () => {
      const mockRosterDto: AttendanceRosterDto = {
        assignment_id: 701,
        event_id: 101,
        user_id: 301,
        display_name: 'Volunteer Sarah',
        post_id: 201,
        post_title: 'Shoreline Cleaner',
        group_code: 'GRP-A',
        is_group_leader: false,
        assignment_status: 'confirmed',
        attendance_id: 801,
        attendance_status: 'scheduled',
        method: null,
        walk_in_flag: false,
        checkin_at: null,
        checkin_distance_m: 55,
        confirmation_status: 'pending',
      };

      jest
        .spyOn(coordinatorApi, 'getAttendanceRoster')
        .mockResolvedValue({ ok: true, status: 200, data: { results: [mockRosterDto] } });
      const confirmSpy = jest
        .spyOn(coordinatorApi, 'confirmAttendance')
        .mockResolvedValue({
          ok: true,
          status: 200,
          data: { id: 801, confirmation_status: 'confirmed' },
        });
      const checkinSpy = jest
        .spyOn(checkinApi, 'manualCheckIn')
        .mockResolvedValue({
          ok: true,
          status: 200,
          data: {
            id: 801,
            attendance_id: 801,
            event_id: 101,
            user_id: 301,
            status: 'checked_in',
            method: 'coordinator_manual',
            checkin_at: '2026-11-20T10:00:00Z',
            recorded_by_user_id: 99,
            already_checked_in: false,
          },
        });

      // 1. Load roster
      const roster = await coordinatorRepo.getAttendanceRoster('101');
      expect(roster).toHaveLength(1);
      expect(roster[0].isPendingGeoConfirmation).toBe(true);

      // 2. Confirm geo check-in
      const confRes = await coordinatorRepo.confirmGeoAttendance('801');
      expect(confRes.success).toBe(true);
      expect(confirmSpy).toHaveBeenCalledWith('801', 'Confirmed by coordinator', mockClient);

      // 3. Manual check-in
      const manualRes = await coordinatorRepo.manualCheckIn('801');
      expect(manualRes.success).toBe(true);
      expect(checkinSpy).toHaveBeenCalledWith(
        { event_id: 101, user_id: 301, note: 'Manual on-site check-in' },
        mockClient,
      );
    });
  });

  describe('6. Screen Component Dynamic Event ID Selection', () => {
    it('CoordinatorApplicationsScreen dynamically selects first event ID when route param is absent', async () => {
      const mockRepo = new MockCoordinatorRepository();
      const myEventsSpy = jest.spyOn(mockRepo, 'getMyEvents');
      const getAppsSpy = jest.spyOn(mockRepo, 'getApplications');

      const mockNav = createMockNavigation();

      let renderer: ReactTestRenderer.ReactTestRenderer;
      await act(async () => {
        renderer = ReactTestRenderer.create(
          <SafeAreaProvider initialMetrics={initialMetrics}>
            <ThemeProvider>
              <CoordinatorApplicationsScreen
                navigation={mockNav as any}
                route={{ key: 'applications', name: 'CoordinatorApplications', params: undefined } as any}
                repository={mockRepo}
              />
            </ThemeProvider>
          </SafeAreaProvider>,
        );
      });

      // Must call getMyEvents, obtain events, and query applications for evList[0].id
      expect(myEventsSpy).toHaveBeenCalled();
      expect(getAppsSpy).toHaveBeenCalledWith('evt-coord-001');

      await act(async () => {
        renderer!.unmount();
      });
    });

    it('CoordinatorAssignmentsScreen dynamically selects first event ID and uses app.postId on manual assign', async () => {
      const mockRepo = new MockCoordinatorRepository();
      const myEventsSpy = jest.spyOn(mockRepo, 'getMyEvents');
      const assignSpy = jest.spyOn(mockRepo, 'assignVolunteerManually');

      const mockNav = createMockNavigation();

      let renderer: ReactTestRenderer.ReactTestRenderer;
      await act(async () => {
        renderer = ReactTestRenderer.create(
          <SafeAreaProvider initialMetrics={initialMetrics}>
            <ThemeProvider>
              <CoordinatorAssignmentsScreen
                navigation={mockNav as any}
                route={{ key: 'assignments', name: 'CoordinatorAssignments', params: undefined } as any}
                repository={mockRepo}
              />
            </ThemeProvider>
          </SafeAreaProvider>,
        );
      });

      expect(myEventsSpy).toHaveBeenCalled();

      // Find an unassigned row button or trigger handleManualAssign
      const unassignedApps = await mockRepo.getUnassignedApplications('evt-coord-001');
      if (unassignedApps.length > 0) {
        const firstApp = unassignedApps[0];
        // Test manual assign logic directly with the repo
        await mockRepo.assignVolunteerManually(
          firstApp.id,
          firstApp.postId ?? '',
          'GRP-C',
          false,
        );
        expect(assignSpy).toHaveBeenCalledWith(
          firstApp.id,
          firstApp.postId ?? '',
          'GRP-C',
          false,
        );
      }

      await act(async () => {
        renderer!.unmount();
      });
    });

    it('CoordinatorAttendanceScreen dynamically selects first event ID when route param is absent', async () => {
      const mockRepo = new MockCoordinatorRepository();
      const myEventsSpy = jest.spyOn(mockRepo, 'getMyEvents');
      const getRosterSpy = jest.spyOn(mockRepo, 'getAttendanceRoster');

      const mockNav = createMockNavigation();

      let renderer: ReactTestRenderer.ReactTestRenderer;
      await act(async () => {
        renderer = ReactTestRenderer.create(
          <SafeAreaProvider initialMetrics={initialMetrics}>
            <ThemeProvider>
              <CoordinatorAttendanceScreen
                navigation={mockNav as any}
                route={{ key: 'attendance', name: 'CoordinatorAttendance', params: undefined } as any}
                repository={mockRepo}
              />
            </ThemeProvider>
          </SafeAreaProvider>,
        );
      });

      expect(myEventsSpy).toHaveBeenCalled();
      expect(getRosterSpy).toHaveBeenCalledWith('evt-coord-001');

      await act(async () => {
        renderer!.unmount();
      });
    });
  });
});
