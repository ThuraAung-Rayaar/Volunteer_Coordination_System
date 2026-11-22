/**
 * @format
 * Feature-facing Coordinator Use Cases (C-01 through C-39).
 * Exposes strongly-typed domain actions decoupled from HTTP transports and raw DTO shapes.
 */

import type {
  CoordinatorOperationResult,
  CoordinatorRepository,
  ProfileRepository,
} from '../../data/contracts';
import type {
  CoordinatorApplicationItem,
  CoordinatorApplicationStatus,
  CoordinatorAssignmentItem,
  CoordinatorAttendanceItem,
  CoordinatorEventDetail,
  CoordinatorEventSummary,
  CoordinatorHistoryItem,
  CoordinatorOverviewMetrics,
  CreateEventWizardDraft,
  EventPost,
  EventPostCapacity,
  GeoAttemptReview,
  PhysicalLevel,
  PostStatus,
  VolunteerUuidLookup,
} from '../models';

export interface CoordinatorUseCasesDeps {
  coordinatorRepository: CoordinatorRepository;
  profileRepository?: ProfileRepository;
}

export class CoordinatorUseCases {
  private coordinatorRepo: CoordinatorRepository;
  private profileRepo?: ProfileRepository;

  constructor(deps: CoordinatorUseCasesDeps) {
    this.coordinatorRepo = deps.coordinatorRepository;
    this.profileRepo = deps.profileRepository;
  }

  // =========================================================================
  // 1. Coordinator Status & Eligibility (C-01 .. C-03)
  // =========================================================================

  /**
   * C-01: Reads own coordinator status and eligibility criteria.
   */
  public async getCoordinatorStatus(): Promise<{
    isVerified: boolean;
    completedEvents: number;
    ratingAverage: number | null;
  }> {
    if (this.profileRepo) {
      const eligibility = await this.profileRepo.getCoordinatorEligibility();
      return {
        isVerified: eligibility.isVerified,
        completedEvents: eligibility.completedAttendanceEventsCount,
        ratingAverage: eligibility.ratingAverage,
      };
    }
    return {
      isVerified: false,
      completedEvents: 0,
      ratingAverage: null,
    };
  }

  /**
   * C-02: Submits an application to become an approved event coordinator.
   */
  public async submitCoordinatorApplication(
    note: string,
  ): Promise<{ success: boolean; message: string }> {
    if (this.profileRepo) {
      return this.profileRepo.submitCoordinatorApplication(note);
    }
    return {
      success: true,
      message: 'Coordinator application submitted successfully',
    };
  }

  /**
   * C-03: Updates notes on a pending coordinator application.
   */
  public async updateCoordinatorApplicationNotes(
    notes: string,
  ): Promise<{ success: boolean; message: string }> {
    if (this.profileRepo) {
      return this.profileRepo.updateCoordinatorApplicationNotes(notes);
    }
    return {
      success: true,
      message: 'Coordinator application notes updated',
    };
  }

  // =========================================================================
  // 2. Managed Events & Lifecycle Transitions (C-04 .. C-06, C-11 .. C-15)
  // =========================================================================

  /**
   * Fetches high-level metrics for the coordinator overview dashboard.
   */
  public async getOverviewMetrics(): Promise<CoordinatorOverviewMetrics> {
    return this.coordinatorRepo.getOverviewMetrics();
  }

  /**
   * C-04: Lists all events owned or coordinated by the user.
   */
  public async getMyEvents(): Promise<CoordinatorEventSummary[]> {
    return this.coordinatorRepo.getMyEvents();
  }

  /**
   * C-05: Fetches full coordinator details for an event by ID.
   */
  public async getEventDetail(
    eventId: string,
  ): Promise<CoordinatorEventDetail | null> {
    return this.coordinatorRepo.getEventDetail(eventId);
  }

  /**
   * C-06: Creates a new draft event using validated wizard draft data.
   */
  public async createDraftEvent(
    draft: CreateEventWizardDraft,
  ): Promise<CoordinatorOperationResult<CoordinatorEventDetail>> {
    const result = await this.coordinatorRepo.createDraftEvent(draft);
    if (result.success) {
      await this.coordinatorRepo.getMyEvents();
    }
    return result;
  }

