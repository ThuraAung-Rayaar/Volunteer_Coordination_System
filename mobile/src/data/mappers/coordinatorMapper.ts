/**
 * @format
 */

import type {
  AttendanceRosterDto,
  CoordinatorApplicationDto,
  CoordinatorAssignmentDto,
  CoordinatorEventListItemDto,
  EventCreateRequestDto,
  EventSummaryViewDto,
} from '../dto/coordinatorDto';
import type {
  AttendanceRecordStatus,
  CheckInMethod,
  CoordinatorApplicationItem,
  CoordinatorApplicationStatus,
  CoordinatorAssignmentItem,
  CoordinatorAssignmentStatus,
  CoordinatorAttendanceItem,
  CoordinatorEventStatus,
  CoordinatorEventSummary,
  CreateEventWizardDraft,
  VolunteerT2Capabilities,
} from '../../domain/models/coordinator';

/**
 * Maps wizard draft to EventCreateRequestDto matching EventCreateSerializer.
 * Translates mobile domain choices into backend allow-listed serializer choices:
 * - leaderStrategy ('first_assigned' | 'highest_rated' -> 'first_experienced')
 * - compensationKind ('stipend' | 'travel_reimbursement' -> 'arranged_outside_system')
 */
export function mapCreateEventDraftToRequest(
  draft: CreateEventWizardDraft,
): EventCreateRequestDto {
  let leaderStrategy: 'none' | 'first_experienced' | 'manual' = 'none';
  if (
    draft.leaderStrategy === 'first_assigned' ||
    draft.leaderStrategy === 'highest_rated'
  ) {
    leaderStrategy = 'first_experienced';
  }

  let compensationKind: 'unpaid' | 'arranged_outside_system' = 'unpaid';
  let compensationNote: string | null = draft.compensationNote ?? null;

  if (
    draft.compensationKind === 'stipend' ||
    draft.compensationKind === 'travel_reimbursement'
  ) {
    compensationKind = 'arranged_outside_system';
    const kindLabel =
      draft.compensationKind === 'stipend'
        ? 'Stipend Support'
        : 'Travel Reimbursement';
    compensationNote = draft.compensationNote
      ? `${kindLabel}: ${draft.compensationNote}`
      : kindLabel;
  }

  return {
    title: draft.title.trim(),
    description: draft.description ? draft.description.trim() : null,
    purpose_type: draft.purposeType,
    location_name: draft.locationName ? draft.locationName.trim() : null,
    landmark_text: draft.landmarkText ? draft.landmarkText.trim() : null,
    latitude: typeof draft.latitude === 'number' ? draft.latitude : null,
    longitude: typeof draft.longitude === 'number' ? draft.longitude : null,
    geo_radius_m: draft.geoRadiusM ?? 100,
    geo_checkin_enabled: Boolean(draft.geoCheckinEnabled),
    geo_checkin_opens_before_min: draft.geoCheckinOpensBeforeMin ?? 30,
    require_checkin_confirmation: Boolean(draft.requireCheckinConfirmation),
    map_provider: draft.mapProvider === 'google' ? 'google' : 'openstreetmap',
    start_at: draft.startAt,
    end_at: draft.endAt,
    application_deadline: draft.applicationDeadline ?? null,
    acceptance_mode: draft.acceptanceMode,
    auto_assign_enabled: Boolean(draft.autoAssignEnabled),
    group_size: draft.groupSize ?? null,
    leader_strategy: leaderStrategy,
    max_participants: draft.maxParticipants ?? null,
    meals_provided: Boolean(draft.mealsProvided),
    lodging_provided: Boolean(draft.lodgingProvided),
    travel_support_provided: Boolean(draft.travelSupportProvided),
    compensation_kind: compensationKind,
    compensation_note: compensationNote,
    onboarding_text: draft.onboardingText ? draft.onboardingText.trim() : null,
    require_onboarding_ack: Boolean(draft.requireOnboardingAck),
    qr_registration_enabled: Boolean(draft.qrRegistrationEnabled),
    charity_field_codes: draft.charityFieldCodes || [],
  };
}

/**
 * Maps coordinator event list item and optional summary view DTO into CoordinatorEventSummary.
 */
export function mapCoordinatorEventSummary(
  dto: CoordinatorEventListItemDto,
  summaryDto?: EventSummaryViewDto | null,
): CoordinatorEventSummary {
  return {
    id: String(dto.id),
    title: dto.title,
    description: '',
    status: dto.status as CoordinatorEventStatus,
    purposeType: 'charity_event',
    startAt: dto.start_at,
    endAt: dto.end_at,
    locationName: 'Event Location',
    landmarkText: undefined,
    charityFields: [],
    ownerId: String(dto.owner_id),
    currentCoordinatorId: String(dto.current_coordinator_id),
    coordinatorName: dto.is_current_coordinator
      ? 'You (Current Coordinator)'
      : 'Assigned Coordinator',
    isOwnerAsMonitor: Boolean(dto.is_read_only_monitor),
    pendingApplicationCount: summaryDto?.pending_count ?? 0,
    acceptedApplicantCount: summaryDto?.accepted_count ?? 0,
    assignedCount: summaryDto?.assignment_count ?? 0,
    checkedInCount: summaryDto?.checked_in_count ?? 0,
  };
}

