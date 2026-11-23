/**
 * @format
 */

import type {
  AttendanceRosterDto,
  CoordinatorApplicationDto,
  CoordinatorAssignmentDto,
  CoordinatorEventListItemDto,
  CoordinatorHistoryItemDto,
  EventCreateRequestDto,
  EventPostCapacityDto,
  EventSummaryViewDto,
  ManualAssignResultDto,
} from '../dto/coordinatorDto';
import type { GeoAttemptReviewDto } from '../dto/checkinDto';
import type { UserUuidLookupDto } from '../dto/profileDto';
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
  CoordinatorHistoryItem,
  CreateEventWizardDraft,
  EventPostCapacity,
  EventPurposeType,
  GeoAttemptReview,
  VolunteerT2Capabilities,
  VolunteerUuidLookup,
} from '../../domain/models/coordinator';
import type { CharityCategoryCode } from '../../domain/models/event';

/**
 * Maps the event wizard draft directly to the current BFF allow-list contract.
 * Domain choices match EventCreateSerializer, so a selected value is never
 * silently translated into a different meaning.
 */
export function mapCreateEventDraftToRequest(
  draft: CreateEventWizardDraft,
): EventCreateRequestDto {
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
    map_provider: draft.mapProvider,
    start_at: draft.startAt,
    end_at: draft.endAt,
    application_deadline: draft.applicationDeadline ?? null,
    acceptance_mode: draft.acceptanceMode,
    auto_assign_enabled: Boolean(draft.autoAssignEnabled),
    group_size: draft.groupSize ?? null,
    leader_strategy: draft.leaderStrategy,
    max_participants: draft.maxParticipants ?? null,
    meals_provided: Boolean(draft.mealsProvided),
    lodging_provided: Boolean(draft.lodgingProvided),
    travel_support_provided: Boolean(draft.travelSupportProvided),
    compensation_kind: draft.compensationKind,
    compensation_note: draft.compensationNote ?? null,
    onboarding_text: draft.onboardingText ? draft.onboardingText.trim() : null,
    require_onboarding_ack: Boolean(draft.requireOnboardingAck),
    qr_registration_enabled: Boolean(draft.qrRegistrationEnabled),
    charity_field_codes: draft.charityFieldCodes || [],
    publish: Boolean(draft.publish),
  };
}

/**
 * Maps only fields explicitly provided for an event PATCH.
 * A partial edit must not inherit defaults from the create-event mapper.
 */
