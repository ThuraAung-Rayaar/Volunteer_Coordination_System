/**
 * @format
 */

import { ApiClient, defaultApiClient } from '../../core/api/apiClient';
import type { ApiResult } from '../../core/api/apiResult';
import type { ResultsListDto } from '../dto/commonDto';
import type {
  AttendanceHistoryItemDto,
  AvailabilityCheckResultDto,
  AvailabilityExceptionDto,
  AvailabilityResponseDto,
  AvailabilityRuleDto,
  AvailabilityRulesReplaceDto,
  CharityInterestsDto,
  CoordinatorProfileEnvelopeDto,
  FeedbackSummaryResponseDto,
  ProfileUpdateRequestDto,
  UserProfileDto,
  UserUuidLookupDto,
  VerificationImageUploadResponseDto,
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
   * Replaces all weekly availability rules (V-08).
   * Authenticated endpoint.
   */
  replaceAvailabilityRules(
    data: AvailabilityRulesReplaceDto,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<{ rules: AvailabilityRuleDto[] }>> {
    return client.post<{ rules: AvailabilityRuleDto[] }>('me/availability/rules/', data);
  },

  /**
   * Checks event availability against schedule and rules (V-11).
   * Authenticated endpoint.
   */
  checkEventAvailability(
    eventId: number | string,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<AvailabilityCheckResultDto>> {
    return client.get<AvailabilityCheckResultDto>('me/availability/check/', {
      params: { event_id: eventId },
    });
  },

  /**
   * Checks specific time window availability (V-12).
   * Authenticated endpoint.
   */
  checkWindowAvailability(
    window: { start_at: string; end_at: string },
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<AvailabilityCheckResultDto>> {
    return client.post<AvailabilityCheckResultDto>('me/availability/check/', window);
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
   * Uploads verification document image via multipart/form-data (V-13).
   * Authenticated endpoint.
   */
  uploadVerificationImage(
    formData: FormData,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<VerificationImageUploadResponseDto>> {
    return client.postMultipart<VerificationImageUploadResponseDto>(
      'me/verification-images/',
      formData,
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
   * Updates coordinator application statement / notes (V-17 / C-03).
   * Authenticated endpoint.
   */
  updateCoordinatorApplicationNotes(
    notes: string,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<CoordinatorProfileEnvelopeDto>> {
    return client.patch<CoordinatorProfileEnvelopeDto>('me/coordinator/', {
      notes,
    });
  },

  /**
   * Looks up user by public UUID (V-18 / C-29).
   * Optionally takes event_id to reveal T2 profile hints when caller is event coordinator.
   * Authenticated endpoint.
   */
  lookupUserByUuid(
    uuid: string,
    eventId?: number | string,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<UserUuidLookupDto>> {
    return client.get<UserUuidLookupDto>(
      `users/by-uuid/${uuid}/`,
      eventId !== undefined ? { params: { event_id: eventId } } : undefined,
    );
  },

  /**
   * Fetches user's attendance history records (V-38).
   * Canonical route: checkin/me/attendance/
   * Authenticated endpoint.
   */
  getAttendanceHistory(
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<ResultsListDto<AttendanceHistoryItemDto>>> {
    return client.get<ResultsListDto<AttendanceHistoryItemDto>>('checkin/me/attendance/');
  },

  /**
   * Fetches feedback summary and ratings (V-41 & V-42).
   * Canonical route: checkin/me/feedback/
   * Authenticated endpoint.
   */
  getFeedbackSummary(
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<FeedbackSummaryResponseDto>> {
    return client.get<FeedbackSummaryResponseDto>('checkin/me/feedback/');
  },
};
