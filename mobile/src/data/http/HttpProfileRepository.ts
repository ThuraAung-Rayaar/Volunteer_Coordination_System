/**
 * @format
 */

import { ApiClient, defaultApiClient } from '../../core/api/apiClient';
import type {
  AvailabilityException,
  VolunteerAvailability,
  WeeklyAvailabilityRule,
} from '../../domain/models/availability';
import type { CoordinatorStatus } from '../../domain/models';
import type { VolunteerProfile } from '../../domain/models/profile';
import type { VerificationCoordinatorData } from '../../domain/models/verification';
import type {
  CoordinatorEligibilityData,
  ProfileOperationResult,
  ProfileRepository,
} from '../contracts/profileRepository';
import { profileApi } from '../endpoints/profileApi';
import {
  formatToTimeWithSeconds,
  mapAvailability,
  mapAvailabilityRulesReplaceRequest,
  mapProfileUpdateRequest,
  mapUserProfile,
  mapVerificationCoordinatorData,
  normalizeTimeString,
} from '../mappers/profileMapper';
import type { AvailabilityExceptionDto } from '../dto/profileDto';

const WEEKDAY_NAMES = [
  '',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export class HttpProfileRepository implements ProfileRepository {
  private client: ApiClient;

  constructor(client: ApiClient = defaultApiClient) {
    this.client = client;
  }

  public async getProfile(): Promise<VolunteerProfile> {
    const [profRes, coordRes, feedbackRes, interestsRes] = await Promise.all([
      profileApi.getProfile(this.client),
      profileApi.getCoordinatorProfile(this.client),
      profileApi.getFeedbackSummary(this.client),
      profileApi.getCharityInterests(this.client),
    ]);

    if (!profRes.ok) {
      throw new Error(`Failed to load profile: ${profRes.error.message}`);
    }

    if (interestsRes.ok && interestsRes.data.field_codes) {
      profRes.data.charity_interests = interestsRes.data.field_codes;
    }

    return mapUserProfile(
      profRes.data,
      coordRes.ok ? coordRes.data : null,
      feedbackRes.ok ? feedbackRes.data : null,
    );
  }

  public async updateProfile(
    updates: Partial<VolunteerProfile>,
  ): Promise<ProfileOperationResult<VolunteerProfile>> {
    const dto = mapProfileUpdateRequest(updates);

    if (updates.charityInterests) {
      const interestsRes = await profileApi.setCharityInterests(
        updates.charityInterests,
        this.client,
      );
      if (!interestsRes.ok) {
        return {
          success: false,
          message: `Failed to update charity interests: ${interestsRes.error.message}`,
        };
      }
    }

    if (Object.keys(dto).length > 0) {
      const updateRes = await profileApi.updateProfile(dto, this.client);
      if (!updateRes.ok) {
        return {
          success: false,
          message: updateRes.error.message,
        };
      }
    }

    const updatedProfile = await this.getProfile();
    return {
      success: true,
      message: 'Profile updated successfully',
      data: updatedProfile,
    };
  }

  public async getAvailability(): Promise<VolunteerAvailability> {
    const res = await profileApi.getAvailability(this.client);
    if (!res.ok) {
      throw new Error(`Failed to load availability: ${res.error.message}`);
    }

    return mapAvailability(res.data);
  }

  public async saveWeeklyRule(
    rule: Omit<WeeklyAvailabilityRule, 'id'>,
  ): Promise<ProfileOperationResult<WeeklyAvailabilityRule>> {
    const curr = await this.getAvailability();
    const weekdayName =
      rule.weekdayName || WEEKDAY_NAMES[rule.weekday] || `Day ${rule.weekday}`;

    const normStart = normalizeTimeString(rule.startTime);
    const normEnd = normalizeTimeString(rule.endTime);
    const deterministicId = `${rule.weekday}-${normStart}-${normEnd}`;

    const newRule: WeeklyAvailabilityRule = {
      ...rule,
      weekdayName,
      startTime: normStart,
      endTime: normEnd,
      id: deterministicId,
    };

    const updatedRules: WeeklyAvailabilityRule[] = [
      ...curr.weeklyRules.filter(
        r => !(r.weekday === rule.weekday && r.startTime === normStart),
      ),
      newRule,
    ];

    const payload = mapAvailabilityRulesReplaceRequest(updatedRules);
    const res = await profileApi.replaceAvailabilityRules(payload, this.client);
    if (!res.ok) {
      return {
        success: false,
        message: res.error.message,
      };
    }

    return {
      success: true,
      message: 'Rule saved successfully',
      data: newRule,
    };
  }

  public async deleteWeeklyRule(
    ruleId: string,
  ): Promise<ProfileOperationResult> {
    const curr = await this.getAvailability();
    const remaining = curr.weeklyRules.filter(r => r.id !== ruleId);
    const payload = mapAvailabilityRulesReplaceRequest(remaining);
    const res = await profileApi.replaceAvailabilityRules(payload, this.client);

    if (!res.ok) {
      return {
        success: false,
        message: res.error.message,
      };
    }

    return {
      success: true,
      message: 'Rule deleted successfully',
    };
  }

  public async saveException(
    exception: Omit<AvailabilityException, 'id'>,
  ): Promise<ProfileOperationResult<AvailabilityException>> {
    const dto: AvailabilityExceptionDto = {
      date: exception.date,
      is_available: exception.isAvailable,
      start_time:
        exception.isAvailable && exception.startTime
          ? formatToTimeWithSeconds(exception.startTime)
          : null,
      end_time:
        exception.isAvailable && exception.endTime
          ? formatToTimeWithSeconds(exception.endTime)
          : null,
      note: exception.note ?? null,
    };

    const res = await profileApi.upsertAvailabilityException(dto, this.client);
    if (!res.ok) {
      return {
        success: false,
        message: res.error.message,
      };
    }

    return {
      success: true,
      message: 'Exception saved successfully',
      data: {
        ...exception,
        id: String(res.data.id || exception.date),
      },
    };
  }

  public async deleteException(
    exceptionId: string,
  ): Promise<ProfileOperationResult> {
    const res = await profileApi.deleteAvailabilityException(
      exceptionId,
      this.client,
    );
    if (!res.ok) {
      return {
        success: false,
        message: res.error.message,
      };
    }

    return {
      success: true,
      message: 'Exception deleted successfully',
    };
  }

  public async getVerificationStatus(): Promise<VerificationCoordinatorData> {
    const [verRes, coordRes] = await Promise.all([
      profileApi.getVerificationStatus(this.client),
      profileApi.getCoordinatorProfile(this.client),
    ]);

    if (!verRes.ok) {
      throw new Error(
        `Failed to load verification status: ${verRes.error.message}`,
      );
    }

    return mapVerificationCoordinatorData(
      verRes.data,
      coordRes.ok ? coordRes.data : null,
    );
  }

  public async getCoordinatorEligibility(): Promise<CoordinatorEligibilityData> {
    const [verRes, coordRes, attendanceRes, feedbackRes] = await Promise.all([
      profileApi.getVerificationStatus(this.client),
      profileApi.getCoordinatorProfile(this.client),
      profileApi.getAttendanceHistory(this.client),
      profileApi.getFeedbackSummary(this.client),
    ]);

    const verificationStatus = verRes.ok
      ? (verRes.data.verification_status as any) || 'unverified'
      : 'unverified';
    const isVerified =
      verificationStatus === 'approved' || verificationStatus === 'verified';

    const attendanceRecords =
      attendanceRes.ok && attendanceRes.data.results
        ? attendanceRes.data.results
        : [];
    const completedAttendance = attendanceRecords.filter(
      att => att.status === 'completed',
    );
    const completedAttendanceEventsCount = completedAttendance.length;
    const meetsCompletedEventsRequirement =
      isVerified || completedAttendanceEventsCount >= 5;

    const summary = feedbackRes.ok ? feedbackRes.data.summary : null;
    const ratingAvg =
      summary?.volunteer_avg_rating ?? summary?.overall_avg_rating ?? null;
    const ratingCount =
      summary?.volunteer_rating_count ?? summary?.total_count ?? 0;
    const meetsGoodRatingRequirement = isVerified
      ? true
      : ratingAvg !== null
      ? ratingAvg >= 4.0
      : null;

    let coordinatorStatus: CoordinatorStatus = 'none';
    if (coordRes.ok && coordRes.data.coordinator) {
      coordinatorStatus = coordRes.data.coordinator
        .status as CoordinatorStatus;
    }

    return {
      verificationStatus,
      isVerified,
      completedAttendanceEventsCount,
      meetsCompletedEventsRequirement,
      meetsGoodRatingRequirement,
      ratingAverage: ratingAvg,
      ratingCount,
      coordinatorStatus,
    };
  }

  public async submitCoordinatorApplication(
    note: string,
  ): Promise<ProfileOperationResult> {
    const res = await profileApi.applyForCoordinator(note, this.client);
    if (!res.ok) {
      return {
        success: false,
        message: res.error.message,
      };
    }

    return {
      success: true,
      message: 'Coordinator application submitted successfully',
    };
  }
}

export const defaultHttpProfileRepository = new HttpProfileRepository();
