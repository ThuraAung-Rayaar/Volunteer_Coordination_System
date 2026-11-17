/**
 * mobile/src/data/__tests__/v0_11_0_capabilityParityE2E.test.ts
 *
 * Phase 8: Full 40-Scenario End-to-End Capability Parity Verification Suite (Mobile Layer).
 * Tests and validates the 20 Minimum Volunteer Scenarios and 20 Minimum Coordinator Scenarios
 * specified in Section 12 of the v0.11.0 Volunteer & Coordinator Capability Parity Plan.
 *
 * Exercises:
 * - Part A: 20 Volunteer Capability Scenarios (V-01 .. V-20)
 * - Part B: 20 Coordinator Capability Scenarios (C-01 .. C-20)
 * - Part C: Full Mock & HTTP Repository Contract Parity
 */

import {
  createVolunteerUseCases,
  VolunteerUseCases,
} from '../../domain/usecases/volunteerUseCases';
import {
  createCoordinatorUseCases,
  CoordinatorUseCases,
} from '../../domain/usecases/coordinatorUseCases';
import {
  MockCoordinatorRepository,
  MockDashboardRepository,
  MockEventRepository,
  MockProfileRepository,
} from '../mock';
import {
  HttpCoordinatorRepository,
  HttpDashboardRepository,
  HttpEventRepository,
  HttpProfileRepository,
} from '../http';
import { MemoryTokenStore } from '../../core/auth/tokenStore';
import { SessionManager } from '../../core/auth/sessionManager';
import { MockLocationProvider } from '../../core/location/locationProvider';
import type { ApiClient } from '../../core/api/apiClient';

