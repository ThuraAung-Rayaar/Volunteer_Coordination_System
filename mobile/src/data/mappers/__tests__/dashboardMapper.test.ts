/**
 * @format
 */

import { mapDashboardSummary } from '../dashboardMapper';
import type { AttendanceHistoryItemDto, FeedbackSummaryResponseDto } from '../../dto/profileDto';
import type { VolunteerAssignmentDto } from '../../dto/eventDto';

describe('dashboardMapper', () => {
  const sampleAssignments: VolunteerAssignmentDto[] = [
    {
      id: 11,
      event_id: 101,
      event_title: 'Mangrove Planting',
      event_status: 'active',
      post_id: 201,
      post_title: 'Planter',
      group_code: 'GRP-1',
      is_group_leader: false,
      status: 'confirmed',
      schedule_start: '2026-12-10T08:00:00+06:30',
      schedule_end: '2026-12-10T12:00:00+06:30',
      confirmed_at: '2026-11-20T10:00:00+06:30',
    },
    {
      id: 12,
      event_id: 102,
      event_title: 'Blood Drive Reception',
      event_status: 'active',
      post_id: 202,
      post_title: 'Donor Intake',
      group_code: null,
      is_group_leader: true,
      status: 'assigned',
      schedule_start: '2026-12-15T09:00:00+06:30',
      schedule_end: '2026-12-15T14:00:00+06:30',
      confirmed_at: null,
    },
    {
      id: 13,
      event_id: 103,
      event_title: 'Old Event Assignment',
      event_status: 'completed',
      post_id: 203,
      post_title: 'Helper',
      group_code: null,
      is_group_leader: false,
      status: 'completed', // Completed assignment alone is NOT an upcoming commitment
      schedule_start: '2026-10-01T08:00:00+06:30',
      schedule_end: '2026-10-01T12:00:00+06:30',
      confirmed_at: null,
    },
  ];

  const sampleAttendance: AttendanceHistoryItemDto[] = [
    {
      id: 801,
      event_id: 50,
      event_title: 'Beach Cleanup Day 1',
      post_title: 'Coastal Sweeper',
      location_name: 'Ngwe Saung Beach',
      status: 'completed',
      method: 'geo',
      checkin_at: '2026-11-01T08:00:00Z',
      checkout_at: '2026-11-01T12:00:00Z',
      confirmation_status: 'confirmed',
      verified_hours: 4.0,
    },
    {
      id: 802,
      event_id: 51,
      event_title: 'Food Drive Assembly',
      post_title: 'Packer',
      location_name: 'Hlaing Community Center',
      status: 'completed',
      method: 'manual',
      checkin_at: '2026-11-05T09:00:00Z',
      checkout_at: '2026-11-05T12:30:00Z',
      confirmation_status: 'confirmed',
      verified_hours: 3.5,
    },
    {
      id: 803,
      event_id: 52,
      event_title: 'Unattended Shift',
      post_title: 'Helper',
      location_name: 'Downtown',
      status: 'absent', // Non-completed attendance record must NOT count towards verified activity
      method: null,
      checkin_at: null,
      checkout_at: null,
      confirmation_status: null,
    },
  ];

  const sampleFeedback: FeedbackSummaryResponseDto = {
    results: [],
    summary: {
      volunteer_avg_rating: 4.9,
      volunteer_rating_count: 8,
    },
  };

  it('filters only assigned/confirmed shifts into upcomingCommitments', () => {
    const summary = mapDashboardSummary(sampleAssignments, sampleAttendance, sampleFeedback);

    expect(summary.upcomingCommitmentCount).toBe(2);
    expect(summary.upcomingCommitments).toHaveLength(2);
    expect(summary.upcomingCommitments[0].eventTitle).toBe('Mangrove Planting');
    expect(summary.upcomingCommitments[0].status).toBe('confirmed');
    expect(summary.upcomingCommitments[1].eventTitle).toBe('Blood Drive Reception');
    expect(summary.upcomingCommitments[1].status).toBe('assigned');
  });

  it('filters strictly status === "completed" attendance records for completed activities', () => {
    const summary = mapDashboardSummary(sampleAssignments, sampleAttendance, sampleFeedback);

    // Only 801 and 802 are 'completed'
    expect(summary.completedShiftCount).toBe(2);
    expect(summary.completedEventCount).toBe(2);
    expect(summary.recentCompletedActivities).toHaveLength(2);
    expect(summary.recentCompletedActivities[0].attendanceStatus).toBe('completed');
    expect(summary.recentCompletedActivities[0].verifiedHours).toBe(4.0);
    expect(summary.recentCompletedActivities[1].verifiedHours).toBe(3.5);
  });

  it('binds feedback average rating and count accurately', () => {
    const summary = mapDashboardSummary(sampleAssignments, sampleAttendance, sampleFeedback);

    expect(summary.ratingAverage).toBe(4.9);
    expect(summary.ratingCount).toBe(8);
  });

  it('handles empty inputs gracefully with zero counts and null ratings', () => {
    const summary = mapDashboardSummary([], [], null);

    expect(summary.completedShiftCount).toBe(0);
    expect(summary.completedEventCount).toBe(0);
    expect(summary.upcomingCommitmentCount).toBe(0);
    expect(summary.upcomingCommitments).toEqual([]);
    expect(summary.recentCompletedActivities).toEqual([]);
    expect(summary.ratingAverage).toBeNull();
    expect(summary.ratingCount).toBe(0);
  });

  it('returns 0 verifiedHours when unmeasured and falls back to assignments index for metadata', () => {
    const unmeasuredAttendance: AttendanceHistoryItemDto[] = [
      {
        id: 991,
        event_id: 101, // matches sampleAssignments[0]
        event_title: null, // should fall back to 'Mangrove Planting'
        post_title: null, // should fall back to 'Planter'
        location_name: null,
        status: 'completed',
        method: 'system',
        checkin_at: null, // no timestamps
        checkout_at: null,
        confirmation_status: 'confirmed',
        verified_hours: null,
      },
    ];

    const summary = mapDashboardSummary(sampleAssignments, unmeasuredAttendance, null);
    expect(summary.recentCompletedActivities).toHaveLength(1);
    expect(summary.recentCompletedActivities[0].eventTitle).toBe('Mangrove Planting');
    expect(summary.recentCompletedActivities[0].roleName).toBe('Planter');
    // Must be 0, NEVER fabricated 3.0 constant
    expect(summary.recentCompletedActivities[0].verifiedHours).toBe(0);
  });
});