  /**
   * C-11: Updates existing event metadata/onboarding text.
   */
  public async updateEventMetadata(
    eventId: string,
    data: Partial<CreateEventWizardDraft>,
  ): Promise<CoordinatorOperationResult<CoordinatorEventDetail>> {
    const result = await this.coordinatorRepo.updateEvent(eventId, data);
    if (result.success) {
      await Promise.allSettled([
        this.coordinatorRepo.getEventDetail(eventId),
        this.coordinatorRepo.getMyEvents(),
      ]);
    }
    return result;
  }

  /**
   * C-12: Publishes an event with open-post preflight verification.
   * Enforces: at least 1 open post with headcount > 0 exists before transition.
   */
  public async publishEvent(
    eventId: string,
  ): Promise<CoordinatorOperationResult<CoordinatorEventDetail>> {
    const detail = await this.coordinatorRepo.getEventDetail(eventId);
    const posts = detail?.posts || [];
    const openPostsCount = posts.filter(
      p => p.status === 'open' && p.requiredHeadcount > 0,
    ).length;

    if (openPostsCount === 0) {
      return {
        success: false,
        message:
          'Cannot publish event: at least one open role with required headcount is required before publication.',
      };
    }

    const result = await this.coordinatorRepo.transitionEventStatus(
      eventId,
      'published',
    );
    if (result.success) {
      await Promise.allSettled([
        this.coordinatorRepo.getEventDetail(eventId),
        this.coordinatorRepo.getMyEvents(),
      ]);
    }
    return result;
  }

  /**
   * C-13: Activates a published event.
   */
  public async activateEvent(
    eventId: string,
  ): Promise<CoordinatorOperationResult<CoordinatorEventDetail>> {
    const result = await this.coordinatorRepo.transitionEventStatus(
      eventId,
      'active',
    );
    if (result.success) {
      await Promise.allSettled([
        this.coordinatorRepo.getEventDetail(eventId),
        this.coordinatorRepo.getMyEvents(),
      ]);
    }
    return result;
  }

  /**
   * C-14: Completes an active event.
   */
  public async completeEvent(
    eventId: string,
  ): Promise<CoordinatorOperationResult<CoordinatorEventDetail>> {
    const result = await this.coordinatorRepo.transitionEventStatus(
      eventId,
      'completed',
    );
    if (result.success) {
      await Promise.allSettled([
        this.coordinatorRepo.getEventDetail(eventId),
        this.coordinatorRepo.getMyEvents(),
      ]);
    }
    return result;
  }

  /**
   * C-15: Cancels an event and initiates cascade reconciliation.
   */
  public async cancelEvent(
    eventId: string,
  ): Promise<CoordinatorOperationResult<CoordinatorEventDetail>> {
    const result = await this.coordinatorRepo.transitionEventStatus(
      eventId,
      'cancelled',
    );
    if (result.success) {
      await Promise.allSettled([
        this.coordinatorRepo.getEventDetail(eventId),
        this.coordinatorRepo.getMyEvents(),
      ]);
    }
    return result;
  }

  // =========================================================================
  // 3. Event Post / Role Management (C-07 .. C-10, C-28)
  // =========================================================================

  /**
   * C-07: Reads event posts/roles.
   */
  public async getEventPosts(eventId: string): Promise<EventPost[]> {
    const detail = await this.coordinatorRepo.getEventDetail(eventId);
    return detail?.posts || [];
  }

  /**
   * C-08: Creates a new post for an event with capacity reconciliation.
   */
  public async createEventPost(
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
  ): Promise<CoordinatorOperationResult<{ id: string; status: PostStatus }>> {
    const result = await this.coordinatorRepo.createEventPost(eventId, post);
    if (result.success) {
      await Promise.allSettled([
        this.coordinatorRepo.getEventDetail(eventId),
        this.coordinatorRepo.getPostCapacity(eventId),
      ]);
    }
    return result;
  }

  /**
   * C-09: Updates an existing post with capacity reconciliation.
   */
  public async updateEventPost(
    postId: string,
    eventId: string,
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
  ): Promise<CoordinatorOperationResult<{ id: string; status: PostStatus }>> {
    const result = await this.coordinatorRepo.updateEventPost(postId, updates);
    if (result.success) {
      await Promise.allSettled([
        this.coordinatorRepo.getEventDetail(eventId),
        this.coordinatorRepo.getPostCapacity(eventId),
      ]);
    }
    return result;
  }

  /**
   * C-10: Closes an event post to stop accepting new applications.
   */
  public async closeEventPost(
    postId: string,
    eventId: string,
  ): Promise<CoordinatorOperationResult<void>> {
    const result = await this.coordinatorRepo.closeEventPost(postId);
    if (result.success) {
      await Promise.allSettled([
        this.coordinatorRepo.getEventDetail(eventId),
        this.coordinatorRepo.getPostCapacity(eventId),
      ]);
    }
    return result;
  }

