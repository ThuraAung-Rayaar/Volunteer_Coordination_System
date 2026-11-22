/**
 * @format
 */

import type {
  CoordinatorApplicationItem,
  CoordinatorApplicationStatus,
  CoordinatorAssignmentItem,
  CoordinatorAttendanceItem,
  CoordinatorEventDetail,
  CoordinatorEventStatus,
  CoordinatorEventSummary,
  CoordinatorHistoryItem,
  CoordinatorOverviewMetrics,
  CreateEventWizardDraft,
  EventPostCapacity,
  GeoAttemptReview,
  VolunteerUuidLookup,
} from '../../domain/models/coordinator';
import type { PhysicalLevel, PostStatus } from '../../domain/models/event';

export interface CoordinatorOperationResult<T = void> {
  success: boolean;
  message: string;
  data?: T;
}

export interface CoordinatorRepository {
  /**
   * Fetches high-level metrics for the coordinator dashboard.
   */
  getOverviewMetrics(): Promise<CoordinatorOverviewMetrics>;

  /**
   * Fetches the list of events owned or coordinated by the user.
   */
  getMyEvents(): Promise<CoordinatorEventSummary[]>;

  /**
   * Fetches full coordinator details for an event by ID.
   */
  getEventDetail(eventId: string): Promise<CoordinatorEventDetail | null>;

  /**
   * Creates a new draft event using the validated wizard data.
   * Enforces that status is 'draft', version is 1, and owner is the coordinator.
   */
  createDraftEvent(
    draft: CreateEventWizardDraft,
  ): Promise<CoordinatorOperationResult<CoordinatorEventDetail>>;

  /**
   * Updates an existing event details/onboarding text (C-06, C-07).
   */
  updateEvent(
    eventId: string,
    data: Partial<CreateEventWizardDraft>,
  ): Promise<CoordinatorOperationResult<CoordinatorEventDetail>>;

  /**
   * Transitions an event to a valid target status.
   * Rejects writes if the event is in owner-as-monitor mode.
   */
  transitionEventStatus(
    eventId: string,
    targetStatus: CoordinatorEventStatus,
  ): Promise<CoordinatorOperationResult<CoordinatorEventDetail>>;

  /**
   * Creates a new post for an event (C-08).
   */
  createEventPost(
    eventId: string,
    post: {
      title: string;
      description?: string;
      requiredHeadcount: number;
      physicalLevel?: PhysicalLevel;
      requiredSkills?: string[];
      leaderNeeded?: boolean;
      newVolunteersAllowed?: boolean;
      priority?: number;
    },
  ): Promise<CoordinatorOperationResult<{ id: string; status: PostStatus }>>;

  /**
   * Updates an event post headcount, requirements, or status (C-09).
   */
  updateEventPost(
    postId: string,
    updates: {
      title?: string;
      description?: string;
      requiredHeadcount?: number;
      status?: PostStatus;
      physicalLevel?: PhysicalLevel;
      requiredSkills?: string[];
      leaderNeeded?: boolean;
      newVolunteersAllowed?: boolean;
      priority?: number;
    },
  ): Promise<CoordinatorOperationResult<{ id: string; status: PostStatus }>>;

  /**
   * Closes an event post to stop accepting new applications (C-10).
   */
  closeEventPost(postId: string): Promise<CoordinatorOperationResult<void>>;

  /**
   * Hands over event coordination to another approved coordinator (C-15).
   */
  handoverEvent(
    eventId: string,
    newCoordinatorUserId: string,
    reason?: string,
  ): Promise<CoordinatorOperationResult>;

  /**
   * Retakes event coordination as the original event owner (C-16).
   */
  retakeEvent(
    eventId: string,
    reason?: string,
  ): Promise<CoordinatorOperationResult>;

  /**
   * Fetches event coordinator handover audit history (C-18 / P1-05).
   */
  getCoordinatorHistory(
    eventId: string,
  ): Promise<CoordinatorHistoryItem[]>;

  /**
   * Fetches applications for coordinator events, optionally filtered by eventId.
   */
  getApplications(eventId?: string): Promise<CoordinatorApplicationItem[]>;

  /**
   * Updates an application status (accept, reject, waitlist).
   * Rejects writes if the event is in owner-as-monitor mode.
   */
  updateApplicationStatus(
    applicationId: string,
    status: CoordinatorApplicationStatus,
  ): Promise<CoordinatorOperationResult<CoordinatorApplicationItem>>;

  /**
   * Invites a volunteer to an event (C-23 / V-24).
   */
  inviteVolunteer(
    eventId: string,
    volunteerUserId: string | number,
    postId?: string | number,
    note?: string,
  ): Promise<CoordinatorOperationResult<CoordinatorApplicationItem>>;

