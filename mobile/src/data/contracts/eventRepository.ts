/**
 * @format
 */

import type {
  EventApplicationState,
  EventDetail,
  EventFilters,
  EventSummary,
  VolunteerApplicationItem,
  VolunteerAssignmentItem,
} from '../../domain/models/event';

export interface EventApplyResult {
  success: boolean;
  message: string;
  application?: EventApplicationState;
}

export interface EventRepository {
  /**
   * Fetches the list of published/active events matching optional filter criteria.
   */
  getEvents(filters?: EventFilters): Promise<EventSummary[]>;

  /**
   * Fetches full event details by ID, including posts and current demo user application state.
   */
  getEventById(id: string): Promise<EventDetail | null>;

  /**
   * Fetches active charity fields taxonomy.
   */
  getCharityFields?(): Promise<Array<{ code: string; label: string; sort_order?: number }>>;

  /**
   * Submits a demo application to an open post on an event.
   * Note: UI-only phase returns a mock success result clearly marked demo-only.
   */
  applyToPost(
    eventId: string,
    postId: string,
    note?: string,
  ): Promise<EventApplyResult>;

  /**
   * Fetches the volunteer's submitted applications.
   */
  getUserApplications(): Promise<VolunteerApplicationItem[]>;

  /**
   * Withdraws a pending or waitlisted volunteer application.
   */
  withdrawApplication(
    applicationId: string,
  ): Promise<{ success: boolean; message: string }>;

  /**
   * Fetches the volunteer's assigned, confirmed, and completed shifts.
   */
  getUserAssignments(): Promise<VolunteerAssignmentItem[]>;

  /**
   * Confirms the volunteer's assigned shift participation.
   */
  confirmAssignment?(
    assignmentId: string,
  ): Promise<{ success: boolean; message: string }>;

  /**
   * Cancels the volunteer's own scheduled shift participation (not the event).
   * Completed participation cannot be cancelled.
   */
  cancelAssignment(
    assignmentId: string,
  ): Promise<{ success: boolean; message: string }>;

  /**
   * Fetches the onboarding briefing status for an event.
   */
  getEventOnboarding?(eventId: string): Promise<{
    eventId: string;
    onboardingText: string | null;
    onboardingVersion: number;
    requireOnboardingAck: boolean;
    acknowledged: boolean;
  }>;

  /**
   * Acknowledges the onboarding briefing for an event.
   */
  acknowledgeOnboarding?(
    eventId: string,
    notes?: string,
  ): Promise<{ success: boolean; message: string; acknowledged: boolean }>;

  /**
   * Submits volunteer geo check-in telemetry for an event.
   */
  submitGeoCheckIn?(
    eventId: string,
    latitude: number,
    longitude: number,
    accuracyM?: number,
  ): Promise<{
    success: boolean;
    message: string;
    result?: string;
    distanceM?: number;
    confirmationStatus?: string;
    attendanceId?: string;
  }>;

  /**
   * Redeems a QR token (check-in, walk-in, join event).
   */
  redeemQrToken?(token: string): Promise<{
    success: boolean;
    message: string;
    result?: string;
    eventId?: string;
    attendanceId?: string;
    applicationId?: string;
  }>;

  /**
   * Checks out of an active attendance shift.
   */
  checkOutAttendance?(
    attendanceId: string,
  ): Promise<{ success: boolean; message: string; checkedOutAt?: string }>;

  /**
   * Submits feedback for an event.
   */
  submitEventFeedback?(
    eventId: string,
    score: number,
    comment?: string,
    tags?: string[],
    direction?:
      | 'coordinator_to_volunteer'
      | 'volunteer_to_event'
      | 'volunteer_to_coordinator',
  ): Promise<{ success: boolean; message: string; feedbackId?: string }>;
}
