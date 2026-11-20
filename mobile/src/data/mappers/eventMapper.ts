/**
 * @format
 */

import type {
  ApplicationSubmitRequestDto,
  CharityFieldDto,
  PublicEventDetailDto,
  PublicEventDto,
  PublicEventPostDto,
  VolunteerApplicationDto,
  VolunteerAssignmentDto,
} from '../dto/eventDto';
import type {
  CharityCategory,
  CharityCategoryCode,
  EventApplicationState,
  EventApplicationStatus,
  EventDetail,
  EventPost,
  EventStatus,
  EventSummary,
  PhysicalLevel,
  PostStatus,
  VolunteerApplicationItem,
  VolunteerAssignmentItem,
  VolunteerAssignmentStatus,
} from '../../domain/models/event';

/**
 * Normalizes event status to domain union 'published' | 'active'.
 */
function normalizeEventStatus(statusStr: string): EventStatus {
  if (statusStr === 'active') {
    return 'active';
  }
  return 'published';
}

/**
 * Normalizes post status to domain union 'open' | 'full' | 'closed'.
 */
function normalizePostStatus(statusStr: string): PostStatus {
  if (statusStr === 'full' || statusStr === 'closed') {
    return statusStr;
  }
  return 'open';
}

/**
 * Normalizes post physical level.
 */
function normalizePhysicalLevel(levelStr: string): PhysicalLevel {
  if (levelStr === 'light' || levelStr === 'medium' || levelStr === 'heavy') {
    return levelStr;
  }
  return 'none';
}

/**
 * Maps PublicEventDto to domain EventSummary model.
 */
export function mapPublicEventSummary(dto: PublicEventDto): EventSummary {
  return {
    id: String(dto.id),
    title: dto.title,
    description: dto.description ?? '',
    purposeType: dto.purpose_type,
    status: normalizeEventStatus(dto.status),
    locationName: dto.location_name ?? '',
    landmarkText: dto.landmark_text ?? undefined,
    startAt: dto.start_at,
    endAt: dto.end_at,
    applicationDeadline: dto.application_deadline ?? undefined,
    charityFields: (dto.charity_fields || []) as CharityCategoryCode[],
    coordinatorName: dto.coordinator_name ?? 'Coordinator',
    spotsRemaining: typeof dto.spots_remaining === 'number' ? dto.spots_remaining : 0,
    mealsProvided: Boolean(dto.meals_provided),
    lodgingProvided: Boolean(dto.lodging_provided),
    travelSupportProvided: Boolean(dto.travel_support_provided),
    compensationKind: dto.compensation_kind ?? 'unpaid',
  };
}

/**
 * Maps PublicEventPostDto to domain EventPost model.
 */
export function mapPublicEventPost(
  dto: PublicEventPostDto,
  eventId: string | number,
): EventPost {
  const reqHeadcount = typeof dto.required_headcount === 'number' ? dto.required_headcount : 1;
  const assigned = typeof dto.assigned_count === 'number' ? dto.assigned_count : 0;
  const rem = typeof dto.remaining === 'number' ? dto.remaining : Math.max(0, reqHeadcount - assigned);

  return {
    id: String(dto.id),
    eventId: String(eventId),
    title: dto.title,
    description: dto.description ?? undefined,
    requiredHeadcount: reqHeadcount,
    filledHeadcount: assigned,
    remainingCapacity: rem,
    physicalLevel: normalizePhysicalLevel(dto.physical_level),
    requiredSkills: Array.isArray(dto.required_skills) ? dto.required_skills : [],
    leaderNeeded: Boolean(dto.leader_needed),
    newVolunteersAllowed: Boolean(dto.new_volunteers_allowed),
    status: normalizePostStatus(dto.status),
  };
}

/**
 * Maps PublicEventDetailDto and optional user application to domain EventDetail model.
 */
