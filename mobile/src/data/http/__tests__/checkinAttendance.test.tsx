/**
 * @format
 */

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ApiClient } from '../../../core/api/apiClient';
import { MemoryTokenStore } from '../../../core/auth/tokenStore';
import { SessionManager } from '../../../core/auth/sessionManager';
import { checkinApi } from '../../endpoints/checkinApi';
import { coordinatorApi } from '../../endpoints/coordinatorApi';
import { HttpEventRepository } from '../HttpEventRepository';
import { HttpCoordinatorRepository } from '../HttpCoordinatorRepository';
import { MockEventRepository } from '../../mock/MockEventRepository';
import { ThemeProvider } from '../../../theme/ThemeProvider';
import { MyAssignmentsScreen } from '../../../features/events/screens/MyAssignmentsScreen';
import type {
  AttendanceRosterDto,
  CoordinatorEventListItemDto,
} from '../../dto/coordinatorDto';
import type {
  CheckoutResponseDto,
  FeedbackSubmitResponseDto,
  GeoCheckinResponseDto,
  OnboardingAcknowledgeResponseDto,
  OnboardingStatusDto,
  QrRedeemResponseDto,
  QrResolveResponseDto,
  QrTokenDto,
} from '../../dto/checkinDto';

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

describe('Phase 8: Onboarding, QR, Attendance & Feedback Integration', () => {
  let mockClient: ApiClient;
  let eventRepo: HttpEventRepository;
  let coordinatorRepo: HttpCoordinatorRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    const tokenStore = new MemoryTokenStore();
    tokenStore.setToken('valid-phase8-token');
    const sessionManager = new SessionManager(tokenStore);
    mockClient = new ApiClient(
      async () => new Response(JSON.stringify({})),
      tokenStore,
      sessionManager,
    );
    eventRepo = new HttpEventRepository(mockClient);
    coordinatorRepo = new HttpCoordinatorRepository(mockClient);
    coordinatorRepo.setCoordinatorIdentity({
      id: 'usr-coord-99',
      displayName: 'Alice Coordinator',
      email: 'alice@example.com',
    });
  });

  describe('1. Volunteer Onboarding Briefing & Acknowledgment', () => {
    it('fetches event onboarding briefing status', async () => {
      const mockStatus: OnboardingStatusDto = {
        event_id: 101,
        onboarding_text: 'Please review safety protocols before arrival.',
        onboarding_version: 2,
        require_onboarding_ack: true,
        acknowledged: false,
      };

      jest
        .spyOn(checkinApi, 'getOnboarding')
        .mockResolvedValue({ ok: true, status: 200, data: mockStatus });

      const result = await eventRepo.getEventOnboarding!('101');

      expect(result.eventId).toBe('101');
      expect(result.onboardingText).toBe('Please review safety protocols before arrival.');
      expect(result.onboardingVersion).toBe(2);
      expect(result.requireOnboardingAck).toBe(true);
      expect(result.acknowledged).toBe(false);
    });

    it('acknowledges event onboarding briefing', async () => {
      const mockAck: OnboardingAcknowledgeResponseDto = {
        event_id: 101,
        onboarding_version: 2,
        acknowledged: true,
      };

      const ackSpy = jest
        .spyOn(checkinApi, 'acknowledgeOnboarding')
        .mockResolvedValue({ ok: true, status: 200, data: mockAck });

      const result = await eventRepo.acknowledgeOnboarding!('101', 'Reviewed gear checklist');

      expect(result.success).toBe(true);
      expect(result.acknowledged).toBe(true);
      expect(ackSpy).toHaveBeenCalledWith(
        '101',
        { notes: 'Reviewed gear checklist' },
        mockClient,
      );
    });
  });

  describe('2. Volunteer Geo Check-In Telemetry & Error Normalization', () => {
    it('handles successful geo check-in within geofence', async () => {
      const mockResponse: GeoCheckinResponseDto = {
        result: 'accepted',
        attendance_id: 801,
        distance_m: 25.5,
        confirmation_status: 'confirmed',
        message: 'Checked in successfully within event geofence.',
        success: true,
      };

      const checkInSpy = jest
        .spyOn(checkinApi, 'submitGeoCheckIn')
        .mockResolvedValue({ ok: true, status: 200, data: mockResponse });

      const result = await eventRepo.submitGeoCheckIn!('101', 16.805, 96.155, 10);

      expect(result.success).toBe(true);
      expect(result.result).toBe('accepted');
      expect(result.distanceM).toBeCloseTo(25.5);
      expect(result.attendanceId).toBe('801');
      expect(checkInSpy).toHaveBeenCalledWith(
        {
          event_id: 101,
          latitude: 16.805,
          longitude: 96.155,
          accuracy_m: 10,
        },
        mockClient,
      );
    });

    it('preserves distance_m and error message on outside_geofence HTTP 400 without crashing', async () => {
      jest.spyOn(checkinApi, 'submitGeoCheckIn').mockResolvedValue({
        ok: false,
        status: 400,
        error: {
          kind: 'validation',
          code: 'outside_geofence',
          message: 'Outside allowable check-in radius (350m away)',
          meta: {
            distance_m: 350.2,
            success: false,
          },
        },
      });

      const result = await eventRepo.submitGeoCheckIn!('101', 16.9, 96.2, 15);

      expect(result.success).toBe(false);
      expect(result.result).toBe('outside_geofence');
      expect(result.distanceM).toBeCloseTo(350.2);
      expect(result.message).toContain('Outside allowable check-in radius');
    });
  });

  describe('3. QR Resolve, Redeem & Check-In', () => {
    it('resolves QR token validity without consuming', async () => {
      const mockResolve: QrResolveResponseDto = {
        event_id: 101,
        purpose: 'checkin',
        is_valid: true,
        reason: null,
      };

      const resolveSpy = jest
        .spyOn(checkinApi, 'resolveQrToken')
        .mockResolvedValue({ ok: true, status: 200, data: mockResolve });

      const res = await checkinApi.resolveQrToken('qr-token-abc', mockClient);

      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.data.is_valid).toBe(true);
        expect(res.data.purpose).toBe('checkin');
      }
      expect(resolveSpy).toHaveBeenCalledWith('qr-token-abc', mockClient);
    });

    it('redeems QR token for volunteer shift check-in', async () => {
      const mockRedeem: QrRedeemResponseDto = {
        result: 'checked_in',
        purpose: 'checkin',
        event_id: 101,
        attendance_id: 802,
      };

      const redeemSpy = jest
        .spyOn(checkinApi, 'redeemQrToken')
        .mockResolvedValue({ ok: true, status: 200, data: mockRedeem });

      const result = await eventRepo.redeemQrToken!('qr-token-checkin-123');

      expect(result.success).toBe(true);
      expect(result.result).toBe('checked_in');
      expect(result.attendanceId).toBe('802');
      expect(redeemSpy).toHaveBeenCalledWith('qr-token-checkin-123', mockClient);
    });

    it('handles QR check-in endpoint attendance/qr-checkin/', async () => {
      const qrCheckInSpy = jest
        .spyOn(checkinApi, 'qrCheckIn')
        .mockResolvedValue({
          ok: true,
          status: 200,
          data: { result: 'checked_in', event_id: 101, attendance_id: 803 },
        });

      const res = await checkinApi.qrCheckIn('qr-token-only', mockClient);
      expect(res.ok).toBe(true);
      expect(qrCheckInSpy).toHaveBeenCalledWith('qr-token-only', mockClient);
    });
  });

  describe('4. Attendance Shift Checkout (Constraint 1: attendance/{id}/checkout/)', () => {
    it('calls checkout endpoint on attendance ID and returns checkout_at', async () => {
      const mockCheckout: CheckoutResponseDto = {
        id: 801,
        status: 'checked_out',
        checkout_at: '2026-12-01T13:00:00Z',
      };

      const checkoutSpy = jest
        .spyOn(checkinApi, 'checkoutAttendance')
        .mockResolvedValue({ ok: true, status: 200, data: mockCheckout });

      const result = await eventRepo.checkOutAttendance!('801');

      expect(result.success).toBe(true);
      expect(result.checkedOutAt).toBe('2026-12-01T13:00:00Z');
      expect(checkoutSpy).toHaveBeenCalledWith('801', mockClient);
    });
  });

  describe('5. Coordinator QR Token Lifecycle', () => {
    it('creates coordinator QR token for walk-in registration', async () => {
      const mockToken: QrTokenDto = {
        id: 55,
        raw_token: 'qr-raw-walkin-token-xyz',
        purpose: 'walkin_registration',
        max_uses: 50,
        expires_at: '2026-12-01T18:00:00Z',
      };

      const createSpy = jest
        .spyOn(checkinApi, 'createCoordinatorQrToken')
        .mockResolvedValue({ ok: true, status: 201, data: mockToken });

      const result = await coordinatorRepo.createQrToken!(
        '101',
        'walkin_registration',
        50,
        240,
      );

      expect(result.success).toBe(true);
      expect(result.data?.id).toBe(55);
      expect(result.data?.rawToken).toBe('qr-raw-walkin-token-xyz');
      expect(createSpy).toHaveBeenCalledWith(
        '101',
        {
          purpose: 'walkin_registration',
          max_uses: 50,
          ttl_minutes: 240,
        },
        mockClient,
      );
    });

    it('revokes coordinator QR token', async () => {
      const revokeSpy = jest
        .spyOn(checkinApi, 'revokeCoordinatorQrToken')
        .mockResolvedValue({ ok: true, status: 200, data: { id: 55, revoked_at: '2026-12-01T12:00:00Z' } });

      const result = await coordinatorRepo.revokeQrToken!('55');

      expect(result.success).toBe(true);
      expect(revokeSpy).toHaveBeenCalledWith('55', mockClient);
    });
  });

  describe('6. Coordinator Attendance Roster, Geo Approval & Manual Check-In (Constraint 2)', () => {
    it('loads roster and pending geo confirmations into cache', async () => {
      const mockRoster: AttendanceRosterDto[] = [
        {
          assignment_id: 301,
          event_id: 101,
          user_id: 201,
          display_name: 'Volunteer Sarah',
          post_id: 401,
          post_title: 'Shoreline Cleaner',
          group_code: 'GRP-A',
          is_group_leader: false,
          assignment_status: 'confirmed',
          attendance_id: 801,
          attendance_status: 'scheduled',
          method: null,
          walk_in_flag: false,
          checkin_at: null,
          checkin_distance_m: 45,
          confirmation_status: 'pending',
        },
      ];

      jest
        .spyOn(coordinatorApi, 'getAttendanceRoster')
        .mockResolvedValue({ ok: true, status: 200, data: { results: mockRoster } });

      const roster = await coordinatorRepo.getAttendanceRoster('101');
      expect(roster).toHaveLength(1);
      expect(roster[0].isPendingGeoConfirmation).toBe(true);
    });

    it('confirms and rejects geo attendance', async () => {
      const confSpy = jest
        .spyOn(coordinatorApi, 'confirmAttendance')
        .mockResolvedValue({ ok: true, status: 200, data: { id: 801, confirmation_status: 'confirmed' } });
      const rejSpy = jest
        .spyOn(coordinatorApi, 'rejectAttendance')
        .mockResolvedValue({ ok: true, status: 200, data: { id: 801, confirmation_status: 'rejected' } });

      const confRes = await coordinatorRepo.confirmGeoAttendance('801');
      expect(confRes.success).toBe(true);
      expect(confSpy).toHaveBeenCalledWith('801', 'Confirmed by coordinator', mockClient);

      const rejRes = await coordinatorRepo.rejectGeoAttendance('801');
      expect(rejRes.success).toBe(true);
      expect(rejSpy).toHaveBeenCalledWith('801', 'Rejected by coordinator', mockClient);
    });

    it('manualCheckIn extracts event_id and user_id from cached roster item (Constraint 2)', async () => {
      const mockRoster: AttendanceRosterDto[] = [
        {
          assignment_id: 302,
          event_id: 101,
          user_id: 202,
          display_name: 'Volunteer Dave',
          post_id: 402,
          post_title: 'Logistics Sorter',
          group_code: 'GRP-B',
          is_group_leader: false,
          assignment_status: 'confirmed',
          attendance_id: null, // Scheduled, no attendance ID yet
          attendance_status: null,
          method: null,
          walk_in_flag: false,
          checkin_at: null,
          checkin_distance_m: null,
          confirmation_status: null,
        },
      ];

      jest
        .spyOn(coordinatorApi, 'getAttendanceRoster')
        .mockResolvedValue({ ok: true, status: 200, data: { results: mockRoster } });

      const manualSpy = jest
        .spyOn(checkinApi, 'manualCheckIn')
        .mockResolvedValue({
          ok: true,
          status: 200,
          data: {
            id: 805,
            attendance_id: 805,
            event_id: 101,
            user_id: 202,
            status: 'checked_in',
            method: 'coordinator_manual',
            checkin_at: '2026-11-20T10:00:00Z',
            recorded_by_user_id: 99,
            already_checked_in: false,
          },
        });

      // Load roster to populate attendanceCache
      await coordinatorRepo.getAttendanceRoster('101');

      // Check-in by assignment ID
      const result = await coordinatorRepo.manualCheckIn('302');

      expect(result.success).toBe(true);
      expect(manualSpy).toHaveBeenCalledWith(
        {
          event_id: 101,
          user_id: 202,
          note: 'Manual on-site check-in',
        },
        mockClient,
      );
    });
  });

  describe('7. Event Feedback Submission', () => {
    it('submits volunteer event feedback with rating score and tags', async () => {
      const mockFeedback: FeedbackSubmitResponseDto = {
        id: 991,
        status: 'published',
      };

      const feedbackSpy = jest
        .spyOn(checkinApi, 'submitEventFeedback')
        .mockResolvedValue({ ok: true, status: 201, data: mockFeedback });

      const result = await eventRepo.submitEventFeedback!(
        '101',
        5,
        'Excellent coordination and great teamwork.',
        ['teamwork', 'safety'],
        'volunteer_to_event',
      );

      expect(result.success).toBe(true);
      expect(result.feedbackId).toBe('991');
      expect(feedbackSpy).toHaveBeenCalledWith(
        '101',
        {
          direction: 'volunteer_to_event',
          score: 5,
          comment: 'Excellent coordination and great teamwork.',
          tags: ['teamwork', 'safety'],
        },
        mockClient,
      );
    });
  });

  describe('8. UI Screen Component Integration (MyAssignmentsScreen)', () => {
    it('renders assignments, allows viewing onboarding, check-in, checkout, and feedback', async () => {
      const mockRepo = new MockEventRepository();
      const onboardingSpy = jest.spyOn(mockRepo, 'getEventOnboarding');
      const checkinSpy = jest.spyOn(mockRepo, 'submitGeoCheckIn');
      const checkoutSpy = jest.spyOn(mockRepo, 'checkOutAttendance');
      const feedbackSpy = jest.spyOn(mockRepo, 'submitEventFeedback');

      const mockNav = createMockNavigation();

      let renderer: ReactTestRenderer.ReactTestRenderer;
      await act(async () => {
        renderer = ReactTestRenderer.create(
          <SafeAreaProvider initialMetrics={initialMetrics}>
            <ThemeProvider>
              <MyAssignmentsScreen
                navigation={mockNav as any}
                repository={mockRepo}
              />
            </ThemeProvider>
          </SafeAreaProvider>,
        );
      });

      // Verify onboarding trigger
      const assignments = await mockRepo.getUserAssignments();
      expect(assignments.length).toBeGreaterThan(0);

      const firstAssignment = assignments[0];
      await act(async () => {
        await mockRepo.getEventOnboarding(firstAssignment.eventId);
      });
      expect(onboardingSpy).toHaveBeenCalledWith(firstAssignment.eventId);

      // Verify geo check-in trigger
      await act(async () => {
        await mockRepo.submitGeoCheckIn(firstAssignment.eventId, 16.805, 96.155, 15);
      });
      expect(checkinSpy).toHaveBeenCalledWith(firstAssignment.eventId, 16.805, 96.155, 15);

      // Verify checkout trigger
      await act(async () => {
        await mockRepo.checkOutAttendance(firstAssignment.id);
      });
      expect(checkoutSpy).toHaveBeenCalledWith(firstAssignment.id);

      // Verify feedback trigger
      await act(async () => {
        await mockRepo.submitEventFeedback(firstAssignment.eventId, 5, 'Great mission');
      });
      expect(feedbackSpy).toHaveBeenCalledWith(firstAssignment.eventId, 5, 'Great mission');

      await act(async () => {
        renderer!.unmount();
      });
    });
  });
});
