/**
 * @format
 */

/**
 * Request payload for `POST /api/v1/auth/otp/request/`.
 */
export interface OtpRequestDto {
  phone: string;
  purpose?: 'login' | 'qr_registration';
}

/**
 * Success response for `POST /api/v1/auth/otp/request/`.
 */
export interface OtpRequestResponseDto {
  status: string;
  delivery?: Record<string, unknown>;
  dev_code?: string;
}

/**
 * Request payload for `POST /api/v1/auth/otp/verify/`.
 */
export interface OtpVerifyDto {
  phone: string;
  code: string;
  purpose?: 'login' | 'qr_registration';
  display_name?: string;
}

/**
 * User object nested inside OtpVerifyResponseDto.
 */
export interface AuthUserDto {
  id: number;
  uuid: string | null;
  display_name: string;
  verification_status: string;
}

/**
 * Success response for `POST /api/v1/auth/otp/verify/`.
 */
export interface OtpVerifyResponseDto {
  token: string;
  user: AuthUserDto;
}
