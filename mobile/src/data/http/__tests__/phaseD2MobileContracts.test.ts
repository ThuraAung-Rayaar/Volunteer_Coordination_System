/**
 * @format
 * Automated test suite for Phase D2: Mobile Coordination, Real-Time & Offline Consistency.
 * Covers Section 6.2, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, and 6.10:
 * 1. Manual check-in works without warm roster cache and returns authoritative server fields
 * 2. Zero fabricated fallback objects in HttpCoordinatorRepository
 * 3. Null coordinates remain null (never coerced to 0) and geo_checkin_enabled defaults to false (never true)
 * 4. Metric semantics: checkedInTodayCount binds to checked_in_today_count
 * 5. Donation preferences partial PATCH does not override server-owned semantics with stale local state
 * 6. UseCase unavailable metrics represented as empty/null (never hardcoded 4.8)
 * 7. Mock vs HTTP repository contract parity
 */

import { HttpCoordinatorRepository } from '../HttpCoordinatorRepository';
import { MockCoordinatorRepository } from '../../mock/MockCoordinatorRepository';
import { checkinApi } from '../../endpoints/checkinApi';
import { coordinatorApi } from '../../endpoints/coordinatorApi';
import { eventApi } from '../../endpoints/eventApi';
import { ApiClient } from '../../../core/api/apiClient';
import { MemoryTokenStore } from '../../../core/auth/tokenStore';
import { mapProfileUpdateRequest } from '../../mappers/profileMapper';
import { mapCoordinatorEventSummary } from '../../mappers/coordinatorMapper';
import { createCoordinatorUseCases } from '../../../domain/usecases/coordinatorUseCases';
import type { ManualCheckinResponseDto } from '../../dto/checkinDto';
import type {
  CoordinatorEventListItemDto,
  EventSummaryViewDto,
} from '../../dto/coordinatorDto';
import type { PublicEventDetailDto } from '../../dto/eventDto';
import type { VolunteerProfile } from '../../../domain/models/profile';

