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
