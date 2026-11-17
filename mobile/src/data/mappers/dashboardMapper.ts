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
 * Falls back to 3.0 hours if exact duration cannot be computed.
 */
function calculateVerifiedHours(
  checkinIso?: string | null,
  checkoutIso?: string | null,
  providedHours?: number | null,
): number {
  if (typeof providedHours === 'number' && providedHours > 0) {
    return Math.round(providedHours * 10) / 10;
  }
  if (checkinIso && checkoutIso) {
    const diffMs = new Date(checkoutIso).getTime() - new Date(checkinIso).getTime();
    if (!isNaN(diffMs) && diffMs > 0) {
      const hours = diffMs / (1000 * 60 * 60);
      return Math.round(hours * 10) / 10;
    }
  }
  return 3.0; // Standard shift default
}

/**
 * Maps assignments, attendance records, and feedback metrics into DashboardSummary.
 * Strictly enforces that completed activities are attendance-backed (`status === 'completed'`).
 */
export function mapDashboardSummary(
  assignments: VolunteerAssignmentDto[] = [],
  attendanceRecords: AttendanceHistoryItemDto[] = [],
  feedbackSummary?: FeedbackSummaryResponseDto | null,
): DashboardSummary {
  // Filter active upcoming shifts: 'assigned' or 'confirmed'
  const upcomingCommitments: UpcomingCommitment[] = assignments
    .filter(a => a.status === 'assigned' || a.status === 'confirmed')
    .map(a => ({
      id: String(a.id),
      eventId: String(a.event_id),
      eventTitle: a.event_title || 'Volunteer Event',
      roleName: a.post_title || 'Assigned Volunteer',
      startAt: a.schedule_start,
      endAt: a.schedule_end,
      location: 'Event Location',
      status: a.status === 'confirmed' ? 'confirmed' : 'assigned',
    }));

  // Filter completed activities: strictly status === 'completed'
  const completedAttendance = attendanceRecords.filter(
    att => att.status === 'completed',
  );

  const recentCompletedActivities: CompletedActivity[] = completedAttendance.map(
    att => {
      const verifiedAt =
        att.checkout_at || att.checkin_at || new Date().toISOString();
      const hours = calculateVerifiedHours(
        att.checkin_at,
        att.checkout_at,
        att.verified_hours,
      );

      return {
        id: String(att.id),
        eventId: String(att.event_id),
        eventTitle: att.event_title || 'Community Service Activity',
        roleName: att.post_title || 'Volunteer Contributor',
        completedAt: verifiedAt,
        attendanceStatus: 'completed',
        verifiedHours: hours,
        location: att.location_name || 'Designated Location',
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
