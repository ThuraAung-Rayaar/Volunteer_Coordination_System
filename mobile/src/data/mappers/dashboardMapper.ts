/**
 * @format
 */

import type {
  AttendanceHistoryItemDto,
  FeedbackSummaryResponseDto,
} from '../dto/profileDto';
import type { VolunteerAssignmentDto } from '../dto/eventDto';
import type {
  CompletedActivity,
  DashboardSummary,
  UpcomingCommitment,
} from '../../domain/models/dashboard';

/**
 * Computes verified hours from check-in and check-out timestamps.
 * Returns 0 if exact duration cannot be measured (never fabricates 3.0).
 */
export function calculateVerifiedHours(
  checkinIso?: string | null,
  checkoutIso?: string | null,
  providedHours?: number | null,
): number {
  if (typeof providedHours === 'number' && providedHours >= 0) {
    return Math.round(providedHours * 10) / 10;
  }
  if (checkinIso && checkoutIso) {
    const diffMs = new Date(checkoutIso).getTime() - new Date(checkinIso).getTime();
    if (!isNaN(diffMs) && diffMs > 0) {
      const hours = diffMs / (1000 * 60 * 60);
      return Math.round(hours * 10) / 10;
    }
  }
  return 0; // Unmeasured duration returns 0, never a fake constant
}

/**
 * Maps assignments, attendance records, and feedback metrics into DashboardSummary.
 * Strictly enforces that completed activities are attendance-backed (`status === 'completed'`).
 * Joins attendance records with assignments as a fallback for title/post/location.
 */
export function mapDashboardSummary(
  assignments: VolunteerAssignmentDto[] = [],
  attendanceRecords: AttendanceHistoryItemDto[] = [],
  feedbackSummary?: FeedbackSummaryResponseDto | null,
  now: Date = new Date(),
): DashboardSummary {
  // Build lookup index for joining attendance with assignments
  const assignmentById = new Map<number, VolunteerAssignmentDto>();
  const assignmentByEventId = new Map<number, VolunteerAssignmentDto>();
  assignments.forEach(a => {
    if (a.id != null) {
      assignmentById.set(Number(a.id), a);
    }
    if (a.event_id != null) {
      assignmentByEventId.set(Number(a.event_id), a);
    }
  });

  // Upcoming means assigned/confirmed, event is active/published, and not already past the scheduled end.
  // Invalid timestamps and completed/cancelled/ended events are excluded in all cases.
  const upcomingCommitments: UpcomingCommitment[] = assignments
    .filter(a => {
      if (a.status !== 'assigned' && a.status !== 'confirmed') return false;
      const eventStatusLower = (a.event_status || '').toLowerCase();
      if (
        eventStatusLower === 'completed' ||
        eventStatusLower === 'ended' ||
        eventStatusLower === 'cancelled'
      ) {
        return false;
      }
      const endAtMs = Date.parse(a.schedule_end);
      return Number.isFinite(endAtMs) && endAtMs >= now.getTime();
    })
    .map((a): UpcomingCommitment => ({
      id: String(a.id),
      eventId: String(a.event_id),
      eventTitle: a.event_title || 'Volunteer Event',
      roleName: a.post_title || 'Assigned Volunteer',
      startAt: a.schedule_start,
      endAt: a.schedule_end,
      location: a.location_name || 'Event Location',
      status: a.status === 'confirmed' ? 'confirmed' : 'assigned',
    }))
    .sort((left, right) => Date.parse(left.startAt) - Date.parse(right.startAt));

  // Filter completed activities: strictly status === 'completed'
  const completedAttendance = attendanceRecords.filter(
    att => att.status === 'completed',
  );

  const recentCompletedActivities: CompletedActivity[] = completedAttendance.map(
    att => {
      const matchedAssignment =
        (att.assignment_id != null ? assignmentById.get(Number(att.assignment_id)) : undefined) ??
        (att.event_id != null ? assignmentByEventId.get(Number(att.event_id)) : undefined);

      const verifiedAt =
        att.checkout_at || att.checkin_at || '';
      const hours = calculateVerifiedHours(
        att.checkin_at,
        att.checkout_at,
        att.verified_hours,
      );

      const resolvedTitle =
        att.event_title || matchedAssignment?.event_title || 'Community Service Activity';
      const resolvedRole =
        att.post_title || matchedAssignment?.post_title || 'Volunteer Contributor';
      const resolvedLocation =
        att.location_name || matchedAssignment?.location_name || 'Designated Location';

      return {
        id: String(att.id),
        eventId: String(att.event_id),
        eventTitle: resolvedTitle,
        roleName: resolvedRole,
        completedAt: verifiedAt,
        attendanceStatus: 'completed',
        verifiedHours: hours,
        location: resolvedLocation,
        attendanceVerifiedAt: verifiedAt,
      };
    },
  );

  const completedShiftCount = completedAttendance.length;
  const uniqueEventIds = new Set(completedAttendance.map(att => att.event_id));
  const completedEventCount = uniqueEventIds.size;

  const summary = feedbackSummary?.summary;
  const ratingAverage =
    summary?.volunteer_avg_rating ??
    summary?.overall_avg_rating ??
    summary?.as_volunteer?.avg_overall ??
    null;

  const ratingCount =
    summary?.volunteer_rating_count ??
    summary?.total_count ??
    summary?.as_volunteer?.count ??
    0;

  return {
    completedShiftCount,
    completedEventCount,
    upcomingCommitmentCount: upcomingCommitments.length,
    ratingAverage,
    ratingCount,
    upcomingCommitments,
    recentCompletedActivities,
  };
}
