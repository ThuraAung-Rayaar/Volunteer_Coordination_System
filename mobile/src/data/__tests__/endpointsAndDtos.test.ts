/**
 * @format
 * Unit & Contract tests for Phase 3 Mobile Endpoint Clients and Wire DTOs.
 * Validates canonical /api/v1/ route paths, HTTP methods, payload serialization,
 * and strongly-typed DTO wire contracts for Volunteer & Coordinator capabilities.
 */

import { ApiClient, TransportAdapter } from '../../core/api/apiClient';
import { setApiConfig } from '../../core/api/apiConfig';
import { MemoryTokenStore } from '../../core/auth/tokenStore';
import { SessionManager } from '../../core/auth/sessionManager';
import { profileApi } from '../endpoints/profileApi';
import { coordinatorApi } from '../endpoints/coordinatorApi';
import { checkinApi } from '../endpoints/checkinApi';
import { eventApi } from '../endpoints/eventApi';
import type {
  AttendanceMethodDto,
  AttendanceStatusDto,
  ConfirmationStatusDto,
  LeaderStrategyDto,
  CompensationKindDto,
} from '../dto/commonDto';
import type {
  AvailabilityCheckResultDto,
  VerificationImageUploadResponseDto,
  UserUuidLookupDto,
  FeedbackSummaryResponseDto,
  AttendanceHistoryItemDto,
} from '../dto/profileDto';
import type {
  CoordinatorHistoryItemDto,
  CoordinatorInviteRequestDto,
  AutoAssignResultDto,
  ManualAssignResultDto,
  EventPostCapacityDto,
} from '../dto/coordinatorDto';
import type {
  GeoAttemptReviewDto,
  EventFeedbackItemDto,
  OnboardingAcknowledgeRequestDto,
  FeedbackSubmitRequestDto,
  ManualCheckinRequestDto,
} from '../dto/checkinDto';

