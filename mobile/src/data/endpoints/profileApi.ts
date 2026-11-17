/**
 * @format
 */

import { ApiClient, defaultApiClient } from '../../core/api/apiClient';
import type { ApiResult } from '../../core/api/apiResult';
import type { ResultsListDto } from '../dto/commonDto';
import type {
  AttendanceHistoryItemDto,
  AvailabilityExceptionDto,
  AvailabilityResponseDto,
  AvailabilityRuleDto,
  AvailabilityRulesReplaceDto,
  CharityInterestsDto,
  CoordinatorProfileEnvelopeDto,
  FeedbackSummaryResponseDto,
  ProfileUpdateRequestDto,
  UserProfileDto,
  VerificationStatusResponseDto,
} from '../dto/profileDto';

export const profileApi = {
  /**
   * Fetches current user's profile.
   * Authenticated endpoint.
   */
  getProfile(
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<UserProfileDto>> {
    return client.get<UserProfileDto>('me/');
  },

  /**
   * Updates allow-listed profile fields. Unknown keys trigger HTTP 400.
   * Authenticated endpoint.
   */
  updateProfile(
    data: ProfileUpdateRequestDto,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<UserProfileDto>> {
    return client.patch<UserProfileDto>('me/', data);
  },

  /**
   * Fetches user's selected charity interests.
   * Authenticated endpoint.
   */
  getCharityInterests(
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<CharityInterestsDto>> {
    return client.get<CharityInterestsDto>('me/charity-interests/');
  },

  /**
   * Replaces user's charity interests.
   * Authenticated endpoint.
   */
  setCharityInterests(
    fieldCodes: string[],
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<CharityInterestsDto>> {
    return client.put<CharityInterestsDto>('me/charity-interests/', {
      field_codes: fieldCodes,
    });
  },

  /**
   * Fetches user's weekly availability rules and exceptions.
   * Authenticated endpoint.
   */
  getAvailability(
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<AvailabilityResponseDto>> {
    return client.get<AvailabilityResponseDto>('me/availability/');
  },

  /**
   * Replaces all weekly availability rules.
   * Authenticated endpoint.
   */
  replaceAvailabilityRules(
    data: AvailabilityRulesReplaceDto,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<{ rules: AvailabilityRuleDto[] }>> {
    return client.put<{ rules: AvailabilityRuleDto[] }>('me/availability/', data);
  },

  /**
   * Upserts a date-specific availability exception.
   * Authenticated endpoint.
   */
  upsertAvailabilityException(
    data: AvailabilityExceptionDto,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<AvailabilityExceptionDto>> {
    return client.post<AvailabilityExceptionDto>(
      'me/availability/exceptions/',
      data,
    );
  },

  /**
   * Deletes an availability exception by ID.
   * Authenticated endpoint.
   */
  deleteAvailabilityException(
    exceptionId: number | string,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<{ status?: string }>> {
    return client.delete<{ status?: string }>(
      `me/availability/exceptions/${exceptionId}/`,
    );
  },

  /**
   * Fetches identity verification status and uploaded image records.
   * Authenticated endpoint.
   */
  getVerificationStatus(
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<VerificationStatusResponseDto>> {
    return client.get<VerificationStatusResponseDto>('me/verification-images/');
  },

  /**
   * Fetches coordinator application status and record.
   * Authenticated endpoint.
   */
  getCoordinatorProfile(
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<CoordinatorProfileEnvelopeDto>> {
    return client.get<CoordinatorProfileEnvelopeDto>('me/coordinator/');
  },

  /**
   * Submits an application for coordinator role.
   * Authenticated endpoint.
   */
  applyForCoordinator(
    notes: string,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<CoordinatorProfileEnvelopeDto>> {
    return client.post<CoordinatorProfileEnvelopeDto>('me/coordinator/', {
      notes,
    });
  },

  /**
   * Fetches user's attendance history records.
   * Authenticated endpoint.
   */
  getAttendanceHistory(
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<ResultsListDto<AttendanceHistoryItemDto>>> {
    return client.get<ResultsListDto<AttendanceHistoryItemDto>>('me/attendance/');
  },

  /**
   * Fetches feedback summary and ratings.
   * Authenticated endpoint.
   */
  getFeedbackSummary(
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<FeedbackSummaryResponseDto>> {
    return client.get<FeedbackSummaryResponseDto>('me/feedback/');
  },
};
