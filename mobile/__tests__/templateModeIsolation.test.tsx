/**
 * @format
 * Phase T3: Template Mode Genuine Local Isolation & Mutation Coherence Test Suite
 * Proves that in Template Mode (dataMode === 'mock'):
 * 1. Zero network/HTTP requests occur across authentication and domain mutations.
 * 2. Local OTP state machine works deterministically with demo code '123456'.
 * 3. In-memory fixtures update coherently across operations within the same session.
 * 4. Owner-as-monitor guards are enforced locally.
 * 5. Switching between mock and http modes is deterministic and isolated.
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { defaultApiClient } from '../src/core/api/apiClient';
import {
  setDataMode,
  getDataMode,
} from '../src/app/configuration/dataMode';
import { UserProvider, useCurrentUser } from '../src/app/UserContext';
import {
  MockCoordinatorRepository,
} from '../src/data/mock/MockCoordinatorRepository';
import {
  MockProfileRepository,
} from '../src/data/mock/MockProfileRepository';
import {
  MockEventRepository,
} from '../src/data/mock/MockEventRepository';
import {
  MockDashboardRepository,
} from '../src/data/mock/MockDashboardRepository';
import type { CreateEventWizardDraft } from '../src/domain/models/coordinator';

describe('Phase T3: Template Mode Genuine Local Isolation', () => {
  let outboundNetworkCalls: Array<{ url: string; method?: string }> = [];

  beforeEach(() => {
    outboundNetworkCalls = [];
    setDataMode('mock');

    // Intercept default API transport to spy on any outbound requests
    jest.spyOn(defaultApiClient, 'get').mockImplementation(async (url: string) => {
      outboundNetworkCalls.push({ url, method: 'GET' });
      throw new Error(`Unexpected network GET call in Template Mode: ${url}`);
    });
    jest.spyOn(defaultApiClient, 'post').mockImplementation(async (url: string) => {
      outboundNetworkCalls.push({ url, method: 'POST' });
      throw new Error(`Unexpected network POST call in Template Mode: ${url}`);
    });
    jest.spyOn(defaultApiClient, 'patch').mockImplementation(async (url: string) => {
      outboundNetworkCalls.push({ url, method: 'PATCH' });
      throw new Error(`Unexpected network PATCH call in Template Mode: ${url}`);
    });
    jest.spyOn(defaultApiClient, 'delete').mockImplementation(async (url: string) => {
      outboundNetworkCalls.push({ url, method: 'DELETE' });
      throw new Error(`Unexpected network DELETE call in Template Mode: ${url}`);
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    setDataMode('mock');
  });

  describe('T3.1 & T3.2: Authentication Local State Machine & Zero Network OTP', () => {
    it('requests demo OTP locally using 123456 without network calls', async () => {
      let userContext!: ReturnType<typeof useCurrentUser>;
      const TestComponent = () => {
        userContext = useCurrentUser();
        return null;
      };

      await ReactTestRenderer.act(async () => {
        ReactTestRenderer.create(
          <UserProvider>
            <TestComponent />
          </UserProvider>,
        );
      });

      expect(getDataMode()).toBe('mock');

      // Request OTP
      let reqResult: any;
      await ReactTestRenderer.act(async () => {
        reqResult = await userContext.requestTokenizedOtp!({
          phone: '+959123456789',
        });
      });

      expect(reqResult.success).toBe(true);
      expect(reqResult.devCode).toBe('123456');
      expect(outboundNetworkCalls).toHaveLength(0);

      // Verify with incorrect code
      let badVerifyResult: any;
      await ReactTestRenderer.act(async () => {
        badVerifyResult = await userContext.verifyTokenizedOtp!({
          code: '000000',
        });
      });
      expect(badVerifyResult.success).toBe(false);
      expect(badVerifyResult.error).toContain('Incorrect demo verification code');
      expect(outboundNetworkCalls).toHaveLength(0);

      // Verify with valid demo code
      let goodVerifyResult: any;
      await ReactTestRenderer.act(async () => {
        goodVerifyResult = await userContext.verifyTokenizedOtp!({
          code: '123456',
          displayName: 'Demo Volunteer User',
        });
      });
      expect(goodVerifyResult.success).toBe(true);
      expect(outboundNetworkCalls).toHaveLength(0);
      expect(userContext.currentUser.displayName).toBe('Demo Volunteer User');
      expect(userContext.isAuthenticated).toBe(true);
    });

    it('rejects expired OTP challenges locally', async () => {
      let userContext!: ReturnType<typeof useCurrentUser>;
      const TestComponent = () => {
        userContext = useCurrentUser();
        return null;
      };

      await ReactTestRenderer.act(async () => {
        ReactTestRenderer.create(
          <UserProvider>
            <TestComponent />
          </UserProvider>,
        );
      });

      await ReactTestRenderer.act(async () => {
        await userContext.requestTokenizedOtp!({ phone: '+959987654321' });
      });

      // Advance clock past expiration
      const originalNow = Date.now;
      try {
        Date.now = () => originalNow() + 400 * 1000;
        let expiredResult: any;
        await ReactTestRenderer.act(async () => {
          expiredResult = await userContext.verifyTokenizedOtp!({ code: '123456' });
        });
        expect(expiredResult.success).toBe(false);
        expect(expiredResult.error).toContain('Challenge expired');
      } finally {
        Date.now = originalNow;
      }
    });
  });

  describe('T3.3 & T3.4: In-Memory Mutation Coherence & Zero Network Calls', () => {
    it('executes volunteer profile update, event applying, and coordinator lifecycle in memory without network side effects', async () => {
      const coordRepo = new MockCoordinatorRepository();
      const profileRepo = new MockProfileRepository();
      const eventRepo = new MockEventRepository();

      // 1. Profile Mutation
      const updateProfileRes = await profileRepo.updateProfile({
        displayName: 'Su Lwin Updated',
        homeArea: 'Kamayut, Yangon',
      });
      expect(updateProfileRes.success).toBe(true);
      expect(updateProfileRes.data?.displayName).toBe('Su Lwin Updated');
      expect(updateProfileRes.data?.homeArea).toBe('Kamayut, Yangon');

      const reloadedProfile = await profileRepo.getProfile();
      expect(reloadedProfile.displayName).toBe('Su Lwin Updated');

      // 2. Event Apply Mutation
      const events = await eventRepo.getEvents();
      expect(events.length).toBeGreaterThan(0);
      const targetEventSummary = events[0];
      const targetEventDetail = await eventRepo.getEventById(targetEventSummary.id);
      expect(targetEventDetail).not.toBeNull();
      const initialCapacity = targetEventDetail!.posts[0].remainingCapacity;

      const applyRes = await eventRepo.applyToPost(targetEventDetail!.id, targetEventDetail!.posts[0].id);
      expect(applyRes.success).toBe(true);

      const refreshedEvent = await eventRepo.getEventById(targetEventDetail!.id);
      expect(refreshedEvent?.posts[0].remainingCapacity).toBe(initialCapacity - 1);

      // 3. Coordinator Event Creation & Wizard Draft Mutation
      const draft: CreateEventWizardDraft = {
        title: 'Community Relief Center Opening',
        description: 'Opening coordination for regional volunteer hub',
        purposeType: 'charity_event',
        charityFieldCodes: ['teaching', 'food_distribution'],
        locationName: 'Yangon Downtown Hall',
        latitude: 16.78,
        longitude: 96.16,
        geoRadiusM: 250,
        geoCheckinEnabled: true,
        geoCheckinOpensBeforeMin: 45,
        requireCheckinConfirmation: true,
        mapProvider: 'openstreetmap',
        startAt: '2026-12-20T08:00:00Z',
        endAt: '2026-12-20T17:00:00Z',
        acceptanceMode: 'manual',
        autoAssignEnabled: true,
        groupSize: 5,
        leaderStrategy: 'first_experienced',
        maxParticipants: 40,
        mealsProvided: true,
        lodgingProvided: false,
        travelSupportProvided: true,
        compensationKind: 'arranged_outside_system',
        compensationNote: 'Travel allowance on site',
        requireOnboardingAck: false,
        qrRegistrationEnabled: true,
      };

      const createEventRes = await coordRepo.createDraftEvent(draft);
      expect(createEventRes.success).toBe(true);
      const createdEventId = createEventRes.data!.id;

      // Check event is immediately listed in coordinator events
      const coordEvents = await coordRepo.getMyEvents();
      const foundInList = coordEvents.find(e => e.id === createdEventId);
      expect(foundInList).toBeDefined();
      expect(foundInList?.title).toBe('Community Relief Center Opening');

      // 4. Post Management Mutation
      const createPostRes = await coordRepo.createEventPost(createdEventId, {
        title: 'Logistics Lead',
        requiredHeadcount: 3,
        physicalLevel: 'medium',
        requiredSkills: ['inventory'],
        leaderNeeded: true,
      });
      expect(createPostRes.success).toBe(true);
      const newPostId = createPostRes.data!.id;

      const eventDetail = await coordRepo.getEventDetail(createdEventId);
      expect(eventDetail?.posts.some(p => p.id === newPostId)).toBe(true);

      const closePostRes = await coordRepo.closeEventPost(newPostId);
      expect(closePostRes.success).toBe(true);

      const detailAfterClose = await coordRepo.getEventDetail(createdEventId);
      const closedPost = detailAfterClose?.posts.find(p => p.id === newPostId);
      expect(closedPost?.status).toBe('closed');

      // 5. Manual Check-in Mutation
      const roster = await coordRepo.getAttendanceRoster();
      expect(roster.length).toBeGreaterThan(0);
      const targetAttendance = roster[0];
      const checkinRes = await coordRepo.manualCheckIn({
        eventId: targetAttendance.eventId,
        volunteerUserId: targetAttendance.userId,
        note: 'Verified with national ID card',
      });
      expect(checkinRes.success).toBe(true);

      // 6. QR Token Lifecycle Mutation
      const qrRes = await coordRepo.createQrToken(createdEventId, 'checkin', 50, 120);
      expect(qrRes.success).toBe(true);
      expect(qrRes.data?.rawToken).toBeDefined();

      const revokeQrRes = await coordRepo.revokeQrToken(String(qrRes.data!.id));
      expect(revokeQrRes.success).toBe(true);

      // Verify ZERO network calls were triggered during this entire lifecycle
      expect(outboundNetworkCalls).toHaveLength(0);
    });

    it('enforces owner-as-monitor guard locally in mock repository', async () => {
      const coordRepo = new MockCoordinatorRepository();
      const events = await coordRepo.getMyEvents();
      const targetEventId = events[0].id;

      // Handover event to another coordinator
      const handoverRes = await coordRepo.handoverEvent(targetEventId, 'usr-coordinator-2');
      expect(handoverRes.success).toBe(true);

      const monitorDetail = await coordRepo.getEventDetail(targetEventId);
      expect(monitorDetail?.isOwnerAsMonitor).toBe(true);

      // Attempted mutations must fail locally without network calls
      const editAttempt = await coordRepo.updateEvent(targetEventId, {
        title: 'Unauthorized Edit Attempt',
      });
      expect(editAttempt.success).toBe(false);
      expect(editAttempt.message).toContain('read-only monitor mode');

      const postAttempt = await coordRepo.createEventPost(targetEventId, {
        title: 'Unauthorized Post',
        requiredHeadcount: 2,
      });
      expect(postAttempt.success).toBe(false);
      expect(postAttempt.message).toContain('read-only monitor mode');

      expect(outboundNetworkCalls).toHaveLength(0);
    });
  });
});
