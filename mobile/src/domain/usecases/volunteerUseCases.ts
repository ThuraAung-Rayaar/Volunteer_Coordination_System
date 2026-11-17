/**
 * @format
 * Feature-facing Volunteer Use Cases (V-01 through V-43).
 * Exposes strongly-typed domain actions decoupled from HTTP transports and raw DTO shapes.
 */

import type {
  AvailabilityCheckResult,
  AttendanceHistoryItem,
  CoordinatorEligibilityData,
  EventApplyResult,
  EventFeedbackItem,
  EventRepository,
  GeoCheckInResult,
  IDashboardRepository,
  OnboardingStatusResult,
  PaginatedEventsResult,
  ProfileOperationResult,
  ProfileRepository,
  QrRedeemResult,
  QrResolveResult,
  UserUuidLookupResult,
  VerificationImageUploadResult,
} from '../../data/contracts';
import type {
  AvailabilityException,
  CharityCategoryCode,
  DashboardSummary,
  EventDetail,
  EventFilters,
  EventSummary,
  MyFeedbackResponse,
  VolunteerApplicationItem,
  VolunteerAssignmentItem,
  VolunteerAvailability,
  VolunteerProfile,
  WeeklyAvailabilityRule,
} from '../models';
import type { VerificationCoordinatorData } from '../models/verification';
import {
  defaultLocationProvider,
  LocationFix,
  LocationProvider,
} from '../../core/location/locationProvider';
import { authApi } from '../../data/endpoints/authApi';
import { sessionManager, SessionManager } from '../../core/auth/sessionManager';
import type { OtpDeliveryDto } from '../../data/dto/authDto';

export interface VolunteerUseCasesDeps {
  profileRepository: ProfileRepository;
  eventRepository: EventRepository;
  dashboardRepository?: IDashboardRepository;
  locationProvider?: LocationProvider;
  authClient?: typeof authApi;
  session?: SessionManager;
}

export interface PaginationContinuation {
  filters?: EventFilters;
  currentPage: number;
  pageSize: number;
  hasMore: boolean;
  totalCount: number;
  items: EventSummary[];
}

export class VolunteerUseCases {
  private profileRepo: ProfileRepository;
  private eventRepo: EventRepository;
  private dashboardRepo?: IDashboardRepository;
  private locProvider: LocationProvider;
  private authClient: typeof authApi;
  private session: SessionManager;

  constructor(deps: VolunteerUseCasesDeps) {
    this.profileRepo = deps.profileRepository;
    this.eventRepo = deps.eventRepository;
    this.dashboardRepo = deps.dashboardRepository;
    this.locProvider = deps.locationProvider ?? defaultLocationProvider;
    this.authClient = deps.authClient ?? authApi;
    this.session = deps.session ?? sessionManager;
  }

  // =========================================================================
  // 1. Authentication & Session Lifecycle (V-01 .. V-03)
  // =========================================================================

  /**
   * V-01: Requests an OTP code for phone login or QR registration.
   */
  public async requestOtp(
    phone: string,
    purpose: 'login' | 'qr_registration' = 'login',
  ): Promise<{
    success: boolean;
    status: string;
    delivery?: OtpDeliveryDto;
    devCode?: string;
    message?: string;
  }> {
    const res = await this.authClient.requestOtp({ phone, purpose });
    if (!res.ok) {
      return {
        success: false,
        status: 'failed',
        message: res.error.message,
      };
    }
    return {
      success: true,
      status: res.data.status,
      delivery: res.data.delivery,
      devCode: res.data.dev_code,
    };
  }

  /**
   * V-02: Verifies an OTP code, issues session token, and establishes authenticated identity.
   */
  public async verifyOtp(
    phone: string,
    code: string,
    displayName?: string,
    purpose: 'login' | 'qr_registration' = 'login',
  ): Promise<{
    success: boolean;
    token?: string;
    user?: {
      id: number;
      uuid: string | null;
      displayName: string;
      verificationStatus: string;
    };
    message?: string;
  }> {
    const res = await this.authClient.verifyOtp({
      phone,
      code,
      purpose,
      display_name: displayName,
    });
    if (!res.ok) {
      return {
        success: false,
        message: res.error.message,
      };
    }
    await this.session.setToken(res.data.token);
    return {
      success: true,
      token: res.data.token,
      user: {
        id: res.data.user.id,
        uuid: res.data.user.uuid,
        displayName: res.data.user.display_name,
        verificationStatus: res.data.user.verification_status,
      },
    };
  }

