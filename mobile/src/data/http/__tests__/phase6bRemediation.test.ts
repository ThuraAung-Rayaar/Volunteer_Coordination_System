import { HttpCoordinatorRepository } from '../HttpCoordinatorRepository';
import { HttpEventRepository } from '../HttpEventRepository';
import { checkinApi } from '../../endpoints/checkinApi';
import { coordinatorApi } from '../../endpoints/coordinatorApi';
import { eventApi } from '../../endpoints/eventApi';
import { profileApi } from '../../endpoints/profileApi';
import { ApiClient } from '../../../core/api/apiClient';
import { MemoryTokenStore } from '../../../core/auth/tokenStore';
import { mapProfileUpdateRequest } from '../../mappers/profileMapper';
import { createCoordinatorUseCases } from '../../../domain/usecases/coordinatorUseCases';
import { createVolunteerUseCases } from '../../../domain/usecases/volunteerUseCases';
import type { ManualCheckinResponseDto, GeoAttemptReviewDto } from '../../dto/checkinDto';
import type {
  CoordinatorHistoryItemDto,
  EventPostCapacityDto,
} from '../../dto/coordinatorDto';
import type { UserUuidLookupDto } from '../../dto/profileDto';
import type { CharityFieldDto } from '../../dto/eventDto';
import type { VolunteerProfile } from '../../../domain/models/profile';

