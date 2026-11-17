/**
 * @format
 */

import type { AppError } from './apiError';

export type ApiResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: AppError; status?: number };

/**
 * Constructs a successful ApiResult.
 */
export function apiSuccess<T>(data: T, status = 200): ApiResult<T> {
  return {
    ok: true,
    data,
    status,
  };
}

/**
 * Constructs a failed ApiResult.
 */
export function apiFailure<T = never>(error: AppError, status?: number): ApiResult<T> {
  return {
    ok: false,
    error,
    status,
  };
}