  /**
   * V-03: Logs out the current session and clears persisted tokens.
   */
  public async logout(): Promise<void> {
    try {
      await this.authClient.logout();
    } catch {
      // Best-effort remote revocation
    } finally {
      await this.session.logout();
    }
  }

  // =========================================================================
  // 2. Profile, Charity Interests & Public Identity (V-04 .. V-06, V-18)
  // =========================================================================

  /**
   * V-04: Reads the volunteer's own complete profile.
   */
  public async getProfile(): Promise<VolunteerProfile> {
    return this.profileRepo.getProfile();
  }

  /**
   * V-05: Updates allow-listed profile fields with complete donation preference merging.
   */
  public async updateProfile(
    updates: Partial<VolunteerProfile>,
  ): Promise<ProfileOperationResult<VolunteerProfile>> {
    return this.profileRepo.updateProfile(updates);
  }

  /**
   * V-06: Manages charity interest taxonomies.
   */
  public async updateCharityInterests(
    fieldCodes: CharityCategoryCode[],
  ): Promise<ProfileOperationResult<VolunteerProfile>> {
    return this.profileRepo.updateProfile({ charityInterests: fieldCodes });
  }

  /**
   * V-18: Looks up a user's public T1 profile (and permitted T2 capabilities) by UUID.
   */
  public async lookupUserByUuid(
    uuid: string,
    eventId?: string | number,
  ): Promise<UserUuidLookupResult> {
    return this.profileRepo.lookupUserByUuid(uuid, eventId);
  }

  // =========================================================================
  // 3. Availability Rules & Conflict Preflights (V-07 .. V-12)
  // =========================================================================

  /**
   * V-07: Reads recurring weekly availability rules and date exceptions.
   */
  public async getAvailability(): Promise<VolunteerAvailability> {
    return this.profileRepo.getAvailability();
  }

  /**
   * V-08: Saves or replaces a recurring weekly availability rule.
   */
  public async saveWeeklyRule(
    rule: Omit<WeeklyAvailabilityRule, 'id'>,
  ): Promise<ProfileOperationResult<WeeklyAvailabilityRule>> {
    return this.profileRepo.saveWeeklyRule(rule);
  }

  /**
   * V-08: Deletes a recurring weekly availability rule.
   */
  public async deleteWeeklyRule(
    ruleId: string,
  ): Promise<ProfileOperationResult> {
    return this.profileRepo.deleteWeeklyRule(ruleId);
  }

  /**
   * V-09: Upserts a specific date availability exception.
   */
  public async saveException(
    exception: Omit<AvailabilityException, 'id'>,
  ): Promise<ProfileOperationResult<AvailabilityException>> {
    return this.profileRepo.saveException(exception);
  }

  /**
   * V-10: Deletes a date availability exception.
   */
  public async deleteException(
    exceptionId: string,
  ): Promise<ProfileOperationResult> {
    return this.profileRepo.deleteException(exceptionId);
  }

  /**
   * V-11: Checks volunteer availability and schedule conflicts against an event.
   */
  public async checkAvailabilityForEvent(
    eventId: string | number,
  ): Promise<AvailabilityCheckResult> {
    return this.profileRepo.checkAvailabilityForEvent(eventId);
  }

  /**
   * V-12: Checks volunteer availability and schedule conflicts against a proposed time window.
   */
  public async checkAvailabilityForWindow(
    startAt: string,
    endAt: string,
  ): Promise<AvailabilityCheckResult> {
    return this.profileRepo.checkAvailabilityForWindow(startAt, endAt);
  }

  // =========================================================================
  // 4. Verification & Coordinator Application (V-13 .. V-17)
  // =========================================================================

  /**
   * V-13: Uploads an identity verification image (selfie or ID document).
   */
  public async uploadVerificationImage(
    imageType: string,
    fileUri: string,
    mimeType?: string,
    fileName?: string,
  ): Promise<VerificationImageUploadResult> {
    return this.profileRepo.uploadVerificationImage(
      imageType,
      fileUri,
      mimeType,
      fileName,
    );
  }