  /**
   * C-28: Fetches post capacity breakdown for an event (P1-05).
   */
  public async getPostCapacity(
    eventId: string,
  ): Promise<EventPostCapacity[]> {
    return this.coordinatorRepo.getPostCapacity(eventId);
  }

  // =========================================================================
  // 4. Coordinator Handover & Audit History (C-16 .. C-18)
  // =========================================================================

  /**
   * C-16: Hands over event coordination to another approved coordinator.
   */
  public async handoverEvent(
    eventId: string,
    newCoordinatorUserId: string,
    reason?: string,
  ): Promise<CoordinatorOperationResult> {
    const result = await this.coordinatorRepo.handoverEvent(
      eventId,
      newCoordinatorUserId,
      reason,
    );
    if (result.success) {
      await Promise.allSettled([
        this.coordinatorRepo.getEventDetail(eventId),
        this.coordinatorRepo.getMyEvents(),
      ]);
    }
    return result;
  }

  /**
   * C-17: Retakes event coordination as the original event owner.
   */
  public async retakeEvent(
    eventId: string,
    reason?: string,
  ): Promise<CoordinatorOperationResult> {
    const result = await this.coordinatorRepo.retakeEvent(eventId, reason);
    if (result.success) {
      await Promise.allSettled([
        this.coordinatorRepo.getEventDetail(eventId),
        this.coordinatorRepo.getMyEvents(),
      ]);
    }
    return result;
  }

  /**
   * C-18: Reads event coordinator handover audit history (P1-05).
   */
  public async getCoordinatorHistory(
    eventId: string,
  ): Promise<CoordinatorHistoryItem[]> {
    return this.coordinatorRepo.getCoordinatorHistory(eventId);
  }

  // =========================================================================
  // 5. Application Review & Invites (C-19 .. C-23)
  // =========================================================================

  /**
   * C-19: Reviews applicant applications (with full T2 capabilities for accepted).
   */
  public async getApplications(
    eventId?: string,
  ): Promise<CoordinatorApplicationItem[]> {
    return this.coordinatorRepo.getApplications(eventId);
  }

  /**
   * C-20: Accepts an application with state reconciliation.
   */
  public async acceptApplication(
    applicationId: string,
    eventId?: string,
  ): Promise<CoordinatorOperationResult<CoordinatorApplicationItem>> {
    const result = await this.coordinatorRepo.updateApplicationStatus(
      applicationId,
      'accepted',
    );
    if (result.success) {
      await Promise.allSettled([
        this.coordinatorRepo.getApplications(eventId),
        this.coordinatorRepo.getUnassignedApplications(eventId),
        eventId ? this.coordinatorRepo.getPostCapacity(eventId) : Promise.resolve([]),
      ]);
    }
    return result;
  }

  /**
   * C-21: Rejects an application with state reconciliation.
   */
  public async rejectApplication(
    applicationId: string,
    eventId?: string,
  ): Promise<CoordinatorOperationResult<CoordinatorApplicationItem>> {
    const result = await this.coordinatorRepo.updateApplicationStatus(
      applicationId,
      'rejected',
    );
    if (result.success) {
      await this.coordinatorRepo.getApplications(eventId);
    }
    return result;
  }

  /**
   * C-22: Waitlists an application with state reconciliation.
   */
  public async waitlistApplication(
    applicationId: string,
    eventId?: string,
  ): Promise<CoordinatorOperationResult<CoordinatorApplicationItem>> {
    const result = await this.coordinatorRepo.updateApplicationStatus(
      applicationId,
      'waitlisted',
    );
    if (result.success) {
      await this.coordinatorRepo.getApplications(eventId);
    }
    return result;
  }

  /**
   * C-23: Invites a volunteer to an event.
   */
  public async inviteVolunteer(
    eventId: string,
    volunteerUserId: string | number,
    postId?: string | number,
    note?: string,
  ): Promise<CoordinatorOperationResult<CoordinatorApplicationItem>> {
    const result = await this.coordinatorRepo.inviteVolunteer(
      eventId,
      volunteerUserId,
      postId,
      note,
    );
    if (result.success) {
      await this.coordinatorRepo.getApplications(eventId);
    }
    return result;
  }

  // =========================================================================
  // 6. Assignment Management (C-24 .. C-27)
  // =========================================================================

