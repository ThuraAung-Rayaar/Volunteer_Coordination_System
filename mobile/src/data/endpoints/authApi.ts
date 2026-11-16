/**
 * @format
 */

import { ApiClient, defaultApiClient } from '../../core/api/apiClient';
import type { ApiResult } from '../../core/api/apiResult';
import type {
  OtpRequestDto,
  OtpRequestResponseDto,
  OtpVerifyDto,
  OtpVerifyResponseDto,
} from '../dto/authDto';

export interface LogoutResponseDto {
  status: string;
  message?: string;
}

export const authApi = {
  /**
   * Request OTP code via SMS/delivery service.
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
   * Verify OTP code and obtain authentication token.
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
   * Invalidate active authentication session on the server.
   * Authenticated endpoint.
   */
  logout(
    client: ApiClient = defaultApiClient,
  ): Promise<ApiResult<LogoutResponseDto>> {
    return client.post<LogoutResponseDto>('auth/logout/', {});
  },
};