  /**
   * V-14: Reads identity verification status and image slots.
   */
  public async getVerificationStatus(): Promise<VerificationCoordinatorData> {
    return this.profileRepo.getVerificationStatus();
  }

  /**
   * V-15: Evaluates coordinator eligibility checks.
   */
  public async getCoordinatorEligibility(): Promise<CoordinatorEligibilityData> {
    return this.profileRepo.getCoordinatorEligibility();
  }

  /**
   * V-15 / V-16: Submits an application to become a coordinator.
   */
  public async submitCoordinatorApplication(
    note: string,
  ): Promise<ProfileOperationResult> {
    return this.profileRepo.submitCoordinatorApplication(note);
  }

  /**
   * V-17: Updates notes on a pending coordinator application.
   */
  public async updateCoordinatorApplicationNotes(
    notes: string,
  ): Promise<ProfileOperationResult> {
    return this.profileRepo.updateCoordinatorApplicationNotes(notes);
  }

  // =========================================================================
  // 5. Charity Taxonomy & Event Discovery (V-19 .. V-22)
  // =========================================================================

  /**
   * V-19: Fetches the public charity category taxonomy.
   */
  public async getCharityFields(): Promise<
    Array<{ code: string; label: string; sort_order?: number }>
  > {
    return this.eventRepo.getCharityFields();
  }

  /**
   * V-20: Discovers public published/active events with optional filtering.
   */
  public async getEvents(filters?: EventFilters): Promise<EventSummary[]> {
    return this.eventRepo.getEvents(filters);
  }

  /**
   * V-20: Discovers public events with paginated slicing and continuation support.
   */
  public async getEventsPage(
    filters?: EventFilters,
    page: number = 1,
    pageSize: number = 10,
  ): Promise<PaginatedEventsResult> {
    return this.eventRepo.getEventsPage(filters, page, pageSize);
  }

  /**
   * V-20: Helper for paginated continuation loading.
   */
  public async loadNextPage(
    current: PaginationContinuation,
  ): Promise<PaginationContinuation> {
    if (!current.hasMore) {
      return current;
    }
    const nextPage = current.currentPage + 1;
    const pageResult = await this.eventRepo.getEventsPage(
      current.filters,
      nextPage,
      current.pageSize,
    );
    return {
      filters: current.filters,
      currentPage: nextPage,
      pageSize: current.pageSize,
      hasMore: pageResult.next !== null,
      totalCount: pageResult.count,
      items: [...current.items, ...pageResult.results],
    };
  }

  /**
   * V-21 / V-22: Fetches full details for an event including open roles, requirements, and capacity.
   */
  public async getEventDetail(eventId: string): Promise<EventDetail | null> {
    return this.eventRepo.getEventById(eventId);
  }

  // =========================================================================
  // 6. Applications & Shift Participation (V-23 .. V-30)
  // =========================================================================

  /**
   * V-23: Submits an application for an event post with automatic state reconciliation.
   */
  public async applyToPost(
    eventId: string,
    postId: string,
    note?: string,
  ): Promise<EventApplyResult> {
    const result = await this.eventRepo.applyToPost(eventId, postId, note);
    // State reconciliation: refresh own applications and event detail cache
    await Promise.allSettled([
      this.eventRepo.getUserApplications(),
      this.eventRepo.getEventById(eventId),
    ]);
    return result;
  }

  /**
   * V-24: Joins an event via an invite.
   */
  public async joinThroughInvite(
    eventId: string,
    postId?: string,
    note?: string,
  ): Promise<EventApplyResult> {
    return this.applyToPost(eventId, postId ?? '', note ?? 'Accepted coordinator invitation');
  }

  /**
   * V-25: Joins an event through QR walk-in registration.
   */
  public async joinThroughQrWalkIn(token: string): Promise<QrRedeemResult> {
    const res = await this.eventRepo.redeemQrToken(token);
    if (res.success && res.eventId) {
      await Promise.allSettled([
        this.eventRepo.getUserApplications(),
        this.eventRepo.getEventById(res.eventId),
      ]);
    }
    return res;
  }

  /**
   * V-26: Reads all applications submitted by the volunteer.
   */
  public async getUserApplications(): Promise<VolunteerApplicationItem[]> {
    return this.eventRepo.getUserApplications();
  }