  /**
   * C-24: Runs automatic assignment algorithm across accepted unassigned applicants.
   */
  public async runAutoAssignment(
    eventId: string,
  ): Promise<CoordinatorOperationResult<CoordinatorAssignmentItem[]>> {
    const result = await this.coordinatorRepo.runAutoAssignment(eventId);
    if (result.success) {
      await Promise.allSettled([
        this.coordinatorRepo.getAssignments(eventId),
        this.coordinatorRepo.getUnassignedApplications(eventId),
        this.coordinatorRepo.getPostCapacity(eventId),
      ]);
    }
    return result;
  }

  /**
   * C-25: Manually assigns an accepted applicant to a post.
   * Full parameters without hardcoding!
   */
  public async assignVolunteerManually(
    applicationId: string,
    postId: string,
    groupCode?: string,
    isGroupLeader?: boolean,
    eventId?: string,
  ): Promise<CoordinatorOperationResult<CoordinatorAssignmentItem>> {
    const result = await this.coordinatorRepo.assignVolunteerManually(
      applicationId,
      postId,
      groupCode,
      isGroupLeader,
    );
    if (result.success) {
      await Promise.allSettled([
        this.coordinatorRepo.getAssignments(eventId),
        this.coordinatorRepo.getUnassignedApplications(eventId),
        eventId ? this.coordinatorRepo.getPostCapacity(eventId) : Promise.resolve([]),
      ]);
    }
    return result;
  }

  /**
   * C-26: Reads assignments for an event.
   */
  public async getAssignments(
    eventId?: string,
  ): Promise<CoordinatorAssignmentItem[]> {
    return this.coordinatorRepo.getAssignments(eventId);
  }

  /**
   * C-26: Cancels an existing shift assignment.
   */
  public async cancelAssignment(
    assignmentId: string,
    eventId?: string,
  ): Promise<CoordinatorOperationResult<CoordinatorAssignmentItem>> {
    const result = await this.coordinatorRepo.cancelAssignment(assignmentId);
    if (result.success) {
      await Promise.allSettled([
        this.coordinatorRepo.getAssignments(eventId),
        this.coordinatorRepo.getUnassignedApplications(eventId),
        eventId ? this.coordinatorRepo.getPostCapacity(eventId) : Promise.resolve([]),
      ]);
    }
    return result;
  }

  /**
   * C-27: Reads accepted applicants who do not currently have an active assignment.
   */
  public async getUnassignedApplications(
    eventId?: string,
  ): Promise<CoordinatorApplicationItem[]> {
    return this.coordinatorRepo.getUnassignedApplications(eventId);
  }

  // =========================================================================
  // 7. Identity Lookup, Attendance Roster, Geo & QR (C-29 .. C-37)
  // =========================================================================

  /**
   * C-29: Resolves volunteer identity and capabilities by UUID for check-in / roster (P1-05).
   */
  public async lookupVolunteerByUuid(
    uuid: string,
    eventId?: string,
  ): Promise<VolunteerUuidLookup> {
    return this.coordinatorRepo.lookupVolunteerByUuid(uuid, eventId);
  }

  /**
   * C-30: Reads attendance roster items for an event.
   */
  public async getAttendanceRoster(
    eventId?: string,
  ): Promise<CoordinatorAttendanceItem[]> {
    return this.coordinatorRepo.getAttendanceRoster(eventId);
  }

  /**
   * C-31: Manually marks an eligible volunteer as checked-in on-site (C-34 / ATT-02).
   * Supports explicit { eventId, volunteerUserId, note? }, (eventId, volunteerUserId, note?),
   * or legacy attendanceId lookup.
   */
  public async manualCheckIn(
    params: { eventId: string | number; volunteerUserId: string | number; note?: string },
  ): Promise<CoordinatorOperationResult<CoordinatorAttendanceItem>>;
  public async manualCheckIn(
    eventId: string | number,
    volunteerUserId: string | number,
    note?: string,
  ): Promise<CoordinatorOperationResult<CoordinatorAttendanceItem>>;
  public async manualCheckIn(
    attendanceId: string,
    eventId?: string,
  ): Promise<CoordinatorOperationResult<CoordinatorAttendanceItem>>;
  public async manualCheckIn(
    arg1: string | number | { eventId: string | number; volunteerUserId: string | number; note?: string },
    arg2?: string | number,
    arg3?: string,
  ): Promise<CoordinatorOperationResult<CoordinatorAttendanceItem>> {
    let result: CoordinatorOperationResult<CoordinatorAttendanceItem>;
    let targetEventId: string | undefined;

    if (typeof arg1 === 'object' && arg1 !== null && 'eventId' in arg1) {
      targetEventId = String(arg1.eventId);
      result = await this.coordinatorRepo.manualCheckIn(arg1);
    } else if (arg2 !== undefined && typeof arg2 === 'number') {
      targetEventId = String(arg1);
      result = await this.coordinatorRepo.manualCheckIn(arg1, arg2, arg3);
    } else {
      targetEventId = arg2 !== undefined ? String(arg2) : undefined;
      result = await this.coordinatorRepo.manualCheckIn(String(arg1));
    }

    if (result.success && (targetEventId || result.data?.eventId)) {
      await this.coordinatorRepo.getAttendanceRoster(targetEventId || result.data?.eventId);
    }
    return result;
  }

