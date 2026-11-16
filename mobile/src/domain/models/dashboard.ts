/**
 * @format
 */

/**
 * Attendance-backed completed activity.
 * Per business rules: assignment.status=completed alone is NOT proof of work.
 * Completed activity must be backed by verified attendance/check-in evidence.
 */
export interface CompletedActivity {
  readonly id: string;
  readonly eventId: string;
  readonly eventTitle: string;
  readonly roleName: string;
  readonly completedAt: string;
  readonly attendanceStatus: 'completed';
  readonly verifiedHours: number;
  readonly location: string;
  readonly attendanceVerifiedAt: string;
}

export interface UpcomingCommitment {
  readonly id: string;
  readonly eventId: string;
  readonly eventTitle: string;
  readonly roleName: string;
  readonly startAt: string;
  readonly endAt: string;
  readonly location: string;
  readonly status: 'confirmed' | 'assigned';
}

export interface DashboardSummary {
  readonly completedShiftCount: number;
  readonly completedEventCount: number;
  readonly upcomingCommitmentCount: number;
  readonly ratingAverage: number | null;
  readonly ratingCount: number;
  readonly upcomingCommitments: readonly UpcomingCommitment[];
  readonly recentCompletedActivities: readonly CompletedActivity[];
}