  /**
   * V-27: Withdraws a pending or waitlisted application with state reconciliation.
   */
  public async withdrawApplication(
    applicationId: string,
    eventId?: string,
  ): Promise<{ success: boolean; message: string }> {
    const result = await this.eventRepo.withdrawApplication(applicationId);
    if (result.success) {
      const tasks: Promise<any>[] = [this.eventRepo.getUserApplications()];
      if (eventId) {
        tasks.push(this.eventRepo.getEventById(eventId));
      }
      await Promise.allSettled(tasks);
    }
    return result;
  }

  /**
   * V-28: Reads all assigned, confirmed, and completed shifts for the volunteer.
   */
  public async getUserAssignments(): Promise<VolunteerAssignmentItem[]> {
    return this.eventRepo.getUserAssignments();
  }

  /**
   * V-29: Confirms participation in an assigned shift with state reconciliation.
   */
  public async confirmAssignment(
    assignmentId: string,
  ): Promise<{ success: boolean; message: string }> {
    const result = await this.eventRepo.confirmAssignment(assignmentId);
    if (result.success) {
      await this.eventRepo.getUserAssignments();
    }
    return result;
  }

  /**
   * V-30: Cancels participation in a scheduled shift with state reconciliation.
   */
  public async cancelAssignment(
    assignmentId: string,
  ): Promise<{ success: boolean; message: string }> {
    const result = await this.eventRepo.cancelAssignment(assignmentId);
    if (result.success) {
      await this.eventRepo.getUserAssignments();
    }
    return result;
  }

  // =========================================================================
  // 7. Onboarding, QR & Geo Check-in (V-31 .. V-38)
  // =========================================================================

  /**
   * V-31: Reads onboarding briefing text, version, and acknowledgment status.
   */
  public async getEventOnboarding(
    eventId: string,
  ): Promise<OnboardingStatusResult> {
    return this.eventRepo.getEventOnboarding(eventId);
  }

  /**
   * V-32: Acknowledges safety onboarding briefing for an event.
   */
  public async acknowledgeOnboarding(
    eventId: string,
    notes?: string,
  ): Promise<{ success: boolean; message: string; acknowledged: boolean }> {
    return this.eventRepo.acknowledgeOnboarding(eventId, notes);
  }

  /**
   * V-33: Previews/resolves a QR token without consuming a redemption use.
   */
  public async resolveQrToken(token: string): Promise<QrResolveResult> {
    return this.eventRepo.resolveQrToken(token);
  }

  /**
   * V-34: Redeems a general-purpose QR token.
   */
  public async redeemQrToken(token: string): Promise<QrRedeemResult> {
    return this.eventRepo.redeemQrToken(token);
  }

  /**
   * V-35: Checks in to an assigned shift using a QR token.
   */
  public async qrCheckIn(token: string): Promise<QrRedeemResult> {
    const result = await this.eventRepo.qrCheckIn(token);
    if (result.success) {
      await this.eventRepo.getUserAssignments();
    }
    return result;
  }

  /**
   * V-36: Submits geo check-in using device GPS via LocationProvider.
   * Fails fast if location permission is denied or device hardware is unavailable.
   */
  public async submitGeoCheckIn(
    eventId: string,
    customCoordinates?: {
      latitude: number;
      longitude: number;
      accuracyM?: number;
    },
  ): Promise<GeoCheckInResult> {
    let fix: LocationFix;

    if (customCoordinates) {
      fix = {
        latitude: customCoordinates.latitude,
        longitude: customCoordinates.longitude,
        accuracyM: customCoordinates.accuracyM ?? null,
        capturedAt: new Date().toISOString(),
        isMocked: false,
      };
    } else {
      const perm = await this.locProvider.requestPermission();
      if (perm === 'denied') {
        throw new Error('Location permission denied. Cannot capture device GPS telemetry.');
      }
      if (perm === 'unavailable') {
        throw new Error('Device location services are unavailable.');
      }
      fix = await this.locProvider.getCurrentPosition();
    }

    const result = await this.eventRepo.submitGeoCheckIn(
      eventId,
      fix.latitude,
      fix.longitude,
      fix.accuracyM ?? undefined,
    );
    if (result.success) {
      await this.eventRepo.getUserAssignments();
    }
    return result;
  }