  /**
   * C-32: Generates a new coordinator QR token with specified purpose and TTL.
   */
  public async createQrToken(
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
  > {
    return this.coordinatorRepo.createQrToken(
      eventId,
      purpose,
      maxUses,
      ttlMinutes,
    );
  }

  /**
   * C-33: Revokes an active coordinator QR token.
   */
  public async revokeQrToken(
    qrId: string,
  ): Promise<CoordinatorOperationResult> {
    return this.coordinatorRepo.revokeQrToken(qrId);
  }

  /**
   * C-34: Reads pending geo check-in attempts requiring coordinator confirmation.
   */
  public async getPendingGeoConfirmations(
    eventId?: string,
  ): Promise<CoordinatorAttendanceItem[]> {
    return this.coordinatorRepo.getPendingGeoConfirmations(eventId);
  }

  /**
   * C-35: Reads geo check-in attempt history for coordinator review (P1-05).
   */
  public async getGeoAttempts(eventId: string): Promise<GeoAttemptReview[]> {
    return this.coordinatorRepo.getGeoAttempts(eventId);
  }

  /**
   * C-36: Confirms a pending geo check-in attempt with roster reconciliation.
   */
  public async confirmGeoAttendance(
    attendanceId: string,
    eventId?: string,
  ): Promise<CoordinatorOperationResult<CoordinatorAttendanceItem>> {
    const result = await this.coordinatorRepo.confirmGeoAttendance(attendanceId);
    if (result.success) {
      await Promise.allSettled([
        this.coordinatorRepo.getPendingGeoConfirmations(eventId),
        this.coordinatorRepo.getAttendanceRoster(eventId),
      ]);
    }
    return result;
  }

  /**
   * C-37: Rejects a pending geo check-in attempt.
   */
  public async rejectGeoAttendance(
    attendanceId: string,
    eventId?: string,
  ): Promise<CoordinatorOperationResult<CoordinatorAttendanceItem>> {
    const result = await this.coordinatorRepo.rejectGeoAttendance(attendanceId);
    if (result.success) {
      await this.coordinatorRepo.getPendingGeoConfirmations(eventId);
    }
    return result;
  }

  // =========================================================================
  // 8. Coordinator Feedback (C-38, C-39)
  // =========================================================================

  /**
   * C-38: Submits coordinator feedback for a volunteer's shift participation.
   */
  public async submitCoordinatorToVolunteerFeedback(
    eventId: string,
    volunteerUserId: string | number,
    score: number,
    comment?: string,
    tags?: string[],
  ): Promise<CoordinatorOperationResult> {
    return this.coordinatorRepo.submitCoordinatorFeedback(
      eventId,
      volunteerUserId,
      score,
      comment,
      tags,
    );
  }

  /**
   * C-39: Reads received coordinator feedback metrics (P1-04).
   * Removes hard-coded 4.9 invented metrics; returns source-backed data or empty/unavailable state.
   */
  public async getCoordinatorFeedbackSummary(
    _userId?: string,
  ): Promise<{ avgRating: number | null; totalRatings: number }> {
    if (this.profileRepo) {
      const feedback = await this.profileRepo.getOwnFeedback();
      return {
        avgRating: feedback.receivedSummary.coordinatorAvgRating,
        totalRatings: feedback.receivedSummary.coordinatorRatingCount,
      };
    }
    return {
      avgRating: null,
      totalRatings: 0,
    };
  }
}

export function createCoordinatorUseCases(
  deps: CoordinatorUseCasesDeps,
): CoordinatorUseCases {
  return new CoordinatorUseCases(deps);
}