describe('Phase 6B Remediation Test Suite', () => {
  let mockClient: ApiClient;
  let coordinatorRepo: HttpCoordinatorRepository;
  let eventRepo: HttpEventRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = new ApiClient(jest.fn() as any, new MemoryTokenStore());
    coordinatorRepo = new HttpCoordinatorRepository(mockClient);
    eventRepo = new HttpEventRepository(mockClient);
  });

  describe('ATT-02: Manual Check-In Data Layer & Direct Invocation', () => {
    it('executes manual check-in with explicit object params without warm cache', async () => {
      const serverResponse: ManualCheckinResponseDto = {
        attendance_id: 888,
        event_id: 101,
        user_id: 202,
        status: 'checked_in',
        method: 'coordinator_manual',
        checkin_at: '2026-11-20T10:00:00Z',
        recorded_by_user_id: 99,
        already_checked_in: false,
      };

      const manualCheckinSpy = jest
        .spyOn(checkinApi, 'manualCheckIn')
        .mockResolvedValue({
          ok: true,
          status: 200,
          data: serverResponse,
        });

      const result = await coordinatorRepo.manualCheckIn({
        eventId: '101',
        volunteerUserId: '202',
        note: 'Walk-in arrival verified by coordinator',
      });

      expect(manualCheckinSpy).toHaveBeenCalledWith(
        {
          event_id: 101,
          user_id: 202,
          note: 'Walk-in arrival verified by coordinator',
        },
        mockClient,
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.id).toBe('888');
      expect(result.data?.eventId).toBe('101');
      expect(result.data?.userId).toBe('202');
      expect(result.data?.status).toBe('checked_in');
      expect(result.data?.checkInMethod).toBe('coordinator_manual');
      expect(result.data?.checkedInAt).toBe('2026-11-20T10:00:00Z');
      expect(result.data?.isPendingGeoConfirmation).toBe(false);
      expect(result.message).toBe('Volunteer checked in manually');
    });

    it('executes manual check-in with positional parameters without warm cache', async () => {
      const serverResponse: ManualCheckinResponseDto = {
        attendance_id: 889,
        event_id: 101,
        user_id: 203,
        status: 'checked_in',
        method: 'coordinator_manual',
        checkin_at: '2026-11-20T10:05:00Z',
        recorded_by_user_id: 99,
        already_checked_in: false,
      };

      const manualCheckinSpy = jest
        .spyOn(checkinApi, 'manualCheckIn')
        .mockResolvedValue({
          ok: true,
          status: 200,
          data: serverResponse,
        });

      const result = await coordinatorRepo.manualCheckIn(
        '101',
        '203',
        'Positional parameter checkin',
      );

      expect(manualCheckinSpy).toHaveBeenCalledWith(
        {
          event_id: 101,
          user_id: 203,
          note: 'Positional parameter checkin',
        },
        mockClient,
      );
      expect(result.success).toBe(true);
      expect(result.data?.id).toBe('889');
      expect(result.message).toBe('Volunteer checked in manually');
    });

    it('preserves server method and timestamps on idempotent already_checked_in response', async () => {
      const serverResponse: ManualCheckinResponseDto = {
        attendance_id: 777,
        event_id: 101,
        user_id: 204,
        status: 'checked_in',
        method: 'qr_scan', // Original method was QR scan, server preserves it
        checkin_at: '2026-11-20T08:30:00Z',
        recorded_by_user_id: 99,
        already_checked_in: true,
      };

      jest.spyOn(checkinApi, 'manualCheckIn').mockResolvedValue({
        ok: true,
        status: 200,
        data: serverResponse,
      });

      const result = await coordinatorRepo.manualCheckIn({
        eventId: '101',
        volunteerUserId: '204',
      });

      expect(result.success).toBe(true);
      expect(result.data?.checkInMethod).toBe('qr_scan'); // Preserves server method
      expect(result.data?.checkedInAt).toBe('2026-11-20T08:30:00Z');
      expect(result.message).toContain('already checked in');
    });

    it('fails closed when attendanceId is not found in cache and no event/user provided', async () => {
      const result = await coordinatorRepo.manualCheckIn('nonexistent_id');
      expect(result.success).toBe(false);
      expect(result.message).toContain('not found in active roster cache');
    });
  });

  describe('P1-02: Donation Merge Rules Alignment (CHECK Constraint)', () => {
    const baseProfile: VolunteerProfile = {
      id: 'usr-1',
      phone: '+15555550100',
      email: 'vol@example.com',
      accountStatus: 'active',
      verificationStatus: 'verified',
      coordinatorStatus: 'none',
      isAdmin: false,
      isStaff: false,
      displayName: 'Volunteer One',
      preferredLanguage: 'en',
      homeArea: 'Downtown',
      emergencyContactName: 'Contact Person',
      emergencyContactPhone: '+15555550199',
      skills: ['first_aid'],
      charityInterests: ['environment'],
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
        needsMealSupport: false,
        needsTravelSupport: false,
        acceptsUnpaid: true,
      },
      donationPreferences: {
        bloodType: 'O+',
        isWillingToDonate: true,
        isWillingToDonateBlood: true,
        isWillingToDonateItems: true,
      },
    };

    it('cascades false to blood and item flags when isWillingToDonate is set to false', () => {
      const updatePayload = mapProfileUpdateRequest(
        {
          donationPreferences: {
            bloodType: 'O+',
            isWillingToDonate: false,
            isWillingToDonateBlood: false,
            isWillingToDonateItems: false,
          },
        },
        baseProfile,
      );

      expect(updatePayload.is_willing_to_donate).toBe(false);
      expect(updatePayload.is_willing_to_donate_blood).toBe(false);
      expect(updatePayload.is_willing_to_donate_items).toBe(false);
    });

    it('preserves or updates blood and item flags when isWillingToDonate is true', () => {
      const updatePayload = mapProfileUpdateRequest(
        {
          donationPreferences: {
            bloodType: 'O+',
            isWillingToDonate: true,
            isWillingToDonateBlood: true,
            isWillingToDonateItems: false,
          },
        },
        baseProfile,
      );

      expect(updatePayload.is_willing_to_donate).toBe(true);
      expect(updatePayload.is_willing_to_donate_blood).toBe(true);
      expect(updatePayload.is_willing_to_donate_items).toBe(false);
    });
  });

  describe('P1-03: Zero Fabricated Fallbacks on Assignment Mutation (REPO-01)', () => {
    it('fails when event ID cannot be determined instead of falling back to events[0].id', async () => {
      const result = await coordinatorRepo.assignVolunteerManually(
        '999',
        '201',
        'GRP-A',
        false,
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('Unable to determine event');
    });

    it('reports explicit sync failure when mutation succeeds on server but record refetch misses it', async () => {
      jest.spyOn(coordinatorApi, 'manualAssign').mockResolvedValue({
        ok: true,
        status: 201,
        data: {
          assignment_id: 1234,
          application_id: 502,
          status: 'assigned',
        },
      });

      // Refetch returns empty list (simulating replication lag or sync mismatch)
      jest.spyOn(coordinatorApi, 'getAssignments').mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          count: 0,
          next: null,
          previous: null,
          results: [],
        },
      } as any);

      const result = await coordinatorRepo.assignVolunteerManually(
        '502',
        '201',
        'GRP-A',
        false,
        '101',
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('failed to synchronize updated assignment record');
    });
  });

  describe('P1-04: Coordinator Feedback Summary No Hard-Coded Metrics (USE-01)', () => {
    it('returns null avgRating and 0 totalRatings when no profile repository is configured', async () => {
      const useCases = createCoordinatorUseCases({
        coordinatorRepository: coordinatorRepo,
      });

      const summary = await useCases.getCoordinatorFeedbackSummary('101');
      expect(summary.avgRating).toBeNull();
      expect(summary.totalRatings).toBe(0);
    });
  });

  describe('P1-05: Strict Domain Mappers & Models (MAP-03)', () => {
    it('maps coordinator history DTO to CoordinatorHistoryItem domain model', async () => {
      const rawHistoryDto: CoordinatorHistoryItemDto = {
        id: 1,
        event_id: 101,
        change_type: 'coordinator_transfer',
        previous_coordinator_id: 10,
        previous_coordinator_name: 'Bob',
        new_coordinator_id: 11,
        new_coordinator_name: 'Alice',
        changed_by_id: 99,
        changed_by_name: 'Admin',
        reason: 'Handover complete',
        changed_at: '2026-10-01T08:00:00Z',
      };

      jest.spyOn(coordinatorApi, 'getCoordinatorHistory').mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          count: 1,
          next: null,
          previous: null,
          results: [rawHistoryDto],
        },
      } as any);

      const history = await coordinatorRepo.getCoordinatorHistory('101');
      expect(history).toHaveLength(1);
      const item = history[0];
      expect(item.id).toBe('1');
      expect(item.eventId).toBe('101');
      expect(item.changeType).toBe('coordinator_transfer');
      expect(item.previousCoordinatorId).toBe('10');
      expect(item.newCoordinatorId).toBe('11');
      expect(item.reason).toBe('Handover complete');
      expect(item.changedAt).toBe('2026-10-01T08:00:00Z');
    });

    it('maps post capacity DTO to EventPostCapacity domain model', async () => {
      const rawPostCapacity: EventPostCapacityDto = {
        post_id: 301,
        title: 'Safety Marshal',
        status: 'open',
        required_headcount: 10,
        assigned_count: 7,
        remaining: 3,
      };

      jest.spyOn(coordinatorApi, 'getPostCapacity').mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          count: 1,
          next: null,
          previous: null,
          results: [rawPostCapacity],
        },
      } as any);

      const capacity = await coordinatorRepo.getPostCapacity('101');
      expect(capacity).toHaveLength(1);
      expect(capacity[0].postId).toBe('301');
      expect(capacity[0].title).toBe('Safety Marshal');
      expect(capacity[0].requiredHeadcount).toBe(10);
      expect(capacity[0].assignedCount).toBe(7);
      expect(capacity[0].remainingCapacity).toBe(3);
    });

    it('maps volunteer UUID lookup DTO to VolunteerUuidLookup domain model', async () => {
      const rawLookup: UserUuidLookupDto = {
        user_id: 55,
        uuid: 'uuid-1234',
        display_name: 'Jane Doe',
        skills: ['first_aid'],
        physical_ok: true,
        good_eyesight: true,
        needs_glasses: false,
        can_lift_heavy: true,
        can_work_outdoor: true,
        has_leader_experience: false,
        new_to_volunteer: false,
        preferred_language: 'en',
        home_area: 'North District',
        needs_meal_support: false,
        needs_travel_support: false,
        accepts_unpaid: true,
        verification_status: 'verified',
      };

      jest.spyOn(profileApi, 'lookupUserByUuid').mockResolvedValue({
        ok: true,
        status: 200,
        data: rawLookup,
      });

      const lookup = await coordinatorRepo.lookupVolunteerByUuid('uuid-1234');
      expect(lookup).not.toBeNull();
      expect(lookup?.userId).toBe('55');
      expect(lookup?.displayName).toBe('Jane Doe');
      expect(lookup?.verificationStatus).toBe('verified');
      expect(lookup?.skills).toEqual(['first_aid']);
    });

    it('maps geo attempt review DTO to GeoAttemptReview domain model', async () => {
      const rawGeoAttempt: GeoAttemptReviewDto = {
        attempt_id: 901,
        event_id: 101,
        user_id: 55,
        display_name: 'Jane Doe',
        attempted_at: '2026-11-20T08:15:00Z',
        distance_m: 150.5,
        effective_radius_m: 100.0,
        accuracy_m: 5.0,
        is_mocked: false,
        result_code: 'outside_geofence',
      };

      jest.spyOn(checkinApi, 'getGeoAttempts').mockResolvedValue({
        ok: true,
        status: 200,
        data: {
          count: 1,
          next: null,
          previous: null,
          results: [rawGeoAttempt],
        },
      } as any);

      const attempts = await coordinatorRepo.getGeoAttempts('101');
      expect(attempts).toHaveLength(1);
      expect(attempts[0].attemptId).toBe('901');
      expect(attempts[0].eventId).toBe('101');
      expect(attempts[0].userId).toBe('55');
      expect(attempts[0].distanceMeters).toBe(150.5);
      expect(attempts[0].resultCode).toBe('outside_geofence');
    });

    it('maps charity taxonomy categories to CharityCategory domain model', async () => {
      const rawCharityCategories: CharityFieldDto[] = [
        {
          code: 'disaster_relief',
          label: 'Disaster Relief',
          sort_order: 10,
        },
      ];

      jest.spyOn(eventApi, 'getCharityFields').mockResolvedValue({
        ok: true,
        status: 200,
        data: rawCharityCategories,
      });

      const categories = await eventRepo.getCharityFields();
      expect(categories).toHaveLength(1);
      expect(categories[0].code).toBe('disaster_relief');
      expect(categories[0].label).toBe('Disaster Relief');
      expect(categories[0].sortOrder).toBe(10);
    });
  });

  describe('P1-06: Volunteer Invite Accept & Reject Round Trip (INV-01)', () => {
    it('accepts volunteer invite via event repository and endpoints', async () => {
      const acceptSpy = jest
        .spyOn(eventApi, 'acceptInvite')
        .mockResolvedValue({
          ok: true,
          status: 200,
          data: {
            id: 401,
            status: 'accepted',
          },
        });

      const result = await eventRepo.acceptInvite('401');
      expect(acceptSpy).toHaveBeenCalledWith('401', {}, mockClient);
      expect(result.success).toBe(true);
      expect(result.message).toContain('accepted');
    });

    it('rejects volunteer invite via event repository and endpoints', async () => {
      const rejectSpy = jest
        .spyOn(eventApi, 'rejectInvite')
        .mockResolvedValue({
          ok: true,
          status: 200,
          data: {
            id: 401,
            status: 'rejected',
          },
        });

      const result = await eventRepo.rejectInvite('401');
      expect(rejectSpy).toHaveBeenCalledWith('401', {}, mockClient);
      expect(result.success).toBe(true);
      expect(result.message).toContain('declined');
    });

    it('executes joinThroughInvite finding matching pending invite', async () => {
      jest.spyOn(eventRepo, 'getUserApplications').mockResolvedValue([
        {
          id: '401',
          eventId: '101',
          eventTitle: 'Beach Clean-Up',
          postId: '201',
          postTitle: 'Volunteer',
          status: 'pending',
          appliedAt: '2026-11-20T08:00:00Z',
          source: 'invite',
        },
      ]);

      const acceptSpy = jest
        .spyOn(eventRepo, 'acceptInvite')
        .mockResolvedValue({
          success: true,
          message: 'Invite accepted successfully',
          applicationId: '401',
        });

      const useCases = createVolunteerUseCases({
        eventRepository: eventRepo,
        profileRepository: {} as any,
      });

      const result = await useCases.joinThroughInvite('101');
      expect(acceptSpy).toHaveBeenCalledWith('401', 'Accepted coordinator invitation');
      expect(result.success).toBe(true);
    });

    it('executes respondToInvite with accept and reject operations', async () => {
      const acceptSpy = jest
        .spyOn(eventRepo, 'acceptInvite')
        .mockResolvedValue({
          success: true,
          message: 'Invite accepted successfully',
          applicationId: '401',
        });

      const rejectSpy = jest
        .spyOn(eventRepo, 'rejectInvite')
        .mockResolvedValue({
          success: true,
          message: 'Invite declined successfully',
          applicationId: '401',
        });

      const useCases = createVolunteerUseCases({
        eventRepository: eventRepo,
        profileRepository: {} as any,
      });

      const acceptRes = await useCases.respondToInvite('401', true);
      expect(acceptSpy).toHaveBeenCalledWith('401', undefined);
      expect(acceptRes.success).toBe(true);

      const rejectRes = await useCases.respondToInvite('401', false);
      expect(rejectSpy).toHaveBeenCalledWith('401', undefined);
      expect(rejectRes.success).toBe(true);
    });
  });
});
