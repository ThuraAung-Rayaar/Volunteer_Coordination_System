/**
 * @format
 */

import type {
  AvailabilityException,
  VolunteerAvailability,
  WeeklyAvailabilityRule,
} from '../../domain/models/availability';
import type { CoordinatorStatus } from '../../domain/models';
import type { VolunteerProfile } from '../../domain/models/profile';
import type { MyFeedbackResponse } from '../../domain/models/feedback';
import type {
  VerificationCoordinatorData,
  VerificationStatus,
} from '../../domain/models/verification';

export interface ProfileOperationResult<T = void> {
  success: boolean;
  message: string;
  data?: T;
}

export interface CoordinatorEligibilityData {
  verificationStatus: VerificationStatus;
  isVerified: boolean;
  completedAttendanceEventsCount: number;
  meetsCompletedEventsRequirement: boolean;
  meetsGoodRatingRequirement: boolean | null;
  ratingAverage: number | null;
  ratingCount: number;
  coordinatorStatus: CoordinatorStatus;
}

export interface AvailabilityCheckResult {
  isAvailable: boolean;
  scheduleConflict?: boolean;
  eventId?: string;
  startAt?: string;
  endAt?: string;
}

export interface VerificationImageUploadResult {
  id: string;
  imageType: string;
  status: string;
  comparisonStatus?: string;
  isCurrent?: boolean;
  createdAt: string;
}

export interface UserUuidLookupResult {
  userId?: number;
  uuid: string;
  displayName: string;
  skills?: string[];
  physicalOk?: boolean;
  goodEyesight?: boolean;
  needsGlasses?: boolean;
  canLiftHeavy?: boolean;
  canWorkOutdoor?: boolean;
  hasLeaderExperience?: boolean;
  newToVolunteer?: boolean;
  preferredLanguage?: string;
  homeArea?: string | null;
  needsMealSupport?: boolean;
  needsTravelSupport?: boolean;
  acceptsUnpaid?: boolean;
  verificationStatus?: string;
}

export interface AttendanceHistoryItem {
  id: string;
  assignmentId?: string | null;
  eventId: string;
  eventTitle?: string | null;
  locationName?: string | null;
  postId?: string | null;
  postTitle?: string | null;
  scheduleStart?: string | null;
  scheduleEnd?: string | null;
  status: string;
  method: string | null;
  checkinAt: string | null;
  checkoutAt: string | null;
  confirmationStatus?: string | null;
  walkInFlag?: boolean;
  verifiedHours?: number | null;
}

export interface ProfileRepository {
  /**
   * Fetches the current user's volunteer profile including allow-listed fields.
   */
  getProfile(): Promise<VolunteerProfile>;

  /**
   * Updates allow-listed profile fields in local mock state.
   */
  updateProfile(
    updates: Partial<VolunteerProfile>,
  ): Promise<ProfileOperationResult<VolunteerProfile>>;

  /**
   * Fetches volunteer availability rules and exceptions.
   */
  getAvailability(): Promise<VolunteerAvailability>;

  /**
   * Adds or updates a weekly availability rule.
   */
  saveWeeklyRule(
    rule: Omit<WeeklyAvailabilityRule, 'id'>,
  ): Promise<ProfileOperationResult<WeeklyAvailabilityRule>>;

  /**
   * Removes a weekly availability rule.
   */
  deleteWeeklyRule(ruleId: string): Promise<ProfileOperationResult>;

  /**
   * Adds or updates an availability exception (blackout or special slot).
   */
  saveException(
    exception: Omit<AvailabilityException, 'id'>,
  ): Promise<ProfileOperationResult<AvailabilityException>>;

  /**
   * Removes an availability exception.
   */
  deleteException(exceptionId: string): Promise<ProfileOperationResult>;

  /**
   * Checks volunteer availability against a specific scheduled event (V-11).
   */
  checkAvailabilityForEvent(
    eventId: string | number,
  ): Promise<AvailabilityCheckResult>;

  /**
   * Checks volunteer availability against an arbitrary start/end time window (V-12).
   */
  checkAvailabilityForWindow(
    startAt: string,
    endAt: string,
  ): Promise<AvailabilityCheckResult>;

  /**
   * Uploads an identity verification image (V-13).
   */
  uploadVerificationImage(
    imageType: string,
    fileUri: string,
    mimeType?: string,
    fileName?: string,
  ): Promise<VerificationImageUploadResult>;

  /**
   * Updates coordinator application note (V-17 / C-03).
   */
  updateCoordinatorApplicationNotes(
    notes: string,
  ): Promise<ProfileOperationResult>;

  /**
   * Resolves volunteer identity by QR UUID (V-18 / C-29).
   */
  lookupUserByUuid(
    uuid: string,
    eventId?: string | number,
  ): Promise<UserUuidLookupResult>;

  /**
   * Fetches the volunteer's comprehensive attendance history (V-38).
   */
  getAttendanceHistory(): Promise<AttendanceHistoryItem[]>;

  /**
   * Fetches the volunteer's authored feedback list and received summary metrics (V-41, V-42).
   */
  getOwnFeedback(): Promise<MyFeedbackResponse>;

  /**
   * Fetches identity verification status and coordinator application data.
   */
  getVerificationStatus(): Promise<VerificationCoordinatorData>;

  /**
   * Evaluates coordinator eligibility checks:
   * 1. Account verified
   * 2. At least 5 attendance-backed completed events
   * 3. Good rating requirement (null indicates pending server confirmation)
   */
  getCoordinatorEligibility(): Promise<CoordinatorEligibilityData>;

  /**
   * Submits a coordinator application note (demo mode).
   */
  submitCoordinatorApplication(note: string): Promise<ProfileOperationResult>;
}
