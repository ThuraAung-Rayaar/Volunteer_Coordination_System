/**
 * @format
 */

import {
  mapAttendanceRosterItem,
  mapCoordinatorApplication,
  mapCoordinatorAssignment,
  mapCoordinatorEventSummary,
  mapCreateEventDraftToRequest,
} from '../coordinatorMapper';
import type {
  AttendanceRosterDto,
  CoordinatorApplicationDto,
  CoordinatorAssignmentDto,
  CoordinatorEventListItemDto,
  EventSummaryViewDto,
} from '../../dto/coordinatorDto';
import type { CreateEventWizardDraft } from '../../../domain/models/coordinator';

describe('coordinatorMapper', () => {
  describe('mapCreateEventDraftToRequest', () => {
    it('correctly normalizes leaderStrategy and compensationKind enum choices', () => {
      const draft: CreateEventWizardDraft = {
        title: 'Community Garden Workshop',
        description: 'Hands-on organic gardening training',
        purposeType: 'charity_event',
        charityFieldCodes: ['environment', 'teaching'],
        locationName: 'People Park Greenhouse',
        landmarkText: 'West Entrance',
        latitude: 16.798,
        longitude: 96.145,
        geoRadiusM: 120,
        geoCheckinEnabled: true,
        geoCheckinOpensBeforeMin: 45,
        requireCheckinConfirmation: true,
        mapProvider: 'openstreetmap',
        startAt: '2026-12-15T08:00:00+06:30',
        endAt: '2026-12-15T12:00:00+06:30',
        applicationDeadline: '2026-12-10T18:00:00+06:30',
        acceptanceMode: 'manual',
        autoAssignEnabled: true,
        groupSize: 5,
        leaderStrategy: 'highest_rated', // Mobile enum to be translated
        maxParticipants: 30,
        mealsProvided: true,
        lodgingProvided: false,
        travelSupportProvided: true,
        compensationKind: 'stipend', // Mobile enum to be translated
        compensationNote: '50,000 MMK daily',
        onboardingText: 'Wear garden boots',
        requireOnboardingAck: true,
        qrRegistrationEnabled: true,
      };

      const requestDto = mapCreateEventDraftToRequest(draft);

      expect(requestDto.title).toBe('Community Garden Workshop');
      // Translated enum: 'highest_rated' -> 'first_experienced'
      expect(requestDto.leader_strategy).toBe('first_experienced');
      // Translated enum: 'stipend' -> 'arranged_outside_system'
      expect(requestDto.compensation_kind).toBe('arranged_outside_system');
      expect(requestDto.compensation_note).toContain('Stipend Support: 50,000 MMK daily');
      expect(requestDto.start_at).toBe('2026-12-15T08:00:00+06:30');
      expect(requestDto.end_at).toBe('2026-12-15T12:00:00+06:30');
      expect(requestDto.application_deadline).toBe('2026-12-10T18:00:00+06:30');
      expect(requestDto.charity_field_codes).toEqual(['environment', 'teaching']);
    });

    it('maps unpaid and none strategy without altering note', () => {
      const draft: CreateEventWizardDraft = {
        title: 'Simple Clean-up',
        purposeType: 'charity_event',
        charityFieldCodes: ['cleaning'],
        locationName: 'Downtown',
        latitude: 16.8,
        longitude: 96.1,
        geoRadiusM: 100,
        geoCheckinEnabled: false,
        geoCheckinOpensBeforeMin: 30,
        requireCheckinConfirmation: false,
        mapProvider: 'openstreetmap',
        startAt: '2026-12-01T09:00:00+06:30',
        endAt: '2026-12-01T11:00:00+06:30',
        acceptanceMode: 'auto',
        autoAssignEnabled: true,
        leaderStrategy: 'none',
        mealsProvided: false,
        lodgingProvided: false,
        travelSupportProvided: false,
        compensationKind: 'unpaid',
        requireOnboardingAck: false,
        qrRegistrationEnabled: false,
      };

      const requestDto = mapCreateEventDraftToRequest(draft);
      expect(requestDto.leader_strategy).toBe('none');
      expect(requestDto.compensation_kind).toBe('unpaid');
      expect(requestDto.compensation_note).toBeNull();
    });
  });

  describe('mapCoordinatorEventSummary', () => {
    it('maps CoordinatorEventListItemDto and binds metrics from summary view', () => {
      const itemDto: CoordinatorEventListItemDto = {
        id: 77,
        title: 'Disaster Relief Logistics',
        description: 'Coordinating emergency food and supply delivery',
        purpose_type: 'help_wanted_event',
        location_name: 'Yangon Relief Depot',
        landmark_text: 'Warehouse 4 Gate B',
        charity_fields: ['disaster_support', 'logistics'],
        status: 'published',
        start_at: '2026-12-20T08:00:00Z',
        end_at: '2026-12-20T17:00:00Z',
        owner_id: 5,
        current_coordinator_id: 5,
        is_owner: true,
        is_current_coordinator: true,
        is_read_only_monitor: false,
        created_at: '2026-11-01T00:00:00Z',
      };

      const summaryDto: EventSummaryViewDto = {
        id: 77,
        title: 'Disaster Relief Logistics',
        status: 'published',
        start_at: '2026-12-20T08:00:00Z',
        end_at: '2026-12-20T17:00:00Z',
        acceptance_mode: 'manual',
        auto_assign_enabled: true,
        max_participants: 40,
        geo_checkin_enabled: true,
        map_provider: 'openstreetmap',
        pending_count: 12,
        accepted_count: 20,
        waitlisted_count: 3,
        assignment_count: 18,
        checked_in_count: 0,
        pending_confirmations: 0,
      };

      const summary = mapCoordinatorEventSummary(itemDto, summaryDto);

      expect(summary.id).toBe('77');
      expect(summary.title).toBe('Disaster Relief Logistics');
      expect(summary.description).toBe('Coordinating emergency food and supply delivery');
      expect(summary.purposeType).toBe('help_wanted_event');
      expect(summary.locationName).toBe('Yangon Relief Depot');
      expect(summary.landmarkText).toBe('Warehouse 4 Gate B');
      expect(summary.charityFields).toEqual(['disaster_support', 'logistics']);
      expect(summary.isOwnerAsMonitor).toBe(false);
      expect(summary.pendingApplicationCount).toBe(12);
      expect(summary.acceptedApplicantCount).toBe(20);
      expect(summary.assignedCount).toBe(18);
      expect(summary.coordinatorName).toBe('You (Current Coordinator)');
    });
  });

  describe('mapCoordinatorApplication & mapCoordinatorAssignment', () => {
    it('maps CoordinatorApplicationDto and sets all 14 t2Capabilities when accepted, undefined when not accepted', () => {
      const appDto: CoordinatorApplicationDto = {
        id: 401,
        user_id: 88,
        display_name: 'Ma Hla Hla',
        post_id: 10,
        post_title: 'Translator',
        source: 'browse',
        status: 'accepted',
        applied_at: '2026-11-12T10:00:00Z',
        decided_at: '2026-11-13T10:00:00Z',
        decided_by_id: 5,
        skills: ['English', 'Burmese'],
        has_leader_experience: true,
        physical_ok: true,
        good_eyesight: true,
        needs_glasses: false,
        can_lift_heavy: true,
        can_work_outdoor: false,
        new_to_volunteer: false,
        preferred_language: 'my',
        home_area: 'Kamayut, Yangon',
        needs_meal_support: true,
        needs_travel_support: false,
        accepts_unpaid: true,
        verification_status: 'verified',
      };

      const item = mapCoordinatorApplication(appDto, '77', 'Relief Event');
      expect(item.id).toBe('401');
      expect(item.eventId).toBe('77');
      expect(item.eventTitle).toBe('Relief Event');
      expect(item.applicantName).toBe('Ma Hla Hla');
      expect(item.postTitle).toBe('Translator');
      expect(item.status).toBe('accepted');
      expect(item.t2Capabilities).toBeDefined();
      expect(item.t2Capabilities?.hasLeaderExperience).toBe(true);
      expect(item.t2Capabilities?.physicalOk).toBe(true);
      expect(item.t2Capabilities?.goodEyesight).toBe(true);
      expect(item.t2Capabilities?.needsGlasses).toBe(false);
      expect(item.t2Capabilities?.canLiftHeavy).toBe(true);
      expect(item.t2Capabilities?.canWorkOutdoor).toBe(false);
      expect(item.t2Capabilities?.newToVolunteer).toBe(false);
      expect(item.t2Capabilities?.preferredLanguage).toBe('my');
      expect(item.t2Capabilities?.homeArea).toBe('Kamayut, Yangon');
      expect(item.t2Capabilities?.needsMealSupport).toBe(true);
      expect(item.t2Capabilities?.needsTravelSupport).toBe(false);
      expect(item.t2Capabilities?.acceptsUnpaid).toBe(true);
      expect(item.t2Capabilities?.verificationStatus).toBe('verified');
      expect(item.t2Capabilities?.skills).toEqual(['English', 'Burmese']);

      // When pending, t2Capabilities must be undefined
      const pendingDto: CoordinatorApplicationDto = {
        ...appDto,
        status: 'pending',
      };
      const pendingItem = mapCoordinatorApplication(pendingDto, '77', 'Relief Event');
      expect(pendingItem.t2Capabilities).toBeUndefined();
    });

    it('maps CoordinatorAssignmentDto truthfully with distinct applicationId and assignedAt', () => {
      const assignDto: CoordinatorAssignmentDto = {
        id: 601,
        application_id: 301,
        user_id: 88,
        display_name: 'Ma Hla Hla',
        post_id: 10,
        post_title: 'Translator',
        group_code: 'GRP-LANG',
        is_group_leader: true,
        status: 'confirmed',
        assigned_by: 'system_auto',
        assigned_at: '2026-11-14T08:00:00Z',
        schedule_start: '2026-12-20T08:00:00Z',
        schedule_end: '2026-12-20T17:00:00Z',
        confirmed_at: '2026-11-15T10:00:00Z',
      };

      const item = mapCoordinatorAssignment(assignDto, '77', 'Relief Event');
      expect(item.id).toBe('601');
      expect(item.applicationId).toBe('301'); // Distinct from id (601)
      expect(item.eventId).toBe('77');
      expect(item.eventTitle).toBe('Relief Event');
      expect(item.volunteerName).toBe('Ma Hla Hla');
      expect(item.isGroupLeader).toBe(true);
      expect(item.groupCode).toBe('GRP-LANG');
      expect(item.status).toBe('confirmed');
      expect(item.assignedAt).toBe('2026-11-14T08:00:00Z'); // Truthful assigned_at, NOT confirmed_at
    });
  });

  describe('mapAttendanceRosterItem', () => {
    it('correctly translates pending confirmation status and geo metadata', () => {
      const rosterDto: AttendanceRosterDto = {
        assignment_id: 501,
        event_id: 77,
        user_id: 88,
        display_name: 'Ma Hla Hla',
        post_id: 10,
        post_title: 'Translator',
        group_code: null,
        is_group_leader: false,
        assignment_status: 'confirmed',
        attendance_id: 901,
        attendance_status: 'checked_in',
        method: 'geo',
        walk_in_flag: false,
        checkin_at: '2026-12-20T07:55:00Z',
        checkin_distance_m: 85.5,
        confirmation_status: 'pending', // Geo checkin awaiting coordinator review
      };

      const item = mapAttendanceRosterItem(rosterDto, 'Relief Event');
      expect(item.id).toBe('901');
      expect(item.status).toBe('pending_confirmation');
      expect(item.isPendingGeoConfirmation).toBe(true);
      expect(item.checkInMethod).toBe('geo');
      expect(item.geoAttempt).toBeDefined();
      expect(item.geoAttempt?.distanceMeters).toBe(85.5);
    });

    it('maps expected attendance status to scheduled', () => {
      const rosterDto: AttendanceRosterDto = {
        assignment_id: 502,
        event_id: 77,
        user_id: 89,
        display_name: 'Ko Min',
        post_id: 11,
        post_title: 'Logistics',
        group_code: null,
        is_group_leader: false,
        assignment_status: 'assigned',
        attendance_id: null,
        attendance_status: 'expected',
        method: null,
        walk_in_flag: false,
        checkin_at: null,
        checkin_distance_m: null,
        confirmation_status: null,
      };

      const item = mapAttendanceRosterItem(rosterDto);
      expect(item.id).toBe('502'); // falls back to assignment_id
      expect(item.status).toBe('scheduled');
      expect(item.isPendingGeoConfirmation).toBe(false);
    });

    it('maps qr_scan to qr and coordinator_manual to manual checkInMethod with distinct statuses', () => {
      const qrDto: AttendanceRosterDto = {
        assignment_id: 503,
        event_id: 77,
        user_id: 90,
        display_name: 'Aung Aung',
        post_id: 12,
        post_title: 'Packer',
        group_code: 'GRP-1',
        is_group_leader: false,
        assignment_status: 'confirmed',
        attendance_id: 903,
        attendance_status: 'checked_in',
        method: 'qr_scan',
        walk_in_flag: false,
        checkin_at: '2026-12-20T08:00:00Z',
        checkin_distance_m: null,
        confirmation_status: 'not_required',
      };

      const qrItem = mapAttendanceRosterItem(qrDto);
      expect(qrItem.checkInMethod).toBe('qr');
      expect(qrItem.status).toBe('checked_in');
      expect(qrItem.attendanceStatus).toBe('checked_in');
      expect(qrItem.confirmationStatus).toBe('not_required');

      const manualDto: AttendanceRosterDto = {
        ...qrDto,
        attendance_id: 904,
        method: 'coordinator_manual',
        confirmation_status: 'confirmed',
      };

      const manualItem = mapAttendanceRosterItem(manualDto);
      expect(manualItem.checkInMethod).toBe('manual');
      expect(manualItem.confirmationStatus).toBe('confirmed');
    });
  });
});