describe('Phase 3 Mobile Endpoint Clients and Wire DTOs', () => {
  let memoryTokenStore: MemoryTokenStore;
  let sessionMgr: SessionManager;
  let capturedUrl: string;
  let capturedMethod: string;
  let capturedBody: any;
  let capturedHeaders: Record<string, string>;
  let mockClient: ApiClient;

  beforeEach(() => {
    setApiConfig({
      baseUrl: 'http://10.0.2.2:8000',
      apiPrefix: '/api/v1',
      defaultTimeoutMs: 5000,
    });
    memoryTokenStore = new MemoryTokenStore();
    sessionMgr = new SessionManager(memoryTokenStore);
    capturedUrl = '';
    capturedMethod = '';
    capturedBody = null;
    capturedHeaders = {};

    const mockTransport: TransportAdapter = async (input, init) => {
      capturedUrl = input;
      capturedMethod = init?.method || 'GET';
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      if (init?.body) {
        if (typeof init.body === 'string') {
          try {
            capturedBody = JSON.parse(init.body);
          } catch {
            capturedBody = init.body;
          }
        } else {
          capturedBody = init.body;
        }
      } else {
        capturedBody = null;
      }

      return new Response(JSON.stringify({ success: true, results: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    mockClient = new ApiClient(mockTransport, memoryTokenStore, sessionMgr);
  });

  // =========================================================================
  // Section 1: Profile & Volunteer Endpoints (V-08, V-11, V-12, V-13, V-17, V-18, V-38, V-41)
  // =========================================================================
  describe('profileApi', () => {
    it('V-08: replaceAvailabilityRules calls POST /me/availability/rules/', async () => {
      const payload = {
        rules: [
          { weekday: 1, start_time: '09:00:00', end_time: '17:00:00' },
        ],
      };
      const res = await profileApi.replaceAvailabilityRules(payload, mockClient);

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe('http://10.0.2.2:8000/api/v1/me/availability/rules/');
      expect(capturedMethod).toBe('POST');
      expect(capturedBody).toEqual(payload);
    });

    it('V-11: checkEventAvailability calls GET /me/availability/check/?event_id={id}', async () => {
      const res = await profileApi.checkEventAvailability(101, mockClient);

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe('http://10.0.2.2:8000/api/v1/me/availability/check/?event_id=101');
      expect(capturedMethod).toBe('GET');
    });

    it('V-12: checkWindowAvailability calls POST /me/availability/check/', async () => {
      const payload = {
        start_at: '2026-12-01T08:00:00Z',
        end_at: '2026-12-01T12:00:00Z',
      };
      const res = await profileApi.checkWindowAvailability(payload, mockClient);

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe('http://10.0.2.2:8000/api/v1/me/availability/check/');
      expect(capturedMethod).toBe('POST');
      expect(capturedBody).toEqual(payload);
    });

    it('V-13: uploadVerificationImage calls POST /me/verification-images/ via multipart', async () => {
      const formData = new FormData();
      formData.append('image_type', 'face');
      const res = await profileApi.uploadVerificationImage(formData, mockClient);

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe('http://10.0.2.2:8000/api/v1/me/verification-images/');
      expect(capturedMethod).toBe('POST');
      expect(capturedBody).toBe(formData);
    });

    it('V-17 / C-03: updateCoordinatorApplicationNotes calls PATCH /me/coordinator/', async () => {
      const res = await profileApi.updateCoordinatorApplicationNotes('Experienced lead', mockClient);

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe('http://10.0.2.2:8000/api/v1/me/coordinator/');
      expect(capturedMethod).toBe('PATCH');
      expect(capturedBody).toEqual({ notes: 'Experienced lead' });
    });

    it('V-18 / C-29: lookupUserByUuid calls GET /users/by-uuid/{uuid}/ with optional event_id', async () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000';
      const res = await profileApi.lookupUserByUuid(uuid, 101, mockClient);

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe(
        `http://10.0.2.2:8000/api/v1/users/by-uuid/${uuid}/?event_id=101`,
      );
      expect(capturedMethod).toBe('GET');
    });

    it('V-38: getAttendanceHistory calls canonical GET /checkin/me/attendance/', async () => {
      const res = await profileApi.getAttendanceHistory(mockClient);

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe('http://10.0.2.2:8000/api/v1/checkin/me/attendance/');
      expect(capturedMethod).toBe('GET');
    });

    it('V-41: getFeedbackSummary calls canonical GET /checkin/me/feedback/', async () => {
      const res = await profileApi.getFeedbackSummary(mockClient);

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe('http://10.0.2.2:8000/api/v1/checkin/me/feedback/');
      expect(capturedMethod).toBe('GET');
    });
  });

  // =========================================================================
  // Section 2: Event Endpoints (V-20, V-21)
  // =========================================================================
  describe('eventApi', () => {
    it('V-20 / V-21: getEvents supports page_size and sort query params', async () => {
      const res = await eventApi.getEvents(
        { page_size: 25, sort: '-start_at', upcoming: true },
        mockClient,
      );

      expect(res.ok).toBe(true);
      expect(capturedUrl).toContain('page_size=25');
      expect(capturedUrl).toContain('sort=-start_at');
      expect(capturedUrl).toContain('upcoming=true');
      expect(capturedMethod).toBe('GET');
    });
  });

  // =========================================================================
  // Section 3: Coordinator Endpoints (C-08, C-09, C-10, C-18, C-23, C-24, C-25, C-28, C-30)
  // =========================================================================
  describe('coordinatorApi', () => {
    it('C-08: createEventPost calls POST /coordinator/events/{id}/posts/', async () => {
      const payload = {
        title: 'Water Station Lead',
        required_headcount: 5,
        can_lift_heavy: true,
      };
      const res = await coordinatorApi.createEventPost(101, payload, mockClient);

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe('http://10.0.2.2:8000/api/v1/coordinator/events/101/posts/');
      expect(capturedMethod).toBe('POST');
      expect(capturedBody).toEqual(payload);
    });

    it('C-09: updateEventPost calls PATCH /posts/{id}/', async () => {
      const payload: { required_headcount: number; status: 'open' } = { required_headcount: 8, status: 'open' };
      const res = await coordinatorApi.updateEventPost(501, payload, mockClient);

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe('http://10.0.2.2:8000/api/v1/posts/501/');
      expect(capturedMethod).toBe('PATCH');
      expect(capturedBody).toEqual(payload);
    });

    it('C-10: closeEventPost calls POST /posts/{id}/close/', async () => {
      const res = await coordinatorApi.closeEventPost(501, mockClient);

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe('http://10.0.2.2:8000/api/v1/posts/501/close/');
      expect(capturedMethod).toBe('POST');
      expect(capturedBody).toEqual({});
    });

    it('C-18: getCoordinatorHistory calls GET /coordinator/events/{id}/history/', async () => {
      const res = await coordinatorApi.getCoordinatorHistory(101, mockClient);

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe('http://10.0.2.2:8000/api/v1/coordinator/events/101/history/');
      expect(capturedMethod).toBe('GET');
    });

    it('C-23 / V-24: inviteVolunteer calls POST /coordinator/events/{id}/invite/', async () => {
      const payload: CoordinatorInviteRequestDto = {
        volunteer_user_id: 42,
        post_id: 501,
        note: 'Welcome to the team',
      };
      const res = await coordinatorApi.inviteVolunteer(101, payload, mockClient);

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe('http://10.0.2.2:8000/api/v1/coordinator/events/101/invite/');
      expect(capturedMethod).toBe('POST');
      expect(capturedBody).toEqual(payload);
    });

    it('C-24: runAutoAssignment calls POST /coordinator/events/{id}/auto-assign/', async () => {
      const res = await coordinatorApi.runAutoAssignment(101, mockClient);

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe('http://10.0.2.2:8000/api/v1/coordinator/events/101/auto-assign/');
      expect(capturedMethod).toBe('POST');
      expect(capturedBody).toEqual({});
    });

    it('C-25: manualAssign calls POST /coordinator/events/{id}/manual-assign/', async () => {
      const payload = {
        application_id: 301,
        post_id: 501,
        group_code: 'GRP-A',
        is_group_leader: true,
      };
      const res = await coordinatorApi.manualAssign(101, payload, mockClient);

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe('http://10.0.2.2:8000/api/v1/coordinator/events/101/manual-assign/');
      expect(capturedMethod).toBe('POST');
      expect(capturedBody).toEqual(payload);
    });

    it('C-28: getPostCapacity calls GET /coordinator/events/{id}/post-capacity/', async () => {
      const res = await coordinatorApi.getPostCapacity(101, mockClient);

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe('http://10.0.2.2:8000/api/v1/coordinator/events/101/post-capacity/');
      expect(capturedMethod).toBe('GET');
    });

    it('C-30: getAttendanceRoster calls GET /coordinator/events/{id}/attendance/', async () => {
      const res = await coordinatorApi.getAttendanceRoster(101, mockClient);

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe('http://10.0.2.2:8000/api/v1/coordinator/events/101/attendance/');
      expect(capturedMethod).toBe('GET');
    });

    it('C-32: getPendingGeoConfirmations calls GET /coordinator/events/{id}/attendance/pending/', async () => {
      const res = await coordinatorApi.getPendingGeoConfirmations(101, mockClient);

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe('http://10.0.2.2:8000/api/v1/coordinator/events/101/attendance/pending/');
      expect(capturedMethod).toBe('GET');
    });

    it('C-34: confirmAttendance calls POST /coordinator/attendance/{id}/confirm/', async () => {
      const res = await coordinatorApi.confirmAttendance(701, 'Approved by lead', mockClient);

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe('http://10.0.2.2:8000/api/v1/coordinator/attendance/701/confirm/');
      expect(capturedMethod).toBe('POST');
      expect(capturedBody).toEqual({ note: 'Approved by lead' });
    });

    it('C-34: rejectAttendance calls POST /coordinator/attendance/{id}/reject/', async () => {
      const res = await coordinatorApi.rejectAttendance(701, 'Did not show', mockClient);

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe('http://10.0.2.2:8000/api/v1/coordinator/attendance/701/reject/');
      expect(capturedMethod).toBe('POST');
      expect(capturedBody).toEqual({ reason: 'Did not show' });
    });
  });

  // =========================================================================
  // Section 4: Canonical Check-in Endpoints (checkinApi)
  // =========================================================================
  describe('checkinApi', () => {
    it('V-30: getOnboarding calls canonical GET /checkin/events/{id}/onboarding/', async () => {
      const res = await checkinApi.getOnboarding(101, mockClient);

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe('http://10.0.2.2:8000/api/v1/checkin/events/101/onboarding/');
      expect(capturedMethod).toBe('GET');
    });

    it('V-31: acknowledgeOnboarding calls canonical POST /checkin/events/{id}/onboarding/acknowledge/', async () => {
      const payload: OnboardingAcknowledgeRequestDto = { notes: 'Alex J. - Boots ready' };
      const res = await checkinApi.acknowledgeOnboarding(101, payload, mockClient);

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe('http://10.0.2.2:8000/api/v1/checkin/events/101/onboarding/acknowledge/');
      expect(capturedMethod).toBe('POST');
      expect(capturedBody).toEqual(payload);
    });

    it('V-32: resolveQrToken calls canonical POST /checkin/qr/resolve/', async () => {
      const res = await checkinApi.resolveQrToken('qr-token-abc', mockClient);

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe('http://10.0.2.2:8000/api/v1/checkin/qr/resolve/');
      expect(capturedMethod).toBe('POST');
      expect(capturedBody).toEqual({ token: 'qr-token-abc' });
    });

    it('V-33: redeemQrToken calls canonical POST /checkin/qr/redeem/', async () => {
      const res = await checkinApi.redeemQrToken('qr-token-abc', mockClient);

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe('http://10.0.2.2:8000/api/v1/checkin/qr/redeem/');
      expect(capturedMethod).toBe('POST');
      expect(capturedBody).toEqual({ token: 'qr-token-abc' });
    });

    it('V-34: submitGeoCheckIn calls canonical POST /checkin/attendance/geo-checkin/', async () => {
      const payload = { event_id: 101, latitude: 16.8, longitude: 96.1, accuracy_m: 5 };
      const res = await checkinApi.submitGeoCheckIn(payload, mockClient);

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe('http://10.0.2.2:8000/api/v1/checkin/attendance/geo-checkin/');
      expect(capturedMethod).toBe('POST');
      expect(capturedBody).toEqual(payload);
    });

    it('C-33 / V-35: manualCheckIn calls canonical POST /checkin/attendance/manual-checkin/', async () => {
      const payload = { event_id: 101, user_id: 42, note: 'Manual check-in' };
      const res = await checkinApi.manualCheckIn(payload, mockClient);

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe('http://10.0.2.2:8000/api/v1/checkin/attendance/manual-checkin/');
      expect(capturedMethod).toBe('POST');
      expect(capturedBody).toEqual(payload);
    });

    it('V-36: checkoutAttendance calls canonical POST /checkin/attendance/{id}/checkout/', async () => {
      const res = await checkinApi.checkoutAttendance(701, mockClient);

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe('http://10.0.2.2:8000/api/v1/checkin/attendance/701/checkout/');
      expect(capturedMethod).toBe('POST');
      expect(capturedBody).toEqual({});
    });

    it('V-40 / C-37: submitEventFeedback calls canonical POST /checkin/events/{id}/feedback/', async () => {
      const payload = { direction: 'volunteer_to_event' as const, score: 5, comment: 'Great event!' };
      const res = await checkinApi.submitEventFeedback(101, payload, mockClient);

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe('http://10.0.2.2:8000/api/v1/checkin/events/101/feedback/');
      expect(capturedMethod).toBe('POST');
      expect(capturedBody).toEqual(payload);
    });

    it('C-35: getGeoAttempts calls canonical GET /checkin/coordinator/events/{id}/geo-attempts/', async () => {
      const res = await checkinApi.getGeoAttempts(101, mockClient);

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe(
        'http://10.0.2.2:8000/api/v1/checkin/coordinator/events/101/geo-attempts/',
      );
      expect(capturedMethod).toBe('GET');
    });

    it('P1-12: getEventFeedbackList calls canonical GET /checkin/events/{id}/feedback/list/', async () => {
      const res = await checkinApi.getEventFeedbackList(101, mockClient);

      expect(res.ok).toBe(true);
      expect(capturedUrl).toBe(
        'http://10.0.2.2:8000/api/v1/checkin/events/101/feedback/list/',
      );
      expect(capturedMethod).toBe('GET');
    });
  });

  // =========================================================================
  // Section 5: Exact Database Enum Vocabulary Type Invariants (Section 3.4)
  // =========================================================================
  describe('Database Enum Vocabularies', () => {
    it('validates AttendanceMethodDto enum values', () => {
      const validMethods: AttendanceMethodDto[] = [
        'qr_scan',
        'coordinator_manual',
        'geo',
        'system',
      ];
      expect(validMethods).toHaveLength(4);
    });

    it('validates AttendanceStatusDto enum values', () => {
      const validStatuses: AttendanceStatusDto[] = [
        'expected',
        'checked_in',
        'absent',
        'completed',
        'cancelled',
      ];
      expect(validStatuses).toHaveLength(5);
    });

    it('validates ConfirmationStatusDto enum values', () => {
      const validConfirmations: ConfirmationStatusDto[] = [
        'not_required',
        'pending',
        'confirmed',
        'rejected',
      ];
      expect(validConfirmations).toHaveLength(4);
    });

    it('validates LeaderStrategyDto enum values', () => {
      const validStrategies: LeaderStrategyDto[] = ['none', 'first_experienced', 'manual'];
      expect(validStrategies).toHaveLength(3);
    });

    it('validates CompensationKindDto enum values', () => {
      const validCompensations: CompensationKindDto[] = [
        'unpaid',
        'arranged_outside_system',
      ];
      expect(validCompensations).toHaveLength(2);
    });
  });
});