  /**
   * V-37: Checks out of an active attendance shift with state reconciliation.
   */
  public async checkOutAttendance(
    attendanceId: string,
  ): Promise<{ success: boolean; message: string; checkedOutAt?: string }> {
    const result = await this.eventRepo.checkOutAttendance(attendanceId);
    if (result.success) {
      await this.eventRepo.getUserAssignments();
    }
    return result;
  }

  /**
   * V-38: Reads the volunteer's comprehensive attendance history.
   */
  public async getAttendanceHistory(): Promise<AttendanceHistoryItem[]> {
    return this.profileRepo.getAttendanceHistory();
  }

  // =========================================================================
  // 8. Direction-Safe Feedback & Dashboard Summary (V-39 .. V-43)
  // =========================================================================

  /**
   * V-39: Submits feedback about an event.
   */
  public async submitVolunteerToEventFeedback(
    eventId: string,
    score: number,
    comment?: string,
    tags?: string[],
  ): Promise<{ success: boolean; message: string; feedbackId?: string }> {
    return this.eventRepo.submitEventFeedback(
      eventId,
      score,
      comment,
      tags,
      'volunteer_to_event',
    );
  }

  /**
   * V-40: Submits direction-safe feedback about an event coordinator.
   */
  public async submitVolunteerToCoordinatorFeedback(
    eventId: string,
    score: number,
    comment?: string,
    tags?: string[],
  ): Promise<{ success: boolean; message: string; feedbackId?: string }> {
    return this.eventRepo.submitEventFeedback(
      eventId,
      score,
      comment,
      tags,
      'volunteer_to_coordinator',
    );
  }

  /**
   * V-39: Reads public feedback ratings and reviews for an event.
   */
  public async getEventFeedbackList(
    eventId: string,
  ): Promise<EventFeedbackItem[]> {
    return this.eventRepo.getEventFeedbackList(eventId);
  }

  /**
   * V-41 / V-42: Reads authored reviews and received aggregate feedback metrics.
   */
  public async getMyFeedback(): Promise<MyFeedbackResponse> {
    return this.profileRepo.getOwnFeedback();
  }

  /**
   * V-43: Composes high-level dashboard metrics for the volunteer home screen.
   */
  public async getDashboardSummary(): Promise<DashboardSummary> {
    if (this.dashboardRepo) {
      return this.dashboardRepo.getDashboardSummary();
    }
    // Fallback composition using eventRepo + profileRepo
    const [assignments, history, feedback] = await Promise.all([
      this.eventRepo.getUserAssignments(),
      this.profileRepo.getAttendanceHistory(),
      this.profileRepo.getOwnFeedback(),
    ]);

    const upcoming = assignments
      .filter((a): a is VolunteerAssignmentItem & { status: 'confirmed' | 'assigned' } =>
        a.status === 'assigned' || a.status === 'confirmed',
      )
      .map(a => ({
        id: a.id,
        eventId: a.eventId,
        eventTitle: a.eventTitle,
        roleName: a.postTitle,
        startAt: a.startAt,
        endAt: a.endAt,
        location: a.location,
        status: a.status,
      }));

    const recent = history.slice(0, 5).map(h => ({
      id: h.id,
      eventId: h.eventId,
      eventTitle: h.eventTitle || 'Event',
      roleName: h.postTitle || 'Volunteer Role',
      completedAt: h.checkoutAt ?? h.checkinAt ?? new Date().toISOString(),
      attendanceStatus: 'completed' as const,
      verifiedHours: h.verifiedHours ?? 0,
      location: h.locationName || 'Location',
      attendanceVerifiedAt: h.checkoutAt ?? h.checkinAt ?? new Date().toISOString(),
    }));

    return {
      completedShiftCount: history.length,
      completedEventCount: new Set(history.map(h => h.eventId)).size,
      upcomingCommitmentCount: upcoming.length,
      ratingAverage: feedback.receivedSummary.overallAvgRating ?? 5.0,
      ratingCount: feedback.receivedSummary.totalCount,
      upcomingCommitments: upcoming,
      recentCompletedActivities: recent,
    };
  }
}

export function createVolunteerUseCases(
  deps: VolunteerUseCasesDeps,
): VolunteerUseCases {
  return new VolunteerUseCases(deps);
}