/**
 * Maps CoordinatorApplicationDto to domain CoordinatorApplicationItem.
 */
export function mapCoordinatorApplication(
  dto: CoordinatorApplicationDto,
  eventId?: string | number,
  eventTitle = 'Volunteer Event',
): CoordinatorApplicationItem {
  let source: 'browse' | 'qr_walkin' | 'invite' = 'browse';
  if (dto.source === 'qr_walkin' || dto.source === 'invite') {
    source = dto.source;
  }

  let t2Capabilities: VolunteerT2Capabilities | undefined = undefined;
  if (dto.status === 'accepted') {
    t2Capabilities = {
      skills: dto.skills || [],
      physicalOk: Boolean(dto.physical_ok),
      goodEyesight: true,
      needsGlasses: false,
      canLiftHeavy: Boolean(dto.can_lift_heavy),
      canWorkOutdoor: true,
      hasLeaderExperience: Boolean(dto.has_leader_experience),
      newToVolunteer: Boolean(dto.new_to_volunteer),
      preferredLanguage: 'en',
      homeArea: '',
      needsMealSupport: false,
      needsTravelSupport: false,
      acceptsUnpaid: true,
      verificationStatus: 'verified',
    };
  }

  return {
    id: String(dto.id),
    eventId: String(eventId ?? ''),
    eventTitle,
    userId: String(dto.user_id),
    applicantName: dto.display_name,
    status: dto.status as CoordinatorApplicationStatus,
    appliedAt: dto.applied_at,
    source,
    postId: dto.post_id !== null && dto.post_id !== undefined ? String(dto.post_id) : undefined,
    postTitle: dto.post_title ?? 'General Volunteer Support',
    t2Capabilities,
  };
}

/**
 * Maps CoordinatorAssignmentDto to domain CoordinatorAssignmentItem.
 */
export function mapCoordinatorAssignment(
  dto: CoordinatorAssignmentDto,
  eventId?: string | number,
  eventTitle = 'Volunteer Event',
): CoordinatorAssignmentItem {
  return {
    id: String(dto.id),
    eventId: String(eventId ?? ''),
    eventTitle,
    applicationId: String(dto.id),
    userId: String(dto.user_id),
    volunteerName: dto.display_name,
    postId: String(dto.post_id ?? ''),
    postTitle: dto.post_title ?? 'Assigned Shift',
    status: dto.status as CoordinatorAssignmentStatus,
    groupCode: dto.group_code ?? undefined,
    isGroupLeader: Boolean(dto.is_group_leader),
    assignedAt: dto.confirmed_at ?? dto.schedule_start,
  };
}

/**
 * Maps AttendanceRosterDto to domain CoordinatorAttendanceItem.
 */
export function mapAttendanceRosterItem(
  dto: AttendanceRosterDto,
  eventTitle = 'Volunteer Event',
): CoordinatorAttendanceItem {
  let status: AttendanceRecordStatus = 'scheduled';
  let isPendingGeoConfirmation = false;

  if (dto.confirmation_status === 'pending') {
    status = 'pending_confirmation';
    isPendingGeoConfirmation = true;
  } else if (dto.attendance_status === 'completed') {
    status = 'completed';
  } else if (dto.attendance_status === 'checked_in') {
    status = 'checked_in';
  } else if (dto.attendance_status === 'absent' || dto.attendance_status === 'excused') {
    status = 'no_show';
  } else {
    status = 'scheduled';
  }

  let checkInMethod: CheckInMethod | undefined = undefined;
  if (dto.method === 'geo' || dto.method === 'qr' || dto.method === 'manual') {
    checkInMethod = dto.method;
  }

  let geoAttempt = undefined;
  if (dto.checkin_distance_m !== null && dto.checkin_distance_m !== undefined) {
    geoAttempt = {
      attemptedAt: dto.checkin_at || new Date().toISOString(),
      withinGeofence: status !== 'pending_confirmation',
      distanceMeters: Number(dto.checkin_distance_m),
      confirmationStatus:
        dto.confirmation_status === 'confirmed' || dto.confirmation_status === 'rejected'
          ? (dto.confirmation_status as 'confirmed' | 'rejected')
          : ('pending' as const),
    };
  }

  return {
    id: String(dto.attendance_id ?? dto.assignment_id),
    eventId: String(dto.event_id),
    eventTitle,
    assignmentId: String(dto.assignment_id),
    userId: String(dto.user_id),
    volunteerName: dto.display_name,
    postTitle: dto.post_title ?? 'General Volunteer',
    groupCode: dto.group_code ?? undefined,
    status,
    checkInMethod,
    checkedInAt: dto.checkin_at ?? undefined,
    isPendingGeoConfirmation,
    geoAttempt,
  };
}
