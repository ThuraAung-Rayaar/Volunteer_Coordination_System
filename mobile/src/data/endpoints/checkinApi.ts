/**
 * @format
 */

import { ApiClient, defaultApiClient } from '../../core/api/apiClient';
import type { ApiResult } from '../../core/api/apiResult';
import type {
  CheckoutResponseDto,
  FeedbackSubmitRequestDto,
  FeedbackSubmitResponseDto,
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
   * Fetches the onboarding briefing status for an event.
   * Authenticated endpoint.
   */
  getOnboarding(
    eventId: number | string,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<OnboardingStatusDto>> {
    return client.get<OnboardingStatusDto>(`events/${eventId}/onboarding/`);
  },

  /**
   * Acknowledges the onboarding briefing for an event.
   * Authenticated endpoint.
   */
  acknowledgeOnboarding(
    eventId: number | string,
    data: OnboardingAcknowledgeRequestDto = {},
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<OnboardingAcknowledgeResponseDto>> {
    return client.post<OnboardingAcknowledgeResponseDto>(
      `events/${eventId}/onboarding/acknowledge/`,
      data,
    );
  },

  /**
   * Previews / resolves a QR token without consuming it.
   * Public endpoint.
   */
  resolveQrToken(
    token: string,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<QrResolveResponseDto>> {
    return client.post<QrResolveResponseDto>(
      'qr/resolve/',
      { token },
      { authRequired: false },
    );
  },

  /**
   * Redeems a QR token (walkin, checkin, join_event).
   * Authenticated endpoint.
   */
  redeemQrToken(
    token: string,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<QrRedeemResponseDto>> {
    return client.post<QrRedeemResponseDto>('qr/redeem/', { token });
  },

  /**
   * Performs check-in-only QR token redemption.
   * Authenticated endpoint.
   */
  qrCheckIn(
    token: string,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<QrRedeemResponseDto>> {
    return client.post<QrRedeemResponseDto>('attendance/qr-checkin/', {
      token,
    });
  },

  /**
   * Creates a new QR token for an event (coordinator action).
   * Authenticated endpoint.
   */
  createCoordinatorQrToken(
    eventId: number | string,
    data: QrTokenCreateRequestDto,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<QrTokenDto>> {
    return client.post<QrTokenDto>(
      `coordinator/events/${eventId}/qr-tokens/`,
      data,
    );
  },

  /**
   * Revokes an existing coordinator QR token.
   * Authenticated endpoint.
   */
  revokeCoordinatorQrToken(
    qrId: number | string,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<{ id: number; revoked_at: string }>> {
    return client.post<{ id: number; revoked_at: string }>(
      `coordinator/qr-tokens/${qrId}/revoke/`,
      {},
    );
  },

  /**
   * Submits volunteer geo check-in telemetry for an event.
   * Note: Server returns HTTP 200 on success and HTTP 400 with response payload on rejection.
   * Authenticated endpoint.
   */
  submitGeoCheckIn(
    data: GeoCheckinRequestDto,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<GeoCheckinResponseDto>> {
    return client.post<GeoCheckinResponseDto>('attendance/geo-checkin/', data);
  },

  /**
   * Checks out of an active attendance shift.
   * Note: Always POST attendance/{attendance_id}/checkout/.
   * Authenticated endpoint.
   */
  checkoutAttendance(
    attendanceId: number | string,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<CheckoutResponseDto>> {
    return client.post<CheckoutResponseDto>(
      `attendance/${attendanceId}/checkout/`,
      {},
    );
  },

  /**
   * Performs manual on-site check-in (coordinator action).
   * Authenticated endpoint.
   */
  manualCheckIn(
    data: ManualCheckinRequestDto,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<ManualCheckinResponseDto>> {
    return client.post<ManualCheckinResponseDto>(
      'attendance/manual-checkin/',
      data,
    );
  },

  /**
   * Submits event feedback.
   * Authenticated endpoint.
   */
  submitEventFeedback(
    eventId: number | string,
    data: FeedbackSubmitRequestDto,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<FeedbackSubmitResponseDto>> {
    return client.post<FeedbackSubmitResponseDto>(
      `events/${eventId}/feedback/`,
      data,
    );
  },
};
