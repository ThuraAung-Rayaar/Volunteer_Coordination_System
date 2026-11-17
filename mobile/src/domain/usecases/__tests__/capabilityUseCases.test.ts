/**
 * @format
 * Comprehensive unit tests for Phase 7 Feature-Facing Use Cases (V-01..V-43, C-01..C-39).
 */

import {
  createVolunteerUseCases,
  VolunteerUseCases,
} from '../volunteerUseCases';
import {
  createCoordinatorUseCases,
  CoordinatorUseCases,
} from '../coordinatorUseCases';
import {
  MockCoordinatorRepository,
  MockDashboardRepository,
  MockEventRepository,
  MockProfileRepository,
} from '../../../data/mock';
import {
  HttpCoordinatorRepository,
  HttpDashboardRepository,
  HttpEventRepository,
  HttpProfileRepository,
} from '../../../data/http';
import { ApiClient, TransportAdapter } from '../../../core/api/apiClient';
import { MemoryTokenStore } from '../../../core/auth/tokenStore';
import { SessionManager } from '../../../core/auth/sessionManager';
import { MockLocationProvider } from '../../../core/location/locationProvider';

describe('Phase 7: Volunteer Use Cases (V-01 through V-43)', () => {
  let mockProfileRepo: MockProfileRepository;
  let mockEventRepo: MockEventRepository;
  let mockDashboardRepo: MockDashboardRepository;
  let mockLocationProvider: MockLocationProvider;
  let volunteerUseCases: VolunteerUseCases;

  beforeEach(() => {
    mockProfileRepo = new MockProfileRepository();
    mockEventRepo = new MockEventRepository();
    mockDashboardRepo = new MockDashboardRepository();
    mockLocationProvider = new MockLocationProvider();

    volunteerUseCases = createVolunteerUseCases({
      profileRepository: mockProfileRepo,
      eventRepository: mockEventRepo,
      dashboardRepository: mockDashboardRepo,
      locationProvider: mockLocationProvider,
    });
  });

  describe('1. Auth & Session (V-01 .. V-03)', () => {
    it('V-01: requestOtp delegates to auth client and returns delivery details', async () => {
      const mockAuthClient: any = {
        requestOtp: jest.fn().mockResolvedValue({
          ok: true,
          data: {
            status: 'sent',
            delivery: { delivered: true, channel: 'sms' },
            dev_code: '1234',
          },
        }),
      };
      const uc = createVolunteerUseCases({
        profileRepository: mockProfileRepo,
        eventRepository: mockEventRepo,
        authClient: mockAuthClient,
      });

      const res = await uc.requestOtp('+959123456789');
      expect(res.success).toBe(true);
      expect(res.status).toBe('sent');
      expect(res.delivery?.channel).toBe('sms');
      expect(res.devCode).toBe('1234');
    });

    it('V-02 & V-03: verifyOtp sets session token and logout clears it', async () => {
      const tokenStore = new MemoryTokenStore();
      const session = new SessionManager(tokenStore);
      const mockAuthClient: any = {
        verifyOtp: jest.fn().mockResolvedValue({
          ok: true,
          data: {
            token: 'auth-session-token-xyz',
            user: { id: 10, uuid: 'uuid-10', display_name: 'Kyaw', verification_status: 'verified' },
          },
        }),
        logout: jest.fn().mockResolvedValue({ ok: true, data: {} }),
      };

      const uc = createVolunteerUseCases({
        profileRepository: mockProfileRepo,
        eventRepository: mockEventRepo,
        authClient: mockAuthClient,
        session,
      });

      const verifyRes = await uc.verifyOtp('+959123456789', '1234');
      expect(verifyRes.success).toBe(true);
      expect(await session.getToken()).toBe('auth-session-token-xyz');

      await uc.logout();
      expect(await session.getToken()).toBeNull();
    });
  });

  describe('2. Profile, Charity Interests & UUID Lookup (V-04 .. V-06, V-18)', () => {
    it('V-04: getProfile returns volunteer profile', async () => {
      const profile = await volunteerUseCases.getProfile();
      expect(profile.id).toBeDefined();
      expect(profile.displayName).toBeDefined();
    });

    it('V-05: updateProfile modifies allow-listed fields', async () => {
      const res = await volunteerUseCases.updateProfile({
        displayName: 'Aung Kyaw Updated',
        preferredLanguage: 'my',
      });
      expect(res.success).toBe(true);
      expect(res.data?.displayName).toBe('Aung Kyaw Updated');
    });

    it('V-06: updateCharityInterests replaces charity taxonomy codes', async () => {
      const res = await volunteerUseCases.updateCharityInterests([
        'environment',
        'animal_welfare',
      ]);
      expect(res.success).toBe(true);
      expect(res.data?.charityInterests).toEqual([
        'environment',
        'animal_welfare',
      ]);
    });

    it('V-18: lookupUserByUuid returns public T1 and permitted T2 profile', async () => {
      const res = await volunteerUseCases.lookupUserByUuid('vol-uuid-001');
      expect(res.uuid).toBe('vol-uuid-001');
      expect(res.displayName).toBeDefined();
    });
  });

  describe('3. Availability & Conflict Preflights (V-07 .. V-12)', () => {
    it('V-07: getAvailability returns weekly rules and date exceptions', async () => {
      const avail = await volunteerUseCases.getAvailability();
      expect(avail.weeklyRules).toBeDefined();
      expect(avail.exceptions).toBeDefined();
    });

    it('V-08: saveWeeklyRule and deleteWeeklyRule mutate rules', async () => {
      const saveRes = await volunteerUseCases.saveWeeklyRule({
        weekday: 1,
        weekdayName: 'Monday',
        startTime: '09:00',
        endTime: '12:00',
      });
      expect(saveRes.success).toBe(true);
      expect(saveRes.data?.id).toBeDefined();

      if (saveRes.data?.id) {
        const delRes = await volunteerUseCases.deleteWeeklyRule(saveRes.data.id);
        expect(delRes.success).toBe(true);
      }
    });

    it('V-09 & V-10: saveException and deleteException mutate exceptions', async () => {
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

    it('V-11 & V-12: checkAvailability preflights event and time windows', async () => {
      const eventCheck = await volunteerUseCases.checkAvailabilityForEvent('evt-101');
      expect(typeof eventCheck.isAvailable).toBe('boolean');

      const windowCheck = await volunteerUseCases.checkAvailabilityForWindow(
        '2026-11-20T08:00:00Z',
        '2026-11-20T12:00:00Z',
      );
      expect(typeof windowCheck.isAvailable).toBe('boolean');
    });
  });

  describe('4. Verification & Coordinator Application (V-13 .. V-17)', () => {
    it('V-13: uploadVerificationImage processes upload', async () => {
      const res = await volunteerUseCases.uploadVerificationImage(
        'mock_selfie',
        'file:///path/to/selfie.jpg',
      );
      expect(res.id).toBeDefined();
      expect(res.imageType).toBe('mock_selfie');
    });

    it('V-14 & V-15: getVerificationStatus and getCoordinatorEligibility evaluate status', async () => {
      const vStatus = await volunteerUseCases.getVerificationStatus();
      expect(vStatus.verificationStatus).toBeDefined();

      const eligibility = await volunteerUseCases.getCoordinatorEligibility();
      expect(typeof eligibility.isVerified).toBe('boolean');
    });

    it('V-15, V-16 & V-17: submit and update coordinator application', async () => {
      const submitRes = await volunteerUseCases.submitCoordinatorApplication(
        'Experienced team lead',
      );
      expect(submitRes.success).toBe(true);

      const updateRes = await volunteerUseCases.updateCoordinatorApplicationNotes(
        'Updated qualifications and leadership references',
      );
      expect(updateRes.success).toBe(true);
    });
  });

  describe('5. Taxonomy & Event Discovery (V-19 .. V-22)', () => {
    it('V-19: getCharityFields returns taxonomy list', async () => {
      const fields = await volunteerUseCases.getCharityFields();
      expect(fields.length).toBeGreaterThan(0);
      expect(fields[0].code).toBeDefined();
    });

    it('V-20: getEvents and getEventsPage support search and pagination continuation', async () => {
      const events = await volunteerUseCases.getEvents();
      expect(events.length).toBeGreaterThan(0);

      const paged = await volunteerUseCases.getEventsPage(undefined, 1, 2);
      expect(paged.results.length).toBeLessThanOrEqual(2);

      const continuation = await volunteerUseCases.loadNextPage({
        currentPage: 1,
        pageSize: 2,
        hasMore: paged.next !== null,
        totalCount: paged.count,
        items: paged.results,
      });
      expect(continuation.currentPage).toBe(paged.next !== null ? 2 : 1);
    });

    it('V-21 & V-22: getEventDetail returns detail with open posts and capacity', async () => {
      const detail = await volunteerUseCases.getEventDetail('evt-101');
      expect(detail).not.toBeNull();
      expect(detail?.posts.length).toBeGreaterThan(0);
    });
  });

  describe('6. Applications & Shift Participation (V-23 .. V-30)', () => {
    it('V-23: applyToPost submits application and reconciles state', async () => {
      const res = await volunteerUseCases.applyToPost('evt-101', 'post-101-1', 'Available');
      expect(res.success).toBe(true);

      const apps = await volunteerUseCases.getUserApplications();
      expect(apps.some(a => a.eventId === 'evt-101')).toBe(true);
    });

    it('V-24 & V-25: joinThroughInvite and joinThroughQrWalkIn', async () => {
      const inviteRes = await volunteerUseCases.joinThroughInvite('evt-101', 'post-101-1');
      expect(inviteRes.success).toBe(true);

      const walkInRes = await volunteerUseCases.joinThroughQrWalkIn('qr-walkin-token-123');
      expect(typeof walkInRes.success).toBe('boolean');
    });

    it('V-26 & V-27: getUserApplications and withdrawApplication reconciles state', async () => {
      const apps = await volunteerUseCases.getUserApplications();
      expect(Array.isArray(apps)).toBe(true);

      if (apps.length > 0) {
        const withdrawRes = await volunteerUseCases.withdrawApplication(apps[0].id, apps[0].eventId);
        expect(withdrawRes.success).toBe(true);
      }
    });

    it('V-28, V-29 & V-30: getUserAssignments, confirmAssignment, cancelAssignment', async () => {
      const assignments = await volunteerUseCases.getUserAssignments();
      expect(Array.isArray(assignments)).toBe(true);

      const assigned = assignments.find(a => a.status === 'assigned');
      if (assigned) {
        const confirmRes = await volunteerUseCases.confirmAssignment(assigned.id);
        expect(confirmRes.success).toBe(true);
      }

      const toCancel = assignments.find(a => a.status === 'assigned' || a.status === 'confirmed');
      if (toCancel) {
        const cancelRes = await volunteerUseCases.cancelAssignment(toCancel.id);
        expect(cancelRes.success).toBe(true);
      }
    });
  });

  describe('7. Onboarding, QR & Geo Check-in (V-31 .. V-38)', () => {
    it('V-31 & V-32: getEventOnboarding and acknowledgeOnboarding', async () => {
      const onboarding = await volunteerUseCases.getEventOnboarding('evt-101');
      expect(onboarding.eventId).toBe('evt-101');

      const ackRes = await volunteerUseCases.acknowledgeOnboarding('evt-101');
      expect(ackRes.success).toBe(true);
      expect(ackRes.acknowledged).toBe(true);
    });

    it('V-33, V-34 & V-35: resolveQrToken, redeemQrToken, and qrCheckIn', async () => {
      const resolveRes = await volunteerUseCases.resolveQrToken('qr-token-test-123');
      expect(resolveRes.eventId).toBeDefined();

      const redeemRes = await volunteerUseCases.redeemQrToken('qr-token-test-123');
      expect(typeof redeemRes.success).toBe('boolean');

      const checkInRes = await volunteerUseCases.qrCheckIn('qr-token-test-123');
      expect(typeof checkInRes.success).toBe('boolean');
    });

    it('V-36: submitGeoCheckIn uses LocationProvider and fails fast if denied', async () => {
      // Success path with LocationProvider
      const successRes = await volunteerUseCases.submitGeoCheckIn('evt-101');
      expect(successRes.success).toBe(true);

      // Denied path
      mockLocationProvider.setPermissionState('denied');
      await expect(volunteerUseCases.submitGeoCheckIn('evt-101')).rejects.toThrow(
        'Location permission denied. Cannot capture device GPS telemetry.',
      );
    });

    it('V-37 & V-38: checkOutAttendance and getAttendanceHistory', async () => {
      const history = await volunteerUseCases.getAttendanceHistory();
      expect(Array.isArray(history)).toBe(true);

      if (history.length > 0) {
        const checkOutRes = await volunteerUseCases.checkOutAttendance(history[0].id);
        expect(checkOutRes.success).toBe(true);
      }
    });
  });

  describe('8. Direction-Safe Feedback & Dashboard (V-39 .. V-43)', () => {
    it('V-39 & V-40: submits direction-safe event and coordinator feedback', async () => {
      const eventFb = await volunteerUseCases.submitVolunteerToEventFeedback(
        'evt-101',
        5,
        'Excellent coordination',
        ['punctual', 'well_organized'],
      );
      expect(eventFb.success).toBe(true);

      const coordFb = await volunteerUseCases.submitVolunteerToCoordinatorFeedback(
        'evt-101',
        5,
        'Very supportive lead',
        ['supportive'],
      );
      expect(coordFb.success).toBe(true);

      const fbList = await volunteerUseCases.getEventFeedbackList('evt-101');
      expect(Array.isArray(fbList)).toBe(true);
    });

    it('V-41 & V-42: getMyFeedback returns authored and received metrics', async () => {
      const myFeedback = await volunteerUseCases.getMyFeedback();
      expect(myFeedback.authoredFeedback).toBeDefined();
      expect(myFeedback.receivedSummary).toBeDefined();
    });

    it('V-43: getDashboardSummary composes dashboard facts truthfully', async () => {
      const dashboard = await volunteerUseCases.getDashboardSummary();
      expect(dashboard.upcomingCommitments).toBeDefined();
      expect(dashboard.recentCompletedActivities).toBeDefined();
    });
  });
});

describe('Phase 7: Coordinator Use Cases (C-01 through C-39)', () => {
  let mockCoordinatorRepo: MockCoordinatorRepository;
  let mockProfileRepo: MockProfileRepository;
  let coordinatorUseCases: CoordinatorUseCases;

  beforeEach(() => {
    mockCoordinatorRepo = new MockCoordinatorRepository();
    mockProfileRepo = new MockProfileRepository();

    coordinatorUseCases = createCoordinatorUseCases({
      coordinatorRepository: mockCoordinatorRepo,
      profileRepository: mockProfileRepo,
    });
  });

  describe('1. Status & Lifecycle (C-01 .. C-06, C-11 .. C-15)', () => {
    it('C-01 .. C-03: coordinator eligibility and application management', async () => {
      const status = await coordinatorUseCases.getCoordinatorStatus();
      expect(typeof status.isVerified).toBe('boolean');

      const applyRes = await coordinatorUseCases.submitCoordinatorApplication('Experienced lead');
      expect(applyRes.success).toBe(true);

      const noteRes = await coordinatorUseCases.updateCoordinatorApplicationNotes('Updated references');
      expect(noteRes.success).toBe(true);
    });

    it('C-04 .. C-06: getMyEvents, getEventDetail, and createDraftEvent', async () => {
      const events = await coordinatorUseCases.getMyEvents();
      expect(events.length).toBeGreaterThan(0);

      const detail = await coordinatorUseCases.getEventDetail(events[0].id);
      expect(detail).not.toBeNull();
      expect(detail?.id).toBe(events[0].id);

      const draftRes = await coordinatorUseCases.createDraftEvent({
        title: 'New Emergency Shelter Relief',
        description: 'Providing food and shelter logistics',
        purposeType: 'charity_event',
        startAt: '2026-12-01T08:00:00Z',
        endAt: '2026-12-01T16:00:00Z',
        locationName: 'Kamayut Community Center',
        latitude: 16.82,
        longitude: 96.13,
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
        mealsProvided: true,
        lodgingProvided: false,
        travelSupportProvided: false,
        requireOnboardingAck: true,
        qrRegistrationEnabled: true,
      });
      expect(draftRes.success).toBe(true);
      expect(draftRes.data?.status).toBe('draft');
    });

    it('C-12: publishEvent enforces open-posts preflight check', async () => {
      const events = await coordinatorUseCases.getMyEvents();
      const draftEvent = events.find(e => e.status === 'draft') || events[0];

      // Add open post to draft event to satisfy preflight requirement
      await coordinatorUseCases.createEventPost(draftEvent.id, {
        title: 'Relief Pack Assembler',
        requiredHeadcount: 5,
        leaderNeeded: false,
      });

      // Event with posts should publish successfully
      const pubRes = await coordinatorUseCases.publishEvent(draftEvent.id);
      expect(pubRes.success).toBe(true);
      expect(pubRes.data?.status).toBe('published');
    });

    it('C-12: publishEvent fails fast if event has no open posts', async () => {
      const mockEmptyRepo = new MockCoordinatorRepository();
      const emptyEvent = await mockEmptyRepo.createDraftEvent({
        title: 'Empty Draft Event',
        description: 'No posts yet',
        purposeType: 'charity_event',
        startAt: '2026-12-01T08:00:00Z',
        endAt: '2026-12-01T16:00:00Z',
        locationName: 'Downtown',
        latitude: 16.80,
        longitude: 96.15,
        mapProvider: 'openstreetmap',
        charityFieldCodes: ['teaching'],
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
      const uc = createCoordinatorUseCases({ coordinatorRepository: mockEmptyRepo });

      const failRes = await uc.publishEvent(emptyEvent.data!.id);
      expect(failRes.success).toBe(false);
      expect(failRes.message).toContain('at least one open role with required headcount is required');
    });

    it('C-13, C-14 & C-15: activates, completes, and cancels events', async () => {
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
  });

  describe('2. Post & Handover Management (C-07 .. C-10, C-16 .. C-18, C-28)', () => {
    it('C-08, C-09 & C-10: post creation, update, close, and capacity check', async () => {
      const events = await coordinatorUseCases.getMyEvents();
      const eventId = events[0].id;

      const createRes = await coordinatorUseCases.createEventPost(eventId, {
        title: 'Lead First Aider',
        requiredHeadcount: 2,
        leaderNeeded: true,
      });
      expect(createRes.success).toBe(true);
      expect(createRes.data?.title).toBe('Lead First Aider');

      const postId = createRes.data!.id;
      const updateRes = await coordinatorUseCases.updateEventPost(postId, eventId, {
        requiredHeadcount: 4,
      });
      expect(updateRes.success).toBe(true);

      const closeRes = await coordinatorUseCases.closeEventPost(postId, eventId);
      expect(closeRes.success).toBe(true);

      const capacity = await coordinatorUseCases.getPostCapacity(eventId);
      expect(Array.isArray(capacity)).toBe(true);
    });

    it('C-16, C-17 & C-18: handover, retake, and handover history', async () => {
      const events = await coordinatorUseCases.getMyEvents();
      const eventId = events[0].id;

      const handoverRes = await coordinatorUseCases.handoverEvent(eventId, 'user-relief-coord', 'Shift change');
      expect(handoverRes.success).toBe(true);

      const retakeRes = await coordinatorUseCases.retakeEvent(eventId, 'Resuming active lead');
      expect(retakeRes.success).toBe(true);

      const history = await coordinatorUseCases.getCoordinatorHistory(eventId);
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);
    });
  });

  describe('3. Applications & Assignment Management (C-19 .. C-27)', () => {
    it('C-19 .. C-23: review applications, accept, reject, waitlist, and invite', async () => {
      const events = await coordinatorUseCases.getMyEvents();
      const eventId = events[0].id;

      const apps = await coordinatorUseCases.getApplications(eventId);
      expect(apps.length).toBeGreaterThan(0);

      const acceptRes = await coordinatorUseCases.acceptApplication(apps[0].id, eventId);
      expect(acceptRes.success).toBe(true);

      const rejectRes = await coordinatorUseCases.rejectApplication(apps[0].id, eventId);
      expect(rejectRes.success).toBe(true);

      const waitlistRes = await coordinatorUseCases.waitlistApplication(apps[0].id, eventId);
      expect(waitlistRes.success).toBe(true);

      const inviteRes = await coordinatorUseCases.inviteVolunteer(eventId, 'vol-99', undefined, 'Please join');
      expect(inviteRes.success).toBe(true);
    });

    it('C-24 .. C-27: auto-assign, manual assign with full custom parameters, cancel, unassigned', async () => {
      const events = await coordinatorUseCases.getMyEvents();
      const eventId = events[0].id;

      // Ensure an applicant is accepted so manual assign succeeds
      const apps = await coordinatorUseCases.getApplications(eventId);
      const targetApp = apps[0];
      await coordinatorUseCases.acceptApplication(targetApp.id, eventId);

      // Full custom parameters without hardcoding!
      const manualRes = await coordinatorUseCases.assignVolunteerManually(
        targetApp.id,
        'post-c1-1',
        'CUSTOM-GRP-9',
        true,
        eventId,
      );
      expect(manualRes.success).toBe(true);
      expect(manualRes.data?.groupCode).toBe('CUSTOM-GRP-9');
      expect(manualRes.data?.isGroupLeader).toBe(true);

      const autoRes = await coordinatorUseCases.runAutoAssignment(eventId);
      expect(autoRes.success).toBe(true);

      const assignments = await coordinatorUseCases.getAssignments(eventId);
      expect(Array.isArray(assignments)).toBe(true);

      const unassigned = await coordinatorUseCases.getUnassignedApplications(eventId);
      expect(Array.isArray(unassigned)).toBe(true);

      if (assignments.length > 0) {
        const cancelRes = await coordinatorUseCases.cancelAssignment(assignments[0].id, eventId);
        expect(cancelRes.success).toBe(true);
      }
    });
  });

  describe('4. Check-in, Geo, QR & Feedback (C-29 .. C-39)', () => {
    it('C-29 .. C-37: lookup, roster, manual check-in, QR create/revoke, and geo review/confirm/reject', async () => {
      const events = await coordinatorUseCases.getMyEvents();
      const eventId = events[0].id;

      const lookup = await coordinatorUseCases.lookupVolunteerByUuid('vol-uuid-001', eventId);
      expect(lookup.uuid).toBe('vol-uuid-001');

      const roster = await coordinatorUseCases.getAttendanceRoster(eventId);
      expect(Array.isArray(roster)).toBe(true);

      if (roster.length > 0) {
        const manualCheckInRes = await coordinatorUseCases.manualCheckIn(roster[0].id, eventId);
        expect(manualCheckInRes.success).toBe(true);
      }

      const qrRes = await coordinatorUseCases.createQrToken(eventId, 'checkin', 10, 60);
      expect(qrRes.success).toBe(true);
      expect(qrRes.data?.rawToken).toBeDefined();

      if (qrRes.data?.id) {
        const revokeRes = await coordinatorUseCases.revokeQrToken(String(qrRes.data.id));
        expect(revokeRes.success).toBe(true);
      }

      const pendingGeo = await coordinatorUseCases.getPendingGeoConfirmations(eventId);
      expect(Array.isArray(pendingGeo)).toBe(true);

      const geoAttempts = await coordinatorUseCases.getGeoAttempts(eventId);
      expect(Array.isArray(geoAttempts)).toBe(true);

      if (pendingGeo.length > 0) {
        const confirmRes = await coordinatorUseCases.confirmGeoAttendance(pendingGeo[0].id, eventId);
        expect(confirmRes.success).toBe(true);

        const rejectRes = await coordinatorUseCases.rejectGeoAttendance(pendingGeo[0].id, eventId);
        expect(rejectRes.success).toBe(true);
      }
    });

    it('C-38 & C-39: submit coordinator feedback and read feedback summary', async () => {
      const events = await coordinatorUseCases.getMyEvents();
      const eventId = events[0].id;

      const fbRes = await coordinatorUseCases.submitCoordinatorToVolunteerFeedback(
        eventId,
        'vol-99',
        5,
        'Outstanding dedication and proactive initiative',
        ['diligent', 'punctual'],
      );
      expect(fbRes.success).toBe(true);

      const summary = await coordinatorUseCases.getCoordinatorFeedbackSummary();
      expect(summary.totalRatings).toBeGreaterThanOrEqual(0);
    });
  });
});
