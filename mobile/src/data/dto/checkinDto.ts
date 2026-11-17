/**
 * @format
 */

/**
 * Onboarding status for an event matching `OnboardingStatusSerializer`.
 * Returned by `GET /api/v1/events/{id}/onboarding/`.
 */
export interface OnboardingStatusDto {
  event_id: number;
  onboarding_text: string | null;
  onboarding_version: number;
  require_onboarding_ack: boolean;
  acknowledged: boolean;
}

/**
 * Request payload for acknowledging onboarding matching `OnboardingAcknowledgeSerializer`.
 * Sent to `POST /api/v1/events/{id}/onboarding/acknowledge/`.
 */
export interface OnboardingAcknowledgeRequestDto {
  notes?: string;
}

/**
 * Response payload returned by `POST /api/v1/events/{id}/onboarding/acknowledge/`.
 */
export interface OnboardingAcknowledgeResponseDto {
  event_id: number;
  onboarding_version: number;
  acknowledged: boolean;
}

/**
 * Request payload for creating a coordinator QR token matching `QrTokenCreateSerializer`.
 * Sent to `POST /api/v1/coordinator/events/{id}/qr-tokens/`.
 */
export interface QrTokenCreateRequestDto {
  purpose: 'walkin_registration' | 'checkin' | 'join_event';
  max_uses?: number | null;
  ttl_minutes?: number;
}

/**
 * QR token response matching `QrTokenSerializer`.
 * Returned by `POST /api/v1/coordinator/events/{id}/qr-tokens/`.
 */
export interface QrTokenDto {
  id: number;
  raw_token: string;
  purpose: string;
  max_uses: number | null;
  expires_at: string;
}

/**
 * Request payload for resolving / previewing a QR token matching `QrResolveSerializer`.
 * Sent to `POST /api/v1/qr/resolve/`.
 */
export interface QrResolveRequestDto {
  token: string;
}

/**
 * Response payload returned by `POST /api/v1/qr/resolve/`.
 */
export interface QrResolveResponseDto {
  event_id: number;
  purpose: string;
  is_valid: boolean;
  reason: string | null;
}

/**
 * Request payload for redeeming a QR token matching `QrRedeemSerializer`.
 * Sent to `POST /api/v1/qr/redeem/` or `POST /api/v1/attendance/qr-checkin/`.
 */
export interface QrRedeemRequestDto {
  token: string;
}

/**
 * Response payload returned by `POST /api/v1/qr/redeem/` and `POST /api/v1/attendance/qr-checkin/`.
 */
export interface QrRedeemResponseDto {
  result: string;
  purpose?: string;
  event_id?: number;
  attendance_id?: number;
  application_id?: number;
}

/**
 * Request payload for volunteer geo check-in matching `GeoCheckinSerializer`.
 * Sent to `POST /api/v1/attendance/geo-checkin/`.
 */
export interface GeoCheckinRequestDto {
  event_id?: number;
  latitude: number;
  longitude: number;
  accuracy_m?: number | null;
  captured_at?: string | null;
  is_mocked?: boolean;
}

/**
 * Authoritative response returned by `POST /api/v1/attendance/geo-checkin/`.
 * Note: HTTP 200 when success is true; HTTP 400 when success is false.
 */
export interface GeoCheckinResponseDto {
  result: string;
  attendance_id?: number | null;
  distance_m?: number | null;
  confirmation_status?: string | null;
  message: string;
  success: boolean;
}

/**
 * Request payload for manual coordinator check-in matching `ManualCheckinSerializer`.
 * Sent to `POST /api/v1/attendance/manual-checkin/`.
 */
export interface ManualCheckinRequestDto {
  event_id?: number;
  user_id: number;
  note?: string;
}

/**
 * Response payload returned by `POST /api/v1/attendance/manual-checkin/`.
 */
export interface ManualCheckinResponseDto {
  id: number;
  status: string;
  method: string;
}

/**
 * Response payload returned by `POST /api/v1/attendance/{attendance_id}/checkout/`.
 */
export interface CheckoutResponseDto {
  id: number;
  status: string;
  checkout_at: string;
}

/**
 * Request payload for submitting feedback matching `FeedbackSubmitSerializer`.
 * Sent to `POST /api/v1/events/{id}/feedback/`.
 */
export interface FeedbackSubmitRequestDto {
  direction:
    | 'coordinator_to_volunteer'
    | 'volunteer_to_event'
    | 'volunteer_to_coordinator';
  score: number;
  tags?: string[];
  comment?: string;
  target_user_id?: number | null;
}

/**
 * Response payload returned by `POST /api/v1/events/{id}/feedback/`.
 */
export interface FeedbackSubmitResponseDto {
  id: number;
  status: string;
}
