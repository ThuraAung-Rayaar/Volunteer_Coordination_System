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
  CoordinatorOverviewMetrics,
  CreateEventWizardDraft,
} from '../../domain/models/coordinator';

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
   * Transitions an event to a valid target status.
   * Rejects writes if the event is in owner-as-monitor mode.
   */
  transitionEventStatus(
    eventId: string,
    targetStatus: CoordinatorEventStatus,
  ): Promise<CoordinatorOperationResult<CoordinatorEventDetail>>;

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
  ): Promise<CoordinatorOperationResult<CoordinatorAssignmentItem>>;

  /**
   * Cancels an existing assignment.
   * Rejects writes if the event is in owner-as-monitor mode.
   */
  cancelAssignment(
    assignmentId: string,
  ): Promise<CoordinatorOperationResult<CoordinatorAssignmentItem>>;

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
   * Manually checks in a volunteer on-site.
   * Rejects writes if the event is in owner-as-monitor mode.
   */
  manualCheckIn(
    attendanceId: string,
  ): Promise<CoordinatorOperationResult<CoordinatorAttendanceItem>>;

  /**
   * Hands over event coordination to another approved coordinator.
   */
  handoverEvent?(
    eventId: string,
    newCoordinatorUserId: string,
    reason?: string,
  ): Promise<CoordinatorOperationResult>;

  /**
   * Retakes event coordination as the original event owner.
   */
  retakeEvent?(
    eventId: string,
    reason?: string,
  ): Promise<CoordinatorOperationResult>;

  /**
   * Generates a new coordinator QR token for an event.
   */
  createQrToken?(
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
   * Revokes an active coordinator QR token.
   */
  revokeQrToken?(qrId: string): Promise<CoordinatorOperationResult>;
}
