/**
 * @format
 */

export type AppError =
  | { kind: 'network'; retryable: boolean; message: string }
  | { kind: 'timeout'; retryable: boolean; message: string }
  | { kind: 'unauthorized'; code?: string; message: string }
  | { kind: 'forbidden'; code: string; message: string }
  | { kind: 'notFound'; code: string; message: string }
  | {
      kind: 'validation';
      code: string;
      message: string;
      fields?: Record<string, string[]>;
      meta?: Record<string, unknown>;
    }
  | { kind: 'conflict'; code: string; message: string }
  | { kind: 'rateLimited'; code: string; message: string }
  | { kind: 'server'; code?: string; message: string }
  | { kind: 'unknown'; message: string };

interface StandardDomainErrorEnvelope {
  error: {
    code?: string;
    message?: string;
    detail?: string;
    [key: string]: unknown;
  };
}

interface GeoRejectionEnvelope {
  result?: string;
  distance_m?: number;
  message?: string;
  detail?: string;
  success?: boolean;
  [key: string]: unknown;
}

/**
 * Type guard for standard domain error envelope: {"error": {"code": "...", "message": "..."}}
 */
function isStandardDomainEnvelope(
  body: unknown,
): body is StandardDomainErrorEnvelope {
  return (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof (body as Record<string, unknown>).error === 'object' &&
    (body as Record<string, unknown>).error !== null
  );
}

/**
 * Type guard for Geo check-in rejection envelope: {"result": "...", "distance_m": ..., "success": false}
 */
function isGeoRejectionEnvelope(body: unknown): body is GeoRejectionEnvelope {
  if (typeof body !== 'object' || body === null) {
    return false;
  }
  const obj = body as Record<string, unknown>;
  return 'result' in obj && ('distance_m' in obj || obj.success === false);
}

/**
 * Parses DRF field validation errors into Record<string, string[]>:
 * e.g., { "phone": ["This field is required."], "notes": "Invalid text" }
 */
function extractDrfFieldErrors(
  bodyObj: Record<string, unknown>,
): Record<string, string[]> | undefined {
  const fields: Record<string, string[]> = {};
  const ignoredKeys = new Set([
    'error',
    'code',
    'detail',
    'message',
    'result',
    'success',
    'distance_m',
  ]);

  let foundFieldErrors = false;

  for (const [key, value] of Object.entries(bodyObj)) {
    if (ignoredKeys.has(key)) {
      continue;
    }
    if (Array.isArray(value)) {
      fields[key] = value.map(v => String(v));
      foundFieldErrors = true;
    } else if (typeof value === 'string') {
      fields[key] = [value];
      foundFieldErrors = true;
    }
  }

  return foundFieldErrors ? fields : undefined;
}

/**
 * Normalizes HTTP status codes and responses into strongly-typed AppError union.
 * Supports all 3 Django BFF error representations:
 * 1. Standard domain error: {"error": {"code": "...", "message": "..."}}
 * 2. Geo check-in rejection: {"result": "outside_geofence", "distance_m": 120, "success": false}
 * 3. DRF serializer field validation: {"field_name": ["error message"]}
 */
export function normalizeApiError(status: number, body: unknown): AppError {
  let code: string | undefined;
  let message: string | undefined;
  let fields: Record<string, string[]> | undefined;
  let meta: Record<string, unknown> | undefined;

  if (typeof body === 'object' && body !== null) {
    const obj = body as Record<string, unknown>;

    // Case 1: Standard Domain Error
    if (isStandardDomainEnvelope(body)) {
      code = body.error.code;
      message = body.error.message || body.error.detail;
    }
    // Case 2: Geo check-in rejection
    else if (isGeoRejectionEnvelope(body)) {
      code = body.result;
      message =
        body.message ||
        body.detail ||
        (body.result === 'outside_geofence'
          ? `Outside allowable check-in radius (${Math.round(body.distance_m ?? 0)}m away)`
          : body.result);
      meta = {
        distance_m: body.distance_m,
        success: body.success,
      };
    }
    // Case 3: DRF field errors or general object
    else {
      if (typeof obj.detail === 'string') {
        message = obj.detail;
      } else if (typeof obj.message === 'string') {
        message = obj.message;
      }
      if (typeof obj.code === 'string') {
        code = obj.code;
      }
      fields = extractDrfFieldErrors(obj);
      if (!message && fields) {
        const firstField = Object.keys(fields)[0];
        const firstError = fields[firstField]?.[0];
        message = firstError ? `${firstField}: ${firstError}` : 'Validation error';
      }
    }
  } else if (typeof body === 'string' && body.trim().length > 0) {
    message = body;
  }

  // Status-based mapping
  switch (status) {
    case 400:
    case 422:
      return {
        kind: 'validation',
        code: code || 'validation_error',
        message: message || 'Validation failed. Please check your input.',
        fields,
        meta,
      };

    case 401:
      return {
        kind: 'unauthorized',
        code: code || 'unauthorized',
        message: message || 'Authentication required or session expired.',
      };

    case 403:
      return {
        kind: 'forbidden',
        code: code || 'permission_denied',
        message: message || 'You do not have permission to perform this action.',
      };

    case 404:
      return {
        kind: 'notFound',
        code: code || 'not_found',
        message: message || 'The requested resource was not found.',
      };

    case 409:
      return {
        kind: 'conflict',
        code: code || 'conflict',
        message: message || 'The request conflicts with current server state.',
      };

    case 429:
      return {
        kind: 'rateLimited',
        code: code || 'throttled',
        message: message || 'Too many requests. Please slow down.',
      };

    case 500:
    case 502:
    case 503:
    case 504:
      return {
        kind: 'server',
        code: code || 'server_error',
        message: message || 'A server error occurred. Please try again later.',
      };

    default:
      if (status >= 400 && status < 500) {
        return {
          kind: 'validation',
          code: code || 'client_error',
          message: message || `Client error (${status})`,
          fields,
          meta,
        };
      }
      if (status >= 500) {
        return {
          kind: 'server',
          code: code || 'server_error',
          message: message || `Server error (${status})`,
        };
      }
      return {
        kind: 'unknown',
        message: message || `Unexpected response (${status})`,
      };
  }
}

/**
 * Creates a client-side network error.
 */
export function createNetworkError(
  message = 'Network connection failed.',
): Extract<AppError, { kind: 'network' }> {
  return {
    kind: 'network',
    retryable: true,
    message,
  };
}

/**
 * Creates a client-side timeout error.
 */
export function createTimeoutError(
  message = 'Request timed out.',
): Extract<AppError, { kind: 'timeout' }> {
  return {
    kind: 'timeout',
    retryable: true,
    message,
  };
}