export function mapEventUpdateDraftToRequest(
  draft: Partial<CreateEventWizardDraft>,
): Partial<EventCreateRequestDto> {
  const payload: Partial<EventCreateRequestDto> = {};

  if (draft.title !== undefined) payload.title = draft.title.trim();
  if (draft.description !== undefined) payload.description = draft.description?.trim() || null;
  if (draft.purposeType !== undefined) payload.purpose_type = draft.purposeType;
  if (draft.charityFieldCodes !== undefined) payload.charity_field_codes = [...draft.charityFieldCodes];
  if (draft.locationName !== undefined) payload.location_name = draft.locationName.trim() || null;
  if (draft.landmarkText !== undefined) payload.landmark_text = draft.landmarkText?.trim() || null;
  if (draft.latitude !== undefined) payload.latitude = draft.latitude;
  if (draft.longitude !== undefined) payload.longitude = draft.longitude;
  if (draft.geoRadiusM !== undefined) payload.geo_radius_m = draft.geoRadiusM;
  if (draft.geoCheckinEnabled !== undefined) payload.geo_checkin_enabled = draft.geoCheckinEnabled;
  if (draft.geoCheckinOpensBeforeMin !== undefined) payload.geo_checkin_opens_before_min = draft.geoCheckinOpensBeforeMin;
  if (draft.requireCheckinConfirmation !== undefined) payload.require_checkin_confirmation = draft.requireCheckinConfirmation;
  if (draft.mapProvider !== undefined) payload.map_provider = draft.mapProvider;
  if (draft.startAt !== undefined) payload.start_at = draft.startAt;
  if (draft.endAt !== undefined) payload.end_at = draft.endAt;
  if (draft.applicationDeadline !== undefined) payload.application_deadline = draft.applicationDeadline || null;
  if (draft.acceptanceMode !== undefined) payload.acceptance_mode = draft.acceptanceMode;
  if (draft.autoAssignEnabled !== undefined) payload.auto_assign_enabled = draft.autoAssignEnabled;
  if (draft.groupSize !== undefined) payload.group_size = draft.groupSize;
  if (draft.leaderStrategy !== undefined) payload.leader_strategy = draft.leaderStrategy;
  if (draft.maxParticipants !== undefined) payload.max_participants = draft.maxParticipants;
  if (draft.mealsProvided !== undefined) payload.meals_provided = draft.mealsProvided;
  if (draft.lodgingProvided !== undefined) payload.lodging_provided = draft.lodgingProvided;
  if (draft.travelSupportProvided !== undefined) payload.travel_support_provided = draft.travelSupportProvided;
  if (draft.compensationKind !== undefined) payload.compensation_kind = draft.compensationKind;
  if (draft.compensationNote !== undefined) payload.compensation_note = draft.compensationNote?.trim() || null;
  if (draft.onboardingText !== undefined) payload.onboarding_text = draft.onboardingText?.trim() || null;
  if (draft.requireOnboardingAck !== undefined) payload.require_onboarding_ack = draft.requireOnboardingAck;
  if (draft.qrRegistrationEnabled !== undefined) payload.qr_registration_enabled = draft.qrRegistrationEnabled;

  return payload;
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
    description: dto.description ?? '',
    status: dto.status as CoordinatorEventStatus,
    purposeType: (dto.purpose_type as EventPurposeType) || 'charity_event',
    startAt: dto.start_at,
    endAt: dto.end_at,
    locationName: dto.location_name || '',
    landmarkText: dto.landmark_text ?? undefined,
    charityFields: (dto.charity_fields || []) as CharityCategoryCode[],
    ownerId: String(dto.owner_id),
    currentCoordinatorId: String(dto.current_coordinator_id),
    coordinatorName:
      dto.coordinator_name ||
      (dto.is_current_coordinator
        ? 'You (Current Coordinator)'
        : 'Assigned Coordinator'),
    isOwnerAsMonitor: Boolean(dto.is_read_only_monitor),
    pendingApplicationCount: summaryDto?.pending_count ?? 0,
    acceptedApplicantCount: summaryDto?.accepted_count ?? 0,
    assignedCount: summaryDto?.assignment_count ?? 0,
    checkedInCount: summaryDto?.checked_in_count ?? 0,
    checkedInTodayCount:
      typeof summaryDto?.checked_in_today_count === 'number'
        ? summaryDto.checked_in_today_count
        : summaryDto?.checked_in_count ?? 0,
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
      skills: Array.isArray(dto.skills) ? dto.skills : [],
      physicalOk: Boolean(dto.physical_ok),
      goodEyesight: Boolean(dto.good_eyesight),
      needsGlasses: Boolean(dto.needs_glasses),
      canLiftHeavy: Boolean(dto.can_lift_heavy),
      canWorkOutdoor: Boolean(dto.can_work_outdoor),
      hasLeaderExperience: Boolean(dto.has_leader_experience),
      newToVolunteer: Boolean(dto.new_to_volunteer),
      preferredLanguage: dto.preferred_language || 'en',
      homeArea: dto.home_area || '',
      needsMealSupport: Boolean(dto.needs_meal_support),
      needsTravelSupport: Boolean(dto.needs_travel_support),
      acceptsUnpaid: Boolean(dto.accepts_unpaid),
      verificationStatus: dto.verification_status || 'none',
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
    postId:
      dto.post_id !== null && dto.post_id !== undefined
        ? String(dto.post_id)
        : undefined,
    postTitle: dto.post_title ?? 'General Volunteer Support',
    t2Capabilities,
  };
}

/**
 * Maps CoordinatorAssignmentDto or ManualAssignResultDto to domain CoordinatorAssignmentItem.
 */