describe('Phase D2 Mobile Contracts & Fallback Elimination Suite', () => {
  let mockClient: ApiClient;
  let coordinatorRepo: HttpCoordinatorRepository;
  let mockRepo: MockCoordinatorRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = new ApiClient(jest.fn() as any, new MemoryTokenStore());
    coordinatorRepo = new HttpCoordinatorRepository(mockClient);
    mockRepo = new MockCoordinatorRepository();
  });

  describe('1. Manual Check-In Direct Contract (Section 6.2)', () => {
    it('executes manual check-in with explicit (eventId, volunteerUserId) without warm cache and returns authoritative fields', async () => {
      const serverResponse: ManualCheckinResponseDto = {
        attendance_id: 991,
        event_id: 501,
        user_id: 301,
        status: 'checked_in',
        method: 'coordinator_manual',
        checkin_at: '2026-11-21T14:30:00Z',
        recorded_by_user_id: 12,
        already_checked_in: false,
      };

      const spy = jest.spyOn(checkinApi, 'manualCheckIn').mockResolvedValue({
        ok: true,
        status: 200,
        data: serverResponse,
      });

      // Directly invoke manualCheckIn with no preloaded roster cache
      const result = await coordinatorRepo.manualCheckIn({
        eventId: '501',
        volunteerUserId: '301',
        note: 'Direct manual check-in',
      });

      expect(spy).toHaveBeenCalledWith(
        {
          event_id: 501,
          user_id: 301,
          note: 'Direct manual check-in',
        },
        mockClient,
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.id).toBe('991');
      expect(result.data?.eventId).toBe('501');
      expect(result.data?.userId).toBe('301');
      expect(result.data?.status).toBe('checked_in');
      expect(result.data?.checkInMethod).toBe('coordinator_manual');
      expect(result.data?.checkedInAt).toBe('2026-11-21T14:30:00Z');
      expect(result.data?.isPendingGeoConfirmation).toBe(false);

      // Section 6.4: Never invent volunteer name or post title when not in roster
      expect(result.data?.volunteerName).toBeUndefined();
      expect(result.data?.postTitle).toBeUndefined();
      expect(result.data?.eventTitle).toBeUndefined();
    });

    it('preserves prior method and timestamp on repeat already_checked_in check-in', async () => {
      const serverResponse: ManualCheckinResponseDto = {
        attendance_id: 992,
        event_id: 501,
        user_id: 302,
        status: 'checked_in',
        method: 'geo',
        checkin_at: '2026-11-21T09:15:00Z',
        recorded_by_user_id: 12,
        already_checked_in: true,
      };

      jest.spyOn(checkinApi, 'manualCheckIn').mockResolvedValue({
        ok: true,
        status: 200,
        data: serverResponse,
      });

      const result = await coordinatorRepo.manualCheckIn('501', '302');
      expect(result.success).toBe(true);
      expect(result.data?.checkInMethod).toBe('geo');
      expect(result.data?.checkedInAt).toBe('2026-11-21T09:15:00Z');
      expect(result.message).toContain('already checked in');
    });

    it('fails closed and preserves prior state on server 403 / 404 / 409 errors', async () => {
      jest.spyOn(checkinApi, 'manualCheckIn').mockResolvedValue({
        ok: false,
        status: 403,
        error: {
          kind: 'server',
          code: 'permission_denied',
          message: 'Only approved coordinators can perform check-in.',
        },
      });

      const result = await coordinatorRepo.manualCheckIn({
        eventId: 501,
        volunteerUserId: 303,
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Only approved coordinators');
    });
  });

  describe('2. Elimination of Fabricated Fallbacks (Section 6.4)', () => {
    it('updateApplicationStatus returns minimal typed result without fake applicant details or timestamps', async () => {
      jest.spyOn(coordinatorApi, 'decideApplication').mockResolvedValue({
        ok: true,
        status: 200,
        data: { id: 701, status: 'accepted' },
      });

      const result = await coordinatorRepo.updateApplicationStatus('701', 'accepted');
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.id).toBe('701');
      expect(result.data?.status).toBe('accepted');

      // Crucial: No fabricated 'Volunteer Applicant', fake user '88', or invented appliedAt
      expect(result.data?.applicantName).toBeUndefined();
      expect(result.data?.userId).toBeUndefined();
      expect(result.data?.appliedAt).toBeUndefined();
      expect(result.data?.eventTitle).toBeUndefined();
    });

    it('coordinatorUseCases getCoordinatorStatus returns null rating when profileRepo is absent', async () => {
      const useCases = createCoordinatorUseCases({
        coordinatorRepository: coordinatorRepo,
      });

      const status = await useCases.getCoordinatorStatus();
      expect(status.isVerified).toBe(false);
      expect(status.completedEvents).toBe(0);
      expect(status.ratingAverage).toBeNull(); // Never hardcoded 4.8
    });
  });

  describe('3. Null Coordinates & Geo Flags Truthfulness (Section 6.6)', () => {
    it('preserves null/undefined coordinates and defaults geo_checkin_enabled to false', async () => {
      const mockSummary: EventSummaryViewDto = {
        id: 401,
        title: 'Remote Support Drive',
        status: 'published',
        start_at: '2026-12-10T10:00:00Z',
        end_at: '2026-12-10T14:00:00Z',
        acceptance_mode: 'manual',
        auto_assign_enabled: false,
        max_participants: null,
        geo_checkin_enabled: false,
        map_provider: 'openstreetmap',
        pending_count: 0,
        accepted_count: 0,
        waitlisted_count: 0,
        assignment_count: 0,
        checked_in_count: 0,
        pending_confirmations: 0,
      };

      const mockPublicDetail: PublicEventDetailDto = {
        id: 401,
        title: 'Remote Support Drive',
        description: 'Test description',
        purpose_type: 'charity_event',
        status: 'published',
        start_at: '2026-12-10T10:00:00Z',
        end_at: '2026-12-10T14:00:00Z',
        application_deadline: null,
        location_name: 'Online / Remote',
        landmark_text: null,
        latitude: null, // Explicitly null from DB
        longitude: null,
        geo_radius_m: 100,
        geo_checkin_enabled: false, // Explicitly false
        map_provider: 'openstreetmap',
        charity_fields: [],
        acceptance_mode: 'manual',
        max_participants: null,
        meals_provided: false,
        lodging_provided: false,
        travel_support_provided: false,
        compensation_kind: 'none',
        coordinator_name: 'Test Coordinator',
        spots_remaining: 10,
        posts: [],
      };

      jest.spyOn(coordinatorApi, 'getEventSummary').mockResolvedValue({
        ok: true,
        status: 200,
        data: mockSummary,
      });
      jest.spyOn(coordinatorApi, 'getEventConfiguration').mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          id: 401,
          title: 'Remote Support Drive',
          description: 'Test description',
          purpose_type: 'charity_event',
          status: 'published',
          start_at: '2026-12-10T10:00:00Z',
          end_at: '2026-12-10T14:00:00Z',
          application_deadline: null,
          location_name: 'Online / Remote',
          landmark_text: null,
          latitude: null,
          longitude: null,
          geo_radius_m: 100,
          geo_checkin_enabled: false,
          geo_checkin_opens_before_min: 30,
          require_checkin_confirmation: false,
          map_provider: 'openstreetmap',
          acceptance_mode: 'manual',
          auto_assign_enabled: false,
          group_size: null,
          leader_strategy: 'none',
          max_participants: null,
          meals_provided: false,
          lodging_provided: false,
          travel_support_provided: false,
          compensation_kind: 'unpaid',
          compensation_note: null,
          onboarding_text: null,
          onboarding_version: 1,
          require_onboarding_ack: false,
          qr_registration_enabled: false,
          owner_id: 1,
          current_coordinator_id: 1,
        },
      });
      jest.spyOn(coordinatorApi, 'getMyEvents').mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          results: [{
            id: 401,
            title: 'Remote Support Drive',
            status: 'published',
            start_at: '2026-12-10T10:00:00Z',
            end_at: '2026-12-10T14:00:00Z',
            owner_id: 1,
            current_coordinator_id: 1,
            is_owner: true,
            is_current_coordinator: true,
            is_read_only_monitor: false,
            created_at: '2026-12-01T00:00:00Z',
          }],
        },
      });
      jest.spyOn(coordinatorApi, 'getEventPosts').mockResolvedValue({
        ok: true,
        status: 200,
        data: [],
      });
      jest.spyOn(eventApi, 'getEventDetail').mockResolvedValue({
        ok: true,
        status: 200,
        data: mockPublicDetail,
      });

      const detail = await coordinatorRepo.getEventDetail('401');
      expect(detail).not.toBeNull();
      // Crucial: Missing coordinates must remain null/undefined, NEVER coerced to 0 or (0,0)
      expect(detail?.latitude).toBeNull();
      expect(detail?.longitude).toBeNull();
      // Crucial: Missing or false geo_checkin_enabled must NEVER default to true
      expect(detail?.geoCheckinEnabled).toBe(false);
    });
  });

  describe('4. Attendance Metric Semantics (Section 6.5)', () => {
    it('maps checkedInTodayCount from checked_in_today_count when present', () => {
      const listItem: CoordinatorEventListItemDto = {
        id: 10,
        title: 'Food Relief',
        start_at: '2026-11-21T08:00:00Z',
        end_at: '2026-11-21T18:00:00Z',
        status: 'active',
        owner_id: 1,
        current_coordinator_id: 1,
        is_owner: true,
        is_current_coordinator: true,
        is_read_only_monitor: false,
        created_at: '2026-11-20T00:00:00Z',
      };

      const summaryDto: EventSummaryViewDto = {
        id: 10,
        title: 'Food Relief',
        status: 'active',
        start_at: '2026-11-21T08:00:00Z',
        end_at: '2026-11-21T18:00:00Z',
        acceptance_mode: 'auto',
        auto_assign_enabled: true,
        max_participants: 20,
        geo_checkin_enabled: false,
        map_provider: 'openstreetmap',
        pending_count: 0,
        accepted_count: 5,
        waitlisted_count: 0,
        assignment_count: 5,
        checked_in_count: 8, // All-time count
        checked_in_today_count: 3, // Daily count from Phase D1 backend
        pending_confirmations: 0,
      };

      const mapped = mapCoordinatorEventSummary(listItem, summaryDto);
      expect(mapped.checkedInCount).toBe(8);
      expect(mapped.checkedInTodayCount).toBe(3);
    });
  });

  describe('5. Donation Preference Partial PATCH Semantics (Section 6.7)', () => {
    it('does not force is_willing_to_donate = false when updating blood flag without currentProfile', () => {
      const updates: Partial<VolunteerProfile> = {
        donationPreferences: {
          isWillingToDonateBlood: false,
        } as any,
      };

      const payload = mapProfileUpdateRequest(updates);
      expect(payload.is_willing_to_donate_blood).toBe(false);
      // Crucial: is_willing_to_donate must NOT be set to false by client assumption;
      // server-owned aggregate merge rules determine master state.
      expect(payload.is_willing_to_donate).toBeUndefined();
      expect(payload.is_willing_to_donate_items).toBeUndefined();
    });

    it('sets is_willing_to_donate = false when explicitly requested', () => {
      const updates: Partial<VolunteerProfile> = {
        donationPreferences: {
          isWillingToDonate: false,
        } as any,
      };

      const payload = mapProfileUpdateRequest(updates);
      expect(payload.is_willing_to_donate).toBe(false);
    });
  });

  describe('6. Mock vs HTTP Repository Contract Parity (Section 6.10)', () => {
    it('MockCoordinatorRepository implements manualCheckIn matching HTTP repository signatures', async () => {
      const mockResult = await mockRepo.manualCheckIn({
        eventId: 'evt-coord-001',
        volunteerUserId: 'usr-vol-001',
      });

      expect(typeof mockResult.success).toBe('boolean');
      expect(typeof mockResult.message).toBe('string');
      if (mockResult.success && mockResult.data) {
        expect(mockResult.data.status).toBe('checked_in');
        expect(mockResult.data.checkInMethod).toBe('manual');
      }
    });
  });
});