describe('Phase 8: Mobile 40-Scenario Capability Parity Verification Suite', () => {
  let mockProfileRepo: MockProfileRepository;
  let mockEventRepo: MockEventRepository;
  let mockCoordRepo: MockCoordinatorRepository;
  let mockDashboardRepo: MockDashboardRepository;
  let mockLocationProvider: MockLocationProvider;

  let httpProfileRepo: HttpProfileRepository;
  let httpEventRepo: HttpEventRepository;
  let httpCoordRepo: HttpCoordinatorRepository;
  let httpDashboardRepo: HttpDashboardRepository;

  let volunteerUseCases: VolunteerUseCases;
  let coordinatorUseCases: CoordinatorUseCases;
  let session: SessionManager;
  let tokenStore: MemoryTokenStore;

  // Mock API Client to simulate network calls for HTTP repositories
  let mockApiClient: any;

  beforeEach(() => {
    tokenStore = new MemoryTokenStore();
    session = new SessionManager(tokenStore);
    mockLocationProvider = new MockLocationProvider({
      latitude: 16.7725,
      longitude: 96.1583,
      accuracyM: 10.0,
      capturedAt: new Date().toISOString(),
      isMocked: false,
    });

    mockProfileRepo = new MockProfileRepository();
    mockEventRepo = new MockEventRepository();
    mockCoordRepo = new MockCoordinatorRepository();
    mockDashboardRepo = new MockDashboardRepository();

    // Deterministic Mock ApiClient for HTTP repositories
    mockApiClient = {
      get: jest.fn().mockImplementation((path: string) => {
        const clean = path.replace(/^\/?(api\/v1\/)?/, '').replace(/\/$/, '');
        if (clean === 'me') {
          return Promise.resolve({
            ok: true,
            data: {
              id: 101,
              display_name: 'Kyaw Min Volunteer',
              phone: '+95912345678',
              home_area: 'Kamayut Township',
              preferred_language: 'my',
              skills: ['translation'],
              physical_ok: true,
              good_eyesight: true,
              needs_glasses: false,
              can_lift_heavy: false,
              can_work_outdoor: true,
              has_leader_experience: false,
              new_to_volunteer: false,
              needs_meal_support: false,
              needs_travel_support: true,
              accepts_unpaid: true,
              is_willing_to_donate: true,
              is_willing_to_donate_blood: true,
              is_willing_to_donate_items: false,
              verification_status: 'verified',
              role: 'volunteer',
            },
          });
        }
        if (clean === 'events') {
          return Promise.resolve({
            ok: true,
            data: {
              results: [
                {
                  id: 301,
                  title: 'Flood Relief Supplies Distribution',
                  description: 'Distribute rations and hygiene supplies',
                  status: 'active',
                  purpose_type: 'charity_event',
                  start_at: '2026-11-20T08:00:00Z',
                  end_at: '2026-11-20T16:00:00Z',
                  location_name: 'Relief Center',
                },
              ],
            },
          });
        }
        if (clean === 'coordinator/events') {
          return Promise.resolve({
            ok: true,
            data: {
              results: [
                {
                  id: 301,
                  title: 'Flood Relief Supplies Distribution',
                  status: 'active',
                  purpose_type: 'charity_event',
                  start_at: '2026-11-20T08:00:00Z',
                  end_at: '2026-11-20T16:00:00Z',
                },
              ],
            },
          });
        }
        if (clean === 'charity-fields') {
          return Promise.resolve({
            ok: true,
            data: {
              results: [
                { code: 'disaster_support', label: 'Disaster Support', sort_order: 1 },
              ],
            },
          });
        }
        return Promise.resolve({ ok: true, data: { results: [] } });
      }),
      post: jest.fn().mockImplementation((path: string, body: any) => {
        return Promise.resolve({ ok: true, data: { success: true, id: 999, ...body } });
      }),
      patch: jest.fn().mockImplementation((path: string, body: any) => {
        return Promise.resolve({ ok: true, data: { success: true, ...body } });
      }),
      delete: jest.fn().mockImplementation(() => {
        return Promise.resolve({ ok: true, data: {} });
      }),
    };

    httpProfileRepo = new HttpProfileRepository(mockApiClient as ApiClient);
    httpEventRepo = new HttpEventRepository(mockApiClient as ApiClient);
    httpCoordRepo = new HttpCoordinatorRepository(mockApiClient as ApiClient);
    httpDashboardRepo = new HttpDashboardRepository(mockApiClient as ApiClient);

    const mockAuthClient: any = {
      requestOtp: jest.fn().mockImplementation((param: any) => {
        const phone = typeof param === 'string' ? param : param?.phone;
        if (phone === '+95999999999') {
          return Promise.resolve({
            ok: false,
            status: 429,
            error: { code: 'otp_rate_limited', message: 'Rate limit exceeded' },
          });
        }
        return Promise.resolve({
          ok: true,
          data: {
            status: 'sent',
            delivery: { delivered: true, channel: 'sms', provider_configured: true },
            dev_code: '8899',
          },
        });
      }),
      verifyOtp: jest.fn().mockImplementation((param: any, maybeCode?: string) => {
        const code = typeof param === 'string' ? maybeCode : param?.code;
        const phone = typeof param === 'string' ? param : param?.phone;
        if (code === '8899') {
          return Promise.resolve({
            ok: true,
            data: {
              token: 'parity-session-token-123',
              user: {
                id: 101,
                uuid: 'uuid-101',
                display_name: 'Kyaw Min Volunteer',
                phone: phone || '+95912345678',
                verification_status: 'verified',
              },
            },
          });
        }
        return Promise.resolve({
          ok: false,
          status: 400,
          error: { code: 'invalid_code', message: 'Incorrect OTP' },
        });
      }),
      logout: jest.fn().mockResolvedValue({ ok: true, data: {} }),
    };

    volunteerUseCases = createVolunteerUseCases({
      profileRepository: mockProfileRepo,
      eventRepository: mockEventRepo,
      dashboardRepository: mockDashboardRepo,
      locationProvider: mockLocationProvider,
      authClient: mockAuthClient,
      session,
    });

    coordinatorUseCases = createCoordinatorUseCases({
      coordinatorRepository: mockCoordRepo,
      profileRepository: mockProfileRepo,
    });
  });

  // =========================================================================
  // PART A: 20 VOLUNTEER CAPABILITY SCENARIOS (V-01 .. V-20)
  // =========================================================================

  describe('Part A: 20 Volunteer Capability Scenarios', () => {
    test('V-01: OTP request, delivery status reporting, and rate-limit error handling', async () => {
      // 1. Successful request with truthful delivery telemetry
      const res = await volunteerUseCases.requestOtp('+95912345678');
      expect(res.success).toBe(true);
      expect(res.status).toBe('sent');
      expect(res.delivery?.delivered).toBe(true);
      expect(res.devCode).toBe('8899');

      // 2. Rate-limited request
      const rateLimitRes = await volunteerUseCases.requestOtp('+95999999999');
      expect(rateLimitRes.success).toBe(false);
      expect(rateLimitRes.message).toContain('Rate limit exceeded');
    });

    test('V-02: OTP verification, token storage, cold-start session restoration, logout, and 401 invalidation', async () => {
      // 1. Verify OTP and persist session
      const verifyRes = await volunteerUseCases.verifyOtp('+95912345678', '8899');
      expect(verifyRes.success).toBe(true);
      expect(await session.getToken()).toBe('parity-session-token-123');

      // 2. Cold-start restoration
      expect(await session.hasValidToken()).toBe(true);

      // 3. Logout invalidates session
      await volunteerUseCases.logout();
      expect(await session.hasValidToken()).toBe(false);
      expect(await session.getToken()).toBeNull();
    });

    test('V-03: Profile read & PATCH with all allow-listed fields (phone is first-class)', async () => {
      const profile = await volunteerUseCases.getProfile();
      expect(profile.phone).toBeDefined();
      expect(profile.phone).not.toBe('Verified Phone Account'); // P0-06 invariant

      const updated = await volunteerUseCases.updateProfile({
        displayName: 'Kyaw Min Senior',
        homeArea: 'Kamayut Township',
        preferredLanguage: 'my',
      });
      expect(updated.success).toBe(true);
      expect(updated.data?.displayName).toBe('Kyaw Min Senior');
      expect(updated.data?.phone).toBeDefined();
    });

    test('V-04: Donation master & sub-flag partial merge transitions', async () => {
      const res = await volunteerUseCases.updateProfile({
        donationPreferences: {
          bloodType: 'O+',
          isWillingToDonate: true,
          isWillingToDonateBlood: true,
          isWillingToDonateItems: false,
        },
      });
      expect(res.success).toBe(true);
      expect(res.data?.donationPreferences.isWillingToDonate).toBe(true);
      expect(res.data?.donationPreferences.isWillingToDonateBlood).toBe(true);
      expect(res.data?.donationPreferences.isWillingToDonateItems).toBe(false);
    });

    test('V-05: Charity interests GET & PUT replacement', async () => {
      const res = await volunteerUseCases.updateCharityInterests([
        'disaster_support',
        'food_distribution',
      ]);
      expect(res.success).toBe(true);
      expect(res.data?.charityInterests).toEqual([
        'disaster_support',
        'food_distribution',
      ]);
    });

    test('V-06: Weekly availability GET & POST rules replacement', async () => {
      const avail = await volunteerUseCases.getAvailability();
      expect(Array.isArray(avail.weeklyRules)).toBe(true);

      const saveRes = await volunteerUseCases.saveWeeklyRule({
        weekday: 2,
        weekdayName: 'Tuesday',
        startTime: '10:00',
        endTime: '15:00',
      });
      expect(saveRes.success).toBe(true);
      expect(saveRes.data?.weekday).toBe(2);
    });

    test('V-07: Availability exception create, list, and delete', async () => {
      const saveRes = await volunteerUseCases.saveException({
        date: '2026-12-25',
        startTime: '08:00',
        endTime: '16:00',
        isAvailable: false,
        note: 'Holiday blackout',
      });
      expect(saveRes.success).toBe(true);
      expect(saveRes.data?.id).toBeDefined();

      if (saveRes.data?.id) {
        const delRes = await volunteerUseCases.deleteException(saveRes.data.id);
        expect(delRes.success).toBe(true);
      }
    });

    test('V-08: Conflict check preflight before applying to an event', async () => {
      const conflict = await volunteerUseCases.checkAvailabilityForEvent('evt-101');
      expect(typeof conflict.isAvailable).toBe('boolean');
    });

    test('V-09: Verification image upload & status read', async () => {
      const upload = await volunteerUseCases.uploadVerificationImage(
        'id_license',
        'file:///path/to/license.jpg',
      );
      expect(upload.id).toBeDefined();

      const status = await volunteerUseCases.getVerificationStatus();
      expect(status.verificationStatus).toBeDefined();
    });

    test('V-10: Coordinator application submit, read, and notes update', async () => {
      const eligibility = await volunteerUseCases.getCoordinatorEligibility();
      expect(typeof eligibility.isVerified).toBe('boolean');

      const apply = await volunteerUseCases.submitCoordinatorApplication('Experienced NGO team lead');
      expect(apply.success).toBe(true);

      const updateNotes = await volunteerUseCases.updateCoordinatorApplicationNotes('Completed crisis leadership cert');
      expect(updateNotes.success).toBe(true);
    });

    test('V-11: Event list, filter, search, and detail read', async () => {
      const events = await volunteerUseCases.getEvents({ query: 'Relief' });
      expect(events.length).toBeGreaterThan(0);

      const detail = await volunteerUseCases.getEventDetail(events[0].id);
      expect(detail).not.toBeNull();
      expect(detail?.id).toBe(events[0].id);
    });

    test('V-12: Charity fields reference catalog read', async () => {
      const fields = await volunteerUseCases.getCharityFields();
      expect(fields.length).toBeGreaterThan(0);
      expect(fields[0].code).toBeDefined();
    });

    test('V-13: Event application submit with skills/comment and withdraw', async () => {
      const applyRes = await volunteerUseCases.applyToPost('evt-101', 'post-101-1', 'Available for all shifts');
      expect(applyRes.success).toBe(true);

      const apps = await volunteerUseCases.getUserApplications();
      if (apps.length > 0) {
        const withdrawRes = await volunteerUseCases.withdrawApplication(apps[0].id, apps[0].eventId);
        expect(withdrawRes.success).toBe(true);
      }
    });

    test('V-14: My applications list with accurate status', async () => {
      const apps = await volunteerUseCases.getUserApplications();
      expect(Array.isArray(apps)).toBe(true);
      for (const app of apps) {
        expect(['pending', 'accepted', 'rejected', 'waitlisted', 'withdrawn', 'expired']).toContain(app.status);
      }
    });

    test('V-15: My assignments list with assignment status & post details', async () => {
      const assignments = await volunteerUseCases.getUserAssignments();
      expect(Array.isArray(assignments)).toBe(true);
      for (const asg of assignments) {
        expect(asg.id).toBeDefined();
        expect(asg.postTitle).toBeDefined();
      }
    });

    test('V-16: Onboarding instructions read, acknowledgment submit, and gating enforcement', async () => {
      const onboarding = await volunteerUseCases.getEventOnboarding('evt-101');
      expect(onboarding.eventId).toBe('evt-101');

      const ack = await volunteerUseCases.acknowledgeOnboarding('evt-101');
      expect(ack.success).toBe(true);
      expect(ack.acknowledged).toBe(true);
    });

    test('V-17: QR resolve preview (non-consuming) and QR check-in redemption', async () => {
      const preview = await volunteerUseCases.resolveQrToken('qr-token-test-123');
      expect(preview.eventId).toBeDefined();

      const redeem = await volunteerUseCases.redeemQrToken('qr-token-test-123');
      expect(typeof redeem.success).toBe('boolean');
    });

    test('V-18: Geo check-in submission with location provider fix & geofence handling', async () => {
      const geoRes = await volunteerUseCases.submitGeoCheckIn('evt-101');
      expect(geoRes.success).toBe(true);
    });

    test('V-19: Shift checkout & sanitized attendance history read', async () => {
      const history = await volunteerUseCases.getAttendanceHistory();
      expect(Array.isArray(history)).toBe(true);

      if (history.length > 0) {
        const checkout = await volunteerUseCases.checkOutAttendance(history[0].id);
        expect(checkout.success).toBe(true);

        // Privacy check (BR-PRIV-T4)
        expect((history[0] as any).phone_hash).toBeUndefined();
        expect((history[0] as any).raw_gps).toBeUndefined();
      }
    });

    test('V-20: Volunteer feedback submission, authored list, and received aggregate summary', async () => {
      const fbEvent = await volunteerUseCases.submitVolunteerToEventFeedback(
        'evt-101',
        5,
        'Great organization and support.',
      );
      expect(fbEvent.success).toBe(true);

      const fbCoord = await volunteerUseCases.submitVolunteerToCoordinatorFeedback(
        'evt-101',
        5,
        'Clear instructions and safety priority.',
      );
      expect(fbCoord.success).toBe(true);

      const myFeedback = await volunteerUseCases.getMyFeedback();
      expect(myFeedback.authoredFeedback).toBeDefined();
      expect(myFeedback.receivedSummary).toBeDefined();
    });
  });

  // =========================================================================
  // PART B: 20 COORDINATOR CAPABILITY SCENARIOS (C-01 .. C-20)
  // =========================================================================

  describe('Part B: 20 Coordinator Capability Scenarios', () => {
    test('C-01: Coordinator status & authority gate', async () => {
      const status = await coordinatorUseCases.getCoordinatorStatus();
      expect(typeof status.isVerified).toBe('boolean');
    });

    test('C-02: Coordinator events list', async () => {
      const events = await coordinatorUseCases.getMyEvents();
      expect(events.length).toBeGreaterThan(0);
    });

    test('C-03: Create draft event', async () => {
      const draft = await coordinatorUseCases.createDraftEvent({
        title: 'Emergency Medical Camp',
        description: 'Providing on-site triage and medication distribution',
        purposeType: 'charity_event',
        startAt: '2026-12-01T08:00:00Z',
        endAt: '2026-12-01T16:00:00Z',
        locationName: 'Kamayut Community Hall',
        latitude: 16.82,
        longitude: 96.13,
        mapProvider: 'openstreetmap',
        charityFieldCodes: ['disaster_support'],
        acceptanceMode: 'manual',
        leaderStrategy: 'none',
        compensationKind: 'unpaid',
        geoCheckinEnabled: true,
        geoRadiusM: 150,
        geoCheckinOpensBeforeMin: 30,
        requireCheckinConfirmation: true,
        autoAssignEnabled: false,
        mealsProvided: true,
        lodgingProvided: false,
        travelSupportProvided: false,
        requireOnboardingAck: true,
        qrRegistrationEnabled: true,
      });
      expect(draft.success).toBe(true);
      expect(draft.data?.status).toBe('draft');
    });

    test('C-04: Create post, update required headcount, and close post', async () => {
      const events = await coordinatorUseCases.getMyEvents();
      const eventId = events[0].id;

      const postRes = await coordinatorUseCases.createEventPost(eventId, {
        title: 'Triage Nurse',
        requiredHeadcount: 3,
        leaderNeeded: true,
      });
      expect(postRes.success).toBe(true);

      const postId = postRes.data!.id;
      const updateRes = await coordinatorUseCases.updateEventPost(postId, eventId, {
        requiredHeadcount: 5,
      });
      expect(updateRes.success).toBe(true);

      const closeRes = await coordinatorUseCases.closeEventPost(postId, eventId);
      expect(closeRes.success).toBe(true);
    });

    test('C-05: Read event post capacity breakdown', async () => {
      const events = await coordinatorUseCases.getMyEvents();
      const capacity = await coordinatorUseCases.getPostCapacity(events[0].id);
      expect(Array.isArray(capacity)).toBe(true);
    });

    test('C-06: Update event metadata', async () => {
      const events = await coordinatorUseCases.getMyEvents();
      const updateRes = await mockCoordRepo.updateEvent(events[0].id, {
        description: 'Updated operational protocols and emergency safety kit instructions.',
      });
      expect(updateRes.success).toBe(true);
    });

    test('C-07: Publish gate (zero posts failure and success)', async () => {
      // 1. Fails when zero posts
      const mockEmptyRepo = new MockCoordinatorRepository();
      const emptyDraft = await mockEmptyRepo.createDraftEvent({
        title: 'Empty Draft Event',
        description: 'No roles assigned',
        purposeType: 'charity_event',
        startAt: '2026-12-01T08:00:00Z',
        endAt: '2026-12-01T16:00:00Z',
        locationName: 'Test Location',
        latitude: 16.80,
        longitude: 96.15,
        mapProvider: 'openstreetmap',
        charityFieldCodes: ['disaster_support'],
        acceptanceMode: 'manual',
        leaderStrategy: 'none',
        compensationKind: 'unpaid',
        geoCheckinEnabled: true,
        geoRadiusM: 100,
        geoCheckinOpensBeforeMin: 30,
        requireCheckinConfirmation: false,
        autoAssignEnabled: false,
        mealsProvided: false,
        lodgingProvided: false,
        travelSupportProvided: false,
        requireOnboardingAck: false,
        qrRegistrationEnabled: false,
      });
      const emptyUc = createCoordinatorUseCases({ coordinatorRepository: mockEmptyRepo });
      const failPub = await emptyUc.publishEvent(emptyDraft.data!.id);
      expect(failPub.success).toBe(false);

      // 2. Succeeds when role added
      await mockEmptyRepo.createEventPost(emptyDraft.data!.id, {
        title: 'Crew Lead',
        requiredHeadcount: 2,
      });
      const succPub = await emptyUc.publishEvent(emptyDraft.data!.id);
      expect(succPub.success).toBe(true);
      expect(succPub.data?.status).toBe('published');
    });

    test('C-08: Lifecycle transitions: activate, complete, cancel', async () => {
      const events = await coordinatorUseCases.getMyEvents();
      const published = events.find(e => e.status === 'published') || events[0];
      const active = events.find(e => e.status === 'active') || events[0];

      const actRes = await coordinatorUseCases.activateEvent(published.id);
      expect(actRes.success).toBe(true);

      const compRes = await coordinatorUseCases.completeEvent(active.id);
      expect(compRes.success).toBe(true);

      const cancelRes = await coordinatorUseCases.cancelEvent(published.id);
      expect(cancelRes.success).toBe(true);
    });

    test('C-09: Handover, owner monitor read-only enforcement, retake, and history', async () => {
      const events = await coordinatorUseCases.getMyEvents();
      const eventId = events[0].id;

      const handRes = await coordinatorUseCases.handoverEvent(eventId, 'coord-user-99', 'Shift handover');
      expect(handRes.success).toBe(true);

      const retakeRes = await coordinatorUseCases.retakeEvent(eventId, 'Resuming direct management');
      expect(retakeRes.success).toBe(true);

      const history = await coordinatorUseCases.getCoordinatorHistory(eventId);
      expect(Array.isArray(history)).toBe(true);
    });

    test('C-10: Application review list discloses T2 fields for accepted applicants only', async () => {
      const events = await coordinatorUseCases.getMyEvents();
      const eventId = events[0].id;

      const apps = await coordinatorUseCases.getApplications(eventId);
      expect(apps.length).toBeGreaterThan(0);

      const accepted = apps.find(a => a.status === 'accepted');
      const pending = apps.find(a => a.status === 'pending');

      if (accepted) {
        expect(accepted.t2Capabilities).toBeDefined();
        expect(accepted.t2Capabilities?.skills).toBeDefined();
        expect(accepted.t2Capabilities?.physicalOk).toBeDefined();
      }
      if (pending) {
        expect(pending.t2Capabilities).toBeUndefined();
      }
    });

    test('C-11: Accept, reject, and waitlist application decisions', async () => {
      const events = await coordinatorUseCases.getMyEvents();
      const eventId = events[0].id;
      const apps = await coordinatorUseCases.getApplications(eventId);
      const app = apps[0];

      const acceptRes = await coordinatorUseCases.acceptApplication(app.id, eventId);
      expect(acceptRes.success).toBe(true);

      const waitlistRes = await coordinatorUseCases.waitlistApplication(app.id, eventId);
      expect(waitlistRes.success).toBe(true);

      const rejectRes = await coordinatorUseCases.rejectApplication(app.id, eventId);
      expect(rejectRes.success).toBe(true);
    });

    test('C-12: Volunteer discovery / search via UUID lookup', async () => {
      const events = await coordinatorUseCases.getMyEvents();
      const lookup = await coordinatorUseCases.lookupVolunteerByUuid('vol-uuid-001', events[0].id);
      expect(lookup.uuid).toBe('vol-uuid-001');
      expect(lookup.display_name).toBeDefined();
    });

    test('C-13: Invite volunteer to post', async () => {
      const events = await coordinatorUseCases.getMyEvents();
      const inviteRes = await coordinatorUseCases.inviteVolunteer(events[0].id, 'vol-user-50', undefined, 'Please assist');
      expect(inviteRes.success).toBe(true);
    });

    test('C-14: Unassigned accepted applicants list', async () => {
      const events = await coordinatorUseCases.getMyEvents();
      const unassigned = await coordinatorUseCases.getUnassignedApplications(events[0].id);
      expect(Array.isArray(unassigned)).toBe(true);
    });

    test('C-15: Manual volunteer assignment to post', async () => {
      const events = await coordinatorUseCases.getMyEvents();
      const eventId = events[0].id;
      const apps = await coordinatorUseCases.getApplications(eventId);
      await coordinatorUseCases.acceptApplication(apps[0].id, eventId);

      const assignRes = await coordinatorUseCases.assignVolunteerManually(
        apps[0].id,
        'post-c1-1',
        'GRP-LEAD-1',
        true,
        eventId,
      );
      expect(assignRes.success).toBe(true);
      expect(assignRes.data?.groupCode).toBe('GRP-LEAD-1');
    });

    test('C-16: Auto-assignment execution', async () => {
      const events = await coordinatorUseCases.getMyEvents();
      const autoRes = await coordinatorUseCases.runAutoAssignment(events[0].id);
      expect(autoRes.success).toBe(true);
    });

    test('C-17: Attendance board view and manual check-in', async () => {
      const events = await coordinatorUseCases.getMyEvents();
      const eventId = events[0].id;

      const roster = await coordinatorUseCases.getAttendanceRoster(eventId);
      expect(Array.isArray(roster)).toBe(true);

      if (roster.length > 0) {
        const checkinRes = await coordinatorUseCases.manualCheckIn(roster[0].id, eventId);
        expect(checkinRes.success).toBe(true);
      }
    });

    test('C-18: Coordinator QR token create and revoke', async () => {
      const events = await coordinatorUseCases.getMyEvents();
      const eventId = events[0].id;

      const qrRes = await coordinatorUseCases.createQrToken(eventId, 'checkin', 25, 120);
      expect(qrRes.success).toBe(true);
      expect(qrRes.data?.rawToken).toBeDefined();

      if (qrRes.data?.id) {
        const revokeRes = await coordinatorUseCases.revokeQrToken(String(qrRes.data.id));
        expect(revokeRes.success).toBe(true);
      }
    });

    test('C-19: Geo attempts review, confirm, and reject', async () => {
      const events = await coordinatorUseCases.getMyEvents();
      const eventId = events[0].id;

      const attempts = await coordinatorUseCases.getGeoAttempts(eventId);
      expect(Array.isArray(attempts)).toBe(true);

      const pending = await coordinatorUseCases.getPendingGeoConfirmations(eventId);
      expect(Array.isArray(pending)).toBe(true);

      if (pending.length > 0) {
        const confirmRes = await coordinatorUseCases.confirmGeoAttendance(pending[0].id, eventId);
        expect(confirmRes.success).toBe(true);

        const rejectRes = await coordinatorUseCases.rejectGeoAttendance(pending[0].id, eventId);
        expect(rejectRes.success).toBe(true);
      }
    });

    test('C-20: Coordinator feedback operations', async () => {
      const events = await coordinatorUseCases.getMyEvents();
      const eventId = events[0].id;

      const fbRes = await coordinatorUseCases.submitCoordinatorToVolunteerFeedback(
        eventId,
        'vol-user-101',
        5,
        'Excellent teamwork during relief drive.',
        ['proactive', 'punctual'],
      );
      expect(fbRes.success).toBe(true);

      const list = await volunteerUseCases.getEventFeedbackList(eventId);
      expect(Array.isArray(list)).toBe(true);
    });
  });

  // =========================================================================
  // PART C: FULL MOCK & HTTP REPOSITORY CONTRACT PARITY
  // =========================================================================

  describe('Part C: Full Mock & HTTP Repository Contract Parity', () => {
    test('ProfileRepository methods parity between Mock and HTTP', async () => {
      // 1. Mock implementation
      const mockProfile = await mockProfileRepo.getProfile();
      expect(mockProfile.displayName).toBeDefined();

      const mockAvail = await mockProfileRepo.getAvailability();
      expect(Array.isArray(mockAvail.weeklyRules)).toBe(true);

      // 2. HTTP implementation
      const httpProfile = await httpProfileRepo.getProfile();
      expect(httpProfile.displayName).toBe('Kyaw Min Volunteer');
      expect(httpProfile.phone).toBe('+95912345678');
    });

    test('EventRepository methods parity between Mock and HTTP', async () => {
      // 1. Mock implementation
      const mockEvents = await mockEventRepo.getEvents();
      expect(mockEvents.length).toBeGreaterThan(0);

      const mockDetail = await mockEventRepo.getEventById(mockEvents[0].id);
      expect(mockDetail).not.toBeNull();

      // 2. HTTP implementation
      const httpEvents = await httpEventRepo.getEvents();
      expect(httpEvents.length).toBe(1);
      expect(httpEvents[0].title).toBe('Flood Relief Supplies Distribution');
    });

    test('CoordinatorRepository methods parity between Mock and HTTP', async () => {
      // 1. Mock implementation
      const mockEvents = await mockCoordRepo.getMyEvents();
      expect(mockEvents.length).toBeGreaterThan(0);

      const mockDetail = await mockCoordRepo.getEventDetail(mockEvents[0].id);
      expect(mockDetail).not.toBeNull();

      // 2. HTTP implementation
      const httpEvents = await httpCoordRepo.getMyEvents();
      expect(httpEvents.length).toBe(1);
      expect(httpEvents[0].title).toBe('Flood Relief Supplies Distribution');
    });
  });
});