export function mapPublicEventDetail(
  dto: PublicEventDetailDto,
  userApp?: VolunteerApplicationDto | null,
): EventDetail {
  const summary = mapPublicEventSummary(dto);
  const posts: EventPost[] = Array.isArray(dto.posts)
    ? dto.posts.map(p => mapPublicEventPost(p, dto.id))
    : [];

  let userApplication: EventApplicationState | null = null;
  if (userApp) {
    userApplication = {
      id: String(userApp.id),
      eventId: String(userApp.event_id),
      postId: String(userApp.post_id ?? ''),
      postTitle: userApp.post_title ?? 'General Volunteer Support',
      status: userApp.status as EventApplicationStatus,
      appliedAt: userApp.applied_at,
      volunteerNote: userApp.note ?? undefined,
    };
  }

  const lat =
    dto.latitude !== null && dto.latitude !== undefined && dto.latitude !== ''
      ? Number(dto.latitude)
      : undefined;

  const lng =
    dto.longitude !== null && dto.longitude !== undefined && dto.longitude !== ''
      ? Number(dto.longitude)
      : undefined;

  return {
    ...summary,
    landmarkText: dto.landmark_text ?? undefined,
    compensationNote: dto.compensation_note ?? undefined,
    onboardingText: dto.onboarding_text ?? undefined,
    latitude: !isNaN(lat as number) ? lat : undefined,
    longitude: !isNaN(lng as number) ? lng : undefined,
    geoCheckinEnabled: Boolean(dto.geo_checkin_enabled),
    posts,
    userApplication,
  };
}

/**
 * Maps VolunteerApplicationDto to domain VolunteerApplicationItem.
 */
export function mapVolunteerApplication(
  dto: VolunteerApplicationDto,
): VolunteerApplicationItem {
  return {
    id: String(dto.id),
    eventId: String(dto.event_id),
    eventTitle: dto.event_title ?? 'Volunteer Event',
    postId: String(dto.post_id ?? ''),
    postTitle: dto.post_title ?? 'General Volunteer Support',
    status: dto.status as EventApplicationStatus,
    appliedAt: dto.applied_at,
    source: dto.source,
    volunteerNote: dto.note ?? undefined,
  };
}

/**
 * Maps VolunteerAssignmentDto to domain VolunteerAssignmentItem.
 */
export function mapVolunteerAssignment(
  dto: VolunteerAssignmentDto,
): VolunteerAssignmentItem {
  return {
    id: String(dto.id),
    eventId: String(dto.event_id),
    eventTitle: dto.event_title ?? 'Volunteer Assignment',
    applicationId:
      dto.application_id !== null && dto.application_id !== undefined
        ? String(dto.application_id)
        : undefined,
    postId: String(dto.post_id ?? ''),
    postTitle: dto.post_title ?? 'Assigned Shift',
    status: dto.status as VolunteerAssignmentStatus,
    startAt: dto.schedule_start,
    endAt: dto.schedule_end,
    location: dto.location_name || 'Event Location',
    assignedAt: dto.assigned_at ?? dto.schedule_start,
    attendanceId:
      dto.attendance_id !== null && dto.attendance_id !== undefined
        ? String(dto.attendance_id)
        : undefined,
    attendanceStatus: (dto.attendance_status as any) ?? undefined,
  };
}

/**
 * Generates an allow-listed ApplicationSubmitRequestDto payload.
 */
export function mapApplicationSubmitRequest(
  eventId: string | number,
  postId?: string | number | null,
  note?: string,
): ApplicationSubmitRequestDto {
  return {
    event_id: Number(eventId),
    post_id:
      postId !== undefined && postId !== null && postId !== ''
        ? Number(postId)
        : null,
    source: 'browse',
    note: note && note.trim().length > 0 ? note.trim() : null,
  };
}

/**
 * Maps CharityFieldDto from GET /api/v1/charity-fields/ to domain CharityCategory (V-19 / P1-05).
 */
export function mapCharityField(dto: CharityFieldDto): CharityCategory {
  return {
    code: dto.code as CharityCategoryCode,
    label: dto.label,
    sortOrder: dto.sort_order,
  };
}
