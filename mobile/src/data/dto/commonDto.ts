/**
 * @format
 */

/**
 * Standard Django REST Framework paginated envelope.
 * Used by endpoints like `GET /api/v1/events/`.
 */
export interface PaginatedResponseDto<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/**
 * Flat list envelope used across composite screen and sub-resource endpoints.
 */
export interface ResultsListDto<T> {
  results: T[];
}

/**
 * Exact database enum vocabularies (v0.11.0 Parity Plan Section 3.4).
 */
export type AttendanceMethodDto =
  | 'qr_scan'
  | 'coordinator_manual'
  | 'geo'
  | 'system';

export type AttendanceStatusDto =
  | 'expected'
  | 'checked_in'
  | 'absent'
  | 'completed'
  | 'cancelled';

export type ConfirmationStatusDto =
  | 'not_required'
  | 'pending'
  | 'confirmed'
  | 'rejected';

export type LeaderStrategyDto = 'none' | 'first_experienced' | 'manual';

export type CompensationKindDto = 'unpaid' | 'arranged_outside_system';
