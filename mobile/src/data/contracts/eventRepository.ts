/**
 * @format
 */

import type {
  CharityCategory,
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

export interface PaginatedEventsResult {
  count: number;
  next: string | null;
  previous: string | null;
  results: EventSummary[];
}

export interface OnboardingStatusResult {
  eventId: string;
  onboardingText: string | null;
  onboardingVersion: number;
  requireOnboardingAck: boolean;
  acknowledged: boolean;
}

export interface QrResolveResult {
  eventId: string;
  purpose: string;
  isValid: boolean;
  reason?: string | null;
}

export interface QrRedeemResult {
  success: boolean;
  message: string;
  result?: string;
  eventId?: string;
  attendanceId?: string;
  applicationId?: string;
}

export interface GeoCheckInLocationFix {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  capturedAt: string;
  isMocked: boolean;
}

export interface GeoCheckInResult {
  success: boolean;
  message: string;
  result?: string;
  distanceM?: number;
  confirmationStatus?: string;
  attendanceId?: string;
}

export interface EventFeedbackItem {
  id: string;
  score: number;
  comment?: string;
  tags?: string[];
  createdAt: string;
}

export interface EventRepository {
  /**
   * Fetches the list of published/active events matching optional filter criteria.
   */
  getEvents(filters?: EventFilters): Promise<EventSummary[]>;

  /**
   * Fetches a paginated slice of published/active events (P1-13).
   */
  getEventsPage(
    filters?: EventFilters,
    page?: number,
    pageSize?: number,
  ): Promise<PaginatedEventsResult>;

  /**
   * Fetches full event details by ID, including posts and current user application state.
   */
  getEventById(id: string): Promise<EventDetail | null>;

  /**
   * Fetches active charity fields taxonomy (V-19 / P1-05).
   */
  getCharityFields(): Promise<CharityCategory[]>;

  /**
   * Submits an application to an open post on an event.
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
   * Accepts a coordinator invitation to an event (V-24 / P1-06 / INV-01).
   */
  acceptInvite(
    applicationId: string,
    note?: string,
  ): Promise<{ success: boolean; message: string; applicationId: string }>;

  /**
   * Declines / rejects a coordinator invitation to an event (P1-06 / INV-01).
   */
  rejectInvite(
    applicationId: string,
    note?: string,
  ): Promise<{ success: boolean; message: string; applicationId: string }>;

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
  confirmAssignment(
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
   * Fetches the onboarding briefing status for an event (V-31).
   */
  getEventOnboarding(eventId: string): Promise<OnboardingStatusResult>;

  /**
   * Acknowledges the onboarding briefing for an event (V-32).
   */
  acknowledgeOnboarding(
    eventId: string,
    notes?: string,
  ): Promise<{ success: boolean; message: string; acknowledged: boolean }>;

  /**
   * Previews / resolves a QR token without consuming it (V-33).
   */
  resolveQrToken(token: string): Promise<QrResolveResult>;

  /**
   * Redeems a QR token (check-in, walk-in, join event) (V-34).
   */
  redeemQrToken(token: string): Promise<QrRedeemResult>;

  /**
   * Checks in using a QR token (V-35).
   */
  qrCheckIn(token: string): Promise<QrRedeemResult>;

  /**
   * Submits volunteer geo check-in telemetry for an event (V-36).
   */
  submitGeoCheckIn(
    eventId: string,
    fix: GeoCheckInLocationFix,
  ): Promise<GeoCheckInResult>;

  /**
   * Checks out of an active attendance shift (V-37).
   */
  checkOutAttendance(
    attendanceId: string,
  ): Promise<{ success: boolean; message: string; checkedOutAt?: string }>;

  /**
   * Submits feedback for an event (V-40).
   */
  submitEventFeedback(
    eventId: string,
    score: number,
    comment?: string,
    tags?: string[],
    direction?:
      | 'coordinator_to_volunteer'
      | 'volunteer_to_event'
      | 'volunteer_to_coordinator',
  ): Promise<{ success: boolean; message: string; feedbackId?: string }>;

  /**
   * Fetches public feedback list for an event (P1-12).
   */
  getEventFeedbackList(eventId: string): Promise<EventFeedbackItem[]>;
}
