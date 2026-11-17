/**
 * @format
 */

import { ApiClient, defaultApiClient } from '../../core/api/apiClient';
import type { ApiResult } from '../../core/api/apiResult';
import type { ResultsListDto } from '../dto/commonDto';
import type {
  CheckoutResponseDto,
  EventFeedbackItemDto,
  FeedbackSubmitRequestDto,
  FeedbackSubmitResponseDto,
  GeoAttemptReviewDto,
  GeoCheckinRequestDto,
  GeoCheckinResponseDto,
  ManualCheckinRequestDto,
  ManualCheckinResponseDto,
  OnboardingAcknowledgeRequestDto,
  OnboardingAcknowledgeResponseDto,
  OnboardingStatusDto,
  QrRedeemResponseDto,
  QrResolveResponseDto,
  QrTokenCreateRequestDto,
  QrTokenDto,
} from '../dto/checkinDto';

export const checkinApi = {
  /**
   * Fetches the onboarding briefing status for an event (V-31).
   * Authenticated endpoint. Canonical route: checkin/events/${eventId}/onboarding/
   */
  getOnboarding(
    eventId: number | string,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<OnboardingStatusDto>> {
    return client.get<OnboardingStatusDto>(`checkin/events/${eventId}/onboarding/`);
  },

  /**
   * Acknowledges the onboarding briefing for an event (V-32).
   * Authenticated endpoint. Canonical route: checkin/events/${eventId}/onboarding/acknowledge/
   */
  acknowledgeOnboarding(
    eventId: number | string,
    data: OnboardingAcknowledgeRequestDto = {},
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<OnboardingAcknowledgeResponseDto>> {
    return client.post<OnboardingAcknowledgeResponseDto>(
      `checkin/events/${eventId}/onboarding/acknowledge/`,
      data,
    );
  },

  /**
   * Previews / resolves a QR token without consuming it (V-33).
   * Public endpoint. Canonical route: checkin/qr/resolve/
   */
  resolveQrToken(
    token: string,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<QrResolveResponseDto>> {
    return client.post<QrResolveResponseDto>(
      'checkin/qr/resolve/',
      { token },
      { authRequired: false },
    );
  },

  /**
   * Redeems a QR token (walkin, checkin, join_event) (V-34).
   * Authenticated endpoint. Canonical route: checkin/qr/redeem/
   */
  redeemQrToken(
    token: string,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<QrRedeemResponseDto>> {
    return client.post<QrRedeemResponseDto>('checkin/qr/redeem/', { token });
  },

  /**
   * Performs check-in-only QR token redemption (V-35).
   * Authenticated endpoint. Canonical route: checkin/attendance/qr-checkin/
   */
  qrCheckIn(
    token: string,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<QrRedeemResponseDto>> {
    return client.post<QrRedeemResponseDto>('checkin/attendance/qr-checkin/', {
      token,
    });
  },

  /**
   * Creates a new QR token for an event (coordinator action, C-30).
   * Authenticated endpoint. Canonical route: checkin/coordinator/events/${eventId}/qr-tokens/
   */
  createCoordinatorQrToken(
    eventId: number | string,
    data: QrTokenCreateRequestDto,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<QrTokenDto>> {
    return client.post<QrTokenDto>(
      `checkin/coordinator/events/${eventId}/qr-tokens/`,
      data,
    );
  },

  /**
   * Revokes an existing coordinator QR token (coordinator action, C-31).
   * Authenticated endpoint. Canonical route: checkin/coordinator/qr-tokens/${qrId}/revoke/
   */
  revokeCoordinatorQrToken(
    qrId: number | string,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<{ id: number; revoked_at: string }>> {
    return client.post<{ id: number; revoked_at: string }>(
      `checkin/coordinator/qr-tokens/${qrId}/revoke/`,
      {},
    );
  },

  /**
   * Submits volunteer geo check-in telemetry for an event (V-36).
   * Authenticated endpoint. Canonical route: checkin/attendance/geo-checkin/
   */
  submitGeoCheckIn(
    data: GeoCheckinRequestDto,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<GeoCheckinResponseDto>> {
    return client.post<GeoCheckinResponseDto>('checkin/attendance/geo-checkin/', data);
  },

  /**
   * Checks out of an active attendance shift (V-37).
   * Authenticated endpoint. Canonical route: checkin/attendance/${attendanceId}/checkout/
   */
  checkoutAttendance(
    attendanceId: number | string,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<CheckoutResponseDto>> {
    return client.post<CheckoutResponseDto>(
      `checkin/attendance/${attendanceId}/checkout/`,
      {},
    );
  },

  /**
   * Performs manual on-site check-in (coordinator action, C-34).
   * Authenticated endpoint. Canonical route: checkin/attendance/manual-checkin/
   */
  manualCheckIn(
    data: ManualCheckinRequestDto,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<ManualCheckinResponseDto>> {
    return client.post<ManualCheckinResponseDto>(
      'checkin/attendance/manual-checkin/',
      data,
    );
  },

  /**
   * Submits event feedback (V-40).
   * Authenticated endpoint. Canonical route: checkin/events/${eventId}/feedback/
   */
  submitEventFeedback(
    eventId: number | string,
    data: FeedbackSubmitRequestDto,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<FeedbackSubmitResponseDto>> {
    return client.post<FeedbackSubmitResponseDto>(
      `checkin/events/${eventId}/feedback/`,
      data,
    );
  },

  /**
   * Fetches geo check-in attempts for review matching v_geo_attempts_review (C-35).
   * Authenticated endpoint. Canonical route: checkin/coordinator/events/${eventId}/geo-attempts/
   */
  getGeoAttempts(
    eventId: number | string,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<ResultsListDto<GeoAttemptReviewDto>>> {
    return client.get<ResultsListDto<GeoAttemptReviewDto>>(
      `checkin/coordinator/events/${eventId}/geo-attempts/`,
    );
  },

  /**
   * Fetches public/event feedback list (P1-12).
   * Authenticated endpoint. Canonical route: checkin/events/${eventId}/feedback/list/
   */
  getEventFeedbackList(
    eventId: number | string,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<ResultsListDto<EventFeedbackItemDto>>> {
    return client.get<ResultsListDto<EventFeedbackItemDto>>(
      `checkin/events/${eventId}/feedback/list/`,
    );
  },
};
