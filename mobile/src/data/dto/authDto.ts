/**
 * @format
 */

/**
 * Request payload for legacy `POST /api/v1/auth/otp/request/`.
 */
export interface OtpRequestDto {
  phone: string;
  purpose?: 'login' | 'qr_registration';
}

/**
 * Details of OTP delivery channel and status (P0-09).
 */
export interface OtpDeliveryDto {
  delivered: boolean;
  channel: string;
  method?: string;
  provider_configured?: boolean;
}

/**
 * Success response for legacy `POST /api/v1/auth/otp/request/`.
 */
export interface OtpRequestResponseDto {
  status: string;
  delivery?: OtpDeliveryDto;
  dev_code?: string;
}

/**
 * Request payload for legacy `POST /api/v1/auth/otp/verify/`.
 */
export interface OtpVerifyDto {
  phone: string;
  code: string;
  purpose?: 'login' | 'qr_registration';
  display_name?: string;
}

/**
 * User object nested inside OtpVerifyResponseDto and TokenizedOtpVerifyResponseDto.
 */
export interface AuthUserDto {
  id: number;
  uuid: string | null;
  display_name: string;
  verification_status: string;
}

/**
 * Success response for legacy `POST /api/v1/auth/otp/verify/`.
 */
export interface OtpVerifyResponseDto {
  token: string;
  user: AuthUserDto;
}

// =========================================================================
// Phase 6 Tokenized Challenge Handshake DTOs (AUTH-02, AUTH-03)
// =========================================================================

/**
 * Truthful delivery metadata returned in TokenizedOtpResponseDto.
 */
export interface TokenizedOtpDeliveryDto {
  provider: string;
  channel: string;
  delivered: boolean;
  configured: boolean;
}

/**
 * Request payload for `POST /api/v1/auth/tokenized/request-otp/`.
 * Accepts phone (over TLS) or identity_token (CIT envelope), with optional request_id.
 */
export interface TokenizedOtpRequestDto {
  phone?: string;
  identity_token?: string;
  purpose?: 'login' | 'qr_registration';
  request_id?: string;
}

/**
 * Success response for `POST /api/v1/auth/tokenized/request-otp/`.
 * Returns ephemeral auth_session_token, expiry, code length, and delivery metadata.
 */
export interface TokenizedOtpResponseDto {
  status: string;
  auth_session_token: string;
  expires_in: number;
  code_length: number;
  delivery: TokenizedOtpDeliveryDto;
  dev_code?: string | null;
}

/**
 * Request payload for `POST /api/v1/auth/tokenized/verify-otp/`.
 * STRICT ARCHITECTURAL INVARIANT:
 * MUST NOT accept or contain a `phone` property. Verification is bound
 * to the session-bound challenge token and code only.
 */
export interface TokenizedOtpVerifyRequestDto {
  auth_session_token: string;
  code: string;
  display_name?: string;
}

/**
 * User object returned in TokenizedOtpVerifyResponseDto.
 */
export interface TokenizedAuthUserDto {
  id: number;
  uuid: string | null;
  display_name: string;
  verification_status: string;
}

/**
 * Success response for `POST /api/v1/auth/tokenized/verify-otp/`.
 * Returns the DRF token and initial user identity.
 */
export interface TokenizedOtpVerifyResponseDto {
  token: string;
  user: TokenizedAuthUserDto;
}

// =========================================================================
// Phase 6 Compact Startup Bootstrap DTOs (API-01, Section 8.7)
// =========================================================================

/**
 * Identity payload returned by `GET /api/v1/me/bootstrap/`.
 * P1-01 / MAP-01: email is explicitly null or string; never phone fallback.
 */
export interface BootstrapUserDto {
  id: number;
  uuid: string | null;
  display_name: string;
  phone: string | null;
  email: string | null;
  account_status: string;
  verification_status: string;
}

/**
 * Coordinator routing and permission payload in `GET /api/v1/me/bootstrap/`.
 */
export interface BootstrapCoordinatorDto {
  status: string; // 'none' | 'pending' | 'approved' | 'suspended' | 'revoked'
  can_access_workspace: boolean;
}

/**
 * Server-derived capabilities in `GET /api/v1/me/bootstrap/`.
 */
export interface BootstrapCapabilitiesDto {
  volunteer: boolean;
  coordinator: boolean;
}

/**
 * Response payload for `GET /api/v1/me/bootstrap/`.
 * Replaces parallel getProfile + getCoordinatorProfile startup roundtrips.
 */
export interface BootstrapResponseDto {
  user: BootstrapUserDto;
  coordinator: BootstrapCoordinatorDto;
  capabilities: BootstrapCapabilitiesDto;
}
