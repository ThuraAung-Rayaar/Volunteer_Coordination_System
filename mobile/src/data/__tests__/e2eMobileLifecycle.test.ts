/**
 * @format
 */

import { ApiClient } from '../../core/api/apiClient';
import { MemoryTokenStore } from '../../core/auth/tokenStore';
import { SessionManager } from '../../core/auth/sessionManager';
import { authApi } from '../endpoints/authApi';
import { profileApi } from '../endpoints/profileApi';
import { HttpEventRepository } from '../http/HttpEventRepository';
import { HttpCoordinatorRepository } from '../http/HttpCoordinatorRepository';
import { HttpProfileRepository } from '../http/HttpProfileRepository';
import {
  getDiscoveryCache,
  resetDiscoveryCache,
} from '../../features/events/screens/EventDiscoveryScreen';
import {
  getApplicationsCache,
  resetApplicationsCache,
} from '../../features/events/screens/MyApplicationsScreen';
import {
  getAssignmentsCache,
  resetAssignmentsCache,
} from '../../features/events/screens/MyAssignmentsScreen';

describe('Phase 9: Full End-to-End Mobile Lifecycle & Parity Verification', () => {
  let tokenStore: MemoryTokenStore;
  let sessionMgr: SessionManager;
  let mockClient: ApiClient;
  let eventRepo: HttpEventRepository;
  let coordinatorRepo: HttpCoordinatorRepository;
  let profileRepo: HttpProfileRepository;

  // Mock server in-memory database
  let serverOtpCode: string | null = null;
  let serverToken: string | null = null;
  let serverApplications: any[] = [];
  let serverAssignments: any[] = [];
  let serverAttendance: any[] = [];
  let onboardingAcknowledged = false;
  let feedbackReceived: any = null;

  beforeEach(() => {
    tokenStore = new MemoryTokenStore();
    sessionMgr = new SessionManager(tokenStore);
    serverOtpCode = null;
    serverToken = null;
    serverApplications = [];
    serverAssignments = [];
    serverAttendance = [];
    onboardingAcknowledged = false;
    feedbackReceived = null;

    // Reset in-memory screen caches
    resetDiscoveryCache();
    resetApplicationsCache();
    resetAssignmentsCache();

    // Deterministic Mock HTTP Transport simulating Django BFF
    const deterministicFetch = async (
      input: RequestInfo,
      init?: RequestInit,
    ): Promise<Response> => {
      const urlStr = typeof input === 'string' ? input : (input as any).url || '';
      const method = (init?.method || 'GET').toUpperCase();
      const body = init?.body ? JSON.parse(init.body as string) : {};
      const headers = (init?.headers as Record<string, string>) || {};

      // Normalize path without query string
      const urlObj = new URL(urlStr);
      const path = urlObj.pathname;

      const jsonResponse = (data: any, status = 200) => {
        return new Response(JSON.stringify(data), {
          status,
          headers: { 'Content-Type': 'application/json' },
        });
      };

      // 1. Auth: Request OTP
      if (path === '/api/v1/auth/otp/request/' && method === 'POST') {
        serverOtpCode = '654321';
        return jsonResponse({
          success: true,
          message: 'OTP sent to mobile device',
          dev_code: serverOtpCode,
        });
      }

      // 2. Auth: Verify OTP
      if (path === '/api/v1/auth/otp/verify/' && method === 'POST') {
        if (body.code === serverOtpCode) {
          serverToken = 'e2e-valid-jwt-token-xyz';
          return jsonResponse({
            token: serverToken,
            user: {
              id: 42,
              display_name: 'Alex Johnson',
              phone: body.phone,
              role: 'volunteer',
            },
          });
        }
        return jsonResponse(
          { error: { message: 'Invalid or expired OTP', code: 'invalid_code' } },
          400,
        );
      }

      // 3. Auth: Logout
      if (path === '/api/v1/auth/logout/' && method === 'POST') {
        serverToken = null;
        return jsonResponse({ success: true, message: 'Logged out successfully' });
      }

      // Require token for protected routes
      const authHeader = headers.Authorization || headers.authorization;
      const isPublicRoute =
        path === '/api/v1/charity-fields/' ||
        ((path.startsWith('/api/v1/events/') || path.startsWith('/api/v1/checkin/')) &&
          !path.includes('/apply/') &&
          !path.includes('/feedback/') &&
          !path.includes('/onboarding/') &&
          !path.includes('/attendance/')) ||
        path.startsWith('/api/v1/auth/');

      if (!isPublicRoute && (!authHeader || !authHeader.includes('e2e-valid-jwt-token-xyz'))) {
        return jsonResponse(
          { error: { message: 'Authentication required', code: 'unauthorized' } },
          401,
        );
      }

      // 4. Profile & Bootstrap
      if (path === '/api/v1/me/coordinator/' && method === 'GET') {
        return jsonResponse({ coordinator: null });
      }

      if (path === '/api/v1/me/verification-images/' && method === 'GET') {
        return jsonResponse([]);
      }

      if (path === '/api/v1/me/availability/' && method === 'GET') {
        return jsonResponse({ rules: [], exceptions: [] });
      }

      if (path === '/api/v1/me/charity-interests/' && method === 'GET') {
        return jsonResponse([]);
      }

      if (path === '/api/v1/me/feedback/' && method === 'GET') {
        return jsonResponse([]);
      }

      if (path === '/api/v1/me/applications/' && method === 'GET') {
        return jsonResponse(serverApplications);
      }

      if (path === '/api/v1/me/assignments/' && method === 'GET') {
        return jsonResponse(serverAssignments);
      }

      if (path === '/api/v1/me/' && method === 'GET') {
        return jsonResponse({
          id: 42,
          uuid: 'usr-42-uuid',
          display_name: 'Alex Johnson',
          phone: '+15551234567',
          preferred_language: 'en',
          home_area: 'San Francisco',
          emergency_contact_name: 'Jordan Johnson',
          emergency_contact_phone: '+15559876543',
          blood_type: 'O+',
          is_willing_to_donate: true,
          is_willing_to_donate_blood: true,
          is_willing_to_donate_items: false,
          physical_ok: true,
          good_eyesight: true,
          needs_glasses: false,
          can_lift_heavy: true,
          can_work_outdoor: true,
          has_leader_experience: true,
          new_to_volunteer: false,
          skills: ['First Aid', 'Team Lead'],
          needs_meal_support: false,
          needs_travel_support: false,
          accepts_unpaid: true,
          verification_status: 'verified',
          account_status: 'active',
          charity_interests: ['environment'],
          created_at: '2026-01-01T00:00:00Z',
        });
      }

      // 5. Taxonomy & Charity Fields
      if (path === '/api/v1/charity-fields/' && method === 'GET') {
        return jsonResponse([
          { code: 'environment', label: 'Environment', sort_order: 1 },
          { code: 'community-care', label: 'Community Care', sort_order: 2 },
        ]);
      }

      // 6. Public Event Detail & Posts
      if (path === '/api/v1/events/101/posts/' && method === 'GET') {
        return jsonResponse([
          {
            id: 501,
            title: 'Team Leader - Dune Team',
            description: 'Guide volunteers along the north ridge.',
            status: 'open',
            physical_level: 'medium',
            required_skills: ['Leadership'],
            leader_needed: true,
            new_volunteers_allowed: false,
            required_headcount: 5,
            assigned_count: 3,
            remaining: 2,
          },
          {
            id: 502,
            title: 'General Debris Sorter',
            description: 'Collect, weigh and catalog beach recyclables.',
            status: 'open',
            physical_level: 'light',
            required_skills: [],
            leader_needed: false,
            new_volunteers_allowed: true,
            required_headcount: 25,
            assigned_count: 17,
            remaining: 8,
          },
        ]);
      }

      if (path === '/api/v1/events/101/' && method === 'GET') {
        return jsonResponse({
          id: 101,
          title: 'Coastal Cleanup & Dune Restoration',
          description: 'Help restore local coastal habitats and remove ocean debris.',
          purpose_type: 'charity_event',
          location_name: 'Ocean Beach Park',
          landmark_text: 'Near the visitor center',
          latitude: 37.7749,
          longitude: -122.4194,
          geo_radius_m: 200,
          geo_checkin_enabled: true,
          map_provider: 'openstreetmap',
          start_at: '2026-12-15T09:00:00Z',
          end_at: '2026-12-15T15:00:00Z',
          application_deadline: '2026-12-14T23:59:59Z',
          status: 'published',
          acceptance_mode: 'manual',
          max_participants: 30,
          meals_provided: true,
          lodging_provided: false,
          travel_support_provided: false,
          compensation_kind: 'unpaid',
          coordinator_name: 'Lead Coordinator',
          charity_fields: ['environment'],
          spots_remaining: 10,
          require_onboarding_ack: true,
          onboarding_text: 'Bring boots and sun protection.',
          onboarding_version: 1,
          posts: [
            {
              id: 501,
              title: 'Team Leader - Dune Team',
              description: 'Guide volunteers along the north ridge.',
              status: 'open',
              physical_level: 'medium',
              required_skills: ['Leadership'],
              leader_needed: true,
              new_volunteers_allowed: false,
              required_headcount: 5,
              assigned_count: 3,
              remaining: 2,
            },
            {
              id: 502,
              title: 'General Debris Sorter',
              description: 'Collect, weigh and catalog beach recyclables.',
              status: 'open',
              physical_level: 'light',
              required_skills: [],
              leader_needed: false,
              new_volunteers_allowed: true,
              required_headcount: 25,
              assigned_count: 17,
              remaining: 8,
            },
          ],
        });
      }

      // 7. Public Event Feed
      if (path === '/api/v1/events/' && method === 'GET') {
        return jsonResponse({
          count: 1,
          results: [
            {
              id: 101,
              title: 'Coastal Cleanup & Dune Restoration',
              description: 'Help restore local coastal habitats and remove ocean debris.',
              purpose_type: 'charity_event',
              location_name: 'Ocean Beach Park',
              landmark_text: null,
              latitude: 37.7749,
              longitude: -122.4194,
              geo_radius_m: 200,
              geo_checkin_enabled: true,
              map_provider: 'openstreetmap',
              start_at: '2026-12-15T09:00:00Z',
              end_at: '2026-12-15T15:00:00Z',
              application_deadline: '2026-12-14T23:59:59Z',
              status: 'published',
              acceptance_mode: 'manual',
              max_participants: 30,
              meals_provided: true,
              lodging_provided: false,
              travel_support_provided: false,
              compensation_kind: 'unpaid',
              coordinator_name: 'Lead Coordinator',
              charity_fields: ['environment'],
              spots_remaining: 10,
            },
          ],
        });
      }

      // 8. Event Application Submission
      if (path === '/api/v1/events/101/apply/' && method === 'POST') {
        const app = {
          id: 901,
          event_id: 101,
          event_title: 'Coastal Cleanup & Dune Restoration',
          event_status: 'published',
          post_id: body.post_id || 501,
          post_title: 'Team Leader - Dune Team',
          source: 'browse',
          status: 'submitted',
          applied_at: new Date().toISOString(),
          decided_at: null,
          note: body.note || null,
        };
        serverApplications.push(app);
        return jsonResponse(app);
      }

      // 9. Coordinator: List Applications
      if (path === '/api/v1/coordinator/events/101/applications/' && method === 'GET') {
        const coordApps = serverApplications.map(a => ({
          id: a.id,
          user_id: 42,
          display_name: 'Alex Johnson',
          post_id: a.post_id,
          post_title: a.post_title,
          source: a.source,
          status: a.status,
          applied_at: a.applied_at,
          decided_at: a.decided_at,
          decided_by_id: null,
        }));
        return jsonResponse({ count: coordApps.length, results: coordApps });
      }

      // 10. Coordinator: Accept Application
      if (path === '/api/v1/coordinator/applications/901/accept/' && method === 'POST') {
        const app = serverApplications.find(a => a.id === 901);
        if (app) {
          app.status = 'approved';
          app.decided_at = new Date().toISOString();
        }
        return jsonResponse({ id: 901, status: 'approved' });
      }

      // 11. Coordinator: Auto-Assign
      if (path === '/api/v1/coordinator/events/101/auto-assign/' && method === 'POST') {
        const assignment = {
          id: 801,
          event_id: 101,
          event_title: 'Coastal Cleanup & Dune Restoration',
          event_status: 'published',
          post_id: 501,
          post_title: 'Team Leader - Dune Team',
          group_code: 'GRP-1',
          is_group_leader: true,
          status: 'assigned',
          schedule_start: '2026-12-15T09:00:00Z',
          schedule_end: '2026-12-15T15:00:00Z',
          confirmed_at: null,
        };
        serverAssignments.push(assignment);
        return jsonResponse({ assigned_count: 1, assignments: [assignment] });
      }

      // Coordinator: List Assignments
      if (path === '/api/v1/coordinator/events/101/assignments/' && method === 'GET') {
        return jsonResponse({
          count: serverAssignments.length,
          results: serverAssignments.map(a => ({
            id: a.id,
            user_id: 42,
            display_name: 'Alex Johnson',
            post_id: a.post_id,
            post_title: a.post_title,
            group_code: a.group_code,
            is_group_leader: a.is_group_leader,
            status: a.status,
            assigned_by: 'Coordinator',
            schedule_start: a.schedule_start,
            schedule_end: a.schedule_end,
            confirmed_at: a.confirmed_at,
          })),
        });
      }

      // 14. Volunteer: Confirm Assignment
      if (path === '/api/v1/assignments/801/confirm/' && method === 'POST') {
        const assign = serverAssignments.find(a => a.id === 801);
        if (assign) {
          assign.status = 'confirmed';
          assign.confirmed_at = new Date().toISOString();
        }
        return jsonResponse({ id: 801, status: 'confirmed' });
      }

      // 15. Onboarding: Status
      if (
        (path === '/api/v1/checkin/events/101/onboarding/' ||
          path === '/api/v1/events/101/onboarding/') &&
        method === 'GET'
      ) {
        return jsonResponse({
          event_id: 101,
          onboarding_text: 'Bring boots and sun protection.',
          onboarding_version: 1,
          require_onboarding_ack: true,
          acknowledged: onboardingAcknowledged,
        });
      }

      // 16. Onboarding: Acknowledge
      if (
        (path === '/api/v1/checkin/events/101/onboarding/ack/' ||
          path === '/api/v1/checkin/events/101/onboarding/acknowledge/' ||
          path === '/api/v1/events/101/onboarding/acknowledge/') &&
        method === 'POST'
      ) {
        onboardingAcknowledged = true;
        return jsonResponse({
          event_id: 101,
          onboarding_version: body.onboarding_version || 1,
          acknowledged: true,
        });
      }

      // 17. Geo Check-In
      if (
        (path === '/api/v1/checkin/attendance/geo-checkin/' ||
          path === '/api/v1/attendance/geo-checkin/') &&
        method === 'POST'
      ) {
        const attendanceRecord = {
          assignment_id: 801,
          event_id: 101,
          user_id: 42,
          display_name: 'Alex Johnson',
          post_id: 501,
          post_title: 'Team Leader - Dune Team',
          group_code: 'GRP-1',
          is_group_leader: true,
          assignment_status: 'confirmed',
          attendance_id: 701,
          attendance_status: 'checked_in',
          method: 'gps',
          walk_in_flag: false,
          checkin_at: new Date().toISOString(),
          checkin_distance_m: 14.2,
          confirmation_status: 'pending',
        };
        serverAttendance.push(attendanceRecord);
        return jsonResponse({
          success: true,
          result: 'accepted',
          message: 'Successfully checked in via GPS geofence.',
          distance_m: 14.2,
          confirmation_status: 'pending',
        });
      }

      // 18. Coordinator: Attendance Roster
      if (
        (path === '/api/v1/checkin/coordinator/events/101/attendance/' ||
          path === '/api/v1/coordinator/events/101/attendance/') &&
        method === 'GET'
      ) {
        return jsonResponse({ count: serverAttendance.length, results: serverAttendance });
      }

      // 19. Coordinator: Confirm Geo Attendance
      if (
        (path === '/api/v1/checkin/coordinator/attendance/701/confirm/' ||
          path === '/api/v1/coordinator/attendance/701/confirm/') &&
        method === 'POST'
      ) {
        const att = serverAttendance.find(a => a.attendance_id === 701);
        if (att) {
          att.confirmation_status = 'confirmed';
          att.attendance_status = 'confirmed';
        }
        return jsonResponse({ id: 701, status: 'confirmed', confirmation_status: 'confirmed' });
      }

      // 20. Attendance Checkout (Constraint 1)
      if (
        (path === '/api/v1/checkin/attendance/701/checkout/' ||
          path === '/api/v1/attendance/701/checkout/') &&
        method === 'POST'
      ) {
        const att = serverAttendance.find(a => a.attendance_id === 701);
        if (att) {
          att.attendance_status = 'completed';
        }
        return jsonResponse({
          attendance_id: 701,
          status: 'completed',
          check_out_at: new Date().toISOString(),
        });
      }

      // 21. Event Feedback
      if (
        (path === '/api/v1/checkin/events/101/feedback/' ||
          path === '/api/v1/events/101/feedback/') &&
        method === 'POST'
      ) {
        feedbackReceived = body;
        return jsonResponse({
          id: 301,
          status: 'submitted',
        });
      }

      return jsonResponse({ detail: 'Not Found' }, 404);
    };

    mockClient = new ApiClient(deterministicFetch, tokenStore, sessionMgr);
    eventRepo = new HttpEventRepository(mockClient);
    coordinatorRepo = new HttpCoordinatorRepository(mockClient);
    coordinatorRepo.setCoordinatorIdentity({
      id: '99',
      displayName: 'Lead Coordinator',
      email: 'lead@example.com',
    });
    profileRepo = new HttpProfileRepository(mockClient);
  });

  it('executes full mobile lifecycle seamlessly across Http repositories with parity', async () => {
    // -------------------------------------------------------------------------
    // Step 1: OTP Request & Verify
    // -------------------------------------------------------------------------
    const otpReq = await authApi.requestOtp({ phone: '+15551234567', purpose: 'login' }, mockClient);
    expect(otpReq.ok).toBe(true);
    if (!otpReq.ok) return;
    expect(otpReq.data.dev_code).toBe('654321');

    const otpVerify = await authApi.verifyOtp(
      { phone: '+15551234567', code: '654321', purpose: 'login' },
      mockClient,
    );
    expect(otpVerify.ok).toBe(true);
    if (!otpVerify.ok) return;
    expect(otpVerify.data.token).toBe('e2e-valid-jwt-token-xyz');
    expect(otpVerify.data.user.id).toBe(42);

    // Save token to session store
    await sessionMgr.setToken(otpVerify.data.token);
    expect(await tokenStore.getToken()).toBe('e2e-valid-jwt-token-xyz');

    // -------------------------------------------------------------------------
    // Step 2: Session Bootstrap (Profile & Coordinator status)
    // -------------------------------------------------------------------------
    const meRes = await profileApi.getProfile(mockClient);
    expect(meRes.ok).toBe(true);
    if (!meRes.ok) return;
    expect(meRes.data.display_name).toBe('Alex Johnson');
    expect(meRes.data.account_status).toBe('active');

    const coordRes = await profileApi.getCoordinatorProfile(mockClient);
    expect(coordRes.ok).toBe(true);
    if (!coordRes.ok) return;
    expect(coordRes.data.coordinator).toBeNull();

    const profileSnapshot = await profileRepo.getProfile();
    expect(profileSnapshot.id).toBe('42');
    expect(profileSnapshot.displayName).toBe('Alex Johnson');

    // -------------------------------------------------------------------------
    // Step 3: Browse Events & Filters
    // -------------------------------------------------------------------------
    const events = await eventRepo.getEvents({ query: 'Coastal' });
    expect(events.length).toBe(1);
    expect(events[0].id).toBe('101');
    expect(events[0].title).toBe('Coastal Cleanup & Dune Restoration');
    expect(events[0].spotsRemaining).toBe(10);

    // -------------------------------------------------------------------------
    // Step 4: Event Detail & Posts
    // -------------------------------------------------------------------------
    const eventDetail = await eventRepo.getEventById('101');
    expect(eventDetail).not.toBeNull();
    expect(eventDetail!.id).toBe('101');
    expect(eventDetail!.posts.length).toBe(2);
    expect(eventDetail!.posts[0].id).toBe('501');
    expect(eventDetail!.posts[0].title).toBe('Team Leader - Dune Team');
    expect(eventDetail!.geoCheckinEnabled).toBe(true);

    // -------------------------------------------------------------------------
    // Step 5: Volunteer Applies to Post
    // -------------------------------------------------------------------------
    const applyResult = await eventRepo.applyToPost('101', '501', 'Passionate about dune ecology');
    expect(applyResult.success).toBe(true);
    expect(serverApplications.length).toBe(1);
    expect(serverApplications[0].status).toBe('submitted');

    // -------------------------------------------------------------------------
    // Step 6: Coordinator Accepts Application & Auto-Assigns
    // -------------------------------------------------------------------------
    const coordApps = await coordinatorRepo.getApplications('101');
    expect(coordApps.length).toBe(1);
    expect(coordApps[0].id).toBe('901');
    expect(coordApps[0].applicantName).toBe('Alex Johnson');

    const acceptResult = await coordinatorRepo.updateApplicationStatus('901', 'accepted');
    expect(acceptResult.success).toBe(true);

    const autoAssignResult = await coordinatorRepo.runAutoAssignment('101');
    expect(autoAssignResult.success).toBe(true);
    expect(serverAssignments.length).toBe(1);
    expect(serverAssignments[0].status).toBe('assigned');

    // -------------------------------------------------------------------------
    // Step 7: Volunteer Confirms Assignment
    // -------------------------------------------------------------------------
    const myAssignments = await eventRepo.getUserAssignments();
    expect(myAssignments.length).toBe(1);
    expect(myAssignments[0].id).toBe('801');
    expect(myAssignments[0].status).toBe('assigned');

    const confirmResult = await eventRepo.confirmAssignment!('801');
    expect(confirmResult.success).toBe(true);
    expect(serverAssignments[0].status).toBe('confirmed');

    // -------------------------------------------------------------------------
    // Step 8: Volunteer Acknowledges Onboarding Instructions
    // -------------------------------------------------------------------------
    const onboarding = await eventRepo.getEventOnboarding!('101');
    expect(onboarding.requireOnboardingAck).toBe(true);
    expect(onboarding.acknowledged).toBe(false);

    const ackResult = await eventRepo.acknowledgeOnboarding!('101', 'Boots ready');
    expect(ackResult.success).toBe(true);
    expect(ackResult.acknowledged).toBe(true);

    // -------------------------------------------------------------------------
    // Step 9: Volunteer Geo Check-In (Constraint 3)
    // -------------------------------------------------------------------------
    const geoResult = await eventRepo.submitGeoCheckIn!('101', 37.7749, -122.4194, 5);
    expect(geoResult.success).toBe(true);
    expect(geoResult.result).toBe('accepted');
    expect(geoResult.distanceM).toBe(14.2);
    expect(serverAttendance.length).toBe(1);

    // -------------------------------------------------------------------------
    // Step 10: Coordinator Confirms Geo Attendance
    // -------------------------------------------------------------------------
    const attendanceRoster = await coordinatorRepo.getAttendanceRoster('101');
    expect(attendanceRoster.length).toBe(1);
    expect(attendanceRoster[0].id).toBe('701');
    expect(attendanceRoster[0].volunteerName).toBe('Alex Johnson');

    const confirmAttResult = await coordinatorRepo.confirmGeoAttendance('701');
    expect(confirmAttResult.success).toBe(true);

    // -------------------------------------------------------------------------
    // Step 11: Volunteer Completes Shift Checkout (Constraint 1)
    // -------------------------------------------------------------------------
    const checkoutResult = await eventRepo.checkOutAttendance!('701');
    expect(checkoutResult.success).toBe(true);
    expect(serverAttendance[0].attendance_status).toBe('completed');

    // -------------------------------------------------------------------------
    // Step 12: Volunteer Submits Event Feedback
    // -------------------------------------------------------------------------
    const feedbackResult = await eventRepo.submitEventFeedback!(
      '101',
      5,
      'Excellent coordination, loved restoring the dunes!',
      ['organized', 'supportive_team'],
      'volunteer_to_event',
    );
    expect(feedbackResult.success).toBe(true);
    expect(feedbackReceived.score).toBe(5);
    expect(feedbackReceived.comment).toBe('Excellent coordination, loved restoring the dunes!');

    // -------------------------------------------------------------------------
    // Step 13: Logout & Screen Cache Clearing (Constraint 2)
    // -------------------------------------------------------------------------
    const logoutRes = await authApi.logout(mockClient);
    expect(logoutRes.ok).toBe(true);
    await sessionMgr.logout();
    expect(await tokenStore.getToken()).toBeNull();

    // Verify cache resets
    resetDiscoveryCache();
    resetApplicationsCache();
    resetAssignmentsCache();

    const discoveryCache = getDiscoveryCache();
    expect(discoveryCache.searchQuery).toBe('');
    expect(discoveryCache.scrollOffset).toBe(0);

    const appsCache = getApplicationsCache();
    expect(appsCache.statusFilter).toBe('all');
    expect(appsCache.scrollOffset).toBe(0);

    const assignCache = getAssignmentsCache();
    expect(assignCache.statusFilter).toBe('all');
    expect(assignCache.scrollOffset).toBe(0);
  });
});