export function mapCoordinatorAssignment(
  dto: CoordinatorAssignmentDto | ManualAssignResultDto,
  eventId?: string | number,
  eventTitle = 'Volunteer Event',
): CoordinatorAssignmentItem {
  const assignId =
    'id' in dto && dto.id != null
      ? dto.id
      : 'assignment_id' in dto && dto.assignment_id != null
      ? dto.assignment_id
      : '';
  const appId =
    'application_id' in dto && dto.application_id != null
      ? dto.application_id
      : '';
  const userId =
    'user_id' in dto && dto.user_id != null ? dto.user_id : '';
  const volunteerName =
    'display_name' in dto && dto.display_name ? dto.display_name : 'Volunteer';
  const postId =
    'post_id' in dto && dto.post_id != null ? dto.post_id : '';
  const postTitle =
    'post_title' in dto && dto.post_title ? dto.post_title : 'Assigned Shift';
  const status =
    'status' in dto && dto.status ? dto.status : 'assigned';
  const groupCode =
    'group_code' in dto && dto.group_code ? dto.group_code : undefined;
  const isGroupLeader =
    'is_group_leader' in dto && dto.is_group_leader != null
      ? Boolean(dto.is_group_leader)
      : false;
  const assignedAt =
    ('assigned_at' in dto && dto.assigned_at) ||
    ('schedule_start' in dto && dto.schedule_start) ||
    '';

  return {
    id: String(assignId),
    eventId: String(eventId ?? ''),
    eventTitle,
    applicationId: String(appId),
    userId: String(userId),
    volunteerName,
    postId: String(postId),
    postTitle,
    status: status as CoordinatorAssignmentStatus,
    groupCode,
    isGroupLeader,
    assignedAt,
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
  if (dto.method) {
    if (dto.method === 'qr_scan' || dto.method === 'qr') {
      checkInMethod = 'qr';
    } else if (dto.method === 'coordinator_manual' || dto.method === 'manual') {
      checkInMethod = 'manual';
    } else if (dto.method === 'geo') {
      checkInMethod = 'geo';
    } else if (dto.method === 'system') {
      checkInMethod = 'system';
    }
  }

  let geoAttempt = undefined;
  if (dto.checkin_distance_m !== null && dto.checkin_distance_m !== undefined) {
    geoAttempt = {
      attemptedAt: dto.checkin_at || '',
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
    attendanceStatus: (dto.attendance_status as any) ?? null,
    confirmationStatus: (dto.confirmation_status as any) ?? null,
    checkInMethod,
    checkedInAt: dto.checkin_at ?? undefined,
    isPendingGeoConfirmation,
    geoAttempt,
  };
}

/**
 * Maps CoordinatorHistoryItemDto to domain CoordinatorHistoryItem (C-18 / P1-05).
 */
export function mapCoordinatorHistoryItem(
  dto: CoordinatorHistoryItemDto,
): CoordinatorHistoryItem {
  return {
    id: String(dto.id),
    eventId: String(dto.event_id),
    eventTitle: dto.event_title,
    changeType: dto.change_type,
    previousCoordinatorId:
      dto.previous_coordinator_id != null
        ? String(dto.previous_coordinator_id)
        : null,
    previousCoordinatorName: dto.previous_coordinator_name,
    newCoordinatorId: String(dto.new_coordinator_id),
    newCoordinatorName: dto.new_coordinator_name,
    changedById: String(dto.changed_by_id),
    changedByName: dto.changed_by_name,
    reason: dto.reason,
    changedAt: dto.changed_at,
  };
}

/**
 * Maps EventPostCapacityDto to domain EventPostCapacity (C-28 / P1-05).
 */
export function mapEventPostCapacity(
  dto: EventPostCapacityDto,
): EventPostCapacity {
  return {
    postId: String(dto.post_id),
    title: dto.title,
    status: dto.status,
    requiredHeadcount: dto.required_headcount,
    assignedCount: dto.assigned_count,
    remainingCapacity: dto.remaining,
  };
}

/**
 * Maps UserUuidLookupDto to domain VolunteerUuidLookup (V-18 / C-29 / P1-05).
 */
export function mapVolunteerUuidLookup(
  dto: UserUuidLookupDto,
): VolunteerUuidLookup {
  return {
    userId: dto.user_id != null ? String(dto.user_id) : undefined,
    uuid: dto.uuid,
    displayName: dto.display_name,
    display_name: dto.display_name,
    skills: dto.skills ? [...dto.skills] : [],
    physicalOk: dto.physical_ok,
    goodEyesight: dto.good_eyesight,
    needsGlasses: dto.needs_glasses,
    canLiftHeavy: dto.can_lift_heavy,
    canWorkOutdoor: dto.can_work_outdoor,
    hasLeaderExperience: dto.has_leader_experience,
    newToVolunteer: dto.new_to_volunteer,
    preferredLanguage: dto.preferred_language,
    homeArea: dto.home_area,
    needsMealSupport: dto.needs_meal_support,
    needsTravelSupport: dto.needs_travel_support,
    acceptsUnpaid: dto.accepts_unpaid,
    verificationStatus: dto.verification_status,
  };
}

/**
 * Maps GeoAttemptReviewDto to domain GeoAttemptReview (C-35 / P1-05).
 */
export function mapGeoAttemptReview(
  dto: GeoAttemptReviewDto,
): GeoAttemptReview {
  return {
    attemptId: String(dto.attempt_id),
    eventId: String(dto.event_id),
    userId: String(dto.user_id),
    displayName: dto.display_name,
    attemptedAt: dto.attempted_at,
    distanceMeters: dto.distance_m,
    effectiveRadiusMeters: dto.effective_radius_m,
    accuracyMeters: dto.accuracy_m,
    isMocked: dto.is_mocked,
    resultCode: dto.result_code,
  };
}
