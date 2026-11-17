/**
 * @format
 * Domain models for user authored and received feedback.
 */

export interface AuthoredFeedbackItem {
  readonly id: string;
  readonly eventId: string;
  readonly eventTitle?: string | null;
  readonly direction?: string;
  readonly ratingOverall: number;
  readonly tags: readonly string[];
  readonly comments?: string | null;
  readonly createdAt: string;
}

export interface FeedbackRatingSummary {
  readonly userId?: string;
  readonly overallAvgRating: number | null;
  readonly totalCount: number;
  readonly volunteerAvgRating: number | null;
  readonly volunteerRatingCount: number;
  readonly coordinatorAvgRating: number | null;
  readonly coordinatorRatingCount: number;
  readonly asVolunteer: {
    readonly count: number;
    readonly avgOverall: number | null;
  };
  readonly asCoordinator: {
    readonly count: number;
    readonly avgOverall: number | null;
  };
  readonly ratingDistribution: Record<string, number>;
}

export interface MyFeedbackResponse {
  readonly authoredFeedback: readonly AuthoredFeedbackItem[];
  readonly receivedSummary: FeedbackRatingSummary;
}