  /**
   * Fetches active and confirmed assignments for coordinator events.
   */
  getAssignments(eventId?: string): Promise<CoordinatorAssignmentItem[]>;

  /**
   * Fetches accepted applications that do not currently have an active assignment.
   */
  getUnassignedApplications(
    eventId?: string,
  ): Promise<CoordinatorApplicationItem[]>;

  /**
   * Runs auto-assignment demo preview.
   * Rejects writes if the event is in owner-as-monitor mode.
   */
  runAutoAssignment(
    eventId: string,
  ): Promise<CoordinatorOperationResult<CoordinatorAssignmentItem[]>>;

  /**
   * Manually assigns an accepted application to a post.
   * Rejects writes if the event is in owner-as-monitor mode.
   */
  assignVolunteerManually(
    applicationId: string,
    postId: string,
    groupCode?: string,
    isGroupLeader?: boolean,
    eventId?: string,
  ): Promise<CoordinatorOperationResult<CoordinatorAssignmentItem>>;

  /**
   * Cancels an existing assignment.
   * Rejects writes if the event is in owner-as-monitor mode.
   */
  cancelAssignment(
    assignmentId: string,
  ): Promise<CoordinatorOperationResult<CoordinatorAssignmentItem>>;

  /**
   * Fetches post capacity breakdown for an event (C-28 / P1-05).
   */
  getPostCapacity(eventId: string): Promise<EventPostCapacity[]>;

  /**
   * Resolves volunteer identity and capabilities by UUID for check-in / roster (C-29 / P1-05).
   */
  lookupVolunteerByUuid(
    uuid: string,
    eventId?: string,
  ): Promise<VolunteerUuidLookup>;

  /**
   * Generates a new coordinator QR token for an event (C-30).
   */
  createQrToken(
    eventId: string,
    purpose: 'walkin_registration' | 'checkin' | 'join_event',
    maxUses?: number | null,
    ttlMinutes?: number,
  ): Promise<
    CoordinatorOperationResult<{
      id: number;
      rawToken: string;
      expiresAt: string;
    }>
  >;

  /**
   * Revokes an active coordinator QR token (C-31).
   */
  revokeQrToken(qrId: string): Promise<CoordinatorOperationResult>;

  /**
   * Fetches the full attendance roster for an event.
   */
  getAttendanceRoster(eventId?: string): Promise<CoordinatorAttendanceItem[]>;

  /**
   * Fetches pending geo check-in attempts requiring coordinator confirmation.
   */
  getPendingGeoConfirmations(
    eventId?: string,
  ): Promise<CoordinatorAttendanceItem[]>;

  /**
   * Fetches geo check-in attempts for review matching v_geo_attempts_review (C-35 / P1-05).
   */
  getGeoAttempts(eventId: string): Promise<GeoAttemptReview[]>;

  /**
   * Confirms a pending geo check-in attempt.
   * Rejects writes if the event is in owner-as-monitor mode.
   */
  confirmGeoAttendance(
    attendanceId: string,
  ): Promise<CoordinatorOperationResult<CoordinatorAttendanceItem>>;

  /**
   * Rejects a pending geo check-in attempt.
   * Rejects writes if the event is in owner-as-monitor mode.
   */
  rejectGeoAttendance(
    attendanceId: string,
  ): Promise<CoordinatorOperationResult<CoordinatorAttendanceItem>>;

  /**
   * Manually checks in a volunteer on-site (C-34 / ATT-02).
   * Supports explicit { eventId, volunteerUserId, note? }, (eventId, volunteerUserId, note?),
   * or legacy attendanceId lookup.
   * Rejects writes if the event is in owner-as-monitor mode.
   */
  manualCheckIn(
    params: { eventId: string | number; volunteerUserId: string | number; note?: string },
  ): Promise<CoordinatorOperationResult<CoordinatorAttendanceItem>>;
  manualCheckIn(
    eventId: string | number,
    volunteerUserId: string | number,
    note?: string,
  ): Promise<CoordinatorOperationResult<CoordinatorAttendanceItem>>;
  manualCheckIn(
    attendanceId: string,
  ): Promise<CoordinatorOperationResult<CoordinatorAttendanceItem>>;

  /**
   * Submits coordinator feedback for a volunteer shift (C-38).
   */
  submitCoordinatorFeedback(
    eventId: string,
    volunteerUserId: string | number,
    score: number,
    comment?: string,
    tags?: string[],
  ): Promise<CoordinatorOperationResult>;
}
