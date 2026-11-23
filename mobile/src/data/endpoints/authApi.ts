/**
 * @format
 */

import { ApiClient, defaultApiClient } from '../../core/api/apiClient';
import type { ApiResult } from '../../core/api/apiResult';
import type {
  BootstrapResponseDto,
  OtpRequestDto,
  OtpRequestResponseDto,
  OtpVerifyDto,
  OtpVerifyResponseDto,
  TokenizedOtpRequestDto,
  TokenizedOtpResponseDto,
  TokenizedOtpVerifyRequestDto,
  TokenizedOtpVerifyResponseDto,
} from '../dto/authDto';

export interface LogoutResponseDto {
  status: string;
  message?: string;
}

export const authApi = {
  /**
   * Request OTP code via legacy route.
   * Public endpoint (no auth required).
   */
  requestOtp(
    data: OtpRequestDto,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<OtpRequestResponseDto>> {
    return client.post<OtpRequestResponseDto>('auth/otp/request/', data, {
      authRequired: false,
    });
  },

  /**
   * Verify OTP code via legacy route.
   * Public endpoint (no auth required).
   */
  verifyOtp(
    data: OtpVerifyDto,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<OtpVerifyResponseDto>> {
    return client.post<OtpVerifyResponseDto>('auth/otp/verify/', data, {
      authRequired: false,
    });
  },

  /**
   * Request OTP challenge token via canonical tokenized route (AUTH-02, AUTH-03).
   * POST /api/v1/auth/tokenized/request-otp/
   * STRICT ARCHITECTURAL INVARIANT (Section 4.1):
   * Sends phone + purpose + request_id only (never identity_token or CIT).
   * Public endpoint (no auth required).
   */
  requestTokenizedOtp(
    data: TokenizedOtpRequestDto,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<TokenizedOtpResponseDto>> {
    const payload: Record<string, any> = {
      phone: data.phone,
      purpose: data.purpose ?? 'login',
    };
    if (data.request_id) {
      payload.request_id = data.request_id;
    }
    if (data.is_new_user !== undefined) {
      payload.is_new_user = data.is_new_user;
    }
    return client.post<TokenizedOtpResponseDto>(
      'auth/tokenized/request-otp/',
      payload,
      {
        authRequired: false,
      },
    );
  },

  /**
   * Verify session-bound OTP challenge via canonical tokenized route (AUTH-02).
   * POST /api/v1/auth/tokenized/verify-otp/
   * STRICT ARCHITECTURAL INVARIANT (Section 4.1): Does NOT send phone.
   * Sends auth_session_token, code, purpose, and optional display_name only.
   * Public endpoint (no auth required).
   */
  verifyTokenizedOtp(
    data: TokenizedOtpVerifyRequestDto,
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<TokenizedOtpVerifyResponseDto>> {
    const payload: Record<string, string> = {
      auth_session_token: data.auth_session_token,
      code: data.code,
    };
    if (data.purpose) {
      payload.purpose = data.purpose;
    }
    if (data.display_name !== undefined) {
      payload.display_name = data.display_name;
    }
    return client.post<TokenizedOtpVerifyResponseDto>(
      'auth/tokenized/verify-otp/',
      payload,
      {
        authRequired: false,
      },
    );
  },

  /**
   * Retrieve compact session bootstrap in a single round-trip (API-01, Section 8.7).
   * GET /api/v1/me/bootstrap/
   * Authenticated endpoint (requires active DRF Token).
   */
  getBootstrap(
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<BootstrapResponseDto>> {
    return client.get<BootstrapResponseDto>('me/bootstrap/', {
      authRequired: true,
    });
  },

  /**
   * Invalidate active authentication session on the server.
   * Authenticated endpoint.
   */
  logout(
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<LogoutResponseDto>> {
    return client.post<LogoutResponseDto>('auth/logout/', {});
  },
};
